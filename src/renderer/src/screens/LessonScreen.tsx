import { useEffect, useRef } from "react";
import type { OpenLesson } from "@shared/ipc";
import type { Phase } from "@shared/types";
import { btnGood, btnSoft, Card, fmtTime } from "../components/ui";
import { useLessonSession } from "../lesson/useLessonSession";

const PHASE_LABEL: Record<Phase, string> = {
  WARMUP: "Rozcvička",
  EXPLAIN: "Výklad",
  CHECK: "Otázky k části",
  FEEDBACK: "Zhodnocení části",
  FINAL_QUIZ: "Závěrečný kvíz",
  SUMMARY: "Shrnutí",
  REVIEW: "Opakování",
  RETEST: "Opakovací test",
  DONE: "Hotovo",
};

export default function LessonScreen({ data, onExit }: { data: OpenLesson; onExit: () => void }) {
  const s = useLessonSession(data, () => undefined);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [s.msgs]);

  const v = s.view;
  const paused = v?.paused ?? true;
  const connected = s.conn === "open";

  // one clear state for the talk button: idle / listening / tutor speaking / thinking
  type Ptt = "idle" | "listening" | "speaking" | "thinking";
  const ptt: Ptt = s.held ? "listening" : s.speaking ? "speaking" : s.thinking ? "thinking" : "idle";
  const PTT_UI: Record<Ptt, { icon: string; title: string; hint: string; cls: string }> = {
    idle: { icon: "🎤", title: "Drž a mluv", hint: "podrž tlačítko nebo mezerník, mluv a pusť", cls: "bg-brand" },
    listening: { icon: "🎙️", title: "Poslouchám…", hint: "pusť, až domluvíš", cls: "bg-bad pulse" },
    speaking: { icon: "🗣️", title: "Učitel mluví", hint: "podržením ho můžeš přerušit", cls: "bg-sky-600" },
    thinking: { icon: "💭", title: "Přemýšlím…", hint: "chviličku", cls: "bg-warm text-ink" },
  };
  const ui = PTT_UI[ptt];

  const status = s.finished
    ? { icon: "🎉", text: "Lekce je hotová!" }
    : s.conn === "reconnecting" || s.conn === "connecting"
      ? { icon: "🔌", text: s.connMsg || "Připojuji se…" }
      : s.conn === "offline"
        ? { icon: "📡", text: s.connMsg }
        : s.conn === "failed"
          ? { icon: "⚠️", text: s.connMsg }
          : paused
            ? { icon: "⏸", text: "Pauza" }
            : { icon: ui.icon, text: ui.title };

  const leave = () => {
    s.leave();
    onExit();
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4 p-5">
      <Card className="!p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <div>
            <p className="text-sm font-bold text-brand">
              {data.stageTitle} · Lekce {data.lesson.id}
            </p>
            <h2 className="text-2xl font-extrabold leading-tight">{data.lesson.title}</h2>
          </div>
          <div className="ml-auto text-right">
            <p className="text-3xl font-extrabold tabular-nums" data-testid="timer">{fmtTime(v?.totalSeconds ?? data.state.totalSeconds)}</p>
            <p className="text-sm text-ink/60">{v ? PHASE_LABEL[v.phase] : "—"}{v && v.reviewRound ? ` (${v.reviewRound}. kolo)` : ""}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5" aria-label="Postup částmi">
          {data.plan.parts.map((p, i) => {
            const cur = v ? v.partIndex : 0;
            const late = v && ["FINAL_QUIZ", "SUMMARY", "REVIEW", "RETEST", "DONE"].includes(v.phase);
            return <div key={p.id} title={p.title} className={`h-3 flex-1 rounded-full ${late || i < cur ? "bg-good" : i === cur ? "bg-brand" : "bg-brand-soft"}`} />;
          })}
          <div className={`h-3 w-10 rounded-full ${v && v.phase === "FINAL_QUIZ" ? "bg-brand" : v?.completed ? "bg-good" : "bg-warm/40"}`} title="Závěrečný kvíz" />
        </div>
        {v && v.phase !== "DONE" && <p className="mt-2 text-base text-ink/70">{v.phase === "EXPLAIN" || v.phase === "CHECK" || v.phase === "FEEDBACK" ? `Část ${v.partIndex + 1} z ${v.partCount}: ${v.partTitle}` : ""}</p>}
      </Card>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="flex flex-col items-center justify-center text-center">
          {!s.started ? (
            <>
              <button onClick={s.start} disabled={s.finished} className="flex h-36 w-36 items-center justify-center rounded-full bg-brand text-6xl text-white shadow-lg active:scale-95" aria-label="Začít lekci">
                ▶
              </button>
              <p className="mt-4 text-xl font-bold">Klepni a začneme</p>
              <p className="mt-2 text-base text-ink/60">Mluvíš tak, že <b>podržíš</b> velké tlačítko (nebo mezerník).</p>
            </>
          ) : (
            <>
              <div className="mb-3 rounded-full bg-brand-soft px-4 py-2 text-lg font-bold" data-testid="status">
                <span className="mr-2">{status.icon}</span>
                {status.text}
              </div>
              <button
                data-testid="ptt"
                data-state={ptt}
                disabled={s.finished || !connected || paused || !!s.micProblem}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  s.pttDown();
                }}
                onPointerUp={s.pttUp}
                onPointerCancel={s.pttUp}
                onLostPointerCapture={s.pttUp}
                onContextMenu={(e) => e.preventDefault()}
                style={{ touchAction: "none" }}
                className={`flex h-44 w-44 select-none flex-col items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 ${ui.cls}`}
                aria-label="Podrž a mluv"
              >
                <span className="text-6xl">{ui.icon}</span>
                <span className="mt-1 text-lg font-extrabold">{ui.title}</span>
              </button>
              {(s.conn === "failed" || s.conn === "offline") && (
                <button onClick={s.retryConnection} className={`${btnSoft} mt-3 text-base`}>Zkusit připojit znovu</button>
              )}
              <p className="mt-3 min-h-[3rem] text-base text-ink/60">{ui.hint}</p>
              {s.notice && <p className="mt-1 rounded-xl bg-warm/30 px-3 py-2 text-base">{s.notice}</p>}
              <button onClick={s.togglePause} disabled={s.finished} className={`${btnSoft} mt-3 text-base`}>
                {paused ? "▶ Pokračovat" : "⏸ Pauza"}
              </button>
            </>
          )}
          {s.micProblem && (
            <div className="mt-4 rounded-xl bg-bad-soft p-3 text-left text-base text-bad">
              <p>{s.micProblem}</p>
              <button onClick={s.retryMic} className={`${btnSoft} mt-2 text-base`}>Zkusit znovu</button>
            </div>
          )}
          {v && v.phaseTarget && s.started ? (
            <div className="mt-4 w-full">
              <div className="h-2 w-full overflow-hidden rounded-full bg-brand-soft">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (v.phaseSeconds / v.phaseTarget) * 100)}%` }} />
              </div>
              <p className="mt-1 text-sm text-ink/60">výklad této části</p>
            </div>
          ) : null}
          {s.error && (
            <div className="mt-4 rounded-xl bg-bad-soft p-3 text-left text-base text-bad">
              <p>{s.error}</p>
              <button onClick={s.start} className={`${btnSoft} mt-2 text-base`}>Zkusit znovu</button>
            </div>
          )}
          <button onClick={leave} className={`${btnSoft} mt-6 text-base`}>
            {s.finished ? "Zpět na přehled" : "Skončit a uložit"}
          </button>
        </Card>

        <div className="flex min-h-0 flex-col gap-4">
          {v?.question && !s.finished && (
            <Card className="!p-4">
              <p className="text-sm font-bold uppercase tracking-wide text-brand">
                Otázka {v.question.index + 1} z {v.question.total}
              </p>
              <p className="selectable mt-1 text-2xl font-bold leading-snug">{v.question.prompt}</p>
              {v.question.options && (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {v.question.options.map((o, i) => (
                    <li key={i} className="selectable rounded-xl bg-brand-soft px-4 py-2 text-lg">
                      <b className="mr-2 text-brand">{String.fromCharCode(65 + i)}</b>
                      {o}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {s.finished && (
            <Card className="!p-4 bg-good-soft">
              <p className="text-2xl font-extrabold">🎉 Lekce splněna{v?.score != null ? ` – ${Math.round(v.score * 100)} %` : ""}!</p>
              <p className="mt-1 text-base">Další lekce se připravuje na pozadí.</p>
              <button onClick={leave} className={`${btnGood} mt-3`}>Zpět na přehled</button>
            </Card>
          )}
          <Card className="flex min-h-0 flex-1 flex-col !p-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink/50">Přepis rozhovoru</h3>
            <div className="selectable flex-1 space-y-2 overflow-y-auto pr-1">
              {s.msgs.length === 0 && <p className="text-ink/50">Tady se zobrazí, co říká učitel a co říkáš ty.</p>}
              {s.msgs.map((m) => (
                <p key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2 text-lg leading-snug ${m.role === "user" ? "ml-auto bg-brand text-white" : "bg-brand-soft"}`}>
                  {m.text}
                </p>
              ))}
              <div ref={endRef} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
