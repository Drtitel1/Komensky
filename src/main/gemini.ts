import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import log from "./log";

export const client = (apiKey: string) => new GoogleGenAI({ apiKey });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Turns SDK/network errors into a short Czech message for the UI. */
export function czechError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number })?.status;
  if (/API key not valid|API_KEY_INVALID|API key expired/i.test(msg)) return "Klíč není platný. Zkontrolujte, že je zkopírovaný celý.";
  if (status === 403 || /PERMISSION_DENIED/i.test(msg)) return "Tento klíč nemá oprávnění (nebo Gemini API není ve vaší zemi/účtu povoleno).";
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) return "Byl vyčerpán limit Google (příliš mnoho požadavků nebo dobitý kredit). Chvíli počkejte a zkuste to znovu.";
  if (status === 503 || /UNAVAILABLE|high demand/i.test(msg)) return "Služba Gemini je právě přetížená. Zkuste to za chvíli znovu.";
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network/i.test(msg)) return "Nepodařilo se připojit k internetu. Zkontrolujte připojení a zkuste to znovu.";
  return `Chyba Gemini: ${msg.slice(0, 200)}`;
}

export async function testKey(key: string): Promise<{ ok: boolean; error?: string }> {
  if (!key.trim()) return { ok: false, error: "Vložte klíč." };
  try {
    const pager = await client(key.trim()).models.list({ config: { pageSize: 5 } });
    void pager.page;
    return { ok: true };
  } catch (e) {
    log.warn("key test failed", e instanceof Error ? e.message : e);
    return { ok: false, error: czechError(e) };
  }
}

function retryDelayMs(e: unknown): number | null {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /retry in ([\d.]+)s/i.exec(msg) ?? /"retryDelay":"(\d+)s"/.exec(msg);
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}

export interface GenOpts<T> {
  key: string;
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  onWait?: (seconds: number) => void;
}

/** JSON generation with zod validation; waits and retries on rate limits (free tier: few requests/minute) and overload. */
export async function generateJson<T>(o: GenOpts<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 7; attempt++) {
    try {
      const res = await client(o.key).models.generateContent({
        model: o.model,
        contents: o.prompt,
        config: {
          systemInstruction: o.system,
          temperature: o.temperature ?? 0.2,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(o.schema),
        },
      });
      const text = (res.text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      return o.schema.parse(JSON.parse(text));
    } catch (e) {
      lastErr = e;
      const status = (e as { status?: number })?.status;
      const transient = status === 429 || status === 503 || status === 500 || status === 504 || e instanceof SyntaxError || e instanceof z.ZodError;
      if (!transient || attempt === 6) break;
      const wait = Math.min(status === 429 ? (retryDelayMs(e) ?? 20_000) + 1000 : 3000 * (attempt + 1), 70_000);
      log.warn(`Gemini call failed (${status ?? (e as Error).name}), retrying in ${Math.round(wait / 1000)} s`);
      o.onWait?.(Math.round(wait / 1000));
      await sleep(wait);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Short-lived ephemeral token for the Live API. The renderer never sees the real API key. */
export async function mintLiveToken(key: string, model: string, config: Record<string, unknown>): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: "v1alpha" } });
  const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
  const tok = await ai.authTokens.create({
    config: {
      uses: 3, // a failed handshake must not burn the only use; resuming a session does not count as a use
      expireTime: iso(3 * 3_600_000),
      newSessionExpireTime: iso(2 * 60_000),
      liveConnectConstraints: { model, config: config as never },
      httpOptions: { apiVersion: "v1alpha" },
    },
  });
  if (!tok.name) throw new Error("Google nevrátil dočasný token.");
  return tok.name;
}
