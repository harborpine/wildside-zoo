/* Wildside Zoo: game rules. No DOM here so it can run in tests. */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.ZD;
  const Z = {};
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const MONTHS = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];

  // ---------- small helpers ----------
  Z.year = S => Math.floor(S.week / D.WPY) + 1;
  Z.woy = S => S.week % D.WPY;
  Z.season = S => Math.floor(Z.woy(S) / 12);
  Z.dateStr = S => 'Year ' + Z.year(S) + ', ' + MONTHS[Math.floor(Z.woy(S) / 4)] + ' week ' + (Z.woy(S) % 4 + 1);
  Z.rank = S => { let r = 1; for (let i = 0; i < D.RANK_REP.length; i++) if (S.rep >= D.RANK_REP[i]) r = i + 1; return r; };
  Z.nextRankRep = S => D.RANK_REP[Z.rank(S)] || null;
  Z.staffCap = S => D.STAFF_CAP[Z.rank(S)];
  Z.holdCap = S => S.research['tech:pen'] ? 12 : 6;
  Z.maxExp = S => S.research['tech:jeep'] ? 2 : 1;
  Z.habLevelCap = S => S.research['tech:hab5'] ? 5 : S.research['tech:hab4'] ? 4 : S.research['tech:hab3'] ? 3 : 2;
  Z.habCap = h => 4 + h.lvl + (D.SHAPES[h.t].length >= 5 ? 1 : 0);
  Z.sp = a => D.SPECIES[a.sp];
  Z.avg = a => (a.charm + a.vigor + a.wit) / 3;
  Z.isJuv = (S, a) => a.born != null && S.week - a.born < 16;
  Z.grade = v => v >= 90 ? 'SS' : v >= 75 ? 'S' : v >= 58 ? 'A' : v >= 42 ? 'B' : v >= 26 ? 'C' : 'D';
  Z.animalDraw = (S, a) => D.RARITY.draw[Z.sp(a).rarity] * (0.5 + Z.avg(a) / 100) * (a.variant ? 1.8 : 1) * (Z.isJuv(S, a) ? 1.35 : 1);
  Z.animalValue = a => Math.round(D.RARITY.value[Z.sp(a).rarity] * (0.5 + Z.avg(a) / 50) * (a.variant ? 3 : 1));
  Z.prestige = a => Z.sp(a).rarity * 20 + Z.avg(a) + (a.variant ? 30 : 0);
  Z.animalLabel = a => (a.variant ? Z.sp(a).variant + ' ' : '') + Z.sp(a).name;
  Z.item = (S, id) => S.items.find(i => i.id === id);
  Z.animal = (S, id) => S.animals.find(a => a.id === id);
  Z.staffer = (S, id) => S.staff.find(s => s.id === id);
  Z.inHab = (S, hid) => S.animals.filter(a => a.hab === hid);
  Z.holding = S => S.animals.filter(a => a.hab == null);
  Z.busyStaff = S => { const b = {}; S.projects.forEach(p => p.staff.forEach(id => { b[id] = p; })); return b; };
  Z.busyAnimals = S => { const b = {}; S.projects.forEach(p => { if (p.type === 'breed') { b[p.a] = p; b[p.b] = p; } }); return b; };
  Z.speciesCount = S => Object.keys(S.book).length;
  Z.variantCount = S => Object.values(S.book).filter(b => b.variant).length;
  Z.salary = s => Math.round(30 + s.lvl * 22 + (s.care + s.sci + s.exp + s.charm) * 0.6 + (s.mastered ? s.mastered.length * 80 : 0));
  Z.trainCost = s => Math.round(400 * Math.pow(s.lvl, 1.5) / 50) * 50;
  Z.ticket = S => 6 + 1.0 * (Z.rank(S) - 1);
  Z.buzzNow = (S, h) => h.buzz ? h.buzz * Math.max(0, 1 - (S.week - h.buzzAt) / 40) : 0;
  Z.habBuildCost = (S, biome) => D.BIOMES[biome].hab;
  Z.habUpgradeCost = h => Math.round(D.BIOMES[h.t].hab * [0, 2, 5, 12, 30][h.lvl]);
  Z.eventCost = S => 300 * Z.rank(S);
  Z.expCost = (region, budget) => Math.round(D.BIOMES[region].exp * [1, 1.6, 2.5][budget]);

  function ev(S, t, o) { S.elog.push(Object.assign({ w: S.week, t: t }, o || {})); }
  function news(S, msg, kind) { S.news.unshift({ w: S.week, msg: msg, kind: kind || '' }); if (S.news.length > 80) S.news.pop(); }
  function report(S, r) { S.reports.push(r); }
  function addRep(S, n) {
    const before = Z.rank(S); S.rep += Math.round(n);
    const after = Z.rank(S);
    if (after > before) {
      news(S, 'Your zoo is now a ' + D.RANK_NAME[after] + ' (rank ' + after + ').', 'good');
      ev(S, 'rankup', { rank: after });
      report(S, { type: 'rankup', rank: after });
    }
  }
  Z.addRep = addRep;

  // ---------- creating things ----------
  function uid(S) { return S.nextId++; }
  function makeAnimal(S, spId, base, o) {
    o = o || {};
    const st = () => clamp(Math.round(base + rnd(-5, 5)), 1, 99);
    const used = {}; S.animals.forEach(a => { used[a.name] = 1; });
    let name = pick(D.ANIMAL_NAMES), tries = 0;
    while (used[name] && tries++ < 30) name = pick(D.ANIMAL_NAMES);
    if (used[name]) name = name + ' ' + (S.nextId % 97);
    return { id: uid(S), sp: spId, name: name, sex: o.sex || (Math.random() < 0.5 ? 'M' : 'F'), charm: st(), vigor: st(), wit: st(), variant: !!o.variant, gen: o.gen || 1, born: o.born == null ? null : o.born, hab: null, rest: 0 };
  }
  function makeStaff(S, role, q) {
    const R = D.ROLES[role];
    const s = { id: uid(S), name: pick(D.FIRST) + ' ' + pick(D.LAST), role: role, lvl: 1, xp: 0, care: 0, sci: 0, exp: 0, charm: 0, trainAt: -99 };
    Object.keys(D.STATS).forEach(k => { s[k] = clamp(Math.round(q * 0.4 + rnd(0, 8)), 3, 99); });
    s[R.main] = clamp(Math.round(q + rnd(0, 10)), 5, 99);
    if (R.second) s[R.second] = clamp(Math.round(q * 0.75 + rnd(0, 8)), 5, 99);
    return s;
  }
  const BASIC = Object.keys(D.ROLES).filter(r => !D.ROLES[r].adv);
  function rollApplicants(S) {
    const q = 8 + Z.rank(S) * 5;
    const roles = BASIC;
    S.applicants = [];
    for (let i = 0; i < 4; i++) S.applicants.push(makeStaff(S, i === 0 ? pick(roles) : roles[(S.week / 12 + i) % roles.length | 0], q + ri(-3, 6)));
  }
  function rollOffers(S, kind) {
    const rank = Z.rank(S), list = [];
    if (kind === 'director') {
      const want = clamp(3 + Math.floor((rank - 1) / 3), 3, 5);
      let pool = D.SPECIES_LIST.filter(s => S.regions[s.biome] && !D.BIOMES[s.biome].secret && s.rarity === want);
      if (!pool.length) pool = D.SPECIES_LIST.filter(s => S.regions[s.biome] && !D.BIOMES[s.biome].secret && s.rarity === 3);
      for (let i = 0; i < 2 && pool.length; i++) { const sp = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; const a = makeAnimal(S, sp.id, 18 + rank * 3 + ri(0, 8)); list.push({ a: a, price: Math.round(Z.animalValue(a) * 2.6 / 100) * 100 }); }
    } else {
      const maxR = rank >= 6 ? 3 : 2;
      const pool = D.SPECIES_LIST.filter(s => S.regions[s.biome] && s.rarity <= maxR && !D.BIOMES[s.biome].secret);
      for (let i = 0; i < 4; i++) {
        const sp = pick(pool), a = makeAnimal(S, sp.id, 13 + rank * 2 + ri(0, 6));
        const own = S.animals.filter(x => x.sp === sp.id); // make pairs easier to find
        if (own.length && own.every(x => x.sex === own[0].sex)) a.sex = own[0].sex === 'M' ? 'F' : 'M';
        list.push({ a: a, price: Math.round(Z.animalValue(a) * 2.2 / 50) * 50 });
      }
    }
    S.offers = { kind: kind, at: S.week, list: list };
  }
  function callerArrive(S) {
    const n = S.callerN = (S.callerN || 0) + 1, kind = n % 4 === 2 ? 'headhunter' : n % 4 === 0 ? 'director' : 'trader';
    if (kind === 'headhunter') S.headhunt = makeStaff(S, pick(BASIC), 22 + Z.rank(S) * 5); else rollOffers(S, kind);
    ev(S, 'caller', { kind: kind }); report(S, { type: 'caller', kind: kind });
  }
  Z.headhuntFee = s => Z.salary(s) * 20;
  function discover(S, a, how) {
    let b = S.book[a.sp];
    const sp = Z.sp(a);
    if (!b) {
      b = S.book[a.sp] = { variant: false, bred: false, best: 0, at: S.week };
      S.yr.newSpecies++;
      addRep(S, 4 * sp.rarity * sp.rarity);
      S.rp += 3 * sp.rarity;
      ev(S, 'species', { sp: a.sp, how: how });
      news(S, 'New species for the collection: ' + sp.name + '.', 'good');
    }
    if (a.variant && !b.variant) { b.variant = true; S.flags.variant = true; addRep(S, 15 * sp.rarity); news(S, 'Rare variant recorded: ' + Z.animalLabel(a) + '.', 'good'); ev(S, 'variant', { sp: a.sp, how: how }); }
    b.best = Math.max(b.best, Math.round(Z.avg(a)));
  }
  function house(S, a) {
    const sp = Z.sp(a);
    const habs = S.items.filter(i => i.k === 'hab' && i.t === sp.biome && Z.inHab(S, i.id).length < Z.habCap(i));
    // prefer a habitat that already holds the same species
    habs.sort((x, y) => (Z.inHab(S, y.id).some(b => b.sp === a.sp) ? 1 : 0) - (Z.inHab(S, x.id).some(b => b.sp === a.sp) ? 1 : 0));
    a.hab = habs.length ? habs[0].id : null;
    return a.hab;
  }

  Z.newGame = function (legacy, opts) {
    legacy = legacy || { runs: 0 }; opts = opts || {};
    const S = {
      v: 2, runId: 'run' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), zooName: opts.zooName || 'Wildside Zoo',
      ng: legacy.runs || 0, startedAt: Date.now(), week: 0, money: 20000 + Math.min(legacy.runs || 0, 5) * 6000, rp: 0, rep: 0, cols: D.START_COLS,
      items: [], animals: [], staff: [], applicants: [], market: [], projects: [], reports: [], news: [], elog: [],
      offers: null, headhunt: null, show: null, fx: [], callerN: 0, research: {}, regions: { savanna: true }, aff: Object.assign({}, legacy.aff || {}), combos: {}, knownCombos: Object.assign({}, legacy.combos || {}),
      book: {}, fragments: 0, flags: {}, vips: {}, boost: null, trophies: 0, history: [], nextId: 1, finished: false, score: null,
      yr: newYearStats(), life: { events: 0, expeditions: 0, births: 0, income: 0, bestReview: 0, hof: 0 },
      visitorsLast: 0, incomeLast: 0, costLast: 0, play: { sec: 0, bySpeed: [0, 0, 0, 0] }
    };
    D.FAC_ORDER.forEach(f => { if (!D.FAC[f].rp) S.research['fac:' + f] = true; });
    D.THEME_ORDER.forEach(t => { if (!D.THEMES[t].rp) S.research['theme:' + t] = true; });
    const k = makeStaff(S, 'keeper', 16), x = makeStaff(S, 'explorer', 16);
    S.staff.push(k, x);
    if (opts.staff) { const c = JSON.parse(JSON.stringify(opts.staff)); c.id = uid(S); c.trainAt = -99; S.staff.push(c); }
    S.items.push({ id: uid(S), k: 'hab', t: 'savanna', q: 0, r: 4, rot: 0, lvl: 1, buzz: 0, buzzAt: 0, lastTheme: null, eventAt: -99 });
    S.items.push({ id: uid(S), k: 'fac', t: 'snack', q: 2, r: 4, rot: 0 });
    const hid = S.items[0].id;
    [['zebra', 'M'], ['zebra', 'F']].forEach(p => { const a = makeAnimal(S, p[0], 15, { sex: p[1] }); a.hab = hid; S.animals.push(a); discover(S, a, 'start'); });
    if (opts.animal) { const c = JSON.parse(JSON.stringify(opts.animal)); c.id = uid(S); c.rest = 0; c.born = null; S.animals.push(c); house(S, c); discover(S, c, 'legacy'); }
    S.rep = 0; S.rp = 5; S.news = []; S.elog = []; S.reports = []; S.yr = newYearStats();
    rollApplicants(S); rollOffers(S, 'trader');
    news(S, 'Welcome to ' + S.zooName + '. Two zebras, two staff and a snack stand. Make it famous.', '');
    ev(S, 'start', { ng: S.ng, zoo: S.zooName });
    Z.refresh(S);
    return S;
  };
  function newYearStats() { return { visitors: 0, income: 0, cost: 0, bestReview: 0, bestReviewName: '', events: 0, expeditions: 0, births: 0, bestBaby: 0, bestBabyName: '', newSpecies: 0 }; }

  // ---------- hex grid ----------
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  Z.DIRS = DIRS;
  Z.rot = function (q, r, n) { n = ((n % 6) + 6) % 6; for (let i = 0; i < n; i++) { const t = q; q = -r; r = t + r; } return [q, r]; };
  Z.cellsOf = (kind, t, q, r, rot) => (kind === 'hab' ? D.SHAPES[t] : [[0, 0]]).map(o => { const p = Z.rot(o[0], o[1], rot || 0); return [q + p[0], r + p[1]]; });
  Z.cells = it => Z.cellsOf(it.k, it.t, it.q, it.r, it.rot);
  Z.toCol = (q, r) => q + (r - (r & 1)) / 2;
  Z.fromOffset = (col, row) => [col - (row - (row & 1)) / 2, row];
  Z.inLand = (S, q, r) => { const c = Z.toCol(q, r); return r >= 0 && r < D.GRID_H && c >= 0 && c < S.cols; };
  Z.occupancy = function (S, ignoreId, items) { const g = {}; (items || S.items).forEach(it => { if (it.id === ignoreId) return; Z.cells(it).forEach(c => { g[c[0] + ',' + c[1]] = it.id; }); }); return g; };
  Z.canPlace = function (S, kind, t, q, r, rot, ignoreId) { const g = Z.occupancy(S, ignoreId); return Z.cellsOf(kind, t, q, r, rot).every(c => Z.inLand(S, c[0], c[1]) && !g[c[0] + ',' + c[1]]); };
  const kindOf = it => it.k + ':' + it.t;
  Z.kindOf = kindOf;
  // Who touches whom, and which combos are complete. Pure, so the interface can preview a placement.
  Z.layout = function (S, items) {
    items = items || S.items; const g = Z.occupancy(S, null, items), byId = {}; items.forEach(i => { byId[i.id] = i; });
    const nb = {};
    items.forEach(it => { const set = {}; Z.cells(it).forEach(c => DIRS.forEach(d => { const o = g[(c[0] + d[0]) + ',' + (c[1] + d[1])]; if (o && o !== it.id) set[o] = 1; })); nb[it.id] = Object.keys(set).map(k => byId[k]); });
    const active = [];
    D.COMBOS.forEach(c => items.forEach(it => {
      if (kindOf(it) !== c.anchor) return; const members = [];
      const ok = c.needs.every(need => { const m = nb[it.id].find(o => kindOf(o) === need && members.indexOf(o.id) < 0); if (m) members.push(m.id); return !!m; });
      if (ok) active.push({ id: c.id, anchor: it.id, members: members });
    }));
    return { nb: nb, active: active, byId: byId, occ: g };
  };
  // Combos you already know that are exactly one facility short, and the free spots where it could go.
  Z.nearMisses = function (S) {
    const L = Z.c(S), out = [];
    D.COMBOS.forEach(c => {
      if (!S.combos[c.id] && !S.knownCombos[c.id]) return;
      S.items.forEach(it => {
        if (kindOf(it) !== c.anchor || L.active.some(a => a.id === c.id && a.anchor === it.id)) return;
        const used = [], missing = [];
        c.needs.forEach(need => { const m = L.nb[it.id].find(o => kindOf(o) === need && used.indexOf(o.id) < 0); if (m) used.push(m.id); else missing.push(need); });
        if (missing.length !== 1 || missing[0].indexOf('fac:') !== 0) return;
        const f = missing[0].slice(4); if (!S.research['fac:' + f]) return;
        const free = [], seen = {};
        Z.cells(it).forEach(cell => DIRS.forEach(d => { const q = cell[0] + d[0], r = cell[1] + d[1], k = q + ',' + r; if (seen[k] || L.occ[k] || !Z.inLand(S, q, r)) return; seen[k] = 1; free.push([q, r]); }));
        if (free.length) out.push({ combo: c.id, fac: f, anchor: it.id, cells: free });
      });
    });
    return out;
  };

  // ---------- derived numbers ----------
  Z.refresh = function (S) {
    const L = Z.layout(S), nb = L.nb, byId = L.byId, active = L.active;
    const comboDraw = {}, comboSpend = {}, counted = {}; let crowd = 0, rpMult = 0;
    active.forEach(a => {
      const c = D.COMBOS.find(x => x.id === a.id);
      if (c.draw) { comboDraw[a.anchor] = (comboDraw[a.anchor] || 0) + c.draw; if (c.both) a.members.forEach(m => { comboDraw[m] = (comboDraw[m] || 0) + c.draw; }); }
      if (c.spend) { comboSpend[a.anchor] = (comboSpend[a.anchor] || 0) + c.spend; a.members.forEach(m => { if (D.FAC[byId[m].t] && D.FAC[byId[m].t].spend) comboSpend[m] = (comboSpend[m] || 0) + c.spend; }); }
      if (!counted[c.id]) { counted[c.id] = 1; if (c.crowd) crowd += c.crowd; if (c.rpMult) rpMult += c.rpMult; }
      if (!S.combos[c.id]) {
        S.combos[c.id] = true; S.knownCombos[c.id] = true; S.rp += 10; addRep(S, 10);
        news(S, 'Combo discovered: ' + c.name + '!', 'good'); ev(S, 'combo', { id: c.id });
        report(S, { type: 'combo', id: c.id, anchor: a.anchor });
      }
    });
    // staff on zoo duty
    const busy = Z.busyStaff(S); let care = 0, sci = 0, charm = 0;
    S.staff.forEach(s => { if (busy[s.id]) return; care += s.care; charm += s.charm; sci += s.sci * (s.role === 'researcher' ? 1.5 : 1); });
    const dutyDraw = 1 + care / 1000, dutySpend = 1 + charm / 800;
    // habitats
    const season = Z.season(S); const hab = {}; let total = 0, kioskHabs = 0;
    S.items.forEach(h => {
      if (h.k !== 'hab') return;
      const an = Z.inHab(S, h.id).map(a => Z.animalDraw(S, a)).sort((a, b) => b - a);
      const W = [1, 0.8, 0.65, 0.5, 0.4, 0.32, 0.26, 0.2];
      let base = 0; an.forEach((d, i) => { base += d * (W[i] || 0.2); });
      const kinds = {}; Z.inHab(S, h.id).forEach(a => { kinds[a.sp] = 1; });
      const variety = 1 + 0.08 * Math.min(3, Math.max(0, Object.keys(kinds).length - 1));
      const cnt = {}; let adj = 0, kiosk = false;
      nb[h.id].forEach(o => { if (o.k !== 'fac') return; const f = D.FAC[o.t]; if (f.learn) kiosk = true; if (!f.adjDraw) return; cnt[o.t] = (cnt[o.t] || 0) + 1; adj += f.adjDraw * Math.pow(0.5, cnt[o.t] - 1); });
      adj = Math.min(0.5, adj);
      if (kiosk) kioskHabs++;
      const cb = comboDraw[h.id] || 0;
      const buzz = Z.buzzNow(S, h);
      let seas = 1; if (season === 3 && (h.t === 'arctic' || h.t === 'mountain')) seas = 1.25; if (season === 1 && h.t === 'ocean') seas = 1.15;
      const draw = base * variety * (1 + 0.12 * (h.lvl - 1)) * (1 + adj + cb) * (1 + buzz) * seas * dutyDraw;
      hab[h.id] = { draw: draw, base: base, adj: adj, combo: cb, buzz: buzz, kiosk: kiosk, variety: variety, count: an.length };
      total += draw;
    });
    // shops
    const shops = []; let labs = 0, repw = 0, rpFlat = 0, vet = false;
    S.items.forEach(f => {
      if (f.k !== 'fac') return; const F = D.FAC[f.t];
      if (F.crowd) crowd += F.crowd; if (F.rpw) { rpFlat += F.rpw; if (f.t === 'lab') labs++; } if (F.repw) repw += F.repw; if (F.vet) vet = true;
      if (!F.spend) return;
      let m = 1 + (comboSpend[f.id] || 0); const seen = {};
      nb[f.id].forEach(o => { if (o.k === 'fac' && D.FAC[o.t].adjSpend && !seen[o.t]) { seen[o.t] = 1; m += D.FAC[o.t].adjSpend; } });
      shops.push({ id: f.id, t: f.t, v: F.spend * m });
    });
    shops.sort((a, b) => b.v - a.v); const idx = {}; let spend = 0; const shopVal = {};
    shops.forEach(s => { const i = idx[s.t] = (idx[s.t] || 0) + 1; const v = s.v / (1 + 0.3 * (i - 1)); shopVal[s.id] = v; spend += v; });
    spend *= (1 + 0.1 * (Z.rank(S) - 1)) * dutySpend;
    const rpw = (sci / 12 + rpFlat + kioskHabs * 1.5) * (1 + rpMult) * (1 + 0.1 * Math.min(5, S.ng));
    // costs
    let salaries = 0; S.staff.forEach(s => { salaries += Z.salary(s); });
    let upkeep = 0; S.animals.forEach(a => { upkeep += D.RARITY.upkeep[Z.sp(a).rarity]; });
    let maint = 0; S.items.forEach(i => { maint += i.k === 'hab' ? D.BIOMES[i.t].hab * 0.003 * i.lvl : D.FAC[i.t].cost * 0.004; });
    const mkt = (S.research['tech:mkt1'] ? 1 : 0) + (S.research['tech:mkt2'] ? 1 : 0) + (S.research['tech:mkt3'] ? 1 : 0);
    const boost = S.boost && S.boost.until > S.week ? S.boost.amt : 0;
    const visitors = (3.2 * Math.pow(total, 0.8) + 40) * D.SEASONS[season].mult * (1 + 0.05 * (Z.rank(S) - 1)) * (1 + 0.1 * mkt) * (1 + crowd) * (1 + boost);
    S._c = { nb: nb, active: active, occ: L.occ, hab: hab, total: total, spend: spend, shopVal: shopVal, crowd: crowd, rpw: rpw, repw: repw, vet: vet, salaries: salaries, upkeep: upkeep, maint: maint,
      visitors: visitors, income: visitors * (Z.ticket(S) + spend), cost: salaries + upkeep + maint, duty: { care: care, sci: sci, charm: charm } };
    return S._c;
  };
  Z.c = S => S._c || Z.refresh(S);

  // ---------- player actions ----------
  const fail = m => ({ ok: false, msg: m });
  const OK = { ok: true };
  function pay(S, n) { if (S.money < n) return false; S.money -= n; return true; }

  Z.build = function (S, kind, t, q, r, rot) {
    if (!Z.canPlace(S, kind, t, q, r, rot)) return fail('That spot is taken or outside your land.');
    if (kind === 'hab') {
      if (!S.regions[t]) return fail('You have not unlocked that region yet.');
      const c = Z.habBuildCost(S, t); if (!pay(S, c)) return fail('Not enough money ($' + c.toLocaleString() + ' needed).');
      S.items.push({ id: uid(S), k: 'hab', t: t, q: q, r: r, rot: rot || 0, lvl: 1, buzz: 0, buzzAt: 0, lastTheme: null, eventAt: -99 });
      ev(S, 'build', { k: 'hab', b: t, q: q, r: r, cost: c });
    } else {
      const F = D.FAC[t]; if (!S.research['fac:' + t]) return fail('Research that first.');
      if (F.limit && S.items.filter(i => i.k === 'fac' && i.t === t).length >= F.limit) return fail('You can only have ' + F.limit + ' of those.');
      if (!pay(S, F.cost)) return fail('Not enough money ($' + F.cost.toLocaleString() + ' needed).');
      S.items.push({ id: uid(S), k: 'fac', t: t, q: q, r: r, rot: 0 });
      ev(S, 'build', { k: 'fac', f: t, q: q, r: r, cost: F.cost });
    }
    Z.refresh(S); return OK;
  };
  Z.move = function (S, id, q, r, rot) {
    const it = Z.item(S, id); if (!it) return fail('Nothing there.');
    if (rot == null) rot = it.rot || 0;
    if (!Z.canPlace(S, it.k, it.t, q, r, rot, id)) return fail('That spot is taken or outside your land.');
    it.q = q; it.r = r; it.rot = rot; ev(S, 'move', { k: it.k, t: it.t, q: q, r: r }); Z.refresh(S); return OK;
  };
  Z.remove = function (S, id) {
    const it = Z.item(S, id); if (!it) return fail('Nothing there.');
    if (it.k === 'hab') {
      if (S.projects.some(p => p.hab === id || (p.type === 'breed' && Z.animal(S, p.a) && Z.animal(S, p.a).hab === id))) return fail('A project is running in this habitat.');
      Z.inHab(S, id).forEach(a => { a.hab = null; });
    }
    const refund = Math.round((it.k === 'hab' ? D.BIOMES[it.t].hab : D.FAC[it.t].cost) * 0.5);
    S.money += refund; S.items = S.items.filter(i => i.id !== id);
    ev(S, 'remove', { k: it.k, t: it.t, refund: refund }); Z.refresh(S); return { ok: true, refund: refund };
  };
  Z.upgrade = function (S, id) {
    const h = Z.item(S, id); if (!h || h.k !== 'hab') return fail('Pick a habitat.');
    if (h.lvl >= Z.habLevelCap(S)) return fail(h.lvl >= 5 ? 'Already at the top level.' : 'Research Habitat Design to go higher.');
    const c = Z.habUpgradeCost(h); if (!pay(S, c)) return fail('Not enough money ($' + c.toLocaleString() + ' needed).');
    h.lvl++; ev(S, 'upgrade', { b: h.t, lvl: h.lvl, cost: c }); Z.refresh(S); return OK;
  };
  Z.buyLand = function (S) {
    const L = D.LAND.find(l => l.cols > S.cols); if (!L) return fail('You own all the land.');
    if (Z.rank(S) < L.rank) return fail('Reach rank ' + L.rank + ' first.');
    if (!pay(S, L.cost)) return fail('Not enough money ($' + L.cost.toLocaleString() + ' needed).');
    S.cols = L.cols; ev(S, 'land', { cols: L.cols, cost: L.cost }); news(S, 'New land opened to the east.', 'good'); return OK;
  };
  Z.nextLand = S => D.LAND.find(l => l.cols > S.cols) || null;

  Z.buyAnimal = function (S, i) {
    const o = S.offers && S.offers.list[i]; if (!o) return fail('That offer is gone.');
    if (Z.holding(S).length >= Z.holdCap(S) && !S.items.some(h => h.k === 'hab' && h.t === Z.sp(o.a).biome && Z.inHab(S, h.id).length < Z.habCap(h))) return fail('No room. Build or upgrade a ' + D.BIOMES[Z.sp(o.a).biome].name + ' habitat, or clear the holding pen.');
    if (!pay(S, o.price)) return fail('Not enough money.');
    S.offers.list.splice(i, 1); S.animals.push(o.a); const h = house(S, o.a); discover(S, o.a, 'market');
    ev(S, 'buy', { sp: o.a.sp, price: o.price, avg: Math.round(Z.avg(o.a)) }); Z.refresh(S);
    return { ok: true, housed: !!h };
  };
  Z.sellAnimal = function (S, id) {
    const a = Z.animal(S, id); if (!a) return fail('No such animal.');
    if (Z.busyAnimals(S)[id]) return fail('That animal is in a breeding project.');
    const v = Z.animalValue(a); S.money += v; S.animals = S.animals.filter(x => x.id !== id);
    ev(S, 'sell', { sp: a.sp, price: v, avg: Math.round(Z.avg(a)), variant: a.variant }); Z.refresh(S); return { ok: true, price: v };
  };
  Z.moveAnimal = function (S, id, hid) {
    const a = Z.animal(S, id); if (!a) return fail('No such animal.');
    if (Z.busyAnimals(S)[id]) return fail('That animal is in a breeding project.');
    if (hid != null) {
      const h = Z.item(S, hid); if (!h || h.k !== 'hab') return fail('Pick a habitat.');
      if (h.t !== Z.sp(a).biome) return fail(Z.sp(a).name + ' needs a ' + D.BIOMES[Z.sp(a).biome].name + ' habitat.');
      if (Z.inHab(S, hid).length >= Z.habCap(h)) return fail('That habitat is full. Upgrade it for more room.');
    }
    a.hab = hid; Z.refresh(S); return OK;
  };
  Z.renameAnimal = function (S, id, name) { const a = Z.animal(S, id); if (a && name) a.name = String(name).slice(0, 16); return OK; };

  Z.hire = function (S, i) {
    const s = S.applicants[i]; if (!s) return fail('That applicant has left.');
    if (S.staff.length >= Z.staffCap(S)) return fail('Staff room is full. A higher zoo rank allows more staff.');
    const fee = Z.salary(s) * 8; if (!pay(S, fee)) return fail('Not enough money for the signing fee ($' + fee.toLocaleString() + ').');
    S.applicants.splice(i, 1); S.staff.push(s); ev(S, 'hire', { role: s.role, fee: fee, stats: [s.care, s.sci, s.exp, s.charm] }); Z.refresh(S); return OK;
  };
  Z.hireHeadhunt = function (S) {
    const s = S.headhunt; if (!s) return fail('Nobody is on offer.');
    if (S.staff.length >= Z.staffCap(S)) return fail('Staff room is full. A higher zoo rank allows more staff.');
    const fee = Z.headhuntFee(s); if (!pay(S, fee)) return fail('Not enough money for the signing fee ($' + fee.toLocaleString() + ').');
    S.headhunt = null; S.staff.push(s); ev(S, 'hire', { role: s.role, fee: fee, headhunt: true, stats: [s.care, s.sci, s.exp, s.charm] }); Z.refresh(S); return OK;
  };
  Z.jobOptions = function (S, s) {
    const mastered = (s.mastered || []).concat(s.lvl >= D.JOB_LEVEL ? [s.role] : []);
    return Object.keys(D.ROLES).filter(r => r !== s.role).map(r => {
      const R = D.ROLES[r]; let lock = '';
      if (R.adv && R.req.some(g => !g.some(x => mastered.indexOf(x) >= 0))) lock = 'Needs level ' + D.JOB_LEVEL + ' as ' + R.req.map(g => g.map(x => D.ROLES[x].name).join(' or ')).join(' and as ');
      return { role: r, lock: lock };
    });
  };
  Z.jobCost = s => 1500 * s.lvl;
  Z.changeJob = function (S, id, role) {
    const s = Z.staffer(S, id); if (!s) return fail('No such person.');
    if (Z.busyStaff(S)[id]) return fail('They are in the middle of a project.');
    if (s.lvl < D.JOB_LEVEL) return fail(s.name.split(' ')[0] + ' needs to reach level ' + D.JOB_LEVEL + ' in their current job first.');
    const o = Z.jobOptions(S, s).find(x => x.role === role); if (!o) return fail('Pick a different job.'); if (o.lock) return fail(o.lock + '.');
    const c = Z.jobCost(s); if (!pay(S, c)) return fail('Not enough money ($' + c.toLocaleString() + ' needed).');
    s.mastered = s.mastered || []; if (s.mastered.indexOf(s.role) < 0) s.mastered.push(s.role);
    const old = s.role, R = D.ROLES[role]; s.role = role; s.lvl = 1; s.xp = 0; s[R.main] = clamp(s[R.main] + 5, 1, 99);
    ev(S, 'jobchange', { from: old, to: role, cost: c }); news(S, s.name + ' is now a ' + R.name + '.', 'good'); Z.refresh(S); return OK;
  };
  Z.fire = function (S, id) {
    if (Z.busyStaff(S)[id]) return fail('They are in the middle of a project.');
    if (S.staff.length <= 1) return fail('You need at least one person.');
    const s = Z.staffer(S, id); S.staff = S.staff.filter(x => x.id !== id); ev(S, 'fire', { role: s.role, lvl: s.lvl }); Z.refresh(S); return OK;
  };
  Z.train = function (S, id, stat) {
    const s = Z.staffer(S, id); if (!s) return fail('No such person.');
    if (S.week - s.trainAt < 10) return fail(s.name.split(' ')[0] + ' can train again in ' + (10 - (S.week - s.trainAt)) + ' weeks.');
    const c = Z.trainCost(s); if (!pay(S, c)) return fail('Not enough money ($' + c.toLocaleString() + ' needed).');
    const gain = ri(3, 5); s[stat] = clamp(s[stat] + gain, 1, 99); s.trainAt = S.week;
    ev(S, 'train', { role: s.role, stat: stat, gain: gain, cost: c }); Z.refresh(S); return { ok: true, gain: gain };
  };
  function giveXp(S, s, n) {
    s.xp += n; let ups = 0;
    while (s.lvl < 30 && s.xp >= 40 + s.lvl * 30) {
      s.xp -= 40 + s.lvl * 30; s.lvl++; ups++;
      const R = D.ROLES[s.role];
      Object.keys(D.STATS).forEach(k => { s[k] = clamp(s[k] + (k === R.main ? ri(3, 5) : k === R.second ? ri(2, 3) + (R.adv ? 1 : 0) : ri(0, 2) + (R.adv ? 1 : 0)), 1, 99); });
    }
    if (ups) news(S, s.name + ' reached level ' + s.lvl + '.', '');
    return ups;
  }

  Z.researchList = function (S) {
    const out = [], rank = Z.rank(S);
    const regionRank = { jungle: 2, desert: 3, arctic: 5, mountain: 6, ocean: 7 };
    D.BIOME_ORDER.forEach(b => { const B = D.BIOMES[b]; if (B.secret || !B.rp) return; out.push({ id: 'region:' + b, group: 'Regions', name: B.region, desc: 'Send expeditions here and build ' + B.name + ' habitats.', rp: B.rp, done: !!S.regions[b], lock: rank < regionRank[b] ? 'Needs zoo rank ' + regionRank[b] : '' }); });
    D.FAC_ORDER.forEach(f => { const F = D.FAC[f]; if (!F.rp) return; out.push({ id: 'fac:' + f, group: F.landmark ? 'Landmarks' : 'Facilities', name: F.name, desc: F.desc, rp: F.rp, done: !!S.research['fac:' + f], lock: '' }); });
    D.THEME_ORDER.forEach(t => { const T = D.THEMES[t]; if (!T.rp) return; if (T.needs && !S.regions[T.needs]) return; out.push({ id: 'theme:' + t, group: 'Event themes', name: T.name, desc: 'A new theme for exhibit events.', rp: T.rp, done: !!S.research['theme:' + t], lock: '' }); });
    D.TECH_ORDER.forEach(t => { const T = D.TECH[t]; out.push({ id: 'tech:' + t, group: 'Know-how', name: T.name, desc: T.desc, rp: T.rp, done: !!S.research['tech:' + t], lock: T.req && !S.research['tech:' + T.req] ? 'Needs ' + D.TECH[T.req].name : '' }); });
    return out;
  };
  Z.doResearch = function (S, id) {
    const r = Z.researchList(S).find(x => x.id === id); if (!r) return fail('Unknown research.');
    if (r.done) return fail('Already known.'); if (r.lock) return fail(r.lock + '.');
    if (S.rp < r.rp) return fail('Not enough research points (' + r.rp + ' needed).');
    S.rp -= r.rp; S.research[id] = true;
    if (id.indexOf('region:') === 0) { S.regions[id.slice(7)] = true; }
    ev(S, 'research', { id: id, rp: r.rp }); news(S, 'Research complete: ' + r.name + '.', 'good'); Z.refresh(S); return OK;
  };

  // ---------- projects ----------
  function freeStaff(S, ids) { const b = Z.busyStaff(S); return ids.every(id => Z.staffer(S, id) && !b[id]); }
  Z.gearMult = S => 1 + (S.research['tech:gear1'] ? 0.15 : 0) + (S.research['tech:gear2'] ? 0.15 : 0);
  Z.teamPower = function (S, ids, budget) {
    let p = 0; ids.forEach(id => { const s = Z.staffer(S, id); if (s) p += s.exp + s.care * 0.4; });
    return p * Z.gearMult(S) * [1, 1.25, 1.5][budget || 0] * (ids.some(id => { const s = Z.staffer(S, id); return s && s.role === 'leader'; }) ? 1.15 : 1);
  };
  Z.expOdds = function (S, region, power) { // chance of each rarity, for the planning screen
    const ratio = power / D.BIOMES[region].diff, w = {}; let tot = 0;
    D.SPECIES_LIST.forEach(s => { if (s.biome !== region) return; const x = spWeight(S, s, ratio); w[s.rarity] = (w[s.rarity] || 0) + x; tot += x; });
    Object.keys(w).forEach(k => { w[k] = w[k] / tot; }); return { ratio: ratio, byRarity: w };
  };
  function spWeight(S, s, ratio) {
    const base = D.BIOMES[s.biome].secret ? s.rarity - 3 : s.rarity; // secret regions start at rarity 4
    let w = D.RARITY.weight[clamp(base, 1, 6)] * Math.pow(clamp(ratio, 0.4, 1.6), (base - 1) * 1.0);
    if (!S.book[s.id]) w *= 1.8;
    return w;
  }
  Z.startExpedition = function (S, region, ids, budget) {
    if (!S.regions[region]) return fail('That region is not unlocked.');
    if (!ids.length || ids.length > 3) return fail('Pick one to three people.');
    if (!freeStaff(S, ids)) return fail('Someone on that team is busy.');
    if (S.projects.filter(p => p.type === 'exp').length >= Z.maxExp(S)) return fail('Your convoy is already out.' + (Z.maxExp(S) < 2 ? ' Research Second Convoy to run two at once.' : ''));
    if (Z.holding(S).length > Z.holdCap(S)) return fail('The holding pen is over capacity. House or sell some animals first.');
    const c = Z.expCost(region, budget); if (!pay(S, c)) return fail('Not enough money ($' + c.toLocaleString() + ' needed).');
    const B = D.BIOMES[region]; const fast = ids.some(id => /explorer|leader/.test(Z.staffer(S, id).role)) ? 1 : 0;
    const p = { id: uid(S), type: 'exp', region: region, staff: ids.slice(), budget: budget, start: S.week, end: S.week + B.weeks - fast, power: Z.teamPower(S, ids, budget), cost: c };
    S.projects.push(p); S.yr.expeditions++; S.life.expeditions++;
    ev(S, 'exp_start', { region: region, team: ids.length, budget: budget, power: Math.round(p.power), ratio: +(p.power / B.diff).toFixed(2), cost: c });
    Z.refresh(S); return OK;
  };
  Z.breedCheck = function (S, aid, bid) {
    const a = Z.animal(S, aid), b = Z.animal(S, bid);
    if (!a || !b) return 'Pick two animals.';
    if (a.sp !== b.sp) return 'They must be the same species.';
    if (a.sex === b.sex) return 'You need a male and a female.';
    if (a.hab == null || a.hab !== b.hab) return 'Both must live in the same habitat.';
    if (Z.isJuv(S, a) || Z.isJuv(S, b)) return 'One of them is still too young.';
    const busy = Z.busyAnimals(S); if (busy[aid] || busy[bid]) return 'One of them is already paired up.';
    if (a.rest > S.week || b.rest > S.week) return 'One of them needs ' + (Math.max(a.rest, b.rest) - S.week) + ' more weeks of rest.';
    return '';
  };
  Z.breedWeeks = (S, sp) => Math.max(3, Math.round((4 + 2 * D.SPECIES[sp].rarity) * (S.research['tech:incub'] ? 0.75 : 1)));
  Z.breedChance = (S, lead) => clamp(0.65 + (lead.care + lead.sci * 0.5) / 250 + (Z.c(S).vet ? 0.08 : 0) + (lead.role === 'zoologist' ? 0.1 : 0), 0.3, 0.98);
  Z.breedBonus = (S, lead) => (lead.care + lead.sci * 0.5) / 40 + Z.genBonus(S) + (Z.c(S).vet ? 1 : 0) + (lead.role === 'zoologist' ? 2 : 0);
  Z.genBonus = S => (S.research['tech:gen1'] ? 1 : 0) + (S.research['tech:gen2'] ? 1 : 0) + (S.research['tech:gen3'] ? 1 : 0);
  Z.startBreeding = function (S, aid, bid, lead) {
    const why = Z.breedCheck(S, aid, bid); if (why) return fail(why);
    if (!freeStaff(S, [lead])) return fail('Pick someone who is free.');
    if (Z.holding(S).length > Z.holdCap(S)) return fail('The holding pen is over capacity. House or sell some animals first.');
    const a = Z.animal(S, aid);
    S.projects.push({ id: uid(S), type: 'breed', a: aid, b: bid, staff: [lead], start: S.week, end: S.week + Z.breedWeeks(S, a.sp) });
    ev(S, 'breed_start', { sp: a.sp, avgA: Math.round(Z.avg(a)), avgB: Math.round(Z.avg(Z.animal(S, bid))) }); Z.refresh(S); return OK;
  };
  Z.eventCheck = function (S, hid) {
    const h = Z.item(S, hid); if (!h || h.k !== 'hab') return 'Pick a habitat.';
    if (!Z.inHab(S, hid).length) return 'That habitat has no animals.';
    if (S.projects.some(p => p.type === 'event' && p.hab === hid)) return 'An event is already being prepared here.';
    if (S.week - h.eventAt < 12) return 'The animals need ' + (12 - (S.week - h.eventAt)) + ' more weeks of quiet before the next event.';
    return '';
  };
  Z.startEvent = function (S, hid, theme, lead) {
    const why = Z.eventCheck(S, hid); if (why) return fail(why);
    if (!S.research['theme:' + theme]) return fail('Research that theme first.');
    if (!freeStaff(S, [lead])) return fail('Pick someone who is free.');
    const c = Z.eventCost(S); if (!pay(S, c)) return fail('Not enough money ($' + c.toLocaleString() + ' needed).');
    const h = Z.item(S, hid);
    S.projects.push({ id: uid(S), type: 'event', hab: hid, theme: theme, staff: [lead], start: S.week, end: S.week + 3, cost: c, repeat: h.lastTheme === theme, pts: { animals: 0, habitat: 0, fun: 0, learning: 0 }, fired: 0 });
    ev(S, 'event_start', { b: h.t, theme: theme, cost: c }); Z.refresh(S); return OK;
  };
  Z.cancelProject = function (S, pid) {
    const p = S.projects.find(x => x.id === pid); if (!p) return fail('No such project.');
    S.projects = S.projects.filter(x => x.id !== pid); ev(S, 'cancel', { type: p.type }); Z.refresh(S); return OK;
  };

  function resolveExpedition(S, p) {
    const B = D.BIOMES[p.region], ratio = p.power / B.diff;
    const found = [], notes = [];
    const pool = D.SPECIES_LIST.filter(s => s.biome === p.region);
    const n = 1 + (Math.random() < Math.min(0.5, 0.15 * ratio) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const ws = pool.map(s => spWeight(S, s, ratio)); let r = Math.random() * ws.reduce((a, b) => a + b, 0), sp = pool[0];
      for (let j = 0; j < pool.length; j++) { r -= ws[j]; if (r <= 0) { sp = pool[j]; break; } }
      const own = S.animals.filter(x => x.sp === sp.id); let sex;
      if (own.length && own.every(x => x.sex === own[0].sex) && Math.random() < 0.75) sex = own[0].sex === 'M' ? 'F' : 'M';
      const a = makeAnimal(S, sp.id, clamp(10 + Math.min(ratio, 1.6) * 10 + rnd(0, 10) + D.BIOME_ORDER.indexOf(p.region) * 2, 8, 60), { sex: sex, variant: Math.random() < 0.02 + 0.01 * (p.budget || 0) });
      const isNew = !S.book[sp.id];
      S.animals.push(a); house(S, a); discover(S, a, 'expedition');
      found.push({ id: a.id, isNew: isNew });
    }
    const rp = Math.round(rnd(3, 8) * (1 + ratio) * (1 + S.week / 200)); S.rp += rp; notes.push('Field notes worth ' + rp + ' research.');
    if (!S.regions.paleo && S.fragments < 4 && Z.rank(S) >= 5 && ratio >= 0.8 && Math.random() < 0.10 + 0.04 * p.budget) {
      S.fragments++; notes.push('The team brought back a torn piece of an old map (' + S.fragments + ' of 4).'); ev(S, 'fragment', { n: S.fragments });
      if (S.fragments >= 4) { S.regions.paleo = true; report(S, { type: 'secret', region: 'paleo' }); news(S, 'The map is complete. It shows a valley no one has charted.', 'good'); ev(S, 'secret', { region: 'paleo' }); }
    }
    const ups = []; p.staff.forEach(id => { const s = Z.staffer(S, id); if (s && giveXp(S, s, 30 + B.diff / 2)) ups.push(s.name); });
    ev(S, 'exp_done', { region: p.region, ratio: +ratio.toFixed(2), found: found.map(f => { const a = Z.animal(S, f.id); return { sp: a.sp, avg: Math.round(Z.avg(a)), isNew: f.isNew, variant: a.variant }; }) });
    S.fx.push({ type: 'exp' });
    report(S, { type: 'expedition', region: p.region, found: found, notes: notes, ups: ups, staff: p.staff.slice() });
  }

  function resolveBreeding(S, p) {
    const a = Z.animal(S, p.a), b = Z.animal(S, p.b), lead = Z.staffer(S, p.staff[0]);
    if (!a || !b || !lead) return;
    a.rest = b.rest = S.week + 8;
    const sp = Z.sp(a); giveXp(S, lead, 25 + sp.rarity * 8);
    if (Math.random() > Z.breedChance(S, lead)) {
      ev(S, 'breed_fail', { sp: a.sp }); news(S, 'No baby this time for ' + a.name + ' and ' + b.name + '.', 'bad');
      report(S, { type: 'birth', fail: true, a: a.id, b: b.id, lead: lead.id }); return;
    }
    const kids = [], n = Math.random() < 0.18 ? 2 : 1;
    const bonus = Z.breedBonus(S, lead);
    let pv = 0.03 + Z.genBonus(S) * 0.02 + (lead.role === 'vet' || lead.role === 'zoologist' ? 0.03 : 0);
    if (a.variant && b.variant) pv = 0.85; else if (a.variant || b.variant) pv = 0.4;
    const firstBred = !S.book[a.sp].bred;
    for (let i = 0; i < n; i++) {
      const k = makeAnimal(S, a.sp, 50, { born: S.week, gen: Math.max(a.gen, b.gen) + 1, variant: Math.random() < pv });
      ['charm', 'vigor', 'wit'].forEach(st => { k[st] = clamp(Math.round((a[st] + b[st]) / 2 + rnd(-4, 4.5) + bonus), 1, 99); });
      S.animals.push(k);
      const h = Z.item(S, a.hab); k.hab = h && Z.inHab(S, h.id).length < Z.habCap(h) ? h.id : null;
      discover(S, k, 'bred'); kids.push(k.id);
      const av = Z.avg(k); if (av > S.yr.bestBaby) { S.yr.bestBaby = av; S.yr.bestBabyName = k.name + ' the ' + Z.animalLabel(k); }
      if (k.variant) S.flags.variantBred = true;
    }
    S.book[a.sp].bred = true; S.yr.births += n; S.life.births += n; S.fx.push({ type: 'birth', hab: a.hab });
    if (firstBred) addRep(S, 8 * sp.rarity);
    addRep(S, 2 * sp.rarity);
    ev(S, 'birth', { sp: a.sp, n: n, parents: [Math.round(Z.avg(a)), Math.round(Z.avg(b))], kids: kids.map(id => { const k = Z.animal(S, id); return { avg: Math.round(Z.avg(k)), variant: k.variant }; }) });
    news(S, (n > 1 ? 'Twins! ' : '') + 'A baby ' + sp.name + ' was born.', 'good');
    report(S, { type: 'birth', kids: kids, a: a.id, b: b.id, lead: lead.id, firstBred: firstBred });
  }

  Z.affinityKnown = (S, biome, theme) => S.aff[biome + '|' + theme];
  function eventRaw(S, p) {
    const h = Z.item(S, p.hab), lead = Z.staffer(S, p.staff[0]); if (!h || !lead) return null;
    const aff = D.THEMES[p.theme].aff[h.t], c = Z.c(S).hab[h.id], show = lead.role === 'showrunner' ? 1 : 0;
    const qs = Z.inHab(S, h.id).map(a => D.RARITY.factor[Z.sp(a).rarity] * 0.5 + Z.avg(a) / 99 * 0.5 + (a.variant ? 0.15 : 0)).sort((x, y) => y - x).slice(0, 3);
    let q = 0; qs.forEach(v => { q += v; }); q = qs.length ? q / Math.max(2, qs.length) : 0;
    return {
      animals: 1 + 9 * Math.min(1, q),
      habitat: 1 + 9 * Math.min(1, (h.lvl - 1) / 4 * 0.6 + Math.min(1, (c.adj + c.combo) / 0.6) * 0.4),
      fun: Math.min(10, (1 + 9 * Math.min(1, lead.charm / 100 * 0.55 + aff / 3 * 0.45)) * (p.repeat ? 0.75 : 1) + show),
      learning: Math.min(10, 1 + 9 * Math.min(1, (lead.sci * 0.5 + lead.care * 0.5) / 100 * 0.6 + aff / 3 * 0.25 + (c.kiosk ? 0.15 : 0)) + show)
    };
  }
  Z.eventNow = p => { const o = {}; Object.keys(p.pts).forEach(k => { o[k] = Math.round(p.pts[k]); }); return o; };
  function eventWeek(S, p) { // scores build up week by week while the event is prepared
    const raw = eventRaw(S, p), lead = Z.staffer(S, p.staff[0]); if (!raw || !lead) return;
    const gains = {}; Object.keys(raw).forEach(k => { const add = raw[k] / 3 * rnd(0.88, 1.12); p.pts[k] += add; gains[k] = add; });
    let fired = null;
    if (Math.random() < 0.2) { fired = lead.charm >= (lead.sci + lead.care) / 2 ? 'fun' : 'learning'; const b = rnd(0.6, 1.3); p.pts[fired] += b; gains[fired] += b; p.fired = (p.fired || 0) + 1; }
    S.fx.push({ type: 'event', hab: p.hab, gains: gains, fired: fired, who: lead.name.split(' ')[0] });
  }
  function resolveEvent(S, p) {
    const h = Z.item(S, p.hab), lead = Z.staffer(S, p.staff[0]); if (!h || !lead) return;
    const T = D.THEMES[p.theme], aff = T.aff[h.t], repeat = !!p.repeat;
    const sc = {}; let total = 0;
    Object.keys(p.pts).forEach(k => { sc[k] = clamp(Math.round(p.pts[k]), 1, 10); total += sc[k]; });
    const firstTime = S.aff[h.t + '|' + p.theme] == null;
    S.aff[h.t + '|' + p.theme] = aff;
    h.lastTheme = p.theme; h.eventAt = S.week; h.buzz = Math.pow(total / 40, 1.4) * 0.9; h.buzzAt = S.week;
    const rank = Z.rank(S);
    const repGain = Math.round(total * total / 30), money = Math.round(total * 60 * (1 + rank * 0.8) * (1 + S.week / 300)), rp = Math.round(total / 2 + rank);
    S.money += money; S.rp += rp; addRep(S, repGain); giveXp(S, lead, 40);
    S.yr.events++; S.life.events++; S.flags.firstEvent = true;
    if (total >= 30) S.flags.rev30 = true;
    const hof = total >= 34; if (hof) { S.flags.hof = true; S.life.hof++; }
    if (total > S.yr.bestReview) { S.yr.bestReview = total; S.yr.bestReviewName = T.name + ' at the ' + D.BIOMES[h.t].name + ' habitat'; }
    S.life.bestReview = Math.max(S.life.bestReview, total);
    ev(S, 'review', { b: h.t, theme: p.theme, aff: aff, sc: [sc.animals, sc.habitat, sc.fun, sc.learning], total: total, repeat: repeat, lead: lead.role });
    news(S, T.name + ' scored ' + total + '/40.', total >= 28 ? 'good' : '');
    report(S, { type: 'review', hab: h.id, biome: h.t, theme: p.theme, aff: aff, firstTime: firstTime, sc: sc, total: total, repeat: repeat, hof: hof, fired: p.fired || 0, money: money, rep: repGain, rp: rp, lead: lead.id });
  }

  // ---------- time ----------
  function checkVips(S) {
    const last = S.history[S.history.length - 1];
    const cond = {
      reporter: S.flags.firstEvent, critic: S.flags.rev30, filmcrew: Z.speciesCount(S) >= 15, photog: S.flags.variant,
      mayor: last && last.place <= 5, professor: Z.speciesCount(S) >= 35, royal: last && last.place === 1,
      legend: S.animals.some(a => Z.sp(a).biome === 'mythic')
    };
    D.VIPS.forEach(v => {
      if (S.vips[v.id] || !cond[v.id]) return;
      S.vips[v.id] = S.week; S.money += v.money; addRep(S, v.rep); S.boost = { amt: v.boost, until: S.week + 8 };
      ev(S, 'vip', { id: v.id }); news(S, v.name + ' visited the zoo.', 'good'); report(S, { type: 'vip', id: v.id });
    });
    if (!S.regions.mythic && S.regions.paleo && S.flags.hof && S.flags.variantBred && Z.speciesCount(S) >= 40 && S.animals.some(a => Z.sp(a).biome === 'paleo')) {
      S.regions.mythic = true; ev(S, 'secret', { region: 'mythic' }); news(S, 'A stranger left a sea chart at the gate. It marks islands that are on no other map.', 'good'); report(S, { type: 'secret', region: 'mythic' });
    }
  }
  Z.secretHints = function (S) {
    return [
      { name: 'The Lost Valley', done: !!S.regions.paleo, steps: [{ t: 'Collect 4 torn map pieces. Strong expedition teams sometimes bring one back once your zoo is rank 5.', ok: S.fragments >= 4, prog: Math.min(4, S.fragments) + '/4' }] },
      { name: 'The Misty Isles', done: !!S.regions.mythic, steps: S.regions.paleo ? [
        { t: 'House a creature from the Lost Valley.', ok: S.animals.some(a => Z.sp(a).biome === 'paleo') },
        { t: 'Hold an exhibit event that scores 34 or more.', ok: !!S.flags.hof },
        { t: 'Breed a rare variant.', ok: !!S.flags.variantBred },
        { t: 'Record 40 species.', ok: Z.speciesCount(S) >= 40, prog: Math.min(40, Z.speciesCount(S)) + '/40' }
      ] : [{ t: 'Something lies beyond the Lost Valley. Find the valley first.', ok: false }] }
    ];
  };

  // Rival curve: the top rival's rating in a given year. Tuned from test runs.
  Z.rivalRating = (r, y) => Math.round(205 * Math.pow(r.t, 1.33) * (0.55 + 0.45 * y / r.t));
  Z.rivalTop = y => Z.rivalRating(D.RIVALS[0], y);
  Z.rating = S => Math.round(S.yr.visitors / D.WPY / 4 + S.rep / 6 + Z.speciesCount(S) * 12 + S.trophies * 30);
  Z.awardBars = y => ({ exhibit: Math.min(36, 14 + y * 1.1), rarest: 60 + y * 7, breeder: Math.min(92, 20 + y * 3.6), explorer: y < 12 ? 3 : y < 17 ? 2 : 1 });

  function yearEnd(S) {
    const y = Z.year(S) - 1, rating = Z.rating(S);
    const table = D.RIVALS.map(r => ({ name: r.name, rating: Math.round(Z.rivalRating(r, y) * rnd(0.97, 1.03)) }));
    table.push({ name: S.zooName, rating: rating, me: true }); table.sort((a, b) => b.rating - a.rating);
    const place = table.findIndex(t => t.me) + 1;
    const bars = Z.awardBars(y); let best = null; S.animals.forEach(a => { if (!best || Z.prestige(a) > Z.prestige(best)) best = a; });
    const prize = Math.round(1500 * Math.pow(1.35, y) / 500) * 500;
    const awards = [
      { id: 'exhibit', name: 'Best Exhibit', won: S.yr.bestReview >= bars.exhibit, mine: S.yr.bestReview ? S.yr.bestReview + '/40, ' + S.yr.bestReviewName : 'No events held', bar: Math.ceil(bars.exhibit) + '/40' },
      { id: 'rarest', name: 'Rarest Animal', won: best && Z.prestige(best) >= bars.rarest, mine: best ? best.name + ' the ' + Z.animalLabel(best) + ' (' + Math.round(Z.prestige(best)) + ')' : 'No animals', bar: Math.round(bars.rarest) },
      { id: 'breeder', name: "Breeder's Cup", won: S.yr.bestBaby >= bars.breeder, mine: S.yr.bestBaby ? S.yr.bestBabyName + ' (' + Math.round(S.yr.bestBaby) + ')' : 'No births', bar: Math.round(bars.breeder) },
      { id: 'explorer', name: "Explorer's Medal", won: S.yr.newSpecies >= bars.explorer, mine: S.yr.newSpecies + ' new species', bar: bars.explorer + ' new species' },
      { id: 'zoo', name: 'Zoo of the Year', won: place === 1, mine: 'Placed ' + place + ' of ' + table.length, bar: 'First place' }
    ];
    let won = 0; awards.forEach(a => { if (a.won) { won++; S.trophies++; S.money += a.id === 'zoo' ? prize * 3 : prize; addRep(S, a.id === 'zoo' ? 150 : 30 + y * 3); } });
    const h = { year: y, rating: rating, place: place, of: table.length, awards: awards.filter(a => a.won).map(a => a.id), visitors: Math.round(S.yr.visitors), income: Math.round(S.yr.income), cost: Math.round(S.yr.cost),
      species: Z.speciesCount(S), bestReview: S.yr.bestReview, events: S.yr.events, expeditions: S.yr.expeditions, births: S.yr.births, money: Math.round(S.money), rep: S.rep, rank: Z.rank(S) };
    S.history.push(h);
    ev(S, 'yearend', h);
    report(S, { type: 'yearend', year: y, table: table, place: place, awards: awards, prize: prize, stats: h });
    S.yr = newYearStats(); S.show = null;
    if (y === D.RUN_YEARS && !S.finished) {
      S.finished = true; S.score = Z.finalScore(S);
      ev(S, 'final', { score: S.score.total, parts: S.score.parts });
      report(S, { type: 'final', score: S.score });
    }
  }
  const shopKinds = S => { const k = {}; S.items.forEach(i => { if (i.k === 'fac' && D.FAC[i.t].spend) k[i.t] = 1; }); return Object.keys(k).length; };
  function openDay(S) {
    const c = Z.c(S), crowd = Math.round(c.visitors * 2.5), rep = Math.round(8 + Math.sqrt(crowd) * 1.5), money = Math.round(crowd * c.spend);
    S.money += money; addRep(S, rep); ev(S, 'yearly', { id: 'openday', crowd: crowd, rep: rep, money: money });
    news(S, 'Spring Open Day drew ' + crowd.toLocaleString() + ' people.', 'good'); report(S, { type: 'yearly', id: 'openday', crowd: crowd, rep: rep, money: money });
  }
  function festival(S) {
    const c = Z.c(S), kinds = shopKinds(S), mult = 2 + kinds * 0.5, money = Math.round(c.visitors * c.spend * mult), rep = 5 + kinds * 4;
    S.money += money; addRep(S, rep); ev(S, 'yearly', { id: 'festival', kinds: kinds, rep: rep, money: money });
    news(S, 'The Summer Festival brought in $' + money.toLocaleString() + '.', 'good'); report(S, { type: 'yearly', id: 'festival', kinds: kinds, rep: rep, money: money });
  }
  Z.showScore = (S, a) => a[S.show.stat] + Z.sp(a).rarity * 5 + (a.variant ? 8 : 0);
  Z.enterShow = function (S, id) {
    const a = Z.animal(S, id); if (!S.show || !a) return fail('The show is over for this year.');
    const sc = Z.showScore(S, a), bar = S.show.bar, y = S.show.year;
    const medal = sc >= bar ? 'gold' : sc >= bar * 0.85 ? 'silver' : sc >= bar * 0.7 ? 'bronze' : null;
    const base = Math.round(1500 * Math.pow(1.35, y) / 500) * 500;
    const money = medal === 'gold' ? base * 1.5 : medal === 'silver' ? base * 0.6 : medal === 'bronze' ? base * 0.25 : 0;
    const rep = medal === 'gold' ? 60 + 4 * y : medal === 'silver' ? 30 + 2 * y : medal === 'bronze' ? 12 + y : 0;
    S.money += money; addRep(S, rep); if (medal === 'gold') S.trophies++;
    const res = { ok: true, medal: medal, score: sc, bar: Math.round(bar), stat: S.show.stat, money: money, rep: rep, animal: a.id };
    ev(S, 'show', { sp: a.sp, stat: S.show.stat, score: sc, bar: Math.round(bar), medal: medal || 'none' });
    news(S, a.name + (medal ? ' won ' + medal + ' at the Winter Animal Show.' : ' did not place at the Winter Animal Show.'), medal ? 'good' : '');
    S.show = null; return res;
  };
  Z.finalScore = function (S) {
    const last = S.history[S.history.length - 1] || { rating: 0, place: 12 };
    const parts = [
      ['Zoo rating', last.rating * 5], ['Final ranking', Math.max(0, 12 - last.place) * 2000], ['Species recorded', Z.speciesCount(S) * 600],
      ['Rare variants', Z.variantCount(S) * 900], ['Trophies', S.trophies * 1000], ['Combos found', Object.keys(S.combos).length * 400],
      ['Best exhibit review', S.life.bestReview * 250], ['Bank balance', Math.round(Math.min(60000, Math.sqrt(Math.max(0, S.money)) * 12))]
    ];
    let total = 0; parts.forEach(p => { total += p[1]; });
    return { total: Math.round(total), parts: parts };
  };

  Z.tick = function (S) {
    const c = Z.refresh(S); S.fx = [];
    const visitors = Math.round(c.visitors * rnd(0.95, 1.05));
    const income = Math.round(visitors * (Z.ticket(S) + c.spend)), cost = Math.round(c.cost);
    S.money += income - cost; S.rp += c.rpw;
    S.visitorsLast = visitors; S.incomeLast = income; S.costLast = cost;
    S.yr.visitors += visitors; S.yr.income += income; S.yr.cost += cost; S.life.income += income;
    addRep(S, visitors / 450 + c.repw);
    S.week++;
    S.projects.forEach(p => { if (p.type === 'event') eventWeek(S, p); });
    const done = S.projects.filter(p => p.end <= S.week);
    S.projects = S.projects.filter(p => p.end > S.week);
    done.forEach(p => { if (p.type === 'exp') resolveExpedition(S, p); else if (p.type === 'breed') resolveBreeding(S, p); else resolveEvent(S, p); });
    if (S.week % 5 === 2) callerArrive(S);
    if (S.week % 12 === 0) rollApplicants(S);
    const woy = S.week % D.WPY;
    if (woy === D.YEARLY.openday) openDay(S);
    if (woy === D.YEARLY.festival) festival(S);
    if (woy === D.YEARLY.show && S.animals.length) { S.show = { stat: pick(['charm', 'vigor', 'wit']), bar: Math.min(122, 30 + 4.8 * Z.year(S)), year: Z.year(S) }; ev(S, 'show_open', { stat: S.show.stat }); report(S, { type: 'show' }); }
    checkVips(S);
    if (S.week % D.WPY === 0) yearEnd(S);
    if (S.money < 0 && !S.flags.loan) { S.flags.loan = true; news(S, 'Money is below zero. A patron covers you for now, but projects cost money to start.', 'bad'); }
    if (S.money >= 0) S.flags.loan = false;
    Z.refresh(S);
  };

  Z.snapshot = function (S) { // compact picture of the zoo for the gameplay log
    const c = Z.c(S);
    return { week: S.week, year: Z.year(S), money: Math.round(S.money), rp: Math.round(S.rp), rep: S.rep, rank: Z.rank(S), visitors: S.visitorsLast, income: S.incomeLast, cost: S.costLast,
      species: Z.speciesCount(S), variants: Z.variantCount(S), animals: S.animals.length, holding: Z.holding(S).length, avgStat: S.animals.length ? Math.round(S.animals.reduce((t, a) => t + Z.avg(a), 0) / S.animals.length) : 0,
      habitats: S.items.filter(i => i.k === 'hab').map(h => h.t + h.lvl).join(','), facilities: S.items.filter(i => i.k === 'fac').length, cols: S.cols,
      staff: S.staff.map(s => s.role[0] + s.lvl).join(','), combos: Object.keys(S.combos).length, research: Object.keys(S.research).length, regions: Object.keys(S.regions).join(','),
      trophies: S.trophies, draw: Math.round(c.total), spend: +c.spend.toFixed(2), projects: S.projects.length, playSec: Math.round(S.play.sec), bySpeed: S.play.bySpeed.map(Math.round) };
  };
  Z.serialize = function (S) { const c = S._c; delete S._c; const s = JSON.stringify(S); S._c = c; return s; };
  Z.deserialize = function (str) { const S = JSON.parse(str); Z.refresh(S); return S; };

  if (typeof module !== 'undefined' && module.exports) module.exports = Z; else root.ZE = Z;
})(typeof window !== 'undefined' ? window : globalThis);
