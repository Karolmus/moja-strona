const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const sourcePath = 'zadania/kurs/mp/lekcja_2/lekcja_2_logarytmy.json';
const tasks = JSON.parse(fs.readFileSync(sourcePath));
const html = fs.readFileSync('zadania.html', 'utf8');
const profileHtml = fs.readFileSync('profil.html', 'utf8');
const adminHtml = fs.readFileSync('admin.html', 'utf8');
const workParts = ['praca_domowa', 'zadania_powtorkowe'];
const homework = tasks.filter(t => t.coursePart === workParts[0]);
const revision = tasks.filter(t => t.coursePart === workParts[1]);
assert.equal(tasks.length, 33);
assert.equal(homework.length, 12);
assert.equal(revision.length, 3);
assert.equal(new Set(tasks.map(t => t.file)).size, 33);

for (const [part, prefix, key] of [
  ['zadania', '', 'B D A C B C A C D B D C A B B A PF FP'],
  [workParts[0], 'zd', 'B C B A D C A C B D C FP'],
  [workParts[1], 'zp', 'B D C']
]) {
  tasks.filter(t => t.coursePart === part).forEach((task, i) => {
    assert.equal(task.file, `${prefix}${i + 1}.png`);
    assert.equal([task.answer].flat().join(''), key.split(' ')[i]);
    assert.equal(task.level, 'matura_podstawowa');
    assert.equal(task.maxPoints, 1);
    assert(task.tags.length >= 2 && task.hint);
    if (task.type === 'closed') assert.deepEqual(task.options, ['A', 'B', 'C', 'D']);
    else {
      assert.equal(task.type, 'true_false');
      assert.equal(task.statements.length, 2);
      assert.equal(task.answer.length, 2);
    }
    const png = fs.readFileSync(path.join(path.dirname(sourcePath), task.file));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert(png.readUInt32BE(16) >= 1395 && png.readUInt32BE(16) <= 1396);
    assert(png.readUInt32BE(20) > 200 && png.readUInt32BE(20) < 500);
  });
}
assert.match(homework.at(-1).instruction, /dodatnie i różne od 1/);

// Independently evaluate the expressions and all options transcribed from the PDF.
const log = (base, x) => Math.log(x) / Math.log(base);
const root = Math.sqrt;
const a = log(0.5, 8), b = log(2, 8), c = log(2, 0.25), d = log(2, 12);
const cases = [
  ['1.png', log(4, 2) - log(4, 32), [-3, -2, -1, 2]],
  ['2.png', log(root(5), 125), [3, 4, 5, 6]],
  ['3.png', 2 * log(3, 2) - 2 * log(3, 6), [1/9, 1/3, 2/9, 4/9].map(x => log(3, x))],
  ['4.png', 2 * Math.log10(root(10)) + Math.log10(10 ** 4), [3, 4, 5, 6]],
  ['5.png', log(2, 8/3) + log(2, 3/16), [-2, -1, log(2, 11/16), log(2, 1/8)]],
  ['6.png', log(root(3), 9 ** 2), [2, 4, 8, 16]],
  ['7.png', 2 * log(2, 12) - log(2, 9) - (root(5)-root(3))*(root(5)+root(3)), [2, 0, -2, 4]],
  ['8.png', log(4, 64) + log(4, 4), [16, 8, 4, 2]],
  ['9.png', log(root(3), 3*root(3)), [3/2, 2, 5/2, 3]],
  ['10.png', 2*Math.log10(3)+3*Math.log10(2), [2*Math.log10(6), Math.log10(3**2*2**3), Math.log10(2**2)+Math.log10(3**3), 6*Math.log10(6)]],
  ['11.png', log(3, root(243)), [2/3, 2, 3, 5/2]],
  ['12.png', 1, [a>b && b>c, c>b && b>a, b>c && c>a, b>a && a>c].map(Number)],
  ['13.png', log(2, 48), [d+2, d-1, d, d+1]],
  ['14.png', log(3, 1/27)-0.5*log(9, 3)*log(9, 1), [-4, -3, -2, 0]],
  ['15.png', log(2, 32)/log(2, root(32)), [-1/2, 2, -2, 1/2]],
  ['16.png', log(root(5), 5), [2, 4, root(5), 1/2]],
  ['zd1.png', -1/16*log(0.5, 16)*log(0.25, 64), [-3, -3/4, 3/4, 3]],
  ['zd2.png', log(5, 25)+2*log(5, root(5)), [log(5, 5), 2, 3, log(5, 625)]],
  ['zd3.png', log(2, 64)/log(4, 16), [2, 3, 4, 3/2]],
  ['zd4.png', 6*log(9, 3)+2*log(9, 27), [6, 3, 9, 12]],
  ['zd5.png', log(9, 27)+5*log(9, 3), [2, 2+log(9, 3), 1+log(9, 27), 4]],
  ['zd6.png', log(5, 375)-log(5, 3), [log(5, 372), log(3, 375), 3, 2]],
  ['zd7.png', log(2, 72)-2*log(2, 3), [3, 8, log(2, 66), 2*log(2, 36)]],
  ['zd8.png', log(7, Math.cbrt(343)), [1/3, 2/3, 1, 3]],
  ['zd9.png', 2*log(5, 10)-log(5, 4), [4, 2, 2*log(5, 2), log(5, 8)]],
  ['zd10.png', log(27, 3)-log(27, 729), [-2, -4/3, 5/3, -5/3]],
  ['zd11.png', log(Math.cbrt(2), 16), [4, 8, 12, 16]],
  ['zp1.png', (1/8)**4 * 4**9, [2**10, 2**6, 2**8, 2**-6]],
  ['zp2.png', Math.cbrt(7*root(7)), [7**(1/6), 7**(1/4), Math.cbrt(7), root(7)]],
  ['zp3.png', String(8n**6n * 125n**4n).length, [12, 13, 14, 15]]
];
assert.equal(cases.length, tasks.filter(t => t.type === 'closed').length);
for (const [file, value, options] of cases) {
  const matches = options.flatMap((option, i) => Math.abs(option-value) < 1e-9 ? ['ABCD'[i]] : []);
  assert.deepEqual(matches, [tasks.find(t => t.file === file).answer], `${file}: exactly one correct option`);
}
assert(Math.log10(5) < log(2, 5));
// log_6(66) = p/q would imply 6^p = 66^q. Only the RHS has prime factor 11.
assert.equal(6 % 11, 6);
assert.equal(66 % 11, 0);
assert(Math.log10(2)+Math.log10(25) > 1 && Math.log10(2)+Math.log10(25) < 2);
assert(Math.abs(log(11, Math.cbrt(121))-2/3) < 1e-12);
assert.notEqual(log(2, 1)*log(2, 1), log(2, 1+1));
// The second homework statement is the definition of log_b(a), for b > 0, b != 1.
assert.deepEqual(homework.at(-1).answer, ['F', 'P']);

function functionSource(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  const body = text.slice(start, text.indexOf('\n}', start) + 2);
  return text.slice(start-6, start) === 'async ' ? `async ${body}` : body;
}
for (const [text, name] of [[html, 'TASK_SOURCES'], [profileHtml, 'PROFILE_SOURCES'], [adminHtml, 'ADMIN_TASK_SOURCES']]) {
  const expression = text.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`))[1];
  const entries = vm.runInNewContext(expression).filter(s => s.path === sourcePath);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, 'matura_podstawowa');
  assert.equal(entries[0].category, 'kurs');
}

(async () => {
  const source = {id:sourcePath, path:sourcePath, category:'kurs', level:'matura_podstawowa', label:'Lekcja 2'};
  const ctx = vm.createContext({
    STUDENT_WORK_COURSE_PART:workParts[0], STUDENT_WORK_COURSE_PARTS:workParts,
    COURSE_PART_ORDER:{zadania:1, praca_domowa:2, zadania_powtorkowe:3},
    getSourceMeta:() => source, loadJsonSource:async () => tasks,
    normalizeTaskSolutions:() => [], normalizeTaskGradingCriteria:() => [],
    normalizeCourseTextGradingCriteria:() => [], normalizeTaskTags:t => t.tags,
    selectedCategory:'kurs', selectedLevel:'matura_podstawowa', selectedSource:sourcePath,
    selectedCoursePart:workParts[0], isLoggedInStudent:true,
    taskMatchesTagFilters:() => true, tagFiltersSearchAllSources:() => false,
    resetSession() {}, renderTagSearch() {}, drawTask(i) {ctx.drawnIndex = i;}
  });
  for (const name of ['loadTaskSource', 'getSourceCompletionTasks', 'getCoursePartTasks', 'getCourseNavigatorItems',
    'pool', 'selectCoursePartTask', 'isCoursePreviewMode', 'ensureSelectedCoursePart', 'coursePartOrdinalNumber',
    'coursePartDisplayTitle', 'taskThemeClass']) vm.runInContext(functionSource(html, name), ctx);
  ctx.tasks = await ctx.loadTaskSource(source);
  assert.equal(ctx.tasks.length, 15);
  assert.equal(ctx.pool().length, 15);
  assert.equal(ctx.getSourceCompletionTasks(source).length, 15);
  assert.equal(ctx.getCoursePartTasks('zadania').length, 0);
  assert.deepEqual(Array.from(ctx.getCourseNavigatorItems(), t => t.file), [...homework, ...revision].map(t => t.file));
  ctx.selectCoursePartTask(workParts[1]);
  assert.equal(ctx.drawnIndex, 12);
  ctx.ensureSelectedCoursePart();
  assert.equal(ctx.selectedCoursePart, workParts[1]);
  ctx.selectCoursePartTask(workParts[1], 'zp3.png');
  assert.equal(ctx.drawnIndex, 14);
  for (const [i, task] of ctx.tasks.filter(t => t.coursePart === workParts[1]).entries()) {
    assert(!ctx.isCoursePreviewMode(task));
    assert.equal(ctx.coursePartOrdinalNumber(task), String(i+1));
    assert.equal(ctx.coursePartDisplayTitle(task), `Lekcja 2 - zadanie powtórkowe ${i+1}`);
    assert.equal(ctx.taskThemeClass(task), 'nav-theme-revision');
  }
  assert.equal(ctx.taskThemeClass({coursePart:'zadania_praktyczne'}), 'nav-theme-practical');
  assert.equal(ctx.taskThemeClass({coursePart:'praca_domowa'}), 'nav-theme-homework');
  assert.match(html, /--revision-color: #ecd0b2;/);
  assert(ctx.isCoursePreviewMode({...tasks[0], category:'kurs'}));

  const catalog = {...source, tasks, filesByPart:new Map(['zadania', ...workParts].map(part =>
    [part, new Set(tasks.filter(t => t.coursePart === part).map(t => t.file))]))};
  const profile = vm.createContext({sourceCatalog:[catalog]});
  for (const name of ['progressSourceId', 'progressFile', 'progressKey', 'sourceCompletionFiles', 'courseCompletion', 'calculateProgress']) {
    vm.runInContext(functionSource(profileHtml, name), profile);
  }
  const progress = [...homework, ...revision].map(t => ({source_id:sourcePath, file:t.file, result:'good'}));
  assert(!profile.courseCompletion(progress.slice(0, 12)).complete, 'Homework alone does not complete the review part');
  assert(!profile.courseCompletion(progress.slice(0, 14)).complete);
  assert(profile.courseCompletion(progress).complete);
  assert.equal(profile.sourceCompletionFiles(catalog).size, 15);
  assert.equal(profile.calculateProgress(progress.slice(0, 12), 'kurs', workParts[0]).percent, 100);
  assert.equal(profile.calculateProgress(progress.slice(0, 12), 'kurs', workParts[1]).percent, 0);
  assert.equal(profile.calculateProgress(progress, 'kurs', workParts[1]).percent, 100);
  const admin = vm.createContext({adminTaskCatalog:tasks.map(t => ({...t, category:'kurs', sourceId:sourcePath}))});
  vm.runInContext(functionSource(adminHtml, 'getCatalogSources'), admin);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {courseParts:workParts})[0].totalTasks, 15);
  assert.equal(admin.getCatalogSources('kurs', 'matura_podstawowa', {coursePart:workParts[1]})[0].totalTasks, 3);
  assert.equal(admin.getCatalogSources('kurs', 'egzamin_osmoklasisty', {courseParts:workParts}).length, 0);
  console.log('PASS: lesson 2, 33 audited tasks, 12 homework + 3 review tasks, review navigation, profile/admin completion');
})().catch(error => {console.error(error); process.exitCode = 1;});
