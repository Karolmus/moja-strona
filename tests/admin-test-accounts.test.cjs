const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('admin.html', 'utf8');

function setup() {
  const context = vm.createContext({Intl});
  for (const name of ['isTestStudent', 'getStudentGroups', 'studentGroupCount']) {
    const start = html.indexOf(`function ${name}(`);
    assert(start >= 0);
    vm.runInContext(html.slice(start, html.indexOf('\n}', start)+2), context);
  }
  return context;
}

test('all six test accounts belong only to their own category, retaining course and sort order', () => {
  const c = setup();
  const levels = ['egzamin_osmoklasisty', 'matura_podstawowa', 'matura_rozszerzona'];
  const regular = levels.map((level, id) => ({id:id+1, email:`student-${id}`, level}));
  const testAccounts = ['eo', 'mp', 'mr'].flatMap((code, index) => ['domowe', 'pelny'].map((mode, offset) => ({
    id:10+index*2+offset, email:`test-${code}-${mode}`, level:levels[index],
    full_course_access: mode === 'pelny'
  })));
  const sorted = [...testAccounts].reverse().concat(regular);
  const snapshot = JSON.stringify(sorted);
  const groups = c.getStudentGroups(sorted);
  assert.deepEqual(Array.from(groups, group => group.level), [...levels, 'test_accounts']);
  for (let i=0; i<3; i++) assert.deepEqual(Array.from(groups[i].students, item=>item.id), [i+1]);
  assert.deepEqual(Array.from(groups[3].students, item=>item.id), testAccounts.map(item=>item.id).reverse());
  assert.equal(new Set(Array.from(groups).flatMap(group => Array.from(group.students, item=>item.id))).size, 9);
  assert.equal(JSON.stringify(sorted), snapshot, 'Grouping never changes records or access permissions');
});

test('recognition is based on exact canonical logins, not student names or loose prefixes', () => {
  const c = setup();
  assert(c.isTestStudent({email:'  TEST-MP-PELNY  '}));
  for (const email of ['a', 'b', 'c', 'test', 'test-mp-pelny-2', 'test-mp-pelny@example.com', '', null]) {
    assert(!c.isTestStudent({email,display_name:'test-mp-pelny'}), String(email));
  }
  assert.equal(c.getStudentGroups([]).length, 0);
  const group = c.getStudentGroups([{email:'test-eo-domowe',level:'egzamin_osmoklasisty'}]);
  assert.deepEqual(Array.from(group, item=>item.label), ['Konta testowe']);
  for (const [count, expected] of [[1,'1 konto'],[2,'2 konta'],[6,'6 kont'],[12,'12 kont'],[22,'22 konta']]) {
    assert.equal(c.studentGroupCount(count,true),expected);
  }
});

test('test accounts reuse all existing inline progress and account controls', () => {
  const render = html.slice(html.indexOf('function renderStudents(){'), html.indexOf('async function loadStudents(){'));
  assert.match(render, /getStudentGroups\(sortedStudents\)/);
  assert.match(render, /groupStudents\.forEach\(student =>/);
  assert.match(render, /showProgress\(student\)/);
  assert.match(render, /expanded.append\(progressDetail, overview\)/);
  assert.match(render, /setFullCourseAccess\(student, checkbox\)/);
  assert.match(html, /\.student-level-test \.student-level-heading\s*\{[^}]*background: #e6edf4;/s);
});

test('mobile tabs use compact fixed heights, short labels and smaller badges without changing desktop labels', () => {
  const mobile = html.slice(html.indexOf('@media(max-width: 760px)'));
  assert.match(mobile, /\.admin-tabs\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[^}]*gap: 4px;/s);
  assert.match(mobile, /\.admin-tab-btn\s*\{[^}]*height: 24px;[^}]*min-height: 24px;[^}]*font-size: 11px;/s);
  assert.match(mobile, /\.admin-tab-long-label \{ display: none; \}/);
  assert.match(mobile, /\.admin-tab-short-label \{ display: inline; \}/);
  assert.match(html, /data-admin-tab="messages-failed" aria-label="Nieudane próby zapisania się"/);
  assert.match(html, /class="admin-tab-long-label" aria-hidden="true">Nieudane próby zapisania się/);
  assert.match(html, /class="admin-tab-short-label" aria-hidden="true">Nieudane zapisy/);
  assert.doesNotMatch(html, /\.admin-tab-btn > span:not\(:empty\)/);
  for (const id of ['prospectMessageBadge','failedSignupBadge','parentMessageBadge','analyticsTodayBadge']) {
    assert.match(html, new RegExp(`id="${id}" class="admin-tab-badge"`));
  }
});
