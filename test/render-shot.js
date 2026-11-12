/* Renderer screenshots and checks. Headless only.
   Usage (Git Bash):  node test/render-shot.js [chromium|webkit|both] [--stub]
   Screenshots go to test/shots/render-*.png (Chromium) and render-*-webkit.png (WebKit). Exit code 1 if any check fails. */
const path = require('path'), fs = require('fs');
const pw = require('./pw.js');
const root = path.resolve(__dirname, '..'), shots = path.join(__dirname, 'shots');
fs.mkdirSync(shots, { recursive: true });
const args = process.argv.slice(2), which = args.find(a => /^(chromium|webkit|both)$/.test(a)) || 'both';
const haveSprites = fs.existsSync(path.join(root, 'sprites.js')), stub = args.includes('--stub') || !haveSprites;
const url = 'file:///' + path.join(__dirname, 'render-floor.html').replace(/\\/g, '/') + (stub ? '?stub=1' : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(name) {
  const fails = [], notes = [], sfx = name === 'chromium' ? '' : '-' + name;
  const ok = (cond, msg) => { if (!cond) fails.push(msg); return cond; };
  const browser = await pw[name].launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  try {
  await page.goto(url);
  await page.waitForFunction('window.RT && RT.ready', null, { timeout: 15000 });
  const shot = n => page.screenshot({ path: path.join(shots, 'render-' + n + sfx + '.png') });
  const dbg = () => page.evaluate(() => ZRender.debug());
  // expected screen position of a hex, worked out here from the camera and scale (independent of the renderer's own helper)
  const posOf = async (q, r, dx, dy) => page.evaluate(([q, r, dx, dy]) => { const d = ZRender.debug(), p = ZGeo.toScreen(q, r), b = document.getElementById('floor').getBoundingClientRect(); return { x: b.left + (p.x + dx - d.cam.x) * d.buffer.scale, y: b.top + (p.y + dy - d.cam.y) * d.buffer.scale, w: b.width, h: b.height }; }, [q, r, dx || 0, dy || 0]);
  const lastTap = () => page.evaluate(() => RT.taps[RT.taps.length - 1] || null);
  const tapCount = () => page.evaluate(() => RT.taps.length);

  await sleep(3500);
  const d0 = await dbg();
  notes.push('sprites: ' + (d0.realSprites ? 'REAL sprites.js' : 'built-in stub shapes') + (Object.keys(d0.spriteErrors).length ? ' (sprite errors: ' + JSON.stringify(d0.spriteErrors) + ')' : ''));
  notes.push('harness log: ' + JSON.stringify(await page.evaluate(() => RT.log)));
  notes.push('buffer ' + d0.buffer.w + 'x' + d0.buffer.h + ' at ' + d0.buffer.scale + ' CSS px (' + d0.buffer.deviceScale + ' device px) per art pixel; drawn sprites ' + d0.sprites + ', animals ' + d0.animals + ', visitors ' + d0.visitors + ', staff ' + d0.staff + ', combos outlined ' + d0.combos + ', path hexes ' + d0.paths);
  notes.push('frame cost ' + d0.frameMs + ' ms, ' + d0.fps + ' fps (headless)');
  ok(d0.buffer.deviceScale === 4 && Math.abs(d0.buffer.w - 195) <= 1, 'buffer should be 195 wide at 4 device px, got ' + JSON.stringify(d0.buffer));
  ok(d0.animals > 10, 'animals on the floor: ' + d0.animals); ok(d0.visitors > 5, 'visitors on the floor: ' + d0.visitors); ok(d0.sprites > 40, 'sprites drawn: ' + d0.sprites);
  await shot('floor');

  // --- crisp scale-up: every 4x4 device block of the screenshot is one flat colour
  const crisp = await page.evaluate(() => { const c = document.getElementById('floor'), d = ZRender.debug(), n = d.buffer.deviceScale, x = c.getContext('2d'); const ox = Math.round((d.cam.x - Math.floor(d.cam.x)) * n), oy = Math.round((d.cam.y - Math.floor(d.cam.y)) * n); const im = x.getImageData(0, 0, c.width, c.height).data; let bad = 0, tot = 0; for (let by = 3; by < 60; by++) for (let bx = 3; bx < 60; bx++) { const X = bx * n - ox, Y = by * n - oy, i0 = (Y * c.width + X) * 4; tot++; for (let k = 1; k < n * n; k++) { const i = ((Y + (k / n | 0)) * c.width + X + k % n) * 4; if (im[i] !== im[i0] || im[i + 1] !== im[i0 + 1] || im[i + 2] !== im[i0 + 2]) { bad++; break; } } } return { bad, tot, style: getComputedStyle(c).imageRendering, w: c.width, h: c.height }; });
  ok(crisp.bad === 0, 'blurry scale-up: ' + crisp.bad + ' of ' + crisp.tot + ' art pixels are not flat'); ok(crisp.w === 780, 'canvas backing width should be 780, got ' + crisp.w);
  notes.push('crisp check: ' + (crisp.tot - crisp.bad) + '/' + crisp.tot + ' sampled art pixels flat; image-rendering ' + crisp.style + '; canvas ' + crisp.w + 'x' + crisp.h);

  // --- tap hit-testing over the whole grid (centre each hex, tap it, also tap off-centre points inside it)
  const grid = await page.evaluate(() => { const out = [], occ = ZE.occupancy(RT.S); for (let r = 0; r < ZD.GRID_H; r++) for (let c = 0; c < ZD.GRID_W; c++) { const a = ZE.fromOffset(c, r); out.push({ q: a[0], r: a[1], item: occ[a[0] + ',' + a[1]] || null, owned: ZE.inLand(RT.S, a[0], a[1]) }); } return out; });
  let tapped = 0, wrong = 0, ownedTapped = 0; const ownedAll = grid.filter(g => g.owned).length; const OFF = [[0, 0], [-19, 0], [19, 2], [0, -12], [8, 11], [-14, -7]];
  for (let i = 0; i < grid.length; i += 1) {
    const g = grid[i]; await page.evaluate(([q, r]) => ZRender.centerOn(q, r, true), [g.q, g.r]);
    const o = OFF[i % OFF.length], p = await posOf(g.q, g.r, o[0], o[1]); if (p.x < 2 || p.y < 2 || p.x > p.w - 2 || p.y > p.h - 2) continue;
    const n0 = await tapCount();
    if (i % 4 === 0) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    const t = await lastTap(), n1 = await tapCount(); tapped++; if (g.owned) ownedTapped++;
    if (n1 !== n0 + 1 || !t || t.q !== g.q || t.r !== g.r || t.item !== g.item) { wrong++; if (wrong < 4) fails.push('tap on hex ' + g.q + ',' + g.r + ' offset ' + o + ' reported ' + JSON.stringify(t) + ' (expected item ' + g.item + ')'); }
  }
  ok(ownedTapped === ownedAll, 'only ' + ownedTapped + ' of ' + ownedAll + ' owned hexes could be tapped (unowned hexes far past the scroll limit are out of reach on purpose)'); ok(wrong === 0, wrong + ' of ' + tapped + ' taps reported the wrong hex');
  notes.push('tap test: ' + (tapped - wrong) + '/' + tapped + ' taps reported the right hex and item, covering all ' + ownedAll + ' owned hexes (mouse and touch, centre and off-centre)');
  const helper = await page.evaluate(() => { let bad = 0; for (let r = 0; r < ZD.GRID_H; r++) for (let c = 0; c < ZD.GRID_W; c++) { const a = ZE.fromOffset(c, r), p = ZRender.hexToClient(a[0], a[1]), h = ZRender.clientToHex(p.x, p.y); if (h.q !== a[0] || h.r !== a[1]) bad++; } return bad; });
  ok(helper === 0, 'hexToClient/clientToHex round trip failed for ' + helper + ' hexes');

  // --- drag scrolls, does not tap, is clamped, and coasts a little
  const ent = await page.evaluate(() => ZRender.entrance());
  await page.evaluate(([q, r]) => ZRender.centerOn(q, r - 6, true), [ent.q, ent.r]); await sleep(100);
  const c0 = (await dbg()).cam, n0 = await tapCount();
  await page.mouse.move(300, 420); await page.mouse.down(); for (let i = 1; i <= 8; i++) { await page.mouse.move(300 - i * 18, 420 + i * 10); await sleep(16); } const cMid = (await dbg()).cam; await page.mouse.up();
  await sleep(700); const c1 = (await dbg()).cam;
  ok(Math.abs((cMid.x - c0.x) - 72) < 3 && Math.abs((cMid.y - c0.y) + 40) < 3, 'drag of 144,-80 CSS px should move the camera 72,-40 art px, moved ' + (cMid.x - c0.x).toFixed(1) + ',' + (cMid.y - c0.y).toFixed(1));
  ok(await tapCount() === n0, 'a drag fired a tap'); ok(c1.x > cMid.x + 1, 'no inertia after a flick (camera stayed at ' + cMid.x.toFixed(1) + ')');
  notes.push('drag: camera moved ' + (cMid.x - c0.x).toFixed(1) + ',' + (cMid.y - c0.y).toFixed(1) + ' art px for a 144,-80 px drag, then coasted ' + (c1.x - cMid.x).toFixed(1) + ' more; no tap fired');
  await shot('drag');
  await page.mouse.move(60, 200); await page.mouse.down(); for (let i = 1; i <= 30; i++) await page.mouse.move(60 + i * 60, 200 + i * 60); await page.mouse.up(); await sleep(900);
  const cA = (await dbg()).cam; await page.mouse.move(60, 200); await page.mouse.down(); await page.mouse.move(200, 330, { steps: 4 }); await page.mouse.up(); await sleep(600); const cB = (await dbg()).cam;
  ok(Math.abs(cA.x - cB.x) < 0.01 && Math.abs(cA.y - cB.y) < 0.01, 'camera is not clamped at the map corner'); ok(await tapCount() === n0, 'a drag at the clamp fired a tap');
  // a small wobble under 8 px still counts as a tap
  await page.evaluate(([q, r]) => ZRender.centerOn(q, r - 5, true), [ent.q, ent.r]);
  await page.mouse.move(200, 400); await page.mouse.down(); await page.mouse.move(203, 403); await page.mouse.up(); ok(await tapCount() === n0 + 1, 'a 4 px wobble should still be a tap');

  // --- calm state: nothing moves while a menu is open; fx wait
  await page.evaluate(() => { ZRender.setRunning(false); RT.S.fx.push({ type: 'money', amt: 250, gate: true }); }); await sleep(200);
  const s1 = await page.screenshot(); await sleep(700); const s2 = await page.screenshot();
  ok(s1.equals(s2), 'floor still moves while setRunning(false)'); ok(await page.evaluate(() => RT.S.fx.length) === 1, 'fx were consumed while paused');
  await page.evaluate(() => ZRender.setRunning(true)); await sleep(300); const s3 = await page.screenshot(); await sleep(500); const s4 = await page.screenshot();
  ok(!s3.equals(s4), 'floor does not animate while running');
  // --- pop-ups from S.fx
  const hid = await page.evaluate(() => { const S = RT.S, h = RT.H.jungle || RT.H.savanna; ZRender.centerOn(h.q, h.r, true); const shop = S.items.find(i => i.k === 'fac'); S.fx.push({ type: 'event', hab: h.id, gains: { animals: 2, habitat: 1, fun: 3, learning: 1 }, fired: 'fun', who: 'Ada' }, { type: 'birth', hab: RT.H.savanna.id }, { type: 'money', amt: 1240, item: shop.id }, { type: 'rp', amt: 6, hab: h.id }, { type: 'mystery-new-type' }); return h.id; });
  await sleep(450); const dF = await dbg(); ok(dF.floaters >= 6, 'pop-ups not created from S.fx: ' + dF.floaters); ok(await page.evaluate(() => RT.S.fx.length) === 0, 'S.fx not emptied');
  await sleep(350); await shot('fx'); await sleep(2600); ok((await dbg()).floaters === 0, 'pop-ups never finish');

  // --- zoomed-out level
  await page.evaluate(([q, r]) => { ZRender.setZoom(0); ZRender.centerOn(q, r - 6, true); }, [ent.q, ent.r]); await sleep(500);
  const dZ = await dbg(); ok(dZ.zoom === 0 && dZ.buffer.deviceScale === 3, 'zoom 0 should be 3 device px per art pixel, got ' + dZ.buffer.deviceScale);
  await shot('zoomout');
  let zw = 0, zt = 0; for (let i = 0; i < grid.length; i += 7) { const g = grid[i], p = await posOf(g.q, g.r, 5, -3); if (p.x < 2 || p.y < 2 || p.x > p.w - 2 || p.y > p.h - 2) continue; await page.mouse.click(p.x, p.y); const t = await lastTap(); zt++; if (!t || t.q !== g.q || t.r !== g.r) zw++; }
  ok(zt > 8 && zw === 0, 'zoomed out: ' + zw + ' of ' + zt + ' taps wrong'); notes.push('zoomed out: buffer ' + dZ.buffer.w + 'x' + dZ.buffer.h + ', ' + (zt - zw) + '/' + zt + ' taps right');
  await page.evaluate(() => ZRender.setZoom(1)); await sleep(200); ok((await dbg()).buffer.deviceScale === 4, 'zoom 1 did not come back');

  // --- placement mode
  const spots = await page.evaluate(() => {
    const S = RT.S, occ = ZE.occupancy(S), free = [], taken = []; let combo = null, hab = null;
    for (let r = 0; r < ZD.GRID_H; r++) for (let c = 0; c < ZD.GRID_W; c++) { const a = ZE.fromOffset(c, r), q = a[0]; if (!ZE.inLand(S, q, r)) continue; if (occ[q + ',' + r]) taken.push({ q, r }); else if (ZE.canPlace(S, 'fac', 'snack', q, r, 0)) free.push({ q, r }); }
    const now = {}; ZE.c(S).active.forEach(a => { now[a.id + '@' + a.anchor] = 1; });
    ZD.FAC_ORDER.forEach(t => free.forEach(f => { if (combo) return; const L = ZE.layout(S, S.items.concat([{ id: -1, k: 'fac', t: t, q: f.q, r: f.r, rot: 0 }])); const nw = L.active.filter(a => !now[a.id + '@' + a.anchor]); if (nw.length) combo = { t: t, q: f.q, r: f.r, name: ZD.COMBOS.find(x => x.id === nw[0].id).name }; }));
    for (const f of free) { for (let rot = 0; rot < 6 && !hab; rot++) if (ZE.canPlace(S, 'hab', 'savanna', f.q, f.r, rot)) hab = { q: f.q, r: f.r, rot: rot }; if (hab) break; }
    const act = ZE.c(S).active[0], brk = act ? { id: act.members[0], name: ZD.COMBOS.find(x => x.id === act.id).name } : null;
    const far = free.filter(f => f.r > ZD.GRID_H - 8); return { free: far[Math.floor(far.length / 2)] || free[0], taken: taken[Math.floor(taken.length / 2)], combo, hab, brk, lone: free.find(f => ZE.DIRS.every(d => !occ[(f.q + d[0]) + ',' + (f.r + d[1])])) };
  });
  const tapHex = async h => { await page.evaluate(([q, r]) => ZRender.centerOn(q, r, true), [h.q, h.r]); const p = await posOf(h.q, h.r, 0, 0); await page.touchscreen.tap(p.x, p.y); await sleep(60); };
  const note = () => page.evaluate(() => document.getElementById('placement-note').textContent);
  const btn = cls => page.locator('#placement-bar button.' + cls);
  const nT = await tapCount();
  await page.evaluate(() => RT.place({ kind: 'fac', t: 'snack', label: 'Snack Stand' }));
  ok(await page.evaluate(() => ZRender.placing()), 'placing() false after startPlacement'); ok(await page.locator('#placement-bar button').count() === 3, 'placement bar should hold 3 buttons');
  const sizes = await page.evaluate(() => Array.from(document.querySelectorAll('#placement-bar button')).map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, h: Math.round(r.height), w: Math.round(r.width), vis: r.height > 0 && r.bottom <= innerHeight }; }));
  ok(sizes.every(s => s.h >= 56 && s.vis) && sizes.map(s => s.t).join() === 'Rotate,Place,Cancel', 'placement buttons wrong: ' + JSON.stringify(sizes)); notes.push('placement buttons: ' + JSON.stringify(sizes));
  await tapHex(spots.free); let dp = (await dbg()).placement;
  ok(dp.q === spots.free.q && dp.r === spots.free.r && dp.ok, 'ghost did not move to the tapped free hex: ' + JSON.stringify(dp)); ok(/fits here/i.test(await note()), 'note on a free hex: "' + await note() + '"');
  await page.evaluate(([q, r]) => ZRender.centerOn(q, r - 4, true), [spots.free.q, spots.free.r]); await sleep(250); await shot('place-valid'); notes.push('valid note: "' + await note() + '"');
  await tapHex(spots.taken); dp = (await dbg()).placement; ok(!dp.ok && dp.state === 'bad', 'ghost on a built hex should be invalid'); ok(/in the way/i.test(await note()), 'note on a built hex: "' + await note() + '"');
  await page.evaluate(([q, r]) => ZRender.centerOn(q, r - 4, true), [spots.taken.q, spots.taken.r]); await sleep(250); await shot('place-invalid'); notes.push('invalid note: "' + await note() + '"');
  await btn('zr-place').click({ force: true }); ok(await page.evaluate(() => RT.placed.length) === 0, 'Place on an invalid spot must not call onPlace');
  ok(await tapCount() === nT, 'taps leaked to onTap during placement');
  await tapHex(spots.free); await btn('zr-place').click();
  ok(await page.evaluate(() => RT.placed.length === 1 && RT.placed[0].q) === spots.free.q, 'Place did not call onPlace with the ghost hex'); ok(!(await page.evaluate(() => ZRender.placing())), 'placement should end after a successful place');
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('placement-bar')).display) === 'none', 'placement bar still visible after placing');
  // rotate + cancel with a habitat
  await page.evaluate(() => RT.place({ kind: 'hab', t: 'savanna', label: 'Savanna' })); await tapHex(spots.hab || spots.free);
  const r0 = (await dbg()).placement.rot; await btn('zr-rotate').click(); await btn('zr-rotate').click(); ok((await dbg()).placement.rot === (r0 + 2) % 6, 'Rotate did not turn the ghost');
  await page.evaluate(([q, r]) => ZRender.centerOn(q, r - 3, true), [(spots.hab || spots.free).q, (spots.hab || spots.free).r]); await sleep(250); await shot('place-habitat');
  await btn('zr-cancel').click(); ok(await page.evaluate(() => RT.cancelled) === 1 && !(await page.evaluate(() => ZRender.placing())), 'Cancel did not call onCancel and leave placement');
  // refusal message, repeat mode
  await page.evaluate(() => RT.place({ kind: 'fac', t: 'bench', refuse: true })); await tapHex(spots.free); await btn('zr-place').click();
  ok(/not enough money/i.test(await note()) && await page.evaluate(() => ZRender.placing()), 'a refused place should show the reason and stay in placement: "' + await note() + '"'); await btn('zr-cancel').click();
  // combo preview
  if (spots.combo) { await page.evaluate(c => RT.place({ kind: 'fac', t: c.t }), spots.combo); await tapHex(spots.combo); const t = await note(); ok(t.indexOf('Completes ' + spots.combo.name) >= 0, 'combo note should say Completes ' + spots.combo.name + ': "' + t + '"'); notes.push('combo note: "' + t + '"'); await page.evaluate(([q, r]) => ZRender.centerOn(q, r - 3, true), [spots.combo.q, spots.combo.r]); await sleep(250); await shot('place-combo'); await btn('zr-cancel').click(); } else notes.push('NOT TESTED: no combo-completing spot found in the demo zoo');
  if (spots.brk && spots.lone) { await page.evaluate(b => RT.place({ moveId: b.id }), spots.brk); await tapHex(spots.lone); const t = await note(); ok(t.indexOf('Breaks ' + spots.brk.name) >= 0, 'move note should say Breaks ' + spots.brk.name + ': "' + t + '"'); notes.push('break note: "' + t + '"'); await btn('zr-cancel').click(); } else notes.push('NOT TESTED: no combo to break in the demo zoo');
  // repeat mode really builds twice and the floor picks the new buildings up
  const items0 = await page.evaluate(() => RT.S.items.length);
  await page.evaluate(() => RT.place({ kind: 'fac', t: 'bench', repeat: true, real: true })); await tapHex(spots.lone || spots.free); await btn('zr-place').click();
  ok(await page.evaluate(() => ZRender.placing()), 'repeat mode should stay in placement'); ok(/in the way/i.test(await note()), 'after a repeat place the same hex should now be taken: "' + await note() + '"');
  await btn('zr-cancel').click(); ok(await page.evaluate(() => RT.S.items.length) === items0 + 1, 'repeat place did not build');
  const tp = await posOf((spots.lone || spots.free).q, (spots.lone || spots.free).r, 0, 0); await page.mouse.click(tp.x, tp.y); const lt = await lastTap(); ok(lt && lt.item != null, 'the new building is not reported by a tap');

  // --- callers and happening characters at the gate; sick / choice / breed / event icons; one animal walking per habitat
  await page.evaluate(() => ZRender.setRunning(true));
  const setup = await page.evaluate(() => {
    const S = RT.S, out = { hap: null };
    ZE.debug.caller(S, 'trader'); ZE.debug.caller(S, 'headhunter');
    for (const k of Object.keys(ZD.HAPPENINGS)) { if (!ZD.HAPPENINGS[k].who) continue; let okk = false; try { okk = ZE.debug.happening(S, k); } catch (e) { okk = false; } if (okk && S.happening && S.happening.who) { out.hap = { key: k, who: S.happening.who }; break; } }
    S.reports = [];
    const sickA = S.animals.find(a => a.hab === RT.H.arctic.id); sickA.sick = S.week + 5; out.sickHab = RT.H.arctic.id;
    const pr = S.projects.find(p => p.hab != null); if (pr) { pr.choice = { key: 'test', title: 'Test', text: '', options: [{ label: 'A' }, { label: 'B' }] }; out.choiceHab = pr.hab; }
    out.callers = ZE.callersHere(S).map(c => c.kind);
    return out;
  });
  await sleep(900);
  const chk = await page.evaluate(() => { const S = RT.S, d = ZRender.debug(), exp = {}; S.items.filter(i => i.k === 'hab').forEach(h => { const st = ZE.habStatus(S, h), e = []; if (st.choice) e.push('choice'); if (st.sick) e.push('sick'); if (st.event) e.push('ready-event'); if (st.breed) e.push('ready-breed'); if (st.busy && st.progress != null) e.push('bar'); exp[h.id] = e; }); const got = {}; Object.keys(d.icons).forEach(id => { got[id] = d.icons[id].filter(n => n !== 'flame' && n !== 'busy'); }); return { exp, got, gateKinds: d.gateKinds, gateMarks: d.gateMarks }; });
  ok(JSON.stringify(chk.exp) === JSON.stringify(chk.got), 'on-floor icons differ from ZE.habStatus: expected ' + JSON.stringify(chk.exp) + ' got ' + JSON.stringify(chk.got));
  const allIcons = [].concat(...Object.values(chk.got));
  ok(setup.callers.length >= 2 && setup.callers.every(k => chk.gateKinds.includes(k)), 'callers ' + JSON.stringify(setup.callers) + ' not all at the gate: ' + JSON.stringify(chk.gateKinds));
  if (ok(!!setup.hap, 'no happening with a character could be forced')) ok(chk.gateKinds.includes(setup.hap.who) && chk.gateMarks.includes(setup.hap.who), 'happening character ' + setup.hap.who + ' not at the gate with a mark: ' + JSON.stringify(chk.gateKinds));
  ok((chk.got[setup.sickHab] || []).includes('sick'), 'sick icon missing'); ok(setup.choiceHab != null && (chk.got[setup.choiceHab] || []).includes('choice'), 'choice icon missing');
  ok(allIcons.includes('ready-breed'), 'no habitat shows the breed-ready icon (the savanna pair should)'); ok(allIcons.includes('ready-event'), 'no habitat shows the event-ready icon');
  notes.push('gate: ' + JSON.stringify(chk.gateKinds) + ' (marked: ' + JSON.stringify(chk.gateMarks) + '); icons by habitat: ' + JSON.stringify(chk.got));
  await page.evaluate(([q, r]) => ZRender.centerOn(q, r - 2, true), [ent.q, ent.r]); await sleep(2500); await shot('gate');
  let maxMoving = 0; for (let i = 0; i < 40; i++) { const mv = (await dbg()).moving; Object.values(mv).forEach(n => { maxMoving = Math.max(maxMoving, n); }); await sleep(120); }
  ok(maxMoving <= 1, 'more than one animal walking at once in a habitat: ' + maxMoving); notes.push('animals walking at once per habitat (40 samples): at most ' + maxMoving);
  await page.evaluate(() => { const S = RT.S; S.happening = null; S.headhunt = null; S.animals.forEach(a => { a.sick = 0; }); S.projects.forEach(p => { delete p.choice; }); }); await sleep(900);
  const after = await dbg(); ok(setup.hap && !after.gateKinds.includes(setup.hap.who) && !after.gateKinds.includes('headhunter'), 'gate people did not leave: ' + JSON.stringify(after.gateKinds)); ok(![].concat(...Object.values(after.icons)).some(n => n === 'sick' || n === 'choice'), 'sick/choice icons did not clear');

  // --- final state
  await sleep(300); const dEnd = await dbg(); notes.push('end: frame cost ' + dEnd.frameMs + ' ms, ' + dEnd.fps + ' fps, sprites ' + dEnd.sprites);
  const pageErrs = await page.evaluate(() => RT.errors);
  ok(errors.length === 0 && pageErrs.length === 0, 'console/page errors: ' + JSON.stringify(errors.concat(pageErrs)));
  ok(Object.keys(dEnd.spriteErrors).length === 0, 'sprite calls threw: ' + JSON.stringify(dEnd.spriteErrors));
  } catch (e) { fails.push('crashed: ' + (e && e.stack || e)); }
  await browser.close();
  return { name, fails, notes };
}

// The real page: index.html with the Shell. Floor draws, a tap opens the menu and pauses, placement builds through ZCore, new game re-aims the camera.
async function runShell(name) {
  const fails = [], notes = [], sfx = name === 'chromium' ? '' : '-' + name, ok = (c, m) => { if (!c) fails.push(m); return c; };
  const browser = await pw[name].launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  try {
    await page.goto(require('url').pathToFileURL(path.join(root, 'index.html')).href);
    await page.waitForFunction('window.ZT && window.ZRender && document.documentElement.getAttribute("data-ready") === "1"', null, { timeout: 15000 });
    await page.evaluate(() => { ZT.newGame({}); if (ZT.popAll) ZT.popAll(); if (ZT.flush) ZT.flush(); }); await sleep(400);
    for (let i = 0; i < 12 && (await page.evaluate(() => ZT.stack().length)) > 0; i++) { await page.evaluate(() => ZT.popAll()); await sleep(150); }
    await sleep(2500);
    await page.screenshot({ path: path.join(shots, 'render-newgame' + sfx + '.png') });
    const d = await page.evaluate(() => ZRender.debug());
    ok(d.sprites > 20 && d.animals >= 2, 'floor not drawing in index.html: ' + d.sprites + ' sprites, ' + d.animals + ' animals'); ok(d.realSprites, 'index.html is not using the real sprites');
    const view = await page.evaluate(() => { const S = ZT.S, b = document.getElementById('floor').getBoundingClientRect(), out = { w: b.width, h: b.height, all: true, pts: [] }; const pts = [ZE.entrance(S)]; S.items.forEach(it => ZE.cells(it).forEach(c => pts.push({ q: c[0], r: c[1] }))); pts.forEach(p => { const c = ZRender.hexToClient(p.q, p.r), inside = c.x > b.left + 30 && c.x < b.right - 30 && c.y > b.top + 50 && c.y < b.bottom - 40; if (!inside) out.all = false; out.pts.push([Math.round(c.x - b.left), Math.round(c.y - b.top)]); }); let own = 0, tot = 0; for (let y = 10; y < b.height; y += 20) for (let x = 10; x < b.width; x += 20) { const h = ZRender.clientToHex(b.left + x, b.top + y); tot++; if (ZE.inLand(S, h.q, h.r)) own++; } out.owned = Math.round(100 * own / tot); return out; });
    ok(view.all, 'new game: the starting habitat, snack stand and gate are not all comfortably in view: ' + JSON.stringify(view.pts));
    notes.push('index.html new game: floor ' + view.w + 'x' + Math.round(view.h) + ' CSS px, ' + d.sprites + ' sprites, owned land covers ' + view.owned + '% of the floor area; habitat, stand and gate all in view');
    ok(await page.evaluate(() => ZT.running()), 'game should be running with no screen open');
    // tap opens the menu and pauses
    const b = await page.evaluate(() => { const r = document.getElementById('floor').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; });
    await page.touchscreen.tap(b.x, b.y); await sleep(300);
    ok(await page.evaluate(() => ZT.stack().length) > 0, 'a tap on the floor did not open a screen'); ok(!(await page.evaluate(() => ZT.running())), 'game still running with the menu open');
    notes.push('tap opened: ' + JSON.stringify(await page.evaluate(() => ZT.stack())));
    await page.evaluate(() => ZT.popAll()); await sleep(200);
    // a drag does not open the menu
    await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(b.x - 60, b.y - 30, { steps: 5 }); await page.mouse.up(); await sleep(200);
    ok(await page.evaluate(() => ZT.stack().length) === 0, 'a drag opened the menu');
    // placement through ZCore
    const spot = await page.evaluate(() => { const S = ZT.S; window.__placed = 0; window.__cancel = 0; S.money = Math.max(S.money, 50000); let best = null; for (let r = 0; r < ZD.GRID_H; r++) for (let c = 0; c < ZD.GRID_W; c++) { const a = ZE.fromOffset(c, r); if (!ZE.canPlace(S, 'fac', 'bench', a[0], r, 0)) continue; const hb = S.items.find(i => i.k === 'hab'), d2 = Math.abs(a[0] - hb.q) + Math.abs(r - hb.r); if (!best || d2 < best.d) best = { q: a[0], r: r, d: d2 }; }
      ZRender.startPlacement({ kind: 'fac', t: 'bench', label: 'Garden Bench' }, { onPlace: (q, r, rot) => { window.__placed++; return ZT.act('build', 'fac', 'bench', q, r, rot); }, onCancel: () => { window.__cancel++; } }); ZRender.centerOn(best.q, best.r, true); return best; });
    await sleep(300); ok(!(await page.evaluate(() => ZT.running())), 'game should pause during placement');
    const pc = await page.evaluate(([q, r]) => ZRender.hexToClient(q, r), [spot.q, spot.r]); await page.touchscreen.tap(pc.x, pc.y); await sleep(250);
    ok(await page.evaluate(() => ZT.stack().length) === 0, 'a tap during placement opened the menu');
    await page.screenshot({ path: path.join(shots, 'render-shell-place' + sfx + '.png') });
    const bar = await page.evaluate(() => Array.from(document.querySelectorAll('#placement-bar button')).map(x => { const r = x.getBoundingClientRect(); return { t: x.textContent, h: Math.round(r.height), on: r.bottom <= innerHeight && r.height > 0 }; }));
    ok(bar.length === 3 && bar.every(x => x.h >= 56 && x.on), 'placement buttons in index.html: ' + JSON.stringify(bar)); notes.push('index.html placement: note "' + await page.evaluate(() => document.getElementById('placement-note').textContent) + '", buttons ' + JSON.stringify(bar));
    const n0 = await page.evaluate(() => ZT.S.items.length); await page.locator('#placement-bar button.zr-place').click(); await sleep(500);
    for (let i = 0; i < 8 && (await page.evaluate(() => ZT.stack().length)) > 0; i++) { await page.evaluate(() => ZT.popAll()); await sleep(150); }
    ok(await page.evaluate(() => window.__placed) === 1 && await page.evaluate(() => ZT.S.items.length) === n0 + 1, 'Place did not build through ZCore'); ok(!(await page.evaluate(() => ZRender.placing())), 'still placing after a successful build');
    const statics = await page.evaluate(() => ZRender.debug().statics); await sleep(500); ok(await page.evaluate(([q, r]) => { const S = ZT.S; return !!ZE.occupancy(S)[q + ',' + r]; }, [spot.q, spot.r]), 'bench not on the map');
    { const stt = await page.evaluate(() => ({ run: ZT.running(), stack: ZT.stack(), busy: ZCore.busy, placing: ZRender.placing(), reports: ZT.S.reports.map(r => r.type) })); ok(stt.run, 'game should run again after placement: ' + JSON.stringify(stt)); }
    // new game: the camera re-aims even though the Shell never calls reset()
    await page.evaluate(() => ZRender.centerOn(-50, -50, true)); await sleep(150); const far = (await page.evaluate(() => ZRender.debug())).cam;
    await page.evaluate(() => { ZT.newGame({}); ZT.popAll(); }); await sleep(900); for (let i = 0; i < 8 && (await page.evaluate(() => ZT.stack().length)) > 0; i++) { await page.evaluate(() => ZT.popAll()); await sleep(150); }
    const d2 = await page.evaluate(() => ZRender.debug());
    ok(Math.abs(d2.cam.x - d.cam.x) < 1 && Math.abs(d2.cam.y - d.cam.y) < 1 && Math.abs(d2.cam.x - far.x) + Math.abs(d2.cam.y - far.y) > 20, 'camera did not re-aim on a new game: ' + JSON.stringify([d.cam, far, d2.cam]));
    const shellErrs = await page.evaluate(() => ZT.errors.map(String));
    ok(errors.length === 0 && shellErrs.length === 0, 'errors in index.html: ' + JSON.stringify(errors.concat(shellErrs)).slice(0, 600));
  } catch (e) { fails.push('crashed: ' + (e && e.stack || e)); }
  await browser.close();
  return { name: name + ' / index.html', fails, notes };
}

(async () => {
  let bad = 0;
  for (const n of which === 'both' ? ['chromium', 'webkit'] : [which]) {
    for (const fn of [run, runShell]) {
    let res; try { res = await fn(n); } catch (e) { res = { name: n, fails: ['crashed: ' + (e && e.stack || e)], notes: [] }; }
    console.log('\n=== ' + res.name + ' ===\n' + res.notes.map(x => '  ' + x).join('\n'));
    console.log(res.fails.length ? '  FAILED (' + res.fails.length + '):\n' + res.fails.map(x => '   - ' + x).join('\n') : '  ALL CHECKS PASSED');
    bad += res.fails.length;
    }
  }
  process.exit(bad ? 1 : 0);
})();
