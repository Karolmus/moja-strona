from __future__ import annotations

import json
import re
import shutil
from collections import Counter
from pathlib import Path

import pdfplumber
from PIL import Image, ImageChops, ImageOps


ROOT = Path(__file__).resolve().parents[2]
RESOLUTION = 200
SCALE = RESOLUTION / 72
X0 = 68
X1 = 527
PAGE_TOP = 52
PAGE_BOTTOM = 770

TASK_HEADER_RE = re.compile(r"Zadanie\s+(\d+(?:\.\d+)?)\.\s*\(0[–-](\d+)\)")
PARENT_HEADER_RE = re.compile(r"Zadanie\s+(\d+)\.\s*$")
METHOD_RE = re.compile(r"^Sposób\s+([IVXLCDM]+|\d+|[A-Z])(?:\.|\b)")

CONFIGS = [
    {
        "session": "maj",
        "stem": "2026_cke_p_m",
        "exam": Path("/Users/karolmusiol/Downloads/matematyka-2026-maj-matura-podstawowa.pdf"),
        "key": Path("/Users/karolmusiol/Downloads/matematyka-2026-maj-matura-podstawowa-odpowiedzi.pdf"),
        "output": ROOT / "zadania/mp/2026/maj",
        "open_tasks": {"7", "10", "11", "12.1", "12.2", "14", "15", "17", "21", "22", "27", "30"},
        "source_exam": "MMAP-P0-100-2605.pdf",
        "source_key": "MMAP-P0-100-2605-zasady.pdf",
    },
    {
        "session": "czerwiec",
        "stem": "2026_cke_p_c",
        "exam": Path("/Users/karolmusiol/Downloads/matematyka-2026-czerwiec-matura-podstawowa.pdf"),
        "key": Path("/Users/karolmusiol/Downloads/matematyka-2026-czerwiec-matura-podstawowa-odpowiedzi.pdf"),
        "output": ROOT / "zadania/mp/2026/czerwiec",
        "open_tasks": {"5", "8", "12.1", "12.2", "15", "20", "22", "27", "31", "32"},
        "source_exam": "MMAP-P0-100-2606.pdf",
        "source_key": "MMAP-P0-100-2606-zasady.pdf",
    },
]


def page_lines(page):
    return page.extract_text_lines(return_chars=False)


def headers_for_page(page):
    headers = []
    for line in page_lines(page):
        text = " ".join(line["text"].split())
        task_match = TASK_HEADER_RE.search(text)
        if task_match:
            headers.append(
                {
                    "kind": "task",
                    "number": task_match.group(1),
                    "maxPoints": int(task_match.group(2)),
                    "top": line["top"],
                    "bottom": line["bottom"],
                    "text": text,
                }
            )
            continue

        parent_match = PARENT_HEADER_RE.search(text)
        if parent_match:
            headers.append(
                {
                    "kind": "context",
                    "number": parent_match.group(1),
                    "top": line["top"],
                    "bottom": line["bottom"],
                    "text": text,
                }
            )

    return sorted(headers, key=lambda item: item["top"])


def grid_top(page, after, before):
    tops = Counter()
    for rect in page.rects:
        top = float(rect["top"])
        if not (after < top < before):
            continue
        if rect["height"] <= 1.2 and rect["width"] <= 25 and rect["x0"] >= X0 and rect["x1"] <= X1:
            tops[round(top, 1)] += 1

    candidates = [top for top, count in tops.items() if count >= 10]
    return min(candidates) if candidates else None


def rendered_page(page, cache, page_index):
    if page_index not in cache:
        cache[page_index] = page.to_image(resolution=RESOLUTION, antialias=True).original.convert("RGB")
    return cache[page_index]


def trim_vertical(image, padding=8):
    background = Image.new("RGB", image.size, "white")
    difference = ImageChops.difference(image, background)
    mask = ImageOps.grayscale(difference).point(lambda value: 255 if value > 7 else 0)
    bbox = mask.getbbox()
    if not bbox:
        return None

    # Odrzuć pojedyncze linie separatorów pozostające na granicach stron klucza.
    if bbox[3] - bbox[1] < 18:
        return None

    top = max(0, bbox[1] - padding)
    bottom = min(image.height, bbox[3] + padding)
    if bottom - top < 12:
        return None
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


def save_webp(image, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "WEBP", quality=90, method=6)


def task_assets(config):
    manifest = {}
    cache = {}
    with pdfplumber.open(config["exam"]) as document:
        for page_index, page in enumerate(document.pages):
            headers = headers_for_page(page)
            if not headers:
                continue
            lines = page_lines(page)

            for header_index, header in enumerate(headers):
                start = header["bottom"] + 3.5
                following_headers = [item["top"] for item in headers[header_index + 1 :]]
                next_header = min(following_headers) if following_headers else PAGE_BOTTOM
                brudnopis = [
                    line["top"]
                    for line in lines
                    if line["top"] > start
                    and line["top"] < next_header
                    and line["text"].strip().lower().startswith("brudnopis")
                ]
                header_gap = 10 if header["kind"] == "context" else 2
                end = min(brudnopis) - 2 if brudnopis else next_header - header_gap

                if not brudnopis and next_header == PAGE_BOTTOM:
                    detected_grid = grid_top(page, start, end)
                    if detected_grid is not None:
                        end = detected_grid - 3

                end = min(end, PAGE_BOTTOM)
                image = crop_page_region(page, cache, page_index, start, end)
                if image is None:
                    raise RuntimeError(f"Pusty wycinek {config['session']} {header['kind']} {header['number']}")

                filename = f"{header['number']}_{config['stem']}.webp"
                save_webp(image, config["output"] / filename)

                if header["kind"] == "task":
                    manifest.setdefault(header["number"], {})
                    manifest[header["number"]].update(
                        {
                            "file": filename,
                            "maxPoints": header["maxPoints"],
                        }
                    )
                else:
                    manifest.setdefault(f"context:{header['number']}", {})["file"] = filename

    for number, item in list(manifest.items()):
        if number.startswith("context:") or "." not in number:
            continue
        parent = number.split(".", 1)[0]
        context = manifest.get(f"context:{parent}")
        if context:
            item["contextFile"] = context["file"]

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
                    "text": " ".join(line["text"].split()),
                }
            )
    return lines


def position(line, edge="top"):
    return (line["page"], line[edge])


def between(line, start, end):
    current = position(line)
    return start < current < end


def save_span(document, cache, start, end, output_base):
    saved = []
    part = 1
    for page_index in range(start[0], end[0] + 1):
        top = start[1] if page_index == start[0] else PAGE_TOP
        bottom = end[1] if page_index == end[0] else PAGE_BOTTOM
        top = max(top, PAGE_TOP)
        bottom = min(bottom, PAGE_BOTTOM)
        image = crop_page_region(document.pages[page_index], cache, page_index, top, bottom)
        if image is None:
            continue
        filename = f"{output_base}{part}.webp"
        save_webp(image, document.output_dir / filename)
        saved.append(filename)
        part += 1
    return saved


def key_assets(config, manifest):
    cache = {}
    with pdfplumber.open(config["key"]) as document:
        document.output_dir = config["output"]
        lines = global_lines(document)
        task_headers = []
        for line in lines:
            match = TASK_HEADER_RE.search(line["text"])
            if match:
                task_headers.append((match.group(1), line))
        appendix_markers = [
            line
            for line in lines
            if line["text"].startswith("Ocena prac osób ze stwierdzoną dyskalkulią")
        ]

        for index, (number, header) in enumerate(task_headers):
            if number not in config["open_tasks"]:
                continue

            section_start = position(header, "bottom")
            if index + 1 < len(task_headers):
                section_end = position(task_headers[index + 1][1], "top")
            else:
                section_end = (len(document.pages) - 1, PAGE_BOTTOM)

            following_appendices = [
                position(line, "top")
                for line in appendix_markers
                if section_start < position(line, "top") < section_end
            ]
            if following_appendices:
                section_end = min(following_appendices)

            section_lines = [line for line in lines if between(line, section_start, section_end)]
            criteria_markers = [line for line in section_lines if line["text"] == "Zasady oceniania"]
            solution_markers = [
                line
                for line in section_lines
                if line["text"] == "Rozwiązanie"
                or line["text"].startswith("Przykładowe")
            ]
            if not criteria_markers or not solution_markers:
                raise RuntimeError(
                    f"Brak sekcji w kluczu {config['session']} zadanie {number}: "
                    f"zasady={len(criteria_markers)}, rozwiązania={len(solution_markers)}"
                )

            criteria_marker = criteria_markers[0]
            solution_marker = solution_markers[0]
            criteria_start = position(criteria_marker, "bottom")
            criteria_end = position(solution_marker, "top")
            criteria_files = save_span(document, cache, criteria_start, criteria_end, f"{number}_z")
            manifest[number]["gradingCriteriaFiles"] = [
                {"label": f"Część {part}", "file": filename}
                for part, filename in enumerate(criteria_files, 1)
            ]

            solution_start = position(solution_marker, "bottom")
            method_markers = [
                line
                for line in section_lines
                if between(line, solution_start, section_end) and METHOD_RE.match(line["text"])
            ]
            solution_groups = []
            if method_markers:
                for method_index, method in enumerate(method_markers):
                    method_start = position(method, "bottom")
                    method_end = (
                        position(method_markers[method_index + 1], "top")
                        if method_index + 1 < len(method_markers)
                        else section_end
                    )
                    solution_groups.append((method["text"], method_start, method_end))
            else:
                solution_groups.append(("Rozwiązanie", solution_start, section_end))

            solutions = []
            for group_index, (label, group_start, group_end) in enumerate(solution_groups):
                letter = chr(ord("a") + group_index)
                files = save_span(document, cache, group_start, group_end, f"{number}_s_{letter}")
                solutions.extend({"label": label, "file": filename} for filename in files)
            manifest[number]["solutions"] = solutions


def run(config):
    config["output"].mkdir(parents=True, exist_ok=True)
    manifest = task_assets(config)
    key_assets(config, manifest)
    shutil.copy2(config["exam"], config["output"] / config["source_exam"])
    shutil.copy2(config["key"], config["output"] / config["source_key"])

    output_manifest = ROOT / f"tmp/pdfs/2026-{config['session']}-mp-manifest.json"
    output_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(
        config["session"],
        "tasks=",
        len([key for key in manifest if not key.startswith("context:")]),
        "contexts=",
        len([key for key in manifest if key.startswith("context:")]),
    )


for exam_config in CONFIGS:
    run(exam_config)
