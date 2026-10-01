import { GoogleGenAI, type LiveConnectConfig, type LiveServerMessage, type Session } from "@google/genai";
import type { LiveTokenInfo } from "@shared/ipc";

export interface UsageInfo {
  prompt: number;
  response: number;
  total: number;
  promptAudio: number;
  responseAudio: number;
}

export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LiveEvents {
  /** any message arrived from the server (used by the connection watchdog) */
  onMessage(): void;
  onSetup(): void;
  onAudio(b64: string): void;
  onInputTranscript(text: string): void;
  onOutputTranscript(text: string): void;
  onTurnComplete(): void;
  onInterrupted(): void;
  onToolCalls(calls: ToolCall[]): void;
  onGoAway(timeLeftMs: number): void;
  onResumptionHandle(handle: string): void;
  onUsage(u: UsageInfo): void;
  onClose(info: { code?: number; reason?: string; error?: string }): void;
}

export interface LiveLike {
  readonly openedAt: number;
  early?: { code?: number; reason?: string; error?: string };
  readonly isClosed: boolean;
  sendControl(text: string): void;
  sendAudio(b64: string): void;
  sendActivityStart(): void;
  sendActivityEnd(): void;
  sendToolResponse(id: string | undefined, name: string, response: Record<string, unknown>): void;
  close(): void;
}

/** Thin wrapper around a Live API WebSocket session opened with an ephemeral token (never the real API key). */
export class LiveSession implements LiveLike {
  private constructor(
    private session: Session,
    readonly openedAt: number,
  ) {}
  closed = false;
  early?: { code?: number; reason?: string; error?: string };

  static async connect(info: LiveTokenInfo, handle: string | undefined, ev: LiveEvents): Promise<LiveSession> {
    // ephemeral tokens are only supported on the v1alpha API version
    const ai = new GoogleGenAI({ apiKey: info.token, httpOptions: { apiVersion: "v1alpha" } });
    const config = {
      ...info.config,
      sessionResumption: handle ? { handle } : {},
      // Live billing re-processes the whole session context on every turn, so keep it small: the app re-sends every step's
      // instructions and the system instruction is never trimmed, therefore older turns can safely be dropped early.
      contextWindowCompression: { triggerTokens: "24000", slidingWindow: { targetTokens: "12000" } },
    } as LiveConnectConfig;
    let self: LiveSession | null = null;
    const pendingClose: { code?: number; reason?: string; error?: string }[] = [];
    const session = await ai.live.connect({
      model: info.model,
      config,
      callbacks: {
        onopen: () => undefined,
        onmessage: (m: LiveServerMessage) => handle_(m, ev),
        onerror: (e: ErrorEvent) => {
          const info = { error: e.message || "chyba spojení" };
          if (self) self.fireClose(ev, info);
          else pendingClose.push(info);
        },
        onclose: (e: CloseEvent) => {
          const info = { code: e.code, reason: e.reason };
          if (self) self.fireClose(ev, info);
          else pendingClose.push(info);
        },
      },
    });
    self = new LiveSession(session, Date.now());
    if (pendingClose.length) {
      // closed while the connect promise was still resolving: let the caller decide (never fire callbacks before it holds the session)
      self.closed = true;
      self.early = pendingClose[0];
    }
    return self;
  }

  private fireClose(ev: LiveEvents, info: { code?: number; reason?: string; error?: string }) {
    if (this.closed) return;
    this.closed = true;
    ev.onClose(info);
  }

  sendControl(text: string) {
    if (this.closed) return;
    this.session.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });
  }
  sendAudio(b64: string) {
    if (this.closed) return;
    this.session.sendRealtimeInput({ audio: { data: b64, mimeType: "audio/pcm;rate=16000" } });
  }
  /** Push-to-talk: the child pressed the button. Only valid because automatic activity detection is disabled in the setup. */
  sendActivityStart() {
    if (this.closed) return;
    this.session.sendRealtimeInput({ activityStart: {} });
  }
  /** Push-to-talk: the child released the button – the model may now answer. */
  sendActivityEnd() {
    if (this.closed) return;
    this.session.sendRealtimeInput({ activityEnd: {} });
  }
  sendToolResponse(id: string | undefined, name: string, response: Record<string, unknown>) {
    if (this.closed) return;
    // SILENT: acknowledge without making the model speak
    this.session.sendToolResponse({ functionResponses: [{ id, name, response, scheduling: "SILENT" as never }] });
  }
  close() {
    this.closed = true;
    try {
      this.session.close();
    } catch {
      /* ignore */
    }
  }
  get isClosed() {
    return this.closed;
  }
}

function handle_(m: LiveServerMessage, ev: LiveEvents) {
  ev.onMessage();
  if (m.setupComplete) ev.onSetup();
  const c = m.serverContent;
  if (c) {
    for (const part of c.modelTurn?.parts ?? []) {
      const d = part.inlineData?.data;
      if (d && (part.inlineData?.mimeType ?? "").startsWith("audio/")) ev.onAudio(d);
    }
    if (c.inputTranscription?.text) ev.onInputTranscript(c.inputTranscription.text);
    if (c.outputTranscription?.text) ev.onOutputTranscript(c.outputTranscription.text);
    if (c.interrupted) ev.onInterrupted();
    if (c.turnComplete) ev.onTurnComplete();
  }
  if (m.toolCall?.functionCalls?.length) {
    ev.onToolCalls(m.toolCall.functionCalls.map((f) => ({ id: f.id, name: f.name ?? "", args: (f.args ?? {}) as Record<string, unknown> })));
  }
  if (m.goAway) {
    const s = /([\d.]+)s/.exec(String(m.goAway.timeLeft ?? ""));
    ev.onGoAway(s ? Number(s[1]) * 1000 : 30_000);
  }
  const u = m.usageMetadata;
  if (u) {
    const audio = (d?: { modality?: string; tokenCount?: number }[]) => (d ?? []).filter((x) => String(x.modality).toUpperCase() === "AUDIO").reduce((n, x) => n + (x.tokenCount ?? 0), 0);
    ev.onUsage({ prompt: u.promptTokenCount ?? 0, response: u.responseTokenCount ?? 0, total: u.totalTokenCount ?? 0, promptAudio: audio(u.promptTokensDetails), responseAudio: audio(u.responseTokensDetails) });
  }
  const r = m.sessionResumptionUpdate;
  if (r?.resumable && r.newHandle) ev.onResumptionHandle(r.newHandle);
}

/** Opens a real session – or the scripted fake used by automated tests (the token "test-token" is only ever issued by the main process in an unpackaged KOMENSKY_TEST run). */
export async function connectLive(info: LiveTokenInfo, handle: string | undefined, ev: LiveEvents): Promise<LiveLike> {
  if (info.token === "test-token") {
    const { FakeLiveSession } = await import("./fakeSession");
    return FakeLiveSession.connect(ev, handle);
  }
  return LiveSession.connect(info, handle, ev);
}
