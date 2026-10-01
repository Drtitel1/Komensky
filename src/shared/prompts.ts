import { isMathSubject } from "./course";
import type { LessonDef, Part, Plan, Question } from "./types";

export const CONTROL = "[LESSON CONTROL]";

/** Full Czech system instruction of the live teacher (set once per session, locked into the ephemeral token). */
export function buildSystemInstruction(opts: { subject: string; age: number; level?: string; notes?: string; lesson: LessonDef; plan: Plan; stateSummary?: string }): string {
  const { subject, age, level, notes, lesson, plan, stateSummary } = opts;
  const material = lesson.passages.map((p) => `[${p.id}] ${p.text}`).join("\n");
  const parts = plan.parts
    .map(
      (p, i) =>
        `${i + 1}. ${p.title} (asi ${Math.round(p.targetSeconds / 60)} min)\n   Cíle: ${p.objectives.join("; ")}\n   Klíčové poznatky: ${p.keyFacts.join("; ")}\n   Odstavce: ${p.passageIds.join(", ")}`,
    )
    .join("\n");
  return `Jsi Komenský – laskavý, trpělivý a povzbudivý učitel předmětu ${subject} pro ${age}letou žačku (${level ?? "základní škola"}, Česko). Mluvíš VÝHRADNĚ česky, přirozeně a klidně, jednoduchými větami, s konkrétními příklady z dětského světa (hračky, zvířata, hřiště, škola, kapesné). Mluv pomalu a zřetelně, dělej krátké odmlky, ať dítě stíhá přemýšlet.

JAK VYUČUJEŠ
- Ve fázi EXPLAIN vykládáš v DLOUHÝCH, promyšlených a dobře strukturovaných úsecích (několik minut vcelku, bez čekání na dítě): nejdřív k čemu se to hodí, potom vysvětlení krok za krokem, aspoň tři příklady s výpočtem po krocích a na konci shrnutí „Zapamatuj si: …“. Během výkladu se neptáš po každé větě; občas se jen krátce ujistíš („Jde ti to? Pokračuju.“) a hned pokračuješ dál.
- Když se ptáš, ptáš se vždy jen na JEDNU otázku najednou. Po otázce mlč a počkej na odpověď. Nikdy neprozrazuj odpověď předem a neodpovídej za dítě.
- Po odpovědi dej konkrétní zpětnou vazbu: co bylo správně a proč. Je-li odpověď špatná, řekni to laskavě, vysvětli správný postup jinými slovy na novém příkladu a pak se ujisti, že to dítě chápe. Chval konkrétně (ne jen „super“). Nikdy nekritizuješ dítě, jen odpověď.
- Dítě mluví výhradně tehdy, když drží tlačítko (push-to-talk). Její promluva ti přijde vcelku, až když tlačítko pustí; mezi promluvami nic neslyšíš, takže je normální, že je chvíli ticho. Nikdy se neptej „jsi tam?“ ani „slyšíš mě?“. Po otázce prostě počkej; když dlouho neodpovídá, pomůže ti pokyn od aplikace.
- Dítě tě smí kdykoli přerušit (podrží tlačítko, i když mluvíš). Odpověz stručně a pak řekni „Tak, vraťme se tam, kde jsme skončili“ a pokračuj přesně od místa, kde jsi skončil.

ŘÍZENÍ LEKCE
- Zprávy začínající „${CONTROL}“ jsou pokyny aplikace, ne slova dítěte. Plň je přesně a hned. Nikdy je nečti nahlas a nezmiňuj, že existují. Nikdy sám nepřeskakuj dopředu ani se nevracej zpět: co je další krok, určuje výhradně aplikace.
- Nástroje volej potichu. Po zavolání nástroje nic navíc neříkej, dokud nedostaneš další pokyn ${CONTROL}. Nástroje: part_explained() – až opravdu dokončíš výklad celé části; record_answer(question_id, answer_transcript, is_correct, feedback) – po každé vyhodnocené odpovědi dítěte na otázku z pokynu; request_next_step() – když je aktuální krok hotový; flag_uncertain(topic) – když si nejsi jistý, zda něco v materiálech opravdu je; lesson_complete(score) – až na výslovný pokyn ke konci.
${isMathSubject(subject) ? "- Matematická znaménka vyslovuj slovy (třikrát čtyři je dvanáct; dvanáct děleno třemi jsou čtyři; sedmnáct minus pět)." : ""}

PRAVDIVOST (nejvyšší priorita)
- Používáš POUZE studijní materiál a plán lekce níže a to, co dostaneš v pokynech ${CONTROL}. Nepřidávej fakta ze své paměti, ani kdyby byla pravdivá. Vlastní nové příklady smíš vymýšlet jen tehdy, když používají výhradně pravidla z materiálu a všechny výpočty dvakrát zkontroluješ.
- Zeptá-li se dítě na něco, co v jejích materiálech není, řekni to jednou větou („To v našich materiálech nemáme, zeptej se paní učitelky nebo rodičů“) a vrať se k lekci. Nejsi-li si jistý, zavolej flag_uncertain.

${notes ? `POKYNY KE KURZU (od správce, platí vždy):\n${notes}\n\n` : ""}LEKCE ${lesson.id}: ${lesson.title}
STUDIJNÍ MATERIÁL:
${material}

PLÁN LEKCE:
${parts}
${stateSummary ? `\nSTAV PO OBNOVENÍ SPOJENÍ (navazuješ, nezačínáš od začátku):\n${stateSummary}\n` : ""}`;
}

/* ---------- [LESSON CONTROL] messages ---------- */

const fmtSec = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;

export function questionForVoice(q: Question): string {
  const opts = q.options?.length ? `\nMožnosti (přečti je nahlas jako A, B, C…): ${q.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join(" | ")}` : "";
  return `Otázka: ${q.prompt}${opts}\nSprávná odpověď (klíč, neprozrazuj předem): ${q.answer}${q.accepted?.length ? `\nPřijatelné zápisy: ${q.accepted.join(" | ")}` : ""}\nVysvětlení: ${q.explanation}\nZdroj: ${q.source}`;
}

export function ctlWarmupIntro(n: number, resumed: boolean): string {
  return `${CONTROL} STAV: WARMUP (opakování z dřívějších lekcí)
${resumed ? "Navazuješ po přerušení. " : "Srdečně žačku přivítej a "}řekni, že si nejdřív krátce zopakujete, co už umí (${n} ${n === 1 ? "otázka" : n < 5 ? "otázky" : "otázek"} z dřívějších lekcí). Nic dalšího zatím nevykládej, otázky přijdou v dalších pokynech.`;
}

export function ctlExplain(part: Part, idx: number, total: number, resumed: boolean, passages: string): string {
  return `${CONTROL} STAV: EXPLAIN – část ${idx + 1} z ${total}: „${part.title}“
${resumed ? "Navazuješ po přerušení: krátce (1 věta) připomeň, kde jste skončili, a pokračuj ve výkladu. " : idx === 0 ? "Krátce přivítej žačku a řekni, co se dnes naučíte. " : "Navaž jednou větou na předchozí část. "}Cílová délka výkladu této části: ${fmtSec(part.targetSeconds)} (${part.targetSeconds} s). Vykládej vcelku, dlouze a strukturovaně, bez čekání na odpovědi.
Cíle části: ${part.objectives.join("; ")}
Klíčové poznatky, které musí zaznít: ${part.keyFacts.join("; ")}
Zdrojové odstavce:
${passages}
Až výklad této části opravdu dokončíš (včetně shrnutí „Zapamatuj si…“), zavolej part_explained().`;
}

export const ctlExplainContinue = (variant: number): string => {
  const ways = [
    "přidej další podrobný příklad s výpočtem krok za krokem",
    "ukaž, kde se to hodí v běžném životě (nákup, hra, škola)",
    "shrň vše dosud řečené a pak ukaž typickou chybu a jak se jí vyhnout",
    "vysvětli totéž ještě jednou jinými slovy na jednodušším příkladu",
  ];
  return `${CONTROL} POKYN: Výklad této části ještě neskončil – je příliš brzy. Pokračuj: ${ways[variant % ways.length]}. Zůstaň u zdrojových odstavců. Až budeš opravdu hotový, zavolej part_explained().`;
};

export const ctlExplainWrapUp = (): string =>
  `${CONTROL} POKYN: Čas této části téměř vypršel. Do dvou minut výklad dokonči krátkým shrnutím „Zapamatuj si…“ a pak zavolej part_explained().`;

export function ctlQuestion(q: Question, i: number, n: number, kind: "warmup" | "check" | "final" | "retest", lead?: string): string {
  const where = kind === "warmup" ? "opakování" : kind === "check" ? "kontrolní otázky k této části" : kind === "final" ? "ZÁVĚREČNÝ KVÍZ" : "OPAKOVACÍ TEST";
  const rules =
    kind === "check"
      ? "Když je odpověď špatná, vysvětli správný postup laskavě a ujisti se, že dítě rozumí."
      : "V kvízu neprozrazuj správnou odpověď dřív, než dítě odpoví; zpětná vazba je krátká (1–2 věty).";
  return `${CONTROL} STAV: ${kind === "warmup" ? "WARMUP" : kind === "check" ? "CHECK_QUESTIONS" : kind === "final" ? "FINAL_QUIZ" : "RETEST"} – ${where}, otázka ${i + 1} z ${n}${lead ? `\n${lead}` : ""}
Polož TUTO JEDINOU otázku nahlas (formuluj ji přirozeně, můžeš ji mírně přeformulovat, ale nemeň smysl ani čísla) a počkej na odpověď. Neptej se na nic jiného.
[id: ${q.id}]
${questionForVoice(q)}
${rules} Po vyhodnocení zavolej record_answer(question_id = "${q.id}", answer_transcript = doslovná odpověď dítěte, is_correct, feedback = tvoje krátká zpětná vazba česky). Potom nic dalšího neříkej a počkej na můj další pokyn.`;
}

export const ctlRephrase = (): string =>
  `${CONTROL} POKYN: Dítě zatím neodpovědělo. Klidně, přátelsky otázku zopakuj jinými slovy (bez prozrazení odpovědi), připomeň jí, že k odpovědi stačí podržet velké tlačítko (nebo mezerník) a mluvit, a znovu počkej.`;
export const ctlHint = (): string =>
  `${CONTROL} POKYN: Dítě stále neodpovídá. Dej malou nápovědu, která odpověď neprozradí (připomeň pravidlo nebo pomocný krok), a znovu počkej. Řekni, že se nic neděje, když si není jistá.`;
export const ctlReveal = (q: Question): string =>
  `${CONTROL} POKYN: Čas na odpověď vypršel. Laskavě řekni správnou odpověď („${q.answer}“), vysvětli ji krátce a jednoduše (${q.explanation}) a řekni, že to zkusíte příště. Potom zavolej record_answer(question_id = "${q.id}", answer_transcript = "", is_correct = false, feedback = …).`;
export const ctlEvaluateNow = (q: Question): string =>
  `${CONTROL} POKYN: Dítě odpovědělo na otázku [id: ${q.id}], ale nezavolal jsi record_answer. Vyhodnoť odpověď teď: krátká zpětná vazba a pak zavolej record_answer.`;

export function ctlFeedback(part: Part, results: { q: Question; correct: boolean }[]): string {
  const wrong = results.filter((r) => !r.correct);
  return `${CONTROL} STAV: FEEDBACK – shrnutí části „${part.title}“
Výsledek: ${results.length - wrong.length} z ${results.length} správně.
${wrong.length ? `Špatně nebo neodpovězeno:\n${wrong.map((r) => `- ${r.q.prompt} (správně: ${r.q.answer})`).join("\n")}\nKrátce (celkem do 40 sekund) povzbuď žačku a jedním až dvěma větami znovu vysvětli, co dělalo potíže.` : "Všechno správně: jednou větou ji konkrétně pochval."} Pak zavolej request_next_step().`;
}

export function ctlFinalIntro(total: number): string {
  return `${CONTROL} POKYN: Nyní začíná ZÁVĚREČNÝ KVÍZ (${total} otázek). Jednou větou žačku povzbuď a řekni, že jde o kvíz, kde se zkouší, co si zapamatovala.`;
}

export function ctlSummary(lesson: LessonDef, correct: number, total: number, next: string | null): string {
  return `${CONTROL} STAV: SUMMARY
Kvíz dopadl ${correct} z ${total} správně (${Math.round((correct / Math.max(total, 1)) * 100)} %) – lekce je splněna. Vyslov radost, konkrétně pochval a v několika větách shrň hlavní poznatky lekce „${lesson.title}“: ${lesson.keyFacts.join("; ")}. ${next ? `Řekni, že příště bude následovat: ${next}.` : "Řekni, že to byla poslední lekce kurzu."} Nakonec zavolej lesson_complete(score = ${(correct / Math.max(total, 1)).toFixed(2)}).`;
}

export function ctlReviewIntro(parts: Part[], round: number, correct: number, total: number): string {
  return `${CONTROL} STAV: REVIEW – krátké opakování (${round}. kolo)
Kvíz dopadl ${correct} z ${total}, což ještě nestačí na splnění lekce (potřebné je aspoň 75 %). Povzbuď žačku ("nevadí, projdeme si to ještě jednou jinak") a KRÁTCE (asi 4–5 minut) znovu vysvětli jen tato témata, jinak a s novými jednoduchými příklady:
${parts.map((p) => `• ${p.title}: ${p.keyFacts.join("; ")}`).join("\n")}
Potom zavolej request_next_step().`;
}

export const ctlRetestIntro = (n: number): string =>
  `${CONTROL} POKYN: Nyní krátký opakovací test (${n} otázek) jen z toho, co dělalo potíže. Jednou větou žačku povzbuď.`;

export const ctlRetestFailed = (): string =>
  `${CONTROL} POKYN: Test ještě nestačil. Laskavě řekni, že to zkusíte ještě jednou po krátkém opakování.`;

export const ctlMoveOn = (): string =>
  `${CONTROL} POKYN: Tuto lekci uzavíráme; slabší místa si zopakujete v dalších lekcích. Laskavě žačku pochval za snahu a řekni, že se na ně zaměříte při příštím opakování. Potom zavolej lesson_complete(score) s hodnotou z posledního testu.`;

export const ctlPause = (): string => `${CONTROL} POKYN: Přestávka. Přestaň mluvit a čekej na další pokyn.`;
export const ctlResume = (): string => `${CONTROL} POKYN: Přestávka skončila. Navaž přesně tam, kde jsi přestal (případně jednou větou zopakuj poslední myšlenku) a pokračuj.`;
