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

// --- start the first lesson (fake plan) and run it at 10x clock speed with the scripted teacher, answering ONLY by push-to-talk
await page.evaluate(() => { window.__KOMENSKY_TIME_SCALE = 10; });
console.log("version label:", await page.getByTestId("version").innerText());
await page.getByRole("button", { name: /Začít lekci/ }).click();
await page.getByLabel("Začít lekci").waitFor({ timeout: 20000 });
await page.getByLabel("Začít lekci").click();
await page.getByTestId("ptt").waitFor({ timeout: 20000 });

const fake = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__KOMENSKY_FAKE?.stats ?? null)));
const hold = async (ms = 600) => {
  await page.keyboard.down("Space");
  await page.waitForTimeout(ms);
  await page.keyboard.up("Space");
};
const timerSeconds = async () => {
  const [m, sec] = (await page.getByTestId("timer").innerText()).split(":").map(Number);
  return m * 60 + sec;
};

// the child answers every question by holding the key once
let stop = false;
let lastKey = "";
const presser = (async () => {
  while (!stop) {
    try {
      const state = await page.getByTestId("ptt").getAttribute("data-state", { timeout: 400 });
      const card = await page.locator("text=/otázka \\d+ z \\d+/i").first().innerText({ timeout: 400 }).catch(() => "");
      const prompt = card ? await page.locator("p.text-2xl").first().innerText({ timeout: 400 }).catch(() => "") : "";
      const key = `${card}|${prompt}`;
      if (card && state === "idle" && key !== lastKey) {
        const before = (await fake())?.activityStarts ?? 0;
        await hold(500);
        if (((await fake())?.activityStarts ?? 0) > before) lastKey = key;
      }
    } catch { /* page changing, try again */ }
    await page.waitForTimeout(150);
  }
})();

const bodyText = () => page.locator("body").innerText();
const waitFor = async (re, timeout = 120000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (re.test(await bodyText())) return;
    await page.waitForTimeout(250);
  }
  throw new Error("timeout waiting for " + re);
};

// barge-in: press while the tutor is speaking -> it must stop (server side interrupt + local flush)
await page.waitForFunction(() => document.querySelector('[data-testid="ptt"]')?.getAttribute("data-state") === "speaking", null, { timeout: 15000 });
const i0 = (await fake()).interrupts;
const before = await fake();
await hold(400);
const after = await fake();
console.log("barge-in stats", JSON.stringify(before), JSON.stringify(after), await page.getByTestId("ptt").getAttribute("data-state"), await page.getByTestId("status").innerText());
assert.ok(after.interrupts > i0, "pressing the button while the tutor speaks must interrupt it");
console.log("barge-in OK");

// forced reconnect #1: dropped socket, resumed with the session handle
await waitFor(/Část 2 z 5/);
let t = await timerSeconds();
await page.evaluate(() => window.__KOMENSKY_FAKE.drop());
await waitFor(/Část 3 z 5/);
let st = await fake();
assert.ok(st.resumedSessions >= 1, "reconnect must resume the session");
assert.ok((await timerSeconds()) > t, "lesson clock must keep running across a reconnect");
console.log("reconnect (resumed) OK, resumed:", st.resumedSessions);

// forced reconnect #2: the handle is rejected -> fresh session, the current step is re-sent
await page.evaluate(() => { window.__KOMENSKY_FAKE.rejectHandle = true; window.__KOMENSKY_FAKE.drop(); });
await waitFor(/Část 4 z 5/);
st = await fake();
assert.ok(st.freshSessions >= 2, "a rejected handle must lead to a fresh session");
console.log("reconnect (fresh) OK, fresh:", st.freshSessions);

// forced reconnect #3: silently dead socket (no close event) -> the watchdog must notice
t = await timerSeconds();
await page.evaluate(() => { window.__KOMENSKY_FAKE.silentDrop = true; window.__KOMENSKY_FAKE.drop(); });
await waitFor(/Část 5 z 5/, 180000);
st = await fake();
assert.ok(st.connects >= 4, "watchdog must reconnect a silently dead connection");
console.log("reconnect (watchdog) OK, connects:", st.connects);

await page.getByText("Lekce splněna").waitFor({ timeout: 240000 });
stop = true;
await presser;
st = await fake();
console.log("fake teacher stats:", JSON.stringify(st));
assert.equal(st.chunksOutsideActivity, 0, "microphone audio must be sent ONLY while the button is held");
assert.equal(st.badNesting, 0);
assert.equal(st.activityStarts, st.activityEnds, "every activityStart needs an activityEnd");
assert.ok(st.audioChunks > 0);
console.log("lesson 1.1 completed by the state machine with push-to-talk only");

await page.getByRole("button", { name: "Zpět na přehled" }).last().click();
await page.getByText("1 / 18 lekcí").waitFor();

// --- skip a lesson with the admin code (wrong code first)
await page.getByTestId("skip-link").click();
await page.getByPlaceholder("Kód správce").fill("0000");
await page.getByRole("button", { name: "Přeskočit lekci" }).click();
await page.getByText("Nesprávný kód správce").waitFor();
await page.getByPlaceholder("Kód správce").fill("2468");
await page.getByRole("button", { name: "Přeskočit lekci" }).click();
await page.getByText("2 / 18 lekcí").waitFor();
await page.getByText("přeskočeno").first().waitFor();
console.log("skip with admin code OK");

// --- admin
await page.getByRole("button", { name: /Nastavení/ }).click();
await page.getByRole("button", { name: /Správce/ }).click();
await page.locator('input[type="password"]').fill("0000");
await page.getByRole("button", { name: "Odemknout" }).click();
await page.getByText("Nesprávný kód správce").waitFor();
await page.locator('input[type="password"]').fill("2468");
await page.getByRole("button", { name: "Odemknout" }).click();
await page.getByText("Slabá místa").waitFor();
await page.getByRole("button", { name: "Přepisy" }).click();
await page.getByText("Dlouhý výklad").first().waitFor();
console.log("admin OK, transcripts saved");

// --- curriculum: generate a new course (fake generator in test mode), save, activate, edit
await page.getByRole("button", { name: "Učivo" }).click();
await page.getByText("původní kurz").waitFor();
await page.getByRole("button", { name: /Vygenerovat kurz/ }).click();
await page.getByPlaceholder(/např. Angličtina/).fill("Angličtina");
await page.getByPlaceholder(/4\. třída ZŠ/).fill("4. třída ZŠ");
await page.getByRole("button", { name: "Vygenerovat", exact: true }).click();
await page.getByText("Nový kurz (zatím neuložený)").waitFor({ timeout: 20000 });
await page.getByRole("button", { name: "Uložit kurz" }).click();
await page.getByText("vygenerovaný AI").waitFor();
await page.getByRole("button", { name: "Nastavit jako aktivní" }).click();
await page.getByText("Aktivní kurz: Angličtina").waitFor();
await page.getByRole("button", { name: "Upravit" }).nth(1).click();
await page.getByText("Úprava kurzu: Angličtina").waitFor();
await page.locator('input[placeholder="Název lekce"]').first().fill("Moje první lekce");
await page.getByRole("button", { name: "Uložit kurz" }).click();
await page.getByText("byl uložen").waitFor();
console.log("course generated, saved, activated, edited");
// invalid edit is rejected with a Czech message
await page.getByRole("button", { name: "Upravit" }).nth(1).click();
await page.getByRole("button", { name: "JSON" }).click();
const bad = await page.locator("textarea").first().inputValue();
await page.locator("textarea").first().fill(bad.replace(/"age": \d+/, '"age": 2'));
await page.getByRole("button", { name: "Uložit kurz" }).click();
await page.getByText("Kurz nejde uložit").waitFor();
await page.getByRole("button", { name: "Zpět bez uložení" }).click();
await page.getByLabel("Zavřít").click();
await page.getByText("0 / 9 lekcí").waitFor();

// skip from inside a lesson (admin code), in the new course
await page.getByRole("button", { name: /Začít lekci/ }).click();
await page.getByTestId("skip-lesson").waitFor({ timeout: 20000 });
await page.getByTestId("skip-lesson").click();
await page.getByPlaceholder("Kód správce").fill("2468");
await page.getByRole("button", { name: "Přeskočit lekci", exact: true }).click();
await page.getByText("1 / 9 lekcí").waitFor({ timeout: 20000 });
console.log("skip from inside a lesson OK");

// switch back to maths: her maths progress is untouched
await page.getByRole("button", { name: /Nastavení/ }).click();
await page.getByRole("button", { name: /Správce/ }).click();
await page.locator('input[type="password"]').fill("2468");
await page.getByRole("button", { name: "Odemknout" }).click();
await page.getByRole("button", { name: "Učivo" }).click();
await page.getByRole("button", { name: "Nastavit jako aktivní" }).first().click();
await page.getByText("Aktivní kurz: Matematika").waitFor();
await page.getByLabel("Zavřít").click();
await page.getByText("2 / 18 lekcí").waitFor();
console.log("course switch keeps each course's progress");
await app.close();

// --- persistence across restart (progress must survive)
app = await launch();
page = await app.firstWindow();
await page.getByText("2 / 18 lekcí").waitFor({ timeout: 20000 });
console.log("restart: progress kept");
await app.close();

const real = errors.filter((e) => !/Failed to load resource|favicon/i.test(e));
console.log("renderer errors:", real.length ? real : "none");
assert.equal(real.length, 0);
rmSync(dataDir, { recursive: true, force: true });
console.log("SMOKE TEST PASSED");
