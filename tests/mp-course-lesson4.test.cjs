const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const sourcePath = 'zadania/kurs/mp/lekcja_4/lekcja_4_rownania_iloczynowe_i_wymierne.json';
const tasks = JSON.parse(fs.readFileSync(sourcePath));
const html = fs.readFileSync('zadania.html', 'utf8');
const profileHtml = fs.readFileSync('profil.html', 'utf8');
const adminHtml = fs.readFileSync('admin.html', 'utf8');
const keys = {
  zadania: 'C B D A B A B D B B C C A D C C'.split(' '),
  praca_domowa: 'C A D C B B A A B A B A D C'.split(' '),
  zadania_powtorkowe: 'A B A C C B'.split(' ')
};
const prefixes = {zadania: '', praca_domowa: 'zd', zadania_powtorkowe: 'zp'};

assert.equal(tasks.length, 36);
assert.equal(new Set(tasks.map(task => task.file)).size, 36);
for (const [part, key] of Object.entries(keys)) {
  const items = tasks.filter(task => task.coursePart === part);
  assert.equal(items.length, key.length, part);
  items.forEach((task, index) => {
    assert.equal(task.file, `${prefixes[part]}${index + 1}.png`);
    assert.equal(task.answer, key[index], task.file);
    assert.equal(task.type, 'closed');
    assert.deepEqual(task.options, ['A', 'B', 'C', 'D']);
    assert.equal(task.level, 'matura_podstawowa');
    assert.equal(task.maxPoints, 1);
    assert(task.hint && task.tags.length >= 2);
    const image = fs.readFileSync(path.join(path.dirname(sourcePath), task.file));
    assert.equal(image.subarray(1, 4).toString(), 'PNG');
    assert.equal(image.readUInt32BE(16), 1396);
    assert(image.readUInt32BE(20) > 250 && image.readUInt32BE(20) < 550);
  });
}

assert.equal(tasks.find(task => task.file === '5.png').answer, 'B', 'Corrected domain excludes both roots of x² - 3');
assert.equal(tasks.find(task => task.file === '8.png').answer, 'D', 'A rational divisor must also be nonzero');
assert.equal(tasks.find(task => task.file === 'zd14.png').answer, 'C', 'The simplified expression is (x + 5) / (2x - 12)');
assert(fs.statSync('zadania/kurs/mp/lekcja_4/lekcja_4_rownania_iloczynowe_i_wymierne.pdf').size > 750000);

function functionSource(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  const body = text.slice(start, text.indexOf('\n}', start) + 2);
  return text.slice(start - 6, start) === 'async ' ? `async ${body}` : body;
}

function config(text, name) {
  const value = text.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  assert(value, name);
  return vm.runInNewContext(value[1]);
}

for (const [file, name] of [
  ['zadania.html', 'TASK_SOURCES'],
  ['profil.html', 'PROFILE_SOURCES'],
  ['admin.html', 'ADMIN_TASK_SOURCES']
]) {
  const text = fs.readFileSync(file, 'utf8');
  const entries = config(text, name).filter(source => source.path === sourcePath);
  assert.equal(entries.length, 1, `${file}: lesson registered once`);
  assert.equal(entries[0].level, 'matura_podstawowa');
  assert.equal(entries[0].category, 'kurs');
}

(async () => {
  const source = {
    id: sourcePath, path: sourcePath, category: 'kurs', level: 'matura_podstawowa',
    label: 'Lekcja 4', detail: 'Równania iloczynowe i wymierne'
  };
  const workParts = ['praca_domowa', 'zadania_powtorkowe'];
  const ctx = vm.createContext({
    loggedUser: null,
    STUDENT_WORK_COURSE_PART: workParts[0],
    STUDENT_WORK_COURSE_PARTS: workParts,
    getSourceMeta: () => source,
    loadJsonSource: async () => tasks,
    normalizeTaskSolutions: () => [],
    normalizeTaskGradingCriteria: () => [],
    normalizeCourseTextGradingCriteria: () => [],
    normalizeTaskTags: task => task.tags
  });
  for (const name of ['canAccessCoursePart', 'loadTaskSource', 'getSourceCompletionTasks']) {
    vm.runInContext(functionSource(html, name), ctx);
  }
  ctx.tasks = await ctx.loadTaskSource(source);
  assert.equal(ctx.tasks.length, 20, 'Student receives homework and review tasks by default');
  assert(ctx.tasks.every(task => workParts.includes(task.coursePart)));
  assert.equal(ctx.getSourceCompletionTasks(source).length, 20);

  const admin = vm.createContext({
    adminTaskCatalog: tasks.map(task => ({...task, category: 'kurs', sourceId: sourcePath}))
  });
  vm.runInContext(functionSource(adminHtml, 'getCatalogSources'), admin);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {courseParts: workParts})[0].totalTasks, 20);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {coursePart: 'praca_domowa'})[0].totalTasks, 14);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {coursePart: 'zadania_powtorkowe'})[0].totalTasks, 6);
  console.log('PASS: MP lesson 4, 36 audited tasks, clean crops, student access and all catalogs');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
