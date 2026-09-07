# Zadania kursowe

Zadania kursowe korzystaja z tego samego formatu co zadania egzaminacyjne:

- plik JSON zawiera liste zadan,
- obrazy PNG zadan leza w tym samym folderze co JSON,
- pole `file` wskazuje nazwe obrazu zadania,
- opcjonalne pole `contextFile` wskazuje obraz z informacja wspolna do zadania,
- wymagane pola pozostaja takie same jak w arkuszach: `difficulty`, `topic`, `level`, `hint`, `answer`.

Foldery poziomow:

- `mp` - matura podstawowa,
- `mr` - matura rozszerzona,
- `eo` - egzamin osmoklasisty.

Lekcje kursowe najlepiej trzymac w osobnych podfolderach poziomu, np.
`eo/lekcja_2/`. Wtedy kazda lekcja moze miec wlasny plik JSON, PDF z materialem
zrodlowym oraz obrazy zadan.

## Praca domowa i odpowiedzi

Widok kursu w `zadania.html` wczytuje tylko zadania z
`coursePart: "praca_domowa"` (lub starszym polem `section` o tej samej wartosci).
Czesc glowna pozostaje w plikach, ale nie trafia do nawigacji ani podsumowan.

Zadanie z `type: "input"` moze miec kilka pol w tablicy `inputs`:

```json
{
  "type": "input",
  "inputs": [
    { "label": "1. miejsce", "options": ["a", "b", "c", "d"], "answer": "b" },
    { "label": "Wynik", "answer": "-15", "inputMode": "text" }
  ]
}
```

- `options` zmienia pole tekstowe na liste wyboru.
- `answer` wskazuje jedna odpowiedz, `answers` liste dopuszczalnych odpowiedzi.
- `inputMode` domyslnie ma wartosc `decimal`; `text` daje dostep do minusa
  na klawiaturze telefonu.
- `exact: true` wymaga dokladnej wartosci dziesietnej, bez tolerancji numerycznej.
  Kropka i przecinek sa rownowazne, a koncowy znak `%` jest opcjonalny.
- Pola z liczbowymi odpowiedziami dostaja przyciski pierwiastkow, ulamka i potegi
  oraz podglad MathML. `math: true` wlacza je takze jawnie dla wyrazen.
  Przyklady zapisu: `sqrt(2)`, `cbrt(-27)`, `1/2`, `(sqrt(2)-21)/5`,
  `root(256;4)`. W funkcji `root` argumenty oddziela srednik, poniewaz przecinek
  sluzy do zapisu liczb dziesietnych.
- Bledny skladniowo zapis nie zuzywa proby. Rownowazne wyrazenia liczbowe
  sa porownywane lokalnie przez ograniczony parser math.js, bez wysylania na serwer.
- `instruction` na poziomie zadania wyswietla dodatkowe polecenie pod obrazem.

Puste pola nie zaliczaja proby. Testy uruchamiane z katalogu projektu:

```sh
node tests/course-answers.test.cjs
node tests/course-homework.test.cjs
node tests/exam-sources.test.cjs
node tests/course-math.test.cjs
```
