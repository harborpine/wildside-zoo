/* Tester round 4: the new opening (bare land + placing tutorial) by touch on a clean profile, then a full first year on the real clock.
   Usage: node test/tester-first5.js [chromium|webkit] [width=390] [height=753] [open|full]
   open = opening and tutorial only; full = also play on to the year-end screen at speed 2. Headless only. */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
const W = +(process.argv[3] || 390), H = +(process.argv[4] || 753), MODE = process.argv[5] || 'open';
(async () => {
  const T = await L.launch(engine, { width: W, height: H }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-f5-' + W + 'x' + H });
  const page = T.page; const say = (...a) => console.log(...a); const st = () => T.state(); const inv = (l, o) => L.invariants(T, l, o);
  const seen = new Set(); let n = 0; const startMs = Date.now();
  async function snap(name) { n++; await T.shot(String(n).padStart(2, '0') + '-' + String(name).replace(/[^a-z0-9-]+/gi, '_')); }
  async function shotOnce(k) { if (seen.has(k)) return; seen.add(k); await snap(k); }
  async function show(name, o) { const d = await describe(T); say('   [' + name + '] ' + (d.id || 'floor') + ' :: ' + (d.text || '').slice(0, 200) + ' :: ' + JSON.stringify(d.items || []).slice(0, 160)); await snap(name); await inv(name, o); return d; }
  const coach = () => page.evaluate(() => { const c = document.querySelector('.mn-coach'); if (!c) return null; const r = c.getBoundingClientRect(); const sk = c.querySelector('.mn-skip'); const sr = sk && sk.getBoundingClientRect(); return { text: c.querySelector('.mn-ct').textContent, step: c.dataset.step, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), skipH: sr ? Math.round(sr.height) : 0, skipW: sr ? Math.round(sr.width) : 0, inpanel: c.classList.contains('inpanel') }; });
  const overlaps = (a, b) => a && b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  const rectOf = id => page.evaluate(id => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null; }, id);
  async function toFloor() { for (let i = 0; i < 8; i++) { const s = await st(); if (!s.stack.length && !s.placing) return; if (s.placing) { await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button' }); continue; } if (!(await T.tapText(/./, { sel: '.back' }))) await T.tapXY(Math.round(W / 2), Math.round(H * 0.6)); } }
  const free = () => ({ x: Math.round(W / 2), y: Math.round(H * 0.6) });
  async function menu() { await toFloor(); const f = free(); await T.tapXY(f.x, f.y, 450); }
  const popups = []; const seenPop = new Set();
  const drainX = L.makeDrain(T, { maxCrates: 2, shot: async (id, txt, wk) => { const k = id + '|' + txt.slice(0, 40); if (!seenPop.has(k) && seenPop.size < 160) { seenPop.add(k); popups.push(id + '@' + wk); const c = await coach(); if (c) say('   (pop-up ' + id + ' arrived while tutorial step ' + c.step + ' was showing)'); await snap('pop-' + id + '-w' + wk); } } });
  const drain = () => drainX();
  async function through(startRe, pre) {
    for (let i = 0; i < 7; i++) {
      const has = await T.locate(startRe, { sel: 'button, .btn' }); if (has && !/Back|Play/.test(has.text)) { await inv(pre + ' confirm'); return true; }
      const d = await describe(T); await shotOnce(pre + '-' + d.id); await inv(pre + ' step ' + i);
      const nx = await T.locate(/^Next/, { sel: 'button, .btn' }); if (nx && !/pick/i.test(nx.text)) { await T.tapText(/^Next/, { sel: 'button, .btn' }); continue; }
      if (!(await T.tapText(/./, { sel: '.row.tappable' }))) return false;
    }
    return false;
  }
  async function startProject(kind, startRe) { await menu(); if (!(await T.tapText('Projects'))) { await toFloor(); return false; } if (!(await T.tapText(kind))) { await toFloor(); return false; }
    const n0 = await page.evaluate(() => ZT.S.projects.length); const ok = await through(startRe, kind); if (ok) await T.tapText(startRe, { sel: 'button, .btn', wait: 600 }); const n1 = await page.evaluate(() => ZT.S.projects.length);
    await drain(); await toFloor(); return n1 > n0; }

  // ================= A. THE OPENING =================
  await T.goto(process.env.Q || ''); await sleep(1200);
  say('== TITLE at ' + W + 'x' + H + ' ' + engine); await show('title');
  say('== NEW ZOO'); await T.tapText(/^1/, { sel: 'button', wait: 500 }); await show('name');
  await T.tapText(/^Next/, { sel: 'button, .btn', wait: 600 }); await show('tutorial-question');
  await T.tapText(/^Yes/, { sel: 'button, .btn', wait: 1000 });
  const tapsAtStart = T.taps;
  const s0 = await page.evaluate(() => ({ items: ZT.S.items.length, pen: ZT.S.animals.filter(a => a.hab == null).length, animals: ZT.S.animals.length, money: Math.round(ZT.S.money), open: ZE.isOpen(ZT.S), staff: ZT.S.staff.length, tut: ZT.S.ui.tutorial, speed: ZCore.speed, week: ZT.S.week, rows: ZT.S.rows }));
  say('   state at start:', JSON.stringify(s0));
  if (s0.items !== 0) T.find('bare:items', 'new zoo is not bare: ' + s0.items + ' items'); if (s0.open) T.find('bare:open', 'zoo reports open with no habitat'); if (s0.money !== 26500) T.find('bare:money', 'start money is ' + s0.money + ', expected 26500'); if (s0.pen !== 2) T.find('bare:pen', 'pen has ' + s0.pen + ' animals, expected 2');
  const sprites = await page.evaluate(() => { const d = ZRender.debug(); return { animals: d.animals, visitors: d.visitors, staff: d.staff, icons: d.icons }; }); say('   floor actors on bare land:', JSON.stringify(sprites));
  await snap('bare-land'); await inv('bare land');
  say('   strip/news:', await page.evaluate(() => document.getElementById('strip').innerText.replace(/\n/g, ' ') + ' | news: ' + document.getElementById('news').innerText));
  say('   coach at start:', JSON.stringify(await coach()));
  const tutLog = []; let tutDone = false; const tStart = Date.now(); let benchNote = '', benchCombo = null, popBeforeStep3 = false;
  async function checkCoachVsUi(label) { const c = await coach(); if (!c) return null; for (const id of ['placement-note', 'placement-bar']) { const r = await rectOf(id); if (r && overlaps(c, r)) T.find('tut:overlap-' + id + ':' + label, 'the coach strip overlaps #' + id + ' during "' + label + '" (strip ' + c.top + '-' + c.bottom + ', ' + id + ' ' + Math.round(r.top) + '-' + Math.round(r.bottom) + ')'); } return c; }
  let tapsAtHab = 0, tapsAtBench = 0;
  for (let guard = 0; guard < 80 && Date.now() - tStart < 200000; guard++) {
    await drain(); const s = await st(); if (s.stack.length && s.stack[0] !== 'menu') continue;
    const c = await coach();
    if (!c) { const tut = await page.evaluate(() => ZT.S.ui.tutorial); if (!tut.on) { tutDone = true; say('   tutorial finished at', Math.round((Date.now() - tStart) / 1000), 's'); break; } await sleep(400); continue; }
    if (!tutLog.find(x => x.step === c.step)) { tutLog.push({ step: c.step, text: c.text, t: Math.round((Date.now() - tStart) / 1000) }); say('   STEP', c.step, '"' + c.text + '" strip y ' + c.top + '-' + c.bottom + ' skip ' + c.skipW + 'x' + c.skipH); await snap('tut-step' + c.step + '-' + (s.stack.slice(-1)[0] || 'floor')); await inv('tutorial step ' + c.step); if (c.skipH && c.skipH < 44) T.find('tut:skip-small', 'Skip is ' + c.skipW + 'x' + c.skipH); if (c.text.split(' ').length > 10) T.find('tut:wordy:' + c.step, 'step text is long: ' + c.text); }
    const txt = c.text;
    if (/Tap your land/i.test(txt)) { const f = free(); await T.tapXY(f.x, Math.max(f.y, c.bottom + 80), 500); continue; }
    if (/Habitats|Savanna home/i.test(txt)) { await toFloor(); await T.tapXY(free().x, free().y, 450);
      say('   highlighted on the menu:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.mn-glow')].map(e => e.innerText.replace(/\n/g, ' ').slice(0, 20)))));
      await T.tapText('Build'); say('   highlighted in Build:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.mn-glow')].map(e => e.innerText.replace(/\n/g, ' ').slice(0, 20))))); await T.tapText(/^Habitats/); const row = await T.tapText(/Savanna/, { sel: '.row', wait: 600 }); if (!row) { T.find('tut:no-savanna-row', 'no Savanna row on the Habitats list'); await toFloor(); continue; }
      const sp = await st(); if (!sp.placing) { T.find('tut:hab-not-placing', 'tapping Savanna did not start placement'); await toFloor(); continue; }
      const g = await page.evaluate(() => { const p = ZRender.debug().placement; const c = p && ZRender.hexToClient(p.q, p.r); return { ok: p && p.ok, msg: p && p.msg, x: c && Math.round(c.x), y: c && Math.round(c.y), note: document.getElementById('placement-note').innerText }; }); const bar = await rectOf('placement-bar'); const cc = await checkCoachVsUi('habitat placement');
      say('   first ghost:', JSON.stringify(g), 'coach', cc && (cc.top + '-' + cc.bottom), 'bar top', bar && Math.round(bar.top)); await snap('hab-ghost'); await inv('habitat placement');
      if (!g.ok) T.find('tut:ghost-invalid:hab', 'the first habitat ghost is not valid: ' + g.msg); if (g.y < (cc ? cc.bottom : 0) || g.y > (bar ? bar.top : H)) T.find('tut:ghost-hidden:hab', 'the first ghost is hidden behind the strip or buttons (y ' + g.y + ')');
      const before = await page.evaluate(() => ZT.S.items.length); tapsAtHab = T.taps;
      await T.tapText(/^Place/, { floor: true, sel: '#placement-bar button', wait: 150 });
      await sleep(700); const mv = await T.locate(/^Move in/, { sel: 'button, .btn' }); say('   Move in? prompt shown:', !!mv, 'stack', (await st()).stack.join('>')); if (mv) { await snap('move-in-prompt'); await inv('move in prompt'); await T.tapText(/^Move in/, { sel: 'button, .btn', wait: 300 }); } else T.find('tut:no-movein', 'no Move in? prompt after building the first habitat');
      const frames = []; let step3Seen = -1; for (let k = 0; k < 8; k++) { await sleep(400); const f = await page.evaluate(() => ({ pen: ZT.S.animals.filter(a => a.hab == null).length, fl: (ZRender.debug().floaters), coach: (document.querySelector('.mn-coach .mn-ct') || {}).textContent })); frames.push(f); if (k === 0) await snap('zebras-moving-in-a'); if (k === 2) await snap('zebras-moving-in-b'); if (/Snack/.test(f.coach || '') && step3Seen < 0) step3Seen = (k + 1) * 400; }
      say('   after Place (every 0.4 s):', JSON.stringify(frames.map(f => [f.pen, f.fl, (f.coach || '').slice(0, 14)])), 'step 3 text first seen at ~' + step3Seen + ' ms');
      const built = (await page.evaluate(() => ZT.S.items.length)) > before; const penNow = await page.evaluate(() => ZT.S.animals.filter(a => a.hab == null).length); say('   habitat built:', built, 'zebras still in pen:', penNow);
      if (!built) T.find('tut:hab-not-built', 'Place did not build the habitat'); if (penNow) T.find('tut:zebras-not-housed', 'zebras are still in the pen after the habitat was placed');
      const sx = await st(); say('   after habitat: placing', sx.placing, 'stack', sx.stack.join('>'), 'running', sx.running); await drain(); await toFloor(); continue; }
    if (/Snack/i.test(txt)) { await toFloor(); await T.tapXY(free().x, free().y, 450); await T.tapText('Build'); await T.tapText(/^Facilities/); await T.tapText(/Snack Stand/, { sel: '.row', wait: 600 });
      const sp = await st(); if (!sp.placing) { T.find('tut:snack-not-placing', 'Snack Stand did not start placement'); await toFloor(); continue; }
      const g = await page.evaluate(() => { const p = ZRender.debug().placement; return { ok: p && p.ok, msg: p && p.msg, note: document.getElementById('placement-note').innerText }; }); await checkCoachVsUi('snack placement'); say('   snack ghost:', JSON.stringify(g)); await snap('snack-ghost'); await inv('snack placement'); if (!g.ok) T.find('tut:ghost-invalid:snack', 'the first snack ghost is not valid: ' + g.msg);
      const before = await page.evaluate(() => ZT.S.items.length); await T.tapText(/^Place/, { floor: true, sel: '#placement-bar button', wait: 700 }); const after = await page.evaluate(() => ZT.S.items.length); say('   snack placed:', after > before);
      const sy = await st(); say('   after snack: placing', sy.placing, 'stack', sy.stack.join('>')); await toFloor(); await drain(); continue; }
    if (/Bench/i.test(txt)) { await toFloor(); await T.tapXY(free().x, free().y, 450); await T.tapText('Build'); await T.tapText(/^Facilities/); await T.tapText(/Garden Bench/, { sel: '.row', wait: 600 });
      const sp = await st(); if (!sp.placing) { T.find('tut:bench-not-placing', 'Garden Bench did not start placement'); await toFloor(); continue; }
      const g0 = await page.evaluate(() => { const p = ZRender.debug().placement; return { ok: p && p.ok, note: document.getElementById('placement-note').innerText }; }); say('   bench first ghost:', JSON.stringify(g0)); await snap('bench-ghost-first'); await checkCoachVsUi('bench placement');
      const nb = await page.evaluate(() => { const S = ZT.S; const stand = S.items.find(i => i.t === 'snack'); if (!stand) return null; const strip = document.getElementById('strip').getBoundingClientRect().bottom + 56; const bar = document.getElementById('placement-bar').getBoundingClientRect().top - 40; const out = []; for (const d of ZE.DIRS) { const q = stand.q + d[0], r = stand.r + d[1]; if (!ZE.inGrid(q, r) || !ZE.inLand(S, q, r)) continue; if (S.items.some(it => ZE.cells(it).some(c => c[0] === q && c[1] === r)) || ZE.isEntrance(q, r)) continue; const p = ZRender.hexToClient(q, r); if (p && p.y > strip && p.y < bar) out.push({ q, r, x: p.x, y: p.y }); } return out; });
      if (nb && nb.length) await T.tapXY(nb[0].x, nb[0].y, 500); const g1 = await page.evaluate(() => ({ note: document.getElementById('placement-note').innerText, st: document.getElementById('placement-note').dataset.state })); benchNote = g1.note; say('   bench beside the stand (' + (nb ? nb.length : 0) + ' free neighbours): note =', JSON.stringify(g1)); await snap('bench-ghost-beside');
      const combos0 = await page.evaluate(() => ZE.c(ZT.S).active.length); await T.tapText(/^Place/, { floor: true, sel: '#placement-bar button', wait: 900 }); const combos1 = await page.evaluate(() => ZE.c(ZT.S).active.length);
      const sz = await st(); say('   after bench Place: combos', combos0, '->', combos1, 'stack', sz.stack.join('>'), 'placing', sz.placing); benchCombo = combos1 > combos0;
      if (sz.stack.length) { const d = await describe(T); say('   FIRST EVER POP-UP:', sz.stack.slice(-1)[0], '::', (d.text || '').slice(0, 120)); await sleep(600); await snap('first-popup-' + sz.stack.slice(-1)[0]); await inv('first popup'); }
      await drain(); await toFloor(); continue; }
    if (/event/i.test(txt)) { const ic = await page.evaluate(() => JSON.stringify(ZRender.debug().icons)); say('   floor icons at step 5:', ic); await snap('flag-on-habitat'); if (!/ready-event/.test(ic)) T.find('tut:no-flag', 'step "' + txt + '" but no event-ready flag on the floor (' + ic + ')');
      const ok = await startProject('Event', /^Start/); say('   event started:', ok); if (!ok) T.find('tut:event-blocked', 'could not start the event the tutorial asks for'); continue; }
    await sleep(1200);   // last step auto-finishes
  }
  if (!tutDone) { T.find('tut:not-finished', 'tutorial did not finish in 200 s; steps seen ' + tutLog.map(x => x.step).join(',')); await snap('tut-timeout'); }
  say('   steps seen:', JSON.stringify(tutLog));
  const done = await page.evaluate(() => ({ habs: ZT.S.items.filter(i => i.k === 'hab').length, snack: ZT.S.items.filter(i => i.t === 'snack').length, bench: ZT.S.items.filter(i => i.t === 'bench').length, combos: ZE.c(ZT.S).active.map(a => a.id), money: Math.round(ZT.S.money), week: ZT.S.week, projects: ZT.S.projects.map(p => p.type) }));
  say('   zoo after tutorial:', JSON.stringify(done), '| bench note was:', JSON.stringify(benchNote), '| combo completed:', benchCombo, '| taps from the Yes tap to the end of the tutorial:', T.taps - tapsAtStart, '| elapsed', Math.round((Date.now() - startMs) / 1000), 's');
  await toFloor(); await show('after-tutorial', { expectClosed: true });
  if (MODE !== 'full') { say('FINDINGS (' + T.findings.length + ')'); T.findings.forEach((f, i) => say(' ' + (i + 1) + '. ' + f.msg)); say('console', JSON.stringify(T.consoleErrors), 'ZT.errors', JSON.stringify(await page.evaluate(() => ZT.errors))); await T.browser.close(); return; }

  // ================= FULL YEAR on the real clock at speed 2 =================
  say('== PLAYING ON to the year-end screen (real clock, speed 2)');
  await menu(); await T.tapText('System'); await T.tapText('2x'); await toFloor();
  const y0 = Date.now(); let lastW = -1; let yearend = false; const did = {}; let nextAct = 0;
  while (Date.now() - y0 < 8.2 * 60 * 1000) {
    await drain(); const s = await st();
    if (popups.some(p => /yearend/.test(p))) yearend = true; if (yearend && s.week >= 48) break; if (s.week >= 49 && !s.stack.length) break;
    if (s.week !== lastW && s.week % 6 === 0) { lastW = s.week; say('  week', s.week, 'money', s.money, 'running', s.running, 't+' + Math.round((Date.now() - y0) / 1000) + 's'); }
    if (s.week >= nextAct && !s.stack.length && !s.placing) {
      nextAct = s.week + 3; const icons = await page.evaluate(() => ZRender.debug().icons); const ready = k => Object.values(icons).some(a => a.includes(k)); const run = await page.evaluate(() => ZT.S.projects.map(p => p.type));
      if (!run.includes('expedition') && s.money > 5000 && await startProject('Expedition', /^Send/)) { did.exp = (did.exp || 0) + 1; say('  w' + s.week, 'expedition'); }
      else if (ready('ready-event') && !run.includes('event') && s.money > 400 && await startProject('Event', /^Start/)) { did.event = (did.event || 0) + 1; say('  w' + s.week, 'event'); }
      else if (ready('ready-breed') && !run.includes('breed') && await startProject('Breeding', /^Start/)) { did.breed = (did.breed || 0) + 1; say('  w' + s.week, 'breeding'); }
      if (!did.hire && s.week >= 6 && s.money > 1500 && await page.evaluate(() => ZT.S.staff.length < 3 && !(ZT.S.advert || ZT.S.adverts || ZT.S.hiring))) { await menu(); await T.tapText('Staff'); const hb = await T.tapText(/^Notice board/, { sel: 'button, .btn, .row', wait: 700 }); say('  w' + s.week, 'advert started:', !!hb, 'screen', (await st()).stack.join('>')); await shotOnce('advert-started'); await drain(); await toFloor(); if (hb) did.hire = 1; }
      if (await page.evaluate(() => ZT.S.animals.some(a => a.hab == null))) { await menu(); await T.tapText('Animals'); await T.tapText(/^Pen/); await T.tapText(/^House/, { wait: 500 }); await toFloor(); did.house = (did.house || 0) + 1; }
      await inv('act w' + s.week, { expectClosed: true });
    }
    await sleep(500);
  }
  const fin = await st(); say('== end of year loop: week', fin.week, 'stack', fin.stack.join('>') || '-', 'money', fin.money, 'elapsed', Math.round((Date.now() - startMs) / 1000) + 's', 'yearend seen', yearend, 'did', JSON.stringify(did));
  await snap('99-end'); say('arrival and flow stats:', JSON.stringify({ ...drainX.stats, popups: undefined })); say('popups seen:', JSON.stringify(popups));
  say('FINDINGS (' + T.findings.length + ')'); T.findings.forEach((f, i) => say(' ' + (i + 1) + '. ' + f.msg)); say('console', JSON.stringify(T.consoleErrors), 'ZT.errors', JSON.stringify(await page.evaluate(() => ZT.errors)));
  await T.browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
