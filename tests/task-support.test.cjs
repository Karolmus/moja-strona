const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const ctx = vm.createContext({
  DeltaSigmaCourseVideos:require('../static/course-videos.js'),
  sessionHints:new Map(), sessionResults:new Map(), sessionScores:new Map(),
  getSavedProgressItem:task => task?.saved || null,
  isLoggedInStudent:false, GUEST_PROGRESS_STORAGE_KEY:'fixture-progress',
  currentTask:{sourceId:'lesson', file:'zd1.png', hint:'Hint'},
  currentTaskAnswered:false, hintUsed:false, isCoursePreviewMode:() => false,
  STUDENT_WORK_COURSE_PARTS:['praca_domowa', 'zadania_powtorkowe'],
  sessionStorage:{getItem:() => ctx.stored, setItem:(key, value) => {ctx.stored = value;}},
  renderTaskNavigator:() => {ctx.renders = (ctx.renders || 0) + 1;},
  showMessage:message => {ctx.message = message;}
});
for (const name of ['getTaskKey', 'taskUsedHint', 'loadGuestSessionProgress', 'saveGuestSessionProgress', 'showHint', 'taskVideoUrl']) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), ctx);
}
ctx.showHint();
assert(ctx.taskUsedHint(ctx.currentTask));
assert.equal(ctx.renders, 1, 'Opening a hint immediately updates its marker');
assert.equal(ctx.message, 'Hint');
ctx.sessionHints.clear();
ctx.loadGuestSessionProgress();
assert(ctx.taskUsedHint(ctx.currentTask), 'Guest reload retains hint usage');
assert(!ctx.taskUsedHint({sourceId:'other', file:'zd1.png'}), 'Hint usage is isolated by source');
ctx.sessionHints.clear();
ctx.currentTask.saved = {hint_used:true};
assert(ctx.taskUsedHint(ctx.currentTask), 'Student progress restores a saved hint');
ctx.sessionHints.set('lesson:zd1.png', false);
assert(!ctx.taskUsedHint(ctx.currentTask), 'Current-attempt flags take precedence');
ctx.currentTaskAnswered = true;
ctx.showHint();
assert(!ctx.taskUsedHint(ctx.currentTask), 'A hint opened after submitting does not relabel the completed answer');
ctx.stored = '{bad json';
ctx.loadGuestSessionProgress();
assert.equal(ctx.sessionHints.size, 0);
ctx.stored = JSON.stringify({results:[['old:1.png', 'medium']]});
ctx.loadGuestSessionProgress();
assert.equal(ctx.sessionHints.size, 0, 'Old data does not infer hints from a medium result');
assert.match(html, /hintUsed = taskUsedHint\(taskToRender\);/, 'Returning to a task restores its hint flag');
assert(html.indexOf('id="categorySection"') < html.indexOf('id="guestLevelWrapper"'));
assert(html.indexOf('id="categorySection"') < html.indexOf('id="sourceList"'));
assert.equal((html.match(/id="categorySection"/g) || []).length, 1);

const tasks = JSON.parse(fs.readFileSync('zadania/kurs/mp/lekcja_1/lekcja_1_potegi_i_pierwiastki.json'));
const ids = ['F--EfH1oOnE', 'P4f9hTNHzOI', 'zyHpSu21XwM', 'z36E8at2ZRk', 'AqwufB6fwsk',
  'oVL-IEnhkGE', 'xTiCMY-GuNg', 'p8_a0kdgthk', 'kchdgynCMxA', 'lb2TUCiLM8g'];
for (const [index, id] of ids.entries()) {
  const task = {...tasks.find(task => task.file === `zd${index + 1}.png`), category:'kurs'};
  assert.equal(ctx.taskVideoUrl(task), `https://youtu.be/${id}`);
  const staleTask = {...task, sourceId:'zadania/kurs/mp/lekcja_1/lekcja_1_potegi_i_pierwiastki.json'};
  delete staleTask.videoUrl;
  assert.equal(ctx.taskVideoUrl(staleTask), `https://youtu.be/${id}`, 'Videos work with an older course server');
  assert.equal(ctx.taskVideoUrl({...staleTask, sourceId:'zadania/kurs/mp/lekcja_2/lekcja_2_logarytmy.json'}), '');
  for (const invalid of ['javascript:alert(1)', 'https://youtu.be.evil.test/abc', 'http://youtu.be/' + id]) {
    assert.equal(ctx.taskVideoUrl({...task, videoUrl:invalid}), '');
  }
  assert.equal(ctx.taskVideoUrl({...task, category:'egzaminy'}), '');
  assert.equal(ctx.taskVideoUrl({...task, level:'egzamin_osmoklasisty'}), '');
  assert.equal(ctx.taskVideoUrl({...task, coursePart:'zadania'}), '');
}
assert.equal(tasks.filter(task => task.videoUrl).length, 10);
assert(!tasks.find(task => task.file === 'zd11.png').videoUrl);
assert.match(html, /id="taskVideoLink"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
assert.match(html, /else videoLink\.removeAttribute\("href"\);/, 'No stale link on the next task');
console.log('PASS: hint flags, guest persistence, student restore, mode ordering and ten exact lesson video links');
