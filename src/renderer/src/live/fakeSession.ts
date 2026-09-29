import type { LiveEvents, LiveLike } from "./session";

declare global {
  interface Window {
    __KOMENSKY_FAKE_CORRECT?: boolean;
  }
}

const SILENCE = btoa(String.fromCharCode(...new Uint8Array(9600))); // 0.2 s of 24 kHz PCM16 silence

/** Scripted stand-in for the teacher: answers every [LESSON CONTROL] the way the real model is instructed to (tests only). */
export class FakeLiveSession implements LiveLike {
  openedAt = Date.now();
  early?: { code?: number; reason?: string; error?: string };
  private closedFlag = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private constructor(private ev: LiveEvents) {}

  static async connect(ev: LiveEvents): Promise<LiveLike> {
    const s = new FakeLiveSession(ev);
    s.later(30, () => ev.onSetup());
    return s;
  }

  get isClosed() {
    return this.closedFlag;
  }
  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.closedFlag) fn();
    }, ms);
    this.timers.add(t);
  }
  private say(text: string) {
    this.ev.onOutputTranscript(text);
    this.ev.onAudio(SILENCE);
  }

  sendControl(text: string) {
    const id = /\[id: ([^\]]+)\]/.exec(text)?.[1];
    if (id && text.includes("Polož TUTO")) {
      this.later(150, () => this.say(`Otázka ${id}`));
      this.later(500, () => {
        this.ev.onInputTranscript("moje odpověď");
        this.ev.onToolCalls([{ id: `c-${id}`, name: "record_answer", args: { question_id: id, answer_transcript: "moje odpověď", is_correct: window.__KOMENSKY_FAKE_CORRECT !== false, feedback: "Hezky." } }]);
      });
    } else if (text.includes("STAV: EXPLAIN")) {
      this.later(100, () => this.say("Dlouhý výklad…"));
      for (const ms of [800, 2000, 3500]) this.later(ms, () => this.ev.onToolCalls([{ name: "part_explained", args: {} }]));
    } else if (text.includes("STAV: FEEDBACK") || text.includes("STAV: REVIEW") || text.includes("STAV: WARMUP")) {
      this.later(400, () => this.ev.onToolCalls([{ name: "request_next_step", args: {} }]));
    } else if (text.includes("STAV: SUMMARY")) {
      this.later(300, () => this.say("Skvělá práce!"));
      this.later(500, () => this.ev.onToolCalls([{ name: "lesson_complete", args: { score: 1 } }]));
    }
    this.later(200, () => this.ev.onTurnComplete());
  }
  sendAudio() {
    /* microphone data is ignored */
  }
  sendToolResponse() {
    /* acknowledged silently */
  }
  close() {
    this.closedFlag = true;
    this.timers.forEach(clearTimeout);
  }
}
