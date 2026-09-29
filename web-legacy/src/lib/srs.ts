import type { Meta, SrsItem } from "./types";

const DAY = 24 * 3600 * 1000;
const INTERVALS_DAYS = [0, 1, 3, 7, 14]; // box -> days until next review

export function recordResult(meta: Meta, qid: string, lessonId: string, correct: boolean, now = Date.now()) {
  const cur = meta.srs[qid];
  if (!correct) {
    const item: SrsItem = {
      qid,
      lessonId,
      box: 0,
      dueAt: now,
      wrongCount: (cur?.wrongCount ?? 0) + 1,
    };
    meta.srs[qid] = item;
    return;
  }
  if (!cur) return; // correct answers only matter for items already in the queue
  const box = cur.box + 1;
  if (box >= INTERVALS_DAYS.length) {
    delete meta.srs[qid]; // learned
    return;
  }
  meta.srs[qid] = { ...cur, box, dueAt: now + INTERVALS_DAYS[box] * DAY };
}

/** Due items from lessons that come BEFORE the current one, most-needed first. */
export function dueItems(meta: Meta, allowedLessonIds: Set<string>, limit = 4, now = Date.now()): SrsItem[] {
  return Object.values(meta.srs)
    .filter((i) => i.dueAt <= now && allowedLessonIds.has(i.lessonId) && /:(p\d+|f):/.test(i.qid))
    .sort((a, b) => a.box - b.box || a.dueAt - b.dueAt)
    .slice(0, limit);
}
