/* Artist: renders the style-D showcase page (one long phone-width page) for the owner. Nothing in the game changes.
   Saves test/shots/art-showcase.png, or art-showcase-1.png ... -4.png when the page is taller than about 12,000 px.
   Usage (Git Bash, repo root): export PATH="/c/Users/Harrison/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"; node test/art-showcase.js */
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
  await page.goto('file:///' + path.join(__dirname, 'art-showcase.html').split(path.sep).join('/'));
  await page.addScriptTag({ content: hdCopy(2, 'ZS_D', { bold: true, outline2: true }) });
  await page.evaluate('window.__showcase()');
  await page.waitForFunction('window.__done === true', null, { timeout: 120000 });
  const H = await page.evaluate('window.__height'), MAX = 12000, parts = Math.ceil(H / MAX);
  for (const f of fs.readdirSync(out)) if (/^art-showcase(-\d)?\.png$/.test(f)) fs.unlinkSync(path.join(out, f));
  for (let i = 0; i < parts; i++) {
    const y0 = Math.round(H * i / parts), y1 = Math.round(H * (i + 1) / parts);
    const url = await page.evaluate(([a, b]) => { const s = document.getElementById('page'), c = document.createElement('canvas'); c.width = s.width; c.height = b - a; c.getContext('2d').drawImage(s, 0, -a); return c.toDataURL('image/png'); }, [y0, y1]);
    const file = parts === 1 ? 'art-showcase.png' : 'art-showcase-' + (i + 1) + '.png';
    fs.writeFileSync(path.join(out, file), Buffer.from(url.split(',')[1], 'base64'));
    console.log('saved test/shots/' + file + ' (' + (y1 - y0) + ' px tall)');
  }
  const all = errs.concat(await page.evaluate('window.__err'));
  console.log(all.length ? 'PROBLEMS:\n  ' + all.slice(0, 10).join('\n  ') : 'no console errors');
  await browser.close();
  if (all.length) process.exitCode = 1;
})();
