import { z } from "zod";
import type { Curriculum } from "./types";

/* Validation and helpers for courses (curricula). A course is plain data: subject, stages, lessons, and per lesson the
 * objectives, key facts and numbered source passages (the ONLY facts the tutor may teach). */

const ID = /^[A-Za-z0-9._-]{1,40}$/; // no ":" – lesson ids are embedded in question ids ("<lesson>:p1:q2")

export const PassageSchema = z.object({ id: z.string().regex(/^Z\d{1,3}$/, "id odstavce musí být Z1, Z2…"), text: z.string().trim().min(10, "odstavec je příliš krátký").max(4000) });
export const LessonDefSchema = z.object({
  id: z.string().regex(ID, "id lekce smí obsahovat jen písmena, číslice, tečku, pomlčku a podtržítko"),
  title: z.string().trim().min(1, "lekce nemá název").max(200),
  objectives: z.array(z.string().trim().min(1)).min(1, "lekce potřebuje aspoň jeden cíl").max(12),
  keyFacts: z.array(z.string().trim().min(1)).min(1, "lekce potřebuje aspoň jeden klíčový poznatek").max(30),
  passages: z.array(PassageSchema).min(1, "lekce potřebuje aspoň jeden odstavec zdroje").max(30),
});
export const StageDefSchema = z.object({
  id: z.number().int().min(1),
  title: z.string().trim().min(1, "etapa nemá název").max(200),
  description: z.string().trim().max(1000).default(""),
  lessons: z.array(LessonDefSchema).min(1, "etapa nemá žádnou lekci").max(40),
});

export const CurriculumSchema = z
  .object({
    schema: z.number().int().default(1),
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id kurzu: malá písmena, číslice a pomlčky").min(2).max(30),
    subject: z.string().trim().min(2, "kurz nemá název předmětu").max(120),
    age: z.number().int().min(5).max(18),
    level: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(2000).optional(),
    generated: z.object({ at: z.string(), model: z.string(), hadMaterial: z.boolean(), flags: z.array(z.string()) }).optional(),
    stages: z.array(StageDefSchema).min(1, "kurz nemá žádnou etapu").max(15),
  })
  .superRefine((c, ctx) => {
    const lessonIds = new Set<string>();
    const stageIds = new Set<number>();
    c.stages.forEach((s, si) => {
      if (stageIds.has(s.id)) ctx.addIssue({ code: "custom", message: `etapa ${s.id} je v kurzu dvakrát`, path: ["stages", si, "id"] });
      stageIds.add(s.id);
      s.lessons.forEach((l, li) => {
        if (lessonIds.has(l.id)) ctx.addIssue({ code: "custom", message: `id lekce „${l.id}“ je v kurzu dvakrát`, path: ["stages", si, "lessons", li, "id"] });
        lessonIds.add(l.id);
        const p = new Set<string>();
        l.passages.forEach((x, pi) => {
          if (p.has(x.id)) ctx.addIssue({ code: "custom", message: `lekce ${l.id}: odstavec ${x.id} je dvakrát`, path: ["stages", si, "lessons", li, "passages", pi, "id"] });
          p.add(x.id);
        });
      });
    });
  });

export interface ValidationResult {
  ok: boolean;
  course?: Curriculum;
  errors: string[];
}

/** Human-readable (Czech) validation of a course object coming from the editor, a file or the generator. */
export function validateCourse(raw: unknown): ValidationResult {
  const r = CurriculumSchema.safeParse(raw);
  if (r.success) return { ok: true, course: r.data as Curriculum, errors: [] };
  const errors = r.error.issues.slice(0, 12).map((i) => `${i.path.length ? i.path.join(" › ") + ": " : ""}${i.message}`);
  return { ok: false, errors };
}

export const allLessons = (c: Curriculum) => c.stages.flatMap((s) => s.lessons);

export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return s.length >= 2 ? s : "kurz";
}

/** Subjects where the maths-specific teaching rules (symbols read as words, recalculating examples) apply. */
export const isMathSubject = (subject: string) => /matem|math|po[cč]t|aritm|geometr/i.test(subject);

/** What the prompts say about the learner: "8letý žák (3. třída základní školy)". */
export function learnerLine(c: Pick<Curriculum, "age" | "level">): string {
  return `${c.age}leté dítě${c.level ? ` (${c.level}, Česko)` : " (Česko)"}`;
}

/** Lesson id prefix for a course, so ids never collide with other courses ("ang" -> "ang-1.1"). The built-in course keeps "1.1". */
export const lessonIdFor = (courseSlug: string, stageNo: number, lessonNo: number, builtin = false) => (builtin ? `${stageNo}.${lessonNo}` : `${courseSlug}-${stageNo}.${lessonNo}`);

/** Returns a copy of the course under another slug; lesson ids are rewritten so they stay unique across courses. */
export function reid(c: Curriculum, newSlug: string): Curriculum {
  const copy = structuredClone(c);
  copy.id = newSlug;
  copy.stages.forEach((s) => s.lessons.forEach((l, i) => (l.id = lessonIdFor(newSlug, s.id, i + 1))));
  return copy;
}

/** Picks a free course slug ("ang", "ang-2", "ang-3"…). */
export function freeSlug(wanted: string, taken: Set<string>): string {
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; n < 1000; n++) if (!taken.has(`${wanted}-${n}`)) return `${wanted}-${n}`;
  return `${wanted}-${Date.now()}`;
}

/** Lessons whose teaching content changed between two versions of a course (their stored plan is then out of date). */
export function changedLessons(before: Curriculum, after: Curriculum): string[] {
  const sig = (l: { title: string; objectives: string[]; keyFacts: string[]; passages: { id: string; text: string }[] }) => JSON.stringify([l.title, l.objectives, l.keyFacts, l.passages]);
  const old = new Map(allLessons(before).map((l) => [l.id, sig(l)]));
  return allLessons(after).filter((l) => old.has(l.id) && old.get(l.id) !== sig(l)).map((l) => l.id);
}
