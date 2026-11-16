/* Tester round 2: years 2 to 4. Weeks pass with ZT.tick (waiting only); every decision is a real tap.
   Usage: node test/tester-years.js [chromium|webkit] [years=3]. Headless only. About 5 minutes. */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
const YEARS = +(process.argv[3] || 3);
(async () => {
  const T = await L.launch(engine, { width: 390, height: 844 }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-y' });
  const page = T.page; await T.goto();
  const st = () => T.state(); const inv = (l, o) => L.invariants(T, l, o); const say = (...a) => console.log(...a);
  await page.evaluate(() => { ZCore.WEEK_MS[1] = 600000; ZCore.WEEK_MS[2] = 600000; });
  const seen = new Set(); const popups = []; let choiceN = 0;
  async function shotOnce(k, tag) { if (seen.has(k)) return; seen.add(k); await T.shot(tag); }
  const toFloor = () => L.toFloor(T, 195, 440); const E = L.edit(T); let placeN = 0;
  async function menu() { await toFloor(); await T.tapXY(195, 420); }
  const drainX = L.makeDrain(T, { maxCrates: 1, shot: async (id, txt, wk) => { await shotOnce('p-' + id + '-' + Math.floor(wk / 48), 'p-' + id + '-y' + (1 + Math.floor(wk / 48))); } });
  const drain = () => drainX();
  async function through(startRe, pre) {
    for (let i = 0; i < 6; i++) {
      const has = await T.locate(startRe, { sel: 'button, .btn' }); if (has && !/Back|Play/.test(has.text)) { await inv(pre + ' confirm'); return true; }
      const d = await describe(T); await shotOnce(pre + '-' + d.id, 'y-' + pre + '-' + i); await inv(pre + ' step ' + i);
      const nx = await T.locate(/^Next/, { sel: 'button, .btn' }); if (nx && !/pick/i.test(nx.text)) { await T.tapText(/^Next/, { sel: 'button, .btn' }); continue; }
      if (!(await T.tapText(/./, { sel: '.row.tappable' }))) return false;
    }
    return false;
  }
  const num = f => page.evaluate(f);
  async function startProject(kind, startRe) { const t0 = T.taps; await menu(); if (!(await T.tapText('Projects'))) { await toFloor(); return false; } if (!(await T.tapText(kind))) { await toFloor(); return false; }
    const n0 = await num(() => ZT.S.projects.length); const ok = await through(startRe, kind); if (ok) await T.tapText(startRe, { sel: 'button, .btn', wait: 600 }); const n1 = await num(() => ZT.S.projects.length);
    await drain(); await toFloor(); if (n1 <= n0) { say('   ' + kind + ' not started (' + (ok ? 'refused' : 'no start button') + ')'); return false; } return T.taps - t0; }
  async function placeAt(group) { // Update 7: Edit > symbol tab > a card that is not greyed, tap a free legal hex, Place, Done ('hab' = habitats, 'fac' = any building group)
    const t0 = T.taps; if (!(await E.open(195, 420))) { T.find('edit:no-open', 'Edit mode did not open from the menu'); await toFloor(); return false; }
    let b = await E.bar(); const keys = [];
    for (const g of (group === 'hab' ? ['hab'] : b.tabs.filter(x => x !== 'hab'))) { await L.tapSel(T, '#edit-bar .mn-et[data-grp="' + g + '"]', 350); const bb = await E.bar(); keys.push(...bb.cards.filter(c => !c.endsWith('!') && c.startsWith(group === 'hab' ? 'hab:' : 'fac:'))); await shotOnce('edit-' + g + '-' + Math.floor((await st()).week / 48), 'y-edit-' + g + '-y' + (1 + Math.floor((await st()).week / 48))); await inv('edit strip ' + g); if (bb.small.length) T.find('edit:small:' + g, 'Edit strip buttons under 44 px in group ' + g + ': ' + bb.small.join('; ')); if (bb.vScroll > 1) T.find('edit:vscroll:' + g, 'the Edit strip scrolls up and down in group ' + g); if (bb.below.length) T.find('edit:below:' + g, 'Edit strip buttons under the bottom inset: ' + bb.below.join('; ')); }
    if (!keys.length) { await toFloor(); return false; }
    const key = keys[placeN++ % keys.length];
    const r = await E.add(key, { before: async () => { await inv('placement ' + group); } }); if (!r.ok) say('   ' + key + ' not placed: ' + r.why); await drain();
    await toFloor(); await inv('after place', { expectClosed: true }); return r.ok ? (T.taps - t0) + ' (' + key + ')' : false;
  }
  async function simpleFlow(label, path, confirmRe) { await menu(); for (const p of path) { if (!(await T.tapText(p, { wait: 350 }))) { await toFloor(); return false; } } if (confirmRe) await T.tapText(confirmRe, { wait: 500 }); await drain(); await toFloor(); return true; }

  const log = [];
  const total = YEARS * 48 + 1;
  let lastYr = 0; let building = 0;
  for (let w = 0; w < total; w++) {
        // tick one week (waiting only)
    await page.evaluate(() => ZT.tick(1)); await drain();
    const s = await st(); const yr = Math.floor(s.week / 48);
    if (yr !== lastYr) { // a year ended: screenshot the floor and strip
      lastYr = yr; await toFloor(); await T.shot('yearstart-y' + (yr + 1)); await inv('year ' + (yr + 1) + ' start', { expectClosed: true });
      const m = await page.evaluate(() => ({ strip: document.getElementById('strip').innerText.replace(/\n/g, ' '), sw: document.getElementById('strip').scrollWidth, cw: document.getElementById('strip').clientWidth, habs: ZT.S.items.filter(i => i.k === 'hab').length, facs: ZT.S.items.filter(i => i.k === 'fac').length, animals: ZT.S.animals.length, staff: ZT.S.staff.length, rank: ZT.S.rank, money: Math.round(ZT.S.money), rows: ZT.S.rows }));
      say('== start of year', yr + 1, JSON.stringify(m)); if (m.sw > m.cw + 1) T.find('strip:overflow:' + yr, 'top strip overflows at year ' + (yr + 1) + ': ' + m.strip);
      log.push(m);
    }
    const wk = s.week % 48;
    if (wk % 4 !== 1) continue;   // act every fourth week
    const money = s.money; const icons = await page.evaluate(() => ZRender.debug().icons);
    const ready = k => Object.values(icons).some(a => a.includes(k));
    const run = await num(() => ZT.S.projects.map(p => p.type));
    if (!run.includes('expedition') && money > 4000 && await startProject('Expedition', /^Send/)) say(' w' + s.week, 'expedition started');
    else if (ready('ready-event') && !run.includes('event') && money > 600 && await startProject('Event', /^Start/)) say(' w' + s.week, 'event started');
    else if (ready('ready-breed') && !run.includes('breed') && await startProject('Breeding', /^Start/)) say(' w' + s.week, 'breeding started');
    else if (building < 40 && money > 30000 && (await num(() => ZT.S.items.filter(i => i.k === 'hab').length)) < 9) { const t = await placeAt('hab'); if (t) { say(' w' + s.week, 'habitat built, taps', t); building++; } }
    else if (money > 3000 && (await num(() => ZT.S.items.filter(i => i.k === 'fac').length)) < 14) { const t = await placeAt('fac'); if (t) say(' w' + s.week, 'facility built, taps', t); }
    // housing: anything in the pen? use one-tap House all
    if (await num(() => ZT.S.animals.some(a => a.hab == null))) { await menu(); await T.tapText('Animals'); await T.tapText(/^Pen/); await shotOnce('pen-filled', 'y-pen-filled'); await inv('pen with animals'); await T.tapText(/^House/, { wait: 500 }); await toFloor(); say(' w' + s.week, 'house tapped'); }
    // buy land when affordable
    if (money > 90000 && w % 12 === 1) { const rows0 = await num(() => ZT.S.rows); if (await E.open(195, 420)) { const c = await E.card('land'); if (c.found && !c.off) { await sleep(300); await shotOnce('land', 'y-land'); await inv('buy land'); await T.tapText(/^(Buy|Yes|Confirm)/i, { wait: 500 }); const rows1 = await num(() => ZT.S.rows); say(' w' + s.week, 'more land: rows', rows0, '->', rows1); if (rows1 <= rows0) T.find('land:not-bought', 'the More land card was not greyed but tapping it and confirming bought no land (rows ' + rows0 + ')'); } } await drain(); await toFloor(); }
    // hire / research / upgrade now and then
    if (w % 24 === 13) { await menu(); await T.tapText('Research'); await shotOnce('res', 'y-research'); await inv('research'); await toFloor(); }
    if (w % 30 === 20) { await menu(); await T.tapText('Animals'); await T.tapText(/^Zoo/); await shotOnce('zoo-' + yr, 'y-zoo-list-y' + (yr + 1)); await inv('zoo list y' + (yr + 1)); await toFloor(); await menu(); await T.tapText('Info'); await T.tapText('Ranks'); await shotOnce('ranks-' + yr, 'y-ranks-y' + (yr + 1)); await inv('ranks'); await toFloor(); }
    if (w % 40 === 7) { await menu(); await T.tapText('Staff'); await shotOnce('staff-' + yr, 'y-staff-y' + (yr + 1)); await inv('staff list y' + (yr + 1)); await toFloor(); }
    await inv('week ' + s.week, { expectClosed: true });
  }
  await toFloor(); await T.shot('floor-end');
  const sum = await page.evaluate(() => ({ week: ZT.S.week, money: Math.round(ZT.S.money), habs: ZT.S.items.filter(i => i.k === 'hab').length, facs: ZT.S.items.filter(i => i.k === 'fac').length, animals: ZT.S.animals.length, staff: ZT.S.staff.length, did: ZT.S.did, errors: ZT.errors }));
  say('SUMMARY', JSON.stringify(sum)); say('popups', JSON.stringify(Object.entries((drainX.stats.popups).reduce((a, p) => { const k = p.split('@')[0]; a[k] = (a[k] || 0) + 1; return a; }, {}))));
  say('FINDINGS (' + T.findings.length + ')'); T.findings.forEach((f, i) => say(' ' + (i + 1) + '. ' + f.msg)); say('console', JSON.stringify(T.consoleErrors));
  await T.browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
