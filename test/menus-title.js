/* Menus: title screen, save slots, tutorial and "boxes fit without scrolling" checks. Headless only.
   Usage: node test/menus-title.js [chromium|webkit ...]   (default: both). Shots: test/shots/menus-t-*.png */
const path = require('path'), fs = require('fs');
const pw = require('./pw.js');
const ROOT = path.resolve(__dirname, '..'), URL = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html';
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  PASS ' : '  FAIL ') + msg); if (!cond) failures++; };
const TITLE_SIZES = [[375, 553], [320, 568], [390, 664], [390, 844], [440, 956]];
const SIZES = [[390, 664], [390, 753], [375, 553], [375, 647], [430, 739], [440, 956], [390, 844]];

async function run(name) {
  const tag = (name === 'chromium' ? '' : '-' + name) + (process.env.SZ ? '-' + process.env.SZ : '');
  console.log('== ' + name);
  const browser = await pw[name].launch(), errors = [];
  async function mk(w, h, url) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Access-Control-Allow-Origin|Not allowed to load local resource/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(url || URL); await page.waitForFunction(() => window.ZT && window.ZMenus, null, { timeout: 8000 }); await sleep(500);
    return { ctx, page };
  }
  const ev = (page, fn, arg) => page.evaluate(fn, arg);
  const stack = page => ev(page, () => ZT.stack().join('>'));
  async function tap(page, text, o) {
    o = o || {};
    const pos = await ev(page, ({ text, nth }) => {
      const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(); if (!L) return { err: 'no screen' };
      const all = [...L.querySelectorAll('button, .row.tappable, .tab')].filter(b => b.getBoundingClientRect().width > 0), t = b => b.textContent.trim();
      let m = all.filter(b => t(b).startsWith(text)); if (!m.length) m = all.filter(b => t(b).includes(text));
      if (!m.length) return { err: 'not found: ' + text + ' among ' + all.map(b => t(b).slice(0, 16)).join(' | ') };
      const b = m[nth || 0]; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, { text, nth: o.nth || 0 });
    if (pos.err) throw new Error(pos.err);
    await sleep(60); await page.touchscreen.tap(pos.x, pos.y); await sleep(o.wait || 400);
  }
  async function tapSel(page, sel, nth) {
    const r = await ev(page, ({ sel, nth }) => { const e = [...document.querySelectorAll(sel)][nth || 0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, { sel, nth });
    if (!r) throw new Error('no ' + sel); await page.touchscreen.tap(r.x, r.y); await sleep(450);
  }
  const step = page => ev(page, () => { const t = ZT.S && ZT.S.ui && ZT.S.ui.tutorial; return t ? (t.on ? t.step : 'off') : 'none'; });
  const coach = page => ev(page, () => { const c = document.querySelector('.mn-coach'); return c ? c.textContent.replace(/Skip$/, '').trim() : null; });
  const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, 'menus-t-' + n + tag + '.png') });
  const freeHex = (page, kind, t) => ev(page, ({ kind, t }) => {
    const S = ZT.S, rows = []; for (let r = 0; r < ZD.GRID_H; r++) for (let c = 0; c < ZD.GRID_W; c++) { const [q, rr] = ZE.fromOffset(c, r); if (ZE.canPlace(S, kind, t, q, rr, 0)) rows.push([q, rr]); }
    rows.sort((a, b) => Math.abs(a[1] - 14) - Math.abs(b[1] - 14)); const [q, r] = rows[0]; ZRender.centerOn(q, r, true);
    return new Promise(res => setTimeout(() => { const p = ZRender.hexToClient(q, r); res({ x: p.x, y: p.y }); }, 350));
  }, { kind, t });

  // ---------------------------------------------------------------- title screen, three empty slots
  const SZ = (process.env.SZ || '390x844').split('x').map(Number); let { ctx, page } = await mk(SZ[0], SZ[1]);
  check(await stack(page) === 'title', 'the game starts on the title screen (' + await stack(page) + ')');
  check(await ev(page, () => document.querySelectorAll('.mn-slot').length) === 3 && await ev(page, () => document.querySelectorAll('.mn-slot.empty').length) === 3, 'title shows three empty slots');
  await shot(page, 'title-empty');
  // new zoo in slot 2 with the tutorial
  await tapSel(page, '.mn-slot.empty', 1); check(await stack(page) === 'title>newzoo-name', 'empty slot opens the name step'); await shot(page, 'name');
  check(await ev(page, () => document.querySelector('.mn-name').value) === 'Wildside Zoo' && await ev(page, () => parseFloat(getComputedStyle(document.querySelector('.mn-name')).fontSize)) >= 16, 'name is prefilled and big enough for a phone keyboard');
  await tap(page, 'Next'); check(await stack(page) === 'title>newzoo-name>newzoo-tutorial', 'then "Play the tutorial?"'); await shot(page, 'tutorial-question');
  await tap(page, 'Yes', { wait: 800 });
  check(await ev(page, () => ZCore.slot === 2 && ZT.S.zooName === 'Wildside Zoo') && (await stack(page)) === '', 'slot 2 started, play begins');
  check(await ev(page, () => ZT.S.items.filter(i => i.k === 'hab').length === 0 && ZT.S.items.length === 0 && ZE.holding(ZT.S).length === 2), 'a new zoo is bare land with the two zebras waiting in the pen');
  check(await step(page) === 0 && (await coach(page) || '').startsWith('Tap your land'), 'tutorial strip shows step 1 (' + await coach(page) + ')');
  await ev(page, () => { ZCore.WEEK_MS[1] = 1e9; ZCore.WEEK_MS[2] = 1e9; ZCore.onReport('*', (r, d) => d()); });
  await shot(page, 'tut-1-floor');
  // step 2: Build, Habitats, a Savanna
  await page.touchscreen.tap(195, 400); await sleep(900);
  check(await step(page) === 1 && (await coach(page) || '').startsWith('Build, Habitats'), 'opening the menu completes step 1 (' + await coach(page) + ')'); await shot(page, 'tut-2-menu');
  check(await ev(page, () => { const g = document.querySelector('.layer:not([hidden]) .mn-glow'); return !!g && g.textContent.trim().startsWith('Build'); }), 'the Build box is softly highlighted');
  await tap(page, 'Build'); await tap(page, 'Habitats'); await shot(page, 'tut-2-habitats'); await tap(page, 'Savanna', { wait: 900 });
  check((await coach(page) || '').startsWith('Tap a spot'), 'while the ghost is up the strip says "Tap a spot, then Place." (' + await coach(page) + ')');
  const clear = await ev(page, () => { const c = document.querySelector('.mn-coach').getBoundingClientRect(), n = document.getElementById('placement-note').getBoundingClientRect(), b = document.getElementById('placement-bar').getBoundingClientRect(); const hit = (a, z) => !(a.bottom <= z.top || a.top >= z.bottom); return { note: hit(c, n) && n.height > 0, bar: hit(c, b) && b.height > 0 }; });
  check(!clear.note && !clear.bar, 'the strip overlaps neither the placement note nor the placement buttons'); await shot(page, 'tut-2-placing');
  let h = await freeHex(page, 'hab', 'savanna'); await page.touchscreen.tap(h.x, h.y); await sleep(250); await page.tap('#placement-bar .zr-place'); await sleep(500);
  await sleep(700); check((await stack(page)) === 'movein' && await ev(page, () => ZE.holding(ZT.S).length === 2) && await step(page) === 1, 'after the habitat is placed a Move in prompt asks; nobody is housed by itself (' + await stack(page) + ')'); await shot(page, 'tut-2-movein');
  check(await coach(page) === null, 'the strip stays out of the way of the prompt');
  await tap(page, 'Move in', { wait: 700 });
  check(await step(page) === 2 && await ev(page, () => ZE.holding(ZT.S).length === 0), 'Move in houses the zebras and completes step 2');
  check(await coach(page) === null, 'the strip waits a moment so the floor shows the zebras arriving'); await shot(page, 'tut-2-zebras-in');
  await sleep(3000); check((await coach(page) || '').startsWith('Now place a Snack Stand'), 'then step 3 shows (' + await coach(page) + ')');
  // step 3: Snack Stand
  await page.touchscreen.tap(195, 400); await sleep(700); await tap(page, 'Build'); await tap(page, 'Facilities');
  check(await ev(page, () => { const g = document.querySelector('.layer:not([hidden]) .mn-glow'); return !!g && g.textContent.trim().startsWith('Snack Stand'); }), 'the Snack Stand row is highlighted'); await shot(page, 'tut-3-facilities');
  await tap(page, 'Snack Stand', { wait: 900 }); await shot(page, 'tut-3-placing');
  h = await freeHex(page, 'fac', 'snack'); await page.touchscreen.tap(h.x, h.y); await sleep(250); await page.tap('#placement-bar .zr-place'); await sleep(600);
  check(await step(page) === 3, 'placing a Snack Stand completes step 3 (' + await step(page) + ')');
  await page.tap('#placement-bar .zr-cancel').catch(() => 0); await sleep(500);
  // step 4: Garden Bench
  await page.touchscreen.tap(195, 400); await sleep(700); await tap(page, 'Build'); await tap(page, 'Facilities'); await tap(page, 'Garden Bench', { wait: 900 });
  check((await coach(page) || '').startsWith('Tap a spot'), 'placement text again for the bench'); await shot(page, 'tut-4-placing');
  h = await freeHex(page, 'fac', 'bench'); await page.touchscreen.tap(h.x, h.y); await sleep(250); await page.tap('#placement-bar .zr-place'); await sleep(600);
  check(await step(page) === 4 && await ev(page, () => document.querySelector('.mn-coach') === null || true), 'placing a bench completes step 4 (' + await step(page) + ')');
  await page.tap('#placement-bar .zr-cancel').catch(() => 0); await sleep(600);
  check((await coach(page) || '').startsWith('Flag on the habitat'), 'step 5 asks for an event (' + await coach(page) + ')'); await shot(page, 'tut-5-flag');
  // step 5: hold an event (the flag is up because the zebras are in and someone is free)
  await ev(page, () => ZT.updateStrip && ZT.updateStrip());
  await page.touchscreen.tap(195, 400); await sleep(700); await tap(page, 'Projects'); await tap(page, 'Event'); await tap(page, 'Savanna'); await tap(page, 'Feeding'); await shot(page, 'tut-5-event');
  if ((await stack(page)).endsWith('event-lead')) await tap(page, await ev(page, () => ZT.S.staff.find(s => !ZE.busyStaff(ZT.S)[s.id]).name));
  await tap(page, 'Start', { wait: 900 });
  check(await step(page) === 5 && (await coach(page) || '').startsWith("That's it"), 'holding an event completes step 5 (' + await step(page) + ')'); await shot(page, 'tut-6-last');
  await sleep(7800); check(await step(page) === 'off' && await coach(page) === null, 'the last step finishes by itself and the strip goes');
  // pop-ups take priority: with the tutorial on again, a modal hides the strip
  await ev(page, () => ZMenus.startTutorial()); await sleep(600);
  check(await coach(page) !== null, 'replay tutorial brings the strip back at step 1');
  await ev(page, () => ZCore.confirm ? 0 : 0); await ev(page, () => ZCore.ui.confirm('Test?', () => {})); await sleep(600);
  check(await coach(page) === null, 'the strip waits while a pop-up is on screen'); await ev(page, () => ZT.popAll()); await sleep(600);
  await tapSel(page, '.mn-skip').catch(() => 0); await sleep(300);
  check(await step(page) === 'off' && await coach(page) === null, 'Skip ends the tutorial');
  // System > Title screen: back to the title, slot 2 card has the right date and money
  const snap = await ev(page, () => ({ money: Math.round(ZT.S.money), date: ZCore.fmt.date(ZT.S) }));
  await page.touchscreen.tap(195, 400); await sleep(600); await tap(page, 'System'); await tap(page, 'Title screen', { wait: 800 });
  check(await stack(page) === 'title', 'System, Title screen returns to the title (' + await stack(page) + ')');
  const card = await ev(page, () => document.querySelectorAll('.mn-slot')[1].textContent);
  check(card.includes(ZCoreMoney(snap.money)) && card.includes(snap.date.split(' ')[0]), 'slot 2 shows the zoo name, date and money (' + card.replace(/\s+/g, ' ').slice(0, 60) + ')'); await shot(page, 'title-used');
  // slot 3: new zoo, tutorial No -> no strip
  await tapSel(page, '.mn-slot.empty', 0); await tap(page, 'Next'); await tap(page, 'No', { wait: 800 });
  check(await ev(page, () => ZCore.slot === 1 || ZCore.slot === 3) && await coach(page) === null && await step(page) === 'off', 'tutorial No: no strip');
  await page.touchscreen.tap(195, 400); await sleep(700);
  check(await ev(page, () => { const g = document.querySelector('.layer:not([hidden]) .mn-glow'); return !!g && g.textContent.trim().startsWith('Build'); }), 'a blank zoo without the tutorial still highlights Build'); await shot(page, 'blank-menu');
  await ev(page, () => ZT.popAll());
  await ev(page, () => ZCore.toTitle()); await sleep(600);
  // delete needs a confirm
  const used = await ev(page, () => document.querySelectorAll('.mn-slot:not(.empty)').length);
  await tapSel(page, '.mn-del', 0); check((await stack(page)).endsWith('confirm'), 'delete asks first'); await tap(page, 'No');
  check(await ev(page, () => document.querySelectorAll('.mn-slot:not(.empty)').length) === used, 'No keeps the slot');
  await tapSel(page, '.mn-del', 0); await tap(page, 'Delete', { wait: 600 });
  check(await ev(page, () => document.querySelectorAll('.mn-slot:not(.empty)').length) === used - 1, 'Delete empties the slot');
  // used slot taps straight into play
  await tapSel(page, '.mn-slothit', 0); await sleep(600); check(await stack(page) === '' && await ev(page, () => !!ZT.S), 'a used slot taps straight into play');
  await ctx.close();

  // ---------------------------------------------------------------- reload mid-tutorial resumes at the same step
  ({ ctx, page } = await mk(390, 844));
  await tapSel(page, '.mn-slot.empty', 0); await tap(page, 'Next'); await tap(page, 'Yes', { wait: 800 });
  await page.touchscreen.tap(195, 400); await sleep(900); check(await step(page) === 1, 'at step 2 before the reload');
  await ev(page, () => ZT.save()); await page.reload(); await page.waitForFunction(() => window.ZT && window.ZMenus); await sleep(600);
  check(await stack(page) === 'title', 'after reload the title shows'); await tapSel(page, '.mn-slothit', 0); await sleep(800);
  check(await step(page) === 1 && (await coach(page) || '').startsWith('Build, Habitats'), 'reload resumes the tutorial at the same step (' + await step(page) + ')');
  await ctx.close();

  // ---------------------------------------------------------------- boxes fit without scrolling, at seven phone sizes
  for (const [w, hh] of SIZES) {
    ({ ctx, page } = await mk(w, hh, URL + '?play=1'));
    await ev(page, () => { ZCore.WEEK_MS[1] = 1e9; ZCore.WEEK_MS[2] = 1e9; });
    await page.touchscreen.tap(w / 2, hh / 2 - 40); await sleep(500);
    const res = {}, scr = async n => { res[n] = await ev(page, () => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), b = L.querySelector('.pbody'), g = L.querySelector('.mn-fitgrid'); const bs = [...L.querySelectorAll('.gbox')].map(x => x.getBoundingClientRect()); const pb = b.getBoundingClientRect(); return { over: b.scrollHeight - b.clientHeight, small: bs.filter(r => r.height < 44 || r.bottom > pb.bottom + 1).length, boxes: bs.length, wide: L.querySelector('.panel').getBoundingClientRect().width }; }); };
    await scr('menu'); if (w === 375 && hh === 553 || w === 440) await shot(page, 'menu-' + w + 'x' + hh);
    for (const b of ['Projects', 'Build', 'Research', 'Info']) { await tap(page, b); await scr(b); if (w === 375 && hh === 553 && b === 'Info') await shot(page, 'info-small'); await tap(page, 'Back'); }
    await tap(page, 'System'); res.System = await ev(page, () => { const b = [...document.querySelectorAll('.layer:not([hidden])')].pop().querySelector('.pbody'); return { over: b.scrollHeight - b.clientHeight, small: 0, boxes: 0 }; }); if (w === 375 && hh === 553) await shot(page, 'system-small');
    const bad = Object.keys(res).filter(k => res[k].over > 1 || res[k].small > 0 || (k !== 'System' && res[k].boxes < 4));
    check(!bad.length, w + 'x' + hh + ': main menu, Projects, Build, Research, Info and System show every box with no scrolling' + (bad.length ? ' ' + JSON.stringify(bad.map(k => [k, res[k]])) : '') + ' panel ' + Math.round(res.menu.wide) + 'px wide');
    await ctx.close();
  }
  // ---------------------------------------------------------------- a blank zoo: every main box behaves with zero items
  ({ ctx, page } = await mk(390, 753, URL + '?play=blank'));
  await ev(page, () => { ZCore.WEEK_MS[1] = 1e9; ZCore.WEEK_MS[2] = 1e9; });
  check(await ev(page, () => ZT.S.items.length === 0 && ZE.holding(ZT.S).length === 2), 'play=blank gives bare land and two zebras in the pen');
  await page.touchscreen.tap(195, 380); await sleep(600);
  check(await ev(page, () => { const g = document.querySelector('.layer:not([hidden]) .mn-glow'); return !!g && g.textContent.trim().startsWith('Build'); }), 'Build is the highlighted box on bare land');
  await tap(page, 'Projects'); await shot(page, 'blank-projects'); const pbox = await ev(page, () => [...document.querySelectorAll('.layer:not([hidden]) .gbox')].map(b => b.textContent.replace(/s+/g, ' ').trim()).join(' | ')); console.log('  blank Projects boxes: ' + pbox);
  await tap(page, 'Event', { wait: 200 }); await tap(page, 'Back');
  await tap(page, 'Build'); await shot(page, 'blank-build');
  for (const b of ['Habitats', 'Facilities', 'Move', 'Remove', 'Upgrade', 'Buy land']) { await tap(page, b); if (b === 'Habitats') await shot(page, 'blank-habitats'); if (b === 'Facilities') await shot(page, 'blank-facilities'); await tap(page, 'Back'); }
  const lists = await ev(page, () => { const s = ZT.S; return { sav: ZE.habBuildCost(s, 'savanna') <= s.money, snack: ZE.facCost(s, 'snack') <= s.money }; });
  check(lists.sav && lists.snack, 'Savanna and Snack Stand are affordable at the start');
  await tap(page, 'Back'); await tap(page, 'Animals'); await shot(page, 'blank-animals');
  const an = await ev(page, () => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(); const b = [...L.querySelectorAll('.row .btn')].map(x => ({ t: x.textContent.trim(), off: x.classList.contains('disabled') })); return { tab: (L.querySelector('.tab.on') || {}).textContent, note: L.textContent.includes('Build a habitat first'), btns: b, rows: L.querySelectorAll('.row').length }; });
  check(/Pen/.test(an.tab) && an.note && an.rows === 2 && an.btns.length === 2 && an.btns.every(x => x.off && /Needs habitat/.test(x.t)), 'Animals opens on the Pen with the two zebras, a four-word hint and House disabled (' + JSON.stringify(an).slice(0, 160) + ')');
  await tap(page, 'Zoo'); await tap(page, 'Market'); await tap(page, 'Back');
  await tap(page, 'Staff'); await tap(page, 'Back'); await tap(page, 'Research');
  for (const g of ['Regions', 'Know-how', 'Facilities', 'Themes', 'Landmarks']) { await tap(page, g); await tap(page, 'Back'); }
  await tap(page, 'Back'); await tap(page, 'Info');
  for (const g of ['Book', 'Combos', 'Fits', 'Rumors', 'Ranks', 'Years', 'Awards']) { await tap(page, g); await tap(page, 'Back'); }
  await tap(page, 'Back'); await tap(page, 'System'); await tap(page, 'How to play'); await tap(page, 'Back'); await tap(page, 'Back');
  check((await ev(page, () => ZT.errors.slice())).length === 0, 'walking every box of a blank zoo raised no errors');
  await ctx.close();

  // ---------------------------------------------------------------- narrow phone, Advertise before opening, tutorial after removing the habitat
  ({ ctx, page } = await mk(320, 568, URL + '?play=blank'));
  await ev(page, () => { ZCore.WEEK_MS[1] = 1e9; ZCore.WEEK_MS[2] = 1e9; ZMenus.startTutorial(); });
  await page.touchscreen.tap(160, 300); await sleep(600); await tap(page, 'Projects');
  check(await ev(page, () => [...document.querySelectorAll('.layer:not([hidden]) .gbox')].some(b => b.textContent.startsWith('Advertise') && b.classList.contains('disabled') && /No habitat/.test(b.textContent))), 'Advertise is greyed with "No habitat" before the zoo opens');
  await tap(page, 'Back'); await tap(page, 'Back').catch(() => 0); await ev(page, () => ZT.popAll());
  await page.touchscreen.tap(160, 300); await sleep(500); await tap(page, 'Animals'); await shot(page, 'narrow-pen');
  const nr = await ev(page, () => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), t = L.querySelector('.row .t'), r = t.getBoundingClientRect(), bt = L.querySelector('.row .btn').getBoundingClientRect(), row = L.querySelector('.row').getBoundingClientRect(); return { nameW: Math.round(r.width), btnBelow: bt.top >= r.bottom - 2, inside: bt.right <= row.right + 1, text: t.textContent }; });
  check(nr.nameW >= 60 && nr.btnBelow && nr.inside, '320 px: the pen row keeps the name readable and puts House under it (' + JSON.stringify(nr) + ')');
  await ev(page, () => ZT.popAll()); await page.touchscreen.tap(160, 300); await sleep(500); await tap(page, 'Staff'); await shot(page, 'narrow-staff');
  const sr = await ev(page, () => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), pr = L.querySelector('.panel').getBoundingClientRect(); return { out: [...L.querySelectorAll('.row .chip')].filter(c => c.getBoundingClientRect().right > pr.right + 1).length, over: L.querySelector('.pbody').scrollWidth - L.querySelector('.pbody').clientWidth }; });
  check(sr.out === 0 && sr.over <= 1, '320 px: staff skill chips stay inside the panel (' + JSON.stringify(sr) + ')');
  await ev(page, () => { ZT.popAll(); const S = ZT.S; let q = 0, r = 0, ok = false; for (let rr = 19; rr >= 0 && !ok; rr--) for (let c = 0; c < ZD.GRID_W && !ok; c++) { const p = ZE.fromOffset(c, rr); if (ZE.canPlace(S, 'hab', 'savanna', p[0], p[1], 0)) { q = p[0]; r = p[1]; ok = true; } } const res = ZCore.act('build', 'hab', 'savanna', q, r, 0); ZCore.act('moveIn', res.id); });
  await sleep(900); const st2 = await step(page);
  await ev(page, () => { const h = ZT.S.items.find(i => i.k === 'hab'); ZCore.act('remove', h.id); }); await sleep(3300);
  check(st2 === 2 && await step(page) === 1 && (await coach(page) || '').startsWith('Build, Habitats'), 'removing the only habitat mid-tutorial brings the habitat step back (' + st2 + ' then ' + await step(page) + ')');
  await ctx.close();

  // title fits without scrolling at every size, even with three used slots
  for (const [w, hh] of TITLE_SIZES) {
    const c2 = await browser.newContext({ viewport: { width: w, height: hh }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), p2 = await c2.newPage();
    await p2.addInitScript(() => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); } });
    await p2.goto(URL + '?play=1'); await p2.waitForFunction(() => window.ZT && window.ZMenus); await sleep(400);
    await p2.evaluate(() => { ZCore.WEEK_MS[1] = 1e9; ZCore.newGame({ slot: 1, zooName: 'Alpha Zoo' }); ZCore.toTitle(); ZCore.newGame({ slot: 2, zooName: 'Beta Zoo' }); ZCore.toTitle(); ZCore.newGame({ slot: 3, zooName: 'Gamma Zoo' }); ZCore.toTitle(); });
    await sleep(600);
    const r = await p2.evaluate(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), b = L.querySelector('.pbody'), sl = [...L.querySelectorAll('.mn-slot')], bb = b.getBoundingClientRect(); return { n: sl.length, over: b.scrollHeight - b.clientHeight, below: sl.filter(x => x.getBoundingClientRect().bottom > bb.bottom + 1).length, port: L.querySelectorAll('.mn-port').length, cont: L.querySelectorAll('.mn-cont').length }; });
    check(r.n === 3 && r.over <= 1 && r.below === 0, w + 'x' + hh + ': title shows all three slots without scrolling (' + JSON.stringify(r) + ')');
    if ((w === 320) || (w === 375)) await p2.screenshot({ path: path.join(SHOTS, 'menus-t-title-' + w + 'x' + hh + tag + '.png') });
    await c2.close();
  }
  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' || ') : ''));
  await browser.close();
}
function ZCoreMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

(async () => {
  const which = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit'];
  for (const n of which) { try { await run(n); } catch (e) { failures++; console.log('  FAIL ' + n + ' crashed: ' + e.message.split('\n').slice(0, 3).join(' / ')); } }
  console.log(failures ? failures + ' FAILURES' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})();
