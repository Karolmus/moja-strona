const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const sourcePath = 'zadania/kurs/mp/lekcja_8/lekcja_8_funkcja_liniowa.json';
const sourceDir = path.dirname(sourcePath);
const tasks = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

assert.equal(tasks.length, 57);
assert.deepEqual(
  tasks.reduce((groups, task) => {
    groups[task.coursePart] = (groups[task.coursePart] || 0) + 1;
    return groups;
  }, {}),
  {zadania: 30, praca_domowa: 18, zadania_powtorkowe: 9}
);

for (const task of tasks) {
  const imagePath = path.join(sourceDir, task.file);
  const image = fs.readFileSync(imagePath);

  assert.equal(image.subarray(1, 4).toString(), 'PNG', `${task.file}: PNG signature`);
  assert(image.readUInt32BE(16) >= 1250, `${task.file}: crop keeps the full task width`);
  assert(image.readUInt32BE(20) >= 100, `${task.file}: crop is not vertically clipped`);
  assert.equal(image[25], 2, `${task.file}: image uses RGB color instead of grayscale`);
}

console.log('PASS: MP lesson 8 has 57 complete color crops');
