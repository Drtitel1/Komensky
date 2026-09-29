import { AsyncLocalStorage } from "async_hooks";
import type { NextRequest } from "next/server";

/**
 * API keys and model names can come from the browser (Settings screen → request headers)
 * or from environment variables. Headers win. They are only used for the duration of the request.
 */
export interface Creds {
  geminiKey: string;
  geminiModel: string;
  geminiCheckModel: string;
  geminiChatModel: string;
  elevenKey: string;
  elevenVoice: string;
  elevenModel: string;
}

const store = new AsyncLocalStorage<Creds>();

const fromEnv = (): Creds => ({
  geminiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "",
  geminiCheckModel: process.env.GEMINI_CHECK_MODEL ?? "",
  geminiChatModel: process.env.GEMINI_CHAT_MODEL ?? "",
  elevenKey: process.env.ELEVENLABS_API_KEY ?? "",
  elevenVoice: process.env.ELEVENLABS_VOICE_ID ?? "",
  elevenModel: process.env.ELEVENLABS_MODEL_ID ?? "",
});

function fromRequest(req: NextRequest): Creds {
  const env = fromEnv();
  const h = (name: string, fallback: string) => (req.headers.get(name) ?? "").trim() || fallback;
  return {
    geminiKey: h("x-gemini-key", env.geminiKey),
    geminiModel: h("x-gemini-model", env.geminiModel),
    geminiCheckModel: h("x-gemini-check-model", env.geminiCheckModel),
    geminiChatModel: h("x-gemini-chat-model", env.geminiChatModel),
    elevenKey: h("x-eleven-key", env.elevenKey),
    elevenVoice: h("x-eleven-voice", env.elevenVoice),
    elevenModel: h("x-eleven-model", env.elevenModel),
  };
}

export const creds = (): Creds => store.getStore() ?? fromEnv();

/** Wraps a route handler so that creds() returns the caller's settings inside it. */
export function withCreds<A extends unknown[]>(handler: (req: NextRequest, ...args: A) => Promise<Response>) {
  return (req: NextRequest, ...args: A) => store.run(fromRequest(req), () => handler(req, ...args));
}
