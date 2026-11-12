# Wildside Zoo: test report (Tester)

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
