import { spokenNumber } from "./czech";
import {
  ctlEvaluateNow, ctlExplain, ctlExplainContinue, ctlExplainWrapUp, ctlFeedback, ctlFinalIntro, ctlHint, ctlMoveOn, ctlPause, ctlQuestion,
  ctlRephrase, ctlResume, ctlRetestFailed, ctlRetestIntro, ctlReveal, ctlReviewIntro, ctlSummary, ctlWarmupIntro,
} from "./prompts";
import { MASTERY, MAX_REVIEW_ROUNDS, type AnswerRec, type LessonDef, type LessonState, type Part, type Phase, type Plan, type Question, type WarmupQuestion } from "./types";

/* Client-side lesson state machine.
 *
 *   WARMUP -> per part: EXPLAIN -> CHECK -> FEEDBACK -> ... -> FINAL_QUIZ -> SUMMARY -> DONE
 *                                                       \-> (<75 %) REVIEW -> RETEST -> (SUMMARY | REVIEW ...)
 *
 * The engine is pure logic: the host feeds it time (tick), live-session events and tool calls, and it answers with
 * "[LESSON CONTROL]" messages through IO.sendControl. The app – not the model – is the source of truth for progress. */

export interface EngineIO {
  sendControl(text: string): void;
  save(state: LessonState): void;
  onAnswer(rec: AnswerRec, q: Question): void;
  onCompleted(score: number, weakIds: string[]): void;
  onFlag?(topic: string): void;
  onChange?(): void;
}

export interface ToolResult {
  ok: boolean;
  message?: string;
}

export interface EngineView {
  phase: Phase;
  paused: boolean;
  partIndex: number;
  partCount: number;
  partTitle: string;
  question: { id: string; prompt: string; options?: string[]; index: number; total: number } | null;
  phaseSeconds: number;
  phaseTarget: number | null;
  totalSeconds: number;
  progress: number; // 0..1
  reviewRound: number;
  completed: boolean;
  score?: number;
}

/* thresholds (seconds) */
export const T = {
  minExplainRatio: 0.7,
  wrapUpRatio: 1.3,
  forceRatio: 1.7,
  idleNudge: 6,
  advanceQuiet: 1.2,
  advanceMax: 12,
  rephrase: 20,
  hint: 45,
  reveal: 70,
  evalNudge: 6,
  evalGiveUp: 30,
  feedbackMax: 120,
  reviewMax: 330,
  summaryMax: 90,
  noiseCap: 75, // push-to-talk is capped at 60 s on the UI side
} as const;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Deterministic check for numeric short answers (also spoken in words); otherwise trusts the model's verdict. */
export function verifyAnswer(q: Question, transcript: string, modelSays: boolean): boolean {
  if (q.type === "short") {
    const a = spokenNumber(q.answer);
    const pureNumber = a !== null && /^-?\d+([.,]\d+)?\s*[^\d\s]{0,12}$/.test(q.answer.trim());
    const b = spokenNumber(transcript.trim());
    if (pureNumber && b !== null) return a === b;
    const known = [q.answer, ...(q.accepted ?? [])].map(norm);
    if (known.includes(norm(transcript))) return true;
  }
  return modelSays;
}

const ctxKey = (ctx: AnswerRec["context"], qid: string, round = 0) => (ctx === "retest" ? `retest${round}|${qid}` : `${ctx}|${qid}`);

export function newLessonState(lessonId: string, warmupIds: string[]): LessonState {
  return {
    lessonId, phase: warmupIds.length ? "WARMUP" : "EXPLAIN", partIndex: 0, qIndex: 0, phaseSeconds: 0, totalSeconds: 0, warmupIds,
    answers: {}, queue: [], reviewRound: 0, reviewParts: [], retestIds: [], completed: false, weakIds: [],
  };
}

export class LessonEngine {
  state: LessonState;
  paused = true;
  private modelSpeaking = false;
  private userSpeaking = false;
  private quiet = 0; // seconds nobody talks (the child's voice only counts while it is plausible speech, see NOISE_CAP)
  private modelQuiet = 0; // seconds the teacher has been silent
  private silent = false; // nobody is (plausibly) talking right now
  private userRun = 0; // seconds of uninterrupted "child is speaking" signal
  private silentSinceAsk = 0;
  private stage = 0; // silence stage 0..3
  private userSpokeSinceAsk = false;
  private asked = false;
  private evalNudged = 0;
  private evalWait = 0;
  private awaiting = 0; // seconds since record_answer arrived (waiting for the model to finish its feedback)
  private pending: (() => void) | null = null;
  private pendingWait = 0;
  private explainDone = false;
  private wrapSent = false;
  private continues = 0;
  private started = false;
  private saveAcc = 0;
  private curAnswered = false;

  constructor(
    readonly plan: Plan,
    readonly lesson: LessonDef,
    state: LessonState,
    private warmup: WarmupQuestion[],
    private io: EngineIO,
    private nextTitle: string | null = null,
  ) {
    this.state = state;
  }

  /* ---------- lookups ---------- */

  private qById(qid: string): Question | undefined {
    return (
      this.warmup.find((w) => w.id === qid) ??
      this.plan.finalQuiz.find((q) => q.id === qid) ??
      this.plan.parts.flatMap((p) => p.questions).find((q) => q.id === qid)
    );
  }
  private get part(): Part {
    return this.plan.parts[Math.min(this.state.partIndex, this.plan.parts.length - 1)];
  }
  private get passages(): string {
    const ids = new Set(this.part.passageIds);
    return this.lesson.passages.filter((p) => ids.has(p.id)).map((p) => `[${p.id}] ${p.text}`).join("\n");
  }
  private get answerCtx(): AnswerRec["context"] {
    return this.state.phase === "WARMUP" ? "warmup" : this.state.phase === "FINAL_QUIZ" ? "final" : this.state.phase === "RETEST" ? "retest" : "check";
  }
  private get isQuestionPhase() {
    return ["WARMUP", "CHECK", "FINAL_QUIZ", "RETEST"].includes(this.state.phase);
  }
  private get target(): number {
    return this.state.phase === "EXPLAIN" ? this.part.targetSeconds : 0;
  }

  /* ---------- public API ---------- */

  view(): EngineView {
    const s = this.state;
    const q = this.isQuestionPhase ? this.qById(s.queue[s.qIndex] ?? "") : undefined;
    const total = this.plan.parts.reduce((n, p) => n + p.targetSeconds, 0) + 600;
    return {
      phase: s.phase, paused: this.paused, partIndex: s.partIndex, partCount: this.plan.parts.length, partTitle: this.part.title,
      question: q ? { id: q.id, prompt: q.prompt, options: q.options, index: s.qIndex, total: s.queue.length } : null,
      phaseSeconds: s.phaseSeconds, phaseTarget: this.target || null, totalSeconds: s.totalSeconds,
      progress: s.completed ? 1 : Math.min(0.98, s.totalSeconds / total), reviewRound: s.reviewRound, completed: s.completed, score: s.score,
    };
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.paused = false;
    if (this.state.completed) return this.changed();
    this.enter(this.state.phase, this.state.phaseSeconds > 0 || this.state.totalSeconds > 0);
  }

  /** Re-send the instruction of the current step (after a reconnect that lost the model context). */
  resync() {
    if (!this.started || this.state.completed) return;
    this.enter(this.state.phase, true, true);
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.io.sendControl(ctlPause());
    this.persist();
    this.changed();
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.quiet = 0;
    this.io.sendControl(ctlResume());
    this.changed();
  }

  setModelSpeaking(v: boolean) {
    this.modelSpeaking = v;
    if (v) {
      this.quiet = 0;
      this.modelQuiet = 0;
    }
  }
  /** Voice-activity signal (microphone level / transcription activity). Only affects the silence timers. */
  setUserSpeaking(v: boolean) {
    this.userSpeaking = v;
    if (v) this.quiet = 0;
    else this.userRun = 0;
  }
  /** Evidence that the child really said something (input transcription arrived): this is what marks a question as answered. */
  noteUserTranscript() {
    if (this.isQuestionPhase && this.asked && !this.curAnswered) {
      this.userSpokeSinceAsk = true;
      this.evalWait = 0; // still talking / just answered: give the teacher time to evaluate
    }
  }

  summary(): string {
    const s = this.state;
    const done = Object.values(s.answers).filter((a) => a.context === "check" || a.context === "final").length;
    return `Fáze ${s.phase}, část ${s.partIndex + 1} z ${this.plan.parts.length} („${this.part.title}“), otázka ${s.qIndex + 1}/${s.queue.length || "-"}, uplynulo ${Math.round(s.totalSeconds / 60)} min. Zodpovězeno otázek: ${done}. ${s.reviewRound ? `Probíhá ${s.reviewRound}. opakování.` : ""}`;
  }

  /* ---------- tool calls from the model ---------- */

  toolCall(name: string, args: Record<string, unknown>): ToolResult {
    switch (name) {
      case "part_explained":
        return this.onPartExplained();
      case "record_answer":
        return this.onRecord(args);
      case "request_next_step":
        return this.onNextStep();
      case "flag_uncertain":
        this.io.onFlag?.(String(args.topic ?? ""));
        return { ok: true };
      case "lesson_complete":
        if (this.state.phase === "SUMMARY") this.finish();
        return { ok: true };
      default:
        return { ok: false, message: "unknown tool" };
    }
  }

  /* ---------- time ---------- */

  tick(dt = 1) {
    if (this.paused || !this.started || this.state.completed) return;
    const s = this.state;
    s.phaseSeconds += dt;
    s.totalSeconds += dt;
    // constant noise (fan, echo, a TV) must never freeze the lesson: after NOISE_CAP seconds a "speaking" signal is ignored
    this.userRun = this.userSpeaking ? this.userRun + dt : 0;
    const userTalking = this.userSpeaking && this.userRun < T.noiseCap;
    this.silent = !this.modelSpeaking && !userTalking;
    if (this.silent) this.quiet += dt;
    else this.quiet = 0;
    if (this.modelSpeaking) this.modelQuiet = 0;
    else this.modelQuiet += dt;

    if (this.pending) {
      this.pendingWait += dt;
      if (this.modelQuiet >= T.advanceQuiet || this.pendingWait >= T.advanceMax) {
        const fn = this.pending;
        this.pending = null;
        fn();
      }
    } else {
      switch (s.phase) {
        case "EXPLAIN":
          this.tickExplain(dt);
          break;
        case "WARMUP":
        case "CHECK":
        case "FINAL_QUIZ":
        case "RETEST":
          this.tickQuestion(dt);
          break;
        case "FEEDBACK":
          if (s.phaseSeconds > T.feedbackMax || (s.phaseSeconds > 25 && this.modelQuiet >= 4)) this.afterFeedback();
          break;
        case "REVIEW":
          if (s.phaseSeconds > T.reviewMax || (s.phaseSeconds > 120 && this.modelQuiet >= 8)) this.startRetest();
          break;
        case "SUMMARY":
          if (s.phaseSeconds > T.summaryMax || (s.phaseSeconds > 20 && this.modelQuiet >= 6)) this.finish();
          break;
      }
    }
    this.saveAcc += dt;
    if (this.saveAcc >= 10) this.persist();
    this.changed();
  }

  /* ---------- phase machinery ---------- */

  private persist() {
    this.saveAcc = 0;
    this.io.save(structuredClone(this.state));
  }
  private changed() {
    this.io.onChange?.();
  }
  private go(phase: Phase) {
    const s = this.state;
    s.phase = phase;
    s.phaseSeconds = 0;
    this.persist();
    this.enter(phase, false);
  }
  private later(fn: () => void) {
    this.pending = fn;
    this.pendingWait = 0;
  }

  private resetQuestionFlags() {
    this.asked = false;
    this.silentSinceAsk = 0;
    this.stage = 0;
    this.userSpokeSinceAsk = false;
    this.evalNudged = 0;
    this.evalWait = 0;
    this.awaiting = 0;
    this.curAnswered = false;
  }

  private enter(phase: Phase, resumed: boolean, resync = false) {
    const s = this.state;
    this.pending = null;
    this.quiet = 0;
    this.modelQuiet = 0;
    this.resetQuestionFlags();
    this.explainDone = false;
    this.wrapSent = false;
    this.continues = 0;
    switch (phase) {
      case "WARMUP": {
        if (!s.queue.length || s.queue.some((id) => !this.warmup.some((w) => w.id === id))) s.queue = this.warmup.map((w) => w.id);
        if (!this.remaining().length) return this.go("EXPLAIN");
        if (!resumed) this.io.sendControl(ctlWarmupIntro(s.queue.length, false));
        else if (!resync) this.io.sendControl(ctlWarmupIntro(s.queue.length, true));
        this.askNext(resync || resumed);
        break;
      }
      case "EXPLAIN":
        this.io.sendControl(ctlExplain(this.part, s.partIndex, this.plan.parts.length, resumed, this.passages));
        break;
      case "CHECK":
      case "FINAL_QUIZ":
      case "RETEST": {
        if (!resumed || !s.queue.length) {
          s.qIndex = 0;
          s.queue =
            phase === "CHECK" ? this.part.questions.map((q) => q.id) : phase === "FINAL_QUIZ" ? this.plan.finalQuiz.map((q) => q.id) : [...s.retestIds];
        }
        if (phase === "FINAL_QUIZ" && !resumed) this.io.sendControl(ctlFinalIntro(s.queue.length));
        if (phase === "RETEST" && !resumed) this.io.sendControl(ctlRetestIntro(s.queue.length));
        if (!this.remaining().length) return this.queueDone();
        this.askNext(resync || resumed);
        break;
      }
      case "FEEDBACK": {
        const results = this.part.questions.map((q) => ({ q, correct: !!s.answers[ctxKey("check", q.id)]?.correct }));
        this.io.sendControl(ctlFeedback(this.part, results));
        break;
      }
      case "SUMMARY":
        this.io.sendControl(ctlSummary(this.lesson, s.finalCorrect ?? 0, s.finalTotal ?? this.plan.finalQuiz.length, this.nextTitle));
        break;
      case "REVIEW": {
        const parts = s.reviewParts.map((i) => this.plan.parts[i]).filter(Boolean);
        this.io.sendControl(ctlReviewIntro(parts, s.reviewRound, s.finalCorrect ?? 0, s.finalTotal ?? this.plan.finalQuiz.length));
        break;
      }
      case "DONE":
        break;
    }
    this.changed();
  }

  /* ----- question runner ----- */

  private key(qid: string) {
    return ctxKey(this.answerCtx, qid, this.state.reviewRound);
  }
  private remaining(): string[] {
    return this.state.queue.filter((id) => !this.state.answers[this.key(id)]);
  }
  private askNext(again = false) {
    const s = this.state;
    const rem = this.remaining();
    if (!rem.length) return this.queueDone();
    const qid = rem[0];
    const q = this.qById(qid)!;
    s.qIndex = s.queue.indexOf(qid);
    this.resetQuestionFlags();
    const kind = this.answerCtx === "check" ? "check" : this.answerCtx === "final" ? "final" : this.answerCtx === "retest" ? "retest" : "warmup";
    const lead = again ? "(Navazuješ po přerušení – tuto otázku polož znovu, jako by ještě nezazněla.)" : s.qIndex === 0 && kind === "check" ? "Krátce řekni, že teď zkontrolujete, jak výklad šel." : undefined;
    this.io.sendControl(ctlQuestion(q, s.qIndex, s.queue.length, kind, lead));
    this.asked = true;
    this.persist();
    this.changed();
  }

  private queueDone() {
    const s = this.state;
    switch (s.phase) {
      case "WARMUP":
        s.queue = [];
        return this.go("EXPLAIN");
      case "CHECK":
        s.queue = [];
        return this.go("FEEDBACK");
      case "FINAL_QUIZ":
        return this.evaluateFinal();
      case "RETEST":
        return this.evaluateRetest();
    }
  }

  private tickQuestion(dt: number) {
    const s = this.state;
    if (!this.asked) return;
    const qid = s.queue[s.qIndex];
    const q = this.qById(qid);
    if (!q) return;
    if (this.curAnswered) {
      this.awaiting += dt;
      if (this.modelQuiet >= T.advanceQuiet || this.awaiting >= T.advanceMax) this.askNext();
      return;
    }
    if (this.userSpokeSinceAsk) {
      // the child answered – the model must call record_answer
      if (!this.modelSpeaking) {
        this.evalWait += dt;
        if (this.evalWait >= T.evalNudge && this.evalNudged === 0) {
          this.evalNudged = 1;
          this.io.sendControl(ctlEvaluateNow(q));
        } else if (this.evalWait >= T.evalGiveUp) {
          this.record(q, "(neuloženo)", false, "");
        }
      } else this.evalWait = 0;
      return;
    }
    if (this.silent) {
      this.silentSinceAsk += dt;
      const t = this.silentSinceAsk;
      if (this.stage === 0 && t >= T.rephrase) {
        this.stage = 1;
        this.io.sendControl(ctlRephrase());
      } else if (this.stage === 1 && t >= T.hint) {
        this.stage = 2;
        this.io.sendControl(ctlHint());
      } else if (this.stage === 2 && t >= T.reveal) {
        this.stage = 3;
        this.io.sendControl(ctlReveal(q));
        this.record(q, "", false, "", true);
      }
    }
  }

  private onRecord(args: Record<string, unknown>): ToolResult {
    const qid = String(args.question_id ?? "");
    const q = this.qById(qid);
    if (!q || !this.isQuestionPhase || !this.state.queue.includes(qid)) return { ok: false, message: "neočekávané id otázky" };
    if (this.state.answers[this.key(qid)]) return { ok: true, message: "už zaznamenáno" };
    const transcript = String(args.answer_transcript ?? "");
    this.record(q, transcript, verifyAnswer(q, transcript, args.is_correct === true), String(args.feedback ?? ""));
    return { ok: true };
  }

  private record(q: Question, given: string, correct: boolean, feedback: string, revealed = false) {
    const s = this.state;
    const rec: AnswerRec = { qid: q.id, context: this.answerCtx, given, correct, feedback, revealed, at: new Date().toISOString() };
    s.answers[this.key(q.id)] = rec;
    this.curAnswered = true;
    this.awaiting = 0;
    this.io.onAnswer(rec, q);
    this.persist();
    this.changed();
  }

  /* ----- explain ----- */

  private tickExplain(dt: number) {
    const s = this.state;
    const T0 = this.part.targetSeconds;
    const t = s.phaseSeconds;
    void dt;
    if (!this.explainDone && this.modelQuiet >= T.idleNudge) {
      if (t < T0 * T.minExplainRatio) {
        this.io.sendControl(ctlExplainContinue(this.continues++));
        this.modelQuiet = 0;
        return;
      }
      // enough time has passed and the model stopped talking: treat it as done
      return this.advanceFromExplain();
    }
    if (t > T0 * T.wrapUpRatio && !this.wrapSent && !this.explainDone) {
      this.wrapSent = true;
      this.io.sendControl(ctlExplainWrapUp());
    }
    if (t > T0 * T.forceRatio && this.modelQuiet >= 3) this.advanceFromExplain();
  }

  private onPartExplained(): ToolResult {
    if (this.state.phase !== "EXPLAIN") return { ok: true };
    if (this.state.phaseSeconds < this.part.targetSeconds * T.minExplainRatio) {
      this.io.sendControl(ctlExplainContinue(this.continues++));
      return { ok: true, message: "příliš brzy" };
    }
    this.explainDone = true;
    this.advanceFromExplain();
    return { ok: true };
  }

  private advanceFromExplain() {
    if (this.state.phase !== "EXPLAIN" || this.pending) return;
    this.later(() => this.go("CHECK"));
  }

  /* ----- feedback / next ----- */

  private onNextStep(): ToolResult {
    const s = this.state;
    if (s.phase === "FEEDBACK") this.later(() => this.afterFeedback());
    else if (s.phase === "WARMUP" && !this.remaining().length) this.later(() => this.go("EXPLAIN"));
    else if (s.phase === "REVIEW") this.later(() => this.startRetest());
    return { ok: true };
  }

  private afterFeedback() {
    const s = this.state;
    this.pending = null;
    if (s.partIndex + 1 < this.plan.parts.length) {
      s.partIndex += 1;
      s.queue = [];
      this.go("EXPLAIN");
    } else {
      s.queue = [];
      this.go("FINAL_QUIZ");
    }
  }

  /* ----- evaluation ----- */

  private evaluateFinal() {
    const s = this.state;
    const qs = this.plan.finalQuiz;
    const wrong = qs.filter((q) => !s.answers[ctxKey("final", q.id)]?.correct);
    s.finalTotal = qs.length;
    s.finalCorrect = qs.length - wrong.length;
    s.weakIds = wrong.map((q) => q.id);
    if (s.finalCorrect / qs.length >= MASTERY) {
      s.score = s.finalCorrect / qs.length;
      return this.go("SUMMARY");
    }
    this.startReview(wrong);
  }

  private startReview(wrong: Question[]) {
    const s = this.state;
    s.reviewRound += 1;
    if (s.reviewRound > MAX_REVIEW_ROUNDS) return this.moveOn();
    const counts = new Map<number, number>();
    for (const q of wrong) counts.set(q.partIndex ?? 0, (counts.get(q.partIndex ?? 0) ?? 0) + 1);
    s.reviewParts = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([i]) => i).sort((a, b) => a - b);
    s.retestIds = wrong.slice(0, 8).map((q) => q.id);
    s.queue = [];
    this.go("REVIEW");
  }

  private startRetest() {
    this.pending = null;
    this.state.queue = [];
    this.go("RETEST");
  }

  private evaluateRetest() {
    const s = this.state;
    const ids = s.retestIds;
    const fixed = ids.filter((id) => s.answers[ctxKey("retest", id, s.reviewRound)]?.correct);
    const total = s.finalTotal ?? this.plan.finalQuiz.length;
    // questions that were already right in the quiz + those fixed in this retest
    const stillWrong = this.plan.finalQuiz.filter((q) => {
      const okFinal = s.answers[ctxKey("final", q.id)]?.correct;
      const okRetest = s.answers[ctxKey("retest", q.id, s.reviewRound)]?.correct || s.answers[ctxKey("retest", q.id, s.reviewRound - 1)]?.correct;
      return !okFinal && !okRetest;
    });
    s.finalCorrect = total - stillWrong.length;
    s.weakIds = stillWrong.map((q) => q.id);
    void fixed;
    if (s.finalCorrect / total >= MASTERY) {
      s.score = s.finalCorrect / total;
      return this.go("SUMMARY");
    }
    if (s.reviewRound >= MAX_REVIEW_ROUNDS) return this.moveOn();
    this.io.sendControl(ctlRetestFailed());
    this.startReview(stillWrong);
  }

  private moveOn() {
    const s = this.state;
    s.score = (s.finalCorrect ?? 0) / (s.finalTotal || 1);
    this.io.sendControl(ctlMoveOn());
    s.phase = "SUMMARY";
    s.phaseSeconds = 0;
    this.persist();
  }

  private finish() {
    const s = this.state;
    if (s.completed) return;
    s.completed = true;
    s.phase = "DONE";
    s.score = s.score ?? (s.finalCorrect ?? 0) / (s.finalTotal || 1);
    this.persist();
    this.io.onCompleted(s.score, s.weakIds);
    this.changed();
  }
}
