/* Tester round 5 (C): edge cases of the arrival flows, driven by touch; ZT.tick / state edits only set the scene.
   Usage: node test/tester-edge5.js [chromium|webkit]. Frozen clock, headless. */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium'; const W = 393, H = 852;
(async () => {
  const all = []; const say = (...a) => console.log(...a);
  async function fresh(tag, q) {
    const T = await L.launch(engine, { width: W, height: H }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-e5-' + tag }); const page = T.page; await T.goto(q || '?play=1&standalone=1&inset=34'); await sleep(500);
    await page.evaluate(() => { ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 600000; ZT.S.money = 300000; ZT.S.rp = 300; });
    T.st = () => T.state(); T.quiet = n => page.evaluate(n => { ZCore.onReport('*', (r, d) => d()); ZT.tick(n); ZT.S.reports.length = 0; ZT.S.happening = null; ZT.popAll(); ZCore.onReport('*', null); ['caller', 'happening'].forEach(t => ZCore.onReport(t, null)); }, n);
    T.toFloor = async () => { for (let i = 0; i < 8; i++) { const s = await T.st(); if (!s.stack.length && !s.placing) return; if (s.placing) { await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button' }); continue; } if (!(await T.tapText(/./, { sel: '.back' }))) await T.tapXY(196, 500); } };
    T.menu = async () => { await T.toFloor(); await T.tapXY(196, 520, 450); };
    T.drain = L.makeDrain(T, { maxCrates: 0 }); T.arr = () => page.evaluate(() => ZT.S.arrivals.map(a => a.a.sp + ':' + a.src)); T.show = async nm => { const d = await describe(T); say('   [' + nm + '] ' + (d.id || 'floor') + ' :: ' + (d.text || '').replace(/\s*\|\s*/g, ' | ').slice(0, 170) + ' :: ' + JSON.stringify(d.items || []).slice(0, 140)); await T.shot(nm); await L.invariants(T, nm); return d; };
    T.done = async name => { all.push(...T.findings.map(f => ({ case: name, ...f }))); const e = await page.evaluate(() => ZT.errors.length); if (e) all.push({ case: name, msg: 'ZT.errors ' + e }); if (T.consoleErrors.length) all.push({ case: name, msg: 'console: ' + T.consoleErrors.join(' | ') }); await T.browser.close(); };
    return T;
  }
  const lavish = T => T.page.evaluate(() => { const S = ZT.S; const ex = S.staff.filter(s => s.role === 'explorer').map(s => s.id).concat(S.staff.map(s => s.id)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2); return ZT.act('startExpedition', 'savanna', ex, 2); });
  async function toReveal(T, weeks) { await lavish(T); await T.page.evaluate(() => { ['caller', 'happening', 'choice', 'yearlyplan', 'yearly', 'vip', 'rankup', 'combo', 'review', 'show', 'showresult'].forEach(t => ZCore.onReport(t, (r, d) => d())); ZT.S.reports.length = 0; }); for (let w = 0; w < (weeks || 8); w++) { await T.page.evaluate(() => { ZT.tick(1); }); await sleep(450); const s = await T.st(); if (s.stack.some(x => /mo-expedition/.test(x))) return true; } return false; }

  // ---- 1. reload in the middle of a multi-find reveal
  say('== RELOAD mid reveal');
  { const T = await fresh('reload'); const got = await toReveal(T, 10); const s = await T.st(); say('   reveal on screen:', got, 'stack', s.stack.join('>'), 'arrivals', JSON.stringify(await T.arr()));
    await T.show('reveal-first'); const before = { arr: await T.arr(), animals: await T.page.evaluate(() => ZT.S.animals.length), money: await T.page.evaluate(() => Math.round(ZT.S.money)), reports: await T.page.evaluate(() => ZT.S.reports.map(r => r.type)) };
    await T.page.evaluate(() => ZT.save()); await T.page.reload(); await T.page.waitForFunction(() => window.ZT && ZT.S, null, { timeout: 8000 }).catch(() => 0); await sleep(1200);
    const d = await describe(T); say('   after reload: stack', (await T.st()).stack.join('>'), '::', (d.text || '').slice(0, 100)); await T.shot('after-reload');
    const after = { arr: await T.arr(), animals: await T.page.evaluate(() => ZT.S.animals.length), reports: await T.page.evaluate(() => ZT.S.reports.map(r => r.type)) }; say('   before', JSON.stringify(before), 'after', JSON.stringify(after));
    if (JSON.stringify(before.arr) !== JSON.stringify(after.arr)) T.find('reload:arrivals', 'arrivals changed over a reload mid-reveal: ' + JSON.stringify(before.arr) + ' -> ' + JSON.stringify(after.arr));
    await T.drain(); await T.toFloor(); say('   after deciding: arrivals', JSON.stringify(await T.arr()), 'animals', await T.page.evaluate(() => ZT.S.animals.length)); await L.invariants(T, 'reload-done', { expectClosed: true }); await T.done('reload'); }
  // ---- 2. undecided 2+ weeks
  say('== UNDECIDED arrival for 3 weeks');
  { const T = await fresh('undecided'); const got = await toReveal(T, 10); const arr0 = await T.arr(); say('   arrivals waiting:', JSON.stringify(arr0)); await T.page.evaluate(() => { ZT.popAll(); });
    await T.page.evaluate(() => { ZCore.onReport('*', (r, d) => d()); ZT.tick(3); ZT.S.reports.length = 0; ZT.popAll(); ZCore.onReport('*', null); }); await sleep(500);
    const r = await T.page.evaluate(() => ({ arr: ZT.S.arrivals.length, pen: ZT.S.animals.filter(a => a.hab == null).length, news: document.getElementById('news').innerText, pill: (document.getElementById('news').className) })); say('   after 3 weeks:', JSON.stringify(r)); await T.show('after-undecided'); if (r.arr) T.find('undecided:still', 'arrival still waiting after 3 weeks'); await T.menu(); await T.tapText('Animals'); await T.tapText(/^Pen/); await T.show('pen-after-undecided'); await T.done('undecided'); }
  // ---- 3. sell every find
  say('== SELL EVERY FIND');
  { const T = await fresh('sellall'); const got = await toReveal(T, 10); const m0 = await T.page.evaluate(() => Math.round(ZT.S.money)); let sold = 0;
    for (let g = 0; g < 20; g++) { const s = await T.st(); if (!s.stack.length) break; const d = await describe(T); const sb = (d.items || []).find(t => /^\$[\d,]+$/.test(t)); if (sb) { sold++; await T.tapText(sb, { sel: 'button, .btn', wait: 500 }); continue; } const c = (d.items || []).find(t => /^(Continue|Done|OK)/i.test(t)); if (c) { await T.tapText(c.split(' ')[0], { wait: 400 }); continue; } await T.tapXY(196, 500, 600); }
    say('   sold', sold, 'money', m0, '->', await T.page.evaluate(() => Math.round(ZT.S.money)), 'arrivals', JSON.stringify(await T.arr()), 'stack', (await T.st()).stack.join('>')); await T.show('after-sell-all'); await T.toFloor(); await L.invariants(T, 'sellall', { expectClosed: true }); await T.done('sellall'); }
  // ---- 4. full holding pen
  say('== FULL HOLDING PEN');
  { const T = await fresh('fullpen'); await T.quiet(3); const want = await T.page.evaluate(() => ZE.holdCap(ZT.S));
    await T.page.evaluate(() => { const S = ZT.S; for (let i = 0; i < 12 && ZE.holding(S).length < ZE.holdCap(S); i++) { try { ZE.debug.caller(S, 'trader'); } catch (e) { } const o = S.offers && S.offers.list && S.offers.list[0]; if (!o) break; const r = ZT.act('buyAnimal', 0); if (r && r.animal) ZT.act('keepArrival', r.animal.id || r.animal, null); } ZT.S.reports.length = 0; ZT.popAll(); });
    say('   pen capacity', want, 'in pen', await T.page.evaluate(() => ZE.holding(ZT.S).length), 'upkeep', JSON.stringify(await T.page.evaluate(() => { const u = ZE.holdUpkeep(ZT.S); return { total: u.total, count: u.count, mult: u.mult }; })));
    await T.page.evaluate(() => { try { ZE.debug.caller(ZT.S, 'trader'); } catch (e) { } });
    await T.menu(); await T.tapText('Animals'); await T.tapText(/^Pen/); await T.show('pen-full');
    await T.tapText(/^Market/); await T.tapText(/./, { sel: '.row.tappable', nth: 1, wait: 500 }); const d = await describe(T); const bb = (d.items || []).find(t => /^Buy/.test(t)); if (bb) await T.tapText(bb, { sel: 'button, .btn', wait: 700 });
    await T.show('where-with-full-pen'); const rows = await T.page.evaluate(() => [...document.querySelectorAll('#screens .layer:not([hidden]) .mo-row.tap')].map(e => e.innerText.replace(/\s+/g, ' '))); say('   where rows:', JSON.stringify(rows));
    if (rows.length) await T.tapText(/./, { sel: '.mo-row.tap', nth: rows.length - 1, wait: 600 }); await T.toFloor(); say('   pen after sending one more:', await T.page.evaluate(() => ZE.holding(ZT.S).length), '/', want, 'errors', await T.page.evaluate(() => ZT.errors.length)); await T.done('fullpen'); }
  // ---- 5. remove a habitat with animals
  say('== REMOVE habitat with animals');
  { const T = await fresh('remove'); const before = await T.page.evaluate(() => ({ habs: ZT.S.items.filter(i => i.k === 'hab').length, in: ZT.S.animals.filter(a => a.hab != null).length })); await T.menu(); await T.tapText('Build'); await T.tapText(/^Remove/); await T.tapText(/Savanna/, { sel: '.row', wait: 500 }); await T.show('remove-confirm'); await T.tapText(/^(Remove|Yes)/i, { wait: 700 }); await T.toFloor(); await sleep(400);
    const after = await T.page.evaluate(() => ({ habs: ZT.S.items.filter(i => i.k === 'hab').length, pen: ZT.S.animals.filter(a => a.hab == null).length, animals: ZT.S.animals.length, open: ZE.isOpen(ZT.S), news: document.getElementById('news').innerText })); say('   before', JSON.stringify(before), 'after', JSON.stringify(after)); await T.menu(); await T.tapText('Animals'); await T.tapText(/^Pen/); await T.show('pen-after-remove'); await T.done('remove'); }
  // ---- 6. advertise twice
  say('== ADVERTISE twice');
  { const T = await fresh('advert'); await T.menu(); await T.tapText('Staff'); const t1 = await T.tapText(/^Notice board/, { sel: 'button, .btn, .row', wait: 700 }); await T.show('advert-1'); await T.drain(); await T.toFloor(); const s1 = await T.page.evaluate(() => JSON.stringify({ money: Math.round(ZT.S.money), keys: Object.keys(ZT.S).filter(k => /advert|hir|cand/i.test(k)) })); say('   after first advert', s1);
    await T.menu(); await T.tapText('Staff'); const m0 = await T.page.evaluate(() => Math.round(ZT.S.money)); const d2 = await T.show('staff-while-advert'); const t2 = await T.tapText(/^Notice board/, { sel: 'button, .btn, .row', wait: 700 }); const m1 = await T.page.evaluate(() => Math.round(ZT.S.money)); say('   second advert tapped:', !!t2, 'money', m0, '->', m1, 'toast:', await T.page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join('/'))); await T.show('advert-2'); if (m1 < m0 && m0 - m1 >= 200) say('   NOTE: a second advert was charged'); await T.done('advert'); }
  // ---- 7. open all 5 crates
  say('== OPEN all 5 crates');
  { const T = await fresh('crates'); await T.page.evaluate(() => { try { ZE.debug.caller(ZT.S, 'trader'); } catch (e) { } }); const ci = await T.page.evaluate(() => JSON.stringify(ZE.crateInfo(ZT.S) && { cost: ZE.crateInfo(ZT.S).cost, left: ZE.crateInfo(ZT.S).left })); say('   crate info', ci); const drain5 = L.makeDrain(T, { maxCrates: 5 });
    let opened = 0; for (let i = 0; i < 6; i++) { await T.menu(); await T.tapText('Animals'); await T.tapText(/^Market/); const cr = await T.tapText(/\/|Crate|crate/, { sel: '.row', wait: 500 }); if (!cr) break; const d = await describe(T); const op = (d.items || []).find(t => /^Open/.test(t)); if (!op) { say('   crate screen without Open:', (d.text || '').slice(0, 80)); await T.show('crate-no-open'); break; } if (i === 0) await T.show('crate-screen'); await T.tapText(/^Open/, { sel: 'button, .btn', wait: 900 }); opened++; await sleep(2500); await drain5(); await T.toFloor(); }
    say('   crates opened:', opened, 'left', await T.page.evaluate(() => { const c = ZE.crateInfo(ZT.S); return c ? c.left : 'none'; }), 'arrivals', JSON.stringify(await T.arr()), 'animals', await T.page.evaluate(() => ZT.S.animals.length), 'stats', JSON.stringify({ ...drain5.stats, popups: undefined })); await T.menu(); await T.tapText('Animals'); await T.tapText(/^Market/); await T.show('market-after-crates'); await T.done('crates'); }
  // ---- 8. carried-over animal at the start of a new zoo
  say('== CARRIED-OVER animal');
  { const T = await fresh('carry'); await T.page.evaluate(() => { ZCore.legacy = ZCore.legacy || {}; ZCore.legacy.runs = 1; const a = ZT.S.animals[0]; ZCore.legacy.carry = { staff: [ZT.S.staff[0]], animals: [JSON.parse(JSON.stringify(a))] }; ZCore.saveLegacy && ZCore.saveLegacy(); ZCore.toTitle(); }); await sleep(700);
    await T.tapText(/^2/, { sel: 'button', wait: 500 }); await T.show('name'); await T.tapText(/^Next/, { sel: 'button, .btn', wait: 600 }); await T.tapText(/^No/, { sel: 'button, .btn', wait: 700 }); const dc = await T.show('carry-card');
    if (/Bring along/.test(dc.text || '')) { await T.tapText(/./, { sel: '.row.tappable', nth: 1, wait: 400 }); await T.show('carry-picked'); const go = (await describe(T)).items.find(t => /^(Start|Next|Go|Done|Bring|Play)/i.test(t)); say('   going on with:', go); await T.tapText(go ? go.split(' ')[0] : /Start/, { sel: 'button, .btn', wait: 1000 }); } else say('   NOTE: no carry card shown');
    await sleep(900); const st1 = await T.page.evaluate(() => ZT.S && ({ slot: ZCore.slot, arr: ZT.S.arrivals.map(a => a.a.sp + ':' + a.src), animals: ZT.S.animals.map(a => a.sp + ':' + (a.hab == null ? 'pen' : 'hab')), items: ZT.S.items.length })); const s2 = await T.st(); say('   new zoo state', JSON.stringify(st1), 'stack at start:', s2.stack.join('>') || '(floor)'); await T.show('new-zoo-start');
    if (st1 && st1.arr.length && !s2.stack.length) say('   NOTE: a legacy arrival is waiting but no decision screen is on show; it only appears in Animals');
    await T.menu(); await T.tapText('Animals'); await T.show('animals-with-carry'); await T.done('carry'); }
  say('FINDINGS (' + all.length + ')'); all.forEach((f, i) => say(' ' + (i + 1) + '. [' + f.case + '] ' + f.msg));
})().catch(e => { console.error('CRASH', e); process.exit(1); });
