const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('admin.html', 'utf8');

function load(context, ...names) {
  for (const name of names) {
    const start = html.indexOf(`function ${name}(`);
    assert(start >= 0, name);
    const declaration = html.slice(start - 6, start) === 'async ' ? start - 6 : start;
    vm.runInContext(html.slice(declaration, html.indexOf('\n}', start) + 2), context);
  }
}

const source = 'zadania/kurs/mp/lekcja_1/lesson.json';
const tasks = ['zd1.png','zd2.png','zp1.png'].map((file, index) => ({
  file, sourceId:source, category:'kurs', level:'matura_podstawowa', sourceLabel:'Lekcja 1',
  title:`Lekcja 1 - praca domowa ${index + 1}`, topic:'potęgi-i-pierwiastki',
  coursePart:file.startsWith('zd') ? 'praca_domowa' : 'zadania_powtorkowe', maxPoints:2,
}));
const items = tasks.map((task, index) => ({id:index + 1, source_id:source, file:task.file, task,
  created_at:'2026-10-12T10:00:00Z'}));

function worksheetFixture() {
  const calls = [];
  const context2d = {
    measureText:text => ({width:text.length * 13}),
    fillRect(...args) {calls.push(['rect', this.fillStyle, ...args]);},
    fillText(...args) {calls.push(['text', ...args]);},
    drawImage(...args) {calls.push(['image', ...args]);},
    createLinearGradient() {return {addColorStop:(...args) => calls.push(['stop', ...args])};},
    beginPath() {}, roundRect() {}, fill() {}, stroke() {},
  };
  const canvas = {getContext:() => context2d};
  const images = [{naturalWidth:2400,naturalHeight:460}, {naturalWidth:1180,naturalHeight:300},
    {naturalWidth:2100,naturalHeight:520}];
  const png = {type:'image/png'};
  const ctx = vm.createContext({
    document:{createElement:tag => {assert.equal(tag, 'canvas'); return canvas;}},
    adminCatalogCache:new Map([[source,tasks]]), catalogTaskForProgress:item => item.task,
    clipboardImageBlob:async item => images[item.id - 1], blobToImage:async image => image,
    canvasToPngBlob:async () => png,
  });
  load(ctx, 'reviewTaskTitle', 'taskDisplayTitle', 'progressSourceId', 'isProtectedCoursePath',
    'taskNumberFromFile', 'sourceYear', 'numberValue', 'formatPoints', 'taskCompletionPercent',
    'reviewTaskPrintHeader', 'wrapReviewHeading', 'reviewTasksClipboardBlob');
  return {ctx, calls, canvas, images, png};
}

test('worksheet PNG draws all task images at their source size and leaves six scratch rows after each', async () => {
  const {ctx, calls, canvas, images, png} = worksheetFixture();
  assert.equal(await ctx.reviewTasksClipboardBlob(items), png);
  assert(canvas.width > 2400, 'No width limit downscales the source images');
  const draws = calls.filter(call => call[0] === 'image');
  assert.equal(draws.length, items.length);
  for (const [index, draw] of draws.entries()) {
    assert.equal(draw.length, 4, 'drawImage uses no resize arguments');
    assert.equal(draw[1], images[index]);
    const start = calls.indexOf(draw);
    const next = index + 1 < draws.length ? calls.indexOf(draws[index+1]) : calls.length;
    const scratch = calls.slice(start + 1, next).filter(call => call[0] === 'rect' && call[1] === '#d9e5ef' && call[5] === 1);
    assert.equal(scratch.length, 7, 'Seven horizontal lines create six rows below each task');
    assert(scratch[0][3] > draw[3] + images[index].naturalHeight);
    assert(scratch.at(-1)[3] < (draws[index + 1]?.[3] ?? canvas.height));
  }
  const text = calls.filter(call => call[0] === 'text').map(call => call[1]);
  assert(text.includes('Lekcja 1 - zadanie domowe 2'));
  assert(text.includes('Lekcja 1 - zadanie powtórkowe 1'));
  assert(text.includes('potęgi i pierwiastki'));
  assert(text.includes('0-2 pkt'));
  assert(!text.some(line => line.includes('2026')));
  assert(calls.some(call => call[0] === 'stop' && call[2] === '#d99595'));
  assert(calls.some(call => call[0] === 'stop' && call[2] === '#ecd0b2'));
});

test('an oversized worksheet reports a clear error instead of shrinking or writing a blank image', async () => {
  const {ctx, images} = worksheetFixture();
  images[0].naturalHeight = 33000;
  await assert.rejects(ctx.reviewTasksClipboardBlob(items), /za duży.*pełnej jakości/);
});

test('clipboard write starts while the click is active, before image preparation finishes', async () => {
  let finish;
  let writes = 0;
  const ctx = vm.createContext({
    navigator:{clipboard:{write:async ([entry]) => {writes++; await entry.data['image/png'];}}},
    ClipboardItem:class {constructor(data) {this.data = data;}}, window:{ClipboardItem:true},
    reviewTasksClipboardBlob:() => new Promise(resolve => {finish = resolve;}), showStatus() {},
  });
  load(ctx, 'copyAllReviewTaskImages');
  const control = {disabled:false, innerText:'Kopiuj wszystkie', dataset:{}};
  const pending = ctx.copyAllReviewTaskImages(items, control);
  assert.equal(writes, 1);
  assert.equal(control.disabled, true);
  finish({type:'image/png'});
  await pending;
  assert.equal(control.disabled, false);
});

test('bulk clearing asks about the current student, sends only the confirmed items and refreshes both lists', async () => {
  const student = {id:7,display_name:'Uczeń testowy',review_count:3};
  const calls = [], rendered = [];
  const ctx = vm.createContext({
    activeProgressStudentId:7, activeReviewItems:items, students:[student], studentProgressCache:new Map([[7,[{result:'good'}]]]),
    confirmReviewResolution:async (person,count) => {assert.equal(person,student); assert.equal(count,3); return false;},
    apiFetch:async (path, options) => {calls.push([path, options]); return {resolved_count:3,review_tasks:[]};},
    isIndependentWorkProgress:() => true, renderReviewTasks:list => rendered.push(list),
    renderSourceProgress:(_progress,_student,reviews) => rendered.push(reviews), renderStudents() {}, showStatus() {},
  });
  load(ctx, 'resolveAllReviewTasks');
  const control = {disabled:false};
  const status = {hidden:true};
  await ctx.resolveAllReviewTasks(items, student, control, status);
  assert.equal(calls.length, 0);
  ctx.confirmReviewResolution = async () => true;
  await ctx.resolveAllReviewTasks(items, student, control, status);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/admin/students/7/review-tasks');
  assert.equal(calls[0][1].method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0][1].body), {resolve_ids:[1,2,3]});
  assert.deepEqual(rendered, [[],[]]);
  assert.equal(student.review_count, 0);
  assert.equal(control.disabled, false);
  ctx.apiFetch = async () => {throw new Error('Brak połączenia');};
  await ctx.resolveAllReviewTasks(items, student, control, status);
  assert.equal(status.hidden, false);
  assert.equal(status.textContent, 'Brak połączenia');
  assert.equal(control.disabled, false);
  assert.match(html, /<dialog[^>]+id="reviewResolveDialog"/);
  assert.match(html, /value="cancel" autofocus>Anuluj/);
});
