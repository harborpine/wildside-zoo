# Wildside Zoo: test report (Tester)

# ROUND 4 (bare-land start and the placing tutorial)

moments.js was unchanged for 12 minutes (last change 15:43, first pop-up-heavy run 15:55) before the full-year runs.

## Summary

**Did the new opening plus a full first year from bare land play cleanly by touch on both engines: YES.** Title, New zoo, name, tutorial Yes, all 6 steps by doing what each says (placing by tapping hexes and Place), then on by touch on the real clock at speed 2 to the year-end screen: Chromium and WebKit at 390x753, 0 findings, 0 console errors, 0 game errors (about 405 s each). The opening alone also passes at 375x553 on both engines. Edge cases (Skip at each step, reload at each step, title mid-tutorial, snack before habitat, remove the habitat, delete the slot being played) all behave and nothing errored. The wrong-order test on bare land (every box, expedition, event, breeding, house, hire, research, advertise, market, placement and cancel, 20 weeks of waiting, then build) never errored, dead-ended or punished.

Suites, all pass: rules-check, bot 0.8, art-check, render-shot both (the bare land variant too), shell-shot, menus-shot, menus-title, menus-hire (hire is 6 taps, ends on one list). Also pass: tester-extra, tester-years (3 years, 0 findings, 17 expeditions, 12 events, 12 year-end beats), tester-sizes, tester-symbols. tester-fit is clean at all seven sizes; at 320x568 it finds two layout problems (R4-1). I did not run moments-shot.

New scripts: `tester-first5.js` (rewritten: opening, tutorial, then the full year; `node test/tester-first5.js webkit 390 753 full`), `tester-blank.js` (B), `tester-edge.js` (C). Logs: `test/shots/tester-r4-*.txt`.

## A. The new opening

- **The land really is bare:** 0 items, 2 zebras in the pen, $26,500, `open` false, no visitors (strip shows `0/wk`), nothing on the floor but the gate and two staff, news line "Build a Savanna habitat to open."
- **Strip vs everything:** the coach strip sits at y 63-107 on the floor and 117-161 inside a screen. During placement the placement note is above it and the buttons below; I measured no overlap of the strip with the note, the buttons or the thing to tap at 390x753 or 375x553. While placing, the strip text changes to "Tap a spot, then Place."
- **First ghost:** valid ("Savanna: Fits here."), well inside the visible floor (y 356 at 390x753, 258 at 375x553), clear of the strip and the buttons.
- **Zebras move in:** after Place, two hearts float up for about 1.6 s (zebras hop), toast "Savanna built, 2 moved in", news "Wildside Zoo is open!". Step 3's text appears about 2.8 s after Place, so the move-in is never covered. `tester-cr-f5-390x753-08-zebras-moving-in-a.png`.
- **Bench "beside it":** at 390x753 on both engines a natural player's tap (a free hex beside the Snack Stand) completes the Safari Picnic: the first pop-up a player ever sees is the combo card, picture only: zebra + stand + bench = person +20%. It reads clearly without words. **But at 375x553 on both engines the same natural tap does not complete it** ("Fits here."), although the default ghost (just tap Place) always says "Completes Safari Picnic!" (finding R4-2).
- **Event flag:** up on the habitat for step 5 (`ready-event` and `ready-breed` icons); the event starts; the star-pick choice that follows is the only pop-up between steps 5 and 6. Nothing random interrupted the tutorial (the quiet weeks work).
- **Tutorial length:** about 25 s end to end when played quickly.
- **Year one from the same zoo:** clean on both engines (6 expeditions, 2 events, 2 breedings, pen housing; year-end screen reached). Year end money about $26k to $27k, so the start money is not idle.

## B. Tutorial No, wrong order on bare land

- **Is it obvious what to do first?** Yes: on the very first menu **Build is highlighted** (soft white glow) and the news line says "Build a Savanna habitat to open." Animals shows a badge (2) and the pen row says "Build a habitat first." / "Needs habitat".
- **What each wrong move did:** Projects shows "Event: Build a habitat" and "Breeding: None ready"; expedition works (and brings finds to the pen); House all says "No room", House says "Needs habitat" (greyed, no toast, nothing happens); Market says "Nobody is selling."; Upgrade, Move and Remove say "No habitats yet." / "Nothing to move." / "Nothing to remove."; Buy land says "Needs rank 2"; placement then Cancel returns to the Build menu; a Snack Stand can be placed before any habitat; hiring and research work. Waiting 20 weeks at speed 2 with no habitat: money unchanged (no costs), no pop-ups of its own (only the expedition I had sent), strip stays `0/wk`. Then building the habitat: zebras moved in, "Wildside Zoo is open!". No errors anywhere.
- **Only oddity:** Advertise lets you buy Flyers ($200) with no habitat ("Flyers campaign started", 0 visitors): a harmless wasted spend (R4-5).

## C. Edge cases (`tester-edge.js`, Chromium)

- **Skip at each step:** the strip disappears and the tutorial is off every time (Skip is 56x44), game fine. (My "step 5" case was really step 4, the last step auto-finishes.)
- **Reload at each step:** reload goes to the title; tapping the slot returns the same step and the same buildings every time.
- **Title mid-tutorial:** the strip is hidden on the title and resumes at the same step.
- **Snack stand before the habitat:** works; the strip keeps asking for the habitat; once the habitat is placed it skips straight to the bench step (the snack is already there). Good.
- **Remove the habitat mid-tutorial:** the zebras go back to the pen, the zoo closes, tutorial stays on its step; rebuilding re-houses them. Two polish points (R4-3).
- **Delete the slot being played:** from the title, confirm "Delete ... for good?" (No really cancels); slot becomes empty; a new zoo can start in it at once.

## D. As the owner would

- **Bare start: inviting or empty?** It looks like a calm green field with a gate, which is inviting, and the payoff comes fast: the habitat appears, the zebras hop in with hearts, the news line announces the opening. What feels slightly empty: you never see the two waiting zebras before the habitat exists (the pen is not shown on the floor), and there are no visitors or animals until step 2 is done.
- **Every tutorial line clear in a glance?** Yes: all six are 5 to 8 words ("Tap your land to open the menu.", "Build, Habitats: place a Savanna home.", "Now place a Snack Stand.", "Place a Garden Bench beside it.", "Flag on the habitat: hold an event.", "That's it. Tap the zoo any time."). The only soft spot is "beside it" (R4-2).
- **"Mostly just placing stuff"?** Yes: 3 of the 6 steps are placing something, the first two minutes are menu, place, watch, place, place, one event. About 25 s of play.
- **Taps from New zoo to a working zoo with habitat, snack stand and bench:** about 21: 3 on the title screens (slot, Next, Yes), 1 to open the menu from the land, 4 for the habitat (Build, Habitats, Savanna, Place), 6 for the snack stand (land, Build, Facilities, Snack Stand, Place, Done), 7 for the bench (land, Build, Facilities, Garden Bench, hex, Place, Done). Counting the event tutorial step it is 29 to 30.

## New findings by owner (round 4)

**Menus (`menus.js`)**
- **R4-1 (polish). 320x568 only: rows break.** Steps: bare start, Animals, Pen tab at 320 x 568. The "House / Needs habitat" button takes the row width and squeezes the animal's name to one letter (name box 10 px wide); on the Staff screen the skill numbers run off the right edge (to 330 and 337 px). 375 px and up are fine. `tester-cr-fit320x568-Animals.png`.
- **R4-2 (polish). "Place a Garden Bench beside it." does not always complete the combo.** The default ghost completes Safari Picnic, but a natural tap on a free hex beside the Snack Stand completes it only on some layouts (it did at 390x753, not at 375x553). The first combo is the best moment of the tutorial, so say "next to the habitat and the stand" or "tap Place" so it is not missed.
- **R4-5 (polish). Advertise is open with no habitat:** Flyers can be bought for $200 with no visitors. Disable it or say "Open first".

**Shell (`core.js`) / Rules**
- **R4-3 (polish). Stale text after removing the only habitat:** news still says "Wildside Zoo is open!" while the zoo is closed, and the tutorial strip still shows "Now place a Snack Stand." with no habitat (it does not step back to the habitat step).

**Renderer (`render.js`)**
- **R4-4 (polish). The two waiting zebras are not visible on bare land** (no pen on the floor), so a new player has no sense they exist until they hop in.

No new Moments, Artist or Rules findings.

## Round 3 findings: status

| # | Finding | Status |
|---|---|---|
| R3-1 | star pick and happenings in words | **Fixed** (no stat words in pop-ups; labels now sit beside icons) |
| R3-2 | sex as letters M/F in trader rows | **Fixed** |
| R3-3 | times and wages in words | **Partly:** lists use the clock icon; pop-up prose still says "1 week late", "4 weeks" (fine as prose) |
| R3-4 | microscope and microphone unreadable | **Improved:** redrawn, and the staff screen now shows icon + name + number, so it is readable |
| R3-5 | bronze medal looks like a sack | **Not re-checked** |
| R3-6 | Years chips unlabeled | **Fixed** (Events, Trips, Births, Trophies) |
| R3-7 | legend incomplete | **Not re-checked in detail** |
| R3-8 | title slot cards | **Not re-checked** (only empty slots seen; portraits not looked at) |
| R3-9 | two hire lists back to back | **Fixed** (ends on one list; 6 taps) |
| R3-10 | blank strip and news bands on the title | **Not fixed** (still dark bands at the top and bottom of the title and new-zoo screens) |
| R3-11 | title scrolls at small sizes | **Fixed** (no scroll at all 8 sizes; 320x568 title fits) |
| R3-12 | idle money | **Not fixed** for the classic start ($226k at year 4 start); the bare start ended year one with about $26k |

## Still untested

- Real touch drag in WebKit; a real iPhone with Safari's bars; Add to Home Screen.
- `tester-edge.js` and the full opening at 375x553 on a real device; edge cases on WebKit (only Chromium).
- Buying land, years 5 to 20, the carry-over card and final score screen; years 2 to 4 from a bare start (years ran from the classic start).
- The title slot cards with portraits (R3-8), the bronze medal (R3-5) and the legend (R3-7) were not re-checked.
- Whether a real first-time player finds "beside it" clear; whether the bare start feels inviting is my judgement from screenshots.

---

# ROUND 3 (previous section)

# ROUND 3 (title screen, save slots, tutorial, fit, symbols)

moments.js was unchanged for 13 minutes before I started its pop-up-heavy runs (last change 12:23, runs began about 12:50), so everything below ran on the finished symbol switch.

## Summary

**Did a full first year play cleanly by touch with no errors: YES, on Chromium and WebKit** (0 real findings, 0 console errors, 0 game errors; about 395 s each; reload mid-year kept everything). Years 2 to 4 by touch (waiting by `ZT.tick`): all year-end screens reached, 0 findings (3 years, 18 expeditions, 35 choices, 12 year-end beats). `tester-extra` (crate, headhunter, upgrade, move, remove, Winter Show): all pass, and **the Winter Show result card now shows** (round 2 bug N1 fixed). The first five minutes (title, name, tutorial, slots, delete) play cleanly on both engines. No box-grid screen scrolls at any of the 8 sizes on either engine.

The test suites all pass: rules-check, bot 0.8, art-check, render-shot both, shell-shot (it passes now), menus-shot, menus-title (both engines). `moments-shot` not run, as asked.

What is still wrong is small: words and letters left where symbols were meant to replace them (the star-pick choice, happenings, the trader rows), a few symbols that are hard to read, and blank bands on the title screen. No blockers, no new "should fix" other than the leftover words.

Scripts added or changed this round: `tester-first5.js` (first five minutes, clean profile), `tester-fit.js` (fit at 8 sizes), `tester-symbols.js` (symbol audit of every screen and moment that can be opened), `tester-lib.js` (title-first boot, plus an automatic scan for leftover words and letters after every tap sequence: `test/shots/tester-words-*.log`), and `tester-play/extra/years/sizes` updated for `?play=1`.

## B. The first five minutes (both engines, clean profile)

Flow played: title, tap empty slot 1, name screen (typed "Mina's Safari" by keyboard, field is 18 px so iOS will not zoom), "Play the tutorial?" Yes, followed the 5 coach steps by doing exactly what each said, System, Title screen (slot card shows name, date, money), new zoo in slot 2 with tutorial No (no strip appeared), back to the title, tapped slot 1 (loaded, zoo intact), deleted slot 2 (44 x 44 trash button, asks `Delete "Wildside Zoo" for good?` with No and Delete, No really cancels). Screens: `test/shots/tester-cr-f5-*.png` and `tester-wk-f5-*.png`.

- **Title screen: attractive and clear.** Big pixel logo, zebra, giraffe, gate, lion and elephant, three big slot cards with a number badge. An empty slot says "New zoo"; a used slot shows name, date and money. Nothing to explain. (Polish items below: blank bands, no Continue shortcut, no settings or credits link, which an App Store reviewer may look for.)
- **Tutorial steps:** 1 "Tap the zoo to open the menu." 2 "Open Projects and send an expedition." 3 "Flag icon: ready. Hold an event." 4 "Build a bench: Build, Facilities." 5 "Answer pop-ups when they appear. Have fun!" Each is 5 to 7 words, one line. Each completed by doing it (13 to 16 s when played quickly). Skip is always there and is 56 x 44.
- **Does the strip ever cover the thing to tap?** No. On the floor it sits at the top of the stage, over empty ground; taps pass through. Inside a screen it pushes the content down and the boxes still fit without scrolling (checked 375 x 553, 320 x 568, 390 x 664 with the tutorial on). Target buttons (Projects, Expedition, Garden Bench) get a soft white glow, which makes step 2 and 4 easy. In placement the strip stays at the top, the buttons at the bottom.
- **Pop-ups mid-tutorial:** when a pop-up arrives (a combo card did) the strip hides, then returns on the same step after the pop-up. Not confusing in my runs.
- **Unclear or blocking steps:** none blocking. Step 3 ("Flag icon: ready") does not say where the flag is, but the Event box and the flag on the habitat make it findable. The tutorial ends without ever teaching housing, breeding, money or the heart icon; those are only in How to play.
- **Can the player get stuck?** No dead end found: Skip always works; if no event can start the strip stays on step 3 until the player skips. Not seen in my runs.
- **Polish (title):** during the title and the three new-zoo screens the top strip (57 px) and the news bar (31 px) are empty dark bands, so the title does not use the whole screen (`tester-cr-f5-01-title.png`, `tester-cr-f5-04-tutorial-question.png`). A used slot card does not show animals or play time.

## C. Menu fit and screen use

Sizes: 375x553, 375x647, 390x664, 390x753, 390x844, 430x739, 440x956 and 320x568, Chromium and WebKit, touch, `tester-fit.js`.
- **No scrolling on any box-grid screen at any size** (main menu, Projects, Build, Research, Info checked at each). Every box is at least 44 px. Back is always fully visible; panel is 9 px from each edge; the app fills 0..width and 0..height with the strip on top and the news bar at the bottom, no unused bands once a game is running. Long lists (Staff, Research regions, Info Book, Rumors, Market) scroll inside the panel with Back visible. The placement bar (two buttons, 137 to 192 px wide, 56 px tall) is inside the screen at every size.
- **320x568 (oldest small iPhone):** works. The main menu fits (332 px body), boxes fit, placement fine. Only the title screen scrolls a little there (485 px in a 468 px area) and at 375x553 (511 in 453): the third slot card is partly below the fold. Polish.

## D. Symbols

**Remaining words or letters where a symbol was meant** (found by the automatic scan across year 1, years 2 to 4 and the audit):
1. **Star pick (event, week 1) uses words:** "Charm 17: Fun +1.0", "Energy 19: Animals +1.0", "Smarts 12: Learning +0.9" (Moments). Should read with the stat symbol and a number. Also uses the word "Vigor" nowhere; no leftover "Vigor" or "Wit" anywhere in the game.
2. **Happening text:** "Wes +2 Science" (mo-happening). **Review line:** "Host on fire" (mo-review). Event confirm still says "Host" as a label (fine, it is a role).
3. **Sex shown as letters "M" and "F"** after the species name in Trader and Director rows (Animals and Pen use the male and female symbols). Inconsistent.
4. **Wages and times in words:** "$100 a week" (headhunter), "4 weeks" (campaigns, expedition choices), "Produces research every week" (research list). The legend has a Weeks clock icon, so these should be the clock plus a number. Expedition "Next (clock) 4" is the one place it is done.
5. Level is still "Lv 1" / "Level 1" (fine, no symbol was promised).
6. The grade badge on the reveal cards is a letter in a box ("C", "D"); on animal rows it is a rosette that is too small to read the letter (a grey rosette is all you see at 390 px). Reads as a medal, not a grade.

**Symbols that could be confused at phone size:**
- Staff skills: the **microscope (Science)** looks like a teal blob and the **microphone (Hosting)** looks like a purple lollipop at 14 to 16 px. Paw (Care) and compass (Scouting) are clear. Charm (pink sparkle), Energy (orange bolt) and Smarts (blue bulb) are clear and colour-coded.
- **Medals:** the Winter Show bronze medal looks like a money sack, and the result card says no word ("Bronze"), only the picture. The reputation icon (a gold ribbon medal) is the same family as the gold-medal target, so "+13 (medal)" next to "25 / (medal) 35" is easy to misread.
- **Flasks:** the Research box icon (green flask), the research points icon (blue flask) and Know-how (green flask again) are three similar things. **Themes** uses the same flag as "event ready".
- Years screen: four unlabeled icon-and-zero chips at the top (flag, clipboard, heart, trophy) with no words and no legend entry. It is a case where a symbol made the screen worse. `tester-cr-sym-s-years.png`.
- Research box corner badges (red 6, 8, 6) are unexplained.

**Symbols with no explanation reachable:** the legend (System, How to play, scroll to the bottom) covers Charm, Energy, Smarts, Care, Science, Scouting, Hosting, Male, Female, Baby, Money, Research, Weeks, Locked, New, Done, Odds, the six grades and `-- - + ++`. Missing: reputation, visitors, rank stars, medals (bronze, silver, gold), the buzz flame, rarity stars, the red count badges, the Years chips, Strength +/-. It is only reachable by scrolling to the bottom of How to play; it is not linked from the screens that use the symbols.

**Words replaced by a symbol where it is not clear (honest list):** the Years chips; the bronze medal; Science and Hosting at small size; the Research flasks; the red badges. Everything else (stats, sex, baby, coin, clock, check, lock, grade rosettes in the legend) reads fine, usually better than the words did, and the one-line chips no longer wrap.

## New findings by owner (round 3)

**Moments (`moments.js`)**
- **R3-1 (should fix). Words where symbols were meant.** Steps: start an event, answer the week-1 star pick (3 options reading "Charm 17: Fun +1.0", "Energy 19: Animals +1.0", "Smarts 12: Learning +0.9"). Happening results say "+2 Science"; the review says "Host on fire". Should use the stat symbols. Seen in every run (`tester-words-*.log`).
- **R3-2 (polish). Sex as letters "M"/"F" in Trader and Director rows** (Animals tab uses the symbols). `tester-cr-sym-s-m-caller-trader.png`.
- **R3-3 (polish). Times and wages still in words** ("$100 a week", "1 week late", "4 weeks") where the clock icon exists.

**Artist (`sprites.js`)**
- **R3-4 (polish). Microscope and microphone are hard to read at 14 to 16 px** (teal blob, purple lollipop). `tester-cr-sym-s-staffer.png`.
- **R3-5 (polish). Bronze medal looks like a money sack**, and the reputation icon looks like a medal. `tester-cr-x-x-show-result-0.png`.

**Menus (`menus.js`)**
- **R3-6 (polish). Years screen top chips (flag, clipboard, heart, trophy with zeros) have no label and no legend entry.** `tester-cr-sym-s-years.png`.
- **R3-7 (polish). Legend is incomplete and hidden at the bottom of How to play:** missing reputation, visitors, medals, flame, rank stars, rarity stars, the red count badges. Consider linking it from Info.
- **R3-8 (polish). Title slot cards show only name, date and money.** No Continue shortcut for the last played zoo; no settings, credits or privacy link on the title screen (an App Store reviewer may look for these).
- **R3-9 (polish). Two hire lists back to back** is still there (round 2 N5): after the hire reveal's "Pick who to hire" card, the old "Who turned up" list follows. Hiring is 9 taps as played.

**Shell (`core.js`, `style.css`)**
- **R3-10 (polish). The title and new-zoo screens leave the top strip and news bar blank** (57 px and 31 px dark bands), so the screen is not fully used there.
- **R3-11 (polish). The title screen scrolls at 375x553 and 320x568** (the third slot is partly off screen).

**Rules (`engine.js`, `data.js`)**
- **R3-12 (should fix, tuning). Money piles up (round 2 R1/N7), still:** $11k at year 2, $52k year 3, $169k year 4 with a light player. Not re-tuned.

**Renderer:** no new findings.

## Status of round 2 findings

Fixed: N1 (Winter Show result card shows), N2 (no overflow in the show picker through 3 years), N3 (Place is green, Done cream), N6 (grade shown once per animal row), plus everything the round 3 list says was fixed: chips are single lines, the strip is clean. Not re-checked: N4 (a toast over the placement note). Not fixed: N5 (see R3-9), N7 (R3-12), R2 low reviews (year-1 review 11/40 and #12 of 12 again).

## Tap counts now (unchanged except where noted)

Expedition 5, event 6, breeding 5, facility 7 (back on the floor), habitat 6, market buy 5, move animal 6, hire 7 to 9, train 5, research 5, crate 6, headhunter 3, upgrade 5, move a building 6, remove 5, Winter Show 5 to 6. Title to first zoo: slot, Next, Yes/No = 3 taps. Tutorial adds no taps.

## Still untested

- Real touch drag in WebKit; a real iPhone with Safari's bars (the "follows Safari's bars" behaviour was tested only by resizing the window, not with real bars); Add to Home Screen.
- Buying land (rank-locked in my runs), years 5 to 20 by touch, the New zoo carry-over card (needs a finished zoo), the final score screen.
- `tester-extra` and `tester-years` on WebKit (Chromium only); a tutorial played with a deliberately blocked step (for example no free host for the event).
- A pop-up arriving at the exact moment a tutorial step completes (only a combo card was seen).
- Whether the symbol choices are clear to a real first-time player; I judged them from screenshots.

---

# ROUND 2 (previous section)

# ROUND 2 (after the owners' fixes)

## Summary

**Did a full first year play cleanly by touch with no errors: YES, on Chromium and on WebKit (0 findings, 0 console errors, 0 game errors, about 400 s each on the real clock at speed 2).**

Also: years 2 to 4 played by touch (waiting by `ZT.tick` only), all four year-end screens reached, no errors. The mystery crate, a headhunter hire, move, remove, upgrade and entering the Winter Show were driven by touch and work. One real new bug: **the Winter Show result card never shows** (N1).

The Lead's 4 stalls were my script being out of date, not game problems. Confirmed: the planner now skips the region step and puts the budget on the confirm screen; the third placement button is "Done" and returns to the floor, and my script looked for Cancel.

Scripts: `tester-play.js` (updated for the new flows, nothing weakened: every invariant still runs after every tap sequence), `tester-extra.js` (crate, headhunter, upgrade, move, remove, Winter Show), `tester-years.js` (years 2 to 4), `tester-sizes.js` (landscape now checks the "Turn your phone upright" card: shown, clock paused, taps ignored, resumes when upright; Chromium and WebKit pass). Logs: `test/shots/tester-play-r2-cr.txt`, `tester-play-r2-wk.txt`, `tester-years-cr.txt`.

## Status of the original 20 (judged on fresh screenshots)

| # | Owner | Finding | Status |
|---|---|---|---|
| R1 | Rules | idle money | **Not fixed.** $19k at year 2 start, $98k year 3, $291k year 4, $583k year 5 with a passive player (land is rank-locked, so nothing to buy). |
| R2 | Rules | low year-1 results | **Not fixed.** Year-1 review 11/40, #12 of 12 at year end (this player is deliberately light). |
| RN1 | Renderer | ghost starts invalid | **Fixed.** Ghost starts valid at every size and for every placement. |
| RN2 | Renderer | dead Rotate button | **Fixed** (hidden; the bar is Place + Done). |
| RN3 | Renderer | "Cancel" after placing | **Fixed** ("Done"). New: N3 (button colours). |
| RN4 | Renderer | landscape placement cramped | **Fixed** (landscape shows the upright card). |
| S1 | Shell | toast over title bar | **Fixed** (toasts sit just above Back). New: N4. |
| S2 | Shell/Menus | chips wrap | **Fixed.** One line in market, staffer, headhunter and applicant rows at 390, 375, 430 and 820. |
| S3 | Shell | panel hides the floor | **Not fixed.** The main menu and every screen still fill the stage. |
| S4 | Shell | dead band, news hidden | **Fixed.** The news line shows under screens. |
| S5 | Shell | landscape layout | **Fixed** by the upright card. |
| S6 | Shell | stale `shell-shot.js` | **Not re-checked** (not re-run this round). |
| M1 | Menus | hiring without a reveal | **Fixed** (see N5 for the back-to-back lists). |
| M2 | Menus | leaving placement | **Fixed.** Done returns to the floor; a one-off placement returns by itself. |
| M3 | Menus | Animals opens on Market | **Fixed** (opens on Zoo). |
| M4 | Menus | breeding animal offered a move | **Fixed** (no refusal toast appeared in the run). |
| M5 | Menus | empty Combos screen | **Fixed.** Locked combos are listed with "?" and their hint line. |
| M6 | Menus | running expedition shows little | **Partly fixed.** Detail now shows Team, Spent, Call back and weeks left; still nothing about the half-way choice or what was found. |
| M7 | Menus | long expedition planner | **Fixed** (see tap counts). |
| MO1 | Moments | combo card shows a sand tile | **Not fixed.** `tester-cr-popup-mo-combo-w6-48.png`. |

## New findings

### Menus
- **N1 (should fix). The Winter Show result is never shown.** Steps: let the show open (week 40 of year 1), tap Projects, tap "Animal Show", tap an animal, tap Enter. The entry is taken (the show closes, money and medal apply) but no result card appears. The game log shows `screen mo-showresult` opening and the stack is empty 100 ms later, so something closes it right after `enterShow` (it looks like a `popAll()` after the action, which makes Moments call `done()` on its own card). Calling `ZCore.act('enterShow', id)` directly does show the card, so the close is in the Menus flow. The player enters the Show and sees no payoff.
- **N5 (polish). Two hire lists back to back.** After the applicant reveal, the "Pick who to hire" card (Hire/Done) closes onto the old "Who turned up" list showing the people still unhired. Hiring one person is 9 taps as played (floor, Staff, Hire, tier, 4 taps through the applicant beats, Hire), then Done and Back. Skip the old list after the reveal, or make the reveal the only list. `tester-cr-hire-after-done.png`.
- **N6 (polish). The grade letter "D" shows twice** on animal rows (after the chips and again at the right). `tester-cr-look-main-Animals.png`.

### Moments
- **N2 (polish). Winter Show picker row text overflows its box** ("Dune · African Elephant" 199 px in a 191 px box; "Tansy · African Elephant" 205 px). Seen in years 2 and 3 by `tester-years.js`.

### Shell / Renderer
- **N3 (polish). The placement buttons are inverted.** With Rotate hidden, the green primary style falls on the second button: Done is green and Place is cream. Place should be the green one. `tester-cr-place-snack-start.png`.
- **N4 (polish). A toast can cover the placement note.** "Garden Bench built" sits on top of the "Completes Safari Picnic!" note for 2.3 s. `tester-cr-popup-mo-combo-w6-48.png`.

### Rules
- **N7 (should fix, tuning).** Same as R1: money piles up with nothing to buy (up to $583k in year 5). Land needs rank 2 and the Buy button says so clearly.

No new Artist findings. Zero console errors and zero game errors anywhere. The top strip never overflowed (checked up to $586,561 and 451 visitors a week).

## The things you asked me to check

- **(a) Hiring now.** The reveal introduces each applicant (name, then numbers) and ends on "Pick who to hire" with Hire buttons and Done. Yes, the player then lands on the old "Who turned up" list with the remaining applicants (N5). Taps: 9 as I played it (tapping through every beat); about 7 if the beats run on their own (floor, Staff, Hire, tier, Hire, Done, Back).
- **(b) Driven by touch, all worked.** Mystery crate: 6 taps, the crate reveal counts the numbers up. Headhunter hire: 3 taps (floor, Staff, Hire), no confirm. Upgrade: 5 taps with confirm, level 1 to 2, the next level says "Research needed". Move a building: 6 taps, ghost starts valid, Place returns to the floor. Remove: 5 taps with confirm. Winter Show entry: 5 taps, but no result card (N1); a missed picker is recoverable from the "Needs you: Animal Show" row in Projects. Buy land: only reached the "Needs rank 2" refusal.
- **(c) Years 2 to 4.** 15 expeditions, 24 events, 61 choices, 19 happenings, 8 yearly plans, 6 shows and 4 year-end screens, with the zoo growing to 4 habitats, 8 facilities and 27 animals. The pen filled (3 of 6; the House buttons say "No room", which is clear). Only N2 turned up; strip, callers, awards show and long lists were fine.

## Tap counts now (from the floor)

| Job | Taps | Before |
|---|---|---|
| Start an expedition | 5 (floor, Projects, Expedition, Next, Send); 6 if the budget tab is changed | 7 |
| Hold an exhibit event | 6 (floor, Projects, Event, habitat, theme, Start; the host step is skipped when one person is free) | 7 |
| Pair a breeding | 5 (floor, Projects, Breeding, pair, Start) | 6 |
| Build a facility, back on the floor | 7 (floor, Build, Facilities, item, hex, Place, Done) | 8 |
| Build a habitat | 6 (floor, Build, Habitats, Savanna, hex, Place; a one-off returns by itself) | 9 |
| Buy an animal at the market | 5 (auto-housed) | 5 |
| Move an animal | 6 (floor, Animals, animal, Choose habitat, habitat; Zoo is the default tab) | 6 |
| Hire from an advert | 7 to 9 (see (a)) | 5 |
| Train / Research | 5 / 5 | 5 / 5 |
| Mystery crate | 6 | untested |
| Headhunter hire | 3 | untested |
| Upgrade / Remove / Move a building | 5 / 5 / 6 | untested |
| Enter the Winter Show | 5 | untested |

## Still untested

- Real touch drag in WebKit; a real phone; Add to Home Screen.
- Buying land (locked by rank in my runs); years 5 to 20 by touch; the New zoo and final score screens.
- WebKit for `tester-extra.js` and `tester-years.js` (Chromium only); `shell-shot.js` not re-run; `moments-shot.js` not run.
- The Show result card itself (N1 blocks reaching it by touch).
- Whether the money tuning (R1, N7) is acceptable for a better player: my player is deliberately light.

---

# ROUND 1 (original report)

Date: 2026-11-12. Tested the assembled `index.html` in headless Chromium and headless WebKit (iPhone engine), phone size 390 x 844 at 2x, touch emulation, `file:///` URL.

## Summary

**Did a full first year (48 weeks) play cleanly by touch with no errors: YES, on both Chromium and WebKit.**

- Played on the real clock at speed 2 (about 6.5 minutes per run), only real taps and drags. Both runs reached the year-end screen ("End of year 1, #12 of 12").
- Zero console errors, zero page errors, zero `ZT.errors` in either engine.
- The clock was paused whenever a screen was open and running again when all were closed, every time it was checked (after every job and every loop pass). That includes the specific "build completes a combo" case (Garden Bench completing Safari Picnic: combo card over placement mode, Cancel, Back: clock running again), and after a page reload mid-year.
- No pop-up appeared twice (30 distinct pop-ups in the WebKit run, none repeated; log shows each report once). No stuck screens. Nothing tappable under 44 px on any screen I opened. No horizontal overflow at 390 px.
- Toasts live about 2.2 to 2.4 s (3.3 s for refusals) and never block taps (pointer-events none), but they do sit on top of the screen title bar (finding S1).
- What did not pass: stat chips wrap onto two or three lines in five different screens (finding S2, confirmed), the placement ghost often starts on an invalid hex, hiring has no "who turned up" reveal, and `test/shell-shot.js` now fails 9 checks (stale harness, see the table).

Three most important problems: (1) stat chips wrap in animal and person rows (S2); (2) hiring shows a flat list instead of a luck moment (M1); (3) the placement flow's exit: the ghost starts on an invalid hex, the button still says Cancel after you have placed, and it dumps you back into the Build menu (RN1, RN2/M2).

## Findings by file owner

Severity: blocker (cannot play / loses data), should fix (owner will notice), polish.
Screenshots are in `test/shots/` (`tester-cr-*` Chromium, `tester-wk-*` WebKit, `tester-cr-<size>-*` sizes).

### Rules (`engine.js`, `data.js`)

No blockers and no errors. Two observations from a deliberately light player:

1. **Idle money in year 1 (should fix, tuning).** Steps: play year 1 as above (expedition, one event, one breeding, one extra habitat, three facilities, one hire, one training, one animal bought, one research). Result: $20,000 at week 22 and $43,093 at week 48, still climbing, with nothing on screen worth buying that the player can afford except the animals the Trader/Director offer at $1,000 to $10,200. Should: some visible sink that is affordable in year 1 (the owner had $136,000 idle in year 2 in his old logs). Evidence: `test/shots/tester-play-run2.txt` (money per 4 weeks).
2. **Year-1 results are low (polish, tuning).** Best review 13/40 ("Good fit"), ranked #12 of 12 with rating 111 against 392 for 11th. The brief asked for year-1 events around 14 to 20. A player who plays a bit better than my script will do better, but the first review reads low. Screenshot: `tester-cr-popup-mo-review-w5-30.png`, `tester-cr-popup-mo-yearend-w48-86.png`.

### Artist (`sprites.js`)

No findings. Portraits, buildings, people, icons and silhouettes all rendered in every screen I looked at (floor, menus, reveals, placement, combo outline). `node test/art-check.js` passes.

### Renderer (`render.js`)

- **RN1 (should fix). The placement ghost often starts on an invalid hex.** Steps: new game, floor tap, Build, Facilities, Snack Stand. The note says "Snack Stand: Something is in the way." and Place does nothing until you tap another hex. It started on an occupied hex for the first habitat on WebKit, for every facility on Chromium (first placement is `ok:false`), and for a habitat at 430 x 932. Should: start on the nearest free valid hex so Place works on the first tap. Screenshots: `tester-cr-place-snack-start.png`, `tester-wk-place-habitat2-start.png`, `tester-cr-p-place.png`.
- **RN2 (polish). Rotate is shown, ghosted and dead, for facilities.** It takes a third of the bar for nothing. Hide it or show something useful. Same screenshot as the combo placement: `tester-cr-place-bench-combo-ghost.png`.
- **RN3 (polish). The third button says "Cancel" even after something has been placed** (repeat mode stays on after a successful Place). It should read "Done" once a build has happened. (The follow-on, where it lands, is M2.)
- **RN4 (polish). Landscape (844 x 390).** The floor is 302 px tall; the note and the three buttons cover about 40% of it. Usable, cramped. `tester-cr-landscape-placement2.png`.
- Verified OK: tapping a hex moves the ghost to exactly that hex (tested by tapping real hexes), the note says "Fits here." / "Completes Safari Picnic!" / "Something is in the way.", Place with a combo works, a drag scrolls the floor without opening the menu (Chromium), floor is aimed at the gate, ready icons (event, breed, flame, progress bar) show on the floor.

### Shell (`core.js`, `index.html`, `style.css`)

- **S1 (should fix). Toasts cover the screen's title bar.** Toast occupies y 70 to 106; the screen title bar is y 72 to 117. Steps: System > Save now: "Saved" sits on top of the "System" title for 2.3 s (3.3 s for a refusal such as "That animal is in a breeding project."). Same for "Event started", "Zadie Finch joined", "Learned ...". Taps still go through. Should: show toasts lower (above the Back button) or make the screen title yield. Screenshot: `tester-cr-toast-over-title.png`.
- **S2 (should fix). Stat chips wrap (the reported problem is real).** `Cha/Vig/Wit` rows in the Market tab wrap the Wit chip onto a second line; `Care/Sci/Scout/Charm` wraps to two or three lines in: staffer screen (names are spelled out: "Science", "Scouting"), headhunter row on Staff, "Who turned up" rows (3 chips then 1), and at every size tested. Steps: Animals > Market; Staff > any person; Staff > Hire > a tier. Should: one line per row (shorter labels or a 2 x 2 grid, put the Hire button under the chips, drop the unit text). Co-owner: Menus (row content). Screenshots: `tester-cr-hire-step-0.png`, `tester-cr-market-offers.png`, `tester-cr-staff-one.png`.
- **S3 (polish). The floor is not visible behind screens.** The panel fills the whole stage; only a 12 px sliver of floor shows at the edges and the top strip. Brief says the menu pauses the game so you can think, but you cannot see what is ready. Consider a shorter main menu card (it uses about 60% of the height, the rest is empty cream). `tester-cr-01-menu.png`.
- **S4 (polish). An empty dark band sits at the bottom of every screen** (the news line is hidden while screens are open, but its 28 px stays). Either show the news line or give the space back to the panel. Visible in any popup screenshot, for example `tester-cr-popup-mo-review-w5-30.png`.
- **S5 (polish). Landscape (844 x 390):** the app stays a 430 px column centred on the screen; the main menu shows only two rows of boxes and you must scroll for Research, Info and System; a red badge on the Staff box is clipped at the corner. Everything is reachable. `tester-cr-landscape-menu.png`, `tester-cr-landscape-placement.png`.
- **S6 (should fix, test only). `node test/shell-shot.js chromium webkit` fails 9 checks** ("Back closes the menu and the clock runs again", "clock resumes after placement ends", "speed 2 ticks about twice as fast", "default report card shows the first report", then a 30 s tap timeout). It runs the game at 300 ms per week with the real Menus and Moments now loaded, so real callers and happenings open screens during the test and its report skip handler no longer wins. I could not reproduce any of these in real play (the clock resumed after placement and after every Back), so I believe the harness is stale, not the game. Needs the Shell to re-check.
- Verified OK: no page scroll, no overflow at 390, 375, 430, 820, 844; clock pauses with any screen and resumes (also after reload); saving and a mid-year reload preserved week, money, animals, items, staff and speed exactly (Chromium and WebKit); the "Back" button is present and fully on screen on every non-modal screen at all sizes; the 2x/1x speed buttons work (speed 2 gives 5 s a week).

### Menus (`menus.js`)

- **M1 (should fix). Hiring has no reveal.** Steps: Staff > Hire > Notice board. It goes straight to a flat "Who turned up" list. `ZMoments.revealHire` exists but is not used. The brief wants "pay for a tier, then see who turns up" as a fun luck moment. `tester-cr-hire-step-0.png`.
- **M2 (should fix). Leaving placement is clumsy.** After Place, repeat mode stays on; the only exit is the button called Cancel, which reopens the Build menu, so getting back to the floor needs another Back or Play tap. Placing one facility and being back on the floor costs 8 taps (floor, Build, Facilities, item, hex, Place, Cancel, Back), 9 with a bad tap first. Should: Done returns straight to the floor.
- **M3 (polish). Animals opens on the last-used tab** (Market after a visit), not Zoo, and the first row there is the Mystery crate. A player who comes to look at their animals sees a shop first.
- **M4 (polish). An animal that is breeding can still be sent to another habitat** from its screen; the game then refuses with a toast ("That animal is in a breeding project."). Grey the option out. (WebKit run.)
- **M5 (polish). The Combos screen is empty at the start** ("None found yet." with 20 locked combos hidden). Nothing tells a new player that combos exist or what makes one. Show locked rows with their hint line ("A savanna habitat with somewhere to eat and somewhere to sit."). `tester-cr-info-Combos.png`.
- **M6 (polish). A running expedition shows little.** Projects > the running row opens "Expedition · East African Savanna, 4 weeks left, Call back". It does not show the team, whether the half-way choice was answered, or what is expected. Progress bar over the gate on the floor is the only other cue. `tester-cr-project-detail.png`.
- **M7 (polish). The expedition planner could be shorter.** The team is pre-picked (good), but the budget step could default to Standard on the confirm screen (saves two taps). Tap counts below.
- Verified OK: all seven boxes and every Info and Research sub-screen open and close with a visible Back; the main menu boxes show readiness ("Ready", "1 pair ready", "1 habitat ready"); a dismissed caller's offer is found again under Animals > Market (Trader/Director rows and the Mystery crate) and Staff (Headhunter row); a pending choice is highlighted; staffer training shows a gold "Super!" result; research confirm works; buying an animal houses it automatically.

### Moments (`moments.js`)

- **MO1 (polish). The combo card for a habitat combo shows a plain sand hex** as its picture (Safari Picnic, anchored to a savanna habitat). A habitat or the two pieces would read better. `tester-cr-place-bench-combo-after.png`.
- Verified OK and timed untouched (seconds to the last card): expedition return 1.6 to 2.4, mid-point choice result 0.6, mid-point result with odds 3.4 (includes the suspense beat), event review 1.6, new arrival (birth) 0.8 to 1.0, Open Day 0.8, year end about 3.5; all under 4 s. Choices (tracks, river, star pick, big idea, special diet, heatwave and other happenings), VIP, rank-up, combo, caller cards (trader, director, headhunter), the Open Day plan, the Winter Show picker ("Not now" works), the yearly result and the year-end awards and league table all appeared once and advanced by tap. Nothing from the brief's "explicitly rejected" list appeared.
- Could not tell from the screenshots whether the Show picker's "Not now" leaves a clear way back in Projects (see "could not test").

## Judged as the owner would

- **Cluttered or wordy?** No. Screens are short, icons carry meaning. The one wordy spot is the Market/Staff rows (wrapping chips, S2).
- **Needs a paragraph to explain itself?** None. Combos screen is the one that explains too little (M5).
- **Can you tell from the floor what is ready?** Yes: ready icons (event flag, breeding heart) sat on the starting habitat from week 1, the flame for buzz, and a green bar for work in progress. I never opened a planner just to check. The main menu boxes repeat it in words.
- **Does housing an animal take few taps?** Yes: new animals (expedition, birth, purchase, crate) are housed automatically and the toast says where. Manual move: 6 taps. Pen: 4 taps per animal (floor, Animals, Pen, House).
- **Stats as numbers?** Yes everywhere (Cha/Vig/Wit chips, staff skills), plus a letter grade.
- **Reveals fun and short?** Yes, all under 4 s untouched, first tap completes a beat.
- **Rejected items?** None seen. No sound, no calendar, no boost items.
- **Anything a player needs but cannot reach?** Seeing the detail of a running expedition (M6) is thin; the news line is useful but is hidden whenever a screen is open (S4); combos are not discoverable (M5).

## Tap counts (from the floor, measured on real taps)

| Job | Taps | Path |
|---|---|---|
| Start an expedition | 7 | floor, Projects, Expedition, region, Next, budget, Send |
| Hold an exhibit event | 7 | floor, Projects, Event, habitat, theme, host, Start (then 1 tap each for the star pick, the host's boost and the review) |
| Pair a breeding | 6 | floor, Projects, Breeding, pair, lead, Start |
| House an animal | 0 (auto) / 6 manual / 4 from the pen | manual: floor, Animals, Zoo, animal, Choose habitat, habitat |
| Buy an animal at the market | 5 | floor, Animals, Market, offer, Buy |
| Build a facility | 6 to place, 8 to be back on the floor | floor, Build, Facilities, item, hex, Place, then Cancel and Back |
| Build a habitat | 9 as played (incl. one bad hex tap and two rotates) | floor, Build, Habitats, Savanna, hex, Rotate x2, Place, Cancel/Back |
| Train a staffer | 5 (+1 to close the result) | floor, Staff, person, Train, course |
| Hire through an advert | 5 | floor, Staff, Hire, tier, Hire |
| Research something | 5 | floor, Research, group, item, confirm |

## Test suites (run once each)

| Test | Result |
|---|---|
| `node test/rules-check.js` | PASS ("RULES CHECK: ALL PASSED", 21 checks including 20-year bot at four skills) |
| `node test/bot.js 0.8` | PASS (20 years, no errors, ends with score 302,651; place 12th in Y1 to 1st by Y12) |
| `node test/art-check.js` | PASS (69 species, every contract id returns its own sprite, no console errors) |
| `node test/render-shot.js both` | PASS on Chromium and WebKit (all checks, including the index.html pass) |
| `node test/shell-shot.js chromium webkit` | **FAIL**, 9 checks (4 on Chromium, 3 on WebKit, plus a crash on each: tap timeout). Stale harness, see S6 |
| `node test/menus-shot.js chromium webkit` | PASS ("ALL PASSED", no checks failed) |
| `node test/tester-play.js chromium` / `webkit` | PASS, 48 weeks and year end, no errors (7 findings each, all chip wraps and the ghost start) |
| `node test/tester-sizes.js chromium` / `webkit` | PASS for function; chip wraps only |

`test/moments-shot.js` was not run (the Lead runs it).

## Other screen sizes

Opened the menu by tapping the floor, opened all seven boxes, started placement, checked Back, buttons and overflow. Chromium and WebKit gave the same results.

- **Sideways 844 x 390:** game stays a centred 430 px column. Everything works but the main menu shows two rows at a time (scroll for Research, Info, System), the placement bar and note cover about 40% of the floor, a red badge on Staff is clipped. No horizontal overflow. (S5, RN4)
- **Small 375 x 667:** everything fits, Back visible, placement bar 104 x 56 per button and inside the screen, ghost visible. Chip wraps as at 390.
- **Large 430 x 932 (3x):** fits; the placement ghost started on an invalid hex (RN1).
- **iPad 820 x 1180:** a 430 px column is centred, margins are empty; all works. The floor is taller (1092 px) so more of the map shows. Nothing breaks.

## What I could not test

- **Touch drag in WebKit.** Playwright's WebKit cannot synthesise real touch drags, so the drag-scroll check ran on Chromium only (camera moved 51 px, menu did not open). The Renderer's own WebKit test (mouse drag) passes. I did not check a real iPhone.
- **Real phone:** no real device, no safe-area (notch) check, no Add to Home Screen, no GitHub Pages. WebKit refuses to load the manifest from `file://`, so install behaviour is untested.
- **Winter Animal Show:** the picker came up at week 40 and I chose "Not now" each time; I did not enter an animal or see the result card, and did not check that Projects > "Needs you" lets you come back to it.
- **Mystery crate, headhunter hire, Open Day with a paid tier, upgrade/move/remove/buy-land flows, New zoo, the final score screen, years 2 to 20:** not played by touch (the bot and rules-check cover the engine for 20 years; menus-shot covers several of the screens).
- **The Pen tab with animals in it:** every animal was housed automatically, so I never saw the pen filled. Tap count for the pen is from the screen (a one-tap House per row), not from a played case.
- **Play time per week:** a short minute of running with menus open was not measured against the 5 to 8 hour target.
- **Duplicate pop-up check** relies on the pop-up sequence and the log (which records report type only), not on a report id.
- A year played this lightly ends with about $43,000 unspent, so late-year spending ladders were not stressed.

## Files

Scripts: `test/tester-play.js` (the playthrough), `test/tester-lib.js` (helpers and the per-step checks), `test/tester-sizes.js` (other sizes), `test/tester-probe.js` (scratch), `test/tester-patch*.py` (script edits, safe to delete). Logs: `test/shots/tester-play-run2.txt` (Chromium), `test/shots/tester-play-wk.txt` (WebKit), `test/shots/tester-suites.log`, `test/shots/tester-sizes-*.json`. About 240 screenshots under `test/shots/tester-*`.
