const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('admin.html', 'utf8');

function setup() {
  const element = () => ({
    hidden:false, textContent:'', innerText:'',
    replaceChildren(){}, appendChild(child){this.child=child;}
  });
  const loading = element();
  const pending = new Map();
  const rendered = [];
  const classes = new Set();
  const context = vm.createContext({
    activeProgressStudentId:null, activeSourceDetailKey:'', progressRequestId:0,
    activeIncorrectTaskItems:[], copyIncorrectTasksBtn:{dataset:{}, disabled:false},
    reviewTasks:element(), sourceProgress:element(), studentProgressCache:new Map(),
    progressDetail:{querySelector:() => loading, classList:{add:c => classes.add(c), remove:c => classes.delete(c)}},
    apiFetch:path => new Promise((resolve,reject) => pending.set(Number(path.split('/')[4]), {resolve,reject})),
    loadReviewTasks:async student => [{owner:student.id}],
    isIndependentWorkProgress:item => item.course_part !== 'zadania',
    renderStudents:() => {}, renderReviewTasks:() => {},
    renderSourceProgress:(progress, student) => rendered.push(student.id),
    document:{getElementById:id => ({focus:() => {context.focused=id;}})},
    button:(label, css, click) => ({label, click})
  });
  for (const name of ['showProgress', 'closeStudentDetails']) {
    const marker = `${name === 'showProgress' ? 'async ' : ''}function ${name}(`;
    const start = html.indexOf(marker);
    assert(start >= 0);
    vm.runInContext(html.slice(start, html.indexOf('\n}', start)+2), context);
  }
  return {context, pending, rendered, loading, classes};
}

test('only the latest expanded student can receive asynchronous progress', async () => {
  const {context:c, pending, rendered} = setup();
  const first = c.showProgress({id:1, display_name:'First'});
  const second = c.showProgress({id:2, display_name:'Second'});
  assert(c.copyIncorrectTasksBtn.disabled, 'Copying is disabled until current student results load');
  pending.get(2).resolve({progress:[]}); await second;
  pending.get(1).resolve({progress:[]}); await first;
  assert.deepEqual(rendered, [2]);
  assert.equal(c.activeProgressStudentId, 2);
  assert(!html.includes('id="progressTitle"'));
});

test('closing cancels pending display and restores keyboard focus', async () => {
  const {context:c, pending, rendered, classes} = setup();
  const first = c.showProgress({id:1, display_name:'First'});
  await c.showProgress({id:1, display_name:'First'});
  pending.get(1).resolve({progress:[]}); await first;
  assert.equal(c.activeProgressStudentId, null);
  assert.equal(c.focused, 'student-toggle-1');
  assert(!classes.has('active'));
  assert(c.copyIncorrectTasksBtn.disabled);
  assert.equal(c.activeIncorrectTaskItems.length, 0);
  assert.deepEqual(rendered, []);
});

test('failed loading keeps the student expanded and supports retry', async () => {
  const {context:c, pending, loading, rendered} = setup();
  const first = c.showProgress({id:1, display_name:'First'});
  pending.get(1).reject(new Error('offline')); await first;
  assert.equal(c.activeProgressStudentId, 1);
  assert.equal(loading.child.label, 'Spróbuj ponownie');
  loading.child.click();
  pending.get(1).resolve({progress:[]});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(rendered, [1]);
  assert(loading.hidden);
});

test('compact accessible rows only build account details when expanded', () => {
  assert.match(html, /class="student-list" id="studentTable"/);
  assert.match(html, /toggle.setAttribute\("aria-expanded", String\(open\)\)/);
  assert.match(html, /toggle.setAttribute\("aria-controls",/);
  assert.match(html, /expanded.hidden = !open/);
  const render = html.slice(html.indexOf('function renderStudents(){'), html.indexOf('async function loadStudents(){'));
  assert(render.indexOf('if(!open) return') < render.indexOf('buildCredentialsCell(student)'));
  assert.match(render, /progressDetail.remove\(\)/);
  assert.match(render, /expanded.append\(progressDetail, overview\)/);
  assert.match(html, /if\(activeProgressStudentId === student.id\)\{\s*activeReviewItems = items\.filter\(isIndependentWorkProgress\);\s*renderReviewTasks\(items, student\);\s*renderSourceProgress/);
  assert.match(html, /const progress = \(studentProgressCache.get\(student.id\) \|\| \[\]\).filter\(isIndependentWorkProgress\)/);
  assert.match(html, /const totalDuration = hasProgress \? sumDuration\(progress\)/);
});

test('expanded student work is visibly separate without changing compact rows or content order', () => {
  assert.match(html, /row\.className = `student-entry\$\{open \? " student-entry--expanded" : ""\}`/);
  assert.match(html, /\.student-entry\.student-entry--expanded\s*\{[^}]*border: 1px solid var\(--student-accent\);[^}]*border-left-width: 4px;/s);
  assert.match(html, /\.student-entry--expanded > \.student-toggle\s*\{[^}]*background: var\(--student-selected\);/s);
  assert.match(html, /\.student-expanded\s*\{[^}]*background: #f1f4f7;/);
  assert.match(html, /\.student-expanded \.source-progress-section,\s*\.student-expanded \.review-tasks\s*\{[^}]*border-top: 2px solid #c4cfda;[^}]*background: white;/s);
  assert.match(html, /\.student-expanded \.student-account-panel\s*\{[^}]*margin-top: 12px;[^}]*border-radius: 0;/s);
  assert.match(html, /\.student-level-eo \{ --student-accent: #7ba25c;/);
  assert.match(html, /\.student-level-mp, \.student-level-mr \{ --student-accent: #9c79b7;/);
  assert.match(html, /\.student-expanded \.course-history-row\[aria-expanded="true"\] > td:first-child\s*\{[^}]*box-shadow: inset 3px 0 0 #6d8ca8;/s);
  assert.match(html, /\.student-toggle\s*\{[^}]*min-height: 36px;/s);
  assert.match(html, /expanded.append\(progressDetail, overview\)/);
});

test('all screen sizes show students before the add-student form and keep the toolbar compact', () => {
  assert.match(html, /class="admin-toolbar"/);
  assert.doesNotMatch(html, /<h1>Panel Admina<\/h1>/);
  assert.doesNotMatch(html, /id="adminEmail"/);
  assert.doesNotMatch(html, /id="logoutBtn"/);
  assert.match(fs.readFileSync('nav.html', 'utf8'), /data-auth-logout[^>]*>Wyloguj<\/button>/);
  assert.match(html, /\.admin-toolbar\s*\{[^}]*display:\s*flex;[^}]*margin-bottom:\s*10px;/s);
  assert.match(html, /\.admin-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/s);
  assert(html.indexOf('class="panel students-panel"') < html.indexOf('<form class="panel" id="studentForm">'));
  assert(html.indexOf('id="studentTable"') < html.indexOf('id="studentForm"'));
  assert.match(html, /\.student-form-fields\s*\{[^}]*grid-template-columns: minmax\(0, 1\.4fr\) repeat\(2, minmax\(0, 1fr\)\) auto;[^}]*align-items: end;/s);
  assert.match(html, /@media\(max-width:\s*760px\)[\s\S]*?\.student-form-fields \{ grid-template-columns: minmax\(0, 1fr\);/s);
  assert.equal((html.match(/id="studentForm"/g) || []).length, 1);
});

test('add-student submit shares the fields row while blank passwords still generate automatically', () => {
  const form = html.slice(html.indexOf('<form class="panel" id="studentForm">'), html.indexOf('</form>', html.indexOf('<form class="panel" id="studentForm">')));
  assert.match(form, /id="studentPassword"[^>]*>\s*<\/div>\s*<button class="btn" type="submit">Dodaj ucznia<\/button>\s*<\/div>/);
  const password = form.match(/<input id="studentPassword"[^>]*>/)[0];
  assert.doesNotMatch(password, /placeholder=|\brequired\b/);
  assert.match(html, /\.student-form-fields > \.btn \{ height: 40px; min-height: 40px;/);
  assert.match(html, /password: formData.get\("password"\)/);
  assert.match(fs.readFileSync('backend/app.py', 'utf8'), /password = data.get\("password"\) or generate_temporary_password\(\)/);
});

test('last activity stays visible next to the student name on narrow screens', () => {
  const tablet = html.slice(html.indexOf('@media (max-width: 1200px)'), html.indexOf('@media (max-width: 600px)', html.indexOf('@media (max-width: 1200px)')));
  const mobile = html.slice(html.indexOf('@media (max-width: 600px)', html.indexOf('@media (max-width: 1200px)')), html.indexOf('.index-cell'));
  assert.doesNotMatch(html, /\.student-summary-activity\s*\{[^}]*display:\s*none/);
  assert.match(tablet, /\.student-summary-activity\s*\{[^}]*color: var\(--text\);[^}]*font-weight: 600;[^}]*white-space: nowrap;/s);
  assert.match(mobile, /\.student-summary-activity\s*\{[^}]*grid-column: 2;[^}]*grid-row: 1;/s);
  assert.match(mobile, /\.student-summary-state\s*\{[^}]*grid-column: 1;[^}]*grid-row: 2;/s);
  assert.match(mobile, /\.student-summary-level\s*\{[^}]*grid-column: 2;[^}]*grid-row: 2;/s);
  assert.match(html, /activity\.setAttribute\("aria-label", activity\.title\)/);
});

test('compact course toggles sit beside the name and preserve full labels and submitted values', () => {
  const form = html.slice(html.indexOf('<form class="panel" id="studentForm">'), html.indexOf('</form>', html.indexOf('<form class="panel" id="studentForm">')));
  assert.match(form, /class="student-form-identity"[\s\S]*?id="displayName"[\s\S]*?class="field student-form-level"[\s\S]*?id="studentEmail"/);
  for (const [level, label, short] of [
    ['matura_podstawowa', 'Matura podstawowa', 'MP'],
    ['matura_rozszerzona', 'Matura rozszerzona', 'MR'],
    ['egzamin_osmoklasisty', 'Egzamin ósmoklasisty', 'EO']
  ]) assert.match(form, new RegExp(`data-level="${level}"[^>]*title="${label}"[^>]*aria-label="${label}"[^>]*>${short}</button>`));
  assert.match(html, /\.student-form-identity\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/s);
  assert.match(html, /\.student-form-level \.level-cards \{ grid-template-columns: repeat\(3, 34px\);/);
  assert.match(html, /card\.setAttribute\("aria-pressed", String\(card\.dataset\.level === level\)\)/);
});

test('students are grouped by assigned course and task previews stay compact', () => {
  const groupOrder = [
    'egzamin_osmoklasisty',
    'matura_podstawowa',
    'matura_rozszerzona'
  ];
  let previousIndex = -1;

  for (const level of groupOrder) {
    const index = html.indexOf(`["${level}",`);
    assert(index > previousIndex, `${level} group should be present in the expected order`);
    previousIndex = index;
  }

  assert.match(html, /student-level-group/);
  assert.match(html, /\.student-level-eo \.student-level-heading\s*\{[^}]*background:\s*linear-gradient\(90deg, #b2d699, #ffffff\);/s);
  assert.match(html, /\.student-level-mp \.student-level-heading,[\s\S]*?background:\s*linear-gradient\(90deg, #d5b8ea, #ffffff\);/);
  assert.match(html, /\.task-image-preview img\s*\{[^}]*width:\s*50%;[^}]*max-height:\s*210px;/s);
  assert.match(html, /function taskPreviewVideoUrl\(/);
  assert.match(html, /video\.textContent = "Wyświetl nagranie"/);
});
