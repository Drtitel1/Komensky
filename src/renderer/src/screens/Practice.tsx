import { useCallback, useEffect, useRef, useState } from "react";
import { answerOf, makeQuestions, PracticeRun, promptOf } from "@shared/practice";
import { btnPrimary, Card } from "../components/ui";

const KEY = "komensky.practice.v1";
interface Prefs {
  tables: number[];
  count: number;
  missing: boolean;
  best: Record<string, number>;
}
const DEFAULTS: Prefs = { tables: [2, 3, 4, 5], count: 20, missing: false, best: {} };

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
function save(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* per-user convenience only */
  }
}

type Stage = "setup" | "run" | "result";

export default function Practice({ onExit }: { onExit: () => void }) {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const [stage, setStage] = useState<Stage>("setup");
  const [run, setRun] = useState<PracticeRun | null>(null);
  const [, bump] = useState(0);
  const [input, setInputState] = useState("");
  /** mirrors `input` synchronously so fast typing + Enter never sees a stale value */
  const inRef = useRef("");
  const setInput = useCallback((v: string | ((p: string) => string)) => {
    inRef.current = typeof v === "function" ? v(inRef.current) : v;
    setInputState(inRef.current);
  }, []);
  const [fb, setFb] = useState<null | { ok: boolean; answer: number }>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const update = (p: Prefs) => {
    setPrefs(p);
    save(p);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const start = () => {
    const qs = makeQuestions({ tables: prefs.tables, count: prefs.count, missing: prefs.missing });
    if (!qs.length) return;
    setRun(new PracticeRun(qs));
    setInput("");
    setFb(null);
    setStage("run");
  };

  const finish = useCallback(
    (r: PracticeRun) => {
      const key = [...prefs.tables].sort((a, b) => a - b).join(",");
      const pct = Math.round(r.score * 100);
      update({ ...prefs, best: { ...prefs.best, [key]: Math.max(prefs.best[key] ?? 0, pct) } });
      setStage("result");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs],
  );

  const next = useCallback(() => {
    clearTimeout(timer.current);
    setFb(null);
    setInput("");
    if (run?.done) finish(run);
    else bump((n) => n + 1);
  }, [run, finish, setInput]);

  const submit = useCallback(() => {
    if (!run || fb || inRef.current === "") return;
    const q = run.current;
    if (!q) return;
    const ok = run.answer(Number(inRef.current));
    setFb({ ok, answer: answerOf(q) });
    if (ok) timer.current = setTimeout(next, 750);
  }, [run, fb, next]);

  useEffect(() => {
    if (stage !== "run") return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) setInput((v) => (fb || v.length >= 3 ? v : v + e.key));
      else if (e.key === "Backspace") setInput((v) => (fb ? v : v.slice(0, -1)));
      else if (e.key === "Enter") fb ? next() : submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, fb, next, submit, setInput]);

  /* ---------- setup ---------- */
  if (stage === "setup") {
    const toggle = (t: number) => update({ ...prefs, tables: prefs.tables.includes(t) ? prefs.tables.filter((x) => x !== t) : [...prefs.tables, t] });
    const chip = (on: boolean) => `h-16 w-16 rounded-full text-2xl font-extrabold transition active:scale-95 ${on ? "bg-brand text-white" : "bg-brand-soft text-ink"}`;
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
        <Card>
          <h2 className="text-3xl font-extrabold">Procvičování násobení</h2>
          <p className="mt-1 text-base opacity-70">Žádný učitel, žádný internet – jen počítání. Chyby se zeptáme ještě jednou.</p>

          <h3 className="mt-6 text-lg font-extrabold">Které řady chceš?</h3>
          <div className="mt-2 flex flex-wrap gap-3" data-testid="practice-tables">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((t) => (
              <button key={t} onClick={() => toggle(t)} aria-pressed={prefs.tables.includes(t)} className={chip(prefs.tables.includes(t))}>
                {t}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-3 text-base font-bold">
            <button className="underline" onClick={() => update({ ...prefs, tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })}>všechny</button>
            <button className="underline" onClick={() => update({ ...prefs, tables: [2, 3, 4, 5] })}>lehčí (2–5)</button>
            <button className="underline" onClick={() => update({ ...prefs, tables: [6, 7, 8, 9] })}>těžší (6–9)</button>
          </div>

          <h3 className="mt-6 text-lg font-extrabold">Kolik příkladů?</h3>
          <div className="mt-2 flex gap-3">
            {[10, 20, 30].map((n) => (
              <button key={n} onClick={() => update({ ...prefs, count: n })} className={`h-14 rounded-full px-7 text-xl font-extrabold ${prefs.count === n ? "bg-brand text-white" : "bg-brand-soft"}`}>
                {n}
              </button>
            ))}
          </div>

          <label className="mt-6 flex items-center gap-3 text-lg font-bold">
            <input type="checkbox" className="h-6 w-6 accent-[#b8321a]" checked={prefs.missing} onChange={(e) => update({ ...prefs, missing: e.target.checked })} />
            I s chybějícím číslem (např. ? × 4 = 20)
          </label>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button onClick={start} disabled={!prefs.tables.length} className={`${btnPrimary} px-10 py-4 text-2xl`} data-testid="practice-start">
              ▶ Začít
            </button>
            <button onClick={onExit} className="rounded-full bg-brand-soft px-7 py-3 text-lg font-extrabold">Zpět</button>
            {!prefs.tables.length && <span className="font-bold text-bad">Vyber aspoň jednu řadu.</span>}
          </div>
          {(() => {
            const b = prefs.best[[...prefs.tables].sort((a, c) => a - c).join(",")];
            return b !== undefined ? <p className="mt-4 text-base font-bold opacity-70">Tvůj nejlepší výsledek s těmito řadami: {b} %</p> : null;
          })()}
        </Card>
      </div>
    );
  }

  /* ---------- result ---------- */
  if (stage === "result" && run) {
    const pct = Math.round(run.score * 100);
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
        <Card className="text-center">
          <div className="text-6xl">{pct >= 90 ? "🏆" : pct >= 70 ? "🎉" : "💪"}</div>
          <h2 className="mt-2 text-4xl font-extrabold" data-testid="practice-score">{run.correct} z {run.asked} napoprvé</h2>
          <p className="mt-1 text-xl font-bold opacity-70">{pct} %</p>
          <p className="mt-3 text-lg">{pct >= 90 ? "Skvělé! Násobilku máš v malíku." : pct >= 70 ? "Pěkné! Ještě trochu procvičit a bude to dokonalé." : "Nevadí, procvičování dělá mistra. Zkusíme to ještě jednou."}</p>
          {run.mistakes.length > 0 && (
            <div className="mt-5 rounded-3xl bg-brand-soft p-4 text-left">
              <p className="font-extrabold">Tady to příště pohlídej:</p>
              <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-lg font-bold tabular-nums">
                {run.mistakes.map((q, i) => (
                  <li key={i}>{q.a} × {q.b} = {q.a * q.b}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <button onClick={start} className={`${btnPrimary} px-8`}>Ještě jednou</button>
            <button onClick={() => setStage("setup")} className="rounded-full bg-brand-soft px-7 py-3 text-lg font-extrabold">Jiné řady</button>
            <button onClick={onExit} className="rounded-full bg-brand-soft px-7 py-3 text-lg font-extrabold">Domů</button>
          </div>
        </Card>
      </div>
    );
  }

  /* ---------- run ---------- */
  const q = run?.current;
  if (!run || !q) return null;
  const doneN = run.total - run.remaining;
  const parts = promptOf(q).split("?");
  const pad = (k: string) => () => (fb ? undefined : setInput((v) => (v.length >= 3 ? v : v + k)));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <Card>
        <div className="flex items-center gap-4">
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-brand-soft">
            <div className="h-full rounded-full bg-warm" style={{ width: `${(doneN / run.total) * 100}%`, boxShadow: "inset 0 0 0 2px #b8321a" }} />
          </div>
          <span className="text-lg font-extrabold tabular-nums">{Math.min(doneN + 1, run.total)} / {run.total}</span>
          <button onClick={() => setStage("setup")} className="rounded-full bg-brand-soft px-5 py-2 font-extrabold">konec</button>
        </div>

        <div className="my-8 flex items-center justify-center gap-4 text-7xl font-extrabold tabular-nums" data-testid="practice-prompt" aria-live="polite">
          <span>{parts[0]}</span>
          <span
            data-testid="practice-input"
            className={`flex h-24 min-w-[7rem] items-center justify-center rounded-[28px] px-4 ${fb ? (fb.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad") : "bg-brand-soft"}`}
          >
            {input || " "}
          </span>
          <span>{parts[1]}</span>
        </div>

        {fb && (
          <p className="mb-4 text-center text-2xl font-extrabold" data-testid="practice-feedback">
            {fb.ok ? "Správně! 🎉" : <>Správně je <span className="text-bad">{fb.answer}</span>. Zeptám se ještě jednou.</>}
          </p>
        )}

        <div className="mx-auto grid max-w-sm grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
            <button key={k} onClick={pad(k)} className="h-16 rounded-full bg-brand-soft text-3xl font-extrabold active:scale-95">{k}</button>
          ))}
          <button onClick={() => !fb && setInput((v) => v.slice(0, -1))} aria-label="Smazat" className="h-16 rounded-full bg-brand-soft text-2xl font-extrabold active:scale-95">⌫</button>
          <button onClick={pad("0")} className="h-16 rounded-full bg-brand-soft text-3xl font-extrabold active:scale-95">0</button>
          {fb && !fb.ok ? (
            <button onClick={next} data-testid="practice-next" className="h-16 rounded-full bg-warm text-xl font-extrabold text-brand active:scale-95">Další</button>
          ) : (
            <button onClick={submit} disabled={input === "" || !!fb} data-testid="practice-ok" className="h-16 rounded-full bg-brand text-3xl font-extrabold text-white active:scale-95">✓</button>
          )}
        </div>
      </Card>
    </div>
  );
}
