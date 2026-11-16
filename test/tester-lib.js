/* Tester helpers: touch-only driving of the real page plus invariant checks. Headless only. */
const path = require('path'), fs = require('fs');
const pw = require('./pw.js');
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html';
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch(engine, vp, opts) {
  opts = opts || {}; vp = vp || { width: 390, height: 844 };
  const browser = await pw[engine].launch();
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: opts.dsf || 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const T = { engine, browser, ctx, page, vp, findings: [], consoleErrors: [], seenScreens: new Set(), shots: [], tag: opts.tag || (engine === 'webkit' ? 'wk' : 'cr'), taps: 0, tapLog: [] };
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Access-Control-Allow-Origin|Not allowed to load local resource/.test(m.text())) T.consoleErrors.push(m.text()); });
  page.on('pageerror', e => T.consoleErrors.push('pageerror: ' + e.message));
  T.find = (key, msg, shot) => { if (T.findings.some(f => f.key === key)) return; T.findings.push({ key, msg, shot }); console.log('  FINDING [' + key + '] ' + msg + (shot ? '  (' + shot + ')' : '')); };
  T.shot = async name => { const f = 'tester-' + T.tag + '-' + name + '.png'; await page.screenshot({ path: path.join(SHOTS, f) }); T.shots.push(f); return f; };
  T.ev = (fn, arg) => page.evaluate(fn, arg);
  T.state = () => page.evaluate(() => ({ stack: ZT.stack(), running: ZT.running(), week: ZT.S ? ZT.S.week : -1, money: ZT.S ? Math.round(ZT.S.money) : 0, placing: !!(window.ZRender && ZRender.placing && ZRender.placing()), editing: !!(window.ZRender && ZRender.editing && ZRender.editing()), editBar: (() => { const b = document.getElementById('edit-bar'); return !!b && !b.hidden && b.getBoundingClientRect().height > 0; })(), reports: ZT.S ? ZT.S.reports.length : 0, speed: ZCore.speed, errors: ZT.errors.length }));
  T.goto = async (q) => { await page.goto(URL + (q === undefined ? '?play=1' : q)); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready, null, { timeout: 10000 }); await sleep(500); };
  /* find the visible tappable element in the top layer by text. returns centre box */
  T.locate = async (text, o) => {
    o = o || {};
    await module.exports.settled(T);
    return page.evaluate(({ text, o }) => {
      const layers = [...document.querySelectorAll('#screens .layer:not([hidden])')]; const root = o.floor ? document : (layers.length ? layers[layers.length - 1] : document);
      const sel = o.sel || 'button, .btn, .gbox, .row, .opt, .tab, .rcard, [role=button], .tappable';
      const re = text instanceof Object ? new RegExp(text.re, 'i') : null;
      const els = [...root.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight; });
      const norm = e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
      let m = els.filter(e => re ? re.test(norm(e)) : norm(e).toLowerCase() === String(text).toLowerCase());
      if (!m.length && !re) m = els.filter(e => norm(e).toLowerCase().includes(String(text).toLowerCase()));
      if (!m.length) return null;
      const idx = o.nth || 0; const e = m[Math.min(idx, m.length - 1)];
      e.scrollIntoView && e.scrollIntoView({ block: 'nearest' });
      const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, text: norm(e).slice(0, 60), n: m.length };
    }, { text: text instanceof RegExp ? { re: text.source } : text, o });
  };
  /* a real touch tap on a located element; returns false if not found */
  T.tapText = async (text, o) => {
    const b = await T.locate(text, o); if (!b) return false;
    await page.touchscreen.tap(b.x, b.y); T.taps++; T.tapLog.push(String(text)); await sleep((o && o.wait) || 350); return b;
  };
  T.tapXY = async (x, y, wait) => { await page.touchscreen.tap(x, y); T.taps++; T.tapLog.push('xy'); await sleep(wait || 350); };
  T.drag = async (x0, y0, x1, y1, steps) => {   // real touch drag using CDP when available (chromium), else dispatch touch events in page
    steps = steps || 8;
    if (T.engine === 'chromium') {
      const c = await T.ctx.newCDPSession(page);
      await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
      for (let i = 1; i <= steps; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }] }); await sleep(16); }
      await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await c.detach();
    } else {
      await page.evaluate(({ x0, y0, x1, y1, steps }) => {
        const t = document.elementFromPoint(x0, y0) || document.body;
        const mk = (type, x, y) => { try { const tt = new Touch({ identifier: 1, target: t, clientX: x, clientY: y }); return new TouchEvent(type, { touches: type === 'touchend' ? [] : [tt], changedTouches: [tt], bubbles: true, cancelable: true }); } catch (e) { return null; } };
        const fire = (type, x, y) => { const ev = mk(type, x, y); if (ev) t.dispatchEvent(ev); };
        fire('touchstart', x0, y0); for (let i = 1; i <= steps; i++) fire('touchmove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); fire('touchend', x1, y1);
      }, { x0, y0, x1, y1, steps });
    }
    await sleep(400);
  };
  return T;
}

/* The invariant checks, run after every tap sequence. `ctx` is a label for findings. */
async function invariants(T, label, o) {
  o = o || {};
  const page = T.page, vp = T.vp;
  const st = await T.state();
  const errs = await page.evaluate(() => ZT.errors.slice());
  if (errs.length) T.find('err:' + errs[0].slice(0, 80), 'ZT.errors after "' + label + '": ' + errs.slice(0, 3).join(' | '));
  if (T.consoleErrors.length) T.find('conerr:' + T.consoleErrors[0].slice(0, 80), 'console/page error after "' + label + '": ' + T.consoleErrors.slice(0, 3).join(' | '));
  // pause rule
  const open = st.stack.length > 0 || st.placing || st.reports > 0 && st.stack.length > 0;
  if (st.stack.length > 0 && st.running) T.find('pause:running-with-screen:' + st.stack.join('>'), 'clock RUNNING while screens open (' + st.stack.join('>') + ') after "' + label + '"');
  if ((st.editing || st.editBar) && st.running) T.find('pause:running-while-editing', 'clock RUNNING while Edit mode is on after "' + label + '"');
  if (o.expectClosed && st.stack.length === 0 && !st.placing && !st.editing && st.reports === 0 && !st.running) {
    await sleep(1300); const s2 = await T.state();
    if (!s2.running && s2.stack.length === 0 && !s2.placing && !s2.editing && s2.reports === 0) T.find('pause:stuck-paused:' + label, 'clock still PAUSED with nothing open (1.3 s later) after "' + label + '"');
  }
  const geo = await page.evaluate(() => {
    const out = { overflowX: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1, small: [], overflow: [], wrapChips: [], offscreen: [], toasts: [], vw: innerWidth, vh: innerHeight };
    const layers = [...document.querySelectorAll('#screens .layer:not([hidden])')]; const top = layers[layers.length - 1];
    const eb = document.getElementById('edit-bar'); const ebOn = eb && !eb.hidden && eb.getBoundingClientRect().height > 0;
    const roots = top ? [top, document.getElementById('placement-bar'), document.getElementById('strip')] : [document.getElementById('placement-bar'), ebOn ? eb : null, document.getElementById('strip')];
    /* Update 7: the strip's TEXT must start at least 30 px under the top inset (the iPhone status-bar fade); the star row is a picture and may sit higher */
    out.stripText = []; { const safeT = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-t')) || 0; const sp = document.getElementById('strip'); const sr = sp.getBoundingClientRect(); if (sr.height > 0 && window.ZT && ZT.S && !(ZT.stack()[0] === 'title')) { const w = document.createTreeWalker(sp, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.nodeValue.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect(); if (!r.width || !r.height) continue; const pe = n.parentElement; if (pe && getComputedStyle(pe).visibility === 'hidden') continue; if (r.top - safeT < 29.5) out.stripText.push(n.nodeValue.trim().slice(0, 16) + ' top ' + Math.round(r.top - safeT) + ' px under the inset'); } const mids = [...sp.querySelectorAll('#s-date, #s-money, #s-vis')].filter(e => e.getBoundingClientRect().height > 0).map(e => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; }); out.stripRows = mids.length && Math.max(...mids) - Math.min(...mids) > 9 ? 2 : 1;   /* one row = their middles line up (the date may use a smaller size on narrow phones) */ } }
    const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
    for (const root of roots) { if (!root) continue;
      for (const e of root.querySelectorAll('button, .btn, .gbox, .row.tappable, .opt, .tab, [role=button]')) {
        if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue;
        if (e.closest('[aria-hidden=true]')) continue;
        if (r.height < 43.5 || r.width < 43.5) out.small.push((e.innerText || e.className || e.tagName).replace(/\s+/g, ' ').slice(0, 30) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
        if (r.right > innerWidth + 1 || r.left < -1) out.offscreen.push((e.innerText || e.className).replace(/\s+/g, ' ').slice(0, 30) + ' L' + Math.round(r.left) + ' R' + Math.round(r.right));
      }
      for (const e of root.querySelectorAll('*')) {
        if (!vis(e)) continue; const cs = getComputedStyle(e);
        if (e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 2 && cs.overflow !== 'visible' && cs.display !== 'inline') out.overflow.push((e.textContent).trim().slice(0, 30) + ' sw' + e.scrollWidth + '>cw' + e.clientWidth);
        if (e.classList && e.classList.contains('chips')) { const kids = [...e.children].filter(vis); const tl = kids.map(k => k.getBoundingClientRect().top); if (tl.length && Math.max(...tl) - Math.min(...tl) > 12) out.wrapChips.push(e.innerText.replace(/\s+/g, ' ').slice(0, 40)); }
        if (e.classList && e.classList.contains('chip') && e.textContent.trim() && !e.querySelector('img')) { const r = e.getBoundingClientRect(); const lh = parseFloat(cs.lineHeight) || 16; if (r.height > lh * 1.9 + 6) out.wrapChips.push('chip wraps: ' + e.innerText.replace(/\s+/g, ' ').slice(0, 30)); }
        const r = e.getBoundingClientRect(); if (r.right > innerWidth + 2 && e.children.length === 0 && e.textContent.trim()) out.offscreen.push('text ' + e.textContent.trim().slice(0, 30) + ' R' + Math.round(r.right));
      } }
    for (const t of document.querySelectorAll('#toasts .toast')) { const r = t.getBoundingClientRect(); out.toasts.push({ text: t.textContent.slice(0, 50), top: Math.round(r.top), bottom: Math.round(r.bottom) }); }
    const strip = document.getElementById('strip').getBoundingClientRect(); out.strip = { h: Math.round(strip.height), bottom: Math.round(strip.bottom) };
    const back = top && top.querySelector('.back'); if (top && !top.querySelector('.modal, .modalcard') ) { out.back = back ? (() => { const r = back.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), visible: vis(back) && r.bottom <= innerHeight + 1 && r.top >= 0 }; })() : null; }
    out.topId = top && top.dataset && top.dataset.id; out.topCls = top && top.className;
    return out;
  });

  // round 3 symbol audit: words and letters that should have become symbols
  try {
    const hits = await page.evaluate(() => {
      const layers = [...document.querySelectorAll('#screens .layer:not([hidden])')]; const top = layers[layers.length - 1]; if (!top) return [];
      const out = []; const re = /\b(Vigor|Vigour|Wit|Wits|Energy|Smarts|Charm|Care|Science|Scouting|Scout|Hosting|Host|Cha|Vig|Sci|Sco|Male|Female|Adult|Baby|Juvenile|weeks?|wk|Lv|Level)\b/;
      const w = document.createTreeWalker(top, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (!t) continue; const e = n.parentElement; if (!e || e.closest('[hidden]')) continue; const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue; const m = t.match(re); if (m) out.push(m[1] + ' :: ' + t.slice(0, 60)); else if (/^[A-F][+-]?$/.test(t) || /^[MF]$/.test(t)) out.push('LETTER :: ' + t); }
      return out;
    });
    T.wordSeen = T.wordSeen || new Set();
    for (const h of hits) { const k = st.stack.join('>') + ' | ' + h; if (!T.wordSeen.has(k)) { T.wordSeen.add(k); try { fs.appendFileSync(path.join(SHOTS, 'tester-words-' + T.tag + '.log'), k + '\n'); } catch (e) { } } }
  } catch (e) { /* ignore */ }
  const where = label + ' [' + st.stack.join('>') + ']';
  if (geo.overflowX) T.find('overflowX:' + st.stack.join('>'), 'page scrolls horizontally on ' + where);
  if (geo.small.length) T.find('small:' + st.stack.join('>') + ':' + geo.small[0].slice(0, 20), 'tap target under 44 px on ' + where + ': ' + geo.small.slice(0, 4).join('; '));
  if (geo.overflow.length) T.find('overflow:' + st.stack.join('>') + ':' + geo.overflow[0].slice(0, 20), 'text overflows its box on ' + where + ': ' + geo.overflow.slice(0, 3).join('; '));
  if (geo.wrapChips.length) T.find('wrapchips:' + st.stack.join('>') + ':' + geo.wrapChips[0].slice(0, 20), 'chips wrap onto two lines on ' + where + ': ' + geo.wrapChips.slice(0, 3).join('; '));
  if (geo.stripText && geo.stripText.length) T.find('strip:text-high', 'top strip text sits less than 30 px under the top inset on ' + where + ': ' + geo.stripText.slice(0, 3).join('; '));
  if (geo.stripRows > 1) T.find('strip:rows', 'the date, money and visitors are on ' + geo.stripRows + ' rows, not one, on ' + where);
  if (geo.offscreen.length) T.find('offscreen:' + st.stack.join('>') + ':' + geo.offscreen[0].slice(0, 20), 'content past the screen edge on ' + where + ': ' + geo.offscreen.slice(0, 3).join('; '));
  return { st, geo };
}

module.exports = { launch, invariants, sleep, URL, SHOTS, pw, ROOT };

/* describe the top screen: id, title, visible tappables with text */
module.exports.describe = async function (T) {
  return T.page.evaluate(() => {
    const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); if (!l) return { none: true };
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; };
    const items = [...l.querySelectorAll('button, .btn, .gbox, .row.tappable, .opt, .tab')].filter(vis).map(e => (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50));
    return { id: ZT.stack().join('>'), text: l.innerText.replace(/\n+/g, ' | ').slice(0, 400), items };
  });
};

/* Round 5: one drain for every pop-up flow, deciding every arrival by tapping the flow's own buttons (varied on purpose).
   stats: sold, kept, toPen, toHab, bought, crates, hires, birthDecided, moveIn, notNow. */
module.exports.makeDrain = function (T, o) {
  o = o || {}; const page = T.page; const describe = module.exports.describe; const sleep = module.exports.sleep;
  const stats = { sold: 0, kept: 0, toPen: 0, toHab: 0, bought: 0, crates: 0, hires: 0, birthDecided: 0, moveIn: 0, moveInNotNow: 0, popups: [], arrivalSrc: {} };
  let n = 0, choiceN = 0, whereN = 0, lastPop = '', bought = false, crated = 0, hired = 0, moveN = 0;
  const maxCrates = o.maxCrates === undefined ? 1 : o.maxCrates;
  async function drain(opts) {
    opts = opts || {};
    for (let g = 0; g < 80; g++) {
      const s = await T.state(); if (!s.stack.length) { if (!s.reports) return false; await sleep(300); if (!(await T.state()).stack.length) return false; continue; }
      const id = s.stack.slice(-1)[0]; if ((s.stack[0] === 'menu' && !/^mo-|^movein$|staff-candidates/.test(id)) || s.stack[0] === 'title' || String(s.stack[0]).startsWith('newzoo')) return false; const d = await describe(T); const items = d.items || []; const txt = d.text || '';
      if (id !== lastPop) { stats.popups.push(id + '@' + s.week); }
      if (o.shot) await o.shot(id, txt, s.week);
      await module.exports.invariants(T, 'popup ' + id);
      // 1. where does it go? rows .mo-row.tap
      const rows = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return [...l.querySelectorAll('.mo-row.tap')].map((e, i) => ({ i, t: e.innerText.replace(/\s+/g, ' ').trim() })); });
      if (rows.length && /Pen/.test(rows.map(r => r.t).join('|'))) {
        const penIdx = rows.findIndex(r => /^Pen/.test(r.t)); const k = whereN++; let pick;
        if (k % 4 === 3 && penIdx >= 0) pick = penIdx; else if (rows.length > 1 && k % 4 === 2) pick = Math.min(1, rows.length - 1); else pick = 0; if (pick === penIdx) stats.toPen++; else stats.toHab++;
        if (id === 'mo-birth' || /BIRTH|ARRIVAL/.test(txt)) stats.birthDecided++;
        await T.tapText(/./, { sel: '.mo-row.tap', nth: pick, wait: 500 }); continue; }
      // 2. sell or keep
      const keep = items.find(t => /^Keep/.test(t)); const sellBtn = items.find(t => /^\$[\d,]+$/.test(t));
      if (keep) { const k = choiceN++; if (sellBtn && (k % 3 === 0)) { stats.sold++; await T.tapText(sellBtn, { sel: 'button, .btn', wait: 500 }); } else { stats.kept++; await T.tapText(/^Keep/, { sel: 'button, .btn', wait: 500 }); } lastPop = lastPop; continue; }
      // 3. callers
      if (/^mo-caller-(trader|director)/.test(id)) {
        if (!bought && s.money > 6000) { const buys = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return [...l.querySelectorAll('button, .btn')].map((e, i) => ({ t: e.innerText.replace(/\s+/g, ' ').trim() })).filter(b => /^\$[\d,]+$/.test(b.t)).map(b => +b.t.replace(/[$,]/g, '')); }); const cheap = buys.filter(p => p < s.money - 4000).sort((a, b) => a - b)[0]; if (cheap) { bought = true; stats.bought++; await T.tapText('$' + cheap.toLocaleString('en-US'), { sel: 'button, .btn', wait: 600 }); continue; } }
        if (crated < maxCrates && s.money > 3000) { const op = items.find(t => /^Open/.test(t)); if (op) { crated++; stats.crates++; await T.tapText(/^Open/, { sel: 'button, .btn', wait: 800 }); continue; } }
        await T.tapText(/Not now/i, { wait: 400 }); stats.notNow++; continue; }
      if (/^mo-caller/.test(id) && /Not now/.test(items.join('|'))) { await T.tapText(/Not now/i, { wait: 400 }); continue; }
      // 4. applicants pop-up (timed hire): pick one and Done
      if (/mo-hire/.test(id) && items.some(t => /^Hire/.test(t))) { if (hired < 2 && !(opts.noHire)) { hired++; stats.hires++; await T.tapText(/^Hire/, { sel: 'button, .btn', nth: 0, wait: 600 }); } await T.tapText(/^Done/i, { sel: 'button, .btn', wait: 500 }); continue; }
      if (/staff-candidates/.test(id)) { if (hired < 2 && !(opts.noHire) && items.some(t => /^Hire/.test(t))) { hired++; stats.hires++; await T.tapText(/^Hire/, { sel: 'button, .btn', nth: 0, wait: 600 }); } await T.tapText(/./, { sel: '.back', wait: 500 }); continue; }
      // 5. move in
      if (id === 'movein' || /Move in/.test(items.join('|'))) { if (moveN++ % 3 === 2) { stats.moveInNotNow++; await T.tapText(/^Not now/, { sel: 'button, .btn', wait: 400 }); } else { stats.moveIn++; await T.tapText(/^Move in/, { sel: 'button, .btn', wait: 500 }); } continue; }
      if (/^mo-show$/.test(id) && /Not now/.test(items.join('|'))) { await T.tapText(/Not now/i, { wait: 400 }); continue; }
      // 6. choices
      const opt = await page.evaluate(() => { const l = [...document.querySelectorAll('#screens .layer:not([hidden])')].pop(); return [...l.querySelectorAll('.opt')].map((e, i) => ({ i, dis: e.classList.contains('disabled') })); });
      if (opt.length) { const ok = opt.filter(x => !x.dis); const pk = ok.length ? ok[choiceN++ % ok.length] : opt[0]; await T.tapText(/./, { sel: '.opt', nth: pk.i, wait: 450 }); continue; }
      const b = items.find(t => /^(Continue|Done|OK|Great|Keep playing|Close)/i.test(t)); if (b) { await T.tapText(b.split(' ')[0], { wait: 450 }); continue; }
      lastPop = id; await T.tapXY(Math.round(T.vp.width / 2), Math.round(T.vp.height * 0.55), 650);
    }
    T.find('drain:loop:' + (await T.state()).stack.join('>'), 'drain gave up (stack ' + (await T.state()).stack.join('>') + ')'); await page.evaluate(() => ZT.popAll()); return true;
  }
  drain.stats = stats; return drain;
};

/* ===================== Update 7 helpers =====================
   Edit mode on the map replaces the Build / Move / Remove / Upgrade / Buy land screens. Everything here acts by real touch;
   scrollIntoView and ZRender.centerOn only move the view (as a player would by swiping) before the tap. */
module.exports.toFloor = async function (T, x, y) {   // back to the plain floor: leave placement, Edit mode and every screen, by touch
  for (let i = 0; i < 10; i++) {
    const s = await T.state(); if (!s.stack.length && !s.placing && !s.editing && !s.editBar) return true;
    if (s.stack.length) { if (!(await T.tapText(/./, { sel: '.back' }))) await T.tapXY(x || Math.round(T.vp.width / 2), y || Math.round(T.vp.height * 0.55)); continue; }
    if (s.placing) { await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button' }); continue; }
    if (s.editBar) { if (!(await module.exports.tapSel(T, '#edit-bar .mn-et.done', 500))) await module.exports.tapSel(T, '#edit-bar .mn-ea.back', 400); continue; }
    await module.exports.sleep(350);
  }
  return false;
};
module.exports.tapSel = async function (T, sel, wait, nth) {   // real touch on the nth visible element matching a selector anywhere on the page
  await module.exports.settled(T);
  const b = await T.page.evaluate(({ sel, nth }) => { const e = [...document.querySelectorAll(sel)].filter(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; })[nth || 0]; if (!e) return null; e.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, off: e.classList.contains('off') || e.classList.contains('disabled') }; }, { sel, nth });
  if (!b) return false; await T.page.touchscreen.tap(b.x, b.y); T.taps++; T.tapLog.push(sel); await module.exports.sleep(wait || 400); return b;
};
module.exports.edit = function (T) {
  const page = T.page, tapSel = (sel, wait, nth) => module.exports.tapSel(T, sel, wait, nth);
  const E = {};
  E.bar = () => page.evaluate(() => { const b = document.getElementById('edit-bar'); if (!b) return null; const r = b.getBoundingClientRect(), strip = b.querySelector('.mn-es'), fw = document.getElementById('floor-wrap').getBoundingClientRect(), cs = getComputedStyle(b);
    const safeB = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0; const btns = [...b.querySelectorAll('button')].filter(x => x.getBoundingClientRect().width > 0).map(x => ({ r: x.getBoundingClientRect(), t: x.getAttribute('aria-label') || x.textContent.trim() }));
    return { shown: !b.hidden && r.height > 0, inFloor: b.parentNode.id === 'floor-wrap', top: Math.round(r.top), bottom: Math.round(r.bottom), floorBottom: Math.round(fw.bottom), h: Math.round(r.height), bg: cs.backgroundColor, opacity: cs.opacity,
      tabs: [...b.querySelectorAll('.mn-et:not(.done)')].map(x => x.dataset.grp), tabWords: [...b.querySelectorAll('.mn-et:not(.done)')].filter(x => x.textContent.trim() || !x.querySelector('img')).map(x => x.dataset.grp), on: (b.querySelector('.mn-et.on') || { dataset: {} }).dataset.grp,
      cards: [...b.querySelectorAll('.mn-ec')].map(x => x.dataset.key + (x.classList.contains('off') ? '!' : '')), glow: [...b.querySelectorAll('.mn-glow')].map(x => x.dataset.key || x.className),
      small: btns.filter(q => q.r.width < 43.5 || q.r.height < 43.5).map(q => q.t + ' ' + Math.round(q.r.width) + 'x' + Math.round(q.r.height)), below: btns.filter(q => q.r.bottom > innerHeight - safeB + 0.5).map(q => q.t),
      vScroll: strip ? strip.scrollHeight - strip.clientHeight : 0, hScroll: strip ? strip.scrollWidth - strip.clientWidth : 0, acts: [...b.querySelectorAll('.mn-ea, .mn-eact .mn-up')].map(x => x.getAttribute('aria-label') || x.textContent.trim()), actText: (b.querySelector('.mn-eact') || { innerText: '' }).innerText.replace(/\s+/g, ' ').trim() }; });
  E.open = async (x, y) => {   // floor > menu > Edit, by touch. A tap that lands on something with its own screen is backed out of and another spot is tried
    const W = T.vp.width, H = T.vp.height; const pts = [[x || Math.round(W / 2), y || Math.round(H * 0.55)], [Math.round(W * 0.2), Math.round(H * 0.42)], [Math.round(W * 0.8), Math.round(H * 0.42)], [Math.round(W / 2), Math.round(H * 0.34)], [Math.round(W * 0.25), Math.round(H * 0.62)]]; let k = 0;
    for (let i = 0; i < 9; i++) { const b = await E.bar(); if (b && b.shown) return true; const s = await T.state(); if (s.placing) { await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button' }); continue; }
      if (!s.stack.length) { const p = pts[k++ % pts.length]; await T.tapXY(p[0], p[1], 450); continue; }
      if (s.stack[0] === 'menu' && s.stack.length === 1) { if (!(await T.tapText('Edit', { wait: 700 }))) return false; continue; }
      if (/^mo-|^movein$|confirm/.test(s.stack[s.stack.length - 1])) return false;   // a pop-up is up: the caller answers it first
      if (!(await T.tapText(/./, { sel: '.back' }))) return false; }
    const b = await E.bar(); return !!(b && b.shown);
  };
  E.card = async key => {   // show the card (through the symbol tabs, by touch) and tap it
    let b = await E.bar(); if (!b || !b.shown) return { found: false, why: 'no edit bar' }; const has = bb => bb.cards.some(c => c.replace('!', '') === key);
    if (b.acts.length) { await tapSel('#edit-bar .mn-ea.back', 400); b = await E.bar(); }
    if (!has(b)) for (const g of b.tabs) { await tapSel('#edit-bar .mn-et[data-grp="' + g + '"]', 350); b = await E.bar(); if (has(b)) break; }
    if (!has(b)) return { found: false, why: 'no card ' + key, tabs: b.tabs };
    const off = b.cards.includes(key + '!'); await tapSel('#edit-bar .mn-ec[data-key="' + key + '"]', 700); const s = await T.state(); return { found: true, off, placing: s.placing, group: b.on };
  };
  E.ghost = () => page.evaluate(() => { const p = ZRender.debug().placement; if (!p) return null; const c = ZRender.hexToClient(p.q, p.r); const bar = document.getElementById('placement-bar').getBoundingClientRect(); const note = document.getElementById('placement-note'); return { q: p.q, r: p.r, ok: p.ok, why: p.why, msg: p.msg, bad: (p.bad || []).length, ring: (p.ring || []).length, x: Math.round(c.x), y: Math.round(c.y), barTop: Math.round(bar.top), note: note.innerText, noteState: note.dataset.state }; });
  E.spot = (kind, t, o) => page.evaluate(({ kind, t, o }) => {   // a legal (or, with o.why, a refused) hex; the camera is centred on it (view only) and its screen point returned
    const S = ZT.S, out = []; for (let r = 0; r < ZD.GRID_H; r++) for (let c = 0; c < ZD.GRID_W; c++) { const [q, rr] = ZE.fromOffset(c, r); const ck = ZE.placeCheck(S, kind, t, q, rr, o.rot || 0, o.ignoreId); if (o.why ? (!ck.ok && ck.why === o.why) : ck.ok) out.push([q, rr]); }
    if (!out.length) return null; let near = o.near; if (!near) { const sp = ZE.starterSpots(); near = [sp.hab.q, sp.hab.r]; }
    const dist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;
    out.sort((a, b) => dist(a, near) - dist(b, near)); const [q, r] = out[Math.min(o.nth || 0, out.length - 1)]; ZRender.centerOn(q, r, true);
    return new Promise(res => setTimeout(() => { const p = ZRender.hexToClient(q, r); res({ x: p.x, y: p.y, q, r, n: out.length }); }, 450));
  }, { kind, t, o: o || {} });
  E.tapHex = async (q, r, wait) => { const p = await page.evaluate(({ q, r }) => { ZRender.centerOn(q, r, true); return new Promise(res => setTimeout(() => { const c = ZRender.hexToClient(q, r); res({ x: c.x, y: c.y }); }, 450)); }, { q, r }); await T.tapXY(p.x, p.y, wait || 450); return p; };
  E.place = wait => tapSel('#placement-bar .zr-place', wait || 800);
  E.endPlacement = async () => { for (let i = 0; i < 3; i++) { const s = await T.state(); if (!s.placing) return; await T.tapText(/^(Done|Cancel)$/, { floor: true, sel: '#placement-bar button', wait: 500 }); } };
  /* add one thing: card, then (unless the first ghost is already legal and no spot is asked for) tap a legal hex, then Place. Returns { ok, why, ghost } */
  E.add = async (key, o) => { o = o || {}; const kind = key.split(':')[0] === 'hab' ? 'hab' : 'fac', t = key.split(':')[1];
    if (!(await E.open())) return { ok: false, why: 'Edit mode did not open' }; const c = await E.card(key); if (!c.found) return { ok: false, why: c.why }; if (!c.placing) return { ok: false, why: c.off ? 'greyed' : 'placement did not start', off: c.off };
    let g = await E.ghost(); if (o.at) { await E.tapHex(o.at[0], o.at[1]); g = await E.ghost(); } else if (!g.ok || o.near) { const sp = await E.spot(kind, t, { near: o.near, nth: o.nth }); if (!sp) { await E.endPlacement(); return { ok: false, why: 'no legal spot' }; } await T.tapXY(sp.x, sp.y, 450); g = await E.ghost(); }
    if (o.before) await o.before(g); const n0 = await page.evaluate(() => ZT.S.items.length); await E.place(o.wait); const n1 = await page.evaluate(() => ZT.S.items.length); if (!o.leave) await E.endPlacement(); return { ok: n1 > n0, ghost: g, why: n1 > n0 ? '' : 'Place did nothing (' + (g && g.msg) + ')' }; };
  E.pick = async id => { const it = await page.evaluate(id => { const it = ZE.item(ZT.S, id); return it && [it.q, it.r]; }, id); if (!it) return false; await E.tapHex(it[0], it[1], 550); const b = await E.bar(); return !!(b && b.acts.length) && (await page.evaluate(() => ZRender.selected())) === id; };
  E.done = async () => { const b = await E.bar(); if (b && b.acts.length) await tapSel('#edit-bar .mn-ea.back', 350); return tapSel('#edit-bar .mn-et.done', 600); };
  return E;
};

/* Owner's-rules audit of what is on screen now (top layer, or the floor bars): up-and-down scrolling, see-through things, overlapping or clipped tappables.
   Returns the list of problems and records each as a finding. */
module.exports.audit = async function (T, label, o) {
  o = o || {};
  const r = await T.page.evaluate(() => {
    const layers = [...document.querySelectorAll('#screens .layer:not([hidden])')]; const top = layers[layers.length - 1]; const eb = document.getElementById('edit-bar'), pb = document.getElementById('placement-bar');
    const on = e => e && !e.hidden && e.getBoundingClientRect().height > 0; const roots = top ? [top] : [on(eb) ? eb : null, on(pb) ? pb : null, document.getElementById('strip'), document.getElementById('goal')].filter(Boolean);
    const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const out = { scrollY: [], seeThrough: [], overlap: [], clipped: [], id: ZT.stack().join('>') || 'floor' };
    const safeB = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0;
    const nm = e => (e.className && e.className.toString ? e.className.toString() : '') || e.id || e.tagName;
    for (const root of roots) {
      for (const e of [root, ...root.querySelectorAll('*')]) { if (!vis(e)) continue; const cs = getComputedStyle(e);
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 1) out.scrollY.push(nm(e) + ' ' + e.scrollHeight + '>' + e.clientHeight);
        if (+cs.opacity < 1 && +cs.opacity > 0) out.seeThrough.push('opacity ' + cs.opacity + ' on ' + nm(e).slice(0, 30));
        for (const prop of ['backgroundColor', 'color', 'borderTopColor']) { const m = /rgba\(([^)]+)\)/.exec(cs[prop]); if (m) { const a = +m[1].split(',')[3]; if (a > 0.01 && a < 0.99 && (prop !== 'borderTopColor' || parseFloat(cs.borderTopWidth) > 0) && (prop !== 'color' || [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()))) out.seeThrough.push(prop + ' ' + cs[prop] + ' on ' + nm(e).slice(0, 30)); } }
      }
      const taps = [...root.querySelectorAll('button, .btn, .gbox, .row.tappable, .opt, .tab, .mo-row.tap')].filter(vis).filter(e => !e.closest('[aria-hidden=true]'));
      /* what can actually be seen of each: cut by every clipping ancestor. Rows of a list that really scrolls may pass under a fixed foot or run past the end: that is scrolling (reported separately), not overlap or clipping */
      const seen = e => { let r = e.getBoundingClientRect(); let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom, scrolls = false; let p = e.parentElement; while (p && p !== document.body) { const cs = getComputedStyle(p); if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') { const pr = p.getBoundingClientRect(); x0 = Math.max(x0, pr.left); y0 = Math.max(y0, pr.top); x1 = Math.min(x1, pr.right); y1 = Math.min(y1, pr.bottom); if (p.scrollHeight > p.clientHeight + 1 && cs.overflowY !== 'hidden') scrolls = true; } p = p.parentElement; } return { left: x0, top: y0, right: x1, bottom: y1, width: x1 - x0, height: y1 - y0, scrolls }; };
      const rc = taps.map(e => ({ e, full: e.getBoundingClientRect(), r: seen(e), t: (e.getAttribute('aria-label') || e.innerText || nm(e)).replace(/\s+/g, ' ').slice(0, 22) })).filter(a => a.r.width > 1 && a.r.height > 1);
      for (let i = 0; i < rc.length; i++) { const a = rc[i];
        // clipped: under the bottom inset, or cut by an ancestor's edge (a sideways strip may hide cards past its end: that is scrolling, not clipping)
        if (a.r.scrolls) { /* part of a scrolling list */ } else if (a.r.top >= 0 && a.r.top < innerHeight && (a.r.bottom > innerHeight - safeB + 0.5)) out.clipped.push(a.t + ' bottom ' + Math.round(a.r.bottom) + ' > ' + Math.round(innerHeight - safeB));
        let p = a.r.scrolls ? null : a.e.parentElement; while (p && p !== document.body) { const cs = getComputedStyle(p); if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') { const pr = p.getBoundingClientRect(); const sideways = p.scrollWidth > p.clientWidth + 1; if (a.full.bottom > pr.bottom + 1.5 && a.full.top < pr.bottom && !(p.scrollHeight > p.clientHeight + 1)) out.clipped.push(a.t + ' cut at the bottom by ' + nm(p)); if (!sideways && (a.full.right > pr.right + 1.5 || a.full.left < pr.left - 1.5)) out.clipped.push(a.t + ' cut at the side by ' + nm(p)); } p = p.parentElement; }
        for (let j = i + 1; j < rc.length; j++) { const b = rc[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue; const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top); if (ox > 2 && oy > 2) out.overlap.push(a.t + ' overlaps ' + b.t + ' by ' + Math.round(ox) + 'x' + Math.round(oy)); }
      }
    }
    return out;
  });
  const where = label + ' [' + r.id + ']'; const probs = [];
  if (r.scrollY.length && !o.allowScroll) { probs.push('scrolls up and down: ' + r.scrollY.slice(0, 2).join('; ')); T.find('audit:scroll:' + r.id + ':' + label, 'up-and-down scrolling on ' + where + ': ' + r.scrollY.slice(0, 2).join('; ')); }
  if (r.seeThrough.length) { probs.push('see-through: ' + r.seeThrough.slice(0, 3).join('; ')); T.find('audit:seethrough:' + r.id + ':' + r.seeThrough[0].slice(0, 30), 'something see-through on ' + where + ': ' + r.seeThrough.slice(0, 3).join('; ')); }
  if (r.overlap.length) { probs.push('overlap: ' + r.overlap.slice(0, 3).join('; ')); T.find('audit:overlap:' + r.id + ':' + r.overlap[0].slice(0, 30), 'tappable things overlap on ' + where + ': ' + r.overlap.slice(0, 3).join('; ')); }
  if (r.clipped.length) { probs.push('clipped: ' + r.clipped.slice(0, 3).join('; ')); T.find('audit:clipped:' + r.id + ':' + r.clipped[0].slice(0, 30), 'something clipped on ' + where + ': ' + r.clipped.slice(0, 3).join('; ')); }
  return probs;
};

/* A screen ignores touches for its first 170 ms (class "entering" while it slides in). A person cannot tap that fast, a script can: wait it out before every tap by text or selector. */
module.exports.settled = function (T) { return T.page.waitForFunction(() => !document.querySelector('#screens .layer.entering'), null, { timeout: 1500 }).catch(() => 0); };
