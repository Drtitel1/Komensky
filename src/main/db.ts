import Database from "better-sqlite3";
import { copyFileSync, existsSync, statSync } from "node:fs";
import type { AnswerRec, LessonState, Plan } from "@shared/types";
import { nextSrs, type SrsRow } from "@shared/srs";
import log from "./log";

/* Schema migrations. Only ever APPEND to this list: an update must never drop or rewrite her progress.
 * PRAGMA user_version stores how many migrations are applied. Before migrating an existing database the
 * file is copied to <db>.pre-v<N>.bak. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE lesson_plans (
    lesson_id TEXT PRIMARY KEY, plan_json TEXT NOT NULL, model TEXT NOT NULL,
    started INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE lesson_progress (
    lesson_id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('in_progress','completed')),
    state_json TEXT, score REAL, started_at TEXT NOT NULL, completed_at TEXT, updated_at TEXT NOT NULL
  );
  CREATE TABLE answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT NOT NULL, question_id TEXT NOT NULL, context TEXT NOT NULL,
    given TEXT NOT NULL, correct INTEGER NOT NULL, feedback TEXT NOT NULL DEFAULT '', revealed INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL
  );
  CREATE INDEX answers_lesson ON answers (lesson_id);
  CREATE TABLE srs (
    qid TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, box INTEGER NOT NULL, due_at INTEGER NOT NULL, wrong_count INTEGER NOT NULL
  );
  CREATE TABLE transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, phase TEXT NOT NULL, at TEXT NOT NULL
  );
  CREATE INDEX transcripts_lesson ON transcripts (lesson_id);
  `,
];

export function migrate(db: Database.Database, file?: string) {
  const current = db.pragma("user_version", { simple: true }) as number;
  if (current > MIGRATIONS.length) throw new Error(`Databáze pochází z novější verze aplikace (schema ${current}). Aktualizujte aplikaci.`);
  if (current === MIGRATIONS.length) return;
  if (current > 0 && file && existsSync(file) && statSync(file).size > 0) {
    db.pragma("wal_checkpoint(TRUNCATE)");
    copyFileSync(file, `${file}.pre-v${current}.bak`);
    log.info(`database backed up before migration ${current} -> ${MIGRATIONS.length}`);
  }
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
    log.info(`database migrated to v${i + 1}`);
  }
}

export interface ProgressRow {
  lesson_id: string;
  status: "in_progress" | "completed";
  state_json: string | null;
  score: number | null;
  started_at: string;
  completed_at: string | null;
}

const now = () => new Date().toISOString();

export class Store {
  readonly db: Database.Database;
  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    migrate(this.db, file === ":memory:" ? undefined : file);
  }
  close() {
    this.db.close();
  }

  /* ----- kv ----- */
  kvGet(key: string): string | null {
    return (this.db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
  }
  kvSet(key: string, value: string) {
    this.db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  /* ----- plans ----- */
  getPlan(lessonId: string): { plan: Plan; started: boolean } | null {
    const r = this.db.prepare("SELECT plan_json, started FROM lesson_plans WHERE lesson_id = ?").get(lessonId) as { plan_json: string; started: number } | undefined;
    if (!r) return null;
    return { plan: JSON.parse(r.plan_json) as Plan, started: !!r.started };
  }
  getPlanJson(lessonId: string): string | null {
    return (this.db.prepare("SELECT plan_json FROM lesson_plans WHERE lesson_id = ?").get(lessonId) as { plan_json: string } | undefined)?.plan_json ?? null;
  }
  savePlan(plan: Plan, keepStarted = false) {
    const t = now();
    this.db
      .prepare(
        `INSERT INTO lesson_plans (lesson_id, plan_json, model, started, created_at, updated_at) VALUES (@id, @json, @model, 0, @t, @t)
         ON CONFLICT(lesson_id) DO UPDATE SET plan_json = excluded.plan_json, model = excluded.model, updated_at = excluded.updated_at${keepStarted ? "" : ", started = 0"}`,
      )
      .run({ id: plan.lessonId, json: JSON.stringify(plan), model: plan.model, t });
  }
  markPlanStarted(lessonId: string) {
    this.db.prepare("UPDATE lesson_plans SET started = 1 WHERE lesson_id = ?").run(lessonId);
  }
  deletePlan(lessonId: string) {
    this.db.prepare("DELETE FROM lesson_plans WHERE lesson_id = ?").run(lessonId);
  }

  /* ----- progress ----- */
  getProgress(lessonId: string): ProgressRow | undefined {
    return this.db.prepare("SELECT * FROM lesson_progress WHERE lesson_id = ?").get(lessonId) as ProgressRow | undefined;
  }
  allProgress(): ProgressRow[] {
    return this.db.prepare("SELECT * FROM lesson_progress").all() as ProgressRow[];
  }
  completedIds(): string[] {
    return (this.db.prepare("SELECT lesson_id FROM lesson_progress WHERE status = 'completed'").all() as { lesson_id: string }[]).map((r) => r.lesson_id);
  }
  saveState(state: LessonState) {
    const t = now();
    this.db
      .prepare(
        `INSERT INTO lesson_progress (lesson_id, status, state_json, started_at, updated_at) VALUES (@id, 'in_progress', @json, @t, @t)
         ON CONFLICT(lesson_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
         WHERE lesson_progress.status = 'in_progress'`,
      )
      .run({ id: state.lessonId, json: JSON.stringify(state), t });
  }
  completeLesson(lessonId: string, score: number | null) {
    const t = now();
    this.db
      .prepare(
        `INSERT INTO lesson_progress (lesson_id, status, score, started_at, completed_at, updated_at) VALUES (@id, 'completed', @score, @t, @t, @t)
         ON CONFLICT(lesson_id) DO UPDATE SET status = 'completed', score = excluded.score, completed_at = excluded.completed_at, updated_at = excluded.updated_at`,
      )
      .run({ id: lessonId, score, t });
  }
  resetLesson(lessonId: string) {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM lesson_progress WHERE lesson_id = ?").run(lessonId);
      this.db.prepare("DELETE FROM answers WHERE lesson_id = ?").run(lessonId);
      this.db.prepare("UPDATE lesson_plans SET started = 0 WHERE lesson_id = ?").run(lessonId);
    })();
  }

  /* ----- answers / srs / transcripts ----- */
  addAnswer(lessonId: string, rec: AnswerRec) {
    this.db
      .prepare("INSERT INTO answers (lesson_id, question_id, context, given, correct, feedback, revealed, at) VALUES (?,?,?,?,?,?,?,?)")
      .run(lessonId, rec.qid, rec.context, rec.given, rec.correct ? 1 : 0, rec.feedback, rec.revealed ? 1 : 0, rec.at);
  }
  updateSrs(qid: string, lessonId: string, correct: boolean, t = Date.now()) {
    const prev = this.db.prepare("SELECT qid, lesson_id AS lessonId, box, due_at AS dueAt, wrong_count AS wrongCount FROM srs WHERE qid = ?").get(qid) as SrsRow | undefined;
    const next = nextSrs(prev, qid, lessonId, correct, t);
    if (next === undefined) return;
    if (next === "remove") {
      this.db.prepare("DELETE FROM srs WHERE qid = ?").run(qid);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO srs (qid, lesson_id, box, due_at, wrong_count) VALUES (@qid, @lessonId, @box, @dueAt, @wrongCount)
         ON CONFLICT(qid) DO UPDATE SET box = excluded.box, due_at = excluded.due_at, wrong_count = excluded.wrong_count`,
      )
      .run(next);
  }
  /** Due items from lessons OTHER than the current one (only earlier lessons are passed in). */
  dueSrs(lessonIds: string[], limit: number, t = Date.now()): SrsRow[] {
    if (!lessonIds.length) return [];
    const ph = lessonIds.map(() => "?").join(",");
    return this.db
      .prepare(`SELECT qid, lesson_id AS lessonId, box, due_at AS dueAt, wrong_count AS wrongCount FROM srs WHERE due_at <= ? AND lesson_id IN (${ph}) ORDER BY due_at ASC LIMIT ?`)
      .all(t, ...lessonIds, limit) as SrsRow[];
  }
  srsCount(t = Date.now()): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM srs WHERE due_at <= ?").get(t) as { n: number }).n;
  }
  addTranscript(lessonId: string, role: string, text: string, phase: string) {
    if (!text.trim()) return;
    this.db.prepare("INSERT INTO transcripts (lesson_id, role, text, phase, at) VALUES (?,?,?,?,?)").run(lessonId, role, text, phase, now());
  }
  transcripts(lessonId: string) {
    return this.db.prepare("SELECT role, text, phase, at FROM transcripts WHERE lesson_id = ? ORDER BY id").all(lessonId) as { role: string; text: string; phase: string; at: string }[];
  }
  answerStats(): { lesson_id: string; total: number; wrong: number }[] {
    return this.db.prepare("SELECT lesson_id, COUNT(*) AS total, SUM(1 - correct) AS wrong FROM answers GROUP BY lesson_id").all() as { lesson_id: string; total: number; wrong: number }[];
  }
  weakQuestions(limit = 15): { question_id: string; lesson_id: string; wrong: number; total: number }[] {
    return this.db
      .prepare("SELECT question_id, lesson_id, SUM(1 - correct) AS wrong, COUNT(*) AS total FROM answers GROUP BY question_id HAVING wrong > 0 ORDER BY wrong DESC, total DESC LIMIT ?")
      .all(limit) as { question_id: string; lesson_id: string; wrong: number; total: number }[];
  }

  /* ----- backup ----- */
  exportAll() {
    const rows = (t: string) => this.db.prepare(`SELECT * FROM ${t}`).all();
    return {
      app: "komensky",
      format: 1,
      schema: MIGRATIONS.length,
      exportedAt: now(),
      kv: rows("kv"),
      lesson_plans: rows("lesson_plans"),
      lesson_progress: rows("lesson_progress"),
      answers: rows("answers"),
      srs: rows("srs"),
      transcripts: rows("transcripts"),
    };
  }
  importAll(data: ReturnType<Store["exportAll"]>) {
    if (data.app !== "komensky" || data.format !== 1) throw new Error("Neplatný soubor zálohy.");
    if (data.schema > MIGRATIONS.length) throw new Error("Záloha je z novější verze aplikace. Nejdřív aplikaci aktualizujte.");
    const tables = ["kv", "lesson_plans", "lesson_progress", "answers", "srs", "transcripts"] as const;
    this.db.transaction(() => {
      for (const t of tables) this.db.prepare(`DELETE FROM ${t}`).run();
      for (const t of tables) {
        const valid = new Set((this.db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name));
        for (const row of (data[t] ?? []) as Record<string, unknown>[]) {
          const cols = Object.keys(row);
          if (!cols.length || cols.some((c) => !valid.has(c))) throw new Error("Záloha obsahuje neznámé sloupce.");
          this.db.prepare(`INSERT INTO ${t} (${cols.join(",")}) VALUES (${cols.map((c) => "@" + c).join(",")})`).run(row);
        }
      }
    })();
  }
}
