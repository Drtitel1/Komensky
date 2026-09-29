import { api } from "./api";

/**
 * Realtime speech-to-text with ElevenLabs Scribe over a WebSocket opened straight from the browser
 * (single-use token from our server). Audio is captured immediately and buffered while the connection is
 * being set up, so no words are lost and the answer is ready right after the child stops speaking.
 */
export interface MicHandlers {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onState?: (s: "connecting" | "listening") => void;
}

export interface MicSession {
  /** Stop recording; the final transcript is delivered through onFinal. */
  stop: () => void;
  cancel: () => void;
}

const RATE = 16000;

const WORKLET = `
class Cap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor("cap", Cap);`;

function toBase64(i16: Int16Array): string {
  const bytes = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function startMic(h: MicHandlers): Promise<MicSession> {
  h.onState?.("connecting");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  void ctx.resume();
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" })));
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "cap");
  src.connect(node);

  let ws: WebSocket | null = null;
  let open = false;
  let finished = false;
  let stopping = false;
  let text = "";
  let partial = "";
  const queue: string[] = [];
  let carry: number[] = [];
  const ratio = ctx.sampleRate / RATE;
  let pos = 0;
  let langFallback = false;

  const finish = (t: string) => {
    if (finished) return;
    finished = true;
    cleanup();
    h.onFinal(t.trim());
  };
  const cleanup = () => {
    clearTimeout(hardStop);
    clearTimeout(stopTimer);
    try {
      node.disconnect();
      src.disconnect();
    } catch {}
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => {});
    try {
      ws?.close();
    } catch {}
  };
  const sendChunk = (b64: string, commit = false) => {
    if (open && ws) {
      if (ws.readyState !== WebSocket.OPEN) return; // connection already gone: onclose reports it
      try {
        ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: b64, commit, sample_rate: RATE }));
      } catch {}
    } else if (b64) queue.push(b64);
  };

  // resample the microphone signal (usually 44.1/48 kHz) to 16 kHz PCM, 100 ms per message
  let out: number[] = [];
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (finished || stopping) return;
    const input = e.data;
    for (let i = 0; i < input.length; i++) carry.push(input[i]);
    while (pos + 1 < carry.length) {
      const i0 = Math.floor(pos);
      const f = pos - i0;
      const v = carry[i0] * (1 - f) + carry[i0 + 1] * f;
      out.push(Math.max(-1, Math.min(1, v)) * 0x7fff);
      pos += ratio;
    }
    const drop = Math.floor(pos);
    if (drop > 0) {
      carry = carry.slice(drop);
      pos -= drop;
    }
    if (out.length >= 1600) {
      sendChunk(toBase64(Int16Array.from(out)));
      out = [];
    }
  };

  const hardStop = setTimeout(() => api_stop(), 25000);
  let stopTimer: ReturnType<typeof setTimeout>;

  const api_stop = () => {
    if (stopping || finished) return;
    stopping = true;
    if (out.length) {
      sendChunk(toBase64(Int16Array.from(out)));
      out = [];
    }
    sendChunk("", true); // ask the server to commit what it has
    // if the server does not answer quickly, use the best text we have
    stopTimer = setTimeout(() => finish(text || partial), 1500);
  };

  const connect = async () => {
    let token: string;
    try {
      ({ token } = await api<{ token: string }>("/api/stt-token", { json: {} }));
    } catch (e) {
      if (!finished) {
        finished = true;
        cleanup();
        h.onError((e as Error).message);
      }
      return;
    }
    const p = new URLSearchParams({ model_id: "scribe_v2_realtime", audio_format: "pcm_16000", commit_strategy: "vad", vad_silence_threshold_secs: "0.8", token });
    if (!langFallback) p.set("language_code", "cs");
    const sock = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${p}`);
    ws = sock;
    ws.onopen = () => {
      open = true;
      h.onState?.("listening");
      for (const b of queue.splice(0)) sendChunk(b);
      if (stopping) sendChunk("", true);
    };
    ws.onmessage = (ev) => {
      if (ws !== sock) return;
      let m: { message_type?: string; text?: string; error?: string; message?: string };
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (m.message_type === "partial_transcript") {
        partial = m.text ?? "";
        h.onPartial((text + " " + partial).trim());
      } else if (m.message_type === "committed_transcript") {
        const t = (m.text ?? "").trim();
        if (t) {
          text = (text + " " + t).trim();
          partial = "";
          h.onPartial(text);
          finish(text); // VAD committed (or our commit answered): the sentence is done
        } else if (stopping) finish(text);
      } else if (m.message_type && /error/.test(m.message_type)) {
        const msg = m.error ?? m.message ?? m.message_type;
        if (!langFallback && /language/i.test(msg) && !text) {
          // language code not accepted here: reconnect with automatic detection
          langFallback = true;
          open = false;
          const old = ws;
          ws = null; // marks the old socket as stale so its onclose is ignored
          try {
            old?.close();
          } catch {}
          void connect();
          return;
        }
        if (!finished) {
          finished = true;
          cleanup();
          h.onError(msg);
        }
      }
    };
    ws.onerror = () => {
      if (ws !== sock) return;
      if (!finished && !stopping) {
        finished = true;
        cleanup();
        h.onError("Přepis hlasu se nepodařilo spojit.");
      }
    };
    ws.onclose = (ev) => {
      if (finished || ws !== sock) return; // finished already, or an old socket after a reconnect
      open = false;
      if (stopping || text || partial) return finish(text || partial);
      if (!langFallback) {
        // closed before anything was recognised: retry once with automatic language detection
        langFallback = true;
        void connect();
        return;
      }
      finished = true;
      cleanup();
      h.onError(`spojení s přepisem skončilo (${ev.code}${ev.reason ? ": " + ev.reason : ""})`);
    };
  };
  void connect();

  return {
    stop: api_stop,
    cancel: () => {
      if (finished) return;
      finished = true;
      cleanup();
    },
  };
}
