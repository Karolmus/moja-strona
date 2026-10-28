const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const html = fs.readFileSync('zadania.html', 'utf8');
const sourceId = 'zadania/kurs/mp/test_lekcje_1_6/test_lekcje_1_6.json';

function load(context, name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(html);
  assert(match, name);
  vm.runInContext(html.slice(match.index, html.indexOf('\n}', match.index) + 2), context);
}

function fixture() {
  const items = ['1.png', '2.png', '3.png'].map(file => ({
    sourceId, file, category:'kurs', coursePart:'praca_domowa', activityType:'test', manualTestFinish:true
  }));
  const results = new Map(items.map(item => [item.file, 'good']));
  const server = new Set(items.map(item => item.file));
  const classes = new Set();
  const button = {innerText:'', disabled:false, classList:{toggle(){}}};
  const status = {hidden:true, textContent:'', classList:{toggle(name, on){on ? classes.add(name) : classes.delete(name);}}};
  const calls = {summaries:[], messages:[], draws:[], loads:0, retries:0};
  const context = vm.createContext({
    currentTask:items.at(-1), currentTaskAnswered:true, currentIndex:2, selectedSource:sourceId,
    isTaskLoading:false, loggedUser:{role:'student'}, completedHomeworkSummarySource:'',
    STUDENT_WORK_COURSE_PARTS:['praca_domowa'], COURSE_COMPLETION_RESULTS:new Set(['good','medium','bad','video']),
    testFinalizationPromises:new Map(), pendingProgressSaveRequests:new Set(), failedProgressSaves:new Map(),
    testsAwaitingFinish:new Set([sourceId]),
    getHomeworkSummaryTasks:()=>items, getTaskKey:item=>`${item.sourceId}:${item.file}`,
    getSavedResult:item=>results.get(item.file), isHomeworkComplete:()=>items.every(item=>results.has(item.file)),
    isHomeworkCompleteOnServer:()=>items.every(item=>server.has(item.file)),
    document:{querySelector:()=>button, getElementById:id=>id==='testFinishStatus' ? status : null},
    pool:()=>items, getTaskScore:()=>({earnedPoints:1,maxPoints:1}),
    showHomeworkCompletionSummary:id=>calls.summaries.push(id), showMessage:message=>calls.messages.push(message),
    loadStudentProgress:async()=>{calls.loads++;},
    retryFailedProgressSaves:async()=>{calls.retries++;},
    drawTask:async index=>{calls.draws.push(index); context.currentTask=items[index];}
  });
  for(const name of ['isLastTestTask','updateTestFinishStatus','updateNextTaskButton','finishCurrentTest',
    'advanceToHomeworkSummaryIfComplete']) load(context,name);
  return {context, items, results, server, button, status, classes, calls};
}

test('MP 1-6 declares proof delivery and manual completion without changing other tests', () => {
  const array = html.match(/const TASK_SOURCES = (\[[\s\S]*?\n\]);/)[1];
  const sources = vm.runInNewContext(array);
  const source = sources.find(item=>item.path===sourceId);
  assert.equal(source.manualTestFinish, true);
  assert.match(source.proofSubmissionNotice, /zad[ań]+ dowodowych.*Discordzie/);
  const normalization=vm.createContext({MONTH_LABELS:{}, SOURCE_TYPE_LABELS:{}, SOURCE_LEVELS:{}});
  load(normalization, 'getSourceMeta');
  const meta=normalization.getSourceMeta(source);
  assert.equal(meta.manualTestFinish, true);
  assert.equal(meta.proofSubmissionNotice, source.proofSubmissionNotice);
  assert.equal(sources.filter(item=>item.manualTestFinish).length, 1);
  assert.match(html, /sourceMeta\.manualTestFinish === true/);
  assert.match(html, /testModeNotice\.textContent = \[[\s\S]*?proofSubmissionNotice/);
  assert.match(html, /if\(currentTask\?\.manualTestFinish && isLastTestTask\(\)\)\{\s*void finishCurrentTest\(\);\s*return;/);
  assert.match(html, /currentTaskAnswered = true;\s*if\(currentTask\?\.manualTestFinish\) testsAwaitingFinish\.add\(currentTask\.sourceId\);\s*const key = getTaskKey\(currentTask\);/);
});

test('proof classification cannot hide the explicit answer fields in tasks 9 and 10', () => {
  const tasks=JSON.parse(fs.readFileSync(sourceId, 'utf8')).slice(8);
  let forms=0;
  const control={classList:{add(){},remove(){}}, style:{removeProperty(){}}};
  const context=vm.createContext({
    currentTask:null, document:{getElementById:()=>control}, setResultButtonsEnabled(){},
    isCoursePreviewMode:()=>false, isClosedTask:()=>false, isProofTask:()=>true,
    isPracticalTask:()=>false, setupInputTask:()=>{forms++;}
  });
  load(context,'isInputTask');
  load(context,'setupMCQ');
  for(const task of tasks){
    context.currentTask=task;
    context.setupMCQ();
  }
  assert.equal(forms,2, 'Both proof-tagged tasks must render their configured input form');
});

test('the last task has a finish button with truthful pending, failed and saved messages', () => {
  const {context, items, button, status, classes, server} = fixture();
  context.updateNextTaskButton();
  assert.equal(button.innerText, 'Zakończ test');
  assert.equal(status.hidden, false);
  assert.equal(status.textContent, 'Wszystkie odpowiedzi zostały zapisane.');
  assert(classes.has('saved'));
  context.pendingProgressSaveRequests.add(Promise.resolve());
  context.updateNextTaskButton();
  assert.equal(status.textContent, 'Zapisywanie odpowiedzi...');
  assert(!classes.has('saved'));
  context.pendingProgressSaveRequests.clear();
  context.failedProgressSaves.set('failed', {task:items[0]});
  context.updateNextTaskButton();
  assert(classes.has('save-error'));
  assert.match(status.textContent, /Ponów zapis/);
  context.failedProgressSaves.clear();
  server.delete('1.png');
  context.updateNextTaskButton();
  assert(!classes.has('saved'));
  context.currentTask=items[0];
  context.updateNextTaskButton();
  assert.equal(button.innerText, 'Kolejne zadanie →');
  assert.equal(status.hidden, true);
});

test('newly answered MP tests wait for the finish action, but reopening saved tests shows results', () => {
  const {context, calls} = fixture();
  assert.equal(context.advanceToHomeworkSummaryIfComplete(), false);
  assert.equal(calls.summaries.length, 0);
  context.testsAwaitingFinish.clear();
  assert.equal(context.advanceToHomeworkSummaryIfComplete(), true);
  assert.equal(calls.summaries.length, 1);
});

test('finishing waits for outstanding saves and prevents duplicate completion', async () => {
  const {context, server, button, calls} = fixture();
  let resolve;
  server.delete('3.png');
  const pending = new Promise(done=>{resolve=done;});
  context.pendingProgressSaveRequests.add(pending);
  const first = context.finishCurrentTest();
  const second = context.finishCurrentTest();
  assert.equal(button.disabled, true);
  assert.equal(calls.summaries.length, 0);
  server.add('3.png');
  context.pendingProgressSaveRequests.delete(pending);
  resolve();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(calls.loads, 1);
  assert.equal(calls.summaries.length, 1);
  assert.equal(context.testsAwaitingFinish.has(sourceId), false);
  assert.equal(button.disabled, false);
});

test('missing answers return to the first unfinished task instead of ending the test', async () => {
  const {context, results, server, calls} = fixture();
  results.delete('2.png');
  server.delete('2.png');
  assert.equal(await context.finishCurrentTest(), false);
  assert.deepEqual(calls.draws, [1]);
  assert.equal(calls.summaries.length, 0);
  assert.match(calls.messages.at(-1), /Odpowiedz na wszystkie zadania/);
});

test('finishing cannot discard a typed answer that has not been submitted', async () => {
  const {context, results, calls} = fixture();
  context.currentTaskAnswered=false;
  results.delete('3.png');
  assert.equal(await context.finishCurrentTest(), false);
  assert.deepEqual(calls.draws, []);
  assert.equal(calls.summaries.length, 0);
  assert.match(calls.messages.at(-1), /Najpierw zatwierdź odpowiedź/);
});

test('failed saves are retried and never result in a false completion confirmation', async () => {
  const {context, items, calls} = fixture();
  context.failedProgressSaves.set('failed', {task:items[0]});
  assert.equal(await context.finishCurrentTest(), false);
  assert.equal(calls.retries, 1);
  assert.equal(calls.summaries.length, 0);
  assert.match(calls.messages.at(-1), /Nie wszystkie odpowiedzi zostały zapisane/);
  context.retryFailedProgressSaves=async()=>{context.failedProgressSaves.clear();};
  assert.equal(await context.finishCurrentTest(), true);
  assert.equal(calls.summaries.length, 1);
});

test('server confirmation is required even when local answers appear complete', async () => {
  const {context, server, calls} = fixture();
  server.delete('3.png');
  assert.equal(await context.finishCurrentTest(), false);
  assert.equal(calls.summaries.length, 0);
  assert.match(calls.messages.at(-1), /Nie potwierdzono zapisu wszystkich odpowiedzi/);
});

test('a delayed completion cannot open the previous test result over another lesson', async () => {
  const {context, calls} = fixture();
  let resolve;
  context.loadStudentProgress=()=>new Promise(done=>{resolve=done;});
  const finishing=context.finishCurrentTest();
  await Promise.resolve();
  context.selectedSource='other-lesson';
  resolve();
  assert.equal(await finishing, true);
  assert.equal(calls.summaries.length, 0);
});
