"""Import lesson 9 task bodies from the user's exported PDF."""
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
OUT = ROOT / 'zadania/kurs/mp/lekcja_9'
PARTS = {'': 'zadania', 'domowe': 'praca_domowa', 'powtórkowe': 'zadania_powtorkowe'}
PREFIX = {'zadania': '', 'praca_domowa': 'zd', 'zadania_powtorkowe': 'zp'}


def field(label, answer, **extra):
    if extra.get('math') and 'x' in answer:
        extra.update(math=False, inputMode='text')
    return {'label': label, 'prompt': label, 'answer': answer, **extra}


def interval(label, answer):
    return field(label, answer, control='interval', math=False, inputMode='text')


def roots(answer):
    return field('Miejsca zerowe', answer, control='equation', math=True)


def choice(label, answer, options):
    return field(label, answer, options=options, math=False)


def signs(*items):
    return [choice(label, answer, ['<', '=', '>']) for label, answer in items]


def forms(*answers):
    labels = ['Postać kanoniczna', 'Postać ogólna', 'Postać iloczynowa']
    return [field(label, answer, math=True) for label, answer in zip(labels, answers) if answer]


def extrema(minimum, xmin, maximum, xmax):
    result = []
    for label, value in [('Minimum', minimum), ('Argument minimum', xmin),
                         ('Maksimum', maximum), ('Argumenty maksimum', xmax)]:
        if value is None:
            result.append(field(label, 'nie istnieje', answers=['nie istnieje', 'brak', 'nie ma'], math=False))
        elif label == 'Argumenty maksimum' and ';' in value:
            result.append(field(label, value, control='equation', math=True))
        else:
            result.append(field(label, value, math=True))
    return result


def task_specs():
    updown = ['w górę', 'w dół']
    yesno = ['tak', 'nie']
    main = {
        '1.1': forms('-8/9*(x-1)^2+2', '-8/9*x^2+16/9*x+10/9', '-8/9*(x+1/2)*(x-5/2)'),
        '1.2': [interval('Zbiór wartości', '(-inf;2]'), interval('Rosnąca', '(-inf;1]'),
                interval('Malejąca', '[1;inf)'), field('Oś symetrii: x =', '1')],
        '1.3': [field('Minimum', '-6'), field('Maksimum', '2')],
        '1.4': [field('Argumenty x', '-5;7', control='equation', math=True)],
        '2.1': [field('Postać ogólna', '2*x^2-4/3*x+11/9', math=True), field('Wierzchołek: x', '1/3'),
                field('Wierzchołek: y', '1'), choice('Ramiona', 'w górę', updown)],
        '2.2': [field('Postać ogólna', '-1/3*x^2-7/5*x-4/15', math=True), roots('-4;-1/5'),
                choice('Ramiona', 'w dół', updown)],
        '2.3': [field('Postać kanoniczna', '(x-5)^2-16', math=True), field('Wierzchołek: x', '5'),
                field('Wierzchołek: y', '-16'), field('Minimum', '-16')],
        '2.4': [field('Postać kanoniczna', '6*(x+2/3)^2-2/3', math=True), choice('Czy P należy do wykresu?', 'tak', yesno)],
        '2.5': [field('Postać iloczynowa', '2*(x+1)*(x+2)', math=True), roots('-2;-1'),
                choice('Czy P należy do wykresu?', 'nie', yesno)],
        '2.6': [field('Postać iloczynowa', '2*(x+1/6-sqrt(2))*(x+1/6+sqrt(2))', math=True),
                roots('-1/6-sqrt(2);-1/6+sqrt(2)'), field('Wierzchołek: x', '-1/6'), field('Wierzchołek: y', '-4')],
        '3.1': [roots('2;3'), interval('Zbiór rozwiązań', '(-inf;2] U [3;inf)')],
        '3.2': [roots('-3/2;1'), interval('Zbiór rozwiązań', '(-inf;-3/2) U (1;inf)')],
        '3.3': [roots('-5/2;3'), interval('Zbiór rozwiązań', '[-5/2;3]')],
        '3.4': [roots('1/5;1'), interval('Zbiór rozwiązań', '[1/5;1]')],
        '4.1': [interval('Zbiór rozwiązań', '(4;6)')],
        '4.2': [interval('Zbiór rozwiązań', '(-inf;-1] U [1;inf)')],
        '4.3': [interval('Zbiór rozwiązań', '∅')],
        '4.4': [interval('Zbiór rozwiązań', '(-sqrt(3)/3;sqrt(3)/3)')],
        '4.5': [interval('Zbiór rozwiązań', 'R')],
        '4.6': [interval('Zbiór rozwiązań', '{3}')],
        '4.7': [interval('Zbiór rozwiązań', '(-inf;-2) U (-2;inf)')],
        '4.8': [interval('Zbiór rozwiązań', '[(2-sqrt(7))/3;(2+sqrt(7))/3]')],
        '5.1': extrema('6', '-1', None, None),
        '5.2': extrema(None, None, '73/36', '1/6'),
        '5.3': extrema(None, None, '485', '9*sqrt(3)'),
        '5.4': extrema('5', '-1/2', '23/4', '-1;0'),
        '5.5': extrema('-25/4', '-1/2', None, None),
        '5.6': extrema(None, None, '169/15', '7/15'),
        '6.1': signs(('a) a', '<'), ('a) p', '>'), ('b) a', '>'), ('b) p', '>')),
        '6.2': signs(('a) c', '<'), ('a) q', '>'), ('b) c', '<'), ('b) q', '<')),
        '6.3': signs(('a) x₁', '>'), ('a) x₂', '>'), ('b) x₁', '<'), ('b) x₂', '>')),
        '6.4': signs(('a) b', '>'), ('b) b', '<')),
        '7.1': [interval('Zbiór rozwiązań', '[0;4]')], '7.2': 'C', '7.3': [field('t', '7')],
        '8': 'C', '9': 'B', '10': 'D', '11': 'D', '12': 'C', '13': 'A', '14': 'B', '15': 'C', '16': 'A', '17': 'D',
        '18.1': 'C', '18.2': 'B', '18.3': ['P', 'F'],
        '19': forms('-(x-1)^2+4', '-x^2+2*x+3'),
        '20': [field('f(x)', '-3*(x+2)^2', math=True)],
        '21': [field('Postać kanoniczna', '3/2*(x-2)^2-3/2', math=True)],
        '22': [field('Postać ogólna', '3/4*x^2-6*x+9', math=True)],
        '23': [interval('Zbiór rozwiązań', '[-1/3;3]')], '24': [interval('Zbiór rozwiązań', '[-1/2;3]')],
        '25': ['P', 'F'], '26': 'C',
    }
    homework = {
        '1': 'A', '2': 'B', '3': 'C', '4.1': forms('(x+1)^2-4', 'x^2+2*x-3'),
        '4.2': [interval('Zbiór rozwiązań', '(-inf;-3) U (1;inf)')], '5': ['P', 'F'],
        '6': extrema('-3', '2', '6', '5'),
        '7.1': [interval('Zbiór rozwiązań', '[1;3]')],
        '7.2': [interval('Zbiór rozwiązań', '(-inf;-3) U (-3;inf)')],
        '8': forms('3*(x+2)^2-3', None, '3*(x+1)*(x+3)') + [field('Wierzchołek: x', '-2'),
              field('Wierzchołek: y', '-3'), roots('-3;-1'), choice('Ramiona', 'w górę', updown),
              choice('Czy P należy do wykresu?', 'tak', yesno)],
        '9.1': 'C', '9.2': 'C', '9.3': forms('-(x+2)^2+4', '-x^2-4*x'),
        '10': 'C', '11': 'B', '12': 'D', '13': 'B', '14': ['P', 'P'], '15': 'D',
        '16': forms('1/2*(x+4)^2', '1/2*x^2+4*x+8'),
        '17.1': [field('Postać kanoniczna', '-2*(x+1)^2+2', math=True)],
        '17.2': [field('Wierzchołek: x', '2'), field('Wierzchołek: y', '2'), roots('1;3')],
        '18': [interval('Zbiór rozwiązań', '(-6;2)')],
        '19.1': signs(('a ☐ 0', '<'), ('p ☐ 0', '<')),
        '19.2': signs(('c ☐ 0', '<'), ('q ☐ 0', '>')),
        '19.3': signs(('x₁ ☐ 0', '<'), ('x₂ ☐ 0', '<')),
        '19.4': signs(('b ☐ 0', '<')),
    }
    interval_tools = ['paren-left', 'paren-right', 'bracket-left', 'bracket-right', 'infinity', 'union']
    for number in ['4.1', '16', '17.1', '17.2']:
        for item in homework[number]:
            if not item.get('options'):
                item['mathTools'] = ['square']
    for number in ['4.2', '7.1', '7.2', '9.3', '18']:
        for item in homework[number]:
            item['mathTools'] = interval_tools
    for item in homework['6']:
        item.update(math=False, mathTools=[], inputMode='decimal')
    for item in homework['8']:
        if item['label'] == 'Miejsca zerowe':
            item.update(control='values', mathTools=['fraction'], placeholder='x₁; x₂')
    review = {'1': 'proof', '2': 'A', '3': 'C', '4': 'D', '5': 'C', '6': 'C',
              '7': [field('Punkt przecięcia', '(3,5)', control='point', math=False,
                          mathTools=[], inputMode='text', placeholder='(x, y)')]}
    return {'zadania': main, 'praca_domowa': homework, 'zadania_powtorkowe': review}


def hint_for(part, number):
    if part == 'zadania_powtorkowe':
        return {'1': 'Wyłącz przed nawias 5n.', '2': 'Po podwyżce cena wynosi 125% ceny początkowej.',
                '3': 'Po roku kapitał pomnóż przez 1,05.', '4': 'Wyznacz zera mianownika.',
                '5': 'Dla każdego wzoru sprawdź osobno warunek na x.',
                '6': 'Oblicz współczynnik kierunkowy z dwóch punktów.',
                '7': 'Przyrównaj wzory funkcji f i g.'}[number]
    group = int(number.split('.')[0])
    if part == 'zadania':
        if group == 1: return 'Zacznij od postaci a(x - 1)² + 2.'
        if group == 2: return 'Rozpoznaj współczynnik przy x² lub wyłącz go przed nawias.'
        if group in (3, 4, 23, 24): return 'Wyznacz miejsca zerowe trójmianu.'
        if group == 5: return 'Sprawdź, czy wierzchołek należy do podanego przedziału.'
        if group == 6: return 'Zwróć uwagę na kierunek ramion i położenie wierzchołka.'
        if group in (7, 18): return 'Odczytaj z wykresu położenie wierzchołka.'
        if group in (19, 21, 22): return 'Zapisz funkcję w postaci kanonicznej.'
        if group == 20: return 'Punkt N jest jedynym punktem wspólnym z osią Ox.'
    return 'Zacznij od współrzędnych wierzchołka lub miejsc zerowych funkcji.'


def extract(pdf):
    outputs, records = {}, {}
    scale = 200 / 72
    with pdfplumber.open(pdf) as document, tempfile.TemporaryDirectory(prefix='ds-mp9-') as temp:
        for index, page in enumerate(document.pages):
            unique = {}
            for rect in page.rects:
                color = rect.get('non_stroking_color')
                if rect['width'] > 440 and 8 < rect['height'] < 26 and isinstance(color, (tuple, list)) and len(color) == 3 and max(color)-min(color) > .08:
                    unique[tuple(round(rect[key], 1) for key in ('x0', 'top', 'x1', 'bottom'))] = rect
            bands = sorted(unique.values(), key=lambda item: item['top'])
            if not bands:
                continue
            prefix = Path(temp) / f'page-{index+1}'
            subprocess.run(['pdftoppm', '-f', str(index+1), '-l', str(index+1), '-r', '200',
                            '-singlefile', '-png', str(pdf), str(prefix)], check=True, capture_output=True)
            raster = Image.open(prefix.with_suffix('.png')).convert('RGB')
            words = page.extract_words()
            for position, band in enumerate(bands):
                label = page.crop((band['x0'], band['top'], band['x1'], band['bottom'])).extract_text() or ''
                match = re.search(r'Zadanie\s+(?:(domowe|powtórkowe)\s+)?(\d+(?:\.\d+)*)\.', label)
                if not match:
                    raise ValueError(f'Unknown task heading: {label}')
                part, number = PARTS[match[1] or ''], match[2]
                points = re.search(r'0\s*[–—-]\s*(\d+)', label)
                if not points:
                    raise ValueError(f'Missing points: {label}')
                key = (part, number)
                if key in records:
                    raise ValueError(f'Duplicate task heading: {key}')
                stop = bands[position+1]['top']-1 if position+1 < len(bands) else page.height-58
                stops = [word['top']-3 for word in words if word['text'] in ('Brudnopis', 'Obliczenia', 'Powtórka', 'Odpowiedzi')
                         and band['bottom'] < word['top'] < stop]
                if stops:
                    stop = min(stops)
                body = raster.crop((round(65*scale), round((band['bottom']+1)*scale), round(535*scale), round(stop*scale)))
                bounds = ImageChops.difference(body, Image.new('RGB', body.size, 'white')).getbbox()
                records[key] = {'maxPoints': int(points[1]), 'page': index+1}
                if bounds:
                    outputs[key] = ImageOps.expand(body.crop((0, bounds[1], body.width, bounds[3])), border=12, fill='white')
    return outputs, records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf', type=Path, default=OUT/'lekcja_9_funkcja_kwadratowa.pdf')
    parser.add_argument('--output', type=Path, default=OUT)
    parser.add_argument('--metadata-only', action='store_true', help='Update input controls without recropping the PDF')
    args = parser.parse_args()
    out = args.output
    specs = task_specs()
    if args.metadata_only:
        manifest = out/'lekcja_9_funkcja_kwadratowa.json'
        tasks = json.loads(manifest.read_text())
        expected = {(part, number) for part, items in specs.items() for number in items}
        if {(task['coursePart'], task['taskNumber']) for task in tasks} != expected:
            raise ValueError('Task numbers differ from the imported PDF')
        for task in tasks:
            answer = specs[task['coursePart']][task['taskNumber']]
            if task['type'] == 'input':
                if not isinstance(answer, list) or not all(isinstance(item, dict) for item in answer):
                    raise ValueError(f'Unexpected input task: {task["file"]}')
                task['inputs'] = answer
        manifest.write_text(json.dumps(tasks, ensure_ascii=False, indent=2)+'\n')
        print(f'Updated input controls for {len(tasks)} tasks; PDF and images unchanged')
        return
    images, records = extract(args.pdf)
    contexts = {('zadania', n): f'info_{n}.webp' for n in ['1', '6', '7', '18']}
    contexts.update({('praca_domowa', n): f'info_zd{n}.webp' for n in ['4', '9', '17', '19']})
    tasks, files = [], {}
    for key, file in contexts.items():
        if key not in images:
            raise ValueError(f'Missing shared information: {key}')
        files[file] = images[key]
    for part, items in specs.items():
        for number, answer in items.items():
            key = (part, number)
            if key not in images:
                raise ValueError(f'Missing task body: {key}')
            file = PREFIX[part]+number+'.webp'
            files[file] = images[key]
            label = {'zadania':'zadanie', 'praca_domowa':'zadanie domowe', 'zadania_powtorkowe':'zadanie powtórkowe'}[part]
            task = {'file':file, 'taskNumber':number, 'title':f'Lekcja 9 - {label} {number}',
                    'coursePart':part, 'level':'matura_podstawowa', 'topic':'funkcja kwadratowa',
                    'tags':['funkcja kwadratowa', 'własności funkcji'] if part != 'zadania_powtorkowe' else ['powtórka', 'lekcje 5-8'],
                    'difficulty':2, 'maxPoints':records[key]['maxPoints'], 'hint':hint_for(part,number)}
            parent = (part, number.split('.')[0])
            if '.' in number and parent in contexts and key != ('zadania','7.3'):
                task['contextFile'] = contexts[parent]
            if answer == 'proof':
                task.update(type='external_submission', externalSubmission=True, teacherGraded=True, isProof=True,
                            instruction='Rozwiązanie wyślij na Discordzie.', topic='zadania dowodowe')
            elif isinstance(answer,str):
                task.update(type='closed', options=['A','B','C','D'], answer=answer)
            elif all(isinstance(value,str) for value in answer):
                task.update(type='true_false', statements=['Stwierdzenie 1','Stwierdzenie 2'], answer=answer, maxPoints=1)
            else:
                task.update(type='input', inputs=answer)
            tasks.append(task)
    expected = set((part,number) for part,items in specs.items() for number in items) | set(contexts)
    unused = set(images)-expected
    if unused:
        raise ValueError(f'Unmapped task crops: {sorted(unused)}')
    out.mkdir(parents=True, exist_ok=True)
    for file, image in files.items():
        image.save(out/file, 'WEBP', lossless=True, method=6)
    (out/'lekcja_9_funkcja_kwadratowa.json').write_text(json.dumps(tasks, ensure_ascii=False, indent=2)+'\n')
    if args.pdf.resolve() != (out/'lekcja_9_funkcja_kwadratowa.pdf').resolve():
        shutil.copy2(args.pdf, out/'lekcja_9_funkcja_kwadratowa.pdf')
    print(json.dumps({'tasks':len(tasks), 'parts':{part:len(items) for part,items in specs.items()},
                      'images':len(files), 'pages':max(value['page'] for value in records.values())}, ensure_ascii=False))


if __name__ == '__main__':
    main()
