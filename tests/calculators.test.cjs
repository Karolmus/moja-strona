const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const page = fs.readFileSync('kalkulatory.html', 'utf8');
const script = fs.readFileSync('static/script.js', 'utf8');
const guard = fs.readFileSync('static/calculator-page.js', 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function calculatorFixture() {
  const nodes = {};
  const button = {disabled:false};
  const node = id => nodes[id] ||= {value:'', dataset:{}, attrs:{}, innerHTML:'', textContent:'',
    setAttribute(name, value) {this.attrs[name] = value;}, removeAttribute(name) {delete this.attrs[name];},
    focus() {this.focused = true;}, closest:() => ({querySelector:() => button}), querySelectorAll:() => []};
  const calls = [];
  const root = {calculatorsAuthenticated:true, getAuthToken:() => 'token', apiFetch:async (path, options) => {
    calls.push({path, data:JSON.parse(options.body)});
    return {sol:['-1','1'], general:'x^2-1', factored:'(x-1)(x+1)', result:45, rounded:'0.50'};
  }, requireCalculatorLogin() {this.redirected = true;}, clearAuthToken() {this.cleared = true;}};
  const ctx = vm.createContext({window:root, document:{getElementById:node}});
  vm.runInContext(script, ctx);
  return {ctx, root, node, button, calls};
}

function guardFixture(token = 'valid', session = async () => ({authenticated:true,user:{role:'student'}})) {
  const nodes = Object.fromEntries(['calculatorWorkspace','calculatorAccess','calculatorAccessMessage','calculatorAccessRetry','nav']
    .map(id => [id,{hidden:id === 'calculatorWorkspace', textContent:'', addEventListener(name, action) {this[name] = action;}}]));
  const root = {getAuthToken:() => token, apiFetch:session, location:{replace(path) {this.redirect = path;}},
    updateAuthNav(user) {this.navUser = user;}, clearAuthToken() {token = null;},
    addEventListener(name, action) {this[name] = action;}};
  vm.runInNewContext(guard, {window:root, document:{getElementById:id => nodes[id]}, renderMath() {}, console,
    fetch:async () => ({ok:true,text:async () => '<nav></nav>'})});
  return {root, nodes};
}

test('calculators stay hidden until an authenticated session is confirmed; guests return through login', async () => {
  const guest = guardFixture(null); await tick();
  assert.equal(guest.nodes.calculatorWorkspace.hidden, true);
  assert.equal(guest.root.location.redirect, 'login.html?next=kalkulatory.html');
  let finish;
  const member = guardFixture('valid', () => new Promise(resolve => {finish = resolve;}));
  assert.equal(member.nodes.calculatorWorkspace.hidden, true);
  finish({authenticated:true,user:{role:'student'}}); await tick();
  assert.equal(member.nodes.calculatorWorkspace.hidden, false);
  assert.equal(member.root.calculatorsAuthenticated, true);
});

test('expired sessions redirect, network failures remain closed with retry and never erase the token', async () => {
  const expired = guardFixture('old', async () => {throw {status:401};}); await tick();
  assert.equal(expired.root.location.redirect, 'login.html?next=kalkulatory.html');
  assert.equal(expired.root.getAuthToken(), null);
  const offline = guardFixture('good', async () => {throw {status:503};}); await tick();
  assert.equal(offline.nodes.calculatorWorkspace.hidden, true);
  assert.equal(offline.nodes.calculatorAccessRetry.hidden, false);
  assert.equal(offline.root.getAuthToken(), 'good');
  assert.equal(offline.root.location.redirect, undefined);
  offline.root.apiFetch = async () => ({authenticated:true,user:{role:'admin'}});
  await offline.nodes.calculatorAccessRetry.click();
  assert.equal(offline.nodes.calculatorWorkspace.hidden, false);
});

test('logout in another tab hides calculator content again', async () => {
  const f = guardFixture(); await tick();
  assert.equal(f.nodes.calculatorWorkspace.hidden, false);
  f.root.clearAuthToken(); f.root.storage({key:'deltaSigmaAuthToken'}); await tick();
  assert.equal(f.nodes.calculatorWorkspace.hidden, true);
  assert.equal(f.root.calculatorsAuthenticated, false);
});

test('all calculator requests use the shared authenticated API and expired requests close the page', async () => {
  const f = calculatorFixture();
  await f.ctx.post('/api/poly', {coeffs:[1,0,-1]});
  assert.equal(f.calls[0].path, '/api/poly');
  f.root.apiFetch = async () => {throw {status:401};};
  await assert.rejects(f.ctx.post('/api/angle', {a1:0,a2:1}));
  assert(f.root.cleared && f.root.redirected);
  f.root.calculatorsAuthenticated = false;
  await assert.rejects(f.ctx.post('/api/poly', {}));
});

test('decimal commas, fractions, negative numbers and lists work without silently dropping invalid values', () => {
  const f = calculatorFixture();
  for (const [input, value] of [['1,5',1.5],['-2.5',-2.5],['1/2',0.5],['-3/4',-0.75],['1e-3',0.001]]) {
    assert.equal(f.ctx.parseUserNumber(input), value);
  }
  for (const input of ['', 'Infinity', '1/0', 'abc', '1;2', '0x10']) assert.throws(() => f.ctx.parseUserNumber(input));
  for (const input of ['1; 0; -1', '1,0,-1', '1 0 -1']) {
    f.node('coeffs').value = input;
    assert.deepEqual(Array.from(f.ctx.readNumberList('coeffs')), [1,0,-1]);
  }
  f.node('coeffs').value = '1; abc; -1';
  assert.throws(() => f.ctx.readNumberList('coeffs'));
});

test('results have loading and error states, prevent double submits and render local safe LaTeX', async () => {
  const f = calculatorFixture(); f.node('coeffs').value = '1;0;-1';
  let finish;
  f.root.apiFetch = () => new Promise(resolve => {finish = resolve;});
  const running = f.ctx.calcPoly();
  assert(f.button.disabled);
  await f.ctx.calcPoly();
  finish({sol:['-1','1'],general:'x^2-1',factored:'(x-1)(x+1)'}); await running;
  assert.equal(f.button.disabled, false);
  assert.equal(f.node('res2').dataset.state, 'ready');
  assert(f.node('res2').innerHTML.includes('data-tex="f(x)=x^2-1"'));
  f.node('coeffs').value = 'bad'; await f.ctx.calcPoly();
  assert.equal(f.node('res2').dataset.state, 'error');
  assert.equal(f.button.disabled, false);
  assert(!f.ctx.formula('<script>"x"</script>').includes('<script>'));
  assert(!script.includes('MathJax') && !script.includes('cdn.jsdelivr.net'));
  assert.match(script, /trust: false/);
});

test('field variables render as mathematical objects with genuine subscripts and label associations', () => {
  const katex = require('../static/lib/katex/katex.min.js');
  const labels = new Map(Array.from(page.matchAll(/<label for="([^"]+)">([\s\S]*?)<\/label>/g),
    match => [match[1], match[2]]));
  const symbols = {
    p: 'p', n: 'n', k: 'K', xa: 'x_A', ya: 'y_A', xs: 'x_S', ys: 'y_S', r: 'r',
    A: 'A', B: 'B', C: 'C', p1: 'p', q1: 'q', r1: 'r',
    a: 'x_1', b: 'y_1', c: 'r_1', p2: 'x_2', q2: 'y_2', r2: 'r_2', a1: 'a_1', a2: 'a_2',
  };
  for (const [id, tex] of Object.entries(symbols)) {
    const label = labels.get(id);
    assert(label, id);
    assert(label.includes(`class="field-symbol" data-tex="${tex}"`), id);
    assert(page.includes(`<input id="${id}"`), `The label must still focus ${id}`);
    const rendered = katex.renderToString(tex, {output: 'htmlAndMathml', throwOnError: true, trust: false, strict: 'error'});
    assert.match(rendered, /<math\b/, id);
    if (tex.includes('_')) {
      assert.match(label, /<sub>[AS12]<\/sub>/, 'Keep real subscripts even before math rendering');
      assert.match(rendered, /<msub>/, id);
      assert(!label.replace(/<[^>]+>/g, '').includes('_'), `No literal underscore should be visible in ${id}`);
    }
  }
});

test('each calculator has one short description of its calculation', () => {
  const cards = Array.from(page.matchAll(/<section class="calculator-card(?: wide)?">([\s\S]*?)<\/section>/g), match => match[1]);
  assert.equal(cards.length, 6);
  for (const card of cards) {
    const descriptions = Array.from(card.matchAll(/<p class="tool-description">([^<]+)<\/p>/g), match => match[1]);
    assert.equal(descriptions.length, 1);
    assert(descriptions[0].length < 100, 'Keep the description to a short sentence');
    assert(card.indexOf('tool-description') > card.indexOf('</h2>'));
    assert(card.indexOf('tool-description') < card.indexOf('field-group'));
  }
});

test('navigation hides calculators from guests and login return destinations cannot redirect outside the site', () => {
  const nav = fs.readFileSync('nav.html','utf8');
  assert.match(nav, /href="kalkulatory.html" data-auth-calculators hidden/);
  assert.match(fs.readFileSync('static/auth.js','utf8'), /calculatorsLink\.hidden = !isAuthenticated/);
  assert.match(fs.readFileSync('nav.css','utf8'), /\.main-nav \.profile-notification-link \{[^}]*grid-template-columns: minmax\(0, 1fr\) 32px;/);
  const login = fs.readFileSync('login.html','utf8');
  const start = login.indexOf('function loginDestination(');
  const source = login.slice(start, login.indexOf('\n}',start)+2);
  const ctx = vm.createContext({window:{location:{search:''}},URLSearchParams}); vm.runInContext(source,ctx);
  for (const next of ['kalkulatory.html', 'https://evil.example', '//evil.example', 'javascript:alert(1)', '../kalkulatory.html']) {
    ctx.window.location.search = '?next=' + encodeURIComponent(next);
    assert.equal(ctx.loginDestination({role:'student'}), next === 'kalkulatory.html' ? next : 'zadania.html');
  }
  assert.match(page, /id="calculatorWorkspace" hidden/);
  assert(!page.includes('url=index.html'));
  assert.match(page, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(page, /@media\(min-width: 761px\) \{\s*\.calculator-card\.wide \.result:has\(\.plot-card\) \{[^}]*grid-template-columns: minmax\(0, 0\.85fr\) minmax\(0, 1\.15fr\);/);
  assert.match(page, /\.calculator-section\[hidden\][^}]+display: none/);
  assert.match(fs.readFileSync('kalkulatory 2.html','utf8'), /location.replace\("kalkulatory.html"\)/);
});
