const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = 'zadania/kurs/eo/lekcja_1/lekcja_1_odczytywanie_danych_i_procenty.json';
const catalog = JSON.parse(fs.readFileSync(source));
const tasks = catalog.map(task => ({...task, category:'kurs', sourceId:source, sourceLabel:'Lekcja 1'}));
const homework = tasks.filter(task => task.coursePart === 'praca_domowa');
const expected = ['1', '2.1', '2.2', '3', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2', '7.1', '7.2'];
const ctx = vm.createContext({tasks, STUDENT_WORK_COURSE_PARTS:['praca_domowa', 'zadania_powtorkowe']});
for(const [file, names] of [
  ['zadania.html', ['courseTaskNumberFromTitle', 'coursePartOrdinalNumber', 'coursePartDisplayTitle',
    'taskNumberLabel', 'homeworkTileLabel', 'navigatorTaskLabel', 'getSavedResult', 'progressTaskKey',
    'getTaskKey', 'getProgressFile', 'getProgressSourceId']],
  ['admin.html', ['taskDisplayTitle']]
]){
  const html = fs.readFileSync(file, 'utf8');
  for(const name of names){
    const start = html.indexOf(`function ${name}(`);
    assert(start >= 0, name);
    vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), ctx);
  }
}
assert.equal(homework.length, 12);
assert.deepEqual(homework.map(ctx.navigatorTaskLabel), expected);
ctx.sessionResults = new Map();
ctx.savedProgress = [{source_id:source, file:'zd_6.2.png', result:'good'}];
assert.equal(ctx.getSavedResult(homework[9]), 'good', 'Existing results remain attached to the same file');
assert.equal(ctx.getTaskKey(homework[9]), `${source}:zd_6.2.png`);
for(const [index, task] of homework.entries()){
  assert.equal(ctx.coursePartDisplayTitle(task), `Lekcja 1 - zadanie domowe ${expected[index]}`);
  assert.equal(ctx.taskDisplayTitle(task), ctx.coursePartDisplayTitle(task), 'Admin and student use the same number');
}
assert.deepEqual(tasks.filter(task => task.coursePart === 'zadania').map(ctx.taskNumberLabel),
  Array.from({length:11}, (_, index) => String(index+1)));
ctx.tasks = [...tasks].reverse();
assert.deepEqual(homework.map(ctx.navigatorTaskLabel), expected, 'Loading order cannot renumber explicit subtasks');
ctx.tasks = [homework[9]];
assert.equal(ctx.navigatorTaskLabel(homework[9]), '6.2', 'Filtering does not change the task number');
const otherSource = 'zadania/kurs/mp/lekcja_2/lekcja_2_logarytmy.json';
ctx.tasks = JSON.parse(fs.readFileSync(otherSource)).map(task => ({...task, category:'kurs', sourceId:otherSource}));
for(const part of ['praca_domowa', 'zadania_powtorkowe']){
  const section = ctx.tasks.filter(task => task.coursePart === part);
  assert.deepEqual(section.map(ctx.taskNumberLabel), section.map((_, index) => String(index+1)), 'Other lessons keep ordinal numbering');
}
console.log('PASS: EO lesson 1 subtasks, student/admin title consistency, stable filtering and unchanged MP numbering');
