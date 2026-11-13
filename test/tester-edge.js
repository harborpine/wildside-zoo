/* Tester round 4 (C): tutorial edge cases on bare land, all by touch. Usage: node test/tester-edge.js [chromium|webkit]
   Skip at each step; reload at each step; title mid-tutorial; snack before habitat; remove the habitat mid-tutorial; delete the slot being played. */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
(async () => {
  const all = []; const say = (...a) => console.log(...a);
  async function fresh(tag, tut) {
    const T = await L.launch(engine, { width: 390, height: 753 }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-edge-' + tag }); const page = T.page;
    await page.addInitScript(() => { }); await T.goto(''); await sleep(900);
    await T.tapText(/^1/, { sel: 'button', wait: 400 }); await T.tapText(/^Next/, { sel: 'button, .btn', wait: 400 }); await T.tapText(tut ? /^Yes/ : /^No/, { sel: 'button, .btn', wait: 900 });
    T.say = say; T.st = () => T.state(); T.coachText = () => page.evaluate(() => { const c = document.querySelector('.mn-coach .mn-ct'); return c ? c.textContent : null; });
    T.tutOn = () => page.evaluate(() => ZT.S && ZT.S.ui.tutorial && ZT.S.ui.tutorial.on); T.step = () => page.evaluate(() => ZT.S && ZT.S.ui.tutorial && ZT.S.ui.tutorial.step);
    T.toFloor = async () => { for (let i = 0; i < 8; i++) { const s = await T.st(); if (!s.stack.length && !s.placing) return; if (s.placing) { await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button' }); continue; } if (!(await T.tapText(/./, { sel: '.back' }))) await T.tapXY(195, 450); } };
    T.menu = async () => { await T.toFloor(); await T.tapXY(195, 480, 450); };
    T.place = async (path, row) => { await T.menu(); for (const p of path) await T.tapText(p, { wait: 300 }); await T.tapText(row, { sel: '.row', wait: 500 }); const g = await page.evaluate(() => ZRender.placing()); if (!g) return false; const b = await page.evaluate(() => ZT.S.items.length); await T.tapText(/^Place/, { floor: true, sel: '#placement-bar button', wait: 700 }); const a = await page.evaluate(() => ZT.S.items.length); await T.toFloor(); await sleep(2500); await drain(T); return a > b; };
    T.hab = () => T.place(['Build', /^Habitats/], /Savanna/); T.snack = () => T.place(['Build', /^Facilities/], /Snack Stand/); T.bench = async () => { await T.menu(); await T.tapText('Build'); await T.tapText(/^Facilities/); await T.tapText(/Garden Bench/, { sel: '.row', wait: 500 }); const b = await page.evaluate(() => ZT.S.items.length); await T.tapText(/^Place/, { floor: true, sel: '#placement-bar button', wait: 700 }); const a = await page.evaluate(() => ZT.S.items.length); await T.toFloor(); await drain(T); return a > b; };
    T.land = async () => { await T.tapXY(195, 480, 500); await T.toFloor(); await sleep(500); };
    T.upTo = async k => { if (k >= 1) await T.land(); if (k >= 2) await T.hab(); if (k >= 3) await T.snack(); if (k >= 4) await T.bench(); if (k >= 5) await sleep(500); };
    return T;
  }
  async function drain(T) { for (let g = 0; g < 20; g++) { const s = await T.st(); if (!s.stack.length) return; if (s.stack[0] === 'menu') return; const d = await describe(T); const o = await T.page.evaluate(() => [...document.querySelectorAll('.layer:not([hidden]) .opt')].map((e, i) => i)); if (/Not now/.test((d.items || []).join('|'))) { await T.tapText(/Not now/i, { wait: 300 }); continue; } if (o.length) { await T.tapText(/./, { sel: '.opt', nth: 0, wait: 400 }); continue; } await T.tapXY(195, 440, 550); } }
  const finish = async (T, name) => { all.push(...T.findings.map(f => ({ case: name, ...f }))); if (T.consoleErrors.length) all.push({ case: name, msg: 'console errors: ' + T.consoleErrors.join(' | ') }); const e = await T.page.evaluate(() => ZT.errors.length); if (e) all.push({ case: name, msg: 'ZT.errors ' + e }); await T.browser.close(); };

  // ---- 1. Skip at each step (steps 0..5)
  say('== SKIP at each step');
  for (let k = 0; k <= 5; k++) {
    const T = await fresh('skip' + k, true); await T.upTo(k); await sleep(400);
    const before = await T.coachText(); const stp = await T.step();
    if (before === null && stp !== undefined) { say('   step', k, ': strip already gone (tutorial on=' + (await T.tutOn()) + ', step ' + stp + ')'); await finish(T, 'skip' + k); continue; }
    const sk = await T.page.evaluate(() => { const b = document.querySelector('.mn-skip'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (!sk) { T.find('skip:none:' + k, 'no Skip button at step ' + k); await finish(T, 'skip' + k); continue; }
    await T.tapXY(sk.x, sk.y, 500); const after = { coach: await T.coachText(), on: await T.tutOn(), stack: (await T.st()).stack.join('>') };
    say('   step', k, '"' + before + '" -> Skip ->', JSON.stringify(after)); if (after.coach !== null || after.on) T.find('skip:not-off:' + k, 'Skip at step ' + k + ' did not turn the tutorial off');
    await T.menu(); await T.toFloor(); await L.invariants(T, 'after skip ' + k, { expectClosed: true }); await T.shot('skip' + k); await finish(T, 'skip' + k);
  }
  // ---- 2. Reload at each step (reload -> title -> slot 1)
  say('== RELOAD at each step');
  for (let k = 0; k <= 5; k++) {
    const T = await fresh('reload' + k, true); await T.upTo(k); await sleep(300); await T.page.evaluate(() => ZT.save());
    const b = { coach: await T.coachText(), step: await T.step() }; await T.page.reload(); await T.page.waitForFunction(() => window.ZT, null, { timeout: 8000 }); await sleep(1000);
    const onTitle = (await describe(T)).id; await T.tapText(/^1/, { sel: 'button', wait: 900 }); await sleep(700);
    const a = { coach: await T.coachText(), step: await T.step(), on: await T.tutOn(), items: await T.page.evaluate(() => ZT.S.items.length) };
    say('   step', k, 'before reload', JSON.stringify(b), '| title shown:', onTitle, '| after continue', JSON.stringify(a)); if (b.coach !== a.coach) T.find('reload:coach:' + k, 'coach text changed over a reload at step ' + k + ': "' + b.coach + '" -> "' + a.coach + '"');
    await L.invariants(T, 'reload ' + k); await finish(T, 'reload' + k);
  }
  // ---- 3. Title mid-tutorial and continue
  say('== TITLE mid-tutorial');
  { const T = await fresh('title', true); await T.upTo(2); const b = await T.coachText(); await T.menu(); await T.tapText('System'); await T.tapText(/Title/i, { wait: 800 }); const onT = (await describe(T)).id; const cs = await T.coachText();
    await T.tapText(/^1/, { sel: 'button', wait: 900 }); await sleep(500); const a = await T.coachText(); say('   coach before:', b, '| on title shows strip:', cs, '| after continuing:', a, '| title id', onT); if (cs) T.find('title:strip', 'coach strip visible on the title screen'); if (b !== a) T.find('title:resume', 'tutorial did not resume at the same step ("' + b + '" vs "' + a + '")'); await finish(T, 'title'); }
  // ---- 4. Snack stand BEFORE the habitat during the tutorial
  say('== SNACK before HABITAT');
  { const T = await fresh('snackfirst', true); await T.land(); const c1 = await T.coachText(); const ok = await T.snack(); const c2 = await T.coachText(); say('   step text before:', c1, '| snack placed:', ok, '| strip after:', c2, '| step', await T.step());
    const ok2 = await T.hab(); const seq = []; for (let i = 0; i < 6; i++) { seq.push((await T.coachText()) + ' [' + (await T.step()) + ']'); await sleep(900); }
    say('   after the habitat: strip sequence', JSON.stringify(seq), '| open', await T.page.evaluate(() => ZE.isOpen(ZT.S)), '| items', await T.page.evaluate(() => ZT.S.items.map(i => i.t).join(',')));
    await T.shot('snackfirst'); const okb = await T.bench(); say('   bench placed after:', okb, '| strip:', await T.coachText(), 'step', await T.step(), 'on', await T.tutOn()); await L.invariants(T, 'snack first', { expectClosed: true }); await finish(T, 'snackfirst'); }
  // ---- 5. Remove the habitat during the tutorial
  say('== REMOVE the habitat mid-tutorial');
  { const T = await fresh('remove', true); await T.upTo(2); const c1 = await T.coachText(); const stp = await T.step();
    await T.menu(); await T.tapText('Build'); await T.tapText(/^Remove/); await T.tapText(/Savanna/, { sel: '.row', wait: 500 }); const d = await describe(T); await T.tapText(/^(Remove|Yes)/i, { wait: 600 }); await T.toFloor(); await sleep(600);
    const m = await T.page.evaluate(() => ({ items: ZT.S.items.length, pen: ZT.S.animals.filter(a => a.hab == null).length, open: ZE.isOpen(ZT.S), step: ZT.S.ui.tutorial.step, on: ZT.S.ui.tutorial.on, news: document.getElementById('news').innerText }));
    say('   before:', c1, '(step ' + stp + ') | after removing:', JSON.stringify(m), '| strip:', await T.coachText()); await T.shot('removed'); await L.invariants(T, 'removed', { expectClosed: true });
    const rebuilt = await T.hab(); say('   rebuilt a habitat:', rebuilt, '| zebras in pen', await T.page.evaluate(() => ZT.S.animals.filter(a => a.hab == null).length), '| strip', await T.coachText(), 'step', await T.step());
    await finish(T, 'remove'); }
  // ---- 6. Delete the slot being played
  say('== DELETE the slot being played');
  { const T = await fresh('delete', true); await T.upTo(2); await T.menu(); await T.tapText('System'); await T.tapText(/Title/i, { wait: 800 });
    const dp = await T.page.evaluate(() => { const b = document.querySelector('.mn-del'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); if (!dp) T.find('del:none', 'no delete button on the title');
    else { await T.tapXY(dp.x, dp.y, 500); await T.tapText(/^Delete/, { sel: 'button, .btn', wait: 700 }); const s = await T.page.evaluate(() => ({ empty: ZCore.slots().map(x => x.empty), slot: ZCore.slot, S: ZT.S === null })); say('   after delete:', JSON.stringify(s), '| title:', (await describe(T)).id); await T.shot('deleted');
      // start a new zoo in the freed slot
      await T.tapText(/^1/, { sel: 'button', wait: 500 }); await T.tapText(/^Next/, { sel: 'button, .btn', wait: 500 }); await T.tapText(/^No/, { sel: 'button, .btn', wait: 900 }); const n = await T.page.evaluate(() => ({ items: ZT.S.items.length, slot: ZCore.slot, tut: ZT.S.ui.tutorial.on })); say('   new zoo in the freed slot:', JSON.stringify(n)); }
    await L.invariants(T, 'delete', { expectClosed: true }); await finish(T, 'delete'); }
  say('FINDINGS (' + all.length + ')'); all.forEach((f, i) => say(' ' + (i + 1) + '. [' + f.case + '] ' + f.msg));
})().catch(e => { console.error('CRASH', e); process.exit(1); });
