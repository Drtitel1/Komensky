export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Settings {
  geminiKey: string;
  geminiModel: string;
  geminiCheckModel: string;
  elevenKey: string;
  elevenVoice: string;
  elevenModel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  geminiKey: "",
  geminiModel: "gemini-3.8-flash",
  geminiCheckModel: "",
  elevenKey: "",
  elevenVoice: "",
  elevenModel: "eleven_v4",
};

const SETTINGS_KEY = "komensky_settings";

/** Keys and model names live only in this browser (localStorage) and are sent to our own server with each request. */
export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

function settingsHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const s = loadSettings();
  const h: Record<string, string> = {};
  if (s.geminiKey) h["x-gemini-key"] = s.geminiKey.trim();
  if (s.geminiModel) h["x-gemini-model"] = s.geminiModel.trim();
  if (s.geminiCheckModel) h["x-gemini-check-model"] = s.geminiCheckModel.trim();
  if (s.elevenKey) h["x-eleven-key"] = s.elevenKey.trim();
  if (s.elevenVoice) h["x-eleven-voice"] = s.elevenVoice.trim();
  if (s.elevenModel) h["x-eleven-model"] = s.elevenModel.trim();
  return h;
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...settingsHeaders(), ...(init?.headers ?? {}) },
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
