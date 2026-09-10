const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const context = vm.createContext({});

for (const name of ['TASK_SOURCES', 'MONTH_LABELS', 'SOURCE_TYPE_LABELS', 'SOURCE_LEVELS']) {
  const start = html.indexOf(`const ${name} = `);
  assert(start >= 0, name);
  const end = html.indexOf('\n' + (name === 'TASK_SOURCES' ? '];' : '};'), start) + 3;
  vm.runInContext(html.slice(start, end), context);
}
for (const name of ['getSourceMeta', 'getSourceMetaById', 'getExamSourceTileContent',
  'getExamNavigatorGroup', 'getGroupedExamNavigatorItems']) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), context);
}
const sources = vm.runInContext('TASK_SOURCES.map(getSourceMeta)', context);
assert.equal(new Set(sources.map(source => source.id)).size, sources.length);
for (const source of sources) assert(fs.existsSync(source.path), source.path);
const eighthGrade = sources.filter(source => source.level === 'egzamin_osmoklasisty');
assert(eighthGrade.length > 0);
assert(eighthGrade.every(source => !/formuła/i.test(source.detail)));
for (const formula of ['2015', '2023']) {
  const source = context.getSourceMeta(`zadania/eo/2026/maj_f${formula}/fixture.json`);
  assert.equal(source.detail, '2026 · maj', 'Formula suffixes are never shown for eighth-grade exams');
}
assert.match(context.getSourceMeta('zadania/mr/2026/maj_f2023/fixture.json').detail, /Formuła 2023/);

const basic = sources.filter(source => source.path.startsWith('zadania/mp/'));
assert.equal(basic.length, 35);
assert(sources.every(source => !source.path.includes('_f2015/')));
for (let year = 2015; year <= 2022; year++) {
  assert(basic.some(source => source.year === year), `Keep legacy exams from ${year}`);
}
assert(basic.every((source, index) => !index || source.year <= basic[index - 1].year));
assert(!basic.some(source => /mp\/2026\/sierpien/.test(source.path)));
const added = basic.filter(source =>
  /mp\/2022\/(czerwiec_dodatkowy|sierpien_poprawkowy)\//.test(source.path));
assert.equal(added.length, 2);
let taskCount = 0;
for (const source of added) {
  const tasks = JSON.parse(fs.readFileSync(source.path));
  taskCount += tasks.length;
  const expectedPoints = source.year === 2022 ? 45 : source.year <= 2024 ? 46 : 50;
  assert.equal(tasks.reduce((sum, task) => sum + task.maxPoints, 0), expectedPoints, source.path);
  for (const task of tasks) {
    assert(task.tags.length > 0, task.file);
    const assets = [task.file, task.contextFile].filter(Boolean);
    for (const field of ['solutions', 'gradingCriteriaFiles']) {
      for (const asset of task[field] || []) assets.push(typeof asset === 'string' ? asset : asset.file);
    }
    for (const asset of assets) assert(fs.existsSync(path.join(path.dirname(source.path), asset)), asset);
    if (task.options) assert.match(task.answer, /^[ABCD]$/, task.file);
    else assert(task.solutions.length && task.gradingCriteriaFiles.length, task.file);
  }
  const tile = context.getExamSourceTileContent(source.detail);
  assert(!tile.detail.includes('/') && !tile.detail.includes('CKE'));
}
assert.equal(taskCount, 70);

const tagIndex = JSON.parse(fs.readFileSync('zadania/tag-index.json'));
const indexedSources = new Set(Object.values(tagIndex.levels.matura_podstawowa)
  .flatMap(entry => entry.sources));
assert(added.every(source => indexedSources.has(source.id)));
const exams = sources.filter(source => source.category === 'egzaminy');
assert.equal(tagIndex.sources, exams.length);
const sourceIds = new Set(exams.map(source => source.id));
for (const level of Object.values(tagIndex.levels)) {
  for (const entry of Object.values(level)) {
    assert(entry.sources.every(id => sourceIds.has(id)), entry.label);
  }
}
assert.equal(tagIndex.tasks, exams.reduce((sum, source) =>
  sum + JSON.parse(fs.readFileSync(source.path)).length, 0));
const variants = basic.filter(source => source.year === 2026 && source.detail.includes('maj'));
const groups = context.getGroupedExamNavigatorItems(variants.map(source => ({sourceId: source.id})));
assert.equal(groups.length, 1, 'Removed formula variants must not appear in tag navigation');
assert(!groups.some(group => group.label.includes('Formuła 2015')));

for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (match[1].trim()) new vm.Script(match[1]);
}
console.log('PASS: Formula 2015 variants removed; legacy exams, assets, points, tag index and syntax verified');
