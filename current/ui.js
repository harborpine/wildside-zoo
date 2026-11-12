/* Wildside Zoo: interface, saving and gameplay logging. */
(function () {
  const D = window.ZD, Z = window.ZE;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => { n = Math.round(n); const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : a >= 1e7 ? (n / 1e6).toFixed(1) + 'M' : n.toLocaleString('en-US'); };
  const money = n => (n < 0 ? '-$' : '$') + num(Math.abs(n));
  const pct = v => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';
  const first = s => s.name.split(' ')[0];
  const WEEK_MS = [0, 10000, 5000, 2500];
  const FAC_UI = { snack: ['Snack', '', 'shop'], bench: ['Bench', '', 'decor'], restroom: ['WC', '', 'plain'], icecream: ['Ice', 'cream', 'shop'], gift: ['Gift', 'shop', 'shop'], photo: ['Photo', '', 'decor'], kiosk: ['Info', '', 'sci'], fountain: ['Foun-', 'tain', 'decor'], cafe: ['Cafe', '', 'shop'], playground: ['Play', '', 'decor'], vet: ['Vet', '', 'sci'], lab: ['Lab', '', 'sci'], deck: ['Deck', '', 'decor'], gate: ['Grand', 'Gate', 'landmark'], center: ['Cons.', 'Center', 'landmark'], pavilion: ['Royal', 'Pav.', 'landmark'] };
  const FAC_COL = { shop: '#a8642a', decor: '#4f7f5f', sci: '#4a5f96', landmark: '#8b5fb3', plain: '#5b6b62' };
  const COMBO_COL = ['#f2b632', '#e2562f', '#7a58b5', '#2f7f9b', '#d6456b', '#3a9d5d'];
  const MENU = [['build', 'Build'], ['projects', 'Projects'], ['animals', 'Animals'], ['staff', 'Staff'], ['research', 'Research'], ['book', 'Book'], ['records', 'Records']];
  const CAT = { animals: 'Animals', habitat: 'Habitat', fun: 'Fun', learning: 'Learning' };

  let S = null;
  const UI = { menu: null, mode: { type: 'select' }, rot: 0, sel: null, speed: 1, lastSpeed: 1, acc: 0, modal: null, queue: [], sub: { book: 'species', animals: 'all' }, plan: null, hover: null, walkers: [], newCombo: null, preview: null };

  // ---------- hex geometry (pointy-top, axial coordinates) ----------
  const HX = (() => { const R = 30, W = Math.sqrt(3) * R, pad = 8; return { R: R, W: W, pad: pad, vw: W * (D.GRID_W + 0.5) + pad * 2, vh: 1.5 * R * D.GRID_H + 0.5 * R + pad * 2 }; })();
  const EDGES = [[[1, -1], 0, 1], [[1, 0], 1, 2], [[0, 1], 2, 3], [[-1, 1], 3, 4], [[-1, 0], 4, 5], [[0, -1], 5, 0]];
  const ctr = (q, r) => [HX.W * (q + r / 2) + HX.W / 2 + HX.pad, 1.5 * HX.R * r + HX.R + HX.pad];
  const corner = (cx, cy, k, R) => { const a = (-90 + 60 * k) * Math.PI / 180; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; };
  function hexPts(q, r, scale) { const c = ctr(q, r); let s = ''; for (let k = 0; k < 6; k++) { const p = corner(c[0], c[1], k, HX.R * (scale || 1)); s += p[0].toFixed(1) + ',' + p[1].toFixed(1) + ' '; } return s; }
  function outline(cells) {
    const set = {}; cells.forEach(c => { set[c[0] + ',' + c[1]] = 1; }); let d = '';
    cells.forEach(c => { const m = ctr(c[0], c[1]); EDGES.forEach(e => { if (set[(c[0] + e[0][0]) + ',' + (c[1] + e[0][1])]) return; const a = corner(m[0], m[1], e[1], HX.R), b = corner(m[0], m[1], e[2], HX.R); d += 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'L' + b[0].toFixed(1) + ' ' + b[1].toFixed(1); }); });
    return d;
  }
  function labelPos(cells) {
    let x = 0, y = 0; const pts = cells.map(c => ctr(c[0], c[1])); pts.forEach(p => { x += p[0]; y += p[1]; }); x /= pts.length; y /= pts.length;
    const a = pxToAxial(x, y); if (!cells.some(c => c[0] === a[0] && c[1] === a[1]) && cells.length === 6) { const top = pts.slice().sort((m, n) => m[1] - n[1])[0]; return [x, top[1]]; }
    return [x, y];
  }
  function pxToAxial(x, y) {
    const rf = (y - HX.R - HX.pad) / (1.5 * HX.R), qf = (x - HX.W / 2 - HX.pad) / HX.W - rf / 2;
    let rx = Math.round(qf), rz = Math.round(rf), ry = Math.round(-qf - rf); const dx = Math.abs(rx - qf), dz = Math.abs(rz - rf), dy = Math.abs(ry + qf + rf);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy <= dz) rz = -rx - ry;
    return [rx, rz];
  }
  function viewScale() { const r = $('#mapwrap').getBoundingClientRect(), s = Math.min(r.width / HX.vw, r.height / HX.vh); return { s: s, ox: (r.width - HX.vw * s) / 2, oy: (r.height - HX.vh * s) / 2, r: r }; }
  function evToAxial(e) { const v = viewScale(); return pxToAxial((e.clientX - v.r.left - v.ox) / v.s, (e.clientY - v.r.top - v.oy) / v.s); }
  ['#map', '#walk', '#over'].forEach(id => $(id).setAttribute('viewBox', '0 0 ' + HX.vw.toFixed(1) + ' ' + HX.vh.toFixed(1)));

  // ---------- storage: this browser + the artifact database ----------
  const LS_SAVE = 'wildside.save.v2', LS_LEG = 'wildside.legacy.v1', CLOUD_SAVE = 'saves/slot2';
  try { localStorage.removeItem('wildside.save.v1'); } catch (e) { /* storage unavailable */ }
  const Store = {
    db: null, state: 'checking', chain: Promise.resolve(), legacy: { runs: 0, best: 0, aff: {}, combos: {}, hall: [], carry: null }, local: null, cloud: null,
    lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    async init() {
      this.local = this.lsGet(LS_SAVE); const leg = this.lsGet(LS_LEG); if (leg) this.legacy = Object.assign(this.legacy, leg);
      try { if (window.claude && window.claude.use) this.db = await window.claude.use('db'); } catch (e) { this.db = null; }
      if (!this.db) { this.state = 'local'; return; }
      const got = await Promise.all([this.read(CLOUD_SAVE), this.read('meta/legacy')]);
      this.cloud = got[0]; if (got[1] && (got[1].runs || 0) >= (this.legacy.runs || 0)) this.legacy = Object.assign(this.legacy, got[1]);
      this.state = 'ok';
    },
    read(path) {
      if (!this.db) return Promise.resolve(null);
      const t = new Promise(res => setTimeout(() => res(null), 9000));
      const r = this.db.doc(path).get().then(s => (s && s.exists ? s.data() : null)).catch(() => null);
      return Promise.race([r, t]);
    },
    write(path, data) {
      if (!this.db) return;
      this.state = 'saving'; drawSave(); const clean = JSON.parse(JSON.stringify(data));
      this.chain = this.chain.then(() => this.db.doc(path).set(clean)).then(() => { this.state = 'ok'; drawSave(); }, e => { this.state = 'error'; this.err = e && e.code; drawSave(); });
    },
    add(coll, data) { if (!this.db) return; this.chain = this.chain.then(() => this.db.collection(coll).add(data)).catch(() => {}); }
  };
  function newTele() { return { tabs: {}, acts: {}, modals: {}, fails: {}, modes: {} }; }
  function tele(group, key) { if (!S) return; if (!S.tele) S.tele = newTele(); const t = S.tele[group] || (S.tele[group] = {}); t[key] = (t[key] || 0) + 1; }
  function flushLog(partial) {
    if (!S) return; const q = S.logQ || 0;
    Store.write('gamelog/' + S.runId + '-q' + String(q).padStart(3, '0'), { runId: S.runId, zoo: S.zooName, ng: S.ng, gameVersion: 2, quarter: q, year: Math.floor(q / 4) + 1, weekFrom: q * 12, weekTo: S.week, partial: !!partial, at: new Date().toISOString(), snapshot: Z.snapshot(S), events: S.elog.slice(), tele: S.tele || {} });
    Store.write('runs/' + S.runId, { runId: S.runId, zoo: S.zooName, ng: S.ng, gameVersion: 2, startedAt: new Date(S.startedAt).toISOString(), updatedAt: new Date().toISOString(), finished: !!S.finished,
      score: S.score ? S.score.total : null, scoreParts: S.score ? S.score.parts.map(p => ({ name: p[0], points: p[1] })) : null, snapshot: Z.snapshot(S), history: S.history });
    if (!partial) { S.elog = []; S.tele = newTele(); S.logQ = Math.floor(S.week / 12); }
  }
  const saveDoc = () => ({ savedAt: Date.now(), week: S.week, zoo: S.zooName, runId: S.runId, v: 2, json: Z.serialize(S) });
  function saveLocal() { if (S) Store.lsSet(LS_SAVE, saveDoc()); }
  function saveCloud() { if (S) Store.write(CLOUD_SAVE, saveDoc()); }
  function saveLegacy() { Store.lsSet(LS_LEG, Store.legacy); Store.write('meta/legacy', Store.legacy); }
  function saveAll(partialLog) { saveLocal(); if (partialLog) flushLog(true); saveCloud(); }

  // ---------- toasts, banner, floating pop-ups, modals ----------
  function toast(msg, kind) {
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = msg; $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'bad' ? 4200 : 2600);
    while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  }
  function banner(big, small) { const b = $('#banner'); b.innerHTML = esc(big) + (small ? '<small>' + esc(small) + '</small>' : ''); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  function floatAt(x, y, text, cls, delay) {
    setTimeout(() => {
      if (document.hidden) return; const v = viewScale(), el = document.createElement('div'); el.className = 'fl ' + (cls || ''); el.textContent = text;
      el.style.left = (v.ox + x * v.s) + 'px'; el.style.top = (v.oy + y * v.s) + 'px'; $('#floats').appendChild(el); setTimeout(() => el.remove(), 2000);
    }, delay || 0);
  }
  const itemPos = it => labelPos(Z.cells(it));
  function openModal(m) { UI.modal = m; tele('modals', m.kind || 'other'); drawModal(true); }
  function drawModal(fresh) {
    const m = UI.modal; $('#modal').classList.toggle('open', !!m); if (!m) return;
    const keep = fresh ? 0 : $('#mbody').scrollTop, c = m.render();
    $('#mbox').classList.toggle('wide', !!c.wide);
    $('#mhead').innerHTML = '<div>' + (c.eyebrow ? '<div class="eyebrow">' + c.eyebrow + '</div>' : '') + '<h2>' + c.title + '</h2></div>' + (m.closable === false ? '' : '<button class="btn ghost sm" data-act="close">Close</button>');
    $('#mbody').innerHTML = c.body; $('#mfoot').innerHTML = c.foot || '<button class="btn" data-act="close">OK</button>'; $('#mbody').scrollTop = keep;
  }
  function closeModal() { const m = UI.modal; UI.modal = null; UI.plan = null; drawModal(); if (m && m.onClose) m.onClose(); if (!UI.modal) nextReport(); render(); }
  function confirmModal(title, text, yes, fn) { openModal({ kind: 'confirm', render: () => ({ title: title, body: '<p>' + text + '</p>', foot: '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="yes">' + yes + '</button>' }), yes: fn }); }
  function act(res, okMsg, key) {
    if (!res.ok) { toast(res.msg, 'bad'); tele('fails', (key || 'x') + ': ' + res.msg.slice(0, 48)); return false; }
    if (key) { tele('acts', key); S.did[key] = (S.did[key] || 0) + 1; }
    if (okMsg) toast(okMsg, 'good'); render(); if (UI.modal) drawModal(); return true;
  }

  // ---------- small view helpers ----------
  const SG = [['m2', '--'], ['m1', '-'], ['p1', '+'], ['p2', '++']];
  const sg = l => '<span class="sg ' + SG[l][0] + '">' + SG[l][1] + '</span>';
  const sgq = '<span class="sg q" title="Not tried yet">?</span>';
  const fitSign = v => v == null ? sgq : sg(v);
  const ratioSign = r => r >= 1.5 ? '<span class="sg p2">+++</span>' : r >= 1.1 ? sg(3) : r >= 0.8 ? sg(2) : r >= 0.5 ? sg(1) : sg(0);
  const probSign = p => p >= 0.4 ? sg(3) : p >= 0.15 ? sg(2) : p >= 0.04 ? sg(1) : sg(0);
  const chanceSign = c => c >= 0.9 ? sg(3) : c >= 0.78 ? sg(2) : c >= 0.66 ? sg(1) : sg(0);
  const grade = a => { const g = Z.grade(Z.avg(a)); return '<span class="grade ' + g + '" title="Overall grade from the three stats">' + g + '</span>'; };
  const sexPill = a => '<span class="pill">' + (a.sex === 'M' ? 'Male' : 'Female') + '</span>';
  const rar = sp => '<span class="rar" title="' + D.RARITY.name[sp.rarity] + '">' + '★'.repeat(sp.rarity) + '</span>';
  const habName = h => D.BIOMES[h.t].name + ' #' + (S.items.filter(i => i.k === 'hab' && i.t === h.t).indexOf(h) + 1);
  function animalStatus(a) {
    const busy = Z.busyAnimals(S)[a.id];
    if (busy) return '<span class="pill g">Breeding, ' + (busy.end - S.week) + 'w</span>';
    if (Z.isJuv(S, a)) return '<span class="pill y">Baby, grown in ' + (16 - (S.week - a.born)) + 'w</span>';
    if (a.rest > S.week) return '<span class="pill">Resting ' + (a.rest - S.week) + 'w</span>';
    return '';
  }
  function animalCard(a, extra) {
    const sp = Z.sp(a);
    return '<div class="it"><div class="spread"><div><b>' + esc(a.name) + '</b> the ' + esc(Z.animalLabel(a)) + ' ' + (a.variant ? '<span class="pill y">Rare variant</span> ' : '') + '</div><div class="row">' + rar(sp) + sexPill(a) + grade(a) + '</div></div>' +
      '<div class="small muted">Charm ' + a.charm + ' · Vigor ' + a.vigor + ' · Wit ' + a.wit + (a.gen > 1 ? ' · Generation ' + a.gen : '') + '</div>' + (extra || '') + '</div>';
  }
  function statBars(s, hi) { return Object.keys(D.STATS).map(k => '<div class="statbar"><span' + (hi === k ? ' style="font-weight:700"' : '') + '>' + D.STATS[k] + '</span><div class="bar"><i style="width:' + s[k] + '%"></i></div><b>' + s[k] + '</b></div>').join(''); }
  function staffStatus(s) {
    const p = Z.busyStaff(S)[s.id]; if (!p) return '<span class="pill g">On zoo duty</span>';
    return '<span class="pill y">' + (p.type === 'exp' ? 'Expedition' : p.type === 'breed' ? 'Breeding' : 'Event') + ', ' + (p.end - S.week) + 'w left</span>';
  }
  const freeStaff = () => { const b = Z.busyStaff(S); return S.staff.filter(s => !b[s.id]); };
  function breedPairs(habId) {
    const out = [];
    S.animals.forEach(a => { if (a.sex !== 'M') return; S.animals.forEach(b => { if (b.sex !== 'F' || a.sp !== b.sp || (habId && a.hab !== habId)) return; if (Z.breedCheck(S, a.id, b.id)) return; out.push({ a: a, b: b, exp: (Z.avg(a) + Z.avg(b)) / 2 }); }); });
    out.sort((x, y) => (Z.sp(y.a).rarity * 100 + y.exp) - (Z.sp(x.a).rarity * 100 + x.exp));
    return out;
  }
  function bestPairs() { // one pair per animal, best first
    const used = {}, out = []; breedPairs().forEach(p => { if (used[p.a.id] || used[p.b.id]) return; used[p.a.id] = used[p.b.id] = 1; out.push(p); }); return out;
  }
  function bestTheme(h) {
    let best = null, bv = -99;
    D.THEME_ORDER.forEach(t => { if (!S.research['theme:' + t]) return; const k = S.aff[h.t + '|' + t]; let v = k == null ? 2 : [0, 1, 3, 4][k]; if (h.lastTheme === t) v -= 5; if (v > bv) { bv = v; best = t; } });
    return best;
  }
  const bestHost = () => freeStaff().sort((a, b) => (b.charm * 2 + b.sci + b.care + (b.role === 'showrunner' ? 40 : 0)) - (a.charm * 2 + a.sci + a.care + (a.role === 'showrunner' ? 40 : 0)))[0];
  const bestCarer = () => freeStaff().sort((a, b) => Z.breedChance(S, b) + Z.breedBonus(S, b) / 50 - Z.breedChance(S, a) - Z.breedBonus(S, a) / 50)[0];

  // ---------- top bar ----------
  function drawTop() {
    if (!S) { $('#top').innerHTML = '<div class="tb"><div id="zooname">Wildside Zoo</div></div>'; return; }
    const c = Z.c(S), rank = Z.rank(S), next = Z.nextRankRep(S), prev = D.RANK_REP[rank - 1], net = c.income - c.cost;
    $('#top').innerHTML =
      '<div class="tb" title="Rank ' + rank + ' of 10: ' + D.RANK_NAME[rank] + '. Reputation ' + num(S.rep) + (next ? ', next rank at ' + num(next) : '') + '"><div id="zooname">' + esc(S.zooName) + '</div><div class="stars">' + '★'.repeat(rank) + '<i>' + '★'.repeat(10 - rank) + '</i></div><div class="bar gold"><i style="width:' + (next ? Math.min(100, (S.rep - prev) / (next - prev) * 100) : 100) + '%"></i></div></div>' +
      '<div class="tb"><div class="k">' + D.SEASONS[Z.season(S)].name + (S.finished ? ' · free play' : '') + '</div><div class="v">' + Z.dateStr(S) + '</div><div class="bar"><i id="weekbar" style="width:0%"></i></div></div>' +
      '<div class="tb"><div id="speed">' + [['0', 'II', 'Pause (space)'], ['1', '1x', 'Normal speed (1)'], ['2', '2x', 'Fast (2)'], ['3', '4x', 'Fastest (3)']].map(b => '<button data-act="speed" data-v="' + b[0] + '" title="' + b[2] + '" class="' + (UI.speed == b[0] ? 'on' : '') + '">' + b[1] + '</button>').join('') + '</div></div>' +
      '<div class="tb"><div class="k">Money</div><div class="v ' + (S.money < 0 ? 'neg' : '') + '">' + money(S.money) + '</div><div class="s ' + (net >= 0 ? 'pos' : 'neg') + '">' + (net >= 0 ? '+' : '-') + '$' + num(Math.abs(net)) + ' a week</div></div>' +
      '<div class="tb"><div class="k">Visitors</div><div class="v">' + num(c.visitors) + '</div><div class="s">a week</div></div>' +
      '<div class="tb"><div class="k">Research</div><div class="v">' + num(Math.floor(S.rp)) + '</div><div class="s">+' + c.rpw.toFixed(1) + ' a week</div></div>' +
      '<div class="tb"><div class="k">Rank</div><div class="v">' + D.RANK_NAME[rank] + '</div><div class="s">' + (next ? num(next - S.rep) + ' reputation to go' : 'top rank') + '</div></div>' +
      '<div class="tb grow"></div><div class="tb savebox"><div class="s" id="savestate"></div><button class="linkbtn" data-act="save">Save now</button></div>';
    drawSave();
  }
  function drawSave() {
    const el = $('#savestate'); if (!el) return;
    el.textContent = { checking: 'Connecting to cloud save', local: 'Saving in this browser only', saving: 'Saving', ok: 'Saved to the cloud', error: 'Cloud save failed, kept in this browser' }[Store.state];
    el.className = 's ' + (Store.state === 'error' ? 'neg' : '');
  }

  // ---------- the map ----------
  function drawMap() {
    const c = Z.c(S); let h = '';
    for (let row = 0; row < D.GRID_H; row++) for (let col = 0; col < D.GRID_W; col++) { const a = Z.fromOffset(col, row); h += '<polygon class="' + (col < S.cols ? 'land' : 'locked') + '" points="' + hexPts(a[0], a[1]) + '"/>'; }
    const pairHab = {}; if (freeStaff().length) breedPairs().forEach(p => { pairHab[p.a.hab] = 1; });
    let labels = '';
    S.items.forEach(it => {
      const cells = Z.cells(it), moving = UI.mode.type === 'move' && UI.mode.id === it.id, col = it.k === 'hab' ? D.BIOMES[it.t].color : FAC_COL[FAC_UI[it.t][2]];
      h += '<g opacity="' + (moving ? 0.4 : 1) + '">' + cells.map(cl => '<polygon class="hx" fill="' + col + '" points="' + hexPts(cl[0], cl[1], 1.01) + '"/>').join('') + '<path class="ol' + (UI.sel === it.id ? ' sel' : '') + '" d="' + outline(cells) + '"/></g>';
      const p = labelPos(cells);
      if (it.k === 'hab') {
        const an = Z.inHab(S, it.id), hc = c.hab[it.id], fl = hc.buzz > 0.5 ? 3 : hc.buzz > 0.25 ? 2 : hc.buzz > 0.02 ? 1 : 0;
        labels += '<text class="t1" x="' + p[0].toFixed(1) + '" y="' + (p[1] - 4).toFixed(1) + '">' + D.BIOMES[it.t].name + '</text><text class="t2" x="' + p[0].toFixed(1) + '" y="' + (p[1] + 7).toFixed(1) + '">Lv' + it.lvl + ' · ' + an.length + '/' + Z.habCap(it) + '</text>';
        for (let i = 0; i < fl; i++) labels += '<path class="flame" transform="translate(' + (p[0] - (fl - 1) * 4.5 + i * 9).toFixed(1) + ',' + (p[1] + 18).toFixed(1) + ')" d="M0 4.5C-3.6 4.5-4.6 1.2-2.6-1.4-2.3.3-1.4.6-1.1-1.6-.8-3.6.6-4.8 1.2-6 1 -3.6 4.4-2 3.6 1.6 3.2 3.4 1.8 4.5 0 4.5Z"/>';
        let bx = p[0] + 20; const by = p[1] - 19;
        if (an.length && !Z.eventCheck(S, it.id)) { labels += '<g class="badge" data-act="plan-event" data-id="' + it.id + '"><circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="6.5" fill="#1f7a45"/><text x="' + bx.toFixed(1) + '" y="' + (by + 3.6).toFixed(1) + '">!</text><title>Ready for an event. Click to plan one.</title></g>'; bx += 15; }
        if (pairHab[it.id]) labels += '<g class="badge" data-act="plan-breed" data-id="' + it.id + '"><circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="6.5" fill="#d6456b"/><text x="' + bx.toFixed(1) + '" y="' + (by + 3.6).toFixed(1) + '">♥</text><title>A pair here is ready to breed. Click to pair them.</title></g>';
      } else {
        const u = FAC_UI[it.t]; labels += u[1] ? '<text class="tf" x="' + p[0].toFixed(1) + '" y="' + (p[1] - 1).toFixed(1) + '">' + u[0] + '</text><text class="tf" x="' + p[0].toFixed(1) + '" y="' + (p[1] + 8).toFixed(1) + '">' + u[1] + '</text>' : '<text class="tf" x="' + p[0].toFixed(1) + '" y="' + (p[1] + 3).toFixed(1) + '">' + u[0] + '</text>';
      }
    });
    // combo groups: one outline around all tiles in the combo, with its name
    let cl = '';
    c.active.forEach((a, i) => {
      const cb = D.COMBOS.find(x => x.id === a.id), col = COMBO_COL[D.COMBOS.indexOf(cb) % COMBO_COL.length]; let cells = [];
      [a.anchor].concat(a.members).forEach(id => { const it = Z.item(S, id); if (it) cells = cells.concat(Z.cells(it)); });
      const fresh = UI.newCombo && UI.newCombo.id === a.id && UI.newCombo.until > Date.now();
      h += '<path class="cmb' + (fresh ? ' new' : '') + '" stroke="' + col + '" d="' + outline(cells) + '"/>';
      const top = cells.map(x => ctr(x[0], x[1])).sort((m, n) => m[1] - n[1] || m[0] - n[0])[0], eff = cb.draw ? pct(cb.draw) : cb.spend ? pct(cb.spend) + ' sales' : cb.crowd ? pct(cb.crowd) + ' visitors' : pct(cb.rpMult) + ' research', txt = cb.name + ' ' + eff, w = txt.length * 4.5 + 10;
      cl += '<g class="cmblabel"><rect x="' + (top[0] - w / 2).toFixed(1) + '" y="' + (top[1] - HX.R - 5).toFixed(1) + '" width="' + w.toFixed(1) + '" height="12" rx="4" fill="' + col + '"/><text x="' + top[0].toFixed(1) + '" y="' + (top[1] - HX.R + 4).toFixed(1) + '" text-anchor="middle">' + esc(txt) + '</text></g>';
    });
    // near misses: known combos one facility short (shown while building)
    if (UI.menu === 'build') Z.nearMisses(S).slice(0, 6).forEach(m => { const want = UI.mode.type === 'build' && UI.mode.k === 'fac' ? UI.mode.t : null; if (want && want !== m.fac) return; m.cells.slice(0, want ? 6 : 2).forEach(cell => { const p = ctr(cell[0], cell[1]); h += '<polygon class="hint" points="' + hexPts(cell[0], cell[1], 0.82) + '"/><text class="hinttext" x="' + p[0].toFixed(1) + '" y="' + (p[1] + 2.5).toFixed(1) + '">' + FAC_UI[m.fac][0] + (FAC_UI[m.fac][1] ? ' ' + FAC_UI[m.fac][1] : '') + '?</text>'; }); });
    $('#map').innerHTML = h + labels + cl; drawGhost();
  }
  function ghostSpec() {
    const m = UI.mode; if (!UI.hover || UI.modal) return null;
    if (m.type === 'build') return { k: m.k, t: m.t, ignore: null, rot: m.k === 'hab' ? UI.rot : 0 };
    if (m.type === 'move' && m.id) { const it = Z.item(S, m.id); return it ? { k: it.k, t: it.t, ignore: it.id, rot: it.k === 'hab' ? UI.rot : 0 } : null; }
    return null;
  }
  function drawGhost() {
    const sp = ghostSpec(); UI.preview = null; if (!sp) { $('#over').innerHTML = ''; drawHint(); return; }
    const q = UI.hover[0], r = UI.hover[1], ok = Z.canPlace(S, sp.k, sp.t, q, r, sp.rot, sp.ignore); let gold = false;
    if (ok) { // what would this placement do to combos?
      const items = S.items.filter(i => i.id !== sp.ignore).concat([{ id: sp.ignore || -1, k: sp.k, t: sp.t, q: q, r: r, rot: sp.rot }]);
      const now = Z.c(S).active, then = Z.layout(S, items).active, key = a => a.id + '@' + a.anchor;
      const nowK = {}, thenK = {}; now.forEach(a => { nowK[key(a)] = 1; }); then.forEach(a => { thenK[key(a).replace('@-1', '@new')] = 1; });
      const makes = then.filter(a => !nowK[key(a)]).map(a => D.COMBOS.find(x => x.id === a.id).name), breaks = now.filter(a => !thenK[key(a)]).map(a => D.COMBOS.find(x => x.id === a.id).name);
      UI.preview = { makes: makes.filter((x, i) => makes.indexOf(x) === i), breaks: breaks.filter((x, i) => breaks.indexOf(x) === i) }; gold = makes.length > 0;
    }
    $('#over').innerHTML = Z.cellsOf(sp.k, sp.t, q, r, sp.rot).map(c => '<polygon class="ghost' + (ok ? (gold ? ' gold' : '') : ' bad') + '" points="' + hexPts(c[0], c[1], 0.96) + '"/>').join('');
    drawHint();
  }
  function drawHint() {
    const m = UI.mode, el = $('#maphint'); let t = '';
    if (m.type === 'build') t = 'Placing a <b>' + (m.k === 'hab' ? D.BIOMES[m.t].name + ' habitat' : D.FAC[m.t].name) + '</b>.' + (m.k === 'hab' ? ' Press R or scroll to rotate.' : '') + ' Esc when done.';
    if (m.type === 'move') t = m.id ? 'Click where it should go. Moving is free.' + (Z.item(S, m.id) && Z.item(S, m.id).k === 'hab' ? ' R rotates.' : '') : 'Click the thing you want to move.';
    if (m.type === 'remove') t = 'Click something to remove it for a 50% refund.';
    if (UI.preview && UI.preview.makes.length) t += ' <b>Completes ' + UI.preview.makes.map(esc).join(', ') + '!</b>';
    if (UI.preview && UI.preview.breaks.length) t += ' <span class="neg">Breaks ' + UI.preview.breaks.map(esc).join(', ') + '.</span>';
    el.innerHTML = t; el.classList.toggle('open', !!t);
  }
  function mapClick(e) {
    if (!S || UI.modal) return; const a = evToAxial(e), m = UI.mode, id = Z.c(S).occ[a[0] + ',' + a[1]], it = id ? Z.item(S, id) : null;
    if (m.type === 'build') {
      if (act(Z.build(S, m.k, m.t, a[0], a[1], m.k === 'hab' ? UI.rot : 0), null, 'build_' + m.k)) { const F = m.k === 'fac' && D.FAC[m.t]; floatAt.apply(null, ctr(a[0], a[1]).concat(['-' + money(m.k === 'hab' ? D.BIOMES[m.t].hab : F.cost), 'money'])); if (F && F.limit) setMode({ type: 'select' }); nextReport(); }
      return;
    }
    if (m.type === 'move') {
      if (!m.id) { if (it) { m.id = it.id; UI.rot = it.rot || 0; render(); } return; }
      if (act(Z.move(S, m.id, a[0], a[1], UI.rot), null, 'move')) { m.id = null; render(); nextReport(); } return;
    }
    if (m.type === 'remove') {
      if (!it) return; const nm = it.k === 'hab' ? D.BIOMES[it.t].name + ' habitat' : D.FAC[it.t].name;
      confirmModal('Remove the ' + nm + '?', 'You get back half of what it cost.' + (it.k === 'hab' ? ' Its animals move to the holding pen.' : ''), 'Remove', () => { closeModal(); act(Z.remove(S, it.id), nm + ' removed.', 'remove'); if (UI.sel === it.id) UI.sel = null; render(); });
      return;
    }
    UI.sel = it ? it.id : null; render();
  }
  function setMode(m) { UI.mode = m; if (m.type === 'build') UI.rot = 0; tele('modes', m.type + (m.t ? ':' + m.t : '')); render(); }
  function rotate(d) { const sp = ghostSpec(); if (!sp || sp.k !== 'hab') return; UI.rot = (UI.rot + d + 6) % 6; drawGhost(); }

  // little visitors walking around
  function walkTarget() {
    const habs = S.items; if (!habs.length) return [HX.pad + 20, HX.vh / 2];
    const it = habs[Math.floor(Math.random() * habs.length)], cells = Z.cells(it), c = cells[Math.floor(Math.random() * cells.length)], p = ctr(c[0], c[1]), a = Math.random() * 6.283;
    return [p[0] + Math.cos(a) * HX.R * 0.9, p[1] + Math.sin(a) * HX.R * 0.9];
  }
  function stepWalkers(dt) {
    if (!S) return; const want = Math.round(Math.min(70, 5 + Math.sqrt(Z.c(S).visitors) * 1.3)), W = UI.walkers, g = $('#walk');
    while (W.length < want) { const t = walkTarget(); W.push({ x: HX.pad, y: HX.vh / 2 + (Math.random() - 0.5) * 60, tx: t[0], ty: t[1], wait: 0, sp: 9 + Math.random() * 7, col: ['#2b3a67', '#8a2d3b', '#2f6f4f', '#6b4a8a', '#a0622a', '#1f6f8b'][W.length % 6] }); }
    if (W.length > want) W.length = want;
    const k = dt / 1000 * [0, 1, 1.8, 3][UI.speed];
    W.forEach(w => { if (w.wait > 0) { w.wait -= k; return; } const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy); if (d < 2) { w.wait = 1 + Math.random() * 4; const t = walkTarget(); w.tx = t[0]; w.ty = t[1]; return; } const st = Math.min(d, w.sp * k); w.x += dx / d * st; w.y += dy / d * st; });
    if (g.childNodes.length !== W.length) g.innerHTML = W.map(w => '<circle class="wk" r="2.6" fill="' + w.col + '"/>').join('');
    for (let i = 0; i < W.length; i++) { const n = g.childNodes[i]; n.setAttribute('cx', W[i].x.toFixed(1)); n.setAttribute('cy', W[i].y.toFixed(1)); }
  }
  // pop-ups after each week
  function weekFx() {
    const c = Z.c(S); let n = 0;
    (S.fx || []).forEach(f => {
      if (f.type === 'event') { const it = Z.item(S, f.hab); if (!it) return; const p = itemPos(it); let i = 0; Object.keys(f.gains).forEach(k => { const v = Math.round(f.gains[k]); if (v > 0) floatAt(p[0] + (i % 2 ? 26 : -26), p[1] - 8, CAT[k] + ' +' + v, 'pt', i++ * 280); }); if (f.fired) floatAt(p[0], p[1] - 26, f.who + ' is fired up!', 'gold', 1200); }
      if (f.type === 'birth') { const it = Z.item(S, f.hab); if (it) { const p = itemPos(it); floatAt(p[0], p[1], '♥', 'heart'); floatAt(p[0] + 14, p[1] + 6, '♥', 'heart', 300); } }
      if (f.type === 'exp') floatAt(HX.pad + 60, HX.vh / 2, 'The convoy is back!', 'gold');
    });
    S.fx = [];
    const shops = S.items.filter(i => i.k === 'fac' && c.shopVal[i.id]), tot = shops.reduce((t, s) => t + c.shopVal[s.id], 0);
    shops.sort(() => Math.random() - 0.5).slice(0, 5).forEach(s => { const p = itemPos(s); floatAt(p[0], p[1] - 6, '+' + money(S.visitorsLast * c.spend * c.shopVal[s.id] / tot), 'money', n++ * 220); });
    S.items.filter(i => i.k === 'fac' && (D.FAC[i.t].rpw || D.FAC[i.t].rpAdj)).slice(0, 2).forEach(s => { const p = itemPos(s); floatAt(p[0], p[1] - 6, '+research', 'rp', n++ * 220); });
  }

  // ---------- HUD, menu, inspector ----------
  function readyRows() {
    const rows = [], free = freeStaff(), host = bestHost(), carer = bestCarer();
    if (S.show) rows.push({ ic: '★', cls: 'y', t: 'Winter Animal Show', s: 'Enter your best ' + { charm: 'Charm', vigor: 'Vigor', wit: 'Wit' }[S.show.stat] + ' animal', act: 'show-open' });
    if (S.offers && S.offers.list.length) rows.push({ ic: '$', cls: 'b', t: S.offers.kind === 'director' ? 'Visiting zoo director' : 'Animal trader in town', s: S.offers.list.length + ' animal' + (S.offers.list.length > 1 ? 's' : '') + ' on offer', act: 'caller-open' });
    if (S.headhunt) rows.push({ ic: '+', cls: 'b', t: 'Headhunter\'s pick', s: esc(S.headhunt.name) + ', ' + D.ROLES[S.headhunt.role].name, act: 'headhunt-open' });
    if (S.projects.filter(p => p.type === 'exp').length < Z.maxExp(S)) rows.push(free.length ? { ic: '→', cls: '', t: 'Convoy is ready', s: 'Plan an expedition', act: 'plan-exp' } : { ic: '→', cls: '', t: 'Convoy is ready', s: 'Waiting for free staff', act: 'plan-exp', dim: 1 });
    S.items.forEach(h => {
      if (h.k !== 'hab' || Z.eventCheck(S, h.id)) return; const th = bestTheme(h);
      const fit = th ? S.aff[h.t + '|' + th] : null;
      rows.push({ ic: '!', cls: '', t: habName(h) + ': event', s: host && th ? D.THEMES[th].name + ' (' + (fit == null ? 'untried' : SG[fit][1]) + ') · ' + first(host) : 'Waiting for free staff', act: 'plan-event', id: h.id, go: host && th ? 'quick-event' : null, dim: !host });
    });
    const pairs = bestPairs();
    pairs.slice(0, 4).forEach(p => rows.push({ ic: '♥', cls: 'h', t: Z.sp(p.a).name + ' pair', s: esc(p.a.name) + ' & ' + esc(p.b.name) + (carer ? ' · ' + first(carer) : ' · waiting for staff'), act: 'plan-breed', id: p.a.hab, go: carer ? 'quick-breed' : null, a: p.a.id, b: p.b.id, dim: !carer }));
    if (pairs.length > 4) rows.push({ ic: '♥', cls: 'h', t: (pairs.length - 4) + ' more pairs ready', s: 'Open the breeding planner', act: 'plan-breed' });
    const res = Z.researchList(S).filter(r => !r.done && !r.lock && S.rp >= r.rp).length;
    if (res) rows.push({ ic: '?', cls: 'b', t: res + ' research option' + (res > 1 ? 's' : '') + ' affordable', s: 'Open research', act: 'menu', v: 'research' });
    const hold = Z.holding(S).length; if (hold) rows.push({ ic: hold, cls: hold > Z.holdCap(S) ? 'h' : 'y', t: 'Holding pen: ' + hold + ' of ' + Z.holdCap(S), s: hold > Z.holdCap(S) ? 'Over capacity: house or sell some' : 'Animals waiting for a home', act: 'menu', v: 'animals' });
    return rows;
  }
  function drawHud() {
    const gate = [];
    if (S.offers && S.offers.list.length) gate.push(['caller-open', S.offers.kind === 'director' ? 'Zoo director visiting' : 'Trader in town']);
    if (S.headhunt) gate.push(['headhunt-open', 'Headhunter']);
    if (S.show) gate.push(['show-open', 'Winter show']);
    $('#hudL').innerHTML = gate.length ? '<h4>At the gate</h4><div class="gate">' + gate.map(g => '<button class="chip" data-act="' + g[0] + '">' + g[1] + '</button>').join('') + '</div>' : '';
    let h = S.projects.length ? '<h4>Running</h4>' : '';
    S.projects.slice().sort((a, b) => a.end - b.end).forEach(p => {
      let title = ''; if (p.type === 'exp') title = 'Expedition: ' + D.BIOMES[p.region].name; if (p.type === 'breed') { const a = Z.animal(S, p.a); title = 'Breeding ' + (a ? esc(Z.sp(a).name) + 's' : ''); } if (p.type === 'event') title = D.THEMES[p.theme].name;
      const left = p.end - S.week;
      h += '<div class="pcard" data-act="menu" data-v="projects"><div class="spread"><b>' + title + '</b><span class="muted">' + left + 'w</span></div><div class="prog"><i style="width:' + Math.round((S.week - p.start) / (p.end - p.start) * 100) + '%"></i></div>' +
        (p.type === 'event' ? '<div class="pts">' + Object.keys(CAT).map(k => '<div><b>' + Math.round(p.pts[k]) + '</b><span>' + CAT[k] + '</span></div>').join('') + '</div>' : '<div class="muted" style="font-size:11.5px">' + p.staff.map(id => esc(first(Z.staffer(S, id)))).join(', ') + '</div>') + '</div>';
    });
    $('#hudR').innerHTML = h; $('#hudR').style.display = $('#hudL').style.display = UI.menu === 'build' ? 'none' : 'flex';
    const n = S.news[0]; $('#ticker').innerHTML = n ? '<span class="' + n.kind + '">' + esc(n.msg) + '</span>' : '';
  }
  function drawMenu() {
    const rows = readyRows(), go = rows.filter(r => !r.dim && /plan-|show|caller|headhunt/.test(r.act)).length, hold = Z.holding(S).length, res = Z.researchList(S).filter(r => !r.done && !r.lock && S.rp >= r.rp).length;
    const dots = { projects: go, animals: hold, research: res };
    $('#menu').innerHTML = MENU.map(m => '<button data-act="menu" data-v="' + m[0] + '" class="' + (UI.menu === m[0] ? 'on' : '') + '">' + m[1] + (dots[m[0]] ? '<span class="dot">' + dots[m[0]] + '</span>' : '') + '</button>').join('');
  }
  function drawBuild() {
    const el = $('#buildbar'); el.classList.toggle('open', UI.menu === 'build'); if (UI.menu !== 'build') return;
    const m = UI.mode, L = Z.nextLand(S), tool = (t, label) => '<button class="chip ' + (m.type === t ? 'on' : '') + '" data-act="mode" data-v="' + t + '">' + label + '</button>';
    let h = '<div class="brow tools"><span class="lbl">Tools</span>' + tool('select', 'Select') + tool('move', 'Move') + tool('remove', 'Remove') + '</div>' + (L ? '<div class="brow"><button class="chip ' + (Z.rank(S) < L.rank || S.money < L.cost ? 'poor' : '') + '" data-act="land">Buy more land<small>' + money(L.cost) + (Z.rank(S) < L.rank ? ', needs rank ' + L.rank : '') + '</small></button></div>' : '');
    h += '<div class="brow"><span class="lbl">Habitats</span>' + D.BIOME_ORDER.filter(b => S.regions[b]).map(b => '<button class="chip ' + (m.type === 'build' && m.k === 'hab' && m.t === b ? 'on' : '') + (S.money < D.BIOMES[b].hab ? ' poor' : '') + '" data-act="buildhab" data-v="' + b + '" title="Shape: ' + D.SHAPE_NAME[b] + '">' + D.BIOMES[b].name + '<small>' + money(D.BIOMES[b].hab) + '</small></button>').join('') + '</div>';
    h += '<div class="brow"><span class="lbl">Facilities</span>' + D.FAC_ORDER.filter(f => S.research['fac:' + f]).map(f => '<button class="chip ' + (m.type === 'build' && m.k === 'fac' && m.t === f ? 'on' : '') + (S.money < D.FAC[f].cost ? ' poor' : '') + '" data-act="buildfac" data-v="' + f + '" title="' + esc(D.FAC[f].desc) + '">' + D.FAC[f].name + '<small>' + money(D.FAC[f].cost) + '</small></button>').join('') + '</div>';
    h += '<div class="small muted">' + (m.type === 'build' && m.k === 'fac' ? '<b>' + D.FAC[m.t].name + ':</b> ' + esc(D.FAC[m.t].desc) : m.type === 'build' ? '<b>' + D.BIOMES[m.t].name + ' habitat:</b> a ' + D.SHAPE_NAME[m.t] + '. R rotates it.' : 'Tiles that touch give bonuses. Dashed gold spots would finish a combo you already know.') + '</div>';
    el.innerHTML = h;
  }
  function drawInspect() {
    const el = $('#inspect'), it = UI.sel ? Z.item(S, UI.sel) : null; el.classList.toggle('open', !!it); if (!it) { UI.sel = null; return; }
    const c = Z.c(S); let h = '';
    if (it.k === 'hab') {
      const hc = c.hab[it.id], an = Z.inHab(S, it.id), cap = Z.habLevelCap(S), why = Z.eventCheck(S, it.id);
      h += '<div class="spread"><h3>' + habName(it) + ' <span class="muted small">Level ' + it.lvl + '</span></h3><button class="btn ghost sm" data-act="desel">Close</button></div>';
      h += '<div class="small muted" style="margin:3px 0">Draw ' + num(hc.draw) + ' · neighbors ' + pct(hc.adj) + ' · combos ' + pct(hc.combo) + ' · buzz ' + pct(hc.buzz) + ' · variety ' + pct(hc.variety - 1) + '</div>';
      h += '<div class="row wrap" style="margin:5px 0">' + (it.lvl < 5 ? '<button class="btn sm ' + (it.lvl >= cap || S.money < Z.habUpgradeCost(it) ? 'off' : '') + '" data-act="upgrade" data-id="' + it.id + '">Upgrade · ' + money(Z.habUpgradeCost(it)) + '</button>' : '<span class="pill y">Top level</span>') + '<button class="btn sm ghost ' + (why ? 'off' : '') + '" data-act="plan-event" data-id="' + it.id + '">Hold event</button><button class="btn sm ghost" data-act="plan-breed" data-id="' + it.id + '">Breed</button></div>';
      if (it.lvl < 5 && it.lvl >= cap) h += '<div class="small muted">Research Habitat Design to upgrade further.</div>';
      if (why && an.length) h += '<div class="small muted">' + esc(why) + '</div>';
      h += '<div class="small" style="margin-top:4px">' + (an.length ? an.map(a => '<div class="spread" style="padding:1px 0"><span>' + grade(a) + ' <b>' + esc(a.name) + '</b> ' + esc(Z.animalLabel(a)) + ' (' + a.sex + ')</span><span>' + animalStatus(a) + '</span></div>').join('') : '<span class="muted">No animals yet. Wait for the trader or send an expedition.</span>') + '</div>';
      const hold = Z.holding(S).filter(a => Z.sp(a).biome === it.t);
      if (hold.length && an.length < Z.habCap(it)) h += '<div class="small" style="margin-top:6px"><b>From the holding pen:</b> ' + hold.map(a => '<button class="btn sm ghost" style="margin:2px 2px 0 0" data-act="movea-to" data-id="' + a.id + '" data-h="' + it.id + '">' + esc(a.name) + ' (' + esc(Z.sp(a).name) + ' ' + a.sex + ')</button>').join('') + '</div>';
    } else {
      const F = D.FAC[it.t]; h += '<div class="spread"><h3>' + F.name + '</h3><button class="btn ghost sm" data-act="desel">Close</button></div><div class="small" style="margin:4px 0">' + esc(F.desc) + '</div>';
      if (F.spend) h += '<div class="small">Earning <b>$' + (c.shopVal[it.id] || 0).toFixed(2) + '</b> per visitor before rank and staff bonuses. Each extra shop of the same kind earns less.</div>';
      const nb = c.nb[it.id] || []; h += '<div class="small muted" style="margin-top:4px">Touching: ' + (nb.length ? nb.map(o => o.k === 'hab' ? D.BIOMES[o.t].name + ' habitat' : D.FAC[o.t].name).join(', ') : 'nothing') + '</div>';
    }
    const mine = c.active.filter(a => a.anchor === it.id || a.members.indexOf(it.id) >= 0);
    if (mine.length) h += '<div style="margin-top:5px">' + mine.map(a => '<span class="pill y">Combo: ' + D.COMBOS.find(x => x.id === a.id).name + '</span>').join(' ') + '</div>';
    el.innerHTML = h;
  }

  // ---------- drawer panels ----------
  const PANELS = {
    projects() {
      let h = ''; const busy = Z.busyStaff(S);
      const steps = [['buy', 'Buy an animal from the trader (he is in town now, see At the gate on the left)'], ['exp', 'Send an expedition'], ['event', 'Hold an exhibit event'], ['breed', 'Pair two animals for breeding'], ['research', 'Research something'], ['build_hab', 'Build a second habitat (Build menu)']];
      if (!steps.every(s => S.did[s[0]])) h += '<div class="grp it soft"><h3>First steps</h3>' + steps.map(s => '<div class="todo ' + (S.did[s[0]] ? 'done' : '') + '"><span class="box"></span>' + s[1] + '</div>').join('') + '</div>';
      h += '<div class="grp"><div class="row"><button class="btn big" data-act="plan-exp">Send expedition</button><button class="btn big" data-act="plan-breed">Pair for breeding</button><button class="btn big" data-act="plan-event">Hold exhibit event</button></div></div>';
      h += '<div class="grp"><h3>Running now <small>' + S.projects.length + ' project' + (S.projects.length === 1 ? '' : 's') + '</small></h3><div class="list">';
      if (!S.projects.length) h += '<div class="it soft muted">Nothing running. Staff with no project work zoo duty, which gives small bonuses.</div>';
      S.projects.slice().sort((a, b) => a.end - b.end).forEach(p => {
        let title = '', sub = '';
        if (p.type === 'exp') { title = 'Expedition to the ' + D.BIOMES[p.region].region; sub = ['Basic', 'Standard', 'Lavish'][p.budget] + ' supplies'; }
        if (p.type === 'breed') { const a = Z.animal(S, p.a), b = Z.animal(S, p.b); title = 'Breeding ' + esc(Z.sp(a).name) + 's'; sub = esc(a.name) + ' and ' + esc(b.name); }
        if (p.type === 'event') { title = D.THEMES[p.theme].name; sub = 'at ' + habName(Z.item(S, p.hab)); }
        h += '<div class="it"><div class="spread"><div><b>' + title + '</b> <span class="muted small">' + sub + '</span></div><span class="pill y">' + (p.end - S.week) + ' week' + (p.end - S.week === 1 ? '' : 's') + ' left</span></div><div class="prog" style="margin:5px 0"><i style="width:' + Math.round((S.week - p.start) / (p.end - p.start) * 100) + '%"></i></div>' +
          (p.type === 'event' ? '<div class="pts">' + Object.keys(CAT).map(k => '<div><b>' + Math.round(p.pts[k]) + '</b><span>' + CAT[k] + '</span></div>').join('') + '</div>' : '') + '<div class="small muted" style="margin-top:3px">' + p.staff.map(id => esc(Z.staffer(S, id).name)).join(', ') + '</div></div>';
      });
      h += '</div></div>';
      const idle = S.staff.filter(s => !busy[s.id]);
      h += '<div class="grp"><h3>On zoo duty</h3><div class="small">' + (idle.length ? idle.map(s => esc(s.name) + ' (' + D.ROLES[s.role].name + ')').join(', ') : '<span class="muted">Nobody</span>') + '</div></div>';
      h += '<div class="grp"><h3>Coming up each year</h3><div class="small muted">Spring Open Day rewards a zoo with a big draw. The Summer Festival pays more the more kinds of shop you have. The Winter Animal Show judges one animal you enter. Traders, a headhunter and a visiting zoo director drop by through the year.</div></div>';
      return h;
    },
    animals() {
      const f = UI.sub.animals, hold = Z.holding(S), cap = Z.holdCap(S); let h = '';
      h += '<div class="it soft spread" style="margin-bottom:10px"><span>' + (S.offers && S.offers.list.length ? '<b>' + (S.offers.kind === 'director' ? 'A visiting zoo director' : 'The animal trader') + '</b> has ' + S.offers.list.length + ' animal' + (S.offers.list.length > 1 ? 's' : '') + ' on offer.' : 'No one is selling animals right now. A trader drops by every couple of months.') + '</span>' + (S.offers && S.offers.list.length ? '<button class="btn sm" data-act="caller-open">See offers</button>' : '') + '</div>';
      h += '<div class="grp"><h3>Your animals <small>' + S.animals.length + ' total · holding pen ' + hold.length + '/' + cap + '</small></h3>';
      if (hold.length > cap) h += '<div class="banner r">The holding pen is over capacity. House or sell animals before starting expeditions or breeding.</div>';
      const biomes = D.BIOME_ORDER.filter(b => S.animals.some(a => Z.sp(a).biome === b));
      h += '<div class="sub">' + [['all', 'All']].concat(biomes.map(b => [b, D.BIOMES[b].name])).concat([['hold', 'Holding pen (' + hold.length + ')']]).map(x => '<button class="chip ' + (f === x[0] ? 'on' : '') + '" data-act="sub" data-k="animals" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
      let list = S.animals.filter(a => f === 'all' ? true : f === 'hold' ? a.hab == null : Z.sp(a).biome === f);
      list = list.slice().sort((a, b) => D.BIOME_ORDER.indexOf(Z.sp(a).biome) - D.BIOME_ORDER.indexOf(Z.sp(b).biome) || Z.sp(b).rarity - Z.sp(a).rarity || (a.sp < b.sp ? -1 : a.sp > b.sp ? 1 : 0) || Z.avg(b) - Z.avg(a));
      h += '<table><tr><th>Name</th><th>Species</th><th></th><th class="n">C</th><th class="n">V</th><th class="n">W</th><th>Home</th><th></th></tr>';
      list.forEach(a => { const hb = a.hab != null ? Z.item(S, a.hab) : null;
        h += '<tr><td><b>' + esc(a.name) + '</b> <span class="muted">' + a.sex + '</span></td><td>' + esc(Z.animalLabel(a)) + (a.variant ? ' <span class="pill y">Rare</span>' : '') + ' ' + animalStatus(a) + '</td><td>' + grade(a) + '</td><td class="n">' + a.charm + '</td><td class="n">' + a.vigor + '</td><td class="n">' + a.wit + '</td><td>' + (hb ? habName(hb) : '<span class="pill r">Holding pen</span>') + '</td><td class="n" style="white-space:nowrap"><button class="btn sm ghost" data-act="movea" data-id="' + a.id + '">Move</button> <button class="btn sm warn" data-act="sell" data-id="' + a.id + '">Sell ' + money(Z.animalValue(a)) + '</button></td></tr>'; });
      h += '</table>' + (list.length ? '' : '<div class="it soft muted">None here.</div>') + '<div class="small muted" style="margin-top:6px">C = Charm, V = Vigor, W = Wit. Higher stats draw more visitors and score better in events. Babies take after their parents.</div></div>';
      return h;
    },
    staff() {
      let h = '<div class="grp"><h3>Your team <small>' + S.staff.length + ' of ' + Z.staffCap(S) + ' (more at higher ranks)</small></h3><div class="grid2">';
      S.staff.forEach(s => { const R = D.ROLES[s.role], wait = 10 - (S.week - s.trainAt), canJob = s.lvl >= D.JOB_LEVEL;
        h += '<div class="it"><div class="spread"><b>' + esc(s.name) + '</b>' + staffStatus(s) + '</div><div class="small muted">' + R.name + ' · Level ' + s.lvl + ' · ' + money(Z.salary(s)) + ' a week' + (s.mastered && s.mastered.length ? ' · was ' + s.mastered.map(x => D.ROLES[x].name).join(', ') : '') + '</div><div class="prog" style="margin:4px 0;height:4px" title="Experience"><i style="width:' + Math.round(s.xp / (40 + s.lvl * 30) * 100) + '%"></i></div>' + statBars(s, R.main) +
          '<div class="row wrap" style="margin-top:6px"><button class="btn sm ' + (wait > 0 ? 'off' : '') + '" data-act="train" data-id="' + s.id + '">' + (wait > 0 ? 'Train in ' + wait + 'w' : 'Train · ' + money(Z.trainCost(s))) + '</button><button class="btn sm ghost ' + (canJob ? '' : 'off') + '" data-act="job" data-id="' + s.id + '">' + (canJob ? 'Change job' : 'Job change at Lv' + D.JOB_LEVEL) + '</button><button class="btn sm warn" data-act="fire" data-id="' + s.id + '">Let go</button></div></div>'; });
      h += '</div><div class="small muted" style="margin-top:6px">Care helps breeding and zoo duty. Science gives research and Learning scores. Scouting powers expeditions. Charm lifts event Fun scores and shop sales. At level ' + D.JOB_LEVEL + ' someone can change jobs: they keep their stats, start again at level 1 and keep growing. Mastering two jobs opens an advanced one.</div></div>';
      if (S.headhunt) h += '<div class="it soft spread" style="margin-bottom:10px"><span><b>The headhunter</b> is recommending ' + esc(S.headhunt.name) + ', a standout ' + D.ROLES[S.headhunt.role].name + '.</span><button class="btn sm" data-act="headhunt-open">Meet them</button></div>';
      h += '<div class="grp"><h3>Applicants <small>new faces in ' + (12 - S.week % 12) + ' weeks</small></h3><div class="grid2">' + (S.applicants.length ? S.applicants.map((s, i) => { const R = D.ROLES[s.role], fee = Z.salary(s) * 8; return '<div class="it"><div class="spread"><b>' + esc(s.name) + '</b><span class="pill">' + R.name + '</span></div><div class="small muted">' + R.desc + '</div>' + statBars(s, R.main) + '<div class="spread" style="margin-top:6px"><span class="small muted">' + money(Z.salary(s)) + ' a week</span><button class="btn sm ' + (S.staff.length >= Z.staffCap(S) || S.money < fee ? 'off' : '') + '" data-act="hire" data-i="' + i + '">Hire · ' + money(fee) + '</button></div></div>'; }).join('') : '<div class="it soft muted">Nobody is looking for work right now.</div>') + '</div></div>';
      return h;
    },
    research() {
      const c = Z.c(S), list = Z.researchList(S), groups = ['Regions', 'Know-how', 'Facilities', 'Event themes', 'Landmarks'];
      let h = '<div class="it soft" style="margin-bottom:10px"><b>' + num(Math.floor(S.rp)) + ' research points</b>, earning ' + c.rpw.toFixed(1) + ' a week. <span class="muted small">Research comes from staff on zoo duty (Science), expeditions, events, new species, labs and info kiosks.</span></div>';
      groups.forEach(g => { const items = list.filter(r => r.group === g); if (!items.length) return; const open = items.filter(r => !r.done);
        h += '<div class="grp"><h3>' + g + ' <small>' + (items.length - open.length) + ' of ' + items.length + ' known</small></h3><div class="list">';
        open.forEach(r => { h += '<div class="it spread ' + (r.lock ? 'dis' : '') + '"><div><b>' + esc(r.name) + '</b><div class="small muted">' + esc(r.desc) + (r.lock ? ' <b>' + esc(r.lock) + '.</b>' : '') + '</div></div><button class="btn sm ' + (r.lock || S.rp < r.rp ? 'off' : '') + '" data-act="research" data-id="' + r.id + '">' + r.rp + ' pts</button></div>'; });
        if (!open.length) h += '<div class="it soft muted">All done.</div>'; h += '</div></div>'; });
      return h;
    },
    book() {
      const t = UI.sub.book; let h = '<div class="sub">' + [['species', 'Species ' + Z.speciesCount(S) + '/' + D.SPECIES_LIST.length], ['combos', 'Combos ' + Object.keys(S.combos).length + '/' + D.COMBOS.length], ['fits', 'Theme fits'], ['secrets', 'Rumors']].map(x => '<button class="chip ' + (t === x[0] ? 'on' : '') + '" data-act="sub" data-k="book" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
      if (t === 'species') {
        D.BIOME_ORDER.forEach(b => { if (D.BIOMES[b].secret && !S.regions[b]) return; const sps = D.SPECIES_LIST.filter(s => s.biome === b), got = sps.filter(s => S.book[s.id]).length;
          h += '<div class="grp"><h3>' + D.BIOMES[b].region + ' <small>' + got + ' of ' + sps.length + (S.regions[b] ? '' : ' · not unlocked') + '</small></h3><div class="spgrid">' + sps.map(s => { const k = S.book[s.id]; return k ? '<div class="spcell"><b>' + s.name + '</b><div>' + rar(s) + ' <span class="muted">best ' + k.best + '</span></div><div>' + (k.variant ? '<span class="pill y">' + s.variant + '</span> ' : '') + (k.bred ? '<span class="pill g">Bred</span>' : '') + '</div></div>' : '<div class="spcell unk"><b>???</b><div>' + '★'.repeat(s.rarity) + '</div></div>'; }).join('') + '</div></div>'; });
      } else if (t === 'combos') {
        h += '<div class="small muted" style="margin-bottom:6px">A combo forms when everything listed touches the first item. On the map, a combo gets one colored outline with its name.</div><div class="list">' + D.COMBOS.map(c => { const on = S.combos[c.id], known = on || S.knownCombos[c.id]; const eff = c.draw ? pct(c.draw) + ' habitat draw' : c.spend ? pct(c.spend) + ' shop earnings' : c.crowd ? pct(c.crowd) + ' visitors' : pct(c.rpMult) + ' research'; const nm = k => k.indexOf('hab:') === 0 ? D.BIOMES[k.slice(4)].name + ' habitat' : D.FAC[k.slice(4)].name;
          return '<div class="it ' + (known ? '' : 'soft') + '"><div class="spread"><b>' + (known ? c.name : '???') + '</b>' + (on ? '<span class="pill y">Found</span>' : known ? '<span class="pill">Known from a past zoo</span>' : '') + '</div><div class="small muted">' + (known ? '<b>' + nm(c.anchor) + '</b> touching ' + c.needs.map(nm).join(' and ') + ' · ' + eff : 'Hint: ' + c.hint) + '</div></div>'; }).join('') + '</div>';
      } else if (t === 'fits') {
        const bs = D.BIOME_ORDER.filter(b => S.regions[b]), ths = D.THEME_ORDER.filter(x => !D.THEMES[x].needs || S.regions[D.THEMES[x].needs]);
        h += '<div class="small muted" style="margin-bottom:6px">How well each event theme suits each habitat, from -- to ++. A fit is recorded the first time you try it.</div><table><tr><th>Theme</th>' + bs.map(b => '<th>' + D.BIOMES[b].name + '</th>').join('') + '</tr>' + ths.map(x => '<tr><td>' + D.THEMES[x].name + (S.research['theme:' + x] ? '' : ' <span class="muted small">(not researched)</span>') + '</td>' + bs.map(b => '<td>' + fitSign(S.aff[b + '|' + x]) + '</td>').join('') + '</tr>').join('') + '</table>';
      } else {
        h += '<div class="list">' + Z.secretHints(S).map(x => '<div class="it"><div class="spread"><b>' + (x.done ? x.name : 'An unmarked place') + '</b>' + (x.done ? '<span class="pill y">Found</span>' : '') + '</div>' + x.steps.map(s => '<div class="todo ' + (s.ok ? 'done' : '') + '"><span class="box"></span><span>' + s.t + (s.prog ? ' <b>' + s.prog + '</b>' : '') + '</span></div>').join('') + '</div>').join('') + '</div>';
        h += '<div class="grp" style="margin-top:12px"><h3>Special visitors</h3><div class="list">' + D.VIPS.map(v => '<div class="it ' + (S.vips[v.id] != null ? '' : 'soft') + ' spread"><span>' + (S.vips[v.id] != null ? '<b>' + v.name + '</b>' : '<span class="muted">Someone visits after ' + v.when + '</span>') + '</span>' + (S.vips[v.id] != null ? '<span class="pill y">Visited</span>' : '') + '</div>').join('') + '</div></div>';
      }
      return h;
    },
    records() {
      let h = ''; const yl = D.RUN_YEARS - Z.year(S) + 1, c = Z.c(S);
      h += '<div class="it soft" style="margin-bottom:10px">' + (S.finished ? '<b>Final score ' + num(S.score.total) + '.</b> You are in free play. Start a new zoo any time to use your carry-over bonuses.' : '<b>' + yl + ' year' + (yl === 1 ? '' : 's') + ' left</b> until your final score at the end of year ' + D.RUN_YEARS + '. Current estimate: ' + num(Z.finalScore(S).total) + '.') + '</div>';
      h += '<div class="grp"><h3>This week</h3><table class="small"><tr><td>Tickets (' + num(c.visitors) + ' visitors at ' + money(Z.ticket(S)) + ')</td><td class="n pos">' + money(c.visitors * Z.ticket(S)) + '</td></tr><tr><td>Shops ($' + c.spend.toFixed(2) + ' per visitor)</td><td class="n pos">' + money(c.visitors * c.spend) + '</td></tr><tr><td>Salaries</td><td class="n neg">-' + money(c.salaries) + '</td></tr><tr><td>Animal care</td><td class="n neg">-' + money(c.upkeep) + '</td></tr><tr><td>Upkeep of buildings</td><td class="n neg">-' + money(c.maint) + '</td></tr></table></div>';
      if (S.lastTable) h += '<div class="grp"><h3>Zoo rankings <small>end of year ' + S.lastTable.year + '</small></h3><table><tr><th class="n">#</th><th>Zoo</th><th class="n">Rating</th></tr>' + S.lastTable.table.map((r, i) => '<tr class="' + (r.me ? 'me' : '') + '"><td class="n">' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td class="n">' + num(r.rating) + '</td></tr>').join('') + '</table></div>';
      else h += '<div class="grp"><h3>Zoo rankings</h3><div class="it soft muted">The first rankings and awards come at the end of year 1. Your rating so far: ' + num(Z.rating(S)) + '.</div></div>';
      if (S.history.length) h += '<div class="grp"><h3>Year by year <small>' + S.trophies + ' trophies</small></h3><table><tr><th>Year</th><th class="n">Place</th><th class="n">Rating</th><th class="n">Visitors</th><th class="n">Profit</th><th class="n">Species</th><th class="n">Best event</th><th>Awards</th></tr>' + S.history.slice().reverse().map(r => '<tr><td>' + r.year + '</td><td class="n">' + r.place + '</td><td class="n">' + num(r.rating) + '</td><td class="n">' + num(r.visitors) + '</td><td class="n">' + money(r.income - r.cost) + '</td><td class="n">' + r.species + '</td><td class="n">' + (r.bestReview || '-') + '</td><td>' + r.awards.length + '</td></tr>').join('') + '</table></div>';
      h += '<div class="grp"><h3>Lifetime</h3><div class="small">' + S.life.events + ' events (best ' + S.life.bestReview + '/40, ' + S.life.hof + ' in the hall of fame) · ' + S.life.expeditions + ' expeditions · ' + S.life.births + ' births · ' + money(S.life.income) + ' earned · ' + Math.round(S.play.sec / 60) + ' minutes played</div></div>';
      if (Store.legacy.hall && Store.legacy.hall.length) h += '<div class="grp"><h3>Past zoos</h3><table><tr><th>Zoo</th><th class="n">Score</th><th class="n">Final place</th></tr>' + Store.legacy.hall.slice().sort((a, b) => b.score - a.score).map(r => '<tr><td>' + esc(r.zoo) + '</td><td class="n">' + num(r.score) + '</td><td class="n">' + r.place + '</td></tr>').join('') + '</table></div>';
      h += '<div class="grp"><h3>Note for Claude</h3><div class="small muted" style="margin-bottom:4px">Your play is logged so Claude can review it and tune the game. If something feels slow, confusing or too easy, jot it down here while you remember.</div><textarea id="note" placeholder="For example: expeditions feel too slow in year 3"></textarea><div class="row" style="margin-top:6px"><button class="btn sm" data-act="note">Save note</button><span class="small muted">' + (Store.db ? 'Gameplay log: on' : 'Gameplay log: off (cloud not connected), your save stays in this browser') + '</span></div></div>';
      h += '<div class="grp"><h3>Zoo news</h3><div class="newsl">' + S.news.slice(0, 40).map(n => '<div class="' + n.kind + '"><span class="w">Y' + (Math.floor(n.w / D.WPY) + 1) + ' w' + (n.w % D.WPY + 1) + '</span>' + esc(n.msg) + '</div>').join('') + '</div></div>';
      h += '<div class="grp"><h3>Game</h3><div class="row wrap"><button class="btn sm ghost" data-act="help">How to play</button><button class="btn sm ghost" data-act="save">Save now</button><button class="btn sm warn" data-act="newgame">Start a new zoo</button></div></div>';
      return h;
    }
  };
  function drawDrawer() {
    const open = UI.menu && UI.menu !== 'build'; $('#drawer').classList.toggle('open', !!open); if (!open) return;
    const p = $('#panel'), keep = p.dataset.tab === UI.menu ? p.scrollTop : 0, note = $('#note'), noteVal = note ? note.value : null, focus = note && document.activeElement === note;
    $('#dhead').innerHTML = '<h2>' + MENU.find(m => m[0] === UI.menu)[1] + '</h2><button class="btn ghost sm" data-act="menu" data-v="' + UI.menu + '">Close</button>';
    p.innerHTML = PANELS[UI.menu](); p.dataset.tab = UI.menu; p.scrollTop = keep;
    if (noteVal != null && $('#note')) { $('#note').value = noteVal; if (focus) $('#note').focus(); }
  }
  function render() { if (!S) { drawTop(); return; } Z.refresh(S); pullReports(); drawTop(); drawMap(); drawHud(); drawMenu(); drawBuild(); drawInspect(); drawDrawer(); }

  // ---------- planners ----------
  function staffPick(actName, chosen, statFn, label) {
    const busy = Z.busyStaff(S);
    return '<div class="grid2">' + S.staff.map(s => { const b = busy[s.id]; return '<div class="it ' + (b ? 'dis' : 'pick') + ' ' + (chosen.indexOf(s.id) >= 0 ? 'on' : '') + '" ' + (b ? '' : 'data-act="' + actName + '" data-id="' + s.id + '"') + '><div class="spread"><b>' + esc(s.name) + '</b><span class="pill">' + D.ROLES[s.role].name + ' L' + s.lvl + '</span></div><div class="small ' + (b ? 'muted' : '') + '">' + (b ? 'Busy for ' + (b.end - S.week) + ' more weeks' : label + ' ' + statFn(s)) + '</div></div>'; }).join('') + '</div>';
  }
  function planExp() {
    const regs = D.BIOME_ORDER.filter(b => S.regions[b]);
    UI.plan = { type: 'exp', region: regs[regs.length - 1], team: [], budget: 0 };
    const best = freeStaff().sort((a, b) => b.exp - a.exp)[0]; if (best) UI.plan.team = [best.id];
    openModal({ kind: 'plan-exp', render() {
      const P = UI.plan, B = D.BIOMES[P.region], power = Z.teamPower(S, P.team, P.budget), odds = Z.expOdds(S, P.region, power), cost = Z.expCost(P.region, P.budget);
      const fast = P.team.some(id => /explorer|leader/.test(Z.staffer(S, id).role)) ? 1 : 0;
      let b = '<h4 class="sec">Where</h4><div class="grid3">' + regs.map(x => { const sps = D.SPECIES_LIST.filter(s => s.biome === x), got = sps.filter(s => S.book[s.id]).length, rr = Z.teamPower(S, P.team, P.budget) / D.BIOMES[x].diff; return '<div class="it pick ' + (P.region === x ? 'on' : '') + '" data-act="pe-region" data-v="' + x + '"><div class="spread"><b>' + D.BIOMES[x].region + '</b>' + (P.team.length ? ratioSign(rr) : '') + '</div><div class="small muted">' + got + '/' + sps.length + ' species found · from ' + money(D.BIOMES[x].exp) + '</div></div>'; }).join('') + '</div>';
      b += '<h4 class="sec" style="margin-top:10px">Team, up to 3 <span style="text-transform:none;letter-spacing:0">(Scouting counts most, Care a little)</span></h4>' + staffPick('pe-staff', P.team, s => '<b>' + s.exp + ' / ' + s.care + '</b>', 'Scouting / Care');
      b += '<h4 class="sec" style="margin-top:10px">Supplies</h4><div class="grid3">' + ['Basic', 'Standard', 'Lavish'].map((n, i) => '<div class="it pick ' + (P.budget === i ? 'on' : '') + '" data-act="pe-budget" data-v="' + i + '"><b>' + n + '</b><div class="small muted">' + money(Z.expCost(P.region, i)) + ' · team ' + ['as is', 'a step stronger', 'two steps stronger'][i] + '</div></div>').join('') + '</div>';
      b += '<h4 class="sec" style="margin-top:10px">What to expect</h4><div class="it soft"><div class="spread"><b>Team against this region</b>' + ratioSign(odds.ratio) + '</div><div class="row wrap" style="margin-top:6px">' + Object.keys(odds.byRarity).sort().map(k => '<span class="small">' + '★'.repeat(+k) + ' ' + D.RARITY.name[k] + ' ' + probSign(odds.byRarity[k]) + '</span>').join('') + '</div><div class="small muted" style="margin-top:5px">A stronger team finds rarer animals with better stats. Species you have not recorded yet are more likely to turn up.</div></div>';
      const full = S.projects.filter(p => p.type === 'exp').length >= Z.maxExp(S);
      return { eyebrow: 'New project', title: 'Send an expedition', wide: true, body: b, foot: '<span class="info">' + (full ? '<span class="neg">Your convoy is already out.</span>' : money(cost) + ' · back in ' + (B.weeks - fast) + ' weeks' + (fast ? ' (explorer on the team)' : '')) + '</span><button class="btn ghost" data-act="close">Cancel</button><button class="btn ' + (!P.team.length || S.money < cost || full ? 'off' : '') + '" data-act="pe-go">Send them</button>' };
    } });
  }
  function planBreed(habId) {
    const pairs = breedPairs(habId), lead = bestCarer();
    UI.plan = { type: 'breed', pair: pairs[0] ? [pairs[0].a.id, pairs[0].b.id] : null, lead: lead ? lead.id : null, hab: habId || null };
    openModal({ kind: 'plan-breed', render() {
      const P = UI.plan, ps = breedPairs(P.hab); let b = '';
      if (!ps.length) b += '<div class="banner y">No pair is ready' + (P.hab ? ' in this habitat' : '') + '.</div><p class="small">A pair needs a grown male and female of the same species living in the same habitat, both rested and not already paired. Traders and expeditions tend to offer the sex you are missing.</p>';
      else {
        b += '<h4 class="sec">Pair</h4><div class="list">' + ps.slice(0, 12).map(p => { const on = P.pair && P.pair[0] === p.a.id && P.pair[1] === p.b.id; return '<div class="it pick ' + (on ? 'on' : '') + '" data-act="pb-pair" data-a="' + p.a.id + '" data-b="' + p.b.id + '"><div class="spread"><span><b>' + esc(Z.sp(p.a).name) + '</b> · ' + esc(p.a.name) + ' ' + grade(p.a) + ' and ' + esc(p.b.name) + ' ' + grade(p.b) + (p.a.variant || p.b.variant ? ' <span class="pill y">Rare parent</span>' : '') + '</span><span class="small muted">' + habName(Z.item(S, p.a.hab)) + ' · ' + Z.breedWeeks(S, p.a.sp) + ' weeks</span></div><div class="small muted">Charm ' + p.a.charm + '/' + p.b.charm + ' · Vigor ' + p.a.vigor + '/' + p.b.vigor + ' · Wit ' + p.a.wit + '/' + p.b.wit + '</div></div>'; }).join('') + '</div>';
        b += '<h4 class="sec" style="margin-top:10px">Who looks after them <span style="text-transform:none;letter-spacing:0">(Care counts most, Science half)</span></h4>' + staffPick('pb-lead', P.lead ? [P.lead] : [], s => chanceSign(Z.breedChance(S, s)) + ' <span class="muted">babies ' + (Z.breedBonus(S, s) >= 4 ? '++' : Z.breedBonus(S, s) >= 1.5 ? '+' : '=') + '</span>', 'Chance');
        const ld = P.lead && Z.staffer(S, P.lead);
        if (ld && P.pair) { const a = Z.animal(S, P.pair[0]), bonus = Z.breedBonus(S, ld); b += '<div class="it soft small" style="margin-top:8px">A baby takes the average of its parents in each stat, then shifts by about <b>' + (bonus - 4).toFixed(0) + ' to +' + (bonus + 4.5).toFixed(0) + '</b>. Chance of a baby: <b>' + Math.round(Z.breedChance(S, ld) * 100) + '%</b>. ' + (S.book[a.sp].bred ? '' : '<b>First ' + esc(Z.sp(a).name) + ' birth earns bonus reputation.</b>') + '</div>'; }
      }
      return { eyebrow: 'New project', title: 'Pair for breeding', wide: true, body: b, foot: '<span class="info muted">Both parents rest for 8 weeks afterwards.</span><button class="btn ghost" data-act="close">Cancel</button><button class="btn ' + (ps.length && P.pair && P.lead ? '' : 'off') + '" data-act="pb-go">Start</button>' };
    } });
  }
  function planEvent(habId) {
    const habs = S.items.filter(i => i.k === 'hab' && !Z.eventCheck(S, i.id)), lead = bestHost();
    const hb = habId && habs.some(h => h.id == habId) ? +habId : (habs[0] ? habs[0].id : null);
    UI.plan = { type: 'event', hab: hb, theme: hb ? bestTheme(Z.item(S, hb)) : null, lead: lead ? lead.id : null };
    openModal({ kind: 'plan-event', render() {
      const P = UI.plan, all = S.items.filter(i => i.k === 'hab'); let b = '';
      b += '<h4 class="sec">Habitat</h4><div class="grid3">' + all.map(h => { const why = Z.eventCheck(S, h.id); return '<div class="it ' + (why ? 'dis' : 'pick') + ' ' + (P.hab === h.id ? 'on' : '') + '" ' + (why ? '' : 'data-act="pv-hab" data-id="' + h.id + '"') + '><b>' + habName(h) + '</b><div class="small muted">' + (why ? esc(why) : 'Level ' + h.lvl + ' · ' + Z.inHab(S, h.id).length + ' animals') + '</div></div>'; }).join('') + '</div>';
      const h = P.hab && Z.item(S, P.hab);
      if (h) {
        b += '<h4 class="sec" style="margin-top:10px">Theme <span style="text-transform:none;letter-spacing:0">(fit with this habitat, from -- to ++)</span></h4><div class="grid3">' + D.THEME_ORDER.filter(t => S.research['theme:' + t]).map(t => '<div class="it pick ' + (P.theme === t ? 'on' : '') + '" data-act="pv-theme" data-v="' + t + '"><div class="spread"><b>' + D.THEMES[t].name + '</b>' + fitSign(S.aff[h.t + '|' + t]) + '</div>' + (h.lastTheme === t ? '<div class="small neg">Just done here: Fun --</div>' : '') + '</div>').join('') + '</div>';
        b += '<h4 class="sec" style="margin-top:10px">Host <span style="text-transform:none;letter-spacing:0">(Charm drives Fun, Science and Care drive Learning)</span></h4>' + staffPick('pv-lead', P.lead ? [P.lead] : [], s => '<b>' + s.charm + ' / ' + s.sci + ' / ' + s.care + '</b>', 'Charm / Science / Care');
        b += '<div class="it soft small" style="margin-top:8px">The four scores build up over three weeks and you can watch them climb on the map. <b>Animals</b> is the rarity and stats of the best three here, <b>Habitat</b> is level, neighbors and combos. Sometimes the host gets fired up and adds extra.</div>';
      } else b += '<div class="banner y">No habitat is ready for an event right now.</div>';
      return { eyebrow: 'New project', title: 'Hold an exhibit event', wide: true, body: b, foot: '<span class="info">' + money(Z.eventCost(S)) + ' · reviews in 3 weeks</span><button class="btn ghost" data-act="close">Cancel</button><button class="btn ' + (h && P.theme && P.lead ? '' : 'off') + '" data-act="pv-go">Announce it</button>' };
    } });
  }

  // ---------- callers, shows and reports ----------
  function callerModal() {
    return { kind: 'caller-' + (S.offers ? S.offers.kind : 'trader'), render() {
      const O = S.offers || { kind: 'trader', list: [] }, dir = O.kind === 'director';
      const b = '<p>' + (dir ? 'A director from another zoo is passing through with animals you will not find at a trader. They are not cheap.' : 'The trader has pulled up at the gate. Common animals, fair prices, and usually the sex you are missing for a pair.') + '</p><div class="grid2">' + (O.list.length ? O.list.map((o, i) => { const sp = Z.sp(o.a); return '<div class="it"><div class="spread"><b>' + esc(sp.name) + '</b><span>' + rar(sp) + ' ' + grade(o.a) + '</span></div><div class="small muted">' + D.BIOMES[sp.biome].name + ' · ' + (o.a.sex === 'M' ? 'Male' : 'Female') + ' · ' + (S.book[sp.id] ? 'known' : '<b style="color:var(--gold)">new species</b>') + '</div><div class="spread" style="margin-top:4px"><span class="small">C ' + o.a.charm + ' V ' + o.a.vigor + ' W ' + o.a.wit + '</span><button class="btn sm ' + (S.money < o.price ? 'off' : '') + '" data-act="buy" data-i="' + i + '">Buy ' + money(o.price) + '</button></div></div>'; }).join('') : '<div class="it soft muted">Sold out.</div>') + '</div><p class="small muted">No rush. These offers stay open until the next seller arrives, and you can come back to them from the sidebar.</p>';
      return { eyebrow: 'A visitor at the gate', title: dir ? 'A visiting zoo director' : 'The animal trader', body: b, foot: '<button class="btn" data-act="close">Done</button>' };
    } };
  }
  function headhuntModal() {
    return { kind: 'caller-headhunter', render() {
      const s = S.headhunt; if (!s) return { title: 'The headhunter has moved on', body: '<p class="muted">Nobody is on offer right now.</p>' };
      const R = D.ROLES[s.role], fee = Z.headhuntFee(s);
      return { eyebrow: 'A visitor at the gate', title: 'The headhunter has someone for you', body: '<p>Well above what usually applies at a zoo your size, with a signing fee to match.</p><div class="it"><div class="spread"><b>' + esc(s.name) + '</b><span class="pill">' + R.name + '</span></div><div class="small muted">' + R.desc + ' · ' + money(Z.salary(s)) + ' a week</div>' + statBars(s, R.main) + '</div><p class="small muted">Staff room: ' + S.staff.length + ' of ' + Z.staffCap(S) + '. The offer stays open until the headhunter returns with someone else.</p>', foot: '<button class="btn ghost" data-act="close">Not now</button><button class="btn ' + (S.money < fee || S.staff.length >= Z.staffCap(S) ? 'off' : '') + '" data-act="headhunt-hire">Hire · ' + money(fee) + '</button>' };
    } };
  }
  function showModal() {
    UI.plan = { type: 'show', result: null };
    return { kind: 'show', render() {
      const P = UI.plan;
      if (P.result) { const r = P.result, a = Z.animal(S, r.animal); return { eyebrow: 'Winter Animal Show', title: r.medal ? 'A ' + r.medal + ' medal!' : 'No medal this year', body: '<div class="medal ' + (r.medal || 'none') + '">' + (r.medal ? '★ ' + r.medal.toUpperCase() + ' ★' : 'Not placed') + '</div><p>' + (a ? esc(a.name) + ' the ' + esc(Z.animalLabel(a)) : 'Your animal') + ' scored <b>' + Math.round(r.score) + '</b>. Gold needed ' + r.bar + ', silver ' + Math.round(r.bar * 0.85) + ', bronze ' + Math.round(r.bar * 0.7) + '.</p>' + (r.medal ? '<div class="banner g">' + money(r.money) + ' and ' + r.rep + ' reputation' + (r.medal === 'gold' ? ', plus a trophy' : '') + '.</div>' : '<p class="small muted">The judges look at one stat, plus rarity. Breeding for that stat is the way up.</p>') };
      }
      if (!S.show) return { title: 'The show is over for this year', body: '<p class="muted">It returns next winter.</p>' };
      const stat = S.show.stat, nm = { charm: 'Charm', vigor: 'Vigor', wit: 'Wit' }[stat], bar = S.show.bar;
      const list = S.animals.slice().sort((a, b) => Z.showScore(S, b) - Z.showScore(S, a)).slice(0, 8);
      return { eyebrow: 'A yearly event', title: 'The Winter Animal Show', body: '<p>This year the judges are looking at <b>' + nm + '</b>, with extra credit for rarity. Enter one animal.</p><div class="list">' + list.map(a => { const sc = Z.showScore(S, a), lvl = sc >= bar ? 3 : sc >= bar * 0.85 ? 2 : sc >= bar * 0.7 ? 1 : 0; return '<div class="it pick spread" data-act="show-enter" data-id="' + a.id + '"><span><b>' + esc(a.name) + '</b> the ' + esc(Z.animalLabel(a)) + ' ' + rar(Z.sp(a)) + '</span><span class="row"><span class="small muted">' + nm + ' ' + a[stat] + '</span>' + sg(lvl) + '</span></div>'; }).join('') + '</div><p class="small muted">++ looks like gold, + silver, - bronze. You can also leave it and enter later this year from the sidebar.</p>', foot: '<button class="btn ghost" data-act="close">Later</button>' };
    } };
  }
  function pullReports() { if (S.reports.length) { UI.queue = UI.queue.concat(S.reports); S.reports = []; } }
  function nextReport() {
    if (!S) return; pullReports();
    while (!UI.modal && UI.queue.length) {
      const r = UI.queue.shift();
      if (r.type === 'combo') { const c = D.COMBOS.find(x => x.id === r.id); UI.newCombo = { id: r.id, until: Date.now() + 4500 }; banner('COMBO! ' + c.name, c.draw ? pct(c.draw) + ' draw for the habitat' : c.spend ? pct(c.spend) + ' shop earnings' : c.crowd ? pct(c.crowd) + ' visitors' : pct(c.rpMult) + ' research'); drawMap(); continue; }
      if (r.type === 'caller') { openModal(r.kind === 'headhunter' ? headhuntModal() : callerModal()); continue; }
      if (r.type === 'show') { openModal(showModal()); continue; }
      const mk = REPORTS[r.type]; if (mk) openModal(mk(r));
    }
  }
  const soldTag = '<span class="pill">Sold</span>';
  function reportAnimal(id, extra) {
    const a = Z.animal(S, id); if (!a) return '<div class="it soft muted">Sold.</div>'; const hb = a.hab != null ? Z.item(S, a.hab) : null;
    return animalCard(a, '<div class="spread" style="margin-top:4px"><div class="row wrap">' + (extra || '') + (hb ? '<span class="pill g">Lives in ' + habName(hb) + '</span>' : '<span class="pill r">Holding pen: no room in a ' + D.BIOMES[Z.sp(a).biome].name + ' habitat</span>') + '</div><button class="btn sm warn" data-act="sell-now" data-id="' + a.id + '">Sell ' + money(Z.animalValue(a)) + '</button></div>');
  }
  const REPORTS = {
    rankup(r) {
      return { kind: 'rankup', render() {
        const cap = D.STAFF_CAP[r.rank], more = cap > D.STAFF_CAP[r.rank - 1], L = D.LAND.find(l => l.rank === r.rank), regs = { 2: 'jungle', 3: 'desert', 5: 'arctic', 6: 'mountain', 7: 'ocean' }[r.rank];
        const perks = ['Ticket price rises to ' + money(6 + (r.rank - 1)) + ' and visitors spend more.', 'About 5% more visitors.'];
        if (more) perks.push('You can now employ ' + cap + ' staff.'); if (L) perks.push('More land is for sale.'); if (regs) perks.push('The ' + D.BIOMES[regs].region + ' can now be researched.');
        if (r.rank === 5) perks.push('Strong expedition teams may start to find something unusual.'); if (r.rank === 6) perks.push('Traders now carry rare animals.');
        perks.push('Better applicants will come looking for work.');
        return { eyebrow: '★'.repeat(r.rank) + ' Rank ' + r.rank + ' of 10', title: 'You are now a ' + D.RANK_NAME[r.rank], body: '<ul>' + perks.map(p => '<li>' + p + '</li>').join('') + '</ul>' };
      } };
    },
    review(r) {
      return { kind: 'review', render() {
        const T = D.THEMES[r.theme], lead = Z.staffer(S, r.lead);
        let b = '<div class="scores">' + Object.keys(CAT).map(k => '<div class="score"><b>' + r.sc[k] + '</b><span>' + CAT[k] + '</span></div>').join('') + '</div><div class="total">' + r.total + '<small> / 40</small></div>';
        if (r.hof) b += '<div class="banner y" style="text-align:center">Hall of fame! The critics will talk about this one for years.</div>';
        b += '<div class="banner ' + (r.aff >= 2 ? 'g' : r.aff === 0 ? 'r' : 'y') + '">' + T.name + ' in a ' + D.BIOMES[r.biome].name + ' habitat: ' + sg(r.aff) + (r.firstTime ? ' Noted in your Book.' : '') + '</div>';
        if (r.repeat) b += '<div class="banner r">Same theme as last time here, so Fun suffered.</div>';
        const low = Object.keys(r.sc).sort((a, c) => r.sc[a] - r.sc[c])[0];
        const tip = { animals: 'Rarer animals with higher stats lift the Animals score. Only the best three count.', habitat: 'Upgrade the habitat and surround it with benches, photo spots and combos to lift the Habitat score.', fun: 'A host with more Charm and a better-fitting theme lifts Fun.', learning: 'A host with more Science and Care, and an Info Kiosk touching the habitat, lifts Learning.' }[low];
        b += '<p class="small"><b>Earned:</b> ' + money(r.money) + ', ' + r.rep + ' reputation, ' + r.rp + ' research, and a visitor buzz at the habitat that fades over 40 weeks.' + (lead ? ' Hosted by ' + esc(lead.name) + (r.fired ? ', who got fired up ' + (r.fired > 1 ? r.fired + ' times' : 'once') : '') + '.' : '') + '</p><p class="small muted">Weakest area: ' + tip + '</p>';
        return { eyebrow: 'Reviews are in', title: T.name + ' at the ' + D.BIOMES[r.biome].name + ' habitat', body: b };
      } };
    },
    expedition(r) {
      return { kind: 'expedition', render() {
        let b = '<div class="list">' + r.found.map(f => reportAnimal(f.id, f.isNew ? '<span class="pill y">New species!</span>' : '')).join('') + '</div>';
        b += '<ul class="small">' + r.notes.map(n => '<li>' + esc(n) + '</li>').join('') + (r.ups.length ? '<li>' + r.ups.map(esc).join(' and ') + ' gained a level.</li>' : '') + '</ul>';
        return { eyebrow: 'Expedition returned', title: 'Back from the ' + D.BIOMES[r.region].region, body: b, foot: '<button class="btn ghost" data-act="again-exp">Plan the next one</button><button class="btn" data-act="close">OK</button>' };
      } };
    },
    birth(r) {
      return { kind: 'birth', render() {
        const a = Z.animal(S, r.a), b2 = Z.animal(S, r.b);
        if (r.fail) return { eyebrow: 'Breeding', title: 'No baby this time', body: '<p>' + (a && b2 ? esc(a.name) + ' and ' + esc(b2.name) : 'The pair') + ' did not have a baby. They need 8 weeks of rest before trying again. A carer with more Care raises the odds.</p>' };
        const pa = a && b2 ? (Z.avg(a) + Z.avg(b2)) / 2 : null;
        let b = (r.kids.length > 1 ? '<div class="banner y">Twins!</div>' : '') + '<div class="list">' + r.kids.map(id => { const k = Z.animal(S, id); if (!k) return '<div class="it soft muted">Sold.</div>'; const d = pa == null ? 0 : Math.round(Z.avg(k) - pa); return reportAnimal(id, pa == null ? '' : '<span class="pill ' + (d >= 0 ? 'g' : 'r') + '">' + (d >= 0 ? '+' : '') + d + ' against its parents</span>'); }).join('') + '</div>';
        if (r.firstBred) b += '<div class="banner g">First birth of this species at your zoo. Bonus reputation.</div>';
        b += '<p class="small muted">Babies draw 35% more visitors for 16 weeks, then they are grown and can breed.</p>';
        return { eyebrow: 'New arrival', title: a ? 'A baby ' + esc(Z.sp(a).name) + '!' : 'A baby!', body: b };
      } };
    },
    vip(r) { const v = D.VIPS.find(x => x.id === r.id); return { kind: 'vip', render: () => ({ eyebrow: 'Special visitor', title: v.name + ' came to visit', body: '<p>Word got around after ' + v.when + '.</p><div class="banner g">' + money(v.money) + ', ' + v.rep + ' reputation, and ' + pct(v.boost) + ' visitors for 8 weeks.</div>' }) }; },
    yearly(r) {
      return { kind: 'yearly-' + r.id, render: () => r.id === 'openday'
        ? { eyebrow: 'A yearly event', title: 'Spring Open Day', body: '<p>The gates were open to everyone for a day and <b>' + num(r.crowd) + '</b> people came. The more your habitats draw, the bigger the crowd.</p><div class="banner g">' + r.rep + ' reputation and ' + money(r.money) + ' at the shops.</div>' }
        : { eyebrow: 'A yearly event', title: 'The Summer Festival', body: '<p>Stalls stayed open late all week. You have <b>' + r.kinds + '</b> kind' + (r.kinds === 1 ? '' : 's') + ' of shop, and every extra kind makes the festival pay more.</p><div class="banner g">' + money(r.money) + ' and ' + r.rep + ' reputation.</div>' } };
    },
    secret(r) { const B = D.BIOMES[r.region]; return { kind: 'secret', render: () => ({ eyebrow: 'A discovery', title: r.region === 'paleo' ? 'The map is complete' : 'A chart of nameless islands', body: '<p>' + (r.region === 'paleo' ? 'The four torn pieces fit together. They show a valley that is on no modern map, and the notes in the margin describe animals that should not exist any more.' : 'A stranger left a sea chart at the gate. It marks islands wrapped in fog, and the sketches along the edge look like something out of a storybook.') + '</p><div class="banner y">You can now send expeditions to ' + B.region + ' and build ' + B.name + ' habitats. Both are very expensive.</div>' }) }; },
    yearend(r) {
      S.lastTable = { year: r.year, table: r.table };
      return { kind: 'yearend', onClose() { saveAll(true); }, render() {
        const st = r.stats; let b = '<div class="grid2"><div><h4 class="sec">Zoo rankings</h4><table><tr><th class="n">#</th><th>Zoo</th><th class="n">Rating</th></tr>' + r.table.map((t, i) => '<tr class="' + (t.me ? 'me' : '') + '"><td class="n">' + (i + 1) + '</td><td>' + esc(t.name) + '</td><td class="n">' + num(t.rating) + '</td></tr>').join('') + '</table></div>';
        b += '<div><h4 class="sec">Annual awards <span style="text-transform:none;letter-spacing:0">(' + money(r.prize) + ' each)</span></h4><div class="list">' + r.awards.map(a => '<div class="it ' + (a.won ? 'on' : 'soft') + '"><div class="spread"><b>' + a.name + '</b>' + (a.won ? '<span class="pill y">★ Won</span>' : '<span class="pill">Missed</span>') + '</div><div class="small">' + esc(a.mine) + '</div><div class="small muted">Needed: ' + a.bar + '</div></div>').join('') + '</div>';
        b += '<h4 class="sec" style="margin-top:10px">The year in numbers</h4><div class="small">' + num(st.visitors) + ' visitors · ' + money(st.income - st.cost) + ' profit · ' + st.events + ' events · ' + st.expeditions + ' expeditions · ' + st.births + ' births · ' + st.species + ' species on record</div></div></div>';
        return { eyebrow: 'End of year ' + r.year, title: 'You placed ' + r.place + ' of ' + r.table.length, wide: true, body: b, foot: '<button class="btn" data-act="close">On to year ' + (r.year + 1) + '</button>' };
      } };
    },
    final(r) {
      if (!S.flags.legacySaved) {
        S.flags.legacySaved = true; const L = Store.legacy, last = S.history[S.history.length - 1];
        L.runs = (L.runs || 0) + 1; L.best = Math.max(L.best || 0, r.score.total); L.aff = Object.assign(L.aff || {}, S.aff); L.combos = Object.assign(L.combos || {}, S.combos);
        L.hall = (L.hall || []).concat([{ zoo: S.zooName, score: r.score.total, place: last ? last.place : 12, at: new Date().toISOString() }]);
        L.carry = { staff: S.staff.slice().sort((a, b) => b.lvl + (b.mastered || []).length * 30 - a.lvl - (a.mastered || []).length * 30).slice(0, 4).map(s => JSON.parse(JSON.stringify(s))), animals: S.animals.slice().sort((a, b) => Z.prestige(b) - Z.prestige(a)).slice(0, 4).map(a => JSON.parse(JSON.stringify(a))) };
        saveLegacy();
      }
      return { kind: 'final', onClose() { saveAll(true); }, render: () => ({ eyebrow: 'Twenty years', title: 'Final score: ' + num(r.score.total), body: '<table>' + r.score.parts.map(p => '<tr><td>' + p[0] + '</td><td class="n">' + num(p[1]) + '</td></tr>').join('') + '<tr class="me"><td>Total</td><td class="n">' + num(r.score.total) + '</td></tr></table><p class="small">Your score is on record. You can keep playing this zoo for as long as you like, or start a new one. A new zoo begins with extra money and faster research, keeps your theme and combo notes, and lets you bring along one member of staff and one animal.</p>', foot: '<button class="btn ghost" data-act="close">Keep playing</button><button class="btn" data-act="newgame-go">Start a new zoo</button>' }) };
    }
  };

  // ---------- title, new game, help ----------
  const HELP = '<ol style="padding-left:18px;margin:6px 0"><li><b>Watch the habitats.</b> A small green ! means it is ready for an event and a pink heart means a pair can breed. Click the icon to start.</li><li><b>Get animals.</b> A trader visits now and then with common ones. Expeditions bring back rarer ones.</li><li><b>Breed them.</b> Babies take after their parents and usually come out a little better. Keep the best, sell the rest.</li><li><b>Hold exhibit events.</b> Scores build over three weeks, then critics rate it out of 40. Good scores bring money, reputation and a visitor buzz.</li><li><b>Build on the hex map.</b> Each habitat has its own shape, and R rotates it. Tiles that touch give bonuses, and named combos get a colored outline.</li></ol><p class="small muted">Time stops while a window like this is open. Space pauses, and 1, 2, 3 set the speed. You cannot go bankrupt. Each year has an Open Day, a Summer Festival, a Winter Animal Show, then rankings and awards. After year ' + D.RUN_YEARS + ' you get a final score.</p>';
  const validSave = sv => sv && sv.v === 2 && sv.json;
  function titleModal() {
    openModal({ kind: 'title', closable: false, render() {
      const loc = validSave(Store.local) ? Store.local : null, cl = validSave(Store.cloud) ? Store.cloud : null, best = cl && (!loc || cl.savedAt >= loc.savedAt) ? cl : loc;
      UI.bestSave = best; let b = '<p>Run a small zoo for twenty years. Find animals, breed better ones, win over the critics and climb the rankings.</p>';
      if (best) b += '<div class="it soft">Saved game: <b>' + esc(best.zoo) + '</b>, year ' + (Math.floor(best.week / D.WPY) + 1) + ', saved ' + new Date(best.savedAt).toLocaleString() + (best === cl ? ' (cloud)' : ' (this browser)') + '</div>';
      b += '<div class="small muted" style="margin-top:8px">' + (Store.state === 'checking' ? 'Checking for a cloud save...' : Store.state === 'ok' ? 'Cloud save connected. Your game follows you to any browser.' : 'Cloud save is not available here. Your game is kept in this browser.') + '</div>';
      if (Store.legacy.runs) b += '<div class="small" style="margin-top:6px">Zoos completed: ' + Store.legacy.runs + ' · best score ' + num(Store.legacy.best) + '</div>';
      return { eyebrow: 'A zoo management game', title: 'Wildside Zoo', body: b, foot: (best ? '<button class="btn ghost" data-act="title-new">New zoo</button><button class="btn" data-act="title-continue">Continue</button>' : '<button class="btn" data-act="title-new">Start a new zoo</button>') };
    } });
  }
  function newGameModal() {
    const L = Store.legacy; UI.plan = { type: 'new', staff: null, animal: null };
    openModal({ kind: 'newgame', closable: !!S, render() {
      const P = UI.plan; let b = '<label for="zooname-in" style="display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Zoo name</label><input type="text" id="zooname-in" maxlength="28" value="' + esc(P.name || 'Wildside Zoo') + '">';
      if (L.runs) {
        b += '<div class="banner g" style="margin-top:10px">Carry-over from ' + L.runs + ' finished zoo' + (L.runs > 1 ? 's' : '') + ': ' + money(Math.min(L.runs, 5) * 6000) + ' extra to start, research ' + (Math.min(L.runs, 5) * 10) + '% faster, and your theme and combo notes.</div>';
        if (L.carry) {
          b += '<h4 class="sec">Bring one member of staff</h4><div class="grid2">' + L.carry.staff.map((s, i) => '<div class="it pick ' + (P.staff === i ? 'on' : '') + '" data-act="ng-staff" data-i="' + i + '"><b>' + esc(s.name) + '</b><div class="small muted">' + D.ROLES[s.role].name + ' · Level ' + s.lvl + '</div></div>').join('') + '</div>';
          b += '<h4 class="sec" style="margin-top:8px">Bring one animal</h4><div class="grid2">' + L.carry.animals.map((a, i) => '<div class="it pick ' + (P.animal === i ? 'on' : '') + '" data-act="ng-animal" data-i="' + i + '"><b>' + esc(a.name) + '</b> the ' + esc(Z.animalLabel(a)) + '<div class="small muted">' + D.RARITY.name[Z.sp(a).rarity] + ' · average ' + Math.round(Z.avg(a)) + '</div></div>').join('') + '</div>';
        }
      }
      if (S) b += '<div class="banner r" style="margin-top:10px">This replaces your current zoo' + (S.finished ? '. Its score is already on record.' : ', which has not reached its final score yet.') + '</div>';
      return { eyebrow: 'New game', title: 'Start a new zoo', body: b, foot: (S ? '<button class="btn ghost" data-act="close">Cancel</button>' : '') + '<button class="btn" data-act="new-go">Open the gates</button>' };
    } });
  }
  function startNew() {
    const P = UI.plan || {}, L = Store.legacy, nm = ($('#zooname-in') && $('#zooname-in').value.trim()) || 'Wildside Zoo', opts = { zooName: nm.slice(0, 28) };
    if (L.carry && P.staff != null) opts.staff = L.carry.staff[P.staff];
    if (L.carry && P.animal != null) opts.animal = L.carry.animals[P.animal];
    if (S && S.elog.length) flushLog(true);
    S = Z.newGame(L, opts); S.logQ = 0; S.tele = newTele(); S.did = {};
    UI.sel = null; UI.mode = { type: 'select' }; UI.queue = []; UI.acc = 0; UI.speed = 1; UI.menu = null; UI.modal = null; UI.plan = null; UI.walkers = [];
    saveAll(true); render();
    openModal({ kind: 'help', render: () => ({ eyebrow: 'Welcome', title: 'How to play', body: HELP, foot: '<button class="btn" data-act="close">Let\'s go</button>' }) });
  }
  function loadSave(sv) {
    try { S = Z.deserialize(sv.json); } catch (e) { toast('That save could not be read.', 'bad'); return false; }
    if (S.logQ == null) S.logQ = Math.floor(S.week / 12); if (!S.tele) S.tele = newTele(); if (!S.did) S.did = {}; if (!S.fx) S.fx = [];
    UI.queue = []; UI.modal = null; UI.speed = 0; UI.walkers = []; drawModal(); render(); toast('Welcome back. The game is paused.', ''); nextReport(); return true;
  }

  // ---------- click handling ----------
  const A = {
    close() { closeModal(); },
    yes() { const m = UI.modal; if (m && m.yes) m.yes(); },
    desel() { UI.sel = null; render(); },
    speed(d) { UI.speed = +d.v; if (UI.speed) UI.lastSpeed = UI.speed; tele('acts', 'speed' + d.v); drawTop(); },
    menu(d) { const was = UI.menu; UI.menu = was === d.v ? null : d.v; tele('tabs', d.v); if (was === 'build' && UI.menu !== 'build') UI.mode = { type: 'select' }; render(); if (UI.menu && UI.menu !== 'build' && was !== UI.menu) $('#panel').scrollTop = 0; },
    sub(d) { UI.sub[d.k] = d.v; tele('tabs', d.k + ':' + d.v); drawDrawer(); },
    mode(d) { setMode({ type: d.v }); },
    buildhab(d) { setMode(UI.mode.type === 'build' && UI.mode.t === d.v ? { type: 'select' } : { type: 'build', k: 'hab', t: d.v }); },
    buildfac(d) { setMode(UI.mode.type === 'build' && UI.mode.t === d.v ? { type: 'select' } : { type: 'build', k: 'fac', t: d.v }); },
    land() { act(Z.buyLand(S), 'New land is yours.', 'land'); },
    upgrade(d) { act(Z.upgrade(S, +d.id), 'Habitat upgraded.', 'upgrade'); },
    'plan-exp'() { planExp(); }, 'again-exp'() { UI.modal = null; planExp(); },
    'plan-breed'(d) { planBreed(d.id ? +d.id : null); },
    'plan-event'(d) { planEvent(d.id ? +d.id : null); },
    'quick-event'(d) { const h = Z.item(S, +d.id), th = h && bestTheme(h), host = bestHost(); if (!h || !th || !host) return toast('Nobody is free to host.', 'bad'); if (act(Z.startEvent(S, h.id, th, host.id), D.THEMES[th].name + ' announced, hosted by ' + first(host) + '.', 'event')) tele('acts', 'quick_event'); },
    'quick-breed'(d) { const lead = bestCarer(); if (!lead) return toast('Nobody is free to look after them.', 'bad'); if (act(Z.startBreeding(S, +d.a, +d.b, lead.id), first(lead) + ' is looking after the pair.', 'breed')) tele('acts', 'quick_breed'); },
    'pe-region'(d) { UI.plan.region = d.v; drawModal(); },
    'pe-staff'(d) { const t = UI.plan.team, id = +d.id, i = t.indexOf(id); if (i >= 0) t.splice(i, 1); else if (t.length < 3) t.push(id); else toast('Three people at most.', 'bad'); drawModal(); },
    'pe-budget'(d) { UI.plan.budget = +d.v; drawModal(); },
    'pe-go'() { const P = UI.plan; if (act(Z.startExpedition(S, P.region, P.team, P.budget), 'The convoy is on its way.', 'exp')) closeModal(); },
    'pb-pair'(d) { UI.plan.pair = [+d.a, +d.b]; drawModal(); },
    'pb-lead'(d) { UI.plan.lead = +d.id; drawModal(); },
    'pb-go'() { const P = UI.plan; if (!P.pair || !P.lead) return toast('Pick a pair and someone to look after them.', 'bad'); if (act(Z.startBreeding(S, P.pair[0], P.pair[1], P.lead), 'Fingers crossed.', 'breed')) closeModal(); },
    'pv-hab'(d) { UI.plan.hab = +d.id; UI.plan.theme = bestTheme(Z.item(S, +d.id)); drawModal(); },
    'pv-theme'(d) { UI.plan.theme = d.v; drawModal(); },
    'pv-lead'(d) { UI.plan.lead = +d.id; drawModal(); },
    'pv-go'() { const P = UI.plan; if (!P.hab || !P.theme || !P.lead) return toast('Pick a habitat, a theme and a host.', 'bad'); if (act(Z.startEvent(S, P.hab, P.theme, P.lead), 'Posters are going up.', 'event')) closeModal(); },
    'caller-open'() { openModal(callerModal()); },
    'headhunt-open'() { openModal(headhuntModal()); },
    'headhunt-hire'() { if (act(Z.hireHeadhunt(S), 'Welcome aboard.', 'hire_headhunt')) closeModal(); },
    'show-open'() { openModal(showModal()); },
    'show-enter'(d) { const r = Z.enterShow(S, +d.id); if (!r.ok) return toast(r.msg, 'bad'); tele('acts', 'show'); UI.plan.result = r; render(); drawModal(true); },
    buy(d) { const r = Z.buyAnimal(S, +d.i); act(r, r.ok ? (r.housed ? 'Welcome to the zoo!' : 'Bought. It is waiting in the holding pen.') : '', 'buy'); },
    sell(d) { const a = Z.animal(S, +d.id); if (!a) return; confirmModal('Sell ' + esc(a.name) + '?', esc(a.name) + ' the ' + esc(Z.animalLabel(a)) + ' goes to another zoo for <b>' + money(Z.animalValue(a)) + '</b>.', 'Sell', () => { closeModal(); act(Z.sellAnimal(S, a.id), 'Sold.', 'sell'); }); },
    'sell-now'(d) { act(Z.sellAnimal(S, +d.id), 'Sold.', 'sell'); },
    movea(d) {
      const a = Z.animal(S, +d.id); if (!a) return; const sp = Z.sp(a);
      openModal({ kind: 'move-animal', render() { const habs = S.items.filter(i => i.k === 'hab' && i.t === sp.biome);
        return { title: 'Move ' + esc(a.name), body: '<p class="small muted">' + esc(sp.name) + 's live in ' + D.BIOMES[sp.biome].name + ' habitats.</p><div class="list">' + habs.map(h => { const n = Z.inHab(S, h.id).length, full = n >= Z.habCap(h), here = a.hab === h.id; return '<div class="it spread ' + (full || here ? 'dis' : 'pick') + '" ' + (full || here ? '' : 'data-act="movea-to" data-id="' + a.id + '" data-h="' + h.id + '"') + '><b>' + habName(h) + '</b><span class="small muted">' + (here ? 'Lives here' : n + '/' + Z.habCap(h) + (full ? ' full' : '')) + '</span></div>'; }).join('') + (habs.length ? '' : '<div class="it soft muted">You have no ' + D.BIOMES[sp.biome].name + ' habitat yet.</div>') + (a.hab != null ? '<div class="it spread pick" data-act="movea-to" data-id="' + a.id + '" data-h=""><b>Holding pen</b><span class="small muted">' + Z.holding(S).length + '/' + Z.holdCap(S) + '</span></div>' : '') + '</div>', foot: '<button class="btn ghost" data-act="close">Cancel</button>' }; } });
    },
    'movea-to'(d) { if (act(Z.moveAnimal(S, +d.id, d.h === '' ? null : +d.h), 'Moved.', 'movea') && UI.modal && UI.modal.kind === 'move-animal') closeModal(); },
    hire(d) { act(Z.hire(S, +d.i), 'Welcome aboard.', 'hire'); },
    fire(d) { const s = Z.staffer(S, +d.id); if (!s) return; confirmModal('Let ' + esc(s.name) + ' go?', 'They leave the zoo for good.', 'Let go', () => { closeModal(); act(Z.fire(S, s.id), 'They have left.', 'fire'); }); },
    train(d) {
      const s = Z.staffer(S, +d.id); if (!s) return; if (S.week - s.trainAt < 10) return toast(first(s) + ' can train again in ' + (10 - (S.week - s.trainAt)) + ' weeks.', 'bad');
      openModal({ kind: 'train', render: () => ({ title: 'Train ' + esc(s.name), body: '<p class="small muted">Each course costs ' + money(Z.trainCost(s)) + ' and adds 3 to 5 points. They can train once every 10 weeks.</p><div class="grid2">' + D.COURSES.map(c => '<div class="it pick" data-act="train-go" data-id="' + s.id + '" data-v="' + c.stat + '"><b>' + c.name + '</b><div class="small muted">' + D.STATS[c.stat] + ', now ' + s[c.stat] + '</div></div>').join('') + '</div>', foot: '<button class="btn ghost" data-act="close">Cancel</button>' }) });
    },
    'train-go'(d) { const s = Z.staffer(S, +d.id), r = Z.train(S, +d.id, d.v); if (act(r, r.ok ? first(s) + ' gained ' + r.gain + ' ' + D.STATS[d.v] + '.' : '', 'train')) closeModal(); },
    job(d) {
      const s = Z.staffer(S, +d.id); if (!s) return; if (s.lvl < D.JOB_LEVEL) return toast(first(s) + ' can change jobs at level ' + D.JOB_LEVEL + '.', 'bad');
      openModal({ kind: 'job', render: () => ({ eyebrow: 'Job change · ' + money(Z.jobCost(s)), title: 'A new job for ' + esc(s.name), body: '<p class="small muted">' + first(s) + ' keeps every stat, gets +5 in the new job\'s main stat, and starts again at level 1, so levels come quickly and the stats keep climbing. Advanced jobs need two mastered jobs.</p><div class="grid2">' + Z.jobOptions(S, s).map(o => { const R = D.ROLES[o.role]; return '<div class="it ' + (o.lock ? 'dis' : 'pick') + '" ' + (o.lock ? '' : 'data-act="job-go" data-id="' + s.id + '" data-v="' + o.role + '"') + '><div class="spread"><b>' + R.name + '</b>' + (R.adv ? '<span class="pill y">Advanced</span>' : '') + '</div><div class="small muted">' + R.desc + '</div><div class="small">' + (o.lock ? esc(o.lock) : 'Main stat: ' + D.STATS[R.main] + ', now ' + s[R.main]) + '</div></div>'; }).join('') + '</div>', foot: '<button class="btn ghost" data-act="close">Cancel</button>' }) });
    },
    'job-go'(d) { const s = Z.staffer(S, +d.id); if (act(Z.changeJob(S, +d.id, d.v), first(s) + ' is now a ' + D.ROLES[d.v].name + '.', 'jobchange')) closeModal(); },
    research(d) { if (act(Z.doResearch(S, d.id), 'Research complete.', 'research')) nextReport(); },
    save() { saveAll(true); toast(Store.db ? 'Saved.' : 'Saved in this browser.', 'good'); },
    note() { const el = $('#note'), t = el && el.value.trim(); if (!t) return toast('Write something first.', 'bad'); S.elog.push({ w: S.week, t: 'note', text: t.slice(0, 1000) }); Store.add('notes', { runId: S.runId, week: S.week, year: Z.year(S), text: t.slice(0, 1000), at: new Date().toISOString() }); el.value = ''; saveAll(true); toast('Note saved for Claude.', 'good'); },
    help() { openModal({ kind: 'help', render: () => ({ title: 'How to play', body: HELP }) }); },
    newgame() { newGameModal(); }, 'newgame-go'() { UI.modal = null; newGameModal(); },
    'title-continue'() { if (Store.state === 'checking') return toast('One moment, checking for your cloud save.', ''); if (UI.bestSave) loadSave(UI.bestSave); },
    'title-new'() { if (Store.state === 'checking') return toast('One moment, checking for your cloud save.', ''); UI.modal = null; newGameModal(); },
    'ng-staff'(d) { UI.plan.name = $('#zooname-in').value; UI.plan.staff = UI.plan.staff === +d.i ? null : +d.i; drawModal(); },
    'ng-animal'(d) { UI.plan.name = $('#zooname-in').value; UI.plan.animal = UI.plan.animal === +d.i ? null : +d.i; drawModal(); },
    'new-go'() { startNew(); }
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (el) { const fn = A[el.dataset.act]; if (fn) fn(el.dataset, el); return; }
    if (e.target.closest('#map')) mapClick(e);
  });
  $('#map').addEventListener('mousemove', e => { if (!S) return; const a = evToAxial(e); if (!UI.hover || UI.hover[0] !== a[0] || UI.hover[1] !== a[1]) { UI.hover = a; drawGhost(); } });
  $('#map').addEventListener('mouseleave', () => { UI.hover = null; drawGhost(); });
  $('#map').addEventListener('wheel', e => { if (ghostSpec()) { e.preventDefault(); rotate(e.deltaY > 0 ? 1 : -1); } }, { passive: false });
  $('#map').addEventListener('contextmenu', e => { if (ghostSpec()) { e.preventDefault(); rotate(1); } });
  document.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA/.test((e.target.tagName || ''))) return;
    if (e.key === 'Escape') { if (UI.modal) { if (UI.modal.closable !== false) closeModal(); } else if (UI.mode.type !== 'select') setMode({ type: 'select' }); else if (UI.sel) { UI.sel = null; render(); } else if (UI.menu) { UI.menu = null; render(); } return; }
    if (!S || UI.modal) return;
    if (e.key === 'r' || e.key === 'R') rotate(1);
    if (e.key === ' ') { e.preventDefault(); UI.speed = UI.speed ? 0 : (UI.lastSpeed || 1); drawTop(); }
    if (e.key === '1' || e.key === '2' || e.key === '3') { UI.speed = +e.key; UI.lastSpeed = UI.speed; drawTop(); }
  });
  window.addEventListener('resize', () => { if (S) drawGhost(); });

  // ---------- the clock ----------
  function doTick() {
    Z.tick(S);
    if (Math.floor(S.week / 12) > (S.logQ || 0)) { flushLog(false); saveCloud(); }
    if (S.week % 4 === 0) saveLocal();
    render(); weekFx(); nextReport();
  }
  let last = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = Math.min(1000, now - last); last = now;
    if (!S || document.hidden) return;
    const paused = !!UI.modal || UI.speed === 0;
    S.play.sec += dt / 1000; S.play.bySpeed[paused ? 0 : UI.speed] += dt / 1000;
    if (UI.modal) S.play.modal = (S.play.modal || 0) + dt / 1000;
    if (!paused) { UI.acc += dt; if (UI.acc >= WEEK_MS[UI.speed]) { UI.acc = 0; doTick(); } stepWalkers(dt); }
    const wb = $('#weekbar'); if (wb) wb.style.width = Math.min(100, UI.acc / WEEK_MS[UI.speed || UI.lastSpeed || 1] * 100) + '%';
    if (UI.newCombo && UI.newCombo.until < Date.now()) { UI.newCombo = null; drawMap(); }
  }, 100);
  window.addEventListener('pagehide', () => { if (S) saveLocal(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S) saveLocal(); });

  // ---------- boot ----------
  drawTop(); Store.local = Store.lsGet(LS_SAVE);
  titleModal();
  Store.init().then(() => { drawSave(); if (UI.modal && UI.modal.kind === 'title') drawModal(); });
  window.__zoo = { get S() { return S; }, UI: UI, Store: Store, tick: () => doTick(), ctr: ctr, viewScale: viewScale }; // handy for testing
})();
