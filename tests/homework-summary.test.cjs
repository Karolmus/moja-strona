const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const sourceId = 'zadania/kurs/mp/lekcja_2/lekcja_2_logarytmy.json';
const tasks = JSON.parse(fs.readFileSync(sourceId)).map(task => ({...task, sourceId, category:'kurs'}));
const source = {id:sourceId, label:'Lekcja 2', detail:'Logarytmy'};
const work = tasks.filter(t => ['praca_domowa', 'zadania_powtorkowe'].includes(t.coursePart));
const elements = Object.fromEntries(['homeworkSummaryOverlay', 'homeworkSummaryLesson', 'homeworkSummaryGood',
  'homeworkSummaryGoodHints', 'homeworkSummaryBad', 'homeworkSummaryBadHints', 'homeworkSummaryDuration',
  'homeworkSummaryReview', 'homeworkSummaryReviewStatus', 'homeworkSummaryPercent', 'homeworkSummaryTasks', 'progress']
  .map(id => [id, {hidden:true, innerText:'', innerHTML:'', children:[], replaceChildren(){this.children=[];}}]));
const nextButton = {innerText:''};
const dialog = {focus() {}};
const overlay = elements.homeworkSummaryOverlay;
overlay.dataset = {};
overlay.querySelector = () => dialog;
const ctx = vm.createContext({
  loggedUser:{role:'student'},
  workTimer:{finish(){}},
  tasks, selectedSource:sourceId, selectedCategory:'kurs', selectedLevel:'matura_podstawowa',
  STUDENT_WORK_COURSE_PARTS:['praca_domowa', 'zadania_powtorkowe'],
  SKIPPED_RESULT:'skipped', percentLabel:value=>`${Math.round(value*10)/10}%`, scheduleCompletionSummary(){},
  addNavigatorSectionLabel(){},
  addNavigatorTaskButton(container, task){container.children.push(task);container.lastElementChild={};},
  sessionResults:new Map(), sessionScores:new Map(), sessionDurations:new Map(), sessionHints:new Map(),
  sessionSubmittedAnswers:new Map(),
  savedProgress:[], reviewTaskKeys:new Set(), pendingReviewRequests:new Set(), reviewTasksLoadPromise:null,
  isLoggedInStudent:true, window:{apiFetch:true}, currentTask:work.at(-1), completedHomeworkSummarySource:'',
  currentTaskAnswered:false, isTaskLoading:false, hintUsed:false, answerShown:false,
  document:{getElementById:id => elements[id], activeElement:null, querySelector:() => nextButton, body:{style:{}}},
  getSourceMetaById:() => source, isClosedTask:() => true, requestAnimationFrame:fn => fn(),
  showMessage:message => {ctx.message = message;},
  isCoursePreviewMode:() => false, isInputTask:() => false, getCurrentTaskDurationSeconds:() => 10,
  setSessionScore() {}, setSessionDuration() {}, saveGuestSessionProgress() {},
  shouldShowTaskNavigator:() => true, renderTaskNavigator() {}, renderSourceSelector() {},
  updateScorePanel() {}, updateSourceSummary() {}, saveProgress() {}
});
for (const name of ['getTaskKey', 'getProgressSourceId', 'getProgressFile', 'progressTaskKey', 'getSavedResult',
  'getSavedProgressItem', 'taskUsedHint', 'getHomeworkSummaryTasks', 'isHomeworkComplete', 'getTaskDurationSeconds', 'taskMaxPoints',
  'taskPointValue', 'normalizeScoreValue', 'automaticScoreForResult', 'getTaskScore', 'calculateSourceSummary', 'calculateHomeworkSummary',
  'formatHomeworkDuration', 'loadStudentReviewTasks', 'updateHomeworkReviewCount', 'showHomeworkCompletionSummary', 'renderHomeworkSummaryTasks',
  'advanceToHomeworkSummaryIfComplete', 'updateNextTaskButton', 'addProgress']) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(html);
  assert(match, name);
  vm.runInContext(html.slice(match.index, html.indexOf('\n}', match.index)+2), ctx);
}
assert.equal(ctx.getHomeworkSummaryTasks().length, 18);
assert(!html.includes('id="homeworkSummaryMedium"'));
assert.match(html, /Zadania wykonane poprawnie/);
assert.match(html, /Zadania wykonane błędnie/);
assert.match(html, /Dodane do omówienia/);
assert(!html.includes('id="homeworkSummaryDuration"'));
assert(!html.includes('id="homeworkSummaryGoodHints"'));

const overrides = {
  'zd2.png':{result:'medium', hint_used:true},
  'zd3.png':{result:'bad', hint_used:true},
  'zd4.png':{result:'medium', earned_points:0.5, max_points:1},
  'zd5.png':{result:'medium', answer_shown:true},
  'zd6.png':{hint_used:true},
  'zp1.png':{result:'bad', hint_used:true},
  'zp2.png':{result:'medium', hint_used:true, earned_points:1, max_points:1}
};
ctx.savedProgress = work.map((task, i) => ({source_id:sourceId, file:task.file, result:'good',
  hint_used:false, duration_seconds:i+1, ...overrides[task.file]}));
ctx.savedProgress.push({...ctx.savedProgress[0], result:'bad'});
ctx.savedProgress.push({source_id:sourceId, file:'1.png', result:'bad', hint_used:true, duration_seconds:999});
ctx.savedProgress.push({source_id:'other', file:'zd1.png', result:'bad', hint_used:true, duration_seconds:999});
ctx.reviewTaskKeys = new Set([`${sourceId}:zd2.png`, `${sourceId}:zp1.png`, `${sourceId}:zp2.png`, `${sourceId}:1.png`, 'other:zd1.png']);
const summary = ctx.calculateHomeworkSummary();
for (const [key, value] of Object.entries({good:15, bad:3, goodHints:3, badHints:2, review:3, durationSeconds:171})) {
  assert.equal(summary[key], value, key);
}
assert.equal(summary.good + summary.bad, 18);
ctx.sessionHints.set(`${sourceId}:zd2.png`, false);
ctx.sessionDurations.set(`${sourceId}:zd1.png`, 17);
assert.equal(ctx.calculateHomeworkSummary().goodHints, 2, 'Current attempt flags override saved history');
assert.equal(ctx.calculateHomeworkSummary().durationSeconds, 187);
ctx.sessionHints.clear();
ctx.sessionDurations.clear();
assert(ctx.isHomeworkComplete());
const completeProgress = [...ctx.savedProgress];
ctx.savedProgress = ctx.savedProgress.filter(row => !row.file.startsWith('zp'));
assert(!ctx.isHomeworkComplete(), 'Completion waits for review exercises');
assert(!ctx.advanceToHomeworkSummaryIfComplete());
ctx.updateNextTaskButton();
assert.equal(nextButton.innerText, 'Kolejne zadanie →');
ctx.savedProgress = completeProgress;
ctx.updateNextTaskButton();
assert.equal(nextButton.innerText, 'Zobacz podsumowanie →');
ctx.sessionResults.set(`${sourceId}:zp3.png`, 'skipped');
assert(!ctx.isHomeworkComplete(), 'Skipped exercises do not trigger a completion summary');
ctx.sessionResults.clear();

(async () => {
  let release;
  let fetched = 0;
  ctx.pendingReviewRequests.add(new Promise(resolve => {release = resolve;}));
  ctx.apiFetch = async endpoint => {
    assert.equal(endpoint, '/api/review-tasks/me');
    fetched++;
    return {review_tasks:[{source_id:sourceId, file:'zd2.png'}, {task_id:`${sourceId}:zp2.png`},
      {task_id:`${sourceId}:zp2.png`, is_resolved:true}]};
  };
  assert(ctx.advanceToHomeworkSummaryIfComplete());
  assert(!ctx.advanceToHomeworkSummaryIfComplete(), 'Open the summary once per completion');
  assert.equal(overlay.hidden, false);
  assert.equal(elements.homeworkSummaryGood.innerText, 15);
  assert.equal(elements.homeworkSummaryBad.innerText, 3);
  assert.equal(elements.homeworkSummaryPercent.innerText, ctx.percentLabel(summary.percent));
  assert.equal(elements.homeworkSummaryTasks.children.length, 18);
  assert.equal(elements.homeworkSummaryReview.innerText, '...');
  assert.equal(fetched, 0, 'Wait for outstanding discussion requests before fetching the count');
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetched, 1);
  assert.equal(elements.homeworkSummaryReview.innerText, 3, 'Unique tasks only; preserve current session submissions');
  assert(elements.homeworkSummaryReviewStatus.hidden);
  ctx.pendingReviewRequests.clear();
  ctx.apiFetch = async () => {throw new Error('Offline');};
  await ctx.updateHomeworkReviewCount(sourceId);
  assert.equal(elements.homeworkSummaryReview.innerText, '-', 'A failed fetch must never be presented as zero');
  assert(!elements.homeworkSummaryReviewStatus.hidden);
  assert.match(elements.homeworkSummaryReviewStatus.innerText, /Nie udało się/);
  ctx.apiFetch = async () => ({review_tasks:[]});
  await ctx.updateHomeworkReviewCount(sourceId);
  assert.equal(elements.homeworkSummaryReview.innerText, 3);
  assert(elements.homeworkSummaryReviewStatus.hidden);

  ctx.apiFetch = () => new Promise(resolve => {release = resolve;});
  const late = ctx.updateHomeworkReviewCount(sourceId);
  await new Promise(resolve => setImmediate(resolve));
  overlay.dataset.sourceId = 'other';
  elements.homeworkSummaryReview.innerText = 'other count';
  release({review_tasks:[]});
  await late;
  assert.equal(elements.homeworkSummaryReview.innerText, 'other count', 'A stale response cannot change another lesson summary');

  ctx.currentTask = work[0];
  ctx.currentTaskAnswered = false;
  ctx.hintUsed = true;
  ctx.addProgress('bad');
  ctx.hintUsed = false;
  assert.equal(ctx.sessionHints.get(`${sourceId}:zd1.png`), true, 'Capture hint usage when the answer is submitted');
  assert.equal(ctx.calculateHomeworkSummary().badHints, 3);
  ctx.sessionResults.set(`${sourceId}:zd1.png`, 'video');
  ctx.sessionScores.set(`${sourceId}:zd1.png`, {earnedPoints:1,maxPoints:1});
  const videoSummary = ctx.calculateHomeworkSummary();
  assert.equal(videoSummary.video, 1);
  assert.equal(videoSummary.good + videoSummary.bad, 17, 'A film is neither a good nor a bad answer');
  assert.equal(ctx.getTaskScore(work[0]).earnedPoints, 0, 'A film overrides any earlier score');
  assert(ctx.isHomeworkComplete(), 'A film counts as completed for the mandatory summary');
  console.log('PASS: homework + review totals, correct/incorrect hinted answers, partial scores, time, unique discussion counts, refresh and pending/failed requests');
})().catch(error => {console.error(error); process.exitCode = 1;});
