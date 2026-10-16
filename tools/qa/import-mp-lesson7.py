"""Import the audited lesson 7 PDF, retaining shared graphs and PDF numbering."""

import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess

import pdfplumber
from PIL import Image, ImageChops, ImageDraw


HEADER = re.compile(r'^Zadanie(?P<part> domowe| powtórkowe)? (?P<number>\d+(?:\.\d+)*)\. ')
PARTS = {None: 'zadania', ' domowe': 'praca_domowa', ' powtórkowe': 'zadania_powtorkowe'}
PREFIXES = {'zadania': '', 'praca_domowa': 'zd', 'zadania_powtorkowe': 'zp'}
MAIN_KEYS = {
    '1': 'D A C B B C', '2': 'B C A C D A', '3': 'C D B A C C',
    '4': 'D A C B C D', '5': 'A B D C B B',
    '6': 'D', '7': 'A', '8': 'D', '9': 'A', '10': 'B', '11': 'C',
    '12': ['P', 'F'], '13': ['P', 'F'], '14': 'B D C A B C', '15': 'D',
}
HOMEWORK_KEYS = {
    '1': 'C B A D C A', '2': 'B C D A D A', '3': 'A C B C C D',
    '4': 'A', '5': 'A', '6': 'B', '7': 'A', '8': 'B', '9': 'D',
    '10': ['P', 'F'], '11': 'input', '12': 'input', '13': ['P', 'F'],
    '14': 'C A B D B A', '15': 'C',
}
REVIEW_KEYS = {str(i): key for i, key in enumerate('A A A B D'.split(), 1)}


def expand_keys(groups):
    result = {}
    for number, keys in groups.items():
        if isinstance(keys, str) and ' ' in keys:
            result.update({f'{number}.{i}': key for i, key in enumerate(keys.split(), 1)})
        else:
            result[number] = keys
    return result


KEYS = dict(zip(PARTS.values(), map(expand_keys, [MAIN_KEYS, HOMEWORK_KEYS, REVIEW_KEYS])))
PROPERTY_HINTS = [
    ('dziedzina', 'Sprawdź, które argumenty należą do wykresu, uwzględniając puste i pełne kropki.'),
    ('zbiór wartości', 'Odczytaj wartości na osi Oy, uwzględniając końce odcinków i osobne punkty.'),
    ('miejsca zerowe', 'Sprawdź, w których punktach wykres przecina oś Ox lub jej dotyka.'),
    ('wartość funkcji', 'Poprowadź poziomą prostą na wysokości podanej w poleceniu.'),
]
SPECIFIC_HINTS = {
    ('zadania', '1.5'): ('równanie', 'Porównaj wykres funkcji z poziomą prostą y = 1/2.'),
    ('zadania', '1.6'): ('monotoniczność', 'Sprawdź, na którym przedziale wykres biegnie w górę.'),
    ('zadania', '2.5'): ('równanie', 'Przyrównaj każdy wzór składowy do x/2 + 1.'),
    ('zadania', '2.6'): ('nierówność', 'Zaznacz fragmenty wykresu leżące na wysokości 1 lub wyżej.'),
    ('zadania', '3.5'): ('miejsca zerowe', 'Miejsca zerowe funkcji g odpowiadają punktom, w których f przyjmuje wartość 1.'),
    ('zadania', '3.6'): ('wartość funkcji', 'Odczytaj wartości funkcji w osobnych punktach dla x = 3 i x = 5.'),
    ('zadania', '4.5'): ('punkt przecięcia', 'Przyrównaj każdy wzór składowy do 2x + 3.'),
    ('zadania', '4.6'): ('monotoniczność', 'Sprawdź znak współczynnika przy x w każdym wzorze składowym.'),
    ('zadania', '5.5'): ('miejsca zerowe', 'Miejsca zerowe funkcji g odpowiadają punktom, w których f przyjmuje wartość 1.'),
    ('zadania', '5.6'): ('wartość funkcji', 'Wybierz właściwy wzór osobno dla argumentów -1 i 3.'),
    ('zadania', '6'): ('przesunięcie wykresu', 'Przesunięcie o 3 w lewo oznacza zastąpienie x przez x + 3.'),
    ('zadania', '7'): ('odbicie względem Oy', 'Po odbiciu względem Oy wartość g(x) jest równa f(-x).'),
    ('zadania', '8'): ('odbicie względem Ox', 'Odbicie względem Ox zmienia znak całej wartości funkcji.'),
    ('zadania', '9'): ('odbicie względem Oy', 'Odbicie względem Oy oznacza zastąpienie x przez -x.'),
    ('zadania', '10'): ('przekształcenia wykresu', 'Najpierw zmień znak całego wzoru funkcji f.'),
    ('zadania', '11'): ('dziedzina', 'Zacznij od przesunięcia obu końców przedziału o 5 w lewo.'),
    ('zadania', '12'): ('funkcja w tabeli', 'Porównuj wartości funkcji w kolejności rosnących argumentów.'),
    ('zadania', '13'): ('funkcja w tabeli', 'Najpierw uporządkuj argumenty od najmniejszego do największego.'),
    ('zadania', '14.4'): ('wartość funkcji', 'Dla każdego argumentu wybierz właściwy wzór składowy.'),
    ('zadania', '14.5'): ('nierówność', 'Sprawdź, które fragmenty wykresu leżą powyżej osi Ox.'),
    ('zadania', '14.6'): ('monotoniczność', 'Po zmianie znaku wartości funkcji przedziały wzrostu stają się przedziałami spadku.'),
    ('zadania', '15'): ('definicja funkcji', 'Sprawdź, czy temu samemu argumentowi przypisano dwie różne wartości.'),
    ('praca_domowa', '1.5'): ('równanie', 'Przyrównaj każdy wzór składowy do 1/2.'),
    ('praca_domowa', '1.6'): ('monotoniczność', 'Sprawdź, na którym przedziale wykres biegnie w górę.'),
    ('praca_domowa', '2.5'): ('równanie', 'Przyrównaj każdy wzór składowy do x + 1.'),
    ('praca_domowa', '2.6'): ('nierówność', 'Zaznacz fragmenty wykresu leżące na wysokości 1 lub wyżej.'),
    ('praca_domowa', '3.5'): ('miejsca zerowe', 'Miejsca zerowe funkcji g odpowiadają punktom, w których f przyjmuje wartość -1.'),
    ('praca_domowa', '3.6'): ('wartość funkcji', 'Odczytaj wartości w osobnych punktach dla x = 1 i x = 5.'),
    ('praca_domowa', '4'): ('przesunięcie wykresu', 'Przesunięcie o 2 w prawo oznacza zastąpienie x przez x - 2.'),
    ('praca_domowa', '5'): ('odbicie względem Oy', 'Po odbiciu względem Oy wartość g(x) jest równa f(-x).'),
    ('praca_domowa', '6'): ('odbicie względem Ox', 'Odbicie względem Ox zmienia znak całej wartości funkcji.'),
    ('praca_domowa', '7'): ('odbicie względem Oy', 'Odbicie względem Oy oznacza zastąpienie x przez -x.'),
    ('praca_domowa', '8'): ('przekształcenia wykresu', 'Najpierw zmień znak całego wzoru funkcji f.'),
    ('praca_domowa', '9'): ('dziedzina', 'Zacznij od przesunięcia obu końców przedziału o 4 w prawo.'),
    ('praca_domowa', '10'): ('funkcja w tabeli', 'Porównuj wartości funkcji w kolejności rosnących argumentów.'),
    ('praca_domowa', '11'): ('funkcja wymierna', 'Zacznij od wykluczenia argumentu zerującego mianownik.'),
    ('praca_domowa', '12'): ('równanie', 'Przyrównaj każdy wzór składowy do 2.'),
    ('praca_domowa', '13'): ('funkcja w tabeli', 'Najpierw uporządkuj argumenty od najmniejszego do największego.'),
    ('praca_domowa', '14.4'): ('wartość funkcji', 'Dla każdego argumentu wybierz właściwy wzór składowy.'),
    ('praca_domowa', '14.5'): ('nierówność', 'Porównaj wykres z poziomą prostą y = 2.'),
    ('praca_domowa', '14.6'): ('monotoniczność', 'Po zmianie znaku wartości funkcji przedziały wzrostu stają się przedziałami spadku.'),
    ('praca_domowa', '15'): ('definicja funkcji', 'Sprawdź, czy temu samemu argumentowi przypisano dwie różne wartości.'),
    ('zadania_powtorkowe', '1'): ('logarytmy', 'Przedstaw liczbę logarytmowaną jako potęgę podstawy logarytmu.'),
    ('zadania_powtorkowe', '2'): ('wzory skróconego mnożenia', 'Zastosuj wzór na różnicę kwadratów.'),
    ('zadania_powtorkowe', '3'): ('równanie wymierne', 'Najpierw wyklucz argument zerujący mianownik.'),
    ('zadania_powtorkowe', '4'): ('zmiany procentowe', 'Obniżkę o 20% zapisz jako mnożenie przez 0,8.'),
    ('zadania_powtorkowe', '5'): ('procent składany', 'Po pierwszym roku odsetki powiększają kapitał lokaty.'),
}


def task_item(part, number, points):
    answer = KEYS[part][number]
    label = {'zadania': 'zadanie', 'praca_domowa': 'zadanie domowe',
             'zadania_powtorkowe': 'zadanie powtórkowe'}[part]
    property_index = int(number.split('.')[-1]) - 1 if '.' in number else -1
    topic, hint = SPECIFIC_HINTS.get((part, number),
                                    PROPERTY_HINTS[property_index] if 0 <= property_index < 4 else ('', ''))
    assert topic and hint, (part, number)
    item = {'file': f'{PREFIXES[part]}{number}.webp', 'taskNumber': number,
            'title': f'Lekcja 7 - {label} {number}', 'coursePart': part,
            'level': 'matura_podstawowa', 'topic': 'funkcje' if part != 'zadania_powtorkowe' else topic,
            'tags': ['funkcje', topic] if part != 'zadania_powtorkowe' else [topic, 'powtórka'],
            'difficulty': 2 if number.startswith('14.') or number in ['4.5', '11'] else 1,
            'maxPoints': points, 'hint': hint}
    if '.' in number:
        item['contextFile'] = f'info_{PREFIXES[part]}{number.split(".")[0]}.webp'
    if isinstance(answer, list):
        item.update(type='true_false', statements=['Stwierdzenie 1', 'Stwierdzenie 2'], answer=answer)
    elif answer == 'input':
        item['type'] = 'input'
        if number == '11':
            item['inputs'] = [
                {'label': 'Argument wykluczony z dziedziny',
                 'prompt': 'Wpisz liczbę wykluczoną z dziedziny funkcji.', 'answer': '3'},
                {'label': 'Miejsce zerowe', 'prompt': 'Wpisz miejsce zerowe funkcji.', 'answer': '-3'},
                {'label': 'f(1)', 'prompt': 'Wpisz obliczoną wartość f(1).', 'answer': '4'},
            ]
        else:
            item['inputs'] = [{'label': 'x', 'prompt': 'Podaj rozwiązanie równania.',
                               'control': 'equation', 'answer': '2'}]
    else:
        item.update(type='closed', options=['A', 'B', 'C', 'D'], answer=answer)
    return item


def save_crop(page, rendered, start, stop, filename, output):
    lines = [line for line in page.extract_text_lines()
             if line['top'] >= start and line['bottom'] < stop]
    assert lines, filename
    assert all('Brudnopis' not in line['text'] and not HEADER.match(line['text']) for line in lines)
    assert all(68 < char['x0'] and char['x1'] < 536 for line in lines for char in line['chars'])
    top = max(start, min(line['top'] for line in lines) - 3)
    bottom = min(stop, max(line['bottom'] for line in lines) + 3)
    for obj in [*page.images, *page.lines, *page.rects, *page.curves]:
        if obj['top'] >= start and obj['bottom'] < stop and obj['x0'] >= 68 and obj['x1'] <= 536:
            top = min(top, obj['top'] - 2)
            bottom = max(bottom, obj['bottom'] + 2)
    assert start <= top < bottom <= stop, (filename, start, stop, top, bottom)
    scale = rendered.width / page.width
    crop = rendered.crop(tuple(round(value * scale) for value in (68, top, 536, bottom)))
    white = Image.new('RGB', crop.size, 'white')
    bounds = ImageChops.difference(crop, white).getbbox()
    assert bounds, filename
    # Keep a stable text scale and horizontal frame across all task images.
    crop = crop.crop((0, max(0, bounds[1] - 8), crop.width, min(crop.height, bounds[3] + 8)))
    crop.save(output / filename, 'WEBP', lossless=True, method=6)
    return {'file': filename, 'page': page.page_number, 'box': [68, top, 536, bottom],
            'guard': [start, stop], 'size': list(crop.size), 'text': '\n'.join(line['text'] for line in lines)}


def contact_sheets(output, audit, work):
    for offset in range(0, len(audit), 10):
        records = audit[offset:offset + 10]
        thumbs = []
        for record in records:
            image = Image.open(output / record['file']).convert('RGB')
            image.thumbnail((700, 650))
            tile = Image.new('RGB', (720, image.height + 35), '#e6edf2')
            ImageDraw.Draw(tile).text((10, 7), f"{record['file']} (PDF {record['page']})", fill='black')
            tile.paste(image, (10, 28))
            thumbs.append(tile)
        rows = [max(t.height for t in thumbs[i:i + 2]) for i in range(0, len(thumbs), 2)]
        sheet = Image.new('RGB', (1440, sum(rows)), '#e6edf2')
        y = 0
        for i, height in enumerate(rows):
            for column, tile in enumerate(thumbs[i * 2:i * 2 + 2]):
                sheet.paste(tile, (column * 720, y))
            y += height
        sheet.save(work / f'crops-{offset // 10 + 1:02}.png')


def import_lesson(source, output, work):
    output.mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)
    subprocess.run(['pdftoppm', '-f', '1', '-l', '42', '-png', '-r', '220', str(source), str(work / 'page')], check=True)
    tasks, audit, seen_contexts = [], [], set()
    with pdfplumber.open(source) as pdf:
        assert len(pdf.pages) == 44
        for page in pdf.pages[:42]:
            lines = page.extract_text_lines()
            headers = [line for line in lines if HEADER.match(line['text'])]
            rendered = Image.open(work / f'page-{page.page_number:02}.png').convert('RGB')
            for header in headers:
                match = HEADER.match(header['text'])
                part, number = PARTS[match['part']], match['number']
                later = [line['top'] for line in lines if line['top'] > header['bottom'] and
                         (HEADER.match(line['text']) or line['text'] == 'Brudnopis' or line['top'] > 780)]
                stop = min(later)
                if 'Informacja do podpunktów' in header['text']:
                    filename = f'info_{PREFIXES[part]}{number}.webp'
                    seen_contexts.add(filename)
                else:
                    points = re.search(r'0[–-](\d+)', header['text'])
                    assert points, header['text']
                    item = task_item(part, number, int(points[1]))
                    tasks.append(item)
                    filename = item['file']
                audit.append(save_crop(page, rendered, header['bottom'] + 3, stop - 3, filename, output))
        for part, keys in KEYS.items():
            assert [t['taskNumber'] for t in tasks if t['coursePart'] == part] == list(keys)
    assert len(tasks) == 85 and len(audit) == 95
    assert {t['contextFile'] for t in tasks if 'contextFile' in t} == seen_contexts
    (output / 'lekcja_7_funkcje.json').write_text(json.dumps(tasks, ensure_ascii=False, indent=2) + '\n')
    shutil.copyfile(source, output / 'lekcja_7_funkcje.pdf')
    (work / 'crop-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
    contact_sheets(output, audit, work)
    print(f'Imported {len(tasks)} tasks and {len(seen_contexts)} shared contexts.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path('zadania/kurs/mp/lekcja_7'))
    parser.add_argument('--work', type=Path, default=Path('/private/tmp/mp7-course-import'))
    args = parser.parse_args()
    import_lesson(args.source, args.output, args.work)
