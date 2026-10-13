// Uses the local eo-normal-audit-server.py with isolated accounts and database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = process.env.DS_QA_NODE_MODULES;
const {chromium} = require(modules ? path.join(modules, 'playwright') : 'playwright');
const BASE = 'http://127.0.0.1:8793';
const OUT = 'tmp/training-levels-audit';

async function login(browser, email) {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const response = await context.request.post(BASE + '/api/auth/login', {
    data: {email, password: 'local-audit-password'}
  });
  assert(response.ok(), await response.text());
  const {token, user} = await response.json();
  await context.addInitScript(({token, email}) => {
    localStorage.setItem('deltaSigmaAuthToken', token);
    localStorage.setItem(`deltaSigmaPrivacyPolicyAccepted:${email}`, 'yes');
  }, {token, email: user.email});
  return context;
}

async function tileStyle(page) {
  return page.locator('#sourceList .source-btn:not(.active):not(.complete)').first().evaluate(button => {
    const style = getComputedStyle(button);
    const label = getComputedStyle(button.querySelector('span'));
    return {background: style.backgroundColor, border: style.borderColor,
      radius: style.borderRadius, padding: style.padding, height: style.minHeight,
      align: style.textAlign, font: label.fontSize};
  });
}

async function checkTrainingLayout(page, filename) {
  const buttons = await page.locator('#levelTabs button').evaluateAll(elements => elements.map(element => {
    const bounds = element.getBoundingClientRect();
    return {left: bounds.left, right: bounds.right, top: bounds.top,
      fits: element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight};
  }));
  assert.equal(buttons.length, 3);
  assert(buttons.every(button => button.left >= 0 && button.right <= page.viewportSize().width && button.fits));
  assert.equal(new Set(buttons.map(button => button.top)).size, 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({path: `${OUT}/${filename}.png`, fullPage: true});
}

async function main() {
  fs.mkdirSync(OUT, {recursive: true});
  const browser = await chromium.launch({headless: true});
  const errors = [];
  try {
    const admin = await login(browser, 'eo-admin@example.test');
    const page = await admin.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(BASE + '/zadania.html?category=testy', {waitUntil: 'domcontentloaded'});
    await page.locator('#testSelectionEmpty').waitFor({state: 'visible'});
    await page.locator('.level-btn[data-level="egzamin_osmoklasisty"]').click();
    await page.waitForFunction(() => selectedLevel === 'egzamin_osmoklasisty' && !isTaskLoading);
    for (const [width, height, filename] of [[1440, 1000, 'tests-desktop'], [390, 844, 'tests-mobile']]) {
      await page.setViewportSize({width, height});
      const bounds = await page.locator('#sourceList .source-btn').evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect();
        return {left: rect.left, right: rect.right, top: rect.top, width: rect.width,
          fits: button.scrollWidth <= button.clientWidth};
      }));
      assert.equal(bounds.length, 3);
      assert.equal(new Set(bounds.map(button => button.top)).size, 1, 'A/B/C share a row');
      assert(Math.max(...bounds.map(button => button.width)) - Math.min(...bounds.map(button => button.width)) < 1);
      assert(bounds.every(button => button.fits && button.left >= 0 && button.right <= width));
      const testsStyle = await tileStyle(page);
      await page.screenshot({path: `${OUT}/${filename}.png`, fullPage: true});
      await page.locator('[data-category="egzaminy"]').click();
      await page.waitForFunction(() => selectedCategory === 'egzaminy' && !isTaskLoading);
      assert.deepEqual(testsStyle, await tileStyle(page), 'Tests have the same base style as exams');
      await page.locator('[data-category="testy"]').click();
      await page.locator('#testSelectionEmpty').waitFor({state: 'visible'});
    }
    await page.setViewportSize({width: 1440, height: 1000});
    await page.locator('[data-category="kurs"]').click();
    await page.locator('.level-btn[data-level="matura_podstawowa"]').click();
    await page.waitForFunction(() => selectedLevel === 'matura_podstawowa' && !isTaskLoading);
    assert.equal(new URL(await page.locator('#trainingLink').getAttribute('href'), BASE).searchParams.get('level'), 'matura_podstawowa');
    await page.locator('#trainingLink').click();
    await page.waitForURL('**/trening.html?**');
    await page.waitForFunction(() => typeof trainingUser !== 'undefined' && trainingUser?.role === 'admin' && state.level === 'mp');
    assert(await page.evaluate(() => generatorPool().every(generator => generator.level === 'mp')));
    await checkTrainingLayout(page, 'training-mp-desktop');
    await page.locator('#levelTabs button[data-level="mr"]').click();
    await page.waitForFunction(() => state.level === 'mr' && state.topic === 'all');
    await page.locator('#startButton').click();
    await page.waitForFunction(() => state.running && !state.starting && state.currentTask && state.attemptToken);
    assert(await page.evaluate(() => generatorPool().every(generator => generator.level === 'mr')));
    assert(await page.locator('#problemText').innerText());
    await page.locator('#levelTabs button[data-level="eo"]').click();
    assert.deepEqual(await page.evaluate(() => [state.level, state.running, state.currentTask, state.timerId]), ['eo', false, null, null]);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => trainingUser?.role === 'admin');
    assert.equal(await page.evaluate(() => state.level), 'eo');
    await page.setViewportSize({width: 390, height: 844});
    await page.locator('#trainingSettings').evaluate(details => {details.open = true;});
    await page.locator('#levelTabs button[data-level="mp"]').click();
    await checkTrainingLayout(page, 'training-mp-mobile');
    await admin.close();

    const student = await login(browser, 'eo-audit-8@example.test');
    const studentPage = await student.newPage();
    studentPage.on('pageerror', error => errors.push(error.message));
    await studentPage.goto(BASE + '/trening.html?level=mr', {waitUntil: 'domcontentloaded'});
    await studentPage.waitForFunction(() => trainingUser?.role === 'student');
    assert.equal(await studentPage.evaluate(() => state.level), 'eo');
    assert.equal(await studentPage.locator('#levelTabs button').count(), 0);
    assert.equal(await studentPage.locator('#levelTabs .level-locked-eo').count(), 1);
    await studentPage.evaluate(() => setTrainingLevel('mp'));
    assert.equal(await studentPage.evaluate(() => state.level), 'eo');
    await student.close();
    assert.deepEqual(errors, []);
    console.log('PASS: identical exam/test tiles, three equal columns, desktop/mobile; admin EO/MP/MR, level links, round reset, reload and unchanged student access');
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
