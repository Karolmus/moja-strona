const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('zadania.html', 'utf8');

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}

function lesson(level, number) {
  const course = level === 'egzamin_osmoklasisty' ? 'eo' : 'mp';
  return {
    path: `zadania/kurs/${course}/lekcja_${number}/lekcja_${number}.json`,
    category: 'kurs',
    level,
    label: `Lekcja ${number}`
  };
}

function checkpoint(level, range, unlocksNextSources = 0) {
  const course = level === 'egzamin_osmoklasisty' ? 'eo' : 'mp';
  return {
    path: `zadania/kurs/${course}/test_lekcje_${range.replace('-', '_')}/test.json`,
    category: 'kurs',
    level,
    label: `Test ${range}`,
    kind: 'test',
    unlocksNextSources
  };
}

function optionalCheckpoint(level, prerequisite) {
  return {
    path: 'zadania/kurs/eo/test_lekcje_1_6_trudniejszy/test.json',
    category: 'kurs',
    level,
    label: 'Test trudniejszy 1-6',
    kind: 'test',
    optional: true,
    requiresSource: prerequisite.path,
    minScorePercent: 80
  };
}

const eoLevel = 'egzamin_osmoklasisty';
const mpLevel = 'matura_podstawowa';
const eoCheckpoint = checkpoint(eoLevel, '1-6', 4);
const eoSources = [
  ...Array.from({length: 6}, (_, index) => lesson(eoLevel, index + 1)),
  eoCheckpoint,
  optionalCheckpoint(eoLevel, eoCheckpoint),
  ...Array.from({length: 5}, (_, index) => lesson(eoLevel, index + 7))
];
const mpSources = [
  ...Array.from({length: 6}, (_, index) => lesson(mpLevel, index + 1)),
  checkpoint(mpLevel, '1-6'),
  ...Array.from({length: 6}, (_, index) => lesson(mpLevel, index + 7)),
  checkpoint(mpLevel, '7-12'),
  lesson(mpLevel, 13)
];
const sources = [...eoSources, ...mpSources];
const tasks = sources.map(source => ({
  sourceId: source.path,
  file: 'zd1.png',
  category: 'kurs',
  level: source.level,
  coursePart: 'praca_domowa',
  maxPoints: 10
}));
const progress = new Map();
const ctx = vm.createContext({
  TASK_SOURCES: sources,
  COURSE_COMPLETION_RESULTS: new Set(['good', 'medium', 'bad', 'video']),
  selectedCategory: 'kurs',
  selectedLevel: eoLevel,
  isLoggedInStudent: true,
  loggedUser: {role: 'student'},
  getSourceMeta: source => ({...source, id: source.path}),
  isTaskSourceLoaded: sourceId => tasks.some(task => task.sourceId === sourceId),
  getSourceCompletionTasks: source => tasks.filter(task => task.sourceId === source.id),
  getSavedProgressItem: task => progress.get(`${task.sourceId}:${task.file}`) || null,
  taskPointValue: task => task.maxPoints,
  getTaskScore: task => {
    const saved = progress.get(`${task.sourceId}:${task.file}`);
    return saved ? {earnedPoints: saved.earned_points, maxPoints: saved.max_points} : null;
  }
});

for (const name of [
  'getCourseSourceSequence',
  'getPreviousCourseCheckpoint',
  'isCheckpointStageComplete',
  'getCheckpointScorePercent',
  'isOptionalCourseTestUnlocked',
  'isCourseSourceVisible',
  'getAvailableSources'
]) {
  vm.runInContext(functionSource(name), ctx);
}

const visibleLabels = level => {
  ctx.selectedLevel = level;
  return ctx.getAvailableSources().map(source => source.label);
};
const complete = (source, result = 'good', earnedPoints = 10) => {
  const task = tasks.find(item => item.sourceId === source.path);
  progress.set(`${task.sourceId}:${task.file}`, {
    result,
    earned_points: earnedPoints,
    max_points: task.maxPoints
  });
};

assert.deepEqual(visibleLabels(eoLevel), [
  'Lekcja 1', 'Lekcja 2', 'Lekcja 3', 'Lekcja 4', 'Lekcja 5', 'Lekcja 6', 'Test 1-6'
]);
assert(!visibleLabels(eoLevel).includes('Lekcja 7'));

complete(eoSources[6], 'skipped', 0);
assert(!visibleLabels(eoLevel).includes('Lekcja 7'), 'An unfinished test keeps the next lessons locked');
complete(eoSources[6], 'medium', 8);
assert(visibleLabels(eoLevel).includes('Lekcja 7'), 'A completed test unlocks the next lessons regardless of its score');
assert(!visibleLabels(eoLevel).includes('Test trudniejszy 1-6'), 'A score of exactly 80% does not unlock the harder test');
assert(visibleLabels(eoLevel).includes('Lekcja 10'), 'The checkpoint unlocks lessons 7-10');
assert(!visibleLabels(eoLevel).includes('Lekcja 11'), 'Lessons after the unlocked block stay hidden until the next checkpoint is added');
complete(eoSources[6], 'medium', 9);
assert(visibleLabels(eoLevel).includes('Test trudniejszy 1-6'), 'A score above 80% unlocks the optional harder test');
assert(visibleLabels(eoLevel).includes('Lekcja 7'), 'The optional test never blocks the next lesson stage');

assert.deepEqual(visibleLabels(mpLevel), [
  'Lekcja 1', 'Lekcja 2', 'Lekcja 3', 'Lekcja 4', 'Lekcja 5', 'Lekcja 6', 'Test 1-6'
]);
complete(mpSources[6]);
assert(visibleLabels(mpLevel).includes('Lekcja 7'), 'Completing the first MP checkpoint unlocks the next lessons');
assert(visibleLabels(mpLevel).includes('Test 7-12'), 'The next checkpoint is available with its lesson stage');
assert(!visibleLabels(mpLevel).includes('Lekcja 13'));

complete(mpSources[13], 'medium');
assert(visibleLabels(mpLevel).includes('Lekcja 13'), 'Completing the second checkpoint unlocks the following stage');

progress.clear();
ctx.loggedUser = {role: 'admin'};
assert(visibleLabels(eoLevel).includes('Lekcja 7'), 'The administrator keeps access to the full EO course');
assert(visibleLabels(eoLevel).includes('Lekcja 11'), 'The administrator can preview later EO lessons');
assert(visibleLabels(mpLevel).includes('Lekcja 13'), 'The administrator keeps access to the full MP course');

assert.match(html, /getSavedProgressItem\(task\)\?\.result/,
  'Unlocking depends on progress confirmed by the server, not unsaved session state');
assert.match(html, /await preloadUnlockedCourseSources\(\);/,
  'A returning student gets counts for newly unlocked lessons during startup');
assert.match(html, /Ukończenie testu odblokuje kolejne materiały\./,
  'Checkpoint tiles explain that completing the test unlocks more course material');
assert(!html.includes('EO_FIRST_CHECKPOINT_SOURCE'), 'Checkpoint gating is no longer tied to one EO test');

console.log('PASS: completing each checkpoint unlocks only its following course stage');
