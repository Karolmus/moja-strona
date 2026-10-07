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

assert.equal(tasks.length, 15);
assert.deepEqual(tasks.map(task => task.taskNumber), [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'
]);
assert.equal(new Set(tasks.map(task => task.file)).size, 15);
assert.equal(tasks.reduce((sum, task) => sum + task.maxPoints, 0), 18);

const expectedCropHeights = {
  '1.png': 288, '2.png': 389, '3.png': 1096, '4.png': 316, '5.png': 231,
  '6.png': 293, '7.png': 414, '8.png': 293, '9.png': 293, '10.png': 356,
  '11.png': 239, '12.png': 114, '13.png': 131, '14.png': 311, '15.png': 66
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
  assert.equal(image.readUInt32BE(16), task.file === '13.png' ? 1048 : 1100, `${task.file}: crop width`);
  assert.equal(image.readUInt32BE(20), expectedCropHeights[task.file], `${task.file}: crop height`);
}

assert.deepEqual(tasks.filter(task => task.type === 'closed').map(task => task.answer), [
  'A', 'B', 'D', 'B', 'C', 'D', 'A'
]);
assert.deepEqual(tasks.find(task => task.taskNumber === '3').answer, ['F', 'P']);
assert.deepEqual(tasks.find(task => task.taskNumber === '6').answer, ['P', 'P']);
assert.deepEqual(tasks.find(task => task.taskNumber === '8').answer, ['F', 'P']);
assert.deepEqual(tasks.find(task => task.taskNumber === '9').answer, ['F', 'P']);
for (const taskNumber of ['3', '6', '8', '9']) {
  assert.deepEqual(tasks.find(task => task.taskNumber === taskNumber).statements,
    ['Stwierdzenie 1', 'Stwierdzenie 2']);
}

const task11 = tasks.find(task => task.taskNumber === '11');
assert.equal(task11.type, 'input');
assert.equal(task11.maxPoints, 1);
assert.equal(task11.inputs[0].answer, '8');
assert.notEqual(task11.inputs[0].exact, true);
assert.notEqual(task11.inputs[0].acceptedFormsOnly, true);
assert.equal(task11.inputs[0].math, false);

const task12 = tasks.find(task => task.taskNumber === '12');
assert.equal(task12.type, 'input');
assert.equal(task12.maxPoints, 2);
assert.equal(task12.inputs[0].answer, '12240');
assert.equal(task12.inputs[0].suffix, 'zł');

const task13 = tasks.find(task => task.taskNumber === '13');
assert.equal(task13.type, 'input');
assert.equal(task13.maxPoints, 2);
assert.deepEqual(task13.inputs[0].answers, ['-1/20', '-0,05', '-0.05']);

const task15 = tasks.find(task => task.taskNumber === '15');
assert.equal(task15.type, 'input');
assert.equal(task15.maxPoints, 2);
assert.deepEqual(task15.inputs[0].answers, ['14√2', '14sqrt(2)']);

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
  if (name === 'TASK_SOURCES') assert.equal(entries[0].unlocksNextSources, 4);
}

const taskSources = config(html, 'TASK_SOURCES');
const testIndex = taskSources.findIndex(source => source.path === sourcePath);
const lesson6Index = taskSources.findIndex(source => source.path.includes('/eo/lekcja_6/'));
const lesson7Index = taskSources.findIndex(source => source.path.includes('/eo/lekcja_7/'));
assert(lesson6Index < testIndex && testIndex < lesson7Index);

assert.match(html, /\.meta-checkpoint\s*\{\s*background: linear-gradient\(90deg, #49add6 0%, #a8daee 42%, #ffffff 100%\);/);
assert.match(html, /\.tile\.nav-theme-checkpoint\s*\{\s*--tile-bg: linear-gradient\(135deg, #49add6 0%, #eaf7fc 100%\);/);
assert.match(html, /if\(task\.theme === "checkpoint-blue"\) return "nav-theme-checkpoint";/);
assert.match(html, /\? "Test zakończony"\s*: "Podsumowanie zadania domowego"/);
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
assert(fs.statSync(path.join(sourceDir, 'Test lekcje 1-6.pdf')).size > 300000);
assert(tasks.filter(task => task.type === 'input').every(task => !task.instruction),
  'Instructions appear once as field labels');

console.log('PASS: new EO checkpoint after lessons 1-6, clean crops, answer key and blue theme');
