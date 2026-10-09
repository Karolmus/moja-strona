const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('zadania.html', 'utf8');

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing function: ${name}`);
  const end = html.indexOf('\n}', start);
  assert(end >= 0, `Missing function end: ${name}`);
  return html.slice(start, end + 2);
}

const tagContext = vm.createContext({});
vm.runInContext(`
  function formatTagLabel(value){ return String(value || ''); }
  let selectedLevel = 'mp';
  let tagIndex = { levels: { mp: {
    zagle: { label: 'Żagle' },
    cwiczenia: { label: 'Ćwiczenia' },
    zadanie10: { label: 'zadanie 10' },
    arbuz: { label: 'arbuz' },
    zadanie2: { label: 'zadanie 2' },
    cma: { label: 'ćma' }
  } } };
`, tagContext);
vm.runInContext(functionSource('compareTagEntries'), tagContext);
vm.runInContext(functionSource('getTagIndexEntries'), tagContext);

assert.deepEqual(
  Array.from(tagContext.getTagIndexEntries(), entry => entry.label),
  ['arbuz', 'ćma', 'Ćwiczenia', 'zadanie 2', 'zadanie 10', 'Żagle'],
  'Tags use Polish alphabetical and natural-number ordering'
);

const navigationContext = vm.createContext({});
vm.runInContext(`
  const TASK_SOURCES = [
    { path: 'newer-exam' },
    { path: 'older-exam' }
  ];
  function getSourceMeta(source){ return { id: source.path }; }
`, navigationContext);
vm.runInContext(functionSource('sortExamTasksForNavigation'), navigationContext);

const orderedTasks = navigationContext.sortExamTasksForNavigation([
  { sourceId: 'older-exam', file: '1.png' },
  { sourceId: 'older-exam', file: '2.png' },
  { sourceId: 'newer-exam', file: '1.png' },
  { sourceId: 'newer-exam', file: '2.png' }
]);

assert.deepEqual(
  Array.from(orderedTasks, task => `${task.sourceId}:${task.file}`),
  [
    'newer-exam:1.png',
    'newer-exam:2.png',
    'older-exam:1.png',
    'older-exam:2.png'
  ],
  'Navigation follows source order rather than asynchronous load completion order'
);

const modeContext = vm.createContext({});
vm.runInContext(`
  let selectedCategory = 'egzaminy';
  let taskMode = 'random';
  let filtersActive = true;
  function tagFiltersSearchAllSources(){ return filtersActive; }
`, modeContext);
vm.runInContext(functionSource('isRandomMode'), modeContext);

assert.equal(modeContext.isRandomMode(), false, 'Tag filtering always uses ordered navigation');
vm.runInContext('filtersActive = false', modeContext);
assert.equal(modeContext.isRandomMode(), true, 'Random mode remains available without tag filters');

assert.match(
  html,
  /return selectedCategory === "egzaminy"\s*\? sortExamTasksForNavigation\(matchingTasks\)/,
  'The task pool uses the stable exam order'
);
assert.match(
  html,
  /b\.disabled = tagsRequireOrderedMode;/,
  'The random-mode control is disabled while tags are active'
);

const accessContext = vm.createContext({
  isLoggedInStudent: true,
  loggedUser: {role: 'admin'},
  selectedCategory: 'egzaminy',
  selectedTags: new Set(['potegi']),
  tagSearchTerm: '',
  normalizeTag: value => value,
});
for(const name of ['canFilterExamTasksByTags', 'taskMatchesTagFilters', 'tagFiltersSearchAllSources']){
  vm.runInContext(functionSource(name), accessContext);
}
assert(accessContext.canFilterExamTasksByTags(), 'Admin can use exam tags');
assert(accessContext.tagFiltersSearchAllSources(), 'Admin filters include every matching exam');
assert(accessContext.taskMatchesTagFilters({tags: ['potegi']}));
assert(!accessContext.taskMatchesTagFilters({tags: ['procenty']}));
accessContext.tagSearchTerm = 'pierw';
assert(!accessContext.taskMatchesTagFilters({tags: ['potegi']}));
assert(accessContext.taskMatchesTagFilters({tags: ['potegi', 'pierwiastki']}));
accessContext.selectedCategory = 'kurs';
assert(!accessContext.canFilterExamTasksByTags(), 'Course selection remains separate');
assert(accessContext.taskMatchesTagFilters({tags: []}));
accessContext.selectedCategory = 'egzaminy';
accessContext.loggedUser = {role: 'student'};
assert(!accessContext.canFilterExamTasksByTags(), 'Student access stays unchanged');
assert(accessContext.taskMatchesTagFilters({tags: []}));
accessContext.isLoggedInStudent = false;
accessContext.loggedUser = null;
assert(accessContext.canFilterExamTasksByTags(), 'Guest access stays unchanged');
assert.match(functionSource('renderTagSearch'), /const shouldShow = canFilterExamTasksByTags\(\);/);

console.log('PASS: alphabetical tags, stable navigation and admin exam filtering');
