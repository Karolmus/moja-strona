const fs = require('node:fs');
const assert = require('node:assert/strict');
const {test} = require('node:test');

test('task and profile pages do not create pending-test notifications or counters', () => {
  for (const file of ['zadania.html','profil.html']) {
    const html = fs.readFileSync(file, 'utf8');
    for (const removed of ['DSCourseTests','course-tests.js','course-tests.css',
      'courseTestNotice','profileTestNotice','testCategoryBadge','Masz test do wykonania']) {
      assert(!html.includes(removed), `${file}: ${removed}`);
    }
    if(file === 'zadania.html') assert(html.includes('data-category="testy"'), 'Tests remain accessible');
  }
  const auth = fs.readFileSync('static/auth.js','utf8');
  assert(auth.includes('notifications'), 'Teacher notifications remain supported');
});
