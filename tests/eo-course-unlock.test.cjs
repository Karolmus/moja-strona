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

const eoLevel = 'egzamin_osmoklasisty';
const mpLevel = 'matura_podstawowa';
const eoSources = [
  ...Array.from({length: 6}, (_, index) => lesson(eoLevel, index + 1)),
  checkpoint(eoLevel, '1-6', 4),
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
  coursePart: 'praca_domowa'
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
  getSavedProgressItem: task => progress.get(`${task.sourceId}:${task.file}`) || null
});

for (const name of [
  'getCourseSourceSequence',
  'getPreviousCourseCheckpoint',
  'getCheckpointStageSources',
  'isCheckpointStageComplete',
  'isCourseSourceVisible',
  'getAvailableSources'
]) {
  vm.runInContext(functionSource(name), ctx);
}

const visibleLabels = level => {
  ctx.selectedLevel = level;
  return ctx.getAvailableSources().map(source => source.label);
};
const complete = (source, result = 'good') => {
  const task = tasks.find(item => item.sourceId === source.path);
  progress.set(`${task.sourceId}:${task.file}`, {result});
};

assert.deepEqual(visibleLabels(eoLevel), [
  'Lekcja 1', 'Lekcja 2', 'Lekcja 3', 'Lekcja 4', 'Lekcja 5', 'Lekcja 6', 'Test 1-6'
]);
assert(!visibleLabels(eoLevel).includes('Lekcja 7'));

eoSources.slice(0, 7).forEach(source => complete(source));
complete(eoSources[2], 'skipped');
assert(!visibleLabels(eoLevel).includes('Lekcja 7'), 'Skipping one task keeps the next stage locked');
complete(eoSources[2], 'bad');
assert(visibleLabels(eoLevel).includes('Lekcja 7'), 'A completed incorrect answer counts as work done');
assert(visibleLabels(eoLevel).includes('Lekcja 10'), 'The checkpoint unlocks lessons 7-10');
assert(!visibleLabels(eoLevel).includes('Lekcja 11'), 'Lessons after the unlocked block stay hidden until the next checkpoint is added');

assert.deepEqual(visibleLabels(mpLevel), [
  'Lekcja 1', 'Lekcja 2', 'Lekcja 3', 'Lekcja 4', 'Lekcja 5', 'Lekcja 6', 'Test 1-6'
]);
mpSources.slice(0, 7).forEach(source => complete(source));
assert(visibleLabels(mpLevel).includes('Lekcja 7'), 'Completing the first MP checkpoint unlocks the next lessons');
assert(visibleLabels(mpLevel).includes('Test 7-12'), 'The next checkpoint is available with its lesson stage');
assert(!visibleLabels(mpLevel).includes('Lekcja 13'));

mpSources.slice(7, 14).forEach(source => complete(source));
complete(mpSources[9], 'skipped');
assert(!visibleLabels(mpLevel).includes('Lekcja 13'), 'Every task in the second stage is required');
complete(mpSources[9], 'medium');
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
assert(!html.includes('EO_FIRST_CHECKPOINT_SOURCE'), 'Checkpoint gating is no longer tied to one EO test');

console.log('PASS: every course stage unlocks only after its preceding lessons and checkpoint are complete');
