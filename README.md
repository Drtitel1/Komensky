# Komenský – mluvený kurz matematiky pro 3. třídu (Windows aplikace)

Samostatná desktopová aplikace (Electron, Windows x64) pro jednoho žáka. **Žádný server, žádný Vercel, žádná hostovaná databáze.**
Vše běží lokálně na počítači; jediné externí služby jsou **Gemini API** (učitel hlasem + příprava lekcí) a **GitHub Releases** (automatické aktualizace).

- Učitel mluví česky (Gemini 3.8 Live, obousměrný zvuk), ptá se a opravuje odpovědi. **Push-to-talk:** žačka mluví, jen když drží velké tlačítko nebo mezerník; stisk učitele okamžitě přeruší. Lekce trvá 30–45 minut.
- Lekce řídí **stavový automat v aplikaci** (`src/shared/engine.ts`): `WARMUP → (EXPLAIN → CHECK → FEEDBACK) × 5–8 → FINAL_QUIZ → SUMMARY`, při výsledku pod 75 % `REVIEW → RETEST`. Aplikace, ne model, je zdrojem pravdy o postupu.
- Učivo je přibaleno v aplikaci (`content/curriculum.json`, 5 etap / 18 lekcí). Plán každé lekce (5–8 částí, kontrolní otázky s klíči, závěrečný kvíz 10–15 otázek) vygeneruje `PREP_MODEL` jednou, ověří druhým průchodem (fact-check) a uloží do SQLite.
- Postup, odpovědi, opakování (spaced repetition), plány a přepisy jsou v SQLite (`%APPDATA%\komensky\komensky.db`) s bezpečnými migracemi.

Vydání nové verze: [RELEASING.md](RELEASING.md)

Návody: [pro žačku](docs/PRUVODCE-SESTRA.md) · [pro správce (klíč, vydání, zálohy, cena)](docs/PRUVODCE-SPRAVCE.md)

## Architektura a bezpečnost

| Vrstva | Co dělá |
|---|---|
| **main** (`src/main`) | jediné místo, kde žije **API klíč** (šifrovaně přes `safeStorage`); generování plánů (`PREP_MODEL`); vydávání **dočasných tokenů** pro Live API; SQLite; aktualizace; PIN; zálohy |
| **preload** (`src/preload`) | minimální typované API (`window.komensky`), každá metoda = jeden povolený IPC kanál |
| **renderer** (`src/renderer`) | React + Vite + Tailwind; Live WebSocket, mikrofon (AudioWorklet 16 kHz PCM), přehrávání (24 kHz), stavový automat, přepis |

- Renderer **nikdy nevidí klíč**: hlavní proces vytvoří krátkodobý *ephemeral token* (`authTokens.create`, API `v1alpha`), do kterého je zamčena konfigurace (model, systémová instrukce, nástroje), a renderer s ním otevře WebSocket. Doporučení dokumentace pro klienta přímo připojeného k Live API je právě tento postup (klíč se do klienta nedává).
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, přísná **CSP** (jen aplikace + `generativelanguage.googleapis.com`), vlastní protokol `komensky://` místo `file://`, mikrofon povolen jen pro vlastní origin, ověřování odesílatele každé IPC zprávy, zakázaná navigace i nová okna, vypnuté nebezpečné Electron *fuses*.
- Jedna instance aplikace, paměť velikosti/polohy okna, `powerSaveBlocker` během lekce, logy přes `electron-log` (`%APPDATA%\komensky\logs\main.log`).

### Push-to-talk
`realtimeInputConfig.automaticActivityDetection.disabled = true` (zamčeno v dočasném tokenu), `activityHandling: START_OF_ACTIVITY_INTERRUPTS`, `turnCoverage: TURN_INCLUDES_ONLY_ACTIVITY`. Aplikace posílá `activityStart` při stisku a `activityEnd` při puštění; zvuk z mikrofonu odchází **jen** mezi nimi (brána v `MicCapture.capturing`). Stisk při mluvení učitele okamžitě vyprázdní přehrávání a server přeruší generování.

### Dlouhé relace
Session resumption (handle z `sessionResumptionUpdate`), `goAway` → plynulé předání nového spojení, opětovné připojení s exponenciálním čekáním, **watchdog** pro tiše mrtvé spojení (25 s bez odpovědi), ruční „Zkusit znovu“, offline režim, komprese kontextu (`slidingWindow`). Po obnově bez zachování kontextu se pošle systémová instrukce s **krátkým shrnutím stavu** a stavový automat znovu vydá pokyn aktuálního kroku.

## Vývoj

```bash
npm ci
npm run dev            # Electron + Vite (živé načítání)
npm run typecheck && npm test
npm run test:e2e       # smoke test skutečné aplikace pod xvfb (Linux): scriptovaný „učitel“, bez Google
npm run dist           # lokální build instalátoru (Windows; na CI to dělá Actions)
```

Testovací režim (`KOMENSKY_TEST=1`, jen v nebalené aplikaci) používá deterministický plán a scriptovaného učitele; v instalované aplikaci je nedostupný.

## Vydání

`npm run release -- patch` → verze, commit, tag `vX.Y.Z`, push → GitHub Actions sestaví NSIS instalátor (bez podpisu) a publikuje ho s `latest.yml`. Podrobnosti a test aktualizace: [návod správce](docs/PRUVODCE-SPRAVCE.md).

## Struktura

```
content/curriculum.json   učivo (zdroj pravdy, součást aplikace)
src/shared/               typy, stavový automat, prompty (česky), SRS, IPC kontrakt
src/main/                 hlavní proces
src/preload/              most do rendereru
src/renderer/             UI
tests/                    vitest (automat, databáze, plánovač) + e2e smoke test
web-legacy/               původní webová verze (Next.js + Vercel), ponechána jen pro archiv
```
