/* Tester round 3: the first five minutes of a brand-new player, by touch, on a clean browser profile (no saves).
   Title screen, empty slot, name (typed), tutorial Yes, follow the coach strip, System > Title, slot card, second zoo with
   tutorial No, back to the first, delete a slot. Usage: node test/tester-first5.js [chromium|webkit]. Headless only. */
const L = require('./tester-lib.js'); const { sleep, describe } = L;
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
(async () => {
  const T = await L.launch(engine, { width: 390, height: 844 }, { tag: (engine === 'webkit' ? 'wk' : 'cr') + '-f5' });
  const page = T.page; const say = (...a) => console.log(...a); const st = () => T.state(); const inv = (l, o) => L.invariants(T, l, o);
  const seen = new Set(); let n = 0;
  async function snap(name) { n++; await T.shot(String(n).padStart(2, '0') + '-' + name); }
  async function show(name, o) { const d = await describe(T); say('   [' + name + '] ' + (d.id || 'floor') + ' :: ' + (d.text || '').slice(0, 220) + ' :: ' + JSON.stringify(d.items || []).slice(0, 200)); await snap(name); await inv(name, o); return d; }
  const coach = () => page.evaluate(() => { const c = document.querySelector('.mn-coach'); if (!c) return null; const r = c.getBoundingClientRect(); const sk = c.querySelector('.mn-skip'); const sr = sk && sk.getBoundingClientRect(); return { text: c.querySelector('.mn-ct').textContent, step: c.dataset.step, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), skipH: sr ? Math.round(sr.height) : 0, skipW: sr ? Math.round(sr.width) : 0, inpanel: c.classList.contains('inpanel'), glow: !!document.querySelector('.mn-glow') }; });
  const overlaps = (a, b) => a && b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  async function targetRect(text, o) { const b = await T.locate(text, o); return b && { left: b.x - b.w / 2, right: b.x + b.w / 2, top: b.y - b.h / 2, bottom: b.y + b.h / 2 }; }
  let choiceN = 0; const popupsDuringTut = [];
  async function drainPopups() {
    for (let g = 0; g < 40; g++) {
      const s = await st(); if (!s.stack.length) return false; if (s.stack[0] === 'menu' || s.stack[0] === 'title' || s.stack[0].startsWith('newzoo')) return false;
      const id = s.stack.slice(-1)[0]; const d = await describe(T); const c = await coach(); popupsDuringTut.push({ id, coachShown: !!c, step: c && c.step });
      await shotOnce('pop-' + id); await inv('popup ' + id);
      if (/^mo-caller/.test(id) && /Not now/.test((d.items || []).join('|'))) { await T.tapText(/Not now/i, { wait: 400 }); continue; }
      const opts = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return [...l.querySelectorAll('.opt')].map((e, i) => ({ i, dis: e.classList.contains('disabled') })); });
      if (opts.length) { const ok = opts.filter(o => !o.dis); const pk = ok.length ? ok[choiceN++ % ok.length] : opts[0]; await T.tapText(/./, { sel: '.opt', nth: pk.i, wait: 450 }); continue; }
      const b = (d.items || []).find(t => /^(Continue|Done|OK|Great|Keep playing|Close)/i.test(t)); if (b) { await T.tapText(b.split(' ')[0], { wait: 450 }); continue; }
      await T.tapXY(195, 440, 650);
    }
    return true;
  }
  async function shotOnce(k) { if (seen.has(k)) return; seen.add(k); await snap(k); }
  async function back() { await T.tapText(/./, { sel: '.back' }); }
  async function toFloor() { for (let i = 0; i < 8; i++) { const s = await st(); if (!s.stack.length && !s.placing) return; if (s.placing) { await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button' }); continue; } if (!(await T.tapText(/./, { sel: '.back' }))) await T.tapXY(195, 440); } }

  // ---------- 1. title ----------
  await T.goto(''); await sleep(1200);
  say('== TITLE (clean profile)'); const t0 = await show('title');
  const ts = await page.evaluate(() => ({ s: ZT.S, slot: ZCore.slot, running: ZT.running(), slots: ZCore.slots().map(x => x.empty) })); say('   state on title: S null', ts.s === null, 'slot', ts.slot, 'running', ts.running, 'slots empty', JSON.stringify(ts.slots));
  if (ts.running) T.find('title:running', 'the clock is running on the title screen');
  // is the whole viewport used? any band without content
  const bands = await page.evaluate(() => { const r = id => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; }; const lay = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); const p = lay && lay.querySelector('.panel'); const pr = p && p.getBoundingClientRect(); return { strip: r('strip'), news: r('news'), panel: pr && { top: Math.round(pr.top), bottom: Math.round(pr.bottom), left: Math.round(pr.left), right: Math.round(pr.right) }, vh: innerHeight, vw: innerWidth, stripText: document.getElementById('strip').innerText.replace(/\n/g, ' ') }; });
  say('   layout on title:', JSON.stringify(bands));
  // ---------- 2. empty slot -> name ----------
  say('== NAME'); await T.tapText(/^1/, { sel: '.row, .slot, button, .btn, .tappable', wait: 500 });
  const dn = await show('name');
  const field = await page.evaluate(() => { const f = document.querySelector('.layer:not([hidden]) input'); if (!f) return null; const cs = getComputedStyle(f); const r = f.getBoundingClientRect(); return { fs: parseFloat(cs.fontSize), val: f.value, h: Math.round(r.height), w: Math.round(r.width) }; });
  say('   name field:', JSON.stringify(field)); if (!field) T.find('name:no-field', 'no text field on the name screen'); else if (field.fs < 16) T.find('name:ios-zoom', 'name field font is ' + field.fs + 'px, below 16: iOS will zoom the page when it is tapped');
  if (field) {
    const fb = await page.evaluate(() => { const r = document.querySelector('.layer:not([hidden]) input').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); await page.touchscreen.tap(fb.x, fb.y); T.taps++; await sleep(300);
    await page.keyboard.press('Control+A'); await page.keyboard.type("Mina's Safari", { delay: 40 }); await sleep(200);
    const val = await page.evaluate(() => document.querySelector('.layer:not([hidden]) input').value); say('   typed name now:', JSON.stringify(val)); if (val !== "Mina's Safari") T.find('name:typing', 'typing a name by keyboard gave "' + val + '"');
    await snap('name-typed'); await inv('name typed');
  }
  const nb = (dn.items || []).find(t => /Next|Continue|OK|Go|Start|Play/i.test(t)); say('   going on with button:', nb);
  await T.tapText(nb ? nb.split(' ')[0] : /Next/i, { sel: 'button, .btn', wait: 600 });
  say('== TUTORIAL QUESTION'); const dq = await show('tutorial-question');
  await T.tapText(/^Yes/i, { sel: 'button, .btn', wait: 900 });
  const nm = await page.evaluate(() => ({ name: ZT.S && ZT.S.zooName || ZT.S && ZT.S.zoo, slot: ZCore.slot, tut: ZT.S && ZT.S.ui && ZT.S.ui.tutorial })); say('   zoo started:', JSON.stringify(nm));
  if (!nm.slot) T.find('start:no-slot', 'after Yes no game started (slot null)');

  // ---------- 3. follow the tutorial ----------
  say('== TUTORIAL');
  const stepLog = []; let tutDone = false; const tStart = Date.now();
  for (let guard = 0; guard < 60 && Date.now() - tStart < 240000; guard++) {
    await drainPopups();
    const s = await st(); if (s.stack.length && s.stack[0] !== 'menu') { await drainPopups(); continue; }
    const c = await coach();
    if (!c) { const tut = await page.evaluate(() => ZT.S.ui.tutorial); if (!tut.on) { tutDone = true; say('   tutorial finished (strip gone, on=false) at', Math.round((Date.now() - tStart) / 1000), 's'); break; } await sleep(500); continue; }
    if (!stepLog.find(x => x.step === c.step)) { stepLog.push({ step: c.step, text: c.text, t: Math.round((Date.now() - tStart) / 1000), words: c.text.split(/\s+/).length }); say('   STEP', c.step, '"' + c.text + '" (' + c.text.split(/\s+/).length + ' words) strip y ' + c.top + '-' + c.bottom + ' skip ' + c.skipW + 'x' + c.skipH + ' glow ' + c.glow); await snap('tut-step' + c.step + '-on-' + (s.stack.slice(-1)[0] || 'floor')); await inv('tutorial step ' + c.step); if (c.skipH && c.skipH < 44) T.find('tut:skip-small', 'the Skip button is ' + c.skipW + 'x' + c.skipH + ', under 44 px'); }
    // act as a player reading the text
    const txt = c.text;
    if (/Tap the zoo/i.test(txt)) { const r = await page.evaluate(() => { const c = document.querySelector('.mn-coach').getBoundingClientRect(); return { b: c.bottom }; }); await T.tapXY(195, Math.max(420, r.b + 60), 500); continue; }
    if (/expedition/i.test(txt)) { if (!(s.stack[0] === 'menu')) { await T.tapXY(195, 420, 400); }
      const cur = (await st()).stack; if (cur.length === 1) { const tr = await targetRect('Projects'); if (overlaps(c, tr) && c.inpanel === false) T.find('tut:covers-projects', 'the coach strip covers the Projects box'); await T.tapText('Projects'); }
      const cur2 = (await st()).stack; if (cur2.slice(-1)[0] === 'projects') await T.tapText('Expedition');
      for (let i = 0; i < 6; i++) { const sx = await st(); const id = sx.stack.slice(-1)[0]; if (!/^exp/.test(id)) break; const has = await T.locate(/^Send/, { sel: 'button, .btn' }); if (has) { const tr = await targetRect(/^Send/, { sel: 'button, .btn' }); const cc = await coach(); if (cc && overlaps(cc, tr)) T.find('tut:covers-send', 'the coach strip covers the Send button'); await T.tapText(/^Send/, { sel: 'button, .btn', wait: 700 }); break; } const nx = await T.locate(/^Next/, { sel: 'button, .btn' }); if (nx && !/pick/i.test(nx.text)) await T.tapText(/^Next/, { sel: 'button, .btn' }); else await T.tapText(/./, { sel: '.row.tappable' }); }
      await toFloor(); continue; }
    if (/event/i.test(txt)) { await toFloor(); await T.tapXY(195, 420, 400); await T.tapText('Projects'); await T.tapText(/^Event/);
      for (let i = 0; i < 6; i++) { const has = await T.locate(/^Start/, { sel: 'button, .btn' }); if (has) { await T.tapText(/^Start/, { sel: 'button, .btn', wait: 700 }); break; } const nx = await T.locate(/^Next/, { sel: 'button, .btn' }); if (nx && !/pick/i.test(nx.text)) await T.tapText(/^Next/, { sel: 'button, .btn' }); else if (!(await T.tapText(/./, { sel: '.row.tappable' }))) { say('   event flow dead end at', (await st()).stack.join('>')); T.find('tut:event-blocked', 'step "' + txt + '": the event could not be started (' + (await describe(T)).text.slice(0, 80) + ')'); break; } }
      await toFloor(); continue; }
    if (/bench/i.test(txt)) { await toFloor(); await T.tapXY(195, 420, 400); await T.tapText('Build'); await T.tapText('Facilities'); await T.tapText(/Garden Bench/, { sel: '.row', wait: 500 });
      const sp = await st(); if (sp.placing) {
        const cands = await page.evaluate(() => { const S = ZT.S, res = []; const g = ZRender.debug().placement; if (g && g.ok) return [{ stay: true }]; for (let r = 0; r < 20; r++) for (let q = -12; q < 14; q++) { if (!ZE.inGrid(q, r) || !ZE.inLand(S, q, r) || ZE.isEntrance(q, r)) continue; if (S.items.some(it => ZE.cells(it).some(c => c[0] === q && c[1] === r))) continue; const p = ZRender.hexToClient(q, r); if (p && p.x > 40 && p.x < 350 && p.y > 150 && p.y < 560) res.push({ x: p.x, y: p.y }); } return res; });
        const cc = await coach(); const bar = await page.evaluate(() => { const b = document.getElementById('placement-bar').getBoundingClientRect(), nn = document.getElementById('placement-note').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, nt: nn.top, nb: nn.bottom }; });
        say('   placement with coach:', JSON.stringify(cc && { top: cc.top, bottom: cc.bottom }), 'bar', JSON.stringify(bar)); await snap('tut-placing');
        if (cands[0] && !cands[0].stay) { const cand = cands.find(c => !cc || c.y > cc.bottom + 20) || cands[0]; await T.tapXY(cand.x, cand.y, 400); }
        await T.tapText('Place', { floor: true, sel: '#placement-bar button', wait: 800 }); await drainPopups(); await toFloor(); } else { T.find('tut:bench-no-placement', 'tapping Garden Bench did not start placement'); await toFloor(); }
      continue; }
    // step 5: just play for a while
    await sleep(1500);
  }
  if (!tutDone) { T.find('tut:not-finished', 'the tutorial did not finish within 4 minutes (steps seen: ' + stepLog.map(s => s.step).join(',') + ')'); const c = await coach(); say('   coach at timeout:', JSON.stringify(c)); await snap('tut-timeout'); }
  say('   steps seen:', JSON.stringify(stepLog)); say('   pop-ups that arrived while the tutorial was on:', JSON.stringify(popupsDuringTut));
  await toFloor(); await show('after-tutorial', { expectClosed: true });

  // ---------- 4. System > Title screen, slot card ----------
  say('== TITLE FROM SYSTEM');
  await drainPopups(); await toFloor(); await T.tapXY(195, 420, 400); await T.tapText('System'); const ds = await show('system');
  await T.tapText(/Title/i, { sel: 'button, .btn', wait: 900 }); const dt = await show('title-with-slot'); const sl = await page.evaluate(() => JSON.stringify(ZCore.slots()[0]).slice(0, 300)); say('   slot 1 summary:', sl);
  // ---------- 5. second zoo, tutorial No ----------
  say('== SECOND ZOO (slot 2, tutorial No)');
  await T.tapText(/^2/, { sel: '.row, .slot, button, .btn, .tappable', wait: 500 }); await show('name2');
  const nb2 = (await describe(T)).items.find(t => /Next|Continue|OK|Go|Start|Play/i.test(t)); await T.tapText(nb2 ? nb2.split(' ')[0] : /Next/i, { sel: 'button, .btn', wait: 600 });
  await show('tutorial-question2'); await T.tapText(/^No/i, { sel: 'button, .btn', wait: 900 });
  await sleep(1500); const s2 = await page.evaluate(() => ({ slot: ZCore.slot, tut: ZT.S.ui.tutorial, name: ZT.S.zooName || ZT.S.zoo })); say('   second zoo:', JSON.stringify(s2)); if (s2.tut && s2.tut.on) T.find('tut:no-ignored', 'tutorial is on after choosing No'); if (await coach()) T.find('tut:strip-after-no', 'coach strip is showing after choosing No');
  await snap('second-zoo-floor'); await inv('second zoo', { expectClosed: true });
  // ---------- 6. back to title, continue the first ----------
  say('== BACK TO FIRST');
  await T.tapXY(195, 420, 400); await T.tapText('System'); await T.tapText(/Title/i, { sel: 'button, .btn', wait: 900 }); const d3 = await show('title-two-slots');
  await T.tapText(/^1/, { sel: '.row, .slot, button, .btn, .tappable', wait: 500 }); await sleep(900);
  const dd = await describe(T); say('   after tapping slot 1:', dd.id, (dd.text || '').slice(0, 150)); await snap('slot1-tapped');
  const r1 = await page.evaluate(() => ({ slot: ZCore.slot, name: ZT.S && (ZT.S.zooName || ZT.S.zoo), week: ZT.S && ZT.S.week, items: ZT.S && ZT.S.items.length })); say('   continuing:', JSON.stringify(r1)); if (r1.slot !== 1) T.find('slot1:not-loaded', 'tapping slot 1 did not load it (slot=' + r1.slot + ')');
  if (r1.slot === 1 && r1.items < 3) T.find('slot1:lost', 'zoo 1 came back with only ' + r1.items + ' items');
  await toFloor(); await sleep(500);
  // ---------- 7. delete a slot ----------
  say('== DELETE');
  await T.tapXY(195, 420, 400); await T.tapText('System'); await T.tapText(/Title/i, { sel: 'button, .btn', wait: 900 }); await show('title-before-delete');
  const items = (await describe(T)).items; say('   title items:', JSON.stringify(items));
  const dp = await page.evaluate(() => { const b = [...document.querySelectorAll('.mn-del')][1]; if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, label: b.getAttribute('aria-label') }; }); say('   delete button of slot 2:', JSON.stringify(dp)); if (dp) await T.tapXY(dp.x, dp.y, 500); else T.find('delete:no-button', 'no delete button on the second filled slot');
  const dc = await show('delete-step'); say('   after delete tap:', JSON.stringify(dc.items));
  say('   confirm text:', (dc.text || '').slice(0, 160)); const keep = await page.evaluate(() => ZCore.slots().map(x => x.empty)); if (/Delete|Yes|Erase/i.test((dc.items || []).join('|'))) { await T.tapText(/^(No|Cancel)/i, { sel: 'button, .btn', wait: 500 }); const kk = await page.evaluate(() => ZCore.slots().map(x => x.empty)); say('   after No:', JSON.stringify(kk)); if (kk[1]) T.find('delete:no-cancel-fail', 'answering No to the delete question still deleted the slot'); await T.tapXY(dp.x, dp.y, 500); await T.tapText(/^(Delete|Yes|Erase)/i, { sel: 'button, .btn', wait: 700 }); } else T.find('delete:no-confirm', 'delete did not ask for confirmation: ' + JSON.stringify(dc.items));
  const sl2 = await page.evaluate(() => ZCore.slots().map(x => x.empty)); say('   slots empty after delete flow:', JSON.stringify(sl2)); await show('title-after-delete');

  say('FINDINGS (' + T.findings.length + ')'); T.findings.forEach((f, i) => say(' ' + (i + 1) + '. ' + f.msg)); say('console', JSON.stringify(T.consoleErrors), 'ZT.errors', JSON.stringify(await page.evaluate(() => ZT.errors)));
  await T.browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
