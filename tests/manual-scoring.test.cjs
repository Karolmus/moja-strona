const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const elements = Object.fromEntries(['scorePanel', 'manualScoreNotice', 'scoreInput', 'scoreStatus',
  'scoreValueLabel', 'scoreSaveButton', 'resultButtons'].map(id => [id, {
  hidden:true, innerText:'', value:'0', type:id === 'scoreInput' ? 'range' : '',
  style:{setProperty(name, value) {this[name] = value;}},
  setAttribute(name, value) {this[name] = value;}, classList:{remove() {}}
}]));
const context = vm.createContext({
  document:{getElementById:id => elements[id], activeElement:null},
  currentTask:{category:'egzaminy', maxPoints:5, gradingCriteria:['rubric.webp']},
  examScoreUnlocked:false, answerShown:false, preview:false, saved:null, storedScore:null,
  currentTaskAnswered:false, submissions:[],
  SKIPPED_RESULT:'skipped', savedResult:'',
  isClosedTask:task => task?.type === 'closed', isInputTask:task => task?.type === 'input',
  isPracticalTask:() => false, isCoursePreviewMode:() => context.preview,
  isCourseTask:task => (task || context.currentTask)?.category === 'kurs',
  requiresSubmittedAnswer:task => task?.type === 'input',
  getSavedResult:() => context.savedResult,
  getSavedProgressItem:() => context.saved, getTaskScore:() => context.storedScore,
  updateSourceSummary() {},
  addProgress(type, score) {context.submissions.push({type, ...score});}
});
for (const name of ['hasGradingCriteria', 'hasSavedPoints', 'isManualScoreTask', 'isExamManualScoreTask',
  'isCourseManualScoreTask', 'shouldShowScorePanel', 'canRevealEvaluationMaterials', 'scoreRangeStep', 'formatPoints', 'taskMaxPoints',
  'scoreResultType', 'updateScoreRangePresentation', 'updateScorePanel', 'submitScore']) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  vm.runInContext((html.slice(start - 6, start) === 'async ' ? 'async ' : '') +
    html.slice(start, html.indexOf('\n}', start) + 2), context);
}
const notice = 'To zadanie oceniasz samodzielnie. Rozwiąż je, a następnie otwórz zasady oceniania, aby przyznać sobie punkty.';
assert(html.includes(`id="manualScoreNotice" hidden>${notice}</p>`));
assert.match(html, /\.manual-score-notice \{[^}]*color: #000;/);
assert.match(html, /id="scoreInput"[^>]*type="range"/);
assert.match(html, /id="scoreSaveButton"[^>]*>Zapisz wynik<\/button>/);
context.currentTask = {category:'kurs', maxPoints:1, type:'input'};
assert(!context.canRevealEvaluationMaterials(), 'An input task keeps assessment materials locked before submission');
context.currentTaskAnswered = true;
assert(context.canRevealEvaluationMaterials(), 'Submitting an input answer unlocks assessment materials');
context.currentTaskAnswered = false;
context.currentTask = {category:'kurs', maxPoints:2};
assert(context.canRevealEvaluationMaterials(), 'A manually scored task exposes criteria needed for self-assessment');
context.currentTask = {category:'egzaminy', maxPoints:5, gradingCriteria:['rubric.webp']};
for (const removed of ['scoreMaxButton', 'scoreMaxLabel', 'scoreRangeScale', 'score-panel-head']) {
  assert(!html.includes(removed), removed);
}

(async () => {
  context.updateScorePanel();
  assert(elements.scorePanel.hidden);
  assert(!elements.manualScoreNotice.hidden);
  await context.submitScore({preventDefault() {}});
  assert.equal(context.submissions.length, 0, 'Cannot submit before viewing assessment materials');
  context.examScoreUnlocked = true;
  context.updateScorePanel();
  assert(!elements.scorePanel.hidden);
  assert(elements.manualScoreNotice.hidden);
  assert.equal(elements.scoreInput.max, '5');
  assert.equal(elements.scoreInput.step, '1');
  assert.equal(elements.scoreValueLabel.value, '0 / 5 pkt');
  assert.equal(elements.scoreStatus.innerText, '');
  elements.scoreInput.value = '3';
  context.document.activeElement = elements.scoreInput;
  context.updateScoreRangePresentation();
  assert.equal(elements.scoreValueLabel.value, '3 / 5 pkt');
  assert.equal(elements.scoreInput['aria-valuetext'], '3 z 5 punktów');
  assert.equal(elements.scoreInput.style['--score-fill'], '60%');
  context.updateScorePanel();
  assert.equal(elements.scoreInput.value, '3', 'Opening another assessment page preserves the selection');
  await context.submitScore({preventDefault() {}});
  assert.deepEqual(context.submissions, [{type:'medium', earnedPoints:3, maxPoints:5}]);
  assert.equal(elements.scoreStatus.innerText, 'Zapisano: 3 / 5 pkt.');
  assert.equal(elements.scoreSaveButton.disabled, false);

  context.examScoreUnlocked = false;
  context.storedScore = {earnedPoints:0, maxPoints:5};
  elements.scorePanel.hidden = true;
  context.updateScorePanel();
  assert(!elements.scorePanel.hidden, 'A saved zero-point result remains available');
  assert.equal(elements.scoreInput.value, '0');
  context.storedScore = null;
  context.currentTask = {category:'egzaminy', maxPoints:2, type:'closed'};
  context.updateScorePanel();
  assert(elements.scorePanel.hidden && elements.manualScoreNotice.hidden);
  context.currentTask.type = 'input';
  context.updateScorePanel();
  assert(elements.scorePanel.hidden && elements.manualScoreNotice.hidden);

  context.currentTask = {category:'kurs', maxPoints:2.5};
  context.updateScorePanel();
  assert(elements.scorePanel.hidden && elements.manualScoreNotice.hidden);
  context.answerShown = true;
  context.updateScorePanel();
  assert(!elements.scorePanel.hidden);
  assert.equal(elements.scoreInput.step, '0.5');
  elements.scoreInput.value = '1.5';
  await context.submitScore({preventDefault() {}});
  assert.equal(elements.scoreInput.disabled, true);
  assert.equal(elements.scoreSaveButton.disabled, true);
  context.saved = {earned_points:1.5, max_points:2.5};
  elements.scorePanel.hidden = true;
  context.updateScorePanel();
  assert.equal(elements.scoreInput.value, '1.5');
  assert(elements.scoreInput.disabled && elements.scoreSaveButton.disabled);
  const submitted = context.submissions.length;
  await context.submitScore({preventDefault() {}});
  assert.equal(context.submissions.length, submitted, 'A course score cannot be overwritten');
  context.preview = true;
  context.updateScorePanel();
  assert(elements.scorePanel.hidden && elements.manualScoreNotice.hidden);
  console.log('PASS: manual-score notice, unlocking, compact slider, points, saved zero, course locking and preview');
})().catch(error => { console.error(error); process.exitCode = 1; });
