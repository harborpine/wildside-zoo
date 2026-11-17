/* Wildside Zoo: menus. The main menu and every sub-screen. Owned by the Menus teammate.
   One global: ZMenus. Built on ZCore (screen stack, ui helpers, act) and docs/API-rules.md. See docs/API-menus.md. */
(function () {
  'use strict';
  const D = window.ZD, E = window.ZE, Core = window.ZCore;
  const ui = Core.ui, fmt = Core.fmt, el = ui.el, money = fmt.money;
  const S = () => Core.S;
  const push = def => Core.push(def);

  // ------------------------------------------------------------------ small helpers
  const safe = fn => { try { return fn() || null; } catch (e) { return null; } };
  const aUrl = (a, sc) => safe(() => ZSprites.animalUrl(a.sp, { variant: !!a.variant, juv: E.isJuv(S(), a) }, sc || 2));
  const spUrl = (id, o, sc) => safe(() => ZSprites.animalUrl(id, o || {}, sc || 2));
  const pUrl = (kind, sc) => safe(() => ZSprites.personUrl(kind, {}, sc || 3));
  const iUrl = (n, sc) => safe(() => ZSprites.iconUrl(n, sc || 4));
  const bUrl = (id, sc) => safe(() => ZSprites.buildingUrl(id, sc || 2));
  const tUrl = (kind, sc) => safe(() => ZSprites.tileUrl(kind, sc || 1));
  const itemUrl = it => (it.k === 'hab' ? tUrl('hab:' + it.t, 1) : bUrl(it.t, 2));
  const imgEl = (url, cls) => (url ? ui.img(url, { cls: cls || '' }) : null);
  const span = (cls, ...k) => el('span', { cls }, ...k);
  const pct = p => Math.round(p * 100) + '%';
  const habs = () => S().items.filter(i => i.k === 'hab');
  const itemName = it => (it.k === 'hab' ? E.habName(S(), it) : D.FAC[it.t].name);
  const fitLevel = r => (r < 0.6 ? 0 : r < 0.9 ? 1 : r < 1.2 ? 2 : 3);
  const needMoney = n => 'Need ' + money(n);
  const starsOn = n => { const w = el('span', { cls: 'stars mn-stars' }); for (let i = 0; i < n; i++) w.appendChild(el('i', { cls: 'star' })); return w; };
  // Tiny pixel icons drawn here (no matching art exists for them): up and down arrows, a back arrow, a cross.
  const PIX = {
    up: ['....##....', '...####...', '..######..', '.########.', '...####...', '...####...', '...####...', '...####...'],
    down: ['...####...', '...####...', '...####...', '...####...', '.########.', '..######..', '...####...', '....##....'],
    left: ['....##....', '...###....', '..########', '.#########', '.#########', '..########', '...###....', '....##....'],
    remove: ['.##.......##.', '####.....####', '.####...####.', '..####.####..', '...#######...', '....#####....', '....#####....', '...#######...', '..####.####..', '.####...####.', '####.....####', '.##.......##.']
  };
  const pixCache = {};
  function pixIcon(name, color, scale) {
    const k = name + color + scale; if (pixCache[k]) return pixCache[k];
    const rows = PIX[name], w = rows[0].length, h = rows.length, c = document.createElement('canvas'); c.width = w + 2; c.height = h + 2;
    const g = c.getContext('2d'); [['#3b2a1a', 1, 1], [color, 0, 0]].forEach(p => { g.fillStyle = p[0]; rows.forEach((r, y) => { for (let x = 0; x < w; x++) if (r[x] === '#') g.fillRect(x + p[1], y + p[2], 1, 1); }); });
    const o = document.createElement('canvas'); o.width = c.width * scale; o.height = c.height * scale; const og = o.getContext('2d'); og.imageSmoothingEnabled = false; og.drawImage(c, 0, 0, o.width, o.height);
    return (pixCache[k] = o.toDataURL());
  }
  // Symbols instead of words (docs/API-shell.md: ui.astat, ui.skillChip, ui.grade, ui.sym, ui.cost).
  const mny = v => ui.cost({ money: v }), rpc = v => ui.cost({ rp: v }), wkc = v => ui.cost({ weeks: v });
  const clk = v => span('mn-cnt', ui.sym('time', { scale: 2, label: 'Weeks', text: 'wk' }), ' ' + v);
  const capChip = (icon, word, v) => el('span', { cls: 'chip iconchip mn-capchip' }, ui.sym(icon, { scale: 2, label: word, text: word.slice(0, 2) }), span('mn-cap', word), el('span', { cls: 'v' }, String(v)));
  const A = (k, v) => ui.astat(k, v), K = (k, v) => ui.skillChip(k, v);
  const ASTATS = ['charm', 'vigor', 'wit'], SKILLS = ['care', 'sci', 'exp', 'charm'];
  const aIcon = k => (D.ASTAT && D.ASTAT[k] && D.ASTAT[k].icon) || 'stat-' + k;
  const kIcon = k => (D.SKILL && D.SKILL[k] && D.SKILL[k].icon) || 'skill-' + k;
  const sexSym = a => ui.sym('sex-' + (a.sex === 'F' ? 'f' : 'm'), { scale: 2, label: a.sex === 'F' ? 'Female' : 'Male', text: a.sex });
  const cnt = (icon, v) => span('mn-cnt', imgEl(iUrl(icon, 2), 'mn-mini'), ' ' + v);
  // Buying comparison (engine lookup ZE.compareOwned): new species, other sex, better, worse, mixed.
  function cmpBadge(x) {
    if (!E.compareOwned) return null; let c = null; try { c = E.compareOwned(S(), x); } catch (e) { return null; } if (!c) return null;
    const a = x.a || x, w = (icon, label) => span('mn-cmp', imgEl(icon, ''), label || '');
    if (!c.haveSpecies) return ui.sym('new', { scale: 2, label: 'New species', text: 'New!' });
    if (!c.haveSameSex) return span('mn-cmp', sexSym(a), '+');
    if (c.better === 'yes') return w(pixIcon('up', '#58b84a', 2));
    if (c.better === 'no') return w(pixIcon('down', '#e0584a', 2));
    return span('mn-cmp', '+-');
  }
  // How many people against the staff cap, big and plain; solid orange-red when full. Next rank's cap beside it when it grows.
  function staffCapChip() {
    const s = S(), cap = E.staffCap(s), n = s.staff.length, full = n >= cap, rk = E.rank(s), nx = D.STAFF_CAP && D.STAFF_CAP[rk + 1];
    return el('div', { cls: 'mn-staffcap' + (full ? ' full' : ''), role: 'status', 'aria-label': 'Staff ' + n + ' of ' + cap }, imgEl(iUrl('m-staff', 3)), span('', n + ' / ' + cap), full ? span('tag', 'Full') : null,
      nx && nx > cap ? span('nx', 'Rank ' + (rk + 1) + ': ' + nx) : null);
  }
  const inCh = () => { try { return !!(Core.inChallenge && Core.inChallenge()); } catch (e) { return false; } };
  const allowMsg = (what, id) => { try { const r = E.allowed && E.allowed(S(), what, id); return r && r.ok === false ? (r.msg || 'Not here') : ''; } catch (e) { return ''; } };
  const allow = (what, id) => !allowMsg(what, id);
  const short = n => (fmt.short ? fmt.short(n) : fmt.num(n));
  const symS = (k, label, sc) => ui.sym(k, { scale: sc || 2, label: label || '', text: '' });
  const lvBox = n => el('span', { cls: 'mn-lv', title: 'Level ' + n, 'aria-label': 'Level ' + n }, String(n));   // a staff level: the number in a small gold box
  const lockSub = () => symS('lock', 'Locked');
  const pn = (a, one, many) => a + ' ' + (a === 1 ? one : many);

  // A short, fixed set of boxes fills the panel and never scrolls: rows share the height, icons shrink a little on short screens.
  function fitGrid(items, cols, rowMin, fixed) {
    const g = ui.grid(items, { cols, cls: 'mn-fitgrid' + (fixed ? ' mn-fixedgrid' : '') }), rowsN = Math.ceil(items.length / cols);
    g.style.gridTemplateRows = fixed ? 'repeat(' + rowsN + ', ' + rowMin + 'px)' : 'repeat(' + rowsN + ', minmax(' + (rowMin || 0) + 'px, 1fr))';
    if (fixed) g.style.flex = 'none';
    items.forEach((it, i) => { if (it && it.disabled && it.why && g.children[i]) g.children[i].addEventListener('click', guard(() => ui.toast(it.why, 'bad'))); });   // a greyed box still says why
    return g;
  }
  function guard(fn) { let last = 0; return function (ev) { const t = performance.now(); if (t - last < 300) return; last = t; return fn(ev); }; }

  function row(o) {
    const left = o.img ? el('span', { cls: 'portrait' }, typeof o.img === 'string' ? ui.img(o.img) : o.img) : null;
    const main = el('span', { cls: 'main' }, o.title != null ? el('span', { cls: 't' }, o.title) : null, o.sub != null ? el('span', { cls: 's' }, o.sub) : null, o.extra || null);
    const right = o.right != null ? el('span', { cls: 'right' }, o.right) : null;
    const cls = 'row mn-r' + (o.cls ? ' ' + o.cls : '') + (o.off ? ' disabled' : '');
    if (o.act) {
      if (o.line) return (() => { const hit = el('button', { type: 'button', cls: 'mn-hit' }, left, main, right); if (o.tap && !o.off) hit.addEventListener('click', guard(o.tap)); return el('div', { cls: cls + ' mn-split wrap' }, hit, o.act, el('div', { cls: 'mn-line' }, o.line)); })();
      const hit = el('button', { type: 'button', cls: 'mn-hit' }, left, main, right);
      if (o.tap && !o.off) hit.addEventListener('click', guard(o.tap));
      return el('div', { cls: cls + ' mn-split' }, hit, o.act);
    }
    if (o.tap && !o.off) { const b = el('button', { type: 'button', cls: cls + ' tappable' }, left, main, right); b.addEventListener('click', guard(o.tap)); return b; }
    return el('div', { cls }, left, main, right);
  }
  const rows = (list, empty) => el('div', { cls: 'list' }, list.length ? list : el('div', { cls: 'empty' }, empty || 'Nothing here.'));
  const kv = (k, v) => el('div', { cls: 'mn-kv' }, span('k', k), span('v', v));
  const why = t => el('span', { cls: 'mn-why' }, typeof t === 'string' && /^(Needs?|Rank|Research|Limit|Level|Top)/.test(t) ? ui.sym('lock', { scale: 2, label: 'Locked', text: '' }) : null, t);

  function reveal(api, o, then) { api.replace({ id: o.id || 'result', modal: true, render(b, a2) { b.appendChild(ui.reveal(Object.assign({}, o, { onTap: () => { if (then) then(a2); else a2.pop(); } }))); } }); }
  // Run fn once no report or reveal is on screen or waiting, so a result card is never closed by the screen that caused it.
  function later(fn, n) { n = n || 0; const st = S(); if ((Core.busy || (st.reports && st.reports.length)) && n < 400) { setTimeout(() => later(fn, n + 1), 150); return; } fn(); }
  function openAt(fn) { Core.popAll(); open(); if (fn) fn(); }

  // ------------------------------------------------------------------ styles
  (function injectCss() {
    if (document.getElementById('mn-css')) return;
    const css = `
.layer .panel,.layer .pbody{min-width:0}.row.mn-r .t{white-space:normal}.row.mn-r .main{overflow:hidden}
.btn.danger .sub{color:#ffe0dc}
.mn-sc .chip{margin:1px}.mn-sc .chip b{padding:4px 3px;font-size:10px}.mn-sc .chip .v{padding:4px 3px;min-width:20px;font-size:13px}
.mn-cl{display:flex;flex-wrap:nowrap;align-items:center;gap:5px;white-space:nowrap;margin-top:1px;padding:2px 2px 3px}.mn-cl .chip img.sym{height:18px;width:auto}
.mn-cl .chip{margin:0;font-size:12px}.mn-cl .chip b{padding:4px 3px;font-size:10px}.mn-cl .chip .v{padding:4px 3px;min-width:18px;font-size:13px}.mn-cl .mn-grade{margin-left:4px}
.row.mn-split.wrap{flex-wrap:wrap}.row.mn-split .mn-line{flex:1 0 100%;padding:0 4px 4px}
.grid.mn-fitgrid{flex:1 1 auto;min-height:0;gap:8px}
.mn-fitgrid .btn.gbox{min-height:0;height:100%;margin:0;padding:2px;gap:2px}
.mn-fitgrid .gbox .ico{height:clamp(22px,7.5vh,72px);width:auto;max-width:80%}
@media (max-height:640px){.mn-fitgrid .gbox .sub{display:none}}
.pbody.mn-tight{padding:8px 10px;gap:8px}
.mn-setrow{display:flex;align-items:center;gap:8px}.mn-setrow .mn-lab{flex:none;width:58px;font-size:14px;color:var(--ink2)}.mn-setrow .tabs{flex:1}
.modal .panel.mn-title{flex:1 1 auto;height:100%;background:linear-gradient(#8fd3f4 0,#bfe9ff 34%,#8fd06a 34%,#6fae4f 100%)}
.mn-title .pbody{justify-content:flex-start;gap:6px}
.mn-logo{display:flex;flex-direction:column;align-items:center;gap:2px;padding-top:2px}.mn-logo img{image-rendering:pixelated;display:block;width:auto;height:auto}.mn-logo .lg1{max-width:94%;max-height:clamp(30px,8.5vh,80px)}.mn-logo .lg2{max-width:48%;max-height:clamp(36px,10.5vh,100px)}
@media (max-height:700px){.mn-cont{display:none}.mn-scene{display:none}.mn-logo .lg1{max-height:5vh}.mn-logo .lg2{max-height:7.5vh}.mn-slot,.mn-slothit{min-height:52px!important}.mn-sinfo .mn-sline:nth-child(3){display:none}.mn-sname{font-size:16px}.mn-del{width:44px;height:44px}.mn-title .pbody{gap:4px}.mn-slots{gap:8px}}
.mn-ports{flex:none;display:flex;align-items:flex-end}.mn-port{height:clamp(30px,5.5vh,44px);width:auto;max-width:56px;image-rendering:pixelated}.mn-cont{flex:none;margin-left:8px;font-size:11px;background:var(--green);color:#fff;padding:1px 6px;vertical-align:middle}.mn-slot.recent{box-shadow:0 0 0 3px var(--green-d),0 5px 0 3px #8d7a52}
.mn-scene{display:flex;align-items:flex-end;justify-content:center;gap:0;min-height:30px;border-bottom:6px solid #3f7d34}.mn-scene img{image-rendering:pixelated;max-height:clamp(30px,7vh,70px);max-width:21%;width:auto;height:auto}
.mn-slots{display:flex;flex-direction:column;gap:clamp(6px,1.6vh,12px);margin-top:clamp(2px,1vh,8px)}
.mn-slot{display:flex;align-items:center;background:var(--paper);box-shadow:0 0 0 3px var(--bd),0 5px 0 3px #8d7a52;min-height:clamp(58px,10.5vh,78px);border:0;padding:0;font:inherit;color:var(--ink)}
button.mn-slot.empty{width:100%;gap:12px;padding:6px 10px;background:var(--cream2);cursor:pointer;font-weight:700;font-size:18px;text-align:left}
.mn-slothit{flex:1;min-width:0;display:flex;align-items:center;gap:10px;min-height:clamp(58px,10.5vh,78px);padding:6px 8px;border:0;background:none;font:inherit;font-weight:700;color:inherit;text-align:left;cursor:pointer}
.mn-sn{flex:none;width:34px;height:34px;line-height:34px;text-align:center;background:var(--gold);color:var(--ink);font-weight:700;font-size:18px;box-shadow:0 0 0 2px var(--bd)}
.mn-sinfo{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.mn-sname{display:flex;align-items:center;font-size:18px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mn-sline{font-size:13px;color:var(--ink2);display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.mn-del{flex:none;width:44px;height:44px;margin:0 8px 0 14px;border:0;background:var(--cream2);box-shadow:0 0 0 2px var(--line);display:flex;align-items:center;justify-content:center;cursor:pointer}
.mn-name{font-size:18px;text-align:center;min-height:52px}
.mn-coach{display:flex;align-items:center;gap:6px;min-height:44px;padding:0 0 0 10px;background:#ffe27a;box-shadow:0 0 0 3px var(--bd);font-size:14px;font-weight:700;color:var(--ink);position:absolute;top:6px;left:6px;right:6px;z-index:15;pointer-events:none}
.mn-coach .mn-ct{flex:1;min-width:0}.mn-coach .mn-skip{pointer-events:auto;flex:none;min-width:56px;min-height:44px;border:0;background:var(--paper);font:inherit;font-weight:700;font-size:13px;color:var(--ink2);cursor:pointer;box-shadow:-2px 0 0 var(--bd)}
.mn-coach.inpanel{position:static;flex:none;margin:6px 6px 0;pointer-events:auto}
@keyframes mnglow{0%{outline-color:#ffcf33}50%{outline-color:#fff}100%{outline-color:#ffcf33}}
.mn-glow{outline:4px solid #ffcf33;outline-offset:-4px;animation:mnglow .9s steps(2) infinite}
.mn-capwrap{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}.mn-slot.recent .mn-sn{background:var(--green);color:#fff}
.row.mn-r{min-height:50px;padding:3px 8px 3px 4px;margin:0}.row.mn-r .portrait{width:40px;height:40px}.row.mn-r .portrait img{max-width:36px;max-height:36px}.list{gap:4px}
.mn-fixedgrid .gbox .ico{height:30px!important}.mn-fixedgrid .btn.gbox{gap:0;line-height:1.1;padding:2px}.mn-fixedgrid .btn.gbox .sub{display:block!important;font-size:12px;min-height:14px}
.mn-run .sym{height:16px;width:auto}.mn-run .portrait{width:38px;height:38px}
.mn-ag{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}
.mn-at{display:flex;align-items:center;gap:4px;min-height:44px;padding:3px 4px;background:var(--paper);box-shadow:0 0 0 2px var(--line);border:0;font:inherit;color:var(--ink);cursor:pointer;text-align:left;min-width:0}
.mn-at .pt{flex:none;width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:#bfe0a0}.mn-at .pt img{max-width:30px;max-height:30px;image-rendering:pixelated}
.mn-at .inf{display:flex;flex-direction:column;gap:2px;min-width:0}.mn-at .c3,.mn-at .c2{display:flex;align-items:center;gap:2px;white-space:nowrap}
.mn-at .chip.iconchip{padding:0 2px 0 1px;gap:1px}.pbody.mn-tight .sec{margin-top:0;padding:2px 8px}.mn-at .chip{margin:0;font-size:11px}.mn-at .chip .v{padding:1px 2px;min-width:12px;font-size:11px}.mn-at .chip img.sym{height:12px;width:auto;margin:0 1px}.mn-at .sym{height:13px;width:auto}
.mn-runlist{overflow-y:auto;min-height:0;flex:1 1 0}.mn-run .bar{height:6px;min-width:0;box-shadow:0 0 0 1px var(--bd)}.mn-run .main{gap:4px}.mn-runtop{display:flex;align-items:center;justify-content:space-between;gap:8px}.mn-runtop .t{flex:1;min-width:0}
@media (max-width:360px){.row.mn-split{flex-wrap:wrap}.row.mn-split .mn-hit{flex:1 1 100%}.row.mn-split>.btn{flex:1 0 100%;margin:2px 0 4px}.mn-cl{flex-wrap:wrap}.mn-cl .chip{max-width:100%}}
.mn-key{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--ink2);justify-content:center}.mn-cap{font-size:11px;padding:0 4px;color:var(--ink2);display:flex;align-items:center}.mn-capchip{align-items:center}.mn-legend .lg2{display:flex;align-items:center;gap:8px;min-height:34px}
.mn-pool{display:flex;flex-wrap:wrap;gap:4px;justify-content:center}.mn-pool img{height:34px;width:auto;image-rendering:pixelated;background:#bfe0a0;box-shadow:0 0 0 2px var(--bd);padding:2px}.mn-cmp{display:inline-flex;align-items:center;gap:1px;font-weight:700;font-size:12px}.mn-cmp img{height:14px;width:auto}
.mn-staffcap{display:flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:4px 12px;background:var(--paper);box-shadow:0 0 0 3px var(--bd);font-size:24px;font-weight:700}.mn-staffcap img{height:30px;width:auto;image-rendering:pixelated}.mn-staffcap .nx{font-size:12px;font-weight:600;color:var(--ink2)}.mn-staffcap.full{background:#e0703a;color:#fff;box-shadow:0 0 0 3px #8a3b12}.mn-staffcap.full .nx{color:#ffe3d0}.mn-staffcap .tag{font-size:13px;background:#8a3b12;color:#fff;padding:2px 8px}
.mn-hh{display:flex;align-items:center;gap:6px}.mn-hh .sec{flex:1;margin:0;min-width:0}
.mn-up{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:44px;min-width:92px;padding:2px 8px;border:0;font:inherit;font-weight:700;font-size:14px;color:var(--ink);background:var(--paper);box-shadow:0 0 0 3px var(--bd);cursor:pointer;white-space:nowrap}
.mn-up img{height:16px;width:auto;image-rendering:pixelated}.mn-up.gold{background:#ffcf33;box-shadow:0 0 0 3px #8a6a00}.mn-up.off{background:#cfc3a6;color:#6b5a3c;box-shadow:0 0 0 3px #8d7a52;font-size:12px}
.mn-hsec{position:relative;padding:3px;display:flex;flex-direction:column;gap:4px}
.mn-hsec.drop-ok{box-shadow:0 0 0 3px #2f8a3a;background:#e2f3d3}.mn-hsec.drop-ok.hover{background:#b9e39a}.mn-hsec.drop-no{box-shadow:0 0 0 3px #8d7a52;background:#ddd4bd}.mn-hsec.drop-no.hover{background:#c9bfa3}
.mn-hsec[data-tag]::after{content:attr(data-tag);position:absolute;right:6px;bottom:4px;background:#2f8a3a;color:#fff;font-size:12px;padding:1px 6px}
.mn-at.mn-lifted{background:#bdb08c;box-shadow:0 0 0 2px #8d7a52}.mn-at.mn-lifted *{visibility:hidden}
.mn-ghost{position:fixed;z-index:80;pointer-events:none;margin:0;background:var(--paper);box-shadow:0 0 0 3px var(--bd),4px 8px 0 0 #6b5a3c;transform:scale(1.08);animation:mnpop .18s steps(3)}
@keyframes mnpop{0%{transform:scale(1)}50%{transform:scale(1.16)}100%{transform:scale(1.08)}}
.mn-gtag{position:absolute;left:0;top:100%;margin-top:4px;background:#3b2a1a;color:#fff;font-size:12px;padding:2px 8px;white-space:nowrap;display:none}
.mn-dropbar{position:absolute;left:0;right:0;z-index:40;background:var(--cream2);box-shadow:0 -3px 0 0 var(--bd);padding:6px;display:flex;flex-direction:column;gap:6px}
.mn-dtrow{display:flex;gap:8px}.mn-dhabs{display:flex;gap:6px;flex-wrap:wrap}
.mn-dt{flex:1;min-height:56px;display:flex;align-items:center;justify-content:center;gap:8px;padding:4px 8px;font-weight:700;font-size:15px;background:#e2f3d3;box-shadow:0 0 0 3px #2f8a3a}.mn-dt img{height:26px;width:auto;image-rendering:pixelated}
.mn-dt.sell{background:#ffe0a8;box-shadow:0 0 0 3px #b56f10}.mn-dt.drop-no{background:#ddd4bd;box-shadow:0 0 0 3px #8d7a52;color:#6b5a3c}.mn-dt.hover{background:#b9e39a}.mn-dt.sell.hover{background:#ffcf6a}.mn-dt.hab{flex:1 1 40%;min-height:44px;font-size:13px}
@keyframes mnshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
.mn-shake{animation:mnshake .35s steps(4)}
.mn-cnt{display:inline-flex;align-items:center;gap:2px}.mn-legend{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 10px}.mn-legend .lg{display:flex;align-items:center;gap:8px;min-height:34px;font-size:14px}.mn-legend .lg .sym{height:26px;width:auto}.mn-legend .lg img.sym{height:26px}
.mn-hit{flex:1;min-width:0;display:flex;align-items:center;gap:10px;min-height:56px;padding:0;margin:0;border:0;background:none;text-align:left;font:inherit;font-weight:700;color:inherit;cursor:pointer}
.row.mn-split{padding-right:4px}.row.mn-split>.btn{flex:none;margin:0;min-width:84px}
.mn-stars{filter:none}
.mn-hot{box-shadow:0 0 0 3px var(--gold-d),inset 0 -3px 0 #ece0bd!important;background:#fff3b8}
.mn-on{box-shadow:0 0 0 3px var(--blue)!important;background:#e6f4ff}
.mn-why{font-size:12px;color:var(--red-d);font-weight:700}
.mn-grade{font-size:15px;font-weight:700;color:var(--ink2)}
.mn-kv{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;background:var(--paper);box-shadow:0 0 0 2px var(--line);min-height:44px}
.mn-kv .k{color:var(--ink2);font-size:14px}.mn-kv .v{font-size:16px;text-align:right}
.mn-mini{height:26px;width:auto;image-rendering:pixelated}
.mn-pic{display:flex;justify-content:center;align-items:flex-end;gap:8px;min-height:96px;padding:6px;background:#bfe0a0;box-shadow:0 0 0 3px var(--bd)}
.mn-pic img{image-rendering:pixelated;max-height:120px;max-width:46%}
.mn-pic.one img{max-width:90%}
.mn-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.mn-st{display:flex;flex-direction:column;align-items:center;padding:6px 2px;background:var(--paper);box-shadow:0 0 0 3px var(--bd)}
.mn-st b{font-size:12px;color:#fff;width:100%;text-align:center;padding:2px 0}
.mn-st .n{font-size:28px;font-weight:700;line-height:1.1}.mn-st i{font-style:normal;font-size:13px;color:var(--ink2)}
.mn-st.charm b{background:var(--charm)}.mn-st.vigor b{background:var(--vigor)}.mn-st.wit b{background:var(--wit)}
.mn-odd{display:grid;grid-template-columns:92px 1fr 44px;align-items:center;gap:8px;min-height:26px}
.mn-odd .p{text-align:right;font-size:14px}.mn-odd .nm{font-size:12px;color:var(--ink2)}
.mn-team{display:flex;justify-content:center;gap:8px}.mn-team img{height:54px;image-rendering:pixelated}
.mn-book{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.mn-cell{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:2px;min-height:92px;padding:4px 2px;border:0;background:var(--paper);box-shadow:0 0 0 2px var(--line);font:inherit;font-weight:700;color:var(--ink);cursor:pointer}
.mn-cell .im{height:50px;display:flex;align-items:center}.mn-cell img{max-height:50px;max-width:76px;image-rendering:pixelated}
.mn-cell .nm{font-size:11px;line-height:1.1;text-align:center;word-break:break-word}
.mn-cell.new{background:#fff3b8}.mn-sil{filter:brightness(0) invert(.38)}
.mn-fit{display:grid;gap:4px;align-items:center}.mn-fit .h{display:flex;justify-content:center}.mn-fit .h img{height:22px;max-width:100%;image-rendering:pixelated}
.mn-fit .tn{font-size:12px;line-height:1.1}.mn-fit .c{display:flex;justify-content:center;min-height:30px;align-items:center}
.mn-fit .sg{min-width:0;padding:2px 2px;font-size:12px}
.mn-yr{display:grid;grid-template-columns:34px 38px 1fr 1fr 40px;gap:6px;align-items:center;padding:8px 8px;background:var(--paper);box-shadow:0 0 0 2px var(--line);font-size:13px;min-height:40px}
.mn-yr.h{background:var(--ink2);color:#fff;font-size:11px;text-transform:uppercase}.mn-yr .r{text-align:right}
.mn-lg{display:flex;align-items:center;gap:8px;font-size:14px;min-height:30px}
.mn-box{width:16px;height:16px;flex:none;background:#fff;box-shadow:0 0 0 2px var(--bd)}.mn-box.ok{background:var(--green)}
.mn-rank{display:grid;grid-template-columns:30px 1fr auto;gap:8px;align-items:center;padding:8px;background:var(--paper);box-shadow:0 0 0 2px var(--line);min-height:40px}
.mn-rank.me{background:#fff3b8;box-shadow:0 0 0 3px var(--gold-d)}
.mn-wide{grid-column:1/-1}
.mn-pips{display:flex;gap:6px;justify-content:center}.mn-pips i{width:22px;height:22px;background:#6b5a3c;box-shadow:0 0 0 2px var(--bd)}.mn-pips i.on{background:var(--gold)}
.mn-big{font-size:22px;text-align:center}
.mn-sticky{display:flex;flex-direction:column;gap:6px}
.mn-lv{display:inline-block;min-width:18px;padding:0 4px;margin:2px 3px 3px;background:var(--gold);color:var(--ink);box-shadow:0 0 0 2px var(--bd);font-size:12px;line-height:16px;font-weight:700;text-align:center;vertical-align:middle}
.mn-albox{display:inline-block;width:34px;height:26px;background:var(--paper);box-shadow:0 0 0 2px var(--bd)}
.mn-best{height:16px;width:auto;margin-left:2px}
.mn-bigchips .chip{font-size:16px;margin:2px}.mn-bigchips .chip .v{font-size:18px;padding:4px 8px;min-width:30px}.mn-bigchips .chip img.sym{height:24px;width:auto;margin:2px 4px}
#edit-bar{position:absolute;left:0;right:0;bottom:0;z-index:6;display:flex;flex-direction:column;gap:6px;padding:8px calc(8px + var(--safe-r)) calc(8px + var(--safe-b)) calc(8px + var(--safe-l));background:var(--cream2);box-shadow:0 -3px 0 0 var(--bd);box-sizing:border-box}
#edit-bar[hidden]{display:none}
.mn-etabs{display:flex;gap:8px}
.mn-et{flex:1 1 0;min-width:44px;min-height:48px;margin:0;padding:2px;border:0;display:flex;align-items:center;justify-content:center;gap:4px;background:var(--paper);box-shadow:0 0 0 3px var(--bd);font:inherit;font-weight:700;font-size:15px;color:var(--ink);cursor:pointer}
.mn-et img{height:28px;width:auto;image-rendering:pixelated}.mn-et.on{background:#ffcf33}.mn-et.done{flex:1.6 1 0;background:var(--green);color:#fff}.mn-et.done img{height:20px}
.mn-es{display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;padding:3px;touch-action:pan-x;overscroll-behavior:contain}
.mn-ec{flex:none;width:78px;min-height:82px;margin:0;padding:3px 2px;border:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:2px;background:var(--paper);box-shadow:0 0 0 3px var(--bd);font:inherit;font-weight:700;color:var(--ink);cursor:pointer}
.mn-ec .im{height:50px;display:flex;align-items:center;justify-content:center}.mn-ec .im img{max-height:50px;max-width:70px;width:auto;height:auto;image-rendering:pixelated}
.mn-ec .pr,.mn-ea .pr{display:flex;align-items:center;gap:2px;font-size:13px;line-height:1;white-space:nowrap}.mn-ec .pr img,.mn-ea .pr img{height:14px;width:auto}
.mn-ec.off{background:#cfc3a6;box-shadow:0 0 0 3px #8d7a52}.mn-ec.off .pr{color:#8a2a20}
.mn-eact{display:flex;gap:8px;align-items:stretch;padding:3px}
.mn-ewho{flex:none;width:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:12px;font-weight:700}.mn-ewho>img{max-height:44px;max-width:60px;image-rendering:pixelated}.mn-ewho .mn-mini{height:14px}
.mn-ea{flex:1 1 0;min-width:44px;min-height:72px;margin:0;padding:2px;border:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:var(--paper);box-shadow:0 0 0 3px var(--bd);font:inherit;font-weight:700;color:var(--ink);cursor:pointer}
.mn-ea>img{height:34px;width:auto;image-rendering:pixelated}.mn-ea.sell{background:#ffe0a8;box-shadow:0 0 0 3px #b56f10}.mn-ea.back{flex:0 0 48px;background:var(--cream2)}.mn-ea.back>img{height:24px}.mn-ea.off{background:#cfc3a6;box-shadow:0 0 0 3px #8d7a52;color:#6b5a3c}
.mn-eact .mn-up{flex:1 1 0;min-width:44px;min-height:72px;flex-direction:column;gap:3px;padding:2px;font-size:13px;white-space:normal;text-align:center}.mn-eact .mn-up>img{height:26px}.mn-eact .mn-up.off{font-size:11px}
.mn-xhead{display:flex;align-items:center;gap:8px;min-height:40px;padding:2px 8px;background:var(--paper);box-shadow:0 0 0 2px var(--line);font-weight:700}
.mn-xreg{height:32px;width:auto;max-width:56px;image-rendering:pixelated}.mn-xname{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mn-xteam{display:flex;align-items:flex-end}.mn-xteam img{height:34px;width:auto;image-rendering:pixelated}
.mn-xstars{display:flex;gap:6px}
.mn-xs{flex:1 1 0;min-width:44px;min-height:60px;margin:0;padding:2px;border:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:var(--paper);box-shadow:0 0 0 3px var(--bd);font:inherit;font-weight:700;color:var(--ink);cursor:pointer}
.mn-xs .n{display:flex;align-items:center;gap:2px;font-size:22px;line-height:1}.mn-xs .n img{height:18px;width:auto}.mn-xs .lk{display:flex;align-items:center;gap:1px;font-size:13px;line-height:1}.mn-xs .lk img{height:14px;width:auto}
.mn-xs.on{background:#ffcf33;box-shadow:0 0 0 3px #8a6a00}.mn-xs.off{background:#cfc3a6;box-shadow:0 0 0 3px #8d7a52;color:#6b5a3c}.mn-xs.off .n{font-size:16px}.mn-xs.off .n img{height:13px}
.mn-xinfo{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mn-xinfo .c{display:flex;align-items:center;justify-content:center;gap:4px;min-height:44px;background:var(--paper);box-shadow:0 0 0 2px var(--line);font-size:20px;font-weight:700}.mn-xinfo .c img{height:24px;width:auto}
.mn-xodds{display:flex;flex-direction:column;gap:2px;padding:4px 8px;background:var(--paper);box-shadow:0 0 0 2px var(--line)}.mn-xodds .mn-odd{min-height:28px}.mn-xodds .mn-odd.me .p{font-size:17px}
.btn.mn-send{flex:none}
.mn-pick{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.mn-pick.themes{grid-template-columns:repeat(2,minmax(0,1fr));flex:none;grid-auto-rows:52px}@media (max-height:720px){.mn-pick.themes{grid-auto-rows:44px}}.mn-pick.themes.c3{grid-template-columns:repeat(3,minmax(0,1fr))}
.mn-pk{min-width:44px;min-height:44px;margin:0;padding:2px 3px;border:0;display:flex;align-items:center;justify-content:center;gap:3px;background:var(--paper);box-shadow:0 0 0 2px var(--line);font:inherit;font-weight:700;color:var(--ink);cursor:pointer}
.mn-pk.host{flex-direction:column;min-height:58px}.mn-pk.host img{height:30px;width:auto;image-rendering:pixelated}.mn-pk.host .chip{margin:0;font-size:12px}.mn-pk.host .chip img.sym{height:14px;width:auto}.mn-pk.host .chip .v{padding:1px 3px;font-size:12px;min-width:14px}
.mn-pk.theme{justify-content:space-between;text-align:left;padding:2px 6px}.mn-pk.theme .tn{font-size:13px;line-height:1.1;min-width:0}.mn-pk.theme .fs{flex:none;display:flex;align-items:center;gap:2px}.mn-pk.theme .fs img{height:14px;width:auto}.mn-pk.theme .sg{min-width:22px;padding:2px 3px;font-size:12px}.mn-pick.c3 .mn-pk.theme{padding:2px 4px;gap:2px}.mn-pick.c3 .mn-pk.theme .tn{font-size:12px}
.mn-pk.on{background:#ffcf33;box-shadow:0 0 0 3px #8a6a00}
.mn-steps{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:2px;padding:3px 3px 5px}.mn-stp{display:inline-flex;align-items:center;font-size:13px}.mn-pips.sm{justify-content:flex-start;gap:4px}.mn-pips.sm i{width:16px;height:16px}
.mn-vips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.mn-vip{min-height:64px;margin:0;padding:2px;border:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:var(--paper);box-shadow:0 0 0 2px var(--line);font:inherit;font-weight:700;color:var(--ink2);cursor:pointer}.mn-vip>img:first-child{height:36px;width:auto;image-rendering:pixelated}.mn-vip .sym{height:14px;width:auto}.mn-vip.seen{background:#e2f3d3}.mn-vip .q{font-size:14px;line-height:14px}
button.mn-slot.mn-chal{width:100%;gap:10px;padding:4px 10px;min-height:52px;background:#e9defc;cursor:pointer;font-weight:700;font-size:18px;text-align:left}.mn-chi{height:34px;width:auto;image-rendering:pixelated;flex:none}.mn-chal .mn-new{flex:1;min-width:0}.mn-chs{flex:none;display:flex;align-items:center;font-size:15px}.mn-chs img{height:16px;width:auto}
.mn-lvline{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;flex:none}
.mn-lvc{min-width:44px;margin:0;padding:4px 1px;border:0;display:flex;flex-direction:column;align-items:center;gap:5px;background:var(--paper);box-shadow:0 0 0 2px var(--line);font:inherit;font-weight:700;color:var(--ink);cursor:pointer}
.mn-lvc .num{width:30px;height:30px;line-height:30px;text-align:center;font-size:20px;background:#b99cf0;color:#2a1b0e;box-shadow:0 0 0 2px var(--bd)}
.mn-lvc .goal{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:15px;line-height:1}.mn-lvc .goal>img{height:26px;width:auto}.mn-lvc .gv{display:flex;align-items:center;gap:1px}.mn-lvc .gv img{height:16px;width:auto}
.mn-lvc .rs{display:flex;flex-direction:column;align-items:flex-start;gap:3px;font-size:12px;line-height:1;min-height:88px}.mn-lvc .ln{display:flex;align-items:center;gap:3px;white-space:nowrap}.mn-lvc .ln img{height:14px;width:auto;image-rendering:pixelated}.mn-lvc .ln img.tile{height:18px;max-width:30px}
.mn-s3{display:flex;gap:1px;justify-content:center}.mn-s3 img{height:15px;width:auto}
.mn-lvc.on{background:#ffcf33;box-shadow:0 0 0 3px #8a6a00}.mn-lvc.off{background:#cfc3a6;box-shadow:0 0 0 2px #8d7a52;color:#6b5a3c}.mn-lvc.off .num{background:#a89c82}
@media (max-width:350px){.mn-lvc .rs{font-size:11px}.mn-lvc .ln img{height:12px}.mn-lvc .num{width:26px;height:26px;line-height:26px;font-size:17px}}
`;
    const st = document.createElement('style'); st.id = 'mn-css'; st.textContent = css; document.head.appendChild(st);
  })();

  // ------------------------------------------------------------------ main menu
  function open() { push(mainDef()); }
  function mainDef() {
    return { id: 'menu', title: 'Menu', backLabel: 'Play', render(body) {
      body.classList.add('mn-tight'); const s = S();
      const waiting = (s.arrivals ? s.arrivals.length : 0) + s.projects.filter(p => p.choice).length + (s.happening && s.happening.options ? 1 : 0) + (s.yearly ? 1 : 0) + (s.show ? 1 : 0);
      const pen = E.holding(s).length;
      body.appendChild(fitGrid([
        { icon: iUrl('m-projects', 6), label: 'Projects', alert: waiting > 0, onTap: projectsScreen },
        { icon: iUrl('edit', 6), label: 'Edit', onTap: () => editMode() },
        { icon: iUrl('m-animals', 6), label: 'Animals', alert: pen > 0, onTap: () => animalsScreen(!habs().length && pen ? 'pen' : 'zoo') },
        { icon: iUrl('m-staff', 6), label: 'Staff', sub: s.staff.length + '/' + E.staffCap(s), alert: !!((s.candidates && s.candidates.length) || s.headhunt), onTap: staffScreen },
        { icon: iUrl('m-research', 6), label: 'Research', alert: researchReady() > 0, onTap: researchScreen },
        { icon: iUrl('m-info', 6), label: 'Info', onTap: infoScreen },
        { icon: iUrl('m-system', 6), label: 'System', cls: 'mn-wide', onTap: systemScreen }
      ], 2));
    } };
  }

  // ------------------------------------------------------------------ decisions (fallbacks when Moments is missing)
  function decisionScreen(o) {   // o: {id, title, text, who, options, resolve(i) -> result}
    push({ id: o.id || 'decision', title: o.title, render(body, api) {
      if (o.who) body.appendChild(el('div', { cls: 'center' }, imgEl(pUrl(o.who, 4))));
      if (o.text) body.appendChild(el('div', { cls: 'ctext' }, o.text));
      body.appendChild(ui.choices(o.options, i => {
        const r = o.resolve(i); if (!r || !r.ok) return;
        reveal(api, { kicker: o.title, title: r.good === false ? 'Not this time' : 'Done', sub: r.text, tone: r.good === false ? 'bad' : 'good' });
      }));
    } });
  }
  function showChoice(pid) {
    if (window.ZMoments && ZMoments.showChoice) { ZMoments.showChoice(pid); return; }
    const p = E.project(S(), pid); if (!p || !p.choice) { ui.toast('Nothing to decide.'); return; }
    const c = p.choice;
    decisionScreen({ id: 'choice', title: c.title, text: c.text, who: c.who, options: c.options, resolve: i => Core.act('resolveChoice', pid, i) });
  }
  function happeningScreen() {
    const h = S().happening; if (!h || !h.options) return;
    decisionScreen({ id: 'happening', title: h.title, text: h.text, who: h.who, options: h.options, resolve: i => Core.act('resolveHappening', i) });
  }

  // ------------------------------------------------------------------ PROJECTS
  function expStatus() {
    const s = S(), out = s.projects.filter(p => p.type === 'expedition').length;
    if (!allow('expedition')) return { ok: false, why: lockSub() };
    if (!D.BIOME_ORDER.some(b => s.regions[b] && allow('expedition', b))) return { ok: false, why: 'No region' };
    if (out >= E.maxExp(s)) return { ok: false, why: 'Convoy is out' };
    if (!E.freeStaff(s).length) return { ok: false, why: 'No one free' };
    return { ok: true, why: 'Ready' };
  }
  function pairList() {
    const s = S(), out = [];
    habs().forEach(h => {
      const an = E.inHab(s, h.id);
      for (let i = 0; i < an.length; i++) for (let j = i + 1; j < an.length; j++) {
        if (an[i].sp !== an[j].sp || an[i].sex === an[j].sex) continue;
        out.push({ hab: h, a: an[i], b: an[j], why: E.breedCheck(s, an[i].id, an[j].id) });
      }
    });
    return out;
  }
  const shortWhy = t => (/rest/i.test(t) ? ['Rest ', clk((/(\d+)/.exec(t) || [])[1] || '')] : /young/i.test(t) ? 'Too young' : /paired|busy/i.test(t) ? 'Already busy' : t.split(' ').slice(0, 4).join(' '));
  function eventHabs() { return habs().map(h => ({ hab: h, why: E.eventCheck(S(), h.id) })); }

  const shortRegion = r => (D.BIOMES[r] && D.BIOMES[r].name) || r;
  function runRow(p) {
    const s = S(), info = (p.type === 'hire' || p.type === 'campaign') ? p : E.projectInfo(s, p), lead = p.staff && p.staff.length ? E.staffer(s, p.staff[0]) : null;
    let img = null, name = info.detail;
    if (p.type === 'hire') { img = pUrl('headhunter', 2); name = info.detail || 'Hiring'; }
    else if (p.type === 'campaign') { img = iUrl('rep', 3); name = p.name; }
    else if (p.type === 'expedition') { img = pUrl(lead ? lead.role : 'explorer', 2); name = p.star ? [shortRegion(p.region), ' ', String(p.star), symS('star-on', 'Stars')] : shortRegion(p.region); }
    else if (p.type === 'breed') { const a = E.animal(s, p.a); img = a ? aUrl(a, 2) : null; name = a ? E.sp(a).name : info.detail; }
    else { img = iUrl('ready-event', 3); name = D.THEMES[p.theme] ? D.THEMES[p.theme].name : info.detail; }
    const b = el('button', { type: 'button', cls: 'row mn-r mn-run tappable' + (info.choice ? ' mn-hot' : '') },
      el('span', { cls: 'portrait' }, imgEl(img)),
      el('span', { cls: 'main' }, el('span', { cls: 'mn-runtop' }, span('t', name), info.choice ? imgEl(iUrl('choice', 3), 'mn-mini') : wkc(info.weeksLeft)), ui.bar(info.progress)));
    b.addEventListener('click', guard(() => (p.type === 'hire' ? staffScreen() : p.type === 'campaign' ? campaignScreen() : info.choice ? showChoice(p.id) : projectScreen(p.id))));
    return b;
  }
  function projectsScreen() {
    push({ id: 'projects', title: 'Projects', render(body) { body.classList.add('mn-tight'); body.style.overflowY = 'hidden';
      const s = S(), open = E.isOpen ? E.isOpen(s) : true;
      const ex = expStatus(), pairs = pairList().filter(x => !x.why), free = E.freeStaff(s).length;
      const evs = eventHabs().filter(x => !x.why), cost = E.eventCost(s);
      const evWhy = evs.length ? (!free ? 'No one' : s.money < cost ? needMoney(cost) : '') : (habs().length ? 'None' : 'No habitat');
      const camps = E.campaigns(s), runningC = camps.filter(c => c.weeksLeft > 0).length;
      const g = fitGrid([
        { icon: pUrl('explorer', 4), label: 'Expedition', sub: ex.ok ? '' : typeof ex.why === 'string' ? ex.why.replace('Convoy is out', 'Out').replace('No one free', 'No one') : ex.why, disabled: !ex.ok, why: allowMsg('expedition') || (typeof ex.why === 'string' ? ex.why : 'Locked'), onTap: expStart },
        { icon: iUrl('ready-breed', 4), label: 'Breeding', sub: !allow('breed') ? lockSub() : pairs.length ? pairs.length + ' ready' : 'None', disabled: !pairs.length || !free || !allow('breed'), why: allowMsg('breed') || (!pairs.length ? 'No pair is ready.' : 'No one is free.'), onTap: breedPairs },
        { icon: iUrl('ready-event', 4), label: 'Event', sub: !allow('event') ? lockSub() : evWhy || evs.length + ' ready', disabled: !!evWhy || !allow('event'), why: allowMsg('event') || (evWhy === 'No one' ? 'No one is free.' : evWhy === 'None' ? 'No habitat is ready.' : evWhy === 'No habitat' ? 'Build a habitat first.' : evWhy), onTap: eventHabsScreen },
        { icon: iUrl('rep', 4), label: 'Advertise', sub: !allow('campaign') ? lockSub() : !open ? 'No habitat' : runningC ? runningC + ' on' : '', disabled: !open || !allow('campaign'), why: allowMsg('campaign') || 'Build a habitat first.', onTap: campaignScreen }
      ], 2, 84, true);
      body.appendChild(g);
      const hot = [];
      if (s.happening && s.happening.options) hot.push(row({ img: iUrl('choice', 4), title: s.happening.title, sub: 'Decide', cls: 'mn-hot', tap: happeningScreen }));
      if (s.yearly) hot.push(row({ img: iUrl('star', 4), title: s.yearly.name, sub: 'Plan it', cls: 'mn-hot', tap: yearlyScreen }));
      if (s.show) hot.push(row({ img: iUrl('star', 4), title: 'Animal Show', sub: 'Pick an entry', cls: 'mn-hot', tap: showScreen }));
      if (hot.length) body.appendChild(el('div', { cls: 'list' }, hot));
      const runs = s.projects.slice().concat(s.hiring && E.hiringInfo && E.hiringInfo(s) ? [E.hiringInfo(s)] : [], E.campaigns(s).filter(c => c.weeksLeft > 0).map(c => ({ id: 'camp-' + c.key, type: 'campaign', name: c.name, weeksLeft: c.weeksLeft, progress: Math.max(0, Math.min(1, 1 - c.weeksLeft / Math.max(1, c.weeks))), choice: false, staff: [] })));
      if (s.arrivals && s.arrivals.length) body.appendChild(el('div', { cls: 'list' }, [row({ img: iUrl('choice', 4), title: s.arrivals.length === 1 ? E.animalLabel(s.arrivals[0].a) : s.arrivals.length + '', sub: 'New arrival', cls: 'mn-hot', tap: () => animalsScreen('zoo') })]));
      if (runs.length) body.appendChild(el('div', { cls: 'list mn-runlist' }, runs.map(runRow)));
    } });
  }

  function projectScreen(pid) {
    push({ id: 'project', title: 'Project', render(body, api) {
      const s = S(), p = E.project(s, pid); if (!p) { api.pop(); return; }
      const info = E.projectInfo(s, p);
      body.appendChild(el('div', { cls: 'mn-team' }, p.staff.map(id => { const st = E.staffer(s, id); return st ? imgEl(pUrl(st.role, 3)) : null; })));
      body.appendChild(el('div', { cls: 'mn-big' }, info.name + ' · ' + info.detail));
      body.appendChild(ui.bar(info.progress)); body.appendChild(kv('Left', wkc(info.weeksLeft)));
      if (info.scores) body.appendChild(el('div', { cls: 'chips' }, [ui.statChip(aIcon('vigor'), info.scores.animals, { name: 'Animals' }), ui.statChip('habitat', info.scores.habitat, { name: 'Habitat' }), ui.statChip(aIcon('charm'), info.scores.fun, { name: 'Fun' }), ui.statChip(aIcon('wit'), info.scores.learning, { name: 'Learning' })]));
      body.appendChild(kv('Team', p.staff.map(id => { const st = E.staffer(s, id); return st ? st.name : '?'; }).join(', ')));
      if (p.type === 'expedition') body.appendChild(kv('Spent', money(p.cost)));
      if (info.choice) body.appendChild(ui.btn('Answer', () => showChoice(pid), { cls: 'primary big' }));
      if (p.type === 'expedition') body.appendChild(ui.btn('Call back', () => ui.confirm('Call the team back? Half the cost returns.', () => { const r = Core.act('cancelProject', pid); if (r.ok) { ui.toast('Back. ' + money(r.refund) + ' returned', 'good'); later(() => api.pop()); } }, { danger: true, yes: 'Call back' }), { cls: 'danger big', sub: 'half the cost returns' }));
    } });
  }

  // ----- expedition planner: region, team, budget, confirm
  function expStart() { const rs = D.BIOME_ORDER.filter(b => S().regions[b] && allow('expedition', b)); if (rs.length === 1) expTeam(rs[0]); else expRegion(); }
  function expRegion() {
    push({ id: 'exp-region', title: 'Where to?', render(body) {
      const s = S();
      const list = D.BIOME_ORDER.filter(b => s.regions[b] && allow('expedition', b)).map(b => {
        const top = Math.max.apply(null, D.SPECIES_LIST.filter(x => x.biome === b).map(x => x.rarity));
        return row({ img: tUrl('hab:' + b, 1), title: D.BIOMES[b].region, sub: wkc(D.BIOMES[b].weeks), extra: starsOn(top), right: mny(E.expCost(b)), tap: () => expTeam(b) });
      });
      body.appendChild(rows(list, 'No region yet.'));
    } });
  }
  function expTeam(region) {
    let sel = null;
    push({ id: 'exp-team', title: 'Pick a team', render(body) {
      const s = S(), busy = E.busyStaff(s);
      const staff = s.staff.slice().sort((a, b) => (busy[a.id] ? 1 : 0) - (busy[b.id] ? 1 : 0) || b.exp - a.exp);
      if (sel === null) sel = staff.filter(x => !busy[x.id]).slice(0, 1).map(x => x.id);
      sel = sel.filter(id => !busy[id]);
      const power = E.teamPower(s, sel), lvl = fitLevel(E.expOdds(s, region, power).ratio);
      const head = el('div', { cls: 'mn-sticky' });
      head.appendChild(el('div', { cls: 'mn-kv' }, span('k', 'Strength'), span('v', sel.length ? ui.sign(lvl) : '-')));
      head.appendChild(ui.btn('Next', () => expConfirm(region, sel.slice()), { cls: 'primary big', disabled: !sel.length, sub: sel.length ? wkc(E.expWeeks(s, region, sel)) : 'pick 1 to 3' }));
      body.appendChild(head);
      body.appendChild(el('div', { cls: 'list' }, staff.map(st => {
        const on = sel.indexOf(st.id) >= 0, b = !!busy[st.id];
        return row({ img: pUrl(st.role, 3), title: st.name, sub: [D.ROLES[st.role].name, ' ', lvBox(st.lvl)], extra: el('span', { cls: 'mn-cl' }, [K('exp', st.exp), K('care', st.care)]),
          right: b ? imgEl(iUrl('busy', 3), 'mn-mini') : on ? ui.sym('ok', { scale: 3, label: 'In' }) : null, off: b, cls: on ? 'mn-on' : '',
          tap: () => { if (on) sel = sel.filter(x => x !== st.id); else if (sel.length < 3) sel.push(st.id); else { ui.toast('Three at most.'); return; } Core.rerender(); } });
      })));
    } });
  }
  // The Send out page: pick a star level (1 to 5), see its price, weeks and odds, Send. Everything fits one screen.
  const lastStar = {};
  function expConfirm(region, team) {
    let star = null;
    push({ id: 'exp-confirm', title: 'Send out?', render(body, api) {
      body.classList.add('mn-tight'); body.style.overflowY = 'hidden';
      const s = S(), list = (E.expStars ? E.expStars(s, region, team) : []) || [], open = list.filter(x => x.unlocked);
      if (!open.some(x => x.star === star)) {
        const pref = open.find(x => x.star === lastStar[region]), easy = open.filter(x => x.cost * 2 <= s.money);
        star = pref ? pref.star : easy.length ? easy[easy.length - 1].star : open.length ? open[0].star : null;
      }
      const cur = list.find(x => x.star === star) || null;
      body.appendChild(el('div', { cls: 'mn-xhead' }, imgEl(tUrl('hab:' + region, 1), 'mn-xreg'), span('mn-xname', shortRegion(region)),
        el('span', { cls: 'mn-xteam' }, team.map(id => { const st = E.staffer(s, id); return st ? imgEl(pUrl(st.role, 2)) : null; })), cur ? ui.sign(fitLevel(cur.ratio)) : null));
      body.appendChild(el('div', { cls: 'mn-xstars', role: 'tablist' }, list.map(x => {
        const b = el('button', { type: 'button', cls: 'mn-xs' + (x.star === star ? ' on' : '') + (x.unlocked ? '' : ' off'), 'data-star': x.star, 'aria-label': x.star + ' star' + (x.unlocked ? '' : ', locked: ' + x.lock) },
          span('n', String(x.star), symS('star-on', 'Stars')),
          x.unlocked ? null : span('lk', symS('lock', 'Locked'), /^Rank/.test(x.lock) ? [symS('rep', 'Zoo rank'), String(x.rank)] : symS('no', x.lock)));
        b.addEventListener('click', guard(() => { if (!x.unlocked) { ui.toast(x.lock || 'Locked', 'bad'); return; } star = x.star; api.rerender(); }));
        return b;
      })));
      if (cur) {
        body.appendChild(el('div', { cls: 'mn-xinfo' }, span('c xc', symS('coin', 'Money', 3), ' ' + fmt.num(cur.cost)), span('c xw', symS('time', 'Weeks', 3), ' ' + cur.weeks)));
        const od = el('div', { cls: 'mn-xodds' });
        Object.keys(cur.odds).map(Number).sort((a, b) => a - b).forEach(r => { const p = cur.odds[r]; if (p < 0.005) return; od.appendChild(el('div', { cls: 'mn-odd' + (r === cur.star ? ' me' : '') }, starsOn(r), ui.bar(p, { cls: 'gold' }), span('p', pct(p)))); });
        body.appendChild(od);
      }
      const cost = cur ? cur.cost : 0;
      body.appendChild(ui.btn('Send', guard(() => { const r = Core.act('startExpedition', region, team, star); if (r.ok) { lastStar[region] = star; later(() => Core.popAll()); ui.toast('Expedition sent', 'good'); } }), { cls: 'primary big mn-send', sub: cur ? money(cost) : lockSub(), disabled: !cur || s.money < cost, onDisabled: () => ui.toast(cur ? needMoney(cost) : 'Locked', 'bad') }));
    } });
  }

  // ----- breeding planner: pair, lead, confirm
  function breedPairs() {
    push({ id: 'breed-pairs', title: 'Which pair?', render(body) {
      const all = pairList(), ready = all.filter(x => !x.why), wait = all.filter(x => x.why);
      const mk = x => row({ img: aUrl(x.a, 2), title: x.a.name + ' + ' + x.b.name, sub: E.sp(x.a).name + ' · ' + E.habName(S(), x.hab), right: x.why ? why(shortWhy(x.why)) : ui.grade(E.grade((E.avg(x.a) + E.avg(x.b)) / 2)), off: !!x.why, tap: () => (E.freeStaff(S()).length === 1 ? breedConfirm(x.a.id, x.b.id, E.freeStaff(S())[0].id) : breedLead(x.a.id, x.b.id)) });
      body.appendChild(rows(ready.map(mk), 'No pair is ready.'));
      if (wait.length) { body.appendChild(ui.section('Not yet')); body.appendChild(rows(wait.map(mk))); }
    } });
  }
  function breedLead(aId, bId) {
    push({ id: 'breed-lead', title: 'Who leads?', render(body) {
      const s = S(), busy = E.busyStaff(s);
      const staff = s.staff.filter(x => !busy[x.id]).sort((x, y) => E.breedChance(s, y) - E.breedChance(s, x));
      body.appendChild(rows(staff.map(st => row({ img: pUrl(st.role, 3), title: st.name, sub: D.ROLES[st.role].name, extra: el('span', { cls: 'mn-cl' }, [K('care', st.care)]), right: span('mn-cnt', ui.sym('odds', { scale: 2, label: 'Odds', text: '' }), ' ' + pct(E.breedChance(s, st))), tap: () => breedConfirm(aId, bId, st.id) })), 'No one is free.'));
    } });
  }
  function breedConfirm(aId, bId, leadId) {
    push({ id: 'breed-confirm', title: 'Start breeding?', render(body) {
      const s = S(), a = E.animal(s, aId), b = E.animal(s, bId), lead = E.staffer(s, leadId);
      if (!a || !b || !lead) { Core.pop(); return; }
      body.appendChild(el('div', { cls: 'mn-pic' }, imgEl(aUrl(a, 4)), imgEl(aUrl(b, 4))));
      body.appendChild(el('div', { cls: 'mn-big' }, a.name + ' + ' + b.name));
      body.appendChild(kv('Leader', lead.name));
      body.appendChild(kv('Chance', pct(E.breedChance(s, lead))));
      body.appendChild(kv('Time', wkc(E.breedWeeks(s, a.sp))));
      body.appendChild(ui.btn('Start', guard(() => { const r = Core.act('startBreeding', aId, bId, leadId); if (r.ok) { later(() => Core.popAll()); ui.toast('Pair is breeding', 'good'); } }), { cls: 'primary big' }));
    } });
  }

  // ----- event planner: habitat (skipped with one habitat), then ONE screen for host, theme and Start
  const shortEvWhy = t => (/quiet/i.test(t) ? ['Rest ', clk((/(\d+)/.exec(t) || [])[1] || '')] : /no animals/i.test(t) ? 'No animals' : /well enough/i.test(t) ? 'All unwell' : /already/i.test(t) ? 'Event running' : t.split(' ').slice(0, 4).join(' '));
  function eventHabsScreen() {
    const all = eventHabs();
    if (all.length === 1 && !all[0].why) { eventSetup(all[0].hab.id); return; }
    push({ id: 'event-habs', title: 'Which habitat?', render(body) {
      const s = S(), cost = E.eventCost(s);
      body.appendChild(rows(eventHabs().map(x => row({ img: itemUrl(x.hab), title: E.habName(s, x.hab), sub: x.why ? null : cnt('m-animals', E.inHab(s, x.hab.id).length), extra: x.why ? why(shortEvWhy(x.why)) : null, right: x.why ? null : mny(cost), off: !!x.why, tap: () => eventSetup(x.hab.id) })), 'No habitats yet.'));
    } });
  }
  function eventSetup(habId) {
    let host = null, theme = null;
    push({ id: 'event-setup', title: 'Event', render(body, api) {
      body.classList.add('mn-tight'); body.style.overflowY = 'hidden';
      const s = S(), h = E.item(s, habId); if (!h) { api.pop(); return; }
      const busy = E.busyStaff(s), staff = s.staff.filter(x => !busy[x.id]).sort((x, y) => y.charm - x.charm).slice(0, 8);
      const list = D.THEME_ORDER.filter(t => (s.research['theme:' + t] || !D.THEMES[t].rp) && (!D.THEMES[t].needs || s.regions[D.THEMES[t].needs])).map(t => ({ t, fit: E.themeFit(s, h.t, t) }));
      list.sort((a, b) => (b.fit == null ? 1.5 : b.fit) - (a.fit == null ? 1.5 : a.fit));
      if (!staff.some(x => x.id === host)) host = staff.length ? staff[0].id : null;
      if (!list.some(x => x.t === theme)) theme = list.length ? list[0].t : null;
      const cost = E.eventCost(s);
      body.appendChild(el('div', { cls: 'mn-xhead' }, imgEl(itemUrl(h), 'mn-xreg'), span('mn-xname', E.habName(s, h)), cnt('m-animals', E.inHab(s, h.id).length)));
      body.appendChild(el('div', { cls: 'mn-pick hosts', 'data-n': staff.length }, staff.map(st => el('button', { type: 'button', cls: 'mn-pk host' + (st.id === host ? ' on' : ''), 'data-host': st.id, 'aria-label': 'Host ' + st.name, tap: guard(() => { host = st.id; api.rerender(); }) },
        imgEl(pUrl(st.role, 2)), K('charm', st.charm)))));
      if (!staff.length) body.appendChild(el('div', { cls: 'empty' }, 'No one is free.'));
      body.appendChild(el('div', { cls: 'mn-pick themes' + (list.length > 8 ? ' c3' : '') }, list.map(x => el('button', { type: 'button', cls: 'mn-pk theme' + (x.t === theme ? ' on' : ''), 'data-theme': x.t, tap: guard(() => { theme = x.t; api.rerender(); }) },
        span('tn', D.THEMES[x.t].name), span('fs', ui.sign(x.fit), h.lastTheme === x.t ? symS('time', 'Done last time') : null)))));
      body.appendChild(ui.btn('Start', guard(() => { const r = Core.act('startEvent', habId, theme, host); if (r.ok) { later(() => Core.popAll()); ui.toast('Event started', 'good'); } }),
        { cls: 'primary big mn-send', sub: [mny(cost), ' ', wkc(3)], disabled: !host || !theme || s.money < cost, onDisabled: () => ui.toast(!host ? 'No one is free.' : needMoney(cost), 'bad') }));
    } });
  }

  // ----- advertising, Open Day / Festival, Animal Show
  function campaignScreen() {
    push({ id: 'campaigns', title: 'Advertise', render(body, api) {
      const s = S();
      body.appendChild(rows(E.campaigns(s).map((c, i) => {
        const reason = !isOpen(s) ? 'Needs habitat' : c.weeksLeft > 0 ? ['On ', clk(c.weeksLeft)] : c.lock ? 'Needs ' + c.lock : s.money < c.cost ? needMoney(c.cost) : '';
        return row({ img: iUrl('rep', 4), title: c.name, sub: c.note, extra: reason ? why(reason) : null, right: mny(c.cost), off: !!reason,
          tap: () => ui.confirm('Run ' + c.name + ' for ' + money(c.cost) + '?', () => { const r = Core.act('runCampaign', i); if (r.ok) { ui.toast(c.name + ' running', 'good'); api.rerender(); } }, { yes: 'Run it' }) });
      })));
    } });
  }
  function yearlyScreen() {
    push({ id: 'yearly', title: S().yearly ? S().yearly.name : 'Day', render(body, api) {
      const y = S().yearly; if (!y) { api.pop(); return; }
      body.appendChild(ui.choices(y.options, i => { const r = Core.act('resolveYearly', i); if (r.ok) later(() => Core.popAll()); }));
    } });
  }
  function showScreen() {
    push({ id: 'show', title: 'Animal Show', render(body, api) {
      const s = S(); if (!s.show) { api.pop(); return; }
      const m = E.showMedals(s), stat = D.ANIMAL_STATS[s.show.stat];
      body.appendChild(el('div', { cls: 'chips' }, [ui.statChip(aIcon(s.show.stat), 'judged', { name: stat }), ui.statChip('medal-gold', m.gold, { name: 'Gold' }), ui.statChip('medal-silver', m.silver, { name: 'Silver' }), ui.statChip('medal-bronze', m.bronze, { name: 'Bronze' })]));
      const an = s.animals.slice().sort((a, b) => E.showScore(s, b) - E.showScore(s, a));
      body.appendChild(rows(an.map(a => { const medal = E.showMedal(s, a); return row({ img: aUrl(a, 2), title: a.name, sub: E.animalLabel(a), right: span('mn-cnt', medal ? ui.sym('medal-' + medal, { scale: 2, label: medal, text: '' }) : ui.sym('no', { scale: 2, label: 'No medal', text: '-' }), ' ' + E.showScore(s, a)), off: E.isSick(s, a),
        tap: () => ui.confirm('Enter ' + a.name + ' in the show?', () => { const r = Core.act('enterShow', a.id); if (r.ok) later(() => Core.popAll()); }, { yes: 'Enter' }) }); }), 'No animals.'));
    } });
  }

  // ------------------------------------------------------------------ BUILD
  function place(spec, onPlace, back) {
    Core.popAll();
    if (!window.ZRender || !ZRender.startPlacement) { ui.toast('Placing needs the floor.', 'bad'); return false; }
    return ZRender.startPlacement(spec, { onPlace, onDone() { /* back on the floor, time runs */ }, onCancel() { if (!Core.stack().length && back) openAt(back); } });
  }
  // ------------------------------------------------------------------ EDIT MODE (replaces the Build lists and the Move screen)
  // A solid strip (#edit-bar) docked at the bottom of the floor: symbol tabs for the groups, ONE sideways-scrolling row of things to add, Done.
  // Tapping a placed thing on the map (the renderer calls editPick) swaps the strip for Move / Upgrade / Sell.
  const edit = { on: false, grp: 'hab', sel: null, sig: '', want: null, wantKey: '', wantDone: false };
  const R = () => window.ZRender || null;
  const hasEdit = () => { const r = R(); return !!(r && typeof r.startEdit === 'function'); };
  const placingNow = () => { const r = R(); try { return !!(r && r.placing && r.placing()); } catch (e) { return false; } };
  const EGROUPS = [['hab', 'habitat', 'Habitats'], ['shop', 'coin', 'Shops'], ['fun', 'heart', 'Fun'], ['sci', 'rp', 'Science'], ['mark', 'trophy', 'Landmarks'], ['own', 'move', 'Placed']];
  const facGroup = F => (F.landmark ? 'mark' : F.spend ? 'shop' : (F.rpw || F.vet || F.learn) ? 'sci' : 'fun');
  const refundOf = it => Math.round((it.k === 'hab' ? D.BIOMES[it.t].hab : D.FAC[it.t].cost) * 0.5);
  function editCards(grp) {
    const s = S(), out = [];
    if (grp === 'hab') {
      D.BIOME_ORDER.filter(b => s.regions[b] && allow('biome', b)).forEach(b => {
        const c = E.habBuildCost(s, b), first = b === 'savanna' && !isOpen(s), no = allowMsg('hab', b), poor = !first && s.money < c;
        out.push({ key: 'hab:' + b, img: tUrl('hab:' + b, 1), name: D.BIOMES[b].name, price: c, lock: !!no, why: no || (poor ? needMoney(c) : ''), tap: () => placeHab(b) });
      });
      const nl = E.nextLand(s);
      if (nl && allow('land')) { const low = E.rank(s) < nl.rank; out.push({ key: 'land', img: iUrl('land', 4), name: 'More land', price: nl.cost, lock: low, lockN: low ? nl.rank : 0, why: low ? 'Needs rank ' + nl.rank : s.money < nl.cost ? needMoney(nl.cost) : '', tap: buyLand }); }
    } else if (grp === 'own') {   // only when the renderer cannot pick from the map yet: the placed things, to select one
      if (!hasEdit()) s.items.slice().sort((a, b) => (a.k === b.k ? 0 : a.k === 'hab' ? -1 : 1)).forEach(it => out.push({ key: 'own:' + it.id, img: itemUrl(it), name: itemName(it), own: true, why: '', tap: () => editPick(it) }));
    } else {
      D.FAC_ORDER.filter(x => (!D.FAC[x].rp || s.research['fac:' + x]) && facGroup(D.FAC[x]) === grp).forEach(x => {
        const F = D.FAC[x], c = E.facCost(s, x), have = s.items.filter(i => i.k === 'fac' && i.t === x).length, full = !!(F.limit && have >= F.limit);
        out.push({ key: 'fac:' + x, img: bUrl(x, 2), name: F.name, price: c, lock: full, why: full ? 'Limit reached' : s.money < c ? needMoney(c) : '', tap: () => placeFac(x) });
      });
    }
    return out;
  }
  function editCard(c) {
    const b = el('button', { type: 'button', cls: 'mn-ec' + (c.why ? ' off' : ''), 'data-key': c.key, 'aria-label': c.name + (c.why ? ' (' + c.why + ')' : '') },
      el('span', { cls: 'im' }, imgEl(c.img)),
      c.own ? null : el('span', { cls: 'pr' }, c.lock ? [symS('lock', 'Locked'), c.lockN ? [symS('rep', 'Zoo rank'), String(c.lockN)] : null] : [symS('coin', 'Money'), short(c.price)]));
    b.addEventListener('click', guard(() => { if (c.why) { ui.toast(c.why, 'bad'); return; } c.tap(); }));
    return b;
  }
  function editBar() {
    let bar = document.getElementById('edit-bar');
    if (!bar) { const host = document.getElementById('floor-wrap'); if (!host) return null; bar = el('div', { id: 'edit-bar', role: 'toolbar', 'aria-label': 'Edit' }); bar.hidden = true; host.appendChild(bar); }
    return bar;
  }
  function editRender() {
    const bar = editBar(), s = S(); if (!bar || !s) return;
    const old = bar.querySelector('.mn-es'), keep = old && old.dataset.grp === edit.grp ? old.scrollLeft : 0;
    bar.textContent = '';
    let it = edit.sel != null ? E.item(s, edit.sel) : null; if (!it) edit.sel = null;
    if (it) {   // actions for the thing picked on the map
      const isHab = it.k === 'hab', busy = isHab && E.habStatus(s, it).busy, back = refundOf(it);
      const act = (cls, label, kids, fn, off) => { const b = el('button', { type: 'button', cls: 'mn-ea ' + cls + (off ? ' off' : ''), 'aria-label': label }, kids); b.addEventListener('click', guard(fn)); return b; };
      bar.appendChild(el('div', { cls: 'mn-eact' },
        el('span', { cls: 'mn-ewho' }, imgEl(itemUrl(it)), isHab ? cnt('m-animals', E.inHab(s, it.id).length + '/' + E.habCap(it)) : null),
        act('move', 'Move', symS('move', 'Move', 4), () => editMove(it)),
        isHab ? upgBtn(it, () => editRender()) : null,
        act('sell', 'Sell', [symS('sell', 'Sell', 4), span('pr', '+', symS('coin', 'Money'), short(back))], () => { if (busy) { ui.toast('Project running', 'bad'); return; } editSell(it); }, busy),
        act('back', 'Back to adding', imgEl(pixIcon('left', '#6b5a3c', 3)), () => editPick(null))));
    } else {
      const groups = EGROUPS.map(g => ({ id: g[0], icon: g[1], name: g[2], cards: editCards(g[0]) })).filter(g => g.cards.length);
      if (!groups.some(g => g.id === edit.grp)) edit.grp = groups.length ? groups[0].id : 'hab';
      const cur = groups.find(g => g.id === edit.grp) || { cards: [] }, want = edit.want;
      const tabs = el('div', { cls: 'mn-etabs', role: 'tablist' }, groups.map(g => { const b = el('button', { type: 'button', cls: 'mn-et' + (g.id === edit.grp ? ' on' : '') + (want && want[0] === g.id && g.id !== edit.grp ? ' mn-glow' : ''), 'data-grp': g.id, 'aria-label': g.name }, symS(g.icon, g.name, 3)); b.addEventListener('click', guard(() => { edit.grp = g.id; editRender(); })); return b; }));
      const done = el('button', { type: 'button', cls: 'mn-et done' + (edit.wantDone ? ' mn-glow' : ''), 'aria-label': 'Done' }, symS('ok', 'Done', 3), 'Done'); done.addEventListener('click', guard(() => editStop()));
      tabs.appendChild(done); bar.appendChild(tabs);
      const strip = el('div', { cls: 'mn-es', 'data-grp': edit.grp }, cur.cards.map(editCard)); bar.appendChild(strip);
      const glow = want && want[0] === edit.grp ? strip.querySelector('[data-key="' + want[1] + '"]') : null;
      if (glow) { glow.classList.add('mn-glow'); strip.scrollLeft = Math.max(0, glow.offsetLeft - 60); } else strip.scrollLeft = keep;
    }
    edit.sig = editSig(); if (!bar.hidden) editToasts(bar);
  }
  const editSig = () => { const s = S(); return s ? [Math.floor(s.money), s.items.length, s.items.reduce((n, i) => n + (i.lvl || 0), 0), edit.sel, edit.grp, E.rank(s), s.rows, edit.wantKey, edit.wantDone, Object.keys(s.research).length, s.projects.length].join('|') : ''; };
  function editSel(id) { const r = R(); try { if (r && r.select) r.select(id == null ? null : id); } catch (e) { /* ignore */ } }
  function editPick(it) { if (!edit.on) return; edit.sel = it && it.id != null && (it.k === 'hab' || it.k === 'fac') ? it.id : null; editSel(edit.sel); editRender(); }
  function editArm() { const r = R(); if (hasEdit()) { try { r.startEdit({ onPick: editPick, onExit: () => editStop(true) }); } catch (e) { /* ignore */ } } }
  function editMode(grp) {
    if (!S()) return false; Core.popAll();
    if (!editBar()) { ui.toast('Editing needs the floor.', 'bad'); return false; }
    edit.on = true; edit.sel = null; if (typeof grp === 'string') edit.grp = grp; else if (edit.want) edit.grp = edit.want[0];
    editArm(); editRender(); editSync(); return true;
  }
  function editStop(fromRenderer) {
    if (!edit.on) return; edit.on = false; edit.sel = null; editSel(null);
    const r = R(); if (!fromRenderer && r && r.stopEdit) { try { r.stopEdit(); } catch (e) { /* ignore */ } }
    editSync();
  }
  // Keeps the strip in step with the game: hidden while a screen is open or the renderer's own Place / Rotate / Cancel bar is up, back afterwards.
  function editSync() {
    const bar = document.getElementById('edit-bar'); if (!bar) return;
    const s = S(), st = Core.stack();
    if (edit.on && (!s || st[0] === 'menu' || st[0] === 'title')) { edit.on = false; edit.sel = null; editSel(null); const r = R(); if (r && r.stopEdit) { try { r.stopEdit(); } catch (e) { /* ignore */ } } }
    const show = edit.on && !st.length && !placingNow();
    if (show) { const r = R(); if (hasEdit() && r.editing && !r.editing()) { editArm(); if (edit.sel != null) editSel(edit.sel); } if (edit.sig !== editSig() || !bar.firstChild) editRender(); }
    if (bar.hidden === show) { bar.hidden = !show; document.body.classList.toggle('mn-editing', show); }
    editToasts(show ? bar : null);
  }
  function editToasts(bar) {
    const ts = document.getElementById('toasts'); if (!ts) return;
    if (!bar) { if (ts.dataset.mnLift) { ts.style.bottom = ''; delete ts.dataset.mnLift; } return; }
    const host = ts.offsetParent || document.body, px = Math.round(host.getBoundingClientRect().bottom - bar.getBoundingClientRect().top + 8) + 'px';
    if (ts.style.bottom !== px) { ts.style.bottom = px; ts.dataset.mnLift = '1'; }
  }
  function editPlace(spec, onPlace) {
    const r = R(); if (!r || !r.startPlacement) { ui.toast('Placing needs the floor.', 'bad'); return false; }
    Core.popAll(); const out = r.startPlacement(spec, { onPlace, onDone() { editSync(); }, onCancel() { editSync(); } }); editSync(); return out;
  }
  function editMove(it) { editPlace({ kind: it.k, t: it.t, moveId: it.id, label: itemName(it) }, (q, r, rot) => { return Core.act('move', it.id, q, r, rot); }); }
  function editSell(it) {
    const n = it.k === 'hab' ? E.inHab(S(), it.id).length : 0;
    ui.confirm('Sell ' + itemName(it) + ' for ' + money(refundOf(it)) + '?' + (n ? ' Its animals go to the pen.' : ''), () => {
      const r = Core.act('remove', it.id); if (r && r.ok) { edit.sel = null; editSel(null); editRender(); }
    }, { danger: true, yes: 'Sell' });
  }
  function buyLand() {
    const nl = E.nextLand(S()); if (!nl) return;
    ui.confirm('Buy more land for ' + money(nl.cost) + '?', () => { const r = Core.act('buyLand'); if (r && r.ok) editRender(); }, { yes: 'Buy' });
  }
  // The upgrade button: up arrow, the new capacity and the price; grey with a short reason when it cannot be done; gold when the habitat is full.
  function upgInfo(h) {
    const s = S(), c = E.habUpgradeCost(h, s), nx = E.habCap(Object.assign({}, h, { lvl: h.lvl + 1 }));
    const reason = h.lvl >= 5 ? 'Max level' : h.lvl >= E.habLevelCap(s) ? 'Needs research' : s.money < c ? needMoney(c) : '';
    return { c, nx, reason };
  }
  function upgBtn(h, after) {
    const s = S(), u = upgInfo(h), full = E.inHab(s, h.id).length >= E.habCap(h);
    const b = el('button', { type: 'button', cls: 'mn-up' + (u.reason ? ' off' : full ? ' gold' : ''), 'aria-label': 'Upgrade ' + E.habName(s, h) },
      u.reason ? [imgEl(pixIcon('up', '#6b5a3c', 2)), span('rs', u.reason)] : [imgEl(pixIcon('up', '#2f8a3a', 2)), span('nx', String(u.nx)), ' ', mny(u.c)]);
    b.addEventListener('click', guard(() => {
      if (u.reason) { ui.toast(u.reason, 'bad'); return; }
      const r = Core.act('upgrade', h.id);
      if (r && r.ok) { if (!edit.on) ui.toast('Room for ' + u.nx, 'good'); if (after) after(r); else { try { Core.rerender(); } catch (e) { /* ignore */ } } if (movableIds(h.id).length) moveInPrompt(h.id, true); }
    }));
    return b;
  }
  // After a habitat is built (or upgraded) the engine no longer moves anyone in: one tap asks.
  let moveInHandled = false;
  function movableIds(habId) { try { return E.movableTo ? E.movableTo(S(), habId) : []; } catch (e) { return []; } }
  function moveInPrompt(habId, force) {
    const ids = movableIds(habId); if (!ids.length) return;
    setTimeout(() => {
      if (Core.stack().length && !force) return;
      push({ id: 'movein', modal: true, title: 'Move in?', render(body, api) {
        const s = S(), animals = ids.map(id => E.animal(s, id)).filter(Boolean); if (!animals.length) { api.pop(); return; }
        body.appendChild(el('div', { cls: 'mn-pool' }, animals.slice(0, 8).map(a => imgEl(aUrl(a, 3)))));
        const h = E.item(s, habId); if (h) body.appendChild(el('div', { cls: 'center' }, E.habName(s, h)));
        if (h && animals.length > E.habCap(h) - E.inHab(s, habId).length) body.appendChild(el('div', { cls: 'center' }, why('Full'), ' ', upgBtn(h, () => api.rerender())));
        body.appendChild(el('div', { cls: 'btnrow' }, ui.btn('Not now', () => { moveInHandled = true; api.pop(); }, { cls: 'ghost big' }),
          ui.btn('Move in', guard(() => { const r = Core.act('moveIn', habId, ids); moveInHandled = true; if (r && r.ok) { ui.toast('Moved in', 'good'); later(() => api.pop()); } }), { cls: 'primary big', sub: String(animals.length) })));
      } });
    }, 450);
  }
  function placeHab(b) {
    editPlace({ kind: 'hab', t: b, label: D.BIOMES[b].name }, (q, r, rot) => {
      const res = Core.act('build', 'hab', b, q, r, rot);
      if (res && res.ok) { moveInHandled = false; moveInPrompt(res.id); }
      return res;
    });
  }
  function placeFac(x) {
    editPlace({ kind: 'fac', t: x, repeat: true, label: D.FAC[x].name }, (q, r, rot) => {
      const res = Core.act('build', 'fac', x, q, r, rot);
      return res;
    });
  }

  // ------------------------------------------------------------------ ANIMALS
  let animalTab = 'zoo';
  const ageText = a => { const s = S(); if (E.isJuv(s, a)) return 'Baby'; if (a.born == null) return 'Adult'; const y = Math.floor((s.week - a.born) / D.WPY); return y < 1 ? 'Young' : y + 'y'; };
  const ageSym = a => { const s = S(); if (E.isJuv(s, a)) return [' ', ui.sym('juv', { scale: 2, label: 'Baby', text: 'baby' })]; if (a.born == null) return null; const y = Math.floor((s.week - a.born) / D.WPY); return y >= 1 ? ' ' + y + 'y' : null; };
  const crown = a => { try { return E.bestOf && E.bestOf(S(), a) ? ui.sym('best', { scale: 2, label: 'Best of its kind', text: '', cls: 'mn-best' }) : null; } catch (e) { return null; } };
  function animalTile(a) {
    const s = S(), sick = E.isSick(s, a) ? imgEl(iUrl('sick', 2), 'mn-mini') : null;
    return el('button', { type: 'button', cls: 'mn-at', 'data-aid': a.id, tap: guard(() => animalScreen(a.id)), 'aria-label': (a.name || '') + ' ' + E.animalLabel(a) },
      el('span', { cls: 'pt' }, imgEl(aUrl(a, 2))),
      el('span', { cls: 'inf' }, el('span', { cls: 'c3' }, [A('charm', a.charm), A('vigor', a.vigor), A('wit', a.wit)]), el('span', { cls: 'c2' }, sexSym(a), ageSym(a), ui.grade(E.grade(E.avg(a))), crown(a), sick)));
  }
  function animalRow(a, o) {
    const s = S();
    const sick = E.isSick(s, a) ? imgEl(iUrl('sick', 3), 'mn-mini') : null;
    if (o && o.act) { const rw = row({ img: aUrl(a, 2), title: [E.animalLabel(a), ' ', sexSym(a), ageSym(a), crown(a)], line: animalChips(a), tap: () => animalScreen(a.id), act: o.act }); rw.setAttribute('data-aid', a.id); return rw; }
    return row({ img: aUrl(a, 2), title: [E.animalLabel(a), ' ', sexSym(a), ageSym(a), sick], right: animalChips(a), tap: () => animalScreen(a.id) });
  }
  // ---- arrivals waiting for a sell-or-keep decision (engine S.arrivals)
  function arrivalRow(en) {
    const a = en.a;
    return row({ img: aUrl(a, 2), title: [E.animalLabel(a), ' ', sexSym(a)], extra: animalChips(a), right: [cmpBadge(en), ui.sym('choice', { scale: 3, label: 'Decide', text: '!' })], cls: 'mn-hot', tap: () => showArrival(a.id) });
  }
  function showArrival(id) {
    if (window.ZMoments && ZMoments.showArrival) { try { ZMoments.showArrival(id); return; } catch (e) { /* fall back */ } }
    arrivalScreen(id);
  }
  function arrivalScreen(id) {
    push({ id: 'arrival', title: 'New arrival', render(body, api) {
      const s = S(), en = E.arrival ? E.arrival(s, id) : null; if (!en) { api.pop(); return; }
      animalCard(body, en.a);
      const b = cmpBadge(en); if (b) body.appendChild(el('div', { cls: 'center' }, b));
      body.appendChild(el('div', { cls: 'btnrow' }, ui.btn('Sell', () => ui.confirm('Sell for ' + money(E.animalValue(en.a)) + '?', () => { const r = Core.act('sellArrival', id); if (r.ok) { ui.toast('Sold for ' + money(r.price), 'good'); later(() => api.pop()); } }, { danger: true, yes: 'Sell' }), { cls: 'danger big', sub: mny(E.animalValue(en.a)) }), ui.btn('Keep', () => arrivalWhere(id), { cls: 'primary big' })));
    } });
  }
  function arrivalWhere(id) {
    push({ id: 'arrival-where', title: 'Where?', render(body, api) {
      const s = S(), en = E.arrival ? E.arrival(s, id) : null; if (!en) { api.pop(); return; }
      body.appendChild(rows(E.arrivalChoices(s, id).map(c => { const h = c.hab != null ? E.item(s, c.hab) : null;
        if (h && !c.fit) return row({ img: itemUrl(h), title: E.habName(s, h), extra: why('Full'), line: null, act: upgBtn(h, () => { const r = Core.act('keepArrival', id, c.hab); if (r && r.ok) { ui.toast('Kept', 'good'); later(() => { Core.pop(); if (Core.stack().slice(-1)[0] === 'arrival') Core.pop(); }); } else api.rerender(); }) });
        return row({ img: h ? itemUrl(h) : iUrl('pen', 4), title: h ? E.habName(s, h) : 'Holding pen', sub: h ? (c.room != null ? cnt('m-animals', Math.max(0, c.room)) : null) : (E.holdFee ? [mny(E.holdFee(s, en.a)), '/wk'] : null), extra: c.fit ? null : why('Full'), right: c.best ? ui.sym('ok', { scale: 3, label: 'Best' }) : null, off: !c.fit,
          tap: () => { const r = Core.act('keepArrival', id, c.hab); if (r.ok) { ui.toast('Kept', 'good'); later(() => { Core.pop(); if (Core.stack().slice(-1)[0] === 'arrival') Core.pop(); }); } } }); })));
    } });
  }
  // ------------------------------------------------------------------ press, hold and drag an animal (Animals > Zoo and Pen)
  const habCheck = (a, h) => {
    const s = S();
    if (a.hab === h.id) return { ok: false, reason: 'Lives here' };
    if (h.t !== E.sp(a).biome) return { ok: false, reason: 'Wrong biome' };
    const room = E.habCap(h) - E.inHab(s, h.id).length;
    if (room <= 0) return { ok: false, reason: 'Habitat full' };
    return { ok: true, room };
  };
  function dragHint() { try { if (localStorage.getItem('wildside-drag-hint')) return null; localStorage.setItem('wildside-drag-hint', '1'); } catch (e) { return null; } return ui.note('Hold and drag to move.'); }
  function enableDrag(body) {
    if (body.__mnDrag) return; body.__mnDrag = true;
    let pend = null, drag = null, suppress = 0, scrollTimer = 0;
    const panelOf = () => body.closest('.panel');
    body.addEventListener('click', ev => { if (Date.now() < suppress) { ev.stopPropagation(); ev.preventDefault(); } }, true);
    body.addEventListener('touchmove', ev => { if (drag && ev.cancelable) ev.preventDefault(); }, { passive: false });
    body.addEventListener('contextmenu', ev => { if (ev.target.closest('[data-aid]')) ev.preventDefault(); });
    body.addEventListener('pointerdown', ev => {
      if (ev.button > 0 || drag || pend) return;
      const el0 = ev.target.closest && ev.target.closest('[data-aid]'); if (!el0 || ev.target.closest('.btn, .mn-up')) return;
      pend = { id: +el0.dataset.aid, el: el0, x: ev.clientX, y: ev.clientY, pid: ev.pointerId, timer: setTimeout(startDrag, 350) };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onCancel);
    });
    function cleanupListeners() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel); }
    function startDrag() {
      if (!pend) return; const s = S(), a = E.animal(s, pend.id), tile = pend.el;
      if (!a) { pend = null; cleanupListeners(); return; }
      if (E.busyAnimals(s)[a.id]) { tile.classList.add('mn-shake'); setTimeout(() => tile.classList.remove('mn-shake'), 450); ui.toast('In a project', 'bad'); suppress = Date.now() + 500; pend = null; cleanupListeners(); return; }
      const r = tile.getBoundingClientRect(), ghost = tile.cloneNode(true); ghost.removeAttribute('data-aid'); ghost.classList.add('mn-ghost'); ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px';
      document.body.appendChild(ghost);
      const tag = el('span', { cls: 'mn-gtag' }); ghost.appendChild(tag);
      tile.classList.add('mn-lifted');
      const targets = [];
      body.querySelectorAll('.mn-hsec[data-hab]').forEach(sec => { const h = E.item(s, +sec.dataset.hab), c = h ? habCheck(a, h) : { ok: false, reason: 'Gone' }; sec.classList.add(c.ok ? 'drop-ok' : 'drop-no'); if (c.ok) sec.dataset.tag = 'Room ' + c.room; targets.push({ el: sec, kind: 'hab', hab: h && h.id, ok: c.ok, reason: c.reason }); });
      const panel = panelOf(), foot = panel.querySelector('.pfoot'), bar = el('div', { cls: 'mn-dropbar', style: { bottom: (foot ? foot.offsetHeight : 70) + 'px' } });
      const inPen = a.hab == null;
      const penT = el('div', { cls: 'mn-dt pen' + (inPen ? ' drop-no' : ' drop-ok') }, imgEl(iUrl('pen', 3)), span('', 'Pen'), E.holdFee ? span('', mny(E.holdFee(s, a)), '/wk') : null);
      const sellT = el('div', { cls: 'mn-dt sell drop-ok' }, imgEl(iUrl('coin', 3)), span('', 'Sell'), span('', mny(E.animalValue(a))));
      if (animalTab === 'pen') { const hb = el('div', { cls: 'mn-dhabs' }); habs().forEach(h => { const c = habCheck(a, h), d = el('div', { cls: 'mn-dt hab ' + (c.ok ? 'drop-ok' : 'drop-no') }, imgEl(itemUrl(h)), span('', E.habName(s, h)), c.ok ? span('', 'Room ' + c.room) : null); hb.appendChild(d); targets.push({ el: d, kind: 'hab', hab: h.id, ok: c.ok, reason: c.reason }); }); bar.appendChild(hb); }
      bar.appendChild(el('div', { cls: 'mn-dtrow' }, penT, sellT)); panel.appendChild(bar);
      targets.push({ el: penT, kind: 'pen', ok: !inPen, reason: 'Already here' }, { el: sellT, kind: 'sell', ok: true });
      drag = { a, tile, ghost, tag, targets, bar, ox: pend.x - r.left, oy: pend.y - r.top, x: pend.x, y: pend.y, hover: null };
      suppress = Date.now() + 5000; pend = null; place(); hover();
      scrollTimer = setInterval(() => { if (!drag) return; const br = body.getBoundingClientRect(), zone = 56; if (drag.y < br.top + zone) body.scrollTop -= 10; else if (drag.y > br.bottom - zone - 70) body.scrollTop += 10; else return; hover(); }, 16);
    }
    function place() { drag.ghost.style.left = (drag.x - drag.ox) + 'px'; drag.ghost.style.top = (drag.y - drag.oy) + 'px'; }
    function hover() {
      let hit = null;
      for (let i = drag.targets.length - 1; i >= 0; i--) { const t = drag.targets[i], r = t.el.getBoundingClientRect(); if (drag.x >= r.left && drag.x <= r.right && drag.y >= r.top && drag.y <= r.bottom) { hit = t; break; } }
      if (drag.hover !== hit) { if (drag.hover) drag.hover.el.classList.remove('hover'); if (hit) hit.el.classList.add('hover'); drag.hover = hit; }
      drag.tag.textContent = hit && !hit.ok ? hit.reason : ''; drag.tag.style.display = hit && !hit.ok ? 'block' : 'none';
    }
    function onMove(ev) {
      if (pend) { if (Math.abs(ev.clientX - pend.x) > 10 || Math.abs(ev.clientY - pend.y) > 10) { clearTimeout(pend.timer); pend = null; cleanupListeners(); } return; }
      if (!drag) return; drag.x = ev.clientX; drag.y = ev.clientY; place(); hover(); if (ev.cancelable) ev.preventDefault();
    }
    function finish(drop) {
      clearTimeout(pend && pend.timer); pend = null; cleanupListeners(); clearInterval(scrollTimer);
      if (!drag) return; const d = drag; drag = null;
      d.ghost.remove(); d.bar.remove(); d.tile.classList.remove('mn-lifted'); body.querySelectorAll('.mn-hsec').forEach(x => { x.classList.remove('drop-ok', 'drop-no', 'hover'); delete x.dataset.tag; });
      suppress = Date.now() + 450;
      const t = drop ? d.hover : null; if (!t || !t.ok) return;
      const a = d.a;
      if (t.kind === 'hab') { const r = Core.act('moveAnimal', a.id, t.hab); if (r && r.ok) ui.toast('Moved', 'good'); }
      else if (t.kind === 'pen') { const r = Core.act('moveAnimal', a.id, null); if (r && r.ok) ui.toast('In the pen'); }
      else if (t.kind === 'sell') { const v = E.animalValue(a); ui.confirm('Sell ' + (a.name || 'it') + ' for ' + money(v) + '?', () => { const r = Core.act('sellAnimal', a.id); if (r && r.ok) { ui.toast('Sold for ' + money(r.price), 'good'); try { Core.rerender(); } catch (e) { /* ignore */ } } }, { danger: true, yes: 'Sell' }); }
      try { Core.rerender(); } catch (e) { /* ignore */ }
    }
    function onUp() { finish(true); }
    function onCancel() { finish(false); }
  }

  function animalsScreen(tab) {
    if (tab) animalTab = tab;
    push({ id: 'animals', title: 'Animals', render(body, api) {
      body.classList.add('mn-tight');
      const s = S(), pen = E.holding(s), offers = s.offers, mk = offers ? offers.list.length + (E.crateInfo(s) ? 1 : 0) : 0;
      if (s.arrivals && s.arrivals.length) body.appendChild(el('div', { cls: 'list' }, s.arrivals.map(arrivalRow)));
      body.appendChild(ui.tabs([{ id: 'zoo', label: 'Zoo' }, { id: 'pen', label: 'Pen ' + pen.length + '/' + E.holdCap(s) }, { id: 'market', label: mk ? 'Market ' + mk : 'Market' }], animalTab, t => { animalTab = t; api.rerender(); }));
      if ((animalTab === 'zoo' && s.animals.length) || (animalTab === 'pen' && pen.length)) { enableDrag(body); const hint = dragHint(); if (hint) body.appendChild(hint); }
      if (animalTab === 'zoo') {
        let any = false;
        habs().forEach(h => {
          const an = E.inHab(s, h.id).sort((a, b) => (a.sp < b.sp ? -1 : a.sp > b.sp ? 1 : E.avg(b) - E.avg(a))); any = true;
          const sec = el('div', { cls: 'mn-hsec', 'data-hab': h.id });
          sec.appendChild(el('div', { cls: 'mn-hh' }, ui.section(E.habName(s, h) + '  ' + an.length + '/' + E.habCap(h)), upgBtn(h)));
          if (an.length) sec.appendChild(el('div', { cls: 'mn-ag' }, an.map(animalTile)));
          body.appendChild(sec);
        });
        if (!any) body.appendChild(el('div', { cls: 'empty' }, 'No animals in habitats.'));
      } else if (animalTab === 'pen') {
        const canAny = pen.some(a => E.bestHab(s, a));
        if (pen.length && !habs().length) body.appendChild(ui.note('Build a habitat first.'));
        if (pen.length && E.holdUpkeep) { const hu = E.holdUpkeep(s); body.appendChild(el('div', { cls: 'mn-kv' }, span('k', ui.sym('pen', { scale: 3, label: 'Pen', text: 'Pen' })), span('v', mny(hu.total), '/wk'))); }
        if (pen.length > 1) body.appendChild(ui.btn('House all', () => { const r = Core.act('autoHouseAll'); if (r.ok) { ui.toast(r.moved.length ? pn(r.moved.length, 'animal', 'animals') + ' housed' : 'No room'); api.rerender(); } }, { cls: 'primary big', disabled: !canAny, sub: canAny ? '' : 'No room' }));
        body.appendChild(rows(pen.map(a => { const h = E.bestHab(s, a); return animalRow(a, { act: ui.btn('House', () => { const r = Core.act('autoHouse', a.id); if (r.ok) { const hh = E.item(s, r.hab); ui.toast('Housed' + (hh ? ' in ' + E.habName(s, hh) : ''), 'good'); api.rerender(); } }, { cls: 'primary', disabled: !h, sub: h ? '' : (habs().length ? 'No room' : 'Needs habitat') }) }); }), 'The pen is empty.'));
      } else marketBody(body, api);
    } });
  }
  function marketBody(body, api) {
    const s = S(), o = s.offers, info = E.crateInfo(s);
    if (!o || (!o.list.length && !info)) { body.appendChild(el('div', { cls: 'empty' }, 'Nobody is selling.')); return; }
    body.appendChild(ui.section(o.kind === 'director' ? 'Visiting director' : 'Trader'));
    if (info) body.appendChild(row({ img: iUrl('coin', 4), title: [starsOn(info.rarity || 1), ' ', info.left != null ? info.left + '/' + (info.total || 5) : ''], sub: info.name || null, right: mny(info.cost), tap: () => crateScreen() }));
    body.appendChild(rows(o.list.map((x, i) => row({ img: aUrl(x.a, 2), title: [E.animalLabel(x.a), ' ', sexSym(x.a), ' ', cmpBadge(x) || (S().book[x.a.sp] ? null : ui.sym('new', { scale: 2, label: 'New', text: 'New!' }))],
      extra: animalChips(x.a), right: [mny(x.price), starsOn(E.sp(x.a).rarity)], tap: () => offerScreen(i) })), info ? '' : 'Nothing left.'));
  }
  function statBoxes(a) {
    return el('div', { cls: 'mn-stats' }, ASTATS.map(k => el('div', { cls: 'mn-st ' + k, title: (D.ASTAT && D.ASTAT[k] && D.ASTAT[k].name) || k }, el('b', ui.sym(aIcon(k), { scale: 3, label: (D.ASTAT && D.ASTAT[k] && D.ASTAT[k].name) || k }), ' ' + ((D.ASTAT && D.ASTAT[k] && D.ASTAT[k].name) || k)), span('n', a[k]), ui.grade(E.grade(a[k])))));
  }
  function animalCard(body, a) {
    const s = S(), sp = E.sp(a);
    body.appendChild(el('div', { cls: 'mn-pic one' }, imgEl(aUrl(a, 4))));
    body.appendChild(el('div', { cls: 'mn-big' }, a.name ? a.name + ' · ' : '', E.animalLabel(a)));
    body.appendChild(el('div', { cls: 'center' }, starsOn(sp.rarity), ' ', D.RARITY.name[sp.rarity]));
    body.appendChild(statBoxes(a));
  }
  function animalScreen(id) {
    push({ id: 'animal', title: 'Animal', render(body, api) {
      const s = S(), a = E.animal(s, id); if (!a) { api.pop(); return; }
      animalCard(body, a);
      const h = a.hab == null ? null : E.item(s, a.hab);
      body.appendChild(el('div', { cls: 'center' }, sexSym(a), ageSym(a), crown(a), ' · ', h ? E.habName(s, h) : [ui.sym('pen', { scale: 2, label: 'Pen', text: 'Pen' }), ' Pen'], E.isSick(s, a) ? [' ', ui.sym('sick', { scale: 2, label: 'Unwell', text: '+' })] : null));
      if (!h) { const best = E.bestHab(s, a); body.appendChild(ui.btn('House', () => { const r = Core.act('autoHouse', id); if (r.ok) { ui.toast('Housed', 'good'); later(() => api.pop()); } }, { cls: 'primary big', disabled: !best, sub: best ? E.habName(s, best) : 'No room' })); }
      const inProj = !!E.busyAnimals(s)[id];
      body.appendChild(ui.btn('Choose habitat', () => habChooser(id), { cls: 'big', disabled: inProj, sub: inProj ? 'In a project' : '' }));
      if (h) body.appendChild(ui.btn('To holding pen', () => { const r = Core.act('moveAnimal', id, null); if (r.ok) { ui.toast('In the pen'); api.rerender(); } }, { cls: 'ghost', sub: E.holdFee ? [mny(E.holdFee(s, a)), '/wk'] : '' }));
      const v = E.animalValue(a);
      body.appendChild(ui.btn('Sell', () => ui.confirm('Sell ' + (a.name || 'it') + ' for ' + money(v) + '?', () => { const r = Core.act('sellAnimal', id); if (r.ok) { ui.toast('Sold for ' + money(r.price), 'good'); later(() => api.pop()); } }, { danger: true, yes: 'Sell' }), { cls: 'danger', sub: money(v) }));
    } });
  }
  function habChooser(id) {
    push({ id: 'animal-hab', title: 'Move to', render(body, api) {
      const s = S(), a = E.animal(s, id); if (!a) { api.pop(); return; }
      body.appendChild(rows(habs().map(h => {
        const n = E.inHab(s, h.id).length, cap = E.habCap(h), same = h.t === E.sp(a).biome, here = a.hab === h.id, full = n >= cap && !here;
        const reason = E.busyAnimals(s)[id] ? 'In a project' : !same ? 'Wrong biome' : here ? 'Lives here' : full ? 'Full' : '';
        return row({ img: itemUrl(h), title: E.habName(s, h), sub: n + '/' + cap, extra: reason ? why(reason) : null, off: !!reason, tap: () => { const r = Core.act('moveAnimal', id, h.id); if (r.ok) { ui.toast('Moved', 'good'); later(() => api.pop()); } } });
      }), 'No habitats.'));
    } });
  }
  function offerScreen(i) {
    push({ id: 'offer', title: 'For sale', render(body, api) {
      const s = S(), o = s.offers && s.offers.list[i]; if (!o) { api.pop(); return; }
      animalCard(body, o.a);
      { const b = cmpBadge(o); if (b) body.appendChild(el('div', { cls: 'center' }, b)); }
      body.appendChild(ui.btn('Buy', guard(() => { const r = Core.act('buyAnimal', i); if (r.ok) { ui.toast('Bought', 'good'); later(() => { api.pop(); if (r.pending && E.arrival && r.animal && E.arrival(S(), r.animal.id)) showArrival(r.animal.id); }); } }), { cls: 'primary big', sub: money(o.price), disabled: s.money < o.price, onDisabled: () => ui.toast(needMoney(o.price), 'bad') }));
    } });
  }
  function crateScreen() {
    push({ id: 'crate', title: 'Crate', render(body, api) {
      const s = S(), info = E.crateInfo(s); if (!info) { api.pop(); return; }
      body.appendChild(el('div', { cls: 'center' }, imgEl(iUrl('coin', 8))));
      const big = starsOn(info.rarity || 1); big.classList.add('big'); body.appendChild(el('div', { cls: 'center' }, big, ' ', info.left != null ? info.left + '/' + (info.total || 5) : ''));
      if (info.pool) body.appendChild(el('div', { cls: 'mn-pool' }, info.pool.slice(0, 24).map(id => imgEl(spUrl(id, {}, 2)))));
      else (info.odds || []).forEach(o => body.appendChild(el('div', { cls: 'mn-odd' }, starsOn(o.rarity), ui.bar(o.p, { cls: 'gold' }), span('p', pct(o.p)))));
      const full = !info.pool && E.holding(s).length >= E.holdCap(s), poor = s.money < info.cost;
      body.appendChild(ui.btn('Open', guard(() => openCrate(api)), { cls: 'primary big', sub: full ? 'Pen is full' : poor ? needMoney(info.cost) : money(info.cost), disabled: full || poor }));
    } });
  }
  function openCrate(api) {
    const r = Core.act('openCrate'); if (!r.ok) return;
    if (window.ZMoments && ZMoments.revealCrate) { try { ZMoments.revealCrate(r, () => { try { Core.rerender(); } catch (e) { /* ignore */ } }); return; } catch (e) { /* use ours */ } }
    if (r.pending && E.arrival) { showArrival(r.animal.id); return; }
    const a = r.animal, sp = E.sp(a);
    reveal(api, { id: 'crate-rarity', kicker: 'Mystery crate', title: D.RARITY.name[r.rarity], body: (() => { const w = starsOn(r.rarity); w.classList.add('big'); return w; })(), tone: r.rarity >= 4 ? 'rare' : '' }, a1 => {
      a1.replace({ id: 'crate-animal', modal: true, render(b, a2) {
        const h = r.hab != null ? E.item(S(), r.hab) : null;
        b.appendChild(ui.reveal({ kicker: r.isNew ? 'New species!' : r.variant ? 'Rare variant!' : sp.name, img: aUrl(a, 5), title: E.animalLabel(a),
          body: el('div', { cls: 'chips', style: { justifyContent: 'center' } }, [A('charm', a.charm), A('vigor', a.vigor), A('wit', a.wit)]),
          sub: h ? 'Housed in ' + E.habName(S(), h) : 'In the holding pen', tone: r.isNew || r.variant || r.rarity >= 4 ? 'rare' : '', onTap: () => a2.pop() }));
      } });
    });
  }

  // ------------------------------------------------------------------ STAFF
  const animalChips = a => el('span', { cls: 'mn-cl' }, [A('charm', a.charm), A('vigor', a.vigor), A('wit', a.wit), ui.grade(E.grade(E.avg(a)))]);
  const staffChips = st => el('span', { cls: 'mn-cl' }, SKILLS.map(k => K(k, st[k])));
  function staffScreen() {
    push({ id: 'staff', title: 'Staff', render(body, api) {
      const s = S(), busy = E.busyStaff(s), cap = E.staffCap(s);
      body.appendChild(staffCapChip()); body.appendChild(hireOptions(api));
      if (s.candidates && s.candidates.length) body.appendChild(ui.btn('Who turned up', candidatesScreen, { cls: 'blue', alert: true, sub: String(s.candidates.length) }));
      if (s.headhunt) {
        const h = s.headhunt, fee = E.headhuntFee(h);
        body.appendChild(ui.section('Headhunter'));
        body.appendChild(row({ img: pUrl(h.role, 3), title: h.name, sub: [D.ROLES[h.role].name, ' ', lvBox(h.lvl)], line: staffChips(h), act: ui.btn('Hire', guard(() => { const r = Core.act('hireHeadhunt'); if (r.ok) { ui.toast(h.name + ' joined', 'good'); api.rerender(); } }), { cls: 'primary', sub: money(fee), disabled: s.money < fee || s.staff.length >= cap, sub: s.staff.length >= cap ? 'Staff full' : mny(fee) }) }));
      }
      body.appendChild(el('div', { cls: 'list' }, s.staff.map(st => row({ img: pUrl(st.role, 3), title: st.name, sub: [D.ROLES[st.role].name, ' ', lvBox(st.lvl), ' ', money(E.salary(st)) + '/wk'], extra: staffChips(st), right: busy[st.id] ? imgEl(iUrl('busy', 3), 'mn-mini') : null, tap: () => staffDetail(st.id) }))));
    } });
  }
  function staffDetail(id) {
    push({ id: 'staff-one', title: 'Staff', render(body, api) {
      const s = S(), st = E.staffer(s, id); if (!st) { api.pop(); return; }
      const R = D.ROLES[st.role], busy = !!E.busyStaff(s)[id];   // (R here is the job, not the renderer)
      body.appendChild(el('div', { cls: 'mn-pic one' }, imgEl(pUrl(st.role, 6))));
      body.appendChild(el('div', { cls: 'mn-big' }, st.name));
      body.appendChild(el('div', { cls: 'center' }, R.name, ' ', lvBox(st.lvl)));
      body.appendChild(ui.bar(Math.min(1, st.xp / (40 + st.lvl * 30)), { cls: 'blue' }));
      body.appendChild(el('div', { cls: 'mn-capwrap mn-bigchips' }, SKILLS.map(k => K(k, st[k]))));
      body.appendChild(kv('Pay', mny(E.salary(st))));
      if (busy) body.appendChild(kv('Status', 'On a project'));
      const wait = E.trainWait(s, st);
      body.appendChild(ui.btn('Train', () => trainScreen(id), { cls: 'primary big', sub: wait > 0 ? [ui.sym('time', { scale: 2, label: 'Wait', text: '' }), ' ' + wait] : mny(E.trainCost(st)) }));
      const lowLv = st.lvl < D.JOB_LEVEL;
      body.appendChild(ui.btn('Change job', () => jobScreen(id), { cls: 'big', disabled: lowLv || busy, sub: lowLv ? [lockSub(), ' ', lvBox(D.JOB_LEVEL)] : busy ? 'On a project' : '' }));
      body.appendChild(ui.btn('Let go', () => ui.confirm('Let ' + st.name + ' go for good?', () => { const r = Core.act('fire', id); if (r.ok) { ui.toast(st.name + ' left'); later(() => api.pop()); } }, { danger: true, yes: 'Let go' }), { cls: 'danger', disabled: busy, sub: busy ? 'On a project' : '' }));
    } });
  }
  function trainScreen(id) {
    push({ id: 'staff-train', title: 'Train', render(body, api) {
      const s = S(), st = E.staffer(s, id); if (!st) { api.pop(); return; }
      const wait = E.trainWait(s, st), c = E.trainCost(st);
      body.appendChild(ui.note('Sometimes a Super! triple gain.'));
      body.appendChild(rows(D.COURSES.map(co => {
        const reason = wait > 0 ? ['Again ', clk(wait)] : s.money < c ? needMoney(c) : '';
        return row({ img: ui.sym(kIcon(co.skill || co.stat), { scale: 4, label: co.name }), title: co.name, extra: [el('span', { cls: 'mn-cl' }, [K(co.skill || co.stat, st[co.stat])]), reason ? why(reason) : null], right: mny(c), off: !!reason,
          tap: guard(() => { const r = Core.act('train', id, co.stat); if (!r.ok) return;
            if (window.ZMoments && ZMoments.revealTrain) { try { ZMoments.revealTrain(st, r, () => { try { if (Core.stack().slice(-1)[0] === 'staff-train') api.pop(); else Core.rerender(); } catch (e) { /* ignore */ } }); return; } catch (e) { /* use ours */ } }
            reveal(api, { kicker: st.name, title: r.super ? 'Super!' : D.STATS[co.stat], big: '+' + r.gain, sub: D.STATS[co.stat] + ' is now ' + r.value, tone: r.super ? 'rare' : 'good' }); }) });
      })));
    } });
  }
  const ROLE_TAG = { keeper: 'Breeding, care', vet: 'Rare variants', researcher: '+50% research', explorer: 'Faster expeditions', guide: 'Better events', zoologist: 'Stronger babies', leader: 'Stronger, faster trips', showrunner: '+1 Fun, +1 Learning' };
  function jobScreen(id) {
    push({ id: 'staff-job', title: 'New job', render(body, api) {
      const s = S(), st = E.staffer(s, id); if (!st) { api.pop(); return; }
      const c = E.jobCost(st);
      body.appendChild(rows(E.jobOptions(s, st).map(o => {
        const R = D.ROLES[o.role], reason = o.lock ? 'Needs ' + R.req.map(g => g.map(x => D.ROLES[x].name).join('/')).join(' + ') : s.money < c ? needMoney(c) : '';
        return row({ img: pUrl(o.role, 3), title: R.name, sub: ROLE_TAG[o.role] || '', extra: reason ? why(reason) : null, right: mny(c), off: !!reason,
          tap: () => ui.confirm('Make ' + st.name + ' a ' + R.name + '? Back to level 1.', () => { const r = Core.act('changeJob', id, o.role); if (r.ok) { ui.toast(st.name + ' is now a ' + R.name, 'good'); later(() => api.pop()); } }, { yes: 'Change' }) });
      })));
    } });
  }
  function hireOptions(api) {
    const s = S(), full = s.staff.length >= E.staffCap(s) || !allow('hire'), out = s.hiring ? (E.hiringInfo ? E.hiringInfo(s) : null) : null;
    if (s.hiring) return row({ img: pUrl('headhunter', 3), title: out ? out.detail : 'Advert', sub: out ? wkc(out.weeksLeft) : 'Out', extra: ui.bar(out ? out.progress : 0), tap: () => ui.toast('Applicants arrive soon.') });
    const tiers = E.hireTiers(s), ch = ui.choices(tiers.map(t => ({ label: t.name, note: full ? 'Staff room full' : t.lock ? 'Needs ' + t.lock : [t.note, t.weeks ? ' · ' : '', t.weeks ? ui.sym('time', { scale: 2, label: 'Weeks', text: 'wk' }) : null, t.weeks ? ' ' + t.weeks : ''], cost: t.cost, disabled: full || !!t.lock })), i => {
      const r = Core.act('advertise', i); if (!r.ok) return;
      ui.toast('Advert out', 'good'); try { api.rerender(); } catch (e) { /* ignore */ }
    });
    tiers.forEach((tr, i) => { if ((full || tr.lock) && ch.children[i]) ch.children[i].addEventListener('click', guard(() => ui.toast(allowMsg('hire') || (full ? 'Staff room full' : 'Needs ' + tr.lock), 'bad'))); });
    return ch;
  }
  function hireScreen() {
    push({ id: 'staff-hire', title: 'Advertise', render(body, api) {
      const s = S(), full = s.staff.length >= E.staffCap(s);
      body.appendChild(staffCapChip());
      body.appendChild(ui.choices(E.hireTiers(s).map(t => ({ label: t.name, note: full ? 'Staff room full' : t.lock ? 'Needs ' + t.lock : t.note + (t.star >= 0.1 ? ' · stars likely' : ''), cost: t.cost, disabled: full || !!t.lock })), i => {
        const r = Core.act('advertise', i); if (!r.ok) return;
        api.replace(candidatesDef());
        if (window.ZMoments && ZMoments.revealHire) { try { ZMoments.revealHire(r.candidates, () => { try { Core.rerender(); } catch (e) { /* ignore */ } }); } catch (e) { /* list is already there */ } }
      }));
    } });
  }
  function candidatesDef() {
    return { id: 'staff-candidates', title: 'Who turned up', render(body, api) {
      const s = S(), full = s.staff.length >= E.staffCap(s); body.appendChild(staffCapChip());
      body.appendChild(rows((s.candidates || []).map((c, i) => row({ img: pUrl(c.role, 3), title: c.name, sub: [D.ROLES[c.role].name, ' ', lvBox(c.lvl)], line: el('span', { cls: 'mn-cl' }, [c.star ? ui.sym('star', { scale: 2, label: 'Standout', text: '*' }) : null].concat(SKILLS.map(k => K(k, c[k])))),
        act: ui.btn('Hire', guard(() => { const r = Core.act('hireCandidate', i); if (r.ok) { ui.toast(c.name + ' joined', 'good'); api.rerender(); } }), { cls: 'primary', disabled: full, sub: full ? 'Staff full' : money(E.salary(c)) + '/wk' }) })), 'Nobody left.'));
    } };
  }
  function candidatesScreen() { push(candidatesDef()); }

  // ------------------------------------------------------------------ RESEARCH
  const RGROUPS = [['Regions', 'Regions', () => pUrl('explorer', 5)], ['Know-how', 'Know-how', () => iUrl('m-research', 6)], ['Facilities', 'Facilities', () => bUrl('gift', 3)], ['Event themes', 'Themes', () => iUrl('ready-event', 6)], ['Landmarks', 'Landmarks', () => bUrl('gate', 3)]];
  const researchItems = () => { const s = S(); return E.researchList(s).filter(x => allow('research', x.id)); };
  const researchReady = () => { try { const s = S(); return researchItems().filter(x => !x.done && !x.lock && x.rp <= s.rp).length; } catch (e) { return 0; } };
  function researchScreen() {
    push({ id: 'research', title: 'Research', render(body) { body.classList.add('mn-tight');
      const s = S(), all = researchItems();
      body.appendChild(el('div', { cls: 'mn-kv' }, span('k', ui.sym('rp', { scale: 3, label: 'Research', text: 'RP' })), span('v', rpc(s.rp))));
      const boxes = RGROUPS.map(g => { const items = all.filter(x => x.group === g[0]), n = items.filter(x => !x.done && !x.lock && x.rp <= s.rp).length; return items.length ? { icon: g[2](), label: g[1], sub: items.filter(x => x.done).length + '/' + items.length, alert: n > 0, onTap: () => researchGroup(g[0], g[1]) } : null; }).filter(Boolean);
      body.appendChild(fitGrid(boxes, 2));
    } });
  }
  function researchGroup(group, label) {
    push({ id: 'research-list', title: label, render(body, api) {
      const s = S(), items = researchItems().filter(x => x.group === group);
      items.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
      body.appendChild(el('div', { cls: 'mn-kv' }, span('k', ui.sym('rp', { scale: 3, label: 'Research', text: 'RP' })), span('v', rpc(s.rp))));
      body.appendChild(rows(items.map(x => {
        const reason = x.done ? '' : x.lock ? x.lock : x.rp > s.rp ? 'Need ' + fmt.num(x.rp - s.rp) + ' more' : '';
        let img = iUrl('m-research', 4); if (x.id.indexOf('region:') === 0) img = tUrl('hab:' + x.id.slice(7), 1); else if (x.id.indexOf('fac:') === 0) img = bUrl(x.id.slice(4), 2); else if (x.id.indexOf('theme:') === 0) img = iUrl('ready-event', 4);
        return row({ img, title: x.name, sub: x.id.indexOf('theme:') === 0 || x.id.indexOf('region:') === 0 ? null : x.desc, extra: reason ? why(reason) : null, right: x.done ? ui.sym('ok', { scale: 3, label: 'Done' }) : rpc(x.rp), off: x.done || !!reason, cls: x.done ? 'disabled' : '',
          tap: () => ui.confirm('Research ' + x.name + ' for ' + fmt.num(x.rp) + ' RP?', () => { const r = Core.act('doResearch', x.id); if (r.ok) { ui.toast('Learned ' + x.name, 'good'); api.rerender(); } }, { yes: 'Research' }) });
      })));
    } });
  }

  // ------------------------------------------------------------------ INFO
  function infoScreen() {
    push({ id: 'info', title: 'Info', render(body) { body.classList.add('mn-tight');
      const s = S(), ch = inCh();   // a challenge has no years, awards, rankings or secret places
      body.appendChild(fitGrid([
        { icon: iUrl('m-info', 6), label: 'Book', sub: E.speciesCount(s) + ' found', onTap: bookScreen },
        { icon: iUrl('star', 6), label: 'Combos', sub: comboFound() + '/' + D.COMBOS.length, onTap: comboScreen },
        { icon: iUrl('heart', 6), label: 'Fits', onTap: fitScreen },
        ch ? null : { icon: iUrl('choice', 6), label: 'Rumors', onTap: rumorScreen },
        ch ? null : { icon: iUrl('rep', 6), label: 'Ranks', sub: E.rankings(s).place + ' of ' + E.rankings(s).of, onTap: rankScreen },
        ch ? null : { icon: iUrl('rp', 6), label: 'Years', sub: s.history.length ? String(s.history.length) : '', onTap: yearsScreen },
        ch ? null : { icon: iUrl('coin', 6), label: 'Awards', onTap: awardsScreen },
        Core.devTools ? { icon: iUrl('m-system', 6), label: 'Log', onTap: logScreen } : null
      ].filter(Boolean), 2));
    } });
  }
  const comboFound = () => D.COMBOS.filter(c => S().combos[c.id] || S().knownCombos[c.id]).length;

  // ----- collection book
  function bookScreen() {
    push({ id: 'book', title: 'Book', render(body) {
      const s = S();
      const secretHidden = b => D.BIOMES[b].secret && !s.regions[b];
      const total = D.SPECIES_LIST.filter(x => !secretHidden(x.biome)).length;
      body.appendChild(el('div', { cls: 'mn-kv' }, span('k', 'Found'), span('v', E.speciesCount(s) + ' / ' + total )));
      D.BIOME_ORDER.forEach(b => {
        if (secretHidden(b)) return;
        const list = D.SPECIES_LIST.filter(x => x.biome === b).sort((a, c) => a.rarity - c.rarity), got = list.filter(x => s.book[x.id]).length;
        body.appendChild(ui.section(D.BIOMES[b].name + '  ' + got + '/' + list.length));
        body.appendChild(el('div', { cls: 'mn-book' }, list.map(x => {
          const bk = s.book[x.id];
          return el('button', { type: 'button', cls: 'mn-cell' + (bk && bk.variant ? ' new' : ''), tap: guard(() => speciesScreen(x.id)) },
            el('span', { cls: 'im' }, ui.img(spUrl(x.id, {}, 2) || '', { cls: bk ? '' : 'mn-sil' })), el('span', { cls: 'nm' }, bk ? x.name : '?'), bk ? starsOn(x.rarity) : null);
        })));
      });
    } });
  }
  function speciesScreen(id) {
    push({ id: 'species', title: 'Species', render(body) {
      const s = S(), x = D.SPECIES[id], bk = s.book[id];
      body.appendChild(el('div', { cls: 'mn-pic' + (bk && bk.variant ? '' : ' one') }, ui.img(spUrl(id, {}, 5) || '', { cls: bk ? '' : 'mn-sil' }), bk && bk.variant ? imgEl(spUrl(id, { variant: true }, 5)) : null));
      body.appendChild(el('div', { cls: 'mn-big' }, bk ? x.name : '?'));
      body.appendChild(el('div', { cls: 'center' }, starsOn(x.rarity), ' ', D.RARITY.name[x.rarity]));
      if (!D.BIOMES[x.biome].secret || s.regions[x.biome]) body.appendChild(kv('From', D.BIOMES[x.biome].region));
      if (!bk) { body.appendChild(kv('Status', 'Not found yet')); return; }
      body.appendChild(kv('Best average', bk.best));
      body.appendChild(kv(x.variant + ' variant', bk.variant ? 'Found' : 'Not yet'));
      body.appendChild(kv('Bred here', bk.bred ? 'Yes' : 'Not yet'));
    } });
  }

  // ----- combos
  function effectText(c) { return c.draw ? 'Draw +' + Math.round(c.draw * 100) + '%' : c.spend ? 'Shops +' + Math.round(c.spend * 100) + '%' : c.crowd ? 'Visitors +' + Math.round(c.crowd * 100) + '%' : c.rpMult ? 'Research +' + Math.round(c.rpMult * 100) + '%' : ''; }
  const pieceImg = k => { const t = k.split(':'); return imgEl(t[0] === 'fac' ? bUrl(t[1], 1) : tUrl('hab:' + t[1], 1), 'mn-mini'); };
  function comboScreen() {
    push({ id: 'combos', title: 'Combos', render(body) {
      const s = S(), found = D.COMBOS.filter(c => s.combos[c.id] || s.knownCombos[c.id]), act = new Set(E.c(s).active.map(a => a.id));
      const near = E.nearMisses(s);
      if (near.length) {
        body.appendChild(ui.section('One piece short'));
        body.appendChild(rows(near.map(n => { const c = D.COMBOS.find(x => x.id === n.combo), f = D.FAC[n.fac]; return row({ img: bUrl(n.fac, 2), title: c.name, sub: 'Add ' + f.name, right: mny(E.facCost(s, n.fac)), tap: () => {
          place({ kind: 'fac', t: n.fac, label: f.name }, (q, r, rot) => { const res = Core.act('build', 'fac', n.fac, q, r, rot); if (res && res.ok) ui.toast(f.name + ' built', 'good'); return res; }, comboScreen);
          if (window.ZRender && ZRender.centerOn && n.cells[0]) ZRender.centerOn(n.cells[0][0], n.cells[0][1]);
        } }); })));
      }
      body.appendChild(ui.section('Found ' + found.length + '/' + D.COMBOS.length));
      const locked = D.COMBOS.filter(c => !found.includes(c));
      if (locked.length) { body.appendChild(ui.section('Not found yet')); body.appendChild(rows(locked.map(c => row({ img: iUrl('star', 4), title: '?', sub: c.hint, off: true })))); }
      body.appendChild(rows(found.map(c => row({ img: iUrl('star', 4), title: c.name, sub: effectText(c), extra: el('span', { cls: 'chips' }, [c.anchor, ...c.needs].map(pieceImg)), right: act.has(c.id) ? ui.sym('ok', { scale: 3, label: 'On' }) : null })), 'None found yet.'));
    } });
  }

  // ----- theme fits
  function fitScreen() {
    push({ id: 'fits', title: 'Fits', render(body) {
      const s = S(), bs = D.BIOME_ORDER.filter(b => s.regions[b]), ts = D.THEME_ORDER.filter(t => s.research['theme:' + t] || !D.THEMES[t].rp);
      const g = el('div', { cls: 'mn-fit', style: { gridTemplateColumns: '78px repeat(' + bs.length + ', minmax(0, 1fr))' } });
      g.appendChild(el('span')); bs.forEach(b => g.appendChild(el('span', { cls: 'h' }, imgEl(tUrl('hab:' + b, 1)))));
      ts.forEach(t => { g.appendChild(el('span', { cls: 'tn' }, D.THEMES[t].name)); bs.forEach(b => g.appendChild(el('span', { cls: 'c' }, ui.sign(E.themeFit(s, b, t))))); });
      body.appendChild(g);
      body.appendChild(ui.note('? means not tried yet.'));
    } });
  }

  // ----- rumors: one short screen. Each secret place is a row of tick boxes; the special visitors are a grid of faces. Tap for the hint.
  function rumorScreen() {
    push({ id: 'rumors', title: 'Rumors', render(body) { body.classList.add('mn-tight');
      const s = S();
      body.appendChild(el('div', { cls: 'list' }, E.secretHints(s).map(x => {
        const next = x.steps.find(st => !st.ok), marks = x.steps.map(st => {
          const m = /^(\d+)\/(\d+)$/.exec(st.prog || '');
          if (m && +m[2] <= 6) return el('span', { cls: 'mn-pips sm' }, Array.from({ length: +m[2] }, (_, i) => el('i', { cls: i < +m[1] ? 'on' : '' })));
          return span('mn-stp', el('i', { cls: 'mn-box' + (st.ok ? ' ok' : '') }), st.prog ? ' ' + st.prog : '');
        });
        return row({ img: ui.sym(x.done ? 'ok' : 'lock', { scale: 4, label: x.done ? 'Found' : 'Hidden' }), title: x.done ? x.name : '?', extra: el('span', { cls: 'mn-steps' }, marks), tap: () => ui.toast(x.done ? x.name : next ? next.t : '?') });
      })));
      body.appendChild(el('div', { cls: 'mn-vips' }, D.VIPS.map(v => { const seen = s.vips[v.id] != null;
        return el('button', { type: 'button', cls: 'mn-vip' + (seen ? ' seen' : ''), 'aria-label': seen ? v.name : 'Not yet', tap: guard(() => ui.toast(seen ? v.name : 'After ' + v.when)) }, imgEl(pUrl('vip', 3), seen ? '' : 'mn-sil'), seen ? symS('ok', 'Visited') : span('q', '?')); })));
    } });
  }
  // ----- log: just the copy button (the play log is pasted into a chat to tune the game) and a file copy
  function logScreen() {
    push({ id: 'log', title: 'Log', render(body) { body.classList.add('mn-tight');
      let kb = 0; try { kb = Math.ceil(Core.logText().length / 1024); } catch (e) { /* ignore */ }
      body.appendChild(ui.btn('Copy', () => Core.copyLog(), { cls: 'primary big mn-copy', icon: iUrl('m-info', 3), sub: kb + ' KB' }));
      body.appendChild(ui.btn('Save as file', () => Core.downloadLog(), { cls: 'big' }));
    } });
  }

  // ----- rankings, years, awards
  function rankScreen() {
    push({ id: 'ranks', title: 'Ranks', render(body) {
      const s = S(), r = E.rankings(s);
      body.appendChild(el('div', { cls: 'mn-big' }, 'Place ' + r.place + ' of ' + r.of));
      body.appendChild(el('div', { cls: 'list' }, r.table.map((t, i) => el('div', { cls: 'mn-rank' + (t.me ? ' me' : '') }, span('', i + 1), span('', t.name), span('', fmt.num(t.rating))))));
    } });
  }
  function yearsScreen() {
    push({ id: 'years', title: 'Years', render(body) {
      const s = S();
      body.appendChild(el('div', { cls: 'mn-capwrap' }, [capChip('ready-event', 'Events', s.life.events), capChip('m-projects', 'Trips', s.life.expeditions), capChip('ready-breed', 'Births', s.life.births), capChip('trophy', 'Trophies', s.trophies)]));
      if (!s.history.length) { body.appendChild(el('div', { cls: 'empty' }, 'No finished year yet.')); return; }
      const t = el('div', { cls: 'list' }, el('div', { cls: 'mn-yr h' }, span('', 'Yr'), span('', 'Place'), span('r', 'Visitors'), span('r', 'Profit'), span('r', 'Best')));
      s.history.slice().reverse().forEach(h => t.appendChild(el('div', { cls: 'mn-yr' }, span('', h.year), span('', '#' + h.place), span('r', fmt.num(h.visitors)), span('r', money(h.income - h.cost)), span('r', h.bestReview ? h.bestReview + '/40' : '-'))));
      body.appendChild(t);
    } });
  }
  function awardsScreen() {
    push({ id: 'awards', title: 'Awards', render(body) {
      const s = S(), y = E.year(s), bars = E.awardBars(y), r = E.rankings(s);
      let best = 0; s.animals.forEach(a => { best = Math.max(best, E.prestige(a)); });
      const items = [['Best Exhibit', s.yr.bestReview || 0, Math.ceil(bars.exhibit), '/40'], ['Rarest Animal', best, bars.rarest, ''], ["Breeder's Cup", s.yr.bestBaby || 0, bars.breeder, ''], ["Explorer's Medal", s.yr.newSpecies || 0, bars.explorer, ' new']];
      body.appendChild(kv('Prize each', money(E.prizeBase(y))));
      items.forEach(it => { const p = Math.min(1, it[1] / it[2]); body.appendChild(row({ img: iUrl('star', 4), title: it[0], sub: Math.round(it[1]) + ' of ' + Math.round(it[2]) + it[3], extra: ui.bar(p, { cls: p >= 1 ? '' : 'gold' }), right: p >= 1 ? ui.sym('ok', { scale: 3, label: 'On track' }) : null })); });
      body.appendChild(row({ img: iUrl('rep', 4), title: 'Zoo of the Year', sub: 'Place ' + r.place + ' of ' + r.of, right: r.place === 1 ? ui.sym('ok', { scale: 3, label: 'On track' }) : null }));
      body.appendChild(ui.note('Judged at year end.'));
    } });
  }

  // ------------------------------------------------------------------ SYSTEM
  function systemScreen() {
    push({ id: 'system', title: 'System', render(body, api) {
      body.classList.add('mn-tight');
      body.appendChild(el('div', { cls: 'btnrow' },
        ui.btn('Save now', () => { const ok = Core.save(); ui.toast(ok === false ? 'Not saved' : 'Saved', ok === false ? 'bad' : 'good'); }, { cls: 'primary big', icon: iUrl('m-system', 3) }),
        ui.btn('Title screen', toTitle, { cls: 'big' })));
      const ch = inCh();
      body.appendChild(el('div', { cls: 'mn-setrow' }, span('mn-lab', 'Speed'), ui.tabs([{ id: '1', label: '1x' }, { id: '2', label: '2x' }], String(Core.speed), id => { Core.setSpeed(+id); api.rerender(); })));
      if (window.ZRender && ZRender.getZoom) body.appendChild(el('div', { cls: 'mn-setrow' }, span('mn-lab', 'Zoom'), ui.tabs([{ id: '1', label: 'Close' }, { id: '0', label: 'Far' }], String(ZRender.getZoom()), id => { ZRender.setZoom(+id); api.rerender(); })));
      body.appendChild(el('div', { cls: 'btnrow' }, ui.btn('How to play', howScreen, { cls: 'big' }), ch
        ? ui.btn('Restart level', () => ui.confirm('Restart this level from the beginning?', () => { Core.startChallenge(Core.challengeId); }, { danger: true, yes: 'Restart' }), { cls: 'big warn', icon: iUrl('level', 3) })
        : ui.btn('Replay tutorial', () => { startTutorial(); Core.popAll(); }, { cls: 'big' })));
      if (Core.devTools && Core.screens && Core.screens.screenCheck) body.appendChild(ui.btn('Screen check', () => Core.screens.screenCheck(), { cls: 'ghost' }));
    } });
  }
  function toTitle() {
    if (inCh()) { editStop(); if (Core.leaveChallenge) Core.leaveChallenge(); else Core.toTitle(); return; }   // saves the run so it can be continued; zoo slots untouched
    editStop();
    try { Core.save(); } catch (e) { /* ignore */ }
    recordLegacy();
    if (Core.toTitle) Core.toTitle(); else ui.toast('No title screen yet', 'bad');
  }
  function howScreen() {
    push({ id: 'how', title: 'How to play', render(body) {
      const L = [['m-system', 'Tap the zoo for the menu. Time stops.'], ['m-animals', 'Expeditions bring animals. House them.'], ['ready-breed', 'Heart: a pair can breed.'], ['ready-event', 'Flag: an event can start.'], ['choice', '!: something needs you.'], ['edit', 'Edit: add, move or sell things.'], ['star', 'You cannot lose. 20 years, then a score.']];
      body.appendChild(rows(L.map(l => row({ img: iUrl(l[0], 4), title: l[1] }))));
      const lg = (icon, word) => el('div', { cls: 'lg' }, typeof icon === 'string' ? ui.sym(icon, { scale: 3, label: word, text: word.slice(0, 2) }) : icon, span('', word));
      const nm = (tbl, k, d) => (tbl && tbl[k] && tbl[k].name) || d;
      const waiting = el('span', { cls: 'mn-albox alert' });   // the gold pulsing frame that marks a button with something waiting
      const grp = (t, items) => { body.appendChild(ui.section(t)); body.appendChild(el('div', { cls: 'mn-legend' }, items)); };
      grp('Symbols', [].concat(ASTATS.map(k => lg(aIcon(k), nm(D.ASTAT, k, k))), SKILLS.map(k => lg(kIcon(k), nm(D.SKILL, k, k))),
        [lg('sex-m', 'Male'), lg('sex-f', 'Female'), lg('juv', 'Baby'), lg('new', 'New'), lg('ok', 'Done'), lg('lock', 'Locked'), lg('odds', 'Odds'), lg('time', 'Weeks'), lg('best', 'Best of kind'), lg(lvBox(3), 'Staff level')],
        ['d', 'c', 'b', 'a', 's', 'ss'].map(g => lg('grade-' + g, 'Grade ' + g.toUpperCase()))));
      grp('Zoo', [lg('coin', 'Money'), lg('rp', 'Research'), lg('rep', 'Fame'), lg('visitors', 'Visitors'), lg(ui.stars(3, 3), 'Rank'), lg(ui.flames(2, 3), 'Buzz'), lg('habitat', 'Habitat'), lg('pen', 'Pen'), lg('land', 'Land'), lg('trophy', 'Trophy'), lg('star', 'Rarity'),
        lg('medal-gold', 'Gold'), lg('medal-silver', 'Silver'), lg('medal-bronze', 'Bronze'), lg(waiting, 'Needs you'), lg('edit', 'Edit'), lg('move', 'Move'), lg('sell', 'Sell'), lg('level', 'Challenge')]);
      grp('Buying', [lg('new', 'New species'), lg(span('mn-cmp', sexSym({ sex: 'F' }), '+'), 'Other sex'), lg(imgEl(pixIcon('up', '#58b84a', 2)), 'Better'), lg(imgEl(pixIcon('down', '#e0584a', 2)), 'Worse'), lg(span('mn-cmp', '+-'), 'Mixed')]);
      grp('On the floor', [lg('ready-event', 'Event ready'), lg('ready-breed', 'Pair ready'), lg('busy', 'Working'), lg('sick', 'Unwell'), lg('choice', 'Answer me'), lg(el('span', { style: { width: '40px' } }, ui.bar(0.6)), 'Progress'), lg('flame', 'Buzz')]);
      body.appendChild(ui.note('-- - + ++ : poor to great.'));
    } });
  }

  // ----- legacy and new zoo
  function recordLegacy() {
    const s = S(); if (!s || !s.finished || !s.score || inCh() || s.ch) return false;
    s.flags = s.flags || {}; if (s.flags.legacySaved) return false;
    s.flags.legacySaved = true;
    const L = Core.legacy, last = s.history[s.history.length - 1];
    L.runs = (L.runs || 0) + 1; L.best = Math.max(L.best || 0, s.score.total); L.aff = Object.assign(L.aff || {}, s.aff); L.combos = Object.assign(L.combos || {}, s.combos);
    L.hall = (L.hall || []).concat([{ zoo: s.zooName, score: s.score.total, place: last ? last.place : 12, at: new Date().toISOString() }]);
    const copy = o => JSON.parse(JSON.stringify(o));
    L.carry = { staff: s.staff.slice().sort((a, b) => (b.lvl + (b.mastered || []).length * 30) - (a.lvl + (a.mastered || []).length * 30)).slice(0, 4).map(copy), animals: s.animals.slice().sort((a, b) => E.prestige(b) - E.prestige(a)).slice(0, 4).map(copy) };
    Core.saveLegacy(); return true;
  }
  // ------------------------------------------------------------------ TITLE SCREEN and new-zoo flow
  const GLYPH = {
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'], I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'], O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.']
  };
  const logoCache = {};
  // The logo is pixel art drawn here from a tiny letter font: dark outline, gold face, a lighter top edge, a hard shadow.
  function logoUrl(text, scale, face, hi) {
    const k = text + scale + face; if (logoCache[k]) return logoCache[k];
    const w = text.length * 6 - 1, h = 7, pad = 2, c = document.createElement('canvas'); c.width = w + pad * 2 + 1; c.height = h + pad * 2 + 1;
    const g = c.getContext('2d'), cells = [];
    text.split('').forEach((ch, i) => { (GLYPH[ch] || GLYPH.O).forEach((r, y) => { for (let x = 0; x < 5; x++) if (r[x] === '#') cells.push([i * 6 + x + pad, y + pad]); }); });
    g.fillStyle = '#2a1b0e'; cells.forEach(p => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 2; dy++) g.fillRect(p[0] + dx, p[1] + dy, 1, 1); });
    g.fillStyle = face; cells.forEach(p => g.fillRect(p[0], p[1], 1, 1));
    g.fillStyle = hi; cells.forEach(p => { if (!cells.some(q => q[0] === p[0] && q[1] === p[1] - 1)) g.fillRect(p[0], p[1], 1, 1); });
    const o = document.createElement('canvas'); o.width = c.width * scale; o.height = c.height * scale; const og = o.getContext('2d'); og.imageSmoothingEnabled = false; og.drawImage(c, 0, 0, o.width, o.height);
    return (logoCache[k] = o.toDataURL());
  }
  const gateUrl = () => safe(() => ZSprites.url(ZSprites.entrance(), 2));
  function title() {
    if (!Core.slots) { open(); return; }
    recordLegacy();
    push({ id: 'title', modal: true, cls: 'mn-title', render(body, api) {
      body.classList.add('mn-tight');
      body.appendChild(el('div', { cls: 'mn-logo' }, imgEl(logoUrl('WILDSIDE', 6, '#ffcf33', '#fff2a8'), 'lg1'), imgEl(logoUrl('ZOO', 9, '#58b84a', '#a8f08c'), 'lg2')));
      body.appendChild(el('div', { cls: 'mn-scene' }, ['zebra', 'giraffe', null, 'lion', 'elephant'].map(id => (id ? imgEl(spUrl(id, {}, 2)) : imgEl(gateUrl())))));
      body.appendChild(el('div', { cls: 'mn-slots' }, (() => { const all = Core.slots(), used = all.filter(x => !x.empty), best = used.length ? used.reduce((a, b) => ((b.savedAt || 0) > (a.savedAt || 0) ? b : a)) : null; return all.map(sl => slotCard(sl, api, best && sl.slot === best.slot)).concat([challengeEntry()]); })()));
    } });
  }
  function slotCard(sl, api, recent) {
    if (sl.empty) return el('button', { type: 'button', cls: 'mn-slot empty', tap: guard(() => newZooName(sl.slot)) }, span('mn-sn', sl.slot), span('mn-new', 'New zoo'));
    const species = Array.isArray(sl.species) ? sl.species.slice(0, 2) : [], vf = sl.variantFlags || [];
    const card = el('div', { cls: 'mn-slot' + (recent ? ' recent' : '') },
      el('button', { type: 'button', cls: 'mn-slothit', 'aria-label': 'Play ' + sl.zooName, tap: guard(() => { if (Core.loadSlot(sl.slot)) { if (Core.stack().indexOf('title') >= 0) Core.popAll(); } else ui.toast('Could not open that save', 'bad'); }) },
        span('mn-sn', sl.slot), species.length ? el('span', { cls: 'mn-ports' }, species.map((id, i) => imgEl(spUrl(id, { variant: !!vf[i] }, 2), 'mn-port'))) : null,
        el('span', { cls: 'mn-sinfo' }, span('mn-sname', sl.zooName, recent ? span('mn-cont', 'Continue') : null), span('mn-sline', (sl.dateText || 'Year ' + sl.year), ' · ', money(sl.money)),
          el('span', { cls: 'mn-sline' }, ui.stars(sl.rankStars || 1, 10), ' ', [cnt('m-animals', sl.animals || 0)], sl.finished ? ' · Done' : ''))),
      el('button', { type: 'button', cls: 'mn-del', 'aria-label': 'Delete slot ' + sl.slot, tap: guard(() => ui.confirm('Delete "' + sl.zooName + '" for good?', () => { Core.deleteSlot(sl.slot); if (Core.stack().slice(-1)[0] === 'title') api.rerender(); }, { danger: true, yes: 'Delete' })) }, imgEl(pixIcon('remove', '#9a8a70', 2))));
    return card;
  }
  // ----- challenges: a fourth entry on the title, then the line of levels
  const levels = () => (Array.isArray(D.LEVELS) ? D.LEVELS : []);
  const chStars = () => { try { return (Core.challengeStars && Core.challengeStars()) || {}; } catch (e) { return {}; } };
  const chSaved = () => { try { return (Core.challengeSaved && Core.challengeSaved()) || null; } catch (e) { return null; } };
  const star3 = n => el('span', { cls: 'mn-s3', 'aria-label': n + ' of 3 stars' }, [0, 1, 2].map(i => ui.sym(i < n ? 'star-on' : 'star-off', { scale: 2, label: '', text: i < n ? '*' : '.' })));
  function challengeEntry() {
    const L = levels(); if (!L.length || !Core.startChallenge) return null;
    const st = chStars(), got = L.reduce((n, lv) => n + Math.min(3, st[lv.id] || 0), 0), sv = chSaved();
    return el('button', { type: 'button', cls: 'mn-slot mn-chal', 'aria-label': 'Challenges', tap: guard(challengesScreen) }, imgEl(iUrl('level', 3), 'mn-chi'), span('mn-new', 'Challenges'),
      sv ? span('mn-cont', 'Continue') : null, span('mn-chs', symS('star-on', 'Stars'), ' ' + got + '/' + L.length * 3));
  }
  // One level as a card: its number, the goal (symbol and number), what is different about it (symbols), the stars earned.
  function levelCard(lv, open, stars, on, tap) {
    const g = lv.goal || {}, line = (...k) => el('span', { cls: 'ln' }, ...k);
    const gv = g.kind === 'bred' ? ui.sym('grade-' + String(E.grade(g.target)).toLowerCase(), { scale: 2, label: 'Grade', text: String(E.grade(g.target)) }) : g.kind === 'rank' ? [String(g.target), symS('star-on', 'Stars')] : short(g.target);
    const lines = [line(symS('time', 'Weeks'), String(lv.weeks)), line(symS('coin', 'Start money'), short(lv.money)), line(symS('land', 'Map rows'), String(lv.rows))];
    if (lv.biomes) lines.push(line(symS('lock', 'Only'), lv.biomes.map(b => imgEl(tUrl('hab:' + b, 1), 'tile'))));
    if (lv.maxHabs) lines.push(line(symS('habitat', 'Habitats at most'), String(lv.maxHabs)));
    (lv.no || []).forEach(n => lines.push(line(symS('no', 'No ' + n), n === 'expedition' ? imgEl(pUrl('explorer', 1), 'tile') : n)));
    if (lv.animals && lv.animals.length) lines.push(line(symS('m-animals', 'Animals to start'), String(lv.animals.length)));
    return el('button', { type: 'button', cls: 'mn-lvc' + (on ? ' on' : '') + (open ? '' : ' off'), 'data-level': lv.id, 'aria-label': 'Level ' + lv.n + (open ? '' : ' locked'), tap: guard(tap) },
      span('num', String(lv.n)), el('span', { cls: 'goal' }, symS((D.GOAL_ICON && D.GOAL_ICON[g.kind]) || 'goal', 'Goal', 3), span('gv', gv)), el('span', { cls: 'rs' }, lines), open ? star3(stars) : el('span', { cls: 'mn-s3 lk' }, symS('lock', 'Locked')));
  }
  // One rule for every level: level 1 is always open; any other level is open when it has stars of its own or the level before it has stars.
  const levelOpen = (L, st, i) => i === 0 || (st[L[i].id] || 0) >= 1 || (st[L[i - 1].id] || 0) >= 1;
  function challengesScreen() {
    let pick = null;
    push({ id: 'challenges', title: 'Challenges', render(body, api) {
      body.classList.add('mn-tight');
      const L = levels(), st = chStars(), sv = chSaved(), open = i => levelOpen(L, st, i);
      if (pick == null || !open(L.findIndex(x => x.id === pick))) { const idx = L.map((x, i) => i).filter(open), fresh = idx.find(i => !(st[L[i].id] > 0)); pick = sv && L.some(x => x.id === sv.levelId) ? sv.levelId : L[fresh != null ? fresh : idx[idx.length - 1]].id; }
      const cur = L.find(x => x.id === pick);
      body.appendChild(el('div', { cls: 'mn-lvline' }, L.map((lv, i) => levelCard(lv, open(i), Math.min(3, st[lv.id] || 0), lv.id === pick, () => { if (!open(i)) { ui.toast('Finish level ' + i + ' first', 'bad'); return; } pick = lv.id; api.rerender(); }))));
      const svL = sv ? L.find(x => x.id === sv.levelId) : null;
      if (svL) body.appendChild(ui.btn('Continue', () => { if (!Core.resumeChallenge()) ui.toast('Could not open that level', 'bad'); }, { cls: 'blue big mn-chcont', icon: iUrl('level', 3), sub: [String(svL.n), ' ', symS('time', 'Week'), ' ' + sv.week] }));
      const go = () => { Core.startChallenge(cur.id); };
      body.appendChild(ui.btn('Start', () => { if (svL && !sv.over) ui.confirm('Start level ' + cur.n + ' from the beginning? The level in progress is lost.', go, { yes: 'Start' }); else go(); }, { cls: 'primary big mn-chstart', icon: iUrl('level', 3), sub: String(cur.n) }));
    } });
  }
  // From anywhere: the level list on top of the title (leaves a running challenge first, keeping the run). Moments' "Levels" button calls it.
  function openLevels() {
    editStop();
    if (inCh()) { if (Core.leaveChallenge) Core.leaveChallenge(); else Core.toTitle(); } else if (Core.stack().indexOf('title') < 0) { if (S()) toTitle(); else if (Core.showTitle) Core.showTitle(); }
    const st = Core.stack(); if (st[st.length - 1] === 'challenges') return true;
    if (st.indexOf('title') < 0 || !levels().length) return false;
    while (Core.stack().length > 1) Core.pop();
    challengesScreen(); return true;
  }
  const nz = { slot: 1, name: 'Wildside Zoo', tut: true, staff: null, animal: null };
  function newZooName(slot) {
    nz.slot = slot; nz.name = 'Wildside Zoo'; nz.tut = true; nz.staff = null; nz.animal = null;
    push({ id: 'newzoo-name', modal: true, title: 'Name your zoo', render(body, api) {
      const f = el('input', { cls: 'field mn-name', type: 'text', maxlength: 28, value: nz.name, enterkeyhint: 'next', autocomplete: 'off', 'aria-label': 'Zoo name' });
      f.addEventListener('input', () => { nz.name = f.value; });
      f.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); f.blur(); next(); } });
      const next = () => { nz.name = (f.value || '').trim() || 'Wildside Zoo'; newZooTutorial(); };
      body.appendChild(f);
      body.appendChild(el('div', { cls: 'btnrow' }, ui.btn('Back', () => api.pop(), { cls: 'ghost big' }), ui.btn('Next', next, { cls: 'primary big' })));
    } });
  }
  function newZooTutorial() {
    push({ id: 'newzoo-tutorial', modal: true, title: 'Play the tutorial?', render(body, api) {
      body.appendChild(el('div', { cls: 'btnrow' }, ui.btn('No', () => { nz.tut = false; newZooCarry(); }, { cls: 'big' }), ui.btn('Yes', () => { nz.tut = true; newZooCarry(); }, { cls: 'primary big' })));
      body.appendChild(ui.btn('Back', () => api.pop(), { cls: 'ghost' }));
    } });
  }
  function newZooCarry() {
    const L = Core.legacy || {};
    if (!(L.runs && L.carry && ((L.carry.staff && L.carry.staff.length) || (L.carry.animals && L.carry.animals.length)))) { startNewZoo(); return; }
    push({ id: 'newzoo-carry', modal: true, title: 'Bring along', render(body, api) {
      body.appendChild(kv('Start money', '+' + money(Math.min(L.runs, 5) * 6000))); body.appendChild(kv('Research', '+' + Math.min(5, L.runs) * 10 + '%'));
      if (L.carry.staff && L.carry.staff.length) body.appendChild(el('div', { cls: 'list' }, L.carry.staff.map((st, i) => row({ img: pUrl(st.role, 3), title: st.name, sub: [D.ROLES[st.role].name, ' ', lvBox(st.lvl)], cls: nz.staff === i ? 'mn-on' : '', tap: () => { nz.staff = nz.staff === i ? null : i; api.rerender(); } }))));
      if (L.carry.animals && L.carry.animals.length) body.appendChild(el('div', { cls: 'list' }, L.carry.animals.map((a, i) => row({ img: spUrl(a.sp, { variant: !!a.variant }, 2), title: a.name, sub: E.animalLabel(a), cls: nz.animal === i ? 'mn-on' : '', tap: () => { nz.animal = nz.animal === i ? null : i; api.rerender(); } }))));
      body.appendChild(el('div', { cls: 'btnrow' }, ui.btn('Back', () => api.pop(), { cls: 'ghost big' }), ui.btn('Start', startNewZoo, { cls: 'primary big' })));
    } });
  }
  function startNewZoo() {
    const L = Core.legacy || {}, opts = { slot: nz.slot, tutorial: !!nz.tut, zooName: nz.name };
    if (L.carry && nz.staff != null && L.carry.staff[nz.staff]) opts.staff = L.carry.staff[nz.staff];
    if (L.carry && nz.animal != null && L.carry.animals[nz.animal]) opts.animal = L.carry.animals[nz.animal];
    Core.newGame(opts);
    if (Core.stack().length) Core.popAll();
  }

  // ------------------------------------------------------------------ TUTORIAL (coach strip, steps live in S.ui.tutorial = {on, step, b})
  const didN = (s, k) => ((s.did && s.did[k]) || 0);
  const benches = s => s.items.filter(i => i.t === 'bench').length;
  const count = (s, t) => s.items.filter(i => i.t === t).length;
  const isOpen = s => (E.isOpen ? E.isOpen(s) : s.items.some(i => i.k === 'hab'));
  const habCount = s => s.items.filter(i => i.k === 'hab').length;
  const BLANK_GLOW = { menu: 'Edit' }, BLANK_EDIT = ['hab', 'hab:savanna'];   // the obvious first move on bare land, tutorial or not
  const TUT = [
    { text: 'Tap your land to open the menu.', done: () => Core.stack().length > 0 || edit.on, glow: BLANK_GLOW, edit: BLANK_EDIT },
    { text: 'Edit: place a Savanna home.', done: (s, b) => habCount(s) > (b.hab || 0) && (moveInHandled || !s.items.some(i => i.k === 'hab' && movableIds(i.id).length)), glow: BLANK_GLOW, edit: BLANK_EDIT, hold: 2600 },
    { text: 'Now place a Snack Stand.', done: (s, b) => count(s, 'snack') > (b.snack || 0), glow: { menu: 'Edit' }, edit: ['shop', 'fac:snack'] },
    { text: 'Place a Bench near the stand.', done: (s, b) => count(s, 'bench') > (b.bench || 0), glow: { menu: 'Edit' }, edit: ['fun', 'fac:bench'] },
    { text: 'Flag on the habitat: hold an event.', done: (s, b) => didN(s, 'startEvent') > (b.startEvent || 0), glow: { menu: 'Projects', projects: 'Event', 'event-habs': 'Savanna', 'event-setup': 'Start' } },
    { text: "That's it. Tap the zoo any time.", auto: 7000 }
  ];
  const setWant = w => { edit.wantDone = false; const k = w ? w.join() : ''; if (k !== edit.wantKey) { edit.want = w || null; edit.wantKey = k; if (w && edit.on && edit.sel == null) edit.grp = w[0]; } };
  const PLACE_TEXT = 'Tap a spot, then Place.';
  let holdUntil = 0;
  let coachEl = null, coachSince = 0, coachStep = -1, tutTimer = 0;
  function startTutorial() {
    const s = S(); if (!s || inCh()) return;
    s.ui = s.ui || {};
    s.ui.tutorial = { on: true, step: 0, b: { startExpedition: didN(s, 'startExpedition'), startEvent: didN(s, 'startEvent'), bench: count(s, 'bench'), snack: count(s, 'snack'), hab: habCount(s) } };
    try { Core.save(); } catch (e) { /* ignore */ }
  }
  function coachRemove() { if (coachEl && coachEl.parentNode) coachEl.parentNode.removeChild(coachEl); }
  function applyGlow(map) {
    const layers = [...document.querySelectorAll('.layer:not([hidden])')], top = layers[layers.length - 1], stackNow = Core.stack();
    layers.forEach(l => l.querySelectorAll('.mn-glow').forEach(x => x.classList.remove('mn-glow')));
    const id = stackNow[stackNow.length - 1];
    if (top && map && map[id] && !top.classList.contains('modal')) { const want = map[id]; [...top.querySelectorAll('button, .row.tappable')].some(b => { if (b.textContent.trim().indexOf(want) === 0 && !b.classList.contains('disabled')) { b.classList.add('mn-glow'); return true; } return false; }); }
  }
  function tutTick() {
    const s = S(), t = s && s.ui && s.ui.tutorial;
    if (s && inCh()) { coachRemove(); applyGlow(null); setWant(null); return; }   // no tutorial inside a challenge
    if (!t || !t.on) { coachRemove(); applyGlow(s && !isOpen(s) ? BLANK_GLOW : null); setWant(s && !isOpen(s) ? BLANK_EDIT : null); return; }
    const stackNow = Core.stack();
    if (stackNow.indexOf('title') >= 0) { coachRemove(); return; }
    let changed = false, g = 0;
    if (t.step >= 2 && t.step < TUT.length - 1 && !isOpen(s)) { t.step = 1; t.b = Object.assign({}, t.b, { hab: 0 }); changed = true; }   // the habitat was removed: ask for one again
    while (t.on && g++ < 6) {
      const st = TUT[t.step]; if (!st) { t.on = false; changed = true; break; }
      if (st.auto) break;
      if (st.done(s, t.b || {})) { if (st.hold) holdUntil = Date.now() + st.hold; t.step++; changed = true; coachSince = 0; } else break;
    }
    if (t.on && TUT[t.step] && TUT[t.step].auto) { if (!coachSince) coachSince = Date.now(); if (Date.now() - coachSince > TUT[t.step].auto && !Core.busy) { t.on = false; changed = true; } }
    if (changed) { try { Core.save(); } catch (e) { /* ignore */ } }
    if (!t.on) { coachRemove(); setWant(null); return; }
    setWant(TUT[t.step].edit || null); edit.wantDone = !TUT[t.step].edit && !TUT[t.step].auto;   // nothing more to place: Done is the next tap
    const st = TUT[t.step], layers = [...document.querySelectorAll('.layer:not([hidden])')], top = layers[layers.length - 1];
    if (Core.busy || (top && top.classList.contains('modal')) || Date.now() < holdUntil) { coachRemove(); applyGlow(null); return; }   // pop-ups from the game come first; after a step the floor gets a moment to show what happened
    if (!coachEl) {
      coachEl = el('div', { cls: 'mn-coach', role: 'status' }, span('mn-ct'), el('button', { type: 'button', cls: 'mn-skip', tap: () => { const t2 = S() && S().ui && S().ui.tutorial; if (t2) { t2.on = false; try { Core.save(); } catch (e) { /* ignore */ } } coachRemove(); } }, 'Skip'));
    }
    const placing = !!(window.ZRender && ZRender.placing && ZRender.placing());
    const pn2 = document.getElementById('placement-note'), combo = placing && pn2 && /Completes/.test(pn2.textContent);
    coachEl.firstChild.textContent = placing ? (combo ? 'This spot completes a combo!' : PLACE_TEXT) : st.text; coachEl.dataset.step = t.step;
    const panel = top && top.querySelector('.panel'), stage = document.getElementById('stage');
    coachEl.classList.toggle('inpanel', !!panel);
    const parent = panel || stage;
    if (parent && coachEl.parentNode !== parent) { if (panel) panel.insertBefore(coachEl, panel.querySelector('.pbody')); else stage.appendChild(coachEl); }
    // keep clear of the placement note (it sits just under the top strip while placing)
    if (!panel) { let topPx = 6; const note = document.getElementById('placement-note'); if (placing && note && note.textContent) { const nr = note.getBoundingClientRect(), sr = stage.getBoundingClientRect(); topPx = Math.max(6, nr.bottom - sr.top + 6); } coachEl.style.top = topPx + 'px'; }
    applyGlow(st.glow || (!isOpen(s) ? BLANK_GLOW : null));
  }
  function startTicker() { if (!tutTimer) tutTimer = setInterval(() => { try { tutTick(); } catch (e) { /* never break play */ } try { editSync(); } catch (e) { /* never break play */ } }, 300); }
  startTicker();

  // ------------------------------------------------------------------ public
  window.ZMenus = {
    open, title, startTutorial, init() { /* nothing to register */ }, recordLegacy,
    edit: editMode, stopEdit: editStop, editing: () => edit.on, openLevels,
    screens: { main: open, projects: projectsScreen, animals: () => animalsScreen('zoo'), staff: staffScreen, research: researchScreen, info: infoScreen, system: systemScreen,
      book: bookScreen, combos: comboScreen, fits: fitScreen, rumors: rumorScreen, ranks: rankScreen, years: yearsScreen, awards: awardsScreen, how: howScreen, log: logScreen, challenges: challengesScreen, newZoo: () => newZooName(1),
      candidates: candidatesScreen, whoTurnedUp: candidatesScreen, expedition: expStart, breeding: breedPairs, event: eventHabsScreen, campaigns: campaignScreen, hire: hireScreen, market: () => animalsScreen('market'), pen: () => animalsScreen('pen'), crate: crateScreen,
      animal: animalScreen, staffer: staffDetail, yearly: yearlyScreen, show: showScreen, decision: happeningScreen }
  };
})();
