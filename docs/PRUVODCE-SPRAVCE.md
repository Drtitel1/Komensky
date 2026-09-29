# Komenský – návod pro správce

## 1. Klíč ke Gemini (Google AI Studio)

1. Otevři <https://aistudio.google.com/apikey> a přihlas se Google účtem.
2. Klikni **Create API key** (vytvořit klíč) a klíč zkopíruj (začíná `AIza…`).
3. **Doporučení:** propoj projekt s fakturací (*Set up billing* v AI Studiu). Zdarma verze má velmi nízké limity (jednotky požadavků za minutu) a lekce by se zasekávala.
   Nastav si také **měsíční rozpočet/upozornění** v Google Cloud Console → Billing → Budgets & alerts.
4. Klíč nikam nezveřejňuj a neposílej. V aplikaci je uložen jen zašifrovaně na jejím počítači.

## 2. První spuštění (na počítači ségry)

1. Nainstaluj aplikaci (viz `PRUVODCE-SESTRA.md`).
2. Při prvním spuštění se ukáže obrazovka nastavení:
   - vlož **Gemini API klíč** a klikni **Test klíče** (musí vyjít „Klíč funguje“),
   - zvol **PIN správce** (4–8 číslic) dvakrát,
   - klikni **Uložit a začít**.
3. Klíč se uloží zašifrovaně (Windows DPAPI přes Electron `safeStorage`) a nikdy se neobjeví v okně aplikace.

## 3. Správcovská část (⚙️ Nastavení → 🔒 Správce → PIN)

| Záložka | K čemu |
|---|---|
| Přehled | lekce, skóre, počet chyb, slabá místa, kolik příkladů čeká na opakování |
| Přepisy | doslovný přepis rozhovoru z každé lekce |
| Plány lekcí | zobrazení a **úprava plánu** (JSON), tlačítko *Vygenerovat znovu* |
| Postup | *Vynulovat lekci*, *Přeskočit na lekci* |
| Záloha | *Uložit zálohu…* / *Načíst zálohu…* (jeden soubor `.json`) |
| Klíč a modely | změna klíče, `LIVE_MODEL`, `PREP_MODEL`, hlas, změna PINu |

**Záloha:** obsahuje postup, odpovědi, plány, přepisy a PIN. Gemini klíč se nezálohuje – po přeinstalaci ho zadáš znovu. Zálohu ukládej občas na flash disk nebo do cloudu.
Data leží v `%APPDATA%\komensky\` (soubor `komensky.db`, logy v `logs\main.log`). Při odinstalaci se **nemažou**.

## 4. Vydání nové verze (ty na svém počítači)

Potřebuješ Node.js 22+ a `git` s přístupem k repozitáři.

```bash
git clone https://github.com/Drtitel1/Komensky.git && cd Komensky
npm ci
# ... uprav kód nebo učivo (content/curriculum.json) ...
git add -A && git commit -m "Co jsem změnil"
npm run release -- patch        # nebo minor / major / 1.2.3
```

Skript zvýší verzi, commitne, vytvoří tag `vX.Y.Z` a pošle vše na GitHub. **GitHub Actions** (`.github/workflows/release.yml`) pak na `windows-latest` sestaví instalátor a publikuje ho do **Releases** i se souborem `latest.yml`, podle kterého se aplikace aktualizuje. Průběh: záložka **Actions** v repozitáři (zhruba 5–8 minut).

- `npm run release -- patch --dry-run` jen ukáže, co by udělal.
- **Učivo** je v `content/curriculum.json` (etapy → lekce → cíle → klíčové poznatky → očíslované odstavce zdroje). Je součástí aplikace, nové učivo se dostane k ségře s novou verzí. Plán už zahájené lekce se nikdy sám nemění; přegenerovat ho můžeš ve správcovské části.
- **Ikonu** vyměníš tak, že nahradíš `build/icon.ico` (víceúrovňová, min. 256×256) a `build/icon.png` (512×512) a uděláš nové vydání. Zástupná ikona se dá znovu vygenerovat příkazem `npm run icons`.

### Test automatické aktualizace (v1.0.0 → v1.0.1)
1. Nainstaluj **v1.0.0** (`Komensky-Setup-1.0.0.exe` z Releases) a spusť ji. Dole na úvodní obrazovce/v ⚙️ Nastavení není nic o nové verzi.
2. Vydej **v1.0.1** (`npm run release -- patch`) a počkej, až Actions doběhnou a v Releases je `Komensky-Setup-1.0.1.exe` + `latest.yml`.
3. Na počítači s v1.0.0 (a připojením k internetu) aplikaci **spusť znovu** (kontrola je při startu po ~15 s a pak každé 4 hodiny) – nebo v ⚙️ Nastavení klikni **Zkontrolovat aktualizace**.
4. Uvidíš „Stahuji verzi 1.0.1 …“ a potom hlášku **„Je dostupná nová verze 1.0.1 – restartovat a aktualizovat?“** (mimo lekci). Po **Teď** se aplikace restartuje a v ⚙️ Nastavení je **Verze aplikace: 1.0.1**, na úvodní obrazovce je nová ✨ značka verze.
5. Progres zůstane (databáze má migrace, které nikdy nemažou data).

> Aktualizace fungují jen tehdy, když je repozitář **veřejný** (aplikace stahuje z GitHub Releases bez přihlášení). V repozitáři nejsou žádná tajemství: klíč zadává uživatel v aplikaci.

### Podepsání instalátoru (později, nepovinné)
Bez podpisu Windows SmartScreen při prvním spuštění varuje („Přesto spustit“). Podpis odstraní varování až časem podle reputace (EV certifikát hned). Návod je v komentářích v `electron-builder.yml` a `.github/workflows/release.yml` (secrets `CSC_LINK` + `CSC_KEY_PASSWORD`, případně Azure Trusted Signing).

## 5. Odhad ceny jedné 45minutové lekce

Ceník **Gemini 3.8 Live** (za 1 milion tokenů): zvuk vstup **3 $**, zvuk výstup **12 $**, text vstup 0,75 $, text výstup 4,50 $ (zdroj: [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)). Zvuk ≈ 25–32 tokenů za sekundu.

| Položka | Výpočet | Cena |
|---|---|---|
| Učitel mluví ~27 min (60 % lekce) | 27 min × ~1 500 tok/min × 12 $/M | ≈ 0,49 $ |
| Mikrofon otevřený celých 45 min | 45 min × ~1 900 tok/min × 3 $/M | ≈ 0,26 $ |
| Příprava lekce (text, ~5 volání `PREP_MODEL`) | ~30 tis. tokenů | ≈ 0,02–0,05 $ (jednou za lekci) |
| **Základ bez opakovaného započítávání kontextu** | | **≈ 0,8 $ ≈ 18 Kč** |
| Opakované započítání kontextu při každém tahu (viz níže) | | + 0,5 až 2 $ |

**Realistický odhad: zhruba 1–3 $ (25–70 Kč) za lekci, 18 lekcí ≈ 20–50 $ za celý kurz.**

Živé API účtuje **při každém tahu i celý dosavadní kontext relace**, takže cena roste s počtem tahů. Aplikace to zmírňuje agresivní kompresí kontextu (při ~24 tis. tokenů se zkrátí na ~12 tis.; pokyny ke každému kroku posílá aplikace znovu). **Skutečnou spotřebu změříš:** po každé lekci aplikace zapíše do `%APPDATA%\komensky\logs\main.log` řádek `lesson X usage: … ~$1.23` (odhad podle ceníku). Přehled najdeš i v Google AI Studiu → *Usage*. Tento odhad je proto třeba po první skutečné lekci ověřit.
