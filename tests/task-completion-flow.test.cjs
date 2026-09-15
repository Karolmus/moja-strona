const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const timers = [];
const task = {sourceId:'lesson', file:'zd1.png', category:'kurs'};
const ctx = vm.createContext({
  currentTask:task, isTaskLoading:false, currentTaskAnswered:false,
  selectedSource:'lesson', completedExamSummarySource:'',
  sessionResults:new Map(), sessionScores:new Map(), SKIPPED_RESULT:'skipped',
  document:{getElementById:()=>({open:ctx.videoOpen})},
  setTimeout:fn=>timers.push(fn),
  advanceToHomeworkSummaryIfComplete:()=>{ctx.homeworkChecks++;return ctx.homeworkComplete;},
  isExamSourceComplete:()=>ctx.examComplete,
  showExamCompletionSummary:()=>{ctx.examSummaries++;},
  isCoursePreviewMode:()=>false, getTaskKey:t=>`${t.sourceId}:${t.file}`,
  isCourseTask:t=>t.category==='kurs',
  getSavedResult:()=>ctx.savedResult,
  saveGuestSessionProgress(){}, renderTaskNavigator(){}, updateSourceSummary(){},
  nextTask:()=>{ctx.nextCalls++;},
  homeworkChecks:0, examSummaries:0, nextCalls:0
});
for(const name of ['scheduleCompletionSummary', 'skipTask', 'getLockedCourseResult']){
  const start=html.indexOf(`function ${name}(`);
  assert(start>=0,name);
  vm.runInContext(html.slice(start,html.indexOf('\n}',start)+2),ctx);
}
const flush=()=>{while(timers.length)timers.shift()();};
ctx.scheduleCompletionSummary();flush();
assert.equal(ctx.homeworkChecks,1);
ctx.videoOpen=true;
ctx.scheduleCompletionSummary();flush();
assert.equal(ctx.homeworkChecks,1,'Do not cover the video or its consent with a summary');
ctx.videoOpen=false;
ctx.isTaskLoading=true;
ctx.scheduleCompletionSummary();flush();
assert.equal(ctx.homeworkChecks,1,'Wait until the task is ready');
ctx.isTaskLoading=false;
ctx.scheduleCompletionSummary();
ctx.currentTask={...task,sourceId:'other'};
flush();
assert.equal(ctx.homeworkChecks,1,'Ignore completion callbacks from the previous lesson');
ctx.currentTask=task;
ctx.examComplete=true;
ctx.selectedSource='exam';
ctx.scheduleCompletionSummary();flush();
assert.equal(ctx.examSummaries,1,'Show the exam summary automatically');
ctx.scheduleCompletionSummary();flush();
assert.equal(ctx.examSummaries,1,'Do not reopen a dismissed summary or advance to another exam');
assert.equal(ctx.nextCalls,0);

ctx.currentTaskAnswered=true;
ctx.sessionResults.set('lesson:zd1.png','video');
ctx.sessionScores.set('lesson:zd1.png',{earnedPoints:0,maxPoints:1});
ctx.skipTask();
assert.equal(ctx.sessionResults.get('lesson:zd1.png'),'video');
assert.equal(ctx.sessionScores.get('lesson:zd1.png').earnedPoints,0);
assert.equal(ctx.nextCalls,1);
ctx.currentTaskAnswered=false;
ctx.sessionResults.clear();
ctx.skipTask();
assert.equal(ctx.sessionResults.get('lesson:zd1.png'),'skipped');
ctx.savedResult='skipped';
assert.equal(ctx.getLockedCourseResult(),'','A skipped task can still be answered');
for(const result of ['good','bad','medium','video']){
  ctx.savedResult=result;
  assert.equal(ctx.getLockedCourseResult(),result);
}
console.log('PASS: mandatory summaries, navigation races, video marks and skipped-task answer access');
