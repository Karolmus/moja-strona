const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/auth.js', 'utf8');
const storage = () => ({data:new Map(), getItem(key){return this.data.get(key)||null;}, setItem(k,v){this.data.set(k,v);}, removeItem(k){this.data.delete(k);}});
const localStorage = storage();
function boot(sessionStorage = storage()) {
  const window = {location:{hostname:'example.test'},localStorage,sessionStorage};
  const ctx = vm.createContext({window});
  vm.runInContext(fs.readFileSync('static/security.js','utf8'),ctx);
  vm.runInContext(source.slice(0,source.indexOf('    window.logoutCurrentUser'))+'})();',ctx);
  return window;
}
let window = boot();
window.saveAuthToken('temporary');
assert.equal(window.getAuthToken(),'temporary');
assert.equal(localStorage.getItem('deltaSigmaAuthToken'),null);
assert.equal(boot().getAuthToken(),null);
window.saveAuthToken('persistent',true);
assert.equal(window.sessionStorage.getItem('deltaSigmaAuthToken'),null);
window = boot();
assert.equal(window.getAuthToken(),'persistent');
window.saveAuthToken('new temporary',false);
assert.equal(localStorage.getItem('deltaSigmaAuthToken'),null);
window.saveAuthToken('logout',true);
window.clearAuthToken();
assert.equal(window.getAuthToken(),null);
assert.equal(boot().getAuthToken(),null);
const login = fs.readFileSync('login.html','utf8');
assert.match(login,/id="remember" name="remember" type="checkbox"/);
assert.match(login,/remember: remember.checked/);
assert.match(login,/saveAuthToken\(token, remember.checked\)/);
for (const file of fs.readdirSync('.').filter(file => file.endsWith('.html'))) {
  const page = fs.readFileSync(file,'utf8');
  assert(!page.includes('static/security.js?v=2"'), `${file}: must not use the old token-removing security script`);
}
console.log('PASS: optional persistent login, new-tab restoration, session-only default and logout cleanup');
