import { ALL_LESSONS, getLesson } from "@/curriculum";
import { readJson, writeJson } from "./blob";
import { lessonPath } from "./generation";
import type { AnswerRecord, Attempts, LessonContent, Meta, Part, Position, PublicQuestion, Question } from "./types";

const META = "state/meta.json";
const POS = "state/position.json";
const attemptsPath = (id: string) => `state/attempts-${id}.json`;

export async function loadMeta(): Promise<Meta> {
  return (await readJson<Meta>(META)) ?? { completed: [], srs: {}, startedAt: new Date().toISOString() };
}
export const saveMeta = (m: Meta) => writeJson(META, m);

export async function loadPosition() {
  return readJson<Position>(POS);
}
export const savePosition = (p: Position) => writeJson(POS, p);

export async function loadAttempts(lessonId: string): Promise<Attempts> {
  return (
    (await readJson<Attempts>(attemptsPath(lessonId))) ?? {
      lessonId,
      warmupAnswers: {},
      answers: {},
      finalAnswers: {},
      reviewRound: 0,
      reviewAnswers: {},
      rounds: [],
      completed: false,
    }
  );
}
export const saveAttempts = (a: Attempts) => writeJson(attemptsPath(a.lessonId), a);

export const loadLesson = (id: string) => readJson<LessonContent>(lessonPath(id));

/** The lesson the learner should be working on now = first not completed. */
export function currentLessonId(meta: Meta): string | null {
  return ALL_LESSONS.find((l) => !meta.completed.includes(l.id))?.id ?? null;
}

export const lessonIdOfQuestion = (qid: string) => qid.split(":")[0];

export const publicQuestion = (q: Question): PublicQuestion => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options });

export const publicPart = (p: Part) => ({ id: p.id, kind: p.kind, title: p.title, segments: p.segments, questions: p.questions.map(publicQuestion) });

/** Finds a question (with its answer key) anywhere: lesson parts, final quiz, review part. */
export async function findQuestion(qid: string): Promise<{ q: Question; lessonId: string } | null> {
  const lessonId = lessonIdOfQuestion(qid);
  if (!getLesson(lessonId)) return null;
  const [lesson, attempts] = await Promise.all([loadLesson(lessonId), loadAttempts(lessonId)]);
  const all: Question[] = [
    ...(lesson?.parts.flatMap((p) => p.questions) ?? []),
    ...(lesson?.finalQuiz ?? []),
    ...(attempts.reviewPart?.questions ?? []),
  ];
  const q = all.find((x) => x.id === qid);
  return q ? { q, lessonId } : null;
}

export interface RevealedAnswer extends AnswerRecord {
  correctAnswer: string;
  explanation: string;
  source: string;
}

export function reveal(q: Question, rec: AnswerRecord): RevealedAnswer {
  return { ...rec, correctAnswer: q.modelAnswer, explanation: q.explanation, source: q.source };
}
