/* Wildside Zoo: shell. Page wiring, screen stack, clock, saving, gameplay log, report queue, UI helpers. Owned by the Shell teammate.
   One global: ZCore. Needs ZD and ZE. Uses ZSprites and ZRender when they exist (every use is guarded). See docs/API-shell.md. */
(function () {
  'use strict';
  const D = window.ZD, E = window.ZE;
  const SAVE_KEY = 'wildside-zoo-v3', LEGACY_KEY = 'wildside-zoo-v3-legacy', PREV_LOG_KEY = 'wildside-zoo-v3-prevlog';
  const SAVE_V = 3, LOG_FORMAT = 1;
  const DEV_TOOLS = true;   // the one switch for developer-only features: Note for Claude, Copy log, Download log. Set false for a store build.
  const LANDSCAPE = window.matchMedia ? window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)') : null;
  const WEEK_MS = [0, 10000, 5000];          // real milliseconds per in-game week at speed 1 and 2 (about 6.7 real hours per 20 years at the owner's pace)
  const MAP_ACTIONS = { build: 1, move: 1, remove: 1, upgrade: 1, buyLand: 1 };
  const MAX_CUR_EVENTS = 800, KEEP_DETAIL_QUARTERS = 6, MAX_ARG_LEN = 80;

  let S = null, speed = 1, acc = 0, lastT = 0, lastRunning = null, timer = 0;
  let busy = null;                          // the report currently on screen (or null)
  let busySince = 0, emptyStackSince = 0, token = 0;
  let skipReports = false, dirtySave = false, saveTimer = 0, saveFailedToast = false;
  let legacy = { runs: 0, best: 0, aff: {}, combos: {}, hall: [], carry: null };
  const errors = [];
  const handlers = {};
  const stack = [];                          // entries: {id, def, layer, panel, body, titleEl, api}
  let $strip, $date, $stars, $money, $vis, $floor, $news, $screens, $toasts, $stage;

  // ------------------------------------------------------------------ small helpers
  const $ = id => document.getElementById(id);
  const hasR = () => !!(window.ZRender && typeof window.ZRender.init === 'function');
  const R = () => (hasR() ? window.ZRender : null);
  const placing = () => { const r = R(); try { return !!(r && r.placing && r.placing()); } catch (e) { return false; } };
  function recordError(e, where) { const m = (where ? where + ': ' : '') + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)); errors.push(m); if (errors.length > 50) errors.shift(); try { console.warn('[wildside]', m); } catch (x) { /* none */ } }
  window.addEventListener('error', ev => { errors.push('window: ' + (ev.message || '') + ' @' + (ev.filename || '').split('/').pop() + ':' + ev.lineno); });
  window.addEventListener('unhandledrejection', ev => { errors.push('promise: ' + (ev.reason && (ev.reason.stack || ev.reason.message) || ev.reason)); });

  // ------------------------------------------------------------------ formatting
  const MONTH3 = { January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr', May: 'May', June: 'Jun', July: 'Jul', August: 'Aug', September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec' };
  const fmt = {
    num(n) { n = Math.round(+n || 0); const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : a >= 1e7 ? (n / 1e6).toFixed(1) + 'M' : n.toLocaleString('en-US'); },
    money(n) { n = +n || 0; return (n < 0 ? '-$' : '$') + fmt.num(Math.abs(n)); },
    signs(level) { return level == null ? '?' : ['--', '-', '+', '++'][Math.max(0, Math.min(3, level | 0))]; },   // level 0..3 -> -- - + ++
    stars(n, max) { max = max || 5; n = Math.max(0, Math.min(max, n | 0)); return '★'.repeat(n) + '☆'.repeat(max - n); },
    date(St) { const s = E.dateStr(St || S), m = /^Year (\d+), (\w+) week (\d+)$/.exec(s); return m ? 'Y' + m[1] + ' ' + (MONTH3[m[2]] || m[2].slice(0, 3)) + ' w' + m[3] : s; },
    dateLong(St) { return E.dateStr(St || S); },
    duration(sec) { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? h + 'h' + String(m).padStart(2, '0') : m + 'm' + String(sec % 60).padStart(2, '0') + 's'; }
  };

  // ------------------------------------------------------------------ UI helpers
  function append(e, kids) { for (const k of kids) { if (k == null || k === false) continue; if (Array.isArray(k)) append(e, k); else e.appendChild(k.nodeType ? k : document.createTextNode(String(k))); } }
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs != null && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'cls' || k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'tap') e.addEventListener('click', v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    append(e, kids); return e;
  }
  function iconUrl(name, scale) { try { if (window.ZSprites && ZSprites.iconUrl) return ZSprites.iconUrl(name, scale || 4); } catch (e) { /* fall through */ } return null; }
  function icon(name, scale) {
    if (typeof name === 'string' && name.indexOf('data:') === 0) return el('img', { cls: 'px ico', src: name, alt: '' });
    const u = name && iconUrl(name, scale); return u ? el('img', { cls: 'px ico', src: u, alt: '' }) : el('span', { cls: 'ico ph' }, String(name || '?').replace(/^m-/, '').charAt(0).toUpperCase());
  }
  function img(url, opts) { opts = opts || {}; return el('img', { cls: 'px' + (opts.cls ? ' ' + opts.cls : ''), src: url, alt: opts.alt || '', width: opts.w, height: opts.h }); }
  function btn(label, onTap, o) {
    o = o || {}; let last = 0;
    const b = el('button', { type: 'button', cls: 'btn' + (o.cls ? ' ' + o.cls : '') + (o.disabled ? ' disabled' : '') }, o.icon ? icon(o.icon, o.iconScale) : null, el('span', { cls: 'lbl' }, label), o.sub ? el('span', { cls: 'sub' }, o.sub) : null);
    if (o.disabled) b.setAttribute('aria-disabled', 'true');
    b.addEventListener('click', ev => { if (o.disabled) { if (o.onDisabled) o.onDisabled(ev); return; } const t = performance.now(); if (t - last < 220) return; last = t; if (onTap) onTap(ev); });
    return b;
  }
  function grid(items, o) {
    o = o || {}; const g = el('div', { cls: 'grid' + (o.cls ? ' ' + o.cls : ''), style: o.cols ? { gridTemplateColumns: 'repeat(' + o.cols + ',1fr)' } : null });
    (items || []).forEach(it => {
      const b = btn(it.label, it.onTap, { icon: it.icon, iconScale: it.iconScale || 6, sub: it.sub, disabled: it.disabled, cls: 'gbox' + (it.cls ? ' ' + it.cls : '') });
      if (it.badge) b.appendChild(el('span', { cls: 'badge' }, it.badge === true ? '' : String(it.badge)));
      g.appendChild(b);
    });
    return g;
  }
  function list(rows, o) {
    const l = el('div', { cls: 'list' + (o && o.cls ? ' ' + o.cls : '') });
    (rows || []).forEach(r => {
      const left = r.img ? (r.img.nodeType ? r.img : el('span', { cls: 'portrait' }, img(r.img))) : r.icon ? el('span', { cls: 'portrait' }, icon(r.icon, 4)) : null;
      const row = el(r.onTap ? 'button' : 'div', { cls: 'row' + (r.onTap ? ' tappable' : '') + (r.cls ? ' ' + r.cls : '') + (r.disabled ? ' disabled' : ''), type: r.onTap ? 'button' : null },
        left, el('span', { cls: 'main' }, r.title != null ? el('span', { cls: 't' }, r.title) : null, r.sub != null ? el('span', { cls: 's' }, r.sub) : null, r.chips ? el('span', { cls: 'chips' }, r.chips) : null),
        r.right != null ? el('span', { cls: 'right' }, r.right) : null);
      if (r.onTap && !r.disabled) row.addEventListener('click', r.onTap);
      l.appendChild(row);
    });
    if (!rows || !rows.length) l.appendChild(el('div', { cls: 'empty' }, (o && o.empty) || 'Nothing here yet.'));
    return l;
  }
  function chipRow(items) { return el('div', { cls: 'chips' }, items); }
  function stat(label, value, kind) { return el('span', { cls: 'chip' + (kind ? ' ' + kind : '') }, el('b', label), el('span', { cls: 'v' }, value == null ? '?' : String(value))); }
  function sign(level) { const k = level == null ? 'q' : ['m2', 'm1', 'p1', 'p2'][Math.max(0, Math.min(3, level | 0))]; return el('span', { cls: 'sg ' + k }, fmt.signs(level)); }
  function stars(n, max) { max = max || 5; const w = el('span', { cls: 'stars', 'aria-label': n + ' of ' + max + ' stars' }); for (let i = 0; i < max; i++) w.appendChild(el('i', { cls: 'star' + (i < n ? '' : ' off') })); return w; }
  function flames(n, max) { max = max || 3; const w = el('span', { cls: 'flames', 'aria-label': n + ' flames' }); for (let i = 0; i < max; i++) w.appendChild(el('i', { cls: 'flame' + (i < n ? '' : ' off') })); return w; }
  function bar(frac, o) { o = o || {}; const f = Math.max(0, Math.min(1, +frac || 0)); return el('span', { cls: 'bar' + (o.cls ? ' ' + o.cls : ''), role: 'progressbar', 'aria-valuenow': Math.round(f * 100) }, el('i', { style: { width: (f * 100) + '%' } }), o.label ? el('em', o.label) : null); }
  function section(text) { return el('div', { cls: 'sec' }, text); }
  function note(text) { return el('div', { cls: 'note' }, text); }
  function tabs(items, active, onChange) {
    const w = el('div', { cls: 'tabs' });
    items.forEach(t => { const id = typeof t === 'string' ? t : t.id, label = typeof t === 'string' ? t : t.label; w.appendChild(el('button', { type: 'button', cls: 'tab' + (id === active ? ' on' : ''), tap: () => { if (id !== active && onChange) onChange(id); } }, label)); });
    return w;
  }
  function reveal(o) {   // card for reveal sequences; whole card is a tap target
    o = o || {};
    const c = el('div', { cls: 'rcard pop' + (o.tone ? ' ' + o.tone : '') + (o.cls ? ' ' + o.cls : ''), tabindex: 0 },
      o.kicker ? el('div', { cls: 'kicker' }, o.kicker) : null, o.img ? el('div', { cls: 'pic' }, o.img.nodeType ? o.img : img(o.img)) : null,
      o.title ? el('div', { cls: 'rtitle' }, o.title) : null, o.big != null ? el('div', { cls: 'big' }, o.big) : null, o.sub ? el('div', { cls: 'rsub' }, o.sub) : null, o.body || null,
      el('div', { cls: 'hint' }, o.hint === undefined ? 'Tap to continue' : o.hint));
    if (o.onTap) c.addEventListener('click', o.onTap);
    return c;
  }
  function choices(options, onPick, o) {
    o = o || {}; const wrap = el('div', { cls: 'choices n' + (options || []).length });
    (options || []).forEach((op, i) => {
      const poor = (op.cost && S && op.cost > S.money) || (op.costRp && S && op.costRp > S.rp), off = op.disabled || poor;
      const meta = [];
      if (op.cost) meta.push(el('span', { cls: 'cost' + (poor ? ' no' : '') }, fmt.money(op.cost)));
      if (op.costRp) meta.push(el('span', { cls: 'cost rp' + (S && op.costRp > S.rp ? ' no' : '') }, op.costRp + ' RP'));
      if (op.odds != null) meta.push(typeof op.odds === 'number' ? el('span', { cls: 'odds' }, bar(op.odds, { cls: 'gold' }), el('b', Math.round(op.odds * 100) + '%')) : el('span', { cls: 'odds txt' }, String(op.odds)));
      const b = btn(op.label, () => { if (onPick) onPick(i, op); }, { disabled: off, cls: 'opt' + (op.cls ? ' ' + op.cls : ''), sub: op.note });
      if (meta.length) b.appendChild(el('span', { cls: 'meta' }, meta));
      wrap.appendChild(b);
    });
    return wrap;
  }
  let toastN = 0;
  function toast(msg, kind) {
    if (!$toasts || !msg) return; const t = el('div', { cls: 'toast ' + (kind || '') }, String(msg));
    while ($toasts.children.length >= 3) $toasts.firstChild.remove();
    $toasts.appendChild(t); const id = ++toastN; void id; setTimeout(() => t.remove(), kind === 'bad' ? 3400 : 2400);
  }
  function confirm(text, onYes, o) {
    o = o || {};
    push({ id: 'confirm', modal: true, cls: 'confirm', title: o.title || null, render(body, api) {
      body.appendChild(el('div', { cls: 'ctext' }, text));
      body.appendChild(el('div', { cls: 'btnrow' }, btn(o.no || 'No', () => api.pop(), { cls: 'ghost big' }), btn(o.yes || 'Yes', () => { api.pop(); if (onYes) onYes(); }, { cls: (o.danger ? 'danger' : 'primary') + ' big' })));
    } });
  }
  const ui = { chipRow, el, btn, grid, list, stat, img, icon, sign, stars, flames, bar, section, note, tabs, reveal, choices, toast, confirm };

  // ------------------------------------------------------------------ screen stack
  function isRunning() { return !!S && !stack.length && !busy && !placing() && !(LANDSCAPE && LANDSCAPE.matches); }
  function syncRunning() { const r = isRunning(); if (r !== lastRunning) { lastRunning = r; const rr = R(); if (rr && rr.setRunning) { try { rr.setRunning(r); } catch (e) { recordError(e, 'setRunning'); } } } if (!r && !stack.length && !busy) { /* placement */ } }

  function renderEntry(en) {
    const sc = en.body.scrollTop; en.body.innerHTML = '';
    try { en.def.render(en.body, en.api); } catch (e) { recordError(e, 'screen ' + en.id); en.body.appendChild(el('div', { cls: 'empty' }, 'This screen had a problem.')); }
    en.body.scrollTop = sc;
  }
  function push(def) {
    if (!def || typeof def.render !== 'function') { recordError(new Error('push needs a render function'), 'push'); return null; }
    if (!$screens) return null;
    const id = def.id || 'screen';
    if (stack.length) stack[stack.length - 1].layer.hidden = true;
    const modal = !!def.modal;
    const body = el('div', { cls: 'pbody' }), titleEl = el('div', { cls: 'ptitle' }, def.title || '');
    const panel = el('div', { cls: 'panel' + (def.cls ? ' ' + def.cls : '') }, def.title !== undefined && def.title !== null && def.title !== '' ? titleEl : null, body);
    const layer = el('div', { cls: 'layer entering' + (modal ? ' modal' : ''), 'data-screen': id }, panel);
    const en = { id, def, layer, panel, body, titleEl, modal };
    const api = { id, def, el: layer, body, push, popAll,
      pop() { if (stack[stack.length - 1] === en) pop(); else removeEntry(en); },
      replace(d) { if (stack[stack.length - 1] === en) return replace(d); return null; },
      rerender() { renderEntry(en); }, setTitle(t) { titleEl.textContent = t; if (!titleEl.parentNode) panel.insertBefore(titleEl, body); } };
    en.api = api;
    if (!modal) panel.appendChild(el('div', { cls: 'pfoot' }, btn(def.backLabel || 'Back', () => api.pop(), { cls: 'back big' })));
    stack.push(en); $screens.appendChild(layer);
    setTimeout(() => layer.classList.remove('entering'), 170);
    tele('screens', id); log('screen', { id });
    renderEntry(en);
    if (def.onShow) { try { def.onShow(api); } catch (e) { recordError(e, 'onShow ' + id); } }
    afterStackChange(); return api;
  }
  function removeEntry(en) {
    const i = stack.indexOf(en); if (i < 0) return; const wasTop = i === stack.length - 1;
    stack.splice(i, 1); en.layer.remove();
    if (en.def.onClose) { try { en.def.onClose(en.api); } catch (e) { recordError(e, 'onClose ' + en.id); } }
    if (wasTop && stack.length) { const top = stack[stack.length - 1]; top.layer.hidden = false; renderEntry(top); if (top.def.onShow) { try { top.def.onShow(top.api); } catch (e) { recordError(e, 'onShow'); } } }
    afterStackChange();
  }
  function pop() { if (stack.length) removeEntry(stack[stack.length - 1]); }
  function popAll() { if (busy) { const b = busy; busy = null; token++; if (S) { const i = S.reports.indexOf(b); if (i >= 0) S.reports.splice(i, 1); } }   // closing everything also dismisses the report being shown
    while (stack.length) { const en = stack[stack.length - 1]; stack.pop(); en.layer.remove(); if (en.def.onClose) { try { en.def.onClose(en.api); } catch (e) { recordError(e, 'onClose'); } } } afterStackChange(); }
  function replace(def) { if (!stack.length) return push(def); const en = stack[stack.length - 1]; stack.pop(); en.layer.remove(); if (en.def.onClose) { try { en.def.onClose(en.api); } catch (e) { recordError(e, 'onClose'); } } return push(def); }
  function afterStackChange() { document.body.classList.toggle('screens-open', stack.length > 0); emptyStackSince = stack.length ? 0 : performance.now(); syncRunning(); if (!stack.length && !busy) setTimeout(flushReports, 0); }
  function rerender() { if (stack.length) renderEntry(stack[stack.length - 1]); }

  // ------------------------------------------------------------------ report queue
  function onReport(type, fn) { handlers[type] = fn; }
  function defaultCard(report, done) {
    const title = report.title || String(report.type || 'News').replace(/^./, c => c.toUpperCase());
    const lines = [];
    if (report.text) lines.push(report.text); else if (report.msg) lines.push(report.msg);
    if (!lines.length) for (const k in report) { const v = report[k]; if (k === 'type' || k === 'title') continue; if (typeof v === 'string' || typeof v === 'number') lines.push(k + ': ' + v); if (lines.length > 6) break; }
    push({ id: 'report-default', modal: true, title, cls: 'defcard', render(body, api) {
      lines.forEach(l => body.appendChild(el('div', { cls: 'ctext' }, l)));
      body.appendChild(btn('Continue', () => { api.pop(); done(); }, { cls: 'primary big' }));
    } });
  }
  function flushReports() {
    if (!S || busy || !S.reports || !S.reports.length) return;
    const report = S.reports[0]; busy = report; busySince = performance.now(); const my = ++token; syncRunning();
    log('report', { type: report.type, key: report.key || report.title || undefined });
    tele('reports', report.type);
    const done = () => {
      if (my !== token || busy !== report) return;     // ignore repeat calls
      const i = S.reports.indexOf(report); if (i >= 0) S.reports.splice(i, 1);
      busy = null; setTimeout(() => { syncRunning(); flushReports(); updateStrip(); }, 0);
    };
    if (skipReports) { done(); return; }   // test hook: ZT.skipReports = true dismisses every report at once
    const h = handlers[report.type] || handlers['*'];
    if (!h && window.ZMoments) { log('report-unhandled', { type: report.type }); done(); return; }   // the real game never shows the plain card
    try { (h || defaultCard)(report, done); } catch (e) { recordError(e, 'report ' + report.type); done(); }
  }

  // ------------------------------------------------------------------ gameplay log (kept inside the save so a reload keeps it)
  function ensureState(St) {
    if (!St.tele) St.tele = { screens: {}, acts: {}, fails: {}, reports: {} };
    if (!St.did) St.did = {};
    if (!St.fx) St.fx = []; if (!St.reports) St.reports = []; if (!St.elog) St.elog = [];
    if (!St.play) St.play = { sec: 0, bySpeed: [0, 0, 0, 0] };
    if (St.logQ == null) St.logQ = Math.floor((St.week || 0) / 12);
    if (!St.glog) St.glog = { cur: [], quarters: [], notes: [] };
  }
  function tele(group, key) { if (!S) return; const t = S.tele[group] || (S.tele[group] = {}); key = String(key).slice(0, 64); t[key] = (t[key] || 0) + 1; }
  function trimArg(a) {
    if (a == null || typeof a === 'number' || typeof a === 'boolean') return a;
    if (typeof a === 'string') return a.slice(0, MAX_ARG_LEN);
    try { const s = JSON.stringify(a); return s.length > MAX_ARG_LEN ? s.slice(0, MAX_ARG_LEN) + '...' : JSON.parse(s); } catch (e) { return '?'; }
  }
  function log(type, data) {
    if (!S || !S.glog) return; const ev = { w: S.week, t: type };
    if (data) for (const k in data) if (data[k] !== undefined) ev[k] = data[k];
    S.glog.cur.push(ev); if (S.glog.cur.length > MAX_CUR_EVENTS) S.glog.cur.splice(0, S.glog.cur.length - MAX_CUR_EVENTS);
  }
  function countEvents(evs) { const c = {}; evs.forEach(e => { const k = e.t + (e.name ? ':' + e.name : '') + (e.ok === false ? ':refused' : ''); c[k] = (c[k] || 0) + 1; }); return c; }
  function rollQuarter() {
    const q = Math.floor(S.week / 12); if (q <= S.logQ) return;
    const g = S.glog, snap = (() => { try { return E.snapshot(S); } catch (e) { return null; } })();
    g.quarters.push({ q: S.logQ + 1, weekFrom: S.logQ * 12, weekTo: S.week, snap, tele: S.tele, events: g.cur, history: undefined });
    g.cur = []; S.tele = { screens: {}, acts: {}, fails: {}, reports: {} }; S.logQ = q;
    g.quarters.forEach((qq, i) => { if (i < g.quarters.length - KEEP_DETAIL_QUARTERS && qq.events) { qq.counts = countEvents(qq.events); delete qq.events; } });
  }
  function drainEngineLog() {
    const got = E.drainLog ? E.drainLog(S) : (S.elog || []).splice(0);
    if (!got || !got.length) return;
    got.forEach(e => { const o = Object.assign({}, e); o.t = 'e:' + e.t; if (o.w == null) o.w = S.week; S.glog.cur.push(o); });
    if (S.glog.cur.length > MAX_CUR_EVENTS) S.glog.cur.splice(0, S.glog.cur.length - MAX_CUR_EVENTS);
  }
  function evLine(e) { const rest = {}; for (const k in e) if (k !== 'w' && k !== 't') rest[k] = e[k]; const s = JSON.stringify(rest); return 'w' + e.w + ' ' + e.t + (s === '{}' ? '' : ' ' + s); }
  function teleLine(t) { return Object.keys(t || {}).map(g => g + ': ' + Object.keys(t[g]).map(k => k + ' x' + t[g][k]).join(', ')).filter(l => !/: $/.test(l)).join('\n      '); }
  function logText() {
    if (!S) return '(no game)';
    const g = S.glog, p = S.play, L = [];
    L.push('WILDSIDE ZOO GAMEPLAY LOG (log format ' + LOG_FORMAT + ', save v' + SAVE_V + ')');
    L.push('zoo: ' + S.zooName + ' | run: ' + S.runId + ' | zoo number: ' + (S.ng + 1) + ' | started: ' + new Date(S.startedAt).toISOString() + ' | now: ' + new Date().toISOString());
    L.push('now: week ' + S.week + ' (' + fmt.date(S) + ') | money ' + Math.round(S.money) + ' | rp ' + Math.round(S.rp) + ' | rank ' + E.rank(S) + (S.finished ? ' | finished, free play' : ''));
    L.push('real play time: ' + fmt.duration(p.sec) + ' total; paused or in a screen ' + fmt.duration(p.bySpeed[0]) + ', speed 1 ' + fmt.duration(p.bySpeed[1]) + ', speed 2 ' + fmt.duration(p.bySpeed[2]));
    if (g.notes.length) { L.push('', 'NOTES FOR CLAUDE'); g.notes.forEach(n => L.push('  w' + n.w + ': ' + n.text)); }
    L.push('', 'QUARTERS (a quarter is 12 weeks; "events" lines are decisions, reports and engine events)');
    g.quarters.forEach(qq => {
      L.push('Q' + qq.q + ' weeks ' + qq.weekFrom + '-' + qq.weekTo); if (qq.snap) L.push('  snapshot ' + JSON.stringify(qq.snap));
      const t = teleLine(qq.tele); if (t) L.push('  tele ' + t);
      if (qq.events) qq.events.forEach(e => L.push('    ' + evLine(e))); else if (qq.counts) L.push('  counts ' + JSON.stringify(qq.counts));
    });
    L.push('', 'CURRENT QUARTER (from week ' + S.logQ * 12 + ')'); const t = teleLine(S.tele); if (t) L.push('  tele ' + t);
    g.cur.forEach(e => L.push('    ' + evLine(e)));
    try { L.push('', 'LIVE SNAPSHOT ' + JSON.stringify(E.snapshot(S))); } catch (e) { /* ignore */ }
    return L.join('\n');
  }
  function copyLog() {
    if (!DEV_TOOLS) return Promise.resolve(false);
    const text = logText();
    const fallback = () => { try { const ta = el('textarea', { style: { position: 'fixed', left: '-999px', top: '0' } }); ta.value = text; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; } };
    const say = ok => { toast(ok ? 'Log copied (' + Math.ceil(text.length / 1024) + ' KB)' : 'Could not copy. Use Download log.', ok ? 'good' : 'bad'); return ok; };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => say(true), () => say(fallback()));
    return Promise.resolve(say(fallback()));
  }
  function downloadLog() {
    if (!DEV_TOOLS) return false;
    try {
      const blob = new Blob([logText()], { type: 'text/plain' }), url = URL.createObjectURL(blob), a = el('a', { href: url, download: 'wildside-zoo-log-' + (S ? S.runId : 'x') + '-w' + (S ? S.week : 0) + '.txt' });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Log downloaded', 'good'); return true;
    } catch (e) { toast('Could not download. Use Copy log.', 'bad'); return false; }
  }
  function addNote(text) { if (!DEV_TOOLS) return false; text = String(text || '').trim().slice(0, 600); if (!text || !S) return false; S.glog.notes.push({ w: S.week, text }); log('note', { text }); queueSave(); toast('Note saved in the log', 'good'); return true; }
  function logScreen() {
    return push({ id: 'log', title: 'Game log', render(body, api) {
      if (!DEV_TOOLS) { body.appendChild(note('Nothing to show here.')); return; }
      body.appendChild(note('Everything you do is written down here, so it can be pasted into a chat to tune the game.'));
      body.appendChild(el('div', { cls: 'btnrow' }, btn('Copy log', () => copyLog(), { cls: 'primary big' }), btn('Download', () => downloadLog(), { cls: 'blue big' })));
      body.appendChild(note('Size: ' + Math.ceil(logText().length / 1024) + ' KB'));
      body.appendChild(section('Note for Claude'));
      const ta = el('textarea', { cls: 'field', rows: 3, placeholder: 'Something to remember or fix...', maxlength: 600 });
      body.appendChild(ta); body.appendChild(btn('Add note', () => { if (addNote(ta.value)) { ta.value = ''; api.rerender(); } }, { cls: 'big' }));
      if (S.glog.notes.length) { body.appendChild(section('Notes so far')); body.appendChild(list(S.glog.notes.slice(-6).reverse().map(n => ({ title: n.text, sub: 'week ' + n.w })))); }
    } });
  }

  // ------------------------------------------------------------------ saving
  function queueSave() { dirtySave = true; if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = 0; if (dirtySave) save(); }, 2500); }
  function save() {
    if (!S) return false;
    try {
      const doc = { v: SAVE_V, savedAt: Date.now(), week: S.week, zoo: S.zooName, runId: S.runId, speed, json: E.serialize(S) };
      localStorage.setItem(SAVE_KEY, JSON.stringify(doc)); dirtySave = false; return true;
    } catch (e) { if (!saveFailedToast) { saveFailedToast = true; toast('Could not save on this device', 'bad'); } recordError(e, 'save'); return false; }
  }
  function load() {
    let doc = null;
    try { const raw = localStorage.getItem(SAVE_KEY); doc = raw ? JSON.parse(raw) : null; } catch (e) { doc = null; }
    if (!doc || doc.v !== SAVE_V || typeof doc.json !== 'string') return false;
    let St; try { St = E.deserialize(doc.json); } catch (e) { recordError(e, 'load'); return false; }
    if (!St) return false;
    if (E.SAVE_VERSION && St.v !== E.SAVE_VERSION) return false;
    S = St; ensureState(S); busy = null; token++; acc = 0;
    if (doc.speed === 1 || doc.speed === 2) speed = doc.speed;
    afterNewState(); return true;
  }
  function saveLegacy() { try { localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy)); return true; } catch (e) { return false; } }
  function loadLegacy() { try { const raw = localStorage.getItem(LEGACY_KEY); if (raw) legacy = Object.assign(legacy, JSON.parse(raw)); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------------ new game, strip, ticks
  function afterNewState() {
    popAll(); busy = null; token++;
    const r = R(); if (r) { try { if (r.reset) r.reset(); if (r.mapChanged) r.mapChanged(); } catch (e) { recordError(e, 'ZRender.reset'); } }
    lastRunning = null; updateStrip(); syncRunning(); setTimeout(flushReports, 0);
  }
  function newGame(opts) {
    if (S) { try { localStorage.setItem(PREV_LOG_KEY, logText()); } catch (e) { /* ignore */ } }
    S = E.newGame(legacy, opts || {}); ensureState(S); S.elog = []; acc = 0;
    log('start', { zoo: S.zooName, ng: S.ng }); afterNewState(); save(); return S;
  }
  function updateStrip() {
    if (!S || !$strip) return;
    $date.textContent = fmt.date(S); $money.textContent = fmt.money(S.money); $money.className = 'v' + (S.money < 0 ? ' neg' : '');
    $vis.textContent = fmt.num(S.visitorsLast || 0) + '/wk';
    const max = D.RANK_REP.length, rk = Math.max(1, E.rank(S)); const ex = $stars.getAttribute('data-n');
    if (ex !== String(rk)) { $stars.setAttribute('data-n', rk); $stars.innerHTML = ''; $stars.appendChild(stars(rk, max)); }
    const n = S.news && S.news[0]; const txt = n ? n.msg : ''; if ($news.textContent !== txt) { $news.textContent = txt; $news.className = n ? (n.kind || '') : ''; }
  }
  function doTick() {
    if (!S) return;
    try { E.tick(S); } catch (e) { recordError(e, 'tick'); toast('Something went wrong this week', 'bad'); return; }
    drainEngineLog(); rollQuarter(); if (S.week % 4 === 0) save();
    updateStrip(); flushReports();
  }
  function act(name, ...args) {
    if (!S) return { ok: false, msg: 'No game running.' };
    const fn = E[name]; let res;
    if (typeof fn !== 'function') { res = { ok: false, msg: 'Unknown action ' + name }; }
    else { try { res = fn(S, ...args); } catch (e) { recordError(e, 'act ' + name); res = { ok: false, msg: 'Something went wrong.' }; } }
    const isRes = res && typeof res === 'object' && 'ok' in res, okk = isRes ? !!res.ok : true;
    const ev = { name, args: args.map(trimArg), ok: okk }; if (!okk && res && res.msg) ev.msg = String(res.msg).slice(0, 80);
    log('act', ev); tele('acts', name);
    if (okk) S.did[name] = (S.did[name] || 0) + 1; else { tele('fails', name + ': ' + String(res && res.msg || '').slice(0, 48)); if (res && res.msg) toast(res.msg, 'bad'); }
    if (okk && (MAP_ACTIONS[name] || (res && res.map))) { const r = R(); if (r && r.mapChanged) { try { r.mapChanged(); } catch (e) { recordError(e, 'mapChanged'); } } }
    drainEngineLog(); updateStrip(); queueSave(); flushReports();
    return res;
  }
  function setSpeed(n) { n = n === 2 ? 2 : 1; if (n === speed) return speed; acc = acc * WEEK_MS[n] / WEEK_MS[speed]; speed = n; log('speed', { to: n }); tele('acts', 'speed' + n); queueSave(); return speed; }

  function loop() {
    const now = performance.now(); let dt = now - lastT; lastT = now; if (dt > 1000) dt = 1000;
    if (!S || document.hidden) return;
    const run = isRunning();
    S.play.sec += dt / 1000; S.play.bySpeed[run ? speed : 0] += dt / 1000;
    if (busy && !stack.length && now - emptyStackSince > 900 && emptyStackSince && now - busySince > 900) { log('report-released', { type: busy.type }); const b = busy; busy = null; token++; const i = S.reports.indexOf(b); if (i >= 0) S.reports.splice(i, 1); flushReports(); }
    if (run) { acc += dt; const ms = WEEK_MS[speed]; if (acc >= ms) { acc = acc > ms * 2 ? 0 : acc - ms; doTick(); } }
    if (run !== lastRunning) syncRunning();
  }

  // ------------------------------------------------------------------ boot and hooks
  function openMenu() {
    if (stack.length || busy || placing()) return;
    if (window.ZMenus && typeof ZMenus.open === 'function') { try { ZMenus.open(); } catch (e) { recordError(e, 'ZMenus.open'); } return; }
    push({ id: 'menu', title: 'Menu', backLabel: 'Play', render(body, api) {
      body.appendChild(note('The real menu goes here.'));
      body.appendChild(grid([
        { icon: 'm-system', label: speed === 1 ? 'Speed 1x' : 'Speed 2x', sub: 'tap to change', onTap: () => { setSpeed(speed === 1 ? 2 : 1); api.rerender(); } },
        { icon: 'm-info', label: 'Log', onTap: () => logScreen() },
        { icon: 'm-system', label: 'Save', onTap: () => toast(save() ? 'Saved' : 'Not saved', save() ? 'good' : 'bad') },
        { icon: 'm-projects', label: 'New zoo', onTap: () => confirm('Start a new zoo? The current one is replaced.', () => newGame({}), { danger: true, yes: 'New zoo' }) }
      ]));
    } });
  }
  function onFloorTap(info) { if (stack.length || busy || placing()) return; log('tap', info && info.item ? { item: info.item.id != null ? info.item.id : undefined } : undefined); openMenu(); }

  function build() {
    $strip = $('strip'); $date = $('s-date'); $stars = $('s-stars'); $money = $('s-money'); $vis = $('s-vis'); $floor = $('floor'); $news = $('news'); $screens = $('screens'); $toasts = $('toasts'); $stage = $('stage');
    if (!$strip || !$screens) throw new Error('Page markup missing (index.html)');
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && stack.length && !stack[stack.length - 1].modal) pop(); });
    document.addEventListener('gesturestart', ev => ev.preventDefault());
    document.addEventListener('contextmenu', ev => { if (!/^(TEXTAREA|INPUT)$/.test(ev.target.tagName)) ev.preventDefault(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else lastT = performance.now(); });
    window.addEventListener('pagehide', () => save());
  }
  function placeholderFloor() {
    const w = $floor.clientWidth || 390, h = $floor.clientHeight || 600; $floor.width = Math.round(w / 3); $floor.height = Math.round(h / 3);
    const g = $floor.getContext('2d'); g.fillStyle = '#6fae4f'; g.fillRect(0, 0, $floor.width, $floor.height); g.fillStyle = '#62a045';
    for (let y = 0; y < $floor.height; y += 8) for (let x = (y / 8 % 2) * 8; x < $floor.width; x += 16) g.fillRect(x, y, 8, 4);
  }
  function applyTheme() {
    try { const P = window.ZSprites && ZSprites.PALETTE; if (!P) return; const m = { blue: '--blue', blueDark: '--blue-d', gold: '--gold', goldDark: '--gold-d', bad: '--red', good: '--green', goodDark: '--green-d' }, st = document.documentElement.style; for (const k in m) if (typeof P[k] === 'string') st.setProperty(m[k], P[k]); } catch (e) { /* keep css defaults */ }
  }
  function boot() {
    applyTheme(); build(); loadLegacy();
    if (!load()) newGame({});
    const r = R(); if (r) { try { r.init($floor, { getState: () => S, onTap: onFloorTap }); if (r.mapChanged) r.mapChanged(); } catch (e) { recordError(e, 'ZRender.init'); } }
    else { placeholderFloor(); $floor.addEventListener('click', () => onFloorTap({})); window.addEventListener('resize', placeholderFloor); }   // no renderer yet: plain green floor, tap still opens the menu
    lastT = performance.now(); lastRunning = null; updateStrip(); syncRunning();
    timer = setInterval(loop, 50); document.documentElement.setAttribute('data-ready', '1');
  }

  const Core = {
    version: '0.1', devTools: DEV_TOOLS, fmt, ui, WEEK_MS, errors,
    get S() { return S; }, get speed() { return speed; }, get legacy() { return legacy; }, get busy() { return !!busy; },
    newGame, save, load, setSpeed, act, push, pop, popAll, replace, rerender, stack: () => stack.map(e => e.id), top: () => (stack.length ? stack[stack.length - 1].api : null),
    openMenu, onReport, flushReports, running: isRunning, saveLegacy,
    log, logText, copyLog, downloadLog, addNote, updateStrip, weekProgress: () => (WEEK_MS[speed] ? Math.min(1, acc / WEEK_MS[speed]) : 0),
    screens: { log: logScreen }, toast, boot
  };
  window.ZCore = Core;
  window.ZT = {
    get skipReports() { return skipReports; }, set skipReports(v) { skipReports = !!v; },
    get S() { return S; }, errors, stack: Core.stack, act, newGame, openMenu, running: isRunning, setSpeed, WEEK_MS,
    tick(n) { for (let i = 0; i < (n || 1); i++) doTick(); return S ? S.week : 0; },
    popAll, flush: flushReports, logText, save, load
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
