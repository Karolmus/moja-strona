const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('zadania.html', 'utf8');
const checkpointPath = 'zadania/kurs/eo/test_lekcje_1_6/test_lekcje_1_6.json';

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}

const sources = [];
for (let lesson = 1; lesson <= 7; lesson++) {
  sources.push({
    path: `zadania/kurs/eo/lekcja_${lesson}/lekcja_${lesson}.json`,
    category: 'kurs',
    level: 'egzamin_osmoklasisty',
    label: `Lekcja ${lesson}`
  });
}
sources.splice(6, 0, {
  path: checkpointPath,
  category: 'kurs',
  level: 'egzamin_osmoklasisty',
  label: 'Powtórka 1-6',
  kind: 'test'
});

const tasks = sources.slice(0, 7).map(source => ({
  sourceId: source.path,
  file: 'zd1.png',
  coursePart: 'praca_domowa'
}));
const progress = new Map();
const ctx = vm.createContext({
  TASK_SOURCES: sources,
  EO_FIRST_CHECKPOINT_SOURCE: checkpointPath,
  COURSE_COMPLETION_RESULTS: new Set(['good', 'medium', 'bad', 'video']),
  selectedCategory: 'kurs',
  selectedLevel: 'egzamin_osmoklasisty',
  isLoggedInStudent: true,
  loggedUser: {role: 'student'},
  getSourceMeta: source => ({...source, id: source.path}),
  isTaskSourceLoaded: sourceId => tasks.some(task => task.sourceId === sourceId),
  getSourceCompletionTasks: source => tasks.filter(task => task.sourceId === source.id),
  getSavedProgressItem: task => progress.get(`${task.sourceId}:${task.file}`) || null
});

for (const name of [
  'eoCourseLessonNumber',
  'isEoFirstCheckpointSource',
  'isEoInitialCourseSource',
  'eoFirstCheckpointComplete',
  'isCourseSourceVisible',
  'getAvailableSources'
]) {
  vm.runInContext(functionSource(name), ctx);
}

const visibleLabels = () => ctx.getAvailableSources().map(source => source.label);

assert.deepEqual(visibleLabels(), [
  'Lekcja 1', 'Lekcja 2', 'Lekcja 3', 'Lekcja 4', 'Lekcja 5', 'Lekcja 6', 'Powtórka 1-6'
]);
assert.equal(ctx.eoFirstCheckpointComplete(), false);

tasks.forEach(task => progress.set(`${task.sourceId}:${task.file}`, {result: 'good'}));
progress.set(`${tasks[2].sourceId}:${tasks[2].file}`, {result: 'skipped'});
assert.equal(ctx.eoFirstCheckpointComplete(), false, 'Skipping one task keeps later lessons locked');
assert(!visibleLabels().includes('Lekcja 7'));

progress.set(`${tasks[2].sourceId}:${tasks[2].file}`, {result: 'bad'});
assert.equal(ctx.eoFirstCheckpointComplete(), true, 'A completed incorrect answer counts as work done');
assert(visibleLabels().includes('Lekcja 7'));

progress.clear();
ctx.loggedUser = {role: 'admin'};
assert(visibleLabels().includes('Lekcja 7'), 'The administrator keeps access to the full course');

assert.match(html, /getSavedProgressItem\(task\)\?\.result/,
  'Unlocking depends on progress confirmed by the server, not unsaved session state');
assert.match(html, /await preloadUnlockedEoCourseSources\(\);/,
  'A returning student gets counts for newly unlocked lessons during startup');

console.log('PASS: EO lessons 7+ stay hidden until lessons 1-6 and the checkpoint are complete');
