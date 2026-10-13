// Run against eo-normal-audit-server.py, using its isolated temporary accounts and database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = process.env.DS_QA_NODE_MODULES;
const {chromium} = require(modules ? path.join(modules, 'playwright') : 'playwright');
const BASE = 'http://127.0.0.1:8793';
const OUT = 'tmp/eo-equivalent-answers-audit';
const cases = [
  [5, '2.png', ['0,4(09)'], true],
  [5, '3.png', ['-1 1/7'], true],
  [5, '10.png', ['\u22120,5'], true],
  [5, 'zd4.png', ['2/6'], true],
  [5, '17.png', ['58,00'], true],
  [5, '14.png', ['1.17', '0,(6)'], true],
  [6, '3.png', ['-3,(3)'], true],
  [6, 'zd11.png', ['6,(81)'], true],
  [6, 'zd11.png', ['486'], false],
  [6, 'zd7.png', ['3/10*V'], true],
  [6, '4.png', ['0,(6)p+4w+1'], true],
  [6, '13.png', ['2', 'Z obliczen otrzymalem ceny 15 zl i 30 zl.\n30 : 15 = 2, wiec cena normalna byla dwa razy wyzsza.'], 'pending']
];

async function main() {
  fs.mkdirSync(OUT, {recursive: true});
  const browser = await chromium.launch({headless: true});
  const errors = [];
  try {
    const admin = await browser.newContext();
    const response = await admin.request.post(BASE + '/api/auth/login', {
      data: {email: 'eo-admin@example.test', password: 'local-audit-password'}
    });
    assert(response.ok(), await response.text());
    const {token: adminToken} = await response.json();
    for (const [index, [number, file, values, correct]] of cases.entries()) {
      await admin.request.post(BASE + `/__audit/reset/${index + 1}`);
      const context = await browser.newContext({viewport: index === 7
        ? {width: 390, height: 844} : {width: 1440, height: 1000}});
      try {
        const login = await context.request.post(BASE + '/api/auth/login', {
          data: {email: `eo-audit-${index + 1}@example.test`, password: 'local-audit-password'}
        });
        assert(login.ok(), await login.text());
        const {token, user} = await login.json();
        const update = await admin.request.patch(BASE + `/api/admin/students/${user.id}`, {
          headers: {Authorization: `Bearer ${adminToken}`}, data: {full_course_access: true}
        });
        assert(update.ok(), await update.text());
        await context.addInitScript(({token, email}) => {
          localStorage.setItem('deltaSigmaAuthToken', token);
          localStorage.setItem(`deltaSigmaPrivacyPolicyAccepted:${email}`, 'yes');
        }, {token, email: user.email});
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(BASE + '/zadania.html', {waitUntil: 'domcontentloaded'});
        await page.waitForFunction(() => !isTaskLoading && currentTask);
        const dir = `zadania/kurs/eo/lekcja_${number}`;
        const manifest = fs.readdirSync(dir).find(file => file.endsWith('.json'));
        const source = `${dir}/${manifest}`;
        const task = JSON.parse(fs.readFileSync(source)).find(task => task.file === file);
        await page.evaluate(source => setSource(source), source);
        await page.evaluate(({part, file}) => selectCoursePartTask(part, file), {part: task.coursePart, file});
        await page.waitForFunction(file => !isTaskLoading && currentTask?.file === file, file);
        const fields = page.locator('#mcq input[data-index], #mcq textarea[data-index]');
        assert.equal(await fields.count(), values.length);
        for (const [field, value] of values.entries()) await fields.nth(field).fill(value);
        if (file === 'zd11.png' && correct) {
          assert.match(await page.locator('.math-input-preview').innerHTML(), /<mn>75<\/mn>/);
          assert.match(await page.locator('.math-input-preview').innerHTML(), /<mn>11<\/mn>/);
        }
        await page.locator('#mcq button[type="submit"]').click();
        await page.waitForFunction(() => currentTaskAnswered && pendingProgressSaveRequests.size === 0);
        const earned = await page.evaluate(() => getTaskScore(currentTask)?.earnedPoints ?? null);
        assert.equal(earned, correct === 'pending' ? null : correct ? task.maxPoints : 0);
        if (correct !== 'pending') assert.equal(await fields.first().evaluate(input => input.classList.contains('correct')), correct);
        if (index === 7 || index === 8 || correct === 'pending') {
          const screenshot = correct === 'pending' ? 'teacher-answer-desktop'
            : index === 7 ? 'periodic-mobile' : 'incorrect-desktop';
          await page.screenshot({path: `${OUT}/${screenshot}.png`, fullPage: true});
          await page.reload({waitUntil: 'domcontentloaded'});
          await page.waitForFunction(() => !isTaskLoading && currentTask);
          await page.evaluate(source => setSource(source), source);
          await page.evaluate(({part, file}) => selectCoursePartTask(part, file), {part: task.coursePart, file});
          await page.waitForFunction(file => !isTaskLoading && currentTask?.file === file && currentTaskAnswered, file);
          for (const [field, value] of values.entries()) {
            assert.equal(await fields.nth(field).inputValue(), value, 'Every submitted field survives reload');
          }
          assert.equal(await page.evaluate(() => getTaskScore(currentTask)?.earnedPoints ?? null),
            correct === 'pending' ? null : correct ? task.maxPoints : 0);
          if (correct === 'pending') {
            await page.setViewportSize({width: 390, height: 844});
            const bounds = await fields.evaluateAll(inputs => inputs.map(input => {
              const {left, right, top, bottom} = input.getBoundingClientRect();
              return {left, right, top, bottom};
            }));
            assert(bounds.every(input => input.left >= 0 && input.right <= 390));
            assert(bounds[1].top > bounds[0].bottom, 'Justification appears below numeric answer');
            await page.screenshot({path: `${OUT}/teacher-answer-mobile.png`, fullPage: true});
          }
        }
        console.log(`PASS: EO ${number} ${file}: ${values.join(' | ')} -> ${earned}`);
      } finally {
        await context.close();
      }
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${cases.length} real forms; syntax, grading, saving, reload, symbolic inputs and teacher review`);
    await admin.close();
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
