import json
from pathlib import Path
import unittest

from PIL import Image, ImageChops
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1] / "zadania/kurs/eo/test_lekcje_1_6"
TASKS = json.loads((ROOT / "test_lekcje_1_6.json").read_text())


class NormalEoAssetsTests(unittest.TestCase):
    def test_every_optimized_image_matches_the_canonical_task_pixel_for_pixel(self):
        for task in TASKS:
            with self.subTest(task=task["taskNumber"]):
                png = Image.open(ROOT / task["file"]).convert("RGB")
                webp = Image.open(ROOT / Path(task["file"]).with_suffix(".webp")).convert("RGB")
                self.assertEqual(png.size, webp.size)
                self.assertIsNone(ImageChops.difference(png, webp).getbbox())
                for box in [(0, 0, png.width, 4), (0, png.height-4, png.width, png.height)]:
                    edge = png.crop(box)
                    self.assertIsNone(ImageChops.difference(edge, Image.new("RGB", edge.size, "white")).getbbox())

    def test_student_pdf_contains_all_tasks_but_no_teacher_answer_page(self):
        pdf = PdfReader(ROOT / "Test lekcje 1-6.pdf")
        self.assertEqual(len(pdf.pages), 8)
        text = "\n".join(page.extract_text() for page in pdf.pages)
        for number in range(1, 16):
            self.assertIn(f"Zadanie {number}.", text)
        self.assertNotIn("Razem: 18 pkt", text)


if __name__ == "__main__":
    unittest.main()
