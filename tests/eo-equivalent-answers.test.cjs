const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync('static/lib/mathjs/answers.min.js', 'utf8'), context);
const html = fs.readFileSync('zadania.html', 'utf8');
for (const name of ['isEquationSolutionInput', 'getInputFields', 'normalizeTypedAnswer',
  'normalizeSymbolicExpression', 'normalizeAcceptedMathForm', 'tokenizeSymbolicExpression',
  'symbolicExpressionVariables', 'evaluateSymbolicExpression', 'areSymbolicExpressionsEquivalent',
  'splitEquationValues', 'isTypedAnswerCorrect', 'isEquationSpecialAnswer', 'isInputFieldAnswerCorrect']) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), context);
}

const lessons = [5, 6].map(number => {
  const dir = `zadania/kurs/eo/lekcja_${number}`;
  const file = fs.readdirSync(dir).find(file => file.endsWith('.json'));
  return {number, tasks: JSON.parse(fs.readFileSync(`${dir}/${file}`))};
});

function fraction(answer) {
  const text = answer.replace(',', '.');
  if (/^[+-]?\d+\/\d+$/.test(text)) return text.split('/').map(Number);
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    const digits = text.split('.')[1]?.length || 0;
    return [Number(text.replace('.', '')), 10 ** digits];
  }
  return null;
}

function decimal(numerator, denominator) {
  const sign = numerator < 0 ? '-' : '';
  numerator = Math.abs(numerator);
  const whole = Math.floor(numerator / denominator);
  let remainder = numerator % denominator;
  let digits = '';
  const positions = new Map();
  while (remainder && !positions.has(remainder)) {
    positions.set(remainder, digits.length);
    remainder *= 10;
    digits += Math.floor(remainder / denominator);
    remainder %= denominator;
  }
  if (!remainder) return `${sign}${whole}.${digits || '0'}`;
  const periodStart = positions.get(remainder);
  return `${sign}${whole}.${digits.slice(0, periodStart)}(${digits.slice(periodStart)})`;
}

test('all numeric fields in EO lessons 5 and 6 accept equivalent exact results', () => {
  let fieldsChecked = 0;
  let variantsChecked = 0;
  for (const lesson of lessons) for (const task of lesson.tasks) {
    if (task.type !== 'input' || task.teacherGraded) continue;
    for (const field of context.getInputFields(task)) {
      const rational = fraction(field.answers[0]);
      if (!rational) continue;
      const [n, d] = rational;
      const decimalAnswer = decimal(n, d);
      const correct = new Set([
        field.answers[0], `${n}/${d}`, `${n * 3}/${d * 3}`, `(${n})/(${d})`,
        ` ${n} / ${d} `, `${n}:${d}`, `${n}\u2044${d}`, `${n}\u2215${d}`,
        `(${n}/${d})+0`, decimalAnswer, decimalAnswer.replace('.', ','),
        decimalAnswer.replace('-', '\u2212')
      ]);
      if (Math.abs(n) >= d && n % d) {
        correct.add(`${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / d)} ${Math.abs(n) % d}/${d}`);
      }
      if (n % d === 0) {
        correct.add(`${n / d},00`);
        correct.add(`${n / d}.00`);
      }
      for (const value of correct) {
        assert(context.isInputFieldAnswerCorrect(value, field),
          `Lesson ${lesson.number}, ${task.file}, ${field.label}: ${value}`);
        if (field.math) {
          assert(context.DeltaSigmaMath.isValid(value.replace(/[:\u2044\u2215]/g, '/')),
            `The input syntax validator must allow ${value}`);
        }
        variantsChecked++;
      }
      const incorrect = [`(${n}/${d})+1`, n ? `${-n}/${d}` : '1', '1/0', 'sqrt(-1)', ''];
      if (decimalAnswer.includes('(')) incorrect.push((n / d).toFixed(3).replace('.', ','));
      for (const value of incorrect) {
        assert(!context.isInputFieldAnswerCorrect(value, field),
          `Lesson ${lesson.number}, ${task.file}: must reject ${value}`);
        variantsChecked++;
      }
      fieldsChecked++;
    }
  }
  assert.equal(fieldsChecked, 28, 'Every numeric field is covered');
  console.log(`Audited ${fieldsChecked} numeric fields and ${variantsChecked} answer variants`);
});

test('repeating decimals are not misinterpreted as multiplication', () => {
  const task = lessons[1].tasks.find(task => task.file === 'zd11.png');
  const field = context.getInputFields(task)[0];
  for (const value of ['75/11', '150/22', '6 9/11', '6,(81)', '6.(81)']) {
    assert(context.isInputFieldAnswerCorrect(value, field), value);
  }
  for (const value of ['486', '6,81', '6,(8)', '6,(18)', '0']) {
    assert(!context.isInputFieldAnswerCorrect(value, field), value);
  }
  for (const [value, answer] of [
    ['0,(3)', '1/3'], ['0.4(09)', '9/22'], ['-3,(3)', '-10/3'],
    ['2,3(3)', '7/3'], ['0,(9)', '1'], ['-0,1(6)', '-1/6'],
    ['1/(0,(3))', '3'], ['2*(0,(3))', '2/3'], ['0,(3)+0,(6)', '1'],
    ['2(3)', '6'], ['0.5*(3)', '1.5']
  ]) assert(context.DeltaSigmaMath.equivalent(value, answer), value);
});

test('symbolic answers, equation modes and teacher assessment stay distinct', () => {
  const tasks = lessons[1].tasks;
  const plants = context.getInputFields(tasks.find(task => task.file === '4.png'))[0];
  for (const value of ['2(p+6)/3+4w-3', '4w+2p/3+1', '0,(6)p+4w+1', '0.(6)*(p+6)+4*w-3']) {
    assert(context.isInputFieldAnswerCorrect(value, plants), value);
  }
  for (const value of ['4w+2p/3+2', '0,(6)p+4w', '0,66p+4w+1']) {
    assert(!context.isInputFieldAnswerCorrect(value, plants), value);
  }
  const fuel = context.getInputFields(tasks.find(task => task.file === 'zd7.png'))[0];
  for (const value of ['3V/10', '3/10*V', '0,3V', '0.3*V', 'V*30/100', 'V/(10/3)']) {
    assert(context.isInputFieldAnswerCorrect(value, fuel), value);
  }
  for (const value of ['0,(3)V', '0.03V', '3/10']) {
    assert(!context.isInputFieldAnswerCorrect(value, fuel), value);
  }
  for (const lesson of lessons) for (const task of lesson.tasks.filter(task => task.inputs?.[0].options)) {
    const field = context.getInputFields(task)[0];
    assert.equal(field.control, 'equation');
    assert(context.isInputFieldAnswerCorrect(field.answers[0], field));
    for (const value of ['0', '0,(3)', '999']) assert(!context.isInputFieldAnswerCorrect(value, field));
  }
  const justification = tasks.find(task => task.file === '13.png');
  assert(justification.teacherGraded);
  assert.equal(justification.inputs[0].answer, '2');
  assert.equal(justification.inputs[0].math, false);
  assert.equal(justification.inputs[1].control, 'textarea');
});
