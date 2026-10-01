import { describe, expect, it, vi } from "vitest";
import { allLessons, changedLessons, freeSlug, isMathSubject, reid, slugify, validateCourse } from "@shared/course";
import type { Curriculum } from "@shared/types";
import bundled from "../content/curriculum.json";

vi.mock("../src/main/log", () => ({ default: { info: () => {}, warn: () => {}, error: () => {} } }));
vi.mock("../src/main/secrets", () => ({ getApiKey: async () => "k" }));
vi.mock("../src/main/settings", () => ({ getSettings: () => ({ LIVE_MODEL: "l", PREP_MODEL: "p", VOICE: "" }) }));

const calls: { kind: string; prompt: string; system: string }[] = [];
let checks: { verdict: "pass" | "fail"; issues: { where: string; problem: string }[] }[] = [];
vi.mock("../src/main/gemini", () => ({
  czechError: (e: Error) => e.message,
  generateJson: async (o: { prompt: string; system: string }) => {
    const kind = /korektor/.test(o.system) && /ZKONTROLUJ/.test(o.prompt) ? "check" : /osnovu kurzu/.test(o.prompt) ? "outline" : "content";
    calls.push({ kind, prompt: o.prompt, system: o.system });
    if (kind === "outline")
      return { stages: [{ title: "Slovíčka", description: "Základy", lessons: [{ title: "Barvy", objectives: ["Pojmenovat barvy"] }, { title: "Čísla", objectives: ["Počítat do deseti"] }] }, { title: "Věty", description: "", lessons: [{ title: "Pozdravy", objectives: ["Pozdravit"] }] }] };
    if (kind === "content") {
      const n = /(?:LEKCE|Lekce) .*/.test(o.prompt) ? (/Slovíčka/.test(o.prompt) ? 2 : 1) : 1;
      return { lessons: Array.from({ length: n }, (_, i) => ({ keyFacts: [`Poznatek A${i}`, `Poznatek B${i}`], passages: [1, 2, 3].map((k) => `Dostatečně dlouhý odstavec číslo ${k} lekce ${i}, který má víc než třicet znaků.`) })) };
    }
    return checks.shift() ?? { verdict: "pass", issues: [] };
  },
}));

const { Store } = await import("../src/main/db");
const { LessonService } = await import("../src/main/lessons");
const { generateCourse } = await import("../src/main/courseGen");

const math = bundled as unknown as Curriculum;
const mk = (id: string, lessons = 2): Curriculum => ({
  schema: 1, id, subject: "Angličtina", age: 9, level: "4. třída", notes: "Slovíčka říkej anglicky.",
  stages: [{ id: 1, title: "Základy", description: "", lessons: Array.from({ length: lessons }, (_, i) => ({ id: `${id}-1.${i + 1}`, title: `Lekce ${i + 1}`, objectives: ["cíl"], keyFacts: ["fakt"], passages: [{ id: "Z1", text: "Toto je dostatečně dlouhý odstavec zdroje." }] })) }],
});

describe("course validation", () => {
  it("accepts the bundled maths course", () => {
    const v = validateCourse(math);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
    expect(allLessons(v.course!)).toHaveLength(18);
  });
  it("explains problems in Czech", () => {
    const bad = mk("ang");
    bad.stages[0].lessons[0].objectives = [];
    bad.stages[0].lessons[1].id = bad.stages[0].lessons[0].id;
    bad.age = 3;
    const v = validateCourse(bad);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" | ")).toMatch(/aspoň jeden cíl/);
    expect(v.errors.join(" | ")).toMatch(/dvakrát/);
  });
  it("rejects lesson ids that would break question ids (colon)", () => {
    const bad = mk("ang");
    bad.stages[0].lessons[0].id = "a:b";
    expect(validateCourse(bad).ok).toBe(false);
  });
  it("helpers: slugs, free slugs, re-id, subject kind, changed lessons", () => {
    expect(slugify("Angličtina – 4. třída")).toBe("anglictina-4-trida");
    expect(freeSlug("ang", new Set(["ang", "ang-2"]))).toBe("ang-3");
    const r = reid(mk("ang"), "ang-2");
    expect(r.id).toBe("ang-2");
    expect(allLessons(r).map((l) => l.id)).toEqual(["ang-2-1.1", "ang-2-1.2"]);
    expect(isMathSubject("Matematika")).toBe(true);
    expect(isMathSubject("Angličtina")).toBe(false);
    const b = mk("ang");
    const a = structuredClone(b);
    a.stages[0].lessons[1].keyFacts = ["nový fakt"];
    expect(changedLessons(b, a)).toEqual(["ang-1.2"]);
  });
});

describe("courses in the database", () => {
  it("seeds the built-in course once and never overwrites the user's edits", () => {
    const s = new Store(":memory:");
    s.seedBuiltin(math, 1);
    expect(s.listCourses().map((c) => c.id)).toEqual(["matematika-3"]);
    const edited = structuredClone(math);
    edited.stages[0].lessons[0].title = "Moje úprava";
    s.saveCourse(edited, { builtin: true, edited: true });
    s.seedBuiltin(math, 2); // a newer bundled version must not erase an edited course
    expect(s.getCourse("matematika-3")!.stages[0].lessons[0].title).toBe("Moje úprava");
    const s2 = new Store(":memory:");
    s2.seedBuiltin(math, 1);
    const newer = structuredClone(math);
    newer.stages[0].lessons[0].title = "Nové znění";
    s2.seedBuiltin(newer, 2); // untouched -> upgraded
    expect(s2.getCourse("matematika-3")!.stages[0].lessons[0].title).toBe("Nové znění");
  });

  it("deleting a course removes its data but not other courses'", () => {
    const s = new Store(":memory:");
    s.seedBuiltin(math, 1);
    s.saveCourse(mk("ang"));
    s.completeLesson("ang-1.1", 0.9);
    s.completeLesson("1.1", 0.8);
    s.addTranscript("ang-1.1", "user", "hi", "EXPLAIN");
    s.setActiveCourse("ang");
    s.deleteCourse("ang");
    expect(s.getCourse("ang")).toBeNull();
    expect(s.completedIds()).toEqual(["1.1"]);
    expect(s.transcripts("ang-1.1")).toEqual([]);
    expect(s.activeCourseId()).toBeNull();
  });

  it("a backup round trip keeps custom courses and the active course", () => {
    const a = new Store(":memory:");
    a.seedBuiltin(math, 1);
    a.saveCourse(mk("ang"));
    a.setActiveCourse("ang");
    const b = new Store(":memory:");
    b.importAll(JSON.parse(JSON.stringify(a.exportAll())));
    expect(b.listCourses().map((c) => c.id).sort()).toEqual(["ang", "matematika-3"]);
    expect(b.activeCourseId()).toBe("ang");
  });

  it("finds which course owns a lesson", () => {
    const s = new Store(":memory:");
    s.seedBuiltin(math, 1);
    s.saveCourse(mk("ang"));
    expect(s.courseOfLesson("ang-1.2")).toBe("ang");
    expect(s.courseOfLesson("2.3")).toBe("matematika-3");
    expect(s.courseOfLesson("nope")).toBeNull();
  });
});

describe("lesson service with several courses and skipping", () => {
  it("each course keeps its own progress; switching changes the current lesson", () => {
    const s = new Store(":memory:");
    s.seedBuiltin(math, 1);
    s.saveCourse(mk("ang", 3));
    const svc = new LessonService(s, math);
    expect(svc.currentLessonId()).toBe("1.1");
    s.completeLesson("1.1", 0.9);
    expect(svc.overview().completed).toBe(1);
    svc.setCurriculum(s.getCourse("ang")!);
    expect(svc.currentLessonId()).toBe("ang-1.1");
    expect(svc.overview().completed).toBe(0);
    expect(svc.overview().subject).toBe("Angličtina");
    svc.setCurriculum(math);
    expect(svc.currentLessonId()).toBe("1.2"); // her maths progress is still there
  });

  it("skip: only the current lesson, marks it skipped without a score, and unlocks the next", () => {
    const s = new Store(":memory:");
    const svc = new LessonService(s, math);
    expect(svc.skipLesson("1.3").ok).toBe(false);
    expect(svc.skipLesson("1.1").ok).toBe(true);
    expect(svc.currentLessonId()).toBe("1.2");
    const ov = svc.overview();
    const l = ov.stages[0].lessons[0];
    expect(l).toMatchObject({ id: "1.1", status: "completed", skipped: true, score: null });
    expect(ov.stages[0].lessons[1].skipped).toBe(false);
  });

  it("jump-to marks the lessons it passes as skipped and resets the rest", () => {
    const s = new Store(":memory:");
    const svc = new LessonService(s, math);
    svc.jumpTo("1.3");
    expect(svc.currentLessonId()).toBe("1.3");
    expect(svc.overview().stages[0].lessons.slice(0, 2).every((l) => l.skipped)).toBe(true);
  });
});

describe("course generator", () => {
  const params = { subject: "Angličtina", level: "4. třída", age: 9, notes: "Slovíčka říkej anglicky.", material: "", stages: 2, lessonsPerStage: 2 };
  const run = (p = params) => generateCourse({ key: "k", model: "m", params: p, onProgress: () => {} });

  it("builds a valid course with unique ids, numbered passages and a 'generated' marker", async () => {
    calls.length = 0;
    checks = [];
    const c = await run();
    expect(validateCourse(c).ok).toBe(true);
    expect(allLessons(c).map((l) => l.id)).toEqual(["anglictina-4-trida-1.1", "anglictina-4-trida-1.2", "anglictina-4-trida-2.1"]);
    expect(c.stages[0].lessons[0].passages.map((p) => p.id)).toEqual(["Z1", "Z2", "Z3"]);
    expect(c.generated).toMatchObject({ hadMaterial: false, flags: [] });
    expect(c.notes).toBe("Slovíčka říkej anglicky.");
    expect(calls[0].system).toContain("Angličtina");
    expect(calls[0].system).not.toMatch(/početní|matematik/i);
  });

  it("with study material the course is built only from it", async () => {
    calls.length = 0;
    checks = [];
    const c = await run({ ...params, material: "Cat = kočka. Dog = pes." });
    expect(c.generated?.hadMaterial).toBe(true);
    expect(calls.filter((x) => x.kind !== "check").every((x) => x.prompt.includes("Cat = kočka"))).toBe(true);
    expect(calls[0].prompt).toContain("VÝHRADNĚ témata");
  });

  it("regenerates a stage the checker rejects once, then flags what is left", async () => {
    calls.length = 0;
    checks = [
      { verdict: "fail", issues: [{ where: "lekce 1", problem: "špatný překlad" }] },
      { verdict: "fail", issues: [{ where: "lekce 1", problem: "pořád špatně" }] },
      { verdict: "pass", issues: [] },
    ];
    const c = await run();
    expect(calls.filter((x) => x.kind === "content")).toHaveLength(3); // stage 1 twice, stage 2 once
    expect(calls.find((x) => x.prompt.includes("PŘEDCHOZÍ POKUS"))!.prompt).toContain("špatný překlad");
    expect(c.generated!.flags).toEqual(["Etapa 1 (Slovíčka): lekce 1: pořád špatně"]);
  });
});
