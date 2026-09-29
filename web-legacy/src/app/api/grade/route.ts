import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { withCreds } from "@/lib/creds";
import { earlierLessons } from "@/curriculum";
import { gradeAnswer } from "@/lib/grading";
import { recordResult } from "@/lib/srs";
import { currentLessonId, findQuestion, loadAttempts, loadMeta, reveal, saveAttempts, saveMeta } from "@/lib/store";
import type { AnswerRecord } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const POST = withCreds(async (req: NextRequest) => {
  const denied = guard(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { qid?: string; given?: string; warmup?: boolean } | null;
  if (!body?.qid || typeof body.given !== "string") return NextResponse.json({ error: "bad request" }, { status: 400 });

  const found = await findQuestion(body.qid);
  if (!found) return NextResponse.json({ error: "unknown question" }, { status: 404 });
  const { q, lessonId } = found;

  const meta = await loadMeta();
  const cur = currentLessonId(meta);
  if (!cur) return NextResponse.json({ error: "course finished" }, { status: 400 });

  const isWarmup = !!body.warmup;
  // Where the answer is stored: warm-ups live in the CURRENT lesson's attempts, everything else in the question's lesson.
  const home = isWarmup ? cur : lessonId;
  if (!isWarmup && lessonId !== cur && !meta.completed.includes(lessonId)) return NextResponse.json({ error: "lesson not unlocked" }, { status: 403 });
  const attempts = await loadAttempts(home);

  let bucket: Record<string, AnswerRecord>;
  let context: AnswerRecord["context"];
  if (isWarmup) {
    if (!attempts.warmupIds?.includes(q.id) || !earlierLessons(cur).some((l) => l.id === lessonId)) {
      return NextResponse.json({ error: "not a warm-up question" }, { status: 400 });
    }
    bucket = attempts.warmupAnswers;
    context = "warmup";
  } else if (/:p\d+:/.test(q.id)) {
    bucket = attempts.answers;
    context = "part";
  } else if (/:f:/.test(q.id)) {
    bucket = attempts.finalAnswers;
    context = "final";
  } else {
    bucket = attempts.reviewAnswers;
    context = "review";
  }

  if (bucket[q.id]) return NextResponse.json(reveal(q, bucket[q.id])); // already answered – idempotent

  const g = await gradeAnswer(q, body.given);
  const rec: AnswerRecord = { given: body.given, score: g.score, correct: g.correct, feedback: g.feedback, at: new Date().toISOString(), context };
  bucket[q.id] = rec;
  await saveAttempts(attempts);

  if (context !== "review") {
    recordResult(meta, q.id, lessonId, g.score === 1);
    await saveMeta(meta);
  }
  return NextResponse.json(reveal(q, rec));
});
