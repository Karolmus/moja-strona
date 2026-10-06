const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const sourceId = 'zadania/kurs/eo/test_lekcje_1_6/test_lekcje_1_6.json';
assert(html.indexOf('id="answer"') < html.indexOf('class="action-group tools"'),
  'Answer corrections cannot be nested in the tools hidden during a test');
const landscape = html.slice(html.indexOf('@media (orientation: landscape)'));
assert.match(landscape, /\.progress-grid > \.nav-section-label\s*\{\s*flex: 0 0 auto;/,
  'The landscape label does not push the task buttons out of view');

function load(context, name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(html);
  assert(match, name);
  vm.runInContext(html.slice(match.index, html.indexOf('\n}', match.index) + 2), context);
}

const images = vm.createContext({});
for(const name of ['isProtectedCoursePath','optimizedImageCandidate','imageCandidates']) load(images,name);
assert.deepEqual(Array.from(images.imageCandidates(sourceId.replace(/[^/]+$/, '2.png'))),
  ['zadania/kurs/eo/test_lekcje_1_6/2.png'], 'A course uses the exact file in its manifest');
assert.deepEqual(Array.from(images.imageCandidates('zadania/eo/2025/2.png')),
  ['zadania/eo/2025/2.webp','zadania/eo/2025/2.png'], 'Public exam image optimization is preserved');

const buttons = ['A','B','C','D'].map(value => ({
  dataset:{value}, classes:new Set(), classList:{add(name){this.owner.classes.add(name);}}
}));
buttons.forEach(button => button.classList.owner = button);
const task = {sourceId, file:'2.png', type:'closed', category:'kurs', activityType:'test', maxPoints:1};
const restore = vm.createContext({
  currentTask:task, currentTaskAnswered:false, submittedChoice:'',
  sessionSubmittedAnswers:new Map(), getTaskKey:t=>`${t.sourceId}:${t.file}`,
  getSavedProgressItem:()=>({submitted_answer:'A',result:'bad'}),
  isCoursePreviewMode:()=>false, getLockedCourseResult:()=> 'bad', disableMCQ(){},
  setResultButtonsEnabled(){}, isClosedTask:()=>true, getCorrectAnswers:()=>['B'],
  isTrueFalseSequenceTask:()=>false, isGroupedChoiceTask:()=>false, isGroupedMultiTask:()=>false,
  isPracticalTask:()=>false, isInputTask:()=>false, updateScorePanel(){},
  document:{querySelectorAll:()=>buttons}
});
for(const name of ['revealCorrectAnswer','applyCourseAnswerLock'])load(restore,name);
restore.applyCourseAnswerLock();
assert(buttons[0].classes.has('wrong'),'Revisiting preserves the selected wrong answer');
assert(buttons[1].classes.has('correct'),'Revisiting still displays the correct answer');
assert.equal(restore.submittedChoice,'A');

let shown=0;
const summary = vm.createContext({
  currentTask:{...task, coursePart:'praca_domowa'}, isTaskLoading:false,
  STUDENT_WORK_COURSE_PARTS:['praca_domowa'], loggedUser:{role:'student'},
  completedHomeworkSummarySource:'', document:{getElementById:()=>({open:false})},
  isHomeworkComplete:()=>true, isHomeworkCompleteOnServer:()=>false,
  showHomeworkCompletionSummary:()=>shown++
});
load(summary,'advanceToHomeworkSummaryIfComplete');
assert.equal(summary.advanceToHomeworkSummaryIfComplete(),false);
assert.equal(shown,0,'A local result cannot mark an unconfirmed test as completed');
summary.isHomeworkCompleteOnServer=()=>true;
assert.equal(summary.advanceToHomeworkSummaryIfComplete(),true);
assert.equal(shown,1);

const expired=vm.createContext({
  currentTask:task, currentTaskAnswered:false, isCoursePreviewMode:()=>false,
  loggedUser:{role:'student'}, testRemainingSeconds:()=>0,
  applyTestTimeLimit:()=>{expired.blocked=true;}
});
load(expired,'addProgress');
assert.equal(expired.addProgress('good'),false,'Answers after the deadline cannot add points');
assert.equal(expired.blocked,true);

const status={hidden:true};
const retry={disabled:false};
const payloads=[];
let fail=true;
const save=vm.createContext({
  currentTask:task, loggedUser:{role:'student'}, isLoggedInStudent:true,
  isCoursePreviewMode:()=>false, window:{apiFetch:true}, hintUsed:false,answerShown:false,
  sessionSubmittedAnswers:new Map([[`${sourceId}:2.png`,'B']]),
  failedProgressSaves:new Map(),pendingProgressSaveRequests:new Set(), savedProgress:[],
  taskMode:'ordered',
  getCurrentTaskDurationSeconds:()=>4,getTaskKey:t=>`${t.sourceId}:${t.file}`,
  taskUsedHint:()=>false, getSavedProgressItem:t=>save.savedProgress.find(p=>p.file===t.file)||null,
  automaticScoreForResult:()=>({earnedPoints:1,maxPoints:1}),taskDifficulty:()=>1,
  taskMaxPoints:()=>1, taskPointValue:()=>1, submittedAnswerText:()=> 'B',
  document:{getElementById:id=>id==='progressSaveStatus'?status:retry},console:{warn(){}},
  renderSourceSelector(){},updateScorePanel(){},updateSourceSummary(){},preloadUnlockedCourseSources(){},
  scheduleCompletionSummary(){}, loadStudentProgress:async()=>{},
  apiFetch:async (_path, options)=>{
    const payload=JSON.parse(options.body);payloads.push(payload);
    if(fail)throw {status:503};
    return {progress:{file:payload.file,result:payload.result,submitted_answer:payload.submitted_answer}};
  }
});
for(const name of ['updateProgressSaveStatus','saveProgress','retryFailedProgressSaves'])load(save,name);

(async()=>{
  await save.saveProgress('good',null,4,task);
  assert.equal(status.hidden,false,'A failed save is visible');
  assert.equal(save.failedProgressSaves.size,1);
  assert.equal(save.pendingProgressSaveRequests.size,0);
  save.currentTask={...task,file:'3.png'};
  save.hintUsed=true;
  fail=false;
  await save.retryFailedProgressSaves();
  assert.equal(status.hidden,true);
  assert.equal(save.failedProgressSaves.size,0);
  assert.equal(payloads[1].submitted_answer,'B','A retry uses the original answer after navigation');
  assert.equal(payloads[1].hint_used,false);
  assert.equal(payloads[1].file,'2.png');
  save.failedProgressSaves.set(`${sourceId}:2.png`,{type:'good',task,options:{submittedAnswer:'B'}});
  await save.retryFailedProgressSaves();
  assert.equal(payloads.length,2,'A confirmed answer is not posted twice after a lost response');
  console.log('PASS: canonical images, persisted wrong choices, confirmed summaries, deadline enforcement and save retries');
})().catch(error=>{console.error(error);process.exitCode=1;});
