import { useCallback, useEffect, useState } from "react";
import type { CourseGenParams, CourseInfo } from "@shared/ipc";
import type { Curriculum } from "@shared/types";
import { btnGood, btnPrimary, btnSoft, field } from "../components/ui";
import CourseEditor from "./CourseEditor";

type Note = { ok: boolean; text: string } | null;
type View = { kind: "list" } | { kind: "gen" } | { kind: "edit"; course: Curriculum; isNew: boolean };

const blankCourse = (): Curriculum => ({
  schema: 1,
  id: "novy-kurz",
  subject: "Nový předmět",
  age: 9,
  level: "",
  stages: [{ id: 1, title: "První etapa", description: "", lessons: [{ id: "novy-kurz-1.1", title: "První lekce", objectives: ["Doplňte cíl lekce."], keyFacts: ["Doplňte klíčový poznatek."], passages: [{ id: "Z1", text: "Doplňte text, ze kterého se bude učit." }] }] }],
});

/** Admin → Učivo: choose the active course, edit courses, import/export them and generate new ones with AI. */
export default function CourseManager({ inLesson, onChanged, setNote }: { inLesson: boolean; onChanged: () => void; setNote: (n: Note) => void }) {
  const api = window.komensky.courses;
  const [list, setList] = useState<CourseInfo[]>([]);
  const [view, setView] = useState<View>({ kind: "list" });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState<string[]>([]);

  const reload = useCallback(async () => setList(await api.list()), [api]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const edit = async (id: string) => {
    const c = await api.get(id);
    if (c) {
      setErrors([]);
      setView({ kind: "edit", course: c, isNew: false });
    }
  };

  const save = async (c: Curriculum, isNew: boolean) => {
    setBusy(true);
    setErrors([]);
    // a new course gets a free slug and lesson ids from the main process (generator/import already do); blank ones are fixed here
    const r = await api.save(c, isNew);
    setBusy(false);
    if (!r.ok) return setErrors(r.errors ?? ["Uložení se nepovedlo."]);
    setNote({ ok: true, text: `Kurz „${r.course?.subject}“ byl uložen.` });
    onChanged();
    await reload();
    if (r.stale && r.stale.length) setStale(r.stale);
    setView({ kind: "list" });
  };

  if (view.kind === "gen") return <Generator onCancel={() => setView({ kind: "list" })} onDraft={(course) => { setErrors([]); setView({ kind: "edit", course, isNew: true }); }} />;
  if (view.kind === "edit")
    return (
      <div>
        <h4 className="mb-2 text-lg font-extrabold">{view.isNew ? "Nový kurz" : `Úprava kurzu: ${view.course.subject}`}</h4>
        {!view.isNew && view.course.id === "matematika-3" && <p className="mb-3 rounded-xl bg-brand-soft p-3 text-sm">Úpravy původního kurzu zůstanou zachovány i po aktualizaci aplikace. Originál se dá kdykoli obnovit tlačítkem „Obnovit původní“.</p>}
        <CourseEditor initial={view.course} isNew={view.isNew} errors={errors} busy={busy} onSave={(c) => void save(c, view.isNew)} onCancel={() => setView({ kind: "list" })} />
      </div>
    );

  return (
    <div className="text-base">
      <div className="mb-4 flex flex-wrap gap-3">
        <button className={btnPrimary} onClick={() => setView({ kind: "gen" })}>✨ Vygenerovat kurz (AI)</button>
        <button className={btnSoft} onClick={() => { setErrors([]); setView({ kind: "edit", course: blankCourse(), isNew: true }); }}>➕ Nový prázdný kurz</button>
        <button
          className={btnSoft}
          onClick={async () => {
            const r = await api.importCourse();
            if (r.ok && r.course) { setErrors([]); setView({ kind: "edit", course: r.course, isNew: true }); }
            else if (r.errors) setNote({ ok: false, text: `Soubor není platný kurz: ${r.errors.join("; ")}` });
            else if (r.error) setNote({ ok: false, text: r.error });
          }}
        >
          📂 Importovat kurz…
        </button>
      </div>

      {stale.length > 0 && (
        <div className="mb-4 rounded-xl bg-warm/25 p-3 text-sm">
          U těchto lekcí je už vytvořený plán ze <b>starého znění</b> učiva: {stale.join(", ")}. Nový text se v nich projeví, až se plán vytvoří znovu (smaže se i rozpracovaný postup těchto lekcí).
          <div className="mt-2 flex gap-2">
            <button className={btnSoft} disabled={inLesson} onClick={async () => { await api.dropPlans(stale); setStale([]); setNote({ ok: true, text: "Plány byly smazány, vytvoří se znovu při příštím spuštění lekce." }); onChanged(); }}>Smazat plány těchto lekcí</button>
            <button className={btnSoft} onClick={() => setStale([])}>Ponechat</button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {list.map((c) => (
          <li key={c.id} className={`rounded-2xl border-2 p-3 ${c.active ? "border-brand bg-brand-soft/50" : "border-brand-soft"}`}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold">
                  {c.title} {c.active && <span className="ml-1 rounded-full bg-brand px-2 py-0.5 text-xs text-white">aktivní</span>}
                </p>
                <p className="text-sm text-ink/60">
                  {c.lessons} lekcí · {c.builtin ? "původní kurz" : c.generated ? "vygenerovaný AI" : "vlastní"}
                  {c.builtin && c.edited ? " (upravený)" : ""}
                </p>
              </div>
              {!c.active && (
                <button className={btnGood} disabled={inLesson} onClick={async () => {
                  const r = await api.setActive(c.id);
                  if (r.ok) { setNote({ ok: true, text: `Aktivní kurz: ${c.title}. Postup každého kurzu se uchovává zvlášť.` }); onChanged(); await reload(); }
                  else setNote({ ok: false, text: r.error ?? "Nepovedlo se." });
                }}>Nastavit jako aktivní</button>
              )}
              <button className={btnSoft} onClick={() => void edit(c.id)}>Upravit</button>
              <button className={btnSoft} onClick={async () => { const r = await api.exportCourse(c.id); if (r.ok) setNote({ ok: true, text: `Kurz uložen: ${r.path}` }); else if (r.error) setNote({ ok: false, text: r.error }); }}>Export</button>
              {c.builtin ? (
                c.edited && (
                  <button className={btnSoft} disabled={inLesson} onClick={async () => {
                    if (!confirm("Obnovit původní znění kurzu? Vaše úpravy kurzu se přepíší (postup zůstane).")) return;
                    const r = await api.restoreBuiltin();
                    setNote(r.ok ? { ok: true, text: "Původní kurz obnoven." } : { ok: false, text: r.error ?? "Chyba." });
                    onChanged(); await reload();
                  }}>Obnovit původní</button>
                )
              ) : (
                <button className={btnSoft} disabled={inLesson} onClick={async () => {
                  if (!confirm(`Smazat kurz „${c.title}“ včetně postupu, odpovědí a přepisů jeho lekcí? Nejde to vrátit.`)) return;
                  const r = await api.remove(c.id);
                  setNote(r.ok ? { ok: true, text: "Kurz smazán." } : { ok: false, text: r.error ?? "Chyba." });
                  onChanged(); await reload();
                }}>Smazat</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-ink/60">Aktivní kurz je ten, který se právě učí. Každý kurz má vlastní postup, takže se mezi kurzy můžete přepínat bez ztráty.</p>
    </div>
  );
}

function Generator({ onCancel, onDraft }: { onCancel: () => void; onDraft: (c: Curriculum) => void }) {
  const api = window.komensky.courses;
  const [p, setP] = useState<CourseGenParams>({ subject: "", level: "", age: 9, notes: "", material: "", stages: 3, lessonsPerStage: 3 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [prog, setProg] = useState<{ step: string; done: number; total: number } | null>(null);
  useEffect(() => {
    const off = api.onProgress(setProg);
    return () => {
      off();
    };
  }, [api]);
  const set = (x: Partial<CourseGenParams>) => setP((v) => ({ ...v, ...x }));
  const total = p.stages * p.lessonsPerStage;

  const run = async () => {
    setBusy(true);
    setErr("");
    setProg(null);
    const r = await api.generate(p);
    setBusy(false);
    if (r.ok) onDraft(r.course);
    else setErr(r.error);
  };

  return (
    <div className="text-base">
      <h4 className="mb-2 text-lg font-extrabold">✨ Vygenerovat kurz</h4>
      <p className="mb-3 rounded-xl bg-brand-soft p-3 text-sm">
        Gemini navrhne etapy a lekce a napíše pro každou lekci cíle, klíčové poznatky a odstavce zdroje. <b>Nejlepší je vložit vlastní studijní materiál</b> (učebnici, poznámky) – kurz se pak postaví jen z něj a ověří se proti němu. Výsledek si můžete před uložením upravit.
      </p>
      <label className="text-sm font-bold">Předmět</label>
      <input className={field} value={p.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="např. Angličtina, Prvouka, Dějepis, Český jazyk…" />
      <div className="mt-3 flex gap-3">
        <div className="flex-1">
          <label className="text-sm font-bold">Úroveň / ročník</label>
          <input className={field} value={p.level} onChange={(e) => set({ level: e.target.value })} placeholder="např. 4. třída ZŠ, začátečník" />
        </div>
        <div className="w-24">
          <label className="text-sm font-bold">Věk</label>
          <input className={field} type="number" min={5} max={18} value={p.age} onChange={(e) => set({ age: Number(e.target.value) })} />
        </div>
        <div className="w-24">
          <label className="text-sm font-bold">Etap</label>
          <input className={field} type="number" min={1} max={8} value={p.stages} onChange={(e) => set({ stages: Number(e.target.value) })} />
        </div>
        <div className="w-24">
          <label className="text-sm font-bold">Lekcí/etapu</label>
          <input className={field} type="number" min={1} max={8} value={p.lessonsPerStage} onChange={(e) => set({ lessonsPerStage: Number(e.target.value) })} />
        </div>
      </div>
      <p className="mt-1 text-sm text-ink/60">Celkem ≈ {total} lekcí. Generování trvá zhruba {Math.max(1, Math.round(total * 0.4))}–{Math.max(2, Math.round(total * 0.8))} minut (u bezplatného klíče Google déle).</p>
      <label className="mt-3 block text-sm font-bold">Pokyny pro učitele (nepovinné)</label>
      <textarea className={`${field} h-16`} value={p.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="např. Je to angličtina: slovíčka říkej anglicky a hned česky vysvětli." />
      <div className="mt-3 flex items-center justify-between">
        <label className="text-sm font-bold">Studijní materiál (nepovinné, ale doporučené)</label>
        <button className={btnSoft} onClick={async () => { const r = await api.readMaterialFile(); if (r.ok && r.text) set({ material: r.text }); else if (r.error) setErr(r.error); }}>Načíst ze souboru (.txt, .md)…</button>
      </div>
      <textarea className={`${field} h-40 text-sm`} value={p.material} onChange={(e) => set({ material: e.target.value })} placeholder="Vložte text z učebnice nebo poznámky. Aplikace použije až 150 000 znaků." />
      <p className="text-sm text-ink/60">{p.material.length.toLocaleString("cs-CZ")} znaků{p.material.length > 150_000 ? " (použije se prvních 150 000)" : ""}</p>

      {busy && (
        <div className="mt-3">
          <p>{prog?.step ?? "Začínám…"}</p>
          <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-brand-soft">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.max(6, prog ? (prog.done / Math.max(prog.total, 1)) * 100 : 6)}%` }} />
          </div>
        </div>
      )}
      {err && <p className="mt-3 rounded-xl bg-bad-soft p-3 text-bad">{err}</p>}
      <div className="mt-4 flex gap-3">
        <button className={btnGood} disabled={busy || p.subject.trim().length < 2} onClick={() => void run()}>{busy ? "Generuji…" : "Vygenerovat"}</button>
        <button className={btnSoft} disabled={busy} onClick={onCancel}>Zpět</button>
      </div>
    </div>
  );
}
