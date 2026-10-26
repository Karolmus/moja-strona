const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const html = fs.readFileSync('zapisy.html', 'utf8');

function source(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}

test('contact fields have outlined legends and explicit accessible labels', () => {
  assert.equal([...html.matchAll(/<fieldset class="signup-field-frame">/g)].length, 4);
  for (const id of ['contactInput', 'studentDiscordInput', 'preferredTermInput', 'signupMessageInput']) {
    assert(html.includes(`class="signup-field-label" for="${id}"`));
    assert(html.includes(`id="${id}"`));
  }
  assert.match(html, /aria-describedby="contactError contactSuccess" required/);
  assert.match(html, /id="contactSuccess"[^>]*aria-live="polite" hidden/);
  assert.match(html, /\.signup-field-frame:focus-within/);
  assert.match(html, /\.signup-field-frame:has\(\[aria-invalid="true"\]\)/);
  assert.match(html, /@media \(max-width:600px\)[\s\S]*?font-size: 16px;/);
});

test('positive phone feedback uses the same number limits as the backend', () => {
  const context = vm.createContext({});
  vm.runInContext(source('isSignupPhoneValid'), context);
  for (const phone of ['514 681 958', '+48 514 681 958', '(514) 681-958', '123456789', '+123456789012345']) {
    assert.equal(context.isSignupPhoneValid(phone), true, phone);
  }
  for (const phone of ['', '12345678', '.........', '12+3456789', '++48123456789', '1234567890123456', 'abc123456789', `123456789${' '.repeat(20)}0`]) {
    assert.equal(context.isSignupPhoneValid(phone), false, phone);
  }
  assert.match(source('validateSignupForm'), /!isSignupPhoneValid\(contact\)/);
});

test('phone feedback hides stale success and lets corrected input clear errors', () => {
  const attributes = {};
  const input = {value: '', getAttribute: name => attributes[name] || null};
  const success = {hidden: true};
  const errors = [];
  const context = vm.createContext({
    signupFieldErrors: {contact: {focusTarget: input}},
    document: {getElementById: id => {assert.equal(id, 'contactSuccess'); return success;}},
    clearSignupFieldError: field => {assert.equal(field, 'contact'); delete attributes['aria-invalid'];},
    showSignupFieldError: (field, message) => {
      assert.equal(field, 'contact');
      errors.push(message);
      attributes['aria-invalid'] = 'true';
    }
  });
  for (const name of ['isSignupPhoneValid', 'updateSignupPhoneFeedback']) {
    vm.runInContext(source(name), context);
  }
  input.value = '123';
  context.updateSignupPhoneFeedback();
  assert.equal(errors.length, 0, 'No error while first typing');
  context.updateSignupPhoneFeedback(true);
  assert.equal(errors.at(-1), 'Podaj prawidłowy numer telefonu.');
  assert.equal(success.hidden, true);
  input.value = '+48 514 681 958';
  context.updateSignupPhoneFeedback();
  assert.equal(success.hidden, false);
  assert.equal(attributes['aria-invalid'], undefined);
  input.value = '';
  context.updateSignupPhoneFeedback();
  assert.equal(success.hidden, true);
  context.updateSignupPhoneFeedback(true);
  assert.equal(errors.at(-1), 'Podaj numer telefonu.');
  assert.match(html, /contactForm\.addEventListener\("reset", \(\) => \{\s*clearSignupFieldErrors\(\);\s*document\.getElementById\("contactSuccess"\)\.hidden = true;/);
});
