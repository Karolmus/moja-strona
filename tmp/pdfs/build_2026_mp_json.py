from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LEVEL = "matura_podstawowa"


def closed(number, answer, difficulty, topic, hint, tags):
    return {
        "number": str(number),
        "difficulty": difficulty,
        "topic": topic,
        "hint": hint,
        "answer": answer,
        "type": "closed",
        "options": ["A", "B", "C", "D"],
        "tags": tags,
    }


def true_false(number, answer, difficulty, topic, hint, tags):
    return {
        "number": str(number),
        "difficulty": difficulty,
        "topic": topic,
        "hint": hint,
        "answer": answer,
        "type": "true_false",
        "options": ["PP", "PF", "FP", "FF"],
        "tags": tags,
    }


def open_task(number, answer, difficulty, topic, hint, tags):
    return {
        "number": str(number),
        "difficulty": difficulty,
        "topic": topic,
        "hint": hint,
        "answer": answer,
        "tags": tags,
    }


MAY = [
    closed(1, "C", 2, "pierwiastki", "Uprość pierwiastek, a następnie oblicz potęgę o wykładniku ujemnym.", ["pierwiastki", "potęgi", "działania-na-liczbach"]),
    closed(2, "B", 2, "procent składany", "Po każdym roku pomnóż bieżący kapitał przez 1,06, a od wyniku odejmij wpłaconą kwotę.", ["procenty", "procent-składany", "zadania-tekstowe"]),
    closed(3, "C", 2, "potęgi i pierwiastki", "Zapisz pierwiastki w postaci potęg i zastosuj prawa działań na potęgach.", ["potęgi", "pierwiastki", "działania-na-liczbach"]),
    closed(4, "B", 2, "logarytmy", "Zastosuj wzory na logarytm iloczynu, ilorazu lub potęgi.", ["logarytmy", "działania-na-liczbach"]),
    true_false(5, "PP", 3, "potęgi i podzielność", "Wyłącz wspólną potęgę przed nawias i sprawdź podzielność otrzymanego czynnika.", ["potęgi", "podzielność", "prawda-fałsz"]),
    closed(6, "A", 2, "wzory skróconego mnożenia", "Rozpoznaj kwadrat sumy, kwadrat różnicy albo różnicę kwadratów.", ["wzory-skróconego-mnożenia", "wyrażenia-algebraiczne"]),
    open_task(7, "Wyrażenie 7n² + 21n jest podzielne przez 14 dla każdej liczby naturalnej n.", 4, "dowód algebraiczny", "Rozpatrz osobno parzyste i nieparzyste wartości n albo wyłącz wspólny czynnik i zbadaj parzystość.", ["dowodzenie", "podzielność", "dowody-algebraiczne"]),
    closed(8, "C", 3, "równanie z parametrem", "Skorzystaj z zasady iloczynu równego zeru i sprawdź, kiedy wskazany czynnik daje wymagane rozwiązanie.", ["równania", "parametr", "wyrażenia-algebraiczne"]),
    closed(9, "D", 3, "równanie wymierne", "Najpierw zapisz założenia, a następnie usuń mianowniki i rozwiąż otrzymane równanie.", ["równania-wymierne", "wyrażenia-wymierne", "dziedzina"]),
    open_task(10, "x ∈ (−∞, −4/3] ∪ [2, +∞)", 3, "nierówność kwadratowa", "Przenieś wszystko na jedną stronę, wyznacz miejsca zerowe i odczytaj znak trójmianu.", ["nierówności-kwadratowe", "funkcja-kwadratowa", "przedziały-liczbowe"]),
    open_task(11, "78", 3, "układ równań", "Oznacz liczby biletów dwiema niewiadomymi i zapisz równania opisujące ich łączną liczbę oraz przychód.", ["układy-równań", "zadania-tekstowe", "modelowanie-matematyczne"]),
    open_task("12.1", "1. x = 1. 2. Największa wartość funkcji na przedziale [2, 3] jest równa 4.", 2, "odczytywanie z wykresu", "Odczytaj z wykresu przecięcie z odpowiednią prostą oraz największą wysokość wykresu na podanym przedziale.", ["funkcje", "odczytywanie-z-wykresu", "wartości-funkcji"]),
    open_task("12.2", "1. [−2, 4]. 2. (−1, 4).", 2, "dziedzina i wartości funkcji", "Zwróć uwagę na otwarte i domknięte końce wykresu oraz na poziom wskazany w warunku.", ["funkcje", "dziedzina-funkcji", "odczytywanie-z-wykresu"]),
    true_false("13.1", "FF", 2, "funkcja liniowa", "Odczytaj z wykresu znaki współczynnika kierunkowego i wyrazu wolnego.", ["funkcja-liniowa", "wykres-funkcji", "prawda-fałsz"]),
    closed("13.2", "A", 2, "funkcja liniowa", "Współczynnik kierunkowy prostej jest równy tangensowi kąta jej nachylenia do osi Ox.", ["funkcja-liniowa", "współczynnik-kierunkowy", "trygonometria"]),
    open_task(14, "f(x) = 1/2 x² − 3x + 5/2", 4, "funkcja kwadratowa", "Wykorzystaj przesunięcie wykresu, oś symetrii oraz podane miejsce zerowe do wyznaczenia wzoru funkcji.", ["funkcja-kwadratowa", "postać-kanoniczna", "przesunięcia-wykresu"]),
    open_task(15, "k = 41", 3, "ciągi", "Wyznacz wskazane wyrazy ciągu arytmetycznego, a następnie użyj własności ciągu geometrycznego.", ["ciąg-arytmetyczny", "ciąg-geometryczny", "ciągi"]),
    closed(16, "B", 2, "ciąg arytmetyczny", "Skorzystaj ze wzoru na n-ty wyraz ciągu arytmetycznego.", ["ciąg-arytmetyczny", "ciągi"]),
    open_task(17, "18", 2, "ciąg geometryczny", "Zastosuj własność trzech kolejnych wyrazów ciągu geometrycznego.", ["ciąg-geometryczny", "ciągi"]),
    closed(18, "C", 2, "trygonometria", "Dobierz funkcję trygonometryczną łączącą wskazane boki trójkąta prostokątnego.", ["trygonometria", "trójkąt-prostokątny"]),
    closed(19, "C", 2, "kąty w okręgu", "Porównaj kąty środkowe i wpisane oparte na tym samym łuku.", ["okrąg", "kąt-wpisany", "kąt-środkowy"]),
    closed(20, "B", 3, "podobieństwo trójkątów", "Wskaż pary odpowiadających sobie boków w trójkątach podobnych.", ["podobieństwo-trójkątów", "twierdzenie-Talesa", "geometria"]),
    open_task(21, "P_KNM / P_NLM = a/b", 4, "pola trójkątów", "Zapisz pola obu trójkątów z wykorzystaniem wspólnej wysokości albo wspólnego boku i sinusa kąta.", ["dowodzenie", "pola-trójkątów", "dwusieczna"]),
    open_task(22, "27", 2, "trójkąt równoboczny", "Połącz promień okręgu opisanego z długością boku trójkąta równobocznego.", ["trójkąt-równoboczny", "okrąg-opisany", "geometria"]),
    closed(23, "D", 2, "trygonometria", "Zapisz tangens wskazanego kąta jako iloraz odpowiednich boków.", ["trygonometria", "trójkąt-prostokątny"]),
    closed("24.1", "B", 3, "geometria analityczna", "Wyznacz potrzebne długości lub wysokość z danych współrzędnych, a potem oblicz pole.", ["geometria-analityczna", "pole-figury", "układ-współrzędnych"]),
    closed("24.2", "D", 3, "okrąg opisany", "Środek okręgu opisanego jest punktem jednakowo odległym od wszystkich wierzchołków.", ["geometria-analityczna", "okrąg-opisany", "symetralna"]),
    true_false(25, "PF", 2, "równanie okręgu", "Odczytaj środek i promień bezpośrednio z postaci kanonicznej równania okręgu.", ["okrąg", "równanie-okręgu", "prawda-fałsz"]),
    closed(26, "D", 2, "równanie prostej", "Wyznacz współczynnik kierunkowy z warunku równoległości lub prostopadłości i podstaw punkt.", ["równanie-prostej", "geometria-analityczna"]),
    open_task(27, "V = 128", 3, "ostrosłup", "Wyznacz wysokość ostrosłupa z trójkąta prostokątnego, a następnie zastosuj wzór na objętość.", ["ostrosłup", "objętość", "stereometria"]),
    closed(28, "D", 3, "bryły obrotowe", "Porównaj objętości po zapisaniu promieni, wysokości i właściwych wzorów.", ["bryły-obrotowe", "objętość", "stereometria"]),
    closed(29, "A", 2, "kombinatoryka", "Rozbij wybór na etapy i zastosuj regułę mnożenia.", ["kombinatoryka", "reguła-mnożenia"]),
    open_task(30, "P(A) = 9/25", 3, "prawdopodobieństwo", "Policz wszystkie uporządkowane wyniki doświadczenia oraz te, które spełniają warunek zdarzenia.", ["prawdopodobieństwo-klasyczne", "kombinatoryka", "zdarzenia-elementarne"]),
    true_false(31, "PP", 2, "statystyka", "Odczytaj liczebności z diagramu i porównaj je z treścią obu zdań.", ["statystyka", "odczytywanie-danych", "prawda-fałsz"]),
    closed(32, "C", 2, "średnia ważona", "Zapisz równanie dla średniej ważonej, uwzględniając liczebność każdej grupy.", ["średnia-ważona", "statystyka", "zadania-tekstowe"]),
    closed("33.1", "D", 3, "modelowanie funkcją kwadratową", "Przyrównaj opisującą sytuację funkcję do wskazanej wartości i rozwiąż równanie.", ["funkcja-kwadratowa", "modelowanie-matematyczne", "miejsca-zerowe"]),
    closed("33.2", "A", 3, "optymalizacja", "Największą wartość funkcji kwadratowej skierowanej ramionami w dół odczytasz w jej wierzchołku.", ["funkcja-kwadratowa", "optymalizacja", "wierzchołek-paraboli"]),
]


JUNE = [
    closed(1, "C", 2, "pierwiastki", "Zastosuj własności pierwiastków nieparzystego stopnia, również dla liczb ujemnych.", ["pierwiastki", "działania-na-liczbach"]),
    closed(2, "C", 2, "potęgi", "Wyłącz wspólną potęgę albo sprowadź wszystkie składniki do tej samej podstawy.", ["potęgi", "działania-na-liczbach"]),
    closed(3, "B", 2, "logarytmy", "Zastosuj definicję logarytmu i wzory na działania na logarytmach.", ["logarytmy", "działania-na-liczbach"]),
    closed(4, "A", 2, "rozkład wielomianu", "Wyłącz wspólny czynnik i użyj wzoru skróconego mnożenia.", ["wielomiany", "rozkład-na-czynniki", "wzory-skróconego-mnożenia"]),
    open_task(5, "Liczba 7ⁿ + 7ⁿ⁺¹ + 7ⁿ⁺² jest podzielna przez 19 dla każdej liczby całkowitej n ≥ 0.", 3, "dowód algebraiczny", "Wyłącz 7ⁿ przed nawias i oblicz wartość pozostałego czynnika.", ["dowodzenie", "podzielność", "potęgi"]),
    closed(6, "A", 2, "działania na wielomianach", "Wykonaj działania na wielomianach i zredukuj wyrazy podobne.", ["wielomiany", "wyrażenia-algebraiczne"]),
    closed(7, "B", 2, "nierówność kwadratowa", "Wyznacz miejsca zerowe trójmianu i sprawdź, w których przedziałach ma wymagany znak.", ["nierówności-kwadratowe", "funkcja-kwadratowa", "przedziały-liczbowe"]),
    open_task(8, "x = −3/4", 3, "równanie wymierne", "Zapisz dziedzinę, usuń mianowniki i odrzuć rozwiązania niespełniające założeń.", ["równania-wymierne", "wyrażenia-wymierne", "dziedzina"]),
    closed(9, "D", 3, "układ równań", "Oznacz szukane wielkości niewiadomymi i przełóż oba warunki zadania na równania.", ["układy-równań", "zadania-tekstowe", "modelowanie-matematyczne"]),
    true_false(10, "PF", 2, "funkcja liniowa", "Odczytaj z wykresu współczynnik kierunkowy i miejsce przecięcia z osią Oy.", ["funkcja-liniowa", "wykres-funkcji", "prawda-fałsz"]),
    closed(11, "C", 2, "funkcja kwadratowa", "Skorzystaj z iloczynowej postaci funkcji i odczytaj jej miejsca zerowe.", ["funkcja-kwadratowa", "miejsca-zerowe"]),
    open_task("12.1", "1. 3. 2. 2.", 2, "odczytywanie z wykresu", "Odczytaj odpowiednie argumenty i wartości bezpośrednio z wykresu.", ["funkcje", "odczytywanie-z-wykresu", "wartości-funkcji"]),
    open_task("12.2", "1. [−5, 4). 2. [−7/2, 3].", 2, "dziedzina i znak funkcji", "Uwzględnij otwarte i domknięte końce wykresu, a potem wskaż część leżącą na osi lub nad nią.", ["funkcje", "dziedzina-funkcji", "odczytywanie-z-wykresu"]),
    closed("13.1", "A", 2, "symetria paraboli", "Wykorzystaj położenie osi symetrii paraboli względem wskazanych punktów.", ["funkcja-kwadratowa", "oś-symetrii", "wykres-funkcji"]),
    closed("13.2", "D", 2, "przesunięcia wykresu", "Rozpoznaj, jak zmienia się wzór funkcji po przesunięciu wykresu.", ["funkcja-kwadratowa", "przesunięcia-wykresu"]),
    closed("14.1", "C", 3, "ciąg rekurencyjny", "Oblicz kolejne wyrazy zgodnie z podanym wzorem rekurencyjnym.", ["ciągi", "ciąg-rekurencyjny"]),
    true_false("14.2", "PP", 3, "ciąg arytmetyczny", "Wyznacz różnicę ciągu i sprawdź warunki z obu zdań.", ["ciąg-arytmetyczny", "monotoniczność", "prawda-fałsz"]),
    open_task(15, "a₂ = 34/3", 3, "ciąg arytmetyczny", "Zapisz wskazane wyrazy za pomocą pierwszego wyrazu i różnicy albo użyj własności średniej arytmetycznej.", ["ciąg-arytmetyczny", "ciągi"]),
    closed(16, "C", 2, "ciąg geometryczny", "Zastosuj wzór na n-ty wyraz ciągu geometrycznego lub własność kolejnych wyrazów.", ["ciąg-geometryczny", "ciągi"]),
    closed(17, "B", 2, "trygonometria", "Dobierz funkcję trygonometryczną wiążącą podane boki i kąt.", ["trygonometria", "trójkąt-prostokątny"]),
    closed(18, "C", 2, "kąty w okręgu", "Skorzystaj z zależności między kątem wpisanym i środkowym opartymi na tym samym łuku.", ["okrąg", "kąt-wpisany", "kąt-środkowy"]),
    closed(19, "B", 3, "podobieństwo trójkątów", "Znajdź trójkąty podobne i zapisz proporcję odpowiadających sobie boków.", ["podobieństwo-trójkątów", "twierdzenie-Talesa", "geometria"]),
    open_task(20, "∠CAB = 2 · ∠ABE", 4, "dowód geometryczny", "Wykorzystaj trójkąt równoramienny powstały dzięki środkowi przeciwprostokątnej oraz zależności między kątami.", ["dowodzenie", "geometria", "kąty-w-trójkącie"]),
    closed(21, "A", 2, "trygonometria", "Dla kąta rozwartego ustal znaki funkcji trygonometrycznych i użyj odpowiedniej tożsamości.", ["trygonometria", "kąt-rozwarty"]),
    open_task(22, "S = (11, 18)", 4, "geometria analityczna", "Wyznacz brakujący wierzchołek lub środek przekątnej równoległoboku, korzystając z równań prostych i środków odcinków.", ["geometria-analityczna", "równoległobok", "równanie-prostej"]),
    closed(23, "B", 2, "odległość punktów", "Zastosuj wzór na odległość dwóch punktów w układzie współrzędnych.", ["geometria-analityczna", "odległość-punktów", "kwadrat"]),
    closed(24, "C", 2, "równanie okręgu", "Odczytaj środek i promień z postaci kanonicznej, a następnie sprawdź warunek zadania.", ["okrąg", "równanie-okręgu", "geometria-analityczna"]),
    closed(25, "D", 3, "ostrosłup", "Wyznacz pole podstawy i wysokość bryły, a potem zastosuj wzór na objętość ostrosłupa.", ["ostrosłup", "objętość", "stereometria"]),
    true_false(26, "PP", 2, "stożek", "Zapisz zależności w przekroju osiowym stożka oraz właściwe wzory na pole i objętość.", ["stożek", "bryły-obrotowe", "prawda-fałsz"]),
    open_task(27, "V = 18π√3; P_c = 18π + 12π√3", 4, "walec", "Z przekroju walca wyznacz promień i wysokość, używając funkcji trygonometrycznych, a potem oblicz objętość i pole.", ["walec", "bryły-obrotowe", "stereometria"]),
    closed(28, "A", 2, "kombinatoryka", "Rozbij wybór na kolejne etapy i zastosuj regułę mnożenia.", ["kombinatoryka", "reguła-mnożenia"]),
    closed(29, "A", 2, "średnia ważona", "Zapisz średnią jako iloraz sumy wszystkich wartości i ich liczby.", ["średnia-ważona", "statystyka"]),
    closed(30, "C", 2, "mediana", "Uporządkuj dane lub odczytaj środkową pozycję z diagramu.", ["mediana", "statystyka", "odczytywanie-danych"]),
    open_task(31, "P(A) = 7/30", 3, "prawdopodobieństwo", "Policz wszystkie uporządkowane pary, a następnie zaznacz te spełniające warunek zdarzenia.", ["prawdopodobieństwo-klasyczne", "kombinatoryka", "zdarzenia-elementarne"]),
    open_task(32, "P(x) = x² − 2x + 8; minimum dla x = 1, więc |CF| = 1", 4, "optymalizacja", "Zapisz pole szukanego trójkąta jako pole kwadratu pomniejszone o pola trzech trójkątów narożnych.", ["optymalizacja", "funkcja-kwadratowa", "pola-figur"]),
]


def build(session, metadata):
    manifest_path = ROOT / f"tmp/pdfs/2026-{session}-mp-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest_tasks = {key for key in manifest if not key.startswith("context:")}
    metadata_tasks = {item["number"] for item in metadata}

    if manifest_tasks != metadata_tasks:
        missing = sorted(manifest_tasks - metadata_tasks)
        extra = sorted(metadata_tasks - manifest_tasks)
        raise RuntimeError(f"Niezgodne numery {session}: brak={missing}, nadmiar={extra}")

    result = []
    for item in metadata:
        number = item.pop("number")
        assets = manifest[number]
        task = {
            "file": assets["file"],
            "difficulty": item["difficulty"],
            "topic": item["topic"],
            "level": LEVEL,
            "hint": item["hint"],
            "answer": item["answer"],
        }
        if "type" in item:
            task["type"] = item["type"]
            task["options"] = item["options"]
        task["tags"] = item["tags"]
        task["maxPoints"] = assets["maxPoints"]

        for field in ("contextFile", "solutions", "gradingCriteriaFiles"):
            if field in assets:
                task[field] = assets[field]

        result.append(task)

    output = ROOT / "zadania/mp/2026" / session / f"2026_cke_p_{'m' if session == 'maj' else 'c'}.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"{output.relative_to(ROOT)}: {len(result)} zadań, {sum(item['maxPoints'] for item in result)} pkt")


build("maj", MAY)
build("czerwiec", JUNE)
