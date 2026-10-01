import { app, powerSaveBlocker } from "electron";
import { autoUpdater } from "electron-updater";
import { EventEmitter } from "node:events";
import type { UpdateStatus } from "@shared/ipc";
import log from "./log";

const FOUR_HOURS = 4 * 60 * 60 * 1000;

/** Self-update from GitHub Releases. Downloads in the background; an installation only ever happens on the user's
 *  decision (restart now) or when the app quits – never in the middle of a lesson. */
export class Updater extends EventEmitter {
  private status: UpdateStatus;
  private lessonActive = false;
  private blocker: number | null = null;
  private timer?: NodeJS.Timeout;
  private pendingDownload = false;

  constructor() {
    super();
    this.status = app.isPackaged ? { state: "idle", version: app.getVersion() } : { state: "dev", version: app.getVersion() };
    if (!app.isPackaged) return;
    autoUpdater.logger = log;
    // the download is started by us, and never while a lesson is running (it must not compete with the live audio)
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true; // "Později" = installed when the app is closed
    autoUpdater.allowDowngrade = false;
    autoUpdater.on("checking-for-update", () => this.set({ state: "checking", version: app.getVersion() }));
    autoUpdater.on("update-available", (i) => {
      this.set({ state: "downloading", version: app.getVersion(), percent: 0, next: i.version });
      this.pendingDownload = true;
      this.maybeDownload();
    });
    autoUpdater.on("update-not-available", () => this.set({ state: "none", version: app.getVersion() }));
    autoUpdater.on("download-progress", (p) => this.set({ state: "downloading", version: app.getVersion(), percent: Math.round(p.percent), next: (this.status as { next?: string }).next }));
    autoUpdater.on("update-downloaded", (i) => this.set({ state: "ready", version: app.getVersion(), next: i.version }));
    autoUpdater.on("error", (e) => this.set({ state: "error", version: app.getVersion(), message: e?.message?.slice(0, 200) ?? "neznámá chyba" }));
  }

  start() {
    if (!app.isPackaged) return;
    setTimeout(() => void this.check(), 15_000);
    this.timer = setInterval(() => void this.check(), FOUR_HOURS);
  }
  stop() {
    clearInterval(this.timer);
  }

  getStatus(): UpdateStatus {
    return this.status;
  }
  private set(s: UpdateStatus) {
    this.status = s;
    this.emit("status", s);
  }

  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) return this.status;
    // do not start a second check while one is running or an update is already downloaded
    if (this.status.state === "checking" || this.status.state === "downloading" || this.status.state === "ready") return this.status;
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      this.set({ state: "error", version: app.getVersion(), message: (e as Error).message?.slice(0, 200) ?? "neznámá chyba" });
    }
    return this.status;
  }

  /** Starts the background download unless a lesson is running; called again when the lesson ends. */
  private maybeDownload() {
    if (!this.pendingDownload || this.lessonActive) return;
    this.pendingDownload = false;
    autoUpdater.downloadUpdate().catch((e: Error) => this.set({ state: "error", version: app.getVersion(), message: e.message?.slice(0, 200) ?? "stahování selhalo" }));
  }

  setLessonActive(active: boolean) {
    this.lessonActive = active;
    if (!active) setTimeout(() => this.maybeDownload(), 2000);
    if (active && this.blocker === null) this.blocker = powerSaveBlocker.start("prevent-display-sleep");
    if (!active && this.blocker !== null) {
      powerSaveBlocker.stop(this.blocker);
      this.blocker = null;
    }
  }
  get inLesson() {
    return this.lessonActive;
  }

  install() {
    if (this.lessonActive || this.status.state !== "ready") return;
    autoUpdater.quitAndInstall(true, true);
  }
}
