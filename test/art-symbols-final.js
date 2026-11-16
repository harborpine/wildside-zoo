/* Artist, Update 7 item B2: renders review sheets of EVERY symbol in the new flat style, as the game draws them (density 2).
   Output: docs/art-review/symbols-v2/symbols-v2-all-1.png ... (390 CSS px wide at 3x = 1170 px, like the owner's phone; under 3,600 px tall).
   Usage (Git Bash, repo root): export PATH="/c/Users/Harrison/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"; node test/art-symbols-final.js */
const path = require('path'), fs = require('fs');
const { chromium } = require('./pw.js');
(async () => {
  const out = path.join(__dirname, '..', 'docs', 'art-review', 'symbols-v2'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 3 })).newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file:///' + path.join(__dirname, 'art-symbols-final.html').split(path.sep).join('/'));
  const n = await page.evaluate('window.__sheets');
  for (let i = 1; i <= n; i++) {
    await page.evaluate(k => window.__build(k), i);
    const box = await page.locator('#page').boundingBox(), file = path.join(out, 'symbols-v2-all-' + i + '.png');
    await page.locator('#page').screenshot({ path: file });
    console.log('saved ' + file + ' (' + Math.round(box.width * 3) + ' x ' + Math.round(box.height * 3) + ' px)');
    if (box.width * 3 > 3600 || box.height * 3 > 3600) errs.push('sheet ' + i + ' is larger than 3,600 px');
  }
  const rep = await page.evaluate('window.__report()'), miss = await page.evaluate('window.__missing');
  if (rep.half.length) errs.push('see-through pixels in: ' + rep.half.join(', '));
  if (miss.length) errs.push('ids not on any sheet: ' + miss.join(', '));
  console.log(rep.n + ' symbol ids. sizes: ' + rep.sizes.join(' | '));
  const all = errs.concat(await page.evaluate('window.__err'));
  console.log(all.length ? 'PROBLEMS:\n  ' + all.join('\n  ') : 'no problems; every pixel of every symbol is solid');
  await browser.close();
  if (all.length) process.exitCode = 1;
})();
