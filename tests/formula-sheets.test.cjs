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
const extraTitle = {};
const extraCard = {
  hidden: true,
  querySelector: selector => {
    assert.equal(selector, 'strong');
    return extraTitle;
  },
  setAttribute: (name, value) => { extraCard[name] = value; }
};
const ctx = vm.createContext({
  isLoggedInStudent: true,
  selectedLevel: '',
  document: { getElementById: id => ({ formulaSection: section, formulaCard: card, extraFormulaCard: extraCard })[id] }
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
  assert.equal(extraCard.hidden, level !== 'matura_podstawowa', 'Additional formulas only appear for MP');
  if (level === 'matura_podstawowa') {
    assert.equal(extraCard.href, 'wzory_spoza_tablic_mp.pdf');
    assert.equal(extraTitle.innerText, 'Wzory spoza tablic');
    assert.match(extraCard['aria-label'], /otwiera się w nowej karcie/);
    assert.equal(fs.readFileSync(extraCard.href).subarray(0, 5).toString(), '%PDF-');
  }
  ctx.isLoggedInStudent = false;
  ctx.updateFormulaSection();
  assert.equal(section.style.display, 'none', 'Existing guest visibility is unchanged');
  assert.equal(extraCard.hidden, true, 'Guests do not see the additional course material');
}
ctx.selectedLevel = 'unknown';
ctx.isLoggedInStudent = true;
ctx.updateFormulaSection();
assert.equal(section.style.display, 'none');
assert.equal(extraCard.hidden, true);
const link = html.match(/<a\b[^>]*id="formulaCard"[^>]*>/)?.[0];
assert(link);
assert.match(link, /target="_blank"/);
assert.match(link, /rel="noopener noreferrer"/);
const extraLink = html.match(/<a\b[^>]*id="extraFormulaCard"[^>]*>/)?.[0];
assert(extraLink);
assert.match(extraLink, /target="_blank"/);
assert.match(extraLink, /rel="noopener noreferrer"/);
assert.match(extraLink, /\bhidden\b/);
assert.match(html, /\.formula-card\[hidden\]\s*\{\s*display:\s*none;/);
assert(!html.includes('.formula-card::after'), 'Material links have no decorative arrow');
assert.match(html, /\.formula-card\s*\{[^}]*min-height: 36px;/);
for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  new vm.Script(script[1]);
}
console.log('PASS: formula sheets for all levels, MP-only extra formulas, local PDFs, new-tab links and guest visibility');
