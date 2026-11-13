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
  await page.goto(URL + '?demo=1&play=1'); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready && window.ZDemo, null, { timeout: 8000 });
  await page.evaluate(() => ZT.setWeekMs ? 0 : 0); await sleep(400);
  await shot('idle');
  const hasRenderer = await page.evaluate(() => !!(window.ZRender && ZRender.init));
  console.log('  renderer present: ' + hasRenderer);

  await page.evaluate(() => { ZT.skipReports = true; }); // timing tests: real Moments handlers would otherwise open screens as callers arrive
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
    await page.evaluate(() => { const S = ZT.S; ZRender.startPlacement({ kind: 'hab', t: 'savanna', label: 'Savanna' }, { onPlace: () => ({ ok: true }), onCancel: () => {} }); });
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

  await page.evaluate(() => { ZT.skipReports = false; window.__mom = window.ZMoments; window.ZMoments = undefined; ZCore.WEEK_MS[1] = 600000; ZCore.WEEK_MS[2] = 600000; ZCore.setSpeed(2); ZCore.setSpeed(1); });
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

  // popAll also dismisses a report that is on screen
  await page.evaluate(() => { window.__m2 = window.__mom; window.ZMoments = undefined; ZT.popAll(); ZT.S.reports.length = 0; ZT.S.reports.push({ type: 'mystery', title: 'X', text: 'y' }); ZT.flush(); });
  check(await page.evaluate(() => ZT.stack().join() === 'report-default' && ZCore.busy), 'a report card is showing before popAll ' + await page.evaluate(() => JSON.stringify([ZT.stack(), ZCore.busy, ZT.S.reports.length, ZT.running()])));
  await page.evaluate(() => { ZT.popAll(); }); await sleep(100);
  check(await page.evaluate(() => ZT.running() === true && ZT.S.reports.length === 0), 'popAll releases a showing report so time is not left paused');
  // compact chip row never wraps (375 px list row) and toasts stay off the title bar
  await page.evaluate(() => { ZT.popAll(); ZDemo.show('list'); }); await sleep(300);
  const ch = await page.evaluate(() => { const c = document.querySelector('.layer:not([hidden]) .pbody > .chips'); const tops = [...c.children].map(x => x.getBoundingClientRect().top); return { n: tops.length, same: tops.every(v => Math.abs(v - tops[0]) < 2), fits: c.scrollWidth <= c.clientWidth + 1 }; });
  check(ch.n === 4 && ch.same && ch.fits, 'compact chip row: 3 stats and a grade on one line (' + JSON.stringify(ch) + ')');
  await page.evaluate(() => ZCore.ui.toast('Saved', 'good')); await sleep(300);
  const tg = await page.evaluate(() => ({ t: document.querySelector('.toast').getBoundingClientRect().top, title: document.querySelector('.layer:not([hidden]) .ptitle').getBoundingClientRect().bottom, back: document.querySelector('.layer:not([hidden]) .back').getBoundingClientRect().top }));
  check(tg.t > tg.title && tg.t < tg.back, 'toast sits between the title bar and the Back button (' + JSON.stringify(tg) + ')'); await shot('toast-low');
  await page.evaluate(() => { ZT.popAll(); window.ZMoments = window.__m2; });
  // landscape phone shows the turn-upright card and pauses the clock
  const lctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const lp = await lctx.newPage(); await lp.goto(URL + '?play=1'); await lp.waitForFunction(() => window.ZT && document.documentElement.dataset.ready); await sleep(300);
  check(await lp.evaluate(() => getComputedStyle(document.getElementById('rotate')).display !== 'none' && ZT.running() === false), 'landscape phone: turn-upright card shows and the clock is paused');
  await shot('landscape', lp); await lctx.close();
  // idle shot after reload, then wide-screen desktop
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const dp = await dctx.newPage(); dp.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Access-Control-Allow-Origin|Not allowed to load local resource/.test(m.text())) consoleErrors.push('desktop: ' + m.text()); }); dp.on('pageerror', e => consoleErrors.push('desktop pageerror: ' + e.message));
  await dp.goto(URL + '?demo=1&play=1'); await dp.waitForFunction(() => window.ZT && window.ZDemo && document.documentElement.dataset.ready); await sleep(300);
  await shot('desktop-idle', dp); await dp.evaluate(() => ZDemo.show('list')); await sleep(300); await shot('desktop-list', dp);
  const box = await dp.evaluate(() => { const r = document.getElementById('app').getBoundingClientRect(); return { x: r.x, w: r.width, h: r.height }; });
  check(box.w <= 431 && Math.abs(box.x - (1280 - box.w) / 2) < 2 && box.h === 800, 'desktop: column is phone-width, centred, full height (' + JSON.stringify(box) + ')');
  await dctx.close();

  check(consoleErrors.length === 0 && (await page.evaluate(() => ZT.errors.length)) === 0, 'no console or page errors' + (consoleErrors.length ? ': ' + consoleErrors.slice(0, 3).join(' || ') : ''));
  if (await page.evaluate(() => ZT.errors.length)) console.log('  ZT.errors: ' + JSON.stringify(await page.evaluate(() => ZT.errors)));

  // ---- save slots, title screen, ?play=1, full-screen heights
  const fresh = async (vp, q, init, doc) => { const c = await browser.newContext({ viewport: vp || { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); if (init) await c.addInitScript(init, doc); const p = await c.newPage(); p.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message)); await p.goto(URL + (q || '')); await p.waitForFunction(() => window.ZT && document.documentElement.dataset.ready, null, { timeout: 8000 }); await sleep(300); return { c, p }; };
  { const { c, p } = await fresh(null, '');
    check(await p.evaluate(() => ZT.S === null && ZCore.slot === null && ZT.stack().length === 1 && ZT.running() === false), 'title screen shows first (no game in play, clock stopped)');
    await shot('title', p);
    check(await p.evaluate(() => ZT.slots().length === 3 && ZT.slots().every(s => s.empty)), 'three empty slots listed');
    await p.evaluate(() => { ZT.skipReports = true; ZT.newGame({ slot: 1, zooName: 'Alpha' }); ZT.tick(5); ZT.save(); });
    const s1 = await p.evaluate(() => ({ ...ZT.slots()[0], week: ZT.S.week, stack: ZT.stack().length, slot: ZCore.slot }));
    check(s1.zooName === 'Alpha' && !s1.empty && s1.stack === 0 && s1.slot === 1 && s1.dateText && s1.rankStars >= 1, 'new game in slot 1 starts play and is listed (' + s1.dateText + ')');
    await p.evaluate(() => { ZT.newGame({ slot: 2, zooName: 'Beta', tutorial: true }); });
    const s2 = await p.evaluate(() => ({ a: ZT.slots()[0], b: ZT.slots()[1], tut: ZT.S.ui.tutorial }));
    check(s2.a.zooName === 'Alpha' && s2.a.savedAt === s1.savedAt && s2.b.zooName === 'Beta' && s2.tut.on === true, 'new game into slot 2 leaves slot 1 untouched and sets the tutorial flag');
    const rt = await p.evaluate(() => { ZT.title(); const onTitle = ZT.S === null && ZCore.slot === null && ZT.stack().length === 1 && ZT.running() === false; const ok = ZT.loadSlot(1); return { onTitle, ok, week: ZT.S.week, slot: ZCore.slot, stack: ZT.stack().length, tut: ZT.S.ui.tutorial.on, name: ZT.S.zooName }; });
    check(rt.onTitle && rt.ok && rt.week === s1.week && rt.slot === 1 && rt.stack === 0 && rt.tut === false && rt.name === 'Alpha', 'toTitle then loadSlot round trip restores slot 1 and starts play');
    const dl = await p.evaluate(() => { ZT.deleteSlot(2); const a = ZT.slots(); ZT.deleteSlot(1); return { two: a[1].empty, one: a[0].empty, slotNow: ZCore.slot, stack: ZT.stack().length, after: ZT.slots()[0].empty }; });
    check(dl.two && !dl.one && dl.slotNow === null && dl.stack === 1 && dl.after, 'delete slot works; deleting the slot in play returns to the title');
    const doc = await p.evaluate(() => { ZT.newGame({ slot: 3, zooName: 'Mig' }); ZT.tick(3); ZT.save(); return localStorage.getItem('wildside-zoo-v3-slot3'); });
    await c.close();
    const m = await fresh(null, '', d => { if (!sessionStorage.getItem('mig')) { sessionStorage.setItem('mig', '1'); localStorage.setItem('wildside-zoo-v3', d); } }, doc);
    const mg = await m.p.evaluate(() => ({ s: ZT.slots()[0], old: localStorage.getItem('wildside-zoo-v3'), ok: ZT.loadSlot(1), name: ZT.S && ZT.S.zooName }));
    check(!mg.s.empty && mg.s.zooName === 'Mig' && mg.old === null && mg.ok && mg.name === 'Mig', 'an old single save is moved into slot 1 once and the old key removed');
    await m.c.close(); }
  { const { c, p } = await fresh(null, '?play=1');
    check(await p.evaluate(() => ZT.S !== null && ZCore.slot === 1 && ZT.stack().length === 0 && ZT.S.ui.tutorial.on === false && !ZT.slots()[0].empty), '?play=1 skips the title: new game in slot 1, no tutorial');
    await p.evaluate(() => { ZT.skipReports = true; ZT.tick(4); ZT.save(); }); const w = await p.evaluate(() => ZT.S.week);
    await p.reload(); await p.waitForFunction(() => window.ZT && document.documentElement.dataset.ready); await sleep(300);
    check(await p.evaluate(w => ZT.S.week === w, w), '?play=1 loads slot 1 when it exists');
    await c.close(); }
  for (const [w, h] of [[390, 664], [390, 753], [375, 553], [375, 647]]) {
    const { c, p } = await fresh({ width: w, height: h }, '?play=1');
    const r = await p.evaluate(() => { ZCore.push({ id: 'hh', title: 'Title', render() {} }); const b = document.querySelector('.layer:not([hidden]) .pbody'), a = document.getElementById('app').getBoundingClientRect(); return { body: Math.round(b.clientHeight), bodyW: Math.round(b.clientWidth), appW: Math.round(a.width), appH: Math.round(a.height), x: Math.round(a.x) }; });
    if (w === 375 && h === 647) { const cr = await p.evaluate(() => { const u = ZCore.ui; ZCore.push({ id: 'cr', title: 'T', render(b) { b.appendChild(u.list([{ title: 'Lion', sub: 'x', img: u.icon('m-build').src || null, right: u.sign(2) }])); b.appendChild(u.chipRow([u.astat('charm', 78), u.astat('vigor', 61), u.astat('wit', 49), u.grade('a')])); } }); const c = document.querySelector('.layer:not([hidden]) .chips'), tops = [...c.children].map(x => { const r = x.getBoundingClientRect(); return r.top + r.height / 2; }); return { n: tops.length, one: tops.every(v => Math.abs(v - tops[0]) < 3), fits: c.scrollWidth <= c.clientWidth + 1, w: c.scrollWidth }; });
      check(cr.n === 4 && cr.one && cr.fits, 'icon chip row (3 stats + grade) fits on one line at 375 px (' + JSON.stringify(cr) + ')'); await shot('icon-chips', p); }
    console.log('  panel body at ' + w + 'x' + h + ': ' + JSON.stringify(r));
    check(r.appW === w && r.appH === h && r.x === 0, 'full screen at ' + w + 'x' + h + ': app fills the whole viewport');
    await c.close(); }
  await browser.close();
}
(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit'];
  for (const n of names) { try { await run(n); } catch (e) { failures++; console.log('  FAIL ' + n + ' crashed: ' + e.message); } }
  console.log(failures ? 'FAILED: ' + failures : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})();
