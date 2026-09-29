// AudioWorklet: forwards mono float samples (16 kHz context) to the main thread in ~100 ms blocks together with an RMS level.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(1600);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) {
        let sum = 0;
        const pcm = new Int16Array(this.n);
        for (let k = 0; k < this.n; k++) {
          const v = Math.max(-1, Math.min(1, this.buf[k]));
          pcm[k] = v < 0 ? v * 0x8000 : v * 0x7fff;
          sum += v * v;
        }
        this.port.postMessage({ pcm: pcm.buffer, rms: Math.sqrt(sum / this.n) }, [pcm.buffer]);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
