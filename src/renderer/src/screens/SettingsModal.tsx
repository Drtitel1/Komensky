import { useEffect, useState } from "react";
import type { UpdateStatus } from "@shared/ipc";
import { btnPrimary, btnSoft, Modal } from "../components/ui";

const describe = (s: UpdateStatus | null): string => {
  if (!s) return "";
  switch (s.state) {
    case "dev": return "Vývojová verze – aktualizace jsou vypnuté.";
    case "checking": return "Kontroluji aktualizace…";
    case "none": return "Máte nejnovější verzi. ✅";
    case "downloading": return `Stahuji verzi ${s.next ?? ""} (${s.percent} %)…`;
    case "ready": return `Verze ${s.next} je stažená a nainstaluje se po restartu.`;
    case "error": return `Kontrola se nepodařila (${s.message}). Zkontrolujte připojení k internetu.`;
    default: return "Zatím nekontrolováno.";
  }
};

export default function SettingsModal({ status, inLesson, onClose, onAdmin }: { status: UpdateStatus | null; inLesson: boolean; onClose: () => void; onAdmin: () => void }) {
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void window.komensky.app.info().then((i) => setVersion(i.version));
  }, []);
  return (
    <Modal title="⚙️ Nastavení" onClose={onClose}>
      <p className="text-lg">
        Verze aplikace: <b>{version}</b>
      </p>
      <p className="mt-3 text-base text-ink/80">{describe(status)}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className={btnPrimary}
          disabled={busy || status?.state === "checking" || status?.state === "downloading"}
          onClick={async () => {
            setBusy(true);
            await window.komensky.updates.check();
            setBusy(false);
          }}
        >
          Zkontrolovat aktualizace
        </button>
        {status?.state === "ready" && !inLesson && (
          <button className={`${btnSoft}`} onClick={() => void window.komensky.updates.install()}>
            Restartovat a aktualizovat
          </button>
        )}
      </div>
      <hr className="my-6 border-brand-soft" />
      <button className={btnSoft} onClick={onAdmin}>
        🔒 Správce (PIN)
      </button>
      <p className="mt-2 text-sm text-ink/60">Postup, přepisy, zálohy a změna klíče jsou pro dospělého za PINem.</p>
    </Modal>
  );
}
