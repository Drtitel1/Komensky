import type { LessonDef, Plan, Question } from "@shared/types";
import type { PlanRun } from "./planner";

/** Deterministic offline plan used ONLY by automated tests (KOMENSKY_TEST=1 in an unpackaged build). */
export async function fakeGenerate(run: PlanRun): Promise<Plan> {
  const lesson: LessonDef = run.lesson;
  const q = (prefix: string, i: number, part?: number): Question => ({
    id: `${lesson.id}:${prefix}:q${i + 1}`,
    type: i % 2 ? "mc" : "short",
    prompt: `Kolik je ${i + 2} · 2?`,
    ...(i % 2 ? { options: [String((i + 2) * 2), String((i + 2) * 2 + 1), String((i + 2) * 2 + 2)], correctIndex: 0 } : {}),
    answer: String((i + 2) * 2),
    accepted: i % 2 ? undefined : [String((i + 2) * 2)],
    explanation: "Násobíme dvěma.",
    sourceId: lesson.passages[0].id,
    source: `[${lesson.id}/${lesson.passages[0].id}] ${lesson.passages[0].text}`,
    partIndex: part,
  });
  run.onProgress("Testovací plán", 5, 5);
  return {
    lessonId: lesson.id,
    title: lesson.title,
    createdAt: new Date().toISOString(),
    model: "test",
    parts: Array.from({ length: 5 }, (_, i) => ({
      id: `p${i + 1}`, title: `Část ${i + 1}`, objectives: ["cíl"], keyFacts: [lesson.keyFacts[0] ?? "fakt"], passageIds: [lesson.passages[0].id], targetSeconds: 150,
      questions: [q(`p${i + 1}`, 0, i), q(`p${i + 1}`, 1, i)].map((x, k) => ({ ...x, id: `${lesson.id}:p${i + 1}:q${k + 1}` })),
    })),
    finalQuiz: Array.from({ length: 10 }, (_, i) => q("f", i, i % 5)),
    flags: [],
  };
}
