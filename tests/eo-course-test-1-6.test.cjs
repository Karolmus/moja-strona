const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const sourcePath = 'zadania/kurs/eo/test_lekcje_1_6/test_lekcje_1_6.json';
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
assert.equal(new Set(tasks.map(task => task.file)).size, 14);
const expectedCropHeights = {
  '1_1.png': 118, '1_2.png': 122, '2.png': 270, '3.png': 184,
  '4.png': 265, '5.png': 311, '6.png': 265, '7.png': 267,
  '8.png': 354, '9.png': 312, '10.png': 138, '11.png': 431,
  '12.png': 256, '13.png': 63
};

for (const task of tasks) {
  assert.equal(task.level, 'egzamin_osmoklasisty');
  assert.equal(task.coursePart, 'praca_domowa');
  assert.equal(task.activityType, 'test');
  assert.equal(task.theme, 'checkpoint-blue');
  assert(!('hint' in task));
  assert(!('videoUrl' in task));
  assert(task.tags.includes('test 1-6'));

  const image = fs.readFileSync(path.join(sourceDir, task.file));
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  assert(image.readUInt32BE(16) >= 900 && image.readUInt32BE(16) <= 1000, task.file);
  assert.equal(image.readUInt32BE(20), expectedCropHeights[task.file], `${task.file}: clean crop height`);
}

const context = fs.readFileSync(path.join(sourceDir, 'context_1.png'));
assert.equal(context.subarray(1, 4).toString(), 'PNG');
assert.equal(context.readUInt32BE(20), 193);
assert.equal(tasks[0].contextFile, 'context_1.png');
assert.equal(tasks[1].contextFile, 'context_1.png');

assert.deepEqual(tasks.filter(task => task.type === 'closed').map(task => task.answer), [
  'A', 'D', 'D', 'D', 'A', 'C', 'B', 'C'
]);
assert.deepEqual(tasks.find(task => task.taskNumber === '4').answer, ['F', 'F']);
assert.deepEqual(tasks.find(task => task.taskNumber === '6').answer, ['P', 'F']);
assert.deepEqual(tasks.find(task => task.taskNumber === '7').answer, ['P', 'F']);

const task10 = tasks.find(task => task.taskNumber === '10');
assert.equal(task10.type, 'input');
assert.equal(task10.maxPoints, 2);
assert.equal(task10.inputs[0].answer, '80');
assert.equal(task10.inputs[0].suffix, 'zł');

const task11 = tasks.find(task => task.taskNumber === '11');
assert.equal(task11.type, 'input');
assert.deepEqual(task11.inputs, [
  {label: 'a', options: ['I', 'II', 'III'], answer: 'II'},
  {label: 'b', options: ['I', 'II', 'III'], answer: 'I'},
  {label: 'c', options: ['I', 'II', 'III'], answer: 'III'}
]);

const task13 = tasks.find(task => task.taskNumber === '13');
assert.equal(task13.type, 'input');
assert.equal(task13.maxPoints, 2);
assert.deepEqual(task13.inputs, [
  {label: 'a', answer: '80'},
  {label: 'b', answer: '5'}
]);

for (const [text, name] of [
  [html, 'TASK_SOURCES'],
  [profileHtml, 'PROFILE_SOURCES'],
  [adminHtml, 'ADMIN_TASK_SOURCES']
]) {
  const entries = config(text, name).filter(source => source.path === sourcePath);
  assert.equal(entries.length, 1, `${name}: test registered once`);
  assert.equal(entries[0].category, 'kurs');
  assert.equal(entries[0].level, 'egzamin_osmoklasisty');
  assert.equal(entries[0].kind, 'test');
  assert.equal(entries[0].label, 'Test sprawdzający z lekcji 1 - 6');
  if(name === 'TASK_SOURCES') assert.equal(entries[0].unlocksNextSources, 4);
}

const taskSources = config(html, 'TASK_SOURCES');
const testIndex = taskSources.findIndex(source => source.path === sourcePath);
const lesson6Index = taskSources.findIndex(source => source.path.includes('/eo/lekcja_6/'));
const lesson7Index = taskSources.findIndex(source => source.path.includes('/eo/lekcja_7/'));
assert(lesson6Index < testIndex && testIndex < lesson7Index);

assert.match(html, /\.meta-checkpoint\s*\{\s*background: linear-gradient\(90deg, #49add6 0%, #a8daee 42%, #ffffff 100%\);/);
assert.match(html, /\.tile\.nav-theme-checkpoint\s*\{\s*--tile-bg: linear-gradient\(135deg, #49add6 0%, #eaf7fc 100%\);/);
assert.match(html, /if\(task\.theme === "checkpoint-blue"\) return "nav-theme-checkpoint";/);
assert.match(html, /\? timedOut \? "Test zakończony - czas minął" : "Test zakończony"/);
assert.match(html, /hintButton\.hidden = isOpenExam \|\| isTest;/);
assert.match(html, /videoLink\.hidden = isTest \|\| !videoUrl;/);
assert.match(html, /reviewButton\.hidden = isTest \|\| !isLoggedInStudent/);
assert.match(html, /skipButton\.hidden = isPreview \|\| isTest;/);
assert.match(html, /answerButton\.hidden = isTest \|\| isExternalSubmission/);
assert.match(html, /if\(currentTask\.activityType === "test"\) return;/);
assert.match(html, /if\(currentTask\?\.activityType === "test"\) return;/);
assert.match(html, /\.action-group\.tools\.test-mode\s*\{\s*display: none;/);
assert.match(html, /\.action-group\.navigation\.test-mode\s*\{\s*grid-column: 1 \/ -1;/);
assert(!html.includes('Zaznacz odpowiedź, aby ukończyć zadanie.'));
assert.match(html, /id="testModeNotice"[^>]*hidden>W trybie testu nie możesz korzystać ze wskazówek ani dodawać zadań do omówienia\.<\/p>/);
assert.match(html, /testModeNotice\.hidden = !isTest;/);
assert.match(profileHtml, /source\.category === category && source\.kind !== "test"/);
assert.match(adminHtml, /excludeKinds: \["test"\]/);
assert(fs.statSync(path.join(sourceDir, 'Test lekcje 1-6.pdf')).size > 400000);

console.log('PASS: EO checkpoint after lessons 1-6, clean crops, answers and blue theme');
