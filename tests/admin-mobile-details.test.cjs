const assert = require('node:assert/strict');
const fs = require('node:fs');
const {test} = require('node:test');
const html = fs.readFileSync('admin.html', 'utf8');
const mobile = html.slice(html.indexOf('@media(max-width: 900px)'), html.indexOf('@media(max-width: 760px)'));

test('expanded mobile history and task tables become full-width lists rather than wide tables', () => {
  assert.match(mobile, /\.student-expanded \.source-task-table\s*\{[^}]*display: block;[^}]*min-width: 0;[^}]*width: 100%;/s);
  assert.match(mobile, /\.student-expanded \.source-task-row\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s);
  assert.match(mobile, /\.student-expanded \.source-card-grid\s*\{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(mobile, /\.student-expanded \.source-task-title,[\s\S]*?grid-column: 1 \/ -1;/);
  assert.match(mobile, /\.student-expanded \.source-task-preview\[hidden\] \{ display: none; \}/);
  assert.match(mobile, /\.student-expanded \.source-task-table-wrap \{ overflow-x: hidden; \}/);
});

test('labels and teacher/reset controls remain available without changing desktop tables', () => {
  assert.match(html, /homework\.dataset\.label = "Praca domowa"/);
  assert.match(html, /revision\.dataset\.label = "Powtórki"/);
  assert.match(html, /pointsCell\.dataset\.label = "Punkty:"/);
  assert.match(html, /timeCell\.dataset\.label = "Czas:"/);
  assert.match(mobile, /\.student-expanded \.source-task-points \{ grid-column: 1 \/ -1; \}/);
  assert.match(mobile, /\.student-expanded \.lesson-work-actions\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s);
  assert.match(mobile, /\.student-expanded \.task-reset-selection\s*\{[^}]*width: 16px;[^}]*flex: 0 0 auto;/s);
  assert.match(html, /pointsCell\.appendChild\(teacherScoreControl\(progressItem, task\)\)/);
  assert.match(html, /actions\.addEventListener\("click", event => event\.stopPropagation\(\)\)/);
  assert.match(html, /\.source-task-table\.course-task-table\s*\{\s*min-width: 360px;/);
});
