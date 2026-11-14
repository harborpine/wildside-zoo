/* Headless checks for the rules (engine.js, data.js). Usage: node test/rules-check.js
   Prints one line per check and exits with code 1 if any fail. */
const D = require('../data.js'), Z = require('../engine.js'), bot = require('./bot.js');
let failed = 0;
const NG = () => Z.newGame(null, { starter: true }); // the classic pre-built start, for checks that need a known layout
function check(name, fn) { try { const r = fn(); if (r === false) throw new Error('returned false'); console.log('ok   ' + name + (typeof r === 'string' ? ' (' + r + ')' : '')); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } }
function eq(a, b, what) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((what || 'value') + ' is ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b)); }
function ok(v, what) { if (!v) throw new Error(what || 'not true'); }
const tickN = (S, n) => { for (let i = 0; i < n; i++) { S.reports = []; Z.tick(S); } };
function firstSpot(S, kind, t) { for (let y = D.GRID_H - 1; y >= 0; y--) for (let x = 0; x < D.GRID_W; x++) { const a = Z.fromOffset(x, y); for (let rot = 0; rot < 6; rot++) if (Z.canPlace(S, kind, t, a[0], a[1], rot)) return [a[0], a[1], rot]; } return null; }

check('new game: version 3, portrait grid, entrance at the front', () => {
  const S = NG();
  eq(S.v, 3); eq(Z.SAVE_VERSION, 3); eq([D.GRID_W, D.GRID_H], [10, 20]); eq(S.rows, D.START_ROWS);
  const e = Z.entrance(S); eq(e.r, D.GRID_H - 1, 'entrance row'); ok(Z.inGrid(e.q, e.r) && Z.inLand(S, e.q, e.r), 'entrance on owned land');
  ok(!Z.canPlace(S, 'fac', 'bench', e.q, e.r, 0), 'nothing can be built on the entrance');
  S.items.forEach(it => Z.cells(it).forEach(c => ok(Z.inLand(S, c[0], c[1]), 'starting item on owned land')));
  let owned = 0, grid = 0;
  for (let r = -5; r < 30; r++) for (let q = -30; q < 30; q++) { if (Z.inGrid(q, r)) grid++; if (Z.inLand(S, q, r)) { owned++; ok(r >= D.GRID_H - S.rows, 'owned land is the front rows'); } }
  eq(grid, D.GRID_W * D.GRID_H, 'grid size'); eq(owned, D.GRID_W * D.START_ROWS, 'owned hexes');
});

check('land grows by rows from the front', () => {
  const S = NG(); S.money = 1e9; S.rep = 40000; let n = 0;
  while (Z.nextLand(S)) { const before = S.rows; ok(Z.buyLand(S).ok, 'buy land'); ok(S.rows > before); n++; }
  eq(S.rows, D.GRID_H); eq(n, D.LAND.length); ok(!Z.buyLand(S).ok, 'no more land');
  const top = Z.fromOffset(0, 0); ok(Z.inLand(S, top[0], top[1]), 'back row owned at the end');
});

check('stable habitat numbers and names', () => {
  const S = NG(); S.money = 1e6;
  const a = firstSpot(S, 'hab', 'savanna'); const r1 = Z.build(S, 'hab', 'savanna', a[0], a[1], a[2]); ok(r1.ok);
  const b = firstSpot(S, 'hab', 'savanna'); const r2 = Z.build(S, 'hab', 'savanna', b[0], b[1], b[2]); ok(r2.ok);
  eq(Z.habName(S, Z.item(S, r2.id)), 'Savanna 3');
  ok(Z.remove(S, r1.id).ok);
  eq(Z.habName(S, Z.item(S, r2.id)), 'Savanna 3', 'name after removing an earlier habitat');
  const c = firstSpot(S, 'hab', 'savanna'); const r3 = Z.build(S, 'hab', 'savanna', c[0], c[1], c[2]);
  eq(Z.item(S, r3.id).n, 4, 'numbers are never reused');
});

check('habStatus shape and readiness', () => {
  const S = NG(), h = S.items[0], st = Z.habStatus(S, h);
  eq(Object.keys(st).sort(), ['breed', 'busy', 'choice', 'closed', 'event', 'progress', 'sick']); eq(st.closed, false);
  eq([st.event, st.breed, st.busy, st.progress, st.sick], [true, true, null, null, false]);
  ok(Z.startEvent(S, h.id, 'feeding', S.staff[0].id).ok);
  const s2 = Z.habStatus(S, h); eq(s2.busy, 'event'); eq(s2.progress, 0); eq(s2.event, false);
});

check('event: star and boost choices arrive, resolve, and the review carries critic scores', () => {
  const S = NG(), h = S.items[0]; S.rp = 100;
  const pid = Z.startEvent(S, h.id, 'feeding', S.staff[0].id).pid;
  tickN(S, 1); let p = Z.project(S, pid);
  ok(p.choice && p.choice.key === 'star', 'star choice after week 1'); ok(S.reports.some(r => r.type === 'choice' && r.pid === pid), 'choice report');
  ok(p.choice.options.length === 3 && p.choice.options.every(o => o.label && o.animal && o.note));
  let r = Z.resolveChoice(S, pid, 1); ok(r.ok && typeof r.text === 'string' && typeof r.good === 'boolean'); ok(!p.choice && p.star);
  tickN(S, 1); p = Z.project(S, pid); ok(p.choice && p.choice.key === 'boost', 'boost choice after week 2');
  ok(p.choice.options[0].costRp > 0 && p.choice.options[0].odds > 0 && p.choice.options[0].odds < 1);
  r = Z.resolveChoice(S, pid, 0); ok(r.ok); ok(!Z.resolveChoice(S, pid, 0).ok, 'cannot answer twice');
  tickN(S, 1); const rev = S.reports.find(x => x.type === 'review'); ok(rev, 'review report');
  eq(rev.critics.map(c => c.key), ['animals', 'habitat', 'fun', 'learning']); eq(rev.critics.reduce((t, c) => t + c.score, 0), rev.total);
  eq(rev.hof, rev.total >= 34); ok(rev.star && rev.boost);
});

check('ignored choices fall back to the safe default and nothing deadlocks', () => {
  const S = NG(), h = S.items[0];
  Z.startEvent(S, h.id, 'feeding', S.staff[0].id); Z.startExpedition(S, 'savanna', [S.staff[1].id], 0);
  tickN(S, 12); eq(S.projects.length, 0, 'projects finished');
  const S2 = NG(); const a = S2.animals[0], b = S2.animals[1];
  ok(Z.startBreeding(S2, a.id, b.id, S2.staff[0].id).ok); tickN(S2, 8); eq(S2.projects.length, 0, 'breeding finished');
});

check('every project choice option resolves', () => {
  const keys = {};
  for (let t = 0; t < 300; t++) {
    const S = NG(); S.money = 1e6; S.rp = 1e4;
    const type = t % 2 ? 'expedition' : 'breed';
    const pid = type === 'expedition' ? Z.startExpedition(S, 'savanna', [S.staff[1].id], 1).pid : Z.startBreeding(S, S.animals[0].id, S.animals[1].id, S.staff[0].id).pid;
    for (let w = 0; w < 6 && !(Z.project(S, pid) || {}).choice; w++) tickN(S, 1);
    const p = Z.project(S, pid); ok(p && p.choice, type + ' raised a choice');
    const i = Math.floor(t / 2) % p.choice.options.length; keys[p.choice.key + i] = 1;
    const r = Z.resolveChoice(S, pid, i); ok(r.ok && r.text, p.choice ? 'refused: ' + r.msg : 'ok');
    tickN(S, 14); ok(!Z.project(S, pid), 'project finished after the choice');
    if (type === 'expedition') ok(S.life.expeditions === 1);
  }
  ['tracks', 'guide', 'camp', 'river', 'vet', 'diet', 'watch'].forEach(k => ok(keys[k + 0] && keys[k + 1], 'saw both options of ' + k));
  return Object.keys(keys).length + ' option paths';
});

check('every happening works, with every option, and setbacks never undo progress', () => {
  let n = 0;
  Object.keys(D.HAPPENINGS).forEach(key => {
    for (let i = 0; i < 4; i++) for (let rep = 0; rep < 6; rep++) {
      const S = NG(); S.money = 5e5; S.rp = 5000; if (rep % 2) S.rep = 8500 + rep; S.reports = []; // half the cases at rank 7, right on the rank line
      for (let k = 0; k < 4; k++) { const sp = D.SPECIES_LIST[k]; const an = { id: S.nextId++, sp: sp.id, name: 'T' + k, sex: 'M', charm: 20, vigor: 20, wit: 20, variant: false, gen: 1, born: null, hab: S.items[0].id, rest: S.week + 5, sick: 0 }; S.animals.push(an); }
      const rank = Z.rank(S), animals = S.animals.length, items = S.items.length, staff = S.staff.length;
      ok(Z.debug.happening(S, key), key + ' could not happen');
      const rp = S.reports.find(r => r.type === 'happening'); ok(rp && rp.key === key && rp.title && rp.text, key + ' report');
      ok(rp.title.length <= 20 && rp.text.length <= 60, key + ' text too long: ' + rp.text);
      if (D.HAPPENINGS[key].who) eq(rp.who, D.HAPPENINGS[key].who);
      if (rp.options) {
        ok(S.happening && S.happening.options === rp.options); if (i >= rp.options.length) continue;
        rp.options.forEach(o => ok(o.label && o.label.length <= 18, key + ' label too long: ' + o.label));
        const r = Z.resolveHappening(S, i); ok(r.ok && r.text && typeof r.good === 'boolean', key + ' option ' + i + ' refused: ' + r.msg); eq(S.happening, null);
      } else ok(!S.happening.options);
      ok(Z.rank(S) >= rank, key + ' cost a rank'); ok(S.animals.length >= animals && S.items.length === items && S.staff.length === staff, key + ' removed something');
      tickN(S, 3); eq(S.happening && S.happening.key === key ? 'stuck' : 'cleared', 'cleared'); n++;
    }
  });
  D.WHO.forEach(w => ok(Object.values(D.HAPPENINGS).some(h => h.who === w), 'unused who ' + w));
  return n + ' cases';
});

check('happenings: unanswered ones resolve themselves; one every 10 to 14 weeks; about a third setbacks (8 runs)', () => {
  let n = 0, bad = 0, runs = 8; const kinds = {};
  for (let i = 0; i < runs; i++) { const r = bot(i % 2 ? 0.8 : 0, false); n += r.hapN; Object.keys(r.haps).forEach(k => { kinds[k] = 1; if (D.HAPPENINGS[k].bad) bad += r.haps[k]; }); } // skill 0 = never answers anything
  const per = runs * D.WPY * D.RUN_YEARS / n, share = bad / n;
  ok(per >= 10 && per <= 14, 'one per ' + per.toFixed(1) + ' weeks'); ok(share >= 0.25 && share <= 0.42, 'share of setbacks ' + share.toFixed(2));
  const badKinds = Object.keys(D.HAPPENINGS).filter(k => D.HAPPENINGS[k].bad); ok(badKinds.length >= 7 && badKinds.every(k => kinds[k]), 'every setback kind turns up');
  return 'one per ' + per.toFixed(1) + ' weeks, ' + Math.round(100 * share) + '% setbacks';
});

check('new setbacks: fence closes a habitat 2 weeks (rush job reopens), pipe and rival are short dips', () => {
  const S = NG(); S.money = 1e6; const h = S.items[0], v0 = Z.c(S).visitors;
  ok(Z.debug.happening(S, 'fence')); eq(S.happening.hab, h.id); ok(Z.isClosed(S, h) && Z.habStatus(S, h).closed, 'closed'); eq(Z.c(S).hab[h.id].draw, 0); ok(S.fx.some(f => f.type === 'closed' && f.hab === h.id));
  ok(Z.c(S).visitors < v0, 'fewer visitors'); tickN(S, 2); ok(!Z.isClosed(S, h), 'open again after 2 weeks'); eq(S.happening, null);
  const T = NG(); T.money = 1e6; Z.debug.happening(T, 'fence'); ok(Z.resolveHappening(T, 0).ok); ok(!Z.isClosed(T, T.items[0]), 'rush job reopens');
  const P = NG(); const sp0 = Z.c(P).spend; Z.debug.happening(P, 'pipe'); Z.refresh(P); ok(Z.c(P).spend < sp0, 'shops down'); P.money = 1e6; Z.resolveHappening(P, 0); ok(Math.abs(Z.c(P).spend - sp0) < 1e-9, 'plumber fixes it');
  const R = NG(); const rv = Z.c(R).visitors; Z.debug.happening(R, 'rival'); Z.refresh(R); ok(Z.c(R).visitors < rv); tickN(R, 4); ok(Z.modSum(R, 'visitors') >= 0, 'dip is over');
});

check('compareOwned: species, sex, better / worse / mixed, offers, ids and arrivals', () => {
  const S = NG(), m = S.animals.find(a => a.sex === 'M');
  Object.assign(m, { charm: 30, vigor: 30, wit: 30 });
  const mk = (sp, sex, c, v, w) => ({ id: -1, sp: sp, sex: sex, charm: c, vigor: v, wit: w });
  let r = Z.compareOwned(S, mk('lion', 'M', 50, 50, 50)); eq([r.haveSpecies, r.haveSameSex, r.best, r.better, r.count], [false, false, null, null, 0]);
  r = Z.compareOwned(S, mk('zebra', 'F', 50, 50, 50)); ok(r.haveSpecies); eq(r.sex, 'F');
  S.animals.find(a => a.sex === 'F').sex = 'M'; // now two males
  r = Z.compareOwned(S, mk('zebra', 'F', 50, 50, 50)); eq([r.haveSpecies, r.haveSameSex, r.better], [true, false, null]);
  r = Z.compareOwned(S, mk('zebra', 'M', 99, 99, 99)); ok(r.haveSameSex && r.count === 2); eq(r.better, 'yes'); ok(r.best && r.best.avg >= 1);
  const best = r.best;
  eq(Z.compareOwned(S, mk('zebra', 'M', 1, 1, 1)).better, 'no');
  eq(Z.compareOwned(S, mk('zebra', 'M', best.charm, best.vigor, best.wit)).better, 'no', 'equal is not better');
  eq(Z.compareOwned(S, mk('zebra', 'M', 99, 1, best.wit)).better, 'mixed');
  const off = S.offers.list[0]; eq(Z.compareOwned(S, off), Z.compareOwned(S, off.a), 'offer {a, price}');
  eq(Z.compareOwned(S, m.id).count, 1, 'by id it never counts itself');
  S.money = 1e6; const c = Z.openCrate(S); eq(Z.compareOwned(S, c.animal.id), Z.compareOwned(S, c.animal), 'arrival by id');
  eq(Z.compareOwned(S, S.arrivals[0]), Z.compareOwned(S, c.animal), 'arrival entry');
});

check('rarity crates: 5 of one rarity per trader visit, rarer visits rarer, price by rarity and rank', () => {
  const S = NG(); S.money = 1e9; const info = Z.crateInfo(S);
  ok(info && info.left === 5 && info.total === 5 && info.rarity >= 1 && info.rarity <= 5 && info.cost > 0 && info.name === D.RARITY.name[info.rarity]);
  ok(info.pool.length && info.pool.every(id => D.SPECIES[id].rarity === info.rarity && !D.BIOMES[D.SPECIES[id].biome].secret && S.regions[D.SPECIES[id].biome]));
  ok(Z.callersHere(S).find(c => c.kind === 'trader').crateRarity === info.rarity);
  const n = S.animals.length, pen = Z.holding(S).length;
  for (let i = 0; i < 5; i++) { const r = Z.openCrate(S); ok(r.ok && r.pending && r.rarity === info.rarity && r.price === Z.animalValue(r.animal)); ok(Z.arrival(S, r.animal.id), 'waiting as an arrival'); }
  eq(S.animals.length, n, 'nothing housed automatically'); eq(Z.holding(S).length, pen); eq(S.arrivals.length, 5);
  eq(Z.crateInfo(S), null); ok(!Z.openCrate(S).ok, 'sixth crate refused');
  const tally = r => { const c = [0, 0, 0, 0, 0, 0]; for (let i = 0; i < 2000; i++) { const T = NG(); T.rep = D.RANK_REP[r - 1]; Z.debug.caller(T, 'trader'); c[T.offers.crateRarity]++; } return c; };
  const low = tally(1), high = tally(9);
  ok(low[1] > low[2] && low[2] > low[3] && low[3] > low[4], 'rarer rarity, rarer visit: ' + low); ok(high[4] + high[5] > low[4] + low[5] * 3, 'better odds at high rank');
  ok(Z.crateCost(S, 1) < Z.crateCost(S, 3) && Z.crateCost(S, 3) < Z.crateCost(S, 5), 'price by rarity');
  const H = NG(); H.rep = D.RANK_REP[7]; ok(Z.crateCost(H, 2) > Z.crateCost(S, 2), 'price by rank');
  const Dd = NG(); Z.debug.caller(Dd, 'director'); eq(Z.crateInfo(Dd), null, 'director brings no crates');
  return 'rank 1 visits by rarity ' + low.slice(1).join('/') + ', rank 9 ' + high.slice(1).join('/');
});

check('arrivals: keep / sell / where, choices order, and the safety default', () => {
  const S = NG(); S.money = 1e9; const h = S.items[0];
  const sp = firstSpot(S, 'hab', 'savanna'); const h2 = Z.item(S, Z.build(S, 'hab', 'savanna', sp[0], sp[1], sp[2]).id);
  const mk = () => { const T = S.offers; S.offers = { kind: 'trader', at: S.week, list: [], crates: 1, crateRarity: 1 }; S.regions = { savanna: true }; const r = Z.openCrate(S); S.offers = T; return r.animal; };
  const a = mk(); let ch = Z.arrivalChoices(S, a.id);
  eq(ch[ch.length - 1].hab, null, 'pen last'); eq(ch.filter(c => c.best).length, 1, 'one best'); ok(ch[0].fit && ch.slice(0, -1).every(c => Z.item(S, c.hab).t === 'savanna'));
  ok(ch.slice(0, -1).every((c, i, l) => i === 0 || !(c.fit && !l[i - 1].fit)), 'fitting habitats first');
  const r = Z.keepArrival(S, a.id, h2.id); ok(r.ok && r.hab === h2.id); eq(Z.animal(S, a.id).hab, h2.id); ok(!Z.arrival(S, a.id)); ok(!Z.keepArrival(S, a.id, h2.id).ok, 'cannot decide twice');
  const b = mk(), money = S.money, val = Z.animalValue(b); const s = Z.sellArrival(S, b.id); ok(s.ok); eq(s.price, val); eq(S.money, money + val); ok(!Z.animal(S, b.id) && !Z.arrival(S, b.id));
  ok(S.book[b.sp], 'a sold find still counts as discovered');
  const c = mk(); ok(Z.keepArrival(S, c.id, null).ok); eq(Z.animal(S, c.id).hab, null, 'kept in the pen');
  while (Z.inHab(S, h.id).length < Z.habCap(h)) { const x = mk(); Z.keepArrival(S, x.id, h.id); }
  const d = mk(); ok(!Z.keepArrival(S, d.id, h.id).ok, 'full habitat refused'); ch = Z.arrivalChoices(S, d.id); ok(ch.find(x => x.hab === h.id).fit === false);
  const J = NG(); J.money = 1e9; J.regions.jungle = true; const jp = firstSpot(J, 'hab', 'jungle'); const jh = Z.build(J, 'hab', 'jungle', jp[0], jp[1], jp[2]).id;
  J.offers = { kind: 'trader', at: 0, list: [], crates: 1, crateRarity: 1 }; J.regions = { savanna: true }; const za = Z.openCrate(J).animal; ok(!Z.keepArrival(J, za.id, jh).ok, 'wrong biome refused');
  // safety: left undecided, it is housed the classic way after D.ARRIVAL_WEEKS, and on load it stays waiting
  const e = mk(); const L = Z.deserialize(Z.serialize(S)); ok(Z.arrival(L, e.id), 'still waiting after a load');
  tickN(S, D.ARRIVAL_WEEKS - 1); ok(Z.arrival(S, e.id), 'still waiting before the deadline'); tickN(S, 1); ok(!Z.arrival(S, e.id) && Z.animal(S, e.id), 'decided automatically'); eq(Z.animal(S, e.id).hab, null, 'the safety default is the holding pen'); eq(S.arrivals.length, 0);
  tickN(L, D.ARRIVAL_WEEKS); eq(L.arrivals.length, 0, 'loaded save houses it too');
  const all = mk(), k = Z.keepAllArrivals(S); ok(k.ok && k.moved.length === 1 && Z.animal(S, all.id));
});

check('expedition finds wait as arrivals; nothing deadlocks with a full pen', () => {
  const S = NG(); S.money = 1e9;
  S.animals.forEach(a => { a.hab = null; }); for (let i = 0; i < 6; i++) S.animals.push({ id: S.nextId++, sp: 'warthog', name: 'P' + i, sex: 'M', charm: 5, vigor: 5, wit: 5, variant: false, gen: 1, born: null, hab: null, rest: 0, sick: 0 });
  ok(Z.holding(S).length > Z.holdCap(S)); ok(!Z.startExpedition(S, 'savanna', [S.staff[1].id], 0).ok, 'over-full pen blocks a new expedition as before');
  ok(Z.sellAnimal(S, S.animals[S.animals.length - 1].id).ok && Z.sellAnimal(S, S.animals[S.animals.length - 1].id).ok); ok(Z.startExpedition(S, 'savanna', [S.staff[1].id], 0).ok);
  let rep = null; for (let t = 0; t < 10 && !rep; t++) { S.reports = []; Z.tick(S); rep = S.reports.find(r => r.type === 'expedition'); }
  ok(rep && rep.found.length >= 1); rep.found.forEach(f => { ok(f.pending && f.hab === null && f.price > 0 && (f.sex === 'M' || f.sex === 'F')); ok(Z.arrival(S, f.id)); eq(Z.arrivalChoices(S, f.id).slice(-1)[0], { hab: null, room: Z.holdCap(S) - Z.holding(S).length, fit: true, best: Z.arrivalChoices(S, f.id).length === 1 || !Z.arrivalChoices(S, f.id).some(c => c.hab != null && c.best) }); });
  rep.found.forEach(f => ok(Z.keepArrival(S, f.id, null).ok, 'the pen always takes a find'));
  ok(Z.sellAnimal(S, rep.found[0].id).ok, 'and it can be sold again later');
});

check('habitat capacity: 4 at level 1, +2 per level, whatever the shape; pen unchanged', () => {
  D.BIOME_ORDER.forEach(b => { for (let l = 1; l <= 5; l++) eq(Z.habCap({ t: b, lvl: l }), 4 + 2 * (l - 1), b + ' level ' + l); });
  const S = NG(); eq(Z.holdCap(S), 6); S.research['tech:pen'] = true; eq(Z.holdCap(S), 12);
  S.money = 1e9; S.research['tech:hab3'] = true; const h = S.items[0]; const r = Z.upgrade(S, h.id); ok(r.ok); eq(Z.habCap(h), 6);
});

check('timed hiring: advert takes weeks, then applicants arrive with a report; one at a time', () => {
  const S = NG(); S.staff.pop(); const tiers = Z.hireTiers(S); ok(tiers.every(t => t.weeks >= 2)); ok(tiers[2].weeks >= tiers[0].weeks);
  const money = S.money, r = Z.advertise(S, 1); ok(r.ok && r.weeks === tiers[1].weeks && r.end === S.week + r.weeks && !r.candidates); eq(S.money, money - tiers[1].cost);
  eq(S.candidates.length, 0, 'nobody yet'); ok(!Z.advertise(S, 0).ok, 'one advert at a time');
  let info = Z.hiringInfo(S); ok(info && info.type === 'hire' && info.weeksLeft === r.weeks && info.progress === 0 && info.detail === tiers[1].name);
  ok(Z.runningList(S).some(x => x.type === 'hire'));
  tickN(S, r.weeks - 1); eq(S.candidates.length, 0); ok(Z.hiringInfo(S).progress > 0);
  S.reports = []; Z.tick(S); const ap = S.reports.find(x => x.type === 'applicants');
  ok(ap && ap.n === 3 && ap.candidates.length === 3 && ap.tier === 'paper' && ap.tierName); eq(S.candidates.length, 3); eq(S.hiring, null); eq(Z.hiringInfo(S), null);
  ok(S.fx.some(f => f.type === 'hire'));
  const h = Z.hireCandidate(S, 0); ok(h.ok); eq(S.candidates.length, 2);
  tickN(S, D.CANDIDATE_WEEKS); eq(S.candidates.length, 0, 'applicants leave after a while');
  const T = NG(); T.staff.push(Object.assign({}, T.staff[0], { id: T.nextId++ })); ok(!Z.advertise(T, 0).ok, 'staff room full at rank 1 with 3 staff'); ok(!Z.advertise(T, 3).ok, 'top tier locked');
  const U = NG(); U.staff.pop(); U.money = 1e6; Z.advertise(U, 0); tickN(U, 2); eq(U.candidates.length, 2); Z.advertise(U, 1); eq(U.candidates.length, 2, 'old applicants stay while the next advert runs'); tickN(U, 2); eq(U.candidates.length, 3, 'replaced when the new ones arrive');
});

check('an old-shaped version 3 save (before round 5) loads and plays 50 ticks', () => {
  const S = NG(); S.money = 1e6; Z.startExpedition(S, 'savanna', [S.staff[1].id], 0); tickN(S, 3);
  const o = JSON.parse(Z.serialize(S)); delete o.arrivals; delete o.hiring; delete o.offers.crateRarity; o.offers.crates = 1;
  o.candidates = [JSON.parse(JSON.stringify(S.staff[0]))]; o.items.forEach(i => { delete i.closedUntil; }); o.hapAt = o.week + 7;
  const L = Z.deserialize(JSON.stringify(o)); ok(L, 'loads'); eq(L.arrivals, []); eq(L.hiring, null); ok(L.offers.crateRarity >= 1 && L.offers.crates === 5); ok(Z.crateInfo(L).rarity === L.offers.crateRarity);
  tickN(L, 50); eq(L.week, o.week + 50); ok(isFinite(L.money) && L.arrivals.length === 0 && L.animals.length >= 3, 'finds arrived and were housed');
  eq(Z.deserialize(Z.serialize(L)) && 1, 1);
});

check('training: Super! is triple and about 1 in 8', () => {
  const S = NG(); S.money = 1e9; let sup = 0, n = 4000;
  for (let i = 0; i < n; i++) { const s = S.staff[0]; s.trainAt = -99; s.care = 10; const r = Z.train(S, s.id, 'care'); ok(r.ok && r.gain >= 3 && r.gain <= 15); if (r.super) { sup++; ok(r.gain >= 9, 'super gain'); } else ok(r.gain <= 5); }
  ok(Math.abs(sup / n - D.SUPER_CHANCE) < 0.03, 'super rate ' + (sup / n).toFixed(3)); return (100 * sup / n).toFixed(1) + '%';
});

check('hiring tiers', () => {
  const S = NG(); const tiers = Z.hireTiers(S); eq(tiers.length, 4); ok(tiers.every(t => t.key && t.name && t.cost > 0 && t.note != null && t.weeks > 0));
  ok(tiers[0].cost < tiers[1].cost && tiers[1].cost < tiers[2].cost && tiers[2].cost < tiers[3].cost); ok(tiers[3].lock, 'top tier locked at rank 1');
});

check('campaigns and yearly spend ladders', () => {
  const S = NG(); S.money = 1e6; const list = Z.campaigns(S); eq(list.length, 4);
  const v0 = Z.c(S).visitors, r = Z.runCampaign(S, 0); ok(r.ok && r.rep > 0); ok(Z.c(S).visitors > v0, 'visitors up'); ok(!Z.runCampaign(S, 0).ok, 'same kind cannot run twice'); ok(Z.campaigns(S)[0].weeksLeft === 4);
  ok(Z.runCampaign(S, 1).ok, 'a different kind can run alongside');
  tickN(S, D.YEARLY.openday); ok(S.yearly && S.yearly.id === 'openday', 'open day plan'); ok(S.reports.some(x => x.type === 'yearlyplan'));
  const y = Z.resolveYearly(S, 1); ok(y.ok && y.crowd > 0 && y.spend > 0); ok(S.reports.some(x => x.type === 'yearly' && x.id === 'openday')); eq(S.yearly, null);
  const S2 = NG(); tickN(S2, D.YEARLY.openday + 1); eq(S2.yearly, null, 'ignored plan resolves itself'); ok(S2.elog.some(e => e.t === 'yearly' && e.auto));
});

check('births: babies wait as arrivals; the parents habitat is suggested, else another with room; reveal data is complete', () => {
  let other = 0, pen = 0, lucky = 0, kids = 0;
  for (let t = 0; t < 400; t++) {
    const S = NG(); S.money = 1e6; const h1 = S.items[0];
    const sp = firstSpot(S, 'hab', 'savanna'); const h2 = Z.item(S, Z.build(S, 'hab', 'savanna', sp[0], sp[1], sp[2]).id);
    for (let k = 0; k < 2; k++) S.animals.push({ id: S.nextId++, sp: 'warthog', name: 'W' + k, sex: 'M', charm: 20, vigor: 20, wit: 20, variant: false, gen: 1, born: null, hab: h1.id, rest: 0, sick: 0 });
    eq(Z.inHab(S, h1.id).length, Z.habCap(h1), 'parents habitat is full');
    ok(Z.startBreeding(S, S.animals[0].id, S.animals[1].id, S.staff[0].id).ok); tickN(S, 7);
    const b = S.elog.find(e => e.t === 'birth'); if (!b) continue;
    ok(S.animals.every(a => a.born == null), 'no baby housed by the engine');
    S.arrivals.filter(e => e.src === 'birth').forEach(e => { kids++; eq(e.hab, h1.id, 'suggestion = parents habitat'); const best = Z.arrivalChoices(S, e.a.id).find(c => c.best); if (best.hab === h2.id) other++; else if (best.hab == null) pen++; else throw new Error('suggested a full habitat'); ok(Z.keepArrival(S, e.a.id, best.hab).ok); });
  }
  ok(other > 100 && pen === 0, 'babies in the other habitat ' + other + ', in the pen ' + pen);
  const S = NG(); let rep = null;
  for (let t = 0; t < 40 && !rep; t++) { S.animals.forEach(a => { a.rest = 0; }); if (!S.projects.length) Z.startBreeding(S, S.animals[0].id, S.animals[1].id, S.staff[0].id); S.reports = []; Z.tick(S); rep = S.reports.find(r => r.type === 'birth' && !r.fail); }
  ok(rep, 'a birth happened'); const k = rep.kids[0]; eq(k.rolls.map(r => r.stat), ['charm', 'vigor', 'wit']);
  k.rolls.forEach(r => { ok(typeof r.parents === 'number' && typeof r.value === 'number' && typeof r.lucky === 'boolean'); eq(r.delta, r.value - r.parents); eq(Z.arrival(S, k.id).a[r.stat], r.value); });
  ok(k.pending && k.hab === null && k.suggest === S.items[0].id && k.price > 0); const ch = Z.arrivalChoices(S, k.id); ok(ch[0].hab === k.suggest && ch[0].best, 'parents habitat suggested first when it has room');
  ok(k.variantChance > 0 && typeof k.variant === 'boolean');
  return other + ' babies suggested next door';
});

check('expedition reveal data', () => {
  const S = NG(); Z.startExpedition(S, 'savanna', [S.staff[1].id], 0); let rep = null;
  for (let t = 0; t < 10 && !rep; t++) { S.reports = []; Z.tick(S); rep = S.reports.find(r => r.type === 'expedition'); }
  ok(rep && rep.found.length >= 1); rep.found.forEach(f => { const a = Z.arrival(S, f.id).a; eq([f.sp, f.rarity, f.charm, f.vigor, f.wit, f.variant], [a.sp, D.SPECIES[a.sp].rarity, a.charm, a.vigor, a.wit, a.variant]); ok(typeof f.isNew === 'boolean'); });
});

check('auto-housing in one step', () => {
  const S = NG(); const a = S.animals[0]; a.hab = null; const r = Z.autoHouse(S, a.id); ok(r.ok); eq(a.hab, S.items[0].id);
  S.animals.forEach(x => { x.hab = null; }); const all = Z.autoHouseAll(S); eq(all.moved.length, 2); eq(all.left, 0);
});

check('rule lookups the interface used to copy', () => {
  const S = NG(); eq(Z.regionRank('jungle'), 2); eq(Z.regionRank('ocean'), 7); eq(Z.regionRank('savanna'), 0);
  eq(Z.ticket(S), 6); eq(Z.expFast(S, [S.staff[1].id]), 1); eq(Z.expFast(S, [S.staff[0].id]), 0); eq(Z.expWeeks(S, 'savanna', [S.staff[1].id]), 4);
  eq(Z.showMedals(S), null); Z.debug.yearly(S, 'show'); const m = Z.showMedals(S); ok(m.gold > m.silver && m.silver > m.bronze);
  const res = Z.enterShow(S, S.animals[0].id); ok(res.ok); ok(S.reports.some(r => r.type === 'showresult')); eq(res.medal, res.score >= m.gold ? 'gold' : res.score >= m.silver ? 'silver' : res.score >= m.bronze ? 'bronze' : null);
  eq(Z.themeFit(S, 'savanna', 'feeding'), null); ok(Z.callersHere(S).some(c => c.kind === 'trader'));
});

check('reports raised inside an action are in S.reports when it returns', () => {
  const S = NG(); S.money = 1e6; S.reports = []; const h = S.items[0];
  let placed = false;
  for (const c of Z.cells(h)) for (const d of Z.DIRS) { if (!placed && Z.canPlace(S, 'fac', 'bench', c[0] + d[0], c[1] + d[1], 0)) { ok(Z.build(S, 'fac', 'bench', c[0] + d[0], c[1] + d[1], 0).ok); placed = true; } }
  ok(placed); ok(S.reports.some(r => r.type === 'combo' && r.id === 'picnic'), 'combo report straight after building');
});

check('save: serialize, deserialize, 50 more ticks (fresh game and several points of a played game)', () => {
  const S0 = Z.deserialize(Z.serialize(NG())); ok(S0 && S0.v === 3); tickN(S0, 50); eq(S0.week, 50);
  eq(Z.deserialize('{"v":2}'), null, 'old saves are refused'); eq(Z.deserialize('not json'), null);
  let n = 0;
  const tick = Z.tick, saved = [];
  Z.tick = function (S) { tick(S); if (S.week % 97 === 0 && S.week < 900) saved.push(Z.serialize(S)); };
  try { bot(0.8, false); } finally { Z.tick = tick; }
  saved.forEach(str => {
    const S = Z.deserialize(str); ok(S && S._c, 'loaded'); eq(Z.serialize(S), str, 'round trip is exact');
    const w = S.week; tickN(S, 50); eq(S.week, w + 50); ok(isFinite(S.money) && isFinite(S.rep)); n++;
    S.projects.forEach(p => ok(Z.projectInfo(S, p).type === p.type)); S.items.forEach(it => { if (it.k === 'hab') Z.habStatus(S, it); });
  });
  ok(n >= 8); return n + ' saves from a played game';
});

check('bot: 20 years at skills 0.3, 0.6, 0.8 and 1.0', () => {
  return [0.3, 0.6, 0.8, 1].map(s => { const r = bot(s, false); ok(r.S.finished && r.rows.length === 20); ok(r.rows.every(h => h.money > -1e5), 'deep debt'); return s + ': ' + r.S.score.total; }).join(', ');
});

check('display names and icons: tables match the state keys, no old stat words in player text', () => {
  const S = NG();
  eq(D.ASTAT_ORDER, ['charm', 'vigor', 'wit']); eq(D.SKILL_ORDER, ['care', 'sci', 'exp', 'charm']);
  D.ASTAT_ORDER.forEach(k => { ok(typeof S.animals[0][k] === 'number'); ok(D.ASTAT[k].name && D.ASTAT[k].icon === 'stat-' + k); eq(D.ANIMAL_STATS[k], D.ASTAT[k].name); });
  D.SKILL_ORDER.forEach(k => { ok(typeof S.staff[0][k] === 'number'); ok(D.SKILL[k].name && D.SKILL[k].icon === 'skill-' + k); eq(D.STATS[k], D.SKILL[k].name); });
  eq([D.ASTAT.vigor.name, D.ASTAT.wit.name, D.SKILL.charm.name], ['Energy', 'Smarts', 'Hosting']);
  D.COURSES.forEach(c => { ok(D.SKILL[c.skill] && c.skill === c.stat); });
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'engine.js'), 'utf8') + require('fs').readFileSync(require('path').join(__dirname, '..', 'data.js'), 'utf8');
  const hits = src.split(String.fromCharCode(10)).filter(line => /'[^']*\b(Vigor|Wit)\b[^']*'/.test(line.split(' // ')[0])); eq(hits, [], 'old stat words in strings');
  S.rp = 100; const pid = Z.startEvent(S, S.items[0].id, 'feeding', S.staff[0].id).pid; tickN(S, 1);
  const star = Z.project(S, pid).choice; star.options.forEach(o => { ok(D.ASTAT[o.stat], 'star option carries the stat key'); ok(o.note.indexOf(D.ASTAT[o.stat].name) === 0); });
  Z.resolveChoice(S, pid, 0); tickN(S, 1); const boost = Z.project(S, pid).choice; eq([boost.options[0].skill, boost.options[1].skill], ['charm', 'charm']); ok(Z.staffer(S, boost.options[0].staff));
  Z.debug.happening(S, 'scholar'); eq(S.happening.options[1].skill, 'sci'); ok(S.happening.options[1].note.indexOf('Science') > 0);
  Z.debug.happening(S, 'escape'); eq(S.happening.options[0].skill, 'care'); ok(Z.staffer(S, S.happening.options[0].staff));
  Z.debug.yearly(S, 'show'); ok(D.ASTAT[S.show.stat]); ok(D.ASTAT[S.reports.filter(r => r.type === 'show').pop().stat]);
  S.money = 1e6; const tr = Z.train(S, S.staff[1].id, 'charm'); eq(tr.skill, 'charm');
});

check('blank start: bare land, two penned zebras, money covers the starter', () => {
  const S = Z.newGame();
  eq(S.items.length, 0); eq(S.animals.length, 2); ok(S.animals.every(a => a.hab == null && a.sp === 'zebra')); eq(S.staff.length, 2);
  eq(D.START_MONEY, 20000 + D.BIOMES.savanna.hab + D.FAC.snack.cost); eq(S.money, D.START_MONEY); eq(S.offers, null); eq(Z.isOpen(S), false); eq(S.openedAt, null);
  const c = Z.c(S); eq([c.visitors, c.income, c.cost, c.total], [0, 0, 0, 0]);
  eq(Z.callersHere(S), []); eq(Z.nearMisses(S), []); eq(Z.crateInfo(S), null); ok(Z.rankings(S).place === 12); ok(Z.snapshot(S).habitats === '');
  ok(Z.eventCheck(S, 1) !== ''); eq(Z.readyPairs(S, 1), []); eq(Z.habStatus(S, undefined).busy, null);
  const at = Z.starterSpots(); ok(Z.canPlace(S, 'hab', 'savanna', at.hab.q, at.hab.r, 0) && Z.canPlace(S, 'fac', 'snack', at.snack.q, at.snack.r, 0), 'room for the starter');
  const r = Z.build(S, 'hab', 'savanna', at.hab.q, at.hab.r, 0); ok(r.ok); eq(r.housed, 0, 'nothing moved in by the build'); ok(S.animals.every(a => a.hab == null)); eq(r.movable.length, 2); eq(Z.movableTo(S, r.id), r.movable);
  const mi = Z.moveIn(S, r.id, r.movable); eq(mi.moved.length, 2); ok(S.animals.every(a => a.hab === r.id)); eq(Z.movableTo(S, r.id), []);
  ok(Z.build(S, 'fac', 'snack', at.snack.q, at.snack.r, 0).ok); eq(S.money, D.START_MONEY_CLASSIC, 'money after rebuilding the starter');
  eq(S.openedAt, 0); ok(Z.isOpen(S)); ok(S.offers && S.offers.kind === 'trader', 'trader turns up when the zoo opens'); ok(Z.c(S).visitors > 0);
  const st = Z.habStatus(S, Z.item(S, r.id)); eq([st.event, st.breed], [true, true]);
});

check('starter:true reproduces the classic layout', () => {
  const S = NG(), at = Z.starterSpots(); eq(S.money, D.START_MONEY_CLASSIC); eq(S.items.length, 2);
  eq([S.items[0].k, S.items[0].t, S.items[0].q, S.items[0].r, S.items[0].n], ['hab', 'savanna', at.hab.q, at.hab.r, 1]); eq([S.items[1].k, S.items[1].t, S.items[1].q, S.items[1].r], ['fac', 'snack', at.snack.q, at.snack.r]);
  ok(S.animals.length === 2 && S.animals.every(a => a.hab === S.items[0].id)); eq(S.openedAt, 0); ok(S.offers && S.offers.list.length === 4);
  const B = Z.newGame(); Z.build(B, 'hab', 'savanna', at.hab.q, at.hab.r, 0); Z.build(B, 'fac', 'snack', at.snack.q, at.snack.r, 0);
  eq(B.items.map(i => [i.k, i.t, i.q, i.r]), S.items.map(i => [i.k, i.t, i.q, i.r]), 'a rebuilt blank zoo matches'); eq(B.money, S.money); eq(Z.c(B).maint, Z.c(S).maint, "upkeep of the buildings");
});

check('a bare zoo left alone: 60 quiet weeks (and 3 years), no errors, nothing lost, never stuck', () => {
  const S = Z.newGame(), seen = {};
  for (let w = 0; w < 60; w++) { S.reports = []; Z.tick(S); S.reports.forEach(r => { seen[r.type] = 1; }); ok(S.fx.every(f => f.hab == null && f.item == null), 'fx on bare land'); }
  eq(Object.keys(seen), ['yearend'], 'only the year-end report on bare land'); eq(S.money, D.START_MONEY, 'bare land costs nothing'); eq(S.animals.length, 2); eq(S.happening, null); eq(S.offers, null); eq(S.yearly, null); eq(S.show, null); eq(S.visitorsLast, 0);
  const T = Z.deserialize(Z.serialize(S)); ok(T); eq(Z.serialize(T), Z.serialize(S), 'round trip on a bare zoo'); tickN(T, 50); eq(T.week, 110);
  tickN(S, 100); const at = Z.starterSpots(); S.money = 0; const r = Z.build(S, 'hab', 'savanna', at.hab.q, at.hab.r, 0); ok(r.ok && r.housed === 0 && r.movable.length === 2, 'the first habitat can always be built, even broke'); eq(S.money, -D.BIOMES.savanna.hab); ok(Z.moveIn(S, r.id).moved.length === 2);
  ok(!Z.build(S, 'fac', 'snack', at.snack.q, at.snack.r, 0).ok, 'nothing else is free'); const opened = S.openedAt; eq(opened, 160);
  let first = null; for (let w = 0; w < 30; w++) { S.reports = []; Z.tick(S); if (first == null && S.reports.some(x => x.type === 'caller' || x.type === 'happening')) first = S.week; }
  ok(first != null && first >= opened + D.QUIET_WEEKS, 'first caller or happening in week ' + first + ', opened in ' + opened); ok(S.money > -D.BIOMES.savanna.hab, 'income recovers the loan');
  const E = Z.newGame(); E.money = 1e6; ok(Z.startExpedition(E, 'savanna', [E.staff[1].id], 0).ok, 'an expedition from bare land'); tickN(E, 12); ok(E.animals.length >= 3 && E.animals.every(a => a.hab == null));
  Object.keys(D.HAPPENINGS).forEach(k => { const X = Z.newGame(); const did = Z.debug.happening(X, k); if (did) ok(!X.happening.hab, k + ' points at a habitat on bare land'); });
  ok(!Z.debug.happening(Z.newGame(), 'viral') && !Z.debug.happening(Z.newGame(), 'escape') && !Z.debug.happening(Z.newGame(), 'cold'), 'no habitat happenings on bare land');
  return 'first caller or happening ' + (first - opened) + ' weeks after opening';
});

check('bot: blank start and classic start both finish and land in the same range', () => {
  const avg = classic => { let t = 0; for (let i = 0; i < 4; i++) t += bot(0.8, false, { classic: classic }).S.score.total; return Math.round(t / 4); };
  const b = avg(false), c = avg(true); ok(Math.abs(b - c) / c < 0.2, 'blank ' + b + ' vs classic ' + c); return 'blank ' + b + ', classic ' + c;
});

check('no engine path houses an animal without a player action (source scan)', () => {
  // Split engine.js into its top-level pieces (Z.x = ..., function x, const x =) and find every write that puts an animal into a habitat.
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'engine.js'), 'utf8').split(String.fromCharCode(10));
  const chunks = []; let cur = { name: 'top', lines: [] };
  src.forEach(l => { const m = l.match(/^  (?:Z\.(\w+(?:\.\w+)?) =|function (\w+)|const (\w+) =)/); if (m) { chunks.push(cur); cur = { name: m[1] ? 'Z.' + m[1] : m[2] || m[3], lines: [] }; } cur.lines.push(l); });
  chunks.push(cur);
  const writes = /\bhouse\(S|\bsettle\(S, e, (?!null)|\b(?:a|k|c|x|e\.a|o\.a)\.hab = (?!null)/; // writes to an animal's habitat (report fields such as rep.hab are not housing)
  const allowed = ['house', 'settle', 'Z.autoHouse', 'Z.autoHouseAll', 'Z.keepArrival', 'Z.keepAllArrivals', 'Z.moveIn', 'Z.moveAnimal', 'Z.newGame'];
  const hits = chunks.filter(c => c.lines.some(l => writes.test(l.split(' // ')[0]))).map(c => c.name);
  eq(hits.filter(n => allowed.indexOf(n) < 0), [], 'housing writes outside player actions');
  // and the player actions are never called from inside the engine
  const calls = /\b(?:Z\.autoHouse|Z\.autoHouseAll|Z\.keepArrival|Z\.keepAllArrivals|Z\.moveIn|Z\.moveAnimal)\(|[^.\w]house\(S/;
  const callers = chunks.filter(c => c.lines.slice(1).concat([c.lines[0].replace(/^.*?=>|^.*?function \w+ ?\([^)]*\)/, '')]).some(l => calls.test(l.split(' // ')[0]))).map(c => c.name);
  eq(callers.filter(n => ['Z.autoHouse', 'Z.autoHouseAll'].indexOf(n) < 0), [], 'engine code calling a housing action');
  const ng = chunks.find(c => c.name === 'Z.newGame').lines.join(' '); ok(/a\.hab = hid/.test(ng) && /let hid = null/.test(ng), 'newGame only houses the classic starter');
  return hits.length + ' places, all player actions (plus the classic starter)';
});

check('no engine path houses an animal without a player action (played: births, finds, crates, trader, director, stray, legacy)', () => {
  const S = Z.newGame({ runs: 1 }, { animal: { sp: 'giraffe', name: 'Legacy', sex: 'F', charm: 40, vigor: 40, wit: 40, variant: false, gen: 2 } });
  ok(S.arrivals.some(e => e.src === 'legacy'), 'legacy animal arrives'); eq(S.animals.length, 2);
  const at = Z.starterSpots(); const b = Z.build(S, 'hab', 'savanna', at.hab.q, at.hab.r, 0); ok(Z.moveIn(S, b.id, Z.holding(S).map(a => a.id)).ok);
  S.money = 1e8; S.rp = 1e5; S.rep = D.RANK_REP[5]; S.research['tech:hab3'] = true;
  const housed = new Set(S.animals.filter(a => a.hab != null).map(a => a.id)), srcs = {};
  for (let w = 0; w < 240; w++) {
    S.reports = [];
    S.animals.forEach(a => { a.rest = 0; });
    while (Z.holding(S).length > 3) Z.sellAnimal(S, Z.holding(S)[0].id); // an overfull pen would block breeding; selling is not housing
    if (!S.projects.some(p => p.type === 'breed')) { const pr = Z.readyPairs(S, b.id)[0]; if (pr && Z.freeStaff(S).length) Z.startBreeding(S, pr[0], pr[1], Z.freeStaff(S)[0].id); }
    if (!S.projects.some(p => p.type === 'expedition') && Z.freeStaff(S).length) Z.startExpedition(S, 'savanna', [Z.freeStaff(S)[0].id], 1);
    if (Z.crateInfo(S)) Z.openCrate(S);
    if (S.offers && S.offers.list.length) Z.buyAnimal(S, 0);
    if (w % 30 === 5) { Z.debug.happening(S, 'stray'); Z.resolveHappening(S, 0); }
    if (w % 40 === 7) Z.debug.caller(S, 'director');
    if (w % 50 === 9) { const p = firstSpot(S, 'hab', 'savanna'); if (p) Z.build(S, 'hab', 'savanna', p[0], p[1], p[2]); }
    if (w % 60 === 11) Z.upgrade(S, b.id);
    S.arrivals.forEach(e => { srcs[e.src] = 1; });
    Z.tick(S);
    S.arrivals.forEach(e => { srcs[e.src] = 1; });
    S.animals.forEach(a => { if (a.hab != null && !housed.has(a.id)) throw new Error('animal ' + a.id + ' was put into a habitat by the engine (week ' + S.week + ')'); });
  }
  ['expedition', 'crate', 'trader', 'director', 'stray', 'birth', 'legacy'].forEach(k => ok(srcs[k], 'saw arrivals from ' + k));
  ok(S.elog.some(e => e.t === 'arrive_auto'), 'undecided arrivals went to the holding pen');
  return Object.keys(srcs).length + ' arrival sources, none housed by the engine';
});

check('holding upkeep: charged per animal in the pen when open, waived when closed, arrivals free', () => {
  const S = NG(); const c0 = Z.c(S).cost; eq(Z.holdUpkeep(S).total, 0); eq(Z.c(S).hold, 0);
  const a = S.animals[0]; ok(Z.moveAnimal(S, a.id, null).ok); const hu = Z.holdUpkeep(S), fee = Z.holdFee(S, a);
  eq(fee, Math.round(D.RARITY.upkeep[1] * D.HOLD_UPKEEP)); ok(fee > 0); eq(hu.total, fee); eq(hu.count, 1); eq(hu.perAnimal[a.id], fee); eq(Z.c(S).hold, fee);
  ok(Math.abs(Z.c(S).cost - (c0 + fee)) < 1e-6, 'included in the weekly cost'); const c = Z.c(S); ok(Math.abs(c.cost - (c.salaries + c.upkeep + c.maint + c.hold)) < 1e-6, 'breakdown adds up');
  S.reports = []; const before = Z.c(S).cost; Z.tick(S); eq(S.costLast, Math.round(before), 'charged in the tick');
  S.money = 1e6; const c1 = Z.c(S).hold; Z.openCrate(S); eq(Z.c(S).hold, c1, 'a waiting arrival costs nothing');
  const B = Z.newGame(); ok(Z.holding(B).length === 2); eq(Z.holdUpkeep(B).total, 0, 'waived on bare land'); eq(Z.c(B).cost, 0); tickN(B, 10); eq(B.money, D.START_MONEY);
  return 'a Common in holding costs +$' + fee + '/wk';
});

check('holding pen can never sink the zoo: keep every arrival, one habitat, 4 years (the Tester scenario)', () => {
  const lows = [];
  for (let run = 0; run < 4; run++) {
    const S = Z.newGame(), at = Z.starterSpots(), b = Z.build(S, 'hab', 'savanna', at.hab.q, at.hab.r, 0); Z.build(S, 'fac', 'snack', at.snack.q, at.snack.r, 0); Z.moveIn(S, b.id);
    const ends = [], warns = []; let low = 0;
    for (let w = 0; w < 48 * 4; w++) {
      S.reports = [];
      S.arrivals.slice().forEach(e => { const best = Z.arrivalChoices(S, e.a.id).find(c => c.best); ok(Z.keepArrival(S, e.a.id, best.hab).ok); });
      if (Z.crateInfo(S) && S.money > Z.crateInfo(S).cost) Z.openCrate(S);
      if (S.offers && S.offers.list.length && S.money > S.offers.list[0].price) Z.buyAnimal(S, 0);
      const fs = Z.freeStaff(S); if (fs.length && !S.projects.some(p => p.type === 'expedition') && S.money > Z.expCost('savanna', 0)) Z.startExpedition(S, 'savanna', [fs[0].id], 0);
      const pr = Z.readyPairs(S, b.id)[0], f2 = Z.freeStaff(S); if (pr && f2.length) Z.startBreeding(S, pr[0], pr[1], f2[0].id);
      Z.tick(S); S.reports.forEach(r => { if (r.type === 'holdwarn') warns.push(r); });
      if (w >= 48) low = Math.min(low, S.money);
      if (S.week % 48 === 0) ends.push(Math.round(S.money));
    }
    ok(Z.holding(S).length > Z.holdCap(S), 'the scenario really overfills the pen');
    ok(low > -3000, 'money fell to ' + Math.round(low) + ' (year ends ' + ends.join(', ') + ')');
    ok(ends[3] >= Math.min(ends[1], 0) - 1500, 'still falling: ' + ends.join(', '));
    ok(warns.length >= 1 && warns.length <= 4 * 48 / D.HOLD_WARN_WEEKS, 'the pen notice comes, but not every week (' + warns.length + ')');
    const r = warns[0]; ok(r.count > 0 && r.cost > r.paid && typeof r.profit === 'number' && typeof r.debt === 'boolean', 'notice fields');
    lows.push(Math.round(low));
  }
  // already in debt with a full pen of rare animals: the balance recovers
  const S = NG(); S.money = -20000;
  for (let i = 0; i < 10; i++) S.animals.push({ id: S.nextId++, sp: 'lion', name: 'L' + i, sex: 'M', charm: 30, vigor: 30, wit: 30, variant: false, gen: 1, born: null, hab: null, rest: 0, sick: 0 });
  Z.refresh(S); ok(Z.c(S).hold === 0 && Z.holdUpkeep(S).waived && Z.holdUpkeep(S).full > 0, 'surcharge waived while below zero');
  ok(Z.c(S).income - Z.c(S).cost > 0, 'still a weekly profit with 10 lions in the pen');
  tickN(S, 96); ok(S.money > -20000 + 5000, 'recovers: ' + Math.round(S.money));
  // normal play: a profitable zoo pays the full double cost
  const N = NG(); N.money = 1e5; Z.moveAnimal(N, N.animals[0].id, null); eq(Z.c(N).hold, Z.holdFee(N, N.animals[0]), 'full surcharge when the zoo can afford it'); ok(!Z.c(N).holdCapped);
  return 'lowest balance after year 1 per run: ' + lows.join(', ');
});

check('movableTo and moveIn after building; remove sends animals to the pen', () => {
  const S = NG(); S.money = 1e9; const h = S.items[0];
  S.animals.forEach(a => { a.hab = null; }); S.offers = { kind: 'trader', at: 0, list: [], crates: 1, crateRarity: 1 }; const ca = Z.openCrate(S).animal;
  const sp = firstSpot(S, 'hab', 'savanna'), r = Z.build(S, 'hab', 'savanna', sp[0], sp[1], sp[2]); ok(r.ok && r.housed === 0);
  eq(r.movable, Z.holding(S).map(a => a.id).concat([ca.id])); ok(S.animals.every(a => a.hab == null), 'nobody moved in by itself');
  for (let i = 0; i < 4; i++) S.animals.push({ id: S.nextId++, sp: 'warthog', name: 'W' + i, sex: 'M', charm: 5, vigor: 5, wit: 5, variant: false, gen: 1, born: null, hab: null, rest: 0, sick: 0 });
  const m = Z.moveIn(S, r.id); eq(m.moved.length, 4); eq(m.left, 3); eq(Z.inHab(S, r.id).length, Z.habCap(Z.item(S, r.id)));
  ok(Z.remove(S, r.id).ok); ok(S.animals.every(a => a.hab == null || a.hab === h.id) && Z.holding(S).length >= 4, 'removed habitat empties into the pen');
  S.regions.jungle = true; const jp = firstSpot(S, 'hab', 'jungle'); const j = Z.build(S, 'hab', 'jungle', jp[0], jp[1], jp[2]); eq(j.movable, [], 'nothing fits a rainforest');
});

check('short labels', () => {
  const long = [];
  const see = (s, max, where) => { if (s && s.length > max) long.push(where + ': ' + s); };
  D.HIRE_TIERS.forEach(t => { see(t.name, 14, 'hire'); see(t.note, 22, 'hire note'); });
  D.CAMPAIGNS.forEach(t => see(t.name, 14, 'campaign'));
  Object.values(D.YEARLY_SPEND).forEach(l => l.forEach(t => see(t.name, 14, 'yearly')));
  Object.values(D.HAPPENINGS).forEach(h => see(h.title, 20, 'happening'));
  eq(long, []);
});

console.log(failed ? '\nRULES CHECK: ' + failed + ' FAILED' : '\nRULES CHECK: ALL PASSED');
process.exit(failed ? 1 : 0);
