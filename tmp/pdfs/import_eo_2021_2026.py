from __future__ import annotations

import json
import re
import shutil
from collections import Counter
from pathlib import Path

import numpy as np
import pdfplumber
from PIL import Image, ImageChops, ImageOps


ROOT = Path(__file__).resolve().parents[2]
RESOLUTION = 200
SCALE = RESOLUTION / 72
X0 = 55
X1 = 540
PAGE_TOP = 48
PAGE_BOTTOM = 770

TASK_HEADER_RE = re.compile(r"Zadanie\s+(\d+)\.\s*\(0[–-](\d+)\)")

CONFIGS = [
    {
        "year": 2021,
        "stem": "2021_cke_o_m",
        "exam": Path("/Users/karolmusiol/Downloads/OMAP-100-X-2105.pdf"),
        "key": Path("/Users/karolmusiol/Downloads/OMAP-100-2105-zasady.pdf"),
        "output": ROOT / "zadania/eo/2021/maj",
        "task_sources": [
            {
                "path": Path("/Users/karolmusiol/Downloads/OMAP-100-X-2105.pdf"),
                "allowed": {str(number) for number in range(1, 20)},
                "red_grid": False,
            }
        ],
        "open_tasks": {"16", "17", "18", "19"},
        "source_files": [
            (Path("/Users/karolmusiol/Downloads/OMAP-100-X-2105.pdf"), "OMAP-100-X-2105.pdf"),
            (Path("/Users/karolmusiol/Downloads/OMAP-100-2105-zasady.pdf"), "OMAP-100-2105-zasady.pdf"),
        ],
    },
    {
        "year": 2026,
        "stem": "2026_cke_o_m",
        "exam": Path("/Users/karolmusiol/Downloads/OMAP-100-X-2605-zeszyt-zadan.pdf"),
        "key": Path("/Users/karolmusiol/Downloads/OMAP-100-2605-zasady.pdf"),
        "output": ROOT / "zadania/eo/2026/maj",
        "task_sources": [
            {
                "path": Path("/Users/karolmusiol/Downloads/OMAP-100-X-2605-zeszyt-zadan.pdf"),
                "allowed": {str(number) for number in range(1, 15)},
                "red_grid": False,
            },
            {
                "path": ROOT / "tmp/pdfs/OMAP-100-X-2605-karta-rozwiazan.pdf",
                "allowed": {str(number) for number in range(15, 21)},
                "red_grid": True,
                "figure_boxes": {
                    "18": {
                        "statement_bottom": 252,
                        "figure": (82, 280, 225, 412),
                    },
                    "20": {
                        "statement_bottom": 250,
                        "figure": (70, 265, 525, 374),
                    },
                },
            },
        ],
        "open_tasks": {"15", "16", "17", "18", "19", "20"},
        "source_files": [
            (
                Path("/Users/karolmusiol/Downloads/OMAP-100-X-2605-zeszyt-zadan.pdf"),
                "OMAP-100-X-2605-zeszyt-zadan.pdf",
            ),
            (Path("/Users/karolmusiol/Downloads/OMAP-100-2605-zasady.pdf"), "OMAP-100-2605-zasady.pdf"),
            (
                ROOT / "tmp/pdfs/OMAP-100-X-2605-karta-rozwiazan.pdf",
                "OMAP-100-X-2605-karta-rozwiazan.pdf",
            ),
        ],
    },
]


def closed(number, answer, difficulty, topic, hint, tags, options=None):
    return {
        "number": str(number),
        "difficulty": difficulty,
        "topic": topic,
        "hint": hint,
        "answer": answer,
        "type": "closed",
        "options": options or ["A", "B", "C", "D"],
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
        "tags": [*tags, "zadania-otwarte"],
    }


TASKS_2021 = [
    true_false(1, "FP", 2, "diagramy i średnia arytmetyczna", "Odczytaj z diagramu liczbę medali każdego koloru dla wszystkich lat, a następnie oblicz sumę i średnią.", ["diagramy", "odczytywanie-danych", "średnia-arytmetyczna"]),
    closed(2, "B", 1, "działania na liczbach", "Oblicz kolejno wartości czterech wyrażeń, uważając na znaki liczb ujemnych.", ["działania-na-liczbach", "liczby-ujemne", "ułamki-dziesiętne"]),
    closed(3, "BC", 2, "ułamki", "Sprowadź ułamki do wspólnego mianownika albo porównaj ich wartości.", ["ułamki", "porównywanie-liczb"], ["AC", "AD", "BC", "BD"]),
    closed(4, "A", 2, "potęgi", "Zapisz 60 000 000 jako iloczyn liczby 6 i potęgi dziesięciu.", ["potęgi", "działania-na-potęgach"]),
    closed(5, "A3", 3, "podzielność", "Wśród pięciu kolejnych liczb znajdź czynnik parzysty i wielokrotność 5.", ["podzielność", "liczby-całkowite", "uzasadnianie"], ["A1", "A2", "A3", "B1", "B2", "B3"]),
    closed(6, "AD", 2, "procenty", "Wybierz właściwy wiersz tabeli i podstaw podstawę podatku dokładnie do podanego wzoru.", ["procenty", "wyrażenia-arytmetyczne", "odczytywanie-tabel"], ["AC", "AD", "BC", "BD"]),
    closed(7, "A", 2, "pierwiastki", "Oszacuj pierwiastek z 10 między dwiema kolejnymi liczbami całkowitymi.", ["pierwiastki", "szacowanie"]),
    closed(8, "BC", 3, "wyrażenia algebraiczne", "Sprawdź parzystość wyrażeń oraz odejmij wzory opisujące b i c.", ["wyrażenia-algebraiczne", "liczby-parzyste", "wzory"], ["AC", "AD", "BC", "BD"]),
    closed(9, "A", 3, "wyrażenia algebraiczne", "Najpierw wyznacz n z warunku dotyczącego najmniejszej liczby, a potem oblicz pozostałe.", ["wyrażenia-algebraiczne", "trójki-pitagorejskie"]),
    closed(10, "D", 2, "średnia arytmetyczna", "Najpierw oblicz łączny koszt czterech artykułów ze średniej.", ["średnia-arytmetyczna", "zadania-tekstowe"]),
    closed(11, "BC", 3, "prawdopodobieństwo", "Oblicz liczbę losów wygrywających i liczbę losów pozostałych po losowaniu.", ["prawdopodobieństwo", "ułamki", "zadania-tekstowe"], ["AC", "AD", "BC", "BD"]),
    closed(12, "D", 3, "kąty w trójkącie", "Wykorzystaj prostopadłość obu wysokości oraz kąty przyległe.", ["kąty-w-trójkącie", "geometria"]),
    closed(13, "B", 2, "podzielność", "Wspólne linie cięcia pojawiają się w odległościach będących wspólnymi wielokrotnościami 2 i 5.", ["nww", "podzielność", "zadania-tekstowe"]),
    closed(14, "C", 2, "objętość prostopadłościanu", "Oblicz pojemność skrzyni i pomnóż ją przez podaną część.", ["prostopadłościan", "objętość", "ułamki"]),
    closed(15, "B", 3, "pole ostrosłupa", "Wyznacz pole podstawy i ścian bocznych jednego ostrosłupa, pamiętając, że sklejone podstawy nie są na zewnątrz.", ["ostrosłup", "pole-powierzchni", "geometria-przestrzenna"]),
    open_task(16, "Taki podział tabliczki czekolady nie jest możliwy.", 3, "ułamki", "Dodaj trzy części tabliczki i porównaj sumę z jednością.", ["ułamki", "uzasadnianie", "zadania-tekstowe"]),
    open_task(17, "Adam dotarł na spotkanie z Bartkiem o godzinie 17:56.", 3, "prędkość, droga i czas", "Odczytaj długość trasy z siatki i skali, a następnie oblicz czas przejazdu.", ["prędkość-droga-czas", "skala", "zadania-tekstowe"]),
    open_task(18, "Jedna puszka karmy dla psa kosztuje 3,60 zł.", 3, "równania", "Oznacz cenę puszki przez x i zapisz dwa warunki opisujące posiadaną kwotę.", ["równania", "zadania-tekstowe"]),
    open_task(19, "Długość odcinka DS jest równa 9,6 cm.", 4, "twierdzenie Pitagorasa i pola figur", "Oblicz przekątną prostokąta, a następnie porównaj dwa wzory na pole trójkąta ACD.", ["twierdzenie-pitagorasa", "pole-trójkąta", "prostokąt"]),
]


TASKS_2026 = [
    closed(1, "A", 2, "diagram kołowy i procenty", "Ustal brakujący udział procentowy arytmetyki, a potem oblicz ten procent z 40.", ["diagram-kołowy", "procenty", "odczytywanie-danych"]),
    closed(2, "B", 2, "NWD i NWW", "Oblicz NWD(18, 27) i NWW(2, 4), a następnie podstaw cyfry do układu YXXY.", ["nwd", "nww", "liczby-naturalne"]),
    closed(3, "C", 2, "pierwiastki", "Oblicz działania pod znakami pierwiastków, a potem wartości czterech liczb.", ["pierwiastki", "działania-na-liczbach"]),
    closed(4, "A", 2, "potęgi", "Zapisz wszystkie czynniki jako potęgi o podstawach 2 i 3.", ["potęgi", "działania-na-potęgach"]),
    closed(5, "D", 2, "procenty i wyrażenia algebraiczne", "Po obniżce o 40% płaci się 60% ceny, a po obniżce o 20% - 80% ceny.", ["procenty", "wyrażenia-algebraiczne", "zadania-tekstowe"]),
    closed(6, "AC", 3, "parzystość liczb", "Skoro suma dowolnych dwóch pozostałych numerów jest parzysta, wszystkie pozostałe numery mają tę samą parzystość.", ["parzystość", "liczby-naturalne", "rozumowanie"], ["AC", "AD", "BC", "BD"]),
    closed(7, "B", 2, "równania", "Najpierw oblicz liczbę owoców w jednym koszu, a potem rozdziel ją na dwie liczby różniące się o 6.", ["równania", "zadania-tekstowe"]),
    closed(8, "BD", 3, "wyrażenia algebraiczne", "Podstaw n = 100 do wzoru, a następnie wymnóż nawias w wyrażeniu ogólnym.", ["wyrażenia-algebraiczne", "wzory", "suma-liczb-naturalnych"], ["AC", "AD", "BC", "BD"]),
    closed(9, "D", 2, "średnia arytmetyczna", "Zapisz sumę x + y z pierwszej średniej i wykorzystaj ją w drugiej.", ["średnia-arytmetyczna", "równania"]),
    true_false(10, "PP", 2, "trójkąt równoboczny", "Podziel trójkąt wysokością na dwa trójkąty prostokątne.", ["trójkąt-równoboczny", "pole-trójkąta", "twierdzenie-pitagorasa"]),
    closed(11, "C", 3, "kąty w czworokącie", "Suma kątów czworokąta wynosi 360°. Zapisz wszystkie kąty za pomocą alfa.", ["kąty-w-wielokątach", "równania", "czworokąt"]),
    true_false(12, "PP", 3, "układ współrzędnych", "Odczytaj przesunięcia na kratkach i zastosuj twierdzenie Pitagorasa.", ["układ-współrzędnych", "twierdzenie-pitagorasa", "odległość-punktów"]),
    closed(13, "D", 3, "pola figur", "Z pola i wysokości trójkąta wyznacz przekątną AD, która jest również przekątną kwadratu.", ["pole-trójkąta", "pole-kwadratu", "geometria"]),
    closed(14, "A", 2, "pole prostopadłościanu", "Wyznacz wymiary powstałego prostopadłościanu i zastosuj wzór na pole całkowite.", ["prostopadłościan", "pole-powierzchni", "geometria-przestrzenna"]),
    open_task(15, "Ela przygotowała 57 kartek niebieskich.", 3, "równania", "Oznacz liczbę czerwonych kartek przez x i zapisz pozostałe liczby kartek za pomocą x.", ["równania", "wyrażenia-algebraiczne", "zadania-tekstowe"]),
    open_task(16, "Przejazd z Jodłowa do Dębiny trwał dłużej niż godzinę.", 3, "prędkość, droga i czas", "Oblicz prędkość na pierwszym odcinku oraz długość drugiego odcinka, a następnie porównaj czas z jedną godziną.", ["prędkość-droga-czas", "proporcjonalność", "zadania-tekstowe"]),
    open_task(17, "Uczestnicy turnieju tenisa stołowego stanowili 29% wszystkich uczestników.", 3, "procenty", "Zapisz liczbę uczestników obu turniejów i oblicz, jaką część jednej liczby stanowi druga.", ["procenty", "zadania-tekstowe"]),
    open_task(18, "Objętość ostrosłupa ACDS jest 12 razy mniejsza od objętości sześcianu.", 3, "objętość ostrosłupa", "Porównaj pola podstaw i wysokości obu ostrosłupów we wzorze na objętość.", ["ostrosłup", "objętość", "geometria-przestrzenna"]),
    open_task(19, "Pani Anna musi zapłacić 142,80 zł.", 3, "pole trapezu i obliczenia praktyczne", "Oblicz pole trapezu, liczbę potrzebnych opakowań zaokrąglając w górę i ich koszt.", ["trapez", "pole-figury", "zadania-tekstowe"]),
    open_task(20, "Obwód równoległoboku KLMN jest równy 18 + 6√2.", 4, "twierdzenie Pitagorasa i obwód", "Odczytaj długości powstałych boków i oblicz brakujący odcinek z twierdzenia Pitagorasa.", ["równoległobok", "twierdzenie-pitagorasa", "obwód", "geometria"]),
]

METADATA = {2021: TASKS_2021, 2026: TASKS_2026}


def page_lines(page):
    return page.extract_text_lines(return_chars=False)


def normalized_text(line):
    return " ".join(line["text"].split())


def headers_for_page(page):
    headers = []
    for line in page_lines(page):
        match = TASK_HEADER_RE.search(normalized_text(line))
        if not match:
            continue
        headers.append(
            {
                "number": match.group(1),
                "maxPoints": int(match.group(2)),
                "top": line["top"],
                "bottom": line["bottom"],
            }
        )
    return sorted(headers, key=lambda item: item["top"])


def rendered_page(page, cache, page_index):
    if page_index not in cache:
        cache[page_index] = page.to_image(resolution=RESOLUTION, antialias=True).original.convert("RGB")
    return cache[page_index]


def trim_vertical(image, padding=8):
    background = Image.new("RGB", image.size, "white")
    difference = ImageChops.difference(image, background)
    mask = ImageOps.grayscale(difference).point(lambda value: 255 if value > 7 else 0)
    bbox = mask.getbbox()
    if not bbox or bbox[3] - bbox[1] < 18:
        return None
    top = max(0, bbox[1] - padding)
    bottom = min(image.height, bbox[3] + padding)
    return image.crop((0, top, image.width, bottom))


def crop_page_region(page, cache, page_index, top, bottom):
    if bottom <= top:
        return None
    image = rendered_page(page, cache, page_index)
    crop = image.crop(
        (
            round(X0 * SCALE),
            round(top * SCALE),
            round(X1 * SCALE),
            round(bottom * SCALE),
        )
    )
    return trim_vertical(crop)


def crop_custom_region(page, cache, page_index, x0, top, x1, bottom):
    image = rendered_page(page, cache, page_index)
    crop = image.crop(
        (
            round(x0 * SCALE),
            round(top * SCALE),
            round(x1 * SCALE),
            round(bottom * SCALE),
        )
    )
    return trim_vertical(crop)


def composed_card_task(page, cache, page_index, start, layout):
    statement = crop_page_region(
        page,
        cache,
        page_index,
        start,
        layout["statement_bottom"],
    )
    figure = crop_custom_region(
        page,
        cache,
        page_index,
        *layout["figure"],
    )
    if statement is None or figure is None:
        return None

    gap = 24
    width = max(statement.width, figure.width)
    result = Image.new("RGB", (width, statement.height + gap + figure.height), "white")
    result.paste(statement, ((width - statement.width) // 2, 0))
    result.paste(figure, ((width - figure.width) // 2, statement.height + gap))
    return result


def save_webp(image, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "WEBP", quality=90, method=6)


def vector_grid_top(page, after, before):
    rows = Counter()
    for rect in page.rects:
        top = float(rect["top"])
        if not after < top < before:
            continue
        if rect["height"] <= 1.2 and rect["width"] <= 25 and X0 <= rect["x0"] <= X1:
            rows[round(top, 1)] += 1
    candidates = [top for top, count in rows.items() if count >= 10]
    return min(candidates) if candidates else None


def red_grid_top(page, cache, page_index, after, before):
    image = rendered_page(page, cache, page_index)
    array = np.asarray(image)
    left = round(X0 * SCALE)
    right = round(X1 * SCALE)
    start = max(0, round(after * SCALE))
    stop = min(array.shape[0], round(before * SCALE))
    region = array[start:stop, left:right]
    red = (
        (region[:, :, 0] > 175)
        & (region[:, :, 1] < 180)
        & (region[:, :, 2] < 180)
        & ((region[:, :, 0].astype(int) - region[:, :, 1].astype(int)) > 35)
    )
    counts = red.sum(axis=1)
    # Zadania z rysunkiem wykorzystują górną część kratownicy. Szukamy dopiero
    # pierwszej czerwonej linii biegnącej niemal przez całą szerokość strony.
    candidates = np.flatnonzero(counts > (right - left) * 0.75)
    return (start + int(candidates[0])) / SCALE if len(candidates) else None


def footer_top(lines, after):
    candidates = []
    for line in lines:
        if line["top"] <= after:
            continue
        text = normalized_text(line)
        if text.startswith("PRZENIEŚ") or text.startswith("OMAP-") or re.fullmatch(r"Strona \d+ z \d+", text):
            candidates.append(line["top"])
    return min(candidates) if candidates else PAGE_BOTTOM


def extract_task_assets(config):
    manifest = {}
    for source in config["task_sources"]:
        cache = {}
        with pdfplumber.open(source["path"]) as document:
            for page_index, page in enumerate(document.pages):
                headers = [item for item in headers_for_page(page) if item["number"] in source["allowed"]]
                if not headers:
                    continue
                lines = page_lines(page)
                for header_index, header in enumerate(headers):
                    start = header["bottom"] + 3.5
                    next_header = headers[header_index + 1]["top"] if header_index + 1 < len(headers) else PAGE_BOTTOM
                    end = min(next_header - 3, footer_top(lines, start) - 3, PAGE_BOTTOM)

                    figure_layout = source.get("figure_boxes", {}).get(header["number"])
                    if figure_layout:
                        image = composed_card_task(
                            page,
                            cache,
                            page_index,
                            start,
                            figure_layout,
                        )
                    else:
                        image = None

                    if image is None and header["maxPoints"] > 1:
                        grid = (
                            red_grid_top(page, cache, page_index, start, end)
                            if source["red_grid"]
                            else vector_grid_top(page, start, end)
                        )
                        if grid is not None:
                            end = min(end, grid - (10 if source["red_grid"] else 4))
                            if source["red_grid"]:
                                body_lines = [
                                    line
                                    for line in lines
                                    if start < line["top"] < grid
                                    and not normalized_text(line).startswith("OMAP-")
                                ]
                                if body_lines:
                                    end = min(end, max(line["bottom"] for line in body_lines) + 5)

                    if image is None:
                        image = crop_page_region(page, cache, page_index, start, end)
                    if image is None:
                        raise RuntimeError(f"Pusty wycinek zadania {config['year']}/{header['number']}")

                    filename = f"{header['number']}_{config['stem']}.webp"
                    save_webp(image, config["output"] / filename)
                    manifest[header["number"]] = {
                        "file": filename,
                        "maxPoints": header["maxPoints"],
                    }
    return manifest


def global_lines(document):
    lines = []
    for page_index, page in enumerate(document.pages):
        for line in page_lines(page):
            lines.append(
                {
                    "page": page_index,
                    "top": line["top"],
                    "bottom": line["bottom"],
                    "text": normalized_text(line),
                }
            )
    return lines


def position(line, edge="top"):
    return (line["page"], line[edge])


def save_span(document, cache, start, end, output_dir, output_base):
    saved = []
    for page_index in range(start[0], end[0] + 1):
        top = start[1] if page_index == start[0] else PAGE_TOP
        bottom = end[1] if page_index == end[0] else PAGE_BOTTOM
        image = crop_page_region(
            document.pages[page_index],
            cache,
            page_index,
            max(top, PAGE_TOP),
            min(bottom, PAGE_BOTTOM),
        )
        if image is None:
            continue
        filename = f"{output_base}{len(saved) + 1}.webp"
        save_webp(image, output_dir / filename)
        saved.append(filename)
    return saved


def extract_key_assets(config, manifest):
    cache = {}
    with pdfplumber.open(config["key"]) as document:
        lines = global_lines(document)
        task_headers = []
        for line in lines:
            match = TASK_HEADER_RE.search(line["text"])
            if match:
                task_headers.append((match.group(1), line))

        for index, (number, header) in enumerate(task_headers):
            if number not in config["open_tasks"]:
                continue

            section_start = position(header, "bottom")
            section_end = (
                position(task_headers[index + 1][1], "top")
                if index + 1 < len(task_headers)
                else (len(document.pages) - 1, PAGE_BOTTOM)
            )
            appendices = [
                position(line, "top")
                for line in lines
                if section_start < position(line, "top") < section_end
                and (
                    line["text"].startswith("Ocena prac osób ze stwierdzoną dyskalkulią")
                    or line["text"].startswith("Dodatkowe zasady oceniania")
                )
            ]
            if appendices:
                section_end = min(appendices)

            section_lines = [
                line for line in lines if section_start < position(line, "top") < section_end
            ]
            criteria = next((line for line in section_lines if line["text"] == "Zasady oceniania"), None)
            solution = next(
                (
                    line
                    for line in section_lines
                    if line["text"].startswith("Przykładowe rozwiązania")
                    or line["text"] == "Rozwiązanie"
                ),
                None,
            )
            if not criteria or not solution:
                raise RuntimeError(
                    f"Brak zasad lub rozwiązań w kluczu {config['year']}, zadanie {number}"
                )

            criteria_files = save_span(
                document,
                cache,
                position(criteria, "bottom"),
                position(solution, "top"),
                config["output"],
                f"{number}_z",
            )
            solution_files = save_span(
                document,
                cache,
                position(solution, "bottom"),
                section_end,
                config["output"],
                f"{number}_s_",
            )
            manifest[number]["gradingCriteriaFiles"] = [
                {"label": f"Część {part}", "file": filename}
                for part, filename in enumerate(criteria_files, 1)
            ]
            manifest[number]["solutions"] = [
                {"label": f"Rozwiązanie - część {part}", "file": filename}
                for part, filename in enumerate(solution_files, 1)
            ]


def build_json(config, manifest):
    metadata = METADATA[config["year"]]
    expected = {item["number"] for item in metadata}
    actual = set(manifest)
    if expected != actual:
        raise RuntimeError(
            f"Niezgodne zadania {config['year']}: brak={sorted(expected - actual)}, nadmiar={sorted(actual - expected)}"
        )

    tasks = []
    for item in metadata:
        number = item["number"]
        assets = manifest[number]
        task = {
            "file": assets["file"],
            "difficulty": item["difficulty"],
            "topic": item["topic"],
            "hint": item["hint"],
            "answer": item["answer"],
        }
        if "type" in item:
            task["type"] = item["type"]
            task["options"] = item["options"]
        task["tags"] = item["tags"]
        task["level"] = "egzamin_osmoklasisty"
        task["maxPoints"] = assets["maxPoints"]
        for field in ("solutions", "gradingCriteriaFiles"):
            if field in assets:
                task[field] = assets[field]
        tasks.append(task)

    output = config["output"] / f"{config['stem']}.json"
    output.write_text(json.dumps(tasks, ensure_ascii=False, indent=2) + "\n")
    return output, tasks


def run(config):
    config["output"].mkdir(parents=True, exist_ok=True)
    manifest = extract_task_assets(config)
    extract_key_assets(config, manifest)
    output, tasks = build_json(config, manifest)
    for source, filename in config["source_files"]:
        shutil.copy2(source, config["output"] / filename)
    print(
        f"{output.relative_to(ROOT)}: {len(tasks)} zadań, "
        f"{sum(task['maxPoints'] for task in tasks)} pkt"
    )


for exam_config in CONFIGS:
    run(exam_config)
