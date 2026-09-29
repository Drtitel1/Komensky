import { NextRequest, NextResponse } from "next/server";
import { accessRequired, codeMatches, COOKIE, makeToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const required = accessRequired();
  return NextResponse.json({ required, ok: !required || req.cookies.get(COOKIE)?.value === makeToken() });
}

export async function POST(req: NextRequest) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!accessRequired()) return NextResponse.json({ ok: true });
  if (!code || !codeMatches(code.trim())) return NextResponse.json({ ok: false }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeToken(), { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
