const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const tasks = JSON.parse(fs.readFileSync('zadania/kurs/eo/test_lekcje_1_6/test_lekcje_1_6.json'));
const variants = JSON.parse(fs.readFileSync('tests/fixtures/eo-normal-answer-variants.json'));
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('static/lib/mathjs/answers.min.js', 'utf8'), context);
for(const name of ['isEquationSolutionInput', 'normalizeTypedAnswer', 'normalizeSymbolicExpression',
  'normalizeAcceptedMathForm', 'tokenizeSymbolicExpression', 'symbolicExpressionVariables',
  'evaluateSymbolicExpression', 'areSymbolicExpressionsEquivalent', 'getInputFields',
  'isTypedAnswerCorrect', 'isInputFieldAnswerCorrect']) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), context);
}
assert.deepEqual(tasks.filter(task => task.type === 'input').map(task => task.taskNumber), Object.keys(variants));
let checked = 0;
for(const [number, answers] of Object.entries(variants)) {
  const task = tasks.find(task => task.taskNumber === number);
  const fields = context.getInputFields(task);
  assert.equal(fields.length, 1, `Task ${number} has a result field, not self-scoring`);
  const field = fields[0];
  assert(field.numericAnswer);
  assert(!field.exact && !field.acceptedFormsOnly, `Task ${number} compares values, not a hardcoded spelling`);
  for(const value of answers.correct) {
    assert(context.isInputFieldAnswerCorrect(value, field), `Task ${number}: correct ${value}`);
    if(field.math) assert(context.DeltaSigmaMath.isValid(value.replace(/[:⁄∕]/g, '/')), `Math form must allow ${value}`);
    checked++;
  }
  for(const value of answers.incorrect) {
    assert(!context.isInputFieldAnswerCorrect(value, field), `Task ${number}: incorrect ${value}`);
    checked++;
  }
}
console.log(`PASS: four open EO test tasks have result fields; ${checked} equivalent/incorrect answer variants`);
