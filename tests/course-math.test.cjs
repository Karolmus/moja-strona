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
for (const name of ['isClosedTask', 'isInputTask', 'isPracticalTask', 'getInputFields']) {
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
console.log('PASS: all 22 lesson-4 tasks have controls; fractions, roots, equivalent expressions, MathML and unsafe input checks');
