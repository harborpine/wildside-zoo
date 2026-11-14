# menus.js: API as built (Menus)

One IIFE, one global: `ZMenus`. Loaded after `core.js`, before `moments.js`. Built only on `ZCore` (stack, `ui`, `act`) and `docs/API-rules.md`.
Every state change goes through `ZCore.act`. Checks: `node test/menus-shot.js [chromium|webkit]` (headless, writes `test/shots/menus-*.png`),
`node test/menus-sheet.js <name> <shot> <shot> ...` puts shots side by side, `node test/menus-dbg.js <screen>` lists anything wider than the phone.

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
