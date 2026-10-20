const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');

const files = [
  'admin.html','baner.css','index.html','kalkulatory 2.html','kalkulatory.html','kontakt.html',
  'login.html','matura_podstawowa.html','matura_rozszerzona.html','nav.css','o-mnie.html',
  'opinie.css','osmoklasista.html','polityka-prywatnosci.html','profil.html','regulamin-zajec.html',
  'rodzic.html','static/analytics.js','static/auth.js','trening.html','wyniki-tematyczne.css',
  'wyniki.html','zadania.html','zapisy.html'
];
const scaledRadii = new Set([3.4,4.25,5.1,5.95,6.8,8.5,9.35,10.2,11.9,13.6,15.3,20.4]);

test('rectangular UI corners are consistently reduced across all pages, shared CSS and generated dialogs', () => {
  for (const file of files) {
    const source = fs.readFileSync(file,'utf8');
    let scaled = 0;
    for (const match of source.matchAll(/(?:border-radius|--panel-radius)\s*:\s*([^;}\n"']+)/g)) {
      for (const token of match[1].matchAll(/\b(\d+(?:\.\d+)?)px\b/g)) {
        const value = Number(token[1]);
        if (value <= 3 || value >= 64) continue;
        assert(scaledRadii.has(value), `${file}: unexpected corner radius ${value}`);
        scaled += 1;
      }
    }
    if(!file.endsWith('.js')) assert(scaled > 0, `${file}: expected at least one scaled rectangle`);
  }
  assert.match(fs.readFileSync('zapisy.html','utf8'), /--panel-radius:\s*15\.3px/);
  assert.match(fs.readFileSync('nav.css','utf8'), /border-radius:\s*50%/);
  assert.match(fs.readFileSync('zadania.html','utf8'), /border-radius:\s*999px/);
});

test('all scripts on the affected pages remain syntactically valid', () => {
  for (const file of files) {
    const source = fs.readFileSync(file,'utf8');
    if (file.endsWith('.js')) new vm.Script(source,{filename:file});
    if (!file.endsWith('.html')) continue;
    for (const [,attrs,script] of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/.test(attrs) || /\btype\s*=\s*["'][^"']*json/i.test(attrs)) continue;
      new vm.Script(script,{filename:file});
    }
  }
});
