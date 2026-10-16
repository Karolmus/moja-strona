const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('admin.html', 'utf8');

function setup() {
  const element = tag => ({
    tag, children: [], style: {}, attributes: {}, innerText: '',
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); },
    replaceChildren() { this.children = []; },
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const chart = element('div');
  const c = vm.createContext({analyticsChart: chart, document: {createElement: element}, Intl});
  for (const name of ['formatAnalyticsNumber', 'renderAnalyticsChart']) {
    const start = html.indexOf(`function ${name}(`);
    assert(start >= 0);
    vm.runInContext(html.slice(start, html.indexOf('\n}', start) + 2), c);
  }
  return {chart, c};
}

test('each day visibly shows both actual counts, dates and accessible descriptions', () => {
  const {chart, c} = setup();
  c.renderAnalyticsChart([
    {day:'2026-10-15', views:12, visitors:8},
    {day:'2026-10-16', views:0, visitors:0}
  ]);
  assert.equal(chart.children.length, 2);
  const first = chart.children[0];
  assert.equal(first.attributes['aria-label'], '2026-10-15: 12 odsłon, 8 użytkowników');
  assert.equal(first.children[1].innerText, '15.10');
  const series = first.children[0].children;
  assert.equal(series[0].children[1].innerText, '12');
  assert.equal(series[1].children[1].innerText, '8');
  assert.equal(series[0].style.height, '100%');
  assert.equal(series[1].children[0].className, 'analytics-bar visitors');
  for (const series of chart.children[1].children[0].children) {
    assert.equal(series.children[1].innerText, '0');
    assert.equal(series.style.height, '0%');
  }
});

test('empty periods clear old results and invalid values cannot produce broken bar heights', () => {
  const {chart, c} = setup();
  c.renderAnalyticsChart([{day:'2026-10-16', views:-4, visitors:Infinity}]);
  for (const series of chart.children[0].children[0].children) assert.equal(series.style.height, '0%');
  c.renderAnalyticsChart([]);
  assert.equal(chart.children.length, 0);
  assert.equal(chart.style.gridAutoColumns, 'minmax(36px, 1fr)');
});

test('both series share a bounded scale and long counts receive enough label space', () => {
  const {chart, c} = setup();
  c.renderAnalyticsChart([{day:'2026-10-16', views:1200000, visitors:2400000}]);
  const series = chart.children[0].children[0].children;
  assert.equal(series[0].style.height, '50%');
  assert.equal(series[1].style.height, '100%');
  assert.equal(series[0].children[1].innerText, c.formatAnalyticsNumber(1200000));
  const width = Number(chart.style.gridAutoColumns.match(/\d+/)[0]);
  assert(width >= c.formatAnalyticsNumber(2400000).length * 14 + 10);
  assert.match(html, /\.analytics-bars \{[^}]*padding-top: 22px;/);
  assert.match(html, /\.analytics-bar-count \{[^}]*bottom: calc\(100% \+ 4px\);[^}]*font-size: 11px;/);
  assert.match(html, /renderAnalyticsChart\(daily\)/);
});
