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
  T.state = () => page.evaluate(() => ({ stack: ZT.stack(), running: ZT.running(), week: ZT.S.week, money: Math.round(ZT.S.money), placing: !!(window.ZRender && ZRender.placing && ZRender.placing()), reports: ZT.S.reports.length, speed: ZCore.speed, errors: ZT.errors.length }));
  T.goto = async (q) => { await page.goto(URL + (q || '')); await page.waitForFunction(() => window.ZT && document.documentElement.dataset.ready, null, { timeout: 10000 }); await sleep(500); };
  /* find the visible tappable element in the top layer by text. returns centre box */
  T.locate = async (text, o) => {
    o = o || {};
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
  if (o.expectClosed && st.stack.length === 0 && !st.placing && st.reports === 0 && !st.running) {
    await sleep(1300); const s2 = await T.state();
    if (!s2.running && s2.stack.length === 0 && !s2.placing && s2.reports === 0) T.find('pause:stuck-paused:' + label, 'clock still PAUSED with nothing open (1.3 s later) after "' + label + '"');
  }
  const geo = await page.evaluate(() => {
    const out = { overflowX: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1, small: [], overflow: [], wrapChips: [], offscreen: [], toasts: [], vw: innerWidth, vh: innerHeight };
    const layers = [...document.querySelectorAll('#screens .layer:not([hidden])')]; const top = layers[layers.length - 1];
    const roots = top ? [top, document.getElementById('placement-bar'), document.getElementById('strip')] : [document.getElementById('placement-bar')];
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
        if (e.classList && e.classList.contains('chips')) { const kids = [...e.children].filter(vis); const tops = new Set(kids.map(k => Math.round(k.getBoundingClientRect().top))); if (tops.size > 1) out.wrapChips.push(e.innerText.replace(/\s+/g, ' ').slice(0, 40)); }
        if (e.classList && e.classList.contains('chip')) { const r = e.getBoundingClientRect(); const lh = parseFloat(cs.lineHeight) || 16; if (r.height > lh * 1.9 + 6) out.wrapChips.push('chip wraps: ' + e.innerText.replace(/\s+/g, ' ').slice(0, 30)); }
        const r = e.getBoundingClientRect(); if (r.right > innerWidth + 2 && e.children.length === 0 && e.textContent.trim()) out.offscreen.push('text ' + e.textContent.trim().slice(0, 30) + ' R' + Math.round(r.right));
      } }
    for (const t of document.querySelectorAll('#toasts .toast')) { const r = t.getBoundingClientRect(); out.toasts.push({ text: t.textContent.slice(0, 50), top: Math.round(r.top), bottom: Math.round(r.bottom) }); }
    const strip = document.getElementById('strip').getBoundingClientRect(); out.strip = { h: Math.round(strip.height), bottom: Math.round(strip.bottom) };
    const back = top && top.querySelector('.back'); if (top && !top.querySelector('.modal, .modalcard') ) { out.back = back ? (() => { const r = back.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), visible: vis(back) && r.bottom <= innerHeight + 1 && r.top >= 0 }; })() : null; }
    out.topId = top && top.dataset && top.dataset.id; out.topCls = top && top.className;
    return out;
  });
  const where = label + ' [' + st.stack.join('>') + ']';
  if (geo.overflowX) T.find('overflowX:' + st.stack.join('>'), 'page scrolls horizontally on ' + where);
  if (geo.small.length) T.find('small:' + st.stack.join('>') + ':' + geo.small[0].slice(0, 20), 'tap target under 44 px on ' + where + ': ' + geo.small.slice(0, 4).join('; '));
  if (geo.overflow.length) T.find('overflow:' + st.stack.join('>') + ':' + geo.overflow[0].slice(0, 20), 'text overflows its box on ' + where + ': ' + geo.overflow.slice(0, 3).join('; '));
  if (geo.wrapChips.length) T.find('wrapchips:' + st.stack.join('>') + ':' + geo.wrapChips[0].slice(0, 20), 'chips wrap onto two lines on ' + where + ': ' + geo.wrapChips.slice(0, 3).join('; '));
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
