# API as built: Shell (`core.js`, `index.html`, `style.css`)

Global: `ZCore`. Loaded after `ZRender`, before `menus.js` and `moments.js`. `window.ZT` is the test hook.
Everything below was exercised by `test/shell-shot.js` on Chromium and WebKit. Try the sample screens at `index.html?demo=1`
(`ZDemo.show('grid' | 'list' | 'sub' | 'choice' | 'reveal' | 'reveal2' | 'misc' | 'confirm' | 'toast' | 'log')`, source `test/shell-demo.js`).

## Start-up order

`index.html` loads `data, engine, geo, sprites, render, core, menus, moments` (the optional ones with `onerror` so the page still loads without them).
`core.js` boots itself on `DOMContentLoaded`: loads the save or starts a new game, wires `ZRender`, starts the clock. After that an inline
script calls `ZMoments.init()` then `ZMenus.init()` **if they exist** (both optional; do your `onReport` registrations in `ZMoments.init`,
or simply at load time, because `ZCore` already exists when your file runs). Then it calls `ZCore.flushReports()`.

## State and clock

| | |
|---|---|
| `ZCore.S` | the engine state (getter). Never replace it; use `newGame` / `load`. |
| `ZCore.newGame(opts)` | `ZE.newGame(ZCore.legacy, opts)` (`opts`: `zooName`, `staff`, `animal`), resets log, closes screens, tells the renderer, saves. The previous log text is kept under key `wildside-zoo-v3-prevlog`. |
| `ZCore.legacy` / `ZCore.saveLegacy()` | carry-over record `{runs,best,aff,combos,hall,carry}` handed to `ZE.newGame`. Mutate it, then call `saveLegacy()`. Key `wildside-zoo-v3-legacy`. |
| `ZCore.save()` / `ZCore.load()` | key `wildside-zoo-v3`, wrapper `{v:3, savedAt, week, zoo, runId, speed, json}`. A save with another `v`, or an engine state whose `S.v` is not `ZE.SAVE_VERSION`, is ignored (fresh start). Autosave: every 4th week, 2.5 s after any `act`, on page hide, on `visibilitychange`. |
| `ZCore.speed`, `ZCore.setSpeed(1\|2)` | 2 speeds. Saved. |
| `ZCore.WEEK_MS` | `[0, 10000, 5000]` real ms per in-game week at speed 1 and 2. **Tuning knob.** The old game used the same numbers. At the owner's habit (about 80% of real time paused or in screens, mostly 2x) 20 years = 960 weeks x 5 s = 80 minutes running, so roughly 6.5 real hours total, inside the 5 to 8 hour target. |
| `ZCore.running()` | true only when the stack is empty, no report is on screen and placement is off. The renderer is told through `ZRender.setRunning` whenever this changes. |
| `ZCore.weekProgress()` | 0..1 through the current week (for a progress marker if you want one). |
| `ZCore.updateStrip()` | refresh the top strip and news line after you changed `S` outside `act`. |

Real play time is accumulated in `S.play.bySpeed[0..2]` (index 0 = paused or inside a screen, 1 = speed 1, 2 = speed 2) and `S.play.sec`.

## Acting on the game: `ZCore.act(name, ...args)`

Calls `ZE[name](S, ...args)`. Use it for every **state-changing** engine call (`build`, `startExpedition`, `resolveChoice`, `train`, `advertise`, ...).
Read-only lookups (`ZE.expOdds`, `ZE.habStatus`, `ZE.callersHere`, `ZE.hireTiers`, `ZE.crateInfo`, ...) are called on `ZE` directly.
What it does: catches exceptions (returns `{ok:false,msg}`), logs the call with trimmed arguments, counts it, **toasts the refusal message
when `ok === false`** (so do not toast it again), calls `ZRender.mapChanged()` after `build/move/remove/upgrade/buyLand` (or if the result has `map:true`),
refreshes the strip, schedules a save, and shows any reports the engine already raised. It returns the engine's result untouched
(non-`{ok}` results such as lookups pass through as ok). It does **not** re-render the open screen: call `api.rerender()` yourself.

## Screen stack

```js
const api = ZCore.push({
  id: 'animals',            // required, short, shows up in the log's "screens opened" counts
  title: 'Animals',         // optional; omit for a bare card
  render(body, api) { },    // required. Fill `body` (a div). Called on push, on rerender, and again whenever you come BACK to it. Must be safe to call many times.
  onShow(api) { },          // optional, after each render caused by push or by revealing this screen again
  onClose(api) { },         // optional, when popped, replaced or cleared
  modal: false,             // true: no Back button, centred card, you must give the player buttons and call api.pop()
  backLabel: 'Back',        // optional label for the big bottom button ('Play' for the main menu)
  cls: 'my-class'           // optional extra class on the panel
});
```
`api` = `{id, el (layer), body, push, pop(), popAll(), replace(def), rerender(), setTitle(text)}`.
`ZCore.pop()`, `ZCore.popAll()`, `ZCore.replace(def)`, `ZCore.rerender()` (top screen), `ZCore.stack()` (array of ids, bottom first), `ZCore.top()` (api of the top screen or null).

* Time is paused while the stack is non-empty (also while a report is being shown, and while `ZRender.placing()`).
* Only the top screen is visible. Going back re-renders the screen you return to, keeping its scroll position, so lists are always fresh.
* A freshly pushed screen ignores taps for about 150 ms, so a double tap cannot hit its Back button.
* Escape closes the top non-modal screen (desktop).
* To start placement from a menu: `ZCore.popAll(); ZRender.startPlacement({...}, {onPlace, onCancel})`. The clock stays paused while placing and resumes after.
* `ZCore.openMenu()` (also what a floor tap calls) runs `ZMenus.open()` when it exists, otherwise shows a placeholder menu. It does nothing if a screen is already open.
* `ZCore.screens.log()` pushes the ready-made **Game log** screen (Copy, Download, size, note box). Put it under Info.

### Worked example: a list, buttons, a sub-screen and a Back

```js
const { ui, fmt } = ZCore, S = () => ZCore.S;

function animalsScreen() {
  ZCore.push({ id: 'animals', title: 'Animals', render(body, api) {
    body.appendChild(ui.tabs(['Mine', 'Pen'], tab, t => { tab = t; api.rerender(); }));
    body.appendChild(ui.list(S().animals.map(a => ({
      img: ZSprites.animalUrl(a.sp, {}, 3),                       // pixel portrait
      title: D.SPECIES[a.sp].name,
      chips: [ui.stat('Cha', a.charm, 'charm'), ui.stat('Vig', a.vigor, 'vigor'), ui.stat('Wit', a.wit, 'wit')],
      right: [ui.stars(D.SPECIES[a.sp].rarity, 5), ui.sign(2)],  // sign level 0..3 = -- - + ++
      onTap: () => animalScreen(a.id)                              // a sub-screen on top of the list
    })), { empty: 'No animals yet.' }));
  } });
}
let tab = 'Mine';

function animalScreen(id) {
  ZCore.push({ id: 'animal', title: 'Zebra', render(body, api) {
    const a = ZE.animal(S(), id); if (!a) { api.pop(); return; }   // it may have been sold: just go back
    body.appendChild(ui.btn('Sell', () => ui.confirm('Sell for ' + fmt.money(400) + '?', () => {
      const r = ZCore.act('sellAnimal', id);                       // refusals are toasted for you
      if (r.ok) api.pop();                                         // Back to the list, which re-renders itself
    }, { danger: true, yes: 'Sell' }), { cls: 'danger big', sub: 'cannot be undone' }));
  } });                                                            // the framework adds the large Back button at the bottom
}
```

### Worked example: a report handler (a choice with options, then a reveal)

```js
// in ZMoments.init() (or at load time):
ZCore.onReport('choice', (report, done) => {
  const p = ZCore.S.projects.find(x => x.id === report.pid);
  if (!p || !p.choice) { done(); return; }                         // stale: nothing to show
  const c = p.choice;
  ZCore.push({ id: 'choice', title: c.title, modal: true, render(body, api) {
    body.appendChild(ui.el('div', { cls: 'ctext' }, c.text));
    body.appendChild(ui.choices(c.options, i => {                  // options: [{label, note, cost, costRp, odds}], unaffordable ones are greyed
      const r = ZCore.act('resolveChoice', report.pid, i);
      api.replace({ id: 'choice-result', modal: true, render(b2, a2) {      // replace keeps the stack depth the same
        b2.appendChild(ui.reveal({ title: r.good ? 'It worked!' : 'Not this time', sub: r.text, tone: r.good ? 'good' : 'bad',
          onTap: () => { a2.pop(); done(); } }));                    // done() once, after the last screen of this report
      } });
    }));
  } });
});
```

### Report queue

* The engine's `S.reports` is the queue. After every `act` and every tick, `ZCore` takes the **first** report, calls the handler registered for its `type`,
  and shows **one report at a time**. The report stays in `S.reports` (so it is saved) until `done()` is called.
* `ZCore.onReport(type, (report, done) => void)`; `'*'` registers a catch-all. Unhandled types get a plain default card (title, text, Continue).
* A handler must call `done()` exactly once (further calls are ignored). Push as many screens as you like first. Use `modal:true` screens or call
  `done()` from your last screen's tap. If a handler leaves the stack empty for about 1 s without calling `done`, the queue releases itself (and logs it), so nothing can deadlock.
  If the handler throws, the report is dropped and the queue continues.
* `ZCore.flushReports()` re-checks the queue (rarely needed; it runs after acts, ticks, `done` and when the stack empties).
* Time stays paused for the whole time a report is busy, including the gap between two screens.

## `ZCore.ui` helpers (all return DOM elements; append them to `body`)

| call | notes |
|---|---|
| `el(tag, attrs, ...children)` | attrs: `cls`/`class`, `style` (object), `html`, `tap` (click handler), `dataset`, `onxxx` handlers, anything else is an attribute. Children: nodes, strings, numbers, arrays; null/false skipped. |
| `btn(label, onTap, {icon?, sub?, disabled?, cls?, onDisabled?})` | `icon`: sprite icon name (`'m-build'`) or a data URL. `cls` words: `primary` green, `blue`, `warn`, `danger`, `ghost`, `big` (60 px), `back`. Double taps within 220 ms are ignored. |
| `grid(items, {cols?})` | `items: [{icon, label, onTap, sub?, badge?: true\|number, disabled?, cls?}]`. 3 columns by default. Big pixel icon over one word. |
| `list(rows, {empty?})` | `rows: [{img: url\|node, icon?, title, sub?, chips?: [nodes], right?: node\|string\|[nodes], onTap?, cls?, disabled?}]`. Portrait left, numbers right. |
| `stat(label, value, kind?)` | chip like `Cha 42`. `kind`: `'charm'`, `'vigor'`, `'wit'` (colours). |
| `sign(level)` | level 0..3 = `--`, `-`, `+`, `++` (coloured red to green); `null` = grey `?`. Decide your own thresholds. `ZCore.fmt.signs(level)` is the plain text. |
| `stars(n, max=5)`, `flames(n, max=3)` | pixel star and flame rows (CSS shapes, no fonts). Add class `big` to the returned element for large ones. |
| `bar(frac, {cls?, label?})` | progress bar; `cls`: `gold`, `blue`, `red`. |
| `section(text)`, `note(text)` | small header band, small grey help line. |
| `tabs(items, activeId, onChange)` | segmented control; `items` are strings or `{id,label}`. |
| `reveal({kicker?, img?, title?, big?, sub?, body?, tone?, hint?, onTap})` | the reveal card; the whole card is a tap target, with a blinking "Tap to continue" (`hint: ''` hides it). `tone`: `'good'`, `'bad'`, `'rare'` (gold frame). It pops in; add class `flip` to an inner element for a card-flip. |
| `choices(options, onPick(i, option))` | 2 to 5 big option buttons: label, `note`, cost chip (`cost` money, `costRp` research), odds bar with percent (`odds` 0..1, or a string like `'Likely'`). Options you cannot afford are greyed and ignore taps. |
| `img(url, {w?,h?,cls?})`, `icon(name\|dataUrl)` | pixelated image. `icon` shows a letter box when sprites do not exist yet. |
| `toast(msg, kind?)` | `kind`: `'good'`, `'bad'`. Max 3 at once, about 2.4 s. |
| `confirm(text, onYes, {yes?, no?, danger?, title?})` | modal yes/no. |

`ZCore.fmt`: `money(n)` (`$1,234`, `-$5`, `$12.3M`), `num(n)`, `signs(level)`, `stars(n,max)` (text), `date(S)` (`Y3 Mar w2`), `dateLong(S)` (the engine's text), `duration(sec)`.

## CSS classes you can put on your own elements

`.panel .ptitle .pbody .pfoot` (frame), `.btn` (+ `.primary .blue .warn .danger .ghost .big .back .disabled`), `.btnrow` (equal-width buttons in a row),
`.grid .gbox`, `.list .row .portrait .main .t .s .right`, `.chips .chip` (`.charm .vigor .wit`), `.sg` (`.m2 .m1 .p1 .p2 .q`), `.stars .star .flames .flame` (`.off`, `.big`),
`.sec`, `.note`/`.muted`, `.center`, `.stack` (vertical gap), `.tabs .tab`, `.field` (text input or textarea), `.bar`, `.choices .opt .meta .cost .odds`,
`.rcard` (`.kicker .pic .rtitle .big .rsub .hint`, `.good .bad .rare`), `.ctext` (centred paragraph in a modal), `.empty`, `.pop` and `.flip` animations, `.toast`.
Sprite images need class `px` (`image-rendering: pixelated`); the helpers add it. Colour variables are on `:root` (`--cream`, `--ink`, `--green`, `--blue`, `--orange`, `--red`, `--gold`, `--charm`, `--vigor`, `--wit`, `--bd`).
Text inside a panel is 15 px bold; keep labels to one or two words.

## Placement bar and note

`#placement-bar` (three big buttons, 58 px) and `#placement-note` are empty overlays at the bottom of the floor. The renderer fills them.
Styled: any `<button>` inside `#placement-bar` gets the chunky look (the second one is green); `#placement-note` is a cream pill above the bar. Both hide when empty.

## Log

Kept inside the save (`S.glog`, `S.tele`, `S.logQ`, `S.did`), so it survives reloads. The engine's own event log `S.elog` is drained into it every tick/act as `e:<type>` lines.

* `ZCore.log(type, data)` add an event line `{w:week, t:type, ...data}`. The shell logs: `act` (name, trimmed args, ok, msg), `screen` (id), `report` (type, key), `speed`, `tap`, `note`, `start`.
  Moments/Menus may add their own, for example `ZCore.log('pick', {key, option})`, but acts already cover everything that goes through `ZCore.act`.
* Every 12 weeks the quarter is closed with `ZE.snapshot(S)` plus the quarter's counts of screens opened, acts, refusals and reports. Only the latest 6 quarters keep every event line;
  older ones keep snapshot and counts. The current quarter keeps at most 800 lines. Typical log is a few KB per year of play.
* `ZCore.logText()` (plain text for pasting), `ZCore.copyLog()` (clipboard, falls back to a hidden textarea; toasts the result), `ZCore.downloadLog()` (a `.txt` file), `ZCore.addNote(text)` (the "Note for Claude" box, shown at the top of the log).

## Test hook `window.ZT`

`ZT.S` (getter), `ZT.tick(n)` (n weeks, same path as the clock: logs, autosave, reports), `ZT.act`, `ZT.stack()`, `ZT.newGame(opts)`, `ZT.openMenu()`, `ZT.running()`, `ZT.setSpeed(n)`,
`ZT.WEEK_MS` (mutable, shrink it to make tests fast), `ZT.popAll()`, `ZT.flush()`, `ZT.logText()`, `ZT.save()`, `ZT.load()`, `ZT.errors` (array of captured window errors, unhandled promise rejections,
and exceptions the shell caught inside screens, handlers, ticks and actions). A tick with engine reports will open default cards (or your handlers); register `ZCore.onReport('*', (r, done) => done())` in tests to skip them.

## Page contract and what is where

`#app` (column, max 430 px, centred, full height) contains `#strip` (date and rank stars on line one; money and visitors per week on line two), `#stage` with `#floor-wrap` (`<canvas id="floor">`, `#placement-note`, `#placement-bar`),
`#news` (one line, the newest `S.news` entry; hidden while a screen is open), `#screens` (layers for the stack, inside `#stage` so the top strip stays visible) and `#toasts`.
No page scroll, no pinch zoom (`user-scalable=no`, `gesturestart` blocked), safe-area padding on every edge, `touch-action: manipulation`; the canvas has `touch-action: none`.
Until `render.js` exists the floor is a plain green pattern and a tap on it still opens the menu.
Web app: `manifest.webmanifest` (standalone, portrait), `icons/icon-180/192/512.png` and a maskable 512 (made by `node test/shell-icons.js`, a pixel paw), iOS meta tags. Everything is relative paths, no network, no cookies.
(Opening from `file://`: WebKit refuses to fetch the manifest from a local file; harmless, it is only read when the game is served or wrapped.)

## Not done / notes

* The Menus teammate owns System (save, speed, how to play, new zoo): call `ZCore.save()`, `ZCore.setSpeed()`, `ZCore.newGame()` and `ZCore.confirm`. A placeholder menu with those four actions is shown until `ZMenus` exists.
* No speed control is on the top strip (the brief says nothing else there); speed lives in System.
* Loading a save starts the clock immediately (no "paused on load" state); the first week takes 5 to 10 s anyway.
* `index.html` loads `test/shell-demo.js` only when the address has `?demo=1`; delete that small snippet in the App Store build.
