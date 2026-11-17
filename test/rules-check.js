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
  Z.debug.alwaysChoices(true); // R7: choices are rare now; this check is about the choices, so every one is switched on
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
  Z.debug.alwaysChoices(false);
});

check('ignored choices fall back to the safe default and nothing deadlocks', () => {
  const S = NG(), h = S.items[0];
  Z.startEvent(S, h.id, 'feeding', S.staff[0].id); Z.startExpedition(S, 'savanna', [S.staff[1].id], 0);
  tickN(S, 12); eq(S.projects.length, 0, 'projects finished');
  const S2 = NG(); const a = S2.animals[0], b = S2.animals[1];
  ok(Z.startBreeding(S2, a.id, b.id, S2.staff[0].id).ok); tickN(S2, 8); eq(S2.projects.length, 0, 'breeding finished');
});

check('every project choice option resolves', () => {
  Z.debug.alwaysChoices(true);
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
  Z.debug.alwaysChoices(false);
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

check('happenings: unanswered ones resolve themselves; one every 40 to 56 weeks (R7: a quarter as often); about a third setbacks (8 runs)', () => {
  let n = 0, bad = 0, runs = 8; const kinds = {};
  for (let i = 0; i < runs; i++) { const r = bot(i % 2 ? 0.8 : 0, false); n += r.hapN; Object.keys(r.haps).forEach(k => { kinds[k] = 1; if (D.HAPPENINGS[k].bad) bad += r.haps[k]; }); } // skill 0 = never answers anything
  const per = runs * D.WPY * D.RUN_YEARS / n;
  // R7: happenings are rare now, so 8 bot runs hold too few to judge the setback share; 40 quick untouched 20-year zoos are added to the tally
  for (let i = 0; i < 40; i++) { const S = NG(); for (let w = 0; w < D.WPY * D.RUN_YEARS; w++) { S.reports = []; Z.tick(S); S.reports.forEach(r => { if (r.type === 'happening') { n++; kinds[r.key] = 1; if (r.bad) bad++; } }); } S.elog = []; }
  const share = bad / n;
  eq(D.HAP_GAP, [40, 56]); ok(per >= 40 && per <= 56, 'one per ' + per.toFixed(1) + ' weeks'); ok(share >= 0.25 && share <= 0.42, 'share of setbacks ' + share.toFixed(2));
  const badKinds = Object.keys(D.HAPPENINGS).filter(k => D.HAPPENINGS[k].bad); ok(badKinds.length >= 7 && badKinds.every(k => kinds[k]), 'every setback kind turns up');
  return 'one per ' + per.toFixed(1) + ' weeks, ' + Math.round(100 * share) + '% setbacks of ' + n;
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
  ok(rep && rep.found.length >= 1); rep.found.forEach(f => { ok(f.pending && f.hab === null && f.price > 0 && (f.sex === 'M' || f.sex === 'F')); ok(Z.arrival(S, f.id)); eq(Z.arrivalChoices(S, f.id).slice(-1)[0], { hab: null, room: Z.holdCap(S) - Z.holding(S).length, fit: true, best: Z.arrivalChoices(S, f.id).length === 1 || !Z.arrivalChoices(S, f.id).some(c => c.hab != null && c.best), animals: Z.habAnimals(S, null) }); }); // R7: each entry also lists who lives there
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
  for (const c of Z.cells(h)) for (const d of Z.DIRS) ok(!Z.canPlace(S, 'fac', 'bench', c[0] + d[0], c[1] + d[1], 0), 'R7: nothing can be built on the walkway ring');
  for (const c of Z.ringCells(S, h.id)) for (const d of Z.DIRS) { if (!placed && Z.canPlace(S, 'fac', 'bench', c[0] + d[0], c[1] + d[1], 0)) { ok(Z.build(S, 'fac', 'bench', c[0] + d[0], c[1] + d[1], 0).ok); placed = true; } }
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
  Z.debug.alwaysChoices(true); S.rp = 100; const pid = Z.startEvent(S, S.items[0].id, 'feeding', S.staff[0].id).pid; tickN(S, 1);
  const star = Z.project(S, pid).choice; star.options.forEach(o => { ok(D.ASTAT[o.stat], 'star option carries the stat key'); ok(o.note.indexOf(D.ASTAT[o.stat].name) === 0); });
  Z.resolveChoice(S, pid, 0); tickN(S, 1); const boost = Z.project(S, pid).choice; eq([boost.options[0].skill, boost.options[1].skill], ['charm', 'charm']); ok(Z.staffer(S, boost.options[0].staff)); Z.debug.alwaysChoices(false);
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
  const allowed = ['house', 'settle', 'Z.autoHouse', 'Z.autoHouseAll', 'Z.keepArrival', 'Z.keepAllArrivals', 'Z.moveIn', 'Z.moveAnimal', 'Z.newGame', 'Z.newChallenge'];
  const hits = chunks.filter(c => c.lines.some(l => writes.test(l.split(' // ')[0]))).map(c => c.name);
  eq(hits.filter(n => allowed.indexOf(n) < 0), [], 'housing writes outside player actions');
  // and the player actions are never called from inside the engine
  const calls = /\b(?:Z\.autoHouse|Z\.autoHouseAll|Z\.keepArrival|Z\.keepAllArrivals|Z\.moveIn|Z\.moveAnimal)\(|[^.\w]house\(S/;
  const callers = chunks.filter(c => c.lines.slice(1).concat([c.lines[0].replace(/^.*?=>|^.*?function \w+ ?\([^)]*\)/, '')]).some(l => calls.test(l.split(' // ')[0]))).map(c => c.name);
  eq(callers.filter(n => ['Z.autoHouse', 'Z.autoHouseAll'].indexOf(n) < 0), [], 'engine code calling a housing action');
  const ng = chunks.find(c => c.name === 'Z.newGame').lines.join(' '); ok(/a\.hab = hid/.test(ng) && /let hid = null/.test(ng), 'newGame only houses the classic starter');
  const nc = chunks.find(c => c.name === 'Z.newChallenge').lines.join(' '); ok(/if \(L\.animals\) \{ \/\/ the level's own starting animals/.test(nc) && /L\.animals\.forEach\(p => \{ const a = makeAnimal\(S, p\[0\], p\[2\], \{ sex: p\[1\] \}\); a\.hab = hab \? hab\.id : null;/.test(nc) && (nc.match(/\.hab = /g) || []).length === 1, 'newChallenge only houses a level\'s own starting animals');
  return hits.length + ' places, all player actions (plus the classic starter and a challenge level\'s starting animals)';
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

check('vet role merged into keeper: no vet role anywhere, hiring rolls keepers in its place', () => {
  ok(!D.ROLES.vet, 'no vet role'); eq(D.ROLES.keeper.main, 'care'); eq(D.ROLES.keeper.second, 'sci'); ok(D.KEEPER_VARIANT > 0);
  Object.values(D.ROLES).forEach(R => (R.req || []).forEach(g => g.forEach(x => ok(D.ROLES[x], 'requirement names a missing role ' + x))));
  ok(D.FAC.vet && D.WHO.indexOf('vet') >= 0, 'Vet Clinic and the visiting vet are untouched');
  const roles = {}; let n = 0;
  for (let i = 0; i < 400; i++) { const S = NG(); S.staff.pop(); S.money = 1e6; Z.advertise(S, 1); tickN(S, 2); S.candidates.forEach(c => { roles[c.role] = (roles[c.role] || 0) + 1; n++; }); Z.debug.caller(S, 'headhunter'); roles[S.headhunt.role] = (roles[S.headhunt.role] || 0) + 1; n++; }
  ok(!roles.vet, 'an applicant was a vet'); const share = roles.keeper / n; ok(share > 0.3 && share < 0.5, 'keeper share ' + share.toFixed(2) + ' (old keeper + vet share was 0.40)');
  const S = NG(); Object.keys(D.ROLES).forEach(r => { if (r !== 'keeper') ok(Z.jobOptions(S, S.staff[0]).some(o => o.role === r)); }); ok(!Z.jobOptions(S, S.staff[0]).some(o => o.role === 'vet'));
  return 'keepers ' + Math.round(100 * share) + '% of applicants';
});

check('old save with a vet staffer loads as a keeper with the same skills, level and xp', () => {
  const S = NG(); S.money = 1e6; const s = S.staff[0];
  Object.assign(s, { role: 'vet', lvl: 9, xp: 77, care: 41, sci: 33, exp: 12, charm: 15, mastered: ['vet', 'keeper', 'researcher'] });
  S.staff[1].mastered = ['vet']; S.candidates = [Object.assign(JSON.parse(JSON.stringify(s)), { id: S.nextId++, mastered: undefined })]; S.headhunt = Object.assign(JSON.parse(JSON.stringify(s)), { id: S.nextId++ });
  const pid = Z.startBreeding(S, S.animals[0].id, S.animals[1].id, s.id).pid; tickN(S, 3); const p = Z.project(S, pid); if (p && p.choice) p.choice.who = 'vet';
  const L = Z.deserialize(Z.serialize(S)); ok(L, 'loads'); eq(L.v, 3); const t = Z.staffer(L, s.id);
  eq([t.role, t.lvl, t.xp, t.care, t.sci, t.exp, t.charm], ['keeper', 9, 77, 41, 33, 12, 15]); eq(t.mastered, ['keeper', 'researcher']); eq(Z.staffer(L, S.staff[1].id).mastered, ['keeper']);
  eq(L.candidates[0].role, 'keeper'); eq(L.headhunt.role, 'keeper'); ok(!L.projects.some(q => q.choice && q.choice.who === 'vet'));
  ok(Z.jobOptions(L, t).find(o => o.role === 'zoologist').lock === '', 'a mastered vet + researcher can still become Head Zoologist');
  tickN(L, 50); eq(L.week, S.week + 50); ok(L.staff.every(x => D.ROLES[x.role]));
  ok(Z.salary(t) > 0 && isFinite(Z.breedChance(L, t)));
});

check('advanced role requirements after the merge', () => {
  const S = NG(); S.money = 1e7; const k = S.staff[0], x = S.staff[1]; k.lvl = 8; x.lvl = 8;
  ok(Z.jobOptions(S, k).find(o => o.role === 'zoologist').lock, 'keeper alone cannot be Head Zoologist');
  k.mastered = ['researcher']; eq(Z.jobOptions(S, k).find(o => o.role === 'zoologist').lock, '', 'keeper + researcher = Head Zoologist');
  ok(Z.jobOptions(S, x).find(o => o.role === 'leader').lock, 'explorer alone cannot be Expedition Leader');
  x.mastered = ['keeper']; eq(Z.jobOptions(S, x).find(o => o.role === 'leader').lock, '', 'explorer + keeper = Expedition Leader');
  ok(Z.changeJob(S, k.id, 'zoologist').ok && k.role === 'zoologist' && k.mastered.indexOf('keeper') >= 0); ok(Z.changeJob(S, x.id, 'leader').ok && x.role === 'leader');
  const g = Object.assign({}, k, { id: S.nextId++, role: 'guide', lvl: 8, mastered: ['keeper'] }); S.staff.push(g); eq(Z.jobOptions(S, g).find(o => o.role === 'showrunner').lock, '', 'guide + keeper = Showrunner');
});

check('rare variants per run stay close to before the merge (8 bot runs)', () => {
  const BEFORE = 28.40; // species with a rare variant per run, bot skill 0.8, average of 120 runs on the rules before the merge
  let t = 0; for (let i = 0; i < 8; i++) t += Z.variantCount(bot(0.8, false).S);
  const avg = t / 8; ok(Math.abs(avg - BEFORE) / BEFORE < 0.15, 'variants per run ' + avg.toFixed(1) + ' against ' + BEFORE);
  return avg.toFixed(1) + ' per run (before ' + BEFORE + ')';
});

check('expeditions bring back 1 animal 80% of the time and 2 animals 20%', () => {
  const c = { 1: 0, 2: 0 }; let n = 0;
  for (let i = 0; i < 1500; i++) {
    const S = NG(); S.money = 1e7; S.regions.jungle = true; const region = i % 2 ? 'savanna' : 'jungle';
    ok(Z.startExpedition(S, region, [S.staff[1].id, S.staff[0].id].slice(0, 1 + i % 2), 1 + i % 2).ok); // R7: star 1 or 2 (was budget 0 to 2)
    let rep = null; for (let w = 0; w < 14 && !rep; w++) { S.reports = []; Z.tick(S); const p = S.projects[0]; if (p && p.choice) Z.resolveChoice(S, p.id, i % p.choice.options.length); rep = S.reports.find(r => r.type === 'expedition'); }
    ok(rep, 'expedition came back'); ok(rep.found.length === 1 || rep.found.length === 2, 'found ' + rep.found.length); c[rep.found.length]++; n++;
  }
  const two = c[2] / n; ok(Math.abs(two - D.EXP_TWO) < 0.03, 'share of 2 animals ' + two.toFixed(3));
  return Math.round(100 * c[1] / n) + '% one, ' + Math.round(100 * two) + '% two over ' + n + ' expeditions';
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

// ---------- R7 (update 7): walkway ring, best of kind, next goal, star expeditions, rare treats, challenge mode ----------
const keyOf = c => c[0] + ',' + c[1];
const sortedKeys = cells => cells.map(keyOf).sort();
// worked out here independently of the engine: the owned free hexes that border a habitat
function borderOf(S, h) { const own = {}, out = {}, occ = Z.occupancy(S); Z.cells(h).forEach(c => { own[keyOf(c)] = 1; }); Z.cells(h).forEach(c => Z.DIRS.forEach(d => { const q = c[0] + d[0], r = c[1] + d[1], k = q + ',' + r; if (!own[k] && !occ[k] && Z.inLand(S, q, r)) out[k] = 1; })); return Object.keys(out).sort(); }
// nothing at all stands on a hex bordering a habitat (so no two habitats touch and every ring is whole)
function ringsWhole(S) { const occ = Z.occupancy(S); S.items.forEach(h => { if (h.k !== 'hab') return; Z.cells(h).forEach(c => Z.DIRS.forEach(d => { const o = occ[(c[0] + d[0]) + ',' + (c[1] + d[1])]; if (o && o !== h.id) throw new Error((Z.item(S, o).k === 'hab' ? 'two habitats touch' : 'a building stands on a walkway') + ' at ' + (c[0] + d[0]) + ',' + (c[1] + d[1])); })); }); return true; }
function allSpots(S, kind, t, fn) { for (let y = 0; y < D.GRID_H; y++) for (let x = 0; x < D.GRID_W; x++) { const a = Z.fromOffset(x, y); for (let rot = 0; rot < (kind === 'hab' ? 6 : 1); rot++) if (fn(a[0], a[1], rot) === false) return; } }
const rich = S => { S.money = 1e9; D.BIOME_ORDER.forEach(b => { S.regions[b] = true; }); D.FAC_ORDER.forEach(f => { S.research['fac:' + f] = true; }); return S; };

check('walkway ring: laid with the habitat at no extra cost, nothing can be built on it, shared by neighbours, follows a move, goes with a sale', () => {
  const S = rich(Z.newGame()), at = Z.starterSpots(), m0 = S.money;
  const r = Z.build(S, 'hab', 'savanna', at.hab.q, at.hab.r, 0); ok(r.ok); eq(S.money, m0 - D.BIOMES.savanna.hab, 'the ring costs nothing');
  const h = Z.item(S, r.id), ring = Z.ringCells(S, h.id); eq(sortedKeys(ring), borderOf(S, h), 'ring = every free owned hex bordering the habitat'); eq(ring.length, 9);
  eq(sortedKeys(Z.ringCells(S)), sortedKeys(ring), 'ringCells with no id lists every ring hex'); eq(sortedKeys(Z.ringAt(S, 'savanna', at.hab.q, at.hab.r, 0, h.id)), sortedKeys(ring), 'ringAt preview');
  ring.forEach(c => { ok(Z.isRing(S, c[0], c[1])); eq(Z.c(S).ring[keyOf(c)], [h.id]); const pc = Z.placeCheck(S, 'fac', 'bench', c[0], c[1], 0); eq([pc.ok, pc.why], [false, 'ring']); ok(pc.msg && pc.cells.length === 1); const b = Z.build(S, 'fac', 'bench', c[0], c[1], 0); ok(!b.ok && b.msg === pc.msg, 'a building on the ring is refused'); });
  ok(!Z.isRing(S, at.snack.q, at.snack.r) && Z.build(S, 'fac', 'snack', at.snack.q, at.snack.r, 0).ok, 'the starter snack stand stands just outside the ring');
  ok(!('ring' in JSON.parse(Z.serialize(S))) && !S.items.some(i => 'ring' in i), 'the ring is worked out, never stored');
  // a second habitat exactly one walkway away shares ring hexes
  let spot = null; allSpots(S, 'hab', 'savanna', (q, r2, rot) => { if (Z.canPlace(S, 'hab', 'savanna', q, r2, rot) && Z.ringAt(S, 'savanna', q, r2, rot).some(c => Z.isRing(S, c[0], c[1]))) { spot = [q, r2, rot]; return false; } });
  ok(spot, 'a spot one walkway away exists'); const before = sortedKeys(Z.ringCells(S, h.id));
  const r2 = Z.build(S, 'hab', 'savanna', spot[0], spot[1], spot[2]); ok(r2.ok); const h2 = Z.item(S, r2.id);
  const shared = Object.keys(Z.c(S).ring).filter(k => Z.c(S).ring[k].length === 2); ok(shared.length >= 1, 'shared ring hexes'); shared.forEach(k => eq(Z.c(S).ring[k].slice().sort(), [h.id, h2.id].sort()));
  eq(sortedKeys(Z.ringCells(S, h2.id)), borderOf(S, h2)); ringsWhole(S);
  ok(Z.c(S).nb[h.id].some(o => o.id === h2.id) && Z.c(S).nb[h2.id].some(o => o.id === h.id), 'habitats that share a walkway are next to each other');
  // moving: the ring follows
  let far = null; allSpots(S, 'hab', 'savanna', (q, r3, rot) => { if (Z.canPlace(S, 'hab', 'savanna', q, r3, rot, h2.id) && !Z.ringAt(S, 'savanna', q, r3, rot, h2.id).some(c => before.indexOf(keyOf(c)) >= 0)) { far = [q, r3, rot]; return false; } });
  ok(far && Z.move(S, h2.id, far[0], far[1], far[2]).ok, 'moved away'); eq(sortedKeys(Z.ringCells(S, h2.id)), borderOf(S, h2), 'ring moved with it'); eq(sortedKeys(Z.ringCells(S, h.id)), before); ok(Object.keys(Z.c(S).ring).every(k => Z.c(S).ring[k].length === 1), 'no shared hexes left');
  ok(Z.move(S, h2.id, spot[0], spot[1], spot[2]).ok, 'moved back');
  // selling: only the hexes no other habitat needs go
  ok(Z.remove(S, h2.id).ok); eq(sortedKeys(Z.ringCells(S)), before, 'after the sale only the first habitat\'s ring is left'); eq(sortedKeys(Z.ringCells(S, h2.id)), []);
  ok(Z.remove(S, h.id).ok); eq(Z.ringCells(S), [], 'no habitats, no ring');
  return ring.length + ' ring hexes around a Savanna habitat, ' + shared.length + ' shared with a neighbour';
});

check('habitats can never touch and no building ever stands on a walkway (6 maps x 300 random builds, moves and sales; then every spot)', () => {
  let built = 0, refused = 0, spots = 0;
  const why = {};
  for (let t = 0; t < 6; t++) {
    const S = rich(NG()); S.rows = t % 2 ? D.GRID_H : 12; ringsWhole(S);
    const facs = D.FAC_ORDER.filter(f => !D.FAC[f].limit);
    for (let i = 0; i < 300; i++) {
      const kind = Math.random() < 0.45 ? 'hab' : 'fac', tt = kind === 'hab' ? D.BIOME_ORDER[Math.floor(Math.random() * D.BIOME_ORDER.length)] : facs[Math.floor(Math.random() * facs.length)];
      const a = Z.fromOffset(Math.floor(Math.random() * D.GRID_W), D.GRID_H - 1 - Math.floor(Math.random() * S.rows)), rot = Math.floor(Math.random() * 6);
      const roll = Math.random();
      if (roll < 0.7 || !S.items.length) { const pc = Z.placeCheck(S, kind, tt, a[0], a[1], rot), r = Z.build(S, kind, tt, a[0], a[1], rot); eq(r.ok, pc.ok, 'build agrees with placeCheck'); if (r.ok) built++; else { refused++; why[pc.why] = 1; ok(r.msg === pc.msg && pc.cells.length > 0); } }
      else if (roll < 0.9) { const it = S.items[Math.floor(Math.random() * S.items.length)], pc = Z.placeCheck(S, it.k, it.t, a[0], a[1], rot, it.id); eq(Z.move(S, it.id, a[0], a[1], rot).ok, pc.ok, 'move agrees with placeCheck'); }
      else { const it = S.items[Math.floor(Math.random() * S.items.length)]; Z.remove(S, it.id); }
      ringsWhole(S);
      S.items.forEach(h => { if (h.k === 'hab') eq(sortedKeys(Z.ringCells(S, h.id)), borderOf(S, h), 'ring of every habitat'); });
    }
    // every spot the engine calls legal really keeps the rule
    const occ = Z.occupancy(S);
    D.BIOME_ORDER.forEach(b => allSpots(S, 'hab', b, (q, r, rot) => { if (!Z.canPlace(S, 'hab', b, q, r, rot)) return; spots++; const cells = Z.cellsOf('hab', b, q, r, rot), own = {}; cells.forEach(c => { own[keyOf(c)] = 1; }); cells.forEach(c => { ok(Z.inLand(S, c[0], c[1]) && !occ[keyOf(c)] && !Z.isEntrance(c[0], c[1])); Z.DIRS.forEach(d => { const k = (c[0] + d[0]) + ',' + (c[1] + d[1]); ok(own[k] || !occ[k], 'a legal habitat spot touches something'); }); }); }));
    allSpots(S, 'fac', 'bench', (q, r) => { if (Z.canPlace(S, 'fac', 'bench', q, r, 0)) { spots++; ok(!Z.isRing(S, q, r), 'a legal building spot is on a ring'); } else if (Z.isRing(S, q, r) && !Z.isEntrance(q, r)) eq(Z.placeCheck(S, 'fac', 'bench', q, r, 0).why, 'ring'); });
  }
  ['land', 'taken', 'touch', 'crowd', 'ring'].forEach(k => ok(why[k], 'never saw the refusal reason ' + k));
  return built + ' built, ' + refused + ' refused, ' + spots + ' legal spots checked';
});

check('placeCheck says why not: land, entrance, taken, touch, crowd, ring; where it stands is always fine', () => {
  const S = rich(NG()), h = S.items[0], snack = S.items[1], e = Z.entrance(S), c0 = Z.cells(h)[0];
  eq(Z.placeCheck(S, 'fac', 'bench', 0, 0, 0).why, 'land'); eq(Z.placeCheck(S, 'fac', 'bench', e.q, e.r, 0).why, 'entrance'); eq(Z.placeCheck(S, 'fac', 'bench', c0[0], c0[1], 0).why, 'taken'); eq(Z.placeCheck(S, 'fac', 'bench', snack.q, snack.r, 0).why, 'taken');
  const ring = Z.ringCells(S, h.id); eq(Z.placeCheck(S, 'fac', 'bench', ring[0][0], ring[0][1], 0).why, 'ring');
  let touch = 0, crowd = 0; allSpots(S, 'hab', 'savanna', (q, r, rot) => { const pc = Z.placeCheck(S, 'hab', 'savanna', q, r, rot); if (pc.why === 'touch') { touch++; ok(pc.cells.every(c => Z.c(S).occ[keyOf(c)] === h.id), 'cells = the habitat hexes in the way'); } if (pc.why === 'crowd') { crowd++; ok(pc.cells.every(c => Z.c(S).occ[keyOf(c)] === snack.id)); } if (!pc.ok) ok(pc.msg.length <= 36 && !Z.canPlace(S, 'hab', 'savanna', q, r, rot)); else eq(pc, { ok: true }); });
  ok(touch > 0 && crowd > 0, 'touch ' + touch + ', crowd ' + crowd);
  eq(Z.placeCheck(S, 'hab', 'savanna', h.q, h.r, h.rot, h.id), { ok: true }); eq(Z.placeCheck(S, 'fac', 'snack', snack.q, snack.r, 0, snack.id), { ok: true });
  ok(Z.move(S, h.id, h.q, h.r, h.rot).ok, 'moving something onto its own spot');
});

check('"next to" reaches across the walkway: facility bonuses, facility combos and habitat pairs all still work', () => {
  const S = rich(NG()), h = S.items[0], d0 = Z.c(S).hab[h.id].draw; S.reports = [];
  ok(Z.c(S).nb[h.id].some(o => o.t === 'snack'), 'the starter snack stand counts as next to the habitat');
  let spot = null; for (const c of Z.ringCells(S, h.id)) for (const d of Z.DIRS) if (!spot && Z.canPlace(S, 'fac', 'bench', c[0] + d[0], c[1] + d[1], 0)) spot = [c[0] + d[0], c[1] + d[1]];
  const ghost = { id: -1, k: 'fac', t: 'bench', q: spot[0], r: spot[1], rot: 0 }; ok(Z.layout(S, S.items.concat([ghost])).active.some(a => a.id === 'picnic'), 'layout preview shows the combo');
  ok(Z.build(S, 'fac', 'bench', spot[0], spot[1], 0).ok); ok(Z.c(S).active.some(a => a.id === 'picnic' && a.anchor === h.id), 'Safari Picnic across the walkway'); ok(S.reports.some(r => r.type === 'combo' && r.id === 'picnic'));
  ok(Z.c(S).hab[h.id].adj >= D.FAC.bench.adjDraw - 1e-9 && Z.c(S).hab[h.id].draw > d0, 'the bench lifts the habitat');
  // a facility two walkways away is not next to it
  const T = rich(NG()), th = T.items[0]; let farSpot = null; allSpots(T, 'fac', 'bench', (q, r) => { if (!farSpot && Z.canPlace(T, 'fac', 'bench', q, r, 0) && !Z.ringCells(T, th.id).some(c => Z.DIRS.some(d => c[0] + d[0] === q && c[1] + d[1] === r))) { farSpot = [q, r]; } });
  const fb = Z.build(T, 'fac', 'bench', farSpot[0], farSpot[1], 0); ok(fb.ok); ok(!Z.c(T).nb[th.id].some(o => o.id === fb.id) && !Z.c(T).active.some(a => a.id === 'picnic'), 'too far away to count');
  // near misses point at spots that are legal and complete the combo
  const N = rich(NG()); N.knownCombos.picnic = true; const nm = Z.nearMisses(N).find(x => x.combo === 'picnic'); ok(nm && nm.fac === 'bench' && nm.cells.length > 0, 'near miss listed');
  nm.cells.forEach(c => { ok(Z.canPlace(N, 'fac', 'bench', c[0], c[1], 0), 'near-miss spot is legal'); ok(Z.layout(N, N.items.concat([{ id: -1, k: 'fac', t: 'bench', q: c[0], r: c[1], rot: 0 }])).active.some(a => a.id === 'picnic'), 'near-miss spot completes it'); });
  // habitat pairs: Ice and Fire with one walkway between them
  const P = rich(Z.newGame()); P.rows = D.GRID_H; const a = firstSpot(P, 'hab', 'arctic'); const ar = Z.build(P, 'hab', 'arctic', a[0], a[1], a[2]); ok(ar.ok);
  let ds = null; allSpots(P, 'hab', 'desert', (q, r, rot) => { if (!ds && Z.canPlace(P, 'hab', 'desert', q, r, rot) && Z.layout(P, P.items.concat([{ id: -1, k: 'hab', t: 'desert', q: q, r: r, rot: rot }])).active.some(x => x.id === 'icefire')) ds = [q, r, rot]; });
  ok(ds, 'a desert spot one walkway from the polar habitat'); ok(Z.build(P, 'hab', 'desert', ds[0], ds[1], ds[2]).ok); ok(Z.c(P).active.some(x => x.id === 'icefire'), 'Ice and Fire'); ringsWhole(P);
});

check('a layout built before R7 (things touching) loads untouched, keeps its bonuses, and gets rings on its free bordering hexes', () => {
  const S = rich(NG()), h = S.items[0]; let bq = null;
  for (const c of Z.cells(h)) for (const d of Z.DIRS) { const q = c[0] + d[0], r = c[1] + d[1]; if (!bq && Z.inLand(S, q, r) && !Z.c(S).occ[q + ',' + r] && !Z.isEntrance(q, r)) bq = [q, r]; }
  const bench = { id: S.nextId++, k: 'fac', t: 'bench', q: bq[0], r: bq[1], rot: 0 }; S.items.push(bench); // the old way: a bench right against the fence
  let hs = null; allSpots(S, 'hab', 'savanna', (q, r, rot) => { if (hs) return; const cells = Z.cellsOf('hab', 'savanna', q, r, rot), occ = Z.occupancy(S); if (cells.every(c => Z.inLand(S, c[0], c[1]) && !occ[keyOf(c)] && !Z.isEntrance(c[0], c[1])) && cells.some(c => Z.DIRS.some(d => occ[(c[0] + d[0]) + ',' + (c[1] + d[1])] === h.id))) hs = [q, r, rot]; });
  const h2 = { id: S.nextId++, k: 'hab', t: 'savanna', n: 2, q: hs[0], r: hs[1], rot: hs[2], lvl: 1, buzz: 0, buzzAt: 0, lastTheme: null, eventAt: -99 }; S.items.push(h2); S.habN.savanna = 2; // and a habitat touching the first
  Z.refresh(S); const str = Z.serialize(S), L = Z.deserialize(str); ok(L, 'loads'); eq(L.items, JSON.parse(str).items, 'layout untouched'); eq(Z.serialize(L), str, 'round trip is exact');
  L.items.forEach(it => { if (it.k === 'hab') eq(sortedKeys(Z.ringCells(L, it.id)), borderOf(L, it), 'ring on the free bordering hexes'); });
  ok(!Z.isRing(L, bench.q, bench.r), 'the old bench is not a ring hex'); ok(Z.c(L).nb[h.id].some(o => o.id === bench.id) && Z.c(L).nb[h.id].some(o => o.id === h2.id), 'touching still counts as next to');
  ok(Z.c(L).active.some(a => a.id === 'picnic'), 'the old Safari Picnic still stands'); ok(Z.c(L).hab[h.id].adj > 0);
  ok(Z.move(L, bench.id, bench.q, bench.r).ok && Z.move(L, h2.id, h2.q, h2.r, h2.rot).ok, 'old items may stay where they are');
  const ring = Z.ringCells(L, h.id); ok(!Z.move(L, bench.id, ring[0][0], ring[0][1]).ok, 'but a move must follow the new rule');
  tickN(L, 30); eq(L.week, S.week + 30); ok(Z.remove(L, bench.id).ok); ok(Z.isRing(L, bench.q, bench.r), 'once the old bench is sold its hex becomes walkway');
});

check('bestOf: the best of two or more of the same species and sex; habAnimals: who lives where, in display order', () => {
  const S = NG(), h = S.items[0], m = S.animals.find(a => a.sex === 'M'), f = S.animals.find(a => a.sex === 'F');
  eq([Z.bestOf(S, m), Z.bestOf(S, f)], [false, false], 'one of a kind is not marked');
  const mk = (sp, sex, v, hab) => { const a = { id: S.nextId++, sp: sp, name: sp + v, sex: sex, charm: v, vigor: v, wit: v, variant: false, gen: 1, born: null, hab: hab, rest: 0, sick: 0 }; S.animals.push(a); return a; };
  Object.assign(m, { charm: 30, vigor: 30, wit: 30 }); Object.assign(f, { charm: 20, vigor: 20, wit: 20 });
  const m2 = mk('zebra', 'M', 40, h.id), m3 = mk('zebra', 'M', 10, null), w = mk('warthog', 'F', 90, h.id);
  eq([Z.bestOf(S, m), Z.bestOf(S, m2), Z.bestOf(S, m3), Z.bestOf(S, f), Z.bestOf(S, w)], [false, true, false, false, false]); eq(Z.bestOf(S, m2.id), true, 'by id');
  eq(Z.bestOf(S, { id: -5, sp: 'zebra', sex: 'M', charm: 99, vigor: 99, wit: 99 }), false, 'only animals you own');
  S.animals.filter(a => a.sp === 'zebra' && a.sex === 'M').forEach(a => { const c = Z.compareOwned(S, { id: -1, sp: 'zebra', sex: 'M', charm: a.charm, vigor: a.vigor, wit: a.wit }); eq(Z.bestOf(S, a), c.best.avg === Math.round(Z.avg(a)), 'same measure as the buying comparison'); });
  const tie = mk('zebra', 'M', 40, h.id); eq([Z.bestOf(S, m2), Z.bestOf(S, tie)], [true, false], 'on a tie exactly one is marked');
  const list = Z.habAnimals(S, h.id); eq(list.map(x => x.id), [w.id, f.id, m2.id, tie.id, m.id], 'species in book order, females first, best first');
  list.forEach(x => { const a = Z.animal(S, x.id); eq([x.sp, x.sex, x.grade, x.avg, x.name, x.variant, x.best], [a.sp, a.sex, Z.grade(Z.avg(a)), Math.round(Z.avg(a)), a.name, false, Z.bestOf(S, a)]); eq(typeof x.juv, 'boolean'); });
  eq(Z.habAnimals(S, null).map(x => x.id), [m3.id], 'null = the holding pen'); eq(Z.habAnimals(S, 99999), []);
  S.money = 1e6; const c = Z.openCrate(S); Z.arrivalChoices(S, c.animal.id).forEach(ch => eq(ch.animals, Z.habAnimals(S, ch.hab), 'arrivalChoices carries the animals living there'));
});

check('nextGoal is never null and always has kind, icon, cur, target (bare land, every rank, the end game, every week of a bot run, every level)', () => {
  const kinds = {}, good = g => { ok(g && typeof g.kind === 'string' && typeof g.icon === 'string' && g.icon && typeof g.cur === 'number' && typeof g.target === 'number' && isFinite(g.cur) && isFinite(g.target), 'bad goal ' + JSON.stringify(g)); eq(g.icon, D.GOAL_ICON[g.kind]); kinds[g.kind] = 1; return g; };
  const B = Z.newGame(); eq(good(Z.nextGoal(B)), { kind: 'open', icon: 'habitat', cur: 0, target: 1 });
  const S = NG(); eq(good(Z.nextGoal(S)), { kind: 'rank', icon: 'rep', cur: 0, target: D.RANK_REP[1], rank: 2 });
  for (let r = 1; r < 10; r++) { S.rep = D.RANK_REP[r - 1] + 1; const g = good(Z.nextGoal(S)); eq([g.kind, g.cur, g.target, g.rank], ['rank', S.rep, D.RANK_REP[r], r + 1]); ok(g.cur < g.target); }
  S.rep = D.RANK_REP[9]; let g = good(Z.nextGoal(S)); eq([g.kind, g.cur, g.target], ['species', Z.speciesCount(S), D.SPECIES_LIST.length]);
  D.SPECIES_LIST.forEach(s => { S.book[s.id] = { variant: false, bred: false, best: 1, at: 0 }; }); g = good(Z.nextGoal(S)); eq([g.kind, g.cur, g.target], ['variants', 0, D.SPECIES_LIST.length]);
  D.SPECIES_LIST.forEach(s => { S.book[s.id].variant = true; }); S.money = 2345678; g = good(Z.nextGoal(S)); eq([g.kind, g.target], ['money', 1e7]); S.money = -50; ok(good(Z.nextGoal(S)).target > 0); S.finished = true; good(Z.nextGoal(S));
  const tick = Z.tick; let n = 0; Z.tick = function (T) { good(Z.nextGoal(T)); tick(T); good(Z.nextGoal(T)); n++; };
  try { bot(0.8, false); D.LEVELS.forEach(L => bot(0.8, false, { level: L.id })); } finally { Z.tick = tick; }
  D.LEVELS.forEach(L => { const C = Z.newChallenge(L.id), c = good(Z.nextGoal(C)), st = Z.challengeStatus(C); eq([c.kind, c.cur, c.target, c.weeksLeft, c.challenge], [L.goal.kind, st.cur, st.target, L.weeks, true]); });
  return n + ' weeks checked, kinds seen: ' + Object.keys(kinds).join(', ');
});

check('star-level expeditions: the Send out lookup (stars, locks, cost, weeks, odds) and the action agree', () => {
  eq(D.EXP_STAR.length, 6); const S = NG(), ex = S.staff[1].id; S.money = 1e9;
  D.BIOME_ORDER.forEach(b => {
    const list = Z.expStars(S, b, [ex]), g = Z.expStarRange(b); eq(g, D.BIOMES[b].secret ? [4, 5] : [1, 5]); eq(list.map(x => x.star), g[0] === 4 ? [4, 5] : [1, 2, 3, 4, 5]);
    list.forEach((x, i) => {
      eq(x.name, D.RARITY.name[x.star]); eq(x.rank, D.EXP_STAR[x.star].rank); eq(x.unlocked, x.lock === ''); eq(x.cost, Z.expCost(b, x.star)); eq(x.weeks, Z.expWeeks(S, b, [ex], x.star));
      if (i) { ok(x.cost > list[i - 1].cost, b + ': a higher star costs more'); ok(x.weeks >= list[i - 1].weeks, b + ': and never takes less time'); }
      const sum = Object.keys(x.odds).reduce((t, k) => t + x.odds[k], 0); ok(Math.abs(sum - 1) < 1e-6, 'odds add up'); ok(x.odds[x.star] >= 0.5, 'centred on the chosen star');
      Object.keys(x.odds).forEach(k => { ok(Math.abs(k - x.star) <= 1, 'only one star either side'); ok(+k === x.star || x.odds[k] < x.odds[x.star], 'side chances are smaller'); ok(D.SPECIES_LIST.some(s => s.biome === b && s.rarity === +k), 'no odds for a rarity the region does not have'); });
      eq(Z.expOdds(S, b, Z.teamPower(S, [ex]), x.star).byRarity, x.odds); eq(x.ratio, Z.teamPower(S, [ex]) / D.BIOMES[b].diff);
    });
    eq(list[0].cost, D.BIOMES[b].exp, 'the lowest star is the region\'s base price'); eq(list[0].weeks, D.BIOMES[b].weeks - 1, 'and base length (an explorer saves a week)');
    ok(list[list.length - 1].weeks > list[0].weeks, 'the top star takes longer');
  });
  // a new zoo can run 1 and 2 stars; the rest unlock by zoo rank
  eq(Z.expStars(S, 'savanna', [ex]).map(x => x.unlocked), [true, true, false, false, false]); eq(Z.expStars(S, 'savanna', [ex])[2].lock, 'Rank ' + D.EXP_STAR[3].rank);
  ok(D.EXP_STAR[1].rank === 1 && D.EXP_STAR[2].rank === 1);
  for (let st = 1; st <= 5; st++) { const T = NG(); T.money = 1e9; T.rep = D.RANK_REP[D.EXP_STAR[st].rank - 1]; ok(Z.expStars(T, 'savanna', [T.staff[1].id])[st - 1].unlocked); const m = T.money, r = Z.startExpedition(T, 'savanna', [T.staff[1].id], st); ok(r.ok, 'star ' + st + ' at its rank'); eq(T.money, m - Z.expCost('savanna', st)); const p = Z.project(T, r.pid); eq([p.star, p.end - p.start], [st, Z.expWeeks(T, 'savanna', [T.staff[1].id], st)]); eq(Z.projectInfo(T, p).star, st); ok(p.budget === undefined);
    if (D.EXP_STAR[st].rank > 1) { const U = NG(); U.money = 1e9; U.rep = D.RANK_REP[D.EXP_STAR[st].rank - 1] - 1; const no = Z.startExpedition(U, 'savanna', [U.staff[1].id], st); ok(!no.ok && /rank/.test(no.msg), 'star ' + st + ' refused below its rank'); eq(U.projects.length, 0); } }
  ok(!Z.startExpedition(S, 'savanna', [ex], 6).ok && !Z.startExpedition(S, 'savanna', [ex], -1).ok, 'no such star'); const d = Z.startExpedition(S, 'savanna', [ex]); ok(d.ok && Z.project(S, d.pid).star === 1, 'no star given = the lowest');
  // a stronger team (Scouting) has better odds: less below, more above
  const W = NG(), weak = Z.expStars(W, 'savanna', [W.staff[1].id])[1]; W.staff[1].exp = 99; W.staff[1].care = 99; const strong = Z.expStars(W, 'savanna', [W.staff[1].id])[1]; ok(strong.odds[1] < weak.odds[1] && strong.odds[3] > weak.odds[3], 'Scouting improves the odds');
  // selling the finds of a cheap run never pays for the run (value at ordinary stats)
  for (let st = 1; st <= 5; st++) { const o = Z.expStars(W, 'savanna', [W.staff[1].id])[st - 1].odds; let evv = 0; Object.keys(o).forEach(k => { evv += o[k] * D.RARITY.value[k]; }); ok(Z.expCost('savanna', st) >= evv * (1 + D.EXP_TWO), 'a ' + st + ' star Savanna run costs $' + Z.expCost('savanna', st) + ', less than the $' + Math.round(evv * (1 + D.EXP_TWO)) + ' its finds sell for (strongest team)'); }
  return 'Savanna runs cost ' + [1, 2, 3, 4, 5].map(st => '$' + Z.expCost('savanna', st)).join(' / ') + ', take ' + [1, 2, 3, 4, 5].map(st => Z.expWeeks(S, 'savanna', [], st)).join(' / ') + ' weeks';
});

check('star-level expeditions: finds centre on the chosen star as the odds table says (3 x 700 runs), report and reveal carry the star', () => {
  const out = [];
  [['savanna', 2, 1], ['savanna', 4, 1], ['paleo', 5, 2]].forEach(cfg => {
    const tally = {}; let n = 0, odds = null;
    for (let i = 0; i < 700; i++) {
      const S = NG(); S.money = 1e9; S.rep = D.RANK_REP[6]; S.regions.paleo = true; S.staff[1].exp = cfg[0] === 'paleo' ? 99 : 30; S.staff[1].care = 10; S.staff[0].care = 20; if (cfg[2] === 2) S.staff[0].exp = 99; // fixed skills, so every run has the same odds
      const ids = cfg[2] === 2 ? [S.staff[1].id, S.staff[0].id] : [S.staff[1].id];
      odds = Z.expStars(S, cfg[0], ids).find(x => x.star === cfg[1]).odds; ok(Z.startExpedition(S, cfg[0], ids, cfg[1]).ok);
      let rep = null; for (let w = 0; w < 20 && !rep; w++) { S.reports = []; Z.tick(S); rep = S.reports.find(r => r.type === 'expedition'); }
      ok(rep && rep.star === cfg[1], 'report carries the star'); rep.found.forEach(f => { tally[f.rarity] = (tally[f.rarity] || 0) + 1; n++; ok(Math.abs(f.rarity - cfg[1]) <= 1, 'a find more than one star away'); eq(D.SPECIES[f.sp].biome, cfg[0]); });
    }
    Object.keys(odds).forEach(k => ok(Math.abs((tally[k] || 0) / n - odds[k]) < 0.07, cfg[0] + ' ' + cfg[1] + ' star: rarity ' + k + ' came ' + ((tally[k] || 0) / n).toFixed(2) + ', odds say ' + odds[k]));
    out.push(cfg[1] + ' star ' + cfg[0] + ': ' + Object.keys(odds).map(k => k + ' star ' + Math.round(100 * (tally[k] || 0) / n) + '%').join(', '));
  });
  return out.join(' | ');
});

check('an expedition sent before star levels (old save: budget, no star) still loads, shows and comes home', () => {
  const S = NG(); S.money = 1e6; const r = Z.startExpedition(S, 'savanna', [S.staff[1].id], 1); tickN(S, 1);
  const o = JSON.parse(Z.serialize(S)); const p = o.projects.find(x => x.id === r.pid); delete p.star; p.budget = 2; p.power = p.power * 1.5;
  const L = Z.deserialize(JSON.stringify(o)); ok(L, 'loads'); const lp = Z.project(L, r.pid); ok(lp && lp.star === undefined && lp.budget === 2); eq(Z.projectInfo(L, lp).star, null); eq(Z.runningList(L).length, 1);
  let rep = null; for (let w = 0; w < 12 && !rep; w++) { L.reports = []; Z.tick(L); rep = L.reports.find(x => x.type === 'expedition'); }
  ok(rep && rep.found.length >= 1 && rep.star === null, 'came home'); rep.found.forEach(f => ok(Z.arrival(L, f.id)));
  ok(Z.startExpedition(L, 'savanna', [L.staff[1].id], 2).ok, 'and the next one is a star run');
});

check('rare treats: a project choice comes up about a quarter as often; an event still gets its star animal', () => {
  eq(D.CHOICE_CHANCE, 0.25); eq(Z.debug.alwaysChoices(false), false);
  let marks = 0, asked = 0, events = 0, starred = 0;
  for (let t = 0; t < 700; t++) {
    const S = NG(); S.money = 1e6; S.rp = 1e4;
    Z.startEvent(S, S.items[0].id, 'feeding', S.staff[0].id); Z.startExpedition(S, 'savanna', [S.staff[1].id], 1); marks += 3; events++;
    for (let w = 0; w < 8; w++) { S.reports = []; Z.tick(S); asked += S.reports.filter(r => r.type === 'choice').length; const rv = S.reports.find(r => r.type === 'review'); if (rv && rv.star && rv.star.gain > 0) starred++; }
    eq(S.projects.length, 0);
  }
  const share = asked / marks; ok(Math.abs(share - D.CHOICE_CHANCE) < 0.04, 'choices came up at ' + share.toFixed(3) + ' of the old rate'); eq(starred, events, 'every event had a star animal');
  return 'choices at ' + Math.round(100 * share) + '% of the old rate';
});

// ----- challenge mode -----
// make the goal true right now, the honest way for each kind
function reachGoal(S) {
  const L = Z.level(S), g = L.goal;
  if (g.kind === 'money') S.money = g.target + 5000;
  else if (g.kind === 'rank') S.rep = D.RANK_REP[g.target - 1];
  else if (g.kind === 'bred') S.ch.best = g.target;
  else if (g.kind === 'species') D.SPECIES_LIST.filter(s => s.biome === g.biome).slice(0, g.target).forEach(s => S.animals.push({ id: S.nextId++, sp: s.id, name: 'G' + s.id, sex: 'M', charm: 20, vigor: 20, wit: 20, variant: false, gen: 1, born: null, hab: null, rest: 0, sick: 0 }));
  else { // visitors: a top habitat full of crowd-pullers
    let h = S.items.find(i => i.k === 'hab'); if (!h) { const at = Z.starterSpots(); S.money += D.BIOMES.savanna.hab; h = Z.item(S, Z.build(S, 'hab', 'savanna', at.hab.q, at.hab.r, 0).id); } h.lvl = 5;
    for (let i = 0; i < 8; i++) S.animals.push({ id: S.nextId++, sp: 'rhino', name: 'V' + i, sex: 'M', charm: 95, vigor: 95, wit: 95, variant: true, gen: 1, born: null, hab: h.id, rest: 0, sick: 0 });
  }
}

check('challenge: five levels as data; each can be started and is a separate small zoo that gets nothing from the long-term game', () => {
  eq(D.LEVELS.map(l => l.n), [1, 2, 3, 4, 5]); eq(new Set(D.LEVELS.map(l => l.id)).size, 5);
  eq(Z.newChallenge('nope'), null); eq(Z.challengeStatus(NG()), null); eq(Z.level(NG()), null); eq(NG().ch, undefined);
  D.LEVELS.forEach(L => {
    ok(L.id && L.name && L.name.length <= 14 && L.goal && L.goal.kind && L.goal.target > 0 && L.weeks > 0 && L.rows >= 3 && L.rows <= D.GRID_H && L.money >= 0, L.id + ' fields');
    ok(L.stars.length === 2 && L.stars[0] < L.stars[1] && L.stars[1] < L.weeks, L.id + ' star weeks in order'); ok(D.GOAL_ICON[L.goal.kind]);
    const mins = L.weeks * D.CH_WEEK_SEC / 60; ok(mins >= 8 && mins <= 12, L.id + ' time limit is about 10 minutes at speed 2 (' + mins + ')');
    const S = Z.newChallenge(L.id); ok(S && S.ch && S.ch.id === L.id && S.ch.n === L.n && S.v === Z.SAVE_VERSION); eq(Z.newChallenge(L.n).ch.id, L.id, 'by number');
    eq([S.money, S.rows, S.week, S.ng, S.rep], [L.money, L.rows, 0, 0, 0]); eq(Z.level(S), L); eq(S.reports, []);
    eq(S.items.length, L.start === 'starter' ? 2 : 0); if (L.animals) { eq(S.animals.map(a => [a.sp, a.sex]), L.animals.map(a => [a[0], a[1]])); ok(S.animals.every(a => a.hab === (L.start === 'starter' ? S.items[0].id : null)), L.id + ': the starting animals live in its starter habitat, or wait in the pen on bare land'); ok(S.animals.length <= Z.holdCap(S), 'they fit the pen'); eq(Object.keys(S.book).sort(), [...new Set(L.animals.map(a => a[0]))].sort()); } else eq(S.animals.length, 2);
    if (L.staff) eq(S.staff.map(s => s.role), L.staff.map(s => s[0])); (L.research || []).forEach(id => ok(S.research[id]));
    S.items.forEach(it => Z.cells(it).forEach(c => ok(Z.inLand(S, c[0], c[1]), 'starting items on the level\'s land')));
    const at = Z.starterSpots(); if (L.start !== 'starter') { ok(Z.canPlace(S, 'hab', 'savanna', at.hab.q, at.hab.r, 0) && Z.canPlace(S, 'fac', 'snack', at.snack.q, at.snack.r, 0), L.id + ': room for the starter on its map'); ok(S.money >= D.BIOMES.savanna.hab + D.FAC.snack.cost); }
    let owned = 0; for (let r = 0; r < D.GRID_H; r++) for (let q = -20; q < 20; q++) if (Z.inLand(S, q, r)) owned++; eq(owned, L.rows * D.GRID_W, 'map size');
    const st = Z.challengeStatus(S); eq([st.id, st.level, st.kind, st.icon, st.week, st.weeks, st.weeksLeft, st.starsNow, st.done, st.failed, st.stars], [L.id, L.n, L.goal.kind, D.GOAL_ICON[L.goal.kind], 0, L.weeks, L.weeks, 3, false, false, null]);
    ok(typeof st.cur === 'number' && st.cur < st.target, L.id + ' does not start already won'); if (L.goal.kind === 'rank') eq([st.target, st.rank, st.rankNow], [D.RANK_REP[L.goal.target - 1], L.goal.target, 1]); else eq(st.target, L.goal.target); if (L.goal.kind === 'bred') eq(st.grade, Z.grade(L.goal.target));
  });
  return D.LEVELS.map(l => l.n + ' ' + l.name + ' (' + l.goal.kind + ' ' + l.goal.target + ', ' + l.weeks + ' weeks, stars by ' + l.stars.join('/') + ')').join('; ');
});

check('challenge: the report fires once with the right stars (3 / 2 / 1 by the week reached, 0 when time runs out) and the level then stands still', () => {
  let n = 0;
  D.LEVELS.forEach(L => {
    [[L.stars[0], 3], [L.stars[0] + 1, 2], [L.stars[1], 2], [L.stars[1] + 1, 1], [L.weeks, 1], [5, 3]].forEach(pair => {
      const S = Z.newChallenge(L.id); S.week = pair[0] - 1; S.hapAt = 9999; reachGoal(S); Z.refresh(S);
      eq(Z.challengeStatus(S).starsNow, pair[1], L.id + ' starsNow before week ' + pair[0]); S.reports = []; Z.tick(S);
      const reps = S.reports.filter(r => r.type === 'challenge'); eq(reps.length, 1, L.id + ' one report'); eq(reps[0], { type: 'challenge', level: L.id, n: L.n, stars: pair[1], week: pair[0] });
      const st = Z.challengeStatus(S); eq([st.done, st.failed, st.stars, st.starsNow, st.week], [true, false, pair[1], pair[1], pair[0]]); ok(st.cur >= st.target, L.id + ' goal shown as reached');
      S.fx = []; S.reports = []; const snap = Z.serialize(S); S.fx = [{ type: 'money' }]; tickN(S, 6); eq(S.week, pair[0], 'ticks do nothing after'); eq(S.reports, []); eq(S.fx, [], 'a tick after the end only clears the floor pop-ups'); eq(Z.serialize(S), snap, 'nothing changes after the end'); n++;
    });
    // time runs out: stars 0, failed
    const F = Z.newChallenge(L.id), seen = []; let weeks = 0;
    for (let w = 0; w < L.weeks + 10; w++) { F.reports = []; Z.tick(F); F.reports.forEach(r => seen.push(r.type)); if (F.reports.some(r => r.type === 'challenge')) { weeks = F.week; eq(F.reports.find(r => r.type === 'challenge'), { type: 'challenge', level: L.id, n: L.n, stars: 0, week: L.weeks }); } else if (!F.ch.done) { const st = Z.challengeStatus(F); eq([st.week, st.weeksLeft, st.starsNow], [F.week, L.weeks - F.week, F.week + 1 <= L.stars[0] ? 3 : F.week + 1 <= L.stars[1] ? 2 : 1]); } }
    eq(weeks, L.weeks, L.id + ' ends at its time limit'); eq(seen.filter(t => t === 'challenge').length, 1); eq(F.week, L.weeks); const st = Z.challengeStatus(F); eq([st.done, st.failed, st.stars, st.weeksLeft], [true, true, 0, 0]);
    ['yearend', 'yearlyplan', 'yearly', 'show', 'showresult', 'final'].forEach(t => ok(seen.indexOf(t) < 0, L.id + ': a ' + t + ' report in a challenge')); eq([F.history.length, F.finished, F.yearly, F.show], [0, false, null, null]); n++;
  });
  return n + ' endings';
});

check('challenge: the breeding goal counts babies bred in the level; goals are only judged at the week\'s end', () => {
  Z.debug.alwaysChoices(false); let best = 0, births = 0;
  for (let t = 0; t < 30 && !births; t++) {
    const S = Z.newChallenge('breed'), h = S.items[0]; eq(S.ch.best, 0);
    const pr = Z.readyPairs(S, h.id)[0]; ok(pr, 'a pair is ready at the start'); ok(Z.startBreeding(S, pr[0], pr[1], S.staff[0].id).ok);
    let rep = null; for (let w = 0; w < 12 && !rep; w++) { S.reports = []; Z.tick(S); rep = S.reports.find(r => r.type === 'birth'); }
    if (rep && !rep.fail) { births++; best = Math.max.apply(null, rep.kids.map(k => Z.avg(Z.arrival(S, k.id).a))); ok(Math.abs(S.ch.best - best) < 1e-9, 'best baby recorded'); eq(Z.challengeStatus(S).cur, Math.round(best)); rep.kids.forEach(k => Z.sellArrival(S, k.id)); eq(Z.challengeStatus(S).cur, Math.round(best), 'a sold baby still counts'); }
  }
  ok(births, 'a birth happened');
  const M = Z.newChallenge('broke'); M.money = 1e6; Z.refresh(M); eq(M.ch.done, false, 'not judged inside an action'); eq(M.reports.filter(r => r.type === 'challenge').length, 0);
  return 'first baby ' + Math.round(best) + ' against the goal ' + D.LEVELS.find(l => l.id === 'breed').goal.target;
});

check('challenge: restrictions refuse what they should, the lookup agrees, and a normal zoo is never restricted', () => {
  const N = NG(); N.money = 1e9; ['hab', 'biome', 'expedition', 'research', 'land', 'yearly', 'breed', 'event', 'crate', 'buy', 'hire', 'campaign', 'anything'].forEach(w => eq(Z.allowed(N, w, 'jungle'), { ok: true }, 'normal zoo: ' + w));
  D.LEVELS.forEach(L => {
    const S = Z.newChallenge(L.id); S.money = 1e9; S.rp = 1e6; S.rep = D.RANK_REP[6];
    // every level: the map never grows, no yearly events
    eq(Z.nextLand(S), null); const bl = Z.buyLand(S); ok(!bl.ok && bl.msg, L.id + ' land refused'); eq(S.rows, L.rows); eq(Z.allowed(S, 'land').ok, false); eq(Z.allowed(S, 'yearly').ok, false); eq(Z.debug.yearly(S, 'openday'), false); eq(S.yearly, null);
    const at = Z.starterSpots(); if (!S.items.length) ok(Z.build(S, 'hab', 'savanna', at.hab.q, at.hab.r, 0).ok, L.id + ' first habitat');
    const ex = S.staff[S.staff.length - 1].id;
    if (L.biomes) { // savanna only
      D.BIOME_ORDER.filter(b => L.biomes.indexOf(b) < 0).forEach(b => {
        eq(Z.allowed(S, 'biome', b).ok, false); eq(Z.allowed(S, 'hab', b).ok, false); eq(Z.allowed(S, 'expedition', b).ok, false);
        const rr = Z.researchList(S).find(x => x.id === 'region:' + b); if (rr) { ok(rr.lock, b + ' research shown locked'); const dr = Z.doResearch(S, 'region:' + b); ok(!dr.ok && dr.msg, b + ' research refused'); eq(Z.allowed(S, 'research', 'region:' + b).ok, false); }
        ok(!S.regions[b]); S.regions[b] = true; // even if a region were somehow open, its habitats and expeditions stay refused
        const sp = firstSpot(S, 'hab', b); if (sp) { const r = Z.build(S, 'hab', b, sp[0], sp[1], sp[2]); ok(!r.ok && r.msg, b + ' habitat refused'); }
        const e = Z.startExpedition(S, b, [ex], Z.expStarRange(b)[0]); ok(!e.ok && e.msg, b + ' expedition refused'); ok(Z.expStars(S, b, [ex]).every(x => !x.unlocked && x.lock), b + ' stars shown locked');
        delete S.regions[b];
      });
      L.biomes.forEach(b => { eq(Z.allowed(S, 'biome', b), { ok: true }); eq(Z.allowed(S, 'hab', b), { ok: true }); }); ok(Z.startExpedition(S, 'savanna', [ex], 1).ok, 'savanna expedition allowed'); eq(Z.allowed(S, 'research', 'tech:hab3'), { ok: true });
      for (let i = 0; i < 40; i++) { Z.debug.caller(S, i % 2 ? 'trader' : 'director'); S.offers.list.forEach(o => ok(L.biomes.indexOf(Z.sp(o.a).biome) >= 0, 'an offer from outside the level')); const ci = Z.crateInfo(S); if (ci) ci.pool.forEach(id => ok(L.biomes.indexOf(D.SPECIES[id].biome) >= 0)); }
    }
    if ((L.no || []).indexOf('expedition') >= 0) { eq(Z.allowed(S, 'expedition').ok, false); eq(Z.allowed(S, 'expedition', 'savanna').ok, false); const m = S.money, e = Z.startExpedition(S, 'savanna', [ex], 1); ok(!e.ok && e.msg && e.msg.length <= 30, 'expedition refused'); eq(S.money, m); eq(S.projects.length, 0); const stars = Z.expStars(S, 'savanna', [ex]); eq(stars.length, 5); ok(stars.every(x => !x.unlocked && x.lock === e.msg), 'every star shown locked with the reason'); }
    else if (!L.biomes) ok(Z.allowed(S, 'expedition', 'savanna').ok && Z.startExpedition(S, 'savanna', [ex], 1).ok, L.id + ' expeditions allowed');
    if (L.maxHabs) { let n = S.items.filter(i => i.k === 'hab').length; while (n < L.maxHabs) { eq(Z.allowed(S, 'hab', 'savanna'), { ok: true }); const sp = firstSpot(S, 'hab', 'savanna'); ok(sp && Z.build(S, 'hab', 'savanna', sp[0], sp[1], sp[2]).ok, 'habitat ' + (n + 1) + ' fits on the tiny map'); n++; }
      const a = Z.allowed(S, 'hab', 'savanna'); ok(!a.ok && /habitats/.test(a.msg)); const sp = firstSpot(S, 'hab', 'savanna'); ok(sp, 'there is room, so only the rule stops it'); const r = Z.build(S, 'hab', 'savanna', sp[0], sp[1], sp[2]); ok(!r.ok && r.msg === a.msg, 'habitat ' + (L.maxHabs + 1) + ' refused'); eq(S.items.filter(i => i.k === 'hab').length, L.maxHabs);
      ok(Z.remove(S, S.items.find(i => i.k === 'hab' && !Z.inHab(S, i.id).length).id).ok); ok(Z.allowed(S, 'hab', 'savanna').ok, 'after selling one, another may be built'); ok(Z.build(S, 'fac', 'bench', ...firstSpot(S, 'fac', 'bench').slice(0, 2), 0).ok, 'buildings are not limited'); }
    else { const sp = firstSpot(S, 'hab', 'savanna'); if (sp) ok(Z.allowed(S, 'hab', 'savanna').ok && Z.build(S, 'hab', 'savanna', sp[0], sp[1], sp[2]).ok, L.id + ' more habitats allowed'); }
  });
});

check('challenge: serialize and deserialize round-trip a level mid-way and after its end; a normal save has no challenge in it', () => {
  D.LEVELS.forEach(L => {
    const tick = Z.tick, saved = []; Z.tick = function (S) { tick(S); if (S.ch && !S.ch.done && S.week % 3 === 0) saved.push(Z.serialize(S)); }; // every 3 weeks: a skilled player can end level 4 by week 7
    let end; try { end = bot(0.8, false, { level: L.id }).S; } finally { Z.tick = tick; }
    ok(saved.length >= 1, L.id + ' saved mid-way');
    saved.forEach(str => { const S = Z.deserialize(str); ok(S && S.ch && S.ch.id === L.id, 'loaded'); eq(Z.serialize(S), str, L.id + ' round trip is exact'); eq(Z.challengeStatus(S), Z.challengeStatus(JSON.parse(str).ch ? Z.deserialize(str) : null)); eq(Z.level(S), L);
      const w = S.week; let reps = 0; for (let i = 0; i < L.weeks + 5; i++) { S.reports = []; Z.tick(S); reps += S.reports.filter(r => r.type === 'challenge').length; } eq(reps, 1, L.id + ' a loaded level still ends with one report'); ok(S.ch.done && S.week > w && S.week <= L.weeks); eq(Z.allowed(S, 'land').ok, false, 'restrictions survive a load'); });
    const str = Z.serialize(end), E = Z.deserialize(str); eq(Z.serialize(E), str); eq(Z.challengeStatus(E), Z.challengeStatus(end)); ok(E.ch.done); E.reports = []; Z.tick(E); eq(E.reports, []); eq(E.week, end.week);
  });
  const N = Z.deserialize(Z.serialize(NG())); eq(N.ch, undefined); eq(Z.challengeStatus(N), null); ok(Z.nextLand(N));
});

// R7 tester round: the judge for "1 star is reachable" is now a careful first-timer (bot profile 'first'), not the sensible bot.
// The old line "the sensible bot's median finish is week 30 or later" is replaced on purpose: a skilled breeder can win level 4
// on the first baby. In its place, stricter tests of the new aim: the first-timer wins often, 3 stars are reachable, idling never wins.
check('bot: every challenge level can be played to its end; a careful first-timer usually gets 1 star, a skilled player can get 3, an idle zoo never wins (5 x (40 + 20) + 5 x 3 runs)', () => {
  const out = [];
  D.LEVELS.forEach(L => {
    const f = bot.challenge(L.id, 40, bot.FIRST_SKILL, true); // true rate about 75 to 100% per level; 55% leaves room for chance in 40 runs
    ok(f.won >= 0.55, L.id + ': the first-timer got a star in only ' + Math.round(100 * f.won) + '% of 40 runs');
    ok(f.stars[3] < 40, L.id + ': the first-timer got 3 stars every time');
    const g = bot.challenge(L.id, 20, 1); ok(g.won >= 0.9, L.id + ': the sensible bot finished only ' + Math.round(100 * g.won) + '%'); ok(g.stars[3] >= 1, L.id + ': 3 stars were never reached by the sensible bot in 20 runs');
    for (let i = 0; i < 3; i++) { const idle = bot(0, false, { level: L.id }); eq([idle.stars, idle.week], [0, L.weeks], L.id + ': doing nothing must not win'); }
    out.push(L.n + ': first-timer ' + Math.round(100 * f.won) + '% (stars ' + f.stars.slice(1).join('/') + '), skilled 3 stars ' + g.stars[3] + '/20');
  });
  return out.join(' | ');
});

check('removeRefund: half the list price for a placed item or a kind, 0 for nothing; remove pays exactly that', () => {
  const S = NG(); S.money = 1e6; eq(D.REFUND_SHARE, 0.5);
  S.items.forEach(it => eq(Z.removeRefund(S, it.id), Math.round((it.k === 'hab' ? D.BIOMES[it.t].hab : D.FAC[it.t].cost) * 0.5)));
  D.BIOME_ORDER.forEach(b => eq(Z.removeRefund(S, 'hab', b), Math.round(D.BIOMES[b].hab / 2))); D.FAC_ORDER.forEach(t => eq(Z.removeRefund(S, 'fac', t), Math.round(D.FAC[t].cost / 2)));
  eq([Z.removeRefund(S, 99999), Z.removeRefund(S, 'fac', 'nope'), Z.removeRefund(S, 'hab', 'nope'), Z.removeRefund(S, 'x', 'savanna')], [0, 0, 0, 0]);
  S.research['fac:gift'] = true; const sp = firstSpot(S, 'fac', 'gift'), id = Z.build(S, 'fac', 'gift', sp[0], sp[1], 0).id; Z.debug.happening(S, 'sale'); // a Builder's deal is on: the refund is still from the list price
  const want = Z.removeRefund(S, id), m = S.money, r = Z.remove(S, id); ok(r.ok); eq([r.refund, S.money - m], [want, want], 'remove pays what removeRefund said (the list price, not a sale price)');
  const h = S.items.find(i => i.k === 'hab'), w2 = Z.removeRefund(S, h.id), m2 = S.money, r2 = Z.remove(S, h.id); eq([r2.refund, S.money - m2], [w2, w2]);
});

console.log(failed ? '\nRULES CHECK: ' + failed + ' FAILED' : '\nRULES CHECK: ALL PASSED');
process.exit(failed ? 1 : 0);
