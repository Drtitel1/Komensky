import { useCallback, useEffect, useState } from "react";
import type { OpenLesson, Overview } from "@shared/ipc";
import type { Curriculum } from "@shared/types";
import UpdateBanner, { useUpdateStatus } from "./components/UpdateBanner";
import Admin from "./screens/Admin";
import Home from "./screens/Home";
import LessonScreen from "./screens/LessonScreen";
import SettingsModal from "./screens/SettingsModal";
import Setup from "./screens/Setup";

type Phase = "boot" | "setup" | "home" | "lesson" | "error";

export default function App() {
  const api = window.komensky;
  const [phase, setPhase] = useState<Phase>("boot");
  const [ov, setOv] = useState<Overview | null>(null);
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [lesson, setLesson] = useState<OpenLesson | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<"settings" | "admin" | null>(null);
  const update = useUpdateStatus();
  const [version, setVersion] = useState("");
  useEffect(() => {
    void api.app.info().then((i) => setVersion(i.version));
  }, [api]);

  const refresh = useCallback(async () => {
    setOv(await api.progress.overview());
  }, [api]);

  const boot = useCallback(async () => {
    try {
      const st = await api.setup.status();
      setCurriculum(await api.content.curriculum());
      if (!st.hasKey || !st.hasPin) return setPhase("setup");
      await refresh();
      setPhase("home");
    } catch (e) {
      setErr((e as Error).message);
      setPhase("error");
    }
  }, [api, refresh]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const start = async () => {
    if (!ov?.currentLessonId) return;
    setBusy(true);
    setErr(null);
    const r = await api.lesson.open(ov.currentLessonId);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setLesson(r.data);
    setPhase("lesson");
  };

  const exitLesson = async () => {
    setLesson(null);
    await refresh();
    setPhase("home");
  };

  const inLesson = phase === "lesson";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-6 py-3">
        <div>
          <h1 className="text-2xl font-extrabold text-brand">
            Komenský <span className="ml-1 align-middle text-sm font-semibold text-ink/40" data-testid="version">{version && `verze ${version}`}</span>
          </h1>
          <p className="text-sm text-ink/60">{ov?.subject ?? "Matematika pro 3. třídu"}</p>
        </div>
        {phase !== "setup" && phase !== "boot" && (
          <button onClick={() => setModal("settings")} className="rounded-full bg-white px-4 py-2 font-bold shadow-sm ring-1 ring-black/5" aria-label="Nastavení">
            ⚙️ Nastavení
          </button>
        )}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {phase === "boot" && <p className="mt-24 text-center text-2xl">Načítám…</p>}
        {phase === "error" && (
          <div className="mx-auto mt-24 max-w-md rounded-3xl bg-white p-8 text-center shadow-sm">
            <p className="text-2xl font-bold">Ouha, něco se nepovedlo 😕</p>
            <p className="mt-2 text-base text-ink/60">{err}</p>
            <button className="mt-4 rounded-2xl bg-brand px-6 py-3 text-lg font-bold text-white" onClick={() => { setPhase("boot"); void boot(); }}>Zkusit znovu</button>
          </div>
        )}
        {phase === "setup" && <Setup onDone={() => void boot()} />}
        {phase === "home" && ov && <Home ov={ov} onStart={start} busy={busy} error={err} />}
        {phase === "lesson" && lesson && <LessonScreen key={lesson.lesson.id} data={lesson} onExit={exitLesson} />}
      </main>
      <UpdateBanner status={update} inLesson={inLesson} />
      {modal === "settings" && <SettingsModal status={update} inLesson={inLesson} onClose={() => setModal(null)} onAdmin={() => setModal("admin")} />}
      {modal === "admin" && curriculum && <Admin curriculum={curriculum} inLesson={inLesson} onClose={() => { setModal(null); void refresh(); }} />}
    </div>
  );
}
