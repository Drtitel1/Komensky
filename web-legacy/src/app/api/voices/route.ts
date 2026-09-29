import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { creds, withCreds } from "@/lib/creds";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Lists the ElevenLabs voices available to the given API key. */
export const GET = withCreds(async (req: NextRequest) => {
  const denied = guard(req);
  if (denied) return denied;
  const key = creds().elevenKey;
  if (!key) return NextResponse.json({ error: "Chybí ElevenLabs API klíč." }, { status: 400 });
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
    if (!res.ok) return NextResponse.json({ error: `ElevenLabs ${res.status}` }, { status: 502 });
    const data = (await res.json()) as { voices?: { voice_id: string; name: string; labels?: Record<string, string> }[] };
    const voices = (data.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, hint: [v.labels?.language, v.labels?.accent, v.labels?.gender].filter(Boolean).join(", ") }));
    return NextResponse.json({ voices });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
