const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('zadania.html', 'utf8');
const lesson = {id:'lesson-1', category:'kurs', level:'matura_podstawowa'};
const task = (file, coursePart = 'praca_domowa', sourceId = lesson.id) => ({
  ...lesson, sourceId, file, coursePart
});
const homework = task('zd1.png');
const revision = task('zp1.png', 'zadania_powtorkowe');
const main = task('1.png', 'zadania');
const ctx = vm.createContext({
  tasks:[homework, revision, main],
  STUDENT_WORK_COURSE_PARTS:['praca_domowa', 'zadania_powtorkowe'],
  reviewTaskKeys:new Set(), results:new Map(),
  getTaskKey:task => `${task.sourceId}:${task.file}`,
  getSavedResult:task => ctx.results.get(ctx.getTaskKey(task))
});
for (const name of ['getSourceCompletionTasks', 'isSourceComplete']) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), ctx);
}

assert(!ctx.isSourceComplete(lesson), 'Untouched tasks do not mark a lesson complete');
ctx.results.set(ctx.getTaskKey(homework), 'good');
assert(!ctx.isSourceComplete(lesson), 'Unanswered revision still blocks completion');
ctx.reviewTaskKeys.add('other-lesson:zp1.png');
ctx.reviewTaskKeys.add(ctx.getTaskKey(main));
assert(!ctx.isSourceComplete(lesson), 'Requests for a different source or main task do not finish homework');
const answers = Array.from(ctx.results);
ctx.reviewTaskKeys.add(ctx.getTaskKey(revision));
assert(ctx.isSourceComplete(lesson), 'A review-only revision task no longer blocks the green lesson tile');
assert.deepEqual(Array.from(ctx.results), answers, 'Review requests never invent an answer or award points');
ctx.results.clear();
assert(!ctx.isSourceComplete(lesson), 'The other untouched task is still required');
ctx.reviewTaskKeys.add(ctx.getTaskKey(homework));
assert(ctx.isSourceComplete(lesson), 'Both homework and revision may be explicitly sent for discussion');
ctx.reviewTaskKeys.delete(ctx.getTaskKey(homework));
assert(!ctx.isSourceComplete(lesson), 'Removing the request restores the unanswered state');
ctx.results.set(ctx.getTaskKey(homework), 'bad');
assert(ctx.isSourceComplete(lesson), 'An incorrect submitted answer still counts as work completed');
assert(!ctx.isSourceComplete({...lesson, id:'empty'}), 'An empty source is never complete');

const test = {...lesson, id:'test-1', kind:'test'};
const testTask = {...task('1.png', 'praca_domowa', test.id), activityType:'test'};
ctx.tasks.push(testTask);
ctx.reviewTaskKeys.add(ctx.getTaskKey(testTask));
assert(!ctx.isSourceComplete(test), 'A discussion request cannot complete a test');
assert(!ctx.isSourceComplete({...test, kind:undefined}), 'Test tasks are protected even without source metadata');
ctx.results.set(ctx.getTaskKey(testTask), 'good');
assert(ctx.isSourceComplete(test), 'A submitted test answer still counts');

const exam = {...lesson, id:'exam-1', category:'egzaminy'};
const examTask = {...task('1.png', 'zadania', exam.id), category:'egzaminy'};
ctx.tasks.push(examTask);
ctx.reviewTaskKeys.add(ctx.getTaskKey(examTask));
assert(!ctx.isSourceComplete(exam), 'Exam completion remains answer-based');
ctx.results.set(ctx.getTaskKey(examTask), 'good');
assert(ctx.isSourceComplete(exam));
console.log('PASS: review-only homework completes lesson tiles without answers, scores or changes to test/exam rules');
