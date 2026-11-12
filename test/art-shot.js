/* Artist's contact sheets: renders test/art-sheet.html to PNG files in test/shots/ with headless Chromium (never a visible window).
   Usage (Git Bash, from the repo root):
     export PATH="/c/Users/Harrison/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"
     node test/art-shot.js            every sheet
     node test/art-shot.js scene people animals-savanna     only the sheets named */
const path = require('path'), fs = require('fs');
const { chromium } = require('./pw.js');
const BIOMES = ['savanna', 'jungle', 'desert', 'arctic', 'mountain', 'ocean', 'paleo', 'mythic'];
const ALL = BIOMES.map(b => 'animals-' + b).concat(['people', 'tiles', 'fences', 'buildings', 'extras', 'patch', 'scene', 'scene2']);
(async () => {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
  const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let bad = 0;
  for (const s of want) {
    const isScene = s.indexOf('scene') === 0;
    const ctx = await browser.newContext({ viewport: isScene ? { width: 390, height: 844 } : { width: 1500, height: 1000 }, deviceScaleFactor: isScene ? 2 : 1 });
    const page = await ctx.newPage(); const errs = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto('file:///' + path.join(__dirname, 'art-sheet.html').replace(/\\/g, '/') + '?s=' + s);
    await page.waitForFunction('window.__done === true', null, { timeout: 30000 });
    const e2 = await page.evaluate('window.__err');
    const file = path.join(out, 'art-' + s + '.png');
    await page.locator('#c').screenshot({ path: file });
    const all = errs.concat(e2); if (all.length) bad++;
    console.log((all.length ? 'PROBLEM ' : 'ok      ') + 'test/shots/art-' + s + '.png' + (all.length ? '\n   ' + all.slice(0, 6).join('\n   ') : ''));
    await ctx.close();
  }
  await browser.close();
  if (bad) process.exitCode = 1;
})();
