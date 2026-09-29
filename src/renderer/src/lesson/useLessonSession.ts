import { useCallback, useEffect, useRef, useState } from "react";
import { LessonEngine, type EngineView } from "@shared/engine";
import type { OpenLesson } from "@shared/ipc";
import { LiveConnection, type ConnState } from "../live/connection";
import { MicCapture, Playback } from "../live/audio";

export interface UiMsg {
  id: number;
  role: "user" | "model";
  text: string;
}

const VOICE_RMS = 0.03; // local voice-activity threshold (only used while the teacher is silent)

export function useLessonSession(data: OpenLesson, onFinished: () => void) {
  const api = window.komensky;
  const [view, setView] = useState<EngineView | null>(null);
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [conn, setConn] = useState<ConnState>("idle");
  const [connMsg, setConnMsg] = useState<string>("");
  const [speaking, setSpeaking] = useState(false);
  const [talking, setTalking] = useState(false);
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
  const voiceUntil = useRef(0);
  const voiceRun = useRef(0);
  const transcriptUntil = useRef(0);
  const finishedRef = useRef(false);
  const startedEngine = useRef(false);
  const speakingNow = useRef(false);
  const lessonId = data.lesson.id;

  const phaseNow = () => engine.current?.state.phase ?? "";

  const closeMsg = useCallback(
    (role: "user" | "model") => {
      const id = open.current[role];
      if (id === null) return;
      open.current[role] = null;
      const text = (texts.current.get(id) ?? "").trim();
      texts.current.delete(id);
      if (text) void api.lesson.transcript(lessonId, role, text, phaseNow());
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
        setMsgs((all) => [...all.slice(-60), { id: nid, role, text }]);
      } else {
        const cur = id;
        texts.current.set(cur, (texts.current.get(cur) ?? "") + text);
        setMsgs((all) => all.map((m) => (m.id === cur ? { ...m, text: m.text + text } : m)));
      }
    },
    [closeMsg],
  );

  const teardown = useCallback(() => {
    const u = usage.current;
    if (u.turns) {
      // rough cost from the published Gemini 3.8 Live prices per 1M tokens: audio in $3, audio out $12, text in $0.75, text out $4.5
      const cost = (u.promptAudio * 3 + u.responseAudio * 12 + (u.prompt - u.promptAudio) * 0.75 + (u.response - u.responseAudio) * 4.5) / 1e6;
      api.log("info", `lesson ${lessonId} usage: ${u.turns} reports, prompt ${u.prompt} (audio ${u.promptAudio}), response ${u.response} (audio ${u.responseAudio}) tokens, ~$${cost.toFixed(2)}`);
      usage.current = { turns: 0, prompt: 0, response: 0, promptAudio: 0, responseAudio: 0 };
    }
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
          onAudio: (b64) => play.current?.push(b64),
          onInputTranscript: (t) => {
            transcriptUntil.current = performance.now() + 1500;
            engine.current?.noteUserTranscript();
            addText("user", t);
          },
          onOutputTranscript: (t) => addText("model", t),
          onTurnComplete: () => closeMsg("model"),
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

      const m = new MicCapture();
      mic.current = m;
      await m.start({
        onChunk: (b64) => connection.current?.sendAudio(b64),
        onLevel: (rms) => {
          if (rms > VOICE_RMS && !speakingNow.current) voiceUntil.current = performance.now() + 900;
        },
      });

      await api.lesson.setActive(true);
      setStarted(true);
      await c.open();

      // one-second lesson clock + fast poll for "who is talking"
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
          const now = performance.now();
          const model = p.playing || now - p.lastChunkAt < 900;
          const raw = now < voiceUntil.current;
          voiceRun.current = raw ? voiceRun.current + 100 : 0;
          // constant background noise is not "the child is speaking"
          const user = (raw && voiceRun.current < 8000) || now < transcriptUntil.current;
          speakingNow.current = model;
          setSpeaking(model);
          setTalking(user && !model);
          engine.current?.setModelSpeaking(model);
          engine.current?.setUserSpeaking(user);
        }, 100),
      );
    } catch (e) {
      const err = e as Error & { name?: string };
      teardown();
      setStarted(false);
      startedEngine.current = false;
      setError(
        err.name === "NotAllowedError" || err.name === "NotFoundError"
          ? "Mikrofon není dostupný. Zkontrolujte, že je zapojený a že aplikace smí mikrofon používat (Nastavení Windows → Soukromí → Mikrofon)."
          : `Lekci se nepodařilo spustit: ${err.message}`,
      );
    }
  }, [addText, api, closeMsg, data, lessonId, onFinished, started, teardown]);

  const togglePause = useCallback(async () => {
    const e = engine.current;
    if (!e || finishedRef.current) return;
    if (e.paused) {
      await play.current?.resume();
      if (mic.current) mic.current.muted = false;
      e.resume();
    } else {
      e.pause();
      if (mic.current) mic.current.muted = true;
      play.current?.flush();
      await play.current?.suspend();
    }
    setView(e.view());
  }, []);

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
      timers.current.forEach(clearInterval);
      mic.current?.stop();
      connection.current?.close();
      play.current?.close();
      void api.lesson.setActive(false);
    };
  }, [api]);

  return { view, msgs, conn, connMsg, speaking, talking, started, error, finished, start, togglePause, leave };
}
