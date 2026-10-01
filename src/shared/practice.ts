/** Offline multiplication practice (no AI involved): question generation and a re-asking queue. */

export interface PracticeQ {
  a: number;
  b: number;
  /** which position the child has to fill in: the product (classic) or one of the factors */
  hide: "product" | "a" | "b";
}

export const answerOf = (q: PracticeQ): number => (q.hide === "product" ? q.a * q.b : q.hide === "a" ? q.a : q.b);

/** "7 × 8 = ?", "? × 8 = 56", "7 × ? = 56" */
export function promptOf(q: PracticeQ): string {
  const p = q.a * q.b;
  return q.hide === "product" ? `${q.a} × ${q.b} = ?` : q.hide === "a" ? `? × ${q.b} = ${p}` : `${q.a} × ? = ${p}`;
}

export interface PracticeOptions {
  /** multiplication tables to practise (1..10) */
  tables: number[];
  count: number;
  /** also ask "? × 4 = 20" style questions */
  missing: boolean;
}

/** `count` questions, no repeats while the pool allows it; `rng` is injectable for tests. */
export function makeQuestions(opts: PracticeOptions, rng: () => number = Math.random): PracticeQ[] {
  const tables = [...new Set(opts.tables.filter((t) => Number.isInteger(t) && t >= 1 && t <= 10))];
  if (!tables.length) return [];
  const pool: PracticeQ[] = [];
  for (const t of tables) {
    for (let b = 1; b <= 10; b++) {
      const flip = rng() < 0.5;
      const [x, y] = flip ? [b, t] : [t, b];
      const hide = opts.missing && rng() < 0.3 ? (rng() < 0.5 ? "a" : "b") : "product";
      pool.push({ a: x, b: y, hide });
    }
  }
  // Fisher–Yates
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const out: PracticeQ[] = [];
  while (out.length < opts.count) out.push(...pool.slice(0, opts.count - out.length));
  return out;
}

/** Wrong answers are asked once more later in the round (not immediately), then the round ends. */
export class PracticeRun {
  private queue: PracticeQ[];
  private retried = new Set<string>();
  asked = 0;
  correct = 0;
  /** first-try mistakes, for the summary */
  mistakes: PracticeQ[] = [];
  readonly total: number;

  constructor(questions: PracticeQ[]) {
    this.queue = [...questions];
    this.total = questions.length;
  }

  get current(): PracticeQ | undefined {
    return this.queue[0];
  }
  get done(): boolean {
    return this.queue.length === 0;
  }
  get remaining(): number {
    return this.queue.length;
  }

  /** returns whether the answer was right */
  answer(value: number): boolean {
    const q = this.queue.shift();
    if (!q) return false;
    const key = `${q.a}x${q.b}${q.hide}`;
    const ok = value === answerOf(q);
    if (!this.retried.has(key)) {
      this.asked++;
      if (ok) this.correct++;
      else this.mistakes.push(q);
    }
    if (!ok) {
      this.retried.add(key);
      // ask again after a few other questions (or at the end if fewer remain)
      this.queue.splice(Math.min(3, this.queue.length), 0, q);
    }
    return ok;
  }

  get score(): number {
    return this.asked ? this.correct / this.asked : 0;
  }
}
