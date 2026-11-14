/* Menus: no-scroll checks for Projects (4 running) and Animals (typical early zoo) at phone sizes. Shots: test/shots/menus-f-*.png
   Usage: node test/menus-fit.js [chromium|webkit ...] */
const path = require('path'), fs = require('fs'), pw = require('./pw.js');
const URL = 'file:///' + path.resolve(__dirname, '..').replace(/\\/g, '/') + '/index.html?play=1';
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0; const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };
const SIZES = [[393, 852], [390, 844], [375, 667]];
(async () => {
  for (const name of (process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit'])) {
    console.log('== ' + name); const b = await pw[name].launch(), errs = [];
    for (const [w, h] of SIZES) {
      const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), p = await c.newPage();
      p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Not allowed|Access-Control-Allow-Origin/.test(m.text())) errs.push(m.text()); });
      await p.goto(URL); await p.waitForFunction(() => window.ZT && window.ZMenus); await sleep(400);
      await p.evaluate(() => {
        ZT.WEEK_MS[1] = 1e9; ZT.WEEK_MS[2] = 1e9; ZCore.onReport('*', (r, d) => d()); const S = ZT.S; S.money = 900000; S.rp = 5000; S.regions.jungle = true; S.regions.desert = true;
        const spot = (t) => { for (let r = 19; r >= 0; r--) for (let c = 0; c < ZD.GRID_W; c++) { const q = ZE.fromOffset(c, r); if (ZE.canPlace(S, 'hab', t, q[0], q[1], 0)) return q; } };
        ['jungle', 'desert'].forEach(t => { const q = spot(t); ZCore.act('build', 'hab', t, q[0], q[1], 0); });
        const habs = S.items.filter(i => i.k === 'hab'), ids = ['zebra', 'warthog', 'ostrich', 'giraffe', 'capybara', 'macaw', 'toucan', 'sloth', 'emu', 'kangaroo', 'wombat', 'camel'];
        ids.forEach((sp, i) => { const hb = habs.find(x => x.t === ZD.SPECIES[sp].biome); if (hb) S.animals.push({ id: 9100 + i, sp, name: 'T' + i, sex: i % 2 ? 'F' : 'M', charm: 20 + i, vigor: 30 + i, wit: 10 + i, variant: false, gen: 1, born: null, hab: hb.id, rest: 0, sick: 0 }); });
        const base = S.staff[0]; for (let i = 0; i < 3; i++) S.staff.push(Object.assign({}, base, { id: 7000 + i, name: 'Extra' + i, role: i ? 'keeper' : 'guide' }));
        ZE.refresh(S);
        const sav = habs.find(x => x.t === 'savanna'), jun = habs.find(x => x.t === 'jungle');
        sav.eventAt = -99; jun.eventAt = -99;
        const ex = S.staff.find(s => s.role === 'explorer');
        ZCore.act('startExpedition', 'savanna', [ex.id], 1);
        const pair = ZE.readyPairs(S, sav.id)[0]; if (pair) ZCore.act('startBreeding', pair[0], pair[1], S.staff.find(s => s.id === 7000).id);
        ZCore.act('startEvent', sav.id, 'feeding', S.staff.find(s => s.id === 7001).id); ZCore.act('startEvent', jun.id, 'feeding', S.staff.find(s => s.id === 7002).id);
      });
      const nProj = await p.evaluate(() => ZT.S.projects.length), nAn = await p.evaluate(() => ZT.S.animals.length);
      console.log('  ' + w + 'x' + h + ': ' + nProj + ' projects running, ' + nAn + ' animals');
      await p.touchscreen.tap(w / 2, h / 2); await sleep(500);
      const t = async text => { const pos = await p.evaluate(text => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), m = [...L.querySelectorAll('button, .row.tappable')].find(b => b.textContent.trim().startsWith(text)); if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, text); if (!pos) throw new Error('no ' + text); await p.touchscreen.tap(pos.x, pos.y); await sleep(450); };
      const fit = () => p.evaluate(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), b = L.querySelector('.pbody'); const subs = [...L.querySelectorAll('.gbox')].map(g => { const r = g.getBoundingClientRect(); return [...g.children].some(ch => ch.getBoundingClientRect().bottom > r.bottom + 1); }); return { over: b.scrollHeight - b.clientHeight, spill: subs.filter(Boolean).length }; });
      await t('Projects'); await p.screenshot({ path: path.join(SHOTS, 'menus-f-projects-' + w + 'x' + h + (name === 'chromium' ? '' : '-webkit') + '.png') });
      let f = await fit(); check(nProj >= 4 && f.over <= 1 && f.spill === 0, w + 'x' + h + ': Projects with ' + nProj + ' running fits with no scrolling and no overlapping labels (' + JSON.stringify(f) + ')');
      await t('Back'); await t('Animals'); await t('Zoo').catch(() => 0); await p.screenshot({ path: path.join(SHOTS, 'menus-f-animals-' + w + 'x' + h + (name === 'chromium' ? '' : '-webkit') + '.png') });
      f = await fit(); if (h >= 800) check(f.over <= 1, w + 'x' + h + ': Animals (' + nAn + ' animals, 3 habitats) fits with no scrolling (' + JSON.stringify(f) + ')'); else console.log('  (' + w + 'x' + h + ': Animals with 14 animals scrolls by ' + f.over + ' px; not asserted on a short screen)');
      await c.close();
    }
    check(errs.length === 0, 'no errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : '')); await b.close();
  }
  console.log(failures ? failures + ' FAILURES' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})();
