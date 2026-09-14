const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tasks = fs.readFileSync('zadania.html','utf8');
const admin = fs.readFileSync('admin.html','utf8');
const training = fs.readFileSync('trening.html','utf8');
const ctx = vm.createContext({loggedUser:null, STUDENT_WORK_COURSE_PARTS:['praca_domowa','zadania_powtorkowe'],
  isLoggedInStudent:true, currentTask:null, submittedChoice:'B', multiSelection:new Set(['A','D']),
  groupedMultiSelection:new Map([[1,'2'],[0,'C']]), trueFalseSelection:['P','F'],
  isInputTask:t=>t.type==='input', isTrueFalseSequenceTask:t=>t.type==='true_false',
  isGroupedChoiceTask:t=>t.type==='grouped_choice', isGroupedMultiTask:t=>t.type==='grouped_multi',
  document:{querySelectorAll:()=>[{dataset:{index:'0'},value:'3/4'},{dataset:{index:'1'},value:'sqrt(2)'}]}
});
for (const [html,names] of [[tasks,['canAccessCoursePart','isCoursePreviewMode','submittedAnswerText','getInputFields']],
  [admin,['expectedCourseAnswer','studentLastActivity']]]) {
  for(const name of names){const start=html.indexOf(`function ${name}(`); assert(start>=0); vm.runInContext(html.slice(start,html.indexOf('\n}',start)+2),ctx);}
}
assert(ctx.canAccessCoursePart('praca_domowa'));
assert(!ctx.canAccessCoursePart('zadania'));
ctx.loggedUser = {role:'student',full_course_access:true};
assert(ctx.canAccessCoursePart('zadania'));
assert(!ctx.isCoursePreviewMode({category:'kurs',coursePart:'zadania'}));
ctx.loggedUser.full_course_access=false;
assert(!ctx.canAccessCoursePart('zadania'));
ctx.loggedUser={role:'admin'};
assert(ctx.canAccessCoursePart('zadania'));
for(const [type,answer] of [['closed','B'],['multi','A, D'],['true_false','P, F'],['grouped_choice','C2'],['grouped_multi','C, 2']]){
  ctx.currentTask={type}; assert.equal(ctx.submittedAnswerText(),answer);
}
ctx.currentTask={type:'input',inputs:[{label:'a)',answers:['1/4']},{label:'b)',answer:'sqrt(3)'}]};
assert.equal(ctx.submittedAnswerText(),'a): 3/4\nb): sqrt(2)');
assert.equal(ctx.expectedCourseAnswer(ctx.currentTask),'a): 1/4\nb): sqrt(3)');
assert.equal(ctx.expectedCourseAnswer({type:'true_false',answer:'FP'}),'F, P');
assert.equal(ctx.expectedCourseAnswer({type:'closed',answer:'D'}),'D');
assert.equal(ctx.expectedCourseAnswer({type:'input',acceptedAnswers:['39.7%','39,7%']}),'Odpowiedź: 39.7%');
ctx.studentProgressCache=new Map([[1,[{created_at:'2026-09-12T10:00:00Z'}]]]);
assert.equal(ctx.studentLastActivity({id:1,last_login_at:'2026-09-13T10:00:00Z',last_activity_at:'2026-09-01T10:00:00Z'}),'2026-09-13T10:00:00Z');
assert.match(admin,/<template id="studentProgressTemplate">/);
assert(!admin.includes('lastCredentialsText +='));
assert(!admin.includes('const fullText = parentLink'));
assert(!training.includes('leaderboard'));
for(const file of ['admin.html','zadania.html','trening.html','login.html']){
  for(const script of fs.readFileSync(file,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
}
console.log('PASS: per-student course access, response capture, expected answers, newest activity and no ranking');
