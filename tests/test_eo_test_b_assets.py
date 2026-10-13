import json
from pathlib import Path
import unittest

from PIL import Image, ImageChops
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "zadania/kurs/eo/test_lekcje_1_6_b"


class TestEOTestBAssets(unittest.TestCase):
    def test_canonical_images_are_complete_and_padded(self):
        tasks = json.loads((ASSETS / "test_lekcje_1_6_b.json").read_text())
        self.assertEqual({path.name for path in ASSETS.glob("*.webp")}, {task["file"] for task in tasks})
        self.assertFalse(list(ASSETS.glob("*.png")), "Only the website's canonical image format is stored")
        for task in tasks:
            with self.subTest(task=task["taskNumber"]):
                image = Image.open(ASSETS / task["file"]).convert("RGB")
                self.assertEqual(image.width, 1100)
                self.assertGreater(image.height, 40)
                bounds = ImageChops.difference(image, Image.new("RGB", image.size, "white")).getbbox()
                self.assertIsNotNone(bounds)
                self.assertGreaterEqual(bounds[0], 3)
                self.assertGreaterEqual(bounds[1], 3)
                self.assertLessEqual(bounds[2], image.width - 3)
                self.assertLessEqual(bounds[3], image.height - 3)

    def test_chart_includes_both_page_fragments_and_bar_series(self):
        image = Image.open(ASSETS / "3.webp").convert("RGB")
        self.assertGreater(image.height, 700, "The chart and statements are not omitted")
        colors = image.getcolors(image.width * image.height)
        self.assertGreater(sum(count for count, (r, g, b) in colors if 80 < r < 110 and r == g == b), 1000)
        self.assertGreater(sum(count for count, (r, g, b) in colors if 165 < r < 190 and r == g == b), 1000)

    def test_student_pdf_excludes_teacher_key(self):
        reader = PdfReader(ASSETS / "Test lekcje 1-6 - wersja B.pdf")
        self.assertEqual(len(reader.pages), 8)
        text = "\n".join(page.extract_text() for page in reader.pages)
        self.assertNotIn("Klucz odpowiedzi", text)
        self.assertIn("z biblioteki szkolnej", text)
        self.assertIn("cenę roweru przed obniżką", text)
        self.assertIn("Przykładem równania nieoznaczonego", text)


if __name__ == "__main__":
    unittest.main()
