import type { StageDef } from "./types";

export const stage3: StageDef = {
  id: 3,
  title: "Dělení se zbytkem a slovní úlohy",
  description: "Dělení se zbytkem a řešení slovních úloh.",
  lessons: [
    {
      id: "3.1",
      title: "Dělení se zbytkem",
      objectives: [
        "Poznat, kdy se dělení neuskuteční beze zbytku.",
        "Vypočítat podíl a zbytek v oboru násobilky.",
        "Vědět, že zbytek je vždy menší než dělitel.",
        "Udělat zkoušku dělení se zbytkem.",
      ],
      keyFacts: [
        "14 : 4 = 3 zb. 2",
        "Zbytek je vždy menší než dělitel.",
        "Zkouška: 3 · 4 + 2 = 14",
        "Dělení beze zbytku má zbytek 0.",
      ],
      passages: [
        { id: "Z1", text: "Některá čísla se nedají rozdělit beze zbytku. Když chceme rozdělit 14 bonbónů do sáčků po 4, naplníme 3 sáčky a 2 bonbóny nám zbydou. Zapisujeme 14 : 4 = 3 zbytek 2, zkráceně 14 : 4 = 3 zb. 2." },
        { id: "Z2", text: "Postup při dělení se zbytkem: najdeme v násobilce dělitele nejbližší výsledek, který je menší než dělenec nebo se mu rovná. Počet násobků je podíl. Rozdíl mezi dělencem a tímto násobkem je zbytek. U příkladu 14 : 4 je nejbližší výsledek 12, protože 3 · 4 = 12. Zbytek je 14 − 12 = 2." },
        { id: "Z3", text: "Zbytek je vždy menší než dělitel. Když dělíme čtyřmi, může být zbytek jen 0, 1, 2 nebo 3. Kdyby zbytek byl 4 nebo víc, mohli bychom do dalšího sáčku ještě jednu skupinu nabrat." },
        { id: "Z4", text: "Když je zbytek nula, dělíme beze zbytku. Například 12 : 4 = 3 a zbytek je 0." },
        { id: "Z5", text: "Zkouška dělení se zbytkem: podíl vynásobíme dělitelem a přičteme zbytek. Musí vyjít dělenec. U příkladu 14 : 4 = 3 zb. 2 zkontrolujeme 3 · 4 + 2 = 12 + 2 = 14." },
        { id: "Z6", text: "Další příklady: 23 : 5 = 4 zb. 3, protože 4 · 5 = 20 a 23 − 20 = 3. Dále 29 : 6 = 4 zb. 5, protože 4 · 6 = 24 a 29 − 24 = 5. A také 30 : 7 = 4 zb. 2, protože 4 · 7 = 28 a 30 − 28 = 2." },
        { id: "Z7", text: "Příklad ze života: 17 jablek rozdělíme do košíků po 5. Naplníme 3 košíky, protože 3 · 5 = 15, a zbudou 2 jablka. Zapisujeme 17 : 5 = 3 zb. 2." },
      ],
    },
    {
      id: "3.2",
      title: "Slovní úlohy: o několik více či méně, několikrát více či méně",
      objectives: [
        "Rozlišit „o několik“ (sčítání a odčítání) a „několikrát“ (násobení a dělení).",
        "Zapsat řešení slovní úlohy: zápis, výpočet, odpověď.",
        "Vyřešit úlohy typu „o kolik více“.",
      ],
      keyFacts: [
        "o 5 více → sčítáme, o 5 méně → odčítáme",
        "5krát více → násobíme, 5krát méně → dělíme",
        "Postup: zápis, otázka, výpočet, odpověď celou větou",
        "„O kolik více?“ → odčítáme",
      ],
      passages: [
        { id: "Z1", text: "Postup při řešení slovní úlohy: 1. pozorně přečteme text, 2. vypíšeme známé údaje a otázku, 3. vybereme početní operaci a spočítáme, 4. zkontrolujeme, zda výsledek dává smysl, 5. napíšeme odpověď celou větou." },
        { id: "Z2", text: "Slova „o několik více“ znamenají sčítání a „o několik méně“ znamenají odčítání. Petr má 12 kuliček a Jana má o 5 kuliček víc než Petr. Janě patří 12 + 5 = 17 kuliček. Kdyby měla o 5 méně, měla by 12 − 5 = 7 kuliček." },
        { id: "Z3", text: "Slova „několikrát více“ znamenají násobení a „několikrát méně“ znamenají dělení. Adam má 6 nálepek a Eva jich má 4krát víc. Eva má 4 · 6 = 24 nálepek. Kdyby Eva měla 24 nálepek a Adam jich měl 4krát méně, Adam by měl 24 : 4 = 6 nálepek." },
        { id: "Z4", text: "Rozdíl mezi „o“ a „krát“: „o 3 víc“ znamená přidat 3, ale „3krát víc“ znamená vzít trojnásobek. Když má Anna 5 korálků, o 3 víc je 5 + 3 = 8 korálků, ale 3krát víc je 3 · 5 = 15 korálků." },
        { id: "Z5", text: "Otázka „o kolik je jedno číslo větší než druhé“ se řeší odčítáním. Petr má 17 kuliček a Jana 12 kuliček. O kolik má Petr víc? Vypočítáme 17 − 12 = 5. Petr má o 5 kuliček víc." },
        { id: "Z6", text: "Odpověď píšeme celou větou a s jednotkou nebo s tím, co jsme počítali. Například: Jana má 17 kuliček." },
      ],
    },
    {
      id: "3.3",
      title: "Slovní úlohy o dvou krocích",
      objectives: [
        "Poznat úlohu, která se řeší dvěma výpočty.",
        "Najít mezivýsledek a pak konečný výsledek.",
        "Zkontrolovat výsledek zpětným dosazením do zadání.",
      ],
      keyFacts: [
        "Dvoukroková úloha: nejdřív mezivýsledek, potom výsledek.",
        "4 řady po 6 dětech: 4 · 6 = 24",
        "Výsledek zkontrolujeme dosazením do zadání a odhadem.",
      ],
      passages: [
        { id: "Z1", text: "Některé slovní úlohy nejde vyřešit jedním výpočtem. Musíme nejdřív zjistit mezivýsledek a pak pomocí něj dopočítat výsledek. Takovým úlohám říkáme úlohy o dvou krocích." },
        { id: "Z2", text: "Příklad: V sále jsou 4 řady po 6 židlích. Na 3 židlích nikdo nesedí. Kolik židlí je obsazených? První krok: všech židlí je 4 · 6 = 24. Druhý krok: obsazených je 24 − 3 = 21. Odpověď: Obsazených je 21 židlí." },
        { id: "Z3", text: "Příklad: Máma koupila 3 sešity po 12 korunách a tužku za 8 korun. Kolik korun zaplatila? První krok: sešity stály 3 · 12 = 36 korun. Druhý krok: dohromady zaplatila 36 + 8 = 44 korun. Odpověď: Zaplatila 44 korun." },
                { id: "Z4", text: "Příklad: Ve třídě je 24 dětí. Rozdělíme je do skupin po 6 dětech a každá skupina dostane 2 míče. Kolik míčů je potřeba? První krok: skupin je 24 : 6 = 4. Druhý krok: míčů je 4 · 2 = 8. Odpověď: Je potřeba 8 míčů." },
        { id: "Z5", text: "Kontrola výsledku: nejdřív odhadneme, jak velký výsledek má být. Potom výsledek dosadíme zpátky do zadání a zjistíme, jestli sedí. U příkladu se židlemi: 21 obsazených plus 3 volné je 24 židlí a 4 řady po 6 židlích je také 24." },
        { id: "Z6", text: "Do zápisu úlohy o dvou krocích píšeme oba výpočty pod sebe, každý s otázkou nebo poznámkou, co jsme jím zjistili. Na konci napíšeme odpověď celou větou." },
      ],
    },
  ],
};
