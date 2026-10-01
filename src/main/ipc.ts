import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { PlanSchema, type AnswerRec, type AppSettings, type LessonState, type Question } from "@shared/types";
import type { AdminOverview, KomenskyApi, LiveTokenInfo } from "@shared/ipc";
import type { Store } from "./db";
import type { LessonService } from "./lessons";
import type { Updater } from "./updater";
import { buildLiveConfig } from "./liveConfig";
import { czechError, mintLiveToken, testKey } from "./gemini";
import { getApiKey, hasApiKey, saveApiKey } from "./secrets";
import { getSettings, saveSettings } from "./settings";
import { checkPin, hasPin, setPin } from "./pin";
import { assertTrusted } from "./security";
import { loadActiveCourse, registerCourseIpc } from "./coursesIpc";
import type { Curriculum } from "@shared/types";
import log from "./log";

const TEST = !app.isPackaged && process.env["KOMENSKY_TEST"] === "1";

export function registerIpc(ctx: { store: Store; svc: LessonService; updater: Updater; win: () => BrowserWindow | null; bundled: Curriculum; bundledVersion: number }) {
  const { store, svc, updater } = ctx;
  let adminUntil = 0;
  let failed = 0;
  let lockedUntil = 0;
  const admin = () => Date.now() < adminUntil;
  const needAdmin = () => {
    if (!admin()) throw new Error("Nejdříve zadejte PIN.");
    adminUntil = Date.now() + 15 * 60_000;
  };

  /** Checks the admin PIN with the same attempt limit everywhere (unlock dialog, skip-lesson button). */
  const tryPin = (pin: string): { ok: boolean; error?: string } => {
    if (Date.now() < lockedUntil) return { ok: false, error: `Příliš mnoho pokusů, zkuste to za ${Math.ceil((lockedUntil - Date.now()) / 1000)} s.` };
    if (checkPin(store, String(pin))) {
      failed = 0;
      return { ok: true };
    }
    if (++failed >= 5) {
      failed = 0;
      lockedUntil = Date.now() + 30_000;
    }
    return { ok: false, error: "Nesprávný kód správce." };
  };

  const on = <K extends string>(channel: K, fn: (e: IpcMainInvokeEvent, ...args: any[]) => unknown) =>
    ipcMain.handle(channel, async (e, ...args) => {
      assertTrusted(e);
      try {
        return await fn(e, ...args);
      } catch (err) {
        log.error(`ipc ${channel} failed`, err);
        throw err;
      }
    });

  ipcMain.on("log", (e, level: string, message: string) => {
    try {
      assertTrusted(e as unknown as IpcMainInvokeEvent);
    } catch {
      return;
    }
    const fn = level === "error" ? log.error : level === "warn" ? log.warn : log.info;
    fn(`[renderer] ${String(message).slice(0, 2000)}`);
  });

  on("app:info", () => ({ version: app.getVersion(), packaged: app.isPackaged, dataDir: app.getPath("userData"), platform: process.platform }));

  /* ----- setup ----- */
  on("setup:status", async () => ({ hasKey: await hasApiKey(), hasPin: hasPin(store) }));
  on("setup:testKey", (_e, key: string) => (TEST ? { ok: key.trim().length > 5, error: "Klíč není platný." } : testKey(String(key))));
  on("setup:complete", async (_e, a: { key: string; pin: string }) => {
    if (!/^\d{4,8}$/.test(a.pin)) return { ok: false, error: "PIN musí mít 4 až 8 číslic." };
    const t = TEST ? { ok: true } : await testKey(a.key);
    if (!t.ok) return t;
    await saveApiKey(a.key);
    if (!hasPin(store)) setPin(store, a.pin);
    return { ok: true };
  });

  /* ----- content / progress ----- */
  on("content:curriculum", () => svc.curriculum);
  on("progress:overview", () => svc.overview());
  on("plan:status", (_e, id: string) => ({ ready: svc.planReady(id), generating: svc.planGenerating(id) }));
  svc.on("progress", (p) => ctx.win()?.webContents.send("plan:progress", p));

  /* ----- lesson ----- */
  on("lesson:open", async (_e, id: string) => {
    try {
      return { ok: true, data: await svc.openLesson(String(id)) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
  on("lesson:prefetchNext", (_e, id: string) => svc.prefetchNext(String(id)));
  on("lesson:saveState", (_e, s: LessonState) => store.saveState(s));
  on("lesson:recordAnswer", (_e, rec: AnswerRec, q: Question) => {
    const lessonId = q.id.split(":")[0];
    store.addAnswer(lessonId, rec);
    store.updateSrs(q.id, lessonId, rec.correct);
  });
  on("lesson:transcript", (_e, lessonId: string, role: "user" | "model", text: string, phase: string) => store.addTranscript(String(lessonId), role, String(text).slice(0, 8000), String(phase)));
  on("lesson:complete", (_e, lessonId: string, score: number, weak: string[]) => svc.complete(String(lessonId), Number(score), weak));
  on("lesson:skip", (_e, lessonId: string, pin: string) => {
    const r = tryPin(String(pin));
    if (!r.ok) return r;
    return svc.skipLesson(String(lessonId));
  });
  on("lesson:setActive", (_e, active: boolean) => updater.setLessonActive(!!active));

  /* ----- live ----- */
  on("live:token", async (_e, a: { lessonId: string; summary?: string }): Promise<{ ok: true; info: LiveTokenInfo } | { ok: false; error: string }> => {
    try {
      const lesson = svc.lessonById(a.lessonId);
      const plan = store.getPlan(a.lessonId)?.plan;
      if (!lesson || !plan) return { ok: false, error: "Lekce není připravená." };
      if (svc.currentLessonId() !== a.lessonId) return { ok: false, error: "Tato lekce není odemčená." };
      const settings = getSettings();
      const config = buildLiveConfig({ subject: svc.curriculum.subject, age: svc.curriculum.age, level: svc.curriculum.level, notes: svc.curriculum.notes, lesson, plan, settings, stateSummary: a.summary?.slice(0, 1500) });
      if (TEST) return { ok: true, info: { token: "test-token", model: settings.LIVE_MODEL, config } };
      const key = await getApiKey();
      if (!key) return { ok: false, error: "Chybí Gemini API klíč." };
      const token = await mintLiveToken(key, settings.LIVE_MODEL, config);
      return { ok: true, info: { token, model: settings.LIVE_MODEL, config } };
    } catch (err) {
      log.error("live token failed", err);
      return { ok: false, error: czechError(err) };
    }
  });

  /* ----- updates ----- */
  on("updates:status", () => updater.getStatus());
  on("updates:check", () => updater.check());
  on("updates:install", () => updater.install());
  updater.on("status", (s) => ctx.win()?.webContents.send("updates:status", s));

  /* ----- admin ----- */
  on("admin:unlock", (_e, pin: string) => {
    const r = tryPin(pin);
    if (r.ok) adminUntil = Date.now() + 15 * 60_000;
    return r;
  });
  on("admin:lock", () => {
    adminUntil = 0;
  });
  on("admin:overview", (): AdminOverview | null => {
    if (!admin()) return null;
    const progress = new Map(store.allProgress().map((p) => [p.lesson_id, p]));
    const stats = new Map(store.answerStats().map((s) => [s.lesson_id, s]));
    const lessons = svc.curriculum.stages.flatMap((s) => s.lessons).map((l) => {
      const p = progress.get(l.id);
      const st = stats.get(l.id);
      return { id: l.id, title: l.title, status: p?.status === "completed" && p.skipped ? "skipped" : (p?.status ?? "not_started"), score: p?.score ?? null, hasPlan: svc.planReady(l.id), startedAt: p?.started_at ?? null, completedAt: p?.completed_at ?? null, answers: st?.total ?? 0, wrong: st?.wrong ?? 0 };
    });
    const weak = store.weakQuestions().map((w) => {
      const plan = store.getPlan(w.lesson_id)?.plan;
      const q = plan && [...plan.parts.flatMap((p) => p.questions), ...plan.finalQuiz].find((x) => x.id === w.question_id);
      return { qid: w.question_id, lessonId: w.lesson_id, prompt: q?.prompt ?? w.question_id, wrong: w.wrong, total: w.total };
    });
    return { lessons, weak, srsCount: store.srsCount() };
  });
  on("admin:transcripts", (_e, id: string) => (needAdmin(), store.transcripts(String(id))));
  on("admin:getPlan", (_e, id: string) => (needAdmin(), store.getPlanJson(String(id))));
  on("admin:savePlan", (_e, id: string, json: string) => {
    needAdmin();
    try {
      const plan = PlanSchema.parse(JSON.parse(json));
      if (plan.lessonId !== id) return { ok: false, error: "lessonId v plánu neodpovídá lekci." };
      store.savePlan(plan, true);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Neplatný plán: ${(err as Error).message.slice(0, 300)}` };
    }
  });
  on("admin:regenerate", async (_e, id: string) => {
    needAdmin();
    if (updater.inLesson) return { ok: false, error: "Právě probíhá lekce." };
    store.deletePlan(String(id));
    store.resetLesson(String(id));
    try {
      await svc.ensurePlan(String(id));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
  on("admin:skipLesson", (_e, id: string) => (needAdmin(), svc.skipLesson(String(id))));
  on("admin:resetLesson", (_e, id: string) => (needAdmin(), store.resetLesson(String(id))));
  on("admin:jumpTo", (_e, id: string) => (needAdmin(), svc.jumpTo(String(id))));
  on("admin:setKey", async (_e, key: string) => {
    needAdmin();
    const t = TEST ? { ok: true } : await testKey(String(key));
    if (!t.ok) return t;
    await saveApiKey(String(key));
    return { ok: true };
  });
  on("admin:getSettings", () => (needAdmin(), getSettings()));
  on("admin:setSettings", (_e, s: AppSettings) => (needAdmin(), saveSettings(s)));
  on("admin:changePin", (_e, oldPin: string, newPin: string) => {
    needAdmin();
    if (!checkPin(store, String(oldPin))) return { ok: false, error: "Původní PIN není správný." };
    if (!/^\d{4,8}$/.test(String(newPin))) return { ok: false, error: "PIN musí mít 4 až 8 číslic." };
    setPin(store, String(newPin));
    return { ok: true };
  });
  on("admin:exportBackup", async () => {
    needAdmin();
    const win = ctx.win();
    const stamp = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(win!, { title: "Uložit zálohu", defaultPath: `komensky-zaloha-${stamp}.json`, filters: [{ name: "Záloha Komenský", extensions: ["json"] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    writeFileSync(r.filePath, JSON.stringify(store.exportAll()));
    return { ok: true, path: r.filePath };
  });
  on("admin:importBackup", async () => {
    needAdmin();
    if (updater.inLesson) return { ok: false, error: "Právě probíhá lekce." };
    const win = ctx.win();
    const r = await dialog.showOpenDialog(win!, { title: "Načíst zálohu", properties: ["openFile"], filters: [{ name: "Záloha Komenský", extensions: ["json"] }] });
    if (r.canceled || !r.filePaths[0]) return { ok: false };
    try {
      const data = JSON.parse(readFileSync(r.filePaths[0], "utf8"));
      store.importAll(data);
      loadActiveCourse(store, svc, ctx.bundled, ctx.bundledVersion); // the backup may bring other courses / another active one
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  registerCourseIpc({ on, needAdmin, ctx, tryPin });
}

export type _Api = KomenskyApi;
