/* Renderer: style-D (density 2) floor shots and frame cost on a 393x852 phone at DPR 3. Headless only.
   Usage (Git Bash):  node test/render-d2.js [chromium|webkit|both]
   Writes test/shots/render-d2-floor.png (mid-game zoo), render-d2-blank.png (bare land), render-d2-place.png (placement),
   render-d2-compare.png (old density left, style D right, same camera spot) and render-d2-zoom.png (a 3x close-up of both).
   WebKit copies end in -webkit.png. Also measures frame cost at density 2 and density 1 and checks the scale numbers. */
const path = require('path'), fs = require('fs');
const pw = require('./pw.js');
const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
const which = (process.argv.slice(2).find(a => /^(chromium|webkit|both)$/.test(a))) || 'both';
const base = 'file:///' + path.join(__dirname, 'render-floor.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VW = 393, VH = 852, DPR = 3;

async function open(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + q); await page.waitForFunction('window.RT && RT.ready', null, { timeout: 20000 });
  return { ctx, page, errors };
}
// average frame cost over a few seconds (JS time per frame as the renderer measures it, plus rAF rate)
async function cost(page, secs) {
  return page.evaluate(async secs => {
    const out = []; const t0 = performance.now(); let n = 0;
    await new Promise(res => { const f = () => { n++; if (performance.now() - t0 < secs * 1000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    for (let i = 0; i < 6; i++) { out.push(ZRender.debug().frameMs); await new Promise(r => setTimeout(r, 260)); }
    out.sort((a, b) => a - b); return { median: out[3], max: out[5], fps: Math.round(n / secs) };
  }, secs);
}

async function run(name) {
  const fails = [], notes = [], sfx = name === 'chromium' ? '' : '-' + name, ok = (c, m) => { if (!c) fails.push(m); return c; };
  const browser = await pw[name].launch({ headless: true });
  try {
    // mid-game zoo at density 2
    const A = await open(browser, '?d=2'); await sleep(3500);
    const d2 = await A.page.evaluate(() => ZRender.debug());
    ok(d2.buffer.density === 2 && d2.buffer.deviceScale === 3 && Math.abs(d2.buffer.scale - 1) < 1e-9, 'density 2 at DPR 3 should draw 1 CSS px (3 device px) per buffer pixel: ' + JSON.stringify(d2.buffer));
    { const cw = await A.page.evaluate(() => document.getElementById('floor').getBoundingClientRect().width); ok(Math.abs(d2.buffer.w - cw) <= 1, 'buffer should be as many fine pixels wide as the floor is CSS px (' + cw + '), the same view as before: ' + d2.buffer.w); }
    ok(await A.page.evaluate(() => ZSprites.DENSITY === 2 && ZGeo.W === 104), 'sprites and geometry are not both at density 2');
    const c2 = await cost(A.page, 3); notes.push('density 2: buffer ' + d2.buffer.w + 'x' + d2.buffer.h + ', ' + d2.sprites + ' sprites, frame cost median ' + c2.median + ' ms (max ' + c2.max + '), ' + c2.fps + ' fps');
    ok(c2.median < 8, 'frame cost too high at density 2: ' + JSON.stringify(c2));
    await A.page.screenshot({ path: path.join(shots, 'render-d2-floor' + sfx + '.png') });
    // placement at density 2
    await A.page.evaluate(() => RT.place({ kind: 'hab', t: 'savanna', label: 'Savanna' })); await sleep(900);
    await A.page.screenshot({ path: path.join(shots, 'render-d2-place' + sfx + '.png') });
    const pl = await A.page.evaluate(() => ZRender.debug().placement); ok(pl && pl.ok, 'placement ghost should start valid: ' + JSON.stringify(pl));
    await A.page.evaluate(() => document.querySelector('#placement-bar button.zr-cancel').click());
    // a fixed camera spot for the comparison: the savanna habitat
    const spot = await A.page.evaluate(() => { const h = RT.H.jungle || RT.H.savanna; return { q: h.q, r: h.r - 1 }; });
    await A.page.evaluate(([q, r]) => { ZRender.setRunning(false); ZRender.centerOn(q, r, true); }, [spot.q, spot.r]); await sleep(400);
    const imgD2 = await A.page.screenshot();
    ok(A.errors.length === 0, 'errors at density 2: ' + JSON.stringify(A.errors));
    await A.ctx.close();
    // the same at density 1
    const B = await open(browser, '?d=1'); await sleep(3500);
    const d1 = await B.page.evaluate(() => ZRender.debug()); const c1 = await cost(B.page, 3);
    notes.push('density 1 (old): buffer ' + d1.buffer.w + 'x' + d1.buffer.h + ' at ' + d1.buffer.deviceScale + ' device px, frame cost median ' + c1.median + ' ms (max ' + c1.max + '), ' + c1.fps + ' fps');
    await B.page.evaluate(([q, r]) => { ZRender.setRunning(false); ZRender.centerOn(q, r, true); }, [spot.q, spot.r]); await sleep(400);
    const imgD1 = await B.page.screenshot();
    const camCmp = await B.page.evaluate(() => ZRender.debug().cam);
    notes.push('compare camera (old art px): density 1 ' + Math.round(camCmp.x) + ',' + Math.round(camCmp.y));
    await B.ctx.close();
    // bare land at density 2
    const C = await open(browser, '?d=2&blank=1'); await sleep(3000);
    await C.page.screenshot({ path: path.join(shots, 'render-d2-blank' + sfx + '.png') });
    ok(C.errors.length === 0, 'errors on bare land at density 2: ' + JSON.stringify(C.errors));
    // side-by-side and a close-up, composed in the page
    const comp = await C.page.evaluate(async ([a, b]) => {
      const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
      const i1 = await load(a), i2 = await load(b), g = 24, cv = document.createElement('canvas'); cv.width = i1.width * 2 + g; cv.height = i1.height; const x = cv.getContext('2d');
      x.fillStyle = '#111'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(i1, 0, 0); x.drawImage(i2, i1.width + g, 0);
      const zw = 300, zh = 260, zx = Math.round(i1.width / 2 - zw / 2), zy = Math.round(i1.height * 0.42 - zh / 2), z = document.createElement('canvas'); z.width = zw * 2 * 2 + g; z.height = zh * 2; const zc = z.getContext('2d'); zc.imageSmoothingEnabled = false;
      zc.fillStyle = '#111'; zc.fillRect(0, 0, z.width, z.height); zc.drawImage(i1, zx, zy, zw, zh, 0, 0, zw * 2, zh * 2); zc.drawImage(i2, zx, zy, zw, zh, zw * 2 + g, 0, zw * 2, zh * 2);
      return [cv.toDataURL('image/png').split(',')[1], z.toDataURL('image/png').split(',')[1]];
    }, [imgD1.toString('base64'), imgD2.toString('base64')]);
    fs.writeFileSync(path.join(shots, 'render-d2-compare' + sfx + '.png'), Buffer.from(comp[0], 'base64'));
    fs.writeFileSync(path.join(shots, 'render-d2-zoom' + sfx + '.png'), Buffer.from(comp[1], 'base64'));
    await C.ctx.close();
  } catch (e) { fails.push('crashed: ' + (e && e.stack || e)); }
  await browser.close();
  return { name, fails, notes };
}

(async () => {
  let bad = 0;
  for (const n of which === 'both' ? ['chromium', 'webkit'] : [which]) {
    const r = await run(n); console.log('\n=== ' + r.name + ' (393x852, DPR 3) ===\n' + r.notes.map(x => '  ' + x).join('\n'));
    console.log(r.fails.length ? '  FAILED (' + r.fails.length + '):\n' + r.fails.map(x => '   - ' + x).join('\n') : '  ALL CHECKS PASSED'); bad += r.fails.length;
  }
  process.exit(bad ? 1 : 0);
})();
