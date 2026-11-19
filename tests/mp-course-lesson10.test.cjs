const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {createHash} = require('node:crypto');

const sourcePath = 'zadania/kurs/mp/lekcja_10/lekcja_10_optymalizacja.json';
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
  'splitEquationValues', 'splitPointCoordinates', 'parseIntegerAnswerSet', 'parseRealAnswerSet',
  'isInputFieldAnswerCorrect', 'isEquationSolutionInput', 'getInputFields'])
  vm.runInContext(functionSource(name), context);
const task = file => tasks.find(item => item.file === file);
const fields = file => context.getInputFields(task(file));
const correct = (file, index, value) => context.isInputFieldAnswerCorrect(value, fields(file)[index]);

test('MP lesson 10 imports all 29 tasks and only lossless WebP bodies from the latest user PDF', () => {
  assert.equal(tasks.length, 29);
  for (const [part, numbers, prefix] of [
    ['zadania', Array.from({length:13}, (_, i) => String(i+1)), ''],
    ['praca_domowa', Array.from({length:10}, (_, i) => String(i+1)), 'zd'],
    ['zadania_powtorkowe', ['1','2','3','4','5','6'], 'zp'],
  ]) {
    const group = tasks.filter(item => item.coursePart === part);
    assert.deepEqual(group.map(item => item.taskNumber), numbers);
    for (const item of group) {
      assert.equal(item.file, prefix+item.taskNumber+'.webp');
      assert.equal(item.level, 'matura_podstawowa');
      assert(item.title && item.hint && item.tags.length && item.maxPoints > 0);
      const data = fs.readFileSync(path.join(directory, item.file));
      assert.equal(data.subarray(0, 4).toString(), 'RIFF');
      assert.equal(data.subarray(8, 16).toString(), 'WEBPVP8L');
      assert(data.length > 400, item.file);
    }
  }
  assert.equal(new Set(tasks.map(item => item.file)).size, 29);
  assert.deepEqual(fs.readdirSync(directory).filter(file => /\.(png|jpe?g|webp)$/i.test(file)).sort(),
    tasks.map(item => item.file).sort());
  const pdf = fs.readFileSync(path.join(directory, 'lekcja_10_optymalizacja.pdf'));
  assert.equal(createHash('sha256').update(pdf).digest('hex'),
    'a34aaaaf5f960c80cf68a22eb58cf620354464a4adba2d2af1bd98cc3640ac86');
});

test('Student, admin and profile catalogs include lesson 10 immediately after MP lesson 9', () => {
  for (const [file, name] of [['zadania.html','TASK_SOURCES'], ['admin.html','ADMIN_TASK_SOURCES'],
    ['profil.html','PROFILE_SOURCES']]) {
    const text = fs.readFileSync(file, 'utf8');
    const sources = vm.runInNewContext(text.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`))[1]);
    assert.equal(sources.filter(source => source.path === sourcePath).length, 1);
    const index = sources.findIndex(source => source.path === sourcePath);
    assert.match(sources[index-1].path, /mp\/lekcja_9\//);
    assert.equal(sources[index].label, 'Lekcja 10');
    assert.equal(sources[index].detail, 'Optymalizacja I');
    assert.equal(sources[index].category, 'kurs');
    assert.equal(sources[index].level, 'matura_podstawowa');
  }
});

test('All optimization answer keys accept themselves and reject incorrect responses', () => {
  for (const item of tasks.filter(item => item.type === 'input')) {
    for (const field of context.getInputFields(item)) {
      assert(context.isInputFieldAnswerCorrect(field.answers[0], field), `${item.file}: ${field.label}`);
      assert(!context.isInputFieldAnswerCorrect('999999', field), `${item.file}: ${field.label}`);
      if (field.control === 'set' || field.answers.some(value => /x/.test(value))) assert.equal(field.math, false);
    }
  }
  assert.deepEqual(tasks.filter(item => item.type === 'closed').map(item => item.answer), ['B','D','C','A','B','D']);
  const proof = task('13.webp');
  assert.equal(proof.type, 'external_submission');
  assert.equal(proof.externalSubmission, true);
  assert.equal(proof.teacherGraded, true);
  assert.equal(proof.maxPoints, 3);
  assert.match(proof.instruction, /Discord/);
});

test('Numeric fields accept fractions, decimal commas, equivalent expressions and units', () => {
  for (const [file, index, values] of [
    ['1.webp', 0, ['1/6','2/12']], ['1.webp', 1, ['-1/3','-2/6']],
    ['3.webp', 0, ['5,25','5.25','21/4','5,25 m']],
    ['3.webp', 2, ['5,5125','441/80','5.5125 m²','5,5125 m^2']],
    ['5.webp', 1, ['3,75','15/4']], ['6.webp', 1, ['11,025','441/40']],
    ['7.webp', 2, ['4,05','4.050','81/20']],
    ['11.webp', 0, ['-4;4','4; -4','-8/2; 8/2']],
    ['zd1.webp', 0, ['15,125','121/8']], ['zd1.webp', 1, ['4,25','17/4']],
    ['zd3.webp', 1, ['4,5','9/2']], ['zd2.webp', 0, ['5','10/2']],
  ]) for (const value of values) assert(correct(file,index,value), `${file}: ${value}`);
  assert(!correct('7.webp',2,'4.04'));
  assert(!correct('11.webp',0,'-4;4;0'));
});

test('Discrete maxima require both tied days and accept unordered set notation', () => {
  for (const value of ['{6;7}', '{7,6}', '6;7', '7 6']) assert(correct('9.webp',0,value), value);
  for (const value of ['{8;9}', '{9,8}', '8;9']) assert(correct('zd6.webp',0,value), value);
  for (const value of ['6','{6;8}','{6;7;8}','6.5']) assert(!correct('9.webp',0,value), value);
  for (const [file, a, b, c, limit, best] of [['9.webp',-2,26,72,14,[6,7]], ['zd6.webp',-1,17,100,16,[8,9]]]) {
    const values = Array.from({length:limit}, (_, i) => a*(i+1)**2+b*(i+1)+c);
    const maximum = Math.max(...values);
    assert.deepEqual(values.flatMap((value, i) => value === maximum ? [i+1] : []), best);
    assert(correct(file,1,String(maximum)));
  }
});

test('Area and revenue formulas accept algebraically equivalent forms and correct domains', () => {
  for (const value of ['30x-x²','-(x-15)^2+225','x(30-x)']) assert(correct('2.webp',0,value), value);
  for (const value of ['(0;30)','(0,30)','x ∈ (0;60/2)']) assert(correct('2.webp',1,value), value);
  for (const value of ['[0;30]','(0;15)','R']) assert(!correct('2.webp',1,value), value);
  for (const value of ['-5x²+100x+4000','-5*(x-10)^2+4500','(40-x)(100+5x)'])
    assert(correct('zd7.webp',0,value), value);
  assert(!correct('zd7.webp',0,'-5x²+100x+4500'));
  for (const [file, perimeter, depthCount, widthCount, rectangles] of [
    ['4.webp',36,4,6,3], ['5.webp',60,5,8,4],
    ['zd3.webp',36,3,4,2], ['zd2.webp',60,6,10,5],
  ]) {
    const x = perimeter/(2*depthCount), y = perimeter/(2*widthCount);
    assert(correct(file,0,String(x)));
    assert(correct(file,1,String(y)));
    if (fields(file).length > 2) assert(correct(file,2,String(rectangles*x*y)));
  }
  assert(correct('zd8.webp',0,'8') && correct('zd8.webp',1,'12') && correct('zd8.webp',2,'192'));
  assert(correct('zd9.webp',0,'24') && correct('zd9.webp',1,'26') && correct('zd9.webp',2,'400'));
  assert(correct('zd10.webp',0,'8') && correct('zd10.webp',1,'12') && correct('zd10.webp',2,'448'));
});

test('Homework labels use argument, lengths and full unit names, with aligned two/three-column layouts', () => {
  assert.equal(fields('zd1.webp')[1].label, 'Argument');
  assert.equal(fields('zd1.webp')[1].prompt, 'Argument');
  assert.deepEqual(Array.from(fields('zd2.webp'), field => field.prompt).slice(0,2), ['Długość x','Długość y']);
  assert.deepEqual(task('zd2.webp').inputs.map(field => field.answer), ['5','3','75']);
  assert.deepEqual(task('zd3.webp').inputs.map(field => field.answer), ['6','9/2','54']);
  for (const file of ['zd3.webp','zd4.webp','zd5.webp','zd8.webp']) {
    for (const field of fields(file)) {
      if (field.suffix === 'm') assert(field.prompt.endsWith('(metry)'), file);
      if (field.suffix === 's') assert(field.prompt.endsWith('(sekundy)'), file);
      if (field.suffix === 'm²') assert(field.prompt.endsWith('(metry kwadratowe)'), file);
    }
  }
  for (const item of tasks.filter(item => item.coursePart === 'praca_domowa')) {
    assert.equal(item.inputColumns, item.inputs.length, item.file);
    assert([2,3].includes(item.inputColumns));
  }
  assert.match(html, /\.input-answer-grid\.aligned-input-fields\s*\{[^}]*repeat\(var\(--input-columns\), minmax\(0, 1fr\)\)/);
  assert.match(html, /\.input-answer-grid\.aligned-input-fields > \.input-answer-field\s*\{[^}]*grid-template-rows: subgrid/);
});

test('Latest PDF scoring and full unit names are reflected in the main lesson and homework', () => {
  const units = {s:'sekundy', m:'metry', 'm²':'metry kwadratowe', cm:'centymetry',
    'cm²':'centymetry kwadratowe', 'zł':'złote'};
  for (const item of tasks) assert.equal(item.maxPoints, item.coursePart === 'zadania_powtorkowe' ? 1 : 3, item.file);
  for (const item of tasks.filter(item => item.coursePart === 'zadania' && item.type === 'input')) {
    for (const field of context.getInputFields(item)) {
      if (field.suffix) assert.equal(field.prompt, `${field.label} (${units[field.suffix]})`, item.file);
    }
  }
  const studentWork = tasks.filter(item => item.coursePart !== 'zadania');
  assert.equal(studentWork.reduce((sum,item) => sum+item.maxPoints,0),36);
  assert.equal(task('zp1.webp').answer,'B');
});

test('Homework-only access excludes main tasks; full access exposes all 29 tasks', async () => {
  const source = {id:sourcePath, path:sourcePath, category:'kurs', level:'matura_podstawowa', label:'Lekcja 10'};
  const ctx = vm.createContext({loggedUser:null, STUDENT_WORK_COURSE_PARTS:['praca_domowa','zadania_powtorkowe'],
    getSourceMeta: () => source, loadJsonSource: async () => tasks,
    normalizeTaskSolutions: () => [], normalizeTaskGradingCriteria: () => [],
    normalizeCourseTextGradingCriteria: () => [], normalizeTaskTags: item => item.tags});
  for (const name of ['canAccessCoursePart','loadTaskSource']) vm.runInContext(functionSource(name),ctx);
  const limited = await ctx.loadTaskSource(source);
  assert.equal(limited.length,16);
  assert(limited.every(item => item.coursePart !== 'zadania'));
  ctx.loggedUser = {role:'student', full_course_access:true};
  assert.equal((await ctx.loadTaskSource(source)).length,29);
});

test('Lesson 10 training link points to the existing quadratic training bank', () => {
  const link = {};
  const ctx = vm.createContext({document:{getElementById:() => link}, URLSearchParams,
    selectedCategory:'kurs', selectedSource:sourcePath, selectedLevel:'matura_podstawowa', loggedUser:{role:'admin'}});
  vm.runInContext(functionSource('updateTrainingLink'),ctx);
  ctx.updateTrainingLink();
  assert.equal(new URL(link.href,'https://example.test').searchParams.get('lesson'),'formula_quadratic');
});
