import json
from pathlib import Path
import re
import unittest

import pdfplumber
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1] / 'zadania/kurs/mp/lekcja_7'
TASKS = json.loads((ROOT / 'lekcja_7_funkcje.json').read_text())
HEADER = re.compile(r'^Zadanie(?P<part> domowe| powtórkowe)? (?P<number>\d+(?:\.\d+)*)\. ')
PARTS = {None: 'zadania', ' domowe': 'praca_domowa', ' powtórkowe': 'zadania_powtorkowe'}


class MpLesson7AssetsTests(unittest.TestCase):
    def test_images_are_lossless_colored_and_have_clear_edges(self):
        files = {task['file'] for task in TASKS} | {task['contextFile'] for task in TASKS if 'contextFile' in task}
        self.assertEqual(len(files), 95)
        self.assertEqual(set(path.name for path in ROOT.glob('*.webp')), files)
        self.assertFalse(list(ROOT.glob('*.png')))
        for filename in files:
            with self.subTest(file=filename), Image.open(ROOT / filename) as source:
                image = source.convert('RGB')
                self.assertEqual(source.format, 'WEBP')
                self.assertEqual(image.width, 1430)
                self.assertGreater(image.height, 90)
                box = ImageChops.difference(image, Image.new('RGB', image.size, 'white')).getbbox()
                self.assertIsNotNone(box)
                self.assertGreaterEqual(min(box[0], box[1], image.width - box[2], image.height - box[3]), 3)
                if filename.startswith('info_'):
                    red, _, blue = image.split()
                    self.assertIsNotNone(ImageChops.difference(red, blue).getbbox(), 'Graph keeps its original purple color')

    def test_all_pdf_tasks_have_the_same_number_and_points(self):
        expected = {(task['coursePart'], task['taskNumber']): task for task in TASKS}
        found, contexts = set(), set()
        with pdfplumber.open(ROOT / 'lekcja_7_funkcje.pdf') as document:
            self.assertEqual(len(document.pages), 44)
            for page in document.pages[:42]:
                for line in page.extract_text_lines():
                    match = HEADER.match(line['text'])
                    if not match:
                        continue
                    key = (PARTS[match['part']], match['number'])
                    if 'Informacja do podpunktów' in line['text']:
                        contexts.add(key)
                        continue
                    self.assertNotIn(key, found)
                    found.add(key)
                    points = int(re.search(r'0[–-](\d+)', line['text'])[1])
                    self.assertEqual(expected[key]['maxPoints'], points, key)
        self.assertEqual(found, set(expected))
        self.assertEqual(len(contexts), 10)
        for task in TASKS:
            if 'contextFile' in task:
                self.assertIn((task['coursePart'], task['taskNumber'].split('.')[0]), contexts)

    def test_manifest_matches_the_actual_pdf_answer_tables(self):
        with pdfplumber.open(ROOT / 'lekcja_7_funkcje.pdf') as document:
            main = document.pages[42].extract_tables()
            homework = document.pages[43].extract_tables()
            tables_by_part = {'zadania': main, 'praca_domowa': homework[:3],
                              'zadania_powtorkowe': homework[3:]}
            for part, tables in tables_by_part.items():
                key = {}
                for table in tables:
                    for index in range(0, len(table), 2):
                        key.update(zip(table[index], table[index + 1]))
                items = [task for task in TASKS if task['coursePart'] == part]
                self.assertEqual(set(key), {task['taskNumber'] for task in items})
                for task in items:
                    if task['type'] == 'input':
                        if task['taskNumber'] == '12':
                            self.assertEqual(key['12'], 'x=2')
                            self.assertEqual(task['inputs'][0]['answer'], '2')
                        else:
                            self.assertEqual(key['11'], 'poniżej')
                            self.assertEqual([field['answer'] for field in task['inputs']], ['3', '-3', '4'])
                    else:
                        actual = ', '.join(task['answer']) if isinstance(task['answer'], list) else task['answer']
                        self.assertEqual(actual, key[task['taskNumber']], task['file'])


if __name__ == '__main__':
    unittest.main()
