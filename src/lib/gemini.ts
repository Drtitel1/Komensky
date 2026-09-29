import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

let client: GoogleGenAI | null = null;
function ai() {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export const MODEL = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const CHECK_MODEL = () => process.env.GEMINI_CHECK_MODEL || MODEL();

interface JsonCall<T> {
  model?: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
}

/** Calls Gemini, requires JSON output, validates it with zod, retries once on malformed output. */
export async function generateJson<T>({ model, system, prompt, schema, temperature = 0.2 }: JsonCall<T>): Promise<T> {
  if (process.env.MOCK_AI === "1") {
    const { mockJson } = await import("./mock");
    return schema.parse(mockJson(prompt)) as T;
  }
  const thinkingLevel = process.env.GEMINI_THINKING_LEVEL;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: model ?? MODEL(),
        contents: prompt,
        config: {
          systemInstruction: system,
          temperature,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(schema),
          ...(thinkingLevel ? { thinkingConfig: { thinkingLevel: thinkingLevel as never } } : {}),
        },
      });
      const text = res.text ?? "";
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      return schema.parse(JSON.parse(cleaned));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gemini call failed");
}
