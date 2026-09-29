"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ttsUrl } from "./tts";
import { splitSentences } from "@/lib/speech";

interface Props {
  segments: { id: string; text: string }[];
  startIndex: number;
  startTime: number;
  onPosition: (segmentIndex: number, time: number) => void;
  onFinished: () => void;
  finishLabel: string;
}

const RATES = [0.75, 1, 1.25, 1.5];

export default function Player({ segments, startIndex, startTime, onPosition, onFinished, finishLabel }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const urls = useRef(new Map<number, Promise<string>>());
  const lastReport = useRef(0);
  const wantPlay = useRef(false);
  const loadToken = useRef(0);

  const [idx, setIdx] = useState(Math.min(startIndex, segments.length - 1));
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    try {
      const r = Number(localStorage.getItem("komensky_rate"));
      if (RATES.includes(r)) setRate(r);
    } catch {}
  }, []);

  const fetchUrl = useCallback(
    (i: number) => {
      let p = urls.current.get(i);
      if (!p) {
        p = ttsUrl(segments[i].text);
        p.catch(() => urls.current.delete(i)); // allow retry
        urls.current.set(i, p);
      }
      return p;
    },
    [segments],
  );

  const prefetch = useCallback(
    async (from: number) => {
      // Sequential, so the first segment is never slowed down by later ones.
      for (const i of [from + 1, from + 2]) {
        if (i < segments.length) await fetchUrl(i).catch(() => {});
      }
    },
    [fetchUrl, segments.length],
  );

  const load = useCallback(
    async (i: number, autoplay: boolean, seek = 0) => {
      const token = ++loadToken.current;
      const audio = audioRef.current;
      if (!audio) return;
      wantPlay.current = autoplay;
      setIdx(i);
      setLoading(true);
      setError(null);
      setFinished(false);
      setT(seek);
      setDur(0);
      audio.pause();
      try {
        const url = await fetchUrl(i);
        if (token !== loadToken.current) return;
        audio.src = url;
        audio.playbackRate = rate;
        audio.onloadedmetadata = () => {
          if (token !== loadToken.current) return;
          if (seek > 0 && seek < audio.duration - 0.5) audio.currentTime = seek;
          setDur(audio.duration);
          setLoading(false);
          if (wantPlay.current) audio.play().catch(() => setPlaying(false));
        };
        audio.load();
        void prefetch(i);
      } catch (e) {
        if (token !== loadToken.current) return;
        setLoading(false);
        setError((e as Error).message || "Hlas se nepodařilo načíst.");
      }
    },
    [fetchUrl, prefetch, rate],
  );

  // initial load (does not autoplay: browsers need a tap first)
  useEffect(() => {
    void load(Math.min(startIndex, segments.length - 1), false, startTime);
    return () => {
      loadToken.current++;
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = useCallback(
    (force = false) => {
      const a = audioRef.current;
      if (!a) return;
      const now = Date.now();
      if (force || now - lastReport.current > 4000) {
        lastReport.current = now;
        onPosition(idx, a.currentTime || 0);
      }
    },
    [idx, onPosition],
  );

  useEffect(() => {
    const h = () => document.visibilityState === "hidden" && report(true);
    document.addEventListener("visibilitychange", h);
    window.addEventListener("pagehide", h);
    return () => {
      document.removeEventListener("visibilitychange", h);
      window.removeEventListener("pagehide", h);
    };
  }, [report]);

  // the "ask the teacher" panel pauses the lesson while it talks
  useEffect(() => {
    const h = () => {
      wantPlay.current = false;
      audioRef.current?.pause();
    };
    window.addEventListener("komensky:pause", h);
    return () => window.removeEventListener("komensky:pause", h);
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (error) return void load(idx, true, 0);
    if (a.paused) {
      wantPlay.current = true;
      if (finished) return void load(0, true, 0);
      void a.play().catch(() => setPlaying(false));
    } else {
      wantPlay.current = false;
      a.pause();
    }
  };

  const go = (i: number) => {
    const n = Math.max(0, Math.min(segments.length - 1, i));
    const wasPlaying = wantPlay.current || playing;
    onPosition(n, 0);
    void load(n, wasPlaying, 0);
  };

  const changeRate = (r: number) => {
    setRate(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
    try {
      localStorage.setItem("komensky_rate", String(r));
    } catch {}
  };

  const sentences = useMemo(() => segments.map((s) => splitSentences(s.text)), [segments]);
  const activeSentence = useMemo(() => {
    const ss = sentences[idx] ?? [];
    const total = ss.reduce((n, s) => n + s.length, 0) || 1;
    const frac = dur > 0 ? Math.min(t / dur, 0.999) : 0;
    let acc = 0;
    for (let k = 0; k < ss.length; k++) {
      acc += ss[k].length / total;
      if (frac < acc) return k;
    }
    return ss.length - 1;
  }, [sentences, idx, t, dur]);

  const activeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [idx]);

  const pct = segments.length ? ((idx + (dur ? t / dur : 0)) / segments.length) * 100 : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-4">
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          report(true);
        }}
        onTimeUpdate={(e) => {
          setT(e.currentTarget.currentTime);
          report();
        }}
        onEnded={() => {
          if (idx < segments.length - 1) void load(idx + 1, true, 0);
          else {
            setPlaying(false);
            setFinished(true);
            wantPlay.current = false;
            onPosition(idx, 0);
          }
        }}
        onError={() => {
          if (audioRef.current?.src) setError("Přehrávání selhalo.");
        }}
      />

      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="mb-3 h-3 w-full overflow-hidden rounded-full bg-brand-soft" aria-label="Postup výkladem">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => go(idx - 1)}
            disabled={idx === 0}
            className="h-12 w-12 rounded-full bg-brand-soft text-xl"
            aria-label="Předchozí úsek"
          >
            ⏮
          </button>
          <button
            onClick={toggle}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-brand text-4xl text-white shadow-lg active:scale-95"
            aria-label={playing ? "Pauza" : "Přehrát"}
          >
            {loading && !error ? <span className="animate-pulse text-2xl">…</span> : playing ? "⏸" : "▶"}
          </button>
          <button
            onClick={() => (idx < segments.length - 1 ? go(idx + 1) : setFinished(true))}
            className="h-12 w-12 rounded-full bg-brand-soft text-xl"
            aria-label="Další úsek"
          >
            ⏭
          </button>
        </div>
        <div className="mt-2 text-center text-sm text-ink/60">
          Úsek {idx + 1} z {segments.length} · {fmt(t)}
          {dur ? ` / ${fmt(dur)}` : ""}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="text-sm text-ink/60">Rychlost</span>
          {RATES.map((r) => (
            <button
              key={r}
              onClick={() => changeRate(r)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${rate === r ? "bg-brand text-white" : "bg-brand-soft"}`}
            >
              {r}×
            </button>
          ))}
        </div>
        {error && (
          <p className="mt-3 rounded-xl bg-bad-soft p-3 text-center text-sm text-bad">
            Hlas se nepodařilo načíst ({error}). Klepni na ▶ pro nový pokus, nebo si text přečti níže.
          </p>
        )}
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink/50">Text</h3>
        <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto pr-1 text-lg leading-relaxed">
          {segments.map((s, i) => (
            <p
              key={s.id}
              ref={i === idx ? activeRef : undefined}
              onClick={() => go(i)}
              className={`cursor-pointer rounded-xl p-2 transition-colors ${i === idx ? "bg-brand-soft" : "opacity-70 hover:opacity-100"}`}
            >
              {sentences[i].map((sen, k) => (
                <span key={k} className={i === idx && k === activeSentence ? "rounded bg-warm/70 px-0.5 font-semibold" : ""}>
                  {sen}{" "}
                </span>
              ))}
            </p>
          ))}
        </div>
      </div>

      {finished ? (
        <button onClick={onFinished} className="rounded-2xl bg-good px-6 py-4 text-xl font-bold text-white shadow-md active:scale-95">
          {finishLabel} →
        </button>
      ) : (
        <button onClick={onFinished} className="self-center text-sm text-ink/50 underline">
          Přeskočit výklad a jít na otázky
        </button>
      )}
    </div>
  );
}
