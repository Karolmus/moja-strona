const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('zadania.html', 'utf8');
const nodes = new Map();
const classes = new Set();
const document = {
  documentElement:{classList:{add:value => classes.add(value), remove:value => classes.delete(value)}},
  createElement:tagName => ({tagName}),
  getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, {
      open:false, children:[], listeners:{},
      addEventListener(type, listener) {this.listeners[type] = listener;},
      replaceChildren(...children) {this.children = children;},
      removeAttribute(name) {delete this[name];},
      showModal() {this.open = true;},
      close() {this.open = false;},
      getBoundingClientRect:() => ({left:100, right:900, top:100, bottom:600})
    });
    return nodes.get(id);
  }
};
const ctx = vm.createContext({
  document, URL, isTaskLoading:false,
  DeltaSigmaCourseVideos:require('../static/course-videos.js'),
  STUDENT_WORK_COURSE_PARTS:['praca_domowa', 'zadania_powtorkowe'],
  coursePartDisplayTitle:() => 'Lekcja 1 - praca domowa 1',
  currentTask:{category:'kurs', level:'matura_podstawowa', coursePart:'praca_domowa', videoUrl:'https://youtu.be/F--EfH1oOnE'}
});
const start = html.indexOf('function taskVideoUrl(');
const end = html.indexOf('function setResultButtonsEnabled(', start);
assert(start > 0 && end > start);
vm.runInContext(html.slice(start, end), ctx);
const dialog = document.getElementById('taskVideoDialog');
const player = document.getElementById('taskVideoPlayer');
const external = document.getElementById('taskVideoExternal');
const event = extra => ({button:0, preventDefault() {this.prevented = true;}, ...extra});
assert.equal(player.children.length, 0, 'No player is loaded before opening');
const click = event();
document.getElementById('taskVideoLink').listeners.click(click);
assert(click.prevented && dialog.open && classes.has('task-video-open'));
assert.equal(player.children.length, 1);
const frame = player.children[0];
assert.equal(frame.tagName, 'iframe');
assert.equal(frame.src, 'https://www.youtube-nocookie.com/embed/F--EfH1oOnE?autoplay=1&playsinline=1&rel=0');
assert.equal(frame.referrerPolicy, 'strict-origin-when-cross-origin');
assert.equal(frame.allowFullscreen, true);
assert.match(frame.title, /Lekcja 1/);
assert.equal(external.href, ctx.currentTask.videoUrl);
ctx.openTaskVideo(event());
assert.equal(player.children[0], frame, 'Repeated click does not restart playback');
document.getElementById('taskVideoClose').listeners.click();
assert(!dialog.open && !classes.has('task-video-open'));
assert.equal(player.children.length, 0, 'Closing destroys the player');
assert.equal(external.href, undefined);
for (const extra of [{button:1}, {ctrlKey:true}, {metaKey:true}, {altKey:true}, {shiftKey:true}]) {
  const modified = event(extra);
  ctx.openTaskVideo(modified);
  assert(!modified.prevented && !dialog.open, 'Modified clicks keep the native link behavior');
}
for (const url of ['javascript:alert(1)', 'https://youtu.be.evil.test/F--EfH1oOnE', 'https://youtu.be/F--EfH1oOnE?x=1']) {
  assert.equal(ctx.taskVideoEmbedUrl({...ctx.currentTask, videoUrl:url}), '');
}
ctx.isTaskLoading = true;
ctx.openTaskVideo(event());
assert(!dialog.open);
ctx.isTaskLoading = false;
ctx.openTaskVideo(event());
dialog.listeners.cancel(event());
assert(!dialog.open && player.children.length === 0, 'Escape stops playback');
ctx.openTaskVideo(event());
dialog.listeners.click(event({target:dialog, currentTarget:dialog, clientX:200, clientY:200}));
assert(dialog.open, 'Clicks inside the dialog do not close it');
dialog.listeners.click(event({target:dialog, currentTarget:dialog, clientX:50, clientY:50}));
assert(!dialog.open && player.children.length === 0, 'Backdrop closes the player');
ctx.openTaskVideo(event());
dialog.listeners.close({currentTarget:dialog});
assert.equal(player.children.length, 1, 'A queued close event must not erase a newly reopened video');
dialog.close();
dialog.listeners.close({currentTarget:dialog});
assert.equal(player.children.length, 0);
assert.match(html, /function clearTaskInteraction\(\)\{\s*closeTaskVideo\(\);/);
assert.match(html, /frame-src https:\/\/www\.youtube-nocookie\.com[";]/);
assert.match(html, /<dialog[^>]*id="taskVideoDialog"[^>]*aria-labelledby="taskVideoTitle"/);
assert.match(html, /id="taskVideoLink"[^>]*aria-haspopup="dialog"/);
assert.match(html, /id="taskVideoClose"[^>]*aria-label="Zamknij film"[^>]*autofocus/);
console.log('PASS: lazy video modal, validated URLs, referrer, close/escape/backdrop, reload race and task cleanup');
