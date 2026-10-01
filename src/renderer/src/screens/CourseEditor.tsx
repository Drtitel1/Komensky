import { useState } from "react";
import { lessonIdFor } from "@shared/course";
import type { Curriculum, LessonDef, StageDef } from "@shared/types";
import { btnGood, btnSoft, field } from "../components/ui";

const lines = (a: string[]) => a.join("\n");
const unlines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const BUILTIN = "matematika-3";

function newLessonId(c: Curriculum, stage: StageDef): string {
  const used = new Set(c.stages.flatMap((s) => s.lessons.map((l) => l.id)));
  for (let n = stage.lessons.length + 1; n < 1000; n++) {
    const id = lessonIdFor(c.id, stage.id, n, c.id === BUILTIN);
    if (!used.has(id)) return id;
  }
  return `${c.id}-${Date.now()}`;
}

const Label = ({ children }: { children: string }) => <label className="mb-1 mt-3 block text-sm font-bold">{children}</label>;

/** Structured editor (form) + raw JSON mode for one course. The parent validates and stores it. */
export default function CourseEditor({ initial, isNew, onSave, onCancel, errors, busy }: { initial: Curriculum; isNew: boolean; onSave: (c: Curriculum) => void; onCancel: () => void; errors: string[]; busy: boolean }) {
  const [c, setC] = useState<Curriculum>(() => structuredClone(initial));
  const [mode, setMode] = useState<"form" | "json">("form");
  const [json, setJson] = useState("");
  const [jsonErr, setJsonErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const patch = (f: (d: Curriculum) => void) =>
    setC((prev) => {
      const d = structuredClone(prev);
      f(d);
      return d;
    });
  const move = <T,>(arr: T[], i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  };

  const switchMode = (m: "form" | "json") => {
    if (m === "json") setJson(JSON.stringify(c, null, 2));
    else {
      try {
        setC(JSON.parse(json));
        setJsonErr("");
      } catch (e) {
        return setJsonErr(`JSON není platný: ${(e as Error).message}`);
      }
    }
    setMode(m);
  };
  const save = () => {
    if (mode === "json") {
      try {
        return onSave(JSON.parse(json));
      } catch (e) {
        return setJsonErr(`JSON není platný: ${(e as Error).message}`);
      }
    }
    onSave(c);
  };

  return (
    <div className="text-base">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => switchMode("form")} className={`rounded-full px-4 py-2 font-bold ${mode === "form" ? "bg-brand text-white" : "bg-brand-soft"}`}>Formulář</button>
        <button onClick={() => switchMode("json")} className={`rounded-full px-4 py-2 font-bold ${mode === "json" ? "bg-brand text-white" : "bg-brand-soft"}`}>JSON</button>
        <span className="ml-auto text-sm text-ink/60">{isNew ? "Nový kurz (zatím neuložený)" : `Kurz: ${c.id}`}</span>
      </div>

      {c.generated && (
        <div className="mb-3 rounded-xl bg-warm/25 p-3 text-sm">
          <b>Vygenerováno umělou inteligencí</b> ({c.generated.hadMaterial ? "podle vloženého materiálu" : "bez vloženého materiálu – texty napsala AI"}). Prosím <b>projděte texty odstavců</b>, jsou jediným zdrojem pravdy pro učitele.
          {c.generated.flags.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {c.generated.flags.map((f, i) => (
                <li key={i}>Kontrola upozornila: {f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mode === "json" ? (
        <>
          <textarea className={`${field} h-[48vh] font-mono text-xs`} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
          {jsonErr && <p className="mt-2 text-bad">{jsonErr}</p>}
        </>
      ) : (
        <>
          <Label>Předmět (název kurzu)</Label>
          <input className={field} value={c.subject} onChange={(e) => patch((d) => void (d.subject = e.target.value))} />
          <div className="flex gap-3">
            <div className="flex-1">
              <Label>Úroveň / ročník</Label>
              <input className={field} value={c.level ?? ""} onChange={(e) => patch((d) => void (d.level = e.target.value))} placeholder="např. 4. třída základní školy" />
            </div>
            <div className="w-28">
              <Label>Věk žáka</Label>
              <input className={field} type="number" min={5} max={18} value={c.age} onChange={(e) => patch((d) => void (d.age = Number(e.target.value)))} />
            </div>
          </div>
          <Label>Pokyny pro učitele (nepovinné)</Label>
          <textarea className={`${field} h-20`} value={c.notes ?? ""} onChange={(e) => patch((d) => void (d.notes = e.target.value))} placeholder="např. Slovíčka říkej anglicky a hned je česky vysvětli. Vyslovuj pomalu." />

          {c.stages.map((st, si) => (
            <div key={si} className="mt-5 rounded-2xl border-2 border-brand-soft p-3">
              <div className="flex items-center gap-2">
                <b className="text-brand">Etapa {st.id}</b>
                <input className={field} value={st.title} onChange={(e) => patch((d) => void (d.stages[si].title = e.target.value))} placeholder="Název etapy" />
                <button className={btnSoft} title="Nahoru" onClick={() => patch((d) => move(d.stages, si, -1))}>▲</button>
                <button className={btnSoft} title="Dolů" onClick={() => patch((d) => move(d.stages, si, 1))}>▼</button>
                <button className={btnSoft} title="Smazat etapu" onClick={() => confirm(`Smazat etapu „${st.title}“ se všemi lekcemi?`) && patch((d) => void d.stages.splice(si, 1))}>✕</button>
              </div>
              <input className={`${field} mt-2`} value={st.description} onChange={(e) => patch((d) => void (d.stages[si].description = e.target.value))} placeholder="Krátký popis etapy" />

              {st.lessons.map((l: LessonDef, li) => {
                const isOpen = open === l.id;
                return (
                  <div key={l.id} className="mt-3 rounded-xl bg-brand-soft/50 p-3">
                    <div className="flex items-center gap-2">
                      <button className="font-bold" onClick={() => setOpen(isOpen ? null : l.id)} aria-label="Rozbalit">{isOpen ? "▾" : "▸"}</button>
                      <span className="text-sm text-ink/60">{l.id}</span>
                      <input className={field} value={l.title} onChange={(e) => patch((d) => void (d.stages[si].lessons[li].title = e.target.value))} placeholder="Název lekce" />
                      <button className={btnSoft} onClick={() => patch((d) => move(d.stages[si].lessons, li, -1))}>▲</button>
                      <button className={btnSoft} onClick={() => patch((d) => move(d.stages[si].lessons, li, 1))}>▼</button>
                      <button className={btnSoft} onClick={() => confirm(`Smazat lekci „${l.title}“?`) && patch((d) => void d.stages[si].lessons.splice(li, 1))}>✕</button>
                    </div>
                    {isOpen && (
                      <div className="mt-2">
                        <Label>Cíle lekce (jeden na řádek)</Label>
                        <textarea className={`${field} h-24`} defaultValue={lines(l.objectives)} onBlur={(e) => patch((d) => void (d.stages[si].lessons[li].objectives = unlines(e.target.value)))} />
                        <Label>Klíčové poznatky (jeden na řádek)</Label>
                        <textarea className={`${field} h-28`} defaultValue={lines(l.keyFacts)} onBlur={(e) => patch((d) => void (d.stages[si].lessons[li].keyFacts = unlines(e.target.value)))} />
                        <Label>Odstavce zdroje – jediná fakta, která smí učitel učit a ze kterých se tvoří otázky</Label>
                        {l.passages.map((p, pi) => (
                          <div key={pi} className="mb-2 flex gap-2">
                            <span className="mt-2 w-8 shrink-0 text-sm font-bold text-brand">{p.id}</span>
                            <textarea className={`${field} h-24`} defaultValue={p.text} onBlur={(e) => patch((d) => void (d.stages[si].lessons[li].passages[pi].text = e.target.value))} />
                            <button className={btnSoft} title="Smazat odstavec" onClick={() =>
                              patch((d) => {
                                const list = d.stages[si].lessons[li].passages;
                                list.splice(pi, 1);
                                list.forEach((x, k) => (x.id = `Z${k + 1}`)); // keep ids Z1..Zn
                              })
                            }>✕</button>
                          </div>
                        ))}
                        <button className={btnSoft} onClick={() => patch((d) => void d.stages[si].lessons[li].passages.push({ id: `Z${d.stages[si].lessons[li].passages.length + 1}`, text: "" }))}>+ Přidat odstavec</button>
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                className={`${btnSoft} mt-3`}
                onClick={() =>
                  patch((d) => {
                    const id = newLessonId(d, d.stages[si]);
                    d.stages[si].lessons.push({ id, title: "Nová lekce", objectives: ["Doplňte cíl lekce."], keyFacts: ["Doplňte klíčový poznatek."], passages: [{ id: "Z1", text: "Doplňte text, ze kterého se bude učit." }] });
                    setOpen(id);
                  })
                }
              >
                + Přidat lekci
              </button>
            </div>
          ))}
          <button className={`${btnSoft} mt-4`} onClick={() => patch((d) => void d.stages.push({ id: Math.max(0, ...d.stages.map((s) => s.id)) + 1, title: "Nová etapa", description: "", lessons: [] }))}>
            + Přidat etapu
          </button>
        </>
      )}

      {errors.length > 0 && (
        <div className="mt-4 rounded-xl bg-bad-soft p-3 text-sm text-bad">
          <b>Kurz nejde uložit:</b>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="sticky bottom-0 mt-4 flex gap-3 bg-white py-2">
        <button className={btnGood} disabled={busy} onClick={save}>
          {busy ? "Ukládám…" : "Uložit kurz"}
        </button>
        <button className={btnSoft} onClick={onCancel}>
          Zpět bez uložení
        </button>
      </div>
    </div>
  );
}
