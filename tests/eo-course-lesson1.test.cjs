const fs = require('node:fs');
const assert = require('node:assert/strict');
const {test} = require('node:test');

const tasks = JSON.parse(fs.readFileSync(
  'zadania/kurs/eo/lekcja_1/lekcja_1_odczytywanie_danych_i_procenty.json', 'utf8'));

test('EO lesson 1 homework 6.1 selects Instagram from the weekly chart totals', () => {
  const task = tasks.find(item => item.file === 'zd_6.1.png');
  // Chart values from Monday to Sunday, in the order of the printed answers.
  const options = [
    {letter:'A', platform:'TikTok', hours:[1, 0.5, 1, 1.5, 2, 2.5, 3]},
    {letter:'B', platform:'Instagram', hours:[2, 1.5, 3, 2, 2.5, 1, 2.5]},
    {letter:'C', platform:'Facebook', hours:[1, 1.5, 1.5, 1, 0.5, 1.5, 1]},
    {letter:'D', platform:'YouTube', hours:[2, 1, 0.5, 2.5, 1, 2, 1.5]}
  ].map(option => ({...option, total:option.hours.reduce((sum, value) => sum + value, 0)}));
  assert.deepEqual(options.map(option => option.total), [11.5, 14.5, 8, 10.5]);
  const winner = options.reduce((best, option) => option.total > best.total ? option : best);
  assert.equal(winner.platform, 'Instagram');
  assert.equal(task.answer, winner.letter);
  assert.deepEqual(task.options, options.map(option => option.letter));
  assert.equal(task.contextFile, 'zd_6_info.png');
  assert.equal(task.type, 'closed');
  assert.equal(task.maxPoints, 1);
});
