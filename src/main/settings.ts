import { app } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS, type AppSettings } from "@shared/types";
import log from "./log";

const file = () => join(app.getPath("userData"), "settings.json");

export function getSettings(): AppSettings {
  try {
    if (existsSync(file())) return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(file(), "utf8")) };
  } catch (e) {
    log.warn("settings.json unreadable, using defaults", e);
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: AppSettings) {
  const clean: AppSettings = {
    LIVE_MODEL: s.LIVE_MODEL.trim() || DEFAULT_SETTINGS.LIVE_MODEL,
    PREP_MODEL: s.PREP_MODEL.trim() || DEFAULT_SETTINGS.PREP_MODEL,
    VOICE: s.VOICE.trim(),
  };
  writeFileSync(file(), JSON.stringify(clean, null, 2));
}
