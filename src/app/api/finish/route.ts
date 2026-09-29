import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { nextLessonId } from "@/curriculum";
import { currentLessonId, loadAttempts, loadLesson, loadMeta, saveAttempts, saveMeta } from "@/lib/store";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";

const PASS = 0.75;
const MAX_REVIEW_ROUNDS = 3; // after this the lesson moves on and the weak items stay in the spaced-repetition queue

/** Called when the final quiz (kind "final") or a review retest (kind "review") has been fully answered. */
export async function POST(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  const { lessonId, kind } = (await req.json().catch(() => ({}))) as { lessonId?: string; kind?: "final" | "review" };
  if (!lessonId || (kind !== "final" && kind !== "review")) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const meta = await loadMeta();
  if (currentLessonId(meta) !== lessonId && !meta.completed.includes(lessonId)) return NextResponse.json({ error: "lesson not current" }, { status: 403 });
  const [lesson, attempts] = await Promise.all([loadLesson(lessonId), loadAttempts(lessonId)]);
  if (!lesson?.finalQuiz) return NextResponse.json({ error: "lesson not ready" }, { status: 400 });

  const respond = () => ({ lessonId, completed: true, next: nextLessonId(lessonId), rounds: attempts.rounds });
  if (attempts.completed) return NextResponse.json(respond());

  // Idempotency: a repeated call must not re-score or reset an already-started review.
  if (kind === "final" && attempts.reviewRound > 0) {
    const first = attempts.rounds[0];
    return NextResponse.json({ lessonId, completed: false, passed: false, pct: first?.pct ?? 0, reviewRound: attempts.reviewRound, wrongCount: attempts.pendingWrong?.length ?? 0 });
  }
  if (kind === "review" && !attempts.reviewPart) {
    const last = attempts.rounds[attempts.rounds.length - 1];
    return NextResponse.json({ lessonId, completed: false, passed: false, pct: last?.pct ?? 0, reviewRound: attempts.reviewRound, wrongCount: attempts.pendingWrong?.length ?? 0 });
  }

  let questions: Question[];
  let answers;
  if (kind === "final") {
    questions = lesson.finalQuiz;
    answers = attempts.finalAnswers;
  } else {
    if (!attempts.reviewPart) return NextResponse.json({ error: "no review part" }, { status: 400 });
    questions = attempts.reviewPart.questions;
    answers = attempts.reviewAnswers;
  }
  if (questions.some((q) => !answers[q.id])) return NextResponse.json({ error: "unanswered questions remain" }, { status: 400 });

  const score = questions.reduce((s, q) => s + answers[q.id].score, 0);
  const pct = score / questions.length;
  const wrong = questions.filter((q) => answers[q.id].score < 1);
  const round = attempts.reviewRound;
  attempts.rounds.push({ round: kind === "final" ? 0 : round, pct, wrongIds: wrong.map((q) => q.id), at: new Date().toISOString() });

  const passed = pct >= PASS;
  const giveUp = !passed && kind === "review" && round >= MAX_REVIEW_ROUNDS;

  if (passed || giveUp) {
    attempts.completed = true;
    attempts.completedAt = new Date().toISOString();
    attempts.masteredWithFlag = giveUp || undefined;
    attempts.pendingWrong = undefined;
    if (!meta.completed.includes(lessonId)) meta.completed.push(lessonId);
    await Promise.all([saveAttempts(attempts), saveMeta(meta)]);
    return NextResponse.json({ ...respond(), passed, pct, moveOnAnyway: giveUp });
  }

  // Below 75 %: build a review part from the wrong questions, then retest.
  attempts.reviewRound = round + 1;
  attempts.reviewPart = undefined;
  attempts.reviewRetry = undefined;
  attempts.pendingWrong = wrong;
  await saveAttempts(attempts);
  return NextResponse.json({ lessonId, completed: false, passed: false, pct, reviewRound: attempts.reviewRound, wrongCount: wrong.length });
}
