import { contextBridge, ipcRenderer } from "electron";
import type { KomenskyApi } from "../shared/ipc";

/* Minimal typed bridge. Every method maps to exactly one whitelisted IPC channel; the renderer gets no Node or Electron access. */
const invoke = <T>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>;
const subscribe = <T>(channel: string, cb: (v: T) => void) => {
  const h = (_e: unknown, v: T) => cb(v);
  ipcRenderer.on(channel, h);
  // must return nothing: an Electron object cannot cross the context bridge as a return value
  return () => {
    ipcRenderer.removeListener(channel, h);
  };
};

const api: KomenskyApi = {
  app: { info: () => invoke("app:info") },
  setup: {
    status: () => invoke("setup:status"),
    testKey: (key) => invoke("setup:testKey", key),
    complete: (a) => invoke("setup:complete", a),
  },
  content: { curriculum: () => invoke("content:curriculum") },
  progress: { overview: () => invoke("progress:overview") },
  plan: {
    status: (id) => invoke("plan:status", id),
    onProgress: (cb) => subscribe("plan:progress", cb),
  },
  lesson: {
    open: (id) => invoke("lesson:open", id),
    prefetchNext: (id) => invoke("lesson:prefetchNext", id),
    saveState: (s) => invoke("lesson:saveState", s),
    recordAnswer: (rec, q) => invoke("lesson:recordAnswer", rec, q),
    transcript: (id, role, text, phase) => invoke("lesson:transcript", id, role, text, phase),
    complete: (id, score, weak) => invoke("lesson:complete", id, score, weak),
    setActive: (a) => invoke("lesson:setActive", a),
  },
  live: { token: (a) => invoke("live:token", a) },
  updates: {
    status: () => invoke("updates:status"),
    check: () => invoke("updates:check"),
    install: () => invoke("updates:install"),
    onStatus: (cb) => subscribe("updates:status", cb),
  },
  admin: {
    unlock: (pin) => invoke("admin:unlock", pin),
    lock: () => invoke("admin:lock"),
    overview: () => invoke("admin:overview"),
    transcripts: (id) => invoke("admin:transcripts", id),
    getPlan: (id) => invoke("admin:getPlan", id),
    savePlan: (id, json) => invoke("admin:savePlan", id, json),
    regenerate: (id) => invoke("admin:regenerate", id),
    resetLesson: (id) => invoke("admin:resetLesson", id),
    jumpTo: (id) => invoke("admin:jumpTo", id),
    setKey: (k) => invoke("admin:setKey", k),
    getSettings: () => invoke("admin:getSettings"),
    setSettings: (s) => invoke("admin:setSettings", s),
    changePin: (o, n) => invoke("admin:changePin", o, n),
    exportBackup: () => invoke("admin:exportBackup"),
    importBackup: () => invoke("admin:importBackup"),
  },
  log: (level, message) => ipcRenderer.send("log", level, message),
};

contextBridge.exposeInMainWorld("komensky", api);
