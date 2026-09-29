import { useEffect, useState } from "react";
import type { UpdateStatus } from "@shared/ipc";
import { btn } from "./ui";

/** Czech update prompt. It is only shown OUTSIDE an active lesson; "Později" installs on quit. */
export function useUpdateStatus() {
  const [st, setSt] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    void window.komensky.updates.status().then(setSt);
    const off = window.komensky.updates.onStatus(setSt);
    return () => {
      off();
    };
  }, []);
  return st;
}

export default function UpdateBanner({ status, inLesson }: { status: UpdateStatus | null; inLesson: boolean }) {
  const [later, setLater] = useState<string | null>(null);
  if (!status || status.state !== "ready" || inLesson || later === status.next) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
      <div className="flex max-w-2xl flex-wrap items-center gap-3 rounded-3xl bg-ink px-6 py-4 text-white shadow-xl">
        <p className="text-lg font-bold">Je dostupná nová verze {status.next} – restartovat a aktualizovat?</p>
        <div className="ml-auto flex gap-2">
          <button className={`${btn} bg-good text-white`} onClick={() => void window.komensky.updates.install()}>
            Teď
          </button>
          <button className={`${btn} bg-white/20 text-white`} onClick={() => setLater(status.next)}>
            Později
          </button>
        </div>
      </div>
    </div>
  );
}
