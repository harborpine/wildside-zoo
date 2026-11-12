# sprites.js: API as built (Artist)

One IIFE, one global: `ZSprites`. Needs `ZGeo` (and reads `ZD` only inside `init`). Browser only. Nothing throws for unknown ids:
every getter returns a fallback sprite.

## Differences from the contract (read these first)

1. **Animals are a little bigger than the 16 to 24 px target.** Most adult land animals are 22 to 29 px wide; the largest are
   komodo 37x12, dragon 38x27, triceratops 35x22, trex 33x25, whaleshark 33x20, narwhal 33x17, rhino 32x22, mammoth 32x26.
   The giraffe is 38 tall. This was on purpose (the owner asked for big and chunky) and they still fit a 48 px hex one or two at a
   time. Cap at 2 animals per hex for the big ones.
2. **Shadows are baked in.** Animal, person, building and deco sprites already include a soft ground shadow. The renderer should not
   add its own.
3. **Frame counts are 4, not 2.** `ANIMAL_FRAMES = 4` and `PERSON_FRAMES = 4`: frame 0 stands, 1 and 3 are the two strides, 2 is the
   standing pose again. Cycling `frame % 4` walks correctly; holding frame 0 stands still.
4. **Turned grid (current geo.js: A [45,9], B [12,33], asymmetric corners).** Tiles are the true six-corner cell from `ZGeo`
   (a pixel belongs to the hex that `ZGeo.toAxial` gives for its centre), so neighbours meet exactly. A tile is 52 x 41
   (38 + a 3 px lip), anchor (26, 19) = the hex centre. Draw floor tiles in ascending screen y of their centres (or by r, then q)
   so each tile covers the lip of the ones behind it.
   **Fences** are drawn along each true edge, corner to corner. `sortDy = ZGeo.edgeMidY(edge)`: NE -12, E 4.5, SE 16.5, SW 12,
   W -4.5, NW -16.5. Read it from the sprite. Keep animals a few pixels inside the hex so the plain sort stays right.
5. **`entrance()` carries `sortDy = +ZGeo.HH` (19)** so the arch draws in front of whoever walks through its hex. It is an upright,
   front-facing arch about 57 px wide and does not turn with the grid.
6. **Water animals** hover 3 to 4 px above the anchor with a dark-blue shadow so they sit in a water tile. The narwhal brings its own
   ice-hole puddle (the polar ground is ice) and the sea otter floats on its back with a light ripple. `ZSprites.isWater(id)` says
   which species these are.
7. **Sizes and ZGeo.** Tiles and fences are built from `ZGeo` tables (no `RS`/`SH`, no symmetry assumed). Buildings, the entrance,
   animals, people, decorations and icons are upright objects with fixed pixel sizes; buildings fit inside the 52 x 38 hex box.
8. Extra helpers beyond the contract: `buildingUrl`, `tileUrl`, `PERSON_KINDS`, `DECOS`, `BUILDING_FRAMES`, `VISITOR_SEEDS`,
   `GRASS_VARIANTS`, `FENCE_H`, `hasAnimal`, `isWater`.

## Sprite

`{c: HTMLCanvasElement, w, h, ax, ay}`. Draw with `ctx.drawImage(s.c, Math.round(x - s.ax), Math.round(y - s.ay))`.
Fences and the entrance also have `sortDy`.

## Functions

| Call | Notes |
|---|---|
| `init()` | Bakes tiles, fences, buildings, icons and every animal's normal frames. Idempotent. Optional: all getters bake lazily and cache. The full set (every animal, variant, juvenile, frame and flip) bakes in about 0.2 s. |
| `animal(id, {variant, juv, frame, flip})` | Anchor at the feet centre. Faces right; `flip` faces left. Unknown id: a grey generic animal. Some juveniles differ in more than size (lion cub has no mane and faint spots, harp seal pup is white, penguin chick is grey, tapir calf is striped, antlers and tusks are small or missing). |
| `person(kind, {frame, flip, seed})` | Anchor at the feet centre. About 11 to 17 wide, 18 to 23 tall (hats and balloons add height). `seed` only matters for `visitor` (97 different visitors, `VISITOR_SEEDS`; about a quarter are children). Unknown kind: `person`. |
| `tile(kind, seed)` | Every tile draws its own hexagon outline (darker lower and right edges, lighter upper and left edges). `grass` and `locked` have 18 looks by seed (6 details x 3 close tones, so pass a seed that differs between neighbours, e.g. a hash of q and r), `path`, `locked`, `water`, `hab:<biome>`. `ZGeo.W` wide, anchor `(ZGeo.HW, ZGeo.HH)` at the hex centre, with a 3 px front lip below the lower edges. Unknown kind: grass. |
| `fence(biome, edge)` | Edge 0..5 in `ZGeo.EDGES` order. Anchor at the hex centre. Has `sortDy`. Eight styles: wood rails, bamboo slats, red posts and rope, ice wall, stone wall, glass panels, steel posts with warning wires, gold railing. Unknown biome: savanna style. |
| `building(facId, {frame})` | Every id in `ZD.FAC_ORDER`. Anchor at the hex centre. Only `fountain` animates (2 frames, `BUILDING_FRAMES`). Unknown id: a plain hut. |
| `entrance()` | Two pillars and a green arch with a paw emblem. Anchor at the hex centre of the gate hex. |
| `deco(kind, seed)` | `tree` (4 looks: big, small, pine, fruit), `bush`, `flowers`, `rock`, `lamp`. Anchor at the base. |
| `icon(name)` | Anchor centre-bottom. Unknown name: a small grey dot. |
| `url(sprite, scale=3)` | PNG data URL, crisp scale-up, cached. |
| `animalUrl(id, opts, scale)`, `personUrl(kind, opts, scale)`, `iconUrl(name, scale)`, `buildingUrl(id, scale)`, `tileUrl(kind, scale)` | Shortcuts for menus. |

## Lists

**Person kinds (`ZSprites.PERSON_KINDS`)**: `visitor`, staff roles `keeper`, `vet`, `researcher`, `explorer`, `guide`, `zoologist`,
`leader`, `showrunner`; callers `trader`, `headhunter`, `director`, `vip`; happening characters (from `ZD.WHO`) `teacher`, `donor`,
`reporter`, `photographer`, `kid`, `professor`, `builder`, `volunteer`, `elder`; and `person` (the generic fallback).

**Icons (`ZSprites.ICONS`)**: on-floor markers, 11 px round white badges: `ready-event` (red flag), `ready-breed` (pink heart),
`busy` (hourglass), `sick` (green cross), `choice` (yellow badge with an exclamation mark). Plain 9 to 11 px: `star`, `flame`, `coin`,
`rp` (blue flask), `heart`, `rep` (medal). Menu icons, 11 to 15 px: `m-projects` (clipboard), `m-build` (hammer), `m-animals` (paw),
`m-staff` (keeper), `m-research` (green flask), `m-info` (book), `m-system` (gear).

**`ZSprites.PALETTE`**: `ink`, `outline`, `paper`, `panel`, `panelEdge`, `panelDark`, `shade`, `text`, `textSoft`, `white`, `accent`,
`accentDark`, `blue`, `blueDark`, `good`, `goodDark`, `bad`, `gold`, `goldDark`, `pink`, `purple`, `grass`, `grassDark`, `path`, `water`,
`wood`, `woodDark`, `sky`, `night`, `rp`, `money`, `rep`, `star`, `flame`, `biome.<id>` (8 colours), `rarity[1..6]`.

## Checking the art

- `node test/art-shot.js` renders every contact sheet to `test/shots/art-*.png` (headless). Name sheets to render only some:
  `animals-<biome>`, `people`, `tiles`, `fences`, `buildings`, `extras`, `patch` (tiles at 8x), `scene`, `scene2`.
- `node test/art-check.js` confirms every id in the contract returns its own sprite (not a fallback), that no two species are
  pixel-identical, and that variants, juveniles and walk frames differ from the base sprite.
- `test/art-sheet.html?s=<sheet>` is the page both scripts use.
