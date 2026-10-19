const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const script = fs.readFileSync('static/mobile-exams.js', 'utf8');
const css = fs.readFileSync('static/mobile-exams.css', 'utf8');
const html = fs.readFileSync('zadania.html', 'utf8');

function fixture() {
  const ids = ['levelPickerToggle', 'levelPickerValue', 'guestLevelSection', 'examPickerToggle',
    'examPickerValue', 'examYearFilterRow', 'sourceList', 'taskNavigatorToggle', 'taskNavigatorValue', 'progress'];
  const classes = new Set(), animations = [], events = {};
  const document = {activeElement:null, body:{classList:{toggle(name, on) {
    if (on) classes.add(name); else classes.delete(name);
  }}}, addEventListener(name, action) {events[name] = action;}};
  const nodes = Object.fromEntries(ids.map(id => [id, {
    id, attrs:{}, children:[], listeners:{}, textContent:'', hidden:false,
    setAttribute(name, value) {this.attrs[name] = value;},
    addEventListener(name, action) {this.listeners[name] = action;},
    contains(node) {return node === this || this.children.includes(node);},
    focus(options) {document.activeElement = this; this.focusOptions = options;}
  }]));
  const activeTile = {scrollIntoView(options) {this.scrollOptions = options;}};
  const navigation = {top:0, getBoundingClientRect() {return {top:this.top};},
    scrollIntoView(options) {this.scrollOptions = options;}};
  const content = {animate(frames, options) {
    const animation = {frames, options, cancellations:0, cancel() {this.cancellations++;}};
    animations.push(animation);
    return animation;
  }};
  document.getElementById = id => nodes[id];
  document.querySelector = selector => selector === '.task-content' ? content
    : selector === '.task-navigation' ? navigation : activeTile;
  const media = matches => ({matches, addEventListener(name, action) {this[name] = action;}});
  const mobile = media(true), reduced = media(false);
  const root = {document, matchMedia:query => query.includes('prefers-reduced-motion') ? reduced : mobile};
  vm.runInNewContext(script, {window:root});
  const api = root.DSMobileExam;
  const sync = overrides => api.sync({category:'egzaminy', level:'mp', levelLabel:'Matura podstawowa', paperLabel:'Maj 2025', ...overrides});
  const click = id => nodes[id].listeners.click();
  const expanded = id => nodes[id].attrs['aria-expanded'];
  return {nodes, document, mobile, reduced, api, sync, click, expanded, classes, content, animations, events, activeTile, navigation};
}

test('mobile exams start with three collapsed controls and short current-selection labels', () => {
  const f = fixture(); f.sync(); f.api.navigator({label:'12.1', count:35});
  assert(f.classes.has('mobile-exam-view'));
  for (const id of ['levelPickerToggle', 'examPickerToggle', 'taskNavigatorToggle']) assert.equal(f.expanded(id), 'false');
  assert.equal(f.nodes.levelPickerValue.textContent, 'Matura podstawowa');
  assert.equal(f.nodes.examPickerValue.textContent, 'Maj 2025');
  assert.equal(f.nodes.taskNavigatorValue.textContent, 'Zadanie 12.1 z 35');
  assert.equal(f.nodes.taskNavigatorToggle.hidden, false);
  f.api.navigator({label:'', count:0});
  assert.equal(f.nodes.taskNavigatorToggle.hidden, true);
});

test('choosing a level closes it, opens papers, then choosing a paper collapses the picker without losing focus', () => {
  const f = fixture(); f.sync();
  f.click('levelPickerToggle');
  assert.equal(f.expanded('levelPickerToggle'), 'true');
  f.document.activeElement = f.nodes.guestLevelSection;
  f.api.levelSelected();
  assert.equal(f.expanded('levelPickerToggle'), 'false');
  assert.equal(f.expanded('examPickerToggle'), 'true');
  assert.equal(f.document.activeElement, f.nodes.levelPickerToggle);
  f.document.activeElement = f.nodes.sourceList;
  f.api.paperSelected();
  assert.equal(f.expanded('examPickerToggle'), 'false');
  assert.equal(f.document.activeElement, f.nodes.examPickerToggle);
  assert.equal(f.nodes.examPickerToggle.focusOptions.preventScroll, true);
});

test('only one chooser opens at once; result refreshes retain expansion while task navigation closes it', () => {
  const f = fixture(); f.sync();
  f.click('examPickerToggle'); f.click('taskNavigatorToggle');
  assert.equal(f.expanded('examPickerToggle'), 'false');
  assert.equal(f.expanded('taskNavigatorToggle'), 'true');
  assert.equal(f.activeTile.scrollOptions.block, 'nearest');
  f.sync(); f.api.navigator({label:'3', count:35});
  assert.equal(f.expanded('taskNavigatorToggle'), 'true', 'Answer saves do not unexpectedly close the list');
  f.document.activeElement = f.nodes.progress;
  f.api.beginTask();
  assert.equal(f.expanded('taskNavigatorToggle'), 'false');
  assert.equal(f.document.activeElement, f.nodes.taskNavigatorToggle);
  f.click('examPickerToggle');
  f.sync({level:'eo'});
  assert.equal(f.expanded('examPickerToggle'), 'false', 'Another level cannot retain the previous open picker');
});

test('Escape closes a focused chooser, but never swallows Escape from an unrelated dialog', () => {
  const f = fixture(); f.sync(); f.click('examPickerToggle');
  let prevented = false;
  f.document.activeElement = f.nodes.sourceList;
  f.events.keydown({key:'Escape', target:f.nodes.sourceList, preventDefault() {prevented = true;}});
  assert(prevented);
  assert.equal(f.expanded('examPickerToggle'), 'false');
  f.click('examPickerToggle'); prevented = false;
  f.events.keydown({key:'Escape', target:{}, preventDefault() {prevented = true;}});
  assert.equal(prevented, false);
  assert.equal(f.expanded('examPickerToggle'), 'true');
});

test('desktop, courses and tests keep full original selectors; orientation changes restore mobile controls', () => {
  const f = fixture(); f.sync();
  f.mobile.matches = false; f.mobile.change();
  assert(!f.classes.has('mobile-exam-view'));
  assert.equal(f.expanded('examPickerToggle'), 'true');
  f.api.levelSelected();
  f.mobile.matches = true; f.mobile.change();
  assert(f.classes.has('mobile-exam-view'));
  assert.equal(f.expanded('examPickerToggle'), 'false');
  for (const category of ['kurs', 'testy']) {
    f.sync({category});
    assert(!f.classes.has('mobile-exam-view'));
    assert.equal(f.expanded('taskNavigatorToggle'), 'true');
  }
});

test('task transitions are short, nonblocking, replace previous animations and honor reduced motion', () => {
  const f = fixture(); f.sync();
  f.api.presentTask('1');
  assert.equal(f.animations.length, 0, 'Do not animate initial page loading');
  f.api.beginTask(); f.api.presentTask('2');
  assert.equal(f.animations.length, 1);
  assert.equal(f.animations[0].options.duration, 140);
  assert.equal(f.animations[0].frames[1].opacity, 1);
  f.api.beginTask();
  assert.equal(f.animations[0].cancellations, 1);
  f.api.presentTask('3'); f.api.presentTask('3');
  assert.equal(f.animations.length, 2, 'Repainting an unchanged task does not replay the effect');
  f.reduced.matches = true; f.reduced.change(); f.api.presentTask('4');
  assert.equal(f.animations.length, 2);
  f.reduced.matches = false;
  delete f.content.animate;
  assert.doesNotThrow(() => f.api.presentTask('5'), 'Browsers without animation support still show the task');
});

test('mobile controls preserve real task tiles, accessible expansion and natural landscape image sizing', () => {
  for (const [id, regions] of [['levelPickerToggle','guestLevelSection'], ['examPickerToggle','examYearFilterRow sourceList'], ['taskNavigatorToggle','progress']]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*type="button"[^>]*aria-expanded="false"[^>]*aria-controls="${regions}"`));
  }
  assert.match(css, /\.task-navigation \{ display: contents; \}/);
  assert.match(css, /orientation: landscape\) and \(max-height: 560px\) and \(max-width: 1000px\)/);
  assert.match(css, /#progress \{[^}]*max-height: min\(180px, 36dvh\);[^}]*flex-wrap: wrap;[^}]*overflow: auto;/);
  assert.match(css, /#taskNavigatorToggle\[aria-expanded="false"\][^}]*display: none;/);
  assert(!css.includes('.task-image'), 'Compact pickers must not shrink or clip the actual task image');
  assert(!html.includes('IMAGE_FADE_MS') && !html.includes('wait(IMAGE_'), 'No artificial delay before a task can be used');
  const draw = html.slice(html.indexOf('async function drawTask('), html.indexOf('\nfunction nextTask('));
  assert(draw.indexOf('requestId !== drawTaskRequestId') < draw.indexOf('img.src = taskPath'), 'Stale image loads cannot overwrite the newest task');
  assert(draw.indexOf('setupMCQ()') < draw.indexOf('presentTask('), 'The answer area and task animate together');
});

test('next task returns its heading into view only when above the phone viewport, including reduced motion', () => {
  const f = fixture(); f.sync();
  f.api.presentTask('1'); f.api.presentTask('2');
  assert.equal(f.navigation.scrollOptions, undefined, 'No unnecessary scroll when the new task is visible');
  f.reduced.matches = true;
  f.navigation.top = -300;
  f.api.presentTask('3');
  assert.equal(f.navigation.scrollOptions.block, 'start');
  assert.equal(f.navigation.scrollOptions.behavior, 'instant');
  f.navigation.scrollOptions = undefined;
  f.mobile.matches = false; f.mobile.change(); f.api.presentTask('4');
  assert.equal(f.navigation.scrollOptions, undefined, 'Desktop navigation never moves the page');
});
