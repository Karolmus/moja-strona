const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const auth = fs.readFileSync('static/auth.js', 'utf8');
const analytics = fs.readFileSync('static/analytics.js', 'utf8');

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.style = {setProperty(name, value) {this[name] = value;}};
    const classes = new Set();
    this.classList = {toggle(name, value) {value ? classes.add(name) : classes.delete(name);}, contains: name => classes.has(name)};
  }
  appendChild(child) {child.parent = this; this.children.push(child); return child;}
  append(...children) {children.forEach(child => this.appendChild(child));}
  remove() {this.parent.children = this.parent.children.filter(child => child !== this);}
  setAttribute(name, value) {this.attributes[name] = value;}
  addEventListener(name, action) {this.listeners[name] = action;}
  getBoundingClientRect() {return {height: this.id === 'siteNoticeStack' ? this.children.length * 64 : 64};}
  focus() {throw new Error('Notices must not steal focus');}
}

function fixture({consent, blockedStorage = false, doNotTrack} = {}) {
  const data = new Map(consent ? [['deltaSigmaCookieConsent', consent]] : []);
  const storage = {getItem(key) {if (blockedStorage) throw Error('storage'); return data.get(key) || null;},
    setItem(key, value) {if (blockedStorage) throw Error('storage'); data.set(key, value);}, removeItem(key) {data.delete(key);}};
  const root = new Element('html'), body = root.appendChild(new Element('body'));
  const all = () => {const visit = el => [el, ...el.children.flatMap(visit)]; return visit(root);};
  const document = {body, documentElement: root, readyState: 'complete', referrer: '',
    createElement: tag => new Element(tag),
    getElementById: id => all().find(el => el.id === id),
    querySelector(selector) {
      if (selector === '[data-cookie-banner]') return all().find(el => 'cookieBanner' in el.dataset);
      if (selector === '[data-privacy-policy-prompt]') return all().find(el => 'privacyPolicyPrompt' in el.dataset);
      return null;
    }};
  const requests = [];
  let random = 0;
  const window = {localStorage: storage, sessionStorage: storage,
    location: {hostname:'example.test', pathname:'/zadania.html', protocol:'https:', search:''},
    crypto: {randomUUID: () => `id-${++random}`}, innerWidth: 375, addEventListener() {}};
  const ctx = vm.createContext({window, document, navigator:{doNotTrack}, URLSearchParams, URL,
    ResizeObserver: class {observe() {}}, fetch: async (url, options) => {requests.push({url, options});}});
  vm.runInContext(auth.slice(0, auth.indexOf('    window.updateAuthNav =')) +
    'window.testPrivacy = showPrivacyPolicyPrompt;})();', ctx);
  window.refreshAuthNav = async () => null;
  vm.runInContext(analytics, ctx);
  return {window, document, data, requests, root, body, all};
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const button = (notice, label) => {
  const visit = el => [el, ...el.children.flatMap(visit)];
  return visit(notice).find(el => el.tag === 'button' && el.innerText === label);
};

test('cookie and privacy notices share a bottom stack, never a modal or a focus trap', () => {
  const f = fixture();
  const cookies = f.document.querySelector('[data-cookie-banner]');
  assert.equal(cookies.attributes.role, 'region');
  assert.equal(cookies.attributes['aria-modal'], undefined);
  assert.equal(f.requests.length, 0);
  assert(!f.data.has('deltaSigmaAnalyticsVisitor'));
  f.window.testPrivacy({id: 7});
  const privacy = f.document.querySelector('[data-privacy-policy-prompt]');
  assert.equal(privacy.attributes.role, 'region');
  assert.equal(privacy.attributes['aria-modal'], undefined);
  assert.equal(cookies.parent, privacy.parent);
  assert.equal(f.root.style['--site-notice-height'], '128px');
  assert(f.body.classList.contains('site-notices-visible'));
  button(privacy, 'Akceptuję').listeners.click();
  assert.equal(f.data.get('deltaSigmaPrivacyPolicyAccepted:7'), 'yes');
  assert.equal(f.root.style['--site-notice-height'], '64px');
  assert.equal(f.data.get('deltaSigmaCookieConsent'), undefined, 'Privacy acceptance is not analytics consent');
  f.window.testPrivacy({id: 7});
  assert.equal(cookies.parent.children.length, 1);
  button(cookies, 'Tylko niezbędne').listeners.click();
  assert.equal(f.data.get('deltaSigmaCookieConsent'), 'necessary');
  assert.equal(f.root.style['--site-notice-height'], '0px');
  assert(!f.body.classList.contains('site-notices-visible'));
  assert.equal(f.requests.length, 0);
});

test('analytics remain opt-in and existing choices do not show another cookie notice', async () => {
  const f = fixture();
  assert.equal(f.requests.length, 0);
  button(f.document.querySelector('[data-cookie-banner]'), 'Zezwól na statystyki').listeners.click();
  await tick();
  assert.equal(f.data.get('deltaSigmaCookieConsent'), 'accepted');
  assert.equal(f.requests.length, 1);
  assert(f.requests[0].url.endsWith('/api/analytics/pageview'));
  assert(f.data.has('deltaSigmaAnalyticsVisitor'));
  assert.equal(f.document.querySelector('[data-cookie-banner]'), undefined);
  for (const choice of ['accepted', 'necessary']) {
    const resumed = fixture({consent: choice}); await tick();
    assert.equal(resumed.document.querySelector('[data-cookie-banner]'), undefined);
    assert.equal(resumed.requests.length, choice === 'accepted' ? 1 : 0);
  }
});

test('blocked storage does not redisplay cookies immediately after an explicit choice', async () => {
  const f = fixture({blockedStorage: true});
  button(f.document.querySelector('[data-cookie-banner]'), 'Zezwól na statystyki').listeners.click();
  await tick();
  assert.equal(f.requests.length, 1);
  assert.equal(f.document.querySelector('[data-cookie-banner]'), undefined);
  assert.equal(f.root.style['--site-notice-height'], '0px');
});

test('privacy logout remains explicit and Do Not Track still prevents analytics', () => {
  const f = fixture();
  let loggedOut = false;
  f.window.logoutCurrentUser = () => {loggedOut = true;};
  f.window.testPrivacy({id: 7});
  button(f.document.querySelector('[data-privacy-policy-prompt]'), 'Nie teraz, wyloguj mnie').listeners.click();
  assert(loggedOut);
  assert(!f.data.has('deltaSigmaPrivacyPolicyAccepted:7'));
  const privateVisitor = fixture({doNotTrack: '1'});
  assert.equal(privateVisitor.requests.length, 0);
  assert.equal(privateVisitor.document.querySelector('[data-cookie-banner]'), undefined);
});

test('notice styles dock at the bottom, reserve space and stay responsive on every active page', () => {
  const css = fs.readFileSync('nav.css', 'utf8');
  assert.match(css, /\.site-notice-stack\s*\{[^}]*position: fixed;[^}]*inset: auto 0 0;/);
  assert.match(css, /body\.site-notices-visible\s*\{[^}]*padding-bottom: var\(--site-notice-height, 0px\);/);
  assert.match(css, /bottom: calc\(var\(--site-notice-height, 0px\) \+ max/);
  assert.match(css, /@media \(max-width: 640px\)/);
  for (const file of fs.readdirSync('.').filter(file => file.endsWith('.html'))) {
    const page = fs.readFileSync(file, 'utf8');
    if (!page.includes('static/analytics.js')) continue;
    assert(page.indexOf('static/auth.js') < page.indexOf('static/analytics.js'), file);
    assert(page.includes('nav.css?v=20261020-passive-notices'), file);
    assert(page.includes('static/analytics.js?v=20261020-passive-notices'), file);
  }
});
