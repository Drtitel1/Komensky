import { NextRequest, NextResponse } from "next/server";
import { MODEL, CHECK_MODEL } from "@/lib/gemini";
import { creds, withCreds } from "@/lib/creds";
import { ttsConfig } from "@/lib/eleven";

export const dynamic = "force-dynamic";

/** Reports which settings are present (never their values). Uses the caller's browser settings too. */
export const GET = withCreds(async (_req: NextRequest) => {
  const t = ttsConfig();
  const c = creds();
  return NextResponse.json({
    ok: true,
    mock: process.env.MOCK_AI === "1",
    gemini: { key: !!c.geminiKey || process.env.MOCK_AI === "1", model: MODEL(), checkModel: CHECK_MODEL() },
    elevenlabs: { key: !!c.elevenKey || process.env.MOCK_AI === "1", voiceId: !!t.voiceId || process.env.MOCK_AI === "1", model: t.modelId },
    storage: process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local-fs (dev only)",
    accessCode: !!process.env.ACCESS_CODE,
  });
});
