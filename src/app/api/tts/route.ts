import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { withCreds } from "@/lib/creds";
import { ensureAudio } from "@/lib/eleven";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Converts ONE segment/question to speech (cached in Blob by content hash) and returns its playback URL. */
export const POST = withCreds(async (req: NextRequest) => {
  const denied = guard(req);
  if (denied) return denied;
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text || typeof text !== "string" || text.length > 1500) return NextResponse.json({ error: "bad text" }, { status: 400 });
  try {
    const key = await ensureAudio(text);
    return NextResponse.json({ url: `/api/audio/${key}` });
  } catch (e) {
    console.error("tts failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
