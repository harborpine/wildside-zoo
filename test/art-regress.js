/* Artist: proves density 1 only changed where it was meant to. Fingerprints every sprite (raw pixels) with the saved copy
   test/shots/sprites-before-density.js (the approved baseline: first taken before the density switch, refreshed 2026-11-14 after
   confirming the only differences were the no-see-through fix) and with today's sprites.js, then compares.
   Allowed differences, and nothing else: a pixel that was half see-through (alpha 1..254) in the old copy is now fully solid
   or fully clear (the owner's "nothing see-through" rule). Size, anchor, sortDy and every other pixel must be identical. */
const path = require('path');
const { chromium } = require('./pw.js');
(async () => {
  const browser = await chromium.launch({ headless: true }); const res = [];
  for (const f of ['shots/sprites-before-density.js', '../sprites.js']) {
    const page = await browser.newPage();
    await page.goto('file:///' + path.join(__dirname, 'art-regress.html').split(path.sep).join('/') + '?f=' + f);
    res.push(await page.evaluate(() => window.__print())); await page.close();
  }
  await browser.close();
  const bad = []; let fixed = 0, newHalf = 0;
  res[0].forEach((l, i) => {
    const a = l.split(' '), b = res[1][i].split(' '), name = a.slice(0, 2).join(' ');
    if (a[0] === 'url') return; // data-URL lengths change when pixels change
    if (a.slice(0, -1).join(' ') !== b.slice(0, -1).join(' ')) { bad.push(name + ' size/anchor changed'); return; }
    const pa = Buffer.from(a[a.length - 1], 'base64'), pb = Buffer.from(b[b.length - 1], 'base64');
    if (pa.length !== pb.length) { bad.push(name + ' pixel count changed'); return; }
    let other = 0;
    for (let j = 0; j < pa.length; j += 4) {
      if (pb[j + 3] > 0 && pb[j + 3] < 255) newHalf++;
      if (pa[j] === pb[j] && pa[j + 1] === pb[j + 1] && pa[j + 2] === pb[j + 2] && pa[j + 3] === pb[j + 3]) continue;
      if (pa[j + 3] > 0 && pa[j + 3] < 255 && (pb[j + 3] === 0 || pb[j + 3] === 255)) fixed++; else other++;
    }
    if (other) bad.push(name + ': ' + other + ' pixels changed that were not half see-through');
  });
  console.log(res[0].length + ' sprites compared at density 1: ' + fixed + ' former half see-through pixels are now solid or clear; ' + newHalf + ' half see-through pixels remain');
  console.log(bad.length || newHalf ? 'PROBLEMS: ' + bad.slice(0, 12).join('; ') : 'PASS: every other pixel, size and anchor is identical');
  if (bad.length || newHalf) process.exitCode = 1;
})();
