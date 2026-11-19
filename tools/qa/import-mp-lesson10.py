"""Import optimization tasks from the user's lesson 10 PDF export."""
import argparse
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pdfplumber
from PIL import Image, ImageChops, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'zadania/kurs/mp/lekcja_10'
STEM = 'lekcja_10_optymalizacja'
PARTS = {'': 'zadania', 'domowe': 'praca_domowa', 'powtórkowe': 'zadania_powtorkowe'}
PREFIX = {'zadania': '', 'praca_domowa': 'zd', 'zadania_powtorkowe': 'zp'}


def field(label, answer, suffix='', unit_label='', **extra):
    result = {'label': label, 'prompt': f'{label} ({unit_label or suffix})' if suffix else label, 'answer': answer,
              'math': True, 'mathTools': ['fraction'], **extra}
    if suffix:
        result['suffix'] = suffix
        if suffix.endswith('²'):
            result['suffixAliases'] = [suffix[:-1]+'2', suffix[:-1]+'^2']
    return result


def days(answer):
    return field('Dni', answer, control='set', math=False, mathTools=[], inputMode='text', placeholder='{n, m}')


def task_specs():
    main = {
        '1': [field('Największy iloczyn', '1/6'), field('x', '-1/3')],
        '2': [field('P(x)', 'x*(30-x)', math=False, mathTools=['square']),
              field('Dziedzina', '(0;30)', control='interval', math=False, inputMode='text',
                    mathTools=['paren-left', 'paren-right', 'bracket-left', 'bracket-right']),
              field('Pierwszy bok', '15', 'cm'), field('Drugi bok', '15', 'cm'), field('Największe pole', '225', 'cm²')],
        '3': [field('Krótszy bok', '21/4', 'm'), field('Dłuższy bok', '21/2', 'm'),
              field('Pole na jedną kurę', '441/80', 'm²')],
        '4': [field('x', '9/2', 'm'), field('y', '3', 'm')],
        '5': [field('x', '6', 'm'), field('y', '15/4', 'm'), field('Największe łączne pole', '90', 'm²')],
        '6': [field('Czas osiągnięcia maksimum', '3/2', 's'), field('Największa wysokość', '441/40', 'm')],
        '7': [field('Czas osiągnięcia maksimum', '2', 's'), field('Największa wysokość', '21', 'm'),
              field('Czas do uderzenia w ziemię', '4.05', 's')],
        '8': [field('Dzień', '11'), field('Liczba klientów', '400')],
        '9': [days('{6;7}'), field('Liczba książek', '156')],
        '10': [field('Liczba partii', '30'), field('Największy zysk', '800', 'zł')],
        '11': [field('Liczby', '-4;4', control='values', placeholder='a; b'), field('Najmniejszy iloczyn', '-16')],
        '12': [field('Pierwsza liczba', '7'), field('Druga liczba', '7'), field('Największy iloczyn', '49')],
        '13': 'proof',
    }
    unit_names = {'cm': 'centymetry', 'cm²': 'centymetry kwadratowe', 'm': 'metry',
                  'm²': 'metry kwadratowe', 's': 'sekundy', 'zł': 'złote'}
    for answer in main.values():
        if isinstance(answer, list):
            for item in answer:
                if item.get('suffix') in unit_names:
                    item['prompt'] = f"{item['label']} ({unit_names[item['suffix']]})"
    homework = {
        '1': [field('Największy iloczyn', '121/8'), field('Argument', '17/4')],
        '2': [field('Długość x', '5', 'm', prompt='Długość x'), field('Długość y', '3', 'm', prompt='Długość y'),
              field('Największe łączne pole', '75', 'm²', unit_label='metry kwadratowe')],
        '3': [field('Długość x', '6', 'm', unit_label='metry'), field('Długość y', '9/2', 'm', unit_label='metry'),
              field('Największe łączne pole', '54', 'm²', unit_label='metry kwadratowe')],
        '4': [field('Bok prostopadły do muru', '6', 'm', unit_label='metry'),
              field('Bok wzdłuż muru', '12', 'm', unit_label='metry'),
              field('Największe pole', '72', 'm²', unit_label='metry kwadratowe')],
        '5': [field('Czas osiągnięcia maksimum', '3', 's', unit_label='sekundy'),
              field('Największa wysokość', '45', 'm', unit_label='metry'), field('Czas lotu', '6', 's', unit_label='sekundy')],
        '6': [days('{8;9}'), field('Liczba klientów', '172')],
        '7': [field('R(x)', '(40-x)*(100+5*x)', math=False, mathTools=['square']),
              field('Cena biletu', '30', 'zł'), field('Największy przychód', '4500', 'zł')],
        '8': [field('Głębokość jednego wybiegu', '8', 'm', unit_label='metry'),
              field('Szerokość jednego wybiegu wzdłuż ściany', '12', 'm', unit_label='metry'),
              field('Największe łączne pole', '192', 'm²', unit_label='metry kwadratowe')],
        '9': [field('Szerokość plakatu', '24', 'cm'), field('Wysokość plakatu', '26', 'cm'),
              field('Największe pole wydruku', '400', 'cm²')],
        '10': [field('Krawędź podstawy', '8', 'cm'), field('Wysokość pudełka', '12', 'cm'),
              field('Największa suma pól', '448', 'cm²')],
    }
    return {'zadania': main, 'praca_domowa': homework,
            'zadania_powtorkowe': dict(zip(map(str, range(1, 7)), ['B', 'D', 'C', 'A', 'B', 'D']))}


def hints():
    return {
        'zadania': [
            'Zapisz iloczyn jako funkcję kwadratową i wyznacz jej wierzchołek.',
            'Z obwodu wyznacz drugi bok prostokąta.',
            'Do długości siatki dolicz szerokość wejścia.',
            'Policz cztery odcinki długości x i sześć odcinków długości y.',
            'Policz pięć odcinków długości x i osiem odcinków długości y.',
            'Wyznacz współrzędne wierzchołka paraboli opisującej wysokość.',
            'Wierzchołek wyznacza największą wysokość, a dodatnie miejsce zerowe czas lotu.',
            'Wyznacz argument wierzchołka i sprawdź dziedzinę.',
            'Porównaj wartości dla dwóch liczb naturalnych najbliższych argumentowi wierzchołka.',
            'Wyznacz argument wierzchołka funkcji zysku.',
            'Zapisz liczby jako x oraz x + 8.',
            'Zapisz liczby jako x oraz 14 - x.',
            'Przy obwodzie L pole jest równe x(L/2 - x), gdzie L > 0 oraz 0 < x < L/2.',
        ],
        'praca_domowa': [
            'Rozwiń iloczyn i wyznacz argument wierzchołka.',
            'Długość siatki jest sumą sześciu odcinków x i dziesięciu odcinków y.',
            'Uwzględnij trzy odcinki x, cztery odcinki y i furtkę.',
            'Nie ogradzasz boku przy murze.',
            'Wyznacz wierzchołek i dodatnie miejsce zerowe funkcji wysokości.',
            'Porównaj wartości dla dwóch liczb naturalnych najbliższych argumentowi wierzchołka.',
            'Przychód jest iloczynem ceny biletu i liczby sprzedanych biletów.',
            'Uwzględnij trzy ogrodzenia prostopadłe do ściany oraz dwie bramy.',
            'Od wymiarów plakatu odejmij marginesy po obu stronach.',
            'Suma krawędzi to 8a + 4h. Pole bez pokrywy to a² + 4ah.',
        ],
        'zadania_powtorkowe': [
            'Wyklucz miejsca zerowe mianownika.',
            'Odbicie względem osi Oy oznacza zastąpienie x przez -x.',
            'Przyrównaj wzór funkcji do zera.',
            'Iloczyn współczynników kierunkowych prostych prostopadłych wynosi -1.',
            'Przyrównaj każdy czynnik do zera.',
            'Wyznacz miejsca zerowe i sprawdź znak trójmianu poza nimi.',
        ],
    }


def extract(pdf):
    images, records = {}, {}
    scale = 200/72
    with pdfplumber.open(pdf) as document, tempfile.TemporaryDirectory(prefix='ds-mp10-') as temp:
        for index, page in enumerate(document.pages):
            unique = {}
            for rect in page.rects:
                color = rect.get('non_stroking_color')
                if (rect['width'] > 440 and 8 < rect['height'] < 26 and isinstance(color, (tuple, list))
                        and len(color) == 3 and max(color)-min(color) > .08):
                    unique[tuple(round(rect[key], 1) for key in ('x0', 'top', 'x1', 'bottom'))] = rect
            bands = sorted(unique.values(), key=lambda item: item['top'])
            if not bands:
                continue
            prefix = Path(temp)/f'page-{index+1}'
            subprocess.run(['pdftoppm', '-f', str(index+1), '-l', str(index+1), '-r', '200',
                            '-singlefile', '-png', str(pdf), str(prefix)], check=True, capture_output=True)
            raster = Image.open(prefix.with_suffix('.png')).convert('RGB')
            words = page.extract_words()
            for position, band in enumerate(bands):
                label = page.crop((band['x0'], band['top'], band['x1'], band['bottom'])).extract_text() or ''
                match = re.search(r'Zadanie\s+(?:(domowe|powtórkowe)\s+)?(\d+(?:\.\d+)*)\.', label)
                points = re.search(r'0\s*[–—-]\s*(\d+)', label)
                if not match or not points:
                    raise ValueError(f'Unknown task heading on page {index+1}: {label}')
                key = (PARTS[match[1] or ''], match[2])
                if key in records:
                    raise ValueError(f'Duplicate task heading: {key}')
                stop = bands[position+1]['top']-1 if position+1 < len(bands) else page.height-58
                stops = [word['top']-3 for word in words if word['text'] in ('Brudnopis', 'Obliczenia')
                         and band['bottom'] < word['top'] < stop]
                if stops:
                    stop = min(stops)
                body = raster.crop((round(65*scale), round((band['bottom']+1)*scale), round(535*scale), round(stop*scale)))
                bounds = ImageChops.difference(body, Image.new('RGB', body.size, 'white')).getbbox()
                if not bounds:
                    raise ValueError(f'Empty task body: {key}')
                images[key] = ImageOps.expand(body.crop((0, bounds[1], body.width, bounds[3])), border=12, fill='white')
                records[key] = {'maxPoints': int(points[1]), 'page': index+1}
    return images, records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=OUT)
    args = parser.parse_args()
    specs = task_specs()
    images, records = extract(args.pdf)
    expected = {(part, number) for part, items in specs.items() for number in items}
    if set(images) != expected:
        raise ValueError(f'Task mismatch: missing {expected-set(images)}, extra {set(images)-expected}')
    tasks = []
    for part, items in specs.items():
        for index, (number, answer) in enumerate(items.items()):
            label = {'zadania': 'zadanie', 'praca_domowa': 'zadanie domowe',
                     'zadania_powtorkowe': 'zadanie powtórkowe'}[part]
            task = {'file': PREFIX[part]+number+'.webp', 'taskNumber': number,
                    'title': f'Lekcja 10 - {label} {number}', 'coursePart': part, 'level': 'matura_podstawowa',
                    'topic': 'optymalizacja' if part != 'zadania_powtorkowe' else 'własności funkcji',
                    'tags': ['optymalizacja', 'funkcja kwadratowa'] if part != 'zadania_powtorkowe'
                            else ['powtórka', 'lekcje 7-9'],
                    'difficulty': 2, 'maxPoints': records[(part, number)]['maxPoints'],
                    'hint': hints()[part][index]}
            if answer == 'proof':
                task.update(type='external_submission', externalSubmission=True, teacherGraded=True, isProof=True,
                            instruction='Rozwiązanie wyślij na Discordzie.')
            elif isinstance(answer, str):
                task.update(type='closed', options=['A', 'B', 'C', 'D'], answer=answer)
            else:
                task.update(type='input', inputs=answer)
                if part == 'praca_domowa':
                    task['inputColumns'] = len(answer)
            tasks.append(task)
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = args.output/(STEM+'.json')
    previous_files = {task['file'] for task in json.loads(manifest.read_text())} if manifest.exists() else set()
    for task in tasks:
        images[(task['coursePart'], task['taskNumber'])].save(args.output/task['file'], 'WEBP', lossless=True, method=6)
    manifest.write_text(json.dumps(tasks, ensure_ascii=False, indent=2)+'\n')
    for file in previous_files-{task['file'] for task in tasks}:
        if Path(file).name == file and file.endswith('.webp'):
            (args.output/file).unlink(missing_ok=True)
    if args.pdf.resolve() != (args.output/(STEM+'.pdf')).resolve():
        shutil.copy2(args.pdf, args.output/(STEM+'.pdf'))
    print(json.dumps({'tasks': len(tasks), 'parts': {part: len(items) for part, items in specs.items()},
                      'images': len(images), 'taskPages': max(record['page'] for record in records.values())}))


if __name__ == '__main__':
    main()
