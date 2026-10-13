"""Extract EO test B, joining tasks spanning pages and omitting the teacher key."""
import argparse
import logging
from pathlib import Path
import re
import subprocess
import tempfile

import pdfplumber
from PIL import Image, ImageChops, ImageOps
from pypdf import PdfReader, PdfWriter


def refresh(source, output):
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="eo-test-b-assets-") as directory:
        rendered = Path(directory)
        subprocess.run([
            "pdftoppm", "-png", "-r", "200", str(source), str(rendered / "page")
        ], check=True)
        with pdfplumber.open(source) as document:
            key_page = next(index for index, page in enumerate(document.pages)
                            if "Klucz odpowiedzi" in (page.extract_text() or ""))
            pages = document.pages[:key_page]
            events = []
            for index, page in enumerate(pages):
                for line in page.extract_text_lines():
                    match = re.match(r"Zadanie (\d+)\.", line["text"])
                    if match:
                        events.append((index, line["top"], "task", int(match[1]), line["bottom"]))
                    elif line["text"].startswith(("Brudnopis", "Obliczenia")):
                        events.append((index, line["top"], "scratch", None, line["bottom"]))
            events.sort()
            numbers = []
            for position, (start_page, _, kind, number, header_bottom) in enumerate(events):
                if kind != "task":
                    continue
                end_page, end_top, end_kind, _, _ = events[position + 1]
                assert end_kind == "scratch", f"Missing scratch boundary for task {number}"
                fragments = []
                for index in range(start_page, end_page + 1):
                    page = pages[index]
                    image = Image.open(rendered / f"page-{index + 1}.png").convert("RGB")
                    scale = image.width / page.width
                    top = header_bottom + 3 if index == start_page else 35
                    bottom = end_top - 8 if index == end_page else page.height - 35
                    crop = image.crop((round(35 * scale), round(top * scale),
                                       round(560 * scale), round(bottom * scale)))
                    bounds = ImageChops.difference(crop, Image.new("RGB", crop.size, "white")).getbbox()
                    assert bounds, f"Empty task {number}, page {index + 1}"
                    fragments.append((crop, bounds))
                # Keep a shared horizontal origin when joining prose and a chart from separate pages.
                left = min(bounds[0] for _, bounds in fragments)
                right = max(bounds[2] for _, bounds in fragments)
                height = sum(bounds[3] - bounds[1] for _, bounds in fragments) + 12 * (len(fragments) - 1)
                combined = Image.new("RGB", (right - left, height), "white")
                y = 0
                for crop, bounds in fragments:
                    fragment = crop.crop((left, bounds[1], right, bounds[3]))
                    combined.paste(fragment, (0, y))
                    y += fragment.height + 12
                combined = ImageOps.expand(combined, border=12, fill="white")
                combined = combined.resize((1100, round(combined.height * 1100 / combined.width)),
                                           Image.Resampling.LANCZOS)
                combined.save(output / f"{number}.webp", lossless=True, quality=100, method=6)
                numbers.append(number)
                print(f"Task {number}: pages {start_page + 1}-{end_page + 1}, {combined.size}")
            assert sorted(numbers) == list(range(1, 16)), numbers

        logging.getLogger("pypdf").setLevel(logging.ERROR)
        reader = PdfReader(source)
        writer = PdfWriter()
        for page in reader.pages[:key_page]:
            writer.add_page(page)
        writer.write(output / "Test lekcje 1-6 - wersja B.pdf")
        print(f"Updated 15 lossless WebP images and {key_page} student PDF pages without the answer key.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2] /
                        "zadania/kurs/eo/test_lekcje_1_6_b")
    args = parser.parse_args()
    refresh(args.source, args.output)
