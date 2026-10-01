import { useCallback, useEffect, useRef, useState } from "react";
import { cleanTutorText } from "@shared/czech";
import { LessonEngine, type EngineView } from "@shared/engine";
import type { OpenLesson } from "@shared/ipc";
import { LiveConnection, type ConnState } from "../live/connection";
import { MicCapture, Playback } from "../live/audio";

export interface UiMsg {
  id: number;
  role: "user" | "model";
  text: string;
}

const MAX_HOLD_MS = 60_000; // a forgotten button must not stream audio forever
const MIN_ANSWER_MS = 400; // shorter presses count as accidental taps
const THINK_TIMEOUT_MS = 12_000;

/** Czech, human-readable reason why the microphone cannot be used. */
export function micErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Aplikace nemá povolený mikrofon. Otevři Nastavení Windows → Soukromí a zabezpečení → Mikrofon a zapni „Povolit desktopovým aplikacím přístup k mikrofonu“.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Nenašla jsem žádný mikrofon. Zapoj mikrofon (nebo sluchátka s mikrofonem) a zkus to znovu.";
  if (name === "NotReadableError" || name === "AbortError") return "Mikrofon právě používá jiná aplikace (např. Teams, Zoom). Zavři ji a zkus to znovu.";
  return `Mikrofon se nepodařilo zapnout (${(e as Error)?.message ?? "neznámá chyba"}).`;
}

export function useLessonSession(data: OpenLesson, onFinished: () => void) {
  const api = window.komensky;
  const [view, setView] = useState<EngineView | null>(null);
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [conn, setConn] = useState<ConnState>("idle");
  const [connMsg, setConnMsg] = useState<string>("");
  const [speaking, setSpeaking] = useState(false);
  const [held, setHeld] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [micProblem, setMicProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const engine = useRef<LessonEngine | null>(null);
  const connection = useRef<LiveConnection | null>(null);
  const mic = useRef<MicCapture | null>(null);
  const play = useRef<Playback | null>(null);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const idc = useRef(0);
  const open = useRef<{ user: number | null; model: number | null }>({ user: null, model: null });
  const usage = useRef({ turns: 0, prompt: 0, response: 0, promptAudio: 0, responseAudio: 0 });
  const texts = useRef(new Map<number, string>());
  const finishedRef = useRef(false);
  const startedEngine = useRef(false);
  const heldRef = useRef(false);
  const heldAt = useRef(0);
  const capTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const thinkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lessonId = data.lesson.id;

  const phaseNow = () => engine.current?.state.phase ?? "";
  const flash = useCallback((text: string) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  const closeMsg = useCallback(
    (role: "user" | "model") => {
      const id = open.current[role];
      if (id === null) return;
      open.current[role] = null;
      const text = (texts.current.get(id) ?? "").trim();
      texts.current.delete(id);
      const shown = role === "model" ? cleanTutorText(text).trim() : text;
      if (shown) void api.lesson.transcript(lessonId, role, shown, phaseNow());
    },
    [api, lessonId],
  );

  const addText = useCallback(
    (role: "user" | "model", text: string) => {
      const other = role === "user" ? "model" : "user";
      closeMsg(other);
      let id = open.current[role];
      if (id === null) {
        id = ++idc.current;
        open.current[role] = id;
        const nid = id;
        texts.current.set(nid, text);
        setMsgs((all) => [...all.slice(-60), { id: nid, role, text: role === "model" ? cleanTutorText(text) : text }]);
      } else {
        const cur = id;
        texts.current.set(cur, (texts.current.get(cur) ?? "") + text);
        setMsgs((all) => all.map((m) => (m.id === cur ? { ...m, text: role === "model" ? cleanTutorText(m.text + text) : m.text + text } : m)));
      }
    },
    [closeMsg],
  );

  /* ---------- push-to-talk ---------- */

  /** The child lets go (or something forces a release). `send` = tell the server the answer is complete. */
  const release = useCallback((send: boolean) => {
    if (!heldRef.current) return;
    heldRef.current = false;
    clearTimeout(capTimer.current);
    if (mic.current) mic.current.capturing = false; // stop forwarding audio BEFORE activityEnd
    setHeld(false);
    engine.current?.setUserSpeaking(false);
    if (!send) return;
    const dur = performance.now() - heldAt.current;
    connection.current?.activityEnd();
    if (dur >= MIN_ANSWER_MS) {
      engine.current?.noteUserTranscript();
      setThinking(true);
      clearTimeout(thinkTimer.current);
      thinkTimer.current = setTimeout(() => setThinking(false), THINK_TIMEOUT_MS);
    }
  }, []);

  const pttDown = useCallback(() => {
    const e = engine.current;
    if (heldRef.current || !e || finishedRef.current) return;
    if (e.paused) return flash("Lekce je pozastavená. Klepni na „Pokračovat“.");
    const c = connection.current;
    if (!c || !c.isOpen) return flash("Ještě se připojuji k učiteli, chvilku strpení…");
    if (!mic.current?.alive) {
      setMicProblem((p) => p ?? "Mikrofon není připojený. Zapoj ho a klepni na „Zkusit znovu“.");
      return;
    }
    // barge-in: the tutor stops immediately on this side; activityStart makes the server stop generating too
    play.current?.flush();
    e.setModelSpeaking(false);
    if (!c.activityStart()) return flash("Spojení se právě přerušilo, zkus to za chvilku.");
    heldRef.current = true;
    heldAt.current = performance.now();
    mic.current.capturing = true;
    setHeld(true);
    setThinking(false);
    setNotice(null);
    e.setUserSpeaking(true);
    clearTimeout(capTimer.current);
    capTimer.current = setTimeout(() => release(true), MAX_HOLD_MS);
  }, [flash, release]);

  const pttUp = useCallback(() => release(true), [release]);
  const retryConnection = useCallback(() => void connection.current?.retry(), []);

  // Space = hold to talk (not while typing in a field or while a dialog is open); losing focus lets go
  useEffect(() => {
    if (!started) return;
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const dialogOpen = () => !!document.querySelector("[data-modal]");
    const down = (ev: KeyboardEvent) => {
      if (ev.code !== "Space" || typing(ev.target) || dialogOpen()) return;
      ev.preventDefault();
      if (!ev.repeat) pttDown();
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code !== "Space" || typing(ev.target)) return;
      ev.preventDefault();
      pttUp();
    };
    const lost = () => release(true);
    const hidden = () => document.visibilityState === "hidden" && release(true);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", lost);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", lost);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [started, pttDown, pttUp, release]);

  // a dropped connection ends an answer in progress (nothing more can be sent)
  useEffect(() => {
    if (conn !== "open" && heldRef.current) {
      release(false);
      flash("Spojení se přerušilo. Až se obnoví, zkus to ještě jednou.");
    }
  }, [conn, release, flash]);

  /* ---------- lifecycle ---------- */

  const teardown = useCallback(() => {
    const u = usage.current;
    if (u.turns) {
      // rough cost from the published Gemini 3.8 Live prices per 1M tokens: audio in $3, audio out $12, text in $0.75, text out $4.5
      const cost = (u.promptAudio * 3 + u.responseAudio * 12 + (u.prompt - u.promptAudio) * 0.75 + (u.response - u.responseAudio) * 4.5) / 1e6;
      api.log("info", `lesson ${lessonId} usage: ${u.turns} reports, prompt ${u.prompt} (audio ${u.promptAudio}), response ${u.response} (audio ${u.responseAudio}) tokens, ~$${cost.toFixed(2)}`);
      usage.current = { turns: 0, prompt: 0, response: 0, promptAudio: 0, responseAudio: 0 };
    }
    heldRef.current = false;
    clearTimeout(capTimer.current);
    clearTimeout(thinkTimer.current);
    timers.current.forEach(clearInterval);
    timers.current = [];
    mic.current?.stop();
    mic.current = null;
    connection.current?.close();
    connection.current = null;
    play.current?.close();
    play.current = null;
    void api.lesson.setActive(false);
  }, [api, lessonId]);

  const openMic = useCallback(async () => {
    mic.current?.stop();
    const m = new MicCapture();
    await m.start({
      onChunk: (b64) => connection.current?.sendAudio(b64),
      onLevel: () => undefined,
      onEnded: () => {
        release(false);
        setMicProblem("Mikrofon byl odpojen. Zapoj ho a klepni na „Zkusit znovu“.");
      },
    });
    mic.current = m;
  }, [release]);

  /** After the microphone was unplugged / blocked: try to get it again. */
  const retryMic = useCallback(async () => {
    try {
      await openMic();
      setMicProblem(null);
    } catch (e) {
      setMicProblem(micErrorMessage(e));
    }
  }, [openMic]);

  const start = useCallback(async () => {
    if (started) return;
    setError(null);
    try {
      const playback = new Playback();
      await playback.resumeContext();
      play.current = playback;

      const eng = new LessonEngine(
        data.plan,
        data.lesson,
        data.state,
        data.warmup,
        {
          sendControl: (t) => connection.current?.sendControl(t),
          save: (s) => void api.lesson.saveState(s),
          onAnswer: (rec, q) => void api.lesson.recordAnswer(rec, q),
          onChange: () => setView(eng.view()),
          onFlag: (topic) => api.log("warn", `flag_uncertain: ${topic}`),
          onCompleted: (score, weak) => {
            void api.lesson.complete(lessonId, score, weak).then(() => {
              finishedRef.current = true;
              setFinished(true);
              // let the teacher finish the last words, then release the microphone and the connection
              setTimeout(teardown, 12_000);
              onFinished();
            });
          },
        },
        data.nextTitle,
      );
      engine.current = eng;
      setView(eng.view());

      const c = new LiveConnection(
        (summary) => api.live.token({ lessonId, summary }),
        {
          onState: (s, m) => {
            setConn(s);
            setConnMsg(m ?? "");
          },
          onFreshSession: () => {
            if (!startedEngine.current) {
              startedEngine.current = true;
              engine.current?.start();
            } else engine.current?.resync();
          },
          onResumed: () => undefined,
          onAudio: (b64) => {
            setThinking(false);
            if (!heldRef.current) play.current?.push(b64); // while she holds the button the tutor stays quiet
          },
          onInputTranscript: (t) => {
            engine.current?.noteUserTranscript();
            addText("user", t);
          },
          onOutputTranscript: (t) => addText("model", t),
          onTurnComplete: () => {
            setThinking(false);
            closeMsg("model");
          },
          onInterrupted: () => {
            play.current?.flush();
            closeMsg("model");
          },
          onUsage: (u) => {
            usage.current = { turns: usage.current.turns + 1, prompt: usage.current.prompt + u.prompt, response: usage.current.response + u.response, promptAudio: usage.current.promptAudio + u.promptAudio, responseAudio: usage.current.responseAudio + u.responseAudio };
          },
          onToolCalls: (calls) => {
            for (const call of calls) {
              const res = engine.current?.toolCall(call.name, call.args) ?? { ok: false, message: "žádná lekce" };
              connection.current?.sendToolResponse(call.id, call.name, { result: res.ok ? "ok" : "error", ...(res.message ? { message: res.message } : {}) });
            }
          },
        },
        () => engine.current?.summary() ?? "",
      );
      connection.current = c;

      await openMic(); // asks for permission; errors are reported below in Czech
      await api.lesson.setActive(true);
      setStarted(true);
      await c.open();

      // lesson clock + fast poll for "is the tutor talking"
      let last = performance.now();
      // automated tests may speed the clock up (window.__KOMENSKY_TIME_SCALE); it is always 1 for real users
      const scale = (window as unknown as { __KOMENSKY_TIME_SCALE?: number }).__KOMENSKY_TIME_SCALE ?? 1;
      timers.current.push(
        setInterval(() => {
          const now = performance.now();
          const dt = Math.min((now - last) / 1000, 3) * scale;
          last = now;
          engine.current?.tick(dt);
        }, 1000),
        setInterval(() => {
          const p = play.current;
          if (!p) return;
          const model = p.playing || performance.now() - p.lastChunkAt < 900;
          setSpeaking(model);
          engine.current?.setModelSpeaking(model);
        }, 100),
      );
    } catch (e) {
      teardown();
      setStarted(false);
      startedEngine.current = false;
      const name = (e as { name?: string }).name ?? "";
      setError(["NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError", "SecurityError", "AbortError"].includes(name) ? micErrorMessage(e) : `Lekci se nepodařilo spustit: ${(e as Error).message}`);
    }
  }, [addText, api, closeMsg, data, lessonId, onFinished, openMic, started, teardown]);

  const togglePause = useCallback(async () => {
    const e = engine.current;
    if (!e || finishedRef.current) return;
    if (e.paused) {
      await play.current?.resume();
      e.resume();
    } else {
      release(true);
      e.pause();
      play.current?.flush();
      await play.current?.suspend();
    }
    setView(e.view());
  }, [release]);

  /** Leave the lesson; progress is already saved and the next start resumes at the same part and state. */
  const leave = useCallback(() => {
    if (engine.current && !finishedRef.current) void api.lesson.saveState(structuredClone(engine.current.state));
    closeMsg("model");
    closeMsg("user");
    teardown();
  }, [api, closeMsg, teardown]);

  useEffect(() => {
    const save = () => engine.current && !finishedRef.current && void api.lesson.saveState(structuredClone(engine.current.state));
    window.addEventListener("beforeunload", save);
    return () => {
      window.removeEventListener("beforeunload", save);
      clearTimeout(capTimer.current);
      clearTimeout(thinkTimer.current);
      clearTimeout(noticeTimer.current);
      timers.current.forEach(clearInterval);
      mic.current?.stop();
      connection.current?.close();
      play.current?.close();
      void api.lesson.setActive(false);
    };
  }, [api]);

  return { view, msgs, conn, connMsg, speaking, held, thinking, micProblem, notice, started, error, finished, start, togglePause, leave, pttDown, pttUp, retryMic, retryConnection };
}
