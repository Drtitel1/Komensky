"use client";

import { useEffect, useRef, useState } from "react";
import { settingsHeaders } from "./api";
import { startMic, type MicSession } from "./mic";
import { ttsUrl } from "./tts";

interface Msg {
  role: "child" | "teacher";
  text: string;
}

/** "Ask the teacher": voice or text question -> answer from the lesson's source, spoken sentence by sentence. */
export default function Ask({ lessonId }: { lessonId: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mic, setMic] = useState<"idle" | "connecting" | "listening">("idle");
  const [partial, setPartial] = useState("");
  const [chat, setChat] = useState(false); // continuous conversation: listen again after every answer
  const [err, setErr] = useState<string | null>(null);
  const micRef = useRef<MicSession | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chatRef = useRef(false);
  const history = useRef<{ q: string; a: string }[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  chatRef.current = chat;

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs, partial]);
  useEffect(
    () => () => {
      micRef.current?.cancel();
      audioRef.current?.pause();
    },
    [],
  );

  const stopSpeaking = () => {
    audioRef.current?.pause();
    audioRef.current = null;
  };

  const play = (url: string) =>
    new Promise<void>((resolve) => {
      const a = new Audio(url);
      audioRef.current = a;
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });

  const listen = async () => {
    if (mic !== "idle") return void micRef.current?.stop();
    stopSpeaking();
    setErr(null);
    setPartial("");
    try {
      micRef.current = await startMic({
        onState: setMic,
        onPartial: setPartial,
        onFinal: (t) => {
          micRef.current = null;
          setMic("idle");
          setPartial("");
          if (t) void ask(t);
          else setErr("Nic jsem neslyšela, zkus to ještě jednou.");
        },
        onError: (m) => {
          micRef.current = null;
          setMic("idle");
          setErr(`Mikrofon nefunguje: ${m}`);
        },
      });
    } catch {
      setMic("idle");
      setErr("Nepodařilo se zapnout mikrofon (povol ho v prohlížeči).");
    }
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    window.dispatchEvent(new Event("komensky:pause"));
    stopSpeaking();
    setBusy(true);
    setErr(null);
    setInput("");
    setMsgs((m) => [...m, { role: "child", text: q }, { role: "teacher", text: "" }]);
    let answer = "";
    let chain: Promise<void> = Promise.resolve();
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...settingsHeaders() },
        body: JSON.stringify({ lessonId, question: q, history: history.current }),
        cache: "no-store",
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const o = JSON.parse(line) as { s?: string; error?: string };
          if (o.error) throw new Error(o.error);
          if (o.s) {
            answer += (answer ? " " : "") + o.s;
            const shown = answer;
            setMsgs((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, text: shown } : x)));
            // start converting this sentence right away, play in order
            const url = ttsUrl(o.s);
            chain = chain.then(async () => {
              try {
                await play(await url);
              } catch {
                /* voice unavailable: the text is still shown */
              }
            });
          }
        }
      }
      history.current = [...history.current, { q, a: answer }].slice(-4);
      await chain;
    } catch (e) {
      setErr(`Nepovedlo se: ${(e as Error).message}`);
    }
    setBusy(false);
    if (chatRef.current) void listen();
  };

  if (!open)
    return (
      <button
        onClick={() => {
          window.dispatchEvent(new Event("komensky:pause"));
          setOpen(true);
        }}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-brand px-5 py-3 text-lg font-bold text-white shadow-lg active:scale-95"
      >
        💬 Zeptej se
      </button>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl bg-white p-4 sm:rounded-3xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xl font-extrabold">💬 Zeptej se učitele</h3>
          <button
            onClick={() => {
              micRef.current?.cancel();
              micRef.current = null;
              setMic("idle");
              stopSpeaking();
              setChat(false);
              setOpen(false);
            }}
            className="rounded-full bg-brand-soft px-3 py-1 font-bold"
          >
            ✕
          </button>
        </div>

        <div className="mb-3 flex-1 space-y-2 overflow-y-auto rounded-2xl bg-bg p-3" style={{ minHeight: "30vh" }}>
          {msgs.length === 0 && <p className="text-ink/60">Zeptej se na cokoli z dnešní lekce – hlasem 🎤 nebo napsáním. Učitel ti odpoví jen podle toho, co se učíme.</p>}
          {msgs.map((m, i) => (
            <p key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 ${m.role === "child" ? "ml-auto bg-brand text-white" : "bg-white shadow-sm"}`}>
              {m.text || "…"}
            </p>
          ))}
          {partial && <p className="ml-auto max-w-[85%] rounded-2xl bg-brand/60 px-3 py-2 text-white">{partial}</p>}
          <div ref={endRef} />
        </div>

        {err && <p className="mb-2 rounded-xl bg-bad-soft p-2 text-sm text-bad">{err}</p>}

        <button
          onClick={listen}
          disabled={busy}
          className={`mb-2 w-full rounded-2xl px-4 py-3 text-xl font-bold ${mic === "idle" ? "bg-brand text-white" : "bg-bad text-white"}`}
        >
          {mic === "idle" ? "🎤 Mluv" : mic === "connecting" ? "🎤 Připojuji… mluv klidně" : "⏹ Poslouchám… (klepni pro konec)"}
        </button>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void ask(input)}
            placeholder="…nebo napiš otázku"
            className="min-w-0 flex-1 rounded-xl border-2 border-brand-soft px-3 py-2 outline-none focus:border-brand"
          />
          <button onClick={() => ask(input)} disabled={busy || !input.trim()} className="rounded-xl bg-good px-4 py-2 font-bold text-white">
            Poslat
          </button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={chat} onChange={(e) => setChat(e.target.checked)} />
          Průběžný rozhovor (po odpovědi se mikrofon zapne sám)
        </label>
      </div>
    </div>
  );
}
