import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { withCreds } from "@/lib/creds";
import { getLesson, nextLessonId } from "@/curriculum";
import { progressOf, reviewsProgress, stepLesson, stepReviewPack } from "@/lib/generation";
import { currentLessonId, loadMeta } from "@/lib/store";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Runs ONE small generation step and reports progress; the client calls it repeatedly until status = ready. */
export const POST = withCreds(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!getLesson(id)) return NextResponse.json({ error: "unknown lesson" }, { status: 404 });

  // Only the current lesson (and the one right after it, for pre-generation) may be generated.
  const meta = await loadMeta();
  const cur = currentLessonId(meta);
  const allowed = cur && (id === cur || id === nextLessonId(cur));
  if (!allowed && !meta.completed.includes(id)) return NextResponse.json({ error: "lesson not unlocked" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { reviews?: boolean };

  try {
    if (body.reviews) {
      // Background step: prepare the review packs of an already finished lesson.
      const r = await stepReviewPack(id);
      return NextResponse.json({ status: "ready", busy: r.busy, reviewsDone: r.done, reviews: reviewsProgress(r.content) });
    }
    const { content, busy } = await stepLesson(id);
    return NextResponse.json({
      status: content.status,
      busy,
      progress: progressOf(content),
      flags: content.flags.length,
      reviews: reviewsProgress(content),
    });
  } catch (e) {
    console.error("generate failed", id, e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
