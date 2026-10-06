"""Render the normal EO checkpoint and exclude the teacher key from its PDF."""
import argparse
from pathlib import Path
import re
import subprocess
import tempfile

import pdfplumber
from PIL import Image, ImageChops, ImageOps
from pypdf import PdfReader, PdfWriter


def refresh(source, output):
    with tempfile.TemporaryDirectory(prefix="eo-normal-assets-") as directory:
        rendered = Path(directory)
        subprocess.run(["pdftoppm", "-png", "-r", "200", str(source), str(rendered / "page")], check=True)
        crops = []
        with pdfplumber.open(source) as document:
            for page_number, page in enumerate(document.pages[:8], 1):
                lines = page.extract_text_lines()
                headers = [line for line in lines if re.match(r"Zadanie \d+\.", line["text"])]
                for header in headers:
                    number = int(re.match(r"Zadanie (\d+)\.", header["text"])[1])
                    end = next(line for line in lines if line["top"] > header["bottom"] and line["text"].startswith(("Brudnopis", "Obliczenia")))
                    image = Image.open(rendered / f"page-{page_number}.png").convert("RGB")
                    scale = image.width / page.width
                    top = round((header["bottom"] + 3) * scale)
                    bottom = round((end["top"] - 8) * scale)
                    crop = image.crop((round(35 * scale), top, round(560 * scale), bottom))
                    bounds = ImageChops.difference(crop, Image.new("RGB", crop.size, "white")).getbbox()
                    crop = ImageOps.expand(crop.crop(bounds), border=12, fill="white")
                    height = round(crop.height * 1100 / crop.width)
                    crop = crop.resize((1100, height), Image.Resampling.LANCZOS)
                    crop.save(output / f"{number}.png", optimize=True)
                    # The web version must always match the canonical PNG, even for older cached pages.
                    crop.save(output / f"{number}.webp", lossless=True, method=6)
                    crops.append(number)
        assert sorted(crops) == list(range(1, 16)), crops
        reader = PdfReader(source)
        writer = PdfWriter()
        for page in reader.pages[:8]:
            writer.add_page(page)
        writer.write(output / "Test lekcje 1-6.pdf")
        print("Updated 15 PNGs, 15 matching lossless WebPs and the student PDF without its answer key.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2] / "zadania/kurs/eo/test_lekcje_1_6")
    args = parser.parse_args()
    refresh(args.source, args.output)
