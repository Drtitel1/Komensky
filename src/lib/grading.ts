import { z } from "zod";
import { generateJson } from "./gemini";
import { gradePrompt, SYSTEM_GRADER } from "./prompts";
import type { Question } from "./types";

export interface GradeResult {
  score: number;
  correct: boolean;
  feedback: string;
}

const GradeSchema = z.object({ verdict: z.enum(["correct", "partial", "wrong"]), feedback: z.string() });

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9,.\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function asNumber(s: string): number | null {
  const m = s.replace(/\s/g, "").replace(",", ".").match(/^-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export async function gradeAnswer(q: Question, given: string): Promise<GradeResult> {
  const text = given.trim();
  if (q.type === "mc") {
    const correct = Number(text) === q.correctIndex;
    return { score: correct ? 1 : 0, correct, feedback: correct ? "Správně, bravo!" : "To tentokrát nevyšlo, ale podívej se na správnou odpověď." };
  }
  if (!text) return { score: 0, correct: false, feedback: "Zkus něco napsat, i kdyby to nebylo úplně přesné." };

  if (q.type === "short") {
    const a = asNumber(q.modelAnswer);
    const b = asNumber(text);
    const modelIsPureNumber = a !== null && /^-?\d+([.,]\d+)?\s*[a-zA-Zěščřžýáíéúůďťň.]*$/.test(q.modelAnswer.trim());
    if (modelIsPureNumber && b !== null && a === b) {
      // Exact numeric match; ignore trailing units. Wrong numbers still go to the grader (e.g. "3 zbytek 2").
      return { score: 1, correct: true, feedback: "Správně, bravo!" };
    }
    if (norm(text) === norm(q.modelAnswer)) return { score: 1, correct: true, feedback: "Správně, bravo!" };
  }

  try {
    const res = await generateJson({ system: SYSTEM_GRADER, prompt: gradePrompt(q, text), schema: GradeSchema, temperature: 0.1 });
    const score = res.verdict === "correct" ? 1 : res.verdict === "partial" ? 0.5 : 0;
    return { score, correct: score === 1, feedback: res.feedback };
  } catch {
    const ok = norm(text) === norm(q.modelAnswer);
    return { score: ok ? 1 : 0, correct: ok, feedback: ok ? "Správně!" : "Podívej se na správnou odpověď níže." };
  }
}
