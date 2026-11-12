# Rules API as built (`data.js` -> `ZD`, `engine.js` -> `ZE`)

Written by the Rules teammate. Everything Menus and Moments need is here. In Node the same objects come from
`require('./data.js')` and `require('./engine.js')`. Checks: `node test/rules-check.js` (21 checks) and `node test/bot.js 0.8`.

## 0. Ground rules

- One state object `S`. `ZE.tick(S)` advances one week. Never change `S` directly from the interface (except emptying
  `S.reports` and `S.fx` after showing them, and interface-owned fields the Shell adds).
- Every action returns `{ok:true, ...}` or `{ok:false, msg}`. `msg` is a short sentence for a toast.
- Reports raised by an action are already in `S.reports` when it returns. The engine never empties `S.reports`;
  the Shell's queue should take them out as it shows them.
- `S.fx` is emptied by the engine at the start of every tick, and filled by the tick and by actions.
- Money is whole dollars; show with the Shell's `fmt.money`. Odds and chances are fractions `0..1`.
- Ids: animals, staff, items (habitats and facilities) and projects all have a numeric `id`, unique across the save.
- `ZE.SAVE_VERSION` is 3 and `S.v` is 3. `ZE.serialize(S) -> string`; `ZE.deserialize(str) -> S` or **`null`** if the text is
  not a version 3 save (start a new game then). `ZE.drainLog(S)` returns `S.elog` (the engine's event log, one object per
  decision or result: `{w: week, t: type, ...}`) and empties it; call it when you copy events into the gameplay log, so
  the save stays small (a full 20-year save is about 45 KB without it, about 550 KB with it).
- `ZE.debug.happening(S, key)`, `ZE.debug.caller(S, kind)`, `ZE.debug.yearly(S, 'openday'|'festival'|'show')` force a
  moment to happen now (returns true). Use them to build and test the pop-up screens.

## 1. The map (portrait)

- `ZD.GRID_W = 10` columns, `ZD.GRID_H = 20` rows. Row 19 is the **front** (bottom of the screen). Axial hexes `(q, r)`,
  pointy-top; `ZE.toCol(q, r)` gives the column 0..9, `r` is the row, `ZE.fromOffset(col, row) -> [q, r]`.
- `ZE.inGrid(q, r)`: inside the full grid. `ZE.inLand(S, q, r)`: owned (the front `S.rows` rows; starts at
  `ZD.START_ROWS = 8`). Land grows toward the back by rows.
- `ZE.entrance(S) -> {q, r}`: the gate hex (column 5 of the front row). Nothing can be built on it. `ZE.isEntrance(q, r)`.
- `ZE.nextLand(S) -> {rows, cost, rank} | null` (the next purchase: total rows after it, price, zoo rank needed).
  `ZD.LAND` lists all five steps (10, 12, 14, 17, 20 rows).
- Items live in `S.items`: habitat `{id, k:'hab', t:biome, n, q, r, rot, lvl, buzz, buzzAt, lastTheme, eventAt}`,
  facility `{id, k:'fac', t:facId, q, r, rot:0}`. `n` is the habitat's permanent number.
- `ZE.habName(S, item) -> 'Savanna 2'` (for a facility it returns the facility name).
- `ZE.cells(item) -> [[q, r], ...]`, `ZE.cellsOf(kind, t, q, r, rot)`, `ZE.rot(q, r, n)`, `ZE.DIRS` (6 neighbour steps),
  `ZE.occupancy(S, ignoreId?) -> {'q,r': itemId}`, `ZE.kindOf(item) -> 'hab:savanna' | 'fac:snack'`.
- `ZE.canPlace(S, kind, t, q, r, rot, ignoreId?) -> boolean` (on owned land, free, not the entrance). Pass the item's
  own id as `ignoreId` when moving it.
- `ZE.layout(S, items?) -> {nb, active, byId, occ}`: pure preview of a real or hypothetical item list. `active` is
  `[{id: comboId, anchor: itemId, members: [itemId, ...]}]`; outline `anchor` plus `members` for each. `nb[itemId]` is the
  list of touching items. To preview a placement, copy `S.items`, add or move the ghost, call `layout`, and compare the
  combo ids with `ZE.c(S).active`.
- `ZE.nearMisses(S) -> [{combo, fac, anchor, cells: [[q, r], ...]}]`: known combos one facility short and the free hexes
  where it would complete them.
- `ZE.c(S)`: derived numbers, rebuilt by `ZE.refresh(S)` after every action and tick: `{nb, active, occ, hab: {habId:
  {draw, base, adj, combo, buzz, kiosk, variety, count}}, total, spend (shop dollars per visitor), shopVal: {facId:
  dollars per visitor}, crowd, boost (visitor boost from campaigns and happenings, -0.4..0.8), rpw (research per week),
  repw, vet, salaries, upkeep, maint, visitors, ticket, income, cost, duty}`. `ZE.refresh` is not pure (it can discover
  a combo or raise the rank and push reports); the interface should not need to call it.
- `ZE.habStatus(S, item) -> {event, breed, busy, progress, sick, choice}` for the quiet floor icons:
  `event` true = an event could start here now (animals fit, rested, someone free, money for it); `breed` true = a pair
  here could start breeding now and someone is free; `busy` `null | 'event' | 'breed'`; `progress` `0..1 | null` of that
  project; `sick` = an animal here is off show; `choice` = a project here is waiting for an answer.

## 2. State fields the interface reads

| Field | Meaning |
|---|---|
| `S.week` | Weeks played. `ZE.year(S)`, `ZE.woy(S)` (0..47), `ZE.season(S)` (0 spring..3 winter), `ZE.dateStr(S)` |
| `S.money`, `S.rp`, `S.rep` | Money, research points, reputation. `ZE.rank(S)` 1..10, `ZD.RANK_NAME[rank]`, `ZE.nextRankRep(S)` (reputation for the next rank, or null), `ZD.RANK_REP` |
| `S.visitorsLast`, `S.incomeLast`, `S.costLast` | Last week's visitors, income, running costs |
| `S.rows` | Rows of land owned |
| `S.zooName`, `S.ng`, `S.runId` | Name, number of earlier runs, run id |
| `S.items`, `S.animals`, `S.staff` | See below. `ZE.item/animal/staffer(S, id)` |
| `S.projects` | Running projects (section 5) |
| `S.offers` | `null` or `{kind:'trader'|'director', at, list:[{a: animal, price}], crates}`: whoever is selling. Stays until the next seller arrives |
| `S.headhunt` | `null` or a staff object on offer. Fee `ZE.headhuntFee(S.headhunt)` |
| `S.candidates` | People who answered your last advert (staff objects, `star:true` on a standout). They leave after 8 weeks |
| `S.happening` | `null` or the happening that is here now (section 7) |
| `S.yearly` | `null` or the Open Day / Festival plan waiting for an answer (section 8) |
| `S.show` | `null` or `{stat, bar, year}`: the Winter Animal Show is open for one entry |
| `S.research` | `{'fac:gift':true, 'theme:photo':true, 'tech:hab3':true, 'region:jungle':true}`. `S.regions` `{biome:true}` |
| `S.book` | Collection: `{speciesId: {variant, bred, best, at}}`. `ZE.speciesCount(S)`, `ZE.variantCount(S)` |
| `S.combos`, `S.knownCombos` | Combos found this run / known including earlier runs |
| `S.aff` | Theme fits seen so far; read with `ZE.themeFit` |
| `S.fragments` | Old map pieces, 0..4 |
| `S.news` | Newest first: `[{w, msg, kind: ''|'good'|'bad'}]` (at most 80). Use `S.news[0].msg` for the one news line |
| `S.history` | One entry per finished year (the `stats` object of the `yearend` report) |
| `S.trophies`, `S.vips`, `S.flags`, `S.life`, `S.yr` | Totals. `S.life = {events, expeditions, births, income, bestReview, hof, spent, repBy}`; `S.yr` = this year so far `{visitors, income, cost, bestReview, events, expeditions, births, bestBaby, newSpecies, spent}` |
| `S.finished`, `S.score` | True after year 20; `{total, parts: [[label, points], ...]}` |
| `S.play` | `{sec, bySpeed:[...]}`: owned by the Shell (real play time); the engine only creates it |
| `S.mods` | Temporary effects `[{k:'visitors'|'spend'|'cost'|'rp'|'build', amt, until, src}]` (`until` is a week). `ZE.modSum(S, k)` |
| `S.campaigns` | `{campaignKey: week it ends}`; read through `ZE.campaigns(S)` |

**Animal** `{id, sp, name, sex:'M'|'F', charm, vigor, wit, variant, gen, born, hab, rest, sick}`. `hab` is a habitat id or
`null` (holding pen). Helpers: `ZE.sp(a)` (species: `{id, name, biome, rarity 1..6, variant: variant name}`),
`ZE.avg(a)`, `ZE.grade(value) -> 'D'..'SS'`, `ZE.animalLabel(a)` ('Golden Zebra'), `ZE.animalValue(a)` (sale price),
`ZE.prestige(a)`, `ZE.animalDraw(S, a)`, `ZE.isJuv(S, a)` (under 16 weeks old), `ZE.isSick(S, a)` (off show),
`ZE.inHab(S, habId)`, `ZE.holding(S)`, `ZE.holdCap(S)`, `ZE.habCap(habItem)`, `ZE.busyAnimals(S) -> {animalId: project}`.
`ZD.RARITY.name[rarity]`, `ZD.ANIMAL_STATS = {charm:'Charm', vigor:'Vigor', wit:'Wit'}`.

**Staff** `{id, name, role, lvl, xp, care, sci, exp, charm, trainAt, mastered?, star?}`. `ZD.ROLES[role] = {name, main,
second?, adv?, req?, desc}`, `ZD.STATS = {care:'Care', sci:'Science', exp:'Scouting', charm:'Charm'}`. Helpers:
`ZE.salary(s)` per week, `ZE.staffCap(S)`, `ZE.busyStaff(S) -> {staffId: project}`, `ZE.freeStaff(S) -> [staff]`,
`ZE.trainCost(s)`, `ZE.trainWait(S, s)` (weeks until they can train again, 0 = now), `ZE.jobOptions(S, s) -> [{role, lock}]`,
`ZE.jobCost(s)`, `ZD.JOB_LEVEL` (8).

## 3. Read-only lookups (rules the interface must not copy)

| Call | Returns |
|---|---|
| `ZE.regionRank(biome)` | Zoo rank needed before that region can be researched (0 = none). `ZD.REGION_RANK` |
| `ZE.ticket(S)`, `ZE.ticketAt(rank)` | Ticket price per visitor |
| `ZE.showMedals(S)` | `{gold, silver, bronze}` scores needed at this year's show, or `null` when no show is open |
| `ZE.showScore(S, a)`, `ZE.showMedal(S, a)` | An animal's show score; the medal it would win (`'gold'|'silver'|'bronze'|null`) |
| `ZE.expFast(S, staffIds)` | Weeks saved by the team's roles (1 with an Explorer or Expedition Leader, else 0). `ZD.FAST_ROLES` |
| `ZE.expWeeks(S, region, staffIds)` | How long that expedition would take |
| `ZE.expCost(region, budget)` | Price; budget 0 lean, 1 standard, 2 lavish |
| `ZE.teamPower(S, staffIds, budget)` | Team strength |
| `ZE.expOdds(S, region, power)` | `{ratio, byRarity: {1: p, 2: p, ...}}`. `ratio` = strength against the region (show as signs: under 0.6 `--`, under 0.9 `-`, under 1.2 `+`, else `++`) |
| `ZE.maxExp(S)` | Expeditions allowed at once (1, or 2 with Second Convoy) |
| `ZE.breedCheck(S, aId, bId)` | `''` if the pair can breed now, else the reason |
| `ZE.readyPairs(S, habId)` | `[[aId, bId], ...]` pairs that can start now |
| `ZE.breedWeeks(S, speciesId)`, `ZE.breedChance(S, leadStaff)`, `ZE.breedBonus(S, leadStaff)` | Length, success chance (0..1), stat bonus for babies |
| `ZE.eventCheck(S, habId)` | `''` if an event can start, else the reason |
| `ZE.eventCost(S)` | Price of an event |
| `ZE.themeFit(S, biome, theme)` | `null` until that theme has been tried on that biome, then 0..3. `ZE.fitWord(fit)` -> 'Poor fit'..'Amazing fit'. Signs: 0 `--`, 1 `-`, 2 `+`, 3 `++` |
| `ZE.eventNow(project)` | `{animals, habitat, fun, learning}` rounded scores so far |
| `ZE.habBuildCost(S, biome)`, `ZE.facCost(S, facId)`, `ZE.habUpgradeCost(habItem, S)` | Prices now (they include a Builder's deal discount when one is on) |
| `ZE.habLevelCap(S)` | Highest habitat level allowed by research (2..5) |
| `ZE.buzzNow(S, habItem)` | 0..0.9, for flames |
| `ZE.researchList(S)` | `[{id, group:'Regions'|'Facilities'|'Landmarks'|'Event themes'|'Know-how', name, desc, rp, done, lock}]` |
| `ZE.secretHints(S)` | `[{name, done, steps:[{t, ok, prog?}]}]` (the rumors) |
| `ZE.rankings(S)` | `{table:[{name, rating, me?}], place, of}`: the league as it stands today |
| `ZE.rating(S)`, `ZE.awardBars(year)`, `ZE.prizeBase(year)`, `ZE.finalScore(S)` | Rating, this year's award targets, prize money, the score so far |
| `ZE.rankUnlocks(rank)` | Short lines: what that rank opens up |
| `ZE.callersHere(S)` | Who stands at the gate: `[{kind:'trader'|'director', since, offers, crates}, {kind:'headhunter', since, role, name}]`. A caller stands there for 5 weeks; the offers stay open after that until the next one arrives |
| `ZE.projectInfo(S, project)` | `{id, type, name, detail, hab, staff, weeksLeft, progress 0..1, choice:boolean, scores?}` |
| `ZE.project(S, pid)` | The project or undefined |
| `ZE.bestHab(S, animal)` | The habitat `autoHouse` would pick, or `null` |
| `ZE.scale(S)`, `ZE.rpScale(S)`, `ZE.rankGap(S)` | Internal price scales (you should not need them) |
| `ZE.snapshot(S)` | Compact picture of the zoo for the quarterly log |

Data tables to read directly: `ZD.BIOMES[biome] = {name, region, color, hab (build cost), diff, exp, weeks, rp, secret?}`,
`ZD.BIOME_ORDER`, `ZD.SPECIES[id]`, `ZD.SPECIES_LIST` (68), `ZD.FAC[id] = {name, cost, rp, desc, limit?, landmark?}`,
`ZD.FAC_ORDER`, `ZD.COMBOS = [{id, name, anchor, needs, hint, draw?|spend?|crowd?|rpMult?}]`, `ZD.THEMES[id] = {name, rp,
aff, needs?}`, `ZD.THEME_ORDER`, `ZD.TECH`, `ZD.TECH_ORDER`, `ZD.COURSES` (the four training courses `{id, name, stat}`),
`ZD.SHAPES`, `ZD.SHAPE_NAME`, `ZD.VIPS = [{id, name, when, rep, money, boost}]`, `ZD.YEARLY` (week of year of each
yearly event), `ZD.YEARLY_NAME`, `ZD.SEASONS`, `ZD.RIVALS`, `ZD.CRITICS`, `ZD.HOF_SCORE` (34), `ZD.HAPPENINGS`, `ZD.WHO`.

## 4. Actions

All take `S` first (call them through `ZCore.act`). Each lists what it adds to `{ok:true}`.

**Build**
| Action | Arguments | Returns on success |
|---|---|---|
| `build` | `kind ('hab'|'fac'), t, q, r, rot` | `{id, housed}`; `housed` = animals moved out of the holding pen into the new habitat automatically |
| `move` | `itemId, q, r, rot?` | free; nothing extra |
| `remove` | `itemId` | `{refund}` (half the build price). Its animals go to another habitat with room, else the pen. Refused while a project runs there |
| `upgrade` | `habId` | `{lvl, housed}` |
| `buyLand` | none | `{rows}` |

**Animals**
| Action | Arguments | Returns on success |
|---|---|---|
| `buyAnimal` | `offerIndex` in `S.offers.list` | `{housed, hab, animal}` |
| `sellAnimal` | `animalId` | `{price}` |
| `moveAnimal` | `animalId, habId|null` | nothing extra (`null` = to the holding pen) |
| `autoHouse` | `animalId` | `{hab}`: moves an animal from the pen to the best habitat with room (one with a mate first) |
| `autoHouseAll` | none | `{moved:[{id, hab}], left}`; `left` = still in the pen |
| `renameAnimal` | `animalId, name` | nothing extra (at most 12 characters) |
| `openCrate` | none | `{animal, rarity, isNew, variant, housed, hab, cost}`. Read `ZE.crateInfo(S)` first: `{cost, odds:[{rarity, name, p}], left} | null` (null = no trader in town or crate gone; one crate per trader visit). Reveal: rarity first, then the animal and its stats |

**Staff**
| Action | Arguments | Returns on success |
|---|---|---|
| `advertise` | `tierIndex` into `ZE.hireTiers(S)` | `{cost, candidates}` (also in `S.candidates`). `hireTiers -> [{key, name, cost, note, n, star, lock}]`; `n` = how many turn up, `star` = chance each is a standout, `lock` = '' or 'Rank 3'. Refused when the staff room is full |
| `hireCandidate` | `index` into `S.candidates` | `{staff}`. No extra fee: the advert was the price |
| `hireHeadhunt` | none | `{staff}`; costs `ZE.headhuntFee(S.headhunt)` |
| `train` | `staffId, stat ('care'|'sci'|'exp'|'charm')` | `{gain, super, stat, value, cost}`. `super:true` is the triple result (about 1 in 8) |
| `changeJob` | `staffId, role` | nothing extra |
| `fire` | `staffId` | nothing extra |

**Research and money ladders**
| Action | Arguments | Returns on success |
|---|---|---|
| `doResearch` | `id` from `researchList` | nothing extra |
| `runCampaign` | `index` into `ZE.campaigns(S)` | `{cost, rep, weeks, vis}`. `campaigns -> [{key, name, cost, vis, weeks, rep, weeksLeft, lock, note}]`. One of each kind can run at a time; `weeksLeft > 0` = running |
| `resolveYearly` | `optionIndex` | the same fields as the `yearly` report (section 8) |
| `enterShow` | `animalId` | the same fields as the `showresult` report |

**Projects**
| Action | Arguments | Returns on success |
|---|---|---|
| `startExpedition` | `region, [staffIds 1..3], budget 0..2` | `{pid}` |
| `startBreeding` | `animalIdA, animalIdB, leadStaffId` | `{pid}` |
| `startEvent` | `habId, themeId, leadStaffId` | `{pid}` |
| `cancelProject` | `pid` | `{refund}` (half the cost of an expedition, else 0) |
| `resolveChoice` | `pid, optionIndex` | `{text, good}`: one short result line and whether it went well |
| `resolveHappening` | `optionIndex` | `{text, good}` |

## 5. Projects and mid-point choices

`S.projects` entries: `{id, type:'expedition'|'breed'|'event', start, end, staff:[ids], hab?, choice, ...}`.
`hab` is set for breeding and events. Extra fields: expedition `region, budget, power, cost`; breed `a, b` (animal ids);
event `theme, pts, star, boost, repeat`. `end` can move by a week when a choice says so.

A waiting choice is `project.choice`:

```
{ key, title, text, who, whoId, def, options: [{label, note?, cost?, costRp?, odds?, ...}] }
```

`who` is the lead's role id (a person sprite kind), `whoId` their staff id. `cost` is money, `costRp` research points,
`odds` the chance of success 0..1 (show it), `note` a few words on what it does. `def` is the option used if the player
never answers. The engine raises `{type:'choice', pid}` and an fx `{type:'choice'}` when it appears. Answer with
`resolveChoice(S, pid, i)`; an option the player cannot afford is refused (`ok:false`) and the choice stays.
Nothing waits for an answer: the default is applied at the project's next choice point or when it finishes. When you show
a `choice` report, check `ZE.project(S, pid)` still exists and still has `.choice`.

| Project | When | key | Options (default last unless noted) |
|---|---|---|---|
| Expedition | half way | `tracks` | Follow them (odds; rarer find, or 1 week late) / Play safe |
| | | `guide` | Hire the guide (cost; stronger team) / No thanks |
| | | `camp` | Stay a week (1 week late, 1 extra find) / Head home |
| | | `river` | Cross (odds; 1 week sooner, or 1 week late) / Go around |
| Breeding | half way | `vet` | Call the vet (cost; better odds, stronger baby) / Wait and see |
| | | `diet` | Try it (costRp; rare variant more likely) / Skip it |
| | | `watch` | Stay up (odds from the lead's Care; stronger baby, or a tired keeper) / Get some sleep |
| Event | week 1 | `star` | Three options, one per stat: the best Charm animal (lifts Fun), best Wit (Learning), best Vigor (Animals). Each also has `animal` (id), `stat`, `score` ('fun'|'learning'|'animals'), `gain`. Default is option 0 (the biggest gain) |
| Event | week 2 | `boost` | Go for it (costRp, odds; +1.5 to 2.5 points, flop -1) / Go big (costRp, odds; +3 to 4, flop -2) / No thanks |

## 6. Reports (`S.reports`, in the order raised)

| type | Fields |
|---|---|
| `rankup` | `rank, name, unlocks:[short lines]` |
| `combo` | `id` (see `ZD.COMBOS`), `anchor` (item id), `members` (item ids) |
| `caller` | `kind: 'trader'|'director'|'headhunter'`. Then read `S.offers` (and `ZE.crateInfo(S)`) or `S.headhunt`. Dismissing needs no engine call |
| `choice` | `pid` (section 5) |
| `happening` | `key, title, text, bad:boolean, who?, hab?, animal?, newAnimal?, options?` (section 7) |
| `expedition` | `region, found:[{id, sp, rarity, isNew, variant, charm, vigor, wit, hab}], rp, fragment, notes:[...], ups:[names who levelled up], staff:[ids]`. **Reveal order:** for each entry of `found` in order: rarity (and `isNew`), then species and variant, then the three stats; `hab` is where it was housed (`null` = holding pen). Then `rp` (research from field notes) and, if `fragment > 0`, "map piece `fragment` of 4" |
| `secret` | `region: 'paleo'|'mythic'` (a secret region opened; comes right after the expedition report for paleo) |
| `birth` | `fail:boolean, a, b` (parent ids), `lead` (staff id), `sp, chance` (success chance that applied), `kids:[...]`, and when it worked `twins, firstBred`. Each kid: `{id, sp, sex, name, hab, rolls:[{stat, parents, value, delta, lucky}], variantChance, variant}`. **Reveal order:** for each kid: the three `rolls` in order (charm, vigor, wit): show `parents` (the parents' average), count to `value`, flag `lucky` (a lucky jump of 6 to 10); then the variant roll: show `variantChance`, then `variant`. `hab` = where the baby lives (`null` = pen) |
| `review` | `hab, biome, theme, aff 0..3, fitWord, firstTime` (first time this theme met this biome), `sc:{animals, habitat, fun, learning}`, `critics:[{key, name, score}]`, `total, hof, repeat, fired, star, boost, money, rep, rp, lead`. **Reveal order:** the four `critics` in array order, one at a time, each out of 10; then `total` out of 40; then the Hall of Fame moment if `hof` (34 or more); then rewards `money, rep, rp`. `star` is `null` or `{animal, stat, score, gain}` (that animal may have been sold since: guard the lookup); `boost` is `null` or `{good, score, amt, big}` |
| `vip` | `id` (see `ZD.VIPS`), `money, rep, boost` |
| `yearlyplan` | `id:'openday'|'festival', name, options:[{label, note, cost?}]` (section 8) |
| `yearly` | `id, name, tier, tierName, spend, crowd, rep, money`, and `kinds` (shop kinds) for the festival |
| `show` | `stat, medals:{gold, silver, bronze}`: the Winter Animal Show is open; let the player pick one animal and call `enterShow`. It closes at year end |
| `showresult` | `medal ('gold'|'silver'|'bronze'|null), score, bar, medals, stat, money, rep, animal, trophy` |
| `yearend` | `year, table:[{name, rating, me?}]` (sorted), `place, awards:[{id, name, won, mine, bar, prize?}], prize, stats:{year, rating, place, of, awards:[ids won], visitors, income, cost, spent, species, bestReview, bestBaby, events, expeditions, births, money, rep, rank}` |
| `final` | `score:{total, parts:[[label, points], ...]}` (after year 20; play can continue) |

## 7. Happenings

About one every 6 to 8 weeks (7 on average), never in the same week as a yearly event, about 1 in 5 a mild setback.
The report and `S.happening` hold the same data:

```
S.happening = { key, title, text, who, hab, animal, newAnimal, bad, options, def, at, d }
```

- No `options`: it has already happened; `text` says what changed. `S.happening` stays for one week so the floor can
  show the visitor at the gate, then clears.
- With `options` (same shape as project choices): call `resolveHappening(S, i)`. If the player never answers, the
  default is applied two weeks later. Setbacks start at once and an option can only soften them.
- `who` is a person kind for the sprite at the gate (`null` when nobody comes). `hab` and `animal` point at the habitat
  and animal it is about. `newAnimal` is a full animal object not yet in the zoo (the stray).

| key | title | who | bad | What it does / options (default marked *) |
|---|---|---|---|---|
| `school` | School trip | teacher | | Free tour* (reputation, 5 research) / Sell tickets (money) |
| `donor` | A gift | donor | | Cash* / Research grant |
| `tv` | TV spot | reporter | | Short clip* (+10% visitors, 3 weeks) / Prime time (cost; +25%, 5 weeks) |
| `viral` | Viral photo | photographer | | No choice. One habitat gets buzz (`hab`, `animal`) |
| `heat` | Heatwave | | | Sell cold drinks* (shops +25%, or +40% with an Ice Cream Cart, 3 weeks) / Free water (reputation) |
| `stray` | Stray at the gate | kid | | Take it in (free animal, `newAnimal`) / Find it a home* (reputation) |
| `scholar` | Visiting scientist | professor | | Fund a study (cost; research) / Staff seminar* (one person +2 Science) |
| `coins` | Buried coins | builder | | No choice. Money |
| `volunteers` | Volunteer week | volunteer | | No choice. Upkeep 30% lower for 4 weeks |
| `spring` | Spring fever | | | No choice. Every resting pair can breed again |
| `mentor` | Old hand | elder | | Workshop (cost; all staff +1 main skill) / A quick chat* (one person gains experience) |
| `sale` | Builder's deal | builder | | No choice. Building and upgrades 25% off for 4 weeks |
| `feature` | Magazine feature | reporter | | No choice. Reputation |
| `storm` | Storm | | yes | Visitors -25% for 2 weeks. Rent covers (cost; only -10%) / Wait it out* |
| `cold` | A cold | vet | yes | One animal is off show for 4 weeks (`hab`, `animal`). Pay the vet (cost; back now) / Let it rest* |
| `escape` | Slipped out | keeper | yes | Send the best carer (odds from Care; reputation up, or down a little, never below the current rank) / All hands* (safe; shops -10% for a week) |
| `powercut` | Power cut | | yes | Research halved for 2 weeks. Rent a generator (cost; no loss) / Use candles* |

Person kinds (`ZD.WHO`): `teacher, donor, reporter, photographer, kid, professor, builder, volunteer, elder, vet, keeper`.
Callers use `trader, director, headhunter`; special visitors use `vip`; project choices use the staff role ids.

## 8. Yearly events

- Week 6 Spring Open Day, week 18 Summer Festival: the tick sets `S.yearly = {id, name, at, options, def:0}` and raises
  `yearlyplan`. Options are four spending tiers (`label, note, cost?`; the first is free). Call `resolveYearly(S, i)`;
  it pays, runs the day and raises the `yearly` report with the result. Unanswered, the free option runs a week later.
- Week 40 Winter Animal Show: `show` report and `S.show`. `enterShow(S, animalId)` once; it raises `showresult`.
- Week 48: `yearend` report (league table, five awards, prize money), then `final` after year 20.

## 9. fx (`S.fx`): floating pop-ups on the floor

Every entry has `type`; position comes from `hab` (habitat id), `item` (any item id), or `gate:true` (the entrance).
With none of those, show it at the top strip or the gate.

| type | Fields | Meaning |
|---|---|---|
| `money` | `amt`, and `item` (a shop's weekly takings) or `hab` (event payout) or `gate:true` (tickets, gifts, prizes) | Dollars, can be large; one per shop per week |
| `rp` | `amt` | Research points (weekly total, or a gift) |
| `rep` | `amt` (can be negative) | Reputation from a one-off moment |
| `event` | `hab, gains:{animals?, habitat?, fun?, learning?}, fired, who` | Weekly points popping out of an event; `fired` = `'fun'|'learning'|null` when the host is on a roll; `who` = a first name. Also raised by the star pick and the boost |
| `birth` | `hab` | A baby was born there |
| `exp` | none | The convoy is back (gate) |
| `buzz` | `hab` | That habitat just got buzz |
| `sick` | `hab` | An animal there caught a cold |
| `choice` | `hab|null, pid` | A project wants an answer |
| `super` | `staff` (id) | A Super! training result |

## 10. Starting and legacy

`ZE.newGame(legacy?, opts?)`: `legacy = {runs, aff, combos}` (carried over from earlier runs: number of runs, theme fits
seen, combos known), `opts = {zooName, staff, animal}` (one staff object and one animal object to carry over). A new zoo
has $20,000 (+$6,000 per earlier run, up to 5), a Savanna habitat with two zebras and a Snack Stand just inside the gate,
a keeper and an explorer, and a trader in town with a mystery crate.

## 11. Changes from the contract and from the old engine

- Expedition projects are `type: 'expedition'` (the old engine said `'exp'`).
- `S.cols`, `S.applicants`, `S.market`, `S.boost`, `ZE.hire` are gone. Land is `S.rows`; hiring is adverts; boosts are `S.mods`.
- Campaigns can overlap (one of each kind), so there is `ZE.campaigns(S)[i].weeksLeft` and no single "current campaign".
- The Open Day and Festival are now two steps (`yearlyplan` report, then `resolveYearly`, then the `yearly` report).
- `enterShow` now raises a `showresult` report as well as returning the result: show it from one of the two, not both.
- `habStatus` has one extra field, `choice`.
- `ZE.habUpgradeCost(habItem, S)` takes `S` second (optional) so the discount shows.
- `deserialize` returns `null` for old or broken saves.
