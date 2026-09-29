import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { ALL_LESSONS, STAGES, nextLessonId, SUBJECT } from "@/curriculum";
import { currentLessonId, loadMeta, loadPosition, savePosition } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  const meta = await loadMeta();
  const current = currentLessonId(meta);
  const pos = await loadPosition();
  return NextResponse.json({
    subject: SUBJECT,
    currentLessonId: current,
    nextLessonId: current ? nextLessonId(current) : null,
    completed: meta.completed,
    position: pos && pos.lessonId === current ? pos : null,
    srsCount: Object.keys(meta.srs).length,
    stages: STAGES.map((s) => ({ id: s.id, title: s.title, lessons: s.lessons.map((l) => ({ id: l.id, title: l.title })) })),
    total: ALL_LESSONS.length,
  });
}

export async function PUT(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.lessonId !== "string" || typeof b.stepKey !== "string") return NextResponse.json({ error: "bad request" }, { status: 400 });
  await savePosition({
    lessonId: b.lessonId,
    stepKey: b.stepKey,
    segmentIndex: Number(b.segmentIndex) || 0,
    time: Number(b.time) || 0,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
