/* Tester round 4 (B): bare land, tutorial No, things done in the "wrong" order, all by touch.
   Usage: node test/tester-blank.js [chromium|webkit]. Takes about 3 minutes (20 weeks at speed 2 are waited out on the real clock). */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
(async () => {
  const T = await L.launch(engine, { width: 390, height: 753 }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-blank' });
  const page = T.page; const say = (...a) => console.log(...a); const st = () => T.state(); let n = 0;
  const snap = async nm => { n++; await T.shot(String(n).padStart(2, '0') + '-' + String(nm).replace(/[^a-z0-9-]+/gi, '_')); };
  const inv = (l, o) => L.invariants(T, l, o);
  async function toFloor() { for (let i = 0; i < 8; i++) { const s = await st(); if (!s.stack.length && !s.placing) return; if (s.placing) { await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button' }); continue; } if (!(await T.tapText(/./, { sel: '.back' }))) await T.tapXY(195, 440); } }
  async function menu() { await toFloor(); await T.tapXY(195, 450, 450); }
  async function look(nm, o) { const d = await describe(T); say('   [' + nm + '] ' + (d.id || 'floor') + ' :: ' + (d.text || '').replace(/\s*\|\s*/g, ' | ').slice(0, 230)); await snap(nm); await inv(nm, o); return d; }
  const toast = () => page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' / '));
  const money = () => page.evaluate(() => Math.round(ZT.S.money));
  // title -> New zoo -> tutorial No
  await T.goto(''); await sleep(1000); await T.tapText(/^1/, { sel: 'button', wait: 500 }); await T.tapText(/^Next/, { sel: 'button, .btn', wait: 500 }); await T.tapText(/^No/, { sel: 'button, .btn', wait: 1000 });
  const s0 = await page.evaluate(() => ({ items: ZT.S.items.length, money: Math.round(ZT.S.money), tut: ZT.S.ui.tutorial, news: document.getElementById('news').innerText })); say('start:', JSON.stringify(s0)); await snap('bare-start');
  if (await page.evaluate(() => !!document.querySelector('.mn-coach'))) T.find('no:coach-shown', 'coach strip showing after choosing No');
  say('== first menu: is it obvious what to do first?'); await T.tapXY(195, 450, 500); const g = await page.evaluate(() => [...document.querySelectorAll('.mn-glow')].map(e => e.innerText.replace(/\n/g, ' ').slice(0, 20))); say('   highlighted:', JSON.stringify(g)); await look('menu-first'); if (!g.length) T.find('first:no-hint', 'with the tutorial off nothing on the first menu points at Build (no highlight, no hint) on bare land');
  say('== every box, in the wrong order');
  for (const b of ['Research', 'Info', 'System', 'Staff', 'Animals', 'Projects', 'Build']) { if (!(await T.tapText(b))) { T.find('box:' + b, b + ' not tappable on bare land'); continue; } await look('box-' + b); await T.tapText(/./, { sel: '.back' }); await sleep(200); }
  await toFloor();
  async function attempt(label, path, extra) { await menu(); for (const p of path) { const ok = await T.tapText(p, { wait: 350 }); if (!ok) { say('   ' + label + ': could not tap ' + p); await look(label + '-missing'); await toFloor(); return; } } const d = await look(label); if (extra) await extra(d); await toFloor(); await inv(label + ' closed', { expectClosed: true }); }
  const m0 = await money();
  await attempt('expedition', ['Projects', 'Expedition'], async d => { const nx = await T.tapText(/^Next/, { sel: 'button, .btn', wait: 400 }); await look('expedition-next'); if (await T.locate(/^Send/, { sel: 'button, .btn' })) { await T.tapText(/^Send/, { sel: 'button, .btn', wait: 600 }); say('   expedition sent on bare land; toast:', await toast()); } });
  await attempt('event', ['Projects', 'Event']);
  await attempt('breeding', ['Projects', 'Breeding']);
  await attempt('advertise', ['Projects', 'Advertise'], async d => { await T.tapText(/./, { sel: '.row.tappable', nth: 0, wait: 500 }); say('   advertise tapped; toast:', await toast(), 'screen:', (await describe(T)).id); });
  await attempt('house-zebras', ['Animals', 'Pen'], async d => { const h = await T.tapText(/^House/, { sel: 'button, .btn', wait: 500 }); say('   House tapped:', !!h, 'toast:', await toast()); await look('after-house'); });
  await attempt('market', ['Animals', 'Market']);
  await attempt('hire', ['Staff'], async d => { const t = await T.tapText(/^Notice board|^Newspaper/, { sel: '.row, button, .btn', wait: 700 }); say('   advert tapped:', !!t, 'screen', (await describe(T)).id); await look('hire-reveal'); for (let i = 0; i < 6; i++) { const s = await st(); if (!s.stack.length || s.stack[0] !== 'menu') break; if (/Hire/.test((await describe(T)).text)) break; await T.tapXY(195, 440, 500); } });
  await attempt('research', ['Research', 'Facilities'], async d => { const r = await T.tapText(/./, { sel: '.row.tappable:not(.disabled)', nth: 0, wait: 500 }); await look('research-tap'); await T.tapText(/^(No|Back)/, { sel: 'button, .btn', wait: 300 }); });
  await attempt('buy-land', ['Build', 'Buy land']);
  await attempt('upgrade-nothing', ['Build', 'Upgrade']); await attempt('move-nothing', ['Build', 'Move']); await attempt('remove-nothing', ['Build', 'Remove']);
  say('money change from the wrong-order tries:', m0, '->', await money());
  say('== placement then Cancel (habitat), then a snack stand BEFORE any habitat');
  await menu(); await T.tapText('Build'); await T.tapText(/^Habitats/); await T.tapText(/Savanna/, { sel: '.row', wait: 600 }); const ps = await st(); say('   placing:', ps.placing); await snap('hab-placing'); await T.tapText(/^Cancel/, { floor: true, sel: '#placement-bar button', wait: 600 }); const ps2 = await st(); say('   after Cancel: stack', ps2.stack.join('>'), 'placing', ps2.placing, 'running', ps2.running); await snap('after-cancel'); await toFloor();
  await menu(); await T.tapText('Build'); await T.tapText(/^Facilities/); await T.tapText(/Snack Stand/, { sel: '.row', wait: 600 }); const g1 = await page.evaluate(() => ({ placing: ZRender.placing(), note: document.getElementById('placement-note').innerText })); say('   snack before habitat: placing', g1.placing, 'note:', g1.note);
  const b0 = await page.evaluate(() => ZT.S.items.length); await T.tapText(/^Place/, { floor: true, sel: '#placement-bar button', wait: 700 }); const b1 = await page.evaluate(() => ZT.S.items.length); say('   snack placed before habitat:', b1 > b0, 'toast:', await toast()); await snap('snack-first'); await toFloor();
  say('   zoo open now?', await page.evaluate(() => ZE.isOpen(ZT.S)), 'news:', await page.evaluate(() => document.getElementById('news').innerText));
  say('== leave the land bare... (actually with the stand only) and let 20 weeks pass at speed 2');
  await menu(); await T.tapText('System'); await T.tapText('2x'); await toFloor();
  const w0 = await page.evaluate(() => ZT.S.week), mm0 = await money(); const t0 = Date.now(); const pops = [];
  while (Date.now() - t0 < 130000) { const s = await st(); if (s.week - w0 >= 20) break; if (s.stack.length) { pops.push(s.stack.join('>') + '@' + s.week); await look('unexpected-screen-w' + s.week); await T.tapText(/./, { sel: '.back' }) || await T.tapXY(195, 440); } await sleep(1000); }
  const w1 = await page.evaluate(() => ZT.S.week); say('   weeks passed:', w1 - w0, 'money', mm0, '->', await money(), 'pop-ups while waiting:', JSON.stringify(pops), 'visitors/strip:', await page.evaluate(() => document.getElementById('strip').innerText.replace(/\n/g, ' ')));
  if (pops.length) T.find('wait:popups', 'something opened while the land had no habitat: ' + pops.join(', ')); await snap('after-20-weeks'); await inv('after waiting', { expectClosed: true });
  say('== now build the habitat');
  await menu(); await T.tapText('Build'); await T.tapText(/^Habitats/); await T.tapText(/Savanna/, { sel: '.row', wait: 600 }); const pg = await page.evaluate(() => ({ ok: ZRender.debug().placement && ZRender.debug().placement.ok, note: document.getElementById('placement-note').innerText })); say('   ghost:', JSON.stringify(pg)); await T.tapText(/^Place/, { floor: true, sel: '#placement-bar button', wait: 1500 }); await toFloor(); await sleep(1500);
  say('   result:', JSON.stringify(await page.evaluate(() => ({ habs: ZT.S.items.filter(i => i.k === 'hab').length, pen: ZT.S.animals.filter(a => a.hab == null).length, open: ZE.isOpen(ZT.S), money: Math.round(ZT.S.money) }))), 'toast/news:', await page.evaluate(() => document.getElementById('news').innerText)); await snap('built-after-wait'); await inv('built', { expectClosed: true });
  say('FINDINGS (' + T.findings.length + ')'); T.findings.forEach((f, i) => say(' ' + (i + 1) + '. ' + f.msg)); say('console', JSON.stringify(T.consoleErrors), 'ZT.errors', JSON.stringify(await page.evaluate(() => ZT.errors)));
  await T.browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
