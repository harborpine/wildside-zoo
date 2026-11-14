# Rules API as built (`data.js` -> `ZD`, `engine.js` -> `ZE`)

Written by the Rules teammate. Everything Menus and Moments need is here. In Node the same objects come from
`require('./data.js')` and `require('./engine.js')`. Checks: `node test/rules-check.js` and `node test/bot.js 0.8`.

## R5. Round 5 changes (read this first; the sections below are updated to match)

Save version stays **3**. Old saves load: `deserialize` fills every new field with a default.

### R5.1 Buying comparison (#1)

`ZE.compareOwned(S, x) -> {haveSpecies, haveSameSex, sex, count, best, better}`

- `x` may be an animal object, a trader/director offer `{a, price}`, an arrival entry `{a, ...}`, an expedition `found[]`
  entry, a crate result `.animal`, or an animal id (looked up in `S.arrivals`, then `S.animals`).
- Compares against animals **you own now** (`S.animals`, not pending arrivals), never against `x` itself.
- `haveSpecies`: you own at least one of that species. `haveSameSex`: you own one of that species and the same sex.
- `sex`: `x`'s sex. `count`: how many of that species and sex you own.
- `best`: `{charm, vigor, wit, avg}` of your best (highest average) animal of that species and sex, or `null`.
- `better`: `null` when `haveSameSex` is false. Otherwise stat by stat against `best`: `'yes'` = at least one stat higher and
  none lower; `'no'` = none higher (equal counts as not better); `'mixed'` = some higher, some lower.
- Badge suggestion: no species = "new" mark; species but not this sex = sex mark; `'yes'` up arrow; `'no'` down arrow; `'mixed'` `+-`.

### R5.2 Arrivals: sell or keep, and where (#12)

**The engine never puts an animal into a habitat by itself.** EVERY animal that joins the zoo waits in `S.arrivals` for the
player's Sell / Keep / where decision: expedition finds, crate animals, trader and director purchases (`buyAnimal`), the
stray (`stray` happening, "Take it in"), **births**, and the carried-over legacy animal (`newGame` `opts.animal`). Only the
player's own actions put an animal into a habitat: `keepArrival`, `moveAnimal`, `moveIn`, `autoHouse`, `autoHouseAll`,
`keepAllArrivals`. (The one exception is `newGame(..., {starter:true})`, the classic test layout, which is built with its
zebras already housed.)

| Field / call | Meaning |
|---|---|
| `S.arrivals` | `[{a: animal, src, at: week, hab?}]`, oldest first. `src` = `'expedition'|'crate'|'trader'|'director'|'stray'|'birth'|'legacy'`. `hab` (births only) = the parents' habitat, the suggested first choice. `a` is a full animal object (`a.hab` is `null`), **not** in `S.animals` yet: no upkeep, no draw, not counted in the pen |
| `ZE.arrival(S, animalId)` | The entry or `undefined` |
| `ZE.arrivalChoices(S, animalId) -> [{hab, room, fit, best}]` | Every place it could go. `hab` = habitat id, or `null` for the holding pen (always the **last** entry). Only habitats of the animal's biome are listed. `room` = free spaces now (the pen's can be 0 or less). `fit` = it can go there now (habitats: room > 0; the pen: always true). `best` = true on exactly one entry, the suggestion: for a birth the parents' habitat if it has room; otherwise a habitat with a mate first, then its own species, then most room; the pen if no habitat has room. Order: fitting habitats (best first, then most room), then full habitats (`fit:false`, show greyed), then the pen |
| `ZE.keepArrival(S, animalId, habId|null)` | `{ok, hab}`. Moves it into `S.animals` at that habitat (`null` = pen). Refused (`ok:false`) for a full or wrong-biome habitat. The pen always accepts (it may go over capacity, as before; that only blocks starting new expeditions and breeding until sorted) |
| `ZE.sellArrival(S, animalId)` | `{ok, price}`. Price = `ZE.animalValue(a)` (show it before: `ZE.animalValue(entry.a)`) |
| `ZE.keepAllArrivals(S)` | `{ok, moved:[{id, hab}]}`: player button, keeps every waiting arrival at its `best` place |
| `D.ARRIVAL_WEEKS` (2) | **Safety:** an arrival still undecided this many weeks after it came goes to the **holding pen** (never a habitat), by the tick, with a news line; the pen may overfill. On load (`deserialize`) waiting arrivals stay waiting, so a reveal interrupted by closing the app can be offered again: **the interface should show any `S.arrivals` (for example a "waiting" row on the Animals screen, or re-run Sell/Keep after loading)**; if nobody does, the tick moves them to the pen within `D.ARRIVAL_WEEKS`. Nothing ever waits forever, and selling is always possible, so nothing can deadlock |
| `ZE.movableTo(S, habId) -> [animalId, ...]` | Animals in the holding pen, then waiting arrivals, whose biome fits that habitat (all of them, even beyond its room). Use it for a one-tap "move them in?" prompt after building or upgrading a habitat (the bare-land starter zebras use this) |
| `ZE.moveIn(S, habId, ids?)` | `{ok, moved:[ids], left}`: moves `ids` (default `movableTo`) into that habitat until it is full; pen animals move, arrivals are kept there. `left` = how many did not fit |

**Changed actions:** `build` returns `{id, housed: 0, movable: [ids]}` (nothing is moved in; `movable` = `movableTo` the new
habitat). `upgrade` returns `{lvl, housed: 0, movable}`. `remove` sends the habitat's animals to the **holding pen** (no longer to
other habitats). `buyAnimal` returns `{animal, pending: true, housed: false, hab: null}` and is no longer refused for lack of
room. Stray "Take it in" adds an arrival (`src:'stray'`). `birth` report `kids[]` now carry `hab: null, pending: true,
suggest: parentsHabId, price`: after the birth reveal, run Sell / Keep for each kid (suggest first). `autoHouse` and
`autoHouseAll` are unchanged but are only ever player buttons; nothing in the engine calls them.

**Holding upkeep.** An animal in the holding pen costs extra upkeep every week on top of its normal upkeep: `D.HOLD_UPKEEP`
(1.0) x its normal upkeep, so the pen costs **double** (a Common $20 + $20, a Rare $90 + $90 a week). Waived while the zoo is
closed (bare land), like all running costs. Waiting arrivals cost nothing.
- `ZE.holdUpkeep(S) -> {perAnimal: {animalId: dollars}, total, count, mult}` (`total` = the extra per week now, 0 when closed).
- `ZE.holdFee(S, animal)` = that one animal's extra per week if it sat in the pen.
- `ZE.c(S).hold` = the same `total`; it is included in `ZE.c(S).cost` (and so in `S.costLast`). Weekly cost breakdown:
  `salaries + upkeep + maint + hold = cost`.

- The species counts as discovered (collection book, `isNew`, reputation) the moment it arrives, even if you then sell it.
- `expedition` report `found[]` entries now carry `{id, sp, sex, rarity, isNew, variant, charm, vigor, wit, hab: null,
  pending: true, price}`. `id` is the arrival's animal id. **Reveal flow:** for each found animal: the reveal as before, then
  Sell (`price`) or Keep, then `arrivalChoices` and `keepArrival` / `sellArrival`. `hab` is always `null` now (it lives nowhere
  until the player decides).
- `ZE.snapshot(S).arrivals` = number waiting.

### R5.3 Rarity crates at the trader (#7)

Each trader visit brings **5 crates of one random rarity** (rarer rarities come on rarer visits; the odds improve with zoo
rank, `D.CRATE_VISIT` by rank band 1-2, 3-4, 5-6, 7-8, 9-10, rarities 1..5). The old single mystery crate is gone.

| Field / call | Meaning |
|---|---|
| `S.offers.crates` | Crates left (5 at the start of a trader visit, 0 for a director) |
| `S.offers.crateRarity` | 1..5, the rarity of this visit's crates (`null` for a director) |
| `ZE.crateInfo(S)` | `null` (no trader offers, or none left) or `{rarity, name, left, total: 5, cost, pool: [speciesId, ...], odds: [{rarity, name, p: 1}]}`. `name` = rarity name. `pool` = species it can contain (unlocked, non-secret regions). `cost` is per crate; it rises with rarity and rank. `odds` kept for old screens |
| `ZE.openCrate(S)` | `{ok, animal, rarity, isNew, variant, cost, price, pending: true}`. The animal goes to `S.arrivals` (`src:'crate'`); then the same Sell / Keep / where flow as R5.2. No longer refused when the pen is full |
| `ZE.callersHere(S)` trader entry | also has `crateRarity` |

### R5.4 Habitat capacity (#10)

`ZE.habCap(hab) = 4 + 2 * (lvl - 1)`: 4, 6, 8, 10, 12 for levels 1 to 5, whatever the shape. The holding pen is unchanged
(`ZE.holdCap`: 6, or 12 with research). `D.CAP_BASE` (4), `D.CAP_STEP` (2).

### R5.5 Timed hiring (#11)

`advertise` now starts a **hiring job**. Applicants arrive when it finishes.

| Field / call | Meaning |
|---|---|
| `ZE.hireTiers(S)` | each tier also has `weeks` (how long the advert runs: 2, 2, 3, 3 weeks) |
| `ZE.advertise(S, tierIndex)` | `{ok, cost, weeks, end}`. Refused while another advert is running (`'An advert is already out.'`) or the staff room is full. No candidates in the result any more |
| `S.hiring` | `null` or `{id: 'hire', tier, start, end, cost}` (`tier` = tier key) |
| `ZE.hiringInfo(S)` | `null` or `{id: 'hire', type: 'hire', name: 'Hiring', detail: tier name, tier, hab: null, staff: [], weeksLeft, progress 0..1, choice: false}`: the same shape as `projectInfo`, for the running list |
| `ZE.runningList(S)` | `[projectInfo for each project..., hiringInfo if any]`: everything running, for the Projects screen |
| report `applicants` | `{type: 'applicants', tier, tierName, n, stars, candidates: [staff objects]}` raised when the advert finishes. The same people are now in `S.candidates`. Play the reveal (`candidates`), then the "Who turned up" list. Also an fx `{type: 'hire', gate: true}` |
| `S.candidates` | Stay until the next advert's applicants arrive, or 12 weeks (`D.CANDIDATE_WEEKS`), whichever is first. `S.candAt` = week they arrived |

### R5.6 Happenings (#5)

- Less often: about **one every 12 weeks** (the gap is 10 to 14 weeks), measured with the bot. Quiet start unchanged
  (first one 5 to 7 weeks after opening).
- About **one in three is a mild setback**. Three new setbacks (all `bad: true`):

| key | title | who | What it does / options (default *) |
|---|---|---|---|
| `fence` | Fence repair | builder | One habitat (`hab`) is closed for 2 weeks: its animals draw no visitors. Rush job (cost; open now) / Wait* |
| `pipe` | Burst pipe | builder | Shops -15% for 3 weeks. Call a plumber (cost; fixed now) / Patch it* |
| `rival` | Rival opening | (none) | No choice. Visitors -15% for 3 weeks |

- Closed habitats: `ZE.isClosed(S, hab)`, `hab.closedUntil` (week; 0 = open). `ZE.habStatus` has a new field **`closed`**
  (boolean). fx `{type: 'closed', hab}` when it closes. Events and breeding there carry on as normal.
- Setbacks never cost a rank, an animal, a staff member or a building.

### R5.7 New state fields (all filled in by `deserialize` for old saves)

`S.arrivals` (`[]`), `S.hiring` (`null`), `S.offers.crateRarity`, habitat `closedUntil` (missing = 0).

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
  dollars per visitor}, crowd, boost (visitor boost from campaigns and happenings, -0.4..0.8), rpw (research per week), hold (holding upkeep per week, R5.2),
  repw, vet, salaries, upkeep, maint, visitors, ticket, income, cost, duty}`. `ZE.refresh` is not pure (it can discover
  a combo or raise the rank and push reports); the interface should not need to call it.
- `ZE.habStatus(S, item) -> {event, breed, busy, progress, sick, choice, closed}` for the quiet floor icons:
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
| `S.openedAt` | `null` until the first habitat is built, then that week. `ZE.isOpen(S)` = the zoo has a habitat now (section 10) |
| `S.zooName`, `S.ng`, `S.runId` | Name, number of earlier runs, run id |
| `S.items`, `S.animals`, `S.staff` | See below. `ZE.item/animal/staffer(S, id)` |
| `S.projects` | Running projects (section 5) |
| `S.offers` | `null` or `{kind:'trader'|'director', at, list:[{a: animal, price}], crates, crateRarity}`: whoever is selling. Stays until the next seller arrives (R5.3) |
| `S.headhunt` | `null` or a staff object on offer. Fee `ZE.headhuntFee(S.headhunt)` |
| `S.candidates` | People who answered your last advert (staff objects, `star:true` on a standout). They leave after 12 weeks or when the next advert's applicants arrive |
| `S.hiring` | `null` or the advert that is out now (R5.5) |
| `S.arrivals` | Expedition finds and crate animals waiting for Sell / Keep (R5.2) |
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
`ZE.inHab(S, habId)`, `ZE.holding(S)`, `ZE.holdCap(S)`, `ZE.habCap(habItem)` (4 + 2 per level above 1), `ZE.compareOwned(S, x)` (R5.1), `ZE.busyAnimals(S) -> {animalId: project}`.
`ZD.RARITY.name[rarity]`. Stat names and icons: section 2a.

**Staff** `{id, name, role, lvl, xp, care, sci, exp, charm, trainAt, mastered?, star?}`. `ZD.ROLES[role] = {name, main,
second?, adv?, req?, desc}` (`main` and `second` are skill keys). Skill names and icons: section 2a. Helpers:
`ZE.salary(s)` per week, `ZE.staffCap(S)`, `ZE.busyStaff(S) -> {staffId: project}`, `ZE.freeStaff(S) -> [staff]`,
`ZE.trainCost(s)`, `ZE.trainWait(S, s)` (weeks until they can train again, 0 = now), `ZE.jobOptions(S, s) -> [{role, lock}]`,
`ZE.jobCost(s)`, `ZD.JOB_LEVEL` (8).

## 2a. Display names and icons

State field names never change (animals `charm / vigor / wit`, staff `care / sci / exp / charm`). Never hard-code a stat
name or parse one out of text: read these tables and show the icon.

| Table | Contents |
|---|---|
| `ZD.ASTAT` | Animal stats: `{charm:{name:'Charm', icon:'stat-charm'}, vigor:{name:'Energy', icon:'stat-vigor'}, wit:{name:'Smarts', icon:'stat-wit'}}` |
| `ZD.ASTAT_ORDER` | `['charm', 'vigor', 'wit']` |
| `ZD.SKILL` | Staff skills: `{care:{name:'Care', icon:'skill-care'}, sci:{name:'Science', icon:'skill-sci'}, exp:{name:'Scouting', icon:'skill-exp'}, charm:{name:'Hosting', icon:'skill-charm'}}` |
| `ZD.SKILL_ORDER` | `['care', 'sci', 'exp', 'charm']` |
| `ZD.STATS`, `ZD.ANIMAL_STATS` | Older name-only maps, kept in step with the tables above (`{key: name}`) |

Note the two different `charm` keys: on an animal it is Charm (icon `stat-charm`), on staff it is Hosting (icon `skill-charm`).
In every field below, **`stat` on an animal-related thing is an animal stat key; `skill` is a staff skill key.**

Where the stat or skill key is carried, so the interface can show the icon:

| Where | Field |
|---|---|
| `S.show.stat`, `show` report `.stat`, `showresult` report and `enterShow` result `.stat` | Animal stat the judges score this year |
| Event `star` choice options `.stat` (plus `.animal`, `.score`, `.gain`); `review` report `.star.stat` | Animal stat of the star; `.score` is the review score it lifts (`ZD.STAT_SCORE` maps stat -> score) |
| `birth` report `kids[].rolls[].stat` | Animal stat of each roll |
| Event `boost` choice options 0 and 1: `.skill:'charm'`, `.staff` | **new** The odds come from that person's Hosting |
| Breeding `watch` choice option 0: `.skill:'care'`, `.staff` | **new** The odds come from that person's Care |
| `escape` happening option 0: `.skill:'care'`, `.staff` | **new** The odds come from that person's Care |
| `scholar` happening option 1: `.skill:'sci'`, `.staff`, `.gain` (2) | **new** Who gains what |
| `train` result `.skill` (same as `.stat`) | **new** Skill trained |
| `ZD.COURSES[].skill` (same as `.stat`) | **new** Skill a course trains. The charm course is now named 'Hosting Class' |
| `ZD.ROLES[role].main`, `.second` | Skill keys a role is built on |

Option `note` text still contains the word (for example 'Energy 31: Animals +1.1', 'Ada +2 Science') as a fallback;
prefer the fields. Themes are not tied to any stat (their fit is per biome, `ZD.THEMES[id].aff`).

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
| `ZE.hiringInfo(S)`, `ZE.runningList(S)` | The advert that is out, in the same shape; everything running (R5.5) |
| `ZE.arrivalChoices(S, animalId)`, `ZE.arrival(S, animalId)` | Where a waiting arrival could go; the entry (R5.2) |
| `ZE.crateCost(S, rarity)` | Price of one crate of that rarity now |
| `ZE.isClosed(S, habItem)` | That habitat is closed for repairs (R5.6) |
| `ZE.project(S, pid)` | The project or undefined |
| `ZE.bestHab(S, animal)` | The habitat `autoHouse` would pick, or `null` |
| `ZE.scale(S)`, `ZE.rpScale(S)`, `ZE.rankGap(S)` | Internal price scales (you should not need them) |
| `ZE.snapshot(S)` | Compact picture of the zoo for the quarterly log |

Data tables to read directly: `ZD.BIOMES[biome] = {name, region, color, hab (build cost), diff, exp, weeks, rp, secret?}`,
`ZD.BIOME_ORDER`, `ZD.SPECIES[id]`, `ZD.SPECIES_LIST` (68), `ZD.FAC[id] = {name, cost, rp, desc, limit?, landmark?}`,
`ZD.FAC_ORDER`, `ZD.COMBOS = [{id, name, anchor, needs, hint, draw?|spend?|crowd?|rpMult?}]`, `ZD.THEMES[id] = {name, rp,
aff, needs?}`, `ZD.THEME_ORDER`, `ZD.TECH`, `ZD.TECH_ORDER`, `ZD.COURSES` (the four training courses `{id, name, stat, skill}`),
`ZD.SHAPES`, `ZD.SHAPE_NAME`, `ZD.VIPS = [{id, name, when, rep, money, boost}]`, `ZD.YEARLY` (week of year of each
yearly event), `ZD.YEARLY_NAME`, `ZD.SEASONS`, `ZD.RIVALS`, `ZD.CRITICS`, `ZD.HOF_SCORE` (34), `ZD.HAPPENINGS`, `ZD.WHO`.

## 4. Actions

All take `S` first (call them through `ZCore.act`). Each lists what it adds to `{ok:true}`.

**Build**
| Action | Arguments | Returns on success |
|---|---|---|
| `build` | `kind ('hab'|'fac'), t, q, r, rot` | `{id, housed: 0, movable}`; nothing moves in by itself; `movable` = `ZE.movableTo` the new habitat, for a "move them in?" prompt (`moveIn`) |
| `move` | `itemId, q, r, rot?` | free; nothing extra |
| `remove` | `itemId` | `{refund}` (half the build price). Its animals go to the holding pen. Refused while a project runs there |
| `upgrade` | `habId` | `{lvl, housed: 0, movable}` |
| `moveIn` | `habId, ids?` | `{moved, left}` (R5.2) |
| `buyLand` | none | `{rows}` |

**Animals**
| Action | Arguments | Returns on success |
|---|---|---|
| `buyAnimal` | `offerIndex` in `S.offers.list` | `{animal, pending: true, price, housed: false, hab: null}`: the animal waits in `S.arrivals` (R5.2) |
| `sellAnimal` | `animalId` | `{price}` |
| `moveAnimal` | `animalId, habId|null` | nothing extra (`null` = to the holding pen) |
| `autoHouse` | `animalId` | `{hab}`: moves an animal from the pen to the best habitat with room (one with a mate first) |
| `autoHouseAll` | none | `{moved:[{id, hab}], left}`; `left` = still in the pen |
| `renameAnimal` | `animalId, name` | nothing extra (at most 12 characters) |
| `openCrate` | none | `{animal, rarity, isNew, variant, cost, price, pending:true}`. Read `ZE.crateInfo(S)` first (R5.3: 5 crates of one rarity per trader visit). The animal waits in `S.arrivals`: reveal it, then Sell / Keep / where (R5.2) |
| `keepArrival` | `animalId, habId|null` | `{hab}` (R5.2) |
| `sellArrival` | `animalId` | `{price}` (R5.2) |
| `keepAllArrivals` | none | `{moved:[{id, hab}]}` (R5.2) |

**Staff**
| Action | Arguments | Returns on success |
|---|---|---|
| `advertise` | `tierIndex` into `ZE.hireTiers(S)` | `{cost, weeks, end}`: starts a hiring job; the applicants come later with an `applicants` report (R5.5). `hireTiers -> [{key, name, cost, note, n, star, weeks, lock}]`; `n` = how many turn up, `star` = chance each is a standout, `lock` = '' or 'Rank 3'. Refused when the staff room is full or an advert is already out |
| `hireCandidate` | `index` into `S.candidates` | `{staff}`. No extra fee: the advert was the price |
| `hireHeadhunt` | none | `{staff}`; costs `ZE.headhuntFee(S.headhunt)` |
| `train` | `staffId, stat ('care'|'sci'|'exp'|'charm')` | `{gain, super, stat, skill, value, cost}`. `super:true` is the triple result (about 1 in 8) |
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
| | | `watch` | Stay up (odds from the lead's Care, `skill:'care'`; stronger baby, or a tired keeper) / Get some sleep |
| Event | week 1 | `star` | Three options, one per stat: the best Charm animal (lifts Fun), best Smarts (Learning), best Energy (Animals). Each also has `animal` (id), `stat`, `score` ('fun'|'learning'|'animals'), `gain`. Default is option 0 (the biggest gain) |
| Event | week 2 | `boost` | Go for it (costRp, odds from the lead's Hosting, `skill:'charm'`; +1.5 to 2.5 points, flop -1) / Go big (costRp, odds; +3 to 4, flop -2) / No thanks |

## 6. Reports (`S.reports`, in the order raised)

| type | Fields |
|---|---|
| `rankup` | `rank, name, unlocks:[short lines]` |
| `combo` | `id` (see `ZD.COMBOS`), `anchor` (item id), `members` (item ids) |
| `caller` | `kind: 'trader'|'director'|'headhunter'`. Then read `S.offers` (and `ZE.crateInfo(S)`) or `S.headhunt`. Dismissing needs no engine call |
| `choice` | `pid` (section 5) |
| `happening` | `key, title, text, bad:boolean, who?, hab?, animal?, newAnimal?, options?` (section 7) |
| `expedition` | `region, found:[{id, sp, sex, rarity, isNew, variant, charm, vigor, wit, hab:null, pending:true, price}], rp, fragment, notes:[...], ups:[names who levelled up], staff:[ids]`. **Reveal order:** for each entry of `found` in order: rarity (and `isNew`), then species and variant, then the three stats, then Sell (`price`) / Keep and where (R5.2); `hab` is always `null` now. Then `rp` (research from field notes) and, if `fragment > 0`, "map piece `fragment` of 4" |
| `secret` | `region: 'paleo'|'mythic'` (a secret region opened; comes right after the expedition report for paleo) |
| `birth` | `fail:boolean, a, b` (parent ids), `lead` (staff id), `sp, chance` (success chance that applied), `kids:[...]`, and when it worked `twins, firstBred`. Each kid: `{id, sp, sex, name, hab, rolls:[{stat, parents, value, delta, lucky}], variantChance, variant}`. **Reveal order:** for each kid: the three `rolls` in order (charm, vigor, wit): show `parents` (the parents' average), count to `value`, flag `lucky` (a lucky jump of 6 to 10); then the variant roll: show `variantChance`, then `variant`. Each kid also has `hab: null, pending: true, suggest` (the parents' habitat) and `price`: after the reveal, run Sell / Keep / where for it (R5.2) |
| `review` | `hab, biome, theme, aff 0..3, fitWord, firstTime` (first time this theme met this biome), `sc:{animals, habitat, fun, learning}`, `critics:[{key, name, score}]`, `total, hof, repeat, fired, star, boost, money, rep, rp, lead`. **Reveal order:** the four `critics` in array order, one at a time, each out of 10; then `total` out of 40; then the Hall of Fame moment if `hof` (34 or more); then rewards `money, rep, rp`. `star` is `null` or `{animal, stat, score, gain}` (that animal may have been sold since: guard the lookup); `boost` is `null` or `{good, score, amt, big}` |
| `vip` | `id` (see `ZD.VIPS`), `money, rep, boost` |
| `yearlyplan` | `id:'openday'|'festival', name, options:[{label, note, cost?}]` (section 8) |
| `yearly` | `id, name, tier, tierName, spend, crowd, rep, money`, and `kinds` (shop kinds) for the festival |
| `show` | `stat, medals:{gold, silver, bronze}`: the Winter Animal Show is open; let the player pick one animal and call `enterShow`. It closes at year end |
| `showresult` | `medal ('gold'|'silver'|'bronze'|null), score, bar, medals, stat, money, rep, animal, trophy` |
| `yearend` | `year, table:[{name, rating, me?}]` (sorted), `place, awards:[{id, name, won, mine, bar, prize?}], prize, stats:{year, rating, place, of, awards:[ids won], visitors, income, cost, spent, species, bestReview, bestBaby, events, expeditions, births, money, rep, rank}` |
| `final` | `score:{total, parts:[[label, points], ...]}` (after year 20; play can continue) |
| `applicants` | `tier, tierName, n, stars, candidates:[staff]`: an advert finished (R5.5) |

## 7. Happenings

About one every 10 to 14 weeks (12 on average, `D.HAP_GAP`), never in the same week as a yearly event, about 1 in 3 a mild setback.
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
| `fence` | Fence repair | builder | yes | One habitat (`hab`) closed for 2 weeks, no visitors from it. Rush job (cost; open now) / Wait* |
| `pipe` | Burst pipe | builder | yes | Shops -15% for 3 weeks. Call a plumber (cost; fixed now) / Patch it* |
| `rival` | Rival opening | | yes | No choice. Visitors -15% for 3 weeks |

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
| `closed` | `hab` | That habitat just closed for repairs (R5.6) |
| `hire` | `gate:true` | Applicants have arrived (R5.5) |

## 10. Starting and legacy

`ZE.newGame(legacy?, opts?)`: `legacy = {runs, aff, combos}` (carried over from earlier runs: number of runs, theme fits
seen, combos known), `opts = {zooName, staff, animal, starter}` (one staff object and one animal object to carry over).

**A new zoo is bare land.** Nothing is built (`S.items` is empty). The two starting zebras wait in the holding pen, a keeper
and an explorer are on the team, and money is `ZD.START_MONEY` = $26,500 (+$6,000 per earlier run, up to 5). That is the
old $20,000 (`ZD.START_MONEY_CLASSIC`) plus the price of the old free starter, a Savanna habitat ($5,000) and a Snack Stand
($1,500), listed in `ZD.START_KIT`. Building the first Savanna habitat no longer moves the zebras in: `build` returns
`movable` (their two ids) and the interface offers `moveIn`. Both starter items fit on the starting land from week 0; `ZE.starterSpots() -> {hab:{q,r}, snack:{q,r}}`
gives the classic positions (rotation 0) if you want to suggest a spot.

`opts.starter === true` gives the **classic start** instead: the Savanna habitat and Snack Stand already built at
`starterSpots()`, zebras housed, $20,000, a trader in town. Tests and the bot use it when they need a known layout.

**While the zoo has no habitat** (`ZE.isOpen(S) === false`, also `ZE.c(S).open`):
- No visitors, no income, and **no running costs** (salaries and upkeep are waived), so waiting never costs anything.
  Time still passes and the year-end report still comes.
- No callers, no happenings, no Open Day, Festival or Winter Show. `S.offers` is `null` (no trader, no crate),
  `callersHere` is empty. Nothing the engine does ever sells or removes the penned zebras.
- Everything else works: research, hiring, training, expeditions (finds wait in `S.arrivals`; the only place to keep them is the pen), buying land.
- The first Savanna habitat can always be built, even with too little money (the balance goes below zero and income pays
  it back), so a bare zoo can never get stuck. Nothing else is ever free.

**Opening.** When the first habitat is built, `S.openedAt` is set to that week (it is `null` before, and `0` on a classic
start), the news line says the zoo is open, and a trader with 5 rarity crates is in town at once (no pop-up, no report:
only `S.offers` and `callersHere`). Nothing random interrupts for `ZD.QUIET_WEEKS` (2) weeks after opening: the first
caller report can come 2 weeks after opening at the earliest, the first happening 5 to 7 weeks after. If the player later
removes every habitat the zoo is closed again in the same way until one is rebuilt.

## 11. Changes from the contract and from the old engine

- Expedition projects are `type: 'expedition'` (the old engine said `'exp'`).
- `S.cols`, `S.applicants`, `S.market`, `S.boost`, `ZE.hire` are gone. Land is `S.rows`; hiring is adverts; boosts are `S.mods`.
- Campaigns can overlap (one of each kind), so there is `ZE.campaigns(S)[i].weeksLeft` and no single "current campaign".
- The Open Day and Festival are now two steps (`yearlyplan` report, then `resolveYearly`, then the `yearly` report).
- `enterShow` now raises a `showresult` report as well as returning the result: show it from one of the two, not both.
- `habStatus` has one extra field, `choice`.
- `ZE.habUpgradeCost(habItem, S)` takes `S` second (optional) so the discount shows.
- `deserialize` returns `null` for old or broken saves.
- A new zoo starts as bare land (section 10); `ZE.newGame(legacy, {starter:true})` gives the old pre-built start. New: `ZE.isOpen`, `ZE.starterSpots`, `S.openedAt`, `ZE.c(S).open`, `ZD.START_MONEY`, `ZD.START_MONEY_CLASSIC`, `ZD.START_KIT`, `ZD.QUIET_WEEKS`, `snapshot().open`.
