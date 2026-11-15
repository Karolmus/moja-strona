"""Extract complete task bodies, excluding title bands, scratch grids and footers."""
import json
import re
import subprocess
import tempfile
from pathlib import Path

import pdfplumber
from PIL import Image, ImageChops, ImageOps

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / "zadania/kurs/mp/lekcja_8"
PDF = DIRECTORY / "Lekcja 8 - Funkcja liniowa.pdf"
SCALE = 200 / 72


def main():
    expected = {task["file"] for task in json.loads((DIRECTORY / "lekcja_8_funkcja_liniowa.json").read_text())}
    expected.remove("zp10.png")  # This later addition has a separate, already clean source image.
    outputs = {}
    with pdfplumber.open(PDF) as document, tempfile.TemporaryDirectory(prefix="ds-mp8-crops-") as temp:
        for index, page in enumerate(document.pages):
            bands = sorted((rect for rect in page.rects if rect["width"] > 450 and 10 < rect["height"] < 25
                            and isinstance(rect.get("non_stroking_color"), (tuple, list))
                            and len(rect["non_stroking_color"]) == 3
                            and max(rect["non_stroking_color"]) - min(rect["non_stroking_color"]) > .08),
                           key=lambda rect: rect["top"])
            if not bands:
                continue
            prefix = Path(temp) / f"page-{index+1}"
            subprocess.run(["pdftoppm", "-f", str(index+1), "-l", str(index+1), "-r", "200", "-png",
                            "-singlefile", str(PDF), str(prefix)], check=True, capture_output=True)
            raster = Image.open(prefix.with_suffix(".png")).convert("RGB")
            for position, band in enumerate(bands):
                label = page.crop((band["x0"], band["top"], band["x1"], band["bottom"])).extract_text() or ""
                match = re.search(r"Zadanie\s+(?:(domowe|powtórkowe)\s+)?(\d+)\.", label)
                if not match:
                    raise ValueError(f"Unknown task heading: {label}")
                file = {None: "", "domowe": "zd", "powtórkowe": "zp"}[match[1]] + match[2] + ".png"
                stop = bands[position+1]["top"] - 2 if position+1 < len(bands) else 765
                scratch = [word["top"] for word in page.extract_words() if word["text"] in {"Brudnopis", "Powtórka"}
                           and band["bottom"] < word["top"] < stop]
                if scratch:
                    stop = min(scratch) - 5
                top = round((band["bottom"] + 1) * SCALE)
                bottom = round(stop * SCALE)
                body = raster.crop((round(65 * SCALE), top, round(540 * SCALE), bottom))
                bounds = ImageChops.difference(body, Image.new("RGB", body.size, "white")).getbbox()
                if not bounds or file in outputs:
                    raise ValueError(f"Empty or duplicate task: {file}")
                body = body.crop((0, bounds[1], body.width, bounds[3]))
                outputs[file] = ImageOps.expand(body, border=12, fill="white")
    if set(outputs) != expected:
        raise ValueError(f"Task coverage mismatch: {set(outputs) ^ expected}")
    for file, image in outputs.items():
        image.save(DIRECTORY / file, optimize=True, dpi=(200, 200))
    print(f"Re-extracted {len(outputs)} complete color tasks at 200 DPI; preserved zp10.png.")


if __name__ == "__main__":
    main()
