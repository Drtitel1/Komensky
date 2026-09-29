import { app, protocol, session, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import log from "./log";

export const SCHEME = "komensky";
export const APP_ORIGIN = `${SCHEME}://app`;
export const DEV_URL = process.env["ELECTRON_RENDERER_URL"];

/** Strict production CSP: only the app itself and the Gemini API endpoints. */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "connect-src 'self' https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

// must run before app is ready
export function registerScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".map": "application/json",
};

/** Serves the built renderer from a custom protocol (no file:// – Electron security checklist #18). */
export function registerProtocol(root: string) {
  protocol.handle(SCHEME, async (req) => {
    const url = new URL(req.url);
    if (url.host !== "app") return new Response("Forbidden", { status: 403 });
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) return new Response("Forbidden", { status: 403 });
    try {
      if (!(await stat(file)).isFile()) throw new Error("not a file");
      const body = await readFile(file);
      return new Response(new Uint8Array(body), {
        headers: { "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream", "Content-Security-Policy": CSP, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

export const isTrustedUrl = (url: string) => url.startsWith(`${APP_ORIGIN}/`) || (!app.isPackaged && !!DEV_URL && url.startsWith(DEV_URL));

export function assertTrusted(e: IpcMainInvokeEvent) {
  const url = e.senderFrame?.url ?? "";
  if (!isTrustedUrl(url)) {
    log.warn(`blocked IPC from untrusted frame: ${url}`);
    throw new Error("Untrusted sender");
  }
}

/** Microphone for the app's own origin only; every other permission is denied. */
export function hardenSession() {
  const ses = session.defaultSession;
  // a non-ASCII character in the User-Agent (e.g. from the app name) makes Chromium fail every custom-protocol request
  const ua = ses.getUserAgent();
  if (/[^\x20-\x7e]/.test(ua)) ses.setUserAgent(ua.replace(/[^\x20-\x7e]/g, ""));
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
    const ok = permission === "media" && isTrustedUrl(details.requestingUrl) && mediaTypes.every((t) => t === "audio");
    callback(ok);
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => permission === "media" && isTrustedUrl(origin.endsWith("/") ? origin : origin + "/"));
  ses.setDevicePermissionHandler(() => false);
  if (!app.isPackaged && DEV_URL) {
    // Vite dev server needs inline scripts for HMR; production uses the header set by the protocol handler.
    ses.webRequest.onHeadersReceived((d, cb) => cb({ responseHeaders: { ...d.responseHeaders, "Content-Security-Policy": ["default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws://localhost:* http://localhost:* https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com"] } }));
  }
}

export function hardenWindow(win: BrowserWindow) {
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.on("will-navigate", (e, url) => {
    if (!isTrustedUrl(url)) e.preventDefault();
  });
  wc.on("will-attach-webview", (e) => e.preventDefault());
}

