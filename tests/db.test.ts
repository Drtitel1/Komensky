import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// db.ts logs through electron-log; the tests run in plain Node
vi.mock("../src/main/log", () => ({ default: { info: () => {}, warn: () => {}, error: () => {} } }));
const { MIGRATIONS, Store, migrate } = await import("../src/main/db");
import { makePlan } from "./helpers";
import { newLessonState } from "@shared/engine";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "komensky-db-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("store", () => {
  it("saves progress, answers and spaced repetition", () => {
    const s = new Store(":memory:");
    s.savePlan(makePlan());
    s.markPlanStarted("9.1");
    expect(s.getPlan("9.1")?.started).toBe(true);
    s.saveState(newLessonState("9.1", []));
    expect(s.getProgress("9.1")?.status).toBe("in_progress");
    s.addAnswer("9.1", { qid: "9.1:p1:q1", context: "check", given: "x", correct: false, feedback: "", revealed: false, at: "2026-01-01" });
    s.updateSrs("9.1:p1:q1", "9.1", false, 1000);
    expect(s.dueSrs(["9.1"], 4, 1000)).toHaveLength(1);
    s.updateSrs("9.1:p1:q1", "9.1", true, 1000); // box 1 -> due in a day
    expect(s.dueSrs(["9.1"], 4, 1000)).toHaveLength(0);
    expect(s.dueSrs(["9.1"], 4, 1000 + 2 * 86_400_000)).toHaveLength(1);
    s.completeLesson("9.1", 0.9);
    expect(s.completedIds()).toEqual(["9.1"]);
    // a finished lesson's state is never overwritten by a late autosave
    s.saveState({ ...newLessonState("9.1", []), phase: "CHECK" });
    expect(s.getProgress("9.1")?.status).toBe("completed");
  });

  it("only wrong answers enter the SRS queue; a mastered item leaves it", () => {
    const s = new Store(":memory:");
    s.updateSrs("q", "1.1", true, 0);
    expect(s.srsCount(1e12)).toBe(0);
    s.updateSrs("q", "1.1", false, 0);
    for (let i = 0; i < 5; i++) s.updateSrs("q", "1.1", true, 0);
    expect(s.srsCount(1e12)).toBe(0);
  });

  it("exports and imports everything (backup round trip)", () => {
    const a = new Store(":memory:");
    a.kvSet("pin_hash", "abc");
    a.savePlan(makePlan());
    a.saveState(newLessonState("9.1", []));
    a.addAnswer("9.1", { qid: "q", context: "final", given: "g", correct: true, feedback: "f", revealed: false, at: "t" });
    a.addTranscript("9.1", "user", "ahoj", "EXPLAIN");
    a.completeLesson("9.1", 0.8);
    const dump = JSON.parse(JSON.stringify(a.exportAll()));
    const b = new Store(":memory:");
    b.savePlan({ ...makePlan(), lessonId: "other" });
    b.importAll(dump);
    expect(b.kvGet("pin_hash")).toBe("abc");
    expect(b.getPlan("9.1")?.plan.parts).toHaveLength(5);
    expect(b.getPlan("other")).toBeNull();
    expect(b.completedIds()).toEqual(["9.1"]);
    expect(b.transcripts("9.1")[0].text).toBe("ahoj");
  });

  it("rejects malformed or hostile backups without touching the data", () => {
    const s = new Store(":memory:");
    s.kvSet("k", "v");
    expect(() => s.importAll({ app: "other" } as never)).toThrow();
    const evil = { ...s.exportAll(), kv: [{ "key) VALUES ('x','y'); DROP TABLE kv; --": "1" }] };
    expect(() => s.importAll(evil as never)).toThrow();
    expect(s.kvGet("k")).toBe("v"); // transaction rolled back
  });
});

describe("migrations", () => {
  it("creates the schema on a new database", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(db.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);
  });

  it("keeps her data and writes a .bak file when an older database is upgraded", () => {
    const file = join(tmp(), "komensky.db");
    // a "v1 database" from an earlier app version
    const old = new Database(file);
    old.exec(MIGRATIONS[0]);
    old.pragma("user_version = 1");
    old.prepare("INSERT INTO lesson_progress (lesson_id, status, score, started_at, completed_at, updated_at) VALUES ('1.1','completed',0.9,'t','t','t')").run();
    old.close();

    // pretend a newer app version appended a migration
    MIGRATIONS.push("ALTER TABLE lesson_progress ADD COLUMN note TEXT;");
    try {
      const s = new Store(file);
      expect(s.db.pragma("user_version", { simple: true })).toBe(2);
      expect(s.completedIds()).toEqual(["1.1"]);
      s.close();
      expect(readdirSync(join(file, ".."))).toContain("komensky.db.pre-v1.bak");
    } finally {
      MIGRATIONS.pop();
    }
  });

  it("refuses to open a database from a newer app version instead of damaging it", () => {
    const file = join(tmp(), "komensky.db");
    const db = new Database(file);
    db.pragma(`user_version = ${MIGRATIONS.length + 5}`);
    db.close();
    expect(() => new Store(file)).toThrow(/novější verze/);
    expect(existsSync(file)).toBe(true);
  });
});
