/* Wildside Zoo: the canvas floor (camera, drawing, depth sort, walkers, on-floor icons, pop-ups, placement mode, taps).
   Owned by the Renderer. One global: ZRender. Reads the game state through getState(); the only thing it ever changes
   on the state is emptying S.fx after showing the pop-ups. All art comes from ZSprites; every call is guarded, and a
   built-in set of flat fallback shapes is used for anything ZSprites cannot supply, so a missing or half-finished
   sprites file never breaks the floor. All geometry comes from ZGeo; grid size and ownership come from ZD / ZE. */
(function (root) {
  'use strict';
  const G = root.ZGeo, D = root.ZD, Z = root.ZE, R = {};
  const W = G.W, HH = G.HH, HW = G.HW || W / 2;
  const DIR6 = G.EDGES.map(e => e[0]);
  const key = (q, r) => q + ',' + r;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + (c || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const strHash = s => { let h = 7; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const now = () => (root.performance && performance.now ? performance.now() : Date.now());

  let canvas = null, ctx = null, buf = null, bctx = null, opts = {}, started = false;
  let running = true, zoom = 1, N = 2, dpr = 1, devW = 0, devH = 0, cssW = 0, cssH = 0, vw = 0, vh = 0;
  const cam = { x: 0, y: 0, vx: 0, vy: 0, tx: null, ty: null, placed: false };
  let M = null, P = null, mapDirty = true, clock = 0, slowAt = 0, lastT = 0, lastWeek = null, shopTurn = 0, engineMoneyFx = false;
  let animals = {}, walkers = [], gatePeople = {}, floaters = [], statuses = {}, lastS = null;
  const stats = { sprites: 0, fps: 0, frameMs: 0, frames: 0, acc: 0, accMs: 0, warned: {} };
  const st = () => { try { return opts.getState ? opts.getState() : null; } catch (e) { return null; } };

  // ---------------------------------------------------------------- sprites: guarded access with built-in fallbacks
  function mk(w, h, ax, ay, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x); return { c: c, w: w, h: h, ax: ax, ay: ay }; }
  const fbCache = {};
  const fb = (k, make) => fbCache[k] || (fbCache[k] = make());
  const hue = (s, sat, lig) => 'hsl(' + (strHash(s) % 360) + ',' + (sat || 55) + '%,' + (lig || 55) + '%)';
  function hexSpan(y) { // [left, right) x extent of the hex polygon on pixel row y (-HH .. HH-1), from ZGeo.CORNERS (no symmetry assumed)
    const yc = y + 0.5, C = G.CORNERS; let lo = 1e9, hi = -1e9;
    for (let i = 0; i < 6; i++) { const a = C[i], b = C[(i + 1) % 6]; if ((a[1] <= yc) === (b[1] <= yc)) continue; const x = a[0] + (b[0] - a[0]) * (yc - a[1]) / (b[1] - a[1]); if (x < lo) lo = x; if (x > hi) hi = x; }
    return hi < lo ? [0, 0] : [Math.round(lo), Math.round(hi)];
  }
  function hexFill(x, cx, cy, col) { x.fillStyle = col; for (let y = -HH; y < HH; y++) { const s = hexSpan(y); if (s[1] > s[0]) x.fillRect(cx + s[0], cy + y, s[1] - s[0], 1); } }
  const FB = {
    tile: function (kind, seed) {
      kind = String(kind); const v = kind === 'grass' ? (seed || 0) % 3 : 0;
      return fb('t:' + kind + v, () => mk(W, HH * 2 + 3, HW, HH, x => {
        let col = '#6cbf4b';
        if (kind === 'grass') col = ['#6cbf4b', '#66b947', '#72c450'][v]; else if (kind === 'path') col = '#dcc898'; else if (kind === 'locked') col = '#3c6a44';
        else if (kind === 'water') col = '#4a9ad6'; else if (kind.indexOf('hab:') === 0) { const b = D.BIOMES[kind.slice(4)]; col = b ? b.color : '#bbb'; }
        hexFill(x, HW, HH + 3, 'rgba(0,0,0,0.35)'); hexFill(x, HW, HH, col);
      }));
    },
    fence: function (biome, edge) {
      return fb('f:' + biome + edge, () => {
        const e = G.EDGES[edge], a = G.CORNERS[e[1]], b = G.CORNERS[e[2]], H = 7;
        const s = mk(W + 2, HH * 2 + H + 2, HW + 1, HH + H, x => {
          const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
          for (let i = 0; i <= steps; i++) { const px = Math.round(a[0] + (b[0] - a[0]) * i / steps), py = Math.round(a[1] + (b[1] - a[1]) * i / steps); x.fillStyle = '#5b4630'; x.fillRect(HW + 1 + px - 1, HH + H + py - H, 2, H); x.fillStyle = '#8a6c48'; x.fillRect(HW + 1 + px - 1, HH + H + py - H, 2, 2); }
        });
        s.sortDy = (a[1] + b[1]) / 2; return s;
      });
    },
    building: function (id) { return fb('b:' + id, () => mk(30, 34, 15, 26, x => { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(2, 26, 28, 6); x.fillStyle = hue(id, 50, 62); x.fillRect(2, 10, 26, 20); x.fillStyle = hue(id, 50, 48); x.fillRect(16, 10, 12, 20); x.fillStyle = hue(id + 'r', 60, 45); x.fillRect(0, 2, 30, 9); x.fillStyle = '#3a2a22'; x.fillRect(7, 21, 5, 9); })); },
    entrance: function () { return fb('gate', () => mk(60, 36, 30, 32, x => { x.fillStyle = '#7a5a3c'; x.fillRect(2, 8, 6, 26); x.fillRect(52, 8, 6, 26); x.fillStyle = '#c0453a'; x.fillRect(0, 2, 60, 9); x.fillStyle = '#f2d36b'; x.fillRect(22, 4, 16, 5); })); },
    animal: function (sp, o) { o = o || {}; const j = o.juv ? 1 : 0; return fb('a:' + sp + j + (o.variant ? 'v' : ''), () => { const w = j ? 10 : 16, h = j ? 8 : 12; return mk(w, h, w / 2, h, x => { x.fillStyle = hue(sp + (o.variant ? 'v' : ''), 50, 55); x.fillRect(1, 1, w - 2, h - 4); x.fillRect(w - 5, 0, 5, 5); x.fillStyle = '#2b2520'; x.fillRect(2, h - 3, 2, 3); x.fillRect(w - 5, h - 3, 2, 3); x.fillRect(w - 2, 1, 1, 1); }); }); },
    person: function (kind, o) { o = o || {}; const k = kind === 'visitor' ? 'v' + ((o.seed || 0) % 8) : kind; return fb('p:' + k, () => mk(8, 16, 4, 16, x => { x.fillStyle = '#f0c8a0'; x.fillRect(2, 0, 4, 5); x.fillStyle = hue(k, 65, 50); x.fillRect(1, 5, 6, 7); x.fillStyle = '#34405a'; x.fillRect(2, 12, 2, 4); x.fillRect(4, 12, 2, 4); })); },
    deco: function (kind) {
      return fb('d:' + kind, () => {
        if (kind === 'tree') return mk(18, 26, 9, 25, x => { x.fillStyle = '#6b4a2e'; x.fillRect(7, 16, 4, 9); x.fillStyle = '#2f7d3a'; x.fillRect(2, 2, 14, 16); x.fillStyle = '#3f9a48'; x.fillRect(4, 0, 10, 12); });
        if (kind === 'bush') return mk(12, 8, 6, 8, x => { x.fillStyle = '#3a8d44'; x.fillRect(0, 2, 12, 6); x.fillRect(2, 0, 8, 3); });
        if (kind === 'rock') return mk(10, 7, 5, 7, x => { x.fillStyle = '#8d8f98'; x.fillRect(0, 2, 10, 5); x.fillRect(2, 0, 6, 3); });
        if (kind === 'lamp') return mk(4, 18, 2, 18, x => { x.fillStyle = '#3d3d48'; x.fillRect(1, 4, 2, 14); x.fillStyle = '#ffe9a0'; x.fillRect(0, 0, 4, 4); });
        return mk(10, 5, 5, 4, x => { x.fillStyle = '#f2e25c'; x.fillRect(1, 1, 2, 2); x.fillStyle = '#f08fb1'; x.fillRect(5, 0, 2, 2); x.fillStyle = '#ffffff'; x.fillRect(8, 2, 2, 2); });
      });
    },
    icon: function (name) { return fb('i:' + name, () => mk(9, 9, 4, 9, x => { x.fillStyle = '#1d1a22'; x.fillRect(1, 0, 7, 9); x.fillRect(0, 1, 9, 7); x.fillStyle = hue(name, 85, 62); x.fillRect(1, 1, 7, 7); })); }
  };
  // A half-finished sprites file hands back one shared placeholder for getters it has not drawn yet. Spot that by asking each
  // getter for two different things: if both come back as the very same canvas, that getter is not ready, so use the built-in shapes.
  const PROBE = { tile: [['grass', 0], ['path']], fence: [['savanna', 0], ['savanna', 2]], building: [[D.FAC_ORDER[0], {}], [D.FAC_ORDER[1], {}]], deco: [['tree', 0], ['flowers', 0]], icon: [['coin'], ['heart']], person: [['visitor', { seed: 1 }], ['trader', {}]], animal: [['zebra', {}], ['lion', {}]] };
  let readyMap = null;
  function ready(fn) {
    const s = root.ZSprites; if (!s || typeof s[fn] !== 'function') return false;
    if (!readyMap) readyMap = {};
    if (readyMap[fn] == null) {
      let okay = true;
      try {
        if (fn === 'entrance') { const e = s.entrance(), o = s.icon ? s.icon('coin') : null; okay = !!(e && e.c && e.c.width >= 20 && (!o || o.c !== e.c)); }
        else { const p = PROBE[fn], x = s[fn](p[0][0], p[0][1]), y = s[fn](p[1][0], p[1][1]); okay = !!(x && y && x.c && y.c && x.c !== y.c); }
      } catch (e) { okay = false; }
      readyMap[fn] = okay;
    }
    return readyMap[fn];
  }
  function spr(fn, a, b) {
    const s = root.ZSprites;
    if (ready(fn)) {
      try { const r = s[fn](a, b); if (r && r.c && r.c.width > 0) return r; }
      catch (e) { if (!stats.warned[fn]) stats.warned[fn] = String(e && e.message || e); }
    }
    return FB[fn](a, b);
  }
  const usingReal = () => ready('tile') && ready('fence') && ready('building') && ready('person') && ready('animal');
  const spriteState = () => { const o = {}; ['tile', 'fence', 'building', 'entrance', 'deco', 'icon', 'person', 'animal'].forEach(f => { o[f] = ready(f); }); return o; };
  const frames = name => { const s = root.ZSprites; const n = s && s[name]; return n > 0 ? n : 1; };
  const dimCache = new Map();
  function dimmed(s) {
    let d = dimCache.get(s.c);
    if (!d) { const c = document.createElement('canvas'); c.width = s.c.width; c.height = s.c.height; const x = c.getContext('2d'); x.drawImage(s.c, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(22,44,52,0.5)'; x.fillRect(0, 0, c.width, c.height); d = { c: c, w: s.w, h: s.h, ax: s.ax, ay: s.ay }; dimCache.set(s.c, d); }
    return d;
  }
  // tiny pixel digits for the floating pop-ups (numbers only, never words)
  const GLYPH = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111', '+': '000010111010000', '-': '000000111000000', '.': '000000000000010', 'k': '100101110101101', 'm': '000111111101101' };
  const textCache = {};
  function textSprite(str, col) {
    const k = str + col; if (textCache[k]) return textCache[k];
    const w = str.length * 4 + 1, h = 7;
    const put = (x, ox, oy, c) => { x.fillStyle = c; for (let i = 0; i < str.length; i++) { const g = GLYPH[str[i]]; if (!g) continue; for (let p = 0; p < 15; p++) if (g[p] === '1') x.fillRect(ox + i * 4 + p % 3, oy + (p / 3 | 0), 1, 1); } };
    return (textCache[k] = mk(w, h, 0, h, x => { for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) put(x, dx, dy, '#1d1a22'); put(x, 1, 1, col); }));
  }
  const shortNum = v => { v = Math.round(v); const a = Math.abs(v); const s = a >= 1e6 ? (a / 1e6).toFixed(a < 1e7 ? 1 : 0) + 'm' : a >= 1e4 ? Math.round(a / 1e3) + 'k' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'k' : String(a); return (v < 0 ? '-' : '+') + s; };
  const maskCache = {};
  const hexMask = col => maskCache[col] || (maskCache[col] = mk(W, HH * 2, HW, HH, x => hexFill(x, HW, HH, col)));
  // one shared outline around a set of cells, baked to a small canvas (two frames for a gentle shimmer)
  function outlineSprite(cells, col, col2) {
    const set = {}; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    cells.forEach(c => { set[key(c[0], c[1])] = 1; const p = G.toScreen(c[0], c[1]); x0 = Math.min(x0, p.x - HW); x1 = Math.max(x1, p.x + HW); y0 = Math.min(y0, p.y - HH); y1 = Math.max(y1, p.y + HH); });
    x0 -= 2; y0 -= 2; const w = x1 - x0 + 4, h = y1 - y0 + 5, out = [];
    for (let f = 0; f < 2; f++) out.push(mk(w, h, 0, 0, x => {
      for (let pass = 0; pass < 2; pass++) cells.forEach(c => {
        const p = G.toScreen(c[0], c[1]);
        G.EDGES.forEach(e => {
          if (set[key(c[0] + e[0][0], c[1] + e[0][1])]) return;
          const a = G.CORNERS[e[1]], b = G.CORNERS[e[2]], steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
          for (let i = 0; i <= steps; i++) {
            const px = clamp(Math.round(a[0] + (b[0] - a[0]) * i / steps), -HW, HW - 1), py = clamp(Math.round(a[1] + (b[1] - a[1]) * i / steps), -HH, HH - 1);
            const X = p.x + px - x0, Y = p.y + py - y0;
            if (pass === 0) { x.fillStyle = 'rgba(20,18,30,0.55)'; x.fillRect(X - 1, Y - 1, 3, 3); }
            else { x.fillStyle = (((i + p.x + py) >> 2) + f) & 1 ? col : (col2 || col); x.fillRect(X, Y, 1, 1); }
          }
        });
      });
    }));
    return { f: out, x: x0, y: y0, w: w, h: h };
  }

  // ---------------------------------------------------------------- the map cache (floor, statics, walk graph)
  const toCol = (q, r) => Z.toCol ? Z.toCol(q, r) : q + (r - (r & 1)) / 2;
  const fromOffset = (c, r) => Z.fromOffset ? Z.fromOffset(c, r) : [c - (r - (r & 1)) / 2, r];
  function inGrid(S, q, r) {
    if (typeof Z.inGrid === 'function') { try { return !!(Z.inGrid.length >= 3 ? Z.inGrid(S, q, r) : Z.inGrid(q, r)); } catch (e) { /* fall through */ } }
    const c = toCol(q, r); return r >= 0 && r < D.GRID_H && c >= 0 && c < D.GRID_W;
  }
  const itemCells = it => { try { return Z.cells(it); } catch (e) { return [[it.q, it.r]]; } };
  function activeCombos(S) { try { const c = Z.c(S); return (c && c.active) || []; } catch (e) { return []; } }
  function signature(S) {
    let s = D.GRID_W + 'x' + D.GRID_H + '|';
    (S.items || []).forEach(i => { s += i.id + i.k + i.t + ',' + i.q + ',' + i.r + ',' + (i.rot || 0) + ';'; });
    let own = 0; for (let r = 0; r < D.GRID_H; r++) for (let c = 0; c < D.GRID_W; c++) { const p = fromOffset(c, r); if (Z.inLand(S, p[0], p[1])) own += 1 + ((r * 31 + c) % 7); }
    s += '|' + own + '|' + activeCombos(S).map(a => a.id + '@' + a.anchor).join(',') + '|' + (usingReal() ? 1 : 0);
    return s;
  }
  function dijkstra(m, src, cost) {
    const dist = {}, prev = {}, done = {}, open = [src]; dist[src] = 0;
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
      const k = open.splice(bi, 1)[0]; done[k] = 1;
      const nb = m.nodes[k].nb;
      for (let i = 0; i < nb.length; i++) { const nk = nb[i]; if (done[nk]) continue; const d = dist[k] + cost(nk); if (dist[nk] == null) open.push(nk); if (dist[nk] == null || d < dist[nk]) { dist[nk] = d; prev[nk] = k; } }
    }
    return { dist: dist, prev: prev };
  }
  function chain(dj, to) { const out = []; let k = to; while (k != null) { out.push(k); k = dj.prev[k]; } return out.reverse(); }
  function route(a, b) {
    if (!M.nodes[a] || !M.nodes[b]) return null;
    const dj = M.routes[a] || (M.routes[a] = dijkstra(M, a, k => M.path[k] ? 1 : 3));
    return dj.dist[b] == null ? null : chain(dj, b);
  }

  function rebuild(S) {
    const m = { sig: signature(S), nodes: {}, path: {}, routes: {}, statics: [], habs: {}, items: {}, occ: {}, combos: [], dests: [], real: usingReal() };
    // the scroll limit is the screen bounding box of the owned hexes plus a margin, so the player cannot scroll far into nothing
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, gx0 = 1e9, gy0 = 1e9, gx1 = -1e9, gy1 = -1e9;
    for (let r = 0; r < D.GRID_H; r++) for (let c = 0; c < D.GRID_W; c++) {
      const a = fromOffset(c, r), p = G.toScreen(a[0], a[1]); if (!inGrid(S, a[0], a[1])) continue;
      gx0 = Math.min(gx0, p.x); gx1 = Math.max(gx1, p.x); gy0 = Math.min(gy0, p.y); gy1 = Math.max(gy1, p.y);
      if (Z.inLand(S, a[0], a[1])) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    }
    if (x0 > 1e8) { x0 = gx0; x1 = gx1; y0 = gy0; y1 = gy1; }
    const bnd = m.bounds = { x0: x0 - HW - 22, x1: x1 + HW + 22, y0: y0 - HH - 62, y1: y1 + HH + 44 };
    // the floor canvas covers everything the camera can ever show (also when the view is bigger than the scroll area), so forest
    // tiles reach the screen edges at every scroll position
    const covW = Math.max(vw, 430), covH = Math.max(vh, 900), slackX = Math.max(0, (covW - (bnd.x1 - bnd.x0)) / 2) + 8, slackY = Math.max(0, (covH - (bnd.y1 - bnd.y0)) / 2) + 8;
    const fx0 = Math.floor(bnd.x0 - slackX), fy0 = Math.floor(bnd.y0 - slackY), fw = Math.ceil(bnd.x1 - bnd.x0 + slackX * 2), fh = Math.ceil(bnd.y1 - bnd.y0 + slackY * 2);
    m.cover = { w: covW, h: covH };
    const cells = [], grid = {}; let q0 = 1e9, q1 = -1e9, r0 = 1e9, r1 = -1e9;
    [[fx0 - W, fy0 - W], [fx0 + fw + W, fy0 - W], [fx0 - W, fy0 + fh + W], [fx0 + fw + W, fy0 + fh + W]].forEach(p => { const a = G.toAxial(p[0], p[1]); q0 = Math.min(q0, a.q); q1 = Math.max(q1, a.q); r0 = Math.min(r0, a.r); r1 = Math.max(r1, a.r); });
    for (let r = r0 - 1; r <= r1 + 1; r++) for (let q = q0 - 1; q <= q1 + 1; q++) {
      const p = G.toScreen(q, r), g = inGrid(S, q, r); if (!g && (p.x < fx0 - W || p.x > fx0 + fw + W || p.y < fy0 - W || p.y > fy0 + fh + W * 2)) continue;
      const cell = { q: q, r: r, x: p.x, y: p.y, k: key(q, r), grid: g, owned: g && !!Z.inLand(S, q, r) }; cells.push(cell); grid[cell.k] = cell;
    }
    cells.sort((a, b) => a.y - b.y || a.x - b.x); // back to front on screen: the order tiles must be laid so each front lip is covered
    m.cells = grid;
    (S.items || []).forEach(it => { m.items[it.id] = it; itemCells(it).forEach(c => { m.occ[key(c[0], c[1])] = it; }); });
    // entrance
    let ent = null;
    if (typeof Z.entrance === 'function') { try { const e = Z.entrance(S); if (e) ent = grid[key(e.q != null ? e.q : e[0], e.r != null ? e.r : e[1])] || null; } catch (e) { ent = null; } }
    if (!ent) { // fallback for an engine without an entrance: a free owned hex on the front (bottom) row, near the middle
      let sx = 0, n = 0, maxR = -1e9; const free = cells.filter(c => c.owned && !m.occ[c.k]); cells.forEach(c => { if (c.owned) { sx += c.x; n++; } }); free.forEach(c => { maxR = Math.max(maxR, c.r); });
      free.filter(c => c.r === maxR).forEach(c => { if (!ent || Math.abs(c.x - sx / n) < Math.abs(ent.x - sx / n)) ent = c; });
    }
    m.ent = ent;
    // walk graph: owned, unbuilt hexes
    cells.forEach(c => { if (c.owned && !m.occ[c.k]) m.nodes[c.k] = c; });
    if (ent && !m.nodes[ent.k] && !m.occ[ent.k]) m.nodes[ent.k] = ent;
    Object.keys(m.nodes).forEach(k => { const c = m.nodes[k]; c.nb = []; DIR6.forEach(d => { const nk = key(c.q + d[0], c.r + d[1]); if (m.nodes[nk]) c.nb.push(nk); }); });
    // a short road leading in from outside the map
    m.road = [];
    if (ent) { // step to whichever down-screen neighbour keeps the road straight below the gate
      const down = DIR6.filter(d => G.toScreen(d[0], d[1]).y > HH * 0.9); let q = ent.q, r = ent.r;
      for (let i = 0; i < 40 && down.length; i++) { let best = null, bx = 0; down.forEach(d => { const nx = G.toScreen(q + d[0], r + d[1]).x; if (!best || Math.abs(nx - ent.x) < Math.abs(bx - ent.x)) { best = d; bx = nx; } }); q += best[0]; r += best[1]; const c = grid[key(q, r)]; if (!c || c.grid) break; c.road = true; m.road.push(c); }
    }
    const roadAll = m.road; m.road = roadAll.slice(0, 8); // people only walk the first stretch (it is off screen beyond that)
    const nearRoad = c => roadAll.some(o => Math.abs(o.x - c.x) < W * 0.95 && Math.abs(o.y - c.y) < W * 0.95);
    // paths: shared trunks from the entrance to one side of every habitat and facility
    const order = (S.items || []).slice();
    if (ent && m.nodes[ent.k]) {
      m.path[ent.k] = 1;
      order.sort((a, b) => { const pa = G.toScreen(a.q, a.r), pb = G.toScreen(b.q, b.r); return (Math.abs(pa.x - ent.x) + Math.abs(pa.y - ent.y) * 2) - (Math.abs(pb.x - ent.x) + Math.abs(pb.y - ent.y) * 2); });
      order.forEach(it => {
        const cands = [];
        itemCells(it).forEach(c => { const cp = G.toScreen(c[0], c[1]); DIR6.forEach(d => { const nk = key(c[0] + d[0], c[1] + d[1]); if (m.nodes[nk] && nk !== ent.k) cands.push({ k: nk, cx: cp.x, cy: cp.y }); }); });
        const info = { it: it, stands: [], main: null, cands: cands }; m.dests.push(info);
        if (!cands.length) return;
        const dj = dijkstra(m, ent.k, k => (m.path[k] ? 0.3 : 1) + hash(m.nodes[k].q, m.nodes[k].r, 5) * 0.05);
        let best = null; cands.forEach(c => { if (dj.dist[c.k] != null && (!best || dj.dist[c.k] < dj.dist[best.k])) best = c; });
        if (!best) return;
        chain(dj, best.k).forEach(k => { m.path[k] = 1; }); info.main = best;
      });
      m.dests.forEach(info => { if (!info.main) return; const seen = {}; info.stands.push(info.main); seen[info.main.k] = 1; info.cands.forEach(c => { if (m.path[c.k] && !seen[c.k]) { seen[c.k] = 1; info.stands.push(c); } }); });
    }
    m.pathKeys = Object.keys(m.path);
    // floor canvas
    // (floor rectangle fx0, fy0, fw, fh was worked out above with the bounds)
    const fl = document.createElement('canvas'); fl.width = fw; fl.height = fh; const fc = fl.getContext('2d');
    const lockedT = spr('tile', 'locked', 0);
    try { const pc = document.createElement('canvas'); pc.width = pc.height = 1; const px = pc.getContext('2d'); px.drawImage(lockedT.c, -Math.round(lockedT.ax), -Math.round(lockedT.ay) + 2); const d = px.getImageData(0, 0, 1, 1).data; m.bg = d[3] > 200 ? 'rgb(' + Math.round(d[0] * 0.8) + ',' + Math.round(d[1] * 0.8) + ',' + Math.round(d[2] * 0.82) + ')' : '#2c4f3a'; } catch (e) { m.bg = '#2c4f3a'; }
    fc.fillStyle = m.bg; fc.fillRect(0, 0, fw, fh);
    const put = (s, x, y) => fc.drawImage(s.c, Math.round(x - s.ax) - fx0, Math.round(y - s.ay) - fy0);
    cells.forEach(c => {
      const it = m.occ[c.k], seed = Math.floor(hash(c.q, c.r, 1) * 1000); let t;
      if (it && c.owned) t = it.k === 'hab' ? 'hab:' + it.t : 'path'; else if (!c.grid) t = c.road ? 'path' : 'locked'; else if (!c.owned) t = 'locked'; else if (m.path[c.k]) t = 'path'; else t = 'grass';
      c.tile = t; put(spr('tile', t, seed), c.x, c.y);
    });
    m.floor = fl; m.fx0 = fx0; m.fy0 = fy0;
    // statics: fences, buildings, gate, decorations
    const add = (s, x, y, k, o) => { const e = { s: s, x: x, y: y, key: k, a: 1 }; if (o) Object.assign(e, o); m.statics.push(e); return e; };
    const DEF_DY = G.EDGES.map(e => (G.CORNERS[e[1]][1] + G.CORNERS[e[2]][1]) / 2);
    m.fenceDy = (s, ei) => (typeof s.sortDy === 'number' ? s.sortDy : DEF_DY[ei]);
    (S.items || []).forEach(it => {
      const cs = itemCells(it), set = {}; cs.forEach(c => { set[key(c[0], c[1])] = 1; });
      if (it.k === 'hab') {
        const h = { it: it, cells: [], top: null }; m.habs[it.id] = h;
        cs.forEach(c => { const p = G.toScreen(c[0], c[1]); h.cells.push({ q: c[0], r: c[1], x: p.x, y: p.y, nb: [] }); });
        h.cells.forEach((c, i) => { h.cells.forEach((o, j) => { if (i !== j && DIR6.some(d => c.q + d[0] === o.q && c.r + d[1] === o.r)) c.nb.push(j); }); });
        let sx = 0; h.cells.forEach(c => { sx += c.x; }); sx /= h.cells.length;
        h.cells.forEach(c => { if (!h.top || c.y < h.top.y || (c.y === h.top.y && Math.abs(c.x - sx) < Math.abs(h.top.x - sx))) h.top = c; });
        const behind = DIR6.filter(d => G.toScreen(d[0], d[1]).y < -HH * 0.6); let bestScore = 1e9;
        h.cells.forEach(c => { let sc = (c.y - h.top.y) * 0.5; behind.forEach(d => { const k2 = key(c.q + d[0], c.r + d[1]); if (set[k2]) sc += 1000; else if (m.occ[k2]) sc += 60; }); if (sc < bestScore) { bestScore = sc; h.mark = c; } });
        cs.forEach(c => { const p = G.toScreen(c[0], c[1]); G.EDGES.forEach((e, ei) => { if (set[key(c[0] + e[0][0], c[1] + e[0][1])]) return; const s = spr('fence', it.t, ei); add(s, p.x, p.y, G.depth(c[0], c[1], m.fenceDy(s, ei)), { id: it.id }); }); });
      } else {
        const p = G.toScreen(it.q, it.r); add(spr('building', it.t, {}), p.x, p.y, G.depth(it.q, it.r, 0) + 0.2, { id: it.id });
      }
    });
    m.dests.forEach(d => { if (m.habs[d.it.id]) m.habs[d.it.id].dest = d; });
    if (ent) { const s = spr('entrance'); add(s, ent.x, ent.y, G.depth(ent.q, ent.r, typeof s.sortDy === 'number' ? s.sortDy : 0), { gate: true }); m.gate = s; }
    const standKeys = {}; m.dests.forEach(d => d.stands.forEach(s => { standKeys[s.k] = 1; }));
    const gs = m.gate, gateBox = gs && ent ? { x0: ent.x - gs.ax - 8, x1: ent.x - gs.ax + gs.c.width + 8, y0: ent.y - gs.ay - 6, y1: ent.y - gs.ay + gs.c.height + 16 } : null;
    const entNb = c => ent && DIR6.some(d => c.q === ent.q + d[0] && c.r === ent.r + d[1]);
    // nothing decorative where the gate arch or its pillars would hide it (or stand in front of it), nor on the hexes touching the gate
    const addDeco = (sp, x, y, k) => { if (gateBox && x > gateBox.x0 && x < gateBox.x1 && y > gateBox.y0 && y < gateBox.y1) return; add(sp, x, y, k); };
    const builtAbove = c => DIR6.some(d => G.toScreen(d[0], d[1]).y < -HH * 0.6 && m.occ[key(c.q + d[0], c.r + d[1])]) || (ent && Math.abs(c.x - ent.x) < W * 1.3 && Math.abs(c.y - ent.y) < HH * 3.5);
    cells.forEach(c => {
      if (c.road || (m.occ[c.k] && c.owned) || entNb(c)) return;
      const h = hash(c.q, c.r, 11), ox = Math.round((hash(c.q, c.r, 12) - 0.5) * 18), oy = Math.round((hash(c.q, c.r, 13) - 0.5) * HH * 0.6), seed = Math.floor(h * 9973);
      if (!c.owned) { // wild land: dim trees, thicker outside the map
        if (nearRoad(c)) return;
        const dens = c.grid ? 0.42 : 0.6; if (h < dens) addDeco(dimmed(spr('deco', h < dens * 0.75 ? 'tree' : 'bush', seed)), c.x + ox, c.y + oy, c.y + oy);
        if (!c.grid && hash(c.q, c.r, 14) < 0.35) addDeco(dimmed(spr('deco', 'tree', seed + 3)), c.x - ox, c.y - oy + 2, c.y - oy + 2);
        return;
      }
      if (ent && c.k === ent.k) return;
      if (m.path[c.k]) { if (!standKeys[c.k] && h < 0.16) addDeco(spr('deco', 'lamp', seed), c.x + (ox < 0 ? -17 : 17), c.y - 1, c.y - 1); return; }
      let kind = h < 0.2 ? 'tree' : h < 0.38 ? 'bush' : h < 0.6 ? 'flowers' : h < 0.68 ? 'rock' : null;
      if (kind === 'tree' && builtAbove(c)) kind = 'bush';
      if (!kind) return;
      addDeco(spr('deco', kind, seed), c.x + ox, c.y + oy, c.y + oy);
      if (kind === 'flowers') addDeco(spr('deco', 'flowers', seed + 1), c.x - Math.round(ox * 0.8) + 3, c.y - oy + 1, c.y - oy + 1);
    });
    m.statics.sort((a, b) => a.key - b.key);
    // combo outlines
    const COL = [['#ffd84a', '#fff3a8'], ['#7ef0ff', '#d8fbff'], ['#ff9ad5', '#ffd9ee'], ['#b6ff6a', '#e6ffc4'], ['#ffb056', '#ffe0b8'], ['#ffffff', '#cfd8ff']];
    activeCombos(S).forEach(a => {
      const cs = []; [a.anchor].concat(a.members || []).forEach(id => { const it = m.items[id]; if (it) itemCells(it).forEach(c => cs.push(c)); });
      if (!cs.length) return; const ci = Math.max(0, D.COMBOS.findIndex(c => c.id === a.id)) % COL.length;
      m.combos.push(outlineSprite(cs, COL[ci][0], COL[ci][1]));
    });
    M = m; mapDirty = false;
    if (!cam.placed) { cam.placed = true; aimCamera(S); }
    clampCam();
    reseat(S); if (P) evalPlacement();
  }

  // ---------------------------------------------------------------- actors: animals, walkers, gate people
  const CAP = 2; // animals drawn per hex
  function placeInCell(a, h, ci, snap) {
    const c = h.cells[ci]; let other = null; for (const id in animals) { const o = animals[id]; if (o !== a && o.hab === h.it.id && o.cell === ci) other = o; }
    // two standing spots per hex (back-left and front-right) so a pair never stands on top of each other
    const slot = other ? 1 - other.slot : (Math.random() < 0.5 ? 0 : 1), oy = Math.round(slot ? rnd(HH * 0.12, HH * 0.4) : rnd(-HH * 0.4, -HH * 0.12));
    // keep the whole body inside the hex: wide animals stand nearer the middle
    const bw = a.sp ? spr('animal', a.sp, { juv: a.juv }).w : 16, sp2 = hexSpan(oy), lo = sp2[0] + 3 + bw / 2, hi = sp2[1] - 3 - bw / 2, mid = (lo + hi) / 2, ox = Math.round(hi <= lo ? mid : slot ? rnd(mid + (hi - mid) * 0.4, hi) : rnd(lo, mid - (mid - lo) * 0.4));
    a.cell = ci; a.slot = slot; a.ox = ox; a.tx = c.x + ox; a.ty = c.y + oy;
    if (snap) { a.x = a.tx; a.y = a.ty; }
  }
  function syncAnimals(S) {
    const seen = {}, per = {};
    (S.animals || []).forEach(an => {
      const h = an.hab != null && M.habs[an.hab]; if (!h) return;
      per[an.hab] = (per[an.hab] || 0) + 1; if (per[an.hab] > h.cells.length * CAP) return;
      seen[an.id] = 1; let a = animals[an.id]; const sig = h.it.q + ',' + h.it.r + ',' + (h.it.rot || 0);
      if (!a || a.hab !== an.hab || a.sig !== sig) {
        a = animals[an.id] = { id: an.id, hab: an.hab, sig: sig, x: 0, y: 0, cell: null, wait: rnd(0, 4), t: rnd(0, 9), flip: Math.random() < 0.5, moving: false, speed: rnd(6, 9), sp: an.sp, juv: Z.isJuv ? !!Z.isJuv(S, an) : false };
        const cnt = h.cells.map(() => 0); for (const id in animals) { const o = animals[id]; if (o !== a && o.hab === an.hab && o.cell != null && cnt[o.cell] != null) cnt[o.cell]++; }
        let ci = 0; cnt.forEach((n, i) => { if (n < cnt[ci]) ci = i; }); placeInCell(a, h, ci, true);
      }
      a.sp = an.sp; a.variant = !!an.variant; a.juv = Z.isJuv ? !!Z.isJuv(S, an) : false;
    });
    for (const id in animals) if (!seen[id]) delete animals[id];
  }
  function stepAnimal(a, dt) {
    a.t += dt;
    if (a.wait > 0) { a.wait -= dt; a.moving = false; return; }
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy), sp = a.speed * (a.juv ? 1.3 : 1) * dt;
    if (!a.moving && d > sp) { for (const id in animals) { const o = animals[id]; if (o !== a && o.hab === a.hab && o.moving) { a.wait = rnd(0.4, 1.4); return; } } } // one walker per habitat at a time, so they do not cross through each other
    if (d <= sp) {
      a.x = a.tx; a.y = a.ty; a.moving = false; a.wait = rnd(1.5, 6.5);
      const h = M.habs[a.hab]; if (!h || !h.cells[a.cell]) return; const cnt = h.cells.map(() => 0); for (const id in animals) { const o = animals[id]; if (o !== a && o.hab === a.hab && cnt[o.cell] != null) cnt[o.cell]++; }
      const c = h.cells[a.cell], cho = [a.cell]; c.nb.forEach(j => { if (cnt[j] < CAP) cho.push(j, j); });
      placeInCell(a, h, pick(cho), false);
    } else { a.x += dx / d * sp; a.y += dy / d * sp; if (Math.abs(dx) > 0.4) a.flip = dx < 0; a.moving = true; }
  }
  function newWalker(kind, seed) { return { kind: kind, seed: seed, x: 0, y: 0, wp: [], wait: 0, t: rnd(0, 9), flip: false, moving: false, speed: rnd(11, 16), ox: Math.round(rnd(-7, 7)), oy: Math.round(rnd(-HH * 0.25, HH * 0.25)), node: null, left: 0, last: null, dead: false, hidden: false, post: null, staff: null }; }
  function goTo(w, destKey, stand) { // queue hex-by-hex waypoints from the walker's node to destKey; optional stand = look-at spot
    const r = route(w.node, destKey); if (!r) return false;
    r.forEach(k => { const n = M.nodes[k]; w.wp.push({ x: n.x + w.ox, y: n.y + w.oy, k: k }); });
    if (stand) { const n = M.nodes[destKey]; w.wp.push({ x: n.x + (stand.cx - n.x) * 0.3 + w.ox * 0.8, y: n.y + (stand.cy - n.y) * 0.3 + w.oy * 0.6, wait: stand.wait, face: stand.cx < n.x }); }
    return true;
  }
  function planWalker(w) {
    if (w.staff != null) {
      if (w.post != null) { const h = M.habs[w.post], d = h && h.dest; if (d && d.main && goTo(w, d.main.k, { cx: d.main.cx, cy: d.main.cy, wait: 1e9 })) return; w.wait = 3; return; }
      const hs = M.dests.filter(d => d.main && d.it.k === 'hab' && d.it.id !== w.last); if (!hs.length) { w.wait = 5; return; }
      const d = pick(hs), s = pick(d.stands); w.last = d.it.id; if (!goTo(w, s.k, { cx: s.cx, cy: s.cy, wait: rnd(4, 9) })) w.wait = 3; return;
    }
    if (w.left > 0) {
      w.left--; const ds = M.dests.filter(d => d.main && d.it.id !== w.last); if (!ds.length) { w.left = 0; w.wait = 1; return; }
      const pool = []; ds.forEach(d => { pool.push(d); if (d.it.k === 'hab') pool.push(d, d); });
      const d = pick(pool), s = pick(d.stands); w.last = d.it.id;
      if (!goTo(w, s.k, { cx: s.cx, cy: s.cy, wait: d.it.k === 'hab' ? rnd(3, 8) : rnd(2, 4.5) })) w.wait = 2; return;
    }
    if (M.ent && goTo(w, M.ent.k)) { M.road.forEach((c, i) => w.wp.push({ x: c.x + w.ox, y: c.y + w.oy, end: i === M.road.length - 1 })); if (!M.road.length) w.wp[w.wp.length - 1].end = true; }
    else w.dead = true;
  }
  function stepWalker(w, dt) {
    w.t += dt;
    if (w.wait > 0) { w.wait -= dt; w.moving = false; if (w.wait > 0) return; }
    if (!w.wp.length) { if (w.gate) return; planWalker(w); if (!w.wp.length) return; }
    const p = w.wp[0], dx = p.x - w.x, dy = p.y - w.y, d = Math.hypot(dx, dy), sp = w.speed * dt;
    if (d <= sp) { w.x = p.x; w.y = p.y; w.wp.shift(); if (p.k) w.node = p.k; if (p.wait) { w.wait = p.wait; w.flip = !!p.face; w.moving = false; } if (p.end) w.dead = true; }
    else { w.x += dx / d * sp; w.y += dy / d * sp; if (Math.abs(dx) > 0.4) w.flip = dx < 0; w.moving = true; }
  }
  function spawnVisitor(anywhere) {
    if (!M.ent || !M.nodes[M.ent.k]) return null;
    const w = newWalker('visitor', Math.floor(Math.random() * 100000)); w.left = 1 + Math.floor(Math.random() * 3.4);
    if (anywhere && M.pathKeys.length > 1) { const n = M.nodes[pick(M.pathKeys)]; w.node = n.k; w.x = n.x + w.ox; w.y = n.y + w.oy; w.wait = rnd(0, 1.5); }
    else { w.node = M.ent.k; const s = M.road.length ? M.road[M.road.length - 1] : M.ent; w.x = s.x + w.ox; w.y = s.y + w.oy; for (let i = M.road.length - 2; i >= 0; i--) w.wp.push({ x: M.road[i].x + w.ox, y: M.road[i].y + w.oy }); w.wp.push({ x: M.ent.x + w.ox, y: M.ent.y + w.oy, k: M.ent.k }); }
    walkers.push(w); return w;
  }
  function visitorTarget(S) {
    let v = S.visitorsLast || 0; if (!(v > 0)) { try { v = Z.c(S).visitors || 0; } catch (e) { v = 0; } }
    if (!(v > 0) || !M.dests.some(d => d.main)) return 0;
    return Math.round(Math.min(36, 3 + Math.sqrt(v) * 0.5, 2 + M.pathKeys.length * 1.3));
  }
  function projectHab(S, p) { if (p.hab != null) return p.hab; if (p.type === 'breed' && Z.animal) { const a = Z.animal(S, p.a); return a ? a.hab : null; } return null; }
  function syncWalkers(S, first) {
    // visitors
    const want = visitorTarget(S); let have = 0; walkers.forEach(w => { if (w.staff == null) have++; });
    if (first) while (have < want) { if (!spawnVisitor(have < want * 0.85)) break; have++; }
    else if (have < want && running) spawnVisitor(false);
    else if (have > want + 2) { const w = walkers.find(x => x.staff == null && x.left > 0); if (w) w.left = 0; }
    // staff: at their project's habitat, away on expedition, or strolling on zoo duty
    const busy = {}; (S.projects || []).forEach(p => (p.staff || []).forEach(id => { busy[id] = p; }));
    const seen = {};
    (S.staff || []).forEach(s => {
      seen[s.id] = 1; let w = walkers.find(x => x.staff === s.id);
      if (!w) { if (!M.pathKeys.length) return; w = newWalker(s.role, s.id); w.staff = s.id; w.speed = rnd(10, 13); const n = M.nodes[pick(M.pathKeys)]; w.node = n.k; w.x = n.x + w.ox; w.y = n.y + w.oy; w.wait = rnd(0, 2); walkers.push(w); }
      w.kind = s.role; const p = busy[s.id], hid = p ? projectHab(S, p) : null, post = p && hid != null && M.habs[hid] ? hid : null;
      w.hidden = !!p && post == null;
      if (post !== w.post) { w.post = post; w.wp = []; w.wait = 0.01; if (first && post != null) { const d = M.habs[post].dest; if (d && d.main) { const n = M.nodes[d.main.k]; w.node = n.k; w.x = n.x + w.ox; w.y = n.y + w.oy; } } }
    });
    walkers = walkers.filter(w => !w.dead && (w.staff == null || seen[w.staff]));
    // callers and happening characters at the gate
    const here = [];
    try {
      if (typeof Z.callersHere === 'function') (Z.callersHere(S) || []).forEach(c => here.push({ k: 'c:' + c.kind, kind: c.kind }));
      else if (S.headhunt) here.push({ k: 'c:headhunter', kind: 'headhunter' });
    } catch (e) { /* none */ }
    if (S.happening && S.happening.who) here.push({ k: 'h:' + (S.happening.key || '') + S.happening.who, kind: S.happening.who, mark: 'choice' });
    const ghw = M.gate ? Math.max(M.gate.ax, M.gate.c.width - M.gate.ax) : 26; // stand just outside the pillars, in front of the arch line, never behind it
    const SLOT = [[-(ghw + 7), 4], [ghw + 7, 4], [-(ghw + 18), -5], [ghw + 18, -5], [-(ghw + 28), 6], [ghw + 28, 6]], keep = {};
    if (M.ent) here.forEach((c, i) => {
      keep[c.k] = 1; let g = gatePeople[c.k]; const sl = SLOT[i % SLOT.length];
      if (!g) { g = gatePeople[c.k] = newWalker(c.kind, strHash(c.k)); g.gate = true; g.mark = c.mark; g.speed = 24; g.slot = -1; const s = first || !M.road.length ? null : M.road[Math.min(3, M.road.length - 1)]; g.x = s ? s.x : M.ent.x + sl[0]; g.y = s ? s.y : M.ent.y + sl[1]; }
      if (g.slot !== i) { g.slot = i; g.wp = [{ x: M.ent.x + sl[0], y: M.ent.y + sl[1], wait: 1e9, face: sl[0] > 0 }]; g.wait = 0; }
    });
    for (const k in gatePeople) if (!keep[k]) delete gatePeople[k];
  }
  function reseat(S) { // after the map changed: put every actor somewhere that still exists
    walkers.forEach(w => { w.wp = []; if (w.wait > 1e8) w.wait = 0.01; const n = M.nodes[w.node]; if (!n && M.pathKeys.length) { const p = M.nodes[pick(M.pathKeys)]; w.node = p.k; w.x = p.x + w.ox; w.y = p.y + w.oy; } else if (n && Math.hypot(w.x - n.x, w.y - n.y) > W) { w.x = n.x + w.ox; w.y = n.y + w.oy; } if (w.post != null) w.post = -1; });
    walkers = walkers.filter(w => M.nodes[w.node]);
    for (const k in gatePeople) delete gatePeople[k];
    if (S) { syncAnimals(S); syncWalkers(S, !walkers.some(w => w.staff == null)); syncStatus(S); }
  }
  function statusOf(S, it) {
    let s = null;
    if (typeof Z.habStatus === 'function') { try { s = Z.habStatus(S, it); } catch (e) { s = null; } }
    if (!s) { // older engine: only what can be read without re-deriving rules
      s = { event: false, breed: false, busy: null, progress: null, sick: false };
      (S.projects || []).forEach(p => { if (projectHab(S, p) !== it.id) return; s.busy = p.type; s.progress = clamp((S.week - p.start) / Math.max(1, p.end - p.start), 0, 1); });
    }
    const o = { event: !!s.event, breed: !!s.breed, busy: s.busy || null, progress: s.progress, sick: !!s.sick, choice: !!s.choice, buzz: false };
    (S.projects || []).forEach(p => { if (p.choice && projectHab(S, p) === it.id) o.choice = true; });
    try { if (Z.buzzNow) o.buzz = Z.buzzNow(S, it) > 0.02; } catch (e) { /* no flame */ }
    return o;
  }
  function syncStatus(S) {
    statuses = {}; (S.items || []).forEach(it => { if (it.k === 'hab') statuses[it.id] = statusOf(S, it); });
    statuses._exp = (S.projects || []).filter(p => projectHab(S, p) == null).map(p => ({ progress: clamp((S.week - p.start) / Math.max(1, p.end - p.start), 0, 1), choice: !!p.choice }));
  }

  function iconsOf(s) { const ic = []; if (s.choice) ic.push('choice'); if (s.sick) ic.push('sick'); if (s.event) ic.push('ready-event'); if (s.breed) ic.push('ready-breed'); if (s.busy && s.progress == null) ic.push('busy'); if (s.buzz) ic.push('flame'); return ic; }

  // ---------------------------------------------------------------- floating pop-ups
  function floatAt(x, y, icon, num, delay) { floaters.push({ x: Math.round(x), y: Math.round(y), icon: icon ? spr('icon', icon) : null, txt: num != null && isFinite(num) && Math.round(num) !== 0 ? textSprite(shortNum(num), num < 0 ? '#ff8a7a' : '#ffffff') : null, t: -(delay || 0) }); }
  function posOfItem(id) { const h = M.habs[id]; if (h) return { x: h.top.x, y: h.top.y - HH - 4 }; const it = M.items[id]; if (it) { const p = G.toScreen(it.q, it.r); return { x: p.x, y: p.y - 26 }; } return null; }
  const gatePos = () => M.ent ? { x: M.ent.x, y: M.ent.y - 30 } : { x: cam.x + vw / 2, y: cam.y + vh / 2 };
  const GAIN_ICON = { animals: 'heart', habitat: 'rep', fun: 'star', learning: 'rp' };
  const TYPE_ICON = { money: 'coin', coin: 'coin', income: 'coin', rp: 'rp', research: 'rp', rep: 'rep', birth: 'heart', heart: 'heart', buzz: 'flame', exp: 'star', sick: 'sick', choice: 'choice', 'super': 'star' };
  function consumeFx(S) {
    if (!S.fx || !S.fx.length) return;
    let nth = 0;
    S.fx.forEach(f => {
      if (!f) return; let p = null;
      if (f.hab != null) p = posOfItem(f.hab); if (!p && f.item != null) p = posOfItem(f.item);
      if (!p && f.type === 'super') { const w = walkers.find(x => x.staff != null && (x.staff === f.staff || x.staff === f.id || x.staff === f.who) && !x.hidden); if (w) p = { x: w.x, y: w.y - 20 }; }
      if (!p && f.q != null && f.r != null) { const s = G.toScreen(f.q, f.r); p = { x: s.x, y: s.y - 14 }; } if (!p) p = gatePos();
      if (f.type === 'money') engineMoneyFx = true;
      if (f.type === 'event' && f.gains) { let i = 0; Object.keys(f.gains).forEach(k => { const v = Math.round(f.gains[k]); if (v > 0) { floatAt(p.x + (i % 2 ? 13 : -13), p.y + 4, GAIN_ICON[k] || 'star', v, i * 0.28); i++; } }); if (f.fired) floatAt(p.x, p.y - 8, 'flame', null, 1.1); return; }
      if (f.type === 'birth') { floatAt(p.x - 5, p.y + 6, 'heart', null, 0); floatAt(p.x + 7, p.y + 10, 'heart', null, 0.3); return; }
      if (f.type === 'exp' || f.type === 'super') { floatAt(p.x - 9, p.y, 'star', null, 0); floatAt(p.x + 9, p.y + 2, 'star', null, 0.25); return; }
      const num = [f.amt, f.amount, f.n, f.value, f.v].find(x => typeof x === 'number');
      floatAt(p.x, p.y, f.icon || TYPE_ICON[f.type] || 'star', num, Math.min(1.2, (nth++) * 0.12));
    });
    S.fx.length = 0;
  }
  function weeklyCoins(S) { // older engine without 'money' pop-ups: coins float off a few shops each week
    if (engineMoneyFx) return;
    let c; try { c = Z.c(S); } catch (e) { return; } if (!c || !c.shopVal) return;
    const shops = (S.items || []).filter(i => i.k === 'fac' && c.shopVal[i.id] > 0); if (!shops.length) return;
    const v = S.visitorsLast || c.visitors || 0;
    for (let i = 0; i < Math.min(3, shops.length); i++) { const it = shops[(shopTurn + i) % shops.length], p = posOfItem(it.id); if (p) floatAt(p.x, p.y, 'coin', v * c.shopVal[it.id], i * 0.35); }
    shopTurn += 3;
  }

  // ---------------------------------------------------------------- camera and screen mapping
  function aimCamera(S) { // opening view: everything built plus the gate, centred if it fits; otherwise the gate low on the screen
    const ent = M.ent; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; const inc = (x, y) => { a0 = Math.min(a0, x); a1 = Math.max(a1, x); b0 = Math.min(b0, y); b1 = Math.max(b1, y); };
    if (ent) inc(ent.x, ent.y); (S.items || []).forEach(it => itemCells(it).forEach(c => { const p = G.toScreen(c[0], c[1]); inc(p.x, p.y); }));
    if (a0 > 1e8) return; const padT = HH + 36, padB = HH + 30, padX = HW + 12;
    cam.x = (a1 - a0 + padX * 2 <= vw ? (a0 + a1) / 2 : ent ? ent.x : a0) - vw / 2;
    cam.y = b1 - b0 + padT + padB <= vh ? (b0 - padT + b1 + padB) / 2 - vh / 2 : ent ? ent.y - vh * 0.85 : b0 - padT;
    cam.vx = cam.vy = 0; cam.tx = cam.ty = null;
  }
  function clampCam() {
    if (!M) return; const b = M.bounds, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    cam.x = bw <= vw ? b.x0 - (vw - bw) / 2 : clamp(cam.x, b.x0, b.x1 - vw);
    cam.y = bh <= vh ? b.y0 - (vh - bh) / 2 : clamp(cam.y, b.y0, b.y1 - vh);
  }
  function resize() {
    if (!canvas) return; const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const cx = cam.x + vw / 2, cy = cam.y + vh / 2, had = vw > 0;
    dpr = root.devicePixelRatio || 1; cssW = rect.width; cssH = rect.height;
    devW = Math.max(1, Math.round(cssW * dpr)); devH = Math.max(1, Math.round(cssH * dpr));
    const n1 = Math.max(1, Math.round(devW / 195)), n0 = Math.max(1, Math.min(n1 - 1, Math.round(devW / 280)));
    N = zoom ? n1 : n0;
    if (canvas.width !== devW) canvas.width = devW; if (canvas.height !== devH) canvas.height = devH;
    vw = devW / N; vh = devH / N; if (M && M.cover && (vw > M.cover.w || vh > M.cover.h)) mapDirty = true;
    const bw = Math.ceil(vw) + 2, bh = Math.ceil(vh) + 2;
    if (!buf) buf = document.createElement('canvas');
    if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
    bctx = buf.getContext('2d'); bctx.imageSmoothingEnabled = false; ctx.imageSmoothingEnabled = false;
    if (had) { cam.x = cx - vw / 2; cam.y = cy - vh / 2; clampCam(); }
  }
  function clientToWorld(x, y) { const rect = canvas.getBoundingClientRect(); return { x: cam.x + (x - rect.left) * (devW / rect.width) / N, y: cam.y + (y - rect.top) * (devH / rect.height) / N }; }
  R.clientToHex = function (x, y) { const w = clientToWorld(x, y); return G.toAxial(w.x, w.y); };
  R.hexToClient = function (q, r) { const p = G.toScreen(q, r), rect = canvas.getBoundingClientRect(); return { x: rect.left + (p.x - cam.x) * N * (rect.width / devW), y: rect.top + (p.y - cam.y) * N * (rect.height / devH) }; };

  // ---------------------------------------------------------------- input
  const ptr = { id: null, sx: 0, sy: 0, lx: 0, ly: 0, moved: 0, drag: false, samples: [] };
  function onDown(e) {
    if (ptr.id != null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    ptr.id = e.pointerId; ptr.sx = ptr.lx = e.clientX; ptr.sy = ptr.ly = e.clientY; ptr.moved = 0; ptr.drag = false; ptr.samples = [{ t: now(), x: e.clientX, y: e.clientY }];
    cam.vx = cam.vy = 0; cam.tx = cam.ty = null;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    e.preventDefault();
  }
  function onMove(e) {
    if (e.pointerId !== ptr.id) return;
    const k = (devW / cssW) / N, dx = e.clientX - ptr.lx, dy = e.clientY - ptr.ly; ptr.lx = e.clientX; ptr.ly = e.clientY;
    ptr.moved = Math.max(ptr.moved, Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy));
    if (!ptr.drag && ptr.moved >= 8) ptr.drag = true;
    if (ptr.drag) { cam.x -= dx * k; cam.y -= dy * k; clampCam(); }
    ptr.samples.push({ t: now(), x: e.clientX, y: e.clientY }); if (ptr.samples.length > 6) ptr.samples.shift();
    e.preventDefault();
  }
  function onUp(e) {
    if (e.pointerId !== ptr.id) return; ptr.id = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* fine */ }
    if (e.type === 'pointercancel') return;
    if (!ptr.drag) {
      const h = R.clientToHex(e.clientX, e.clientY), S = st();
      if (P) { if (S && inGrid(S, h.q, h.r)) { P.q = h.q; P.r = h.r; evalPlacement(); } return; }
      if (opts.onTap) opts.onTap({ q: h.q, r: h.r, item: (M && M.occ[key(h.q, h.r)]) || null });
      return;
    }
    const a = ptr.samples[0], b = ptr.samples[ptr.samples.length - 1], dt = (b.t - a.t) / 1000, k = (devW / cssW) / N;
    if (dt > 0.02 && now() - b.t < 90) { cam.vx = clamp(-(b.x - a.x) * k / dt, -900, 900); cam.vy = clamp(-(b.y - a.y) * k / dt, -900, 900); }
  }
  function onWheel(e) { cam.x += e.deltaX / N; cam.y += e.deltaY / N; cam.vx = cam.vy = 0; cam.tx = cam.ty = null; clampCam(); e.preventDefault(); }

  // ---------------------------------------------------------------- placement mode
  function ensureDom() {
    let bar = document.getElementById('placement-bar'), note = document.getElementById('placement-note');
    const host = (canvas && canvas.parentElement) || document.body;
    if (!bar) { bar = document.createElement('div'); bar.id = 'placement-bar'; bar.setAttribute('data-zr-made', '1'); host.appendChild(bar); }
    if (!note) { note = document.createElement('div'); note.id = 'placement-note'; note.setAttribute('data-zr-made', '1'); bar.parentElement.insertBefore(note, bar); }
    if (!document.getElementById('zrender-style')) { // low-priority defaults (:where has zero specificity, so the page's own stylesheet wins)
      const s = document.createElement('style'); s.id = 'zrender-style';
      s.textContent = ':where(#placement-bar){display:none;gap:8px;padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));box-sizing:border-box}' +
        ':where(#placement-bar.zr-on){display:flex}:where(#placement-bar[data-zr-made]){position:absolute;left:0;right:0;bottom:0;z-index:5}' +
        ':where(#placement-bar) :where(button){flex:1 1 0;min-height:56px;font:600 17px/1 system-ui,sans-serif;border-radius:10px;border:2px solid #2b2233;background:#fff7e0;color:#2b2233;touch-action:manipulation}' +
        ':where(#placement-bar) :where(button.zr-place){background:#8fd66a}:where(#placement-bar) :where(button:disabled){opacity:.45}' +
        ':where(#placement-note){display:none;text-align:center;font:600 15px/1.25 system-ui,sans-serif;padding:6px 10px;color:#2b2233;background:rgba(255,247,224,.94)}' +
        ':where(#placement-note.zr-on){display:block}:where(#placement-note[data-zr-made]){position:absolute;left:0;right:0;bottom:calc(74px + env(safe-area-inset-bottom,0px));z-index:5}' +
        ':where(#placement-note[data-state=bad]){background:rgba(255,214,208,.96)}:where(#placement-note[data-state=combo]){background:rgba(255,236,150,.97)}:where(#placement-note[data-state=warn]){background:rgba(255,226,190,.97)}';
      document.head.insertBefore(s, document.head.firstChild);
    }
    return { bar: bar, note: note };
  }
  function canHere(S, q, r) { try { return !!Z.canPlace(S, P.spec.kind, P.spec.t, q, r, P.rot, P.spec.moveId); } catch (e) { return false; } }
  function seekValid(x, y, skipCurrent) { // put the ghost on the valid hex nearest a point; if nothing fits anywhere, the nearest owned hex
    const S = st(); if (!S || !P || !M) return false; let best = null, bd = 1e18, fall = null, fd = 1e18;
    for (const k in M.cells) { const c = M.cells[k]; if (!c.owned || (skipCurrent && c.q === P.q && c.r === P.r)) continue; const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y) * 1.6; if (d < fd) { fd = d; fall = c; } if (d < bd && canHere(S, c.q, c.r)) { bd = d; best = c; } }
    const c = best || fall; if (c) { P.q = c.q; P.r = c.r; } return !!best;
  }
  function showGhost() { // glide the camera only if the ghost's footprint is not comfortably on screen
    if (!P) return; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; Z.cellsOf(P.spec.kind, P.spec.t, P.q, P.r, P.rot).forEach(c => { const p = G.toScreen(c[0], c[1]); a0 = Math.min(a0, p.x); a1 = Math.max(a1, p.x); b0 = Math.min(b0, p.y); b1 = Math.max(b1, p.y); });
    const barH = P.dom && P.dom.bar ? (P.dom.bar.getBoundingClientRect().height + 40) / (cssH || 1) * vh : vh * 0.2;
    if (a0 - HW < cam.x + 4 || a1 + HW > cam.x + vw - 4 || b0 - HH - 20 < cam.y || b1 + HH > cam.y + vh - barH) { const ox = cam.x, oy = cam.y; cam.x = (a0 + a1) / 2 - vw / 2; cam.y = (b0 + b1) / 2 - vh * 0.42; clampCam(); cam.tx = cam.x; cam.ty = cam.y; cam.x = ox; cam.y = oy; cam.vx = cam.vy = 0; }
  }
  function comboNames(list) { const out = []; list.forEach(a => { const c = D.COMBOS.find(x => x.id === a.id); const n = c ? c.name : a.id; if (out.indexOf(n) < 0) out.push(n); }); return out; }
  function evalPlacement() {
    const S = st(); if (!P || !S) return; const sp = P.spec;
    const cs = Z.cellsOf(sp.kind, sp.t, P.q, P.r, P.rot); let ok = false; try { ok = !!Z.canPlace(S, sp.kind, sp.t, P.q, P.r, P.rot, sp.moveId); } catch (e) { ok = false; }
    let occ = null; try { occ = Z.occupancy ? Z.occupancy(S, sp.moveId) : null; } catch (e) { occ = null; }
    let outside = false; const ent = M && M.ent;
    P.cells = cs.map(c => { const land = !!Z.inLand(S, c[0], c[1]), free = occ ? !occ[key(c[0], c[1])] : true, gate = !ok && ent && ent.q === c[0] && ent.r === c[1]; if (!land) outside = true; return { q: c[0], r: c[1], ok: ok || (land && free && !gate) }; });
    if (!ok && P.cells.every(c => c.ok)) P.cells.forEach(c => { c.ok = false; });
    P.ok = ok; P.makes = []; P.breaks = [];
    if (ok) {
      try {
        const gid = sp.moveId != null ? sp.moveId : -1, items = S.items.filter(i => i.id !== sp.moveId).concat([{ id: gid, k: sp.kind, t: sp.t, q: P.q, r: P.r, rot: P.rot }]);
        const nowA = activeCombos(S), thenA = Z.layout(S, items).active, kf = a => a.id + '@' + a.anchor, nowK = {}, thenK = {};
        nowA.forEach(a => { nowK[kf(a)] = 1; }); thenA.forEach(a => { thenK[kf(a)] = 1; });
        P.makes = comboNames(thenA.filter(a => !nowK[kf(a)])); P.breaks = comboNames(nowA.filter(a => !thenK[kf(a)]));
      } catch (e) { /* no preview */ }
    }
    P.state = !ok ? 'bad' : P.makes.length ? 'combo' : P.breaks.length ? 'warn' : 'ok';
    let msg = !ok ? (outside ? 'Outside your land.' : 'Something is in the way.') : '';
    if (ok) { if (P.makes.length) msg = 'Completes ' + P.makes.join(', ') + '!'; if (P.breaks.length) msg += (msg ? ' ' : '') + 'Breaks ' + P.breaks.join(', ') + '.'; if (!msg) msg = 'Fits here.'; }
    if (P.fail) { msg = P.fail; P.state = 'bad'; P.fail = null; }
    P.msg = msg;
    P.outline = outlineSprite(cs, P.state === 'bad' ? '#ff6a5c' : P.state === 'combo' ? '#ffd84a' : P.state === 'warn' ? '#ffb056' : '#ffffff');
    if (P.dom) { P.dom.note.textContent = (sp.label && (sp.label + msg).length <= 34 ? sp.label + ': ' : '') + msg; P.dom.note.setAttribute('data-state', P.state); if (P.dom.place) { P.dom.place.setAttribute('aria-disabled', ok ? 'false' : 'true'); P.dom.place.style.opacity = ok ? '' : '0.55'; } }
  }
  R.startPlacement = function (spec, cbs) {
    if (P) R.stopPlacement();
    const S = st(); if (!S || !spec) return false; if (!M) rebuild(S);
    const dom = ensureDom(), moved = spec.moveId != null ? (S.items || []).find(i => i.id === spec.moveId) : null;
    P = { spec: Object.assign({}, spec), cbs: cbs || {}, q: 0, r: 0, rot: spec.rot != null ? spec.rot : moved ? moved.rot || 0 : 0, dom: dom, t: 0 };
    if (moved) { if (!P.spec.kind) P.spec.kind = moved.k; if (!P.spec.t) P.spec.t = moved.t; }
    // start on a VALID hex: the one nearest the middle of the screen (a moved item starts where it stands), so the first Place normally works
    if (moved && spec.rot == null) { P.q = moved.q; P.r = moved.r; } else seekValid(cam.x + vw / 2, cam.y + vh * 0.42, false);
    showGhost();
    dom.bar.textContent = '';
    const b = (label, cls, fn) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = label; el.className = 'zr-btn ' + cls; el.style.minHeight = (root.innerHeight && root.innerHeight < 480 ? 44 : 56) + 'px'; el.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); fn(); }); dom.bar.appendChild(el); return el; };
    // Rotate only exists when turning changes the footprint (not for single-hex facilities or fully round habitats)
    const fp = rot => Z.cellsOf(P.spec.kind, P.spec.t, 0, 0, rot).map(c => c[0] + ',' + c[1]).sort().join(';'); let turns = false; try { turns = fp(0) !== fp(1); } catch (e) { turns = false; }
    dom.rotate = turns ? b('Rotate', 'zr-rotate', () => { if (!P) return; P.rot = (P.rot + 1) % 6; evalPlacement(); }) : null;
    dom.place = b('Place', 'zr-place', () => {
      if (!P) return; if (!P.ok) { evalPlacement(); P.t = 0; return; }
      let res = null; try { res = P.cbs.onPlace ? P.cbs.onPlace(P.q, P.r, P.rot) : { ok: true }; } catch (e) { res = { ok: false, msg: 'That did not work.' }; }
      if (!P) return;
      if (res && res.ok === false) { P.fail = res.msg || 'Not possible.'; evalPlacement(); return; }
      mapDirty = true; if (!P.spec.repeat) { R.stopPlacement(); return; }
      // repeat: stay in placement, hop the ghost to the nearest spot that still fits, and the third button becomes Done
      P.count = (P.count || 0) + 1; if (P.dom.cancel) P.dom.cancel.textContent = 'Done'; const S2 = st(); if (S2) rebuild(S2);
      const here = G.toScreen(P.q, P.r); seekValid(here.x, here.y, true); evalPlacement(); showGhost();
    });
    dom.cancel = b('Cancel', 'zr-cancel', () => { if (!P) return; const cb = P.count > 0 && P.cbs.onDone ? P.cbs.onDone : P.cbs.onCancel; R.stopPlacement(); if (cb) cb(); });
    dom.note.style.whiteSpace = 'nowrap'; dom.note.style.overflow = 'hidden'; dom.note.style.textOverflow = 'ellipsis';
    dom.bar.classList.add('zr-on'); dom.note.classList.add('zr-on');
    evalPlacement(); return true;
  };
  R.stopPlacement = function () { if (!P) return; const d = P.dom; P = null; if (d) { d.bar.classList.remove('zr-on'); d.note.classList.remove('zr-on'); d.bar.textContent = ''; d.note.textContent = ''; } };
  R.placing = () => !!P;

  // ---------------------------------------------------------------- drawing
  const list = [], over = [];
  function frame(t) {
    if (!started) return; root.requestAnimationFrame(frame);
    const t0 = now(), dt = clamp((t - lastT) / 1000 || 0, 0, 0.1); lastT = t;
    const S = st(); if (!S || !ctx) return;
    if (S !== lastS) { if (lastS) { clearActors(); if (P) R.stopPlacement(); } lastS = S; }
    if (!vw) resize(); if (!vw) return;
    clock += dt;
    if (mapDirty || !M || clock >= slowAt) {
      slowAt = clock + 0.35;
      if (mapDirty || !M || M.sig !== signature(S)) rebuild(S); else { syncAnimals(S); syncWalkers(S, false); syncStatus(S); }
    }
    // camera
    if (cam.tx != null) { const k = 1 - Math.exp(-dt * 9); cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; if (Math.abs(cam.tx - cam.x) + Math.abs(cam.ty - cam.y) < 0.4) { cam.x = cam.tx; cam.y = cam.ty; cam.tx = cam.ty = null; } }
    else if (ptr.id == null && (cam.vx || cam.vy)) { cam.x += cam.vx * dt; cam.y += cam.vy * dt; const f = Math.exp(-dt * 5.5); cam.vx *= f; cam.vy *= f; if (Math.hypot(cam.vx, cam.vy) < 6) cam.vx = cam.vy = 0; }
    clampCam();
    // world
    if (running) {
      consumeFx(S);
      if (lastWeek != null && S.week !== lastWeek) { if (S.week > lastWeek) weeklyCoins(S); syncStatus(S); }
      lastWeek = S.week;
      for (const id in animals) stepAnimal(animals[id], dt);
      for (let i = 0; i < walkers.length; i++) stepWalker(walkers[i], dt);
      for (const k in gatePeople) stepWalker(gatePeople[k], dt);
      for (let i = floaters.length - 1; i >= 0; i--) { floaters[i].t += dt; if (floaters[i].t > 1.7) floaters.splice(i, 1); }
    }
    if (P) P.t += dt;
    draw(S);
    const ms = now() - t0; stats.acc += dt; stats.accMs += ms; stats.frames++;
    if (stats.acc >= 0.5) { stats.fps = Math.round(stats.frames / stats.acc); stats.frameMs = Math.round(stats.accMs / stats.frames * 100) / 100; stats.acc = 0; stats.accMs = 0; stats.frames = 0; }
  }
  function draw(S) {
    const cx = Math.floor(cam.x), cy = Math.floor(cam.y), bw = buf.width, bh = buf.height, c = bctx;
    c.globalAlpha = 1; c.fillStyle = M.bg; c.fillRect(0, 0, bw, bh);
    c.drawImage(M.floor, M.fx0 - cx, M.fy0 - cy);
    // ground layer: combo outlines and the placement footprint
    const ph = Math.floor(clock * 2.5) & 1;
    for (let i = 0; i < M.combos.length; i++) { const o = M.combos[i]; if (o.x - cx < bw && o.y - cy < bh && o.x + o.w > cx && o.y + o.h > cy) c.drawImage(o.f[running ? ph : 0].c, o.x - cx, o.y - cy); }
    list.length = 0; over.length = 0;
    if (P && P.cells) {
      const sp = P.spec, pulse = 0.38 + 0.12 * Math.sin(P.t * 5);
      P.cells.forEach(cell => {
        const p = G.toScreen(cell.q, cell.r);
        if (sp.kind === 'hab') { const tl = spr('tile', 'hab:' + sp.t, 0); c.globalAlpha = 0.8; c.drawImage(tl.c, Math.round(p.x - tl.ax) - cx, Math.round(p.y - tl.ay) - cy); }
        const mk2 = hexMask(!cell.ok ? '#ff4a3a' : P.state === 'bad' ? '#ff9a8a' : P.state === 'combo' ? '#ffd84a' : '#6dff7a');
        c.globalAlpha = cell.ok && P.state !== 'bad' ? pulse : pulse + 0.2; c.drawImage(mk2.c, p.x - HW - cx, p.y - HH - cy);
      });
      c.globalAlpha = 1; c.drawImage(P.outline.f[Math.floor(P.t * 3) & 1].c, P.outline.x - cx, P.outline.y - cy);
      if (sp.kind === 'hab') {
        const set = {}; P.cells.forEach(cell => { set[key(cell.q, cell.r)] = 1; });
        P.cells.forEach(cell => { const p = G.toScreen(cell.q, cell.r); G.EDGES.forEach((e, ei) => { if (set[key(cell.q + e[0][0], cell.r + e[0][1])]) return; const s = spr('fence', sp.t, ei); list.push({ s: s, x: p.x, y: p.y, key: G.depth(cell.q, cell.r, M.fenceDy(s, ei)) + 0.01, a: 0.85 }); }); });
      } else { const p = G.toScreen(P.q, P.r), s = spr('building', sp.t, {}); list.push({ s: s, x: p.x, y: p.y, key: G.depth(P.q, P.r, 0) + 0.21, a: 0.85 }); }
    }
    // one depth-sorted list
    const L = cx - 40, Rr = cx + bw + 40, T = cy - 10, B = cy + bh + 60, moveId = P ? P.spec.moveId : null;
    for (let i = 0; i < M.statics.length; i++) { const e = M.statics[i]; if (e.x < L || e.x > Rr || e.y < T || e.y > B) continue; if (moveId != null && e.id === moveId) { list.push({ s: e.s, x: e.x, y: e.y, key: e.key, a: 0.35 }); continue; } list.push(e); }
    const AF = frames('ANIMAL_FRAMES'), PF = frames('PERSON_FRAMES');
    for (const id in animals) {
      const a = animals[id]; if (a.x < L || a.x > Rr || a.y < T || a.y > B) continue;
      const fr = a.moving && running && AF > 1 ? Math.floor(a.t * 6) % AF : 0;
      list.push({ s: spr('animal', a.sp, { variant: a.variant, juv: a.juv, frame: fr, flip: a.flip }), x: a.x, y: a.y, key: a.y + 0.1, a: 1 });
    }
    const person = w => {
      if (w.hidden || w.x < L || w.x > Rr || w.y < T || w.y > B) return;
      const fr = w.moving && running && PF > 1 ? Math.floor(w.t * 7) % PF : 0, s = spr('person', w.kind, { frame: fr, flip: w.flip, seed: w.seed });
      list.push({ s: s, x: w.x, y: w.y, key: w.y + 0.15, a: 1 });
      if (w.mark) over.push({ s: spr('icon', w.mark), x: w.x, y: w.y - s.ay - 2 + (running ? Math.round(Math.sin(clock * 4)) : 0) });
    };
    for (let i = 0; i < walkers.length; i++) person(walkers[i]);
    for (const k in gatePeople) person(gatePeople[k]);
    list.sort((a, b) => a.key - b.key);
    for (let i = 0; i < list.length; i++) { const e = list[i], s = e.s; if (e.a !== 1) c.globalAlpha = e.a; c.drawImage(s.c, Math.round(e.x - s.ax) - cx, Math.round(e.y - s.ay) - cy); if (e.a !== 1) c.globalAlpha = 1; }
    stats.sprites = list.length;
    // the same combo outlines again, faintly, over the sprites, so a fence never hides which tiles belong together
    c.globalAlpha = 0.28; for (let i = 0; i < M.combos.length; i++) { const o = M.combos[i]; if (o.x - cx < bw && o.y - cy < bh && o.x + o.w > cx && o.y + o.h > cy) c.drawImage(o.f[running ? ph : 0].c, o.x - cx, o.y - cy); } c.globalAlpha = 1;
    // quiet on-floor icons and progress bars
    const bar = (x, y, p) => { c.fillStyle = '#1d1a22'; c.fillRect(x - 10 - cx, y - cy, 20, 4); c.fillStyle = '#4a4458'; c.fillRect(x - 9 - cx, y + 1 - cy, 18, 2); c.fillStyle = '#7be36a'; c.fillRect(x - 9 - cx, y + 1 - cy, Math.round(18 * clamp(p || 0, 0, 1)), 2); };
    for (const id in M.habs) {
      const h = M.habs[id], s = statuses[id]; if (!s) continue; if (h.top.x < L || h.top.x > Rr || h.top.y < T || h.top.y > B + 40) continue;
      const ic = iconsOf(s), mk3 = h.mark || h.top, bx = mk3.x, by = mk3.y - HH - 9;
      if (ic.length) { const w2 = ic.length * 12 + 2; c.globalAlpha = 0.5; c.fillStyle = '#1d1a22'; c.fillRect(Math.round(bx - w2 / 2) - cx, by - 13 - cy, w2, 13); c.fillRect(Math.round(bx - w2 / 2) + 1 - cx, by - 14 - cy, w2 - 2, 15); c.globalAlpha = 1; }
      ic.forEach((n, i) => { const sp = spr('icon', n), bob = running ? Math.round(Math.sin(clock * (n === 'choice' ? 5 : 2.2) + h.top.x)) : 0; c.drawImage(sp.c, Math.round(bx + (i - (ic.length - 1) / 2) * 12 - sp.ax) - cx, by - 1 + bob - Math.round(sp.ay) - cy); });
      if (s.busy && s.progress != null) bar(bx, by + 1, s.progress);
    }
    if (M.ent && statuses._exp) statuses._exp.forEach((e, i) => { const gx = M.ent.x, gy = M.ent.y - (M.gate ? Math.round(M.gate.ay) : 30) - 6 - i * 7; bar(gx, gy, e.progress); if (e.choice) { const sp = spr('icon', 'choice'); c.drawImage(sp.c, Math.round(gx + 16 - sp.ax) - cx, gy + 5 - Math.round(sp.ay) - cy); } });
    for (let i = 0; i < over.length; i++) { const o = over[i]; c.drawImage(o.s.c, Math.round(o.x - o.s.ax) - cx, Math.round(o.y - o.s.ay) - cy); }
    // floating pop-ups
    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i]; if (f.t < 0) continue; const k = f.t / 1.7, y = f.y - Math.round(20 * (1 - (1 - k) * (1 - k))) - cy; let x = f.x - cx;
      c.globalAlpha = k > 0.7 ? Math.max(0, 1 - (k - 0.7) / 0.3) : 1;
      const tw = (f.icon ? f.icon.c.width + 1 : 0) + (f.txt ? f.txt.w : 0); x -= Math.round(tw / 2);
      if (f.icon) { c.drawImage(f.icon.c, x, y - f.icon.c.height); x += f.icon.c.width + 1; }
      if (f.txt) c.drawImage(f.txt.c, x, y - f.txt.h - 1);
    }
    c.globalAlpha = 1;
    // crisp integer scale-up, with the camera's sub-pixel remainder applied in device pixels so scrolling stays smooth
    const ox = Math.round((cam.x - cx) * N), oy = Math.round((cam.y - cy) * N);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, bw, bh, -ox, -oy, bw * N, bh * N);
  }

  // ---------------------------------------------------------------- public API
  function clearActors() { mapDirty = true; cam.placed = false; animals = {}; walkers = []; gatePeople = {}; floaters = []; lastWeek = null; }
  R.init = function (cv, o) {
    canvas = cv; opts = o || {}; ctx = canvas.getContext('2d');
    canvas.style.touchAction = 'none'; canvas.style.imageRendering = 'pixelated'; canvas.style.userSelect = 'none'; canvas.style.webkitUserSelect = 'none'; canvas.style.webkitTouchCallout = 'none';
    try { if (root.ZSprites && root.ZSprites.init) root.ZSprites.init(); } catch (e) { stats.warned.init = String(e && e.message || e); }
    if (!started) {
      canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('contextmenu', e => e.preventDefault());
      root.addEventListener('resize', resize);
      if (root.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    }
    clearActors(); resize();
    if (!started) { started = true; lastT = now(); root.requestAnimationFrame(frame); }
    return R;
  };
  R.setRunning = function (b) { running = !!b; };
  R.mapChanged = function () { mapDirty = true; };
  R.reset = function () { clearActors(); if (P) R.stopPlacement(); }; // a new or loaded game: forget every actor and re-aim the camera
  R.centerOn = function (q, r, instant) {
    const S = st(); if (!M && S && vw) rebuild(S); if (!M) return;
    const p = G.toScreen(q, r), ox = cam.x, oy = cam.y; cam.x = p.x - vw / 2; cam.y = p.y - vh / 2; clampCam(); cam.vx = cam.vy = 0;
    if (instant) { cam.tx = cam.ty = null; return; }
    cam.tx = cam.x; cam.ty = cam.y; cam.x = ox; cam.y = oy;
  };
  R.setZoom = function (level) { zoom = level ? 1 : 0; resize(); };
  R.getZoom = () => zoom;
  R.resize = resize;
  R.entrance = () => (M && M.ent ? { q: M.ent.q, r: M.ent.r } : null);
  R.debug = function () {
    return { sprites: stats.sprites, fps: stats.fps, frameMs: stats.frameMs, cam: { x: cam.x, y: cam.y }, buffer: { w: Math.round(vw), h: Math.round(vh), scale: N / dpr, deviceScale: N, dpr: dpr },
      running: running, zoom: zoom, realSprites: usingReal(), spriteGetters: spriteState(), spriteErrors: Object.assign({}, stats.warned), animals: Object.keys(animals).length, visitors: walkers.filter(w => w.staff == null).length, staff: walkers.filter(w => w.staff != null && !w.hidden).length,
      gate: Object.keys(gatePeople).length, gateKinds: Object.keys(gatePeople).map(k => gatePeople[k].kind), gateArrived: Object.keys(gatePeople).filter(k => !gatePeople[k].wp.length).length, gateMarks: Object.keys(gatePeople).filter(k => gatePeople[k].mark).map(k => gatePeople[k].kind),
      icons: (() => { const o = {}; for (const id in statuses) if (id !== '_exp') { const s2 = statuses[id]; o[id] = iconsOf(s2).concat(s2.busy && s2.progress != null ? ['bar'] : []); } return o; })(), moving: (() => { const o = {}; for (const id in animals) if (animals[id].moving) o[animals[id].hab] = (o[animals[id].hab] || 0) + 1; return o; })(), floaters: floaters.length, combos: M ? M.combos.length : 0, statics: M ? M.statics.length : 0, paths: M ? M.pathKeys.length : 0,
      placement: P ? { q: P.q, r: P.r, rot: P.rot, ok: P.ok, state: P.state, msg: P.msg, makes: P.makes, breaks: P.breaks } : null };
  };
  root.ZRender = R;
})(typeof window !== 'undefined' ? window : globalThis);
