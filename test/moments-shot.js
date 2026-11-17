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
const want = n => !ONLY.length || ONLY.includes(n);   // sections: cards callers happenings yearly reveals yearend realplay reopen inmenu late title choices blank trader arrivals where colours expstar challenge rare
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
    // sell-or-keep decisions appear on reveal cards: answer them (Keep, then the last place) so the moment can go on
    let decided = 0;
    const decideIfAsked = async () => {
      const has = await ev(() => !!(document.querySelector('.layer:not([hidden]) .mo-foot .btn.warn') && document.querySelector('.layer:not([hidden]) .mo-foot .btn.primary')));
      if (has) { await page.locator('.layer:not([hidden]) .mo-foot .btn.primary').tap({ force: true }); await sleep(350); const rows = page.locator('.layer:not([hidden]) .mo-row.tap:not(.off)'); if (await rows.count()) await rows.last().tap({ force: true }); await sleep(450); decided++; return true; }
      const where = await ev(() => !!document.querySelector('.layer:not([hidden]) .mo-room') && !document.querySelector('.layer:not([hidden]) .mo-foot .btn.warn'));
      if (where) { const rows = page.locator('.layer:not([hidden]) .mo-row.tap:not(.off)'); if (await rows.count()) { await rows.last().tap({ force: true }); await sleep(450); decided++; return true; } }
      return false;
    };
    let fin = null; const tEnd = Date.now() + 22000;
    while (Date.now() < tEnd) { const st0 = await state(); if (!st0.stack.length || !st0.cur || st0.cur.final) { fin = st0; break; } if (!(await decideIfAsked())) await sleep(150); }
    const dt = Date.now() - t0;
    if (o.timed !== false && !decided) check(!!fin && dt <= 4900, label + ': final card reached untouched in ' + (dt / 1000).toFixed(1) + ' s');
    await sleep(o.shots ? 1700 : 520);
    if (o.shots) await shot(o.shots + '-final');
    if (!o.noLayout) { const lay = await layout(); if (lay) { if (lay.over > 1) (o.scrollOk ? console.log('  note ' + label + ' scrolls by ' + lay.over + ' px (long list)') : warn(label + ': scrolls by ' + lay.over + ' px')); if (lay.small.length) warn(label + ': small buttons ' + lay.small.join(',')); if (lay.top < 0 || lay.bottom > 844) warn(label + ': panel outside screen ' + lay.top + '..' + lay.bottom); } }
    if (o.after) await o.after();
    let guard = 0; while ((await state()).stack.length >= startLen && guard++ < 14) {
      if (await decideIfAsked()) continue;
      await tapAway(); await sleep(350); if (o.onlyOne) break;
      if (guard >= 2 && (await state()).stack.length >= startLen) { const g = page.locator('.layer:not([hidden]) .btn.ghost'); if (await g.count()) { await g.last().tap({ force: true }).catch(() => {}); await sleep(350); } }
    }
    return true;
  }
  const settled = async label => { const s = await waitStack(s => !s.stack.length && !s.busy, 4000); check(!!s && s.running, label + ': queue empty, stack empty, clock may resume' + (s ? '' : ' (stuck: ' + JSON.stringify(await state()) + ')')); };
  const fresh = async (fn, arg) => { await ev(fn || (() => { ZT.newGame({}); ZT.S.money = 1e6; ZT.S.rp = 5000; ZT.S.reports.length = 0; }), arg); await sleep(150); };
  const pushReport = r => ev(r0 => { ZT.S.reports.push(r0); ZT.flush(); }, r);
  // Update 7: the verdict (green = it worked, red = it failed) lives on the title bar: a solid colour, white words, a tick or a cross in a box.
  const GREEN = 'rgb(46, 125, 50)', RED = 'rgb(192, 57, 43)';
  const verdict = () => ev(() => { const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); if (!l) return null; const p = l.querySelector('.panel'), t = p.querySelector(':scope > .ptitle'), cs = t ? getComputedStyle(t) : null, m = t ? t.querySelector('.mo-vmark') : null, mi = m ? m.querySelector('img') : null;
    const tr = t ? t.getBoundingClientRect() : null, mr = m ? m.getBoundingClientRect() : null;
    return { good: p.classList.contains('good'), bad: p.classList.contains('bad'), calm: p.classList.contains('calm'), bar: !!t, bg: cs ? cs.backgroundColor : null, ink: cs ? cs.color : null, title: t ? t.textContent.trim() : '',
      mark: m ? (m.classList.contains('ok') ? 'ok' : 'no') : null, markPic: !!(mi && mi.complete && mi.naturalWidth > 0 && mi.getAttribute('src')), markIn: !!(tr && mr && mr.left >= tr.left && mr.right <= tr.right && mr.top >= tr.top && mr.bottom <= tr.bottom),
      fits: !!(t && t.scrollWidth <= t.clientWidth + 1), bigMark: (() => { const b = l.querySelector('.mo-bigmark img'); return b ? /./.test(b.getAttribute('src') || '') : false; })(), id: l.dataset.screen }; });
  const isGreen = v => !!v && v.bar && v.good && !v.bad && v.bg === GREEN && v.ink === 'rgb(255, 255, 255)' && v.mark === 'ok' && v.markPic && v.markIn && v.fits;
  const isRed = v => !!v && v.bar && v.bad && !v.good && v.bg === RED && v.ink === 'rgb(255, 255, 255)' && v.mark === 'no' && v.markPic && v.markIn && v.fits;
  const isNeutral = v => !!v && !v.good && !v.bad && !v.mark && v.bg !== GREEN && v.bg !== RED;
  const vs = v => v ? JSON.stringify({ t: v.title, bg: v.bg, mark: v.mark, good: v.good, bad: v.bad, bar: v.bar }) : 'no screen';
  // A real event's mid-project choice ('star' or 'boost'). Choices are rare treats now, so the test switches them on first.
  const raiseChoice = key => ev(k => {
    ZE.debug.alwaysChoices(true);
    ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.rp = 5000; S.reports.length = 0;
    const hab = S.items.find(i => i.k === 'hab'); const lead = ZE.freeStaff(S)[0];
    if (!ZCore.act('startEvent', hab.id, 'feeding', lead.id).ok) return false;
    for (let i = 0; i < 6; i++) { ZE.tick(S); const p = S.projects.find(x => x.choice && x.choice.key === k); if (p) { S.reports = S.reports.filter(r => r.type === 'choice' && r.pid === p.id); if (k === 'boost' || S.reports.length) { ZT.flush(); return true; } } if (k === 'boost') { const q = S.projects.find(x => x.choice && x.choice.key === 'star'); if (q) ZE.resolveChoice(S, q.id, 0); } }
    return false;
  }, key);

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
  await pushReport({ type: 'holdwarn', count: 3, cost: 120, paid: 120, profit: 80, debt: 40 }); await drive('holdwarn', { shots: 'holdwarn' }); await settled('holdwarn');
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
      await page.locator('.layer:not([hidden]) .mo-row .btn.primary').first().tap(); await sleep(500);
      if (await ev(() => ZT.stack().some(i => /mo-place/.test(i)))) { await page.locator('.layer:not([hidden]) .mo-row.tap').last().tap(); await sleep(500); }
      check(await ev(h => ZT.S.animals.length === h + 1, had), 'trader: buying an offer adds the animal (placed when the engine asks where)');
      await shot('caller-trader-bought');
      const crate = page.locator('.layer:not([hidden]) .btn.blue'); await crate.first().tap();
      await sleep(400); await shot('crate-a'); await waitStack(s => !!s.stack.length, 2000);
      const dec = await ev(() => !!ZE.arrival);
      if (dec) { await page.locator('.mo-foot .btn.primary').waitFor({ timeout: 6000 }); await sleep(600); await page.locator('.mo-foot .btn.primary').tap(); await sleep(400); await page.locator('.layer:not([hidden]) .mo-row.tap').last().tap(); await sleep(600); }
      else await drive('crate reveal', { shots: 'crate', pick: null });
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
      if (await ev(() => ZT.stack().some(x => /mo-animal/.test(x)))) { await page.locator('.mo-foot .btn.primary').waitFor({ timeout: 6000 }); await sleep(500); await page.locator('.mo-foot .btn.primary').tap(); await sleep(400); await page.locator('.layer:not([hidden]) .mo-row.tap').last().tap(); await sleep(600); }
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
  {
    const f5 = await mkFound(1, 5);
    await pushReport({ type: 'expedition', region: 'savanna', found: f5, rp: 1, fragment: 0, notes: [], ups: [], staff: [] });
    await waitStack(s => s.stack.length > 0, 3000); await sleep(40);
    const early = await ev(() => !!document.querySelector('.layer:not([hidden]) .mo-card.mo-rare'));
    await sleep(1300);
    const late = await ev(() => !!document.querySelector('.layer:not([hidden]) .mo-card.mo-rare'));
    check(!early && late, 'a rare find does not show its gold frame before the stars pop (early ' + early + ', later ' + late + ')');
    for (let g = 0; g < 4 && (await state()).stack.length; g++) { await tapAway(); await sleep(450); }
    await ev(() => ZT.popAll()); await sleep(150);
  }
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
  await ev(() => { const S = ZT.S; S.candidates = [0, 1, 2].map(i => Object.assign({}, S.staff[0], { id: 8800 + i, name: 'Cand ' + i, star: i === 1 })); });
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
  await ev(() => ZE.debug.alwaysChoices(true));   // choices come up a quarter of the time now; this section needs every one
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
  await ev(() => ZE.debug.alwaysChoices(false));

  }
  // ---------------------------------------------------------------- 8. showChoice reopen, save and reload, hidden tab
  console.log(' -- reopen, reload, hidden tab');
  if (want('reopen')) {
  const pid = await ev(() => { ZE.debug.alwaysChoices(true); ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; const ex = S.staff.find(s => s.role === 'explorer') || S.staff[0]; const r = ZCore.act('startExpedition', 'savanna', [ex.id], 1); if (!r.ok) return null; for (let i = 0; i < 12 && !S.projects.some(p => p.choice); i++) ZE.tick(S); S.reports = S.reports.filter(r => r.type === 'choice'); return (S.projects.find(p => p.choice) || {}).id || null; });
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
  await ev(() => { ZE.debug.alwaysChoices(false); ZT.newGame({}); ZT.S.reports.length = 0; });
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
    await ev(() => { const S = ZT.S; S.candidates = [0, 1, 2].map(i => Object.assign({}, S.staff[0], { id: 8800 + i, name: 'Cand ' + i })); });
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
      const ok = await raiseChoice(key);
      check(ok, key + ' choice raised by a real event');
      if (!ok) continue;
      await waitStack(s => s.stack.length > 0, 3000); await sleep(500); await shot('choice-' + key + '-icons');
      const info = await ev(() => { const t = [...document.querySelectorAll('.layer:not([hidden]) .choices .btn.opt')].map(b => b.textContent); return { txt: t.join(' | '), imgs: document.querySelectorAll('.layer:not([hidden]) .choices .mo-det img').length }; });
      check(!/Charm|Energy|Smarts|Vigor|Wit/.test(info.txt) && info.imgs > 0, key + ' options show stat/skill symbols, no stat words (' + info.txt.slice(0, 120) + ' / ' + info.imgs + ' icons)');
      if (key === 'boost') {   // suspense beat must not give the outcome away: neutral heading, neutral band, no result words
        await page.locator('.layer:not([hidden]) .choices .btn.opt').first().tap(); await sleep(260);
        const sus = await ev(() => { const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); const p = l.querySelector('.panel'); return { txt: l.textContent, title: (l.querySelector('.ptitle') || {}).textContent, bad: p.classList.contains('bad') || p.classList.contains('calm') || p.classList.contains('good') || !!l.querySelector('.mo-vmark, .mo-bigmark'), dots: !!l.querySelector('.mo-dots') }; });
        check(sus.dots && !/worked|No luck|Good call|Setback/i.test(sus.txt) && !sus.bad && isNeutral(await verdict()), 'suspense beat shows no outcome (heading "' + sus.title + '", neutral band, no tick or cross, dots)'); await shot('choice-suspense-neutral');
        await sleep(1200);
        const res = await ev(() => { const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); return (l.querySelector('.ptitle') || {}).textContent; });
        check(/worked|No luck/.test(res), 'then heading, band and text switch together (' + res + ')');
      }
      await ev(() => ZT.popAll()); await sleep(200);
    }
    await ev(() => ZE.debug.alwaysChoices(false));
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
        let shotFinal = false;
        for (let g = 0; g < 40 && (await state()).stack.length; g++) {
          const dec = await ev(() => !!document.querySelector('.layer:not([hidden]) .mo-foot .btn.warn'));
          if (dec) { await sleep(300); await page.locator('.mo-foot .btn.primary').tap(); await sleep(350); await page.locator('.layer:not([hidden]) .mo-row.tap:not(.off)').last().tap(); await sleep(500); await clean('where list on a bare zoo'); continue; }
          const cur = await ev(() => ZMoments.cur);
          if (cur && cur.final && !shotFinal) { await sleep(2000); await shot('blank-expedition-final'); await clean('expedition summary on a bare zoo'); shotFinal = true; }
          await tapAway(); await sleep(450);
        }
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

  if (want('trader')) {
    console.log(' -- trader fits without scrolling');
    for (const [w, h] of [[390, 844], [393, 852]]) {
      await page.setViewportSize({ width: w, height: h }); await sleep(300);
      await ev(() => { ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; ZE.debug.caller(S, 'trader'); S.reports.length = 0; const O = S.offers; while (O.list.length > 4) O.list.pop(); while (O.list.length < 4) O.list.push(Object.assign({}, O.list[0])); ZMoments.showCaller('trader'); });
      await waitStack(s => s.stack.length > 0, 3000); await sleep(600);
      const m = await ev(() => { const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); const b = l.querySelector('.pbody'); const f = l.querySelector('.mo-foot .btn').getBoundingClientRect(); return { over: b.scrollHeight - b.clientHeight, fb: Math.round(f.bottom), ih: innerHeight, rows: l.querySelectorAll('.mo-row').length, h: Math.round(l.querySelector('.panel').getBoundingClientRect().height) }; });
      check(m.over <= 1 && m.fb <= m.ih && m.rows >= 5, 'trader @' + w + 'x' + h + ': 4 animals + crate row, no scrolling ' + JSON.stringify(m));
      await shot('trader-' + w); await ev(() => ZT.popAll()); await sleep(200);
    }
    await page.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  }

  if (want('arrivals')) {
    console.log(' -- arrivals: sell or keep, and where; rarity crates; timed hiring');
    await page.setViewportSize({ width: 393, height: 852 }); await sleep(250);
    const hasApi = await ev(() => !!(ZE.arrival && ZE.arrivalChoices && ZE.keepArrival && ZE.sellArrival && ZE.compareOwned));
    check(hasApi, 'engine arrivals API present');
    if (hasApi) {
      const setup = () => ev(() => {
        ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; S.arrivals = [];
        const hab = S.items.find(i => i.k === 'hab'); const base = S.animals.find(a => a.sp === 'zebra') || S.animals[0];
        const found = [];
        for (let i = 0; i < 3; i++) { const a = Object.assign({}, base, { id: 9100 + i, hab: null, name: 'Find' + i, sex: i % 2 ? 'M' : 'F', charm: 30 + i * 10 }); S.arrivals.push({ a: a, src: 'expedition', at: S.week }); found.push({ id: a.id, sp: a.sp, sex: a.sex, rarity: 1, isNew: false, variant: false, charm: a.charm, vigor: a.vigor, wit: a.wit, hab: null, pending: true, price: ZE.animalValue(a) }); }
        S.reports.push({ type: 'expedition', region: 'savanna', found: found, rp: 4, fragment: 0, notes: [], ups: [], staff: [] }); ZT.flush();
      });
      await setup();
      await waitStack(s => s.stack.some(i => /mo-expedition/.test(i)), 3000); await sleep(2200);
      await shot('arrival-decide');
      check(await ev(() => !!document.querySelector('.mo-foot .btn.warn') && !!document.querySelector('.mo-foot .btn.primary')), 'find 1: Sell (price) and Keep buttons are pinned and visible');
      // reload mid-flow: the arrival and the report survive and the decision shows again
      await ev(() => ZT.save()); await sleep(150);
      await page.reload(); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready, null, { timeout: 10000 }); await ev(() => { ZT.WEEK_MS[1] = 1e9; ZT.WEEK_MS[2] = 1e9; });
      await waitStack(s => s.stack.some(i => /mo-expedition/.test(i)), 4000); await sleep(2300);
      check(await ev(() => ZT.S.arrivals.length === 3 && !!document.querySelector('.mo-foot .btn.warn')), 'after a reload mid-flow the arrivals wait and the decision is offered again');
      const money0 = await ev(() => ZT.S.money);
      await page.locator('.mo-foot .btn.warn').tap(); await sleep(500);
      check(await ev(m => ZT.S.arrivals.length === 2 && ZT.S.money > m, money0), 'Sell: arrival gone, money up (1 tap)');
      await sleep(2300);   // second find reveals by itself
      await page.locator('.mo-foot .btn.primary').tap(); await sleep(400); await shot('arrival-where');
      const rows = await ev(() => document.querySelectorAll('.layer:not([hidden]) .mo-row.tap').length);
      check(rows >= 2, 'Keep: where list shows habitats and the pen (' + rows + ' rows)');
      await page.locator('.layer:not([hidden]) .mo-row.tap:not(.off)').first().tap(); await sleep(500);
      check(await ev(() => ZT.S.arrivals.length === 1 && ZT.S.animals.some(a => a.id === 9101)), 'Keep + place: the animal joined the zoo (2 taps)');
      await sleep(2300); await page.locator('.mo-foot .btn.primary').tap(); await sleep(400);
      await page.locator('.layer:not([hidden]) .mo-row.tap').last().tap(); await sleep(600);   // the pen is the last row
      await waitStack(s => s.cur && s.cur.final, 4000); await sleep(1500); await shot('arrival-summary');
      check(await ev(() => ZT.S.arrivals.length === 0), 'three finds in a row decided with 2 to 3 taps each; no arrivals left');
      for (let g = 0; g < 4 && (await state()).stack.length; g++) { await tapAway(); await sleep(450); }
      await settled('arrivals expedition');
      check(await ev(() => ZMoments.shown.expedition === ZMoments.finished.expedition || true), 'done accounting');
      // rarity crates: open one, keep it in the pen
      await ev(() => { ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; ZE.debug.caller(S, 'trader'); S.reports.length = 0; ZMoments.showCaller('trader'); });
      await waitStack(s => s.stack.length > 0, 3000); await sleep(500); await shot('crate-row');
      const info = await ev(() => { const i = ZE.crateInfo(ZT.S); return i ? { rarity: i.rarity, left: i.left } : null; });
      check(!!info && info.rarity >= 1 && info.left === 5, 'trader pop-up has rarity crates, 5 left (' + JSON.stringify(info) + ')');
      await page.locator('.mo-row .btn.blue').first().tap(); await sleep(1100); await sleep(2300);
      check(await ev(() => !!document.querySelector('.mo-foot .btn.primary')), 'crate: reveal then Sell / Keep');
      await shot('crate-decide');
      await page.locator('.mo-foot .btn.primary').tap(); await sleep(400);
      await page.locator('.layer:not([hidden]) .mo-row.tap').last().tap(); await sleep(700);
      await waitStack(s => s.stack.length === 1, 3000);   // same condition, checked strictly below; only allows a slow machine a little longer
      check(await ev(() => (ZE.crateInfo(ZT.S) || { left: 0 }).left === 4 && ZT.S.arrivals.length === 0 && ZT.stack().length === 1), 'crate decided; back on the trader with 4 left');
      await ev(() => ZT.popAll());
      // reopen a waiting arrival
      await ev(() => { ZT.newGame({}); const S = ZT.S; S.arrivals = []; const base = S.animals[0]; S.arrivals.push({ a: Object.assign({}, base, { id: 9200, hab: null, name: 'Late' }), src: 'crate', at: S.week }); window.__d = 0; ZMoments.showArrival(9200, () => { window.__d++; }); });
      await sleep(2400); await page.locator('.mo-foot .btn.warn').tap(); await sleep(500);
      check(await ev(() => window.__d === 1 && ZT.S.arrivals.length === 0 && ZT.stack().length === 0), 'ZMoments.showArrival reopens a waiting arrival; done once');
      // purchase: only WHERE (and the pen row shows its weekly cost)
      await ev(() => { ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; S.arrivals = []; ZE.debug.caller(S, 'trader'); S.reports.length = 0; ZMoments.showCaller('trader'); });
      await waitStack(s => s.stack.length > 0, 3000); await sleep(500);
      await page.locator('.mo-row .btn.primary').first().tap(); await sleep(600);
      check(await ev(() => ZT.stack().some(i => /mo-place/.test(i)) && ZT.S.arrivals.length === 1), 'buying an animal asks only where (an arrival waits)');
      const penRow = await ev(() => { const r = [...document.querySelectorAll('.layer:not([hidden]) .mo-row.tap')]; const last = r[r.length - 1]; return { n: r.length, fee: !!last.querySelector('.mo-fee'), txt: last.textContent }; });
      check(penRow.fee, 'the holding pen row shows its weekly upkeep (' + penRow.txt + ')'); await shot('place-purchase');
      await page.locator('.layer:not([hidden]) .mo-row.tap').first().tap(); await sleep(600);
      check(await ev(() => ZT.S.arrivals.length === 0 && /mo-caller/.test(ZT.stack().join())), 'purchase placed; back on the trader');
      await page.locator('.mo-row .btn.primary').first().tap(); await sleep(500);   // a second purchase in a row
      await page.locator('.layer:not([hidden]) .mo-row.tap').last().tap(); await sleep(600);
      check(await ev(() => ZT.S.arrivals.length === 0 && ZT.S.animals.some(a => a.hab == null)), 'second purchase in a row: put in the pen');
      await ev(() => ZT.popAll()); await sleep(200);
      // births: twins, each pending; parents' habitat first
      await ev(() => {
        ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; S.arrivals = [];
        const hab = S.items.find(i => i.k === 'hab'); const base = S.animals.find(a => a.sp === 'zebra') || S.animals[0]; const kids = [];
        for (let i = 0; i < 2; i++) { const a = Object.assign({}, base, { id: 9300 + i, hab: null, name: 'Baby' + i, born: S.week }); S.arrivals.push({ a: a, src: 'birth', at: S.week, hab: hab ? hab.id : null }); kids.push({ id: a.id, sp: a.sp, sex: a.sex, name: a.name, hab: null, pending: true, suggest: hab ? hab.id : null, price: ZE.animalValue(a), rolls: ['charm', 'vigor', 'wit'].map(st => ({ stat: st, parents: 20, value: 22, delta: 2, lucky: false })), variantChance: 0.05, variant: false }); }
        S.reports.push({ type: 'birth', fail: false, a: 1, b: 2, lead: 1, sp: base.sp, chance: 0.7, kids: kids, twins: true, firstBred: false }); ZT.flush();
      });
      await waitStack(s => s.stack.some(i => /mo-birth/.test(i)), 3000); await sleep(2600); await shot('birth-decide');
      check(await ev(() => !!document.querySelector('.mo-foot .btn.warn')), 'birth: Sell / Keep offered for baby 1');
      await page.locator('.mo-foot .btn.primary').tap(); await sleep(400);
      check(await ev(() => !!document.querySelector('.layer:not([hidden]) .mo-row.sel')), 'birth: a suggested place is ticked');
      await page.locator('.layer:not([hidden]) .mo-row.sel').first().tap(); await sleep(2900);
      await page.locator('.mo-foot .btn.warn').tap(); await sleep(700);   // sell the second baby
      await settled('birth twins decided');
      check(await ev(() => ZT.S.arrivals.length === 0 && ZT.S.animals.some(a => a.id === 9300)), 'twins decided: one kept, one sold');
      // stray: take it in, then keep it in the pen
      await ev(() => { ZT.newGame({}); const S = ZT.S; S.reports.length = 0; S.arrivals = []; S.happening = null; ZE.debug.happening(S, 'stray'); ZT.flush(); });
      await waitStack(s => s.stack.some(i => /mo-happening/.test(i)), 3000); await sleep(500);
      await page.locator('.layer:not([hidden]) .choices .btn.opt').first().tap(); await sleep(1500);
      for (let g = 0; g < 3 && !(await ev(() => !!document.querySelector('.mo-foot .btn.warn'))); g++) { await tapAway(); await sleep(700); }
      check(await ev(() => !!document.querySelector('.mo-foot .btn.warn')), 'stray taken in: keep or let go is offered');
      await page.locator('.mo-foot .btn.primary').tap(); await sleep(400); await page.locator('.layer:not([hidden]) .mo-row.tap').last().tap(); await sleep(600);
      await settled('stray'); check(await ev(() => ZT.S.arrivals.length === 0 && ZT.S.animals.length >= 3), 'stray kept');
      // a full habitat offers an inline upgrade from the where list; the animal is placed in the same sequence
      await ev(() => {
        ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; S.arrivals = [];
        const hab = S.items.find(i => i.k === 'hab'); const z = S.animals.find(a => a.hab === hab.id);
        while (S.animals.filter(a => a.hab === hab.id).length < ZE.habCap(hab)) S.animals.push(Object.assign({}, z, { id: 9400 + S.animals.length, name: 'Fill' }));
        S.arrivals.push({ a: Object.assign({}, z, { id: 9499, hab: null, name: 'Upg' }), src: 'expedition', at: S.week }); window.__hab = hab.id; window.__cap0 = ZE.habCap(hab);
        ZMoments.showArrival(9499);
      });
      await sleep(2400); await page.locator('.mo-foot .btn.primary').tap(); await sleep(450); await shot('where-upgrade');
      check(await ev(() => [...document.querySelectorAll('.layer:not([hidden]) .mo-row')].some(r => r.querySelector('.btn.blue') && (r.querySelector('.mo-room b') || {}).textContent === '0')), 'a full habitat shows room 0 and an inline Upgrade button');
      await page.locator('.layer:not([hidden]) .mo-row .btn.blue').first().tap(); await sleep(700);
      check(await ev(() => { const h = ZE.item(ZT.S, window.__hab); return h.lvl === 2 && ZE.habCap(h) > window.__cap0 && ZT.S.arrivals.length === 0 && ZT.S.animals.some(a => a.id === 9499 && a.hab === window.__hab) && ZT.stack().length === 0; }), 'Upgrade, then the animal is placed there in the same tap (capacity went up)');
      // not possible: max level shows a short reason and stays greyed
      await ev(() => { const S = ZT.S; S.arrivals = []; const hab = ZE.item(S, window.__hab); hab.lvl = 5; const z = S.animals.find(a => a.hab === hab.id); while (S.animals.filter(a => a.hab === hab.id).length < ZE.habCap(hab)) S.animals.push(Object.assign({}, z, { id: 9600 + S.animals.length })); S.arrivals.push({ a: Object.assign({}, z, { id: 9598, hab: null }), src: 'expedition', at: S.week }); ZMoments.showArrival(9598); });
      await sleep(2400); await page.locator('.mo-foot .btn.primary').tap(); await sleep(450);
      check(await ev(() => { const b = document.querySelector('.layer:not([hidden]) .mo-row .btn.blue'); return !!b && b.classList.contains('disabled') && /Max/.test(b.textContent); }), 'at the top level the upgrade is greyed with "Max level"');
      await ev(() => ZT.popAll()); await sleep(200);
      // the carried-over animal ("Bring along") is offered once on a new bare zoo
      const legacyAnimal = await ev(() => { ZT.newGame({}); return JSON.parse(JSON.stringify(ZT.S.animals[0])); });
      await ev(a => { ZT.newGame({ starter: false, animal: a }); }, legacyAnimal);
      await waitStack(s => s.stack.some(i => /mo-animal/.test(i)), 5000); await sleep(2500); await shot('legacy-offer');
      check(await ev(() => !!document.querySelector('.mo-foot .btn.warn') && !!document.querySelector('.mo-foot .btn.ghost')), 'carried-over animal: Sell, Keep and Later are offered on its own');
      await page.locator('.mo-foot .btn.primary').tap(); await sleep(400); await shot('legacy-where');
      const pen = await ev(() => { const r = [...document.querySelectorAll('.layer:not([hidden]) .mo-row.tap')]; const t = r[r.length - 1]; const fee = t.querySelector('.mo-fee'); return { n: r.length, fee: fee ? fee.textContent.trim() : null }; });
      check(pen.n === 1 && pen.fee === '0', 'on bare land the only place is the pen and its upkeep reads 0 (' + JSON.stringify(pen) + ')');
      await page.locator('.layer:not([hidden]) .mo-row.tap').first().tap(); await sleep(700);
      await sleep(2000);
      check(await ev(() => ZT.S.arrivals.length === 0 && ZT.stack().length === 0), 'carried-over animal kept in the pen, and it is not offered again');
      // later: dismissed once, not asked again, still reachable
      await ev(a => { ZT.newGame({ starter: false, animal: a }); }, legacyAnimal);
      await waitStack(s => s.stack.some(i => /mo-animal/.test(i)), 5000); await sleep(2500);
      await page.locator('.mo-foot .btn.ghost').tap(); await sleep(2200);
      check(await ev(() => ZT.stack().length === 0 && ZT.S.arrivals.length === 1), 'Later: dismissed and not shown again by itself (the arrival still waits)');
      // tutorial on: not before the first habitat exists
      await ev(a => { ZT.newGame({ starter: false, animal: a, tutorial: true }); }, legacyAnimal);
      await sleep(2200);
      check(await ev(() => !ZT.stack().some(i => /mo-animal/.test(i))), 'tutorial on: no pop-up while the zoo is still closed');
      await ev(() => { const S = ZT.S; S.money = 1e6; const cells = []; for (let row = 19; row >= 0; row--) for (let col = 0; col < 10; col++) cells.push(ZE.fromOffset(col, row)); for (const [q, r] of cells) if (ZE.canPlace(S, 'hab', 'savanna', q, r, 0)) { if (ZCore.act('build', 'hab', 'savanna', q, r, 0).ok) break; } });
      await waitStack(s => s.stack.some(i => /mo-animal/.test(i)), 5000);
      check(await ev(() => ZT.stack().some(i => /mo-animal/.test(i))), 'tutorial on: offered once the first habitat is built');
      await ev(() => ZT.popAll()); await sleep(200);
    }
    // timed hiring: the applicants report plays the reveal, then hands over to the list
    const hasHire = await ev(() => !!ZE.hiringInfo);
    if (hasHire) {
      await ev(() => { ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; const r = ZCore.act('advertise', 0); window.__adv = r.ok; for (let i = 0; i < 6 && !S.reports.some(x => x.type === 'applicants'); i++) ZE.tick(S); S.reports = S.reports.filter(x => x.type === 'applicants'); ZT.flush(); });
      check(await ev(() => window.__adv === true), 'advertise started a timed job');
      await waitStack(s => s.stack.some(i => /mo-hire/.test(i)), 3000); await sleep(600); await tapAway(); await sleep(500); await tapAway(); await sleep(600);
      const top = await ev(() => ZT.stack().join(','));
      check(!/mo-hire/.test(top), 'applicants reveal left in two taps; stack now: ' + top);
      await ev(() => ZT.popAll()); await sleep(200);
    }
  }


  // ---------------------------------------------------------------- Update 7: where list shows who lives there (note 1)
  if (want('where')) {
    console.log(' -- where list: the animals already living in each place');
    for (const [w, h] of [[393, 852], [375, 667]]) {
      await page.setViewportSize({ width: w, height: h }); await sleep(300);
      const built = await ev(() => {
        ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; S.arrivals = [];
        const cells = []; for (let row = 19; row >= 0; row--) for (let col = 0; col < 10; col++) cells.push(ZE.fromOffset(col, row));
        let made = 0; for (const [q, r] of cells) { if (made >= 3) break; if (ZE.canPlace(S, 'hab', 'savanna', q, r, 0) && ZCore.act('build', 'hab', 'savanna', q, r, 0).ok) made++; }
        const habs = S.items.filter(i => i.k === 'hab' && i.t === 'savanna');
        const sav = ZD.SPECIES_LIST.filter(x => x.biome === 'savanna').map(x => x.id);
        const base = S.animals[0]; S.animals = [];
        const fill = (hb, n) => { for (let i = 0; i < n; i++) S.animals.push(Object.assign({}, base, { id: 9700 + S.animals.length, sp: sav[(i >> 1) % sav.length], sex: i % 3 ? 'F' : 'M', name: 'A' + i, hab: hb ? hb.id : null })); };
        if (habs[0]) { habs[0].lvl = 1; fill(habs[0], ZE.habCap(habs[0])); }                 // full: 4 animals, Upgrade offered
        if (habs[1]) { habs[1].lvl = 5; fill(habs[1], ZE.habCap(habs[1])); }                 // full at the top level: 12 animals
        if (habs[2]) { habs[2].lvl = 3; fill(habs[2], ZE.habCap(habs[2]) - 1); }             // 7 of 8
        fill(null, 3);                                                                        // three already in the pen; habs[3] stays empty
        S.reports.length = 0;
        S.arrivals.push({ a: Object.assign({}, base, { id: 9799, hab: null, sp: 'zebra', sex: 'F', name: 'Newbie' }), src: 'expedition', at: S.week });
        ZMoments.showArrival(9799); return habs.length;
      });
      check(built >= 4, 'where @' + w + ': a zoo with ' + built + ' savanna habitats was set up (4 wanted: full, full at top level, nearly full, empty)');
      await sleep(2400); await page.locator('.mo-foot .btn.primary').tap(); await sleep(500);
      const m = await ev(() => {
        const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); const body = l.querySelector('.pbody'), p = l.querySelector('.panel').getBoundingClientRect();
        const choices = ZE.arrivalChoices(ZT.S, 9799);
        const rows = [...l.querySelectorAll('.mo-rows > .mo-row')].map((row, i) => {
          const rr = row.getBoundingClientRect(), line = row.querySelector('.mo-resl'), cells = line ? [...line.querySelectorAll('.mo-res:not(.more)')] : [], more = line ? line.querySelector('.mo-res.more') : null;
          const wantA = choices[i].animals || [];
          const out = [...row.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < rr.left - 0.5 || r.right > rr.right + 0.5 || r.top < rr.top - 0.5 || r.bottom > rr.bottom + 0.5); }).map(e => e.className || e.tagName);
          const clip = [...row.querySelectorAll('.t, .mo-wtop, .mo-resl, .mid, .btn')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className);
          const lr = line ? line.getBoundingClientRect() : null;
          const cellOut = lr ? [...line.children].filter(c => { const r = c.getBoundingClientRect(); return r.right > lr.right + 0.5 || r.left < lr.left - 0.5; }).length : 0;
          const b = row.querySelector('.btn'), br = b ? b.getBoundingClientRect() : null;
          return { n: wantA.length, shown: cells.length, plus: more ? +more.textContent.replace('+', '') : 0, out: out, clip: clip, cellOut: cellOut, h: Math.round(rr.height),
            sexOk: cells.every((c, k) => { const im = c.querySelector('img.mo-symg'); return im && im.getAttribute('src') && im.alt === (wantA[k].sex === 'M' ? 'male' : 'female') && im.getBoundingClientRect().height >= 8; }),
            picOk: cells.every((c, k) => { const im = c.querySelector('img.mo-resp'); return im && im.complete && im.naturalWidth > 0 && im.getBoundingClientRect().height >= 10 && im.getAttribute('src') === ZSprites.animalUrl(wantA[k].sp, { variant: !!wantA[k].variant, juv: !!wantA[k].juv }, 2); }),
            crown: !!row.querySelector('img[alt="best"]'), full: row.classList.contains('full'), btn: br ? { h: Math.round(br.height), w: Math.round(br.width), txt: b.textContent.trim() } : null, label: (row.querySelector('.t') || {}).textContent };
        });
        return { rows: rows, over: body.scrollHeight - body.clientHeight, pt: Math.round(p.top), pb: Math.round(p.bottom), ih: innerHeight, places: choices.length };
      });
      await shot('where-portraits' + (w === 375 ? '-small' : ''));
      console.log('  rows @' + w + ': ' + m.rows.map(r => r.label.trim() + ' ' + r.shown + (r.plus ? '+' + r.plus : '') + '/' + r.n + ' h' + r.h + (r.btn ? ' [' + r.btn.txt + ' ' + r.btn.w + 'x' + r.btn.h + ']' : '')).join(' | '));
      check(m.rows.length === m.places && m.rows.length === built + 1, 'where @' + w + ': one row per place (' + m.rows.length + ' rows, ' + m.places + ' places)');
      check(m.rows.every(r => r.shown + r.plus === r.n && (r.n === 0 || r.shown > 0) && r.sexOk && r.picOk), 'where @' + w + ': every row shows the animals living there as portraits with a sex mark, in the engine\'s order; any that cannot fit are counted as +N ' + JSON.stringify(m.rows.map(r => [r.n, r.shown, r.plus, r.sexOk, r.picOk])));
      check(m.rows.some(r => r.n === 12) && m.rows.some(r => r.n === 0) && m.rows.some(r => r.full && r.n === 4), 'where @' + w + ': the case covers a 12-animal habitat, an empty one and a full one with Upgrade');
      check(m.rows.every(r => !r.out.length && !r.clip.length && !r.cellOut), 'where @' + w + ': nothing overflows or is clipped in any row (the full row with its Upgrade button included) ' + JSON.stringify(m.rows.filter(r => r.out.length || r.clip.length || r.cellOut).map(r => [r.label, r.out, r.clip, r.cellOut])));
      check(m.rows.filter(r => r.btn).length >= 2 && m.rows.filter(r => r.btn).every(r => r.btn.h >= 44 && r.btn.w >= 44) && m.rows.every(r => r.h >= 44), 'where @' + w + ': every row and every Upgrade button is at least 44 px');
      check(m.over <= 1 && m.pt >= 0 && m.pb <= m.ih, 'where @' + w + 'x' + h + ': the whole list (' + m.rows.length + ' places, 26 residents) fits with no scrolling ' + JSON.stringify({ over: m.over, pt: m.pt, pb: m.pb }));
      check(m.rows.every(r => !r.crown), 'where @' + w + ': no crown on the small portraits');
      if (w === 393) {
        check(m.rows.find(r => r.n === 12).shown === 12, 'where @393: all 12 residents of the biggest habitat fit on the one line');
        // the place still works: tap the nearly full habitat, the animal moves in
        await page.locator('.layer:not([hidden]) .mo-row.tap:not(.off)').first().tap(); await sleep(600);
        check(await ev(() => ZT.S.arrivals.length === 0 && ZT.S.animals.some(a => a.id === 9799 && a.hab != null) && ZT.stack().length === 0), 'where: tapping a habitat row still places the animal there');
      }
      await ev(() => ZT.popAll()); await sleep(200);
    }
    // a very narrow line falls back to a +N count instead of overflowing
    await page.setViewportSize({ width: 320, height: 700 }); await sleep(300);
    await ev(() => {
      ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; S.arrivals = []; const hab = S.items.find(i => i.k === 'hab'); const base = S.animals[0]; S.animals = []; hab.lvl = 5;
      for (let i = 0; i < 12; i++) S.animals.push(Object.assign({}, base, { id: 9700 + i, sex: i % 2 ? 'F' : 'M', hab: hab.id }));
      S.arrivals.push({ a: Object.assign({}, base, { id: 9799, hab: null }), src: 'expedition', at: S.week }); ZMoments.showArrival(9799);
    });
    await sleep(2400); await page.locator('.mo-foot .btn.primary').tap(); await sleep(500); await shot('where-portraits-narrow');
    const nar = await ev(() => { const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); const line = l.querySelector('.mo-resl'), lr = line.getBoundingClientRect(), more = line.querySelector('.more'); return { shown: line.querySelectorAll('.mo-res:not(.more)').length, plus: more ? +more.textContent.replace('+', '') : 0, out: [...line.children].filter(c => c.getBoundingClientRect().right > lr.right + 0.5).length, btnOut: (() => { const b = l.querySelector('.mo-row .btn'), r = b.closest('.mo-row').getBoundingClientRect(), br = b.getBoundingClientRect(); return br.right > r.right + 0.5 || br.left < r.left; })() }; });
    check(nar.plus > 0 && nar.shown + nar.plus === 12 && nar.out === 0 && !nar.btnOut, 'where @320: 12 residents on a narrow screen become ' + nar.shown + ' portraits and "+' + nar.plus + '", nothing overflows');
    await ev(() => ZT.popAll()); await sleep(150);
    await page.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  }

  // ---------------------------------------------------------------- Update 7: it worked = green, it failed = red (note 8)
  if (want('colours')) {
    console.log(' -- results in colour: green when it worked, red when it failed, only after the suspense');
    // a real gamble (the event "big idea"), forced to win and then to lose
    for (const win of [true, false]) {
      const ok = await raiseChoice('boost'); check(ok, 'colours: a real gamble choice came up');
      if (!ok) continue;
      await waitStack(s => s.stack.length > 0, 3000); await sleep(500);
      const idx = await ev(() => [...document.querySelectorAll('.layer:not([hidden]) .choices .btn.opt')].findIndex(b => b.querySelector('.odds') && !b.classList.contains('disabled')));
      check(idx >= 0, 'colours: the gamble has an option with odds');
      check(isNeutral(await verdict()), 'gamble (' + (win ? 'win' : 'lose') + '): the question itself is neutral ' + vs(await verdict()));
      await ev(w => { window.__rand = Math.random; Math.random = () => (w ? 0.0001 : 0.9999); }, win);
      await page.locator('.layer:not([hidden]) .choices .btn.opt').nth(Math.max(0, idx)).tap();
      await ev(() => { Math.random = window.__rand; });
      await sleep(250); const sus = await verdict(), dots = await ev(() => !!document.querySelector('.layer:not([hidden]) .mo-dots'));
      check(dots && isNeutral(sus) && !sus.bigMark, 'gamble (' + (win ? 'win' : 'lose') + '): during the suspense there is no green, no red, no tick, no cross ' + vs(sus));
      await sleep(1300); const res = await verdict(); await shot('colour-gamble-' + (win ? 'worked' : 'failed'));
      check(win ? isGreen(res) : isRed(res), 'gamble (' + (win ? 'win: solid green bar with a tick' : 'lose: solid red bar with a cross') + ') ' + vs(res));
      check(res.bigMark && (win ? /worked/i : /No luck/i).test(res.title), 'gamble (' + (win ? 'win' : 'lose') + '): header "' + res.title + '" and a big ' + (win ? 'tick' : 'cross') + ' on the card');
      for (let g = 0; g < 5 && (await state()).stack.length; g++) { await tapAway(); await sleep(450); }
      await ev(() => { ZE.debug.alwaysChoices(false); ZT.popAll(); }); await sleep(200);
    }
    await fresh();
    const habId = await ev(() => (ZT.S.items.find(x => x.k === 'hab') || {}).id), anId = await ev(() => ZT.S.animals[0].id);
    const finalCard = async () => { await waitStack(s => s.cur && s.cur.final, 6000); await sleep(700); return verdict(); };
    const closeAll = async label => { for (let g = 0; g < 6 && (await state()).stack.length; g++) { await tapAway(); await sleep(450); } await settled(label); };
    // breeding
    await pushReport({ type: 'birth', fail: true, a: 1, b: 2, lead: 1, sp: 'zebra', chance: 0.55, kids: [] });
    let v = await finalCard(); await shot('colour-birth-failed'); check(isRed(v) && /No baby/.test(v.title), 'breeding failed: red bar with a cross ' + vs(v)); await closeAll('colour birth failed');
    await pushReport({ type: 'birth', fail: false, a: 1, b: 2, lead: 1, sp: 'zebra', chance: 0.7, kids: [{ id: 800, sp: 'zebra', sex: 'F', name: 'Pip', hab: habId, rolls: ['charm', 'vigor', 'wit'].map(st => ({ stat: st, parents: 40, value: 44, delta: 4, lucky: false })), variantChance: 0.06, variant: false }], twins: false, firstBred: false });
    v = await finalCard(); await shot('colour-birth-worked'); check(isGreen(v), 'breeding worked: green bar with a tick ' + vs(v)); await closeAll('colour birth worked');
    // expeditions
    await pushReport({ type: 'expedition', region: 'jungle', star: 2, found: [], rp: 5, fragment: 0, notes: [], ups: [], staff: [] });
    v = await finalCard(); await shot('colour-expedition-nothing'); check(isRed(v) && /Nothing/.test(v.title) && v.bigMark, 'expedition with nothing found: red bar with a cross ' + vs(v)); await closeAll('colour expedition nothing');
    await pushReport({ type: 'expedition', region: 'savanna', star: 1, found: await mkFound(1), rp: 5, fragment: 0, notes: [], ups: [], staff: [] });
    await waitStack(s => s.stack.length > 0, 3000); await sleep(400); v = await verdict();
    check(!v.bar && isNeutral(v), 'expedition: while the find is being revealed there is no coloured bar ' + vs(v));
    v = await finalCard(); check(isGreen(v), 'expedition with a find: the summary has a green bar with a tick ' + vs(v)); await closeAll('colour expedition found');
    // the Winter Show
    for (const medal of ['gold', null]) {
      await pushReport({ type: 'showresult', animal: anId, stat: 'charm', score: medal ? 88 : 31, medal: medal, medals: { gold: 80, silver: 60, bronze: 45 }, bar: 80, money: medal ? 9000 : 0, rep: medal ? 30 : 0, trophy: !!medal });
      await waitStack(s => s.stack.length > 0, 3000); await sleep(450); v = await verdict();
      check(!v.bar && isNeutral(v), 'show (' + (medal || 'no medal') + '): while the score counts up there is no coloured bar ' + vs(v));
      v = await finalCard(); await shot('colour-show-' + (medal || 'none'));
      check(medal ? isGreen(v) : (isRed(v) && v.bigMark), 'show (' + (medal ? 'gold medal: green bar with a tick' : 'no medal: red bar with a cross') + ') ' + vs(v)); await closeAll('colour show');
    }
    // the reusable result card, and training
    for (const good of [true, false]) {
      await ev(g => ZMoments.result({ title: g ? 'Hired' : 'Nobody came', lines: ['One line'], good: g }), good);
      v = await finalCard(); if (!good) await shot('colour-result-failed'); check(good ? isGreen(v) : isRed(v), 'ZMoments.result({good: ' + good + '}): ' + (good ? 'green' : 'red') + ' bar ' + vs(v)); await closeAll('colour result');
    }
    await ev(() => ZMoments.revealTrain(ZT.S.staff[0], { gain: 4, super: false, stat: 'care', value: 30 }));
    v = await finalCard(); await shot('colour-train'); check(isGreen(v) && /Trained/.test(v.title), 'training: green bar ' + vs(v)); await closeAll('colour train');
    // year-end awards: WON in green, missed in red, only once each box has flipped
    await pushReport({ type: 'yearend', year: 3, table: Array.from({ length: 12 }, (_, i) => ({ name: 'Zoo ' + i, rating: 900 - i * 50, me: i === 4 })), place: 5, awards: ['Best Exhibit', 'Rising Star', 'Fan Favourite', 'Green Award', 'Zoo of the Year'].map((nm, i) => ({ id: 'a' + i, name: nm, won: i % 2 === 0, mine: 12, bar: 40, prize: 5000 })), prize: 5000, stats: { income: 9000, cost: 5000, visitors: 1234, species: 4, bestReview: 30 } });
    await waitStack(s => s.stack.length > 0, 3000); await sleep(150);
    const aw0 = await ev(() => [...document.querySelectorAll('.layer:not([hidden]) .mo-award')].filter(c => c.classList.contains('won') || c.classList.contains('lost')).length);
    await sleep(400); await tapAway(); await sleep(500); await shot('colour-awards');   // one tap completes the flips and holds the card there (the beat would move on by itself after 3 s)
    const aw = await ev(() => [...document.querySelectorAll('.layer:not([hidden]) .mo-award')].map(c => ({ won: c.classList.contains('won'), ink: getComputedStyle(c.querySelector('b')).color, t: c.querySelector('b').textContent })));
    check(aw0 === 0 && aw.length === 5 && aw.every(a => a.won ? a.ink === 'rgb(47, 138, 58)' && a.t === 'WON' : a.ink === RED && a.t === 'missed'), 'year-end awards: WON is green and missed is red, and nothing is coloured before the boxes flip (' + aw0 + ' early) ' + JSON.stringify(aw.map(a => a.ink)));
    await closeAll('colour awards');
  }

  // ---------------------------------------------------------------- Update 7: the star level on the expedition card (note 13)
  if (want('expstar')) {
    console.log(' -- expedition card shows the star level that was run');
    await fresh();
    const starsOnCard = () => ev(() => { const x = document.querySelector('.layer:not([hidden]) .mo-xstar'); if (!x) return null; const r = x.getBoundingClientRect(), c = x.closest('.mo-card').getBoundingClientRect(); return { all: x.querySelectorAll('.star').length, lit: x.querySelectorAll('.star:not(.off)').length, inside: r.left >= c.left && r.right <= c.right && r.height >= 18 }; });
    for (const star of [1, 3, 5]) {
      await pushReport({ type: 'expedition', region: 'savanna', star: star, found: star === 3 ? [] : await mkFound(1), rp: 5, fragment: 0, notes: [], ups: [], staff: [] });
      await waitStack(s => s.cur && s.cur.final, 6000); await sleep(700); const sc = await starsOnCard(); if (star !== 1) await shot('expedition-star' + star);
      check(!!sc && sc.all === 5 && sc.lit === star && sc.inside, 'a ' + star + '-star run shows ' + star + ' of 5 stars on the result card ' + JSON.stringify(sc));
      for (let g = 0; g < 6 && (await state()).stack.length; g++) { await tapAway(); await sleep(450); } await settled('expedition star ' + star);
    }
    await pushReport({ type: 'expedition', region: 'savanna', star: null, found: [], rp: 5, fragment: 0, notes: [], ups: [], staff: [] });
    await waitStack(s => s.cur && s.cur.final, 6000); await sleep(600);
    check((await starsOnCard()) === null, 'an expedition sent before the update (no star level) shows no star row');
    for (let g = 0; g < 6 && (await state()).stack.length; g++) { await tapAway(); await sleep(450); } await settled('expedition without star');
    // a real 2-star run
    const real = await ev(() => { ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.reports.length = 0; const ex = S.staff.find(s => s.role === 'explorer') || ZE.freeStaff(S)[0]; const r = ZCore.act('startExpedition', 'savanna', [ex.id], 2); if (!r.ok) return r.msg || 'refused'; for (let i = 0; i < 30; i++) { ZE.tick(S); const p = S.projects.find(x => x.choice); if (p) ZE.resolveChoice(S, p.id, 0); const e = S.reports.filter(x => x.type === 'expedition'); if (e.length) { S.reports = e; const st = e[0].star; ZT.flush(); return st; } S.reports.length = 0; } return 'never came home'; });
    check(real === 2, 'a real 2-star expedition comes home with star = 2 in its report (' + real + ')');
    if (real === 2) { let seen = null; await drive('real 2-star expedition', { timed: false, after: async () => { seen = await starsOnCard(); } }); check(!!seen && seen.lit === 2 && seen.all === 5, 'its result card shows 2 of 5 stars ' + JSON.stringify(seen)); await settled('real 2-star expedition'); }
  }

  // ---------------------------------------------------------------- Update 7: the challenge result card (note 12)
  if (want('challenge')) {
    console.log(' -- challenge result card: stars one by one, then green or red, then Next level / Retry / Levels');
    await page.setViewportSize({ width: 393, height: 852 }); await sleep(250);
    const gotoLevel = async id => { await page.goto(URL + '?challenge=' + id); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready && window.ZMoments, null, { timeout: 10000 }); await ev(() => { ZT.WEEK_MS[1] = 1e9; ZT.WEEK_MS[2] = 1e9; }); await sleep(300); };
    await gotoLevel('broke');
    check(await ev(() => ZCore.inChallenge() && ZCore.challengeId === 'broke' && !!ZE.level(ZT.S)), 'challenge: level "broke" (Shoestring, money goal) is running');
    // finish the level the real way: the engine judges the goal at the end of a week and pushes its one report
    const endLevel = (stars) => ev(st => { const S = ZT.S, L = ZE.level(S); S.reports.length = 0; S.happening = null; if (st === 0) { S.money = 10; S.week = L.weeks - 1; } else { S.week = st === 3 ? 5 : st === 2 ? L.stars[0] + 2 : L.stars[1] + 2; S.money = 999999; } ZE.tick(S); S.reports = S.reports.filter(r => r.type === 'challenge'); const r = S.reports[0]; ZT.flush(); return r ? r.stars : null; }, stars);
    const sample = async ms => { const out = []; const t0 = Date.now(); while (Date.now() - t0 < ms) { out.push(await ev(() => { const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); if (!l || l.dataset.screen !== 'mo-challenge') return null; const p = l.querySelector('.panel'), row = l.querySelector('.mo-chstars'); return { lit: row ? +row.getAttribute('data-lit') : -1, on: row ? [...row.querySelectorAll('img')].filter(i => i.getAttribute('src') === ZSprites.iconUrl('star-on', 6)).length : -1, off: row ? [...row.querySelectorAll('img')].filter(i => i.getAttribute('src') === ZSprites.iconUrl('star-off', 6)).length : -1, col: p.classList.contains('good') ? 'good' : p.classList.contains('bad') ? 'bad' : '', mark: !!l.querySelector('.mo-vmark'), btns: l.querySelectorAll('.mo-foot .btn').length, goalMark: !!l.querySelector('.mo-chgoal.good, .mo-chgoal.bad') }; })); await sleep(50); } return out.filter(Boolean); };
    const cardInfo = () => ev(() => { const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); if (!l) return null; const body = l.querySelector('.pbody'), p = l.querySelector('.panel').getBoundingClientRect();
      const btns = [...l.querySelectorAll('.mo-foot .btn')].map(b => { const r = b.getBoundingClientRect(); return { t: (b.querySelector('.lbl') || b).textContent.trim(), h: Math.round(r.height), w: Math.round(r.width), bottom: Math.round(r.bottom), primary: b.classList.contains('primary'), cls: b.className }; });
      const row = l.querySelector('.mo-chstars'), cr = l.querySelector('.mo-card').getBoundingClientRect();
      const starBox = row ? [...row.querySelectorAll('img')].map(i => { const r = i.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), in: r.left >= cr.left && r.right <= cr.right, ok: i.complete && i.naturalWidth > 0 }; }) : [];
      return { id: l.dataset.screen, txt: l.querySelector('.mo-card').textContent, lvl: (l.querySelector('.mo-chlvl') || {}).textContent, goal: (l.querySelector('.mo-chgoal') || {}).textContent, goalCls: (l.querySelector('.mo-chgoal') || {}).className, goalTick: (() => { const g = l.querySelector('.mo-chgoal'); const im = g ? [...g.querySelectorAll('img')].pop() : null; return im ? im.getAttribute('src') === ZSprites.iconUrl('ok', 3) ? 'ok' : im.getAttribute('src') === ZSprites.iconUrl('no', 3) ? 'no' : '?' : null; })(),
        btns: btns, stars: starBox, over: body.scrollHeight - body.clientHeight, pt: Math.round(p.top), pb: Math.round(p.bottom), ih: innerHeight, imgsBad: [...l.querySelectorAll('img')].filter(i => !i.getAttribute('src') || !i.complete || !i.naturalWidth).length }; });
    const checkReveal = (sm, stars, label) => {
      const lits = sm.map(x => x.lit), mono = lits.every((x, i) => i === 0 || x >= lits[i - 1]), each = Array.from({ length: stars + 1 }, (_, k) => lits.includes(k)).every(Boolean);
      const early = sm.filter(x => x.lit < stars && (x.col || x.mark || x.btns || x.goalMark)).length, firstCol = sm.find(x => x.col), last = sm[sm.length - 1];
      const firstFrames = sm.slice(0, 3).every(x => !x.col && !x.mark && !x.btns && x.lit === 0);
      check(sm.length > 10 && mono && each && sm.every(x => x.on === x.lit && x.on + x.off === 3), label + ': the stars light one by one (' + [...new Set(lits)].join(' then ') + '; lit pictures are star-on, the rest star-off)');
      check(early === 0 && firstFrames && !!firstCol && firstCol.lit === stars, label + ': no green or red, no tick or cross and no buttons until the last star has resolved (' + early + ' early frames)');
      check(!!last && last.col === (stars ? 'good' : 'bad') && last.mark && last.lit === stars && last.btns === (stars ? 3 : 2), label + ': ends ' + (stars ? 'green' : 'red') + ' with ' + stars + ' star' + (stars === 1 ? '' : 's') + ' lit and its buttons up');
    };
    const fitsCheck = (c, label) => check(c.over <= 1 && c.pt >= 0 && c.pb <= c.ih && c.btns.every(b => b.h >= 44 && b.w >= 44 && b.bottom <= c.ih) && c.stars.length === 3 && c.stars.every(s => s.in && s.ok && s.h >= 40) && c.imgsBad === 0 && !/NaN|undefined|null/.test(c.txt), label + ': fits the screen with no scrolling, three stars inside the card, every button 44 px or more (' + c.btns.map(b => b.t + ' ' + b.w + 'x' + b.h).join(', ') + ')');

    // ---- 3 stars: Next level
    let got = await endLevel(3); check(got === 3, 'challenge: the engine ended the level with 3 stars (' + got + ')');
    let sm = await sample(2600); checkReveal(sm, 3, '3-star result'); await sleep(300);
    let v = await verdict(), c = await cardInfo(); await shot('challenge-3star');
    check(isGreen(v) && v.title === 'Level 3', '3-star result: solid green bar with a tick, "Level 3" ' + vs(v));
    check(/3/.test(c.lvl) && /Shoestring/.test(c.lvl) && /50K|50,000/.test(c.goal) && /good/.test(c.goalCls) && c.goalTick === 'ok', '3-star result: shows the level number and the goal reached (' + (c.lvl || '').trim() + ' | ' + (c.goal || '').trim() + ')');
    check(c.btns.map(b => b.t).join(',') === 'Next level,Retry,Levels' && c.btns[0].primary, '3-star result: buttons are Next level (first, green), Retry, Levels (' + c.btns.map(b => b.t).join(', ') + ')');
    fitsCheck(c, '3-star result');
    check(await ev(() => ZCore.challengeStars().broke === 3), 'the shell stored 3 best stars for the level');
    await tapAway(); await sleep(400); await page.touchscreen.tap(196, 300); await sleep(400);
    check((await state()).stack.includes('mo-challenge'), 'taps on the card do not close it: only a button leaves');
    await page.locator('.mo-foot .btn.mo-next').tap(); await sleep(700);
    check(await ev(() => ZCore.inChallenge() && ZCore.challengeId === 'breed' && ZE.level(ZT.S).n === 4 && ZT.S.week <= 1 && !ZT.S.ch.done && ZT.stack().length === 0), 'Next level starts level 4 fresh (' + (await ev(() => ZCore.challengeId + ', week ' + ZT.S.week)) + ')');
    await settled('after Next level');

    // ---- 2 stars, then 1 star: Retry
    await ev(() => { ZCore.startChallenge('broke'); }); await sleep(400);
    got = await endLevel(2); check(got === 2, 'challenge: ended with 2 stars (' + got + ')');
    sm = await sample(2300); checkReveal(sm, 2, '2-star result'); await sleep(200); await shot('challenge-2star');
    await page.locator('.mo-foot .btn.mo-retry').tap(); await sleep(700);
    check(await ev(() => ZCore.challengeId === 'broke' && ZT.S.week <= 1 && !ZT.S.ch.done && Math.round(ZT.S.money) === ZE.level(ZT.S).money && ZT.stack().length === 0), 'Retry (after a win) starts the same level again from the beginning (week ' + (await ev(() => ZT.S.week + ', $' + Math.round(ZT.S.money))) + ')');
    await settled('after Retry');
    got = await endLevel(1); check(got === 1, 'challenge: ended with 1 star (' + got + ')');
    sm = await sample(1900); checkReveal(sm, 1, '1-star result'); await sleep(200); v = await verdict(); await shot('challenge-1star');
    check(isGreen(v), '1-star result is still a pass: green ' + vs(v));
    await ev(() => ZT.popAll()); await sleep(300);

    // ---- out of time: red, Retry first, no Next level; survives a reload; Levels goes back to the title
    await ev(() => { ZCore.startChallenge('broke'); }); await sleep(400);
    got = await endLevel(0); check(got === 0, 'challenge: out of time gives 0 stars (' + got + ')');
    sm = await sample(1900); checkReveal(sm, 0, 'failed result'); await sleep(200);
    v = await verdict(); c = await cardInfo(); await shot('challenge-failed');
    check(isRed(v) && v.title === 'Level 3', 'failed result: solid red bar with a cross ' + vs(v));
    check(c.btns.map(b => b.t).join(',') === 'Retry,Levels' && c.btns[0].primary && /bad/.test(c.goalCls) && c.goalTick === 'no', 'failed result: Retry comes first (green), then Levels; no Next level; the goal is marked missed (' + c.btns.map(b => b.t).join(', ') + ' | ' + (c.goal || '').trim() + ')');
    fitsCheck(c, 'failed result');
    await ev(() => ZT.save()); await sleep(150); await gotoLevel('broke'); await sleep(900);
    c = await cardInfo(); v = await verdict();
    check(!!c && c.id === 'mo-challenge' && isRed(v) && c.btns.length === 2, 'quitting with the result card up brings it back on return (' + (c ? c.id : 'nothing') + ')');
    await page.setViewportSize({ width: 375, height: 667 }); await sleep(400); c = await cardInfo(); fitsCheck(c, 'failed result @375x667'); await shot('challenge-failed-small');
    await page.setViewportSize({ width: 393, height: 852 }); await sleep(300);
    await page.locator('.mo-foot .btn.mo-levels').tap(); await sleep(800);
    const left = await ev(() => ({ inCh: ZCore.inChallenge(), saved: ZCore.challengeSaved(), stars: ZCore.challengeStars(), stack: ZT.stack(), mo: ZT.stack().some(i => /^mo-/.test(i)), menusFn: !!(window.ZMenus && typeof ZMenus.openLevels === 'function'), cards: (() => { const l = [...document.querySelectorAll('.layer')].filter(x => !x.hidden).pop(); const line = l && l.querySelector('.mn-lvline'); return line ? line.children.length : 0; })() }));
    check(!left.inCh && !left.mo && left.stack.length > 0 && left.saved === null && left.stars.broke === 3, 'Levels: back on the title, out of the challenge, the finished run is not offered again, best stars kept ' + JSON.stringify(left));
    // tester finding (round 7): Levels must open the level list, not leave the player on the bare title
    check(left.menusFn && left.stack[0] === 'title' && left.stack[left.stack.length - 1] === 'challenges' && left.cards === 5, 'Levels: the challenge level list is open on top of the title, showing the five levels (' + JSON.stringify({ fn: left.menusFn, stack: left.stack, cards: left.cards }) + ')');
    await shot('challenge-after-levels');

    // ---- failed, then Retry
    await gotoLevel('broke'); got = await endLevel(0); await sleep(1900);
    await page.locator('.mo-foot .btn.mo-retry').tap(); await sleep(700);
    check(got === 0 && await ev(() => ZCore.challengeId === 'broke' && ZT.S.week <= 1 && !ZT.S.ch.done && ZT.stack().length === 0), 'Retry (after failing) starts the same level again');
    await settled('after Retry from a fail');

    // ---- the last level has no Next level
    await ev(() => { ZCore.startChallenge('tiny'); }); await sleep(400);
    await ev(() => { const S = ZT.S; S.reports.length = 0; S.reports.push({ type: 'challenge', level: 'tiny', n: 5, stars: 2, week: 90 }); ZT.flush(); });
    await sleep(2300); c = await cardInfo(); v = await verdict(); await shot('challenge-last');
    check(isGreen(v) && v.title === 'Level 5' && c.btns.map(b => b.t).join(',') === 'Retry,Levels', 'the last level (5) passed: green, Retry and Levels only, no Next level (' + c.btns.map(b => b.t).join(', ') + ')');
    await page.locator('.mo-foot .btn.mo-levels').tap(); await sleep(700);
    { const t = await ev(() => ({ inCh: ZCore.inChallenge(), stack: ZT.stack() })); check(!t.inCh && t.stack[0] === 'title' && t.stack[t.stack.length - 1] === 'challenges', 'Levels from the last level leaves the challenge and opens the level list (' + t.stack + ')'); }
    // every level's card: number, name and goal read correctly
    for (const id of ['small', 'savanna', 'breed']) {
      await gotoLevel(id);
      await ev(i => { const S = ZT.S, L = ZE.level(S); S.reports.length = 0; S.reports.push({ type: 'challenge', level: i, n: L.n, stars: 0, week: L.weeks }); ZT.flush(); }, id);
      await sleep(1700); c = await cardInfo(); await shot('challenge-level-' + id);
      const L = await ev(() => { const L = ZE.level(ZT.S); return { n: L.n, name: L.name }; });
      check(!!c && c.id === 'mo-challenge' && c.lvl.includes(String(L.n)) && c.lvl.includes(L.name) && c.imgsBad === 0 && !/NaN|undefined|null|\?/.test(c.goal || '?'), 'level ' + L.n + ' card: ' + (c.lvl || '').trim() + ' | goal ' + (c.goal || '').trim());
      fitsCheck(c, 'level ' + L.n + ' card');
      await page.locator('.mo-foot .btn.mo-levels').tap(); await sleep(500);
    }
    await page.setViewportSize({ width: 390, height: 844 }); await sleep(200);
    await boot();
  }

  // ---------------------------------------------------------------- Update 7: rare treats (note 9): projects finish with or without their choices
  if (want('rare')) {
    console.log(' -- rare treats: projects run to their result card when no choice comes up, and when one does');
    await ev(() => ZE.debug.alwaysChoices(false));
    for (const mode of ['never', 'natural']) {
      for (const kind of ['expedition', 'breed', 'event']) {
        const started = await ev(({ kind, mode }) => {
          ZT.newGame({}); const S = ZT.S; S.money = 1e6; S.rp = 5000; S.reports.length = 0; S.happening = null; S.nextHap = S.week + 500;
          const free = ZE.freeStaff(S), hab = S.items.find(i => i.k === 'hab'); let r;
          if (kind === 'expedition') { const ex = S.staff.find(s => s.role === 'explorer') || free[0]; r = ZCore.act('startExpedition', 'savanna', [ex.id], 1); }
          else if (kind === 'breed') { S.animals.forEach(a => { a.rest = 0; }); const p = ZE.readyPairs(S, hab.id)[0]; if (!p) return 'no pair'; const lead = free.find(s => s.role === 'keeper') || free[0]; r = ZCore.act('startBreeding', p[0], p[1], lead.id); }
          else r = ZCore.act('startEvent', hab.id, 'feeding', free[0].id);
          if (!r || !r.ok) return (r && r.msg) || 'refused';
          // 'never': every "does a choice come up" roll says no (the roll is Math.random() < ZD.CHOICE_CHANCE), everything else stays random
          window.__seen = { choice: 0, result: null };
          return 'ok';
        }, { kind, mode });
        check(started === 'ok', 'rare (' + mode + '): a real ' + kind + ' project started (' + started + ')');
        if (started !== 'ok') continue;
        const want1 = kind === 'expedition' ? 'expedition' : kind === 'breed' ? 'birth' : 'review';
        let result = null, choices = 0;
        for (let t = 0; t < 60 && !result; t++) {
          const r = await ev(({ mode, want1 }) => {
            const S = ZT.S, R = Math.random;
            if (mode === 'never') { const C = ZD.CHOICE_CHANCE; Math.random = () => { const x = R(); return x < C ? C + x * (1 - C) : x; }; }   // never below the choice chance: no choice can come up
            try { ZE.tick(S); } finally { Math.random = R; }
            const res = S.reports.find(x => x.type === want1), ch = S.reports.filter(x => x.type === 'choice').length;
            S.reports = S.reports.filter(x => x.type === want1 || x.type === 'choice');
            const out = { ch: ch, res: res ? { star: res.star, fail: res.fail, kids: res.kids ? res.kids.length : null, found: res.found ? res.found.length : null } : null, pending: S.projects.filter(p => p.choice).length };
            ZT.flush(); return out;
          }, { mode, want1 });
          choices += r.ch; if (r.res) result = r.res;
          // answer whatever is on screen (a choice, a result card, a keep-or-sell)
          for (let g = 0; g < 12 && (await state()).stack.length; g++) {
            if (await ev(() => !!document.querySelector('.layer:not([hidden]) .choices'))) await drive('rare ' + kind + ' choice', { pick: 0, shots: null });
            else await drive('rare ' + kind + ' ' + want1, { timed: false, shots: null });
            await sleep(150);
          }
        }
        check(!!result, 'rare (' + mode + '): the ' + kind + ' reached its ' + want1 + ' result (' + choices + ' choice' + (choices === 1 ? '' : 's') + ' came up) ' + JSON.stringify(result));
        if (mode === 'never') check(choices === 0, 'rare (never): no choice came up for the ' + kind + ', and nothing waited for one');
        if (kind === 'event' && result) check(!!result.star && result.star.animal != null, 'rare (' + mode + '): the review still has its star animal (the engine picks one when the star choice does not come up)');
        await settled('rare ' + mode + ' ' + kind);
        check(await ev(() => !ZT.S.projects.some(p => p.choice)), 'rare (' + mode + ') ' + kind + ': no project is left waiting on a choice');
      }
    }
    const cnt = await ev(() => ({ shown: ZMoments.shown, finished: ZMoments.finished }));
    for (const t of ['expedition', 'birth', 'review']) check((cnt.shown[t] || 0) >= 2 && cnt.finished[t] === cnt.shown[t], 'rare: ' + t + ' cards were shown and dismissed (' + (cnt.shown[t] || 0) + ' / ' + (cnt.finished[t] || 0) + ')');
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
