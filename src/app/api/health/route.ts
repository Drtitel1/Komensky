import { NextResponse } from "next/server";
import { MODEL, CHECK_MODEL } from "@/lib/gemini";
import { ttsConfig } from "@/lib/eleven";

export const dynamic = "force-dynamic";

/** Reports which settings are present (never their values). */
export async function GET() {
  const t = ttsConfig();
  return NextResponse.json({
    ok: true,
    mock: process.env.MOCK_AI === "1",
    gemini: { key: !!process.env.GEMINI_API_KEY, model: MODEL(), checkModel: CHECK_MODEL() },
    elevenlabs: { key: !!process.env.ELEVENLABS_API_KEY, voiceId: !!t.voiceId, model: t.modelId },
    storage: process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local-fs (dev only)",
    accessCode: !!process.env.ACCESS_CODE,
  });
}
