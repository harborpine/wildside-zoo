/* Tester, Update 7: new playthroughs by real touch (headless only, through test/pw.js).
   Usage: node test/tester-u7.js [chromium|webkit] [section ...]
   Sections (default: all, one after another):
     edit      Edit mode on the map: add a habitat and see its border walkway, a habitat or bench touching it is allowed (Update 8), move, upgrade, sell (asks once), time paused while editing
     exp       an expedition at every star level (1 and 2 as a new zoo, then 3 to 5 after the rank is raised by the test hook) and a locked star
     where     the where list shows who lives in each habitat; the best-of-kind crown
     colours   success green, failure red on result cards
     speed     speed 2 moves the visitors about twice as fast
     audit     the owner's rules on the new static screens at 393x852 (installed app) and 375x667
     level:small | level:savanna | level:broke | level:breed | level:tiny     one challenge level, start to result card
   Everything that ACTS on the game is a touch. page.evaluate only reads state (to decide what to tap and to assert), sets a scene, or moves the clock
   (ZCore.WEEK_MS is shortened so a 120-week level does not take 10 real minutes; ZT.tick only lets weeks pass). Each use of a hook is marked "setup". */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
const ALL = ['edit', 'exp', 'where', 'colours', 'speed', 'audit', 'level:small', 'level:savanna', 'level:broke', 'level:breed', 'level:tiny'];
const want = process.argv.slice(3).length ? process.argv.slice(3) : ALL;
const W = 393, H = 852, Q = 'standalone=1&inset=34&insett=62';
const ACT = +(process.env.U7_ACT || 4);            // the touch player looks at the zoo every ACT weeks
const FAST = +(process.env.U7_WEEK_MS || 700);   // real ms per game week at speed 2 while a level is played (the game's own figure is 5000)
const all = [], results = [];
const say = (...a) => console.log(...a);
const GREEN = 'rgb(46, 125, 50)', RED = 'rgb(192, 57, 43)';

async function mk(tag, query, size) {
  size = size || [W, H];
  const T = await L.launch(engine, { width: size[0], height: size[1] }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-u7-' + tag });
  await T.goto(query); await sleep(500);
  const page = T.page; T.sec = tag; T.n = 0; T.pass = 0; T.fail = 0; T.E = L.edit(T); T.cx = Math.round(size[0] / 2); T.cy = Math.round(size[1] * 0.55);
  T.snap = async nm => { T.n++; return T.shot(String(T.n).padStart(2, '0') + '-' + String(nm).replace(/[^a-z0-9-]+/gi, '_')); };
  T.check = (ok, key, msg, shot) => { if (ok) { T.pass++; say('  PASS ' + msg); } else { T.fail++; say('  FAIL ' + msg); T.find('u7:' + key, msg, shot); } return !!ok; };
  T.toFloor = () => L.toFloor(T, T.cx, T.cy);
  T.menu = async () => { await T.toFloor(); for (let i = 0; i < 3; i++) { await T.tapXY(T.cx, T.cy - i * 60, 450); const s = await T.state(); if (s.stack[0] === 'menu') return true; if (s.stack.length) return false; } return false; };
  T.look = async (nm, o) => { const d = await describe(T); say('   [' + nm + '] ' + (d.id || 'floor') + ' :: ' + (d.text || '').replace(/\s*\|\s*/g, ' | ').slice(0, 200)); const f = await T.snap(nm); await L.invariants(T, nm); const p = await L.audit(T, nm, o); if (p.length) say('     audit: ' + p.join(' || ')); return Object.assign(d, { shot: f }); };
  T.toast = () => page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' / '));
  T.top = sel => '#screens .layer:not([hidden]):last-of-type ' + sel;
  T.tapTop = async (sel, wait, nth) => { await L.settled(T); return T.tapTopNow(sel, wait, nth); };
  T.tapTopNow = (sel, wait, nth) => page.evaluate(({ sel, nth }) => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); if (!l) return null; const e = [...l.querySelectorAll(sel)].filter(x => x.getBoundingClientRect().width > 0)[nth || 0]; if (!e) return null; e.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, { sel, nth }).then(async b => { if (!b) return false; await T.tapXY(b.x, b.y, wait || 400); return true; });
  T.done = async () => { const e = await page.evaluate(() => (window.ZT ? ZT.errors.slice(0, 3) : [])).catch(() => []); if (e.length) T.find('u7:errors', 'game errors: ' + e.join(' | ')); if (T.consoleErrors.length) T.find('u7:console', 'console errors: ' + T.consoleErrors.slice(0, 3).join(' | '));
    all.push(...T.findings.map(f => ({ section: tag, ...f }))); results.push({ section: tag, pass: T.pass, fail: T.fail, findings: T.findings.length }); say('== ' + tag + ': ' + T.pass + ' passed, ' + T.fail + ' failed, ' + T.findings.length + ' findings, ' + T.taps + ' taps'); await T.browser.close(); };
  return T;
}
const quiet = T => T.page.evaluate(() => { ZT.skipReports = true; ZT.S.reports.length = 0; ZT.popAll(); });               // setup: no pop-ups in sections that are not about pop-ups
const money = T => T.page.evaluate(() => Math.round(ZT.S.money));
async function through(T, startRe) { for (let i = 0; i < 7; i++) { const has = await T.locate(startRe, { sel: 'button, .btn' }); if (has && !/Back|Play/.test(has.text)) return true; const nx = await T.locate(/^Next/, { sel: 'button, .btn' }); if (nx) { await T.tapText(/^Next/, { sel: 'button, .btn' }); continue; } if (!(await T.tapTop('.row.tappable:not(.disabled)', 400))) return false; } return false; }

/* ============================================================ EDIT MODE */
async function secEdit() {
  say('== EDIT MODE (' + engine + ')'); const T = await mk('edit', '?play=1&' + Q); const { page, E, check } = T;
  await quiet(T); await page.evaluate(() => { ZT.S.money = 80000; ZCore.WEEK_MS[1] = 700; ZCore.WEEK_MS[2] = 350; });   // setup: money, and short weeks so "paused" can be seen
  const week = () => page.evaluate(() => ZT.S.week);
  const w0 = await week(); await sleep(1700); const wA = await week(); check(wA > w0, 'time-floor', 'on the floor time runs (week ' + w0 + ' -> ' + wA + ' in 1.7 s with 0.7 s weeks)');
  check(await T.menu(), 'menu', 'a tap on the zoo opens the menu'); const boxes = await page.evaluate(() => [...document.querySelectorAll('#screens .layer:not([hidden]) .gbox')].map(b => b.textContent.trim().replace(/\s+/g, ' ')));
  check(boxes.some(b => /^Edit/.test(b)) && !boxes.some(b => /^Build/.test(b)), 'menu-edit', 'the main menu has Edit and no Build (' + boxes.join(' | ') + ')');
  await T.tapText('Edit', { wait: 700 }); let b = await E.bar(); let s = await T.state();
  check(b && b.shown && b.inFloor && !s.stack.length && s.editing, 'bar', 'Edit closes the menu and shows the strip #edit-bar on the map');
  await T.look('edit-strip');
  check(b.small.length === 0 && b.below.length === 0 && b.bottom <= b.floorBottom + 1, 'bar-fit', 'every button in the strip is at least 44 px and above the home-indicator inset (' + JSON.stringify({ h: b.h, small: b.small, below: b.below }) + ')');
  check(b.vScroll <= 1, 'bar-vscroll', 'the strip does not scroll up and down (' + b.vScroll + ' px)'); check(b.tabWords.length === 0, 'bar-symbols', 'the group tabs are symbols, no words (' + b.tabs.join(', ') + ')');
  check(/^rgb\(/.test(b.bg) && b.opacity === '1', 'bar-solid', 'the strip is a solid colour (' + b.bg + ', opacity ' + b.opacity + ')');
  const w1 = await week(); await sleep(2300); const w2 = await week(); s = await T.state(); check(w2 === w1 && !s.running, 'paused', 'time is paused while editing (week ' + w1 + ' -> ' + w2 + ' in 2.3 s)');
  // each group tab by touch
  for (const g of b.tabs) { await L.tapSel(T, '#edit-bar .mn-et[data-grp="' + g + '"]', 350); const bb = await E.bar(); say('   group ' + g + ': ' + bb.cards.join(' ')); check(bb.on === g && bb.cards.length > 0 && bb.small.length === 0 && bb.vScroll <= 1, 'tab-' + g, 'tab "' + g + '" shows its things in one sideways row (' + bb.cards.length + ' cards, sideways ' + bb.hScroll + ' px, up-and-down ' + bb.vScroll + ' px)'); await T.look('edit-tab-' + g); }
  // ---- add a habitat, see its border walkway (Update 8: a strip inside the habitat's own hexes)
  const before = await page.evaluate(() => ({ n: ZT.S.items.length, strips: ZRender.debug().strips, hab: ZT.S.items.find(i => i.k === 'hab').id }));
  let ghost = null; const r = await E.add('hab:savanna', { before: async g => { ghost = g; await T.look('hab-ghost'); } });
  s = await T.state(); if (s.stack.length) { await T.look('after-hab-popup'); await T.tapText(/^(Not now|Move in)/, { sel: 'button, .btn', wait: 500 }); }
  check(r.ok, 'add-hab', 'a second Savanna habitat was added from the strip on a legal spot (' + JSON.stringify(ghost && { q: ghost.q, r: ghost.r, note: ghost.note }) + ')' + (r.ok ? '' : ': ' + r.why));
  check(ghost && ghost.ring === 0, 'ghost-no-ring', 'the ghost shows no Update 7 ring hexes (' + (ghost && ghost.ring) + ')');
  const nh = await page.evaluate(hab0 => { const S = ZT.S, h = S.items.filter(i => i.k === 'hab' && i.id !== hab0).pop(); if (!h) return null; const d = ZRender.debug(); return { id: h.id, q: h.q, r: h.r, lvl: h.lvl, strips: d.strips, inFence: d.inFence, unreached: d.unreached.length, offPath: d.offPath, cost: ZE.habUpgradeCost(h, S) }; }, before.hab);
  say('   new habitat:', JSON.stringify(nh));
  check(nh && nh.strips > before.strips, 'strip', 'the new habitat has its border walkway (strip edges ' + before.strips + ' -> ' + (nh && nh.strips) + ')');
  check(nh && nh.inFence === 0 && nh.unreached === 0, 'strip-walk', 'nobody walks inside a fence and everything can be reached (' + JSON.stringify(nh && { inFence: nh.inFence, unreached: nh.unreached }) + ')');
  s = await T.state(); check(s.editing && (await E.bar()).shown, 'still-editing', 'after placing, Edit mode is still on and the strip is back'); await T.look('hab-added');
  // ---- a habitat or a bench right against it is allowed now (Update 8); nothing is built here, the ghost is only looked at
  let c = await E.card('hab:savanna'); check(c.found && c.placing, 'touch-start', 'tapping the Savanna card again starts another placement');
  let sp = await E.spot('hab', 'savanna', { near: [nh.q, nh.r] });
  if (check(!!sp, 'touch-spot', 'there is a legal spot next to the new habitat')) {
    await T.tapXY(sp.x, sp.y, 500); const g = await E.ghost(); const tl = await T.look('touch-allowed');
    const touches = await page.evaluate(([q, r, rot, id]) => { const S = ZT.S, mine = ZE.cellsOf('hab', 'savanna', q, r, rot); return ZE.cells(ZE.item(S, id)).some(c => mine.some(m => ZE.DIRS.some(d => m[0] + d[0] === c[0] && m[1] + d[1] === c[1]))); }, [g.q, g.r, (await page.evaluate(() => ZRender.debug().placement.rot)), nh.id]);
    say('   touching ghost:', JSON.stringify(g), 'touches the new habitat:', touches);
    check(g.ok && !/walkway/i.test(g.note), 'touch-allowed', 'a habitat right against another fits (note "' + g.note + '"' + (touches ? '' : ', nearest legal spot does not touch it') + ')', tl.shot);
  }
  await E.endPlacement();
  c = await E.card('fac:bench'); sp = c.placing ? await E.spot('fac', 'bench', { near: [nh.q, nh.r] }) : null;
  if (check(!!sp, 'benchnear-spot', 'a bench can be tried right beside the new habitat')) { await T.tapXY(sp.x, sp.y, 500); const g = await E.ghost(); const tl = await T.look('bench-beside');
    check(g.ok && !/walkway/i.test(g.note), 'bench-beside', 'a bench beside a habitat fits: "' + g.note + '"', tl.shot); }
  await E.endPlacement();
  // ---- pick the new habitat on the map: Move, Upgrade, Sell
  const picked = await E.pick(nh.id); b = await E.bar(); say('   picked:', picked, JSON.stringify(b.acts), '::', b.actText); const pl = await T.look('hab-picked');
  check(picked, 'pick', 'tapping the habitat on the map selects it (blinking outline, ZRender.selected)', pl.shot);
  check(b.acts.includes('Move') && b.acts.includes('Sell') && b.acts.some(a => /^Upgrade/.test(a)), 'pick-acts', 'a picked habitat offers Move, Upgrade and Sell (' + b.acts.join(', ') + ')');
  check(b.small.length === 0 && b.below.length === 0, 'pick-fit', 'those buttons are at least 44 px and above the bottom inset (' + JSON.stringify(b.small) + ')');
  // move
  await L.tapSel(T, '#edit-bar .mn-ea.move', 700); s = await T.state(); check(s.placing, 'move-start', 'Move starts placement for that habitat');
  let to = null; for (let k = 0; k < 8 && !to; k++) { const x = await E.spot('hab', 'savanna', { ignoreId: nh.id, near: [nh.q, nh.r], nth: k }); if (x && (x.q !== nh.q || x.r !== nh.r)) to = x; }
  if (to) { await T.tapXY(to.x, to.y, 500); await T.look('move-ghost'); await E.place(800); }
  const mv = await page.evaluate(id => { const S = ZT.S, h = ZE.item(S, id), d = ZRender.debug(); return { q: h.q, r: h.r, strips: d.strips, inFence: d.inFence, sel: ZRender.selected() }; }, nh.id); s = await T.state();
  check(to && mv.q === to.q && mv.r === to.r, 'move', 'the habitat moved to the tapped spot (' + nh.q + ',' + nh.r + ' -> ' + mv.q + ',' + mv.r + ')'); check(mv.strips === nh.strips && mv.inFence === 0, 'move-strip', 'its border walkway moved with it (strip edges ' + mv.strips + ', nobody inside a fence)');
  check(s.editing && !s.placing, 'move-edit', 'after the move Edit mode is still on'); await T.look('moved');
  // upgrade
  if (!(await E.bar()).acts.length) await E.pick(nh.id); const m0 = await money(T); await L.tapSel(T, '#edit-bar .mn-eact .mn-up', 700);
  for (let i = 0; i < 3 && (await T.state()).stack.length; i++) { await T.look('upgrade-popup'); if (!(await T.tapText(/^(Not now|Move in|Upgrade|Yes)/, { sel: 'button, .btn', wait: 500 }))) await T.tapText(/./, { sel: '.back' }); }
  const up = await page.evaluate(id => ({ lvl: ZE.item(ZT.S, id).lvl, money: Math.round(ZT.S.money) }), nh.id);
  check(up.lvl === nh.lvl + 1 && up.money === m0 - nh.cost, 'upgrade', 'Upgrade raises the habitat one level and charges its price (level ' + nh.lvl + ' -> ' + up.lvl + ', $' + m0 + ' -> $' + up.money + ', price $' + nh.cost + ')'); await T.look('upgraded');
  // sell: asks once; No keeps it; Sell pays back
  if (!(await E.bar()).acts.length) await E.pick(nh.id); b = await E.bar(); const n0 = await page.evaluate(() => ZT.S.items.length), ms0 = await money(T);
  await L.tapSel(T, '#edit-bar .mn-ea.sell', 500); s = await T.state(); const q1 = await T.look('sell-confirm');
  check(s.stack.join('>') === 'confirm' && (await page.evaluate(() => ZT.S.items.length)) === n0, 'sell-asks', 'Sell asks before it happens ("' + (q1.text || '').slice(0, 60) + '")', q1.shot);
  await T.tapText(/^No/, { sel: 'button, .btn', wait: 500 }); check((await page.evaluate(() => ZT.S.items.length)) === n0 && (await money(T)) === ms0 && !(await T.state()).stack.length, 'sell-no', 'answering No sells nothing');
  if (!(await E.bar()).acts.length) await E.pick(nh.id); await L.tapSel(T, '#edit-bar .mn-ea.sell', 500); const qt = (await describe(T)).text || ''; await T.tapText(/^Sell/, { sel: 'button, .btn', wait: 600 }); s = await T.state();
  const sold = await page.evaluate(() => ({ n: ZT.S.items.length, money: Math.round(ZT.S.money), strips: ZRender.debug().strips, sel: ZRender.selected() })); const said = +((qt.match(/\$([\d,]+)/) || [])[1] || '').replace(/,/g, '');
  check(sold.n === n0 - 1 && !s.stack.length, 'sell', 'answering Sell removes the habitat and asks nothing more (asked once)');
  check(sold.money > ms0 && sold.money - ms0 === said, 'sell-money', 'the money comes back: $' + ms0 + ' -> $' + sold.money + ' (+' + (sold.money - ms0) + '; the question said $' + said + ')');
  check(sold.strips === before.strips, 'sell-strip', 'its border walkway went with it (strip edges ' + sold.strips + ', as before it was built: ' + before.strips + ')'); await T.look('sold');
  // Done: time resumes
  const w3 = await week(); await E.done(); await sleep(1900); const w4 = await week(); s = await T.state();
  check(!s.editing && !s.editBar && s.running && w4 > w3, 'done', 'Done leaves Edit mode and time runs again (week ' + w3 + ' -> ' + w4 + ')'); check(w3 === w1, 'paused-all', 'no week passed during the whole edit (week ' + w1 + ' at the start, ' + w3 + ' at Done)');
  await L.invariants(T, 'after Done', { expectClosed: true }); await T.done();
}

/* ============================================================ EXPEDITION STAR LEVELS */
async function secExp() {
  say('== EXPEDITION STARS (' + engine + ')'); const T = await mk('exp', '?play=1&' + Q); const { page, check } = T;
  await page.evaluate(() => { ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 600000; ZT.S.money = 400000; ['caller', 'happening', 'vip', 'rankup', 'review', 'combo', 'yearlyplan', 'yearly', 'show'].forEach(t => ZCore.onReport(t, (r, d) => d())); });   // setup: frozen clock, money, only the expedition pop-ups
  let cardStar = null, cardCls = ''; const drain = L.makeDrain(T, { maxCrates: 0, shot: async id => { if (id !== 'mo-expedition') return; const x = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); const e = l.querySelector('.mo-xstar'); const p = l.querySelector('.panel'); return e ? { star: +e.dataset.star, lit: e.querySelectorAll('.star.on, .on').length, cls: p ? p.className : '' } : null; }); if (x) { cardStar = x.star; cardCls = x.cls; await T.snap('result-star' + x.star); } } });
  const openPage = async () => { if (!(await T.menu())) return false; await T.tapText('Projects'); await T.tapText('Expedition'); if (((await T.state()).stack.slice(-1)[0]) === 'exp-region') await T.tapText(/Savanna/, { sel: '.row, .gbox, button', wait: 400 }); await T.tapText(/^Next/, { sel: 'button, .btn', wait: 450 }); return (await T.state()).stack.slice(-1)[0] === 'exp-confirm'; };
  const read = () => page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(), S = ZT.S; const b = l.querySelector('.pbody');
    return { xs: [...l.querySelectorAll('.mn-xs')].map(x => ({ star: +x.dataset.star, on: x.classList.contains('on'), off: x.classList.contains('off'), h: Math.round(x.getBoundingClientRect().height), w: Math.round(x.getBoundingClientRect().width) })), cost: +((l.querySelector('.mn-xinfo .xc') || {}).textContent || '').replace(/[^\d]/g, ''), weeks: +((l.querySelector('.mn-xinfo .xw') || {}).textContent || '').replace(/[^\d]/g, ''), odds: [...l.querySelectorAll('.mn-xodds .mn-odd')].map(o => o.querySelectorAll('.star').length + ':' + o.querySelector('.p').textContent), text: l.innerText, over: b ? b.scrollHeight - b.clientHeight : 0, want: [1, 2, 3, 4, 5].map(n => ({ cost: ZE.expCost('savanna', n) })), unlocked: ZE.expStars(S, 'savanna', [S.staff[0].id]).map(x => x.unlocked), locks: ZE.expStars(S, 'savanna', [S.staff[0].id]).map(x => x.lock) }; });
  async function run(star) {
    if (!check(await openPage(), 'open-' + star, star + ' star: Projects > Expedition > team > Next reaches the Send out page')) { await T.toFloor(); return; }
    await T.tapTop('.mn-xs[data-star="' + star + '"]', 400); const r = await read(); const on = (r.xs.find(x => x.on) || {}).star; const lk = await T.look('sendout-star' + star);
    check(on === star, 'pick-' + star, star + ' star: tapping the star button selects it (selected ' + on + ')', lk.shot);
    check(r.cost === r.want[star - 1].cost && r.weeks > 0 && r.odds.length >= 2, 'info-' + star, star + ' star: the page shows its price $' + r.cost + ' (engine: $' + r.want[star - 1].cost + '), ' + r.weeks + ' weeks and its odds (' + r.odds.join(' ') + ')');
    check(r.over <= 0, 'fit-' + star, star + ' star: the Send out page does not scroll (' + r.over + ' px over)');
    const m0 = await money(T), n0 = await page.evaluate(() => ZT.S.projects.length); await T.tapText(/^Send/, { sel: 'button, .btn', wait: 700 });
    const p = await page.evaluate(() => { const p = ZT.S.projects.filter(x => x.type === 'expedition').pop(); return p ? { star: p.star, region: p.region, n: ZT.S.projects.length, stack: ZT.stack().join('>') } : null; }); const m1 = await money(T);
    check(p && p.star === star && p.n === n0 + 1 && m0 - m1 === r.cost && p.stack === '', 'send-' + star, star + ' star: Send starts a ' + star + ' star Savanna run, charges $' + (m0 - m1) + ' and closes the menu');
    cardStar = null; for (let w = 0; w < 16; w++) { await page.evaluate(() => ZT.tick(1)); await sleep(350); await drain(); if (!(await page.evaluate(() => ZT.S.projects.some(x => x.type === 'expedition')))) break; }   // setup: weeks pass; every pop-up is answered by touch
    await T.toFloor(); check(cardStar === star, 'card-' + star, star + ' star: the result card shows ' + star + ' lit stars under the region name (card said ' + cardStar + ')');
  }
  // a new zoo: 1 and 2 stars open, 3 to 5 locked
  await openPage(); let r = await read(); const first = await T.look('sendout-new-zoo');
  check(r.xs.length === 5 && r.xs.map(x => x.star).join('') === '12345', 'five', 'the Send out page has five star buttons, 1 to 5', first.shot);
  check(!/Lean|Standard|Lavish/.test(r.text), 'old-words', 'Lean / Standard / Lavish are gone');
  check(r.xs.every((x, i) => x.off === !r.unlocked[i]) && r.unlocked.join() === 'true,true,false,false,false', 'locks', 'a new zoo can run 1 and 2 stars; 3, 4 and 5 are greyed (' + r.xs.map(x => x.star + (x.off ? ' locked' : '')).join(', ') + ')');
  check(r.xs.every(x => x.h >= 44 && x.w >= 44), 'star-size', 'every star button is at least 44 px (' + r.xs.map(x => x.w + 'x' + x.h).join(' ') + ')');
  // the locked star: refused clearly
  const onBefore = (r.xs.find(x => x.on) || {}).star; await T.tapTop('.mn-xs[data-star="3"]', 350); const toast = await T.toast(); r = await read(); const lk = await T.look('sendout-locked-tap');
  check((r.xs.find(x => x.on) || {}).star === onBefore, 'locked-pick', 'tapping the locked 3 star button does not select it (still ' + onBefore + ')', lk.shot);
  check(/rank/i.test(toast), 'locked-reason', 'and it says why: "' + toast + '" (engine: "' + r.locks[2] + '")', lk.shot);
  const m0 = await money(T); await T.toFloor();
  for (const star of [1, 2]) await run(star);
  await page.evaluate(() => { ZT.S.rep = 900000; ZT.S.money = 900000; ZE.refresh(ZT.S); });   // setup: a top-rank zoo, so the higher stars open
  for (const star of [3, 4, 5]) await run(star);
  await L.invariants(T, 'exp end', { expectClosed: true }); await T.done();
}

/* ============================================================ WHERE LIST and BEST-OF-KIND CROWN */
async function secWhere() {
  say('== WHERE LIST and CROWN (' + engine + ')'); const T = await mk('where', '?play=1&' + Q); const { page, check } = T;
  // setup: two Savanna habitats with known animals, two in the pen
  const scene = await page.evaluate(() => { ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 600000; const S = ZT.S; S.money = 90000; let q; for (let rr = ZD.GRID_H - 1; rr >= 0 && !q; rr--) for (let c = 0; c < ZD.GRID_W && !q; c++) { const p = ZE.fromOffset(c, rr); if (ZE.canPlace(S, 'hab', 'savanna', p[0], p[1], 0)) q = p; } ZT.act('build', 'hab', 'savanna', q[0], q[1], 0); ZT.popAll(); S.reports.length = 0;
    const habs = S.items.filter(i => i.k === 'hab'); habs.forEach(h => { h.lvl = 3; }); S.animals.length = 0; let id = 9000;
    const mk = (sp, sex, v, hab) => S.animals.push({ id: ++id, sp, name: 'A' + id, sex, charm: v, vigor: v, wit: v, variant: false, gen: 1, born: null, hab, rest: 0, sick: 0 });
    mk('zebra', 'M', 30, habs[0].id); mk('zebra', 'M', 55, habs[0].id); mk('zebra', 'M', 40, habs[0].id); mk('zebra', 'F', 70, habs[0].id);   // three males: the 55 is best; one female: no crown
    mk('warthog', 'F', 20, habs[1].id); mk('warthog', 'F', 25, habs[1].id); mk('warthog', 'M', 44, habs[1].id);                              // two females: the 25 is best; one male: no crown
    mk('ostrich', 'M', 33, null); mk('ostrich', 'M', 21, null);                                                                                // pen: two males, the 33 is best
    ZE.refresh(S); return { habs: habs.map(h => h.id) }; });
  // ---- crown: Animals > Zoo tiles
  await T.menu(); await T.tapText('Animals'); const zl = await T.look('animals-zoo', { allowScroll: true });
  const expect = { 9002: true, 9006: true, 9008: true };   // by the owner's rule, worked out by hand above
  const tiles = await page.evaluate(() => [...document.querySelectorAll('#screens .layer:not([hidden]) .mn-at')].map(t => ({ id: +t.dataset.aid, crown: !!t.querySelector('.mn-best'), h: t.querySelector('.mn-best') ? Math.round(t.querySelector('.mn-best').getBoundingClientRect().height) : 0, eng: ZE.bestOf(ZT.S, +t.dataset.aid) })));
  say('   tiles:', JSON.stringify(tiles));
  check(tiles.length >= 7 && tiles.every(t => t.crown === !!expect[t.id]), 'crown-tiles', 'Animals > Zoo: the crown is on the best male zebra (of 3) and the best female warthog (of 2) only; the lone female zebra and lone male warthog have none (crowned: ' + tiles.filter(t => t.crown).map(t => t.id).join(', ') + ')', zl.shot);
  check(tiles.every(t => t.crown === t.eng), 'crown-engine', 'the tiles agree with ZE.bestOf for every animal'); check(tiles.filter(t => t.crown).every(t => t.h >= 12), 'crown-size', 'the crown is big enough to see (' + tiles.filter(t => t.crown).map(t => t.h + ' px').join(', ') + ')');
  await T.tapTop('.mn-at[data-aid="9002"]', 500); const a1 = await T.look('animal-best', { allowScroll: true }); check(await page.evaluate(() => !!document.querySelector('#screens .layer:not([hidden]):last-of-type .mn-best') || !![...document.querySelectorAll('#screens .layer:not([hidden])')].pop().querySelector('.mn-best')), 'crown-animal', 'the best zebra\'s own screen shows the crown', a1.shot); await T.tapText(/./, { sel: '.back' });
  await T.tapTop('.mn-at[data-aid="9004"]', 500); check(await page.evaluate(() => ![...document.querySelectorAll('#screens .layer:not([hidden])')].pop().querySelector('.mn-best')), 'crown-lone', 'the only female zebra\'s screen shows no crown'); await T.tapText(/./, { sel: '.back' });
  await T.tapText(/^Pen/); const pl = await T.look('animals-pen', { allowScroll: true }); const pen = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return { crowns: l.querySelectorAll('.mn-best').length, text: l.innerText.replace(/\s+/g, ' ').slice(0, 200) }; });
  check(pen.crowns === 1, 'crown-pen', 'the pen list shows exactly one crown for its two male ostriches (' + pen.crowns + ')', pl.shot);
  await T.toFloor();
  // ---- where list: buy from the trader by touch, Keep, then look at the rows
  await page.evaluate(() => { ZE.debug.caller(ZT.S, 'trader'); if (ZT.flush) ZT.flush(); });   // setup: the trader calls
  for (let i = 0; i < 12 && (await T.state()).stack.slice(-1)[0] !== 'mo-caller-trader'; i++) await sleep(300);
  await T.look('trader', { allowScroll: true }); const price = await page.evaluate(() => { const o = ZT.S.offers && ZT.S.offers.list && ZT.S.offers.list[0]; return o ? '$' + o.price.toLocaleString('en-US') : null; });
  check(!!price && !!(await T.tapText(price, { sel: 'button, .btn', wait: 700 })), 'trader-buy', 'the trader pop-up came and its first animal was bought by touch (' + price + ')');
  const isWhere = () => page.evaluate(() => [...[...document.querySelectorAll('#screens .layer:not([hidden])')].pop().querySelectorAll('.mo-row.tap')].some(r => /^Pen/.test(r.innerText.trim())));
  for (let i = 0; i < 12 && !(await isWhere()); i++) { if (!(await T.tapText(/^Keep/, { sel: 'button, .btn', wait: 600 }))) await sleep(400); }   // a bought animal goes straight to the where list
  const wl = await T.look('where-list');
  const rows = await page.evaluate(() => { const S = ZT.S, l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); const e = S.arrivals[S.arrivals.length - 1]; const ch = e ? ZE.arrivalChoices(S, e.a.id) : [];
    const dom = [...l.querySelectorAll('.mo-row')].map(r => { const line = r.querySelector('.mo-resl'); const more = line && line.querySelector('.mo-res.more'); const pics = line ? [...line.querySelectorAll('.mo-res:not(.more)')] : []; const rr = r.getBoundingClientRect(); return { text: r.innerText.replace(/\s+/g, ' ').slice(0, 40), n: line ? +line.dataset.n : 0, shown: pics.length, more: more ? +more.textContent.replace(/\D/g, '') : 0, sexMarks: pics.filter(p => p.querySelectorAll('img').length >= 2).length, crown: !!r.querySelector('.mn-best, .mo-best'), inRow: line ? line.getBoundingClientRect().bottom <= rr.bottom + 1 && line.getBoundingClientRect().right <= rr.right + 1 : true, h: Math.round(rr.height) }; });
    return { arrival: e && e.a.sp, want: ch.map(c => ({ hab: c.hab, n: (c.animals || []).length, sp: (c.animals || []).map(a => a.sp + a.sex).join(' ') })), dom }; });
  say('   where rows:', JSON.stringify(rows));
  check(rows.dom.length >= 3 && rows.dom.length === rows.want.length, 'where-rows', 'the where list has a row for each Savanna habitat and the pen (' + rows.dom.length + ' rows for a ' + rows.arrival + ')', wl.shot);
  check(rows.dom.every((d, i) => rows.want[i] && d.n === rows.want[i].n && d.shown + d.more === d.n), 'where-animals', 'every row shows the animals living there: ' + rows.dom.map((d, i) => d.shown + (d.more ? '+' + d.more : '') + ' of ' + (rows.want[i] || {}).n).join(', '), wl.shot);
  check(rows.dom.every(d => d.sexMarks === d.shown), 'where-sex', 'each little portrait carries its sex mark'); check(rows.dom.every(d => d.inRow), 'where-inrow', 'the portraits stay inside their row');
  check(rows.want.some(w => w.n === 4) && rows.want.some(w => w.n === 3) && rows.want.some(w => w.hab == null && w.n === 2), 'where-scene', 'that is the 4 zebras, the 3 warthogs and the 2 pen ostriches of the scene (' + rows.want.map(w => w.n).join(', ') + ')');
  const n0 = await page.evaluate(() => ZT.S.animals.length); await T.tapTop('.mo-row.tap', 600, 0); for (let i = 0; i < 5 && (await T.state()).stack.some(x => /^mo-/.test(x)); i++) { if (!(await T.tapText(/^(Continue|Done|Not now)/i, { wait: 500 }))) await T.tapXY(T.cx, T.cy, 600); }
  check((await page.evaluate(() => ZT.S.animals.length)) === n0 + 1, 'where-pick', 'tapping a row houses the animal there'); await T.toFloor(); await T.done();
}

/* ============================================================ GREEN and RED */
async function secColours() {
  say('== GREEN / RED (' + engine + ')'); const T = await mk('colours', '?play=1&' + Q); const { page, check } = T;
  await page.evaluate(() => { ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 600000; ZT.S.money = 600000; ZE.debug.alwaysChoices(true); ['caller', 'happening', 'vip', 'rankup', 'review', 'combo', 'yearlyplan', 'yearly', 'show'].forEach(t => ZCore.onReport(t, (r, d) => d())); });   // setup
  const readBar = () => page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); if (!l) return null; const p = l.querySelector('.panel'), t = l.querySelector('.ptitle'); if (!p || !t) return null; const cs = getComputedStyle(t); return { good: p.classList.contains('good'), bad: p.classList.contains('bad'), title: t.innerText.replace(/\s+/g, ' ').trim(), bg: cs.backgroundColor, color: cs.color, mark: !!t.querySelector('.mo-vmark.ok') ? 'ok' : !!t.querySelector('.mo-vmark.no') ? 'no' : '' }; });
  // the plain result card, both ways (opened directly: this is the card other screens call)
  for (const good of [true, false]) { await page.evaluate(g => ZMoments.result({ title: g ? 'It worked' : 'It failed', lines: ['A line'], good: g, chips: [] }), good); await sleep(600); const b = await readBar(); const lk = await T.look('result-' + (good ? 'good' : 'bad'));
    check(b && b.bg === (good ? GREEN : RED) && b.mark === (good ? 'ok' : 'no'), 'result-' + good, 'ZMoments.result({good:' + good + '}): the title bar is solid ' + (good ? 'green with a tick' : 'red with a cross') + ' (' + JSON.stringify(b) + ')', lk.shot); await page.evaluate(() => ZT.popAll()); await sleep(200); }
  // real outcomes: expeditions with every choice forced on, answered by touch; record every verdict bar seen
  const seen = []; const GOODW = /worked|Good call|New arrival|Expedition back|Trained|SUPER|Gold medal/i, BADW = /No luck|Setback|No baby|Nothing found|No medal|failed/i;
  const drain = L.makeDrain(T, { maxCrates: 0, shot: async id => { const b = await readBar(); if (!b) return; const k = id + '|' + b.title + '|' + b.bg; if (seen.some(x => x.k === k)) return; const f = (b.good || b.bad || GOODW.test(b.title) || BADW.test(b.title)) ? await T.snap('bar-' + b.title) : null; seen.push(Object.assign({ k, id, shot: f }, b)); } });
  let rounds = 0; for (let round = 0; round < 30; round++) { rounds = round;
    if (seen.some(x => x.good) && seen.some(x => x.bad) && round >= 3) break;
    await page.evaluate(() => { const S = ZT.S; const fs = S.staff.filter(x => !ZE.busyStaff(S)[x.id]); if (fs.length && !S.projects.some(p => p.type === 'expedition')) ZT.act('startExpedition', 'savanna', [fs[0].id], 1); const h = S.items.find(i => i.k === 'hab'); const pr = h && ZE.readyPairs(S, h.id)[0]; const f2 = S.staff.filter(x => !ZE.busyStaff(S)[x.id]); if (pr && f2.length && !S.projects.some(p => p.type === 'breed')) ZT.act('startBreeding', pr[0], pr[1], [f2[0].id]); });   // setup: start an expedition and a breeding
    for (let w = 0; w < 12; w++) { await page.evaluate(() => ZT.tick(1)); await sleep(300); await drain(); if (!(await page.evaluate(() => ZT.S.projects.length))) break; }
    await T.toFloor();
  }
  say('   rounds played: ' + rounds + '; engine counts ' + JSON.stringify(await page.evaluate(() => ZT.S.did)) + '; choices answered by touch: ' + drain.stats.popups.filter(p => /^mo-choice/.test(p)).length);
  say('   verdict bars seen:'); seen.filter(x => x.good || x.bad || GOODW.test(x.title) || BADW.test(x.title)).forEach(x => say('     ' + x.id + ' "' + x.title + '" ' + (x.good ? 'good' : x.bad ? 'bad' : 'no class') + ' ' + x.bg + ' mark ' + x.mark));
  const g = seen.filter(x => x.good), bd = seen.filter(x => x.bad);
  check(g.length > 0 && g.every(x => x.bg === GREEN), 'green', 'every "it worked" card seen has a solid green bar (' + g.length + ' kinds: ' + g.map(x => x.title).join(', ') + ')', g[0] && g[0].shot);
  check(bd.length > 0 && bd.every(x => x.bg === RED), 'red', 'every "it failed" card seen has a solid red bar (' + bd.length + ' kinds: ' + bd.map(x => x.title).join(', ') + ')' + (bd.length ? '' : ' [no failure came up in ' + rounds + ' rounds]'), bd[0] && bd[0].shot);
  const wrong = seen.filter(x => (GOODW.test(x.title) && !x.good) || (BADW.test(x.title) && !x.bad));
  check(wrong.length === 0, 'wording', 'no card with success words lacks green, none with failure words lacks red' + (wrong.length ? ': ' + wrong.map(x => x.id + ' "' + x.title + '" ' + x.bg).join('; ') : ''), wrong[0] && wrong[0].shot);
  check(g.concat(bd).every(x => x.mark === (x.good ? 'ok' : 'no')), 'marks', 'green bars carry a tick and red bars a cross');
  await T.done();
}

/* ============================================================ SPEED 2 */
async function secSpeed() {
  say('== SPEED 2 (' + engine + ')'); const T = await mk('speed', '?play=1&' + Q); const { page, check } = T;
  await quiet(T); await page.evaluate(() => { ZT.tick(4); ZT.S.reports.length = 0; ZT.popAll(); ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 600000; });   // setup: a few weeks so visitors are about; then freeze the calendar so only the floor moves
  await sleep(2500);
  const sample = async secs => { const a = await page.evaluate(() => { const d = ZRender.debug(); return { walked: d.walked, walkSecs: d.walkSecs, world: d.worldTime, clock: d.clock, speed: d.speed, visitors: d.visitors, t: performance.now(), fs: ZCore.floorSpeed(), run: ZT.running() }; }); await sleep(secs * 1000); const b = await page.evaluate(() => { const d = ZRender.debug(); return { walked: d.walked, walkSecs: d.walkSecs, world: d.worldTime, clock: d.clock, speed: d.speed, visitors: d.visitors, t: performance.now() }; }); const dt = (b.t - a.t) / 1000; return { pxPerSec: (b.walked - a.walked) / dt, worldPerSec: (b.world - a.world) / dt, walkSecsPerSec: (b.walkSecs - a.walkSecs) / dt, speed: b.speed, visitors: b.visitors, fs: a.fs, run: a.run, raw: [a, b] }; };
  const s1 = await sample(6); say('   speed 1:', JSON.stringify({ px: +s1.pxPerSec.toFixed(1), world: +s1.worldPerSec.toFixed(2), walkSecs: +s1.walkSecsPerSec.toFixed(2), speed: s1.speed, visitors: s1.visitors, run: s1.run })); await T.snap('speed1');
  check(s1.run && s1.visitors > 0 && s1.pxPerSec > 0, 'speed1', 'at speed 1 visitors are walking (' + s1.visitors + ' people, ' + s1.pxPerSec.toFixed(1) + ' px of walking a second in all)');
  await T.menu(); await T.tapText('System'); await T.look('system'); await T.tapText('2x', { wait: 400 }); await T.toFloor(); await sleep(800);
  check(await page.evaluate(() => ZCore.speed === 2 && ZCore.floorSpeed() === 2), 'set2', 'System > 2x sets speed 2 (ZCore.floorSpeed() = 2)');
  const s2 = await sample(6); say('   speed 2:', JSON.stringify({ px: +s2.pxPerSec.toFixed(1), world: +s2.worldPerSec.toFixed(2), walkSecs: +s2.walkSecsPerSec.toFixed(2), speed: s2.speed, visitors: s2.visitors, run: s2.run })); await T.snap('speed2');
  const worldRatio = s2.worldPerSec / s1.worldPerSec, perWalker1 = s1.pxPerSec / Math.max(0.01, s1.walkSecsPerSec), perWalker2 = s2.pxPerSec / Math.max(0.01, s2.walkSecsPerSec);
  say('   floor time ratio ' + worldRatio.toFixed(2) + '; walking px per second of walking time: ' + perWalker1.toFixed(2) + ' then ' + perWalker2.toFixed(2) + '; total px ratio ' + (s2.pxPerSec / s1.pxPerSec).toFixed(2));
  check(worldRatio > 1.8 && worldRatio < 2.2, 'world-ratio', 'the floor\'s own time runs twice as fast at speed 2 (x' + worldRatio.toFixed(2) + ')');
  const pxRatio = perWalker2 / perWalker1; check(pxRatio > 1.7 && pxRatio < 2.3, 'px-ratio', 'a walking visitor covers about twice the ground in the same real time at speed 2 (x' + pxRatio.toFixed(2) + ': ' + perWalker1.toFixed(1) + ' -> ' + perWalker2.toFixed(1) + ' px a second each; all walkers together ' + s1.pxPerSec.toFixed(0) + ' -> ' + s2.pxPerSec.toFixed(0) + ')');
  await T.menu(); await T.tapText('System'); await T.tapText('1x', { wait: 400 }); await T.toFloor(); await sleep(600); const s3 = await sample(3); check(s3.worldPerSec / s1.worldPerSec < 1.2, 'back1', 'back at 1x the floor slows down again (x' + (s3.worldPerSec / s1.worldPerSec).toFixed(2) + ')');
  await T.done();
}

/* ============================================================ AUDIT of the new static screens */
async function secAudit() {
  for (const size of [[W, H, '?' + Q], [375, 667, '']]) {
    const lab = size[0] + 'x' + size[1]; say('== AUDIT ' + lab + ' (' + engine + ')'); const T = await mk('audit' + lab, size[2], size); const { page, check } = T;
    // title with the Challenges entry
    let d = await T.look('title'); const chal = await page.evaluate(() => { const c = document.querySelector('.mn-chal'); if (!c) return null; const r = c.getBoundingClientRect(); const b = c.closest('.pbody'); return { h: Math.round(r.height), w: Math.round(r.width), text: c.innerText.replace(/\s+/g, ' '), img: !!c.querySelector('img'), over: b ? b.scrollHeight - b.clientHeight : 0, bottom: Math.round(r.bottom), vh: innerHeight }; });
    check(chal && chal.h >= 44 && chal.img && chal.over <= 1 && chal.bottom <= chal.vh, 'title-chal', lab + ': the title has a Challenges entry (symbol, ' + (chal && chal.text) + ', ' + (chal && chal.h) + ' px tall) and does not scroll', d.shot);
    // setup: stars and a saved run so the level-select screen shows stars, an unlocked level and Continue
    await page.evaluate(() => { localStorage.setItem('wildside-zoo-v3-challenge-stars', JSON.stringify({ small: 3, savanna: 1 })); ZT.startChallenge('broke'); ZT.tick(2); ZT.popAll(); ZT.leaveChallenge(); }); await sleep(700);
    d = await T.look('title-continue'); await L.tapSel(T, '.mn-chal', 600); d = await T.look('levels');
    const lv = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(), b = l.querySelector('.pbody'); const cards = [...l.querySelectorAll('.mn-lvc')].map(c => { const r = c.getBoundingClientRect(); return { id: c.dataset.level, off: c.classList.contains('off'), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), stars: (c.querySelector('.mn-s3') || {}).getAttribute ? c.querySelector('.mn-s3').getAttribute('aria-label') : '', words: [...c.querySelectorAll('.ln')].filter(x => !x.querySelector('img')).length, textOver: [...c.querySelectorAll('*')].some(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible') }; }); return { cards, over: b.scrollHeight - b.clientHeight, cont: !!l.querySelector('.mn-chcont'), start: !!l.querySelector('.mn-chstart') }; });
    say('   levels:', JSON.stringify(lv));
    check(lv.cards.length === 5 && new Set(lv.cards.map(c => c.top)).size === 1, 'levels-line', lab + ': five levels in one line', d.shot); check(lv.over <= 0, 'levels-scroll', lab + ': the level-select screen does not scroll (' + lv.over + ' px over)', d.shot);
    check(lv.cards.every(c => c.w >= 44 && c.h >= 44 && c.words === 0 && !c.textOver), 'levels-cards', lab + ': every level card is at least 44 px, uses symbols for its limits, and its text stays inside (' + lv.cards.map(c => c.w + 'x' + c.h).join(' ') + ')', d.shot);
    check(/3 of 3/.test(lv.cards[0].stars) && /1 of 3/.test(lv.cards[1].stars) && !lv.cards[2].off && lv.cards[3].off && lv.cards[4].off, 'levels-stars', lab + ': best stars show (level 1: ' + lv.cards[0].stars + ', level 2: ' + lv.cards[1].stars + '); level 3 is open, 4 and 5 locked', d.shot);
    check(lv.cont && lv.start, 'levels-buttons', lab + ': Continue and Start are both offered while a run is saved');
    await T.tapText(/^Continue/, { sel: 'button, .btn', wait: 900 }); check(await page.evaluate(() => ZCore.inChallenge() && ZCore.challengeId === 'broke' && ZT.S.week === 2), 'continue', lab + ': Continue resumes the saved run (level 3, week 2)');
    await page.evaluate(() => { ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 600000; }); d = await T.look('challenge-floor');
    const chip = await page.evaluate(() => { const g = document.getElementById('goal'); const r = g.getBoundingClientRect(); const st = ZE.challengeStatus(ZT.S); const fw = document.getElementById('floor-wrap').getBoundingClientRect(); return { on: r.width > 0 && r.height > 0, text: g.innerText.replace(/\s+/g, ' '), label: g.getAttribute('aria-label'), top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right), floorTop: Math.round(fw.top), weeksLeft: st.weeksLeft, cur: st.cur, target: st.target, gw: (g.querySelector('.gw') || {}).textContent, opacity: getComputedStyle(g).opacity, bg: getComputedStyle(g).backgroundColor }; });
    say('   goal chip:', JSON.stringify(chip)); check(chip.on && +chip.gw === chip.weeksLeft && chip.bottom < chip.floorTop + 60 && chip.right < size[0] * 0.75 && chip.opacity === '1' && /^rgb\(/.test(chip.bg), 'chip', lab + ': the goal chip shows the level goal and the weeks left (' + chip.label + '), solid, in the top-left corner', d.shot);
    // menu inside a challenge, Info, System, Projects, Edit
    await T.menu(); await T.look('ch-menu'); await T.tapText('Info'); d = await T.look('ch-info'); check(!/Years|Awards|Ranks|Rumors/.test(d.text), 'ch-info', lab + ': Info hides Years, Awards, Ranks and Rumors in a challenge (' + (d.items || []).join(', ') + ')', d.shot);
    if (await T.tapText(/^Log/)) { await T.look('log'); await T.tapText(/./, { sel: '.back' }); } await T.tapText(/./, { sel: '.back' });
    await T.tapText('System'); d = await T.look('ch-system'); check(/Restart level/.test(d.text) && !/Replay tutorial/.test(d.text), 'ch-system', lab + ': System offers Restart level and no Replay tutorial', d.shot); await T.tapText(/./, { sel: '.back' });
    await T.tapText('Projects'); d = await T.look('ch-projects'); const exb = await page.evaluate(() => { const g = [...document.querySelectorAll('#screens .layer:not([hidden]) .gbox')].find(x => x.textContent.trim().startsWith('Expedition')); return g ? { dis: g.classList.contains('disabled'), lock: !!g.querySelector('img[alt="Locked"]') } : null; });
    check(exb && exb.dis && exb.lock, 'ch-noexp', lab + ': Shoestring greys Expedition with a padlock', d.shot); await T.tapText('Expedition', { wait: 500 }); const t1 = await T.toast(); const s1 = await T.state();
    check(s1.stack.join('>') === 'menu>projects' && t1.length > 0, 'ch-noexp-tap', lab + ': tapping the greyed Expedition opens nothing and says why ("' + t1 + '")', d.shot);
    await T.tapText('Event', { wait: 500 }); if ((await T.state()).stack.slice(-1)[0] === 'event-habs') await T.tapTop('.row.tappable', 450); if ((await T.state()).stack.slice(-1)[0] === 'event-setup') { d = await T.look('event-setup'); const ev = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(), b = l.querySelector('.pbody'); return { hosts: l.querySelectorAll('.mn-pk.host').length, themes: l.querySelectorAll('.mn-pk.theme').length, start: !!l.querySelector('.mn-send'), over: b.scrollHeight - b.clientHeight }; }); check(ev.hosts > 0 && ev.themes > 0 && ev.start && ev.over <= 0, 'event-one', lab + ': host (' + ev.hosts + '), theme (' + ev.themes + ') and Start are on ONE screen with no scrolling', d.shot); } else say('   (no event possible right now: ' + (await T.state()).stack.join('>') + ' / ' + (await T.toast()) + ')');
    await T.toFloor(); await T.menu(); await T.tapText('Edit', { wait: 700 }); d = await T.look('ch-edit'); const eb = await T.E.bar(); check(eb && eb.shown && !eb.cards.some(c => /^land/.test(c)), 'ch-noland', lab + ': in a challenge the Edit strip has no More land card (' + (eb && eb.cards.join(', ')) + ')', d.shot);
    const hid = await page.evaluate(() => (ZT.S.items.find(i => i.k === 'hab') || {}).id); if (hid) { await T.E.pick(hid); d = await T.look('ch-edit-picked'); const pb = await T.E.bar(); check(pb.small.length === 0 && pb.below.length === 0, 'picked-fit', lab + ': the picked-thing buttons are at least 44 px and above the bottom inset (' + pb.acts.join(', ') + ')', d.shot); }
    await T.toFloor(); await L.invariants(T, 'audit end ' + lab); await T.done();
  }
}

/* ============================================================ CHALLENGE LEVELS */
const ORDER = ['small', 'savanna', 'broke', 'breed', 'tiny'];
function makeChDrain(T, goal) {
  const page = T.page; const stats = { kept: 0, sold: 0, toHab: 0, toPen: 0, hires: 0, bought: 0, choices: 0, popups: {} }; let hired = 0, optN = 0; const seen = new Set();
  const drain = async () => {
    for (let g = 0; g < 70; g++) {
      const s = await T.state(); if (!s.stack.length) { if (!s.reports) return 'floor'; await sleep(300); if (!(await T.state()).stack.length) return 'floor'; continue; }
      const id = s.stack[s.stack.length - 1]; if (id === 'mo-challenge') return 'challenge'; if (s.stack[0] === 'title') return 'title';
      if (s.stack[0] === 'menu' && !/^mo-|^movein$|staff-candidates/.test(id)) return 'menu';
      const d = await describe(T); const items = d.items || [], txt = d.text || '';
      stats.popups[id] = (stats.popups[id] || 0) + 1; if (!seen.has(id) && seen.size < 40) { seen.add(id); await T.snap('pop-' + id + '-w' + s.week); }
      await L.invariants(T, 'popup ' + id);
      const rows = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return [...l.querySelectorAll('.mo-row.tap')].map((e, i) => ({ i, t: e.innerText.replace(/\s+/g, ' ').trim() })); });
      if (rows.length && rows.some(r => /^Pen/.test(r.t))) { if (/^Pen/.test(rows[0].t)) stats.toPen++; else stats.toHab++; await T.tapTop('.mo-row.tap', 550, 0); continue; }
      const keep = items.find(t => /^Keep/.test(t)), sell = items.find(t => /^\$[\d,]+$/.test(t));
      if (keep) { const info = await page.evaluate(txt => { const S = ZT.S; const e = S.arrivals.find(x => txt.indexOf(ZE.sp(x.a).name) >= 0) || S.arrivals[0]; if (!e) return null; const ch = ZE.arrivalChoices(S, e.a.id); return { fitHab: ch.some(c => c.hab != null && c.fit), have: S.animals.some(a => a.sp === e.a.sp), pen: ZE.holding(S).length, cap: ZE.holdCap(S) }; }, txt);   /* the arrival this card is about: is its kind in the zoo now, and is there room */
        const k = !info || !sell ? true : goal === 'species' ? (!info.have && (info.fitHab || info.pen < info.cap)) : goal === 'bred' ? (info.fitHab || info.pen < 3) : goal === 'money' ? (info.fitHab && !info.have) : (info.fitHab || (!info.have && info.pen < 2));
        if (k) { stats.kept++; await T.tapText(/^Keep/, { sel: 'button, .btn', wait: 500 }); } else { stats.sold++; await T.tapText(sell, { sel: 'button, .btn', wait: 500 }); } continue; }
      if (/^mo-caller-(trader|director)/.test(id)) { const buy = goal === 'bred' || goal === 'money' ? null : await page.evaluate(() => { const S = ZT.S; const o = ((S.offers && S.offers.list) || []).find(o => !S.animals.some(a => a.sp === o.a.sp) && o.price * 1.5 < S.money); return o ? '$' + o.price.toLocaleString('en-US') : null; });
        if (buy && await T.tapText(buy, { sel: 'button, .btn', wait: 600 })) { stats.bought++; continue; } if (await T.tapText(/Not now/i, { wait: 400 })) continue; }
      if (/^mo-caller/.test(id) && /Not now/.test(items.join('|'))) { await T.tapText(/Not now/i, { wait: 400 }); continue; }
      if (/mo-hire/.test(id) && items.some(t => /^Hire/.test(t))) { if (hired < 3) { hired++; stats.hires++; await T.tapText(/^Hire/, { sel: 'button, .btn', nth: 0, wait: 600 }); } await T.tapText(/^Done/i, { sel: 'button, .btn', wait: 500 }); continue; }
      if (/staff-candidates/.test(id)) { if (hired < 3 && items.some(t => /^Hire/.test(t))) { hired++; stats.hires++; await T.tapText(/^Hire/, { sel: 'button, .btn', nth: 0, wait: 600 }); } await T.tapText(/./, { sel: '.back', wait: 500 }); continue; }
      if (id === 'movein' || /Move in/.test(items.join('|'))) { await T.tapText(/^Move in/, { sel: 'button, .btn', wait: 500 }); continue; }
      if (/Not now/.test(items.join('|'))) { await T.tapText(/Not now/i, { wait: 400 }); continue; }
      const opt = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return [...l.querySelectorAll('.opt')].map((e, i) => ({ i, dis: e.classList.contains('disabled') })); });
      if (opt.length) { const ok = opt.filter(x => !x.dis); const pk = ok.length ? ok[optN++ % ok.length] : opt[0]; stats.choices++; await T.tapTop('.opt', 450, pk.i); continue; }
      const b = items.find(t => /^(Continue|Done|OK|Great|Keep playing|Close)/i.test(t)); if (b) { await T.tapText(b.split(' ')[0], { wait: 450 }); continue; }
      await T.tapXY(T.cx, T.cy, 650);
    }
    T.find('u7:drain-loop', 'a pop-up would not go away (stack ' + (await T.state()).stack.join('>') + ')'); await T.snap('drain-stuck'); await page.evaluate(() => ZT.popAll()); return 'stuck';
  };
  drain.stats = stats; return drain;
}
const snapSlots = T => T.page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^wildside-zoo-v3/.test(k) && !/challenge|log/i.test(k)) o[k] = localStorage.getItem(k);   /* the three slots, their summaries and the legacy record; not the challenge's own two keys, the play log or one-time hint flags */ } return JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]])); });
const readLevels = T => T.page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return { cards: [...l.querySelectorAll('.mn-lvc')].map(c => ({ id: c.dataset.level, off: c.classList.contains('off'), on: c.classList.contains('on'), stars: +(((c.querySelector('.mn-s3') || { getAttribute: () => '' }).getAttribute('aria-label') || '').match(/^(\d)/) || [0, -1])[1], lock: !!c.querySelector('.mn-s3.lk') })), cont: !!l.querySelector('.mn-chcont'), start: !!l.querySelector('.mn-chstart') }; });
const readCard = T => T.page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); const p = l.querySelector('.panel'), t = l.querySelector('.ptitle'), row = l.querySelector('.mo-chstars'); const st = ZE.challengeStatus(ZT.S); const btn = c => { const b = l.querySelector(c); if (!b) return null; const r = b.getBoundingClientRect(); return r.width > 0 ? { h: Math.round(r.height), w: Math.round(r.width), text: b.innerText.replace(/\s+/g, ' ').trim(), bottom: Math.round(r.bottom) } : null; };
  const on = ZSprites.iconUrl('star-on', 6); return { id: ZT.stack().join('>'), good: p.classList.contains('good'), bad: p.classList.contains('bad'), bar: getComputedStyle(t).backgroundColor, title: t.innerText.trim(), lit: row ? +row.dataset.lit : -1, litImgs: row ? [...row.querySelectorAll('img')].filter(i => i.src === on).length : -1, imgs: row ? row.querySelectorAll('img').length : 0, text: l.innerText.replace(/\s+/g, ' ').slice(0, 160), next: btn('.mo-next'), retry: btn('.mo-retry'), levels: btn('.mo-levels'), st: { stars: st.stars, cur: st.cur, target: st.target, week: st.week, done: st.done, failed: st.failed, level: st.level }, best: ZCore.challengeStars(), vh: innerHeight, safeB: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0, over: (() => { const b = l.querySelector('.pbody'); return b ? b.scrollHeight - b.clientHeight : 0; })() }; });

async function secLevel(id) {
  const n = ORDER.indexOf(id) + 1, next = ORDER[n] || null; say('== LEVEL ' + n + ' ' + id + ' (' + engine + ')');
  const T = await mk('lv' + n, '?' + Q); const { page, check, E } = T;
  // setup: a real zoo saved in slot 1 (so "the three slots are untouched" means something) and one star on each earlier level so this level is open
  const prev = {}; ORDER.slice(0, n - 1).forEach(x => { prev[x] = 1; });
  await page.evaluate(prev => { ZT.newGame({ slot: 1, name: 'Keep Me' }); ZT.tick(3); ZT.S.reports.length = 0; ZT.popAll(); ZT.save(); ZT.title(); localStorage.setItem('wildside-zoo-v3-challenge-stars', JSON.stringify(prev)); ZCore.toTitle(); }, prev); await sleep(700);
  const slots0 = await snapSlots(T); const slotsSame = async (when) => { const now = await snapSlots(T); let diff = ''; if (now !== slots0) { const a = JSON.parse(slots0), b = JSON.parse(now), ma = new Map(a), mb = new Map(b); const keys = [...new Set([...ma.keys(), ...mb.keys()])].filter(k => ma.get(k) !== mb.get(k)); diff = keys.map(k => { const x = ma.get(k) || '', y = mb.get(k) || ''; let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++; return k + ' (' + x.length + ' -> ' + y.length + ' chars; first difference at ' + i + ': "' + x.slice(Math.max(0, i - 40), i + 60) + '" became "' + y.slice(Math.max(0, i - 40), i + 60) + '")'; }).join(' || '); say('   STORAGE CHANGED outside the challenge keys ' + when + ': ' + diff); } return check(now === slots0, 'slots-' + when, 'the three zoo slots, their summaries and the legacy record are untouched ' + when + (diff ? ': changed ' + diff.slice(0, 300) : '')); };
  const LV = await page.evaluate(id => { const l = ZD.LEVELS.find(x => x.id === id); return JSON.parse(JSON.stringify(l)); }, id);
  // ---- from the title
  let d = await T.look('title'); const tt = await page.evaluate(() => { const c = document.querySelector('.mn-chal'); return c ? c.innerText.replace(/\s+/g, ' ') : null; });
  check(tt && new RegExp('\\b' + (n - 1) + '/15').test(tt), 'title-entry', 'the title has a Challenges entry showing the stars so far (' + tt + ')', d.shot);
  await L.tapSel(T, '.mn-chal', 600); check((await T.state()).stack.join('>') === 'title>challenges', 'open-levels', 'it opens the level-select screen'); d = await T.look('levels-before');
  let lv = await readLevels(T); say('   levels:', JSON.stringify(lv.cards));
  check(lv.cards.length === 5 && !lv.cards[n - 1].off && lv.cards.slice(0, n - 1).every(c => c.stars === 1) && lv.cards.slice(n).every(c => c.off && c.lock), 'levels-state', 'level ' + n + ' is open, the earlier levels show their best stars, the later ones are locked', d.shot);
  if (next) { await L.tapSel(T, '.mn-lvc[data-level="' + next + '"]', 350); const l2 = await readLevels(T); check(!l2.cards[n].on, 'locked-pick', 'the locked level ' + (n + 1) + ' cannot be picked'); }
  await L.tapSel(T, '.mn-lvc[data-level="' + id + '"]', 350); await T.tapText(/^Start/, { sel: 'button, .btn', wait: 900 }); if ((await T.state()).stack.slice(-1)[0] === 'confirm') await T.tapText(/^Start/, { sel: 'button, .btn', wait: 900 });
  const st0 = await page.evaluate(() => ({ in: ZCore.inChallenge(), id: ZCore.challengeId, week: ZT.S.week, money: Math.round(ZT.S.money), rows: ZT.S.rows, items: ZT.S.items.length, animals: ZT.S.animals.length, staff: ZT.S.staff.length, tut: !!(ZT.S.ui && ZT.S.ui.tutorial && ZT.S.ui.tutorial.on), coach: !!document.querySelector('.mn-coach'), speed: ZCore.speed, slot: ZCore.slot, stack: ZT.stack().join('>') }));
  say('   started:', JSON.stringify(st0));
  if (!check(st0.in && st0.id === id && st0.week === 0 && st0.stack === '', 'start', 'Start begins level ' + n + ' at week 0 and play starts')) { await T.snap('start-failed'); await T.done(); return; }
  check(st0.money === LV.money && st0.rows === LV.rows, 'start-figures', 'it starts with the level\'s money and map ($' + st0.money + ', ' + st0.rows + ' rows)'); check(!st0.tut && !st0.coach, 'no-tutorial', 'no tutorial inside a challenge');
  if (LV.start === 'bare') check(st0.items === 0, 'bare', 'the land is bare'); else check(st0.items > 0, 'starter', 'the starter zoo is built (' + st0.items + ' things, ' + st0.animals + ' animals, ' + st0.staff + ' staff)');
  await slotsSame('after starting the level');
  await page.evaluate(() => { ZCore.WEEK_MS[1] = 600000; }); d = await T.look('start-floor');   // setup: hold the clock while the checks below are made at week 0
  const chip = await page.evaluate(() => { const g = document.getElementById('goal'), st = ZE.challengeStatus(ZT.S); return { label: g.getAttribute('aria-label'), gw: +(g.querySelector('.gw') || {}).textContent, gt: (g.querySelector('.gt') || {}).textContent, stars: ((g.querySelector('.stars') || { getAttribute: () => '' }).getAttribute('aria-label') || ''), weeksLeft: st.weeksLeft, starsNow: st.starsNow, target: st.target, on: g.getBoundingClientRect().height > 0 }; });
  check(chip.on && chip.gw === chip.weeksLeft && new RegExp('^' + chip.starsNow).test(chip.stars), 'chip', 'the goal chip shows the level goal, ' + chip.weeksLeft + ' weeks left and ' + chip.starsNow + ' stars still possible (' + chip.label + ' | ' + chip.stars + ')', d.shot);
  // ---- what the level hides or forbids
  check(await T.menu(), 'menu', 'a tap on the land opens the menu'); d = await T.look('menu'); check(await page.evaluate(() => !document.querySelector('#screens .layer:not([hidden]) .mn-glow')), 'no-glow', 'no first-move highlight inside a challenge', d.shot);
  await T.tapText('Info'); d = await T.look('info'); check(!/Years|Awards|Ranks|Rumors/.test(d.text), 'hide-info', 'Info hides Years, Awards, Ranks and Rumors (' + (d.items || []).join(', ') + ')', d.shot); await T.tapText(/./, { sel: '.back' });
  await T.tapText('Projects'); d = await T.look('projects'); const pj = await page.evaluate(() => [...document.querySelectorAll('#screens .layer:not([hidden]) .gbox')].map(g => g.textContent.trim().replace(/\s+/g, ' ').slice(0, 24) + (g.classList.contains('disabled') ? ' [greyed]' : '') + (g.querySelector('img[alt="Locked"]') ? ' [padlock]' : ''))); say('   projects:', pj.join(' | '));
  if (id === 'broke') { check(pj.some(x => /^Expedition.*greyed.*padlock/.test(x)), 'no-exp', 'Shoestring: Expedition is greyed with a padlock', d.shot); await T.tapText('Expedition', { wait: 500 }); const t1 = await T.toast(); check((await T.state()).stack.join('>') === 'menu>projects' && t1.length > 0 && (await page.evaluate(() => ZT.S.projects.length)) === 0, 'no-exp-tap', 'tapping it starts nothing and says why ("' + t1 + '")'); }
  else check(pj.some(x => /^Expedition/.test(x) && !/padlock/.test(x)), 'exp-open', 'Expedition is not padlocked in this level');
  await T.tapText(/./, { sel: '.back' });
  if (id === 'savanna') { await T.tapText('Research'); await T.tapText(/^Regions/, { wait: 400 }); d = await T.look('research-regions', { allowScroll: true }); const rg = await page.evaluate(() => ({ stack: ZT.stack().join('>'), rows: [...document.querySelectorAll('#screens .layer:not([hidden]) .row')].map(x => x.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)), eng: ZE.researchList(ZT.S).filter(r => /^region:/.test(r.id)).map(r => r.id + ':' + r.lock) })); say('   regions research:', JSON.stringify(rg)); check(rg.stack === 'menu>research' || rg.rows.every(x => /Not in this challenge|Savanna/.test(x)) || rg.rows.length === 0, 'no-regions', 'Savanna Only: other regions cannot be researched (' + (rg.stack === 'menu>research' ? 'no Regions group' : rg.rows.join(' / ')) + ')', d.shot); await T.toFloor(); await T.menu(); }
  await T.tapText('System'); d = await T.look('system'); check(/Restart level/.test(d.text) && !/Replay tutorial/.test(d.text) && /Title screen/.test(d.text), 'system', 'System offers Restart level and Title screen, not Replay tutorial', d.shot);
  await T.tapText('2x', { wait: 400 }); check(await page.evaluate(() => ZCore.speed === 2), 'speed2', 'speed 2 set by touch'); await T.tapText(/./, { sel: '.back' });
  await T.tapText('Edit', { wait: 700 }); let b = await E.bar(); d = await T.look('edit'); say('   edit cards:', b && b.cards.join(' '));
  check(b && b.shown && !b.cards.some(c => /^land/.test(c)), 'no-land', 'the map never grows: no More land card in Edit (' + (b && b.cards.join(', ')) + ')', d.shot);
  if (id === 'savanna') { const habs = b.cards.filter(c => /^hab:/.test(c)); check(habs.join() === 'hab:savanna', 'only-savanna', 'Savanna Only: the only habitat on offer is Savanna (' + habs.join(', ') + ')', d.shot); }
  await T.toFloor();
  // ---- play it
  await page.evaluate(ms => { ZCore.WEEK_MS[1] = ms * 2; ZCore.WEEK_MS[2] = ms; }, FAST);   // setup: the clock runs faster than real time; every action below is still a touch
  const drain = makeChDrain(T, LV.goal.kind); const log = { built: [], exp: 0, event: 0, breed: 0, research: 0, advert: 0, upgrade: 0, house: 0, soldSpare: 0 };
  const readR = () => page.evaluate(() => { const S = ZT.S, D = ZD, Z = ZE, lv = Z.level(S); const habs = S.items.filter(i => i.k === 'hab').map(h => ({ id: h.id, t: h.t, q: h.q, r: h.r, lvl: h.lvl, n: Z.inHab(S, h.id).length, cap: Z.habCap(h), up: h.lvl < Z.habLevelCap(S) ? Z.habUpgradeCost(h, S) : 0 }));
    const facs = S.items.filter(i => i.k === 'fac'), busy = Z.busyStaff(S), free = S.staff.filter(x => !busy[x.id]).length; const icons = ZRender.debug().icons, ready = k => Object.values(icons).some(a => a.includes(k));
    const fk = D.FAC_ORDER.filter(f => S.research['fac:' + f] && !(D.FAC[f].limit && facs.some(x => x.t === f))).map(f => ({ t: f, cost: Z.facCost(S, f), n: facs.filter(x => x.t === f).length }));
    const res = Z.researchList(S).filter(r => !r.done && !r.lock && r.rp <= S.rp).sort((a, b) => a.rp - b.rp)[0]; const biomes = D.BIOME_ORDER.filter(b => S.regions[b] && Z.allowed(S, 'hab', b).ok).map(b => ({ b, cost: Z.habBuildCost(S, b), n: habs.filter(h => h.t === b).length }));
    const tiers = Z.hireTiers(S).filter(t => !t.lock); const ba = Z.busyAnimals(S); let spare = null;
    if (lv.goal.kind === 'bred') { const full = habs.filter(h => h.n >= h.cap); if (full.length || Z.holding(S).length > 2) { const pool = S.animals.filter(a => !ba[a.id] && !Z.isJuv(S, a)); const keep = new Set(); const kinds = {}; pool.forEach(a => { const k = a.sp + a.sex; (kinds[k] = kinds[k] || []).push(a); }); Object.values(kinds).forEach(l => l.sort((x, y) => Z.avg(y) - Z.avg(x)).slice(0, 2).forEach(a => keep.add(a.id))); const sp = pool.filter(a => !keep.has(a.id)).sort((x, y) => Z.avg(x) - Z.avg(y))[0]; if (sp) spare = { id: sp.id, pen: sp.hab == null }; } }
    return { money: S.money, week: S.week, habs, nfac: facs.length, fk, pen: Z.holding(S).length, penFits: Z.holding(S).some(a => habs.some(h => h.t === Z.sp(a).biome && h.n < h.cap)), types: S.projects.map(p => p.type), readyEvent: ready('ready-event'), readyBreed: ready('ready-breed'), free, staff: S.staff.length, cap: Z.staffCap(S), cands: S.candidates.length, hiring: !!S.hiring, res: res && { group: res.group, name: res.name }, biomes, expOk: Z.allowed(S, 'expedition').ok, expCost: Z.expCost('savanna', 1), camp: (() => { try { const c = Z.campaigns(S).filter(c => !c.lock && !c.weeksLeft && c.cost <= S.money * 0.5).pop(); return c ? c.name : ''; } catch (e) { return ''; } })(), tier: tiers.length ? tiers[0].cost : 0, tierName: tiers.length ? tiers[0].name : '', goal: lv.goal.kind, profit: S.incomeLast - S.costLast, target: lv.goal.target, maxHabs: lv.maxHabs || 3, spare, cur: Z.challengeStatus(S).cur, done: S.ch.done }; });
  async function project(kind, startRe) { if (!(await T.menu())) return false; await T.tapText('Projects'); if (!(await T.tapText(kind, { wait: 450 }))) { await T.toFloor(); return false; } const n0 = await page.evaluate(() => ZT.S.projects.length); const ok = await through(T, startRe);
    if (ok && kind === 'Expedition') { /* pick the star as a player would: the highest open one that costs at most 60% of the bank (the page itself opens on the star used last time) */ const star = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); const open = [...l.querySelectorAll('.mn-xs:not(.off)')].map(x => +x.dataset.star); const S = ZT.S; const ok = open.filter(n => ZE.expCost('savanna', n) <= S.money * 0.6); return ok.length ? Math.max(...ok) : 0; }); if (star) { await T.tapTop('.mn-xs[data-star="' + star + '"]', 350); log.stars = log.stars || {}; log.stars[star] = (log.stars[star] || 0) + 1; } }
    if (ok) await T.tapText(startRe, { sel: 'button, .btn', wait: 700 }); const n1 = await page.evaluate(() => ZT.S.projects.length); await drain(); await T.toFloor(); return n1 > n0; }
  async function round() {
    let R = await readR(); if (R.done) return;
    const save = R.goal === 'money' && (R.week >= 80 || (R.profit > 0 && R.week + (R.target - R.money) / R.profit <= 90));
    if (!R.habs.length && R.biomes.length && R.money >= R.biomes[0].cost) { const r = await E.add('hab:' + R.biomes[0].b); await drain(); await T.toFloor(); if (r.ok) log.built.push('hab:' + R.biomes[0].b + '@' + R.week); else say('   w' + R.week + ' first habitat not placed: ' + r.why); R = await readR(); }
    if (R.spare) { await T.menu(); await T.tapText('Animals'); if (R.spare.pen) await T.tapText(/^Pen/); let ok = await T.tapTop('[data-aid="' + R.spare.id + '"]', 500); if (ok) { ok = await T.tapText(/^Sell/, { sel: 'button, .btn', wait: 500 }); if (ok && (await T.state()).stack.slice(-1)[0] === 'confirm') await T.tapText(/^(Sell|Yes)/, { sel: 'button, .btn', wait: 500 }); } if (ok) log.soldSpare++; else if (!log.spareMiss) { log.spareMiss = 1; await T.snap('sell-spare-miss'); say('   w' + R.week + ' could not sell a spare animal by touch (' + (await T.state()).stack.join('>') + ')'); } await T.toFloor(); R = await readR(); }
    if (R.pen && R.penFits) { await T.menu(); await T.tapText('Animals'); await T.tapText(/^Pen/); await T.tapText(/^House all/, { sel: 'button, .btn', wait: 500 }); log.house++; await T.toFloor(); R = await readR(); }
    if (!save && R.habs.length) {
      const fac = R.fk.filter(f => R.money > f.cost * (R.goal === 'money' ? 2.6 : 1.8)).sort((a, b) => a.n - b.n)[0];
      if (fac && R.nfac < R.habs.length * 3 + 2) { const h = R.habs[R.nfac % R.habs.length]; const r = await E.add('fac:' + fac.t, { near: [h.q, h.r] }); await drain(); await T.toFloor(); if (r.ok) log.built.push(fac.t + '@' + R.week); else say('   w' + R.week + ' ' + fac.t + ' not placed: ' + r.why); R = await readR(); }
      const hb = R.biomes.filter(x => R.money > x.cost * 2).sort((a, b) => a.n - b.n)[0];
      if (hb && R.habs.length < R.maxHabs && R.habs.every(h => h.n >= 2)) { const r = await E.add('hab:' + hb.b); await drain(); await T.toFloor(); if (r.ok) log.built.push('hab:' + hb.b + '@' + R.week); else say('   w' + R.week + ' habitat not placed: ' + r.why); R = await readR(); }
      const uh = R.habs.find(h => h.up && R.money > h.up * 1.6 && h.n >= h.cap - 1);
      if (uh && await E.open()) { if (await E.pick(uh.id)) { await L.tapSel(T, '#edit-bar .mn-eact .mn-up', 700); log.upgrade++; } await drain(); await T.toFloor(); R = await readR(); }
      if (R.res) { await T.menu(); await T.tapText('Research'); const gmap = { 'Event themes': 'Themes' }; if (await T.tapText(gmap[R.res.group] || R.res.group, { wait: 400 })) { if (await T.tapText(R.res.name, { sel: '.row', wait: 500 })) { await T.tapText(/^(Research|Yes|Confirm|Buy|Learn|Start)/i, { sel: 'button, .btn', wait: 600 }); log.research++; } } await drain(); await T.toFloor(); R = await readR(); }
      if (R.staff < R.cap && !R.cands && !R.hiring && R.tier && R.money > R.tier * 4 && R.week > 4) { await T.menu(); await T.tapText('Staff'); if (await T.tapText(new RegExp('^' + R.tierName), { sel: 'button, .btn, .row', wait: 700 })) log.advert++; await drain(); await T.toFloor(); R = await readR(); }
      if (R.camp && (R.goal === 'visitors' || R.goal === 'rank')) { await T.menu(); await T.tapText('Projects'); if (await T.tapText('Advertise', { wait: 450 })) { const c0 = await page.evaluate(() => JSON.stringify(ZE.campaigns(ZT.S).map(c => c.weeksLeft))); if (await T.tapText(new RegExp('^' + R.camp), { sel: '.row, button, .btn, .gbox', wait: 500 })) { if ((await T.state()).stack.slice(-1)[0] === 'confirm') await T.tapText(/^(Run it|Run|Start|Yes)/i, { sel: 'button, .btn', wait: 500 }); } const c1 = await page.evaluate(() => JSON.stringify(ZE.campaigns(ZT.S).map(c => c.weeksLeft))); if (c1 !== c0) log.campaign = (log.campaign || 0) + 1; else if (!log.campMiss) { log.campMiss = 1; await T.snap('campaign-miss'); say('   w' + R.week + ' could not start the ' + R.camp + ' campaign by touch (' + (await T.state()).stack.join('>') + ')'); } } await drain(); await T.toFloor(); R = await readR(); }
      if (R.expOk && R.goal !== 'bred' && !R.types.includes('expedition') && R.free > 0 && R.money > R.expCost * 1.3 && R.habs.length) { if (await project('Expedition', /^Send/)) log.exp++; R = await readR(); }
    }
    if (R.readyEvent && !R.types.includes('event') && R.free > 0 && R.money > 800) { if (await project('Event', /^Start/)) log.event++; R = await readR(); }
    if (R.readyBreed && !R.types.includes('breed') && R.free > 0) { if (await project('Breeding', /^Start/)) log.breed++; }
  }
  const t0 = Date.now(); let lastAct = -99, left = false, lastSay = -99, tinyChecked = false, endState = 'timeout';
  while (Date.now() - t0 < 45 * 60 * 1000) {
    const r = await drain(); if (r === 'challenge') { endState = 'card'; break; } if (r !== 'floor') await T.toFloor();
    const s = await T.state(); if (s.stack.length) continue;
    if (s.week - lastSay >= 12) { lastSay = s.week; const st = await page.evaluate(() => ZE.challengeStatus(ZT.S)); say('  week ' + s.week + ' $' + s.money + ' goal ' + Math.round(st.cur) + '/' + st.target + ' starsNow ' + st.starsNow + ' t+' + Math.round((Date.now() - t0) / 1000) + 's ' + JSON.stringify(log)); }
    if (!left && s.week >= 8) { left = true;   // ---- leave mid-level and come back
      await page.evaluate(() => { ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 600000; });   // setup: hold the clock so "the same week" can be compared exactly
      const mid = await page.evaluate(() => ({ week: ZT.S.week, money: Math.round(ZT.S.money), items: ZT.S.items.length, animals: ZT.S.animals.length }));
      await T.menu(); await T.tapText('System'); await T.tapText(/^Title screen/, { sel: 'button, .btn', wait: 900 }); if ((await T.state()).stack.slice(-1)[0] === 'confirm') await T.tapText(/^(Yes|Leave|Title)/, { sel: 'button, .btn', wait: 900 });
      const out = await page.evaluate(() => ({ stack: ZT.stack().join('>'), in: ZCore.inChallenge(), saved: ZCore.challengeSaved() })); d = await T.look('left-title');
      check(out.stack === 'title' && !out.in && out.saved && out.saved.levelId === id && Math.abs(out.saved.week - mid.week) <= 1, 'leave', 'System > Title screen leaves the level at week ' + mid.week + ' and keeps the run (' + JSON.stringify(out.saved && { level: out.saved.levelId, week: out.saved.week }) + ')', d.shot); await slotsSame('after leaving mid-level');
      const w8 = await page.evaluate(() => ZCore.challengeSaved().week); await sleep(1500);
      await L.tapSel(T, '.mn-chal', 600); const l3 = await readLevels(T); d = await T.look('levels-continue'); check(l3.cont, 'continue-offered', 'the level-select screen offers Continue', d.shot);
      await T.tapText(/^Continue/, { sel: 'button, .btn', wait: 900 }); const back = await page.evaluate(() => ({ in: ZCore.inChallenge(), id: ZCore.challengeId, week: ZT.S.week, money: Math.round(ZT.S.money), items: ZT.S.items.length, animals: ZT.S.animals.length, speed: ZCore.speed, stack: ZT.stack().join('>') }));
      check(back.in && back.id === id && back.week === w8 && back.items === mid.items && back.animals === mid.animals, 'resume', 'Continue resumes level ' + n + ' where it was left (week ' + back.week + ', $' + back.money + ', ' + back.items + ' things, ' + back.animals + ' animals)');
      check(back.speed === 2, 'resume-speed', 'the run comes back at speed 2 as it was left (speed ' + back.speed + ')'); await slotsSame('after Continue'); await page.evaluate(ms => { ZCore.WEEK_MS[1] = ms * 2; ZCore.WEEK_MS[2] = ms; }, FAST); continue; }
    if (id === 'tiny' && !tinyChecked && (await page.evaluate(() => ZT.S.items.filter(i => i.k === 'hab').length)) >= 2) { tinyChecked = true; await E.open(); const c = await E.card('hab:savanna'); const t1 = await T.toast(); d = await T.look('tiny-third-habitat'); check(c.found && c.off && !c.placing, 'two-pens', 'Two Pens: with two habitats built the habitat card is greyed and starts nothing', d.shot); check(/2 habitats|Only 2/i.test(t1), 'two-pens-reason', 'and a tap says why ("' + t1 + '")', d.shot); await T.toFloor(); continue; }
    if (s.week - lastAct >= ACT) { lastAct = s.week; try { await round(); } catch (e) { say('   round error at week ' + s.week + ': ' + e.message.split('\n')[0]); T.find('u7:round-error', 'the touch player hit an error at week ' + s.week + ': ' + e.message.split('\n')[0]); await page.evaluate(() => ZT.popAll()).catch(() => 0); await T.toFloor(); } await L.invariants(T, 'round w' + s.week, { expectClosed: true }); }
    await sleep(300);
  }
  say('   played: ' + JSON.stringify(log) + ' | pop-ups ' + JSON.stringify(drain.stats) + ' | ' + Math.round((Date.now() - t0) / 1000) + ' s');
  if (id === 'tiny') check(tinyChecked, 'two-pens-reached', 'Two Pens: the play reached two habitats so the limit could be tried');
  if (!check(endState === 'card', 'card-shown', 'the level ended with the result card (' + endState + ')')) { await T.snap('no-card'); await T.done(); return; }
  // ---- the result card
  for (let i = 0; i < 24; i++) { const c = await readCard(T); if (c.retry) break; await sleep(400); } await sleep(600);
  let card = await readCard(T); d = await T.look('result-card'); say('   card:', JSON.stringify(card));
  const stars = card.st.stars; say('   RESULT level ' + n + ': ' + stars + ' stars at week ' + card.st.week + ' (' + Math.round(card.st.cur) + ' / ' + card.st.target + ')');
  check(card.lit === stars && card.litImgs === stars && card.imgs === 3, 'card-stars', 'the card lights ' + card.litImgs + ' of 3 stars and ZE.challengeStatus says ' + stars, d.shot);
  check(stars > 0 ? (card.good && card.bar === GREEN) : (card.bad && card.bar === RED), 'card-colour', 'the bar is ' + (stars > 0 ? 'green (won)' : 'red (out of time)') + ': ' + card.bar, d.shot);
  check(!!card.retry && !!card.levels && (!!card.next === (stars > 0 && !!next)), 'card-buttons', 'buttons: ' + [card.next && card.next.text, card.retry && card.retry.text, card.levels && card.levels.text].filter(Boolean).join(' / ') + (stars > 0 && next ? '' : ' (no Next level: ' + (next ? 'the level was not won' : 'this is the last level') + ')'), d.shot);
  check([card.next, card.retry, card.levels].filter(Boolean).every(x => x.h >= 44 && x.w >= 44 && x.bottom <= card.vh - card.safeB + 0.5), 'card-fit', 'every button is at least 44 px and above the home-indicator inset; the card does not scroll (' + card.over + ' px over)');
  check(stars > 0 ? card.best[id] === Math.max(prev[id] || 0, stars) : !card.best[id], 'best-saved', 'the best stars are stored at once (' + JSON.stringify(card.best) + ')');
  await T.tapXY(T.cx, Math.round(H * 0.42), 500); check((await T.state()).stack.slice(-1)[0] === 'mo-challenge', 'card-stays', 'a tap on the card itself does not close it'); await slotsSame('with the result card up');
  const savedRun = await page.evaluate(() => localStorage.getItem('wildside-zoo-v3-challenge'));   // setup for later: the run with its card still up
  const comeBack = async label => { await page.evaluate(v => { if (ZCore.inChallenge()) ZCore.clearChallenge(); localStorage.setItem('wildside-zoo-v3-challenge', v); }, savedRun);   /* setup: nothing may be in play, or it would be saved over the restored run when the page reloads */ await T.goto('?' + Q); await sleep(600); await L.tapSel(T, '.mn-chal', 600); const ok = await T.tapText(/^Continue/, { sel: 'button, .btn', wait: 1200 }); await page.evaluate(() => { ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 600000; }); /* other pop-ups of that last week (a review, say) come back first, in order: answer them by touch until the card is up */ for (let i = 0; i < 24; i++) { const r = await drain(); if (r === 'challenge') { for (let k = 0; k < 24; k++) { const c = await readCard(T); if (c.retry) return true; await sleep(400); } } await sleep(400); } return false; };
  // Levels
  await T.tapTop('.mo-levels', 1000); const aft = await page.evaluate(() => ({ stack: ZT.stack().join('>'), in: ZCore.inChallenge(), saved: ZCore.challengeSaved(), best: ZCore.challengeStars() })); d = await T.look('after-levels'); say('   after Levels:', JSON.stringify(aft));
  check(!aft.in && /^title/.test(aft.stack) && !aft.saved, 'levels-btn', 'Levels leaves the finished level (no run left to continue); it lands on "' + aft.stack + '"', d.shot);
  check(aft.stack === 'title>challenges', 'levels-lands', 'Levels lands on the level-select screen (it landed on "' + aft.stack + '")', d.shot);
  if (aft.stack === 'title') await L.tapSel(T, '.mn-chal', 600); lv = await readLevels(T); d = await T.look('levels-after'); say('   levels now:', JSON.stringify(lv.cards));
  check(lv.cards[n - 1].stars === (stars > 0 ? Math.max(prev[id] || 0, stars) : 0), 'select-stars', 'the level-select screen shows level ' + n + ' with ' + lv.cards[n - 1].stars + ' best stars', d.shot);
  if (next) check(lv.cards[n].off === !(stars > 0), 'unlock', stars > 0 ? 'level ' + (n + 1) + ' is now unlocked' : 'level ' + (n + 1) + ' stays locked after a failed level', d.shot);
  check(!lv.cont, 'no-continue', 'no Continue is offered for a finished level'); await slotsSame('after Levels');
  // quit with the card up and come back: the card returns. Then Retry.
  const cameBack = await comeBack('retry'); d = await T.look('card-again'); check(cameBack, 'card-returns', 'leaving with the card still up and choosing Continue brings the card back', d.shot);
  if (cameBack) { card = await readCard(T); check(card.litImgs === stars, 'card-again-stars', 'and it still shows ' + stars + ' stars'); await T.tapTop('.mo-retry', 1100); const re = await page.evaluate(() => ({ in: ZCore.inChallenge(), id: ZCore.challengeId, week: ZT.S.week, done: ZT.S.ch.done, stack: ZT.stack().join('>'), money: Math.round(ZT.S.money), best: ZCore.challengeStars() })); d = await T.look('after-retry');
    check(re.in && re.id === id && re.week === 0 && !re.done && re.stack === '' && re.money === LV.money, 'retry', 'Retry starts level ' + n + ' again from week 0', d.shot); check((re.best[id] || 0) === (stars > 0 ? Math.max(prev[id] || 0, stars) : 0), 'retry-keeps-best', 'Retry keeps the best stars (' + JSON.stringify(re.best) + ')'); await slotsSame('after Retry'); }
  if (card.next || (stars > 0 && next)) { const cb = await comeBack('next'); if (check(cb, 'card-returns-2', 'the card comes back a second time for the Next level check')) { await T.tapTop('.mo-next', 1100); const nx = await page.evaluate(() => ({ in: ZCore.inChallenge(), id: ZCore.challengeId, week: ZT.S.week, stack: ZT.stack().join('>') })); d = await T.look('after-next'); check(nx.in && nx.id === next && nx.week === 0 && nx.stack === '', 'next', 'Next level starts level ' + (n + 1) + ' (' + nx.id + ') at week 0', d.shot); await slotsSame('after Next level'); } }
  // the saved zoo still loads
  await page.evaluate(() => { if (ZCore.inChallenge()) ZCore.leaveChallenge(); }); await sleep(600); const zoo = await page.evaluate(() => { const sl = ZCore.slots(); return JSON.stringify(sl.map(s => s && (s.name || s.zooName || (s.summary && s.summary.name) || !!s))); }); say('   slots at the end:', zoo); await slotsSame('at the end');
  await T.done();
}

(async () => {
  for (const sec of want) {
    try {
      if (sec === 'edit') await secEdit(); else if (sec === 'exp') await secExp(); else if (sec === 'where') await secWhere(); else if (sec === 'colours') await secColours(); else if (sec === 'speed') await secSpeed(); else if (sec === 'audit') await secAudit();
      else if (/^level:/.test(sec)) await secLevel(sec.split(':')[1]); else say('unknown section ' + sec);
    } catch (e) { say('CRASH in ' + sec + ': ' + (e.stack || e.message).split('\n').slice(0, 4).join(' / ')); results.push({ section: sec, crash: e.message.split('\n')[0] }); all.push({ section: sec, key: 'crash', msg: 'the script crashed in section ' + sec + ': ' + e.message.split('\n')[0] }); }
  }
  say('SUMMARY ' + engine + ' ' + JSON.stringify(results));
  say('FINDINGS (' + all.length + ')'); all.forEach((f, i) => say(' ' + (i + 1) + '. [' + f.section + '] ' + f.msg + (f.shot ? '  (' + f.shot + ')' : '')));
  process.exit(0);
})();
