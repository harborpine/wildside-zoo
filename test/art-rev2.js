/* Artist: revision 2 sheet for the owner (gorilla rare colours, three polar bear designs). Nothing in the game changes.
   Saves test/shots/art-rev2.png (1170 px wide, under 7,000 px tall, nearest-neighbour only).
   Usage (Git Bash, repo root): export PATH="/c/Users/Harrison/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"; node test/art-rev2.js */
const path = require('path'), fs = require('fs');
const { chromium } = require('./pw.js');
const { hdCopy } = require('./art-density.js');
(async () => {
  const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 })).newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file:///' + path.join(__dirname, 'art-rev2.html').split(path.sep).join('/'));
  await page.addScriptTag({ content: hdCopy(2, 'ZS_D', { bold: true, outline2: true }) });
  const url = await page.evaluate(() => window.__rev2());
  fs.writeFileSync(path.join(out, 'art-rev2.png'), Buffer.from(url.split(',')[1], 'base64')); console.log('saved test/shots/art-rev2.png');
  const all = errs.concat(await page.evaluate('window.__err'));
  console.log(all.length ? 'PROBLEMS:\n  ' + all.slice(0, 10).join('\n  ') : 'no console errors');
  await browser.close();
  if (all.length) process.exitCode = 1;
})();
