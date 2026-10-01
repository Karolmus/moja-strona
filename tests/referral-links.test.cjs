const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const adminHtml = fs.readFileSync('admin.html', 'utf8');
const redirectHtml = fs.readFileSync('ref_f/index.html', 'utf8');
const match = adminHtml.match(/const RECRUITMENT_CAMPAIGN_LINKS = (\[[\s\S]*?\n\]);/);

assert(match, 'Recruitment referral links are configured');
const links = vm.runInNewContext(match[1]);

assert.deepEqual(JSON.parse(JSON.stringify(links)), [{
  label: 'Facebook',
  source: 'facebook',
  medium: 'social',
  campaign: 'rekrutacja_2026_27',
  content: 'profil',
  url: 'https://deltasigma.pl/ref_f'
}]);
assert.match(redirectHtml, /http-equiv="refresh" content="0;url=\.\.\/\?ref=fb"/);
assert.match(redirectHtml, /window\.location\.replace\("\.\.\/\?ref=fb"\)/);
assert.match(redirectHtml, /<a href="\.\.\/\?ref=fb">/);

console.log('PASS: the admin exposes only the Facebook /ref_f referral link');
