const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const sourcePath = 'zadania/kurs/mp/test_lekcje_1_6/test_lekcje_1_6.json';
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

function functionSource(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  const body = text.slice(start, text.indexOf('\n}', start) + 2);
  return text.slice(start - 6, start) === 'async ' ? `async ${body}` : body;
}

assert.equal(tasks.length, 10);
assert.deepEqual(tasks.map(task => task.taskNumber), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
assert.equal(tasks.reduce((total, task) => total + task.maxPoints, 0), 14);
assert.deepEqual(tasks.filter(task => task.type === 'closed').map(task => task.answer), ['C', 'B', 'C', 'A', 'A', 'D']);
assert.equal(tasks[6].inputs[0].answer, '32');
assert.equal(tasks[6].answer, '32');
assert.equal(tasks[7].inputs[0].acceptedFormsOnly, true);
assert.deepEqual(tasks[7].inputs[0].answers, [
  '-3-2√2',
  '-2√2-3',
  '-3-√8',
  '-√8-3',
  '-(3+2√2)',
  '-(1+√2)²'
]);
assert.deepEqual(tasks.map(task => task.title), tasks.map(task => `Zadanie ${task.taskNumber}`));
assert(tasks.every(task => !/test sprawdzający/i.test(task.topic)));
assert.equal(tasks[8].topic, 'Reszta z dzielenia');
assert.equal(tasks[8].inputs.length, 1);
assert.equal(tasks[8].inputs[0].prompt, 'Wpisz obliczoną resztę z dzielenia liczby 2k² przez 14.');
assert.equal(tasks[8].inputs[0].answer, '4');
assert.equal(tasks[8].inputs[0].exact, true);
assert.equal(tasks[8].inputs[0].acceptedFormsOnly, true);
assert.equal(tasks[8].answer, '4');
assert(!('inputExample' in tasks[8]));
assert.equal(tasks[9].inputs.length, 1);
assert.equal(tasks[9].inputs[0].prompt, 'Wpisz trzeci dzielnik pierwszy.');
assert.equal(tasks[9].inputs[0].answer, '31');
assert(tasks.slice(6).every(task => !('instruction' in task)), 'Input prompts are not duplicated above the fields');

const answerContext = vm.createContext({});
for (const name of ['normalizeTypedAnswer', 'normalizeSymbolicExpression', 'normalizeAcceptedMathForm',
  'isTypedAnswerCorrect', 'isInputFieldAnswerCorrect']) {
  vm.runInContext(functionSource(html, name), answerContext);
}
const strictField = {
  control: '',
  answers: tasks[7].inputs[0].answers,
  exact: false,
  acceptedFormsOnly: true
};
for (const answer of [
  '-3-2√2',
  '-2√(2)-3',
  '-3-√8',
  '-√(8)-3',
  '-(3+2*√2)',
  '-(1+√(2))²',
  '-(1+sqrt(2))^(2)'
]) {
  assert(answerContext.isInputFieldAnswerCorrect(answer, strictField), answer);
}
for (const answer of ['-5.828427125', '-3+2√2', '3-2√2', '-(√2+1)^2']) {
  assert(!answerContext.isInputFieldAnswerCorrect(answer, strictField), answer);
}
const strictFourField = {
  control: '',
  answers: [tasks[8].inputs[0].answer],
  exact: tasks[8].inputs[0].exact,
  acceptedFormsOnly: tasks[8].inputs[0].acceptedFormsOnly
};
assert(answerContext.isInputFieldAnswerCorrect('4', strictFourField));
for (const answer of ['04', '4.0', '4,0']) {
  assert(!answerContext.isInputFieldAnswerCorrect(answer, strictFourField), answer);
}

const expectedHeights = {
  '1.png': 103, '2.png': 156, '3.png': 175, '4.png': 183, '5.png': 191,
  '6.png': 158, '7.png': 225, '8.png': 175, '9.png': 59, '10.png': 86
};

for (const task of tasks) {
  assert.equal(task.level, 'matura_podstawowa');
  assert.equal(task.coursePart, 'praca_domowa');
  assert.equal(task.activityType, 'test');
  assert.equal(task.theme, 'checkpoint-blue');
  assert(!('hint' in task));
  assert(!('videoUrl' in task));
  assert(task.tags.includes('test 1-6'));

  const png = fs.readFileSync(path.join(sourceDir, task.file));
  const webp = fs.readFileSync(path.join(sourceDir, task.file.replace(/\.png$/, '.webp')));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 950);
  assert.equal(png.readUInt32BE(20), expectedHeights[task.file]);
  assert.equal(webp.subarray(0, 4).toString(), 'RIFF');
  assert.equal(webp.subarray(8, 12).toString(), 'WEBP');
}

for (const [text, name] of [
  [html, 'TASK_SOURCES'],
  [profileHtml, 'PROFILE_SOURCES'],
  [adminHtml, 'ADMIN_TASK_SOURCES']
]) {
  const entries = config(text, name).filter(source => source.path === sourcePath);
  assert.equal(entries.length, 1, `${name}: MP test registered once`);
  assert.equal(entries[0].category, 'kurs');
  assert.equal(entries[0].level, 'matura_podstawowa');
  assert.equal(entries[0].kind, 'test');
  if(name === 'TASK_SOURCES') assert.equal(entries[0].unlocksNextSources, 4);
  assert.equal(entries[0].label, 'Test sprawdzający z tematów 1-6, wersja A.');
  assert.equal(entries[0].detail, '60 minut');
}

const taskSources = config(html, 'TASK_SOURCES');
const lesson6Index = taskSources.findIndex(source => source.path.includes('/mp/lekcja_6/'));
const testIndex = taskSources.findIndex(source => source.path === sourcePath);
assert(lesson6Index >= 0 && lesson6Index < testIndex);

const storage = new Map();
let now = 1_800_000_000_000;
const timer = vm.createContext({
  currentTask: {activityType: 'test', sourceId: sourcePath},
  selectedSource: sourcePath,
  loggedUser: {id: 17},
  TEST_DURATION_SECONDS: 60 * 60,
  testDeadlineFallbacks: new Map(),
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  },
  Date: {now: () => now},
  Math,
  Number,
  String,
  Map
});
for (const name of ['timerClock', 'testTimerStorageKey', 'storedTestDeadline', 'startTestTimer', 'testDeadline', 'testRemainingSeconds']) {
  vm.runInContext(functionSource(html, name), timer);
}
assert.equal(timer.timerClock(3600), '60:00');
assert.equal(timer.testRemainingSeconds(), 3600);
assert.equal(storage.size, 0, 'Viewing the unconfirmed test does not start the timer');
timer.startTestTimer(sourcePath);
assert.equal(storage.size, 1, 'Confirmation persists one fixed deadline');
assert.equal(timer.testRemainingSeconds(), 3600);
now += 15_000;
assert.equal(timer.testRemainingSeconds(), 3585, 'Countdown keeps the original deadline');
timer.startTestTimer(sourcePath);
assert.equal(timer.testRemainingSeconds(), 3585, 'Starting again cannot reset the deadline');

(async () => {
  let confirmed = false;
  let startCalls = 0;
  const gate = vm.createContext({
    getSourceMetaById: () => ({id: sourcePath, kind: 'test'}),
    storedTestDeadline: () => 0,
    confirmTestStart: async () => confirmed,
    startTestTimer: () => {startCalls++;}
  });
  vm.runInContext(functionSource(html, 'ensureTestSourceStarted'), gate);
  assert.equal(await gate.ensureTestSourceStarted(sourcePath), false);
  assert.equal(startCalls, 0, 'Cancellation cannot start the timer');
  confirmed = true;
  assert.equal(await gate.ensureTestSourceStarted(sourcePath), true);
  assert.equal(startCalls, 1, 'Confirmation starts the timer exactly once');

  const testTasks = [
    {sourceId: sourcePath, file: '1.png', category: 'kurs', activityType: 'test'},
    {sourceId: sourcePath, file: '2.png', category: 'kurs', activityType: 'test'}
  ];
  const savedResults = new Map([[`${sourcePath}:1.png`, {result: 'good'}]]);
  const savedAsBad = [];
  let summaryShown = 0;
  const expiration = vm.createContext({
    selectedSource: sourcePath,
    currentTask: testTasks[1],
    currentTaskAnswered: false,
    completedHomeworkSummarySource: '',
    isLoggedInStudent: true,
    loggedUser: {role: 'student'},
    testFinalizationPromises: new Map(),
    pendingProgressSaveRequests: new Set(),
    COURSE_COMPLETION_RESULTS: new Set(['good', 'medium', 'bad', 'video']),
    sessionResults: new Map(),
    sessionScores: new Map(),
    getSourceMetaById: () => ({id: sourcePath, kind: 'test'}),
    markTestTimedOut: () => {},
    ensureTaskSourceLoaded: async () => {},
    loadStudentProgress: async () => {},
    getHomeworkSummaryTasks: () => testTasks,
    getSavedProgressItem: task => savedResults.get(`${task.sourceId}:${task.file}`) || null,
    saveProgress: async (result, score, duration, task) => {
      savedAsBad.push(task.file);
      const progress = {result};
      savedResults.set(`${task.sourceId}:${task.file}`, progress);
      return progress;
    },
    getTaskDurationSeconds: () => 0,
    taskPointValue: () => 1,
    taskUsedHint: () => false,
    getTaskKey: task => `${task.sourceId}:${task.file}`,
    preloadUnlockedCourseSources: async () => {},
    renderSourceSelector: () => {},
    applyCourseAnswerLock: () => {},
    renderTaskNavigator: () => {},
    updateSourceSummary: () => {},
    showHomeworkCompletionSummary: () => {summaryShown++;},
    showMessage: () => {},
    console,
    Promise,
    Map,
    Set,
    Error
  });
  vm.runInContext(functionSource(html, 'finishExpiredTest'), expiration);
  assert.equal(await expiration.finishExpiredTest(sourcePath), true);
  assert.deepEqual(savedAsBad, ['2.png'], 'Only unanswered tasks receive zero points after timeout');
  assert.equal(summaryShown, 1, 'Timeout immediately opens the saved test result');
  assert.equal(expiration.sessionResults.get(`${sourcePath}:2.png`), 'bad');

  assert.match(html, /const TEST_DURATION_SECONDS = 60 \* 60;/);
  assert.match(html, /: `Pozostało \$\{timerClock\(remainingSeconds\)\}`;/);
  assert.match(html, /setTimerVisible\(!isLoggedInStudent \|\| isTest\);/);
  assert.match(html, /\.timer\.countdown\.expired/);
  assert.match(html, /id="testStartDialog"/);
  assert.match(html, /Po potwierdzeniu rozpocznie się odliczanie 60 minut\./);
  assert.match(html, /Tego licznika nie można zatrzymać\./);
  assert.match(html, /Rozpocznij test tylko wtedy, gdy wiesz, że masz godzinę wolnego czasu/);
  assert.match(html, /currentTask\?\.activityType === "test"/,
    'A wrong test input reveals the submitted and correct answers');
  assert.match(html, /className = "input-answer-example"/);
  assert.match(html, /@media \(orientation: landscape\) and \(max-height: 560px\) and \(max-width: 1000px\)/);
  assert.match(html, /body\.focus-mode \.focus-toggle::after\s*\{[^}]*content: "×";/s);
  const pointsBadgeStyle = html.match(/\.points-badge\s*\{([^}]+)\}/)[1];
  assert.match(pointsBadgeStyle, /align-items: center;/);
  assert.match(pointsBadgeStyle, /justify-content: center;/);
  assert.match(pointsBadgeStyle, /height: 28px;/);
  assert.match(pointsBadgeStyle, /line-height: 1;/);
  assert.match(html, /if\(sourceId !== "all" && !await ensureTestSourceStarted\(sourceId\)\) return;/);
  assert.match(html, /Test zakończony - czas minął/);
  assert.match(html, /await Promise\.allSettled\(\[\.\.\.pendingProgressSaveRequests\]\)/);
  assert.match(html, /const unfinishedTasks = getHomeworkSummaryTasks\(sourceId\)/);
  assert.match(html, /\.course-source-list \.source-btn\.test-source/);
  assert(fs.statSync(path.join(sourceDir, 'Kurs matura podstawowa test A lekcje 1-6.pdf')).size > 400000);

  console.log('PASS: MP test 1-6, clean crops, confirmation gate and persistent 60-minute countdown');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
