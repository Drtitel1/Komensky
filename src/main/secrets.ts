import { app, safeStorage } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import log from "./log";

/** The Gemini API key. Encrypted with Electron safeStorage (Windows DPAPI) and kept ONLY in the main process. */
const file = () => join(app.getPath("userData"), "gemini-key.bin");
let cached: string | null | undefined;

export async function saveApiKey(key: string): Promise<void> {
  const k = key.trim();
  if (await safeStorage.isAsyncEncryptionAvailable()) {
    writeFileSync(file(), JSON.stringify({ v: 1, enc: (await safeStorage.encryptStringAsync(k)).toString("base64") }));
  } else if (!app.isPackaged) {
    // development / CI only: no OS keyring available
    writeFileSync(file(), JSON.stringify({ v: 1, plain: k }));
  } else {
    throw new Error("Šifrované úložiště systému není dostupné, klíč nelze bezpečně uložit.");
  }
  cached = k;
}

export async function getApiKey(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    if (!existsSync(file())) return (cached = null);
    const raw = JSON.parse(readFileSync(file(), "utf8")) as { enc?: string; plain?: string };
    if (raw.plain && !app.isPackaged) return (cached = raw.plain);
    if (!raw.enc) return (cached = null);
    const res = await safeStorage.decryptStringAsync(Buffer.from(raw.enc, "base64"));
    cached = res.result;
    if (res.shouldReEncrypt) await saveApiKey(res.result);
    return cached;
  } catch (e) {
    log.error("cannot read API key", e);
    return (cached = null);
  }
}

export const hasApiKey = async () => !!(await getApiKey());
