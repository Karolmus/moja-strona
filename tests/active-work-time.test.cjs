const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const ActiveWorkTime = require('../static/active-work-time.js');

function setup() {
  let now = 0;
  const timer = new ActiveWorkTime({now:() => now});
  const advance = seconds => {
    for (let i=0; i<seconds; i++) { now += 1000; timer.tick(); }
  };
  return {timer, advance, jump:ms => {now += ms;}};
}

test('counts only foreground time and pauses on blur or tab switch', () => {
  const {timer, advance} = setup();
  timer.start('a');
  advance(10);
  assert.equal(timer.seconds('a'), 0);
  timer.setForeground(true);
  advance(30);
  timer.setForeground(false);
  advance(3600);
  timer.activity();
  advance(10);
  assert.equal(timer.seconds('a'), 30);
  timer.setForeground(true);
  advance(12);
  assert.equal(timer.seconds('a'), 42);
});

test('an untouched foreground tab stops after five minutes; activity resumes without backfilling', () => {
  const {timer, advance} = setup();
  timer.setForeground(true);
  timer.start('a');
  advance(3600);
  assert.equal(timer.seconds('a'), 300);
  timer.activity();
  advance(20);
  assert.equal(timer.seconds('a'), 320);
  assert.equal(timer.totalSeconds(), 320);
});

test('regular input keeps active work counting', () => {
  const {timer, advance} = setup();
  timer.setForeground(true);
  timer.start('a');
  for (let i=0; i<12; i++) {advance(240); timer.activity();}
  assert.equal(timer.seconds('a'), 2880);
});

test('task switching preserves unsaved time, loading and finished answers accrue nothing', () => {
  const {timer, advance} = setup();
  timer.setForeground(true);
  timer.start('a'); advance(10);
  timer.pause(); advance(60);
  timer.start('b'); advance(15);
  timer.start('a'); advance(5);
  assert.equal(timer.seconds('a'), 15);
  assert.equal(timer.seconds('b'), 15);
  timer.finish('a'); advance(60);
  assert.equal(timer.seconds('a'), 0);
  assert.equal(timer.totalSeconds(), 30);
  timer.resetTotal();
  assert.equal(timer.totalSeconds(), 0);
  timer.start('b'); advance(4);
  assert.equal(timer.seconds('b'), 19);
  assert.equal(timer.totalSeconds(), 4);
});

test('browser or computer suspension does not add wall-clock time', () => {
  const {timer, advance, jump} = setup();
  timer.setForeground(true); timer.start('a'); advance(7);
  jump(3600000); timer.tick(); advance(10);
  assert.equal(timer.seconds('a'), 7);
  timer.activity(); advance(3);
  assert.equal(timer.seconds('a'), 10);
});

test('partial idle boundary, second rounding and server duration cap', () => {
  const {timer, advance, jump} = setup();
  timer.setForeground(true); timer.start('a');
  jump(450); timer.activity(); advance(300); jump(550);
  assert.equal(timer.seconds('a'), 300);
  timer.durations.set('a', 18000000);
  assert.equal(timer.seconds('a'), 14400);
});

test('page integration starts after loading, ignores synthetic activity and stops on all exit events', () => {
  const html = fs.readFileSync('zadania.html', 'utf8');
  assert(!html.includes('currentTaskStartedAt'));
  assert.match(html, /document\.visibilityState === "visible" && document\.hasFocus\(\)/);
  assert.match(html, /if\(!event\.isTrusted\) return/);
  for (const event of ['visibilitychange', 'focus', 'blur', 'pagehide', 'pageshow', 'freeze', 'resume']) {
    assert(html.includes(`addEventListener("${event}"`));
  }
  assert.match(html, /if\(taskPath && !currentTaskAnswered && !isCoursePreviewMode\(\)\)/);
  assert.match(html, /const taskDuration = getCurrentTaskDurationSeconds\(\);\s+workTimer\.finish\(key\)/);
});
