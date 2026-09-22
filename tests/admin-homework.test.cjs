const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('admin.html', 'utf8');
const source = 'zadania/kurs/mp/lekcja_2/lekcja_2_logarytmy.json';
const catalog = JSON.parse(fs.readFileSync(source)).map(task => ({...task, category:'kurs', sourceId:source, sourceLabel:'Lekcja 2'}));
catalog.push({sourceId:'exam.json', file:'1.png', category:'egzaminy', level:'matura_podstawowa', maxPoints:1});
const ctx = vm.createContext({adminTaskCatalog:catalog, ADMIN_TASK_SOURCES:[{path:source}]});
for (const name of ['progressSourceId', 'progressFile', 'progressTaskKey', 'isProtectedCoursePath', 'catalogTaskForProgress',
  'isIndependentWorkTask', 'isIndependentWorkProgress', 'latestProgressMap', 'numberValue', 'taskMaxPoints',
  'inferredTaskScore', 'sourceYear', 'taskNumberFromFile', 'taskOrderValue', 'timestamp', 'sourceProgressGroups',
  'coursePartProgress',
  'taskPreviewImagePaths']) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), ctx);
}
const progress = catalog.map(task => ({source_id:task.sourceId, file:task.file, result:'good', created_at:'2026-09-10T10:00:00Z'}));
const visible = progress.filter(ctx.isIndependentWorkProgress);
assert.equal(visible.length, 19, 'Fourteen homework, four review exercises and one exam task remain');
assert(!ctx.isIndependentWorkProgress({source_id:source, file:'1.png', course_part:'praca_domowa'}), 'The catalog is authoritative');
assert(ctx.isIndependentWorkProgress({source_id:'zadania/kurs/unknown.json', file:'zd1.png'}));
assert(ctx.isIndependentWorkProgress({source_id:'zadania/kurs/unknown.json', file:'zp1.png'}));
assert(!ctx.isIndependentWorkProgress({source_id:'zadania/kurs/unknown.json', file:'1.png'}));
assert(!ctx.isIndependentWorkProgress({source_id:'zadania/kurs/unknown.json', file:'zd1.png', course_part:'zadania'}));
assert(ctx.isIndependentWorkProgress({source_id:'zadania/kurs/unknown.json', file:'custom.png', course_part:'praca_domowa'}));
const groups = ctx.sourceProgressGroups(progress, {level:'matura_podstawowa'});
const course = groups.find(group => group.category === 'kurs');
assert.equal(course.total, 18);
assert.equal(course.attempted, 18);
assert.equal(course.totalPoints, 18);
assert.equal(course.correctPercent, 100);
assert(course.completed);
const homeworkPart = ctx.coursePartProgress(course, 'praca_domowa');
const revisionPart = ctx.coursePartProgress(course, 'zadania_powtorkowe');
assert.equal(homeworkPart.total, 14);
assert.equal(revisionPart.total, 4);
assert.equal(homeworkPart.correctPercent, 100);
assert.equal(revisionPart.correctPercent, 100);
assert.deepEqual(Array.from(course.tasks, task => task.file), [
  ...Array.from({length:14}, (_, index) => `zd${index+1}.png`), 'zp1.png', 'zp2.png', 'zp3.png', 'zp4.png'
], 'Review exercises follow the homework, without interleaving task numbers');
const mixedProgress = course.tasks.slice(0, 3).map((task, index) => ({
  source_id: task.sourceId,
  file: task.file,
  result: ['good', 'bad', 'medium'][index],
  created_at: '2026-09-10T10:00:00Z'
}));
const mixedCourse = ctx.sourceProgressGroups(mixedProgress, {level:'matura_podstawowa'})[0];
assert.equal(mixedCourse.correctPercent, 33.3, 'Correct rate uses submitted answers, not every task in the lesson');
assert.equal(ctx.coursePartProgress(mixedCourse, 'praca_domowa').correctPercent, 33.3);
assert.equal(ctx.coursePartProgress(mixedCourse, 'zadania_powtorkowe').correctPercent, null);
const revisionOnly = ctx.sourceProgressGroups([{source_id:source, file:'zp1.png', result:'bad'}], {level:'matura_podstawowa'})[0];
assert.equal(ctx.coursePartProgress(revisionOnly, 'praca_domowa').attempted, 0);
assert.equal(ctx.coursePartProgress(revisionOnly, 'zadania_powtorkowe').bad, 1);
assert.equal(groups.find(group => group.category === 'egzaminy').total, 1);
const onlyMain = progress.filter(item => /^\d/.test(item.file) && item.source_id === source);
assert.equal(ctx.sourceProgressGroups(onlyMain, {level:'matura_podstawowa'}).length, 0, 'Main lesson work cannot start homework progress');
const reviewOnlyGroups = ctx.sourceProgressGroups([], {level:'matura_podstawowa'}, [
  {source_id:source, file:'zd2.png'}
]);
assert.equal(reviewOnlyGroups.length, 1, 'A review request opens the lesson even without a submitted answer');
assert.equal(reviewOnlyGroups[0].attempted, 0);
assert.equal(reviewOnlyGroups[0].correctPercent, null);
assert.equal(reviewOnlyGroups[0].reviewRequested, 1);
assert.equal(reviewOnlyGroups[0].tasks.find(task => task.file === 'zd2.png').reviewRequested, true);
assert.match(html, /function renderReviewTasks\(items, student\)\{\s*items = items.filter\(isIndependentWorkProgress\);/);
assert(!html.includes('Postęp i aktywność'), 'The separate activity panel is removed');
assert(!html.includes('id="progressTitle"'), 'The redundant student progress heading is removed');
assert(!html.includes('class="chart-legend"'), 'The result legend is removed');
assert.match(html, /activity\.className = "lesson-activity"/);
assert.match(html, /\["Łączny czas", formatDuration\(totalDuration\)\]/);
assert.match(html, /\["Średnio na zadanie", formatDuration\(averageDuration\)\]/);
assert.match(html, /\["Ostatnia praca", formatDate\(group\.lastActivity\)\]/);
assert.match(html, /progressItem\?\.created_at \? formatDate\(progressItem\.created_at\)/);
assert.match(html, /\.review-task-list \{[^}]*max-height: 224px;[^}]*overflow-y: auto;/);
assert.match(html, /\.source-task-table-wrap \{[^}]*max-height: 300px;[^}]*overflow: auto;/);
assert.deepEqual(Array.from(ctx.taskPreviewImagePaths({sourceId:source, file:'zd1.png'})),
  ['zadania/kurs/mp/lekcja_2/zd1.png']);
assert.deepEqual(Array.from(ctx.taskPreviewImagePaths({sourceId:source, contextFile:'kontekst.png', file:'zd1.png'})),
  ['zadania/kurs/mp/lekcja_2/kontekst.png', 'zadania/kurs/mp/lekcja_2/zd1.png']);
assert.equal(ctx.taskPreviewImagePaths({sourceId:source, file:'../secret.png'}).length, 0);
assert.match(html, /row\.addEventListener\("click", togglePreview\)/);
assert.match(html, /loadTaskImagePreview\(task, preview\)/);
assert.match(html, /reviewBadge\.textContent = "Dodano do omówienia"/);
assert.match(html, /<th>Praca domowa<\/th>[\s\S]*?<th>Zadania powtórkowe<\/th>/);
assert.match(html, /homework\.appendChild\(renderCoursePartSummary\(group, "praca_domowa"\)\)/);
assert.match(html, /revision\.appendChild\(renderCoursePartSummary\(group, "zadania_powtorkowe"\)\)/);
assert.match(html, /detailCell\.appendChild\(renderSourceDetail\(group\)\)/);
assert.match(html, /partHeading\.textContent = task\.coursePart === "zadania_powtorkowe"/);
assert.match(html, /examGroups\.forEach\(group => \{/);
assert(!html.includes('heading.innerText = "Szczegóły zadań"'), 'The duplicate course cards are removed');

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.style = {};
  }
  set innerHTML(value) {
    this._innerHTML = value;
    if (this.tagName === 'table' && value.includes('<tbody>')) this.tbody = new Element('tbody');
  }
  get innerHTML() {return this._innerHTML;}
  appendChild(child) {this.children.push(child); return child;}
  append(...children) {children.forEach(child => this.appendChild(child));}
  querySelector(selector) {return selector === 'tbody' ? this.tbody : null;}
  setAttribute(name, value) {this.attributes[name] = String(value);}
  addEventListener(name, callback) {this.listeners[name] = callback;}
}
const ui = vm.createContext({
  document:{createElement:tag => new Element(tag)},
  activeSourceDetailKey:'',
  formatPoints:value => String(value),
  formatDate:() => '10.09.2026',
  renderSourceDetail:group => ({sourceKey:group.key})
});
for (const name of ['courseTaskSegment', 'coursePartProgress', 'renderProgressSegments',
  'renderCoursePartSummary', 'renderCourseHistory']) {
  const start = html.indexOf(`function ${name}(`);
  vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), ui);
}
const selected = [];
const courseSection = ui.renderCourseHistory([course], key => selected.push(key));
const collapsedRows = courseSection.children[1].children[0].tbody.children;
assert.equal(collapsedRows.length, 1, 'One compact row represents the whole lesson');
assert.equal(collapsedRows[0].children[1].children[0].children[2].children.length, 14,
  'Homework has its own segmented bar');
assert.equal(collapsedRows[0].children[2].children[0].children[2].children.length, 4,
  'Revision has a separate segmented bar');
collapsedRows[0].listeners.click();
assert.deepEqual(selected, [course.key]);
ui.activeSourceDetailKey = course.key;
const expandedRows = ui.renderCourseHistory([course], () => {}).children[1].children[0].tbody.children;
assert.equal(expandedRows.length, 2);
assert.equal(expandedRows[0].attributes['aria-expanded'], 'true');
assert.equal(expandedRows[1].children[0].children[0].sourceKey, course.key,
  'The task details are rendered immediately below the selected lesson');
const detailUi = vm.createContext({
  document:{createElement:tag => new Element(tag), createTextNode:textContent => ({textContent})},
  raschEstimateForGroup:() => null,
  formatPoints:value => String(value),
  formatDate:() => '10.09.2026',
  formatDuration:value => `${value} s`,
  sumDuration:items => items.reduce((sum, item) => sum + item.duration_seconds, 0),
  paceState:() => ({label:'tempo OK'}),
  inferredTaskScore:() => ({earned:1, max:1}),
  taskCompletionPercent:() => 100,
  taskDisplayTitle:() => 'Zadanie 1',
  resultLabel:() => 'Dobrze'
});
const detailStart = html.indexOf('function renderSourceDetail(');
vm.runInContext(html.slice(detailStart, html.indexOf('\n}', detailStart) + 2), detailUi);
const detail = detailUi.renderSourceDetail({
  category:'kurs', label:'Lekcja 1', detail:'Potęgi', attempted:1, total:1,
  attemptedMaxPoints:1, earnedPoints:1, totalPoints:1,
  firstActivity:'2026-09-10T10:00:00Z', lastActivity:'2026-09-10T10:00:00Z',
  tasks:[{sourceId:source, file:'zd1.png', coursePart:'praca_domowa',
    latestProgress:{result:'good', duration_seconds:40, created_at:'2026-09-10T10:00:00Z'}}]
});
const activity = detail.children.find(child => child.className === 'lesson-activity');
assert(activity, 'Lesson detail contains its own compact activity summary');
assert.deepEqual(Array.from(activity.children, fact => fact.children[0].textContent), [
  'Wykonane: ', 'Łączny czas: ', 'Średnio na zadanie: ', 'Tempo: ', 'Pierwsza praca: ', 'Ostatnia praca: '
]);
assert.equal(activity.children[1].children[1].textContent, '40 s');
assert(!html.includes('review-copy-hint'), 'Repeated copy instructions no longer inflate every row');
for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
console.log('PASS: separate homework and revision results, inline lesson details, exam retention and compact list limits');
