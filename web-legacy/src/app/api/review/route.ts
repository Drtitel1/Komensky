import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { withCreds } from "@/lib/creds";
import { attemptReview, buildReviewFromPacks, lessonPath } from "@/lib/generation";
import { writeJson } from "@/lib/blob";
import { loadAttempts, loadLesson, publicPart, saveAttempts } from "@/lib/store";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** One attempt at generating the review part. Client repeats while status = "retry". */
export const POST = withCreds(async (req: NextRequest) => {
  const denied = guard(req);
  if (denied) return denied;
  const { lessonId } = (await req.json().catch(() => ({}))) as { lessonId?: string };
  if (!lessonId) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const attempts = await loadAttempts(lessonId);
  if (attempts.completed || attempts.reviewRound < 1 || !attempts.pendingWrong?.length) return NextResponse.json({ error: "no review needed" }, { status: 400 });
  if (attempts.reviewPart) return NextResponse.json({ status: "ready", review: publicPart(attempts.reviewPart) });

  // Fast path: packs prepared in advance (already fact-checked) – nothing to generate, nothing to wait for.
  const prepared = await loadLesson(lessonId);
  if (prepared) {
    const part = buildReviewFromPacks(prepared, attempts.pendingWrong, attempts.reviewRound);
    if (part) {
      attempts.reviewPart = part;
      attempts.reviewRetry = undefined;
      await saveAttempts(attempts);
      return NextResponse.json({ status: "ready", review: publicPart(part) });
    }
  }

  try {
    const retry = attempts.reviewRetry ?? { attempts: 0, issues: [] };
    const res = await attemptReview(lessonId, attempts.pendingWrong, attempts.reviewRound, retry.issues, retry.attempts);
    if (res.part) {
      attempts.reviewPart = res.part;
      attempts.reviewRetry = undefined;
      await saveAttempts(attempts);
      if (res.flag) {
        const lesson = await loadLesson(lessonId);
        if (lesson) {
          lesson.flags.push({ at: new Date().toISOString(), where: `opakování ${attempts.reviewRound}`, issues: res.flag });
          await writeJson(lessonPath(lessonId), lesson);
        }
      }
      return NextResponse.json({ status: "ready", review: publicPart(res.part) });
    }
    attempts.reviewRetry = { attempts: retry.attempts + 1, issues: res.issues };
    await saveAttempts(attempts);
    return NextResponse.json({ status: "retry" });
  } catch (e) {
    console.error("review failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
