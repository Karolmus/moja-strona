const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('zadania.html', 'utf8');
const levels = ['egzamin_osmoklasisty', 'matura_podstawowa', 'matura_rozszerzona'];
const buttons = levels.map(level => ({dataset:{level}, hidden:false,
  classList:{toggle(){}}, setAttribute(name, value){this[name] = value;}}));
const elements = Object.fromEntries(['guestLevelWrapper', 'reviewButton', 'focusToggle']
  .map(id => [id, {style:{}}]));
let loads = 0, requests = 0;
const ctx = vm.createContext({URLSearchParams, loggedUser:{role:'admin'}, currentTask:null,
  isLoggedInStudent:true, selectedCategory:'kurs', selectedLevel:levels[0],
  selectedSource:'all', selectedCoursePart:'praca_domowa', courseGradingCriteriaLoaded:true,
  LEVEL_LABELS:Object.fromEntries(levels.map(level => [level, level])), FORMULA_SHEETS:{},
  TASK_SOURCES:levels.flatMap((level, index) => [
    {id:`exam-${index}`, category:'egzaminy', level},
    ...(index < 2 ? [{id:`course-${index}`, category:'kurs', level}] : [])
  ]),
  STUDENT_WORK_COURSE_PARTS:['praca_domowa', 'zadania_powtorkowe'],
  getSourceMeta:source => source, getCurrentTaskDurationSeconds:() => 0,
  apiFetch:async () => {requests++; return {authenticated:true, user:ctx.loggedUser};},
  window:{apiFetch:true, location:{search:''}},
  document:{querySelectorAll:() => buttons, getElementById:id => elements[id],
    body:{classList:{toggle(){}}}},
  defaultCoursePart:() => 'praca_domowa',
  loadSelectedSourceAndDraw:async () => {loads++;},
});
for(const name of ['setTimerVisible', 'setPanelSectionVisible', 'updateFormulaSection',
  'renderTagSearch', 'updateAssignedCourseName', 'updateCategoryUrl', 'updateCategoryButtons',
  'updateModeButtons', 'updateMetaTheme', 'resetSession', 'renderSourceSelector',
  'ensureSelectedCoursePart']) ctx[name] = () => {};
for(const name of ['loadAssignedCourse', 'hasSourcesForCategory', 'getAvailableSources',
  'getSourceMetaById', 'ensureSelectedSource', 'updateLevelButtons', 'updateAccessModeUI',
  'setLevel', 'setCategory', 'canAccessCoursePart', 'loadStudentProgress',
  'loadStudentReviewTasks', 'saveProgress', 'markForReview']){
  const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert(start >= 0, name);
  vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), ctx);
}
(async () => {
  await ctx.loadAssignedCourse();
  assert.equal(ctx.selectedLevel, levels[0]);
  ctx.updateAccessModeUI();
  ctx.updateLevelButtons();
  assert.equal(elements.guestLevelWrapper.style.display, 'grid');
  assert(elements.reviewButton.hidden);
  assert(buttons[2].hidden, 'Unpublished MR course is not offered');
  for(const level of levels.slice(0, 2)){
    await ctx.setLevel(null, level);
    assert.equal(ctx.selectedLevel, level);
    assert(ctx.canAccessCoursePart('zadania'));
    assert.equal(buttons[levels.indexOf(level)]['aria-pressed'], 'true');
  }
  await ctx.setCategory(null, 'egzaminy');
  assert(!buttons[2].hidden);
  await ctx.setLevel(null, levels[2]);
  await ctx.setCategory(null, 'kurs');
  assert.equal(ctx.selectedLevel, levels[0], 'Unavailable course falls back to an existing level');
  assert.equal(ctx.selectedSource, 'course-0');
  ctx.TASK_SOURCES.push({id:'course-2', category:'kurs', level:levels[2]});
  ctx.updateLevelButtons();
  assert(!buttons[2].hidden, 'A future MR course is available without editing the admin account');
  await ctx.setLevel(null, levels[2]);
  assert.equal(ctx.selectedSource, 'course-2');
  ctx.savedProgress = [{source_id:'old'}];
  const before = requests;
  await ctx.loadStudentProgress();
  await ctx.loadStudentReviewTasks();
  await ctx.saveProgress('good');
  await ctx.markForReview();
  assert.equal(ctx.savedProgress.length, 0);
  assert.equal(requests, before, 'Admin preview does not read/write student work');
  ctx.loggedUser = {role:'student', level:levels[1]};
  await ctx.loadAssignedCourse();
  ctx.updateAccessModeUI();
  assert.equal(elements.guestLevelWrapper.style.display, 'none');
  assert(!elements.reviewButton.hidden);
  assert(!ctx.canAccessCoursePart('zadania'));
  const previousLoads = loads;
  await ctx.setLevel(null, levels[0]);
  assert.equal(ctx.selectedLevel, levels[1]);
  assert.equal(loads, previousLoads, 'Student remains restricted to their assigned level');
  console.log('PASS: admin level switching, future courses, no student writes and unchanged student restrictions');
})().catch(error => {console.error(error); process.exitCode = 1;});
