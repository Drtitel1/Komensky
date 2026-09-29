export type QType = "mc" | "short" | "explain";

/** Full question incl. answer key (server side only). */
export interface Question {
  id: string;
  type: QType;
  prompt: string;
  options?: string[]; // mc only
  correctIndex?: number; // mc only
  modelAnswer: string; // the correct answer (text)
  explanation: string; // shown after answering
  source: string; // source passage the question came from ("[1.2/Z3] ...")
}

/** What the browser sees before answering. */
export type PublicQuestion = Pick<Question, "id" | "type" | "prompt" | "options">;

export interface Segment {
  id: string;
  text: string;
}

export interface Part {
  id: string;
  kind: "main" | "review";
  title: string;
  segments: Segment[];
  questions: Question[];
}

export interface Flag {
  at: string;
  where: string; // "part 3" / "final"
  issues: string[];
}

export interface PlanItem {
  title: string;
  focus: string; // what this part teaches (objective + which passages)
  passageIds: string[];
}

export interface LessonContent {
  lessonId: string;
  status: "generating" | "ready";
  plan?: PlanItem[];
  parts: Part[];
  finalQuiz?: Question[];
  flags: Flag[];
  lockUntil?: number;
  retry?: { key: string; attempts: number; issues: string[] };
  createdAt: string;
}

export interface AnswerRecord {
  given: string;
  score: number; // 0 | 0.5 | 1
  correct: boolean;
  feedback?: string;
  at: string;
  context: "part" | "final" | "review" | "warmup";
}

export interface RoundRecord {
  round: number;
  pct: number;
  wrongIds: string[];
  at: string;
}

export interface Attempts {
  lessonId: string;
  warmupIds?: string[];
  warmupAnswers: Record<string, AnswerRecord>;
  answers: Record<string, AnswerRecord>; // part check questions
  finalAnswers: Record<string, AnswerRecord>;
  reviewRound: number; // 0 = no review yet
  reviewPart?: Part; // current review part (with retest questions)
  reviewAnswers: Record<string, AnswerRecord>;
  pendingWrong?: Question[]; // questions to build the next review part from
  reviewRetry?: { attempts: number; issues: string[] };
  rounds: RoundRecord[];
  completed: boolean;
  completedAt?: string;
  masteredWithFlag?: boolean;
}

export interface SrsItem {
  qid: string;
  lessonId: string;
  box: number; // 0..4
  dueAt: number; // epoch ms
  wrongCount: number;
}

export interface Meta {
  completed: string[];
  srs: Record<string, SrsItem>;
  startedAt: string;
}

export interface Position {
  lessonId: string;
  stepKey: string;
  segmentIndex: number;
  time: number;
  updatedAt: string;
}
