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
  eq(Object.keys(st).sort(), ['breed', 'busy', 'choice', 'event', 'progress', 'sick']);
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

check('happenings: unanswered ones resolve themselves; about one every 6 to 8 weeks; mostly good', () => {
  const r = bot(0, false), per = D.WPY * D.RUN_YEARS / r.hapN; // skill 0 = never answers anything
  ok(per >= 6 && per <= 8.5, 'one per ' + per.toFixed(1) + ' weeks');
  let bad = 0; Object.keys(r.haps).forEach(k => { if (D.HAPPENINGS[k].bad) bad += r.haps[k]; });
  ok(bad / r.hapN < 0.35, 'share of setbacks ' + (bad / r.hapN).toFixed(2));
  return 'one per ' + per.toFixed(1) + ' weeks, ' + Math.round(100 * bad / r.hapN) + '% setbacks';
});

check('training: Super! is triple and about 1 in 8', () => {
  const S = NG(); S.money = 1e9; let sup = 0, n = 4000;
  for (let i = 0; i < n; i++) { const s = S.staff[0]; s.trainAt = -99; s.care = 10; const r = Z.train(S, s.id, 'care'); ok(r.ok && r.gain >= 3 && r.gain <= 15); if (r.super) { sup++; ok(r.gain >= 9, 'super gain'); } else ok(r.gain <= 5); }
  ok(Math.abs(sup / n - D.SUPER_CHANCE) < 0.03, 'super rate ' + (sup / n).toFixed(3)); return (100 * sup / n).toFixed(1) + '%';
});

check('hiring by advert', () => {
  const S = NG(); const tiers = Z.hireTiers(S); eq(tiers.length, 4); ok(tiers.every(t => t.key && t.name && t.cost > 0 && t.note != null));
  ok(tiers[0].cost < tiers[1].cost && tiers[1].cost < tiers[2].cost && tiers[2].cost < tiers[3].cost); ok(tiers[3].lock, 'top tier locked at rank 1');
  ok(!Z.advertise(S, 3).ok); const money = S.money, r = Z.advertise(S, 1); ok(r.ok); eq(r.candidates.length, 3); eq(S.money, money - tiers[1].cost);
  const h = Z.hireCandidate(S, 0); ok(h.ok && h.staff); eq(S.staff.length, 3); eq(S.candidates.length, 2);
  ok(!Z.advertise(S, 0).ok, 'staff room full at rank 1 with 3 staff');
});

check('mystery crate', () => {
  const S = NG(), info = Z.crateInfo(S); ok(info && info.cost > 0 && info.left === 1);
  ok(Math.abs(info.odds.reduce((t, o) => t + o.p, 0) - 1) < 1e-9, 'odds add up to 1'); ok(info.odds.every(o => o.rarity >= 1 && o.name));
  const n = S.animals.length, r = Z.openCrate(S); ok(r.ok && r.animal && r.rarity === D.SPECIES[r.animal.sp].rarity); eq(S.animals.length, n + 1);
  eq(Z.crateInfo(S), null); ok(!Z.openCrate(S).ok);
});

check('campaigns and yearly spend ladders', () => {
  const S = NG(); S.money = 1e6; const list = Z.campaigns(S); eq(list.length, 4);
  const v0 = Z.c(S).visitors, r = Z.runCampaign(S, 0); ok(r.ok && r.rep > 0); ok(Z.c(S).visitors > v0, 'visitors up'); ok(!Z.runCampaign(S, 0).ok, 'same kind cannot run twice'); ok(Z.campaigns(S)[0].weeksLeft === 4);
  ok(Z.runCampaign(S, 1).ok, 'a different kind can run alongside');
  tickN(S, D.YEARLY.openday); ok(S.yearly && S.yearly.id === 'openday', 'open day plan'); ok(S.reports.some(x => x.type === 'yearlyplan'));
  const y = Z.resolveYearly(S, 1); ok(y.ok && y.crowd > 0 && y.spend > 0); ok(S.reports.some(x => x.type === 'yearly' && x.id === 'openday')); eq(S.yearly, null);
  const S2 = NG(); tickN(S2, D.YEARLY.openday + 1); eq(S2.yearly, null, 'ignored plan resolves itself'); ok(S2.elog.some(e => e.t === 'yearly' && e.auto));
});

check('births: housing tries other habitats before the pen, reveal data is complete', () => {
  let other = 0, pen = 0, lucky = 0, kids = 0;
  for (let t = 0; t < 400; t++) {
    const S = NG(); S.money = 1e6; const h1 = S.items[0];
    const sp = firstSpot(S, 'hab', 'savanna'); const h2 = Z.item(S, Z.build(S, 'hab', 'savanna', sp[0], sp[1], sp[2]).id);
    for (let k = 0; k < 3; k++) S.animals.push({ id: S.nextId++, sp: 'warthog', name: 'W' + k, sex: 'M', charm: 20, vigor: 20, wit: 20, variant: false, gen: 1, born: null, hab: h1.id, rest: 0, sick: 0 });
    eq(Z.inHab(S, h1.id).length, Z.habCap(h1), 'parents habitat is full');
    ok(Z.startBreeding(S, S.animals[0].id, S.animals[1].id, S.staff[0].id).ok); tickN(S, 7);
    const b = S.elog.find(e => e.t === 'birth'); if (!b) continue;
    S.animals.filter(a => a.born != null).forEach(a => { kids++; if (a.hab === h2.id) other++; else if (a.hab == null) pen++; else throw new Error('baby in a full habitat'); });
  }
  ok(other > 100 && pen === 0, 'babies in the other habitat ' + other + ', in the pen ' + pen);
  const S = NG(); let rep = null;
  for (let t = 0; t < 40 && !rep; t++) { S.animals.forEach(a => { a.rest = 0; }); if (!S.projects.length) Z.startBreeding(S, S.animals[0].id, S.animals[1].id, S.staff[0].id); S.reports = []; Z.tick(S); rep = S.reports.find(r => r.type === 'birth' && !r.fail); }
  ok(rep, 'a birth happened'); const k = rep.kids[0]; eq(k.rolls.map(r => r.stat), ['charm', 'vigor', 'wit']);
  k.rolls.forEach(r => { ok(typeof r.parents === 'number' && typeof r.value === 'number' && typeof r.lucky === 'boolean'); eq(r.delta, r.value - r.parents); eq(Z.animal(S, k.id)[r.stat], r.value); });
  ok(k.variantChance > 0 && typeof k.variant === 'boolean');
  return other + ' babies rehoused next door';
});

check('expedition reveal data', () => {
  const S = NG(); Z.startExpedition(S, 'savanna', [S.staff[1].id], 0); let rep = null;
  for (let t = 0; t < 10 && !rep; t++) { S.reports = []; Z.tick(S); rep = S.reports.find(r => r.type === 'expedition'); }
  ok(rep && rep.found.length >= 1); rep.found.forEach(f => { const a = Z.animal(S, f.id); eq([f.sp, f.rarity, f.charm, f.vigor, f.wit, f.variant], [a.sp, D.SPECIES[a.sp].rarity, a.charm, a.vigor, a.wit, a.variant]); ok(typeof f.isNew === 'boolean'); });
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
  const r = Z.build(S, 'hab', 'savanna', at.hab.q, at.hab.r, 0); ok(r.ok); eq(r.housed, 2, 'zebras housed by the build'); ok(S.animals.every(a => a.hab === r.id));
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
  tickN(S, 100); const at = Z.starterSpots(); S.money = 0; const r = Z.build(S, 'hab', 'savanna', at.hab.q, at.hab.r, 0); ok(r.ok && r.housed === 2, 'the first habitat can always be built, even broke'); eq(S.money, -D.BIOMES.savanna.hab);
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
