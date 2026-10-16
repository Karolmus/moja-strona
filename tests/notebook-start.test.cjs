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
  const storage = new Map(stored ? [['deltaSigmaNotebookWork:7','1']] : []);
  const dialog = {opens:0, open:false, showModal() {this.opens++; this.open = true;}, close() {this.open = false;}};
  const confirm = {focus() {confirm.focused = true;}};
  const ctx = vm.createContext({loggedUser:{id:7}, notebookWorkAccepted:false,
    notebookWorkPromise:null, notebookWorkResolver:null,
    workTimer:{pause() {ctx.pauses = (ctx.pauses || 0) + 1;}},
    sessionStorage:{getItem(key) {if (blockedStorage) throw Error('storage'); return storage.get(key);},
      setItem(key,value) {if (blockedStorage) throw Error('storage'); storage.set(key,value);}},
    document:{getElementById:id => ({notebookStartDialog:dialog, notebookStartConfirm:confirm})[id]}
  });
  for (const name of ['notebookWorkStorageKey','confirmNotebookWork','acceptNotebookWork']) {
    vm.runInContext(functionSource(name),ctx);
  }
  return {ctx,dialog,confirm,storage};
}

test('the popup has only the requested paragraph and one start button', () => {
  const dialog = html.match(/<dialog class="notebook-start-dialog"[\s\S]*?<\/dialog>/)[0];
  assert.equal((dialog.match(/<p /g) || []).length, 1);
  assert.equal((dialog.match(/<button /g) || []).length, 1);
  assert(!dialog.includes('<h'));
  assert(dialog.includes('Rozwiązuj zadania pisemnie w zeszycie. Tutaj wprowadź tylko uzyskane odpowiedzi. Nie rozwiązuj zadań w pamięci - to najczęstsza przyczyna błędów.'));
  assert(dialog.includes('>Zaczynam</button>'));
  assert.match(html, /id="notebookStartDialog" aria-label="Przed rozpoczęciem zadań" aria-describedby="notebookStartMessage"/);
  assert.match(html, /getElementById\("notebookStartDialog"\)\s*\?\.addEventListener\("cancel", event => event.preventDefault\(\)\)/);
});

test('work waits for acknowledgement once per account session and concurrent renders share the popup', async () => {
  const {ctx,dialog,confirm,storage} = fixture();
  let started = false;
  const pending = ctx.confirmNotebookWork();
  pending.then(() => {started = true;});
  assert.equal(ctx.confirmNotebookWork(), pending);
  await Promise.resolve();
  assert.equal(started, false);
  assert.equal(ctx.pauses, 1);
  assert.equal(dialog.opens, 1);
  assert.equal(confirm.focused, true);
  ctx.acceptNotebookWork();
  await pending;
  assert.equal(started, true);
  assert.equal(dialog.open, false);
  assert.equal(storage.get('deltaSigmaNotebookWork:7'), '1');
  await ctx.confirmNotebookWork();
  assert.equal(dialog.opens, 1);
  const resumed = fixture({stored:true});
  await resumed.ctx.confirmNotebookWork();
  assert.equal(resumed.dialog.opens, 0, 'Reloading within the session does not repeat the notice');
});

test('blocked browser storage still permits acknowledgement and does not repeat during navigation', async () => {
  const {ctx,dialog} = fixture({blockedStorage:true});
  const pending = ctx.confirmNotebookWork();
  ctx.acceptNotebookWork();
  await pending;
  await ctx.confirmNotebookWork();
  assert.equal(dialog.opens, 1);
});

test('notebook acknowledgement precedes test confirmation and can never start its countdown', async () => {
  const events = [];
  let accepted = false;
  let deadline = 0;
  const ctx = vm.createContext({loggedUser:{role:'student'},
    getSourceMetaById:() => ({id:'test',kind:'test'}),
    storedTestDeadline:() => deadline,
    confirmNotebookWork:async () => {events.push('notebook');},
    confirmTestStart:async () => {events.push('confirmation'); return accepted;},
    startTestTimer:() => {events.push('countdown');}
  });
  vm.runInContext('async ' + functionSource('ensureTestSourceStarted'),ctx);
  assert.equal(await ctx.ensureTestSourceStarted('test'), false);
  assert.deepEqual(events, ['notebook','confirmation']);
  events.length = 0;
  accepted = true;
  assert.equal(await ctx.ensureTestSourceStarted('test'), true);
  assert.deepEqual(events, ['notebook','confirmation','countdown']);
  events.length = 0;
  deadline = Date.now() + 10000;
  await ctx.ensureTestSourceStarted('test');
  assert.equal(events.length, 0, 'A running test keeps its original deadline without another start dialog');
  assert.match(html, /await confirmNotebookWork\(\);\s*if\(requestId !== drawTaskRequestId \|\| currentTask !== taskToRender \|\| currentTaskAnswered\) return;\s*workTimer.start/);
});
