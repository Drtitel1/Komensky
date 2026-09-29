import { createHash } from "crypto";
import { exists, readBuffer, writeBuffer } from "./blob";
import { toSpeech } from "./speech";

const MAX_CHARS = 1500;

export function ttsConfig() {
  return {
    voiceId: process.env.ELEVENLABS_VOICE_ID ?? "",
    modelId: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
    languageCode: process.env.ELEVENLABS_LANGUAGE_CODE || "",
  };
}

export function audioKey(text: string) {
  const { voiceId, modelId } = ttsConfig();
  const hash = createHash("sha256").update([voiceId, modelId, text].join("\u0000")).digest("hex").slice(0, 40);
  return hash;
}

const inflight = new Map<string, Promise<void>>();

/** Makes sure the audio for this text exists in Blob (each text is converted only once). Returns the cache key. */
export async function ensureAudio(rawText: string): Promise<string> {
  const text = toSpeech(rawText).slice(0, MAX_CHARS);
  if (!text) throw new Error("empty text");
  const key = audioKey(text);
  const pathname = `audio/${key}.mp3`;
  if (await exists(pathname)) return key;

  let job = inflight.get(key);
  if (!job) {
    job = (async () => {
      const mp3 = await synthesize(text);
      await writeBuffer(pathname, mp3, "audio/mpeg");
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  await job;
  return key;
}

export async function readAudio(key: string): Promise<Buffer | null> {
  if (!/^[a-f0-9]{40}$/.test(key)) return null;
  return readBuffer(`audio/${key}.mp3`);
}

async function synthesize(text: string): Promise<Buffer> {
  if (process.env.MOCK_AI === "1") {
    const { MOCK_MP3 } = await import("./mock");
    return Buffer.from(MOCK_MP3, "base64");
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const { voiceId, modelId, languageCode } = ttsConfig();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: modelId,
        ...(languageCode ? { language_code: languageCode } : {}),
        voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.1, speed: 0.95 },
      }),
    },
  );
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`ElevenLabs ${res.status}: ${detail}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
