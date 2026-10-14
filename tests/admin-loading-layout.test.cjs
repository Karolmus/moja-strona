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
  assert(source('showProgress').includes('loadAdminTaskCatalog()'));
});

test('catalog downloads are shared on concurrent openings and retried after failure', async () => {
  let calls = 0, resolve;
  const c = vm.createContext({adminTaskCatalogReady:null,
    fetchAdminTaskCatalog:() => {calls++; return new Promise(done => {resolve=done;});}});
  vm.runInContext(source('loadAdminTaskCatalog'), c);
  const first = c.loadAdminTaskCatalog(), second = c.loadAdminTaskCatalog();
  assert.equal(calls, 1);
  assert.equal(first, second);
  resolve(); await first;
  await c.loadAdminTaskCatalog();
  assert.equal(calls, 1);
  c.adminTaskCatalogReady = null;
  c.fetchAdminTaskCatalog = () => Promise.reject(new Error('offline'));
  await assert.rejects(c.loadAdminTaskCatalog(), /offline/);
  assert.equal(c.adminTaskCatalogReady, null);
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
  const c = vm.createContext({ADMIN_TASK_SOURCES:[{path:'course.json'}], adminTaskCatalog:[],
    loadAdminJson:async () => {throw new Error('offline');}});
  vm.runInContext(source('fetchAdminTaskCatalog'), c);
  await assert.rejects(c.fetchAdminTaskCatalog(), /Nie udało się wczytać katalogu/);
});
