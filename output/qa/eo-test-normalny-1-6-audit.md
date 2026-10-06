# Audyt testu normalnego EO: tematy 1-6

Data: 6 października 2026. Sprawdzono aktualny PDF `TEST 1-6 NORMALNY.pdf`, pliki kursu i działanie interfejsu z rzeczywistymi lokalnymi API logowania, materiałów i zapisu wyników.

## Najważniejsza przyczyna problemu

Przeglądarka automatycznie wybierała plik WebP zamiast PNG podanego w opisie zadania. W katalogu testu normalnego zostały WebP ze starszego, trudniejszego testu. Uczeń mógł więc widzieć inne polecenie niż to, do którego należał klucz odpowiedzi.

Naprawa: kurs korzysta z dokładnego pliku wskazanego w opisie zadania. Ponownie wygenerowano wszystkie 15 obrazów z aktualnego PDF-u. Pozostawione na potrzeby starszych wersji strony WebP są bezstratne i identyczne z PNG piksel po pikselu.

## Naprawione usterki

| Problem | Zmiana |
| --- | --- |
| Pomieszane obrazy dwóch wersji testu | Aktualne wycinki i jednoznaczny wybór obrazu kursowego. |
| Poprawna cena `12 240 zł` uznawana za błędną | Obsługa spacji, przecinka dziesiętnego i jednostki `zł`; bez zbędnej klawiatury matematycznej w tym polu. |
| Znikający błędny wybór A/B/C/D po powrocie | Przywracanie zapisanej odpowiedzi ucznia oraz poprawnej odpowiedzi. Sprawdzono także P/F. |
| Niewidoczna poprawna odpowiedź w zadaniach z polem | Komunikat przeniesiono poza panel narzędzi ukrywany podczas testu. |
| Podwójne instrukcje do pól odpowiedzi | Pozostawiono tylko instrukcję konkretnego pola. |
| Brak informacji o nieudanym zapisie | Widoczny komunikat i możliwość ponowienia oryginalnego zapisu, również po zmianie zadania. |
| Podsumowanie przed potwierdzonym zapisem ostatniej odpowiedzi | Zakończenie wymaga kompletu wyników potwierdzonych przez serwer. |
| Ryzyko zastąpienia niezapisanego poprawnego wyniku zerem przy końcu czasu | Zakończenie najpierw odzyskuje nieudane zapisy. |
| Przyciski z numerami niewidoczne na poziomym ekranie telefonu | Etykieta sekcji nie zajmuje już całej szerokości paska. |
| Zbędny start licznika dla administratora | Administrator może przeglądać test bez okna rozpoczęcia i odliczania. |

## Obrazy, PDF i klucz

- Obejrzano wszystkie 15 wycinków. Nie zawierają brudnopisu ani belki z numerem zadania; polecenia, wykres i odpowiedzi są kompletne.
- Porównano piksele wszystkich 15 obrazów rzeczywiście wyświetlonych w przeglądarce z właściwymi PNG.
- Porównano wszystkie PNG z odpowiadającymi im WebP: identyczne piksele.
- Po zmianie wyboru formatu sprawdzono także 748 odwołań do obrazów w opisach pozostałych zadań kursowych: wszystkie wskazane pliki istnieją.
- PDF dla ucznia ma osiem stron, wszystkie 15 zadań i nie zawiera dziewiątej strony z kluczem nauczyciela. Render każdej strony jest identyczny z odpowiednią stroną źródłowego PDF-u.
- Niezależnie przeliczono odpowiedzi: **1 A, 2 B, 3 F/P, 4 D, 5 B, 6 P/P, 7 C, 8 F/P, 9 F/P, 10 D, 11: 8, 12: 12240 zł, 13: -1/20, 14 A, 15: 14√2**.
- Maksymalny wynik: **18 punktów za 15 zadań**.

## Wyniki testów

- 41 zestawów testów JavaScript: poprawne.
- 47 testów serwera: poprawne.
- 2 testy integralności obrazów i PDF-u: poprawne.
- 10 scenariuszy przeglądarkowych: poprawne; brak nieobsłużonych błędów JavaScript.
- Pełny poprawny test: 18/18 punktów, 100%, automatyczne podsumowanie i odblokowanie kolejnych lekcji oraz testu trudniejszego.
- Pełny błędny test: 0/18, 0%; kolejne lekcje dostępne, test trudniejszy niedostępny. Odpowiedzi ucznia zachowane po odświeżeniu.
- Sprawdzono 84 poprawne i błędne warianty odpowiedzi liczbowych i pierwiastków, puste pola, niekompletne P/F oraz niepoprawną składnię matematyczną.
- Sprawdzono anulowanie startu, zachowanie terminu po odświeżeniu, koniec czasu, brak powtórnych zapisów oraz blokadę odpowiedzi po terminie.
- Sprawdzono awarię pierwszego i ostatniego zapisu, utratę odpowiedzi serwera po skutecznym zapisie oraz awarię podczas końca czasu.
- Sprawdzono ekran 1440×1000, telefon 390×844 i ekran poziomy 844×390, bez przewijania całej strony w poziomie.

## Pola odpowiedzi w zadaniach otwartych

Zadania 11, 12, 13 i 15 mają po jednym polu wyniku i przycisk zatwierdzenia odpowiedzi, bez samooceny punktowej. Sprawdzanie korzysta z wartości wyrażenia obliczonej przez bibliotekę matematyczną, a nie z zamkniętej listy identycznych zapisów.

- Zadanie 11: m.in. `8`, `08`, `8,0`, `+8`, `16/2`, `2³`.
- Zadanie 12: kwota ze spacjami lub bez, przecinkiem lub kropką dziesiętną, z jednostką `zł`, `zl`, `PLN`, `złotych` albo bez jednostki.
- Zadanie 13: m.in. `-1/20`, `-0,05`, `-(1/20)`, `-2/40`, `1/(-20)` i zapis dzielenia dwukropkiem.
- Zadanie 15: m.in. `14√2`, `14*√(2)`, `7√8`, `√392` i zapis `sqrt`.

Przeglądarkowy test pełnego rozwiązania wykorzystywał również alternatywne zapisy: `8,0`, `12 240,00 PLN`, `−1:20`, `7√8`; wynik pozostał 18/18 punktów. Nie zmieniono poprawnych wartości w kluczu ani wcześniejszych wyników uczniów.

## Pozostałe ograniczenie

**Licznik jest lokalny, a nie serwerowy.** Potwierdzono na tym samym koncie: w nowej przeglądarce niekompletny test nie ma terminu zapisanej wcześniej sesji i ponownie pokazuje okno rozpoczęcia. Wspólny, odporny na zmianę urządzenia limit 60 minut wymaga zapisu sesji testu i kontroli terminu na serwerze. Tego audytu nie należy traktować jako potwierdzenia odporności na celowe obchodzenie limitu czasu.

Nie testowano produkcyjnych kont uczniów, nie resetowano ich wyników i nie opublikowano zmian. Testy korzystały z osobnej, tymczasowej bazy danych. Niezapisane odpowiedzi można ponowić w bieżącej karcie; raport nie zakłada odzyskiwania ich po zamknięciu tej karty.

## Powtórzenie audytu

W katalogu projektu uruchomić `tools/qa/eo-normal-audit-server.py` środowiskiem Pythona z zależnościami serwera, a następnie `tools/qa/eo-normal-browser-audit.cjs` środowiskiem Node z Playwright, Chromium i Sharp. Opcjonalne `DS_QA_NODE_MODULES` wskazuje katalog bibliotek Node. Serwer wiąże się wyłącznie z `127.0.0.1:8793`, sam tworzy odizolowaną bazę i fikcyjne konta. Nie włączać jego pomocniczych tras do produkcji.
