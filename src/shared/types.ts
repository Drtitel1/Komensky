import { z } from "zod";

/* ---------- curriculum (bundled in /content, read-only) ---------- */

export interface Passage {
  id: string;
  text: string;
}
export interface LessonDef {
  id: string;
  title: string;
  objectives: string[];
  keyFacts: string[];
  passages: Passage[];
}
export interface StageDef {
  id: number;
  title: string;
  description: string;
  lessons: LessonDef[];
}
export interface Curriculum {
  schema: number;
  subject: string;
  age: number;
  stages: StageDef[];
}

/* ---------- lesson plan (generated once per lesson by PREP_MODEL, stored in SQLite) ---------- */

export const QuestionSchema = z.object({
  id: z.string(),
  type: z.enum(["mc", "short", "explain"]),
  prompt: z.string().min(3),
  options: z.array(z.string()).optional(),
  correctIndex: z.number().int().optional(),
  answer: z.string().min(1),
  accepted: z.array(z.string()).optional(),
  explanation: z.string().min(1),
  sourceId: z.string(),
  source: z.string(),
  partIndex: z.number().int().optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const PartSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  objectives: z.array(z.string()).min(1),
  keyFacts: z.array(z.string()).min(1),
  passageIds: z.array(z.string()).min(1),
  targetSeconds: z.number().int().min(60).max(900),
  questions: z.array(QuestionSchema).min(2).max(4),
});
export type Part = z.infer<typeof PartSchema>;

export const PlanSchema = z.object({
  lessonId: z.string(),
  title: z.string(),
  createdAt: z.string(),
  model: z.string(),
  parts: z.array(PartSchema).min(5).max(8),
  finalQuiz: z.array(QuestionSchema).min(10).max(15),
  flags: z.array(z.object({ at: z.string(), where: z.string(), issues: z.array(z.string()) })).default([]),
});
export type Plan = z.infer<typeof PlanSchema>;

/* ---------- lesson state machine ---------- */

export type Phase = "WARMUP" | "EXPLAIN" | "CHECK" | "FEEDBACK" | "FINAL_QUIZ" | "SUMMARY" | "REVIEW" | "RETEST" | "DONE";

export interface AnswerRec {
  qid: string;
  context: "warmup" | "check" | "final" | "retest";
  given: string;
  correct: boolean;
  feedback: string;
  revealed: boolean;
  at: string;
}

export interface LessonState {
  lessonId: string;
  phase: Phase;
  partIndex: number;
  qIndex: number;
  /** seconds spent in the current phase (only counted while not paused) */
  phaseSeconds: number;
  /** seconds spent in the whole lesson */
  totalSeconds: number;
  warmupIds: string[];
  answers: Record<string, AnswerRec>;
  /** question ids asked in the current CHECK/FINAL/RETEST/WARMUP round, in order */
  queue: string[];
  finalCorrect?: number;
  finalTotal?: number;
  reviewRound: number;
  reviewParts: number[];
  retestIds: string[];
  score?: number;
  completed: boolean;
  weakIds: string[];
}

/** A question from an earlier lesson that is due for spaced-repetition review. */
export type WarmupQuestion = Question & { lessonId: string };

/* ---------- misc ---------- */

export interface AppSettings {
  LIVE_MODEL: string;
  PREP_MODEL: string;
  VOICE: string;
}
export const DEFAULT_SETTINGS: AppSettings = {
  LIVE_MODEL: "gemini-3.8-live",
  PREP_MODEL: "gemini-3.8-flash",
  VOICE: "",
};

export const MASTERY = 0.75;
export const MAX_REVIEW_ROUNDS = 3;
