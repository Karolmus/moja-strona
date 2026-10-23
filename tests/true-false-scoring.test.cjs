const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('zadania.html', 'utf8');

function load(context, names) {
  for (const name of names) {
    const start = html.indexOf(`function ${name}(`);
    assert(start >= 0, name);
    vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), context);
  }
}

function answerTask(task, selected, options = {}) {
  const context = vm.createContext({currentTask:task, currentTaskAnswered:false,
    trueFalseSelection:new Array(selected.length).fill(null), hintUsed:false, answerShown:false,
    ...options, submissions:[], disabled:false, corrections:[],
    isCourseTask:() => task.category === 'kurs', disableMCQ:() => {context.disabled = true;},
    revealTrueFalseAnswers() {}, showCorrection:answers => context.corrections.push(answers),
    addProgress(result, score) {context.submissions.push({result, ...score}); context.currentTaskAnswered = true;}
  });
  load(context, ['isTrueFalseSequenceTask', 'getCorrectAnswers', 'scoreResultType', 'chooseTrueFalse']);
  const button = {closest:() => null, classList:{add(){}}};
  selected.forEach((value, index) => {
    if (index < selected.length - 1) assert.equal(context.submissions.length, 0);
    context.chooseTrueFalse(index, value, button);
  });
  return context;
}

test('two statements award one point only for both correct, including string and legacy P/F keys', () => {
  for (const task of [{type:'true_false', answer:['P','F']}, {type:'true_false', answer:'PF'},
    {type:'closed', options:['PP','PF','FP','FF'], answer:'PF'}]) {
    for (const selected of [['P','P'], ['P','F'], ['F','P'], ['F','F']]) {
      const context = answerTask({...task, category:'kurs', maxPoints:1}, selected);
      const earned = selected.join('') === 'PF' ? 1 : 0;
      assert.deepEqual(JSON.parse(JSON.stringify(context.submissions)),
        [{result:earned ? 'good' : 'bad', earnedPoints:earned, maxPoints:1}]);
      assert(context.disabled);
    }
  }
});

test('each correct statement in longer tasks earns one point for every possible answer combination', () => {
  for (const length of [3,4,7,11]) {
    const answers = Array.from({length}, (_,i) => i % 2 ? 'F' : 'P');
    for (let mask = 0; mask < 2 ** length; mask++) {
      const selected = answers.map((answer,i) => mask & (1 << i) ? answer : answer === 'P' ? 'F' : 'P');
      const earned = selected.filter((answer,i) => answer === answers[i]).length;
      const context = answerTask({category:'kurs', type:'true_false', answer:answers, maxPoints:length}, selected);
      const score = context.submissions[0];
      assert.equal(score.earnedPoints, earned);
      assert.equal(score.maxPoints, length);
      assert.equal(score.result, earned === length ? 'good' : earned ? 'medium' : 'bad');
      assert.equal(context.corrections.length, earned < length ? 1 : 0);
      context.chooseTrueFalse(0, 'P', {});
      assert.equal(context.submissions.length, 1, 'Finished tasks cannot be scored twice');
    }
  }
});

test('hints do not reduce points and all statements must be answered before saving', () => {
  for (const length of [2,4,7]) for (const assistance of [{hintUsed:true}, {answerShown:true}]) {
    const answers = new Array(length).fill('P');
    const context = answerTask({type:'true_false', answer:answers}, answers, assistance);
    assert.equal(context.submissions[0].earnedPoints, length > 2 ? length : 1);
    assert.equal(context.submissions[0].result, 'medium');
    const partial = answerTask({type:'true_false', answer:answers}, ['F', ...answers.slice(1)], assistance);
    assert.equal(partial.submissions[0].earnedPoints, length > 2 ? length - 1 : 0);
  }
});

test('every P/F manifest has the canonical point maximum across courses, tests and exams', () => {
  const context = vm.createContext({});
  load(context, ['isTrueFalseSequenceTask', 'getCorrectAnswers']);
  let checked = 0, extended = 0;
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {walk(file); continue;}
      if (!file.endsWith('.json')) continue;
      const data = JSON.parse(fs.readFileSync(file,'utf8'));
      if (!Array.isArray(data)) continue;
      for (const task of data) {
        if (!context.isTrueFalseSequenceTask(task)) continue;
        const answers = context.getCorrectAnswers(task);
        assert(answers.length >= 2 && answers.every(answer => /^[PF]$/.test(answer)), file+':'+task.file);
        assert.equal(task.maxPoints, answers.length > 2 ? answers.length : 1, file+':'+task.file);
        checked++;
        if (answers.length > 2) extended++;
      }
    }
  }
  walk('zadania');
  assert(checked >= 151);
  assert.equal(extended,7);
});
