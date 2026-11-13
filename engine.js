/* Wildside Zoo: game rules. No DOM here so it can run in tests. The full interface contract is in docs/API-rules.md. */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.ZD;
  const Z = {};
  Z.SAVE_VERSION = 3;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const MONTHS = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];
  const usd = n => '$' + Math.round(n).toLocaleString('en-US');
  const first = s => s.name.split(' ')[0];
  // round a computed price to a tidy number
  function price(n) { const m = n < 2000 ? 50 : n < 20000 ? 100 : n < 200000 ? 500 : 5000; return Math.max(m, Math.round(n / m) * m); }

  // ---------- small helpers ----------
  Z.year = S => Math.floor(S.week / D.WPY) + 1;
  Z.woy = S => S.week % D.WPY;
  Z.season = S => Math.floor(Z.woy(S) / 12);
  Z.dateStr = S => 'Year ' + Z.year(S) + ', ' + MONTHS[Math.floor(Z.woy(S) / 4)] + ' week ' + (Z.woy(S) % 4 + 1);
  Z.rank = S => { let r = 1; for (let i = 0; i < D.RANK_REP.length; i++) if (S.rep >= D.RANK_REP[i]) r = i + 1; return r; };
  Z.nextRankRep = S => D.RANK_REP[Z.rank(S)] || null;
  Z.rankGap = S => { const hi = Math.min(Z.rank(S), D.RANK_REP.length - 1); return D.RANK_REP[hi] - D.RANK_REP[hi - 1]; };
  Z.scale = S => D.SCALE[Z.rank(S)];                                  // money scale for optional spending
  Z.rpScale = S => Math.round(8 * Math.pow(1.45, Z.rank(S) - 1));     // research scale for optional spending
  Z.staffCap = S => D.STAFF_CAP[Z.rank(S)];
  Z.holdCap = S => S.research['tech:pen'] ? 12 : 6;
  Z.maxExp = S => S.research['tech:jeep'] ? 2 : 1;
  Z.habLevelCap = S => S.research['tech:hab5'] ? 5 : S.research['tech:hab4'] ? 4 : S.research['tech:hab3'] ? 3 : 2;
  Z.habCap = h => 4 + h.lvl + (D.SHAPES[h.t].length >= 5 ? 1 : 0);
  Z.sp = a => D.SPECIES[a.sp];
  Z.avg = a => (a.charm + a.vigor + a.wit) / 3;
  Z.isJuv = (S, a) => a.born != null && S.week - a.born < 16;
  Z.isSick = (S, a) => (a.sick || 0) > S.week;
  Z.grade = v => v >= 90 ? 'SS' : v >= 75 ? 'S' : v >= 58 ? 'A' : v >= 42 ? 'B' : v >= 26 ? 'C' : 'D';
  Z.animalDraw = (S, a) => Z.isSick(S, a) ? 0 : D.RARITY.draw[Z.sp(a).rarity] * (0.5 + Z.avg(a) / 100) * (a.variant ? 1.8 : 1) * (Z.isJuv(S, a) ? 1.35 : 1);
  Z.animalValue = a => Math.round(D.RARITY.value[Z.sp(a).rarity] * (0.5 + Z.avg(a) / 50) * (a.variant ? 3 : 1));
  Z.prestige = a => Z.sp(a).rarity * 20 + Z.avg(a) + (a.variant ? 30 : 0);
  Z.animalLabel = a => (a.variant ? Z.sp(a).variant + ' ' : '') + Z.sp(a).name;
  Z.item = (S, id) => S.items.find(i => i.id === id);
  Z.animal = (S, id) => S.animals.find(a => a.id === id);
  Z.staffer = (S, id) => S.staff.find(s => s.id === id);
  Z.project = (S, pid) => S.projects.find(p => p.id === pid);
  Z.inHab = (S, hid) => S.animals.filter(a => a.hab === hid);
  Z.holding = S => S.animals.filter(a => a.hab == null);
  Z.busyStaff = S => { const b = {}; S.projects.forEach(p => p.staff.forEach(id => { b[id] = p; })); return b; };
  Z.freeStaff = S => { const b = Z.busyStaff(S); return S.staff.filter(s => !b[s.id]); };
  Z.busyAnimals = S => { const b = {}; S.projects.forEach(p => { if (p.type === 'breed') { b[p.a] = p; b[p.b] = p; } }); return b; };
  Z.speciesCount = S => Object.keys(S.book).length;
  Z.variantCount = S => Object.values(S.book).filter(b => b.variant).length;
  Z.salary = s => Math.round(30 + s.lvl * 22 + (s.care + s.sci + s.exp + s.charm) * 0.6 + (s.mastered ? s.mastered.length * 80 : 0));
  Z.trainCost = s => Math.round(400 * Math.pow(s.lvl, 1.5) / 50) * 50;
  Z.trainWait = (S, s) => Math.max(0, 10 - (S.week - s.trainAt));      // weeks until this person can train again
  Z.ticketAt = rank => 6 + 1.0 * (rank - 1);                           // ticket price per visitor at a given zoo rank
  Z.ticket = S => Z.ticketAt(Z.rank(S));
  Z.buzzNow = (S, h) => h.buzz ? h.buzz * Math.max(0, 1 - (S.week - h.buzzAt) / 40) : 0;
  Z.modSum = (S, k) => (S.mods || []).reduce((t, m) => t + (m.k === k && m.until > S.week ? m.amt : 0), 0);
  const buildMult = S => 1 + clamp(Z.modSum(S, 'build'), -0.5, 0);
  Z.habBuildCost = (S, biome) => Math.round(D.BIOMES[biome].hab * buildMult(S));
  Z.facCost = (S, t) => Math.round(D.FAC[t].cost * buildMult(S));
  Z.habUpgradeCost = (h, S) => Math.round(D.BIOMES[h.t].hab * D.UPGRADE_MULT[h.lvl] * (S ? buildMult(S) : 1));
  Z.eventCost = S => 300 * Z.rank(S);
  Z.expCost = (region, budget) => Math.round(D.BIOMES[region].exp * [1, 1.6, 2.5][budget || 0]);
  Z.habName = (S, it) => it.k === 'hab' ? D.BIOMES[it.t].name + ' ' + (it.n || 1) : D.FAC[it.t].name;
  // rule lookups for the interface (so it never copies a rule)
  Z.regionRank = biome => D.REGION_RANK[biome] || 0;                    // zoo rank needed before a region can be researched
  Z.expFast = (S, ids) => (ids || []).some(id => { const s = Z.staffer(S, id); return s && D.FAST_ROLES.indexOf(s.role) >= 0; }) ? 1 : 0; // weeks saved
  Z.expWeeks = (S, region, ids) => D.BIOMES[region].weeks - Z.expFast(S, ids);
  Z.themeFit = (S, biome, theme) => { const v = S.aff[biome + '|' + theme]; return v == null ? null : v; }; // 0..3 once seen, else null
  Z.affinityKnown = Z.themeFit;
  Z.fitWord = fit => fit == null ? '' : D.AFF_WORD[fit];

  function ev(S, t, o) { S.elog.push(Object.assign({ w: S.week, t: t }, o || {})); }
  function news(S, msg, kind) { S.news.unshift({ w: S.week, msg: msg, kind: kind || '' }); if (S.news.length > 80) S.news.pop(); }
  function report(S, r) { S.reports.push(r); }
  function fx(S, o) { S.fx.push(o); }
  function addRep(S, n, src) {
    const before = Z.rank(S); S.rep += Math.round(n); src = src || 'other'; S.life.repBy[src] = (S.life.repBy[src] || 0) + Math.round(n);
    const after = Z.rank(S);
    if (after > before) {
      news(S, 'Now a ' + D.RANK_NAME[after] + ' (rank ' + after + ').', 'good');
      ev(S, 'rankup', { rank: after });
      report(S, { type: 'rankup', rank: after, name: D.RANK_NAME[after], unlocks: Z.rankUnlocks(after) });
    }
  }
  Z.addRep = addRep;
  // What reaching a rank opens up, as short lines for the rank-up moment.
  Z.rankUnlocks = function (rank) {
    const out = [];
    if (D.STAFF_CAP[rank] > D.STAFF_CAP[rank - 1]) out.push('Staff room for ' + D.STAFF_CAP[rank]);
    if (D.LAND.some(l => l.rank === rank)) out.push('More land for sale');
    Object.keys(D.REGION_RANK).forEach(b => { if (D.REGION_RANK[b] === rank) out.push('Region: ' + D.BIOMES[b].region); });
    D.HIRE_TIERS.forEach(t => { if (t.rank === rank) out.push('Hiring: ' + t.name); });
    D.CAMPAIGNS.forEach(t => { if (t.rank === rank) out.push('Campaign: ' + t.name); });
    out.push('Tickets ' + usd(Z.ticketAt(rank)));
    return out;
  };
  const repChunk = (S, f) => Math.max(5, Math.round(Z.rankGap(S) * f));
  function gain(S, o) { // money, reputation and research from a one-off moment, with floor pop-ups
    if (o.money) { S.money += o.money; fx(S, { type: 'money', amt: o.money, gate: true }); }
    if (o.rep > 0) { addRep(S, o.rep, o.src); fx(S, { type: 'rep', amt: o.rep }); }
    if (o.rep < 0) { const floor = D.RANK_REP[Z.rank(S) - 1]; S.rep = Math.max(floor, S.rep + o.rep); fx(S, { type: 'rep', amt: o.rep }); } // a setback never costs a rank
    if (o.rp) { S.rp += o.rp; fx(S, { type: 'rp', amt: o.rp }); }
  }
  function addMod(S, k, amt, weeks, src) { const m = { k: k, amt: amt, until: S.week + weeks, src: src || '' }; S.mods.push(m); return m; }

  // ---------- creating things ----------
  function uid(S) { return S.nextId++; }
  function makeAnimal(S, spId, base, o) {
    o = o || {};
    const st = () => clamp(Math.round(base + rnd(-5, 5)), 1, 99);
    const used = {}; S.animals.forEach(a => { used[a.name] = 1; });
    let name = pick(D.ANIMAL_NAMES), tries = 0;
    while (used[name] && tries++ < 30) name = pick(D.ANIMAL_NAMES);
    if (used[name]) name = name + ' ' + (S.nextId % 97);
    return { id: uid(S), sp: spId, name: name, sex: o.sex || (Math.random() < 0.5 ? 'M' : 'F'), charm: st(), vigor: st(), wit: st(), variant: !!o.variant, gen: o.gen || 1, born: o.born == null ? null : o.born, hab: null, rest: 0, sick: 0 };
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
  function oppositeIfLonely(S, a) { // make pairs easier to find
    const own = S.animals.filter(x => x.sp === a.sp);
    if (own.length && own.every(x => x.sex === own[0].sex)) a.sex = own[0].sex === 'M' ? 'F' : 'M';
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
        oppositeIfLonely(S, a);
        list.push({ a: a, price: Math.round(Z.animalValue(a) * 2.2 / 50) * 50 });
      }
    }
    S.offers = { kind: kind, at: S.week, list: list, crates: kind === 'trader' ? 1 : 0 };
  }
  function callerArrive(S) {
    const n = S.callerN = (S.callerN || 0) + 1, kind = n % 4 === 2 ? 'headhunter' : n % 4 === 0 ? 'director' : 'trader';
    if (kind === 'headhunter') { S.headhunt = makeStaff(S, pick(BASIC), 22 + Z.rank(S) * 5); S.headhuntAt = S.week; } else rollOffers(S, kind);
    ev(S, 'caller', { kind: kind }); report(S, { type: 'caller', kind: kind });
  }
  // Callers standing at the gate right now (they stay 5 weeks; their offers stay open until the next one of that kind arrives).
  Z.callersHere = function (S) {
    const out = [];
    if (S.offers && S.week - S.offers.at < 5 && (S.offers.list.length || S.offers.crates)) out.push({ kind: S.offers.kind, since: S.offers.at, offers: S.offers.list.length, crates: S.offers.crates || 0 });
    if (S.headhunt && S.week - (S.headhuntAt || 0) < 5) out.push({ kind: 'headhunter', since: S.headhuntAt || 0, role: S.headhunt.role, name: S.headhunt.name });
    return out;
  };
  Z.headhuntFee = s => Z.salary(s) * 20;
  function discover(S, a, how) {
    let b = S.book[a.sp];
    const sp = Z.sp(a);
    if (!b) {
      b = S.book[a.sp] = { variant: false, bred: false, best: 0, at: S.week };
      S.yr.newSpecies++;
      addRep(S, 4 * sp.rarity * sp.rarity, 'species');
      S.rp += 3 * sp.rarity;
      ev(S, 'species', { sp: a.sp, how: how });
      news(S, 'New species: ' + sp.name + '.', 'good');
    }
    if (a.variant && !b.variant) { b.variant = true; S.flags.variant = true; addRep(S, 15 * sp.rarity, 'species'); news(S, 'Rare variant: ' + Z.animalLabel(a) + '.', 'good'); ev(S, 'variant', { sp: a.sp, how: how }); }
    b.best = Math.max(b.best, Math.round(Z.avg(a)));
  }
  // The best habitat with room for this animal: the preferred one first, then one holding a mate, then its own species, then most room.
  Z.bestHab = function (S, a, prefer) {
    const sp = Z.sp(a); let best = null, bv = -1;
    S.items.forEach(h => {
      if (h.k !== 'hab' || h.t !== sp.biome) return;
      const an = Z.inHab(S, h.id).filter(x => x.id !== a.id), room = Z.habCap(h) - an.length; if (room <= 0) return;
      const v = (h.id === prefer ? 100 : 0) + (an.some(x => x.sp === a.sp && x.sex !== a.sex) ? 20 : 0) + (an.some(x => x.sp === a.sp) ? 10 : 0) + room * 0.1;
      if (v > bv) { bv = v; best = h; }
    });
    return best;
  };
  function house(S, a, prefer) { const h = Z.bestHab(S, a, prefer); a.hab = h ? h.id : null; return a.hab; }
  function houseWaiting(S, biome) { let n = 0; Z.holding(S).forEach(a => { if ((!biome || Z.sp(a).biome === biome) && house(S, a)) n++; }); return n; }
  function randomSpecies(S, maxRarity) { return pick(D.SPECIES_LIST.filter(s => S.regions[s.biome] && !D.BIOMES[s.biome].secret && s.rarity <= maxRarity)); }

  Z.newGame = function (legacy, opts) {
    legacy = legacy || { runs: 0 }; opts = opts || {};
    const S = {
      v: Z.SAVE_VERSION, runId: 'run' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), zooName: opts.zooName || 'Wildside Zoo',
      ng: legacy.runs || 0, startedAt: Date.now(), week: 0, money: 20000 + Math.min(legacy.runs || 0, 5) * 6000, rp: 0, rep: 0, rows: D.START_ROWS,
      items: [], animals: [], staff: [], candidates: [], candAt: 0, projects: [], reports: [], news: [], elog: [],
      offers: null, headhunt: null, headhuntAt: 0, show: null, yearly: null, happening: null, hapAt: ri(5, 7), hapLast: [], mods: [], campaigns: {}, habN: {}, fx: [], callerN: 0,
      research: {}, regions: { savanna: true }, aff: Object.assign({}, legacy.aff || {}), combos: {}, knownCombos: Object.assign({}, legacy.combos || {}),
      book: {}, fragments: 0, flags: {}, vips: {}, trophies: 0, history: [], nextId: 1, finished: false, score: null,
      yr: newYearStats(), life: { events: 0, expeditions: 0, births: 0, income: 0, bestReview: 0, hof: 0, spent: 0, repBy: {} },
      visitorsLast: 0, incomeLast: 0, costLast: 0, play: { sec: 0, bySpeed: [0, 0, 0, 0] }
    };
    D.FAC_ORDER.forEach(f => { if (!D.FAC[f].rp) S.research['fac:' + f] = true; });
    D.THEME_ORDER.forEach(t => { if (!D.THEMES[t].rp) S.research['theme:' + t] = true; });
    const k = makeStaff(S, 'keeper', 16), x = makeStaff(S, 'explorer', 16);
    S.staff.push(k, x);
    if (opts.staff) { const c = JSON.parse(JSON.stringify(opts.staff)); c.id = uid(S); c.trainAt = -99; delete c.star; S.staff.push(c); }
    // starting layout: one savanna habitat and a snack stand just inside the entrance at the front
    const at = Z.fromOffset(3, D.GRID_H - 4);
    S.items.push(newHab(S, 'savanna', at[0], at[1], 0));
    S.items.push({ id: uid(S), k: 'fac', t: 'snack', q: at[0] + 2, r: at[1], rot: 0 });
    const hid = S.items[0].id;
    [['zebra', 'M'], ['zebra', 'F']].forEach(p => { const a = makeAnimal(S, p[0], 15, { sex: p[1] }); a.hab = hid; S.animals.push(a); discover(S, a, 'start'); });
    if (opts.animal) { const c = JSON.parse(JSON.stringify(opts.animal)); c.id = uid(S); c.rest = 0; c.sick = 0; c.born = null; S.animals.push(c); house(S, c); discover(S, c, 'legacy'); }
    S.rep = 0; S.rp = 5; S.news = []; S.elog = []; S.reports = []; S.yr = newYearStats();
    rollOffers(S, 'trader');
    news(S, 'Welcome to ' + S.zooName + '.', '');
    ev(S, 'start', { ng: S.ng, zoo: S.zooName });
    Z.refresh(S);
    return S;
  };
  function newYearStats() { return { visitors: 0, income: 0, cost: 0, bestReview: 0, bestReviewName: '', events: 0, expeditions: 0, births: 0, bestBaby: 0, bestBabyName: '', newSpecies: 0, spent: 0 }; }
  function newHab(S, t, q, r, rot) { const n = S.habN[t] = (S.habN[t] || 0) + 1; return { id: uid(S), k: 'hab', t: t, n: n, q: q, r: r, rot: rot || 0, lvl: 1, buzz: 0, buzzAt: 0, lastTheme: null, eventAt: -99 }; }

  // ---------- hex grid (pointy-top, axial q,r; offset columns 0..GRID_W-1, rows 0..GRID_H-1; row GRID_H-1 is the front) ----------
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  Z.DIRS = DIRS;
  Z.rot = function (q, r, n) { n = ((n % 6) + 6) % 6; for (let i = 0; i < n; i++) { const t = q; q = -r; r = t + r; } return [q, r]; };
  Z.cellsOf = (kind, t, q, r, rot) => (kind === 'hab' ? D.SHAPES[t] : [[0, 0]]).map(o => { const p = Z.rot(o[0], o[1], rot || 0); return [q + p[0], r + p[1]]; });
  Z.cells = it => Z.cellsOf(it.k, it.t, it.q, it.r, it.rot);
  Z.toCol = (q, r) => q + (r - (r & 1)) / 2;
  Z.fromOffset = (col, row) => [col - (row - (row & 1)) / 2, row];
  Z.inGrid = (q, r) => { const c = Z.toCol(q, r); return r >= 0 && r < D.GRID_H && c >= 0 && c < D.GRID_W; };
  Z.inLand = (S, q, r) => Z.inGrid(q, r) && r >= D.GRID_H - S.rows;
  const ENTRANCE = (() => { const a = Z.fromOffset(Math.floor(D.GRID_W / 2), D.GRID_H - 1); return { q: a[0], r: a[1] }; })();
  Z.entrance = S => ({ q: ENTRANCE.q, r: ENTRANCE.r });
  Z.isEntrance = (q, r) => q === ENTRANCE.q && r === ENTRANCE.r;
  Z.occupancy = function (S, ignoreId, items) { const g = {}; (items || S.items).forEach(it => { if (it.id === ignoreId) return; Z.cells(it).forEach(c => { g[c[0] + ',' + c[1]] = it.id; }); }); return g; };
  Z.canPlace = function (S, kind, t, q, r, rot, ignoreId) { const g = Z.occupancy(S, ignoreId); return Z.cellsOf(kind, t, q, r, rot).every(c => Z.inLand(S, c[0], c[1]) && !Z.isEntrance(c[0], c[1]) && !g[c[0] + ',' + c[1]]); };
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
        Z.cells(it).forEach(cell => DIRS.forEach(d => { const q = cell[0] + d[0], r = cell[1] + d[1], k = q + ',' + r; if (seen[k] || L.occ[k] || !Z.inLand(S, q, r) || Z.isEntrance(q, r)) return; seen[k] = 1; free.push([q, r]); }));
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
        S.combos[c.id] = true; S.knownCombos[c.id] = true; S.rp += 10; addRep(S, 10, 'combo');
        news(S, 'Combo found: ' + c.name + '!', 'good'); ev(S, 'combo', { id: c.id });
        report(S, { type: 'combo', id: c.id, anchor: a.anchor, members: a.members.slice() });
      }
    });
    // staff on zoo duty
    const busy = Z.busyStaff(S); let care = 0, sci = 0, charm = 0;
    S.staff.forEach(s => { if (busy[s.id]) return; care += s.care; charm += s.charm; sci += s.sci * (s.role === 'researcher' ? 1.5 : 1); });
    const dutyDraw = 1 + care / 1000, dutySpend = 1 + charm / 800;
    // habitats
    const season = Z.season(S); const hab = {}; let total = 0, rpAdj = 0;
    S.items.forEach(h => {
      if (h.k !== 'hab') return;
      const an = Z.inHab(S, h.id).map(a => Z.animalDraw(S, a)).sort((a, b) => b - a);
      const W = [1, 0.8, 0.65, 0.5, 0.4, 0.32, 0.26, 0.2];
      let base = 0; an.forEach((d, i) => { base += d * (W[i] || 0.2); });
      const kinds = {}; Z.inHab(S, h.id).forEach(a => { kinds[a.sp] = 1; });
      const variety = 1 + 0.08 * Math.min(3, Math.max(0, Object.keys(kinds).length - 1));
      const cnt = {}; let adj = 0, kiosk = false, hrp = 0;
      nb[h.id].forEach(o => { if (o.k !== 'fac') return; const f = D.FAC[o.t]; if (f.learn) kiosk = true; if (f.rpAdj) hrp = Math.max(hrp, f.rpAdj); if (!f.adjDraw) return; cnt[o.t] = (cnt[o.t] || 0) + 1; adj += f.adjDraw * Math.pow(0.5, cnt[o.t] - 1); });
      adj = Math.min(0.5, adj);
      rpAdj += hrp;
      const cb = comboDraw[h.id] || 0;
      const buzz = Z.buzzNow(S, h);
      let seas = 1; if (season === 3 && (h.t === 'arctic' || h.t === 'mountain')) seas = 1.25; if (season === 1 && h.t === 'ocean') seas = 1.15;
      const draw = base * variety * (1 + 0.12 * (h.lvl - 1)) * (1 + adj + cb) * (1 + buzz) * seas * dutyDraw;
      hab[h.id] = { draw: draw, base: base, adj: adj, combo: cb, buzz: buzz, kiosk: kiosk, variety: variety, count: an.length };
      total += draw;
    });
    // shops
    const shops = []; let repw = 0, rpFlat = 0, vet = false;
    S.items.forEach(f => {
      if (f.k !== 'fac') return; const F = D.FAC[f.t];
      if (F.crowd) crowd += F.crowd; if (F.rpw) rpFlat += F.rpw; if (F.repw) repw += F.repw; if (F.vet) vet = true;
      if (!F.spend) return;
      let m = 1 + (comboSpend[f.id] || 0); const seen = {};
      nb[f.id].forEach(o => { if (o.k === 'fac' && D.FAC[o.t].adjSpend && !seen[o.t]) { seen[o.t] = 1; m += D.FAC[o.t].adjSpend; } });
      shops.push({ id: f.id, t: f.t, v: F.spend * m });
    });
    shops.sort((a, b) => b.v - a.v); const idx = {}; let spend = 0; const shopVal = {};
    const shopMult = (1 + 0.1 * (Z.rank(S) - 1)) * dutySpend * (1 + clamp(Z.modSum(S, 'spend'), -0.3, 0.6));
    shops.forEach(s => { const i = idx[s.t] = (idx[s.t] || 0) + 1; const v = s.v / (1 + 0.3 * (i - 1)) * shopMult; shopVal[s.id] = v; spend += v; });
    const rpw = (sci / 12 + rpFlat + rpAdj) * (1 + rpMult) * (1 + 0.1 * Math.min(5, S.ng)) * (1 + clamp(Z.modSum(S, 'rp'), -0.6, 1));
    // costs
    let salaries = 0; S.staff.forEach(s => { salaries += Z.salary(s); });
    let upkeep = 0; S.animals.forEach(a => { upkeep += D.RARITY.upkeep[Z.sp(a).rarity]; });
    let maint = 0; S.items.forEach(i => { maint += i.k === 'hab' ? D.BIOMES[i.t].hab * 0.003 * i.lvl : D.FAC[i.t].cost * 0.004; });
    const costMult = 1 + clamp(Z.modSum(S, 'cost'), -0.5, 0.3); upkeep *= costMult; maint *= costMult;
    const mkt = (S.research['tech:mkt1'] ? 1 : 0) + (S.research['tech:mkt2'] ? 1 : 0) + (S.research['tech:mkt3'] ? 1 : 0);
    const boost = clamp(Z.modSum(S, 'visitors'), -0.4, 0.8);
    const visitors = (3.2 * Math.pow(total, 0.8) + 40) * D.SEASONS[season].mult * (1 + 0.05 * (Z.rank(S) - 1)) * (1 + 0.1 * mkt) * (1 + crowd) * (1 + boost);
    S._c = { nb: nb, active: active, occ: L.occ, hab: hab, total: total, spend: spend, shopVal: shopVal, crowd: crowd, boost: boost, rpw: rpw, repw: repw, vet: vet, salaries: salaries, upkeep: upkeep, maint: maint,
      visitors: visitors, ticket: Z.ticket(S), income: visitors * (Z.ticket(S) + spend), cost: salaries + upkeep + maint, duty: { care: care, sci: sci, charm: charm } };
    return S._c;
  };
  Z.c = S => S._c || Z.refresh(S);

  // ---------- player actions ----------
  const fail = m => ({ ok: false, msg: m });
  const OK = () => ({ ok: true });
  const need = c => fail('Not enough money (' + usd(c) + ').');
  function pay(S, n) { if (S.money < n) return false; S.money -= n; return true; }
  function spendOpt(S, n) { if (!pay(S, n)) return false; S.yr.spent += n; S.life.spent += n; return true; } // optional "ladder" spending, tracked for the log

  Z.build = function (S, kind, t, q, r, rot) {
    if (!Z.canPlace(S, kind, t, q, r, rot)) return fail('That spot is taken or off your land.');
    let it, housed = 0;
    if (kind === 'hab') {
      if (!S.regions[t]) return fail('Unlock that region first.');
      const c = Z.habBuildCost(S, t); if (!pay(S, c)) return need(c);
      it = newHab(S, t, q, r, rot); S.items.push(it);
      housed = houseWaiting(S, t);
      ev(S, 'build', { k: 'hab', b: t, q: q, r: r, cost: c });
    } else {
      const F = D.FAC[t]; if (!F || !S.research['fac:' + t]) return fail('Research that first.');
      if (F.limit && S.items.filter(i => i.k === 'fac' && i.t === t).length >= F.limit) return fail('Only ' + F.limit + ' allowed.');
      const c = Z.facCost(S, t); if (!pay(S, c)) return need(c);
      it = { id: uid(S), k: 'fac', t: t, q: q, r: r, rot: 0 }; S.items.push(it);
      ev(S, 'build', { k: 'fac', f: t, q: q, r: r, cost: c });
    }
    Z.refresh(S); return { ok: true, id: it.id, housed: housed };
  };
  Z.move = function (S, id, q, r, rot) {
    const it = Z.item(S, id); if (!it) return fail('Nothing there.');
    if (rot == null) rot = it.rot || 0;
    if (!Z.canPlace(S, it.k, it.t, q, r, rot, id)) return fail('That spot is taken or off your land.');
    it.q = q; it.r = r; it.rot = rot; ev(S, 'move', { k: it.k, t: it.t, q: q, r: r }); Z.refresh(S); return OK();
  };
  Z.remove = function (S, id) {
    const it = Z.item(S, id); if (!it) return fail('Nothing there.');
    let moved = [];
    if (it.k === 'hab') {
      if (S.projects.some(p => p.hab === id)) return fail('A project is running here.');
      moved = Z.inHab(S, id); moved.forEach(a => { a.hab = null; });
    }
    const refund = Math.round((it.k === 'hab' ? D.BIOMES[it.t].hab : D.FAC[it.t].cost) * 0.5);
    S.money += refund; S.items = S.items.filter(i => i.id !== id);
    moved.forEach(a => { house(S, a); }); // try the other habitats before the holding pen
    ev(S, 'remove', { k: it.k, t: it.t, refund: refund }); Z.refresh(S); return { ok: true, refund: refund };
  };
  Z.upgrade = function (S, id) {
    const h = Z.item(S, id); if (!h || h.k !== 'hab') return fail('Pick a habitat.');
    if (h.lvl >= Z.habLevelCap(S)) return fail(h.lvl >= 5 ? 'Already at the top level.' : 'Research Habitat Design first.');
    const c = Z.habUpgradeCost(h, S); if (!pay(S, c)) return need(c);
    h.lvl++; const housed = houseWaiting(S, h.t);
    ev(S, 'upgrade', { b: h.t, lvl: h.lvl, cost: c }); Z.refresh(S); return { ok: true, lvl: h.lvl, housed: housed };
  };
  Z.nextLand = S => D.LAND.find(l => l.rows > S.rows) || null;
  Z.buyLand = function (S) {
    const L = Z.nextLand(S); if (!L) return fail('You own all the land.');
    if (Z.rank(S) < L.rank) return fail('Reach rank ' + L.rank + ' first.');
    if (!pay(S, L.cost)) return need(L.cost);
    S.rows = L.rows; ev(S, 'land', { rows: L.rows, cost: L.cost }); news(S, 'New land opened at the back.', 'good'); Z.refresh(S); return { ok: true, rows: L.rows };
  };

  const roomFor = (S, a) => Z.holding(S).length < Z.holdCap(S) || !!Z.bestHab(S, a);
  Z.buyAnimal = function (S, i) {
    const o = S.offers && S.offers.list[i]; if (!o) return fail('That offer is gone.');
    if (!roomFor(S, o.a)) return fail('No room. Add ' + D.BIOMES[Z.sp(o.a).biome].name + ' space or clear the pen.');
    if (!pay(S, o.price)) return need(o.price);
    S.offers.list.splice(i, 1); S.animals.push(o.a); const h = house(S, o.a); discover(S, o.a, 'market');
    ev(S, 'buy', { sp: o.a.sp, price: o.price, avg: Math.round(Z.avg(o.a)) }); Z.refresh(S);
    return { ok: true, housed: !!h, hab: h, animal: o.a };
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
      if (h.t !== Z.sp(a).biome) return fail('Needs a ' + D.BIOMES[Z.sp(a).biome].name + ' habitat.');
      if (a.hab !== hid && Z.inHab(S, hid).length >= Z.habCap(h)) return fail('That habitat is full.');
    }
    a.hab = hid; Z.refresh(S); return OK();
  };
  // One-step housing: put an animal from the holding pen into the best habitat with room.
  Z.autoHouse = function (S, id) {
    const a = Z.animal(S, id); if (!a) return fail('No such animal.');
    if (a.hab != null) return { ok: true, hab: a.hab };
    if (!house(S, a)) return fail('No ' + D.BIOMES[Z.sp(a).biome].name + ' habitat has room.');
    Z.refresh(S); return { ok: true, hab: a.hab };
  };
  Z.autoHouseAll = function (S) {
    const moved = []; Z.holding(S).forEach(a => { if (house(S, a)) moved.push({ id: a.id, hab: a.hab }); });
    Z.refresh(S); return { ok: true, moved: moved, left: Z.holding(S).length };
  };
  Z.renameAnimal = function (S, id, name) {
    const a = Z.animal(S, id); name = String(name || '').trim().slice(0, 12);
    if (!a || !name) return fail('Pick a name.');
    a.name = name; return OK();
  };

  // ----- staff -----
  const hireCost = (S, T) => price(T.k * Z.scale(S));
  Z.hireTiers = S => D.HIRE_TIERS.map(T => ({ key: T.key, name: T.name, cost: hireCost(S, T), note: T.note, n: T.n, star: T.star, lock: T.rank && Z.rank(S) < T.rank ? 'Rank ' + T.rank : '' }));
  Z.advertise = function (S, i) {
    const T = D.HIRE_TIERS[i]; if (!T) return fail('Pick an advert.');
    if (T.rank && Z.rank(S) < T.rank) return fail('Needs zoo rank ' + T.rank + '.');
    if (S.staff.length >= Z.staffCap(S)) return fail('Staff room is full.');
    const c = hireCost(S, T); if (!spendOpt(S, c)) return need(c);
    const q = 8 + Z.rank(S) * 5 + T.q, roles = BASIC.slice().sort(() => Math.random() - 0.5);
    S.candidates = []; S.candAt = S.week;
    for (let n = 0; n < T.n; n++) {
      const star = Math.random() < T.star, s = makeStaff(S, roles[n % roles.length], q + ri(-3, 6) + (star ? 12 : 0));
      if (star) s.star = true;
      S.candidates.push(s);
    }
    ev(S, 'advertise', { tier: T.key, cost: c, stars: S.candidates.filter(s => s.star).length });
    return { ok: true, cost: c, candidates: S.candidates };
  };
  Z.hireCandidate = function (S, i) {
    const s = S.candidates[i]; if (!s) return fail('They have left.');
    if (S.staff.length >= Z.staffCap(S)) return fail('Staff room is full.');
    S.candidates.splice(i, 1); S.staff.push(s);
    ev(S, 'hire', { role: s.role, star: !!s.star, stats: [s.care, s.sci, s.exp, s.charm] }); Z.refresh(S); return { ok: true, staff: s };
  };
  Z.hireHeadhunt = function (S) {
    const s = S.headhunt; if (!s) return fail('Nobody is on offer.');
    if (S.staff.length >= Z.staffCap(S)) return fail('Staff room is full.');
    const fee = Z.headhuntFee(s); if (!pay(S, fee)) return need(fee);
    S.headhunt = null; S.staff.push(s); ev(S, 'hire', { role: s.role, fee: fee, headhunt: true, stats: [s.care, s.sci, s.exp, s.charm] }); Z.refresh(S); return { ok: true, staff: s };
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
    if (Z.busyStaff(S)[id]) return fail('They are on a project.');
    if (s.lvl < D.JOB_LEVEL) return fail(first(s) + ' needs level ' + D.JOB_LEVEL + ' first.');
    const o = Z.jobOptions(S, s).find(x => x.role === role); if (!o) return fail('Pick a different job.'); if (o.lock) return fail(o.lock + '.');
    const c = Z.jobCost(s); if (!pay(S, c)) return need(c);
    s.mastered = s.mastered || []; if (s.mastered.indexOf(s.role) < 0) s.mastered.push(s.role);
    const old = s.role, R = D.ROLES[role]; s.role = role; s.lvl = 1; s.xp = 0; s[R.main] = clamp(s[R.main] + 5, 1, 99);
    ev(S, 'jobchange', { from: old, to: role, cost: c }); news(S, s.name + ' is now a ' + R.name + '.', 'good'); Z.refresh(S); return OK();
  };
  Z.fire = function (S, id) {
    const s = Z.staffer(S, id); if (!s) return fail('No such person.');
    if (Z.busyStaff(S)[id]) return fail('They are on a project.');
    if (S.staff.length <= 1) return fail('You need at least one person.');
    S.staff = S.staff.filter(x => x.id !== id); ev(S, 'fire', { role: s.role, lvl: s.lvl }); Z.refresh(S); return OK();
  };
  Z.train = function (S, id, stat) {
    const s = Z.staffer(S, id); if (!s) return fail('No such person.');
    if (!D.STATS[stat]) return fail('Pick a skill.');
    if (Z.trainWait(S, s) > 0) return fail(first(s) + ' can train again in ' + Z.trainWait(S, s) + ' weeks.');
    const c = Z.trainCost(s); if (!pay(S, c)) return need(c);
    const sup = Math.random() < D.SUPER_CHANCE, gainN = ri(3, 5) * (sup ? 3 : 1), before = s[stat];
    s[stat] = clamp(s[stat] + gainN, 1, 99); s.trainAt = S.week;
    if (sup) fx(S, { type: 'super', staff: s.id });
    ev(S, 'train', { role: s.role, stat: stat, gain: gainN, sup: sup, cost: c }); Z.refresh(S);
    return { ok: true, gain: s[stat] - before, super: sup, stat: stat, skill: stat, value: s[stat], cost: c };
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

  // ----- research -----
  Z.researchList = function (S) {
    const out = [], rank = Z.rank(S);
    D.BIOME_ORDER.forEach(b => { const B = D.BIOMES[b]; if (B.secret || !B.rp) return; const rr = Z.regionRank(b); out.push({ id: 'region:' + b, group: 'Regions', name: B.region, desc: 'Expeditions and ' + B.name + ' habitats.', rp: B.rp, done: !!S.regions[b], lock: rank < rr ? 'Needs zoo rank ' + rr : '' }); });
    D.FAC_ORDER.forEach(f => { const F = D.FAC[f]; if (!F.rp) return; out.push({ id: 'fac:' + f, group: F.landmark ? 'Landmarks' : 'Facilities', name: F.name, desc: F.desc, rp: F.rp, done: !!S.research['fac:' + f], lock: '' }); });
    D.THEME_ORDER.forEach(t => { const T = D.THEMES[t]; if (!T.rp) return; if (T.needs && !S.regions[T.needs]) return; out.push({ id: 'theme:' + t, group: 'Event themes', name: T.name, desc: 'A new event theme.', rp: T.rp, done: !!S.research['theme:' + t], lock: '' }); });
    D.TECH_ORDER.forEach(t => { const T = D.TECH[t]; out.push({ id: 'tech:' + t, group: 'Know-how', name: T.name, desc: T.desc, rp: T.rp, done: !!S.research['tech:' + t], lock: T.req && !S.research['tech:' + T.req] ? 'Needs ' + D.TECH[T.req].name : '' }); });
    return out;
  };
  Z.doResearch = function (S, id) {
    const r = Z.researchList(S).find(x => x.id === id); if (!r) return fail('Unknown research.');
    if (r.done) return fail('Already known.'); if (r.lock) return fail(r.lock + '.');
    if (S.rp < r.rp) return fail('Not enough research (' + r.rp + ' needed).');
    S.rp -= r.rp; S.research[id] = true;
    if (id.indexOf('region:') === 0) { S.regions[id.slice(7)] = true; }
    ev(S, 'research', { id: id, rp: r.rp }); news(S, 'Research done: ' + r.name + '.', 'good'); Z.refresh(S); return OK();
  };

  // ----- money ladders: advertising campaigns -----
  const campCost = (S, C) => price(C.k * Z.scale(S));
  const campLeft = (S, C) => Math.max(0, (S.campaigns[C.key] || 0) - S.week);
  // One of each kind can run at a time. weeksLeft > 0 means that one is running now.
  Z.campaigns = S => D.CAMPAIGNS.map(C => ({ key: C.key, name: C.name, cost: campCost(S, C), vis: C.vis, weeks: C.weeks, rep: repChunk(S, C.rep), weeksLeft: campLeft(S, C), lock: C.rank && Z.rank(S) < C.rank ? 'Rank ' + C.rank : '', note: '+' + Math.round(C.vis * 100) + '% visitors, ' + C.weeks + ' weeks' }));
  Z.runCampaign = function (S, i) {
    const C = D.CAMPAIGNS[i]; if (!C) return fail('Pick a campaign.');
    if (C.rank && Z.rank(S) < C.rank) return fail('Needs zoo rank ' + C.rank + '.');
    if (campLeft(S, C)) return fail('Already running, ' + campLeft(S, C) + ' weeks left.');
    const c = campCost(S, C), rep = repChunk(S, C.rep); if (!spendOpt(S, c)) return need(c);
    S.campaigns[C.key] = S.week + C.weeks;
    addMod(S, 'visitors', C.vis, C.weeks, 'campaign'); gain(S, { rep: rep, src: 'campaign' });
    ev(S, 'campaign', { key: C.key, cost: c, rep: rep }); news(S, C.name + ' campaign started.', 'good'); Z.refresh(S);
    return { ok: true, cost: c, rep: rep, weeks: C.weeks, vis: C.vis };
  };

  // ----- mystery crate at the trader -----
  const crateOdds = S => D.CRATE_ODDS[clamp(Math.floor((Z.rank(S) - 1) / 2), 0, D.CRATE_ODDS.length - 1)];
  const crateBase = S => 12 + Z.rank(S) * 4;
  Z.crateInfo = function (S) {
    if (!S.offers || S.offers.kind !== 'trader' || !S.offers.crates) return null;
    const w = crateOdds(S), tot = w.reduce((a, b) => a + b, 0); let evv = 0;
    const odds = w.map((x, i) => { const p = x / tot; evv += p * D.RARITY.value[i + 1] * (0.5 + (crateBase(S) + 6) / 50); return { rarity: i + 1, name: D.RARITY.name[i + 1], p: p }; }).filter(o => o.p > 0);
    return { cost: price(Math.max(evv * 1.2, Z.scale(S))), odds: odds, left: S.offers.crates };
  };
  Z.openCrate = function (S) {
    const info = Z.crateInfo(S); if (!info) return fail('No crate on offer.');
    if (Z.holding(S).length >= Z.holdCap(S)) return fail('The holding pen is full.');
    if (!spendOpt(S, info.cost)) return need(info.cost);
    let r = Math.random(), rarity = info.odds[0].rarity;
    for (let i = 0; i < info.odds.length; i++) { r -= info.odds[i].p; if (r <= 0) { rarity = info.odds[i].rarity; break; } }
    let pool = D.SPECIES_LIST.filter(s => S.regions[s.biome] && !D.BIOMES[s.biome].secret && s.rarity === rarity);
    if (!pool.length) pool = D.SPECIES_LIST.filter(s => s.biome === 'savanna' && s.rarity <= rarity);
    const sp = pick(pool), a = makeAnimal(S, sp.id, crateBase(S) + ri(0, 12), { variant: Math.random() < 0.06 });
    oppositeIfLonely(S, a);
    const isNew = !S.book[sp.id];
    S.offers.crates--; S.animals.push(a); const h = house(S, a); discover(S, a, 'crate');
    ev(S, 'crate', { sp: a.sp, rarity: sp.rarity, cost: info.cost, avg: Math.round(Z.avg(a)), variant: a.variant }); Z.refresh(S);
    return { ok: true, animal: a, rarity: sp.rarity, isNew: isNew, variant: a.variant, housed: !!h, hab: h, cost: info.cost };
  };

  // ---------- projects ----------
  function freeStaff(S, ids) { const b = Z.busyStaff(S); return ids.every(id => Z.staffer(S, id) && !b[id]); }
  Z.gearMult = S => 1 + (S.research['tech:gear1'] ? 0.15 : 0) + (S.research['tech:gear2'] ? 0.15 : 0);
  Z.teamPower = function (S, ids, budget) {
    let p = 0; ids.forEach(id => { const s = Z.staffer(S, id); if (s) p += s.exp + s.care * 0.4; });
    return p * Z.gearMult(S) * [1, 1.25, 1.5][budget || 0] * (ids.some(id => { const s = Z.staffer(S, id); return s && s.role === 'leader'; }) ? 1.15 : 1);
  };
  Z.expOdds = function (S, region, power) { // chance of each rarity, for the planning screen. ratio = team strength against the region
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
    budget = budget || 0;
    if (!S.regions[region]) return fail('That region is not unlocked.');
    if (!ids || !ids.length || ids.length > 3) return fail('Pick one to three people.');
    if (!freeStaff(S, ids)) return fail('Someone on that team is busy.');
    if (S.projects.filter(p => p.type === 'expedition').length >= Z.maxExp(S)) return fail('Your convoy is already out.');
    if (Z.holding(S).length > Z.holdCap(S)) return fail('The holding pen is over capacity.');
    const c = Z.expCost(region, budget); if (!pay(S, c)) return need(c);
    const B = D.BIOMES[region], len = Z.expWeeks(S, region, ids);
    const p = { id: uid(S), type: 'expedition', region: region, staff: ids.slice(), budget: budget, start: S.week, end: S.week + len, power: Z.teamPower(S, ids, budget), cost: c, marks: [{ w: S.week + Math.max(1, Math.floor(len / 2)), k: 'mid' }], choice: null };
    S.projects.push(p); S.yr.expeditions++; S.life.expeditions++;
    ev(S, 'exp_start', { region: region, team: ids.length, budget: budget, power: Math.round(p.power), ratio: +(p.power / B.diff).toFixed(2), cost: c });
    Z.refresh(S); return { ok: true, pid: p.id };
  };
  Z.breedCheck = function (S, aid, bid) {
    const a = Z.animal(S, aid), b = Z.animal(S, bid);
    if (!a || !b) return 'Pick two animals.';
    if (a.sp !== b.sp) return 'They must be the same species.';
    if (a.sex === b.sex) return 'You need a male and a female.';
    if (a.hab == null || a.hab !== b.hab) return 'Both must live in the same habitat.';
    if (Z.isJuv(S, a) || Z.isJuv(S, b)) return 'One of them is still too young.';
    const busy = Z.busyAnimals(S); if (busy[aid] || busy[bid]) return 'One of them is already paired up.';
    if (a.rest > S.week || b.rest > S.week) return 'They need ' + (Math.max(a.rest, b.rest) - S.week) + ' more weeks of rest.';
    return '';
  };
  // Pairs in a habitat that could start breeding right now: [[maleOrFirstId, otherId], ...]
  Z.readyPairs = function (S, hid) {
    const an = Z.inHab(S, hid), out = [];
    for (let i = 0; i < an.length; i++) for (let j = i + 1; j < an.length; j++) if (!Z.breedCheck(S, an[i].id, an[j].id)) out.push([an[i].id, an[j].id]);
    return out;
  };
  Z.breedWeeks = (S, sp) => Math.max(3, Math.round((4 + 2 * D.SPECIES[sp].rarity) * (S.research['tech:incub'] ? 0.75 : 1)));
  Z.breedChance = (S, lead) => clamp(0.65 + (lead.care + lead.sci * 0.5) / 250 + (Z.c(S).vet ? 0.08 : 0) + (lead.role === 'zoologist' ? 0.1 : 0), 0.3, 0.98);
  Z.breedBonus = (S, lead) => (lead.care + lead.sci * 0.5) / 40 + Z.genBonus(S) + (Z.c(S).vet ? 1 : 0) + (lead.role === 'zoologist' ? 2 : 0);
  Z.genBonus = S => (S.research['tech:gen1'] ? 1 : 0) + (S.research['tech:gen2'] ? 1 : 0) + (S.research['tech:gen3'] ? 1 : 0);
  Z.startBreeding = function (S, aid, bid, lead) {
    const why = Z.breedCheck(S, aid, bid); if (why) return fail(why);
    if (!freeStaff(S, [lead])) return fail('Pick someone who is free.');
    if (Z.holding(S).length > Z.holdCap(S)) return fail('The holding pen is over capacity.');
    const a = Z.animal(S, aid), len = Z.breedWeeks(S, a.sp);
    const p = { id: uid(S), type: 'breed', a: aid, b: bid, hab: a.hab, staff: [lead], start: S.week, end: S.week + len, chance: 0, bonus: 0, pv: 0, marks: [{ w: S.week + Math.max(1, Math.floor(len / 2)), k: 'mid' }], choice: null };
    S.projects.push(p);
    ev(S, 'breed_start', { sp: a.sp, avgA: Math.round(Z.avg(a)), avgB: Math.round(Z.avg(Z.animal(S, bid))) }); Z.refresh(S); return { ok: true, pid: p.id };
  };
  Z.eventCheck = function (S, hid) {
    const h = Z.item(S, hid); if (!h || h.k !== 'hab') return 'Pick a habitat.';
    const an = Z.inHab(S, hid);
    if (!an.length) return 'That habitat has no animals.';
    if (an.every(a => Z.isSick(S, a))) return 'No animal here is well enough.';
    if (S.projects.some(p => p.type === 'event' && p.hab === hid)) return 'An event is already running here.';
    if (S.week - h.eventAt < 12) return 'The animals need ' + (12 - (S.week - h.eventAt)) + ' more quiet weeks.';
    return '';
  };
  Z.startEvent = function (S, hid, theme, lead) {
    const why = Z.eventCheck(S, hid); if (why) return fail(why);
    if (!S.research['theme:' + theme]) return fail('Research that theme first.');
    if (!freeStaff(S, [lead])) return fail('Pick someone who is free.');
    const c = Z.eventCost(S); if (!pay(S, c)) return need(c);
    const h = Z.item(S, hid);
    const p = { id: uid(S), type: 'event', hab: hid, theme: theme, staff: [lead], start: S.week, end: S.week + 3, cost: c, repeat: h.lastTheme === theme, pts: { animals: 0, habitat: 0, fun: 0, learning: 0 }, fired: 0, star: null, boost: null,
      marks: [{ w: S.week + 1, k: 'star' }, { w: S.week + 2, k: 'boost' }], choice: null };
    S.projects.push(p);
    ev(S, 'event_start', { b: h.t, theme: theme, cost: c }); Z.refresh(S); return { ok: true, pid: p.id };
  };
  Z.cancelProject = function (S, pid) {
    const p = Z.project(S, pid); if (!p) return fail('No such project.');
    const refund = p.type === 'expedition' ? Math.round(p.cost * 0.5) : 0;
    S.money += refund; S.projects = S.projects.filter(x => x.id !== pid); ev(S, 'cancel', { type: p.type, refund: refund }); Z.refresh(S); return { ok: true, refund: refund };
  };
  const PROJECT_NAME = { expedition: 'Expedition', breed: 'Breeding', event: 'Event' };
  // A plain summary of a running project for lists and the floor.
  Z.projectInfo = function (S, p) {
    const o = { id: p.id, type: p.type, name: PROJECT_NAME[p.type], hab: p.hab || null, staff: p.staff.slice(), weeksLeft: Math.max(0, p.end - S.week), progress: clamp((S.week - p.start) / Math.max(1, p.end - p.start), 0, 1), choice: !!p.choice };
    if (p.type === 'expedition') o.detail = D.BIOMES[p.region].region;
    else if (p.type === 'breed') { const a = Z.animal(S, p.a); o.detail = a ? Z.sp(a).name : ''; }
    else { o.detail = D.THEMES[p.theme].name; o.scores = Z.eventNow(p); }
    return o;
  };

  // ----- mid-point choices -----
  // A choice is { key, title, text, who, whoId, options:[{label, note?, cost?, costRp?, odds?}], def }. def is the safe option used if the player never answers.
  function makeChoice(S, p, k) {
    const lead = Z.staffer(S, p.staff[0]); if (!lead) return null;
    const base = { who: lead.role, whoId: lead.id };
    if (p.type === 'expedition') {
      const keys = ['tracks', 'guide', 'camp']; if (p.end - S.week >= 2) keys.push('river');
      const key = pick(keys);
      if (key === 'tracks') return Object.assign(base, { key: key, title: 'Fresh tracks', text: 'Something rare passed this way.', def: 1, options: [{ label: 'Follow them', note: 'Rarer find, or 1 week late', odds: 0.65 }, { label: 'Play safe' }] });
      if (key === 'guide') return Object.assign(base, { key: key, title: 'Local guide', text: 'A guide offers to help.', def: 1, options: [{ label: 'Hire the guide', note: 'Stronger team', cost: price(p.cost * 0.3) }, { label: 'No thanks' }] });
      if (key === 'camp') return Object.assign(base, { key: key, title: 'One more camp?', text: 'The team could stay longer.', def: 1, options: [{ label: 'Stay a week', note: '1 week late, 1 extra find' }, { label: 'Head home' }] });
      return Object.assign(base, { key: key, title: 'River crossing', text: 'A shortcut across the river.', def: 1, options: [{ label: 'Cross', note: 'Home 1 week sooner, or 1 week late', odds: 0.7 }, { label: 'Go around' }] });
    }
    if (p.type === 'breed') {
      const a = Z.animal(S, p.a); if (!a) return null;
      const r = Z.sp(a).rarity, key = pick(['vet', 'diet', 'watch']);
      if (key === 'vet') return Object.assign(base, { key: key, title: 'Call the vet?', text: 'A check-up would help.', def: 1, options: [{ label: 'Call the vet', note: 'Better odds, stronger baby', cost: price(D.RARITY.value[r] * (Z.c(S).vet ? 0.12 : 0.25)) }, { label: 'Wait and see' }] });
      if (key === 'diet') return Object.assign(base, { key: key, title: 'Special diet', text: 'The lab has a new feed mix.', def: 1, options: [{ label: 'Try it', note: 'Rare variant more likely', costRp: 5 + r * 5 }, { label: 'Skip it' }] });
      return Object.assign(base, { key: key, title: 'Night watch', text: first(lead) + ' offers to stay up.', def: 1, options: [{ label: 'Stay up', note: 'Stronger baby, or a tired keeper', odds: clamp(0.4 + lead.care / 150, 0.4, 0.9), skill: 'care', staff: lead.id }, { label: 'Get some sleep' }] });
    }
    if (k === 'star') {
      const an = Z.inHab(S, p.hab).filter(a => !Z.isSick(S, a)); if (!an.length) return null;
      const opts = Object.keys(D.STAT_SCORE).map(st => {
        const a = an.slice().sort((x, y) => y[st] - x[st])[0], g = starGain(a[st]), sc = D.STAT_SCORE[st];
        return { label: a.name, note: D.ANIMAL_STATS[st] + ' ' + a[st] + ': ' + D.CRITICS.find(c => c.key === sc).name + ' +' + g.toFixed(1), animal: a.id, stat: st, score: sc, gain: g };
      }).sort((x, y) => y.gain - x.gain);
      return Object.assign(base, { key: 'star', title: 'Pick the star', text: 'Who leads the show?', def: 0, options: opts });
    }
    const o1 = clamp(0.55 + lead.charm / 250, 0.55, 0.9), c1 = 3 + 2 * Z.rank(S);
    return Object.assign(base, { key: 'boost', title: 'A big idea', text: first(lead) + ' wants to try something.', def: 2, options: [
      { label: 'Go for it', note: '+1.5 to 2.5 points, flop -1', costRp: c1, odds: o1, skill: 'charm', staff: lead.id },
      { label: 'Go big', note: '+3 to 4 points, flop -2', costRp: Math.round(c1 * 2.5), odds: +(o1 - 0.2).toFixed(2), skill: 'charm', staff: lead.id },
      { label: 'No thanks' }] });
  }
  const starGain = stat => +clamp(0.8 + stat / 100, 0.8, 1.8).toFixed(1);
  function applyChoice(S, p, i, auto) {
    const c = p.choice, o = c && c.options[i]; if (!o) return fail('Pick an option.');
    if (o.cost && S.money < o.cost) return need(o.cost);
    if (o.costRp && S.rp < o.costRp) return fail('Not enough research (' + o.costRp + ' needed).');
    if (o.cost) spendOpt(S, o.cost);
    if (o.costRp) S.rp -= o.costRp;
    const win = o.odds == null || Math.random() < o.odds, lead = Z.staffer(S, p.staff[0]);
    let text = 'Carrying on as planned.', good = true;
    const k = c.key;
    if (k === 'tracks' && i === 0) { if (win) { p.luck = 1; p.power *= 1.25; text = 'The trail is warm. Something rare is close.'; } else { p.end++; good = false; text = 'The trail went cold. 1 week lost.'; } }
    else if (k === 'guide' && i === 0) { p.power *= 1.3; text = 'The guide knows every path.'; }
    else if (k === 'camp' && i === 0) { p.end++; p.extra = (p.extra || 0) + 1; text = 'One more week in the field.'; }
    else if (k === 'river' && i === 0) { if (win) { p.end = Math.max(S.week + 1, p.end - 1); text = 'Across safely. Home a week sooner.'; } else { p.end++; good = false; text = 'The water was too high. 1 week lost.'; } }
    else if (k === 'vet' && i === 0) { p.chance += 0.15; p.bonus += 2; text = 'The vet is pleased with them.'; }
    else if (k === 'diet' && i === 0) { p.pv += 0.08; text = 'They love the new feed.'; }
    else if (k === 'watch' && i === 0) { if (win) { p.bonus += 3; text = 'A calm night. All is well.'; } else { p.tired = true; good = false; text = 'A long night for nothing.'; } }
    else if (k === 'star') {
      p.star = { animal: o.animal, stat: o.stat, score: o.score, gain: o.gain }; p.pts[o.score] += o.gain;
      fx(S, { type: 'event', hab: p.hab, gains: { [o.score]: o.gain }, fired: null, who: o.label });
      text = o.label + ' takes centre stage.';
    } else if (k === 'boost' && i < 2) {
      const t = p.pts.fun <= p.pts.learning ? 'fun' : 'learning', amt = win ? (i === 0 ? rnd(1.5, 2.5) : rnd(3, 4)) : (i === 0 ? -1 : -2);
      p.pts[t] = Math.max(0, p.pts[t] + amt); p.boost = { good: win, score: t, amt: +amt.toFixed(1), big: i === 1 }; good = win;
      fx(S, { type: 'event', hab: p.hab, gains: { [t]: amt }, fired: win ? t : null, who: lead ? first(lead) : '' });
      text = win ? 'The crowd loved it!' : 'It fell a bit flat.';
    }
    p.choice = null;
    ev(S, 'choice', { type: p.type, key: k, i: i, auto: !!auto, good: good });
    Z.refresh(S);
    return { ok: true, text: text, good: good };
  }
  Z.resolveChoice = function (S, pid, i) {
    const p = Z.project(S, pid); if (!p || !p.choice) return fail('Nothing to decide.');
    return applyChoice(S, p, i, false);
  };
  function projectWeek(S, p) { // runs once a week for every project
    if (p.type === 'event') eventWeek(S, p);
    if (S.week >= p.end) return;
    const m = p.marks && p.marks[0];
    if (m && S.week >= m.w) {
      p.marks.shift();
      if (p.choice) applyChoice(S, p, p.choice.def, true);
      const c = makeChoice(S, p, m.k);
      if (c) { p.choice = c; report(S, { type: 'choice', pid: p.id }); fx(S, { type: 'choice', hab: p.hab || null, pid: p.id }); }
    }
  }

  function rollFind(S, pool, ratio) {
    const ws = pool.map(s => spWeight(S, s, ratio)); let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let j = 0; j < pool.length; j++) { r -= ws[j]; if (r <= 0) return pool[j]; }
    return pool[0];
  }
  function resolveExpedition(S, p) {
    const B = D.BIOMES[p.region], ratio = p.power / B.diff;
    const found = [], notes = [];
    const pool = D.SPECIES_LIST.filter(s => s.biome === p.region);
    const n = 1 + (Math.random() < Math.min(0.5, 0.15 * ratio) ? 1 : 0) + (p.extra || 0);
    for (let i = 0; i < n; i++) {
      let sp = rollFind(S, pool, ratio);
      if (p.luck && i === 0) { const sp2 = rollFind(S, pool, ratio); if (sp2.rarity > sp.rarity) sp = sp2; }
      const own = S.animals.filter(x => x.sp === sp.id); let sex;
      if (own.length && own.every(x => x.sex === own[0].sex) && Math.random() < 0.75) sex = own[0].sex === 'M' ? 'F' : 'M';
      const a = makeAnimal(S, sp.id, clamp(10 + Math.min(ratio, 1.6) * 10 + rnd(0, 10) + D.BIOME_ORDER.indexOf(p.region) * 2, 8, 60), { sex: sex, variant: Math.random() < 0.02 + 0.01 * (p.budget || 0) });
      const isNew = !S.book[sp.id];
      S.animals.push(a); const h = house(S, a); discover(S, a, 'expedition');
      found.push({ id: a.id, sp: a.sp, rarity: sp.rarity, isNew: isNew, variant: a.variant, charm: a.charm, vigor: a.vigor, wit: a.wit, hab: h });
    }
    const rp = Math.round(rnd(3, 8) * (1 + ratio) * (1 + S.week / 200)); S.rp += rp; notes.push('Field notes: +' + rp + ' research.');
    let fragment = 0;
    if (!S.regions.paleo && S.fragments < 4 && Z.rank(S) >= 5 && ratio >= 0.8 && Math.random() < 0.10 + 0.04 * p.budget) {
      S.fragments++; fragment = S.fragments; notes.push('A torn piece of an old map (' + S.fragments + ' of 4).'); ev(S, 'fragment', { n: S.fragments });
    }
    const ups = []; p.staff.forEach(id => { const s = Z.staffer(S, id); if (s && giveXp(S, s, 30 + B.diff / 2)) ups.push(s.name); });
    ev(S, 'exp_done', { region: p.region, ratio: +ratio.toFixed(2), found: found.map(f => ({ sp: f.sp, avg: Math.round((f.charm + f.vigor + f.wit) / 3), isNew: f.isNew, variant: f.variant })) });
    fx(S, { type: 'exp' });
    report(S, { type: 'expedition', region: p.region, found: found, rp: rp, fragment: fragment, notes: notes, ups: ups, staff: p.staff.slice() });
    if (fragment >= 4) { S.regions.paleo = true; report(S, { type: 'secret', region: 'paleo' }); news(S, 'The old map is complete.', 'good'); ev(S, 'secret', { region: 'paleo' }); }
  }

  function resolveBreeding(S, p) {
    const a = Z.animal(S, p.a), b = Z.animal(S, p.b), lead = Z.staffer(S, p.staff[0]);
    if (!a || !b || !lead) return;
    a.rest = b.rest = S.week + 8;
    const sp = Z.sp(a); if (!p.tired) giveXp(S, lead, 25 + sp.rarity * 8);
    const chance = clamp(Z.breedChance(S, lead) + (p.chance || 0), 0.3, 0.99);
    if (Math.random() > chance) {
      ev(S, 'breed_fail', { sp: a.sp }); news(S, 'No baby this time for ' + a.name + ' and ' + b.name + '.', 'bad');
      report(S, { type: 'birth', fail: true, a: a.id, b: b.id, lead: lead.id, sp: a.sp, chance: chance, kids: [] }); return;
    }
    const kids = [], n = Math.random() < 0.18 ? 2 : 1;
    const bonus = Z.breedBonus(S, lead) + (p.bonus || 0);
    let pv = 0.03 + Z.genBonus(S) * 0.02 + (lead.role === 'vet' || lead.role === 'zoologist' ? 0.03 : 0);
    if (a.variant && b.variant) pv = 0.85; else if (a.variant || b.variant) pv = 0.4;
    pv = Math.min(0.95, pv + (p.pv || 0));
    const firstBred = !S.book[a.sp].bred;
    for (let i = 0; i < n; i++) {
      const variant = Math.random() < pv;
      const k = makeAnimal(S, a.sp, 50, { born: S.week, gen: Math.max(a.gen, b.gen) + 1, variant: variant });
      const rolls = ['charm', 'vigor', 'wit'].map(st => {
        const par = (a[st] + b[st]) / 2, lucky = Math.random() < D.LUCKY_CHANCE;
        k[st] = clamp(Math.round(par + rnd(-4.5, 4) + bonus + (lucky ? ri(6, 10) : 0)), 1, 99);
        return { stat: st, parents: Math.round(par), value: k[st], delta: k[st] - Math.round(par), lucky: lucky };
      });
      S.animals.push(k);
      const h = house(S, k, a.hab); // the parents' habitat first, then any other of the same biome, then the holding pen
      discover(S, k, 'bred');
      kids.push({ id: k.id, sp: k.sp, sex: k.sex, name: k.name, rolls: rolls, variantChance: pv, variant: variant, hab: h });
      const av = Z.avg(k); if (av > S.yr.bestBaby) { S.yr.bestBaby = av; S.yr.bestBabyName = k.name + ' the ' + Z.animalLabel(k); }
      if (k.variant) S.flags.variantBred = true;
    }
    S.book[a.sp].bred = true; S.yr.births += n; S.life.births += n; fx(S, { type: 'birth', hab: a.hab });
    if (firstBred) addRep(S, 8 * sp.rarity, 'births');
    addRep(S, 2 * sp.rarity, 'births');
    ev(S, 'birth', { sp: a.sp, n: n, parents: [Math.round(Z.avg(a)), Math.round(Z.avg(b))], kids: kids.map(kk => { const k = Z.animal(S, kk.id); return { avg: Math.round(Z.avg(k)), variant: k.variant, lucky: kk.rolls.filter(r => r.lucky).length }; }) });
    news(S, (n > 1 ? 'Twins! ' : '') + 'A baby ' + sp.name + ' was born.', 'good');
    report(S, { type: 'birth', fail: false, kids: kids, a: a.id, b: b.id, lead: lead.id, sp: a.sp, chance: chance, twins: n > 1, firstBred: firstBred });
  }

  function eventRaw(S, p) {
    const h = Z.item(S, p.hab), lead = Z.staffer(S, p.staff[0]); if (!h || !lead) return null;
    const aff = D.THEMES[p.theme].aff[h.t], c = Z.c(S).hab[h.id], show = lead.role === 'showrunner' ? 1 : 0;
    const qs = Z.inHab(S, h.id).filter(a => !Z.isSick(S, a)).map(a => D.RARITY.factor[Z.sp(a).rarity] * 0.5 + Z.avg(a) / 99 * 0.5 + (a.variant ? 0.15 : 0)).sort((x, y) => y - x).slice(0, 3);
    let q = 0; qs.forEach(v => { q += v; }); q = qs.length ? q / Math.max(2, qs.length) : 0;
    return {
      animals: EVENT_FLOOR + (10 - EVENT_FLOOR) * Math.min(1, q),
      habitat: EVENT_FLOOR + (10 - EVENT_FLOOR) * Math.min(1, (h.lvl - 1) / 4 * 0.6 + Math.min(1, (c.adj + c.combo) / 0.6) * 0.4),
      fun: Math.min(10, (1 + 9 * Math.min(1, lead.charm / 100 * 0.55 + aff / 3 * 0.45)) * (p.repeat ? 0.75 : 1) + show),
      learning: Math.min(10, 1 + 9 * Math.min(1, (lead.sci * 0.5 + lead.care * 0.5) / 100 * 0.6 + aff / 3 * 0.25 + (c.kiosk ? 0.15 : 0)) + show)
    };
  }
  const EVENT_FLOOR = 1; // lowest possible Animals and Habitat score
  Z.eventNow = p => { const o = {}; Object.keys(p.pts).forEach(k => { o[k] = Math.round(p.pts[k]); }); return o; }; // scores so far while an event is prepared
  function eventWeek(S, p) { // scores build up week by week while the event is prepared
    const raw = eventRaw(S, p), lead = Z.staffer(S, p.staff[0]); if (!raw || !lead) return;
    const gains = {}; Object.keys(raw).forEach(k => { const add = raw[k] / 3 * rnd(0.88, 1.12); p.pts[k] += add; gains[k] = add; });
    let fired = null;
    if (Math.random() < 0.2) { fired = lead.charm >= (lead.sci + lead.care) / 2 ? 'fun' : 'learning'; const b = rnd(0.6, 1.3); p.pts[fired] += b; gains[fired] += b; p.fired = (p.fired || 0) + 1; }
    fx(S, { type: 'event', hab: p.hab, gains: gains, fired: fired, who: first(lead) });
  }
  function resolveEvent(S, p) {
    const h = Z.item(S, p.hab), lead = Z.staffer(S, p.staff[0]); if (!h || !lead) return;
    const T = D.THEMES[p.theme], aff = T.aff[h.t], repeat = !!p.repeat;
    const sc = {}; let total = 0;
    Object.keys(p.pts).forEach(k => { sc[k] = clamp(Math.round(p.pts[k]), 1, 10); total += sc[k]; });
    const critics = D.CRITICS.map(c => ({ key: c.key, name: c.name, score: sc[c.key] }));
    const firstTime = S.aff[h.t + '|' + p.theme] == null;
    S.aff[h.t + '|' + p.theme] = aff;
    h.lastTheme = p.theme; h.eventAt = S.week; h.buzz = Math.pow(total / 40, 1.4) * 0.9; h.buzzAt = S.week;
    const rank = Z.rank(S);
    const repGain = Math.round(total * total / D.REVIEW_REP_DIV), money = Math.round(total * 60 * (1 + rank * 0.8) * (1 + S.week / 300)), rp = Math.round(total / 2 + rank);
    S.money += money; S.rp += rp; addRep(S, repGain, 'reviews'); giveXp(S, lead, 40);
    S.yr.events++; S.life.events++; S.flags.firstEvent = true;
    if (total >= 30) S.flags.rev30 = true;
    const hof = total >= D.HOF_SCORE; if (hof) { S.flags.hof = true; S.life.hof++; }
    if (total > S.yr.bestReview) { S.yr.bestReview = total; S.yr.bestReviewName = T.name + ', ' + Z.habName(S, h); }
    S.life.bestReview = Math.max(S.life.bestReview, total);
    fx(S, { type: 'money', amt: money, hab: h.id }); fx(S, { type: 'buzz', hab: h.id });
    ev(S, 'review', { b: h.t, theme: p.theme, aff: aff, sc: [sc.animals, sc.habitat, sc.fun, sc.learning], total: total, repeat: repeat, lead: lead.role, star: p.star ? p.star.stat : null, boost: p.boost ? (p.boost.good ? 1 : -1) * (p.boost.big ? 2 : 1) : 0 });
    news(S, T.name + ' scored ' + total + '/40.', total >= 28 ? 'good' : '');
    report(S, { type: 'review', hab: h.id, biome: h.t, theme: p.theme, aff: aff, fitWord: D.AFF_WORD[aff], firstTime: firstTime, sc: sc, critics: critics, total: total, repeat: repeat, hof: hof, fired: p.fired || 0, star: p.star, boost: p.boost, money: money, rep: repGain, rp: rp, lead: lead.id });
  }

  // ---------- happenings (random events) ----------
  // Each entry: can(S) -> may it happen now; make(S) -> { text, hab?, options?, def?, d? } (no options = it has already happened);
  // done(S, h, i) -> [text, good] for the chosen option. Setbacks apply at once in make(); an option can only soften them.
  const habsWithAnimals = S => S.items.filter(h => h.k === 'hab' && Z.inHab(S, h.id).length);
  const HAP = {
    school: {
      make: S => { const d = { rep: repChunk(S, 0.03), money: price(0.6 * Z.scale(S)) }; return { text: 'A class is waiting at the gate.', d: d, def: 0, options: [{ label: 'Free tour', note: 'Reputation +' + d.rep }, { label: 'Sell tickets', note: '+' + usd(d.money) }] }; },
      done: (S, h, i) => { if (i === 0) { gain(S, { src: 'happenings', rep: h.d.rep, rp: 5 }); return ['The kids loved it.', true]; } gain(S, { money: h.d.money }); return ['A tidy bit of ticket money.', true]; }
    },
    donor: {
      make: S => { const d = { money: price(1.2 * Z.scale(S)), rp: 2 * Z.rpScale(S) }; return { text: 'A fan of the zoo wants to give.', d: d, def: 0, options: [{ label: 'Cash', note: '+' + usd(d.money) }, { label: 'Research grant', note: '+' + d.rp + ' research' }] }; },
      done: (S, h, i) => { if (i === 0) gain(S, { money: h.d.money }); else gain(S, { rp: h.d.rp }); return ['A generous gift.', true]; }
    },
    tv: {
      make: S => { const d = { cost: price(0.8 * Z.scale(S)) }; return { text: 'A TV crew wants to film here.', d: d, def: 0, options: [{ label: 'Short clip', note: '+10% visitors, 3 weeks' }, { label: 'Prime time', note: '+25% visitors, 5 weeks', cost: d.cost }] }; },
      done: (S, h, i) => { if (i === 0) addMod(S, 'visitors', 0.10, 3, 'tv'); else addMod(S, 'visitors', 0.25, 5, 'tv'); return [i ? 'The whole town saw it.' : 'A nice little clip.', true]; }
    },
    viral: {
      can: S => habsWithAnimals(S).length > 0,
      make: S => { const h = pick(habsWithAnimals(S)), a = pick(Z.inHab(S, h.id)); h.buzz = Math.max(Z.buzzNow(S, h), 0.5); h.buzzAt = S.week; fx(S, { type: 'buzz', hab: h.id }); return { text: 'A photo of ' + a.name + ' is everywhere.', hab: h.id, animal: a.id }; }
    },
    heat: {
      make: S => { const ice = S.items.some(i => i.k === 'fac' && i.t === 'icecream'), d = { amt: ice ? 0.4 : 0.25, rep: repChunk(S, 0.02) }; return { text: ice ? 'Ice cream is flying out.' : 'Everyone is thirsty.', d: d, def: 0, options: [{ label: 'Sell cold drinks', note: 'Shops +' + Math.round(d.amt * 100) + '%, 3 weeks' }, { label: 'Free water', note: 'Reputation +' + d.rep }] }; },
      done: (S, h, i) => { if (i === 0) { addMod(S, 'spend', h.d.amt, 3, 'heat'); return ['The tills are ringing.', true]; } gain(S, { src: 'happenings', rep: h.d.rep }); return ['People will remember that.', true]; }
    },
    stray: {
      make: S => { const sp = randomSpecies(S, Z.rank(S) >= 5 ? 3 : 2), a = makeAnimal(S, sp.id, 12 + Z.rank(S) * 2 + ri(0, 8)); oppositeIfLonely(S, a); const d = { rep: repChunk(S, 0.015) };
        return { text: 'Someone left a ' + sp.name + ' in a box.', d: d, newAnimal: a, def: 1, options: [{ label: 'Take it in', note: sp.name + ', free' }, { label: 'Find it a home', note: 'Reputation +' + d.rep }] }; },
      done: (S, h, i) => { if (i === 0) { const a = h.newAnimal; S.animals.push(a); house(S, a); discover(S, a, 'stray'); return [a.name + ' has a new home.', true]; } gain(S, { src: 'happenings', rep: h.d.rep }); return ['A good home was found.', true]; }
    },
    scholar: {
      make: S => { const s = pick(S.staff), d = { cost: price(0.5 * Z.scale(S)), rp: 3 * Z.rpScale(S), staff: s.id }; return { text: 'A scientist is visiting town.', d: d, def: 1, options: [{ label: 'Fund a study', note: '+' + d.rp + ' research', cost: d.cost }, { label: 'Staff seminar', note: first(s) + ' +2 ' + D.SKILL.sci.name, skill: 'sci', staff: s.id, gain: 2 }] }; },
      done: (S, h, i) => { if (i === 0) { gain(S, { rp: h.d.rp }); return ['The study paid off.', true]; } const s = Z.staffer(S, h.d.staff) || S.staff[0]; s.sci = clamp(s.sci + 2, 1, 99); return [first(s) + ' took a lot of notes.', true]; }
    },
    coins: {
      make: S => { const m = price(rnd(0.5, 1) * Z.scale(S)); gain(S, { money: m }); return { text: 'Old coins turned up in a flower bed. +' + usd(m) + '.' }; }
    },
    volunteers: {
      make: S => { addMod(S, 'cost', -0.3, 4, 'volunteers'); return { text: 'Helpers arrive. Upkeep is 30% lower for 4 weeks.' }; }
    },
    spring: {
      can: S => S.animals.some(a => a.rest > S.week),
      make: S => { S.animals.forEach(a => { a.rest = 0; }); return { text: 'Every resting pair is ready again.' }; }
    },
    mentor: {
      make: S => { const s = pick(S.staff), d = { cost: price(0.6 * Z.scale(S)), staff: s.id }; return { text: 'A retired keeper drops by.', d: d, def: 1, options: [{ label: 'Workshop', note: 'All staff +1 main skill', cost: d.cost }, { label: 'A quick chat', note: first(s) + ' gains experience' }] }; },
      done: (S, h, i) => { if (i === 0) { S.staff.forEach(s => { const k = D.ROLES[s.role].main; s[k] = clamp(s[k] + 1, 1, 99); }); return ['Everyone learned something.', true]; } const s = Z.staffer(S, h.d.staff) || S.staff[0]; giveXp(S, s, 40); return [first(s) + ' picked up a few tricks.', true]; }
    },
    sale: {
      make: S => { addMod(S, 'build', -0.25, 4, 'sale'); return { text: 'Building and upgrades are 25% off for 4 weeks.' }; }
    },
    feature: {
      make: S => { const r = repChunk(S, 0.03); gain(S, { src: 'happenings', rep: r }); return { text: 'The zoo made the cover. Reputation +' + r + '.' }; }
    },
    storm: {
      make: S => { const m = addMod(S, 'visitors', -0.25, 2, 'storm'), d = { cost: price(0.3 * Z.scale(S)), until: m.until }; return { text: 'Two wet weeks ahead.', d: d, def: 1, options: [{ label: 'Rent covers', note: 'Visitors -10%', cost: d.cost }, { label: 'Wait it out', note: 'Visitors -25%' }] }; },
      done: (S, h, i) => { if (i === 0) { S.mods.forEach(m => { if (m.src === 'storm' && m.until === h.d.until) m.amt = -0.10; }); return ['Dry paths, happy visitors.', true]; } return ['It will pass.', true]; }
    },
    cold: {
      can: S => S.animals.length >= 4 && coldPool(S).length > 0,
      make: S => { const a = pick(coldPool(S)); a.sick = S.week + 4; fx(S, { type: 'sick', hab: a.hab }); const d = { animal: a.id, cost: price(Z.animalValue(a) * (Z.c(S).vet ? 0.06 : 0.12) + 100) };
        return { text: a.name + ' the ' + Z.sp(a).name + ' is sneezing.', hab: a.hab, animal: a.id, d: d, def: 1, options: [{ label: 'Pay the vet', note: 'Back on show now', cost: d.cost }, { label: 'Let it rest', note: 'Off show for 4 weeks' }] }; },
      done: (S, h, i) => { const a = Z.animal(S, h.d.animal); if (i === 0) { if (a) a.sick = 0; return [(a ? a.name : 'It') + ' is right as rain.', true]; } return ['Rest is the best medicine.', true]; }
    },
    escape: {
      can: S => habsWithAnimals(S).length > 0,
      make: S => { const hb = pick(habsWithAnimals(S)), a = pick(Z.inHab(S, hb.id)), s = S.staff.slice().sort((x, y) => y.care - x.care)[0], d = { staff: s.id, up: repChunk(S, 0.02), down: repChunk(S, 0.01) };
        return { text: a.name + ' slipped out of the pen.', hab: hb.id, animal: a.id, d: d, def: 1, options: [{ label: 'Send ' + first(s), note: 'Reputation +' + d.up + ', or -' + d.down, odds: clamp(0.45 + s.care / 160, 0.45, 0.95), skill: 'care', staff: s.id }, { label: 'All hands', note: 'Safe. Shops -10% for a week' }] }; },
      done: (S, h, i, win) => { if (i === 0) { if (win) { gain(S, { src: 'happenings', rep: h.d.up }); return ['Coaxed back with a snack. People cheered.', true]; } gain(S, { rep: -h.d.down }); return ['Back safe, after a bit of a chase.', false]; } addMod(S, 'spend', -0.10, 1, 'escape'); return ['Back safe and sound.', true]; }
    },
    powercut: {
      make: S => { const m = addMod(S, 'rp', -0.5, 2, 'powercut'), d = { cost: price(0.2 * Z.scale(S)), until: m.until }; return { text: 'The lab lights are out.', d: d, def: 1, options: [{ label: 'Rent a generator', note: 'No loss', cost: d.cost }, { label: 'Use candles', note: 'Research halved, 2 weeks' }] }; },
      done: (S, h, i) => { if (i === 0) { S.mods = S.mods.filter(m => !(m.src === 'powercut' && m.until === h.d.until)); return ['Lights back on.', true]; } return ['A quiet fortnight in the lab.', true]; }
    }
  };
  function coldPool(S) { const ev = {}; S.projects.forEach(p => { if (p.hab) ev[p.hab] = 1; }); const busy = Z.busyAnimals(S); return S.animals.filter(a => a.hab != null && !ev[a.hab] && !busy[a.id] && !Z.isSick(S, a)); }
  function rollHappening(S, forceKey) {
    const keys = Object.keys(D.HAPPENINGS).filter(k => forceKey ? k === forceKey : S.hapLast.indexOf(k) < 0).filter(k => !HAP[k].can || HAP[k].can(S));
    if (!keys.length) return false;
    let r = Math.random() * keys.reduce((t, k) => t + D.HAPPENINGS[k].w, 0), key = keys[0];
    for (let i = 0; i < keys.length; i++) { r -= D.HAPPENINGS[keys[i]].w; if (r <= 0) { key = keys[i]; break; } }
    const M = D.HAPPENINGS[key], m = HAP[key].make(S);
    const h = { key: key, title: M.title, text: m.text, who: M.who || null, hab: m.hab || null, animal: m.animal || null, newAnimal: m.newAnimal || null, bad: !!M.bad, options: m.options || null, def: m.def == null ? 0 : m.def, at: S.week, d: m.d || null };
    S.happening = h; S.hapLast.push(key); if (S.hapLast.length > 5) S.hapLast.shift();
    ev(S, 'happening', { key: key }); news(S, M.title + ': ' + m.text, M.bad ? 'bad' : 'good');
    const rep = { type: 'happening', key: key, title: h.title, text: h.text, bad: h.bad };
    if (h.who) rep.who = h.who; if (h.hab) rep.hab = h.hab; if (h.animal) rep.animal = h.animal; if (h.newAnimal) rep.newAnimal = h.newAnimal; if (h.options) rep.options = h.options;
    report(S, rep);
    return true;
  }
  // For tests and for building the pop-up screens: force a moment to happen right now.
  Z.debug = {
    happening: (S, key) => { S.happening = null; return rollHappening(S, key); },
    caller: (S, kind) => { if (kind === 'headhunter') { S.headhunt = makeStaff(S, pick(BASIC), 22 + Z.rank(S) * 5); S.headhuntAt = S.week; } else rollOffers(S, kind); report(S, { type: 'caller', kind: kind }); return true; },
    yearly: (S, id) => { if (id === 'show') openShow(S); else yearlyPlan(S, id); return true; }
  };
  function applyHappening(S, i, auto) {
    const h = S.happening; if (!h || !h.options) return fail('Nothing to decide.');
    const o = h.options[i]; if (!o) return fail('Pick an option.');
    if (o.cost && S.money < o.cost) return need(o.cost);
    if (o.costRp && S.rp < o.costRp) return fail('Not enough research (' + o.costRp + ' needed).');
    if (o.cost) spendOpt(S, o.cost);
    if (o.costRp) S.rp -= o.costRp;
    const win = o.odds == null || Math.random() < o.odds;
    const res = HAP[h.key].done(S, h, i, win);
    S.happening = null;
    ev(S, 'happening_choice', { key: h.key, i: i, auto: !!auto, good: res[1] });
    Z.refresh(S);
    return { ok: true, text: res[0], good: res[1] };
  }
  Z.resolveHappening = (S, i) => applyHappening(S, i, false);

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
      S.vips[v.id] = S.week; S.money += v.money; addRep(S, v.rep, 'vips'); addMod(S, 'visitors', v.boost, 8, 'vip');
      ev(S, 'vip', { id: v.id }); news(S, v.name + ' visited the zoo.', 'good'); report(S, { type: 'vip', id: v.id, money: v.money, rep: v.rep, boost: v.boost });
    });
    if (!S.regions.mythic && S.regions.paleo && S.flags.hof && S.flags.variantBred && Z.speciesCount(S) >= 40 && S.animals.some(a => Z.sp(a).biome === 'paleo')) {
      S.regions.mythic = true; ev(S, 'secret', { region: 'mythic' }); news(S, 'A stranger left a sea chart at the gate.', 'good'); report(S, { type: 'secret', region: 'mythic' });
    }
  }
  Z.secretHints = function (S) {
    return [
      { name: 'The Lost Valley', done: !!S.regions.paleo, steps: [{ t: 'Collect 4 torn map pieces. Strong expedition teams sometimes bring one back once your zoo is rank 5.', ok: S.fragments >= 4, prog: Math.min(4, S.fragments) + '/4' }] },
      { name: 'The Misty Isles', done: !!S.regions.mythic, steps: S.regions.paleo ? [
        { t: 'House a creature from the Lost Valley.', ok: S.animals.some(a => Z.sp(a).biome === 'paleo') },
        { t: 'Hold an exhibit event that scores ' + D.HOF_SCORE + ' or more.', ok: !!S.flags.hof },
        { t: 'Breed a rare variant.', ok: !!S.flags.variantBred },
        { t: 'Record 40 species.', ok: Z.speciesCount(S) >= 40, prog: Math.min(40, Z.speciesCount(S)) + '/40' }
      ] : [{ t: 'Something lies beyond the Lost Valley. Find the valley first.', ok: false }] }
    ];
  };

  // Rival curve: the top rival's rating in a given year. Tuned from test runs.
  Z.rivalRating = (r, y) => Math.round(220 *Math.pow(r.t, 1.33) * (0.55 + 0.45 * y / r.t));
  Z.rivalTop = y => Z.rivalRating(D.RIVALS[0], y);
  Z.rating = S => Math.round(S.yr.visitors / D.WPY / 4 + S.rep / 6 + Z.speciesCount(S) * 12 + S.trophies * 30);
  // The league table as it stands today (the year-end table adds a little luck to the rivals). yearF = years played so far.
  Z.rankings = function (S) {
    const yearF = S.week / D.WPY, woy = Z.woy(S);
    const mine = Math.round((woy ? S.yr.visitors / woy : S.visitorsLast) / 4 + S.rep / 6 + Z.speciesCount(S) * 12 + S.trophies * 30);
    const table = D.RIVALS.map(r => ({ name: r.name, rating: Z.rivalRating(r, yearF) }));
    table.push({ name: S.zooName, rating: mine, me: true }); table.sort((a, b) => b.rating - a.rating);
    return { table: table, place: table.findIndex(t => t.me) + 1, of: table.length };
  };
  Z.awardBars = y => ({ exhibit: Math.min(36, 14 + y * 1.1), rarest: 60 + y * 7, breeder: Math.min(92, 20 + y * 3.6), explorer: y < 12 ? 3 : y < 17 ? 2 : 1 });
  Z.prizeBase = y => Math.round(1500 * Math.pow(1.35, y) / 500) * 500;

  function yearEnd(S) {
    const y = Z.year(S) - 1, rating = Z.rating(S);
    const table = D.RIVALS.map(r => ({ name: r.name, rating: Math.round(Z.rivalRating(r, y) * rnd(0.97, 1.03)) }));
    table.push({ name: S.zooName, rating: rating, me: true }); table.sort((a, b) => b.rating - a.rating);
    const place = table.findIndex(t => t.me) + 1;
    const bars = Z.awardBars(y); let best = null; S.animals.forEach(a => { if (!best || Z.prestige(a) > Z.prestige(best)) best = a; });
    const prize = Z.prizeBase(y);
    const awards = [
      { id: 'exhibit', name: 'Best Exhibit', won: S.yr.bestReview >= bars.exhibit, mine: S.yr.bestReview ? S.yr.bestReview + '/40, ' + S.yr.bestReviewName : 'No events held', bar: Math.ceil(bars.exhibit) + '/40' },
      { id: 'rarest', name: 'Rarest Animal', won: !!best && Z.prestige(best) >= bars.rarest, mine: best ? best.name + ' the ' + Z.animalLabel(best) + ' (' + Math.round(Z.prestige(best)) + ')' : 'No animals', bar: Math.round(bars.rarest) },
      { id: 'breeder', name: "Breeder's Cup", won: S.yr.bestBaby >= bars.breeder, mine: S.yr.bestBaby ? S.yr.bestBabyName + ' (' + Math.round(S.yr.bestBaby) + ')' : 'No births', bar: Math.round(bars.breeder) },
      { id: 'explorer', name: "Explorer's Medal", won: S.yr.newSpecies >= bars.explorer, mine: S.yr.newSpecies + ' new species', bar: bars.explorer + ' new species' },
      { id: 'zoo', name: 'Zoo of the Year', won: place === 1, mine: 'Placed ' + place + ' of ' + table.length, bar: 'First place' }
    ];
    awards.forEach(a => { if (a.won) { a.prize = a.id === 'zoo' ? prize * 3 : prize; S.trophies++; S.money += a.prize; addRep(S, a.id === 'zoo' ? 150 : 30 + y * 3, 'awards'); } });
    const h = { year: y, rating: rating, place: place, of: table.length, awards: awards.filter(a => a.won).map(a => a.id), visitors: Math.round(S.yr.visitors), income: Math.round(S.yr.income), cost: Math.round(S.yr.cost), spent: Math.round(S.yr.spent),
      species: Z.speciesCount(S), bestReview: S.yr.bestReview, bestBaby: Math.round(S.yr.bestBaby), events: S.yr.events, expeditions: S.yr.expeditions, births: S.yr.births, money: Math.round(S.money), rep: S.rep, rank: Z.rank(S) };
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
  // Open Day and Summer Festival: first a plan (how much to spend), then the result.
  function yearlyPlan(S, id) {
    const options = D.YEARLY_SPEND[id].map(T => { const o = { label: T.name, note: T.k ? 'Crowd x' + T.mult + ', reputation +' + repChunk(S, T.rep) : 'Free' }; if (T.k) o.cost = price(T.k * Z.scale(S)); return o; });
    S.yearly = { id: id, name: D.YEARLY_NAME[id], at: S.week, options: options, def: 0 };
    report(S, { type: 'yearlyplan', id: id, name: D.YEARLY_NAME[id], options: options });
  }
  function applyYearly(S, i, auto) {
    const y = S.yearly; if (!y) return fail('Nothing to plan.');
    const o = y.options[i], T = D.YEARLY_SPEND[y.id][i]; if (!o) return fail('Pick an option.');
    if (o.cost && !spendOpt(S, o.cost)) return need(o.cost);
    const c = Z.c(S); let res;
    const bonusRep = T.rep ? repChunk(S, T.rep) : 0;
    if (y.id === 'openday') {
      const crowd = Math.round(c.visitors * 2.5 * T.mult), rep = Math.round(8 + Math.sqrt(crowd) * 1.5) + bonusRep, money = Math.round(crowd * c.spend);
      res = { type: 'yearly', id: 'openday', name: y.name, tier: T.key, tierName: T.name, spend: o.cost || 0, crowd: crowd, rep: rep, money: money };
      news(S, 'Open Day drew ' + crowd.toLocaleString('en-US') + ' people.', 'good');
    } else {
      const kinds = shopKinds(S), mult = (2 + kinds * 0.5) * T.mult, money = Math.round(c.visitors * c.spend * mult), rep = 5 + kinds * 4 + bonusRep, crowd = Math.round(c.visitors * T.mult);
      res = { type: 'yearly', id: 'festival', name: y.name, tier: T.key, tierName: T.name, spend: o.cost || 0, kinds: kinds, crowd: crowd, rep: rep, money: money };
      news(S, 'The Summer Festival brought in ' + usd(money) + '.', 'good');
    }
    S.yearly = null;
    gain(S, { money: res.money, rep: res.rep, src: 'yearly' });
    ev(S, 'yearly', { id: res.id, tier: res.tier, spend: res.spend, crowd: res.crowd, rep: res.rep, money: res.money, auto: !!auto });
    report(S, res); Z.refresh(S);
    return Object.assign({ ok: true }, res);
  }
  Z.resolveYearly = (S, i) => applyYearly(S, i, false);

  // Winter Animal Show
  function openShow(S) {
    S.show = { stat: pick(['charm', 'vigor', 'wit']), bar: Math.min(122, 30 + 4.8 * Z.year(S)), year: Z.year(S) };
    ev(S, 'show_open', { stat: S.show.stat }); report(S, { type: 'show', stat: S.show.stat, medals: Z.showMedals(S) });
  }
  Z.showScore = (S, a) => S.show ? a[S.show.stat] + Z.sp(a).rarity * 5 + (a.variant ? 8 : 0) : 0;
  Z.showMedals = S => S.show ? { gold: Math.round(S.show.bar * D.SHOW_MEDALS.gold), silver: Math.round(S.show.bar * D.SHOW_MEDALS.silver), bronze: Math.round(S.show.bar * D.SHOW_MEDALS.bronze) } : null; // score needed for each medal
  Z.showMedal = function (S, a) { if (!S.show) return null; const sc = Z.showScore(S, a), bar = S.show.bar; return sc >= bar * D.SHOW_MEDALS.gold ? 'gold' : sc >= bar * D.SHOW_MEDALS.silver ? 'silver' : sc >= bar * D.SHOW_MEDALS.bronze ? 'bronze' : null; };
  Z.enterShow = function (S, id) {
    const a = Z.animal(S, id); if (!S.show || !a) return fail('The show is over for this year.');
    const sc = Z.showScore(S, a), y = S.show.year, medal = Z.showMedal(S, a), medals = Z.showMedals(S);
    const base = Z.prizeBase(y);
    const money = medal === 'gold' ? base * 1.5 : medal === 'silver' ? base * 0.6 : medal === 'bronze' ? base * 0.25 : 0;
    const rep = medal === 'gold' ? 60 + 4 * y : medal === 'silver' ? 30 + 2 * y : medal === 'bronze' ? 12 + y : 0;
    const stat = S.show.stat;
    if (medal === 'gold') S.trophies++;
    S.show = null;
    gain(S, { money: money, rep: rep, src: 'show' });
    const res = { medal: medal, score: sc, bar: medals.gold, medals: medals, stat: stat, money: money, rep: rep, animal: a.id, trophy: medal === 'gold' };
    ev(S, 'show', { sp: a.sp, stat: stat, score: sc, bar: medals.gold, medal: medal || 'none' });
    news(S, a.name + (medal ? ' won ' + medal + ' at the Winter Show.' : ' did not place at the Winter Show.'), medal ? 'good' : '');
    report(S, Object.assign({ type: 'showresult' }, res)); Z.refresh(S);
    return Object.assign({ ok: true }, res);
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
    const tickets = Math.round(visitors * Z.ticket(S)), shopsIn = visitors * c.spend;
    const income = Math.round(tickets + shopsIn), cost = Math.round(c.cost);
    S.money += income - cost; S.rp += c.rpw;
    S.visitorsLast = visitors; S.incomeLast = income; S.costLast = cost;
    S.yr.visitors += visitors; S.yr.income += income; S.yr.cost += cost; S.life.income += income;
    fx(S, { type: 'money', amt: tickets, gate: true });
    Object.keys(c.shopVal).forEach(id => { const amt = Math.round(visitors * c.shopVal[id]); if (amt > 0) fx(S, { type: 'money', amt: amt, item: +id }); });
    if (c.rpw >= 1) fx(S, { type: 'rp', amt: Math.round(c.rpw) });
    addRep(S, visitors / D.VISITORS_PER_REP + c.repw, 'visitors');
    S.week++;
    S.mods = S.mods.filter(m => m.until > S.week);
    if (S.candidates.length && S.week - S.candAt >= 8) S.candidates = [];
    // every project takes its weekly step, then finished ones resolve (an unanswered choice falls back to its safe default)
    S.projects.slice().forEach(p => projectWeek(S, p));
    const done = S.projects.filter(p => p.end <= S.week);
    S.projects = S.projects.filter(p => p.end > S.week);
    done.forEach(p => {
      if (p.choice) applyChoice(S, p, p.choice.def, true);
      if (p.type === 'expedition') resolveExpedition(S, p); else if (p.type === 'breed') resolveBreeding(S, p); else resolveEvent(S, p);
    });
    if (S.yearly && S.week > S.yearly.at) applyYearly(S, S.yearly.def, true);
    if (S.week % 5 === 2) callerArrive(S);
    // happenings: about one every 6 to 8 weeks
    if (S.happening) { if (!S.happening.options) S.happening = null; else if (S.week - S.happening.at >= 2) applyHappening(S, S.happening.def, true); }
    const woy = S.week % D.WPY;
    if (!S.happening && !S.finished && S.week >= S.hapAt) {
      if (woy === D.YEARLY.openday || woy === D.YEARLY.festival || woy === D.YEARLY.show || woy === 0) S.hapAt = S.week + 1; // not on top of a yearly event
      else { rollHappening(S); S.hapAt = S.week + ri(6, 8); }
    }
    if (woy === D.YEARLY.openday) yearlyPlan(S, 'openday');
    if (woy === D.YEARLY.festival) yearlyPlan(S, 'festival');
    if (woy === D.YEARLY.show && S.animals.length) openShow(S);
    checkVips(S);
    if (S.week % D.WPY === 0) yearEnd(S);
    if (S.money < 0 && !S.flags.loan) { S.flags.loan = true; news(S, 'Money is below zero. A patron covers you for now.', 'bad'); }
    if (S.money >= 0) S.flags.loan = false;
    Z.refresh(S);
  };

  // What a habitat should quietly show on the floor.
  Z.habStatus = function (S, h) {
    const out = { event: false, breed: false, busy: null, progress: null, sick: false, choice: false };
    if (!h || h.k !== 'hab') return out;
    out.sick = Z.inHab(S, h.id).some(a => Z.isSick(S, a));
    const pe = S.projects.find(p => p.type === 'event' && p.hab === h.id), pb = S.projects.find(p => p.type === 'breed' && p.hab === h.id), p = pe || pb;
    if (p) { out.busy = p.type; out.progress = clamp((S.week - p.start) / Math.max(1, p.end - p.start), 0, 1); }
    out.choice = S.projects.some(x => x.hab === h.id && x.choice);
    const free = Z.freeStaff(S).length > 0;
    out.event = free && !Z.eventCheck(S, h.id) && S.money >= Z.eventCost(S);
    out.breed = free && Z.readyPairs(S, h.id).length > 0;
    return out;
  };

  Z.snapshot = function (S) { // compact picture of the zoo for the gameplay log
    const c = Z.c(S);
    return { week: S.week, year: Z.year(S), money: Math.round(S.money), rp: Math.round(S.rp), rep: S.rep, rank: Z.rank(S), visitors: S.visitorsLast, income: S.incomeLast, cost: S.costLast,
      species: Z.speciesCount(S), variants: Z.variantCount(S), animals: S.animals.length, holding: Z.holding(S).length, avgStat: S.animals.length ? Math.round(S.animals.reduce((t, a) => t + Z.avg(a), 0) / S.animals.length) : 0,
      habitats: S.items.filter(i => i.k === 'hab').map(h => h.t + h.lvl).join(','), facilities: S.items.filter(i => i.k === 'fac').length, rows: S.rows,
      staff: S.staff.map(s => s.role[0] + s.lvl).join(','), combos: Object.keys(S.combos).length, research: Object.keys(S.research).length, regions: Object.keys(S.regions).join(','),
      trophies: S.trophies, draw: Math.round(c.total), spend: +c.spend.toFixed(2), projects: S.projects.length, spentYr: Math.round(S.yr.spent), playSec: Math.round(S.play.sec), bySpeed: S.play.bySpeed.map(Math.round) };
  };
  Z.drainLog = function (S) { const e = S.elog; S.elog = []; return e; }; // hand the event log to the interface and empty it, so saves stay small
  Z.serialize = function (S) { const c = S._c; delete S._c; const s = JSON.stringify(S); S._c = c; return s; };
  Z.deserialize = function (str) { // returns null for anything that is not a version 3 save
    let S; try { S = JSON.parse(str); } catch (e) { return null; }
    if (!S || S.v !== Z.SAVE_VERSION) return null;
    Z.refresh(S); return S;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Z; else root.ZE = Z;
})(typeof window !== 'undefined' ? window : globalThis);
