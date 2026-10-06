const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const modules = process.env.DS_QA_NODE_MODULES;
const {chromium} = require(modules ? path.join(modules, 'playwright') : 'playwright');
const sharp = require(modules ? path.join(modules, 'sharp') : 'sharp');
const BASE = 'http://127.0.0.1:8793';
const SOURCE = 'zadania/kurs/eo/test_lekcje_1_6/test_lekcje_1_6.json';
const tasks = JSON.parse(fs.readFileSync(SOURCE));
const answerVariants = JSON.parse(fs.readFileSync('tests/fixtures/eo-normal-answer-variants.json'));
const alternateCorrect = {'11':'8,0','12':'12 240,00 PLN','13':'−1:20','15':'7√8'};
const results = [];
const errors = [];
const limitations = [];
const OUT = 'tmp/pdfs/eo_normal_audit/browser';
fs.mkdirSync(OUT, {recursive: true});

async function login(browser, number, viewport = {width: 1440, height: 1000}, reset = true) {
  const context = await browser.newContext({viewport});
  if(number && reset) await context.request.post(BASE + `/__audit/reset/${number}`);
  const response = await context.request.post(BASE + '/api/auth/login', {
    data: {email: number ? `eo-audit-${number}@example.test` : 'eo-admin@example.test', password: 'local-audit-password'}
  });
  assert(response.ok(), await response.text());
  const {token, user} = await response.json();
  await context.addInitScript(({token, user, base}) => {
    window.DS_API_BASE_URL = base;
    localStorage.setItem('deltaSigmaAuthToken', token);
    localStorage.setItem(`deltaSigmaPrivacyPolicyAccepted:${user.email}`, 'yes');
  }, {token, user, base: BASE});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(BASE + '/zadania.html', {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => !document.querySelector('.task-card').classList.contains('source-load-pending')).catch(async error => {
    console.log(JSON.stringify({errors, status: await page.locator('#sourceLoadStatus').innerText(), url: page.url()}));
    await page.screenshot({path: OUT + '/startup-error.png', fullPage:true});
    throw error;
  });
  await page.waitForFunction(() => (!isTaskLoading && currentTask) || document.getElementById('testStartDialog')?.open);
  return {context, page, token, user};
}

async function start(page) {
  await page.locator('.source-btn').filter({hasText: 'Test sprawdzający z lekcji 1 - 6'}).click();
  await page.locator('#testStartDialog').waitFor({state: 'visible'});
  assert.match(await page.locator('#testStartWarning').innerText(), /60 minut/);
  await page.locator('#testStartConfirm').click();
  await page.waitForFunction(source => selectedSource === source && !isTaskLoading && currentTask?.sourceId === source, SOURCE);
}

async function draw(page, number) {
  await page.evaluate(number => selectCoursePartTask('praca_domowa', `${number}.png`), number);
  await page.waitForFunction(number => !isTaskLoading && currentTask?.file === `${number}.png`, number);
  await page.waitForFunction(() => document.querySelector('#taskImage').complete && Number(getComputedStyle(document.querySelector('#taskImage')).opacity) === 1);
}

async function submit(page, task, answer = task.answer) {
  if(task.type === 'closed') await page.locator(`#mcq button[data-value="${answer}"]`).click();
  else if(task.type === 'true_false') {
    for(let index = 0; index < answer.length; index++) {
      if(await page.evaluate(({index,answer})=>trueFalseSelection[index]===answer,{index,answer:answer[index]})) continue;
      await page.locator(`#mcq button[data-index="${index}"][data-value="${answer[index]}"]`).click();
    }
  } else {
    await page.locator('#mcq input[data-index="0"]').fill(String(answer));
    await page.locator('#mcq button[type="submit"]').click();
  }
  await page.waitForFunction(() => pendingProgressSaveRequests.size === 0 && currentTaskAnswered).catch(async error=>{
    console.log(JSON.stringify({errors,task:task.taskNumber,ui:await page.locator('#mcq').innerText(),answer:await page.locator('#answer').innerText(),state:await page.evaluate(()=>({currentTaskAnswered,isTaskLoading,pending:pendingProgressSaveRequests.size,failed:failedProgressSaves.size}))}));
    await page.screenshot({path:OUT+'/submission-error.png',fullPage:true});
    throw error;
  });
}

async function main() {
  const browser = await chromium.launch({headless: true});
  try {
    {
      const {context, page} = await login(browser, 2);
      await page.locator('.source-btn').filter({hasText:'Test sprawdzający z lekcji 1 - 6'}).click();
      await page.locator('#testStartDialog').waitFor({state:'visible'});
      assert.equal(await page.evaluate(source => storedTestDeadline(source), SOURCE), 0);
      await page.locator('#testStartCancel').click();
      assert.equal(await page.evaluate(source => storedTestDeadline(source), SOURCE), 0);
      results.push({case:'start-cancellation', passed:true});
      await start(page);
      const deadline = await page.evaluate(source => storedTestDeadline(source), SOURCE);
      for(const task of tasks) {
        await draw(page, task.taskNumber);
        const actual = await page.locator('#taskImage').evaluate(image => ({width:image.naturalWidth,height:image.naturalHeight}));
        const canonical = await sharp(path.join(path.dirname(SOURCE), task.file)).metadata();
        assert.deepEqual(actual, {width:canonical.width,height:canonical.height});
        const renderedDigest = await page.locator('#taskImage').evaluate(async image => {
          const canvas=document.createElement('canvas');
          canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
          const context=canvas.getContext('2d');context.drawImage(image,0,0);
          const bytes=context.getImageData(0,0,canvas.width,canvas.height).data;
          const digest=await crypto.subtle.digest('SHA-256',bytes);
          return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
        });
        const canonicalPixels = await sharp(path.join(path.dirname(SOURCE),task.file)).ensureAlpha().raw().toBuffer();
        assert.equal(renderedDigest,crypto.createHash('sha256').update(canonicalPixels).digest('hex'),`Actual rendered pixels ${task.file}`);
        if(task.type === 'input') {
          assert.equal(await page.locator('#taskInstruction').isVisible(), false);
          await page.locator('#mcq button[type="submit"]').click();
          assert.equal(await page.evaluate(() => currentTaskAnswered), false, 'A blank form cannot save an attempt');
        }
        if(task.type === 'true_false') {
          await page.locator(`#mcq button[data-index="0"][data-value="${task.answer[0]}"]`).click();
          assert.equal(await page.evaluate(() => currentTaskAnswered), false, 'Both P/F statements must be answered before grading');
        }
        if(task.taskNumber === '13') {
          await page.locator('#mcq input[data-index="0"]').fill('sqrt(');
          await page.locator('#mcq button[type="submit"]').click();
          assert.equal(await page.evaluate(() => currentTaskAnswered),false,'Invalid math syntax cannot silently finish a task');
        }
        for(const id of ['hintButton','taskVideoLink','reviewButton','skipButton','gradingButton','answerButton']) {
          assert.equal(await page.locator('#'+id).isVisible(),false,id);
        }
        await submit(page, task, alternateCorrect[task.taskNumber] ?? task.answer);
        const score = await page.evaluate(() => ({score:getTaskScore(currentTask),field:getInputFields(currentTask)[0],saved:getSavedProgressItem(currentTask),answer:sessionSubmittedAnswers.get(getTaskKey(currentTask))}));
        assert.equal(score.score.earnedPoints, task.maxPoints, JSON.stringify({task:task.taskNumber,...score}));
      }
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      assert.equal(await page.locator('#homeworkSummaryPercent').innerText(),'100%');
      assert.deepEqual(await page.evaluate(() => {
        const s=calculateSourceSummary(); return [s.earnedPoints,s.totalPoints,s.scoredTasks];
      }),[18,18,15]);
      assert.equal(await page.evaluate(source => isHomeworkCompleteOnServer(source),SOURCE),true);
      await page.locator('#homeworkSummaryClose').click();
      assert.equal(await page.locator('.source-btn').filter({hasText:'Test trudniejszy z lekcji 1 - 6'}).count(),1);
      assert.equal(await page.locator('.source-btn').filter({hasText:'Lekcja 7'}).count(),1);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      assert.equal(await page.locator('#testStartDialog').isVisible(),false);
      assert.equal(await page.locator('#homeworkSummaryPercent').innerText(),'100%');
      assert.equal(await page.evaluate(source => storedTestDeadline(source),SOURCE),deadline);
      await page.screenshot({path:OUT+'/completed-desktop.png',fullPage:true});
      results.push({case:'15 correct tasks / exact fetched PNGs / 18 points / auto summary / reload / unlocks',passed:true});
      await context.close();
    }
    {
      const {context,page}=await login(browser,3);
      await start(page);
      for(const task of tasks) {
        await draw(page,task.taskNumber);
        const incorrect = task.type === 'closed' ? task.options.find(answer=>answer!==task.answer)
          :task.type === 'true_false' ? task.answer.map(answer=>answer==='P'?'F':'P') :'999';
        await submit(page,task,incorrect);
        if(task.type === 'input') {
          assert.equal(await page.locator('#answer').isVisible(),true,'Numeric correction is visible in test mode');
          assert.match(await page.locator('#answer').innerText(),/Twoja odpowiedź:[\s\S]*Poprawna odpowiedź:/);
        }
        if(task.taskNumber==='2') {
          await draw(page,1); await draw(page,2);
          assert.equal(await page.locator('#mcq button.wrong').count(),1,'The wrong choice survives navigation');
        }
      }
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      assert.equal(await page.locator('#homeworkSummaryPercent').innerText(),'0%');
      await page.locator('#homeworkSummaryClose').click();
      assert.equal(await page.locator('.source-btn').filter({hasText:'Test trudniejszy z lekcji 1 - 6'}).count(),0);
      assert.equal(await page.locator('.source-btn').filter({hasText:'Lekcja 7'}).count(),1);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      await page.locator('#homeworkSummaryClose').click();
      await draw(page,2);
      assert.equal(await page.locator('#mcq button.wrong').count(),1);
      await draw(page,3);
      assert.equal(await page.locator('#mcq button.wrong').count(),2,'Both incorrect P/F choices survive reload');
      await draw(page,15);
      assert.equal(await page.locator('#mcq input').inputValue(),'999');
      assert.equal(await page.locator('#answer').isVisible(),true);
      await page.screenshot({path:OUT+'/incorrect-input-desktop.png',fullPage:true});
      results.push({case:'15 incorrect tasks / zero points / stored wrong choices / input corrections / no harder test',passed:true});
      await context.close();
    }
    {
      const {context,page}=await login(browser,4);
      await start(page);
      const variants=await page.evaluate(({source,cases})=>{
        const sourceTasks=tasks.filter(t=>t.sourceId===source);
        return Object.entries(cases).flatMap(([n,answers])=>{
          const field=getInputFields(sourceTasks.find(t=>t.taskNumber===n))[0];
          return [['correct',true],['incorrect',false]].flatMap(([group,expected])=>
            answers[group].map(answer=>({n,answer,expected,actual:isInputFieldAnswerCorrect(answer,field)})));
        });
      },{source:SOURCE,cases:answerVariants});
      for(const variant of variants)assert.equal(variant.actual,variant.expected,JSON.stringify(variant));
      await submit(page,tasks[0]);
      const deadline = await page.evaluate(source=>storedTestDeadline(source),SOURCE);
      await draw(page,2); await draw(page,1);
      assert.equal(await page.evaluate(source=>storedTestDeadline(source),SOURCE),deadline);
      await page.evaluate(source=>localStorage.setItem(testTimerStorageKey(source),String(Date.now()-1000)),SOURCE);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      assert.match(await page.locator('#homeworkSummaryTitle').innerText(),/czas minął/);
      assert.equal(await page.locator('#homeworkSummaryPercent').innerText(),'6%');
      assert.deepEqual(await page.evaluate(()=>{const s=calculateSourceSummary();return[s.earnedPoints,s.totalPoints,s.scoredTasks]}),[1,18,15]);
      await page.locator('#homeworkSummaryClose').click();
      assert.equal(await page.locator('.source-btn').filter({hasText:'Lekcja 7'}).count(),1);
      const before=await page.evaluate(()=>savedProgress.filter(p=>p.source_id===selectedSource).length);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>savedProgress.filter(p=>p.source_id===selectedSource).length),before);
      results.push({case:`${variants.length} answer variants / timer continuity / timeout saves 14 zero results / reload is idempotent`,passed:true});
      await context.close();
    }
    {
      const {context,page}=await login(browser,5);
      await start(page);
      let fail=true;
      await page.route('**/api/progress',async route=>{
        if(fail) await route.fulfill({status:503,contentType:'application/json',body:'{"error":"Simulated local audit failure"}'});
        else await route.continue();
      });
      await submit(page,tasks[0]);
      await page.locator('#progressSaveStatus').waitFor({state:'visible'});
      assert.equal(await page.evaluate(source=>isHomeworkCompleteOnServer(source),SOURCE),false);
      fail=false;
      await page.locator('#progressSaveRetry').click();
      await page.locator('#progressSaveStatus').waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>getSavedProgressItem(currentTask)?.earned_points),1);
      for(const task of tasks.slice(1)){await draw(page,task.taskNumber);await submit(page,task);}
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      assert.equal(await page.locator('#homeworkSummaryPercent').innerText(),'100%');
      results.push({case:'network failure visible / retry preserves answer / full test result confirmed by server',passed:true});
      await context.close();
    }
    {
      const {context,page}=await login(browser,6,{width:390,height:844});
      await start(page);
      for(const number of [3,11,12,13,15]) {
        await draw(page,number);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'No mobile horizontal overflow');
        await page.screenshot({path:OUT+`/mobile-${number}.png`,fullPage:true});
      }
      await page.setViewportSize({width:844,height:390});
      await draw(page,13);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
      assert(await page.locator('#progress .tile').first().evaluate(tile=>tile.getBoundingClientRect().right<=innerWidth),'The landscape task navigator starts with a visible task, not a full-width label');
      await page.screenshot({path:OUT+'/mobile-landscape.png',fullPage:true});
      results.push({case:'mobile portrait and landscape / all types / no horizontal overflow',passed:true});
      await context.close();
    }
    {
      const {context,page}=await login(browser,7);
      await start(page);
      for(const task of tasks.slice(0,-1)){await draw(page,task.taskNumber);await submit(page,task);}
      await page.route('**/api/progress',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Simulated final save failure"}'}));
      await draw(page,15);await submit(page,tasks.at(-1));
      assert.equal(await page.locator('#homeworkSummaryOverlay').isVisible(),false,'A failed final save cannot show a completed test');
      assert.equal(await page.locator('.source-btn').filter({hasText:'Lekcja 7'}).count(),0,'A failed final save cannot unlock material');
      await page.locator('#progressSaveStatus').waitFor({state:'visible'});
      await page.unroute('**/api/progress');
      await page.locator('#progressSaveRetry').click();
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      assert.equal(await page.locator('#homeworkSummaryPercent').innerText(),'100%');
      await page.locator('#homeworkSummaryClose').click();
      assert.equal(await page.locator('.source-btn').filter({hasText:'Lekcja 7'}).count(),1);
      results.push({case:'last answer save failure blocks summary/unlock until successful retry',passed:true});
      await context.close();
    }
    {
      const {context,page}=await login(browser,8);
      await start(page);
      let posts=0;
      await page.route('**/api/progress',async route=>{
        posts++;
        await route.fetch();
        await route.fulfill({status:503,contentType:'application/json',body:'{"error":"Simulated lost successful response"}'});
      });
      await submit(page,tasks[0]);
      await page.locator('#progressSaveStatus').waitFor({state:'visible'});
      await page.locator('#progressSaveRetry').click();
      await page.locator('#progressSaveStatus').waitFor({state:'hidden'});
      assert.equal(posts,1,'Retry checks a confirmed server result rather than duplicating it');
      assert.equal(await page.evaluate(()=>savedProgress.filter(p=>p.source_id===selectedSource).length),1);
      results.push({case:'lost response after successful save does not duplicate answers/attempts',passed:true});
      await context.close();
    }
    {
      const {context,page}=await login(browser,9);
      await start(page);
      await page.route('**/api/progress',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Simulated offline deadline"}'}));
      await submit(page,tasks[0]);
      await page.evaluate(source=>{
        localStorage.setItem(testTimerStorageKey(source),String(Date.now()-1000));
        updateTimer();
      },SOURCE);
      await page.waitForFunction(()=>testFinalizationPromises.size===0);
      assert.equal(await page.locator('#homeworkSummaryOverlay').isVisible(),false);
      assert.equal(await page.evaluate(()=>sessionResults.get(getTaskKey(currentTask))),'good','A timeout cannot overwrite an unsaved correct answer');
      await page.unroute('**/api/progress');
      await page.locator('#progressSaveRetry').click();
      await page.locator('#homeworkSummaryOverlay').waitFor({state:'visible'});
      assert.deepEqual(await page.evaluate(()=>{const s=calculateSourceSummary();return[s.earnedPoints,s.totalPoints,s.scoredTasks]}),[1,18,15]);
      results.push({case:'timeout during save outage preserves the correct unsaved answer and finalizes after retry',passed:true});
      await context.close();
    }
    {
      const {context,page}=await login(browser,0);
      await page.locator('.source-btn').filter({hasText:'Test sprawdzający z lekcji 1 - 6'}).click();
      await page.waitForFunction(source=>selectedSource===source && !isTaskLoading,SOURCE);
      assert.equal(await page.locator('#testStartDialog').isVisible(),false,'Admin preview needs no timed attempt');
      assert.equal(await page.evaluate(()=>testRemainingSeconds(currentTask)),null);
      assert.equal(await page.locator('#timer').isVisible(),false);
      await draw(page,15);
      assert.equal(await page.evaluate(()=>loggedUser.role),'admin');
      results.push({case:'admin has all test tasks without the student start dialog or countdown',passed:true});
      await context.close();
    }
    {
      const first=await login(browser,10);
      await start(first.page);
      await submit(first.page,tasks[0]);
      await first.page.evaluate(source=>localStorage.setItem(testTimerStorageKey(source),String(Date.now()+10*60*1000)),SOURCE);
      const second=await login(browser,10,{width:1440,height:1000},false);
      assert.equal(await second.page.evaluate(source=>storedTestDeadline(source),SOURCE),0);
      if(!await second.page.locator('#testStartDialog').isVisible()) {
        await second.page.locator('.source-btn').filter({hasText:'Test sprawdzający z lekcji 1 - 6'}).click();
      }
      await second.page.locator('#testStartDialog').waitFor({state:'visible'});
      limitations.push('Confirmed: the same incomplete test on another browser starts without its original deadline; timing is stored locally, not on the server.');
      await second.page.locator('#testStartCancel').click();
      await first.context.close();await second.context.close();
    }
    assert.deepEqual(errors,[],'No browser JavaScript errors');
    console.log(JSON.stringify({results, errors, limitations}, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
