/* Shell screenshots and checks. Headless only.  Usage: node test/shell-shot.js [chromium|webkit ...]   (default: both) */
const path = require('path'), fs = require('fs');
const pw = require('./pw.js');
const ROOT = path.resolve(__dirname, '..'), URL = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html';
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg, tag) => { console.log((cond ? '  PASS ' : '  FAIL ') + msg); if (!cond) failures++; };

async function run(name) {
  const tag = name === 'chromium' ? '' : '-' + name;
  console.log('== ' + name);
  const browser = await pw[name].launch();   // headless by default
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: name !== 'firefox' });
  const page = await ctx.newPage(); const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Access-Control-Allow-Origin|Not allowed to load local resource/.test(m.text())) consoleErrors.push(m.text()); }); page.on('requestfailed', rq => { const f = rq.url().split('/').pop().split('?')[0]; if (!/^(sprites|render|menus|moments).js$|^manifest/.test(f) && !/^icon/.test(f)) consoleErrors.push('missing file: ' + f); }); page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  const shot = (n, p) => (p || page).screenshot({ path: path.join(SHOTS, 'shell-' + n + tag + '.png') });
  await page.goto(URL + '?demo=1'); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready && window.ZDemo, null, { timeout: 8000 });
  await page.evaluate(() => ZT.setWeekMs ? 0 : 0); await sleep(400);
  await shot('idle');
  const hasRenderer = await page.evaluate(() => !!(window.ZRender && ZRender.init));
  console.log('  renderer present: ' + hasRenderer);

  await page.evaluate(() => ZCore.onReport('*', (r, done) => done())); // timing tests: skip report cards
  // pause while the menu is open, resume after Back (fast clock so the test is short)
  await page.evaluate(() => { ZCore.WEEK_MS[1] = 300; ZCore.WEEK_MS[2] = 150; ZCore.setSpeed(1); });
  await page.touchscreen.tap(195, 420); await sleep(300);
  check(await page.evaluate(() => ZT.stack().length > 0 && ZT.running() === false), 'tapping the floor opens a screen and pauses the clock');
  await shot('menu-open');
  const w0 = await page.evaluate(() => ZT.S.week); await sleep(1200);
  check(await page.evaluate(w => ZT.S.week === w, w0), 'no weeks pass while the menu is open');
  await page.tap('.layer:not([hidden]) .back'); await sleep(300);
  check(await page.evaluate(() => ZT.stack().length === 0 && ZT.running() === true), 'Back closes the menu and the clock runs again');
  await sleep(1500); check(await page.evaluate(w => ZT.S.week > w, w0), 'weeks pass again after Back');

  if (hasRenderer) {   // placement mode pauses the clock and its bar sits inside the safe area
    await page.evaluate(() => { const S = ZT.S; ZRender.startPlacement({ kind: 'fac', t: 'snack', label: 'Snack' }, { onPlace: () => ({ ok: true }), onCancel: () => {} }); });
    await sleep(500); await shot('placement');
    check(await page.evaluate(() => ZRender.placing() && ZT.running() === false), 'placement mode pauses the clock');
    const bar = await page.evaluate(() => { const r = document.getElementById('placement-bar').getBoundingClientRect(); return { b: r.bottom, h: r.height, n: document.querySelectorAll('#placement-bar button').length }; });
    check(bar.n === 3 && bar.b <= 844 && bar.h >= 56, 'placement bar has 3 buttons, at least 56 px tall, inside the screen (' + JSON.stringify(bar) + ')');
    await page.evaluate(() => ZRender.stopPlacement()); await sleep(200);
    check(await page.evaluate(() => ZT.running() === true), 'clock resumes after placement ends');
  }
  // speed 2 ticks faster than speed 1
  const rate = async sp => { await page.evaluate(s => ZCore.setSpeed(s), sp); await sleep(100); const a = await page.evaluate(() => ZT.S.week); await sleep(3000); return (await page.evaluate(() => ZT.S.week)) - a; };
  const r1 = await rate(1), r2 = await rate(2); console.log('  weeks in 3s: speed1=' + r1 + ' speed2=' + r2);
  check(r2 > r1 * 1.5 && r1 >= 3, 'speed 2 ticks about twice as fast as speed 1');
  await page.evaluate(() => ZCore.setSpeed(1));

  // demo screens
  for (const n of ['grid', 'list', 'sub', 'choice', 'reveal', 'reveal2', 'misc', 'confirm', 'log']) {
    await page.evaluate(() => ZT.popAll()); await page.evaluate(n => ZDemo.show(n), n); await sleep(350); await shot('demo-' + n);
  }
  await page.evaluate(() => ZT.popAll()); await page.evaluate(() => ZDemo.show('toast')); await sleep(300); await shot('demo-toast'); await sleep(3200);
  // sub-screen with Back returns to the list
  await page.evaluate(() => { ZT.popAll(); ZDemo.show('list'); }); await sleep(300);
  await page.tap('.row.tappable'); await sleep(300);
  check(await page.evaluate(() => ZT.stack().join() === 'demo-list,demo-sub'), 'list row opens sub-screen on top of the list');
  await page.tap('.layer:not([hidden]) .back'); await sleep(300);
  check(await page.evaluate(() => ZT.stack().join() === 'demo-list'), 'Back returns to the list');
  await page.evaluate(() => ZT.popAll());

  await page.evaluate(() => { ZCore.onReport('*', null); ZCore.WEEK_MS[1] = 600000; ZCore.WEEK_MS[2] = 600000; ZCore.setSpeed(2); ZCore.setSpeed(1); });
  // report queue: unhandled type gets a default card, in order
  await page.evaluate(() => { ZT.S.reports.push({ type: 'mystery', title: 'First', text: 'one' }, { type: 'mystery', title: 'Second', text: 'two' }); ZT.flush(); }); await sleep(300);
  check(await page.evaluate(() => ZT.stack().join() === 'report-default' && document.querySelector('.ptitle').textContent === 'First'), 'default report card shows the first report');
  await shot('report-default');
  await page.tap('.btn.primary'); await sleep(400);
  check(await page.evaluate(() => document.querySelector('.ptitle') && document.querySelector('.ptitle').textContent === 'Second'), 'next report shows after the first is dismissed');
  await page.tap('.btn.primary'); await sleep(400);
  check(await page.evaluate(() => ZT.stack().length === 0 && ZT.S.reports.length === 0), 'queue empties');

  // log and save/reload
  await page.evaluate(() => { ZT.act('buyLand'); ZT.act('noSuchAction'); ZT.tick(3); });
  const logLen = await page.evaluate(() => ZT.logText().length), logHas = await page.evaluate(() => /"name":"noSuchAction"[^}]*"ok":false/.test(ZT.logText()) && /LIVE SNAPSHOT/.test(ZT.logText()));
  check(logLen > 300 && logHas, 'log text is non-empty and records actions, refusals and a snapshot (' + logLen + ' chars)');
  await page.evaluate(() => { ZT.popAll(); ZCore.WEEK_MS[1] = 600000; ZCore.WEEK_MS[2] = 600000; });   // freeze the clock so values stay put
  await sleep(200);
  const before = await page.evaluate(() => { ZT.save(); return { w: ZT.S.week, m: Math.round(ZT.S.money) }; });
  await page.reload(); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready, null, { timeout: 8000 }); await sleep(300);
  const after = await page.evaluate(() => ({ w: ZT.S.week, m: Math.round(ZT.S.money) }));
  check(before.w === after.w && before.m === after.m && before.w > 0, 'save then reload restores week and money (' + JSON.stringify(before) + ' -> ' + JSON.stringify(after) + ')');
  check(await page.evaluate(() => ZT.logText().length > 300), 'log survives a reload');

  // nothing scrolls the page
  const sc = await page.evaluate(async () => {
    window.scrollTo(0, 200); document.scrollingElement.scrollTop = 200; ZDemo && 0; const d = document.scrollingElement;
    return { y: window.scrollY, top: d.scrollTop, over: d.scrollHeight > d.clientHeight + 1, ow: d.scrollWidth > d.clientWidth + 1 };
  });
  check(sc.y === 0 && sc.top === 0 && !sc.over && !sc.ow, 'the page itself never scrolls');

  // idle shot after reload, then wide-screen desktop
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const dp = await dctx.newPage(); dp.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Access-Control-Allow-Origin|Not allowed to load local resource/.test(m.text())) consoleErrors.push('desktop: ' + m.text()); }); dp.on('pageerror', e => consoleErrors.push('desktop pageerror: ' + e.message));
  await dp.goto(URL + '?demo=1'); await dp.waitForFunction(() => window.ZT && window.ZDemo && document.documentElement.dataset.ready); await sleep(300);
  await shot('desktop-idle', dp); await dp.evaluate(() => ZDemo.show('list')); await sleep(300); await shot('desktop-list', dp);
  const box = await dp.evaluate(() => { const r = document.getElementById('app').getBoundingClientRect(); return { x: r.x, w: r.width, h: r.height }; });
  check(box.w <= 431 && Math.abs(box.x - (1280 - box.w) / 2) < 2 && box.h === 800, 'desktop: column is phone-width, centred, full height (' + JSON.stringify(box) + ')');
  await dctx.close();

  check(consoleErrors.length === 0 && (await page.evaluate(() => ZT.errors.length)) === 0, 'no console or page errors' + (consoleErrors.length ? ': ' + consoleErrors.slice(0, 3).join(' || ') : ''));
  if (await page.evaluate(() => ZT.errors.length)) console.log('  ZT.errors: ' + JSON.stringify(await page.evaluate(() => ZT.errors)));
  await browser.close();
}
(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit'];
  for (const n of names) { try { await run(n); } catch (e) { failures++; console.log('  FAIL ' + n + ' crashed: ' + e.message); } }
  console.log(failures ? 'FAILED: ' + failures : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})();
