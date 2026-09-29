import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { creds, withCreds } from "@/lib/creds";

export const maxDuration = 15;
export const dynamic = "force-dynamic";

/**
 * Mints a short-lived single-use token so the browser can open ElevenLabs' realtime speech-to-text
 * WebSocket directly (lowest latency) without ever seeing the API key.
 */
export const POST = withCreds(async (req: NextRequest) => {
  const denied = guard(req);
  if (denied) return denied;
  if (process.env.MOCK_AI === "1") return NextResponse.json({ token: "mock" });
  const key = creds().elevenKey;
  if (!key) return NextResponse.json({ error: "Chybí ElevenLabs API klíč (Nastavení)." }, { status: 400 });
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", { method: "POST", headers: { "xi-api-key": key } });
    if (!res.ok) return NextResponse.json({ error: `ElevenLabs ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` }, { status: 502 });
    const data = (await res.json()) as { token?: string };
    if (!data.token) return NextResponse.json({ error: "ElevenLabs nevrátil token." }, { status: 502 });
    return NextResponse.json({ token: data.token });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
