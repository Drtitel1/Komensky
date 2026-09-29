import type { ReactNode } from "react";

export const btn = "rounded-2xl px-6 py-3 text-lg font-bold shadow-sm active:scale-95 transition";
export const btnPrimary = `${btn} bg-brand text-white`;
export const btnGood = `${btn} bg-good text-white`;
export const btnSoft = `${btn} bg-brand-soft text-ink`;
export const field = "w-full rounded-xl border-2 border-brand-soft bg-white px-4 py-2.5 outline-none focus:border-brand select-text";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 ${className}`}>{children}</div>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-white p-6 ${wide ? "max-w-3xl" : "max-w-lg"}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-2xl font-extrabold">{title}</h3>
          {onClose && (
            <button onClick={onClose} className="rounded-full bg-brand-soft px-3 py-1 font-bold" aria-label="Zavřít">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
