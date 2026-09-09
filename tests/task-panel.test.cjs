const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('zadania.html', 'utf8');
const reviewLabel = 'Chcę omówić to zadanie na zajęciach';
const button = {innerText:'', disabled:true};
const meta = {innerHTML:'', classList:{toggle() {}}};
const instruction = {};
const counter = {};
const ctx = vm.createContext({
  document:{getElementById:id => ({reviewButton:button, metaBox:meta, taskInstruction:instruction, taskCounter:counter})[id]},
  currentIndex:0, isLoggedInStudent:true, isCoursePreviewMode:() => false,
  currentTask:{sourceId:'lesson', file:'zp1.png', category:'kurs', coursePart:'zadania_powtorkowe'},
  window:{apiFetch:true}, selectedCoursePart:'zadania_powtorkowe',
  pendingReviewRequests:new Set(), reviewTaskKeys:new Set(),
  taskLabel:() => 'Zadanie', formatTagLabel:text => text, isPracticalTask:() => false,
  showMessage:message => {ctx.message = message;}
});
for (const name of ['getTaskKey', 'stars', 'difficultyFromCompletionPercent', 'taskDifficulty', 'taskMaxPoints', 'formatPoints',
  'pointsBadgeMarkup', 'completionTooltip', 'difficultyStarsMarkup', 'updateTaskDetails', 'resetReviewButton', 'markForReview']) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  const body = html.slice(start, html.indexOf('\n}', start)+2);
  vm.runInContext((html.slice(start-6, start) === 'async ' ? 'async ' : '') + body, ctx);
}
assert.match(html, /id="reviewButton"[^>]*>Chcę omówić to zadanie na zajęciach<\/button>/);
assert(!html.includes('Dodaj do omówienia'));
assert.match(html, /id="courseBrand"[\s\S]*?<img[^>]*>[\s\S]*?<p>Karol Musioł Delta Sigma<\/p>/);
assert.match(html, /\.course-brand\[hidden\]\s*\{\s*display: none;/);
assert(html.indexOf('id="taskImage"') < html.indexOf('id="mcq"'));
assert(html.indexOf('id="taskInstruction"') < html.indexOf('id="mcq"'));
assert(html.indexOf('id="mcq"') < html.indexOf('class="interaction-panel"'), 'Answers precede help and navigation in DOM order');
assert.match(html, /\.source-load-pending > \.mcq/);
assert(!html.includes('--tile-result-band'), 'Status no longer uses thick inset bands');
for (const icon of ['check', 'x', 'minus', 'skip-forward']) {
  const path = `static/icons/${icon}.svg`;
  assert.match(fs.readFileSync(path, 'utf8'), /viewBox="0 0 24 24"/);
  assert(html.includes(path));
}

const navContext = vm.createContext({
  document:{createElement:() => ({
    classList:{values:new Set(), add(value) {this.values.add(value);}},
    attributes:{}, setAttribute(key, value) {this.attributes[key] = value;}
  })},
  getSavedResult:task => task.result, taskThemeClass:() => 'nav-theme-revision',
  navigatorTaskLabel:() => '12', taskLabel:() => 'Zadanie powtórkowe 12',
  resultLabel:result => result || 'nierozwiązane', isActiveNavigatorTask:task => task.active,
  openNavigatorTask:(task, index) => {navContext.opened = {task, index};}
});
const navStart = html.indexOf('function addNavigatorTaskButton(');
vm.runInContext(html.slice(navStart, html.indexOf('\n}', navStart)+2), navContext);
const buttons = [];
const container = {appendChild:button => buttons.push(button)};
for (const result of ['good', 'bad', 'medium', 'skipped', null]) {
  const task = {result, active:result === 'good'};
  navContext.addNavigatorTaskButton(container, task, buttons.length);
  const button = buttons.at(-1);
  assert(button.classList.values.has('nav-theme-revision'));
  assert.equal(button.innerText, '12', 'The number stays legible and separate from status icons');
  assert.equal(button.attributes['aria-label'], button.title);
  assert.equal(button.attributes['aria-current'], task.active ? 'step' : undefined);
  if (result) assert(button.classList.values.has(result));
  button.onclick();
  assert.equal(navContext.opened.task, task);
  assert.equal(navContext.opened.index, buttons.length-1);
}
for (const coursePart of ['zadania', 'praca_domowa', 'zadania_powtorkowe', 'zadania_praktyczne']) {
  const task = {category:'kurs', coursePart, topic:'Logarytmy', difficulty:3, completionPercent:51, maxPoints:1};
  assert.equal(ctx.difficultyStarsMarkup(task), '');
  ctx.updateTaskDetails(task, 15);
  assert(!meta.innerHTML.includes('difficulty-stars'));
  assert(!meta.innerHTML.includes('data-tooltip'));
  assert(meta.innerHTML.includes('points-badge'), 'Keep course point information');
  assert.equal((meta.innerHTML.match(/class="meta-section"/g) || []).length, 2, 'No empty difficulty section');
}
const exam = {category:'egzaminy', topic:'Logarytmy', difficulty:3, completionPercent:51, maxPoints:2};
assert.match(ctx.difficultyStarsMarkup(exam), /★★★☆☆/);
assert.match(ctx.difficultyStarsMarkup(exam), /51% uczniów/);
ctx.updateTaskDetails(exam, 30);
assert(meta.innerHTML.includes('difficulty-stars'), 'Exam difficulty remains visible');
assert.equal(exam.difficulty, 3, 'The underlying difficulty data is unchanged');

(async () => {
  ctx.resetReviewButton();
  assert.equal(button.innerText, reviewLabel);
  assert.equal(button.disabled, false);
  ctx.apiFetch = async () => {throw new Error('Offline test');};
  await ctx.markForReview();
  assert.equal(button.innerText, reviewLabel, 'Retry uses the full label');
  assert.equal(button.disabled, false);
  assert.match(ctx.message, /Nie udało się/);
  assert.equal(ctx.reviewTaskKeys.size, 0, 'Failed requests do not count as discussion requests');
  ctx.apiFetch = async () => ({created:true});
  await ctx.markForReview();
  assert.equal(button.innerText, 'Dodano do omówienia');
  assert.equal(button.disabled, true);
  assert.equal(ctx.reviewTaskKeys.size, 1);
  ctx.resetReviewButton();
  assert.equal(button.innerText, reviewLabel, 'A new task resets the label');
  ctx.apiFetch = async () => ({created:false});
  await ctx.markForReview();
  assert.equal(button.innerText, 'Już na liście');
  assert.equal(button.disabled, true);
  assert.equal(ctx.reviewTaskKeys.size, 1, 'Repeated requests count once');
  let finish;
  const previousTask = ctx.currentTask;
  ctx.apiFetch = () => new Promise(resolve => {finish = resolve;});
  const pending = ctx.markForReview();
  assert.equal(ctx.pendingReviewRequests.size, 1);
  ctx.currentTask = {...previousTask, file:'zp2.png'};
  ctx.resetReviewButton();
  finish({created:true});
  await pending;
  assert.equal(button.innerText, reviewLabel, 'A late response does not rename the next task button');
  assert.equal(button.disabled, false);
  assert.equal(ctx.pendingReviewRequests.size, 0);
  assert(ctx.reviewTaskKeys.has('lesson:zp1.png'));
  assert(!ctx.reviewTaskKeys.has('lesson:zp2.png'));
  console.log('PASS: course-only difficulty hiding, discussion request races, compact materials, answer order, accessible task statuses and logo caption');
})().catch(error => {console.error(error); process.exitCode = 1;});
