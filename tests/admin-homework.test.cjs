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
assert.match(html, /progress.filter\(isIndependentWorkProgress\).slice\(0, 12\)/);
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
assert.match(html, /<th>Poprawne odpowiedzi<\/th>/);
assert.match(html, /formatPoints\(group\.correctPercent\)/);
assert(!html.includes('review-copy-hint'), 'Repeated copy instructions no longer inflate every row');
for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
console.log('PASS: homework-only course details, review exercises, exam retention, fallback metadata and compact list limits');
