/* Tester: touch-only playthrough of the first full year (48 weeks) on the real clock at speed 2.
   Usage: node test/tester-play.js [chromium|webkit] [--fast]   (headless only)
   Only real taps/drags act on the game. page.evaluate is used to READ state (to decide what to tap) and to assert. */
const L = require('./tester-lib.js');
const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
const fs = require('fs');
const out = [];
const say = (...a) => { const s = a.join(' '); console.log(s); out.push(s); };

(async () => {
  const T = await L.launch(engine, { width: 390, height: 844 });
  const page = T.page; const startMs = Date.now();
  const metrics = { taps: {}, reveals: [], toasts: {}, popups: [], stuck: [] };
  const seenShot = new Set();
  const inv = (label, o) => L.invariants(T, label, o);
  const wk = () => page.evaluate(() => ZT.S.week);
  const st = () => T.state();

  /* ---------- toast watcher: how long does each toast live, does it cover anything? ---------- */
  await page.exposeFunction('__toastSeen', (txt, top, bottom, stackTop) => { const k = txt.slice(0, 40); const m = metrics.toasts[k] || (metrics.toasts[k] = { first: Date.now(), last: Date.now(), top, bottom, overStack: stackTop }); m.last = Date.now(); m.top = top; m.bottom = bottom; m.overStack = stackTop; });
  async function installWatch() {
    await page.evaluate(() => { if (window.__tw) return; window.__tw = setInterval(() => { for (const t of document.querySelectorAll('#toasts .toast')) { const r = t.getBoundingClientRect(); window.__toastSeen(t.textContent, Math.round(r.top), Math.round(r.bottom), ZT.stack().join('>')); } }, 150); });
  }

  /* ---------- screen helpers ---------- */
  const topId = async () => (await st()).stack.slice(-1)[0] || null;
  async function shotOnce(key, tag) { if (seenShot.has(key)) return; seenShot.add(key); await T.shot(tag || key.replace(/[^a-z0-9-]+/gi, '_')); }
  async function openMenu(label) {
    for (let i = 0; i < 6; i++) {
      await drain('before menu');
      let s = await st();
      if (s.stack.length === 1 && s.stack[0] === 'menu') return true;
      if (s.stack.length) { await T.tapText(/./, { sel: '.back' }); continue; }
      // tap an empty-looking floor spot (any floor tap opens the menu)
      await T.tapXY(195, 420, 400);
      s = await st(); if (s.stack.length === 1 && s.stack[0] === 'menu') { metrics.taps[label || 'menu'] = (metrics.taps[label || 'menu'] || 0); return true; }
    }
    T.find('menu:cannot-open', 'could not open the main menu by tapping the floor 6 times in a row');
    return false;
  }
  async function closeAll(label) {
    // press Back/Play until nothing is open
    for (let i = 0; i < 8; i++) { const s = await st(); if (!s.stack.length) break; const ok = await T.tapText(/./, { sel: '.back' }); if (!ok) { const topn = s.stack.slice(-1)[0]; if (/result|^mo-/.test(topn)) { if (!(await T.tapText(/^Done/i, { sel: 'button, .btn', wait: 500 }))) await T.tapXY(195, 440, 600); continue; } T.find('back:missing:' + s.stack.join('>'), 'no Back/Play button found on screen ' + s.stack.join('>')); await page.evaluate(() => ZT.popAll()); break; } await sleep(250); }
    await sleep(300); await inv(label || 'closeAll', { expectClosed: true });
  }
  async function pathTo(names, label) { // from floor: open menu then tap each name
    if (!(await openMenu(label))) return false;
    for (const n of names) { const b = await T.tapText(n); if (!b) { T.find('missing:' + names.join('>') + ':' + n, 'could not find "' + n + '" to tap on the way to ' + names.join(' > ')); return false; } await sleep(150); }
    await inv(label || names.join('>'));
    return true;
  }
  async function look(name, names) { // visit a screen, screenshot it, run invariants, come back
    const ok = await pathTo(names, name); if (!ok) return false;
    const s = await st(); const d = await describe(T);
    await shotOnce('look-' + name, 'look-' + name);
    return d;
  }
  async function backN(n) { for (let i = 0; i < n; i++) { const ok = await T.tapText(/./, { sel: '.back' }); if (!ok) T.find('back:missing2', 'Back button not found while stepping back'); await sleep(250); } await inv('back x' + n); }

  /* ---------- pop-up handling: everything the game raises by itself ---------- */
  let choiceCounter = 0, callerDismissed = [];
  async function drain(why) {
    let guard = 0, lastKey = '', same = 0, firstSeen = Date.now(), lastId = null;
    while (guard++ < 60) {
      const s = await st();
      if (!s.stack.length) { if (s.reports > 0) { await sleep(500); const s2 = await st(); if (!s2.stack.length && s2.reports > 0 && guard > 3) { /* queue gap */ } else if (!s2.stack.length) { return; } else continue; } else return; continue; }
      const id = s.stack.slice(-1)[0];
      // main-menu stack that I opened on purpose is not a pop-up
      if (s.stack[0] === 'menu') return;
      if (id !== lastId) { firstSeen = Date.now(); lastId = id; metrics.popups.push({ id, week: s.week }); }
      const d = await describe(T); const key = id + '|' + (d.text || '').slice(0, 80);
      await shotOnce('popup-' + key, 'popup-' + id + '-w' + s.week + '-' + (seenShot.size));
      await inv('popup ' + id);
      if (key === lastKey) same++; else { same = 0; lastKey = key; }
      if (same > 8) { T.find('stuck:' + id, 'pop-up "' + id + '" did not advance after 9 taps (text: ' + (d.text || '').slice(0, 100) + ')'); await T.shot('stuck-' + id); await page.evaluate(() => ZT.popAll()); return; }
      const items = d.items || [];
      const cur = await page.evaluate(() => window.ZMoments && ZMoments.cur ? JSON.stringify(ZMoments.cur) : null);
      // reveal timing: elapsed until the final beat shows
      if (cur) { const c = JSON.parse(cur); if (c.final && !metrics.reveals.find(r => r.key === key)) { metrics.reveals.push({ key, id, secs: (Date.now() - firstSeen) / 1000 }); } }
      // decide
      if (/^mo-(show|picker)/.test(id) || /Animal Show|Winter/.test(d.text || '') && /medal|Gold/i.test(d.text || '')) {
        if (await T.tapText(/Not now/i)) continue;
      }
      if (/Not now/i.test(items.join('|')) && /^mo-caller/.test(id)) { callerDismissed.push(id); await T.tapText(/Not now/i); await sleep(300); continue; }
      const opts = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return [...l.querySelectorAll('.opt')].map((e, i) => ({ i, dis: e.classList.contains('disabled') || e.getAttribute('aria-disabled') === 'true' })); });
      if (opts.length) {
        const ok = opts.filter(o => !o.dis); const pick = ok.length ? ok[choiceCounter++ % ok.length] : opts[opts.length - 1];
        await T.tapText(/./, { sel: '.opt', nth: pick.i, wait: 450 }); continue;
      }
      const btn = items.find(t => /^(Continue|Done|OK|Great|Close|Keep playing|Nice|Next|Yes|Got it)/i.test(t)) || items.find(t => /Hire$|Not now|Skip/i.test(t) && false);
      if (btn) { await T.tapText(btn.split(' ')[0], { wait: 450 }); continue; }
      // reveal card: tap the middle of the screen (the card is the tap target)
      await T.tapXY(195, 440, 700);
    }
    T.find('popup:loop', 'drain gave up after 60 steps (' + why + ')');
  }

  /* ---------- placement helper ---------- */
  async function place(kind, t, label, opts) {
    opts = opts || {};
    // wait: placement should be on
    let s = await st(); if (!s.placing) { T.find('place:not-started:' + label, 'placement mode did not start for ' + label); return { ok: false }; }
    await T.shot('place-' + label + '-start'); await inv('placement start ' + label);
    const info0 = await page.evaluate(() => ({ p: ZRender.debug().placement, note: document.getElementById('placement-note').innerText, bar: [...document.querySelectorAll('#placement-bar button')].map(b => { const r = b.getBoundingClientRect(); return b.innerText + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); }) }));
    say('  placement', label, JSON.stringify(info0.p && { ok: info0.p.ok, msg: info0.p.msg }), '| bar:', info0.bar.join(', '));
    if (info0.p && !info0.p.ok) T.find('place:ghost-starts-invalid:' + kind, 'the ghost starts on a spot that is invalid ("' + info0.p.msg + '"): the player has to move it before Place does anything', 'tester-' + T.tag + '-place-' + label + '-start.png');
    // find candidate hexes: valid ones on screen, preferring near the entrance but not on it, pick by wanting combos if asked
    const cands = await page.evaluate(({ kind, t, rot }) => {
      const S = ZT.S, res = []; const vp = { w: innerWidth, h: innerHeight - 140 };
      for (let r = -2; r < 25; r++) for (let q = -12; q < 14; q++) {
        if (!ZE.inGrid(q, r) || !ZE.inLand(S, q, r) || !ZE.canPlace(S, kind, t, q, r, rot || 0)) continue;
        const p = ZRender.hexToClient(q, r); if (!p) continue;
        if (p.x > 40 && p.x < vp.w - 40 && p.y > 90 && p.y < vp.h - 60) res.push({ q, r, x: p.x, y: p.y });
      }
      return res;
    }, { kind, t, rot: 0 });
    if (!cands.length) {
      // try dragging the floor to bring land into view
      T.find('place:no-visible-valid:' + label, 'no valid on-screen hex for ' + label + ' (needs scrolling or land is full)');
      await page.evaluate(() => ZRender.stopPlacement()); return { ok: false };
    }
    // invalid tap first (taps a hex that is occupied) to see the note
    const bad = await page.evaluate(() => { const S = ZT.S; for (const it of S.items) { const c = ZE.cells(it)[0]; const p = ZRender.hexToClient(c[0] !== undefined ? c[0] : c.q, c[1] !== undefined ? c[1] : c.r); if (p && p.y > 90 && p.y < 700) return p; } return null; });
    if (bad && !opts.skipBadTap) { await T.tapXY(bad.x, bad.y, 400); const n = await page.evaluate(() => ({ note: document.getElementById('placement-note').innerText, st: document.getElementById('placement-note').dataset.state })); say('  tapped an occupied hex ->', JSON.stringify(n)); await T.shot('place-' + label + '-invalid'); }
    const want = opts.pick ? opts.pick(cands) : cands[Math.floor(cands.length / 2)];
    await T.tapXY(want.x, want.y, 450);
    const g = await page.evaluate(() => ZRender.debug().placement);
    if (!g || g.q !== want.q || g.r !== want.r) T.find('place:tap-moves-ghost:' + label, 'tapping hex (' + want.q + ',' + want.r + ') did not put the ghost there; ghost at ' + JSON.stringify(g && { q: g.q, r: g.r }));
    if (opts.rotate) { for (let i = 0; i < opts.rotate; i++) await T.tapText('Rotate', { floor: true, sel: '#placement-bar button' }); const g2 = await page.evaluate(() => ZRender.debug().placement); say('  rotated ->', JSON.stringify(g2 && { rot: g2.rot, ok: g2.ok })); }
    await T.shot('place-' + label + '-ghost'); await inv('placement ghost ' + label);
    const gs = await page.evaluate(() => ({ p: ZRender.debug().placement, note: document.getElementById('placement-note').innerText }));
    say('  ghost state:', gs.note);
    const before = await page.evaluate(() => ({ n: ZT.S.items.length, money: Math.round(ZT.S.money) }));
    await T.tapText('Place', { floor: true, sel: '#placement-bar button', wait: 700 });
    const after = await page.evaluate(() => ({ n: ZT.S.items.length, money: Math.round(ZT.S.money) }));
    const placed = after.n > before.n;
    say('  placed:', placed, 'money', before.money, '->', after.money);
    await sleep(300); await inv('after place ' + label);
    return { ok: placed, note: gs.note };
  }

  // walk a planner: tap the first row on each screen until the green start button shows (steps may be skipped by the game)
  async function through(startRe, pre) {
    for (let i = 0; i < 6; i++) {
      const has = await T.locate(startRe, { sel: 'button, .btn' });
      if (has && !/Back|Play/.test(has.text)) { await T.shot(pre + '-confirm'); await inv(pre + ' confirm'); return true; }
      const d = await describe(T); await shotOnce(pre + '-step' + i + '-' + d.id, pre + '-step' + i); await inv(pre + ' step ' + i);
      const nx = await T.locate(/^Next/, { sel: 'button, .btn' });
      if (nx && !/pick/i.test(nx.text)) { await T.tapText(/^Next/, { sel: 'button, .btn' }); continue; }
      if (!(await T.tapText(/./, { sel: '.row.tappable' }))) return false;
    }
    return false;
  }
  /* ================= START ================= */
  await T.goto(); await installWatch();
  say('== Wildside Zoo first-year playthrough on', engine, new Date().toISOString());
  await T.shot('00-first-screen'); await inv('first screen');
  let r0 = await page.evaluate(() => ({ news: document.getElementById('news').innerText, strip: document.getElementById('strip').innerText.replace(/\n/g, ' '), icons: ZRender.debug().icons, sprites: ZRender.debug().realSprites }));
  say('first screen:', JSON.stringify(r0));
  const tapsAtStart = () => T.taps;

  /* ----- 1. drag scrolls the floor without opening the menu; zoom ----- */
  {
    const cam0 = await page.evaluate(() => ({ ...ZRender.debug().cam }));
    await T.drag(195, 300, 195, 600, 10);
    const cam1 = await page.evaluate(() => ({ ...ZRender.debug().cam })); const s = await st();
    const moved = Math.abs(cam1.x - cam0.x) + Math.abs(cam1.y - cam0.y) > 5;
    say('drag: camera', JSON.stringify(cam0), '->', JSON.stringify(cam1), 'menu opened:', s.stack.length > 0);
    if (s.stack.length) T.find('drag:opens-menu', 'a drag on the floor opened the menu (should only scroll)'); else if (!moved && engine === 'chromium') T.find('drag:no-scroll', 'a touch drag did not scroll the floor');
    await T.shot('01-after-drag'); await closeAll('drag cleanup');
    await page.evaluate(() => ZRender.centerOn && 0);
  }

  /* ----- 2. tour of every main box, then set speed 2 ----- */
  say('-- tour of the main boxes');
  const tourDump = {};
  for (const [name, subs] of [['Projects', []], ['Build', []], ['Animals', []], ['Staff', []], ['Research', []], ['Info', []], ['System', []]]) {
    const d = await look('main-' + name, [name]); if (d) tourDump[name] = d.text; await closeAll('tour ' + name);
  }
  say(JSON.stringify(tourDump, null, 1));
  // Info sub-screens
  for (const sub of ['Book', 'Combos', 'Fits', 'Rumors', 'Ranks', 'Years', 'Awards', 'Log']) {
    const ok = await pathTo(['Info', sub], 'info-' + sub); if (ok) { await shotOnce('info-' + sub, 'info-' + sub); } await closeAll('info ' + sub);
  }
  // Animals sub-tabs and an animal
  if (await pathTo(['Animals'], 'animals')) {
    await T.tapText(/^Market/); await sleep(200); await shotOnce('animals-market', 'animals-market'); await inv('market tab');
    await T.tapText(/^Pen/); await sleep(200); await shotOnce('animals-pen', 'animals-pen'); await inv('pen tab');
    await T.tapText(/^Zoo/); await sleep(200);
    await T.tapText(/./, { sel: '.row.tappable' }); await sleep(250); await shotOnce('animal-one', 'animal-one'); await inv('animal screen');
  }
  await closeAll('animals tour');
  // Staff person screen, Hire
  if (await pathTo(['Staff'], 'staff')) { await T.tapText(/./, { sel: '.row.tappable', nth: 0 }); await sleep(250); await shotOnce('staff-one', 'staff-one'); await inv('staffer'); }
  await closeAll('staff tour');
  // Research group lists
  if (await pathTo(['Research'], 'research')) { await T.tapText(/Regions/); await sleep(200); await shotOnce('research-regions', 'research-regions'); await inv('research regions'); }
  await closeAll('research tour');

  /* ----- 3. System: speed 2 ----- */
  {
    const t0 = T.taps; await pathTo(['System'], 'system'); await T.tapText('2x'); await sleep(200); const sp = await page.evaluate(() => ZCore.speed);
    say('speed after tapping 2x:', sp); if (sp !== 2) T.find('speed:2x-no-effect', 'tapping 2x in System did not set speed 2 (speed=' + sp + ')');
    await T.shot('system-speed2'); await closeAll('system');
    metrics.taps.setSpeed = T.taps - t0 + 1;
  }
  /* ----- 4. expedition ----- */
  let tapsExp = 0;
  {
    const t0 = T.taps + 1; // +1 for the floor tap that opened the menu (counted by tapXY)
    const startT = T.taps;
    await openMenu('exp'); const base = T.taps;
    await T.tapText('Projects'); await T.tapText('Expedition');
    await through(/^Send/, 'exp'); await T.tapText(/Standard/); await T.shot('exp-confirm-standard');
    const before = await page.evaluate(() => ZT.S.projects.length);
    await T.tapText(/^Send/, { wait: 600 });
    const after = await page.evaluate(() => ZT.S.projects.length);
    tapsExp = T.taps - startT; metrics.taps.expedition = tapsExp;
    say('expedition started:', after > before, 'taps incl. floor tap:', tapsExp);
    if (after <= before) T.find('exp:not-started', 'expedition did not start after Send');
    await inv('after expedition start', { expectClosed: true });
    const s = await st(); say('state after send:', JSON.stringify(s));
  }
  // running projects: can I see what an expedition is doing?
  {
    const ok = await pathTo(['Projects'], 'projects-running'); const d = await describe(T); say('Projects screen with a running expedition:', d.text);
    await T.shot('projects-running');
    const row = await T.tapText(/./, { sel: '.row.tappable' }); if (row) { await sleep(300); const d2 = await describe(T); say('  running-project screen:', d2.id, d2.text); await T.shot('project-detail'); await inv('project detail'); } else T.find('proj:no-running-row', 'a running expedition has no tappable row in Projects');
    await closeAll('projects-running');
  }

  /* ================= main loop: real clock, speed 2 ================= */
  const done = {}; const J = {};
  const jobs = [];
  const job = (name, cond, fn) => jobs.push({ name, cond, fn });

  job('event', async () => (await page.evaluate(() => ZT.S.week >= 1 && Object.values(ZRender.debug().icons).some(a => a.includes('ready-event')))), async () => {
    const dis = await page.evaluate(() => ({ icons: ZRender.debug().icons, menu: ZT.S.items.filter(i => i.k === 'hab').map(i => ZE.eventCheck(ZT.S, i.id)) })); say('  floor says:', JSON.stringify(dis));
    const t0 = T.taps; await openMenu('event'); const b = T.taps;
    await T.tapText('Projects'); const hasReady = await page.evaluate(() => document.querySelector('#screens .layer:not([hidden])').innerText);
    await T.tapText('Event'); await T.shot('event-habs'); await inv('event habs');
    await through(/^Start/, 'event');
    const n0 = await page.evaluate(() => ZT.S.projects.length);
    const sd = await describe(T); say('  event confirm screen:', sd.text);
    await T.tapText(/^(Start|Hold|Go|Send|Yes|Confirm)/i, { wait: 700 });
    const n1 = await page.evaluate(() => ZT.S.projects.length);
    metrics.taps.event = T.taps - t0; say('event started:', n1 > n0, 'taps incl floor:', metrics.taps.event);
    if (n1 <= n0) { T.find('event:not-started', 'hold-event flow did not start an event; last screen: ' + sd.text.slice(0, 120)); await closeAll('event fail'); }
    await inv('after event start', { expectClosed: true });
    // can I tell from the floor that the habitat is busy / what's running
    say('  floor icons now:', JSON.stringify(await page.evaluate(() => ZRender.debug().icons)));
  });

  job('breed', async () => (await page.evaluate(() => Object.values(ZRender.debug().icons).some(a => a.includes('ready-breed')) && ZT.S.projects.filter(p => p.type === 'breed').length === 0)), async () => {
    const t0 = T.taps; await openMenu('breed');
    say('  floor icons before breeding:', JSON.stringify(await page.evaluate(() => ZRender.debug().icons)));
    await T.tapText('Projects'); await T.tapText('Breeding'); await T.shot('breed-pairs'); await inv('breed pairs');
    await through(/^Start/, 'breed');
    const n0 = await page.evaluate(() => ZT.S.projects.length);
    const sd = await describe(T); say('  breed confirm:', sd.text);
    await T.tapText(/^(Start|Pair|Breed|Go|Yes|Confirm)/i, { wait: 700 });
    const n1 = await page.evaluate(() => ZT.S.projects.length);
    metrics.taps.breed = T.taps - t0; say('breeding started:', n1 > n0, 'taps incl floor:', metrics.taps.breed);
    if (n1 <= n0) { T.find('breed:not-started', 'pair-for-breeding flow did not start; last screen: ' + sd.text.slice(0, 120)); await closeAll('breed fail'); }
    await inv('after breeding start', { expectClosed: true });
  });

  job('house', async () => (await page.evaluate(() => ZT.S.animals.some(a => a.hab == null || a.hab === 0 && false) || ZE.penCount && 0)), async () => { });
  jobs.pop();
  job('house-pen', async () => (await page.evaluate(() => ZT.S.animals.some(a => a.hab == null))), async () => {
    const t0 = T.taps; await openMenu('house'); await T.tapText('Animals'); await T.tapText(/^Pen/); await T.shot('house-pen'); await inv('pen with animals');
    const d = await describe(T); say('  pen screen:', d.text);
    const pen0 = await page.evaluate(() => ZT.S.animals.filter(a => a.hab == null).length);
    const hb = await T.tapText(/^House$/, { sel: 'button, .btn', wait: 500 }) || await T.tapText(/House all/i, { wait: 500 });
    const pen1 = await page.evaluate(() => ZT.S.animals.filter(a => a.hab == null).length);
    metrics.taps.house = T.taps - t0; say('housed one animal: pen', pen0, '->', pen1, 'taps incl floor+Animals+Pen:', metrics.taps.house);
    if (!hb) T.find('house:no-button', 'no House button on the pen screen: ' + d.text.slice(0, 100));
    await T.shot('house-after'); await closeAll('house');
  });

  job('buildHab', async () => (await page.evaluate(() => ZT.S.money > 9000 && ZT.S.week >= 3)), async () => {
    const t0 = T.taps; await openMenu('buildHab'); await T.tapText('Build'); await T.tapText('Habitats'); await T.shot('build-habs'); await inv('build habs');
    await T.tapText(/./, { sel: '.row.tappable' }); await sleep(300);
    const res = await place('hab', 'savanna', 'habitat2', { rotate: 2 });
    metrics.taps.buildHab = T.taps - t0; say('second habitat placed:', res.ok, 'taps incl floor:', metrics.taps.buildHab);
    if (!res.ok) { await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button' }); await sleep(400); await closeAll('hab cancel'); }
    else { const s = await st(); say('  after placing: stack', s.stack.join('>'), 'placing', s.placing, 'running', s.running); }
    await inv('after hab placement', { expectClosed: false });
    const s2 = await st(); if (!s2.placing && !s2.stack.length) await inv('hab done', { expectClosed: true });
  });

  async function buildFac(rowRe, label, wantCombo) {
    const t0 = T.taps; await openMenu(label); await T.tapText('Build'); await T.tapText('Facilities'); await shotOnce('build-facs', 'build-facs'); await inv('build facs');
    const got = await T.tapText(rowRe, { sel: '.row', wait: 400 }); if (!got) { T.find('fac:row:' + label, 'facility row ' + rowRe + ' not found'); await closeAll(label); return false; }
    const s = await st(); if (!s.placing) { T.find('fac:placement-not-started', 'tapping a facility did not start placement'); await closeAll(label); return false; }
    await shotOnce('place-' + label + '-start', 'place-' + label + '-start'); await inv('placement start ' + label);
    const g0 = await page.evaluate(() => ({ p: ZRender.debug().placement }));
    if (g0.p && !g0.p.ok) T.find('place:ghost-starts-invalid', 'the placement ghost starts on an invalid spot ("' + g0.p.msg + '") so the first Place tap does nothing until the player moves it', 'tester-' + T.tag + '-place-' + label + '-start.png');
    const cands = await page.evaluate(() => {
      const S = ZT.S, res = []; const hab = S.items.filter(i => i.k === 'hab' && i.t === 'savanna'); const near = new Set();
      for (const h of hab) for (const c of ZE.cells(h)) for (const d of ZE.DIRS) near.add((c[0] + d[0]) + ',' + (c[1] + d[1]));
      const fid = ZRender.debug().placement && ZRender.debug().placement.t;
      for (let r = -2; r < 25; r++) for (let q = -12; q < 14; q++) {
        if (!ZE.inGrid(q, r) || !ZE.inLand(S, q, r)) continue; const p = ZRender.hexToClient(q, r); if (!p || !(p.x > 30 && p.x < 360 && p.y > 90 && p.y < 640)) continue;
        if (S.items.some(it => ZE.cells(it).some(c => c[0] === q && c[1] === r)) || ZE.isEntrance(q, r)) continue; res.push({ q, r, x: p.x, y: p.y, near: near.has(q + ',' + r) });
      }
      res.sort((a, b) => (b.near - a.near)); return res;
    });
    let note = '', tried = 0;
    for (const c of cands.slice(0, wantCombo ? 14 : 1)) {
      await T.tapXY(c.x, c.y, 350); tried++; note = await page.evaluate(() => document.getElementById('placement-note').innerText);
      if (!wantCombo || /Completes/i.test(note)) break;
    }
    say('  ' + label + ': tried', tried, 'hexes, note:', note);
    await T.shot('place-' + label + '-ghost'); await inv('placement ghost ' + label);
    const before = await page.evaluate(() => ({ n: ZT.S.items.length, money: Math.round(ZT.S.money), combos: ZE.c(ZT.S).active.length }));
    await T.tapText('Place', { floor: true, sel: '#placement-bar button', wait: 900 });
    const after = await page.evaluate(() => ({ n: ZT.S.items.length, money: Math.round(ZT.S.money), combos: ZE.c(ZT.S).active.length, stack: ZT.stack(), reports: ZT.S.reports.length }));
    say('  placed:', after.n > before.n, 'combos', before.combos, '->', after.combos, 'reports', after.reports, 'stack', after.stack.join('>'));
    say('  bar buttons after Place:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#placement-bar button')].map(b => b.innerText))));
    await shotOnce('place-' + label + '-after', 'place-' + label + '-after');
    await drain('combo report');
    const s2 = await st(); say('  after combo popup: placing', s2.placing, 'running', s2.running, 'stack', s2.stack.join('>'));
    if (s2.placing) { await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button', wait: 600 }); }
    await sleep(500); const s3 = await st(); say('  after Cancel: stack', s3.stack.join('>'), 'placing', s3.placing, 'running', s3.running);
    await closeAll(label);
    await sleep(1500); const s4 = await st(); say('  after closing everything: running', s4.running, 'stack', s4.stack.join('>'), 'reports', s4.reports);
    if (!s4.running && !s4.stack.length && !s4.placing && !s4.reports) T.find('pause:after-build-' + label, 'clock stays PAUSED after building ' + label + ' with nothing open (combos ' + before.combos + '->' + after.combos + ')');
    metrics.taps['fac-' + label] = T.taps - t0; return after.n > before.n;
  }
  job('buildFacs', async () => (await page.evaluate(() => ZT.S.week >= 6 && ZT.S.money > 3000)), async () => {
    await buildFac(/Snack Stand/, 'snack', false);
    await buildFac(/Garden Bench/, 'bench-combo', true);
    const c = await page.evaluate(() => ({ active: ZE.c(ZT.S).active.map(a => a.id) })); say('  combos now:', JSON.stringify(c));
  });
  job('restroom', async () => (await page.evaluate(() => ZT.S.week >= 14 && ZT.S.money > 2500)), async () => { await buildFac(/Restroom/, 'restroom', false); });

  job('combo', async () => (await page.evaluate(() => ZT.S.week >= 20)), async () => {
    await openMenu('combo'); await T.tapText('Info'); await T.tapText('Combos'); await T.shot('combos'); await inv('combos');
    const d = await describe(T); say('  combos screen:', d.text.slice(0, 300)); await closeAll('combo');
  });

  job('market-buy', async () => (await page.evaluate(() => ZT.S.week >= 8 && ZT.S.money > 3000 && ZT.S.offers && ZT.S.offers.list && ZT.S.offers.list.length > 0)), async () => {
    const t0 = T.taps; await openMenu('buy'); await T.tapText('Animals'); await T.tapText(/^Market/); await sleep(250); await shotOnce('market-offers', 'market-offers'); await inv('market');
    const n0 = await page.evaluate(() => ZT.S.animals.length);
    const d = await describe(T); say('  market:', d.text.slice(0, 200));
    const b = await T.tapText(/./, { sel: '.row.tappable', nth: 1, wait: 700 });
    const d2 = await describe(T); say('  after tapping an offer:', d2.id, d2.text.slice(0, 200)); await shotOnce('market-offer-tap', 'market-offer-tap'); await inv('market offer');
    if (/^(Buy|Yes|Confirm)/i.test((d2.items || []).join('|')) ) await T.tapText(/^(Buy|Yes|Confirm)/i, { wait: 700 });
    await sleep(400); await drain('buy'); await shotOnce('market-bought', 'market-bought');
    const n1 = await page.evaluate(() => ZT.S.animals.length); metrics.taps.buyAnimal = T.taps - t0; say('bought:', n1 > n0, 'taps (incl floor):', metrics.taps.buyAnimal);
    await closeAll('buy');
  });
  job('move-animal', async () => (await page.evaluate(() => ZT.S.week >= 9 && ZT.S.items.filter(i => i.k === 'hab').length >= 2 && ZT.S.animals.length >= 3)), async () => {
    const t0 = T.taps; await openMenu('move'); await T.tapText('Animals'); await T.tapText(/^Zoo/); await T.tapText(/./, { sel: '.row.tappable', nth: 0, wait: 400 }); await shotOnce('animal-detail', 'animal-detail'); await inv('animal detail');
    const d = await describe(T); say('  animal screen:', d.text.slice(0, 260));
    await T.tapText(/Choose habitat/i, { wait: 400 }); await shotOnce('animal-hab-pick', 'animal-hab-pick'); await inv('animal hab pick'); const d2 = await describe(T); say('  hab pick:', d2.id, d2.text.slice(0, 200));
    const before = await page.evaluate(() => ZT.S.animals[0].hab);
    await T.tapText(/./, { sel: '.row.tappable', nth: 1, wait: 600 });
    const after = await page.evaluate(() => ZT.S.animals[0].hab); metrics.taps.moveAnimal = T.taps - t0; say('  animal moved', before, '->', after, 'taps incl floor+Animals+animal+Choose+hab:', metrics.taps.moveAnimal);
    await drain('move'); await closeAll('move');
  });

  job('train', async () => (await page.evaluate(() => ZT.S.week >= 8 && ZT.S.money > 800)), async () => {
    const t0 = T.taps; await openMenu('train'); await T.tapText('Staff'); await T.tapText(/./, { sel: '.row.tappable', nth: 0 }); await sleep(250); await T.shot('staff-person'); await inv('staff person');
    await T.tapText(/^Train/); await sleep(250); await T.shot('train-pick'); await inv('train pick');
    const d = await describe(T); say('  train screen:', d.text);
    const m0 = await page.evaluate(() => Math.round(ZT.S.money));
    await T.tapText(/./, { sel: '.row.tappable, .opt, .btn:not(.back)', nth: 0, wait: 700 });
    await sleep(700); await T.shot('train-result'); await inv('train result');
    const rs = await describe(T); say('  after train:', rs.id, rs.text);
    metrics.taps.train = T.taps - t0;
    await drain('train'); await closeAll('train');
  });

  job('hire', async () => (await page.evaluate(() => ZT.S.week >= 10 && ZT.S.money > 2000 && ZT.S.staff.length < 3)), async () => {
    const t0 = T.taps; await openMenu('hire'); await T.tapText('Staff'); await T.tapText(/^Hire/); await sleep(250); await T.shot('hire-tiers'); await inv('hire tiers');
    const d = await describe(T); say('  hire tiers:', d.text);
    const n0 = await page.evaluate(() => ZT.S.staff.length);
    await T.tapText(/./, { sel: '.row.tappable, .opt, .gbox', nth: 0, wait: 900 });
    for (let i = 0; i < 6; i++) {       // advert reveal ("who turned up"): tap through, then Hire the first person
      const s = await st(); const dd = await describe(T); say('  hire step', i, dd.id, '|', (dd.text || '').slice(0, 90));
      await shotOnce('hire-' + i + '-' + dd.id, 'hire-step-' + i); await inv('hire step ' + i);
      if (/Pay|Confirm/.test((dd.items || []).join('|')) && !/Who turned up|Hire/.test(dd.text)) { await T.tapText(/^(Pay|Confirm|Advertise)/i, { wait: 700 }); continue; }
      if (/Hire/.test(dd.text) && !/Notice board/.test(dd.text)) { const hb = await T.tapText(/^Hire/, { sel: 'button, .btn', nth: 0, wait: 800 }); if (hb) break; }
      await T.tapXY(195, 440, 700);
    }
    await sleep(500); await shotOnce('hire-after', 'hire-after');
    const n1 = await page.evaluate(() => ZT.S.staff.length);
    metrics.taps.hire = T.taps - t0; say('hired:', n1 > n0, 'staff', n0, '->', n1, 'taps (incl floor, Staff, Hire, tier, Hire):', metrics.taps.hire);
    if (n1 <= n0) T.find('hire:no-hire', 'could not hire anyone from the advert result screen (staff stayed ' + n0 + ')');
    await inv('hire done'); await T.tapText(/^Done/i, { sel: 'button, .btn', wait: 600 }); { const dd = await describe(T); say('  after Done on the pick list:', dd.id, '|', (dd.text || '').slice(0, 160)); await T.shot('hire-after-done'); await inv('hire after done'); } await drain('hire'); await closeAll('hire');
  });

  job('research', async () => (await page.evaluate(() => ZE.researchList(ZT.S).some(r => !r.done && !r.lock && r.rp <= ZT.S.rp))), async () => {
    const t0 = T.taps; await openMenu('research'); await T.tapText('Research'); await T.shot('research-top'); await inv('research top');
    const pick = await page.evaluate(() => { const r = ZE.researchList(ZT.S).filter(r => !r.done && !r.lock && r.rp <= ZT.S.rp)[0]; return r && { group: r.group, name: r.name, rp: r.rp }; });
    say('  affordable research:', JSON.stringify(pick));
    const gmap = { 'Event themes': 'Themes' };
    await T.tapText(gmap[pick.group] || pick.group); await sleep(250); await shotOnce('research-list', 'research-list'); await inv('research list');
    const d = await describe(T); say('  list:', d.text.slice(0, 260));
    const rp0 = await page.evaluate(() => ZT.S.rp);
    await T.tapText(pick.name, { sel: '.row', wait: 500 }); await shotOnce('research-confirm', 'research-confirm'); await inv('research confirm');
    const cd = await describe(T); say('  confirm:', cd.text.slice(0, 200));
    await T.tapText(/^(Research|Yes|Confirm|Buy|Learn|Start)/i, { wait: 600 }); await sleep(300);
    const rp1 = await page.evaluate(() => ZT.S.rp); say('  rp', rp0, '->', rp1);
    if (!(rp1 < rp0)) T.find('research:not-bought', 'tapping the affordable research "' + pick.name + '" then the confirm button did not spend research points');
    metrics.taps.research = T.taps - t0; await closeAll('research');
  });

  job('callers', async () => (await page.evaluate(() => (ZT.S.offers && ZT.S.offers.list && ZT.S.offers.list.length > 0 && callersSeen()) )), async () => { });
  jobs.pop();

  job('save-reload', async () => (await page.evaluate(() => ZT.S.week >= 22)), async () => {
    await drain('before save'); await openMenu('save'); await T.tapText('System'); await T.tapText('Save now'); await sleep(300);
    const toast = await page.evaluate(() => document.querySelector('#toasts').innerText); say('  save toast:', JSON.stringify(toast));
    await T.shot('system-saved'); await closeAll('save');
    const before = await page.evaluate(() => ({ w: ZT.S.week, money: Math.round(ZT.S.money), animals: ZT.S.animals.length, items: ZT.S.items.length, staff: ZT.S.staff.length, speed: ZCore.speed }));
    // pause by opening the menu so the week cannot change between save and reload
    await openMenu('reload'); await sleep(200);
    await page.evaluate(() => ZT.save());
    await page.reload(); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready, null, { timeout: 10000 }); await sleep(800); await installWatch();
    const after = await page.evaluate(() => ({ w: ZT.S.week, money: Math.round(ZT.S.money), animals: ZT.S.animals.length, items: ZT.S.items.length, staff: ZT.S.staff.length, speed: ZCore.speed }));
    say('  reload: before', JSON.stringify(before), 'after', JSON.stringify(after));
    for (const k of Object.keys(before)) if (k !== 'money' && before[k] !== after[k]) T.find('reload:' + k, 'after a reload ' + k + ' changed ' + before[k] + ' -> ' + after[k]);
    if (Math.abs(before.money - after.money) > 3000) T.find('reload:money', 'money differs a lot after reload ' + before.money + ' -> ' + after.money);
    await T.shot('after-reload'); await inv('after reload', { expectClosed: true });
    const s = await st(); say('  after reload state', JSON.stringify(s));
    // the clock must be running again after reload
    await sleep(1500); const s2 = await st(); if (!s2.stack.length && s2.week === after.w && s2.running === false) T.find('reload:not-running', 'clock not running after reload');
    await drain('after reload');
  });

  job('speed-change', async () => (await page.evaluate(() => ZT.S.week >= 30)), async () => {
    await pathTo(['System'], 'speed'); await T.tapText('1x'); const a = await page.evaluate(() => ZCore.speed); await T.tapText('2x'); const b = await page.evaluate(() => ZCore.speed);
    say('  speed taps: 1x ->', a, ' 2x ->', b); if (a !== 1 || b !== 2) T.find('speed:buttons', 'speed buttons did not set speeds (got ' + a + ', ' + b + ')');
    await T.tapText('Far'); await sleep(300); await T.shot('zoom-far'); await T.tapText('Close'); await closeAll('speed');
  });

  job('callers-find', async () => (callerDismissed.length > 0 || (await page.evaluate(() => ZT.S.week >= 40))), async () => {
    // can a dismissed caller's offer be found again?
    await pathTo(['Animals'], 'market'); await T.tapText(/^Market/); await sleep(300); await T.shot('market-after'); const d = await describe(T); say('  Animals>Market:', d.text.slice(0, 250)); await inv('market'); await closeAll('market');
    await pathTo(['Staff'], 'staff-hh'); const d2 = await describe(T); say('  Staff screen:', d2.text.slice(0, 250)); await closeAll('staff');
  });

  // The scheduler: run until the year-end screen has been seen and dismissed
  const lastWeekPrint = { w: -1 };
  let yearEndSeen = false; let loops = 0; const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    loops++;
    await drain('loop');
    const s = await st();
    const w = s.week;
    if (w !== lastWeekPrint.w && w % 4 === 0) { lastWeekPrint.w = w; say('  week', w, 'money', s.money, 'speed', s.speed, 'stack', s.stack.join('>') || '-', 'running', s.running, 't+' + Math.round((Date.now() - startMs) / 1000) + 's'); }
    // popups seen include yearend?
    if (metrics.popups.some(p => /yearend/.test(p.id))) yearEndSeen = true;
    if (yearEndSeen && w >= 48) break;
    if (w >= 49 && !s.stack.length) break;
    for (const j of jobs) {
      if (done[j.name]) continue;
      let ready = false; try { ready = await j.cond(); } catch (e) { ready = false; }
      if (!ready) continue;
      const s2 = await st(); if (s2.stack.length) break;   // something is open: handle it first
      done[j.name] = true; say('-- job', j.name, 'at week', w, 't+' + Math.round((Date.now() - startMs) / 1000) + 's');
      try { await j.fn(); } catch (e) { T.find('script:' + j.name, 'tester script error in job ' + j.name + ': ' + e.message.slice(0, 120)); say('   job error', e.stack.split('\n').slice(0, 3).join(' / ')); await page.evaluate(() => ZT.popAll()).catch(() => { }); }
      await drain('after job ' + j.name); await inv('after job ' + j.name, { expectClosed: true });
      break;
    }
    await inv('tick ' + w, { expectClosed: true });
    await sleep(400);
  }
  const end = await st(); say('== end of loop: week', end.week, 'stack', end.stack.join('>'), 'money', end.money, 'elapsed', Math.round((Date.now() - startMs) / 1000) + 's');
  await T.shot('99-end');
  /* ----- summary ----- */
  const sumry = await page.evaluate(() => ({ week: ZT.S.week, money: Math.round(ZT.S.money), animals: ZT.S.animals.length, items: ZT.S.items.length, staff: ZT.S.staff.length, rank: ZT.S.rank, rep: Math.round(ZT.S.rep || 0), errors: ZT.errors.slice(0, 5), did: ZT.S.did }));
  say('summary', JSON.stringify(sumry));
  say('jobs done:', Object.keys(done).join(','), 'not run:', jobs.filter(j => !done[j.name]).map(j => j.name).join(',') || 'none');
  say('popups seen:', JSON.stringify(metrics.popups.map(p => p.id + '@' + p.week)));
  say('reveal timing (secs to final card, untouched):', JSON.stringify(metrics.reveals));
  const toastAge = Object.entries(metrics.toasts).map(([k, v]) => k + ': ' + ((v.last - v.first) / 1000).toFixed(1) + 's top ' + v.top + ' bottom ' + v.bottom + ' over ' + v.overStack);
  say('toasts:', JSON.stringify(toastAge));
  say('tap counts:', JSON.stringify(metrics.taps), 'total taps', T.taps);
  say('FINDINGS (' + T.findings.length + '):'); T.findings.forEach((f, i) => say('  ' + (i + 1) + '. ' + f.msg + (f.shot ? ' [' + f.shot + ']' : '')));
  say('console errors:', JSON.stringify(T.consoleErrors));
  say('shots:', T.shots.length);
  try { const lt = await page.evaluate(() => ZT.logText()); fs.writeFileSync(require('path').join(L.SHOTS, 'tester-play-' + T.tag + '.gamelog.txt'), lt); const rep = (lt.match(/"t":"report"[^\n]*/g) || []); const seen = {}; let dup = 0; rep.forEach(l => { seen[l] = (seen[l] || 0) + 1; }); Object.entries(seen).forEach(([k, v]) => { if (v > 1) { dup++; say('  DUPLICATE report line x' + v + ': ' + k.slice(0, 120)); } }); say('report lines in log:', rep.length, 'duplicates:', dup); if (dup) T.find('dup:report', dup + ' report log line(s) appear more than once (see tester-play log)'); } catch (e) { say('log analysis failed', e.message); }
  fs.writeFileSync(require('path').join(L.SHOTS, 'tester-play-' + T.tag + '.log'), out.join('\n'));
  fs.writeFileSync(require('path').join(L.SHOTS, 'tester-play-' + T.tag + '.json'), JSON.stringify({ findings: T.findings, metrics, taps: T.taps, summary: sumry, consoleErrors: T.consoleErrors }, null, 1));
  await T.browser.close();
})().catch(e => { console.error('SCRIPT CRASH', e); process.exit(1); });
