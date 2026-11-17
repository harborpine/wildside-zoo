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
  { const { c, p } = await fresh(null, '?play=blank');
    const bl = await p.evaluate(() => { ZT.skipReports = true; const S = ZT.S; const n0 = S.items.length; ZT.tick(14); ZT.save(); const i = ZT.slots()[0]; const snap = ZT.logText().indexOf('Q1 weeks') >= 0; document.getElementById('news'); return { n0, ticks: ZT.S.week, spOk: Array.isArray(i.species), animals: i.animals, snap, strip: document.getElementById('s-money').textContent, tutorial: S.ui.tutorial.on }; });
    check(bl.n0 === 0 || bl.n0 === undefined || bl.ticks >= 14, '?play=blank: starts (items at start: ' + bl.n0 + ') and survives ticks and a quarterly snapshot');
    check(bl.spOk && bl.snap && bl.strip.charAt(0) === String.fromCharCode(36), 'blank zoo: slot summary has species list, the log has a quarter snapshot, the strip shows money (' + JSON.stringify({ animals: bl.animals }) + ')');
    const st = await p.evaluate(() => { ZT.newGame({ slot: 2, starter: false }); const a = ZT.S.items.length; ZT.newGame({ slot: 3 }); return { blank: a, classic: ZT.S.items.length }; });
    check(st.blank === 0 && st.classic > 0, 'ZT.newGame({starter:false}) is bare land, ZT.newGame() is the classic starter (' + JSON.stringify(st) + ')');
    await p.evaluate(() => ZT.title()); await sleep(300);
    check(await p.evaluate(() => ZT.S === null && ZT.stack().length === 1 && document.body.classList.contains('title-on')), 'title shows over a zoo with nothing built');
    await c.close(); }
  for (const [w, h] of [[393, 852], [440, 956]]) {   // installed-app branch with a simulated 34 px home-indicator inset
    const { c, p } = await fresh({ width: w, height: h }, '?play=1&standalone=1&inset=34');
    await p.evaluate(() => { ZT.skipReports = true; ZT.S.news.unshift({ w: ZT.S.week, msg: 'A visitor left a nice note.', kind: 'good' }); ZCore.updateStrip(); }); await sleep(500);
    const g = await p.evaluate(() => { const a = document.getElementById('app').getBoundingClientRect(), cv = document.getElementById('floor').getBoundingClientRect(), n = document.getElementById('news'), nb = n.getBoundingClientRect(), top = document.getElementById('strip');
      const pt = document.elementFromPoint(innerWidth / 2, innerHeight - 2); return { appBottom: Math.round(a.bottom), canvasBottom: Math.round(cv.bottom), h: innerHeight, newsBottom: Math.round(nb.bottom), shown: n.classList.contains('show') && getComputedStyle(n).visibility === 'visible', under: pt && (pt.id || pt.tagName), stripPadTop: getComputedStyle(top).paddingTop, sa: document.documentElement.classList.contains('sa') }; });
    check(g.sa && g.appBottom === g.h && g.canvasBottom === g.h && g.under === 'floor' && g.shown && g.newsBottom <= g.h - 34 && g.newsBottom >= g.h - 34 - 14, 'installed-app mode at ' + w + 'x' + h + ': canvas runs to the very bottom (floor under the inset), the news overlay sits just above the inset (' + JSON.stringify(g) + ')');
    await shot('news-overlay-' + w, p); await sleep(4900);
    check(await p.evaluate(() => getComputedStyle(document.getElementById('news')).visibility === 'hidden' && getComputedStyle(document.getElementById('news')).pointerEvents === 'none'), 'the news overlay fades out and stops catching taps (' + w + ')');
    await p.evaluate(() => { ZRender.startPlacement({ kind: 'hab', t: 'savanna', label: 'S' }, { onPlace: () => ({ ok: true }), onCancel: () => {} }); }); await sleep(400);
    const pb = await p.evaluate(() => [...document.querySelectorAll('#placement-bar button')].map(b => Math.round(b.getBoundingClientRect().bottom)));
    check(pb.length >= 2 && pb.every(v => v <= h - 34), 'placement buttons are fully above the inset (' + w + ': ' + pb + ')'); await p.evaluate(() => ZRender.stopPlacement());
    await p.evaluate(() => ZCore.push({ id: 'bk', title: 'T', render() {} })); await sleep(300);
    const bk = await p.evaluate(() => { const L = document.querySelector('.layer:not([hidden])'), b = Math.round(L.querySelector('.back').getBoundingClientRect().bottom), pn = L.querySelector('.panel').getBoundingClientRect(), under = document.elementFromPoint(innerWidth / 2, innerHeight - 3); return { back: b, h: innerHeight, panelBottom: Math.round(pn.bottom), underIsPanel: !!(under && under.closest('.panel')) }; });
    check(bk.back + 3 <= bk.h - 34 && bk.back >= bk.h - 34 - 10 && bk.panelBottom >= bk.h && bk.underIsPanel, 'update 7: the panel runs to the bottom of the screen (no zoo under it) and the Back button, outline included, ends within 10 px above the inset (' + w + ': ' + JSON.stringify(bk) + ')'); await shot('back-inset-' + w, p); await p.evaluate(() => ZT.popAll());
    await p.evaluate(() => ZCore.screens.screenCheck()); await sleep(300); await shot('screencheck-' + w, p);
    check(await p.evaluate(() => ZT.stack().join() === 'screencheck' && document.querySelector('.pbody').textContent.indexOf('safe top') >= 0), 'Screen check readout shows (' + w + ')');
    await c.close(); }
  { // layout viewport shorter than the physical screen (the iOS home-screen quirk): the app must still cover the whole screen, entering through the title
    const c = await browser.newContext({ viewport: { width: 393, height: 790 }, screen: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await c.newPage(); p.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
    await p.goto(URL + '?standalone=1&inset=34&insett=54'); await p.waitForFunction(() => window.ZT && document.documentElement.dataset.ready); await sleep(300);
    await p.evaluate(() => { ZT.newGame({ slot: 1 }); ZT.title(); }); await sleep(200); await p.evaluate(() => { ZT.skipReports = true; ZT.loadSlot(1); }); await sleep(300);
    const r = await p.evaluate(() => { const a = document.getElementById('app').getBoundingClientRect(), d = getComputedStyle(document.getElementById('s-date')), mo = getComputedStyle(document.getElementById('s-money')), h = getComputedStyle(document.documentElement), b = getComputedStyle(document.body), top = document.getElementById('s-date').getBoundingClientRect().top;
      return { appH: Math.round(a.height), screenH: screen.height, color: d.color, opacity: d.opacity, filter: d.filter, vis: d.visibility, moneyColor: mo.color, weightSame: d.fontWeight === mo.fontWeight, clipH: h.overflowY, clipB: b.overflowY, dateTop: Math.round(top), titleOn: document.body.classList.contains('title-on') }; });
    check(r.appH >= r.screenH && r.clipH === 'visible' && r.clipB === 'visible', 'short layout viewport (790 inside an 852 screen): #app is at least screen-tall and html/body do not clip (' + JSON.stringify({ appH: r.appH, clipH: r.clipH, clipB: r.clipB }) + ')');
    const tx = await p.evaluate(() => { const top = id => Math.round(document.getElementById(id).getBoundingClientRect().top * 10) / 10, st = document.getElementById('strip').getBoundingClientRect(), sr = document.querySelector('#s-stars .stars').getBoundingClientRect(); return { date: top('s-date'), money: top('s-money'), vis: top('s-vis'), stripH: Math.round(st.height), starsTop: Math.round(sr.top), starsBottom: Math.round(sr.bottom) }; });
    check(r.color === 'rgb(255, 255, 255)' && r.opacity === '1' && r.filter === 'none' && r.vis === 'visible' && r.weightSame && !r.titleOn && tx.date >= 54 + 30 && tx.money >= 54 + 30 && tx.vis >= 54 + 30, 'update 7: every piece of TEXT in the strip (date, money, visitors) starts 30+ px below the top inset; date full white, opaque, same weight as the money (' + JSON.stringify(tx) + ')');
    check(tx.stripH <= 54 + 62 && tx.starsTop >= 54 + 12 && tx.starsBottom <= 54 + 30, 'update 7: the strip stays compact (at most 62 px under the inset; it was 69) with only the star row in the 30 px zone (' + JSON.stringify({ stripH: tx.stripH, stars: [tx.starsTop, tx.starsBottom] }) + ')');
    await p.evaluate(() => ZCore.screens.screenCheck()); await sleep(300); await shot('screencheck-short', p);
    await c.close(); }
  { const { c, p } = await fresh({ width: 320, height: 568 }, '?play=1');
    const wd = await p.evaluate(() => { ZCore.push({ id: 'w', title: 'T', render(b) { b.appendChild(ZCore.ui.chipRow([ZCore.ui.astat('charm', 78), ZCore.ui.astat('vigor', 61), ZCore.ui.astat('wit', 49), ZCore.ui.grade('a')])); b.appendChild(ZCore.ui.grid([{ icon: 'm-build', label: 'Build' }, { icon: 'm-info', label: 'Info' }, { icon: 'm-system', label: 'System' }])); } }); const a = document.getElementById('app'), d = document.scrollingElement; return { app: a.scrollWidth, w: a.clientWidth, page: d.scrollWidth, vw: innerWidth, over: [...document.querySelectorAll('.layer:not([hidden]) *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.chips')).length }; });
    check(wd.app <= 320 && wd.page <= 320 && wd.over === 0, 'nothing exceeds the screen width at 320 px (' + JSON.stringify(wd) + ')');
    await c.close(); }
  for (const [w, h] of [[390, 664], [390, 753], [375, 553], [375, 647]]) {
    const { c, p } = await fresh({ width: w, height: h }, '?play=1');
    const r = await p.evaluate(() => { ZCore.push({ id: 'hh', title: 'Title', render() {} }); const b = document.querySelector('.layer:not([hidden]) .pbody'), a = document.getElementById('app').getBoundingClientRect(); return { body: Math.round(b.clientHeight), bodyW: Math.round(b.clientWidth), appW: Math.round(a.width), appH: Math.round(a.height), x: Math.round(a.x) }; });
    if (w === 375 && h === 647) { const cr = await p.evaluate(() => { const u = ZCore.ui; ZCore.push({ id: 'cr', title: 'T', render(b) { b.appendChild(u.list([{ title: 'Lion', sub: 'x', img: u.icon('m-build').src || null, right: u.sign(2) }])); b.appendChild(u.chipRow([u.astat('charm', 78), u.astat('vigor', 61), u.astat('wit', 49), u.grade('a')])); } }); const c = document.querySelector('.layer:not([hidden]) .chips'), tops = [...c.children].map(x => { const r = x.getBoundingClientRect(); return r.top + r.height / 2; }); return { n: tops.length, one: tops.every(v => Math.abs(v - tops[0]) < 3), fits: c.scrollWidth <= c.clientWidth + 1, w: c.scrollWidth }; });
      check(cr.n === 4 && cr.one && cr.fits, 'icon chip row (3 stats + grade) fits on one line at 375 px (' + JSON.stringify(cr) + ')'); await shot('icon-chips', p); }
    console.log('  panel body at ' + w + 'x' + h + ': ' + JSON.stringify(r));
    check(r.appW === w && r.appH === h && r.x === 0, 'full screen at ' + w + 'x' + h + ': app fills the whole viewport');
    await c.close(); }
  // ---- update 7: strip fit, alert frame, floor speed, goal chip, challenge plumbing
  // The engine side (ZE.nextGoal, ZE.newChallenge, ZE.challengeStatus) may not have landed: where a function is missing the test supplies a stand-in
  // with the contract's shape (docs/UPDATE-7.md section A), so the shell is tested the same way either way. It prints which were stand-ins.
  const standIns = () => {
    const E = window.ZE, used = [];
    if (typeof E.nextGoal !== 'function') { used.push('nextGoal'); E.nextGoal = S => ({ kind: 'visitors', icon: 'visitors', cur: 120, target: 300 }); }
    if (typeof E.newChallenge !== 'function') { used.push('newChallenge'); E.newChallenge = id => { const S = E.newGame(ZCore.legacy, { starter: true }); S.ch = { id: id }; return S; }; }
    if (typeof E.challengeStatus !== 'function') { used.push('challengeStatus'); E.challengeStatus = S => (S.ch ? { kind: 'money', icon: 'coin', cur: 12500, target: 40000, week: S.week, weeks: 60, weeksLeft: Math.max(0, 60 - S.week), starsNow: 2, done: false, failed: false } : null); }
    return used;
  };
  const levelId = () => { const L = window.ZD && ZD.LEVELS; const a = Array.isArray(L) ? L : L ? Object.keys(L).map(k => L[k]) : []; return a.length ? [a[0].id, a[1] ? a[1].id : a[0].id] : ['L1', 'L2']; };
  { const { c, p } = await fresh({ width: 375, height: 667 }, '?play=1');
    const used = await p.evaluate(standIns); console.log('  engine stand-ins used by this test: ' + (used.length ? used.join(', ') : 'none (real engine)'));
    const f = await p.evaluate(() => { ZT.skipReports = true; const S = ZT.S; S.money = 9999999; S.visitorsLast = 99999; S.week = 20 * 48 - 1; ZCore.updateStrip();
      const row = document.querySelector('.srow.txt'), k = [...row.children].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.top + r.height / 2)]; }), st = document.getElementById('strip');
      return { money: document.getElementById('s-money').textContent, date: document.getElementById('s-date').textContent, k, n: k.length, over: st.scrollWidth > st.clientWidth, rowOver: row.scrollWidth > row.clientWidth, stripH: Math.round(st.getBoundingClientRect().height) }; });
    check(f.money === '$9,999,999' && f.n === 3 && !f.over && !f.rowOver && f.k[0][0] >= 10 && f.k[2][1] <= 365 && f.k[0][1] + 6 <= f.k[1][0] && f.k[1][1] + 6 <= f.k[2][0] && f.k.every(x => Math.abs(x[2] - f.k[0][2]) <= 2), 'update 7: at 375 px wide the date, $9,999,999 and 99,999/wk sit on ONE row, 6+ px apart, inside the margins (' + JSON.stringify(f) + ')');
    await shot('strip-375-max', p);
    // goal chip (normal zoo)
    const g = await p.evaluate(() => { ZCore.updateStrip(); const e = document.getElementById('goal'), r = e.getBoundingClientRect(), st = document.getElementById('strip').getBoundingClientRect(), fl = document.getElementById('floor').getBoundingClientRect(), cs = getComputedStyle(e), want = ZE.nextGoal(ZT.S);
      const mid = document.elementFromPoint(fl.left + fl.width / 2, fl.top + fl.height / 2), hit = document.elementFromPoint(r.left + 10, r.top + 10);
      return { shown: cs.display !== 'none', text: e.textContent, want: ZCore.fmt.short(want.cur) + '/' + ZCore.fmt.short(want.target), hasIcon: !!e.querySelector('.sym'), top: Math.round(r.top - st.bottom), bottom: Math.round(r.bottom - st.bottom), right: Math.round(r.right), bg: cs.backgroundColor, op: cs.opacity, mid: mid && mid.id, hit: hit && hit.id, pe: cs.pointerEvents }; });
    check(g.shown && g.text === g.want && g.hasIcon && g.top === 0 && g.bottom <= 30 && g.right <= 375 / 2 && g.mid === 'floor' && g.hit === 'floor' && g.pe === 'none' && g.op === '1' && /^rgb\(/.test(g.bg), 'update 7: the goal chip shows ZE.nextGoal as symbol, current/target; solid, hanging just under the strip in the left corner, never over the middle, and taps pass through it (' + JSON.stringify(g) + ')');
    await shot('goal-chip', p);
    const g2 = await p.evaluate(() => { ZCore.push({ id: 'x', title: 'T', render() {} }); const a = getComputedStyle(document.getElementById('goal')).display; ZT.popAll(); ZT.title(); const b = getComputedStyle(document.getElementById('goal')).display; ZT.loadSlot(1); return { open: a, title: b, back: getComputedStyle(document.getElementById('goal')).display }; });
    check(g2.open === 'none' && g2.title === 'none' && g2.back !== 'none', 'update 7: the goal chip hides while a screen is open and on the title, and returns in play (' + JSON.stringify(g2) + ')');
    // floor speed for the Renderer
    const sp = await p.evaluate(() => { ZCore.setSpeed(1); const a = ZCore.floorSpeed(); ZCore.setSpeed(2); const b = ZCore.floorSpeed(), b2 = ZCore.speed; ZCore.setSpeed(1); ZT.title(); const t = ZCore.floorSpeed(); ZT.loadSlot(1); return { a, b, b2, t }; });
    check(sp.a === 1 && sp.b === 2 && sp.b2 === 2 && sp.t === 1, 'update 7: ZCore.floorSpeed() is 1 at speed 1, 2 at speed 2, and 1 on the title (' + JSON.stringify(sp) + ')');
    // Edit mode on the map counts like placement: clock paused, no menu from a floor tap, news and goal chip hidden, body class in step.
    // The renderer's real startEdit/stopEdit are used when they exist; otherwise ZRender.editing is stubbed (the test prints which).
    { const real = await p.evaluate(() => typeof ZRender.startEdit === 'function' && typeof ZRender.editing === 'function'); console.log('  edit mode in this test: ' + (real ? 'real renderer' : 'stubbed ZRender.editing'));
      // the slot was loaded a moment ago: let the renderer draw the new game (two frames) before Edit mode starts, as a player's tap through the menu always does
      await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))); await sleep(150);
      await p.evaluate(real => { ZT.popAll(); ZCore.WEEK_MS[1] = 300; ZCore.WEEK_MS[2] = 150; ZCore.setSpeed(1); ZT.S.news.unshift({ w: ZT.S.week, msg: 'Edit test news', kind: 'good' }); ZCore.updateStrip(); window.__ed = false; if (real) ZRender.startEdit({ onPick() {}, onExit() {} }); else { window.__ed = true; ZRender.editing = () => window.__ed; } }, real); await sleep(400);
      const e1 = await p.evaluate(() => ({ editing: ZRender.editing(), running: ZT.running(), cls: document.body.classList.contains('editing'), goal: getComputedStyle(document.getElementById('goal')).display, news: getComputedStyle(document.getElementById('news')).visibility, week: ZT.S.week }));
      // a refusal toast in Edit mode sits above the whole edit strip (Menus' real #edit-bar if it is showing, else a 150 px stand-in of the same id and place)
      const tb = await p.evaluate(async () => { let bar = document.getElementById('edit-bar'), made = false, was = null; if (!bar) { bar = document.createElement('div'); bar.id = 'edit-bar'; document.getElementById('floor-wrap').appendChild(bar); made = true; }
        const shown = !bar.hidden && bar.getBoundingClientRect().height > 40; if (!shown) { was = [bar.hidden, bar.style.cssText]; bar.hidden = false; bar.style.cssText += ';position:absolute !important;left:0;right:0;bottom:0;display:block !important;height:150px !important;background:#fff4d6;'; }
        ZCore.toast('Too close to another habitat', 'bad'); const b = bar.getBoundingClientRect(); await new Promise(r => setTimeout(r, 300)); const t = document.querySelector('#toasts .toast').getBoundingClientRect(), strip = document.getElementById('strip').getBoundingClientRect();
        const out = { toastBottom: Math.round(t.bottom), toastTop: Math.round(t.top), barTop: Math.round(b.top), barH: Math.round(b.height), stripBottom: Math.round(strip.bottom), standIn: !shown };
        document.querySelectorAll('#toasts .toast').forEach(x => x.remove()); if (made) bar.remove(); else if (was) { bar.hidden = was[0]; bar.style.cssText = was[1]; } return out; });
      check(tb.barH > 0 && tb.toastBottom <= tb.barTop && tb.toastBottom >= tb.barTop - 20 && tb.toastTop > tb.stripBottom, 'update 7: in Edit mode a toast sits just above the whole edit strip, never on it (' + JSON.stringify(tb) + ')');
      await p.touchscreen.tap(187, 330); await sleep(900);
      const e2 = await p.evaluate(() => ({ stack: ZT.stack().length, week: ZT.S.week, menu: (ZCore.openMenu(), ZT.stack().length) }));
      check(e1.editing && e1.running === false && e1.cls && e1.goal === 'none' && e1.news === 'hidden' && e2.stack === 0 && e2.menu === 0 && e2.week === e1.week, 'update 7: Edit mode pauses the clock (no weeks pass), a floor tap opens no menu, the news line and goal chip hide, body has class editing (' + JSON.stringify({ e1, e2 }) + ')');
      await p.evaluate(real => { if (real) ZRender.stopEdit(); else window.__ed = false; }, real); await sleep(900);
      const e3 = await p.evaluate(() => ({ running: ZT.running(), cls: document.body.classList.contains('editing'), goal: getComputedStyle(document.getElementById('goal')).display, week: ZT.S.week }));
      check(e3.running === true && !e3.cls && e3.goal !== 'none' && e3.week > e1.week, 'update 7: leaving Edit mode starts the clock again and brings the goal chip back (' + JSON.stringify(e3) + ')');
      const tn = await p.evaluate(async () => { ZCore.push({ id: 'tt', title: 'T', render() {} }); ZCore.toast('Saved', 'good'); await new Promise(r => setTimeout(r, 300)); const t = document.querySelector('#toasts .toast').getBoundingClientRect(), bk = document.querySelector('.layer:not([hidden]) .back').getBoundingClientRect(); const o = { toastBottom: Math.round(t.bottom), backTop: Math.round(bk.top), inline: document.getElementById('toasts').style.bottom }; ZT.popAll(); return o; });
      check(tn.inline === '' && tn.toastBottom <= tn.backTop && tn.toastBottom >= tn.backTop - 30, 'update 7: outside Edit mode toasts are back in their usual place just above the Back button (' + JSON.stringify(tn) + ')');
      await p.evaluate(() => { ZCore.WEEK_MS[1] = 600000; ZCore.WEEK_MS[2] = 600000; ZCore.setSpeed(2); ZCore.setSpeed(1); }); }
    // alert frame
    await p.evaluate(() => { const u = ZCore.ui; ZCore.push({ id: 'al', title: 'Alert', render(b) { b.appendChild(u.grid([{ icon: 'm-staff', label: 'Staff', badge: 2 }, { icon: 'm-animals', label: 'Animals', alert: true }, { icon: 'm-info', label: 'Info' }])); b.appendChild(u.btn('Research', null, { cls: 'big', alert: true })); b.appendChild(u.list([{ title: 'Row', sub: 'waiting', alert: true }, { title: 'Row', sub: 'quiet' }])); b.appendChild(u.tabs([{ id: 'a', label: 'One' }, { id: 'b', label: 'Two', alert: true }], 'a')); } }); }); await sleep(300);
    const seen = new Set(); let al = null;
    for (let i = 0; i < 12; i++) { al = await p.evaluate(() => { const L = document.querySelector('.layer:not([hidden])'), a = [...L.querySelectorAll('.alert')], cs = getComputedStyle(a[0]), q = L.querySelectorAll('.gbox')[2];
      return { n: a.length, badges: L.querySelectorAll('.badge').length, color: cs.outlineColor, style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset, op: cs.opacity, timing: cs.animationTimingFunction, quiet: getComputedStyle(q).outlineStyle, red: [...L.querySelectorAll('*')].filter(e => getComputedStyle(e).backgroundColor === 'rgb(224, 88, 74)').length }; }); seen.add(al.color); await sleep(150); }
    const cols = [...seen];
    check(al.n === 5 && al.badges === 0 && al.red === 0 && al.style === 'solid' && al.width === '4px' && al.offset === '-4px' && al.op === '1' && /^steps/.test(al.timing) && al.quiet === 'none' && cols.length === 2 && cols.every(x => /^rgb\(\d+, \d+, \d+\)$/.test(x)), 'update 7: .alert is a 4 px solid frame inside the element, stepping between exactly two solid golds; no red number box anywhere; grid, button, row and tab all take it (' + JSON.stringify(al) + ' colours ' + cols.join(' | ') + ')');
    await shot('alert-frame', p); await p.evaluate(() => ZT.popAll());
    await c.close(); }
  { // challenge plumbing: own save keys, resume, best stars, back to the title, zoo slots untouched
    const { c, p } = await fresh({ width: 393, height: 852 }, '?standalone=1&inset=34&insett=62');
    await p.evaluate(standIns); const [L1, L2] = await p.evaluate(levelId);
    const a = await p.evaluate(L1 => { ZT.skipReports = true; ZT.newGame({ slot: 2, zooName: 'Keep' }); ZT.tick(3); ZT.title(); const slotDoc = localStorage.getItem('wildside-zoo-v3-slot2'), legacy = localStorage.getItem('wildside-zoo-v3-legacy');   // toTitle saves, so read the slot after it
      const before = { inCh: ZCore.inChallenge(), stars: ZCore.challengeStars(), saved: ZCore.challengeSaved() };
      const zooSpeed = ZCore.speed, zooDocSpeed = JSON.parse(localStorage.getItem('wildside-zoo-v3-slot2')).speed; const S = ZCore.startChallenge(L1); ZCore.WEEK_MS[1] = 600000; ZCore.WEEK_MS[2] = 600000; ZT.tick(2); ZT.save();
      return { before, zooSpeed, zooDocSpeed, chSpeed: ZCore.speed, started: !!S && !!S.ch, inCh: ZCore.inChallenge(), id: ZCore.challengeId, slot: ZCore.slot, stack: ZT.stack().length, week: ZT.S.week, saved: ZCore.challengeSaved(), keyThere: !!localStorage.getItem('wildside-zoo-v3-challenge'), slotSame: localStorage.getItem('wildside-zoo-v3-slot2') === slotDoc, legacySame: localStorage.getItem('wildside-zoo-v3-legacy') === legacy, slots: ZT.slots().map(s => s.empty), newGame: ZCore.newGame({}) === null && ZCore.inChallenge() }; }, L1);
    check(a.before.inCh === false && Object.keys(a.before.stars).length === 0 && a.before.saved === null && a.started && a.inCh && String(a.id) === String(L1) && a.slot === null && a.stack === 0 && a.keyThere && a.saved && String(a.saved.levelId) === String(L1) && a.saved.week === a.week && a.slotSame && a.legacySame && a.slots.join() === 'true,false,true' && a.newGame && a.zooSpeed === 1 && a.zooDocSpeed === 1 && a.chSpeed === 2, 'update 7: startChallenge starts a run at speed 2 (the zoo was at 1) in its own save key; the zoo slots and carry-over record are untouched; newGame without a slot is refused inside a challenge (' + JSON.stringify(a) + ')');
    await sleep(300); await shot('challenge-chip', p);
    const ch = await p.evaluate(() => { const e = document.getElementById('goal'), r = e.getBoundingClientRect(), s = ZE.challengeStatus(ZT.S); return { shown: getComputedStyle(e).display !== 'none', text: e.textContent, want: ZCore.fmt.short(s.cur) + '/' + ZCore.fmt.short(s.target) + s.weeksLeft, stars: e.querySelectorAll('.star').length, lit: e.querySelectorAll('.star:not(.off)').length, starsNow: s.starsNow | 0, syms: e.querySelectorAll('.sym').length, right: Math.round(r.right), w: innerWidth }; });
    check(ch.shown && ch.text === ch.want && ch.stars === 3 && ch.lit === ch.starsNow && ch.syms === 2 && ch.right <= ch.w * 0.62, 'update 7: in a challenge the chip shows the level goal, the weeks left and the stars on offer (' + JSON.stringify(ch) + ')');
    // quit to the title and come back: the run resumes
    const b = await p.evaluate(() => { const w = ZT.S.week; ZCore.setSpeed(1); const left = ZCore.leaveChallenge(); const onTitle = ZT.S === null && ZCore.inChallenge() === false && ZT.stack().length === 1; const titleSpeed = ZCore.speed; const ok = ZCore.resumeChallenge(); return { titleSpeed, resumeSpeed: ZCore.speed, left, onTitle, ok, week: ZT.S && ZT.S.week, w, inCh: ZCore.inChallenge(), hasCh: !!(ZT.S && ZT.S.ch), slot: ZCore.slot }; });
    check(b.left && b.onTitle && b.ok && b.week === b.w && b.inCh && b.hasCh && b.slot === null && b.titleSpeed === 1 && b.resumeSpeed === 2, 'update 7: leaving a challenge shows the title (speed back to the zoo speed 1), and resumeChallenge brings the same run back at speed 2 even though it was left at 1 (' + JSON.stringify(b) + ')');
    await p.reload(); await p.waitForFunction(() => window.ZT && document.documentElement.dataset.ready); await sleep(300); await p.evaluate(standIns);
    const b2 = await p.evaluate(() => { const t = ZT.S === null; const s = ZCore.challengeSaved(); const ok = ZCore.resumeChallenge(); return { t, s, ok, week: ZT.S && ZT.S.week, inCh: ZCore.inChallenge() }; });
    check(b2.t && b2.s && b2.ok && b2.week === b.w && b2.inCh, 'update 7: after closing and reopening the app the title shows first and the saved challenge run resumes (' + JSON.stringify(b2) + ')');
    // the result report: best stars are kept the moment it arrives; a worse result never lowers them; a finished run is not offered for resume
    const r1 = await p.evaluate(() => { ZT.skipReports = true; ZT.S.reports.push({ type: 'challenge', level: ZCore.challengeId, stars: 2, week: ZT.S.week }); ZT.flush(); return { stars: ZCore.challengeStars(), raw: localStorage.getItem('wildside-zoo-v3-challenge-stars') }; }); await sleep(200);
    const r2 = await p.evaluate(L1 => { ZCore.leaveChallenge(); const savedAfter = ZCore.challengeSaved(); ZT.skipReports = true; ZCore.startChallenge(L1); ZT.S.reports.push({ type: 'challenge', level: L1, stars: 1, week: 5 }); ZT.flush(); const worse = ZCore.challengeStars()[L1], legacyRefused = ZCore.saveLegacy() === false; ZCore.startChallenge(L1); ZT.S.reports.push({ type: 'challenge', level: L1, stars: 0, week: 60 }); ZT.flush(); const failed = ZCore.challengeStars()[L1]; ZCore.startChallenge(L1); ZT.S.reports.push({ type: 'challenge', level: L1, stars: 3, week: 5 }); ZT.flush(); return { savedAfter, worse, failed, legacyRefused, better: ZCore.challengeStars()[L1] }; }, L1);
    check(r1.stars[L1] === 2 && r1.raw && r2.savedAfter === null && r2.worse === 2 && r2.failed === 2 && r2.better === 3 && r2.legacyRefused, 'update 7: the challenge report saves the best stars in their own key (2, then a 1 and a fail leave 2, then 3), a finished run is cleared, and saveLegacy is refused inside a challenge (' + JSON.stringify({ r1: r1.stars, r2 }) + ')');
    const r3 = await p.evaluate(L2 => { ZCore.startChallenge(L2); ZT.tick(1); ZCore.clearChallenge(); const t = ZT.S === null && ZCore.challengeSaved() === null; const ok = ZT.loadSlot(2); return { t, ok, speed: ZCore.speed, docSpeed: JSON.parse(localStorage.getItem('wildside-zoo-v3-slot2')).speed, name: ZT.S && ZT.S.zooName, week: ZT.S && ZT.S.week, inCh: ZCore.inChallenge(), slot: ZCore.slot, stars: ZCore.challengeStars() }; }, L2);
    check(r3.t && r3.ok && r3.name === 'Keep' && r3.week === 3 && r3.inCh === false && r3.slot === 2 && Object.keys(r3.stars).length === 1 && r3.speed === 1 && r3.docSpeed === 1, 'update 7: clearChallenge forgets the run and shows the title; the zoo in slot 2 loads exactly as it was left, still at its own speed 1 (' + JSON.stringify(r3) + ')');
    check((await p.evaluate(() => ZT.errors.length)) === 0, 'update 7: no errors during the challenge checks ' + JSON.stringify(await p.evaluate(() => ZT.errors)));
    await c.close(); }
  await browser.close();
}
(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit'];
  for (const n of names) { try { await run(n); } catch (e) { failures++; console.log('  FAIL ' + n + ' crashed: ' + e.message); } }
  console.log(failures ? 'FAILED: ' + failures : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})();
