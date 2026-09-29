import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { readAudio } from "@/lib/eleven";

export const dynamic = "force-dynamic";

/** Serves cached audio from the private Blob store, with Range support (needed by Safari / seeking). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const { key } = await ctx.params;
  const buf = await readAudio(key);
  if (!buf) return new NextResponse("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? parseInt(range[1], 10) : 0;
    const end = range[2] ? Math.min(parseInt(range[2], 10), buf.length - 1) : buf.length - 1;
    if (start >= buf.length || start > end) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${buf.length}` } });
    const chunk = buf.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${buf.length}`, "Content-Length": String(chunk.length) },
    });
  }
  return new NextResponse(new Uint8Array(buf), { headers: { ...headers, "Content-Length": String(buf.length) } });
}
