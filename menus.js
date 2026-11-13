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
  // Two tiny pixel icons drawn here (no matching art exists for them): arrows for Move, a cross for Remove.
  const PIX = {
    move: ['......#......', '.....###.....', '....#####....', '......#......', '...#..#..#...', '..##..#..##..', '.#############', '..##..#..##..', '...#..#..#...', '......#......', '....#####....', '.....###.....', '......#......'],
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
  const pn = (a, one, many) => a + ' ' + (a === 1 ? one : many);

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
  const why = t => el('span', { cls: 'mn-why' }, t);

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
.mn-cl{display:flex;flex-wrap:nowrap;align-items:center;gap:3px;white-space:nowrap;margin-top:2px}
.mn-cl .chip{margin:0;font-size:12px}.mn-cl .chip b{padding:4px 3px;font-size:10px}.mn-cl .chip .v{padding:4px 3px;min-width:18px;font-size:13px}.mn-cl .mn-grade{margin-left:4px}
.row.mn-split.wrap{flex-wrap:wrap}.row.mn-split .mn-line{flex:1 0 100%;padding:0 4px 4px}
.mn-hit{flex:1;min-width:0;display:flex;align-items:center;gap:10px;min-height:56px;padding:0;margin:0;border:0;background:none;text-align:left;font:inherit;font-weight:700;color:inherit;cursor:pointer}
.row.mn-split{padding-right:4px}.row.mn-split>.btn{flex:none;margin:0;min-width:84px}
.mn-stars{filter:none}
.mn-hot{box-shadow:0 0 0 3px var(--gold-d),inset 0 -3px 0 rgba(0,0,0,.06)!important;background:#fff3b8}
.mn-on{box-shadow:0 0 0 3px var(--blue)!important;background:#e6f4ff}
.mn-why{font-size:12px;color:var(--red-d);font-weight:800}
.mn-grade{font-size:15px;font-weight:800;color:var(--ink2)}
.mn-kv{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;background:var(--paper);box-shadow:0 0 0 2px var(--line);min-height:44px}
.mn-kv .k{color:var(--ink2);font-size:14px}.mn-kv .v{font-size:16px;text-align:right}
.mn-mini{height:26px;width:auto;image-rendering:pixelated}
.mn-pic{display:flex;justify-content:center;align-items:flex-end;gap:8px;min-height:96px;padding:6px;background:#bfe0a0;box-shadow:0 0 0 3px var(--bd)}
.mn-pic img{image-rendering:pixelated;max-height:120px;max-width:46%}
.mn-pic.one img{max-width:90%}
.mn-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.mn-st{display:flex;flex-direction:column;align-items:center;padding:6px 2px;background:var(--paper);box-shadow:0 0 0 3px var(--bd)}
.mn-st b{font-size:12px;color:#fff;width:100%;text-align:center;padding:2px 0;text-shadow:1px 1px 0 rgba(0,0,0,.4)}
.mn-st .n{font-size:28px;font-weight:800;line-height:1.1}.mn-st i{font-style:normal;font-size:13px;color:var(--ink2)}
.mn-st.charm b{background:var(--charm)}.mn-st.vigor b{background:var(--vigor)}.mn-st.wit b{background:var(--wit)}
.mn-odd{display:grid;grid-template-columns:92px 1fr 44px;align-items:center;gap:8px;min-height:26px}
.mn-odd .p{text-align:right;font-size:14px}.mn-odd .nm{font-size:12px;color:var(--ink2)}
.mn-team{display:flex;justify-content:center;gap:8px}.mn-team img{height:54px;image-rendering:pixelated}
.mn-book{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.mn-cell{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:2px;min-height:92px;padding:4px 2px;border:0;background:var(--paper);box-shadow:0 0 0 2px var(--line);font:inherit;font-weight:700;color:var(--ink);cursor:pointer}
.mn-cell .im{height:50px;display:flex;align-items:center}.mn-cell img{max-height:50px;max-width:76px;image-rendering:pixelated}
.mn-cell .nm{font-size:11px;line-height:1.1;text-align:center;word-break:break-word}
.mn-cell.new{background:#fff3b8}.mn-sil{filter:brightness(0);opacity:.28}
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
`;
    const st = document.createElement('style'); st.id = 'mn-css'; st.textContent = css; document.head.appendChild(st);
  })();

  // ------------------------------------------------------------------ main menu
  function open() { push(mainDef()); }
  function mainDef() {
    return { id: 'menu', title: 'Menu', backLabel: 'Play', render(body) {
      const s = S();
      const waiting = s.projects.filter(p => p.choice).length + (s.happening && s.happening.options ? 1 : 0) + (s.yearly ? 1 : 0) + (s.show ? 1 : 0);
      const pen = E.holding(s).length;
      body.appendChild(ui.grid([
        { icon: iUrl('m-projects', 6), label: 'Projects', badge: waiting || false, onTap: projectsScreen },
        { icon: iUrl('m-build', 6), label: 'Build', onTap: buildScreen },
        { icon: iUrl('m-animals', 6), label: 'Animals', badge: pen || false, onTap: () => animalsScreen('zoo') },
        { icon: iUrl('m-staff', 6), label: 'Staff', badge: (s.candidates && s.candidates.length) || s.headhunt ? true : false, onTap: staffScreen },
        { icon: iUrl('m-research', 6), label: 'Research', onTap: researchScreen },
        { icon: iUrl('m-info', 6), label: 'Info', onTap: infoScreen },
        { icon: iUrl('m-system', 6), label: 'System', cls: 'mn-wide', onTap: systemScreen }
      ], { cols: 2 }));
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
    if (!D.BIOME_ORDER.some(b => s.regions[b])) return { ok: false, why: 'No region' };
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
  const shortWhy = t => (/rest/i.test(t) ? 'Rests ' + ((/(\d+)/.exec(t) || [])[1] || '') + ' wks' : /young/i.test(t) ? 'Too young' : /paired|busy/i.test(t) ? 'Already busy' : t.split(' ').slice(0, 4).join(' '));
  function eventHabs() { return habs().map(h => ({ hab: h, why: E.eventCheck(S(), h.id) })); }

  function projectsScreen() {
    push({ id: 'projects', title: 'Projects', render(body) {
      const s = S();
      const hot = [];
      if (s.happening && s.happening.options) hot.push(row({ img: iUrl('choice', 4), title: s.happening.title, sub: 'Decide', cls: 'mn-hot', tap: happeningScreen }));
      if (s.yearly) hot.push(row({ img: iUrl('star', 4), title: s.yearly.name, sub: 'Plan it', cls: 'mn-hot', tap: yearlyScreen }));
      if (s.show) hot.push(row({ img: iUrl('star', 4), title: 'Animal Show', sub: 'Pick an entry', cls: 'mn-hot', tap: showScreen }));
      if (hot.length) { body.appendChild(ui.section('Needs you')); body.appendChild(el('div', { cls: 'list' }, hot)); }
      if (s.projects.length) {
        body.appendChild(ui.section('Running'));
        body.appendChild(el('div', { cls: 'list' }, s.projects.map(p => {
          const info = E.projectInfo(s, p), lead = E.staffer(s, p.staff[0]);
          let img = null;
          if (p.type === 'expedition') img = pUrl(lead ? lead.role : 'explorer', 3);
          else if (p.type === 'breed') { const a = E.animal(s, p.a); img = a ? aUrl(a, 2) : null; } else img = iUrl('ready-event', 4);
          return row({ img, title: info.name + ' · ' + info.detail, sub: info.choice ? 'Waiting for you' : pn(info.weeksLeft, 'week', 'weeks') + ' left',
            extra: ui.bar(info.progress), right: info.choice ? imgEl(iUrl('choice', 3), 'mn-mini') : null, cls: info.choice ? 'mn-hot' : '',
            tap: () => (info.choice ? showChoice(p.id) : projectScreen(p.id)) });
        })));
      }
      body.appendChild(ui.section('Start'));
      const ex = expStatus(), pairs = pairList().filter(x => !x.why), free = E.freeStaff(s).length;
      const evs = eventHabs().filter(x => !x.why), cost = E.eventCost(s);
      const evWhy = evs.length ? (!free ? 'No one free' : s.money < cost ? needMoney(cost) : '') : 'None ready';
      const camps = E.campaigns(s), runningC = camps.filter(c => c.weeksLeft > 0).length;
      body.appendChild(ui.grid([
        { icon: pUrl('explorer', 5), label: 'Expedition', sub: ex.why, disabled: !ex.ok, onTap: expStart },
        { icon: iUrl('ready-breed', 6), label: 'Breeding', sub: pairs.length ? pn(pairs.length, 'pair', 'pairs') + ' ready' : 'None ready', disabled: !pairs.length || !free, onTap: breedPairs },
        { icon: iUrl('ready-event', 6), label: 'Event', sub: evWhy || pn(evs.length, 'habitat', 'habitats') + ' ready', disabled: !!evWhy, onTap: eventHabsScreen },
        { icon: iUrl('rep', 6), label: 'Advertise', sub: runningC ? runningC + ' running' : '', onTap: campaignScreen }
      ], { cols: 2 }));
    } });
  }

  function projectScreen(pid) {
    push({ id: 'project', title: 'Project', render(body, api) {
      const s = S(), p = E.project(s, pid); if (!p) { api.pop(); return; }
      const info = E.projectInfo(s, p);
      body.appendChild(el('div', { cls: 'mn-team' }, p.staff.map(id => { const st = E.staffer(s, id); return st ? imgEl(pUrl(st.role, 3)) : null; })));
      body.appendChild(el('div', { cls: 'mn-big' }, info.name + ' · ' + info.detail));
      body.appendChild(ui.bar(info.progress, { label: pn(info.weeksLeft, 'week', 'weeks') + ' left' }));
      if (info.scores) body.appendChild(el('div', { cls: 'chips' }, [ui.stat('Animals', info.scores.animals), ui.stat('Habitat', info.scores.habitat), ui.stat('Fun', info.scores.fun), ui.stat('Learn', info.scores.learning)]));
      body.appendChild(kv('Team', p.staff.map(id => { const st = E.staffer(s, id); return st ? st.name : '?'; }).join(', ')));
      if (p.type === 'expedition') body.appendChild(kv('Spent', money(p.cost)));
      if (info.choice) body.appendChild(ui.btn('Answer', () => showChoice(pid), { cls: 'primary big' }));
      if (p.type === 'expedition') body.appendChild(ui.btn('Call back', () => ui.confirm('Call the team back? Half the cost returns.', () => { const r = Core.act('cancelProject', pid); if (r.ok) { ui.toast('Back. ' + money(r.refund) + ' returned', 'good'); later(() => api.pop()); } }, { danger: true, yes: 'Call back' }), { cls: 'danger big', sub: 'half the cost returns' }));
    } });
  }

  // ----- expedition planner: region, team, budget, confirm
  function expStart() { const rs = D.BIOME_ORDER.filter(b => S().regions[b]); if (rs.length === 1) expTeam(rs[0]); else expRegion(); }
  function expRegion() {
    push({ id: 'exp-region', title: 'Where to?', render(body) {
      const s = S();
      const list = D.BIOME_ORDER.filter(b => s.regions[b]).map(b => {
        const top = Math.max.apply(null, D.SPECIES_LIST.filter(x => x.biome === b).map(x => x.rarity));
        return row({ img: tUrl('hab:' + b, 1), title: D.BIOMES[b].region, sub: pn(D.BIOMES[b].weeks, 'week', 'weeks'), extra: starsOn(top), right: money(E.expCost(b, 0)), tap: () => expTeam(b) });
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
      const power = E.teamPower(s, sel, 1), lvl = fitLevel(E.expOdds(s, region, power).ratio);
      const head = el('div', { cls: 'mn-sticky' });
      head.appendChild(el('div', { cls: 'mn-kv' }, span('k', 'Strength'), span('v', sel.length ? ui.sign(lvl) : '-')));
      head.appendChild(ui.btn('Next', () => expConfirm(region, sel.slice()), { cls: 'primary big', disabled: !sel.length, sub: sel.length ? pn(E.expWeeks(s, region, sel), 'week', 'weeks') : 'pick 1 to 3' }));
      body.appendChild(head);
      body.appendChild(el('div', { cls: 'list' }, staff.map(st => {
        const on = sel.indexOf(st.id) >= 0, b = !!busy[st.id];
        return row({ img: pUrl(st.role, 3), title: st.name, sub: D.ROLES[st.role].name + ' · Lv ' + st.lvl, extra: el('span', { cls: 'chips' }, [ui.stat('Scout', st.exp), ui.stat('Care', st.care)]),
          right: b ? imgEl(iUrl('busy', 3), 'mn-mini') : on ? span('mn-grade', 'In') : null, off: b, cls: on ? 'mn-on' : '',
          tap: () => { if (on) sel = sel.filter(x => x !== st.id); else if (sel.length < 3) sel.push(st.id); else { ui.toast('Three at most.'); return; } Core.rerender(); } });
      })));
    } });
  }
  function expBudget(region, team) {
    push({ id: 'exp-budget', title: 'Budget', render(body) {
      const s = S(), names = ['Lean', 'Standard', 'Lavish'];
      body.appendChild(ui.choices([0, 1, 2].map(b => {
        const o = E.expOdds(s, region, E.teamPower(s, team, b));
        return { label: names[b], note: 'Strength ' + fmt.signs(fitLevel(o.ratio)), cost: E.expCost(region, b) };
      }), i => expConfirm(region, team, i)));
    } });
  }
  function expConfirm(region, team) {
    let budget = 1;
    push({ id: 'exp-confirm', title: 'Send out?', render(body, api) {
      body.appendChild(ui.tabs([{ id: '0', label: 'Lean' }, { id: '1', label: 'Standard' }, { id: '2', label: 'Lavish' }], String(budget), id => { budget = +id; api.rerender(); }));
      const s = S(), power = E.teamPower(s, team, budget), o = E.expOdds(s, region, power), cost = E.expCost(region, budget);
      body.appendChild(el('div', { cls: 'mn-team' }, team.map(id => { const st = E.staffer(s, id); return st ? imgEl(pUrl(st.role, 3)) : null; })));
      body.appendChild(el('div', { cls: 'mn-big' }, D.BIOMES[region].region));
      body.appendChild(kv('Strength', ui.sign(fitLevel(o.ratio))));
      body.appendChild(kv('Time', pn(E.expWeeks(s, region, team), 'week', 'weeks')));
      body.appendChild(ui.section('Chance to find'));
      Object.keys(o.byRarity).map(Number).sort((a, b) => a - b).forEach(r => { const p = o.byRarity[r]; if (p < 0.005) return; body.appendChild(el('div', { cls: 'mn-odd' }, starsOn(r), ui.bar(p, { cls: 'gold' }), span('p', pct(p)))); });
      body.appendChild(ui.btn('Send', guard(() => { const r = Core.act('startExpedition', region, team, budget); if (r.ok) { later(() => Core.popAll()); ui.toast('Expedition sent', 'good'); } }), { cls: 'primary big', sub: money(cost), disabled: s.money < cost, onDisabled: () => ui.toast(needMoney(cost), 'bad') }));
    } });
  }

  // ----- breeding planner: pair, lead, confirm
  function breedPairs() {
    push({ id: 'breed-pairs', title: 'Which pair?', render(body) {
      const all = pairList(), ready = all.filter(x => !x.why), wait = all.filter(x => x.why);
      const mk = x => row({ img: aUrl(x.a, 2), title: x.a.name + ' + ' + x.b.name, sub: E.sp(x.a).name + ' · ' + E.habName(S(), x.hab), right: x.why ? why(shortWhy(x.why)) : span('mn-grade', 'Avg ' + Math.round((E.avg(x.a) + E.avg(x.b)) / 2)), off: !!x.why, tap: () => (E.freeStaff(S()).length === 1 ? breedConfirm(x.a.id, x.b.id, E.freeStaff(S())[0].id) : breedLead(x.a.id, x.b.id)) });
      body.appendChild(rows(ready.map(mk), 'No pair is ready.'));
      if (wait.length) { body.appendChild(ui.section('Not yet')); body.appendChild(rows(wait.map(mk))); }
    } });
  }
  function breedLead(aId, bId) {
    push({ id: 'breed-lead', title: 'Who leads?', render(body) {
      const s = S(), busy = E.busyStaff(s);
      const staff = s.staff.filter(x => !busy[x.id]).sort((x, y) => E.breedChance(s, y) - E.breedChance(s, x));
      body.appendChild(rows(staff.map(st => row({ img: pUrl(st.role, 3), title: st.name, sub: D.ROLES[st.role].name + ' · Care ' + st.care, right: span('mn-grade', pct(E.breedChance(s, st))), tap: () => breedConfirm(aId, bId, st.id) })), 'No one is free.'));
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
      body.appendChild(kv('Time', pn(E.breedWeeks(s, a.sp), 'week', 'weeks')));
      body.appendChild(ui.btn('Start', guard(() => { const r = Core.act('startBreeding', aId, bId, leadId); if (r.ok) { later(() => Core.popAll()); ui.toast('Pair is breeding', 'good'); } }), { cls: 'primary big' }));
    } });
  }

  // ----- event planner: habitat, theme, lead, confirm
  function eventHabsScreen() {
    push({ id: 'event-habs', title: 'Which habitat?', render(body) {
      const s = S(), cost = E.eventCost(s);
      body.appendChild(rows(eventHabs().map(x => row({ img: itemUrl(x.hab), title: E.habName(s, x.hab), sub: x.why ? null : pn(E.inHab(s, x.hab.id).length, 'animal', 'animals'), extra: x.why ? why(shortEvWhy(x.why)) : null, right: x.why ? null : money(cost), off: !!x.why, tap: () => eventTheme(x.hab.id) })), 'No habitats yet.'));
    } });
  }
  const shortEvWhy = t => (/quiet/i.test(t) ? 'Rests ' + ((/(\d+)/.exec(t) || [])[1] || '') + ' wks' : /no animals/i.test(t) ? 'No animals' : /well enough/i.test(t) ? 'All unwell' : /already/i.test(t) ? 'Event running' : t.split(' ').slice(0, 4).join(' '));
  function eventTheme(habId) {
    push({ id: 'event-theme', title: 'Which theme?', render(body) {
      const s = S(), h = E.item(s, habId); if (!h) { Core.pop(); return; }
      const list = D.THEME_ORDER.filter(t => (s.research['theme:' + t] || !D.THEMES[t].rp) && (!D.THEMES[t].needs || s.regions[D.THEMES[t].needs])).map(t => ({ t, fit: E.themeFit(s, h.t, t) }));
      list.sort((a, b) => (b.fit == null ? 1.5 : b.fit) - (a.fit == null ? 1.5 : a.fit));
      body.appendChild(rows(list.map(x => row({ img: iUrl('ready-event', 4), title: D.THEMES[x.t].name, sub: x.fit == null ? 'Untried' : E.fitWord(x.fit) + (h.lastTheme === x.t ? ' · done last' : ''), right: ui.sign(x.fit), tap: () => (E.freeStaff(S()).length === 1 ? eventConfirm(habId, x.t, E.freeStaff(S())[0].id) : eventLead(habId, x.t)) }))));
    } });
  }
  function eventLead(habId, theme) {
    push({ id: 'event-lead', title: 'Who hosts?', render(body) {
      const s = S(), busy = E.busyStaff(s);
      const staff = s.staff.filter(x => !busy[x.id]).sort((x, y) => y.charm - x.charm);
      body.appendChild(rows(staff.map(st => row({ img: pUrl(st.role, 3), title: st.name, sub: D.ROLES[st.role].name, right: ui.stat('Charm', st.charm), tap: () => eventConfirm(habId, theme, st.id) })), 'No one is free.'));
    } });
  }
  function eventConfirm(habId, theme, leadId) {
    push({ id: 'event-confirm', title: 'Hold it?', render(body) {
      const s = S(), h = E.item(s, habId), lead = E.staffer(s, leadId); if (!h || !lead) { Core.pop(); return; }
      const fit = E.themeFit(s, h.t, theme), cost = E.eventCost(s);
      body.appendChild(el('div', { cls: 'mn-team' }, imgEl(pUrl(lead.role, 3))));
      body.appendChild(el('div', { cls: 'mn-big' }, D.THEMES[theme].name));
      body.appendChild(kv('Where', E.habName(s, h)));
      body.appendChild(kv('Host', lead.name));
      body.appendChild(kv('Fit', fit == null ? 'Untried' : span('', ui.sign(fit), ' ', E.fitWord(fit))));
      body.appendChild(kv('Time', '3 weeks'));
      body.appendChild(ui.btn('Start', guard(() => { const r = Core.act('startEvent', habId, theme, leadId); if (r.ok) { later(() => Core.popAll()); ui.toast('Event started', 'good'); } }), { cls: 'primary big', sub: money(cost), disabled: s.money < cost, onDisabled: () => ui.toast(needMoney(cost), 'bad') }));
    } });
  }

  // ----- advertising, Open Day / Festival, Animal Show
  function campaignScreen() {
    push({ id: 'campaigns', title: 'Advertise', render(body, api) {
      const s = S();
      body.appendChild(rows(E.campaigns(s).map((c, i) => {
        const reason = c.weeksLeft > 0 ? 'On: ' + pn(c.weeksLeft, 'week', 'weeks') : c.lock ? 'Needs ' + c.lock : s.money < c.cost ? needMoney(c.cost) : '';
        return row({ img: iUrl('rep', 4), title: c.name, sub: c.note, extra: reason ? why(reason) : null, right: money(c.cost), off: !!reason,
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
      body.appendChild(el('div', { cls: 'chips' }, [ui.stat(stat, 'judged'), ui.stat('Gold', m.gold), ui.stat('Silver', m.silver), ui.stat('Bronze', m.bronze)]));
      const an = s.animals.slice().sort((a, b) => E.showScore(s, b) - E.showScore(s, a));
      body.appendChild(rows(an.map(a => { const medal = E.showMedal(s, a); return row({ img: aUrl(a, 2), title: a.name, sub: E.animalLabel(a), right: span('mn-grade', (medal ? medal[0].toUpperCase() + medal.slice(1) : 'None') + ' ' + E.showScore(s, a)), off: E.isSick(s, a),
        tap: () => ui.confirm('Enter ' + a.name + ' in the show?', () => { const r = Core.act('enterShow', a.id); if (r.ok) later(() => Core.popAll()); }, { yes: 'Enter' }) }); }), 'No animals.'));
    } });
  }

  // ------------------------------------------------------------------ BUILD
  function place(spec, onPlace, back) {
    Core.popAll();
    if (!window.ZRender || !ZRender.startPlacement) { ui.toast('Placing needs the floor.', 'bad'); return false; }
    return ZRender.startPlacement(spec, { onPlace, onDone() { /* back on the floor, time runs */ }, onCancel() { if (!Core.stack().length && back) openAt(back); } });
  }
  function buildScreen() {
    push({ id: 'build', title: 'Build', render(body) {
      const s = S(), nl = E.nextLand(s);
      body.appendChild(ui.grid([
        { icon: tUrl('hab:savanna', 2), label: 'Habitats', onTap: habitatList },
        { icon: bUrl('snack', 3), label: 'Facilities', onTap: facilityList },
        { icon: pixIcon('move', '#4aa3df', 4), label: 'Move', onTap: moveList },
        { icon: pixIcon('remove', '#e0584a', 4), label: 'Remove', onTap: removeList },
        { icon: iUrl('star', 6), label: 'Upgrade', onTap: upgradeList },
        { icon: tUrl('locked', 2), label: 'Buy land', sub: nl ? money(nl.cost) : 'All owned', onTap: landScreen }
      ], { cols: 2 }));
    } });
  }
  function habitatList() {
    push({ id: 'build-habs', title: 'Habitats', render(body) {
      const s = S();
      body.appendChild(rows(D.BIOME_ORDER.filter(b => s.regions[b]).map(b => {
        const c = E.habBuildCost(s, b), poor = s.money < c;
        return row({ img: tUrl('hab:' + b, 1), title: D.BIOMES[b].name, sub: D.SHAPE_NAME[b], extra: poor ? why(needMoney(c)) : null, right: money(c), off: poor, tap: () => placeHab(b) });
      }), 'No habitats yet.'));
    } });
  }
  function placeHab(b) {
    place({ kind: 'hab', t: b, label: D.BIOMES[b].name }, (q, r, rot) => {
      const res = Core.act('build', 'hab', b, q, r, rot);
      if (res && res.ok) ui.toast(D.BIOMES[b].name + ' built' + (res.housed ? ', ' + res.housed + ' moved in' : ''), 'good');
      return res;
    }, buildScreen);
  }
  function facTag(F) {
    const t = [];
    if (F.spend) t.push('Shop'); if (F.adjDraw) t.push('Draw +' + Math.round(F.adjDraw * 100) + '%'); if (F.adjSpend) t.push('Shops +' + Math.round(F.adjSpend * 100) + '%');
    if (F.crowd) t.push('Visitors +' + Math.round(F.crowd * 100) + '%'); if (F.rpw) t.push('Research'); if (F.repw) t.push('Fame'); if (F.vet) t.push('Breeding'); if (F.learn) t.push('Learning');
    return t.join(' · ');
  }
  function facilityList() {
    push({ id: 'build-facs', title: 'Facilities', render(body) {
      const s = S();
      const list = D.FAC_ORDER.filter(f => !D.FAC[f].rp || s.research['fac:' + f]).map(f => {
        const F = D.FAC[f], c = E.facCost(s, f), have = s.items.filter(i => i.k === 'fac' && i.t === f).length;
        const reason = F.limit && have >= F.limit ? 'Limit reached' : s.money < c ? needMoney(c) : '';
        return row({ img: bUrl(f, 2), title: F.name, sub: facTag(F), extra: reason ? why(reason) : null, right: money(c), off: !!reason, tap: () => placeFac(f) });
      });
      body.appendChild(rows(list));
    } });
  }
  function placeFac(f) {
    place({ kind: 'fac', t: f, repeat: true, label: D.FAC[f].name }, (q, r, rot) => {
      const res = Core.act('build', 'fac', f, q, r, rot);
      if (res && res.ok) ui.toast(D.FAC[f].name + ' built', 'good');
      return res;
    }, buildScreen);
  }
  function itemRows(onTap, extraFn) {
    return S().items.slice().sort((a, b) => (a.k === b.k ? 0 : a.k === 'hab' ? -1 : 1)).map(it => row({ img: itemUrl(it), title: itemName(it), sub: it.k === 'hab' ? D.BIOMES[it.t].name : null, extra: extraFn ? extraFn(it) : null, off: !!(extraFn && extraFn(it)), tap: () => onTap(it) }));
  }
  function moveList() {
    push({ id: 'build-move', title: 'Move', render(body) { body.appendChild(rows(itemRows(it => place({ kind: it.k, t: it.t, moveId: it.id, label: itemName(it) }, (q, r, rot) => { const res = Core.act('move', it.id, q, r, rot); if (res && res.ok) ui.toast('Moved', 'good'); return res; }, buildScreen)), 'Nothing to move.')); } });
  }
  function removeList() {
    push({ id: 'build-remove', title: 'Remove', render(body, api) {
      const s = S();
      body.appendChild(rows(itemRows(it => ui.confirm('Remove ' + itemName(it) + '? Half the price comes back.' + (it.k === 'hab' ? ' Its animals move out.' : ''), () => {
        const r = Core.act('remove', it.id); if (r.ok) { ui.toast('Removed. ' + money(r.refund) + ' back', 'good'); api.rerender(); }
      }, { danger: true, yes: 'Remove' }), it => (it.k === 'hab' && E.habStatus(s, it).busy ? 'Project running' : null)), 'Nothing to remove.'));
    } });
  }
  function upgradeList() {
    push({ id: 'build-upgrade', title: 'Upgrade', render(body, api) {
      const s = S(), cap = E.habLevelCap(s);
      body.appendChild(rows(habs().map(h => {
        const c = E.habUpgradeCost(h, s), room = E.habCap(h), next = E.habCap(Object.assign({}, h, { lvl: h.lvl + 1 }));
        const reason = h.lvl >= 5 ? 'Top level' : h.lvl >= cap ? 'Research needed' : s.money < c ? needMoney(c) : '';
        return row({ img: itemUrl(h), title: E.habName(s, h), sub: 'Level ' + h.lvl + (h.lvl < 5 ? ' to ' + (h.lvl + 1) : '') + ' · Room ' + room + (h.lvl < 5 ? ' to ' + next : ''), extra: reason ? why(reason) : null, right: h.lvl < 5 ? money(c) : null, off: !!reason,
          tap: () => ui.confirm('Upgrade ' + E.habName(s, h) + ' for ' + money(c) + '?', () => { const r = Core.act('upgrade', h.id); if (r.ok) { ui.toast('Level ' + r.lvl, 'good'); api.rerender(); } }, { yes: 'Upgrade' }) });
      }), 'No habitats yet.'));
    } });
  }
  function landScreen() {
    push({ id: 'build-land', title: 'Buy land', render(body, api) {
      const s = S(), nl = E.nextLand(s);
      if (!nl) { body.appendChild(el('div', { cls: 'empty' }, 'You own it all.')); return; }
      body.appendChild(el('div', { cls: 'mn-pic one' }, imgEl(tUrl('locked', 3)))); body.appendChild(kv('Rows now', s.rows)); body.appendChild(kv('Rows after', nl.rows)); body.appendChild(kv('Price', money(nl.cost)));
      const reason = E.rank(s) < nl.rank ? 'Needs rank ' + nl.rank : s.money < nl.cost ? needMoney(nl.cost) : '';
      body.appendChild(ui.btn('Buy', guard(() => { const r = Core.act('buyLand'); if (r.ok) { ui.toast('New land at the back', 'good'); api.rerender(); } }), { cls: 'primary big', sub: reason || money(nl.cost), disabled: !!reason }));
    } });
  }

  // ------------------------------------------------------------------ ANIMALS
  let animalTab = 'zoo';
  const ageText = a => { const s = S(); if (E.isJuv(s, a)) return 'Baby'; if (a.born == null) return 'Adult'; const y = Math.floor((s.week - a.born) / D.WPY); return y < 1 ? 'Young' : y + 'y'; };
  function animalRow(a, o) {
    const s = S();
    return row({ img: aUrl(a, 2), title: a.name, sub: E.animalLabel(a) + ' · ' + a.sex + ' · ' + ageText(a),
      extra: o && o.act ? null : animalChips(a), line: o && o.act ? animalChips(a) : null,
      right: o && o.act ? null : [starsOn(E.sp(a).rarity), E.isSick(s, a) ? imgEl(iUrl('sick', 3), 'mn-mini') : null], tap: () => animalScreen(a.id), act: o && o.act });
  }
  function animalsScreen(tab) {
    if (tab) animalTab = tab;
    push({ id: 'animals', title: 'Animals', render(body, api) {
      const s = S(), pen = E.holding(s), offers = s.offers, mk = offers ? offers.list.length + (E.crateInfo(s) ? 1 : 0) : 0;
      body.appendChild(ui.tabs([{ id: 'zoo', label: 'Zoo' }, { id: 'pen', label: 'Pen ' + pen.length + '/' + E.holdCap(s) }, { id: 'market', label: mk ? 'Market ' + mk : 'Market' }], animalTab, t => { animalTab = t; api.rerender(); }));
      if (animalTab === 'zoo') {
        let any = false;
        habs().forEach(h => {
          const an = E.inHab(s, h.id).sort((a, b) => E.avg(b) - E.avg(a)); if (!an.length) return; any = true;
          body.appendChild(ui.section(E.habName(s, h) + '  ' + an.length + '/' + E.habCap(h)));
          body.appendChild(el('div', { cls: 'list' }, an.map(a => animalRow(a))));
        });
        if (!any) body.appendChild(el('div', { cls: 'empty' }, 'No animals in habitats.'));
      } else if (animalTab === 'pen') {
        const canAny = pen.some(a => E.bestHab(s, a));
        if (pen.length > 1) body.appendChild(ui.btn('House all', () => { const r = Core.act('autoHouseAll'); if (r.ok) { ui.toast(r.moved.length ? pn(r.moved.length, 'animal', 'animals') + ' housed' : 'No room'); api.rerender(); } }, { cls: 'primary big', disabled: !canAny, sub: canAny ? '' : 'No room' }));
        body.appendChild(rows(pen.map(a => { const h = E.bestHab(s, a); return animalRow(a, { act: ui.btn('House', () => { const r = Core.act('autoHouse', a.id); if (r.ok) { const hh = E.item(s, r.hab); ui.toast('Housed' + (hh ? ' in ' + E.habName(s, hh) : ''), 'good'); api.rerender(); } }, { cls: 'primary', disabled: !h, sub: h ? '' : 'No room' }) }); }), 'The pen is empty.'));
      } else marketBody(body, api);
    } });
  }
  function marketBody(body, api) {
    const s = S(), o = s.offers, info = E.crateInfo(s);
    if (!o || (!o.list.length && !info)) { body.appendChild(el('div', { cls: 'empty' }, 'Nobody is selling.')); return; }
    body.appendChild(ui.section(o.kind === 'director' ? 'Visiting director' : 'Trader'));
    if (info) body.appendChild(row({ img: iUrl('coin', 4), title: 'Mystery crate', sub: 'Odds shown inside', right: money(info.cost), tap: () => crateScreen() }));
    body.appendChild(rows(o.list.map((x, i) => row({ img: aUrl(x.a, 2), title: E.animalLabel(x.a), sub: (x.a.sex === 'F' ? 'Female' : 'Male') + ' · ' + (S().book[x.a.sp] ? 'Seen' : 'New!'),
      extra: animalChips(x.a), right: [money(x.price), starsOn(E.sp(x.a).rarity)], tap: () => offerScreen(i) })), info ? '' : 'Nothing left.'));
  }
  function statBoxes(a) {
    return el('div', { cls: 'mn-stats' }, [['charm', 'Charm'], ['vigor', 'Vigor'], ['wit', 'Wit']].map(k => el('div', { cls: 'mn-st ' + k[0] }, el('b', k[1]), span('n', a[k[0]]), el('i', E.grade(a[k[0]])))));
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
      body.appendChild(el('div', { cls: 'center' }, (a.sex === 'F' ? 'Female' : 'Male') + ' · ' + ageText(a) + ' · ' + (h ? E.habName(s, h) : 'Holding pen') + (E.isSick(s, a) ? ' · Unwell' : '')));
      if (!h) { const best = E.bestHab(s, a); body.appendChild(ui.btn('House', () => { const r = Core.act('autoHouse', id); if (r.ok) { ui.toast('Housed', 'good'); later(() => api.pop()); } }, { cls: 'primary big', disabled: !best, sub: best ? E.habName(s, best) : 'No room' })); }
      const inProj = !!E.busyAnimals(s)[id];
      body.appendChild(ui.btn('Choose habitat', () => habChooser(id), { cls: 'big', disabled: inProj, sub: inProj ? 'In a project' : '' }));
      if (h) body.appendChild(ui.btn('To holding pen', () => { const r = Core.act('moveAnimal', id, null); if (r.ok) { ui.toast('In the pen'); api.rerender(); } }, { cls: 'ghost' }));
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
      body.appendChild(ui.btn('Buy', guard(() => { const r = Core.act('buyAnimal', i); if (r.ok) { const h = r.hab != null ? E.item(s, r.hab) : null; ui.toast('Bought' + (h ? ', housed in ' + E.habName(s, h) : ', in the pen'), 'good'); later(() => api.pop()); } }), { cls: 'primary big', sub: money(o.price), disabled: s.money < o.price, onDisabled: () => ui.toast(needMoney(o.price), 'bad') }));
    } });
  }
  function crateScreen() {
    push({ id: 'crate', title: 'Mystery crate', render(body, api) {
      const s = S(), info = E.crateInfo(s); if (!info) { api.pop(); return; }
      body.appendChild(el('div', { cls: 'center' }, imgEl(iUrl('coin', 8))));
      info.odds.forEach(o => body.appendChild(el('div', { cls: 'mn-odd' }, starsOn(o.rarity), ui.bar(o.p, { cls: 'gold' }), span('p', pct(o.p)))));
      const full = E.holding(s).length >= E.holdCap(s), poor = s.money < info.cost;
      body.appendChild(ui.btn('Open', guard(() => openCrate(api)), { cls: 'primary big', sub: full ? 'Pen is full' : poor ? needMoney(info.cost) : money(info.cost), disabled: full || poor }));
    } });
  }
  function openCrate(api) {
    const r = Core.act('openCrate'); if (!r.ok) return;
    if (window.ZMoments && ZMoments.revealCrate) { try { ZMoments.revealCrate(r, () => { try { Core.rerender(); } catch (e) { /* ignore */ } }); return; } catch (e) { /* use ours */ } }
    const a = r.animal, sp = E.sp(a);
    reveal(api, { id: 'crate-rarity', kicker: 'Mystery crate', title: D.RARITY.name[r.rarity], body: (() => { const w = starsOn(r.rarity); w.classList.add('big'); return w; })(), tone: r.rarity >= 4 ? 'rare' : '' }, a1 => {
      a1.replace({ id: 'crate-animal', modal: true, render(b, a2) {
        const h = r.hab != null ? E.item(S(), r.hab) : null;
        b.appendChild(ui.reveal({ kicker: r.isNew ? 'New species!' : r.variant ? 'Rare variant!' : sp.name, img: aUrl(a, 5), title: E.animalLabel(a),
          body: el('div', { cls: 'chips', style: { justifyContent: 'center' } }, [ui.stat('Cha', a.charm, 'charm'), ui.stat('Vig', a.vigor, 'vigor'), ui.stat('Wit', a.wit, 'wit')]),
          sub: h ? 'Housed in ' + E.habName(S(), h) : 'In the holding pen', tone: r.isNew || r.variant || r.rarity >= 4 ? 'rare' : '', onTap: () => a2.pop() }));
      } });
    });
  }

  // ------------------------------------------------------------------ STAFF
  const animalChips = a => el('span', { cls: 'mn-cl' }, [ui.stat('Cha', a.charm, 'charm'), ui.stat('Vig', a.vigor, 'vigor'), ui.stat('Wit', a.wit, 'wit'), span('mn-grade', E.grade(E.avg(a)))]);
  const staffChips = st => el('span', { cls: 'mn-cl' }, [ui.stat('Care', st.care), ui.stat('Sci', st.sci), ui.stat('Scout', st.exp), ui.stat('Charm', st.charm)]);
  function staffScreen() {
    push({ id: 'staff', title: 'Staff', render(body, api) {
      const s = S(), busy = E.busyStaff(s), cap = E.staffCap(s);
      body.appendChild(ui.btn('Hire', hireScreen, { cls: 'primary big', sub: s.staff.length + '/' + cap, disabled: s.staff.length >= cap, onDisabled: () => ui.toast('Staff room is full', 'bad') }));
      if (s.candidates && s.candidates.length) body.appendChild(ui.btn('Who turned up', candidatesScreen, { cls: 'blue', sub: s.candidates.length + ' waiting' }));
      if (s.headhunt) {
        const h = s.headhunt, fee = E.headhuntFee(h);
        body.appendChild(ui.section('Headhunter'));
        body.appendChild(row({ img: pUrl(h.role, 3), title: h.name, sub: D.ROLES[h.role].name + ' · Lv ' + h.lvl, line: staffChips(h), act: ui.btn('Hire', guard(() => { const r = Core.act('hireHeadhunt'); if (r.ok) { ui.toast(h.name + ' joined', 'good'); api.rerender(); } }), { cls: 'primary', sub: money(fee), disabled: s.money < fee || s.staff.length >= cap }) }));
      }
      body.appendChild(ui.section('Team'));
      body.appendChild(el('div', { cls: 'list' }, s.staff.map(st => row({ img: pUrl(st.role, 3), title: st.name, sub: D.ROLES[st.role].name + ' · Lv ' + st.lvl + ' · ' + money(E.salary(st)) + '/wk', extra: staffChips(st), right: busy[st.id] ? imgEl(iUrl('busy', 3), 'mn-mini') : null, tap: () => staffDetail(st.id) }))));
    } });
  }
  function staffDetail(id) {
    push({ id: 'staff-one', title: 'Staff', render(body, api) {
      const s = S(), st = E.staffer(s, id); if (!st) { api.pop(); return; }
      const R = D.ROLES[st.role], busy = !!E.busyStaff(s)[id];
      body.appendChild(el('div', { cls: 'mn-pic one' }, imgEl(pUrl(st.role, 6))));
      body.appendChild(el('div', { cls: 'mn-big' }, st.name));
      body.appendChild(el('div', { cls: 'center' }, R.name + ' · Level ' + st.lvl));
      body.appendChild(ui.bar(Math.min(1, st.xp / (40 + st.lvl * 30)), { cls: 'blue', label: 'XP' }));
      body.appendChild(el('div', { cls: 'chips', style: { justifyContent: 'center' } }, [ui.stat('Care', st.care), ui.stat('Science', st.sci), ui.stat('Scouting', st.exp), ui.stat('Charm', st.charm)]));
      body.appendChild(kv('Pay', money(E.salary(st)) + '/wk'));
      if (busy) body.appendChild(kv('Status', 'On a project'));
      const wait = E.trainWait(s, st);
      body.appendChild(ui.btn('Train', () => trainScreen(id), { cls: 'primary big', sub: wait > 0 ? 'Again in ' + pn(wait, 'week', 'weeks') : money(E.trainCost(st)) }));
      const lowLv = st.lvl < D.JOB_LEVEL;
      body.appendChild(ui.btn('Change job', () => jobScreen(id), { cls: 'big', disabled: lowLv || busy, sub: lowLv ? 'Level ' + D.JOB_LEVEL + ' needed' : busy ? 'On a project' : '' }));
      body.appendChild(ui.btn('Let go', () => ui.confirm('Let ' + st.name + ' go for good?', () => { const r = Core.act('fire', id); if (r.ok) { ui.toast(st.name + ' left'); later(() => api.pop()); } }, { danger: true, yes: 'Let go' }), { cls: 'danger', disabled: busy, sub: busy ? 'On a project' : '' }));
    } });
  }
  function trainScreen(id) {
    push({ id: 'staff-train', title: 'Train', render(body, api) {
      const s = S(), st = E.staffer(s, id); if (!st) { api.pop(); return; }
      const wait = E.trainWait(s, st), c = E.trainCost(st);
      body.appendChild(ui.note('Sometimes a Super! triple gain.'));
      body.appendChild(rows(D.COURSES.map(co => {
        const reason = wait > 0 ? 'Again in ' + pn(wait, 'week', 'weeks') : s.money < c ? needMoney(c) : '';
        return row({ title: co.name, sub: D.STATS[co.stat] + ' ' + st[co.stat], extra: reason ? why(reason) : null, right: money(c), off: !!reason,
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
        return row({ img: pUrl(o.role, 3), title: R.name, sub: ROLE_TAG[o.role] || '', extra: reason ? why(reason) : null, right: money(c), off: !!reason,
          tap: () => ui.confirm('Make ' + st.name + ' a ' + R.name + '? Back to level 1.', () => { const r = Core.act('changeJob', id, o.role); if (r.ok) { ui.toast(st.name + ' is now a ' + R.name, 'good'); later(() => api.pop()); } }, { yes: 'Change' }) });
      })));
    } });
  }
  function hireScreen() {
    push({ id: 'staff-hire', title: 'Advertise', render(body, api) {
      const s = S(), full = s.staff.length >= E.staffCap(s);
      body.appendChild(ui.choices(E.hireTiers(s).map(t => ({ label: t.name, note: full ? 'Staff room full' : t.lock ? 'Needs ' + t.lock : t.note + (t.star >= 0.1 ? ' · stars likely' : ''), cost: t.cost, disabled: full || !!t.lock })), i => {
        const r = Core.act('advertise', i); if (!r.ok) return;
        api.replace(candidatesDef());
        if (window.ZMoments && ZMoments.revealHire) { try { ZMoments.revealHire(r.candidates, () => { try { Core.rerender(); } catch (e) { /* ignore */ } }); } catch (e) { /* list is already there */ } }
      }));
    } });
  }
  function candidatesDef() {
    return { id: 'staff-candidates', title: 'Who turned up', render(body, api) {
      const s = S(), full = s.staff.length >= E.staffCap(s);
      body.appendChild(rows((s.candidates || []).map((c, i) => row({ img: pUrl(c.role, 3), title: c.name, sub: D.ROLES[c.role].name + ' · Lv ' + c.lvl, line: el('span', { cls: 'mn-cl' }, [c.star ? ui.stat('Star', '!') : null, ui.stat('Care', c.care), ui.stat('Sci', c.sci), ui.stat('Scout', c.exp), ui.stat('Charm', c.charm)]),
        act: ui.btn('Hire', guard(() => { const r = Core.act('hireCandidate', i); if (r.ok) { ui.toast(c.name + ' joined', 'good'); api.rerender(); } }), { cls: 'primary', disabled: full, sub: full ? 'Full' : money(E.salary(c)) + '/wk' }) })), 'Nobody left.'));
    } };
  }
  function candidatesScreen() { push(candidatesDef()); }

  // ------------------------------------------------------------------ RESEARCH
  function researchScreen() {
    push({ id: 'research', title: 'Research', render(body) {
      const s = S(), all = E.researchList(s), groups = [['Regions', 'Regions', pUrl('explorer', 5)], ['Know-how', 'Know-how', iUrl('m-research', 6)], ['Facilities', 'Facilities', bUrl('gift', 3)], ['Event themes', 'Themes', iUrl('ready-event', 6)], ['Landmarks', 'Landmarks', bUrl('gate', 3)]];
      body.appendChild(el('div', { cls: 'mn-kv' }, span('k', 'You have'), span('v', fmt.num(s.rp) + ' RP')));
      body.appendChild(ui.grid(groups.map(g => { const items = all.filter(x => x.group === g[0]), n = items.filter(x => !x.done && !x.lock && x.rp <= s.rp).length; return { icon: g[2], label: g[1], sub: items.filter(x => x.done).length + '/' + items.length, badge: n || false, onTap: () => researchGroup(g[0], g[1]) }; }), { cls: '', cols: 2 }));
    } });
  }
  function researchGroup(group, label) {
    push({ id: 'research-list', title: label, render(body, api) {
      const s = S(), items = E.researchList(s).filter(x => x.group === group);
      items.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
      body.appendChild(el('div', { cls: 'mn-kv' }, span('k', 'You have'), span('v', fmt.num(s.rp) + ' RP')));
      body.appendChild(rows(items.map(x => {
        const reason = x.done ? '' : x.lock ? x.lock : x.rp > s.rp ? 'Need ' + fmt.num(x.rp - s.rp) + ' more' : '';
        let img = iUrl('m-research', 4); if (x.id.indexOf('region:') === 0) img = tUrl('hab:' + x.id.slice(7), 1); else if (x.id.indexOf('fac:') === 0) img = bUrl(x.id.slice(4), 2); else if (x.id.indexOf('theme:') === 0) img = iUrl('ready-event', 4);
        return row({ img, title: x.name, sub: x.id.indexOf('theme:') === 0 || x.id.indexOf('region:') === 0 ? null : x.desc, extra: reason ? why(reason) : null, right: x.done ? span('mn-grade', 'Done') : fmt.num(x.rp) + ' RP', off: x.done || !!reason, cls: x.done ? 'disabled' : '',
          tap: () => ui.confirm('Research ' + x.name + ' for ' + fmt.num(x.rp) + ' RP?', () => { const r = Core.act('doResearch', x.id); if (r.ok) { ui.toast('Learned ' + x.name, 'good'); api.rerender(); } }, { yes: 'Research' }) });
      })));
    } });
  }

  // ------------------------------------------------------------------ INFO
  function infoScreen() {
    push({ id: 'info', title: 'Info', render(body) {
      const s = S();
      body.appendChild(ui.grid([
        { icon: iUrl('m-info', 6), label: 'Book', sub: E.speciesCount(s) + ' found', onTap: bookScreen },
        { icon: iUrl('star', 6), label: 'Combos', sub: comboFound() + '/' + D.COMBOS.length, onTap: comboScreen },
        { icon: iUrl('heart', 6), label: 'Fits', onTap: fitScreen },
        { icon: iUrl('choice', 6), label: 'Rumors', onTap: rumorScreen },
        { icon: iUrl('rep', 6), label: 'Ranks', sub: E.rankings(s).place + ' of ' + E.rankings(s).of, onTap: rankScreen },
        { icon: iUrl('rp', 6), label: 'Years', sub: s.history.length ? pn(s.history.length, 'year', 'years') : '', onTap: yearsScreen },
        { icon: iUrl('coin', 6), label: 'Awards', onTap: awardsScreen },
        Core.devTools ? { icon: iUrl('m-system', 6), label: 'Log', onTap: () => Core.screens.log() } : null
      ].filter(Boolean), { cols: 2 }));
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
        body.appendChild(rows(near.map(n => { const c = D.COMBOS.find(x => x.id === n.combo), f = D.FAC[n.fac]; return row({ img: bUrl(n.fac, 2), title: c.name, sub: 'Add ' + f.name, right: money(E.facCost(s, n.fac)), tap: () => {
          place({ kind: 'fac', t: n.fac, label: f.name }, (q, r, rot) => { const res = Core.act('build', 'fac', n.fac, q, r, rot); if (res && res.ok) ui.toast(f.name + ' built', 'good'); return res; }, comboScreen);
          if (window.ZRender && ZRender.centerOn && n.cells[0]) ZRender.centerOn(n.cells[0][0], n.cells[0][1]);
        } }); })));
      }
      body.appendChild(ui.section('Found ' + found.length + '/' + D.COMBOS.length));
      const locked = D.COMBOS.filter(c => !found.includes(c));
      if (locked.length) { body.appendChild(ui.section('Not found yet')); body.appendChild(rows(locked.map(c => row({ img: iUrl('star', 4), title: '?', sub: c.hint, off: true })))); }
      body.appendChild(rows(found.map(c => row({ img: iUrl('star', 4), title: c.name, sub: effectText(c), extra: el('span', { cls: 'chips' }, [c.anchor, ...c.needs].map(pieceImg)), right: act.has(c.id) ? span('mn-grade', 'On') : null })), 'None found yet.'));
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

  // ----- rumors
  function rumorScreen() {
    push({ id: 'rumors', title: 'Rumors', render(body) {
      const s = S();
      body.appendChild(rows(E.secretHints(s).map(x => el('div', { cls: 'row', style: { flexDirection: 'column', alignItems: 'stretch', gap: '4px' } },
        el('span', { cls: 't' }, x.done ? x.name : 'An unmarked place'), x.steps.map(st => el('div', { cls: 'mn-lg' }, el('i', { cls: 'mn-box' + (st.ok ? ' ok' : '') }), span('', st.t + (st.prog ? ' ' + st.prog : ''))))))));
      if (s.fragments) body.appendChild(el('div', { cls: 'mn-pips' }, [1, 2, 3, 4].map(i => el('i', { cls: i <= s.fragments ? 'on' : '' }))));
      body.appendChild(ui.section('Special visitors'));
      body.appendChild(rows(D.VIPS.map(v => row({ img: pUrl('vip', 3), title: s.vips[v.id] != null ? v.name : 'After ' + v.when, sub: s.vips[v.id] != null ? 'Visited' : null, off: s.vips[v.id] == null }))));
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
      body.appendChild(el('div', { cls: 'chips', style: { justifyContent: 'center' } }, [ui.stat('Events', s.life.events), ui.stat('Trips', s.life.expeditions), ui.stat('Births', s.life.births), ui.stat('Trophies', s.trophies)]));
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
      items.forEach(it => { const p = Math.min(1, it[1] / it[2]); body.appendChild(row({ img: iUrl('star', 4), title: it[0], sub: Math.round(it[1]) + ' of ' + Math.round(it[2]) + it[3], extra: ui.bar(p, { cls: p >= 1 ? '' : 'gold' }), right: p >= 1 ? span('mn-grade', 'On track') : null })); });
      body.appendChild(row({ img: iUrl('rep', 4), title: 'Zoo of the Year', sub: 'Place ' + r.place + ' of ' + r.of, right: r.place === 1 ? span('mn-grade', 'On track') : null }));
      body.appendChild(ui.note('Judged at year end.'));
    } });
  }

  // ------------------------------------------------------------------ SYSTEM
  function systemScreen() {
    push({ id: 'system', title: 'System', render(body, api) {
      body.appendChild(ui.btn('Save now', () => { const ok = Core.save(); ui.toast(ok === false ? 'Not saved' : 'Saved', ok === false ? 'bad' : 'good'); }, { cls: 'primary big', icon: iUrl('m-system', 4) }));
      body.appendChild(ui.section('Speed'));
      body.appendChild(ui.tabs([{ id: '1', label: '1x' }, { id: '2', label: '2x' }], String(Core.speed), id => { Core.setSpeed(+id); api.rerender(); }));
      if (window.ZRender && ZRender.getZoom) {
        body.appendChild(ui.section('Zoom'));
        body.appendChild(ui.tabs([{ id: '1', label: 'Close' }, { id: '0', label: 'Far' }], String(ZRender.getZoom()), id => { ZRender.setZoom(+id); api.rerender(); }));
      }
      body.appendChild(ui.btn('How to play', howScreen, { cls: 'big', icon: iUrl('m-info', 4) }));
      body.appendChild(ui.btn('New zoo', newZooScreen, { cls: 'danger', icon: iUrl('m-projects', 4) }));
    } });
  }
  function howScreen() {
    push({ id: 'how', title: 'How to play', render(body) {
      const L = [['m-system', 'Tap the zoo for the menu. Time stops.'], ['m-animals', 'Expeditions bring animals. House them.'], ['ready-breed', 'Heart: a pair can breed.'], ['ready-event', 'Flag: an event can start.'], ['choice', '!: something needs you.'], ['m-build', 'Build, then tap a hex and Place.'], ['star', 'You cannot lose. 20 years, then a score.']];
      body.appendChild(rows(L.map(l => row({ img: iUrl(l[0], 4), title: l[1] }))));
    } });
  }

  // ----- legacy and new zoo
  function recordLegacy() {
    const s = S(); if (!s || !s.finished || !s.score) return false;
    s.flags = s.flags || {}; if (s.flags.legacySaved) return false;
    s.flags.legacySaved = true;
    const L = Core.legacy, last = s.history[s.history.length - 1];
    L.runs = (L.runs || 0) + 1; L.best = Math.max(L.best || 0, s.score.total); L.aff = Object.assign(L.aff || {}, s.aff); L.combos = Object.assign(L.combos || {}, s.combos);
    L.hall = (L.hall || []).concat([{ zoo: s.zooName, score: s.score.total, place: last ? last.place : 12, at: new Date().toISOString() }]);
    const copy = o => JSON.parse(JSON.stringify(o));
    L.carry = { staff: s.staff.slice().sort((a, b) => (b.lvl + (b.mastered || []).length * 30) - (a.lvl + (a.mastered || []).length * 30)).slice(0, 4).map(copy), animals: s.animals.slice().sort((a, b) => E.prestige(b) - E.prestige(a)).slice(0, 4).map(copy) };
    Core.saveLegacy(); return true;
  }
  const nz = { name: 'Wildside Zoo', staff: null, animal: null };
  function newZooScreen() {
    recordLegacy();
    push({ id: 'newzoo', title: 'New zoo', render(body) {
      const L = Core.legacy, s = S();
      const f = el('input', { cls: 'field', type: 'text', maxlength: 28, value: nz.name, 'aria-label': 'Zoo name' }); f.addEventListener('input', () => { nz.name = f.value; });
      body.appendChild(f);
      if (L.runs) {
        body.appendChild(ui.section('Carry-over'));
        body.appendChild(kv('Start money', '+' + money(Math.min(L.runs, 5) * 6000)));
        body.appendChild(kv('Research', '+' + Math.min(5, L.runs) * 10 + '%'));
        if (L.carry && L.carry.staff && L.carry.staff.length) {
          body.appendChild(ui.section('Bring one person'));
          body.appendChild(el('div', { cls: 'list' }, L.carry.staff.map((st, i) => row({ img: pUrl(st.role, 3), title: st.name, sub: D.ROLES[st.role].name + ' · Lv ' + st.lvl, cls: nz.staff === i ? 'mn-on' : '', tap: () => { nz.staff = nz.staff === i ? null : i; Core.rerender(); } }))));
        }
        if (L.carry && L.carry.animals && L.carry.animals.length) {
          body.appendChild(ui.section('Bring one animal'));
          body.appendChild(el('div', { cls: 'list' }, L.carry.animals.map((a, i) => row({ img: spUrl(a.sp, { variant: !!a.variant }, 2), title: a.name, sub: E.animalLabel(a) + ' · Avg ' + Math.round(E.avg(a)), cls: nz.animal === i ? 'mn-on' : '', tap: () => { nz.animal = nz.animal === i ? null : i; Core.rerender(); } }))));
        }
      }
      body.appendChild(ui.btn('Start new zoo', () => ui.confirm(s.finished ? 'Start over? This score is kept.' : 'Start over? This zoo is replaced.', () => ui.confirm('Really sure?', () => {
        const opts = { zooName: (nz.name || 'Wildside Zoo').trim().slice(0, 28) };
        if (L.carry && nz.staff != null && L.carry.staff[nz.staff]) opts.staff = L.carry.staff[nz.staff];
        if (L.carry && nz.animal != null && L.carry.animals[nz.animal]) opts.animal = L.carry.animals[nz.animal];
        nz.staff = null; nz.animal = null; Core.newGame(opts);
      }, { danger: true, yes: 'Yes, new zoo' }), { danger: true, yes: 'Continue' }), { cls: 'danger big' }));
    } });
  }

  // ------------------------------------------------------------------ public
  window.ZMenus = {
    open, init() { /* nothing to register */ }, recordLegacy,
    screens: { main: open, projects: projectsScreen, build: buildScreen, animals: () => animalsScreen('zoo'), staff: staffScreen, research: researchScreen, info: infoScreen, system: systemScreen,
      book: bookScreen, combos: comboScreen, fits: fitScreen, rumors: rumorScreen, ranks: rankScreen, years: yearsScreen, awards: awardsScreen, how: howScreen, newZoo: newZooScreen,
      expedition: expStart, breeding: breedPairs, event: eventHabsScreen, campaigns: campaignScreen, hire: hireScreen, market: () => animalsScreen('market'), pen: () => animalsScreen('pen'), crate: crateScreen,
      animal: animalScreen, staffer: staffDetail, habitats: habitatList, facilities: facilityList, move: moveList, remove: removeList, upgrade: upgradeList, land: landScreen, yearly: yearlyScreen, show: showScreen, decision: happeningScreen }
  };
})();
