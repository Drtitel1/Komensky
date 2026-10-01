# Publikování nové verze (RELEASING)

Aplikace se aktualizuje sama z **GitHub Releases**. Ty jen vydáš novou verzi, zbytek udělá GitHub Actions.

## Jednorázové předpoklady
1. **Repozitář musí být veřejný** (Settings → General → Danger Zone → Change visibility → Public).
   Aplikace stahuje aktualizace bez přihlášení; ze soukromého repozitáře to bez vloženého tokenu nejde, a token se do aplikace dávat nesmí.
   V repozitáři nejsou žádná tajemství (Gemini klíč zadává uživatel v aplikaci). Chceš-li repozitář s kódem soukromý, vytvoř druhý **veřejný** repozitář jen pro vydání a změň `owner`/`repo` v `electron-builder.yml` (sekce `publish`).
2. Settings → Actions → General: *Allow all actions* a workflow oprávnění **Read and write permissions** (workflow si žádá `contents: write` sám).
3. Na svém počítači: Node.js 22+, `git`, přihlášení k GitHubu (`git push` musí fungovat).

## Vydání (jeden příkaz)
```bash
git checkout claude/happy-franklin-w0g2kg      # nebo tvoje hlavní větev
git pull
npm ci
npm run release -- patch                       # 1.1.0 -> 1.1.1   (minor: 1.2.0, major: 2.0.0, nebo přesně 1.4.2)
```
Skript: spustí kontroly (typy + testy) → zvýší verzi v `package.json` → commit `Release vX.Y.Z` → tag `vX.Y.Z` → `git push` větve i tagu.
Zkouška bez změn: `npm run release -- patch --dry-run`.

## Co se stane dál
Push tagu `v*.*.*` spustí `.github/workflows/release.yml` na `windows-latest`:
typecheck → testy → build → `electron-builder --win --x64 --publish always` →
**GitHub Release `vX.Y.Z`** se souborem `Komensky-Setup-X.Y.Z.exe`, `latest.yml` a `*.blockmap`.
Průběh vidíš v záložce **Actions** (cca 5–8 min). Až doběhne, je vydání veřejné.

### Když nemůžeš pushnout tag z počítače
Actions → **Release** → *Run workflow* (vybereš větev). Workflow sám vytvoří tag podle verze v `package.json` a vydá ji.
(Verzi předtím zvyš ručně: `npm version patch --no-git-tag-version`, commit, push.)

## Jak se aktualizuje ségra
- Aplikace kontroluje novou verzi při spuštění (po ~15 s) a pak každé 4 hodiny.
- Stahuje se na pozadí **a nikdy ne během lekce**. Po stažení (mimo lekci) se ukáže „**Je dostupná nová verze X.Y.Z – restartovat a aktualizovat?**“ → *Teď* / *Později* (později = nainstaluje se při zavření aplikace).
- Verze je vidět nahoře vedle názvu (`verze 1.1.0`) a v ⚙️ Nastavení je tlačítko *Zkontrolovat aktualizace*.
- Postup, databáze a nastavení zůstávají (databáze má jen přidávací migrace; před migrací se vytvoří záloha `komensky.db.pre-vN.bak`).

## Test celého cyklu aktualizace (doporučeno po prvním nastavení)
1. Vydej `v1.1.0` a nainstaluj `Komensky-Setup-1.1.0.exe` (z Releases) na zkušební počítač. Spusť.
2. Změň něco viditelného, vydej `npm run release -- patch` (→ `v1.1.1`), počkej na zelené Actions a na soubory ve Release.
3. Na zkušebním počítači aplikaci spusť (nebo ⚙️ → *Zkontrolovat aktualizace*): objeví se „Stahuji verzi 1.1.1…“ a potom hláška o restartu. Po *Teď* je nahoře `verze 1.1.1`.
Pokud se nic neděje: `%APPDATA%\komensky\logs\main.log` (hledej `electron-updater`) a zkontroluj, že je repozitář veřejný a Release není *draft*.

## Obsah / učivo
`content/curriculum.json` je součástí aplikace. Změna učiva = commit + nové vydání. Plán už zahájené lekce se nemění (jde jen přegenerovat ve správcovské části).

## Podepisování instalátoru (nepovinné, později)
Bez podpisu ukazuje Windows SmartScreen / Smart App Control varování. Až budeš mít certifikát: přidej secrets `CSC_LINK` (base64 `.pfx`) a `CSC_KEY_PASSWORD` a odkomentuj řádky v `.github/workflows/release.yml`; poté přidej `publisherName` do `electron-builder.yml` (pod `win:`), aby se aktualizace ověřovaly proti stejnému vydavateli. Alternativa: Azure Trusted Signing (komentáře v `electron-builder.yml`). Podpis nemění nic v kódu aplikace.

## Řešení potíží
| Příznak | Příčina / řešení |
|---|---|
| Actions selhávají do ~5 s, žádné kroky | fakturace / limit minut pro **soukromý** repozitář → udělej repo veřejným nebo oprav fakturaci |
| `Tag vX does not match package.json` | tag nesedí s verzí; použij `npm run release` (verzi i tag udělá sám) |
| Aktualizace „404“ | repozitář je soukromý nebo je Release v režimu *draft* |
| Instalace padá na `better-sqlite3` / node-gyp | lokálně: `npm ci --ignore-scripts` a `node node_modules/electron/install.js` (předsestavený binár je v balíčku) |
