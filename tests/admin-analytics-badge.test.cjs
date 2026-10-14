const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('admin.html', 'utf8');

function setup() {
  const badge = {
    innerText: '', title: '', attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  const context = vm.createContext({analyticsTodayBadge: badge, Intl});
  for (const name of ['formatAnalyticsNumber', 'updateAnalyticsTodayBadge']) {
    const start = html.indexOf(`function ${name}(`);
    assert(start >= 0);
    vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), context);
  }
  return {badge, context};
}

test('traffic badge uses unique visitors today, not views or period totals', () => {
  const {badge, context} = setup();
  context.updateAnalyticsTodayBadge({
    range_end: '2026-10-13',
    overview: {visitors: 200, views: 500},
    daily: [
      {day: '2026-10-12', visitors: 80},
      {day: '2026-10-13', visitors: 7, views: 35},
      {day: '2026-10-14', visitors: 10}
    ]
  });
  assert.equal(badge.innerText, '7');
  assert.equal(badge.title, 'Użytkownicy dzisiaj: 7');
  assert.equal(badge.attributes['aria-label'], badge.title);
});

test('zero visitors is shown explicitly and invalid responses do not fabricate a count', () => {
  const {badge, context} = setup();
  context.updateAnalyticsTodayBadge({range_end: '2026-10-13', daily: []});
  assert.equal(badge.innerText, '');
  context.updateAnalyticsTodayBadge({range_end: '2026-10-13', daily: [{day: '2026-10-13', visitors: 0}]});
  assert.equal(badge.innerText, '0');
  for (const visitors of [undefined, null, -1, NaN, '4', 2.5]) {
    context.updateAnalyticsTodayBadge({range_end: '2026-10-13', daily: [{day: '2026-10-13', visitors}]});
    assert.equal(badge.innerText, '0');
  }
});

test('badge loads after authentication independently of students and refreshes with analytics', () => {
  assert.match(html, /data-admin-tab="analytics"[^>]*>Ruch na stronie <span id="analyticsTodayBadge"/);
  assert.match(html, /adminSessionVerified = true;\s*settleAdminSession\(true\);\s*void loadAnalyticsBadge\(\);/);
  assert.match(html, /updateAnalyticsTodayBadge\(await apiFetch\("\/api\/admin\/analytics\/today"\)\)/);
  assert.match(html, /if\(showAnalytics\)\{\s*loadAnalytics\(true\);/);
  const render = html.slice(html.indexOf('function renderAnalytics(data){'), html.indexOf('async function loadAnalytics('));
  assert.match(render, /updateAnalyticsTodayBadge\(data\)/);
  assert.match(html, /apiFetch\(`\/api\/admin\/analytics\?days=\$\{days\}`\)/);
});
