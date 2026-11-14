/* Wildside Zoo, style D art pipeline (Artist; test file, the live game does not use it yet).
   Style D = a 2x finer pixel grid (3 phone pixels per pixel on a 3x iPhone) with bold 2-pixel outer outlines.
   How it works: a private copy of sprites.js is loaded with its painter switched to the fine grid (see hdCopy() in
   test/art-density.js). Every shape is re-drawn on the fine grid, then detail passes and per-species redraws below add
   the extra detail. When the owner approves, this file is what gets folded into sprites.js. Needs geo.js and sprites.js. */
'use strict';
var G = window.ZGeo, LIVE = window.ZSprites;
function ash(t) { return t < 0.24 ? 0 : t > 0.7 ? 2 : 1; }
function frac(v) { return v - Math.floor(v); }

// ---------------------------------------------------------------------------------------------------------------------
// The hi-res painter: same calls as sprites.js's painter (art-pixel coordinates), drawn on a K-times finer grid.
// ---------------------------------------------------------------------------------------------------------------------
var HDM = {};
HDM.X = function (i) { return Math.round((i + this.ox) * this.K); };
HDM.Y = function (j) { return Math.round((j + this.oy) * this.K); };
HDM.code = function (k, s) { var c = this.ki[k]; if (c == null) c = this.ki.A || 0; return c * 4 + (s == null ? 1 : s) + 1; };
HDM.cs = function (c, r, v) { if (c >= 0 && r >= 0 && c < this.W && r < this.H) this.d[r * this.W + c] = v; };
HDM.cg = function (c, r) { return (c >= 0 && r >= 0 && c < this.W && r < this.H) ? this.d[r * this.W + c] : 0; };
HDM.blk = function (x, y, fn) { x = Math.round(x); y = Math.round(y); for (var r = this.Y(y); r < this.Y(y + 1); r++) for (var c = this.X(x); c < this.X(x + 1); c++) if (c >= 0 && r >= 0 && c < this.W && r < this.H) { if (fn(r * this.W + c) === false) return; } };
HDM.set = function (x, y, k, s) { var v = this.code(k, s), me = this; this.blk(x, y, function (i) { me.d[i] = v; }); };
HDM.has = function (x, y) { var f = false, d = this.d; this.blk(x, y, function (i) { if (d[i] !== 0) { f = true; return false; } }); return f; };
HDM.kat = function (x, y) { var v = 0, d = this.d; this.blk(x, y, function (i) { if (d[i] > 0) { v = d[i]; return false; } }); if (!v) return ''; var c = (v - 1) >> 2; for (var k in this.ki) if (this.ki[k] === c) return k; return ''; };
HDM.sh = function (x, y, s) { var d = this.d; this.blk(x, y, function (i) { if (d[i] > 0) d[i] = (((d[i] - 1) >> 2) * 4) + s + 1; }); };
HDM.re = function (x, y, k, s) { var c = this.ki[k], d = this.d; if (c == null) return; this.blk(x, y, function (i) { if (d[i] > 0) d[i] = c * 4 + (s == null ? ((d[i] - 1) & 3) : s) + 1; }); };
HDM.clr = function (x, y) { var d = this.d; this.blk(x, y, function (i) { d[i] = 0; }); };
HDM.rect = function (x, y, w, h, k, s) {
  x = Math.round(x); y = Math.round(y); var wi = Math.ceil(w), hi = Math.ceil(h); if (wi <= 0 || hi <= 0) return;
  var c0 = this.X(x), c1 = this.X(x + wi), r0 = this.Y(y), r1 = this.Y(y + hi), n = r1 - r0;
  for (var r = r0; r < r1; r++) { var v = this.code(k, s === 'a' ? (hi < 3 ? 1 : ash((r - r0 + 0.5) / n)) : s); for (var c = c0; c < c1; c++) this.cs(c, r, v); }
};
HDM.rr = function (x, y, w, h, k, s, rad) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); if (rad == null) rad = Math.min(2, Math.floor(Math.min(w, h) / 3));
  if (w <= 0 || h <= 0) return;
  var c0 = this.X(x), c1 = this.X(x + w), r0 = this.Y(y), r1 = this.Y(y + h), Wc = c1 - c0, Hc = r1 - r0, rc = Math.round(rad * this.K);
  for (var j = 0; j < Hc; j++) {
    var ins = j < rc ? rc - j : (j >= Hc - rc ? rc - (Hc - 1 - j) : 0); if (ins * 2 >= Wc) ins = Math.max(0, Math.floor((Wc - 1) / 2));
    var v = this.code(k, s == null ? (h < 3 ? 1 : ash((j + 0.5) / Hc)) : s);
    for (var i = ins; i < Wc - ins; i++) this.cs(c0 + i, r0 + j, v);
  }
};
HDM.ell = function (cx, cy, rx, ry, k, s) {
  var K = this.K, e = 0.5 - 0.5 / K, Rx = rx + 0.25 + e, Ry = ry + 0.25 + e, list = [], top = null, bot = 0;
  var c0 = this.X(Math.floor(cx - Rx) - 1), c1 = this.X(Math.ceil(cx + Rx) + 2), r0 = this.Y(Math.floor(cy - Ry) - 1), r1 = this.Y(Math.ceil(cy + Ry) + 2);
  for (var r = r0; r < r1; r++) for (var c = c0; c < c1; c++) {
    var dx = ((c + 0.5) / K - this.ox - 0.5 - cx) / Rx, dy = ((r + 0.5) / K - this.oy - 0.5 - cy) / Ry;
    if (dx * dx + dy * dy <= 1) { list.push(c, r); if (top == null) top = r; bot = r; }
  }
  var n = top == null ? 0 : bot - top + 1, nArt = n / K;
  for (var i = 0; i < list.length; i += 2) this.cs(list[i], list[i + 1], this.code(k, s == null ? (nArt < 3 ? 1 : ash((list[i + 1] - top + 0.5) / n)) : s));
};
HDM.line = function (x0, y0, x1, y1, k, s, t) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); t = t || 1;
  var K = this.K, o = Math.floor((t - 1) / 2), B = Math.max(1, Math.round(t * K - 0.01)), me = this, v = this.code(k, s);
  function tl(x, off) { return Math.round((x - o + t / 2 + off) * K - B / 2); }
  var a = tl(x0, this.ox), b = tl(y0, this.oy), a1 = tl(x1, this.ox), b1 = tl(y1, this.oy);
  var dx = Math.abs(a1 - a), dy = Math.abs(b1 - b), sx = a < a1 ? 1 : -1, sy = b < b1 ? 1 : -1, er = dx - dy;
  for (;;) {
    for (var j = 0; j < B; j++) for (var i = 0; i < B; i++) me.cs(a + i, b + j, v);
    if (a === a1 && b === b1) break;
    var e2 = 2 * er; if (e2 > -dy) { er -= dy; a += sx; } if (e2 < dx) { er += dx; b += sy; }
  }
};
HDM.path = function (pts, k, s, t) { for (var i = 0; i < pts.length - 1; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], k, s, t); };
HDM.poly = function (pts, k, s) {
  var K = this.K, miny = 1e9, maxy = -1e9, n = pts.length, i;
  for (i = 0; i < n; i++) { miny = Math.min(miny, pts[i][1]); maxy = Math.max(maxy, pts[i][1]); }
  miny = Math.round(miny); maxy = Math.round(maxy); var hh = maxy - miny + 1;
  function sf(y) { return s === 'a' ? (hh < 3 ? 1 : ash(Math.min(0.999, Math.max(0, (y - miny + 0.5) / hh)))) : s; }
  var r0 = this.Y(miny), r1 = this.Y(maxy + 1);
  for (var r = r0; r < r1; r++) {
    var ya = (r + 0.5) / K - this.oy - 0.5, yy = Math.min(maxy, Math.max(miny, ya)) + 0.01, xs = [];
    for (i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; if ((p[1] <= yy && q[1] > yy) || (q[1] <= yy && p[1] > yy)) xs.push(p[0] + (yy - p[1]) * (q[0] - p[0]) / (q[1] - p[1])); }
    xs.sort(function (u, w) { return u - w; });
    var v = this.code(k, sf(ya));
    for (i = 0; i + 1 < xs.length; i += 2) for (var c = this.X(Math.floor(xs[i]) - 1); c < this.X(Math.ceil(xs[i + 1]) + 2); c++) {
      var xa = (c + 0.5) / K - this.ox - 0.5; if (xa >= xs[i] - 0.25 && xa <= xs[i + 1] + 0.25) this.cs(c, r, v);
    }
  }
  for (i = 0; i < n; i++) { // edges, so thin shapes never break up
    var a = pts[i], b = pts[(i + 1) % n], st = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * K * 1.5) + 1;
    for (var u = 0; u <= st; u++) { var lx = a[0] + (b[0] - a[0]) * u / st, ly = a[1] + (b[1] - a[1]) * u / st; this.cs(Math.floor((lx + 0.5 + this.ox) * K), Math.floor((ly + 0.5 + this.oy) * K), this.code(k, sf(ly))); }
  }
};
HDM.stamp = function (x, y, rows, map) {
  for (var j = 0; j < rows.length; j++) for (var i = 0; i < rows[j].length; i++) { var c = rows[j].charAt(i); if (c === '.' || c === ' ') continue; var m = map && map[c]; if (m) this.set(x + i, y + j, m[0], m[1]); else this.set(x + i, y + j, c, 1); }
};
HDM.part = function (fn, nosep) {
  var old = this.d, w = this.W, t = this.d = new Int16Array(this.W * this.H), i;
  try { fn.call(this, this); } finally { this.d = old; }
  for (i = 0; i < t.length; i++) if (t[i]) old[i] = t[i];
  if (!nosep) for (i = 0; i < t.length; i++) if (!t[i] && old[i] > 0) { var x = i % w; if ((x > 0 && t[i - 1]) || (x < w - 1 && t[i + 1]) || (i >= w && t[i - w]) || (i < t.length - w && t[i + w])) old[i] = (((old[i] - 1) >> 2) * 4) + 3 + 1; }
};
HDM.recolor = function (from, to, pred, s) {
  var c = this.ki[to]; if (c == null) return; var fs = {}, i;
  for (i = 0; i < from.length; i++) if (this.ki[from.charAt(i)] != null) fs[this.ki[from.charAt(i)]] = 1;
  for (var r = 0; r < this.H; r++) for (var x = 0; x < this.W; x++) { var v = this.d[r * this.W + x]; if (v > 0 && fs[(v - 1) >> 2] && (!pred || pred(this.CA[x], this.RA[r], (v - 1) & 3))) this.d[r * this.W + x] = c * 4 + (s == null ? ((v - 1) & 3) : s) + 1; }
};
// hi-res extras: fractional art coordinates (index space: a whole number is the middle of an art pixel)
HDM.fx = function (c) { return (c + 0.5) / this.K - this.ox - 0.5; };
HDM.fy = function (r) { return (r + 0.5) / this.K - this.oy - 0.5; };
HDM.recolorF = function (from, to, pred, s) {
  var c = this.ki[to]; if (c == null) return; var fs = {}, i;
  for (i = 0; i < from.length; i++) if (this.ki[from.charAt(i)] != null) fs[this.ki[from.charAt(i)]] = 1;
  for (var r = 0; r < this.H; r++) for (var x = 0; x < this.W; x++) { var v = this.d[r * this.W + x]; if (v > 0 && fs[(v - 1) >> 2] && pred(this.fx(x), this.fy(r), (v - 1) & 3)) this.d[r * this.W + x] = c * 4 + (s == null ? ((v - 1) & 3) : s) + 1; }
};
HDM.shadeF = function (from, fn) { // fn returns a new shade (0..3) or null
  var fs = {}, i; for (i = 0; i < from.length; i++) if (this.ki[from.charAt(i)] != null) fs[this.ki[from.charAt(i)]] = 1;
  for (var r = 0; r < this.H; r++) for (var x = 0; x < this.W; x++) { var j = r * this.W + x, v = this.d[j]; if (v > 0 && fs[(v - 1) >> 2]) { var n = fn(this.fx(x), this.fy(r), (v - 1) & 3, x, r); if (n != null) this.d[j] = v - ((v - 1) & 3) + n; } }
};
HDM.setF = function (xa, ya, k, s) { this.cs(Math.floor((xa + 0.5 + this.ox) * this.K), Math.floor((ya + 0.5 + this.oy) * this.K), this.code(k, s)); };
HDM.lineF = function (x0, y0, x1, y1, k, s) { var st = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * this.K * 1.5) + 1; for (var u = 0; u <= st; u++) this.setF(x0 + (x1 - x0) * u / st, y0 + (y1 - y0) * u / st, k, s); };
HDM.outline = function () {
  var w = this.W, d = this.d, n = [], i;
  for (i = 0; i < d.length; i++) if (!d[i]) { var x = i % w; if ((x > 0 && d[i - 1] > 0) || (x < w - 1 && d[i + 1] > 0) || (i >= w && d[i - w] > 0) || (i < d.length - w && d[i + w] > 0)) n.push(i); }
  for (i = 0; i < n.length; i++) d[n[i]] = -1;
};
HDM.bake = function (shadow, noOutline) {
  if (this.post) this.post(this);
  if (!noOutline) { this.outline(); if (this.opts.outline2) { // D: a second outline ring on the outer silhouette only (inner lines stay 1 px)
    var w2 = this.W, d2 = this.d, ring = [], ii; for (ii = 0; ii < d2.length; ii++) if (!d2[ii]) { var xx = ii % w2; if ((xx > 0 && d2[ii - 1] < 0) || (xx < w2 - 1 && d2[ii + 1] < 0) || (ii >= w2 && d2[ii - w2] < 0) || (ii < d2.length - w2 && d2[ii + w2] < 0)) ring.push(ii); }
    for (ii = 0; ii < ring.length; ii++) d2[ring[ii]] = -1; } }
  var W = this.W, H = this.H, d = this.d, K = this.K, sd = null, a0 = 0, sc = [24, 44, 24], x, y;
  if (shadow) {
    sd = new Uint8Array(W * H); a0 = Math.round((shadow[3] || 0.24) * 255); if (shadow[2]) sc = shadow[2];
    var e = 0.5 - 0.5 / K, Rx = shadow[0] + 0.4 + e, Ry = shadow[1] + 0.4 + e, cx = (shadow[4] || 0), cy = -1 + (shadow[5] || 0);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { var ex = (this.fx(x) - cx) / Rx, ey = (this.fy(y) - cy) / Ry; if (ex * ex + ey * ey <= 1) sd[y * W + x] = 1; }
  }
  var x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (d[y * W + x] || (sd && sd[y * W + x])) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
  var cw = x1 - x0 + 1, ch = y1 - y0 + 1, cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  var g = cv.getContext('2d'), im = g.createImageData(cw, ch), q = im.data, o = hexRgb(this.out);
  for (y = 0; y < ch; y++) for (x = 0; x < cw; x++) {
    var v = d[(y + y0) * W + x + x0], j = (y * cw + x) * 4, col = null;
    if (v > 0) col = this.cols[(v - 1) >> 2][(v - 1) & 3]; else if (v < 0) col = o;
    if (col) { q[j] = col[0]; q[j + 1] = col[1]; q[j + 2] = col[2]; q[j + 3] = 255; }
    else if (sd && sd[(y + y0) * W + x + x0]) { q[j] = sc[0]; q[j + 1] = sc[1]; q[j + 2] = sc[2]; q[j + 3] = a0; }
  }
  g.putImageData(im, 0, 0);
  return { c: cv, w: cw, h: ch, ax: this.X(0) - x0, ay: this.Y(1) - y0, K: K };
};
function hexRgb(c) { if (c.charAt(0) === '#') c = c.slice(1); var n = parseInt(c, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

function makeHD(K, Z, opts) {
  var post = makePost(Z);
  return function (p) {
    p.K = K; p.opts = opts || {}; p.W = Math.ceil(p.w * K) + 2; p.H = Math.ceil(p.h * K) + 2; p.d = new Int16Array(p.W * p.H);
    for (var m in HDM) p[m] = HDM[m];
    p.CA = new Int16Array(p.W); p.RA = new Int16Array(p.H);
    for (var n = 0, c = 0; c < p.W; n++) for (; c < Math.round((n + 1) * K) && c < p.W; c++) p.CA[c] = n - p.ox;
    for (n = 0, c = 0; c < p.H; n++) for (; c < Math.round((n + 1) * K) && c < p.H; c++) p.RA[c] = n - p.oy;
    p.post = post;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Generic detail passes, run on the fine grid just before the outline: eye shine, fur strokes, hair strands, rim light.
// ---------------------------------------------------------------------------------------------------------------------
var CUR = {};
function makePost(Z) {
  var h2 = Z._in.h2;
  return function (p) {
    var t = CUR.type; if (!t) return; var bold = !!(p.opts && p.opts.bold);
    var K = p.K, W = p.W, H = p.H, d = p.d, r, c, i, v, keyAt = [];
    for (var kk in p.ki) keyAt[p.ki[kk]] = kk;
    function key(v) { return v > 0 ? keyAt[(v - 1) >> 2] : ''; }
    function sh(v) { return (v - 1) & 3; }
    function setSh(i, s) { var v = d[i]; d[i] = v - ((v - 1) & 3) + s; }
    var NOFX = { K: 1, W: 1, N: 1, T: 1 };
    if (t === 'animal' || t === 'person') { // eye shine: the top front cell of each small dark eye becomes white
      var seen = new Uint8Array(W * H), kc = p.ki.K, wv = p.code('W', 1); var blobs = [];
      for (i = 0; i < d.length; i++) if (!seen[i] && d[i] > 0 && ((d[i] - 1) >> 2) === kc) {
        var st = [i], blob = []; seen[i] = 1;
        while (st.length) { var j = st.pop(); blob.push(j); [j - 1, j + 1, j - W, j + W].forEach(function (n) { if (n >= 0 && n < d.length && !seen[n] && d[n] > 0 && ((d[n] - 1) >> 2) === kc) { seen[n] = 1; st.push(n); } }); }
        if (blob.length >= (K >= 2 ? 4 : 3) && blob.length <= 12) blobs.push(blob);
      }
      var minTop = 1e9; blobs.forEach(function (b) { b.forEach(function (j) { minTop = Math.min(minTop, Math.floor(j / W)); }); });
      blobs.forEach(function (blob) { var bt = 1e9; blob.forEach(function (j) { bt = Math.min(bt, Math.floor(j / W)); }); if (bt > minTop + K) return;
        { var best = blob[0]; blob.forEach(function (j) { var br = Math.floor(best / W), jr = Math.floor(j / W); if (jr < br || (jr === br && j > best)) best = j; }); d[best] = wv; }
      });
    }
    if (t === 'animal') { // fur: short dark strokes falling downward and a few light flecks on the mid tone
      var dens = (CUR.fur == null ? (K >= 2 ? 0.045 : 0.035) : CUR.fur) * (bold ? 0.45 : 1);
      for (r = 0; r < H; r++) for (c = 0; c < W; c++) { i = r * W + c; v = d[i]; if (v <= 0 || NOFX[key(v)] || sh(v) !== 1) continue;
        var hs = h2(c, r, 77);
        if (hs < dens && r > 0 && d[i - W] > 0 && key(d[i - W]) === key(v)) { setSh(i, 2); if (K >= 2 && r + 1 < H && d[i + W] > 0 && key(d[i + W]) === key(v) && sh(d[i + W]) === 1) setSh(i + W, 2); }
      }
    }
    if (t === 'person') { // hair strands and cloth folds
      for (r = 0; r < H; r++) for (c = 0; c < W; c++) { i = r * W + c; v = d[i]; if (v <= 0) continue; var k = key(v);
        if (k === 'H' && sh(v) === 1 && ((c + (r >> 1)) % 3 === 0)) setSh(i, 2);
        if (!bold && (k === 'S' || k === 'C' || k === 'P') && sh(v) === 1 && h2(c, r, 5) < 0.07) setSh(i, 2);
        if ((k === 'S' || k === 'C') && r + 1 < H && key(d[i + W]) === 'P') setSh(i, 3);          // belt line
        if ((k === 'S' || k === 'C') && r > 0 && key(d[i - W]) === 'A' && sh(v) <= 1) setSh(i, 0); // collar
        if (k === 'F' && r > 0 && key(d[i - W]) !== 'F' && h2(c, r, 6) < 0.5) setSh(i, 0);           // shoe shine
      }
      if (bold) for (r = 1; r < H; r++) for (c = 0; c < W - 2; c++) { i = r * W + c; v = d[i]; var kq = key(v);
        if ((kq === 'S' || kq === 'C' || kq === 'P' || kq === 'V') && sh(v) === 1 && (d[i + 1] <= 0 || d[i + 2] <= 0)) setSh(i, 2);
        if (kq === 'H' && sh(v) !== 3 && d[i - W] > 0 && key(d[i - W]) === 'H' && r > 1 && d[i - 2 * W] <= 0 && (c & 1)) setSh(i, 0); }
      // a small mouth under the eyes
      var eyes = []; for (i = 0; i < d.length; i++) if (d[i] > 0 && key(d[i]) === 'K' && !(i >= W && key(d[i - W]) === 'K')) eyes.push(i);
      if (!bold && eyes.length >= 2 && eyes.length <= 4) { var e0 = eyes[0], e1 = eyes[eyes.length - 1], er = Math.max(Math.floor(e0 / W), Math.floor(e1 / W)), ec = Math.round(((e0 % W) + (e1 % W)) / 2);
        var mr = er + Math.round(3 * K); for (var mc = ec - Math.floor(K / 2); mc <= ec + Math.floor(K / 2); mc++) { var mi = mr * W + mc; if (d[mi] > 0 && key(d[mi]) === 'A') setSh(mi, 2); } }
    }
    if (bold) styleD(p, t, key, sh, setSh, h2);
    if (t === 'animal' || t === 'person' || t === 'building' || t === 'fence') { // rim light from above, a soft dark underside
      var snap = new Int16Array(d);
      for (r = 0; r < H; r++) for (c = 0; c < W; c++) { i = r * W + c; v = snap[i]; if (v <= 0 || key(v) === 'K' || key(v) === 'W') continue;
        var up = r > 0 ? snap[i - W] : 0, dn = r < H - 1 ? snap[i + W] : 0, lf = c > 0 ? snap[i - 1] : 0;
        if (up <= 0 && sh(v) === 1) setSh(i, 0);
        else if (lf <= 0 && sh(v) === 1 && t !== 'building' && (bold || h2(c, r, 9) < 0.6)) setSh(i, 0);
        else if (dn <= 0 && sh(v) <= 1 && t !== 'building') setSh(i, 2);
      }
    }
    if (t === 'fence') { // wood grain on rails and posts
      for (r = 0; r < H; r++) for (c = 0; c < W; c++) { i = r * W + c; v = d[i]; if (v <= 0 || sh(v) !== 1) continue; if (bold ? (r % 3 === 0 && h2(Math.floor(c / 4), r, 31) < 0.45) : h2(Math.floor(c / 3), r, 31) < 0.3) setSh(i, 2); }
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Featured subjects re-drawn with the same templates, then hi-res detail written in art coordinates.
// ---------------------------------------------------------------------------------------------------------------------
function installOverrides(Z) {
  var I = Z._in, SP = I.SP, quad = I.quad, trunked = I.trunked, spots = I.spots;
  SP.lion.draw = function (P, o) {
    var j = o.juv, cx, cy, m = quad(P, o, { len: 14, bh: 8, leg: 5, lw: 3, head: [8, 8], hd: [2, -1], snout: [3, 4, 2], snoutK: 'B', ear: ['round', 2, 'A'], tail: ['tuft', 6, 'M'],
      pre: function (P, m) { if (!j) P.part(function () {
        cx = m.hx - 1; cy = m.hy + 1;
        P.ell(cx, cy, 6.4, 6.4, 'M');
        for (var a = 0; a < 26; a++) { var t = a / 26 * 6.283, r0 = 5.6, r1 = 7.4 + ((a * 7) % 3) * 0.35; P.lineF(cx + Math.cos(t) * r0, cy + Math.sin(t) * r0, cx + Math.cos(t + 0.12) * r1, cy + Math.sin(t + 0.12) * r1, 'M', a % 2 ? 2 : 1); }
        P.shadeF('M', function (x, y) { var dx = x - cx, dy = y - cy, a = Math.atan2(dy, dx), rr = Math.sqrt(dx * dx + dy * dy), ph = frac(a / 6.283 * 15 + rr * 0.22); return ph < 0.26 ? 2 : (ph > 0.72 && rr > 2.5 && dy < 2 ? 0 : 1); });
      }); } });
    if (j) spots(P, 'A', 'C', m.x0 + 1, m.yt + 1, m.x1 - 2, m.yb - 2, 0.14, 3);
    // the near ear's seam line cut an arc across the face on the fine grid: smooth it back into the head
    P.shadeF('A', function (x, y, s) { return s === 3 && Math.hypot(x - m.hx, y - m.hy) < 3.6 ? 1 : null; });
    // muscle shading: lit shoulder, shaded haunch and belly line, light muzzle, dark tail tip strands
    P.shadeF('A', function (x, y, s) { if (y > m.yb) return null; var u = (x - (m.x1 - 3)) / 3.2, w = (y - (m.yt + 2)) / 2.4; if (u * u + w * w < 1 && s === 1) return 0; var u2 = (x - (m.x0 + 3)) / 3, w2 = (y - (m.yt + 4)) / 2.6; if (u2 * u2 + w2 * w2 < 1 && u2 > 0.2 && s === 1) return 2; return null; });
    P.shadeF('A', function (x, y, s) { return (Math.abs(y - (m.yb - 0.5)) < 0.3 && x > m.x0 + 2 && x < m.x1 - 2 && s === 1) ? 2 : null; });
    CUR.fur = P.K >= 2 ? 0.035 : 0.025;
  };
  SP.zebra.draw = function (P, o) {
    var m = quad(P, o, { len: 14, bh: 8, leg: 7, lw: 2, head: [7, 6], hd: [3, -4], nw: 4, snout: [4, 4, 1], snoutK: 'C', ear: ['point', 2], tail: ['tuft', 5, 'C'], foot: 'C', nose: 0,
      pre: function (P, m) { P.line(m.x1 - 3, m.yt, m.hx - 3, m.hy - 2, 'C', 1, 2); for (var y = 0; y < 7; y++) P.setF(m.x1 - 3 + (m.hx - m.x1) * y / 7 - 0.6, m.yt - 0.6 + (m.hy - 2 - m.yt) * y / 7, 'A', 1); } });
    P.recolorF('A', 'C', function (x, y) {
      if (y > m.yb + 0.3) return frac((y + 0.2) / 1.35) < 0.45;
      if (x >= m.hx - 2 && y <= m.hy + 3) return x < m.hx + 2 && frac((x + y) / 2.3) < 0.36 && Math.round(y) !== m.ey && Math.round(y) !== m.ey + 1;
      var bend = x < m.x0 + 4 ? (m.x0 + 4 - x) * 0.55 : 0, u = (x - y * (0.45 + bend * 0.12) + Math.sin(y * 0.8) * 0.5) / 2.25;
      return frac(u) < 0.4;
    });
    P.shadeF('A', function (x, y, s) { return (y > m.yb - 2.2 && y <= m.yb + 0.3 && s === 1) ? 2 : null; });
    CUR.fur = 0.02;
  };
  SP.giraffe.draw = function (P, o) {
    var m = quad(P, o, { len: 12, bh: 7, leg: 10, lw: 2, head: [6, 5], hd: [5, -13], nw: 3, snout: [4, 3, 1], ear: ['point', 1], tail: ['tuft', 6, 'T'], foot: 'T',
      pre: function (P, m) { P.line(m.x1 - 2, m.yt - 1, m.hx - 3, m.hy, 'C', 1, 1); } });
    P.rect(m.hx - 1, m.hy - 4, 1, 2, 'A', 1); P.set(m.hx - 1, m.hy - 5, 'T'); P.rect(m.hx + 1, m.hy - 4, 1, 2, 'A', 1); P.set(m.hx + 1, m.hy - 5, 'T');
    var h2 = I.h2;
    function vor(x, y) { // distance to the nearest patch border of a jittered grid of patch centres
      var gx = Math.floor(x / 2.7), gy = Math.floor(y / 2.5), d1 = 9, d2 = 9;
      for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) { var px = (gx + a + 0.2 + h2(gx + a, gy + b, 3) * 0.6) * 2.7, py = (gy + b + 0.2 + h2(gx + a, gy + b, 4) * 0.6) * 2.5, dd = Math.hypot(x - px, (y - py) * 1.1); if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd; }
      return d2 - d1;
    }
    P.recolorF('A', 'C', function (x, y) { if (y > -3.6 || (x > m.hx - 1 && y < m.hy + 3)) return false; return vor(x + 40, y + 40) > 0.42; });
    P.shadeF('C', function (x, y, s) { if (y > -3.6 || s !== 1) return null; var v = vor(x + 40, y + 40); return v > 0.42 && v < 0.75 ? 2 : null; });
    CUR.fur = 0.03;
  };
  SP.elephant.draw = function (P, o) {
    var m = trunked(P, o, { len: 15, bh: 11, leg: 5, head: [10, 10], hd: [0, 1], earS: [3.4, 5],
      tusk: function (P, m, x, y) { if (m.j) { P.set(x + 1, y + 1, 'T', 1); return; } P.path([[x, y], [x + 3, y + 2], [x + 5, y + 1]], 'T', 0, 1); P.path([[x, y + 1], [x + 3, y + 3]], 'T', 1, 1); } });
    // skin: wrinkle rings on the legs and trunk, fold lines on the body, veins in the ear, toenails
    P.shadeF('A', function (x, y, s) {
      if (s !== 1) return null;
      if (y > m.yb + 0.4) return frac((y + 0.3) / 1.3) < 0.28 ? 2 : null;
      if (x > m.hx + 2) return frac(y / 1.15) < 0.3 ? 2 : null;
      var f1 = Math.abs(x - (m.x0 + 3.5) - Math.sin(y * 0.9) * 0.5) < 0.3, f2 = Math.abs(x - (m.x1 - 3) - Math.sin(y * 0.8) * 0.6) < 0.3 && y > m.yt + 3;
      return (f1 || f2) && y > m.yt + 2 ? 2 : null;
    });
    P.shadeF('E', function (x, y, s) { return frac((x * 0.6 + y * 0.4) / 1.7) < 0.22 ? 2 : (s === 1 && frac((x + y) / 3.1) > 0.85 ? 0 : null); });
    [m.nbx, m.nfx].forEach(function (lx) { for (var n = 0; n < 2; n++) P.setF(lx + 0.6 + n * 1.6 + (m.sg ? 0 : 0), -1.25, 'T', 0); });
    CUR.fur = 0.03;
  };
  // big cats: real open rosettes drawn on the fine grid (a broken dark ring round a warmer middle)
  function rosetteF(P, x0, x1, y1) {
    var h2 = I.h2;
    function near(x, y) { var gx = Math.floor(x / 4.4), gy = Math.floor(y / 3.8), best = 9, bx = 0, by = 0;
      for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) { var px = (gx + a + 0.25 + h2(gx + a, gy + b, 5) * 0.5) * 4.4 + ((gy + b) & 1) * 2.2, py = (gy + b + 0.25 + h2(gx + a, gy + b, 6) * 0.5) * 3.8, dd = Math.hypot(x - px, y - py); if (dd < best) { best = dd; bx = x - px; by = y - py; } }
      return [best, Math.atan2(by, bx)]; }
    P.recolorF('C', 'A', function (x, y) { return x >= x0 && x <= x1 && y <= y1; });
    P.recolorF('A', 'C', function (x, y) { if (x < x0 || x > x1 || y > y1) return false; var n = near(x + 40, y + 40); return n[0] > 0.95 && n[0] < 1.55 && Math.cos(n[1] - (x * 1.3 + y)) < 0.55; });
    P.shadeF('A', function (x, y, s) { if (x < x0 || x > x1 || y > y1) return null; var n = near(x + 40, y + 40); return n[0] <= 0.95 && s === 1 ? 2 : null; });
  }
  SP.jaguar.draw = function (P, o) {
    var m = quad(P, o, { len: 14, bh: 8, leg: 4, lw: 3, head: [9, 8], hd: [2, -1], snout: [3, 4, 2], snoutK: 'B', ear: ['round', 2, 'A', 'C'], tail: ['cat', 7, 'A', 2] });
    rosetteF(P, -40, m.hx - 4, -1.5);
    P.set(m.hx - 2, m.hy - 2, 'C'); P.set(m.hx - 3, m.hy, 'C'); P.set(m.hx - 1, m.hy + 2, 'C');
  };
  SP.snowleopard.draw = function (P, o) {
    var m = quad(P, o, { len: 14, bh: 7, leg: 4, lw: 3, head: [8, 7], hd: [2, -1], snout: [3, 4, 2], snoutK: 'B', ear: ['round', 1], tail: ['cat', 9, 'A', 3], tailY: 1, br: 2 });
    rosetteF(P, m.x0, m.hx - 3.5, -2.5);
    P.recolor('A', 'C', function (x, y) { return x < m.x0 - 1 && (((x + y) % 3) + 3) % 3 === 0; });
  };
  // the snack stand, same build as sprites.js plus roof tiles, scalloped awning, plank door, cups on the counter, a shine on the sign
  var B = I.BUILD, box = I.box, hip = I.hip, stripes = I.stripes, Bp = I.Bp, fin = I.fin;
  B.snack = function () {
    var P = Bp({ A: '#fbf0d0', R: '#e8503a', D: '#7a5430', G: '#4a3a44', C: '#f4c838', M: '#c89858', B: '#b8844a', L: '#6ab04a' }), o = box(P, 0, 1, 9, 9, 10, 'A', 'A', 'R');
    function flF(u, v, k, s) { P.setF(o.Lx + u, o.Ly + u / 2 - v, k, s); }
    function frF(u, v, k, s) { P.setF(o.Fx + u, o.Ry + (2 * o.b - 1 - u) / 2 - v, k, s); }
    o.rl(3, 3, 12, 5, 'G', 1); o.rl(2, 2, 14, 1, 'M', 0); o.fl(6, 4, 'C', 1); o.fl(7, 4, 'C', 1); o.fl(10, 4, 'R', 1); o.fl(13, 5, 'L', 1);
    // counter: cups with straws, a stack of buns, a lit menu strip
    for (var q = 0; q < 3; q++) { var u0 = 3.8 + q * 1.2; flF(u0, 3.6, 'W', 1); flF(u0, 4.2, 'W', 1); flF(u0 + 0.3, 4.9, 'R', 1); }
    flF(8.6, 3.5, 'C', 2); flF(9.2, 3.7, 'C', 0); flF(11.5, 3.4, 'L', 0); flF(12, 3.4, 'L', 1); flF(13.2, 6.6, 'C', 0); flF(14, 6.4, 'W', 1);
    o.rr(6, 0, 6, 7, 'D', 2); o.fr(10, 3, 'C', 1);
    P.shadeF('D', function (x, y, s, c) { return (c % Math.round(1.5 * P.K) === 0) ? 3 : null; });
    for (var u = 0; u < 18; u++) { for (var v = 8; v < 11; v++) { o.fl(u, v, (u % 6) < 3 ? 'R' : 'W', 1); o.fr(u, v, (u % 6) < 3 ? 'W' : 'R', 2); } }
    for (u = 0; u < 18; u += 0.5 / P.K * 2) { var w = u % 3, dep = Math.sqrt(Math.max(0, 1 - Math.pow((w - 1.5) / 1.5, 2))) * 1.1;
      for (var dv = 0; dv < dep; dv += 0.5 / P.K) { flF(u, 7.9 - dv, (u % 6) < 3 ? 'R' : 'W', 2); frF(u, 7.9 - dv, (u % 6) < 3 ? 'W' : 'R', 2); } }
    P.part(function () {
      hip(P, o, 6, 'R', 'R', 2);
      P.shadeF('RW', function (x, y, s, c, r) { var t = x < o.Fx ? y - 0.5 * (x - o.Fx) : y + 0.5 * (x - o.Fx); var f = frac(t / 2.6); return (f < 1 / (2.6 * P.K) && s < 2) ? s + 1 : null; });
    }, true);
    stripes(P, 'R', 'W', -40, o.Fy - o.h - 1, 3);
    P.part(function () { P.rr(-4, o.apex[1] - 5, 9, 3, 'B', null, 1); P.rect(-4, o.apex[1] - 2, 9, 1, 'L', 1); P.rect(-4, o.apex[1] - 1, 9, 1, 'D', 1); P.rr(-4, o.apex[1], 9, 2, 'B', 2, 1); P.set(-1, o.apex[1] - 5, 'W'); P.set(2, o.apex[1] - 4, 'W');
      P.setF(-2.7, o.apex[1] - 4.6, 'W', 1); P.setF(-2.2, o.apex[1] - 4.6, 'W', 1); for (var x = -3.6; x < 4.6; x += 0.9) P.setF(x, o.apex[1] - 1.3, 'L', 0); });
    P.shadeF('A', function (x, y, s) { var vv = o.Ly + (x - o.Lx) / 2 - y; return (x < o.Fx && vv < 0.7 && vv > -0.2) ? 2 : null; });
    return fin(P, 19, 8, 1, 3);
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Ground tiles on the fine grid: exact hex from ZGeo per fine pixel, 1-pixel edge lines, grass blades, paving stones.
// ---------------------------------------------------------------------------------------------------------------------
function ramp(b, mix) { return [mix(b, '#fff8dc', 0.36), b, mix(b, '#2b1b42', 0.27), mix(b, '#22152f', 0.52)]; }
function hiTile(Z, kind, seed, K) {
  var mix = Z._mix, h2 = Z._in.h2, GR = Z._in.GROUND, pal = {}, k, hab = kind.indexOf('hab:') === 0, name = hab ? kind.slice(4) : kind;
  for (k in GR[name]) pal[k] = GR[name][k];
  if (name === 'grass') { var tone = Math.floor(seed / 6) % 3; if (tone === 1) ['A', 'B', 'C'].forEach(function (q) { pal[q] = mix(pal[q], '#f4f08a', 0.1); }); else if (tone === 2) ['A', 'B', 'C'].forEach(function (q) { pal[q] = mix(pal[q], '#2f7a4a', 0.1); }); }
  pal.Z = mix(pal.A, pal.D, 0.8); pal.H = mix(pal.A, '#ffffff', 0.3);
  var LIP = 3, ox = G.HW + 1, oy = G.HH + 1, Wc = Math.ceil((G.W + 2) * K), Hc = Math.ceil((G.H + LIP + 2) * K);
  var cv = document.createElement('canvas'); cv.width = Wc; cv.height = Hc; var g = cv.getContext('2d'), im = g.createImageData(Wc, Hc), q = im.data;
  var ins = new Uint8Array(Wc * Hc), col = new Array(Wc * Hc), r, c, i;
  function inH(c, r) { if (c < 0 || r < 0 || c >= Wc || r >= Hc) return false; var a = G.toAxial((c + 0.5) / K - ox + 0.013, (r + 0.5) / K - oy + 0.007); return a.q === 0 && a.r === 0; }
  for (r = 0; r < Hc; r++) for (c = 0; c < Wc; c++) ins[r * Wc + c] = inH(c, r) ? 1 : 0;
  function IN(c, r) { return c >= 0 && r >= 0 && c < Wc && r < Hc && ins[r * Wc + c] === 1; }
  function put(c, r, cl) { c = Math.round(c); r = Math.round(r); if (IN(c, r)) col[r * Wc + c] = cl; }
  var rd = Z._in.rng(seed * 31 + name.length * 7 + 5), A = ramp(pal.A, mix);
  for (r = 0; r < Hc; r++) for (c = 0; c < Wc; c++) {
    i = r * Wc + c;
    if (ins[i]) {
      var v = h2(c, r, seed * 13 + 1), cl = pal.A, xa = (c + 0.5) / K - ox, ya = (r + 0.5) / K - oy;
      if (name === 'path') { // diamond pavers like the live tile, each with a lit top-left edge and a few pebbles
        var a = (xa + 2 * ya) / 12, b = (xa - 2 * ya) / 12, fa = frac(a), fb = frac(b), e = 1 / (12 * K) * 1.6;
        cl = (fa < e || fb < e) ? pal.B : ((fa < 2 * e || fb < 2 * e) ? pal.C : (v < 0.06 ? pal.B : v > 0.95 ? pal.C : pal.A));
      } else if (name === 'grass') cl = v < 0.1 ? pal.B : v > 0.9 ? pal.C : pal.A;
      else cl = v < 0.08 ? pal.B : v > 0.93 ? pal.C : pal.A;
      col[i] = cl;
    } else { for (var l = 1; l <= Math.round(LIP * K); l++) if (IN(c, r - l)) { col[i] = l <= K ? pal.L : mix(pal.L, '#1c1226', 0.3); break; } }
  }
  // details
  function blade(c, r, hgt, lean, dark, mid, tip) { for (var j = 0; j < hgt; j++) put(c + Math.round(lean * j / hgt), r - j, j === 0 ? dark : j === hgt - 1 ? tip : mid); }
  function tuft(c, r, dark, mid, tip) { var hgt = Math.max(2, Math.round(K * 1.6)); blade(c, r, hgt, -1, dark, mid, tip); blade(c + Math.round(K), r, hgt + 1, 0, dark, mid, tip); blade(c + 2 * Math.round(K), r, hgt, 1, dark, mid, tip); }
  function rp(m) { return [Math.round(((rd() - 0.5) * (G.W - 14) + ox) * K), Math.round(((rd() - 0.5) * (G.H - (m || 10)) + oy) * K)]; }
  var n, p;
  if (name === 'grass') {
    for (n = 0; n < Math.round(7 * K); n++) { p = rp(); tuft(p[0], p[1], pal.D, mix(pal.B, pal.D, 0.3), pal.C); }
    if (seed % 3 === 2) for (n = 0; n < 3; n++) { p = rp(12); var fc = n % 2 ? '#ffffff' : '#f4d040'; put(p[0], p[1], fc); put(p[0] + 1, p[1], fc); put(p[0], p[1] + 1, fc); put(p[0] + 1, p[1] + 1, '#f0a020'); put(p[0], p[1] + 2, pal.D); }
  } else if (name === 'path') {
    for (n = 0; n < 6; n++) { p = rp(); put(p[0], p[1], pal.D); put(p[0] + 1, p[1], pal.B); put(p[0], p[1] - 1, pal.C); }
  } else if (name === 'savanna') {
    for (n = 0; n < Math.round(6 * K); n++) { p = rp(); tuft(p[0], p[1], pal.D, n % 3 === 0 ? pal.G : mix(pal.A, pal.D, 0.5), n % 3 === 0 ? mix(pal.G, '#ffffff', 0.3) : pal.C); }
    for (n = 0; n < 5; n++) { p = rp(); put(p[0], p[1], '#b8a890'); put(p[0] + 1, p[1], '#8a7a66'); put(p[0], p[1] - 1, '#e8dcc8'); }
  }
  // hex edge lines, one fine pixel wide
  for (r = 0; r < Hc; r++) for (c = 0; c < Wc; c++) { i = r * Wc + c; if (!ins[i]) continue; if (!IN(c, r + 1) || !IN(c + 1, r)) col[i] = pal.Z; else if (!IN(c, r - 1) || !IN(c - 1, r)) col[i] = pal.H; }
  for (i = 0; i < col.length; i++) if (col[i]) { var rgb = hexRgb(col[i]); q[i * 4] = rgb[0]; q[i * 4 + 1] = rgb[1]; q[i * 4 + 2] = rgb[2]; q[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0);
  return { c: cv, w: Wc, h: Hc, ax: ox * K, ay: oy * K, K: K };
}

function dTile(Z, kind, seed) {
  var src = LIVE.tile(kind, seed), K = 2, h2 = Z._in.h2, GR = Z._in.GROUND, name = kind.indexOf('hab:') === 0 ? kind.slice(4) : kind, pal = GR[name];
  var cv = document.createElement('canvas'); cv.width = src.w * K; cv.height = src.h * K; var g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false; g.drawImage(src.c, 0, 0, cv.width, cv.height);
  var im = g.getImageData(0, 0, cv.width, cv.height), q = im.data, ax = src.ax * K, ay = (src.ay) * K, rd = Z._in.rng(seed * 17 + 3);
  function IN(c, r) { var a = G.toAxial((c + 0.5) / K - ax / K + 0.013, (r + 0.5) / K - ay / K + 0.007); return a.q === 0 && a.r === 0; }
  function put(c, r, col) { if (c < 2 || r < 2 || c >= cv.width - 2 || r >= cv.height - 2 || !IN(c, r) || !IN(c, r + 2) || !IN(c + 2, r) || !IN(c - 2, r)) return; var rgb = hexRgb(col), i = (r * cv.width + c) * 4; q[i] = rgb[0]; q[i + 1] = rgb[1]; q[i + 2] = rgb[2]; q[i + 3] = 255; }
  function blade(c, r, hgt, lean, dk, md, tp) { for (var j = 0; j < hgt; j++) put(c + Math.round(lean * j / hgt), r - j, j === 0 ? dk : j === hgt - 1 ? tp : md); }
  function tuft(c, r, dk, md, tp) { blade(c, r, 3, -1, dk, md, tp); blade(c + 2, r, 4, 0, dk, md, tp); blade(c + 4, r, 3, 1, dk, md, tp); }
  function rp() { return [Math.round(ax + (rd() - 0.5) * (G.W - 16) * K), Math.round(ay + (rd() - 0.5) * (G.H - 12) * K)]; }
  var n, p, mix = Z._mix;
  if (name === 'grass') for (n = 0; n < 4; n++) { p = rp(); tuft(p[0], p[1], pal.D, mix(pal.B, pal.D, 0.4), pal.C); }
  else if (name === 'savanna') for (n = 0; n < 5; n++) { p = rp(); tuft(p[0], p[1], pal.D, n % 2 ? pal.G : mix(pal.A, pal.D, 0.5), n % 2 ? mix(pal.G, '#ffffff', 0.3) : pal.C); }
  else if (name === 'path') for (n = 0; n < 4; n++) { p = rp(); put(p[0], p[1], pal.D); put(p[0] + 1, p[1], pal.D); put(p[0], p[1] - 1, pal.C); put(p[0] + 1, p[1] - 1, pal.B); }
  g.putImageData(im, 0, 0);
  return { c: cv, w: cv.width, h: cv.height, ax: ax, ay: ay, K: K };
}


// =====================================================================================================================
// FIRST-10% TEMPLATE in style D (owner's request): test/art-template10.js calls window.__template().
// The sheet shows today's sprite ("now") beside the D sprite ("new") at 4x; the scene uses only D art at real phone size
// (390 CSS px wide at 3x). Nothing in the game changes.
// =====================================================================================================================
function flipD(s) { var c = document.createElement('canvas'); c.width = s.w; c.height = s.h; var g = c.getContext('2d'); g.translate(s.w, 0); g.scale(-1, 1); g.drawImage(s.c, 0, 0); return { c: c, w: s.w, h: s.h, ax: s.w - s.ax - (s.K || 1), ay: s.ay, K: s.K }; }
function spr(which, o) { // which: 'A' (live) or 'D'
  var Z = which === 'A' ? LIVE : window.ZS_D, K = which === 'A' ? 1 : 2, s;
  if (o.t === 'tile') return K === 1 ? LIVE.tile(o.kind, o.seed) : dTile(Z, o.kind, o.seed);
  if (K === 1 && o.flip) return o.t === 'animal' ? LIVE.animal(o.id, { frame: o.frame, variant: o.variant, juv: o.juv, flip: true }) : LIVE.person(o.id, { frame: o.frame, seed: o.seed, flip: true });
  CUR = { type: o.t === 'deco' ? 'animal' : o.t === 'entrance' ? 'building' : o.t }; if (o.t === 'deco') CUR.fur = 0.1;
  if (o.t === 'animal' && o.id === 'gorilla') CUR.fur = 0.16; if (o.t === 'animal' && (o.id === 'penguin' || o.id === 'toucan')) CUR.fur = 0.09;
  var op = { frame: o.frame, variant: o.variant, juv: o.juv, seed: o.seed };
  if (o.t === 'animal') s = Z.animal(o.id, op); else if (o.t === 'person') s = Z.person(o.id, op);
  else if (o.t === 'building') s = Z.building(o.id); else if (o.t === 'fence') s = Z.fence(o.biome || 'savanna', o.e);
  else if (o.t === 'deco') s = Z.deco(o.id, o.seed || 0); else if (o.t === 'entrance') s = Z.entrance();
  CUR = {};
  if (o.flip) s = flipD(s);
  return s;
}
function putS(g, s, x, y, dev) { var K = s.K || 1, f = dev / K; g.drawImage(s.c, Math.round(x - s.ax * f), Math.round(y - s.ay * f), s.w * f, s.h * f); }
function txt(g, t, x, y, sz, col, al) { g.font = (sz > 20 ? 'bold ' : '') + (sz || 16) + 'px system-ui, sans-serif'; g.textAlign = al || 'center'; g.fillStyle = col || '#3a2a1a'; g.fillText(t, x, y); }
function habScene(g, list, ox, oy, dev, which, extra) { // list of [q, r, kind]; fences around habitat hexes; extra objects
  var tiles = [], objs = [], HB = {};
  list.forEach(function (h) { if (h[2].indexOf('hab:') === 0) HB[h[0] + ',' + h[1]] = h[2].slice(4); });
  list.forEach(function (h) { var p = G.toScreen(h[0], h[1]); tiles.push({ kind: h[2], seed: ((h[0] * 7 + h[1] * 13) % 18 + 18) % 18, x: p.x, y: p.y });
    var b = HB[h[0] + ',' + h[1]]; if (b) for (var e = 0; e < 6; e++) { var nb = G.EDGES[e][0]; if (HB[(h[0] + nb[0]) + ',' + (h[1] + nb[1])] !== b) objs.push({ t: 'fence', biome: b, e: e, x: p.x, y: p.y, sy: p.y + G.edgeMidY(e) }); } });
  (extra || []).forEach(function (o) { if (o.sy == null) o.sy = o.y + (o.t === 'entrance' ? G.HH : 0); objs.push(o); });
  tiles.sort(function (a, b) { return a.y - b.y || a.x - b.x; }); objs.sort(function (a, b) { return a.sy - b.sy; });
  tiles.forEach(function (t) { putS(g, spr(which, { t: 'tile', kind: t.kind, seed: t.seed }), ox + t.x * dev, oy + t.y * dev, dev); });
  objs.forEach(function (o) { putS(g, spr(which, o), ox + o.x * dev, oy + o.y * dev, dev); });
}

// =====================================================================================================================
// STYLE D detail passes (bold mode). Called from makePost before the rim light, on the fine grid.
// Helpers work in art "edge" coordinates: art pixel i spans [i, i + 1), so half a pixel is one fine pixel.
// =====================================================================================================================
window.__onPerson = function (sp, fr) { CUR.spec = sp; CUR.fr = fr; };
function fineCells(p, x0, y0, x1, y1, fn) {
  var K = p.K, r0 = Math.round((y0 + p.oy) * K), r1 = Math.round((y1 + p.oy) * K), c0 = Math.round((x0 + p.ox) * K), c1 = Math.round((x1 + p.ox) * K);
  for (var r = Math.max(0, r0); r < Math.min(p.H, r1); r++) for (var c = Math.max(0, c0); c < Math.min(p.W, c1); c++) fn(r * p.W + c, c, r);
}
function styleD(p, t, key, sh, setSh, h2) {
  var d = p.d, W = p.W, H = p.H, K = p.K, r, c, i, v;
  function paint(x0, y0, x1, y1, k, s, only) { if (p.ki[k] == null) return; var nv = p.code(k, s); fineCells(p, x0, y0, x1, y1, function (i) { if (!only || (d[i] > 0 && only.indexOf(key(d[i])) >= 0)) d[i] = nv; }); }
  function shade(x0, y0, x1, y1, s, only) { fineCells(p, x0, y0, x1, y1, function (i) { if (d[i] > 0 && (!only || only.indexOf(key(d[i])) >= 0)) setSh(i, s); }); }
  if (t === 'person' && CUR.spec) personD(p, CUR.spec, CUR.fr | 0, key, paint, shade);
  if (t === 'animal') {
    var tex = CUR.tex || 'fur', body = CUR.texKeys || 'AC';
    for (r = 1; r < H - 1; r++) for (c = 1; c < W - 1; c++) {
      i = r * W + c; v = d[i]; if (v <= 0) continue; var k = key(v), s = sh(v); if (body.indexOf(k) < 0 || s === 3) continue;
      var same = d[i - W] > 0 && key(d[i - W]) === k && d[i + W] > 0 && key(d[i + W]) === k;
      if (tex === 'feather') { var rr = r % 4, cc = (c + (Math.floor(r / 4) % 2) * 2) % 4; if (same && s === 1 && ((rr === 3 && (cc === 1 || cc === 2)) || (rr === 2 && (cc === 0 || cc === 3)))) setSh(i, 2); }
      else if (tex === 'scale') { var row4 = Math.floor(r / 4), r4 = r % 4, c4 = (c + (row4 % 2) * 2) % 4; if (same && s === 1 && h2(Math.floor((c + (row4 % 2) * 2) / 4), row4, 23) < 0.55 && ((r4 === 3 && (c4 === 1 || c4 === 2)) || (r4 === 2 && c4 === 0))) setSh(i, 2); }
      else if (tex === 'shaggy') { if (same && s <= 1 && h2(c, Math.floor(r / 3), 41) < 0.11 && (r % 3) !== 2) setSh(i, 2); }
      else if (tex === 'skin') { if (same && s === 1 && r % 2 === 0 && c % 2 === 0 && h2(c >> 1, r >> 1, 29) < 0.07) setSh(i, 2); }
      else if (tex === 'wet') { if (d[i - W] > 0 && r > 1 && d[i - 2 * W] <= 0 && s === 1) setSh(i, 0); }
      else if (tex === 'leaf') { if (s === 1 && ((c + 2 * r) % 7 === 0 && r % 3 === 0)) setSh(i, 2); else if (s === 1 && ((c - r + 70) % 6 === 0 && r % 4 === 1)) setSh(i, 0); }
    }
    if (CUR.rosette && p.ki.C != null) { // big-cat spots become open rosettes: a broken dark ring round a warmer middle
      var kC = p.ki.C, kA = p.ki.A, snap0 = new Int16Array(d), isC = function (j) { return snap0[j] > 0 && ((snap0[j] - 1) >> 2) === kC; }, isA = function (j) { return snap0[j] > 0 && ((snap0[j] - 1) >> 2) === kA; };
      for (r = 2; r < H - 3; r++) for (c = 2; c < W - 3; c++) { i = r * W + c;
        if (!(isC(i) && isC(i + 1) && isC(i + W) && isC(i + W + 1) && !isC(i - 1) && !isC(i - W) && !isC(i + 2) && !isC(i + 2 * W))) continue;
        [i, i + 1, i + W, i + W + 1].forEach(function (j) { d[j] = p.code('A', 2); });
        [[-1, 0], [-1, 1], [0, -1], [1, -1], [2, 1], [0, 2], [1, 2]].forEach(function (o2) { var j = i + o2[1] * W + o2[0]; if (isA(j)) d[j] = p.code('C', 1); });
      } }
    if (CUR.pupil && p.ki.W != null) { var kW = p.ki.W; for (i = W; i < d.length - W - 1; i++) { var isW = function (j) { return d[j] > 0 && ((d[j] - 1) >> 2) === kW; };
      if (isW(i) && isW(i + 1) && isW(i + W) && isW(i + W + 1) && !isW(i - 1) && !isW(i - W)) { d[i] = d[i + W] = d[i + W + 1] = p.code('K', 1); } } }
    if (CUR.sparkle && p.ki.W != null) { var n = 0, wv = p.code('W', 1); for (i = W * 2; i < d.length - W * 2 && n < 3; i += 7) if (d[i] > 0 && body.indexOf(key(d[i])) >= 0 && h2(i, 3, 17) < 0.012 && d[i - 1] > 0 && d[i + 1] > 0 && d[i - W] > 0 && d[i + W] > 0) { d[i] = wv; d[i - 1] = wv; d[i + 1] = wv; d[i - W] = wv; d[i + W] = wv; n++; } }
    if (CUR.bark) for (r = 0; r < H; r++) for (c = 0; c < W; c++) { i = r * W + c; v = d[i]; if (v > 0 && key(v) === 'T' && sh(v) === 1 && c % 3 === 0 && (r % 5) !== 0) setSh(i, 2); }
  }
  if (t === 'building' && !CUR.noSiding) { // siding / brick courses on walls and roofs: a darker line every 2 art pixels, staggered joints
    var snap = new Int16Array(d);
    for (r = 1; r < H - 1; r++) for (c = 0; c < W; c++) { i = r * W + c; v = snap[i]; if (v <= 0) continue; var s2 = sh(v), k2 = key(v); if (s2 === 3 || k2 === 'W' || k2 === 'K' || k2 === 'Y') continue;
      if (!(snap[i - W] > 0 && key(snap[i - W]) === k2 && snap[i + W] > 0 && key(snap[i + W]) === k2)) continue;
      var wide = true; for (var dc = -4; dc <= 4 && wide; dc++) for (var dr = -3; dr <= 3; dr += 3) { var jj = i + dr * W + dc; if (!(snap[jj] > 0 && key(snap[jj]) === k2)) { wide = false; break; } }
      if (wide && r % 6 === 0 && s2 < 2) setSh(i, s2 + 1);
    }
  }
}
function personD(p, sp, fr, key, paint, shade) {
  var d = p.d, ch = !!sp.child, legH = ch ? 2 : 3, bodyH = ch ? 4 : 5, bw = ch ? 5 : 7, hw = ch ? 8 : 9, hh = ch ? 7 : 8;
  var by = -legH - bodyH, bx = -Math.floor(bw / 2), top = by - hh, hx0 = -Math.floor(hw / 2), ey = top + (ch ? 3 : 4), bk = sp.coat ? 'C' : 'S', sg = fr === 1 ? 1 : fr === 3 ? -1 : 0;
  if (p.ki.q == null) p.key('q', '#f2a0a0'); if (p.ki.g == null) p.key('g', '#f4c838'); if (p.ki.m == null) p.key('m', '#8a3a3a');
  // face: rounder eyes with a shine, brows, nose, mouth, cheeks
  if (!sp.glasses) [0, 3].forEach(function (ex) { paint(ex, ey, ex + 1, ey + 2, 'A', 1, 'K'); paint(ex, ey, ex + 1, ey + 1.5, 'K', 1, 'A'); paint(ex + 0.5, ey, ex + 1, ey + 0.5, 'W', 1, 'K'); paint(ex, ey - 1, ex + 1, ey - 0.5, 'H', 2, 'A'); });
  paint(2, ey + 1.5, 2.5, ey + 2, 'A', 2, 'A');
  if (!sp.stache && !sp.beard) { paint(1, ey + 2.5, 2.5, ey + 3, 'm', 1, 'A'); if (sp.smile) { paint(0.5, ey + 2, 1, ey + 2.5, 'm', 1, 'A'); paint(2.5, ey + 2, 3, ey + 2.5, 'm', 1, 'A'); } }
  paint(-1.5, ey + 2, -0.5, ey + 2.5, 'q', 1, 'A'); paint(4, ey + 2, 5, ey + 2.5, 'q', 1, 'A');
  shade(hx0, ey + 0.5, hx0 + 0.5, ey + 2, 2, 'A'); // ear shadow line
  // hair: a soft highlight band and darker roots
  shade(hx0 + 1.5, top + 0.5, hx0 + 4.5, top + 1, 0, 'H'); shade(hx0 + 1, top + 1, hx0 + 2, top + 1.5, 0, 'H');
  shade(hx0, top + 2.5, hx0 + hw, top + 3, 2, 'H');
  // clothes: neckline, folds under the arms, cuffs, belt and buckle, darker hem
  if (!sp.tie && !sp.neck && !sp.scarf && !sp.open && !sp.dress) { paint(0, by, 2, by + 0.5, 'A', 1, 'SC'); paint(0.5, by + 0.5, 1.5, by + 1, 'A', 2, 'SC'); }
  for (var tt = 0; tt < bodyH - 1.5; tt += 0.5) { shade(bx + 0.5 + tt * 0.35, by + 1.5 + tt, bx + 1 + tt * 0.35, by + 2 + tt, 2, bk + 'V'); shade(bx + bw - 1 - tt * 0.35, by + 1.5 + tt, bx + bw - 0.5 - tt * 0.35, by + 2 + tt, 2, bk + 'V'); }
  var sl = sp.short ? 2 : bodyH - 2, a1 = sg > 0 ? -1 : 0, a2 = sg < 0 ? -1 : 0;
  shade(bx - 1, by + 1 + a1 + sl - 0.5, bx, by + 1 + a1 + sl, 2, bk); shade(bx + bw, by + 1 + a2 + sl - 0.5, bx + bw + 1, by + 1 + a2 + sl, 2, bk);
  if (!sp.dress && !sp.coat) { paint(0.5, by + bodyH - 0.5, 1.5, by + bodyH, 'g', 1, 'SXJ'); }
  if (sp.coat && sp.open) { paint(-0.5, by + 1.5, 0, by + 2, 'g', 0, 'C'); paint(-0.5, by + 3, 0, by + 3.5, 'g', 0, 'C'); }
  shade(-3, -legH + 0.5, 4, -legH + 1, 2, 'P'); // knee crease
  shade(-3, -0.5, 4, 0, 3, 'F'); // shoe soles
}

// ---------- icons in style D: the drawn rows doubled with Scale2x (smooth diagonals, still crisp pixels), then lit ----------
function scale2x(rows) {
  var h = rows.length, w = rows[0].length, out = [], y, x;
  function at(x, y) { x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(h - 1, y)); return rows[y].charAt(x); }
  for (y = 0; y < h; y++) { var a = '', b = ''; for (x = 0; x < w; x++) {
    var E = at(x, y), B = at(x, y - 1), D = at(x - 1, y), F = at(x + 1, y), Hh = at(x, y + 1);
    var e0 = E, e1 = E, e2 = E, e3 = E;
    if (B !== Hh && D !== F) { e0 = D === B ? D : E; e1 = B === F ? F : E; e2 = D === Hh ? D : E; e3 = Hh === F ? F : E; }
    a += e0 + e1; b += e2 + e3; } out.push(a, b); }
  return out;
}
function iconD(Z, name) {
  var I = Z._in, def = I.ICON_DEFS[name]; if (!def) return Z.icon(name);
  var P = new I.Pt(I.IC, 32, 32, 16, 24); P.out = '#2a1d33';
  var rows = scale2x(def.rows), h = def.rows.length, w = def.rows[0].length, j, i;
  function stampFine(x0, y0, rr) { for (j = 0; j < rr.length; j++) for (i = 0; i < rr[j].length; i++) { var ch = rr[j].charAt(i); if (ch === '.' || ch === ' ') continue; P.cs(P.X(x0) + i, P.Y(y0) + j, P.code(ch, 1)); } }
  if (def.badge) { P.ell(0, -5, 4, 4, def.badge, 1); stampFine(-2, -7, rows); }
  else stampFine(-Math.floor(w / 2), -h, rows);
  // light from the top-left, shade along the bottom-right of each colour patch
  var d = P.d, W = P.W, snap = new Int16Array(d);
  for (i = W; i < d.length - W; i++) { var v = snap[i]; if (v <= 0) continue; var kk = (v - 1) >> 2; if (kk === P.ki.W || kk === P.ki.K) continue;
    var up = snap[i - W] > 0 && ((snap[i - W] - 1) >> 2) === kk, lf = snap[i - 1] > 0 && ((snap[i - 1] - 1) >> 2) === kk, dn = snap[i + W] > 0 && ((snap[i + W] - 1) >> 2) === kk, rt = snap[i + 1] > 0 && ((snap[i + 1] - 1) >> 2) === kk;
    if (!up || !lf) d[i] = kk * 4 + 0 + 1; else if (!dn || !rt) d[i] = kk * 4 + 2 + 1; }
  CUR = {}; return P.bake(null);
}

// ---------- ground in style D: today's tile doubled plus fine detail per biome ----------
function dTileX(Z, kind, seed) {
  if (kind === 'path') return dPath(Z, seed);
  var base = dTile(Z, kind, seed), name = kind.indexOf('hab:') === 0 ? kind.slice(4) : kind;
  if (['jungle', 'desert', 'arctic', 'mountain', 'ocean', 'water', 'paleo', 'mythic', 'locked'].indexOf(name) < 0) return base;
  var g = base.c.getContext('2d', { willReadFrequently: true }), im = g.getImageData(0, 0, base.w, base.h), q = im.data, pal = Z._in.GROUND[name], mix = Z._mix, rd = Z._in.rng(seed * 29 + 11), K = 2;
  function IN(c, r) { var a = G.toAxial((c + 0.5) / K - base.ax / K + 0.013, (r + 0.5) / K - base.ay / K + 0.007); return a.q === 0 && a.r === 0; }
  function put(c, r, col) { if (c < 2 || r < 2 || c >= base.w - 2 || r >= base.h - 2 || !IN(c, r) || !IN(c, r + 2) || !IN(c + 2, r) || !IN(c - 2, r)) return; var rgb = hexRgb(col), i = (r * base.w + c) * 4; q[i] = rgb[0]; q[i + 1] = rgb[1]; q[i + 2] = rgb[2]; q[i + 3] = 255; }
  function rp() { return [Math.round(base.ax + (rd() - 0.5) * (G.W - 16) * K), Math.round(base.ay + (rd() - 0.5) * (G.H - 12) * K)]; }
  var n, p, j;
  for (n = 0; n < 6; n++) { p = rp();
    if (name === 'jungle') { put(p[0], p[1], pal.D); put(p[0] + 1, p[1], pal.D); put(p[0] + 1, p[1] - 1, pal.G); put(p[0] + 2, p[1] - 1, pal.G); put(p[0], p[1] + 1, mix(pal.D, '#000000', 0.2)); }
    else if (name === 'desert' || name === 'mountain') { put(p[0], p[1], pal.D); put(p[0] + 1, p[1], pal.B); put(p[0], p[1] - 1, pal.C); if (name === 'mountain' && n < 3) for (j = 0; j < 4; j++) put(p[0] + 3 + j, p[1] + 2 + (j >> 1), pal.L); }
    else if (name === 'arctic') { put(p[0], p[1], '#ffffff'); if (n < 3) { put(p[0] - 1, p[1], '#ffffff'); put(p[0] + 1, p[1], '#ffffff'); put(p[0], p[1] - 1, '#ffffff'); put(p[0], p[1] + 1, '#ffffff'); } else for (j = 0; j < 5; j++) put(p[0] + j, p[1] + (j >> 1), pal.D); }
    else if (name === 'ocean' || name === 'water') { for (j = 0; j < 4; j++) put(p[0] + j, p[1] - (j === 1 || j === 2 ? 1 : 0), pal.C); }
    else if (name === 'paleo') { put(p[0], p[1], pal.G); put(p[0] - 1, p[1] - 1, pal.G); put(p[0] + 1, p[1] - 1, pal.G); put(p[0], p[1] - 2, mix(pal.G, '#ffffff', 0.3)); }
    else if (name === 'mythic') { var sc = n % 2 ? pal.G : '#ffffff'; put(p[0], p[1], sc); if (n < 2) { put(p[0] - 1, p[1], sc); put(p[0] + 1, p[1], sc); put(p[0], p[1] - 1, sc); put(p[0], p[1] + 1, sc); } }
    else if (name === 'locked') { put(p[0], p[1], pal.D); put(p[0] + 2, p[1] - 1, pal.D); put(p[0] + 4, p[1], pal.D); }
  }
  g.putImageData(im, 0, 0); return base;
}

// ---------- one entry point for any style-D sprite, with each species' fur / feather / scale treatment ----------
var TEX = {
  lion: ['fur'], zebra: ['fur'], giraffe: ['fur'], elephant: ['fur'], ostrich: ['feather', 'AF'], gorilla: ['shaggy'], toucan: ['feather', 'A'], jaguar: ['fur'], sloth: ['shaggy'],
  camel: ['fur'], kangaroo: ['fur'], komodo: ['scale'], penguin: ['feather', 'A'], polarbear: ['fur'], walrus: ['wet'], reindeer: ['fur'], panda: ['fur'], snowleopard: ['fur'],
  eagle: ['feather', 'AC'], yak: ['shaggy'], dolphin: ['wet'], turtle: ['scale', 'C'], octopus: ['wet'], clownfish: ['wet'], trex: ['skin'], triceratops: ['skin'], raptor: ['skin'], mammoth: ['shaggy'],
  unicorn: ['fur', 'A', 1], dragon: ['scale', 'A', 1], phoenix: ['feather', 'AC', 1]
};
function sprD(o) {
  var Z = window.ZS_D, s;
  if (o.t === 'tile') return dTileX(Z, o.kind, o.seed || 0);
  if (o.t === 'icon') return iconD(Z, o.id);
  CUR = { type: o.t === 'entrance' ? 'building' : o.t, id: o.id };
  if (o.id === 'panda') CUR.pupil = 1;
  if (o.t === 'animal') { var tx = TEX[o.id] || ['fur']; CUR.tex = tx[0]; if (tx[1]) CUR.texKeys = tx[1]; if (tx[2]) CUR.sparkle = 1; if (tx[0] !== 'fur') CUR.fur = tx[0] === 'wet' ? 0 : 0.02; }
  if (o.t === 'building' && o.id === 'snack') CUR.noSiding = 1;
  var op = { frame: o.frame, variant: o.variant, juv: o.juv, seed: o.seed };
  if (o.t === 'animal') s = Z.animal(o.id, op); else if (o.t === 'person') s = Z.person(o.id, op);
  else if (o.t === 'building') s = Z.building(o.id); else if (o.t === 'fence') s = Z.fence(o.biome || 'savanna', o.e);
  else if (o.t === 'deco') s = Z.deco(o.id, o.seed || 0); else if (o.t === 'entrance') s = Z.entrance();
  CUR = {};
  return o.flip ? flipD(s) : s;
}

// =====================================================================================================================
// REVISION 1 (owner's notes on the showcase): polar bear, gorilla, toucan and eagle beaks, T. rex, dolphin, path, trees.
// These species are drawn from scratch on the fine grid (art coordinates, fractions allowed), same colours and size as today.
// =====================================================================================================================
function baseHex(P, k) { var c = P.cols[P.ki[k]][1]; return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1); }
function scalePts(pts, k, cy) { cy = cy || 0; return pts.map(function (q) { return [q[0] * k, cy + (q[1] - cy) * k]; }); }
function quadPts(a, b, c, n) { var out = []; for (var i = 0; i <= n; i++) { var t = i / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]); } return out; }
function ellPts(cx, cy, rx, ry, ang, n) { var out = []; for (var i = 0; i < n; i++) { var t = i / n * 6.2832, x = Math.cos(t) * rx, y = Math.sin(t) * ry; out.push([cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)]); } return out; }
function installRev1(Z) {
  var I = Z._in, SP = I.SP, mix = Z._mix;
  function sgn(f) { return f === 1 ? 1 : f === 3 ? -1 : 0; }
  // ---------- polar bear: long low heavy body, long neck, small head with a long muzzle, cream with blue-grey shading ----------
  SP.polarbear.draw = function (P, o) {
    var k = o.juv ? 0.72 : 1, sg = sgn(o.fr), A = baseHex(P, 'A'), s = function (p) { return scalePts(p, k); };
    P.key('S', mix(A, '#8a9ac0', 0.26)); P.key('D', mix(A, '#3e4a6a', 0.62));
    function leg(x, d, k2, sh) { P.poly(s([[x + d, -7.4], [x + 3.6 + d, -7.4], [x + 3.4 + d * 1.3, -2.2], [x + 3.9 + d * 1.3, -1], [x - 0.3 + d * 1.3, -1], [x + 0.1 + d * 1.3, -2.2]]), k2, sh); }
    P.part(function () { leg(-9.6, -sg * 0.7, 'S', 2); leg(2.6, sg * 0.7, 'S', 2); }, true);
    P.part(function () { leg(-10.8, sg * 0.7, 'A', 1); leg(1.2, -sg * 0.7, 'A', 1); P.recolorF('A', 'S', function (x, y) { return y > -2.2 * k; }); }, true);
    P.part(function () {
      P.ell(-3.6 * k, -8.6 * k, 8.4 * k, 4.2 * k, 'A'); P.ell(-8 * k, -9.3 * k, 4.4 * k, 4.4 * k, 'A'); P.ell(-12.3 * k, -10.2 * k, 1.1 * k, 1 * k, 'A');
      P.poly(s([[0.5, -12.4], [5, -11.9], [9.4, -10.2], [10.2, -7], [5, -5.6], [0.5, -5.8]]), 'A', 'a');
      P.recolorF('A', 'S', function (x, y) { return y > -5.9 * k + Math.max(0, x) * 0.1 * k; });
    });
    P.part(function () { P.ell(9.8 * k, -11.3 * k, 1.1 * k, 1.1 * k, 'A'); P.setF(9.8 * k, -11.2 * k, 'S', 2); });
    P.part(function () {
      P.ell(11.3 * k, -9 * k, 3.2 * k, 2.8 * k, 'A');
      P.poly(s([[12, -10.2], [15.6, -9.5], [16.6, -8.5], [16.3, -7.4], [12.2, -6.6]]), 'A', 1);
      P.recolorF('A', 'S', function (x, y) { return y > -7.6 * k && x > 11 * k; });
    });
    for (var dx = 0; dx < 2; dx++) for (var dy = 0; dy < 2; dy++) P.setF((15.9 + dx * 0.5) * k, (-9 + dy * 0.5) * k, 'N', 1);
    P.setF(12.4 * k, -9.9 * k, 'K', 1); P.setF(12.9 * k, -9.9 * k, 'K', 1); P.setF(12.4 * k, -9.4 * k, 'K', 1); P.setF(12.9 * k, -9.4 * k, 'K', 1);
    P.lineF(13.4 * k, -7.5 * k, 16 * k, -7.8 * k, 'D', 1);
    [[-10.6, -1.25], [-9.6, -1.25], [-8.6, -1.25], [1.4, -1.25], [2.4, -1.25], [3.4, -1.25]].forEach(function (q, i) { P.setF((q[0] + (i < 3 ? sg : -sg) * 0.9) * k, q[1] * k, 'D', 1); });
  };
  // gorilla: the owner chose the first (showcase) design; only its rare colour changes (see GORILLA_RARE below)
  // ---------- toucan: clean curved banana beak, orange-yellow with a red tip and a black cutting edge ----------
  function beakTo(P, bx, by, L) {
    var top = quadPts([bx - 0.4, by - 2.3], [bx + 4.2 * L, by - 3.7 * L], [bx + 8.7 * L, by + 0.5], 10), bot = quadPts([bx + 8.7 * L, by + 0.5], [bx + 5 * L, by + 1.8], [bx - 0.4, by + 1.9], 10);
    function yAt(arr, x) { for (var i = 0; i < arr.length - 1; i++) { var a = arr[i], b = arr[i + 1]; if ((x - a[0]) * (x - b[0]) <= 0 && a[0] !== b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return null; }
    P.part(function () {
      P.poly(top.concat(bot.slice(1)), 'Y', 1);
      P.recolorF('Y', 'J', function (x, y) { var t = yAt(top, x), b = yAt(bot, x); return t != null && b != null && y < (t + b) / 2 - 0.2; });
      P.recolorF('YJ', 'R', function (x) { return x > bx + 7.1 * L; });
      P.recolorF('YJR', 'K', function (x, y) { var b = yAt(bot, x); return x < bx + 0.5 || (b != null && y > b - 0.45 && x < bx + 7.6 * L); });
      P.shadeF('JR', function (x, y) { var t = yAt(top, x); return t != null && y < t + 0.6 ? 0 : null; });
    });
  }
  SP.toucan.draw = function (P, o) {
    P.key('J', o.variant ? '#fbe27a' : '#f8c838');
    var m = Z._in.birdFn(P, o, { bw: 9, bh: 9, leg: 2, head: [7, 7], hd: [1, -3], wing: [5, 5, -1, 1, 'A'], tail: [5, 3, 5, 'A'],
      body: function (P, m) { P.recolor('A', 'B', function (x, y) { return x > 0 && y < m.cy + 1; }); },
      face: function (P, m) { P.recolor('A', 'B', function (x, y) { return x >= m.hx && y >= m.hy + 1; }); } });
    beakTo(P, m.hx + Math.floor((m.hw - 1) / 2) + 0.4, m.hy + 1, o.juv ? 0.72 : 1);
    P.set(m.ex - 1, m.ey, 'E'); P.set(m.ex, m.ey - 1, 'E'); P.set(m.ex + 1, m.ey, 'E');
  };
  // ---------- eagle: hooked yellow raptor beak with a gape line, pale head on a dark body, fierce brow ----------
  SP.eagle.draw = function (P, o) {
    P.key('H', o.variant ? '#ffffff' : mix(baseHex(P, 'G'), '#fff2d8', 0.55));
    var m = Z._in.birdFn(P, o, { bw: 9, bh: 11, leg: 2, head: [7, 6], hd: [0, -3], headK: 'H', wing: [6, 9, -1, 0, 'C'], tail: [4, 4, 6, 'C'] });
    var bx = m.hx + Math.floor((m.hw - 1) / 2) + 0.3, by = m.hy + 1, L = o.juv ? 0.8 : 1;
    P.part(function () {
      P.poly(scalePts(quadPts([0, -1.9], [2.8, -2.6], [3.5, 0.2], 6).concat([[3.4, 1.0], [3.0, 1.7], [2.7, 1.0], [2.2, 0.5], [1.6, 0.8], [0.2, 1.1]]), L * 1.1).map(function (q) { return [bx + q[0], by + q[1]]; }), 'Y', 1);
      P.shadeF('Y', function (x, y) { return y < by - 1.3 ? 0 : (x > bx + 2.6 * L && y > by + 0.2 ? 2 : null); });
      P.lineF(bx - 0.2, by + 0.2, bx + 2.3 * L, by + 0.45, 'C', 3); P.setF(bx + 0.6, by - 0.9, 'C', 3);
    });
    P.lineF(m.ex - 1.4, m.ey - 1.3, m.ex + 1.1, m.ey - 0.7, 'C', 3); P.lineF(m.ex - 1.4, m.ey - 0.9, m.ex + 0.6, m.ey - 0.4, 'H', 2);
    P.set(m.ex, m.ey, 'K'); P.setF(m.ex + 0.25, m.ey - 0.25, 'Y', 1);
  };
  // ---------- T. rex: big long-jawed head with teeth, tiny arms, heavy legs, long tail, leaning forward ----------
  SP.trex.draw = function (P, o) {
    var k = o.juv ? 0.68 : 1, sg = sgn(o.fr), s = function (p) { return scalePts(p, k); };
    P.part(function () { P.poly(s([[-2, -15.4], [-9, -14.4], [-15, -12.4], [-19.5, -10.6], [-15, -10.2], [-8, -10.2], [-2, -9.6]]), 'A', 'a'); }, true);
    P.part(function () { var d = -sg * 0.9; P.ell((-1.6 + d) * k, -9.6 * k, 2.9 * k, 3.5 * k, 'A', 2); P.poly(s([[-2.8 + d, -7.4], [0.4 + d, -7.4], [0 + d, -2], [-2.6 + d, -2]]), 'A', 2); P.poly(s([[-3.2 + d, -2.2], [1.8 + d, -2.2], [2.3 + d, -1], [-3.2 + d, -1]]), 'C', 2); }, true);
    P.part(function () {
      P.poly(ellPts(0.6 * k, -13.4 * k, 6.9 * k, 4.4 * k, -0.36, 24), 'A', 'a');
      P.recolorF('A', 'B', function (x, y) { return y > -13.4 * k - (x - 0.6 * k) * 0.37 + 2.2 * k && x > -3 * k && x < 5.5 * k; });
      P.recolorF('A', 'C', function (x, y) { return x < 5 * k && y < -14.6 * k - x * 0.35 && frac((x - y * 0.45) / (2.7 * k)) < 0.26; });
    }, true);
    P.part(function () { P.poly(s([[3.6, -16.8], [7, -20], [9.8, -17.2], [7, -12.6]]), 'A', 'a'); }, true);
    P.part(function () {
      P.poly(s([[6.4, -21.6], [9, -23.8], [14.6, -23.2], [16.8, -21.2], [17, -19.2], [9, -18.4], [6.6, -19.2]]), 'A', 'a');
      P.poly(s([[8.4, -18.6], [16.2, -19.1], [15.8, -17.5], [13, -16.3], [9.4, -16]]), 'B', 1);
      P.lineF(9 * k, -18.55 * k, 16.6 * k, -19.1 * k, 'C', 3);
      for (var x = 10; x <= 16; x += 1.05) { P.setF(x * k, (-18.3 - (x - 9) * 0.07) * k, 'T', 1); if (!o.juv) P.setF(x * k, (-17.85 - (x - 9) * 0.07) * k, 'T', 1); }
      for (x = 10.5; x <= 15.5; x += 1.05) P.setF(x * k, (-18.95 - (x - 9) * 0.07) * k, 'T', 1);
      P.setF(11.1 * k, -21.3 * k, 'K', 1); P.setF(11.6 * k, -21.3 * k, 'W', 1); P.setF(11.1 * k, -20.8 * k, 'K', 1); P.setF(11.6 * k, -20.8 * k, 'K', 1);
      P.lineF(10.2 * k, -22.4 * k, 12.8 * k, -22 * k, 'C', 2); P.setF(16 * k, -21.6 * k, 'K', 1);
    });
    P.part(function () { P.lineF(6.6 * k, -13.6 * k, 8.2 * k, -12.4 * k, 'A', 1); P.lineF(6.9 * k, -13.9 * k, 8.5 * k, -12.7 * k, 'A', 1); P.setF(8.8 * k, -12.9 * k, 'T', 1); P.setF(8.7 * k, -12.3 * k, 'T', 1); });
    P.part(function () { var d = sg * 0.9; P.ell((0.2 + d) * k, -10.4 * k, 3.6 * k, 4.2 * k, 'A'); P.poly(s([[-1.2 + d, -8], [2.4 + d, -8], [1.8 + d, -2], [-1.6 + d, -2]]), 'A', 1); P.poly(s([[-2 + d, -2.3], [3.6 + d, -2.3], [4.3 + d, -1], [-2 + d, -1]]), 'C', 1); P.setF((4 + d) * k, -1.3 * k, 'T', 1); P.setF((2.9 + d) * k, -1.3 * k, 'T', 1); });
  };
  // ---------- dolphin: real beak (rostrum), melon forehead, gentle smile, eye above the mouth, smooth three-tone shading ----------
  SP.dolphin.draw = function (P, o) {
    var k = o.juv ? 0.72 : 1, w = sgn(o.fr) * 0.6, s = function (p) { return scalePts(p, k, -4); };
    P.part(function () { P.poly(s([[-8, -8.8], [-11.2, -11 + w], [-12.6, -10.6 + w], [-10.2, -8], [-12.6, -5.6 + w], [-11.2, -5.2 + w], [-8, -7.4]]), 'C', 1); }, true);
    P.part(function () { P.poly(s([[-1.4, -11.8], [1.2, -15.6], [2.4, -15.2], [3.6, -11.6]]), 'C', 1); }, true);
    P.part(function () {
      var body = quadPts([-8.4, -8.9], [-1, -13.4], [5.5, -11.9], 8).concat(quadPts([5.5, -11.9], [9.8, -12.1], [10.3, -9.2], 5).slice(1), [[10.6, -8.85], [13.6, -8.65], [14.2, -8.15], [13.5, -7.6], [10.4, -7.45]], quadPts([10.4, -7.45], [2, -3.4], [-8.4, -7.3], 8).slice(1));
      P.poly(s(body), 'A', 1);
      var Ys = function (v) { return -4 + (v + 4) * k; };
      P.recolorF('A', 'C', function (x, y) { return y < Ys(-10.4) + Math.max(0, x - 6 * k) * 0.25; });
      P.recolorF('A', 'B', function (x, y) { return (y > Ys(-7.5) + Math.abs(x - 1 * k) * 0.04 && x < 10.5 * k) || (x > 10.4 * k && y > Ys(-8.1)); });
      P.shadeF('C', function (x, y) { return y < Ys(-11.6) ? 0 : null; });
    });
    P.part(function () { P.poly(s([[3.4, -6.4], [1.2, -3.6 - w], [2.6, -3.4 - w], [5.4, -6]]), 'C', 2); });
    var sm = [[9.4, -8.7], [9.9, -8.25], [10.6, -8.05], [12, -8.1], [13.8, -8.2]]; for (var i = 0; i < sm.length - 1; i++) P.lineF(sm[i][0] * k, -4 + (sm[i][1] + 4) * k, sm[i + 1][0] * k, -4 + (sm[i + 1][1] + 4) * k, 'C', 3);
    P.setF(8.4 * k, -4 + (-9.7 + 4) * k, 'K', 1); P.setF(8.9 * k, -4 + (-9.7 + 4) * k, 'K', 1); P.setF(8.4 * k, -4 + (-10.2 + 4) * k, 'K', 1); P.setF(8.9 * k, -4 + (-10.2 + 4) * k, 'W', 1);
  };
  // ---------- trees and bushes: solid clumpy canopies, light-green highlights (never white), no gaps ----------
  function leaves(P, keys, h2f) {
    P.shadeF(keys, function (x, y, sh, c, r) { var rr = r % 4, cc = (c + (Math.floor(r / 4) % 2) * 2) % 4; if (sh === 1 && ((rr === 3 && (cc === 1 || cc === 2)) || (rr === 2 && (cc === 0 || cc === 3))) && h2f(c >> 2, r >> 2) < 0.7) return 2; return null; });
  }
  window.__decoD = function (kind, seed, Pt, U) {
    if (kind !== 'tree' && kind !== 'bush') return null;
    var P, tv = seed % 4;
    if (kind === 'bush') {
      var bc = '#4fa648';
      P = new Pt({ A: bc, B: U.mix(bc, '#c8ee78', 0.42), D: U.mix(bc, '#1d4a2a', 0.38), F: seed % 2 ? '#f4d040' : '#f08aa8' }, 32, 28, 16, 20);
      P.part(function () { P.ell(-3, -4, 4, 3.6, 'A'); }, true); P.part(function () { P.ell(3, -3.4, 4, 3.1, 'A'); }); P.part(function () { P.ell(0, -6, 4, 3.4, 'A'); });
      P.recolorF('A', 'D', function (x, y) { return y > -2.4; }); leaves(P, 'AD', function (a, b) { return I.h2(a, b, 61); });
      P.ell(-1.2, -7.6, 1.7, 1, 'B', 1); P.ell(-4.4, -5.6, 1.2, 0.8, 'B', 1); P.ell(3.4, -4.6, 1.2, 0.8, 'B', 1);
      if (seed % 3 !== 0) [[2.2, -6.2], [-4.2, -3.2], [4.4, -2.4], [0.2, -4]].forEach(function (q) { P.setF(q[0], q[1], 'F', 1); P.setF(q[0] + 0.5, q[1], 'F', 1); P.setF(q[0], q[1] + 0.5, 'F', 2); P.setF(q[0] + 0.5, q[1] + 0.5, 'F', 1); });
      return P.bake([7, 1]);
    }
    if (tv === 2) {
      var pc = '#3f8f52';
      P = new Pt({ A: pc, B: U.mix(pc, '#a8e070', 0.4), D: U.mix(pc, '#163a24', 0.4), T: '#8a5a34' }, 40, 56, 20, 46);
      P.poly([[-1.6, -6], [1.6, -6], [1.8, -0.5], [-1.8, -0.5]], 'T', 1); P.recolorF('T', 'T', function (x) { return x > 0.6; }, 2);
      [[-8.4, -5, -13.6], [-7.2, -10.4, -19.6], [-5.4, -16, -25.4]].forEach(function (t, n) {
        P.part(function () { P.poly([[t[0], t[1]], [0, t[2]], [-t[0], t[1]], [-t[0] - 1.2, t[1] + 0.8], [t[0] + 1.2, t[1] + 0.8]], 'A', 1);
          P.recolorF('A', 'D', function (x, y) { return y > t[1] - 1.4; }); P.shadeF('A', function (x, y, sh, c, r) { return sh === 1 && r % 3 === 0 && (c + r) % 4 === 0 ? 2 : null; }); P.recolorF('A', 'B', function (x, y) { return x < -0.4 && x > (t[0] * (y - t[2]) / (t[1] - t[2])) + 0.2 && x < (t[0] * (y - t[2]) / (t[1] - t[2])) + 1.4 && y < t[1] - 1.4; }); }, n === 0);
      });
      return P.bake([8, 2]);
    }
    var big = tv !== 1, col = tv === 3 ? '#4fa860' : '#5fb04a';
    P = new Pt({ A: col, B: U.mix(col, '#c8ee78', 0.42), D: U.mix(col, '#1d4a2a', 0.36), T: '#8a5a34', F: '#e8503a' }, 44, 56, 22, 46);
    P.poly([[-1.6, -11], [1.6, -11], [1.8, -1.4], [3, -0.5], [-3, -0.5], [-1.8, -1.4]], 'T', 1); P.recolorF('T', 'T', function (x) { return x > 0.7; }, 2); P.lineF(-0.6, -9, -0.4, -3, 'T', 2);
    var clumps = big ? [[0, -11.8, 4.6, 3.2], [-4.6, -13, 4.6, 4], [4.8, -13, 4.6, 4], [0, -18.2, 6.4, 5.8]] : [[0, -10.4, 3.4, 2.4], [0, -13.4, 5.8, 5.6]];
    clumps.forEach(function (c, n) { P.part(function () { P.ell(c[0], c[1], c[2], c[3], 'A'); P.recolorF('A', 'D', function (x, y) { return y > c[1] + c[3] * 0.35; }); leaves(P, 'AD', function (a, b) { return I.h2(a, b, 61 + n); }); P.ell(c[0] - c[2] * 0.3, c[1] - c[3] * 0.35, c[2] * 0.45, c[3] * 0.32, 'B', 1); }, n === 0); });
    if (tv === 3) [[-3, -15], [3.4, -16.6], [-5.4, -11.6], [5.6, -12], [0.6, -20]].forEach(function (q) { P.setF(q[0], q[1], 'F', 1); P.setF(q[0] + 0.5, q[1], 'F', 0); P.setF(q[0], q[1] + 0.5, 'F', 2); P.setF(q[0] + 0.5, q[1] + 0.5, 'F', 1); });
    return P.bake([big ? 9 : 6, 2]);
  };
}
// ---------- path in style D: smooth packed sand with soft tone patches and a few pebbles, no paving grid; hex edges kept ----------
function dPath(Z, seed) {
  var pal = Z._in.GROUND.path, mix = Z._mix, h2 = Z._in.h2, K = 2, LIP = 3, ox = G.HW + 1, oy = G.HH + 1, Wc = (G.W + 2) * K, Hc = (G.H + LIP + 2) * K;
  var cv = document.createElement('canvas'); cv.width = Wc; cv.height = Hc; var g = cv.getContext('2d', { willReadFrequently: true }), im = g.createImageData(Wc, Hc), q = im.data, ins = new Uint8Array(Wc * Hc), col = [], r, c, i;
  for (r = 0; r < Hc; r++) for (c = 0; c < Wc; c++) { var a = G.toAxial((c + 0.5) / K - ox + 0.013, (r + 0.5) / K - oy + 0.007); ins[r * Wc + c] = a.q === 0 && a.r === 0 ? 1 : 0; }
  function IN(c, r) { return c >= 0 && r >= 0 && c < Wc && r < Hc && ins[r * Wc + c] === 1; }
  function noise(x, y) { var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, s = function (a, b) { return h2(a, b, seed * 7 + 3); };
    var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (s(x0, y0) * (1 - u) + s(x0 + 1, y0) * u) * (1 - v) + (s(x0, y0 + 1) * (1 - u) + s(x0 + 1, y0 + 1) * u) * v; }
  var light = mix(pal.A, pal.C, 0.45), dark = mix(pal.A, pal.B, 0.55), Zc = mix(pal.A, pal.D, 0.8), Hl = mix(pal.A, '#ffffff', 0.3);
  for (r = 0; r < Hc; r++) for (c = 0; c < Wc; c++) { i = r * Wc + c;
    if (ins[i]) { var n = noise(c / 9 + seed * 3.1, r / 7), v = h2(c, r, seed * 5 + 1); col[i] = n > 0.7 ? light : n < 0.3 ? dark : pal.A; if (v < 0.03) col[i] = pal.B; else if (v > 0.975) col[i] = pal.C; }
    else for (var l = 1; l <= LIP * K; l++) if (IN(c, r - l)) { col[i] = l <= K ? pal.L : mix(pal.L, '#1c1226', 0.3); break; } }
  var rd = Z._in.rng(seed * 13 + 7);
  for (var p = 0; p < 7; p++) { var pc = Math.round(ox * K + (rd() - 0.5) * (G.W - 16) * K), pr = Math.round(oy * K + (rd() - 0.5) * (G.H - 12) * K), big2 = p % 3 === 0;
    [[0, 0, '#c4b494'], [1, 0, '#a8987a'], [0, -1, '#e8dcc0'], [1, -1, '#c4b494']].concat(big2 ? [[2, 0, '#8a7a60'], [2, -1, '#a8987a']] : []).forEach(function (t) { if (IN(pc + t[0], pr + t[1]) && IN(pc + t[0], pr + t[1] + 3)) col[(pr + t[1]) * Wc + pc + t[0]] = t[2]; }); }
  for (r = 0; r < Hc; r++) for (c = 0; c < Wc; c++) { i = r * Wc + c; if (!ins[i]) continue;
    if (!IN(c, r + 1) || !IN(c + 1, r) || !IN(c, r + 2) || !IN(c + 2, r)) col[i] = Zc; else if (!IN(c, r - 1) || !IN(c - 1, r) || !IN(c, r - 2) || !IN(c - 2, r)) col[i] = Hl; }
  for (i = 0; i < col.length; i++) if (col[i]) { var rgb = hexRgb(col[i]); q[i * 4] = rgb[0]; q[i * 4 + 1] = rgb[1]; q[i * 4 + 2] = rgb[2]; q[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0);
  return { c: cv, w: Wc, h: Hc, ax: ox * K, ay: oy * K, K: K };
}

var _installOverrides0 = installOverrides;
installOverrides = function (Z) { _installOverrides0(Z); installRev1(Z); };

// =====================================================================================================================
// REVISION 2: gorilla rare colour candidates and three new polar bear designs (the owner picks one of each).
// =====================================================================================================================
var GORILLA_RARE = { // candidates for the rare gorilla (replacing the white one). A fur, F face and hands, B chest
  chestnut: { A: '#6e3423', F: '#2e2226', B: '#8c4a30' },
  golden: { A: '#8e6226', F: '#3a2a24', B: '#b07a34' },
  midnight: { A: '#2f3a5c', F: '#1a1e2c', B: '#45527a' }
};
function rrPts(x0, y0, x1, y1, r, n) { // rounded rectangle outline
  var out = [], c = [[x1 - r, y0 + r, -0.5], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 0.5], [x0 + r, y0 + r, 1]];
  c.forEach(function (q) { for (var i = 0; i <= n; i++) { var t = (q[2] + i / n * 0.5) * Math.PI; out.push([q[0] + Math.cos(t) * r, q[1] + Math.sin(t) * r]); } });
  return out;
}
function installRev2(Z) {
  var I = Z._in, SP = I.SP, mix = Z._mix;
  Object.keys(GORILLA_RARE).forEach(function (n) { SP['gorilla_' + n] = { pal: GORILLA_RARE[n], vpal: null, draw: SP.gorilla.draw, opt: SP.gorilla.opt }; });
  function sgn(f) { return f === 1 ? 1 : f === 3 ? -1 : 0; }
  // one bear builder; c = design numbers. Same shading language everywhere: lit top, cream middle, blue-grey lower band.
  function bear(c) {
    return function (P, o) {
      var k = o.juv ? c.juv : 1, sg = sgn(o.fr) * 0.7, A = baseHex(P, 'A'), s = function (p) { return scalePts(p, k); };
      P.key('S', mix(A, '#8a9ac0', 0.28)); P.key('D', mix(A, '#3e4a6a', 0.6));
      var bandY = c.y1 - c.band;
      function leg(x, d, key, sh) {
        var t = c.y1 - 1.2, w0 = c.legW, w1 = c.legW * 0.8;
        P.poly(s([[x, t], [x + w0, t], [x + w0 - (w0 - w1) / 2 + d, -1.6], [x + (w0 - w1) / 2 + d, -1.6]]), key, sh);
        P.ell((x + w0 / 2 + d) * k, -1.6 * k, (w1 / 2 + 0.45) * k, 0.75 * k, key, sh);
      }
      P.part(function () { leg(c.bx - 0.4, -sg, 'S', 2); leg(c.fx + 1, sg, 'S', 2); }, true);
      P.part(function () {
        P.poly(s(rrPts(c.x0, c.y0, c.x1, c.y1, c.r, 5)), 'A', 1);
        P.ell(c.humpX * k, (c.y0 + 0.3) * k, c.humpR[0] * k, c.humpR[1] * k, 'A', 1);
        P.ell((c.x0 + 0.4) * k, (c.y0 + 2.2) * k, 0.9 * k, 0.8 * k, 'A', 1);
      }, true);
      P.recolorF('A', 'S', function (x, y) { return y > bandY * k; });
      P.part(function () { leg(c.bx, sg, 'A', 1); leg(c.fx, -sg, 'A', 1); P.recolorF('A', 'S', function (x, y) { return y > -3.1 * k; }); }, true);
      P.part(function () { // short neck into a head held at shoulder height
        P.poly(s([[c.x1 - 2.5, c.y0 + 1], [c.hx - 0.5, c.hy - 2], [c.hx, c.hy + 2.2], [c.x1 - 1.5, c.y1 - 2.2]]), 'A', 1);
      }, true);
      P.part(function () { P.ell((c.hx - 1.8) * k, (c.hy - c.hr[1] - 0.9) * k, 1.15 * k, 1.15 * k, 'A', 1); P.ell((c.hx - 1.8) * k, (c.hy - c.hr[1] - 0.9) * k, 0.45 * k, 0.45 * k, 'S', 2); }, true);
      P.part(function () {
        P.ell(c.hx * k, c.hy * k, c.hr[0] * k, c.hr[1] * k, 'A', 1);
        P.poly(s([[c.hx + 0.6, c.hy - 1.3], [c.hx + c.mL - 0.4, c.hy - 0.7], [c.hx + c.mL, c.hy + 0.2], [c.hx + c.mL - 0.3, c.hy + 1.1], [c.hx + 0.6, c.hy + 1.6]]), 'A', 1);
        P.recolorF('A', 'S', function (x, y) { return y > (c.hy + 0.9) * k; });
      });
      P.part(function () { P.ell((c.hx + 0.3) * k, (c.hy - c.hr[1] - 0.8) * k, 1.15 * k, 1.15 * k, 'A', 1); P.ell((c.hx + 0.3) * k, (c.hy - c.hr[1] - 0.8) * k, 0.45 * k, 0.45 * k, 'S', 2); });
      for (var dx = 0; dx < 2; dx++) for (var dy = 0; dy < 2; dy++) P.setF((c.hx + c.mL - 0.6 + dx * 0.5) * k, (c.hy - 0.6 + dy * 0.5) * k, 'N', 1);
      P.setF((c.hx + 0.6) * k, (c.hy - 0.9) * k, 'K', 1); P.setF((c.hx + 1.1) * k, (c.hy - 0.9) * k, 'K', 1); P.setF((c.hx + 0.6) * k, (c.hy - 0.4) * k, 'K', 1); P.setF((c.hx + 1.1) * k, (c.hy - 0.4) * k, 'K', 1);
      P.lineF((c.hx + 1.6) * k, (c.hy + 0.9) * k, (c.hx + c.mL - 0.5) * k, (c.hy + 0.7) * k, 'D', 1);
      [c.bx, c.fx].forEach(function (x, i) { var d = i ? -sg : sg; for (var t = 0; t < 3; t++) P.setF((x + 0.6 + t * 1 + d) * k, -1.3 * k, 'D', 1); });
    };
  }
  var D = {
    1: { x0: -10, y0: -12.4, x1: 5.5, y1: -4.6, r: 3, band: 2.2, humpX: 2, humpR: [3.6, 1.7], bx: -9.2, fx: 1, legW: 3.8, hx: 8.4, hy: -9.4, hr: [2.9, 2.6], mL: 4.4, juv: 0.7 },
    2: { x0: -9, y0: -13.2, x1: 5, y1: -4.8, r: 3.6, band: 2.4, humpX: 1.6, humpR: [3.4, 2], bx: -8.3, fx: 0.8, legW: 4.1, hx: 7.8, hy: -10, hr: [3.1, 2.8], mL: 4, juv: 0.72 },
    3: { x0: -8, y0: -12.6, x1: 4.2, y1: -5.2, r: 3.6, band: 2.2, humpX: 1.2, humpR: [3, 1.8], bx: -7.4, fx: 0.4, legW: 4, hx: 7, hy: -9.8, hr: [3.4, 3], mL: 3.8, juv: 0.74 }
  };
  [1, 2, 3].forEach(function (n) { SP['polarbear_' + n] = { pal: SP.polarbear.pal, vpal: SP.polarbear.vpal, draw: bear(D[n]), opt: SP.polarbear.opt }; TEX['polarbear_' + n] = ['fur']; });
}
var _installOverrides1 = installOverrides;
installOverrides = function (Z) { _installOverrides1(Z); installRev2(Z); };
