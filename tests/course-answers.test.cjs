const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const names = ['isEquationSolutionInput', 'getInputFields', 'getInputPrompt', 'normalizeTypedAnswer',
  'splitEquationValues',
  'isTypedAnswerCorrect', 'isEquationSpecialAnswer', 'isInputFieldAnswerCorrect',
  'isComparisonField', 'setupComparisonControl', 'setComparisonControlResult',
  'formatInputAnswer', 'formatSubmittedInputAnswer', 'showInputCorrection',
  'inputAnswerValuesFromText', 'getSubmittedInputAnswerValues', 'restoreInputAnswerState',
  'syncEquationAnswerMode', 'setupEquationAnswerControl', 'setupInputTask',
  'checkInputAnswer', 'revealInputAnswers', 'disableMCQ', 'isInputTask'];
function source(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.dataset = {}; this.value = '';
    this.attributes = {}; this.style = {}; this.listeners = {};
    this.classes = new Set();
    this.classList = {
      add: (...values) => values.forEach(value => this.classes.add(value)),
      remove: (...values) => values.forEach(value => this.classes.delete(value)),
      toggle: (value, state) => state ? this.classes.add(value) : this.classes.delete(value),
    };
  }
  appendChild(child) {child.parentElement = this; this.children.push(child); return child;}
  append(...children) {children.forEach(child => this.appendChild(child));}
  setAttribute(name, value) {this.attributes[name] = String(value);}
  addEventListener(name, listener) {(this.listeners[name] ||= []).push(listener);}
  dispatchEvent(event) {(this.listeners[event.type] || []).forEach(listener => listener(event));}
  focus() {}
  closest(selector) {
    for(let node = this; node; node = node.parentElement) {
      if(selector.startsWith('.') && (node.classes.has(selector.slice(1)) ||
        String(node.className || '').split(/\s+/).includes(selector.slice(1)))) return node;
    }
    return null;
  }
  querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  querySelectorAll(selector) {
    const tags = selector.split(',').map(value => value.trim().split(' ').at(-1));
    return this.children.flatMap(child => {
      const matches = tags.some(tag => tag.startsWith('.')
        ? child.classes.has(tag.slice(1)) || String(child.className || '').split(/\s+/).includes(tag.slice(1))
        : tag === child.tagName);
      return [...(matches ? [child] : []), ...child.querySelectorAll(selector)];
    });
  }
  reportValidity() {this.validationReported = true; return false;}
}
let mcq;
const comparisonOverlay = new Element('div');
const result = [];
const ctx = vm.createContext({
  document: {
    createElement: tag => new Element(tag),
    getElementById: id => id === 'comparisonOverlay' ? comparisonOverlay : null,
    querySelectorAll: selector => mcq.querySelectorAll(selector)
  },
  currentTaskAnswered: false, isCourseTask: () => true, hasGradingCriteria: () => false,
  taskMaxPoints: task => task.maxPoints, showCorrection: () => {},
  answerShown: false, feedback: '', sessionSubmittedAnswers: new Map(), saved: null,
  getTaskKey: task => task.file,
  getSavedProgressItem: () => ctx.saved,
  showMessage: text => {ctx.feedback = text;},
  addProgress: (status, score) => {result.push({status, score}); ctx.currentTaskAnswered = true;},
});
vm.runInContext(fs.readFileSync('static/lib/mathjs/answers.min.js', 'utf8'), ctx);
for (const name of names) vm.runInContext(source(name), ctx);
function task(lesson, file) {
  const dir = `zadania/kurs/eo/lekcja_${lesson}`;
  const name = fs.readdirSync(dir).find(name => name.endsWith('.json'));
  return JSON.parse(fs.readFileSync(`${dir}/${name}`)).find(task => task.file === file);
}
const cases = [
  [task(2, 'zd2.png'), ['b','a','c','d'], ['a','b','c','d']],
  [task(2, 'zd6.png'), ['12','8'], ['8','12']],
  [task(2, 'zd11.png'), ['68,8'], ['68']],
  [task(4, 'zd3.png'), ['−15'], ['15']],
  [task(1, 'zd_6.2.png'), ['39.7%'], ['40%']],
  [task(4, 'zd2.png'), ['A','D'], ['B','C']],
  [task(4, 'zd5.png'), ['sqrt(2)/5-21/5'], ['(sqrt(2)-21)/6']],
  [task(4, 'zd7.png'), ['II','III','IV','I'], ['I','II','III','IV']],
  [task(4, 'zd8.png'), ['=','<','<','<'], ['>','>','>','>']],
  [task(4, '11.png'), ['II','I','III'], ['I','II','III']],
  ...JSON.parse(fs.readFileSync('zadania/kurs/eo/lekcja_5/lekcja_5_wyrazenia_algebraiczne_i_rownania.json'))
    .filter(task => task.type === 'input')
    .map(task => [task, task.inputs.map(field => field.answer ?? field.answers?.[0]),
      task.inputs.map(field => field.options ? field.options.find(value => value !== field.answer) : '999')]),
  ...JSON.parse(fs.readFileSync('zadania/kurs/eo/lekcja_6/lekcja_6_wyrazenia_algebraiczne_i_rownania_2.json'))
    .filter(task => task.type === 'input')
    .map(task => [task, task.inputs.map(field => field.answer ?? field.answers?.[0]),
      task.inputs.map(field => field.options ? field.options.find(value => value !== field.answer) : '999')]),
];
for (const lesson of [5, 6]) {
  const dir = `zadania/kurs/eo/lekcja_${lesson}`;
  const name = fs.readdirSync(dir).find(name => name.endsWith('.json'));
  const lessonTasks = JSON.parse(fs.readFileSync(`${dir}/${name}`));
  const manuallyScored = lessonTasks.filter(task =>
    !['closed', 'multi', 'true_false', 'input', 'fill', 'short_answer', 'numeric', 'practical'].includes(task.type)
  );
  assert.deepEqual(manuallyScored.map(task => task.file), [], `Lesson ${lesson} must not use point-only answers`);
}
function render(task) {
  ctx.currentTask = task; ctx.currentTaskAnswered = false;
  comparisonOverlay.children = [];
  mcq = new Element('div'); ctx.setupInputTask(mcq);
  const form = mcq.children[0];
  return {form, inputs: form.querySelectorAll('input, select')};
}
for (const [task, good, bad] of cases) {
  assert(ctx.isInputTask(task));
  let {form, inputs} = render(task);
  const before = result.length;
  ctx.checkInputAnswer(form);
  assert.equal(result.length, before, 'Blank form must not consume an attempt');
  assert(form.validationReported);
  inputs.forEach((input, index) => {input.value = good[index]; assert(input.required);});
  ctx.checkInputAnswer(form);
  assert.equal(result.at(-1).status, 'good', task.file);
  assert.equal(result.at(-1).score.earnedPoints, task.maxPoints);
  assert(inputs.every(input => input.disabled));
  ({form, inputs} = render(task));
  inputs.forEach((input, index) => {input.value = bad[index];});
  ctx.checkInputAnswer(form);
  assert.equal(result.at(-1).status, 'bad', task.file);
  assert.match(ctx.feedback, /Twoja odpowiedź:/);
  assert.match(ctx.feedback, /Poprawna odpowiedź:/);
  ctx.revealInputAnswers();
  assert(inputs.every(input => input.disabled && input.classes.has('correct')));
}
const restoredTask = task(5, 'zd2.png');
const restored = render(restoredTask);
ctx.saved = {submitted_answer: 'x: 999'};
ctx.restoreInputAnswerState('bad');
assert.equal(restored.inputs[0].value, '999');
assert(restored.inputs[0].disabled && restored.inputs[0].classes.has('wrong'));
assert.match(ctx.feedback, /Twoja odpowiedź:\nx = 999/);
assert.match(ctx.feedback, /Poprawna odpowiedź:\nx = 2/);
ctx.saved = null;
ctx.sessionSubmittedAnswers.set(restoredTask.file, 'x: 888');
const sessionRestored = render(restoredTask);
ctx.restoreInputAnswerState('bad');
assert.equal(sessionRestored.inputs[0].value, '888', 'Immediate return uses the answer kept in session memory');
ctx.sessionSubmittedAnswers.clear();
const percentage = ctx.getInputFields(task(1, 'zd_6.2.png'))[0];
for (const value of ['39,7%', '39.7%', '39,7', '39.7', '39.70 %']) {
  assert(ctx.isTypedAnswerCorrect(value, percentage.answers, percentage.exact), value);
}
for (const value of ['40', '40%', '39.73', '39,73%', '0.397', '39.70000001', '', '39.7%%', '397e-1']) {
  assert(!ctx.isTypedAnswerCorrect(value, percentage.answers, percentage.exact), value);
}
assert(!ctx.isTypedAnswerCorrect('', ['0']));
assert(task(1, 'zd_6.2.png').instruction.includes('jednego miejsca'));
assert(render(cases[0][0]).inputs.every(input => input.tagName === 'select'));
const comparisonTask = task(4, 'zd8.png');
const comparisonFields = ctx.getInputFields(comparisonTask);
assert(comparisonFields.every(field => ctx.isComparisonField(field) && Number.isFinite(field.position.x) && Number.isFinite(field.position.y)));
const comparisonRender = render(comparisonTask);
assert(comparisonRender.inputs.every(input => input.tagName === 'input' && input.type === 'hidden'));
assert.equal(comparisonOverlay.children.length, 4);
assert(comparisonOverlay.children.every(control => control.children.length === 3));
comparisonOverlay.children[0].children[0].onclick();
assert.equal(comparisonRender.inputs[0].value, '<');
assert.equal(render(cases[3][0]).inputs[0].inputMode, 'text');
assert(ctx.isTypedAnswerCorrect('1/2', ['0,5']));
assert(ctx.isTypedAnswerCorrect('1 1/2', ['1,5']));
assert(!ctx.isTypedAnswerCorrect('1 2', ['12']));
assert(ctx.isTypedAnswerCorrect('2/6', ctx.getInputFields(task(5, 'zd4.png'))[0].answers));
assert(ctx.isTypedAnswerCorrect('-sqrt(4)', ctx.getInputFields(task(5, 'zd5.png'))[0].answers));
assert(ctx.isTypedAnswerCorrect('−12,0', ctx.getInputFields(task(5, 'zd3.png'))[0].answers));
assert(!ctx.isTypedAnswerCorrect('0,333', ctx.getInputFields(task(5, 'zd4.png'))[0].answers));
assert(ctx.isTypedAnswerCorrect('-3 1/3', ctx.getInputFields(task(6, '3.png'))[0].answers));
assert(ctx.isTypedAnswerCorrect('-sqrt(100)/3', ctx.getInputFields(task(6, '3.png'))[0].answers));
assert(!ctx.isTypedAnswerCorrect('10/3', ctx.getInputFields(task(6, '3.png'))[0].answers));
assert.equal(ctx.getInputPrompt(ctx.getInputFields(task(5, 'zd2.png'))[0]), 'Podaj rozwiązanie równania lub wybierz jego typ.');
assert.equal(ctx.getInputPrompt(ctx.getInputFields(task(5, 'zd8.png'))[0]), 'Podaj rozwiązanie równania lub wybierz jego typ.');
assert.equal(ctx.getInputPrompt(ctx.getInputFields(task(5, '11.png'))[0]), 'Wpisz obliczoną masę ananasa (w kg).');
assert.equal(ctx.getInputPrompt(ctx.getInputFields(task(6, 'zd7.png'))[0]), 'Wpisz wyrażenie opisujące końcową objętość benzyny.');
const promptRender = render(task(5, 'zd2.png'));
assert.equal(promptRender.form.children[0].children[0].children[0].innerText, 'Podaj rozwiązanie równania lub wybierz jego typ.');
assert.equal(promptRender.form.children[1].innerText, 'Zatwierdź odpowiedź');
const numeric = render(task(5, 'zd2.png'));
const numericWrapper = numeric.form.children[0].children[0];
const numericModes = numericWrapper.children[1].children;
assert.deepEqual(numericModes.map(button => button.textContent), ['Liczba lub liczby', 'Sprzeczne', 'Nieoznaczone']);
assert.match(numericWrapper.children[2].children.at(-1).textContent, /oddziel liczby średnikiem/);
numeric.inputs[0].value = '2';
numeric.inputs[0].dispatchEvent({type:'input'});
numericModes[1].onclick();
assert.equal(numeric.inputs[0].value, 'brak rozwiązań');
assert(numericWrapper.children[2].hidden);
numericModes[0].onclick();
assert.equal(numeric.inputs[0].value, '2', 'Switching back restores the typed result');
assert(!numericWrapper.children[2].hidden);
const indefinite = render(task(5, 'zd8.png'));
indefinite.form.children[0].children[0].children[1].children[2].onclick();
assert.equal(indefinite.inputs[0].value, 'nieskończenie wiele rozwiązań');
ctx.checkInputAnswer(indefinite.form);
assert.equal(result.at(-1).status, 'good');
ctx.saved = {submitted_answer:'Rozwiązania równania: nieskończenie wiele rozwiązań'};
const revisited = render(task(5, 'zd8.png'));
ctx.restoreInputAnswerState('good');
assert(revisited.form.children[0].children[0].children[2].hidden);
assert(revisited.form.children[0].children[0].children[1].children[2].classes.has('selected'));
assert(revisited.form.children[0].children[0].children[1].children.every(button => button.disabled));
ctx.syncEquationAnswerMode(revisited.inputs[0], 'Brak rozwiązań', true);
assert(revisited.form.children[0].children[0].children[1].children[1].classes.has('selected'));
ctx.syncEquationAnswerMode(revisited.inputs[0], 0, true);
assert.equal(revisited.inputs[0].value, '0');
assert(revisited.form.children[0].children[0].children[1].children[0].classes.has('selected'));
ctx.saved = null;
const multiRoot = {type:'input', tags:['równania'], inputs:[{label:'x', answer:'1; sqrt(4)'}]};
const multiField = ctx.getInputFields(multiRoot)[0];
assert(ctx.isInputFieldAnswerCorrect('2; 1', multiField), 'Multiple roots are order independent');
assert(ctx.isInputFieldAnswerCorrect('1; √4', multiField));
assert(!ctx.isInputFieldAnswerCorrect('1; 3', multiField));
assert(!ctx.isInputFieldAnswerCorrect('1; 2; 3', multiField));
assert(!ctx.isInputFieldAnswerCorrect('1;', multiField));
assert(!ctx.isInputFieldAnswerCorrect('brak rozwiązań', multiField));
assert.deepEqual(Array.from(ctx.splitEquationValues('root(256;4); 2')), ['root(256;4)', '2']);
assert.equal(ctx.getInputFields(task(1, 'zd_7.1.png'))[0].control, 'equation');
assert.equal(ctx.getInputFields(task(6, 'zd10.png'))[0].control, 'equation');
assert.equal(ctx.getInputFields(task(6, '10.png'))[0].control, '');
console.log(`PASS: ${cases.length} tasks, selectors, math input, validation, locking, decimal separators and strict rounding`);
