/* Moments screenshots and checks. Headless only.  Usage: node test/moments-shot.js [chromium|webkit ...] [--quick]   (default: both)
   Forces every report type, plays real projects through touch, screenshots each stage to test/shots/moments-*.png. */
const path = require('path'), fs = require('fs');
const pw = require('./pw.js');
const ROOT = path.resolve(__dirname, '..'), URL = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html';
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const args = process.argv.slice(2).filter(a => !a.startsWith('--only=')), ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean), QUICK = args.includes('--quick');
const browsers = args.filter(a => a === 'chromium' || a === 'webkit'); if (!browsers.length) browsers.push('chromium', 'webkit');
let failures = 0, warnings = 0;
const want = n => !ONLY.length || ONLY.includes(n);   // sections: cards callers happenings yearly reveals yearend realplay reopen inmenu
const check = (cond, msg) => { console.log((cond ? '  PASS ' : '  FAIL ') + msg); if (!cond) failures++; };
const warn = msg => { console.log('  WARN ' + msg); warnings++; };

async function run(name) {
  const tag = name === 'chromium' ? '' : '-' + name;
  console.log('== ' + name);
  const browser = await pw[name].launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: name !== 'firefox' });
  const page = await ctx.newPage(); const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Access-Control-Allow-Origin|Not allowed to load local resource|manifest/i.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, 'moments-' + n + tag + '.png') });
  const boot = async () => { await page.goto(URL + '?play=1'); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready && window.ZMoments, null, { timeout: 10000 }); await page.evaluate(() => { ZT.WEEK_MS[1] = 1e9; ZT.WEEK_MS[2] = 1e9; }); };
  await boot();
  const ev = (fn, a) => page.evaluate(fn, a);
  const state = () => ev(() => ({ stack: ZT.stack(), reports: ZT.S.reports.length, busy: ZCore.busy, running: ZT.running(), cur: ZMoments.cur || null }));
  const waitStack = async (pred, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 6000)) { const s = await state(); if (pred(s)) return s; await sleep(60); } return null; };
  const tapAway = () => page.touchscreen.tap(5, 420);
  const tapSel = async sel => { const b = page.locator(sel).first(); await b.waitFor({ timeout: 3000 }); await b.tap(); };
  const layout = () => ev(() => { const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); if (!l) return null; const b = l.querySelector('.pbody'), p = l.querySelector('.panel'); const small = [...l.querySelectorAll('button')].filter(x => { const r = x.getBoundingClientRect(); return r.height > 0 && r.height < 43.5; }).map(x => x.textContent.trim() + ':' + Math.round(x.getBoundingClientRect().height)); const pr = p.getBoundingClientRect(); return { over: b.scrollHeight - b.clientHeight, small, top: Math.round(pr.top), bottom: Math.round(pr.bottom), w: Math.round(pr.width) }; });

  // Drive one moment: wait for it, screenshot stages, check it reaches its final card in time, tap through, check it closes.
  // opts: pick (option index for choices), shots (name prefix, null = none), noLayout
  async function drive(label, o) {
    o = o || {};
    const first = await waitStack(s => s.stack.length > 0, 4000);
    if (!first) { check(false, label + ': a screen opened'); return false; }
    const t0 = Date.now(); let id = first.stack[first.stack.length - 1]; const startLen = first.stack.length;
    if (o.shots) { await sleep(180); await shot(o.shots + '-a'); }
    const isChoice = await ev(() => !!document.querySelector('.layer:not([hidden]) .choices'));
    if (isChoice && o.pick != null) {
      if (o.shots) await shot(o.shots + '-options');
      const lay = await layout(); if (lay && !o.noLayout) { if (lay.over > 1) warn(label + ': choice screen scrolls by ' + lay.over); if (lay.small.length) warn(label + ': small buttons ' + lay.small.join(',')); }
      const n = await ev(() => document.querySelectorAll('.layer:not([hidden]) .choices .btn.opt').length);
      const idx = Math.min(o.pick, n - 1);
      await page.locator('.layer:not([hidden]) .choices .btn.opt').nth(idx).tap();
      await sleep(250);
      if (o.shots) { await sleep(150); await shot(o.shots + '-suspense'); }
      // result beat: wait for the title bar or card to settle, then screenshot and tap through
      await sleep(900); if (o.shots) await shot(o.shots + '-result');
      let guard = 0; while ((await state()).stack.length >= startLen && guard++ < 6) { await tapAway(); await sleep(450); }
      return n;
    }
    if (o.shots) { await sleep(900); await shot(o.shots + '-b'); }
    // untouched: final card reached in about four seconds
    const fin = await waitStack(s => !s.cur || s.cur.final || !s.stack.length, 6000);
    const dt = Date.now() - t0;
    if (o.timed !== false) check(!!fin && dt <= 4900, label + ': final card reached untouched in ' + (dt / 1000).toFixed(1) + ' s');
    await sleep(o.shots ? 1700 : 520);
    if (o.shots) await shot(o.shots + '-final');
    if (!o.noLayout) { const lay = await layout(); if (lay) { if (lay.over > 1) (o.scrollOk ? console.log('  note ' + label + ' scrolls by ' + lay.over + ' px (long list)') : warn(label + ': scrolls by ' + lay.over + ' px')); if (lay.small.length) warn(label + ': small buttons ' + lay.small.join(',')); if (lay.top < 0 || lay.bottom > 844) warn(label + ': panel outside screen ' + lay.top + '..' + lay.bottom); } }
    if (o.after) await o.after();
    let guard = 0; while ((await state()).stack.length >= startLen && guard++ < 14) {
      await tapAway(); await sleep(350); if (o.onlyOne) break;
      if (guard >= 2 && (await state()).stack.length >= startLen) { const g = page.locator('.layer:not([hidden]) .btn.ghost'); if (await g.count()) { await g.last().tap({ force: true }).catch(() => {}); await sleep(350); } }
    }
    return true;
  }
  const settled = async label => { const s = await waitStack(s => !s.stack.length && !s.busy, 4000); check(!!s && s.running, label + ': queue empty, stack empty, clock may resume' + (s ? '' : ' (stuck: ' + JSON.stringify(await state()) + ')')); };
  const fresh = async (fn, arg) => { await ev(fn || (() => { ZT.newGame({}); ZT.S.money = 1e6; ZT.S.rp = 5000; ZT.S.reports.length = 0; }), arg); await sleep(150); };
  const pushReport = r => ev(r0 => { ZT.S.reports.push(r0); ZT.flush(); }, r);

  const mkFound = (n, rar) => ev(({ n, rar }) => { const ids = ['lion', 'elephant', 'giraffe', 'zebra', 'tiger', 'panda'].filter(i => ZD.SPECIES[i]); const out = []; for (let i = 0; i < n; i++) { const sp = ids[i % ids.length]; out.push({ id: 900 + i, sp, rarity: rar || ZD.SPECIES[sp].rarity, isNew: i === 0, variant: i === 1, charm: 40 + i * 9, vigor: 30 + i * 7, wit: 25 + i * 11, hab: i === 2 ? null : (ZT.S.items.find(x => x.k === 'hab') || {}).id }); } return out; }, { n, rar });
  // ---------------------------------------------------------------- 1. quick cards
  console.log(' -- small cards');
  if (want('cards')) {
  await fresh();
  await pushReport({ type: 'rankup', rank: 3, name: 'Zoo Manager', unlocks: await ev(() => ZE.rankUnlocks(3)) });
  await drive('rankup', { shots: 'rankup' }); await settled('rankup');
  await pushReport(await ev(() => { const h = ZT.S.items.find(i => i.k === 'hab'); return { type: 'combo', id: 'picnic', anchor: h.id, members: [] }; }));
  await drive('combo', { shots: 'combo' }); await settled('combo');
  await pushReport({ type: 'secret', region: 'paleo' }); await drive('secret paleo', { shots: 'secret' }); await settled('secret');
  await pushReport({ type: 'secret', region: 'mythic' }); await drive('secret mythic'); await settled('secret mythic');
  await pushReport({ type: 'vip', id: 'critic', money: 20000, rep: 120, boost: 0.2 }); await drive('vip', { shots: 'vip' }); await settled('vip');
  await pushReport({ type: 'vip', id: 'nobody', money: 0, rep: 0, boost: 0 }); await drive('vip unknown id'); await settled('vip unknown id');
  await pushReport({ type: 'combo', id: 'does-not-exist', anchor: 1, members: [] }); await sleep(300); await settled('combo with unknown id (skipped)');

  }
  // ---------------------------------------------------------------- 2. callers
  console.log(' -- callers');
  if (want('callers')) {
  for (const kind of ['trader', 'director', 'headhunter']) {
    await fresh(k => { ZT.newGame({}); ZT.S.money = 1e6; ZT.S.rp = 5000; ZT.S.reports.length = 0; ZE.debug.caller(ZT.S, k); }, kind);
    await ev(() => ZT.flush());
    await waitStack(s => s.stack.length > 0, 3000); await sleep(500); await shot('caller-' + kind);
    const lay = await layout(); if (lay && lay.over > 1) warn('caller ' + kind + ' scrolls ' + lay.over); if (lay && lay.small.length) warn('caller ' + kind + ' small buttons: ' + lay.small.join(','));
    // dismiss and check it stays reachable
    await tapSel('.layer:not([hidden]) .btn.ghost');
    await settled('caller ' + kind + ' dismissed');
    const again = await ev(k => { let ok = false; try { ZMoments.showCaller(k, () => { window.__cdone = true; }); ok = ZT.stack().length > 0; } catch (e) { } return ok; }, kind);
    check(again, 'caller ' + kind + ': reopened later through ZMoments.showCaller'); await sleep(300);
    if (kind === 'trader') {
      await shot('caller-trader-reopened');
      // buy the first animal and open the crate
      const had = await ev(() => ZT.S.animals.length);
      await page.locator('.layer:not([hidden]) .mo-row .btn.primary').first().tap(); await sleep(400);
      check(await ev(h => ZT.S.animals.length === h + 1, had), 'trader: buying an offer adds the animal');
      await shot('caller-trader-bought');
      const crate = page.locator('.layer:not([hidden]) .btn.blue'); await crate.first().tap();
      await drive('crate reveal', { shots: 'crate', pick: null });
      check(await ev(() => ZT.stack().length === 1 && /mo-caller/.test(ZT.stack()[0])), 'crate: returns to the trader after the reveal');
    }
    if (kind === 'headhunter') { const staff0 = await ev(() => ZT.S.staff.length); await tapSel('.layer:not([hidden]) .btn.primary'); await sleep(400); check(await ev(n => ZT.S.staff.length === n + 1, staff0), 'headhunter: hiring works'); await settled('headhunter hire'); }
    else { await tapSel('.layer:not([hidden]) .btn.ghost'); await settled('caller ' + kind + ' closed'); }
    check(await ev(() => window.__cdone === true), 'caller ' + kind + ': showCaller calls done'); await ev(() => { window.__cdone = false; });
  }

  }
  // ---------------------------------------------------------------- 3. every happening, every option
  console.log(' -- happenings');
  if (want('happenings')) {
  const keys = await ev(() => Object.keys(ZD.HAPPENINGS));
  let hshots = 0;
  for (const key of keys) {
    const n = await ev(k => { ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.rp = 5000; S.reports.length = 0; S.happening = null; S.animals.forEach(a => { a.rest = S.week + 6; }); while (S.animals.length < 4) S.animals.push(Object.assign({}, S.animals[0], { id: 5000 + S.animals.length, name: 'Extra' })); const ok = ZE.debug.happening(S, k); return ok ? (S.reports[0] && S.reports[0].options ? S.reports[0].options.length : 0) : -1; }, key);
    if (n < 0) { warn('happening ' + key + ': could not be forced in a fresh zoo (skipped)'); continue; }
    if (n === 0) {
      await ev(() => ZT.flush()); await drive('happening ' + key, { shots: hshots < 6 || key === 'storm' ? 'happening-' + key : null }); hshots++; await settled('happening ' + key); continue;
    }
    for (let i = 0; i < n; i++) {
      await ev(k => { ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.rp = 5000; S.reports.length = 0; S.happening = null; S.animals.forEach(a => { a.rest = S.week + 6; }); while (S.animals.length < 4) S.animals.push(Object.assign({}, S.animals[0], { id: 5000 + S.animals.length, name: 'Extra' })); ZE.debug.happening(S, k); ZT.flush(); }, key);
      await drive('happening ' + key + ' option ' + i, { pick: i, shots: (i === 0 && hshots < 8) || (key === 'stray' || key === 'storm' || key === 'escape') && i === 0 ? 'happening-' + key : null }); hshots++;
      await settled('happening ' + key + ' option ' + i);
    }
    check(await ev(() => !ZT.S.happening || !ZT.S.happening.options), 'happening ' + key + ': resolved in the engine');
  }
  // unaffordable options are greyed and ignore taps
  await ev(() => { ZT.newGame({}); const S = ZT.S; S.money = 0; S.reports.length = 0; S.happening = null; ZE.debug.happening(S, 'tv'); ZT.flush(); });
  await waitStack(s => s.stack.length, 3000); await sleep(400);
  const grey = await ev(() => [...document.querySelectorAll('.layer:not([hidden]) .choices .btn.opt')].map(b => b.classList.contains('disabled')));
  check(grey.length === 2 && !grey[0] && grey[1], 'tv: the paid option is greyed when broke (' + grey + ')');
  await page.locator('.layer:not([hidden]) .choices .btn.opt').nth(1).tap({ force: true }); await sleep(300);
  check(await ev(() => ZT.stack().length === 1 && !!ZT.S.happening), 'tv: tapping a greyed option does nothing');
  await shot('choice-greyed');
  await page.locator('.layer:not([hidden]) .choices .btn.opt').nth(0).tap(); await sleep(500); await drive('tv free option', { shots: null }); await settled('tv free');

  }
  // ---------------------------------------------------------------- 4. yearly events
  console.log(' -- yearly events');
  if (want('yearly')) {
  for (const id of ['openday', 'festival']) {
    for (let i = 0; i < 4; i++) {
      await ev(k => { ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; ZE.debug.yearly(S, k); ZT.flush(); }, id);
      await waitStack(s => s.stack.length, 3000); await sleep(350);
      if (i === 0) await shot('yearlyplan-' + id);
      await page.locator('.layer:not([hidden]) .choices .btn.opt').nth(i).tap(); await sleep(450);
      const st = await state(); check(st.stack.length === 1 && /yearly/.test(st.stack[0]), id + ' option ' + i + ': plan hands over to the result screen (' + st.stack + ')');
      await drive(id + ' result ' + i, { shots: i === 3 ? 'yearly-' + id : null }); await settled(id + ' result ' + i);
    }
  }
  // unanswered plan: closing everything must not strand the queue
  await ev(() => { ZT.newGame({}); const S = ZT.S; S.reports.length = 0; ZE.debug.yearly(S, 'openday'); ZT.flush(); });
  await waitStack(s => s.stack.length, 3000); await sleep(300); await ev(() => ZT.popAll());
  await settled('plan closed by popAll (done called by onClose)');
  // winter show
  await ev(() => { ZT.newGame({}); const S = ZT.S; S.reports.length = 0; ZE.debug.yearly(S, 'show'); ZT.flush(); });
  await waitStack(s => s.stack.length, 3000); await sleep(400); await shot('show-picker');
  { const lay = await layout(); if (lay && lay.over > 1) warn('show picker scrolls ' + lay.over); }
  await page.locator('.layer:not([hidden]) .mo-row.tap').first().tap(); await sleep(300); await shot('show-confirm');
  await tapSel('.layer:not([hidden]) .btn.primary, .layer .confirm .btn.primary');
  await sleep(300);
  await drive('show result', { shots: 'showresult' }); await settled('show result');
  check(await ev(() => !ZT.S.show), 'show: entering closes the show');
  // show: Not now leaves the picker reachable
  await ev(() => { ZT.newGame({}); const S = ZT.S; S.reports.length = 0; ZE.debug.yearly(S, 'show'); ZT.flush(); });
  await waitStack(s => s.stack.length, 3000); await sleep(300); await tapSel('.layer:not([hidden]) .btn.ghost'); await settled('show not now');
  check(await ev(() => !!ZT.S.show && (ZMoments.showShow(), ZT.stack().length > 0)), 'show: still enterable later via ZMoments.showShow'); await ev(() => ZT.popAll()); await sleep(200);

  }
  // ---------------------------------------------------------------- 5. synthetic reveals (to see rare cases) and timing
  console.log(' -- reveals');
  if (want('reveals')) {
  await fresh();
  for (const n of [1, 3, 5]) {
    const found = await mkFound(n);
    await pushReport({ type: 'expedition', region: 'savanna', found, rp: 14, fragment: n === 3 ? 2 : 0, notes: ['Field notes: +14 research.'], ups: n === 5 ? ['Ada', 'Ben'] : [], staff: [] });
    await drive('expedition ' + n + ' found', { shots: 'expedition' + n }); await settled('expedition ' + n);
  }
  await pushReport({ type: 'expedition', region: 'jungle', found: [], rp: 5, fragment: 0, notes: [], ups: [], staff: [] }); await drive('expedition nothing'); await settled('expedition empty');
  const mkKid = (name, lucky, variant, hab) => ({ id: 800, sp: 'zebra', sex: 'F', name, hab, rolls: [{ stat: 'charm', parents: 41, value: 47, delta: 6, lucky: false }, { stat: 'vigor', parents: 38, value: 49, delta: 11, lucky }, { stat: 'wit', parents: 30, value: 28, delta: -2, lucky: false }], variantChance: 0.06, variant });
  const habId = await ev(() => (ZT.S.items.find(x => x.k === 'hab') || {}).id);
  await pushReport({ type: 'birth', fail: false, a: 1, b: 2, lead: 1, sp: 'zebra', chance: 0.7, kids: [mkKid('Pip', true, true, habId)], twins: false, firstBred: true });
  await drive('birth single', { shots: 'birth' }); await settled('birth single');
  await pushReport({ type: 'birth', fail: false, a: 1, b: 2, lead: 1, sp: 'zebra', chance: 0.7, kids: [mkKid('Pip', false, false, habId), mkKid('Mo', true, false, null)], twins: true, firstBred: false });
  await drive('birth twins', { shots: 'birth-twins' }); await settled('birth twins');
  await pushReport({ type: 'birth', fail: true, a: 1, b: 2, lead: 1, sp: 'zebra', chance: 0.55, kids: [] }); await drive('birth failed', { shots: 'birth-fail' }); await settled('birth failed');
  const mkReview = (tot, hof) => ({ type: 'review', hab: habId, biome: 'savanna', theme: 'feeding', aff: 2, fitWord: 'Good fit', firstTime: true, sc: {}, critics: [{ key: 'animals', name: 'Animals', score: Math.min(10, Math.round(tot / 4) + 1) }, { key: 'habitat', name: 'Habitat', score: Math.round(tot / 4) }, { key: 'fun', name: 'Fun', score: Math.round(tot / 4) }, { key: 'learning', name: 'Learning', score: Math.max(0, tot - 3 * Math.round(tot / 4) - Math.min(10, Math.round(tot / 4) + 1)) }], total: tot, hof, repeat: false, fired: 1, star: { animal: 999999, stat: 'charm', score: 'fun', gain: 1.4 }, boost: { good: true, score: 'fun', amt: 2, big: false }, money: 8200, rep: 40, rp: 12, lead: 1 });
  await pushReport(mkReview(36, true)); await drive('review hall of fame', { shots: 'review-hof' }); await settled('review hof');
  await pushReport(mkReview(15, false)); await drive('review low', { shots: 'review-low' }); await settled('review low');
  // hiring and training reusable pieces
  await ev(() => { const S = ZT.S; S.rank = 5; });
  const hired = await ev(() => { const r = ZCore.act('advertise', 1); return r.ok ? r.candidates.length : -1; });
  check(hired > 0, 'advertise gave candidates (' + hired + ')');
  await ev(() => { window.__hdone = false; ZMoments.revealHire(ZT.S.candidates, () => { window.__hdone = true; }); });
  await drive('hire reveal', { shots: 'hire', noLayout: true, timed: true });
  await settled('hire reveal'); check(await ev(() => window.__hdone === true), 'revealHire calls done');
  await ev(() => { window.__tdone = false; ZMoments.revealTrain(ZT.S.staff[0], { gain: 9, super: true, stat: 'care', value: 41 }, () => { window.__tdone = true; }); });
  await drive('train super', { shots: 'train-super' }); await settled('train'); check(await ev(() => window.__tdone === true), 'revealTrain calls done');
  await ev(() => { window.__rdone = false; ZMoments.result({ title: 'Test', lines: ['One line'], good: true }, () => { window.__rdone = true; }); });
  await drive('result'); await settled('result'); check(await ev(() => window.__rdone === true), 'result calls done');
  await ev(() => { window.__adone = false; ZMoments.revealAnimal({ sp: 'lion', variant: true, charm: 70, vigor: 60, wit: 50 }, { kicker: 'Test', isNew: true, hab: null }, () => { window.__adone = true; }); });
  await drive('revealAnimal', { shots: 'animal-rare' }); await settled('revealAnimal'); check(await ev(() => window.__adone === true), 'revealAnimal calls done');
  // tapping: a tap on a running beat completes it and holds; the next tap moves on
  await pushReport({ type: 'expedition', region: 'savanna', found: await mkFound(2), rp: 3, fragment: 0, notes: [], ups: [], staff: [] });
  await waitStack(s => s.stack.length, 3000); await sleep(500); await tapAway(); await sleep(200);
  const hold1 = await ev(() => ZMoments.cur.i); await sleep(1700); const hold2 = await ev(() => ZMoments.cur.i);
  check(hold1 === 0 && hold2 === 0, 'tap on a running beat completes it and holds (step ' + hold1 + ' then ' + hold2 + ')');
  await tapAway(); await sleep(400); check(await ev(() => ZMoments.cur.i === 1), 'second tap moves to the next animal');
  await ev(() => ZT.popAll()); await settled('expedition popAll mid-sequence');

  }
  // ---------------------------------------------------------------- 6. year end and final score
  console.log(' -- year end, final');
  if (want('yearend')) {
  await fresh(() => { ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; for (let i = 0; i < 47; i++) ZE.tick(S); S.reports.length = 0; ZE.tick(S); S.reports = S.reports.filter(r => r.type === 'yearend'); });
  check(await ev(() => ZT.S.reports.length === 1), 'a year end report exists after 48 weeks');
  await ev(() => ZT.flush());
  await drive('yearend', { shots: 'yearend' }); await settled('yearend');
  await fresh(() => { ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; S.week = 20 * 48 - 1; ZE.tick(S); S.reports = S.reports.filter(r => r.type === 'final'); });
  check(await ev(() => ZT.S.reports.length === 1), 'a final report exists after year 20');
  await ev(() => ZT.flush());
  await waitStack(s => s.stack.length, 3000); await sleep(4200); await shot('final');
  { const lay = await layout(); if (lay && lay.over > 1) warn('final scrolls ' + lay.over); if (lay && lay.small.length) warn('final small buttons ' + lay.small.join(',')); }
  check(await ev(() => ZT.S.flags.legacySaved === true && ZCore.legacy.runs >= 1), 'final: carry-over record saved');
  await page.locator('.layer:not([hidden]) .btn.primary').first().tap(); await sleep(400); await shot('final-newzoo');
  { const lay = await layout(); if (lay && lay.over > 1) warn('new zoo screen scrolls ' + lay.over); }
  await page.locator('.layer:not([hidden]) .mo-pick').first().locator('.mo-row').first().tap(); await sleep(200);
  await page.locator('.layer:not([hidden]) .btn.primary').last().tap(); await sleep(800);
  check(await ev(() => ZT.S.ng >= 1 && ZT.stack().length === 0), 'final: Start a new zoo begins a fresh zoo with carry-over (ng=' + (await ev(() => ZT.S.ng)) + ')');
  await settled('after new zoo');
  await fresh(() => { ZT.newGame({}); const S = ZT.S; S.reports.length = 0; S.week = 20 * 48 - 1; ZE.tick(S); S.reports = S.reports.filter(r => r.type === 'final'); ZT.flush(); });
  await waitStack(s => s.stack.length, 3000); await sleep(3800); await page.locator('.layer:not([hidden]) .btn.ghost').first().tap(); await settled('final: keep playing');

  }
  // ---------------------------------------------------------------- 7. real play: projects, choices, results
  console.log(' -- real play');
  if (want('realplay')) {
  const covered = {}, repSeen = {};
  async function playOut(maxTicks, optPick, shotsFor) {
    let ticks = 0, seen = [];
    for (;;) {
      const s = await state();
      if (s.stack.length) {
        const top = s.stack[s.stack.length - 1];
        const info = await ev(() => { const c = document.querySelector('.layer:not([hidden]) .choices'); return { choice: !!c, title: (document.querySelector('.layer:not([hidden]) .ptitle') || {}).textContent || '', key: (ZT.S.projects.find(p => p.choice) || {}).choice ? ZT.S.projects.find(p => p.choice).choice.key : null, n: c ? c.querySelectorAll('.btn.opt').length : 0 }; });
        if (info.choice && !/mo-choice/.test(top)) {   // a happening or yearly plan met while ticking: answer the first option
          await drive('real ' + top + ' option 0', { pick: 0, shots: null }); seen.push(top); await sleep(120); continue;
        }
        if (info.choice && /mo-choice/.test(top)) {
          const pick = optPick(info); seen.push(info.key + ':' + pick);
          const sh = shotsFor && shotsFor(info, pick);
          await drive('real ' + info.key + ' option ' + pick, { pick, shots: sh, noLayout: false });
          covered[info.key + ':' + pick] = true;
        } else {
          const label = 'real ' + top;
          const sh = shotsFor && shotsFor({ top });
          await drive(label, { shots: sh, timed: true }); seen.push(top);
        }
        await sleep(120); continue;
      }
      if (ticks >= maxTicks) break;
      await ev(() => ZT.tick(1)); ticks++; await sleep(40);
    }
    return seen;
  }
  const wantOpts = { tracks: 2, guide: 2, camp: 2, river: 2, vet: 2, diet: 2, watch: 2, star: 3, boost: 3 };
  const lastPick = {};
  const pickFor = info => { const k = info.key; for (let i = 0; i < info.n; i++) if (!covered[k + ':' + i]) return i; lastPick[k] = ((lastPick[k] || 0) + 1) % info.n; return lastPick[k]; };
  const shotFirst = {};
  const shotsFor = (info, pick) => { if (info.top) { const k = 'top-' + info.top; if (!shotFirst[k]) { shotFirst[k] = 1; return 'real-' + info.top.replace(/^mo-/, ''); } return null; } const k = info.key + ':' + pick; if (!shotFirst[k] && pick === 0) { shotFirst[k] = 1; return 'choice-' + info.key; } return null; };
  const trials = QUICK ? 6 : 30;
  for (let t = 0; t < trials; t++) {
    const kind = ['expedition', 'breed', 'event'][t % 3];
    const ok = await ev(kind => {
      ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.rp = 5000; S.reports.length = 0;
      const free = ZE.freeStaff(S); const hab = S.items.find(i => i.k === 'hab');
      if (kind === 'expedition') { const ex = S.staff.find(s => s.role === 'explorer') || free[0]; const r = ZCore.act('startExpedition', 'savanna', [ex.id], 1); return !!(r && r.ok); }
      if (kind === 'breed') { const pairs = ZE.readyPairs(S, hab.id); if (!pairs.length) { S.animals.forEach(a => { a.rest = 0; }); } const p = ZE.readyPairs(S, hab.id)[0]; if (!p) return false; const lead = free.find(s => s.role === 'keeper') || free[0]; const r = ZCore.act('startBreeding', p[0], p[1], lead.id); return !!(r && r.ok); }
      const lead = free[0]; const r = ZCore.act('startEvent', hab.id, 'feeding', lead.id); return !!(r && r.ok);
    }, kind);
    if (!ok) { warn('trial ' + t + ' (' + kind + ') could not start'); continue; }
    await playOut(kind === 'breed' ? 40 : kind === 'expedition' ? 24 : 8, pickFor, shotsFor);
    await settled('real trial ' + t + ' ' + kind);
    if (!QUICK && Object.keys(wantOpts).every(k => Array.from({ length: wantOpts[k] }, (_, i) => covered[k + ':' + i]).every(Boolean))) break;
  }
  const missing = []; for (const k in wantOpts) for (let i = 0; i < wantOpts[k]; i++) if (!covered[k + ':' + i]) missing.push(k + ':' + i);
  console.log('  covered choice options: ' + Object.keys(covered).sort().join(' '));
  if (missing.length) warn('not reached by random play this run: ' + missing.join(' ')); else check(true, 'every project choice option was played through the screen');
  // the real expedition/birth/review reports were driven above through playOut; confirm they happened at least once each
  const cnt = await ev(() => ({ shown: ZMoments.shown, finished: ZMoments.finished }));
  console.log('  handler calls in real play (shown / finished): ' + JSON.stringify(cnt));
  for (const t of ['expedition', 'birth', 'review', 'choice']) check((cnt.shown[t] || 0) > 0 && cnt.finished[t] === cnt.shown[t], 'real play: a real ' + t + ' report was shown and dismissed (' + (cnt.shown[t] || 0) + ' shown, ' + (cnt.finished[t] || 0) + ' dismissed)');

  }
  // ---------------------------------------------------------------- 8. showChoice reopen, save and reload, hidden tab
  console.log(' -- reopen, reload, hidden tab');
  if (want('reopen')) {
  const pid = await ev(() => { ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; const ex = S.staff.find(s => s.role === 'explorer') || S.staff[0]; const r = ZCore.act('startExpedition', 'savanna', [ex.id], 1); if (!r.ok) return null; for (let i = 0; i < 12 && !S.projects.some(p => p.choice); i++) ZE.tick(S); S.reports = S.reports.filter(r => r.type === 'choice'); return (S.projects.find(p => p.choice) || {}).id || null; });
  check(!!pid, 'a pending project choice exists for the reopen test');
  if (pid) {
    await ev(() => ZT.flush()); await waitStack(s => s.stack.length, 3000); await sleep(400);
    await ev(() => { ZT.save(); }); await sleep(100);
    await page.reload(); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready, null, { timeout: 10000 }); await sleep(900);
    const st = await state(); check(st.stack.some(i => /mo-choice/.test(i)) && st.reports >= 1, 'a choice survives a reload: report pending and shown again (' + st.stack + ', reports ' + st.reports + ')');
    await shot('reload-choice');
    await ev(() => { ZT.WEEK_MS[1] = 1e9; ZT.WEEK_MS[2] = 1e9; });
    // dismiss by closing everything, then reopen through showChoice (project keeps running on its default)
    await ev(() => ZT.popAll()); await settled('choice closed without answering');
    check(await ev(id => ZT.S.projects.some(p => p.id === id && p.choice), pid), 'unanswered choice is still pending in the project');
    await ev(id => { window.__sc = false; ZMoments.showChoice(id, () => { window.__sc = true; }); }, pid); await sleep(300);
    check(await ev(() => ZT.stack().some(i => /mo-choice/.test(i))), 'ZMoments.showChoice reopens a pending choice');
    await drive('showChoice option 0', { pick: 0 }); await settled('showChoice'); check(await ev(() => window.__sc === true), 'showChoice calls done');
    check(await ev(id => !ZT.S.projects.some(p => p.id === id && p.choice), pid), 'answering it clears the project choice');
    await ev(() => { window.__sc = false; ZMoments.showChoice(424242, () => { window.__sc = true; }); }); await sleep(150);
    check(await ev(() => window.__sc === true && ZT.stack().length === 0), 'showChoice on a stale id just calls done');
  }
  // hidden tab mid-sequence
  await ev(() => { ZT.newGame({}); ZT.S.reports.length = 0; });
  await pushReport({ type: 'expedition', region: 'savanna', found: await mkFound(3), rp: 3, fragment: 0, notes: [], ups: [], staff: [] });
  await waitStack(s => s.stack.length, 3000); await sleep(300);
  await ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
  await sleep(5200);
  await ev(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(300);
  const hs = await state(); check(hs.cur && hs.cur.final, 'hidden tab: the sequence still reached its final card (' + JSON.stringify(hs.cur) + ')');
  for (let g = 0; g < 6 && (await state()).stack.length; g++) { await tapAway(); await sleep(450); }
  await settled('hidden tab');

  }
  if (want('inmenu')) {
    console.log(' -- called from inside an open menu screen');
    await ev(() => { ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.rp = 5000; S.reports.length = 0; });
    const openMenu = async () => { await ev(() => { ZCore.push({ id: 'menu-test', title: 'Test menu', render(b) { b.textContent = 'menu'; } }); }); await sleep(250); };
    const backOnMenu = async label => { const s = await waitStack(s => s.stack.length === 1 && s.stack[0] === 'menu-test', 3000); check(!!s, label + ': returns to the menu screen (stack ' + JSON.stringify((await state()).stack) + ')'); };
    // revealAnimal
    await openMenu(); await ev(() => { window.__d = 0; ZMoments.revealAnimal({ sp: 'lion', charm: 50, vigor: 40, wit: 30 }, { kicker: 'Test' }, () => { window.__d++; }); });
    await drive('revealAnimal in menu', { shots: null }); await backOnMenu('revealAnimal'); check(await ev(() => window.__d === 1), 'revealAnimal in menu: done called once');
    await ev(() => ZT.popAll());
    // result
    await openMenu(); await ev(() => { window.__d = 0; ZMoments.result({ title: 'Hi', lines: ['x'], good: true }, () => { window.__d++; }); });
    await drive('result in menu'); await backOnMenu('result'); check(await ev(() => window.__d === 1), 'result in menu: done called once');
    await ev(() => ZT.popAll());
    // revealHire
    await ev(() => { ZT.S.rank = 5; ZCore.act('advertise', 1); });
    await openMenu(); await ev(() => { window.__d = 0; ZMoments.revealHire(ZT.S.candidates, () => { window.__d++; }); });
    await waitStack(s => s.stack.length === 2, 3000); await sleep(700);
    await tapAway(); await sleep(500);   // ONE tap during the flips skips to the last card
    check(await ev(() => ZMoments.cur.id === 'mo-hire' && ZMoments.cur.final), 'revealHire: one tap during the flips jumps to the final card');
    await sleep(500); await tapAway(); await sleep(400);   // ONE tap on the final card leaves
    await backOnMenu('revealHire: exactly two taps in all (skip, leave)'); check(await ev(() => window.__d === 1), 'revealHire in menu: done called once');
    await ev(() => ZT.popAll());
    // showHappening: dismiss a pending happening, then reopen it
    await ev(() => { ZT.S.happening = null; ZE.debug.happening(ZT.S, 'school'); ZT.flush(); });
    await waitStack(s => s.stack.length > 0, 3000); await sleep(400); await ev(() => ZT.popAll()); await settled('school dismissed');
    check(await ev(() => !!ZT.S.happening && !!ZT.S.happening.options), 'a dismissed happening is still pending');
    await openMenu(); await ev(() => { window.__d = 0; ZMoments.showHappening(() => { window.__d++; }); });
    await waitStack(s => s.stack.length === 2, 3000); await sleep(400);
    await drive('showHappening option 0', { pick: 0 }); await backOnMenu('showHappening'); check(await ev(() => window.__d === 1 && !ZT.S.happening), 'showHappening: answered, done once, happening cleared');
    await ev(() => ZT.popAll());
    await ev(() => { window.__d = 0; ZMoments.showHappening(() => { window.__d++; }); }); await sleep(200);
    check(await ev(() => window.__d === 1 && ZT.stack().length === 0), 'showHappening with nothing pending just calls done');
    // winter show from inside a menu: long names fit, and the result card stays up until tapped
    await ev(() => { const S = ZT.S; S.reports.length = 0; const long = D => D.SPECIES_LIST.slice().sort((a, b) => b.name.length - a.name.length)[0]; const sp = long(ZD); S.animals[0].sp = sp.id; S.animals[0].name = 'Tansywansy'; ZE.debug.yearly(S, 'show'); });
    await openMenu(); await ev(() => { ZMoments.showShow(() => { window.__d = 1; }); }); await sleep(500); await shot('show-longname');
    const ov = await ev(() => [...document.querySelectorAll('.layer:not([hidden]) .mo-row .mid *')].filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis').length);
    check(ov === 0, 'show picker: no row text overflows its box (' + ov + ')');
    await page.locator('.layer:not([hidden]) .mo-row.tap').first().tap(); await sleep(300); await tapSel('.layer .confirm .btn.primary, .layer:not([hidden]) .btn.primary'); await sleep(900);
    check(await ev(() => ZT.stack().includes('mo-showresult')), 'showresult stays up after entering from inside a menu (' + (await ev(() => ZT.stack().join())) + ')');
    await tapAway(); await sleep(500); await tapAway(); await sleep(400);
    await ev(() => ZT.popAll());
    // combo card never shows a bare tile
    await ev(() => { const S = ZT.S; S.reports.length = 0; const h = S.items.find(i => i.k === 'hab'); S.animals.forEach(a => { a.hab = null; }); S.reports.push({ type: 'combo', id: 'picnic', anchor: h.id, members: [] }); ZT.flush(); });
    await waitStack(s => s.stack.length > 0, 3000); await sleep(900); await shot('combo-empty-hab'); await ev(() => ZT.popAll());
  }

  if (want('late')) {
    console.log(' -- late-game audit: 30+ animals, 8 staff, long names, at 390x844 and 375x667');
    const setupLate = () => ev(() => {
      ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.rp = 5000; S.reports.length = 0; S.happening = null; S.show = null; S.yearly = null;
      const longSp = ZD.SPECIES_LIST.slice().sort((a, b) => b.name.length - a.name.length)[0];
      const hab = S.items.find(i => i.k === 'hab'); const base = S.animals[0];
      while (S.animals.length < 32) S.animals.push(Object.assign({}, base, { id: 6000 + S.animals.length, sp: longSp.id, name: 'Tansywansy', charm: 40 + S.animals.length, hab: hab.id }));
      while (S.staff.length < 8) S.staff.push(Object.assign({}, S.staff[0], { id: 7000 + S.staff.length }));
      S.history = [{ year: 1, rating: 50, place: 7 }];
    });
    const cases = {
      show: () => { ZE.debug.yearly(ZT.S, 'show'); ZT.S.reports.length = 0; ZMoments.showShow(); },
      trader: () => { ZE.debug.caller(ZT.S, 'trader'); const O = ZT.S.offers; while (O.list.length < 7) O.list.push(Object.assign({}, O.list[0])); ZT.S.reports.length = 0; ZMoments.showCaller('trader'); },
      director: () => { ZE.debug.caller(ZT.S, 'director'); const O = ZT.S.offers; while (O.list.length < 7) O.list.push(Object.assign({}, O.list[0])); ZT.S.reports.length = 0; ZMoments.showCaller('director'); },
      headhunter: () => { ZE.debug.caller(ZT.S, 'headhunter'); ZT.S.reports.length = 0; ZMoments.showCaller('headhunter'); },
      final: () => { const S = ZT.S; S.history = [{ year: 20, rating: 900, place: 3 }]; S.reports.push({ type: 'final', score: ZE.finalScore(S) }); ZT.flush(); },
      yearend: () => { const S = ZT.S; const table = []; for (let i = 0; i < 12; i++) table.push({ name: 'Nordhaven Zoological Society ' + i, rating: 5000 - i * 100, me: i === 8 }); const awards = ['Best Exhibit', 'Rising Star', 'Fan Favourite', 'Green Award', 'Zoo of the Year'].map((n, i) => ({ id: 'a' + i, name: n, won: i % 2 === 0, mine: 'Something long about ' + n, bar: 40, prize: 12000 })); S.reports.push({ type: 'yearend', year: 7, table: table, place: 9, awards: awards, prize: 12000, stats: { income: 900000, cost: 500000, visitors: 123456, species: 40, bestReview: 36 } }); ZT.flush(); },
      expedition: () => { const found = []; for (let i = 0; i < 5; i++) found.push({ id: 900 + i, sp: ['lion', 'elephant', 'giraffe', 'zebra', 'tiger'][i], rarity: 3, isNew: i === 0, variant: i === 1, charm: 50, vigor: 40, wit: 30, hab: null }); ZT.S.reports.push({ type: 'expedition', region: 'savanna', found: found, rp: 22, fragment: 3, notes: [], ups: ['Ada Brandt', 'Benedikt Halvorsen'], staff: [] }); ZT.flush(); },
      review: () => { const S = ZT.S; const h = S.items.find(i => i.k === 'hab'); S.reports.push({ type: 'review', hab: h.id, biome: 'savanna', theme: 'conserve', aff: 2, fitWord: 'Amazing fit', firstTime: true, sc: {}, critics: [9, 9, 9, 9].map((n, i) => ({ key: 'k' + i, name: ['Animals', 'Habitat', 'Fun', 'Learning'][i], score: n })), total: 36, hof: true, repeat: true, fired: 2, star: { animal: 6001, stat: 'charm', score: 'fun', gain: 1.4 }, boost: { good: false, amt: -2 }, money: 82000, rep: 40, rp: 12, lead: 1 }); ZT.flush(); },
      birth: () => { const kid = n => ({ id: 800, sp: 'zebra', name: n, hab: null, rolls: ['charm', 'vigor', 'wit'].map(st => ({ stat: st, parents: 41, value: 49, delta: 8, lucky: st === 'vigor' })), variantChance: 0.06, variant: true }); ZT.S.reports.push({ type: 'birth', fail: false, a: 1, b: 2, lead: 1, sp: 'zebra', chance: 0.7, kids: [kid('Tansywansy'), kid('Longnamed')], twins: true, firstBred: true }); ZT.flush(); },
      hire: () => { const c = []; for (let i = 0; i < 4; i++) c.push(Object.assign({}, ZT.S.staff[0], { id: 8000 + i, name: 'Maximilian Featherstonehaugh', star: i === 1 })); ZMoments.revealHire(c); },
      stray: () => { ZE.debug.happening(ZT.S, 'stray'); ZT.flush(); },
      yearlyplan: () => { ZE.debug.yearly(ZT.S, 'openday'); ZT.flush(); },
      rankup: () => { ZT.S.reports.push({ type: 'rankup', rank: 9, name: 'Zoo Legend', unlocks: ['Staff room for 12', 'More land for sale', 'Region: The Deep Reef', 'Hiring: TV appeal', 'Campaign: TV ad', 'Tickets $14'] }); ZT.flush(); }
    };
    for (const [w, h] of [[390, 844], [375, 667]]) {
      await page.setViewportSize({ width: w, height: h }); await sleep(300);
      for (const name of Object.keys(cases)) {
        await setupLate(); await ev(fn => { new Function('return (' + fn + ')')()(); }, cases[name].toString());
        await waitStack(s => s.stack.length > 0, 3000);
        await waitStack(s => (s.cur && s.cur.final) || /mo-(show|caller|choice|happening|yearlyplan)/.test(s.stack[s.stack.length - 1] || ''), 6000); await sleep(2600);
        const m = await ev(() => { const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); if (!l) return null; const p = l.querySelector('.panel').getBoundingClientRect(); const f = l.querySelector('.mo-foot'); const fb = f ? [...f.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return { b: Math.round(r.bottom), h: Math.round(r.height), t: Math.round(r.top) }; }) : null; return { pt: Math.round(p.top), pb: Math.round(p.bottom), ih: innerHeight, fb: fb, id: l.dataset.screen }; });
        if (!m) { check(false, name + ' @' + w + 'x' + h + ': a screen opened'); continue; }
        const okPanel = m.pt >= 0 && m.pb <= m.ih;
        const okFoot = !m.fb || m.fb.every(b => b.b <= m.ih && b.t >= 0 && b.h >= 55);
        check(okPanel && okFoot, name + ' @' + w + 'x' + h + ' (' + m.id + '): panel inside the screen' + (m.fb ? ' and pinned buttons visible, 56+ px' : ' (tap anywhere to leave)') + ' ' + JSON.stringify({ pt: m.pt, pb: m.pb, fb: m.fb }));
        await shot('late-' + name + (w === 375 ? '-small' : ''));
        if (name === 'final') {
          await page.locator('.mo-foot .btn.primary').first().tap(); await sleep(500);
          const m2 = await ev(() => { const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); const f = l.querySelector('.mo-foot'); return { pb: Math.round(l.querySelector('.panel').getBoundingClientRect().bottom), ih: innerHeight, fb: f ? [...f.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().bottom)) : null }; });
          check(m2.pb <= m2.ih && !!m2.fb && m2.fb.every(b => b <= m2.ih), 'new zoo screen @' + w + 'x' + h + ': buttons pinned and visible ' + JSON.stringify(m2)); await shot('late-newzoo' + (w === 375 ? '-small' : ''));
        }
        for (let g = 0; g < 8 && (await state()).stack.length; g++) {
          const f = page.locator('.layer:not([hidden]) .mo-foot .btn.ghost'); const c = page.locator('.layer:not([hidden]) .choices .btn.opt');
          if (await f.count()) await f.last().tap({ force: true }); else if (await c.count()) await c.first().tap({ force: true }); else await tapAway();
          await sleep(450);
        }
        await ev(() => ZT.popAll()); await sleep(150);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  }

  if (want('title')) {
    console.log(' -- title screen');
    await page.goto(URL); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready, null, { timeout: 10000 }); await sleep(600);
    const st = await ev(() => ({ stack: ZT.stack(), hasS: !!ZT.S }));
    check(st.stack.length > 0 && !st.stack.some(i => /^mo-/.test(i)), 'title is up and no moment is on top of it (' + st.stack + ')');
    await sleep(1500); const st2 = await ev(() => ZT.stack());
    check(!st2.some(i => /^mo-/.test(i)), 'still no moment after a moment on the title screen');
    await boot();
  }

  if (want('choices')) {
    console.log(' -- event choices use symbols');
    for (const key of ['star', 'boost']) {
      const ok = await ev(k => {
        ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.rp = 5000; S.reports.length = 0;
        const hab = S.items.find(i => i.k === 'hab'); const lead = ZE.freeStaff(S)[0];
        if (!ZCore.act('startEvent', hab.id, 'feeding', lead.id).ok) return false;
        for (let i = 0; i < 6; i++) { ZE.tick(S); const p = S.projects.find(x => x.choice && x.choice.key === k); if (p) { S.reports = S.reports.filter(r => r.type === 'choice' && r.pid === p.id); if (k === 'boost' || S.reports.length) { ZT.flush(); return true; } } if (k === 'boost') { const q = S.projects.find(x => x.choice && x.choice.key === 'star'); if (q) ZE.resolveChoice(S, q.id, 0); } }
        return false;
      }, key);
      check(ok, key + ' choice raised by a real event');
      if (!ok) continue;
      await waitStack(s => s.stack.length > 0, 3000); await sleep(500); await shot('choice-' + key + '-icons');
      const info = await ev(() => { const t = [...document.querySelectorAll('.layer:not([hidden]) .choices .btn.opt')].map(b => b.textContent); return { txt: t.join(' | '), imgs: document.querySelectorAll('.layer:not([hidden]) .choices .mo-det img').length }; });
      check(!/Charm|Energy|Smarts|Vigor|Wit|Science|Hosting/.test(info.txt) && info.imgs > 0, key + ' options show stat/skill symbols, no stat words (' + info.txt.slice(0, 120) + ' / ' + info.imgs + ' icons)');
      await ev(() => ZT.popAll()); await sleep(200);
    }
  }

  if (want('blank')) {
    console.log(' -- blank-land start (?play=blank)');
    await page.goto(URL + '?play=blank'); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready && window.ZMoments, null, { timeout: 10000 }); await ev(() => { ZT.WEEK_MS[1] = 1e9; ZT.WEEK_MS[2] = 1e9; });
    await ev(() => ZT.newGame({ starter: false }));
    const base = await ev(() => ({ items: ZT.S.items.length, offers: ZT.S.offers, animals: ZT.S.animals.length, open: ZE.isOpen(ZT.S) }));
    check(base.items === 0 && !base.open, 'blank start: no items, zoo not open (' + JSON.stringify({ i: base.items, o: base.offers, a: base.animals }) + ')');
    const clean = async label => {
      const t = await ev(() => { const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); if (!l) return null; return { txt: l.textContent, empty: [...l.querySelectorAll('img')].filter(i => !i.getAttribute('src')).length, imgs: l.querySelectorAll('img').length }; });
      check(!!t && !/NaN|undefined|null/.test(t.txt) && t.empty === 0, label + ': no NaN / undefined / empty pictures (' + (t ? t.imgs + ' images' : 'no screen') + ')');
    };
    // year end on a bare zoo
    await ev(() => { const S = ZT.S; S.reports.length = 0; for (let i = 0; i < 48; i++) ZE.tick(S); S.reports = S.reports.filter(r => r.type === 'yearend'); ZT.flush(); });
    await waitStack(s => s.stack.length > 0, 3000); await waitStack(s => s.cur && s.cur.final, 6000); await sleep(2800); await shot('blank-yearend'); await clean('bare year end');
    for (let g = 0; g < 6 && (await state()).stack.length; g++) { await tapAway(); await sleep(450); }
    await settled('bare year end');
    // expedition return on a bare zoo: finds go to the pen
    await ev(() => ZT.newGame({ starter: false }));
    const started = await ev(() => { const S = ZT.S; S.money = 1e6; S.reports.length = 0; const ex = ZE.freeStaff(S)[0]; if (!ex) return 'no staff'; const r = ZCore.act('startExpedition', 'savanna', [ex.id], 1); return r.ok ? 'ok' : r.msg; });
    check(started === 'ok', 'blank start: an expedition can be started with no habitat (' + started + ')');
    if (started === 'ok') {
      const got = await ev(() => { const S = ZT.S; for (let i = 0; i < 30; i++) { ZE.tick(S); const r = S.reports.filter(x => x.type === 'expedition'); if (r.length) { S.reports = r; ZT.flush(); return true; } S.reports.length = 0; } return false; });
      check(got, 'the expedition came home');
      if (got) {
        await waitStack(s => s.stack.length > 0, 3000); await sleep(900); await shot('blank-expedition-a'); await clean('expedition find on a bare zoo');
        await waitStack(s => s.cur && s.cur.final, 8000); await sleep(2200); await shot('blank-expedition-final'); await clean('expedition summary on a bare zoo');
        const pen = await ev(() => { const f = ZT.S.reports.length; return f; });
        for (let g = 0; g < 8 && (await state()).stack.length; g++) { await tapAway(); await sleep(450); }
        await settled('bare expedition');
      }
    }
    // first three placements complete Safari Picnic: the combo pop-up
    await ev(() => ZT.newGame({ starter: false }));
    const placed = await ev(() => {
      const S = ZT.S; S.money = 1e6; S.reports.length = 0;
      const cells = []; for (let row = 19; row >= 0; row--) for (let col = 0; col < 10; col++) { const q = ZE.fromOffset(col, row); cells.push(q); }
      const ok = (k, t, q, r) => ZE.canPlace(S, k, t, q, r, 0);
      let hab = null;
      for (const [q, r] of cells) if (ok('hab', 'savanna', q, r)) { const res = ZCore.act('build', 'hab', 'savanna', q, r, 0); if (res.ok) { hab = res.id; break; } }
      if (hab == null) return 'no habitat';
      const tryFac = t => { for (const [q, r] of cells) if (ok('fac', t, q, r)) { const res = ZCore.act('build', 'fac', t, q, r, 0); if (res.ok) { if (S.reports.some(x => x.type === 'combo') || ZT.stack().length) return 'combo'; ZCore.act('remove', res.id); } } return 'none'; };
      const a = ZE.cells(ZE.item(S, hab));
      // snack first (any spot touching the habitat), then bench until the combo appears
      let snack = null;
      for (const [q, r] of cells) if (ok('fac', 'snack', q, r)) { const res = ZCore.act('build', 'fac', 'snack', q, r, 0); if (res.ok) { if (((ZE.layout(S).nb || {})[res.id] || []).some(x => x === hab || (x && x.id === hab))) { snack = res.id; break; } ZCore.act('remove', res.id); } }
      if (snack == null) return 'no snack spot';
      return tryFac('bench');
    });
    check(placed === 'combo', 'placing habitat, snack stand and bench raised the Safari Picnic combo (' + placed + ')');
    if (placed === 'combo') {
      await waitStack(s => s.stack.some(i => /mo-combo/.test(i)), 3000); await sleep(1500); await shot('blank-combo'); await clean('first combo');
      const lay = await layout(); check(!lay || (lay.over <= 1 && lay.top >= 0 && lay.bottom <= 844), 'combo card fits the screen');
      for (let g = 0; g < 6 && (await state()).stack.length; g++) { await tapAway(); await sleep(450); }
      await settled('first combo');
    }
    // early rank-up
    await ev(() => ZT.newGame({ starter: false }));
    await ev(() => { const S = ZT.S; S.reports.length = 0; S.reports.push({ type: 'rankup', rank: 2, name: ZD.RANK_NAME[2], unlocks: ZE.rankUnlocks(2) }); ZT.flush(); });
    await waitStack(s => s.stack.length > 0, 3000); await sleep(1500); await shot('blank-rankup'); await clean('early rank-up');
    for (let g = 0; g < 4 && (await state()).stack.length; g++) { await tapAway(); await sleep(450); }
    await settled('early rank-up');
    await boot();
  }

  // ---------------------------------------------------------------- 9. errors
  const errs = await ev(() => ZT.errors.slice());
  check(errs.length === 0, 'no captured errors inside the game (' + errs.length + ')' + (errs.length ? ': ' + errs.slice(0, 3).join(' || ') : ''));
  check(consoleErrors.length === 0, 'no console errors (' + consoleErrors.length + ')' + (consoleErrors.length ? ': ' + consoleErrors.slice(0, 3).join(' || ') : ''));
  check(await ev(() => !ZMoments.errors.length), 'ZMoments.errors is empty');
  await browser.close();
}

(async () => {
  for (const b of browsers) { try { await run(b); } catch (e) { console.log('  FAIL crashed in ' + b + ': ' + (e && e.stack || e)); failures++; } }
  console.log('\n' + (failures ? failures + ' FAILURES' : 'ALL PASSED') + (warnings ? ', ' + warnings + ' warnings' : ''));
  process.exit(failures ? 1 : 0);
})();
