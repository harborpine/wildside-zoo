/* Renderer checks for Update 9: two-finger pinch zoom. Headless only.   node test/render-pinch.js [chromium|webkit|both]
   Phone size 393x852 at 3x on the floor harness. Chromium gets real touches (CDP Input.dispatchTouchEvent, which the browser
   turns into pointer events); WebKit gets synthetic touch pointer events (Playwright's WebKit cannot send real multi-touch).
   Checks: pinch out zooms in and pinch in zooms out, always to a whole-number scale within the steps; the floor under the
   fingers stays put; a pinch is never a tap (no onTap, no Edit-mode pick, the placement ghost does not move); one-finger drag
   still pans and a tap still taps; the camera stays inside the land; ctrl+wheel zooms; setZoom/getZoom still work.
   Screenshots: test/shots/render-r9-zoom-<scale>[-webkit].png. Exit code 1 if any check fails. */
const path = require('path'), fs = require('fs'), urlm = require('url');
const pw = require('./pw.js');
const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
const which = process.argv.slice(2).find(a => /^(chromium|webkit|both)$/.test(a)) || 'both';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PHONE = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true };

async function run(name) {
  const fails = [], notes = [], sfx = name === 'chromium' ? '' : '-' + name, ok = (c, m) => { if (!c) fails.push(m); return c; };
  const browser = await pw[name].launch({ headless: true }), ctx = await browser.newContext(PHONE), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(urlm.pathToFileURL(path.join(__dirname, 'render-floor.html')).href);
  await page.waitForFunction('window.RT && RT.ready', null, { timeout: 15000 });
  const cdp = name === 'chromium' ? await ctx.newCDPSession(page) : null;
  // ---- a two-finger gesture: fingers start `d0` apart around (cx, cy) and end `d1` apart, in `steps` moves (CSS px)
  async function touches(type, list) {
    if (cdp) return cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: list.map(p => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })) });
    const evt = { touchStart: 'pointerdown', touchMove: 'pointermove', touchEnd: 'pointerup' }[type];
    await page.evaluate(([evt, list]) => { const cv = document.getElementById('floor'); list.forEach(p => cv.dispatchEvent(new PointerEvent(evt, { pointerId: 100 + p.id, pointerType: 'touch', isPrimary: p.id === 0, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, buttons: evt === 'pointerup' ? 0 : 1 }))); }, [evt, list]);
  }
  async function pinch(cx, cy, d0, d1, steps, dx) {
    const at = (d, ox) => [{ id: 0, x: cx + ox - d / 2, y: cy }, { id: 1, x: cx + ox + d / 2, y: cy }];
    if (cdp) { await touches('touchStart', [at(d0, 0)[0]]); await touches('touchStart', at(d0, 0)); } // the second finger lands a moment later
    else { await touches('touchStart', [at(d0, 0)[0]]); await touches('touchStart', [at(d0, 0)[1]]); }
    const seen = [];
    for (let i = 1; i <= steps; i++) { const d = d0 + (d1 - d0) * i / steps; await touches('touchMove', at(d, (dx || 0) * i / steps)); await sleep(16); seen.push(await page.evaluate(() => ZRender.zoomInfo().scale)); }
    const end = at(d1, dx || 0);
    if (cdp) { await touches('touchEnd', [end[1]]); await touches('touchEnd', []); } // (CDP touchEnd lists the fingers still down... the first finger lifts last)
    else { await touches('touchEnd', [end[1]]); await touches('touchEnd', [end[0]]); }
    await sleep(120); return seen;
  }
  async function drag1(x0, y0, x1, y1) {
    await touches('touchStart', [{ id: 0, x: x0, y: y0 }]);
    for (let i = 1; i <= 8; i++) { await touches('touchMove', [{ id: 0, x: x0 + (x1 - x0) * i / 8, y: y0 + (y1 - y0) * i / 8 }]); await sleep(16); }
    await touches('touchEnd', cdp ? [] : [{ id: 0, x: x1, y: y1 }]); await sleep(150);
  }
  const info = () => page.evaluate(() => ZRender.zoomInfo());
  const dbg = () => page.evaluate(() => ZRender.debug());
  const taps = () => page.evaluate(() => RT.taps.length);
  const shot = n => page.screenshot({ path: path.join(shots, 'render-r9-zoom-' + n + sfx + '.png') });
  const inside = d => { const b = d.bounds, w = d.buffer.w, h = d.buffer.h, bw = b.x1 - b.x0, bh = b.y1 - b.y0, e = 2; // the camera keeps to the land (or centres a map smaller than the view)
    return (bw <= w ? Math.abs(d.cam.x - (b.x0 - (w - bw) / 2)) < e : d.cam.x >= b.x0 - e && d.cam.x <= b.x1 - w + e) && (bh <= h ? true : d.cam.y >= b.y0 - e && d.cam.y <= b.y1 - h + e); };
  try {
    await sleep(1500); await page.evaluate(() => ZRender.setRunning(false));
    const z0 = await info(); notes.push('steps ' + JSON.stringify(z0.steps) + ' (far ' + z0.far + ', close ' + z0.close + ', max ' + z0.max + '), start ' + z0.scale);
    ok(z0.scale === z0.close && z0.max > z0.close && z0.far < z0.close, 'expected to start at the close step with a far step below and a closer one above: ' + JSON.stringify(z0));
    const H = await page.evaluate(() => RT.H.savanna); await page.evaluate(([q, r]) => ZRender.centerOn(q, r, true), [H.q, H.r]); await sleep(100);
    await shot(z0.scale);
    const c = await page.evaluate(([q, r]) => ZRender.hexToClient(q, r), [H.q, H.r]);
    const hexAt = (x, y) => page.evaluate(([x, y]) => ZRender.clientToHex(x, y), [x, y]);

    // 1. pinch out: zoom in to the closest step, whole numbers only, floor under the fingers stays put, no tap
    let t0 = await taps(), seen = await pinch(c.x, c.y, 60, 260, 12), z = await info(), d = await dbg(), h = await hexAt(c.x, c.y);
    ok(z.scale === z0.max, 'pinch out should zoom in to the closest step ' + z0.max + ', got ' + z.scale + ' (seen ' + seen.join(',') + ')');
    ok(seen.every(n => Number.isInteger(n) && n >= z0.far && n <= z0.max), 'scales during the pinch should all be whole steps: ' + seen.join(','));
    ok(h.q === H.q && h.r === H.r, 'the hex under the pinch should stay under it: was ' + H.q + ',' + H.r + ' now ' + h.q + ',' + h.r);
    ok(await taps() === t0, 'a pinch must not count as a tap'); ok(inside(d), 'camera outside the land after zooming in: ' + JSON.stringify({ cam: d.cam, b: d.bounds, w: d.buffer }));
    ok(z.pinches >= 1 && !z.pinching, 'pinch should be seen and finished: ' + JSON.stringify(z));
    await shot(z.scale); notes.push('pinch out: ' + z0.scale + ' -> ' + z.scale + ' via ' + seen.join(','));
    // 2. pinch in all the way: the far step; camera stays inside the land
    seen = await pinch(c.x, c.y, 300, 40, 14); z = await info(); d = await dbg();
    ok(z.scale === z0.far, 'pinch in should zoom out to the far step ' + z0.far + ', got ' + z.scale + ' (seen ' + seen.join(',') + ')');
    ok(await taps() === t0, 'a pinch in must not count as a tap'); ok(inside(d), 'camera outside the land after zooming out: ' + JSON.stringify({ cam: d.cam, b: d.bounds, w: d.buffer }));
    await shot(z.scale); notes.push('pinch in: -> ' + z.scale + ' via ' + seen.join(','));
    // 3. a small pinch (spread x1.2) from the close step snaps back to it, it never stops between steps
    await page.evaluate(() => ZRender.setZoom(1)); seen = await pinch(c.x, c.y, 150, 180, 6); z = await info();
    ok(z.scale === z0.close, 'a small pinch should stay on the close step, got ' + z.scale);
    // 4. one finger still pans, and a still tap still taps (after a pinch)
    let cam0 = (await dbg()).cam; await drag1(200, 400, 120, 300); let cam1 = (await dbg()).cam;
    ok(Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y) > 10, 'one-finger drag should pan: ' + JSON.stringify([cam0, cam1])); ok(await taps() === t0, 'a drag must not tap');
    if (cdp) await page.touchscreen.tap(200, 400); else await page.evaluate(() => { const cv = document.getElementById('floor'); ['pointerdown', 'pointerup'].forEach(t => cv.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 200, clientY: 400, bubbles: true, cancelable: true }))); });
    await sleep(120); ok(await taps() === t0 + 1, 'a tap after pinching should still tap once, taps ' + ((await taps()) - t0));
    // 5. pinch while panning sideways: the floor follows the fingers' middle
    cam0 = (await dbg()).cam; await pinch(200, 400, 120, 130, 8, -60); cam1 = (await dbg()).cam;
    ok(cam1.x > cam0.x + 5, 'the floor should follow two fingers moving together: ' + JSON.stringify([cam0, cam1]));
    // 6. placement: a pinch never moves the ghost; a tap does
    await page.evaluate(() => RT.place({ kind: 'fac', t: 'bench' })); await sleep(300);
    let g0 = (await dbg()).placement; await pinch(150, 350, 80, 240, 10); let g1 = (await dbg()).placement;
    ok(g0 && g1 && g0.q === g1.q && g0.r === g1.r, 'a pinch moved the placement ghost: ' + JSON.stringify([g0 && [g0.q, g0.r], g1 && [g1.q, g1.r]]));
    await page.evaluate(() => ZRender.stopPlacement());
    // 7. Edit mode: a pinch never picks
    await page.evaluate(() => { RT.picks = []; ZRender.startEdit({ onPick: it => RT.picks.push(it ? it.id : null) }); }); await pinch(c.x, c.y, 240, 80, 10);
    ok(await page.evaluate(() => RT.picks.length) === 0, 'a pinch in Edit mode should not pick'); await page.evaluate(() => ZRender.stopEdit());
    // 8. ctrl + wheel (desktop, trackpad pinch) zooms in and out a step at a time around the pointer; a plain wheel only scrolls
    await page.evaluate(() => ZRender.setZoom(1)); const wheel = (dy, ctrl) => page.evaluate(([dy, ctrl]) => document.getElementById('floor').dispatchEvent(new WheelEvent('wheel', { deltaY: dy, ctrlKey: ctrl, clientX: 200, clientY: 400, bubbles: true, cancelable: true })), [dy, ctrl]);
    await wheel(-100, true); const w1 = (await info()).scale; await wheel(100, true); await wheel(100, true); const w2 = (await info()).scale; await wheel(100, false); const w3 = (await info()).scale;
    ok(w1 === z0.close + 1 && w2 === z0.close - 1 && w3 === w2, 'ctrl+wheel should step the zoom: ' + [w1, w2, w3].join(','));
    // 9. the old calls still work; the choice survives a new game (ZRender.reset) in this page
    await page.evaluate(() => ZRender.setZoom(0)); const a = await page.evaluate(() => [ZRender.getZoom(), ZRender.zoomInfo().scale]);
    await page.evaluate(() => ZRender.setZoom(1)); const b = await page.evaluate(() => [ZRender.getZoom(), ZRender.zoomInfo().scale]);
    await page.evaluate(() => ZRender.zoomBy(1)); await page.evaluate(() => ZRender.reset()); await sleep(200); const r = await info();
    ok(a[0] === 0 && a[1] === z0.far && b[0] === 1 && b[1] === z0.close, 'setZoom/getZoom: ' + JSON.stringify([a, b])); ok(r.scale === z0.close + 1, 'zoom should survive ZRender.reset: ' + r.scale);
  } catch (e) { fails.push('crashed: ' + (e && e.stack || e)); }
  errors.forEach(e => fails.push(e));
  await browser.close();
  console.log('[' + name + '] ' + notes.join(' | '));
  fails.forEach(f => console.log('  FAIL ' + f)); console.log('[' + name + '] ' + (fails.length ? fails.length + ' FAILED' : 'all pinch checks passed'));
  return fails.length;
}
(async () => { let bad = 0; for (const n of which === 'both' ? ['chromium', 'webkit'] : [which]) bad += await run(n); process.exit(bad ? 1 : 0); })();
