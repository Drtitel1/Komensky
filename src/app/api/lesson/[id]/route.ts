import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getLesson, getStage } from "@/curriculum";
import { progressOf } from "@/lib/generation";
import { dueItems } from "@/lib/srs";
import { earlierLessons } from "@/curriculum";
import {
  currentLessonId, findQuestion, loadAttempts, loadLesson, loadMeta, publicPart, publicQuestion, reveal, saveAttempts, type RevealedAnswer,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const def = getLesson(id);
  if (!def) return NextResponse.json({ error: "unknown lesson" }, { status: 404 });

  const meta = await loadMeta();
  const cur = currentLessonId(meta);
  if (!meta.completed.includes(id) && id !== cur) return NextResponse.json({ error: "lesson not unlocked" }, { status: 403 });

  const content = await loadLesson(id);
  if (!content || content.status !== "ready") {
    return NextResponse.json({ status: "generating", progress: content ? progressOf(content) : { done: 0, total: 8 } });
  }

  const attempts = await loadAttempts(id);

  // Warm-up: due spaced-repetition questions from EARLIER lessons, chosen once and then kept stable.
  if (id === cur && !attempts.warmupIds) {
    const allowed = new Set(earlierLessons(id).map((l) => l.id));
    attempts.warmupIds = dueItems(meta, allowed, 4).map((i) => i.qid);
    await saveAttempts(attempts);
  }
  const warmup = [];
  for (const qid of attempts.warmupIds ?? []) {
    const f = await findQuestion(qid);
    if (f) warmup.push(publicQuestion(f.q));
  }

  const answered: Record<string, RevealedAnswer> = {};
  const allQ = new Map([
    ...content.parts.flatMap((p) => p.questions),
    ...(content.finalQuiz ?? []),
    ...(attempts.reviewPart?.questions ?? []),
  ].map((q) => [q.id, q] as const));
  for (const rec of [attempts.answers, attempts.finalAnswers, attempts.reviewAnswers]) {
    for (const [qid, a] of Object.entries(rec)) if (allQ.has(qid)) answered[qid] = reveal(allQ.get(qid)!, a);
  }
  for (const [qid, a] of Object.entries(attempts.warmupAnswers)) {
    const f = await findQuestion(qid);
    if (f) answered[qid] = reveal(f.q, a);
  }

  return NextResponse.json({
    status: "ready",
    lessonId: id,
    title: def.title,
    stage: { id: def.stageId, title: getStage(def.stageId).title },
    parts: content.parts.map(publicPart),
    finalQuiz: (content.finalQuiz ?? []).map(publicQuestion),
    warmup,
    review: attempts.reviewPart ? publicPart(attempts.reviewPart) : null,
    reviewRound: attempts.reviewRound,
    reviewPending: attempts.reviewRound > 0 && !attempts.reviewPart && !attempts.completed,
    completed: attempts.completed,
    rounds: attempts.rounds,
    answered,
  });
}
