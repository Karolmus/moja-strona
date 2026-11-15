const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const script=fs.readFileSync('static/admin-training.js','utf8');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.listeners={};}
  append(...nodes){this.children.push(...nodes);}
  appendChild(node){this.append(node);return node;}
  replaceChildren(...nodes){this.children=nodes;this.textContent='';}
  setAttribute(name,value){this[name]=value;}
  removeAttribute(name){delete this[name];}
  addEventListener(name,action){this.listeners[name]=action;}
  querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)]);}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const record=id=>({id,created_at:'2026-11-15T10:00:00Z',level:'mp',topic:'formulas-v1-lesson_1',
  round_seconds:60,correct_count:12,mistake_count:3,best_streak:6,average_time_seconds:2.5});
function setup(){
  const calls=[];
  const root={apiFetch:async path=>{calls.push(path);return {history:[record(21)],summary:{rounds:2,correct:24,mistakes:6,seconds:120},next_cursor:21};}};
  vm.runInNewContext(script,{window:root,document:{createElement:tag=>new Element(tag)}});
  const host=new Element('div');
  root.DSAdminTraining.show({id:7},host);
  const details=host.children[0];
  const open=()=>{details.open=true;details.listeners.toggle();};
  return {root,host,details,calls,open};
}
test('training opens lazily and displays student results, full summary and older pages',async()=>{
  const f=setup();
  assert.equal(f.calls.length,0);
  f.open();await tick();
  assert.deepEqual(f.calls,['/api/admin/students/7/speed-training']);
  const body=f.details.children[1];
  assert.equal(body.querySelectorAll('td').length,7);
  assert(body.querySelectorAll('td').some(n=>n.textContent==='MP · Lekcja 1'));
  assert(body.querySelectorAll('td').some(n=>n.textContent==='80%'));
  assert(body.querySelectorAll('td').some(n=>n.textContent==='2,5 s'));
  const more=body.querySelectorAll('button')[0];
  f.root.apiFetch=async path=>{f.calls.push(path);return {history:[record(20)],summary:{rounds:2,correct:24,mistakes:6,seconds:120},next_cursor:null};};
  await more.listeners.click();
  assert.equal(f.calls[1],'/api/admin/students/7/speed-training?before=21');
  assert.equal(body.querySelectorAll('td').length,14);
  assert.equal(body.querySelectorAll('button').length,0);
});
test('training handles no results and network errors with a working retry',async()=>{
  const f=setup();
  f.root.apiFetch=async()=>{throw new Error('Brak połączenia');};
  f.open();await tick();
  const status=f.details.children[2];
  assert.equal(status.children[0].textContent,'Brak połączenia');
  f.root.apiFetch=async()=>({history:[],summary:{rounds:0,correct:0,mistakes:0,seconds:0},next_cursor:null});
  await status.querySelectorAll('button')[0].listeners.click();
  assert.equal(status.hidden,true);
  assert.equal(f.details.children[1].children.at(-1).textContent,'Brak zapisanych treningów szybkości.');
});
test('a delayed response cannot populate another student or reopen a closed preview',async()=>{
  const f=setup();let finish;
  f.root.apiFetch=()=>new Promise(resolve=>{finish=resolve;});
  f.open();
  f.root.DSAdminTraining.show({id:8},f.host);
  finish({history:[record(1)],summary:{rounds:1,correct:12,mistakes:3,seconds:60},next_cursor:null});
  await tick();
  assert.equal(f.host.querySelectorAll('td').length,0);
  f.root.DSAdminTraining.clear();
  const details=f.host.children[0];details.open=true;details.listeners.toggle();
  assert.equal(details.children[1].children.length,0);
});
test('new tab names preserve internal categories and speed training links',()=>{
  for(const file of ['zadania.html','trening.html']){
    const html=fs.readFileSync(file,'utf8');
    assert(html.includes('>Testy ćwiartkowe</'));
    assert(html.includes('>Egzaminy CKE</'));
  }
  const admin=fs.readFileSync('admin.html','utf8');
  assert(admin.includes('globalThis.DSAdminTraining?.show(student, progressDetail.querySelector("#studentTraining"))'));
  assert(admin.includes('globalThis.DSAdminTraining?.clear()'));
});
test('training history overrides the legacy table width and stacks rows on mobile',()=>{
  const css=fs.readFileSync('static/admin-training.css','utf8');
  assert.match(css, /#studentTraining\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.student-training \.training-history\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /@media\(max-width: 760px\)/);
  assert.match(css, /\.training-history tr\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});
