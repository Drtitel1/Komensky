import { useCallback, useEffect, useState } from "react";
import type { AdminOverview } from "@shared/ipc";
import type { AppSettings, Curriculum } from "@shared/types";
import { btnGood, btnPrimary, btnSoft, field, Modal } from "../components/ui";

type Tab = "overview" | "transcripts" | "plans" | "progress" | "backup" | "settings";
const TABS: [Tab, string][] = [["overview", "Přehled"], ["transcripts", "Přepisy"], ["plans", "Plány lekcí"], ["progress", "Postup"], ["backup", "Záloha"], ["settings", "Klíč a modely"]];

export default function Admin({ curriculum, inLesson, onClose }: { curriculum: Curriculum; inLesson: boolean; onClose: () => void }) {
  const api = window.komensky.admin;
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const lessons = curriculum.stages.flatMap((s) => s.lessons);
  const [sel, setSel] = useState(lessons[0].id);

  const close = () => {
    void api.lock();
    onClose();
  };

  if (!unlocked)
    return (
      <Modal title="🔒 Správce" onClose={close}>
        <p className="text-base">Zadejte PIN správce.</p>
        <input className={`${field} mt-3`} type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && document.getElementById("pin-ok")?.click()} />
        {err && <p className="mt-2 text-bad">{err}</p>}
        <button
          id="pin-ok"
          className={`${btnPrimary} mt-4`}
          onClick={async () => {
            const r = await api.unlock(pin);
            if (r.ok) setUnlocked(true);
            else setErr(r.error ?? "Nesprávný PIN.");
            setPin("");
          }}
        >
          Odemknout
        </button>
      </Modal>
    );

  return (
    <Modal title="🔒 Správce" onClose={close} wide>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setNote(null); }} className={`rounded-full px-4 py-2 text-base font-bold ${tab === id ? "bg-brand text-white" : "bg-brand-soft"}`}>
            {label}
          </button>
        ))}
      </div>
      {note && <p className={`mb-3 rounded-xl p-3 text-base ${note.ok ? "bg-good-soft" : "bg-bad-soft text-bad"}`}>{note.text}</p>}
      {tab === "overview" && <Overview />}
      {tab === "transcripts" && <Transcripts lessons={lessons} sel={sel} setSel={setSel} />}
      {tab === "plans" && <Plans lessons={lessons} sel={sel} setSel={setSel} setNote={setNote} inLesson={inLesson} />}
      {tab === "progress" && <Progress lessons={lessons} sel={sel} setSel={setSel} setNote={setNote} inLesson={inLesson} />}
      {tab === "backup" && <Backup setNote={setNote} inLesson={inLesson} />}
      {tab === "settings" && <Keys setNote={setNote} />}
    </Modal>
  );
}

type SetNote = (n: { ok: boolean; text: string } | null) => void;
const LessonSelect = ({ lessons, sel, setSel }: { lessons: { id: string; title: string }[]; sel: string; setSel: (s: string) => void }) => (
  <select className={field} value={sel} onChange={(e) => setSel(e.target.value)}>
    {lessons.map((l) => (
      <option key={l.id} value={l.id}>
        {l.id} {l.title}
      </option>
    ))}
  </select>
);

function Overview() {
  const [d, setD] = useState<AdminOverview | null>(null);
  useEffect(() => {
    void window.komensky.admin.overview().then(setD);
  }, []);
  if (!d) return <p>Načítám…</p>;
  return (
    <div className="text-base">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-brand-soft text-sm text-ink/60">
            <th className="py-1">Lekce</th><th>Stav</th><th>Skóre</th><th>Odpovědí</th><th>Chyb</th><th>Dokončeno</th>
          </tr>
        </thead>
        <tbody>
          {d.lessons.map((l) => (
            <tr key={l.id} className="border-b border-brand-soft/60">
              <td className="py-1">{l.id} {l.title}</td>
              <td>{l.status === "completed" ? "hotovo" : l.status === "in_progress" ? "rozpracováno" : l.hasPlan ? "plán připraven" : "—"}</td>
              <td>{l.score !== null ? `${Math.round(l.score * 100)} %` : "—"}</td>
              <td>{l.answers}</td><td>{l.wrong}</td>
              <td>{l.completedAt ? new Date(l.completedAt).toLocaleDateString("cs-CZ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 className="mb-1 mt-6 text-lg font-extrabold">Slabá místa</h4>
      {d.weak.length === 0 ? <p className="text-ink/60">Zatím žádná.</p> : (
        <ul className="list-disc pl-6">
          {d.weak.map((w) => (
            <li key={w.qid}>{w.prompt} <span className="text-ink/60">({w.lessonId}: {w.wrong}× špatně z {w.total})</span></li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-ink/70">Příkladů čekajících na opakování: {d.srsCount}</p>
    </div>
  );
}

function Transcripts({ lessons, sel, setSel }: { lessons: { id: string; title: string }[]; sel: string; setSel: (s: string) => void }) {
  const [rows, setRows] = useState<{ role: string; text: string; phase: string; at: string }[]>([]);
  useEffect(() => {
    void window.komensky.admin.transcripts(sel).then(setRows);
  }, [sel]);
  return (
    <div>
      <LessonSelect lessons={lessons} sel={sel} setSel={setSel} />
      <div className="selectable mt-3 max-h-[50vh] space-y-2 overflow-y-auto text-base">
        {rows.length === 0 && <p className="text-ink/60">Žádný přepis.</p>}
        {rows.map((r, i) => (
          <p key={i} className={`rounded-xl px-3 py-2 ${r.role === "user" ? "bg-brand text-white" : "bg-brand-soft"}`}>
            <span className="mr-2 text-xs opacity-70">{new Date(r.at).toLocaleTimeString("cs-CZ")} · {r.phase}</span>
            {r.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function Plans({ lessons, sel, setSel, setNote, inLesson }: { lessons: { id: string; title: string }[]; sel: string; setSel: (s: string) => void; setNote: SetNote; inLesson: boolean }) {
  const [json, setJson] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const raw = await window.komensky.admin.getPlan(sel);
    setJson(raw ? JSON.stringify(JSON.parse(raw), null, 2) : null);
  }, [sel]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div>
      <LessonSelect lessons={lessons} sel={sel} setSel={setSel} />
      {json === null ? <p className="mt-3 text-ink/60">Plán pro tuto lekci ještě nebyl vytvořen (vytvoří se při prvním spuštění).</p> : (
        <textarea className={`${field} mt-3 h-[42vh] font-mono text-sm`} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        {json !== null && (
          <button className={btnGood} onClick={async () => { const r = await window.komensky.admin.savePlan(sel, json); setNote(r.ok ? { ok: true, text: "Plán uložen." } : { ok: false, text: r.error ?? "Chyba." }); }}>
            Uložit úpravy
          </button>
        )}
        <button className={btnSoft} disabled={busy || inLesson} onClick={async () => {
          if (!confirm("Vytvořit plán znovu? Rozpracovaný postup této lekce se smaže.")) return;
          setBusy(true);
          setNote({ ok: true, text: "Generuji nový plán…" });
          const r = await window.komensky.admin.regenerate(sel);
          setNote(r.ok ? { ok: true, text: "Nový plán je hotový." } : { ok: false, text: r.error ?? "Chyba." });
          setBusy(false);
          void load();
        }}>
          {busy ? "Generuji…" : "Vygenerovat znovu"}
        </button>
      </div>
    </div>
  );
}

function Progress({ lessons, sel, setSel, setNote, inLesson }: { lessons: { id: string; title: string }[]; sel: string; setSel: (s: string) => void; setNote: SetNote; inLesson: boolean }) {
  return (
    <div>
      <LessonSelect lessons={lessons} sel={sel} setSel={setSel} />
      <div className="mt-4 flex flex-wrap gap-3">
        <button className={btnSoft} disabled={inLesson} onClick={async () => {
          if (!confirm(`Smazat postup a odpovědi lekce ${sel}? (Lekce se bude opakovat od začátku.)`)) return;
          await window.komensky.admin.resetLesson(sel);
          setNote({ ok: true, text: `Lekce ${sel} byla vynulována.` });
        }}>Vynulovat tuto lekci</button>
        <button className={btnSoft} disabled={inLesson} onClick={async () => {
          if (!confirm(`Přeskočit na lekci ${sel}? Dřívější lekce se označí jako hotové, tato a další se vynulují.`)) return;
          await window.komensky.admin.jumpTo(sel);
          setNote({ ok: true, text: `Aktuální lekce je nyní ${sel}. Vraťte se na přehled.` });
        }}>Přeskočit na tuto lekci</button>
      </div>
    </div>
  );
}

function Backup({ setNote, inLesson }: { setNote: SetNote; inLesson: boolean }) {
  return (
    <div className="text-base">
      <p>Záloha obsahuje postup, odpovědi, plány lekcí, přepisy a PIN. Gemini klíč se nezálohuje (po přeinstalaci ho zadáte znovu).</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className={btnPrimary} onClick={async () => {
          const r = await window.komensky.admin.exportBackup();
          if (r.ok) setNote({ ok: true, text: `Záloha uložena: ${r.path}` });
          else if (r.error) setNote({ ok: false, text: r.error });
        }}>Uložit zálohu…</button>
        <button className={btnSoft} disabled={inLesson} onClick={async () => {
          if (!confirm("Načtení zálohy nahradí VEŠKERÝ současný postup. Pokračovat?")) return;
          const r = await window.komensky.admin.importBackup();
          if (r.ok) { setNote({ ok: true, text: "Záloha načtena. Aplikace se nyní znovu načte." }); setTimeout(() => location.reload(), 1200); }
          else if (r.error) setNote({ ok: false, text: r.error });
        }}>Načíst zálohu…</button>
      </div>
    </div>
  );
}

function Keys({ setNote }: { setNote: SetNote }) {
  const api = window.komensky.admin;
  const [key, setKey] = useState("");
  const [s, setS] = useState<AppSettings | null>(null);
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  useEffect(() => {
    void api.getSettings().then(setS);
  }, [api]);
  if (!s) return <p>Načítám…</p>;
  return (
    <div className="text-base">
      <h4 className="text-lg font-extrabold">Gemini API klíč</h4>
      <div className="mt-2 flex gap-3">
        <input className={field} type="password" autoComplete="off" placeholder="Nový klíč (AIza…)" value={key} onChange={(e) => setKey(e.target.value)} />
        <button className={btnPrimary} disabled={!key.trim()} onClick={async () => {
          const r = await api.setKey(key);
          setNote(r.ok ? { ok: true, text: "Klíč byl změněn." } : { ok: false, text: r.error ?? "Chyba." });
          if (r.ok) setKey("");
        }}>Změnit</button>
      </div>
      <h4 className="mb-2 mt-6 text-lg font-extrabold">Modely</h4>
      <label className="text-sm font-bold">Živý učitel (LIVE_MODEL)</label>
      <input className={field} value={s.LIVE_MODEL} onChange={(e) => setS({ ...s, LIVE_MODEL: e.target.value })} />
      <label className="mt-2 block text-sm font-bold">Příprava lekcí (PREP_MODEL)</label>
      <input className={field} value={s.PREP_MODEL} onChange={(e) => setS({ ...s, PREP_MODEL: e.target.value })} />
      <label className="mt-2 block text-sm font-bold">Hlas (nepovinné, název předdefinovaného hlasu)</label>
      <input className={field} value={s.VOICE} onChange={(e) => setS({ ...s, VOICE: e.target.value })} />
      <button className={`${btnGood} mt-3`} onClick={async () => { await api.setSettings(s); setNote({ ok: true, text: "Nastavení uloženo (platí od příští lekce)." }); }}>Uložit modely</button>
      <h4 className="mb-2 mt-6 text-lg font-extrabold">Změna PIN</h4>
      <div className="flex gap-3">
        <input className={field} type="password" inputMode="numeric" placeholder="Původní PIN" value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ""))} />
        <input className={field} type="password" inputMode="numeric" placeholder="Nový PIN" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
        <button className={btnPrimary} onClick={async () => {
          const r = await api.changePin(oldPin, newPin);
          setNote(r.ok ? { ok: true, text: "PIN změněn." } : { ok: false, text: r.error ?? "Chyba." });
          setOldPin(""); setNewPin("");
        }}>Změnit</button>
      </div>
    </div>
  );
}
