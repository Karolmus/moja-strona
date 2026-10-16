const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('zadania.html', 'utf8');

function setup() {
  const level = 'egzamin_osmoklasisty';
  const sources = [
    {id:'lesson-1', category:'kurs', level},
    {id:'test-A', category:'kurs', kind:'test', level},
    {id:'test-B', category:'kurs', kind:'test', optional:true, level},
    {id:'exam-1', category:'egzaminy', level},
    {id:'mp-test', category:'kurs', kind:'test', level:'matura_podstawowa'}
  ];
  const tasks = sources.map(source => ({sourceId:source.id, category:source.category, level:source.level,
    coursePart:'praca_domowa', file:'1.webp', sourceKind:source.kind}));
  const badge = {hidden:true, setAttribute(name,value){this[name] = value;}};
  const buttons = ['kurs','testy','egzaminy'].map(category => ({dataset:{category},
    classList:{toggle(name,on){this[name] = on;}}, setAttribute(name,value){this[name] = value;}}));
  const context = vm.createContext({
    TASK_SOURCES:sources, tasks, selectedLevel:level, selectedCategory:'kurs', selectedSource:'all',
    selectedCoursePart:'praca_domowa', loggedUser:{role:'student',level}, isLoggedInStudent:true,
    getSourceMeta:source => source, isCourseSourceVisible:() => true,
    STUDENT_WORK_COURSE_PARTS:['praca_domowa','zadania_powtorkowe'],
    COURSE_PART_ORDER:{praca_domowa:2},
    getSavedResult:() => '', taskMatchesTagFilters:() => true, tagFiltersSearchAllSources:() => false,
    defaultCoursePart:() => 'praca_domowa', savedProgress:[],
    document:{getElementById:() => badge, querySelectorAll:() => buttons,
      body:{classList:{toggle(name,on){this[name] = on;}}}},
    window:{location:{search:'?category=testy'}}, URLSearchParams,
    updateCategoryUrl:category => {context.urlCategory = category;},
    updateModeButtons(){}, updateLevelButtons(){}, updateMetaTheme(){}, updateFormulaSection(){},
    resetSession(){}, renderSourceSelector(){},
    loadSelectedSourceAndDraw:async () => {context.drawnSource = context.selectedSource;},
    ensureTestSourceStarted:async () => {context.startRequests++; return context.startConfirmed;},
    startRequests:0, startConfirmed:false,
  });
  for (const name of ['sourceDisplayCategory','isCourseCategory','getSourceMetaById','getAvailableSources','getSourcePickerSources',
    'hasSourcesForCategory','ensureSelectedSource','canAccessCoursePart','ensureSelectedCoursePart',
    'pool','getSourceCompletionTasks','sourceSummaryTasks','getCourseNavigatorItems','taskNavigatorItems',
    'shouldShowTaskNavigator','getRequestedCategory','getProgressSourceId','getProgressFile',
    'findLastProgressItem','updateCategoryButtons','setCategory','setSource']) {
    const match = new RegExp(`(?:async )?function ${name}\\(`).exec(html);
    assert(match, name);
    vm.runInContext(html.slice(match.index, html.indexOf('\n}', match.index) + 2), context);
  }
  return {context, sources, tasks, badge, buttons};
}

test('course lessons and tests have separate tabs while retaining stored course identities', () => {
  const {context:c, sources} = setup();
  const available = () => Array.from(c.getAvailableSources(), source => source.id);
  assert.deepEqual(available(), ['lesson-1']);
  c.selectedCategory = 'testy';
  assert.deepEqual(available(), ['test-A','test-B']);
  assert.deepEqual(Array.from(c.getSourcePickerSources(), source => source.id), ['test-A','test-B'],
    'All optional tests are selectable without score restrictions');
  c.loggedUser = {role:'admin'};
  c.isCourseSourceVisible = () => true;
  assert.deepEqual(available(), ['test-A','test-B']);
  assert.equal(c.hasSourcesForCategory('testy','matura_podstawowa'), true);
  assert.equal(c.hasSourcesForCategory('testy','matura_rozszerzona'), false);
  assert.equal(c.getRequestedCategory(), 'testy');
  c.ensureSelectedSource();
  assert.equal(c.selectedSource, 'all', 'Opening the tests tab does not select or start a test');
  assert.equal(c.pool().length, 0, 'Loaded test questions remain unavailable before choosing a test');
  c.selectedSource = 'test-A';
  assert.deepEqual(Array.from(c.pool(), task => task.sourceId), ['test-A']);
  assert.equal(c.taskNavigatorItems().length, 1);
  assert(c.shouldShowTaskNavigator());
  assert.equal(c.sourceSummaryTasks().length, 1);
  const checkpoint = sources[1];
  assert.equal(checkpoint.category, 'kurs', 'Existing server permissions, saved results and unlocking stay unchanged');
  assert.equal(c.getSourceCompletionTasks(checkpoint).length, 1);
});

test('tab navigation never starts the clock; choosing a test still requires confirmation', async () => {
  const {context:c} = setup();
  await c.setCategory(null, 'testy');
  assert.equal(c.selectedSource, 'all');
  assert.equal(c.drawnSource, 'all');
  assert.equal(c.startRequests, 0);
  await c.setSource('test-B');
  assert.equal(c.selectedSource, 'all', 'Cancelling B keeps the selection visible');
  assert.equal(c.startRequests, 1, 'Optional tests also require explicit confirmation');
  await c.setSource('test-A');
  assert.equal(c.selectedSource, 'all', 'Cancellation leaves the test selection visible');
  assert.equal(c.startRequests, 2);
  c.startConfirmed = true;
  await c.setSource('test-A');
  assert.equal(c.selectedSource, 'test-A');
  assert.equal(c.selectedCategory, 'testy');
  assert.equal(c.urlCategory, 'testy');
  await c.setCategory(null, 'kurs');
  assert.equal(c.selectedSource, 'lesson-1');
  assert.equal(c.selectedCategory, 'kurs');
  assert.equal(c.startRequests, 3);
});

test('course and test resume are independent without a due badge', () => {
  const {context:c, badge, buttons} = setup();
  c.savedProgress = [
    {source_id:'test-A', file:'1.webp', category:'kurs'},
    {source_id:'lesson-1', file:'1.webp', category:'kurs'}
  ];
  assert.equal(c.findLastProgressItem('kurs').source_id, 'lesson-1');
  assert.equal(c.findLastProgressItem('testy').source_id, 'test-A');
  c.selectedCategory = 'testy';
  c.updateCategoryButtons();
  assert.equal(buttons[1]['aria-pressed'], 'true');
  assert.equal(buttons[0]['aria-pressed'], 'false');
  assert(c.document.body.classList['course-view'], 'Tests retain the compact mobile task layout');
  assert(!html.includes('testCategoryBadge'));
  assert(!html.includes('course-test-group'), 'No duplicate tests section remains within the course picker');
  assert.match(html, /data-category="testy"/);
  assert.match(html, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});
