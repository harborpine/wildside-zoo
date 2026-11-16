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
  const toFloor = () => L.toFloor(T, 195, 440); const E = L.edit(T);
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
  /* Update 7: Upgrade, Move and Remove are no longer screens under Build. Each is now: Edit (main menu) > tap the thing on the map > the button in the strip. */
  // ---- Upgrade (Edit > tap the habitat > Upgrade) ----
  say('== upgrade');
  { const t0 = T.taps; const lv0 = await page.evaluate(() => ZT.S.items.filter(i => i.k === 'hab').map(i => i.lvl)); const hid = await page.evaluate(() => ZT.S.items.find(i => i.k === 'hab').id);
    if (!(await E.open(195, 420))) T.find('upgrade:no-edit', 'Edit mode did not open from the menu'); const picked = await E.pick(hid); let b = await E.bar(); say('   [x-upgrade] picked habitat', picked, 'actions', JSON.stringify(b && b.acts), '::', b && b.actText); await T.shot('x-upgrade'); await inv('edit: habitat picked'); await L.audit(T, 'edit: habitat picked');
    if (!picked) T.find('upgrade:no-pick', 'tapping the habitat on the map in Edit mode did not select it'); if (b && !b.acts.some(a => /^Upgrade/.test(a))) T.find('upgrade:no-button', 'a picked habitat has no Upgrade button (' + b.acts.join(', ') + ')'); if (b && b.small.length) T.find('upgrade:small', 'picked-habitat buttons under 44 px: ' + b.small.join('; '));
    const m0 = await page.evaluate(() => Math.round(ZT.S.money)); await L.tapSel(T, '#edit-bar .mn-eact .mn-up', 600); if ((await st()).stack.length) { await show('x-upgrade-confirm'); await T.tapText(/^(Upgrade|Yes|Confirm)/i, { wait: 500 }); } await sleep(400);
    const lv1 = await page.evaluate(() => ZT.S.items.filter(i => i.k === 'hab').map(i => i.lvl)); say('upgrade: levels', JSON.stringify(lv0), '->', JSON.stringify(lv1), 'money', m0, '->', await page.evaluate(() => Math.round(ZT.S.money)), 'taps', T.taps - t0); if (JSON.stringify(lv0) === JSON.stringify(lv1)) T.find('upgrade:nothing', 'Upgrade in the Edit strip did not raise the habitat level'); await T.shot('x-upgrade-after'); await inv('after upgrade tap');
    for (let i = 0; i < 3 && (await st()).stack.length; i++) { await show('x-upgrade-popup-' + i); if (!(await T.tapText(/^(Not now|Move in)/, { sel: 'button, .btn', wait: 500 }))) await T.tapText(/./, { sel: '.back' }); }
    await toFloor(); await inv('after upgrade', { expectClosed: true }); }

  // ---- Move (Edit > tap the building > Move > tap a spot > Place) ----
  say('== move');
  { const t0 = T.taps; const pos0 = await page.evaluate(() => ZT.S.items.map(i => i.id + ':' + i.q + ',' + i.r).join(' ')); const fac = await page.evaluate(() => { const i = ZT.S.items.find(i => i.k === 'fac'); return i && { id: i.id, t: i.t }; });
    await E.open(195, 420); const picked = fac && await E.pick(fac.id); let b = await E.bar(); say('   [x-move-list] picked', JSON.stringify(fac), picked, 'actions', JSON.stringify(b && b.acts)); await T.shot('x-move-list'); await inv('edit: building picked'); await L.audit(T, 'edit: building picked');
    if (!picked) T.find('move:no-pick', 'tapping a building on the map in Edit mode did not select it'); if (b && !b.acts.includes('Move')) T.find('move:no-button', 'a picked building has no Move button (' + b.acts.join(', ') + ')'); if (b && b.acts.some(a => /^Upgrade/.test(a))) T.find('move:upgrade-on-fac', 'a picked building offers Upgrade');
    await L.tapSel(T, '#edit-bar .mn-ea.move', 700);
    const s = await st(); say('move: placing', s.placing, 'stack', s.stack.join('>')); if (!s.placing) T.find('move:not-placing', 'Move did not start placement');
    if (s.placing) { await T.shot('x-move-place'); await inv('move placing');
      const c = await E.spot('fac', fac.t, { ignoreId: fac.id, nth: 3 });
      if (c) await T.tapXY(c.x, c.y, 400); await T.shot('x-move-ghost'); await T.tapText(/^Place/, { floor: true, sel: '#placement-bar button', wait: 700 }); }
    const s2 = await st(); say('after Place: placing', s2.placing, 'editing', s2.editing, 'stack', s2.stack.join('>')); if (!s2.editing) T.find('move:edit-ended', 'Edit mode ended by itself after a Move');
    const pos1 = await page.evaluate(() => ZT.S.items.map(i => i.id + ':' + i.q + ',' + i.r).join(' ')); say('move: changed', pos0 !== pos1, 'taps', T.taps - t0); if (pos0 === pos1) T.find('move:nothing', 'Move > Place did not move the building');
    await toFloor(); await inv('after move', { expectClosed: true }); }

  // ---- Remove, now Sell (Edit > tap the building > Sell > asks once) ----
  say('== remove');
  { const t0 = T.taps; const n0 = await page.evaluate(() => ZT.S.items.length); const fac = await page.evaluate(() => { const i = ZT.S.items.find(i => i.k === 'fac'); return i && { id: i.id, t: i.t, half: Math.floor(ZD.FAC[i.t].cost / 2) }; });
    await E.open(195, 420); const picked = fac && await E.pick(fac.id); let b = await E.bar(); say('   [x-remove-list] picked', JSON.stringify(fac), picked, 'actions', JSON.stringify(b && b.acts), '::', b && b.actText); await T.shot('x-remove-list');
    if (b && !b.acts.includes('Sell')) T.find('remove:no-button', 'a picked building has no Sell button (' + b.acts.join(', ') + ')');
    const m0 = await page.evaluate(() => Math.round(ZT.S.money)); await L.tapSel(T, '#edit-bar .mn-ea.sell', 500); const sc = await st(); if (!sc.stack.length) T.find('remove:no-confirm', 'Sell did not ask before selling'); if ((await page.evaluate(() => ZT.S.items.length)) !== n0) T.find('remove:before-confirm', 'the building was sold before the question was answered'); await show('x-remove-confirm'); await L.audit(T, 'sell confirm');
    await T.tapText(/^(Remove|Yes|Confirm|Sell)/i, { wait: 500 }); await sleep(400);
    const n1 = await page.evaluate(() => ZT.S.items.length), m1 = await page.evaluate(() => Math.round(ZT.S.money)); say('remove: items', n0, '->', n1, 'money', m0, '->', m1, '(half price would be +' + (fac && fac.half) + ')', 'taps', T.taps - t0); if (n1 !== n0 - 1) T.find('remove:nothing', 'Sell > yes did not remove the building'); if (m1 <= m0) T.find('remove:no-money', 'selling a building gave no money back (' + m0 + ' -> ' + m1 + ')');
    if ((await st()).stack.length) T.find('remove:asked-twice', 'after answering the Sell question another screen is open: ' + (await st()).stack.join('>')); await T.shot('x-remove-after'); await inv('after remove tap'); await toFloor(); await inv('after remove', { expectClosed: true }); }

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
