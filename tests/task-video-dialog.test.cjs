const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const nodes = new Map(), classes = new Set(), storage = new Map(), players = [], scripts = [];
const document = {
  listeners:{},
  addEventListener(type, listener, capture){this.listeners[type] = {listener, capture};},
  documentElement:{classList:{add:value=>classes.add(value), remove:value=>classes.delete(value)}},
  head:{appendChild:script=>scripts.push(script)},
  createElement:tagName=>({tagName, isConnected:false, remove(){this.isConnected=false;}}),
  getElementById(id){
    if(!nodes.has(id)) nodes.set(id, {
      open:false, children:[], listeners:{}, hidden:true, disabled:false,
      addEventListener(type, listener){this.listeners[type] = listener;},
      replaceChildren(...children){
        this.children.forEach(child=>{child.isConnected=false;});
        this.children = children;
        children.forEach(child=>{child.isConnected=true;});
      },
      removeAttribute(name){delete this[name];},
      focus(){document.activeElement = this;},
      showModal(){this.open = true;}, close(){this.open = false;},
      getBoundingClientRect:()=>({left:100, right:900, top:100, bottom:600})
    });
    return nodes.get(id);
  }
};
function Player(frame, options){
  assert.equal(options.host,'https://www.youtube-nocookie.com');
  this.events=options.events;
  this.calls=[];
  this.muted=false;
  this.playVideo=()=>this.calls.push('play');
  this.mute=()=>{this.muted=true;this.calls.push('mute');};
  this.unMute=()=>{this.muted=false;this.calls.push('unmute');};
  this.isMuted=()=>this.muted;
  this.destroy=()=>{this.calls.push('destroy');frame.isConnected=false;};
  players.push(this);
}
let writes = 0;
const ctx = vm.createContext({document, URL, isTaskLoading:false, currentTaskAnswered:false,
  window:{YT:{Player}, location:{protocol:'https:',origin:'https://deltasigma.pl'}},
  setTimeout, clearTimeout, loggedUser:{id:17},
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
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
  updateSupportActionHighlights(){},
  scheduleCompletionSummary(){}, saveProgress:async(type,score)=>{
    writes++; assert.equal(type,'video'); assert.equal(score.earnedPoints,0);
  }
});
const start = html.indexOf('const taskVideoConsentFallbacks ='), end = html.indexOf('function setResultButtonsEnabled(', start);
vm.runInContext(html.slice(start, end), ctx);
const dialog=document.getElementById('taskVideoDialog'), player=document.getElementById('taskVideoPlayer');
const consent=document.getElementById('taskVideoConsent');
const event=extra=>({preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  ctx.openTaskVideo(event());
  assert(dialog.open && !consent.hidden);
  assert.equal(player.children.length,0,'No player or external URL before confirmation');
  assert.equal(scripts.length,0,'The YouTube API is not loaded before consent');
  document.getElementById('taskVideoRemember').checked=true;
  document.getElementById('taskVideoCancel').listeners.click();
  assert(!dialog.open); assert.equal(writes,0); assert.equal(ctx.sessionResults.size,0);
  assert.equal(storage.size,0,'Cancellation does not remember consent');
  ctx.openTaskVideo(event());
  await ctx.confirmTaskVideo();
  assert.equal(writes,1); assert.equal(ctx.sessionResults.get('lesson1:zd1.png'),'video');
  assert.equal(player.children.length,1);
  const frame=player.children[0];
  const embed=new URL(frame.src);
  assert.equal(embed.origin,'https://www.youtube-nocookie.com');
  assert.equal(embed.pathname,'/embed/F--EfH1oOnE');
  assert.equal(embed.searchParams.get('autoplay'),'1');
  assert.equal(embed.searchParams.get('playsinline'),'1');
  assert.equal(embed.searchParams.get('controls'),'1');
  assert.equal(embed.searchParams.get('fs'),'1');
  assert.equal(embed.searchParams.get('enablejsapi'),'1');
  assert.equal(embed.searchParams.get('origin'),'https://deltasigma.pl');
  assert.equal(frame.referrerPolicy,'strict-origin-when-cross-origin');
  assert.equal(frame.allow,'autoplay; encrypted-media; picture-in-picture; fullscreen');
  assert.equal(frame.allowFullscreen,true);
  const controller=players.at(-1), sound=document.getElementById('taskVideoSound');
  controller.events.onReady({target:controller});
  assert.deepEqual(controller.calls,['play'],'The ready player starts without a YouTube play click');
  controller.events.onAutoplayBlocked({target:controller});
  assert.deepEqual(controller.calls,['play','mute','play']);
  assert(!sound.hidden,'A blocked sound autoplay switches to muted playback with a sound control');
  controller.events.onAutoplayBlocked({target:controller});
  assert.equal(controller.calls.length,3,'No endless autoplay retry loop');
  sound.listeners.click();
  assert.deepEqual(controller.calls.slice(-2),['unmute','play']);
  assert(sound.hidden);
  assert.equal(storage.size,0,'Consent is not remembered without opting in');
  const escape=event({key:'Escape'});
  document.listeners.keydown.listener(escape);
  assert(document.listeners.keydown.capture && escape.prevented && escape.stopped);
  assert(!dialog.open && player.children.length===0 && !classes.has('task-video-open'));
  assert.equal(controller.calls.at(-1),'destroy');
  controller.events.onAutoplayBlocked({target:controller});
  assert(sound.hidden,'Events from a closed player cannot change the sound control');
  ctx.openTaskVideo(event()); await ctx.confirmTaskVideo();
  assert.equal(writes,1,'Reopening an already marked film does not create another attempt');
  dialog.listeners.click(event({target:dialog,currentTarget:dialog,clientX:50,clientY:50}));
  assert(!dialog.open && player.children.length===0);
  for(const url of ['javascript:alert(1)','https://youtu.be.evil.test/F--EfH1oOnE','https://youtu.be/F--EfH1oOnE?x=1']){
    assert.equal(ctx.taskVideoEmbedUrl({...ctx.currentTask,videoUrl:url}),'');
  }
  ctx.sessionResults.clear();
  ctx.saveProgress=async()=>{throw new Error('Offline');};
  ctx.openTaskVideo(event());
  document.getElementById('taskVideoRemember').checked=true;
  await ctx.confirmTaskVideo();
  assert.equal(ctx.sessionResults.size,0); assert.equal(player.children.length,0);
  assert.equal(storage.size,0,'A failed save does not remember consent');
  assert(!document.getElementById('taskVideoError').hidden);
  assert(!document.getElementById('taskVideoConfirm').disabled);
  ctx.closeTaskVideo();
  let finish;
  ctx.saveProgress=()=>new Promise(resolve=>{finish=resolve;});
  ctx.openTaskVideo(event());
  const pending=ctx.confirmTaskVideo();
  assert.equal(player.children.length,1,'The player starts synchronously from the confirmation click');
  await ctx.confirmTaskVideo();
  ctx.closeTaskVideo();
  ctx.currentTask={...ctx.currentTask,file:'zd2.png'};
  finish(); await pending;
  assert.equal(player.children.length,0,'A late save cannot start a film over another task');
  assert.equal(ctx.sessionResults.get('lesson1:zd1.png'),'video');
  assert.equal(ctx.sessionResults.has('lesson1:zd2.png'),false);

  ctx.saveProgress=async()=>{writes++;};
  ctx.openTaskVideo(event());
  document.getElementById('taskVideoRemember').checked=true;
  await ctx.confirmTaskVideo();
  assert.equal(storage.get('deltaSigmaTaskVideoConsent:v1:17'),'1');
  ctx.closeTaskVideo();
  vm.runInContext('taskVideoConsentFallbacks.clear()',ctx);
  ctx.currentTask={...ctx.currentTask,file:'zd3.png'};
  ctx.openTaskVideo(event());
  assert(consent.hidden && player.children.length===1,'Stored consent immediately starts the next film');
  await flush();
  assert.equal(ctx.sessionResults.get('lesson1:zd3.png'),'video','Skipping the warning still gives the task zero points');
  ctx.closeTaskVideo();
  ctx.loggedUser={id:18};
  ctx.openTaskVideo(event());
  assert(!consent.hidden && player.children.length===0,'Consent is isolated per account');
  ctx.closeTaskVideo();

  ctx.localStorage={getItem(){throw new Error('Blocked');},setItem(){throw new Error('Blocked');}};
  ctx.openTaskVideo(event());
  document.getElementById('taskVideoRemember').checked=true;
  await ctx.confirmTaskVideo();
  ctx.closeTaskVideo();
  ctx.openTaskVideo(event());
  assert(consent.hidden && player.children.length===1,'Blocked storage retains consent for this page session');
  await flush();
  ctx.closeTaskVideo();

  ctx.loggedUser={id:19};
  ctx.window.YT=undefined;
  ctx.openTaskVideo(event());
  const before=players.length;
  await ctx.confirmTaskVideo();
  assert.equal(scripts.at(-1).src,'https://www.youtube.com/iframe_api');
  ctx.closeTaskVideo();
  ctx.window.YT={Player};
  ctx.window.onYouTubeIframeAPIReady();
  await flush();
  assert.equal(players.length,before,'A late API load cannot create a player after closing');

  ctx.window.YT=undefined;
  vm.runInContext('taskVideoApiPromise = null',ctx);
  ctx.openTaskVideo(event());
  await ctx.confirmTaskVideo();
  const originalSrc=player.children[0].src;
  scripts.at(-1).onerror();
  await flush();
  assert.equal(new URL(player.children[0].src).searchParams.get('controls'),'1','API failure keeps native controls usable');
  assert.equal(player.children[0].src,originalSrc,'An unavailable API does not reload or restart the native player');
  ctx.closeTaskVideo();
  ctx.currentTask={...ctx.currentTask,activityType:'test'};
  ctx.openTaskVideo(event());
  assert(!dialog.open && player.children.length===0,'Films remain unavailable in tests');
  assert.match(html, /id="taskVideoRemember" type="checkbox"/);
  assert.match(html, /script-src[^;]*https:\/\/www.youtube.com[^;]*https:\/\/s.ytimg.com/);
  assert.match(html,/function clearTaskInteraction\(\)\{\s*closeTaskVideo\(\);/);
  console.log('PASS: autoplay, muted fallback, sound control, account-scoped remembered consent, cancellation, errors, Escape and late callbacks');
})().catch(error=>{console.error(error);process.exitCode=1;});
