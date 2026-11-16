/* Artist, Update 7 item B1: renders the symbols-v2 APPROVAL SAMPLE sheets (old vs new) headlessly. Nothing in the game changes.
   Output: docs/art-review/symbols-v2/symbols-v2-sample-1.png, -2.png and -3.png (390 CSS px wide at 3x = 1170 px, like his phone).
   Usage (Git Bash, repo root): export PATH="/c/Users/Harrison/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"; node test/art-symbols-v2-shot.js */
const path = require('path'), fs = require('fs');
const { chromium } = require('./pw.js');
(async () => {
  const out = path.join(__dirname, '..', 'docs', 'art-review', 'symbols-v2'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 3 })).newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file:///' + path.join(__dirname, 'art-symbols-v2.html').split(path.sep).join('/'));
  for (const n of [1, 2, 3]) {
    await page.evaluate(k => window.__build(k), n);
    const box = await page.locator('#page').boundingBox();
    const file = path.join(out, 'symbols-v2-sample-' + n + '.png');
    await page.locator('#page').screenshot({ path: file });
    console.log('saved ' + file + ' (' + Math.round(box.width * 3) + ' x ' + Math.round(box.height * 3) + ' px)');
    if (box.width * 3 > 3600 || box.height * 3 > 3600) { errs.push('sheet ' + n + ' is larger than 3,600 px'); }
  }
  const bad = await page.evaluate('window.__alphaCheck()');
  if (bad.length) errs.push('see-through pixels in: ' + bad.join(', '));
  console.log('sizes: ' + (await page.evaluate('window.__sizes()')).join(', '));
  const all = errs.concat(await page.evaluate('window.__err'));
  console.log(all.length ? 'PROBLEMS:\n  ' + all.join('\n  ') : 'no problems; every new pixel is solid');
  await browser.close();
  if (all.length) process.exitCode = 1;
})();
