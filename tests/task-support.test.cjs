const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const ctx = vm.createContext({
  DeltaSigmaCourseVideos:require('../static/course-videos.js'),
  sessionHints:new Map(), sessionResults:new Map(), sessionScores:new Map(),
  sessionSubmittedAnswers:new Map(),
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
assert.equal(ctx.sessionSubmittedAnswers.size, 0, 'Guest reload accepts sessions without submitted text answers');
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
const ids = ['aPCigoGzueA', 'pCl_cdbpZFU', 'lfndkPh6Ldo', 'Lp1LRBeuoXo', 'jH5GjJWyexo',
  'Tu_nYOHyG8g', 'OGh-tSIzhwQ', 'IvUO7B6OSHc', '36NMNmJcsrs', 'li3Ob3DbGlc', 'LqsuHFqJAcM'];
for (const [index, id] of ids.entries()) {
  const task = {...tasks.find(task => task.file === `zd${index + 1}.png`), category:'kurs'};
  assert.equal(ctx.taskVideoUrl(task), `https://youtu.be/${id}`);
  const staleTask = {...task, sourceId:'zadania/kurs/mp/lekcja_1/lekcja_1_potegi_i_pierwiastki.json'};
  delete staleTask.videoUrl;
  assert.equal(ctx.taskVideoUrl(staleTask), `https://youtu.be/${id}`, 'Videos work with an older course server');
  assert.equal(ctx.taskVideoUrl({...staleTask, videoUrl:'https://youtu.be/F--EfH1oOnE'}), `https://youtu.be/${id}`,
    'Updated links take precedence over old URLs returned by the course server');
  assert.equal(ctx.taskVideoUrl({...staleTask, sourceId:'other-course.json'}), '');
  for (const invalid of ['javascript:alert(1)', 'https://youtu.be.evil.test/abc', 'http://youtu.be/' + id]) {
    assert.equal(ctx.taskVideoUrl({...task, videoUrl:invalid}), '');
  }
  assert.equal(ctx.taskVideoUrl({...task, category:'egzaminy'}), '');
  assert.equal(ctx.taskVideoUrl({...task, level:'egzamin_osmoklasisty'}), '');
  assert.equal(ctx.taskVideoUrl({...task, coursePart:'zadania'}), '');
}
assert.equal(tasks.filter(task => task.videoUrl).length, 11);
assert.equal(tasks.find(task => task.file === 'zd11.png').videoUrl, 'https://youtu.be/LqsuHFqJAcM');
assert.equal(new Set(ids).size, 11);
const lesson2Source = 'zadania/kurs/mp/lekcja_2/lekcja_2_logarytmy.json';
const lesson2Tasks = JSON.parse(fs.readFileSync(lesson2Source));
const lesson2Ids = {
  'zd1.png':'ruS71LSl4zA', 'zd2.png':'ZoXMbi_WkPg', 'zd3.png':'3WvnwKgRsNI',
  'zd4.png':'A7lWXFDyaLg', 'zd5.png':'owJCmFosvUU', 'zd6.png':'Kkfjkaz2ZyE',
  'zd7.png':'6DQ0WyYSnss', 'zd8.png':'sfvE02TOX2Q', 'zd9.png':'yanrhdVLVt8',
  'zd10.png':'Ll5h80p-Gok', 'zd11.png':'SxuyXeRGEzE', 'zd12.png':'G66o1cvhLVM',
  'zd13.png':'idQ6qX4o_wo', 'zd14.png':'6ceSixJSO70',
  'zp1.png':'AcJAeI0Gxag', 'zp2.png':'7DmXDqnsiOU', 'zp3.png':'mfuIhxDVwgA', 'zp4.png':'r8gCPmYQ388'
};
assert.equal(lesson2Tasks.filter(task => task.videoUrl).length, 18);
assert.equal(new Set(Object.values(lesson2Ids)).size, 18);
for(const task of lesson2Tasks){
  const expected = lesson2Ids[task.file] ? `https://youtu.be/${lesson2Ids[task.file]}` : '';
  assert.equal(task.videoUrl || '', expected, task.file);
  assert.equal(ctx.taskVideoUrl({...task, sourceId:lesson2Source, category:'kurs'}), expected);
  const staleTask = {...task, sourceId:lesson2Source, category:'kurs'};
  delete staleTask.videoUrl;
  assert.equal(ctx.taskVideoUrl(staleTask), expected, 'Lesson 2 films work before a course-server refresh');
  if(expected) assert.equal(task.coursePart, task.file.startsWith('zp') ? 'zadania_powtorkowe' : 'praca_domowa');
}
assert.equal(Object.keys(ctx.DeltaSigmaCourseVideos[lesson2Source]).length, 18);
assert.match(html, /<button[^>]*id="taskVideoLink"[^>]*aria-haspopup="dialog"/);
assert.match(html, /videoLink.hidden = !videoUrl;/, 'Hide the video command on tasks without a film');
console.log('PASS: hint flags, guest persistence, student restore, mode ordering and 29 exact lesson video links');
