// One-off generator: converts the legacy TypeScript curriculum (web-legacy/src/curriculum) into content/curriculum.json.
// After the first run the JSON file is the single source of truth – edit it directly.
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "komensky-content-"));
const out = join(dir, "curriculum.mjs");
await build({ entryPoints: ["web-legacy/src/curriculum/index.ts"], bundle: true, format: "esm", outfile: out, logLevel: "error" });
const { STAGES, SUBJECT } = await import(pathToFileURL(out).href);
const data = { schema: 1, subject: SUBJECT, age: 8, stages: STAGES };
writeFileSync("content/curriculum.json", JSON.stringify(data, null, 2) + "\n");
console.log(`stages: ${STAGES.length}, lessons: ${STAGES.reduce((n, s) => n + s.lessons.length, 0)}`);
