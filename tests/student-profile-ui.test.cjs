const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('profil.html', 'utf8');

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}

assert.match(html, /class="panel course-progress-panel"/);
assert.match(html, /matura_podstawowa: 25/);
assert.match(html, />Zadania do poprawy</);
assert.match(html, />Wyniki z pracy domowej</);
assert(!html.includes('Wyniki każdej pracy domowej względem wszystkich zadań z danej lekcji.'));
assert.match(html, /latestByKey\.get\(`\$\{source\.path\}:\$\{task\.file\}`\)\?\.result === "bad"/,
  'Only unsuccessful tasks are listed');
assert.match(html, /detail\.textContent = labels\.detail \? ` - \$\{labels\.detail\}` : "";/,
  'Lesson number and title have a visible separator');

const sourcePath = 'zadania/kurs/mp/lekcja_1/test.json';
const sourceCatalog = [{
  path: sourcePath,
  category: 'kurs',
  filesByPart: new Map([
    ['zadania', new Set(['1.png'])],
    ['praca_domowa', new Set(['zd1.png'])]
  ])
}];
const ctx = vm.createContext({sourceCatalog});

for (const name of ['progressSourceId', 'progressFile', 'progressKey', 'sourceCompletionFiles', 'calculateProgress', 'courseCompletion']) {
  vm.runInContext(functionSource(name), ctx);
}

const progress = [{source_id: sourcePath, file: 'zd1.png', result: 'good'}];
const stats = ctx.calculateProgress(progress, 'kurs', 'praca_domowa', 25);
assert.equal(stats.completed, 1);
assert.equal(stats.target, 25);
assert.equal(stats.percent, 4);
assert.equal(ctx.courseCompletion(progress, 25).total, 25);
assert.equal(ctx.courseCompletion(progress, 25).complete, false);
assert.equal(ctx.courseCompletion(progress).complete, true, 'Other levels retain catalog-based completion');

console.log('PASS: compact student profile, 25-lesson MP target, failed-only details and clear lesson labels');
