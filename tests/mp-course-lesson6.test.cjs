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
  zadania: ['B', 'A', 'C', 'D', 'A', 'C', 'C', ['F', 'F'], 'B'],
  praca_domowa: ['A', 'B', 'C', 'D', 'C', 'A', ['P', 'F'], 'B', 'B', 'D'],
  zadania_powtorkowe: ['C', 'B', 'B', 'D']
};
const prefixes = {zadania: '', praca_domowa: 'zd', zadania_powtorkowe: 'zp'};

assert.equal(tasks.length, 25);
assert.equal(new Set(tasks.map(task => task.file)).size, 25);

for (const [part, key] of Object.entries(keys)) {
  const items = tasks.filter(task => task.coursePart === part &&
    task.type !== 'external_submission' && task.teacherGraded !== true);
  const expectedFiles = part === 'zadania'
    ? ['1.png', '2.png', '3.png', '4.png', '5.png', '7.png', '8.png', '9.png', '10.png']
    : part === 'praca_domowa'
      ? ['zd10.png', ...Array.from({length: 9}, (_, index) => `zd${index + 1}.png`)]
      : key.map((_, index) => `${prefixes[part]}${index + 1}.png`);
  assert.equal(items.length, key.length, part);
  items.forEach((task, index) => {
    assert.equal(task.file, expectedFiles[index]);
    assert.deepEqual(task.answer, key[index], task.file);
    if(part === 'praca_domowa'){
      assert.equal(task.taskNumber, String(index + 1));
      assert.equal(task.title, `Lekcja 6 - praca domowa ${index + 1}`);
    }
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

const teacherGraded = tasks.find(task => task.file === '6.png');
assert(teacherGraded);
assert.equal(teacherGraded.coursePart, 'zadania');
assert.equal(teacherGraded.type, 'input');
assert.equal(teacherGraded.teacherGraded, true);
assert.equal(teacherGraded.maxPoints, 1);
assert.equal(teacherGraded.inputs.length, 1);
assert.equal(teacherGraded.inputs[0].control, 'textarea');
assert.equal(teacherGraded.inputs[0].minLength, 20);
assert.match(teacherGraded.inputs[0].prompt, /P\/F obu stwierdzeń/i);
assert.match(teacherGraded.instruction, /zadanie oceni nauczyciel/i);
assert(!('answer' in teacherGraded));
assert(!('options' in teacherGraded));
assert(!('statements' in teacherGraded));

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
  assert(image.readUInt32BE(20) >= 140 && image.readUInt32BE(20) <= 620, file);
}

assert.equal(
  fs.readdirSync(sourceDir).filter(file => file.endsWith('.webp')).length,
  0,
  'Lesson 6 keeps one image format only'
);

assert(fs.statSync(path.join(sourceDir, 'lekcja_6_procenty_i_lokaty.pdf')).size > 300000);

const homework = tasks.filter(task => task.coursePart === 'praca_domowa');
const distribution = {A: 0, B: 0, C: 0, D: 0};
homework.filter(task => task.type === 'closed').forEach(task => distribution[task.answer]++);
assert.deepEqual(distribution, {A: 2, B: 3, C: 2, D: 2});

function checkNumericalAnswer(task, value, options){
  const matches = options.flatMap((option, index) => Math.abs(option - value) < 1e-7 ? ['ABCD'[index]] : []);
  assert.deepEqual(matches, [task.answer], task.title);
}
const main = tasks.filter(task => task.coursePart === 'zadania');
checkNumericalAnswer(main[0], 0.9 * 1.1, [0.8, 0.99, 1, 1.2]);
checkNumericalAnswer(main[1], 6400 * (1 - 0.8 ** 2), [2304, 2560, 3840, 4096]);
checkNumericalAnswer(main[2], 100 * (6 - 3) / 3, [3, 50, 100, 200]);
checkNumericalAnswer(main[3], 1700000 / (0.16 - 0.06) * 0.54, [5400000, 10625000, 15660000, 9180000]);
checkNumericalAnswer(main[4], 0.24 / 1.32, [2 / 11, 0.18, 5.5, 50 / 9]);
checkNumericalAnswer(main[6], 60000 * (1.04 ** 2 - 1), [4800, 64800, 4896, 64896]);
const capitalizationOptions = [1, 2, 4, 8];
const capitalizations = capitalizationOptions.filter(count =>
  Math.abs(10000 * ((1 + 0.4 / count) ** count - 1) - 4641) < 1e-7);
assert.deepEqual(capitalizations, [capitalizationOptions['ABCD'.indexOf(main[7].answer)]]);
checkNumericalAnswer(main[9], 200 * (Math.sqrt(10816 / 10000) - 1), [4, 8, 8.16, 16]);
assert.equal(main[8].answer[0], 1.04 > (1 + 0.04 / 2) ** 2 ? 'P' : 'F');
assert.equal(main[8].answer[1], 1.08 > (1 + 0.079 / 2) ** 2 ? 'P' : 'F');
checkNumericalAnswer(homework[0], 100 * 0.85 * 0.9, [76.5, 75, 80, 95]);
checkNumericalAnswer(homework[1], 100 * Math.sqrt(1 - 0.96), [10, 20, 25, 40]);
checkNumericalAnswer(homework[2], 768 / (1 - 0.8 * 0.85), [1800, 2200, 2400, 2600]);
checkNumericalAnswer(homework[3], 35 * 1.5 / 2.5, [14, 20, 70 / 3, 21]);
checkNumericalAnswer(homework[4], 2400 / (0.45 - 0.3) * 0.25, [2400, 3200, 4000, 6000]);
checkNumericalAnswer(homework[5], 100 * 0.8 * 1.25, [100, 80, 64, 125]);
assert.deepEqual(homework[6].answer, [0.5 * 2 === 1 ? 'P' : 'F', 1.1 ** 2 === 1.2 ? 'P' : 'F']);
checkNumericalAnswer(homework[7], (13125 / 1.05 - 2000) / 1.05, [9500, 10000, 10500, 11000]);
const depositDifference = Math.round(10000 * ((1 + 0.079 / 2) ** 2 - 1.08) * 100) / 100;
checkNumericalAnswer(homework[8], depositDifference, [-5.6, 5.6, -56, 56]);
checkNumericalAnswer(homework[9], Math.ceil(Math.log(2) / Math.log(1.1)), [11, 10, 9, 8]);
assert(10000 * 1.1 ** 7 < 20000 && 10000 * 1.1 ** 8 > 20000);
for(let k = 0; k < 100; k++){
  const n = 2 * k + 1;
  assert.equal((3 * n + 2) ** 2, 12 * (3 * k ** 2 + 5 * k + 2) + 1);
}
const review = tasks.filter(task => task.coursePart === 'zadania_powtorkowe');
checkNumericalAnswer(review[0], (Math.sqrt(72) - 2 * Math.sqrt(8) + Math.sqrt(50)) / Math.sqrt(2), [5, 6, 7, 9]);
checkNumericalAnswer(review[1], Math.log10(0.001) + 2 * Math.log10(Math.sqrt(10)), [-3, -2, -1, 2]);
checkNumericalAnswer(review[2], (2 * 4 ** 2 - 3 * 4) * (2 * 4 ** 2 + 3 * 4),
  [2 * 4 ** 4 - 3 * 4 ** 2, 2 ** 2 * 4 ** 4 - 3 ** 2 * 4 ** 2,
    6 * 4 ** 4 - 6 * 4 ** 2, 2 ** 2 * 4 ** 2 - 3 ** 2 * 4 ** 2]);
checkNumericalAnswer(review[3], 0, [4, 2, 1, 0]);

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
  assert.equal(ctx.tasks.length, 15, 'Student receives homework and review tasks by default');
  assert(ctx.tasks.every(task => workParts.includes(task.coursePart)));
  assert.equal(ctx.getSourceCompletionTasks(source).length, 15);

  for(const name of ['coursePartOrdinalNumber', 'taskNumberLabel']){
    vm.runInContext(functionSource(html, name), ctx);
  }
  assert.deepEqual(Array.from(ctx.tasks.filter(task => task.coursePart === 'praca_domowa'), ctx.taskNumberLabel),
    Array.from({length: 10}, (_, index) => String(index + 1)));

  const admin = vm.createContext({
    adminTaskCatalog: tasks.map(task => ({...task, category: 'kurs', sourceId: sourcePath}))
  });
  vm.runInContext(functionSource(adminHtml, 'getCatalogSources'), admin);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {courseParts: workParts})[0].totalTasks, 15);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {coursePart: 'praca_domowa'})[0].totalTasks, 10);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {coursePart: 'zadania_powtorkowe'})[0].totalTasks, 5);
  console.log('PASS: MP lesson 6, 25 audited tasks, balanced homework key, stable IDs, clean crops and all catalogs');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
