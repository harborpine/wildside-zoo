# render.js -> `ZRender`: API as built (Renderer)

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
  `?rows=N` sets owned rows (default 14, a mid-game zoo with open grass between things; a real new game owns 8), `?full=1` adds two more habitats.
- `test/render-shot.js`: `node test/render-shot.js [chromium|webkit|both] [--stub]`. Headless. Writes `test/shots/render-floor.png`,
  `render-drag.png`, `render-fx.png`, `render-zoomout.png`, `render-place-valid.png`, `render-place-invalid.png`,
  `render-place-habitat.png`, `render-place-combo.png` (WebKit copies end in `-webkit.png`) and checks: buffer size and crisp
  scale-up, tap hit-testing on every reachable grid hex (mouse and touch, centre and off-centre), drag distance, drag does not tap,
  inertia, clamping, calm state, pop-ups, zoom, all three placement buttons and their callbacks, the combo notes, repeat mode, and
  no console errors.
