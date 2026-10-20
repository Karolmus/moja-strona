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
  assert.match(landscape, /\.action-group\.navigation \{[^}]*grid-row: 1;/,
    'Landscape navigation stays directly below answers, before optional tools');
});

test('work instructions are a dismissible inline note and test restrictions stay short', () => {
  assert(html.includes('id="notebookWorkNotice" role="note"'));
  assert(!html.includes('notebookStartDialog'));
  const text = html.match(/<p class="test-mode-notice"[^>]*>([^<]+)<\/p>/)[1];
  assert(text.length <= 55);
  const notice = html.match(/\.test-mode-notice\s*\{([^}]+)\}/)[1];
  assert(!/padding:|border:|background:/.test(notice), 'No separate colored panel for a short restriction note');
  assert.match(html, /\.meta-box\.meta-test\s*\{[^}]*flex-direction: row;/);
});
