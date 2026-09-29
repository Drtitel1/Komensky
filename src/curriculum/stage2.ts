import type { StageDef } from "./types";

export const stage2: StageDef = {
  id: 2,
  title: "Čísla do 1000",
  description: "Řády, čtení a zápis, porovnávání, zaokrouhlování, sčítání a odčítání do 1000.",
  lessons: [
    {
      id: "2.1",
      title: "Čísla do 1000: stovky, desítky, jednotky",
      objectives: [
        "Číst a zapisovat trojmístná čísla.",
        "Rozložit číslo na stovky, desítky a jednotky.",
        "Vědět, že 10 desítek je 100 a 10 stovek je 1000.",
      ],
      keyFacts: [
        "10 jednotek = 1 desítka, 10 desítek = 1 stovka, 10 stovek = 1000",
        "Trojmístná čísla jsou 100 až 999.",
        "345 = 300 + 40 + 5",
        "Nula ve středu čísla znamená prázdný řád: 306 má 0 desítek.",
      ],
      passages: [
        { id: "Z1", text: "Číslice v čísle mají různou hodnotu podle místa, na kterém stojí. Zprava doleva jsou to jednotky, desítky a stovky. Deset jednotek je jedna desítka, deset desítek je jedna stovka a deset stovek je tisíc: 1000." },
        { id: "Z2", text: "Čísla od 100 do 999 mají tři číslice a říká se jim trojmístná čísla. Číslo 345 má 3 stovky, 4 desítky a 5 jednotek. Rozložíme ho takto: 345 = 300 + 40 + 5." },
        { id: "Z3", text: "Nula v čísle znamená, že v daném řádu nic není. Číslo 306 má 3 stovky, 0 desítek a 6 jednotek: 306 = 300 + 6. Číslo 450 má 4 stovky, 5 desítek a 0 jednotek." },
        { id: "Z4", text: "Čtení celých stovek: 100 sto, 200 dvě stě, 300 tři sta, 400 čtyři sta, 500 pět set, 600 šest set, 700 sedm set, 800 osm set, 900 devět set, 1000 tisíc." },
        { id: "Z5", text: "Trojmístné číslo čteme od stovek k jednotkám. Číslo 528 čteme pět set dvacet osm. Číslo 704 čteme sedm set čtyři. Číslo 999 čteme devět set devadesát devět." },
        { id: "Z6", text: "Nejmenší trojmístné číslo je 100 a největší trojmístné číslo je 999. Číslo o jedna větší než 999 je 1000." },
        { id: "Z7", text: "Počítání po stovkách: 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000. Počítání po desítkách: 310, 320, 330, 340..." },
      ],
    },
    {
      id: "2.2",
      title: "Porovnávání, číselná osa a zaokrouhlování",
      objectives: [
        "Porovnat dvě čísla do 1000 znaky <, > a =.",
        "Znázornit číslo na číselné ose.",
        "Zaokrouhlit číslo na desítky a na stovky.",
      ],
      keyFacts: [
        "Porovnáváme od nejvyššího řádu (od stovek).",
        "Znak < znamená menší, > znamená větší.",
        "Zaokrouhlování: číslice 0–4 dolů, číslice 5–9 nahoru.",
        "Zaokrouhlení na desítky se řídí jednotkami, na stovky se řídí desítkami.",
      ],
      passages: [
        { id: "Z1", text: "Trojmístná čísla porovnáváme od nejvyššího řádu, tedy od stovek. Větší je to číslo, které má víc stovek. Když mají stejně stovek, porovnáme desítky. Když mají stejně i desítek, porovnáme jednotky. Například 472 > 458, protože stovky jsou stejné (4), ale 7 desítek je víc než 5 desítek." },
        { id: "Z2", text: "Znaky pro porovnávání: znak < znamená „je menší než“, znak > znamená „je větší než“ a znak = znamená „je rovno“. Otevřená strana znaku míří k většímu číslu. Zapisujeme 250 < 520, 700 > 699 a 300 = 300." },
        { id: "Z3", text: "Číselná osa je přímka, na které jsou čísla seřazená podle velikosti. Čísla rostou zleva doprava. Číslo, které leží víc vpravo, je větší. Každé číslo má na ose své místo a mezi sousedními značkami je vždy stejná vzdálenost." },
        { id: "Z4", text: "Sousední čísla: číslo před číslem 500 je 499 a číslo po čísle 500 je 501. Sousední stovky čísla 450 jsou 400 a 500. Sousední desítky čísla 47 jsou 40 a 50." },
        { id: "Z5", text: "Zaokrouhlování na desítky: podíváme se na jednotky. Jsou-li jednotky 0, 1, 2, 3 nebo 4, zaokrouhlujeme dolů. Jsou-li jednotky 5, 6, 7, 8 nebo 9, zaokrouhlujeme nahoru. Například 42 zaokrouhlíme na 40, číslo 47 na 50 a číslo 45 na 50." },
        { id: "Z6", text: "Zaokrouhlování na stovky: podíváme se na desítky. Jsou-li desítky 0 až 4, zaokrouhlujeme dolů, jsou-li 5 až 9, zaokrouhlujeme nahoru. Například 340 zaokrouhlíme na 300, číslo 372 na 400, číslo 350 na 400 a číslo 649 na 600." },
        { id: "Z7", text: "Zaokrouhlené číslo používáme, když chceme jen přibližný výsledek. Znak přibližné rovnosti je ≈. Například 48 ≈ 50." },
      ],
    },
    {
      id: "2.3",
      title: "Sčítání a odčítání zpaměti do 1000",
      objectives: [
        "Sčítat a odčítat celé stovky a desítky zpaměti.",
        "Počítat s přechodem přes desítku a stovku.",
        "Znát pojmy sčítanec, součet, menšenec, menšitel, rozdíl.",
        "Zkoušet sčítání odčítáním a naopak.",
      ],
      keyFacts: [
        "300 + 400 = 700, 900 − 200 = 700",
        "Sčítanec + sčítanec = součet",
        "Menšenec − menšitel = rozdíl",
        "Zkouška: 45 + 30 = 75 a 75 − 30 = 45",
      ],
      passages: [
        { id: "Z1", text: "Celé stovky sčítáme a odčítáme jako obyčejná čísla, jen přidáme slovo stovky. Tři stovky plus čtyři stovky je sedm stovek: 300 + 400 = 700. Devět stovek minus dvě stovky je sedm stovek: 900 − 200 = 700." },
        { id: "Z2", text: "Celé desítky sčítáme podobně: 30 + 50 = 80, 70 + 60 = 130 a 120 − 40 = 80. K trojmístnému číslu přičteme desítky takto: 356 + 20 = 376 a 356 − 20 = 336." },
        { id: "Z3", text: "Při sčítání s přechodem přes desítku doplníme nejprve na celou desítku. Například 78 + 5: 78 + 2 = 80 a zbývá přičíst ještě 3, tedy 80 + 3 = 83." },
        { id: "Z4", text: "Přechod přes stovku počítáme podobně. Například 195 + 7: 195 + 5 = 200 a zbývá přičíst 2, tedy 202. Při odčítání 402 − 5 nejprve odečteme 2 do 400 a pak ještě 3, takže 402 − 5 = 397." },
        { id: "Z5", text: "Názvy čísel při sčítání: sčítanec + sčítanec = součet. V příkladu 45 + 30 = 75 jsou sčítanci 45 a 30 a součet je 75." },
        { id: "Z6", text: "Názvy čísel při odčítání: menšenec − menšitel = rozdíl. V příkladu 75 − 30 = 45 je menšenec 75, menšitel 30 a rozdíl 45." },
        { id: "Z7", text: "Sčítání a odčítání jsou opačné operace, proto se zkoušejí navzájem. Sčítání zkoušíme odčítáním: 45 + 30 = 75, protože 75 − 30 = 45. Odčítání zkoušíme sčítáním: 75 − 30 = 45, protože 45 + 30 = 75." },
        { id: "Z8", text: "Při sčítání můžeme sčítance vyměnit a součet se nezmění: 200 + 35 = 35 + 200 = 235. Při odčítání vyměnit čísla nelze: 7 − 3 není stejné jako 3 − 7." },
      ],
    },
    {
      id: "2.4",
      title: "Písemné sčítání a odčítání",
      objectives: [
        "Zapsat čísla pod sebe podle řádů.",
        "Písemně sečíst trojmístná čísla s přechodem přes desítku a stovku.",
        "Písemně odečíst trojmístná čísla s půjčováním.",
        "Provést zkoušku.",
      ],
      keyFacts: [
        "Číslice píšeme pod sebe: jednotky pod jednotky, desítky pod desítky, stovky pod stovky.",
        "Počítáme zprava, od jednotek.",
        "258 + 167 = 425",
        "421 − 156 = 265",
      ],
      passages: [
        { id: "Z1", text: "Při písemném sčítání a odčítání píšeme čísla pod sebe tak, aby jednotky byly pod jednotkami, desítky pod desítkami a stovky pod stovkami. Pod výsledek nakreslíme čáru. Počítáme vždy zprava, tedy od jednotek." },
        { id: "Z2", text: "Písemné sčítání 258 + 167. Jednotky: 8 + 7 = 15, napíšeme 5 a jednu desítku si pamatujeme. Desítky: 5 + 6 + 1 = 12, napíšeme 2 a jednu stovku si pamatujeme. Stovky: 2 + 1 + 1 = 4. Součet je 425." },
        { id: "Z3", text: "Když je součet číslic v některém řádu deset nebo víc, napíšeme jen jednotky z tohoto součtu a desítku přičteme k vyššímu řádu. Tomu říkáme přechod." },
        { id: "Z4", text: "Písemné odčítání 421 − 156. Jednotky: 1 − 6 nejde, proto si půjčíme jednu desítku (deset jednotek) a počítáme 11 − 6 = 5. Desítky: teď zbyla jen 1 desítka, 1 − 5 nejde, proto si půjčíme jednu stovku a počítáme 11 − 5 = 6. Stovky: zbyly 3 stovky, 3 − 1 = 2. Rozdíl je 265." },
        { id: "Z5", text: "Když odčítáme, nikdy nemůžeme v řádu odečíst větší číslici od menší. Musíme si půjčit jednu jednotku z vyššího řádu. Ten vyšší řád pak má o jedničku méně." },
        { id: "Z6", text: "Zkouška písemného sčítání: od součtu odečteme jednoho sčítance a musí vyjít druhý sčítanec. Zkouška písemného odčítání: k rozdílu přičteme menšitele a musí vyjít menšenec. Například 265 + 156 = 421." },
        { id: "Z7", text: "Další příklady: 347 + 285 = 632, 500 − 237 = 263, 613 + 189 = 802 a 800 − 456 = 344." },
      ],
    },
  ],
};
