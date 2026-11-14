/* Artist's contract check: loads the sprites in headless Chromium and confirms every id in the contract returns a real sprite,
   at density 1 (today) and density 2 (style D, with ZGeo doubled the way the Lead will double it when the switch is flipped).
   Usage: node test/art-check.js   (needs the Node path from docs/CONTRACTS.md). Prints PASS or the list of problems. */
const path = require('path');
const { chromium } = require('./pw.js');
function check(dens) { // runs in the page
  const S = window.ZSprites, D = window.ZD, bad = [], t0 = performance.now();
  if (dens === 2) { // the doubled geometry the Lead will ship with the switch: A=[90,18], B=[24,66]
    const G1 = window.ZGeo, A = [90, 18], B = [24, 66], g = { A, B }, DET = A[0] * B[1] - B[0] * A[1];
    const third = (i, j) => [(i * A[0] + j * B[0]) / 3, (i * A[1] + j * B[1]) / 3];
    g.CORNERS = [third(1, -2), third(2, -1), third(1, 1), third(-1, 2), third(-2, 1), third(-1, -1)]; g.EDGES = G1.EDGES;
    g.W = G1.W * 2; g.H = G1.H * 2; g.HW = G1.HW * 2; g.HH = G1.HH * 2;
    g.toScreen = (q, r) => ({ x: A[0] * q + B[0] * r, y: A[1] * q + B[1] * r });
    g.toAxial = function (x, y) { const qf = (x * B[1] - y * B[0]) / DET, rf = (y * A[0] - x * A[1]) / DET; let rx = Math.round(qf), rz = Math.round(rf), ry = Math.round(-qf - rf);
      const dx = Math.abs(rx - qf), dz = Math.abs(rz - rf), dy = Math.abs(ry + qf + rf); if (dx > dy && dx > dz) rx = -ry - rz; else if (dy <= dz) rz = -rx - ry; return { q: rx, r: rz }; };
    g.edgeMidY = e => (g.CORNERS[g.EDGES[e][1]][1] + g.CORNERS[g.EDGES[e][2]][1]) / 2; g.depth = (q, r, dy) => A[1] * q + B[1] * r + (dy || 0);
    window.__G1 = G1; window.ZGeo = g; S.setDensity(2);
  }
  const G = window.ZGeo, G1 = window.__G1 || G;
  const one = fn => { if (dens !== 2) return null; window.ZGeo = G1; S.setDensity(1); const r = fn(); window.ZGeo = G; S.setDensity(2); return r; };
  const ok = s => s && s.c && s.w > 0 && s.h > 0 && typeof s.ax === 'number' && typeof s.ay === 'number' && s.d === dens;
  const about = (a, b, name) => { if (!b) return; const r = a / b; if (r < 1.5 || r > 2.5) bad.push(name + ' is not about twice the density-1 size (' + a + ' vs ' + b + ')'); };
  const fb = S.animal('no-such-animal', {});
  const same = (a, b) => a.w === b.w && a.h === b.h && a.c.toDataURL() === b.c.toDataURL();
  const seen = {};
  D.SPECIES_LIST.forEach(sp => {
    for (let f = 0; f < S.ANIMAL_FRAMES; f++) for (const v of [false, true]) for (const j of [false, true]) for (const fl of [false, true]) {
      const s = S.animal(sp.id, { frame: f, variant: v, juv: j, flip: fl }); if (!ok(s)) bad.push('animal ' + sp.id);
    }
    const a = S.animal(sp.id, {}), u = a.c.toDataURL();
    if (same(a, fb)) bad.push('animal ' + sp.id + ' is the fallback');
    if (seen[u]) bad.push('animal ' + sp.id + ' looks identical to ' + seen[u]); seen[u] = sp.id;
    if (same(a, S.animal(sp.id, { variant: true }))) bad.push('animal ' + sp.id + ' variant looks the same as normal');
    if (same(a, S.animal(sp.id, { juv: true }))) bad.push('animal ' + sp.id + ' juvenile looks the same as adult');
    if (same(a, S.animal(sp.id, { frame: 1 }))) bad.push('animal ' + sp.id + ' has no walk frame');
    if (S.animal(sp.id, { juv: true }).h > a.h) bad.push('animal ' + sp.id + ' juvenile is taller than the adult');
    const a1 = one(() => S.animal(sp.id, {})); if (a1) { about(a.h, a1.h, 'animal ' + sp.id + ' height'); about(a.w, a1.w, 'animal ' + sp.id + ' width'); }
  });
  const pfb = S.person('no-such-kind', {});
  const kinds = Object.keys(D.ROLES).concat(['trader', 'headhunter', 'director', 'vip', 'visitor'], D.WHO || []);
  kinds.forEach(k => { for (let f = 0; f < S.PERSON_FRAMES; f++) if (!ok(S.person(k, { frame: f, flip: f % 2 === 1, seed: f }))) bad.push('person ' + k);
    if (k !== 'visitor' && same(S.person(k, {}), pfb)) bad.push('person ' + k + ' is the generic fallback');
    const p1 = one(() => S.person(k, {})); if (p1) about(S.person(k, {}).h, p1.h, 'person ' + k + ' height'); });
  ['grass', 'path', 'locked', 'water'].concat(D.BIOME_ORDER.map(b => 'hab:' + b)).forEach(k => { const s = S.tile(k, 3);
    if (!ok(s) || s.w !== G.W || s.ax !== G.W / 2 || s.ay !== G.HH) bad.push('tile ' + k + ' (' + s.w + ' wide, anchor ' + s.ax + ',' + s.ay + ')');
    const t1 = one(() => S.tile(k, 3)); if (t1 && (s.w !== 2 * t1.w || s.h !== 2 * t1.h || s.ax !== 2 * t1.ax || s.ay !== 2 * t1.ay)) bad.push('tile ' + k + ' is not exactly double'); });
  D.BIOME_ORDER.forEach(b => { for (let e = 0; e < 6; e++) { const s = S.fence(b, e); if (!ok(s) || s.sortDy !== G.edgeMidY(e)) bad.push('fence ' + b + ' ' + e); } });
  const bfb = S.building('no-such-building', {});
  D.FAC_ORDER.forEach(id => { const s = S.building(id, {}); if (!ok(s) || same(s, bfb)) bad.push('building ' + id); const b1 = one(() => S.building(id, {})); if (b1) about(s.w, b1.w, 'building ' + id + ' width'); });
  const en = S.entrance(); if (!ok(en) || en.sortDy !== G.HH) bad.push('entrance');
  ['tree', 'bush', 'flowers', 'rock', 'lamp', 'crate'].forEach(k => { if (!ok(S.deco(k, 1))) bad.push('deco ' + k); });
  const ifb = S.icon('no-such-icon');
  S.ICONS.forEach(n => { const s = S.icon(n); if (!ok(s) || same(s, ifb)) bad.push('icon ' + n); const i1 = one(() => S.icon(n)); if (i1) about(s.w, i1.w, 'icon ' + n + ' width'); });
  ['ready-event', 'ready-breed', 'busy', 'sick', 'choice', 'star', 'flame', 'coin', 'rp', 'heart', 'rep', 'm-projects', 'm-build', 'm-animals', 'm-staff', 'm-research', 'm-info', 'm-system', 'stat-charm', 'stat-vigor', 'stat-wit', 'skill-care', 'skill-sci', 'skill-exp', 'skill-charm', 'sex-m', 'sex-f', 'juv', 'time', 'visitors', 'odds', 'cost-rp', 'lock', 'new', 'ok', 'no', 'habitat', 'pen', 'land', 'trophy', 'medal-gold', 'medal-silver', 'medal-bronze', 'grade-ss', 'grade-s', 'grade-a', 'grade-b', 'grade-c', 'grade-d'].forEach(n => { if (S.ICONS.indexOf(n) < 0) bad.push('icon missing ' + n); });
  for (const u of [S.url(S.icon('coin')), S.animalUrl('lion', {}, 4), S.iconUrl('star', 2), S.personUrl('keeper', {}, 3)]) if (String(u).indexOf('data:image/png') !== 0) bad.push('url helper');
  if (dens === 2) { const lion = S.animal('lion', {}); window.__urlCheck = [S.animalUrl('lion', {}, 4), lion.w * 2, lion.h * 2]; }
  if (!S.PALETTE || !S.PALETTE.ink) bad.push('PALETTE');
  const sizes = D.SPECIES_LIST.map(sp => { const a = S.animal(sp.id, {}); return sp.id + ' ' + a.w + 'x' + a.h; });
  return { bad, species: D.SPECIES_LIST.length, ms: Math.round(performance.now() - t0), sizes };
}
(async () => {
  const browser = await chromium.launch({ headless: true }); let fail = 0;
  for (const dens of [1, 2]) {
    const page = await browser.newPage(); const errs = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto('file:///' + path.join(__dirname, 'art-sheet.html').replace(/\\/g, '/') + '?s=extras');
    await page.waitForFunction('window.__done === true');
    const res = await page.evaluate(check, dens);
    if (dens === 2) { // menu images at density 2: halved scale, so the same size in CSS pixels
      const [u, w, h] = await page.evaluate('window.__urlCheck');
      const dim = await page.evaluate(src => new Promise(r => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = src; }), u);
      if (dim[0] !== w || dim[1] !== h) res.bad.push('animalUrl at density 2 should use half the scale (' + dim + ' vs ' + w + 'x' + h + ')');
    }
    console.log('density ' + dens + ': ' + res.species + ' species checked in ' + res.ms + ' ms (all frames, variants, juveniles, flips)');
    console.log('  adult sizes: ' + res.sizes.join(', '));
    const all = res.bad.concat(errs);
    console.log(all.length ? '  PROBLEMS:\n    ' + all.join('\n    ') : '  PASS at density ' + dens + ': every contract id returns its own sprite, no console errors');
    if (all.length) fail++;
    await page.close();
  }
  await browser.close(); if (fail) process.exitCode = 1;
})();
