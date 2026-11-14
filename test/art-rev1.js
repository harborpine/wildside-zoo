/* Artist: revision 1 of style D for the owner. Nothing in the game changes.
     node test/art-rev1.js before   keeps today's style-D pictures of the 8 items (test/shots/rev1-before.json)
     node test/art-rev1.js          renders BEFORE | AFTER sheets  test/shots/art-rev1-1.png, -2.png ...
                                    and the real-size scene         test/shots/art-rev1-scene.png
   Every image stays under 7,000 px tall and 1,400 px wide (it is sent to a phone). Crisp nearest-neighbour scaling only.
   Usage (Git Bash, repo root): export PATH="/c/Users/Harrison/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"; node test/art-rev1.js */
const path = require('path'), fs = require('fs');
const { chromium } = require('./pw.js');
const { hdCopy } = require('./art-density.js');
const DEV = 9; // 3x phone size: an art pixel is 6 phone pixels at 1x, so 18 at 3x; style D's fine pixel is half that
(async () => {
  const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 })).newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file:///' + path.join(__dirname, 'art-rev1.html').split(path.sep).join('/'));
  await page.addScriptTag({ content: hdCopy(2, 'ZS_D', { bold: true, outline2: true }) });
  const keep = path.join(out, 'rev1-before.json');
  if (process.argv[2] === 'before') {
    fs.writeFileSync(keep, JSON.stringify(await page.evaluate(d => window.__parts(d), DEV * 2)));
    console.log('kept the BEFORE pictures in test/shots/rev1-before.json');
  } else {
    const before = JSON.parse(fs.readFileSync(keep, 'utf8'));
    const pages = await page.evaluate(([b, d]) => window.__sheet(b, d, 6900), [before, DEV * 2]);
    for (const f of fs.readdirSync(out)) if (/^art-rev1-\d\.png$/.test(f)) fs.unlinkSync(path.join(out, f));
    pages.forEach((u, i) => { fs.writeFileSync(path.join(out, 'art-rev1-' + (i + 1) + '.png'), Buffer.from(u.split(',')[1], 'base64')); console.log('saved test/shots/art-rev1-' + (i + 1) + '.png'); });
    const sc = await page.evaluate(() => window.__scene());
    fs.writeFileSync(path.join(out, 'art-rev1-scene.png'), Buffer.from(sc.split(',')[1], 'base64')); console.log('saved test/shots/art-rev1-scene.png');
  }
  const all = errs.concat(await page.evaluate('window.__err'));
  console.log(all.length ? 'PROBLEMS:\n  ' + all.slice(0, 10).join('\n  ') : 'no console errors');
  await browser.close();
  if (all.length) process.exitCode = 1;
})();
