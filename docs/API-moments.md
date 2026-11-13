# API as built: Moments (`moments.js`)

Global: `ZMoments`. One IIFE, loaded last. It registers a handler for every report type when the file loads
(`ZMoments.init()` registers them again, harmlessly). CSS is injected once as `<style id="mo-style">`, every class starts with `mo-`.
Tests: `node test/moments-shot.js [chromium] [webkit] [--quick] [--only=late,cards,callers,happenings,yearly,reveals,yearend,realplay,reopen,inmenu]` (headless; shots in `test/shots/moments-*.png`).

## How a moment works

* Every moment is **one modal screen** on the Shell's stack (`id` starts with `mo-`). Its content is swapped inside that screen, so the
  stack is never empty between two beats, time stays paused, and the Shell's "empty stack for 1 s releases the queue" rule never fires.
* `done()` is called **exactly once**: when the player taps the last card, when a button ends it, or (safety net) from `onClose` when
  something else closes the screen (`popAll`, new zoo). A handler that throws calls `done()` and records the error in `ZMoments.errors`
  and `ZT.errors`.
* Reveal sequences are lists of beats. Beats with a time advance by themselves; the last beat waits for a tap. **Untouched, the last
  card appears within about 3.5 s** (expedition: more than 3 finds are compressed to about 850 ms each). **Tap anywhere** (also on the
  dark margin): the first tap completes the running beat at once (numbers jump to their final value) and holds there; the next tap goes on.
  Taps in the first 0.3 s of a screen, and in the first 0.45 s of a final card, are ignored so a double tap cannot skip a result.
* Animations are CSS animations with delays plus `setTimeout`; nothing depends on `requestAnimationFrame`, so a hidden tab still gets to the
  final card. `prefers-reduced-motion` turns the animations off.
* A moment that is open when the page reloads shows again: its report stays in `S.reports` until `done()`. A choice or happening that was
  already answered before the reload is stale and is skipped (`done()` straight away). Stale data is always guarded (sold animals,
  habitats removed, unknown combo or VIP ids).
* Nothing here calls an engine action except through `ZCore.act` (`resolveChoice`, `resolveHappening`, `resolveYearly`, `enterShow`,
  `buyAnimal`, `openCrate`, `hireHeadhunt`, `hireCandidate`) and `ZCore.newGame` (new zoo).
* Test hooks: `ZMoments.shown[type]` and `ZMoments.finished[type]` count handler calls and `done()` calls per report type; `ZMoments.cur = {id, i, n, final, at}` describes the beat on screen (`final` = last beat reached).

* **Fit rule:** content that can outgrow the screen scrolls inside the panel; exit and continue buttons are pinned below it (`M.foot`, 56 px minimum, inside the safe area) and the Winter Show header is pinned above it (`M.head`). Tested at 390x844 and 375x667 with 32 animals, 8 staff, long names (`--only=late`).

## Symbols, not words

* Animal stats and staff skills are shown as icons plus exact numbers, with names and icon keys read from `ZD.ASTAT[key]` / `ZD.SKILL[key]` (the Shell's `ui.astat` / `ui.skillChip` for the compact chips on trader and headhunter cards; larger icon boxes in the reveals). No stat word is printed anywhere in Moments.
* Choice options (`choice`, `happening`, `yearlyplan`) are drawn by Moments with the same look as `ui.choices`, but the detail line is built from the option's fields, never from its `note` text: star pick = animal portrait, its stat icon and value, then the gain; options with `.skill` and `.staff` = the person's portrait, skill icon and their value (boost, night watch, escape, scientist). `note` is shown only where there is no such field (for example "+1.5 to 2.5 points, flop -1"). Costs are `ui.cost` (coin and flask), odds are the die symbol, a bar and a percent.
* Sex uses `sex-m` / `sex-f` (and `juv` for youngsters) on trader and director rows. Wages use the coin plus the clock (`time`). Medals are `medal-*` icons, the Show shows the judged stat as an icon, review lines use `flame`, `ok` / `no`, `new`.
* `ZMoments.revealHire` needs ONE tap to skip the flips (they also flip by themselves in about 2 s) and one tap on the last card to leave. It never needs a tap per applicant.

## Report handlers (registered by `ZMoments.init`)

| Report | What the player sees |
|---|---|
| `choice` | Blue title bar (the engine's title), a pixel portrait of the lead (`choice.who`), one line, 2 to 5 option buttons with cost chips and odds bars (`ZCore.ui.choices`; options you cannot afford are greyed and ignore taps; the star pick shows each animal's portrait). After picking: if the option had odds a 0.75 s suspense beat ("..."), then a result card (title bar "It worked!" / "No luck", or "Good call" / "Setback" when there were no odds; bad results turn the bar red), tap to return. Stale choices (project gone, already answered) call `done()` at once. |
| `happening` | With `options`: same screen as a choice (portrait of `who` and of the animal it is about; the stray also shows its Charm, Vigor and Wit; bad happenings have a red bar). Without options: one card (portrait, title, the one line the engine wrote), tap to continue. |
| `expedition` | Each find is opened in turn: stars pop one by one (rarity first), silhouette unveils, name and tags (New species!, Rare variant), then Charm, Vigor and Wit count up as numbers, then where it lives. Rarity 4 and up gets a gold frame; a small letter grade sits on the portrait. Last card: thumbnails of everything found, research gained, old-map piece (n of 4 pips), who levelled up. Nothing found is handled. |
| `birth` | Failure: a short card with the chance that applied. Success: one beat per baby (twins are compressed): pixel baby, then each stat as a row `Charm | parents 41 | 47 | +6`, counting to the value, a gold row and "LUCKY +11" when the engine says `lucky`, then the rare-variant roll as its own row (`chance 6%` then `YES!` or `no`), then where it lives, and "First of its kind born here!" when `firstBred`. |
| `review` | Four critic boxes flip from `?` to a score out of 10 one at a time (colour by score), the total counts up out of 40, a Hall of Fame beat at 34 or more, then the final card: total, fit word, money, reputation and research chips, and up to four short lines (new pairing, repeated theme, host on fire, big idea result, star animal if it still exists). |
| `caller` | Trader, director (rows of animals with portrait, stars, New tag, Charm/Vigor/Wit numbers and a Buy button; a Mystery crate row with the odds per rarity and an Open button) or headhunter (portrait, name, role, four skill numbers, wage and fee, Hire button, greyed with the reason when the room is full or money is short). "Not now" dismisses; offers are not time limited. |
| `combo` | Gold card: the anchor building, or an animal living in the anchor habitat, as a picture, the combo name, its bonus ("+20% draw"). Unknown ids are skipped. |
| `rankup` | Gold card: "Rank n: name", the rank stars, the unlock lines from the engine. |
| `secret` | Gold card for the paleo map and the mythic chart. |
| `vip` | The `vip` person sprite, the name, money and reputation chips, the visitor boost. |
| `yearlyplan` | Title bar is the event name, `showrunner` portrait, one line, the four spending tiers as option buttons. Picking one calls `resolveYearly` and ends the moment at once; the engine's `yearly` report follows in the queue. Nothing is shown twice. |
| `yearly` | Crowd counts up, tier name, money and reputation chips. |
| `show` | The picker (the Winter Animal Show): judged stat, the three medal scores, the best 8 animals with their judged stat, score and the medal they would win. Tapping an animal asks to confirm, then `enterShow`. "Not now" leaves the show open (reopen with `ZMoments.showShow()`). |
| `showresult` | Score counts up against the gold bar, then the medal card (gold gets the rare frame) with money, reputation and trophy. (`show` is the picker, `showresult` is the result; `enterShow`'s result is not shown a second time.) |
| `yearend` | Beat 1, the awards show: five boxes flip to WON (with the prize) or missed (with your figure). Final card: your place of the league ("#3 of 12"), a short table (top 3, you and your neighbours), profit, visitors, species, best review. |
| `final` | Calls `ZMenus.recordLegacy()` if it exists, otherwise saves the carry-over record itself once (`S.flags.legacySaved`: runs, best, theme fits, combos, hall, the top 4 staff and top 4 animals as `ZCore.legacy.carry`, then `ZCore.saveLegacy()`), counts the score parts up one by one and the total. Buttons: "Start a new zoo" (name box, optional one person and one animal to bring, shows the start-money bonus, then `ZCore.newGame({zooName, staff, animal})`) and "Keep playing". |

## Functions for Menus

All take a `done` callback that is called once when the player leaves the moment. `done` may be omitted.

| Call | Use |
|---|---|
| `ZMoments.showCaller(kind, done)` | `kind` is `'trader'`, `'director'` or `'headhunter'`. Opens the same screen as the pop-up. If nobody is there (offers replaced, headhunter gone) it toasts "Nobody is here right now" and calls `done`. Use it for the rows under Animals / Staff. Buying and hiring work inside it. |
| `ZMoments.showChoice(pid, done)` | Reopens the waiting mid-project choice of project `pid`. A stale id calls `done` at once. `ZMoments.pendingChoices()` returns the ids of every project that is waiting for an answer. |
| `ZMoments.showHappening(done)` | Reopens the pending happening (`S.happening`) that was dismissed without an answer, with its options (or the plain card). Nothing pending: toasts and calls `done`. The engine applies the default two weeks after it arrived. |
| `ZMoments.showShow(done)` | Reopens the Winter Show picker while `S.show` is open. |
| `ZMoments.revealAnimal(animal, opts, done)` | Stars, unveil, name, numbers. `animal`: `{sp, variant, charm, vigor, wit}`. `opts`: `{kicker?, isNew?, hab?}` (`hab` = habitat id, or `null` for "goes to the holding pen"; leave it out to say nothing). Single card that waits for a tap. |
| `ZMoments.revealCrate(result, done)` | Call it with the result of `ZCore.act('openCrate')` (`{animal, rarity, isNew, hab}`): the crate shakes for 1.1 s, then the animal is revealed. |
| `ZMoments.revealHire(candidates, done)` | Call it with `ZCore.act('advertise', i).candidates` (or leave it out to use `S.candidates`): each applicant is introduced in turn (portrait, name, role, four skill numbers, "Standout!" for stars), then a pick list with Hire buttons (`hireCandidate`) and Done. |
| `ZMoments.revealTrain(staff, result, done)` | After `ZCore.act('train', ...)`: `result` is its return value (`{gain, super, stat, value}`). Plain "Trained" card, or a gold "SUPER!" card. |
| `ZMoments.result({title, lines, good, img, big, kicker, chips, tone}, done)` | A generic one-card result. `lines` is an array (or a string); `good` picks the green or red tone; `img` is a data URL; `chips` is an array of DOM nodes. |

## Needs from other files / notes

* Nothing is required from other files. The Shell's `ui.reveal` card is not used (the reveals need several parts animated separately); the Shell's `ui.choices`, `ui.btn`, `ui.stat`, `ui.stars`, `ui.list` classes are.
* `ZMoments` expects `ZCore.legacy` and `ZCore.saveLegacy()` (present) for the carry-over record. If Menus' System > New zoo should offer the same carry-over choices as the final screen, it can reuse `ZCore.legacy.carry`.
* The old game's tips ("weakest area: ...") are left out on purpose. Review numbers and the hand-off lines are all that is shown.
