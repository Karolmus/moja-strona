const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const DSWorkspaceScore = require('../static/workspace-score.js');
const html = fs.readFileSync('zadania.html', 'utf8');
const training = fs.readFileSync('trening.html', 'utf8');

function load(context, text, names) {
  for (const name of names) {
    const match = new RegExp(`(?:async )?function ${name}\\(`).exec(text);
    assert(match, name);
    vm.runInContext(text.slice(match.index, text.indexOf('\n}', match.index) + 2), context);
  }
}

test('result colors include 50% and 80% in the yellow interval', () => {
  for (const [score,tone] of [[0,'low'],[49.99,'low'],[50,'medium'],[79.99,'medium'],
    [80,'medium'],[80.01,'high'],[100,'high']]) assert.equal(DSWorkspaceScore.tone(score), tone);
  for (const [value,expected] of [[undefined,0],[NaN,0],[-5,0],[120,100],['75',75]]) {
    assert.equal(DSWorkspaceScore.percent(value), expected);
  }
});

test('only completed and fully assessed papers get a percentage badge, including zero', () => {
  let loaded = true;
  let items = [{result:'good',max:2,score:{earnedPoints:2}}, {result:'bad',max:2,score:{earnedPoints:0}}];
  const ctx = vm.createContext({DSWorkspaceScore, SKIPPED_RESULT:'skipped',
    isTaskSourceLoaded:() => loaded, getSourceCompletionTasks:() => items,
    getSavedResult:task => task.result, getTaskScore:task => task.score,
    taskPointValue:task => task.max, formatPoints:String,
    getSourceMetaById:() => ({kind:'exam'}), selectedSource:'paper',
    document:{createElement:() => ({})}
  });
  load(ctx,html,['calculateSourceSummary','examSourceResult','decorateExamResult']);
  const source = {id:'paper'};
  const button = () => ({children:[],title:'Maj 2026',appendChild(child){this.children.push(child);},
    setAttribute(name,value){this[name] = value;}});
  for (const [earned,expected,tone] of [[0,'0%','low'],[1,'25%','low'],[2,'50%','medium'],[4,'100%','high']]) {
    items = [{result:earned ? 'good':'bad',max:4,score:{earnedPoints:earned}}];
    const tile = button();
    ctx.decorateExamResult(tile,source);
    assert.equal(tile.children[0].textContent,expected);
    assert(tile.children[0].className.includes(`result-tone-${tone}`));
    assert(tile['aria-label'].includes(`Wynik: ${expected}`));
  }
  for (const incomplete of [[],[{result:'',max:1,score:null}],
    [{result:'skipped',max:1,score:{earnedPoints:0}}], [{result:'submitted',max:2,score:null}]]) {
    items = incomplete;
    const tile = button();
    ctx.decorateExamResult(tile,source);
    assert.equal(tile.children.length,0);
  }
  loaded = false;
  items = [{result:'good',max:1,score:{earnedPoints:1}}];
  assert.equal(ctx.examSourceResult(source),null,'An incomplete catalog cannot produce a misleading score');
});

test('exam year filtering changes only the picker and preserves chronological order', () => {
  const row = {hidden:true};
  const select = {dataset:{},children:[],set innerHTML(value){this.children = [];},
    appendChild(child){this.children.push(child);}};
  const ctx = vm.createContext({selectedCategory:'egzaminy',selectedExamYear:'all', selectedSource:'paper-2026',
    document:{getElementById:id => ({examYearFilterRow:row,examYearFilter:select})[id],createElement:() => ({})}});
  load(ctx,html,['filterExamPickerSources','setExamYear']);
  const sources = [{year:2026,id:'a'},{year:2025,id:'b'},{year:2025,id:'c'},{year:2024,id:'d'}];
  assert.equal(ctx.filterExamPickerSources(sources),sources);
  assert.deepEqual(select.children.map(option => option.value),['all','2026','2025','2024']);
  const oldOptions = select.children.slice();
  ctx.renderSourceSelector = () => {ctx.filtered = ctx.filterExamPickerSources(sources);};
  ctx.setExamYear('2025');
  assert.deepEqual(Array.from(ctx.filtered,item => item.id),['b','c']);
  assert.deepEqual(select.children,oldOptions,'Score updates do not recreate the focused year selector');
  assert.equal(ctx.selectedSource,'paper-2026','Filtering does not abandon the current question');
  ctx.setExamYear('1900');
  assert.equal(ctx.selectedExamYear,'all');
  ctx.selectedCategory = 'testy';
  assert.equal(ctx.filterExamPickerSources(sources),sources);
  assert.equal(row.hidden,true);
});

test('saved paper catalogs load in bounded batches, ignore untouched papers and retry failures', async () => {
  const sources = Array.from({length:8},(_,index) => ({id:`paper-${index}`}));
  const loaded = new Set(['paper-0']);
  const requested = [];
  let active = 0, peak = 0, fail = true, renders = 0;
  const ctx = vm.createContext({selectedCategory:'egzaminy',
    savedProgress:sources.slice(0,6).map(source => ({source_id:source.id})),
    sessionResults:new Map([['paper-6:1.webp','good']]),
    getProgressSourceId:item => item.source_id, getAvailableSources:() => sources,
    isTaskSourceLoaded:id => loaded.has(id), console:{warn(){}},
    renderSourceSelector:() => {renders++;},
    ensureTaskSourceLoaded:async id => {
      requested.push(id); active++; peak = Math.max(peak,active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      if(id === 'paper-3' && fail) throw new Error('temporarily unavailable');
      loaded.add(id);
    }
  });
  load(ctx,html,['preloadExamResultSources']);
  await ctx.preloadExamResultSources();
  assert.equal(peak,4);
  assert.deepEqual(requested,['paper-1','paper-2','paper-3','paper-4','paper-5','paper-6']);
  assert.equal(renders,2);
  fail = false;
  requested.length = 0;
  await ctx.preloadExamResultSources();
  assert.deepEqual(requested,['paper-3']);
  ctx.selectedCategory = 'kurs';
  requested.length = 0;
  await ctx.preloadExamResultSources();
  assert.equal(requested.length,0);
  const boot = html.slice(html.indexOf('async function bootStudentPanel('),html.indexOf('function sourceLoadErrorMessage('));
  assert(!boot.includes('await preloadExamResultSources()'),'Score badges never delay the first task');
});

test('speed training updates the same score rail after correct, incorrect and reset events', () => {
  const track = {attrs:{},setAttribute(key,value){this.attrs[key] = value;},removeAttribute(){}};
  const fill = {style:{}};
  const points = {}, percentage = {};
  const ctx = vm.createContext({DSWorkspaceScore, state:{correct:0,mistakes:0},
    document:{getElementById:id => ({trainingScorePoints:points,trainingScorePercent:percentage,
      trainingScoreTrack:track,trainingScoreFill:fill})[id]}});
  load(ctx,training,['updateTrainingScore']);
  for (const [correct,mistakes,percent] of [[0,0,0],[1,0,100],[1,1,50],[0,4,0],[3,1,75],[0,0,0]]) {
    ctx.state.correct = correct; ctx.state.mistakes = mistakes;
    ctx.updateTrainingScore();
    assert.equal(points.innerText,`${correct} / ${correct + mistakes}`);
    assert.equal(percentage.innerText,`${percent}%`);
    assert.equal(fill.style.height,`${percent}%`);
    assert.equal(track.attrs['aria-orientation'],'vertical');
  }
  assert.match(training,/href="zadania.html\?category=kurs"[\s\S]*href="zadania.html\?category=testy"[\s\S]*href="zadania.html\?category=egzaminy"/);
  assert(training.indexOf('id="topicList"') < training.indexOf('class="training-stage"'));
  for (const file of ['zadania.html','trening.html']) {
    const text = fs.readFileSync(file,'utf8');
    assert(text.includes('static/workspace-score.css?v=20261016'));
    assert(text.includes('static/workspace-score.js?v=20261016'));
  }
});
