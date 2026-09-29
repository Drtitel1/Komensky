import type { StageDef } from "./types";

export const stage5: StageDef = {
  id: 5,
  title: "Geometrie",
  description: "Body, přímky, úsečky, geometrické tvary a obvod.",
  lessons: [
    {
      id: "5.1",
      title: "Bod, přímka, polopřímka a úsečka",
      objectives: [
        "Rozlišit bod, přímku, polopřímku a úsečku.",
        "Správně označovat geometrické útvary písmeny.",
        "Narýsovat a změřit úsečku.",
      ],
      keyFacts: [
        "Bod označujeme velkým tiskacím písmenem: A.",
        "Přímka nemá začátek ani konec; označujeme ji malým písmenem: p.",
        "Polopřímka má začátek, ale nemá konec.",
        "Úsečka má začátek i konec a má délku: AB.",
      ],
      passages: [
        { id: "Z1", text: "Bod je nejmenší geometrický útvar. Značíme ho křížkem a označujeme ho velkým tiskacím písmenem, například bod A nebo bod B." },
        { id: "Z2", text: "Přímka je rovná čára, která nemá začátek ani konec. Pokračuje na obě strany donekonečna. Rýsujeme ji ostrou tužkou podle pravítka a označujeme ji malým písmenem, například přímka p. Obvykle ji kreslíme přes celou šířku papíru." },
        { id: "Z3", text: "Polopřímka je rovná čára, která má začátek, ale nemá konec. Začíná v bodě a pokračuje jedním směrem donekonečna. Začátek polopřímky označíme velkým písmenem, například polopřímka AB začíná v bodě A." },
        { id: "Z4", text: "Úsečka je rovná čára, která má začátek i konec. Její krajní body označíme velkými písmeny, například úsečka AB. Úsečka má délku, kterou můžeme změřit pravítkem." },
        { id: "Z5", text: "Dvěma různými body vždy prochází právě jedna přímka. Když dva body A a B spojíme pravítkem, dostaneme buď úsečku AB, když se zastavíme v bodech, nebo přímku AB, když čáru prodloužíme na obě strany." },
        { id: "Z6", text: "Rýsování úsečky délky 5 cm: ostrou tužkou označíme bod A, přiložíme pravítko tak, aby nula byla přesně v bodě A, u značky 5 cm označíme bod B a bod A spojíme s bodem B podle pravítka. Úsečka AB má délku 5 cm." },
        { id: "Z7", text: "Rýsujeme vždy ostrou tužkou a s pravítkem. Čáry nekreslíme od ruky, protože by nebyly rovné." },
      ],
    },
    {
      id: "5.2",
      title: "Rovnoběžky, různoběžky a základní tvary",
      objectives: [
        "Rozlišit rovnoběžky, různoběžky a kolmice.",
        "Poznat trojúhelník, čtverec, obdélník, kružnici a kruh.",
        "Znát pojmy poloměr a průměr kružnice.",
      ],
      keyFacts: [
        "Rovnoběžky se nikdy neprotnou.",
        "Různoběžky mají jeden společný bod – průsečík.",
        "Kolmice jsou různoběžky, které svírají pravý úhel.",
        "Čtverec: 4 stejné strany a 4 pravé úhly. Obdélník: 4 pravé úhly, protější strany stejné.",
        "Průměr = 2 · poloměr",
      ],
      passages: [
        { id: "Z1", text: "Rovnoběžky jsou dvě přímky, které se nikdy neprotnou. Mají celou dobu stejnou vzdálenost. Kolejnice u vlaku jsou rovnoběžné." },
        { id: "Z2", text: "Různoběžky jsou dvě přímky, které se protnou v jednom bodě. Tomuto společnému bodu říkáme průsečík." },
        { id: "Z3", text: "Kolmice jsou zvláštní různoběžky. Když se protnou, svírají pravý úhel. Pravý úhel poznáme podle rohu trojúhelníku s ryskou nebo podle rohu papíru. Označujeme ho čtverečkem v úhlu." },
        { id: "Z4", text: "Trojúhelník má 3 strany, 3 vrcholy a 3 úhly. Čtyřúhelník má 4 strany, 4 vrcholy a 4 úhly. Čtverec i obdélník jsou čtyřúhelníky." },
        { id: "Z5", text: "Čtverec má všechny čtyři strany stejně dlouhé a čtyři pravé úhly. Obdélník má čtyři pravé úhly a protější strany stejně dlouhé. Každý čtverec je zároveň obdélník, ale ne každý obdélník je čtverec." },
        { id: "Z6", text: "Kružnice je zakřivená čára, jejíž všechny body jsou stejně daleko od středu. Rýsujeme ji kružítkem. Kruh je plocha uvnitř kružnice. Kružnice je jen čára, kruh je celá plocha." },
        { id: "Z7", text: "Poloměr kružnice je vzdálenost od středu kružnice k bodu na kružnici. Průměr je úsečka, která prochází středem a spojuje dva body na kružnici. Průměr je dvakrát delší než poloměr: průměr = 2 · poloměr. Když je poloměr 3 cm, je průměr 6 cm." },
      ],
    },
    {
      id: "5.3",
      title: "Obvod trojúhelníku, čtverce a obdélníku",
      objectives: [
        "Vysvětlit, co je obvod.",
        "Vypočítat obvod trojúhelníku, čtverce a obdélníku sečtením stran.",
        "Použít zkrácený výpočet pomocí násobení.",
      ],
      keyFacts: [
        "Obvod je součet délek všech stran.",
        "Čtverec o straně a: o = 4 · a",
        "Obdélník o stranách a, b: o = 2 · a + 2 · b",
        "Všechny strany musí být ve stejných jednotkách.",
      ],
      passages: [
        { id: "Z1", text: "Obvod je délka čáry kolem celého útvaru. U útvaru s rovnými stranami je obvod součet délek všech stran. Obvod značíme malým písmenem o." },
        { id: "Z2", text: "Obvod trojúhelníku se stranami a, b, c je o = a + b + c. Například trojúhelník se stranami 5 cm, 6 cm a 7 cm má obvod 5 + 6 + 7 = 18 cm." },
        { id: "Z3", text: "Čtverec má čtyři stejné strany. Obvod čtverce se stranou a je o = a + a + a + a = 4 · a. Čtverec o straně 7 cm má obvod 4 · 7 = 28 cm." },
        { id: "Z4", text: "Obdélník má dvě dvojice stejných stran. Obvod obdélníku o stranách a a b je o = a + b + a + b = 2 · a + 2 · b. Obdélník o stranách 6 cm a 3 cm má obvod 6 + 3 + 6 + 3 = 18 cm, nebo 2 · 6 + 2 · 3 = 12 + 6 = 18 cm." },
        { id: "Z5", text: "Než sečteme strany, musí mít všechny stejnou jednotku. Když je jedna strana v centimetrech a druhá v milimetrech, jednu z nich nejdřív převedeme. Obvod píšeme s jednotkou délky, například cm nebo m." },
        { id: "Z6", text: "Příklad ze života: zahrada tvaru obdélníku má strany 10 m a 4 m. Plot kolem celé zahrady bude dlouhý 2 · 10 + 2 · 4 = 20 + 8 = 28 m. Obvod měříme v jednotkách délky, ne v jednotkách obsahu." },
      ],
    },
  ],
};
