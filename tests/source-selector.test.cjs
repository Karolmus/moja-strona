const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
function element() {
  const classes = new Set();
  return {
    children:[], dataset:{}, scrollTop:0, classes,
    set innerHTML(value) {this.children = []; this.scrollTop = 0;},
    appendChild(child) {this.children.push(child);},
    append(...children) {this.children.push(...children);},
    setAttribute(name, value) {this[name] = value;},
    classList:{toggle(name, active) {if (active) classes.add(name); else classes.delete(name);}}
  };
}
const list = element(), title = {}, brand = {};
const sources = Array.from({length:12}, (_, index) => ({
  id:`exam-${index}`, year:2026 - Math.floor(index / 3), label:`Lesson ${index}`,
  category:'egzaminy',
  detail:`${2026 - Math.floor(index / 3)} · ${['maj', 'czerwiec', 'sierpień'][index % 3]}`
}));
const ctx = vm.createContext({
  document:{getElementById:id => ({sourceList:list, sourceTitle:title, courseBrand:brand})[id], createElement:element},
  selectedCategory:'egzaminy', selectedLevel:'matura_podstawowa', selectedSource:'exam-9',
  LEVEL_LABELS:{matura_podstawowa:'Matura podstawowa'},
  updateTrainingLink() {}, updateSourceSummary() {}, setSource:id => {ctx.selectedSource = id;},
  filterExamPickerSources:sources => sources, decorateExamResult() {},
  getAvailableSources:() => sources.filter(source => ctx.sourceDisplayCategory(source) === ctx.selectedCategory),
  getSourcePickerSources:() => ctx.getAvailableSources(), isCourseSourceVisible:() => true,
  isTaskSourceLoaded:() => false, isSourceComplete:() => false
});
for (const name of ['sourceDisplayCategory', 'isCourseCategory', 'getExamSourceTileContent', 'courseTestRange', 'courseTestVariant', 'syncCourseWorkspaceLayout', 'renderSourceSelector', 'addSourceButton']) {
  const start = html.indexOf(`function ${name}(`);
  vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), ctx);
}
const buttons = () => list.children;
ctx.renderSourceSelector();
assert.equal(list.children.length, 12);
assert.equal(buttons().length, 12);
assert(list.classes.has('exam-source-list'));
assert.equal(buttons()[9]['aria-pressed'], 'true');
assert.deepEqual(list.children.slice(0,3).map(button => button.children[0].innerText), ['Maj 2026', 'Czerwiec 2026', 'Sierpień 2026']);
for (const [index, button] of list.children.entries()) {
  assert(button['aria-label'].includes(String(sources[index].year)));
}
buttons()[2].onclick();
assert.equal(ctx.selectedSource, 'exam-2');
list.scrollTop = 320;
ctx.renderSourceSelector();
assert.equal(list.scrollTop, 320, 'Progress updates preserve the list position');
ctx.selectedSource = 'exam-10';
ctx.renderSourceSelector();
assert.equal(list.scrollTop, 320, 'Choosing an exam does not jump to the beginning');
ctx.selectedLevel = 'matura_rozszerzona';
ctx.renderSourceSelector();
assert.equal(list.scrollTop, 0, 'A different level starts at the top');
sources[0].detail += ' · Formuła 2023';
ctx.renderSourceSelector();
assert.equal(buttons()[0].children[1].innerText, 'Formuła 2023');
list.scrollTop = 250;
ctx.selectedCategory = 'kurs';
sources.forEach(source => {source.category = 'kurs';});
ctx.renderSourceSelector();
assert.equal(list.scrollTop, 0);
assert.equal(list.children.length, 12, 'Course buttons remain flat, without year groups');
assert.equal(list.children[0].children[0].innerText, 'Lesson 0');
assert(list.classes.has('course-source-list'));
assert.match(html, /\.course-source-list \.source-btn,\s*\.test-source-list \.source-btn\s*\{[^}]*min-height:\s*41px;/s);
assert.match(html, /\.source-list\.course-source-list\s*\{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/);
assert.match(html, /\.tasks-layout:has\(\.course-source-list\)\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
  'Six lesson columns use the full page width instead of a narrow sidebar');
const mobileStyle = html.slice(html.lastIndexOf('@media(max-width: 760px) {'));
assert.match(mobileStyle, /\.source-list\.course-source-list\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
assert.match(mobileStyle, /\.course-source-list \.source-btn,\s*\.test-source-list \.source-btn\s*\{[^}]*min-height: 38px;/);
assert(!list.classes.has('exam-source-list'));
assert.equal(brand.hidden, false);
assert.equal(title.innerText, 'Wybór lekcji');
sources[0].label = 'Lekcja 1';
sources[0].detail = 'Potęgi i pierwiastki';
ctx.isTaskSourceLoaded = () => true;
ctx.tasks = Array.from({length:29}, () => ({sourceId:sources[0].id, category:'kurs', level:ctx.selectedLevel}));
ctx.renderSourceSelector();
assert.deepEqual(list.children[0].children.map(child => child.innerText),
  ['Lekcja 1', 'Potęgi i pierwiastki']);
assert(!list.children[0].title.includes('zadań'));
sources[1].kind = 'test';
sources[1].id = 'zadania/kurs/eo/test_lekcje_1_6/test_lekcje_1_6.json';
sources[1].unlocksNextSources = 4;
ctx.renderSourceSelector();
assert.equal(list.children.length, 11, 'Tests are not listed among course lessons');
ctx.selectedCategory = 'testy';
ctx.renderSourceSelector();
assert.equal(list.children.length, 1, 'The tests tab contains only tests');
assert.equal(title.innerText, 'Wybór testu');
assert(list.classes.has('test-source-list'));
assert(!list.classes.has('course-source-list') && !list.classes.has('exam-source-list'));
const testButton = list.children[0];
assert.equal(testButton.children[0].innerText, 'Test 1-6 (A)');
assert.equal(ctx.courseTestRange({id:'zadania/kurs/eo/test_lekcje_1_6_b/test_lekcje_1_6_b.json'}), '1-6');
assert.equal(ctx.courseTestVariant({id:'zadania/kurs/eo/test_lekcje_1_6_b/test_lekcje_1_6_b.json'}), 'Test 1-6 (B)');
assert.equal(ctx.courseTestVariant({label:'Test trudniejszy z lekcji 1 - 6'}), 'Test 1-6 (C)');
assert.equal(ctx.courseTestVariant({label:'Test sprawdzający, wersja C.'}), 'Test (C)');
assert.equal(ctx.courseTestVariant({label:'Test sprawdzający, wersja C.', id:'zadania/kurs/eo/test_lekcje_1_6_trudniejszy/test.json'}), 'Test 1-6 (C)');
assert.equal(ctx.courseTestVariant({label:'Test sprawdzający, wersja D.', detail:'Test trudniejszy'}), 'Test (D)');
assert.equal(ctx.courseTestVariant({label:'Test 7-12 (B)'}), 'Test 7-12 (B)');
assert.equal(ctx.courseTestVariant({label:'Test sprawdzający z tematów 13–18, arkusz A.'}), 'Test 13-18 (A)');
assert(testButton.classes.has('test-source'));
assert.deepEqual(testButton.children.map(child => child.innerText), ['Test 1-6 (A)'],
  'Test tiles contain only the name, without unlocking instructions');
assert(!testButton.title.includes('Odblokowuje kolejne lekcje'));
sources[1].optional = true;
ctx.renderSourceSelector();
const optionalButton = list.children[0];
assert.deepEqual(optionalButton.children.map(child => child.innerText), ['Test 1-6 (A)'],
  'Optional tests also show only their name');
assert(!html.includes('source-unlock-note'), 'No extra notice is appended to test names');
sources.push({id:'zadania/kurs/eo/test_lekcje_7_12/test_lekcje_7_12.json', category:'kurs', kind:'test', detail:'', label:'Test 7-12 (A)'});
sources.push({id:'zadania/kurs/eo/test_lekcje_13_18_b/test.json', category:'kurs', kind:'test', detail:'', label:'Test 13-18 (B)'});
ctx.renderSourceSelector();
assert.deepEqual(list.children.map(button => button.children[0].innerText),
  ['Test 1-6 (A)', 'Test 7-12 (A)', 'Test 13-18 (B)'], 'Every range shares one flat list of buttons');
assert(list.children.every(button => button.className === 'source-btn' && typeof button.onclick === 'function'),
  'No range headings or wrapper sections');
list.children[2].onclick();
ctx.renderSourceSelector();
assert.equal(list.children[2]['aria-pressed'], 'true', 'Flat test buttons retain selection');
assert(!html.includes('test-range-group') && !html.includes('test-range-label') && !html.includes('test-range-sources'));
assert.match(html, /\.source-list\.test-source-list \{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);[^}]*gap: 3px;/);
assert.match(html.split('@media(max-width: 1100px) {')[1], /\.source-list\.test-source-list \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
assert.match(mobileStyle, /\.source-list\.test-source-list \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
assert(!html.includes('.test-source-list .source-btn.test-source {'), 'Test variants keep the shared lesson selected/completed states');
sources.length = 0;
ctx.selectedCategory = 'egzaminy';
ctx.renderSourceSelector();
assert.equal(list.children.length, 1);
assert.equal(list.children[0].children[0].innerText, 'Brak arkuszy');

assert(!html.includes('exam-source-list--slider'), 'No horizontal exam carousel remains');
const listStyle = html.match(/\.source-list\.exam-source-list \{([^}]+)\}/)[1];
assert.match(listStyle, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/);
assert.match(listStyle, /overflow-x: hidden;/);
assert.match(listStyle, /overflow-y: auto;/);
assert.match(listStyle, /gap: 6px;/);
assert(!html.includes('exam-year-group'));
assert.match(html, /\.exam-source-list \.source-btn \{[^}]*min-height: 62px;/);
const tabletStyle = html.split('@media(max-width: 1100px) {')[1];
assert.match(tabletStyle, /\.source-list\.exam-source-list \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
assert.match(mobileStyle, /\.source-list\.exam-source-list \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
assert.match(html, /\.tile::before,\s*\.tile::after \{[^}]*box-sizing: border-box;/);
console.log('PASS: flat full-date exam tiles, selection, scrolling and responsive lesson/test pickers');
