const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const names = ['getInputFields', 'normalizeTypedAnswer', 'isTypedAnswerCorrect',
  'setupInputTask', 'checkInputAnswer', 'revealInputAnswers', 'disableMCQ', 'isInputTask'];
function source(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.dataset = {}; this.value = '';
    this.classes = new Set();
    this.classList = {
      add: value => this.classes.add(value),
      toggle: (value, state) => state ? this.classes.add(value) : this.classes.delete(value),
    };
  }
  appendChild(child) {this.children.push(child);}
  querySelectorAll(selector) {
    const tags = selector.split(',').map(value => value.trim().split(' ').at(-1));
    return this.children.flatMap(child => [...(tags.includes(child.tagName) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  reportValidity() {this.validationReported = true; return false;}
}
let mcq;
const result = [];
const ctx = vm.createContext({
  document: {createElement: tag => new Element(tag), querySelectorAll: selector => mcq.querySelectorAll(selector)},
  currentTaskAnswered: false, isCourseTask: () => true, hasGradingCriteria: () => false,
  taskMaxPoints: task => task.maxPoints, showCorrection: () => {},
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
    .map(task => [task, task.inputs.map(field => field.answer),
      task.inputs.map(field => field.options ? field.options.find(value => value !== field.answer) : '999')]),
  ...JSON.parse(fs.readFileSync('zadania/kurs/eo/lekcja_6/lekcja_6_wyrazenia_algebraiczne_i_rownania_2.json'))
    .filter(task => task.type === 'input')
    .map(task => [task, task.inputs.map(field => field.answer),
      task.inputs.map(field => field.options ? field.options.find(value => value !== field.answer) : '999')]),
];
function render(task) {
  ctx.currentTask = task; ctx.currentTaskAnswered = false;
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
  ctx.revealInputAnswers();
  assert(inputs.every(input => input.disabled && input.classes.has('correct')));
}
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
console.log(`PASS: ${cases.length} tasks, selectors, math input, validation, locking, decimal separators and strict rounding`);
