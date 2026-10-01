import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveEvents, LiveLike } from "../src/renderer/src/live/session";

/* The reconnect logic of the live connection, tested against a scripted transport (no network, no browser). */

interface Fake extends LiveLike {
  ev: LiveEvents;
  handle: string | undefined;
  sent: string[];
  activity: string[];
  closed: boolean;
}
const sessions: Fake[] = [];
let behaviour: (handle: string | undefined) => "ok" | "early" | "throw" = () => "ok";

vi.mock("../src/renderer/src/live/session", () => ({
  connectLive: async (_info: unknown, handle: string | undefined, ev: LiveEvents) => {
    const mode = behaviour(handle);
    if (mode === "throw") throw new Error("connect failed");
    const s: Fake = {
      ev, handle, sent: [], activity: [], closed: false, openedAt: Date.now(),
      early: mode === "early" ? { code: 1007, reason: "bad handle" } : undefined,
      get isClosed() { return this.closed; },
      sendControl(t: string) { this.sent.push(t); },
      sendAudio() {},
      sendActivityStart() { this.activity.push("start"); },
      sendActivityEnd() { this.activity.push("end"); },
      sendToolResponse() {},
      close() { this.closed = true; },
    } as Fake;
    if (mode === "early") s.closed = true;
    sessions.push(s);
    return s;
  },
}));

const { LiveConnection, WATCHDOG_MS } = await import("../src/renderer/src/live/connection");

const listeners: Record<string, () => void> = {};
let online = true;
const tick = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); };

type Mint = () => Promise<{ ok: true; info: { token: string; model: string; config: Record<string, unknown> } } | { ok: false; error: string }>;
function setup(mint: Mint = async () => ({ ok: true as const, info: { token: "t", model: "m", config: {} } })) {
  const log = { states: [] as string[], fresh: 0, resumed: 0, audio: 0 };
  const conn = new LiveConnection(
    mint,
    {
      onState: (s) => log.states.push(s),
      onFreshSession: () => log.fresh++,
      onResumed: () => log.resumed++,
      onAudio: () => log.audio++,
      onInputTranscript: () => {}, onOutputTranscript: () => {}, onTurnComplete: () => {}, onInterrupted: () => {},
      onUsage: () => {}, onToolCalls: () => {},
    },
    () => "summary",
  );
  return { conn, log };
}
const last = () => sessions[sessions.length - 1];
async function openFirst(h: ReturnType<typeof setup>) {
  const p = h.conn.open();
  await tick(0);
  await p;
  last().ev.onSetup();
  last().ev.onResumptionHandle("h1");
  await tick(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  sessions.length = 0;
  behaviour = () => "ok";
  online = true;
  vi.stubGlobal("window", { addEventListener: (t: string, f: () => void) => (listeners[t] = f), removeEventListener: (t: string) => delete listeners[t] });
  vi.stubGlobal("navigator", { get onLine() { return online; } });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("LiveConnection", () => {
  it("opens a fresh session and reports it", async () => {
    const h = setup();
    await openFirst(h);
    expect(h.conn.isOpen).toBe(true);
    expect(h.log.fresh).toBe(1);
    expect(sessions[0].handle).toBeUndefined();
  });

  it("after an unexpected close it reconnects WITH the resumption handle and delivers queued instructions", async () => {
    const h = setup();
    await openFirst(h);
    sessions[0].ev.onClose({ code: 1006 });
    h.conn.sendControl("[LESSON CONTROL] while offline"); // arrives while reconnecting
    await tick(10);
    expect(sessions).toHaveLength(2);
    expect(sessions[1].handle).toBe("h1");
    sessions[1].ev.onSetup();
    expect(h.log.resumed).toBe(1);
    expect(h.log.fresh).toBe(1); // no second fresh session
    expect(sessions[1].sent).toEqual(["[LESSON CONTROL] while offline"]);
  });

  it("a rejected handle falls back to a FRESH session instead of hanging", async () => {
    const h = setup();
    await openFirst(h);
    behaviour = (handle) => (handle ? "early" : "ok");
    sessions[0].ev.onClose({ code: 1006 });
    await tick(50);
    expect(sessions).toHaveLength(3);
    expect(sessions[1].handle).toBe("h1");
    expect(sessions[2].handle).toBeUndefined();
    sessions[2].ev.onSetup();
    expect(h.log.fresh).toBe(2); // the engine is told to re-send the current step
    expect(h.conn.isOpen).toBe(true);
  });

  it("goAway: hands over to a new resumed connection and closes the old one only afterwards", async () => {
    const h = setup();
    await openFirst(h);
    sessions[0].ev.onGoAway(30_000);
    await tick(3000);
    expect(sessions).toHaveLength(2);
    expect(sessions[1].handle).toBe("h1");
    expect(sessions[0].closed).toBe(true);
    sessions[1].ev.onSetup();
    expect(h.conn.isOpen).toBe(true);
  });

  it("a failed hand-over keeps the old connection alive", async () => {
    const h = setup();
    await openFirst(h);
    behaviour = () => "early";
    sessions[0].ev.onGoAway(30_000);
    await tick(3000);
    expect(sessions[0].closed).toBe(false);
  });

  it("retries token failures with backoff and gives up with a clear failure after 6 attempts", async () => {
    let fail = false;
    const h = setup(async () => (fail ? { ok: false as const, error: "Služba je přetížená" } : { ok: true as const, info: { token: "t", model: "m", config: {} } }));
    await openFirst(h);
    fail = true;
    sessions[0].ev.onClose({ code: 1006 });
    await tick(120_000);
    expect(h.log.states).toContain("reconnecting");
    expect(h.log.states[h.log.states.length - 1]).toBe("failed");
  });

  it("goes offline and reconnects when the network comes back", async () => {
    const h = setup();
    await openFirst(h);
    online = false;
    sessions[0].ev.onClose({ code: 1006 });
    await tick(10);
    expect(h.log.states[h.log.states.length - 1]).toBe("offline");
    expect(sessions).toHaveLength(1);
    online = true;
    listeners["online"]();
    await tick(10);
    expect(sessions).toHaveLength(2);
  });

  it("watchdog: a silently dead socket (no close event) is replaced after 25 s without any answer", async () => {
    const h = setup();
    await openFirst(h);
    h.conn.sendControl("[LESSON CONTROL] x");
    await tick(WATCHDOG_MS + 4000);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].closed).toBe(true);
    expect(sessions[1].handle).toBe("h1");
  });

  it("watchdog stays quiet while the teacher keeps answering", async () => {
    const h = setup();
    await openFirst(h);
    h.conn.sendControl("[LESSON CONTROL] x");
    await tick(10_000);
    sessions[0].ev.onMessage();
    await tick(30_000);
    expect(sessions).toHaveLength(1);
  });

  it("push-to-talk signals are only sent through a usable connection", async () => {
    const h = setup();
    expect(h.conn.activityStart()).toBe(false); // not open yet
    await openFirst(h);
    expect(h.conn.activityStart()).toBe(true);
    expect(h.conn.activityEnd()).toBe(true);
    expect(sessions[0].activity).toEqual(["start", "end"]);
    sessions[0].ev.onClose({ code: 1006 });
    expect(h.conn.activityStart()).toBe(false);
  });

  it("a failure of the very first connection is reported, not retried forever, and can be retried by hand", async () => {
    behaviour = () => "throw";
    const h = setup();
    await h.conn.open();
    expect(h.log.states[h.log.states.length - 1]).toBe("failed");
    behaviour = () => "ok";
    const p = h.conn.retry();
    await tick(10);
    await p;
    last().ev.onSetup();
    expect(h.conn.isOpen).toBe(true);
    expect(h.log.fresh).toBe(1); // the lesson starts now
  });

  it("manual retry after the automatic attempts gave up works again", async () => {
    let fail = false;
    const h = setup(async () => (fail ? { ok: false as const, error: "x" } : { ok: true as const, info: { token: "t", model: "m", config: {} } }));
    await openFirst(h);
    fail = true;
    sessions[0].ev.onClose({ code: 1006 });
    await tick(120_000);
    expect(h.log.states[h.log.states.length - 1]).toBe("failed");
    fail = false;
    const p = h.conn.retry();
    await tick(10);
    await p;
    last().ev.onSetup();
    expect(h.conn.isOpen).toBe(true);
  });
});
