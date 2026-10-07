import json
from pathlib import Path
import re
import unittest

import pdfplumber
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1] / 'zadania/kurs/mp/lekcja_6'
TASKS = json.loads((ROOT / 'lekcja_6_procenty_i_lokaty.json').read_text())


class MpLesson6AssetsTests(unittest.TestCase):
    def test_every_crop_has_clear_edges_and_one_format(self):
        for filename in [*(task['file'] for task in TASKS), 'context_3_4.png']:
            with self.subTest(file=filename):
                image = Image.open(ROOT / filename).convert('RGB')
                self.assertEqual(image.width, 1396)
                self.assertFalse((ROOT / Path(filename).with_suffix('.webp')).exists())
                edges = [(0, 0, image.width, 4), (0, image.height - 4, image.width, image.height),
                         (0, 0, 4, image.height), (image.width - 4, 0, image.width, image.height)]
                for box in edges:
                    edge = image.crop(box)
                    self.assertIsNone(ImageChops.difference(edge, Image.new('RGB', edge.size, 'white')).getbbox())

    def test_pdf_key_matches_manifest_and_all_tasks_are_present(self):
        with pdfplumber.open(ROOT / 'lekcja_6_procenty_i_lokaty.pdf') as pdf:
            self.assertEqual(len(pdf.pages), 10)
            lines = [line for page in pdf.pages for line in page.extract_text_lines()]
            for prefix, part, expected in [('Zadanie ', 'zadania', 10),
                                           ('Zadanie domowe ', 'praca_domowa', 10),
                                           ('Zadanie powtórkowe ', 'zadania_powtorkowe', 5)]:
                header = re.compile(r'^' + prefix + r'(\d+)\.')
                numbers = [int(header.match(line['text'])[1]) for line in lines if header.match(line['text'])]
                self.assertEqual(numbers, list(range(1, expected + 1)))
                self.assertEqual(sum(task['coursePart'] == part for task in TASKS), expected)
            key_lines = [line['text'] for line in pdf.pages[-1].extract_text_lines()]
            main_key = ' '.join('PP' if task.get('teacherGraded') else ''.join(task['answer'])
                                for task in TASKS if task['coursePart'] == 'zadania')
            homework_key = ' '.join(''.join(task['answer']) for task in TASKS if task['coursePart'] == 'praca_domowa')
            self.assertIn(main_key, key_lines)
            self.assertIn(homework_key, key_lines)
            key_text = re.sub(r'\s+', '', '\n'.join(key_lines))
            self.assertIn('36k', key_text)
            self.assertNotIn('36n', key_text)
            self.assertIn('3k', key_text)
            text = '\n'.join(line['text'] for line in lines)
            self.assertIn('kapitału na koniec każdego roku', text)
            self.assertIn('w równych odstępach czasu', text)
            self.assertIn('Dodatnia liczba x', text)


if __name__ == '__main__':
    unittest.main()
