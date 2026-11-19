const fs = require('node:fs');
const assert = require('node:assert/strict');
const {test} = require('node:test');

test('Public page link previews use me6 instead of the old me3 photo', () => {
  const image = 'https://deltasigma.pl/img/me6.jpeg';
  for (const page of ['index.html','zapisy.html','kontakt.html','na_biezaco.html',
    'osmoklasista.html','matura_podstawowa.html','matura_rozszerzona.html','wyniki.html']) {
    const html = fs.readFileSync(page, 'utf8');
    assert.equal(html.match(/<meta property="og:image" content="([^"]+)"/)?.[1], image, page);
    assert.equal(html.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1], image, page);
    assert(!html.includes('img/me3.webp'), page);
  }
  const home = fs.readFileSync('index.html', 'utf8');
  const structured = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(structured['@graph'].find(item => item['@type'] === 'Person').image, image);
  assert(home.includes('<meta property="og:image:width" content="840">'));
  assert(home.includes('<meta property="og:image:height" content="936">'));
  const jpeg = fs.readFileSync('img/me6.jpeg');
  assert.equal(jpeg.readUInt16BE(0), 0xffd8);
  assert(jpeg.length > 10000);
});
