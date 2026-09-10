const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const html = fs.readFileSync('zapisy.html', 'utf8');
assert(!html.includes('booking-photo'), 'The top portrait and its unused styles are removed');
assert.match(html, /\.schedule-overview \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
assert.match(html, /\.schedule-card \{[^}]*align-self: start;/);
assert.match(html, /<img class="booking-logo"[^>]*src="img\/logo3.png"/);
for (const id of ['schedule', 'scheduleMobile', 'contactForm', 'signupConfirmation']) {
  assert(html.includes(`id="${id}"`), id);
}
for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
  new vm.Script(script[1]);
}
console.log('PASS: signup portrait removed, single-column introduction, logo and registration controls retained');
