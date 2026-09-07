"""Validate imported assets and render contact sheets for visual inspection."""

import argparse
import json
import math

import numpy as np
from PIL import Image, ImageDraw, ImageOps

from import_missing_mp import WORK, sessions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="")
    args = parser.parse_args()
    folder = WORK / "qa"
    folder.mkdir(parents=True, exist_ok=True)
    report = []
    for session, _ in sessions():
        identity = f"{session.year}:{session.output_dir.name}"
        if not session.json_path.exists() or (args.only and not identity.startswith(args.only)):
            continue
        items = json.loads(session.json_path.read_text())
        images = []
        failures = []
        flags = []
        materials = []
        for item in items:
            number = item["file"].split("_")[0]
            if item.get("type") in {"closed", "true_false"}:
                if item["answer"] not in item["options"]:
                    failures.append(f"Invalid answer: {number}")
            elif not item.get("solutions") or not item.get("gradingCriteriaFiles"):
                failures.append(f"Missing solution or grading: {number}")
            if not item.get("tags"):
                failures.append(f"No tags: {number}")
            assets = [item["file"]]
            if item.get("contextFile"):
                assets.append(item["contextFile"])
            for key in ["solutions", "gradingCriteriaFiles"]:
                for entry in item.get(key, []):
                    filename = entry if isinstance(entry, str) else entry["file"]
                    assets.append(filename)
                    materials.append((filename, f"{number}: {key}"))
            for filename in assets:
                path = session.output_dir / filename
                if not path.exists():
                    failures.append(f"Missing asset: {filename}")
                    continue
                with Image.open(path) as image:
                    image.load()
                    if image.width < 100 or image.height < 24:
                        failures.append(f"Empty asset: {filename}")
            for filename in assets[:2 if item.get("contextFile") else 1]:
                with Image.open(session.output_dir / filename) as image:
                    pixels = np.asarray(image.convert("RGB"), dtype=np.int16)
                    edges = np.concatenate([pixels[:, :24], pixels[:, -24:]], axis=1)
                    colored = edges.max(axis=2) - edges.min(axis=2) > 45
                    if int(colored.sum()) > 20:
                        flags.append(f"Colored edge: {filename}")
                    if image.height > 1700:
                        flags.append(f"Tall task / possible work grid: {filename}")
                images.append((filename, number + (" context" if "kontekst" in filename else "")))

        def sheet(entries, name, cell_width=420, cell_height=280):
            canvas = Image.new("RGB", (cell_width * 4, cell_height * math.ceil(len(entries) / 4)), "#e1e5e9")
            draw = ImageDraw.Draw(canvas)
            for index, (filename, label) in enumerate(entries):
                x, y = (index % 4) * cell_width, (index // 4) * cell_height
                draw.text((x + 10, y + 6), label, fill="black")
                with Image.open(session.output_dir / filename) as image:
                    thumbnail = ImageOps.contain(image, (cell_width - 16, cell_height - 30))
                    canvas.paste(thumbnail, (x + 8, y + 24))
            path = folder / f"{session.year}-{session.output_dir.name}-{name}.webp"
            canvas.save(path, "WEBP", quality=90)
            return str(path)

        result = {
            "session": identity, "tasks": len(items),
            "closed": sum(bool(item.get("options")) for item in items),
            "points": sum(item["maxPoints"] for item in items),
            "failures": failures, "reviewFlags": flags,
            "tasksSheet": sheet(images, "tasks"),
        }
        if materials:
            result["materialsSheet"] = sheet(materials, "materials")
        report.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    (folder / f"report{('-' + args.only.replace(':', '-')) if args.only else ''}.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    )
    if any(entry["failures"] for entry in report):
        raise SystemExit("Asset validation failed")


if __name__ == "__main__":
    main()
