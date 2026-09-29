import { z } from "zod";
import type { Curriculum, LessonDef, Part, Plan, Question } from "@shared/types";
import { PlanSchema } from "@shared/types";
import { generateJson } from "./gemini";
import log from "./log";

/* Lesson-plan generation (PREP_MODEL). Runs in the main process only.
 * outline -> check questions per part -> final quiz -> independent fact-check (max 2 regenerations, leftovers are logged as flags). */

const AGE = 8;
const GRADE = "3. třída základní školy";
const MAX_FIXES = 2;

const SYSTEM_TEACHER = `Jsi zkušený autor učebních plánů matematiky pro ${AGE}leté dítě (${GRADE}, Česko). Píšeš VÝHRADNĚ česky.
PRAVIDLA PRAVDIVOSTI (nejvyšší priorita):
- Smíš používat POUZE fakta, pravidla a příklady uvedené ve ZDROJOVÉM MATERIÁLU. Nic nepřidávej z vlastní paměti, ani kdyby to byla pravda.
- Nové příklady smíš vymýšlet jen tehdy, když používají výhradně pravidla ze zdroje a všechny výpočty jsou správně (zkontroluj je dvakrát).
- Nikdy nepracuj s látkou, která není ve zdroji ani v "dřívější znalosti".`;

const SYSTEM_CHECKER = `Jsi přísný odborný korektor školní matematiky pro ${GRADE} v Česku. Porovnáváš vygenerovaný učební plán se ZDROJOVÝM MATERIÁLEM.
Kontroluješ: (1) každé tvrzení a klíčový poznatek musí být ve zdroji nebo z něj přímo a správně odvozen; (2) každý početní příklad přepočítej; (3) klíč každé otázky musí být správný a jednoznačný, u otázek s výběrem právě jedna správná možnost; (4) otázky se týkají jen látky ze zdroje a dřívější znalosti; (5) cíle a poznatky částí odpovídají zdroji.
Buď důkladný, ale nevymýšlej si problémy: stylistické drobnosti nejsou chyba. Odpovídej česky, stručně.`;

const sourceBlock = (l: LessonDef) =>
  `ZDROJOVÝ MATERIÁL (lekce ${l.id} – ${l.title}):\n${l.passages.map((p) => `[${p.id}] ${p.text}`).join("\n")}\n\nCÍLE LEKCE:\n${l.objectives.map((o) => "- " + o).join("\n")}\n\nKLÍČOVÉ POZNATKY LEKCE:\n${l.keyFacts.map((o) => "- " + o).join("\n")}`;

function priorKnowledge(c: Curriculum, lessonId: string): string {
  const all = c.stages.flatMap((s) => s.lessons);
  const idx = all.findIndex((l) => l.id === lessonId);
  const prev = all.slice(0, Math.max(idx, 0));
  if (!prev.length) return "DŘÍVĚJŠÍ ZNALOST: žádná (toto je první lekce).";
  return `DŘÍVĚJŠÍ ZNALOST (dítě už umí; smíš navázat, ale neučíš to znovu):\n${prev.map((l) => `- Lekce ${l.id} ${l.title}: ${l.keyFacts.join("; ")}`).join("\n")}`;
}

const QUESTION_RULES = `POŽADAVKY NA OTÁZKY (budou se pokládat NAHLAS a dítě bude odpovídat hlasem):
- Typy: "mc" (3 až 4 možnosti, právě jedna správná; možnosti krátké, ať se dají přečíst nahlas), "short" (krátká odpověď – číslo nebo slovo), "explain" (vysvětli vlastními slovy; používej střídmě).
- Každá otázka má: type, prompt (zadání česky; symboly · : + − = < > smíš psát), options a correctIndex (jen u mc, číslováno od 0), answer (správná odpověď; u explain 1–3 věty s klíčovými body), accepted (jen u short: 2 až 5 dalších přijatelných zápisů, např. číslo číslicemi i slovy česky, s jednotkou i bez ní), explanation (krátké laskavé vysvětlení), sourceId (id odstavce zdroje, např. "Z3").
- U "short" musí být jedna jednoznačná správná odpověď. Nikdy se neptej na to, co ve zdroji není.`;

/* ---------- schemas ---------- */

const RawQuestion = z.object({
  type: z.enum(["mc", "short", "explain"]),
  prompt: z.string().min(3),
  options: z.array(z.string()).optional(),
  correctIndex: z.number().int().optional(),
  answer: z.string().min(1),
  explanation: z.string().min(1),
  sourceId: z.string(),
  accepted: z.array(z.string()).optional(),
});
type RawQ = z.infer<typeof RawQuestion>;

const OutlineSchema = z.object({
  parts: z
    .array(
      z.object({
        title: z.string(),
        objectives: z.array(z.string()).min(1),
        keyFacts: z.array(z.string()).min(1),
        passageIds: z.array(z.string()).min(1),
        targetSeconds: z.number().int(),
      }),
    )
    .min(5)
    .max(8),
});
const PartQuestionsSchema = z.object({ parts: z.array(z.object({ index: z.number().int(), questions: z.array(RawQuestion).min(2).max(4) })).min(1) });
const FinalSchema = z.object({ questions: z.array(RawQuestion).min(10).max(15) });
const CheckSchema = z.object({ verdict: z.enum(["pass", "fail"]), issues: z.array(z.object({ where: z.string(), problem: z.string() })) });

/* ---------- helpers ---------- */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function toQuestions(lesson: LessonDef, prefix: string, raw: RawQ[], partIndexOf: (r: RawQ) => number | undefined): Question[] {
  return raw.map((r, i) => {
    const passage = lesson.passages.find((p) => p.id === r.sourceId) ?? lesson.passages.find((p) => r.sourceId.includes(p.id));
    const base = {
      id: `${lesson.id}:${prefix}:q${i + 1}`,
      type: r.type,
      prompt: r.prompt.trim(),
      explanation: r.explanation.trim(),
      sourceId: passage?.id ?? r.sourceId,
      source: passage ? `[${lesson.id}/${passage.id}] ${passage.text}` : `[${lesson.id}] ${r.sourceId}`,
      partIndex: partIndexOf(r),
    };
    if (r.type === "mc") {
      const options = (r.options ?? []).map((o) => o.trim());
      if (options.length < 3 || options.length > 4 || new Set(options).size !== options.length) throw new Error("bad mc options");
      if (r.correctIndex == null || r.correctIndex < 0 || r.correctIndex >= options.length) throw new Error("bad correctIndex");
      const correct = options[r.correctIndex];
      const shuffled = shuffle(options);
      return { ...base, options: shuffled, correctIndex: shuffled.indexOf(correct), answer: correct };
    }
    return { ...base, answer: r.answer.trim(), ...(r.type === "short" && r.accepted?.length ? { accepted: r.accepted.map((a) => a.trim()).filter(Boolean) } : {}) };
  });
}

const partIdx = (parts: { passageIds: string[] }[], r: RawQ) => {
  const k = parts.findIndex((p) => p.passageIds.some((pid) => r.sourceId.includes(pid)));
  return k >= 0 ? k : undefined;
};

function planText(p: Pick<Plan, "parts" | "finalQuiz">): string {
  const qs = (list: Question[]) =>
    list
      .map((q, i) => `  ${i + 1}. [${q.type}] ${q.prompt}${q.options ? ` | možnosti: ${q.options.map((o, k) => `${k === q.correctIndex ? "*" : ""}${String.fromCharCode(65 + k)}) ${o}`).join(" ")}` : ""} → správně: ${q.answer}${q.accepted?.length ? ` (přijímáno: ${q.accepted.join(", ")})` : ""}; vysvětlení: ${q.explanation}`)
      .join("\n");
  return [
    ...p.parts.map((x, i) => `ČÁST ${i + 1}: ${x.title} (${x.targetSeconds} s)\n  cíle: ${x.objectives.join("; ")}\n  poznatky: ${x.keyFacts.join("; ")}\n  kontrolní otázky:\n${qs(x.questions)}`),
    `ZÁVĚREČNÝ KVÍZ:\n${qs(p.finalQuiz)}`,
  ].join("\n\n");
}

/* ---------- pipeline ---------- */

export interface PlanRun {
  key: string;
  model: string;
  curriculum: Curriculum;
  lesson: LessonDef;
  onProgress: (step: string, done: number, total: number) => void;
}

export async function generatePlan(run: PlanRun): Promise<Plan> {
  const { key, model, curriculum, lesson, onProgress } = run;
  const ctx = `${sourceBlock(lesson)}\n\n${priorKnowledge(curriculum, lesson.id)}`;
  let done = 0;
  const total = 5;
  const step = (name: string) => onProgress(name, done, total);
  const call = <T>(prompt: string, schema: z.ZodType<T>, system = SYSTEM_TEACHER, temperature = 0.3) =>
    generateJson({ key, model, system, prompt, schema, temperature, onWait: (s) => onProgress(`Čekám na limit Google (${s} s)…`, done, total) });

  step("Navrhuji osnovu lekce…");
  const outline = async (issues: string[]) => {
    const r = await call(
      `${ctx}\n\nÚKOL: Rozděl lekci na 5 až 8 logických částí, které dítě projde hlasem. Každá část je samostatně srozumitelná a staví na předchozích; všechny odstavce zdroje musí být pokryty. Celková délka mluveného výkladu všech částí (součet targetSeconds) má být mezi 1200 a 1620 sekundami; jedna část 150 až 330 sekund.
Pro každou část: title (krátký veselý název), objectives (1–3 cíle, co dítě po části umí), keyFacts (2–6 klíčových poznatků VÝHRADNĚ ze zdroje, přesně formulovaných), passageIds (id odstavců zdroje), targetSeconds.${issues.length ? `\n\nPŘEDCHOZÍ POKUS MĚL CHYBY, oprav je:\n${issues.map((x) => "- " + x).join("\n")}` : ""}
Vrať JSON.`,
      OutlineSchema,
    );
    return r.parts.map((p, i) => ({ ...p, id: `p${i + 1}`, targetSeconds: Math.min(330, Math.max(150, p.targetSeconds)) }));
  };
  let outlineParts = await outline([]);
  done++;

  step("Připravuji kontrolní otázky…");
  const partQuestions = async (parts: typeof outlineParts, only: number[] | null, issues: string[]) => {
    const r = await call(
      `${ctx}\n\nČÁSTI LEKCE:\n${parts.map((p, i) => `${i + 1}. ${p.title} – poznatky: ${p.keyFacts.join("; ")} (odstavce ${p.passageIds.join(", ")})`).join("\n")}\n\nÚKOL: ${only ? `Vytvoř kontrolní otázky jen pro části ${only.map((i) => i + 1).join(", ")}.` : "Vytvoř kontrolní otázky pro každou část."} Pro každou část 2 až 4 otázky (index = pořadí části od 0), aspoň jedna s výběrem, ostatní krátké odpovědi; otázky pokrývají poznatky té části.
${QUESTION_RULES}${issues.length ? `\n\nPŘEDCHOZÍ POKUS MĚL CHYBY, oprav je:\n${issues.map((x) => "- " + x).join("\n")}` : ""}
Vrať JSON.`,
      PartQuestionsSchema,
    );
    const byIndex = new Map(r.parts.map((p) => [p.index, p.questions]));
    return byIndex;
  };
  let pq = await partQuestions(outlineParts, null, []);
  done++;

  step("Připravuji závěrečný kvíz…");
  const finalQuiz = async (parts: typeof outlineParts, issues: string[]) => {
    const r = await call(
      `${ctx}\n\nČÁSTI LEKCE:\n${parts.map((p, i) => `${i + 1}. ${p.title} – ${p.keyFacts.join("; ")}`).join("\n")}\n\nÚKOL: Vytvoř ZÁVĚREČNÝ KVÍZ o 10 až 15 otázkách pokrývající celou lekci (z každé části aspoň jednu). Přibližně 45 % mc, 45 % short, 10 % explain. Různě těžké (většina snadných a středních); jiná čísla a situace než u kontrolních otázek.
${QUESTION_RULES}${issues.length ? `\n\nPŘEDCHOZÍ POKUS MĚL CHYBY, oprav je:\n${issues.map((x) => "- " + x).join("\n")}` : ""}
Vrať JSON.`,
      FinalSchema,
    );
    return r.questions;
  };
  let finalRaw = await finalQuiz(outlineParts, []);
  done++;

  const assemble = (): Plan => {
    const parts: Part[] = outlineParts.map((p, i) => ({
      id: p.id,
      title: p.title,
      objectives: p.objectives,
      keyFacts: p.keyFacts,
      passageIds: p.passageIds,
      targetSeconds: p.targetSeconds,
      questions: toQuestions(lesson, `p${i + 1}`, (pq.get(i) ?? []).slice(0, 4), () => i),
    }));
    if (parts.some((p) => p.questions.length < 2)) throw new Error("missing questions for a part");
    return {
      lessonId: lesson.id,
      title: lesson.title,
      createdAt: new Date().toISOString(),
      model,
      parts,
      finalQuiz: toQuestions(lesson, "f", finalRaw, (r) => partIdx(outlineParts, r)),
      flags: [],
    };
  };

  let plan = assemble();
  for (let round = 0; ; round++) {
    step(round === 0 ? "Kontroluji správnost…" : `Opravuji a znovu kontroluji (${round}/${MAX_FIXES})…`);
    let check: z.infer<typeof CheckSchema>;
    try {
      check = await call(
        `${ctx}\n\nZKONTROLUJ TENTO PLÁN LEKCE:\n${planText(plan)}\n\nVrať JSON: {"verdict": "pass" | "fail", "issues": [{"where": "kde přesně – začni slovy 'část N' nebo 'kvíz'", "problem": "co je špatně a jak to opravit"}]}. verdict = "fail" při jakékoli věcné chybě, tvrzení mimo zdroj, špatném klíči nebo nejednoznačné otázce, jinak "pass" a issues prázdné.`,
        CheckSchema,
        SYSTEM_CHECKER,
        0,
      );
    } catch (e) {
      // A failing checker must never silently pass content.
      check = { verdict: "fail", issues: [{ where: "celý plán", problem: `Kontrola se nepodařila: ${(e as Error).message}` }] };
    }
    const issues = check.issues.map((i) => `${i.where}: ${i.problem}`);
    if (check.verdict === "pass" && !issues.length) break;
    log.warn(`plan ${lesson.id}: fact-check found ${issues.length} issue(s), round ${round}`);
    if (round >= MAX_FIXES) {
      plan.flags.push({ at: new Date().toISOString(), where: "kontrola faktů", issues });
      break;
    }
    // regenerate only the affected sections
    const badParts = new Set<number>();
    let badFinal = false;
    let badAll = false;
    for (const i of check.issues) {
      const m = /část\s*(\d+)/i.exec(i.where);
      if (m) badParts.add(Number(m[1]) - 1);
      else if (/kv[ií]z|final/i.test(i.where)) badFinal = true;
      else badAll = true;
    }
    const partIssues = (k: number) => check.issues.filter((i) => new RegExp(`část\\s*${k + 1}\\b`, "i").test(i.where)).map((i) => `${i.where}: ${i.problem}`);
    if (badAll) {
      outlineParts = await outline(issues);
      pq = await partQuestions(outlineParts, null, issues);
      finalRaw = await finalQuiz(outlineParts, issues);
    } else {
      if (badParts.size) {
        const only = [...badParts].filter((k) => k >= 0 && k < outlineParts.length);
        const fresh = await partQuestions(outlineParts, only, only.flatMap(partIssues));
        for (const k of only) if (fresh.get(k)) pq.set(k, fresh.get(k)!);
      }
      if (badFinal) finalRaw = await finalQuiz(outlineParts, check.issues.filter((i) => /kv[ií]z|final/i.test(i.where)).map((i) => `${i.where}: ${i.problem}`));
    }
    plan = assemble();
  }
  done = total;
  onProgress("Hotovo", done, total);
  const parsed = PlanSchema.parse(plan);
  return parsed;
}
