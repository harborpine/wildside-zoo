/* Artist's contract check: loads the sprites in headless Chromium and confirms every id in the contract returns a real sprite.
   Usage: node test/art-check.js   (needs the Node path from docs/CONTRACTS.md). Prints PASS or the list of problems. */
const path = require('path');
const { chromium } = require('./pw.js');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(); const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('file:///' + path.join(__dirname, 'art-sheet.html').replace(/\\/g, '/') + '?s=extras');
  await page.waitForFunction('window.__done === true');
  const res = await page.evaluate(() => {
    const S = window.ZSprites, D = window.ZD, bad = [], t0 = performance.now();
    const ok = s => s && s.c && s.w > 0 && s.h > 0 && typeof s.ax === 'number' && typeof s.ay === 'number';
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
    });
    const pfb = S.person('no-such-kind', {});
    const kinds = Object.keys(D.ROLES).concat(['trader', 'headhunter', 'director', 'vip', 'visitor'], D.WHO || []);
    kinds.forEach(k => { for (let f = 0; f < S.PERSON_FRAMES; f++) if (!ok(S.person(k, { frame: f, flip: f % 2 === 1, seed: f }))) bad.push('person ' + k); if (k !== 'visitor' && same(S.person(k, {}), pfb)) bad.push('person ' + k + ' is the generic fallback'); });
    ['grass', 'path', 'locked', 'water'].concat(D.BIOME_ORDER.map(b => 'hab:' + b)).forEach(k => { const s = S.tile(k, 3); if (!ok(s) || s.w !== ZGeo.W || s.ax !== ZGeo.W / 2 || s.ay !== ZGeo.HH) bad.push('tile ' + k); });
    D.BIOME_ORDER.forEach(b => { for (let e = 0; e < 6; e++) { const s = S.fence(b, e); if (!ok(s) || typeof s.sortDy !== 'number') bad.push('fence ' + b + ' ' + e); } });
    const bfb = S.building('no-such-building', {});
    D.FAC_ORDER.forEach(id => { const s = S.building(id, {}); if (!ok(s) || same(s, bfb)) bad.push('building ' + id); });
    if (!ok(S.entrance())) bad.push('entrance');
    ['tree', 'bush', 'flowers', 'rock', 'lamp'].forEach(k => { if (!ok(S.deco(k, 1))) bad.push('deco ' + k); });
    const ifb = S.icon('no-such-icon');
    ['ready-event', 'ready-breed', 'busy', 'sick', 'choice', 'star', 'flame', 'coin', 'rp', 'heart', 'rep', 'm-projects', 'm-build', 'm-animals', 'm-staff', 'm-research', 'm-info', 'm-system'].forEach(n => { const s = S.icon(n); if (!ok(s) || same(s, ifb) || S.ICONS.indexOf(n) < 0) bad.push('icon ' + n); });
    for (const u of [S.url(S.icon('coin')), S.animalUrl('lion', {}, 4), S.iconUrl('star', 2), S.personUrl('keeper', {}, 3)]) if (String(u).indexOf('data:image/png') !== 0) bad.push('url helper');
    if (!S.PALETTE || !S.PALETTE.ink) bad.push('PALETTE');
    const sizes = D.SPECIES_LIST.map(sp => { const a = S.animal(sp.id, {}); return sp.id + ' ' + a.w + 'x' + a.h; });
    return { bad, species: D.SPECIES_LIST.length, ms: Math.round(performance.now() - t0), sizes };
  });
  const t = await page.evaluate(() => { const t0 = performance.now(); return 0; });
  console.log(res.species + ' species checked in ' + res.ms + ' ms (all frames, variants, juveniles, flips)');
  console.log('adult sizes: ' + res.sizes.join(', '));
  const all = res.bad.concat(errs);
  console.log(all.length ? 'PROBLEMS:\n  ' + all.join('\n  ') : 'PASS: every contract id returns its own sprite, no console errors');
  await browser.close(); if (all.length) process.exitCode = 1;
})();
