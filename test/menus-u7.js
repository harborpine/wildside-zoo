/* Menus, Update 7: Edit mode, the Send out page, the one-screen event setup, the best crown, gold alert frames (no red boxes), challenges.
   Headless only.  Usage: node test/menus-u7.js [chromium|webkit ...]   (default: both). Shots: test/shots/menus-u7-*.png */
const path = require('path'), fs = require('fs'), pw = require('./pw.js');
const BASE = 'file:///' + path.resolve(__dirname, '..').replace(/\\/g, '/') + '/index.html';
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0; const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };
const PHONE = [393, 852, '&standalone=1&inset=34&insett=62'], SMALL = [375, 667, ''];

async function run(name) {
  console.log('== ' + name); const tag = name === 'chromium' ? '' : '-' + name;
  const browser = await pw[name].launch(), errs = [];
  async function mk(size, query) {
    const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Not allowed|Access-Control-Allow-Origin/.test(m.text())) errs.push(m.text()); });
    await page.goto(BASE + (query || '') + (size[2] ? ((query || '').includes('?') ? size[2] : '?' + size[2].slice(1)) : '')); await page.waitForFunction(() => window.ZT && window.ZMenus, null, { timeout: 8000 }); await sleep(500);
    await page.evaluate(() => { ZCore.WEEK_MS[1] = 1e9; ZCore.WEEK_MS[2] = 1e9; });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const shot = n => page.screenshot({ path: path.join(SHOTS, 'menus-u7-' + n + tag + '.png') });
    const stack = () => ev(() => ZT.stack().join('>'));
    const tapAt = async (q, wait) => { if (!q) throw new Error('nothing to tap'); await page.touchscreen.tap(q.x, q.y); await sleep(wait || 420); };
    const pos = (sel, nth) => ev(({ sel, nth }) => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop() || document, e = [...(sel.startsWith('#') ? document : L).querySelectorAll(sel)][nth || 0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, { sel, nth });
    const tapSel = async (sel, nth, wait) => { const q = await pos(sel, nth); if (!q) throw new Error('no ' + sel + ' [' + await stack() + ']'); await tapAt(q, wait); };
    const tap = async (text, wait) => { const q = await ev(text => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(); if (!L) return null; const all = [...L.querySelectorAll('button, .row.tappable, .tab')].filter(b => b.getBoundingClientRect().width > 0), t = b => b.textContent.trim(); const m = all.find(b => t(b).startsWith(text)) || all.find(b => t(b).includes(text) || (b.getAttribute('aria-label') || '').includes(text)); if (!m) return null; m.scrollIntoView({ block: 'center' }); const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, text); if (!q) throw new Error('no "' + text + '" [' + await stack() + ']'); await sleep(60); await tapAt(q, wait); };
    // the open screen: does its body scroll, are Back and every button inside the visible screen (above the bottom inset), is anything tappable under 44 px
    const fit = () => ev(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), b = L.querySelector('.pbody'), back = L.querySelector('.back'), inset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0, lim = innerHeight - inset + 0.5;
      const out = [], small = []; L.querySelectorAll('button, .tab').forEach(x => { const r = x.getBoundingClientRect(); if (!r.width) return; if (r.bottom > lim || r.top < 0 || r.right > innerWidth + 0.5 || r.left < -0.5) out.push((x.textContent || x.className).trim().slice(0, 14)); if (r.width < 43.5 || r.height < 43.5) small.push((x.textContent || x.className).trim().slice(0, 14) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
      return { over: b.scrollHeight - b.clientHeight, overX: b.scrollWidth - b.clientWidth, back: !!back, out, small }; });
    const freeHex = (kind, t) => ev(({ kind, t }) => {
      const S = ZT.S, rows = []; for (let r = 0; r < ZD.GRID_H; r++) for (let c = 0; c < ZD.GRID_W; c++) { const [q, rr] = ZE.fromOffset(c, r); if (ZE.canPlace(S, kind, t, q, rr, 0)) rows.push([q, rr]); }
      rows.sort((a, b) => Math.abs(a[1] - 14) - Math.abs(b[1] - 14)); const [q, r] = rows[0]; ZRender.centerOn(q, r, true);
      return new Promise(res => setTimeout(() => { const p = ZRender.hexToClient(q, r); res({ x: p.x, y: p.y, q, r }); }, 400));
    }, { kind, t });
    const bar = () => ev(() => { const b = document.getElementById('edit-bar'); if (!b) return null; const r = b.getBoundingClientRect(), cs = getComputedStyle(b), strip = b.querySelector('.mn-es'), fw = document.getElementById('floor-wrap').getBoundingClientRect();
      const btns = [...b.querySelectorAll('button')].map(x => x.getBoundingClientRect());
      return { shown: !b.hidden && r.height > 0, inFloor: b.parentNode.id === 'floor-wrap', top: Math.round(r.top), bottom: Math.round(r.bottom), floorBottom: Math.round(fw.bottom), h: Math.round(r.height), bg: cs.backgroundColor, opacity: cs.opacity,
        tabs: [...b.querySelectorAll('.mn-et:not(.done)')].map(x => x.dataset.grp), on: (b.querySelector('.mn-et.on') || { dataset: {} }).dataset.grp, cards: [...b.querySelectorAll('.mn-ec')].map(x => x.dataset.key + (x.classList.contains('off') ? '!' : '')),
        small: btns.filter(q => q.width < 43.5 || q.height < 43.5).length, below: btns.filter(q => q.bottom > innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0) + 0.5).length,
        vScroll: strip ? strip.scrollHeight - strip.clientHeight : 0, hScroll: strip ? strip.scrollWidth - strip.clientWidth : 0, acts: [...b.querySelectorAll('.mn-ea, .mn-eact .mn-up')].map(x => x.getAttribute('aria-label')) }; });
    return { ctx, page, ev, shot, stack, tap, tapSel, tapAt, pos, fit, freeHex, bar };
  }
  const solid = c => /^rgb\(/.test(c) || /^rgba\([^)]*,\s*1\)$/.test(c);

  // ================================================================ 1. EDIT MODE
  {
    const T = await mk(PHONE, '?play=1'), { ev, shot, stack, tap, tapSel, tapAt, freeHex, bar, page } = T;
    await ev(() => { ZCore.onReport('*', (r, d) => d()); ZT.S.money = 60000; });
    await page.touchscreen.tap(196, 400); await sleep(500);
    const boxes = await ev(() => [...document.querySelectorAll('.layer:not([hidden]) .gbox')].map(b => b.textContent.trim()));
    check(boxes.some(b => b.startsWith('Build')) && !boxes.some(b => b.startsWith('Edit')), 'the main menu has Build and no Edit (' + boxes.join(' | ') + ')');
    check(await ev(() => { const g = [...document.querySelectorAll('.layer:not([hidden]) .gbox')].find(b => b.textContent.trim().startsWith('Build')), i = g.querySelector('img'); return !!i && i.src === ZSprites.iconUrl('edit', 6); }), 'the Build box carries the edit symbol');
    await tap('Build', 600);
    let b = await bar(); await shot('edit-bar');
    const hasEdit = await ev(() => !!(window.ZRender && ZRender.startEdit));
    console.log('  renderer Edit mode present: ' + hasEdit + '; groups ' + JSON.stringify(b && b.tabs) + '; cards ' + JSON.stringify(b && b.cards));
    check((await stack()) === '' && b && b.shown && b.inFloor && await ev(() => ZMenus.editing()), 'Edit closes the menu and shows #edit-bar inside #floor-wrap');
    check(b.bottom <= b.floorBottom + 1 && b.below === 0 && b.small === 0, 'the strip is docked at the bottom, every button is at least 44 px and above the home-indicator inset (' + JSON.stringify({ h: b.h, small: b.small, below: b.below }) + ')');
    check(solid(b.bg) && b.opacity === '1', 'the strip is a solid colour (' + b.bg + ')');
    check(b.vScroll <= 1, 'nothing in the strip scrolls up and down');
    check(b.tabs.includes('hab') && b.tabs.includes('shop') && b.tabs.includes('fun') && b.cards.includes('hab:savanna'), 'symbol tabs for the groups; the habitat group lists the Savanna habitat');
    check(await ev(() => [...document.querySelectorAll('#edit-bar .mn-et:not(.done)')].every(x => x.querySelector('img') && !x.textContent.trim())), 'group tabs are symbols with no words');
    if (hasEdit) check(await ev(() => ZRender.editing() && !ZT.running()), 'the renderer is in Edit mode and the clock is paused');
    // add: a bench from the Fun group, placed on a legal spot
    await tapSel('#edit-bar .mn-et[data-grp="fun"]'); b = await bar(); check(b.on === 'fun' && b.cards.includes('fac:bench'), 'tapping a group tab swaps the strip (' + b.cards.join(',') + ')');
    const n0 = await ev(() => ZT.S.items.length);
    await tapSel('#edit-bar .mn-ec[data-key="fac:bench"]', 0, 700);
    b = await bar(); check(await ev(() => ZRender.placing()) && !b.shown, 'tapping a thing starts placement and the strip gives way to Place / Rotate / Cancel'); await shot('edit-placing');
    let h = await freeHex('fac', 'bench'); await tapAt(h, 300); await page.tap('#placement-bar .zr-place'); await sleep(500);
    check(await ev(() => ZT.S.items.length) === n0 + 1, 'the bench was built on a legal spot');
    await page.tap('#placement-bar .zr-cancel'); await sleep(700);
    b = await bar(); check(b.shown && await ev(() => ZMenus.editing() && !ZRender.placing()), 'after placing, Edit mode is still on and the strip is back');
    // too dear: greyed, a tap explains and starts nothing
    await ev(() => { ZT.S.money = 100; }); await sleep(500); b = await bar();
    check(b.cards.includes('fac:bench!'), 'with too little money the thing is greyed'); await tapSel('#edit-bar .mn-ec[data-key="fac:bench"]', 0, 400);
    check(!(await ev(() => ZRender.placing())), 'a greyed thing does not start placement');
    { const tp = await ev(() => { const t = document.querySelector('#toasts .toast'), b = document.getElementById('edit-bar').getBoundingClientRect(), r = t && t.getBoundingClientRect(); return t ? { text: t.textContent, bottom: Math.round(r.bottom), top: Math.round(r.top), barTop: Math.round(b.top) } : null; }); await shot('edit-toast');
      check(!!tp && /Need/.test(tp.text) && tp.bottom <= tp.barTop && tp.top > 0, 'the note saying why sits above the whole strip, not on its tabs (' + JSON.stringify(tp) + ')'); } await ev(() => { ZT.S.money = 60000; }); await sleep(500);
    // pick the bench on the map (or, before the renderer lands, from the Placed tab), then Move
    const benchId = await ev(() => ZT.S.items.filter(i => i.t === 'bench').pop().id);
    async function pick(id) {
      if (hasEdit) { const p = await ev(id => { const it = ZE.item(ZT.S, id); ZRender.centerOn(it.q, it.r, true); return new Promise(res => setTimeout(() => { const c = ZRender.hexToClient(it.q, it.r); res({ x: c.x, y: c.y }); }, 400)); }, id); await tapAt(p, 500); }
      else { await tapSel('#edit-bar .mn-et[data-grp="own"]'); await tapSel('#edit-bar .mn-ec[data-key="own:' + id + '"]', 0, 500); }
    }
    await pick(benchId); b = await bar(); await shot('edit-picked');
    check(b.shown && b.acts.includes('Move') && b.acts.includes('Sell') && !b.acts.some(a => /^Upgrade/.test(a)) && b.small === 0, 'picking a facility shows Move and Sell as big buttons (' + b.acts.join(', ') + ')');
    const p0 = await ev(id => { const i = ZE.item(ZT.S, id); return i.q + ',' + i.r; }, benchId);
    await tapSel('#edit-bar .mn-ea.move', 0, 700); check(await ev(() => ZRender.placing()), 'Move starts placement for that thing');
    h = await freeHex('fac', 'bench'); await tapAt(h, 300); await page.tap('#placement-bar .zr-place'); await sleep(700);
    check(await ev(id => { const i = ZE.item(ZT.S, id); return i.q + ',' + i.r; }, benchId) !== p0 && await ev(() => ZMenus.editing()), 'the bench moved and Edit mode is still on');
    // Sell asks once, pays back
    if (!(await bar()).acts.includes('Sell')) await pick(benchId);
    const m0 = await ev(() => ZT.S.money), n1 = await ev(() => ZT.S.items.length);
    await tapSel('#edit-bar .mn-ea.sell', 0, 500); check((await stack()) === 'confirm' && await ev(() => ZT.S.items.length) === n1, 'Sell asks once before it happens'); await shot('edit-sell-confirm');
    await tap('Sell', 600); check(await ev(() => ZT.S.items.length) === n1 - 1 && await ev(() => ZT.S.money) === m0 + 300, 'Sell removes the bench and pays back half ($300)');
    b = await bar(); check(b.shown && b.cards.length > 0, 'after selling, the strip of things to add is back');
    // a habitat also offers Upgrade
    const habId = await ev(() => ZT.S.items.find(i => i.k === 'hab').id), lvl0 = await ev(() => ZT.S.items.find(i => i.k === 'hab').lvl);
    await pick(habId); b = await bar(); await shot('edit-picked-hab');
    check(b.acts.some(a => /^Upgrade/.test(a)) && b.acts.includes('Move') && b.acts.includes('Sell'), 'picking a habitat shows Move, Upgrade and Sell (' + b.acts.join(', ') + ')');
    await tapSel('#edit-bar .mn-eact .mn-up', 0, 700); check(await ev(() => ZT.S.items.find(i => i.k === 'hab').lvl) === lvl0 + 1, 'Upgrade works from the strip');
    for (let i = 0; i < 3 && (await stack()) !== ''; i++) { await tap('Not now', 500).catch(() => ev(() => ZT.popAll())); }
    await tapSel('#edit-bar .mn-ea.back', 0, 400); b = await bar(); check(b.cards.length > 0 && b.acts.length === 0, 'the back arrow returns to the things to add');
    // sideways scrolling only, with a long list
    await ev(() => { const S = ZT.S; S.money = 5e7; S.rep = 60000; ZD.BIOME_ORDER.forEach(x => { S.regions[x] = true; }); ZE.researchList(S).forEach(r => { S.research[r.id] = true; }); ZE.refresh(S); }); await sleep(600);
    await tapSel('#edit-bar .mn-et[data-grp="hab"]'); b = await bar(); await shot('edit-late');
    check(b.hScroll > 0 && b.vScroll <= 1 && b.small === 0, 'a long list scrolls sideways only (' + b.cards.length + ' things, ' + b.hScroll + ' px sideways, ' + b.vScroll + ' px up and down)');
    // Done leaves
    await tapSel('#edit-bar .mn-et.done', 0, 600); b = await bar();
    check(!b.shown && !(await ev(() => ZMenus.editing())) && (!hasEdit || !(await ev(() => ZRender.editing()))) && await ev(() => ZT.running()), 'Done leaves Edit mode and time runs again');
    await page.touchscreen.tap(196, 300); await sleep(500); check((await stack()) === 'menu', 'after Done a tap on the zoo opens the menu again');
    await ev(() => ZT.popAll()); await sleep(2600); await ev(() => ZCore.ui.toast('Test note')); await sleep(250);
    check(await ev(() => { const ts = document.getElementById('toasts'), r = ts.querySelector('.toast').getBoundingClientRect(); return !ts.style.bottom && r.bottom > innerHeight - 200; }), 'outside Edit mode pop-up notes are back in their usual place');
    check(await ev(() => !ZMenus.screens.habitats && !ZMenus.screens.facilities && !ZMenus.screens.move && !ZMenus.screens.remove), 'the old Build lists and the Move screen are gone');
    await T.ctx.close();
  }

  // ================================================================ 2. SEND OUT page: stars 1 to 5, fits with no scrolling
  for (const size of [PHONE, SMALL]) {
    const T = await mk(size, '?play=1'), { ev, shot, stack, tap, tapSel, fit } = T, lab = size[0] + 'x' + size[1];
    await ev(() => { ZCore.onReport('*', (r, d) => d()); ZT.S.money = 100566; ZMenus.screens.expedition(); }); await sleep(450);
    if ((await stack()).endsWith('exp-region')) await tap('Savanna');
    await tap('Next'); check((await stack()).endsWith('exp-confirm'), lab + ': team, then the Send out page (' + await stack() + ')');
    const read = () => ev(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), S = ZT.S, team = [S.staff.find(x => !ZE.busyStaff(S)[x.id]).id];
      const xs = [...L.querySelectorAll('.mn-xs')].map(x => ({ star: +x.dataset.star, on: x.classList.contains('on'), off: x.classList.contains('off'), lock: !!x.querySelector('.lk img[alt="Locked"]'), lockTxt: (x.querySelector('.lk') || { textContent: '' }).textContent.trim(), stars: x.querySelectorAll('.n img').length }));
      return { xs, cost: (L.querySelector('.mn-xinfo .xc') || {}).textContent, weeks: (L.querySelector('.mn-xinfo .xw') || {}).textContent, odds: [...L.querySelectorAll('.mn-xodds .mn-odd')].map(o => o.querySelectorAll('.star').length + ':' + o.querySelector('.p').textContent), send: (L.querySelector('.mn-send') || {}).textContent, text: L.querySelector('.pbody').textContent }; });
    const want = () => ev(() => { const S = ZT.S; return ZE.expStars(S, 'savanna', [S.staff.slice().sort((a, b) => b.exp - a.exp).find(x => !ZE.busyStaff(S)[x.id]).id]); });
    let r = await read(), w = await want(), f = await fit(); await shot('sendout-' + lab);
    check(r.xs.length === 5 && r.xs.map(x => x.star).join() === '1,2,3,4,5', lab + ': five star buttons, 1 to 5');
    check(r.xs.every((x, i) => x.off === !w[i].unlocked && (w[i].unlocked || (x.lock && x.lockTxt === String(w[i].rank)))), lab + ': locked stars are greyed with a padlock and the rank number that opens them (' + r.xs.map(x => x.star + (x.off ? ' locked ' + x.lockTxt : '')).join(', ') + ')');
    check(!/Lean|Standard|Lavish/.test(r.text), lab + ': Lean / Standard / Lavish are gone');
    const sel = r.xs.find(x => x.on), ws = w.find(x => x.star === (sel || {}).star);
    const oddsOf = e => Object.keys(e.odds).map(Number).sort((a, b) => a - b).filter(k => e.odds[k] >= 0.005).map(k => k + ':' + Math.round(e.odds[k] * 100) + '%').join();
    check(!!sel && ws && r.cost.trim() === ws.cost.toLocaleString('en-US') && r.weeks.trim() === String(ws.weeks) && r.odds.join() === oddsOf(ws), lab + ': cost, weeks and odds are those of the chosen star (' + sel.star + ' star: ' + r.cost.trim() + ', ' + r.weeks.trim() + ' wk, ' + r.odds.join(' ') + ')');
    check(f.over <= 0 && f.overX <= 0 && f.back && f.out.length === 0 && f.small.length === 0, lab + ': the whole page, with Send and Back, fits with no scrolling and nothing under 44 px (' + JSON.stringify(f) + ')');
    await tapSel('.mn-xs[data-star="1"]'); r = await read(); const w1 = w.find(x => x.star === 1);
    check(r.xs.find(x => x.on).star === 1 && r.cost.trim() === w1.cost.toLocaleString('en-US') && r.odds.join() === oddsOf(w1), lab + ': picking 1 star shows its cost and odds (' + r.cost.trim() + ', ' + r.odds.join(' ') + ')');
    await tapSel('.mn-xs[data-star="5"]'); r = await read(); check(r.xs.find(x => x.on).star === 1, lab + ': a locked star cannot be picked');
    // everything unlocked: still fits
    await ev(() => { ZT.S.rep = 900000; ZT.S.money = 900000; ZE.refresh(ZT.S); ZCore.rerender(); }); await sleep(400); await tapSel('.mn-xs[data-star="4"]'); r = await read(); f = await fit(); await shot('sendout-all-' + lab);
    check(r.xs.every(x => !x.off) && r.xs.find(x => x.on).star === 4 && r.odds.length === 3 && f.over <= 0 && f.out.length === 0, lab + ': with all five unlocked a 4 star run shows three odds rows and still fits (' + r.odds.join(' ') + ')');
    await tap('Send', 700);
    check(await ev(() => { const p = ZT.S.projects.find(x => x.type === 'expedition'); return !!p && p.star === 4 && p.region === 'savanna'; }) && (await stack()) === '', lab + ': Send starts a 4 star Savanna run and closes the menu');
    await T.ctx.close();
  }

  // ================================================================ 3. EVENT: host and theme on ONE screen
  for (const size of [PHONE, SMALL]) {
    const T = await mk(size, '?play=1'), { ev, shot, stack, tap, tapSel, fit, page } = T, lab = size[0] + 'x' + size[1];
    await ev(() => { ZCore.onReport('*', (r, d) => d()); const S = ZT.S; S.money = 500000; S.items.forEach(i => { if (i.k === 'hab') i.eventAt = -99; }); ZD.THEME_ORDER.forEach(x => { S.research['theme:' + x] = true; }); Object.keys(ZD.BIOMES).forEach(b => { S.regions[b] = true; });
      const base = S.staff[0]; while (S.staff.length < 9) S.staff.push(Object.assign({}, base, { id: 7000 + S.staff.length, name: 'Extra' + S.staff.length, charm: 10 + S.staff.length * 3 })); ZE.refresh(S); });
    await page.touchscreen.tap(size[0] / 2, size[1] / 2); await sleep(500); await tap('Projects'); await tap('Event');
    check((await stack()) === 'menu>projects>event-setup', lab + ': with one habitat, Event opens the one set-up screen directly (' + await stack() + ')');
    const read = () => ev(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(); return { hosts: [...L.querySelectorAll('.mn-pk.host')].map(x => +x.dataset.host), themes: [...L.querySelectorAll('.mn-pk.theme')].map(x => x.dataset.theme), host: +((L.querySelector('.mn-pk.host.on') || { dataset: {} }).dataset.host), theme: (L.querySelector('.mn-pk.theme.on') || { dataset: {} }).dataset.theme, start: !!L.querySelector('.mn-send') }; });
    let r = await read(), f = await fit(); await shot('event-' + lab);
    check(r.hosts.length === 8 && r.themes.length === 12 && r.start, lab + ': hosts (' + r.hosts.length + '), themes (' + r.themes.length + ') and Start are all on this one screen');
    check(f.over <= 0 && f.overX <= 0 && f.out.length === 0 && f.small.length === 0, lab + ': it fits with no scrolling, even with every theme and eight free people (' + JSON.stringify(f) + ')');
    check(r.host === await ev(() => { const S = ZT.S; return S.staff.filter(x => !ZE.busyStaff(S)[x.id]).sort((a, b) => b.charm - a.charm)[0].id; }) && !!r.theme, lab + ': the best host and a theme are already picked');
    const wantHost = r.hosts[3], wantTheme = r.themes[5];
    await tapSel('.mn-pk.host[data-host="' + wantHost + '"]'); await tapSel('.mn-pk.theme[data-theme="' + wantTheme + '"]'); r = await read();
    check(r.host === wantHost && r.theme === wantTheme && (await stack()) === 'menu>projects>event-setup', lab + ': picking another host and theme stays on the same screen');
    await tap('Start', 700);
    check(await ev(({ wantHost, wantTheme }) => { const p = ZT.S.projects.find(x => x.type === 'event'); return !!p && p.theme === wantTheme && p.staff[0] === wantHost; }, { wantHost, wantTheme }) && (await stack()) === '', lab + ': Start holds that event with that host');
    // two habitats: the habitat list comes first, then the same one screen
    await ev(() => { const S = ZT.S; let q; for (let rr = 19; rr >= 0 && !q; rr--) for (let c = 0; c < ZD.GRID_W && !q; c++) { const p = ZE.fromOffset(c, rr); if (ZE.canPlace(S, 'hab', 'jungle', p[0], p[1], 0)) q = p; } ZCore.act('build', 'hab', 'jungle', q[0], q[1], 0); ZT.popAll(); ZMenus.screens.event(); }); await sleep(500);
    check((await stack()) === 'event-habs', lab + ': with two habitats the habitat list comes first');
    await T.ctx.close();
  }

  // with only the starting themes the boxes keep a sensible height (they used to stretch to fill the screen)
  for (const size of [PHONE, SMALL]) {
    const T = await mk(size, '?play=1'), { ev, shot, stack, fit } = T, lab = size[0] + 'x' + size[1];
    await ev(() => { ZCore.onReport('*', (r, d) => d()); ZT.S.items.forEach(i => { if (i.k === 'hab') i.eventAt = -99; }); ZMenus.screens.event(); }); await sleep(500);
    const th = await ev(() => [...document.querySelectorAll('.layer:not([hidden]) .mn-pk.theme')].map(x => Math.round(x.getBoundingClientRect().height))), f = await fit(); await shot('event-few-' + lab);
    check((await stack()) === 'event-setup' && th.length >= 2 && th.length <= 4 && th.every(h => h >= 44 && h <= 60) && f.over <= 0 && f.out.length === 0 && await ev(() => document.querySelectorAll('.layer:not([hidden]) .mn-pk.host').length >= 1 && !!document.querySelector('.layer:not([hidden]) .mn-send')), lab + ': with ' + th.length + ' themes each theme box is ' + th.join('/') + ' px tall (44 to 60), host, theme and Start on one screen, no scrolling');
    await T.ctx.close();
  }

  // ================================================================ 4. BEST crown, 5. gold alert frames and no red boxes
  {
    const T = await mk(PHONE, '?play=1'), { ev, shot, stack, tap, page, fit } = T;
    await ev(() => { ZCore.onReport('*', (r, d) => d()); const S = ZT.S, hab = S.items.find(i => i.k === 'hab'); hab.lvl = 5; S.animals.length = 0;
      const mk = (id, sp, sex, v) => S.animals.push({ id, sp, name: 'A' + id, sex, charm: v, vigor: v, wit: v, variant: false, gen: 1, born: null, hab: hab.id, rest: 0, sick: 0 });
      mk(9001, 'zebra', 'M', 30); mk(9002, 'zebra', 'M', 55); mk(9003, 'zebra', 'M', 40); mk(9004, 'zebra', 'F', 70); mk(9005, 'warthog', 'F', 20); mk(9006, 'warthog', 'F', 25); ZE.refresh(S); ZMenus.screens.animals(); }); await sleep(500);
    const cr = await ev(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(); return [...L.querySelectorAll('.mn-at')].map(t => ({ id: +t.dataset.aid, crown: !!t.querySelector('.mn-best'), want: ZE.bestOf(ZT.S, +t.dataset.aid) })); }); await shot('best-crown');
    check(cr.length === 6 && cr.every(x => x.crown === x.want), 'every animal tile shows the crown exactly when ZE.bestOf says so');
    check(cr.filter(x => x.crown).map(x => x.id).sort().join() === '9002,9006', 'the best male zebra and the best female warthog wear the crown; the only female zebra does not (' + cr.filter(x => x.crown).map(x => x.id).join() + ')');
    check(await ev(() => { const i = document.querySelector('.layer:not([hidden]) .mn-best'); return i.src === ZSprites.iconUrl('best', 2) && i.getBoundingClientRect().height >= 12; }), 'the crown is the best symbol');
    // alerts
    await ev(() => { const S = ZT.S; ZT.popAll(); S.rp = 5000; S.candidates = [Object.assign({}, S.staff[0], { id: 8800, name: 'Cand One' })]; S.animals[0].hab = null; ZE.debug.happening(S, 'donor'); S.reports.length = 0; ZE.refresh(S); });
    await page.touchscreen.tap(196, 400); await sleep(500); await shot('alerts-menu');
    const walk = [];
    const scan = async label => { walk.push(await ev(label => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(); const al = [...L.querySelectorAll('.alert')].map(a => { const cs = getComputedStyle(a), r = a.getBoundingClientRect(); return { t: a.textContent.trim().slice(0, 16), inside: parseFloat(cs.outlineOffset) <= -parseFloat(cs.outlineWidth) + 0.01, w: parseFloat(cs.outlineWidth), h: r.height }; }); return { label, badges: document.querySelectorAll('.badge').length, al }; }, label)); };
    await scan('menu');
    const m = walk[0]; check(['Projects', 'Animals', 'Staff', 'Research'].every(n => m.al.some(a => a.t.startsWith(n))) && !m.al.some(a => /^(Edit|Info|System)/.test(a.t)), 'main menu: Projects, Animals, Staff and Research carry the gold frame, the others do not (' + m.al.map(a => a.t).join(', ') + ')');
    check(m.al.every(a => a.inside && a.w >= 3), 'the frame is drawn inside the button itself (nothing sticks out or overlaps a neighbour)');
    await tap('Research'); await scan('research'); await shot('alerts-research'); const rs = walk[1], f = await fit();
    check(rs.al.length >= 1 && rs.al.every(a => a.inside) && f.over <= 1, 'Research: groups with something affordable carry the gold frame, nothing overlaps (' + rs.al.map(a => a.t).join(', ') + ')');
    await tap('Back'); await tap('Staff'); await scan('staff'); await tap('Back'); await tap('Projects'); await scan('projects'); await tap('Back'); await tap('Animals'); await scan('animals'); await tap('Back');
    await tap('System'); await tap('How to play'); await scan('how'); await shot('legend');
    check(walk.every(x => x.badges === 0), 'no .badge element anywhere: menu, Research, Staff, Projects, Animals, How to play (' + walk.map(x => x.label + ' ' + x.badges).join(', ') + ')');
    check(walk[5].al.length === 1, 'the legend shows a sample of the gold frame for "Needs you"');
    check(walk[2].al.some(a => a.t.startsWith('Who turned up')), 'Staff: the "Who turned up" button carries the gold frame');
    await T.ctx.close();
  }

  // ================================================================ 6. CHALLENGES
  for (const size of [PHONE, SMALL, [320, 568, '']]) {
    const T = await mk(size, ''), { ev, shot, stack, tap, tapSel, fit, page } = T, lab = size[0] + 'x' + size[1];
    check((await stack()) === 'title', lab + ': starts on the title');
    const tt = await ev(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(), b = L.querySelector('.pbody'), c = L.querySelector('.mn-chal'), r = c && c.getBoundingClientRect(), bb = b.getBoundingClientRect(); return { has: !!c, sym: !!c && c.querySelector('img').src === ZSprites.iconUrl('level', 3), h: r ? r.height : 0, below: r ? r.bottom > bb.bottom + 1 : true, over: b.scrollHeight - b.clientHeight, slots: L.querySelectorAll('.mn-slot:not(.mn-chal)').length }; }); await shot('title-' + lab);
    check(tt.has && tt.sym && tt.slots === 3 && tt.h >= 44 && !tt.below && tt.over <= 1, lab + ': the title has a Challenges entry with the level symbol under the three slots, and does not scroll (' + JSON.stringify(tt) + ')');
    await tapSel('.mn-chal'); check((await stack()) === 'title>challenges', lab + ': it opens the level-select screen');
    const read = () => ev(() => { const L = [...document.querySelectorAll('.layer:not([hidden])')].pop(); return { cards: [...L.querySelectorAll('.mn-lvc')].map(c => { const r = c.getBoundingClientRect(); return { id: c.dataset.level, n: c.querySelector('.num').textContent, off: c.classList.contains('off'), on: c.classList.contains('on'), top: Math.round(r.top), w: Math.round(r.width), goalSym: (c.querySelector('.goal > img') || {}).src, goal: c.querySelector('.gv').textContent + (c.querySelector('.gv img') ? '*' : ''), rs: c.querySelectorAll('.rs .ln').length, rsSyms: [...c.querySelectorAll('.rs .ln')].every(l => !!l.querySelector('img')), on3: [...c.querySelectorAll('.mn-s3 img')].filter(i => i.src === ZSprites.iconUrl('star-on', 2)).length, off3: [...c.querySelectorAll('.mn-s3 img')].filter(i => i.src === ZSprites.iconUrl('star-off', 2)).length, lock: !!c.querySelector('.mn-s3.lk') }; }), cont: !!L.querySelector('.mn-chcont'), start: (L.querySelector('.mn-chstart') || {}).textContent }; });
    let r = await read(), f = await fit(); await shot('levels-' + lab);
    const LV = await ev(() => ZD.LEVELS.map(l => ({ id: l.id, n: l.n, icon: ZSprites.iconUrl(ZD.GOAL_ICON[l.goal.kind], 3) })));
    check(r.cards.length === 5 && new Set(r.cards.map(c => c.top)).size === 1 && r.cards.map(c => c.n).join('') === '12345', lab + ': the five levels stand in one line, numbered 1 to 5');
    check(r.cards.every((c, i) => c.id === LV[i].id && c.goalSym === LV[i].icon && c.goal.length > 0 && c.rs >= 3 && c.rsSyms), lab + ': each level shows its goal as symbol plus number and its limits as symbols (' + r.cards.map(c => c.goal).join(' | ') + ')');
    check(!r.cards[0].off && r.cards[0].off3 === 3 && r.cards.slice(1).every(c => c.off && c.lock), lab + ': level 1 is open with three unlit stars; levels 2 to 5 are locked and greyed');
    check(!r.cont, lab + ': no Continue button while no run is in progress');
    check(f.over <= 0 && f.overX <= 0 && f.out.length === 0 && f.small.length === 0, lab + ': the level-select screen fits with no scrolling, nothing under 44 px (' + JSON.stringify(f) + ')');
    await tapSel('.mn-lvc[data-level="savanna"]'); r = await read(); check(r.cards[0].on && !r.cards[1].on, lab + ': a locked level cannot be picked');
    if (size !== PHONE) { await T.ctx.close(); continue; }
    // start level 1
    await tap('Start', 900);
    check(await ev(() => ZCore.inChallenge() && ZCore.challengeId === 'small' && !!ZT.S.ch) && (await stack()) === '', 'Start begins level 1 (ZCore.startChallenge) and play starts');
    await sleep(700); check(await ev(() => !document.querySelector('.mn-coach') && !(ZT.S.ui && ZT.S.ui.tutorial && ZT.S.ui.tutorial.on)), 'no tutorial inside a challenge');
    await ev(() => { ZCore.onReport('*', (rr, d) => d()); ZT.tick(3); }); await sleep(300);
    await page.touchscreen.tap(196, 400); await sleep(500);
    check(await ev(() => !document.querySelector('.layer:not([hidden]) .mn-glow')), 'no first-move highlight inside a challenge'); await shot('ch-menu');
    await tap('Info'); const info = await ev(() => [...document.querySelectorAll('.layer:not([hidden]) .gbox')].map(b => b.textContent.trim().replace(/[0-9/ ].*$/, '')));
    check(!info.some(x => /Years|Awards|Ranks|Rumors/.test(x)) && info.includes('Book'), 'Info hides the long-term screens (Years, Awards, Ranks, Rumors) in a challenge (' + info.join(', ') + ')'); await tap('Back');
    await tap('System'); const sys = await ev(() => [...document.querySelectorAll('.layer:not([hidden]) .btn')].map(b => b.textContent.trim())); await shot('ch-system'); f = await fit();
    check(sys.some(x => x.startsWith('Restart level')) && !sys.some(x => /Replay tutorial|New zoo/.test(x)) && f.over <= 1, 'System offers Restart level, and neither Replay tutorial nor New zoo (' + sys.join(', ') + ')');
    await tap('Restart level'); check((await stack()).endsWith('confirm') && await ev(() => ZT.S.week === 3), 'Restart level asks once'); await tap('No');
    const slotsBefore = await ev(() => JSON.stringify(ZCore.slots()));
    await tap('Title screen', 900);
    check((await stack()) === 'title' && !(await ev(() => ZCore.inChallenge())) && await ev(() => { const s = ZCore.challengeSaved(); return !!s && s.levelId === 'small' && s.week === 3; }) && await ev(() => JSON.stringify(ZCore.slots())) === slotsBefore, 'Title screen leaves the challenge (ZCore.leaveChallenge): the run is kept, the three zoo slots are untouched');
    await tapSel('.mn-chal'); r = await read(); await shot('levels-continue');
    check(r.cont, 'the level-select screen now has a Continue button'); f = await fit(); check(f.over <= 0 && f.out.length === 0, 'and still fits with no scrolling (' + JSON.stringify(f) + ')');
    await tap('Continue', 900); check(await ev(() => ZCore.inChallenge() && ZT.S.week === 3 && ZCore.challengeId === 'small'), 'Continue resumes the run at the same week');
    // restart for real
    await ev(() => ZMenus.screens.system()); await sleep(400); await tap('Restart level'); await tap('Restart', 900);
    check(await ev(() => ZCore.inChallenge() && ZT.S.week === 0 && ZCore.challengeId === 'small') && (await stack()) === '', 'Restart level starts the same level again from week 0');
    // what a level forbids is hidden or greyed in Edit mode
    await ev(() => { ZMenus.edit(); }); await sleep(600); const cards1 = await ev(() => [...document.querySelectorAll('#edit-bar .mn-ec')].map(x => x.dataset.key)); await shot('ch-edit');
    check(cards1.includes('hab:savanna') && !cards1.includes('land'), 'in a challenge the map never grows: no land to buy in Edit (' + cards1.join(',') + ')');
    await ev(() => { ZMenus.stopEdit(); ZT.leaveChallenge(); }); await sleep(600);
    // stars earned unlock the next level
    await ev(() => { localStorage.setItem('wildside-zoo-v3-challenge-stars', JSON.stringify({ small: 2, savanna: 0 })); ZCore.toTitle(); }); await sleep(600);
    await tapSel('.mn-chal'); r = await read(); await shot('levels-stars');
    check(r.cards[0].on3 === 2 && r.cards[0].off3 === 1 && !r.cards[1].off && r.cards[2].off, 'two stars on level 1 show as two lit stars and unlock level 2 only');
    // stars on a later level keep it open even when the level before has none (stars stored out of order); the level after it opens too
    await ev(() => { localStorage.setItem('wildside-zoo-v3-challenge-stars', JSON.stringify({ small: 1, broke: 3 })); ZCore.toTitle(); }); await sleep(600); await tapSel('.mn-chal');
    { const r2 = await read(); await shot('levels-gap'); const st2 = r2.cards.map(c => c.n + (c.off ? 'L' : 'O')).join(' ');
      check(st2 === '1O 2O 3O 4O 5L' && r2.cards[2].on3 === 3 && r2.cards[1].off3 === 3, 'unlock rule: 1 open; 2 open (1 has stars); 3 open (its own 3 stars, though 2 has none); 4 open (3 has stars); 5 locked (' + st2 + ')'); }
    await ev(() => { localStorage.setItem('wildside-zoo-v3-challenge-stars', JSON.stringify({ small: 2, savanna: 0 })); ZCore.toTitle(); }); await sleep(600); await tapSel('.mn-chal');
    await tapSel('.mn-lvc[data-level="savanna"]'); await tap('Start', 500); if ((await stack()).endsWith('confirm')) { check(true, 'starting another level while one is in progress asks first'); await tap('Start', 900); }
    check(await ev(() => ZCore.inChallenge() && ZCore.challengeId === 'savanna'), 'level 2 starts');
    await ev(() => { const S = ZT.S; ZD.BIOME_ORDER.forEach(b => { S.regions[b] = true; }); S.money = 500000; ZMenus.edit(); }); await sleep(600);
    const cards2 = await ev(() => [...document.querySelectorAll('#edit-bar .mn-ec')].map(x => x.dataset.key));
    check(cards2.filter(k => k.startsWith('hab:')).join() === 'hab:savanna', 'Savanna Only: Edit hides every habitat the level forbids (' + cards2.join(',') + ')');
    await ev(() => { ZMenus.stopEdit(); ZMenus.screens.research(); }); await sleep(400); await tap('Regions').catch(() => 0);
    const reg = await ev(() => [...document.querySelectorAll('.layer:not([hidden]) .row')].map(x => x.textContent.trim().slice(0, 14)));
    check((await stack()) === 'research' || reg.length <= 1, 'Savanna Only: Research hides the regions the level forbids (' + (await stack()) + ': ' + reg.join(', ') + ')');
    await ev(() => { ZT.popAll(); ZT.startChallenge('broke'); }); await sleep(600); await ev(() => ZMenus.screens.projects()); await sleep(400);
    check(await ev(() => { const g = [...document.querySelectorAll('.layer:not([hidden]) .gbox')].find(x => x.textContent.trim().startsWith('Expedition')); return g.classList.contains('disabled') && !!g.querySelector('.sub img[alt="Locked"]'); }), 'Shoestring: Expedition is greyed with a padlock'); await shot('ch-projects');
    await sleep(2600); await tap('Expedition', 300); const why = await ev(() => (document.querySelector('#toasts .toast') || { textContent: '' }).textContent); await shot('ch-projects-why');
    check(/Not in this challenge/.test(why) && (await stack()) === 'projects' && await ev(() => !ZT.S.projects.length), 'tapping the padlocked Expedition box says why ("' + why + '") and starts nothing');
    // the hook Moments uses for its Levels button: leaves the run (kept) and opens the level list on the title
    const okL = await ev(() => ZMenus.openLevels()); await sleep(700);
    check(okL === true && (await stack()) === 'title>challenges' && !(await ev(() => ZCore.inChallenge())) && await ev(() => { const c = ZCore.challengeSaved(); return !!c && c.levelId === 'broke'; }), 'ZMenus.openLevels() from inside a challenge: the run is kept and the level list opens on the title (' + await stack() + ')');
    await ev(() => ZMenus.openLevels()); await sleep(400); check((await stack()) === 'title>challenges', 'calling it again does not stack a second list');
    await ev(() => { ZCore.pop(); }); await sleep(300); await ev(() => ZMenus.openLevels()); await sleep(500); check((await stack()) === 'title>challenges', 'from the bare title it opens the level list (' + await stack() + ')');
    await ev(() => { ZT.popAll(); ZT.startChallenge('tiny'); }); await sleep(600);
    await ev(() => { const S = ZT.S; S.money = 500000; for (let n = 0; n < 2; n++) { let q; for (let rr = ZD.GRID_H - 1; rr >= 0 && !q; rr--) for (let c = 0; c < ZD.GRID_W && !q; c++) { const p = ZE.fromOffset(c, rr); if (ZE.canPlace(S, 'hab', 'savanna', p[0], p[1], 0)) q = p; } if (q) ZCore.act('build', 'hab', 'savanna', q[0], q[1], 0); } ZT.popAll(); ZMenus.edit(); }); await sleep(900);
    const tiny = await ev(() => ({ habs: ZT.S.items.filter(i => i.k === 'hab').length, card: (document.querySelector('#edit-bar .mn-ec[data-key="hab:savanna"]') || { className: 'missing' }).className }));
    check(tiny.habs === 2 && /off/.test(tiny.card), 'Two Pens: with two habitats built, more habitats are greyed (' + JSON.stringify(tiny) + ')');
    await T.ctx.close();
  }
  check(errs.length === 0, 'no errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
  await browser.close();
}

(async () => {
  const which = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit'];
  for (const n of which) { try { await run(n); } catch (e) { failures++; console.log('  FAIL ' + n + ' crashed: ' + e.message.split('\n').slice(0, 3).join(' / ')); } }
  console.log(failures ? failures + ' FAILURES' : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})();
