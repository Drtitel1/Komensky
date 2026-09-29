// End-to-end smoke test of the real Electron app (unpackaged, KOMENSKY_TEST=1: fake plans + scripted fake teacher, no Google access).
// Run:  xvfb-run -a node tests/e2e/smoke.mjs
import { _electron as electron } from "playwright-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dataDir = mkdtempSync(join(tmpdir(), "komensky-e2e-"));
const launch = () =>
  electron.launch({
    args: [".", "--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
    env: { ...process.env, KOMENSKY_TEST: "1", KOMENSKY_USER_DATA: dataDir, ELECTRON_ENABLE_LOGGING: "1" },
  });

const errors = [];
let app = await launch();
let page = await app.firstWindow();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

// --- security posture
const info = await page.evaluate(() => ({ url: location.href, hasRequire: typeof require, hasProcess: typeof process, api: Object.keys(window.komensky) }));
console.log("renderer:", info.url, "require:", info.hasRequire, "process:", info.hasProcess, "api:", info.api.join(","));
assert.equal(info.hasRequire, "undefined");
assert.equal(info.hasProcess, "undefined");
assert.ok(info.url.startsWith("komensky://app/"));
const csp = await page.evaluate(async () => (await fetch("/index.html")).headers.get("content-security-policy"));
assert.match(csp, /connect-src 'self' https:\/\/generativelanguage\.googleapis\.com wss:\/\/generativelanguage\.googleapis\.com/);
assert.doesNotMatch(csp, /unsafe-eval/);

// --- first-run setup
await page.getByText("Vítejte v aplikaci Komenský").waitFor();
await page.getByPlaceholder("AIza…").fill("test-key-123456");
await page.getByRole("button", { name: "Test klíče" }).click();
await page.getByText("Klíč funguje").waitFor();
await page.getByPlaceholder("PIN", { exact: true }).fill("2468");
await page.getByPlaceholder("PIN znovu").fill("2468");
await page.getByRole("button", { name: "Uložit a začít" }).click();
await page.getByText("Přehled kurzu").waitFor();
console.log("setup done, home shown");

// the renderer must never hold the key
const leaks = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage, document.cookie]));
assert.ok(!leaks.includes("test-key-123456"));

// --- start the first lesson (fake plan) and run it at 10x clock speed with the scripted teacher
await page.evaluate(() => { window.__KOMENSKY_TIME_SCALE = 10; });
await page.getByRole("button", { name: /Začít lekci/ }).click();
await page.getByLabel("Začít lekci").waitFor({ timeout: 20000 });
await page.getByLabel("Začít lekci").click();
await page.getByText("Lekce splněna").waitFor({ timeout: 240000 });
console.log("lesson 1.1 completed by the state machine");

await page.getByRole("button", { name: "Zpět na přehled" }).last().click();
await page.getByText("1 / 18 lekcí").waitFor();

// --- admin
await page.getByRole("button", { name: /Nastavení/ }).click();
await page.getByRole("button", { name: /Správce/ }).click();
await page.locator('input[type="password"]').fill("0000");
await page.getByRole("button", { name: "Odemknout" }).click();
await page.getByText("Nesprávný PIN").waitFor();
await page.locator('input[type="password"]').fill("2468");
await page.getByRole("button", { name: "Odemknout" }).click();
await page.getByText("Slabá místa").waitFor();
await page.getByRole("button", { name: "Přepisy" }).click();
await page.getByText("Dlouhý výklad").first().waitFor();
console.log("admin OK, transcripts saved");
await app.close();

// --- persistence across restart (progress must survive)
app = await launch();
page = await app.firstWindow();
await page.getByText("2 / 18 lekcí").or(page.getByText("1 / 18 lekcí")).waitFor({ timeout: 20000 });
console.log("restart: progress kept");
await app.close();

const real = errors.filter((e) => !/Failed to load resource|favicon/i.test(e));
console.log("renderer errors:", real.length ? real : "none");
assert.equal(real.length, 0);
rmSync(dataDir, { recursive: true, force: true });
console.log("SMOKE TEST PASSED");
