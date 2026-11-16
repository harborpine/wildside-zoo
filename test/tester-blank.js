/* Tester round 4 (B), updated for Update 7: bare land, tutorial No, things done in the "wrong" order, all by touch.
   Build / Move / Remove / Upgrade / Buy land are now Edit mode on the map, so those wrong-order tries go through the Edit strip.
   Usage: node test/tester-blank.js [chromium|webkit]. Takes about 3 minutes (20 weeks at speed 2 are waited out on the real clock). */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
(async () => {
  const T = await L.launch(engine, { width: 390, height: 753 }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-blank' });
  const page = T.page; const say = (...a) => console.log(...a); const st = () => T.state(); let n = 0;
  const snap = async nm => { n++; await T.shot(String(n).padStart(2, '0') + '-' + String(nm).replace(/[^a-z0-9-]+/gi, '_')); };
  const inv = (l, o) => L.invariants(T, l, o);
  const toFloor = () => L.toFloor(T, 195, 440); const E = L.edit(T);
  async function menu() { await toFloor(); await T.tapXY(195, 450, 450); }
  async function look(nm, o) { const d = await describe(T); say('   [' + nm + '] ' + (d.id || 'floor') + ' :: ' + (d.text || '').replace(/\s*\|\s*/g, ' | ').slice(0, 230)); await snap(nm); await inv(nm, o); return d; }
  const toast = () => page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' / '));
  const money = () => page.evaluate(() => Math.round(ZT.S.money));
  // title -> New zoo -> tutorial No
  await T.goto(''); await sleep(1000); await T.tapText(/^1/, { sel: 'button', wait: 500 }); await T.tapText(/^Next/, { sel: 'button, .btn', wait: 500 }); await T.tapText(/^No/, { sel: 'button, .btn', wait: 1000 });
  const s0 = await page.evaluate(() => ({ items: ZT.S.items.length, money: Math.round(ZT.S.money), tut: ZT.S.ui.tutorial, news: document.getElementById('news').innerText })); say('start:', JSON.stringify(s0)); await snap('bare-start');
  if (await page.evaluate(() => !!document.querySelector('.mn-coach'))) T.find('no:coach-shown', 'coach strip showing after choosing No');
  say('== first menu: is it obvious what to do first?'); await T.tapXY(195, 450, 500); const g = await page.evaluate(() => [...document.querySelectorAll('.mn-glow')].map(e => e.innerText.replace(/\n/g, ' ').slice(0, 20))); say('   highlighted:', JSON.stringify(g)); await look('menu-first'); if (!g.some(x => /^Edit/.test(x))) T.find('first:no-hint', 'with the tutorial off nothing on the first menu points at Edit (no highlight, no hint) on bare land; highlighted: ' + JSON.stringify(g));
  if (await T.locate('Build')) T.find('menu:build-box', 'the main menu still has a Build box');
  say('== every box, in the wrong order');
  for (const b of ['Research', 'Info', 'System', 'Staff', 'Animals', 'Projects']) { if (!(await T.tapText(b))) { T.find('box:' + b, b + ' not tappable on bare land'); continue; } await look('box-' + b); await T.tapText(/./, { sel: '.back' }); await sleep(200); }
  { // Edit is not a screen any more: it closes the menu and puts the strip on the map, with the clock paused
    if (!(await T.tapText('Edit', { wait: 700 }))) T.find('box:Edit', 'Edit not tappable on bare land'); const b = await E.bar(); const s = await st(); say('   [box-Edit] strip shown', !!(b && b.shown), 'cards', JSON.stringify(b && b.cards), 'glowing', JSON.stringify(b && b.glow), 'stack', s.stack.join('>'), 'running', s.running, 'editing', s.editing); await snap('box-Edit'); await inv('box-Edit'); await L.audit(T, 'Edit strip on bare land');
    if (!b || !b.shown) T.find('edit:no-strip', 'tapping Edit on bare land did not show the Edit strip'); else { if (!b.glow.includes('hab:savanna')) T.find('edit:no-glow', 'on bare land the Savanna card does not glow in the Edit strip (glowing: ' + JSON.stringify(b.glow) + ')'); if (b.small.length) T.find('edit:small', 'Edit strip buttons under 44 px: ' + b.small.join('; ')); if (b.below.length) T.find('edit:below', 'Edit strip buttons under the bottom inset: ' + b.below.join('; ')); if (b.vScroll > 1) T.find('edit:vscroll', 'the Edit strip scrolls up and down'); }
    await toFloor(); await inv('Edit closed', { expectClosed: true }); }
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
  /* Update 7 equivalents of Buy land / Upgrade / Move / Remove with nothing built: all live in Edit mode now */
  { say('== Edit mode with nothing built: land card, and a tap on empty ground');
    await E.open(195, 450); let b = await E.bar(); const mA = await money(), rowsA = await page.evaluate(() => ZT.S.rows);
    const land = b && b.cards.find(c => /^land/.test(c)); say('   land card:', land); if (!land) T.find('edit:no-land-card', 'no More land card in the Edit strip of a normal zoo'); else { const c = await E.card('land'); await sleep(400); say('   land card tapped: greyed', c.off, 'placing', c.placing, 'toast:', await toast(), 'stack', (await st()).stack.join('>')); await look('buy-land'); if (c.off && !(await toast()) && !(await st()).stack.length) T.find('edit:land-silent', 'tapping the greyed More land card says nothing'); const s = await st(); if (s.stack.length) { await T.tapText(/^(No|Back|Not now)/, { sel: 'button, .btn', wait: 400 }); } }
    if ((await page.evaluate(() => ZT.S.rows)) !== rowsA || (await money()) !== mA) T.find('edit:land-bought', 'land was bought on bare land at rank 1 (rows ' + rowsA + ' -> ' + (await page.evaluate(() => ZT.S.rows)) + ', money ' + mA + ' -> ' + (await money()) + ')');
    // nothing is placed, so a tap on the ground must not offer Move / Upgrade / Sell
    await T.tapXY(195, 330, 500); b = await E.bar(); say('   tap on empty ground in Edit mode: actions', JSON.stringify(b && b.acts), 'stack', (await st()).stack.join('>')); await snap('edit-empty-tap'); if (b && b.acts.length) T.find('edit:acts-on-nothing', 'a tap on empty ground in Edit mode offers ' + b.acts.join(', ')); if ((await st()).stack.length) T.find('edit:menu-opened', 'a tap on the ground in Edit mode opened ' + (await st()).stack.join('>'));
    await toFloor(); await inv('edit-nothing closed', { expectClosed: true }); }
  say('money change from the wrong-order tries:', m0, '->', await money());
  say('== placement then Cancel (habitat), then a snack stand BEFORE any habitat');
  await E.open(195, 450); let ec = await E.card('hab:savanna'); const ps = await st(); say('   placing:', ps.placing, 'card', JSON.stringify(ec)); await snap('hab-placing'); await inv('hab placing'); await L.audit(T, 'habitat placement'); await T.tapText(/^Cancel/, { floor: true, sel: '#placement-bar button', wait: 600 }); const ps2 = await st(); say('   after Cancel: stack', ps2.stack.join('>'), 'placing', ps2.placing, 'editing', ps2.editing, 'running', ps2.running, 'items', await page.evaluate(() => ZT.S.items.length)); await snap('after-cancel');
  if (ps2.placing) T.find('cancel:still-placing', 'Cancel did not end placement'); if (!ps2.editing) T.find('cancel:edit-ended', 'Cancel on a placement also ended Edit mode'); if (await page.evaluate(() => ZT.S.items.length)) T.find('cancel:built', 'Cancel built something');
  ec = await E.card('fac:snack'); const g1 = await page.evaluate(() => ({ placing: ZRender.placing(), note: document.getElementById('placement-note').innerText })); say('   snack before habitat: placing', g1.placing, 'note:', g1.note, 'card', JSON.stringify(ec));
  const b0 = await page.evaluate(() => ZT.S.items.length); await T.tapText(/^Place/, { floor: true, sel: '#placement-bar button', wait: 700 }); const b1 = await page.evaluate(() => ZT.S.items.length); say('   snack placed before habitat:', b1 > b0, 'toast:', await toast()); await snap('snack-first'); await toFloor(); await inv('after snack-first', { expectClosed: true });
  say('   zoo open now?', await page.evaluate(() => ZE.isOpen(ZT.S)), 'news:', await page.evaluate(() => document.getElementById('news').innerText));
  say('== leave the land bare... (actually with the stand only) and let 20 weeks pass at speed 2');
  await menu(); await T.tapText('System'); await T.tapText('2x'); await toFloor();
  const w0 = await page.evaluate(() => ZT.S.week), mm0 = await money(); const t0 = Date.now(); const pops = [];
  while (Date.now() - t0 < 130000) { const s = await st(); if (s.week - w0 >= 20) break; if (s.stack.length) { const top = s.stack[s.stack.length - 1], own = /^(mo-hire|staff-candidates|mo-choice|mo-expedition|mo-animal)$/.test(top); // results of the expedition and the job advert this script started itself are expected (hiring is timed; finds must be sold or kept, so sell them)
      if (own) { await look('own-job-result-w' + s.week); if (!(await T.tapText(/^\$/, { sel: 'button, .btn', wait: 400 }))) if (!(await T.tapText(/^(Tap to continue|Play safe)$/, { wait: 400 }))) await T.tapText(/./, { sel: '.back' }) || await T.tapXY(195, 440); }
      else { pops.push(s.stack.join('>') + '@' + s.week); await look('unexpected-screen-w' + s.week); await T.tapText(/./, { sel: '.back' }) || await T.tapXY(195, 440); } } await sleep(1000); }
  const w1 = await page.evaluate(() => ZT.S.week); say('   weeks passed:', w1 - w0, 'money', mm0, '->', await money(), 'pop-ups while waiting:', JSON.stringify(pops), 'visitors/strip:', await page.evaluate(() => document.getElementById('strip').innerText.replace(/\n/g, ' ')));
  if (pops.length) T.find('wait:popups', 'something opened while the land had no habitat: ' + pops.join(', ')); await snap('after-20-weeks'); await inv('after waiting', { expectClosed: true });
  say('== now build the habitat');
  await E.open(195, 450); ec = await E.card('hab:savanna'); let pg = await E.ghost(); say('   ghost:', JSON.stringify(pg)); if (pg && !pg.ok) { const sp = await E.spot('hab', 'savanna', {}); if (sp) { await T.tapXY(sp.x, sp.y, 450); pg = await E.ghost(); say('   moved the ghost to a legal spot:', JSON.stringify(pg)); } } await snap('hab-ghost'); await T.tapText(/^Place/, { floor: true, sel: '#placement-bar button', wait: 1500 }); { const s = await st(); if (s.stack.includes('movein')) { await look('move-in'); await T.tapText(/^Move in/, { sel: 'button, .btn', wait: 600 }); } } await toFloor(); await sleep(1500);
  say('   result:', JSON.stringify(await page.evaluate(() => ({ habs: ZT.S.items.filter(i => i.k === 'hab').length, pen: ZT.S.animals.filter(a => a.hab == null).length, open: ZE.isOpen(ZT.S), money: Math.round(ZT.S.money) }))), 'toast/news:', await page.evaluate(() => document.getElementById('news').innerText)); await snap('built-after-wait'); await inv('built', { expectClosed: true });
  say('FINDINGS (' + T.findings.length + ')'); T.findings.forEach((f, i) => say(' ' + (i + 1) + '. ' + f.msg)); say('console', JSON.stringify(T.consoleErrors), 'ZT.errors', JSON.stringify(await page.evaluate(() => ZT.errors)));
  await T.browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
