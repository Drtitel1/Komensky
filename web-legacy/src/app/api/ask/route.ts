import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { withCreds } from "@/lib/creds";
import { getLesson } from "@/curriculum";
import { ai, CHAT_MODEL } from "@/lib/gemini";
import { priorKnowledge, SYSTEM_ASK, sourceBlock } from "@/lib/prompts";
import { splitSentences } from "@/lib/speech";
import { currentLessonId, loadMeta } from "@/lib/store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * "Ask the teacher": answers from the lesson's source material only.
 * Streams NDJSON – one {"s": "<sentence>"} line per finished sentence – so the browser can start
 * speaking the first sentence while the rest is still being written.
 */
export const POST = withCreds(async (req: NextRequest) => {
  const denied = guard(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => null)) as { lessonId?: string; question?: string; history?: { q: string; a: string }[] } | null;
  const question = (b?.question ?? "").trim().slice(0, 300);
  const lesson = b?.lessonId ? getLesson(b.lessonId) : undefined;
  if (!lesson || !question) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const meta = await loadMeta();
  if (currentLessonId(meta) !== lesson.id && !meta.completed.includes(lesson.id)) return NextResponse.json({ error: "lesson not unlocked" }, { status: 403 });

  const history = (b?.history ?? []).slice(-3).map((h) => `Dítě: ${String(h.q).slice(0, 200)}\nUčitel: ${String(h.a).slice(0, 300)}`).join("\n");
  const prompt = `${sourceBlock(lesson)}\n\n${priorKnowledge(lesson.id)}\n\n${history ? `DOSAVADNÍ ROZHOVOR:\n${history}\n\n` : ""}Dítě se ptá: ${JSON.stringify(question)}\nOdpověz jako učitel.`;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        if (process.env.MOCK_AI === "1") {
          for (const s of ["To je dobrá otázka.", "Násobení je zkrácený zápis opakovaného sčítání."]) send({ s });
          send({ done: true });
          return controller.close();
        }
        const res = await ai().models.generateContentStream({
          model: CHAT_MODEL(),
          contents: prompt,
          config: { systemInstruction: SYSTEM_ASK, temperature: 0.3, maxOutputTokens: 300 },
        });
        let buf = "";
        for await (const chunk of res) {
          buf += chunk.text ?? "";
          // flush every complete sentence as soon as it exists
          const parts = splitSentences(buf);
          if (parts.length > 1) {
            for (const s of parts.slice(0, -1)) send({ s });
            buf = parts[parts.length - 1];
          }
        }
        if (buf.trim()) for (const s of splitSentences(buf)) send({ s });
        send({ done: true });
      } catch (e) {
        send({ error: (e as Error).message });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
});
