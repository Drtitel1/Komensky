import { z } from "zod";
import { getLesson, type LessonDef } from "@/curriculum";
import { readJson, writeJson } from "./blob";
import { CHECK_MODEL, generateJson } from "./gemini";
import { checkPrompt, finalPrompt, partPrompt, planPrompt, reviewPrompt, SYSTEM_CHECKER, SYSTEM_TEACHER } from "./prompts";
import { packSegments } from "./speech";
import type { LessonContent, Part, Question } from "./types";

const MAX_RETRIES = 2; // regeneration attempts after the first failed fact-check
const LOCK_MS = 100_000;

export const lessonPath = (id: string) => `lessons/${id}.json`;

/* ---------- schemas ---------- */

const RawQuestion = z.object({
  type: z.enum(["mc", "short", "explain"]),
  prompt: z.string().min(3),
  options: z.array(z.string()).optional(),
  correctIndex: z.number().int().optional(),
  modelAnswer: z.string().min(1),
  explanation: z.string().min(1),
  sourceId: z.string(),
});
type RawQuestion = z.infer<typeof RawQuestion>;

const PlanSchema = z.object({
  parts: z.array(z.object({ title: z.string(), focus: z.string(), passageIds: z.array(z.string()) })).min(5).max(8),
});
const PartSchema = z.object({ script: z.array(z.string()).min(2), questions: z.array(RawQuestion).min(2).max(4) });
const FinalSchema = z.object({ questions: z.array(RawQuestion).min(10).max(15) });
const ReviewSchema = z.object({ script: z.array(z.string()).min(1), questions: z.array(RawQuestion).min(2).max(8) });
const CheckSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  issues: z.array(z.object({ where: z.string(), problem: z.string() })),
});

/* ---------- helpers ---------- */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toQuestions(lesson: LessonDef, prefix: string, raw: RawQuestion[]): Question[] {
  const out: Question[] = [];
  raw.forEach((r, i) => {
    const passage = lesson.passages.find((p) => p.id === r.sourceId) ?? lesson.passages.find((p) => r.sourceId.includes(p.id));
    const source = passage ? `[${lesson.id}/${passage.id}] ${passage.text}` : `[${lesson.id}] ${r.sourceId}`;
    const base = { id: `${lesson.id}:${prefix}:q${i + 1}`, type: r.type, prompt: r.prompt.trim(), explanation: r.explanation.trim(), source };
    if (r.type === "mc") {
      const options = (r.options ?? []).map((o) => o.trim());
      if (options.length < 3 || options.length > 4 || new Set(options).size !== options.length) throw new Error("bad mc options");
      if (r.correctIndex == null || r.correctIndex < 0 || r.correctIndex >= options.length) throw new Error("bad correctIndex");
      const correct = options[r.correctIndex];
      const shuffled = shuffle(options);
      out.push({ ...base, options: shuffled, correctIndex: shuffled.indexOf(correct), modelAnswer: correct });
    } else {
      out.push({ ...base, modelAnswer: r.modelAnswer.trim() });
    }
  });
  return out;
}

function questionsText(qs: Question[]): string {
  return qs
    .map((q, i) => {
      const opts = q.options ? `\n   Možnosti: ${q.options.map((o, k) => `${k === q.correctIndex ? "*" : ""}${String.fromCharCode(65 + k)}) ${o}`).join(" | ")}  (* = klíč)` : "";
      return `${i + 1}. [${q.type}] ${q.prompt}${opts}\n   Správná odpověď: ${q.modelAnswer}\n   Vysvětlení: ${q.explanation}\n   Zdroj: ${q.source.slice(0, 200)}`;
    })
    .join("\n");
}

async function factCheck(lesson: LessonDef, what: string, content: string): Promise<{ ok: boolean; issues: string[] }> {
  try {
    const res = await generateJson({
      model: CHECK_MODEL(),
      system: SYSTEM_CHECKER,
      prompt: checkPrompt(lesson, what, content),
      schema: CheckSchema,
      temperature: 0,
    });
    const issues = res.issues.map((i) => `${i.where}: ${i.problem}`);
    return { ok: res.verdict === "pass" && issues.length === 0, issues };
  } catch (e) {
    // Checker failure must never silently pass content.
    return { ok: false, issues: [`Fact-check se nepodařilo provést: ${(e as Error).message}`] };
  }
}

function newLesson(lessonId: string): LessonContent {
  return { lessonId, status: "generating", parts: [], flags: [], createdAt: new Date().toISOString() };
}

export function progressOf(c: LessonContent) {
  const total = (c.plan?.length ?? 6) + 2; // plan + parts + final
  const done = (c.plan ? 1 : 0) + c.parts.length + (c.finalQuiz ? 1 : 0);
  return { done, total: c.plan ? total - 1 : total };
}

/* ---------- units (each = one generate + one fact-check) ---------- */

type Attempt<T> = { value: T; check: { ok: boolean; issues: string[] } };

async function attemptPart(lesson: LessonDef, c: LessonContent, index: number, issues: string[]): Promise<Attempt<Part>> {
  const plan = c.plan!;
  const raw = await generateJson({
    system: SYSTEM_TEACHER,
    prompt: partPrompt(lesson, plan, index, issues),
    schema: PartSchema,
  });
  const words = raw.script.join(" ").split(/\s+/).length;
  if (words < 180) throw new Error(`script too short (${words} words)`);
  const partId = `p${index + 1}`;
  const questions = toQuestions(lesson, partId, raw.questions);
  const part: Part = {
    id: partId,
    kind: "main",
    title: plan[index].title,
    segments: packSegments(raw.script).map((text, i) => ({ id: `${partId}s${i + 1}`, text })),
    questions,
  };
  const check = await factCheck(lesson, `část ${index + 1} – ${part.title}`, `VÝKLAD:\n${raw.script.join("\n")}\n\nOTÁZKY:\n${questionsText(questions)}`);
  return { value: part, check };
}

async function attemptFinal(lesson: LessonDef, c: LessonContent, issues: string[]): Promise<Attempt<Question[]>> {
  const raw = await generateJson({
    system: SYSTEM_TEACHER,
    prompt: finalPrompt(lesson, c.plan!, issues),
    schema: FinalSchema,
  });
  const questions = toQuestions(lesson, "f", raw.questions);
  const check = await factCheck(lesson, "závěrečný kvíz", questionsText(questions));
  return { value: questions, check };
}

/**
 * Performs exactly ONE small step of lesson generation (plan / one part attempt / final quiz attempt)
 * so every HTTP call stays well inside the serverless time limit. Call repeatedly until status === "ready".
 */
export async function stepLesson(lessonId: string): Promise<{ content: LessonContent; busy: boolean }> {
  const lesson = getLesson(lessonId);
  if (!lesson) throw new Error("Unknown lesson " + lessonId);

  let c = (await readJson<LessonContent>(lessonPath(lessonId))) ?? newLesson(lessonId);
  if (c.status === "ready") return { content: c, busy: false };
  if (c.lockUntil && c.lockUntil > Date.now()) return { content: c, busy: true };

  c.lockUntil = Date.now() + LOCK_MS;
  await writeJson(lessonPath(lessonId), c);

  try {
    if (!c.plan) {
      const plan = await generateJson({ system: SYSTEM_TEACHER, prompt: planPrompt(lesson), schema: PlanSchema });
      c.plan = plan.parts;
    } else if (c.parts.length < c.plan.length) {
      const index = c.parts.length;
      const key = `part${index}`;
      const prev = c.retry?.key === key ? c.retry : { key, attempts: 0, issues: [] as string[] };
      const { value, check } = await attemptPart(lesson, c, index, prev.issues);
      const attempts = prev.attempts + 1;
      if (check.ok || attempts > MAX_RETRIES) {
        if (!check.ok) c.flags.push({ at: new Date().toISOString(), where: `část ${index + 1}`, issues: check.issues });
        c.parts.push(value);
        c.retry = undefined;
      } else {
        c.retry = { key, attempts, issues: check.issues };
      }
    } else if (!c.finalQuiz) {
      const key = "final";
      const prev = c.retry?.key === key ? c.retry : { key, attempts: 0, issues: [] as string[] };
      const { value, check } = await attemptFinal(lesson, c, prev.issues);
      const attempts = prev.attempts + 1;
      if (check.ok || attempts > MAX_RETRIES) {
        if (!check.ok) c.flags.push({ at: new Date().toISOString(), where: "závěrečný kvíz", issues: check.issues });
        c.finalQuiz = value;
        c.retry = undefined;
      } else {
        c.retry = { key, attempts, issues: check.issues };
      }
    }
    if (c.plan && c.parts.length === c.plan.length && c.finalQuiz) c.status = "ready";
  } catch (e) {
    // Keep progress, release lock, let the caller retry.
    c.lockUntil = undefined;
    await writeJson(lessonPath(lessonId), c);
    throw e;
  }
  c.lockUntil = undefined;
  await writeJson(lessonPath(lessonId), c);
  return { content: c, busy: false };
}

/** One attempt at a review part (script + retest questions). Returns null part while a retry is needed. */
export async function attemptReview(
  lessonId: string,
  wrong: Question[],
  round: number,
  issues: string[],
  attempts: number,
): Promise<{ part?: Part; issues: string[]; flag?: string[] }> {
  const lesson = getLesson(lessonId)!;
  const raw = await generateJson({
    system: SYSTEM_TEACHER,
    prompt: reviewPrompt(lesson, wrong, round, issues),
    schema: ReviewSchema,
  });
  const partId = `r${round}`;
  const questions = toQuestions(lesson, partId, raw.questions);
  const part: Part = {
    id: partId,
    kind: "review",
    title: "Zopakujeme si to",
    segments: packSegments(raw.script).map((text, i) => ({ id: `${partId}s${i + 1}`, text })),
    questions,
  };
  const check = await factCheck(lesson, `opakování ${round}`, `VÝKLAD:\n${raw.script.join("\n")}\n\nOTÁZKY:\n${questionsText(questions)}`);
  if (check.ok) return { part, issues: [] };
  if (attempts + 1 > MAX_RETRIES) return { part, issues: check.issues, flag: check.issues };
  return { issues: check.issues };
}
