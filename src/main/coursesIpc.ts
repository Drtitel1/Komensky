import { app, dialog, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { allLessons, changedLessons, freeSlug, reid, slugify, validateCourse } from "@shared/course";
import type { CourseGenParams, CourseInfo } from "@shared/ipc";
import type { Curriculum } from "@shared/types";
import type { Store } from "./db";
import type { LessonService } from "./lessons";
import type { Updater } from "./updater";
import { fakeCourse, generateCourse, MAX_MATERIAL_CHARS } from "./courseGen";
import { czechError } from "./gemini";
import { getApiKey } from "./secrets";
import { getSettings } from "./settings";
import log from "./log";

const TEST = !app.isPackaged && process.env["KOMENSKY_TEST"] === "1";

/** Installs the bundled course on first start (or its newer version if untouched) and makes the active course current. */
export function loadActiveCourse(store: Store, svc: LessonService, bundled: Curriculum, bundledVersion: number) {
  store.seedBuiltin(bundled, bundledVersion);
  const wanted = store.activeCourseId();
  const course = (wanted && store.getCourse(wanted)) || store.getCourse(bundled.id) || bundled;
  if (!wanted || wanted !== course.id) store.setActiveCourse(course.id);
  svc.setCurriculum(course);
}

type On = (channel: string, fn: (e: IpcMainInvokeEvent, ...args: any[]) => unknown) => void;

export function registerCourseIpc(h: {
  on: On;
  needAdmin: () => void;
  tryPin: (pin: string) => { ok: boolean; error?: string };
  ctx: { store: Store; svc: LessonService; updater: Updater; win: () => BrowserWindow | null; bundled: Curriculum; bundledVersion: number };
}) {
  const { on, needAdmin } = h;
  const { store, svc, updater, bundled, bundledVersion } = h.ctx;
  const win = () => h.ctx.win();

  /** lesson ids used by courses other than `exceptCourse` – they must stay unique across courses */
  const otherLessonIds = (exceptCourse: string) => {
    const ids = new Map<string, string>();
    for (const c of store.listCourses()) {
      if (c.id === exceptCourse) continue;
      const full = store.getCourse(c.id);
      if (full) for (const l of allLessons(full)) ids.set(l.id, c.id);
    }
    return ids;
  };

  on("courses:list", (): CourseInfo[] => {
    needAdmin();
    const active = store.activeCourseId();
    return store.listCourses().map((c) => ({ ...c, active: c.id === active }));
  });
  on("courses:get", (_e, id: string) => (needAdmin(), store.getCourse(String(id))));

  on("courses:save", (_e, raw: unknown, isNew: boolean) => {
    needAdmin();
    let v = validateCourse(raw);
    if (!v.ok || !v.course) return { ok: false, errors: v.errors };
    if (isNew) {
      // a NEW course never overwrites an existing one: it gets a free id and lesson ids derived from it
      const base = v.course.id === "novy-kurz" ? slugify(v.course.subject) : v.course.id;
      const slug = freeSlug(base, new Set(store.listCourses().map((c) => c.id)));
      if (slug !== v.course.id) v = validateCourse(reid(v.course, slug));
      if (!v.ok || !v.course) return { ok: false, errors: v.errors };
    }
    const course = v.course;
    const taken = otherLessonIds(course.id);
    const clash = allLessons(course).find((l) => taken.has(l.id));
    if (clash) return { ok: false, errors: [`id lekce „${clash.id}“ už používá kurz „${taken.get(clash.id)}“. Změň id lekce (musí být unikátní napříč kurzy).`] };
    const before = store.getCourse(course.id);
    const row = store.courseRow(course.id);
    store.saveCourse(course, { builtin: !!row?.builtin, edited: row?.builtin ? true : false });
    // lessons whose teaching content changed but that already have a stored plan: the plan was built from the old text
    const stale = before ? changedLessons(before, course).filter((id) => svc.planReady(id)) : [];
    if (store.activeCourseId() === course.id) svc.setCurriculum(course);
    log.info(`course ${course.id} saved (${allLessons(course).length} lessons, ${stale.length} stale plans)`);
    return { ok: true, course, stale };
  });

  on("courses:remove", (_e, id: string) => {
    needAdmin();
    const row = store.courseRow(String(id));
    if (!row) return { ok: false, error: "Kurz neexistuje." };
    if (row.builtin) return { ok: false, error: "Původní kurz nejde smazat (jde ho jen obnovit)." };
    if (updater.inLesson) return { ok: false, error: "Právě probíhá lekce." };
    store.deleteCourse(String(id));
    loadActiveCourse(store, svc, bundled, bundledVersion);
    return { ok: true };
  });

  on("courses:restoreBuiltin", () => {
    needAdmin();
    if (updater.inLesson) return { ok: false, error: "Právě probíhá lekce." };
    store.saveCourse(bundled, { builtin: true, edited: false, contentVersion: bundledVersion });
    loadActiveCourse(store, svc, bundled, bundledVersion);
    return { ok: true };
  });

  on("courses:setActive", (_e, id: string) => {
    needAdmin();
    if (updater.inLesson) return { ok: false, error: "Právě probíhá lekce." };
    const c = store.getCourse(String(id));
    if (!c) return { ok: false, error: "Kurz neexistuje." };
    store.setActiveCourse(c.id);
    svc.setCurriculum(c);
    return { ok: true };
  });

  on("courses:generate", async (_e, p: CourseGenParams) => {
    needAdmin();
    const params = {
      subject: String(p.subject ?? "").trim(),
      level: String(p.level ?? "").trim().slice(0, 120),
      age: Math.round(Number(p.age)),
      notes: String(p.notes ?? "").trim().slice(0, 2000),
      material: String(p.material ?? "").slice(0, MAX_MATERIAL_CHARS),
      stages: Math.round(Number(p.stages)),
      lessonsPerStage: Math.round(Number(p.lessonsPerStage)),
    };
    if (params.subject.length < 2) return { ok: false, error: "Zadejte předmět." };
    if (!(params.age >= 5 && params.age <= 18)) return { ok: false, error: "Věk musí být 5 až 18." };
    if (!(params.stages >= 1 && params.stages <= 8) || !(params.lessonsPerStage >= 1 && params.lessonsPerStage <= 8)) return { ok: false, error: "Etap může být 1–8 a lekcí v etapě 1–8." };
    try {
      const key = TEST ? "test" : await getApiKey();
      if (!key) return { ok: false, error: "Chybí Gemini API klíč." };
      const emit = (step: string, done: number, total: number) => win()?.webContents.send("courses:progress", { step, done, total });
      const run = { key, model: getSettings().PREP_MODEL, params, onProgress: emit };
      const draft = await (TEST ? fakeCourse(run) : generateCourse(run));
      // never collide with an existing course
      const taken = new Set(store.listCourses().map((c) => c.id));
      const unique = freeSlug(draft.id, taken);
      const out = unique === draft.id ? draft : { ...reid(draft, unique), generated: draft.generated };
      const v = validateCourse(out);
      if (!v.ok || !v.course) return { ok: false, error: `Vygenerovaný kurz není platný: ${v.errors.slice(0, 3).join("; ")}` };
      return { ok: true, course: v.course };
    } catch (err) {
      log.error("course generation failed", err);
      return { ok: false, error: czechError(err) };
    }
  });

  on("courses:export", async (_e, id: string) => {
    needAdmin();
    const c = store.getCourse(String(id));
    if (!c) return { ok: false, error: "Kurz neexistuje." };
    const r = await dialog.showSaveDialog(win()!, { title: "Uložit kurz", defaultPath: `kurz-${c.id}.json`, filters: [{ name: "Kurz Komenský", extensions: ["json"] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    writeFileSync(r.filePath, JSON.stringify(c, null, 2));
    return { ok: true, path: r.filePath };
  });

  on("courses:import", async () => {
    needAdmin();
    const r = await dialog.showOpenDialog(win()!, { title: "Načíst kurz", properties: ["openFile"], filters: [{ name: "Kurz Komenský", extensions: ["json"] }] });
    if (r.canceled || !r.filePaths[0]) return { ok: false };
    try {
      if (statSync(r.filePaths[0]).size > 5_000_000) return { ok: false, error: "Soubor je příliš velký." };
      const v = validateCourse(JSON.parse(readFileSync(r.filePaths[0], "utf8")));
      if (!v.ok || !v.course) return { ok: false, errors: v.errors };
      // an imported course is always a NEW course: free slug, lesson ids never clash with existing ones
      const taken = new Set(store.listCourses().map((c) => c.id));
      const slug = freeSlug(v.course.id, taken);
      return { ok: true, course: reid(v.course, slug) };
    } catch (err) {
      return { ok: false, error: `Soubor nejde přečíst: ${(err as Error).message}` };
    }
  });

  on("courses:readMaterial", async () => {
    needAdmin();
    const r = await dialog.showOpenDialog(win()!, { title: "Načíst studijní materiál", properties: ["openFile"], filters: [{ name: "Text", extensions: ["txt", "md", "markdown", "csv"] }] });
    if (r.canceled || !r.filePaths[0]) return { ok: false };
    try {
      if (statSync(r.filePaths[0]).size > 2_000_000) return { ok: false, error: "Soubor je větší než 2 MB." };
      return { ok: true, name: r.filePaths[0].split(/[\\/]/).pop(), text: readFileSync(r.filePaths[0], "utf8").slice(0, MAX_MATERIAL_CHARS) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  on("courses:dropPlans", (_e, ids: string[]) => {
    needAdmin();
    for (const id of ids.map(String)) {
      store.deletePlan(id);
      store.resetLesson(id);
    }
  });

}
