const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync('static/lib/mathjs/answers.min.js', 'utf8'), ctx);
const math = ctx.DeltaSigmaMath;
for (const [value, expected] of [
  ['√2', 'sqrt(2)'], ['2√2', 'sqrt(8)'], ['√(1/2)', 'sqrt(2)/2'],
  ['1/2', '0,5'], ['3/6', '1/2'], ['−1/2', '-0.5'], ['-1 1/2', '-1.5'],
  ['∛(-27)', '-3'], ['root(256;4)', '4'], ['2³', '8'],
  ['(√2-21)/5', 'sqrt(2)/5-4.2']
]) assert(math.equivalent(value, expected), value);
assert(!math.equivalent('-3.917', '(sqrt(2)-21)/5'));
assert(!math.equivalent('sqrt(2)-21/5', '(sqrt(2)-21)/5'));
for (const invalid of ['', 'sqrt(', '1/0', 'sqrt(-1)', 'Infinity', 'NaN',
  'a=3', 'f(x)=x', 'sin(1)', 'import(2)', 'parse(3)', 'random()', '[1,2]',
  '{x:1}', 'a.b', 'sqrt.constructor', '2;3', '2<3', '5!', '"5"',
  '<img src=x onerror=alert(1)>', '('.repeat(201) + '1' + ')'.repeat(201)]) {
  assert(!math.isValid(invalid), invalid);
  assert(!math.equivalent(invalid, '1'), invalid);
}
assert(math.preview('√(1/2)').includes('<msqrt><mfrac>'));
assert(math.preview('∛8').includes('<mroot>'));

const html = fs.readFileSync('zadania.html', 'utf8');
for (const name of ['isClosedTask', 'isInputTask', 'isPracticalTask', 'isEquationSolutionInput',
  'normalizeSymbolicExpression', 'tokenizeSymbolicExpression', 'symbolicExpressionVariables',
  'getInputFields']) {
  const start = html.indexOf(`function ${name}(`);
  vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), ctx);
}
const tasks = JSON.parse(fs.readFileSync('zadania/kurs/eo/lekcja_4/lekcja_4_pierwiastki.json'));
assert.equal(tasks.length, 22);
for (const task of tasks) {
  assert(ctx.isClosedTask(task) || ctx.isInputTask(task), `No answer controls: ${task.file}`);
  if (ctx.isInputTask(task)) for (const field of ctx.getInputFields(task)) {
    assert(field.answers.length);
    if (field.options) assert(field.answers.every(answer => field.options.includes(answer)));
    if (field.math) assert(field.answers.every(math.isValid));
  }
}
new vm.Script(fs.readFileSync('static/math-answer-input.js', 'utf8'));
class FakeElement {
  constructor(tag) {this.tagName = tag; this.children = []; this.value = ''; this.style = {};
    this.classList = {add() {}}; this.listeners={};}
  appendChild(child) {this.children.push(child);}
  append(...children) {children.forEach(child => this.appendChild(child));}
  replaceChildren() {this.children = []; this.innerHTML = '';}
  setAttribute() {}
  addEventListener(type,listener) {(this.listeners[type] ||= []).push(listener);}
  dispatchEvent(event) {(this.listeners[event.type] || []).forEach(listener => listener(event));}
  focus() {}
  setRangeText(text,start,end) {this.value=this.value.slice(0,start)+text+this.value.slice(end);}
  setSelectionRange(start,end) {this.selectionStart=start; this.selectionEnd=end;}
}
const inputContext = vm.createContext({
  DeltaSigmaMath:math, window:{}, document:{createElement:tag => new FakeElement(tag)},
  Event:class {constructor(type) {this.type=type;}}
});
vm.runInContext(fs.readFileSync('static/math-answer-input.js', 'utf8'), inputContext);
const input = new FakeElement('input');
input.id = 'equation-answer';
const wrapper = new FakeElement('div');
inputContext.window.DeltaSigmaMathInput.attach(input, wrapper, {multiple:true});
input.value = 'root(256;4); 2';
assert(inputContext.window.DeltaSigmaMathInput.validate(input));
assert(wrapper.children[1].innerHTML.includes(' ; '));
input.value = '1;';
assert(!inputContext.window.DeltaSigmaMathInput.validate(input));
for(const value of ['−1:20', '−1⁄20', '−1∕20', '7√8']) {
  input.value = value;
  assert(inputContext.window.DeltaSigmaMathInput.validate(input), value);
}
const squareInput = new FakeElement('input'), squareWrapper = new FakeElement('div');
inputContext.window.DeltaSigmaMathInput.attach(squareInput,squareWrapper,{tools:['square'],preview:false});
assert.equal(squareWrapper.children.length,1,'Tools-only fields have no numeric preview or validation errors');
assert.equal(squareWrapper.children[0].children.length,1);
const squareButton = squareWrapper.children[0].children[0];
assert.equal(squareButton.title,'Do kwadratu');
squareInput.value='(x+1)'; squareInput.setSelectionRange(5,5); squareButton.onclick();
assert.equal(squareInput.value,'(x+1)²');
assert.equal(squareInput.selectionStart,6);
squareInput.value='x+1'; squareInput.setSelectionRange(0,3); squareButton.onclick();
assert.equal(squareInput.value,'(x+1)²');
assert(inputContext.window.DeltaSigmaMathInput.validate(squareInput));
const intervalInput = new FakeElement('input'), intervalWrapper = new FakeElement('div');
const intervalTools=['paren-left','paren-right','bracket-left','bracket-right','infinity','union'];
inputContext.window.DeltaSigmaMathInput.attach(intervalInput,intervalWrapper,{tools:intervalTools,preview:false});
assert.deepEqual(intervalWrapper.children[0].children.map(button=>button.textContent),['(',')','[',']','∞','∪']);
intervalInput.value='(0;2)'; intervalInput.setSelectionRange(3,4);
intervalWrapper.children[0].children.find(button=>button.textContent==='∞').onclick();
assert.equal(intervalInput.value,'(0;∞)');
assert.equal(intervalInput.selectionStart,4);
intervalInput.disabled=true;
intervalWrapper.children[0].children[0].onclick();
assert.equal(intervalInput.value,'(0;∞)');
const plainInput=new FakeElement('input'), plainWrapper=new FakeElement('div');
inputContext.window.DeltaSigmaMathInput.attach(plainInput,plainWrapper,{tools:[],preview:false});
assert.equal(plainWrapper.children.length,0,'No empty toolbar is rendered');
console.log('PASS: all 22 lesson-4 tasks have controls; fractions, roots, equivalent expressions, MathML and unsafe input checks');
