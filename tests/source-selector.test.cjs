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
    setAttribute(name, value) {this[name] = value;},
    classList:{toggle(name, active) {if (active) classes.add(name); else classes.delete(name);}}
  };
}
const list = element(), title = {}, brand = {};
const sources = Array.from({length:12}, (_, index) => ({
  id:`exam-${index}`, year:2026 - Math.floor(index / 3), label:`Lesson ${index}`,
  detail:`${2026 - Math.floor(index / 3)} · ${['maj', 'czerwiec', 'sierpień'][index % 3]}`
}));
const ctx = vm.createContext({
  document:{getElementById:id => ({sourceList:list, sourceTitle:title, courseBrand:brand})[id], createElement:element},
  selectedCategory:'egzaminy', selectedLevel:'matura_podstawowa', selectedSource:'exam-9',
  LEVEL_LABELS:{matura_podstawowa:'Matura podstawowa'},
  updateTrainingLink() {}, updateSourceSummary() {}, setSource:id => {ctx.selectedSource = id;},
  getAvailableSources:() => sources, isTaskSourceLoaded:() => false, isSourceComplete:() => false
});
for (const name of ['getExamSourceTileContent', 'renderSourceSelector', 'addSourceButton']) {
  const start = html.indexOf(`function ${name}(`);
  vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), ctx);
}
const buttons = () => list.children.flatMap(group => group.children[1].children);
ctx.renderSourceSelector();
assert.equal(list.children.length, 4);
assert.equal(buttons().length, 12);
assert(list.classes.has('exam-source-list'));
assert.equal(buttons()[9]['aria-pressed'], 'true');
assert.deepEqual(list.children.map(group => group.children[0].innerText), ['2026', '2025', '2024', '2023']);
for (const group of list.children) {
  assert.equal(group['aria-labelledby'], group.children[0].id);
  assert.deepEqual(group.children[1].children.map(button => button.children[0].innerText), ['maj', 'czerwiec', 'sierpień']);
  assert(group.children[1].children.every(button => button['aria-label'].includes(group.children[0].innerText)));
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
ctx.renderSourceSelector();
assert.equal(list.scrollTop, 0);
assert.equal(list.children.length, 12, 'Course buttons remain flat, without year groups');
assert.equal(list.children[0].children[0].innerText, 'Lesson 0');
assert(list.classes.has('course-source-list'));
assert(!list.classes.has('exam-source-list'));
assert.equal(brand.hidden, false);
assert.equal(title.innerText, 'Wybór lekcji');
sources.length = 0;
ctx.selectedCategory = 'egzaminy';
ctx.renderSourceSelector();
assert.equal(list.children.length, 1);
assert.equal(list.children[0].children[0].innerText, 'Brak arkuszy');

assert(!html.includes('exam-source-list--slider'), 'No horizontal exam carousel remains');
const listStyle = html.match(/\.source-list\.exam-source-list \{([^}]+)\}/)[1];
assert.match(listStyle, /grid-template-columns: minmax\(0, 1fr\);/);
assert.match(listStyle, /overflow-x: hidden;/);
assert.match(listStyle, /overflow-y: auto;/);
assert.match(listStyle, /gap: 8px;/);
assert.match(html, /\.exam-year-label \{[^}]*font-size: 11px;/);
assert.match(html, /\.exam-source-list \.source-btn \{[^}]*min-height: 28px;/);
const tabletStyle = html.split('@media(max-width: 1100px) {')[1];
assert.match(tabletStyle, /\.exam-source-list \.source-btn \{[^}]*min-height: 32px;/);
assert.match(html, /\.exam-year-sources \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
assert.match(html, /\.tile::before,\s*\.tile::after \{[^}]*box-sizing: border-box;/);
console.log('PASS: descending year groups, month buttons, accessible dates, selection, scroll position and unchanged course picker');
