import { useState } from "react";
import { btnGood, btnSoft, Card, field } from "../components/ui";

export default function Setup({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const test = async () => {
    setBusy(true);
    setMsg(null);
    const r = await window.komensky.setup.testKey(key);
    setMsg(r.ok ? { ok: true, text: "Klíč funguje 🎉" } : { ok: false, text: r.error ?? "Klíč nefunguje." });
    setBusy(false);
  };

  const save = async () => {
    if (!/^\d{4,8}$/.test(pin)) return setMsg({ ok: false, text: "PIN musí mít 4 až 8 číslic." });
    if (pin !== pin2) return setMsg({ ok: false, text: "PINy se neshodují." });
    setBusy(true);
    const r = await window.komensky.setup.complete({ key, pin });
    setBusy(false);
    if (r.ok) onDone();
    else setMsg({ ok: false, text: r.error ?? "Uložení se nepovedlo." });
  };

  return (
    <div className="mx-auto flex h-full max-w-xl items-center p-6">
      <Card className="w-full">
        <div className="text-5xl">🔑</div>
        <h1 className="mt-2 text-3xl font-extrabold">Vítejte v aplikaci Komenský</h1>
        <p className="mt-2 text-base text-ink/70">Než začneme, je potřeba jednorázové nastavení (dělá ho dospělý).</p>

        <label className="mt-5 block text-base font-bold">Gemini API klíč</label>
        <input className={field} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" />
        <p className="mt-1 text-sm text-ink/60">Klíč se uloží zašifrovaně jen na tomto počítači a nikdy se nezobrazuje v okně aplikace.</p>
        <button className={`${btnSoft} mt-3 text-base`} onClick={test} disabled={busy || !key.trim()}>
          {busy ? "Zkouším…" : "Test klíče"}
        </button>

        <label className="mt-6 block text-base font-bold">PIN pro správce (4–8 číslic)</label>
        <div className="flex gap-3">
          <input className={field} type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="PIN" />
          <input className={field} type="password" inputMode="numeric" autoComplete="off" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} placeholder="PIN znovu" />
        </div>
        <p className="mt-1 text-sm text-ink/60">PIN chrání nastavení, postup a přepisy hovorů.</p>

        {msg && <p className={`mt-4 rounded-xl p-3 text-base ${msg.ok ? "bg-good-soft" : "bg-bad-soft text-bad"}`}>{msg.text}</p>}
        <button className={`${btnGood} mt-5 w-full`} onClick={save} disabled={busy || !key.trim() || !pin}>
          Uložit a začít
        </button>
      </Card>
    </div>
  );
}
