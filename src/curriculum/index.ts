import type { LessonDef, StageDef } from "./types";
import { stage1 } from "./stage1";
import { stage2 } from "./stage2";
import { stage3 } from "./stage3";
import { stage4 } from "./stage4";
import { stage5 } from "./stage5";

export type { LessonDef, StageDef, Passage } from "./types";

export const STAGES: StageDef[] = [stage1, stage2, stage3, stage4, stage5];

export const SUBJECT = "Matematika pro 3. třídu";

/** All lessons in the order they are studied. */
export const ALL_LESSONS: (LessonDef & { stageId: number; index: number })[] = STAGES.flatMap((s) =>
  s.lessons.map((l) => ({ ...l, stageId: s.id })),
).map((l, index) => ({ ...l, index }));

export function getLesson(id: string) {
  return ALL_LESSONS.find((l) => l.id === id);
}

export function getStage(id: number) {
  return STAGES.find((s) => s.id === id)!;
}

export function nextLessonId(id: string): string | null {
  const l = getLesson(id);
  if (!l) return null;
  return ALL_LESSONS[l.index + 1]?.id ?? null;
}

/** Lessons studied before the given one (allowed for review / prior knowledge). */
export function earlierLessons(id: string) {
  const l = getLesson(id);
  return l ? ALL_LESSONS.slice(0, l.index) : [];
}

export function passagesToText(lesson: LessonDef): string {
  return lesson.passages.map((p) => `[${lesson.id}/${p.id}] ${p.text}`).join("\n");
}
