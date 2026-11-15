const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('zadania.html', 'utf8');
const mobile = fs.readFileSync('static/mobile-exams.css', 'utf8');

test('focus remains a stable compact icon with a named entry and exit state', () => {
  assert.match(html, /\.focus-toggle \{[^}]*position: static;[^}]*width: 32px;[^}]*height: 32px;/);
  assert.match(html, /id="focusToggle"[^>]*aria-label="Tryb skupienia"[^>]*title="Tryb skupienia"[^>]*aria-pressed="false"/);
  for (const name of ['maximize', 'x']) assert(fs.existsSync(`static/icons/${name}.svg`));
  const button = {attrs:{}, setAttribute(key,value){this.attrs[key]=value;}};
  const classes = new Set();
  const context = vm.createContext({focusMode:false, document:{
    body:{classList:{toggle(name,on){on ? classes.add(name) : classes.delete(name);}}},
    getElementById(id){assert.equal(id,'focusToggle'); return button;}
  }});
  const start = html.indexOf('function toggleFocusMode(');
  vm.runInContext(html.slice(start,html.indexOf('\n}',start)+2),context);
  context.toggleFocusMode();
  assert(classes.has('focus-mode'));
  assert.equal(button.attrs['aria-label'],'Wyjdź z trybu skupienia');
  assert.equal(button.attrs['aria-pressed'],'true');
  assert.equal(button.innerText,undefined,'Switching states must preserve the icon elements');
  context.toggleFocusMode();
  assert(!classes.has('focus-mode'));
  assert.equal(button.attrs['aria-pressed'],'false');
  assert.equal(button.title,'Tryb skupienia');
  assert.match(mobile, /\.task-navigation \.focus-toggle \{[^}]*width: 32px;[^}]*height: 32px;[^}]*padding: 0;/);
});

test('exam tools have prominent colored boundaries, local icons and keyboard feedback', () => {
  assert.match(html, /\.mode-btn,\s*\.tag-toggle-btn \{[^}]*min-height: 36px;[^}]*border: 1px solid #8aa6c3;[^}]*background: var\(--blue-soft\);/);
  for (const name of ['tag','shuffle']) {
    assert(fs.existsSync(`static/icons/${name}.svg`));
    assert(html.includes(`mask: url("static/icons/${name}.svg")`));
  }
  assert.match(html, /\.exam-tools-row button:focus-visible,/);
  assert.match(html, /\.exam-tools-row \.mode-btn:disabled \{[^}]*cursor: not-allowed;/);
  assert.match(html, /toggleButton\.setAttribute\("aria-expanded", String\(shouldShow && tagPanelOpen\)\)/);
  assert.match(html, /b\.setAttribute\("aria-pressed", String\(b\.dataset\.mode === taskMode\)\)/);
});
