const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {createHash} = require('node:crypto');

const sourcePath = 'zadania/kurs/mp/lekcja_9/lekcja_9_funkcja_kwadratowa.json';
const directory = path.dirname(sourcePath);
const tasks = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const html = fs.readFileSync('zadania.html', 'utf8');
function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('static/lib/mathjs/answers.min.js', 'utf8'), context);
for (const name of ['normalizeTypedAnswer', 'normalizeSymbolicExpression', 'normalizeAcceptedMathForm',
  'tokenizeSymbolicExpression', 'symbolicExpressionVariables', 'evaluateSymbolicExpression',
  'areSymbolicExpressionsEquivalent', 'isTypedAnswerCorrect', 'isEquationSpecialAnswer',
  'splitEquationValues', 'splitPointCoordinates', 'parseIntegerAnswerSet', 'parseRealAnswerSet', 'isInputFieldAnswerCorrect',
  'isEquationSolutionInput', 'getInputFields']) vm.runInContext(functionSource(name), context);

test('MP lesson 9 contains every numbered task, full image bodies and protected course PDF', () => {
  assert.equal(tasks.length, 90);
  const prefixes = {zadania: '', praca_domowa: 'zd', zadania_powtorkowe: 'zp'};
  const counts = {zadania: 56, praca_domowa: 27, zadania_powtorkowe: 7};
  const files = new Set();
  for (const [part, count] of Object.entries(counts)) {
    const group = tasks.filter(task => task.coursePart === part);
    assert.equal(group.length, count);
    assert.deepEqual(group.map(task => task.taskNumber), group.map(task => task.taskNumber)
      .sort((a, b) => a.localeCompare(b, 'en', {numeric: true})));
    for (const task of group) {
      assert.equal(task.file, `${prefixes[part]}${task.taskNumber}.webp`);
      assert.equal(task.level, 'matura_podstawowa');
      assert(task.title && task.hint && task.tags.length);
      assert(task.maxPoints > 0);
      if (task.type === 'true_false') assert.equal(task.maxPoints, 1);
      files.add(task.file);
      if (task.contextFile) files.add(task.contextFile);
    }
  }
  assert.equal(files.size, 98);
  for (const file of files) {
    const data = fs.readFileSync(path.join(directory, file));
    assert.equal(data.subarray(0, 4).toString(), 'RIFF', file);
    assert.equal(data.subarray(8, 16).toString(), 'WEBPVP8L', file);
    assert(data.length > 400, file);
  }
  assert.deepEqual(fs.readdirSync(directory).filter(file => /\.(png|jpe?g|webp)$/i.test(file)).sort(), [...files].sort());
  const pdf = fs.readFileSync(path.join(directory, 'lekcja_9_funkcja_kwadratowa.pdf'));
  assert.equal(createHash('sha256').update(pdf).digest('hex'),
    '887dc1a1bb20b9273ef85e58122c28007cabe81df4fca23eddd5c3697f544e38',
    'Original PDF exported by the user on 2026-11-17, without re-exporting Word');
  assert.equal(tasks.find(task => task.file === '1.1.webp').contextFile, 'info_1.webp');
  assert.equal(tasks.find(task => task.file === 'zd17.2.webp').contextFile, 'info_zd17.webp');
  assert.equal(tasks.find(task => task.file === 'zd19.4.webp').contextFile, 'info_zd19.webp');
  assert.equal(tasks.find(task => task.file === '7.3.webp').contextFile, undefined);
  assert.equal(tasks.find(task => task.file === '5.1.webp').contextFile, undefined);
});

test('Lesson 9 appears in student, profile and admin catalogs after lesson 8', () => {
  for (const [file, name] of [['zadania.html', 'TASK_SOURCES'], ['admin.html', 'ADMIN_TASK_SOURCES'],
    ['profil.html', 'PROFILE_SOURCES']]) {
    const text = fs.readFileSync(file, 'utf8');
    const match = text.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
    const sources = vm.runInNewContext(match[1]);
    assert.equal(sources.filter(source => source.path === sourcePath).length, 1);
    const index = sources.findIndex(source => source.path === sourcePath);
    assert.match(sources[index - 1].path, /mp\/lekcja_8\//);
    assert.equal(sources[index].label, 'Lekcja 9');
    assert.equal(sources[index].detail, 'Funkcja kwadratowa');
    assert.equal(sources[index].category, 'kurs');
    assert.equal(sources[index].level, 'matura_podstawowa');
  }
});

test('Lesson 9 open answer keys are accepted, including symbolic function formulas', () => {
  for (const task of tasks.filter(task => task.type === 'input')) {
    const fields = context.getInputFields(task);
    for (const field of fields) {
      assert(context.isInputFieldAnswerCorrect(field.answers[0], field), `${task.file}: ${field.label}`);
      if (/x/.test(field.answers[0])) assert.equal(field.math, false, 'Numeric-only editor must not reject symbolic x');
      assert(!context.isInputFieldAnswerCorrect('błędna odpowiedź', field), task.file);
    }
  }
  const field = file => context.getInputFields(tasks.find(task => task.file === file))[0];
  assert(context.isInputFieldAnswerCorrect('-8*(x-1)^2/9+2', field('1.1.webp')));
  assert(!context.isInputFieldAnswerCorrect('-(x-1)^2+2', field('1.1.webp')));
  assert(context.isInputFieldAnswerCorrect('1,5*(x-2)^2-1,5', field('21.webp')));
  assert(context.isInputFieldAnswerCorrect('-0,3333333333333333*x^2-1,4*x-4/15', field('2.2.webp')));
  assert(context.isInputFieldAnswerCorrect('-0.2; -4', context.getInputFields(tasks.find(task => task.file === '2.2.webp'))[1]));
  for (const file of ['zp1.webp']) {
    const proof = tasks.find(task => task.file === file);
    assert.equal(proof.type, 'external_submission');
    assert.equal(proof.teacherGraded, true);
    assert.equal(proof.maxPoints, 2);
  }
});

test('Updated PDF keys match new inequalities, ABCD tasks, signs and review questions', () => {
  const task = file => tasks.find(item => item.file === file);
  assert.equal(task('3.2.webp').inputs[1].answer, '(-inf;-3/2) U (1;inf)');
  assert.equal(task('3.3.webp').inputs[1].answer, '[-5/2;3]');
  const range32 = context.getInputFields(task('3.2.webp'))[1];
  assert(context.isInputFieldAnswerCorrect('(1;+∞) ∪ (-∞;-1,5)', range32));
  assert(!context.isInputFieldAnswerCorrect('(-1,5;1)', range32));
  const range33 = context.getInputFields(task('3.3.webp'))[1];
  assert(context.isInputFieldAnswerCorrect('[-2,5;3]', range33));
  assert(!context.isInputFieldAnswerCorrect('(-∞;-2,5] U [3;∞)', range33));
  for (const [file, answer] of [['18.1.webp','C'], ['18.2.webp','B'], ['zd9.1.webp','C'],
    ['zp2.webp','A'], ['zp3.webp','C'], ['zp4.webp','D'], ['zp5.webp','C'], ['zp6.webp','C']]) {
    assert.equal(task(file).type, 'closed', file);
    assert.equal(task(file).answer, answer, file);
  }
  for (const [file, answers] of [['6.1.webp',['<','>','>','>']], ['6.2.webp',['<','>','<','<']],
    ['6.3.webp',['>','>','<','>']], ['6.4.webp',['>','<']], ['zd19.1.webp',['<','<']],
    ['zd19.2.webp',['<','>']], ['zd19.3.webp',['<','<']], ['zd19.4.webp',['<']]]) {
    const item = task(file);
    assert.equal(item.maxPoints, 1);
    assert.deepEqual(item.inputs.map(field => field.answer), answers, file);
    for (const field of context.getInputFields(item)) {
      assert(field.label.length <= 7, `${file}: compact comparison labels fit mobile controls`);
      for (const option of field.options) assert.equal(context.isInputFieldAnswerCorrect(option, field),
        option === field.answers[0], `${file}: ${field.label} ${option}`);
    }
  }
  assert.deepEqual(task('zp7.webp').inputs.map(field => field.answer), ['(3,5)']);
  assert.equal(task('zp7.webp').maxPoints, 2);
  assert(!task('zp8.webp'));
});

test('Homework tools match the requested fields without unnecessary equation modes', () => {
  const fields = file => context.getInputFields(tasks.find(task => task.file === file));
  for (const file of ['zd4.1.webp','zd16.webp','zd17.1.webp','zd17.2.webp']) {
    assert(fields(file).filter(field => !field.options).every(field => field.mathTools.join() === 'square'), file);
  }
  const tools = ['paren-left','paren-right','bracket-left','bracket-right','infinity','union'];
  for (const file of ['zd4.2.webp','zd7.1.webp','zd7.2.webp','zd9.3.webp','zd18.webp']) {
    for (const field of fields(file)) assert.deepEqual(Array.from(field.mathTools), tools, file);
  }
  assert(fields('zd6.webp').every(field => !field.math && field.mathTools.length === 0));
  const zeros = fields('zd8.webp').find(field => field.label === 'Miejsca zerowe');
  assert.equal(zeros.control, 'values');
  for (const value of ['-3;-1','-1; -3','-6/2; -2/2']) assert(context.isInputFieldAnswerCorrect(value, zeros));
  for (const value of ['-1;3','brak rozwiązań','nieskończenie wiele rozwiązań','-3;-1;0'])
    assert(!context.isInputFieldAnswerCorrect(value, zeros));
});

test('Review 7 accepts one ordered point with equivalent numeric coordinates', () => {
  const fields = context.getInputFields(tasks.find(task => task.file === 'zp7.webp'));
  assert.equal(fields.length, 1);
  assert.equal(fields[0].control, 'point');
  assert.equal(fields[0].placeholder, '(x, y)');
  for (const value of ['(3,5)','(3, 5)','(3;5)','P=(3,5)','P (6/2;10/2)',
    '(3,0;5,0)','(1+2,2+3)','(sqrt(9);sqrt(25))']) {
    assert(context.isInputFieldAnswerCorrect(value, fields[0]), value);
  }
  for (const value of ['', '3,5', '(5,3)', '(3,5,7)', '(3;5;7)', '(3,)', '(;5)',
    '((3,5))', '(3,0,5,0)', '(3;5)tekst', '(3;1/0)', '(3;sqrt(-1))', '(3,5);(3,5)']) {
    assert(!context.isInputFieldAnswerCorrect(value, fields[0]), value);
  }
});

test('Intervals accept equivalent fractions, decimals, roots, unions and finite complements', () => {
  const correct = (value, expected) => context.isInputFieldAnswerCorrect(value, {control:'interval', answers:[expected]});
  for (const [expected, values] of [
    ['(-inf;2]', ['(-∞,2]', 'x ∈ (-infinity; 4/2]', '(-oo;2]']],
    ['(-3/2;1)', ['(-1,5;1)', '(-1.5, 1)', '(-6/4;2/2)']],
    ['[-1/3;3]', ['⟨-1/3;3⟩', '[-1/3,3]', '[-0,(3);3]']],
    ['(-inf;-2) U (-2;inf)', ['R\\{-2}', 'ℝ∖{-4/2}', '(-2;+∞) ∪ (-∞;-2)']],
    ['(-sqrt(3)/3;sqrt(3)/3)', ['(-1/√3;1/√3)', '(-√(1/3);√(1/3))']],
    ['∅', ['{}', 'brak rozwiązań', '(3;3)']],
    ['R', ['ℝ', '(-∞;+∞)', '(-inf;0) U {0} U (0;inf)']],
    ['{3}', ['[3;3]', '3', '{6/2}']],
  ]) for (const value of values) assert(correct(value, expected), `${value} = ${expected}`);
  for (const value of ['(-1/3;3]', '[-1/3;3)', '[3;-1/3]', '[-1/3;3] U {9}', '[-1/3;3]śmieci',
    '[-1/3;3;;4]', '[sqrt(-1);3]', '[1/0;3]', '[-1/3;3', '']) assert(!correct(value, '[-1/3;3]'), value);
  for (const value of ['[-inf;2]', '(-inf;2)', '[2;inf)']) assert(!correct(value, '(-inf;2]'), value);
  assert(!correct('R', 'R\\{-2}'));
  assert(!correct('{3;4}', '{3}'));
});

test('Homework-only access keeps all 34 homework/review tasks without main lesson tasks', async () => {
  const source = {id:sourcePath, path:sourcePath, category:'kurs', level:'matura_podstawowa', label:'Lekcja 9'};
  const ctx = vm.createContext({loggedUser:null, STUDENT_WORK_COURSE_PARTS:['praca_domowa','zadania_powtorkowe'],
    getSourceMeta: () => source, loadJsonSource:async () => tasks,
    normalizeTaskSolutions: () => [], normalizeTaskGradingCriteria: () => [],
    normalizeCourseTextGradingCriteria: () => [], normalizeTaskTags: task => task.tags});
  for (const name of ['canAccessCoursePart', 'loadTaskSource']) vm.runInContext(functionSource(name), ctx);
  const limited = await ctx.loadTaskSource(source);
  assert.equal(limited.length, 34);
  assert(limited.every(task => task.coursePart !== 'zadania'));
  ctx.loggedUser = {role:'student', full_course_access:true};
  assert.equal((await ctx.loadTaskSource(source)).length, 90);
});
