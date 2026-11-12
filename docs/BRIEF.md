# Wildside Zoo: rebuild brief

You are rebuilding an existing browser game. Read this whole file before doing anything. The owner (Harrison) is not a programmer: make technical decisions yourself, explain results in plain words, and only ask him about things a player would notice.

## 1. What the game is

Wildside Zoo is a zoo management sim in the style of Kairosoft's Game Dev Story and Mega Mall Story. One scored run lasts 20 in-game years, then you can start a new zoo with carry-over perks. It is relaxed: you cannot go bankrupt or lose.

The core loop works and should be kept: **expeditions** bring animals in, **breeding** improves them, **exhibit events** get reviewed out of 40 and pay money, reputation and research. Around that sit staff who level up and change jobs, a hex map with adjacency bonuses and 20 named combos, research, traders and other callers, three yearly events, rankings against 11 rival zoos, an awards show, special visitors, a 68-species collection book with two secret regions.

The working version is in `current/` (four files, no build step, no dependencies):

| File | Size | What it is |
|---|---|---|
| `current/data.js` | 222 lines | All game data. Exposes `window.ZD` / `module.exports`. |
| `current/engine.js` | 737 lines | All rules, no DOM. Exposes `window.ZE` / `module.exports`. Keep and extend this. |
| `current/ui.js` | 790 long lines | The whole interface, SVG map, saving, logging. To be replaced. |
| `current/index.html` | 230 lines | Markup and CSS. To be replaced. |

`test/bot.js` is a headless simulated player that runs a 20-year game against the engine with Node (`node test/bot.js 0.8`). It is the regression check for rule changes. Keep it working and update it as the engine API changes.

## 2. Why it is being rebuilt

Harrison likes the game but says it is not where he wants it. His words, condensed:

- Too cluttered, too many words all over the screen.
- Game Dev Story has one screen showing the floor. You press anywhere to open the menu, each box gives options that open further screens.
- It is always running but never feels rushed, because opening the menu pauses it and you can think.
- Random events have a real effect and give natural pauses.
- Lots of luck-based pop-ups and reveal screens. It feels like gambling in a fun way.
- Anything that takes time gives feedback and choices along the way.
- Graphics: simple 2D pixel art like Kairosoft, viewed so it looks 3D even though it is flat sprites, at the same camera angle as Kairosoft games.

## 3. Decisions already made with Harrison (do not re-ask)

**This rebuild**
1. **One main menu.** Tapping anywhere on the zoo always opens the same main menu and pauses time. No per-habitat menus, no side panels, no always-visible lists.
2. **Phone first, held upright (portrait).** He will test on a desktop browser for now, so on wide screens show a centred phone-width column. Thumb-reachable controls at the bottom. Drag to scroll the zoo.
3. **Keep the hex grid.** He was offered square tiles for a truer Kairosoft look and chose hexes. Tilt the camera as close to the Kairosoft angle as hexes allow.
4. **Art must be big and close.** He rejected the first art test (`docs/rejected-art-test.png`) for being too small and far away, and for the angle. He wants chunky animals and people that fill the screen, zoomed in so you see part of the zoo and scroll for the rest.
5. **Random events: mostly good, with mild setbacks.** Bad events slow you down and never undo progress.
6. **Fresh start is fine.** No need to migrate old saves.

**Carried over from earlier rounds (still apply)**
- Management first, building second. Graphics matter less than a fun, addictive loop and a clean, easy interface.
- Exact animal stats (Charm, Vigor, Wit) must stay visible as numbers, because he needs them to decide which animals to keep. Letter grades are extra, never a replacement.
- Fit and strength show as `--`, `-`, `+`, `++` signs in place of percentages and ratios.
- Combos must be obvious on the map: one shared outline around the tiles in a combo, a preview while placing that says whether the spot completes or breaks a combo, and hints for known combos that are one piece short.
- Readiness is shown by a small icon on the habitat (event ready, pair ready to breed). He disliked a big "Ready now" list. Keep it quiet.
- Traders, the headhunter and the visiting zoo director arrive as pop-ups you can act on or dismiss. Their offers are not time-limited.
- Event scores tick up while the event is prepared. Staff can change jobs. Three fixed yearly events plus the awards show.
- Money, research and so on float up off the map. Little visitors walk around. Stars for rank and rarity, flames for buzz.
- **Explicitly rejected, do not add:** a calendar, consumable boost items, visitor types and fans, a challenge list, sponsors and requests, speech bubbles, a talking secretary, any sound or music (silent for now; sound comes later).
- Run length target: 5 to 8 real hours for 20 years.

## 4. What his play logs showed

Two sessions, about 60 to 70 in-game weeks each.

- 82 to 84% of real time was spent paused or inside a window. He plays at 2x and stops to think. This supports "always running, pause by opening the menu".
- He opened planners far more often than he started things (for example 37 breeding planner opens for 14 starts), which was him checking whether anything was ready. Readiness has to be visible on the floor.
- He opened the move-animal window 43 times in one session. Housing animals takes too many steps.
- In the second session he had $136,000 unspent in year 2. Money stops mattering early and needs sinks.
- Reviews in years 1 and 2 were 9 to 16 out of 40. Early scores feel low.
- He rearranges the map a lot and enjoys it.

## 5. How Game Dev Story does it (research summary)

- One fixed room that is always animating. All commands live in one small menu of about five entries (Develop, Staff, Action, Info, System), each opening sub-screens.
- The clock never needs the player. A project runs by itself between a few forced picks at set points (roughly 25%, 40%, 80%, 100%).
- Each pick is one screen with 2 to 5 options, usually cost against odds. Example: partway through, a staff member walks up and proposes a boost. You accept or decline. It costs research points, shows its success odds, and either adds a chunk of points or adds bugs.
- Points visibly pop out of staff during work. A staffer sometimes goes "on fire" and is briefly much more productive.
- After a project there is a sequenced payoff: name it, four critics score it one at a time out of 10, 32 or more enters the Hall of Fame, then a sales chart.
- Fixed calendar beats give the year a rhythm: pay day, a salesman's visit, an expo where you choose how much to spend on your booth, an awards show in December.
- Small random upsides are everywhere (training sometimes gives triple, hiring is done by paying for one of several advertising tiers and seeing who turns up), with mild downsides (a blackout loses some points).
- Spending ladders (ads, hiring tiers, expo booths) re-price the same choice as money grows, so money keeps mattering.
- Events are delivered by a character walking up, so you see them coming.
- A 20-year run takes about 5 hours. Two speeds.

## 6. The design for this version

### Screen (portrait)
- **Top strip, one or two lines:** date, money, visitors, rank stars. Nothing else.
- **The floor:** fills the rest. Always animating. Drag to scroll. Optional two zoom levels.
- **Bottom line:** at most one short news line. No buttons needed, since a tap anywhere opens the menu.
- No sidebars, no persistent lists, no build palette on screen during normal play.

### Main menu (opens on tap, pauses time)
A grid of big boxes with a pixel icon and one word each. Suggested entries, adjust if playtesting says otherwise:

| Box | Opens |
|---|---|
| Projects | Send expedition, Pair for breeding, Hold event, and what is running now |
| Build | Habitats, Facilities, Move, Remove, Buy land. Picking one closes the menu and enters placement on the floor |
| Animals | Your animals (with stats as numbers), holding pen, whoever is selling right now |
| Staff | Team, Train, Change job, Hire (advertising tiers), Let go |
| Research | Regions, know-how, facilities, themes, landmarks |
| Info | Collection book, combos, theme fits, rumors, rankings, year history, note box, copy log |
| System | Save, speed, how to play, new zoo |

Rules for every screen: one job per screen, a clear Back, big tap targets (at least 44 px), short labels, pixel portraits in place of description wherever a picture can carry it. If a screen needs a paragraph to explain itself, redesign the screen.

### Placement on a phone
There is no hover. After choosing something to build, the menu closes and a ghost appears on the floor. Tap a hex to move the ghost there. Three large buttons sit at the bottom: Rotate, Place, Cancel. The ghost shows valid or invalid, and says if the spot completes or breaks a combo. Stay in placement mode for repeated facilities.

### Projects with feedback and choices along the way
Every timed project gets visible progress on the floor and at least one mid-point choice. Starting points, to be tuned:

- **Expedition.** Midway, something comes up: fresh tracks of something rare (follow them for a better find at the risk of a delay, or play safe), a guide offering help for a fee, a river crossing. On return, a reveal: each animal found is opened one at a time, rarity first, then stats.
- **Breeding.** Midway, a small decision (call the vet for a fee to raise the odds, or wait). At birth, a reveal: each stat rolls against the parents' average, with an occasional lucky jump and the rare-variant chance shown as its own roll.
- **Exhibit event.** Scores tick up weekly on the floor. One week in, pick the star animal. Two weeks in, the host proposes a boost that costs research points with shown odds: success adds points, a flop loses a few. Then critics reveal one at a time, with a Hall of Fame moment at 34 or more.

Mechanism suggested by the code scout: generalise the weekly event step into a per-project weekly step for all project types, let it attach a pending choice to the project and push a `choice` report, and add an engine action to resolve it. Time is already paused whenever a screen is open, so a choice pauses the game without extra work.

### Random events ("happenings")
About one every 6 to 8 weeks, mostly good, many with a small choice. Each must change something real. Examples: a school trip, a donor's gift, a TV spot, a viral photo that gives one habitat buzz, a heatwave that doubles ice cream sales, a stray animal left at the gate, a storm that cuts visitors for two weeks, an animal with a cold that cannot be shown for a few weeks unless you pay the vet, a keeper who needs to coax back an animal that slipped its pen (odds from their Care, small reputation swing either way). Where it makes sense, show a character arriving on the floor before the screen opens.

### Luck moments (the "fun gambling" feel)
- Training: usually a normal gain, sometimes a "Super!" result worth triple.
- Hiring: pay for one of several advertising tiers, then see who turns up. Replace the fixed applicant list.
- A mystery crate at the trader: pay a price, odds shown per rarity, open it for a random animal.
- The reveals listed above for expeditions, births and reviews.
- Present each with a short sequence: a pause, a counter or card flip, then the result. Tap to speed through. Keep every sequence under about four seconds.

### Keeping money meaningful
Add spending ladders: advertising campaigns in tiers, hiring tiers, an optional spend at the Open Day and Summer Festival (as with a Game Dev Story expo booth), mystery crates, and pricier late upgrades. Check with the bot that a competent player is not sitting on large idle cash in years 2 to 5.

### Other rule fixes
- Housing: when a baby is born and the parents' habitat is full, try any other habitat of the same biome before the holding pen (the engine already has a `house()` helper that does this). Make moving animals take fewer steps.
- Consider lifting early review scores slightly so year-1 events land around 14 to 20.
- Fix the loose ends in section 9.

### Map shape for portrait
The grid is currently 18 columns by 10 rows, with land expanding by columns. That suits a wide screen. For portrait, change it to something like 10 columns by 20 rows with land expanding by rows, and put the entrance at the front (bottom). This touches `D.GRID_W`, `D.GRID_H`, `D.START_COLS`, `D.LAND`, `Z.inLand`, `Z.buyLand` and the starting layout in `Z.newGame`.

## 7. Art direction and rendering

Findings from a rendering test (`docs/rejected-art-test.html`, viewable in a browser). The technique worked, the look was rejected for being too small and far away, so keep the method and change the scale and angle.

- **Canvas, low-resolution buffer, crisp scale-up.** Draw to a small buffer and scale by a whole number with `image-rendering: pixelated` and `imageSmoothingEnabled = false`. For a phone about 390 CSS px wide, a buffer about 195 px wide at 2x gives the right chunkiness.
- **All art is made in code.** No image files. Sprites are arrays of strings where each character is a palette role (outline, body, shade, belly, pattern, eye, nose, transparent). Bake each frame, plus a mirrored copy, to an offscreen canvas once and cache it.
- **Palette swaps cover the species.** One body template plus a colour set per species. Plan for about 8 templates (quadruped, heavy quadruped, big cat, long-neck, bird, tall bird, primate, fish or sea creature, plus dinosaur and mythic bodies) and small add-on parts (horns, mane, trunk, stripes) so species are recognisable. The test's single quadruped looked generically dog-like, so identity needs real attention.
- **Hex projection.** Keep axial hex coordinates and squash vertically. `starter/geo.js` has a working integer lattice (column step 40, row step 20) with forward and inverse mapping and edge and corner tables. Treat it as a starting point and change the numbers to get the look right. Hit-testing by the inverse mapping was verified exact in the test.
- **Kairosoft angle.** Draw raised things as small 3D-looking objects with two visible faces and a top, with a ground shadow. Fences have height and a front face. Buildings look like little iso buildings with roofs.
- **Scale target.** Roughly 5 hexes across the screen width. Animals about 16 to 24 px in the buffer, people about 12 by 18. Cap how many animals are drawn per hex so they do not clump.
- **Draw order.** Floor first from a cached canvas, then everything else sorted by the screen y of where it touches the ground. Give each fence edge its own sort key so concave shapes (the ring-shaped habitat) sort correctly.
- **Performance** was not a concern: about 330 sprites per frame cost under 1 ms. Cache the floor and rebake only when the map changes.
- **Text.** Keep words off the canvas. Use DOM for the top strip and menus. For the few on-floor markers use pixel icons, not words.
- **Liveliness.** Grass variation, trees, paths, an entrance gate, visitors walking between things, animals wandering inside their fence, staff visible at their project, callers standing at the gate when they are in town.

**Checkpoint:** before building menus on top, show Harrison a screenshot of the floor alone (a few habitats, buildings, animals, visitors) and get his reaction to the art. He rejected the first attempt, so do not go far past this without his okay.

## 8. Architecture

No build step, no dependencies, plain scripts loaded in order. Split the interface into files so teammates never edit the same file:

| File | Owner | Contents |
|---|---|---|
| `data.js`, `engine.js` | Rules | Data and rules. Start from `current/`. |
| `geo.js` | Lead | Shared hex geometry. Start from `starter/geo.js`. |
| `sprites.js` | Artist | Sprite templates, palettes, baking. One lookup for animals, people, buildings, ground, fences, decorations, icons. Also returns data URLs so menus can show portraits. |
| `render.js` | Renderer | The canvas floor: camera and drag scrolling, drawing, depth sort, walkers, on-floor icons, floating pop-ups, placement mode with its three buttons, tap reporting. |
| `core.js`, `index.html`, `style.css` | Shell | Page shell and top strip, the screen-stack framework that menus and moments plug into (push, pop, back, pause while any screen is open), the clock, saving, logging, the report queue, formatting helpers, a test hook. |
| `menus.js` | Menus | The main menu and every sub-screen, built on the Shell's framework. |
| `moments.js` | Moments | Every pop-up that the game raises by itself: choices, happenings, reveals, reviews, callers, yearly events, year end, final score. |
| `test/` | Tester | Bot regression, browser tests, screenshots. |

The lead writes short interface contracts for these files before anyone starts (what each exposes, what each may call), and each teammate reports the API they actually built.

### Saving and the gameplay log
- Save to `localStorage` under a new key with a save version number. Save every few in-game weeks, on page hide, and from System.
- The old version logged every decision, a snapshot each quarter, real play time by speed, which screens were opened, and every refused action, to a cloud database that only exists inside claude.ai. Keep recording the same things, but store them locally and add **Copy log** and **Download log** buttons in Info, so Harrison can paste a log into a chat for tuning. Keep the size bounded by rolling old quarters into summaries.
- Keep the note box ("Note for Claude"); notes go into the log.

### Phone delivery
Make it installable to an iPhone home screen as a full-screen web app (manifest, icons, viewport and safe-area handling, no page scroll or zoom, touch-only input). Harrison has published a web app to GitHub Pages before and has a GitHub account. Set that up when the game is playable and tell him the steps in plain words.

## 9. Code notes from the scout

**Engine facts worth knowing**
- State is one object `S`. `Z.tick(S)` advances a week. Player actions return `{ok: true}` or `{ok: false, msg}`. `Z.refresh(S)` rebuilds derived numbers in `S._c` and is **not pure**: it discovers combos and can raise rank, pushing reports. Use `Z.layout(S, items)` for previews of hypothetical layouts.
- Hexes are pointy-top in axial `(q, r)`. `Z.cellsOf(kind, type, q, r, rot)` gives an item's cells, `Z.canPlace` checks a spot, `D.SHAPES` holds each habitat's footprint, `Z.rot` rotates by 60 degree steps.
- The engine pushes **reports** to `S.reports` for the interface to show (`rankup`, `combo`, `caller`, `secret`, `expedition`, `birth`, `review`, `vip`, `yearly`, `show`, `yearend`, `final`) and transient **fx** to `S.fx` for on-map pop-ups.
- Weekly tick order: refresh, income and costs, week +1, event progress, finished projects resolve, callers every 5 weeks, applicants every 12, yearly events by week of year, special visitors, year end every 48 weeks.
- Hook points: the per-event weekly step for mid-project choices, and a new random-events call near the callers and special-visitors steps.

**Loose ends to clean up**
1. `S.market`, `Z.cancelProject`, `Z.renameAnimal`, `Z.affinityKnown`, `Z.eventNow`, `D.AFF_WORD` are unused. Use or remove.
2. `D.FAC.kiosk.rpAdj` is ignored by the engine, which hardcodes the value.
3. `Z.buyLand` and `Z.enterShow` do not refresh. `Z.enterShow` produces no report.
4. Babies go to the holding pen when the parents' habitat is full even if another habitat has room.
5. The interface duplicates engine rules that will drift: region-by-rank unlocks, the ticket formula, show medal thresholds, which roles speed up expeditions. Expose these from the engine and read them.
6. Habitat display names are numbered by position in the item list, so "Savanna #2" changes when an earlier habitat is removed. Give habitats a stable number.
7. The interface must initialise its own fields on the state (`tele`, `logQ`, `did`) for both new and loaded games.
8. Reports raised during a player action (a combo found while building) should show straight away, not on the next tick.

## 10. The team

Create an agent team with the teammates below. If agent teams are not available in this session, run the same roles as subagents with the same file ownership. The main session is the **Lead**: it writes the contracts, reviews work, resolves conflicts, talks to Harrison, and does not write feature code itself.

| Teammate | Owns | Model | Notes |
|---|---|---|---|
| Rules | `data.js`, `engine.js`, `test/bot.js` | strongest available | Portrait grid, project choices, happenings, luck mechanics, spending ladders, loose ends. Must keep the bot running a full 20 years and report the pacing table before and after. |
| Artist | `sprites.js` | strongest available | The look is the riskiest part. Must render contact sheets of every sprite to PNG and look at them before reporting. |
| Renderer | `render.js` | strongest available | Camera, depth sort, placement mode, taps. Must screenshot at 390 by 844 and look at the result. |
| Shell | `core.js`, `index.html`, `style.css` | mid-tier is fine | Port saving and logging ideas from `current/ui.js`. Build the screen stack and clock. |
| Menus | `menus.js` | mid-tier is fine | Content can be adapted from the panels and planners in `current/ui.js`, but cut the words hard. |
| Moments | `moments.js` | mid-tier is fine | Reveal sequences and choice screens. Adapt report content from `current/ui.js`. |
| Tester | `test/` | mid-tier is fine | Plays in a real browser at phone size with touch emulation, screenshots every screen, files concrete findings to the owner of each file. |

**Order of work**
1. Lead writes the interface contracts. Rules, Artist, Renderer and Shell work in parallel.
2. **Art checkpoint with Harrison** (floor screenshot).
3. Menus and Moments work in parallel on top of the finished Shell and Rules API.
4. Tester runs. Owners fix their own files. Repeat until a full first year plays cleanly by touch with no errors.
5. Lead gives Harrison a way to play it, a list of what was and was not tested, and the GitHub Pages steps.

**Testing**
- `node test/bot.js 0.8` must complete 20 years without errors after every engine change. Compare its yearly table against the current one for pacing.
- Check whether a headless browser is available for screenshots. If not, say so and have Harrison check key screens by hand.
- Report honestly what was verified and what was not.

## 11. What to tell Harrison at the end

What changed in plain words, how to open it on his computer and on his iPhone, what you tested and what you could not, anything that came out differently from this brief, and the decisions you need from him next. Keep it short.
