/* Headless simulated player. Usage: node test/bot.js [skill 0..1] [runs]
   With one run it prints the yearly pacing table; with more it prints a one-line summary per run and the averages.
   skill = chance each week that the bot manages the zoo (and answers choices and happenings; otherwise they fall to their defaults). */
const D = require('../data.js'), Z = require('../engine.js');
// For tuning: BOT_OFF=campaign,crate,yearly,choices,happenings switches off the bot's use of those systems.
const OFF = {}; (process.env.BOT_OFF || '').split(',').forEach(k => { if (k) OFF[k] = true; });

function run(skill, verbose) {
  const S = Z.newGame({ runs: 0 });
  const rows = [], idle = [], reviews = {}, seen = {}, haps = {}, choices = { asked: 0, answered: 0 };
  const count = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const must = (r, what) => { if (!r || !r.ok) throw new Error('bot: ' + what + ' refused: ' + (r && r.msg)); return r; };
  const freeStaff = () => Z.freeStaff(S);
  // scan from the front row to the back of the owned land
  function place(kind, t) { for (let y = D.GRID_H - 1; y >= D.GRID_H - S.rows; y--) for (let x = 0; x < D.GRID_W; x++) { const a = Z.fromOffset(x, y); for (let rot = 0; rot < 6; rot++) if (Z.canPlace(S, kind, t, a[0], a[1], rot)) return [a[0], a[1], rot]; } return null; }
  function placeNear(kind, t, hab) { for (const c of Z.cells(hab)) for (const d of Z.DIRS) { if (Z.canPlace(S, kind, t, c[0] + d[0], c[1] + d[1], 0)) return [c[0] + d[0], c[1] + d[1], 0]; } return place(kind, t); }
  // pick an option the way a sensible player would: pay when it is cheap next to the bank, take good odds, otherwise the safe default
  function choose(options, def) {
    for (let i = 0; i < options.length; i++) {
      const o = options[i]; if (i === def) continue;
      if (o.cost != null && o.cost > S.money * 0.3) continue;
      if (o.costRp != null && o.costRp * 3 > S.rp) continue;
      if (o.odds != null && o.odds < 0.6) continue;
      if (o.cost == null && o.costRp == null && o.odds == null && def === 0) continue; // free alternative to a free default: keep the default
      return i;
    }
    return def;
  }
  function topTier(list) { let best = -1; list.forEach((t, i) => { if (!t.lock && t.cost <= S.money * 0.4) best = i; }); return best; }

  for (let w = 0; w < D.WPY * D.RUN_YEARS; w++) {
    S.reports = [];
    const active = Math.random() < skill;
    if (active) {
      // research
      const list = Z.researchList(S).filter(r => !r.done && !r.lock).sort((a, b) => a.rp - b.rp);
      if (list.length && S.rp >= list[0].rp) must(Z.doResearch(S, list[0].id), 'research');
      // land (by rows)
      const L = Z.nextLand(S); if (L && Z.rank(S) >= L.rank && S.money > L.cost * 1.5) must(Z.buyLand(S), 'land');
      // hire through adverts
      if (S.staff.length < Z.staffCap(S)) {
        if (!S.candidates.length) { const t = topTier(Z.hireTiers(S)); if (t >= 0) must(Z.advertise(S, t), 'advertise'); }
        if (S.candidates.length) { const roles = {}; S.staff.forEach(s => { roles[s.role] = (roles[s.role] || 0) + 1; }); let bi = -1, bv = -1; S.candidates.forEach((a, i) => { const v = a.care + a.sci + a.exp + a.charm - (roles[a.role] || 0) * 30; if (v > bv) { bv = v; bi = i; } }); must(Z.hireCandidate(S, bi), 'hire'); }
      }
      // habitats: one per unlocked biome, then second ones
      let habs = S.items.filter(i => i.k === 'hab');
      for (const b of D.BIOME_ORDER) { if (!S.regions[b]) continue; const n = habs.filter(h => h.t === b).length; const c = Z.habBuildCost(S, b); const want = n === 0 || (n < 2 && S.rows >= 10 && S.money > c * 6); if (want && S.money > c * 1.2) { const p = place('hab', b); if (p) must(Z.build(S, 'hab', b, p[0], p[1], p[2]), 'build hab'); } }
      habs = S.items.filter(i => i.k === 'hab');
      // facilities near habitats
      const facs = S.items.filter(i => i.k === 'fac');
      if (facs.length < habs.length * 3 + 2) { const known = D.FAC_ORDER.filter(f => S.research['fac:' + f] && !(D.FAC[f].limit && facs.some(x => x.t === f))); const f = known[Math.floor(Math.random() * known.length)]; if (S.money > Z.facCost(S, f) * 1.8) { const h = habs[Math.floor(Math.random() * habs.length)]; const p = placeNear('fac', f, h); if (p) must(Z.build(S, 'fac', f, p[0], p[1], 0), 'build fac'); } }
      // upgrades
      habs.forEach(h => { if (h.lvl < Z.habLevelCap(S) && S.money > Z.habUpgradeCost(h, S) * 1.6) must(Z.upgrade(S, h.id), 'upgrade'); });
      // market
      (S.offers ? S.offers.list : []).slice().forEach((o) => { const i = S.offers.list.indexOf(o); const sp = Z.sp(o.a); const room = habs.some(h => h.t === sp.biome && Z.inHab(S, h.id).length < Z.habCap(h)); const own = S.animals.filter(a => a.sp === sp.id); if (room && S.money > o.price * 1.5 && own.length < 2) must(Z.buyAnimal(S, i), 'buy'); });
      // mystery crate
      const crate = Z.crateInfo(S); if (!OFF.crate && crate && crate.cost <= S.money * 0.25 && Z.holding(S).length < Z.holdCap(S)) { must(Z.openCrate(S), 'crate'); count(seen, 'crate'); }
      // rehouse holding in one step / sell worst if full
      must(Z.autoHouseAll(S), 'autoHouseAll');
      habs.forEach(h => { const an = Z.inHab(S, h.id); if (an.length >= Z.habCap(h)) { const busy = Z.busyAnimals(S); const cand = an.filter(a => !busy[a.id]).sort((a, b) => Z.animalDraw(S, a) - Z.animalDraw(S, b)); if (cand.length) must(Z.sellAnimal(S, cand[0].id), 'sell'); } });
      Z.holding(S).forEach(a => { if (Z.holding(S).length > 2) must(Z.sellAnimal(S, a.id), 'sell'); });
      // expedition
      let fs = freeStaff();
      if (S.projects.filter(p => p.type === 'expedition').length < Z.maxExp(S) && fs.length) {
        const team = fs.slice().sort((a, b) => b.exp - a.exp).slice(0, Math.min(2, Math.max(1, fs.length - 1))).map(s => s.id);
        const regs = D.BIOME_ORDER.filter(b => S.regions[b]).reverse();
        for (const r of regs) { const pw = Z.teamPower(S, team, 1); if ((pw / D.BIOMES[r].diff >= 0.75 || r === 'savanna') && S.money > Z.expCost(r, 1) * 1.3) { must(Z.startExpedition(S, r, team, 1), 'expedition'); break; } }
      }
      // events
      fs = freeStaff();
      habs.forEach(h => { if (!fs.length || Z.eventCheck(S, h.id) || S.money < Z.eventCost(S) * 1.2) return; const themes = D.THEME_ORDER.filter(t => S.research['theme:' + t] && t !== h.lastTheme); let best = themes[0], bv = -1; themes.forEach(t => { const k = Z.themeFit(S, h.t, t); const v = k == null ? 1.6 : k; if (v > bv) { bv = v; best = t; } }); const lead = fs.sort((x, y) => (y.charm + y.sci * 0.3) - (x.charm + x.sci * 0.3))[0]; if (Z.startEvent(S, h.id, best, lead.id).ok) fs = freeStaff(); });
      // breeding
      fs = freeStaff();
      habs.forEach(h => { if (fs.length < 2) return; const pairs = Z.readyPairs(S, h.id); if (pairs.length) { const lead = fs.sort((x, y) => (y.care + y.sci * 0.5) - (x.care + x.sci * 0.5))[0]; if (Z.startBreeding(S, pairs[0][0], pairs[0][1], lead.id).ok) fs = freeStaff(); } });
      // train
      S.staff.forEach(s => { if (Z.trainWait(S, s) === 0 && S.money > Z.trainCost(s) * 6) { const r = must(Z.train(S, s.id, D.ROLES[s.role].main), 'train'); count(seen, r.super ? 'super' : 'train'); } });
      // advertising campaign
      if (!OFF.campaign) D.CAMPAIGNS.forEach((C, i) => { const t = Z.campaigns(S)[i]; if (!t.lock && !t.weeksLeft && t.cost <= S.money * 0.6) { must(Z.runCampaign(S, i), 'campaign'); count(seen, 'campaign'); } });
      // mid-point choices, happenings, Open Day / Festival plans
      S.projects.forEach(p => { if (p.choice && !OFF.choices) { const key = p.choice.key; must(Z.resolveChoice(S, p.id, choose(p.choice.options, p.choice.def)), 'choice ' + key); choices.answered++; count(seen, 'choice:' + key); } });
      if (S.happening && S.happening.options && !OFF.happenings) { const key = S.happening.key; must(Z.resolveHappening(S, choose(S.happening.options, S.happening.def)), 'happening ' + key); }
      if (S.yearly && !OFF.yearly) { const t = topTier(S.yearly.options.map(o => ({ cost: o.cost || 0 }))); must(Z.resolveYearly(S, Math.max(0, t)), 'yearly'); }
    }
    if (S.headhunt && S.staff.length < Z.staffCap(S) && S.money > Z.headhuntFee(S.headhunt) * 2) must(Z.hireHeadhunt(S), 'headhunt');
    S.staff.forEach(s => { if (s.lvl >= 12 && !Z.busyStaff(S)[s.id]) { const o = Z.jobOptions(S, s).filter(x => !x.lock && D.ROLES[x.role].adv)[0]; if (o && S.money > Z.jobCost(s) * 3) must(Z.changeJob(S, s.id, o.role), 'job'); } });
    if (S.show) { const best = S.animals.slice().sort((x, y) => Z.showScore(S, y) - Z.showScore(S, x))[0]; if (best) must(Z.enterShow(S, best.id), 'show'); }
    const before = S.reports.length;
    Z.tick(S);
    idle.push(S.money / Math.max(1, S.incomeLast));
    if (!isFinite(S.money) || !isFinite(S.rep) || !isFinite(S.rp)) throw new Error('bot: a number went bad in week ' + S.week);
    S.reports.forEach((r, i) => {
      count(seen, 'report:' + r.type);
      if (r.type === 'choice') choices.asked++;
      if (r.type === 'happening') count(haps, r.key);
      if (r.type === 'review') { const y = Z.year(S); (reviews[y] = reviews[y] || []).push(r.total); }
      if (r.type === 'yearend') {
        const h = r.stats, rv = reviews[h.year] || [], avgRev = rv.length ? (rv.reduce((a, b) => a + b, 0) / rv.length).toFixed(1) : '-';
        const yi = idle.splice(0).sort((a, b) => a - b); h.idleWeeks = +yi[Math.floor(yi.length / 2)].toFixed(1); /* typical bank balance through the year, in weeks of income */ h.avgReview = avgRev; h.minReview = rv.length ? Math.min.apply(null, rv) : 0;
        rows.push(h); h.repBy = Object.assign({}, S.life.repBy);
        if (verbose) console.log(`Y${h.year} place ${h.place} rating ${h.rating} (top ${Z.rivalTop(h.year)}) $${h.money} idle ${h.idleWeeks}wk inc/wk ${Math.round(h.income / 48)} cost/wk ${Math.round(h.cost / 48)} spent/wk ${Math.round(h.spent / 48)} vis/wk ${Math.round(h.visitors / 48)} rep ${h.rep} r${h.rank} sp ${h.species} best ${h.bestReview} rev ${h.minReview}-${h.bestReview} avg ${avgRev} ev ${h.events} exp ${h.expeditions} births ${h.births} awards ${h.awards.join('/')} | staff ${S.staff.length} avgAnimal ${Z.snapshot(S).avgStat} bestBaby ${h.bestBaby} prest ${r.awards[1].mine.match(/\((\d+)\)/)?.[1]} rp ${Math.round(S.rp)} rows ${S.rows} habs ${Z.snapshot(S).habitats}`);
      }
    });
  }
  if (!S.finished || rows.length !== D.RUN_YEARS) throw new Error('bot: the run did not finish 20 years');
  const hapN = Object.values(haps).reduce((a, b) => a + b, 0);
  if (verbose) {
    const kb = Math.round(Z.serialize(S).length / 1024); S.elog = [];
    console.log('score', JSON.stringify(S.score));
    console.log('regions', Object.keys(S.regions).join(','), '| frag', S.fragments, '| combos', Object.keys(S.combos).join(','), '| vips', Object.keys(S.vips).join(','), '| variants', Z.variantCount(S), '| hall of fame', S.life.hof);
    console.log('happenings', hapN, '(one per', (D.WPY * D.RUN_YEARS / hapN).toFixed(1), 'weeks)', JSON.stringify(haps));
    console.log('choices asked', choices.asked, 'answered', choices.answered, '| seen', JSON.stringify(seen));
    console.log('reputation by source', JSON.stringify(S.life.repBy));
    console.log('optional spending over the run $' + Math.round(S.life.spent).toLocaleString('en-US'), '| saveKB with log', kb, 'without', Math.round(Z.serialize(S).length / 1024));
  }
  return { S, rows, haps, hapN, choices, seen };
}
module.exports = run;

if (require.main === module) {
  const skill = parseFloat(process.argv[2] || '0.6'), n = parseInt(process.argv[3] || '1', 10);
  if (n <= 1) run(skill, true);
  else {
    const avg = {}, keys = ['money', 'idleWeeks', 'rank', 'place', 'bestReview', 'species'];
    let score = 0;
    for (let i = 0; i < n; i++) {
      const r = run(skill, false); score += r.S.score.total;
      r.rows.forEach(h => { const a = avg[h.year] = avg[h.year] || {}; keys.forEach(k => { a[k] = (a[k] || 0) + h[k] / n; }); a.avgReview = (a.avgReview || 0) + (parseFloat(h.avgReview) || 0) / n; });
      const y1 = r.rows[0], y5 = r.rows[4], y20 = r.rows[19];
      console.log(`run ${i + 1}: score ${r.S.score.total} | Y1 $${y1.money} r${y1.rank} reviews ${y1.minReview}-${y1.bestReview} | Y5 $${y5.money} idle ${y5.idleWeeks}wk r${y5.rank} place ${y5.place} | Y20 r${y20.rank} place ${y20.place} sp ${y20.species} | happenings ${r.hapN}`);
    }
    console.log(`averages over ${n} runs at skill ${skill} (final score ${Math.round(score / n)}):`);
    Object.keys(avg).forEach(y => { const a = avg[y]; console.log(`Y${y} $${Math.round(a.money)} idle ${a.idleWeeks.toFixed(1)}wk rank ${a.rank.toFixed(1)} place ${a.place.toFixed(1)} best ${a.bestReview.toFixed(1)} avgReview ${a.avgReview.toFixed(1)} species ${a.species.toFixed(1)}`); });
  }
}
