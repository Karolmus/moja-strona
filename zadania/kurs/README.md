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
