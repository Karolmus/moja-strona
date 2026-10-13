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
    assert(student.indexOf('setupExternalTeacherSubmission(mcq);') < student.indexOf('} else if(isProofTask(currentTask))'));
    assert(student.includes('class="notebook-work-notice" role="note"'));
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
