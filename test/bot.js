const D = require('../current/data.js'), Z = require('../current/engine.js');
function run(skill, verbose) {
  const S = Z.newGame({ runs: 0 });
  const rows = [];
  const freeStaff = () => { const b = Z.busyStaff(S); return S.staff.filter(s => !b[s.id]); };
  function place(kind, t) { for (let x = 0; x < S.cols; x++) for (let y = 0; y < D.GRID_H; y++) { const a = Z.fromOffset(x, y); for (let rot = 0; rot < 6; rot++) if (Z.canPlace(S, kind, t, a[0], a[1], rot)) return [a[0], a[1], rot]; } return null; }
  function placeNear(kind, t, hab) { for (const c of Z.cells(hab)) for (const d of Z.DIRS) { if (Z.canPlace(S, kind, t, c[0]+d[0], c[1]+d[1], 0)) return [c[0]+d[0], c[1]+d[1], 0]; } return place(kind, t); }
  for (let w = 0; w < D.WPY * D.RUN_YEARS; w++) {
    S.reports = [];
    if (Math.random() < skill) {
      // research
      const list = Z.researchList(S).filter(r => !r.done && !r.lock).sort((a, b) => a.rp - b.rp);
      if (list.length && S.rp >= list[0].rp) Z.doResearch(S, list[0].id);
      const c = Z.c(S), net = c.income - c.cost;
      // land
      const L = Z.nextLand(S); if (L && Z.rank(S) >= L.rank && S.money > L.cost * 1.5) Z.buyLand(S);
      // hire
      if (S.staff.length < Z.staffCap(S)) { const roles = {}; S.staff.forEach(s => roles[s.role] = (roles[s.role]||0)+1); let bi=-1,bv=-1; S.applicants.forEach((a,i)=>{ const v = a.care+a.sci+a.exp+a.charm - (roles[a.role]||0)*30; if (v>bv){bv=v;bi=i;} }); if (bi>=0 && S.money > Z.salary(S.applicants[bi])*20) Z.hire(S, bi); }
      // habitats: one per unlocked biome, then second ones
      const habs = S.items.filter(i => i.k === 'hab');
      for (const b of D.BIOME_ORDER) { if (!S.regions[b]) continue; const n = habs.filter(h => h.t === b).length; const want = n === 0 || (n < 2 && S.cols >= 10 && S.money > D.BIOMES[b].hab * 6); if (want && S.money > D.BIOMES[b].hab * 1.2) { const p = place('hab', b); if (p) Z.build(S, 'hab', b, p[0], p[1], p[2]); } }
      // facilities near habitats
      const facs = S.items.filter(i => i.k === 'fac');
      if (facs.length < habs.length * 3 + 2) { const known = D.FAC_ORDER.filter(f => S.research['fac:' + f] && !(D.FAC[f].limit && facs.some(x => x.t === f))); const f = known[Math.floor(Math.random()*known.length)]; if (S.money > D.FAC[f].cost * 1.8) { const h = habs[Math.floor(Math.random()*habs.length)]; const p = placeNear('fac', f, h); if (p) Z.build(S, 'fac', f, p[0], p[1], 0); } }
      // upgrades
      habs.forEach(h => { if (h.lvl < Z.habLevelCap(S) && S.money > Z.habUpgradeCost(h) * 1.6) Z.upgrade(S, h.id); });
      // market
      (S.offers ? S.offers.list : []).slice().forEach((o) => { const i = S.offers.list.indexOf(o); const sp = Z.sp(o.a); const room = habs.some(h => h.t === sp.biome && Z.inHab(S, h.id).length < Z.habCap(h)); const own = S.animals.filter(a => a.sp === sp.id); if (room && S.money > o.price * 1.5 && own.length < 2) Z.buyAnimal(S, i); });
      // rehouse holding / sell worst if full
      Z.holding(S).forEach(a => { const h = habs.find(h => h.t === Z.sp(a).biome && Z.inHab(S, h.id).length < Z.habCap(h)); if (h) Z.moveAnimal(S, a.id, h.id); });
      habs.forEach(h => { const an = Z.inHab(S, h.id); if (an.length >= Z.habCap(h)) { const busy = Z.busyAnimals(S); const cand = an.filter(a => !busy[a.id]).sort((a, b) => Z.animalDraw(S, a) - Z.animalDraw(S, b)); // keep at least a pair of top species
          if (cand.length) Z.sellAnimal(S, cand[0].id); } });
      Z.holding(S).forEach(a => { if (Z.holding(S).length > 2) Z.sellAnimal(S, a.id); });
      // expedition
      let fs = freeStaff();
      if (S.projects.filter(p => p.type === 'exp').length < Z.maxExp(S) && fs.length) {
        const team = fs.slice().sort((a, b) => b.exp - a.exp).slice(0, Math.min(2, Math.max(1, fs.length - 1))).map(s => s.id);
        const regs = D.BIOME_ORDER.filter(b => S.regions[b]).reverse();
        for (const r of regs) { const pw = Z.teamPower(S, team, 1); if ((pw / D.BIOMES[r].diff >= 0.75 || r === 'savanna') && S.money > Z.expCost(r, 1) * 1.3) { Z.startExpedition(S, r, team, 1); break; } }
      }
      // events
      fs = freeStaff();
      habs.forEach(h => { if (!fs.length || Z.eventCheck(S, h.id) || S.money < Z.eventCost(S) * 1.2) return; const themes = D.THEME_ORDER.filter(t => S.research['theme:' + t] && t !== h.lastTheme); let best = themes[0], bv = -1; themes.forEach(t => { const k = S.aff[h.t + '|' + t]; const v = k == null ? 1.6 : k; if (v > bv) { bv = v; best = t; } }); const lead = fs.sort((x, y) => (y.charm + y.sci*0.3) - (x.charm + x.sci*0.3))[0]; if (Z.startEvent(S, h.id, best, lead.id).ok) fs = freeStaff(); });
      // breeding
      fs = freeStaff();
      habs.forEach(h => { if (fs.length < 2) return; const an = Z.inHab(S, h.id); for (const a of an) for (const b of an) { if (a.id < b.id && !Z.breedCheck(S, a.id, b.id) && fs.length) { const lead = fs.sort((x, y) => (y.care + y.sci*0.5) - (x.care + x.sci*0.5))[0]; if (Z.startBreeding(S, a.id, b.id, lead.id).ok) fs = freeStaff(); return; } } });
      // train
      S.staff.forEach(s => { if (S.week - s.trainAt >= 10 && S.money > Z.trainCost(s) * 6) Z.train(S, s.id, D.ROLES[s.role].main); });
    }
    if (S.headhunt && S.staff.length < Z.staffCap(S) && S.money > Z.headhuntFee(S.headhunt) * 2) Z.hireHeadhunt(S);
      S.staff.forEach(s => { if (s.lvl >= 12 && !Z.busyStaff(S)[s.id]) { const o = Z.jobOptions(S, s).filter(x => !x.lock && D.ROLES[x.role].adv)[0]; if (o && S.money > Z.jobCost(s) * 3) Z.changeJob(S, s.id, o.role); } });
      if (S.show) { const best = S.animals.slice().sort((x, y) => Z.showScore(S, y) - Z.showScore(S, x))[0]; if (best) Z.enterShow(S, best.id); }
    Z.tick(S);
    S.reports.forEach(r => { if (r.type === 'yearend') { const h = r.stats; rows.push(h); if (verbose) console.log(`Y${h.year} place ${h.place} rating ${h.rating} (top ${Z.rivalTop(h.year)}) $${h.money} inc/wk ${Math.round(h.income/48)} cost/wk ${Math.round(h.cost/48)} vis/wk ${Math.round(h.visitors/48)} rep ${h.rep} r${h.rank} sp ${h.species} best ${h.bestReview} ev ${h.events} exp ${h.expeditions} births ${h.births} awards ${h.awards.join('/')} | staff ${S.staff.length} avgAnimal ${Z.snapshot(S).avgStat} bestBaby ${Math.round(r.awards[2].mine.match(/\((\d+)\)/)?.[1]||0)} prest ${r.awards[1].mine.match(/\((\d+)\)/)?.[1]} rp ${Math.round(S.rp)} habs ${Z.snapshot(S).habitats}`); } });
  }
  if (verbose) { S.elog=[]; console.log('score', JSON.stringify(S.score)); console.log('regions', Object.keys(S.regions), 'frag', S.fragments, 'combos', Object.keys(S.combos), 'vips', Object.keys(S.vips), 'variants', Z.variantCount(S), 'elog', S.elog.length, 'saveKB', Math.round(Z.serialize(S).length/1024)); }
  return { S, rows };
}
module.exports = run;
if (require.main === module) run(parseFloat(process.argv[2] || '0.6'), true);
