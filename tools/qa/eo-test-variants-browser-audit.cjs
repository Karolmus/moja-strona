// Uses eo-normal-audit-server.py and its isolated temporary accounts/database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = process.env.DS_QA_NODE_MODULES;
const {chromium} = require(modules ? path.join(modules, 'playwright') : 'playwright');
const BASE = 'http://127.0.0.1:8793';
const A = 'zadania/kurs/eo/test_lekcje_1_6/test_lekcje_1_6.json';
const B = 'zadania/kurs/eo/test_lekcje_1_6_b/test_lekcje_1_6_b.json';
const C = 'zadania/kurs/eo/test_lekcje_1_6_trudniejszy/test_lekcje_1_6_trudniejszy.json';
const tasks = JSON.parse(fs.readFileSync(A));
const OUT = 'tmp/eo-test-variants-audit';
const cases = [[null, ['A']], [0, ['A', 'B']], [14, ['A', 'B']],
  [15, ['A']], [16, ['A']], [17, ['A', 'C']], [18, ['A', 'C']]];

async function main() {
  fs.mkdirSync(OUT, {recursive: true});
  const browser = await chromium.launch({headless: true});
  const errors = [];
  try {
    for (const [index, [points, variants]] of cases.entries()) {
      const context = await browser.newContext({viewport: points === 17
        ? {width: 390, height: 844} : {width: 1440, height: 1000}});
      try {
        const reset = await context.request.post(BASE + `/__audit/reset/${index + 1}`);
        assert(reset.ok(), await reset.text());
        const login = await context.request.post(BASE + '/api/auth/login', {data: {
          email: `eo-audit-${index + 1}@example.test`, password: 'local-audit-password'
        }});
        assert(login.ok(), await login.text());
        const {token, user} = await login.json();
        if (points !== null) {
          let remaining = points;
          for (const task of tasks) {
            const earned = Math.min(remaining, task.maxPoints);
            remaining -= earned;
            const saved = await context.request.post(BASE + '/api/progress', {
              headers: {Authorization: `Bearer ${token}`}, data: {
                task_id: `${A}:${task.file}`, source_id: A, file: task.file, category: 'kurs',
                result: earned === task.maxPoints ? 'good' : earned ? 'medium' : 'bad',
                max_points: task.maxPoints, earned_points: earned, submitted_answer: 'Local audit'
              }
            });
            assert(saved.ok(), await saved.text());
          }
          assert.equal(remaining, 0);
        }
        await context.addInitScript(({token, email}) => {
          localStorage.setItem('deltaSigmaAuthToken', token);
          localStorage.setItem(`deltaSigmaPrivacyPolicyAccepted:${email}`, 'yes');
        }, {token, email: user.email});
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(BASE + '/zadania.html', {waitUntil: 'domcontentloaded'});
        await page.waitForFunction(() => !isTaskLoading && currentTask);
        await page.locator('[data-category="testy"]').click();
        await page.locator('#testSelectionEmpty').waitFor({state: 'visible'});
        const labels = await page.locator('#sourceList .source-btn > span').allTextContents();
        assert.deepEqual(labels, variants.map(variant => `Test ${variant}`));
        assert.equal(await page.locator('#testStartDialog').isVisible(), false);
        for (const [variant, source] of [['B', B], ['C', C]]) {
          if (!variants.includes(variant)) {
            await page.evaluate(source => setSource(source), source);
            assert.notEqual(await page.evaluate(() => selectedSource), source);
            assert.equal(await page.locator('#testStartDialog').isVisible(), false);
          }
        }
        if (points === 17) {
          await page.screenshot({path: `${OUT}/test-c-mobile.png`, fullPage: true});
          await page.locator('.source-btn').filter({hasText: 'Test C'}).click();
          await page.locator('#testStartDialog').waitFor({state: 'visible'});
          assert.match(await page.locator('#testStartWarning').innerText(), /60 minut/);
          const source = await page.evaluate(source => getSourceMetaById(source), C);
          assert.equal(source.optional, true);
          assert.equal(source.minScorePercent, 90);
        }
        console.log(`PASS: A ${points === null ? 'unfinished' : points + '/18'} -> ${labels.join(', ')}`);
      } finally {
        await context.close();
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: persisted A scores, B/C visibility, locked direct selection, optional C and mobile start confirmation');
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
