import { useState } from "react";
import { btnGood, btnSoft, field, Modal } from "./ui";

/** Asks for the administrator code and runs `action(pin)`; shows the error returned by the main process (wrong code, too many attempts…). */
export default function PinPrompt({ title, text, confirmLabel, action, onClose }: { title: string; text: string; confirmLabel: string; action: (pin: string) => Promise<{ ok: boolean; error?: string }>; onClose: (done: boolean) => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!pin) return;
    setBusy(true);
    const r = await action(pin);
    setBusy(false);
    if (r.ok) return onClose(true);
    setErr(r.error ?? "Nepodařilo se.");
    setPin("");
  };
  return (
    <Modal title={title} onClose={() => onClose(false)}>
      <p className="text-base">{text}</p>
      <input
        className={`${field} mt-3`}
        type="password"
        inputMode="numeric"
        autoFocus
        placeholder="Kód správce"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
      />
      {err && <p className="mt-2 text-bad">{err}</p>}
      <div className="mt-4 flex gap-3">
        <button className={btnGood} disabled={busy || !pin} onClick={() => void submit()}>
          {confirmLabel}
        </button>
        <button className={btnSoft} onClick={() => onClose(false)}>
          Zrušit
        </button>
      </div>
    </Modal>
  );
}
