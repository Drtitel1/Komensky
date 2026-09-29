// One-command release:  npm run release -- patch | minor | major | 1.2.3   [--dry-run] [--skip-checks]
// bumps the version, commits, tags vX.Y.Z and pushes -> GitHub Actions builds and publishes the installer.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const skip = args.includes("--skip-checks");
const bump = args.find((a) => !a.startsWith("--")) ?? "patch";
if (!/^(patch|minor|major|\d+\.\d+\.\d+)$/.test(bump)) {
  console.error("Použití: npm run release -- patch|minor|major|X.Y.Z [--dry-run] [--skip-checks]");
  process.exit(1);
}

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: opts.capture ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf8", shell: process.platform === "win32" }).toString().trim();
const npm = "npm";
const git = "git";

const dirty = sh(git, ["status", "--porcelain"], { capture: true });
if (dirty) {
  console.error("V repozitáři jsou neuložené změny. Nejdřív je commitněte:\n" + dirty);
  process.exit(1);
}
const branch = sh(git, ["rev-parse", "--abbrev-ref", "HEAD"], { capture: true });
if (branch === "HEAD") {
  console.error("Nejste na žádné větvi.");
  process.exit(1);
}

if (!skip) {
  console.log("→ kontroly (typy + testy)");
  sh(npm, ["run", "typecheck"]);
  sh(npm, ["test"]);
}

const current = JSON.parse(readFileSync("package.json", "utf8")).version;
console.log(`→ aktuální verze ${current}, zvyšuji (${bump})`);
if (dry) {
  console.log("(dry run: nic se nemění)");
  process.exit(0);
}
sh(npm, ["version", bump, "--no-git-tag-version"]);
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const tag = `v${version}`;
sh(git, ["add", "package.json", "package-lock.json"]);
sh(git, ["commit", "-m", `Release ${tag}`]);
sh(git, ["tag", "-a", tag, "-m", `Komenský ${version}`]);
sh(git, ["push", "origin", branch]);
sh(git, ["push", "origin", tag]);
console.log(`\n✅ Hotovo. GitHub Actions teď sestaví instalátor pro ${tag}.\n   Průběh: https://github.com/Drtitel1/Komensky/actions\n   Vydání: https://github.com/Drtitel1/Komensky/releases/tag/${tag}`);
