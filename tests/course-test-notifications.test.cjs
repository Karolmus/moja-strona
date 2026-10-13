const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const taskHtml = fs.readFileSync('zadania.html', 'utf8');
const profileHtml = fs.readFileSync('profil.html', 'utf8');

class Element {
  constructor() {this.children = []; this.listeners = {}; this.hidden = true;}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children = children;}
  addEventListener(name, callback) {this.listeners[name] = callback;}
}
const context = vm.createContext({window:{},document:{createElement:() => new Element()}});
vm.runInContext(fs.readFileSync('static/course-tests.js', 'utf8'), context);
const {pendingTests,renderNotice} = context.window.DSCourseTests;
const lessons = Array.from({length:6}, (_, index) => ({id:`lesson-${index+1}`,label:`Lekcja ${index+1}`}));
const a = {id:'test-A',kind:'test',label:'Test 1-6'};
const b = {id:'test-B',kind:'test',label:'Test B',optional:true};
const harder = {id:'test-harder',kind:'test',optional:true};
const next = {id:'lesson-7'};
const second = {id:'test-C',kind:'test'};
const sources = [...lessons,a,b,harder,next,second];
const complete = new Set();
const started = new Set();
const pending = () => pendingTests(sources, source => complete.has(source.id), source => started.has(source.id));
assert.equal(pending().length,0,'Do not notify a fresh account before the prerequisite homework is complete');
for(const lesson of lessons.slice(0,-1)) complete.add(lesson.id);
assert.equal(pending().length,0,'One unfinished lesson prevents a premature reminder');
complete.add(lessons.at(-1).id);
assert.deepEqual(Array.from(pending(),source => source.id),['test-A']);
complete.add(a.id);
assert.equal(pending().length,0,'A completed test is not due; optional tests never become obligations');
complete.add(next.id);
assert.deepEqual(Array.from(pending(),source => source.id),['test-C'],'A later lesson block has its own reminder');
complete.delete(a.id);
started.add(second.id);
assert.deepEqual(Array.from(pending(),source => source.id),['test-A'],'A started later test cannot bypass an unfinished checkpoint');
complete.clear(); started.clear(); started.add(a.id);
assert.deepEqual(Array.from(pending(),source => source.id),['test-A'],'Remind about an already-started test even without prerequisite homework');
assert.equal(pendingTests([{kind:'test',id:'empty'}], () => false, () => false).length,0);

const notice = new Element();
let opened = null;
renderNotice(notice,[a],sourceId => {opened = sourceId;});
assert.equal(notice.hidden,false);
assert.equal(notice.children[0].children[0].textContent,'Masz test do wykonania');
assert.equal(notice.children[1].href,'zadania.html?category=kurs&test=test-A');
let prevented = false;
notice.children[1].listeners.click({preventDefault(){prevented = true;}});
assert(prevented); assert.equal(opened,a.id);
renderNotice(notice,[]);
assert.equal(notice.hidden,true); assert.equal(notice.children.length,0);

function load(context, html, names) {
  for(const name of names) {
    const start = html.indexOf(`function ${name}(`);
    assert(start >= 0,name);
    vm.runInContext(html.slice(start,html.indexOf('\n}',start)+2),context);
  }
}
const progress = new Map();
const taskSources = [...lessons,a,b].map(source => ({...source,category:'kurs',level:'matura_podstawowa'}));
const courseTasks = taskSources.flatMap(source => ['zd1.webp','zp1.webp'].map(file => ({sourceId:source.id,file})));
const tasks = vm.createContext({
  window:context.window,isLoggedInStudent:true,loggedUser:{role:'student'},selectedLevel:'matura_podstawowa',
  COURSE_COMPLETION_RESULTS:new Set(['good','medium','bad','video']),
  getCourseSourceSequence:() => taskSources,isCourseSourceVisible:() => true,isTaskSourceLoaded:() => true,
  getSourceCompletionTasks:source => courseTasks.filter(task => task.sourceId === source.id),
  getSavedProgressItem:task => progress.get(`${task.sourceId}:${task.file}`),storedTestDeadline:() => 0,
});
load(tasks,taskHtml,['getPendingCourseTests']);
for(const task of courseTasks.filter(task => task.sourceId.startsWith('lesson'))) progress.set(`${task.sourceId}:${task.file}`,{result:'good'});
assert.equal(tasks.getPendingCourseTests()[0].id,a.id);
progress.set('lesson-6:zp1.webp',{result:'skipped'});
assert.equal(tasks.getPendingCourseTests().length,0,'A skipped revision task is not completion');
progress.set('lesson-6:zp1.webp',{result:'bad'});
assert.equal(tasks.getPendingCourseTests()[0].id,a.id,'Readiness is based on completion, not a minimum score');
tasks.isTaskSourceLoaded = sourceId => sourceId !== 'lesson-3';
assert.equal(tasks.getPendingCourseTests().length,0,'A failed prerequisite download does not create a reminder');
tasks.isTaskSourceLoaded = () => true;
tasks.loggedUser = {role:'admin'};
assert.equal(tasks.getPendingCourseTests().length,0,'Admin previews do not receive student obligations');
tasks.loggedUser = null;tasks.isLoggedInStudent = false;
assert.equal(tasks.getPendingCourseTests().length,0,'Guests do not receive private notifications');

const profileNotice = new Element();
const profileSources = taskSources.map(source => ({...source,path:source.id,
  filesByPart:new Map([['praca_domowa',new Set(['zd1.webp'])],['zadania_powtorkowe',new Set(['zp1.webp'])]])}));
const profile = vm.createContext({window:context.window,sourceCatalog:profileSources,
  document:{getElementById:() => profileNotice}});
load(profile,profileHtml,['progressSourceId','progressFile','progressKey','sourceCompletionFiles','renderProfileTestNotice']);
const saved = Array.from(progress,([key,item]) => ({source_id:key.split(':')[0],file:key.split(':')[1],...item}));
profile.renderProfileTestNotice({level:'matura_podstawowa'},saved);
assert.equal(profileNotice.hidden,false,'Profile shows the same due test as the course');
profile.renderProfileTestNotice({level:'matura_podstawowa'},[...saved,
  {source_id:a.id,file:'zd1.webp',result:'good'},{source_id:a.id,file:'zp1.webp',result:'bad'}]);
assert.equal(profileNotice.hidden,true,'Completion removes the profile notification');

tasks.window = {location:{search:'?test=test-A'}};
tasks.getSourceMetaById = sourceId => taskSources.find(source => source.id === sourceId);
tasks.URLSearchParams = URLSearchParams;
tasks.isLoggedInStudent = true;
load(tasks,taskHtml,['getRequestedTestSource']);
assert.equal(tasks.getRequestedTestSource().id,a.id);
tasks.window.location.search = '?test=lesson-1';
assert.equal(tasks.getRequestedTestSource(),null);
tasks.window.location.search = '?test=test-A'; tasks.selectedLevel = 'egzamin_osmoklasisty';
assert.equal(tasks.getRequestedTestSource(),null,'A notification link cannot open another assigned course');
tasks.selectedLevel = 'matura_podstawowa'; tasks.isCourseSourceVisible = () => false;
assert.equal(tasks.getRequestedTestSource(),null,'Locked optional tests cannot be opened by editing the URL');
assert.match(taskHtml,/const requestedTest = getRequestedTestSource\(\);[\s\S]*?if\(!await ensureTestSourceStarted\(selectedSource\)\)/);
for(const html of [taskHtml,profileHtml]) {
  assert.match(html,/static\/course-tests.js\?v=20261012/);
  for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
}
console.log('PASS: test reminders, course/profile agreement, optional exclusions, prerequisite failures and guarded test links');
