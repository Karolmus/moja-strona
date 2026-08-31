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

TOPIC_RULES = [
    ("granice", ("granica", "granicę", "granic ciąg")),
    ("pochodne", ("pochodn", "styczn[aey] do wykresu")),
    ("logarytmy", ("logarytm", "log_")),
    ("potęgi", ("potęg", "wykładnik")),
    ("pierwiastki", ("pierwiast", "√")),
    ("procenty", ("procent", "%")),
    ("ciągi arytmetyczne", ("ciąg arytmetycz",)),
    ("ciągi geometryczne", ("ciąg geometrycz",)),
    ("ciągi", ("ciąg", "wyrazów ciągu", "wyrazu ciągu")),
    ("funkcja kwadratowa", ("funkcj kwadrat", "trójmian kwadrat")),
    ("funkcje", ("funkcj", "wykres")),
    ("nierówności", ("nierówno",)),
    ("równania", ("równan",)),
    ("wielomiany", ("wielomian",)),
    ("wartość bezwzględna", ("wartość bezwzględ",)),
    ("wyrażenia algebraiczne", ("wyrażen algebra", "jednomian", "dwumian")),
    ("trygonometria", ("trygonom", "sin", "cos", "tangens", "tg ", "kąt między")),
    ("prawdopodobieństwo", ("prawdopodob", "losujem", "rzut kost", "rzucamy kost")),
    ("kombinatoryka", ("kombinatory", "permutac", "wariac", "kombinac")),
    ("statystyka", ("średni", "mediana", "dominanta", "diagram", "statystyk")),
    ("geometria analityczna", ("kartezjań", "układzie współrzęd", "współrzędne punkt")),
    ("wektory", ("wektor",)),
    ("okręgi i koła", ("okrąg", "okręgu", "koło", "kole ")),
    ("trójkąty", ("trójkąt", "twierdzenie pitagorasa")),
    ("czworokąty", ("czworokąt", "kwadrat", "prostokąt", "trapez", "romb", "równoległobok")),
    ("stereometria", ("ostrosłup", "graniastosłup", "sześcian", "prostopadłościan", "brył")),
    ("pola figur", ("pole ", "pola ")),
    ("objętość", ("objęto", "pojemno")),
    ("podzielność", ("podziel", "nwd", "nww", "liczb pierwsz")),
    ("prędkość, droga i czas", ("prędko", "droga", "czas przejazdu")),
    ("skala i jednostki", ("skala", "jednost",)),
    ("liczby i działania", ("liczb rzeczywist", "liczb natural", "ułam", "działania na liczbach")),
    ("odczytywanie danych", ("tabel", "wykres", "diagram", "odczyt")),
]

HINTS = {
    "granice": "Porównaj wyrazy najwyższego stopnia i zastosuj odpowiednie prawa działań na granicach.",
    "pochodne": "Wyznacz pochodną i wykorzystaj jej interpretację zgodnie z treścią zadania.",
    "logarytmy": "Zastosuj definicję logarytmu oraz wzory na logarytm iloczynu, ilorazu i potęgi.",
    "potęgi": "Sprowadź potęgi do wspólnej podstawy i zastosuj prawa działań na potęgach.",
    "pierwiastki": "Uprość pierwiastki, wyłączając czynniki przed znak pierwiastka.",
    "procenty": "Zapisz podane wielkości jako ułamki liczby wyjściowej i ułóż proporcję.",
    "ciągi arytmetyczne": "Skorzystaj ze wzoru na wyraz ogólny lub sumę ciągu arytmetycznego.",
    "ciągi geometryczne": "Skorzystaj ze wzoru na wyraz ogólny lub sumę ciągu geometrycznego.",
    "ciągi": "Zapisz zależności między wyrazami ciągu i wykorzystaj podane warunki.",
    "funkcja kwadratowa": "Dobierz najwygodniejszą postać funkcji kwadratowej i wykorzystaj jej własności.",
    "funkcje": "Przeanalizuj dziedzinę, wartości i własności funkcji wynikające z treści lub wykresu.",
    "nierówności": "Przenieś wyrażenia na jedną stronę, ustal punkty krytyczne i zbadaj znaki.",
    "równania": "Ustal dziedzinę, przekształć równanie i sprawdź otrzymane rozwiązania.",
    "wielomiany": "Rozłóż wielomian na czynniki lub wykorzystaj jego pierwiastki i współczynniki.",
    "wartość bezwzględna": "Rozpatrz przypadki wyznaczone przez miejsca zerowe wyrażeń pod wartością bezwzględną.",
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
    "zadanie problemowe": "Wypisz dane i szukane wielkości, a następnie zapisz zależności wynikające z treści.",
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

    @property
    def exam_pdf(self) -> Path:
        return self.source_dir / "arkusz.pdf"

    @property
    def key_pdf(self) -> Path:
        return self.source_dir / "zasady_oceniania.pdf"

    @property
    def json_path(self) -> Path:
        return self.output_dir / f"{self.stem}.json"

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
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


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


def rendered_page(page, cache: dict[int, Image.Image], page_index: int) -> Image.Image:
    if page_index not in cache:
        cache[page_index] = (
            page.to_image(resolution=RESOLUTION, antialias=True)
            .original.convert("RGB")
        )
    return cache[page_index]


def trim_vertical(image: Image.Image, padding: int = 8) -> Image.Image | None:
    background = Image.new("RGB", image.size, "white")
    difference = ImageChops.difference(image, background)
    mask = ImageOps.grayscale(difference).point(lambda value: 255 if value > 7 else 0)
    bbox = mask.getbbox()
    if not bbox or bbox[3] - bbox[1] < 18:
        return None
    top = max(0, bbox[1] - padding)
    bottom = min(image.height, bbox[3] + padding)
    return image.crop((0, top, image.width, bottom))


def crop_region(
    page,
    cache: dict[int, Image.Image],
    page_index: int,
    top: float,
    bottom: float,
    x0: float,
    x1: float,
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
    return trim_vertical(crop)


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


def boundary_on_page(headers: list[dict], index: int, page) -> float:
    header = headers[index]
    next_same_page = [
        item["top"]
        for item in headers[index + 1 :]
        if item["page"] == header["page"]
    ]
    return min(next_same_page) - 4 if next_same_page else page_bottom(page)


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
    end = boundary_on_page(headers, index, page)
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
            start = header["bottom"] + 4
            end = boundary_on_page(headers, index, page)

            stop = first_line_top(
                lines_by_page[header["page"]],
                start,
                end,
                ("brudnopis", "przenies rozwiazania zadan"),
            )
            solution_stop = first_exact_line_top(
                lines_by_page[header["page"]],
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
            )
            if image is None:
                raise RuntimeError(
                    f"Pusty wycinek {session.kind} {session.year} {session.detail}, "
                    f"{header['kind']} {header['number']}"
                )

            text = extract_task_text(header, headers, index, lines_by_page, page)
            if header["kind"] == "context":
                filename = f"{header['number']}_kontekst_{session.stem}.webp"
                save_webp(image, output / filename)
                manifest[f"context:{header['number']}"] = {"file": filename}
                context_texts[header["number"]] = text
                continue

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


def classify_task(task_text: str, key_text: str) -> tuple[str, list[str], str]:
    folded = ascii_fold(f"{task_text} {key_text}")
    tags = []
    for label, needles in TOPIC_RULES:
        if any(ascii_fold(needle) in folded for needle in needles):
            tags.append(label)
    if "wykaz" in folded or "udowod" in folded or "uzasadn" in folded:
        tags.append("dowodzenie")
    tags = list(dict.fromkeys(tags))[:6]
    topic = next((tag for tag in tags if tag != "dowodzenie"), "zadanie problemowe")
    if not tags:
        tags = [topic]
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
            "tags": tags + (["zadania-otwarte"] if source["maxPoints"] > 1 else []),
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
    parser.add_argument("--only", action="append", default=[])
    args = parser.parse_args()

    sessions = selected_sessions(build_sessions(), args.only)
    if not sessions:
        raise SystemExit("Brak sesji pasujących do filtra.")

    report = []
    for index, session in enumerate(sessions, 1):
        action = "AUDYT" if args.audit else "IMPORT"
        print(f"[{index}/{len(sessions)}] {action}: {session.kind} {session.detail}", flush=True)
        report.append(audit_session(session) if args.audit else import_session(session, args.replace))

    report_path = ROOT / "tmp/pdfs/cke_package_audit.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Gotowe: sesje={len(report)}, zadania={sum(item['tasks'] for item in report)}, raport={report_path}",
        flush=True,
    )


if __name__ == "__main__":
    main()
