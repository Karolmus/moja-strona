const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const html = fs.readFileSync('admin.html', 'utf8');

class Element {
  constructor() {this.children = []; this.attributes = {}; this.listeners = {};}
  append(...children) {this.children.push(...children);}
  appendChild(child) {this.children.push(child);}
  setAttribute(name, value) {this.attributes[name] = value;}
  addEventListener(name, fn) {this.listeners[name] = fn;}
  click() {this.listeners.click({stopPropagation() {}});}
}

function setup() {
  const context = vm.createContext({
    document: {createElement: () => new Element()},
    taskPreviewSequence: 0,
    DeltaSigmaCourseVideos: require('../static/course-videos.js'),
    apiFetch() {throw new Error('Admin preview must not change student progress');}
  });
  for (const name of ['expectedCourseAnswer', 'taskPreviewVideoUrl', 'appendTaskPreviewVideo', 'taskPreviewAnswer', 'appendTaskPreviewTools']) {
    const start = html.indexOf(`function ${name}(`);
    assert(start >= 0);
    vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), context);
  }
  return context;
}

test('hint and answer share an accessible local toggle next to the video', () => {
  const context = setup();
  const preview = new Element();
  context.appendTaskPreviewTools({category:'kurs', level:'matura_podstawowa',
    sourceId:'zadania/kurs/mp/lekcja_1/lekcja_1_potegi_i_pierwiastki.json', file:'zd1.png',
    hint:'Wyłącz wspólny czynnik.', answer:'B'}, preview);
  const [actions, content] = preview.children;
  const [video, hint, answer] = actions.children;
  assert.equal(video.textContent, 'Wyświetl nagranie');
  assert.equal(hint.textContent, 'Wskazówka');
  assert.equal(answer.textContent, 'Odpowiedź');
  assert(content.hidden);
  hint.click();
  assert(!content.hidden);
  assert.equal(content.textContent, 'Wyłącz wspólny czynnik.');
  assert.equal(hint.attributes['aria-expanded'], 'true');
  answer.click();
  assert.equal(content.textContent, 'B');
  assert.equal(hint.attributes['aria-expanded'], 'false');
  assert.equal(answer.attributes['aria-expanded'], 'true');
  assert.equal(answer.attributes['aria-controls'], content.id);
  answer.click();
  assert(content.hidden);
});

test('answers retain input labels, true/false and multiple choices; missing proof keys are explicit', () => {
  const context = setup();
  assert.equal(context.taskPreviewAnswer({type:'input', inputs:[{label:'x', answers:['3/4']},{label:'y', answer:'2'}]}), 'x: 3/4\ny: 2');
  assert.equal(context.taskPreviewAnswer({type:'true_false', answer:'PF'}), 'P, F');
  assert.equal(context.taskPreviewAnswer({type:'multi', answer:['A','C']}), 'A, C');
  assert.equal(context.taskPreviewAnswer({type:'input', acceptedAnswers:['0','0,0']}), 'Odpowiedź: 0');
  assert.match(context.taskPreviewAnswer({teacherGraded:true}), /oceny nauczyciela/);
  assert.match(context.taskPreviewAnswer({}), /Nie zapisano odpowiedzi/);
});

test('previews without films still show safe text and use independent content IDs', () => {
  const context = setup();
  const previews = [new Element(), new Element()];
  for (const preview of previews) context.appendTaskPreviewTools({hint:'<img src=x onerror=alert(1)>', answer:'D'}, preview);
  assert.notEqual(previews[0].children[1].id, previews[1].children[1].id);
  assert.equal(previews[0].children[0].children.length, 2);
  previews[0].children[0].children[0].click();
  assert.equal(previews[0].children[1].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(previews[0].children[1].children.length, 0);
  assert(previews[1].children[1].hidden);
  const start = html.indexOf('async function loadTaskImagePreview(');
  const source = html.slice(start, html.indexOf('\n}', start) + 2);
  assert.equal((source.match(/appendTaskPreviewTools\(task, container\)/g) || []).length, 2);
});
