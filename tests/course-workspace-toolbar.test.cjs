const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');

const html = fs.readFileSync('zadania.html', 'utf8');
const start = html.indexOf('function syncCourseWorkspaceLayout(');
assert(start >= 0);
const source = html.slice(start, html.indexOf('\n}', start) + 2);

class Node {
  constructor(id) {this.id = id; this.children = []; this.hidden = true;}
  appendChild(node) {
    if (node.parentElement) node.parentElement.children.splice(node.parentElement.children.indexOf(node), 1);
    this.children.push(node);
    node.parentElement = this;
  }
  after(node) {
    const parent = this.parentElement;
    if (node.parentElement) node.parentElement.children.splice(node.parentElement.children.indexOf(node), 1);
    parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
    node.parentElement = parent;
  }
}

function fixture() {
  const ids = ['courseWorkspaceToolbar', 'courseBrandFooter', 'sourceSummaryRow',
    'sourceSummarySidebarAnchor', 'formulaSection', 'formulaSidebarAnchor',
    'courseBrand', 'courseBrandSidebarAnchor'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node(id)]));
  const sidebar = new Node('sidebar');
  for (const id of ['formulaSidebarAnchor', 'formulaSection', 'sourceSummarySidebarAnchor',
    'sourceSummaryRow', 'courseBrandSidebarAnchor', 'courseBrand']) sidebar.appendChild(nodes[id]);
  nodes.formulaSection.href = 'wzory_matura.pdf';
  nodes.sourceSummaryRow.points = '4 / 18 pkt';
  const ctx = vm.createContext({selectedCategory:'kurs', desktop:true,
    document:{getElementById:id => nodes[id]},
    window:{matchMedia:query => {
      assert.equal(query, '(min-width: 761px)');
      return {matches:ctx.desktop};
    }}});
  vm.runInContext(source, ctx);
  return {ctx,nodes,sidebar};
}

test('desktop course puts the existing score and document links above the navigator and branding below the task', () => {
  const {ctx,nodes,sidebar} = fixture();
  const originalNodes = Object.values(nodes);
  ctx.syncCourseWorkspaceLayout();
  assert.deepEqual(nodes.courseWorkspaceToolbar.children.map(node => node.id), ['sourceSummaryRow', 'formulaSection']);
  assert.deepEqual(nodes.courseBrandFooter.children.map(node => node.id), ['courseBrand']);
  assert.equal(nodes.courseWorkspaceToolbar.hidden, false);
  assert.equal(nodes.courseBrandFooter.hidden, false);
  assert.equal(sidebar.children.length, 3, 'Only nonvisual anchors stay in the selector');
  ctx.syncCourseWorkspaceLayout();
  assert.equal(nodes.courseWorkspaceToolbar.children.length, 2, 'Refreshing results does not duplicate controls');
  assert.equal(nodes.formulaSection.href, 'wzory_matura.pdf');
  assert.equal(nodes.sourceSummaryRow.points, '4 / 18 pkt');
  assert.deepEqual(Object.values(nodes), originalNodes, 'Move existing DOM nodes without losing handlers or values');
});

test('phone widths and other tabs restore the original sidebar order, including repeated resizing', () => {
  const {ctx,nodes,sidebar} = fixture();
  const order = sidebar.children.map(node => node.id);
  for (const [category,desktop] of [['kurs',true], ['kurs',false], ['kurs',true],
    ['testy',true], ['kurs',true], ['egzaminy',true], ['kurs',false]]) {
    ctx.selectedCategory = category;
    ctx.desktop = desktop;
    ctx.syncCourseWorkspaceLayout();
    const moved = desktop && category === 'kurs';
    assert.equal(nodes.courseWorkspaceToolbar.hidden, !moved);
    assert.equal(nodes.courseBrandFooter.hidden, !moved);
    if (!moved) {
      assert.deepEqual(sidebar.children.map(node => node.id), order);
      assert.equal(nodes.courseWorkspaceToolbar.children.length, 0);
      assert.equal(nodes.courseBrandFooter.children.length, 0);
    }
  }
  assert.match(html, /matchMedia\("\(min-width: 761px\)"\)\.addEventListener\("change", syncCourseWorkspaceLayout\)/);
  assert.match(html, /list\.classList\.toggle\("exam-source-list", selectedCategory === "egzaminy"\);\s*syncCourseWorkspaceLayout\(\);/);
});

test('toolbar is compact, has no extra frame, and stays out of focus and phone-landscape views', () => {
  assert(html.indexOf('id="courseWorkspaceToolbar"') < html.indexOf('id="progress"'));
  assert(html.indexOf('id="courseBrandFooter"') > html.indexOf('class="interaction-panel"'));
  assert.match(html, /id="courseWorkspaceToolbar"[^>]*aria-label="Wynik lekcji i materiały"[^>]*hidden/);
  const desktopStyle = html.split('@media(min-width: 761px) {')[1].split('@media(max-width: 1100px) {')[0];
  assert.match(desktopStyle, /\.course-workspace-toolbar:not\(\[hidden\]\) \{[^}]*align-items: center;[^}]*min-height: 40px;/);
  assert.match(desktopStyle, /\.course-workspace-toolbar \.source-summary-card \{[^}]*border: 0;[^}]*background: transparent;/);
  assert.match(desktopStyle, /\.course-workspace-toolbar > #formulaSection \{[^}]*grid-auto-flow: column;[^}]*margin-left: auto;/);
  assert.match(desktopStyle, /\.course-workspace-toolbar \.formula-card \{[^}]*height: 36px;/);
  assert.match(html, /body\.focus-mode \.course-workspace-toolbar,\s*body\.focus-mode \.course-brand-footer \{\s*display: none;/);
  const landscape = html.split('@media (orientation: landscape) and (max-height: 560px) and (max-width: 1000px) {')[1];
  assert.match(landscape, /\.course-workspace-toolbar,\s*\.course-brand-footer,\s*\.mobile-course-footer \{\s*display: none !important;/);
  const {ctx,nodes} = fixture();
  delete nodes.courseWorkspaceToolbar;
  assert.doesNotThrow(() => ctx.syncCourseWorkspaceLayout(), 'An unavailable host never prevents the lesson selector from rendering');
});
