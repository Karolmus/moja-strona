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

const basic = sources.filter(source => source.path.startsWith('zadania/mp/'));
assert.equal(basic.length, 46);
assert(basic.every((source, index) => !index || source.year <= basic[index - 1].year));
assert(!basic.some(source => /mp\/2026\/sierpien/.test(source.path)));
const added = basic.filter(source => /_f2015\//.test(source.path) ||
  /mp\/2022\/(czerwiec_dodatkowy|sierpien_poprawkowy)\//.test(source.path));
assert.equal(added.length, 13);
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
  if (source.year >= 2023) assert(tile.detail.includes('Formuła 2015'));
}
assert.equal(taskCount, 456);

const tagIndex = JSON.parse(fs.readFileSync('zadania/tag-index.json'));
const indexedSources = new Set(Object.values(tagIndex.levels.matura_podstawowa)
  .flatMap(entry => entry.sources));
assert(added.every(source => indexedSources.has(source.id)));
const variants = basic.filter(source => source.year === 2026 && source.detail.includes('maj'));
const groups = context.getGroupedExamNavigatorItems(variants.map(source => ({sourceId: source.id})));
assert.equal(groups.length, 2, 'Formula variants must remain separate in tag navigation');
assert(groups.some(group => group.label.includes('Formuła 2015')));

for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (match[1].trim()) new vm.Script(match[1]);
}
console.log('PASS: 13 new exams, 456 tasks, assets, points, tag index, formula groups and inline script syntax');
