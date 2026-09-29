"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type CourseState, type LessonData, type PublicPart, type PublicQuestion, type Revealed } from "./api";
import Player from "./Player";
import Quiz from "./Quiz";
import Result from "./Result";

type Step =
  | { key: string; kind: "learn"; label: string; part: PublicPart }
  | { key: string; kind: "quiz"; label: string; questions: PublicQuestion[]; warmup?: boolean; doneLabel: string }
  | { key: string; kind: "result"; label: string; resultKind: "final" | "review" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildSteps(l: LessonData): Step[] {
  const steps: Step[] = [];
  if (l.warmup.length) steps.push({ key: "warmup", kind: "quiz", label: "Rozcvička", questions: l.warmup, warmup: true, doneLabel: "Začít lekci" });
  l.parts.forEach((p, i) => {
    steps.push({ key: `${p.id}:learn`, kind: "learn", label: `Část ${i + 1} z ${l.parts.length}: ${p.title}`, part: p });
    steps.push({ key: `${p.id}:quiz`, kind: "quiz", label: `Otázky k části ${i + 1}`, questions: p.questions, doneLabel: i + 1 < l.parts.length ? "Další část" : "K závěrečnému kvízu" });
  });
  steps.push({ key: "final", kind: "quiz", label: "Závěrečný kvíz", questions: l.finalQuiz, doneLabel: "Zobrazit výsledek" });
  steps.push({ key: "result", kind: "result", label: "Výsledek", resultKind: "final" });
  if (l.review) {
    steps.push({ key: `${l.review.id}:learn`, kind: "learn", label: `Opakování ${l.reviewRound}`, part: l.review });
    steps.push({ key: `${l.review.id}:quiz`, kind: "quiz", label: `Opakování ${l.reviewRound}: otázky`, questions: l.review.questions, doneLabel: "Zobrazit výsledek" });
    steps.push({ key: `${l.review.id}:result`, kind: "result", label: "Výsledek opakování", resultKind: "review" });
  }
  return steps;
}

export default function App() {
  const [phase, setPhase] = useState<"boot" | "code" | "loading" | "lesson" | "finished" | "error">("boot");
  const [course, setCourse] = useState<CourseState | null>(null);
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [gen, setGen] = useState({ done: 0, total: 8 });
  const [errMsg, setErrMsg] = useState("");
  const [stepKey, setStepKey] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState(false);
  const startPos = useRef({ segmentIndex: 0, time: 0 });
  const run = useRef(0);

  const steps = useMemo(() => (lesson ? buildSteps(lesson) : []), [lesson]);
  const stepIdx = steps.findIndex((s) => s.key === stepKey);
  const step = steps[stepIdx];

  const savePos = useCallback((lessonId: string, key: string, segmentIndex = 0, time = 0) => {
    void fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, stepKey: key, segmentIndex, time }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const openLesson = useCallback(
    async (id: string, pos: CourseState["position"]) => {
      const my = ++run.current;
      setPhase("loading");
      setGen({ done: 0, total: 8 });
      let failures = 0;
      for (;;) {
        if (my !== run.current) return;
        try {
          let r = await api<LessonData | { status: "generating"; progress: { done: number; total: number } }>(`/api/lesson/${id}`);
          while (r.status !== "ready") {
            if (my !== run.current) return;
            setGen(r.progress);
            const g = await api<{ status: string; busy: boolean; progress: { done: number; total: number } }>(`/api/lesson/${id}/generate`, { json: {} });
            setGen(g.progress);
            failures = 0;
            if (g.busy) await sleep(2500);
            if (g.status === "ready") r = await api<LessonData>(`/api/lesson/${id}`);
          }
          const data = r as LessonData;
          const list = buildSteps(data);
          const keep = pos && pos.lessonId === id && list.some((s) => s.key === pos.stepKey) ? pos : null;
          startPos.current = keep ? { segmentIndex: keep.segmentIndex, time: keep.time } : { segmentIndex: 0, time: 0 };
          setLesson(data);
          setStepKey(keep ? keep.stepKey : list[0].key);
          setPhase("lesson");
          return;
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) return setPhase("code");
          if (++failures > 6) {
            setErrMsg((e as Error).message);
            return setPhase("error");
          }
          await sleep(Math.min(3000 * failures, 12000));
        }
      }
    },
    [],
  );

  const enter = useCallback(
    async (c: CourseState) => {
      setCourse(c);
      if (!c.currentLessonId) return setPhase("finished");
      await openLesson(c.currentLessonId, c.position);
    },
    [openLesson],
  );

  const boot = useCallback(async () => {
    try {
      const a = await api<{ ok: boolean }>("/api/auth");
      if (!a.ok) return setPhase("code");
      await enter(await api<CourseState>("/api/state"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return setPhase("code");
      setErrMsg((e as Error).message);
      setPhase("error");
    }
  }, [enter]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Pre-generate the NEXT lesson in the background while she studies this one.
  const nextId = course?.nextLessonId;
  const lessonId = lesson?.lessonId;
  useEffect(() => {
    if (!lessonId || !nextId || phase !== "lesson") return;
    let stop = false;
    (async () => {
      let fails = 0;
      while (!stop) {
        try {
          const g = await api<{ status: string; busy: boolean }>(`/api/lesson/${nextId}/generate`, { json: {} });
          if (g.status === "ready") return;
          await sleep(g.busy ? 4000 : 600);
        } catch {
          if (++fails > 5) return;
          await sleep(8000);
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [lessonId, nextId, phase]);

  const goTo = (key: string) => {
    if (!lesson) return;
    startPos.current = { segmentIndex: 0, time: 0 };
    setStepKey(key);
    savePos(lesson.lessonId, key, 0, 0);
    window.scrollTo({ top: 0 });
  };
  const nextStep = () => {
    const n = steps[stepIdx + 1];
    if (n) goTo(n.key);
  };

  const onAnswered = (qid: string, r: Revealed) => setLesson((l) => (l ? { ...l, answered: { ...l.answered, [qid]: r } } : l));

  const nextLesson = useCallback(async () => {
    try {
      await enter(await api<CourseState>("/api/state"));
    } catch (e) {
      setErrMsg((e as Error).message);
      setPhase("error");
    }
  }, [enter]);

  const reviewReady = useCallback(async () => {
    if (!lesson) return;
    const fresh = await api<LessonData>(`/api/lesson/${lesson.lessonId}`);
    setLesson(fresh);
    const key = `${fresh.review!.id}:learn`;
    startPos.current = { segmentIndex: 0, time: 0 };
    setStepKey(key);
    savePos(fresh.lessonId, key, 0, 0);
  }, [lesson, savePos]);

  /* ---------- screens ---------- */

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 pb-16 pt-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-brand">Komenský</h1>
          <p className="text-sm text-ink/60">{course?.subject ?? "Matematika pro 3. třídu"}</p>
        </div>
        {course && (
          <button onClick={() => setShowMap(true)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-black/5">
            🗺️ Přehled {course.completed.length}/{course.total}
          </button>
        )}
      </header>
      {children}
      {showMap && course && <Overview course={course} onClose={() => setShowMap(false)} />}
    </div>
  );

  if (phase === "boot") return shell(<p className="mt-20 text-center text-xl">Načítám…</p>);

  if (phase === "code")
    return shell(
      <form
        className="mt-10 flex flex-col gap-3 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/api/auth", { json: { code } });
            setCodeErr(false);
            setPhase("boot");
            void boot();
          } catch {
            setCodeErr(true);
          }
        }}
      >
        <h2 className="text-2xl font-bold">Ahoj! 👋</h2>
        <p>Zadej přístupový kód:</p>
        <input value={code} onChange={(e) => setCode(e.target.value)} type="password" className="rounded-2xl border-2 border-brand-soft px-4 py-3 text-xl outline-none focus:border-brand" />
        {codeErr && <p className="text-bad">Kód nesedí, zkus to znovu.</p>}
        <button className="rounded-2xl bg-brand px-6 py-3 text-xl font-bold text-white">Vstoupit</button>
      </form>,
    );

  if (phase === "error")
    return shell(
      <div className="mt-10 rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
        <p className="text-xl font-bold">Ouha, něco se nepovedlo 😕</p>
        <p className="mt-2 text-sm text-ink/60">{errMsg}</p>
        <button className="mt-4 rounded-2xl bg-brand px-6 py-3 text-lg font-bold text-white" onClick={() => { setPhase("boot"); void boot(); }}>
          Zkusit znovu
        </button>
      </div>,
    );

  if (phase === "finished")
    return shell(
      <div className="mt-10 rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
        <div className="text-6xl">🏆</div>
        <h2 className="mt-2 text-3xl font-extrabold">Gratuluji, kurz máš hotový!</h2>
        <p className="mt-2 text-ink/70">Prošla jsi všech {course?.total} lekcí.</p>
      </div>,
    );

  if (phase === "loading") {
    const pct = Math.min(100, Math.round((gen.done / Math.max(gen.total, 1)) * 100));
    return shell(
      <div className="mt-10 rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
        <div className="text-5xl">📖</div>
        <h2 className="mt-2 text-2xl font-extrabold">Připravuji lekci…</h2>
        <p className="mt-1 text-ink/60">Krok {Math.min(gen.done + 1, gen.total)} z {gen.total}. Chvilku strpení, je to jen poprvé.</p>
        <div className="mx-auto mt-5 h-4 w-full max-w-sm overflow-hidden rounded-full bg-brand-soft">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.max(pct, 6)}%` }} />
        </div>
      </div>,
    );
  }

  if (!lesson || !step) return shell(<p className="mt-20 text-center">…</p>);

  const mainSteps = steps.filter((s) => s.kind !== "result");
  const progressPct = Math.round((Math.max(steps.findIndex((s) => s.key === step.key), 0) / Math.max(steps.length - 1, 1)) * 100);

  return shell(
    <>
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <p className="text-sm font-semibold text-brand">
          Etapa {lesson.stage.id}: {lesson.stage.title} · Lekce {lesson.lessonId}
        </p>
        <h2 className="text-xl font-extrabold leading-tight">{lesson.title}</h2>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-brand-soft" aria-hidden>
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="mt-2 text-sm text-ink/60">
          {step.label} {mainSteps.length ? "" : ""}
        </p>
      </div>

      {step.kind === "learn" && (
        <Player
          key={step.key}
          segments={step.part.segments}
          startIndex={startPos.current.segmentIndex}
          startTime={startPos.current.time}
          onPosition={(i, t) => savePos(lesson.lessonId, step.key, i, t)}
          onFinished={nextStep}
          finishLabel="Teď otázky"
        />
      )}
      {step.kind === "quiz" && (
        <Quiz key={step.key} questions={step.questions} answered={lesson.answered} onAnswered={onAnswered} onDone={nextStep} warmup={step.warmup} doneLabel={step.doneLabel} />
      )}
      {step.kind === "result" && (
        <Result key={step.key} lessonId={lesson.lessonId} kind={step.resultKind} onNext={nextLesson} onReviewReady={reviewReady} />
      )}
    </>,
  );
}

function Overview({ course, onClose }: { course: CourseState; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xl font-extrabold">Přehled kurzu</h3>
          <button onClick={onClose} className="rounded-full bg-brand-soft px-3 py-1 font-bold">✕</button>
        </div>
        {course.srsCount > 0 && <p className="mb-3 rounded-xl bg-warm/25 p-2 text-sm">Na opakování čeká {course.srsCount} příkladů.</p>}
        {course.stages.map((s) => (
          <div key={s.id} className="mb-4">
            <h4 className="font-bold text-brand">Etapa {s.id}: {s.title}</h4>
            <ul className="mt-1 flex flex-col gap-1">
              {s.lessons.map((l) => {
                const done = course.completed.includes(l.id);
                const cur = course.currentLessonId === l.id;
                return (
                  <li key={l.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${cur ? "bg-brand-soft font-semibold" : ""}`}>
                    <span>{done ? "✅" : cur ? "▶️" : "🔒"}</span>
                    <span className={done || cur ? "" : "text-ink/50"}>
                      {l.id} {l.title}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
