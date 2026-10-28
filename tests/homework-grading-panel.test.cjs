const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const admin = fs.readFileSync('admin.html', 'utf8');
const student = fs.readFileSync('zadania.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('zadania/kurs/mp/lekcja_5/lekcja_5_zadania_dowodowe.json'));

function code(html, name){
    const match = new RegExp(`(?:async )?function ${name}\\(`).exec(html);
    assert(match);
    return html.slice(match.index, html.indexOf('\n}', match.index) + 2);
}

test('only MP5 homework is teacher-graded, with two points and external Discord submissions', () => {
    const homework = manifest.filter(task => task.coursePart === 'praca_domowa');
    assert.equal(homework.length, 12);
    assert(homework.every(task => task.teacherGraded === true && task.maxPoints === 2 && task.type === 'external_submission'));
    assert(manifest.filter(task => task.coursePart !== 'praca_domowa').every(task => !task.teacherGraded));
    assert(student.indexOf('setupExternalTeacherSubmission(mcq);') < student.indexOf('} else if(isProofTask(currentTask) && !isInputTask(currentTask))'));
    assert(student.includes('id="notebookWorkNotice" role="note"'));
    assert(student.includes('Tutaj wprowadź tylko uzyskane odpowiedzi.'));
    assert.match(admin, /@media \(min-width: 901px\)\s*\{\s*\.source-task-table-wrap \{ max-height: none;/);
    assert(!admin.includes('Kurs - praca domowa i powtórki'));
});

test('ungraded submissions are not incorrect and partial teacher scores have an accurate label', () => {
    const c = vm.createContext({isTeacherReviewPending:item => item.teacher_review_pending,
        inferredTaskScore:(item, task) => ({earned:item.earned_points, max:task.maxPoints})});
    vm.runInContext(code(admin, 'coursePartProgress'), c);
    const group = {tasks:[
        {coursePart:'praca_domowa', teacherGraded:true, maxPoints:2, latestProgress:{result:'bad',teacher_review_pending:true, earned_points:null}},
        {coursePart:'praca_domowa', teacherGraded:true, maxPoints:2, latestProgress:{result:'good', earned_points:2}},
        {coursePart:'praca_domowa', teacherGraded:true, maxPoints:2, latestProgress:{result:'medium', earned_points:1}},
        {coursePart:'zadania_powtorkowe', maxPoints:1, latestProgress:{result:'bad',earned_points:0}}
    ]};
    const part = c.coursePartProgress(group, 'praca_domowa');
    assert.equal(part.attempted, 3);
    assert.equal(part.pendingReview, 1);
    assert.equal(part.bad, 0);
    assert.equal(part.good, 1);
    assert.equal(part.medium, 1);
    assert.equal(part.correctPercent, 50, 'Pending submissions do not enter the graded percentage denominator');
    assert(admin.includes('? "częściowo" : "z pomocą"'));
});

test('grade saving targets the original student and never rerenders another student after a switch', async () => {
    let complete;
    const response = new Promise(resolve => {complete = resolve;});
    const requests = [];
    const c = vm.createContext({activeProgressStudentId:1, studentProgressCache:new Map([[1,[]],[2,[]]]),
        students:[{id:1},{id:2}], taskMaxPoints:() => 2, formatPoints:String, activeReviewItems:[],
        apiFetch:async (url, options) => {requests.push({url, options}); return response;},
        renderSourceProgress:() => {c.rendered=true;}, isIndependentWorkProgress:() => true, showStatus(){}
    });
    vm.runInContext(code(admin, 'saveTeacherReviewedScore'), c);
    const button = {}, status = {};
    const request = c.saveTeacherReviewedScore(null, {sourceId:'course.json', file:'zd1.png'}, {value:'2'}, button, status);
    assert.equal(requests[0].url, '/api/admin/students/1/progress/score');
    assert.equal(requests[0].options.method, 'POST');
    c.activeProgressStudentId=2;
    complete({progress:{id:42,user_id:1,result:'good',earned_points:2}});
    await request;
    assert.equal(c.studentProgressCache.get(1)[0].earned_points, 2);
    assert.equal(c.studentProgressCache.get(2).length, 0);
    assert.equal(c.rendered, undefined);
    for(const value of ['', '-1', '3', '1.5', 'abc']){
        await c.saveTeacherReviewedScore(null, {}, {value}, {}, {});
    }
    assert.equal(requests.length, 1, 'Invalid scores do not reach the server');
});

class Element {
    constructor(tag){ this.tag=tag; this.children=[]; this.attributes={}; this.listeners={}; }
    appendChild(child){ this.children.push(child); return child; }
    setAttribute(name, value){ this.attributes[name]=String(value); }
    removeAttribute(name){ delete this.attributes[name]; }
    addEventListener(name, handler){ this.listeners[name]=handler; }
}

function gradingControlContext(save){
    const context = vm.createContext({document:{createElement:tag => new Element(tag)},
        taskMaxPoints:task => task.maxPoints, formatPoints:String, saveTeacherReviewedScore:save});
    vm.runInContext(code(admin, 'teacherScoreControl'), context);
    return context;
}

test('MP6 review proofs use the same zero-to-two-point grading tiles as MP5 homework', async () => {
    const tasks = JSON.parse(fs.readFileSync('zadania/kurs/mp/lekcja_6/lekcja_6_procenty_i_lokaty.json'));
    const proofs = tasks.filter(task => task.coursePart === 'zadania_powtorkowe' && task.isProof);
    assert.deepEqual(proofs.map(task => task.file), ['zp5.png', 'zp6.png']);
    const requests = [];
    const context = gradingControlContext(async (...args) => requests.push(args));
    for (const task of proofs) {
        assert.equal(task.teacherGraded, true);
        assert.equal(task.type, 'external_submission');
        assert.equal(task.maxPoints, 2);
        const control = context.teacherScoreControl(null, task);
        const buttons = control.children.filter(child => child.tag === 'button');
        assert.deepEqual(buttons.map(button => button.textContent), ['0', '1', '2']);
        await buttons[2].listeners.click();
        assert.equal(requests.at(-1)[0], null, 'Grading is also available without a site submission');
        assert.equal(requests.at(-1)[1], task);
        assert.equal(requests.at(-1)[2].value, '2');
    }
    assert.equal(requests.length, 2);
});

test('numeric grading tiles save on one click and prevent duplicate requests while saving', async () => {
    let finish;
    const pending = new Promise(resolve => {finish=resolve;});
    const requests=[];
    const context=gradingControlContext(async (...args) => {requests.push(args); await pending;});
    const progress={id:42, earned_points:1, teacher_graded_at:'2026-10-14T10:00:00Z'};
    const task={maxPoints:2};
    const control=context.teacherScoreControl(progress, task);
    const buttons=control.children.filter(child => child.tag === 'button');
    assert.deepEqual(buttons.map(button => button.textContent), ['0','1','2']);
    assert.equal(control.attributes.role, 'group');
    assert.equal(buttons[1].attributes['aria-pressed'], 'true');
    assert.equal(buttons[2].attributes['aria-pressed'], 'false');
    assert(buttons[1].className.includes('selected'));
    const saving=buttons[2].listeners.click();
    assert.equal(requests.length, 1);
    assert.equal(requests[0][0], progress);
    assert.equal(requests[0][1], task);
    assert.equal(requests[0][2].value, '2');
    assert(buttons.every(button => button.disabled));
    assert.equal(control.attributes['aria-busy'], 'true');
    await buttons[0].listeners.click();
    assert.equal(requests.length, 1);
    finish();
    await saving;
    assert(buttons.every(button => !button.disabled));
    assert.equal(control.attributes['aria-busy'], undefined);
    let stopped=0;
    control.listeners.click({stopPropagation(){ stopped++; }});
    control.listeners.keydown({stopPropagation(){ stopped++; }});
    assert.equal(stopped, 2, 'Grading controls do not also open the task preview');
});

test('MP test proofs expose zero-to-two-point teacher grading for saved answers', async () => {
    const tasks = JSON.parse(fs.readFileSync('zadania/kurs/mp/test_lekcje_1_6/test_lekcje_1_6.json'));
    const proofs = tasks.filter(task => task.teacherGraded);
    assert.deepEqual(proofs.map(task => task.file), ['9.png','10.png']);
    const requests = [];
    const context = gradingControlContext(async (...args) => requests.push(args));
    for(const [index, task] of proofs.entries()){
        const progress = {id:100 + index, teacher_review_pending:true, earned_points:null};
        const control = context.teacherScoreControl(progress, task);
        const buttons = control.children.filter(child => child.tag === 'button');
        assert.deepEqual(buttons.map(button => button.textContent), ['0','1','2']);
        await buttons[index + 1].listeners.click();
        assert.equal(requests.at(-1)[0], progress);
        assert.equal(requests.at(-1)[1], task);
        assert.equal(requests.at(-1)[2].value, String(index + 1));
    }
    const studentContext = vm.createContext({
        currentTaskAnswered:false, currentTask:null,
        getInputFields:task => task.inputs, isTeacherGradedTask:()=>true,
        taskMaxPoints:task => task.maxPoints, disableMCQ(){},
        addProgress:(result, score)=>{studentContext.submission={result,score};},
        showMessage:message=>{studentContext.message=message;},
        isInputFieldAnswerCorrect:()=>{throw new Error('Teacher-reviewed proofs must not be auto-graded');}
    });
    vm.runInContext(code(student, 'checkInputAnswer'), studentContext);
    for(const task of proofs){
        studentContext.currentTask=task;
        studentContext.checkInputAnswer({querySelectorAll:()=>[{dataset:{index:'0'},value:task.answer}]});
        assert.equal(studentContext.submission.result,'bad');
        assert.equal(studentContext.submission.score.earnedPoints,null);
        assert.equal(studentContext.submission.score.maxPoints,2);
        assert.match(studentContext.message,/Oczekuje na ocenę nauczyciela/);
    }
});

test('grading tiles recover after a failed save and only offer zero points after watching a solution', async () => {
    let requests=0;
    const context=gradingControlContext(async () => {requests++; throw new Error('Network error');});
    const control=context.teacherScoreControl({video_viewed:true}, {maxPoints:3});
    const buttons=control.children.filter(child => child.tag === 'button');
    assert.deepEqual(buttons.map(button => button.disabled), [false,true,true,true]);
    await buttons[3].listeners.click();
    assert.equal(requests, 0);
    await assert.rejects(buttons[0].listeners.click(), /Network error/);
    assert.deepEqual(buttons.map(button => button.disabled), [false,true,true,true]);
    assert.equal(control.attributes['aria-busy'], undefined);
});

test('teacher-graded MP5 is listed only after a submission or a request to discuss a task', () => {
    const source='zadania/kurs/mp/lekcja_5/lekcja_5_zadania_dowodowe.json';
    const catalog=manifest.map(task => ({...task, sourceId:source, category:'kurs'}));
    const context=vm.createContext({adminTaskCatalog:catalog});
    for(const name of ['progressSourceId','progressFile','progressTaskKey','isIndependentWorkTask',
        'latestProgressMap','numberValue','taskMaxPoints','isTeacherReviewPending','inferredTaskScore',
        'sourceYear','taskNumberFromFile','taskOrderValue','timestamp','sourceProgressGroups']){
        vm.runInContext(code(admin, name), context);
    }
    const student={level:'matura_podstawowa'};
    const homework=catalog.find(task => task.coursePart === 'praca_domowa');
    const main=catalog.find(task => task.coursePart === 'zadania');
    assert.equal(context.sourceProgressGroups([], student).length, 0);
    assert.equal(context.sourceProgressGroups([{source_id:source,file:main.file,result:'good'}], student).length, 0);
    const submitted=context.sourceProgressGroups([{source_id:source,file:homework.file,result:'bad',
        teacher_review_pending:true}], student);
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].pendingReview, 1);
    assert.equal(submitted[0].bad, 0);
    const discussion=context.sourceProgressGroups([], student, [{source_id:source,file:homework.file}]);
    assert.equal(discussion.length, 1);
    assert.equal(discussion[0].reviewRequested, 1);
    assert.equal(discussion[0].attempted, 0);
});
