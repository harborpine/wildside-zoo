/* Tester round 5 (B/C helper): checks for the feedback items by touch where possible. Usage: node test/tester-r5check.js [chromium|webkit]
   ZT.tick / state edits only set the scene; every screen is opened by tapping. Frozen clock. Headless only. */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium'; const W = 393, H = 852;
(async () => {
  const T = await L.launch(engine, { width: W, height: H }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-r5' }); const page = T.page; const say = (...a) => console.log(...a); const st = () => T.state();
  await T.goto('?play=1&standalone=1&inset=34'); await sleep(600);
  await page.evaluate(() => { ZCore.WEEK_MS[1] = ZCore.WEEK_MS[2] = 600000; });
  const toFloor = async () => { for (let i = 0; i < 8; i++) { const s = await st(); if (!s.stack.length && !s.placing) return; if (s.placing) { await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button' }); continue; } if (!(await T.tapText(/./, { sel: '.back' }))) await T.tapXY(196, 500); } };
  const menu = async () => { await toFloor(); await T.tapXY(196, 520, 450); };
  const quiet = (n) => page.evaluate(n => { ZCore.onReport('*', (r, d) => d()); ['caller', 'happening', 'choice', 'expedition', 'birth', 'review', 'yearly', 'yearlyplan', 'vip', 'rankup', 'combo', 'show', 'showresult', 'yearend'].forEach(t => ZCore.onReport(t, (r, d) => d())); ZT.tick(n); ZT.S.reports.length = 0; ZT.S.happening = null; ZT.popAll(); }, n);
  // overlap + scroll measure of the top layer
  const measure = () => page.evaluate(() => {
    const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); const body = l.querySelector('.pbody') || l.querySelector('.panel') || l; const leaves = []; const w = document.createTreeWalker(l, NodeFilter.SHOW_TEXT); let nn; while ((nn = w.nextNode())) { const t = nn.nodeValue.trim(); if (!t) continue; const e = nn.parentElement; const r = document.createRange(); r.selectNodeContents(nn); const b = r.getBoundingClientRect(); if (b.width < 1 || b.height < 1) continue; leaves.push({ t: t.slice(0, 22), l: b.left, r: b.right, t0: b.top, b0: b.bottom }); }
    const ov = []; for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) { const a = leaves[i], c = leaves[j]; const ix = Math.min(a.r, c.r) - Math.max(a.l, c.l), iy = Math.min(a.b0, c.b0) - Math.max(a.t0, c.t0); if (ix > 2 && iy > 9) ov.push(a.t + ' x ' + c.t); }
    return { scroll: body.scrollHeight > body.clientHeight + 1, sh: body.scrollHeight, ch: body.clientHeight, overlaps: ov.slice(0, 6), text: l.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 300) };
  });
  async function look(name, o) { await sleep(250); const m = await measure(); say('  [' + name + '] scroll:' + m.scroll + ' (' + m.sh + '/' + m.ch + ') overlaps:' + JSON.stringify(m.overlaps) + ' :: ' + m.text.slice(0, 160)); await T.shot(name); await L.invariants(T, name); if (m.overlaps.length) T.find('overlap:' + name, 'overlapping text on ' + name + ': ' + m.overlaps.join('; ')); if (m.scroll && !(o && o.scrollOk)) T.find('scroll:' + name, name + ' scrolls (' + m.sh + ' in ' + m.ch + ')'); return m; }

  say('== 2. Projects: Start on top, no overlap, 4 running');
  await menu(); await T.tapText('Projects'); const order0 = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return [...l.querySelectorAll('.sec, .gbox')].map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 24)); }); say('  order idle:', JSON.stringify(order0)); await look('projects-idle'); await toFloor();
  await page.evaluate(() => { const S = ZT.S; const ex = S.staff.find(s => s.role === 'explorer') || S.staff[0]; ZT.act('startExpedition', 'savanna', [ex.id], 1); const hab = S.items.find(i => i.k === 'hab'); const ids = S.staff.map(s => s.id); const keeper = S.staff.find(s => s.id !== ex.id) || S.staff[0]; try { ZT.act('startEvent', hab.id, ZD.THEME_ORDER ? ZD.THEME_ORDER[0] : Object.keys(ZD.THEMES)[0], keeper.id); } catch (e) { } });
  say('  running now:', JSON.stringify(await page.evaluate(() => ZT.S.projects.map(p => p.type)))); await menu(); await T.tapText('Projects'); const order1 = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return [...l.querySelectorAll('.sec, .gbox, .row')].map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 26)); }); say('  order with running:', JSON.stringify(order1)); await look('projects-running'); await toFloor();
  say('== 13. Animals typical early zoo'); await quiet(10); await menu(); await T.tapText('Animals'); await T.tapText(/^Zoo/); const ord = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return [...l.querySelectorAll('.row, .sec')].map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 20)); }); say('  rows:', JSON.stringify(ord)); const ma = await look('animals-zoo'); await toFloor();
  say('== 10. capacity'); say('  habCap by level:', JSON.stringify(await page.evaluate(() => [1, 2, 3, 4, 5].map(l => ZE.habCap({ lvl: l })))), 'habitat 1 shows:', JSON.stringify(await page.evaluate(() => { const h = ZT.S.items.find(i => i.k === 'hab'); return { lvl: h.lvl, cap: ZE.habCap(h), in: ZE.inHab(ZT.S, h.id).length }; })));
  say('  Animals header row for habitat:', ord.filter(r => /Savanna/i.test(r)).join(' / '));
  await page.evaluate(() => { ZT.S.money = 400000; ZT.S.rp = 500; });
  await menu(); await T.tapText('Build'); await T.tapText('Upgrade'); await T.tapText(/./, { sel: '.row.tappable', nth: 0, wait: 400 }); await look('upgrade-confirm', { scrollOk: true }); await T.tapText(/^(Upgrade|Yes)/i, { wait: 800 });
  const afterUp = await describe(T); say('  after upgrade:', afterUp.id, (afterUp.text || '').slice(0, 100), 'cap now', await page.evaluate(() => ZE.habCap(ZT.S.items.find(i => i.k === 'hab')))); await T.shot('after-upgrade'); await toFloor();
  say('== 7/8. crates, trader'); await page.evaluate(() => { ZT.debugCaller ? 0 : 0; try { ZE.debug.caller(ZT.S, 'trader'); } catch (e) { } });
  say('  callers:', JSON.stringify(await page.evaluate(() => ZE.callersHere(ZT.S).map(c => c.kind + ':' + (c.crates ? JSON.stringify(c.crates) : '')))));
  await menu(); await T.tapText('Animals'); await T.tapText(/^Market/); const mk = await look('market', { scrollOk: false }); say('  market text:', mk.text.slice(0, 200));
  say('== 1. comparison marks on market rows'); say('  badges:', JSON.stringify(await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return [...l.querySelectorAll('.row')].map(r => r.querySelectorAll('img').length + ' imgs; ' + r.innerText.replace(/\s+/g, ' ').slice(0, 24)); })));
  await toFloor();
  say('== holding upkeep where the pen is offered'); say('  pen tab:'); await menu(); await T.tapText('Animals'); await T.tapText(/^Pen/); await look('pen-tab', { scrollOk: true }); await toFloor();
  say('== 5. happenings rate over 96 weeks (quiet handler counts them)');
  const rate = await page.evaluate(() => { const cnt = { good: 0, bad: 0, n: 0 }; ZCore.onReport('happening', (r, d) => { cnt.n++; if (r.bad) cnt.bad++; else cnt.good++; d(); }); for (let i = 0; i < 96; i++) { ZT.tick(1); ZT.S.happening = null; } ZT.S.reports.length = 0; return cnt; }); say('  happenings in 96 weeks:', JSON.stringify(rate), 'one per', (96 / Math.max(1, rate.n)).toFixed(1), 'weeks;', Math.round(100 * rate.bad / Math.max(1, rate.n)) + '% setbacks');
  say('FINDINGS (' + T.findings.length + ')'); T.findings.forEach((f, i) => say(' ' + (i + 1) + '. ' + f.msg)); say('console', JSON.stringify(T.consoleErrors), 'ZT.errors', JSON.stringify(await page.evaluate(() => ZT.errors)));
  await T.browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
