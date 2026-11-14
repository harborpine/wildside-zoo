/* Before/after look at the interface type. Usage: node test/shell-font-shot.js before|after  -> test/shots/shell-font-<tag>-*.png (393x852, 2x) */
const path = require('path'); const { chromium } = require('./pw.js');
const tag = process.argv[2] || 'after', ROOT = path.resolve(__dirname, '..').split(path.sep).join('/'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), p = await c.newPage();
  await p.goto('file:///' + ROOT + '/index.html?play=1&demo=1&standalone=1&inset=34&insett=54'); await p.waitForFunction(() => window.ZT && window.ZDemo && document.documentElement.dataset.ready); await sleep(500);
  await p.evaluate(() => { ZT.skipReports = true; ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 6e8; });
  const out = n => path.join(__dirname, 'shots', 'shell-font-' + tag + '-' + n + '.png');
  await p.screenshot({ path: out('strip'), clip: { x: 0, y: 0, width: 393, height: 150 } });
  await p.evaluate(() => ZT.openMenu()); await sleep(400); await p.screenshot({ path: out('menu') });
  await p.evaluate(() => { ZT.popAll(); ZDemo.show('list'); }); await sleep(400); await p.screenshot({ path: out('list') });
  await p.evaluate(() => { ZT.popAll(); ZDemo.show('choice'); }); await sleep(400); await p.screenshot({ path: out('popup') });
  await b.close();
})();
