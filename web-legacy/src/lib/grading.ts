import { z } from "zod";
import { generateJson } from "./gemini";
import { gradePrompt, SYSTEM_GRADER } from "./prompts";
import { normalizeText, spokenNumber } from "./czech";
import type { Question } from "./types";

export interface GradeResult {
  score: number;
  correct: boolean;
  feedback: string;
}

const GradeSchema = z.object({ verdict: z.enum(["correct", "partial", "wrong"]), feedback: z.string() });

const norm = normalizeText;

export async function gradeAnswer(q: Question, given: string): Promise<GradeResult> {
  const text = given.trim();
  if (q.type === "mc") {
    const correct = Number(text) === q.correctIndex;
    return { score: correct ? 1 : 0, correct, feedback: correct ? "Správně, bravo!" : "To tentokrát nevyšlo, ale podívej se na správnou odpověď." };
  }
  if (!text) return { score: 0, correct: false, feedback: "Zkus něco napsat, i kdyby to nebylo úplně přesné." };

  if (q.type === "short") {
    // 1) prepared answer list – no AI call, instant
    const known = [q.modelAnswer, ...(q.accepted ?? [])].map(norm);
    if (known.includes(norm(text))) return { score: 1, correct: true, feedback: "Správně, bravo!" };
    // 2) numbers, also spoken in words ("dvacet čtyři")
    const a = spokenNumber(q.modelAnswer);
    const b = spokenNumber(text);
    const modelIsPureNumber = a !== null && /^-?\d+([.,]\d+)?\s*[a-zA-Zěščřžýáíéúůďťň.]*$/.test(q.modelAnswer.trim());
    if (modelIsPureNumber && b !== null && a === b) return { score: 1, correct: true, feedback: "Správně, bravo!" };
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
