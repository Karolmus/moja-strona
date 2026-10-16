const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const html = fs.readFileSync('admin.html', 'utf8');

function source(name){
  const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}

test('student list needs one request and no task catalog or per-student progress downloads', async () => {
  const requests = [], rendered = [];
  const students = Array.from({length:50}, (_, id) => ({id, last_activity_at:'2026-10-14T10:00:00Z'}));
  const c = vm.createContext({apiFetch:async path => {requests.push(path); return {students};},
    renderStudents:() => rendered.push(c.students), studentProgressCache:new Map([[1,['cached']]])});
  vm.runInContext(source('loadStudents'), c);
  await c.loadStudents();
  assert.deepEqual(requests, ['/api/admin/students']);
  assert.equal(rendered.length, 1);
  assert.equal(c.students, students);
  assert.deepEqual(c.studentProgressCache.get(1), ['cached']);
  assert(!source('boot').includes('loadAdminTaskCatalog'));
  assert(!html.includes('loadStudentProgressSummaries'));
  assert(source('showProgress').includes('loadAdminTaskCatalog(student, data.progress, data.review_tasks)'));
});

function catalogContext(overrides = {}) {
  const requests = [];
  const c = vm.createContext({
    ADMIN_TASK_SOURCES: [
      {path:'mp1.json', category:'kurs', level:'mp', label:'Lekcja 1'},
      {path:'mp2.json', category:'kurs', level:'mp', label:'Lekcja 2'},
      {path:'eo1.json', category:'kurs', level:'eo'},
      {path:'mp-test.json', category:'kurs', level:'mp', kind:'test'},
      {path:'eo-test.json', category:'kurs', level:'eo', kind:'test'},
      {path:'mp-exam1.json', category:'egzaminy', level:'mp'},
      {path:'mp-exam2.json', category:'egzaminy', level:'mp'},
      {path:'eo-exam.json', category:'egzaminy', level:'eo'}
    ],
    adminTaskCatalog:[], adminCatalogCache:new Map(), adminCatalogRequests:new Map(),
    progressSourceId:item => item.source_id,
    apiFetch:async (path, options) => {
      const files = JSON.parse(options.body).sources;
      requests.push({path, files});
      return {catalog:files.map(path => ({path, tasks:[{file:'zd1.webp', coursePart:'praca_domowa'}]}))};
    },
    ...overrides
  });
  for (const name of ['studentCatalogSources', 'fetchAdminTaskCatalog', 'loadAdminTaskCatalog']) {
    vm.runInContext(source(name), c);
  }
  return {c, requests};
}

test('one batch loads only started/discussed lessons and the students own tests', async () => {
  const {c, requests} = catalogContext();
  await c.loadAdminTaskCatalog({level:'mp'}, [{source_id:'mp1.json'}], [{source_id:'mp2.json'}]);
  assert.deepEqual(requests, [{path:'/api/admin/task-catalog', files:['mp1.json','mp2.json','mp-test.json']}]);
  assert.equal(c.adminTaskCatalog.length, 3);
  assert.equal(c.adminTaskCatalog[1].sourceIndex, 1);
  assert.equal(c.adminTaskCatalog[2].sourceKind, 'test');
  assert.equal(c.adminTaskCatalog[0].sourceLabel, 'Lekcja 1');
  await c.loadAdminTaskCatalog({level:'mp'}, [{source_id:'mp1.json'}], []);
  assert.equal(requests.length, 1, 'Another student can reuse the same lesson metadata');
});

test('exam predictions retain every exam from the students level, but not other courses', () => {
  const {c} = catalogContext();
  const files = c.studentCatalogSources({level:'mp'}, [{source_id:'mp-exam1.json'}], []).map(item => item.path);
  assert.deepEqual(Array.from(files), ['mp-test.json','mp-exam1.json','mp-exam2.json']);
  assert.deepEqual(Array.from(c.studentCatalogSources({level:'mp'}, [], []), item => item.path), ['mp-test.json']);
});

test('concurrent catalog requests share downloads and failed sources are retried', async () => {
  const {c} = catalogContext();
  let calls = 0, resolve;
  c.apiFetch = () => {calls++; return new Promise(done => {resolve=done;});};
  const first = c.loadAdminTaskCatalog({level:'mp'}, [{source_id:'mp1.json'}], []);
  const second = c.loadAdminTaskCatalog({level:'mp'}, [{source_id:'mp1.json'}], []);
  assert.equal(calls, 1);
  resolve({catalog:[{path:'mp1.json', tasks:[]}, {path:'mp-test.json', tasks:[]}]});
  await Promise.all([first, second]);
  assert.equal(c.adminCatalogRequests.size, 0);
  c.apiFetch = async () => {throw new Error('offline');};
  await assert.rejects(c.loadAdminTaskCatalog({level:'eo'}, [], []), /offline/);
  assert(!c.adminCatalogCache.has('eo-test.json'));
  assert.equal(c.adminCatalogRequests.size, 0);
  c.apiFetch = async () => ({catalog:[{path:'eo-test.json',tasks:[]}]});
  await c.loadAdminTaskCatalog({level:'eo'}, [], []);
  assert(c.adminCatalogCache.has('eo-test.json'));
});

test('old API fallback retains the smaller set and never masks authorization or missing metadata', async () => {
  const {c} = catalogContext();
  const legacy = [];
  c.apiFetch = async () => {throw Object.assign(new Error('old server'), {status:404});};
  c.loadAdminJson = async path => {legacy.push(path); return [];};
  await c.loadAdminTaskCatalog({level:'mp'}, [{source_id:'mp1.json'}], []);
  assert.deepEqual(legacy, ['mp1.json','mp-test.json']);
  for (const status of [401,403,500]) {
    c.apiFetch = async () => {throw Object.assign(new Error('denied'), {status});};
    await assert.rejects(c.loadAdminTaskCatalog({level:'eo'}, [], []), /denied/);
  }
  c.apiFetch = async () => ({catalog:[]});
  await assert.rejects(c.loadAdminTaskCatalog({level:'eo'}, [], []), /Nie udało się wczytać katalogu/);
  assert(!c.adminCatalogCache.has('eo-test.json'));
});

test('progress and discussion tasks share one fresh request, including rapid reopenings', async () => {
  const calls = [];
  let resolve;
  const c = vm.createContext({studentWorkRequests:new Map(),
    apiFetch:path => {calls.push(path); return new Promise(done => {resolve=done;});},
    loadReviewTasks:() => {throw new Error('No separate review download needed');}
  });
  vm.runInContext(source('loadStudentWork'), c);
  const first = c.loadStudentWork({id:1}), second = c.loadStudentWork({id:1});
  assert.equal(first, second);
  assert.deepEqual(calls, ['/api/admin/students/1/progress?include_review_tasks=1']);
  resolve({progress:[{id:1}],review_tasks:[]});
  await first;
  assert.equal(c.studentWorkRequests.size, 0);
  const fresh = c.loadStudentWork({id:1});
  resolve({progress:[{id:2}],review_tasks:[]});
  assert.equal((await fresh).progress[0].id, 2);
  assert.equal(calls.length, 2, 'Results are not cached indefinitely');
  c.apiFetch = async () => {throw new Error('offline');};
  await assert.rejects(c.loadStudentWork({id:1}), /offline/);
  assert.equal(c.studentWorkRequests.size, 0);
});

test('legacy progress responses fetch discussion tasks separately and invalid results fail safely', async () => {
  let reviews = 0;
  const c = vm.createContext({studentWorkRequests:new Map(),
    apiFetch:async () => ({progress:[]}), loadReviewTasks:async () => {reviews++; return [{id:4}];}
  });
  vm.runInContext(source('loadStudentWork'), c);
  assert.equal((await c.loadStudentWork({id:1})).review_tasks[0].id, 4);
  assert.equal(reviews, 1);
  c.apiFetch = async () => ({});
  await assert.rejects(c.loadStudentWork({id:1}), /Nie udało się wczytać postępów/);
});

test('desktop task actions cannot inherit full-width input sizing or collide with their label', () => {
  assert.match(html, /\.task-edit-actions \.task-reset-selection\s*\{[^}]*width: 16px;[^}]*min-height: 0;[^}]*flex: 0 0 16px;/);
  assert.match(html, /\.task-edit-actions label\s*\{[^}]*display: inline-flex;[^}]*flex: 0 0 auto;[^}]*white-space: nowrap;/);
  assert.match(html, /\.source-task-row \.task-title-cell\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(html, /\.source-task-row \.task-edit-actions\s*\{[^}]*grid-column: 2;[^}]*grid-row: 1 \/ 3;/);
  assert.match(html, /meta\.className = "task-date"/);
  assert.match(html, /\.source-task-row \.answer-comparison,[\s\S]*?grid-column: 1 \/ -1;/);
  assert.match(html, /\.source-task-row > td\s*\{[^}]*padding: 4px 8px;[^}]*overflow-wrap: anywhere;/);
  assert.match(html, /\.source-task-table\.course-task-table th:nth-child\(3\) \{ width: 24%; \}/);
  assert.match(html, /\.teacher-score-status:empty \{ display: none; \}/);
});

test('an unavailable catalog offers retry rather than caching an empty success', async () => {
  const {c} = catalogContext({apiFetch:async () => ({})});
  await assert.rejects(c.loadAdminTaskCatalog({level:'mp'}, [], []), /Nie udało się wczytać katalogu/);
  assert.equal(c.adminCatalogCache.size, 0);
});
