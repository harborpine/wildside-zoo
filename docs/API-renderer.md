# render.js -> `ZRender`: API as built (Renderer)

## Update 9 (2026-11-18): pinch zoom, no zoom setting (note 19)

The player zooms with two fingers on the floor (pinch out = closer, pinch in = further). On a desktop: ctrl + mouse wheel, or a
trackpad pinch (Chrome / Edge / Firefox send ctrl+wheel; Mac Safari's gesture events are handled too). A plain wheel still scrolls.
- Always a whole number of device pixels per buffer pixel (crisp art). Steps run from the old "Far" scale through the old "Close"
  scale (the default) to at least one step closer; a phone 393 px wide at 3x gets scales 2, 3, 4. During a pinch the scale snaps to
  the nearest step (with a little stickiness), the floor under the fingers stays put and follows their middle, and the camera
  limits still apply (no scrolling off the land).
- A pinch is never a tap: no `onTap`, no Edit-mode `onPick`, the placement ghost does not move, no fling afterwards. A finger left
  down after a pinch keeps dragging. One-finger drag and taps are unchanged.
- The choice is kept in memory for this page only (survives a new game, `reset()`, a resize; forgotten on reload). Nothing is saved.

| Call | What it does |
|---|---|
| `ZRender.setZoom(0 or 1)` / `getZoom()` | Kept for compatibility: 0 = the old Far step, 1 = the old Close step. `getZoom()` is 1 at Close or closer. No menu needs them now. |
| `ZRender.zoomBy(steps, clientX?, clientY?)` | Zoom in (+) or out (-) by whole steps around a client point (default: the middle). Returns `true` if the scale changed. |
| `ZRender.zoomTo(scale, clientX?, clientY?)` | Go to a given whole scale (kept within the steps). |
| `ZRender.zoomInfo()` | `{ scale, far, close, max, steps, pinches, pinching }`. `debug()` also has `zoomScale` and `zoomSteps` ([far, close, max]). |

Check: `node test/render-pinch.js both` (real touches in Chromium via CDP; synthetic touch pointer events in WebKit).
Screenshots: `test/shots/render-r9-zoom-<scale>[-webkit].png`.

## Update 7 (2026-11-15): walkway ring, speed 2, Edit mode, challenge maps

Where this section disagrees with older text further down, this section wins. Checks: `node test/render-shot.js both`,
`node test/render-edit.js both` (new; add `floor` or `challenge` to run one half), `node test/render-alphaprobe.js`.

### New and changed calls

| Call | What it does |
|---|---|
| `ZRender.init(canvas, { getState, onTap, getSpeed })` | `getSpeed` (optional) returns how many times faster the floor should move (the Shell passes `ZCore.floorSpeed`, 1 or 2). Read every frame; missing, zero or broken = 1; kept between 0.25 and 4. |
| `ZRender.startEdit({ onPick, onExit })` | Turns Edit mode on. Returns `true` (`false` only if there is no game state). The zoo keeps its normal look, the camera still drags, zoom still works. Leaves any open placement first. Calling it again just replaces the callbacks and clears the selection. |
| `onPick(item)` | Called for every TAP while editing (not for drags): `item` is the engine item on that hex (a habitat, from any of its hexes, or a facility), or `null` for empty ground, the gate, forest, anything else. The normal `onTap` is never called while editing. The renderer does NOT select by itself: call `select`. |
| `onExit()` | Called only when the renderer has to end Edit mode by itself: a new or loaded game (`getState()` starts returning another state) or `ZRender.reset()`. Not called by `stopEdit()`. |
| `ZRender.stopEdit()` | Leaves Edit mode: clears the selection, leaves an open placement (without calling `onCancel`), gives the floor its full height back. Does not call `onExit`. Safe when not editing. |
| `ZRender.editing()` | `true` while Edit mode is on (also while a placement started from it is open). |
| `ZRender.select(itemId or null)` | Puts the outline round that item and glides the camera only if it is not already in clear view (clear of the note line at the top and of `#edit-bar` at the bottom). Returns `true` if the item exists (or for `null`), `false` for an unknown id (which also clears the selection). The outline follows the item when it is moved or turned, and goes by itself when the item is sold. Works outside Edit mode too, but `stopEdit`, a new game and `reset()` clear it. |
| `ZRender.selected()` | The selected item id or `null`. |
| `ZRender.startPlacement(spec, cbs)` | Unchanged, and works from inside Edit mode for adding (`{kind, t, repeat}`) and moving (`{moveId}`). While it is open, taps move the ghost (no `onPick`), the selection outline is hidden (only the ghost shows), and when it ends in any way (placed, Done, Cancel, `stopPlacement()`) Edit mode is still on with the same selection. |
| `ZRender.debug()` | New fields: `editing`, `selected`, `barCover` (buffer px of floor allowed for the bottom bar), `ring`, `ringPath`, `ringDeco`, `onRing`, `offPath` (people standing on a built hex; must be 0), `speed`, `worldTime`, `clock`, `walked`, `walkSecs`, `roamed`, `maxStep`, `bounds`; `placement` also has `why`, `bad` (the hexes in the way) and `ring` (the ring the ghost would get). |

### The selection outline
Solid cyan `#35e6ff` blinking to solid white three times a second, 3 art pixels wide with a dark rim, round the outside of every hex
of the selected thing. It is drawn over the sprites (fences and animals never hide it) and blinks on real time, also while the game is
paused. Full alpha, no half-clear pixels (`alphaReport()` includes it).

### Room for `#edit-bar`
While editing or placing, the renderer measures `#placement-bar` and `#edit-bar` about three times a second (and at once on
`select` and `startPlacement`). A bar counts when it exists, is displayed, has a size and is docked at the bottom of the floor (its
bottom edge at the canvas's bottom edge, its top in the lower two thirds). The taller of the two is the allowance. With it: the
ghost and the selected item are brought into view above the bar, the camera may scroll further down so the front row and the gate
clear the bar (gate about 140 px above a 150 px strip at the limit), and a map shallower than the screen is centred in the part
that shows. The allowance eases in and out, so nothing jumps. If `#edit-bar` does not exist nothing happens.
**Menus:** keep `#edit-bar` inside `#floor-wrap`, docked at the bottom, and hide it (`display:none`) while `ZRender.placing()`: it
would otherwise cover the Place / Rotate / Cancel bar. The strip may change height at any time.

### Border walkways (note 8, replaces the Update 7 walkway ring)
- Every habitat draws a narrow walkway strip just inside its outer edge, within its own hexes (`STRIP_T` = 0.27 of the distance
  from a hex centre to its edge). A hex's strip depends only on which of its six edges are outer, so it is one cached solid
  picture per edge pattern, made from the path tile's own pixels with a slightly darker kerb on the fence side. It is laid right
  after the hex's own tile, so the hexes in front still cover the lips.
- The fence stands on the inner edge of the strip: each fence piece is the habitat's own fence sprite, moved in and cut or
  lengthened to meet its neighbours (two copies of the original picture, one lined up on each end, each kept on its own side of
  the middle in whole pixel columns). Corners look exactly like the old corners. The animals' area is a little smaller to the eye;
  the footprint is unchanged. Where two habitats touch, their two strips sit side by side and read as one shared walkway.
- Walk graph: on top of the free hexes, every outer edge of every habitat hex has a node on the middle line of its strip, plus one
  at each corner. They link along the strip, to the free hex outside that edge, and straight across to another habitat's strip
  where two habitats touch. So people walk round habitats, between touching habitats and up to a building closed in by habitats
  (its visitors stand on the strip beside it). Strip nodes get almost no random scatter and nobody leans in, so nobody steps
  inside a fence. Habitats are also watched from their own strip (about half its edge spots are extra stands).
- Animals pick their standing spots inside the fence line (a few tries, falling back to the hex centre).
- The placement ghost shows the habitat's strip and inset fences. There is no ghost ring and no ring refusal any more.
- Test hooks: `debug()` has `strips` (outer edges with a strip), `stripNodes`, `onStrip` (people on strips now), `inFence`
  (people inside a fence: must be 0), `animalsOut` (animals heading outside their fence: must be 0) and `unreached` (item ids
  nobody can walk to: must be empty). `ZRender.whereOn(x, y)` says 'strip', 'fenced', 'building' or null for a buffer point;
  `ZRender.stripSpots()` lists the strip middles; `ZRender.stripPeople()` lists the people; `ZRender.bufToClient(x, y)`.
  `debug().placement.ring` is always `[]`; `ring`, `ringPath`, `ringDeco`, `onRing` are gone or 0.

### Speed 2
Animals, visitors, staff, gate people, the arrival hop and the floating pop-ups run on game time = real time x `getSpeed()`; walk
and leg animation speed up with them. The camera, placement, the outline blinks, the marker bobbing and the map refresh stay on
real time. Each frame's game time is cut into slices of at most 1/30 s, so the biggest single step anyone takes is about 1 buffer
pixel at any speed, and people still go hex centre to hex centre, so they cannot cut through a fence. A pop-up lasts 1.7 s at
speed 1 and 0.85 s at speed 2.

### Challenge maps (`S.rows` 4 to 8)
Nothing special-cased: the scroll limit is the owned land plus a margin, so on a 393x852 phone a 4-row map shows its whole depth at
once and does not scroll up or down (it is centred), 6 and 8 rows scroll a little, and sideways the land edge stops 44 px inside
the screen at each end. The gate starts on screen in the lower part. Behind the last owned row is forest. The first habitat ghost
starts legal and in clear view. Measured in `render-edit.js` on levels `tiny` (4 rows), `small` (6) and `broke` (8).
On the 4-row map the owned land is a band across the middle (about a third of the view); the rest is forest.

### Flat symbols (Artist's redraw)
Checked on the floor: markers above habitats sit inside their dark pill (symbols are 18 to 22 px wide and 19 to 24 px tall at
density 2; the pill allows 24 x 30 per symbol), pop-up symbols sit beside their digits, the gate mark sits above the head.
No change was needed.

### Test files added
`test/render-edit.js` (border walkways, a closed-in building, refusals, ghost strip, speed, Edit mode, challenge maps; screenshots
`test/shots/render-r7-*.png`) and `test/render-setup.js` (page-side helpers: the demo facilities against their habitats, pixel helpers).
`test/render-floor.html` still tries its old "touching a habitat" facility spots, which the engine now refuses (it logs
`no spot for ...`); the tests build those five facilities themselves through `render-setup.js`.

## Where it differs from the contract (read this first)

1. **No separate stub sprites file.** The throwaway `test/render-stub-sprites.js` was not needed: the flat fallback shapes live inside
   `render.js` permanently. Every `ZSprites` call is guarded. A getter that is missing, throws, returns nothing, or still returns the
   Artist's shared placeholder (detected by asking each getter for two different things and getting the very same canvas back) falls
   back to the built-in shape for that kind only. So the floor works with no `sprites.js`, a half-finished one, or the real one.
2. **Extra functions** (not in the contract, all optional to use): `ZRender.reset()`, `ZRender.hexToClient(q, r)`,
   `ZRender.clientToHex(x, y)`, `ZRender.entrance()`, `ZRender.resize()`. See below. **The Shell should call `ZRender.reset()` after
   `newGame` or `load`** (it forgets all walkers and re-aims the camera at the gate); `mapChanged()` alone keeps the old camera spot.
3. **The renderer also notices map changes by itself** (about three times a second it compares a signature of items, owned land and
   active combos). `mapChanged()` still exists and makes the rebuild happen on the very next frame; forgetting it is harmless.
4. **Zoom works in device pixels**, so both levels stay crisp on 2x and 3x phones. Level 1 is `round(deviceWidth / 195)` device pixels
   per art pixel (a 390 px phone at 2x: 4 device px = 2 CSS px, buffer 195 wide, about 4 hexes across). Level 0 is one or more integer
   steps back (2x phone: 3 device px, buffer 260 wide, about 5.4 hexes across; 1x desktop: 1 px, buffer 390 wide).
5. **The canvas must get its size from CSS** (the Shell's `#floor { width:100%; height:100% }` is right). The renderer sets
   `canvas.width/height` to the device-pixel size and never touches the CSS size.
6. **Tiny pixel digits are drawn on the canvas** next to pop-up icons (`+12`, `+1.2k`). Numbers only, never words.
7. **`onTap` is not called during placement mode** (a tap moves the ghost instead).
8. **Place on an invalid spot does not call `onPlace`**; the note line keeps saying why. The Place button gets `aria-disabled="true"`
   and is dimmed, but stays clickable so the player gets the reason.
9. **Idle staff stroll between habitats** (zoo duty) in addition to standing at their project's habitat; staff on an expedition are
   not drawn. Decorative lamps sit beside some path hexes; a short road leads in from outside the map to the gate.
10. Paths are not stored anywhere: the renderer lays them itself (shared trunks from the entrance to one side of every habitat and
    facility over free owned hexes), so they change when the map changes.

11. **Camera start and scroll limits.** On `init` and `reset()` the camera aims at the owned land with the gate near the bottom of
    the screen (about 85% down). Scrolling is clamped to the grid's sides and front, and at the back to about two rows of forest
    past the last owned row, so the player cannot scroll far into nothing; the limit moves back when land is bought.
12. **Combo outlines are drawn twice:** on the ground, and again faintly over the sprites so fences never hide which tiles belong together.
13. **Nothing in render.js hard-codes hex proportions.** Standing spots, walker offsets, decoration scatter, outlines, tints and
    bounds all derive from `ZGeo` (reworked for the slanted grid: ZGeo.A, B, CORNERS, W, H, HW, HH, depth, edgeMidY; no use of RS or SH; tiles are laid in ascending screen y; the floor canvas covers every possible camera position so forest reaches the screen edges; scroll limit is the screen box of the owned hexes plus a margin; the road runs straight down the screen from the gate). All ground, including the forest
    outside the grid and the road to the gate, is drawn with whole `ZSprites.tile` hexes, so the Artist's honeycomb shows everywhere.

14. **New game or load is noticed automatically**: when `getState()` starts returning a different state object, the renderer
    does what `reset()` does. Calling `reset()` is still fine but no longer required.
15. **Opening camera**: everything built plus the gate, centred if it fits the screen; otherwise the gate low on the screen.
16. Decorations are never placed on the hexes touching the gate, nor where the gate arch or pillars would cover them.
    On-floor icons sit above the habitat's rearmost hex that has nothing built behind it, on a small dark backing.
    Only one animal per habitat walks at a time. Callers and happening characters stand just outside the gate pillars.
17. `debug()` also returns `gateKinds`, `gateMarks`, `gateArrived`, `icons` (per habitat id, e.g. `["sick","ready-event","bar"]`) and `moving`.

18. **Bare land (a brand-new zoo with nothing built).** The camera opens with the gate about four fifths of the way down and
    owned land filling the view. No visitors until there is something to visit. Staff start apart just inside the gate and potter
    about there until the first habitat exists. Empty item lists are safe everywhere.
19. **Holding pen on the floor.** Whenever `ZE.holding(S)` is non-empty, a crate (`ZSprites.deco('crate')`, falling back to the
    doubled `pen` icon, then a built-in box) stands on a free grass hex just inside the gate, up and to the left, with up to three
    waiting animals beside it. It keeps off paths and the gate arch, has no decoration on its hex, moves if something is built
    there, hides under a placement ghost, and vanishes when the pen is empty. A tap on it is an ordinary tap.
20. **Arrival hop.** An animal that newly appears in a habitat (housed, born, bought, moved) does a short hop with a heart pop-up.
    Not shown when a save is loaded or a new game starts. It plays only while running, so in repeat placement it waits for Done.
21. **Decorations make way for the ghost.** During placement, decorations on the ghost's hexes are hidden, and trees on the hexes
    just in front of it too. `debug()` also returns `pen` (`{q, r, crate, count, hidden, onPath}`), `inHab`, `hopping`, `staffAt`, `gateXY`.

22. **Style-D art (density 2) is ON.** The one switch is `const DENSITY` near the top of `geo.js` (2 = style D, 1 = the old art).
    `geo.js` multiplies A, B, W, H, HW, HH by it and exposes `ZGeo.DENSITY`; `render.js` calls `ZSprites.setDensity(ZGeo.DENSITY)`
    the moment it loads (it loads right after `sprites.js`, before `core.js`, `menus.js` and `moments.js`), so every sprite and every
    menu image is made at the right density. Nothing in `core.js` needed to change. Test pages may set `window.ZWZ_DENSITY = 1`
    before `geo.js` loads to compare (`test/render-floor.html?d=1`); the game never does.
    - Buffer pixels are now fine pixels (half an old art pixel). Zoom 1 is `round(deviceWidth / 390)` device px per buffer pixel:
      a 3x phone draws 3 device px (1 CSS px) per buffer pixel (old: 6), a 2x phone 2 (1 CSS px), a 1x screen 1. The view is the same
      size as before (about 4 hexes across), with twice the detail.
    - Zoom 0 is `round(deviceWidth / 560)`, at least one step back: on a 3x phone 2 device px (the same pulled-back view as before);
      on a 2x phone only 1 device px is possible, so it pulls back further than before (about 7.5 hexes across instead of 5.4);
      on a 1x screen both zoom levels are the same.
    - Every hand-tuned number (pop-up rise and offsets, icon spacing and backing, progress bars, walker and animal speeds, standing
      spots, gate slots, holding-pen crate and its animals, arrival hop, decoration scatter, camera padding and scroll margins, fling
      speed, culling margins) is in old art pixels times K (= density). Combo outlines and the placement edge are 2 fine pixels wide
      with a 6-pixel dark halo and dashes 8 long, so they keep their weight. Pop-up digits and the built-in fallback shapes are drawn
      at the old size and blown up K times with crisp pixels.
    - `debug().buffer` now has `density` and `artScale` (CSS px per OLD art pixel); `scale` and `deviceScale` are per buffer pixel.
    - **Animals are always solid.** The faint copy of the combo outlines drawn over the sprites now has every animal and person cut
      out of it first (it used to show through animals standing on a habitat's back edge, which looked see-through on the owner's
      iPhone). `ZRender.checkAnimals()` makes the next frame verify that every opaque animal pixel nothing in front covers shows the
      sprite's own colour; read `debug().animalCheck` (`{animals, checked, bad, worst, minAlpha}`); `debug().animalAlpha` is the lowest
      alpha any animal was drawn with. `render-shot.js` asserts this in every habitat state (normal, event, breeding, closed, sick).
    - **Nothing on the floor is see-through (owner's rule).** Every draw uses full alpha. The placement ghost (ground, fences, building) is
      solid; fits / does not fit shows as a solid outline 2 art pixels wide that blinks green/white (fits), red/white (blocked),
      gold/white (completes a combo) or orange/white (breaks one), plus a small solid red cross on each blocked hex. The item being
      moved is hidden at its old spot (only the ghost shows). Combo outlines are drawn once, solid, on the ground; things in front cover
      them. Icon backings are a solid dark pill with a lighter rim. Pop-ups blink twice at the end and vanish instead of fading.
      Test hooks: `ZRender.watchAlpha(true)` then `ZRender.alphaReport()` -> `{minAlpha, draws, blendOps, ownPartialPixels}`;
      `render-shot.js` asserts full alpha through play, drag, zoom, pop-ups and every placement. `node test/render-alphaprobe.js`
      lists the Artist's sprites that still contain half-clear pixels.
    - Frame cost at 393x852 DPR 3, mid-game zoo, headless: Chromium about 1.1 ms, WebKit about 1.9 ms per frame (old art: 0.8 / 0.7 ms).

## Functions

| Call | What it does |
|---|---|
| `ZRender.init(canvas, { getState: () => S, onTap: ({q, r, item}) => void })` | Starts the floor and its own animation loop. `item` is the engine item on that hex or `null`. Safe to call again. Calls `ZSprites.init()` if present. Returns `ZRender`. |
| `ZRender.setRunning(bool)` | `false` = calm state: animals, visitors and pop-ups freeze (standing frame), new `S.fx` wait untouched. Dragging, tapping and placement still work. |
| `ZRender.mapChanged()` | Rebuild the cached floor, paths, fences, decorations and combo outlines on the next frame. |
| `ZRender.reset()` | New or loaded game: forget all actors and pop-ups, leave placement, re-aim the camera at the gate. |
| `ZRender.centerOn(q, r, instant?)` | Glide (or jump) the camera to a hex, clamped to the map. |
| `ZRender.setZoom(level)` / `getZoom()` | `1` normal, `0` pulled back. Keeps the same spot centred. |
| `ZRender.startPlacement(spec, { onPlace, onCancel })` | `spec = { kind:'hab'|'fac', t, rot?, moveId?, repeat?, label? }`. With `moveId`, `kind`/`t` may be left out (read from the item) and the item is ignored by the validity check and drawn faintly at its old spot. Returns `true` if started. |
| `ZRender.stopPlacement()` / `placing()` | Leave placement without calling `onCancel` / is placement active. |
| `ZRender.debug()` | `{ sprites, fps, frameMs, cam:{x,y}, buffer:{w,h,scale,deviceScale,dpr}, running, zoom, realSprites, spriteGetters:{tile,fence,...}, spriteErrors, animals, visitors, staff, gate, floaters, combos, statics, paths, placement:{q,r,rot,ok,state,msg,makes,breaks}|null }`. `buffer.scale` is CSS px per art pixel. |
| `ZRender.hexToClient(q, r)` | Page (client) coordinates of a hex centre right now. Handy for tests and for pointing at things. |
| `ZRender.clientToHex(x, y)` | The hex under a client point. |
| `ZRender.entrance()` | `{q, r}` of the gate hex the renderer is using. |

## Placement flow as of the first-year test round (this replaces any older wording below)

- `startPlacement(spec, { onPlace, onCancel, onDone? })`.
- The ghost starts on a **valid** hex: the valid spot nearest the middle of the screen (the camera glides to it if it is off
  screen). A moved item starts where it stands. If nothing fits anywhere it starts on the nearest owned hex and says why.
- **Rotate exists only when turning changes the footprint.** Single-hex facilities and fully round habitats (Reef, Misty Isles)
  get two buttons, Place and Cancel, which share the bar. There is never a dead button.
- One-off placement: a successful Place leaves placement by itself.
- Repeat placement: after each successful Place the ghost hops to the nearest hex that still fits, and the third button
  (`button.zr-cancel`) reads **Done**. Leaving after at least one build calls `onDone` if given, otherwise `onCancel`.
  Before any build it reads Cancel and calls `onCancel`.
- The note is one line (no wrapping); the label prefix is dropped when the line would be long. Buttons are 56 px tall, or
  44 px when the window is under 480 px tall (landscape phone) so they cover less floor.

## Placement mode details

- The ghost starts on the owned hex nearest the middle of the screen. Tap a hex (inside the grid) to move it; drag still scrolls.
- The renderer fills `#placement-bar` with three buttons: `button.zr-btn.zr-rotate` "Rotate" (disabled for facilities),
  `button.zr-btn.zr-place` "Place", `button.zr-btn.zr-cancel` "Cancel", each with inline `min-height:56px`. It empties the bar and the
  note when placement ends, so the Shell's `:empty { display:none }` rules work. It also toggles class `zr-on` on both elements.
  If either element is missing it creates one inside the canvas's parent. Its own default styles use `:where()` (zero priority), so
  anything in `style.css` wins.
- `#placement-note` text: `Fits here.` / `Completes <combo>!` / `Breaks <combo>.` (both can appear) / `Outside your land.` /
  `Something is in the way.` / the `msg` the engine returned when `onPlace` gave `{ok:false, msg}`. With `label` it is prefixed
  (`Snack Stand: Fits here.`). `data-state` on the note is `ok`, `combo`, `warn` (breaks one) or `bad`.
- `onPlace(q, r, rot)` must return the engine result. On `{ok:false}` placement stays open and shows `msg`. On success it ends,
  or with `repeat:true` stays open on the same hex (now taken) so the player can tap the next spot.
- Cancel calls `stopPlacement()` then `onCancel()`.
- On the floor: footprint tinted green (fits), gold (completes a combo), red (blocked hexes a stronger red), a shimmering outline
  round the footprint, and the building or fenced habitat drawn see-through in the right depth order.

## What it reads from the game

`ZD.GRID_W/H`, `ZD.BIOMES`, `ZD.COMBOS`, `ZD.FAC_ORDER`; `ZE.inLand`, `ZE.inGrid` (falls back to the offset range), `ZE.entrance`
(falls back to a free front-row hex), `ZE.fromOffset/toCol`, `ZE.cells/cellsOf/canPlace/occupancy/layout`, `ZE.c(S).active` (and
`.visitors`, `.shopVal`), `ZE.isJuv`, `ZE.animal`, `ZE.habStatus` (falls back to project progress only), `ZE.buzzNow`,
`ZE.callersHere` (falls back to `S.headhunt`); `S.items`, `S.animals`, `S.staff`, `S.projects` (`staff`, `hab`, `start`, `end`,
`choice`), `S.visitorsLast`, `S.week`, `S.happening.who`, `S.fx`.

It writes exactly one thing: `S.fx.length = 0` after turning the entries into pop-ups (only while running).

### On-floor markers
Above the back hex of each habitat, from `ZE.habStatus`: icons `choice`, `sick`, `ready-event`, `ready-breed`, `flame` (buzz), and a
small green progress bar while `busy` with a `progress` number (`busy` icon if there is no number). Projects with no habitat
(expeditions) show their bar above the gate. A happening character at the gate carries a bobbing `choice` icon.

### Pop-ups from `S.fx`
`money` -> coin + amount, `rp` -> rp + amount, `rep` -> rep + amount, `event` -> one icon + number per gain (animals heart, habitat
rep, fun star, learning rp) and a flame when `fired`, `birth` -> two hearts, `exp` and `super` -> stars, `buzz` -> flame, `sick`,
`choice` -> that icon. Position: `hab`, else `item`, else `q,r`, else the gate. Amount is read from `amt` (also `amount`, `n`,
`value`, `v`). Unknown types show a star at the gate, so new types never break anything. An entry may pass `icon:'<name>'` to choose.

## Test files

- `test/render-floor.html`: floor-only harness with a demo zoo built through real engine calls. `?stub=1` skips `sprites.js`,
  `?blank=1` gives a bare new zoo, `?rows=N` sets owned rows (default 14, a mid-game zoo with open grass between things; a real new game owns 8), `?full=1` adds two more habitats.
- `test/render-d2.js`: `node test/render-d2.js [chromium|webkit|both]`. At 393x852 DPR 3: `render-d2-floor.png`, `render-d2-blank.png`,
  `render-d2-place.png`, `render-d2-compare.png` (old density left, style D right, same camera spot), `render-d2-zoom.png` (close-up),
  checks the scale numbers and that frame cost stays under 8 ms.
- `test/render-shot.js`: `node test/render-shot.js [chromium|webkit|both] [--stub]`. All its pixel expectations follow `ZGeo.DENSITY`. Headless. Writes `test/shots/render-floor.png`,
  `render-drag.png`, `render-fx.png`, `render-zoomout.png`, `render-place-valid.png`, `render-place-invalid.png`,
  `render-place-habitat.png`, `render-place-combo.png` (WebKit copies end in `-webkit.png`) and checks: buffer size and crisp
  scale-up, tap hit-testing on every reachable grid hex (mouse and touch, centre and off-centre), drag distance, drag does not tap,
  inertia, clamping, calm state, pop-ups, zoom, all three placement buttons and their callbacks, the combo notes, repeat mode, and
  no console errors.
