const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('zadania.html', 'utf8');
const lessonPath = 'zadania/kurs/eo/lekcja_2/lekcja_2_dzialania_na_liczbach.json';
const tasks = JSON.parse(fs.readFileSync(lessonPath));
const homeworkTask = tasks.find(task => task.file === 'zd3.png');

function source(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}

const context = vm.createContext({});
for (const name of ['getOptions', 'getGroupedMultiOptions', 'isGroupedMultiTask']) {
  vm.runInContext(source(name), context);
}

const groups = JSON.parse(JSON.stringify(context.getGroupedMultiOptions(homeworkTask)));
assert(context.isGroupedMultiTask(homeworkTask));
assert.deepEqual(groups.map(group => group.label), ['a)', 'b)']);
assert.deepEqual(groups.map(group => group.options.map(option => option.label)), [
  ['A', 'B', 'C', 'D'],
  ['A', 'B', 'C', 'D']
]);
assert.deepEqual(groups.map(group => group.options.map(option => option.value)), [
  ['a) A', 'a) B', 'a) C', 'a) D'],
  ['b) A', 'b) B', 'b) C', 'b) D']
]);

const groupedStyle = html.match(/\.grouped-choice-row \{([^}]+)\}/)[1];
assert.match(groupedStyle, /grid-template-columns: 56px repeat\(var\(--grouped-option-count, 2\), minmax\(80px, 120px\)\);/);
assert.match(groupedStyle, /justify-content: start;/);

const png = fs.readFileSync('zadania/kurs/eo/lekcja_2/zd3.png');
const webp = fs.readFileSync('zadania/kurs/eo/lekcja_2/zd3.webp');
assert.equal(png.subarray(1, 4).toString(), 'PNG');
assert(png.readUInt32BE(16) >= 1100, 'The task image remains legible');
assert(png.readUInt32BE(20) >= 400 && png.readUInt32BE(20) <= 500, 'The crop contains only the task');
assert.equal(webp.subarray(0, 4).toString(), 'RIFF');
assert.equal(webp.subarray(8, 12).toString(), 'WEBP');

console.log('PASS: EO lesson 2 clean homework crop and grouped subpoint answers');
