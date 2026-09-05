from __future__ import annotations

import argparse
import csv
import itertools
import json
import re
import shutil
import subprocess
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import pdfplumber
from PIL import Image, ImageChops, ImageOps


ROOT = Path(__file__).resolve().parents[2]
PACKAGE = Path(
    "/Users/karolmusiol/Downloads/paczka_matematyka_CKE/"
    "Paczka_matematyka_CKE_GOTOWA"
)
REPAIRED = ROOT / "tmp/pdfs/repaired-package"

RESOLUTION = 180
SCALE = RESOLUTION / 72
TASK_X0 = {"mp": 48, "mr": 48, "eo": 48}
TASK_RIGHT_MARGIN = 48
KEY_X0 = 54
SIDE_MARGIN = 54
PAGE_TOP = 42
PAGE_BOTTOM_MARGIN = 66

DASHES = "–−-"
TASK_HEADER_RE = re.compile(
    rf"Zadani[ae]\s+(\d+(?:\.\d+)?)\.\s*\(\s*0\s*[{DASHES}]\s*(\d+)\s*\)",
    re.IGNORECASE,
)
TASK_POINTS_RE = re.compile(
    r"Zadani[ae]\s+(\d+(?:\.\d+)?)\.\s*\(\s*(\d+)\s*pkt\.?\s*\)",
    re.IGNORECASE,
)
PAGE_FOOTER_RE = re.compile(
    r"^(?:strona\s+\d+\s+z\s+\d+|(?:©\s*)?cke(?:\s+\d{4})?|eduarkusze\.pl|[a-z]{2,}_[a-z0-9_]+)$",
    re.IGNORECASE,
)
PARENT_HEADER_RE = re.compile(r"Zadanie\s+(\d+)\.\s*$", re.IGNORECASE)
SHORT_KEY_HEADERS_RE = re.compile(
    r"^\s*(?:(?:Zad(?:anie)?|Zadania)\s+\d+(?:\.\d+)?\.\s*)+$",
    re.IGNORECASE,
)
SHORT_KEY_HEADER_ITEM_RE = re.compile(
    r"\b(?:Zad(?:anie)?|Zadania)\s+(\d+(?:\.\d+)?)\.",
    re.IGNORECASE,
)
ANSWER_CODE_RE = re.compile(r"^(?:[A-E]|[A-E]{2}|[PF]{2}|[A-E]\d)$")

EXAM_META = {
    "01_matura_podstawowa": ("mp", "matura_podstawowa", "p", "Matura podstawowa"),
    "02_matura_rozszerzona": ("mr", "matura_rozszerzona", "r", "Matura rozszerzona"),
    "03_egzamin_osmoklasisty": ("eo", "egzamin_osmoklasisty", "o", "Egzamin ósmoklasisty"),
}

TERM_PREFIX = {
    "main": "01_glowny_",
    "additional": "02_dodatkowy_",
    "resit": "03_poprawkowy_",
}

TERM_LABEL = {
    "main": "",
    "additional": "termin dodatkowy",
    "resit": "termin poprawkowy",
}

MONTH_LABELS = {
    "kwiecien": "kwiecień",
    "maj": "maj",
    "czerwiec": "czerwiec",
    "lipiec": "lipiec",
    "sierpien": "sierpień",
    "wrzesien": "wrzesień",
}

MONTH_CODES = {
    "kwiecien": "k",
    "maj": "m",
    "czerwiec": "c",
    "lipiec": "l",
    "sierpien": "s",
    "wrzesien": "w",
}

TERM_CODES = {"main": "g", "additional": "d", "resit": "p"}

REPAIRED_SOURCES = {
    ("01_matura_podstawowa", 2015, "main", "2015"): REPAIRED / "mp/2015/maj",
    ("01_matura_podstawowa", 2015, "additional", "2015"): REPAIRED / "mp/2015/czerwiec",
    ("01_matura_podstawowa", 2015, "resit", "2015"): REPAIRED / "mp/2015/sierpien",
    ("02_matura_rozszerzona", 2015, "main", "2015"): REPAIRED / "mr/2015/maj",
    ("02_matura_rozszerzona", 2015, "additional", "2015"): REPAIRED / "mr/2015/czerwiec",
    ("02_matura_rozszerzona", 2019, "additional", "2015"): REPAIRED / "mr/2019/czerwiec",
    ("02_matura_rozszerzona", 2026, "main", "2023"): REPAIRED / "mr/2026/maj_f2023",
}

# The main May 2021 eighth-grade set is already present in the project.
SKIPPED_SESSIONS = {("03_egzamin_osmoklasisty", 2021, "main", "")}

# Kolejność odpowiada priorytetowi głównego tematu zadania. Reguły są celowo
# wąskie: tag ma opisywać zagadnienie, a nie każde słowo wspomniane w rozwiązaniu.
# Te reguły wychwytują konkretny podtemat zanim zostanie dodana jego szersza
# kategoria. Korzystamy wyłącznie z pojęć obecnych w treści zadania, aby filtr
# nie mieszał zadań pokrewnych, ale innych merytorycznie.
SPECIFIC_TAG_RULES = [
    ("procent składany", (r"\bprocent\w* skladan",)),
    ("średnia arytmetyczna", (r"\bsredni\w* arytmetycz",)),
    ("średnia ważona", (r"\bsredni\w* wazona",)),
    ("mediana", (r"\bmedian\w*",)),
    ("dominanta", (r"\bdominant\w*",)),
    ("NWD", (r"\bnwd\b", r"\bnajwieksz\w* wspoln\w* dzielnik")),
    ("NWW", (r"\bnww\b", r"\bnajmniejsz\w* wspoln\w* wielokrotn")),
    ("dzielenie z resztą", (r"\bdzielen\w* z reszta",)),
    ("działania na potęgach", (r"\bdzialan\w* na poteg",)),
    ("wzory skróconego mnożenia", (r"\bwzor\w* skrocon\w* mnozen",)),
    ("rozkład na czynniki", (r"\brozklad\w* na czynniki",)),
    ("twierdzenie o reszcie", (r"\btwierdzen\w* o reszcie",)),
    ("wzory Viete'a", (r"\bviete",)),
    ("równania liniowe", (r"\brownan\w* liniow",)),
    ("równania kwadratowe", (
        r"\brownan\w* kwadrat",
        r"\brownan\w*[^.]{0,100}[x𝑥]\s*(?:\^|\*\*)?\s*(?:2|²)",
    )),
    ("nierówności liniowe", (r"\bnierown\w* liniow",)),
    ("nierówności kwadratowe", (
        r"\bnierown\w* kwadrat",
        r"\bnierown\w*[^.]{0,100}[x𝑥]\s*(?:\^|\*\*)?\s*(?:2|²)",
    )),
    ("nierówności wymierne", (r"\bnierown\w* wymiern",)),
    ("równania wymierne", (r"\brownan\w* wymiern",)),
    ("równania z parametrem", (r"\brownan\w* z parametr",)),
    ("równania wykładnicze", (r"\brownan\w* wykladnic",)),
    ("równania trygonometryczne", (r"\brownan\w* trygonometrycz",)),
    ("równania z wartością bezwzględną", (r"\brownan\w* z wartosc\w* bezwzgledn",)),
    ("wykres funkcji", (r"\bwykres\w* funkcj",)),
    ("dziedzina funkcji", (r"\bdziedzin\w* funkcj",)),
    ("miejsce zerowe", (r"\bmiejsc\w* zerow",)),
    ("wierzchołek paraboli", (r"\bwierzcholek\w* parab",)),
    ("oś symetrii", (r"\bos\w* symetrii",)),
    ("postać kanoniczna", (r"\bpostac\w* kanoniczn",)),
    ("wartości funkcji trygonometrycznych", (r"\bwartosc\w* funkcj\w* trygonometrycz",)),
    ("tożsamości trygonometryczne", (r"\btozsamosc\w* trygonometrycz",)),
    ("wzory redukcyjne", (r"\bwzor\w* redukcyjn",)),
    ("wzory na podwojony kąt", (r"\bpodwojon\w* kat",)),
    ("twierdzenie Pitagorasa", (r"\bpitagoras",)),
    ("twierdzenie Talesa", (r"\btales",)),
    ("twierdzenie cosinusów", (r"\bcosinusow",)),
    ("podobieństwo trójkątów", (r"\bpodobienstw\w* trojkat",)),
    ("trójkąt prostokątny", (r"\btrojkat\w* prostokat",)),
    ("trójkąt równoboczny", (r"\btrojkat\w* rownoboczn",)),
    ("kąty w trójkącie", (r"\bkat\w* w trojk",)),
    ("pola trójkątów", (r"\bpole\w* trojkat",)),
    ("trapez", (r"\btrapez\w*",)),
    ("romb", (r"\bromb\w*",)),
    ("równoległobok", (r"\brownoleglobok\w*",)),
    ("prostokąt", (r"\b(?:prostokat(?:u|em|y|ow|ami|ach)?|prostokac(?:ie|y|om|ami|ach))\b",)),
    ("kwadrat", (r"\b(?:kwadrat(?:u|em|y|ow|ami|ach)?|kwadrac(?:ie|y|om|ami|ach))\b",)),
    ("kąty w wielokątach", (r"\bkat\w* w wielokat",)),
    ("okrąg wpisany", (r"\bokrag\w* wpisan",)),
    ("okrąg opisany", (r"\bokrag\w* opisany",)),
    ("kąt wpisany", (r"\bkat\w* wpisany",)),
    ("kąt środkowy", (r"\bkat\w* srodkow",)),
    ("kąty w okręgu", (r"\bkat\w* w okreg",)),
    ("równanie okręgu", (r"\brownan\w* okreg",)),
    ("styczna do okręgu", (r"\bstyczn\w*.*\bokrag",)),
    ("współrzędne punktu", (r"\bwspolrzedn\w* punkt",)),
    ("równanie prostej", (r"\brownan\w* prostej",)),
    ("proste równoległe", (r"\bprost\w* rownolegl",)),
    ("proste prostopadłe", (r"\bprost\w* prostopadl",)),
    ("odległość punktów", (r"\bodleglosc\w* punkt",)),
    ("środek odcinka", (r"\bsrodek\w* odcinka",)),
    ("ostrosłup", (r"\bostroslup\w*",)),
    ("graniastosłup", (r"\bgraniastoslup\w*",)),
    ("prostopadłościan", (r"\bprostopadloscian\w*",)),
    ("stożek", (r"\bstozek\w*",)),
    ("walec", (r"\bwalec\w*",)),
    ("pole powierzchni brył", (r"\bpole\w* powierzchni\w* bryl",)),
    ("objętość brył", (r"\bobjetosc\w* bryl",)),
    ("przekroje brył", (r"\bprzekroj\w* bryl",)),
    ("prawdopodobieństwo klasyczne", (r"\bprawdopodobienstw\w* klasyczn",)),
    ("zdarzenia losowe", (r"\bzdarzen\w* losow",)),
    ("permutacje", (r"\bpermutac\w*",)),
    ("reguła mnożenia", (r"\bregul\w* mnozen",)),
    ("odczytywanie tabel", (r"\btabel\w*",)),
    ("odczytywanie z wykresu", (r"\bwykres\w*",)),
]

TAG_RULES = [
    ("granice", (r"\bgranic\w*",)),
    ("pochodne", (r"\bpochodn\w*", r"\bstyczn\w*.*\bwykres")),
    ("logarytmy", (r"\blogarytm\w*", r"\blog\s*[\d(]", r"\bln\s*[\d(]")),
    ("ciąg arytmetyczny", (r"\bciag\w* arytmetycz",)),
    ("ciąg geometryczny", (r"\bciag\w* geometrycz", r"\bszereg\w* geometrycz")),
    ("ciągi", (r"\bciag\w*", r"\bwyraz\w* ciagu")),
    ("funkcja kwadratowa", (r"\bfunkcj\w* kwadrat", r"\btrojmian\w* kwadrat", r"\bparabol\w*")),
    ("funkcja liniowa", (r"\bfunkcj\w* liniow", r"\bwspolczynnik\w* kierunkow")),
    ("funkcje wymierne", (r"\bfunkcj\w* wymiern", r"\bmianownik\w*.*\bdziedzin")),
    ("funkcja wykładnicza", (r"\bfunkcj\w* wykladnic",)),
    ("funkcja logarytmiczna", (r"\bfunkcj\w* logarytm",)),
    ("funkcje", (r"\bfunkcj\w*", r"\bwykres\w* funkcj", r"\bdziedzin\w* funkcj")),
    ("trygonometria", (r"\btrygonometr\w*", r"\bsinus\w*", r"\bcosinus\w*", r"\btangens\w*", r"\bcotangens\w*")),
    ("prawdopodobieństwo", (r"\bprawdopodob\w*", r"\blosow\w*", r"\burn\w*", r"\bkostk\w*", r"\bmonet\w*")),
    ("kombinatoryka", (r"\bkombinator\w*", r"\bpermutac\w*", r"\bwariac\w*", r"\bkombinac\w*", r"\bliczb\w* sposob\w*")),
    ("statystyka", (r"\bsredni\w* arytmetycz", r"\bmedian\w*", r"\bdominant\w*", r"\brozstep\w*", r"\bodchylen\w*")),
    ("wektory", (r"\bwektor\w*",)),
    ("geometria analityczna", (r"\bwspolrzedn\w*", r"\buklad\w* wspolrzedn", r"\bprosta o rownaniu", r"\bodleglosc\w* punkt")),
    ("okręgi i koła", (r"\bokrag\w*", r"\bcieciw\w*", r"\bstyczn\w*.*\bokrag")),
    ("stereometria", (r"\bostroslup\w*", r"\bgraniastoslup\w*", r"\bprostopadloscian\w*", r"\bszescian\w*", r"\bstozek\w*", r"\bwalec\w*", r"\bkula\w*", r"\bbryl\w*")),
    ("objętość", (r"\bobjetosc\w*", r"\bpojemnosc\w*")),
    ("pola figur", (r"\bpole\s+(?:trojkat\w*|czworokat\w*|trapez\w*|romb\w*|prostokat\w*|kwadrat\w*|figury|kola)",)),
    ("trójkąty", (r"\btrojkat\w*", r"\bpitagoras\w*", r"\btales\w*")),
    ("czworokąty", (
        r"\bczworokat\w*",
        r"\b(?:prostokat(?:u|em|y|ow|ami|ach)?|prostokac(?:ie|y|om|ami|ach))\b",
        r"\btrapez\w*",
        r"\bromb\w*",
        r"\brownoleglobok\w*",
        r"\b(?:kwadrat(?:u|em|y|ow|ami|ach)?|kwadrac(?:ie|y|om|ami|ach))\b",
    )),
    ("prędkość, droga i czas", (r"\bpredkosc\w*", r"\bdroga\w*", r"\bczas\w* przejazd")),
    ("skala i jednostki", (r"\bskal\w*", r"\bjednostk\w*")),
    ("procenty", (r"\bprocent\w*", r"%")),
    ("proporcje", (r"\bproporcj\w*", r"\bstosunk\w*", r"\bwprost proporcjonal")),
    ("podzielność", (r"\bpodzieln\w*", r"\bwielokrotnosc\w*", r"\bnwd\b", r"\bnww\b", r"\breszta z dzielen")),
    ("potęgi", (r"\bpoteg\w*", r"\bwykladnik\w*", r"\bnotacj\w* wykladnic")),
    ("pierwiastki", (r"\bpierwiast\w*", r"√", r"\bsqrt\b")),
    ("ułamki", (r"\bulam\w*", r"\bmianownik\w*", r"\blicznik\w*")),
    ("wartość bezwzględna", (r"\bwartosc\w* bezwzgledn", r"\|[^|]{1,120}\|")),
    ("wielomiany", (r"\bwielomian\w*", r"\bpodzieln\w* przez\s*\(\s*[a-z]", r"\breszta\w*.*\bdzielen")),
    ("wzory skróconego mnożenia", (r"\bwzor\w* skrocon\w* mnozen",)),
    ("wyrażenia algebraiczne", (r"\bwyrazen\w* algebraiczn", r"\bjednomian\w*", r"\bdwumian\w*", r"\bwspolczynnik\w*")),
    ("układy równań", (r"\buklad\w* rownan",)),
    ("równania z parametrem", (r"\bparametr\w*",)),
    ("nierówności", (r"\bnierown\w*",)),
    ("równania", (r"\brownan\w*", r"\brozwiaz\w*\s+rown")),
    ("przedziały liczbowe", (r"\bprzedzial\w* liczb", r"\bzbior\w* rozwiazan")),
    ("liczby i działania", (r"\bliczb\w* (?:natural|calkowit|wymiern|rzeczywist)", r"\bwartosc\w* wyrazenia")),
    ("odczytywanie danych", (r"\btabel\w*", r"\bdiagram\w*", r"\bdane przedstawion", r"\bwykres\w*")),
]

TAG_PARENTS = {
    "ciąg arytmetyczny": ("ciągi",),
    "ciąg geometryczny": ("ciągi",),
    "funkcja kwadratowa": ("funkcje",),
    "funkcja liniowa": ("funkcje",),
    "funkcje wymierne": ("funkcje",),
    "funkcja wykładnicza": ("funkcje",),
    "funkcja logarytmiczna": ("funkcje",),
    "układy równań": ("równania",),
    "równania z parametrem": ("równania",),
}

HINTS = {
    "granice": "Porównaj wyrazy najwyższego stopnia i zastosuj odpowiednie prawa działań na granicach.",
    "pochodne": "Wyznacz pochodną i wykorzystaj jej interpretację zgodnie z treścią zadania.",
    "logarytmy": "Zastosuj definicję logarytmu oraz wzory na logarytm iloczynu, ilorazu i potęgi.",
    "potęgi": "Sprowadź potęgi do wspólnej podstawy i zastosuj prawa działań na potęgach.",
    "pierwiastki": "Uprość pierwiastki, wyłączając czynniki przed znak pierwiastka.",
    "procenty": "Zapisz podane wielkości jako ułamki liczby wyjściowej i ułóż proporcję.",
    "proporcje": "Zapisz zależność między wielkościami i ułóż odpowiednią proporcję.",
    "ciągi arytmetyczne": "Skorzystaj ze wzoru na wyraz ogólny lub sumę ciągu arytmetycznego.",
    "ciągi geometryczne": "Skorzystaj ze wzoru na wyraz ogólny lub sumę ciągu geometrycznego.",
    "ciąg arytmetyczny": "Skorzystaj ze wzoru na wyraz ogólny lub sumę ciągu arytmetycznego.",
    "ciąg geometryczny": "Skorzystaj ze wzoru na wyraz ogólny lub sumę ciągu geometrycznego.",
    "ciągi": "Zapisz zależności między wyrazami ciągu i wykorzystaj podane warunki.",
    "funkcja kwadratowa": "Dobierz najwygodniejszą postać funkcji kwadratowej i wykorzystaj jej własności.",
    "funkcja liniowa": "Zapisz zależność liniową i wykorzystaj współczynnik kierunkowy oraz punkt należący do wykresu.",
    "funkcje wymierne": "Wyznacz dziedzinę i przekształć wyrażenie, pamiętając o wykluczeniach z mianownika.",
    "funkcja wykładnicza": "Sprowadź obie strony do wspólnej podstawy albo skorzystaj z własności funkcji wykładniczej.",
    "funkcja logarytmiczna": "Ustal dziedzinę, a następnie zastosuj definicję i własności logarytmów.",
    "funkcje": "Przeanalizuj dziedzinę, wartości i własności funkcji wynikające z treści lub wykresu.",
    "nierówności": "Przenieś wyrażenia na jedną stronę, ustal punkty krytyczne i zbadaj znaki.",
    "równania": "Ustal dziedzinę, przekształć równanie i sprawdź otrzymane rozwiązania.",
    "układy równań": "Zapisz oba równania i rozwiąż układ metodą podstawiania lub przeciwnych współczynników.",
    "równania z parametrem": "Rozpatrz warunki zależne od parametru i sprawdź liczbę dopuszczalnych rozwiązań.",
    "przedziały liczbowe": "Zaznacz punkty graniczne i zapisz zbiór spełniający podany warunek.",
    "wielomiany": "Rozłóż wielomian na czynniki lub wykorzystaj jego pierwiastki i współczynniki.",
    "wzory skróconego mnożenia": "Rozpoznaj odpowiedni wzór i przekształć wyrażenie, zachowując znaki.",
    "wartość bezwzględna": "Rozpatrz przypadki wyznaczone przez miejsca zerowe wyrażeń pod wartością bezwzględną.",
    "ułamki": "Sprowadź ułamki do wspólnego mianownika i wykonaj działania z zachowaniem dziedziny.",
    "wyrażenia algebraiczne": "Uprość wyrażenia krok po kroku, korzystając ze wzorów i redukcji wyrazów podobnych.",
    "trygonometria": "Wybierz właściwe zależności trygonometryczne i kontroluj dziedzinę oraz miary kątów.",
    "prawdopodobieństwo": "Policz wszystkie możliwe wyniki oraz te sprzyjające opisanemu zdarzeniu.",
    "kombinatoryka": "Ustal, czy kolejność ma znaczenie, i policz możliwości bez podwójnego zliczania.",
    "statystyka": "Uporządkuj dane i zastosuj definicję wskazanej miary statystycznej.",
    "geometria analityczna": "Zapisz współrzędne i równania obiektów, a następnie wykorzystaj wzory na odległość lub nachylenie.",
    "wektory": "Zapisz współrzędne wektorów i wykonaj na nich wymagane działania.",
    "okręgi i koła": "Wykorzystaj własności promieni, cięciw, stycznych oraz kątów w okręgu.",
    "trójkąty": "Zaznacz znane długości i kąty, a następnie dobierz twierdzenie opisujące trójkąt.",
    "czworokąty": "Wykorzystaj własności boków, przekątnych i kątów wskazanego czworokąta.",
    "stereometria": "Wykonaj przekrój pomocniczy i zastosuj wzory na pola, objętości lub długości.",
    "pola figur": "Podziel figurę na prostsze części i zastosuj odpowiednie wzory na pola.",
    "objętość": "Ustal pole podstawy i wysokość bryły, a następnie zastosuj wzór na objętość.",
    "podzielność": "Rozłóż liczby lub wyrażenia na czynniki i wykorzystaj cechy podzielności.",
    "prędkość, droga i czas": "Zapisz zależność droga = prędkość · czas i ujednolić jednostki.",
    "skala i jednostki": "Sprowadź wielkości do wspólnych jednostek i zastosuj skalę lub proporcję.",
    "liczby i działania": "Wykonuj działania w ustalonej kolejności i kontroluj znaki oraz mianowniki.",
    "odczytywanie danych": "Odczytaj dokładnie wartości z tabeli lub wykresu przed rozpoczęciem obliczeń.",
    "dowodzenie": "Zapisz kolejne uzasadnione przekształcenia i wskaż, dlaczego prowadzą do tezy.",
    "zadanie problemowe": "Wypisz dane i szukane wielkości, a następnie zapisz zależności wynikające z treści.",
}

# Warianty pochodzące ze starszych, ręcznie opisywanych arkuszy. Zachowujemy
# precyzyjny temat (np. twierdzenie Pitagorasa), a kategorię nadrzędną dodajemy
# osobno w TAG_PARENTS. Dzięki temu filtr działa dla obu poziomów szczegółowości.
TAG_LABELS = {
    "ciagi": "ciągi",
    "ciag arytmetyczny": "ciąg arytmetyczny",
    "ciagi arytmetyczne": "ciąg arytmetyczny",
    "ciag geometryczny": "ciąg geometryczny",
    "ciagi geometryczne": "ciąg geometryczny",
    "ciag rekurencyjny": "ciąg rekurencyjny",
    "wyraz ogolny ciagu": "wyraz ogólny ciągu",
    "suma ciagu arytmetycznego": "suma ciągu arytmetycznego",
    "monotonicznosc ciagu": "monotoniczność ciągu",
    "szereg geometryczny": "szereg geometryczny",
    "granice ciagow": "granice ciągów",
    "funkcja kwadratowa": "funkcja kwadratowa",
    "funkcja liniowa": "funkcja liniowa",
    "funkcja wykladnicza": "funkcja wykładnicza",
    "funkcja logarytmiczna": "funkcja logarytmiczna",
    "funkcje wymierne": "funkcje wymierne",
    "funkcje trygonometryczne": "funkcje trygonometryczne",
    "funkcje wykladnicze": "funkcja wykładnicza",
    "funkcje logarytmiczne": "funkcja logarytmiczna",
    "funkcja wielomianowa": "funkcja wielomianowa",
    "wykres funkcji": "wykres funkcji",
    "wykresy funkcji": "wykres funkcji",
    "wykresy": "wykresy",
    "wartosci funkcji": "wartości funkcji",
    "wartosc najmniejsza": "wartość najmniejsza",
    "dziedzina funkcji": "dziedzina funkcji",
    "dziedzina": "dziedzina",
    "przesuniecia wykresu": "przesunięcia wykresu",
    "symetria wykresu": "symetria wykresu",
    "os symetrii": "oś symetrii",
    "postać kanoniczna": "postać kanoniczna",
    "postac kanoniczna": "postać kanoniczna",
    "wierzcholek paraboli": "wierzchołek paraboli",
    "miejsca zerowe": "miejsca zerowe",
    "miejsce zerowe": "miejsce zerowe",
    "zadania z parametrem": "równania z parametrem",
    "rownania z parametrem": "równania z parametrem",
    "rownania liniowe": "równania liniowe",
    "rownania kwadratowe": "równania kwadratowe",
    "rownania wymierne": "równania wymierne",
    "rownania wykladnicze": "równania wykładnicze",
    "rownania trygonometryczne": "równania trygonometryczne",
    "rownania z wartoscia bezwzgledna": "równania z wartością bezwzględną",
    "nierownosci liniowe": "nierówności liniowe",
    "nierownosci kwadratowe": "nierówności kwadratowe",
    "nierownosci wymierne": "nierówności wymierne",
    "nierownosci wielomianowe": "nierówności wielomianowe",
    "nierownosci z wartoscia bezwzgledna": "nierówności z wartością bezwzględną",
    "wartosc bezwzgledna": "wartość bezwzględna",
    "potegi": "potęgi",
    "dzialania na potegach": "działania na potęgach",
    "pierwiastki": "pierwiastki",
    "ulamki": "ułamki",
    "ulamki dziesietne": "ułamki dziesiętne",
    "liczby naturalne": "liczby naturalne",
    "liczby calkowite": "liczby całkowite",
    "liczby rzeczywiste": "liczby rzeczywiste",
    "liczby wymierne": "liczby wymierne",
    "liczby ujemne": "liczby ujemne",
    "liczby parzyste": "liczby parzyste",
    "parzystosc": "parzystość",
    "porownywanie liczb": "porównywanie liczb",
    "os liczbowa": "oś liczbowa",
    "wyrazenia arytmetyczne": "wyrażenia arytmetyczne",
    "dzialania na liczbach": "działania na liczbach",
    "suma liczb naturalnych": "suma liczb naturalnych",
    "nwd": "NWD",
    "nww": "NWW",
    "dzielenie z reszta": "dzielenie z resztą",
    "podzielnosc liczb": "podzielność liczb",
    "wyrazenia algebraiczne": "wyrażenia algebraiczne",
    "wyrazenia wymierne": "wyrażenia wymierne",
    "przeksztalcanie wzorow": "przekształcanie wzorów",
    "wzory skroconego mnozenia": "wzory skróconego mnożenia",
    "rozklad na czynniki": "rozkład na czynniki",
    "rozklad wielomianu na czynniki": "rozkład wielomianu na czynniki",
    "pierwiastki wielomianu": "pierwiastki wielomianu",
    "twierdzenie o reszcie": "twierdzenie o reszcie",
    "wzory viete'a": "wzory Viete'a",
    "wlasnosci logarytmow": "własności logarytmów",
    "zmiana podstawy logarytmu": "zmiana podstawy logarytmu",
    "trygonometria": "trygonometria",
    "wartosci trygonometryczne": "wartości trygonometryczne",
    "wartosci funkcji trygonometrycznych": "wartości funkcji trygonometrycznych",
    "tozsamosci trygonometryczne": "tożsamości trygonometryczne",
    "wzory redukcyjne": "wzory redukcyjne",
    "wzory na podwojony kat": "wzory na podwojony kąt",
    "wzory na sume i roznice katow": "wzory na sumę i różnicę kątów",
    "katy": "kąty",
    "kat wpisany": "kąt wpisany",
    "kat srodkowy": "kąt środkowy",
    "kat rozwarty": "kąt rozwarty",
    "katy w trojkacie": "kąty w trójkącie",
    "katy w wielokatach": "kąty w wielokątach",
    "katy w okregu": "kąty w okręgu",
    "katy w brylach": "kąty w bryłach",
    "trojkaty": "trójkąty",
    "trojkat prostokatny": "trójkąt prostokątny",
    "trojkat rownoboczny": "trójkąt równoboczny",
    "twierdzenie pitagorasa": "twierdzenie Pitagorasa",
    "trojki pitagorejskie": "trójki pitagorejskie",
    "twierdzenie talesa": "twierdzenie Talesa",
    "twierdzenie cosinusow": "twierdzenie cosinusów",
    "podobienstwo": "podobieństwo",
    "podobienstwo trojkatow": "podobieństwo trójkątów",
    "dwusieczna": "dwusieczna",
    "pola trojkatow": "pola trójkątów",
    "pole trojkata": "pole trójkąta",
    "czworokaty": "czworokąty",
    "czworokat": "czworokąt",
    "rownoleglobok": "równoległobok",
    "prostokat": "prostokąt",
    "wielokaty": "wielokąty",
    "pola czworokatow": "pola czworokątów",
    "pole czworokata": "pole czworokąta",
    "pole kwadratu": "pole kwadratu",
    "pola figur": "pola figur",
    "pole figury": "pole figury",
    "obwody figur": "obwody figur",
    "obwod": "obwód",
    "okregi i kola": "okręgi i koła",
    "okrag": "okrąg",
    "okrag wpisany": "okrąg wpisany",
    "okrag opisany": "okrąg opisany",
    "okrag w ukladzie wspolrzednych": "okrąg w układzie współrzędnych",
    "rowanie okregu": "równanie okręgu",
    "rownanie okregu": "równanie okręgu",
    "styczna do okregu": "styczna do okręgu",
    "wzajemne polozenie dwoch okregow": "wzajemne położenie dwóch okręgów",
    "geometria analityczna": "geometria analityczna",
    "uklad wspolrzednych": "układ współrzędnych",
    "wspolrzedne punktu": "współrzędne punktu",
    "rownanie prostej": "równanie prostej",
    "proste rownolegle": "proste równoległe",
    "proste prostopadle": "proste prostopadłe",
    "odleglosc punktow": "odległość punktów",
    "odleglosc punktu od prostej": "odległość punktu od prostej",
    "srodek odcinka": "środek odcinka",
    "symetralna": "symetralna",
    "wspolczynnik kierunkowy": "współczynnik kierunkowy",
    "stereometria": "stereometria",
    "bryly": "bryły",
    "bryly obrotowe": "bryły obrotowe",
    "geometria przestrzenna": "geometria przestrzenna",
    "ostroslup": "ostrosłup",
    "ostroslupy": "ostrosłupy",
    "graniastoslup": "graniastosłup",
    "graniastoslupy": "graniastosłupy",
    "prostopadloscian": "prostopadłościan",
    "stozek": "stożek",
    "walec": "walec",
    "pole powierzchni": "pole powierzchni",
    "pole powierzchni bryl": "pole powierzchni brył",
    "objetosc": "objętość",
    "objetosc bryl": "objętość brył",
    "przekroje bryl": "przekroje brył",
    "odleglosci w brylach": "odległości w bryłach",
    "twierdzenie pitagorasa w przestrzeni": "twierdzenie Pitagorasa w przestrzeni",
    "prawdopodobienstwo": "prawdopodobieństwo",
    "prawdopodobienstwo klasyczne": "prawdopodobieństwo klasyczne",
    "prawdopodobienstwo warunkowe": "prawdopodobieństwo warunkowe",
    "prawdopodobienstwo calkowite": "prawdopodobieństwo całkowite",
    "zdarzenia elementarne": "zdarzenia elementarne",
    "zdarzenia losowe": "zdarzenia losowe",
    "doswiadczenia wieloetapowe": "doświadczenia wieloetapowe",
    "schemat bernoulliego": "schemat Bernoulliego",
    "kombinatoryka": "kombinatoryka",
    "permutacje": "permutacje",
    "zliczanie przypadkow": "zliczanie przypadków",
    "regula mnozenia": "reguła mnożenia",
    "statystyka": "statystyka",
    "srednia arytmetyczna": "średnia arytmetyczna",
    "srednia wazona": "średnia ważona",
    "odczytywanie danych": "odczytywanie danych",
    "odczytywanie z wykresu": "odczytywanie z wykresu",
    "odczytywanie tabel": "odczytywanie tabel",
    "diagramy": "diagramy",
    "diagram kolowy": "diagram kołowy",
    "tabele": "tabele",
    "procent skladany": "procent składany",
    "proporcjonalnosc": "proporcjonalność",
    "skala i jednostki": "skala i jednostki",
    "predkosc droga czas": "prędkość, droga i czas",
    "predkosc, droga i czas": "prędkość, droga i czas",
    "przedzialy liczbowe": "przedziały liczbowe",
    "dowody algebraiczne": "dowody algebraiczne",
    "dowody geometryczne": "dowody geometryczne",
    "dowody z nierownosci": "dowody z nierówności",
    "uzasadnianie": "uzasadnianie",
    "rozumowanie": "rozumowanie",
}

TAG_PARENTS.update({
    "ciąg rekurencyjny": ("ciągi",),
    "wyraz ogólny ciągu": ("ciągi",),
    "suma ciągu arytmetycznego": ("ciąg arytmetyczny",),
    "monotoniczność ciągu": ("ciągi",),
    "szereg geometryczny": ("ciąg geometryczny",),
    "granice ciągów": ("granice", "ciągi"),
    "funkcje trygonometryczne": ("trygonometria",),
    "funkcja wielomianowa": ("funkcje", "wielomiany"),
    "wykres funkcji": ("funkcje",),
    "wykresy": ("odczytywanie danych",),
    "wartości funkcji": ("funkcje",),
    "wartość najmniejsza": ("funkcje",),
    "dziedzina": ("funkcje",),
    "dziedzina funkcji": ("funkcje",),
    "przesunięcia wykresu": ("funkcje",),
    "symetria wykresu": ("funkcje",),
    "oś symetrii": ("funkcja kwadratowa",),
    "postać kanoniczna": ("funkcja kwadratowa",),
    "wierzchołek paraboli": ("funkcja kwadratowa",),
    "miejsca zerowe": ("funkcja kwadratowa",),
    "miejsce zerowe": ("funkcja kwadratowa",),
    "równania liniowe": ("równania",),
    "równania kwadratowe": ("równania", "funkcja kwadratowa"),
    "równania wymierne": ("równania", "funkcje wymierne"),
    "równania wykładnicze": ("równania", "funkcja wykładnicza"),
    "równania trygonometryczne": ("równania", "trygonometria"),
    "równania z wartością bezwzględną": ("równania", "wartość bezwzględna"),
    "nierówności liniowe": ("nierówności",),
    "nierówności kwadratowe": ("nierówności", "funkcja kwadratowa"),
    "nierówności wymierne": ("nierówności", "funkcje wymierne"),
    "nierówności wielomianowe": ("nierówności", "wielomiany"),
    "nierówności z wartością bezwzględną": ("nierówności", "wartość bezwzględna"),
    "działania na potęgach": ("potęgi",),
    "potęgi": ("liczby i działania",),
    "pierwiastki": ("liczby i działania",),
    "ułamki": ("liczby i działania",),
    "ułamki dziesiętne": ("ułamki",),
    "liczby naturalne": ("liczby i działania",),
    "liczby całkowite": ("liczby i działania",),
    "liczby rzeczywiste": ("liczby i działania",),
    "liczby wymierne": ("liczby i działania",),
    "liczby ujemne": ("liczby i działania",),
    "liczby parzyste": ("podzielność",),
    "parzystość": ("podzielność",),
    "porównywanie liczb": ("liczby i działania",),
    "oś liczbowa": ("liczby i działania",),
    "wyrażenia arytmetyczne": ("liczby i działania",),
    "działania na liczbach": ("liczby i działania",),
    "suma liczb naturalnych": ("liczby i działania",),
    "NWD": ("podzielność",),
    "NWW": ("podzielność",),
    "dzielenie z resztą": ("podzielność",),
    "podzielność liczb": ("podzielność",),
    "przekształcanie wzorów": ("wyrażenia algebraiczne",),
    "wzory skróconego mnożenia": ("wyrażenia algebraiczne",),
    "rozkład na czynniki": ("wyrażenia algebraiczne",),
    "rozkład wielomianu na czynniki": ("wielomiany",),
    "pierwiastki wielomianu": ("wielomiany",),
    "twierdzenie o reszcie": ("wielomiany",),
    "wzory Viete'a": ("wielomiany",),
    "wyrażenia wymierne": ("wyrażenia algebraiczne", "ułamki"),
    "własności logarytmów": ("logarytmy",),
    "zmiana podstawy logarytmu": ("logarytmy",),
    "wartości trygonometryczne": ("trygonometria",),
    "wartości funkcji trygonometrycznych": ("trygonometria",),
    "tożsamości trygonometryczne": ("trygonometria",),
    "wzory redukcyjne": ("trygonometria",),
    "wzory na podwojony kąt": ("trygonometria",),
    "wzory na sumę i różnicę kątów": ("trygonometria",),
    "kąt wpisany": ("okręgi i koła",),
    "kąt środkowy": ("okręgi i koła",),
    "kąty w okręgu": ("okręgi i koła",),
    "trójkąt prostokątny": ("trójkąty",),
    "trójkąt równoboczny": ("trójkąty",),
    "twierdzenie Pitagorasa": ("trójkąty",),
    "trójki pitagorejskie": ("trójkąty",),
    "twierdzenie Talesa": ("trójkąty",),
    "twierdzenie cosinusów": ("trójkąty",),
    "podobieństwo": ("trójkąty",),
    "podobieństwo trójkątów": ("trójkąty",),
    "dwusieczna": ("trójkąty",),
    "kąty w trójkącie": ("trójkąty",),
    "pola trójkątów": ("pola figur", "trójkąty"),
    "pole trójkąta": ("pola figur", "trójkąty"),
    "czworokąt": ("czworokąty",),
    "równoległobok": ("czworokąty",),
    "prostokąt": ("czworokąty",),
    "kwadrat": ("czworokąty",),
    "trapez": ("czworokąty",),
    "romb": ("czworokąty",),
    "wielokąty": ("czworokąty",),
    "kąty w wielokątach": ("czworokąty",),
    "pola czworokątów": ("pola figur", "czworokąty"),
    "pole czworokąta": ("pola figur", "czworokąty"),
    "pole kwadratu": ("pola figur", "czworokąty"),
    "pole figury": ("pola figur",),
    "obwody figur": ("czworokąty",),
    "okrąg": ("okręgi i koła",),
    "okrąg wpisany": ("okręgi i koła",),
    "okrąg opisany": ("okręgi i koła",),
    "okrąg w układzie współrzędnych": ("okręgi i koła", "geometria analityczna"),
    "równanie okręgu": ("okręgi i koła", "geometria analityczna"),
    "styczna do okręgu": ("okręgi i koła",),
    "wzajemne położenie dwóch okręgów": ("okręgi i koła",),
    "układ współrzędnych": ("geometria analityczna",),
    "współrzędne punktu": ("geometria analityczna",),
    "równanie prostej": ("geometria analityczna",),
    "proste równoległe": ("geometria analityczna",),
    "proste prostopadłe": ("geometria analityczna",),
    "odległość punktów": ("geometria analityczna",),
    "odległość punktu od prostej": ("geometria analityczna",),
    "środek odcinka": ("geometria analityczna",),
    "symetralna": ("geometria analityczna",),
    "współczynnik kierunkowy": ("funkcja liniowa",),
    "bryły": ("stereometria",),
    "bryły obrotowe": ("stereometria",),
    "geometria przestrzenna": ("stereometria",),
    "ostrosłup": ("stereometria",),
    "ostrosłupy": ("stereometria",),
    "graniastosłup": ("stereometria",),
    "graniastosłupy": ("stereometria",),
    "prostopadłościan": ("stereometria",),
    "stożek": ("stereometria",),
    "walec": ("stereometria",),
    "pole powierzchni": ("stereometria",),
    "pole powierzchni brył": ("stereometria",),
    "objętość": ("stereometria",),
    "objętość brył": ("objętość",),
    "przekroje brył": ("stereometria",),
    "odległości w bryłach": ("stereometria",),
    "twierdzenie Pitagorasa w przestrzeni": ("stereometria", "trójkąty"),
    "prawdopodobieństwo klasyczne": ("prawdopodobieństwo",),
    "prawdopodobieństwo warunkowe": ("prawdopodobieństwo",),
    "prawdopodobieństwo całkowite": ("prawdopodobieństwo",),
    "zdarzenia elementarne": ("prawdopodobieństwo",),
    "zdarzenia losowe": ("prawdopodobieństwo",),
    "doświadczenia wieloetapowe": ("prawdopodobieństwo",),
    "schemat Bernoulliego": ("prawdopodobieństwo",),
    "permutacje": ("kombinatoryka",),
    "zliczanie przypadków": ("kombinatoryka",),
    "reguła mnożenia": ("kombinatoryka",),
    "średnia arytmetyczna": ("statystyka",),
    "średnia ważona": ("statystyka",),
    "mediana": ("statystyka",),
    "dominanta": ("statystyka",),
    "odczytywanie z wykresu": ("odczytywanie danych",),
    "odczytywanie tabel": ("odczytywanie danych",),
    "diagramy": ("odczytywanie danych",),
    "diagram kołowy": ("odczytywanie danych",),
    "tabele": ("odczytywanie danych",),
    "procent składany": ("procenty",),
    "proporcjonalność": ("proporcje",),
    "skala": ("skala i jednostki",),
    "dowody algebraiczne": ("dowodzenie", "wyrażenia algebraiczne"),
    "dowody geometryczne": ("dowodzenie",),
    "dowody z nierówności": ("dowodzenie", "nierówności"),
    "uzasadnianie": ("dowodzenie",),
    "rozumowanie": ("dowodzenie",),
})

NON_THEMATIC_TAGS = {
    "arkusz cke 2022",
    "matura podstawowa",
    "matura rozszerzona",
    "egzamin osmoklasisty",
    "zadanie problemowe",
    "zadania otwarte",
    "zadanie otwarte",
    "zadania zamkniete",
    "zadanie zamkniete",
    "prawda falsz",
    "wybor wielokrotny",
    "zadania tekstowe",
    "zadanie tekstowe",
    "dzialania na liczbach",
    "modelowanie matematyczne",
    "geometria",
    "planimetria",
}

# Dwa starsze archiwa miały wyłącznie techniczny tag całego arkusza. Poniższe
# przypisania zostały zweryfikowane względem treści zadań, aby przywrócić je do
# wspólnego filtrowania z pozostałymi latami.
CURATED_TAGS = {
    "zadania/eo/2022/maj/2022_cke_o_m.json": {
        "1": ("procenty", ("procenty", "odczytywanie danych")),
        "2": ("ułamki", ("ułamki", "liczby i działania")),
        "3": ("liczby i działania", ("liczby i działania",)),
        "4": ("podzielność", ("podzielność",)),
        "5": ("potęgi", ("potęgi",)),
        "6": ("proporcje", ("proporcje",)),
        "7": ("wyrażenia algebraiczne", ("wyrażenia algebraiczne",)),
        "8": ("pierwiastki", ("pierwiastki",)),
        "9": ("liczby i działania", ("liczby i działania",)),
        "10": ("proporcje", ("proporcje",)),
        "11": ("ułamki", ("ułamki",)),
        "12": ("proporcje", ("proporcje",)),
        "13": ("trójkąty", ("trójkąty",)),
        "14": ("prawdopodobieństwo", ("prawdopodobieństwo",)),
        "15": ("pola figur", ("pola figur", "czworokąty", "trójkąty")),
        "16": ("procenty", ("procenty",)),
        "17": ("prędkość, droga i czas", ("prędkość, droga i czas",)),
        "18": ("czworokąty", ("czworokąty", "trójkąty")),
        "19": ("stereometria", ("stereometria", "czworokąty")),
    },
    "zadania/mp/2022/maj/2022_cke_p_m.json": {
        "1": ("pierwiastki", ("pierwiastki",)),
        "2": ("proporcje", ("proporcje",)),
        "3": ("logarytmy", ("logarytmy",)),
        "4": ("procenty", ("procenty",)),
        "5": ("potęgi", ("potęgi", "pierwiastki")),
        "6": ("układy równań", ("układy równań", "równania")),
        "7": ("nierówności", ("nierówności",)),
        "8": ("równania", ("równania",)),
        "9": ("funkcje", ("funkcje",)),
        "10": ("funkcje", ("funkcje",)),
        "11": ("funkcja liniowa", ("funkcja liniowa", "funkcje")),
        "12": ("funkcja kwadratowa", ("funkcja kwadratowa", "funkcje")),
        "13": ("ciągi", ("ciągi",)),
        "14": ("ciąg arytmetyczny", ("ciąg arytmetyczny", "ciągi")),
        "15": ("ciąg geometryczny", ("ciąg geometryczny", "ciągi")),
        "16": ("trygonometria", ("trygonometria",)),
        "17": ("okręgi i koła", ("okręgi i koła",)),
        "18": ("czworokąty", ("czworokąty", "okręgi i koła")),
        "19": ("pola figur", ("pola figur", "trójkąty")),
        "20": ("pola figur", ("pola figur", "czworokąty")),
        "21": ("geometria analityczna", ("geometria analityczna",)),
        "22": ("geometria analityczna", ("geometria analityczna",)),
        "23": ("geometria analityczna", ("geometria analityczna",)),
        "24": ("geometria analityczna", ("geometria analityczna", "czworokąty")),
        "25": ("stereometria", ("stereometria", "czworokąty")),
        "26": ("stereometria", ("stereometria",)),
        "27": ("podzielność", ("podzielność",)),
        "28": ("statystyka", ("statystyka",)),
        "29": ("nierówności", ("nierówności",)),
        "30": ("ciąg arytmetyczny", ("ciąg arytmetyczny", "ciągi")),
        "31": ("dowodzenie", ("dowodzenie", "nierówności")),
        "32": ("trygonometria", ("trygonometria",)),
        "33": ("trójkąty", ("trójkąty",)),
        "34": ("prawdopodobieństwo", ("prawdopodobieństwo",)),
        "35": ("funkcja kwadratowa", ("funkcja kwadratowa", "funkcje", "geometria analityczna")),
    },
}

# Starsze skany mają czasem zbyt mało tekstu, by OCR rozpoznał wyłącznie po
# treści zagadnienie matematyczne. Poniższe przypisania zweryfikowano względem
# obrazów zadań; są używane tylko jako uzupełnienie automatycznej klasyfikacji.
REVIEWED_FALLBACK_TAGS = {
    "zadania/mp/2021/maj/2021_cke_p_m_g.json": {
        "17": ("kąty w okręgu",),
    },
    "zadania/mp/2021/czerwiec_dodatkowy/2021_cke_p_c_d.json": {
        "2": ("potęgi",),
        "16": ("kąty w okręgu",),
    },
    "zadania/mp/2021/sierpien_poprawkowy/2021_cke_p_s_p.json": {
        "1": ("potęgi",),
    },
    "zadania/mp/2020/czerwiec/2020_cke_p_c_g.json": {
        "17": ("kąty w okręgu",),
    },
    "zadania/mp/2020/lipiec_dodatkowy/2020_cke_p_l_d.json": {
        "1": ("równania",),
        "2": ("potęgi",),
        "20": ("stożek",),
        "24": ("statystyka",),
    },
    "zadania/mp/2020/wrzesien_poprawkowy/2020_cke_p_w_p.json": {
        "14": ("środek odcinka",),
        "22": ("pole trójkąta", "geometria analityczna"),
    },
    "zadania/mp/2019/maj/2019_cke_p_m_g.json": {
        "14": ("okrąg opisany", "trójkąty"),
    },
    "zadania/mp/2019/czerwiec_dodatkowy/2019_cke_p_c_d.json": {
        "13": ("trygonometria",),
        "14": ("kąty w okręgu",),
    },
    "zadania/mp/2019/sierpien_poprawkowy/2019_cke_p_s_p.json": {
        "1": ("logarytmy",),
        "9": ("potęgi",),
        "19": ("układ współrzędnych",),
        "22": ("stożek",),
    },
    "zadania/mp/2018/czerwiec_dodatkowy/2018_cke_p_c_d.json": {
        "3": ("nierówności",),
        "15": ("trygonometria",),
        "24": ("kombinatoryka",),
    },
    "zadania/mp/2018/sierpien_poprawkowy/2018_cke_p_s_p.json": {
        "2": ("pierwiastki", "potęgi"),
        "3": ("potęgi",),
        "5": ("pierwiastki", "wzory skróconego mnożenia", "równania"),
        "6": ("układy równań",),
        "16": ("trygonometria",),
        "19": ("pole trójkąta", "trygonometria"),
        "21": ("środek odcinka",),
    },
    "zadania/mp/2017/maj/2017_cke_p_m_g.json": {
        "15": ("kąty w okręgu",),
    },
    "zadania/mp/2017/czerwiec_dodatkowy/2017_cke_p_c_d.json": {
        "4": ("logarytmy",),
        "6": ("pierwiastki",),
        "15": ("trygonometria",),
        "16": ("kąty w okręgu",),
        "24": ("walec", "pole powierzchni"),
    },
    "zadania/mp/2017/sierpien_poprawkowy/2017_cke_p_s_p.json": {
        "1": ("potęgi",),
        "2": ("potęgi",),
        "5": ("pierwiastki", "wzory skróconego mnożenia"),
        "6": ("nierówności", "przedziały liczbowe"),
        "13": ("trygonometria",),
        "14": ("kąty w okręgu",),
    },
    "zadania/mp/2016/maj/2016_cke_p_m_g.json": {
        "7": ("kąty w okręgu",),
    },
    "zadania/mp/2016/czerwiec_dodatkowy/2016_cke_p_c_d.json": {
        "1": ("potęgi",),
        "3": ("pierwiastki",),
        "4": ("wzory skróconego mnożenia",),
        "5": ("wzory skróconego mnożenia", "wyrażenia algebraiczne"),
        "14": ("kąty w okręgu",),
        "15": ("skala i jednostki", "potęgi"),
        "17": ("symetralna",),
        "19": ("równania",),
        "24": ("wielomiany", "wyrażenia algebraiczne"),
    },
    "zadania/mp/2016/sierpien_poprawkowy/2016_cke_p_s_p.json": {
        "1": ("równania", "liczby i działania"),
        "3": ("potęgi",),
        "13": ("wartość bezwzględna", "ułamki"),
        "15": ("stożek",),
        "20": ("okręgi i koła", "geometria analityczna"),
    },
    "zadania/mp/2015/czerwiec_dodatkowy/2015_cke_p_c_d.json": {
        "1": ("pierwiastki",),
        "4": ("wzory skróconego mnożenia", "wyrażenia algebraiczne"),
        "7": ("trygonometria",),
        "8": ("trygonometria",),
        "19": ("stożek",),
    },
    "zadania/mp/2015/sierpien_poprawkowy/2015_cke_p_s_p.json": {
        "3": ("potęgi",),
        "4": ("pierwiastki", "ułamki"),
        "19": ("kąty w okręgu",),
        "21": ("środek odcinka",),
        "23": ("walec", "twierdzenie Pitagorasa"),
        "25": ("kombinatoryka",),
    },
    "zadania/mr/2020/lipiec_dodatkowy/2020_cke_r_l_d.json": {
        "4": ("pierwiastki", "ułamki"),
    },
    "zadania/mr/2018/czerwiec_dodatkowy/2018_cke_r_c_d.json": {
        "3": ("pierwiastki", "wartość bezwzględna"),
    },
    "zadania/eo/2019/kwiecien/2019_cke_o_k_g.json": {
        "1": ("odczytywanie danych",),
    },
}


@dataclass(frozen=True)
class Session:
    exam_folder: str
    kind: str
    level: str
    level_code: str
    label: str
    year: int
    term: str
    month: str
    formula: str
    source_dir: Path
    output_dir: Path
    stem: str
    detail: str
    exam_pdf_override: Path | None = None
    key_pdf_override: Path | None = None
    json_path_override: Path | None = None
    task_asset_filenames: dict[str, str] | None = None
    write_context_assets: bool = True

    @property
    def exam_pdf(self) -> Path:
        return self.exam_pdf_override or self.source_dir / "arkusz.pdf"

    @property
    def key_pdf(self) -> Path:
        return self.key_pdf_override or self.source_dir / "zasady_oceniania.pdf"

    @property
    def json_path(self) -> Path:
        return self.json_path_override or self.output_dir / f"{self.stem}.json"

    @property
    def source_config(self) -> dict:
        return {
            "path": self.json_path.relative_to(ROOT).as_posix(),
            "category": "egzaminy",
            "detail": self.detail,
        }


def normalize_text(text: str) -> str:
    return " ".join(str(text or "").split())


def ascii_fold(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text.lower())
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn").replace("ł", "l")


def tag_key(tag: str) -> str:
    return " ".join(ascii_fold(str(tag or "")).replace("-", " ").split())


def canonical_tag_label(tag: str) -> str:
    key = tag_key(tag)
    return TAG_LABELS.get(key, str(tag or "").replace("-", " ").strip())


# Zadania wieloetapowe mogą łączyć kilka podtematów oraz ich kategorie
# nadrzędne. Limit pozostaje bezpieczny dla interfejsu, ale nie może obcinać
# relacji potrzebnych do działania filtra tematów.
MAX_THEMATIC_TAGS = 20


def expand_tag_hierarchy(tags: list[str] | tuple[str, ...]) -> list[str]:
    """Keep direct topics first, then append their broader related topics."""
    direct = []
    for raw_tag in tags:
        tag = canonical_tag_label(raw_tag)
        if tag and tag not in direct:
            direct.append(tag)

    expanded = list(direct)

    def add_parents(tag: str) -> None:
        for raw_parent in TAG_PARENTS.get(tag, ()):
            parent = canonical_tag_label(raw_parent)
            if not parent or parent in expanded:
                continue
            expanded.append(parent)
            add_parents(parent)

    for tag in direct:
        add_parents(tag)

    return expanded


def natural_task_key(number: str) -> tuple[int, ...]:
    return tuple(int(part) for part in number.split("."))


def session_slug(kind: str, year: int, term: str, month: str, formula: str) -> str:
    suffix = ""
    if term == "additional":
        suffix = "_dodatkowy"
    elif term == "resit":
        suffix = "_poprawkowy"
    if kind == "mr" and year == 2026 and formula:
        suffix += f"_f{formula}"
    return f"{month}{suffix}"


def find_source_dir(exam_folder: str, year: int, term: str, formula: str) -> Path:
    repaired = REPAIRED_SOURCES.get((exam_folder, year, term, formula))
    if repaired:
        return repaired

    year_dir = PACKAGE / exam_folder / str(year)
    candidates = sorted(year_dir.glob(f"{TERM_PREFIX[term]}*"))
    if formula:
        candidates = [candidate for candidate in candidates if f"formula_{formula}" in candidate.name]
    if len(candidates) != 1:
        raise RuntimeError(
            f"Nie można jednoznacznie znaleźć źródła: {exam_folder}, {year}, {term}, {formula}: {candidates}"
        )
    return candidates[0]


def build_sessions() -> list[Session]:
    sessions = []
    manifest = PACKAGE / "manifest_sesji.csv"
    with manifest.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle, delimiter=";"):
            exam_folder = row["egzamin"]
            year = int(row["rok"])
            term = row["termin"]
            month = row["miesiac_faktyczny"]
            formula = row["formula"]
            identity = (exam_folder, year, term, formula)
            if identity in SKIPPED_SESSIONS:
                continue

            kind, level, level_code, label = EXAM_META[exam_folder]
            source_dir = find_source_dir(exam_folder, year, term, formula)
            slug = session_slug(kind, year, term, month, formula)
            output_dir = ROOT / "zadania" / kind / str(year) / slug
            stem_parts = [str(year), "cke", level_code, MONTH_CODES[month], TERM_CODES[term]]
            if kind == "mr" and year == 2026 and formula:
                stem_parts.append(f"f{formula}")
            stem = "_".join(stem_parts)

            detail_parts = [str(year), MONTH_LABELS[month]]
            if TERM_LABEL[term]:
                detail_parts.append(TERM_LABEL[term])
            if kind == "mr" and year == 2026 and formula:
                detail_parts.append(f"formuła {formula}")
            detail_parts.append("CKE")

            sessions.append(
                Session(
                    exam_folder=exam_folder,
                    kind=kind,
                    level=level,
                    level_code=level_code,
                    label=label,
                    year=year,
                    term=term,
                    month=month,
                    formula=formula,
                    source_dir=source_dir,
                    output_dir=output_dir,
                    stem=stem,
                    detail=" / ".join(detail_parts),
                )
            )

    term_order = {"main": 0, "additional": 1, "resit": 2}
    return sorted(
        sessions,
        key=lambda item: (
            {"mp": 0, "mr": 1, "eo": 2}[item.kind],
            -item.year,
            term_order[item.term],
            -(int(item.formula) if item.formula else 0),
        ),
    )


def legacy_task_asset_filenames(json_path: Path) -> dict[str, str]:
    try:
        payload = json.loads(json_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Nieprawidłowy JSON zadań: {json_path}") from error

    if not isinstance(payload, list):
        raise RuntimeError(f"Plik zadań nie zawiera listy: {json_path}")

    filenames = {}
    for item in payload:
        filename = str(item.get("file", "")) if isinstance(item, dict) else ""
        match = re.match(r"^(\d+(?:\.\d+)?)", Path(filename).stem)
        if not match:
            raise RuntimeError(f"Nie można odczytać numeru zadania z pliku: {json_path} / {filename}")
        number = match.group(1)
        if number in filenames:
            raise RuntimeError(f"Powielony numer zadania w {json_path}: {number}")
        filenames[number] = Path(filename).with_suffix(".webp").name

    if not filenames:
        raise RuntimeError(f"Brak plików zadań w {json_path}")
    return filenames


def build_local_exam_sessions(kinds: tuple[str, ...] = ("mp", "mr", "eo")) -> list[Session]:
    """Find local CKE imports whose PDFs live next to the generated task data."""
    sessions = []
    local_levels = {
        "mp": EXAM_META["01_matura_podstawowa"],
        "mr": EXAM_META["02_matura_rozszerzona"],
        "eo": EXAM_META["03_egzamin_osmoklasisty"],
    }

    for kind in kinds:
        _, level, level_code, label = local_levels[kind]
        level_dir = ROOT / "zadania" / kind
        for year_dir in sorted(level_dir.iterdir() if level_dir.exists() else []):
            if not year_dir.is_dir() or not year_dir.name.isdigit():
                continue
            year = int(year_dir.name)

            for output_dir in sorted(path for path in year_dir.iterdir() if path.is_dir()):
                # Sessions from the package importer already use arkusz_cke.pdf
                # and are covered by build_sessions().
                if (output_dir / "arkusz_cke.pdf").exists():
                    continue

                json_candidates = []
                for json_path in sorted(output_dir.glob("*.json")):
                    if " " in json_path.stem or json_path.stem.endswith("_completion"):
                        continue
                    try:
                        payload = json.loads(json_path.read_text(encoding="utf-8"))
                    except json.JSONDecodeError:
                        continue
                    if isinstance(payload, list) and any(
                        isinstance(item, dict) and item.get("file") for item in payload
                    ):
                        json_candidates.append(json_path)

                if len(json_candidates) != 1:
                    continue

                key_candidates = [
                    path
                    for path in sorted(output_dir.glob("*.pdf"))
                    if any(marker in ascii_fold(path.name) for marker in ("zasady", "odpowiedzi"))
                ]
                exam_candidates = [
                    path
                    for path in sorted(output_dir.glob("*.pdf"))
                    if path not in key_candidates
                    and "karta rozwiazan" not in tag_key(path.name)
                    and "sprawozdanie" not in tag_key(path.name)
                ]
                if len(exam_candidates) != 1 or len(key_candidates) != 1:
                    continue

                json_path = json_candidates[0]
                month = output_dir.name.split("_", 1)[0]
                month_label = MONTH_LABELS.get(month, month)
                term = (
                    "additional"
                    if "dodatkowy" in output_dir.name
                    else "resit"
                    if "poprawkowy" in output_dir.name
                    else "main"
                )
                sessions.append(
                    Session(
                        exam_folder=f"local_{kind}",
                        kind=kind,
                        level=level,
                        level_code=level_code,
                        label=label,
                        year=year,
                        term=term,
                        month=month,
                        formula="",
                        source_dir=output_dir,
                        output_dir=output_dir,
                        stem=json_path.stem,
                        detail=f"{year} / {month_label} / CKE",
                        exam_pdf_override=exam_candidates[0],
                        key_pdf_override=key_candidates[0],
                        json_path_override=json_path,
                        task_asset_filenames=legacy_task_asset_filenames(json_path),
                        write_context_assets=False,
                    )
                )

    return sessions


def build_legacy_matura_sessions() -> list[Session]:
    """Limit crop repairs to the older matura imports they were created for."""
    return [
        session
        for session in build_local_exam_sessions(("mp", "mr"))
        if session.year <= 2025
    ]


def page_lines(page) -> list[dict]:
    try:
        lines = page.extract_text_lines(return_chars=False)
    except Exception:
        lines = []
    return [
        {**line, "text": normalize_text(line.get("text", ""))}
        for line in lines
        if normalize_text(line.get("text", ""))
    ]


def poppler_lines(pdf_path: Path) -> dict[int, list[dict]]:
    result = subprocess.run(
        ["pdftotext", "-bbox-layout", str(pdf_path), "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    root = ET.fromstring(result.stdout)
    namespace = {"x": "http://www.w3.org/1999/xhtml"}
    lines_by_page = {}
    for page_index, page in enumerate(root.findall(".//x:page", namespace)):
        entries = []
        for line in page.findall(".//x:line", namespace):
            words = [normalize_text(word.text or "") for word in line.findall("x:word", namespace)]
            text = normalize_text(" ".join(word for word in words if word))
            if not text:
                continue
            entries.append(
                {
                    "text": text,
                    "top": float(line.attrib["yMin"]),
                    "bottom": float(line.attrib["yMax"]),
                    "x0": float(line.attrib["xMin"]),
                    "x1": float(line.attrib["xMax"]),
                }
            )
        lines_by_page[page_index] = entries
    return lines_by_page


def merged_page_lines(page, fallback_lines: list[dict]) -> list[dict]:
    primary = page_lines(page)
    merged = list(primary)
    for candidate in fallback_lines:
        duplicate = any(
            normalize_text(line["text"]) == normalize_text(candidate["text"])
            and abs(float(line["top"]) - float(candidate["top"])) < 2
            for line in primary
        )
        if not duplicate:
            merged.append(candidate)
    return sorted(merged, key=lambda line: (float(line["top"]), float(line.get("x0", 0))))


def parse_header(text: str) -> tuple[str, int] | None:
    match = TASK_HEADER_RE.search(text)
    if match:
        return match.group(1), int(match.group(2))
    match = TASK_POINTS_RE.search(text)
    if match:
        return match.group(1), int(match.group(2))
    return None


def collect_exam_headers(document, pdf_path: Path) -> tuple[list[dict], dict[int, list[dict]]]:
    headers = []
    lines_by_page = {}
    seen = set()
    reached_scratch = False
    fallback_by_page = poppler_lines(pdf_path)

    for page_index, page in enumerate(document.pages):
        lines = merged_page_lines(page, fallback_by_page.get(page_index, []))
        lines_by_page[page_index] = lines
        page_text = " ".join(line["text"] for line in lines)
        if reached_scratch and "Zadanie" not in page_text:
            continue

        for line in lines:
            parsed = parse_header(line["text"])
            if parsed:
                number, max_points = parsed
                if number in seen:
                    continue
                seen.add(number)
                headers.append(
                    {
                        "kind": "task",
                        "number": number,
                        "maxPoints": max_points,
                        "page": page_index,
                        "top": float(line["top"]),
                        "bottom": float(line["bottom"]),
                        "text": line["text"],
                    }
                )
                continue

            parent = PARENT_HEADER_RE.search(line["text"])
            if parent:
                parent_number = parent.group(1)
                context_id = f"context:{parent_number}"
                if context_id in seen or parent_number in seen:
                    continue
                seen.add(context_id)
                headers.append(
                    {
                        "kind": "context",
                        "number": parent_number,
                        "maxPoints": 0,
                        "page": page_index,
                        "top": float(line["top"]),
                        "bottom": float(line["bottom"]),
                        "text": line["text"],
                    }
                )

        if "BRUDNOPIS" in page_text.upper():
            reached_scratch = True

    return headers, lines_by_page


def page_bottom(page) -> float:
    return max(PAGE_TOP + 20, float(page.height) - PAGE_BOTTOM_MARGIN)


def task_page_bottom(page, lines: list[dict]) -> float:
    """Use the first real page footer as the lower edge of a task crop.

    Older CKE PDFs place the footer at different heights. A fixed margin can
    either retain a page number or trim the final line of a task, so task
    crops use the footer detected in the source page whenever it is present.
    """
    footer_tops = [
        float(line["top"])
        for line in lines
        if float(line["top"]) > float(page.height) * 0.7
        and PAGE_FOOTER_RE.fullmatch(ascii_fold(line["text"]).strip())
    ]
    if footer_tops:
        return max(PAGE_TOP + 20, min(footer_tops) - 4)
    return page_bottom(page)


def rendered_page(page, cache: dict[int, Image.Image], page_index: int) -> Image.Image:
    if page_index not in cache:
        cache[page_index] = (
            page.to_image(resolution=RESOLUTION, antialias=True)
            .original.convert("RGB")
        )
    return cache[page_index]


def trim_vertical(
    image: Image.Image,
    padding: int = 12,
    discard_leading_rule: bool = False,
) -> Image.Image | None:
    background = Image.new("RGB", image.size, "white")
    difference = ImageChops.difference(image, background)
    mask = ImageOps.grayscale(difference).point(lambda value: 255 if value > 7 else 0)
    bbox = mask.getbbox()
    if not bbox or bbox[3] - bbox[1] < 18:
        return None

    top, bottom = bbox[1], bbox[3]
    if discard_leading_rule:
        minimum_rule_width = round(image.width * 0.8)
        row = top

        while row < min(bottom, top + 8):
            ink_width = sum(mask.getpixel((column, row)) > 0 for column in range(image.width))
            if ink_width < minimum_rule_width:
                row += 1
                continue

            rule_end = row + 1
            while rule_end < bottom:
                next_ink_width = sum(
                    mask.getpixel((column, rule_end)) > 0
                    for column in range(image.width)
                )
                if next_ink_width < minimum_rule_width:
                    break
                rule_end += 1

            if rule_end - row <= 6:
                top = rule_end
            break

    content = image.crop((0, top, image.width, bottom))
    return ImageOps.expand(content, border=(0, padding, 0, padding), fill="white")


def crop_region(
    page,
    cache: dict[int, Image.Image],
    page_index: int,
    top: float,
    bottom: float,
    x0: float,
    x1: float,
    discard_leading_rule: bool = False,
) -> Image.Image | None:
    if bottom <= top + 2:
        return None
    image = rendered_page(page, cache, page_index)
    crop = image.crop(
        (
            round(x0 * SCALE),
            round(top * SCALE),
            round(x1 * SCALE),
            round(bottom * SCALE),
        )
    )
    return trim_vertical(crop, discard_leading_rule=discard_leading_rule)


def remove_left_score_gutter(image: Image.Image) -> Image.Image:
    """Remove the narrow coloured point-scale left in 2026 formula-2023 tasks."""
    gutter_width = min(22, image.width)
    tallest_coloured_column = 0

    for column in range(gutter_width):
        coloured_pixels = 0
        for row in range(image.height):
            red, green, blue = image.getpixel((column, row))
            if max(red, green, blue) - min(red, green, blue) > 40 and min(red, green, blue) < 220:
                coloured_pixels += 1
        tallest_coloured_column = max(tallest_coloured_column, coloured_pixels)

    if tallest_coloured_column < max(20, round(image.height * 0.2)):
        return image

    cleaned = image.copy()
    cleaned.paste("white", (0, 0, gutter_width, cleaned.height))
    return cleaned


def save_webp(image: Image.Image, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "WEBP", quality=86, method=6)


def grid_top(page, after: float, before: float, x0: float, x1: float) -> float | None:
    horizontal = []
    vertical = []
    minimum_grid_width = (x1 - x0) * 0.78
    for line in [*page.lines, *page.edges]:
        top = float(line.get("top", 0))
        bottom = float(line.get("bottom", top))
        left = float(line.get("x0", 0))
        right = float(line.get("x1", left))
        if not (after < top < before):
            continue
        width = abs(right - left)
        height = abs(bottom - top)
        if (
            height <= 1.5
            and width >= minimum_grid_width
            and left >= x0 - 5
            and right <= x1 + 5
        ):
            horizontal.append(top)
        if width <= 1.5 and height >= 80 and left >= x0 - 5 and right <= x1 + 5:
            vertical.append((left, top))

    horizontal_levels = sorted({round(top, 1) for top in horizontal})
    if len(horizontal_levels) >= 8:
        candidate = horizontal_levels[0]
        if candidate > after + 12:
            return candidate

    if len(horizontal_levels) >= 4 and len(vertical) >= 8:
        first_horizontal = horizontal_levels[0]
        first_vertical = min(top for _, top in vertical)
        candidate = min(first_horizontal, first_vertical)
        if candidate > after + 20:
            return candidate

    rect_tops = {}
    vertical_grid_tops = {}
    for rect in page.rects:
        top = float(rect["top"])
        if not (after < top < before):
            continue
        if rect["height"] <= 1.2 and rect["width"] <= 28 and rect["x0"] >= x0 and rect["x1"] <= x1:
            key = round(top, 1)
            rect_tops[key] = rect_tops.get(key, 0) + 1
        if (
            rect["width"] <= 1.2
            and 8 <= rect["height"] <= 30
            and rect["x0"] >= x0
            and rect["x1"] <= x1
        ):
            key = round(top, 1)
            vertical_grid_tops[key] = vertical_grid_tops.get(key, 0) + 1
    vertical_candidates = [top for top, count in vertical_grid_tops.items() if count >= 20]
    if vertical_candidates:
        candidate = min(vertical_candidates)
        if candidate > after + 12:
            return candidate
    candidates = [top for top, count in rect_tops.items() if count >= 10]
    return min(candidates) if candidates else None


def boundary_on_page(
    headers: list[dict],
    index: int,
    page,
    page_limit: float | None = None,
) -> float:
    header = headers[index]
    next_same_page = [
        item["top"]
        for item in headers[index + 1 :]
        if item["page"] == header["page"]
    ]
    return min(next_same_page) - 4 if next_same_page else page_limit or page_bottom(page)


def first_line_top(lines: list[dict], after: float, before: float, prefixes: tuple[str, ...]) -> float | None:
    for line in lines:
        if not (after < float(line["top"]) < before):
            continue
        folded = ascii_fold(line["text"])
        if any(folded.startswith(prefix) for prefix in prefixes):
            return float(line["top"])
    return None


def first_exact_line_top(lines: list[dict], after: float, before: float, values: tuple[str, ...]) -> float | None:
    for line in lines:
        if not (after < float(line["top"]) < before):
            continue
        if ascii_fold(line["text"]) in values:
            return float(line["top"])
    return None


def extract_task_text(
    header: dict,
    headers: list[dict],
    index: int,
    lines_by_page: dict[int, list[dict]],
    page,
) -> str:
    start = header["bottom"] + 2
    end = boundary_on_page(
        headers,
        index,
        page,
        task_page_bottom(page, lines_by_page[header["page"]]),
    )
    texts = [
        line["text"]
        for line in lines_by_page[header["page"]]
        if start < float(line["top"]) < end
        and not ascii_fold(line["text"]).startswith(("strona ", "przenies rozwiazania", "eduarkusze"))
    ]
    return normalize_text(" ".join(texts))


def extract_task_assets(session: Session, output: Path) -> tuple[dict[str, dict], dict[str, str]]:
    manifest = {}
    task_texts = {}
    with pdfplumber.open(session.exam_pdf) as document:
        headers, lines_by_page = collect_exam_headers(document, session.exam_pdf)
        cache = {}
        context_texts = {}

        for index, header in enumerate(headers):
            page = document.pages[header["page"]]
            page_lines = lines_by_page[header["page"]]
            # Header and the first line of the task can visually sit closer
            # than their extracted text bounds suggest. Starting at the
            # header's bottom preserves the whole first line without showing
            # the task-number strip.
            start = header["bottom"]
            end = boundary_on_page(
                headers,
                index,
                page,
                task_page_bottom(page, page_lines),
            )

            stop = first_line_top(
                page_lines,
                start,
                end,
                ("brudnopis", "przenies rozwiazania zadan"),
            )
            solution_stop = first_exact_line_top(
                page_lines,
                start,
                end,
                ("rozwiazanie",),
            )
            if solution_stop is not None:
                stop = min(stop, solution_stop) if stop is not None else solution_stop
            if stop is not None:
                end = min(end, stop - 3)

            if header["kind"] == "task" and header["maxPoints"] > 1:
                detected_grid = grid_top(
                    page,
                    start,
                    end,
                    TASK_X0[session.kind],
                    float(page.width) - TASK_RIGHT_MARGIN,
                )
                if detected_grid is not None:
                    end = min(end, detected_grid - 4)

            image = crop_region(
                page,
                cache,
                header["page"],
                start,
                end,
                TASK_X0[session.kind],
                float(page.width) - TASK_RIGHT_MARGIN,
                discard_leading_rule=True,
            )
            if image is None:
                raise RuntimeError(
                    f"Pusty wycinek {session.kind} {session.year} {session.detail}, "
                    f"{header['kind']} {header['number']}"
                )
            if session.kind == "mr" and session.year == 2026 and session.formula == "2023":
                image = remove_left_score_gutter(image)

            text = extract_task_text(header, headers, index, lines_by_page, page)
            if header["kind"] == "context":
                filename = f"{header['number']}_kontekst_{session.stem}.webp"
                save_webp(image, output / filename)
                manifest[f"context:{header['number']}"] = {"file": filename}
                context_texts[header["number"]] = text
                continue

            if session.task_asset_filenames is not None:
                filename = session.task_asset_filenames.get(header["number"])
                if filename is None:
                    raise RuntimeError(
                        f"Brak nazwy pliku zadania {header['number']} w {session.json_path}"
                    )
            else:
                filename = f"{header['number']}_{session.stem}.webp"
            save_webp(image, output / filename)
            item = {"file": filename, "maxPoints": header["maxPoints"]}
            if "." in header["number"]:
                parent = header["number"].split(".", 1)[0]
                context = manifest.get(f"context:{parent}")
                if context:
                    item["contextFile"] = context["file"]
                    text = normalize_text(f"{context_texts.get(parent, '')} {text}")
            manifest[header["number"]] = item
            task_texts[header["number"]] = text

    tasks = [key for key in manifest if not key.startswith("context:")]
    if not tasks:
        raise RuntimeError(f"Nie znaleziono zadań w {session.exam_pdf}")
    return manifest, task_texts


def collect_key_sections(document, pdf_path: Path) -> tuple[dict[str, dict], list[dict]]:
    all_lines = []
    headers = []
    seen = set()
    fallback_by_page = poppler_lines(pdf_path)
    for page_index, page in enumerate(document.pages):
        for line in merged_page_lines(page, fallback_by_page.get(page_index, [])):
            entry = {
                "page": page_index,
                "top": float(line["top"]),
                "bottom": float(line["bottom"]),
                "text": line["text"],
            }
            all_lines.append(entry)
            parsed = parse_header(line["text"])
            if parsed:
                candidates = [(parsed[0], parsed[1])]
            elif SHORT_KEY_HEADERS_RE.fullmatch(line["text"]):
                candidates = [
                    (match.group(1), 0)
                    for match in SHORT_KEY_HEADER_ITEM_RE.finditer(line["text"])
                ]
            else:
                continue
            for number, max_points in candidates:
                if number in seen:
                    continue
                seen.add(number)
                headers.append({**entry, "number": number, "maxPoints": max_points})

    sections = {}
    for index, header in enumerate(headers):
        start = (header["page"], header["bottom"])
        next_header = next(
            (
                candidate
                for candidate in headers[index + 1 :]
                if (candidate["page"], candidate["top"], candidate["bottom"])
                != (header["page"], header["top"], header["bottom"])
            ),
            None,
        )
        end = (
            (next_header["page"], next_header["top"])
            if next_header
            else (len(document.pages) - 1, page_bottom(document.pages[-1]))
        )
        lines = [
            line
            for line in all_lines
            if start < (line["page"], line["top"]) < end
        ]
        sections[header["number"]] = {"header": header, "start": start, "end": end, "lines": lines}
    return sections, all_lines


def extract_global_answers(document) -> dict[str, str]:
    answers = {}
    for page in document.pages:
        for table in page.extract_tables() or []:
            if len(table) < 2:
                continue
            for row_index, row in enumerate(table[:-1]):
                cells = [normalize_text(cell or "") for cell in row]
                first = ascii_fold(cells[0]) if cells else ""
                if not (first.startswith("nr") or first.startswith("numer zad")):
                    continue
                answer_cells = [normalize_text(cell or "") for cell in table[row_index + 1]]
                if not answer_cells or not ascii_fold(answer_cells[0]).startswith(("odp", "odpowiedz")):
                    continue
                for number_cell, answer_cell in zip(cells[1:], answer_cells[1:]):
                    number_match = re.search(r"\d+(?:\.\d+)?", number_cell)
                    answer = answer_cell.replace(" ", "").upper()
                    if number_match and ANSWER_CODE_RE.fullmatch(answer):
                        answers[number_match.group(0)] = answer
    return answers


def solution_marker(text: str) -> str | None:
    folded = ascii_fold(normalize_text(text))
    if folded == "odpowiedz":
        return "solution"
    if folded in {
        "rozwiazanie",
        "rozwiazanie zadania",
        "przykladowe rozwiazanie",
        "przykladowe pelne rozwiazanie",
        "przykladowe sposoby rozwiazania zadania",
    }:
        return "solution"
    if re.fullmatch(
        r"rozwiazanie\s*(?:\((?:[ivx]+|\d+)\s+sposob\)|(?:[ivx]+|\d+)\s+sposob)(?:\s+.*)?",
        folded,
    ):
        return "solution"
    if re.fullmatch(
        r"(?:(?:[ivx]+|\d+)\.?\s+)?sposob rozwiazania(?: zadania)?",
        folded,
    ):
        return "solution"
    if folded.startswith("zasady oceniania"):
        return "criteria"
    if folded.startswith("schemat oceniania"):
        return "criteria"
    if folded.startswith("schemat punktowania"):
        return "criteria"
    if folded.startswith("kryteria oceniania"):
        return "criteria"
    return None


def parse_closed_answer(section: dict) -> str | None:
    lines = section["lines"]
    for line in lines:
        match = re.search(r"Wersja\s+A\s*:\s*([A-E]|[A-E]{2}|[PF]{2}|[A-E]\d)", line["text"], re.I)
        if match:
            return match.group(1).upper()

    for index, line in enumerate(lines):
        folded = ascii_fold(line["text"])
        if folded == "poprawna" or folded.startswith("poprawna odpowiedz"):
            for candidate in lines[index + 1 : index + 21]:
                value = normalize_text(candidate["text"]).replace(" ", "").upper()
                if ANSWER_CODE_RE.fullmatch(value):
                    return value
        if "rozwiazanie" in folded and "wersja x" in folded:
            for candidate in lines[index + 1 : index + 4]:
                values = re.findall(r"\b([A-E]|[A-E]{2}|[PF]{2}|[A-E]\d)\b", candidate["text"].upper())
                if values:
                    return values[0]
        if folded not in {"rozwiazanie", "odpowiedz"}:
            continue
        for candidate in lines[index + 1 : index + 5]:
            value = normalize_text(candidate["text"]).replace(" ", "").upper()
            version = re.match(r"WERSJAA:([A-E]|[A-E]{2}|[PF]{2}|[A-E]\d)$", value)
            if version:
                return version.group(1)
            if ANSWER_CODE_RE.fullmatch(value):
                return value

    saw_versions = False
    for line in lines:
        folded = ascii_fold(line["text"])
        if folded.count("wersja") >= 2:
            saw_versions = True
            continue
        if not saw_versions:
            continue
        match = re.search(
            r"(?:^|\s)([A-E]|[A-E]{2}|[PF]{2}|[A-E]\d)\s+"
            r"([A-E]|[A-E]{2}|[PF]{2}|[A-E]\d)\s*$",
            line["text"],
        )
        if match:
            return match.group(1).upper()

    for line in lines:
        match = re.search(r"Poprawna\s+odpowiedź\s*[:\-]?\s*([A-E]|[A-E]{2}|[PF]{2})", line["text"], re.I)
        if match:
            return match.group(1).upper()

    # In older table-based keys the "Poprawna odpowiedź" heading appears only
    # above the first row. Every following row still contains the answer as a
    # standalone cell, which text extraction exposes as a separate line.
    for line in lines:
        value = normalize_text(line["text"]).replace(" ", "").upper()
        if ANSWER_CODE_RE.fullmatch(value):
            return value
    return None


def position(line: dict, edge: str = "top") -> tuple[int, float]:
    return int(line["page"]), float(line[edge])


def save_span(
    document,
    cache: dict[int, Image.Image],
    start: tuple[int, float],
    end: tuple[int, float],
    output: Path,
    base_name: str,
) -> list[str]:
    saved = []
    part = 1
    for page_index in range(start[0], end[0] + 1):
        page = document.pages[page_index]
        top = start[1] if page_index == start[0] else PAGE_TOP
        bottom = end[1] if page_index == end[0] else page_bottom(page)
        top = max(top, PAGE_TOP)
        bottom = min(bottom, page_bottom(page))
        image = crop_region(
            page,
            cache,
            page_index,
            top,
            bottom,
            KEY_X0,
            float(page.width) - SIDE_MARGIN,
        )
        if image is None:
            continue
        filename = f"{base_name}{part}.webp"
        save_webp(image, output / filename)
        saved.append(filename)
        part += 1
    return saved


def solution_label(marker_text: str) -> str:
    text = normalize_text(marker_text)
    folded = ascii_fold(text)
    if folded == "odpowiedz":
        return "Odpowiedź"
    match = re.search(r"(?:\(|\b)([IVX]+|\d+)\s+sposób\b", text, re.I)
    if match:
        return f"Sposób {match.group(1).upper()}"
    return "Rozwiązanie"


def extract_key_assets(
    session: Session,
    output: Path,
    manifest: dict[str, dict],
) -> tuple[dict[str, str], list[str], list[str]]:
    key_texts = {}
    missing_answers = []
    missing_open_assets = []

    with pdfplumber.open(session.key_pdf) as document:
        sections, _ = collect_key_sections(document, session.key_pdf)
        global_answers = extract_global_answers(document)
        cache = {}
        for number, item in manifest.items():
            if number.startswith("context:"):
                continue
            section = sections.get(number)
            if not section:
                if item["maxPoints"] == 1:
                    answer = global_answers.get(number)
                    if answer:
                        item["answer"] = answer
                    else:
                        missing_answers.append(number)
                else:
                    missing_open_assets.append(number)
                continue

            key_texts[number] = normalize_text(" ".join(line["text"] for line in section["lines"]))
            if item["maxPoints"] == 1:
                answer = parse_closed_answer(section) or global_answers.get(number)
                if answer:
                    item["answer"] = answer
                else:
                    missing_answers.append(number)
                continue

            markers = []
            for line in section["lines"]:
                kind = solution_marker(line["text"])
                if kind:
                    markers.append({**line, "markerKind": kind})

            solutions = []
            criteria = []
            for marker_index, marker in enumerate(markers):
                start = position(marker, "bottom")
                end = (
                    position(markers[marker_index + 1], "top")
                    if marker_index + 1 < len(markers)
                    else section["end"]
                )
                if end <= start:
                    continue
                base = f"{number}_{'s' if marker['markerKind'] == 'solution' else 'z'}_{marker_index + 1}_"
                files = save_span(document, cache, start, end, output, base)
                if marker["markerKind"] == "solution":
                    label = solution_label(marker["text"])
                    solutions.extend({"label": label, "file": filename} for filename in files)
                else:
                    criteria.extend(
                        {"label": "Zasady oceniania", "file": filename}
                        for filename in files
                    )

            if not solutions and not criteria:
                fallback_start = section["start"]
                fallback_files = save_span(
                    document,
                    cache,
                    fallback_start,
                    section["end"],
                    output,
                    f"{number}_s_0_",
                )
                solutions.extend(
                    {"label": "Rozwiązanie", "file": filename}
                    for filename in fallback_files
                )

            if solutions:
                item["solutions"] = solutions
            if criteria:
                item["gradingCriteriaFiles"] = criteria
            if not solutions and not criteria:
                missing_open_assets.append(number)

    return key_texts, missing_answers, missing_open_assets


def load_completion_percentages(session: Session) -> dict[str, int]:
    if session.term != "main":
        return {}
    csv_path = PACKAGE / session.exam_folder / str(session.year) / "00_wyniki_szczegolowe/procent_wykonania_zadan.csv"
    if not csv_path.exists():
        return {}
    values = {}
    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle, delimiter=";"):
            number = normalize_text(row.get("zadanie", ""))
            value = normalize_text(row.get("procent_wykonania", ""))
            if number and value:
                values[number] = int(float(value.replace(",", ".")))
    return values


def detected_tags(text: str) -> list[str]:
    """Return only topics evidenced by the supplied task text."""
    tags = [
        label
        for label, patterns in [*SPECIFIC_TAG_RULES, *TAG_RULES]
        if any(re.search(pattern, text) for pattern in patterns)
    ]

    # A graph of a function is not the same topic as reading general data.
    function_topics = {
        "funkcje",
        "funkcja kwadratowa",
        "funkcja liniowa",
        "funkcje wymierne",
        "funkcja wykładnicza",
        "funkcja logarytmiczna",
    }
    if "odczytywanie danych" in tags and function_topics.intersection(tags):
        tags.remove("odczytywanie danych")
    if "odczytywanie z wykresu" in tags and function_topics.intersection(tags):
        tags.remove("odczytywanie z wykresu")

    # In polynomial tasks a remainder after division describes a polynomial,
    # rather than a standalone arithmetic divisibility exercise.
    if "wielomiany" in tags and "podzielność" in tags:
        tags.remove("podzielność")

    # A rational function mentions a denominator by definition. This is not
    # sufficient to classify the task as a fractions exercise.
    if "funkcje wymierne" in tags and "ułamki" in tags:
        tags.remove("ułamki")

    # "Sześcienna kostka" jest typowym elementem doświadczenia losowego, a
    # nie zadaniem ze stereometrii.
    if "prawdopodobieństwo" in tags and "stereometria" in tags and "kostk" in text:
        tags.remove("stereometria")

    # Liczby pojawiają się w prawie każdym zadaniu. Ten szeroki tag zostaje
    # tylko wtedy, gdy nie wykryto bardziej konkretnego zagadnienia.
    if "liczby i działania" in tags and len(tags) > 1:
        tags.remove("liczby i działania")

    # Pierwiastek zapisany w logarytmie nie zmienia tematu zadania.
    if "logarytmy" in tags and "pierwiastki" in tags:
        tags.remove("pierwiastki")

    return list(dict.fromkeys(tags))


def classify_task(task_text: str, key_text: str) -> tuple[str, list[str], str]:
    # The statement is authoritative. The key is used only when extraction
    # from a scan leaves the statement without any recognisable topic.
    statement = ascii_fold(task_text)
    statement_tags = detected_tags(statement)
    is_proof = bool(re.search(r"\b(?:wykaz|udowod|uzasadn)\w*", statement))
    tags = statement_tags or (["dowodzenie"] if is_proof else detected_tags(ascii_fold(key_text)))

    if is_proof and "dowodzenie" not in tags:
        tags.append("dowodzenie")

    tags = expand_tag_hierarchy(tags)[:MAX_THEMATIC_TAGS]
    if not tags:
        tags = ["zadanie problemowe"]
    topic = next((tag for tag in tags if tag != "dowodzenie"), tags[0])
    hint = HINTS.get(topic, HINTS["zadanie problemowe"])
    return topic, tags, hint


def inferred_options(answer: str, task_text: str) -> tuple[str, list[str]]:
    answer = answer.upper()
    folded = ascii_fold(task_text)
    if answer in {"PP", "PF", "FP", "FF"}:
        return "true_false", ["PP", "PF", "FP", "FF"]
    if re.fullmatch(r"[A-E]\d", answer):
        return "closed", [f"{letter}{number}" for letter in "AB" for number in "123"]
    if re.fullmatch(r"[A-E]{2}", answer):
        if "literami a i b" in folded and "literami c i d" in folded:
            return "closed", ["AC", "AD", "BC", "BD"]
        visible = re.findall(r"\b([A-E])[.)]", task_text)
        highest = max(["D", *visible, *answer])
        letters = "ABCDE"[: "ABCDE".index(highest) + 1]
        return "closed", ["".join(pair) for pair in itertools.combinations(letters, 2)]
    visible = re.findall(r"\b([A-E])[.)]", task_text)
    highest = max(["D", *visible, answer])
    letters = list("ABCDE"[: "ABCDE".index(highest) + 1])
    return "closed", letters


def difficulty(max_points: int, topic: str) -> int:
    if max_points <= 1:
        return 2
    if max_points == 2:
        return 3
    if max_points <= 4:
        return 4
    return 5


def build_json(
    session: Session,
    manifest: dict[str, dict],
    task_texts: dict[str, str],
    key_texts: dict[str, str],
) -> list[dict]:
    percentages = load_completion_percentages(session)
    result = []
    for number in sorted(
        (key for key in manifest if not key.startswith("context:")),
        key=natural_task_key,
    ):
        source = manifest[number]
        topic, tags, hint = classify_task(task_texts.get(number, ""), key_texts.get(number, ""))
        item = {
            "file": source["file"],
            "difficulty": difficulty(source["maxPoints"], topic),
            "topic": topic,
            "level": session.level,
            "hint": hint,
            "answer": source.get("answer", "Sprawdź rozwiązanie i zasady oceniania."),
            "tags": merge_task_tags(tags, is_open=source["maxPoints"] > 1),
            "maxPoints": source["maxPoints"],
        }
        if "contextFile" in source:
            item["contextFile"] = source["contextFile"]
        if source["maxPoints"] == 1 and source.get("answer"):
            task_type, options = inferred_options(source["answer"], task_texts.get(number, ""))
            item["type"] = task_type
            item["options"] = options
        if number in percentages:
            item["completionPercent"] = percentages[number]
        if source.get("solutions"):
            item["solutions"] = source["solutions"]
        if source.get("gradingCriteriaFiles"):
            item["gradingCriteriaFiles"] = source["gradingCriteriaFiles"]
        result.append(item)
    return result


def audit_session(session: Session) -> dict:
    with pdfplumber.open(session.exam_pdf) as exam:
        headers, _ = collect_exam_headers(exam, session.exam_pdf)
        exam_tasks = [item for item in headers if item["kind"] == "task"]
    with pdfplumber.open(session.key_pdf) as key:
        sections, _ = collect_key_sections(key, session.key_pdf)
        global_answers = extract_global_answers(key)
    missing_key = [
        item["number"]
        for item in exam_tasks
        if item["number"] not in sections
        and not (item["maxPoints"] == 1 and item["number"] in global_answers)
    ]
    missing_answers = [
        item["number"]
        for item in exam_tasks
        if item["maxPoints"] == 1
        and not (
            (item["number"] in sections and parse_closed_answer(sections[item["number"]]))
            or item["number"] in global_answers
        )
    ]
    open_without_markers = []
    for item in exam_tasks:
        if item["maxPoints"] <= 1 or item["number"] not in sections:
            continue
        markers = [solution_marker(line["text"]) for line in sections[item["number"]]["lines"]]
        if not any(markers):
            open_without_markers.append(item["number"])
    return {
        "source": session.source_config,
        "exam": str(session.exam_pdf),
        "key": str(session.key_pdf),
        "tasks": len(exam_tasks),
        "closed": sum(item["maxPoints"] == 1 for item in exam_tasks),
        "open": sum(item["maxPoints"] > 1 for item in exam_tasks),
        "missingKeySections": missing_key,
        "missingClosedAnswers": missing_answers,
        "openWithoutMarkers": open_without_markers,
    }


def import_session(session: Session, replace: bool) -> dict:
    if session.output_dir.exists() and not replace:
        raise RuntimeError(f"Katalog docelowy już istnieje: {session.output_dir}")

    stage = ROOT / "tmp/pdfs/cke-package-stage" / session.kind / str(session.year) / session.output_dir.name
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)

    manifest, task_texts = extract_task_assets(session, stage)
    key_texts, missing_answers, missing_open_assets = extract_key_assets(session, stage, manifest)
    if missing_answers:
        raise RuntimeError(
            f"Brak odpowiedzi zamkniętych {session.detail}: {', '.join(missing_answers)}"
        )
    if missing_open_assets:
        raise RuntimeError(
            f"Brak materiałów do zadań otwartych {session.detail}: {', '.join(missing_open_assets)}"
        )

    tasks = build_json(session, manifest, task_texts, key_texts)
    (stage / f"{session.stem}.json").write_text(
        json.dumps(tasks, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    shutil.copy2(session.exam_pdf, stage / "arkusz_cke.pdf")
    shutil.copy2(session.key_pdf, stage / "zasady_oceniania_cke.pdf")

    if session.output_dir.exists():
        shutil.rmtree(session.output_dir)
    session.output_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(stage), str(session.output_dir))
    return {
        "source": session.source_config,
        "tasks": len(tasks),
        "closed": sum(item["maxPoints"] == 1 for item in tasks),
        "open": sum(item["maxPoints"] > 1 for item in tasks),
    }


def repair_task_crops(session: Session) -> dict:
    if not session.output_dir.exists():
        raise RuntimeError(f"Brak katalogu docelowego: {session.output_dir}")

    stage = ROOT / "tmp/pdfs/crop-repair-stage" / session.kind / str(session.year) / session.output_dir.name
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)

    try:
        manifest, _ = extract_task_assets(session, stage)
        filenames = sorted(
            {
                item["file"]
                for key, item in manifest.items()
                if item.get("file") and (session.write_context_assets or not key.startswith("context:"))
            }
        )

        for filename in filenames:
            source = stage / filename
            if not source.exists():
                raise RuntimeError(f"Brak wygenerowanego obrazu: {source}")
            shutil.copy2(source, session.output_dir / filename)

        return {
            "source": session.source_config,
            "tasks": len([item for key, item in manifest.items() if not key.startswith("context:")]),
            "images": len(filenames),
        }
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def extract_retag_texts(session: Session) -> tuple[dict[str, str], dict[str, str]]:
    """Read statement and key text without rendering or changing any assets."""
    task_texts = {}
    with pdfplumber.open(session.exam_pdf) as document:
        headers, lines_by_page = collect_exam_headers(document, session.exam_pdf)
        context_texts = {}
        for index, header in enumerate(headers):
            page = document.pages[header["page"]]
            text = extract_task_text(header, headers, index, lines_by_page, page)
            if header["kind"] == "context":
                context_texts[header["number"]] = text
                continue
            if "." in header["number"]:
                parent = header["number"].split(".", 1)[0]
                text = normalize_text(f"{context_texts.get(parent, '')} {text}")
            task_texts[header["number"]] = text

    key_texts = {}
    with pdfplumber.open(session.key_pdf) as document:
        sections, _ = collect_key_sections(document, session.key_pdf)
        for number, section in sections.items():
            key_texts[number] = normalize_text(
                " ".join(line["text"] for line in section["lines"])
            )

    return task_texts, key_texts


def task_number_from_file(filename: str) -> str | None:
    match = re.match(r"^(\d+(?:\.\d+)?)(?:_|(?=\.[A-Za-z][^.]*$))", str(filename or ""))
    return match.group(1) if match else None


def retag_curated_public_tasks() -> dict:
    changed = 0
    tasks = 0
    for source_path, overrides in CURATED_TAGS.items():
        path = ROOT / source_path
        items = json.loads(path.read_text(encoding="utf-8"))
        for item in items:
            if not isinstance(item, dict):
                continue
            number = task_number_from_file(item.get("file", ""))
            if number not in overrides:
                continue
            topic, thematic_tags = overrides[number]
            tags = merge_task_tags(
                item.get("tags") or [],
                thematic_tags,
                is_open=int(item.get("maxPoints", 1)) > 1,
            )
            current = (topic, tags, HINTS.get(topic, HINTS["zadanie problemowe"]))
            previous = (item.get("topic"), item.get("tags"), item.get("hint"))
            if current != previous:
                item["topic"], item["tags"], item["hint"] = current
                changed += 1
            tasks += 1
        path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"sources": len(CURATED_TAGS), "tasks": tasks, "changed": changed}


def ocr_task_text(image_path: Path) -> str:
    """Read a task image only when PDF text extraction did not find a topic."""
    if not image_path.exists():
        return ""
    try:
        result = subprocess.run(
            ["tesseract", str(image_path), "stdout", "-l", "eng"],
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return normalize_text(result.stdout)


SQUARE_NOUN_RE = re.compile(
    r"\b(?:kwadrat(?:u|em|y|ow|ami|ach)?|kwadrac(?:ie|y|om|ami|ach))\b"
)
RECTANGLE_NOUN_RE = re.compile(
    r"\b(?:prostokat(?:u|em|y|ow|ami|ach)?|prostokac(?:ie|y|om|ami|ach))\b"
)
QUADRILATERAL_EVIDENCE_RE = re.compile(
    r"\b(?:czworokat\w*|trapez\w*|romb\w*|rownoleglobok\w*|deltoid\w*|wielokat\w*)\b"
)


def remove_false_shape_tags(raw_tags, statement: str, topic: str = "") -> list[str]:
    """Drop shape tags caused only by adjectives such as 'kwadratowa'."""
    tags = [canonical_tag_label(tag) for tag in raw_tags]
    text = ascii_fold(statement)
    removed_shape = False

    if "kwadrat" in tags and not SQUARE_NOUN_RE.search(text):
        tags = [tag for tag in tags if tag != "kwadrat"]
        removed_shape = True
    if "prostokąt" in tags and not RECTANGLE_NOUN_RE.search(text):
        tags = [tag for tag in tags if tag != "prostokąt"]
        removed_shape = True

    if removed_shape and "czworokąty" in tags:
        has_supported_child = any(
            "czworokąty" in TAG_PARENTS.get(tag, ())
            for tag in tags
        )
        is_direct_topic = canonical_tag_label(topic) == "czworokąty"
        if (
            not has_supported_child
            and not is_direct_topic
            and not QUADRILATERAL_EVIDENCE_RE.search(text)
        ):
            tags = [tag for tag in tags if tag != "czworokąty"]

    return tags


def retag_session(session: Session, write: bool) -> dict:
    if not session.json_path.exists():
        raise RuntimeError(f"Brak danych zadań: {session.json_path}")

    items = json.loads(session.json_path.read_text(encoding="utf-8"))
    if not isinstance(items, list):
        raise RuntimeError(f"Nieprawidłowy plik JSON: {session.json_path}")

    task_texts, key_texts = extract_retag_texts(session)
    reviewed_tags_by_task = REVIEWED_FALLBACK_TAGS.get(
        session.json_path.relative_to(ROOT).as_posix(),
        {},
    )
    changed = 0
    unmatched = []
    fallback = 0
    ocr_assisted = 0

    for item in items:
        if not isinstance(item, dict):
            continue
        number = task_number_from_file(item.get("file", ""))
        if not number or (number not in task_texts and number not in key_texts):
            unmatched.append(str(item.get("file", "?")))
            continue

        statement = task_texts.get(number, "")
        if not detected_tags(ascii_fold(statement)):
            recognized = ocr_task_text(session.output_dir / str(item.get("file", "")))
            if recognized:
                statement = normalize_text(f"{statement} {recognized}")
                ocr_assisted += 1

        inferred_topic, inferred_tags, inferred_hint = classify_task(
            statement,
            key_texts.get(number, ""),
        )
        reviewed_tags = reviewed_tags_by_task.get(number, ())
        if reviewed_tags:
            inferred_tags = [*reviewed_tags, *inferred_tags]
            if inferred_topic == "zadanie problemowe":
                inferred_topic = canonical_tag_label(reviewed_tags[0])
                inferred_hint = HINTS.get(inferred_topic, inferred_hint)
        if inferred_topic == "zadanie problemowe":
            fallback += 1

        existing_tags = remove_false_shape_tags(
            item.get("tags") or [],
            statement,
            item.get("topic", ""),
        )
        tags = merge_task_tags(
            existing_tags,
            inferred_tags,
            is_open=int(item.get("maxPoints", 1)) > 1,
        )
        existing_topic = canonical_tag_label(item.get("topic", ""))
        topic = (
            existing_topic
            if is_thematic_tag(existing_topic) and tag_key(existing_topic) != "zadanie problemowe"
            else inferred_topic
        )
        hint = item.get("hint") or HINTS.get(topic, inferred_hint)

        previous = (item.get("topic"), item.get("tags"), item.get("hint"))
        current = (topic, tags, hint)
        if previous != current:
            item["topic"] = topic
            item["tags"] = tags
            item["hint"] = hint
            changed += 1

    if write:
        session.json_path.write_text(
            json.dumps(items, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    return {
        "source": session.source_config,
        "tasks": len(items),
        "changed": changed,
        "fallback": fallback,
        "unmatched": unmatched,
        "ocrAssisted": ocr_assisted,
    }


def public_task_source_paths() -> list[str]:
    html = (ROOT / "zadania.html").read_text(encoding="utf-8")
    match = re.search(r"const TASK_SOURCES = \[(.*?)\n\];", html, re.DOTALL)
    if not match:
        raise RuntimeError("Nie znaleziono listy TASK_SOURCES w zadania.html")
    paths = re.findall(
        r'\{\s*path:\s*"([^"]+\.json)"\s*,\s*category:\s*"egzaminy"[^}]*\}',
        match.group(1),
    )
    return list(dict.fromkeys(paths))


def is_thematic_tag(tag: str) -> bool:
    key = tag_key(tag)
    return (
        bool(key)
        and key not in NON_THEMATIC_TAGS
        and not key.startswith("lekcja ")
        and not key.startswith("arkusz cke")
    )


def merge_task_tags(*tag_groups, is_open: bool) -> list[str]:
    """Canonicalize direct tags and add their related umbrella topics."""
    direct = []
    seen_direct = set()
    for group in tag_groups:
        for raw_tag in group:
            tag = canonical_tag_label(raw_tag)
            key = tag_key(tag)
            if not is_thematic_tag(tag) or key in seen_direct:
                continue
            direct.append(tag)
            seen_direct.add(key)

    expanded = []
    seen_expanded = set()
    for tag in expand_tag_hierarchy(direct):
        key = tag_key(tag)
        if not is_thematic_tag(tag) or key in seen_expanded:
            continue
        expanded.append(tag)
        seen_expanded.add(key)

    if not expanded:
        expanded = ["zadanie problemowe"]
    return expanded[:MAX_THEMATIC_TAGS] + (["zadania-otwarte"] if is_open else [])


def normalize_public_task_tags() -> dict:
    """Normalize and expand every source that is exposed by the task browser."""
    changed = 0
    tasks = 0
    for source_path in public_task_source_paths():
        path = ROOT / source_path
        items = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(items, list):
            continue
        source_changed = False
        for item in items:
            if not isinstance(item, dict):
                continue
            tags = item.get("tags") or []
            if not any(is_thematic_tag(tag) for tag in tags):
                tags = [item.get("topic", ""), *tags]
            normalized = merge_task_tags(
                tags,
                is_open=int(item.get("maxPoints", 1)) > 1,
            )
            if item.get("tags") != normalized:
                item["tags"] = normalized
                changed += 1
                source_changed = True
            tasks += 1
        if source_changed:
            path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"sources": len(public_task_source_paths()), "tasks": tasks, "changed": changed}


def build_tag_index() -> dict:
    levels = {}
    task_count = 0
    source_paths = public_task_source_paths()

    for source_path in source_paths:
        path = ROOT / source_path
        if not path.exists():
            raise RuntimeError(f"Brak publicznego źródła zadań: {source_path}")
        items = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(items, list):
            continue
        task_count += len(items)

        for item in items:
            if not isinstance(item, dict):
                continue
            level = item.get("level")
            if not level:
                continue
            level_index = levels.setdefault(level, {})
            tags = item.get("tags") or [item.get("topic")]
            for raw_tag in tags:
                if not is_thematic_tag(raw_tag):
                    continue
                label = canonical_tag_label(raw_tag)
                key = tag_key(label)
                if not is_thematic_tag(label):
                    continue
                entry = level_index.setdefault(key, {"label": label, "sources": []})
                if source_path not in entry["sources"]:
                    entry["sources"].append(source_path)

    ordered_levels = {}
    for level, entries in levels.items():
        ordered_levels[level] = {
            key: entries[key]
            for key in sorted(entries, key=lambda value: entries[value]["label"].lower())
        }
    return {
        "version": 3,
        "sources": len(source_paths),
        "tasks": task_count,
        "levels": ordered_levels,
    }


def write_tag_index() -> dict:
    index = build_tag_index()
    path = ROOT / "zadania/tag-index.json"
    path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return index


def selected_sessions(all_sessions: list[Session], filters: list[str]) -> list[Session]:
    if not filters:
        return all_sessions
    selected = []
    for session in all_sessions:
        identity = f"{session.kind}:{session.year}:{session.output_dir.name}"
        if any(identity.startswith(value) for value in filters):
            selected.append(session)
    return selected


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", action="store_true")
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--repair-task-crops", action="store_true")
    parser.add_argument("--retag", action="store_true")
    parser.add_argument("--retag-curated", action="store_true")
    parser.add_argument("--normalize-public-tags", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--only", action="append", default=[])
    args = parser.parse_args()

    exclusive_actions = sum(
        bool(value)
        for value in (
            args.audit,
            args.repair_task_crops,
            args.retag,
            args.retag_curated,
            args.normalize_public_tags,
        )
    )
    if exclusive_actions > 1:
        parser.error("wybrane działania importera są wzajemnie wykluczające")
    if args.retag and args.replace:
        parser.error("--retag nie łączy się z --replace")
    if args.dry_run and not args.retag:
        parser.error("--dry-run jest dostępne tylko z --retag")

    if args.retag_curated:
        if args.only:
            parser.error("--retag-curated nie obsługuje --only")
        report = retag_curated_public_tasks()
        normalized = normalize_public_task_tags()
        index = write_tag_index()
        print(
            f"Gotowe: źródła={report['sources']}, zadania={report['tasks']}, "
            f"zmienione={report['changed'] + normalized['changed']}, "
            f"tagi={sum(len(value) for value in index['levels'].values())}",
            flush=True,
        )
        return

    if args.normalize_public_tags:
        if args.only:
            parser.error("--normalize-public-tags nie obsługuje --only")
        report = normalize_public_task_tags()
        index = write_tag_index()
        print(
            f"Gotowe: źródła={report['sources']}, zadania={report['tasks']}, "
            f"zmienione={report['changed']}, tagi={sum(len(value) for value in index['levels'].values())}",
            flush=True,
        )
        return

    all_sessions = build_sessions()
    if args.retag:
        all_sessions.extend(build_local_exam_sessions())
    elif args.repair_task_crops:
        all_sessions.extend(build_legacy_matura_sessions())
    if args.retag and not args.only:
        session_paths = {session.json_path.relative_to(ROOT).as_posix() for session in all_sessions}
        manual_only_sources = {"zadania/eo/2025/maj/2025_cke_o_m.json"}
        missing = sorted(set(public_task_source_paths()) - session_paths - manual_only_sources)
        if missing:
            raise RuntimeError(f"Brak źródeł do retagowania: {', '.join(missing)}")
    sessions = selected_sessions(all_sessions, args.only)
    if not sessions:
        raise SystemExit("Brak sesji pasujących do filtra.")

    report = []
    for index, session in enumerate(sessions, 1):
        action = (
            "NAPRAWA WYCINKÓW"
            if args.repair_task_crops
            else "RETAGOWANIE"
            if args.retag
            else "AUDYT"
            if args.audit
            else "IMPORT"
        )
        print(f"[{index}/{len(sessions)}] {action}: {session.kind} {session.detail}", flush=True)
        if args.repair_task_crops:
            report.append(repair_task_crops(session))
        elif args.retag:
            report.append(retag_session(session, write=not args.dry_run))
        else:
            report.append(audit_session(session) if args.audit else import_session(session, args.replace))

    if args.repair_task_crops:
        print(
            f"Gotowe: sesje={len(report)}, zadania={sum(item['tasks'] for item in report)}, "
            f"obrazy={sum(item['images'] for item in report)}",
            flush=True,
        )
        return

    if args.retag:
        curated = {"changed": 0}
        normalized = {"changed": 0}
        if not args.dry_run:
            curated = retag_curated_public_tasks()
            normalized = normalize_public_task_tags()
        index = build_tag_index() if args.dry_run else write_tag_index()
        changed = sum(item["changed"] for item in report) + curated["changed"] + normalized["changed"]
        fallback = sum(item["fallback"] for item in report)
        ocr_assisted = sum(item["ocrAssisted"] for item in report)
        unmatched = [name for item in report for name in item["unmatched"]]
        mode = "Sprawdzenie" if args.dry_run else "Gotowe"
        print(
            f"{mode}: sesje={len(report)}, zadania={sum(item['tasks'] for item in report)}, "
            f"zmienione={changed}, ogólne={fallback}, niepowiązane={len(unmatched)}, "
            f"OCR={ocr_assisted}, źródła indeksu={index['sources']}, "
            f"tagi={sum(len(value) for value in index['levels'].values())}",
            flush=True,
        )
        if unmatched:
            print(f"Niepowiązane pliki: {', '.join(unmatched)}", flush=True)
        return

    report_path = ROOT / "tmp/pdfs/cke_package_audit.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Gotowe: sesje={len(report)}, zadania={sum(item['tasks'] for item in report)}, raport={report_path}",
        flush=True,
    )


if __name__ == "__main__":
    main()
