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
    canvasToPngBlob:async canvas => { calls.push(['size', canvas.width, canvas.height]); return png; },
  });
  load(ctx, 'reviewTaskTitle', 'taskDisplayTitle', 'progressSourceId', 'isProtectedCoursePath',
    'taskNumberFromFile', 'sourceYear', 'numberValue', 'formatPoints', 'taskCompletionPercent',
    'reviewTaskPrintHeader', 'wrapReviewHeading', 'reviewWorksheetPages', 'renderReviewWorksheetPage', 'reviewTasksClipboardBlob');
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

test('large worksheets are split into bounded PNGs without dropping, reordering or scaling source images', async () => {
  const {ctx, calls, images, png} = worksheetFixture();
  const samples = images.slice();
  const many = Array.from({length:40}, (_, index) => ({...items[index % 3], id:index+1}));
  images.splice(0, images.length, ...many.map((item,index) => ({...samples[index % 3], id:item.id})));
  let pages;
  assert.equal(await ctx.reviewTasksClipboardBlob(many, prepared => {pages = prepared;}), png);
  assert(pages.length > 1);
  for (const page of pages) await page.getBlob();
  const sizes = calls.filter(call => call[0] === 'size');
  assert.equal(sizes.length, pages.length);
  for (const [,width,height] of sizes) {
    assert(width <= 4096 && height <= 4096);
    assert(width*height <= 12_000_000);
  }
  const draws = calls.filter(call => call[0] === 'image');
  assert.equal(draws.length,40);
  assert.deepEqual(draws.map(draw => draw[1].id), many.map(item => item.id));
  assert(draws.every(draw => draw.length === 4 && Number.isInteger(draw[2]) && Number.isInteger(draw[3])));
  assert.equal(pages.flatMap(page => page.titles).length,40);
  for (const page of pages) await page.getBlob();
  assert.equal(calls.filter(call => call[0] === 'image').length,40,'A repeated copy reuses the same lossless PNG');
});

test('empty or undecoded images fail explicitly instead of producing a low-resolution placeholder', async () => {
  const {ctx, images, calls} = worksheetFixture();
  await assert.rejects(ctx.reviewTasksClipboardBlob([]),/Brak zadań/);
  images[0].naturalWidth = 0;
  await assert.rejects(ctx.reviewTasksClipboardBlob(items),/pełnego obrazu/);
  assert.equal(calls.filter(call => call[0] === 'image').length,0);
});

test('large copy opens prepared parts without requesting clipboard access during asynchronous rendering', async () => {
  const events = [], pages = [{},{}];
  const ctx = vm.createContext({
    setTimeout, clearTimeout,
    navigator:{clipboard:{write:async ([entry]) => {await entry.data['image/png']; events.push('copied');}}},
    ClipboardItem:class {constructor(data) {this.data=data;}}, window:{ClipboardItem:true},
    reviewTasksClipboardBlob:async (_items, ready) => {ready(pages); return {type:'image/png'};},
    showStatus:message => events.push(message), showReviewClipboardPages:(prepared, description) => {
      assert.equal(prepared,pages); assert.equal(description,'do omówienia'); events.push('parts');
    }
  });
  load(ctx,'writeReviewClipboardPng','copyAllReviewTaskImages');
  const control={innerText:'Kopiuj wszystkie',disabled:false,dataset:{}};
  await ctx.copyAllReviewTaskImages(items,control);
  assert.deepEqual(events,['parts']);
  assert.equal(control.disabled,false);
});

test('copy dialog supports sequential parts, revisiting, errors and closing without modifying student records', async () => {
  const elements = Object.fromEntries(['status','titles','counter','previous','next','part','close'].map(name => [name,{
    children:[],replaceChildren(){this.children=[];},appendChild(child){this.children.push(child);},focus(){this.focused=true;}
  }]));
  const dialog={open:false,querySelector:selector => elements[selector.match(/data-copy-(\w+)/)[1]],
    showModal(){this.open=true;},close(){this.open=false;this.onclose?.();}};
  const title={};
  const writes=[];
  let fail=false;
  const ctx=vm.createContext({
    setTimeout, clearTimeout,
    document:{getElementById:id => id==='reviewCopyDialog' ? dialog : title,createElement:() => ({})},
    navigator:{clipboard:{write:async ([entry]) => {if(fail)throw Error('Brak dostępu');writes.push(await entry.data['image/png']);}}},
    ClipboardItem:class {constructor(data){this.data=data;}}
  });
  load(ctx,'writeReviewClipboardPng','showReviewClipboardPages');
  const pages=Array.from({length:3},(_,index)=>({blob:index+1,titles:[`Zadanie ${index+1}`],getBlob:async()=>index+1}));
  ctx.showReviewClipboardPages(pages,'do omówienia');
  assert.equal(dialog.open,true);
  assert.equal(title.textContent,'Zadania do omówienia');
  assert.equal(elements.counter.textContent,'1 / 3');
  assert.equal(elements.part.focused,true);
  assert.equal(elements.titles.children[0].textContent,'Zadanie 1');
  await elements.part.onclick();
  assert.deepEqual(writes,[1]);
  assert.equal(elements.counter.textContent,'2 / 3');
  fail=true;
  await elements.part.onclick();
  assert.equal(elements.status.textContent,'Brak dostępu');
  assert.equal(elements.part.disabled,false);
  fail=false;
  await elements.part.onclick();
  assert.deepEqual(writes,[1,2]);
  await elements.part.onclick();
  assert.deepEqual(writes,[1,2,3]);
  assert.equal(elements.status.textContent,'Skopiowano 3 z 3 części.');
  elements.previous.onclick();
  elements.previous.onclick();
  assert.equal(elements.counter.textContent,'1 / 3');
  assert.equal(elements.previous.disabled,true);
  await elements.part.onclick();
  assert.deepEqual(writes,[1,2,3,1]);
  elements.close.onclick();
  assert.equal(dialog.open,false);
  assert.equal(elements.part.onclick,null);
  assert.equal(elements.titles.children.length,0);
  ctx.showReviewClipboardPages(pages,'błędnie wykonane');
  assert.equal(title.textContent,'Błędne zadania');
  assert.match(elements.part.className,/copy-incorrect/);
  dialog.close();
});

test('all bulk copy controls have distinct highlighted styles and a copy icon', () => {
  assert.match(html,/class="btn copy-tasks copy-incorrect" type="button" id="copyIncorrectTasksBtn"/);
  assert(html.includes('copy.className = `btn copy-tasks ${description === "do omówienia" ? "copy-review" : "copy-incorrect"}`;'));
  assert(html.includes('button("Kopiuj wszystkie", "btn copy-tasks copy-review"'));
  assert.match(html,/mask: url\("static\/icons\/copy.svg"\)/);
  assert(!html.slice(html.indexOf('function renderCampaignLinks('),html.indexOf('\n}',html.indexOf('function renderCampaignLinks('))).includes('description ==='));
});

test('a single PNG is prepared before writing and recovers the copy control afterwards', async () => {
  let finish;
  let writes = 0;
  const ctx = vm.createContext({
    setTimeout, clearTimeout,
    navigator:{clipboard:{write:async ([entry]) => {writes++; assert.equal(entry.data['image/png'].type,'image/png');}}},
    ClipboardItem:class {constructor(data) {this.data = data;}}, window:{ClipboardItem:true},
    reviewTasksClipboardBlob:() => new Promise(resolve => {finish = resolve;}), showStatus() {},
  });
  load(ctx, 'writeReviewClipboardPng','copyAllReviewTaskImages');
  const control = {disabled:false, innerText:'Kopiuj wszystkie', dataset:{}};
  const pending = ctx.copyAllReviewTaskImages(items, control);
  assert.equal(writes, 0);
  assert.equal(control.disabled, true);
  finish({type:'image/png'});
  await pending;
  assert.equal(writes, 1);
  assert.equal(control.disabled, false);
});

test('Safari clipboard activation errors fall back to a fresh manual click on a prepared PNG', async () => {
  const pages=[{blob:{type:'image/png'}}], opened=[];
  const ctx=vm.createContext({
    setTimeout, clearTimeout,
    navigator:{clipboard:{write:async()=>{const error=Error('No activation');error.name='NotAllowedError';throw error;}}},
    ClipboardItem:class {constructor(data){this.data=data;}},window:{ClipboardItem:true},
    reviewTasksClipboardBlob:async(_items,ready)=>{ready(pages);return pages[0].blob;},
    showStatus:()=>{throw Error('A fresh click should be offered instead of a generic failure');},
    showReviewClipboardPages:(prepared,description)=>opened.push([prepared,description])
  });
  load(ctx,'writeReviewClipboardPng','copyAllReviewTaskImages');
  const control={disabled:false,innerText:'Kopiuj wszystkie',dataset:{}};
  await ctx.copyAllReviewTaskImages(items,control);
  assert.equal(opened.length,1);
  assert.equal(opened[0][0],pages);
  assert.equal(control.disabled,false);
});

test('an unresponsive clipboard times out and does not leave the copy control locked', async () => {
  let expire, cleared=false;
  const status=[];
  const ctx=vm.createContext({
    setTimeout:callback=>{expire=callback;return 1;},clearTimeout:()=>{cleared=true;},
    navigator:{clipboard:{write:()=>new Promise(()=>{})}},
    ClipboardItem:class {constructor(data){this.data=data;}},window:{ClipboardItem:true},
    reviewTasksClipboardBlob:async()=>({type:'image/png'}),showStatus:message=>status.push(message)
  });
  load(ctx,'writeReviewClipboardPng','copyAllReviewTaskImages');
  const control={innerText:'Kopiuj wszystkie',dataset:{},disabled:false};
  const copying=ctx.copyAllReviewTaskImages(items,control);
  await new Promise(setImmediate);
  expire();
  await copying;
  assert.equal(control.disabled,false);
  assert.equal(cleared,true);
  assert.match(status[0],/nie potwierdziła skopiowania/);
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
