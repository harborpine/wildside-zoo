/* Artist: the owner's "first 10%" template in style D (C's 2x grid with B's boldness). Nothing in the game changes.
   Saves test/shots/art-template10-sheet.png (today beside new, 4x) and test/shots/art-template10-scene.png (390 CSS px at 3x).
   Usage (Git Bash, repo root): export PATH="/c/Users/Harrison/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"; node test/art-template10.js */
const path = require('path'), fs = require('fs');
const { chromium } = require('./pw.js');
const { hdCopy } = require('./art-density.js');
(async () => {
  const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 })).newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file:///' + path.join(__dirname, 'art-density.html').split(path.sep).join('/'));
  await page.addScriptTag({ content: hdCopy(2, 'ZS_D', { bold: true, outline2: true }) });
  await page.evaluate('window.__template()');
  await page.waitForFunction('window.__done === true', null, { timeout: 60000 });
  for (const [id, file] of [['sample', 'art-template10-sheet.png'], ['zoom', 'art-template10-scene.png']]) {
    const url = await page.evaluate(i => document.getElementById(i).toDataURL('image/png'), id);
    fs.writeFileSync(path.join(out, file), Buffer.from(url.split(',')[1], 'base64'));
    console.log('saved test/shots/' + file);
  }
  const all = errs.concat(await page.evaluate('window.__err'));
  console.log(all.length ? 'PROBLEMS:\n  ' + all.slice(0, 10).join('\n  ') : 'no console errors');
  await browser.close();
  if (all.length) process.exitCode = 1;
})();
