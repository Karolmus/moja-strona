const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const sourcePath = 'zadania/kurs/mp/lekcja_6/lekcja_6_procenty_i_lokaty.json';
const sourceDir = path.dirname(sourcePath);
const tasks = JSON.parse(fs.readFileSync(sourcePath));
const html = fs.readFileSync('zadania.html', 'utf8');
const profileHtml = fs.readFileSync('profil.html', 'utf8');
const adminHtml = fs.readFileSync('admin.html', 'utf8');
const keys = {
  zadania: ['B', 'A', 'C', 'D', 'A', ['P', 'P'], 'C', 'C', ['F', 'F'], 'B'],
  praca_domowa: ['B', 'C', 'C', 'C', 'C', ['P', 'F'], 'B', 'B', 'D'],
  zadania_powtorkowe: ['C', 'B', 'B', 'D']
};
const prefixes = {zadania: '', praca_domowa: 'zd', zadania_powtorkowe: 'zp'};

assert.equal(tasks.length, 24);
assert.equal(new Set(tasks.map(task => task.file)).size, 24);

for (const [part, key] of Object.entries(keys)) {
  const items = tasks.filter(task => task.coursePart === part && task.type !== 'external_submission');
  assert.equal(items.length, key.length, part);
  items.forEach((task, index) => {
    assert.equal(task.file, `${prefixes[part]}${index + 1}.png`);
    assert.deepEqual(task.answer, key[index], task.file);
    if (Array.isArray(key[index])) {
      assert.equal(task.type, 'true_false');
      assert.deepEqual(task.statements, ['Stwierdzenie 1', 'Stwierdzenie 2']);
      assert(!('options' in task));
    } else {
      assert.equal(task.type, 'closed');
      assert.deepEqual(task.options, ['A', 'B', 'C', 'D']);
    }
    assert.equal(task.level, 'matura_podstawowa');
    assert.equal(task.maxPoints, 1);
    assert(task.hint && task.tags.length >= 2);
  });
}

assert.equal(tasks.find(task => task.file === '3.png').contextFile, 'context_3_4.png');
assert.equal(tasks.find(task => task.file === '4.png').contextFile, 'context_3_4.png');

const proof = tasks.find(task => task.file === 'zp5.png');
assert(proof);
assert.equal(proof.coursePart, 'zadania_powtorkowe');
assert.equal(proof.type, 'external_submission');
assert.equal(proof.externalSubmission, true);
assert.equal(proof.isProof, true);
assert.equal(proof.maxPoints, 2);
assert.equal(proof.instruction, 'Rozwiązanie zadania wyślij na platformie Discord.');
assert(proof.hint.includes('12m + 1'));
assert(!('answer' in proof));
assert(!('options' in proof));

for (const file of [...tasks.map(task => task.file), 'context_3_4.png']) {
  const image = fs.readFileSync(path.join(sourceDir, file));
  assert.equal(image.subarray(1, 4).toString(), 'PNG', file);
  assert.equal(image.readUInt32BE(16), 1396, file);
  assert(image.readUInt32BE(20) >= 140 && image.readUInt32BE(20) <= 584, file);

  const webp = fs.readFileSync(path.join(sourceDir, file.replace(/\.png$/, '.webp')));
  assert.equal(webp.subarray(0, 4).toString(), 'RIFF', file);
  assert.equal(webp.subarray(8, 12).toString(), 'WEBP', file);
}

assert(fs.statSync(path.join(sourceDir, 'lekcja_6_procenty_i_lokaty.pdf')).size > 300000);

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
  assert(text.indexOf('lekcja_5/lekcja_5_zadania_dowodowe.json') < text.indexOf(sourcePath));
  assert(text.indexOf(sourcePath) < text.indexOf('zadania/kurs/mp/test_lekcje_1_6/test_lekcje_1_6.json'));
}

(async () => {
  const source = {
    id: sourcePath, path: sourcePath, category: 'kurs', level: 'matura_podstawowa',
    label: 'Lekcja 6', detail: 'Procenty i lokaty'
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
  assert.equal(ctx.tasks.length, 14, 'Student receives homework and review tasks by default');
  assert(ctx.tasks.every(task => workParts.includes(task.coursePart)));
  assert.equal(ctx.getSourceCompletionTasks(source).length, 14);

  const admin = vm.createContext({
    adminTaskCatalog: tasks.map(task => ({...task, category: 'kurs', sourceId: sourcePath}))
  });
  vm.runInContext(functionSource(adminHtml, 'getCatalogSources'), admin);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {courseParts: workParts})[0].totalTasks, 14);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {coursePart: 'praca_domowa'})[0].totalTasks, 9);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {coursePart: 'zadania_powtorkowe'})[0].totalTasks, 5);
  console.log('PASS: MP lesson 6, 24 audited tasks, clean crops, student access and all catalogs');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
