const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('rodzic.html', 'utf8');
const script = fs.readFileSync('static/parent-progress.js', 'utf8');
const testableScript = script.replace(/\}\)\(\);\s*$/, 'return { latestProgressMap, lessonState, partStats, examSourceAllowed }; })();');
const logic = vm.runInNewContext(testableScript, {
    document: { readyState: 'loading', addEventListener() {} }
});

const source = 'zadania/kurs/mp/lekcja_1/lekcja_1_potegi_i_pierwiastki.json';
const lesson = {
    number: 1,
    source_id: source,
    tasks: [
        { file: 'zd1.png', coursePart: 'praca_domowa' },
        { file: 'zd2.png', coursePart: 'praca_domowa' },
        { file: 'zp1.png', coursePart: 'zadania_powtorkowe' }
    ]
};
const progress = [{ source_id: source, file: 'zd1.png', result: 'bad', submitted_answer: 'A' }];
const latest = logic.latestProgressMap(progress);
const review = new Set([`${source}:zd2.png`]);
const started = logic.lessonState(lesson, latest, review);
assert.equal(started.attempted, 1);
assert.equal(started.complete, false, 'A reviewed or skipped task does not complete a lesson');
assert.equal(logic.partStats(started.entries).total, 3);
assert.equal(logic.partStats(started.entries).review, 1);
assert.equal(logic.partStats(started.entries).percent, 0);

latest.set(`${source}:zd2.png`, { result: 'medium', hint_used: true });
latest.set(`${source}:zp1.png`, { result: 'good' });
const completed = logic.lessonState(lesson, latest, review);
assert.equal(completed.complete, true);
assert.equal(logic.partStats(completed.entries).attempted, 3);
assert.equal(logic.partStats(completed.entries).percent, 67);
assert.equal(logic.partStats(completed.entries).medium, 1);
assert.equal(logic.examSourceAllowed('zadania/mp/2025/maj/exam.json', 'matura_podstawowa'), true);
assert.equal(logic.examSourceAllowed('zadania/eo/2025/maj/exam.json', 'matura_podstawowa'), false);
assert.equal(logic.examSourceAllowed('zadania/mp/../secret.json', 'matura_podstawowa'), false);

assert.match(html, /id="parentLessons"/);
assert.match(html, /<div id="nav"><\/div>/);
assert.match(html, /fetch\("nav\.html\?v=20260827-shared", \{ cache: "no-cache" \}\)/);
assert.match(html, /document\.getElementById\("nav"\)\.innerHTML = html/);
assert.match(html, /class="panel lesson-panel lesson-results" aria-label="Wyniki lekcji"/);
assert.doesNotMatch(html, /Lekcje kursu|Wyniki pracy domowej i powtórek/);
assert.match(html, /id="parentReviewSection"/);
assert.match(html, /id="parentExamsSection"/);
assert.doesNotMatch(html, /Organizacja i płatności|Pytania do nauczyciela|Ostatnie zadania/);
assert.match(script, /Uczeń: \$\{entry\.progress\.submitted_answer/);
assert.match(script, /Poprawna: \$\{expectedAnswer\(entry\.task\)\}/);
console.log('PASS: parent progress uses completed lessons, separate homework/revision and task answers');
