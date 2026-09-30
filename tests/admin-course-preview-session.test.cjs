const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('admin.html', 'utf8');

function source(name) {
  const start = html.indexOf(`async function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}

assert.match(html, /id="coursePreviewLink"/);
assert.match(html, /const adminSessionReady = new Promise/);

async function runBoot(apiFetch, catalogLoader) {
  let sessionResult;
  const statusMessages = [];
  const context = vm.createContext({
    adminSessionVerified: false,
    settleAdminSession(value) { sessionResult = value; },
    apiFetch,
    adminEmail: {innerText: ''},
    loadAdminTaskCatalog: catalogLoader,
    loadStudents: async () => {},
    loadSitePrices: async () => {},
    loadMessages: async () => {},
    showStatus(message) { statusMessages.push(message); },
    window: {location: {href: 'admin.html'}}
  });

  vm.runInContext(source('boot'), context);
  const result = await context.boot();
  return {context, result, sessionResult, statusMessages};
}

(async () => {
  const interruptedLoad = await runBoot(
    async () => ({authenticated: true, user: {role: 'admin', email: 'admin@example.com'}}),
    async () => {
      const error = new Error('navigation interrupted');
      error.name = 'AbortError';
      throw error;
    }
  );

  assert.equal(interruptedLoad.result, true);
  assert.equal(interruptedLoad.sessionResult, true);
  assert.equal(interruptedLoad.context.adminSessionVerified, true);
  assert.equal(interruptedLoad.context.window.location.href, 'admin.html');
  assert.deepEqual(interruptedLoad.statusMessages, []);

  const expiredSession = await runBoot(
    async () => { throw Object.assign(new Error('unauthorized'), {status: 401}); },
    async () => {}
  );

  assert.equal(expiredSession.result, false);
  assert.equal(expiredSession.sessionResult, false);
  assert.equal(expiredSession.context.window.location.href, 'login.html');

  console.log('PASS: admin course preview waits for auth and canceled panel loads do not log out');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
