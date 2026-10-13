// Run against eo-normal-audit-server.py, which uses an isolated temporary database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const modules = process.env.DS_QA_NODE_MODULES;
const {chromium} = require(modules ? path.join(modules, 'playwright') : 'playwright');
const sharp = require(modules ? path.join(modules, 'sharp') : 'sharp');
const BASE = 'http://127.0.0.1:8793';
const A = 'zadania/kurs/eo/test_lekcje_1_6/test_lekcje_1_6.json';
const B = 'zadania/kurs/eo/test_lekcje_1_6_b/test_lekcje_1_6_b.json';
const aTasks = JSON.parse(fs.readFileSync(A));
const bTasks = JSON.parse(fs.readFileSync(B));
const OUT = 'tmp/pdfs/eo_test_b_audit';
fs.mkdirSync(OUT, {recursive: true});
const errors = [];
const cases = [];
const bButton = page => page.locator('.source-btn').filter({hasText: 'wersja B'});

async function login(browser, number, score, viewport = {width:1440, height:1000}) {
  const context = await browser.newContext({viewport});
  if(number) await context.request.post(BASE + `/__audit/reset/${number}`);
  const response = await context.request.post(BASE + '/api/auth/login', {data:{
    email: number ? `eo-audit-${number}@example.test` : 'eo-admin@example.test',
    password: 'local-audit-password'
  }});
  assert(response.ok(), await response.text());
  const {token, user} = await response.json();
  if(score !== null && number) {
    for(const task of aTasks) {
      const correct = score === 'high' || score === 'low' && !['12','13'].includes(task.taskNumber);
      const saved = await context.request.post(BASE + '/api/progress', {headers:{Authorization:`Bearer ${token}`}, data:{
        task_id:`${A}:${task.file}`, source_id:A, file:task.file, result:correct ? 'good' : 'bad',
        category:'kurs', max_points:task.maxPoints, earned_points:correct ? task.maxPoints : 0,
        submitted_answer:correct ? String(task.answer) : 'audit incorrect'
      }});
      assert(saved.ok(), await saved.text());
    }
  }
  await context.addInitScript(({token,user}) => {
    window.DS_API_BASE_URL = window.location.origin;
    localStorage.setItem('deltaSigmaAuthToken', token);
    localStorage.setItem(`deltaSigmaPrivacyPolicyAccepted:${user.email}`, 'yes');
  }, {token,user});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(BASE + '/zadania.html', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !isTaskLoading && currentTask);
  if(!number) {
    await page.locator('.level-btn[data-level="egzamin_osmoklasisty"]').click();
    await page.waitForFunction(() => selectedLevel === 'egzamin_osmoklasisty' && !isTaskLoading);
  }
  await page.locator('[data-category="testy"]').click();
  await page.locator('#testSelectionEmpty').waitFor({state:'visible'});
  return {context,page,token};
}

async function start(page) {
  if(await page.locator('#homeworkSummaryOverlay').isVisible()) {
    await page.locator('#homeworkSummaryClose').click();
  }
  await bButton(page).click();
  await page.locator('#testStartDialog').waitFor({state:'visible'});
  assert.match(await page.locator('#testStartWarning').innerText(), /60 minut/);
  assert.equal(await page.evaluate(source => storedTestDeadline(source), B), 0);
  await page.locator('#testStartConfirm').click();
  await page.waitForFunction(source => selectedSource === source && currentTask?.sourceId === source && !isTaskLoading, B);
  const remaining = await page.evaluate(source => storedTestDeadline(source) - Date.now(), B);
  assert(remaining > 3590000 && remaining <= 3600000, remaining);
}

async function draw(page, number) {
  await page.evaluate(number => selectCoursePartTask('praca_domowa', `${number}.webp`), number);
  await page.waitForFunction(number => !isTaskLoading && currentTask?.file === `${number}.webp` &&
    document.getElementById('taskImage').complete && document.getElementById('taskImage').naturalWidth > 0 &&
    Number(getComputedStyle(document.getElementById('taskImage')).opacity) === 1, number);
}

async function submit(page, task, answer = task.answer) {
  if(task.type === 'closed') await page.locator(`#mcq button[data-value="${answer}"]`).click();
  else if(task.type === 'true_false') {
    for(const [index,value] of answer.entries()) {
      await page.locator(`#mcq button[data-index="${index}"][data-value="${value}"]`).click();
    }
  } else {
    await page.locator('#mcq input[data-index="0"]').fill(String(answer));
    await page.locator('#mcq button[type="submit"]').click();
  }
  await page.waitForFunction(() => pendingProgressSaveRequests.size === 0 && currentTaskAnswered);
}

async function main() {
  const browser = await chromium.launch({headless:true});
  try {
    for(const [number,score,expected] of [[9,null,false], [10,'high',false], [11,'zero',true]]) {
      const {context,page} = await login(browser,number,score);
      assert.equal(await bButton(page).count(), Number(expected), `${score} A score`);
      if(!expected) {
        await page.evaluate(source => setSource(source), B);
        assert.notEqual(await page.evaluate(() => selectedSource), B, 'Hidden B cannot be selected directly');
      }
      cases.push(`visibility: ${score ?? 'unfinished'} A`);
      console.log(`Checked visibility: ${score ?? 'unfinished'} A`);
      await context.close();
    }
    {
      const {context,page,token} = await login(browser,12,'low');
      await start(page);
      for(const task of bTasks) {
        await draw(page, task.taskNumber);
        for(const id of ['hintButton','taskVideoLink','reviewButton','skipButton','gradingButton','answerButton']) {
          assert.equal(await page.locator('#'+id).isVisible(), false, id);
        }
        const pixels = await page.locator('#taskImage').evaluate(async image => {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d'); context.drawImage(image,0,0);
          const hash = await crypto.subtle.digest('SHA-256', context.getImageData(0,0,canvas.width,canvas.height).data);
          return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,'0')).join('');
        });
        const expected = await sharp(path.join(path.dirname(B),task.file)).ensureAlpha().raw().toBuffer();
        assert.equal(pixels, crypto.createHash('sha256').update(expected).digest('hex'), task.file);
        if(task.type === 'input') {
          assert.equal(await page.locator('#mcq input').count(), 1);
          await page.locator('#mcq button[type="submit"]').click();
          assert.equal(await page.evaluate(() => currentTaskAnswered), false, 'Blank answers do not complete a task');
        }
        if(task.taskNumber === '3') await page.screenshot({path:OUT+'/chart-desktop.png', fullPage:true});
        const alternate = {'11':'9;0;6;3','12':'2 100,00 PLN','13':'22/34','15':'sqrt(400)'};
        await submit(page, task, alternate[task.taskNumber] ?? task.answer);
        assert.equal(await page.evaluate(() => getTaskScore(currentTask).earnedPoints), task.maxPoints, task.file);
      }
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      assert.equal(await page.locator('#testSummaryPercent').innerText(), '100%');
      assert.deepEqual(await page.evaluate(() => {
        const summary = calculateSourceSummary(); return [summary.earnedPoints,summary.totalPoints,summary.scoredTasks];
      }), [18,18,15]);
      await page.screenshot({path:OUT+'/completed-desktop.png',fullPage:true});
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      assert.equal(await page.locator('#testSummaryPercent').innerText(), '100%');
      assert.equal(await page.locator('#testStartDialog').isVisible(), false);
      await page.locator('#homeworkSummaryClose').click();
      assert.equal(await bButton(page).count(),1, 'B result never replaces the prerequisite A score');
      assert.equal(await page.locator('.source-btn').filter({hasText:'Test C'}).count(),0);
      assert.equal(await page.evaluate(() => getCourseSourceSequence(selectedLevel)
        .some(source => source.label === 'Lekcja 7' && isCourseSourceVisible(source))),true);
      const progress = await context.request.get(BASE+'/api/progress/me',{headers:{Authorization:`Bearer ${token}`}});
      assert(progress.ok());
      cases.push('all 15 tasks: exact WebP pixels, 18 points, fields, confirmation, server save, reload and independent results');
      await context.close();
    }
    {
      const {context,page} = await login(browser,13,'zero',{width:375,height:812});
      await start(page);
      await draw(page,3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
      await page.screenshot({path:OUT+'/chart-mobile.png', fullPage:true});
      await draw(page,11);
      await submit(page,bTasks[10],'1;2');
      assert.equal(await page.locator('#answer').isVisible(),true);
      assert.match(await page.locator('#answer').innerText(), /\{0,3,6,9\}/);
      await page.screenshot({path:OUT+'/incorrect-set-mobile.png',fullPage:true});
      await draw(page,12);
      await submit(page,bTasks[11],'420');
      assert.equal(await page.evaluate(() => getTaskScore(currentTask).earnedPoints),0);
      await page.evaluate(source => localStorage.setItem(testTimerStorageKey(source),String(Date.now()-1000)), B);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      assert.equal(await page.locator('#testSummaryPercent').innerText(),'0%');
      assert.equal(await page.locator('#testSummaryTime').innerText(),'60:00');
      assert.equal(await page.evaluate(source=>isHomeworkCompleteOnServer(source),B),true);
      await page.screenshot({path:OUT+'/expired-mobile.png',fullPage:true});
      cases.push('mobile: layout, wrong set/cost correction, expiration saves unanswered tasks and finishes test');
      await context.close();
    }
    {
      const {context,page} = await login(browser,null,null);
      assert.equal(await bButton(page).count(),1);
      await bButton(page).click();
      await page.waitForFunction(source => selectedSource === source && currentTask?.sourceId === source && !isTaskLoading, B);
      assert.equal(await page.locator('#testStartDialog').isVisible(),false,'Admin preview does not start a student timer');
      await draw(page,11);
      assert.equal(await page.locator('#mcq input').count(),1);
      cases.push('admin preview: B and its result fields are available without score gating');
      await context.close();
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:cases, pageErrors:errors, screenshots:OUT},null,2));
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
