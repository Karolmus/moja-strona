const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('zadania.html', 'utf8');
const sourceId = 'test-source';
const startedAt = Date.parse('2026-10-07T10:00:00Z');
const summary = {tasks: [{file: '1.png'}, {file: '2.png'}], durationSeconds: 123, percent: 83.333};
const elements = Object.fromEntries([
  'homeworkSummaryTitle', 'homeworkSummaryGood', 'homeworkSummaryBad', 'homeworkSummaryVideo',
  'homeworkSummaryPercent', 'homeworkSummaryOverlay', 'testSummaryResult', 'testSummaryPercent',
  'testSummaryTime', 'testSummaryFill'
].map(id => [id, {innerText: '', hidden: true, dataset: {}, style: {}}]));
const classes = new Set();
const overlay = elements.homeworkSummaryOverlay;
overlay.classList = {toggle(name, on){on ? classes.add(name) : classes.delete(name);}};
overlay.querySelector = () => ({focus(){}});
let reviewsLoaded = 0;
const context = vm.createContext({
  selectedSource: sourceId, TEST_DURATION_SECONDS: 3600,
  wasTestTimedOut: () => false,
  storedTestDeadline: () => startedAt + 3600_000,
  getSavedProgressItem: task => ({created_at: task.file === '1.png'
    ? '2026-10-07T10:04:00Z' : '2026-10-07T10:25:17Z'}),
  getSourceMetaById: () => ({kind: 'test'}),
  calculateHomeworkSummary: () => ({...summary, good: 12, bad: 3, video: 0}),
  formatPoints: String,
  updateHomeworkReviewCount: () => reviewsLoaded++,
  showMessage: text => {context.message = text;},
  document: {getElementById: id => elements[id], activeElement: null, body: {style: {}}},
  requestAnimationFrame: action => action()
});

for(const name of ['timerClock', 'sourceScoreLabel', 'testCompletionDuration', 'testCompletionText', 'showHomeworkCompletionSummary']){
  const match = new RegExp(`function ${name}\\(`).exec(html);
  assert(match, name);
  vm.runInContext(html.slice(match.index, html.indexOf('\n}', match.index) + 2), context);
}

assert.equal(context.sourceScoreLabel({percent: 83.333}), '83%');
assert.equal(context.testCompletionText(sourceId, summary), 'Test zakończony: Czas 25:17, Wynik 83%');
assert.equal(context.testCompletionText(sourceId, summary), 'Test zakończony: Czas 25:17, Wynik 83%',
  'Reopening uses the saved final answer timestamp, not the current clock');
context.showHomeworkCompletionSummary(sourceId);
assert(classes.has('test-summary'));
assert.equal(elements.homeworkSummaryTitle.innerText, 'Test zakończony');
assert.equal(elements.testSummaryResult.hidden, false);
assert.equal(elements.testSummaryPercent.innerText, '83%');
assert.equal(elements.testSummaryTime.innerText, '25:17');
assert.equal(elements.testSummaryFill.style.width, '83.333%');
assert.equal(reviewsLoaded, 0, 'A test does not load homework review counts');
assert.equal(overlay.hidden, false);

context.calculateHomeworkSummary = () => ({...summary, percent: 100});
context.showHomeworkCompletionSummary(sourceId);
assert.equal(elements.testSummaryPercent.innerText, '100%');
assert.equal(elements.testSummaryFill.style.width, '100%');
context.calculateHomeworkSummary = () => ({...summary, percent: 0});
context.showHomeworkCompletionSummary(sourceId);
assert.equal(elements.testSummaryPercent.innerText, '0%');
assert.equal(elements.testSummaryFill.style.width, '0%');
context.calculateHomeworkSummary = () => ({...summary, good: 12, bad: 3, video: 0});

context.wasTestTimedOut = () => true;
assert.equal(context.testCompletionText(sourceId, summary), 'Test zakończony: Czas 60:00, Wynik 83%');
context.wasTestTimedOut = () => false;
context.storedTestDeadline = () => 0;
assert.equal(context.testCompletionText(sourceId, summary), 'Test zakończony: Czas 02:03, Wynik 83%',
  'Older results without a local deadline still display their saved work time');
context.getSavedProgressItem = () => null;
assert.equal(context.testCompletionText(sourceId, {...summary, durationSeconds: 9999, percent: 0}),
  'Test zakończony: Czas 60:00, Wynik 0%');

overlay.querySelector = () => null;
context.showHomeworkCompletionSummary(sourceId);
assert.equal(context.message, 'Test zakończony: Czas 02:03, Wynik 83%');

overlay.querySelector = () => ({focus(){}});
context.getSourceMetaById = () => ({kind: 'lesson'});
context.showHomeworkCompletionSummary(sourceId);
assert(!classes.has('test-summary'), 'Returning to homework restores its normal summary');
assert.equal(elements.homeworkSummaryTitle.innerText, 'Podsumowanie zadania domowego');
assert.equal(elements.testSummaryResult.hidden, true);
assert.equal(reviewsLoaded, 1);
assert.equal(context.sourceScoreLabel({earnedPoints: 5, totalPoints: 8, percent: 62.5}), '5 / 8 pkt');

assert.match(html, /\.test-summary \.homework-summary-stats,[\s\S]*?display: none;/);
assert.match(html, /\.mobile-course-result \.source-summary-percent\[hidden\]\s*\{\s*display: none;/,
  'The mobile footer cannot display the test percentage twice');
console.log('PASS: compact test result, rounded percent, saved elapsed time and unchanged homework summary');
