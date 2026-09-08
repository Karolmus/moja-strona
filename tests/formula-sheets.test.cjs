const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('zadania.html', 'utf8');
const config = html.match(/const FORMULA_SHEETS = (\{[\s\S]*?\n\});/);
assert(config, 'Formula sheet configuration exists');
const section = { style: {} };
const title = {};
const card = {
  href: '',
  querySelector: selector => {
    assert.equal(selector, 'strong');
    return title;
  },
  setAttribute: (name, value) => { card[name] = value; }
};
const ctx = vm.createContext({
  isLoggedInStudent: true,
  selectedLevel: '',
  document: { getElementById: id => ({ formulaSection: section, formulaCard: card })[id] }
});
vm.runInContext(`const FORMULA_SHEETS = ${config[1]};`, ctx);
const start = html.indexOf('function updateFormulaSection(');
assert(start >= 0);
vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), ctx);

for (const [level, file] of [
  ['matura_podstawowa', 'wzory_matura.pdf'],
  ['matura_rozszerzona', 'wzory_matura.pdf'],
  ['egzamin_osmoklasisty', 'wzory_eo.pdf']
]) {
  ctx.selectedLevel = level;
  ctx.isLoggedInStudent = true;
  ctx.updateFormulaSection();
  assert.equal(section.style.display, 'grid', level);
  assert.equal(card.href, file, level);
  assert.equal(title.innerText, 'Karta wzorów');
  assert.match(card['aria-label'], /otwiera się w nowej karcie/);
  assert.equal(fs.readFileSync(file).subarray(0, 5).toString(), '%PDF-');
  ctx.isLoggedInStudent = false;
  ctx.updateFormulaSection();
  assert.equal(section.style.display, 'none', 'Existing guest visibility is unchanged');
}
const link = html.match(/<a\b[^>]*id="formulaCard"[^>]*>/)?.[0];
assert(link);
assert.match(link, /target="_blank"/);
assert.match(link, /rel="noopener noreferrer"/);
for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  new vm.Script(script[1]);
}
console.log('PASS: formula sheets for all three levels, local PDFs, new-tab links and access visibility');
