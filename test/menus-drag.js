/* Menus: press, hold and drag an animal (move between habitats, to the pen, sell, invalid drop, quick tap, swipe scroll).
   Touch through the browser's touch events on Chromium, mouse on both.  Usage: node test/menus-drag.js [chromium|webkit ...]  Shots: test/shots/menus-d-*.png */
const path = require('path'), fs = require('fs'), pw = require('./pw.js');
const URL = 'file:///' + path.resolve(__dirname, '..').replace(/\\/g, '/') + '/index.html?play=1';
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0; const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };

(async () => {
  for (const name of (process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit'])) {
    console.log('== ' + name); const b = await pw[name].launch(), errs = [], tag = name === 'chromium' ? '' : '-webkit';
    const c = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), p = await c.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Access-Control|Not allowed/.test(m.text())) errs.push(m.text()); });
    const cdp = name === 'chromium' ? await c.newCDPSession(p) : null;
    await p.goto(URL); await p.waitForFunction(() => window.ZT && window.ZMenus); await sleep(400);
    await p.evaluate(() => {
      ZT.WEEK_MS[1] = 1e9; ZCore.onReport('*', (r, d) => d()); const S = ZT.S; S.money = 900000; S.regions.jungle = true;
      const spot = t => { for (let r = 19; r >= 0; r--) for (let c = 0; c < ZD.GRID_W; c++) { const q = ZE.fromOffset(c, r); if (ZE.canPlace(S, 'hab', t, q[0], q[1], 0)) return q; } };
      ['savanna', 'jungle'].forEach(t => { const q = spot(t); ZCore.act('build', 'hab', t, q[0], q[1], 0); });
      const jun = S.items.find(i => i.t === 'jungle'); S.animals.push({ id: 9600, sp: 'capybara', name: 'Cap', sex: 'M', charm: 30, vigor: 30, wit: 30, variant: false, gen: 1, born: null, hab: jun.id, rest: 0, sick: 0 });
      ZE.refresh(S); localStorage.removeItem('wildside-drag-hint'); ZMenus.screens.animals();
    }); await sleep(500);
    const st = () => p.evaluate(() => { const S = ZT.S, sav = S.items.filter(i => i.t === 'savanna'); return { z: S.animals.filter(a => a.sp === 'zebra').map(a => [a.id, a.hab]), sav: sav.map(h => h.id), jun: S.items.find(i => i.t === 'jungle').id, n: S.animals.length }; });
    const center = sel => p.evaluate(sel => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), e = (L || document).querySelector(sel); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    // low-level pointer helpers: touch on Chromium (via CDP), mouse otherwise
    const down = async (pt, touch) => { if (touch && cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] }); else { await p.mouse.move(pt.x, pt.y); await p.mouse.down(); } };
    const move = async (pt, touch) => { if (touch && cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x, y: pt.y }] }); else await p.mouse.move(pt.x, pt.y, { steps: 6 }); };
    const up = async touch => { if (touch && cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await p.mouse.up(); };
    const hold = () => sleep(520);
    async function dragTo(tileSel, targetSel, touch, shotName) {
      const a = await center(tileSel); await down(a, touch); await hold();
      check(await p.evaluate(() => !!document.querySelector('.mn-ghost')), '  (the tile lifts after a hold: a solid copy follows the finger)');
      const t = await center(targetSel); await move({ x: a.x + 5, y: a.y + 5 }, touch); await move(t, touch); await sleep(150);
      if (shotName) await p.screenshot({ path: path.join(SHOTS, 'menus-d-' + shotName + tag + '.png') });
      const info = await p.evaluate(() => ({ marks: [...document.querySelectorAll('.drop-ok, .drop-no')].length, ghostTag: (document.querySelector('.mn-gtag') || {}).textContent || '' }));
      await up(touch); await sleep(500); return info;
    }
    for (const touch of (cdp && !process.env.MOUSE ? [true, false] : [false])) {
      const how = touch ? 'touch' : 'mouse';
      let s0 = await st(); const zid = s0.z.find(z => z[1] === s0.sav[0])[0];
      // move between two habitats (a second savanna)
      await p.evaluate(() => { const S = ZT.S, spot = () => { for (let r = 19; r >= 0; r--) for (let c = 0; c < ZD.GRID_W; c++) { const q = ZE.fromOffset(c, r); if (ZE.canPlace(S, 'hab', 'savanna', q[0], q[1], 0)) return q; } }; if (S.items.filter(i => i.t === 'savanna').length < 2) { const q = spot(); ZCore.act('build', 'hab', 'savanna', q[0], q[1], 0); } ZCore.rerender(); }); await sleep(400);
      s0 = await st();
      const info = await dragTo('[data-aid="' + zid + '"]', '.mn-hsec[data-hab="' + s0.sav[1] + '"]', touch, touch ? 'dragging' : null);
      let s1 = await st(); check(s1.z.find(z => z[0] === zid)[1] === s0.sav[1], how + ': dropping on another savanna habitat moves the animal there (' + JSON.stringify(info) + ')');
      check(info.marks >= 3, how + ': every habitat is marked while dragging (' + info.marks + ' marked)');
      // invalid drop: jungle takes no zebra
      const info2 = await dragTo('[data-aid="' + zid + '"]', '.mn-hsec[data-hab="' + s1.jun + '"]', touch);
      let s2 = await st(); check(s2.z.find(z => z[0] === zid)[1] === s1.z.find(z => z[0] === zid)[1], how + ': dropping on a habitat that cannot take it changes nothing (the finger showed "' + info2.ghostTag + '")');
      check(/biome/i.test(info2.ghostTag), how + ': the wrong-biome reason shows while hovering');
      // to the pen
      const a = await center('[data-aid="' + zid + '"]'); await down(a, touch); await hold(); const pt = await center('.mn-dt.pen'); await move(pt, touch); await sleep(120); await up(touch); await sleep(500);
      s2 = await st(); check(s2.z.find(z => z[0] === zid)[1] === null, how + ': dropping on the Holding pen target moves it to the pen');
      // back out of the pen to a habitat (Pen tab) then sell from the zoo tab
      await p.evaluate(zid => { ZCore.act('moveAnimal', zid, ZT.S.items.find(i => i.t === 'savanna').id); ZCore.rerender(); }, zid); await sleep(400);
      // sell with a confirm
      const before = (await st()).n; const a2 = await center('[data-aid="' + zid + '"]'); await down(a2, touch); await hold(); const sp = await center('.mn-dt.sell'); await move(sp, touch); await sleep(120); await up(touch); await sleep(500);
      check((await p.evaluate(() => ZT.stack().slice(-1)[0])) === 'confirm' && (await st()).n === before, how + ': dropping on Sell asks one confirm first');
      const yes = await p.evaluate(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), b = [...L.querySelectorAll('button')].find(x => /^Sell/.test(x.textContent.trim())); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await p.touchscreen.tap(yes.x, yes.y); await sleep(500); check((await st()).n === before - 1, how + ': confirming sells the animal');
      // put one back for the next round
      await p.evaluate(() => { const S = ZT.S, h = S.items.find(i => i.t === 'savanna'); S.animals.push({ id: 9700 + S.animals.length, sp: 'zebra', name: 'Z', sex: 'F', charm: 20, vigor: 20, wit: 20, variant: false, gen: 1, born: null, hab: h.id, rest: 0, sick: 0 }); ZE.refresh(S); ZCore.rerender(); }); await sleep(400);
    }
    // a quick tap still opens the animal
    const any = await p.evaluate(() => +[...document.querySelectorAll('.layer:not([hidden])')].pop().querySelector('[data-aid]').dataset.aid); const tp = await center('[data-aid="' + any + '"]');
    await p.touchscreen.tap(tp.x, tp.y); await sleep(500); console.log('  stack after tap: ' + await p.evaluate(() => ZT.stack().join('>') + ' sup:' + (window.__sup || ''))); check((await p.evaluate(() => ZT.stack().slice(-1)[0])) === 'animal', 'a quick tap still opens the animal screen'); await p.evaluate(() => ZT.popAll()); await p.evaluate(() => ZMenus.screens.animals()); await sleep(400);
    // an animal in a running project cannot be picked up
    await p.evaluate(() => { const S = ZT.S, hab = S.items.find(i => i.t === 'savanna'), pair = ZE.readyPairs(S, hab.id)[0]; if (pair) ZCore.act('startBreeding', pair[0], pair[1], S.staff.find(s => s.role === 'keeper').id); ZCore.rerender(); }); await sleep(400);
    const busyId = await p.evaluate(() => { const b = ZE.busyAnimals(ZT.S); return +Object.keys(b)[0] || null; });
    if (busyId) { const bp = await center('[data-aid="' + busyId + '"]'); await down(bp, false); await hold(); const picked = await p.evaluate(() => !!document.querySelector('.mn-ghost')); await up(false); await sleep(300); check(!picked, 'an animal in a running project is not picked up (it shakes and says so)'); }
    // a swipe scrolls instead of picking up
    await p.evaluate(() => { const S = ZT.S, hab = S.items.find(i => i.t === 'savanna'); for (let i = 0; i < 40; i++) S.animals.push({ id: 9800 + i, sp: 'zebra', name: 'Q' + i, sex: i % 2 ? 'F' : 'M', charm: 10, vigor: 10, wit: 10, variant: false, gen: 1, born: null, hab: hab.id, rest: 0, sick: 0 }); ZCore.rerender(); }); await sleep(400);
    const sw = await center('[data-aid="9800"]');
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sw.x, y: sw.y }] });
      for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sw.x, y: sw.y - i * 25 }] }); await sleep(20); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(500);
      const r = await p.evaluate(() => ({ top: [...document.querySelectorAll('.layer:not([hidden])')].pop().querySelector('.pbody').scrollTop, ghost: !!document.querySelector('.mn-ghost') }));
      check(r.top > 20 && !r.ghost, 'a swipe on a tile scrolls the list and never picks the animal up (scrolled ' + Math.round(r.top) + ' px)');
    } else {
      await p.mouse.move(sw.x, sw.y); await p.mouse.down(); await p.mouse.move(sw.x, sw.y - 80, { steps: 6 }); await sleep(600); const g = await p.evaluate(() => !!document.querySelector('.mn-ghost')); await p.mouse.up();
      check(!g, 'moving before the hold finishes cancels the pick-up (so the browser can scroll)');
    }
    // the one-time hint was shown once
    check(await p.evaluate(() => !!localStorage.getItem('wildside-drag-hint')), 'the "Hold and drag" hint was shown and will not repeat');
    check(errs.length === 0, 'no errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : '')); await b.close();
  }
  console.log(failures ? failures + ' FAILURES' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})();
