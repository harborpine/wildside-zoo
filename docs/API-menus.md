# menus.js: API as built (Menus)

One IIFE, one global: `ZMenus`. Loaded after `core.js`, before `moments.js`. Built only on `ZCore` (stack, `ui`, `act`) and `docs/API-rules.md`.
Every state change goes through `ZCore.act`. Checks: `node test/menus-shot.js [chromium|webkit]` (headless, writes `test/shots/menus-*.png`),
`node test/menus-sheet.js <name> <shot> <shot> ...` puts shots side by side, `node test/menus-dbg.js <screen>` lists anything wider than the phone.

## Update 9 (2026-11-18): read this first; it wins over anything older below

Checks: `node test/menus-u9.js [chromium|webkit]` (shots `test/shots/menus-u9-*.png`).

- **No zoom setting** (note 19): the System screen lost its Close/Far row; the map has pinch zoom (renderer).
- **Build** (note 21): the menu box and every coach/legend word say Build (the `edit` symbol stays). Internal names (`ZMenus.edit`, `#edit-bar`) are unchanged.
- **Build strip cards** (note 23): picture, the name underneath (2 lines max), one line of effect symbols (`facFx`: `Sells $/$$/$$$`,
  habitat `+N%` for neighbour draw, coin `+N%` for neighbour shops, visitors `+N%` zoo-wide, flask `+N` research a week, heart for the vet,
  fame `+N` a week; habitats show `Home`, land `Room`), then the price. Cards are 92 px wide, still one sideways strip.
- **Locks** (note 16): a lock only means not unlocked yet (rank, research, a challenge rule, a job level). Too little money or research:
  greyed card with the price in red, no lock. A facility at its limit shows a red cross and `Max`. `why()` adds a lock only to texts
  starting `Needs`, `Rank`, `Level`, `Top` or `Not in` (and never to `Need $...`).
- **Expeditions** (notes 22, 32): flow is now team (`exp-team`) then one Send out page (`exp-confirm`) with region tiles (`.mn-xr[data-region]`,
  only when more than one region is open) and effort levels 1 to 5 (`.mn-xs[data-effort]`, also still `data-star`) drawn as bars (`ZCore.ui.effort`),
  locked levels keep the lock. It opens on the first picked explorer's last mission (`ZE.lastMission`, `ZE.defaultEffort`); a first mission opens on
  effort 1. The region list screen (`exp-region`) is gone (`expRegion()` now opens the team screen). The team rows show each explorer's last mission
  (region tile and effort bars).
- **Challenges** (note 20): under the level line a details panel (`.mn-lvd[data-detail]`) for the picked level: number and name, the goal in words,
  rules (weeks, start money, rows, only-these habitats, habitat cap, no expeditions, given animals/staff) and three boxes: stars and the week they
  need (`stars[0]`, `stars[1]`, `weeks`). Under 600 px tall the rules line hides (the cards above show them as symbols).
- **Combos** (notes 27, 28): two tabs, Buildings and Animals. Not-found entries show only the name, greyed (no clue, no parts). Near misses
  ("One piece short") only for combos already found. Animals tab: biome tiles, then the pairings of that biome from `ZE.pairList` (found: both
  animals and a green `+` or red `-`). Animals > Zoo shows the marks of `ZE.pairsIn` beside each habitat's name (tap for the names); the where-list
  shows `pairPreview` marks.
- **Adverts** (note 26): the Advertise screen (`campaigns`) lists `ZE.adverts`: name, visitor boost, cost per week and an on/off switch
  (`.mn-sw[data-ad]`, `role=switch`, `aria-checked`) that calls `setAdvert`; total weekly cost on top. Locked ones show a lock and the rank;
  too dear shows the price in red and a note on tap. No lengths anywhere. The Projects box shows how many are on.
- **Trader** (note 18): screens read the counts from the engine (2 animals, 3 crates); the crate count defaults to `D.CRATES_PER_VISIT`.
- **Breeding** (note 29): the "Who leads?" pick always shows, even with one free worker.
- **Who turned up** (note 30): it and the Staff box glow only while there are applicants not yet seen; seen ones are kept in `S.ui.seen.cand`
  (headhunter: `S.ui.seen.hh`, seen once the Staff screen is open). Hiring one does not make the rest new again.
- **Steady frames** (note 31): `.mn-glow` (tutorial highlight) and `.alert` no longer animate.

## Update 7 (2026-11-15): read this first; it wins over anything older below

Checks: `node test/menus-u7.js [chromium|webkit]` (Edit mode, Send out page, one-screen event, best crown, gold frames and no `.badge`, challenges),
plus the updated `menus-shot`, `menus-title`, `menus-fit`, `menus-hire`, `menus-drag`.

### Edit mode (replaces the Build lists and the Move screen)
- The main-menu box is **Edit** (symbol `edit`). `ZMenus.edit(group?)` starts it, `ZMenus.stopEdit()` ends it, `ZMenus.editing()` says whether it is on.
  `ZMenus.screens.build / habitats / facilities / move / remove / upgrade / land` are gone.
- Menus creates `#edit-bar` inside `#floor-wrap` (solid, docked at the bottom, padded by the bottom inset, `hidden` = `display:none`). It is shown only while
  Edit mode is on, no screen is open and `ZRender.placing()` is false; `body.mn-editing` is set while it shows. A 300 ms ticker (`editSync`) keeps it in step.
- Add view: a row of symbol tabs (`.mn-et[data-grp]`: `hab` habitats and more land, `shop`, `fun`, `sci`, `mark` landmarks; empty groups are hidden;
  `own` = "placed things" appears only if the renderer has no `startEdit`) plus a green Done (`.mn-et.done`), then ONE sideways-scrolling strip (`.mn-es`) of cards
  (`.mn-ec[data-key="hab:savanna" | "fac:bench" | "land"]`): picture and price; greyed (`.off`) with a padlock or a red price when locked or too dear (a tap says why);
  left out when a challenge forbids the biome (`ZE.allowed(S,'biome',b)`), greyed when it forbids more habitats (`ZE.allowed(S,'hab',b)`); no land card when `ZE.nextLand` is null.
  A card calls `ZRender.startPlacement` (facilities with `repeat`); nothing is toasted over the strip.
- Picked view (`onPick(item)` from `ZRender.startEdit`, then `ZRender.select(id)`): `.mn-eact` with the thing's picture, Move (`.mn-ea.move`, `startPlacement({moveId})`),
  Upgrade for habitats (the usual `.mn-up` button), Sell (`.mn-ea.sell`, shows the money back, asks once, then `remove`), and a back arrow (`.mn-ea.back`) to the add view.
  `onPick(null)` also returns to the add view. Done calls `ZRender.stopEdit()` and returns to the floor.
- Menus needs from the Renderer exactly the contract in `docs/UPDATE-7.md`; from the Shell that the clock is paused while `ZRender.editing()` (done).
- Money back on Sell is worked out here as half the list price (same as `ZE.remove`); a lookup `ZE.removeRefund(S, id)` would be cleaner.

### Tutorial through Edit mode
Steps: 1 "Tap your land to open the menu." > 2 "Edit: place a Savanna home." > 3 "Now place a Snack Stand." > 4 "Place a Bench near the stand." >
5 "Flag on the habitat: hold an event." > 6 "That's it. Tap the zoo any time." The Edit box glows on the menu; inside Edit mode the wanted card glows (the strip jumps to
its group), and when nothing more is to be placed Done glows. Bare land glows the same way without the tutorial. No tutorial, hint or glow inside a challenge.

### Gold frames instead of red boxes
Nothing in menus.js makes a `.badge`. The Shell's `.alert` frame is used on: main menu Projects / Animals / Staff / Research (something waiting, animals in the pen,
applicants or headhunter, affordable research), Research group boxes with something affordable, Staff's "Who turned up" button. The legend shows a sample frame.

### Events: one screen
Projects > Event > (`event-habs` only when there is more than one habitat) > **`event-setup`**: free people as portrait buttons with their Hosting number
(`.mn-pk.host`, up to 8, best first, best preselected), themes as a grid with their fit sign (`.mn-pk.theme`, 2 columns, 3 when more than 8; best known fit preselected,
a clock marks the theme used last time), and Start with price and weeks. No scrolling at 375x667 with 12 themes and 8 people. `event-theme`, `event-lead`, `event-confirm` are gone.

### Best of its kind
`ZE.bestOf` puts the `best` crown (`.mn-best`) on the animal tile (Animals > Zoo), the pen row and the animal screen.

### Send out page (`exp-confirm`)
Built from `ZE.expStars(S, region, team)`: a header (region picture and name, team, strength sign), five star buttons (`.mn-xs[data-star]`; locked = grey with padlock,
rank medal and the rank number; a tap says why), cost and weeks of the chosen star (`.mn-xinfo .xc / .xw`), its odds rows (`.mn-xodds`), Send. The star opens on the one used
last in that region, else the highest unlocked one costing at most half the bank. `startExpedition(region, team, star)`. Fits at 393x852 (insets 62 / 34) and 375x667.

### Round 7 tester follow-ups
- **`ZMenus.openLevels()`**: opens the challenge level list (`challenges`) on top of the title, from anywhere. Inside a challenge it first calls
  `ZCore.leaveChallenge()` (the run is kept); from a zoo it saves and goes to the title; called twice it does not stack a second list. Returns true when
  the list is showing. Moments' "Levels" button on the challenge result card calls it (after its own `done()`).
- A greyed Projects box (Expedition, Breeding, Event, Advertise) and a greyed hiring tier now say why in the usual short note when tapped
  (the challenge's `ZE.allowed(...).msg`, or the plain reason). `fitGrid` items may carry `why`.
- Event set-up: theme boxes are a fixed 52 px tall (44 px on screens under 720 px high) instead of stretching to fill the panel.
- While the Edit strip shows, Menus lifts the Shell's `#toasts` to 8 px above the strip (inline `bottom`, removed again when the strip hides), so notes
  never sit on the tabs. Nothing needed from the Shell.

### Info trimmed
Rumors: one row per secret place (padlock or tick, name or `?`, tick boxes / map-piece pips; a tap toasts the next hint) and a 4x2 grid of special visitors (tick or `?`;
a tap toasts who or when). Log: Menus' own short screen `log` (`ZMenus.screens.log`): Copy (`ZCore.copyLog`, size shown) and Save as file; the note box is gone.

### Staff words to symbols
A staff level is the number in a small gold box (`.mn-lv`); the skill key line and the worded skill chips are gone (icon plus number everywhere; the legend names them).

### Challenges
- Title: a fourth entry under the slots (`.mn-slot.mn-chal`, symbol `level`, total stars `n/15`, a Continue tag on tall screens when a run is saved).
- `challenges` screen (`ZMenus.screens.challenges`): the five `D.LEVELS` in one line (`.mn-lvc[data-level]`): number, goal symbol (`D.GOAL_ICON`) and number, limits as
  symbol lines (clock weeks, coin start money, map rows, padlock + habitat picture = only that biome, fence + number = habitats at most, cross + explorer = no expeditions,
  paw + number = animals to start with), three `star-on` / `star-off` from `ZCore.challengeStars()`; locked (grey, padlock) unless it is level 1, already has stars of its own, or the level before has at least 1 star (one rule, `levelOpen`).
  Continue (`ZCore.resumeChallenge()`) when `ZCore.challengeSaved()`; Start (`ZCore.startChallenge(id)`; asks once if it would replace a run in progress).
- Inside a challenge (`ZCore.inChallenge()`): Info hides Rumors, Ranks, Years, Awards; System's Title screen calls `ZCore.leaveChallenge()`, Replay tutorial is replaced by
  Restart level (asks once); Projects greys Expedition / Breeding / Event / Advertise with a padlock when `ZE.allowed` says no; hiring tiers grey for `'hire'`;
  Research leaves out what `ZE.allowed(S,'research',id)` refuses; Edit as above; legacy is never recorded.

## Public

| Call | What it does |
|---|---|
| `ZMenus.open()` | Pushes the main menu (id `menu`, button "Play"). `ZCore.openMenu()` calls it on a floor tap. |
| `ZMenus.init()` | Nothing to register (kept so the page's start-up call is harmless). |
| `ZMenus.recordLegacy()` | Writes the carry-over record (`ZCore.legacy`: runs, best, aff, combos, hall, carry staff and animals) once per finished zoo, guarded by `S.flags.legacySaved`. Returns true if it wrote. Moments may call it from its `final` handler; the New zoo screen calls it itself if nobody did. |
| `ZMenus.screens.<name>()` | Pushes a screen directly (useful for tests): `main projects build animals staff research info system book combos fits rumors ranks years awards how newZoo expedition breeding event campaigns hire market pen crate habitats facilities move remove upgrade land yearly show decision`. `animals`, `market` and `pen` open the Animals screen on that tab. `animal(id)` and `staffer(id)` take an id. |

## Screen ids (what `ZCore.stack()` shows)

`menu` > `projects` (`project`, `exp-region`, `exp-team`, `exp-confirm` (budget tabs live here), `breed-pairs`, `breed-lead`, `breed-confirm`, `event-habs`, `event-theme`, `event-lead`,
`event-confirm`, `campaigns`, `yearly`, `show`, `choice`, `happening`) | `build` (`build-habs`, `build-facs`, `build-move`, `build-remove`, `build-upgrade`, `build-land`) |
`animals` (`animal`, `animal-hab`, `offer`, `crate`, `crate-rarity`, `crate-animal`) | `staff` (`staff-one`, `staff-train`, `staff-job`, `staff-hire`, `staff-candidates`) |
`research` (`research-list`) | `info` (`book`, `species`, `combos`, `fits`, `rumors`, `ranks`, `years`, `awards`, `log` from `ZCore.screens.log()`) | `system` (`how`, `newzoo`).

## What each box holds

- **Projects**: "Needs you" rows (a waiting happening, the Open Day / Festival plan, the Animal Show entry), "Running" rows with progress bars (a row with a pending choice is highlighted and opens the choice),
  then four big boxes with plain readiness under the word: Expedition (`Ready` / `Convoy is out` / `No one free`), Breeding (`N pairs ready` / `None ready`), Event (`N habitats ready` / `None ready` / reason), Advertise.
  Each planner is a chain of one-job screens; the last one shows odds and has one green button. Starting a project closes all screens (time resumes) and toasts.
  The lead step (breeding, event) is skipped when only one person is free.
- **Build**: Habitats, Facilities, Move, Remove, Upgrade, Buy land. Habitats and Facilities close all screens and call `ZRender.startPlacement` (facilities in `repeat` mode, `onPlace` returns the engine's `build` result).
  Move uses `startPlacement({moveId})` and `ZCore.act('move', ...)`. Remove and Upgrade ask first. Placing one thing ends placement and returns to the floor with time running; in repeat mode (facilities) the Renderer's third button turns into Done after the first place and also returns to the floor (`onDone`). Cancel before anything was placed reopens Build.
- **Animals**: tabs Zoo (grouped by habitat) / Pen (one-tap `House` per animal, `House all`) / Market (trader or director offers; Animals always opens on Zoo, Mystery crate with odds, then a reveal in two cards). Animal screen: numbers and grade, `House`, `Choose habitat`, `To holding pen`, `Sell` (confirm).
- **Staff**: Hire (advert tiers, then `ZMoments.revealHire` as a display-only reveal, then the "Who turned up" list where the one-tap Hire buttons are), Who turned up (stays available for 8 weeks), headhunter offer, team list; person screen with Train (result card, `Super!` in gold), Change job (confirm, level resets), Let go (confirm).
- **Research**: five group boxes (Regions, Know-how, Facilities, Themes, Landmarks) then lists with cost, a short reason when locked, confirm before spending.
- **Info**: Book (hidden secret regions until found, silhouettes for unseen), Combos (one piece short: tap to place the missing facility; found list with piece pictures), Fits (`--` `-` `+` `++`, `?` untried), Rumors, Ranks, Years, Awards, and Log (only when `ZCore.devTools` is true).
- **System**: Save now, Speed 1x/2x, Zoom Close/Far, How to play, New zoo (name, carry-over perks, pick one person and one animal, two confirms, then `ZCore.newGame(opts)`).

## Coordination with Moments

- A project's pending choice opens through `ZMoments.showChoice(pid)` when it exists; otherwise a fallback screen built from `ZCore.ui.choices` and `resolveChoice` is used. Same for `S.happening` (fallback only; Moments has no entry point for it, so Menus builds it).
- Open Day / Festival and the Animal Show entry are answered from Menus (`resolveYearly`, `enterShow`); the resulting `yearly` and `showresult` reports show through the Shell queue as usual.
- Menus never shows a report. Training, the mystery crate and hiring have no report, so Menus shows their result cards itself.
- Callers: Menus keeps their open offers reachable (Animals > Market, Staff headhunter row). It does not call `ZMoments.showCaller`.

## Needs from other files

- `style.css`: `.panel` and `.pbody` have no `min-width: 0`, so a long unbreakable title in a list row widened the whole panel past the phone (seen on Facilities in the late game). Menus injects `.layer .panel, .layer .pbody { min-width: 0 }` itself; the Shell may want to move it into `style.css`.

## Not done

- Rename animal is not offered (`renameAnimal` exists in the engine).
- No sound, no calendar, nothing from the rejected list.

## Result cards are never swallowed

After any action that can raise a report or reveal (start project, Open Day, Animal Show entry, buy, sell, upgrade, remove, job change, let go), Menus closes or pops its own screen through `later()`, which waits until `ZCore.busy` is false and `S.reports` is empty. So the Winter Show result and any combo or rank-up card are seen and tapped away first, then the menu closes. Training, crate and hire use `ZMoments.revealTrain`, `revealCrate` and `revealHire` when present (own cards otherwise). Animal rows show the grade once, on the chip line.

## Title screen, slots and new-zoo flow (round 3)

- `ZMenus.title()` is what `ZCore.showTitle()` calls at start-up (modal, id `title`, no Back). A pixel logo ("WILDSIDE" / "ZOO") is drawn in code from a tiny 5x7 letter font (no image files), a row of animals and the gate sits under it, then three slot cards from `ZCore.slots()`.
  A used slot (zoo name, `dateText`, money, rank stars, animal count with a paw) taps straight into play (`ZCore.loadSlot(n)`); a separate 44 px cross at its right edge deletes after a confirm (`ZCore.deleteSlot`). An empty slot reads "New zoo".
  If the slot summary ever gains a `species` array (ids), the card shows up to two portraits instead of the paw and count; the Shell does not provide it yet.
- New zoo: `newzoo-name` (prefilled "Wildside Zoo", 18 px field so iOS does not zoom, Enter goes on) > `newzoo-tutorial` (Yes / No) > `newzoo-carry` (only when `ZCore.legacy` has carry-over: pick one person and one animal) > `ZCore.newGame({slot, tutorial, zooName, staff, animal})`.
- System: Save now, Title screen (saves, records legacy if the zoo is finished, `ZCore.toTitle()`), speed, zoom, How to play, Replay tutorial. The old "New zoo" with two confirms is gone: starting a zoo always goes through the title.

## Tutorial (coach strip)

- Five steps, each a one-line text completed by doing the thing: 1 open the menu, 2 start an expedition, 3 start an event, 4 build a bench, 5 (auto-finishes after 7 s). State is `S.ui.tutorial = {on, step, b}` (`b` = baselines used by Replay so earlier actions do not count), saved with the game.
- A 300 ms ticker (`tutTick`) checks `S.did` counts and the bench count; steps complete in order, even if the player had already done the thing. A bar sits under the top strip on the floor (taps pass through, only Skip takes touches) and inside the top screen's panel, just under its title, while a screen is open. It hides while a modal or a report is on screen. A soft pulsing outline marks the next box or button.
- `ZMenus.startTutorial()` restarts it (System, Replay tutorial). Skip sets `on:false`.

## Boxes fit without scrolling

Main menu, Projects, Build, Research, Info and System use `fitGrid`: rows share the panel height, icons scale with `vh`, sub-lines hide under 640 px height. Checked at 390x664, 390x753, 375x553, 375x647, 430x739, 440x956 and 390x844. Nothing in menus.js assumes a panel width.

## Symbols

Animal stats are icon plus number (`ui.astat`; Charm, Energy, Smarts), staff skills `ui.skillChip` (Care, Science, Scouting, Hosting), grade `ui.grade`, sex `sex-m` / `sex-f`, babies `juv`, costs `ui.cost` (coin, flask, clock), "New!" the burst, locked reasons start with the padlock, show medals and review scores use icons. Fit and strength stay `--  -  +  ++`. How to play has a "Symbols" legend listing every stat, skill, grade and the common symbols.

## Tests

`node test/menus-shot.js` (use `?play=1`; includes chip and legend checks) and `node test/menus-title.js` (title, slots, tutorial steps, Skip, reload mid-tutorial, delete confirm, Title screen round trip, no-scroll at seven sizes).

## Round 3 follow-ups

- **Hiring**: the advert tiers now sit on the Staff screen itself (no separate Hire screen to open). Pick a tier: the "Who turned up" list is pushed, then `ZMoments.revealHire` plays over it, and tapping through returns to that single list, where Hire is one tap per row. From the floor with two applicants: floor, Staff, tier, two reveal taps, Hire = 6 taps (`node test/menus-hire.js`).
- **Words beside symbols**: Years and the staff screen use captioned chips; Animals, Staff and "Who turned up" start with a one-line key (icon + word) for the stat or skill icons; an animal's stat boxes carry the name. Durations are the clock symbol with the number; "/wk" only on wages.
- **Legend** (How to play): Symbols (stats, skills, sex, baby, new, done, locked, odds, weeks, grades), Zoo (money, research, fame, visitors, rank stars, buzz flame, habitat, pen, land, trophy, rarity, medals, red count badge), On the floor (event flag, pair heart, working, unwell, answer mark, progress bar, buzz).
- **Title**: fits three slots without scrolling down to 320x568 (the animal row and the 3rd-line of each card hide under 700 px high). Used slots show up to two portraits from `species` / `variantFlags`; the most recently saved used slot has a green number box and outline (and a "Continue" tag on taller screens).
- **Tutorial** step 3 reads "Flag on habitat: ready. Hold an event."

## Blank start and the placing tutorial (round 4)

- A new zoo from the title is bare land (the Shell passes no `starter`). `?play=1` / `ZT.newGame()` keep the classic start; `?play=blank` gives the bare one.
- Tutorial steps (6, each done by doing it): 1 "Tap your land to open the menu." > 2 "Build, Habitats: place a Savanna home." > 3 "Now place a Snack Stand." > 4 "Place a Garden Bench beside it." > 5 "Flag on the habitat: hold an event." > 6 "That's it. Tap the zoo any time." (auto-finishes after 7 s).
  Step 2 hides the strip for 2.6 s after the habitat is placed so the zebras visibly move in. Step 5 (event) is used rather than an expedition because the habitat's flag is up as soon as the zebras are in (`eventAt` starts at -99) and someone is free. The combo is not required.
  While the ghost is up the strip reads "Tap a spot, then Place." and sits just below `#placement-note`, clear of the placement buttons. Baselines in `S.ui.tutorial.b` (`hab`, `snack`, `bench`, `startEvent`) make Replay work on an existing zoo.
- While `ZE.isOpen(S)` is false, the Build box, Habitats and the Savanna row carry the soft highlight (tutorial or not), the first Savanna is never greyed for money, Animals opens on the Pen ("Build a habitat first.", House disabled with "Needs habitat"), and Projects says "Build a habitat" under Event. Market shows "Nobody is selling." while `S.offers` is null.

## Round 5 (owner's iPhone feedback)

- **Projects**: Start boxes first (fixed 84 px rows, one-word sub-labels, no overlap), then "needs you" rows (including waiting arrivals), then compact Running rows: portrait, short name (region / species / theme), clock + weeks, thin bar; a running advert shows as "Hiring". Four running projects fit at 393x852 without scrolling.
- **Animals**: Zoo tab is a two-column grid of tiles (portrait, three icon+number stats, sex, baby mark, grade badge), sorted by species within each habitat; the stat key line is gone (legend explains). Waiting arrivals (`S.arrivals`) sit at the top as highlighted rows and open `ZMoments.showArrival(id)` (fallback: own `arrival` / `arrival-where` screens, Sell or Keep, then where with the holding-pen upkeep shown). Pen tab shows the weekly upkeep (`ZE.holdUpkeep`) with coin and number.
- **Market**: each offer carries a buying-comparison badge from `ZE.compareOwned`: burst = new species, sex mark + = you lack that sex, green up arrow = better than your best, red down arrow = worse, `+-` = mixed. The crate is the rarity crate (stars, left/total, the species it can hold); `Open` calls `ZMoments.revealCrate`, whose flow covers Sell or Keep and where. Buying hands the animal to the same arrival decision.
- **Habitat built or upgraded**: nothing moves in by itself; a "Move in?" prompt (portraits, Not now / Move in) calls `ZE.moveIn`. Tutorial step 2 completes after that prompt is answered (or no one can move in), then the strip waits 2.6 s so the zebras' hop is visible.
- **Staff**: Hire is a timed job: tiers show their weeks; paying starts it, the Staff screen shows it running (clock, bar) and Projects lists it; applicants arrive as a Moments pop-up which then opens `ZMenus.screens.candidates()` ("Who turned up", kept until they expire).
- `ZMenus.screens` gained `candidates` and `whoTurnedUp`. System shows "Screen check" when `ZCore.devTools` is true. Weights are 700 or less and there are no text shadows.
- Tests: `node test/menus-fit.js` (Projects with 4 running, Animals with 14 animals, no scrolling at 393x852 and 390x844; Animals at 375x667 is reported but not asserted), plus updated `menus-shot`, `menus-title`, `menus-hire` (6 taps: floor, Staff, tier, two reveal taps, Hire, with the wait for applicants not counted).

## Round 5 later additions

- **Staff count**: a big chip (person icon, "3 / 4", plus a small "Rank 3: 5" when the cap grows) tops Staff, Who turned up and the advert tiers; solid red-orange with a "Full" tag when full, every Hire button greyed with "Staff full". The main menu's Staff box shows `n/cap`.
- **Running list** in Projects also lists each running advertising campaign (clock, bar; tap opens Advertise) and the hiring advert. The Start boxes stay fixed; the running list scrolls inside its own area if there are too many rows (6 rows fit at 393x852).
- **Upgrades** moved to where space is thought about: each habitat header in Animals > Zoo (empty habitats too) carries a button with an up arrow, the new capacity and the price; gold when the habitat is full; solid grey with a short reason ("Max level", "Needs research", "Need $X"). Same button in Build > Upgrade, the "Move in?" prompt and, for a full habitat, the arrival "Where?" list (it upgrades and then sends the animal there).
- **Press, hold and drag** (Animals > Zoo and Pen): hold a tile or pen row 0.35 s, a solid copy follows the finger; every habitat section is marked green (with "Room n") or grey (the reason shows on the dragged copy while hovering: Wrong biome, Habitat full, Lives here); a Holding pen target (weekly upkeep) and a Sell target (price) are pinned above Back (on the Pen tab the habitats are targets there too). Drop moves, pens, or asks one confirm and sells; any other drop changes nothing. Animals in a running project shake and say "In a project". Near the top or bottom edge the list auto-scrolls. Touch and mouse; a short tap still opens the animal and a swipe still scrolls. The "Hold and drag to move." hint shows once per device. Tests: `node test/menus-drag.js`.
- No see-through elements: shadows and disabled looks use solid colours, silhouettes are solid grey.
