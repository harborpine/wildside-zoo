/* Headless simulated player.
   Main game:  node test/bot.js [skill 0..1] [runs]
     With one run it prints the yearly pacing table; with more it prints a one-line summary per run and the averages.
   Challenges: node test/bot.js challenge [level id, number or "all"] [runs] [skill or "first"]
     Plays each challenge level many times and prints how often it is finished, in which week, and the stars earned.
     "first" = the careful first-timer profile (the judge for "1 star is reachable"): acts about every other week, keeps the
     expedition star the Send out page opens on, takes the first breeding pair, never trains staff, never opens crates (it buys a kind it does not own yet at the trader when that costs at most 30% of the bank), upgrades a habitat only when it is full, sells spare animals only in the breeding level, and never
     saves up on purpose. Without a skill it prints both: the first-timer, then the sensible bot at 0.5, 0.8 and 1.
   skill = chance each week that the bot manages the zoo (and answers choices and happenings; otherwise they fall to their defaults). */
const D = require('../data.js'), Z = require('../engine.js');
// For tuning: BOT_OFF=campaign,crate,yearly,choices,happenings switches off the bot's use of those systems.
const OFF = {}; (process.env.BOT_OFF || '').split(',').forEach(k => { if (k) OFF[k] = true; });

// Start: by default the bot begins on bare land and builds the starter (Savanna habitat, Snack Stand) itself in week 0.
// BOT_START=classic (or opts.classic) uses the pre-built start instead. opts.level = a challenge level id: play that level until it ends.
function run(skill, verbose, opts) {
  const classic = (opts && opts.classic) || process.env.BOT_START === 'classic';
  const L = opts && opts.level ? D.LEVELS.find(l => l.id === opts.level || l.n === +opts.level) : null;
  if (opts && opts.level && !L) throw new Error('bot: no such level ' + opts.level);
  const S = L ? Z.newChallenge(L.id) : Z.newGame({ runs: 0 }, { starter: classic });
  const goal = L ? L.goal.kind : '';
  let minMoney = Infinity;
  const first = !!(opts && opts.first), lastStar = {}; // the careful first-timer profile (challenges)
  if (L ? L.start !== 'starter' : !classic) {
    const at = Z.starterSpots(), a = Z.build(S, 'hab', 'savanna', at.hab.q, at.hab.r, 0), b = Z.build(S, 'fac', 'snack', at.snack.q, at.snack.r, 0);
    if (!a.ok || !b.ok || a.housed !== 0 || a.movable.length !== (L && L.animals ? L.animals.length : 2) || (!L && S.money !== D.START_MONEY_CLASSIC)) throw new Error('bot: could not build the starter on bare land');
    const m = Z.moveIn(S, a.id, a.movable); if (!m.ok || m.moved.length < Math.min(2, a.movable.length)) throw new Error('bot: could not move the zebras in');
  }
  const rows = [], idle = [], reviews = {}, seen = {}, haps = {}, choices = { asked: 0, answered: 0 };
  const count = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const must = (r, what) => { if (!r || !r.ok) throw new Error('bot: ' + what + ' refused: ' + (r && r.msg)); return r; };
  const freeStaff = () => Z.freeStaff(S);
  // scan from the front row to the back of the owned land
  function place(kind, t) { for (let y = D.GRID_H - 1; y >= D.GRID_H - S.rows; y--) for (let x = 0; x < D.GRID_W; x++) { const a = Z.fromOffset(x, y); for (let rot = 0; rot < 6; rot++) if (Z.canPlace(S, kind, t, a[0], a[1], rot)) return [a[0], a[1], rot]; } return null; }
  // a facility goes right against the habitat (Update 8: touching counts as next to it again)
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
  // which star level to send: the highest unlocked one that is cheap next to the bank and can still bring a new species; else 2 stars; else the lowest
  function pickStar(region, team) {
    const list = Z.expStars(S, region, team).filter(x => x.unlocked && S.money > x.cost * 1.3); if (!list.length) return null;
    if (first) { // what the Send out page opens on: the star used last time, else the highest open star costing at most half the bank
      const open = Z.expStars(S, region, team).filter(x => x.unlocked), pref = open.find(x => x.star === lastStar[region]), easy = open.filter(x => x.cost * 2 <= S.money);
      const st = pref || easy[easy.length - 1] || open[0]; if (!st || S.money < st.cost) return null; lastStar[region] = st.star; return st.star;
    }
    if (goal === 'species') { // a species level: the star most likely to bring a kind of the goal region not owned yet (cheaper on a tie)
      const own = {}; S.animals.forEach(a => { own[a.sp] = 1; }); (S.arrivals || []).forEach(e => { own[e.a.sp] = 1; });
      const gain = x => Object.keys(x.odds).reduce((t, r) => { const kinds = D.SPECIES_LIST.filter(s => s.biome === region && s.rarity === +r); return t + x.odds[r] * kinds.filter(s => !own[s.id]).length / Math.max(1, kinds.length); }, 0);
      const ok = list.filter(x => x.cost <= S.money * 0.6 || x === list[0]); let pick = ok[0]; ok.forEach(x => { if (gain(x) > gain(pick) + 1e-9) pick = x; }); return pick.star;
    }
    const fresh = x => D.SPECIES_LIST.some(s => s.biome === region && (s.rarity === x.star || s.rarity === x.star + 1) && !S.book[s.id]); // a run can also find one star above
    const cheap = list.filter(x => x.cost <= S.money * (+process.env.BOT_STARSHARE || 0.6) || x === list[0]);
    const want = cheap.filter(fresh).pop() || cheap.pop();
    return want.star;
  }
  // challenge, money goal: once the bank will reach the target in time just by waiting, stop spending
  function saving() {
    if (goal !== 'money' || first) return false;
    const profit = S.incomeLast - S.costLast, left = L.goal.target - S.money;
    if (process.env.BOT_SAVE_AT) return S.week >= +process.env.BOT_SAVE_AT;
    const A = +process.env.BOT_SAVE_BY || 90, B = +process.env.BOT_SAVE_FROM || 80;
    return left <= 0 || (profit > 0 && S.week + left / profit <= A) || S.week >= B; // invest first; hoard once waiting alone gets there by week A, or from week B
  }

  // challenge, breeding goal: a breeder's zoo. Keep the best two males and two females of each kind, one kind per habitat, sell the rest.
  function bredManage() {
    S.arrivals.slice().forEach(e => must(Z.keepArrival(S, e.a.id, null), 'keep baby'));
    const busy = Z.busyAnimals(S), habs = S.items.filter(i => i.k === 'hab'), kinds = []; S.animals.forEach(a => { if (kinds.indexOf(a.sp) < 0) kinds.push(a.sp); }); kinds.sort();
    kinds.forEach(sp => ['M', 'F'].forEach(sex => S.animals.filter(a => a.sp === sp && a.sex === sex).sort((x, y) => Z.avg(y) - Z.avg(x)).slice(2).forEach(a => { if (!busy[a.id]) must(Z.sellAnimal(S, a.id), 'sell spare'); })));
    const home = a => { const hs = habs.filter(h => h.t === Z.sp(a).biome); return hs[kinds.indexOf(a.sp) % Math.max(1, hs.length)]; };
    S.animals.forEach(a => { const h = home(a); if (a.hab != null && (!h || a.hab !== h.id) && !busy[a.id]) must(Z.moveAnimal(S, a.id, null), 'move out'); });
    Z.holding(S).slice().sort((x, y) => Z.avg(y) - Z.avg(x)).forEach(a => { const h = home(a); if (h && Z.inHab(S, h.id).length < Z.habCap(h)) must(Z.moveAnimal(S, a.id, h.id), 'move home'); });
  }
  const bred = goal === 'bred';

  const WEEKS = L ? L.weeks + 5 : D.WPY * D.RUN_YEARS;
  for (let w = 0; w < WEEKS; w++) {
    if (L && S.ch.done) break;
    S.reports = [];
    const active = Math.random() < skill, save = saving();
    if (active && !save) {
      // research
      const list = Z.researchList(S).filter(r => !r.done && !r.lock).sort((a, b) => a.rp - b.rp);
      if (list.length && S.rp >= list[0].rp) must(Z.doResearch(S, list[0].id), 'research');
      // land (by rows)
      const Ld = Z.nextLand(S); if (Ld && Z.rank(S) >= Ld.rank && S.money > Ld.cost * 1.5) must(Z.buyLand(S), 'land');
      // hire through adverts
      if (S.staff.length < Z.staffCap(S) && Z.allowed(S, 'hire').ok) {
        if (!S.candidates.length && !S.hiring) { const t = topTier(Z.hireTiers(S)); if (t >= 0) { must(Z.advertise(S, t), 'advertise'); count(seen, 'advert'); } }
        if (S.candidates.length) { const roles = {}; S.staff.forEach(s => { roles[s.role] = (roles[s.role] || 0) + 1; }); let bi = -1, bv = -Infinity; S.candidates.forEach((a, i) => { const v = a.care + a.sci + a.exp + a.charm - (roles[a.role] || 0) * 30; if (v > bv) { bv = v; bi = i; } }); must(Z.hireCandidate(S, bi), 'hire'); }
      }
      // habitats: one per unlocked biome, then second ones (a challenge map is small: a second one as soon as it is affordable)
      let habs = S.items.filter(i => i.k === 'hab');
      for (const b of D.BIOME_ORDER) {
        if (!S.regions[b] || !Z.allowed(S, 'hab', b).ok) continue;
        const n = habs.filter(h => h.t === b).length; const c = Z.habBuildCost(S, b);
        const want = n === 0 || (n < (L && L.biomes ? 3 : 2) && (L ? S.money > c * 2 : S.rows >= 10 && S.money > c * 6)); // in a one-region level a third habitat of it
        if (want && S.money > c * 1.2) { const p = place('hab', b); if (p) { const r = must(Z.build(S, 'hab', b, p[0], p[1], p[2]), 'build hab'); if (r.movable.length) must(Z.moveIn(S, r.id, r.movable), 'move in'); habs = S.items.filter(i => i.k === 'hab'); } }
      }
      habs = S.items.filter(i => i.k === 'hab');
      // facilities near habitats
      const facs = S.items.filter(i => i.k === 'fac');
      if (habs.length && facs.length < habs.length * 3 + 2) { const known = D.FAC_ORDER.filter(f => S.research['fac:' + f] && !(D.FAC[f].limit && facs.some(x => x.t === f))); const f = known[Math.floor(Math.random() * known.length)]; if (S.money > Z.facCost(S, f) * 1.8) { const h = habs[Math.floor(Math.random() * habs.length)]; const p = placeNear('fac', f, h); if (p) must(Z.build(S, 'fac', f, p[0], p[1], 0), 'build fac'); else count(seen, 'noRoomFac'); } }
      // upgrades
      habs.forEach(h => { if (h.lvl < Z.habLevelCap(S) && S.money > Z.habUpgradeCost(h, S) * 1.6 && (!first || Z.inHab(S, h.id).length >= Z.habCap(h))) { const r = must(Z.upgrade(S, h.id), 'upgrade'); if (r.movable.length) must(Z.moveIn(S, h.id, r.movable), 'move in'); } });
      // market
      // the first-timer buys at the trader only a kind it does not own yet (the 'new' badge), and only when it costs at most 30% of the bank
      if (first && !bred && S.offers) S.offers.list.slice().forEach(o => { const i = S.offers.list.indexOf(o); if (Z.allowed(S, 'buy').ok && !Z.compareOwned(S, o).haveSpecies && o.price <= S.money * 0.3) must(Z.buyAnimal(S, i), 'buy'); });
      // in a species level the sensible bot also buys every kind it does not own yet (up to half the bank)
      if (!first && goal === 'species' && S.offers) S.offers.list.slice().forEach(o => { const i = S.offers.list.indexOf(o); if (Z.allowed(S, 'buy').ok && !Z.compareOwned(S, o).haveSpecies && o.price <= S.money * 0.5) must(Z.buyAnimal(S, i), 'buy'); });
      (S.offers && !bred && !first ? S.offers.list : []).slice().forEach((o) => { const i = S.offers.list.indexOf(o); const sp = Z.sp(o.a); const room = habs.some(h => h.t === sp.biome && Z.inHab(S, h.id).length < Z.habCap(h)); const own = S.animals.filter(a => a.sp === sp.id); if (room && S.money > o.price * 1.5 && own.length < 2) must(Z.buyAnimal(S, i), 'buy'); });
      // rarity crates: up to two a week while they are cheap next to the bank
      for (let k = 0; k < 2 && !OFF.crate && !bred && !first; k++) { const crate = Z.crateInfo(S); if (!crate || crate.cost > S.money * 0.25) break; must(Z.openCrate(S), 'crate'); count(seen, 'crate'); count(seen, 'crate' + crate.rarity); }
    }
    if (active && bred && !first) bredManage();
    if (active && (!bred || first)) {
      const habs = S.items.filter(i => i.k === 'hab');
      // arrivals (expedition finds, crate animals): keep where it fits best, keep a couple in the pen, sell the rest
      S.arrivals.slice().forEach(e => {
        const ch = Z.arrivalChoices(S, e.a.id), best = ch.find(c => c.best), cmp = Z.compareOwned(S, e.a.id);
        // the first-timer goes by the badges on the Sell / Keep card: keep a new kind or a new sex, or one better than the best he has; sell the rest
        if (first && cmp.haveSameSex && !(cmp.best && Z.avg(e.a) > cmp.best.avg)) { must(Z.sellArrival(S, e.a.id), 'sell arrival'); count(seen, 'sellArrival'); }
        else if (first && !(best && best.hab != null)) { must(Z.keepArrival(S, e.a.id, null), 'keep pen'); count(seen, 'keepPen'); }
        else if (best && best.hab != null) { must(Z.keepArrival(S, e.a.id, best.hab), 'keep'); count(seen, 'keep'); }
        else if ((Z.holding(S).length < 2 && cmp.better !== 'no') || (!first && goal === 'species' && !cmp.haveSpecies) || (!first && goal === 'bred' && cmp.better !== 'no')) { must(Z.keepArrival(S, e.a.id, null), 'keep pen'); count(seen, 'keepPen'); }
        else { must(Z.sellArrival(S, e.a.id), 'sell arrival'); count(seen, 'sellArrival'); }
      });
      // rehouse holding in one step / sell worst if full
      must(Z.autoHouseAll(S), 'autoHouseAll');
      // what an animal is worth keeping for: its draw; in a species level a kind you have only one of comes first; in a breeding level its stats
      const bestOfSex = a => !S.animals.some(x => x.sp === a.sp && x.sex === a.sex && x.id !== a.id && (Z.avg(x) > Z.avg(a) || (Z.avg(x) === Z.avg(a) && x.id < a.id)));
      const keepVal = a => first ? (bred ? Z.avg(a) : Z.animalDraw(S, a)) : goal === 'bred' ? Z.avg(a) + (bestOfSex(a) ? 100 : 0) : Z.animalDraw(S, a) + (goal === 'species' && S.animals.filter(x => x.sp === a.sp).length < 2 ? 1e6 : 0);
      if (!first || bred) habs.forEach(h => { const an = Z.inHab(S, h.id); if (an.length >= Z.habCap(h)) { const busy = Z.busyAnimals(S); const cand = an.filter(a => !busy[a.id]).sort((a, b) => keepVal(a) - keepVal(b)); if (cand.length && !(goal === 'species' && keepVal(cand[0]) >= 1e6)) must(Z.sellAnimal(S, cand[0].id), 'sell'); } }); // never sell the only one of a kind in a species level
      if (L && !first) { // a small zoo: swap a better (or, in a species level, a new kind of) pen animal in for the weakest housed one
        Z.holding(S).slice().sort((a, b) => keepVal(b) - keepVal(a)).forEach(a => { const busy = Z.busyAnimals(S), h = habs.find(x => x.t === Z.sp(a).biome); if (!h) return; const weak = S.animals.filter(x => x.hab != null && !busy[x.id] && Z.sp(x).biome === Z.sp(a).biome).sort((x, y) => keepVal(x) - keepVal(y))[0]; if (weak && keepVal(a) > keepVal(weak) + 1) { const hid = weak.hab; must(Z.sellAnimal(S, weak.id), 'sell'); must(Z.moveAnimal(S, a.id, hid), 'swap in'); } });
      }
      Z.holding(S).slice().sort((a, b) => keepVal(a) - keepVal(b)).forEach(a => { if (Z.holding(S).length > (first || goal === 'species' ? Z.holdCap(S) : 2) && !(goal === 'species' && !first && keepVal(a) >= 1e6)) must(Z.sellAnimal(S, a.id), 'sell'); }); // the first-timer only clears the pen when it is over full
    }
    if (active && !save) {
      const habs = S.items.filter(i => i.k === 'hab');
      // expedition
      let fs = freeStaff();
      if (S.projects.filter(p => p.type === 'expedition').length < Z.maxExp(S) && fs.length && (!bred || first)) {
        const team = fs.slice().sort((a, b) => b.exp - a.exp).slice(0, Math.min(2, Math.max(1, fs.length - 1))).map(s => s.id);
        const regs = D.BIOME_ORDER.filter(b => S.regions[b] && Z.allowed(S, 'expedition', b).ok).reverse();
        for (const r of regs) { const pw = Z.teamPower(S, team); if (pw / D.BIOMES[r].diff >= 0.6 || r === 'savanna') { const star = pickStar(r, team); if (star) { must(Z.startExpedition(S, r, team, star), 'expedition'); count(seen, 'star' + star); break; } } }
      }
      // events
      fs = freeStaff();
      habs.forEach(h => { if (!fs.length || Z.eventCheck(S, h.id) || S.money < Z.eventCost(S) * 1.2) return; const themes = D.THEME_ORDER.filter(t => S.research['theme:' + t] && t !== h.lastTheme); let best = themes[0], bv = -1; themes.forEach(t => { const k = Z.themeFit(S, h.t, t); const v = k == null ? 1.6 : k; if (v > bv) { bv = v; best = t; } }); const lead = fs.sort((x, y) => (y.charm + y.sci * 0.3) - (x.charm + x.sci * 0.3))[0]; if (Z.startEvent(S, h.id, best, lead.id).ok) fs = freeStaff(); });
    }
    if (active) {
      const habs = S.items.filter(i => i.k === 'hab');
      // breeding (in a breeding level: the strongest pair first, and one free person is enough)
      let fs = freeStaff();
      habs.forEach(h => { if (fs.length < (goal === 'bred' ? 1 : 2)) return; const pairs = Z.readyPairs(S, h.id); if (goal === 'bred' && !first) pairs.sort((x, y) => (Z.avg(Z.animal(S, y[0])) + Z.avg(Z.animal(S, y[1]))) - (Z.avg(Z.animal(S, x[0])) + Z.avg(Z.animal(S, x[1])))); if (pairs.length) { const lead = fs.sort((x, y) => (y.care + y.sci * 0.5) - (x.care + x.sci * 0.5))[0]; if (Z.startBreeding(S, pairs[0][0], pairs[0][1], lead.id).ok) fs = freeStaff(); } });
    }
    if (active && !save) {
      // train (in a breeding level: Care first)
      S.staff.forEach(s => { if (!first && Z.trainWait(S, s) === 0 && S.money > Z.trainCost(s) * (L ? 3 : 6)) { const r = must(Z.train(S, s.id, goal === 'bred' ? 'care' : D.ROLES[s.role].main), 'train'); count(seen, r.super ? 'super' : 'train'); } });
      // advertising campaign
      // R9 adverts are switches: on while the weekly price is a small share of the profit and the bank has a cushion, off when money runs low
      if (!OFF.campaign && Z.allowed(S, 'campaign').ok) { const cc = Z.c(S), profit = cc.income - (cc.cost - cc.ads); Z.adverts(S).forEach(t => {
        if (t.on && S.money < t.weekly * 4) must(Z.setAdvert(S, t.key, false), 'advert off');
        else if (!t.on && !t.why && t.weekly <= profit * 0.12 && S.money > t.weekly * 10) { must(Z.setAdvert(S, t.key, true), 'advert on'); count(seen, 'campaign'); } }); }
    }
    if (active) {
      // mid-point choices, happenings, Open Day / Festival plans
      S.projects.forEach(p => { if (p.choice && !OFF.choices) { const key = p.choice.key; must(Z.resolveChoice(S, p.id, choose(p.choice.options, p.choice.def)), 'choice ' + key); choices.answered++; count(seen, 'choice:' + key); } });
      if (S.happening && S.happening.options && !OFF.happenings) { const key = S.happening.key; must(Z.resolveHappening(S, choose(S.happening.options, S.happening.def)), 'happening ' + key); }
      if (S.yearly && !OFF.yearly) { const t = topTier(S.yearly.options.map(o => ({ cost: o.cost || 0 }))); must(Z.resolveYearly(S, Math.max(0, t)), 'yearly'); }
    }
    if (!save && S.headhunt && S.staff.length < Z.staffCap(S) && S.money > Z.headhuntFee(S.headhunt) * 2) must(Z.hireHeadhunt(S), 'headhunt');
    S.staff.forEach(s => { if (s.lvl >= 12 && !Z.busyStaff(S)[s.id]) { const o = Z.jobOptions(S, s).filter(x => !x.lock && D.ROLES[x.role].adv)[0]; if (o && S.money > Z.jobCost(s) * 3) must(Z.changeJob(S, s.id, o.role), 'job'); } });
    if (S.show) { const best = S.animals.slice().sort((x, y) => Z.showScore(S, y) - Z.showScore(S, x))[0]; if (best) must(Z.enterShow(S, best.id), 'show'); }
    Z.tick(S);
    if (S.week <= 2 * D.WPY) minMoney = Math.min(minMoney, S.money); // lowest bank in the first two years
    idle.push(S.money / Math.max(1, S.incomeLast));
    if (!isFinite(S.money) || !isFinite(S.rep) || !isFinite(S.rp)) throw new Error('bot: a number went bad in week ' + S.week);
    S.reports.forEach((r, i) => {
      count(seen, 'report:' + r.type);
      if (r.type === 'choice') choices.asked++;
      if (r.type === 'happening') count(haps, r.key);
      if (r.type === 'applicants' && (!r.candidates.length || r.n !== S.candidates.length)) throw new Error('bot: applicants report does not match S.candidates');
      if (r.type === 'review') { const y = Z.year(S); (reviews[y] = reviews[y] || []).push(r.total); }
      if (L && ['yearend', 'yearlyplan', 'yearly', 'show', 'final'].indexOf(r.type) >= 0) throw new Error('bot: a ' + r.type + ' report in a challenge');
      if (r.type === 'yearend') {
        const h = r.stats, rv = reviews[h.year] || [], avgRev = rv.length ? (rv.reduce((a, b) => a + b, 0) / rv.length).toFixed(1) : '-';
        const yi = idle.splice(0).sort((a, b) => a - b); h.idleWeeks = +yi[Math.floor(yi.length / 2)].toFixed(1); /* typical bank balance through the year, in weeks of income */ h.avgReview = avgRev; h.minReview = rv.length ? Math.min.apply(null, rv) : 0;
        rows.push(h); h.repBy = Object.assign({}, S.life.repBy);
        if (verbose) console.log(`Y${h.year} place ${h.place} rating ${h.rating} (top ${Z.rivalTop(h.year)}) $${h.money} idle ${h.idleWeeks}wk inc/wk ${Math.round(h.income / 48)} cost/wk ${Math.round(h.cost / 48)} spent/wk ${Math.round(h.spent / 48)} vis/wk ${Math.round(h.visitors / 48)} rep ${h.rep} r${h.rank} sp ${h.species} best ${h.bestReview} rev ${h.minReview}-${h.bestReview} avg ${avgRev} ev ${h.events} exp ${h.expeditions} births ${h.births} awards ${h.awards.join('/')} | staff ${S.staff.length} avgAnimal ${Z.snapshot(S).avgStat} bestBaby ${h.bestBaby} prest ${r.awards[1].mine.match(/\((\d+)\)/)?.[1]} rp ${Math.round(S.rp)} rows ${S.rows} habs ${Z.snapshot(S).habitats}`);
      }
    });
  }
  const hapN = Object.values(haps).reduce((a, b) => a + b, 0);
  if (L) {
    if (!S.ch.done) throw new Error('bot: the level did not end');
    return { S, level: L.id, stars: S.ch.stars, week: S.ch.endWeek, status: Z.challengeStatus(S), haps, hapN, choices, seen };
  }
  if (!S.finished || rows.length !== D.RUN_YEARS) throw new Error('bot: the run did not finish 20 years');
  if (verbose) {
    const kb = Math.round(Z.serialize(S).length / 1024); S.elog = [];
    console.log('score', JSON.stringify(S.score));
    console.log('regions', Object.keys(S.regions).join(','), '| frag', S.fragments, '| combos', Object.keys(S.combos).join(','), '| vips', Object.keys(S.vips).join(','), '| variants', Z.variantCount(S), '| hall of fame', S.life.hof);
    const badN = Object.keys(haps).reduce((t, k) => t + (D.HAPPENINGS[k].bad ? haps[k] : 0), 0);
    console.log('happenings', hapN, '(one per', (D.WPY * D.RUN_YEARS / hapN).toFixed(1), 'weeks,', Math.round(100 * badN / hapN) + '% setbacks)', JSON.stringify(haps));
    console.log('choices asked', choices.asked, 'answered', choices.answered, '| seen', JSON.stringify(seen));
    console.log('reputation by source', JSON.stringify(S.life.repBy));
    console.log('optional spending over the run $' + Math.round(S.life.spent).toLocaleString('en-US'), '| saveKB with log', kb, 'without', Math.round(Z.serialize(S).length / 1024));
    console.log('items at the end:', S.items.filter(i => i.k === 'hab').length, 'habitats,', S.items.filter(i => i.k === 'fac').length, 'facilities,', 'on', S.rows * D.GRID_W, 'land hexes');
  }
  return { S, rows, haps, hapN, choices, seen, minMoney: Math.round(minMoney) };
}
module.exports = run;

// Play one level n times: how often finished, the typical week, the stars.
function challenge(levelId, n, skill, first) {
  const L = D.LEVELS.find(l => l.id === levelId || l.n === +levelId), weeks = [], stars = [0, 0, 0, 0]; let cur = 0;
  for (let i = 0; i < n; i++) { const r = run(skill, false, { level: L.id, first: !!first }); stars[r.stars]++; if (r.stars) weeks.push(r.week); cur += r.status.cur / n; }
  weeks.sort((a, b) => a - b); const q = p => weeks.length ? weeks[Math.min(weeks.length - 1, Math.floor(weeks.length * p))] : null;
  return { level: L.id, n: L.n, runs: n, skill: skill, won: weeks.length / n, fastest: q(0), q25: q(0.25), median: q(0.5), q75: q(0.75), slowest: q(0.999), stars: stars, avgCur: Math.round(cur) };
}
module.exports.challenge = challenge;
const FIRST_SKILL = 0.5; // the first-timer looks after the zoo about every other week
module.exports.FIRST_SKILL = FIRST_SKILL;

if (require.main === module) {
  if (process.argv[2] === 'challenge') {
    const which = process.argv[3] || 'all', n = parseInt(process.argv[4] || '40', 10), skills = process.argv[5] ? [process.argv[5] === 'first' ? 'first' : parseFloat(process.argv[5])] : ['first', 0.5, 0.8, 1];
    D.LEVELS.filter(l => which === 'all' || l.id === which || l.n === +which).forEach(l => {
      console.log(`Level ${l.n} ${l.id}: goal ${l.goal.kind} ${l.goal.target}, limit ${l.weeks} weeks (${Math.round(l.weeks * D.CH_WEEK_SEC / 60)} min at speed 2), 3 stars by week ${l.stars[0]}, 2 stars by week ${l.stars[1]}`);
      skills.forEach(sk => { const r = sk === 'first' ? challenge(l.id, n, FIRST_SKILL, true) : challenge(l.id, n, sk); console.log(`  ${sk === 'first' ? 'first-timer' : 'skill ' + sk}: finished ${Math.round(100 * r.won)}% | week fastest ${r.fastest} / quarter ${r.q25} / median ${r.median} / three-quarters ${r.q75} / slowest ${r.slowest} | stars 0:${r.stars[0]} 1:${r.stars[1]} 2:${r.stars[2]} 3:${r.stars[3]} | average progress at the end ${r.avgCur}`); });
    });
  } else {
    const skill = parseFloat(process.argv[2] || '0.6'), n = parseInt(process.argv[3] || '1', 10);
    if (n <= 1) run(skill, true);
    else {
      const avg = {}, keys = ['money', 'idleWeeks', 'rank', 'place', 'bestReview', 'species'];
      let score = 0, hap = 0, asked = 0;
      for (let i = 0; i < n; i++) {
        const r = run(skill, false); score += r.S.score.total; hap += r.hapN; asked += r.choices.asked;
        r.rows.forEach(h => { const a = avg[h.year] = avg[h.year] || {}; keys.forEach(k => { a[k] = (a[k] || 0) + h[k] / n; }); a.avgReview = (a.avgReview || 0) + (parseFloat(h.avgReview) || 0) / n; });
        const y1 = r.rows[0], y5 = r.rows[4], y20 = r.rows[19];
        console.log(`run ${i + 1}: score ${r.S.score.total} | Y1 $${y1.money} r${y1.rank} reviews ${y1.minReview}-${y1.bestReview} | Y5 $${y5.money} idle ${y5.idleWeeks}wk r${y5.rank} place ${y5.place} | Y20 r${y20.rank} place ${y20.place} sp ${y20.species} | happenings ${r.hapN}`);
      }
      console.log(`averages over ${n} runs at skill ${skill} (final score ${Math.round(score / n)}; happenings one per ${(D.WPY * D.RUN_YEARS * n / hap).toFixed(1)} weeks; choices asked ${Math.round(asked / n)} per run):`);
      Object.keys(avg).forEach(y => { const a = avg[y]; console.log(`Y${y} $${Math.round(a.money)} idle ${a.idleWeeks.toFixed(1)}wk rank ${a.rank.toFixed(1)} place ${a.place.toFixed(1)} best ${a.bestReview.toFixed(1)} avgReview ${a.avgReview.toFixed(1)} species ${a.species.toFixed(1)}`); });
    }
  }
}
