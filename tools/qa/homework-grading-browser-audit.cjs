// Isolated local database only. Never run this audit against production accounts.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(path.join(process.env.DS_QA_NODE_MODULES, 'playwright'));
const BASE = 'http://127.0.0.1:8793';
const SOURCE = 'zadania/kurs/mp/lekcja_5/lekcja_5_zadania_dowodowe.json';
const OUT = 'tmp/homework-grading-audit';
const errors = [];

async function auth(context, email){
    const response = await context.request.post(BASE + '/api/auth/login', {
        data:{email, password:'local-audit-password'}
    });
    assert(response.ok(), await response.text());
    const data = await response.json();
    await context.addInitScript(({token, user}) => {
        localStorage.setItem('deltaSigmaAuthToken', token);
        localStorage.setItem(`deltaSigmaPrivacyPolicyAccepted:${user.email}`, 'yes');
        Object.defineProperty(navigator, 'clipboard', {value:{async write(items){
            const blob = await items[0].getType('image/png');
            const bitmap = await createImageBitmap(blob);
            window.auditCopiedImage = {width:bitmap.width, height:bitmap.height};
            bitmap.close();
        }}, configurable:true});
    }, data);
    return data;
}

async function snapshot(page, name){
    await page.screenshot({path:`${OUT}/${name}.png`, fullPage:true});
    const overflow = await page.evaluate(() => ({width:innerWidth, scroll:document.documentElement.scrollWidth,
        offenders:[...document.querySelectorAll('body *')].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width && rect.right > innerWidth && !element.closest('.course-history-table-wrap, .source-task-table-wrap');
        }).map(element => ({id:element.id, class:element.className, right:element.getBoundingClientRect().right})).slice(0,20)}));
    assert(overflow.scroll <= overflow.width, `${name}: ${JSON.stringify(overflow)}`);
}

async function main(){
    fs.mkdirSync(OUT, {recursive:true});
    const browser = await chromium.launch({headless:true});
    try {
        const ac = await browser.newContext({viewport:{width:1440, height:1000}});
        const admin = await auth(ac, 'eo-admin@example.test');
        const created = await ac.request.post(BASE + '/api/admin/students', {
            headers:{Authorization:`Bearer ${admin.token}`},
            data:{email:`mp-homework-audit-${Date.now()}@example.test`, display_name:'MP oceny i reset',
                  level:'matura_podstawowa', password:'local-audit-password'}
        });
        assert(created.ok(), await created.text());
        const student = (await created.json()).student;
        const sc = await browser.newContext({viewport:{width:1440, height:1000}});
        const studentAuth = await auth(sc, student.email);
        const sh = {Authorization:`Bearer ${studentAuth.token}`};
        const sp = await sc.newPage();
        const ap = await ac.newPage();
        for(const page of [sp, ap]) page.on('pageerror', error => errors.push(error.message));
        await ap.goto(BASE + '/admin.html', {waitUntil:'domcontentloaded'});
        await ap.locator(`#student-toggle-${student.id}`).click();
        await ap.locator('#studentLoadStatus').waitFor({state:'hidden'});
        await ap.locator('#sourceProgress .course-history-row').filter({hasText:'Lekcja 5'}).click();
        assert.equal(await ap.locator('.teacher-score-control select').count(), 12, 'Discord homework can be graded before any website submission');
        assert.equal(await ap.locator('.teacher-score-control select').first().inputValue(), '');
        await sp.goto(BASE + '/zadania.html?category=kurs', {waitUntil:'domcontentloaded'});
        await sp.waitForFunction(() => !isTaskLoading && currentTask);
        await sp.locator('#sourceList .source-btn').filter({hasText:'Lekcja 5'}).click();
        await sp.waitForFunction(source => !isTaskLoading && currentTask?.sourceId === source, SOURCE);
        assert.equal(await sp.locator('.notebook-work-notice').isVisible(), true);
        assert.equal(await sp.locator('#mcq input, #mcq textarea, #mcq .choice-btn').count(), 0);
        await sp.getByRole('button', {name:'Rozwiązanie wysłane na Discordzie', exact:true}).click();
        await sp.waitForFunction(() => pendingProgressSaveRequests.size === 0 && getSavedProgressItem(currentTask)?.teacher_review_pending);
        assert.match(await sp.locator('.teacher-submission-status').innerText(), /ocenę nauczyciela/);
        assert.equal(await sp.locator('#mcq .input-submit').isEnabled(), false);
        assert.equal(await sp.locator('.ready-next').count(), 0, 'No correct result before teacher review');
        for(const file of ['zd2.png', 'zd3.png']){
            const payload = {source_id:SOURCE, file, task_id:`${SOURCE}:${file}`, result:'good', earned_points:2,
                             submitted_answer:'Rozwiązanie wysłane na Discordzie.'};
            const response = await sc.request.post(BASE + '/api/progress', {headers:sh, data:payload});
            assert(response.ok(), await response.text());
            const review = await sc.request.post(BASE + '/api/review-tasks', {headers:sh, data:payload});
            assert(review.ok(), await review.text());
        }
        await ap.reload({waitUntil:'domcontentloaded'});
        await ap.locator(`#student-toggle-${student.id}`).waitFor();
        await ap.locator(`#student-toggle-${student.id}`).click();
        await ap.locator('#studentLoadStatus').waitFor({state:'hidden'});
        assert.equal(await ap.locator('#progressDetail').evaluate(element => element.nextElementSibling.className), 'student-account-panel');
        assert.equal(await ap.getByText('Kurs - praca domowa i powtórki', {exact:true}).count(), 0);
        await ap.locator('#sourceProgress .course-history-row').filter({hasText:'Lekcja 5'}).click();
        const table = ap.locator('.source-task-table-wrap');
        // Task titles remain canonical in the manifest; use row order for the three numbered proofs.
        const proofRow = index => ap.locator('.source-task-row').nth(index);
        assert.equal(await table.locator('.source-task-row').count(), 19);
        assert.equal(await table.evaluate(element => getComputedStyle(element).maxHeight), 'none');
        assert.equal(await table.evaluate(element => element.scrollHeight > element.clientHeight), false);
        for(const [index, score] of [[0,'2'],[1,'0'],[2,'1']]){
            await proofRow(index).getByRole('combobox').selectOption(score);
            await proofRow(index).getByRole('button', {name:'Zapisz wynik'}).click();
            await ap.waitForFunction(({index, score}) => {
                const row = document.querySelectorAll('.source-task-row')[index];
                return row?.querySelector('select')?.value === score && !row.textContent.includes('Do oceny');
            }, {index, score});
        }
        assert.equal(await ap.locator('.lesson-work-actions').getByRole('button', {name:'Kopiuj błędne zadania (2)'}).isEnabled(), true);
        assert.equal(await ap.locator('.lesson-work-actions').getByRole('button', {name:'Kopiuj zadania do omówienia (2)'}).isEnabled(), true);
        await ap.locator('.lesson-work-actions').getByRole('button', {name:'Kopiuj błędne zadania (2)'}).click();
        await ap.waitForFunction(() => window.auditCopiedImage?.height > 0);
        const firstImage = await ap.evaluate(() => window.auditCopiedImage);
        assert(firstImage.width > 300 && firstImage.height > 100);
        await snapshot(ap, 'admin-desktop');
        await sp.locator('.notification-toggle').click();
        await sp.waitForFunction(() => document.querySelectorAll('.notification-panel li').length === 3);
        await sp.waitForFunction(() => document.querySelector('.teacher-submission-status')?.textContent.includes('2 / 2 pkt'));
        assert.equal(await sp.locator('.notification-count').isVisible(), false);
        assert.match(await sp.locator('.notification-panel').innerText(), /Lekcja 5.*2\/2 pkt/s);
        await snapshot(sp, 'student-notifications-desktop');
        await sp.keyboard.press('Escape');
        assert.equal(await sp.locator('.notification-panel').isVisible(), false);
        await sp.reload({waitUntil:'domcontentloaded'});
        await sp.waitForFunction(() => !isTaskLoading && currentTask?.teacherGraded);
        await sp.locator('#progress button').first().click();
        await sp.waitForFunction(() => !isTaskLoading && currentTask?.file === 'zd1.png');
        assert.match(await sp.locator('.teacher-submission-status').innerText(), /2 \/ 2 pkt/);
        await proofRow(0).getByRole('combobox').selectOption('1');
        await proofRow(0).getByRole('button', {name:'Zapisz wynik'}).click();
        await ap.waitForFunction(() => document.querySelector('.teacher-score-control select')?.value === '1');
        await sp.locator('.notification-toggle').click();
        await sp.waitForFunction(() => document.querySelector('.teacher-submission-status')?.textContent.includes('1 / 2 pkt'));
        await sp.keyboard.press('Escape');
        await ap.setViewportSize({width:390, height:844});
        assert.equal(await table.evaluate(element => getComputedStyle(element).maxHeight), '300px');
        await snapshot(ap, 'admin-mobile');
        await sp.setViewportSize({width:390, height:844});
        await sp.locator('.notification-toggle').click();
        await snapshot(sp, 'student-notifications-mobile');
        await sp.keyboard.press('Escape');
        await ap.setViewportSize({width:1440, height:1000});
        ap.on('dialog', dialog => dialog.accept());
        await proofRow(0).getByRole('button', {name:'Wykonaj ponownie'}).click();
        await ap.waitForFunction(() => document.querySelector('.source-task-row')?.textContent.includes('Nie wykonano'));
        await sp.locator('.notification-toggle').click();
        await sp.waitForFunction(() => document.querySelector('#mcq .input-submit')?.disabled === false);
        assert.match(await sp.locator('.notification-panel').innerText(), /ponownego wykonania/);
        await sp.keyboard.press('Escape');
        await sp.getByRole('button', {name:'Rozwiązanie wysłane na Discordzie', exact:true}).click();
        await sp.waitForFunction(() => pendingProgressSaveRequests.size === 0 && getSavedProgressItem(currentTask)?.teacher_review_pending);
        await ap.reload({waitUntil:'domcontentloaded'});
        await ap.locator(`#student-toggle-${student.id}`).click();
        await ap.locator('#studentLoadStatus').waitFor({state:'hidden'});
        await ap.locator('#sourceProgress .course-history-row').filter({hasText:'Lekcja 5'}).click();
        await proofRow(1).getByRole('checkbox').check();
        await proofRow(2).getByRole('checkbox').check();
        await ap.getByRole('button', {name:'Ponów zaznaczone (2)'}).click();
        await ap.waitForFunction(() => document.querySelectorAll('.source-task-row')[1]?.textContent.includes('Nie wykonano'));
        const progress = (await (await sc.request.get(BASE + '/api/progress/me', {headers:sh})).json()).progress;
        assert.deepEqual(progress.filter(item => item.source_id === SOURCE).map(item => item.file), ['zd1.png']);
        assert.equal((await (await sc.request.get(BASE + '/api/review-tasks/me', {headers:sh})).json()).review_tasks.length, 0);
        assert.equal(await ap.locator('.lesson-work-actions').getByRole('button', {name:'Kopiuj błędne zadania (0)'}).isEnabled(), false);
        await proofRow(3).getByRole('combobox').selectOption('2');
        await proofRow(3).getByRole('button', {name:'Zapisz wynik'}).click();
        await ap.waitForFunction(() => document.querySelectorAll('.source-task-row')[3]?.textContent.includes('Dobrze'));
        assert.equal((await (await sc.request.get(BASE + '/api/progress/me', {headers:sh})).json()).progress.find(item => item.file === 'zd4.png').earned_points, 2);
        await snapshot(ap, 'admin-complete-controls-desktop');
        console.log('PASS: Discord hand-in, pending state, 0/1/2 grades, grade amendment, student notifications/read/history, reload, desktop full list, mobile scrolling, lesson clipboard, single/bulk reset, resubmission and review cleanup');
        assert.deepEqual(errors, []);
        await ac.close();
        await sc.close();
    } finally { await browser.close(); }
}
main().catch(error => {console.error(error); process.exitCode=1;});
