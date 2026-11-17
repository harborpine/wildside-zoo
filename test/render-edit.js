/* Renderer checks for Update 7. Headless only.   node test/render-edit.js [chromium|webkit|both]
   Phone size 393x852 at 3x. Covers: the Update 8 border walkways (a strip inside each habitat drawn as path, walked by people,
   nobody inside a fence, habitats may touch, a building closed in by habitats still reached, the strip shown with the placement
   ghost, refusals explained and the hexes in the way marked), speed 2 (the board moves twice as fast, smoothly, nobody
   off the walkable hexes), Edit mode (pick, select, move, add, the #edit-bar allowance, leaving), and small challenge maps.
   Screenshots: test/shots/render-r7-*.png (WebKit copies end in -webkit.png). Exit code 1 if any check fails. */
const path = require('path'), fs = require('fs'), urlm = require('url');
const pw = require('./pw.js'), setup = require('./render-setup.js');
const root = path.resolve(__dirname, '..'), shots = path.join(__dirname, 'shots');
fs.mkdirSync(shots, { recursive: true });
const which = process.argv.slice(2).find(a => /^(chromium|webkit|both)$/.test(a)) || 'both';
const only = process.argv.slice(2).find(a => /^(floor|challenge)$/.test(a)) || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PHONE = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true };

async function open(name, url, readyFn) {
  const browser = await pw[name].launch({ headless: true }), ctx = await browser.newContext(PHONE), page = await ctx.newPage(), errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FILE_NOT_FOUND|Not allowed to load local resource|Access-Control-Allow-Origin/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(url); await page.waitForFunction(readyFn, null, { timeout: 15000 });
  return { browser, page, errors };
}

// ------------------------------------------------------------------ the floor harness: walkways, speed, Edit mode
async function runFloor(name) {
  const fails = [], notes = [], sfx = name === 'chromium' ? '' : '-' + name, ok = (c, m) => { if (!c) fails.push(m); return c; };
  const { browser, page, errors } = await open(name, urlm.pathToFileURL(path.join(__dirname, 'render-floor.html')).href, 'window.RT && RT.ready');
  const shot = n => page.screenshot({ path: path.join(shots, 'render-r7-' + n + sfx + '.png') });
  const dbg = () => page.evaluate(() => ZRender.debug());
  const at = (q, r) => page.evaluate(([q, r]) => ZRender.hexToClient(q, r), [q, r]);
  const tapHex = async (h, centre) => { if (centre !== false) { await page.evaluate(([q, r]) => ZRender.centerOn(q, r, true), [h.q, h.r]); await sleep(60); } const p = await at(h.q, h.r); await page.touchscreen.tap(p.x, p.y); await sleep(80); };
  const note = () => page.evaluate(() => document.getElementById('placement-note').textContent);
  const btn = cls => page.locator('#placement-bar button.' + cls);
  try {
    // the demo facilities, right against their habitats; then start the floor again with a speed the test controls and a
    // state it can swap (ZRender.init is safe to call again)
    const built = await page.evaluate(setup.facSetup); await page.evaluate(setup.pixelTools);
    ok(built.length === 5, 'the five demo facilities should all find a legal spot against a habitat, built: ' + JSON.stringify(built));
    await page.evaluate(() => {
      window.SPD = 1; RT.cur = RT.S; RT.picks = []; RT.exits = 0; RT.moves = [];
      ZRender.init(document.getElementById('floor'), { getState: () => RT.cur, getSpeed: () => window.SPD, onTap: t => RT.taps.push({ q: t.q, r: t.r, item: t.item ? t.item.id : null }) });
      ZRender.watchAlpha(true);
    });
    await sleep(3000);
    const K = await page.evaluate(() => ZGeo.DENSITY || 1), d0 = await dbg();
    notes.push('floor: buffer ' + d0.buffer.w + 'x' + d0.buffer.h + ' at ' + d0.buffer.scale + ' CSS px per buffer pixel (dpr ' + d0.buffer.dpr + '); visitors ' + d0.visitors + ', animals ' + d0.animals + ', path hexes ' + d0.paths + ', border strip edges ' + d0.strips);

    // ---------- 1. the border walkways (Update 8): a narrow strip inside every habitat's own hexes, the fence inward of it
    const kindAt = (x, y) => page.evaluate(([x, y]) => { // what the ground looks like at one buffer point: majority of 5 pixels round it
      const cv = document.getElementById('floor'), im = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height), b = cv.getBoundingClientRect(), sx = cv.width / b.width, n = { path: 0, grass: 0, hab: 0 };
      [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].forEach(o => { const c = ZRender.bufToClient(x + o[0], y + o[1]), X = Math.round((c.x - b.left) * sx), Y = Math.round((c.y - b.top) * sx); if (X < 0 || Y < 0 || X >= cv.width || Y >= cv.height) return; const i = (Y * cv.width + X) * 4, R = im.data[i], G = im.data[i + 1], B = im.data[i + 2]; if (R > 150 && R > G + 8 && G > B) n.path++; else if (G > R + 15 && G > B) n.grass++; else n.hab++; });
      return n.path >= 3 ? 'path' : n.grass >= 3 ? 'grass' : 'other'; }, [x, y]);
    const walkInfo = await page.evaluate(() => { const S = RT.S, habs = S.items.filter(i => i.k === 'hab'), occ = ZE.occupancy(S), cells = habs.reduce((n, h) => n + ZE.cells(h).length, 0);
      return { habs: habs.length, ring: ZE.ringCells(S).length, footprint: Object.keys(occ).filter(k => habs.some(h => h.id === occ[k])).length, cells: cells }; });
    ok(walkInfo.habs >= 5 && walkInfo.ring === 0 && walkInfo.footprint === walkInfo.cells, 'five habitats, no ring hexes, each habitat only on its own hexes: ' + JSON.stringify(walkInfo));
    ok(d0.strips >= walkInfo.habs * 6 && d0.stripNodes > d0.strips, 'every habitat should have its border strip in the walk graph: ' + JSON.stringify({ strips: d0.strips, nodes: d0.stripNodes }));
    ok(d0.unreached.length === 0, 'every habitat and building should be reachable on foot: unreached ' + JSON.stringify(d0.unreached));
    { // on screen: the middle of each front-facing strip is walkway-coloured ground
      await page.evaluate(() => ZRender.setRunning(false)); const spots = (await page.evaluate(() => ZRender.stripSpots())).filter(s => s.front); let bad = [], seen = 0;
      for (const s of spots) { await page.evaluate(([q, r]) => ZRender.centerOn(q, r, true), [s.q, s.r]); await sleep(40); const k = await kindAt(s.x, s.y); seen++; if (k !== 'path') bad.push(s.q + ',' + s.r + '/' + s.ei + '=' + k); }
      // a strip under a standing visitor or an animal's head can read as 'other'; grass never may, and only a few may be hidden
      ok(seen >= 15 && !bad.some(b => /grass/.test(b)) && bad.length <= Math.ceil(seen * 0.15), 'border strips not drawn as walkway: ' + bad.join(' ')); notes.push('walkway: ' + seen + ' front strip middles looked at on screen, ' + (seen - bad.length) + ' read as walkway' + (bad.length ? ' (covered: ' + bad.join(' ') + ')' : ''));
      await page.evaluate(() => ZRender.setRunning(true));
    }
    { // people walk the strips; nobody is ever inside a fence or on a building; animals stay inside their fence
      let mx = 0, off = 0, inF = 0, aOut = 0; for (let i = 0; i < 30; i++) { const d = await dbg(); mx = Math.max(mx, d.onStrip); off = Math.max(off, d.offPath); inF = Math.max(inF, d.inFence); aOut = Math.max(aOut, d.animalsOut); await sleep(120); }
      ok(mx >= 3, 'people should be walking on the border strips, most seen at once: ' + mx); ok(off === 0 && inF === 0, off + ' people off the walkable ground, ' + inF + ' inside a fence'); ok(aOut === 0, aOut + ' animals heading outside their fence');
      notes.push('walkway: up to ' + mx + ' people on border strips at once; inside a fence: ' + inF + '; off the walkable ground: ' + off + '; animals outside their fence: ' + aOut);
    }
    { const H = await page.evaluate(() => ({ a: RT.H.savanna, b: RT.H.jungle })); await page.evaluate(([a, b]) => { ZRender.setZoom(0); ZRender.centerOn(Math.round((a.q + b.q) / 2), Math.round((a.r + b.r) / 2), true); }, [H.a, H.b]); await sleep(500); await shot('walkways'); await page.evaluate(() => ZRender.setZoom(1)); await sleep(200); }

    // ---------- 2. placement: habitats may touch; the ghost shows its strip; refusals explained (ZE.placeCheck)
    const sp = await page.evaluate(() => {
      const S = RT.S, out = { beside: null, okHab: null, taken: null, land: null, facBeside: null }, cells = [], occ = ZE.occupancy(S);
      for (let r = 0; r < ZD.GRID_H; r++) for (let c = 0; c < ZD.GRID_W; c++) { const a = ZE.fromOffset(c, r); cells.push([a[0], r]); }
      const touchesHab = cs => cs.some(c => ZE.DIRS.some(d => { const o = occ[(c[0] + d[0]) + ',' + (c[1] + d[1])]; return o && ZE.item(S, o).k === 'hab'; }));
      cells.forEach(c => { for (let rot = 0; rot < 6; rot++) { const k = ZE.placeCheck(S, 'hab', 'savanna', c[0], c[1], rot); const o = { q: c[0], r: c[1], rot: rot, msg: k.msg, cells: k.cells };
        if (k.ok) { const cs = ZE.cellsOf('hab', 'savanna', c[0], c[1], rot); if (!out.beside && touchesHab(cs)) out.beside = o; if (!out.okHab && !cs.some(x => ZE.DIRS.some(d => occ[(x[0] + d[0]) + ',' + (x[1] + d[1])]))) out.okHab = o; }
        else if (k.why === 'land' && !out.land && ZE.inLand(S, c[0], c[1])) out.land = o; } });
      cells.forEach(c => { const k = ZE.placeCheck(S, 'fac', 'bench', c[0], c[1], 0); if (!k.ok && k.why === 'taken' && !out.taken) out.taken = { q: c[0], r: c[1], msg: k.msg }; if (k.ok && !out.facBeside && touchesHab([c])) out.facBeside = { q: c[0], r: c[1] }; });
      out.why = {}; cells.forEach(c => { for (let rot = 0; rot < 6; rot++) { const k = ZE.placeCheck(S, 'hab', 'savanna', c[0], c[1], rot); if (!k.ok) out.why[k.why] = 1; } });
      return out;
    });
    ok(sp.beside && sp.okHab && sp.taken && sp.land && sp.facBeside, 'could not find every kind of spot in the demo zoo: ' + JSON.stringify(Object.keys(sp).filter(k => !sp[k])));
    ok(Object.keys(sp.why).every(k => ['land', 'entrance', 'taken'].indexOf(k) >= 0), 'only land, entrance and taken may refuse a habitat now: ' + JSON.stringify(sp.why));
    const sameCells = (a, b) => a.map(c => c[0] + ',' + c[1]).sort().join(';') === b.map(c => c[0] + ',' + c[1]).sort().join(';');
    const RED = [255, 74, 58];
    await page.evaluate(() => RT.place({ kind: 'hab', t: 'savanna', label: 'Savanna' })); await sleep(200);
    ok((await btn('zr-rotate').count()) === 1, 'a savanna habitat should get a Rotate button');
    const turnTo = async rot => { for (let i = 0; i < 6 && (await dbg()).placement.rot !== rot; i++) await btn('zr-rotate').click(); };
    { const s = sp.land; await tapHex(s); await turnTo(s.rot); await sleep(120); const p = (await dbg()).placement, t = await note();
      ok(!p.ok && p.state === 'bad' && p.why === 'land', 'habitat off the land should be refused for that reason: ' + JSON.stringify({ ok: p.ok, why: p.why }));
      ok(t.indexOf(s.msg) >= 0 && s.msg.length > 8, 'the note should give the engine\'s reason "' + s.msg + '", it says "' + t + '"');
      ok(sameCells(p.bad, s.cells), 'the marked hexes should be the ones the engine names: ' + JSON.stringify(p.bad) + ' vs ' + JSON.stringify(s.cells));
      await page.evaluate(([q, r]) => ZRender.centerOn(q, r - 2, true), [s.q, s.r]); await sleep(120);
      let red = 0; for (let i = 0; i < 6; i++) { red = Math.max(red, (await page.evaluate(c => TT.count(c[0], c[1], c[2]).all, RED))); await sleep(110); }
      ok(red > 150, 'no solid red marking on screen for a refused spot: ' + red + ' red pixels'); notes.push('refused habitat (land): note "' + t + '", ' + p.bad.length + ' hexes marked, ' + red + ' red pixels');
      await page.locator('#placement-bar button.zr-place').click({ force: true }); ok((await page.evaluate(() => RT.placed.length)) === 0, 'Place on a refused spot must not call onPlace');
    }
    // a habitat right against another one fits; the ghost shows its own border strip; once built the two strips meet
    { const s = sp.beside; await tapHex(s); await turnTo(s.rot); await page.evaluate(([q, r]) => ZRender.centerOn(q, r - 1, true), [s.q, s.r]); await sleep(200);
      const p = (await dbg()).placement; ok(p.ok && /fits here|completes|breaks/i.test(p.msg) && p.ring.length === 0, 'a habitat touching another should fit, with no ring: ' + JSON.stringify(p));
      await shot('place-touch'); await btn('zr-cancel').click(); }
    { const s = sp.okHab;
      await page.evaluate(() => RT.place({ kind: 'hab', t: 'savanna', label: 'Savanna', real: true })); await tapHex(s, false); await turnTo(s.rot); await page.evaluate(([q, r]) => ZRender.centerOn(q, r - 1, true), [s.q, s.r]); await page.evaluate(() => ZRender.setRunning(false)); await sleep(250);
      const p = (await dbg()).placement; ok(p.ok, 'the lone habitat spot should fit: ' + JSON.stringify(p));
      // the ghost's front strip middles, worked out here from the hex geometry: walkway-coloured
      const gs = await page.evaluate(([q, r, rot]) => { const T = 0.27 / 2, cs = ZE.cellsOf('hab', 'savanna', q, r, rot), set = {}, out = []; cs.forEach(c => { set[c[0] + ',' + c[1]] = 1; });
        cs.forEach(c => { const p = ZGeo.toScreen(c[0], c[1]); ZGeo.EDGES.forEach((e, ei) => { if (set[(c[0] + e[0][0]) + ',' + (c[1] + e[0][1])] || ZGeo.edgeMidY(ei) <= 0) return; const A = ZGeo.CORNERS[e[1]], B = ZGeo.CORNERS[e[2]]; out.push([p.x + (A[0] + B[0]) / 2 * (1 - T), p.y + (A[1] + B[1]) / 2 * (1 - T)]); }); }); return out; }, [s.q, s.r, s.rot]);
      const gk = []; for (const g of gs) gk.push(await kindAt(g[0], g[1]));
      ok(gk.filter(k => k === 'path').length >= gs.length - 1, 'the ghost should show its border strip as walkway: ' + gk.join(','));
      notes.push('ghost: ' + gs.length + ' front strip middles -> ' + gk.join(','));
      await shot('place-strip');
      const st0 = (await dbg()).strips; await btn('zr-place').click(); await sleep(500); const d1 = await dbg();
      ok(!(await page.evaluate(() => ZRender.placing())) && d1.strips > st0, 'after building, the new habitat should have its border strip: ' + JSON.stringify({ before: st0, after: d1.strips }));
      const bk = []; for (const g of gs) bk.push(await kindAt(g[0], g[1])); ok(bk.filter(k => k === 'path').length >= gs.length - 1, 'the built habitat\'s strip is not drawn as walkway: ' + bk.join(','));
      await page.evaluate(() => { ZRender.setRunning(true); RT.placed.length = 0; });
    }
    // a bench right against a habitat fits now; a taken hex is refused
    await page.evaluate(() => RT.place({ kind: 'fac', t: 'bench', label: 'Garden Bench' }));
    { const s = sp.facBeside; await tapHex(s); const p = (await dbg()).placement; ok(p.ok, 'a bench right against a habitat should fit: ' + JSON.stringify({ ok: p.ok, why: p.why, msg: p.msg })); }
    { const s = sp.taken; await tapHex(s); const p = (await dbg()).placement, t = await note(); ok(!p.ok && p.why === 'taken' && t.indexOf(s.msg) >= 0, 'a bench on a taken hex: ' + JSON.stringify({ ok: p.ok, why: p.why, note: t })); ok(p.bad.length >= 1, 'no hexes marked for taken'); notes.push('refused bench (taken): note "' + t + '"'); }
    await btn('zr-cancel').click();

    // ---------- 3. speed 2: the board moves twice as fast (animals, people, pop-ups), the clock of the screen itself does not
    const sample = () => page.evaluate(() => { const d = ZRender.debug(); return { t: performance.now() / 1000, w: d.worldTime, c: d.clock, walked: d.walked, secs: d.walkSecs, roamed: d.roamed, step: d.maxStep, off: d.offPath, speed: d.speed, n: d.visitors + d.staff }; });
    const popTime = async () => { await page.evaluate(() => { RT.S.fx.push({ type: 'money', amt: 250 }); }); const t0 = Date.now(); let seen = false; for (let i = 0; i < 120; i++) { const f = (await dbg()).floaters; if (f > 0) seen = true; else if (seen) break; await sleep(25); } return seen ? (Date.now() - t0) / 1000 : -1; };
    const span = async secs => { const a = await sample(); let off = 0; for (let i = 0; i < secs * 5; i++) { await sleep(200); off = Math.max(off, (await dbg()).offPath); } const b = await sample(); return { real: b.t - a.t, world: b.w - a.w, clock: b.c - a.c, walked: b.walked - a.walked, pace: (b.walked - a.walked) / Math.max(0.001, b.secs - a.secs), roamed: b.roamed - a.roamed, off: off, step: b.step, n: b.n }; };
    await page.evaluate(() => { const e = ZRender.entrance(); ZRender.centerOn(e.q, e.r - 5, true); });
    const s1 = await span(12), pop1 = await popTime();
    await page.evaluate(() => { window.SPD = 2; }); await sleep(150);
    const shA = await page.screenshot(); await sleep(300); const shB = await page.screenshot();
    const s2 = await span(12), pop2 = await popTime(), dS = await dbg();
    await shot('speed2');
    ok(dS.speed === 2, 'the renderer did not pick up getSpeed() = 2: ' + dS.speed);
    ok(Math.abs(s1.world / s1.clock - 1) < 0.02 && Math.abs(s2.world / s2.clock - 2) < 0.04, 'game time on the floor should run at 1x then 2x of screen time: ' + (s1.world / s1.clock).toFixed(3) + ' then ' + (s2.world / s2.clock).toFixed(3));
    ok(Math.abs(s1.clock / s1.real - 1) < 0.12 && Math.abs(s2.clock / s2.real - 1) < 0.12, 'the screen clock (camera, placement, blinks) must stay on real time at both speeds: ' + (s1.clock / s1.real).toFixed(2) + ' and ' + (s2.clock / s2.real).toFixed(2));
    const pr = s2.pace / s1.pace, wr = s2.walked / s1.walked;
    ok(pr > 1.8 && pr < 2.2, 'people should walk twice as fast at speed 2: ' + s1.pace.toFixed(1) + ' then ' + s2.pace.toFixed(1) + ' buffer px per second while walking (x' + pr.toFixed(2) + ')');
    ok(wr > 1.4 && wr < 2.6, 'people should cover about twice the ground in the same real time at speed 2: ' + Math.round(s1.walked) + ' then ' + Math.round(s2.walked) + ' px in 12 s (x' + wr.toFixed(2) + ')');
    ok(s1.roamed > 0 && s2.roamed / s1.roamed > 1.2 && s2.roamed / s1.roamed < 3.4, 'animals should cover about twice the ground at speed 2: ' + Math.round(s1.roamed) + ' then ' + Math.round(s2.roamed) + ' px in 12 s');
    ok(pop1 > 1.45 && pop1 < 2.2 && pop2 > 0.7 && pop2 < 1.2, 'a pop-up should last about 1.7 s at speed 1 and half that at speed 2: ' + pop1.toFixed(2) + ' s and ' + pop2.toFixed(2) + ' s');
    ok(s2.step <= 24 * K * 0.034 * 1.02, 'movement must stay smooth: the biggest single step anyone took was ' + s2.step.toFixed(2) + ' buffer px (limit ' + (24 * K * 0.034).toFixed(2) + ' = the fastest walker, a caller hurrying to the gate at 24 art px a second, in one 1/30 s slice)');
    ok(s1.off === 0 && s2.off === 0, 'somebody was on a built hex (through a fence): ' + s1.off + ' at speed 1, ' + s2.off + ' at speed 2');
    ok(!shA.equals(shB), 'the floor does not animate at speed 2');
    notes.push('speed: game time x' + (s1.world / s1.clock).toFixed(2) + ' then x' + (s2.world / s2.clock).toFixed(2) + '; walking pace ' + s1.pace.toFixed(1) + ' -> ' + s2.pace.toFixed(1) + ' px/s (x' + pr.toFixed(2) + '); ground covered by ' + s1.n + ' people in 12 s ' + Math.round(s1.walked) + ' -> ' + Math.round(s2.walked) + ' px (x' + wr.toFixed(2) + '); animals ' + Math.round(s1.roamed) + ' -> ' + Math.round(s2.roamed) + ' px; pop-up ' + pop1.toFixed(2) + ' s -> ' + pop2.toFixed(2) + ' s; biggest step ' + s2.step.toFixed(2) + ' px; on built hexes ' + s1.off + '/' + s2.off);
    { await page.evaluate(() => ZRender.checkAnimals()); await sleep(250); const chk = (await dbg()).animalCheck; ok(chk && chk.animals > 0 && chk.bad === 0 && chk.minAlpha === 1, 'animals not solid at speed 2: ' + JSON.stringify(chk)); }
    await page.evaluate(() => { window.SPD = 1; });

    // ---------- 4. Edit mode
    const CYAN = [53, 230, 255];
    const cyan = (id, n) => page.evaluate(async ([c, id, n]) => { let mx = 0, mn = 1e9, inBox = 0; for (let i = 0; i < n; i++) { const k = TT.count(c[0], c[1], c[2], id != null ? TT.box(id, 14) : null); mx = Math.max(mx, k.all); mn = Math.min(mn, k.all); inBox = Math.max(inBox, k.inBox); await new Promise(r => setTimeout(r, 110)); } return { max: mx, min: mn, inBox: inBox }; }, [CYAN, id, n]);
    const ed = await page.evaluate(() => {
      const S = RT.S, e = ZE.entrance(S), occ = ZE.occupancy(S), ring = ZE.c(S).ring; let front = null, fy = -1e9, lone = null;
      S.items.filter(i => i.k === 'hab').forEach(h => { const y = Math.max.apply(null, ZE.cells(h).map(c => ZGeo.toScreen(c[0], c[1]).y)); if (y > fy) { fy = y; front = h; } });
      const bench = S.items.find(i => i.k === 'fac' && i.t === 'bench');
      let target = null; for (let r = 0; r < ZD.GRID_H && !target; r++) for (let c = 0; c < ZD.GRID_W && !target; c++) { const a = ZE.fromOffset(c, r), q = a[0]; if (!ZE.inLand(S, q, r) || occ[q + ',' + r] || ring[q + ',' + r] || (q === e.q && r === e.r)) continue; if (!lone && ZE.DIRS.every(d => !occ[(q + d[0]) + ',' + (r + d[1])])) lone = { q: q, r: r }; if (ZE.placeCheck(S, 'fac', 'bench', q, r, 0, bench.id).ok && Math.abs(q - bench.q) + Math.abs(r - bench.r) > 3 && r > ZD.GRID_H - 9) target = { q: q, r: r }; }
      return { gate: e, front: { id: front.id, q: front.q, r: front.r, cells: ZE.cells(front) }, bench: { id: bench.id, q: bench.q, r: bench.r }, lone: lone, target: target };
    });
    ok(ed.lone && ed.target, 'could not find an empty hex and a legal move target in the demo zoo');
    ok(!(await page.evaluate(() => ZRender.editing())) && (await cyan(null, 1)).max === 0, 'before Edit mode: editing() should be false and nothing outlined');
    const taps0 = await page.evaluate(() => RT.taps.length);
    ok(await page.evaluate(() => ZRender.startEdit({ onPick: it => RT.picks.push(it ? it.id : null), onExit: () => { RT.exits++; } })) === true && await page.evaluate(() => ZRender.editing()), 'startEdit did not turn Edit mode on');
    await sleep(400); ok((await dbg()).barCover === 0, 'with no #edit-bar on the page nothing should be allowed for: ' + (await dbg()).barCover);
    const lastPick = () => page.evaluate(() => ({ n: RT.picks.length, last: RT.picks[RT.picks.length - 1] }));
    await tapHex({ q: ed.front.cells[1][0], r: ed.front.cells[1][1] }); { const p = await lastPick(); ok(p.n === 1 && p.last === ed.front.id, 'a tap on a habitat hex (not its anchor) should pick the habitat: ' + JSON.stringify(p)); }
    await tapHex(ed.bench); { const p = await lastPick(); ok(p.n === 2 && p.last === ed.bench.id, 'a tap on a facility should pick it: ' + JSON.stringify(p)); }
    await tapHex(ed.lone); { const p = await lastPick(); ok(p.n === 3 && p.last === null, 'a tap on empty ground should pick null: ' + JSON.stringify(p)); }
    await tapHex(ed.gate); { const p = await lastPick(); ok(p.n === 4 && p.last === null, 'a tap on the gate should pick null: ' + JSON.stringify(p)); }
    ok((await page.evaluate(() => RT.taps.length)) === taps0, 'the normal onTap fired while editing');
    { const c0 = (await dbg()).cam; await page.mouse.move(200, 400); await page.mouse.down(); await page.mouse.move(140, 360, { steps: 5 }); await page.mouse.up(); await sleep(500); const c1 = (await dbg()).cam; ok(Math.hypot(c1.x - c0.x, c1.y - c0.y) > 30 && (await lastPick()).n === 4, 'a drag while editing should scroll the map and pick nothing'); }
    // the Menus strip (made here as a stand-in): 150 px docked at the bottom of the floor, hidden while placing as the contract says
    await page.evaluate(() => { const b = document.createElement('div'); b.id = 'edit-bar'; b.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:150px;background:#f6e2ac;border-top:4px solid #3b2a1a;box-sizing:border-box;z-index:6'; document.getElementById('col').appendChild(b); RT.barTimer = setInterval(() => { b.style.display = ZRender.placing() ? 'none' : ''; }, 40); });
    await sleep(700); { const d = await dbg(), want = 150 / (await page.evaluate(() => document.getElementById('floor').getBoundingClientRect().height)) * d.buffer.h; ok(Math.abs(d.barCover - want) <= 2, 'the floor should allow for the 150 px #edit-bar: allows ' + d.barCover + ' buffer px, expected ' + Math.round(want)); }
    // select: a solid blinking outline round every hex, and the thing is brought clear of the strip
    await page.evaluate(() => { const e = ZRender.entrance(); ZRender.centerOn(e.q, e.r - 12, true); }); await sleep(150);
    ok(await page.evaluate(id => ZRender.select(id), ed.front.id) === true, 'select(itemId) should return true'); await sleep(1100);
    { const d = await dbg(), v = await page.evaluate(id => { const S = RT.S, it = S.items.find(i => i.id === id), fl = document.getElementById('floor').getBoundingClientRect(), bar = document.getElementById('edit-bar').getBoundingClientRect(), sc = ZRender.debug().buffer.scale; const pts = ZE.cells(it).map(c => ZRender.hexToClient(c[0], c[1])); return { top: Math.min.apply(null, pts.map(p => p.y)) - ZGeo.HH * sc - fl.top, bottom: Math.max.apply(null, pts.map(p => p.y)) + ZGeo.HH * sc, left: Math.min.apply(null, pts.map(p => p.x)) - ZGeo.HW * sc - fl.left, right: fl.right - Math.max.apply(null, pts.map(p => p.x)) - ZGeo.HW * sc, barTop: bar.top }; }, ed.front.id);
      ok(d.selected === ed.front.id, 'debug().selected should be the selected id');
      ok(v.top >= 30 && v.left >= 0 && v.right >= 0 && v.bottom <= v.barTop - 6, 'the selected habitat (the one nearest the front) must be wholly in view above the strip: ' + JSON.stringify(v));
      const c = await cyan(ed.front.id, 9);
      ok(c.max > 600 && c.min === 0, 'the selection outline should blink between solid cyan and solid white (cyan pixels seen: most ' + c.max + ', least ' + c.min + ')');
      ok(c.inBox === c.max, 'the outline should sit round the selected thing only: ' + c.inBox + ' of ' + c.max + ' cyan pixels are at the item');
      notes.push('select: habitat ' + ed.front.id + ' outlined (' + c.max + ' cyan pixels in the cyan phase, 0 in the white phase), ' + Math.round(v.barTop - v.bottom) + ' px clear of the strip, strip allowance ' + d.barCover + ' buffer px');
      for (let i = 0; i < 12; i++) { if ((await page.evaluate(c => TT.count(c[0], c[1], c[2]).all, CYAN)) > 600) break; await sleep(60); } await shot('edit-select');
    }
    { // every hex of the selection carries the outline: outline pixels near each outer corner of the footprint
      const miss = await page.evaluate(async ([id, c]) => { const S = RT.S, it = S.items.find(i => i.id === id), cv = document.getElementById('floor'), b = cv.getBoundingClientRect(), sx = cv.width / b.width, sc = ZRender.debug().buffer.scale; let im = null; for (let i = 0; i < 12; i++) { if (TT.count(c[0], c[1], c[2]).all > 600) { im = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height); break; } await new Promise(r => setTimeout(r, 60)); } if (!im) return -1;
        const set = {}; ZE.cells(it).forEach(k => { set[k[0] + ',' + k[1]] = 1; }); let miss = 0;
        ZE.cells(it).forEach(k => ZGeo.EDGES.forEach(e => { if (set[(k[0] + e[0][0]) + ',' + (k[1] + e[0][1])]) return; const p = ZRender.hexToClient(k[0], k[1]), a = ZGeo.CORNERS[e[1]], d = ZGeo.CORNERS[e[2]], mx = (p.x + (a[0] + d[0]) / 2 * sc - b.left) * sx, my = (p.y + (a[1] + d[1]) / 2 * sc - b.top) * sx; let hit = false; for (let y = -9; y <= 9 && !hit; y++) for (let x = -9; x <= 9 && !hit; x++) { const i = ((Math.round(my) + y) * cv.width + Math.round(mx) + x) * 4; if (im.data[i] === c[0] && im.data[i + 1] === c[1] && im.data[i + 2] === c[2]) hit = true; } if (!hit) miss++; })); return miss; }, [ed.front.id, CYAN]);
      ok(miss === 0, 'the outline is missing on ' + miss + ' outer edges of the selected habitat (-1 = never saw the cyan phase)');
    }
    ok(await page.evaluate(() => ZRender.select(987654)) === false && (await dbg()).selected === null, 'select() of an unknown id should return false and clear the selection');
    ok(await page.evaluate(() => ZRender.select(null)) === true && (await cyan(null, 4)).max === 0, 'select(null) should clear the outline');
    // the front of the map can be brought above the strip
    { await page.evaluate(([q, r]) => ZRender.centerOn(q, r, true), [ed.gate.q, ed.gate.r]); await page.mouse.move(200, 500); await page.mouse.down(); await page.mouse.move(200, 100, { steps: 6 }); await page.mouse.up(); await sleep(900); const g = await at(ed.gate.q, ed.gate.r), bt = await page.evaluate(() => document.getElementById('edit-bar').getBoundingClientRect().top); ok(g.y < bt - 20, 'scrolled all the way down, the gate row should clear the strip: gate at y ' + Math.round(g.y) + ', strip from ' + Math.round(bt)); notes.push('camera limit while editing: gate hex ' + Math.round(bt - g.y) + ' px above the strip at the bottom limit'); }
    // move from inside Edit mode
    await page.evaluate(id => ZRender.select(id), ed.bench.id); await sleep(700);
    ok((await cyan(ed.bench.id, 6)).inBox > 100, 'the selected facility should be outlined');
    const picksBefore = (await lastPick()).n;
    ok(await page.evaluate(id => ZRender.startPlacement({ moveId: id, label: 'Garden Bench' }, { onPlace: (q, r, rot) => { const res = ZE.move(RT.S, id, q, r, rot); RT.moves.push(res.ok); return res; }, onCancel: () => { RT.cancelled++; } }), ed.bench.id), 'startPlacement({moveId}) should start from inside Edit mode');
    await sleep(700); ok(await page.evaluate(() => getComputedStyle(document.getElementById('edit-bar')).display) === 'none', 'test stand-in: the strip should be hidden while placing');
    { const d = await dbg(), ph = await page.evaluate(() => { const b = document.getElementById('placement-bar').getBoundingClientRect(), f = document.getElementById('floor').getBoundingClientRect(); return f.bottom - b.top; }); ok(d.placement && d.editing && await page.evaluate(() => ZRender.placing()), 'while moving: placing() and editing() should both be true'); ok(Math.abs(d.barCover - ph) <= 2 && ph > 40, 'while placing, the allowance should be the placement bar (' + Math.round(ph) + ' px): ' + d.barCover); ok((await cyan(null, 5)).max === 0, 'the selection outline should hide while its item is being moved (only the ghost shows)'); }
    await tapHex(ed.target); { const p = (await dbg()).placement; ok(p.q === ed.target.q && p.r === ed.target.r && p.ok && (await lastPick()).n === picksBefore, 'a tap while moving should move the ghost and pick nothing: ' + JSON.stringify(p)); }
    await shot('edit-move');
    await btn('zr-place').click(); await sleep(800);
    { const r = await page.evaluate(id => { const it = RT.S.items.find(i => i.id === id); return { q: it.q, r: it.r, moves: RT.moves.slice(), placing: ZRender.placing(), editing: ZRender.editing(), sel: ZRender.debug().selected }; }, ed.bench.id);
      ok(r.moves.length === 1 && r.moves[0] === true && r.q === ed.target.q && r.r === ed.target.r, 'Place should move the bench through the engine: ' + JSON.stringify(r));
      ok(!r.placing && r.editing && r.sel === ed.bench.id, 'after the move Edit mode should still be on with the bench still selected: ' + JSON.stringify(r));
      await page.evaluate(([q, r]) => ZRender.centerOn(q, r, true), [ed.target.q, ed.target.r]); await sleep(120); const c = await cyan(ed.bench.id, 6); ok(c.inBox > 100 && c.inBox === c.max, 'the outline should have followed the bench to its new hex: ' + JSON.stringify(c));
      await tapHex(ed.target); const p = await lastPick(); ok(p.n === picksBefore + 1 && p.last === ed.bench.id, 'after the move a tap on the bench at its new hex should pick it: ' + JSON.stringify(p)); await tapHex(ed.bench); ok((await lastPick()).last === null, 'the bench\'s old hex should now be empty ground');
      notes.push('move in Edit mode: bench ' + ed.bench.id + ' moved ' + ed.bench.q + ',' + ed.bench.r + ' -> ' + r.q + ',' + r.r + '; still editing, still selected, outline followed'); }
    // add from inside Edit mode (repeat), then Cancel
    { const n0 = await page.evaluate(() => RT.S.items.length), done0 = await page.evaluate(() => RT.done), canc0 = await page.evaluate(() => RT.cancelled);
      await page.evaluate(() => RT.place({ kind: 'fac', t: 'bench', repeat: true, real: true })); await sleep(300); const p0 = (await dbg()).placement; ok(p0 && p0.ok, 'adding from Edit mode: the ghost should start on a legal hex: ' + JSON.stringify(p0));
      await btn('zr-place').click(); await sleep(200); ok(await page.evaluate(() => ZRender.placing()) && await btn('zr-cancel').textContent() === 'Done', 'repeat adding should stay open with a Done button');
      await btn('zr-cancel').click(); await sleep(150);
      ok((await page.evaluate(() => RT.S.items.length)) === n0 + 1 && (await page.evaluate(() => RT.done)) === done0 + 1 && !(await page.evaluate(() => ZRender.placing())) && await page.evaluate(() => ZRender.editing()), 'after adding and Done: one more item, onDone called, Edit mode still on');
      await page.evaluate(() => RT.place({ kind: 'hab', t: 'jungle' })); await sleep(200); await btn('zr-cancel').click(); await sleep(100);
      ok((await page.evaluate(() => RT.cancelled)) === canc0 + 1 && await page.evaluate(() => ZRender.editing()) && !(await page.evaluate(() => ZRender.placing())), 'Cancel from a placement started in Edit mode should return to Edit mode');
      ok((await page.evaluate(() => RT.taps.length)) === taps0, 'the normal onTap fired during Edit mode placements'); }
    // sold while selected: the outline goes with it
    { const id = await page.evaluate(() => { const S = RT.S, it = S.items[S.items.length - 1]; ZRender.select(it.id); return it.id; }); await sleep(300); await page.evaluate(id => { const S = RT.S; S.items = S.items.filter(i => i.id !== id); ZE.refresh(S); ZRender.mapChanged(); }, id); await sleep(500); ok((await dbg()).selected === null && (await cyan(null, 4)).max === 0, 'when the selected thing is sold the outline should go'); }
    // leaving
    await page.evaluate(id => ZRender.select(id), ed.front.id); await sleep(200);
    await page.evaluate(() => ZRender.stopEdit()); await sleep(900);
    { const d = await dbg(); ok(!d.editing && d.selected === null && d.barCover === 0 && (await page.evaluate(() => RT.exits)) === 0, 'stopEdit should leave Edit mode, clear the selection and the strip allowance, and not call onExit: ' + JSON.stringify({ e: d.editing, s: d.selected, b: d.barCover })); ok((await cyan(null, 4)).max === 0, 'outline still drawn after stopEdit');
      await tapHex(ed.lone); ok((await page.evaluate(() => RT.taps.length)) === taps0 + 1, 'after stopEdit a tap should go to the normal onTap again'); }
    // a new or loaded game ends Edit mode by itself and tells the caller
    await page.evaluate(() => { ZRender.startEdit({ onPick: () => {}, onExit: () => { RT.exits++; } }); RT.cur = ZE.newGame(null, { starter: true }); }); await sleep(500);
    ok(!(await page.evaluate(() => ZRender.editing())) && (await page.evaluate(() => RT.exits)) === 1, 'a new game while editing should end Edit mode and call onExit once'); await page.evaluate(() => { RT.cur = RT.S; clearInterval(RT.barTimer); document.getElementById('edit-bar').remove(); }); await sleep(500);

    // ---------- a building closed in by habitats on every side is still reached, along the habitats' border strips
    { const cl = await page.evaluate(() => {
        const S = ZE.newGame(); S.money = 1e9; ZD.BIOME_ORDER.forEach(b => { S.regions[b] = true; }); ZD.FAC_ORDER.forEach(f => { S.research['fac:' + f] = true; }); S.rows = ZD.GRID_H;
        const e = ZE.entrance(S), mid = ZE.fromOffset(Math.floor(ZD.GRID_W / 2) - 2, ZD.GRID_H - 6); const b = ZE.build(S, 'fac', 'gift', mid[0], mid[1], 0); if (!b.ok) return { err: 'gift: ' + b.msg };
        for (const d of ZE.DIRS) { const q = mid[0] + d[0], r = mid[1] + d[1]; if (ZE.occupancy(S)[q + ',' + r]) continue; let done = false;
          for (const t of ['savanna', 'jungle', 'desert']) { for (let rot = 0; rot < 6 && !done; rot++) for (const o of ZD.SHAPES[t]) { const p = ZE.rot(o[0], o[1], rot), aq = q - p[0], ar = r - p[1]; if (ZE.canPlace(S, 'hab', t, aq, ar, rot)) { done = ZE.build(S, 'hab', t, aq, ar, rot).ok; break; } } if (done) break; } }
        const closed = ZE.DIRS.every(d => ZE.occupancy(S)[(mid[0] + d[0]) + ',' + (mid[1] + d[1])]);
        S.visitorsLast = 1400; S.reports = []; S.fx = []; RT.cur = S; ZRender.reset(); ZRender.mapChanged(); ZRender.centerOn(mid[0], mid[1], true);
        return { closed: closed, gift: b.id, habs: S.items.filter(i => i.k === 'hab').length, q: mid[0], r: mid[1] };
      });
      ok(cl.closed, 'could not close a building in with habitats: ' + JSON.stringify(cl));
      await sleep(2500); let unr = null, mx = 0, inF = 0, off = 0, atGift = 0;
      for (let i = 0; i < 40; i++) { const d = await dbg(); unr = d.unreached; mx = Math.max(mx, d.onStrip); inF = Math.max(inF, d.inFence); off = Math.max(off, d.offPath);
        const ppl = await page.evaluate(([q, r]) => { const c = ZGeo.toScreen(q, r); return ZRender.stripPeople().filter(p => p.on === 'strip' && Math.hypot(p.x - c.x, p.y - c.y) < ZGeo.W * 0.75).length; }, [cl.q, cl.r]); atGift = Math.max(atGift, ppl); await sleep(150); }
      ok(unr && unr.length === 0, 'everything should be reachable, unreached: ' + JSON.stringify(unr));
      const rc = await page.evaluate(id => ZRender.reach(id), cl.gift);
      ok(rc && rc.ok && rc.strip && rc.viaStrip >= 2, 'the closed-in Gift Shop should be reached from the gate along the border strips: ' + JSON.stringify(rc));
      ok(mx >= 1, 'people should be on the border strips in the closed-in layout: ' + mx);
      ok(inF === 0 && off === 0, inF + ' people inside a fence, ' + off + ' off the walkable ground (closed-in layout)');
      notes.push('closed-in Gift Shop with ' + cl.habs + ' habitats round it: walk from the gate ' + JSON.stringify(rc) + '; up to ' + atGift + ' people on the strips beside it (visitors pick at random, not required), ' + mx + ' on strips in all; inside a fence ' + inF);
      await page.evaluate(() => ZRender.setRunning(false)); await sleep(100); await shot('closed-in'); await page.evaluate(() => { ZRender.setRunning(true); RT.cur = RT.S; ZRender.reset(); ZRender.mapChanged(); }); await sleep(800);
    }

    // ---------- nothing see-through through all of the above
    { const ar = await page.evaluate(() => ZRender.alphaReport()); notes.push('solid-pixels check: ' + JSON.stringify(ar)); ok(ar.draws > 5000 && ar.minAlpha === 1 && ar.blendOps === 0 && ar.ownPartialPixels === 0, 'something on the floor was drawn see-through: ' + JSON.stringify(ar)); }
    { await page.evaluate(() => { ZRender.startEdit({}); ZRender.select(RT.H.savanna.id); RT.place({ kind: 'hab', t: 'savanna' }); }); await sleep(300); const ar = await page.evaluate(() => ZRender.alphaReport()); ok(ar.ownPartialPixels === 0 && ar.ownPictures >= 4, 'the selection, ghost or refusal outlines contain half-clear pixels: ' + JSON.stringify(ar)); await page.evaluate(() => { ZRender.stopEdit(); }); ok(!(await page.evaluate(() => ZRender.placing())), 'stopEdit should also leave a placement that is open'); }
    const dEnd = await dbg(), pe = await page.evaluate(() => RT.errors);
    notes.push('end: frame cost ' + dEnd.frameMs + ' ms, ' + dEnd.fps + ' fps');
    ok(errors.length === 0 && pe.length === 0 && Object.keys(dEnd.spriteErrors).length === 0, 'errors: ' + JSON.stringify(errors.concat(pe).concat(Object.values(dEnd.spriteErrors))));
  } catch (e) { fails.push('crashed: ' + (e && e.stack || e)); }
  await browser.close();
  return { name: name + ' / floor harness (walkways, speed, Edit mode)', fails, notes };
}

// ------------------------------------------------------------------ small challenge maps in the real page, as the installed app on a phone
async function runChallenge(name) {
  const fails = [], notes = [], sfx = name === 'chromium' ? '' : '-' + name, ok = (c, m) => { if (!c) fails.push(m); return c; };
  for (const lv of ['tiny', 'small', 'broke']) {
    const { browser, page, errors } = await open(name, urlm.pathToFileURL(path.join(root, 'index.html')).href + '?challenge=' + lv + '&standalone=1&inset=34&insett=62', 'window.ZT && window.ZRender && document.documentElement.getAttribute("data-ready") === "1"');
    try {
      await sleep(500); for (let i = 0; i < 12 && (await page.evaluate(() => ZT.stack().length)) > 0; i++) { await page.evaluate(() => ZT.popAll()); await sleep(150); }
      await sleep(2200);
      const info = await page.evaluate(() => { const S = ZT.S, L = ZD.LEVELS.find(l => S.ch && l.id === S.ch.id); return { ch: S.ch ? S.ch.id : null, rows: S.rows, want: L ? L.rows : null, items: S.items.length, gridH: ZD.GRID_H, gridW: ZD.GRID_W }; });
      if (!ok(info.ch === lv && info.rows === info.want && info.rows >= 4 && info.rows <= 8, 'challenge "' + lv + '" did not start as expected: ' + JSON.stringify(info))) { await browser.close(); continue; }
      await page.screenshot({ path: path.join(shots, 'render-r7-challenge-' + lv + sfx + '.png') });
      const view = () => page.evaluate(() => {
        const S = ZT.S, fl = document.getElementById('floor').getBoundingClientRect(), sc = ZRender.debug().buffer.scale, e = ZRender.entrance(), g = ZRender.hexToClient(e.q, e.r), own = [];
        for (let r = 0; r < ZD.GRID_H; r++) for (let c = 0; c < ZD.GRID_W; c++) { const a = ZE.fromOffset(c, r); if (ZE.inLand(S, a[0], r)) { const p = ZRender.hexToClient(a[0], r); own.push({ x: p.x - fl.left, y: p.y - fl.top }); } }
        let o = 0, t = 0; for (let y = 10; y < fl.height; y += 20) for (let x = 10; x < fl.width; x += 20) { const h = ZRender.clientToHex(fl.left + x, fl.top + y); t++; if (ZE.inLand(S, h.q, h.r)) o++; }
        const on = own.filter(p => p.x > 0 && p.x < fl.width && p.y > 0 && p.y < fl.height).length;
        return { w: fl.width, h: fl.height, gate: [Math.round(g.x - fl.left), Math.round(g.y - fl.top)], ownedHexes: own.length, onScreen: on, top: Math.round(Math.min.apply(null, own.map(p => p.y)) - ZGeo.HH * sc), bottom: Math.round(Math.max.apply(null, own.map(p => p.y)) + ZGeo.HH * sc), left: Math.round(Math.min.apply(null, own.map(p => p.x)) - ZGeo.HW * sc), right: Math.round(Math.max.apply(null, own.map(p => p.x)) + ZGeo.HW * sc), share: Math.round(100 * o / t), cam: ZRender.debug().cam, bounds: ZRender.debug().bounds, buf: ZRender.debug().buffer };
      });
      const v0 = await view(), d0 = await page.evaluate(() => ZRender.debug());
      ok(v0.ownedHexes === info.rows * info.gridW, 'owned land should be ' + info.rows + ' rows of ' + info.gridW + ': ' + v0.ownedHexes + ' hexes');
      ok(d0.sprites > 10 && d0.realSprites, 'the floor is not drawing in the challenge: ' + d0.sprites + ' sprites');
      // start view: the gate in the lower part of the floor, on screen, clear of the edges; the whole depth of a small map in view at once
      ok(v0.gate[0] > 50 && v0.gate[0] < v0.w - 50 && v0.gate[1] > v0.h * 0.45 && v0.gate[1] < v0.h - 50, lv + ': the gate should start on screen in the lower part: ' + JSON.stringify(v0.gate) + ' of ' + v0.w + 'x' + Math.round(v0.h));
      const fitsDeep = (v0.bounds.y1 - v0.bounds.y0) <= v0.buf.h;
      if (fitsDeep) ok(v0.top >= 30 && v0.bottom <= v0.h - 20, lv + ': a map this shallow should show its whole depth at once, clear of the top strip chip and the bottom: land from y ' + v0.top + ' to ' + v0.bottom + ' of ' + Math.round(v0.h));
      ok(v0.share >= (info.rows <= 4 ? 22 : 30), lv + ': owned land covers only ' + v0.share + '% of the floor at the start');
      // camera limits: drag hard to each side; owned land never leaves the screen, the map's far edge stops inside the view with
      // a strip of forest beyond it, and every owned hex can be reached
      const drag = async (dx, dy) => { for (let i = 0; i < 4; i++) { await page.mouse.move(196 - Math.sign(dx) * 120, 430 - Math.sign(dy) * 150); await page.mouse.down(); await page.mouse.move(196 + Math.sign(dx) * 120, 430 + Math.sign(dy) * 150, { steps: 5 }); await page.mouse.up(); await sleep(60); } await sleep(700); return view(); };
      const L = await drag(1, 0), Rt = await drag(-1, 0), U = await drag(0, 1), Dn = await drag(0, -1);
      ok(L.left >= 10 && L.left <= 150 && L.onScreen >= 4, lv + ': dragged fully right, the left edge of the land should stop a little inside the screen: ' + L.left + ' px in, ' + L.onScreen + ' owned hexes on screen');
      ok(Rt.right <= Rt.w - 10 && Rt.right >= Rt.w - 150 && Rt.onScreen >= 4, lv + ': dragged fully left, the right edge of the land should stop a little inside the screen: ' + Math.round(Rt.w - Rt.right) + ' px in, ' + Rt.onScreen + ' on screen');
      ok(U.onScreen >= 4 && Dn.onScreen >= 4 && U.top <= U.h * 0.62 && Dn.bottom >= Dn.h * 0.38, lv + ': dragged fully up or down the land must stay in view: ' + JSON.stringify({ up: [U.top, U.bottom, U.onScreen], down: [Dn.top, Dn.bottom, Dn.onScreen] }));
      if (fitsDeep) ok(Math.abs(U.cam.y - Dn.cam.y) < 1, lv + ': a map that fits the height should not scroll up and down: ' + U.cam.y + ' / ' + Dn.cam.y);
      const reach = await page.evaluate(() => { const S = ZT.S, fl = document.getElementById('floor').getBoundingClientRect(); let bad = 0, n = 0; for (let r = 0; r < ZD.GRID_H; r++) for (let c = 0; c < ZD.GRID_W; c++) { const a = ZE.fromOffset(c, r); if (!ZE.inLand(S, a[0], r)) continue; n++; ZRender.centerOn(a[0], r, true); const p = ZRender.hexToClient(a[0], r), h = ZRender.clientToHex(p.x, p.y); if (!(p.x > fl.left + 24 && p.x < fl.right - 24 && p.y > fl.top + 40 && p.y < fl.bottom - 40) || h.q !== a[0] || h.r !== r) bad++; } return { bad: bad, n: n }; });
      ok(reach.bad === 0, lv + ': ' + reach.bad + ' of ' + reach.n + ' owned hexes cannot be brought comfortably on screen');
      // the land edge: unowned hexes behind the last owned row are forest (never grass or path), all the way across
      const edge = await page.evaluate(() => { const S = ZT.S, out = { n: 0, owned: 0 }; for (let c = 0; c < ZD.GRID_W; c++) { const a = ZE.fromOffset(c, ZD.GRID_H - S.rows - 1); out.n++; if (ZE.inLand(S, a[0], ZD.GRID_H - S.rows - 1)) out.owned++; } return out; });
      ok(edge.owned === 0, lv + ': the row behind the land should not be owned');
      await page.evaluate(() => { const S = ZT.S, a = ZE.fromOffset(Math.floor(ZD.GRID_W / 2), ZD.GRID_H - S.rows); ZRender.centerOn(a[0], a[1], true); }); await sleep(250);
      await page.screenshot({ path: path.join(shots, 'render-r7-challenge-' + lv + '-back' + sfx + '.png') });
      await page.evaluate(() => { const a = ZE.fromOffset(0, ZD.GRID_H - 1); ZRender.centerOn(a[0], a[1], true); }); await sleep(250);
      await page.screenshot({ path: path.join(shots, 'render-r7-challenge-' + lv + '-corner' + sfx + '.png') });
      // placing on the small map: the first habitat ghost starts legal and in clear view between the note and the buttons
      if (info.items === 0) {
        await page.evaluate(() => { ZRender.reset(); }); await sleep(600);
        await page.evaluate(() => { ZRender.startPlacement({ kind: 'hab', t: 'savanna', label: 'Savanna' }, { onPlace: (q, r, rot) => ZT.act('build', 'hab', 'savanna', q, r, rot), onCancel: () => {} }); }); await sleep(900);
        const g = await page.evaluate(() => { const p = ZRender.debug().placement, fl = document.getElementById('floor').getBoundingClientRect(), bar = document.getElementById('placement-bar').getBoundingClientRect(), nt = document.getElementById('placement-note').getBoundingClientRect(); const pts = ZE.cellsOf('hab', 'savanna', p.q, p.r, p.rot).concat(p.ring).map(c => { const k = ZRender.hexToClient(c[0], c[1]); return [Math.round(k.x), Math.round(k.y)]; }); return { p: p, pts: pts, left: fl.left, right: fl.right, barTop: bar.top, noteBottom: nt.bottom }; });
        ok(g.p.ok && g.p.ring.length === 0, lv + ': the first habitat ghost should start legal (no ring any more): ' + JSON.stringify({ ok: g.p.ok, msg: g.p.msg, ring: g.p.ring.length }));
        ok(g.pts.every(p => p[0] > g.left + 10 && p[0] < g.right - 10 && p[1] > g.noteBottom + 10 && p[1] < g.barTop - 20), lv + ': the ghost should be in clear view between the note and the buttons: ' + JSON.stringify(g.pts) + ' note ' + Math.round(g.noteBottom) + ' bar ' + Math.round(g.barTop));
        await page.screenshot({ path: path.join(shots, 'render-r7-challenge-' + lv + '-place' + sfx + '.png') });
        await page.locator('#placement-bar button.zr-place').click(); await sleep(500);
        for (let i = 0; i < 8 && (await page.evaluate(() => ZT.stack().length)) > 0; i++) { await page.evaluate(() => ZT.popAll()); await sleep(150); }
        await sleep(600); const d1 = await page.evaluate(() => ZRender.debug());
        ok((await page.evaluate(() => ZT.S.items.length)) === 1 && d1.strips >= 6 && d1.unreached.length === 0, lv + ': the built habitat should have its border walkway: ' + JSON.stringify({ strips: d1.strips, unreached: d1.unreached }));
        await page.evaluate(() => ZRender.reset()); await sleep(900); await page.screenshot({ path: path.join(shots, 'render-r7-challenge-' + lv + '-built' + sfx + '.png') });
      }
      // speed 2 through the real Shell
      { await page.evaluate(() => ZT.setSpeed(2)); let a, b, endRun = false;
        for (let tries = 0; tries < 4; tries++) { // a pop-up may pause the game part way through the window; measure again over a window that ran throughout (the ratio itself is judged just as strictly)
          await sleep(500); a = await page.evaluate(() => ({ r: ZT.running(), d: ZRender.debug() })); await sleep(1500); b = await page.evaluate(() => ZRender.debug()); endRun = await page.evaluate(() => ZT.running());
          if (!a.r || endRun) break; await page.evaluate(() => { ZT.skipReports = true; ZT.popAll(); }); }
        await page.evaluate(() => { ZT.skipReports = false; });
        if (a.r && !endRun) notes.push(lv + ': NOT TESTED: Shell speed 2 (a pop-up paused the game in every measuring window)');
        else if (a.r) ok(b.speed === 2 && Math.abs((b.worldTime - a.d.worldTime) / (b.clock - a.d.clock) - 2) < 0.05, lv + ': at the Shell\'s speed 2 the floor should run at twice the pace: speed ' + b.speed + ', ratio ' + ((b.worldTime - a.d.worldTime) / (b.clock - a.d.clock)).toFixed(2)); else notes.push(lv + ': NOT TESTED: Shell speed 2 (the game was not running: a screen was open)');
        await page.evaluate(() => ZT.setSpeed(1)); }
      notes.push(lv + ' (' + info.rows + ' rows): floor ' + v0.w + 'x' + Math.round(v0.h) + ', gate at ' + v0.gate + ', land spans y ' + v0.top + '..' + v0.bottom + (fitsDeep ? ' (whole depth in view, no up/down scroll)' : ' (scrolls up and down)') + ', owned ' + v0.share + '% of the view; side limits: land edge ' + L.left + ' px in from the left, ' + Math.round(Rt.w - Rt.right) + ' px in from the right; ' + reach.n + ' owned hexes all reachable');
      const se = await page.evaluate(() => ZT.errors.map(String));
      ok(errors.length === 0 && se.length === 0, lv + ': errors: ' + JSON.stringify(errors.concat(se)).slice(0, 500));
    } catch (e) { fails.push(lv + ' crashed: ' + (e && e.stack || e)); }
    await browser.close();
  }
  return { name: name + ' / challenge maps in index.html', fails, notes };
}

(async () => {
  let bad = 0;
  for (const n of which === 'both' ? ['chromium', 'webkit'] : [which]) {
    for (const fn of [runFloor, runChallenge]) {
      if (only && ((only === 'floor') !== (fn === runFloor))) continue;
      let res; try { res = await fn(n); } catch (e) { res = { name: n, fails: ['crashed: ' + (e && e.stack || e)], notes: [] }; }
      console.log('\n=== ' + res.name + ' ===\n' + res.notes.map(x => '  ' + x).join('\n'));
      console.log(res.fails.length ? '  FAILED (' + res.fails.length + '):\n' + res.fails.map(x => '   - ' + x).join('\n') : '  ALL CHECKS PASSED');
      bad += res.fails.length;
    }
  }
  process.exit(bad ? 1 : 0);
})();
