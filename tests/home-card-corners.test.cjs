const assert = require('node:assert/strict');
const fs = require('node:fs');
const {test} = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');

function radii(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'g');
  return [...html.matchAll(blocks)]
    .map(match => match[1].match(/border-radius:\s*(\d+)px;/)?.[1])
    .filter(Boolean)
    .map(Number);
}

test('home tile corners are halved at desktop and mobile breakpoints', () => {
  assert.deepEqual(radii('.card'), [8, 6]);
  assert.deepEqual(radii('.delta-brand-card'), [12]);
  assert.deepEqual(radii('.home-hero-row .enrollment-card'), [12, 8]);
  assert.deepEqual(radii('.exam-result-summary'), [8]);
  assert.deepEqual(radii('.home-flow [data-opinions-slot] .review-card'), [6, 5]);
  assert.deepEqual(radii('[data-about-slot] .about-shared__content'), [6]);
});

test('home overrides leave shared tile styles and round controls unchanged', () => {
  assert.match(fs.readFileSync('baner.css', 'utf8'), /border-radius:\s*24px;/);
  assert.match(fs.readFileSync('opinie.css', 'utf8'), /border-radius:\s*12px;/);
  assert.match(html, /\.delta-brand-portrait\{[^}]*border-radius:50%;/);
  assert.match(html, /\.exam-result-detail-link\{[^}]*border-radius:999px;/);
});
