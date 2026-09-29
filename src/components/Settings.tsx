"use client";

import { useState } from "react";
import { api, DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "./api";

const TTS_MODELS = [
  { id: "eleven_v4", label: "Eleven v4 (nejnovější, nejlepší kvalita)" },
  { id: "eleven_v4_turbo", label: "Eleven v4 Turbo (rychlejší, levnější)" },
  { id: "eleven_v3", label: "Eleven v3" },
  { id: "eleven_multilingual_v2", label: "Multilingual v2 (starší, stabilní)" },
  { id: "eleven_flash_v2_5", label: "Flash v2.5 (nejrychlejší)" },
];

interface Props {
  onClose: () => void;
  onSaved: () => void;
  firstRun?: boolean;
}

const field = "w-full rounded-xl border-2 border-brand-soft bg-white px-3 py-2 outline-none focus:border-brand";

export default function SettingsDialog({ onClose, onSaved, firstRun }: Props) {
  const [s, setS] = useState<Settings>(() => loadSettings());
  const [models, setModels] = useState<string[]>([]);
  const [voices, setVoices] = useState<{ id: string; name: string; hint: string }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const set = (patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch }));

  // fetch helpers must use the values typed here, not yet saved ones
  const withDraft = () => saveSettings(s);

  const loadModels = async () => {
    withDraft();
    setBusy("models");
    setMsg(null);
    try {
      const r = await api<{ models: string[] }>("/api/models");
      setModels(r.models);
      setMsg({ ok: true, text: `Načteno ${r.models.length} modelů Gemini.` });
    } catch (e) {
      setMsg({ ok: false, text: `Modely se nepodařilo načíst: ${(e as Error).message}` });
    }
    setBusy(null);
  };

  const loadVoices = async () => {
    withDraft();
    setBusy("voices");
    setMsg(null);
    try {
      const r = await api<{ voices: { id: string; name: string; hint: string }[] }>("/api/voices");
      setVoices(r.voices);
      setMsg({ ok: true, text: `Načteno ${r.voices.length} hlasů.` });
    } catch (e) {
      setMsg({ ok: false, text: `Hlasy se nepodařilo načíst: ${(e as Error).message}` });
    }
    setBusy(null);
  };

  const testVoice = async () => {
    withDraft();
    setBusy("test");
    setMsg(null);
    try {
      const { url } = await api<{ url: string }>("/api/tts", { json: { text: "Ahoj! Dnes se naučíme něco nového z matematiky." } });
      await new Audio(url).play();
      setMsg({ ok: true, text: "Hlas funguje 🎉" });
    } catch (e) {
      setMsg({ ok: false, text: `Test hlasu selhal: ${(e as Error).message}` });
    }
    setBusy(null);
  };

  const save = () => {
    saveSettings({ ...s, geminiKey: s.geminiKey.trim(), elevenKey: s.elevenKey.trim(), elevenVoice: s.elevenVoice.trim() });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={firstRun ? undefined : onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xl font-extrabold">⚙️ Nastavení</h3>
          {!firstRun && (
            <button onClick={onClose} className="rounded-full bg-brand-soft px-3 py-1 font-bold">
              ✕
            </button>
          )}
        </div>
        <p className="mb-4 rounded-xl bg-brand-soft p-3 text-sm">
          Klíče se ukládají jen do tohoto prohlížeče (na tomto zařízení) a posílají se pouze na server aplikace při každém požadavku. Na jiném zařízení je nutné je zadat znovu.
        </p>

        <h4 className="mb-2 font-bold text-brand">Gemini (texty a opravování)</h4>
        <label className="mb-1 block text-sm font-semibold">API klíč</label>
        <input className={field} type="password" autoComplete="off" value={s.geminiKey} onChange={(e) => set({ geminiKey: e.target.value })} placeholder="AIza…" />

        <label className="mb-1 mt-3 block text-sm font-semibold">Model pro výklad a otázky</label>
        <input className={field} list="gemini-models" value={s.geminiModel} onChange={(e) => set({ geminiModel: e.target.value })} placeholder="gemini-3.8-flash" />
        <label className="mb-1 mt-3 block text-sm font-semibold">Model pro kontrolu faktů (prázdné = stejný)</label>
        <input className={field} list="gemini-models" value={s.geminiCheckModel} onChange={(e) => set({ geminiCheckModel: e.target.value })} placeholder="stejný jako výše" />
        <datalist id="gemini-models">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <button onClick={loadModels} disabled={!s.geminiKey || !!busy} className="mt-2 rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold">
          {busy === "models" ? "Načítám…" : "Načíst dostupné modely"}
        </button>
        <p className="mt-1 text-xs text-ink/60">Můžeš napsat jakýkoli název modelu Gemini, nebo vybrat z načteného seznamu (klepni do pole).</p>

        <h4 className="mb-2 mt-6 font-bold text-brand">ElevenLabs (hlas)</h4>
        <label className="mb-1 block text-sm font-semibold">API klíč</label>
        <input className={field} type="password" autoComplete="off" value={s.elevenKey} onChange={(e) => set({ elevenKey: e.target.value })} placeholder="sk_…" />

        <label className="mb-1 mt-3 block text-sm font-semibold">Model hlasu</label>
        <select className={field} value={TTS_MODELS.some((m) => m.id === s.elevenModel) ? s.elevenModel : "__custom"} onChange={(e) => e.target.value !== "__custom" && set({ elevenModel: e.target.value })}>
          {TTS_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          <option value="__custom">Jiný (napiš níže)…</option>
        </select>
        <input className={`${field} mt-2`} value={s.elevenModel} onChange={(e) => set({ elevenModel: e.target.value })} placeholder="eleven_v4" />

        <label className="mb-1 mt-3 block text-sm font-semibold">Hlas</label>
        {voices.length > 0 && (
          <select className={`${field} mb-2`} value={voices.some((v) => v.id === s.elevenVoice) ? s.elevenVoice : ""} onChange={(e) => e.target.value && set({ elevenVoice: e.target.value })}>
            <option value="">— vyber hlas —</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.hint ? ` (${v.hint})` : ""}
              </option>
            ))}
          </select>
        )}
        <input className={field} value={s.elevenVoice} onChange={(e) => set({ elevenVoice: e.target.value })} placeholder="ID hlasu (Voice ID)" />
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={loadVoices} disabled={!s.elevenKey || !!busy} className="rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold">
            {busy === "voices" ? "Načítám…" : "Načíst moje hlasy"}
          </button>
          <button onClick={testVoice} disabled={!s.elevenKey || !s.elevenVoice || !!busy} className="rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold">
            {busy === "test" ? "Zkouším…" : "🔊 Vyzkoušet hlas"}
          </button>
        </div>

        {msg && <p className={`mt-4 rounded-xl p-3 text-sm ${msg.ok ? "bg-good-soft" : "bg-bad-soft text-bad"}`}>{msg.text}</p>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={save}
            disabled={!s.geminiKey.trim() || !s.elevenKey.trim() || !s.elevenVoice.trim()}
            className="flex-1 rounded-2xl bg-good px-6 py-3 text-lg font-bold text-white shadow-md active:scale-95"
          >
            Uložit
          </button>
          <button onClick={() => setS({ ...DEFAULT_SETTINGS })} className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold">
            Smazat vše
          </button>
        </div>
      </div>
    </div>
  );
}
