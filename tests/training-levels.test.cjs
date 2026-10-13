const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('trening.html', 'utf8');

function element() {
  return {children: [], dataset: {}, classes: new Set(),
    set innerHTML(value) {this.children = [];},
    appendChild(child) {this.children.push(child);},
    setAttribute(name, value) {this[name] = value;},
    get classList() {return {toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name)};}
  };
}

function setup(user, query = '') {
  const window = {location: {href: 'http://localhost/trening.html' + query, search: query},
    matchMedia: () => ({matches: false}), getAuthToken: () => 'local-test-token'};
  window.history = {replaceState(_state, _title, url) {
    window.location = {href: url.href, search: url.search};
  }};
  const context = vm.createContext({window, URL, URLSearchParams, trainingUser: null,
    state: {level: 'eo', topic: 'all', reviewTopic: '', starting: false, running: false},
    levelTabs: element(), topicList: element(), stageSubtitle: {}, trainingSettingsValue: {},
    trainingSettings: {}, document: {createElement: element}, resets: 0,
    resetRound() {context.resets++; context.state.running = false; context.state.currentTask = null;},
  });
  window.apiFetch = async () => ({authenticated: Boolean(user), user});
  for (const name of ['STUDENT_LEVEL_TO_TRAINING', 'LEVELS']) {
    const start = html.indexOf(`const ${name} =`);
    vm.runInContext(html.slice(start, html.indexOf('\n};', start) + 3), context);
  }
  for (const name of ['applyAssignedLevel', 'trainingLevelFromUser', 'requestedTrainingLevel',
    'canSelectTrainingLevel', 'setTrainingLevel', 'requestedTrainingLesson', 'syncTrainingLevelFromAuth',
    'setTopic', 'updateTrainingLessonUrl', 'activeTopicLabel', 'renderControls']) {
    const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert(start >= 0, name);
    vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), context);
  }
  return context;
}

test('admin can choose every training level and reload the selected level', async () => {
  const context = setup({role: 'admin'}, '?level=matura_podstawowa&lesson=lesson_2');
  await context.syncTrainingLevelFromAuth();
  assert.equal(context.state.level, 'mp');
  assert.equal(context.state.topic, 'lesson_2');
  assert.deepEqual(context.levelTabs.children.map(button => button.dataset.level), ['eo', 'mp', 'mr']);
  assert.equal(context.levelTabs.children[1]['aria-pressed'], 'true');
  context.state.running = true;
  context.state.currentTask = {answer: 2};
  const resets = context.resets;
  context.levelTabs.children[2].onclick();
  assert.equal(context.state.level, 'mr');
  assert.equal(context.state.topic, 'all');
  assert.equal(context.state.running, false);
  assert.equal(context.state.currentTask, null);
  assert.equal(context.resets, resets + 1);
  assert.equal(new URL(context.window.location.href).searchParams.get('level'), 'mr');
  assert.equal(new URL(context.window.location.href).searchParams.has('lesson'), false);
  const reload = setup({role: 'admin'}, context.window.location.search);
  await reload.syncTrainingLevelFromAuth();
  assert.equal(reload.state.level, 'mr');
  context.setTrainingLevel('eo');
  assert.equal(context.state.level, 'eo');
});

test('student stays locked to the assigned course, including manipulated URLs', async () => {
  for (const [assigned, expected] of [['egzamin_osmoklasisty', 'eo'], ['matura_podstawowa', 'mp'], ['matura_rozszerzona', 'mr']]) {
    const context = setup({role: 'student', level: assigned}, '?level=mr&lesson=lesson_1');
    await context.syncTrainingLevelFromAuth();
    assert.equal(context.state.level, expected);
    assert.equal(context.state.topic, 'lesson_1');
    assert.equal(context.levelTabs.children.length, 1);
    assert.match(context.levelTabs.children[0].className, /level-locked/);
    context.setTrainingLevel(expected === 'eo' ? 'mp' : 'eo');
    assert.equal(context.state.level, expected);
  }
});

test('invalid levels, unauthenticated sessions and pending round starts cannot switch levels', async () => {
  const context = setup({role: 'admin'}, '?level=__proto__&lesson=lesson_12');
  await context.syncTrainingLevelFromAuth();
  assert.equal(context.state.level, 'eo');
  assert.equal(context.state.topic, 'all');
  context.setTrainingLevel('__proto__');
  context.setTrainingLevel('unknown');
  assert.equal(context.state.level, 'eo');
  context.state.starting = true;
  context.setTrainingLevel('mp');
  assert.equal(context.state.level, 'eo');
  context.state.starting = false;
  context.window.apiFetch = async () => {throw new Error('Network error');};
  await context.syncTrainingLevelFromAuth();
  assert.equal(context.canSelectTrainingLevel(), false);
  assert.equal(context.levelTabs.children.length, 1);
  const guest = setup(null, '?level=mp');
  await guest.syncTrainingLevelFromAuth();
  assert.equal(guest.state.level, 'eo');
  assert.equal(guest.canSelectTrainingLevel(), false);
});

test('course preview links retain the admin level without changing student links', () => {
  const tasks = fs.readFileSync('zadania.html', 'utf8');
  const start = tasks.indexOf('function updateTrainingLink(');
  const link = {};
  const context = vm.createContext({URLSearchParams, loggedUser: {role: 'admin'},
    selectedCategory: 'kurs', selectedLevel: 'matura_podstawowa',
    selectedSource: 'zadania/kurs/mp/lekcja_2/lesson.json',
    document: {getElementById: () => link}});
  vm.runInContext(tasks.slice(start, tasks.indexOf('\n}', start) + 2), context);
  context.updateTrainingLink();
  assert.equal(link.href, 'trening.html?level=matura_podstawowa&lesson=lesson_2');
  context.selectedCategory = 'egzaminy';
  context.selectedLevel = 'matura_rozszerzona';
  context.updateTrainingLink();
  assert.equal(link.href, 'trening.html?level=matura_rozszerzona');
  context.loggedUser = {role: 'student'};
  context.updateTrainingLink();
  assert.equal(link.href, 'trening.html');
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
});
