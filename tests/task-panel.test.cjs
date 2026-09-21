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
  loggedUser:{role:'student'},
  document:{getElementById:id => ({reviewButton:button, metaBox:meta, taskInstruction:instruction, taskCounter:counter})[id]},
  currentIndex:0, isLoggedInStudent:true, isCoursePreviewMode:() => false,
  currentTask:{sourceId:'lesson', file:'zp1.png', category:'kurs', coursePart:'zadania_powtorkowe'},
  window:{apiFetch:true}, selectedCoursePart:'zadania_powtorkowe',
  pendingReviewRequests:new Set(), reviewTaskKeys:new Set(),
  renderTaskNavigator:() => {ctx.navigatorRenders = (ctx.navigatorRenders || 0) + 1;},
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
assert.match(html, /zadania: "Część główna"/);
assert(!html.includes('zadania: "1. Część główna"'));
assert.match(html, /body\.focus-mode\s*\{[^}]*min-height:\s*100vh;[^}]*background:\s*#000000;/s,
  'Focus mode fills the area outside the task with black');
assert.match(html, /id="courseBrand"[\s\S]*?<img[^>]*>[\s\S]*?<p>Karol Musioł Delta Sigma<\/p>/);
assert.match(html, /\.course-brand\[hidden\]\s*\{\s*display: none;/);
assert(html.indexOf('id="taskImage"') < html.indexOf('id="mcq"'));
assert(html.indexOf('id="taskInstruction"') < html.indexOf('id="mcq"'));
assert(html.indexOf('id="mcq"') < html.indexOf('class="interaction-panel"'), 'Answers precede help and navigation in DOM order');
assert.match(html, /\.source-load-pending > \.mcq/);
const toolGridStyle = html.match(/\.action-group\.tools \{([^}]+)\}/)[1];
assert.match(toolGridStyle, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  'Task tools use two equal columns');
assert(!html.includes('.action-group.tools:has(.review:not([hidden]))'),
  'The discussion action does not receive a wider column');
const toolButtonStyle = html.match(/\.action-group\.tools \.action-btn \{([^}]+)\}/)[1];
assert.match(toolButtonStyle, /min-height: 60px;/, 'All four task actions have the same minimum height');
assert.match(html, /\.action-group\.tools #gradingButton \{[^}]*grid-column: 1 \/ -1;/,
  'A lone grading button fills the tools row instead of leaving a crooked empty cell');
assert.match(html, /gradingButton\.hidden = isClosed \|\| !hasGradingCriteria\(currentTask\) \|\| !evaluationMaterialsUnlocked;/,
  'Automatically checked tasks hide grading criteria until the answer is assessed');
const navigationStyle = html.match(/\.action-group\.navigation \{([^}]+)\}/)[1];
assert.match(navigationStyle, /background: transparent;/, 'Navigation buttons do not sit on a dark panel');
assert.match(navigationStyle, /border: 0;/);
assert.match(navigationStyle, /box-shadow: none;/);
const correctionSource = html.slice(html.indexOf('function showCorrection('), html.indexOf('\n}', html.indexOf('function showCorrection(')) + 2);
assert(!correctionSource.includes('Wskazówka:'), 'An incorrect answer does not open the hint automatically');
assert.match(correctionSource, /showMessage\(`Poprawna odpowiedź: \$\{correct\}`\);/);
assert(!html.includes('--tile-result-band'), 'Status no longer uses thick inset bands');
const tileStyle = html.match(/\.tile \{([^}]+)\}/)[1];
assert.match(tileStyle, /min-width: 32px;/);
assert.match(tileStyle, /height: 32px;/);
assert.match(tileStyle, /grid-template-columns: minmax\(12px, auto\);/, 'No extra column for a status icon');
assert.match(html, /\.tile::after \{[^}]*position: absolute;/);
function contrast(a, b) {
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const values = [luminance(a), luminance(b)].sort((a, b) => b-a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
assert.match(html, /\.tile\.nav-theme-homework,\s*\.tile\.nav-theme-revision\s*\{\s*--tile-bg: #ffffff;\s*\}/,
  'Unanswered homework and revision tasks have the same neutral appearance');
for (const [state, color] of Object.entries({good:'#edf7ef', bad:'#fdf0f0', medium:'#fff4e6', skipped:'#edf4fb'})) {
  const selector = `.tile.${state} {`;
  const style = html.slice(html.indexOf(selector)).split('}')[0];
  assert(style.includes(`--tile-bg: ${color};`), `${state} has a subtle result tint`);
  assert(html.indexOf(selector) > html.indexOf('.tile.nav-theme-revision {'), 'Result tints override course themes');
  assert(contrast(color, '#1f2a36') >= 4.5, 'Task numbers remain readable on each result tint');
}
const reviewMarkStyle = html.match(/\.nav-review-mark \{([^}]+)\}/)[1];
assert.match(reviewMarkStyle, /right: -5px;/, 'The discussion bubble sits on the right');
assert(!reviewMarkStyle.includes('left:'), 'No leftover left-side positioning');
assert.match(reviewMarkStyle, /box-sizing: border-box;/);
assert.match(html, /\.tile\.review-requested:is\(\.good, \.medium, \.bad, \.skipped\)::before\s*\{\s*right: 11px;/);
assert.match(html, /\.tile\.review-requested:is\(\.good, \.medium, \.bad, \.skipped\)::after\s*\{\s*right: 13px;/,
  'Result icons stay centered while leaving space for a separate discussion bubble');
for (const selector of ['.action-btn.nav', '.action-btn.nav:hover']) {
  const style = html.slice(html.indexOf(`${selector} {`)).split('}')[0];
  const background = style.match(/background: (#[a-f0-9]{6});/)[1];
  assert(contrast(background, '#ffffff') >= 4.5, 'White navigation labels remain readable');
  assert.match(style, /border-color: #[a-f0-9]{6};/, 'Navigation buttons retain their own border');
}
for (const icon of ['check', 'x', 'minus', 'skip-forward', 'message-circle']) {
  const path = `static/icons/${icon}.svg`;
  assert.match(fs.readFileSync(path, 'utf8'), /viewBox="0 0 24 24"/);
  assert(html.includes(path));
}

const navContext = vm.createContext({
  document:{createElement:() => ({
    classList:{values:new Set(), add(value) {this.values.add(value);}},
    children:[], appendChild(child) {this.children.push(child);},
    attributes:{}, setAttribute(key, value) {this.attributes[key] = value;}
  })},
  getSavedResult:task => task.result, taskThemeClass:() => 'nav-theme-revision',
  taskUsedHint:task => Boolean(task.hint_used),
  navigatorTaskLabel:() => '12', taskLabel:() => 'Zadanie powtórkowe 12',
  resultLabel:result => result || 'nierozwiązane', isActiveNavigatorTask:task => task.active,
  reviewTaskKeys:new Set(['lesson:reviewed.png']), getTaskKey:task => task.key || '',
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
for (const result of ['good', 'bad', 'medium', 'skipped', null]) {
  navContext.addNavigatorTaskButton(container, {key:'lesson:reviewed.png', result}, 0);
  const tile = buttons.at(-1);
  assert(tile.classList.values.has('review-requested'), 'Discussion is independent of answer correctness');
  if (result) assert(tile.classList.values.has(result), 'Keep the existing answer status');
  assert.equal(tile.children.length, 1);
  assert.equal(tile.children[0].className, 'nav-review-mark');
  assert.equal(tile.children[0].attributes['aria-hidden'], 'true');
  assert.match(tile.attributes['aria-label'], /Zgłoszone do omówienia na zajęciach/);
  navContext.addNavigatorTaskButton(container, {key:'lesson:reviewed.png', result, hint_used:true}, 0);
  const hintedTile = buttons.at(-1);
  assert.equal(hintedTile.children.length, 2, 'Hint and discussion markers coexist');
  assert.equal(hintedTile.children[1].className, 'nav-hint-mark');
  assert.equal(hintedTile.children[1].innerText, 'w');
  assert.equal(hintedTile.children[1].attributes['aria-hidden'], 'true');
  assert.match(hintedTile.attributes['aria-label'], /Użyto wskazówki/);
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
  assert.equal(ctx.navigatorRenders || 0, 0, 'Failed requests do not add a marker');
  ctx.apiFetch = async () => ({created:true});
  await ctx.markForReview();
  assert.equal(button.innerText, 'Dodano do omówienia');
  assert.equal(button.disabled, true);
  assert.equal(ctx.reviewTaskKeys.size, 1);
  assert.equal(ctx.navigatorRenders, 1, 'Update the task marker immediately after successful submission');
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
  assert.equal(ctx.navigatorRenders, 3, 'A delayed success still updates its original task marker');
  assert(ctx.reviewTaskKeys.has('lesson:zp1.png'));
  assert(!ctx.reviewTaskKeys.has('lesson:zp2.png'));
  console.log('PASS: course-only difficulty hiding, discussion request races, compact materials, answer order, accessible task statuses and logo caption');
})().catch(error => {console.error(error); process.exitCode = 1;});
