/* Tester round 6 (C and D): the art in the real game and tapping every owned hex, by touch. Usage: node test/tester-art6.js [chromium|webkit]
   ZT.tick / state edits only set the scene (a mid-size zoo). Reads ZRender.debug() to detect placeholder fallbacks. Headless only. */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
(async () => {
  const say = (...a) => console.log(...a); const all = [];
  for (const [W, H] of [[393, 852], [375, 667]]) {
    const T = await L.launch(engine, { width: W, height: H }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-art' + W }); const page = T.page; say('== ' + W + 'x' + H);
    await T.goto('?play=1&standalone=1&inset=34'); await sleep(800); await page.evaluate(() => { ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 600000; });
    const st = () => T.state();
    const toFloor = async () => { for (let i = 0; i < 8; i++) { const s = await st(); if (!s.stack.length && !s.placing) return; if (s.placing) { await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button' }); continue; } if (!(await T.tapText(/./, { sel: '.back' }))) await T.tapXY(W / 2, H / 2); } };
    const dbg = () => page.evaluate(() => { const d = ZRender.debug(); return { sprites: d.sprites, realSprites: d.realSprites, spriteErrors: d.spriteErrors, getters: d.spriteGetters, buffer: d.buffer, zoom: d.zoom, fps: d.fps, frameMs: d.frameMs, density: window.ZGeo && ZGeo.DENSITY, setDensity: window.ZSprites && ZSprites.getDensity ? ZSprites.getDensity() : undefined }; });
    say('  debug:', JSON.stringify(await dbg()));
    // ---------- D: every owned hex, fresh classic zoo (before ticking) ----------
    const hexes = await page.evaluate(() => { const S = ZT.S, out = []; for (let r = 0; r < 20; r++) for (let q = -14; q < 16; q++) if (ZE.inGrid(q, r) && ZE.inLand(S, q, r)) out.push([q, r]); return out; });
    say('  owned hexes:', hexes.length);
    // make every hex reachable: scroll by centering (a view helper, like a drag) then touch it
    let ok = 0, bad = []; let menus = 0;
    for (const [q, r] of hexes) {
      await page.evaluate(([q, r]) => ZRender.centerOn(q, r, true), [q, r]); await sleep(40);
      const p = await page.evaluate(([q, r]) => { const c = ZRender.hexToClient(q, r); const back = ZRender.clientToHex(c.x, c.y); return { x: c.x, y: c.y, back }; }, [q, r]);
      if (!p.back || p.back.q !== q || p.back.r !== r) { bad.push('inverse ' + q + ',' + r + ' -> ' + JSON.stringify(p.back)); continue; }
      if (p.y < 70 || p.y > H - 120 || p.x < 10 || p.x > W - 10) { bad.push('offscreen after centerOn ' + q + ',' + r + ' at ' + Math.round(p.x) + ',' + Math.round(p.y)); continue; }
      await page.touchscreen.tap(p.x, p.y); T.taps++; await sleep(120); const s = await st(); if (s.stack.length) { menus++; ok++; await page.evaluate(() => ZT.popAll()); await sleep(40); } else bad.push('no menu on tap ' + q + ',' + r);
    }
    say('  taps that opened the menu:', menus + '/' + hexes.length, 'bad:', JSON.stringify(bad.slice(0, 6)), bad.length); if (bad.length) all.push({ size: W, msg: 'hex tap problems: ' + bad.slice(0, 4).join('; ') });
    // item reporting: read-only helper agrees
    const items = await page.evaluate(() => ZT.S.items.map(it => { const c = ZE.cells(it)[0]; const p = ZRender.hexToClient(c[0], c[1]); return { id: it.id, t: it.t, q: c[0], r: c[1] }; })); say('  items:', JSON.stringify(items));
    await page.evaluate(() => ZRender.reset()); await sleep(300);
    // ---------- drag, zoom ----------
    const cam = () => page.evaluate(() => ({ ...ZRender.debug().cam })); const c0 = await cam(); await T.drag(W / 2, 300, W / 2, 500, 10); const c1 = await cam(); await T.drag(300, 400, 100, 400, 10); const c2 = await cam(); const sx = await st(); say('  drag cams:', JSON.stringify([c0, c1, c2]), 'menu opened by drag:', sx.stack.length > 0); if (sx.stack.length) all.push({ size: W, msg: 'drag opened the menu' }); if (c0.y === c1.y && c1.x === c2.x) all.push({ size: W, msg: 'drag did not move the camera' });
    await page.evaluate(() => ZRender.reset()); await sleep(300);
    // ---------- scene: mid-size zoo ----------
    await page.evaluate(() => { ZCore.onReport('*', (r, d) => d()); ZT.tick(36); ZT.S.reports.length = 0; ZT.S.happening = null; ZT.popAll(); ZCore.onReport('*', null); ZT.S.money = 400000; });
    await sleep(500); await page.evaluate(() => ZRender.reset()); await sleep(400);
    await T.shot('floor-zoom1'); say('  floor zoom1 debug:', JSON.stringify(await dbg()));
    await T.tapXY(W / 2, H * 0.55, 450); await T.tapText('System'); await T.tapText('Far'); await toFloor(); await sleep(500); await T.shot('floor-zoom0'); const z0 = await page.evaluate(() => ZRender.getZoom()); say('  zoom after Far:', z0, JSON.stringify((await dbg()).buffer));
    // tap a hex at far zoom too
    const hx = await page.evaluate(() => { const h = ZT.S.items.find(i => i.k === 'hab'); const c = ZE.cells(h)[0]; const p = ZRender.hexToClient(c[0], c[1]); return { q: c[0], r: c[1], x: p.x, y: p.y }; }); await page.touchscreen.tap(hx.x, hx.y); await sleep(300); say('  tap on habitat hex at far zoom opens:', (await st()).stack.join('>')); await toFloor();
    await T.tapXY(W / 2, H * 0.55, 450); await T.tapText('System'); await T.tapText('Close'); await toFloor(); await sleep(400);
    // ---------- main screens with portraits ----------
    const shots = [['Projects'], ['Build'], ['Animals', 'Zoo'], ['Animals', 'Pen'], ['Animals', 'Market'], ['Staff'], ['Research'], ['Info'], ['System']];
    for (const path of shots) { await T.tapXY(W / 2, H * 0.55, 450); for (const p of path) await T.tapText(new RegExp('^' + p)); await sleep(250); await T.shot('screen-' + path.join('-')); await L.invariants(T, path.join('>')); await toFloor(); }
    await T.tapXY(W / 2, H * 0.55, 450); await T.tapText('Info'); await T.tapText(/^Book/); await sleep(300); await T.shot('screen-book'); await toFloor();
    await T.tapXY(W / 2, H * 0.55, 450); await T.tapText('Animals'); await T.tapText(/^Zoo/); await T.tapText(/./, { sel: '.row.tappable', nth: 0 }); await sleep(300); await T.shot('screen-animal-one'); await toFloor();
    await T.tapXY(W / 2, H * 0.55, 450); await T.tapText('Staff'); await T.tapText(/./, { sel: '.row.tappable', nth: 0 }); await sleep(300); await T.shot('screen-staff-one'); await toFloor();
    // ---------- placement ghost + combo outline ----------
    await T.tapXY(W / 2, H * 0.55, 450); await T.tapText('Build'); await T.tapText(/^Facilities/); await T.tapText(/Garden Bench/, { sel: '.row', wait: 600 });
    const cands = await page.evaluate(() => { const S = ZT.S, res = []; const hab = S.items.filter(i => i.k === 'hab' && i.t === 'savanna'); const near = new Set(); for (const h of hab) for (const c of ZE.cells(h)) for (const d of ZE.DIRS) near.add((c[0] + d[0]) + ',' + (c[1] + d[1])); for (let r = 0; r < 20; r++) for (let q = -14; q < 16; q++) { if (!ZE.inGrid(q, r) || !ZE.inLand(S, q, r) || ZE.isEntrance(q, r) || S.items.some(it => ZE.cells(it).some(c => c[0] === q && c[1] === r)) || !near.has(q + ',' + r)) continue; const p = ZRender.hexToClient(q, r); if (p && p.y > 120 && p.y < innerHeight - 160) res.push({ q, r, x: p.x, y: p.y }); } return res; });
    let tried = 0, note = ''; let moved = 0, wrong = 0; for (const c of cands.slice(0, 12)) { await T.tapXY(c.x, c.y, 250); tried++; const g = await page.evaluate(() => ({ p: ZRender.debug().placement, note: document.getElementById('placement-note').innerText })); if (g.p && g.p.q === c.q && g.p.r === c.r) moved++; else wrong++; note = g.note; if (/Completes/.test(note) && tried > 2) break; }
    say('  placement: tapped', tried, 'hexes, ghost followed', moved, 'wrong', wrong, 'last note:', note); if (wrong) all.push({ size: W, msg: 'placement ghost did not follow ' + wrong + ' of ' + tried + ' taps' }); await sleep(300); await T.shot('placement-ghost'); await T.tapText(/^Place/, { floor: true, sel: '#placement-bar button', wait: 900 }); await sleep(900); await T.shot('after-place-combo'); await page.evaluate(() => ZT.popAll()); await toFloor(); await sleep(500); await T.shot('combo-outline-floor');
    say('  final debug:', JSON.stringify(await dbg()), 'errors', JSON.stringify(await page.evaluate(() => ZT.errors)), 'console', JSON.stringify(T.consoleErrors));
    T.findings.forEach(f => all.push({ size: W, msg: f.msg })); await T.browser.close();
  }
  say('FINDINGS (' + all.length + ')'); all.forEach((f, i) => say(' ' + (i + 1) + '. [' + f.size + '] ' + f.msg));
})().catch(e => { console.error('CRASH', e); process.exit(1); });
