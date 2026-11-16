# Update 7: the Lead's plan and contracts (2026-11-15)

Source: `docs/PLAYTEST-NOTES.md` (the owner's 12 notes and his answers). Read that file first, and look at the screenshots in `docs/playtest-notes/`.
House rules that still stand: no scrolling where it can be avoided, symbols over words, NOTHING see-through (solid pixels and solid colours only), portrait only,
works offline from local files, plain browser JavaScript with no build step, headless tests only (`test/pw.js`). Never open a visible browser window.
Only the Lead commits. Stay inside your own files. If you need something from another owner's file, say so in your final report; do not edit it.
Node: `export PATH="/c/Users/Harrison/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"` (Git Bash).
Never weaken a check to make it pass; if a check is out of date because the design changed on purpose, update it to test the new design just as strictly and say so.

## File owners

| Owner | Files |
|---|---|
| Rules | `data.js`, `engine.js`, `test/rules-check.js`, `test/bot.js`, `docs/API-rules.md` |
| Artist | `sprites.js`, `test/art-*.js|html`, `docs/API-artist.md`, `docs/art-review/` |
| Renderer | `render.js`, `test/render-*.js`, `docs/API-renderer.md` |
| Shell | `core.js`, `style.css`, `index.html`, `test/shell-*.js`, `docs/API-shell.md` |
| Menus | `menus.js`, `test/menus-*.js`, `docs/API-menus.md` |
| Moments | `moments.js`, `test/moments-shot.js`, `docs/API-moments.md` |
| Lead | `geo.js`, `docs/UPDATE-7.md`, `docs/PLAYTEST-NOTES.md`, `test/tester-*.js`, `test/lead-*.js` |

## Work items

### A. Rules
1. **Rare treats (note 9).** Happenings and the mid-project gamble choices each come up about a QUARTER as often as now (happenings: one every 40 to 56 weeks or so;
   choices: about a quarter of today's rate per project). Keep the one-third mild setbacks share. Re-run the bot; report pacing before and after. If progress slows
   noticeably because rewards from happenings and choices are gone, compensate modestly elsewhere and say how.
2. **Walkway ring (note 7).** Placing a habitat also lays a ring of walkway on every free hex bordering it. His words: "the paths should just be cosmetic, included
   in the pen placement, just to make it look good for the player. The people can also walk along these paths." So: the ring costs nothing extra, visitors can walk
   on it, rings of neighbouring habitats may overlap and share hexes, and a habitat can NOT be placed so that it touches another habitat or sits on another habitat's
   ring (there is always at least one walkway hex between two habitats). Other buildings keep today's placement rules except that nothing may be built on a ring hex
   if that would leave the habitat's ring broken... keep it simple: ring hexes are ordinary path hexes owned by the habitat; facilities may not be placed on them.
   Moving or selling a habitat removes its ring hexes that no other habitat still needs (hexes that were already path before stay path). Check combos and
   adjacency bonuses still work with the gap (adjust "next to" to mean "within the ring" where needed) and say what changed. Old saves: leave existing layouts as
   they are (legal as built); add rings on free bordering hexes at load where that does not disturb anything. Expose what the Renderer and the Edit mode need
   (which hexes are ring path, whether a spot is legal and why not).
3. **Best of its kind (note 5).** `ZE.bestOf(S, animal)`: true when the player owns two or more of this species and sex and this one is the best (use the same
   "better" measure as the buying comparison). Also a lookup the where-list can use: the animals living in a habitat (species, sex, grade), in display order.
4. **Next goal (suggestion he accepted).** `ZE.nextGoal(S)` returns the single next thing to aim for as data the screen can show without words:
   `{ kind, icon, cur, target }` (for the main game: what the next star rank still needs, the one requirement furthest from done or the most actionable one;
   in a challenge: the level goal). Never null while the game is running.
5. **Challenge mode (note 12).** Separate from the three long-term zoos and gives them nothing.
   - `D.LEVELS`: five levels as typed data, every figure in data.js. Each: `id`, `n` (1..5), `goal: { kind, target }`, `weeks` (time limit),
     `stars: [w3, w2]` (finish by week w3 for 3 stars, by w2 for 2, by the time limit for 1), map size, starting money, restrictions, starting animals or items.
     1. Small map, normal money. Goal: 300 visitors a week.
     2. Only savanna habitats and animals. Goal: own 6 different savanna species.
     3. Start almost broke, no expeditions. Goal: $40,000 in the bank.
     4. Start with a few average animals, breeding is the focus. Goal: breed one top-grade animal.
     5. Tiny map, at most two habitats. Goal: 3-star reputation.
     Tune with a bot so a sensible player finishes each in roughly 10 real minutes at speed 2 (work out the weeks from the real tick rate in core.js), 1 star is
     reachable by a careful first-timer, 3 stars takes skill. These exact targets may move if tuning shows they are impossible or trivial; say what you changed.
   - `ZE.newChallenge(levelId)` returns a fresh state with `S.ch = { id, ... }`. Restrictions are enforced by the normal actions (they return `{ ok:false, msg }`)
     and exposed as a lookup so screens can hide or grey out what is not allowed (`ZE.allowed(S, what, id)` or similar; document it).
   - `ZE.challengeStatus(S)` returns `{ kind, icon, cur, target, week, weeks, weeksLeft, starsNow, done, failed }` (null in a normal zoo).
   - When the goal is reached or time runs out, push ONE report `{ type: 'challenge', level, stars (0 = failed), week }` and stop the level (ticks do nothing after).
   - Main-game long-term things that make no sense in a 10-minute level (yearly plan, year-end, 20-year final score, legacy) must not fire in a challenge.
   - `serialize`/`deserialize` must round-trip a challenge state.
7. **Star-level expeditions (note 13, added after the plan).** The Lean / Standard / Lavish budget choice is REPLACED by a star level, 1 to 5, chosen per
   expedition for the chosen biome ("a 3 star Savanna run"). A higher-star run costs more and takes longer, and mostly finds animals of that star (rarity)
   level: the odds centre on the chosen star, with smaller chances one star either side. Higher stars unlock as the zoo grows (use an existing gate such as
   rank or research; a new zoo can run 1 and 2 stars). The explorer's Scouting still improves the odds. Expose the odds table, cost, weeks and which stars are
   unlocked (and why not) as a lookup for the Send out page. Keep overall pacing close to today with the bot. Old saves and running expeditions must still load.
6. Document everything in `docs/API-rules.md` under a new "R7" section at the top, with exact names, so the other owners can code from it.

### B. Artist
1. **Symbols (note 11): SAMPLE FIRST, then stop.** His words: "Hosting symbol is weird, we need a new thing to represent that. All symbols need to be redone
   graphically; a lot of them have this weird half 3d effect going on; maybe let's try 2d, trying to be 2d, and more detailed to help show what they are."
   Make an approval sheet: about 12 of the most-seen symbols (the three animal stats Charm, Energy, Smarts; the four staff skills Care, Science, Scouting, Hosting;
   coin, habitat/room, time, research, visitors) each shown OLD and NEW side by side at the size used in the game and enlarged, on the cream panel colour.
   New style: flat, front-on, no bevels, no fake depth or highlights-as-3D, bold dark outline, more interior detail, solid pixels only. For Hosting give THREE
   different ideas (not a microphone): for example a waving hand, a speech bubble with a smile, a party flag or megaphone; label them A, B, C.
   Write the sheet to `docs/art-review/symbols-v2/` as PNG no taller or wider than 3,600 px, and report the file paths. Do not change `sprites.js` in the game yet.
2. After the owner approves (the Lead will tell you): redraw every symbol in that style behind the same ids, and add any new ids the other owners ask for.

### C. Shell
1. **Date blur.** On his iPhone 18 Pro the first line of the top strip is soft and grey again with the 16 px gap (see `docs/playtest-notes/*.png`), and was crisp
   at 30 px. Restore a 30 px clear gap under the top inset for TEXT, but do not waste it: keep the strip compact by any means that keeps text out of that zone
   (for example one row holding date, stars, money and visitors if it fits at 375 wide with $9,999,999; otherwise two rows starting 30 px down).
   Update the shell check to the new numbers.
2. **Panels use the full height.** Now that the installed app fills the screen, panels stop about 50 points short of the bottom (see note 10 screenshot).
   Panels should run down to just above the home-indicator inset.
3. **Alert frame (notes 2, 3).** Remove red number boxes as the way to show "something is waiting". Provide one shared solid style, `.alert` (a bright gold frame
   on the element itself that pulses between two solid golds, stepped animation, no transparency, nothing positioned outside the element), for Menus to use.
4. **Speed 2 moves the board faster.** At speed 2 everything on the floor (visitors, animals, staff walking, floating pop-ups) animates twice as fast, not only
   the calendar. If the renderer needs a speed value passed in, expose it in the way the renderer already reads time (say what you did).
5. **Next-goal chip.** A small chip on the main screen (in or just under the top strip, never over the zoo's centre) showing `ZE.nextGoal(S)` as icon, current
   and target. In a challenge it shows the level goal and the weeks left.
6. **Challenge plumbing.** `ZCore.startChallenge(levelId)` (fresh run from `ZE.newChallenge`, kept in its own save key so quitting and returning resumes it),
   `ZCore.challengeStars()` returning `{ levelId: bestStars }` from its own storage key, saving the best stars when the `challenge` report arrives,
   `ZCore.inChallenge()`, and leaving a challenge back to the title without touching the three zoo slots. Document in `docs/API-shell.md`.

### D. Renderer (after Rules reports)
Ring walkways drawn as path and walked by visitors; the 2x board speed; Edit mode on the map (tap an item to select it, clear solid highlight, drag or tap to
move, legal or illegal shown with solid colours); small maps for challenge levels.

### E. Menus (after Rules and Shell report)
Edit mode replacing the Build menu and the Move screen (note 6); gold alert frames instead of red boxes on the menu and Research (notes 2, 3); event host and
theme on one screen (note 4); best-of-kind mark on the Animals screen (note 5); "Send out?" page without scrolling, with the 1 to 5 star level picker in place of Lean / Standard / Lavish (notes 10, 13); Info screens trimmed to symbols and
short lines; challenge level-select screen from the title (five levels in a line, stars earned, locked ones greyed) and what a challenge hides.

### F. Moments (after Rules reports)
Where-list rows show the animals already in each habitat (note 1); "It worked" green and "It failed" red (note 8); the challenge result card with stars,
Retry and Next level.

### G. Tester (last)
Full suites and touch playthroughs on both engines, plus one playthrough of each challenge level.
