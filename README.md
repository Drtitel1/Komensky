# Komenský – mluvený kurz matematiky pro 3. třídu

Samo se řídící kurz: 5 etap, 18 lekcí. Každá lekce má 5–8 mluvených částí (Gemini píše, ElevenLabs čte),
po každé části kontrolní otázky, na konci závěrečný kvíz. Od 75 % se automaticky pokračuje další lekcí,
pod 75 % přijde krátké opakování jen chybných témat a nový test. Chyby se vracejí jako rozcvička v dalších lekcích.

Vše, co dítě vidí a slyší, je česky. Kód je anglicky.

## Jak to funguje
- **Učivo** (jediný zdroj pravdy): `src/curriculum/stage*.ts` – Etapy → Lekce → cíle → klíčové poznatky → očíslované odstavce zdroje (`Z1`, `Z2`…).
  Každé volání Gemini dostane odstavce dané lekce a systémový prompt, který zakazuje přidávat fakta mimo ně.
  **Zdroj je napsán podle RVP ZV, ne podle konkrétní učebnice – klidně upravte/rozšiřte texty odstavců, vše ostatní se přizpůsobí.**
- **Generování** po malých krocích (serverless limity): plán → každá část → závěrečný kvíz. Každý krok = 1 volání Gemini + samostatná
  fact-check kontrola; při selhání se část znovu vygeneruje (max. 2×), zbylé problémy se logují do `flags` v `lessons/<id>.json`.
  Hotová lekce se uloží a znovu se nikdy negeneruje. Další lekce se předgeneruje na pozadí.
- **Otázky**: klíč, vysvětlení a citace zdroje se ukládají na serveru a prohlížeč je dostane až po odpovědi.
  Výběr z možností se opravuje deterministicky, otevřené odpovědi opraví Gemini (s teplotou 0.1).
- **Audio**: každý úsek (1–3 věty) se převede zvlášť, cache v privátním Vercel Blob podle hashe textu+hlasu+modelu.
  První úsek hraje, jakmile je hotový, ostatní se dotahují dopředu.
- **Postup** (pozice, zvuk, odpovědi, skóre, fronta opakování) se průběžně ukládá do Vercel Blob – pokračuje se na kterémkoli zařízení.

## Rychlost a předgenerování
- Otázky (kontrolní i závěrečný kvíz) vznikají spolu s lekcí a procházejí kontrolou faktů dřív, než je dítě uvidí.
- U krátkých odpovědí se předem vygeneruje seznam přijatelných zápisů; odpověď (i řečená slovy, „dvacet čtyři“) se vyhodnotí okamžitě bez volání AI.
- Ke každé části lekce se na pozadí připraví „opakovací balíček“ (shrnutí + 4 nové otázky, také zkontrolované). Když dítě u závěrečného kvízu neuspěje, opakování je hned – nic se negeneruje.
- Hlas pro celou lekci (výklad i otázky) se převádí na pozadí dopředu; přehrání pak nečeká.

## Hlasová konverzace
- 🎤 u otázek: odpověď hlasem (ElevenLabs Scribe v2 Realtime, přímé spojení z prohlížeče přes jednorázový token, čeština). Krátké odpovědi se odešlou hned.
- 💬 „Zeptej se“: dítě se zeptá hlasem nebo textem, učitel odpoví jen podle látky lekce; odpověď se streamuje a čte se po větách, první věta hraje dřív, než je hotová celá odpověď. „Průběžný rozhovor“ po odpovědi sám znovu zapne mikrofon.

## Nastavení klíčů v aplikaci
Tlačítko ⚙️ v záhlaví: Gemini API klíč, libovolný model Gemini (lze načíst seznam), ElevenLabs klíč, hlas a model (výchozí `eleven_v4`).
Hodnoty se ukládají jen do localStorage prohlížeče a posílají se v hlavičkách na server aplikace; proměnné prostředí slouží jako záloha.

## Proměnné prostředí
Viz `.env.example`. Klíče existují jen na serveru (`GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`).
Názvy modelů se nastavují přes `GEMINI_MODEL`, `GEMINI_CHECK_MODEL`, `ELEVENLABS_MODEL_ID`.
Volitelné `ACCESS_CODE` zamkne aplikaci kódem (chrání kredit API před cizími).

## Lokální vývoj
```
npm i
cp .env.example .env.local   # doplnit klíče; bez BLOB tokenu se data ukládají do ./.data
npm run dev
```
`MOCK_AI=1` spustí aplikaci s falešným Gemini/ElevenLabs (jen pro testování bez klíčů).
`/api/health` ukazuje, co je nastavené (bez hodnot).
