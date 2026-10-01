/* Microphone capture (16 kHz PCM16 via AudioWorklet) and model audio playback (24 kHz PCM16), formats required by the Live API. */

export const INPUT_RATE = 16000;
export const OUTPUT_RATE = 24000;

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export interface MicHandlers {
  onChunk: (b64: string) => void;
  onLevel: (rms: number) => void;
  /** the microphone was unplugged / disabled while in use */
  onEnded?: () => void;
}

export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  /** push-to-talk gate: audio is forwarded ONLY while this is true (the button is held) */
  capturing = false;
  alive = false;

  async start(h: MicHandlers) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    // a 16 kHz context: Chromium resamples the microphone for us
    const track = this.stream.getAudioTracks()[0];
    this.alive = true;
    track?.addEventListener("ended", () => {
      this.alive = false;
      this.capturing = false;
      h.onEnded?.();
    });
    this.ctx = new AudioContext({ sampleRate: INPUT_RATE });
    await this.ctx.audioWorklet.addModule(new URL("pcm-worklet.js", document.baseURI).href);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
      h.onLevel(this.capturing ? e.data.rms : 0);
      if (this.capturing) h.onChunk(bytesToB64(new Uint8Array(e.data.pcm)));
    };
    src.connect(this.node);
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  stop() {
    this.capturing = false;
    this.alive = false;
    try {
      this.node?.disconnect();
    } catch {
      /* ignore */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.node = null;
    this.stream = null;
    this.ctx = null;
  }
}

/** Gapless playback of streamed PCM16 chunks; `flush()` is the barge-in (stops everything queued). */
export class Playback {
  private ctx = new AudioContext({ sampleRate: OUTPUT_RATE });
  private gain = this.ctx.createGain();
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();
  lastChunkAt = -Infinity;

  constructor() {
    this.gain.connect(this.ctx.destination);
  }

  async resumeContext() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  push(b64: string) {
    const bytes = b64ToBytes(b64);
    const n = Math.floor(bytes.length / 2);
    if (!n) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
    const buf = this.ctx.createBuffer(1, n, OUTPUT_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = view.getInt16(i * 2, true) / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    const at = Math.max(this.ctx.currentTime + 0.02, this.next);
    src.start(at);
    this.next = at + buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
    this.lastChunkAt = performance.now();
  }

  /** true while queued audio is still to be heard */
  get playing() {
    return this.next > this.ctx.currentTime + 0.01 && this.sources.size > 0;
  }

  flush() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.next = 0;
    this.lastChunkAt = -Infinity; // the tutor counts as silent immediately (barge-in)
  }

  async suspend() {
    await this.ctx.suspend();
  }
  async resume() {
    await this.ctx.resume();
  }
  close() {
    this.flush();
    void this.ctx.close().catch(() => {});
  }
}
