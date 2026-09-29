/** Local-testing stand-ins for Gemini and ElevenLabs (enabled with MOCK_AI=1). Never used in production. */

// ~2 seconds of valid silent MPEG-1 Layer III audio (128 kbps, 44.1 kHz, 417-byte frames).
const frame = Buffer.alloc(417);
frame[0] = 0xff;
frame[1] = 0xfb;
frame[2] = 0x90;
export const MOCK_MP3 = Buffer.concat(Array.from({ length: 80 }, () => frame)).toString("base64");

const q = (i: number, type: "mc" | "short" | "explain" = "mc") =>
  type === "mc"
    ? { type, prompt: `Kolik je 2 · ${i + 1}?`, options: [String(2 * (i + 1)), String(2 * (i + 1) + 1), String(2 * (i + 1) + 2)], correctIndex: 0, modelAnswer: String(2 * (i + 1)), explanation: "Násobíme dvěma.", sourceId: "Z1" }
    : type === "short"
      ? { type, prompt: `Vypočítej 3 · ${i + 1}.`, modelAnswer: String(3 * (i + 1)), explanation: "Násobíme třemi.", sourceId: "Z1" }
      : { type, prompt: "Vysvětli vlastními slovy, co je násobení.", modelAnswer: "Násobení je zkrácený zápis opakovaného sčítání.", explanation: "Násobení zkracuje sčítání.", sourceId: "Z1" };

const para = (n: number) =>
  Array.from({ length: 4 }, (_, k) => `Toto je ukázková věta číslo ${n}${k}, která slouží jen k testování aplikace bez skutečné umělé inteligence.`).join(" ");

export function mockJson(prompt: string): unknown {
  const kind = /#KIND:(\w+)/.exec(prompt)?.[1];
  switch (kind) {
    case "plan":
      return { parts: Array.from({ length: 5 }, (_, i) => ({ title: `Část ${i + 1}`, focus: "Test", passageIds: ["Z1"] })) };
    case "part":
      return { script: [para(1), para(2), para(3), para(4), para(5), para(6)], questions: [q(1), q(2, "short"), q(3)] };
    case "final":
      return { questions: [...Array.from({ length: 6 }, (_, i) => q(i)), ...Array.from({ length: 4 }, (_, i) => q(i, "short")), q(0, "explain")] };
    case "review":
      return { script: [para(7), para(8)], questions: [q(4), q(5, "short")] };
    case "reviewpack":
      return { script: [para(9), para(10)], questions: [q(6), q(7, "short"), q(8), q(9)] };
    case "check":
      return { verdict: "pass", issues: [] };
    case "grade":
      return { verdict: "correct", feedback: "Hezky!" };
    default:
      throw new Error("mock: unknown kind");
  }
}
