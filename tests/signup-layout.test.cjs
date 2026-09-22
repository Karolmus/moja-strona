const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const html = fs.readFileSync('zapisy.html', 'utf8');
assert(!html.includes('booking-photo'), 'The top portrait and its unused styles are removed');
assert.match(html, /\.schedule-overview \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
assert.match(html, /\.schedule-card \{[^}]*align-self: start;/);
const desktop = html.split('@media (min-width:1101px){')[1].split('@media (max-width:1100px){')[0];
assert.match(desktop, /\.booking-grid\{[^}]*grid-template-columns:minmax\(0, 1fr\);/);
assert.match(desktop, /grid-template-columns:var\(--step-heading-width\) minmax\(0, 1fr\);/);
assert.match(desktop, /\.signup-form-section \+ \.signup-form-section\{\s*margin-top:0;/);
assert.equal([...html.matchAll(/class="booking-step-content(?: signup-contact-fields)?"/g)].length, 5);
assert.deepEqual([...html.matchAll(/class="booking-step-number"[^>]*>(\d)<\/span>/g)].map(match => match[1]), ['1', '2', '3', '4', '5']);
assert(!html.includes('class="booking-step-description"><br>'), 'Spacing uses CSS, not empty descriptions');
assert.match(html, /<img class="booking-logo"[^>]*src="img\/logo3.png"/);
for (const count of [1, 2, 3]) {
  assert.match(html, new RegExp(`name="sessions_per_week" value="${count}"`));
}
assert.match(html, /<dt>Liczba zajęć w tygodniu:<\/dt><dd id="signupSummaryFrequency">/);
assert.match(html, /document\.getElementById\("signupSummaryFrequency"\)\.textContent = frequency/);
assert.match(html, /`Liczba zajęć w tygodniu: \$\{sessionsPerWeek\}`/);
assert(!html.includes('value="1 zajęcie tygodniowo"'));
for (const id of ['schedule', 'scheduleMobile', 'contactForm', 'signupConfirmation']) {
  assert(html.includes(`id="${id}"`), id);
}
for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
  new vm.Script(script[1]);
}
console.log('PASS: signup portrait removed; five ordered desktop steps, shared content column and registration controls retained');
