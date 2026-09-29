import type { LiveTokenInfo } from "@shared/ipc";
import { connectLive, type LiveEvents, type LiveLike, type ToolCall } from "./session";

export type ConnState = "idle" | "connecting" | "open" | "reconnecting" | "offline" | "failed" | "closed";

export interface ConnCallbacks extends Omit<LiveEvents, "onClose" | "onSetup" | "onResumptionHandle" | "onGoAway"> {
  onState(s: ConnState, message?: string): void;
  /** setup finished on a NEW model context (first connection, or resumption impossible): the engine must (re-)send the current instruction */
  onFreshSession(): void;
  /** setup finished and the previous model context was resumed */
  onResumed(): void;
  onToolCalls(calls: ToolCall[]): void;
}

/** Keeps ONE live session alive for a whole lesson: resumption handle, GoAway hand-over, backoff reconnect, offline handling. */
export class LiveConnection {
  private session: LiveLike | null = null;
  private handle: string | undefined;
  private wantOpen = false;
  private retries = 0;
  private reconnecting = false;
  private state: ConnState = "idle";
  private goAwayTimer?: ReturnType<typeof setTimeout>;
  private queue: string[] = [];
  private onlineHandler = () => {
    if (this.wantOpen && this.state === "offline") void this.reconnect("online");
  };

  constructor(
    private mint: (summary?: string) => Promise<{ ok: true; info: LiveTokenInfo } | { ok: false; error: string }>,
    private cb: ConnCallbacks,
    private summary: () => string,
  ) {
    window.addEventListener("online", this.onlineHandler);
  }

  private set(s: ConnState, msg?: string) {
    this.state = s;
    this.cb.onState(s, msg);
  }
  get isOpen() {
    return this.state === "open" && !!this.session && !this.session.isClosed;
  }

  async open() {
    this.wantOpen = true;
    this.set("connecting");
    await this.establish(undefined, true);
  }

  private async establish(handle: string | undefined, first: boolean): Promise<void> {
    if (!navigator.onLine) {
      this.set("offline", "Jste offline. Jakmile se připojení vrátí, lekce naváže.");
      return;
    }
    const t = await this.mint(this.summary());
    if (!t.ok) {
      if (first) {
        this.set("failed", t.error);
        return;
      }
      return this.scheduleRetry(t.error);
    }
    try {
      let sess: LiveLike | null = null;
      const events: LiveEvents = {
        ...this.cb,
        onSetup: () => {
          this.retries = 0;
          this.set("open");
          const queued = this.queue.splice(0);
          if (!handle) this.cb.onFreshSession();
          else {
            for (const q of queued.slice(-3)) this.session?.sendControl(q);
            this.cb.onResumed();
          }
        },
        onResumptionHandle: (h) => (this.handle = h),
        onGoAway: (ms) => this.onGoAway(ms),
        onClose: (info) => sess && this.onClosed(info, sess),
      };
      const s = await connectLive(t.info, handle, events);
      sess = s;
      const old = this.session;
      this.session = s;
      old?.close();
      if (s.early) return this.onClosed(s.early, s);
    } catch (e) {
      const msg = (e as Error).message || "spojení se nezdařilo";
      if (handle) {
        // stale/invalid handle: start a new session instead
        this.handle = undefined;
        return this.establish(undefined, first);
      }
      if (first) this.set("failed", `Nepodařilo se navázat živé spojení: ${msg}`);
      else this.scheduleRetry(msg);
    }
  }

  private onGoAway(ms: number) {
    // the server will end the session soon: hand over to a fresh connection (resumed) while the model is not mid-word
    clearTimeout(this.goAwayTimer);
    this.goAwayTimer = setTimeout(() => void this.reconnect("goaway"), Math.min(2000, Math.max(0, ms / 3)));
  }

  private onClosed(info: { code?: number; reason?: string; error?: string }, s: LiveLike) {
    if (s !== this.session) return; // an old session closing after hand-over
    if (!this.wantOpen) return;
    console.warn("live closed", info);
    // closed very shortly after opening with a handle -> the handle is probably rejected
    if (Date.now() - s.openedAt < 3000 && this.handle) this.handle = undefined;
    void this.reconnect("closed");
  }

  private scheduleRetry(reason: string) {
    this.retries++;
    if (this.retries > 6) return this.set("failed", `Spojení se nepodařilo obnovit (${reason}).`);
    const wait = Math.min(1000 * 2 ** (this.retries - 1), 15000);
    this.set("reconnecting", `Obnovuji spojení… (${this.retries}/6)`);
    setTimeout(() => {
      if (this.wantOpen) void this.reconnect("retry");
    }, wait);
  }

  private async reconnect(why: string) {
    if (this.reconnecting || !this.wantOpen) return;
    this.reconnecting = true;
    try {
      if (!navigator.onLine) return this.set("offline", "Jste offline. Jakmile se připojení vrátí, lekce naváže.");
      if (why !== "goaway") this.set("reconnecting", "Obnovuji spojení…");
      await this.establish(this.handle, false);
    } finally {
      this.reconnecting = false;
    }
  }

  sendControl(t: string) {
    if (this.isOpen) this.session!.sendControl(t);
    else this.queue.push(t); // delivered after the connection is back (dropped if the model context had to be rebuilt)
  }
  sendAudio(b64: string) {
    if (this.isOpen) this.session!.sendAudio(b64);
  }
  sendToolResponse(id: string | undefined, name: string, response: Record<string, unknown>) {
    if (this.isOpen) this.session!.sendToolResponse(id, name, response);
  }

  close() {
    this.wantOpen = false;
    clearTimeout(this.goAwayTimer);
    window.removeEventListener("online", this.onlineHandler);
    this.session?.close();
    this.session = null;
    this.set("closed");
  }
}
