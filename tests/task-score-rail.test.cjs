const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');

const html = fs.readFileSync('zadania.html', 'utf8');
const css = fs.readFileSync('static/workspace-score.css', 'utf8');
const DSWorkspaceScore = require('../static/workspace-score.js');
function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}

function fixture() {
  const track = {attrs:{'aria-hidden':'true'},
    setAttribute(key,value) {this.attrs[key] = value;},
    removeAttribute(key) {delete this.attrs[key];}};
  const fill = {parentElement:track, style:{}};
  const rail = {hidden:true};
  const ctx = vm.createContext({selectedCategory:'kurs', DSWorkspaceScore,
    isCourseCategory:() => ['kurs','testy'].includes(ctx.selectedCategory),
    sourceScoreLabel:summary => `${summary.earnedPoints} / ${summary.totalPoints} pkt`,
    document:{getElementById:id => ({taskScoreRail:rail, sourceSummaryFill:fill})[id]}});
  vm.runInContext(functionSource('updateTaskScoreRail'), ctx);
  return {ctx,rail,fill,track};
}

test('the rail fills bottom-up from the actual source score and resets on source changes', () => {
  const {ctx,rail,fill,track} = fixture();
  const summary = {tasks:[{}], earnedPoints:6, totalPoints:18, percent:100/3};
  ctx.updateTaskScoreRail(summary);
  assert.equal(rail.hidden, false);
  assert.equal(fill.style.width, '100%');
  assert.equal(fill.style.height, `${100/3}%`);
  assert.equal(track.attrs.role, 'progressbar');
  assert.equal(track.attrs['aria-orientation'], 'vertical');
  assert.equal(track.attrs['aria-valuenow'], String(100/3));
  assert.equal(track.attrs['aria-valuetext'], '6 / 18 pkt');
  assert(!('aria-hidden' in track.attrs));
  ctx.updateTaskScoreRail({...summary, earnedPoints:0, percent:0});
  assert.equal(fill.style.height, '0%');
  ctx.updateTaskScoreRail({...summary, earnedPoints:18, percent:100});
  assert.equal(fill.style.height, '100%');
  ctx.updateTaskScoreRail();
  assert.equal(rail.hidden, true);
  assert.equal(fill.style.height, '0%');
});

test('tests and exams use the same vertical score', () => {
  const {ctx,rail,fill,track} = fixture();
  const summary = {tasks:[{}], earnedPoints:7, totalPoints:10, percent:70};
  ctx.selectedCategory = 'testy';
  ctx.sourceScoreLabel = () => '70%';
  ctx.updateTaskScoreRail(summary);
  assert.equal(track.attrs['aria-label'], 'Wynik testu');
  assert.equal(track.attrs['aria-valuetext'], '70%');
  assert.equal(fill.style.height, '70%');
  ctx.selectedCategory = 'egzaminy';
  ctx.updateTaskScoreRail(summary);
  assert.equal(rail.hidden, false);
  assert.equal(fill.style.width, '100%');
  assert.equal(fill.style.height, '70%');
  assert.equal(track.attrs['aria-orientation'], 'vertical');
  ctx.selectedCategory = 'kurs';
  ctx.updateTaskScoreRail({...summary, percent:120});
  assert.equal(fill.style.height, '100%');
  ctx.updateTaskScoreRail({...summary, percent:-4});
  assert.equal(fill.style.height, '0%');
});

test('the rail spans the task header, image and answers, but not navigation or task numbers', () => {
  const start = html.indexOf('<div class="task-workspace">');
  const end = html.indexOf('<div class="interaction-panel">', start);
  const workspace = html.slice(start, end);
  for (const id of ['metaBox','taskImage','contextImage','mcq','answer','taskScoreRail']) {
    assert(workspace.includes(`id="${id}"`), id);
  }
  assert(html.indexOf('id="progress"') < start);
  assert.match(css, /\.task-score-rail \.source-summary-track \{[^}]*position: absolute;[^}]*inset: 0 auto 0 0;[^}]*height: auto;/);
  assert.match(css, /\.task-score-rail \.source-summary-fill \{[^}]*inset: auto 0 0;[^}]*background: #54a468;[^}]*transition: height/);
  assert.match(css, /@media\(prefers-reduced-motion: reduce\) \{\s*\.task-score-rail \.source-summary-fill \{\s*transition: none;/);
  assert.match(css, /\.task-content \{\s*container-type: inline-size;/);
  assert.match(html, /@container \(max-width: 360px\) \{\s*\.tf-row \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    'Narrow tasks put statement labels above answer buttons instead of clipping them');
});

test('score calculation still awards full points to hinted correct answers, not wrong/video/review-only tasks', () => {
  const ctx = vm.createContext({
    selectedSource:'lesson', getSourceMetaById:() => ({kind:'lesson'}), formatPoints:String,
    getSavedResult:task => task.result,
    taskPointValue:task => task.max,
    getTaskScore:task => task.score,
    SKIPPED_RESULT:'skipped'
  });
  vm.runInContext(functionSource('calculateSourceSummary'), ctx);
  const summary = ctx.calculateSourceSummary([
    {max:2, result:'good_hint', score:{earnedPoints:2}},
    {max:1, result:'bad', score:{earnedPoints:0}},
    {max:1, result:'video', score:{earnedPoints:0}},
    {max:1, result:'', score:null}
  ]);
  assert.equal(summary.earnedPoints, 2);
  assert.equal(summary.totalPoints, 5);
  assert.equal(summary.percent, 40);
});
