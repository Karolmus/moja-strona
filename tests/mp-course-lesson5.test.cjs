const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const sourcePath = 'zadania/kurs/mp/lekcja_5/lekcja_5_zadania_dowodowe.json';
const tasks = JSON.parse(fs.readFileSync(sourcePath));
const html = fs.readFileSync('zadania.html', 'utf8');
const profileHtml = fs.readFileSync('profil.html', 'utf8');
const adminHtml = fs.readFileSync('admin.html', 'utf8');
const revisionKey = 'B C B A D D D'.split(' ');
const discordInstruction = 'Rozwiązanie zadania wyślij na platformie Discord.';

assert.equal(tasks.length, 31);
assert.equal(new Set(tasks.map(task => task.file)).size, 31);

for(const [part, count, prefix] of [
  ['zadania', 12, ''],
  ['praca_domowa', 12, 'zd']
]){
  const items = tasks.filter(task => task.coursePart === part);
  assert.equal(items.length, count, part);
  items.forEach((task, index) => {
    assert.equal(task.file, `${prefix}${index + 1}.png`);
    assert.equal(task.type, 'external_submission');
    assert.equal(task.externalSubmission, true);
    assert.equal(task.isProof, true);
    assert.equal(task.maxPoints, 2);
    assert.equal(task.instruction, discordInstruction);
    assert(!('answer' in task));
    assert(!('options' in task));
  });
}

const revision = tasks.filter(task => task.coursePart === 'zadania_powtorkowe');
assert.equal(revision.length, revisionKey.length);
revision.forEach((task, index) => {
  assert.equal(task.file, `zp${index + 1}.png`);
  assert.equal(task.type, 'closed');
  assert.deepEqual(task.options, ['A', 'B', 'C', 'D']);
  assert.equal(task.answer, revisionKey[index]);
  assert.equal(task.maxPoints, 1);
});

for(const task of tasks){
  assert.equal(task.level, 'matura_podstawowa');
  assert(task.hint && task.tags.length >= 2);
  const image = fs.readFileSync(path.join(path.dirname(sourcePath), task.file));
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  assert.equal(image.readUInt32BE(16), 1396);
  assert(image.readUInt32BE(20) > 45 && image.readUInt32BE(20) < 550, task.file);
}

assert(fs.statSync('zadania/kurs/mp/lekcja_5/lekcja_5_zadania_dowodowe.pdf').size > 1000000);
assert(html.includes(discordInstruction));
assert(html.includes('.task-instruction.external-submission'));
assert(html.includes('answerButton.hidden = isExternalSubmission || isOpenExam'));

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

for(const [file, name] of [
  ['zadania.html', 'TASK_SOURCES'],
  ['profil.html', 'PROFILE_SOURCES'],
  ['admin.html', 'ADMIN_TASK_SOURCES']
]){
  const text = fs.readFileSync(file, 'utf8');
  const entries = config(text, name).filter(source => source.path === sourcePath);
  assert.equal(entries.length, 1, `${file}: lesson registered once`);
  assert.equal(entries[0].level, 'matura_podstawowa');
  assert.equal(entries[0].category, 'kurs');
}

const interaction = vm.createContext({
  currentTask: null,
  isClosedTask: () => false,
  isInputTask: () => false,
  isPracticalTask: () => false,
  taskMaxPoints: task => task.maxPoints
});
vm.runInContext(functionSource(html, 'isManualScoreTask'), interaction);
assert.equal(interaction.isManualScoreTask(tasks[0]), false);

(async () => {
  const source = {
    id: sourcePath, path: sourcePath, category: 'kurs', level: 'matura_podstawowa',
    label: 'Lekcja 5', detail: 'Zadania dowodowe'
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
  for(const name of ['canAccessCoursePart', 'loadTaskSource', 'getSourceCompletionTasks']){
    vm.runInContext(functionSource(html, name), ctx);
  }
  ctx.tasks = await ctx.loadTaskSource(source);
  assert.equal(ctx.tasks.length, 19, 'Student receives homework and review tasks by default');
  assert(ctx.tasks.every(task => workParts.includes(task.coursePart)));
  assert.equal(ctx.getSourceCompletionTasks(source).length, 19);

  const admin = vm.createContext({
    adminTaskCatalog: tasks.map(task => ({...task, category: 'kurs', sourceId: sourcePath}))
  });
  vm.runInContext(functionSource(adminHtml, 'getCatalogSources'), admin);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {courseParts: workParts})[0].totalTasks, 19);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {coursePart: 'praca_domowa'})[0].totalTasks, 12);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {coursePart: 'zadania_powtorkowe'})[0].totalTasks, 7);
  console.log('PASS: MP lesson 5, external Discord submissions, clean crops and all catalogs');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
