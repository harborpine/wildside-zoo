/* Tester round 2: flows not covered by the first-year playthrough, driven by real taps.
   ZT.tick and direct state edits are used ONLY to set the scene (age the zoo, hand over money); every action is a tap.
   Usage: node test/tester-extra.js [chromium|webkit]. Headless only. */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
(async () => {
  const T = await L.launch(engine, { width: 390, height: 844 }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-x' });
  const page = T.page; await T.goto();
  const st = () => T.state();
  const inv = (l, o) => L.invariants(T, l, o);
  const say = (...a) => console.log(...a);
  const frozen = () => page.evaluate(() => { ZCore.WEEK_MS[1] = 600000; ZCore.WEEK_MS[2] = 600000; });
  await frozen();
  const tick = n => page.evaluate(n => { ZCore.onReport('*', (r, d) => d()); ZT.tick(n); ZT.S.reports.length = 0; ZT.S.happening = null; ZT.popAll(); }, n);
  async function toFloor() { for (let i = 0; i < 8; i++) { const s = await st(); if (!s.stack.length && !s.placing) return; if (s.placing) { await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button' }); continue; } if (!(await T.tapText(/./, { sel: '.back' }))) await T.tapXY(195, 440); } }
  async function menu() { await toFloor(); await T.tapXY(195, 420); }
  async function show(name) { const d = await describe(T); say('   [' + name + '] ' + d.id + ' :: ' + (d.text || '').slice(0, 200) + ' :: ' + JSON.stringify(d.items).slice(0, 200)); await T.shot(name); await inv(name); return d; }
  // scene: a mid-size zoo
  await tick(40);
  await page.evaluate(() => { ZT.S.money = 300000; ZT.S.rp = 500; });
  say('scene: week', await page.evaluate(() => ZT.S.week), 'callers', JSON.stringify(await page.evaluate(() => ZE.callersHere(ZT.S).map(c => c.kind))), 'staff', await page.evaluate(() => ZT.S.staff.length));

  // ---- Mystery crate ----
  say('== crate');
  let ci = await page.evaluate(() => ZE.crateInfo(ZT.S)); say('crateInfo', JSON.stringify(ci && { cost: ci.cost }));
  if (!ci) { for (let i = 0; i < 15 && !ci; i++) { await tick(1); ci = await page.evaluate(() => ZE.crateInfo(ZT.S)); } say('after waiting, crate', !!ci); }
  { const t0 = T.taps; await menu(); await T.tapText('Animals'); await T.tapText(/^Market/); await show('x-market');
    const n0 = await page.evaluate(() => ZT.S.animals.length);
    if (await T.tapText(/\d\/\d/, { sel: '.row', wait: 400 })) { await show('x-crate'); await T.tapText(/^Open/, { wait: 500 }); await sleep(1500); await show('x-crate-reveal1'); await sleep(2500); await show('x-crate-reveal2');
      { const dr = L.makeDrain(T, { maxCrates: 0 }); await sleep(800); await show('x-crate-decision'); await dr(); say('   crate flow decisions:', JSON.stringify({ ...dr.stats, popups: undefined })); }
      say('crate: animals', n0, '->', await page.evaluate(() => ZT.S.animals.length), 'taps', T.taps - t0); }
    else T.find('crate:no-row', 'no Mystery crate row on the Market tab'); await toFloor(); await inv('after crate', { expectClosed: true }); }

  // ---- Headhunter ----
  say('== headhunter');
  { let hh = await page.evaluate(() => ZE.callersHere(ZT.S).some(c => c.kind === 'headhunter' ));
    for (let i = 0; i < 30 && !hh; i++) { await tick(1); hh = await page.evaluate(() => !!(ZT.S.headhunt)); }
    say('headhunter present', hh, 'staff room', await page.evaluate(() => ZT.S.staff.length));
    const t0 = T.taps; await menu(); await T.tapText('Staff'); const d = await show('x-staff'); const n0 = await page.evaluate(() => ZT.S.staff.length);
    const r = await T.tapText(/^Hire \$/, { sel: 'button, .btn', nth: 0, wait: 500 }); await sleep(500); await show('x-hh-after');
    const s = await st(); if (s.stack.length && /^mo-|confirm/.test(s.stack.slice(-1)[0])) { await show('x-hh-open'); await T.tapText(/^Hire/, { sel: 'button, .btn', wait: 600 }); }
    say('headhunter: staff', n0, '->', await page.evaluate(() => ZT.S.staff.length), 'taps', T.taps - t0); await toFloor(); await inv('after hh', { expectClosed: true }); }

  // ---- Upgrade ----
  say('== upgrade');
  { const t0 = T.taps; const lv0 = await page.evaluate(() => ZT.S.items.filter(i => i.k === 'hab').map(i => i.lvl)); await menu(); await T.tapText('Build'); await T.tapText('Upgrade'); await show('x-upgrade');
    await T.tapText(/./, { sel: '.row.tappable', nth: 0, wait: 400 }); await show('x-upgrade-confirm'); await T.tapText(/^(Upgrade|Yes|Confirm)/i, { wait: 500 }); await sleep(400);
    say('upgrade: levels', JSON.stringify(lv0), '->', JSON.stringify(await page.evaluate(() => ZT.S.items.filter(i => i.k === 'hab').map(i => i.lvl))), 'taps', T.taps - t0); await show('x-upgrade-after'); await toFloor(); await inv('after upgrade', { expectClosed: true }); }

  // ---- Move ----
  say('== move');
  { const t0 = T.taps; const pos0 = await page.evaluate(() => ZT.S.items.map(i => i.id + ':' + i.q + ',' + i.r).join(' ')); await menu(); await T.tapText('Build'); await T.tapText('Move'); await show('x-move-list');
    const fac = await T.tapText(/Snack|Bench|Restroom|Stand/, { sel: '.row', wait: 500 }) || await T.tapText(/./, { sel: '.row.tappable', nth: 0, wait: 500 });
    const s = await st(); say('move: placing', s.placing, 'stack', s.stack.join('>'));
    if (s.placing) { await T.shot('x-move-place'); await inv('move placing');
      const c = await page.evaluate(() => { const S = ZT.S, id = ZRender.debug().placement; const it = S.items.find(i => i.k === 'fac'); for (let r = 8; r < 20; r++) for (let q = -10; q < 12; q++) { if (!ZE.inGrid(q, r) || !ZE.inLand(S, q, r)) continue; const p = ZRender.hexToClient(q, r); if (p && p.x > 40 && p.x < 350 && p.y > 100 && p.y < 560 && ZE.canPlace(S, 'fac', it.t, q, r, 0, it.id)) return { x: p.x, y: p.y }; } return null; });
      if (c) await T.tapXY(c.x, c.y, 400); await T.shot('x-move-ghost'); await T.tapText(/^Place/, { floor: true, sel: '#placement-bar button', wait: 700 }); }
    const s2 = await st(); say('after Place: placing', s2.placing, 'stack', s2.stack.join('>'));
    const pos1 = await page.evaluate(() => ZT.S.items.map(i => i.id + ':' + i.q + ',' + i.r).join(' ')); say('move: changed', pos0 !== pos1, 'taps', T.taps - t0);
    await toFloor(); await inv('after move', { expectClosed: true }); }

  // ---- Remove ----
  say('== remove');
  { const t0 = T.taps; const n0 = await page.evaluate(() => ZT.S.items.length); await menu(); await T.tapText('Build'); await T.tapText('Remove'); await show('x-remove-list');
    await T.tapText(/Restroom|Snack|Bench|Stand/, { sel: '.row', wait: 400 }) || await T.tapText(/./, { sel: '.row.tappable', nth: 0, wait: 400 }); await show('x-remove-confirm');
    await T.tapText(/^(Remove|Yes|Confirm|Sell)/i, { wait: 500 }); await sleep(400);
    say('remove: items', n0, '->', await page.evaluate(() => ZT.S.items.length), 'taps', T.taps - t0); await show('x-remove-after'); await toFloor(); await inv('after remove', { expectClosed: true }); }

  // ---- Winter Show ----
  say('== winter show');
  { let open = await page.evaluate(() => !!ZT.S.show);
    for (let i = 0; i < 60 && !open; i++) { await page.evaluate(() => { ZT.S.reports.length = 0; }); await page.evaluate(() => { ZCore.onReport('*', (r, d) => d()); ZT.tick(1); }); open = await page.evaluate(() => !!ZT.S.show); }
    say('show open', open, 'week', await page.evaluate(() => ZT.S.week));
    // the picker report was swallowed by the skip handler: find the way back through the menu, as a player who said "Not now"
    await page.evaluate(() => { ZT.S.reports.length = 0; ZT.popAll(); ZCore.onReport('*', null); }); await toFloor();
    const t0 = T.taps; await menu(); await T.tapText('Projects'); const d = await show('x-projects-show'); say('Projects mentions the show:', /Show|Animal Show|Winter/i.test(d.text));
    if (!(await T.tapText(/Show/i, { sel: '.row, .btn, button', wait: 600 }))) T.find('show:no-way-back', 'after missing the Winter Show picker there is no row in Projects to enter it');
    await sleep(600); const d2 = await show('x-show-picker');
    await T.tapText(/./, { sel: '.row.tappable', nth: 0, wait: 500 }); await show('x-show-confirm');
    await T.tapText(/^(Enter|Yes|Confirm)/i, { wait: 600 }); await sleep(1500); say('after Enter: stack', (await st()).stack.join('>'), 'reports', JSON.stringify(await page.evaluate(() => ZT.S.reports.map(r => r.type))), 'log', JSON.stringify(await page.evaluate(() => ZT.S.fx && 0)));
    for (let i = 0; i < 6; i++) { const s = await st(); if (!s.stack.length) break; await show('x-show-result-' + i); await T.tapXY(195, 440, 900); }
    say('show open now', await page.evaluate(() => !!ZT.S.show), 'taps', T.taps - t0); await toFloor(); await inv('after show', { expectClosed: true }); }

  say('FINDINGS', JSON.stringify(T.findings.map(f => f.msg), null, 1)); say('console', JSON.stringify(T.consoleErrors), 'ZT.errors', JSON.stringify(await page.evaluate(() => ZT.errors)));
  await T.browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
