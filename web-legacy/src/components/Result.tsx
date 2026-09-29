"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api";

interface FinishResponse {
  completed: boolean;
  passed?: boolean;
  pct?: number;
  next?: string | null;
  reviewRound?: number;
  wrongCount?: number;
  moveOnAnyway?: boolean;
}

interface Props {
  lessonId: string;
  kind: "final" | "review";
  onNext: () => void;
  onReviewReady: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Result({ lessonId, kind, onNext, onReviewReady }: Props) {
  const [res, setRes] = useState<FinishResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState(10);
  const [tries, setTries] = useState(0);
  const [nonce, setNonce] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const r = await api<FinishResponse>("/api/finish", { json: { lessonId, kind } });
        setRes(r);
        if (!r.completed) {
          // below 75 %: build the review part (one small attempt per call)
          for (let n = 0; n < 12; n++) {
            setTries(n);
            const g = await api<{ status: string }>("/api/review", { json: { lessonId } });
            if (g.status === "ready") return onReviewReady();
            await sleep(500);
          }
          throw new Error("Opakování se nepodařilo připravit.");
        }
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [lessonId, kind, onReviewReady, nonce]);

  // automatic move to the next lesson
  useEffect(() => {
    if (!res?.completed) return;
    if (count <= 0) return onNext();
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [res, count, onNext]);

  const pct = res?.pct != null ? Math.round(res.pct * 100) : null;

  if (err)
    return (
      <div className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
        <p className="mb-3 text-bad">Něco se nepovedlo ({err}).</p>
        <button
          className="rounded-2xl bg-brand px-6 py-3 text-lg font-bold text-white"
          onClick={() => {
            started.current = false;
            setErr(null);
            setRes(null);
            setTries(0);
            setNonce((n) => n + 1);
          }}
        >
          Zkusit znovu
        </button>
      </div>
    );

  if (!res)
    return <div className="rounded-3xl bg-white p-8 text-center text-lg shadow-sm ring-1 ring-black/5">Počítám výsledek…</div>;

  if (res.completed)
    return (
      <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
        <div className="text-6xl">{res.moveOnAnyway ? "💪" : "🎉"}</div>
        <h2 className="mt-2 text-3xl font-extrabold">{res.moveOnAnyway ? "Jdeme dál!" : "Lekce splněna!"}</h2>
        {pct !== null && <p className="mt-2 text-xl">Výsledek: {pct} %</p>}
        {res.moveOnAnyway && <p className="mt-2 text-ink/70">Některé příklady si ještě zopakujeme na začátku dalších lekcí.</p>}
        {res.next ? (
          <>
            <p className="mt-4 text-ink/70">Další lekce začne za {Math.max(count, 0)} s…</p>
            <button onClick={onNext} className="mt-3 rounded-2xl bg-good px-6 py-4 text-xl font-bold text-white shadow-md active:scale-95">
              Začít další lekci →
            </button>
          </>
        ) : (
          <p className="mt-4 text-xl font-bold">Dokončila jsi celý kurz! 🏆</p>
        )}
      </div>
    );

  return (
    <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
      <div className="text-5xl">📚</div>
      <h2 className="mt-2 text-2xl font-extrabold">Máš {pct} %. Ještě to potřebuje trochu procvičit.</h2>
      <p className="mt-2 text-ink/70">
        K postupu dál je potřeba aspoň 75 %. Připravuji krátké opakování jen toho, co se nepovedlo…
      </p>
      <div className="mx-auto mt-4 h-3 w-48 overflow-hidden rounded-full bg-brand-soft">
        <div className="h-full animate-pulse rounded-full bg-brand" style={{ width: `${Math.min(100, 20 + tries * 20)}%` }} />
      </div>
    </div>
  );
}
