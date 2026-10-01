/** Small helpers so spoken answers ("dvacet čtyři", "čtyřiadvacet") are understood without an AI call. */

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const UNITS: Record<string, number> = {
  nula: 0, jedna: 1, jeden: 1, jedno: 1, dva: 2, dve: 2, tri: 3, ctyri: 4, pet: 5, sest: 6, sedm: 7, osm: 8, devet: 9,
  deset: 10, jedenact: 11, dvanact: 12, trinact: 13, ctrnact: 14, patnact: 15, sestnact: 16, sedmnact: 17, osmnact: 18, devatenact: 19,
};
const TENS: Record<string, number> = { dvacet: 20, tricet: 30, ctyricet: 40, padesat: 50, sedesat: 60, sedmdesat: 70, osmdesat: 80, devadesat: 90 };
const FILLER = new Set(["je", "to", "bude", "se", "rovna", "cislo", "odpoved", "ano", "tedy", "asi"]);
const UNIT_KEYS = Object.keys(UNITS).filter((k) => UNITS[k] >= 1 && UNITS[k] <= 9);

/** "dvě stě dvacet pět" -> 225, "čtyřiadvacet" -> 24. Returns null when the text is not purely a number. */
export function czechWordsToNumber(text: string): number | null {
  const toks = strip(text).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t && !FILLER.has(t));
  if (!toks.length) return null;
  let total = 0;
  let cur = 0;
  let seen = false;
  for (const t of toks) {
    if (/^\d+$/.test(t)) {
      cur += Number(t);
    } else if (t in UNITS) cur += UNITS[t];
    else if (t in TENS) cur += TENS[t];
    else if (t === "sto") cur += 100;
    else if (t === "ste" || t === "sta" || t === "set") cur = (cur || 1) * 100;
    else if (t === "tisic") {
      total += (cur || 1) * 1000;
      cur = 0;
    } else {
      // compound like "ctyriadvacet" = 4 + 20
      const m = UNIT_KEYS.map((u) => ({ u, rest: t.startsWith(u + "a") ? t.slice(u.length + 1) : null })).find((x) => x.rest && x.rest in TENS);
      if (!m) return null;
      cur += UNITS[m.u] + TENS[m.rest!];
    }
    seen = true;
  }
  return seen ? total + cur : null;
}

/** Number in the text, from digits ("24 jablek", "3,5") or Czech words. */
export function spokenNumber(text: string): number | null {
  const d = text.replace(/\s/g, "").replace(",", ".").match(/^-?\d+(\.\d+)?/);
  if (d) return Number(d[0]);
  return czechWordsToNumber(text);
}

export const normalizeText = (s: string) =>
  strip(s)
    .replace(/[^a-z0-9,.\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const TOOL_NAMES = "part_explained|record_answer|request_next_step|flag_uncertain|lesson_complete";

/** Removes control-call leftovers and LaTeX/markup that the voice model sometimes writes into its transcript. */
export function cleanTutorText(s: string): string {
  return s
    .replace(/\\(?:mathrm|text|operatorname|mathit)\s*\{([^}]*)\}/g, "$1")
    .replace(new RegExp(`\\\\?(?:${TOOL_NAMES.replace(/_/g, "\\\\?_")})\\s*\\([^)]*\\)?`, "g"), "")
    .replace(new RegExp(`(?:${TOOL_NAMES})`, "g"), "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[ \t]{2,}/g, " ");
}
