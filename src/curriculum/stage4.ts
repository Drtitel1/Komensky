import type { StageDef } from "./types";

export const stage4: StageDef = {
  id: 4,
  title: "Měření a jednotky",
  description: "Délka, hmotnost, objem, čas a peníze.",
  lessons: [
    {
      id: "4.1",
      title: "Jednotky délky",
      objectives: [
        "Znát jednotky délky mm, cm, dm, m, km.",
        "Převádět mezi jednotkami délky.",
        "Změřit délku pravítkem od nuly.",
      ],
      keyFacts: [
        "1 cm = 10 mm, 1 dm = 10 cm, 1 m = 10 dm = 100 cm, 1 km = 1000 m",
        "3 m = 300 cm",
        "Pravítko přikládáme tak, aby začátek úsečky byl na nule.",
      ],
      passages: [
        { id: "Z1", text: "Délku měříme v jednotkách: milimetr (mm), centimetr (cm), decimetr (dm), metr (m) a kilometr (km). Malé věci měříme v milimetrech a centimetrech, například tužku. Pokoj měříme v metrech a vzdálenost mezi městy v kilometrech." },
        { id: "Z2", text: "Vztahy mezi jednotkami: 1 cm = 10 mm, 1 dm = 10 cm, 1 m = 10 dm, 1 m = 100 cm a 1 km = 1000 m." },
        { id: "Z3", text: "Při převádění větší jednotky na menší násobíme. Například 3 m = 3 · 100 cm = 300 cm a 4 dm = 4 · 10 cm = 40 cm a 5 cm = 5 · 10 mm = 50 mm. Kilometry na metry: 2 km = 2 · 1000 m = 2000 m." },
        { id: "Z4", text: "Při převádění menší jednotky na větší dělíme. Například 200 cm = 200 : 100 m = 2 m a 60 mm = 60 : 10 cm = 6 cm. Číslo 250 cm můžeme zapsat jako 2 m 50 cm." },
        { id: "Z5", text: "Pravítko přikládáme tak, aby začátek měřené úsečky byl přesně na nule. Konec úsečky nám ukáže délku. Na pravítku jsou velké čárky pro centimetry a malé čárky pro milimetry." },
        { id: "Z6", text: "Délky v jedné jednotce sčítáme a odčítáme jako obyčejná čísla: 30 cm + 45 cm = 75 cm. Když jsou jednotky různé, musíme je nejdřív převést na stejnou jednotku: 1 m + 20 cm = 100 cm + 20 cm = 120 cm." },
      ],
    },
    {
      id: "4.2",
      title: "Hmotnost a objem",
      objectives: [
        "Znát jednotky hmotnosti gram a kilogram a jednotky objemu litr a decilitr.",
        "Převádět g na kg a l na dl.",
        "Znát polovinu a čtvrtinu kilogramu a litru.",
      ],
      keyFacts: [
        "1 kg = 1000 g",
        "půl kilogramu = 500 g, čtvrt kilogramu = 250 g",
        "1 l = 10 dl",
        "půl litru = 5 dl",
      ],
      passages: [
        { id: "Z1", text: "Hmotnost měříme na váze. Jednotky hmotnosti jsou gram (g) a kilogram (kg). Jeden kilogram má tisíc gramů: 1 kg = 1000 g." },
        { id: "Z2", text: "Převádění hmotnosti: 2 kg = 2 · 1000 g = 2000 g a 3000 g = 3 kg. Číslo 1500 g zapíšeme jako 1 kg 500 g." },
        { id: "Z3", text: "Půl kilogramu je polovina z tisíce gramů, tedy 500 g. Čtvrt kilogramu je čtvrtina z tisíce gramů, tedy 250 g. Dvě čtvrtě kilogramu jsou 500 g a tři čtvrtě kilogramu jsou 750 g." },
        { id: "Z4", text: "Objem tekutin měříme v litrech (l) a decilitrech (dl). Jeden litr má deset decilitrů: 1 l = 10 dl. Například 3 l = 30 dl a 50 dl = 5 l." },
        { id: "Z5", text: "Půl litru je 5 dl a čtvrt litru je 2 dl a půl decilitru. Jeden litr a půl litru dohromady jsou 15 dl." },
        { id: "Z6", text: "Hmotnost i objem sčítáme a odčítáme s jednotkami stejného druhu: 300 g + 250 g = 550 g a 2 l − 5 dl = 20 dl − 5 dl = 15 dl. Kilogram a gram nebo litr a decilitr nejdřív převedeme na stejnou jednotku." },
        { id: "Z7", text: "Hmotnost a objem nejsou totéž. Hmotnost říká, jak je věc těžká. Objem říká, kolik tekutiny se vejde do nádoby." },
      ],
    },
    {
      id: "4.3",
      title: "Čas a peníze",
      objectives: [
        "Znát vztahy mezi jednotkami času.",
        "Číst čas na hodinách včetně „čtvrt na“, „půl“ a „třičtvrtě na“.",
        "Znát české mince a bankovky a počítat s penězi.",
      ],
      keyFacts: [
        "1 h = 60 min, 1 min = 60 s, 1 den = 24 h, 1 týden = 7 dní, 1 rok = 12 měsíců",
        "čtvrt na tři = 2:15, půl třetí = 2:30, třičtvrtě na tři = 2:45",
        "Mince: 1, 2, 5, 10, 20, 50 Kč; bankovky: 100, 200, 500, 1000, 2000, 5000 Kč",
      ],
      passages: [
        { id: "Z1", text: "Vztahy mezi jednotkami času: 1 hodina (h) = 60 minut (min), 1 minuta = 60 sekund (s), 1 den = 24 hodin, 1 týden = 7 dní a 1 rok = 12 měsíců. Rok má 365 dní a přestupný rok má 366 dní." },
        { id: "Z2", text: "Půl hodiny je 30 minut a čtvrt hodiny je 15 minut. Tři čtvrtě hodiny je 45 minut." },
        { id: "Z3", text: "Dny v týdnu: pondělí, úterý, středa, čtvrtek, pátek, sobota, neděle. Měsíce v roce: leden, únor, březen, duben, květen, červen, červenec, srpen, září, říjen, listopad, prosinec." },
        { id: "Z4", text: "Čas na hodinách říkáme několika způsoby. Čas 2:15 říkáme „čtvrt na tři“. Čas 2:30 říkáme „půl třetí“. Čas 2:45 říkáme „třičtvrtě na tři“. Čas 3:00 říkáme „tři hodiny“. Slova čtvrt, půl a třičtvrtě se vždy vztahují k příští hodině." },
        { id: "Z5", text: "Krátká ručička na hodinách ukazuje hodiny a dlouhá ručička ukazuje minuty. Když dlouhá ručička ukazuje na číslici 12, je celá hodina. Na číslici 3 je čtvrt hodiny po celé (15 minut), na číslici 6 je půl hodiny (30 minut) a na číslici 9 je 45 minut." },
        { id: "Z6", text: "Odpoledne se čas často zapisuje ve 24hodinovém tvaru: po 12. hodině pokračujeme 13, 14, 15... až 24. Například 15:00 je tři hodiny odpoledne a 18:30 je půl sedmé večer." },
        { id: "Z7", text: "Platíme českými korunami (Kč). Mince mají hodnoty 1 Kč, 2 Kč, 5 Kč, 10 Kč, 20 Kč a 50 Kč. Bankovky mají hodnoty 100 Kč, 200 Kč, 500 Kč, 1000 Kč, 2000 Kč a 5000 Kč. Jedna koruna se dělí na 100 haléřů." },
        { id: "Z8", text: "Když platíme větší částkou, než stojí zboží, prodavač nám vrátí rozdíl. Zaplatíme-li za věc za 37 Kč bankovkou 50 Kč, dostaneme zpět 50 − 37 = 13 Kč." },
      ],
    },
  ],
};
