const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');

const html = fs.readFileSync('zadania.html', 'utf8');
const start = html.indexOf('function setupMCQ(');
const source = html.slice(start, html.indexOf('\n}', start) + 2);

function element() {
  const node = {children: [], dataset: {}, classes: new Set(), properties: new Map()};
  Object.defineProperty(node, 'className', {
    get: () => [...node.classes].join(' '),
    set: value => {node.classes = new Set(value.split(/\s+/).filter(Boolean));}
  });
  Object.defineProperty(node, 'innerHTML', {
    set: () => {node.children = [];}
  });
  node.classList = {
    add: (...names) => names.forEach(name => node.classes.add(name)),
    remove: (...names) => names.forEach(name => node.classes.delete(name))
  };
  node.style = {
    setProperty: (name, value) => node.properties.set(name, value),
    removeProperty: name => node.properties.delete(name)
  };
  node.appendChild = child => node.children.push(child);
  return node;
}

function setup() {
  const mcq = element();
  const results = element();
  const clicks = [];
  const special = [];
  const context = vm.createContext({
    document: {
      getElementById: id => id === 'mcq' ? mcq : results,
      createElement: element
    },
    currentTask: {},
    setResultButtonsEnabled() {},
    isCoursePreviewMode: () => context.preview,
    isClosedTask: task => task.type === 'closed',
    isTrueFalseSequenceTask: task => task.special === 'true-false',
    isGroupedChoiceTask: task => task.special === 'grouped-choice',
    isGroupedMultiTask: task => task.special === 'grouped-multi',
    isProofTask: task => task.type === 'proof',
    isPracticalTask: task => task.type === 'practical',
    isInputTask: task => task.type === 'input',
    getOptions: task => task.options,
    formatOption: option => option,
    choose: (value, button) => clicks.push([value, button]),
    setupTrueFalseTask: () => special.push('true-false'),
    setupGroupedChoiceTask: () => special.push('grouped-choice'),
    setupGroupedMultiTask: () => special.push('grouped-multi'),
    setupPracticalTask: () => special.push('practical'),
    setupInputTask: () => special.push('input')
  });
  vm.runInContext(source, context);
  const draw = task => {
    context.currentTask = task;
    context.setupMCQ();
  };
  return {mcq, context, clicks, special, draw};
}

test('five, six and more options use their actual count and keep every button clickable', () => {
  const {mcq, draw, clicks} = setup();
  for(const count of [5, 6, 7, 8]) {
    const options = 'ABCDEFGH'.slice(0, count).split('');
    draw({type: 'closed', options});
    assert(mcq.classes.has('many-options'));
    assert.equal(mcq.properties.get('--mcq-option-count'), String(count));
    assert.deepEqual(mcq.children.map(button => button.innerText), options);
    for(const button of mcq.children) {
      button.onclick();
      assert.deepEqual(clicks.at(-1), [button.dataset.value, button]);
    }
  }
});

test('switching to a smaller set or another task clears the previous column count', () => {
  const {mcq, draw, special, context} = setup();
  const many = {type: 'closed', options: ['A', 'B', 'C', 'D', 'E']};
  for(const task of [
    {type: 'closed', options: ['A', 'B', 'C', 'D']},
    {type: 'closed', options: ['P', 'F']},
    {type: 'closed', special: 'true-false'},
    {type: 'closed', special: 'grouped-choice'},
    {type: 'closed', special: 'grouped-multi'},
    {type: 'input'}, {type: 'practical'}, {type: 'proof'}
  ]) {
    draw(many);
    draw(task);
    assert(!mcq.classes.has('many-options'));
    assert(!mcq.properties.has('--mcq-option-count'));
  }
  assert.deepEqual(special, ['true-false', 'grouped-choice', 'grouped-multi', 'input', 'practical']);
  draw(many);
  context.preview = true;
  draw(many);
  assert(!mcq.classes.has('active'));
  assert(!mcq.properties.has('--mcq-option-count'));
  assert.equal(mcq.children.length, 0);
});

test('desktop and mobile CSS both use equal dynamic columns, without a fixed six-option exception', () => {
  const styles = [...html.matchAll(/\.mcq\.many-options \{([^}]+)\}/g)];
  assert.equal(styles.length, 2);
  for(const [, style] of styles) {
    assert.match(style, /grid-template-columns: repeat\(var\(--mcq-option-count, 4\), minmax\(0, 1fr\)\);/);
  }
  assert.match(html, /\.mcq\.many-options \.choice-btn \{[^}]*min-width: 0;/);
  assert(!html.includes('six-options'));
});
