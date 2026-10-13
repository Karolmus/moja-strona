const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('admin.html', 'utf8');

function load(context, names) {
  for (const name of names) {
    const declaration = html.includes(`async function ${name}(`) ? 'async function' : 'function';
    const start = html.indexOf(`${declaration} ${name}(`);
    assert(start >= 0, name);
    vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), context);
  }
}

const source = 'zadania/kurs/mp/lekcja_1/lesson.json';
const tasks = [
  ['zd1.webp', 'bad', 0],
  ['zp1.webp', 'bad', 0],
  ['zd2.webp', 'good', 1],
  ['zd3.webp', 'medium', 1],
  ['zd4.webp', 'medium', 0.5],
  ['zd5.webp', 'video', 0],
  ['zd6.webp', 'bad', null, true],
  ['zd7.webp', null],
  ['zd8.webp', 'bad', 0],
  ['1.webp', 'bad', 0],
].map(([file, result, earned, pending]) => ({
  sourceId:source, sourceLabel:'Lekcja 1', sourceIndex:0, file,
  title:`Lekcja 1 - ${file}`, topic:'Potegi', category:'kurs', level:'matura_podstawowa',
  coursePart:file.startsWith('zp') ? 'zadania_powtorkowe' : file.startsWith('zd') ? 'praca_domowa' : 'zadania',
  teacherGraded:Boolean(pending), maxPoints:1,
  sample:result ? {source_id:source, file, result, earned_points:earned, max_points:1,
    teacher_review_pending:Boolean(pending), created_at:'2026-10-12T10:00:00Z'} : null,
}));
tasks.push({sourceId:'exam.json', file:'1.webp', title:'Egzamin - zadanie 1',
  category:'egzaminy', level:'matura_podstawowa', maxPoints:2, sourceIndex:1,
  sample:{source_id:'exam.json', file:'1.webp', result:'bad', earned_points:0}});
tasks.push({sourceId:'eo.json', file:'zd1.webp', title:'Inny kurs', category:'kurs',
  coursePart:'praca_domowa', level:'egzamin_osmoklasisty', maxPoints:1,
  sample:{source_id:'eo.json', file:'zd1.webp', result:'bad', earned_points:0}});
const context = vm.createContext({adminTaskCatalog:tasks});
load(context, ['progressSourceId', 'progressFile', 'progressTaskKey', 'isProtectedCoursePath',
  'catalogTaskForProgress', 'isIndependentWorkTask', 'isTeacherReviewPending', 'latestProgressMap',
  'numberValue', 'taskMaxPoints', 'inferredTaskScore', 'sourceYear', 'taskNumberFromFile',
  'taskOrderValue', 'timestamp', 'sourceProgressGroups', 'taskDisplayTitle', 'incorrectTaskClipboardItems']);
const progress = tasks.map(task => task.sample).filter(Boolean);
progress.push({source_id:source, file:'zd2.webp', result:'bad', earned_points:0},
  {source_id:source, file:'zd8.webp', result:'good', earned_points:1});
const groups = context.sourceProgressGroups(progress, {level:'matura_podstawowa'});
const items = context.incorrectTaskClipboardItems(groups);
assert.deepEqual(Array.from(items, item => `${item.source_id}:${item.file}`), [
  `${source}:zd1.webp`, `${source}:zd4.webp`, `${source}:zd8.webp`, `${source}:zp1.webp`, 'exam.json:1.webp',
], 'Copy latest incorrect homework, revision and exam answers, including partial credit');
assert.equal(items[0].title, 'Lekcja 1 - zd1.webp');
assert.equal(items[0].created_at, '2026-10-12T10:00:00Z');
assert.equal(context.incorrectTaskClipboardItems([]).length, 0);
assert.equal(context.incorrectTaskClipboardItems(context.sourceProgressGroups(
  [{source_id:source, file:'zd1.webp', result:'medium', hint_used:true}],
  {level:'matura_podstawowa'})).length, 0, 'Correct hinted answers do not count as incorrect');
assert.equal(context.incorrectTaskClipboardItems([{tasks:[{...tasks[6],
  latestProgress:{result:'medium', earned_points:1, max_points:3, teacher_review_pending:false},
}]}]).length, 1, 'Teacher-graded partial answers are included after grading');
assert.match(html, /id="copyIncorrectTasksBtn" disabled>Skopiuj wszystkie błędne zadania/);
assert.match(html, /activeIncorrectTaskItems = incorrectTaskClipboardItems\(groups\)/);
assert.match(html, /copyIncorrectTasksBtn\.disabled = !activeIncorrectTaskItems\.length/);
assert.match(html, /copyAllReviewTaskImages\(activeIncorrectTaskItems, copyIncorrectTasksBtn, "z błędną odpowiedzią"\)/);

async function clipboardTests() {
  const statuses = [];
  const writes = [];
  let fail = false;
  let onPrepare = () => {};
  const png = {type:'image/png'};
  class ClipboardItem {
    constructor(data) {this.data = data;}
  }
  const clipboard = vm.createContext({
    navigator:{clipboard:{write:async entries => {if(fail) throw new Error('Brak dostepu'); writes.push(entries);}}},
    window:{ClipboardItem}, ClipboardItem,
    showStatus:message => statuses.push(message),
    reviewTasksClipboardBlob:async entries => {assert.equal(entries, items); onPrepare(); return png;},
  });
  load(clipboard, ['copyAllReviewTaskImages']);
  const button = {innerText:'Skopiuj wszystkie bledne zadania', disabled:false, dataset:{taskCount:'5'}};
  onPrepare = () => {assert(button.disabled); assert.equal(button.innerText, 'Kopiuję…');};
  await clipboard.copyAllReviewTaskImages(items, button, 'z błędną odpowiedzią');
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0].data['image/png'], png);
  assert.match(statuses.at(-1), /5 zadań z błędną odpowiedzią jako jeden obraz/);
  assert.equal(button.disabled, false);
  assert.equal(button.innerText, 'Skopiuj wszystkie bledne zadania');
  await clipboard.copyAllReviewTaskImages(items, button);
  assert.match(statuses.at(-1), /do omówienia jako jeden obraz/, 'Existing review copying is preserved');
  const previousWrites = writes.length;
  await clipboard.copyAllReviewTaskImages([], button);
  assert.equal(writes.length, previousWrites, 'Do not prepare an empty clipboard image');
  fail = true;
  await clipboard.copyAllReviewTaskImages(items, button);
  assert.equal(statuses.at(-1), 'Brak dostepu');
  assert.equal(button.disabled, false);
  onPrepare = () => {button.dataset.taskCount = '0';};
  await clipboard.copyAllReviewTaskImages(items, button);
  assert.equal(button.disabled, true, 'Changing students while copying cannot enable an empty copy action');
  clipboard.navigator.clipboard = {};
  await clipboard.copyAllReviewTaskImages(items, button);
  assert.match(statuses.at(-1), /Ta przeglądarka nie pozwala/);

  const drawn = [];
  const canvas = {};
  const canvasContext = {fillRect:() => {}, fillText:() => {}, drawImage:image => drawn.push(image)};
  canvas.getContext = () => canvasContext;
  const images = items.map((item, index) => ({item, naturalWidth:800, naturalHeight:200 + index * 10}));
  const combined = vm.createContext({
    clipboardImageBlob:async item => images.find(image => image.item === item), blobToImage:async image => image,
    document:{createElement:tag => {assert.equal(tag, 'canvas'); return canvas;}},
    reviewTaskTitle:item => item.title, reviewTaskMeta:() => 'Lekcja 1', canvasToPngBlob:async () => png,
  });
  load(combined, ['reviewTasksClipboardBlob']);
  assert.equal(await combined.reviewTasksClipboardBlob(items), png);
  assert.equal(drawn.length, items.length, 'Every incorrect task is drawn in the combined clipboard image');
  assert(canvas.width > 0 && canvas.height > 0);
  console.log('PASS: latest incorrect tasks, hinted/video/pending exclusions, partial scores, clipboard and error recovery');
}
clipboardTests().catch(error => {console.error(error); process.exitCode = 1;});
