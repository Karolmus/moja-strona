const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const sourcePath = 'zadania/kurs/mp/lekcja_1/lekcja_1_potegi_i_pierwiastki.json';
const tasks = JSON.parse(fs.readFileSync(sourcePath));
const html = fs.readFileSync('zadania.html', 'utf8');
const profileHtml = fs.readFileSync('profil.html', 'utf8');
const mainKey = 'B D B C C A C A A D C A C C C C FP PP'.split(' ');
const homeworkKey = 'C B A B C B C A D A B'.split(' ');
const homework = tasks.filter(task => task.coursePart === 'praca_domowa');
assert.equal(tasks.length, 29);
assert.equal(homework.length, 11);
assert.equal(new Set(tasks.map(task => task.file)).size, tasks.length);

for (const [part, key, prefix] of [
  ['zadania', mainKey, ''], ['praca_domowa', homeworkKey, 'zd']
]) {
  const items = tasks.filter(task => task.coursePart === part);
  assert.equal(items.length, key.length);
  items.forEach((task, index) => {
    assert.equal(task.file, `${prefix}${index + 1}.png`);
    assert.equal([task.answer].flat().join(''), key[index], task.file);
    assert.equal(task.type, key[index].length === 2 ? 'true_false' : 'closed');
    assert.equal(task.level, 'matura_podstawowa');
    assert.equal(task.maxPoints, 1);
    assert.equal(task.topic, 'potęgi i pierwiastki');
    assert(task.hint && task.tags.length >= 2);
    assert(!task.instruction, 'No errata from the superseded PDF');
    if (task.type === 'closed') assert.deepEqual(task.options, ['A', 'B', 'C', 'D']);
    else assert.equal(task.statements.length, 2);
    const image = fs.readFileSync(path.join(path.dirname(sourcePath), task.file));
    assert.equal(image.subarray(1, 4).toString(), 'PNG');
    assert(image.readUInt32BE(16) >= 1300, 'Legible full-resolution task image');
    assert(image.readUInt32BE(20) > 100 && image.readUInt32BE(20) < 1000);
  });
}

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
  ['zadania.html', 'TASK_SOURCES'], ['profil.html', 'PROFILE_SOURCES'], ['admin.html', 'ADMIN_TASK_SOURCES']
]) {
  const text = fs.readFileSync(file, 'utf8');
  const entries = config(text, name).filter(source => source.path === sourcePath);
  assert.equal(entries.length, 1, `${file}: lesson registered once`);
  assert.equal(entries[0].level, 'matura_podstawowa');
  assert.equal(entries[0].category, 'kurs');
}

(async () => {
  const source = {id: sourcePath, path: sourcePath, category: 'kurs', level: 'matura_podstawowa'};
  const ctx = vm.createContext({
    STUDENT_WORK_COURSE_PART: 'praca_domowa', getSourceMeta: () => source,
    loadJsonSource: async () => tasks,
    normalizeTaskSolutions: () => [], normalizeTaskGradingCriteria: () => [],
    normalizeCourseTextGradingCriteria: () => [], normalizeTaskTags: task => task.tags
  });
  for (const name of ['loadTaskSource', 'getSourceCompletionTasks', 'choose']) {
    vm.runInContext(functionSource(html, name), ctx);
  }
  ctx.tasks = await ctx.loadTaskSource(source);
  assert.deepEqual(Array.from(ctx.tasks, task => task.file), homework.map(task => task.file));
  assert.equal(ctx.getSourceCompletionTasks(source).length, 11);
  assert(ctx.tasks.every(task => task.path.endsWith(`/${task.file}`)));

  ctx.isCourseTask = () => true;
  ctx.disableMCQ = () => {};
  ctx.revealCorrectAnswer = () => {};
  ctx.showCorrection = () => {};
  ctx.hintUsed = false;
  ctx.answerShown = false;
  for (const task of homework) {
    for (const option of task.options) {
      ctx.currentTask = task;
      ctx.currentTaskAnswered = false;
      let result;
      ctx.addProgress = status => { result = status; ctx.currentTaskAnswered = true; };
      ctx.choose(option, {classList: {add() {}}});
      assert.equal(result, option === task.answer ? 'good' : 'bad', `${task.file}: ${option}`);
      ctx.choose(task.answer, {classList: {add() {}}});
      assert.equal(result, option === task.answer ? 'good' : 'bad', 'Answered course task stays locked');
    }
  }

  const profile = vm.createContext({
    sourceCatalog: [{...source, tasks, filesByPart: new Map([
      ['zadania', new Set(tasks.filter(t => t.coursePart === 'zadania').map(t => t.file))],
      ['praca_domowa', new Set(homework.map(t => t.file))]
    ])}]
  });
  for (const name of ['progressSourceId', 'progressFile', 'progressKey', 'coursePartOf', 'sourceCompletionFiles',
    'courseCompletion', 'capitalize', 'sourceResultLabels', 'homeworkChartRows']) {
    vm.runInContext(functionSource(profileHtml, name), profile);
  }
  const progress = homework.map((task, index) => ({
    source_id: sourcePath, file: task.file, result: index < 4 ? 'good' : 'bad'
  }));
  assert(!profile.courseCompletion(progress.slice(0, -1)).complete);
  assert(profile.courseCompletion(progress).complete, 'Only homework is required for completion');
  const row = profile.homeworkChartRows(progress, progress.slice(0, 2))[0];
  assert.equal(row.label, 'Lekcja 1');
  assert.equal(row.good, 36.4);
  assert.equal(row.bad, 63.6);
  assert.equal(row.review, 18.2);
  console.log('PASS: 29 tasks, corrected PDF keys, 11 homework tasks, answer handling, profile progress and all catalogs');
})().catch(error => { console.error(error); process.exitCode = 1; });
