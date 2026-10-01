import type { LiveTokenInfo } from "@shared/ipc";
import { connectLive, type LiveEvents, type LiveLike, type ToolCall } from "./session";

export const WATCHDOG_MS = 25_000;

export type ConnState = "idle" | "connecting" | "open" | "reconnecting" | "offline" | "failed" | "closed";

export interface ConnCallbacks extends Omit<LiveEvents, "onClose" | "onSetup" | "onResumptionHandle" | "onGoAway" | "onMessage"> {
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
  private reconnectAgain = false; // a close arrived while a reconnect was already running: run once more afterwards
  private state: ConnState = "idle";
  private goAwayTimer?: ReturnType<typeof setTimeout>;
  private queue: string[] = [];
  private lastMessageAt = Date.now();
  private awaitingSince = 0; // we sent something that must be answered (control message / end of an answer)
  private watchdog?: ReturnType<typeof setInterval>;
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
    // A silently dead connection (cable pulled, Wi-Fi gone) never fires "close". If we asked the teacher for something
    // and NOTHING came back for WATCHDOG_MS, assume the socket is dead and reconnect.
    this.watchdog = setInterval(() => {
      if (this.state === "open" && this.awaitingSince && Date.now() - this.awaitingSince > WATCHDOG_MS) {
        console.warn("live watchdog: no answer, reconnecting");
        this.awaitingSince = 0;
        const s = this.session;
        this.session = null;
        s?.close();
        void this.reconnect("watchdog");
      }
    }, 3000);
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
      let gotSetup = false;
      const events: LiveEvents = {
        ...this.cb,
        onMessage: () => {
          this.lastMessageAt = Date.now();
          this.awaitingSince = 0;
        },
        onSetup: () => {
          gotSetup = true;
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
        // a session that was opened WITH a handle and closed before its setup finished: the handle was probably rejected
        onClose: (info) => sess && this.onClosed(info, sess, !!handle && !gotSetup),
      };
      const s = await connectLive(t.info, handle, events);
      sess = s;
      if (s.early) {
        // closed while connecting (e.g. the server rejects the resumption handle): decide here, we are still inside a reconnect.
        // The previous session (if any, e.g. during a goAway hand-over) is left untouched.
        console.warn("live closed during connect", s.early);
        if (handle) {
          this.handle = undefined;
          return this.establish(undefined, first);
        }
        if (first) return this.set("failed", `Nepodařilo se navázat živé spojení (${s.early.reason || s.early.error || s.early.code}).`);
        return this.scheduleRetry(s.early.reason || s.early.error || "spojení bylo ukončeno");
      }
      const old = this.session;
      this.session = s;
      old?.close();
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

  private onClosed(info: { code?: number; reason?: string; error?: string }, s: LiveLike, handleRejected = false) {
    if (s !== this.session) return; // an old session closing after hand-over
    if (!this.wantOpen) return;
    console.warn("live closed", info);
    if (handleRejected) this.handle = undefined;
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
    if (!this.wantOpen) return;
    if (this.reconnecting) {
      this.reconnectAgain = true;
      return;
    }
    this.reconnecting = true;
    try {
      if (!navigator.onLine) return this.set("offline", "Jste offline. Jakmile se připojení vrátí, lekce naváže.");
      if (why !== "goaway") this.set("reconnecting", "Obnovuji spojení…");
      await this.establish(this.handle, false);
    } finally {
      this.reconnecting = false;
      if (this.reconnectAgain && this.wantOpen && !this.isOpen) {
        this.reconnectAgain = false;
        void this.reconnect("again");
      } else this.reconnectAgain = false;
    }
  }

  sendControl(t: string) {
    if (this.isOpen) {
      this.session!.sendControl(t);
      if (!this.awaitingSince) this.awaitingSince = Date.now();
    } else this.queue.push(t); // delivered after the connection is back (dropped if the model context had to be rebuilt)
  }
  sendAudio(b64: string) {
    if (this.isOpen) this.session!.sendAudio(b64);
  }
  /** Manual "try again" after the automatic attempts gave up (or the very first connection failed). */
  async retry() {
    if (!this.wantOpen) return;
    this.retries = 0;
    this.reconnectAgain = false;
    await this.reconnect("manual");
  }

  /** Push-to-talk. Returns false when the connection is not usable (the UI then tells the child to wait). */
  activityStart(): boolean {
    if (!this.isOpen) return false;
    this.session!.sendActivityStart();
    return true;
  }
  activityEnd(): boolean {
    if (!this.isOpen) return false;
    this.session!.sendActivityEnd();
    if (!this.awaitingSince) this.awaitingSince = Date.now();
    return true;
  }
  sendToolResponse(id: string | undefined, name: string, response: Record<string, unknown>) {
    if (this.isOpen) this.session!.sendToolResponse(id, name, response);
  }

  close() {
    this.wantOpen = false;
    clearTimeout(this.goAwayTimer);
    clearInterval(this.watchdog);
    window.removeEventListener("online", this.onlineHandler);
    this.session?.close();
    this.session = null;
    this.set("closed");
  }
}
