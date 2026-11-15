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
        ZT.WEEK_MS[1] = 1e9; ZT.WEEK_MS[2] = 1e9; ZCore.onReport('*', (r, d) => d()); const S = ZT.S; S.money = 900000; ZCore.act('advertise', 0); S.rp = 5000; S.regions.jungle = true; S.regions.desert = true;
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
        ZCore.act('startEvent', sav.id, 'feeding', S.staff.find(s => s.id === 7001).id);
        ZCore.act('runCampaign', 0); ZCore.act('runCampaign', 1);
      });
      const nProj = await p.evaluate(() => ZT.S.projects.length), nAn = await p.evaluate(() => ZT.S.animals.length);
      console.log('  ' + w + 'x' + h + ': ' + nProj + ' projects running, ' + nAn + ' animals');
      await p.touchscreen.tap(w / 2, h / 2); await sleep(500);
      const t = async text => { const pos = await p.evaluate(text => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), m = [...L.querySelectorAll('button, .row.tappable')].find(b => b.textContent.trim().startsWith(text)); if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, text); if (!pos) throw new Error('no ' + text); await p.touchscreen.tap(pos.x, pos.y); await sleep(450); };
      const fit = () => p.evaluate(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), b = L.querySelector('.mn-runlist') || L.querySelector('.pbody'); const subs = [...L.querySelectorAll('.gbox')].map(g => { const r = g.getBoundingClientRect(); return [...g.children].some(ch => ch.getBoundingClientRect().bottom > r.bottom + 1); }); return { over: b.scrollHeight - b.clientHeight, spill: subs.filter(Boolean).length }; });
      await t('Projects'); await p.screenshot({ path: path.join(SHOTS, 'menus-f-projects-' + w + 'x' + h + (name === 'chromium' ? '' : '-webkit') + '.png') });
      let f = await fit(); const rows = await p.evaluate(() => document.querySelectorAll('.layer:not([hidden]) .mn-run').length);
      if (h < 800) console.log('  (' + w + 'x' + h + ': the running list scrolls inside its own area by ' + f.over + ' px on a short screen; not asserted)'); else check(rows >= 6 && f.over <= 1 && f.spill === 0, w + 'x' + h + ': Projects lists ' + rows + ' running rows (3 projects, 2 campaigns, a hiring advert) in one place with no scrolling and no overlapping labels (' + JSON.stringify(f) + ')');
      await t('Back'); await t('Animals'); await t('Zoo').catch(() => 0); await p.screenshot({ path: path.join(SHOTS, 'menus-f-animals-' + w + 'x' + h + (name === 'chromium' ? '' : '-webkit') + '.png') });
      f = await fit(); if (h >= 800) check(f.over <= 1, w + 'x' + h + ': Animals (' + nAn + ' animals, 3 habitats) fits with no scrolling (' + JSON.stringify(f) + ')'); else console.log('  (' + w + 'x' + h + ': Animals with 14 animals scrolls by ' + f.over + ' px; not asserted on a short screen)');
      await c.close();
    }
    // staff count against the cap: shown on every hiring screen, solid red-orange and Hire greyed when full
    {
      const c = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), p = await c.newPage();
      await p.goto(URL); await p.waitForFunction(() => window.ZT && window.ZMenus); await sleep(400);
      await p.evaluate(() => { ZT.WEEK_MS[1] = 1e9; ZCore.onReport('*', (r, d) => d()); const S = ZT.S; S.money = 500000; ZE.debug.caller(S, 'headhunter'); S.reports.length = 0; S.candidates = [Object.assign({}, S.staff[0], { id: 8800, name: 'Cand One' })]; });
      const chip = async () => p.evaluate(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), e = L.querySelector('.mn-staffcap'); return e ? { t: e.textContent.replace(/\s+/g, ' ').trim(), full: e.classList.contains('full') } : null; });
      const off = async () => p.evaluate(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(); const bs = [...L.querySelectorAll('.row .btn')].filter(x => /^Hire/.test(x.textContent.trim())); return { n: bs.length, off: bs.filter(x => x.classList.contains('disabled') && /Staff full/.test(x.textContent)).length }; });
      const cap = await p.evaluate(() => ZE.staffCap(ZT.S));
      for (const full of [false, true]) {
        if (full) await p.evaluate(() => { const S = ZT.S; while (S.staff.length < ZE.staffCap(S)) S.staff.push(Object.assign({}, S.staff[0], { id: 8000 + S.staff.length, name: 'Fill' + S.staff.length })); ZE.refresh(S); });
        const n = await p.evaluate(() => ZT.S.staff.length);
        const shown = {};
        for (const [name, open] of [['Staff', () => ZMenus.screens.staff()], ['Who turned up', () => ZMenus.screens.candidates()], ['advert tiers', () => ZMenus.screens.hire()]]) {
          await p.evaluate(() => ZT.popAll()); await p.evaluate(open); await sleep(450);
          shown[name] = await chip();
          if (name !== 'advert tiers') { const o = await off(); if (full) check(o.n > 0 && o.off === o.n, name + ': every Hire button is greyed with "Staff full" when full (' + o.off + '/' + o.n + ')'); }
        }
        const ok = Object.keys(shown).every(k => shown[k] && shown[k].t.includes(n + ' / ' + cap) && shown[k].full === full);
        check(ok, (full ? 'full' : 'with room') + ': the big staff chip reads ' + n + ' / ' + cap + ' on Staff, Who turned up and the advert tiers' + (full ? ', solid and tagged Full' : '') + ' (' + JSON.stringify(shown).slice(0, 150) + ')');
        await p.evaluate(() => ZT.popAll()); await p.evaluate(() => ZMenus.open()); await sleep(400);
        const box = await p.evaluate(() => { const g = [...document.querySelectorAll('.layer:not([hidden]) .gbox')].find(x => x.textContent.startsWith('Staff')); return g ? g.textContent : ''; });
        check(box.includes(n + '/' + cap), 'main menu Staff box shows ' + n + '/' + cap);
        if (full) await p.screenshot({ path: path.join(SHOTS, 'menus-f-staff-full' + (name === 'chromium' ? '' : '-webkit') + '.png') });
      }
      await c.close();
    }
    // upgrade from the Animals header: capacity and price on the button, gold when full, grey with a reason
    {
      const c = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), p = await c.newPage();
      await p.goto(URL); await p.waitForFunction(() => window.ZT && window.ZMenus); await sleep(400);
      await p.evaluate(() => { ZT.WEEK_MS[1] = 1e9; ZCore.onReport('*', (r, d) => d()); ZT.S.money = 500000; ZMenus.screens.animals(); }); await sleep(500);
      const hdr = () => p.evaluate(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), h = L.querySelector('.mn-hh'), u = h && h.querySelector('.mn-up'); return h ? { t: h.querySelector('.sec').textContent.replace(/\s+/g, ' ').trim(), btn: u.textContent.replace(/\s+/g, ' ').trim(), gold: u.classList.contains('gold'), off: u.classList.contains('off'), h: Math.round(u.getBoundingClientRect().height) } : null; });
      const tapUp = async () => { const q = await p.evaluate(() => { const r = document.querySelector('.layer:not([hidden]) .mn-up').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); await p.touchscreen.tap(q.x, q.y); await sleep(700); };
      let h0 = await hdr(); check(h0 && h0.t.includes('/4') && /6/.test(h0.btn) && !h0.gold && !h0.off && h0.h >= 44, 'the Animals header shows capacity and an upgrade button with the new capacity and price (' + JSON.stringify(h0) + ')');
      await p.evaluate(() => { const S = ZT.S, hab = S.items.find(i => i.k === 'hab'); while (ZE.inHab(S, hab.id).length < ZE.habCap(hab)) S.animals.push({ id: 9500 + S.animals.length, sp: 'zebra', name: 'F', sex: 'M', charm: 10, vigor: 10, wit: 10, variant: false, gen: 1, born: null, hab: hab.id, rest: 0, sick: 0 }); ZE.refresh(S); ZCore.rerender(); }); await sleep(400);
      h0 = await hdr(); check(h0.gold, 'a full habitat has its upgrade button highlighted in gold (' + h0.t + ')');
      await tapUp(); const h1 = await hdr();
      check(h1.t.includes('/6') && !h1.gold, 'one tap upgrades: the header now shows capacity 6 and the highlight goes (' + h1.t + ')');
      check(h1.off && /research/i.test(h1.btn), 'the next upgrade is greyed with "Needs research" (' + h1.btn + ')'); await p.screenshot({ path: path.join(SHOTS, 'menus-f-upgrade-' + (name === 'chromium' ? 'cr' : 'wk') + '.png') });
      await p.evaluate(() => { const S = ZT.S; S.research['tech:hab3'] = true; S.money = 10; ZCore.rerender(); }); await sleep(300);
      const h2 = await hdr(); check(h2.off && /Need/.test(h2.btn), 'with too little money it says what is needed (' + h2.btn + ')');
      await p.evaluate(() => { const S = ZT.S; S.money = 5e6; S.items.find(i => i.k === 'hab').lvl = 5; ZCore.rerender(); }); await sleep(300);
      const h3 = await hdr(); check(h3.off && /Max/.test(h3.btn), 'at the top level it says "Max level" (' + h3.btn + ')');
      await c.close();
    }
    check(errs.length === 0, 'no errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : '')); await b.close();
  }
  console.log(failures ? failures + ' FAILURES' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})();
