import type { AnswerRec, AppSettings, Curriculum, LessonDef, LessonState, Plan, Question, WarmupQuestion } from "./types";

export type LessonStatus = "locked" | "current" | "completed";
export interface Overview {
  subject: string;
  currentLessonId: string | null;
  completed: number;
  total: number;
  srsDue: number;
  stages: { id: number; title: string; lessons: { id: string; title: string; status: LessonStatus; inProgress: boolean; score: number | null }[] }[];
}

export interface OpenLesson {
  lesson: LessonDef;
  stageTitle: string;
  plan: Plan;
  state: LessonState;
  warmup: WarmupQuestion[];
  nextTitle: string | null;
  resumed: boolean;
}

export interface PlanProgress {
  lessonId: string;
  step: string;
  done: number;
  total: number;
}

export interface LiveTokenInfo {
  token: string;
  model: string;
  /** LiveConnectConfig (JSON) exactly as locked into the token */
  config: Record<string, unknown>;
}

export type UpdateStatus =
  | { state: "idle"; version: string }
  | { state: "checking"; version: string }
  | { state: "none"; version: string }
  | { state: "downloading"; version: string; percent: number; next?: string }
  | { state: "ready"; version: string; next: string }
  | { state: "error"; version: string; message: string }
  | { state: "dev"; version: string };

export interface AdminOverview {
  lessons: { id: string; title: string; status: string; score: number | null; hasPlan: boolean; startedAt: string | null; completedAt: string | null; answers: number; wrong: number }[];
  weak: { qid: string; lessonId: string; prompt: string; wrong: number; total: number }[];
  srsCount: number;
}

export interface KomenskyApi {
  app: { info(): Promise<{ version: string; packaged: boolean; dataDir: string; platform: string }> };
  setup: {
    status(): Promise<{ hasKey: boolean; hasPin: boolean }>;
    testKey(key: string): Promise<{ ok: boolean; error?: string }>;
    complete(a: { key: string; pin: string }): Promise<{ ok: boolean; error?: string }>;
  };
  content: { curriculum(): Promise<Curriculum> };
  progress: { overview(): Promise<Overview> };
  plan: {
    status(lessonId: string): Promise<{ ready: boolean; generating: boolean }>;
    onProgress(cb: (p: PlanProgress) => void): () => void;
  };
  lesson: {
    open(lessonId: string): Promise<{ ok: true; data: OpenLesson } | { ok: false; error: string }>;
    prefetchNext(lessonId: string): Promise<void>;
    saveState(state: LessonState): Promise<void>;
    recordAnswer(rec: AnswerRec, q: Question): Promise<void>;
    transcript(lessonId: string, role: "user" | "model", text: string, phase: string): Promise<void>;
    complete(lessonId: string, score: number, weakIds: string[]): Promise<void>;
    setActive(active: boolean): Promise<void>;
  };
  live: { token(a: { lessonId: string; summary?: string }): Promise<{ ok: true; info: LiveTokenInfo } | { ok: false; error: string }> };
  updates: {
    status(): Promise<UpdateStatus>;
    check(): Promise<UpdateStatus>;
    install(): Promise<void>;
    onStatus(cb: (s: UpdateStatus) => void): () => void;
  };
  admin: {
    unlock(pin: string): Promise<{ ok: boolean; error?: string }>;
    lock(): Promise<void>;
    overview(): Promise<AdminOverview | null>;
    transcripts(lessonId: string): Promise<{ role: string; text: string; phase: string; at: string }[]>;
    getPlan(lessonId: string): Promise<string | null>;
    savePlan(lessonId: string, json: string): Promise<{ ok: boolean; error?: string }>;
    regenerate(lessonId: string): Promise<{ ok: boolean; error?: string }>;
    resetLesson(lessonId: string): Promise<void>;
    jumpTo(lessonId: string): Promise<void>;
    setKey(key: string): Promise<{ ok: boolean; error?: string }>;
    getSettings(): Promise<AppSettings>;
    setSettings(s: AppSettings): Promise<void>;
    changePin(oldPin: string, newPin: string): Promise<{ ok: boolean; error?: string }>;
    exportBackup(): Promise<{ ok: boolean; path?: string; error?: string }>;
    importBackup(): Promise<{ ok: boolean; error?: string }>;
  };
  log(level: "info" | "warn" | "error", message: string): void;
}

declare global {
  interface Window {
    komensky: KomenskyApi;
  }
}
