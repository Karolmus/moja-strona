const fs = require('node:fs');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('zadania.html', 'utf8');

test('phone landscape keeps the task image at full width and its natural aspect ratio', () => {
  const landscape = html.slice(html.indexOf('@media (orientation: landscape)'), html.indexOf('</style>'));
  const image = landscape.match(/\.task-image\s*\{([^}]+)\}/)[1];
  assert.match(image, /width: 100%;/);
  assert.match(image, /height: auto;/);
  assert.match(image, /max-height: none;/);
  assert(!image.includes('object-fit: contain'), 'No fixed-height letterboxing that shrinks the actual image');
  assert(!image.includes('object-position: left'), 'Task content is not forced into the left side of a wide box');
  assert.match(landscape, /body\.focus-mode\s*\{[^}]*background: #ffffff;/,
    'Rotating a phone keeps focus mode white instead of restoring the desktop black margins');
});

test('work instructions and test restrictions are short and do not use a large notice panel', () => {
  for(const name of ['notebook-work-notice', 'test-mode-notice']){
    const text = html.match(new RegExp(`<p class="${name}"[^>]*>([^<]+)</p>`))[1];
    assert(text.length <= 55, `${name} should fit in a compact note`);
  }
  const notice = html.match(/\.test-mode-notice\s*\{([^}]+)\}/)[1];
  assert(!/padding:|border:|background:/.test(notice), 'No separate colored panel for a short restriction note');
  assert.match(html, /\.meta-box\.meta-test\s*\{[^}]*flex-direction: row;/);
});
