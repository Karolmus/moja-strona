const assert = require('node:assert/strict');
const fs = require('node:fs');
const {test} = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');

function radii(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'g');
  return [...html.matchAll(blocks)]
    .map(match => match[1].match(/border-radius:\s*([\d.]+)px;/)?.[1])
    .filter(Boolean)
    .map(Number);
}

test('home tile corners retain the earlier reduction and are another 15 percent smaller', () => {
  assert.deepEqual(radii('.card'), [6.8, 5.1]);
  assert.deepEqual(radii('.delta-brand-card'), [10.2]);
  assert.deepEqual(radii('.home-hero-row .enrollment-card'), [10.2, 6.8]);
  assert.deepEqual(radii('.exam-result-summary'), [6.8]);
  assert.deepEqual(radii('.home-flow [data-opinions-slot] .review-card'), [5.1, 4.25]);
  assert.deepEqual(radii('[data-about-slot] .about-shared__content'), [5.1]);
});

test('shared tiles also become 15 percent smaller while circular controls stay round', () => {
  assert.match(fs.readFileSync('baner.css', 'utf8'), /border-radius:\s*20\.4px;/);
  assert.match(fs.readFileSync('opinie.css', 'utf8'), /border-radius:\s*10\.2px;/);
  assert.match(html, /\.delta-brand-portrait\{[^}]*border-radius:50%;/);
  assert.match(html, /\.exam-result-detail-link\{[^}]*border-radius:999px;/);
});
