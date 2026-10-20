const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');

const html = fs.readFileSync('zadania.html', 'utf8');
function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
function fixture({blockedStorage = false, stored = false} = {}) {
  const storage = new Map(stored ? [['deltaSigmaNotebookWork:v2:7', '1']] : []);
  const notice = {hidden: true};
  const ctx = vm.createContext({loggedUser:{id:7}, notebookNoticeDismissed:false,
    sessionStorage:{getItem(key) {if (blockedStorage) throw Error('storage'); return storage.get(key);},
      setItem(key,value) {if (blockedStorage) throw Error('storage'); storage.set(key,value);}},
    document:{getElementById:id => id === 'notebookWorkNotice' ? notice : null}
  });
  for (const name of ['notebookWorkStorageKey','showNotebookWorkNotice','dismissNotebookWorkNotice']) {
    vm.runInContext(functionSource(name),ctx);
  }
  return {ctx,notice,storage};
}

test('the notebook reminder is an inline note with an accessible close icon, never a modal', () => {
  const notice = html.match(/<aside class="notebook-work-notice"[\s\S]*?<\/aside>/)[0];
  assert.match(notice, /role="note"/);
  assert.equal((notice.match(/<p>/g) || []).length, 1);
  assert.equal((notice.match(/<button /g) || []).length, 1);
  assert(notice.includes('Rozwiązuj zadania pisemnie w zeszycie.'));
  assert(notice.includes('Tutaj wprowadź tylko uzyskane odpowiedzi.'));
  assert.match(notice, /aria-label="Ukryj przypomnienie o zeszycie"/);
  assert.match(notice, /static\/icons\/x\.svg/);
  assert(!notice.includes('autofocus') && !notice.includes('aria-modal'));
  assert(!html.includes('notebookStartDialog'));
  const show = functionSource('showNotebookWorkNotice');
  assert(!/showModal|alert\(|\.focus\(|workTimer|Promise/.test(show));
});

test('the reminder stays visible without blocking work and can be dismissed for the account session', () => {
  const {ctx,notice,storage} = fixture();
  assert.equal(ctx.showNotebookWorkNotice(), undefined);
  assert.equal(notice.hidden, false);
  ctx.showNotebookWorkNotice();
  assert.equal(notice.hidden, false);
  ctx.dismissNotebookWorkNotice();
  assert.equal(notice.hidden, true);
  assert.equal(storage.get('deltaSigmaNotebookWork:v2:7'), '1');
  ctx.showNotebookWorkNotice();
  assert.equal(notice.hidden, true);
  const resumed = fixture({stored:true});
  resumed.ctx.showNotebookWorkNotice();
  assert.equal(resumed.notice.hidden, true, 'Reloading does not redisplay a dismissed note');
});

test('blocked browser storage still allows dismissal and does not repeat the reminder during navigation', () => {
  const {ctx,notice} = fixture({blockedStorage:true});
  ctx.showNotebookWorkNotice();
  assert.equal(notice.hidden, false);
  ctx.dismissNotebookWorkNotice();
  ctx.showNotebookWorkNotice();
  assert.equal(notice.hidden, true);
});

test('a visible notebook note can never start the test countdown without the separate test confirmation', async () => {
  const events = [];
  let accepted = false;
  let deadline = 0;
  const ctx = vm.createContext({loggedUser:{role:'student'},
    getSourceMetaById:() => ({id:'test',kind:'test'}),
    storedTestDeadline:() => deadline,
    showNotebookWorkNotice:() => {events.push('notice');},
    confirmTestStart:async () => {events.push('confirmation'); return accepted;},
    startTestTimer:() => {events.push('countdown');}
  });
  vm.runInContext('async ' + functionSource('ensureTestSourceStarted'),ctx);
  assert.equal(await ctx.ensureTestSourceStarted('test'), false);
  assert.deepEqual(events, ['notice','confirmation']);
  events.length = 0;
  accepted = true;
  assert.equal(await ctx.ensureTestSourceStarted('test'), true);
  assert.deepEqual(events, ['notice','confirmation','countdown']);
  events.length = 0;
  deadline = Date.now() + 10000;
  await ctx.ensureTestSourceStarted('test');
  assert.equal(events.length, 0, 'A running test keeps its original deadline');
  assert.match(html, /showNotebookWorkNotice\(\);\s*if\(requestId !== drawTaskRequestId \|\| currentTask !== taskToRender \|\| currentTaskAnswered\) return;\s*workTimer.start/);
});
