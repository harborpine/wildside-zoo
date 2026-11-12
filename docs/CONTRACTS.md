# Wildside Zoo: interface contracts (written by the Lead)

Read `docs/BRIEF.md` first. This file says what each file exposes and what it may call. If you need a change to someone
else's API, do not edit their file: tell the Lead in your report. When you finish, write a section "API as built" for your
file(s) to `docs/API-<yourname>.md` (your own file, so nobody collides).

## Ground rules for every teammate

- The new game lives at the **repo root**: `index.html style.css data.js engine.js geo.js sprites.js render.js core.js menus.js moments.js`.
  `current/` is the old game, read-only reference. No build step, no dependencies, plain `<script>` tags, no ES modules.
- **Edit only the files you own.** Anything in `test/` you create must be prefixed with your role (`test/art-*.js`, `test/render-*`, ...).
- **Do not run git commit, add, push, stash, checkout or reset.** The Lead does all git. Others are editing this folder at the same time.
- Each browser file is one IIFE that sets a single global: `ZD` (data), `ZE` (engine), `ZGeo`, `ZSprites`, `ZRender`, `ZCore`, `ZMenus`, `ZMoments`.
- Script order in `index.html`: data, engine, geo, sprites, render, core, menus, moments. A file may call only globals loaded before it,
  except through the hooks named below. Guard optional ones (`window.ZMenus && ...`) so the page works while later files do not exist yet.
- Node 24 is not on PATH. In Git Bash start every command with
  `export PATH="/c/Users/Harrison/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"`.
- Screenshots: `const { chromium, webkit } = require('./test/pw.js')`. **Headless only. Never open a visible browser window**
  (the owner may be using this PC). Phone size is 390 x 844, `deviceScaleFactor: 2`, `hasTouch: true`. Load pages with a `file:///` URL.
  Save screenshots under `test/shots/` (git-ignored). Look at your own screenshots with the Read tool before reporting.
- No sound. No words drawn on the canvas. Teen-appropriate. Nothing from the "explicitly rejected" list in the brief.
- Never weaken or delete a test to make it pass. Report honestly what you verified and what you did not.

## geo.js -> `ZGeo` (Lead; done, read it)

`W=48` column step, `RS=20` row step, `HH=16` half height, `SH=4`. `CORNERS`, `EDGES` (NE, E, SE, SW, W, NW), `toScreen(q,r) -> {x,y}`
(hex centre at ground level, buffer px), `toAxial(x,y) -> {q,r}`, `depth(q,r,dy)`. Never hard-code these numbers elsewhere: read them
from `ZGeo`, so the Lead can retune the camera in one place. If the look needs different numbers, tell the Lead.

## data.js, engine.js -> `ZD`, `ZE` (Rules)

Start from the copies at the root (identical to `current/`). Existing conventions stay: one state object `S`, `ZE.tick(S)` advances a
week, actions return `{ok:true,...}` or `{ok:false,msg}`, reports go to `S.reports`, map pop-ups to `S.fx`. Everything in brief
sections 6 and 9 is yours. Fixed points the other files rely on from day one:

- Portrait map: `ZD.GRID_W` (about 10), `ZD.GRID_H` (about 20), land grows by rows. `ZE.inLand(S,q,r)` stays the single truth for
  "is this hex owned". Add `ZE.inGrid(q,r)` (inside the full grid, owned or not) and `ZE.entrance(S) -> {q,r}` (the gate hex at the
  front/bottom edge, nothing can be built on it). Keep `ZE.cells(item)`, `ZE.cellsOf`, `ZE.canPlace`, `ZE.layout`, `ZE.toCol`, `ZE.fromOffset`.
- Stable habitat numbers: each habitat item gets a permanent `n`; add `ZE.habName(S, item)`.
- `ZE.habStatus(S, item) -> {event:boolean, breed:boolean, busy:null|'event'|'breed', progress:0..1|null, sick:boolean}`
  for the quiet on-floor icons and progress bars (so the renderer never re-derives rules).
- Projects: every project in `S.projects` has `id`, `type` ('expedition'|'breed'|'event'), `start`, `end` (weeks), staff ids, and, where it
  has one, `hab`. A pending mid-point choice is `project.choice = {key, title, text, who?, options:[{label, note?, cost?, costRp?, odds?}]}`
  plus a report `{type:'choice', pid}`; `ZE.resolveChoice(S, pid, optionIndex)` resolves it and returns `{ok, text, good:boolean}`.
  A project with an unanswered choice keeps running on a sensible default if the player never answers (nothing may deadlock; the bot must
  be able to ignore or answer choices).
- Happenings: report `{type:'happening', key, title, text, who?, hab?, options?:[...same shape...]}`; `ZE.resolveHappening(S, optionIndex)`
  when it has options; the pending one is `S.happening`. `who` is a person sprite kind (see sprites) who is shown arriving at the gate.
- Callers in town (trader, headhunter, visiting director) are readable as `ZE.callersHere(S) -> [{kind, ...}]` so the floor can show them at the gate.
- Luck: `ZE.train` returns `{ok, gain, super:boolean}`; hiring is `ZE.hireTiers(S) -> [{key,name,cost,note}]`, `ZE.advertise(S, tierIndex)
  -> {ok, candidates:[...]}`, `ZE.hireCandidate(S, i)`; mystery crate `ZE.crateInfo(S) -> {cost, odds:[...per rarity]}|null`, `ZE.openCrate(S) -> {ok, animal}`.
  Reveal data (expedition finds, birth stat rolls, critic scores) rides on the existing `expedition`, `birth`, `review` reports as plain
  arrays the interface can step through.
- Read-only rule lookups the interface used to duplicate (brief 9.5): expose them as `ZE` functions.
- `ZE.serialize/deserialize` keep working; bump the state version `S.v` to 3; `ZE.SAVE_VERSION = 3`.
- Reports raised inside a player action must already be in `S.reports` when the action returns.
- `test/bot.js` must finish `node test/bot.js 0.8` for 20 years after every change. The "before" table is saved in
  `docs/pacing-before.txt`; save the final one to `docs/pacing-after.txt`.
- Write `docs/API-rules.md`: every action, lookup, report type (with its fields) and fx type. Menus and Moments will be built from that file.

## sprites.js -> `ZSprites` (Artist)

All art is made in code, baked once to offscreen canvases, cached. Works in a browser only (uses `document.createElement('canvas')`).
A **sprite** is `{c: HTMLCanvasElement, w, h, ax, ay}`; `(ax, ay)` is the anchor: the pixel that sits on the ground point, so the
renderer draws with `ctx.drawImage(s.c, Math.round(x - s.ax), Math.round(y - s.ay))`. All sizes are buffer pixels at 1x.

- `ZSprites.init()` bakes everything (idempotent). Getters also work lazily without it.
- `ZSprites.animal(speciesId, {variant?:bool, juv?:bool, frame?:int, flip?:bool}) -> sprite`. Every id in `ZD.SPECIES_LIST` (68 species,
  including the two secret regions) must return a recognisable sprite; unknown ids return a fallback, never throw.
  `ZSprites.ANIMAL_FRAMES` = number of walk frames (frame 0 is standing). Adult land animals about 16 to 24 px, juveniles smaller,
  anchor at the feet centre. Aquatic species are drawn to sit in water tiles.
- `ZSprites.person(kind, {frame?, flip?, seed?}) -> sprite`. Kinds: `visitor` (seed picks clothes, hair, child/adult), the staff roles
  in `ZD.ROLES` (use the role id), `trader`, `headhunter`, `director`, `vip`, plus any `who` kinds the Rules teammate lists for happenings
  (fallback to a generic person). About 12 x 18. `ZSprites.PERSON_FRAMES`.
- `ZSprites.tile(kind, seed?) -> sprite` anchored at the **hex centre**: `grass` (several variations by seed), `path`, `locked`
  (land not bought yet, dimmer), `water`, and `hab:<biome>` for each of the 8 biomes (the ground inside a habitat). Tiles are exactly
  one `ZGeo` hex, and may have a short front lip so the map edge looks like a slab.
- `ZSprites.fence(biome, edge) -> sprite` anchored at the hex centre, for edge index 0..5 in `ZGeo.EDGES` order. Fences have height
  and a visible front face. Also returns `sortDy` on the sprite: the y offset from the hex centre of the fence's ground line (for depth sorting).
  Back edges (NE, NW, and the upper halves of E/W) are drawn before the animals in a hex, front edges after; `sortDy` must make that
  fall out of a plain sort.
- `ZSprites.building(facId, {frame?}) -> sprite` for every id in `ZD.FAC_ORDER`: little iso buildings with two visible faces, a roof
  and a ground shadow, anchored at the hex centre, fitting one hex footprint (they may rise above it).
  `ZSprites.entrance()` -> the zoo entrance gate (may be wider than a hex).
- `ZSprites.deco(kind, seed?) -> sprite`: `tree`, `bush`, `flowers`, `rock`, `lamp`, anchored at the base.
- `ZSprites.icon(name) -> sprite`, about 9 to 12 px, anchored at centre-bottom: on-floor markers `ready-event`, `ready-breed`, `busy`,
  `sick`, `choice` (something needs you), `star`, `flame`, `coin`, `rp`, `heart`, `rep`; menu icons `m-projects`, `m-build`, `m-animals`,
  `m-staff`, `m-research`, `m-info`, `m-system`; `ZSprites.ICONS` lists every name. Unknown names return a small fallback.
- `ZSprites.url(sprite, scale?) -> string` data URL (crisp scale-up, default 3) for menus to use in `<img>`; cached.
  Convenience: `ZSprites.animalUrl(speciesId, opts, scale)`, `ZSprites.iconUrl(name, scale)`, `ZSprites.personUrl(kind, opts, scale)`.
- `ZSprites.PALETTE` named colours the DOM can reuse (the Shell reads these for the menu theme).
- Must produce contact sheets (`test/art-sheet.html` + `test/art-shot.js` -> `test/shots/art-*.png`) of every animal at 4x with its
  name under it, every person, tile, fence set, building, deco and icon, and a small composed scene; look at them and iterate before
  reporting. Identity matters: a lion must read as a lion at a glance (mane), elephant (trunk, ears), giraffe (neck, patches), and so on.

## render.js -> `ZRender` (Renderer)

Owns the canvas floor. Reads the game state, never changes rules state (the one exception: it empties `S.fx` after showing the pop-ups).

- `ZRender.init(canvas, {getState: () => S, onTap: ({q, r, item}) => void})`. Creates the low-res buffer (CSS width of the canvas
  element / integer scale; target buffer width about 195 for a 390 px phone), handles resize, starts its own `requestAnimationFrame` loop.
- `ZRender.setRunning(bool)`: when false (a menu is open) walkers and animals hold still or idle gently; pop-ups wait.
- `ZRender.mapChanged()`: rebuild the cached floor (called after build, move, remove, land purchase, load).
- `ZRender.centerOn(q, r, instant?)`, `ZRender.setZoom(level)` (1 = normal, 0 = pulled back one integer step), `ZRender.getZoom()`.
- Input: drag to scroll with clamped bounds and a little inertia; a tap (press and release under about 8 px of travel) calls `onTap`.
  Pointer events only; `touch-action: none` on the canvas. Mouse works the same for desktop testing.
- Draws: cached floor (grass, paths, locked land, habitat ground), then one depth-sorted list of fences (one sort key per edge),
  buildings, decorations, animals (wandering inside their own habitat's cells, capped per hex), visitors walking between the entrance
  and facilities/habitats (count scales gently with `S.visitorsLast`), staff standing at their project's habitat, callers and
  happening characters at the gate (`ZE.callersHere`, `S.happening`), then on-floor icons from `ZE.habStatus`, small progress bars for
  running projects, combo outlines (one shared outline around all tiles of each active combo, from `ZE.c(S)`), and floating pop-ups from `S.fx`.
- Placement mode: `ZRender.startPlacement({kind, t, rot?, moveId?, repeat?:bool, label?}, {onPlace: (q, r, rot) => ({ok, msg}), onCancel: () => void})`.
  Shows a ghost at the screen centre hex; tapping a hex moves it there; three large DOM buttons at the bottom (Rotate, Place, Cancel,
  at least 56 px tall, inside the safe area) which the renderer creates inside the element with id `placement-bar`; a one-line DOM
  note (`#placement-note`) says valid/invalid and "completes <combo>" / "breaks <combo>" using `ZE.canPlace` and `ZE.layout`.
  With `repeat`, stay in placement after a successful place. `ZRender.stopPlacement()`, `ZRender.placing() -> bool`.
- `ZRender.debug() -> {sprites, fps, cam, buffer:{w,h,scale}}` for tests.
- Until `sprites.js` is finished, develop against the contract above with a throwaway `test/render-stub-sprites.js` (flat coloured
  shapes with the same API) and switch to the real file when it lands. Your harness is `test/render-floor.html` (floor only, no menus)
  with a demo zoo built through real engine calls (search for valid spots with `ZE.canPlace`; never hard-code coordinates, the grid is
  being changed to portrait by the Rules teammate) and `test/render-shot.js` to screenshot it at 390 x 844.

## core.js, index.html, style.css -> `ZCore` (Shell)

- Page: full-height portrait column, max width about 430 px centred on wide screens, no page scroll or zoom, safe-area padding,
  `<canvas id="floor">` filling the space between the top strip and the one-line news strip, `<div id="placement-bar">`,
  `<div id="placement-note">`, `<div id="screens">` (the screen stack layer). Web-app manifest, icons, iOS meta tags (the app icon can
  be drawn from `ZSprites` to a canvas in a small script you own under `test/shell-icons.js`, output to `icons/`).
- Top strip: date, money, visitors per week, rank stars. Updates each tick. Bottom: one short news line.
- State: `ZCore.S` (getter). `ZCore.newGame(opts)`, `ZCore.save()`, `ZCore.load()`. localStorage key `wildside-zoo-v3`, saved every few
  weeks, on `visibilitychange`/`pagehide`, and on demand. Initialise interface-owned fields on new and loaded games alike.
- `ZCore.act(name, ...args)`: calls `ZE[name](S, ...args)`, logs it (and refusals), then shows any reports already raised, tells the
  renderer `mapChanged()` when relevant, refreshes the strip, and returns the engine's result. Menus call the engine only through this.
- Clock: `ZCore.speed` (1 or 2), `ZCore.setSpeed(n)`; time runs only while the screen stack is empty and placement is off; one tick
  per week interval (start near the old game's pacing; target 5 to 8 real hours per 20 years at the owner's 80%-paused style).
- Screen stack: `ZCore.push({id, title?, render(bodyEl, api), onShow?, onClose?, modal?:bool, cls?})`, `ZCore.pop()`, `ZCore.popAll()`,
  `ZCore.replace(screen)`, `ZCore.stack() -> [ids]`, `ZCore.rerender()` (re-run the top screen's render). The framework draws the frame:
  a panel with a title and a large Back button (bottom, thumb reach) unless `modal`. Pause whenever the stack is non-empty.
- UI helpers in `ZCore.ui`: `el(tag, attrs, ...children)`, `btn(label, onTap, {icon?, sub?, disabled?, cls?})`, `grid(items)`,
  `list(rows)`, `stat(label, value)`, `img(url)`, `toast(msg)`, `confirm(text, onYes)`; and `ZCore.fmt`: `money(n)`, `signs(x)`
  (`--`, `-`, `+`, `++`), `stars(n)`, `date(S)`.
- Hooks for later files: floor tap -> `ZCore.openMenu()` which calls `window.ZMenus.open()` when it exists (until then show a
  placeholder screen that says the menu goes here, so pausing can be tested). Report queue: `ZCore.onReport(type, (report, done) => void)`
  registers a handler (Moments will register all of them); the queue shows one report at a time, in order, straight after the action
  or tick that raised it; unhandled types get a plain default card. `ZCore.flushReports()`.
- Log: `ZCore.log(type, data)`, quarterly snapshots via `ZE.snapshot`, play time by speed, screens opened, refused actions; bounded
  size (roll old quarters into summaries); `ZCore.logText()`, `ZCore.copyLog()`, `ZCore.downloadLog()`, `ZCore.addNote(text)`.
- Test hook `window.ZT = {S (getter), tick(n), act, stack, newGame, openMenu, errors:[...captured window errors]}`.
- Until `render.js`/`sprites.js` land, guard their use so the page still loads; integrate when they exist. Screenshot your shell at
  390 x 844 with `test/shell-shot.js`.

## menus.js -> `ZMenus`, moments.js -> `ZMoments` (phase 2, after the art checkpoint)

Built on `ZCore.push/ui/act/onReport` and `docs/API-rules.md`. `ZMenus.open()` shows the main menu grid. `ZMoments.init()` registers
one handler per report type. Details will be added here by the Lead before those teammates start.

## Added by the Lead after the owner's note: App Store is the end goal

The finished game will later be wrapped as an iPhone App Store app (a native shell around these same web files), and until then the
owner tests in a browser on his PC. So: everything must work fully offline from local files (no CDNs, no web fonts, no network calls,
no cookies), with relative paths only, touch-first with mouse parity, safe-area aware, and saving only to local storage on the device.
Nothing may depend on being served from a particular web address. It must run when `index.html` is opened straight from disk.
