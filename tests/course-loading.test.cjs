const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const elements = Object.fromEntries(['sourceLoadStatus', 'sourceLoadMessage', 'sourceLoadRetry']
  .map(id => [id, {hidden: true, textContent: ''}]));
const cardClasses = new Set();
let selectorRenders = 0;
let drawnIndex = null;
const ctx = vm.createContext({
  console: {warn() {}}, isLoggedInStudent: true, selectedLevel: 'matura_podstawowa',
  selectedSource: 'mp-lesson1', selectedCategory: 'kurs',
  document: {
    getElementById: id => elements[id],
    querySelector: () => ({classList: {toggle(name, on) {
      if (on) cardClasses.add(name); else cardClasses.delete(name);
    }}}),
  },
  loadAssignedCourse: async () => {}, getRequestedCategory: () => '',
  defaultCoursePart: () => 'praca_domowa', getInitialIndex: () => 3,
  loadStudentProgress: async () => [], restoreLastStudentLocation: async () => 4,
  loadStudentReviewTasks: async () => [],
  renderSourceSelector: () => {selectorRenders++;},
  drawTask: async index => {drawnIndex = index;},
});
for (const name of ['ensureAvailableCategory', 'updateAccessModeUI', 'ensureSelectedSource',
  'updateCategoryButtons', 'updateLevelButtons', 'updateModeButtons', 'updateMetaTheme',
  'ensureSelectedCoursePart', 'refreshTaskNavigator', 'renderTagSearch', 'ensureTagFilteredSourcesLoaded']) {
  ctx[name] = () => {};
}
for (const name of ['bootStudentPanel', 'sourceLoadErrorMessage', 'setSourceLoadState',
  'retrySourceLoad', 'loadSelectedSourceAndDraw']) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(html);
  assert(match, name);
  const end = html.indexOf('\n}', match.index) + 2;
  vm.runInContext(html.slice(match.index, end), ctx);
}

(async () => {
  let rejectLoad;
  ctx.ensureTaskSourceLoaded = () => new Promise((resolve, reject) => {rejectLoad = reject;});
  const boot = ctx.bootStudentPanel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(selectorRenders, 1, 'Lesson selector appears before its material loads');
  assert(cardClasses.has('source-load-pending'));
  assert.equal(elements.sourceLoadStatus.hidden, false);
  assert.equal(elements.sourceLoadRetry.hidden, true);

  rejectLoad(Object.assign(new Error('Missing material'), {status: 404}));
  await boot;
  assert.equal(selectorRenders, 1, 'A missing server asset does not erase the lesson selector');
  assert.match(elements.sourceLoadMessage.textContent, /404/);
  assert.equal(elements.sourceLoadRetry.hidden, false);
  assert.equal(drawnIndex, null);

  ctx.ensureTaskSourceLoaded = async () => {};
  await ctx.retrySourceLoad();
  assert.equal(elements.sourceLoadStatus.hidden, true);
  assert.equal(cardClasses.has('source-load-pending'), false);
  assert.equal(drawnIndex, 3, 'Retry selects a task after loading');
  await ctx.bootStudentPanel();
  assert.equal(drawnIndex, 4, 'Successful boot still restores saved progress');
  assert.equal(elements.sourceLoadStatus.hidden, true);
  ctx.loadStudentReviewTasks = async () => {throw new Error('Review API offline');};
  await ctx.bootStudentPanel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.sourceLoadStatus.hidden, true, 'Unavailable discussion history does not block the lesson');

  for (const status of [401, 403, 404]) {
    ctx.ensureTaskSourceLoaded = async () => {throw {status};};
    await ctx.loadSelectedSourceAndDraw();
    assert.match(elements.sourceLoadMessage.textContent, new RegExp(String(status)));
    assert.equal(elements.sourceLoadRetry.hidden, false);
  }
  assert.match(ctx.sourceLoadErrorMessage({code: 'invalid_task_source'}), /nieprawidłowe materiały/);
  assert.match(ctx.sourceLoadErrorMessage(new Error()), /Sprawdź połączenie/);
  console.log('PASS: early lesson selector, loading/error states, retry, access errors and saved progress');
})().catch(error => {console.error(error); process.exitCode = 1;});
