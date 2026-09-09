const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const names = ['loadTaskSource', 'pool', 'ensureSelectedCoursePart', 'defaultCoursePart',
  'getSourceCompletionTasks', 'getCoursePartTasks', 'getCourseNavigatorItems', 'sourceSummaryTasks'];
const ctx = vm.createContext({
  STUDENT_WORK_COURSE_PART: 'praca_domowa', COURSE_PART_ORDER: {praca_domowa: 2},
  STUDENT_WORK_COURSE_PARTS: ['praca_domowa', 'zadania_powtorkowe'],
  selectedCategory: 'kurs', selectedSource: 'lesson1', selectedLevel: 'matura_podstawowa',
  selectedCoursePart: 'zadania', isLoggedInStudent: true,
  tagFiltersSearchAllSources: () => false, taskMatchesTagFilters: () => true,
  normalizeTaskSolutions: () => [], normalizeTaskGradingCriteria: () => [],
  normalizeCourseTextGradingCriteria: () => [], normalizeTaskTags: () => [],
  getSourceMeta: source => source,
});
for (const name of names) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  const end = html.indexOf('\n}', start) + 2;
  vm.runInContext(html.slice(start, end), ctx);
}
const makeTask = (file, coursePart, sourceId='lesson1', category='kurs') => ({
  file, coursePart, sourceId, category, level: 'matura_podstawowa',
});
const main = makeTask('1.webp', 'zadania');
const homework = makeTask('zd1.webp', 'praca_domowa');
const otherLesson = makeTask('zd2.webp', 'praca_domowa', 'lesson2');
const exam = makeTask('exam.webp', 'zadania', 'exam', 'egzaminy');
ctx.tasks = [main, homework, otherLesson, exam];
const files = items => Array.from(items, item => item.file);
for (const student of [true, false]) {
  ctx.isLoggedInStudent = student;
  ctx.selectedCoursePart = 'zadania';
  assert.equal(ctx.defaultCoursePart(), 'praca_domowa');
  ctx.ensureSelectedCoursePart();
  assert.equal(ctx.selectedCoursePart, 'praca_domowa');
  for (const fn of ['pool', 'getCourseNavigatorItems', 'sourceSummaryTasks']) {
    assert.deepEqual(files(ctx[fn]()), ['zd1.webp'], fn);
  }
  assert.deepEqual(files(ctx.getCoursePartTasks('zadania')), []);
  assert.deepEqual(files(ctx.getCoursePartTasks('praca_domowa')), ['zd1.webp']);
  assert.deepEqual(files(ctx.getSourceCompletionTasks({category:'kurs', level:ctx.selectedLevel, id:'lesson1'})), ['zd1.webp']);
  ctx.tasks = [main];
  assert.equal(ctx.pool().length, 0, 'No fallback to main tasks');
  assert.equal(ctx.sourceSummaryTasks().length, 0);
  ctx.tasks = [main, homework, otherLesson, exam];
}
(async () => {
  ctx.loadJsonSource = async () => [main, homework, {file:'legacy.webp', section:'praca_domowa'}];
  const course = {id:'lesson1', path:'zadania/kurs/lesson.json', category:'kurs', level:ctx.selectedLevel};
  assert.deepEqual(files(await ctx.loadTaskSource(course)), ['zd1.webp', 'legacy.webp']);
  ctx.loadJsonSource = async () => [exam];
  assert.deepEqual(files(await ctx.loadTaskSource({...course, category:'egzaminy'})), ['exam.webp']);
  ctx.loadJsonSource = async () => ({error: 'Unexpected server response'});
  await assert.rejects(ctx.loadTaskSource(course), {code: 'invalid_task_source'});
  ctx.selectedCategory = 'egzaminy'; ctx.selectedSource = 'exam';
  assert.deepEqual(files(ctx.pool()), ['exam.webp']);
  console.log('PASS: homework-only loading, navigation, resume state and summaries; exams unchanged');
})().catch(error => {console.error(error); process.exitCode = 1;});
