/* Menus: debugging helper. node test/menus-dbg.js <screenName> : opens one screen in a late-game state and lists anything wider than the phone. */
const path = require('path'), pw = require('./pw.js');
const URL = 'file:///' + path.resolve(__dirname, '..').replace(/\\/g, '/') + '/index.html';
(async () => {
  const which = process.argv[2] || 'facilities';
  const b = await pw.chromium.launch(), c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), p = await c.newPage();
  await p.goto(URL); await p.waitForFunction(() => window.ZT && document.documentElement.dataset.ready && window.ZMenus);
  await p.evaluate(w => {
    ZT.WEEK_MS[1] = 1e9; const S = ZT.S; S.money = 5e7; S.rp = 9000; S.rep = 60000; ZD.BIOME_ORDER.forEach(b => { S.regions[b] = true; });
    ZE.researchList(S).forEach(r => { if (r.id.indexOf('region:') !== 0) S.research[r.id] = true; });
    for (let i = 0; i < 12; i++) { const sp = ZD.SPECIES_LIST[i * 3 % 68]; S.animals.push({ id: 9000 + i, sp: sp.id, name: 'Test' + i, sex: i % 2 ? 'F' : 'M', charm: 20 + i, vigor: 30 + i, wit: 10 + i, variant: i % 7 === 0, gen: 1, born: null, hab: null, rest: 0, sick: 0 }); }
    ZE.refresh(S); ZMenus.screens[w]();
  }, which);
  await new Promise(r => setTimeout(r, 500));
  const out = await p.evaluate(() => {
    const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), pn = L.querySelector('.panel').getBoundingClientRect(), bad = [];
    L.querySelectorAll('*').forEach(e => { const r = e.getBoundingClientRect(); if (r.right > 391) bad.push(e.tagName + '.' + e.className + ' ' + Math.round(r.left) + '-' + Math.round(r.right) + ' ' + (e.textContent || '').slice(0, 30)); });
    return { panel: [pn.left, pn.right], bad: bad.slice(0, 14) };
  });
  console.log(JSON.stringify(out, null, 1)); await b.close();
})();
