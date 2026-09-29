import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { withCreds } from "@/lib/creds";
import { ai } from "@/lib/gemini";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Lists the Gemini models the given API key can use for text generation. */
export const GET = withCreds(async (req: NextRequest) => {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const names: string[] = [];
    const pager = await ai().models.list();
    for await (const m of pager) {
      const name = (m.name ?? "").replace(/^models\//, "");
      const actions = m.supportedActions ?? [];
      if (name.startsWith("gemini") && (actions.length === 0 || actions.includes("generateContent"))) names.push(name);
    }
    names.sort();
    return NextResponse.json({ models: names });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
