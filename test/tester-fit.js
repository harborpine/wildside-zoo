/* Tester round 3: do the box-grid screens fit without scrolling, and does the app fill the screen, at the owner's phone sizes?
   Usage: node test/tester-fit.js [chromium|webkit]. Real touch taps open every screen. Headless only. */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
const SIZES = [[375, 553], [375, 647], [390, 664], [390, 753], [390, 844], [430, 739], [440, 956], [320, 568]];
(async () => {
  const all = [];
  for (const [w, h] of SIZES) {
    const T = await L.launch(engine, { width: w, height: h }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-fit' + w + 'x' + h });
    const page = T.page; const say = (...a) => console.log(...a); say('== ' + engine + ' ' + w + 'x' + h);
    const rec = (k, m, shot) => { T.find(k + ':' + w + 'x' + h, m + ' at ' + w + 'x' + h, shot); };
    // title first (clean profile)
    await T.goto(''); await sleep(900);
    const meas = () => page.evaluate(() => {
      const L = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); const body = L && L.querySelector('.pbody'); const panel = L && L.querySelector('.panel'); const back = L && L.querySelector('.back');
      const app = document.getElementById('app').getBoundingClientRect(); const strip = document.getElementById('strip').getBoundingClientRect(); const news = document.getElementById('news').getBoundingClientRect(); const stage = document.getElementById('stage').getBoundingClientRect();
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const boxes = L ? [...L.querySelectorAll('.gbox, .btn, button.mn-slothit, .mn-slot, .opt, .row.tappable')].filter(vis).map(e => { const r = e.getBoundingClientRect(); return { t: (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 18), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; }) : [];
      const scrollEl = body || (L && L.querySelector('.panel')) || L;
      return { id: ZT.stack().join('>'), hasGrid: !!(L && L.querySelector('.grid')), scrollable: scrollEl ? scrollEl.scrollHeight > scrollEl.clientHeight + 1 : null, sh: scrollEl && scrollEl.scrollHeight, ch: scrollEl && scrollEl.clientHeight, small: boxes.filter(b => b.h < 43.5 || b.w < 43.5), back: back ? (() => { const r = back.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), ok: r.bottom <= innerHeight + 1 && r.top >= 0 }; })() : null, app: { l: Math.round(app.left), r: Math.round(app.right), t: Math.round(app.top), b: Math.round(app.bottom) }, strip: Math.round(strip.height), newsB: Math.round(news.bottom), newsH: Math.round(news.height), vw: innerWidth, vh: innerHeight, docW: document.documentElement.scrollWidth, panel: panel && { l: Math.round(panel.getBoundingClientRect().left), r: Math.round(panel.getBoundingClientRect().right), b: Math.round(panel.getBoundingClientRect().bottom) }, lastBoxBottom: boxes.length ? Math.max(...boxes.map(b => b.bottom)) : 0 };
    });
    let m = await meas(); say('  title:', JSON.stringify({ scrollable: m.scrollable, sh: m.sh, ch: m.ch, small: m.small, app: m.app, strip: m.strip, newsB: m.newsB }));
    if (m.scrollable) rec('title:scroll', 'the title screen scrolls (' + m.sh + ' > ' + m.ch + ')'); if (m.small.length) rec('title:small', 'title tap targets under 44 px: ' + JSON.stringify(m.small.slice(0, 3)));
    await T.shot('title'); await L.invariants(T, 'title ' + w + 'x' + h);
    // new zoo through the real flow (tutorial No) to an aged-ish zoo
    await T.tapText(/^1/, { sel: 'button', wait: 500 }); await T.tapText(/^Next/, { sel: 'button, .btn', wait: 500 }); await T.tapText(/^No/, { sel: 'button, .btn', wait: 900 });
    await page.evaluate(() => { ZCore.WEEK_MS[1] = 600000; ZCore.WEEK_MS[2] = 600000; ZCore.onReport('*', (r, d) => d()); ZT.tick(40); ZT.S.reports.length = 0; ZT.S.happening = null; ZT.popAll(); ZCore.onReport('*', null); ZT.S.money = 100000; });
    await sleep(400);
    const cover = await page.evaluate(() => ({ app: (() => { const a = document.getElementById('app').getBoundingClientRect(); return [Math.round(a.left), Math.round(a.top), Math.round(a.right), Math.round(a.bottom)]; })(), canvas: (() => { const c = document.getElementById('floor').getBoundingClientRect(); return [Math.round(c.left), Math.round(c.top), Math.round(c.right), Math.round(c.bottom)]; })(), vw: innerWidth, vh: innerHeight }));
    say('  floor layout:', JSON.stringify(cover)); if (cover.app[0] !== 0 || cover.app[2] !== cover.vw) rec('fill:width', 'the app does not fill the full width: ' + JSON.stringify(cover.app)); if (cover.app[3] !== cover.vh) rec('fill:height', 'the app does not fill the full height: bottom ' + cover.app[3] + ' vs ' + cover.vh);
    await T.shot('floor');
    const check = async (name, o) => { await sleep(250); m = await meas(); const ok = m.hasGrid ? !m.scrollable : true; say('  ' + name.padEnd(10), 'grid:' + m.hasGrid, 'scrolls:' + m.scrollable + ' (' + m.sh + '/' + m.ch + ')', 'back:' + JSON.stringify(m.back), 'small:' + m.small.length, 'lastBox:' + m.lastBoxBottom, 'panel:' + JSON.stringify(m.panel), 'strip:' + m.strip, 'newsB:' + m.newsB + '/' + m.vh);
      if (m.hasGrid && m.scrollable) rec('scroll:' + name, 'box-grid screen "' + name + '" scrolls (content ' + m.sh + ' px in a ' + m.ch + ' px body)', 'tester-' + T.tag + '-' + name + '.png');
      if (m.small.length) rec('small:' + name, 'tap targets under 44 px on "' + name + '": ' + m.small.slice(0, 3).map(b => b.t + ' ' + b.w + 'x' + b.h).join('; '));
      if (m.back && !m.back.ok) rec('back:' + name, 'Back not fully visible on "' + name + '"' + JSON.stringify(m.back)); if (!m.back && !o) rec('noback:' + name, 'no Back button on "' + name + '"');
      if (m.docW > m.vw + 1) rec('overflowx:' + name, 'page scrolls horizontally on "' + name + '"');
      if (m.panel && (m.panel.l > 12 || m.vw - m.panel.r > 12)) rec('narrow:' + name, 'panel does not use the full width on "' + name + '": left ' + m.panel.l + ', right gap ' + (m.vw - m.panel.r));
      await T.shot(name); await L.invariants(T, name + ' ' + w + 'x' + h); };
    await T.tapXY(Math.round(w / 2), Math.round(h * 0.55), 450); await check('menu', true);
    for (const box of ['Projects', 'Build', 'Animals', 'Staff', 'Research', 'Info', 'System']) {
      if (!(await T.tapText(box))) { rec('missing:' + box, box + ' box cannot be tapped'); continue; }
      await check(box);
      if (box === 'Research') { if (await T.tapText(/^Regions/)) { await check('Research-Regions'); await T.tapText(/./, { sel: '.back' }); await sleep(200); } }
      if (box === 'Info') { for (const sub of ['Book', 'Rumors']) { if (await T.tapText(new RegExp('^' + sub))) { await check('Info-' + sub); await T.tapText(/./, { sel: '.back' }); await sleep(200); } } }
      if (box === 'Staff') { if (await T.tapText(/^Hire/, { sel: 'button, .btn' })) { await check('Staff-Hire'); await T.tapText(/./, { sel: '.back' }); await sleep(200); } }
      if (box === 'Animals') { for (const tab of ['Market', 'Pen']) { if (await T.tapText(new RegExp('^' + tab))) { await check('Animals-' + tab); } } }
      await T.tapText(/./, { sel: '.back' }); await sleep(250);
    }
    // placement bar at this size
    await T.tapText('Build'); await T.tapText('Facilities'); await T.tapText(/./, { sel: '.row.tappable', nth: 0, wait: 500 });
    const pb = await page.evaluate(() => { const b = document.getElementById('placement-bar').getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), vh: innerHeight, placing: ZRender.placing(), btns: [...document.querySelectorAll('#placement-bar button')].map(x => Math.round(x.getBoundingClientRect().width) + 'x' + Math.round(x.getBoundingClientRect().height)) }; });
    say('  placement bar:', JSON.stringify(pb)); if (!pb.placing) rec('placement:no', 'placement did not start'); else if (pb.bottom > pb.vh + 1) rec('placement:off', 'placement bar runs off the bottom'); await T.shot('placement');
    await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button' }); await sleep(300); await page.evaluate(() => ZT.popAll());
    const e = await T.state(); if (e.errors) rec('errors', 'game errors recorded');
    T.findings.forEach(f => all.push({ size: w + 'x' + h, ...f })); if (T.consoleErrors.length) all.push({ size: w + 'x' + h, key: 'console', msg: 'console errors: ' + T.consoleErrors.join(' | ') });
    await T.browser.close();
  }
  console.log('FINDINGS'); all.forEach((f, i) => console.log(' ' + (i + 1) + '. [' + f.size + '] ' + f.msg));
  require('fs').writeFileSync(require('path').join(L.SHOTS, 'tester-fit-' + engine + '.json'), JSON.stringify(all, null, 1));
})().catch(e => { console.error('CRASH', e); process.exit(1); });
