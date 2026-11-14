/* Artist: renders the final style-D showcase straight from sprites.js at density 2. Nothing in the game changes.
   Saves test/shots/art-final-1.png, -2.png ... (1170 px wide, each under 7,000 px tall, nearest-neighbour only).
   Usage (Git Bash, repo root): export PATH="/c/Users/Harrison/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"; node test/art-final.js */
const path = require('path'), fs = require('fs');
const { chromium } = require('./pw.js');
(async () => {
  const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 })).newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file:///' + path.join(__dirname, 'art-final.html').split(path.sep).join('/'));
  const pages = await page.evaluate(() => window.__final(6900));
  for (const f of fs.readdirSync(out)) if (/^art-final-\d+\.png$/.test(f)) fs.unlinkSync(path.join(out, f));
  pages.forEach((u, i) => { fs.writeFileSync(path.join(out, 'art-final-' + (i + 1) + '.png'), Buffer.from(u.split(',')[1], 'base64')); console.log('saved test/shots/art-final-' + (i + 1) + '.png'); });
  const all = errs.concat(await page.evaluate('window.__err'));
  console.log(all.length ? 'PROBLEMS:\n  ' + all.slice(0, 10).join('\n  ') : 'no console errors');
  await browser.close();
  if (all.length) process.exitCode = 1;
})();
