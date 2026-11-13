/* Wildside Zoo: moments.js -> ZMoments (Moments teammate).
   Every pop-up the game raises by itself: choices, happenings, reveals, reviews, callers, yearly events, year end, final score.
   One handler per report type, registered when this file loads (and again, harmlessly, by ZMoments.init()).
   Everything is a modal screen on the Shell's stack, so time is paused. Each moment is ONE screen whose content is swapped,
   so the stack never goes empty between beats. done() is called exactly once, on every exit path. See docs/API-moments.md. */
(function () {
  'use strict';
  const Z = window.ZCore, E = window.ZE, D = window.ZD;
  if (!Z || !E || !D) { window.ZMoments = { init() {}, errors: ['ZCore, ZE or ZD missing'] }; return; }
  const ui = Z.ui, el = ui.el, fmt = Z.fmt;
  const S = () => Z.S;
  const errors = [], shown = {}, finished = {};   // shown/finished: handler calls and done() calls per report type (for tests)

  // ------------------------------------------------------------------ small helpers
  function rec(e, where) {
    const m = 'moments' + (where ? ' ' + where : '') + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
    errors.push(m); if (errors.length > 40) errors.shift();
    try { if (window.ZT && ZT.errors) ZT.errors.push(m); console.warn('[moments]', m); } catch (x) { /* none */ }
  }
  const once = fn => { let n = false; return function () { if (n) return; n = true; if (fn) { try { fn.apply(null, arguments); } catch (e) { rec(e, 'done'); } } }; };
  const SPR = () => window.ZSprites || null;
  const aUrl = (sp, o, s) => { try { const p = SPR(); return p && p.animalUrl ? p.animalUrl(sp, o || {}, s || 5) : null; } catch (e) { return null; } };
  const pUrl = (k, s, o) => { try { const p = SPR(); return p && p.personUrl ? p.personUrl(k || 'person', o || {}, s || 5) : null; } catch (e) { return null; } };
  const iUrl = (n, s) => { try { const p = SPR(); return p && p.iconUrl ? p.iconUrl(n, s || 4) : null; } catch (e) { return null; } };
  const bUrl = (id, s) => { try { const p = SPR(); return p && p.buildingUrl ? p.buildingUrl(id, s || 3) : null; } catch (e) { return null; } };
  const tUrl = (k, s) => { try { const p = SPR(); return p && p.tileUrl ? p.tileUrl(k, s || 2) : null; } catch (e) { return null; } };
  const pic = (u, cls) => u ? el('img', { cls: 'px ' + (cls || ''), src: u, alt: '' }) : el('span', { cls: 'mo-nopic' });
  const spOf = id => D.SPECIES[id] || { id: id, name: String(id || 'Animal'), rarity: 1, biome: 'savanna', variant: 'Rare' };
  const animalName = f => { const s = spOf(f.sp); return (f.variant && s.variant ? s.variant + ' ' : '') + s.name; };
  const rarityName = r => (D.RARITY.name[r] || 'Common');
  const rarityColor = r => { try { const c = SPR() && SPR().PALETTE && SPR().PALETTE.rarity; return (c && c[r]) || null; } catch (e) { return null; } };
  const sgn = n => (n > 0 ? '+' : '') + n;
  function habLine(hab) {
    if (hab == null) return 'Holding pen';
    const it = E.item(S(), hab); return it ? E.habName(S(), it) : 'Holding pen';
  }
  // Symbols instead of words for stats and skills (names and icon keys come from ZD.ASTAT / ZD.SKILL when they exist).
  const hasIcon = n => { try { const p = SPR(); return !!(p && p.ICONS && p.ICONS.indexOf(n) >= 0); } catch (e) { return false; } };
  const ASTAT_FB = { charm: { name: 'Charm', icon: 'stat-charm' }, vigor: { name: 'Energy', icon: 'stat-vigor' }, wit: { name: 'Smarts', icon: 'stat-wit' } };
  const SKILL_FB = { care: { name: 'Care', icon: 'skill-care' }, sci: { name: 'Science', icon: 'skill-sci' }, exp: { name: 'Scouting', icon: 'skill-exp' }, charm: { name: 'Hosting', icon: 'skill-charm' } };
  const ASTAT = k => (D.ASTAT && D.ASTAT[k]) || ASTAT_FB[k] || { name: String(k), icon: 'star' };
  const SKILL = k => (D.SKILL && D.SKILL[k]) || SKILL_FB[k] || { name: String(k), icon: 'star' };
  // A symbol: the pixel icon if it exists, otherwise a one-letter stand-in (only until the art lands).
  function sym(icon, fb, name, scale) {
    const u = hasIcon(icon) ? iUrl(icon, scale || 3) : null;
    const e = u ? el('img', { cls: 'px mo-symg', src: u, alt: name || '' }) : el('span', { cls: 'mo-symt' }, fb || '');
    return el('span', { cls: 'mo-sym', title: name || '' }, e);
  }
  const astatSym = k => sym(ASTAT(k).icon, ASTAT(k).name.charAt(0), ASTAT(k).name);
  const skillSym = k => sym(SKILL(k).icon, SKILL(k).name.charAt(0), SKILL(k).name);
  function chip(icon, text, cls) { return el('span', { cls: 'mo-chip' + (cls ? ' ' + cls : '') }, icon ? pic(iUrl(icon, 3), 'mo-cico') : null, el('b', text)); }
  function stats3(a, st) {   // three big stat boxes with numbers that count up
    const row = el('div', { cls: 'mo-stats' });
    [['charm'], ['vigor'], ['wit']].forEach((k, i) => {
      const num = el('span', { cls: 'mo-snum' }, st && !st.instant ? '0' : String(a[k[0]] == null ? '?' : a[k[0]]));
      const box = el('div', { cls: 'mo-stat ' + k[0] }, el('i', astatSym(k[0])), num);
      if (st) { st.anim(box, st.t(950 + i * 160)); if (a[k[0]] != null) st.count(num, a[k[0]], st.t(500), st.t(1050 + i * 160)); }
      row.appendChild(box);
    });
    return row;
  }
  function moneyOf(n) { return fmt.money(Math.round(n)); }

  // ------------------------------------------------------------------ styles (injected once, all prefixed mo-)
  function injectStyle() {
    if (document.getElementById('mo-style')) return;
    const css = `
.mo .pbody { padding: 12px 10px; gap: 8px; }
.mo-card { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; width: 100%; padding: 4px 0 0; }
.mo-kicker { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink2); }
.mo-title { font-size: 21px; line-height: 1.15; }
.mo-line { font-size: 14px; color: var(--ink2); line-height: 1.3; }
.mo-line.hi { color: var(--ink); font-size: 16px; }
.mo-big { font-size: 42px; line-height: 1; text-shadow: 2px 2px 0 var(--cream2); }
.mo-big small { font-size: 20px; color: var(--ink2); }
.mo-good .mo-big, .mo-good.mo-big { color: var(--good); } .mo-bad .mo-big, .mo-bad.mo-big { color: var(--bad); } .mo-gold .mo-big, .mo-gold.mo-big { color: var(--gold-d); }
.mo-hint { margin-top: 4px; font-size: 13px; color: var(--ink2); animation: blink 1.1s steps(2) infinite; }
.mo-hint::after { content: " \\25BC"; font-size: 10px; }
.mo-pic { height: 140px; display: flex; align-items: flex-end; justify-content: center; position: relative; }
.mo-pic img { max-height: 100%; max-width: 100%; image-rendering: pixelated; }
.mo-pic.small { height: 84px; } .mo-pic.tiny { height: 56px; }
.mo-nopic { display: inline-block; width: 60px; height: 60px; background: var(--cream2); }
.mo-in { animation: mo-pop .3s steps(5) both; animation-delay: var(--d, 0ms); }
@keyframes mo-pop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.mo-unveil { animation: mo-unveil var(--dur, .9s) steps(9) both; }
@keyframes mo-unveil { 0%, 55% { filter: brightness(0); transform: scale(.82); } 75% { filter: brightness(2.2); transform: scale(1.14); } 100% { filter: none; transform: scale(1); } }
.mo-shake { animation: mo-shake .4s steps(4) infinite; } @keyframes mo-shake { 25% { transform: translateX(-4px) rotate(-3deg); } 75% { transform: translateX(4px) rotate(3deg); } }
.mo-fast .mo-in, .mo-fast .mo-unveil { animation: none !important; }
.mo-fast .mo-shake { animation: none !important; }
.mo-stars { min-height: 24px; }
.mo-stars .star { width: 20px; height: 20px; }
.mo-stars .stars { gap: 4px; }
.mo-rar { font-size: 15px; letter-spacing: .04em; text-transform: uppercase; }
.mo-tag { display: inline-block; padding: 2px 8px; font-size: 12px; color: #fff; background: var(--blue); box-shadow: 0 0 0 2px var(--bd); text-shadow: 1px 1px 0 rgba(0,0,0,.35); }
.mo-tag.gold { background: var(--gold-d); } .mo-tag.green { background: var(--green-d); } .mo-tag.red { background: var(--red); }
.mo-stats { display: flex; gap: 8px; width: 100%; justify-content: center; }
.mo-stat { text-align: center; flex: 1; max-width: 108px; background: var(--paper); box-shadow: 0 0 0 2px var(--bd); display: flex; flex-direction: column; align-items: stretch; }
.mo-stat i { font-style: normal; font-size: 11px; padding: 3px 0; color: #fff; text-shadow: 1px 1px 0 rgba(0,0,0,.4); }
.mo-stat.charm i { background: var(--charm); } .mo-stat.vigor i { background: var(--vigor); } .mo-stat.wit i { background: var(--wit); }
.mo-snum { font-size: 28px; padding: 5px 0 6px; line-height: 1; }
.mo-grade { position: absolute; top: 0; right: 0; min-width: 30px; padding: 3px 7px; font-size: 16px; background: var(--ink); color: var(--gold); box-shadow: 0 0 0 2px #000; }
.mo-rare { background: #fff3b8; box-shadow: 0 -3px 0 0 var(--gold-d), 0 3px 0 0 var(--gold-d), -3px 0 0 0 var(--gold-d), 3px 0 0 0 var(--gold-d), inset 0 0 0 4px var(--gold); padding: 10px 6px 6px; margin: 3px 0; }
.mo-sym { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; } .mo-symg { height: 20px; width: auto; image-rendering: pixelated; } .mo-symt { font-size: 12px; }
.mo-stat i .mo-symg, .mo-roll .nm .mo-symg { height: 22px; } .mo-m b .mo-symg { height: 14px; } .mo-line .mo-symg { height: 22px; }
.mo-roll .nm { width: 44px; text-align: center; padding: 3px 0; display: flex; justify-content: center; }
.mo-chip.main { box-shadow: 0 0 0 3px var(--blue); }
.mo-medalbox { min-width: 62px; text-align: center; display: inline-flex; justify-content: center; } .mo-medalbox .mo-symg { height: 36px; } .mo-bigmedal .mo-symg { height: 96px; }
.mo-odds .mo-symg { height: 16px; }
.mo-optbody img, .mo-optbody .costline img, .mo-optbody .odds img { height: 20px; width: auto; max-width: none; image-rendering: pixelated; }
.mo-optbody .odds { display: inline-flex; align-items: center; gap: 6px; flex: 1; min-width: 150px; } .mo-optbody .odds .bar { min-width: 60px; height: 12px; } .mo-optbody .odds b { font-size: 13px; min-width: 36px; }
.mo-optpic > img { height: 52px; width: auto; max-width: 64px; }
.mo-det {display: flex; align-items: center; gap: 4px; font-size: 15px; } .mo-det .mo-symg { height: 20px; }
.mo-optbody .lbl { font-size: 17px; } .mo-optbody .meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; } .mo-optbody .sub { font-size: 13px; color: var(--ink2); }
.mo-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.mo-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--paper); padding: 4px 10px 4px 6px; min-height: 32px; font-size: 16px; box-shadow: 0 0 0 2px var(--bd); }
.mo-chip img { height: 22px; width: auto; image-rendering: pixelated; }
.mo-chip.bad b { color: var(--bad); } .mo-chip.good b { color: var(--good); }
.mo-head { display: flex; align-items: center; gap: 12px; padding: 2px 4px 6px; }
.mo-head .mo-pic { height: 92px; min-width: 64px; flex: none; } .mo-head .mo-who { flex: 1; text-align: left; font-size: 16px; line-height: 1.3; }
.mo-head .mo-pic + .mo-pic { margin-left: -6px; }
.mo-crits { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; }
.mo-crit { background: var(--paper); box-shadow: 0 0 0 2px var(--bd); padding: 6px 4px 8px; display: flex; flex-direction: column; gap: 2px; }
.mo-crit i { font-style: normal; font-size: 12px; color: var(--ink2); text-transform: uppercase; letter-spacing: .06em; }
.mo-crit b { font-size: 34px; line-height: 1.1; color: #9a8a70; } .mo-crit b small { font-size: 15px; color: var(--ink2); }
.mo-crit.s-hi b { color: var(--good); } .mo-crit.s-mid b { color: var(--ink); } .mo-crit.s-lo b { color: var(--bad); }
.mo-crit.on { animation: mo-pop .3s steps(5) both; }
.mo-roll { display: flex; align-items: center; gap: 6px; width: 100%; background: var(--paper); box-shadow: 0 0 0 2px var(--bd); padding: 4px 8px; min-height: 40px; font-size: 14px; }
.mo-roll .nm { width: 52px; text-align: left; font-size: 13px; color: #fff; padding: 2px 4px; text-shadow: 1px 1px 0 rgba(0,0,0,.4); }
.mo-roll .nm.charm { background: var(--charm); } .mo-roll .nm.vigor { background: var(--vigor); } .mo-roll .nm.wit { background: var(--wit); } .mo-roll .nm.var { background: var(--purple, #8a5cd0); width: 52px; }
.mo-roll .par { color: var(--ink2); font-size: 12px; min-width: 62px; text-align: left; }
.mo-roll .val { font-size: 24px; min-width: 40px; text-align: right; }
.mo-roll .dl { font-size: 14px; min-width: 62px; text-align: left; }
.mo-roll .dl.up { color: var(--good); } .mo-roll .dl.dn { color: var(--bad); }
.mo-roll.lucky { background: #fff3b8; box-shadow: 0 0 0 2px var(--gold-d); } .mo-roll.lucky .dl { color: var(--gold-d); font-size: 15px; }
.mo-rolls { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.mo-opt .lbl { font-size: 17px; }
.btn.opt.mo-optpic { flex-direction: row; align-items: center; gap: 10px; }
.mo-optbody { display: flex; flex-direction: column; gap: 3px; flex: 1; text-align: left; min-width: 0; }
.mo-optpic img { height: 52px; width: auto; max-width: 64px; image-rendering: pixelated; flex: none; }
.mo-dots { font-size: 44px; letter-spacing: 8px; line-height: 1; color: var(--ink2); }
.mo-dots i { font-style: normal; display: inline-block; animation: mo-dot .6s steps(2) infinite; } .mo-dots i:nth-child(2) { animation-delay: .15s; } .mo-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes mo-dot { 50% { transform: translateY(-8px); opacity: .4; } }
.mo-crate { width: 110px; height: 90px; background: #b9803f; position: relative; box-shadow: 0 0 0 3px var(--bd), inset 0 -8px 0 rgba(0,0,0,.2), inset 0 6px 0 rgba(255,255,255,.2); margin-top: 16px; }
.mo-crate::before { content: "?"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 56px; color: var(--gold); text-shadow: 3px 3px 0 var(--bd); }
.mo-crate::after { content: ""; position: absolute; left: -3px; right: -3px; top: 20px; height: 8px; background: #7a5226; box-shadow: 0 0 0 2px var(--bd); }
.mo-row { display: flex; align-items: center; gap: 8px; width: 100%; background: var(--paper); box-shadow: 0 0 0 2px var(--line); padding: 5px 8px 5px 5px; min-height: 56px; text-align: left; }
.mo-row .mo-pic { height: 50px; width: 54px; flex: none; background: #bfe0a0; box-shadow: 0 0 0 2px var(--bd); align-items: center; }
.mo-row .mo-pic img { max-height: 46px; max-width: 50px; }
.mo-row .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.mo-row .mid .t { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mo-row .mid .s { font-size: 12px; color: var(--ink2); }
.mo-row .mid .chips { gap: 2px; } .mo-row .mid .chip { font-size: 12px; }
.mo-row .btn { min-height: 44px; min-width: 84px; margin: 3px; padding: 4px 8px; font-size: 14px; }
.mo-mini { display: flex; gap: 8px; font-size: 14px; } .mo-m b { display: inline-block; min-width: 14px; margin-right: 2px; padding: 0 2px; font-size: 11px; color: #fff; text-align: center; }
.mo-m.charm b { background: var(--charm); } .mo-m.vigor b { background: var(--vigor); } .mo-m.wit b { background: var(--wit); }
.mo-mini.small { gap: 5px; font-size: 13px; } .mo-mini.small .mo-m b { min-width: 0; margin-right: 2px; }
.mo-crate.mini { width: 36px; height: 30px; margin: 0; } .mo-crate.mini::before { font-size: 20px; text-shadow: 1px 1px 0 var(--bd); } .mo-crate.mini::after { top: 6px; height: 3px; }
.mo-rows { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.mo-tbl { width: 100%; border-collapse: collapse; font-size: 14px; }
.mo-tbl td { padding: 4px 6px; text-align: left; border-bottom: 1px solid var(--line); } .mo-tbl td.n { text-align: right; width: 56px; } .mo-tbl td.p { width: 28px; color: var(--ink2); }
.mo-tbl tr.me td { background: #fff3b8; font-weight: 800; }
.mo-tbl tr.gap td { text-align: center; color: var(--ink2); font-size: 12px; padding: 0; border: 0; }
.mo-awards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; }
.mo-award { background: var(--paper); box-shadow: 0 0 0 2px var(--bd); padding: 8px 6px; min-height: 76px; display: flex; flex-direction: column; justify-content: center; gap: 3px; }
.mo-award i { font-style: normal; font-size: 13px; } .mo-award b { font-size: 16px; color: #9a8a70; } .mo-award small { font-size: 11px; color: var(--ink2); }
.mo-award.won { background: #fff3b8; box-shadow: 0 0 0 3px var(--gold-d); } .mo-award.won b { color: var(--gold-d); } .mo-award.lost { opacity: .75; }
.mo-award.mo-hid { visibility: hidden; }
.mo-award:last-child { grid-column: 1 / -1; }
.mo-score { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 6px 10px; background: var(--paper); box-shadow: 0 0 0 2px var(--line); font-size: 15px; }
.mo-score b { font-size: 18px; }
.mo-score.tot { background: #fff3b8; box-shadow: 0 0 0 3px var(--gold-d); font-size: 18px; } .mo-score.tot b { font-size: 26px; color: var(--gold-d); }
.mo-pips { display: flex; gap: 6px; justify-content: center; } .mo-pips i { width: 18px; height: 18px; background: #6b5a3c; box-shadow: 0 0 0 2px var(--bd); } .mo-pips i.on { background: var(--gold); }
.mo-thumbs { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
.mo-thumbs .mo-pic { height: 44px; width: 52px; background: #bfe0a0; box-shadow: 0 0 0 2px var(--bd); align-items: center; } .mo-thumbs img { max-height: 40px; max-width: 48px; }
.mo-bad .ptitle, .mo.bad .ptitle { background: var(--red); text-shadow: 2px 2px 0 var(--red-d), 0 0 1px var(--bd); }
.mo-medal { display: inline-block; padding: 6px 16px; font-size: 26px; color: #fff; box-shadow: 0 0 0 3px var(--bd); text-shadow: 2px 2px 0 rgba(0,0,0,.35); }
.mo-medal.gold { background: var(--gold-d); } .mo-medal.silver { background: #8c97a3; } .mo-medal.bronze { background: #a8693a; } .mo-medal.none { background: #9a8a70; }
.mo-odds { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; width: 100%; } .mo-odds span { font-size: 12px; background: var(--paper); box-shadow: 0 0 0 2px var(--line); padding: 3px 6px; }
.mo-sec { width: 100%; }
.mo-top { flex: none; } .mo-foot.pfoot { padding: 6px 10px calc(8px + 0px); } .mo-foot .btn { min-height: 56px; } .mo-foot .stack { gap: 4px; }
.mo .panel { max-height: 100%; }
.mo-input { text-align: center; font-size: 18px; }
.mo-pick { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.mo-pick .mo-row.sel { background: #fff3b8; box-shadow: 0 0 0 3px var(--gold-d); }
.mo-row.tap { cursor: pointer; }
@media (max-height: 700px) { .mo-pic { height: 100px; } .mo-big { font-size: 34px; } }
@media (prefers-reduced-motion: reduce) { .mo-in, .mo-unveil, .mo-shake, .mo-dots i, .mo-crit.on, .mo-hint { animation: none !important; } }
`;
    const st = document.createElement('style'); st.id = 'mo-style'; st.textContent = css; (document.head || document.documentElement).appendChild(st);
  }

  // ------------------------------------------------------------------ the moment frame: one modal screen, content swapped inside it
  function open(id, build, done, o) {
    o = o || {}; injectStyle();
    const d = once(done);
    const M = { id: id, ended: false, timers: [], born: performance.now(), lockUntil: 0, tap: null, api: null, i: 0, st: null };
    M.later = (fn, ms) => { const h = setTimeout(() => { M.timers = M.timers.filter(x => x !== h); if (M.ended) return; try { fn(); } catch (e) { rec(e, id); } }, Math.max(0, ms)); M.timers.push(h); return h; };
    M.clear = () => { M.timers.forEach(clearTimeout); M.timers = []; };
    M.end = () => { if (M.ended) return; M.ended = true; M.clear(); try { if (M.api) M.api.pop(); } catch (e) { rec(e, id + ' pop'); } d(); };
    // Pinned parts outside the scrolling body: M.head(node) above it, M.foot(node) below it (cleared on every render).
    const part = (kind, nodes) => {
      const panel = M.api && M.api.el && M.api.el.querySelector('.panel'); if (!panel) return;
      let box = panel.querySelector(':scope > .mo-' + (kind === 'head' ? 'top' : 'foot'));
      if (!box) { box = el('div', { cls: kind === 'head' ? 'mo-top' : 'mo-foot pfoot' }); const b = panel.querySelector('.pbody'); if (kind === 'head') panel.insertBefore(box, b); else panel.appendChild(box); }
      nodes.forEach(n => n && box.appendChild(n));
    };
    M.head = (...n) => part('head', n); M.foot = (...n) => part('foot', n);
    M.clearParts = () => { try { const panel = M.api && M.api.el && M.api.el.querySelector('.panel'); if (panel) [].forEach.call(panel.querySelectorAll(':scope > .mo-top, :scope > .mo-foot'), x => x.remove()); } catch (e) { /* none */ } };
    M.rerender = () => { try { if (M.api && !M.ended) M.api.rerender(); } catch (e) { rec(e, id + ' rerender'); } };
    M.tone = t => { try { const p = M.api && M.api.el && M.api.el.querySelector('.panel'); if (p) p.classList.toggle('bad', t === 'bad'); } catch (e) { /* none */ } };
    let api = null;
    try {
      api = Z.push({
        id: id, modal: true, title: o.title, cls: 'mo ' + (o.cls || ''),
        render(body, a) { M.clear(); M.api = a; M.clearParts(); body.textContent = ''; try { build(body, M, a); } catch (e) { rec(e, id); M.end(); } },
        onClose() { if (!M.ended) { M.ended = true; M.clear(); d(); } }
      });
    } catch (e) { rec(e, id + ' push'); }
    if (!api) { M.ended = true; d(); return null; }
    M.api = api;
    api.el.addEventListener('click', ev => {
      if (M.ended || !M.tap) return;
      const t = ev.target; if (t && t.closest && t.closest('button, input, textarea, select, .mo-noskip')) return;
      const now = performance.now(); if (now - M.born < 320 || now < M.lockUntil) return;
      try { M.tap(); } catch (e) { rec(e, id + ' tap'); }
    });
    return M;
  }

  // A sequence of beats inside one moment. step = {ms, anim, render(card, st), noEnd}. Steps with ms advance by themselves;
  // the last step waits for a tap (a tap finishes its animation first). A tap on a running beat completes it and holds there.
  function mkState(M, instant, card) {
    const st = { instant: instant, fins: [], finished: false, card: card };
    st.t = ms => ms;
    st.at = (ms, fn) => { let ran = false; const run = () => { if (ran) return; ran = true; fn(); }; if (instant) { run(); return; } M.later(run, ms); st.fins.push(run); };
    st.anim = (node, d) => { node.classList.add('mo-in'); node.style.setProperty('--d', Math.round(d || 0) + 'ms'); return node; };
    st.count = (node, to, ms, delay, fm) => {
      fm = fm || (v => String(Math.round(v)));
      const fin = () => { node.textContent = fm(to); };
      if (instant) { fin(); return; }
      node.textContent = fm(0); const t0 = Date.now() + delay;
      const tick = () => { const p = (Date.now() - t0) / ms; if (p >= 1) { fin(); return; } if (p > 0) node.textContent = fm(to * p); M.later(tick, 45); };
      M.later(tick, 45); st.fins.push(fin);
    };
    st.finish = () => { if (st.finished) return; st.finished = true; M.clear(); card.classList.add('mo-fast'); st.fins.forEach(f => { try { f(); } catch (e) { rec(e, 'finish'); } }); };
    return st;
  }
  function sequence(M, body, steps, o) {
    o = o || {};
    const card = el('div', { cls: 'mo-card' }); body.appendChild(card);
    let i = Math.min(M.i || 0, steps.length - 1);
    const isFinal = () => i >= steps.length - 1;
    function show(instant) {
      M.clear(); card.textContent = ''; card.className = 'mo-card' + (instant ? ' mo-fast' : '');
      const step = steps[i]; M.i = i;
      const st = mkState(M, instant, card); M.st = st;
      try { if (window.ZMoments) window.ZMoments.cur = { id: M.id, i: i, n: steps.length, final: isFinal(), at: Date.now() }; } catch (e) { /* none */ }
      try { step.render(card, st, i); } catch (e) { rec(e, 'step'); }
      st.endAt = Date.now() + (instant ? 0 : (step.anim != null ? step.anim : Math.round((step.ms || 1500) * 0.9)));
      M.lockUntil = performance.now() + (isFinal() && !instant ? 450 : 0);
      if (instant) st.finish();
      else if (!isFinal() && step.ms) M.later(next, step.ms);
    }
    function next() { if (M.ended) return; if (i < steps.length - 1) { i++; show(false); } else M.end(); }
    M.tap = () => {
      const st = M.st, step = steps[i];
      if (step.skipToFinal && !isFinal()) { i = steps.length - 1; show(false); return; }   // one tap skips straight to the last card
      if (st && !st.finished && Date.now() < st.endAt) { st.finish(); return; }   // first tap completes the beat and holds
      if (isFinal()) { if (!step.noEnd) M.end(); return; }
      next();
    };
    show(!!M.shown); M.shown = true;
  }
  const hint = t => el('div', { cls: 'mo-hint' }, t || 'Tap to continue');
  function card0(card, tone) { if (tone) card.classList.add('mo-' + tone); }

  // ------------------------------------------------------------------ animal reveal (expedition find, crate, trader, reusable)
  function animalStep(f, o) {
    o = o || {};
    const s = spOf(f.sp), r = f.rarity || s.rarity || 1, scale = o.f || 1;
    return {
      ms: o.ms, anim: o.ms ? Math.round(o.ms * 0.92) : 1700,
      render(card, st) {
        const T = ms => ms * scale;
        st.t = T;
        card.classList.toggle('mo-rare', r >= 4);
        if (o.kicker) card.appendChild(el('div', { cls: 'mo-kicker' }, o.kicker));
        const stars = ui.stars(r, r); stars.classList.add('big'); const sw = el('div', { cls: 'mo-stars' }, stars);
        [].forEach.call(stars.children, (c, k) => st.anim(c, T(120 + k * 110)));
        card.appendChild(sw);
        const rn = el('div', { cls: 'mo-rar', style: { color: rarityColor(r) && r >= 3 ? '#8a5a00' : '' } }, rarityName(r));
        st.anim(rn, T(150)); card.appendChild(rn);
        const p = pic(aUrl(f.sp, { variant: !!f.variant, juv: !!f.juv }, 5), 'mo-unveil'); p.style.setProperty('--dur', (T(1000) / 1000) + 's');
        const pw = el('div', { cls: 'mo-pic' }, p);
        const avg = (f.charm + f.vigor + f.wit) / 3;
        if (isFinite(avg)) { const g = el('span', { cls: 'mo-grade' }, E.grade(avg)); st.anim(g, T(1000)); pw.appendChild(g); }
        card.appendChild(pw);
        const nm = el('div', { cls: 'mo-title' }, animalName(f)); st.anim(nm, T(700)); card.appendChild(nm);
        const tags = el('div', { cls: 'mo-chips' });
        if (f.isNew || o.isNew) tags.appendChild(st.anim(el('span', { cls: 'mo-tag gold' }, 'New species!'), T(800)));
        if (f.variant) tags.appendChild(st.anim(el('span', { cls: 'mo-tag' }, 'Rare variant'), T(850)));
        if (tags.children.length) card.appendChild(tags);
        card.appendChild(stats3(f, st));
        if (o.hab !== undefined) { const hl = el('div', { cls: 'mo-line' }, o.hab == null ? 'Goes to the holding pen' : 'Lives in ' + habLine(o.hab)); st.anim(hl, T(1500)); card.appendChild(hl); }
        if (!o.ms) card.appendChild(hint());
      }
    };
  }
  function revealAnimal(a, opts, done) {
    opts = opts || {};
    if (!a || a.sp == null) { once(done)(); return null; }
    const f = { sp: a.sp, variant: a.variant, charm: a.charm, vigor: a.vigor, wit: a.wit, rarity: opts.rarity || spOf(a.sp).rarity, isNew: opts.isNew, juv: opts.juv };
    return open('mo-animal', (body, M) => sequence(M, body, [animalStep(f, { kicker: opts.kicker, hab: opts.hab, isNew: opts.isNew })]), done);
  }
  function crateStep() {
    return { ms: 1100, anim: 1000, render(card, st) {
      card.appendChild(el('div', { cls: 'mo-kicker' }, 'Mystery crate'));
      card.appendChild(el('div', { cls: 'mo-pic' }, el('div', { cls: 'mo-crate mo-shake' })));
      card.appendChild(el('div', { cls: 'mo-line hi' }, 'Opening...'));
    } };
  }
  function revealCrate(res, done) {
    if (!res || !res.animal) { once(done)(); return null; }
    const a = res.animal;
    return open('mo-crate', (body, M) => sequence(M, body, [crateStep(), animalStep({ sp: a.sp, variant: a.variant, charm: a.charm, vigor: a.vigor, wit: a.wit, rarity: res.rarity || spOf(a.sp).rarity, isNew: res.isNew }, { kicker: 'Mystery crate', hab: res.hab, isNew: res.isNew })]), done);
  }

  // ------------------------------------------------------------------ simple card (also reusable by Menus)
  function cardStep(o) {
    return { ms: o.ms, noEnd: o.noEnd, anim: o.anim, render(card, st) {
      if (o.tone) card.classList.add('mo-' + o.tone);
      if (o.rare) card.classList.add('mo-rare');
      if (o.kicker) card.appendChild(el('div', { cls: 'mo-kicker' }, o.kicker));
      if (o.img) card.appendChild(st.anim(el('div', { cls: 'mo-pic' + (o.imgCls ? ' ' + o.imgCls : '') }, o.img.nodeType ? o.img : pic(o.img)), 0));
      if (o.title) card.appendChild(st.anim(el('div', { cls: 'mo-title' }, o.title), 100));
      if (o.big != null) { const b = el('div', { cls: 'mo-big' }, ''); card.appendChild(st.anim(b, 180)); if (typeof o.big === 'number') st.count(b, o.big, 700, 250, o.bigFmt); else if (o.big.nodeType) b.appendChild(o.big); else b.textContent = o.big; }
      if (o.stars != null) { const s = ui.stars(o.stars, o.starsMax || o.stars); s.classList.add('big'); card.appendChild(st.anim(el('div', { cls: 'mo-stars' }, s), 200)); }
      (o.lines || []).forEach((l, k) => { if (l == null || l === '') return; card.appendChild(st.anim(l.nodeType ? l : el('div', { cls: 'mo-line' + (k === 0 && !o.title ? ' hi' : '') }, l), 300 + k * 90)); });
      if (o.chips && o.chips.length) card.appendChild(st.anim(el('div', { cls: 'mo-chips' }, o.chips), 450));
      if (o.extra) { const x = typeof o.extra === 'function' ? o.extra(st) : o.extra; if (x) card.appendChild(x); }
      if (!o.ms && !o.noHint) card.appendChild(hint(o.hint));
    } };
  }
  function simpleCard(id, o, done) { return open(id, (body, M) => sequence(M, body, [cardStep(o)]), done); }
  // Public: ZMoments.result({title, lines, good, img, big, kicker, chips}, done)
  function result(o, done) {
    o = Object.assign({}, o || {}); if (o.good != null && !o.tone) o.tone = o.good ? 'good' : 'bad';
    if (typeof o.lines === 'string') o.lines = [o.lines];
    return simpleCard('mo-result', o, done);
  }

  // ------------------------------------------------------------------ choices (project choices and happenings)
  // Option rows (same look as ui.choices) whose detail line uses symbols: stat or skill icon + number, cost and odds symbols,
  // an animal or staff portrait. Reads the option's fields (stat, animal, gain, skill, staff), never its note text.
  function optDetail(op) {
    const st = S();
    if (op.stat && op.animal != null) {
      const an = E.animal(st, op.animal);
      return { det: el('span', { cls: 'mo-det' }, astatSym(op.stat), ' ' + (an ? an[op.stat] : '?') + '  \u2192 ' + (op.gain != null ? '+' + (+op.gain).toFixed(1) : '')), img: an ? aUrl(an.sp, { variant: !!an.variant }, 4) : null };
    }
    if (op.skill) {
      const sf = op.staff != null ? E.staffer(st, op.staff) : null;
      const det = el('span', { cls: 'mo-det' }, skillSym(op.skill), (sf && sf[op.skill] != null ? ' ' + sf[op.skill] : ''), op.gain != null ? '  \u2192 +' + op.gain : '');
      return { det: det, keepNote: op.gain == null, img: sf ? pUrl(sf.role, 4) : null };
    }
    return null;
  }
  function optionButtons(options, onPick) {
    const wrap = el('div', { cls: 'choices n' + (options || []).length });
    (options || []).forEach((op, i) => {
      const st = S(), poor = (op.cost && op.cost > st.money) || (op.costRp && op.costRp > st.rp), off = op.disabled || poor;
      const d = optDetail(op);
      const b = ui.btn(op.label, () => onPick(i, op), { disabled: off, cls: 'opt' + (op.cls ? ' ' + op.cls : '') });
      b.textContent = '';
      const body = el('div', { cls: 'mo-optbody' }, el('span', { cls: 'lbl' }, op.label));
      if (d && d.det) body.appendChild(d.det);
      if ((!d || d.keepNote) && op.note) body.appendChild(el('span', { cls: 'sub' }, op.note));
      const meta = [];
      if (op.cost || op.costRp) meta.push(ui.cost ? ui.cost(Object.assign({}, op.cost ? { money: op.cost } : {}, op.costRp ? { rp: op.costRp } : {})) : el('span', { cls: 'cost' }, op.cost ? fmt.money(op.cost) : op.costRp + ' RP'));
      if (op.odds != null) meta.push(typeof op.odds === 'number' ? el('span', { cls: 'odds' }, sym('odds', '', 'odds'), ui.bar(op.odds, { cls: 'gold' }), el('b', Math.round(op.odds * 100) + '%')) : el('span', { cls: 'odds txt' }, String(op.odds)));
      if (meta.length) body.appendChild(el('span', { cls: 'meta' }, meta));
      if (d && d.img) { b.classList.add('mo-optpic'); b.appendChild(el('img', { cls: 'px', src: d.img, alt: '' })); }
      b.appendChild(body);
      wrap.appendChild(b);
    });
    return wrap;
  }
  const HAP_ICON = { heat: 'flame', storm: 'busy', powercut: 'rp', spring: 'heart', coins: 'coin', donor: 'coin', sale: 'coin', feature: 'rep', school: 'heart', tv: 'star', viral: 'star' };
  function headerFor(spec) {
    const h = el('div', { cls: 'mo-head' });
    let any = false;
    if (spec.who) { const u = pUrl(spec.who, 5); if (u) { h.appendChild(el('div', { cls: 'mo-pic' }, pic(u))); any = true; } }
    let au = null, a = null;
    if (spec.newAnimal) au = aUrl(spec.newAnimal.sp, { variant: !!spec.newAnimal.variant, juv: !!spec.newAnimal.juv }, 4);
    else if (spec.animal != null) { a = E.animal(S(), spec.animal); if (a) au = aUrl(a.sp, { variant: !!a.variant }, 4); }
    if (au) { h.appendChild(el('div', { cls: 'mo-pic' }, pic(au))); any = true; }
    if (!any) { const iu = iUrl(spec.icon || 'star', 8); if (iu) h.appendChild(el('div', { cls: 'mo-pic small' }, pic(iu))); }
    h.appendChild(el('div', { cls: 'mo-who' }, spec.text || ''));
    return h;
  }
  // spec: {id, title, text, who, animal, newAnimal, icon, options, valid():bool, resolve(i):result, pre?(body)}
  function choiceScreen(spec, done) {
    return open(spec.id, (body, M, api) => {
      if (M.result) {
        const r = M.result, odds = M.optOdds != null, tone = r.good ? 'good' : 'bad';
        M.tone(r.good ? 'good' : 'bad'); api.setTitle(r.good ? (odds ? 'It worked!' : 'Good call') : (odds ? 'No luck' : 'Setback'));
        const steps = [];
        if (odds) steps.push({ ms: 750, anim: 650, render(card, st) { card.appendChild(el('div', { cls: 'mo-line hi' }, M.optLabel || '')); card.appendChild(el('div', { cls: 'mo-dots' }, el('i', '.'), el('i', '.'), el('i', '.'))); } });
        steps.push(cardStep({ tone: tone, img: iUrl(r.good ? 'star' : 'sick', 8), imgCls: 'small', lines: [r.text || ''], anim: 400 }));
        sequence(M, body, steps); return;
      }
      if (spec.valid && !spec.valid()) { M.end(); return; }
      M.tone(spec.bad ? 'bad' : '');
      body.appendChild(headerFor(spec));
      if (spec.pre) spec.pre(body);
      body.appendChild(optionButtons(spec.options || [], i => {
        if (M.picked) return;
        if (spec.valid && !spec.valid()) { M.end(); return; }
        const r = spec.resolve(i);
        if (!r || r.ok === false) { if (spec.valid && !spec.valid()) M.end(); return; }   // refused: the shell already toasted why
        M.picked = true; M.result = r; M.optOdds = (spec.options[i] || {}).odds; M.optLabel = (spec.options[i] || {}).label; M.i = 0; M.shown = false;
        M.rerender();
      }));
    }, done, { title: spec.title });
  }
  const projChoice = pid => { const p = E.project(S(), pid); return p && p.choice ? p : null; };
  function choiceMoment(pid, done) {
    const p = projChoice(pid);
    if (!p) { once(done)(); return null; }
    const c = p.choice;
    return choiceScreen({
      id: 'mo-choice', title: c.title || 'Decision', text: c.text, who: c.who, options: c.options,
      icon: p.type === 'expedition' ? 'star' : p.type === 'breed' ? 'heart' : 'flame',
      valid: () => !!projChoice(pid), resolve: i => Z.act('resolveChoice', pid, i)
    }, done);
  }
  function happeningSpec(rep) {
    const h = S().happening, same = h && h.key === rep.key;
    return { id: 'mo-happening', title: rep.title, text: rep.text, who: rep.who, animal: rep.animal, newAnimal: rep.newAnimal, icon: HAP_ICON[rep.key], options: rep.options, bad: !!rep.bad, same: same };
  }
  function happeningMoment(rep, done) {
    if (!rep.options || !rep.options.length) {
      return open('mo-happening', (body, M) => {
        M.tone(rep.bad ? 'bad' : 'good');
        sequence(M, body, [{ anim: 500, render(card, st) {
          card.classList.add(rep.bad ? 'mo-bad' : 'mo-good');
          const hs = el('div', { cls: 'mo-pics', style: { display: 'flex', gap: '4px', justifyContent: 'center' } });
          const wu = rep.who ? pUrl(rep.who, 5) : null; if (wu) hs.appendChild(el('div', { cls: 'mo-pic' }, pic(wu)));
          const sa = rep.animal != null ? E.animal(S(), rep.animal) : null; const au = sa ? aUrl(sa.sp, { variant: !!sa.variant }, 4) : null; if (au) hs.appendChild(el('div', { cls: 'mo-pic' }, pic(au)));
          if (!hs.children.length) { const iu = iUrl(HAP_ICON[rep.key] || (rep.bad ? 'sick' : 'star'), 8); if (iu) hs.appendChild(el('div', { cls: 'mo-pic small' }, pic(iu))); }
          card.appendChild(st.anim(hs, 0));
          card.appendChild(st.anim(el('div', { cls: 'mo-title' }, rep.title), 120));
          card.appendChild(st.anim(el('div', { cls: 'mo-line hi' }, rep.text), 240));
          card.appendChild(hint());
        } }]);
      }, done, { title: null });
    }
    const spec = happeningSpec(rep);
    spec.valid = () => { const h = S().happening; return !!(h && h.key === rep.key && h.options); };
    spec.resolve = i => Z.act('resolveHappening', i);
    // the stray: show its numbers so the choice is informed
    if (rep.newAnimal) spec.pre = body => { const a = rep.newAnimal; body.appendChild(el('div', { cls: 'mo-line center', style: { textAlign: 'center' } }, animalName(a))); body.appendChild(stats3(a)); };
    return choiceScreen(spec, done);
  }

  // ------------------------------------------------------------------ birth
  function birthKidStep(r, k, n, ms) {
    const f = n > 1 ? Math.min(1, (3300 / n) / 2500) : 1;
    return {
      ms: ms, anim: ms ? Math.round(ms * 0.92) : Math.round(2300 * f),
      render(card, st) {
        st.t = x => x * f;
        const kicker = n > 1 ? 'Twins! Baby ' + (k + 1) + ' of ' + n : 'New arrival';
        card.appendChild(el('div', { cls: 'mo-kicker' }, kicker));
        const kid = r.kids[k] || {}; const T = st.t;
        const u = aUrl(kid.sp || r.sp, { juv: true, variant: !!kid.variant }, 5);
        const p = pic(u, 'mo-unveil'); p.style.setProperty('--dur', (T(900) / 1000) + 's');
        card.appendChild(el('div', { cls: 'mo-pic small' }, p));
        card.appendChild(el('div', { cls: 'mo-title' }, (kid.name || 'Baby') + ' the ' + spOf(kid.sp || r.sp).name));
        const rolls = el('div', { cls: 'mo-rolls' });
        (kid.rolls || []).forEach((ro, j) => {
          const val = el('span', { cls: 'val' }, st.instant ? String(ro.value) : '0');
          const d = ro.delta != null ? ro.delta : (ro.value - ro.parents);
          const dl = el('span', { cls: 'dl ' + (ro.lucky ? '' : d >= 0 ? 'up' : 'dn') }, ro.lucky ? 'LUCKY ' + sgn(Math.round(d)) : sgn(Math.round(d)));
          const row = el('div', { cls: 'mo-roll' + (ro.lucky ? ' lucky' : '') }, el('span', { cls: 'nm ' + ro.stat }, astatSym(ro.stat)), el('span', { cls: 'par' }, 'parents ' + Math.round(ro.parents)), val, dl);
          const t0 = T(450 + j * 380);
          st.anim(row, t0); st.count(val, ro.value, T(380), t0 + 120);
          if (!st.instant) { dl.style.visibility = 'hidden'; st.at(t0 + 420, () => { dl.style.visibility = ''; dl.classList.add('mo-in'); }); }
          rolls.appendChild(row);
        });
        // variant roll as its own roll
        const vc = kid.variantChance != null ? Math.round(kid.variantChance * 1000) / 10 : null;
        if (vc != null) {
          const res = el('span', { cls: 'dl ' + (kid.variant ? 'up' : '') }, kid.variant ? 'YES!' : 'no');
          const row = el('div', { cls: 'mo-roll' + (kid.variant ? ' lucky' : '') }, el('span', { cls: 'nm var' }, sym('star', '*', 'rare variant')), el('span', { cls: 'par' }, sym('odds', '', 'chance'), ' ' + vc + '%'), el('span', { cls: 'val', style: { fontSize: '16px', flex: '1' } }, kid.variant ? (spOf(kid.sp || r.sp).variant || 'Rare variant') : ''), res);
          const t0 = T(450 + 3 * 380 + 120); st.anim(row, t0);
          if (!st.instant) { res.style.visibility = 'hidden'; st.at(t0 + 450, () => { res.style.visibility = ''; res.classList.add('mo-in'); }); }
          rolls.appendChild(row);
        }
        card.appendChild(rolls);
        const hl = el('div', { cls: 'mo-line' }, kid.hab == null ? 'Goes to the holding pen' : 'Lives in ' + habLine(kid.hab)); st.anim(hl, T(2000)); card.appendChild(hl);
        if (k === r.kids.length - 1 && r.firstBred) card.appendChild(st.anim(el('span', { cls: 'mo-tag green' }, 'First of its kind born here!'), T(2100)));
        if (!ms) card.appendChild(hint());
      }
    };
  }
  function birthMoment(r, done) {
    if (r.fail || !r.kids || !r.kids.length) {
      const a = E.animal(S(), r.a), s = spOf(r.sp);
      return simpleCard('mo-birth', { tone: 'bad', kicker: 'Breeding', img: aUrl(r.sp, {}, 4), imgCls: 'small', title: 'No baby this time', lines: [(a ? a.name : 'The pair') + ' need a rest. ' + (r.chance != null ? 'Chance was ' + Math.round(r.chance * 100) + '%.' : '')] }, done);
    }
    const n = r.kids.length, ms = n > 1 ? Math.floor(3300 / n) : 0;
    const steps = r.kids.map((_, k) => birthKidStep(r, k, n, k < n - 1 ? ms : 0));
    return open('mo-birth', (body, M) => sequence(M, body, steps), done);
  }

  // ------------------------------------------------------------------ review (four critics, total, hall of fame, rewards)
  function reviewMoment(r, done) {
    const T = D.THEMES[r.theme] || { name: 'Event' };
    const it = E.item(S(), r.hab), hab = it ? E.habName(S(), it) : (D.BIOMES[r.biome] ? D.BIOMES[r.biome].name : 'Habitat');
    const crits = (r.critics || []).slice(0, 4);
    const total = r.total != null ? r.total : crits.reduce((t, c) => t + (c.score || 0), 0);
    const tone = total >= (D.HOF_SCORE || 34) ? 'gold' : total >= 26 ? 'good' : '';
    const stepA = { ms: 2500, anim: 2300, render(card, st) {
      card.appendChild(el('div', { cls: 'mo-kicker' }, 'Critics at ' + hab));
      card.appendChild(el('div', { cls: 'mo-title' }, T.name));
      const grid = el('div', { cls: 'mo-crits' });
      const cells = crits.map((c, k) => {
        const v = el('b', '?'); const cell = el('div', { cls: 'mo-crit' }, el('i', c.name), v);
        grid.appendChild(cell);
        st.at(300 + k * 400, () => { v.textContent = ''; v.appendChild(document.createTextNode(String(c.score))); v.appendChild(el('small', '/10')); cell.classList.add('on', c.score >= 8 ? 's-hi' : c.score >= 5 ? 's-mid' : 's-lo'); });
        return cell;
      });
      card.appendChild(grid);
      const tot = el('div', { cls: 'mo-big' }, '');
      const num = el('span', ''); tot.appendChild(num); tot.appendChild(el('small', ' / 40'));
      tot.style.visibility = st.instant ? '' : 'hidden';
      st.at(300 + crits.length * 400, () => { tot.style.visibility = ''; tot.classList.add('mo-in'); });
      st.count(num, total, 600, 300 + crits.length * 400 + 50);
      card.appendChild(tot);
    } };
    const steps = [stepA];
    if (r.hof) steps.push({ ms: 1100, anim: 900, render(card, st) {
      card.classList.add('mo-rare'); card.appendChild(st.anim(el('div', { cls: 'mo-pic small' }, pic(iUrl('star', 8))), 0));
      card.appendChild(st.anim(el('div', { cls: 'mo-title' }, 'Hall of Fame!'), 120));
      card.appendChild(st.anim(el('div', { cls: 'mo-big mo-gold' }, String(total) + ' / 40'), 240));
    } });
    const lines = [];
    if (r.firstTime) lines.push(el('div', { cls: 'mo-line' }, sym('new', '*', 'new pairing'), ' ', sym('habitat', '', 'noted')));
    if (r.repeat) lines.push(el('div', { cls: 'mo-line' }, sym('no', '-', 'repeat theme'), ' ', sym('time', '', 'again')));
    if (r.fired) lines.push(el('div', { cls: 'mo-line' }, sym('flame', '', 'host on fire'), r.fired > 1 ? ' x' + r.fired : ''));
    if (r.boost) lines.push(el('div', { cls: 'mo-line' }, sym(r.boost.good ? 'ok' : 'no', r.boost.good ? '+' : '-', r.boost.good ? 'idea worked' : 'idea flopped'), ' ' + sgn(Math.round((+r.boost.amt || 0) * 10) / 10)));
    if (r.star) { const sa = E.animal(S(), r.star.animal); lines.push(el('div', { cls: 'mo-line' }, sa ? sa.name + ' ' : '', r.star.stat ? astatSym(r.star.stat) : null, r.star.gain ? ' ' + sgn(+(+r.star.gain).toFixed(1)) : '')); }
    steps.push({ anim: 700, render(card, st) {
      card.classList.add(tone ? 'mo-' + tone : 'mo-x');
      card.appendChild(el('div', { cls: 'mo-kicker' }, T.name + ' · ' + hab));
      card.appendChild(st.anim(el('div', { cls: 'mo-big' }, String(total), el('small', ' / 40')), 0));
      card.appendChild(st.anim(el('div', { cls: 'mo-line hi' }, r.fitWord ? r.fitWord : ''), 80));
      const chips = el('div', { cls: 'mo-chips' });
      if (r.money) chips.appendChild(chip('coin', moneyOf(r.money)));
      if (r.rep) chips.appendChild(chip('rep', sgn(Math.round(r.rep))));
      if (r.rp) chips.appendChild(chip('rp', sgn(Math.round(r.rp))));
      card.appendChild(st.anim(chips, 220));
      lines.forEach((l, k) => card.appendChild(st.anim(l.nodeType ? l : el('div', { cls: 'mo-line' }, l), 350 + k * 90)));
      card.appendChild(hint());
    } });
    return open('mo-review', (body, M) => sequence(M, body, steps), done);
  }

  // ------------------------------------------------------------------ expedition
  function expeditionMoment(r, done) {
    const found = r.found || [], n = found.length;
    const ms = n ? Math.max(850, Math.min(1800, Math.floor(3400 / n))) : 0, f = ms ? Math.min(1, ms / 1800) : 1;
    const region = D.BIOMES[r.region] ? D.BIOMES[r.region].region : 'the wild';
    const steps = found.map((x, k) => animalStep(x, { kicker: 'Found ' + (k + 1) + ' of ' + n, ms: ms, f: f, hab: x.hab, isNew: x.isNew }));
    steps.push({ anim: 500, render(card, st) {
      card.appendChild(el('div', { cls: 'mo-kicker' }, 'Expedition back'));
      card.appendChild(el('div', { cls: 'mo-title' }, region));
      if (n) {
        const th = el('div', { cls: 'mo-thumbs' });
        found.forEach(x => th.appendChild(el('div', { cls: 'mo-pic' }, pic(aUrl(x.sp, { variant: !!x.variant }, 3)))));
        card.appendChild(st.anim(th, 0));
      } else card.appendChild(el('div', { cls: 'mo-line hi' }, 'Nothing found this time'));
      const chips = el('div', { cls: 'mo-chips' });
      if (r.rp) chips.appendChild(chip('rp', sgn(Math.round(r.rp)) + ' research'));
      card.appendChild(st.anim(chips, 120));
      if (r.fragment > 0) {
        const pips = el('div', { cls: 'mo-pips' }); for (let i = 1; i <= 4; i++) pips.appendChild(el('i', { cls: i <= r.fragment ? 'on' : '' }));
        card.appendChild(st.anim(el('div', { cls: 'mo-line hi' }, 'Old map piece ' + r.fragment + ' of 4'), 220)); card.appendChild(st.anim(pips, 260));
      }
      if (r.ups && r.ups.length) card.appendChild(st.anim(el('div', { cls: 'mo-line' }, 'Level up: ' + r.ups.join(', ')), 340));
      card.appendChild(hint());
    } });
    return open('mo-expedition', (body, M) => sequence(M, body, steps), done);
  }

  // ------------------------------------------------------------------ small celebratory cards
  function rankupMoment(r, done) {
    const max = (D.RANK_REP && D.RANK_REP.length) || 10;
    return simpleCard('mo-rankup', { tone: 'gold', rare: true, kicker: 'Rank up!', title: 'Rank ' + r.rank + ': ' + (r.name || D.RANK_NAME[r.rank] || ''), stars: Math.min(r.rank, max), starsMax: max, lines: (r.unlocks || []).slice(0, 6) }, done);
  }
  function bonusLine(c) {
    return c.draw ? '+' + Math.round(c.draw * 100) + '% draw' : c.spend ? '+' + Math.round(c.spend * 100) + '% shop sales' : c.crowd ? '+' + Math.round(c.crowd * 100) + '% visitors' : c.rpMult ? '+' + Math.round(c.rpMult * 100) + '% research' : '';
  }
  // Pictures that carry a combo: the anchor building or an animal of the anchor habitat, plus the pieces it needs. Never a bare tile.
  function comboPics(c, it) {
    const out = [], parts = [c.anchor].concat(c.needs || []).slice(0, 3);
    parts.forEach((k, i) => {
      const m = /^(hab|fac):(.+)$/.exec(k); if (!m) return;
      if (m[1] === 'fac') { const u = bUrl(m[2], 3); if (u) out.push(u); return; }
      let sp = null;
      const hab = i === 0 && it && it.k === 'hab' ? it : S().items.find(x => x.k === 'hab' && x.t === m[2]);
      const an = hab ? E.inHab(S(), hab.id)[0] : null;
      if (an) sp = an.sp; else { const d = D.SPECIES_LIST.find(x => x.biome === m[2]); if (d) sp = d.id; }
      const u = sp ? aUrl(sp, {}, 3) : null; if (u) out.push(u);
    });
    if (!out.length) { const u = iUrl('star', 6); if (u) out.push(u); }
    return out;
  }
  function comboMoment(r, done) {
    const c = D.COMBOS.find(x => x.id === r.id);
    if (!c) { once(done)(); return null; }
    const imgs = comboPics(c, E.item(S(), r.anchor));
    const row = el('div', { cls: 'mo-thumbs mo-combo' });
    imgs.forEach((u, i) => { if (i) row.appendChild(el('span', { cls: 'mo-plus' }, '+')); row.appendChild(el('div', { cls: 'mo-pic' }, pic(u))); });
    const pct = c.draw || c.spend || c.crowd || c.rpMult || 0, ic = c.spend ? 'coin' : c.rpMult ? 'rp' : 'visitors';
    const badge = el('div', { cls: 'mo-chips' }, el('span', { cls: 'mo-chip mo-gain' }, el('b', '='), sym(ic, '', bonusLine(c), 4), el('b', '+' + Math.round(pct * 100) + '%')));
    return simpleCard('mo-combo', { tone: 'gold', rare: true, kicker: 'Combo!', img: row, imgCls: 'small', title: c.name, lines: [badge] }, done);
  }
  function secretMoment(r, done) {
    const B = D.BIOMES[r.region] || { region: 'a new region', name: '' };
    return simpleCard('mo-secret', { tone: 'gold', rare: true, kicker: 'Secret found!', img: iUrl('star', 8), imgCls: 'small', title: r.region === 'paleo' ? 'The old map is complete' : 'A chart of hidden islands', lines: [B.region + ' is open', 'Expeditions and ' + B.name + ' habitats'] }, done);
  }
  function vipMoment(r, done) {
    const v = D.VIPS.find(x => x.id === r.id) || { name: 'A special visitor', when: '' };
    const chips = []; if (r.money) chips.push(chip('coin', moneyOf(r.money))); if (r.rep) chips.push(chip('rep', sgn(Math.round(r.rep))));
    return simpleCard('mo-vip', { tone: 'good', kicker: 'Special visitor', img: pUrl('vip', 5), imgCls: 'small', title: v.name, chips: chips, lines: [r.boost ? '+' + Math.round(r.boost * 100) + '% visitors for a while' : ''] }, done);
  }

  // ------------------------------------------------------------------ callers (trader, director, headhunter)
  function mini(a) {   // three stat numbers on one line
    return el('span', { cls: 'mo-mini' }, [['charm', a.charm], ['vigor', a.vigor], ['wit', a.wit]].map(k => ui.astat ? ui.astat(k[0], k[1]) : el('span', { cls: 'mo-m ' + k[0] }, el('b', astatSym(k[0])), String(k[1]))));
  }
  function offerRow(o, i, M) {
    const a = o.a, s = spOf(a.sp), poor = S().money < o.price;
    const isNew = !S().book[a.sp];
    const btn = ui.btn(fmt.money(o.price), () => {
      const r = Z.act('buyAnimal', i);
      if (r && r.ok) { ui.toast(animalName(a) + (r.housed ? ' joins ' + habLine(r.hab) : ' is in the pen'), 'good'); M.rerender(); }
    }, { cls: 'primary', disabled: poor });
    return el('div', { cls: 'mo-row' }, el('div', { cls: 'mo-pic' }, pic(aUrl(a.sp, { variant: !!a.variant }, 3))),
      el('div', { cls: 'mid' }, el('span', { cls: 't' }, animalName(a), ' ', sym(a.sex === 'M' ? 'sex-m' : 'sex-f', a.sex === 'M' ? 'M' : 'F', a.sex === 'M' ? 'male' : 'female'), E.isJuv && E.isJuv(S(), a) ? sym('juv', 'j', 'young') : null),
        el('span', { cls: 's' }, ui.stars(s.rarity, s.rarity), isNew ? el('span', { cls: 'mo-tag gold', style: { marginLeft: '6px' } }, 'New') : null),
        mini(a)), btn);
  }
  function crateBlock(M) {
    const info = E.crateInfo(S()); if (!info) return null;
    const odds = info.odds.map(o => o.rarity + '★ ' + Math.round(o.p * 100) + '%').join('  ');
    const open = ui.btn('Open', () => {
      const r = Z.act('openCrate'); if (r && r.ok) revealCrate(r, () => M.rerender());
    }, { cls: 'blue', sub: fmt.money(info.cost), disabled: S().money < info.cost });
    return el('div', { cls: 'mo-row' }, el('div', { cls: 'mo-pic' }, el('div', { cls: 'mo-crate mini' })),
      el('div', { cls: 'mid' }, el('span', { cls: 't' }, 'Mystery crate' + (info.left > 1 ? ' x' + info.left : '')), el('span', { cls: 's' }, sym('odds', '', 'odds'), ' ' + odds)), open);
  }
  function callerMoment(kind, done, quiet) {
    const s = S();
    if (kind === 'headhunter') {
      if (!s.headhunt) { if (!quiet) ui.toast('Nobody is here right now'); once(done)(); return null; }
    } else if (!s.offers || (kind !== s.offers.kind && (kind === 'trader' || kind === 'director'))) {
      if (!quiet) ui.toast('Nobody is here right now'); once(done)(); return null;
    }
    return open('mo-caller-' + kind, (body, M) => {
      const st = S();
      if (kind === 'headhunter') {
        const h = st.headhunt;
        if (!h) { if (M.hired) { M.end(); } else { body.appendChild(el('div', { cls: 'mo-line center' }, 'The headhunter has gone.')); M.foot(ui.btn('Close', () => M.end(), { cls: 'big' })); } return; }
        const R = D.ROLES[h.role] || { name: h.role, main: 'care' }, fee = E.headhuntFee(h), full = st.staff.length >= E.staffCap(st), poor = st.money < fee;
        const card = el('div', { cls: 'mo-card' }, el('div', { cls: 'mo-kicker' }, 'The headhunter'),
          el('div', { cls: 'mo-pic small' }, pic(pUrl(h.role, 5))), el('div', { cls: 'mo-title' }, h.name), el('div', { cls: 'mo-line hi' }, R.name + ' · level ' + (h.lvl || 1)),
          el('div', { cls: 'mo-chips' }, ['care', 'sci', 'exp', 'charm'].map(k => ui.skillChip ? ui.skillChip(k, h[k]) : el('span', { cls: 'mo-chip' + (R.main === k ? ' main' : '') }, skillSym(k), el('b', String(h[k]))))),
          el('div', { cls: 'mo-chips' }, chip('coin', fmt.money(E.salary(h)) + ' /'), sym('time', '', 'per week', 3), chip('coin', fmt.money(fee))));
        body.appendChild(card);
        M.foot(ui.btn('Hire for ' + fmt.money(fee), () => {
          const r = Z.act('hireHeadhunt'); if (r && r.ok) { M.hired = true; ui.toast(h.name + ' joins the team', 'good'); M.end(); }
        }, { cls: 'primary big', disabled: full || poor, sub: full ? 'Staff room is full' : poor ? 'Not enough money' : null, onDisabled: () => ui.toast(full ? 'Staff room is full' : 'Not enough money', 'bad') }));
        M.foot(ui.btn('Not now', () => M.end(), { cls: 'ghost big' }));
        return;
      }
      const O = st.offers; if (!O) { M.foot(ui.btn('Close', () => M.end(), { cls: 'big' })); return; }
      const dir = O.kind === 'director';
      body.appendChild(el('div', { cls: 'mo-head' }, el('div', { cls: 'mo-pic small' }, pic(pUrl(dir ? 'director' : 'trader', 5))), el('div', { cls: 'mo-who' }, dir ? 'Visiting director' : 'Trader')));
      const rows = el('div', { cls: 'mo-rows' });
      (O.list || []).forEach((o, i) => rows.appendChild(offerRow(o, i, M)));
      if (!(O.list || []).length) rows.appendChild(el('div', { cls: 'mo-line center' }, 'Nothing for sale right now'));
      body.appendChild(rows);
      const cb = dir ? null : crateBlock(M); if (cb) body.appendChild(cb);
      M.foot(ui.btn('Not now', () => M.end(), { cls: 'ghost big' }));
    }, done);
  }

  // ------------------------------------------------------------------ yearly events
  // The plan screen must hand control straight to the `yearly` result report, so it ends without a result beat.
  function yearlyPlan(r, done) {
    const y = S().yearly;
    if (!y) { once(done)(); return null; }
    const opts = r.options || y.options || [];
    const M = open('mo-yearlyplan', (body, M2) => {
      if (!S().yearly) { M2.end(); return; }
      body.appendChild(el('div', { cls: 'mo-head' }, el('div', { cls: 'mo-pic small' }, pic(pUrl('showrunner', 5) || iUrl('star', 8))), el('div', { cls: 'mo-who' }, r.id === 'openday' ? 'The gates open to everyone. How big a day?' : 'Stalls stay open late. How big a festival?')));
      body.appendChild(optionButtons(opts, i => {
        if (!S().yearly) { M2.end(); return; }
        const x = Z.act('resolveYearly', i);
        if (x && x.ok) M2.end();
      }));
    }, done, { title: r.name || y.name });
    return M;
  }
  function yearlyMoment(r, done) {
    const chips = []; if (r.money) chips.push(chip('coin', moneyOf(r.money))); if (r.rep) chips.push(chip('rep', sgn(Math.round(r.rep))));
    return open('mo-yearly', (body, M) => sequence(M, body, [{ anim: 1200, render(card, st) {
      card.classList.add('mo-good');
      card.appendChild(el('div', { cls: 'mo-kicker' }, r.name || 'Yearly event'));
      card.appendChild(el('div', { cls: 'mo-title' }, r.tierName || ''));
      const big = el('div', { cls: 'mo-big' }, ''); card.appendChild(big); st.count(big, r.crowd || 0, 1100, 150, v => fmt.num(v));
      card.appendChild(el('div', { cls: 'mo-line hi' }, r.id === 'openday' ? 'people came' : 'visitors' + (r.kinds ? ' · ' + r.kinds + (r.kinds === 1 ? ' shop type' : ' shop types') : '')));
      card.appendChild(st.anim(el('div', { cls: 'mo-chips' }, chips), 1100));
      card.appendChild(hint());
    } }]), done);
  }

  function medalSym(m, scale) { return sym('medal-' + m, m.charAt(0).toUpperCase(), m, scale || 3); }
  function medalSpan(m, n) { return el('span', medalSym(m), ' ' + (n == null ? '?' : n)); }
  function showPicker(done) {
    const s0 = S();
    if (!s0.show) { ui.toast('The show is not on right now'); once(done)(); return null; }
    return open('mo-show', (body, M) => {
      const s = S(), sh = s.show; if (!sh) { M.end(); return; }
      const med = E.showMedals(s);
      M.head(el('div', { cls: 'mo-card', style: { padding: '8px 10px 4px' } }, el('div', { cls: 'mo-pic tiny' }, pic(pUrl('showrunner', 5) || iUrl('star', 8))),
        el('div', { cls: 'mo-line hi' }, 'Judges', ' ', astatSym(sh.stat)),
        el('div', { cls: 'mo-odds' }, medalSpan('gold', med && med.gold), medalSpan('silver', med && med.silver), medalSpan('bronze', med && med.bronze))));
      const rows = el('div', { cls: 'mo-rows' });
      s.animals.slice().sort((a, b) => E.showScore(s, b) - E.showScore(s, a)).slice(0, 12).forEach(a => {
        const m = E.showMedal(s, a), sc = Math.round(E.showScore(s, a));
        const row = el('div', { cls: 'mo-row tap' }, el('div', { cls: 'mo-pic' }, pic(aUrl(a.sp, { variant: !!a.variant }, 3))),
          el('div', { cls: 'mid' }, el('span', { cls: 't' }, a.name), el('span', { cls: 's', style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, animalName(a)), el('span', { cls: 's' }, astatSym(sh.stat), ' ' + a[sh.stat] + ' · ' + sc)),
          el('span', { cls: 'mo-medalbox' }, m ? medalSym(m, 4) : '-'));
        row.addEventListener('click', () => ui.confirm('Enter ' + a.name + '?', () => { const r = Z.act('enterShow', a.id); if (r && r.ok) M.end(); }, { yes: 'Enter' }));
        rows.appendChild(row);
      });
      body.appendChild(rows);
      M.foot(ui.btn('Not now', () => M.end(), { cls: 'ghost big' }));
    }, done, { title: 'Winter Animal Show' });
  }
  function showResultMoment(r, done) {
    const a = E.animal(S(), r.animal), m = r.medal, chips = [];
    if (r.money) chips.push(chip('coin', moneyOf(r.money))); if (r.rep) chips.push(chip('rep', sgn(Math.round(r.rep))));
    if (r.trophy) chips.push(chip('star', 'Trophy'));
    return open('mo-showresult', (body, M) => sequence(M, body, [{ ms: 1300, anim: 1200, render(card, st) {
      card.appendChild(el('div', { cls: 'mo-kicker' }, 'Winter Animal Show ', astatSym(r.stat)));
      if (a) card.appendChild(el('div', { cls: 'mo-pic small' }, pic(aUrl(a.sp, { variant: !!a.variant }, 4))));
      card.appendChild(el('div', { cls: 'mo-title' }, a ? a.name : 'Your animal'));
      const sc = el('div', { cls: 'mo-big' }, ''); card.appendChild(sc); st.count(sc, Math.round(r.score || 0), 900, 100);
      card.appendChild(el('div', { cls: 'mo-line' }, medalSym('gold'), ' ' + (r.medals ? r.medals.gold : r.bar)));
    } }, { anim: 500, render(card, st) {
      card.classList.add(m ? 'mo-gold' : 'mo-x'); if (m === 'gold') card.classList.add('mo-rare');
      if (a) card.appendChild(el('div', { cls: 'mo-pic small' }, pic(aUrl(a.sp, { variant: !!a.variant }, 4))));
      card.appendChild(st.anim(m ? el('div', { cls: 'mo-bigmedal' }, medalSym(m, 8)) : el('div', { cls: 'mo-medal none' }, 'No medal'), 0));
      card.appendChild(el('div', { cls: 'mo-line' }, Math.round(r.score || 0) + ' / ', medalSym('gold'), ' ' + (r.medals ? r.medals.gold : r.bar)));
      card.appendChild(st.anim(el('div', { cls: 'mo-chips' }, chips), 200));
      card.appendChild(hint());
    } }]), done);
  }

  // ------------------------------------------------------------------ year end and final score
  function yearEndMoment(r, done) {
    const awards = r.awards || [], st0 = r.stats || {};
    const stepA = { ms: 3000, anim: 2800, render(card, st) {
      card.appendChild(el('div', { cls: 'mo-kicker' }, 'Year ' + r.year + ' awards'));
      const grid = el('div', { cls: 'mo-awards' });
      awards.forEach((a, k) => {
        const cell = el('div', { cls: 'mo-award' }, el('i', a.name), el('b', '?'), el('small', ''));
        const t = 250 + k * 520;
        if (!st.instant) cell.classList.add('mo-hid');
        st.at(t, () => {
          cell.classList.remove('mo-hid'); cell.classList.add(a.won ? 'won' : 'lost', 'mo-in');
          cell.querySelector('b').textContent = a.won ? 'WON' : 'missed';
          cell.querySelector('small').textContent = a.won ? (a.prize ? moneyOf(a.prize) : '') : (a.mine != null ? String(a.mine) : '');
        });
        grid.appendChild(cell);
      });
      card.appendChild(grid);
    } };
    const stepB = { anim: 600, render(card, st) {
      const of = r.table ? r.table.length : (st0.of || 12);
      card.appendChild(el('div', { cls: 'mo-kicker' }, 'End of year ' + r.year));
      card.appendChild(st.anim(el('div', { cls: 'mo-big' }, '#' + r.place, el('small', ' of ' + of)), 0));
      // league table: top 3, plus my row and the one above, with gaps marked
      const tbl = el('table', { cls: 'mo-tbl' }); const rows = r.table || [];
      const keep = {}; [0, 1, 2].forEach(i => { keep[i] = 1; }); rows.forEach((t, i) => { if (t.me) { keep[i] = 1; keep[i - 1] = 1; keep[i + 1] = 1; } });
      let last = -1;
      rows.forEach((t, i) => {
        if (!keep[i]) return;
        if (last >= 0 && i - last > 1) tbl.appendChild(el('tr', { cls: 'gap' }, el('td', { colspan: 3 }, '...')));
        tbl.appendChild(el('tr', { cls: t.me ? 'me' : '' }, el('td', { cls: 'p' }, String(i + 1)), el('td', t.name), el('td', { cls: 'n' }, fmt.num(t.rating)))); last = i;
      });
      card.appendChild(st.anim(tbl, 150));
      const chips = el('div', { cls: 'mo-chips' });
      chips.appendChild(chip('coin', moneyOf((st0.income || 0) - (st0.cost || 0)) + ' profit'));
      chips.appendChild(chip(null, fmt.num(st0.visitors || 0) + ' visitors'));
      chips.appendChild(chip(null, (st0.species || 0) + ' species'));
      if (st0.bestReview) chips.appendChild(chip(null, 'best review ' + st0.bestReview));
      card.appendChild(st.anim(chips, 300));
      if (r.prize && awards.some(a => a.won)) card.appendChild(st.anim(el('div', { cls: 'mo-line' }, awards.filter(a => a.won).length + ' award' + (awards.filter(a => a.won).length > 1 ? 's' : '') + ' won'), 380));
      card.appendChild(hint('On to year ' + (r.year + 1)));
    } };
    return open('mo-yearend', (body, M) => sequence(M, body, awards.length ? [stepA, stepB] : [stepB]), done);
  }
  function saveLegacyOnce(r) {
    const s = S(); if (!s || !s.flags || s.flags.legacySaved) return;
    try { if (window.ZMenus && ZMenus.recordLegacy && ZMenus.recordLegacy() && s.flags.legacySaved) return; } catch (e) { rec(e, 'recordLegacy'); }
    if (s.flags.legacySaved) return;
    try {
      s.flags.legacySaved = true;
      const L = Z.legacy, last = s.history[s.history.length - 1];
      L.runs = (L.runs || 0) + 1; L.best = Math.max(L.best || 0, (r.score && r.score.total) || 0);
      L.aff = Object.assign(L.aff || {}, s.aff || {}); L.combos = Object.assign(L.combos || {}, s.combos || {});
      L.hall = (L.hall || []).concat([{ zoo: s.zooName, score: r.score ? r.score.total : 0, place: last ? last.place : 12 }]);
      const rankS = x => (x.lvl || 1) + ((x.mastered || []).length) * 30;
      L.carry = {
        staff: s.staff.slice().sort((a, b) => rankS(b) - rankS(a)).slice(0, 4).map(x => JSON.parse(JSON.stringify(x))),
        animals: s.animals.slice().sort((a, b) => E.prestige(b) - E.prestige(a)).slice(0, 4).map(x => JSON.parse(JSON.stringify(x)))
      };
      Z.saveLegacy();
    } catch (e) { rec(e, 'legacy'); }
  }
  function finalMoment(r, done) {
    saveLegacyOnce(r);
    const parts = (r.score && r.score.parts) || [], total = (r.score && r.score.total) || 0;
    return open('mo-final', (body, M) => {
      if (M.view === 'new') { newZooView(body, M); return; }
      sequence(M, body, [{ anim: 3000, render(card, st) {
        card.classList.add('mo-gold');
        card.appendChild(el('div', { cls: 'mo-kicker' }, 'Twenty years'));
        card.appendChild(el('div', { cls: 'mo-title' }, 'Final score'));
        const rows = el('div', { cls: 'mo-rows' });
        parts.forEach((p, k) => {
          const v = el('b', st.instant ? fmt.num(p[1]) : '0'); const row = el('div', { cls: 'mo-score' }, el('span', p[0]), v);
          st.anim(row, 200 + k * 330); st.count(v, p[1], 300, 250 + k * 330, x => fmt.num(x)); rows.appendChild(row);
        });
        card.appendChild(rows);
        const tv = el('b', st.instant ? fmt.num(total) : '0'); const tr = el('div', { cls: 'mo-score tot' }, el('span', 'Total'), tv);
        const t0 = 250 + parts.length * 330 + 150; st.anim(tr, t0); st.count(tv, total, 700, t0 + 80, x => fmt.num(x)); card.appendChild(tr);
        const btns = el('div', { cls: 'mo-sec stack' });
        btns.appendChild(ui.btn('Start a new zoo', () => { M.view = 'new'; M.rerender(); }, { cls: 'primary big', sub: 'carry-over perks' }));
        btns.appendChild(ui.btn('Keep playing', () => M.end(), { cls: 'ghost big' }));
        M.foot(btns);
      }, noEnd: true }]);
    }, done);
  }
  function newZooView(body, M) {
    const L = Z.legacy || {}, runs = L.runs || 0, carry = L.carry || null;
    if (M.nz == null) M.nz = { name: 'Wildside Zoo', staff: null, animal: null };
    const P = M.nz;
    body.appendChild(el('div', { cls: 'mo-kicker', style: { textAlign: 'center' } }, 'New zoo'));
    const inp = el('input', { cls: 'field mo-input', type: 'text', maxlength: 28, value: P.name, 'aria-label': 'Zoo name' });
    inp.addEventListener('input', () => { P.name = inp.value; });
    body.appendChild(inp);
    if (runs) body.appendChild(el('div', { cls: 'mo-chips' }, chip('coin', '+' + moneyOf(Math.min(runs, 5) * 6000) + ' start'), chip(null, 'Theme and combo notes kept')));
    if (carry && carry.staff && carry.staff.length) {
      body.appendChild(ui.section('Bring one person'));
      const rows = el('div', { cls: 'mo-pick' });
      carry.staff.forEach((s, i) => { const R = D.ROLES[s.role] || { name: s.role }; const row = el('div', { cls: 'mo-row tap' + (P.staff === i ? ' sel' : '') }, el('div', { cls: 'mo-pic' }, pic(pUrl(s.role, 3))), el('div', { cls: 'mid' }, el('span', { cls: 't' }, s.name), el('span', { cls: 's' }, R.name + ' · level ' + (s.lvl || 1))));
        row.addEventListener('click', () => { P.staff = P.staff === i ? null : i; M.rerender(); }); rows.appendChild(row); });
      body.appendChild(rows);
    }
    if (carry && carry.animals && carry.animals.length) {
      body.appendChild(ui.section('Bring one animal'));
      const rows = el('div', { cls: 'mo-pick' });
      carry.animals.forEach((a, i) => { const row = el('div', { cls: 'mo-row tap' + (P.animal === i ? ' sel' : '') }, el('div', { cls: 'mo-pic' }, pic(aUrl(a.sp, { variant: !!a.variant }, 3))), el('div', { cls: 'mid' }, el('span', { cls: 't' }, a.name + ' · ' + animalName(a)), el('span', { cls: 's' }, ui.stars(spOf(a.sp).rarity, 6), ' ' + Math.round(E.avg(a)))));
        row.addEventListener('click', () => { P.animal = P.animal === i ? null : i; M.rerender(); }); rows.appendChild(row); });
      body.appendChild(rows);
    }
    M.foot(ui.btn('Open the gates', () => {
      const opts = { zooName: (P.name || 'Wildside Zoo').trim().slice(0, 28) || 'Wildside Zoo' };
      if (carry && P.staff != null && carry.staff[P.staff]) opts.staff = carry.staff[P.staff];
      if (carry && P.animal != null && carry.animals[P.animal]) opts.animal = carry.animals[P.animal];
      M.ended = true; M.clear(); Z.newGame(opts);   // closes every screen; the old report is gone with the old zoo
    }, { cls: 'primary big' }));
    M.foot(ui.btn('Back', () => { M.view = null; M.shown = false; M.i = 0; M.rerender(); }, { cls: 'ghost big' }));
  }

  // ------------------------------------------------------------------ hiring and training (called by Menus)
  function revealHire(candidates, done) {
    candidates = (candidates || S().candidates || []).slice();
    if (!candidates.length) { once(done)(); return null; }
    const n = candidates.length, ms = Math.max(700, Math.min(1400, Math.floor(2600 / n))), f = Math.min(1, ms / 1500);
    const steps = candidates.map((c, k) => {
      const R = D.ROLES[c.role] || { name: c.role, main: 'care' };
      return { ms: ms, anim: ms * 0.92, render(card, st) {
        const T = x => x * f; card.classList.toggle('mo-rare', !!c.star);
        card.appendChild(el('div', { cls: 'mo-kicker' }, 'Applicant ' + (k + 1) + ' of ' + n));
        const p = pic(pUrl(c.role, 5), 'mo-unveil'); p.style.setProperty('--dur', (T(800) / 1000) + 's'); card.appendChild(el('div', { cls: 'mo-pic small' }, p));
        card.appendChild(st.anim(el('div', { cls: 'mo-title' }, c.name), T(550)));
        card.appendChild(st.anim(el('div', { cls: 'mo-line hi' }, R.name + (c.star ? '' : '')), T(650)));
        if (c.star) card.appendChild(st.anim(el('span', { cls: 'mo-tag gold' }, 'Standout!'), T(750)));
        const row = el('div', { cls: 'mo-stats' });
        [['care'], ['sci'], ['exp'], ['charm']].forEach((q, j) => {
          const num = el('span', { cls: 'mo-snum', style: { fontSize: '24px' } }, st.instant ? String(c[q[0]]) : '0');
          const box = el('div', { cls: 'mo-stat' + (R.main === q[0] ? ' wit' : ''), style: R.main === q[0] ? {} : {} }, el('i', { style: { background: R.main === q[0] ? 'var(--blue)' : 'var(--ink2)' } }, skillSym(q[0])), num);
          st.anim(box, T(850 + j * 120)); st.count(num, c[q[0]], T(400), T(900 + j * 120)); row.appendChild(box);
        });
        card.appendChild(row);
      } };
    });
    steps.forEach(x => { x.skipToFinal = true; }); steps[steps.length - 1].anim = 150;
    steps[steps.length - 1].ms = 0; steps[steps.length - 1].render0 = steps[steps.length - 1].render;
    steps[steps.length - 1].render = function (card, st) { this.render0(card, st); card.appendChild(hint()); };
    return open('mo-hire', (body, M) => sequence(M, body, steps), done);
  }
  function revealTrain(staff, res, done) {
    if (!res) { once(done)(); return null; }
    return simpleCard('mo-train', {
      tone: res.super ? 'gold' : 'good', rare: !!res.super, kicker: staff ? staff.name : 'Training', img: staff ? pUrl(staff.role, 5) : null, imgCls: 'small',
      title: res.super ? 'SUPER!' : 'Trained', big: el('span', skillSym(res.stat), ' ' + sgn(res.gain)), lines: [res.value != null ? String(res.value) : ''], ms: 0
    }, done);
  }

  // ------------------------------------------------------------------ registration
  function reg(type, fn) {
    Z.onReport(type, (r, done) => {
      shown[type] = (shown[type] || 0) + 1;
      const d = once(function () { finished[type] = (finished[type] || 0) + 1; done(); });
      try { fn(r, d); } catch (e) { rec(e, type); d(); }
    });
  }
  function init() {
    reg('choice', (r, d) => choiceMoment(r.pid, d));
    reg('happening', (r, d) => happeningMoment(r, d));
    reg('expedition', (r, d) => expeditionMoment(r, d));
    reg('birth', (r, d) => birthMoment(r, d));
    reg('review', (r, d) => reviewMoment(r, d));
    reg('caller', (r, d) => callerMoment(r.kind, d, true));
    reg('combo', (r, d) => comboMoment(r, d));
    reg('rankup', (r, d) => rankupMoment(r, d));
    reg('secret', (r, d) => secretMoment(r, d));
    reg('vip', (r, d) => vipMoment(r, d));
    reg('yearlyplan', (r, d) => yearlyPlan(r, d));
    reg('yearly', (r, d) => yearlyMoment(r, d));
    reg('show', (r, d) => showPicker(d));
    reg('showresult', (r, d) => showResultMoment(r, d));
    reg('yearend', (r, d) => yearEndMoment(r, d));
    reg('final', (r, d) => finalMoment(r, d));
  }

  window.ZMoments = {
    init: init, errors: errors, shown: shown, finished: finished,
    revealAnimal: revealAnimal, revealCrate: revealCrate, revealHire: revealHire, revealTrain: revealTrain, result: result,
    showCaller: (kind, done) => callerMoment(kind, done, false),
    showChoice: (pid, done) => choiceMoment(pid, done),
    showShow: done => showPicker(done),
    showHappening: done => {
      const h = S().happening;
      if (!h) { ui.toast('Nothing is waiting'); once(done)(); return null; }
      const rep = { type: 'happening', key: h.key, title: D.HAPPENINGS[h.key] ? D.HAPPENINGS[h.key].title : h.title, text: h.text, bad: h.bad, who: h.who, hab: h.hab, animal: h.animal, newAnimal: h.newAnimal, options: h.options };
      return happeningMoment(rep, done);
    },
    pendingChoices: () => (S().projects || []).filter(p => p.choice).map(p => p.id)
  };
  try { init(); } catch (e) { rec(e, 'init'); }
})();
