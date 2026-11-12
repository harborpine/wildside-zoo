/* Tester: other screen sizes. Usage: node test/tester-sizes.js [chromium|webkit]
   Opens the menu and every main box by real taps at each size, runs the invariant checks, and screenshots.
   ZT.tick is used ONLY to age the zoo (this is the coverage script, not the playthrough). Headless only. */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
const SIZES = [['landscape', 844, 390, 2], ['small', 375, 667, 2], ['large', 430, 932, 3], ['ipad', 820, 1180, 2]];
(async () => {
  const all = [];
  for (const [name, w, h, dsf] of SIZES) {
    const T = await L.launch(engine, { width: w, height: h }, { dsf, tag: (engine === 'webkit' ? 'wk' : 'cr') + '-' + name });
    const page = T.page; console.log('== ' + engine + ' ' + name + ' ' + w + 'x' + h);
    await T.goto();
    // age the zoo a bit so lists are longer (test hook; skip report cards)
    await page.evaluate(() => { ZCore.onReport('*', (r, d) => d()); ZT.tick(30); ZT.S.reports.length = 0; ZT.S.happening = null; ZT.popAll(); ZCore.onReport('*', null); ZCore.WEEK_MS[1] = 600000; ZCore.WEEK_MS[2] = 600000; });
    await page.evaluate(() => { ZT.popAll(); }); await sleep(300);
    await T.shot('floor'); await L.invariants(T, name + ' floor');
    const fl = await page.evaluate(() => { const c = document.getElementById('floor').getBoundingClientRect(); const a = document.getElementById('app').getBoundingClientRect(); return { canvas: [Math.round(c.width), Math.round(c.height)], app: [Math.round(a.left), Math.round(a.width), Math.round(a.height)], dbg: ZRender.debug().buffer }; });
    console.log('  layout', JSON.stringify(fl));
    const cx = Math.round(Math.min(w, 430) / 2) + Math.round((w - Math.min(w, 430)) / 2);
    await T.tapXY(cx, Math.round(h * 0.5));
    let s = await T.state(); console.log('  menu opened by floor tap:', s.stack.join('>'));
    if (!s.stack.length) T.find('open:' + name, 'floor tap at ' + cx + ',' + Math.round(h * 0.5) + ' did not open the menu at ' + w + 'x' + h);
    await T.shot('menu'); const r0 = await L.invariants(T, name + ' menu'); console.log('  menu back/play:', JSON.stringify(r0.geo.back));
    for (const box of ['Projects', 'Build', 'Animals', 'Staff', 'Research', 'Info', 'System']) {
      const ok = await T.tapText(box); if (!ok) { T.find('missing:' + name + ':' + box, box + ' not tappable at ' + w + 'x' + h + ' (scrolled off or hidden?)'); continue; }
      await sleep(250); await T.shot('box-' + box); const r = await L.invariants(T, name + ' ' + box);
      if (r.geo.back && !r.geo.back.visible) T.find('back-hidden:' + name + ':' + box, 'Back button not fully visible on ' + box + ' at ' + w + 'x' + h + ' ' + JSON.stringify(r.geo.back));
      if (!r.geo.back) T.find('back-none:' + name + ':' + box, 'no Back button on ' + box + ' at ' + w + 'x' + h);
      await T.tapText(/./, { sel: '.back' }); await sleep(250);
    }
    // placement bar
    await T.tapText('Build'); await T.tapText('Facilities'); await T.tapText(/./, { sel: '.row.tappable', nth: 0 }); await sleep(400);
    s = await T.state(); console.log('  placing:', s.placing);
    const pb = await page.evaluate(() => { const b = document.getElementById('placement-bar').getBoundingClientRect(); const n = document.getElementById('placement-note').getBoundingClientRect(); return { barTop: Math.round(b.top), barBottom: Math.round(b.bottom), h: Math.round(b.height), noteTop: Math.round(n.top), vh: innerHeight, btns: [...document.querySelectorAll('#placement-bar button')].map(x => { const r = x.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }) }; });
    console.log('  placement bar', JSON.stringify(pb)); await T.shot('placement'); await L.invariants(T, name + ' placement');
    if (pb.barBottom > pb.vh + 1) T.find('placebar-off:' + name, 'placement buttons run off the bottom at ' + w + 'x' + h + ' ' + JSON.stringify(pb));
    // ghost visible? is the floor area left above the bar big enough
    const g = await page.evaluate(() => { const p = ZRender.debug().placement; if (!p) return null; const c = ZRender.hexToClient(p.q, p.r); return { q: p.q, r: p.r, x: Math.round(c.x), y: Math.round(c.y), ok: p.ok }; });
    console.log('  ghost at', JSON.stringify(g)); if (g && (g.y > pb.barTop || g.y < 0 || g.x < 0 || g.x > w)) T.find('ghost-hidden:' + name, 'initial placement ghost is hidden behind the buttons or off screen at ' + w + 'x' + h + ' ' + JSON.stringify(g));
    await T.tapText('Cancel', { floor: true, sel: '#placement-bar button' }); await sleep(300); await T.tapText(/./, { sel: '.back' }).catch(() => 0); await page.evaluate(() => ZT.popAll());
    await sleep(300); await L.invariants(T, name + ' end', { expectClosed: true });
    const r = await T.state(); console.log('  end state', JSON.stringify(r));
    T.findings.forEach(f => all.push({ size: name, ...f })); if (T.consoleErrors.length) all.push({ size: name, key: 'console', msg: T.consoleErrors.join(' | ') });
    await T.browser.close();
  }
  console.log('FINDINGS'); all.forEach((f, i) => console.log(' ' + (i + 1) + '. [' + f.size + '] ' + f.msg));
  require('fs').writeFileSync(require('path').join(L.SHOTS, 'tester-sizes-' + engine + '.json'), JSON.stringify(all, null, 1));
})().catch(e => { console.error('CRASH', e); process.exit(1); });
