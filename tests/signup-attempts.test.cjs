const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const signup = fs.readFileSync('zapisy.html', 'utf8');
const admin = fs.readFileSync('admin.html', 'utf8');
const auth = fs.readFileSync('static/auth.js', 'utf8');
const navCss = fs.readFileSync('nav.css', 'utf8');

function source(name) {
  const start = signup.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return signup.slice(start, signup.indexOf('\n}', start) + 2);
}

const requests = [];
const context = vm.createContext({
  apiFetch:(path, options) => {requests.push({path, options}); return Promise.resolve({accepted:true});},
  selectedTerms:['Wt. 17:00'],
  contactFormStartedAt:123456789,
  clearSignupFieldErrors:() => {},
  showSignupFieldError:(field, message) => {context.errors[field] = message;},
  focusSignupField:field => {context.focused = field;},
  signupFieldErrors:{contact:{focusTarget:{validity:{valid:true}}}},
  errors:{}
});
for (const name of ['validateSignupForm', 'recordFailedSignup']) vm.runInContext(source(name), context);

const values = new Map([
  ['course','Matura podstawowa'], ['sessions_per_week','2'],
  ['contact',''], ['preferred_term','Wtorek po 16:00'],
  ['student_discord','uczen123'], ['message','Proszę o kontakt'], ['website','']
]);
const formData = {get:key => values.get(key) || null};
assert.deepEqual(Array.from(context.validateSignupForm(formData)), ['contact']);
assert.equal(context.focused, 'contact');
context.recordFailedSignup(formData, ['contact']);
assert.equal(requests[0].path, '/api/signup-attempts');
const payload = JSON.parse(requests[0].options.body);
assert.equal(payload.course, 'Matura podstawowa');
assert.equal(payload.sessions_per_week, '2');
assert.equal(payload.student_discord, 'uczen123');
assert.deepEqual(payload.selected_terms, ['Wt. 17:00']);
assert.deepEqual(payload.missing, ['contact']);
assert.equal(payload.form_started_at, 123456789);
assert.match(signup, /const missing = validateSignupForm\(formData\);\s*if\(missing\.length\)\{\s*recordFailedSignup\(formData, missing\);/);
assert.match(signup, /recordFailedSignup\(formData, \["tooManyTerms"\]\)/);
assert.match(signup, /id="contactForm" novalidate/);

assert.match(admin, /data-admin-tab="messages-failed"/);
assert.match(admin, /currentMessageOrigin = "failed_signup"/);
assert.match(admin, /const failedUnread = Number\(messageCounts\.failed_signup\?\.unread \|\| 0\)/);
assert.match(auth, /\/api\/admin\/contact-message-counts/);
assert.match(auth, /data-auth-prospect-badge/);
assert.match(navCss, /\[data-auth-prospect-badge\]:not\(\[hidden\]\)/);
console.log('PASS: incomplete signup capture, separate admin category and prospect-only navigation badge');
