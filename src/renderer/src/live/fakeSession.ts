import type { LiveEvents, LiveLike } from "./session";

export interface FakeStats {
  connects: number;
  freshSessions: number;
  resumedSessions: number;
  audioChunks: number;
  /** microphone chunks that arrived while no push-to-talk activity was open (must stay 0) */
  chunksOutsideActivity: number;
  activityStarts: number;
  activityEnds: number;
  /** activityStart while another activity was still open (must stay 0) */
  badNesting: number;
  interrupts: number;
}

declare global {
  interface Window {
    __KOMENSKY_FAKE?: { stats: FakeStats; drop: () => void; rejectHandle: boolean; silentDrop: boolean };
  }
}

const SILENCE = btoa(String.fromCharCode(...new Uint8Array(9600))); // 0.2 s of 24 kHz PCM16 silence

const hooks = () =>
  (window.__KOMENSKY_FAKE ??= {
    stats: { connects: 0, freshSessions: 0, resumedSessions: 0, audioChunks: 0, chunksOutsideActivity: 0, activityStarts: 0, activityEnds: 0, badNesting: 0, interrupts: 0 },
    drop: () => undefined,
    rejectHandle: false,
    silentDrop: false,
  });

let handleCounter = 0;

/** Scripted stand-in for the teacher (automated tests only; reachable only via the test token issued by the main process in an unpackaged KOMENSKY_TEST run). */
export class FakeLiveSession implements LiveLike {
  openedAt = Date.now();
  early?: { code?: number; reason?: string; error?: string };
  private closedFlag = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private activity = false;
  private chunksInActivity = 0;
  private pendingQid: string | null = null;
  private speaking = false;
  private muted = false; // "silent drop": the socket looks open but nothing comes back

  private constructor(private ev: LiveEvents) {}

  static async connect(ev: LiveEvents, handle?: string): Promise<LiveLike> {
    const h = hooks();
    const s = new FakeLiveSession(ev);
    h.stats.connects++;
    if (handle && h.rejectHandle) {
      h.rejectHandle = false;
      s.closedFlag = true;
      s.early = { code: 1007, reason: "invalid resumption handle" };
      return s;
    }
    if (handle) h.stats.resumedSessions++;
    else h.stats.freshSessions++;
    h.drop = () => {
      if (s.closedFlag) return;
      if (h.silentDrop) {
        h.silentDrop = false;
        s.muted = true; // no close event, no more answers: only the watchdog can notice
        return;
      }
      s.closedFlag = true;
      s.timers.forEach(clearTimeout);
      ev.onClose({ code: 1006, reason: "test drop" });
    };
    s.later(30, () => {
      ev.onMessage();
      ev.onSetup();
      ev.onResumptionHandle(`handle-${++handleCounter}`);
    });
    return s;
  }

  get isClosed() {
    return this.closedFlag;
  }
  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.closedFlag && !this.muted) fn();
    }, ms);
    this.timers.add(t);
  }
  private say(text: string) {
    this.ev.onMessage();
    this.ev.onOutputTranscript(text);
    this.ev.onAudio(SILENCE);
    this.speaking = true;
    this.later(2500, () => (this.speaking = false));
  }
  private tool(name: string, args: Record<string, unknown>, id?: string) {
    this.ev.onMessage();
    this.ev.onToolCalls([{ id, name, args }]);
  }

  sendControl(text: string) {
    const id = /\[id: ([^\]]+)\]/.exec(text)?.[1];
    if (id && text.includes("Polož TUTO")) {
      this.pendingQid = id;
      this.later(150, () => this.say(`Otázka ${id}`));
    } else if (text.includes("STAV: EXPLAIN")) {
      this.later(100, () => this.say("Dlouhý výklad…"));
      for (const ms of [800, 2000, 3500]) this.later(ms, () => this.tool("part_explained", {}));
    } else if (text.includes("STAV: FEEDBACK") || text.includes("STAV: REVIEW") || text.includes("STAV: WARMUP")) {
      this.later(400, () => this.tool("request_next_step", {}));
    } else if (text.includes("STAV: SUMMARY")) {
      this.later(300, () => this.say("Skvělá práce!"));
      this.later(500, () => this.tool("lesson_complete", { score: 1 }));
    }
    this.later(200, () => {
      this.ev.onMessage();
      this.ev.onTurnComplete();
    });
  }

  sendAudio() {
    const st = hooks().stats;
    st.audioChunks++;
    if (!this.activity) st.chunksOutsideActivity++;
    else this.chunksInActivity++;
  }

  sendActivityStart() {
    const st = hooks().stats;
    if (this.activity) st.badNesting++;
    this.activity = true;
    this.chunksInActivity = 0;
    st.activityStarts++;
    if (this.speaking) {
      // START_OF_ACTIVITY_INTERRUPTS: the tutor stops talking
      st.interrupts++;
      this.speaking = false;
      this.ev.onMessage();
      this.ev.onInterrupted();
    }
  }

  sendActivityEnd() {
    const st = hooks().stats;
    st.activityEnds++;
    this.activity = false;
    const qid = this.pendingQid;
    if (qid && this.chunksInActivity > 0) {
      this.pendingQid = null;
      this.later(200, () => {
        this.ev.onMessage();
        this.ev.onInputTranscript("moje odpověď");
        this.tool("record_answer", { question_id: qid, answer_transcript: "moje odpověď", is_correct: (window as unknown as { __KOMENSKY_FAKE_CORRECT?: boolean }).__KOMENSKY_FAKE_CORRECT !== false, feedback: "Hezky." }, `c-${qid}`);
        this.say("Správně.");
      });
    } else if (this.chunksInActivity > 0) {
      this.later(200, () => this.say("Rozumím."));
    }
  }

  sendToolResponse() {
    /* acknowledged silently */
  }
  close() {
    this.closedFlag = true;
    this.timers.forEach(clearTimeout);
  }
}
