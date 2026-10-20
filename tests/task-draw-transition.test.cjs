const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('zadania.html', 'utf8');
const start = html.indexOf('async function drawTask(');
const source = html.slice(start, html.indexOf('\n}', start) + 2);

test('fast navigation paints only the latest decoded image, answers and transition without an animation wait', async () => {
  const elements = {};
  function element(id) {
    return elements[id] ||= {src:'', hidden:false, innerHTML:'', innerText:'',
      classList:{add(){}, remove(){}, toggle(){}, contains(){return true;}},
      removeAttribute(name) {delete this[name];}};
  }
  const tasks = [{file:'1',path:'first'}, {file:'2',path:'second'}];
  const pending = {}, rendered = [], presented = [];
  const ctx = vm.createContext({
    currentTask:null, currentIndex:0, selectedCategory:'egzaminy', selectedSource:'paper',
    drawTaskRequestId:0, currentTaskAnswered:false,
    document:{getElementById:element, querySelector:() => element('card')},
    workTimer:{pause(){}, start(){}}, pool:() => tasks,
    versionedTaskImagePath:path => path,
    preloadImage:path => new Promise(resolve => {pending[path] = resolve;}),
    updateTaskDetails:task => rendered.push(task.file),
    setupMCQ:() => {element('mcq').innerHTML = `answers-${ctx.currentTask.file}`;},
    getTaskKey:task => task.file, taskUsedHint:() => false,
    isCoursePreviewMode:() => false, showNotebookWorkNotice:() => {},
    DSMobileExam:{beginTask(){}, presentTask:key => presented.push(key)}
  });
  for (const name of ['updateTimer', 'renderTaskNavigator', 'setTaskLoading', 'clearTaskInteraction',
    'rememberRandomIndex', 'resetReviewButton', 'updateAnswerTools', 'hideMessage',
    'applyCourseAnswerLock', 'updateNextTaskButton', 'scheduleCompletionSummary']) ctx[name] = () => {};
  vm.runInContext(source, ctx);
  const first = ctx.drawTask(0), second = ctx.drawTask(1);
  pending.second('decoded-second'); await second;
  assert.equal(elements.taskImage.src, 'decoded-second');
  assert.equal(elements.mcq.innerHTML, 'answers-2');
  pending.first('decoded-first'); await first;
  assert.equal(elements.taskImage.src, 'decoded-second');
  assert.equal(elements.mcq.innerHTML, 'answers-2');
  assert.deepEqual(rendered, ['2']);
  assert.deepEqual(presented, ['2']);
  assert.equal(ctx.currentTaskAnswered, false);
});
