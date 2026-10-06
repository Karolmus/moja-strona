const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const sourcePath = 'zadania/kurs/eo/test_lekcje_1_6_trudniejszy/test_lekcje_1_6_trudniejszy.json';
const prerequisitePath = 'zadania/kurs/eo/test_lekcje_1_6/test_lekcje_1_6.json';
const sourceDir = path.dirname(sourcePath);
const tasks = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const html = fs.readFileSync('zadania.html', 'utf8');
const profileHtml = fs.readFileSync('profil.html', 'utf8');
const adminHtml = fs.readFileSync('admin.html', 'utf8');

function config(text, name) {
  const value = text.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  assert(value, name);
  return vm.runInNewContext(value[1]);
}

assert.equal(tasks.length, 14);
assert.deepEqual(tasks.map(task => task.taskNumber), [
  '1.1', '1.2', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'
]);
assert.equal(tasks.reduce((sum, task) => sum + task.maxPoints, 0), 16);

for (const task of tasks) {
  assert.equal(task.level, 'egzamin_osmoklasisty');
  assert.equal(task.activityType, 'test');
  assert.equal(task.theme, 'checkpoint-blue');
  assert(task.tags.includes('test trudniejszy'));
  assert(!('hint' in task));
  assert(!('videoUrl' in task));
  assert(fs.existsSync(path.join(sourceDir, task.file)), task.file);
  if (task.contextFile) assert(fs.existsSync(path.join(sourceDir, task.contextFile)), task.contextFile);
}

assert.deepEqual(tasks.filter(task => task.type === 'closed').map(task => task.answer), [
  'A', 'D', 'D', 'D', 'A', 'C', 'B', 'C'
]);
assert.deepEqual(tasks.find(task => task.taskNumber === '4').answer, ['F', 'F']);
assert.deepEqual(tasks.find(task => task.taskNumber === '6').answer, ['P', 'F']);
assert.deepEqual(tasks.find(task => task.taskNumber === '7').answer, ['P', 'F']);
assert.equal(tasks.find(task => task.taskNumber === '10').inputs[0].answer, '80');
assert.deepEqual(tasks.find(task => task.taskNumber === '11').inputs.map(input => input.answer), ['II', 'I', 'III']);
assert.deepEqual(tasks.find(task => task.taskNumber === '13').inputs.map(input => input.answer), ['80', '5']);

const taskSources = config(html, 'TASK_SOURCES');
const optionalSource = taskSources.find(source => source.path === sourcePath);
assert(optionalSource);
assert.equal(optionalSource.kind, 'test');
assert.equal(optionalSource.optional, true);
assert.equal(optionalSource.requiresSource, prerequisitePath);
assert.equal(optionalSource.minScorePercent, 80);
assert.equal(optionalSource.unlocksNextSources, undefined);

const normalIndex = taskSources.findIndex(source => source.path === prerequisitePath);
const optionalIndex = taskSources.findIndex(source => source.path === sourcePath);
const lesson7Index = taskSources.findIndex(source => source.path.includes('/eo/lekcja_7/'));
assert(normalIndex < optionalIndex && optionalIndex < lesson7Index);

for (const [text, name] of [[profileHtml, 'PROFILE_SOURCES'], [adminHtml, 'ADMIN_TASK_SOURCES']]) {
  const entries = config(text, name).filter(source => source.path === sourcePath);
  assert.equal(entries.length, 1, `${name}: optional test registered once`);
}

assert.match(html, /getCheckpointScorePercent\(prerequisite\) > source\.minScorePercent/);
assert.match(html, /item\.kind === "test" && !item\.optional/);
assert.match(html, /Test opcjonalny\. Nie blokuje dostępu do kolejnych lekcji\./);

console.log('PASS: harder EO test unlocks only above 80% and remains optional');
