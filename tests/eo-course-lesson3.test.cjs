const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const tasks = JSON.parse(fs.readFileSync('zadania/kurs/eo/lekcja_3/lekcja_3_potegi.json', 'utf8'));
const homework = tasks.find(task => task.file === 'zd10.png');

test('EO lesson 3 homework 10 has exactly 129 trailing zeros', () => {
  const number = 21n * 10n ** 129n;
  const decimal = number.toString();
  assert.equal(decimal.length, 131);
  assert.equal(decimal.slice(0, 2), '21');
  assert.equal(decimal.slice(2), '0'.repeat(129));
  assert.equal((10n ** 130n).toString().slice(1), '0'.repeat(130));
});

test('EO lesson 3 homework 10 keeps its choices and corrected B2 key', () => {
  assert.equal(homework.answer, 'B2');
  assert.equal(homework.coursePart, 'praca_domowa');
  assert.equal(homework.maxPoints, 1);
  assert.deepEqual(homework.options, ['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
  const image = fs.readFileSync('zadania/kurs/eo/lekcja_3/zd10.png');
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  assert(image.readUInt32BE(16) >= 950, 'The corrected table must remain legible');
  assert(image.readUInt32BE(20) >= 350, 'Include the prompt and all three justifications');
});

test('The actual choice handler accepts B2 and rejects all other combinations', () => {
  const html = fs.readFileSync('zadania.html', 'utf8');
  const start = html.indexOf('function choose(');
  assert(start >= 0);
  const source = html.slice(start, html.indexOf('\n}', start) + 2);

  for (const option of homework.options) {
    const recorded = {classes: [], results: [], corrections: [], revealed: [], disabled: 0};
    const context = vm.createContext({
      currentTask: homework,
      currentTaskAnswered: false,
      hintUsed: false,
      answerShown: false,
      submittedChoice: null,
      disableMCQ: () => recorded.disabled++,
      addProgress: result => recorded.results.push(result),
      revealCorrectAnswer: answers => recorded.revealed.push(...answers),
      showCorrection: answers => recorded.corrections.push(...answers),
      isCourseTask: () => true,
    });
    vm.runInContext(source, context);
    context.choose(option, {classList: {add: value => recorded.classes.push(value)}});
    const correct = option === 'B2';
    assert.equal(context.submittedChoice, option);
    assert.equal(recorded.disabled, 1);
    assert.deepEqual(recorded.results, [correct ? 'good' : 'bad'], option);
    assert.deepEqual(recorded.classes, [correct ? 'correct' : 'wrong'], option);
    assert.deepEqual(recorded.revealed, correct ? [] : ['B2'], option);
    assert.deepEqual(recorded.corrections, correct ? [] : ['B2'], option);
  }
});
