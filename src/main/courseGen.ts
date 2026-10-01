import { z } from "zod";
import { isMathSubject, lessonIdFor, learnerLine, slugify } from "@shared/course";
import type { Curriculum, StageDef } from "@shared/types";
import { generateJson } from "./gemini";
import log from "./log";

/* Generates a whole course (stages -> lessons -> objectives, key facts, numbered source passages) with PREP_MODEL.
 * With pasted study material the course is built ONLY from it and fact-checked against it; without material the model
 * writes the passages itself and the result is marked "generated" so the administrator knows to review it. */

export interface CourseParams {
  subject: string;
  level: string;
  age: number;
  notes: string;
  material: string;
  stages: number;
  lessonsPerStage: number;
}

export const MAX_MATERIAL_CHARS = 150_000;
const MAX_FIXES = 1;

const OutlineSchema = z.object({
  stages: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().default(""),
        lessons: z.array(z.object({ title: z.string().min(1), objectives: z.array(z.string().min(1)).min(1).max(5) })).min(1).max(10),
      }),
    )
    .min(1)
    .max(12),
});
const StageContentSchema = z.object({
  lessons: z.array(z.object({ keyFacts: z.array(z.string().min(3)).min(2).max(10), passages: z.array(z.string().min(30)).min(3).max(10) })).min(1),
});
const CheckSchema = z.object({ verdict: z.enum(["pass", "fail"]), issues: z.array(z.object({ where: z.string(), problem: z.string() })) });

const system = (p: CourseParams) => `Jsi zkušený autor učebnic a učebních osnov předmětu ${p.subject} pro ${learnerLine({ age: p.age, level: p.level })}. Píšeš VÝHRADNĚ česky, jednoduše, věcně a správně.${p.notes ? `\nDALŠÍ POKYNY: ${p.notes}` : ""}`;

const checker = (p: CourseParams) => `Jsi přísný odborný korektor předmětu ${p.subject} (${learnerLine({ age: p.age, level: p.level })}). Kontroluješ studijní texty kurzu: ${p.material.trim() ? "každé tvrzení musí být obsaženo v poskytnutém MATERIÁLU nebo z něj přímo vyplývat; tvrzení navíc jsou chyba" : "každé tvrzení musí být věcně správné a přiměřené věku; sporné nebo nepravdivé údaje jsou chyba"}; ${isMathSubject(p.subject) ? "příklady přepočítej" : "příklady a údaje ověř"}. Nevymýšlej si problémy: stylistické drobnosti nejsou chyba. Odpovídej česky, stručně.`;

const materialBlock = (p: CourseParams) => (p.material.trim() ? `\n\nMATERIÁL (jediný zdroj pravdy):\n"""\n${p.material.trim().slice(0, MAX_MATERIAL_CHARS)}\n"""` : "");

export interface CourseRun {
  key: string;
  model: string;
  params: CourseParams;
  onProgress: (step: string, done: number, total: number) => void;
}

export async function generateCourse(run: CourseRun): Promise<Curriculum> {
  const { key, model, params: p, onProgress } = run;
  const hadMaterial = !!p.material.trim();
  const total = 1 + p.stages * 2;
  let done = 0;
  const tick = (step: string) => onProgress(step, done, total);
  const call = <T>(prompt: string, schema: z.ZodType<T>, sys = system(p), temperature = 0.4) =>
    generateJson({ key, model, system: sys, prompt, schema, temperature, onWait: (s) => onProgress(`Čekám na limit Google (${s} s)…`, done, total) });

  tick("Navrhuji osnovu kurzu…");
  const outline = await call(
    `ÚKOL: Vytvoř osnovu kurzu předmětu „${p.subject}“ pro ${learnerLine({ age: p.age, level: p.level })}.
Počet etap: ${p.stages}. V každé etapě zhruba ${p.lessonsPerStage} lekcí. Lekce na sebe navazují od jednoduššího ke složitějšímu a každá se dá probrat za 30–45 minut mluveného výkladu s otázkami.
${hadMaterial ? "Použij VÝHRADNĚ témata, která jsou v poskytnutém materiálu; rozděl je logicky do etap a lekcí." : "Drž se běžných školních osnov pro tento předmět a věk."}
Pro každou etapu: title, description (1 věta). Pro každou lekci: title a objectives (1–4 konkrétní cíle: co dítě po lekci umí).${materialBlock(p)}
Vrať JSON.`,
    OutlineSchema,
  );
  done++;

  const stages: StageDef[] = [];
  const flags: string[] = [];
  for (let si = 0; si < outline.stages.length; si++) {
    const st = outline.stages[si];
    const lessonsText = st.lessons.map((l, i) => `${i + 1}. ${l.title} – cíle: ${l.objectives.join("; ")}`).join("\n");
    const content = async (issues: string[]) => {
      const r = await call(
        `ÚKOL: Napiš studijní obsah etapy „${st.title}“ kurzu ${p.subject}. Lekce (v tomto pořadí):\n${lessonsText}\n
Pro KAŽDOU lekci (stejný počet a pořadí jako výše) vytvoř:
- keyFacts: 3 až 8 stručných klíčových poznatků/pravidel, které se dítě má naučit;
- passages: 3 až 7 odstavců zdrojového textu (každý 2–5 vět, s příkladem), z nichž se bude učit a ze kterých se budou tvořit otázky. Tyto odstavce jsou JEDINÝ zdroj pravdy lekce, proto musí být věcně správné a úplné.
${hadMaterial ? "Vycházej VÝHRADNĚ z poskytnutého materiálu (smíš přeformulovat a zjednodušit pro dítě, ale nic nepřidávej)." : "Piš věcně správně a přiměřeně věku; vyhni se sporným a zastaralým tvrzením."}${issues.length ? `\n\nPŘEDCHOZÍ POKUS MĚL CHYBY, oprav je:\n${issues.map((x) => "- " + x).join("\n")}` : ""}${materialBlock(p)}
Vrať JSON {"lessons":[{"keyFacts":[…],"passages":[…]}]}.`,
        StageContentSchema,
      );
      if (r.lessons.length !== st.lessons.length) throw new Error(`etapa ${si + 1}: počet lekcí nesedí`);
      return r.lessons;
    };
    tick(`Píšu obsah etapy ${si + 1} z ${outline.stages.length}: ${st.title}…`);
    let lessons = await content([]);
    done++;

    for (let fix = 0; ; fix++) {
      tick(`Kontroluji etapu ${si + 1} z ${outline.stages.length}…`);
      let check: z.infer<typeof CheckSchema>;
      try {
        check = await call(
          `ZKONTROLUJ studijní obsah etapy „${st.title}“:\n${lessons.map((l, i) => `LEKCE ${i + 1} ${st.lessons[i].title}\nPoznatky: ${l.keyFacts.join(" | ")}\n${l.passages.map((x, k) => `[Z${k + 1}] ${x}`).join("\n")}`).join("\n\n")}${materialBlock(p)}
Vrať JSON {"verdict":"pass"|"fail","issues":[{"where":"lekce N","problem":"co je špatně"}]}. fail při jakékoli věcné chybě${hadMaterial ? " nebo tvrzení mimo materiál" : ""}.`,
          CheckSchema,
          checker(p),
          0,
        );
      } catch (e) {
        check = { verdict: "fail", issues: [{ where: "etapa", problem: `Kontrola se nepodařila: ${(e as Error).message}` }] };
      }
      const issues = check.issues.map((i) => `${i.where}: ${i.problem}`);
      if (check.verdict === "pass" && !issues.length) break;
      if (fix >= MAX_FIXES) {
        flags.push(...issues.map((x) => `Etapa ${si + 1} (${st.title}): ${x}`));
        break;
      }
      log.warn(`course generation: stage ${si + 1} check found ${issues.length} issue(s), regenerating`);
      lessons = await content(issues);
    }
    done++;

    stages.push({
      id: si + 1,
      title: st.title,
      description: st.description,
      lessons: st.lessons.map((l, li) => ({
        id: "",
        title: l.title,
        objectives: l.objectives,
        keyFacts: lessons[li].keyFacts,
        passages: lessons[li].passages.map((text, k) => ({ id: `Z${k + 1}`, text })),
      })),
    });
  }

  const id = slugify(`${p.subject} ${p.level}`.slice(0, 40));
  stages.forEach((s) => s.lessons.forEach((l, li) => (l.id = lessonIdFor(id, s.id, li + 1))));
  onProgress("Hotovo", total, total);
  return { schema: 1, id, subject: p.subject.trim(), age: p.age, level: p.level.trim() || undefined, notes: p.notes.trim() || undefined, generated: { at: new Date().toISOString(), model, hadMaterial, flags }, stages };
}

/** Deterministic course for automated tests (KOMENSKY_TEST=1, unpackaged only). */
export async function fakeCourse(run: CourseRun): Promise<Curriculum> {
  const p = run.params;
  const id = slugify(`${p.subject} ${p.level}`.slice(0, 40));
  run.onProgress("Testovací kurz", 1, 1);
  return {
    schema: 1, id, subject: p.subject, age: p.age, level: p.level || undefined, notes: p.notes || undefined,
    generated: { at: new Date().toISOString(), model: "test", hadMaterial: !!p.material.trim(), flags: [] },
    stages: Array.from({ length: p.stages }, (_, si) => ({
      id: si + 1, title: `Etapa ${si + 1}`, description: "Testovací etapa.",
      lessons: Array.from({ length: p.lessonsPerStage }, (_, li) => ({
        id: lessonIdFor(id, si + 1, li + 1), title: `Lekce ${si + 1}.${li + 1}`, objectives: ["Zvládnout testovací cíl."], keyFacts: ["Testovací poznatek jedna.", "Testovací poznatek dva."],
        passages: [1, 2, 3].map((k) => ({ id: `Z${k}`, text: `Toto je testovací odstavec číslo ${k} lekce ${si + 1}.${li + 1}, který slouží jen k zkoušce aplikace.` })),
      })),
    })),
  };
}
