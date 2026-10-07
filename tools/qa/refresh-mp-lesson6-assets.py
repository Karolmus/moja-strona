"""Refresh MP lesson 6 PNGs while retaining the IDs of existing homework tasks."""

import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

import pdfplumber
from PIL import Image, ImageChops


HEADER = re.compile(r'^Zadanie(?P<part> domowe| powtórkowe)? (?P<number>\d+)\.')


def task_filename(part, number):
    if part == ' domowe':
        return f'zd{10 if number == 1 else number - 1}.png'
    return f'{"zp" if part == " powtórkowe" else ""}{number}.png'


def save_crop(page, image, lines, start, stop, path):
    content = [line for line in lines if line['top'] >= start and line['bottom'] < stop]
    assert content, path
    top = min(line['top'] for line in content) - 4
    bottom = max(line['bottom'] for line in content) + 4
    for table in page.find_tables():
        if table.bbox[1] >= top - 10 and table.bbox[3] < stop:
            top = min(top, table.bbox[1] - 4)
            bottom = max(bottom, table.bbox[3] + 4)
    box = (68, top, 533, bottom)
    for line in content:
        for char in line['chars']:
            assert box[0] < char['x0'] and char['x1'] < box[2], (path, char)
            assert box[1] < char['top'] and char['bottom'] < box[3], (path, char)
    scale = image.width / page.width
    crop = image.crop(tuple(round(coordinate * scale) for coordinate in box))
    height = max(140, round(crop.height * 1396 / crop.width))
    resized_height = round(crop.height * 1396 / crop.width)
    crop = crop.resize((1396, resized_height), Image.Resampling.LANCZOS)
    if height > resized_height:
        padded = Image.new('RGB', (1396, height), 'white')
        padded.paste(crop, (0, (height - resized_height) // 2))
        crop = padded
    red, green, blue = crop.split()
    if ImageChops.difference(red, green).getbbox() is None and ImageChops.difference(green, blue).getbbox() is None:
        crop = crop.convert('L')
    crop.save(path, optimize=True)
    return {
        'file': path.name,
        'box': box,
        'size': list(crop.size),
        'text': '\n'.join(line['text'] for line in content),
    }


def refresh(source, output, audit_path):
    output.mkdir(parents=True, exist_ok=True)
    records = []
    with tempfile.TemporaryDirectory(prefix='mp-lesson6-') as directory:
        rendered = Path(directory)
        subprocess.run(['pdftoppm', '-png', '-r', '220', str(source), str(rendered / 'page')], check=True)
        with pdfplumber.open(source) as document:
            for page_number, page in enumerate(document.pages, 1):
                lines = page.extract_text_lines()
                headers = [line for line in lines if HEADER.match(line['text'])]
                image = Image.open(rendered / f'page-{page_number:02d}.png').convert('RGB')
                for header in headers:
                    match = HEADER.match(header['text'])
                    number = int(match['number'])
                    filename = task_filename(match['part'], number)
                    stops = [line['top'] for line in lines if line['top'] > header['bottom'] and (
                        HEADER.match(line['text']) or line['text'].startswith('Brudnopis') or
                        re.fullmatch(r'\d+', line['text']) and line['top'] > 760
                    )]
                    assert stops, filename
                    record = save_crop(page, image, lines, header['bottom'] + 3, min(stops) - 4, output / filename)
                    record.update(page=page_number, taskNumber=number, part=match['part'] or 'main')
                    assert 'Brudnopis' not in record['text']
                    records.append(record)
                contexts = [line for line in lines if line['text'].startswith('Informacja do zadania 3 i 4')]
                if contexts:
                    assert len(contexts) == 1
                    context = contexts[0]
                    first_header = min(line['top'] for line in headers)
                    record = save_crop(page, image, lines, context['top'] - 1, first_header - 4, output / 'context_3_4.png')
                    record.update(page=page_number, part='context')
                    records.append(record)
    expected = {*(f'{i}.png' for i in range(1, 11)), *(f'zd{i}.png' for i in range(1, 11)),
                *(f'zp{i}.png' for i in range(1, 6)), 'context_3_4.png'}
    assert {record['file'] for record in records} == expected
    assert len(records) == len(expected)
    manifest = json.loads((output / 'lekcja_6_procenty_i_lokaty.json').read_text())
    assert {task['file'] for task in manifest} == expected - {'context_3_4.png'}
    for task in manifest:
        if task['coursePart'] == 'praca_domowa':
            record = next(record for record in records if record['file'] == task['file'])
            assert int(task['taskNumber']) == record['taskNumber']
    shutil.copyfile(source, output / 'lekcja_6_procenty_i_lokaty.pdf')
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    audit_path.write_text(json.dumps(records, ensure_ascii=False, indent=2))
    print(f'Updated {len(records)} canonical PNGs and the lesson PDF.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path('zadania/kurs/mp/lekcja_6'))
    parser.add_argument('--audit', type=Path, default=Path('tmp/pdfs/mp_lesson_6_2026_10/crop-audit.json'))
    args = parser.parse_args()
    refresh(args.source, args.output, args.audit)
