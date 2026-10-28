const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('admin.html','utf8');

function load(context,names) {
  for(const name of names) {
    const start = html.indexOf(`function ${name}(`);
    assert(start >= 0,name);
    vm.runInContext(html.slice(start,html.indexOf('\n}',start)+2),context);
  }
}
const level = 'matura_podstawowa';
const catalog = [
  {sourceId:'lesson.json',sourceLabel:'Lekcja 1',file:'zd1.webp',category:'kurs',coursePart:'praca_domowa',level,maxPoints:1},
  {sourceId:'test.json',sourceLabel:'Test 1-6',sourceKind:'test',file:'1.webp',category:'kurs',coursePart:'praca_domowa',level,maxPoints:1},
  {sourceId:'test.json',sourceLabel:'Test 1-6',sourceKind:'test',file:'2.webp',category:'kurs',coursePart:'praca_domowa',level,maxPoints:2},
];
const context = vm.createContext({adminTaskCatalog:catalog});
load(context,['progressSourceId','progressFile','progressTaskKey','isIndependentWorkTask',
  'latestProgressMap','numberValue','taskMaxPoints','isTeacherReviewPending','inferredTaskScore',
  'sourceYear','taskNumberFromFile','taskOrderValue','timestamp','sourceProgressGroups','groupScorePercent']);
const groups = context.sourceProgressGroups([],{level});
assert.equal(groups.length,1,'Unstarted tests are visible without creating empty homework lesson rows');
assert.equal(groups[0].kind,'test');
assert.equal(groups[0].total,2);
assert.equal(groups[0].completed,false);
const started = context.sourceProgressGroups([
  {source_id:'lesson.json',file:'zd1.webp',result:'good',earned_points:1},
  {source_id:'test.json',file:'1.webp',result:'good',earned_points:1},
  {source_id:'test.json',file:'2.webp',result:'bad',earned_points:0},
],{level});
assert.equal(started.filter(group => group.kind === 'test').length,1);
assert.equal(started.filter(group => group.category === 'kurs' && group.kind !== 'test').length,1);
assert.match(html,/courseGroups = groups.filter\(group => group.category === "kurs" && group.kind !== "test"\)/);
assert.match(html,/sourceProgress.appendChild\(renderTestHistory\(testGroups, selectSource\)\)/);
assert.match(html,/isCourse && !isCourseTest && task.coursePart/,'Test tasks do not get a homework heading');

class Element {
  constructor(tag) {this.tag=tag;this.children=[];this.dataset={};this.listeners={};this.attributes={};}
  set innerHTML(value) {if(value.includes('<tbody>')) this.tbody = new Element('tbody');}
  appendChild(child) {this.children.push(child);return child;}
  append(...children) {this.children.push(...children);}
  querySelector() {return this.tbody;}
  setAttribute(name,value) {this.attributes[name]=String(value);}
  addEventListener(name,callback) {this.listeners[name]=callback;}
}
const ui = vm.createContext({activeSourceDetailKey:'',document:{createElement:tag => new Element(tag)},
  groupScorePercent:context.groupScorePercent,formatDate:value => value || '-',
  formatDuration:seconds => `${seconds} s`,
  sumDuration:items => items.reduce((sum, item) => sum + (Number(item.duration_seconds) || 0), 0),
  renderSourceDetail:group => ({key:group.key})});
load(ui,['renderSourceActivity','renderTestHistory']);
const test = started.find(group => group.kind === 'test');
const selected=[];
const section = ui.renderTestHistory([test,groups[0]],(key,focus) => selected.push([key,focus]));
assert.equal(section.children[0].innerText,'Testy');
const rows=section.children[1].children[0].tbody.children;
assert.equal(rows[0].children[1].children[0].textContent,'Ukończony');
assert.equal(rows[0].children[2].textContent,'33%');
assert.equal(rows[1].children[1].children[0].textContent,'Nie rozpoczęto');
assert.equal(rows[1].children[2].textContent,'-');
rows[0].listeners.click();
rows[0].listeners.keydown({key:'Enter',preventDefault(){}});
assert.deepEqual(selected,[[test.key,undefined],[test.key,true]]);
ui.activeSourceDetailKey=test.key;
const expanded=ui.renderTestHistory([test],() => {}).children[1].children[0].tbody.children;
assert.equal(expanded.length,2);
assert.equal(expanded[0].attributes['aria-expanded'],'true');
assert.equal(expanded[1].children[0].children[0].key,test.key,'Details stay directly under the selected test');
ui.activeSourceDetailKey='';
const pending=ui.renderTestHistory([{...test,pendingReview:2}],()=>{})
  .children[1].children[0].tbody.children[0];
assert.equal(pending.children[1].children[0].textContent,'Do oceny: 2');
assert(pending.children[1].children[0].className.includes('teacher-pending'));
assert.match(pending.children[2].title,/Wynik wstępny/);
console.log('PASS: separate admin test history, unstarted tests, whole percentage results and inline accessible details');
