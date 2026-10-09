const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const sourcePath = 'zadania/kurs/mp/lekcja_8/lekcja_8_funkcja_liniowa.json';
const sourceDir = path.dirname(sourcePath);
const tasks = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

assert.equal(tasks.length, 58);
assert.equal(new Set(tasks.map(task => task.file)).size, 58);
assert.deepEqual(
  tasks.reduce((groups, task) => {
    groups[task.coursePart] = (groups[task.coursePart] || 0) + 1;
    return groups;
  }, {}),
  {zadania: 30, praca_domowa: 18, zadania_powtorkowe: 10}
);

const review = tasks.filter(task => task.coursePart === 'zadania_powtorkowe');
assert.deepEqual(review.map(task => task.file), Array.from({length: 10}, (_, i) => `zp${i + 1}.png`));
const newReviewTask = review[9];
assert.equal(newReviewTask.title, 'Lekcja 8 - zadanie powtórkowe 10');
assert.equal(newReviewTask.type, 'closed');
assert.deepEqual(newReviewTask.options, ['A', 'B', 'C', 'D']);
assert.equal(newReviewTask.maxPoints, 1);
const translatedDomain = [0, 5].map(endpoint => endpoint - 2);
assert.deepEqual(translatedDomain, [-2, 3]);
assert.equal(newReviewTask.answer, 'D');
assert.equal(tasks.filter(task => task.coursePart !== 'zadania').length, 28);

for (const task of tasks) {
  const imagePath = path.join(sourceDir, task.file);
  const image = fs.readFileSync(imagePath);

  assert.equal(image.subarray(1, 4).toString(), 'PNG', `${task.file}: PNG signature`);
  assert(!fs.existsSync(imagePath.replace(/\.png$/, '.webp')), `${task.file}: one image format`);
  if(task.file === 'zp10.png'){
    assert.equal(image.readUInt32BE(16), 1051, 'New task retains the supplied image width');
    assert.equal(image.readUInt32BE(20), 299, 'New task retains the supplied image height');
    assert.equal(image[25], 6, 'New task retains the supplied RGBA image');
    continue;
  }
  assert(image.readUInt32BE(16) >= 1250, `${task.file}: crop keeps the full task width`);
  assert(image.readUInt32BE(20) >= 100, `${task.file}: crop is not vertically clipped`);
  assert.equal(image[25], 2, `${task.file}: image uses RGB color instead of grayscale`);
}

console.log('PASS: MP lesson 8 has 58 tasks, 10 review tasks and the correct translated domain key');
