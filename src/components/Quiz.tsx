"use client";

import { useEffect, useRef, useState } from "react";
import { api, type PublicQuestion, type Revealed } from "./api";

interface Props {
  questions: PublicQuestion[];
  answered: Record<string, Revealed>;
  onAnswered: (qid: string, r: Revealed) => void;
  onDone: () => void;
  warmup?: boolean;
  doneLabel: string;
}

const fmtQ = (q: PublicQuestion) =>
  q.prompt + (q.options ? " " + q.options.map((o, i) => `Možnost ${String.fromCharCode(65 + i)}: ${o}.`).join(" ") : "");

export default function Quiz({ questions, answered, onAnswered, onDone, warmup, doneLabel }: Props) {
  const firstOpen = questions.findIndex((q) => !answered[q.id]);
  const [i, setI] = useState(firstOpen === -1 ? questions.length : firstOpen);
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  const q = questions[i];
  const res = q ? answered[q.id] : undefined;

  useEffect(() => {
    setChoice(null);
    setText("");
    setErr(null);
    return () => audio.current?.pause();
  }, [i]);

  const speak = async () => {
    if (!q) return;
    setSpeaking(true);
    try {
      const { url } = await api<{ url: string }>("/api/tts", { json: { text: fmtQ(q) } });
      audio.current?.pause();
      audio.current = new Audio(url);
      audio.current.onended = () => setSpeaking(false);
      await audio.current.play();
    } catch {
      setSpeaking(false);
      setErr("Hlas teď není k dispozici, přečti si otázku sama.");
    }
  };

  const submit = async () => {
    if (!q) return;
    const given = q.type === "mc" ? String(choice) : text.trim();
    if (!given || given === "null") return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<Revealed>("/api/grade", { json: { qid: q.id, given, warmup: !!warmup } });
      onAnswered(q.id, r);
    } catch (e) {
      setErr((e as Error).message === "Failed to fetch" ? "Chybí připojení, zkus to znovu." : "Něco se nepovedlo, zkus to znovu.");
    } finally {
      setBusy(false);
    }
  };

  if (!q) {
    const total = questions.reduce((s, x) => s + (answered[x.id]?.score ?? 0), 0);
    return (
      <div className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
        <p className="mb-2 text-2xl font-bold">
          {total === questions.length ? "Všechno správně! 🌟" : `Hotovo – ${total % 1 ? total.toFixed(1) : total} z ${questions.length} bodů`}
        </p>
        <button onClick={onDone} className="mt-3 rounded-2xl bg-good px-6 py-4 text-xl font-bold text-white shadow-md active:scale-95">
          {doneLabel} →
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-ink/60">
        <span>
          Otázka {i + 1} z {questions.length}
        </span>
        <div className="flex gap-1">
          {questions.map((x, k) => (
            <span
              key={x.id}
              className={`h-2.5 w-6 rounded-full ${answered[x.id] ? (answered[x.id].score === 1 ? "bg-good" : answered[x.id].score > 0 ? "bg-warm" : "bg-bad") : k === i ? "bg-brand" : "bg-brand-soft"}`}
            />
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="text-xl font-semibold leading-snug">{q.prompt}</p>
          <button onClick={speak} disabled={speaking} className="shrink-0 rounded-full bg-brand-soft px-3 py-2 text-lg" aria-label="Přečíst nahlas">
            {speaking ? "🔊…" : "🔊"}
          </button>
        </div>

        {q.type === "mc" ? (
          <div className="flex flex-col gap-3">
            {q.options!.map((o, k) => {
              const revealed = !!res;
              const isGiven = res && Number(res.given) === k;
              const isCorrect = res && res.correctAnswer === o;
              return (
                <button
                  key={k}
                  disabled={revealed || busy}
                  onClick={() => setChoice(k)}
                  className={`rounded-2xl border-2 px-4 py-3 text-left text-lg font-medium transition ${
                    revealed
                      ? isCorrect
                        ? "border-good bg-good-soft"
                        : isGiven
                          ? "border-bad bg-bad-soft"
                          : "border-transparent bg-brand-soft/50"
                      : choice === k
                        ? "border-brand bg-brand-soft"
                        : "border-transparent bg-brand-soft/60 hover:bg-brand-soft"
                  }`}
                >
                  <span className="mr-2 font-bold text-brand">{String.fromCharCode(65 + k)}</span>
                  {o}
                </button>
              );
            })}
          </div>
        ) : q.type === "short" ? (
          <input
            value={res ? res.given : text}
            onChange={(e) => setText(e.target.value)}
            disabled={!!res || busy}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            inputMode="text"
            autoComplete="off"
            placeholder="Napiš odpověď…"
            className="w-full rounded-2xl border-2 border-brand-soft bg-white px-4 py-3 text-xl outline-none focus:border-brand"
          />
        ) : (
          <textarea
            value={res ? res.given : text}
            onChange={(e) => setText(e.target.value)}
            disabled={!!res || busy}
            rows={4}
            placeholder="Vysvětli to vlastními slovy…"
            className="w-full rounded-2xl border-2 border-brand-soft bg-white px-4 py-3 text-lg outline-none focus:border-brand"
          />
        )}

        {err && <p className="mt-3 text-sm text-bad">{err}</p>}

        {!res ? (
          <button
            onClick={submit}
            disabled={busy || (q.type === "mc" ? choice === null : !text.trim())}
            className="mt-4 w-full rounded-2xl bg-brand px-6 py-3 text-xl font-bold text-white shadow-md active:scale-95"
          >
            {busy ? "Kontroluji…" : "Odpovědět"}
          </button>
        ) : (
          <div className={`mt-4 rounded-2xl p-4 ${res.score === 1 ? "bg-good-soft" : res.score > 0 ? "bg-warm/25" : "bg-bad-soft"}`}>
            <p className="text-lg font-bold">{res.score === 1 ? "✅ Správně!" : res.score > 0 ? "🟡 Skoro!" : "❌ Tentokrát ne"}</p>
            {res.feedback && <p className="mt-1">{res.feedback}</p>}
            {res.score < 1 && (
              <p className="mt-2">
                <b>Správná odpověď:</b> {res.correctAnswer}
              </p>
            )}
            <p className="mt-2 text-ink/80">{res.explanation}</p>
            <details className="mt-2 text-sm text-ink/60">
              <summary className="cursor-pointer">Kde to je v učivu</summary>
              <p className="mt-1">{res.source}</p>
            </details>
            <button
              onClick={() => (i + 1 < questions.length ? setI(i + 1) : onDone())}
              className="mt-4 w-full rounded-2xl bg-good px-6 py-3 text-xl font-bold text-white shadow-md active:scale-95"
            >
              {i + 1 < questions.length ? "Další otázka →" : "Hotovo →"}
            </button>
          </div>
        )}
      </div>
      {warmup && <p className="text-center text-sm text-ink/50">Rozcvička: opakování z dřívějších lekcí.</p>}
    </div>
  );
}
