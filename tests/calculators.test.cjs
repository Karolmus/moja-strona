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
    binomialN: 'n', binomialK: 'k',
    compoundCapital: 'K_0', compoundRate: 'p', compoundYears: 't', compoundFrequency: 'm',
  };
  for (const [id, tex] of Object.entries(symbols)) {
    const label = labels.get(id);
    assert(label, id);
    assert(label.includes(`class="field-symbol" data-tex="${tex}"`), id);
    assert.match(page, new RegExp(`<(?:input|select) id="${id}"`), `The label must still focus ${id}`);
    const rendered = katex.renderToString(tex, {output: 'htmlAndMathml', throwOnError: true, trust: false, strict: 'error'});
    assert.match(rendered, /<math\b/, id);
    if (tex.includes('_')) {
      assert.match(label, /<sub>[AS012]<\/sub>/, 'Keep real subscripts even before math rendering');
      assert.match(rendered, /<msub>/, id);
      assert(!label.replace(/<[^>]+>/g, '').includes('_'), `No literal underscore should be visible in ${id}`);
    }
  }
});

test('every calculator input has a signup-style outlined legend without changing field IDs or the plot toggle', () => {
  const fields = Array.from(page.matchAll(/<fieldset class="field">([\s\S]*?)<\/fieldset>/g), match => match[1]);
  const inputs = Array.from(page.matchAll(/<(?:input|select) id="([^"]+)"/g), match => match[1]).filter(id => id !== 'includePlots');
  assert.equal(fields.length, inputs.length);
  assert.equal(fields.length, 29);
  for (const field of fields) {
    const id = field.match(/<(?:input|select) id="([^"]+)"/)[1];
    assert.match(field, new RegExp(`<legend><label for="${id}">[\\s\\S]+<\\/label><\\/legend>`));
    assert.equal((field.match(/<(?:input|select)\b/g) || []).length, 1);
  }
  assert(!page.includes('<div class="field">'));
  assert.match(page, /<label class="plot-toggle">\s*<input id="includePlots" type="checkbox">/);
});

test('outlined calculator fields match signup borders, focus and error feedback while retaining mobile sizing', () => {
  const signup = fs.readFileSync('zapisy.html', 'utf8');
  for (const declaration of ['border: 1.5px solid #cbd2dd;', 'padding: 0 16px 4px;',
    'border-color: #6788aa;', 'box-shadow: 0 0 0 3px rgba(103, 136, 170, 0.12);',
    'border-color: #c44338;', 'font-size: 18px;', 'font-size: 16px;']) {
    assert(page.includes(declaration), declaration);
    assert(signup.includes(declaration), declaration);
  }
  assert.match(page, /\.field:focus-within/);
  assert.match(page, /\.field:has\(\[aria-invalid="true"\]\)/);
  assert.match(page, /\.field legend \{[^}]*max-width: 100%;/);
  assert.match(page, /\.field label \{[^}]*overflow-wrap: anywhere;/);
  assert.match(page, /\.field input:focus,\s*\.field select:focus \{ outline: none; \}/);
  assert.match(page, /@media\(max-width: 600px\) \{\s*\.field \{ padding-inline: 12px; \}/);
});

test('each calculator has one short description of its calculation', () => {
  const cards = Array.from(page.matchAll(/<section class="calculator-card(?: wide)?">([\s\S]*?)<\/section>/g), match => match[1]);
  assert.equal(cards.length, 8);
  for (const card of cards) {
    const descriptions = Array.from(card.matchAll(/<p class="tool-description">([^<]+)<\/p>/g), match => match[1]);
    assert.equal(descriptions.length, 1);
    assert(descriptions[0].length < 100, 'Keep the description to a short sentence');
    assert(card.indexOf('tool-description') > card.indexOf('</h2>'));
    assert(card.indexOf('tool-description') < card.indexOf('field-group'));
  }
});

test('binomial calculator sends validated integers and renders an exact mathematical result', async () => {
  const f = calculatorFixture();
  f.root.apiFetch = async (path, options) => {
    f.calls.push({path, data:JSON.parse(options.body)});
    return {n:100, k:50, result:'100891344545564193334812497256', plot:null};
  };
  f.node('binomialN').value = '100';
  f.node('binomialK').value = '50';
  await f.ctx.calcBinomial();
  assert.deepEqual(f.calls[0], {path:'/api/binomial', data:{n:100,k:50,include_plot:false}});
  assert.equal(f.node('res_binomial').dataset.state, 'ready');
  assert.match(f.node('res_binomial').innerHTML, /\\binom\{100\}\{50\}=100891344545564193334812497256/);
  assert.equal(f.button.disabled, false);
  const katex = require('../static/lib/katex/katex.min.js');
  const tex = String.raw`\binom{100}{50}=100891344545564193334812497256`;
  assert.match(katex.renderToString(tex, {throwOnError:true,trust:false}), /<math\b/);
  const section = page.slice(page.indexOf('<section class="calculator-section" data-category="probability"'));
  assert(section.indexOf('Symbol Newtona') < section.indexOf('Schemat Bernoulliego'));
  assert.match(section, /onclick="calcBinomial\(\)"/);
});

test('binomial calculator rejects missing, fractional, negative, too large and reversed arguments before a request', async () => {
  const f = calculatorFixture();
  for (const [n, k, field] of [['','2','binomialN'], ['5','', 'binomialK'],
    ['2.5','1','binomialN'], ['5','1/2','binomialK'], ['-1','0','binomialN'],
    ['5','-1','binomialK'], ['1001','1','binomialN'], ['5','1001','binomialK'],
    ['3','4','binomialK'], ['Infinity','0','binomialN']]) {
    f.node('binomialN').value = n;
    f.node('binomialK').value = k;
    await f.ctx.calcBinomial();
    assert.equal(f.node('res_binomial').dataset.state, 'error', `${n}, ${k}`);
    assert.equal(f.node(field).attrs['aria-invalid'], 'true');
    assert.equal(f.button.disabled, false);
  }
  assert.equal(f.calls.length, 0);
  for (const value of ['0', '3,0', '1000']) {
    f.node('binomialN').value = value;
    assert.equal(f.ctx.readBinomialParameter('binomialN'), Number(value.replace(',', '.')));
    assert.equal(f.node('binomialN').attrs['aria-invalid'], undefined);
  }
});

test('compound interest accepts decimal commas and shows rounded money with a mathematical substitution', async () => {
  const f = calculatorFixture();
  f.root.apiFetch = async (path, options) => {
    f.calls.push({path, data:JSON.parse(options.body)});
    return {capital:'1000.5',annual_rate:'5.5',frequency:4,periods:2,balance:'1028.20',interest:'27.70',plot:null};
  };
  f.node('compoundCapital').value = '1000,50';
  f.node('compoundRate').value = '5,5';
  f.node('compoundYears').value = '0,5';
  f.node('compoundFrequency').value = '4';
  await f.ctx.calcCompoundInterest();
  assert.deepEqual(f.calls[0], {path:'/api/compound-interest',data:{capital:1000.5,annual_rate:5.5,years:0.5,frequency:4,include_plot:false}});
  const result = f.node('res_compound');
  assert.equal(result.dataset.state, 'ready');
  assert.match(result.innerHTML, /1028,20.*zł/);
  assert.match(result.innerHTML, /27,70.*zł/);
  assert.match(result.innerHTML, /K=1000\{,\}5\\left/);
  assert.match(result.innerHTML, /\\right\)\^\{2\}/);
  const katex = require('../static/lib/katex/katex.min.js');
  const tex = result.innerHTML.match(/data-tex="([^"]+)"/)[1];
  assert.match(katex.renderToString(tex,{throwOnError:true,trust:false}), /<math\b/);
  assert.match(page, /bez dopłat, podatku oraz opłat/);
  const options = page.match(/<select id="compoundFrequency">([\s\S]*?)<\/select>/)[1];
  assert.deepEqual(Array.from(options.matchAll(/value="(\d+)"/g), m => Number(m[1])), [1,2,4,12]);
});

test('compound interest rejects incomplete periods and invalid parameters without sending a request', async () => {
  const cases = [
    ['compoundCapital',''], ['compoundCapital','-1'], ['compoundCapital','1000000001'],
    ['compoundRate','-1'], ['compoundRate','101'], ['compoundRate','abc'],
    ['compoundYears','-1'], ['compoundYears','101'], ['compoundYears','0.1'],
    ['compoundYears','0.000000000001'], ['compoundFrequency','0'], ['compoundFrequency','3'],
  ];
  for (const [id, value] of cases) {
    const f = calculatorFixture();
    for (const [field, valid] of Object.entries({compoundCapital:'1000',compoundRate:'5',compoundYears:'2',compoundFrequency:'12'})) {
      f.node(field).value = valid;
    }
    f.node(id).value = value;
    await f.ctx.calcCompoundInterest();
    assert.equal(f.calls.length, 0, `${id}=${value}`);
    assert.equal(f.node(id).attrs['aria-invalid'], 'true');
    assert.equal(f.node('res_compound').dataset.state, 'error');
    assert.equal(f.button.disabled, false);
  }
});

test('whole compound periods allow fractions and zero duration without forcing a minimum investment', async () => {
  for (const [years, frequency] of [['1/3','12'], ['0','1']]) {
    const f = calculatorFixture();
    f.root.apiFetch = async (path, options) => {
      f.calls.push({path, data:JSON.parse(options.body)});
      return {capital:'0',annual_rate:'0',frequency:Number(frequency),periods:0,balance:'0.00',interest:'0.00',plot:null};
    };
    f.node('compoundCapital').value = '0'; f.node('compoundRate').value = '0';
    f.node('compoundYears').value = years; f.node('compoundFrequency').value = frequency;
    await f.ctx.calcCompoundInterest();
    assert.equal(f.calls.length, 1);
    assert.equal(f.node('res_compound').dataset.state, 'ready');
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
