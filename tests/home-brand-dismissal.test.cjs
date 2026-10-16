const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('function scheduleBrandCardDismissal(){');
const source = html.slice(start, html.indexOf('\n}', start) + 2);

function setup({hover = false, focused = false, reduced = false, missing = false} = {}) {
  const timers = [];
  const listeners = new Map();
  const classes = new Set();
  const card = {
    hidden: false, inert: false, hover, focused,
    closest: () => ({classList: {add: name => classes.add(name)}}),
    matches: () => card.hover || card.focused,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name)
  };
  const c = vm.createContext({
    document: {querySelector: () => missing ? null : card},
    window: {setTimeout: (callback, delay) => timers.push({callback, delay}), matchMedia: () => ({matches: reduced})}
  });
  vm.runInContext(source, c);
  c.scheduleBrandCardDismissal();
  return {card, classes, listeners, timers};
}

test('brand card starts its exit after five seconds and frees its banner space after animation', () => {
  const {card, classes, listeners, timers} = setup();
  assert.equal(timers[0].delay, 5000);
  assert(!card.hidden && !card.inert);
  timers[0].callback();
  assert(classes.has('is-brand-dismissed'));
  assert(card.inert && !card.hidden);
  assert.equal(listeners.size, 0);
  assert.equal(timers[1].delay, 650);
  timers[1].callback();
  assert(card.hidden);
  assert.match(html, /\.home-hero-row\.is-brand-dismissed\{[^}]*minmax\(0,0px\);[^}]*gap:0;/);
  assert.match(html, /\.delta-brand-card\[hidden\]\{\s*display:none;/);
});

test('exit waits until hover or keyboard interaction has ended', () => {
  for (const flag of ['hover', 'focused']) {
    const {card, classes, listeners, timers} = setup({[flag]: true});
    timers[0].callback();
    assert.equal(timers.length, 1);
    assert(!card.inert && !classes.has('is-brand-dismissed'));
    listeners.get(flag === 'hover' ? 'pointerleave' : 'focusout')();
    assert(!card.inert);
    card[flag] = false;
    listeners.get(flag === 'hover' ? 'pointerleave' : 'focusout')();
    assert(card.inert && classes.has('is-brand-dismissed'));
    assert.equal(listeners.size, 0);
  }
});

test('reduced motion skips animation and missing cards do not schedule work', () => {
  const {card, timers} = setup({reduced: true});
  timers[0].callback();
  assert.equal(timers[1].delay, 0);
  timers[1].callback();
  assert(card.hidden);
  assert.equal(setup({missing: true}).timers.length, 0);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{\s*\.home-hero-row\{transition:none;\}\s*\.is-brand-dismissed \.delta-brand-card\{animation:none;\}/);
  assert.match(html, /window\.addEventListener\("load", scheduleBrandCardDismissal, \{ once: true \}\)/);
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (script[1].includes('application/ld+json')) JSON.parse(script[2]);
    else new vm.Script(script[2]);
  }
});
