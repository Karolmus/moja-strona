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
    progressTitle:element(), workSummary:element(), reviewTasks:element(), sourceProgress:element(),
    activityChart:element(), recentProgress:element(), studentProgressCache:new Map(),
    progressDetail:{querySelector:() => loading, classList:{add:c => classes.add(c), remove:c => classes.delete(c)}},
    apiFetch:path => new Promise((resolve,reject) => pending.set(Number(path.split('/')[4]), {resolve,reject})),
    loadReviewTasks:async student => [{owner:student.id}],
    isIndependentWorkProgress:item => item.course_part !== 'zadania',
    renderStudents:() => {}, renderWorkSummary:() => {}, renderReviewTasks:() => {},
    renderSourceProgress:(progress, student) => rendered.push(student.id), renderActivityChart:() => {}, renderRecentProgress:() => {},
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
  pending.get(2).resolve({progress:[]}); await second;
  pending.get(1).resolve({progress:[]}); await first;
  assert.deepEqual(rendered, [2]);
  assert.equal(c.activeProgressStudentId, 2);
  assert.equal(c.progressTitle.innerText, 'Postępy: Second');
});

test('closing cancels pending display and restores keyboard focus', async () => {
  const {context:c, pending, rendered, classes} = setup();
  const first = c.showProgress({id:1, display_name:'First'});
  await c.showProgress({id:1, display_name:'First'});
  pending.get(1).resolve({progress:[]}); await first;
  assert.equal(c.activeProgressStudentId, null);
  assert.equal(c.focused, 'student-toggle-1');
  assert(!classes.has('active'));
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
  assert.match(render, /expanded.append\(overview, progressDetail\)/);
  assert.match(html, /if\(activeProgressStudentId === student.id\) renderReviewTasks\(items, student\)/);
  assert.match(html, /const progress = \(studentProgressCache.get\(student.id\) \|\| \[\]\).filter\(isIndependentWorkProgress\)/);
  assert.match(html, /const totalDuration = hasProgress \? sumDuration\(progress\)/);
});
