const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const nodes = new Map(), classes = new Set();
const document = {
  listeners:{},
  addEventListener(type, listener, capture){this.listeners[type] = {listener, capture};},
  documentElement:{classList:{add:value=>classes.add(value), remove:value=>classes.delete(value)}},
  createElement:tagName=>({tagName}),
  getElementById(id){
    if(!nodes.has(id)) nodes.set(id, {
      open:false, children:[], listeners:{}, hidden:true, disabled:false,
      addEventListener(type, listener){this.listeners[type] = listener;},
      replaceChildren(...children){this.children = children;},
      removeAttribute(name){delete this[name];},
      focus(){document.activeElement = this;},
      showModal(){this.open = true;}, close(){this.open = false;},
      getBoundingClientRect:()=>({left:100, right:900, top:100, bottom:600})
    });
    return nodes.get(id);
  }
};
let writes = 0;
const ctx = vm.createContext({document, URL, isTaskLoading:false, currentTaskAnswered:false,
  DeltaSigmaCourseVideos:require('../static/course-videos.js'), pendingVideoTask:null,
  STUDENT_WORK_COURSE_PARTS:['praca_domowa','zadania_powtorkowe'],
  coursePartDisplayTitle:()=> 'Lekcja 1 - zadanie domowe 1', taskLabel:()=> 'Lekcja 1 - zadanie domowe 1',
  currentTask:{sourceId:'lesson1', file:'zd1.png', category:'kurs', level:'matura_podstawowa',
    coursePart:'praca_domowa', videoUrl:'https://youtu.be/F--EfH1oOnE'},
  sessionResults:new Map(), sessionScores:new Map(), getTaskKey:task=>`${task.sourceId}:${task.file}`,
  getSavedResult:task=>ctx.sessionResults.get(ctx.getTaskKey(task)),
  taskPointValue:()=>1, getTaskDurationSeconds:()=>12, getCurrentTaskDurationSeconds:()=>12,
  setSessionDuration(){}, saveGuestSessionProgress(){}, workTimer:{finish(){}}, disableMCQ(){},
  renderTaskNavigator(){}, renderSourceSelector(){}, updateSourceSummary(){}, updateScorePanel(){},
  scheduleCompletionSummary(){}, saveProgress:async(type,score)=>{
    writes++; assert.equal(type,'video'); assert.equal(score.earnedPoints,0);
  }
});
const start = html.indexOf('function taskVideoUrl('), end = html.indexOf('function setResultButtonsEnabled(', start);
vm.runInContext(html.slice(start, end), ctx);
const dialog=document.getElementById('taskVideoDialog'), player=document.getElementById('taskVideoPlayer');
const external=document.getElementById('taskVideoExternal'), consent=document.getElementById('taskVideoConsent');
const event=extra=>({preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
(async()=>{
  ctx.openTaskVideo(event());
  assert(dialog.open && !consent.hidden);
  assert.equal(player.children.length,0,'No player or external URL before confirmation');
  assert.equal(external.href,undefined);
  document.getElementById('taskVideoCancel').listeners.click();
  assert(!dialog.open); assert.equal(writes,0); assert.equal(ctx.sessionResults.size,0);
  ctx.openTaskVideo(event());
  await ctx.confirmTaskVideo();
  assert.equal(writes,1); assert.equal(ctx.sessionResults.get('lesson1:zd1.png'),'video');
  assert.equal(player.children.length,1);
  const frame=player.children[0];
  assert.equal(frame.src,'https://www.youtube-nocookie.com/embed/F--EfH1oOnE?autoplay=1&playsinline=1&rel=0');
  assert.equal(frame.referrerPolicy,'strict-origin-when-cross-origin');
  assert.equal(frame.allowFullscreen,true);
  assert.equal(external.href,ctx.currentTask.videoUrl);
  const escape=event({key:'Escape'});
  document.listeners.keydown.listener(escape);
  assert(document.listeners.keydown.capture && escape.prevented && escape.stopped);
  assert(!dialog.open && player.children.length===0 && !classes.has('task-video-open'));
  ctx.openTaskVideo(event()); await ctx.confirmTaskVideo();
  assert.equal(writes,1,'Reopening an already marked film does not create another attempt');
  dialog.listeners.click(event({target:dialog,currentTarget:dialog,clientX:50,clientY:50}));
  assert(!dialog.open && player.children.length===0);
  for(const url of ['javascript:alert(1)','https://youtu.be.evil.test/F--EfH1oOnE','https://youtu.be/F--EfH1oOnE?x=1']){
    assert.equal(ctx.taskVideoEmbedUrl({...ctx.currentTask,videoUrl:url}),'');
  }
  ctx.sessionResults.clear();
  ctx.saveProgress=async()=>{throw new Error('Offline');};
  ctx.openTaskVideo(event()); await ctx.confirmTaskVideo();
  assert.equal(ctx.sessionResults.size,0); assert.equal(player.children.length,0);
  assert(!document.getElementById('taskVideoError').hidden);
  assert(!document.getElementById('taskVideoConfirm').disabled);
  ctx.closeTaskVideo();
  let finish;
  ctx.saveProgress=()=>new Promise(resolve=>{finish=resolve;});
  ctx.openTaskVideo(event());
  const pending=ctx.confirmTaskVideo();
  await ctx.confirmTaskVideo();
  ctx.closeTaskVideo();
  ctx.currentTask={...ctx.currentTask,file:'zd2.png'};
  finish(); await pending;
  assert.equal(player.children.length,0,'A late save cannot start a film over another task');
  assert.equal(ctx.sessionResults.get('lesson1:zd1.png'),'video');
  assert.equal(ctx.sessionResults.has('lesson1:zd2.png'),false);
  assert.match(html,/function clearTaskInteraction\(\)\{\s*closeTaskVideo\(\);/);
  console.log('PASS: video consent, cancellation, persisted zero score, errors, reopen, Escape and late-save isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
