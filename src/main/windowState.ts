import { app, screen, type BrowserWindow } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface State {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}
const file = () => join(app.getPath("userData"), "window-state.json");

export function loadWindowState(): State {
  const def: State = { width: 1180, height: 820, maximized: false };
  try {
    if (!existsSync(file())) return def;
    const s = { ...def, ...JSON.parse(readFileSync(file(), "utf8")) } as State;
    // ignore a saved position that is no longer on any screen (e.g. unplugged monitor)
    if (s.x !== undefined && s.y !== undefined) {
      const visible = screen.getAllDisplays().some((d) => s.x! < d.bounds.x + d.bounds.width - 50 && s.x! + s.width > d.bounds.x + 50 && s.y! >= d.bounds.y - 10 && s.y! < d.bounds.y + d.bounds.height - 50);
      if (!visible) return { ...def, width: s.width, height: s.height };
    }
    return s;
  } catch {
    return def;
  }
}

export function trackWindowState(win: BrowserWindow) {
  let t: NodeJS.Timeout | undefined;
  let normal = win.getNormalBounds();
  const write = () => {
    try {
      writeFileSync(file(), JSON.stringify({ ...normal, maximized: win.isMaximized() }));
    } catch {
      /* ignore */
    }
  };
  const save = () => {
    if (win.isDestroyed()) return;
    if (!win.isMaximized() && !win.isMinimized()) normal = win.getNormalBounds();
    clearTimeout(t);
    t = setTimeout(write, 400);
  };
  for (const ev of ["resize", "move", "maximize", "unmaximize"] as const) win.on(ev as "resize", save);
  win.on("close", () => {
    if (!win.isMaximized() && !win.isMinimized()) normal = win.getNormalBounds();
    write();
  });
}
