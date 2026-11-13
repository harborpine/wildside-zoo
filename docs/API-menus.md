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
