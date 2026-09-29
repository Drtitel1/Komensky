/** Converts maths symbols to words so the TTS voice reads them naturally in Czech. */
export function toSpeech(text: string): string {
  return text
    .replace(/\s·\s|·/g, " krát ")
    .replace(/\s:\s/g, " děleno ")
    .replace(/\s[−–-]\s/g, " mínus ")
    .replace(/\s\+\s/g, " plus ")
    .replace(/\s=\s/g, " se rovná ")
    .replace(/\s<\s/g, " je menší než ")
    .replace(/\s>\s/g, " je větší než ")
    .replace(/≈/g, " se přibližně rovná ")
    .replace(/\bzb\./g, "zbytek")
    .replace(/\bKč\b/g, "korun")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits text into sentences (used for highlighting and segmenting). */
export function splitSentences(text: string): string[] {
  const out = text.match(/[^.!?…]+(?:[.!?…]+["“”)]*)?\s*/g) ?? [text];
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Packs whole sentences into segments of at most `max` characters. */
export function packSegments(paragraphs: string[], max = 420): string[] {
  const segs: string[] = [];
  for (const para of paragraphs) {
    let cur = "";
    for (const sent of splitSentences(para)) {
      if (cur && (cur + " " + sent).length > max) {
        segs.push(cur);
        cur = sent;
      } else {
        cur = cur ? cur + " " + sent : sent;
      }
    }
    if (cur) segs.push(cur);
  }
  return segs;
}
