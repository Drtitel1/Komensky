import { api } from "./api";

/** One shared cache of text -> audio URL. Player, quiz and background prefetch all use it, so nothing is converted twice. */
const cache = new Map<string, Promise<string>>();

export function ttsUrl(text: string): Promise<string> {
  let p = cache.get(text);
  if (!p) {
    p = api<{ url: string }>("/api/tts", { json: { text } }).then((r) => r.url);
    p.catch(() => cache.delete(text)); // allow a retry later
    cache.set(text, p);
  }
  return p;
}

export const clearTtsCache = () => cache.clear();

/** Text that is read aloud for a question (prompt + options). */
export const questionSpeech = (q: { prompt: string; options?: string[] }) =>
  q.prompt + (q.options ? " " + q.options.map((o, i) => `Možnost ${String.fromCharCode(65 + i)}: ${o}.`).join(" ") : "");

/**
 * Converts texts in the background (2 at a time, in order) so the audio is already cached when it is needed.
 * Returns a function that stops the work.
 */
export function prefetchAudio(texts: string[]): () => void {
  let stopped = false;
  let next = 0;
  let failures = 0;
  const worker = async () => {
    while (!stopped && failures < 4) {
      const i = next++;
      if (i >= texts.length) return;
      try {
        await ttsUrl(texts[i]);
      } catch {
        failures++;
        await new Promise((r) => setTimeout(r, 1500 * failures)); // e.g. rate limit: back off
      }
    }
  };
  void worker();
  void worker();
  return () => {
    stopped = true;
  };
}
