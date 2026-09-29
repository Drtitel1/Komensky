import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const COOKIE = "komensky_access";

function token(code: string) {
  return createHash("sha256").update("komensky:" + code).digest("hex");
}

export function accessRequired() {
  return !!process.env.ACCESS_CODE;
}

export function makeToken() {
  return token(process.env.ACCESS_CODE ?? "");
}

export function codeMatches(input: string) {
  const a = Buffer.from(token(input));
  const b = Buffer.from(makeToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Returns a 401 response when an access code is configured and the cookie is missing/wrong. */
export function guard(req: NextRequest): NextResponse | null {
  if (!accessRequired()) return null;
  if (req.cookies.get(COOKIE)?.value === makeToken()) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
