const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const sourcePath = 'zadania/kurs/mp/lekcja_7/lekcja_7_funkcje.json';
const directory = path.dirname(sourcePath);
const tasks = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const keys = {
  zadania: 'D A C B B C B C A C D A C D B A C C D A C B C D A B D C B B D A D A B C PF PF B D C A B C D'.split(' '),
  praca_domowa: 'C B A D C A B C D A D A A C B C C D A A B A B D PF input input PF C A B D B A C'.split(' '),
  zadania_powtorkowe: 'A A A B D'.split(' '),
};
const prefixes = {zadania: '', praca_domowa: 'zd', zadania_powtorkowe: 'zp'};
assert.equal(tasks.length, 85);
assert.equal(new Set(tasks.map(task => task.file)).size, 85);
const contexts = new Set();
for (const [part, key] of Object.entries(keys)) {
  const items = tasks.filter(task => task.coursePart === part);
  assert.equal(items.length, key.length, part);
  items.forEach((task, index) => {
    assert.equal(task.file, `${prefixes[part]}${task.taskNumber}.webp`);
    assert.equal(task.level, 'matura_podstawowa');
    assert(task.hint && task.tags.length >= 2);
    assert.equal(task.maxPoints, task.file === 'zd11.webp' ? 3 : 1);
    if (key[index] === 'input') {
      assert.equal(task.type, 'input');
      assert(task.inputs.every(field => field.prompt && field.answer));
    } else if (key[index] === 'PF') {
      assert.equal(task.type, 'true_false');
      assert.deepEqual(task.statements, ['Stwierdzenie 1', 'Stwierdzenie 2']);
      assert.deepEqual(task.answer, ['P', 'F']);
    } else {
      assert.equal(task.type, 'closed');
      assert.deepEqual(task.options, ['A', 'B', 'C', 'D']);
      assert.equal(task.answer, key[index], task.file);
    }
    if (task.taskNumber.includes('.')) {
      assert.equal(task.contextFile, `info_${prefixes[part]}${task.taskNumber.split('.')[0]}.webp`);
      contexts.add(task.contextFile);
    } else {
      assert.equal(task.contextFile, undefined);
    }
  });
}
assert.equal(contexts.size, 10);
const expectedFiles = new Set([...tasks.map(task => task.file), ...contexts]);
for (const file of expectedFiles) {
  const buffer = fs.readFileSync(path.join(directory, file));
  assert.equal(buffer.subarray(0, 4).toString(), 'RIFF', file);
  assert.equal(buffer.subarray(8, 12).toString(), 'WEBP', file);
  assert.equal(buffer.subarray(12, 16).toString(), 'VP8L', `${file}: lossless source colors`);
}
assert.deepEqual(fs.readdirSync(directory).filter(file => /\.(?:png|jpe?g|webp)$/i.test(file)).sort(),
  [...expectedFiles].sort(), 'Only referenced images, with no duplicate image formats');
assert(fs.statSync(path.join(directory, 'lekcja_7_funkcje.pdf')).size > 3000000);

function functionSource(html, name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
const html = fs.readFileSync('zadania.html', 'utf8');
for (const [file, name] of [['zadania.html', 'TASK_SOURCES'], ['admin.html', 'ADMIN_TASK_SOURCES'],
  ['profil.html', 'PROFILE_SOURCES']]) {
  const text = fs.readFileSync(file, 'utf8');
  const config = text.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  assert(config, name);
  const sources = vm.runInNewContext(config[1]);
  const matching = sources.filter(source => source.path === sourcePath);
  assert.equal(matching.length, 1, `${file}: lesson registered once`);
  assert.equal(matching[0].label, 'Lekcja 7');
  assert.equal(matching[0].detail, 'Funkcje');
  assert.equal(matching[0].level, 'matura_podstawowa');
  assert.equal(matching[0].category, 'kurs');
  if (file === 'zadania.html') {
    const index = sources.findIndex(source => source.path === sourcePath);
    assert.match(sources[index - 1].path, /mp\/test_lekcje_1_6\//);
    assert.match(sources[index + 1].path, /mp\/lekcja_8\//);
  }
}

(async () => {
  const source = {id: sourcePath, path: sourcePath, category: 'kurs', level: 'matura_podstawowa',
    label: 'Lekcja 7', detail: 'Funkcje'};
  const ctx = vm.createContext({loggedUser: null, STUDENT_WORK_COURSE_PARTS: ['praca_domowa', 'zadania_powtorkowe'],
    getSourceMeta: () => source, loadJsonSource: async () => tasks,
    normalizeTaskSolutions: () => [], normalizeTaskGradingCriteria: () => [],
    normalizeCourseTextGradingCriteria: () => [], normalizeTaskTags: task => task.tags});
  for (const name of ['canAccessCoursePart', 'loadTaskSource', 'courseTaskNumberFromTitle',
    'coursePartOrdinalNumber', 'taskNumberLabel']) vm.runInContext(functionSource(html, name), ctx);
  let loaded = await ctx.loadTaskSource(source);
  assert.equal(loaded.length, 40, 'Homework-only student sees 35 homework tasks and 5 review tasks');
  assert(loaded.every(task => task.coursePart !== 'zadania'));
  for (const task of loaded) {
    assert.equal(ctx.taskNumberLabel(task), task.taskNumber, 'PDF subtask numbers survive loading');
    if (task.contextFile) assert.equal(task.contextPath, `${directory}/${task.contextFile}`);
  }
  ctx.loggedUser = {role: 'student', full_course_access: true};
  loaded = await ctx.loadTaskSource(source);
  assert.equal(loaded.length, 85, 'Full-access student sees the main part too');
  const inputContext = vm.createContext({});
  vm.runInContext(fs.readFileSync('static/lib/mathjs/answers.min.js', 'utf8'), inputContext);
  for (const name of ['normalizeTypedAnswer', 'normalizeSymbolicExpression', 'normalizeAcceptedMathForm',
    'tokenizeSymbolicExpression', 'symbolicExpressionVariables', 'evaluateSymbolicExpression',
    'areSymbolicExpressionsEquivalent', 'isTypedAnswerCorrect', 'isEquationSpecialAnswer',
    'splitEquationValues', 'isInputFieldAnswerCorrect']) {
    vm.runInContext(functionSource(html, name), inputContext);
  }
  const openTask = tasks.find(task => task.file === 'zd11.webp');
  assert.deepEqual(openTask.inputs.map(field => field.answer), ['3', '-3', '4']);
  for (const [index, values] of [[0, ['3', '3,0', '3.00', '6/2']],
    [1, ['-3', '−3,0', '-6/2']], [2, ['4', '4.0', '4,00', '8/2']]]) {
    for (const value of values) assert(inputContext.isInputFieldAnswerCorrect(value, {
      ...openTask.inputs[index], answers: [openTask.inputs[index].answer]}), value);
  }
  const equation = tasks.find(task => task.file === 'zd12.webp').inputs[0];
  assert.equal(equation.answer, '2');
  assert.equal(equation.control, 'equation');
  for (const value of ['2', '2,0', '2.0', '4/2']) {
    assert(inputContext.isInputFieldAnswerCorrect(value, {...equation, answers:['2']}), value);
  }
  for (const value of ['1.5', '3/2', '1,5', 'brak rozwiązań', '2; 1.5']) {
    assert(!inputContext.isInputFieldAnswerCorrect(value, {...equation, answers:['2']}), value);
  }
  console.log('PASS: MP lesson 7, 85 tasks, shared contexts, PDF numbering, catalogs and flexible open answers');
})().catch(error => {console.error(error); process.exitCode = 1;});
