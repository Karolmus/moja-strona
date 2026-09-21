const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('trening.html', 'utf8');

assert.match(html, /const MATHML_NAMESPACE = "http:\/\/www\.w3\.org\/1998\/Math\/MathML"/);
assert.match(html, /function upgradeMathNotation\(container\)/);
assert.match(html, /mathElement\("mfrac"\)/);
assert.match(html, /mathElement\("msqrt"\)/);
assert.match(html, /mathElement\("msup"\)/);
assert.match(html, /mathElement\("msub"\)/);
assert.match(html, /mathElement\("munder"\)/);
assert.match(html, /problemText\.innerHTML = taskItem\.html;\s*upgradeMathNotation\(problemText\);/);
assert.match(html, /\.math-atom\s*\{/);

console.log('PASS: speed training upgrades generated math to native MathML');
