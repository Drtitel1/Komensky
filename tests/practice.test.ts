import { describe, expect, it } from "vitest";
import { answerOf, makeQuestions, PracticeRun, promptOf } from "../src/shared/practice";

describe("practice", () => {
  it("generates the requested number of questions from the chosen tables only", () => {
    const qs = makeQuestions({ tables: [3, 7], count: 15, missing: false });
    expect(qs).toHaveLength(15);
    for (const q of qs) expect(q.a === 3 || q.a === 7 || q.b === 3 || q.b === 7).toBe(true);
    expect(makeQuestions({ tables: [], count: 5, missing: false })).toEqual([]);
    expect(makeQuestions({ tables: [3], count: 25, missing: false })).toHaveLength(25);
  });
  it("has no repeats while the pool is big enough", () => {
    const qs = makeQuestions({ tables: [2, 3, 4], count: 20, missing: true });
    expect(new Set(qs.map((q) => `${q.a}x${q.b}${q.hide}`)).size).toBe(20);
  });
  it("formats prompts and answers", () => {
    expect(promptOf({ a: 7, b: 8, hide: "product" })).toBe("7 × 8 = ?");
    expect(promptOf({ a: 7, b: 8, hide: "a" })).toBe("? × 8 = 56");
    expect(answerOf({ a: 7, b: 8, hide: "b" })).toBe(8);
  });
  it("re-asks wrong answers once without counting them twice", () => {
    const run = new PracticeRun([{ a: 2, b: 3, hide: "product" }, { a: 4, b: 5, hide: "product" }]);
    expect(run.answer(7)).toBe(false);
    expect(run.remaining).toBe(2);
    expect(run.answer(20)).toBe(true);
    expect(run.answer(6)).toBe(true);
    expect(run.done).toBe(true);
    expect(run.asked).toBe(2);
    expect(run.correct).toBe(1);
    expect(run.mistakes).toHaveLength(1);
    expect(run.score).toBe(0.5);
  });
});
