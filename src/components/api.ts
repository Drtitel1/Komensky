export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    method: init?.json !== undefined ? (init.method ?? "POST") : init?.method,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export interface PublicQuestion {
  id: string;
  type: "mc" | "short" | "explain";
  prompt: string;
  options?: string[];
}
export interface PublicPart {
  id: string;
  kind: "main" | "review";
  title: string;
  segments: { id: string; text: string }[];
  questions: PublicQuestion[];
}
export interface Revealed {
  given: string;
  score: number;
  correct: boolean;
  feedback?: string;
  correctAnswer: string;
  explanation: string;
  source: string;
}
export interface LessonData {
  status: "ready";
  lessonId: string;
  title: string;
  stage: { id: number; title: string };
  parts: PublicPart[];
  finalQuiz: PublicQuestion[];
  warmup: PublicQuestion[];
  review: PublicPart | null;
  reviewRound: number;
  reviewPending: boolean;
  completed: boolean;
  rounds: { round: number; pct: number }[];
  answered: Record<string, Revealed>;
}
export interface CourseState {
  subject: string;
  currentLessonId: string | null;
  nextLessonId: string | null;
  completed: string[];
  position: { lessonId: string; stepKey: string; segmentIndex: number; time: number } | null;
  srsCount: number;
  stages: { id: number; title: string; lessons: { id: string; title: string }[] }[];
  total: number;
}
