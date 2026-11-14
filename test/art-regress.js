/* Artist: proves density 1 is unchanged: fingerprints every sprite with test/shots/sprites-before-density.js (a copy of
   sprites.js taken before the density switch was added) and with today's sprites.js, and compares them. */
const path = require('path'), fs = require('fs');
const { chromium } = require('./pw.js');
(async () => {
  const browser = await chromium.launch({ headless: true }); const res = [];
  for (const f of ['shots/sprites-before-density.js', '../sprites.js']) {
    const page = await browser.newPage();
    await page.goto('file:///' + path.join(__dirname, 'art-regress.html').split(path.sep).join('/') + '?f=' + f);
    res.push(await page.evaluate(() => window.__print())); await page.close();
  }
  await browser.close();
  const diff = []; res[0].forEach((l, i) => { if (l !== res[1][i]) diff.push(l.split(' ').slice(0, 3).join(' ')); });
  console.log(res[0].length + ' sprites compared: ' + (diff.length ? diff.length + ' DIFFER: ' + diff.slice(0, 10).join('; ') : 'all identical at density 1'));
  if (diff.length) process.exitCode = 1;
})();
