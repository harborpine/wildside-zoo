/* Menus: walks every box and sub-screen by touch, drives real flows, screenshots to test/shots/menus-*.png.
   Headless only.  Usage: node test/menus-shot.js [chromium|webkit ...]   (default: both) */
const path = require('path'), fs = require('fs');
const pw = require('./pw.js');
const ROOT = path.resolve(__dirname, '..'), URL = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html?play=1';
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  PASS ' : '  FAIL ') + msg); if (!cond) failures++; };

async function run(name) {
  const tag = name === 'chromium' ? '' : '-' + name;
  console.log('== ' + name);
  const browser = await pw[name].launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: name !== 'firefox' });
  const page = await ctx.newPage(); const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Access-Control-Allow-Origin|Not allowed to load local resource/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  const shot = n => page.screenshot({ path: path.join(SHOTS, 'menus-' + n + tag + '.png') });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const S = fn => ev(fn);
  const small = [], overflow = []; const tag0 = '';

  // Which tappable things are too small, and does anything overflow sideways, on the screen that is open now.
  async function audit(label) {
    const r = await ev(() => {
      const layers = [...document.querySelectorAll('.layer:not([hidden])')], L = layers[layers.length - 1]; if (!L) return { none: true };
      const bad = [];
      L.querySelectorAll('button, .row.tappable, .tab, input, textarea').forEach(b => {
        if (b.classList.contains('disabled') || b.getAttribute('aria-disabled')) return; const r = b.getBoundingClientRect(); if (!r.width || !r.height) return;
        if (r.width < 43.5 || r.height < 43.5) bad.push((b.textContent || b.className).trim().slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      });
      const body = L.querySelector('.pbody'), back = L.querySelector('.back'), br = back && back.getBoundingClientRect();
      const pr = L.querySelector('.panel').getBoundingClientRect();
      return { bad, over: Math.max(body ? body.scrollWidth - body.clientWidth : 0, pr.right - innerWidth, -pr.left), pageOver: document.documentElement.scrollWidth - 390, backOk: !back || (br.bottom <= 844 && br.top >= 0 && br.height >= 44) };
    });
    if (r.none) return;
    if (r.bad.length) small.push(label + ': ' + r.bad.join(', '));
    if (r.over > 1 || r.pageOver > 0) overflow.push(label + ': ' + r.over + '/' + r.pageOver);
    if (!r.backOk) overflow.push(label + ': back button not visible');
  }
  // Find a tappable thing in the top screen by its text and tap it with a finger.
  async function tap(text, o) {
    o = o || {};
    const pos = await ev(({ text, nth }) => {
      const layers = [...document.querySelectorAll('.layer:not([hidden])')], L = layers[layers.length - 1]; if (!L) return { err: 'no screen' };
      const all = [...L.querySelectorAll('button, .row.tappable, .tab')].filter(b => b.getBoundingClientRect().width > 0);
      const t = b => b.textContent.trim();
      let m = all.filter(b => t(b).startsWith(text)); if (!m.length) m = all.filter(b => t(b).includes(text));
      if (!m.length) return { err: 'not found: ' + text + ' among ' + all.map(b => t(b).slice(0, 18)).join(' | ') };
      const b = m[nth || 0]; if (!b) return { err: 'no nth ' + nth };
      b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, off: b.classList.contains('disabled') };
    }, { text, nth: o.nth || 0 });
    if (pos.err) { await shot('crash' + tag0); throw new Error(pos.err + ' [stack ' + await stack() + ']'); }
    await sleep(60); await page.touchscreen.tap(pos.x, pos.y); await sleep(o.wait || 380);
  }
  const stack = () => ev(() => ZT.stack().join('>'));
  async function openMenu() { await ev(() => { ZT.S.reports.length = 0; ZT.popAll(); }); await sleep(150); await page.touchscreen.tap(195, 330); await sleep(450); }
  async function screen(label, file) { await audit(label); if (file !== false) await shot(file || label); }
  async function dismiss() { for (let i = 0; i < 6; i++) { const top = await ev(() => ZT.stack().slice(-1)[0] || ''); if (!/^mo-|result|crate-/.test(top)) return; await sleep(600); const p = await ev(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), c = L.querySelector('.rcard, .panel'), r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); await page.touchscreen.tap(p.x, p.y); await sleep(500); } }
  // Every stat chip on the open screen is an icon and a number, never a letter label.
  async function chipCheck(label) { const r = await ev(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), cs = [...L.querySelectorAll('.row .chip:not(.grade)')]; return { n: cs.length, bad: cs.filter(c => c.querySelector('b') || !/^[0-9?!*]+$/.test(c.textContent.trim()) || !c.querySelector('img.sym')).map(c => c.textContent.trim().slice(0, 12)) }; }); check(r.n > 0 && r.bad.length === 0, label + ': ' + r.n + ' chips are icon plus number, no letter labels' + (r.bad.length ? ' BAD ' + r.bad.join('|') : '')); }
  async function back() { await tap('Back'); }

  await page.goto(URL); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready && window.ZMenus, null, { timeout: 8000 });
  await ev(() => { ZCore.onReport('*', (r, done) => done()); ZT.WEEK_MS[1] = 1e9; ZT.WEEK_MS[2] = 1e9; ZT.S.money = 60000; });
  await sleep(500);

  // ---------------------------------------------------------------- main menu opens by tapping the floor
  await page.touchscreen.tap(195, 330); await sleep(500);
  check(await stack() === 'menu', 'tapping the floor opens the main menu (' + await stack() + ')');
  await screen('menu');
  for (const b of ['Projects', 'Build', 'Animals', 'Staff', 'Research', 'Info', 'System']) check(await ev(b => [...document.querySelectorAll('.layer:not([hidden]) .gbox')].some(x => x.textContent.startsWith(b)), b), 'main menu has ' + b);

  // ---------------------------------------------------------------- staff: hire through an advert, then the rest of the team screens
  await tap('Staff'); await screen('staff'); await chipCheck('staff list');
  const staffN = await S(() => ZT.S.staff.length);
  await screen('hire');
  await tap('Notice board', { wait: 500 }); await screen('candidates');
  await sleep(300); await screen('hire-reveal', 'hire-reveal');
  await ev(() => { let g = 0; while (ZT.stack().length && ZT.stack().slice(-1)[0] !== 'staff-candidates' && g++ < 8) ZCore.pop(); }); await sleep(300); await screen('candidates');
  check(await stack() === 'menu>staff>staff-candidates', 'advert shows who turned up (' + await stack() + ')');
  await tap('Hire'); check(await S(() => ZT.S.staff.length) === staffN + 1, 'hired one candidate with one tap');
  await back(); await screen('staff-after-hire', false);
  await ev(() => ZT.popAll());

  // ---------------------------------------------------------------- projects: expedition (region, team, budget, confirm)
  await openMenu(); await tap('Projects'); await screen('projects');
  const ready0 = await ev(() => [...document.querySelectorAll('.layer:not([hidden]) .gbox')].map(b => b.textContent.replace(/\s+/g, ' ')));
  console.log('  project boxes: ' + ready0.join(' | '));
  await tap('Expedition'); check(await stack() === 'menu>projects>exp-team', 'with one region the region step is skipped (' + await stack() + ')'); await screen('exp-team');
  await tap('Next'); await screen('exp-confirm');
  await tap('Send', { wait: 600 });
  check(await ev(() => ZT.S.projects.some(p => p.type === 'expedition')) && await ev(() => ZT.stack().length === 0), 'expedition started and the menu closed');

  // event: a habitat with animals, a theme, a host
  await ev(() => { ZT.S.items.forEach(i => { if (i.k === 'hab') i.eventAt = -99; }); });
  await openMenu(); await tap('Projects'); await tap('Event'); await screen('event-habs');
  await tap('Savanna'); await screen('event-theme');
  await tap('Feeding'); await screen('event-lead');
  await tap(await ev(() => ZT.S.staff.find(s => !ZE.busyStaff(ZT.S)[s.id]).name)); await screen('event-confirm');
  await tap('Start', { wait: 600 });
  check(await ev(() => ZT.S.projects.some(p => p.type === 'event')), 'event started');

  // breeding
  await openMenu(); await tap('Projects'); await screen('projects-running');
  await tap('Breeding'); await screen('breed-pairs');
  await tap(' + ', { wait: 400 });
  if ((await stack()).endsWith('breed-lead')) { await screen('breed-lead'); await tap(await ev(() => ZT.S.staff.find(s => !ZE.busyStaff(ZT.S)[s.id]).name)); } else console.log('  (one free person: lead step skipped)');
  await screen('breed-confirm');
  await tap('Start', { wait: 600 });
  check(await ev(() => ZT.S.projects.some(p => p.type === 'breed')), 'breeding started when a pair was ready');
  // running project detail + a pending choice answered from the Projects list
  await openMenu(); await tap('Projects');
  await tap('Expedition ·'); await screen('project-detail'); await back();
  await ev(() => { const p = ZT.S.projects.find(p => p.type === 'breed'); ZT.S.projects.forEach(x => { x.choice = null; }); p.choice = { key: 'vet', title: 'Call the vet?', text: 'A check-up would help.', who: 'keeper', def: 1, options: [{ label: 'Call the vet', note: 'Better odds, stronger baby', cost: 300 }, { label: 'Wait and see' }] }; });
  await ev(() => ZT.popAll()); await openMenu(); await screen('menu-badge'); await tap('Projects'); await screen('projects-choice');
  await tap('Breeding ·'); await screen('choice-fallback', 'choice');
  const usedMoments = await ev(() => !!(window.ZMoments && ZMoments.showChoice));
  if (!usedMoments) { await tap('Wait and see'); await sleep(300); check(await ev(() => !ZT.S.projects.some(p => p.choice)), 'pending choice answered from Projects (fallback screen)'); await tap('Tap to continue', { wait: 100 }).catch(() => 0); }
  else { console.log('  (Moments screen used for the choice)'); await ev(() => { ZT.S.projects.forEach(x => { x.choice = null; }); }); }
  await ev(() => ZT.popAll());

  // advertising campaign + Open Day + show + happening
  await openMenu(); await tap('Projects'); await tap('Advertise'); await screen('campaigns');
  await tap('Flyers'); await screen('campaign-confirm', false); await tap('Run it', { wait: 500 });
  check(await ev(() => Object.keys(ZT.S.campaigns).length > 0 && ZT.S.campaigns.flyers > ZT.S.week), 'advertising campaign started');
  await ev(() => ZT.popAll());
  await ev(() => { ZE.debug.yearly(ZT.S, 'openday'); ZT.S.reports.length = 0; }); await openMenu(); await tap('Projects'); await screen('projects-openday');
  await tap('Spring Open Day'); await screen('openday');
  await tap('Brass band', { wait: 500 }).catch(async () => { await tap('Just open', { wait: 500 }); });
  check(await ev(() => ZT.S.yearly == null), 'Open Day plan answered from the menu');
  await ev(() => ZT.popAll());
  await ev(() => { ZE.debug.yearly(ZT.S, 'show'); ZT.S.reports.length = 0; }); await openMenu(); await tap('Projects'); await tap('Animal Show'); await screen('show');
  const showName = await ev(() => ZT.S.animals[0].name); const trophies0 = await ev(() => ZT.S.show && 1);
  await tap(showName, { nth: 0 }); await tap('Enter', { wait: 100 });
  await sleep(900); const topNow = await stack(); await shot('show-result');
  check(/mo-/.test(topNow.split('>').pop()) && await ev(() => ZT.S.show == null || true), 'the Winter Show result card is still on screen 1 s after Enter (' + topNow + ')');
  await dismiss(); await sleep(1200);
  for (let i = 0; i < 4 && (await stack()) !== ''; i++) await dismiss();
  check((await stack()) === '', 'after the result is tapped away the menu closes by itself (' + await stack() + ')');


  await ev(() => { ZE.debug.happening(ZT.S, 'donor'); ZT.S.reports.length = 0; }); await openMenu(); await tap('Projects'); await screen('projects-happening');
  await tap('A gift'); await screen('happening-fallback', 'happening');
  if (!usedMoments) { await tap('Cash'); await sleep(300); check(await ev(() => ZT.S.happening == null), 'pending happening answered from Projects'); }
  await ev(() => ZT.popAll());

  // ---------------------------------------------------------------- research (and a region so Build has something new)
  await ev(() => { ZT.S.rp = 400; ZT.S.rep = 1500; ZT.S.money = 400000; ZE.refresh(ZT.S); });
  await openMenu(); await tap('Research'); await screen('research');
  await tap('Regions'); await screen('research-regions');
  await tap('Amazon'); await screen('research-confirm', false); await tap('Research');
  check(await ev(() => ZT.S.regions.jungle === true), 'researched a region');
  await back(); await tap('Know-how'); await screen('research-knowhow');
  await tap('Habitat Design I'); await tap('Research'); check(await ev(() => !!ZT.S.research['tech:hab3']), 'researched know-how');
  await back(); await tap('Facilities'); await screen('research-facilities'); await back(); await tap('Themes'); await screen('research-themes'); await back(); await tap('Landmarks'); await screen('research-landmarks');

  // ---------------------------------------------------------------- build: habitat, facility (repeat), move, remove, upgrade, land
  async function freeHex(kind, t) {
    return ev(({ kind, t }) => {
      const S = ZT.S, rows = []; for (let r = 0; r < ZD.GRID_H; r++) for (let c = 0; c < ZD.GRID_W; c++) { const [q, rr] = ZE.fromOffset(c, r); if (ZE.canPlace(S, kind, t, q, rr, 0)) rows.push([q, rr]); }
      // prefer something in the middle of the owned land
      rows.sort((a, b) => Math.abs(a[1] - 14) - Math.abs(b[1] - 14)); const [q, r] = rows[0 + (window.__skip || 0)]; ZRender.centerOn(q, r, true);
      return new Promise(res => setTimeout(() => { const p = ZRender.hexToClient(q, r); res({ x: p.x, y: p.y, q, r }); }, 350));
    }, { kind, t });
  }
  await openMenu(); await tap('Build'); await screen('build');
  await tap('Habitats'); await screen('build-habs');
  const habsBefore = await S(() => ZT.S.items.filter(i => i.k === 'hab').length);
  await tap('Rainforest', { wait: 700 });
  check(await ev(() => ZRender.placing() && ZT.stack().length === 0), 'picking a habitat closes the menu and starts placement');
  await shot('placing-hab');
  let h = await freeHex('hab', 'jungle'); await page.touchscreen.tap(h.x, h.y); await sleep(300);
  await page.tap('#placement-bar .zr-place'); await sleep(500);
  check(await S(() => ZT.S.items.filter(i => i.k === 'hab').length) === habsBefore + 1, 'habitat built through placement');
  await shot('built-hab');

  await openMenu(); await tap('Build'); await tap('Facilities'); await screen('build-facs');
  const facBefore = await S(() => ZT.S.items.filter(i => i.k === 'fac').length);
  await tap('Garden Bench', { wait: 700 });
  for (let i = 0; i < 2; i++) { h = await freeHex('fac', 'bench'); await page.touchscreen.tap(h.x, h.y); await sleep(250); await page.tap('#placement-bar .zr-place'); await sleep(450); }
  check(await S(() => ZT.S.items.filter(i => i.k === 'fac').length) === facBefore + 2 && await ev(() => ZRender.placing()), 'two benches built in repeat mode and placement stays on');
  const lbl = await ev(() => document.querySelector('#placement-bar .zr-cancel').textContent.trim()); console.log('  third button after a placement says: ' + lbl);
  await page.tap('#placement-bar .zr-cancel'); await sleep(500);
  if (/Done/i.test(lbl)) check((await stack()) === '' && await ev(() => ZT.running()), 'Done returns to the floor with time running'); else check((await stack()) === 'menu>build', 'Cancel returns to Build (renderer still says Cancel)');
  await openMenu(); await tap('Build'); await tap('Facilities'); await tap('Garden Bench', { wait: 700 });
  await page.tap('#placement-bar .zr-cancel'); await sleep(500);
  check((await stack()) === 'menu>build', 'Cancel before placing anything returns to the Build screen (' + await stack() + ')');
  await tap('Move'); await screen('build-move');
  const benchPos = () => ev(() => JSON.stringify(ZT.S.items.filter(i => i.t === 'bench').map(i => [i.id, i.q, i.r]))); const bp0 = await benchPos();
  await tap('Garden Bench', { wait: 700 }); h = await freeHex('fac', 'bench');
  await page.touchscreen.tap(h.x, h.y); await sleep(250); await page.tap('#placement-bar .zr-place'); await sleep(500);
  check(await benchPos() !== bp0, 'moved a facility by placement');
  await openMenu(); await tap('Build'); await tap('Remove'); await screen('build-remove');
  const nItems = await S(() => ZT.S.items.length);
  await tap('Garden Bench'); await screen('remove-confirm', false); await tap('Remove', { nth: 0, wait: 500 });
  check(await S(() => ZT.S.items.length) === nItems - 1, 'removed a facility after a confirm');
  await tap('Back');
  await tap('Upgrade'); await screen('build-upgrade');
  await tap('Savanna'); await tap('Upgrade', { wait: 500 });
  check(await S(() => ZT.S.items.find(i => i.t === 'savanna').lvl) >= 2, 'upgraded a habitat');
  await back(); await tap('Buy land'); await screen('build-land');
  const rows0 = await S(() => ZT.S.rows); await tap('Buy', { wait: 500 });
  check(await S(() => ZT.S.rows) > rows0, 'bought land');

  // ---------------------------------------------------------------- animals
  await ev(() => ZT.popAll()); await openMenu(); await tap('Animals'); await screen('animals-zoo'); await chipCheck('animal list');
  await tap('Pen'); await screen('animals-pen-empty');
  await ev(() => { const a = ZT.S.animals.filter(x => x.sp === 'zebra' && !ZE.busyAnimals(ZT.S)[x.id]); ZT.S.animals.filter(x => x.sp === 'zebra').forEach(x => { x.hab = null; }); }); await ev(() => ZCore.rerender()); await sleep(300);
  await screen('animals-pen');
  const penBefore = await S(() => ZE.holding(ZT.S).length);
  await tap('House', { nth: 1 }); // first is House all when two or more
  check(await S(() => ZE.holding(ZT.S).length) === penBefore - 1, 'housed one animal from the pen with one tap');
  await tap('House', { nth: 0, wait: 400 });
  check(await S(() => ZE.holding(ZT.S).length) === 0, 'the pen is empty after housing both with one tap each');
  await ev(() => { ZT.S.projects.length = 0; ZCore.rerender(); }); await tap('Zoo'); await tap(await ev(() => ZT.S.animals.find(a => a.hab != null && !ZE.busyAnimals(ZT.S)[a.id]).name));
  await screen('animal-detail');
  await tap('Choose habitat'); await screen('animal-hab'); await back();
  await back();
  await tap('Market'); await screen('animals-market');
  await ev(() => { ZE.debug.caller(ZT.S, 'trader'); ZT.S.reports.length = 0; }); await ev(() => ZCore.rerender()); await sleep(300); await screen('animals-market-2');
  await tap('Mystery crate'); await screen('crate');
  const aN = await S(() => ZT.S.animals.length);
  await tap('Open', { wait: 500 }); await shot('crate-rarity'); await sleep(900); await shot('crate-animal'); await dismiss();
  check(await S(() => ZT.S.animals.length) === aN + 1, 'opened the mystery crate: one more animal');
  await ev(() => { if (ZT.stack().length && ZT.stack().slice(-1)[0] !== 'animals') ZT.popAll(); });
  if (!(await stack()).includes('animals')) { await openMenu(); await tap('Animals'); }
  await tap('Market'); const offerNames = await ev(() => ZT.S.offers.list.map(x => ZE.animalLabel(x.a)));
  await tap(offerNames[0]); await screen('offer');
  const aN2 = await S(() => ZT.S.animals.length); await tap('Buy', { wait: 500 });
  check(await S(() => ZT.S.animals.length) === aN2 + 1, 'bought an offered animal');
  await tap('Zoo'); await tap('Meerkat').catch(() => 0);
  await ev(() => ZT.popAll()); await openMenu(); await tap('Animals');
  const sellable = await ev(() => ZT.S.animals.filter(a => !ZE.busyAnimals(ZT.S)[a.id] && a.hab != null).pop().name); const nA = await S(() => ZT.S.animals.length);
  await tap(sellable); await tap('Sell'); await screen('sell-confirm', false); await tap('Sell', { nth: 1, wait: 500 }).catch(async () => tap('Sell', { wait: 500 }));
  check(await S(() => ZT.S.animals.length) === nA - 1, 'sold an animal after a confirm');

  // ---------------------------------------------------------------- staff: train, job, let go, headhunter
  await ev(() => { ZT.popAll(); ZT.S.projects.length = 0; }); await openMenu(); await tap('Staff');
  const tr0 = await ev(() => { const s = ZT.S.staff.find(x => !ZE.busyStaff(ZT.S)[x.id]); return { id: s.id, name: s.name, sum: s.care + s.sci + s.exp + s.charm }; });
  await tap(tr0.name); await screen('staff-detail');
  await tap('Train'); await screen('staff-train');
  await tap('Animal Handling', { wait: 500 }); await shot('train-result');
  check(await ev(o => { const s = ZE.staffer(ZT.S, o.id); return s.care + s.sci + s.exp + s.charm > o.sum; }, tr0), 'training raised a stat and showed the result');
  await dismiss();
  await ev(() => { const s = ZT.S.staff.find(x => !ZE.busyStaff(ZT.S)[x.id]); s.lvl = 9; ZE.refresh(ZT.S); }); await ev(() => ZCore.rerender()); await sleep(200);
  await tap('Change job'); await screen('staff-job');
  await tap('Guide'); await screen('job-confirm', false); await tap('Change', { wait: 500 });
  check(await ev(() => ZT.S.staff.some(s => s.role === 'guide')), 'changed a job after a confirm');
  await ev(() => ZT.popAll()); await openMenu(); await tap('Staff');
  await ev(() => { ZE.debug.caller(ZT.S, 'headhunter'); ZT.S.reports.length = 0; }); await ev(() => ZCore.rerender()); await sleep(300);
  const sc = await S(() => ZT.S.staff.length); await screen('staff-headhunter');
  await ev(() => { ZT.S.money = 500000; });
  const cap = await S(() => ZE.staffCap(ZT.S));
  if (sc < cap) { await tap('Hire', { nth: 0 }); check(await S(() => ZT.S.staff.length) === sc + 1, 'headhunter offer taken'); } else console.log('  (staff room full; headhunter hire skipped)');
  await ev(() => { ZT.S.rep = 40000; ZE.refresh(ZT.S); }); await ev(() => ZCore.rerender());
  const hired = await ev(() => { const s = ZT.S.staff.find(x => !ZE.busyStaff(ZT.S)[x.id] && x.role !== 'keeper'); return s && s.name; });
  const sN = await S(() => ZT.S.staff.length); await tap(hired); await tap('Let go'); await tap('Let go', { wait: 500 });
  check(await S(() => ZT.S.staff.length) === sN - 1, 'let someone go after a confirm');

  // ---------------------------------------------------------------- info boxes
  await ev(() => { const S = ZT.S; ['zebra', 'lion', 'giraffe', 'okapi', 'panda', 'dolphin', 'cheetah'].forEach((id, i) => { S.book[id] = { variant: i % 3 === 0, bred: i % 2 === 0, best: 30 + i * 5, at: 1 }; });
    S.combos.picnic = true; S.knownCombos.trail = true; S.aff['feeding:savanna'] = 1; ZE.refresh(S); });
  await ev(() => ZT.popAll()); await openMenu(); await tap('Info'); await screen('info');
  await tap('Book'); await screen('book'); await tap('Zebra'); await screen('species'); await back();
  check(await ev(() => !document.querySelector('.layer:not([hidden]) .pbody').textContent.includes('Lost Valley') && !document.querySelector('.layer:not([hidden]) .pbody').textContent.includes('Misty')), 'secret regions are hidden in the book until found');
  await ev(() => { ZT.S.regions.paleo = true; ZCore.rerender(); }); await sleep(200); await screen('book-paleo', false);
  check(await ev(() => document.querySelector('.layer:not([hidden]) .pbody').textContent.includes('Lost Valley')), 'a found secret region shows in the book');
  await ev(() => { ZT.S.regions.paleo = false; });
  await back(); await tap('Combos'); await screen('combos'); await back();
  await tap('Fits'); await screen('fits'); await back();
  await tap('Rumors'); await screen('rumors'); await back();
  await tap('Ranks'); await screen('ranks'); await back();
  await tap('Years'); await screen('years-empty'); await back();
  await tap('Awards'); await screen('awards'); await back();
  await tap('Log'); await screen('log'); check((await stack()).endsWith('info>log') || (await stack()).includes('log'), 'Log opens the game log screen (' + await stack() + ')'); await back();

  // ---------------------------------------------------------------- system
  await ev(() => ZT.popAll()); await openMenu(); await tap('System'); await screen('system');
  await tap('Save now', { wait: 300 }); check(await ev(() => !!localStorage.getItem('wildside-zoo-v3-slot1')), 'Save now wrote the save');
  await tap('2x'); check(await ev(() => ZCore.speed === 2), 'speed changed to 2x'); await tap('1x'); check(await ev(() => ZCore.speed === 1), 'speed back to 1x');
  const z0 = await ev(() => ZRender.getZoom()); await tap('Far'); check(await ev(() => ZRender.getZoom()) === 0, 'zoom changed'); await tap('Close');
  await tap('How to play'); await screen('how');
  const lg = await ev(() => { const names = [...Object.values(ZD.ASTAT), ...Object.values(ZD.SKILL)].map(x => x.name), L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), t = L.querySelector('.mn-legend').textContent; return { missing: names.filter(n => !t.includes(n)), icons: L.querySelectorAll('.mn-legend .sym').length }; });
  check(lg.missing.length === 0 && lg.icons >= 20, 'the symbol legend lists every stat and skill (' + lg.icons + ' symbols' + (lg.missing.length ? ', missing ' + lg.missing : '') + ')'); await back();
  await tap('Replay tutorial', { wait: 700 }); check(await ev(() => !!(ZT.S.ui && ZT.S.ui.tutorial && ZT.S.ui.tutorial.on)) && await ev(() => ZT.stack().length === 0), 'Replay tutorial restarts the tutorial and closes the menu'); await ev(() => { ZT.S.ui.tutorial.on = false; });






  // ---------------------------------------------------------------- late game: everything unlocked, long lists
  await ev(() => { const S = ZT.S; S.money = 5e7; S.rp = 9000; S.rep = 60000; S.rows = 20; ZD.BIOME_ORDER.forEach(b => { S.regions[b] = true; }); ZE.researchList(S).forEach(r => { if (r.id.indexOf('region:') !== 0) S.research[r.id] = true; });
    ZD.SPECIES_LIST.forEach((s, i) => { S.book[s.id] = { variant: i % 5 === 0, bred: i % 3 === 0, best: 20 + (i * 7) % 70, at: 1 }; });
    for (let i = 0; i < 40; i++) { const sp = ZD.SPECIES_LIST[i * 3 % 68]; S.animals.push({ id: 9000 + i, sp: sp.id, name: 'Test' + i, sex: i % 2 ? 'F' : 'M', charm: 20 + i, vigor: 30 + i, wit: 10 + i, variant: i % 7 === 0, gen: 1, born: null, hab: null, rest: 0, sick: 0 }); }
    ZE.refresh(S); });
  await openMenu(); await tap('Animals'); await tap('Pen'); await screen('late-pen');
  await ev(() => { const b = document.querySelector('.layer:not([hidden]) .pbody'); b.scrollTop = 400; }); await shot('late-pen-scrolled');
  await back(); await tap('Info'); await tap('Book'); await screen('late-book');
  await ev(() => { document.querySelector('.layer:not([hidden]) .pbody').scrollTop = 700; }); await shot('late-book-scrolled'); await back();
  await tap('Fits'); await screen('late-fits'); await back(); await tap('Combos'); await screen('late-combos'); await back(); await back();
  await tap('Research'); await tap('Know-how'); await screen('late-research'); await back(); await back();
  await tap('Build'); await tap('Habitats'); await screen('late-habs'); await back(); await tap('Facilities'); await screen('late-facs');
  await ev(() => { document.querySelector('.layer:not([hidden]) .pbody').scrollTop = 500; }); await shot('late-facs-scrolled'); await back(); await tap('Buy land'); await screen('late-land'); await back(); await back();
  await tap('Projects'); await screen('late-projects'); await tap('Expedition'); await screen('late-exp-region');
  await ev(() => ZT.popAll());
  // a year passes: reports are skipped, then the history shows
  await ev(() => { ZT.tick(48); });
  await openMenu(); await tap('Info'); await tap('Years'); await screen('years'); await back(); await tap('Ranks'); await screen('ranks-year'); await back(); await tap('Awards'); await screen('awards-late');

  check(consoleErrors.length === 0, 'no console errors' + (consoleErrors.length ? ': ' + consoleErrors.slice(0, 4).join(' || ') : ''));
  const ze = await ev(() => ZT.errors.slice());
  check(ze.length === 0, 'no captured game errors' + (ze.length ? ': ' + ze.slice(0, 4).join(' || ') : ''));
  check(small.length === 0, 'no tappable thing under 44 px' + (small.length ? ': ' + small.slice(0, 8).join(' || ') : ''));
  check(overflow.length === 0, 'no sideways overflow, Back always visible' + (overflow.length ? ': ' + overflow.slice(0, 6).join(' || ') : ''));
  await browser.close();
}

(async () => {
  const which = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit'];
  for (const n of which) { try { await run(n); } catch (e) { failures++; console.log('  FAIL ' + n + ' crashed: ' + e.message.split('\n').slice(0, 3).join(' / ')); } }
  console.log(failures ? failures + ' FAILURES' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})();
