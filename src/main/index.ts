import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import curriculum from "../../content/curriculum.json";
import type { Curriculum } from "@shared/types";
import log from "./log";
import { Store } from "./db";
import { LessonService } from "./lessons";
import { generatePlan } from "./planner";
import { fakeGenerate } from "./fakePlan";
import { registerIpc } from "./ipc";
import { APP_ORIGIN, DEV_URL, hardenSession, hardenWindow, registerProtocol, registerScheme } from "./security";
import { Updater } from "./updater";
import { loadWindowState, trackWindowState } from "./windowState";

const APP_NAME = "Komenský";
const TEST = !app.isPackaged && process.env["KOMENSKY_TEST"] === "1";

// tests can redirect all data to a temp folder
if (!app.isPackaged && process.env["KOMENSKY_USER_DATA"]) app.setPath("userData", process.env["KOMENSKY_USER_DATA"]);
registerScheme();

let win: BrowserWindow | null = null;
let store: Store | null = null;
const updater = new Updater();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  process.on("uncaughtException", (e) => log.error("uncaughtException", e));
  process.on("unhandledRejection", (e) => log.error("unhandledRejection", e));

  app.whenReady().then(() => {
    log.info(`${APP_NAME} ${app.getVersion()} starting (packaged=${app.isPackaged}, test=${TEST})`);
    Menu.setApplicationMenu(null);
    hardenSession();

    const dataDir = app.getPath("userData");
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    try {
      store = new Store(join(dataDir, "komensky.db"));
    } catch (e) {
      log.error("cannot open database", e);
      dialog.showErrorBox(APP_NAME, `Nepodařilo se otevřít databázi s postupem:\n${(e as Error).message}\n\nPokud jde o novější verzi dat, aktualizujte aplikaci.`);
      app.quit();
      return;
    }
    const svc = new LessonService(store, curriculum as unknown as Curriculum, TEST ? fakeGenerate : generatePlan);

    const rendererRoot = join(__dirname, "../renderer");
    if (app.isPackaged || !DEV_URL) registerProtocol(rendererRoot);
    registerIpc({ store, svc, updater, win: () => win });

    const ws = loadWindowState();
    win = new BrowserWindow({
      x: ws.x,
      y: ws.y,
      width: ws.width,
      height: ws.height,
      minWidth: 900,
      minHeight: 640,
      show: false,
      title: APP_NAME,
      backgroundColor: "#fff8ee",
      icon: join(__dirname, "../../build/icon.png"),
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: !app.isPackaged,
        spellcheck: false,
      },
    });
    hardenWindow(win);
    trackWindowState(win);
    if (ws.maximized) win.maximize();
    win.once("ready-to-show", () => win?.show());
    win.on("closed", () => (win = null));
    win.webContents.on("render-process-gone", (_e, d) => log.error("renderer gone", d));
    win.webContents.on("console-message", (e) => {
      if (e.level === "error") log.warn(`[renderer console] ${e.message}`);
    });
    // external links (if any ever appear) open in the system browser, never inside the app
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    void win.loadURL(app.isPackaged || !DEV_URL ? `${APP_ORIGIN}/index.html` : DEV_URL);
    updater.start();
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    updater.stop();
    store?.close();
  });
}
