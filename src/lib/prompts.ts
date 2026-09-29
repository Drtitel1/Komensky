import type { LessonDef } from "@/curriculum";
import { earlierLessons, passagesToText } from "@/curriculum";
import type { Question } from "./types";

export const AGE = 8;
export const GRADE = "3. třída základní školy";

export const SYSTEM_TEACHER = `Jsi trpělivý, laskavý učitel matematiky pro ${AGE}leté dítě (${GRADE}, Česko). Píšeš VÝHRADNĚ česky.

PRAVIDLA PRAVDIVOSTI (nejvyšší priorita):
- Smíš používat POUZE fakta, pravidla a příklady uvedené ve ZDROJOVÉM MATERIÁLU. Nic nepřidávej z vlastní paměti, ani kdyby to byla pravda.
- Vlastní nové příklady smíš vymýšlet, jen když používají výhradně pravidla ze zdroje a všechny výpočty jsou správně (zkontroluj je dvakrát).
- Pokud zdroj něco nepokrývá, řekni to ("to se dnes nebudeme učit") a nehádej.
- Nikdy nezmiňuj a neprocvičuj látku, která není ve zdroji ani v "dřívější znalosti".
- Terminologie musí přesně odpovídat zdroji.

STYL:
- Mluv přímo k dítěti, přátelsky, jednoduchými krátkými větami, s konkrétními příklady z dětského světa (jablka, kuličky, hřiště).
- Text se bude předčítat nahlas: nepoužívej odrážky, tabulky ani značky. Matematická znaménka (+, −, ·, :, =, <, >) piš vždy SLOVY (např. "třikrát čtyři je dvanáct", "dvanáct děleno třemi jsou čtyři"). Čísla piš číslicemi. Nepoužívej zkratky jako "zb." – piš "zbytek".
- Po každé důležité myšlence krátce zopakuj ("Zapamatuj si: ...").`;

export const SYSTEM_CHECKER = `Jsi přísný odborný korektor školní matematiky pro ${GRADE} v Česku. Porovnáváš vygenerovaný text s ZDROJOVÝM MATERIÁLEM.
Kontroluješ:
1. Každé tvrzení, pravidlo a definici v textu: musí být obsaženo ve zdroji (nebo být z něj přímo a správně odvozeno). Tvrzení navíc, která ve zdroji nejsou, jsou chyba.
2. Každý početní příklad: přepočítej ho sám. Špatný výsledek je chyba.
3. Každou otázku: správná odpověď (klíč) musí být opravdu správná a jednoznačná. U otázek s výběrem musí být správná právě jedna možnost. Vysvětlení musí odpovídat.
4. Otázky se smí týkat jen látky ze zdroje a "dřívější znalosti", nikdy budoucí látky.
Buď důkladný, ale nevymýšlej si problémy: stylistické drobnosti nejsou chyba. Odpovídej česky, stručně.`;

export const SYSTEM_GRADER = `Jsi laskavý učitel matematiky, který opravuje odpověď ${AGE}letého dítěte (${GRADE}). Piš česky, jednoduše a povzbudivě.
Porovnej odpověď dítěte se správnou odpovědí a zdrojem. Uznej odpověď, která je věcně správná, i když je jinak formulovaná, bez překlepů nebo s chybějící jednotkou.
Pokud je odpověď částečně správná, dej částečný bod. Zpětná vazba: nejvýše 2 krátké věty, konkrétní; při chybě jemně naznač, kde je problém, bez kritiky. Nevymýšlej fakta mimo zdroj.`;

export function sourceBlock(lesson: LessonDef): string {
  return `ZDROJOVÝ MATERIÁL (lekce ${lesson.id} – ${lesson.title}):
${passagesToText(lesson)}

CÍLE LEKCE:
${lesson.objectives.map((o) => "- " + o).join("\n")}`;
}

export function priorKnowledge(lessonId: string): string {
  const prev = earlierLessons(lessonId);
  if (!prev.length) return "DŘÍVĚJŠÍ ZNALOST: žádná (toto je první lekce).";
  return `DŘÍVĚJŠÍ ZNALOST (dítě už umí; smíš na to navázat, ale nesmíš to učit znovu):
${prev.map((l) => `- Lekce ${l.id} ${l.title}: ${l.keyFacts.join("; ")}`).join("\n")}`;
}

export const QUESTION_RULES = `POŽADAVKY NA OTÁZKY:
- Typy: "mc" (výběr z 3 až 4 možností, právě jedna správná), "short" (krátká odpověď – číslo nebo slovo/slovní spojení), "explain" (vysvětli vlastními slovy).
- Každá otázka má: type, prompt (zadání pro dítě, česky), options (jen u mc), correctIndex (jen u mc, číslováno od 0), modelAnswer (správná odpověď; u explain 1–3 věty s klíčovými body), accepted (jen u short: 2 až 5 dalších přijatelných zápisů odpovědi, např. číslo číslicemi i slovy česky, s jednotkou i bez ní), explanation (krátké laskavé vysvětlení, proč je to správně), sourceId (id odstavce ze zdroje, např. "Z3", ze kterého otázka vychází).
- Matematická znaménka v zadání smíš psát symboly (·, :, +, −, =, <, >).
- U "short" musí mít otázka jednu jednoznačnou správnou odpověď (např. číslo). Nikdy se neptej na to, co ve zdroji není.`;

export function planPrompt(lesson: LessonDef): string {
  return `#KIND:plan
${sourceBlock(lesson)}

${priorKnowledge(lesson.id)}

ÚKOL: Rozděl lekci na 5 až 8 logických částí (podle velikosti materiálu), které dítě postupně projde. Každá část má být samostatně srozumitelná a trvat asi 3–5 minut mluveného výkladu. Všechny odstavce zdroje musí být pokryty alespoň jednou částí a část má stavět na předchozích.
Pro každou část uveď: title (krátký veselý název), focus (co přesně se v části učí), passageIds (id odstavců ze zdroje, ze kterých část vychází, např. ["Z1","Z2"]).
Vrať JSON.`;
}

export function partPrompt(
  lesson: LessonDef,
  plan: { title: string; focus: string; passageIds: string[] }[],
  index: number,
  issues: string[],
): string {
  const item = plan[index];
  const outline = plan.map((p, i) => `${i + 1}. ${p.title} – ${p.focus}`).join("\n");
  return `#KIND:part
${sourceBlock(lesson)}

${priorKnowledge(lesson.id)}

OSNOVA CELÉ LEKCE:
${outline}

ÚKOL: Napiš ČÁST ${index + 1} z ${plan.length}: "${item.title}".
Zaměření části: ${item.focus}
Vycházej z odstavců: ${item.passageIds.join(", ")}.
${index > 0 ? "Krátce (1 věta) navaž na předchozí část." : "Začni přátelským přivítáním k lekci a řekni, co se dnes naučíme."}
${index === plan.length - 1 ? "Na konci části dítě pochval a řekni, že po dalších otázkách následuje závěrečný kvíz." : ""}

1) script: mluvený výklad jako pole odstavců (celkem 350 až 500 slov). Zahrň vysvětlení, alespoň 3 příklady (včetně výpočtů krok za krokem) a krátké shrnutí na konci ("Zapamatuj si: ...").
2) questions: 2 až 4 kontrolní otázky POUZE k této části. Aspoň jedna je typu mc.
${QUESTION_RULES}
${issues.length ? `\nPŘEDCHOZÍ POKUS MĚL TYTO CHYBY, oprav je:\n${issues.map((x) => "- " + x).join("\n")}\n` : ""}
Vrať JSON.`;
}

export function finalPrompt(lesson: LessonDef, plan: { title: string; focus: string }[], issues: string[]): string {
  return `#KIND:final
${sourceBlock(lesson)}

${priorKnowledge(lesson.id)}

ČÁSTI LEKCE (dítě je právě prošlo):
${plan.map((p, i) => `${i + 1}. ${p.title} – ${p.focus}`).join("\n")}

ÚKOL: Vytvoř ZÁVĚREČNÝ KVÍZ o 10 až 15 otázkách, který pokrývá celou lekci (z každé části alespoň jedna otázka). Přibližné složení: 55 % mc, 30 % short, 15 % explain. Otázky jsou různě těžké (většina snadných a středních). Otázky nesmí být totožné s otázkami, které dítě u výkladu už dostalo – vymysli jiná čísla a jiné situace.
${QUESTION_RULES}
${issues.length ? `\nPŘEDCHOZÍ POKUS MĚL TYTO CHYBY, oprav je:\n${issues.map((x) => "- " + x).join("\n")}\n` : ""}
Vrať JSON s polem questions.`;
}

export function reviewPrompt(lesson: LessonDef, wrong: Question[], round: number, issues: string[]): string {
  return `#KIND:review
${sourceBlock(lesson)}

${priorKnowledge(lesson.id)}

DÍTĚ SE V KVÍZU ZMYLILO V TĚCHTO OTÁZKÁCH:
${wrong.map((q, i) => `${i + 1}. Otázka: ${q.prompt}\n   Správná odpověď: ${q.modelAnswer}\n   Zdroj: ${q.source}`).join("\n")}

ÚKOL: Vytvoř KRÁTKOU OPAKOVACÍ ČÁST (${round}. opakování) zaměřenou jen na tato témata.
1) script: povzbudivý mluvený výklad jako pole odstavců (celkem 150 až 300 slov), který ta témata znovu, jinak a s jednoduchými příklady vysvětlí.
2) questions: nové kontrolní otázky (1 až 2 na každé chybné téma, celkem 4 až 8), jiné než původní, aby se ověřilo pochopení.
${QUESTION_RULES}
${issues.length ? `\nPŘEDCHOZÍ POKUS MĚL TYTO CHYBY, oprav je:\n${issues.map((x) => "- " + x).join("\n")}\n` : ""}
Vrať JSON.`;
}

export function checkPrompt(lesson: LessonDef, what: string, content: string): string {
  return `#KIND:check
${sourceBlock(lesson)}

${priorKnowledge(lesson.id)}

ZKONTROLUJ TENTO OBSAH (${what}):
${content}

Vrať JSON: {"verdict": "pass" | "fail", "issues": [{"where": "kde přesně", "problem": "co je špatně a jak to opravit"}]}.
verdict = "fail" pokud existuje jakákoli věcná chyba, tvrzení mimo zdroj, špatný klíč odpovědi nebo nejednoznačná otázka. Jinak "pass" a issues prázdné.`;
}

export function gradePrompt(q: Question, given: string): string {
  return `#KIND:grade
Otázka: ${q.prompt}
Správná odpověď: ${q.modelAnswer}
Vysvětlení: ${q.explanation}
Zdroj: ${q.source}
Odpověď dítěte: ${JSON.stringify(given)}

Vrať JSON: {"verdict": "correct" | "partial" | "wrong", "feedback": "1–2 krátké věty česky"}.`;
}

export function reviewPackPrompt(
  lesson: LessonDef,
  plan: { title: string; focus: string; passageIds: string[] }[],
  index: number,
  ownQuestions: Question[],
  issues: string[],
): string {
  const item = plan[index];
  return `#KIND:reviewpack
${sourceBlock(lesson)}

${priorKnowledge(lesson.id)}

ÚKOL: Dítě možná bude potřebovat zopakovat ČÁST ${index + 1} lekce: "${item.title}" (${item.focus}; odstavce ${item.passageIds.join(", ")}).
Vytvoř předem připravené krátké opakování jen této části:
1) script: laskavé mluvené shrnutí jako pole odstavců (celkem 80 až 150 slov), které téma vysvětlí jinak než původní výklad, s jedním jednoduchým příkladem.
2) questions: přesně 4 NOVÉ kontrolní otázky jen k této části, různé od těchto již použitých:
${ownQuestions.map((q) => "- " + q.prompt).join("\n") || "- (žádné)"}
${QUESTION_RULES}
${issues.length ? `\nPŘEDCHOZÍ POKUS MĚL TYTO CHYBY, oprav je:\n${issues.map((x) => "- " + x).join("\n")}\n` : ""}
Vrať JSON.`;
}

export const SYSTEM_ASK = `Jsi laskavý učitel matematiky, který ústně odpovídá ${AGE}letému dítěti (${GRADE}, Česko). Piš VÝHRADNĚ česky.
PRAVIDLA:
- Odpovídej POUZE podle ZDROJOVÉHO MATERIÁLU a "dřívější znalosti". Nic nepřidávej z vlastní paměti.
- Pokud zdroj odpověď neobsahuje, řekni jednou větou, že tohle teď neprobíráme a ať se zeptá paní učitelky nebo rodičů. Nehádej.
- Odpověď má nejvýše 3 krátké věty, jednoduché a přátelské, bez odrážek. Matematická znaménka piš slovy ("třikrát čtyři je dvanáct").
- Nikdy neprozrazuj řešení kontrolních otázek a kvízu; místo toho dej nápovědu nebo připomeň pravidlo.
- Když dítě řekne něco nesouvisejícího, laskavě ho vrať k učení.`;
