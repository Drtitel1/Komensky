import { LessonEngine, newLessonState, type EngineIO } from "@shared/engine";
import type { AnswerRec, LessonDef, LessonState, Plan, Question, WarmupQuestion } from "@shared/types";

export const lesson: LessonDef = {
  id: "9.1",
  title: "Test",
  objectives: ["cíl"],
  keyFacts: ["fakt"],
  passages: [{ id: "Z1", text: "Text." }],
};

const q = (id: string, part: number, answer = "8", type: Question["type"] = "short"): Question => ({
  id, type, prompt: `Otázka ${id}`, answer, explanation: "Protože.", sourceId: "Z1", source: "[9.1/Z1] Text.", partIndex: part,
  ...(type === "mc" ? { options: ["8", "9", "10"], correctIndex: 0 } : {}),
});

export function makePlan(parts = 5, quiz = 10): Plan {
  return {
    lessonId: lesson.id, title: "Test", createdAt: "2026-01-01", model: "test", flags: [],
    parts: Array.from({ length: parts }, (_, i) => ({
      id: `p${i + 1}`, title: `Část ${i + 1}`, objectives: ["cíl"], keyFacts: ["fakt"], passageIds: ["Z1"], targetSeconds: 200,
      questions: [q(`9.1:p${i + 1}:q1`, i), q(`9.1:p${i + 1}:q2`, i, "8", "mc")],
    })),
    finalQuiz: Array.from({ length: quiz }, (_, i) => q(`9.1:f:q${i + 1}`, i % parts)),
  };
}

export interface Harness {
  e: LessonEngine;
  sent: string[];
  answers: AnswerRec[];
  saved: LessonState[];
  completed: { score: number; weak: string[] }[];
  /** advance the clock second by second (nobody is talking) */
  wait(seconds: number): void;
  last(): string;
}

export function harness(opts: { plan?: Plan; warmup?: WarmupQuestion[]; state?: LessonState } = {}): Harness {
  const plan = opts.plan ?? makePlan();
  const warmup = opts.warmup ?? [];
  const sent: string[] = [];
  const answers: AnswerRec[] = [];
  const saved: LessonState[] = [];
  const completed: { score: number; weak: string[] }[] = [];
  const io: EngineIO = {
    sendControl: (t) => sent.push(t),
    save: (s) => saved.push(s),
    onAnswer: (r) => answers.push(r),
    onCompleted: (score, weak) => completed.push({ score, weak }),
  };
  const state = opts.state ?? newLessonState(lesson.id, warmup.map((w) => w.id));
  const e = new LessonEngine(plan, lesson, state, warmup, io, "Další lekce");
  return { e, sent, answers, saved, completed, wait: (s) => { for (let i = 0; i < s; i++) e.tick(1); }, last: () => sent[sent.length - 1] ?? "" };
}

export const qidOf = (control: string) => /\[id: ([^\]]+)\]/.exec(control)?.[1] ?? "";
