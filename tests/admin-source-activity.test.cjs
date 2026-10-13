const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const html = fs.readFileSync('admin.html', 'utf8');

const context = vm.createContext({
  document: {
    createElement: () => ({children: [], append(...children) {this.children.push(...children);}})
  }
});
for (const name of ['formatDate', 'formatDuration', 'sumDuration', 'renderSourceActivity']) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), context);
}

test('source activity shows the date with its hour and the total recorded task time', () => {
  for (const category of ['kurs', 'egzaminy']) {
    const group = {
      category,
      lastActivity: '2026-10-13T14:58:00+02:00',
      tasks: [
        {latestProgress: {duration_seconds: 60}},
        {latestProgress: {duration_seconds: '83', result: 'video'}},
        {latestProgress: {duration_seconds: 106, teacher_review_pending: true}},
        {latestProgress: null},
        {latestProgress: {result: 'good'}}
      ]
    };
    const activity = context.renderSourceActivity(group);
    assert.equal(activity.className, 'source-activity');
    assert.equal(activity.children[0].textContent, context.formatDate(group.lastActivity));
    assert.match(activity.children[0].textContent, /\d{1,2}:\d{2}/);
    assert.equal(activity.children[1].textContent, 'Łącznie: 4 min 9 s');
  }
});

test('unstarted sources and a source without recorded time remain safe to display', () => {
  const empty = context.renderSourceActivity({tasks: []});
  assert.equal(empty.children[0].textContent, 'brak');
  assert.equal(empty.children[1].textContent, 'Łącznie: 0 s');
  const hour = context.renderSourceActivity({tasks: [{latestProgress: {duration_seconds: 3661}}]});
  assert.equal(hour.children[1].textContent, 'Łącznie: 1 h 1 min');
});

test('lesson, test and exam rows share the activity display and student rows show the hour', () => {
  for (const name of ['renderCourseHistory', 'renderTestHistory', 'renderExamHistory', 'renderSourceProgress']) {
    const start = html.indexOf(`function ${name}(`);
    const source = html.slice(start, html.indexOf('\n}', start) + 2);
    assert.match(source, /renderSourceActivity\(group\)/);
  }
  assert.match(html, /activity\.textContent = formatDate\(studentLastActivity\(student\)\)/);
  assert.match(html, /\.source-activity\s*\{[^}]*flex-wrap: wrap;[^}]*gap: 2px 8px;/s);
});
