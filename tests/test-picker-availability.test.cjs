const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('zadania.html', 'utf8');

function source(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}

function element() {
  return {children:[], classList:{toggle(){}, add(){}},
    appendChild(child) {this.children.push(child);},
    setAttribute(name,value) {this[name] = value;}};
}

function fixture() {
  const start = html.indexOf('const TASK_SOURCES =');
  const sources = vm.runInNewContext(html.slice(start, html.indexOf('\n];',start) + 3) + '\nTASK_SOURCES');
  const notice = {hidden:true, textContent:''};
  const ctx = vm.createContext({TASK_SOURCES:sources, selectedCategory:'testy',
    selectedLevel:'egzamin_osmoklasisty', MONTH_LABELS:{}, SOURCE_TYPE_LABELS:{},
    SOURCE_LEVELS:{mp:'matura_podstawowa', mr:'matura_rozszerzona', eo:'egzamin_osmoklasisty'},
    isCourseSourceVisible:() => true,
    document:{createElement:element, getElementById:id => id === 'sourceSelectionNotice' ? notice : null},
    setSource:id => {ctx.selected = id;}
  });
  for (const name of ['getSourceMeta','getSourceMetaById','sourceDisplayCategory','getAvailableSources',
    'getSourcePickerSources','courseTestRange','courseTestVariant','courseTestLockReason','addSourceButton']) {
    vm.runInContext(source(name),ctx);
  }
  return {ctx,notice};
}

test('EO shows A, B and C once while only available tests may start; other course catalogs stay separate', () => {
  const {ctx} = fixture();
  assert.deepEqual(Array.from(ctx.getSourcePickerSources(),ctx.courseTestVariant),
    ['Test 1-6 (A)','Test 1-6 (B)','Test 1-6 (C)']);
  assert.deepEqual(Array.from(ctx.getAvailableSources(),ctx.courseTestVariant),['Test 1-6 (A)','Test 1-6 (B)','Test 1-6 (C)']);
  assert.deepEqual(Array.from(ctx.getAvailableSources(),source => source.difficultyRating),[5,5,8]);
  ctx.selectedLevel = 'matura_podstawowa';
  assert.deepEqual(Array.from(ctx.getSourcePickerSources(),ctx.courseTestVariant),['Test 1-6 (A)']);
  ctx.selectedCategory = 'egzaminy';
  const exams = ctx.getSourcePickerSources();
  assert(exams.length > 1);
  assert(exams.every(item => item.category === 'egzaminy' && item.level === ctx.selectedLevel));
  assert(exams.every((item,index) => index === 0 || item.year <= exams[index - 1].year));
  ctx.selectedCategory = 'kurs';
  assert(ctx.getSourcePickerSources().every(item => item.kind !== 'test'));
});

test('optional tiles are selectable without notifications or score requirements', () => {
  const {ctx,notice} = fixture();
  const list = element();
  for (const item of ctx.getSourcePickerSources()) {
    const reason = ctx.isCourseSourceVisible(item) ? '' : ctx.courseTestLockReason(item);
    ctx.addSourceButton(list,item.id,ctx.courseTestVariant(item),'',false,'',false,'',item.kind,reason);
  }
  const [a,b,c] = list.children;
  assert.equal(a['aria-disabled'],'false');
  assert.equal(b['aria-disabled'],'false');
  assert.equal(c['aria-disabled'],'false');
  assert.deepEqual(b.children.map(child => child.innerText),['Test 1-6 (B)']);
  assert(!b.title.includes('%'));
  assert(!c.title.includes('%'));
  b.onclick();
  assert(ctx.selected.includes('/test_lekcje_1_6_b/'));
  assert.equal(notice.hidden,true);
  c.onclick();
  assert(ctx.selected.includes('trudniejszy'));
  a.onclick();
  assert(ctx.selected.includes('/test_lekcje_1_6/'));
});

test('unlocking and admin preview make existing optional tiles selectable without duplicate entries', () => {
  const {ctx} = fixture();
  ctx.isCourseSourceVisible = () => true;
  const list = element();
  for (const item of ctx.getSourcePickerSources()) {
    ctx.addSourceButton(list,item.id,ctx.courseTestVariant(item),'',false,'',false,'',item.kind,'');
  }
  assert.equal(list.children.length,3);
  for (const button of list.children) {
    assert.equal(button['aria-disabled'],'false');
    button.onclick();
  }
  assert(ctx.selected.includes('trudniejszy'));
  assert.match(html,/source\.kind === "test" && !isCourseSourceVisible\(source\) \? courseTestLockReason\(source\) : ""/);
  assert.match(html,/id="sourceSelectionNotice" role="status" hidden/);
});

test('desktop exams span the page above tasks and retain full-width tags and responsive year groups', () => {
  const desktop = html.split('@media(min-width: 761px) {')[1].split('@media(max-width: 1100px) {')[0];
  assert.match(desktop,/\.tasks-layout:has\(\.exam-source-list\) \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(desktop,/\.tasks-layout:has\(\.exam-source-list\) \.task-sidebar \{[^}]*position: static;/);
  assert.match(desktop,/#categorySection, \.selector-grid, #tagSearchSection\) \{\s*grid-column: 1 \/ -1;/);
  assert.match(html,/\.task-sidebar:has\(\.exam-source-list\) \.selector-grid \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(html,/\.task-sidebar:has\(\.exam-source-list\) \.level-selector \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert(html.indexOf('id="sourceList"') < html.indexOf('class="task-card"'));
});
