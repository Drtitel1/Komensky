import { useEffect, useState } from "react";
import type { Overview, PlanProgress } from "@shared/ipc";
import { btnPrimary, Card } from "../components/ui";
import PinPrompt from "../components/PinPrompt";

export default function Home({ ov, onStart, busy, error, onSkipped }: { ov: Overview; onStart: () => void; busy: boolean; error: string | null; onSkipped: () => void }) {
  const [prog, setProg] = useState<PlanProgress | null>(null);
  const [skipAsk, setSkipAsk] = useState(false);
  useEffect(() => {
    const off = window.komensky.plan.onProgress(setProg);
    return () => {
      off();
    };
  }, []);
  const current = ov.stages.flatMap((s) => s.lessons).find((l) => l.id === ov.currentLessonId);
  const pct = Math.round((ov.completed / Math.max(ov.total, 1)) * 100);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <Card>
        {current ? (
          <>
            <p className="text-sm font-bold uppercase tracking-wide text-brand">Další lekce</p>
            <h2 className="mt-1 text-3xl font-extrabold leading-tight">
              {current.id} {current.title}
            </h2>
            {current.inProgress && <p className="mt-1 text-base text-ink/60">Rozpracováno – navážeme tam, kde jsi skončila.</p>}
            {ov.srsDue > 0 && <p className="mt-2 rounded-xl bg-warm/25 p-2 text-base">Na začátku si zopakujeme pár příkladů z dřívějška.</p>}
            <button onClick={onStart} disabled={busy} className={`${btnPrimary} mt-5 px-10 py-4 text-2xl`}>
              {busy ? "Připravuji lekci…" : current.inProgress ? "▶ Pokračovat v lekci" : "▶ Začít lekci"}
            </button>
            {busy && (
              <div className="mt-4">
                <p className="text-base text-ink/70">{prog?.step ?? "Připravuji plán lekce (jen poprvé, asi minutu)…"}</p>
                <div className="mt-2 h-3 w-full max-w-md overflow-hidden rounded-full bg-brand-soft">
                  <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.max(8, prog ? (prog.done / prog.total) * 100 : 8)}%` }} />
                </div>
              </div>
            )}
            {error && <p className="mt-4 rounded-xl bg-bad-soft p-3 text-base text-bad">{error}</p>}
            <button onClick={() => setSkipAsk(true)} disabled={busy} className="mt-5 block text-sm text-ink/50 underline" data-testid="skip-link">
              Přeskočit tuto lekci (kód správce)
            </button>
            {skipAsk && (
              <PinPrompt
                title="Přeskočit lekci"
                text={`Lekce „${current.title}“ se označí jako přeskočená a odemkne se další. Pro přeskočení zadejte kód správce.`}
                confirmLabel="Přeskočit lekci"
                action={(pin) => window.komensky.lesson.skip(current.id, pin)}
                onClose={(done) => {
                  setSkipAsk(false);
                  if (done) onSkipped();
                }}
              />
            )}
          </>
        ) : (
          <div className="text-center">
            <div className="text-6xl">🏆</div>
            <h2 className="mt-2 text-3xl font-extrabold">Gratuluji, kurz máš hotový!</h2>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xl font-extrabold">Přehled kurzu</h3>
          <span className="text-base font-bold text-brand">
            {ov.completed} / {ov.total} lekcí
          </span>
        </div>
        <div className="mb-4 h-3 w-full overflow-hidden rounded-full bg-brand-soft">
          <div className="h-full rounded-full bg-good transition-all" style={{ width: `${pct}%` }} />
        </div>
        {ov.stages.map((s) => (
          <div key={s.id} className="mb-4">
            <h4 className="font-bold text-brand">
              Etapa {s.id}: {s.title}
            </h4>
            <ul className="mt-1 flex flex-col gap-1">
              {s.lessons.map((l) => (
                <li key={l.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${l.status === "current" ? "bg-brand-soft font-semibold" : ""}`}>
                  <span>{l.status === "completed" ? (l.skipped ? "⏭️" : "✅") : l.status === "current" ? "▶️" : "🔒"}</span>
                  <span className={l.status === "locked" ? "text-ink/45" : ""}>
                    {l.id} {l.title}
                  </span>
                  {l.status === "completed" && l.skipped && <span className="ml-auto text-sm text-ink/50">přeskočeno</span>}
                  {l.status === "completed" && !l.skipped && l.score !== null && <span className="ml-auto text-sm text-ink/60">{Math.round(l.score * 100)} %</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>
    </div>
  );
}
