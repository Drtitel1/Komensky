import { describe, expect, it, vi } from "vitest";
import type { Curriculum } from "@shared/types";
import { PlanSchema } from "@shared/types";

vi.mock("../src/main/log", () => ({ default: { info: () => {}, warn: () => {}, error: () => {} } }));
const calls: { kind: string; prompt: string }[] = [];
let checkResults: { verdict: "pass" | "fail"; issues: { where: string; problem: string }[] }[] = [];

const rq = (i: number, type: "mc" | "short" = i % 2 ? "mc" : "short") => ({
  type, prompt: `Kolik je ${i} · 2?`, answer: String(i * 2), explanation: "Násobíme dvěma.", sourceId: "Z1",
  ...(type === "mc" ? { options: [String(i * 2), String(i * 2 + 1), String(i * 2 + 2)], correctIndex: 0 } : { accepted: [String(i * 2)] }),
});

vi.mock("../src/main/gemini", () => ({
  generateJson: async (o: { prompt: string; system: string }) => {
    let kind = "";
    if (/korektor/.test(o.system)) kind = "check";
    else if (/Rozděl lekci/.test(o.prompt)) kind = "outline";
    else if (/ZÁVĚREČNÝ KVÍZ o/.test(o.prompt)) kind = "final";
    else kind = "questions";
    calls.push({ kind, prompt: o.prompt });
    if (kind === "outline") return { parts: Array.from({ length: 5 }, (_, i) => ({ title: `Část ${i + 1}`, objectives: ["cíl"], keyFacts: ["fakt"], passageIds: ["Z1"], targetSeconds: i === 0 ? 30 : 240 })) };
    if (kind === "questions") {
      const only = /jen pro části ([\d, ]+)/.exec(o.prompt)?.[1]?.split(",").map((x) => Number(x.trim()) - 1);
      return { parts: (only ?? [0, 1, 2, 3, 4]).map((index) => ({ index, questions: [rq(index + 1), rq(index + 2), rq(index + 3)] })) };
    }
    if (kind === "final") return { questions: Array.from({ length: 12 }, (_, i) => rq(i + 1)) };
    return checkResults.shift() ?? { verdict: "pass", issues: [] };
  },
}));

const { generatePlan } = await import("../src/main/planner");

const curriculum: Curriculum = {
  schema: 1, id: "test", subject: "Matematika", age: 8,
  stages: [{ id: 1, title: "E", description: "", lessons: [{ id: "1.1", title: "Násobení", objectives: ["o"], keyFacts: ["k"], passages: [{ id: "Z1", text: "Násobení je opakované sčítání." }] }] }],
};
const run = () => generatePlan({ key: "k", model: "m", curriculum, lesson: curriculum.stages[0].lessons[0], onProgress: () => {} });
const reset = (c: typeof checkResults = []) => { calls.length = 0; checkResults = c; };

describe("plan generation", () => {
  it("builds a valid plan: 5 parts, 2-4 questions each, 10-15 quiz questions, source-linked", async () => {
    reset();
    const plan = await run();
    expect(() => PlanSchema.parse(plan)).not.toThrow();
    expect(plan.parts).toHaveLength(5);
    expect(plan.parts.every((p) => p.questions.length >= 2 && p.questions.length <= 4)).toBe(true);
    expect(plan.finalQuiz.length).toBeGreaterThanOrEqual(10);
    expect(plan.parts[0].targetSeconds).toBe(150); // clamped into 150..330
    expect(plan.parts[0].questions[0].source).toContain("[1.1/Z1]");
    expect(plan.flags).toEqual([]);
    expect(calls.filter((c) => c.kind === "check")).toHaveLength(1);
  });

  it("shuffles multiple-choice options but keeps the key consistent", async () => {
    reset();
    const plan = await run();
    for (const q of plan.finalQuiz.filter((x) => x.type === "mc")) expect(q.options![q.correctIndex!]).toBe(q.answer);
  });

  it("regenerates only the section the fact-checker rejected, then passes", async () => {
    reset([{ verdict: "fail", issues: [{ where: "část 3: otázka 1", problem: "špatný klíč" }] }, { verdict: "pass", issues: [] }]);
    const plan = await run();
    const q = calls.filter((c) => c.kind === "questions");
    expect(q).toHaveLength(2);
    expect(q[1].prompt).toContain("jen pro části 3");
    expect(q[1].prompt).toContain("špatný klíč");
    expect(calls.filter((c) => c.kind === "final")).toHaveLength(1);
    expect(plan.flags).toEqual([]);
  });

  it("gives up after two fixes, keeps the plan and logs the leftovers as flags", async () => {
    reset(Array.from({ length: 5 }, () => ({ verdict: "fail" as const, issues: [{ where: "kvíz: otázka 2", problem: "nejednoznačné" }] })));
    const plan = await run();
    expect(calls.filter((c) => c.kind === "check")).toHaveLength(3);
    expect(calls.filter((c) => c.kind === "final")).toHaveLength(3);
    expect(plan.flags).toHaveLength(1);
    expect(plan.flags[0].issues[0]).toContain("nejednoznačné");
  });
});
