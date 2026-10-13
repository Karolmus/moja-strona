// Run against eo-normal-audit-server.py, which never uses production accounts or data.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const modules = process.env.DS_QA_NODE_MODULES;
const {chromium} = require(modules ? path.join(modules, 'playwright') : 'playwright');
const BASE = 'http://127.0.0.1:8793';
const A = 'zadania/kurs/eo/test_lekcje_1_6/test_lekcje_1_6.json';
const MP = 'zadania/kurs/mp/test_lekcje_1_6/test_lekcje_1_6.json';
const OUT = 'tmp/course-tests-section-audit';
const errors = [];

async function login(browser, number, viewport = {width:1440,height:1000}) {
  const context = await browser.newContext({viewport});
  if (number) await context.request.post(`${BASE}/__audit/reset/${number}`);
  const response = await context.request.post(BASE + '/api/auth/login', {data:{
    email:number ? `eo-audit-${number}@example.test` : 'eo-admin@example.test', password:'local-audit-password'
  }});
  assert(response.ok(), await response.text());
  const {token,user} = await response.json();
  await context.addInitScript(({token,email}) => {
    localStorage.setItem('deltaSigmaAuthToken',token);
    localStorage.setItem(`deltaSigmaPrivacyPolicyAccepted:${email}`,'yes');
  }, {token,email:user.email});
  return {context,token,user};
}

async function open(context, query = '') {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(BASE + '/zadania.html' + query, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !isTaskLoading &&
    (currentTask || document.querySelector('.task-card').classList.contains('test-selection-idle')) &&
    !document.querySelector('.source-load-pending'));
  return page;
}

async function seed(context, token, source, correct = true) {
  const tasks = JSON.parse(fs.readFileSync(source));
  for (const task of tasks.filter(task => ['praca_domowa','zadania_powtorkowe'].includes(task.coursePart))) {
    const response = await context.request.post(BASE + '/api/progress', {
      headers:{Authorization:`Bearer ${token}`}, data:{
        source_id:source, task_id:`${source}:${task.file}`, file:task.file, category:'kurs',
        result:correct ? 'good':'bad', max_points:task.maxPoints || 1,
        earned_points:correct ? task.maxPoints || 1 : 0
      }
    });
    assert(response.ok(), await response.text());
  }
}

async function checkLayout(page, name) {
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, {timeout:2000});
  await page.waitForFunction(() => {
    const active = document.querySelector('.category-btn.active');
    return active?.dataset.category === selectedCategory && getComputedStyle(active).backgroundColor === 'rgb(38, 53, 69)';
  });
  await page.screenshot({path:`${OUT}/${name}.png`,fullPage:true});
  const overflow = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,
    elements:[...document.querySelectorAll('body *')]
    .filter(element => {const rect=element.getBoundingClientRect();return rect.width && (rect.right > innerWidth || rect.left < 0);})
    .map(element => ({id:element.id,class:element.className,right:element.getBoundingClientRect().right,left:element.getBoundingClientRect().left})).slice(0,15)}));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, JSON.stringify(overflow));
  const bounds = await page.locator('.category-toggle .category-btn').evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect();
    return {x:rect.x,right:rect.right,y:rect.y,bottom:rect.bottom,
      fits:button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight};
  }));
  assert.equal(bounds.length,4);
  assert(bounds.every(button => button.fits), 'Every category label fits');
  for(let i=1;i<bounds.length;i++) assert(bounds[i].x >= bounds[i-1].right, 'Category buttons do not overlap');
}

async function main() {
  fs.mkdirSync(OUT,{recursive:true});
  const browser = await chromium.launch({headless:true});
  try {
    const {context,token} = await login(browser,1);
    const page = await open(context);
    assert.equal(await page.locator('#sourceList .test-source').count(),0,'Course contains only lessons');
    await page.locator('[data-category="testy"]').click();
    await page.locator('#testSelectionEmpty').waitFor({state:'visible'});
    assert.equal(await page.locator('#testStartDialog').isVisible(),false);
    assert.equal(await page.evaluate(source => storedTestDeadline(source),A),0);
    assert.equal(await page.locator('#sourceList .source-btn').count(),1);
    assert.equal(await page.locator('#taskImage').isVisible(),false);
    await checkLayout(page,'tests-desktop');
    await page.locator('#sourceList .test-source').click();
    await page.locator('#testStartDialog').waitFor({state:'visible'});
    await page.locator('#testStartCancel').click();
    assert.equal(await page.evaluate(source => storedTestDeadline(source),A),0);
    assert.equal(await page.locator('#testSelectionEmpty').isVisible(),true);
    await page.locator('#sourceList .test-source').click();
    await page.locator('#testStartConfirm').click();
    await page.waitForFunction(source => !isTaskLoading && currentTask?.sourceId === source,A);
    assert.equal(await page.evaluate(() => selectedCategory),'testy');
    assert.equal(await page.locator('[data-category="testy"]').getAttribute('aria-pressed'),'true');
    const deadline = await page.evaluate(source => storedTestDeadline(source),A);
    assert(deadline > Date.now());
    const task = await page.evaluate(() => ({answer:currentTask.answer,file:currentTask.file,maxPoints:currentTask.maxPoints}));
    await page.locator(`#mcq button[data-value="${task.answer}"]`).click();
    await page.waitForFunction(() => currentTaskAnswered && pendingProgressSaveRequests.size === 0);
    const progress = await context.request.get(BASE + '/api/progress/me',{headers:{Authorization:`Bearer ${token}`}});
    const saved = (await progress.json()).progress.find(item => item.source_id === A);
    assert.equal(saved.task_id,`${A}:${task.file}`,'Stored course task identity is preserved');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(source => !isTaskLoading && currentTask?.sourceId === source,A);
    assert.equal(await page.evaluate(() => selectedCategory),'testy');
    assert.equal(await page.evaluate(source => storedTestDeadline(source),A),deadline);
    await page.locator('[data-category="kurs"]').click();
    await page.waitForFunction(() => !isTaskLoading && selectedCategory === 'kurs');
    assert.equal(await page.locator('#sourceList .test-source').count(),0);
    await page.locator('[data-category="testy"]').click();
    await page.locator('#testSelectionEmpty').waitFor({state:'visible'});
    await page.locator('#sourceList .test-source').click();
    await page.waitForFunction(source => !isTaskLoading && currentTask?.sourceId === source,A);
    assert.equal(await page.locator('#testStartDialog').isVisible(),false);
    assert.equal(await page.evaluate(source => storedTestDeadline(source),A),deadline);
    await page.setViewportSize({width:390,height:844});
    await checkLayout(page,'active-test-mobile');
    await page.setViewportSize({width:844,height:390});
    await checkLayout(page,'active-test-landscape');
    await context.close();
    console.log('PASS: separate tabs, confirmation/cancellation, unchanged save, reload, running countdown and responsive layout');

    for (const [number,correct,optional] of [[2,true,'Test C'],[3,false,'Test B']]) {
      const {context,token} = await login(browser,number,{width:390,height:844});
      for (const lesson of [1,2,3,4,5,6]) {
        const dir = `zadania/kurs/eo/lekcja_${lesson}`;
        await seed(context,token,`${dir}/${fs.readdirSync(dir).find(file => file.endsWith('.json'))}`);
      }
      let page = await open(context);
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      await page.locator('#homeworkSummaryClose').click();
      assert.equal(await page.locator('#testCategoryBadge').innerText(),'1');
      assert.equal(await page.locator('#courseTestNotice').isVisible(),true);
      await page.locator('#courseTestNotice a').click();
      await page.locator('#testStartDialog').waitFor({state:'visible'});
      await page.locator('#testStartCancel').click();
      assert.equal(await page.evaluate(() => selectedCategory),'kurs');
      await page.close();
      await seed(context,token,A,correct);
      page = await open(context);
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      await page.locator('#homeworkSummaryClose').click();
      assert.equal(await page.locator('#testCategoryBadge').isVisible(),false);
      assert.equal(await page.locator('#sourceList .source-btn').filter({hasText:'Lekcja 7'}).count(),1);
      await page.locator('[data-category="testy"]').click();
      await page.locator('#testSelectionEmpty').waitFor({state:'visible'});
      assert.equal(await page.locator('#sourceList .test-source').filter({hasText:optional}).count(),1);
      assert.equal(await page.locator('#sourceList .test-source').count(),2);
      await checkLayout(page,correct ? 'tests-harder-mobile':'tests-B-mobile');
      await context.close();
    }
    console.log('PASS: due badge, notification, completed test unlocking course lessons and score-dependent optional tests');

    const {context:admin,token:adminToken} = await login(browser,null);
    const adminPage = await open(admin);
    await adminPage.locator('[data-category="testy"]').click();
    await adminPage.locator('#testSelectionEmpty').waitFor({state:'visible'});
    assert.equal(await adminPage.locator('#sourceList .test-source').count(),3);
    await adminPage.locator('#sourceList .test-source').filter({hasText:'Test B'}).click();
    await adminPage.waitForFunction(() => !isTaskLoading && currentTask?.activityType === 'test');
    assert.equal(await adminPage.locator('#testStartDialog').isVisible(),false,'Admin preview never starts a timer');
    assert.equal(await adminPage.locator('#timer').isVisible(),false);
    const {context:mp,user:mpUser} = await login(browser,14);
    const changed = await admin.request.patch(`${BASE}/api/admin/students/${mpUser.id}`,{
      headers:{Authorization:`Bearer ${adminToken}`},data:{level:'matura_podstawowa'}
    });
    assert(changed.ok(),await changed.text());
    const mpPage = await open(mp,'?category=testy');
    await mpPage.locator('#testSelectionEmpty').waitFor({state:'visible'});
    assert.equal(await mpPage.locator('#sourceList .test-source').count(),1);
    assert.equal(await mpPage.evaluate(() => getAvailableSources()[0].id),MP);
    await mpPage.locator('#sourceList .test-source').click();
    await mpPage.locator('#testStartDialog').waitFor({state:'visible'});
    await mpPage.locator('#testStartCancel').click();
    assert.equal(await mpPage.evaluate(source => storedTestDeadline(source),MP),0);
    await mp.close();
    await admin.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: admin preview, MP category deep link and assigned-course filtering; no page errors');
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
