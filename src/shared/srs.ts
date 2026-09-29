// Spaced repetition. Only questions answered wrong enter the queue; every later correct answer moves them
// up one box (review after 0/1/3/7/14 days) and after the last box they leave the queue.
export const BOX_DAYS = [0, 1, 3, 7, 14];
const DAY = 86_400_000;

export interface SrsRow {
  qid: string;
  lessonId: string;
  box: number;
  dueAt: number;
  wrongCount: number;
}

/** Returns the new row, or "remove" when the item is mastered, or undefined when nothing changes. */
export function nextSrs(prev: SrsRow | undefined, qid: string, lessonId: string, correct: boolean, now: number): SrsRow | "remove" | undefined {
  if (!correct) return { qid, lessonId, box: 0, dueAt: now, wrongCount: (prev?.wrongCount ?? 0) + 1 };
  if (!prev) return undefined;
  const box = prev.box + 1;
  if (box >= BOX_DAYS.length) return "remove";
  return { ...prev, box, dueAt: now + BOX_DAYS[box] * DAY };
}
