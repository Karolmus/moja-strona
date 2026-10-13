const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('zadania.html', 'utf8');
const sourceA = 'zadania/kurs/eo/test_lekcje_1_6/test_lekcje_1_6.json';
const sourceB = 'zadania/kurs/eo/test_lekcje_1_6_b/test_lekcje_1_6_b.json';
const tasks = JSON.parse(fs.readFileSync(sourceB));
function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}

const start = html.indexOf('const TASK_SOURCES =');
const sources = vm.runInNewContext(html.slice(start, html.indexOf('\n];', start) + 3) + '\nTASK_SOURCES;');
const progress = new Map();
let loaded = true;
let checkpointTasks = JSON.parse(fs.readFileSync(sourceA)).map(task => ({...task, sourceId: sourceA}));
const context = vm.createContext({
  TASK_SOURCES: sources, MONTH_LABELS: {}, SOURCE_TYPE_LABELS: {}, SOURCE_LEVELS: {},
  COURSE_COMPLETION_RESULTS: new Set(['good', 'medium', 'bad', 'video']),
  isLoggedInStudent: true, loggedUser: {role: 'student'},
  isTaskSourceLoaded: id => loaded && id === sourceA,
  getSourceCompletionTasks: () => checkpointTasks,
  getSavedProgressItem: task => progress.get(task.file),
  taskPointValue: task => task.maxPoints,
  getTaskScore: task => ({earnedPoints: progress.get(task.file)?.earned_points || 0})
});
for (const name of ['getSourceMeta', 'getCourseSourceSequence', 'getPreviousCourseCheckpoint',
  'isCheckpointStageComplete', 'getCheckpointScorePercent', 'isOptionalCourseTestUnlocked', 'isCourseSourceVisible']) {
  vm.runInContext(functionSource(name), context);
}
const course = context.getCourseSourceSequence('egzamin_osmoklasisty');
const b = course.find(source => source.id === sourceB);
const harder = course.find(source => source.id.includes('test_lekcje_1_6_trudniejszy'));
const lesson7 = course.find(source => source.label === 'Lekcja 7');
assert(b && b.optional && b.kind === 'test');
assert.equal(b.requiresSource, sourceA);
assert.equal(b.maxScorePercent, 80);
assert.equal(harder.maxScorePercent, null);
assert.equal(context.getPreviousCourseCheckpoint(lesson7).id, sourceA, 'B is not a new lesson checkpoint');
assert(!context.isCourseSourceVisible(b), 'An untouched test A does not expose B');
assert(!context.isCourseSourceVisible(lesson7));

for(const task of checkpointTasks) progress.set(task.file, {result: 'bad', earned_points: 0});
assert(context.isCourseSourceVisible(b), 'Completed A at 0% exposes B');
assert(context.isCourseSourceVisible(lesson7), 'A still unlocks lessons 7-10 without completing B');
assert(!context.isCourseSourceVisible(harder));
progress.delete(checkpointTasks[0].file);
assert(!context.isCourseSourceVisible(b), 'All answers to A must be saved before B appears');
progress.set(checkpointTasks[0].file, {result: 'skipped', earned_points: 0});
assert(!context.isCourseSourceVisible(b), 'Skipping A is not completing A');

checkpointTasks = [{file: 'boundary', maxPoints: 100}];
for(const [score, visibleB, visibleHarder] of [[0, true, false], [79.99, true, false],
  [80, false, false], [80.01, false, true], [100, false, true]]) {
  progress.set('boundary', {result: 'good', earned_points: score});
  assert.equal(context.isCourseSourceVisible(b), visibleB, `B visibility at raw ${score}%`);
  assert.equal(context.isCourseSourceVisible(harder), visibleHarder, `Harder visibility at raw ${score}%`);
}
loaded = false;
assert(!context.isCourseSourceVisible(b), 'An unloaded prerequisite is not treated as a completed 0% test');
loaded = true;
checkpointTasks = [];
assert(!context.isCourseSourceVisible(b), 'An empty prerequisite is not completed');
assert(!context.isOptionalCourseTestUnlocked({...b, requiresSource: 'missing'}, course));
context.loggedUser = {role: 'admin'};
assert(context.isCourseSourceVisible(b), 'Admin can preview B without a test score');
assert(fs.readFileSync('admin.html', 'utf8').includes(sourceB), 'Admin result details include B');
assert.match(html, /requestedSource\?\.category === "kurs" && !isCourseSourceVisible\(requestedSource\)\) return;/,
  'Direct selection of a hidden course source is stopped before opening its start dialog');

assert.equal(tasks.length, 15);
assert.equal(tasks.reduce((total, task) => total + task.maxPoints, 0), 18);
assert.deepEqual(tasks.map(task => task.answer), ['A', 'B', ['P','F'], 'D', 'C', ['P','P'], 'A',
  ['F','P'], ['P','P'], 'B', '{0,3,6,9}', '2100 zł', '11/17', 'C', '20']);
assert.equal((1.2 - 3/5) / (-3/10), -2);
assert.equal(27**2 * 9**3, 3**12);
assert.equal(3*(-2)**2 - 2*(-2) - 5, 11);
assert.equal(1680 / 0.8, 2100);
assert.equal(((-3)**3 + 2**4) / (2**3 - 5**2), 11/17);
assert.deepEqual(Array.from({length:10}, (_, x) => x).filter(x => (5304 + 10*x) % 6 === 0), [0,3,6,9]);
for(const [index, task] of tasks.entries()) {
  assert.equal(task.taskNumber, String(index + 1));
  assert.equal(task.file, `${index + 1}.webp`);
  assert.equal(task.activityType, 'test');
  assert.equal(task.theme, 'checkpoint-blue');
  assert.equal(task.coursePart, 'praca_domowa');
  assert(!task.hint && !task.videoUrl && !task.grading);
  if(task.type === 'input') assert.equal(task.inputs.length, 1, `One response field for task ${task.taskNumber}`);
}

vm.runInContext(fs.readFileSync('static/lib/mathjs/answers.min.js', 'utf8'), context);
for(const name of ['isEquationSolutionInput', 'normalizeTypedAnswer', 'normalizeSymbolicExpression',
  'normalizeAcceptedMathForm', 'tokenizeSymbolicExpression', 'symbolicExpressionVariables',
  'evaluateSymbolicExpression', 'areSymbolicExpressionsEquivalent', 'getInputFields',
  'isTypedAnswerCorrect', 'parseIntegerAnswerSet', 'isInputFieldAnswerCorrect']) {
  vm.runInContext(functionSource(name), context);
}
const variants = {
  11: {good: ['{0,3,6,9}', '9;0;6;3', '0, 9, 3, 6', '0 3 6 9', '{ 9, 6, 3, 0 }'],
       bad: ['', '0;3;6', '0;3;6;9;1', '0;3;6;9;9', '{0;3;6;9', '0;;3;6;9', '0,3,6,9abc', '0369']},
  12: {good: ['2100', '2 100,00 zł', '2100.00 PLN', '1680/0.8', '2100 zl'], bad: ['420', '1680', '2101']},
  13: {good: ['11/17', '22/34', '11:17', '(-11)/(-17)'], bad: ['-11/17', '11/18', '17/11']},
  15: {good: ['20', '20.0', 'sqrt(400)', 'sqrt(20)*(sqrt(45)-sqrt(5))'], bad: ['10', '40', '-20']}
};
for(const [number, answers] of Object.entries(variants)) {
  const field = context.getInputFields(tasks[Number(number) - 1])[0];
  for(const value of answers.good) assert(context.isInputFieldAnswerCorrect(value, field), `Task ${number}: ${value}`);
  for(const value of answers.bad) assert(!context.isInputFieldAnswerCorrect(value, field), `Task ${number} rejects ${value}`);
}
console.log('PASS: EO test B has the revised key, flexible result fields and strict below-80% gating');
