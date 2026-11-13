/* Wildside Zoo: every sprite in the game, made in code (no image files). Owned by the Artist. Exposes window.ZSprites.
   How it works: each sprite is painted with a tiny pixel "painter" (ellipses, rounded boxes, polygons, lines) using palette
   roles, each role having four shades (light, mid, dark, line). Parts are layered with a soft dark seam between them, then the
   whole silhouette gets a dark outline and a ground shadow. Results are baked to small offscreen canvases once and cached,
   with mirrored copies made on demand. All sizes for map pieces come from ZGeo. See docs/API-artist.md. */
(function (root) {
  'use strict';
  var G = root.ZGeo, D = root.ZD || {};
  var W = G.W, H = G.H, HH = G.HH, HW = G.HW;
  var U = 1; // unit scale: map pieces were tuned for a 48 px wide hex and stretch with ZGeo

  // ---------- colour helpers ----------
  function rgb(c) { if (c.charAt(0) === '#') c = c.slice(1); if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]; var n = parseInt(c, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hex(a) { return '#' + ((1 << 24) | (a[0] << 16) | (a[1] << 8) | a[2]).toString(16).slice(1); }
  function mix(a, b, t) { a = rgb(a); b = rgb(b); return hex([0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); })); }
  function ramp(b) { if (typeof b !== 'string') return b; return [mix(b, '#fff8dc', 0.36), b, mix(b, '#2b1b42', 0.27), mix(b, '#22152f', 0.52)]; }
  function h2(x, y, s) { var n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function rng(seed) { var s = (Math.imul((seed | 0) + 1, 2654435761) >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  var INK = '#2a1d33';

  // ---------- the painter ----------
  function Pt(pal, w, h, ox, oy) {
    this.w = w || 72; this.h = h || 64; this.ox = ox == null ? this.w >> 1 : ox; this.oy = oy == null ? this.h - 8 : oy;
    this.d = new Int16Array(this.w * this.h); this.ki = {}; this.cols = [];
    var base = { K: '#1d1522', W: '#ffffff', N: '#2c1e28' }, k;
    for (k in base) this.key(k, base[k]);
    for (k in pal) this.key(k, pal[k]);
    this.out = (pal && pal.O) || mix((pal && pal.A) || '#555555', '#1c1226', 0.8);
  }
  var pp = Pt.prototype;
  pp.key = function (k, b) { if (this.ki[k] == null) this.ki[k] = this.cols.length; this.cols[this.ki[k]] = ramp(b).map(rgb); };
  pp.idx = function (x, y) { x = Math.round(x) + this.ox; y = Math.round(y) + this.oy; return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? -1 : y * this.w + x; };
  pp.set = function (x, y, k, s) { var i = this.idx(x, y); if (i < 0) return; var c = this.ki[k]; if (c == null) c = this.ki.A || 0; this.d[i] = c * 4 + (s == null ? 1 : s) + 1; };
  pp.has = function (x, y) { var i = this.idx(x, y); return i >= 0 && this.d[i] !== 0; };
  pp.kat = function (x, y) { var i = this.idx(x, y); if (i < 0 || this.d[i] <= 0) return ''; var c = (this.d[i] - 1) >> 2; for (var k in this.ki) if (this.ki[k] === c) return k; return ''; };
  pp.sh = function (x, y, s) { var i = this.idx(x, y); if (i >= 0 && this.d[i] > 0) this.d[i] = (((this.d[i] - 1) >> 2) * 4) + s + 1; };
  pp.re = function (x, y, k, s) { var i = this.idx(x, y); if (i < 0 || this.d[i] <= 0) return; var c = this.ki[k]; if (c == null) return; this.d[i] = c * 4 + (s == null ? ((this.d[i] - 1) & 3) : s) + 1; };
  pp.clr = function (x, y) { var i = this.idx(x, y); if (i >= 0) this.d[i] = 0; };
  function ash(t) { return t < 0.24 ? 0 : t > 0.7 ? 2 : 1; }
  pp.rect = function (x, y, w, h, k, s) { x = Math.round(x); y = Math.round(y); for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, k, s === 'a' ? (h < 3 ? 1 : ash((j + 0.5) / h)) : s); };
  pp.rr = function (x, y, w, h, k, s, r) { // rounded box, auto shaded top to bottom unless a shade is given
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); if (r == null) r = Math.min(2, Math.floor(Math.min(w, h) / 3));
    for (var j = 0; j < h; j++) {
      var ins = j < r ? r - j : (j >= h - r ? r - (h - 1 - j) : 0); if (ins * 2 >= w) ins = Math.max(0, Math.floor((w - 1) / 2));
      for (var i = ins; i < w - ins; i++) this.set(x + i, y + j, k, s == null ? (h < 3 ? 1 : ash((j + 0.5) / h)) : s);
    }
  };
  pp.ell = function (cx, cy, rx, ry, k, s) { // filled ellipse, pixel centres at whole numbers
    var y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry), x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx), top = null, n = 0, rows = [];
    for (var y = y0; y <= y1; y++) {
      var any = false;
      for (var x = x0; x <= x1; x++) { var dx = (x - cx) / (rx + 0.25), dy = (y - cy) / (ry + 0.25); if (dx * dx + dy * dy <= 1) { any = true; rows.push([x, y]); } }
      if (any) { if (top == null) top = y; n++; }
    }
    for (var i = 0; i < rows.length; i++) this.set(rows[i][0], rows[i][1], k, s == null ? (n < 3 ? 1 : ash((rows[i][1] - top + 0.5) / n)) : s);
  };
  pp.line = function (x0, y0, x1, y1, k, s, t) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); t = t || 1;
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx - dy, o = Math.floor((t - 1) / 2);
    for (;;) {
      if (t === 1) this.set(x0, y0, k, s); else this.rect(x0 - o, y0 - o, t, t, k, s);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * e; if (e2 > -dy) { e -= dy; x0 += sx; } if (e2 < dx) { e += dx; y0 += sy; }
    }
  };
  pp.path = function (pts, k, s, t) { for (var i = 0; i < pts.length - 1; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], k, s, t); };
  pp.poly = function (pts, k, s) { // filled polygon; s may be 'a' for a top-to-bottom auto shade
    var miny = 1e9, maxy = -1e9, i, n = pts.length, me = this;
    for (i = 0; i < n; i++) { miny = Math.min(miny, pts[i][1]); maxy = Math.max(maxy, pts[i][1]); }
    miny = Math.round(miny); maxy = Math.round(maxy); var hh = maxy - miny + 1;
    function sf(y) { return s === 'a' ? (hh < 3 ? 1 : ash((y - miny + 0.5) / hh)) : s; }
    for (var y = miny; y <= maxy; y++) {
      var xs = [], yy = y + 0.01;
      for (i = 0; i < n; i++) { var a = pts[i], b = pts[(i + 1) % n]; if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) xs.push(a[0] + (yy - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
      xs.sort(function (p, q) { return p - q; });
      for (i = 0; i + 1 < xs.length; i += 2) for (var x = Math.ceil(xs[i] - 0.001); x <= Math.floor(xs[i + 1] + 0.001); x++) me.set(x, y, k, sf(y));
    }
    for (i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n], st = Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])) || 1;
      for (var u = 0; u <= st; u++) { var lx = Math.round(p[0] + (q[0] - p[0]) * u / st), ly = Math.round(p[1] + (q[1] - p[1]) * u / st); me.set(lx, ly, k, sf(ly)); }
    }
  };
  pp.stamp = function (x, y, rows, map) { // tiny hand-drawn detail: rows of characters; map turns a character into [key, shade]
    for (var j = 0; j < rows.length; j++) for (var i = 0; i < rows[j].length; i++) {
      var c = rows[j].charAt(i); if (c === '.' || c === ' ') continue;
      var m = map && map[c]; if (m) this.set(x + i, y + j, m[0], m[1]); else this.set(x + i, y + j, c, 1);
    }
  };
  pp.part = function (fn, nosep) { // paint a part on its own layer, then lay it over what is there with a soft dark seam around it
    var old = this.d, w = this.w, h = this.h, t = this.d = new Int16Array(w * h), i;
    try { fn.call(this, this); } finally { this.d = old; }
    for (i = 0; i < t.length; i++) if (t[i]) old[i] = t[i];
    if (!nosep) for (i = 0; i < t.length; i++) if (!t[i] && old[i] > 0) {
      var x = i % w;
      if ((x > 0 && t[i - 1]) || (x < w - 1 && t[i + 1]) || (i >= w && t[i - w]) || (i < t.length - w && t[i + w])) old[i] = (((old[i] - 1) >> 2) * 4) + 3 + 1;
    }
  };
  pp.recolor = function (from, to, pred, s) { // repaint pixels of some roles where pred(x, y, shade) says so, keeping their shade
    var c = this.ki[to]; if (c == null) return; var fs = {}, i;
    for (i = 0; i < from.length; i++) if (this.ki[from.charAt(i)] != null) fs[this.ki[from.charAt(i)]] = 1;
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) {
      var v = this.d[y * this.w + x];
      if (v > 0 && fs[(v - 1) >> 2] && (!pred || pred(x - this.ox, y - this.oy, (v - 1) & 3))) this.d[y * this.w + x] = c * 4 + (s == null ? ((v - 1) & 3) : s) + 1;
    }
  };
  pp.outline = function () {
    var w = this.w, d = this.d, n = [], i;
    for (i = 0; i < d.length; i++) if (!d[i]) { var x = i % w; if ((x > 0 && d[i - 1] > 0) || (x < w - 1 && d[i + 1] > 0) || (i >= w && d[i - w] > 0) || (i < d.length - w && d[i + w] > 0)) n.push(i); }
    for (i = 0; i < n.length; i++) d[n[i]] = -1;
  };
  // bake to a trimmed canvas. shadow = [rx, ry, [r,g,b], alpha, dx, dy] draws a soft ground shadow under the anchor.
  pp.bake = function (shadow, noOutline) {
    if (!noOutline) this.outline();
    var w = this.w, h = this.h, d = this.d, x, y, sd = null, a0 = 0, sc = [24, 44, 24];
    if (shadow) {
      sd = new Uint8Array(w * h); a0 = Math.round((shadow[3] || 0.24) * 255); if (shadow[2]) sc = shadow[2];
      for (y = -shadow[1]; y <= shadow[1]; y++) for (x = -shadow[0]; x <= shadow[0]; x++) {
        var ex = x / (shadow[0] + 0.4), ey = y / (shadow[1] + 0.4);
        if (ex * ex + ey * ey <= 1) { var px = x + this.ox + (shadow[4] || 0), py = y + this.oy - 1 + (shadow[5] || 0); if (px >= 0 && py >= 0 && px < w && py < h) sd[py * w + px] = 1; }
      }
    }
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (d[y * w + x] || (sd && sd[y * w + x])) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
    var cw = x1 - x0 + 1, ch = y1 - y0 + 1, c = document.createElement('canvas'); c.width = cw; c.height = ch;
    var g = c.getContext('2d'), im = g.createImageData(cw, ch), o = rgb(this.out), q = im.data;
    for (y = 0; y < ch; y++) for (x = 0; x < cw; x++) {
      var v = d[(y + y0) * w + x + x0], j = (y * cw + x) * 4, col = null;
      if (v > 0) col = this.cols[(v - 1) >> 2][(v - 1) & 3]; else if (v < 0) col = o;
      if (col) { q[j] = col[0]; q[j + 1] = col[1]; q[j + 2] = col[2]; q[j + 3] = 255; }
      else if (sd && sd[(y + y0) * w + x + x0]) { q[j] = sc[0]; q[j + 1] = sc[1]; q[j + 2] = sc[2]; q[j + 3] = a0; }
    }
    g.putImageData(im, 0, 0);
    return { c: c, w: cw, h: ch, ax: this.ox - x0, ay: this.oy + 1 - y0 };
  };
  function flipSprite(s) {
    var c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
    var g = c.getContext('2d'); g.translate(s.w, 0); g.scale(-1, 1); g.drawImage(s.c, 0, 0);
    var o = { c: c, w: s.w, h: s.h, ax: s.w - 1 - s.ax, ay: s.ay }; if (s.sortDy != null) o.sortDy = s.sortDy; return o;
  }
  var CACHE = {};
  function blank() { var P = new Pt({ A: '#d86cc0' }, 16, 16, 8, 12); P.rr(-3, -7, 7, 7, 'A'); P.set(-1, -5, 'K'); P.set(1, -5, 'K'); return P.bake([3, 1]); }
  function cached(key, fn) {
    var s = CACHE[key];
    if (!s) { try { s = fn(); } catch (e) { if (root.console) root.console.warn('ZSprites: could not draw ' + key, e); s = null; } if (!s) s = blank(); CACHE[key] = s; }
    return s;
  }

  // =====================================================================================================================
  // ANIMALS: body templates. All face right; ground is y = 0 (feet end at y = -1), x = 0 is the middle of the body.
  // o = { juv, fr (walk frame 0..3), variant }. Templates return measurements (m) so species can add their own parts.
  // =====================================================================================================================
  function sc(o, v, k) { return o.juv ? Math.max(1, Math.round(v * (k || 0.68))) : v; }
  function sgn(f) { return f === 1 ? 1 : f === 3 ? -1 : 0; }
  function spots(P, from, to, x0, y0, x1, y1, dens, seed, s) { P.recolor(from, to, function (x, y) { return x >= x0 && x <= x1 && y >= y0 && y <= y1 && h2(x, y, seed) < dens; }, s); }

  function tailDraw(P, o, t, x, y, f) {
    var ty = t[0], L = sc(o, t[1] || 4, 0.72), k = t[2] || 'A', tw = t[3] || 1, w = sgn(f);
    if (ty === 'tuft') { P.path([[x, y], [x - 2, y + 1], [x - 2 - w, y + L]], 'A', 2); P.rect(x - 3 - w, y + L, 2, 2, k, 1); }
    else if (ty === 'thin') P.path([[x, y], [x - 2, y + 1], [x - 2 - w, y + L]], k, 2, tw);
    else if (ty === 'cat') P.path([[x, y], [x - 2, y + 1], [x - 3, y + L - 2], [x - 5 - w, y + L - 1], [x - 7 - w, y + L - 3]], k, 1, tw);
    else if (ty === 'up') { P.path([[x, y], [x - 2, y - L + w]], 'A', 1); P.rect(x - 3, y - L - 1 + w, 2, 2, k, 1); }
    else if (ty === 'bush') { P.ell(x - L / 2 + 1, y + 1 + L / 5 + w * 0.5, L / 2 + 0.5, tw / 2, k); if (t[4]) P.recolor(k, t[4], function (px) { return px <= x - L + 2; }); }
    else if (ty === 'stub') P.rr(x - 1, y - 1, 2 + (L > 2 ? 1 : 0), 2, k, 1, 0);
    else if (ty === 'horse') { P.rr(x - 2, y, 3, L, k, null, 1); if (w) P.set(x - 2 - w, y + L - 1, k, 1); }
  }

  // four-legged animal seen from the side
  function quad(P, o, p) {
    var j = o.juv, f = o.fr | 0;
    var len = sc(o, p.len, 0.7), bh = sc(o, p.bh, 0.74), leg = Math.max(p.leg < 2 ? 1 : 2, sc(o, p.leg, 0.6)), lw = j ? Math.max(2, (p.lw || 3) - 1) : (p.lw || 3);
    var hw = sc(o, p.head[0], 0.88), hh = sc(o, p.head[1], 0.88);
    var x0 = -Math.round(len / 2) - (p.shift || 0), x1 = x0 + len - 1, yb = -leg - 1, yt = yb - bh + 1;
    var hd = p.hd || [1, 0], hx = x1 + Math.round(hd[0] * (j ? 0.6 : 1)), hy = yt + Math.round(hd[1] * (j ? 0.55 : 1));
    var st = p.stride || (leg > 3 ? 2 : 1), sg = sgn(f), lk = p.legK || 'A', li = p.legIn == null ? 1 : p.legIn, fo = p.farOff == null ? 2 : p.farOff;
    if (j) { st = 1; if (fo > 1) fo = 1; }
    var nbx = x0 + li, nfx = x1 - lw + 1 - li;
    var m = { x0: x0, x1: x1, yt: yt, yb: yb, hx: hx, hy: hy, hw: hw, hh: hh, len: len, bh: bh, leg: leg, lw: lw, j: j, f: f, sg: sg, nbx: nbx, nfx: nfx };
    m.earX = hx - Math.round(hw / 4); m.earTop = hy - Math.floor((hh - 1) / 2);
    function legf(x, dx, far) {
      var top = yb - 1, bot = -1 - (dx > 0 ? 1 : 0), mid = Math.round((top + bot) / 2), s = far ? 2 : 1, kx = Math.abs(dx) > 1 ? (dx > 0 ? 1 : -1) : 0;
      P.rect(x + kx, top, lw, mid - top + 1, lk, s); P.rect(x + dx, mid + 1, lw, bot - mid, lk, s);
      if (p.foot) P.rect(x + dx, bot - (p.footH || 1) + 1, lw + (p.footW || 0), p.footH || 1, p.foot, s);
      if (p.legFx) p.legFx(P, x + dx, top, bot, far);
    }
    if (!p.noFar && !(j && len < 9)) P.part(function () { legf(nbx + fo, sg * st, true); legf(nfx - fo, -sg * st, true); }, true);
    if (p.tail) P.part(function () { tailDraw(P, o, p.tail, x0, yt + (p.tailY == null ? 2 : p.tailY), f); }, true);
    if (p.back) p.back(P, m);
    P.part(function () {
      if (p.bs === 'ell') P.ell((x0 + x1) / 2, (yt + yb) / 2, (len - 1) / 2, (bh - 1) / 2, 'A'); else P.rr(x0, yt, len, bh, 'A', null, p.br);
      if (p.body) p.body(P, m);
    }, true);
    P.part(function () { legf(nbx, -sg * st, false); legf(nfx, sg * st, false); });
    if (p.nw) P.part(function () { var nw = sc(o, p.nw, 0.8); P.line(x1 - Math.floor(nw / 2) - (p.nb || 0), yt + Math.floor(nw / 2), hx - 1, hy + 1, p.neckK || 'A', 1, nw); if (p.neck) p.neck(P, m); }, true);
    if (p.pre) p.pre(P, m);
    if (p.ear) P.part(function () { earDraw(P, p.ear, m.earX + 3, m.earTop, 2, j); }, true);
    P.part(function () {
      if (p.hs === 'box') P.rr(hx - Math.floor(hw / 2), hy - Math.floor(hh / 2), hw, hh, p.headK || 'A', null, p.hr); else P.ell(hx, hy, (hw - 1) / 2, (hh - 1) / 2, p.headK || 'A');
      if (p.snout) {
        var sl = sc(o, p.snout[0], 0.75), s2 = sc(o, p.snout[1], 0.85), sx0 = hx + Math.floor((hw - 1) / 2) - 1, sy0 = hy + (p.snout[2] == null ? 1 : p.snout[2]) - Math.floor(s2 / 2) + (j ? 0 : 0);
        P.rr(sx0, sy0, sl + 1, s2, p.snoutK || p.headK || 'A', p.snoutS, 1);
        m.sx = sx0 + sl; m.sy0 = sy0; m.sy1 = sy0 + s2 - 1;
      } else { m.sx = hx + Math.floor((hw - 1) / 2); m.sy0 = hy; m.sy1 = hy + 1; }
      if (p.face) p.face(P, m);
    }, p.noHeadSep);
    if (p.ear) P.part(function () { earDraw(P, p.ear, m.earX, m.earTop, 1, j); });
    var e = p.eye || [1, -1]; m.ex = hx + e[0]; m.ey = hy + e[1];
    if (e[2] !== 0) { P.set(m.ex, m.ey, 'K'); if (e[2] !== 1) P.set(m.ex, m.ey + 1, 'K'); }
    if (p.snout && p.nose !== 0) { P.set(m.sx, m.sy0, p.noseK || 'N'); if (p.nose === 2) { P.set(m.sx, m.sy0 + 1, p.noseK || 'N'); P.set(m.sx - 1, m.sy0, p.noseK || 'N'); } }
    return m;
  }
  function earDraw(P, e, x, top, s, j) { // e = [type, size, key, inner key]
    var ty = e[0], n = Math.max(1, j ? Math.round((e[1] || 2) * 0.8) : (e[1] || 2)), k = e[2] || 'A';
    if (ty === 'round') { if (n <= 1) P.rect(x - 1, top - 1, 2, 2, k, s); else { P.ell(x, top, n * 0.75, n * 0.75, k, s); if (e[3] && s === 1) P.set(x, top, e[3], 1); } }
    else if (ty === 'point') { P.poly([[x - 1, top + 1], [x, top - n], [x + 1 + (n > 2 ? 1 : 0), top + 1]], k, s); if (e[3] && s === 1 && n > 1) P.set(x, top - n + 2, e[3], 1); }
    else if (ty === 'long') { P.rr(x - 1, top - n, 2, n + 2, k, s, 0); if (e[3]) P.rect(x - 1, top - n, 2, Math.max(1, Math.round(n / 3)), e[3], s); }
  }

  // small bird seen from the side
  function bird(P, o, p) {
    var f = o.fr | 0, sg = sgn(f), bw = sc(o, p.bw, 0.75), bh = sc(o, p.bh, 0.75), leg = Math.max(1, sc(o, p.leg || 2, 0.7)), hw = sc(o, p.head[0], 0.9), hh = sc(o, p.head[1], 0.9);
    var cy = -leg - 1 - (bh - 1) / 2, hd = p.hd || [2, -2], k = o.juv ? 0.6 : 1;
    var hx = Math.round((bw - 1) / 2 + hd[0] * k - (hw - 1) / 2), hy = Math.round(cy - (bh - 1) / 2 + hd[1] * k + 1);
    var m = { cy: cy, bw: bw, bh: bh, hx: hx, hy: hy, hw: hw, hh: hh, leg: leg, f: f, sg: sg, j: o.juv }, lk = p.legK || 'L', lx = p.legX || 0, lt = p.legT || 1;
    P.part(function () {
      P.rect(lx - 2 - sg, -leg - 2, lt, leg + 2 - (sg < 0 ? 1 : 0), lk, 2); P.rect(lx + 1 + sg, -leg - 2, lt, leg + 2 - (sg > 0 ? 1 : 0), lk, 1);
      P.rect(lx - 2 - sg, -1 - (sg < 0 ? 1 : 0), lt + 1, 1, lk, 2); P.rect(lx + 1 + sg, -1 - (sg > 0 ? 1 : 0), lt + 1, 1, lk, 1);
    }, true);
    if (p.tail) P.part(function () { var t = p.tail, L = sc(o, t[0], 0.7), th = t[1] || 2, dy = (t[2] || 0) * k, bx = -(bw - 1) / 2 + 2; P.poly([[bx, cy - 1], [bx - L, cy + dy - th / 2], [bx - L, cy + dy + th / 2], [bx, cy + 2]], t[3] || 'A', 'a'); }, true);
    if (p.back) p.back(P, m);
    P.part(function () { P.ell(0, cy, (bw - 1) / 2, (bh - 1) / 2, 'A'); if (p.body) p.body(P, m); }, true);
    if (p.pre) p.pre(P, m);
    P.part(function () { P.ell(hx, hy, (hw - 1) / 2, (hh - 1) / 2, p.headK || 'A'); if (p.face) p.face(P, m); });
    if (p.wing) P.part(function () { var wg = p.wing; P.ell(-1 + (wg[2] || 0), cy + (wg[3] || 0) + (sg ? -1 : 0) * (wg[5] || 0), sc(o, wg[0], 0.75) / 2, sc(o, wg[1], 0.75) / 2, wg[4] || 'C'); if (p.wingFx) p.wingFx(P, m); });
    var b = p.beak;
    if (b) { var bl = sc(o, b[0], 0.8), b2 = b[1], bx = hx + Math.floor((hw - 1) / 2), by = hy + (b[3] || 0); m.bx = bx; m.by = by; m.bl = bl;
      P.part(function () { P.poly([[bx, by - Math.floor(b2 / 2)], [bx + bl - (b[4] ? 1 : 0), by - Math.floor(b2 / 2) + (b[4] ? 0 : Math.floor(b2 / 2))], [bx + bl, by + (b[4] ? Math.ceil(b2 / 2) : 0)], [bx, by + Math.ceil(b2 / 2) - (b[4] ? 1 : 0)]], b[2] || 'Y', 1); if (p.beakFx) p.beakFx(P, m); }); }
    var e = p.eye || [1, -1]; m.ex = hx + e[0]; m.ey = hy + e[1]; P.set(m.ex, m.ey, 'K'); if (e[2] === 2) P.set(m.ex, m.ey + 1, 'K');
    return m;
  }

  // tall running bird (ostrich, emu)
  function tallbird(P, o, p) {
    var f = o.fr | 0, sg = sgn(f), bw = sc(o, p.bw, 0.72), bh = sc(o, p.bh, 0.75), leg = sc(o, p.leg, 0.62), nk = sc(o, p.neck, 0.6), cy = -leg - (bh - 1) / 2;
    var nx = Math.round((bw - 1) / 2) - 1, hx = nx + 2, hy = Math.round(cy - (bh - 1) / 2 - nk + 2), m = { cy: cy, bw: bw, bh: bh, hx: hx, hy: hy, f: f, j: o.juv, nx: nx };
    function lg(x, dx, s) { var kn = Math.round(-leg / 2); P.path([[x, -leg - 1], [x + (dx > 0 ? 2 : dx < 0 ? -1 : 0), kn], [x + dx, -1 - (dx > 0 ? 1 : 0)]], p.legK || 'L', s, o.juv ? 1 : 2); P.rect(x + dx, -1 - (dx > 0 ? 1 : 0), 3, 1, p.legK || 'L', s); }
    P.part(function () { lg(-2, -sg * 3, 2); }, true);
    if (p.back) p.back(P, m);
    P.part(function () { P.path([[nx, cy - 1], [nx + 2, cy - (bh - 1) / 2 - 1], [hx - 1, hy + 2]], p.neckK || 'A', 1, 2); }, true);
    P.part(function () { P.ell(0, cy, (bw - 1) / 2, (bh - 1) / 2, 'A'); if (p.body) p.body(P, m); }, true);
    P.part(function () { lg(1, sg * 3, 1); });
    P.part(function () { P.rr(hx - 2, hy - 1, 5, 4, p.headK || p.neckK || 'A', 1, 1); P.rect(hx + 3, hy + 1, o.juv ? 2 : 3, 1, p.beakK || 'Y', 1); P.set(hx + 3, hy + 2, p.beakK || 'Y', 2); });
    P.set(hx + 1, hy, 'K'); if (!o.juv) P.set(hx + 1, hy + 1, 'K');
    return m;
  }

  // animal sitting or standing upright, seen from the front and a little to the right (apes, pandas, penguins, owls)
  function sitter(P, o, p) {
    var f = o.fr | 0, sg = sgn(f), bw = sc(o, p.bw, 0.74), bh = sc(o, p.bh, 0.72), hw = sc(o, p.head[0], 0.88), hh = sc(o, p.head[1], 0.88);
    var bx = -Math.floor(bw / 2), top = -bh, hx = p.hx == null ? 1 : p.hx, hy = top - Math.round(hh / 2) + (p.ho == null ? 2 : p.ho) + (sg ? (p.bob || 0) : 0);
    var m = { bx: bx, bw: bw, bh: bh, top: top, hx: hx, hy: hy, hw: hw, hh: hh, f: f, j: o.juv, sg: sg };
    if (p.back) p.back(P, m);
    P.part(function () {
      P.rr(bx, top, bw, bh, 'A', null, p.br == null ? 2 : p.br);
      if (p.belly) { var bl = p.belly; P.ell(hx * 0.5 + (bl[3] || 0), top + bh * 0.56 + (bl[4] || 0), (sc(o, bl[0], 0.74) - 1) / 2, (sc(o, bl[1], 0.72) - 1) / 2, bl[2] || 'B', 1); }
      if (p.body) p.body(P, m);
    }, true);
    if (p.foot) P.part(function () { var ft = p.foot, fw = ft[0], fh = ft[1], fk = ft[2] || 'A'; P.rr(bx - 1 + (sg > 0 ? -1 : 0), -fh, fw, fh, fk, 1, fh > 1 ? 1 : 0); P.rr(bx + bw - fw + 1 + (sg < 0 ? 1 : 0), -fh, fw, fh, fk, 1, fh > 1 ? 1 : 0); });
    if (p.arm) P.part(function () {
      var a = p.arm, al = sc(o, a[0], 0.72), aw = a[1], ak = a[2] || 'A', ay = top + (a[3] == null ? 2 : a[3]);
      P.rr(bx - aw + 1, ay + (sg > 0 ? -1 : 0), aw, al, ak, null, 1); P.rr(bx + bw - 1, ay + (sg < 0 ? -1 : 0), aw, al, ak, null, 1);
      if (a[4]) { P.rect(bx - aw + 1, ay + al - 1 + (sg > 0 ? -1 : 0), aw, 1, a[4], 1); P.rect(bx + bw - 1, ay + al - 1 + (sg < 0 ? -1 : 0), aw, 1, a[4], 1); }
    });
    if (p.pre) p.pre(P, m);
    P.part(function () {
      if (p.hs === 'box') P.rr(hx - Math.floor(hw / 2), hy - Math.floor(hh / 2), hw, hh, p.headK || 'A', null, p.hr); else P.ell(hx, hy, (hw - 1) / 2, (hh - 1) / 2, p.headK || 'A');
      if (p.face) p.face(P, m);
    });
    var e = p.eye || [-1, 2, 0]; m.e0 = hx + e[0]; m.e1 = hx + e[1]; m.ey = hy + (e[2] || 0);
    if (e[3] !== 0) { P.set(m.e0, m.ey, 'K'); P.set(m.e1, m.ey, 'K'); if (e[3] !== 1) { P.set(m.e0, m.ey + 1, 'K'); P.set(m.e1, m.ey + 1, 'K'); } }
    if (p.post) p.post(P, m);
    return m;
  }

  // fish and other swimmers, drawn hovering a little above the anchor so they sit in a water tile
  function fish(P, o, p) {
    var f = o.fr | 0, wg = sgn(f), len = sc(o, p.len, 0.7), h = sc(o, p.h, 0.75), lift = p.lift == null ? 4 : p.lift, cy = -lift - (h - 1) / 2 + (f === 2 ? 0 : 0);
    var x1 = (len - 1) / 2, x0 = -x1, ry = (h - 1) / 2, m = { cy: cy, x0: x0, x1: x1, len: len, h: h, ry: ry, f: f, wg: wg, j: o.juv };
    if (p.tail) P.part(function () { var t = p.tail, tl = sc(o, t[0], 0.75), th = sc(o, t[1], 0.75), tx = Math.round(x0) + 1; P.poly([[tx + 2, cy], [tx - tl, cy - th / 2 + wg + (t[4] || 0)], [tx - tl + (t[3] == null ? 1 : t[3]), cy + wg], [tx - tl, cy + th / 2 + wg]], t[2] || 'A', 1); if (p.tailFx) p.tailFx(P, m, tx - tl); }, true);
    if (p.dorsal) P.part(function () { var d = p.dorsal, dx = d[2] || 0, dh = sc(o, d[1], 0.75), dw = sc(o, d[0], 0.75); P.poly([[dx - dw / 2, cy - ry + 1], [dx - dw / 2 + (d[4] || 0), cy - ry - dh], [dx + dw / 2, cy - ry + 1]], d[3] || 'A', 2); if (p.dorsalFx) p.dorsalFx(P, m, dx - dw / 2 + (d[4] || 0), cy - ry - dh); }, true);
    if (p.back) p.back(P, m);
    P.part(function () {
      P.ell(0, cy, x1, ry, 'A');
      if (p.belly) P.recolor('A', p.belly === true ? 'B' : p.belly, function (x, y) { return y > cy + ry * 0.3; });
      if (p.body) p.body(P, m);
    }, true);
    if (p.pect) P.part(function () { var q = p.pect, qx = q[2] == null ? 2 : q[2]; P.poly([[qx, cy + 1], [qx - q[0], cy + 1 + q[1] - (wg ? 1 : 0)], [qx - q[0] + 2, cy + 1]], q[3] || 'A', 2); });
    var e = p.eye || [3, -1]; m.ex = Math.round(x1) - e[0]; m.ey = Math.round(cy) + e[1]; P.set(m.ex, m.ey, 'K'); if (e[2] !== 1) P.set(m.ex, m.ey + 1, 'K');
    if (p.post) p.post(P, m);
    return m;
  }

  // two-legged runner with a long tail (dinosaurs, kangaroo)
  function biped(P, o, p) {
    var f = o.fr | 0, sg = sgn(f), len = sc(o, p.len, 0.72), bh = sc(o, p.bh, 0.74), leg = Math.max(3, sc(o, p.leg, 0.66)), hw = sc(o, p.head[0], 0.9), hh = sc(o, p.head[1], 0.9), k = o.juv ? 0.6 : 1;
    var hop = p.hop && sg ? -p.hop : 0, cy = -leg - (bh - 1) / 2 + 1 + hop, rx = (len - 1) / 2, ry = (bh - 1) / 2, hd = p.hd || [3, -4];
    var hx = Math.round(rx + hd[0] * k), hy = Math.round(cy - ry + hd[1] * k), lw = o.juv ? 2 : (p.lw || 3), lx = p.legX == null ? -1 : p.legX;
    var m = { cy: cy, rx: rx, ry: ry, hx: hx, hy: hy, hw: hw, hh: hh, f: f, sg: sg, j: o.juv, len: len, bh: bh, leg: leg };
    function lg(x, dx, far) {
      var s = far ? 2 : 1, lk = p.legK || 'A', lift = dx > 0 ? 1 : 0, top = Math.round(cy);
      P.ell(x + (dx > 0 ? 1 : dx < 0 ? -1 : 0), top + 1, lw * 0.75 + 0.5, ry * 0.8, lk, far ? 2 : null);
      P.rect(x - Math.floor(lw / 2) + dx, top + 1, lw - (lw > 2 ? 1 : 0), -1 - lift - top, lk, s);
      P.rect(x - Math.floor(lw / 2) + dx, -1 - lift - hop, (p.footL || 4), 1 + (hop ? 0 : 0), p.footK || lk, s);
      if (hop) P.rect(x - Math.floor(lw / 2) + dx, top + 1, lw - (lw > 2 ? 1 : 0), -1 - lift - top - hop, lk, s);
    }
    P.part(function () { lg(lx + 2, -sg * 2, true); }, true);
    if (p.tail) P.part(function () { var t = p.tail, tl = sc(o, t[0], 0.75), tdy = t[1] || 0, tk = t[2] || 'A', bx = -rx + 2; P.poly([[bx, cy - ry + 1], [bx - tl, cy + tdy + (sg ? 1 : 0) - 0.5], [bx - tl, cy + tdy + (sg ? 1 : 0) + 0.5], [bx, cy + ry - 1]], tk, 'a'); if (p.tailFx) p.tailFx(P, m, bx - tl, cy + tdy); }, true);
    if (p.back) p.back(P, m);
    P.part(function () { P.ell(0, cy, rx, ry, 'A'); if (p.belly) P.recolor('A', 'B', function (x, y) { return y > cy + ry * 0.35 && x > -rx * 0.5; }); if (p.body) p.body(P, m); }, true);
    if (p.nw) P.part(function () { var nw = sc(o, p.nw, 0.8); P.line(rx - nw / 2, cy - ry + nw / 2, hx - 1, hy + 1, 'A', 1, nw); if (p.belly) P.recolor('A', 'B', function (x, y) { return false; }); }, true);
    P.part(function () { lg(lx, sg * 2, false); });
    if (p.arm) P.part(function () { var a = p.arm, ax = Math.round(rx) - 2 + (a[2] || 0), ay = Math.round(cy) + (a[3] || 0); P.path([[ax, ay], [ax + a[0], ay + a[1] + (sg ? 1 : 0)]], p.armK || 'A', 1, a[4] || 1); if (p.claw) P.set(ax + a[0] + 1, ay + a[1] + (sg ? 1 : 0), p.claw, 1); });
    if (p.pre) p.pre(P, m);
    P.part(function () {
      if (p.hs === 'ell') P.ell(hx, hy, (hw - 1) / 2, (hh - 1) / 2, 'A'); else P.rr(hx - Math.floor(hw / 2), hy - Math.floor(hh / 2), hw, hh, 'A', null, p.hr);
      if (p.face) p.face(P, m);
    });
    var e = p.eye || [1, -1]; m.ex = hx + e[0]; m.ey = hy + e[1]; P.set(m.ex, m.ey, 'K'); if (e[2] !== 1) P.set(m.ex, m.ey + 1, 'K');
    if (p.post) p.post(P, m);
    return m;
  }

  // heavy trunked animal (elephant, mammoth)
  function trunked(P, o, p) {
    var j = o.juv;
    var m = quad(P, o, { len: p.len, bh: p.bh, leg: p.leg, lw: 4, head: p.head, hd: p.hd || [0, 1], tail: ['tuft', 5, 'C'], eye: [1, -2, 0], body: p.body, back: p.back, stride: 1, foot: p.foot, br: 3,
      pre: p.pre, face: p.face });
    var hx = m.hx, hy = m.hy, r = Math.floor((m.hw - 1) / 2), tl = -2, tx = hx + r + (j ? 1 : 2);
    P.part(function () { // trunk: down from the face, tip curling forward
      P.path([[hx + r - 1, hy], [tx, hy + 3], [tx, tl - 2]], 'A', 1, j ? 2 : 3); P.path([[tx, tl - 1], [tx + 1 + (m.sg ? 1 : 0), tl + (m.sg ? -1 : 0)]], 'A', 1, 2);
      for (var y = hy + 4; y < tl - 1; y += 2) P.sh(tx - 1, y, 2);
    });
    if (p.tusk) P.part(function () { p.tusk(P, m, hx + r - 1, hy + (j ? 2 : 3)); });
    P.part(function () { var e = p.earS || [4, 5]; P.ell(hx - r - 2 + (p.earX || 0), hy + (p.earY || 0), j ? e[0] * 0.75 : e[0], j ? e[1] * 0.75 : e[1], 'E'); });
    P.set(hx + 1, hy - 2, 'K'); P.set(hx + 1, hy - 1, 'K'); P.set(hx + 2, hy - 2, 'K'); P.set(hx + 2, hy - 1, 'K'); P.set(hx + 2, hy - 2, 'W'); P.sh(hx, hy - 3, 2); P.sh(hx + 1, hy - 3, 2); P.sh(hx + 2, hy - 3, 2);
    return m;
  }

  // seal-shaped animal lying on its belly, head up at the right
  function blob(P, o, p) {
    var f = o.fr | 0, sg = sgn(f), len = sc(o, p.len, 0.7), h = sc(o, p.h, 0.75), hw = sc(o, p.head[0], 0.88), hh = sc(o, p.head[1], 0.88);
    var x0 = -Math.round(len / 2), x1 = x0 + len - 1, hx = x1 - Math.round(hw / 3), hy = -h - Math.round(hh / 4) + (sg ? 1 : 0) - (p.lift || 0), m = { x0: x0, x1: x1, hx: hx, hy: hy, hw: hw, hh: hh, h: h, f: f, sg: sg, j: o.juv };
    P.part(function () { P.poly([[x0 + 3, -3], [x0 - 2, -5 - (sg > 0 ? 1 : 0)], [x0 - 1, -3], [x0 - 3, -1], [x0 + 2, -1]], p.flipK || 'A', 2); }, true);
    P.part(function () {
      P.poly([[x0 + 1, -2], [x0 + 3, -h + 1], [x0 + len * 0.45, -h], [hx, -h - 1 - (p.lift || 0)], [x1, -h + 2], [x1, -1], [x0 + 2, -1]], 'A', 'a');
      if (p.body) p.body(P, m);
    }, true);
    P.part(function () { var fx = x0 + Math.round(len * 0.55) + sg; P.poly([[fx, -3], [fx + 4, -1], [fx - 2, -1]], p.flipK || 'A', 2); });
    P.part(function () { P.ell(hx, hy, (hw - 1) / 2, (hh - 1) / 2, p.headK || 'A'); if (p.face) p.face(P, m); });
    var e = p.eye || [1, -1]; m.ex = hx + e[0]; m.ey = hy + e[1]; P.set(m.ex, m.ey, 'K'); if (e[2] !== 1) P.set(m.ex, m.ey + 1, 'K');
    if (p.post) p.post(P, m);
    return m;
  }

  // =====================================================================================================================
  // ANIMALS: the 68 species. def(id, palette, rare-variant palette changes, draw function, options)
  // Palette roles are single letters: A is the main coat; K (eye black), W (white) and N (nose) always exist.
  // =====================================================================================================================
  var SP = {};
  function def(id, pal, vpal, draw, opt) { SP[id] = { pal: pal, vpal: vpal, draw: draw, opt: opt || {} }; }

  def('?', { A: '#a9a2b4' }, null, function (P, o) { quad(P, o, { len: 12, bh: 7, leg: 4, lw: 3, head: [8, 7], hd: [2, -1], snout: [3, 4, 1], ear: ['round', 2], tail: ['stub', 2] }); });

  // ---------- savanna ----------
  def('warthog', { A: '#8f7464', C: '#4b352c', T: '#fff3d4', S: '#c08c80' }, { A: '#b9573c', C: '#5e2418', S: '#e0a090' }, function (P, o) {
    var m = quad(P, o, { len: 13, bh: 8, leg: 4, lw: 2, head: [8, 7], hs: 'box', hd: [2, 2], snout: [5, 4, 1], ear: ['point', 2], tail: ['up', 5, 'C'], eye: [0, -2], nose: 0,
      back: function (P, m) { for (var x = m.x0 + 2; x <= m.x1 + 1; x++) P.rect(x, m.yt - 1 - (x & 1), 1, 2 + (x & 1), 'C', 1); } });
    P.rect(m.sx, m.sy0, 1, m.sy1 - m.sy0 + 1, 'S', 1);
    if (!o.juv) P.path([[m.sx - 3, m.sy1], [m.sx - 1, m.sy1 + 1], [m.sx + 1, m.sy1], [m.sx + 1, m.sy1 - 2]], 'T', 0); else P.set(m.sx - 1, m.sy1, 'T', 0);
  });
  def('zebra', { A: '#f7f4ec', C: '#2d2733' }, { A: '#f8e08e', C: '#b47a26' }, function (P, o) {
    var m = quad(P, o, { len: 14, bh: 8, leg: 7, lw: 2, head: [7, 6], hd: [3, -4], nw: 4, snout: [4, 4, 1], snoutK: 'C', ear: ['point', 2], tail: ['tuft', 5, 'C'], foot: 'C', nose: 0,
      pre: function (P, m) { P.line(m.x1 - 3, m.yt, m.hx - 3, m.hy - 2, 'C', 1, 2); } });
    P.recolor('A', 'C', function (x, y) { if (y > m.yb) return (y & 1) === 0; if (x >= m.hx - 2 && y <= m.hy + 3) return x < m.hx + 2 && ((x + y) % 3 + 3) % 3 === 0 && y !== m.ey && y !== m.ey + 1; return ((x - (y >> 1)) % 3 + 3) % 3 === 0; });
  });
  def('ostrich', { A: '#2f2b36', F: '#f3f0ea', P: '#eab6a4', Y: '#d99a6a' }, { A: '#f3f0ea', F: '#cfd6e2' }, function (P, o) {
    tallbird(P, o, { bw: 12, bh: 9, leg: 10, neck: 10, neckK: 'P', legK: 'P', beakK: 'Y',
      back: function (P, m) { P.ell(-m.bw / 2, m.cy - 1, 2.5, 2.5, 'F'); },
      body: function (P, m) { P.ell(-1, m.cy + 1.5, m.bw / 4, 1.2, 'F', 1); } });
  }, { jpal: { A: '#b89a78', F: '#e8d8b8' } });
  def('giraffe', { A: '#f6d06a', C: '#a8662c', T: '#5a3a22' }, { A: '#f8e6ac', C: '#f3d792' }, function (P, o) {
    var m = quad(P, o, { len: 12, bh: 7, leg: 10, lw: 2, head: [6, 5], hd: [5, -13], nw: 3, snout: [4, 3, 1], ear: ['point', 1], tail: ['tuft', 6, 'T'], foot: 'T',
      pre: function (P, m) { P.line(m.x1 - 2, m.yt - 1, m.hx - 3, m.hy, 'C', 1, 1); } });
    P.rect(m.hx - 1, m.hy - 4, 1, 2, 'A', 1); P.set(m.hx - 1, m.hy - 5, 'T'); P.rect(m.hx + 1, m.hy - 4, 1, 2, 'A', 1); P.set(m.hx + 1, m.hy - 5, 'T');
    P.recolor('A', 'C', function (x, y) { if (y > -4 || (x > m.hx - 1 && y < m.hy + 3)) return false; var r = Math.floor((y + 90) / 3); return (y + 90) % 3 !== 2 && (x + 90 + (r & 1) * 2) % 4 !== 3; });
  });
  def('hyena', { A: '#cdaa72', C: '#4b3b37', B: '#e6cf9c' }, { A: '#f1e8d6', C: '#948a80', B: '#ffffff' }, function (P, o) {
    var m = quad(P, o, { len: 13, bh: 7, leg: 6, lw: 2, head: [8, 7], hd: [3, -2], nw: 5, snout: [4, 4, 1], snoutK: 'C', ear: ['round', 2, 'A', 'C'], tail: ['bush', 5, 'C', 3], tailY: 4, nose: 0,
      back: function (P, m) { for (var x = m.x1 - 8; x <= m.x1 - 2; x++) P.rect(x, m.yt - 2 - (x & 1), 1, 3, 'C', 1); },
      body: function (P, m) { // high shoulders, low sloping rump
        P.ell(m.x1 - 3, m.yt, 4.5, 3.5, 'A');
        for (var i = 0; i < 6; i++) P.clr(m.x0 + i, m.yt); for (i = 0; i < 4; i++) P.clr(m.x0 + i, m.yt + 1); P.clr(m.x0, m.yt + 2); P.clr(m.x0 + 1, m.yt + 2);
        P.recolor('A', 'B', function (x, y) { return y === m.yb && x > m.x0 + 2; });
      } });
    spots(P, 'A', 'C', m.x0, m.yt - 3, m.x1 - 1, m.yb - 1, 0.3, 7, 1);
    P.recolor('AB', 'C', function (x, y) { return y > -3; });
  });
  def('meerkat', { A: '#d7b07a', B: '#f4e4be', C: '#5b4433' }, { A: '#c9ccd4', B: '#f1f3f5', C: '#666b78' }, function (P, o) {
    var m = sitter(P, o, { bw: 6, bh: 10, head: [7, 6], hx: 1, ho: 1, arm: [4, 1, 'A', 3], foot: [3, 1, 'C'], belly: [4, 7, 'B'], eye: [-1, 2, -1, 1],
      back: function (P, m) { var u = m.sg ? 1 : 0; P.path([[m.bx, -2], [m.bx - 3, -1], [m.bx - 5, -2 - u]], 'A', 2, 1); P.set(m.bx - 5, -2 - u, 'C'); P.set(m.bx - 4, -1 - u, 'C'); },
      face: function (P, m) { P.rect(m.hx - 2, m.hy - 1, 2, 2, 'C', 1); P.rect(m.hx + 1, m.hy - 1, 2, 2, 'C', 1); P.rect(m.hx, m.hy + 1, 3, 1, 'B', 1); P.set(m.hx + 1, m.hy + 1, 'N'); } });
    P.set(m.hx - 3, m.hy - 1, 'C'); P.set(m.hx + 3, m.hy - 1, 'C');
  });
  def('lion', { A: '#e3ae56', B: '#f8e6b8', M: '#9a5522', C: '#c78a3a' }, { A: '#f6f1e4', B: '#ffffff', M: '#d6cbb2', C: '#ded4bf' }, function (P, o) {
    var j = o.juv, m = quad(P, o, { len: 14, bh: 8, leg: 5, lw: 3, head: [8, 8], hd: [2, -1], snout: [3, 4, 2], snoutK: 'B', ear: ['round', 2, 'A'], tail: ['tuft', 6, 'M'],
      pre: function (P, m) { if (!j) P.part(function () { P.ell(m.hx - 1, m.hy + 1, 6.4, 6.4, 'M'); for (var a = 0; a < 16; a++) { var t = a / 16 * 6.283; P.set(m.hx - 1 + Math.cos(t) * 7.3, m.hy + 1 + Math.sin(t) * 7.1, 'M', 2); } }); } });
    if (j) spots(P, 'A', 'C', m.x0 + 1, m.yt + 1, m.x1 - 2, m.yb - 2, 0.14, 3);
  });
  def('elephant', { A: '#a3a9b8', E: '#747a90', C: '#5d6170', T: '#fff6dc' }, { A: '#f2b8c4', E: '#e29aac', C: '#b56a80' }, function (P, o) {
    trunked(P, o, { len: 15, bh: 11, leg: 5, head: [10, 10], hd: [0, 1], earS: [3.4, 5],
      tusk: function (P, m, x, y) { if (m.j) { P.set(x + 1, y + 1, 'T', 1); return; } P.path([[x, y], [x + 3, y + 2], [x + 5, y + 1]], 'T', 0, 1); P.path([[x, y + 1], [x + 3, y + 3]], 'T', 1, 1); } });
  });
  def('cheetah', { A: '#ecba50', B: '#fcf0d0', C: '#3b2b24' }, { A: '#e8ac40', B: '#fcf0d0', C: '#2a1c18' }, function (P, o) {
    var m = quad(P, o, { len: 14, bh: 6, leg: 7, lw: 2, head: [6, 6], hd: [2, -2], nw: 3, snout: [2, 3, 1], snoutK: 'B', ear: ['round', 1], tail: ['cat', 8, 'A', 2], tailY: 1 });
    P.recolor('A', 'B', function (x, y) { return y >= m.yb - 1 && y <= m.yb && x > m.x0 + 2 && x < m.x1 - 1; });
    spots(P, 'A', 'C', -40, -40, m.hx - 2, -2, o.variant ? 0.42 : 0.22, 11, 1);
    P.set(m.ex, m.ey + 2, 'C'); P.set(m.ex + 1, m.ey + 3, 'C');
  });
  def('rhino', { A: '#80828f', C: '#5c5e6b', T: '#ece0c4' }, { A: '#ebe4d2', C: '#b9b09a', T: '#fff8e6' }, function (P, o) {
    var j = o.juv, m = quad(P, o, { len: 16, bh: 10, leg: 4, lw: 4, head: [9, 8], hs: 'box', hr: 2, hd: [3, 3], snout: [5, 6, 1], ear: ['point', 2], tail: ['thin', 4, 'A'], nose: 0, stride: 1,
      body: function (P, m) { for (var y = m.yt + 1; y < m.yb; y++) { P.sh(m.x0 + 4, y, 2); P.sh(m.x1 - 5, y, 2); } } });
    P.part(function () {
      if (j) P.poly([[m.sx - 2, m.sy0], [m.sx - 1, m.sy0 - 2], [m.sx, m.sy0]], 'T', 1);
      else { P.poly([[m.sx - 3, m.sy0], [m.sx + 1, m.sy0 - 6], [m.sx, m.sy0]], 'T', 1); P.poly([[m.sx - 6, m.sy0], [m.sx - 5, m.sy0 - 3], [m.sx - 4, m.sy0]], 'T', 1); }
    });
  });

  function rosettes(P, from, to, x0, y0, x1, y1) { // little broken rings, the big-cat coat
    P.recolor(from, to, function (x, y) {
      if (x < x0 || x > x1 || y < y0 || y > y1) return false;
      var r = Math.floor((y + 90) / 3), cy = (y + 90) % 3, cx = (x + 90 + (r & 1) * 2) % 4;
      return (cy === 0 && cx < 2) || (cy === 1 && cx === 0);
    }, 1);
  }

  // ---------- rainforest ----------
  def('capybara', { A: '#b0763f', C: '#6e4a2c' }, { A: '#eedcb4', C: '#c9ae80' }, function (P, o) {
    var m = quad(P, o, { len: 14, bh: 9, leg: 4, lw: 3, head: [8, 8], hs: 'box', hr: 2, hd: [3, 0], snout: [4, 7, 0], ear: ['round', 1, 'C'], eye: [0, -2], nose: 2, stride: 1, br: 3 });
    P.set(m.sx - 1, m.sy1 - 1, 'C', 2); P.set(m.sx, m.sy1 - 1, 'C', 2); P.set(m.sx - 2, m.sy1 - 1, 'C', 2);
  });
  def('macaw', { A: '#e23a34', C: '#f4c430', D: '#2f6fd8', Y: '#f3ecda', L: '#55505c' }, { A: '#2f74dc', C: '#f4c430', D: '#1d3f9a' }, function (P, o) {
    bird(P, o, { bw: 8, bh: 10, leg: 2, head: [7, 7], hd: [1, -3], beak: [3, 5, 'Y', 1, 1], wing: [5, 7, -1, 1, 'C'], tail: [8, 3, 7, 'D'],
      face: function (P, m) { P.recolor('A', 'W', function (x, y) { return x >= m.hx && y >= m.hy - 1 && y <= m.hy + 1; }); },
      wingFx: function (P, m) { P.recolor('C', 'D', function (x, y) { return y > m.cy + 1; }); },
      beakFx: function (P, m) { P.recolor('Y', 'K', function (x, y) { return y >= m.by + 2; }); } });
  });
  def('toucan', { A: '#28242f', B: '#fff6c8', Y: '#f59a1c', R: '#e0452c', L: '#6a7fa8', E: '#3aa0d8' }, { A: '#f4f1ea', B: '#f8d848', Y: '#f6c62c', E: '#e0452c' }, function (P, o) {
    var m = bird(P, o, { bw: 9, bh: 9, leg: 2, head: [7, 7], hd: [1, -3], beak: [8, 5, 'Y', 1, 1], wing: [5, 5, -1, 1, 'A'], tail: [5, 3, 5, 'A'],
      body: function (P, m) { P.recolor('A', 'B', function (x, y) { return x > 0 && y < m.cy + 1; }); },
      face: function (P, m) { P.recolor('A', 'B', function (x, y) { return x >= m.hx && y >= m.hy + 1; }); },
      beakFx: function (P, m) { P.recolor('Y', 'R', function (x) { return x >= m.bx + m.bl - 1; }); P.recolor('Y', 'K', function (x) { return x === m.bx; }); } });
    P.set(m.ex - 1, m.ey, 'E'); P.set(m.ex, m.ey - 1, 'E'); P.set(m.ex + 1, m.ey, 'E');
  });
  def('spidermonkey', { A: '#453e4e', F: '#e0b892' }, { A: '#f1ece0', F: '#e8b9a0' }, function (P, o) {
    var m = sitter(P, o, { bw: 5, bh: 8, head: [8, 7], ho: 2, foot: [3, 2, 'F'], bob: 1,
      back: function (P, m) { var u = m.sg; P.path([[m.bx + 1, -2], [m.bx - 3, -3], [m.bx - 5, -7], [m.bx - 5, -13 + u], [m.bx - 3, -16 + u], [m.bx - 1, -15 + u], [m.bx - 2, -13 + u]], 'A', 2, 2); },
      face: function (P, m) { P.recolor('A', 'F', function (x, y) { return Math.abs(x - m.hx - 0.5) <= 2 && y >= m.hy - 1 && y <= m.hy + 2; }); } });
    var u = m.sg, k = o.juv ? 0.7 : 1, rx = m.bx + m.bw - 1;
    P.part(function () { // one long arm down to the ground, the other reaching up
      P.path([[m.bx, m.top + 2], [m.bx - 3 * k, m.top + 5], [m.bx - 4 * k, -2 - (u > 0 ? 1 : 0)]], 'A', 1, 2); P.rect(Math.round(m.bx - 4 * k) - 1, -2 - (u > 0 ? 1 : 0), 2, 2, 'F', 1);
      P.path([[rx, m.top + 2], [rx + 3 * k, m.top], [rx + 4 * k, m.top - 5 * k + (u < 0 ? 1 : 0)]], 'A', 1, 2); P.rect(Math.round(rx + 4 * k), Math.round(m.top - 5 * k + (u < 0 ? 1 : 0)) - 1, 2, 2, 'F', 1);
    });
  });
  def('sloth', { A: '#9c9070', F: '#f4e8c8', C: '#4e3d30', T: '#f0e8d4' }, { A: '#e8c860', F: '#fff4cc', C: '#9a7424' }, function (P, o) {
    var m = sitter(P, o, { bw: 10, bh: 9, head: [10, 7], ho: 2, hx: 0, arm: [10, 3, 'A', -1], foot: [3, 2, 'A'], eye: [-2, 2, 0, 1], br: 3,
      body: function (P, m) { P.recolor('A', 'A', function (x, y) { return ((x + 40) % 3 === 0) && y > m.top + 2 && (y & 1) === 0; }, 2); },
      face: function (P, m) { P.recolor('A', 'F', function (x, y) { return Math.abs(x - m.hx) <= 3 && y >= m.hy - 1 && y <= m.hy + 2; }); } });
    // dark eye stripes sloping down and out, small nose, sleepy smile
    P.set(m.e0 - 1, m.ey, 'C'); P.set(m.e0 - 2, m.ey + 1, 'C'); P.set(m.e0 - 1, m.ey + 1, 'C'); P.set(m.e1 + 1, m.ey, 'C'); P.set(m.e1 + 2, m.ey + 1, 'C'); P.set(m.e1 + 1, m.ey + 1, 'C');
    P.set(m.hx, m.hy + 1, 'N'); P.set(m.hx - 1, m.hy + 2, 'C'); P.set(m.hx, m.hy + 2, 'C'); P.set(m.hx + 1, m.hy + 2, 'C');
    // three long pale claws on each hand
    var ax0 = m.bx - 2, ax1 = m.bx + m.bw - 1, yy;
    for (yy = -2; yy <= -1; yy++) { P.set(ax0, yy, 'T'); P.set(ax0 + 2, yy, 'T'); P.set(ax1, yy, 'T'); P.set(ax1 + 2, yy, 'T'); }
  });
  def('tapir', { A: '#5e4b44', S: '#5e4b44', C: '#3c2e2a' }, { S: '#f3f0e8' }, function (P, o) {
    var m = quad(P, o, { len: 15, bh: 9, leg: 5, lw: 3, head: [8, 7], hd: [3, 1], snout: [4, 4, 1], ear: ['round', 1, 'A'], tail: ['stub', 2], nose: 0, br: 3,
      body: function (P, m) { P.recolor('A', 'S', function (x) { return x < m.x1 - 5; }); } });
    P.part(function () { P.rect(m.sx, m.sy1, 2, 3, 'A', 1); P.set(m.sx + 1, m.sy1 + 2, 'N'); });
    P.set(m.earX - 1, m.earTop - 1, 'W');
    if (o.juv) P.recolor('AS', 'W', function (x, y) { return y > m.yt && y < m.yb && x < m.x1 - 1 && (y & 1) === 0 && ((x + 40) % 3) !== 0; });
  });
  def('jaguar', { A: '#e2a234', B: '#f8e8c4', C: '#3b2719' }, { A: '#3a3642', B: '#55505e', C: '#1c1a22' }, function (P, o) {
    var m = quad(P, o, { len: 14, bh: 8, leg: 4, lw: 3, head: [9, 8], hd: [2, -1], snout: [3, 4, 2], snoutK: 'B', ear: ['round', 2, 'A', 'C'], tail: ['cat', 7, 'A', 2] });
    rosettes(P, 'A', 'C', -40, -40, m.hx - 1, -2);
    P.set(m.hx - 2, m.hy - 2, 'C'); P.set(m.hx - 3, m.hy, 'C'); P.set(m.hx - 1, m.hy + 2, 'C');
  });
  def('orangutan', { A: '#c9581f', F: '#6d4b3b', B: '#e9a070' }, { A: '#f0c878', F: '#8a6248', B: '#f8e0b8' }, function (P, o) {
    var m = sitter(P, o, { bw: 10, bh: 9, head: [8, 8], ho: 3, arm: [8, 3, 'A', 1], foot: [3, 2, 'F'], bob: 1, eye: [-1, 2, -1, 1],
      pre: function (P, m) { if (!m.j) P.ell(m.hx + 0.5, m.hy + 1, 5.5, 3.5, 'F'); },
      face: function (P, m) { P.recolor('A', 'F', function (x, y) { return Math.abs(x - m.hx - 0.5) <= 2.5 && y >= m.hy - 2; }); },
      body: function (P, m) { for (var x = m.bx; x < m.bx + m.bw; x += 2) P.sh(x, -1 - (x & 2 ? 1 : 0) * 2, 2); } });
    P.rect(m.hx - 1, m.hy + 1, 4, 2, 'B', 1); P.set(m.hx, m.hy + 2, 'F', 3); P.set(m.hx + 1, m.hy + 2, 'F', 3);
    P.set(m.hx, m.hy - 4, 'A', 0); P.set(m.hx + 2, m.hy - 4, 'A', 1);
  });
  def('gorilla', { A: '#37343f', F: '#625d6c', B: '#4c4856' }, { A: '#b9bfcc', F: '#4a4654', B: '#dde2ea' }, function (P, o) {
    var m = sitter(P, o, { bw: 13, bh: 11, head: [9, 9], ho: 3, hx: 1, arm: [10, 4, 'A', 0], foot: [4, 2, 'A'], belly: [7, 6, 'B'], bob: 1, eye: [-1, 2, 0, 1],
      pre: function (P, m) { P.ell(m.hx, m.hy - 3, 3, 2.5, 'A'); },
      face: function (P, m) { P.recolor('A', 'F', function (x, y) { return Math.abs(x - m.hx - 0.5) <= 3 && y >= m.hy && y <= m.hy + 3; }); P.recolor('A', 'A', function (x, y) { return y === m.hy - 1 && Math.abs(x - m.hx - 0.5) <= 3; }, 3); } });
    P.set(m.hx, m.hy + 2, 'K'); P.set(m.hx + 2, m.hy + 2, 'K');
  });
  def('okapi', { A: '#6e3529', S: '#f1ebe0', C: '#3e1d18' }, { A: '#cfc6dc', S: '#ffffff', C: '#8f84a8' }, function (P, o) {
    var m = quad(P, o, { len: 13, bh: 8, leg: 7, lw: 2, head: [6, 6], hd: [3, -4], nw: 4, snout: [4, 3, 1], snoutK: 'C', ear: ['point', 2], tail: ['tuft', 4, 'C'], legK: 'S', foot: 'C', nose: 0,
      body: function (P, m) { P.recolor('A', 'S', function (x, y) { return x < m.x0 + 5 && y > m.yt + 2 && (y & 1) === 0; }); },
      face: function (P, m) { P.recolor('A', 'S', function (x, y) { return x >= m.hx - 1 && y >= m.hy - 1; }); } });
    P.recolor('S', 'A', function (x, y) { return y > m.yb && y < -1 && (y & 1) === 0; });
    if (!o.juv) { P.set(m.hx, m.hy - 4, 'C'); P.set(m.hx + 2, m.hy - 4, 'C'); }
  });

  // ---------- outback ----------
  def('emu', { A: '#6f5b4a', C: '#4d3d32', B: '#7d9dbc', L: '#a39684', Y: '#3c3640' }, { A: '#f1ede4', C: '#d4cdc0', B: '#c9d8e6' }, function (P, o) {
    tallbird(P, o, { bw: 13, bh: 10, leg: 7, neck: 7, neckK: 'B', legK: 'L', beakK: 'Y', headK: 'C',
      back: function (P, m) { P.ell(-m.bw / 2 + 1, m.cy + 2, 2.5, 3, 'A'); },
      body: function (P, m) { P.recolor('A', 'C', function (x, y) { return h2(x, y, 5) < 0.3 && y > m.cy - 2; }); for (var x = -4; x < 4; x += 2) P.set(x, m.cy + m.bh / 2, 'A', 2); } });
  }, { jpal: { A: '#d8c8a0', C: '#5a4a38' } });
  def('kangaroo', { A: '#c9764c', B: '#f2dcbc', C: '#7a4630', P: '#e8a898' }, { A: '#f4f0e8', B: '#ffffff', C: '#c9c0b0' }, function (P, o) {
    biped(P, o, { len: 9, bh: 11, leg: 5, lw: 3, head: [6, 6], hs: 'ell', hd: [1, -3], nw: 4, tail: [10, 6, 'A'], belly: true, arm: [3, 2, 0, -1, 2], footL: 6, hop: 2, legX: -1,
      face: function (P, m) { P.rr(m.hx + 1, m.hy, 4, 3, 'A', null, 1); P.set(m.hx + 4, m.hy, 'N'); },
      pre: function (P, m) { P.rr(m.hx, m.hy - 7, 2, 5, 'A', 2, 0); },
      post: function (P, m) { P.part(function () { P.rr(m.hx - 2, m.hy - 7, 2, 5, 'A', null, 0); P.rect(m.hx - 1, m.hy - 5, 1, 2, 'P', 1); }); if (!m.j && o.fr === 0) { P.set(2, m.cy + 2, 'C', 1); P.set(3, m.cy + 2, 'C', 1); } } });
  });
  def('wombat', { A: '#86808e', C: '#55505e', B: '#a39eac' }, { A: '#e8c66c', C: '#b08a3a', B: '#f4dc98' }, function (P, o) {
    var m = quad(P, o, { len: 13, bh: 10, leg: 2, lw: 3, head: [9, 9], hd: [0, 2], snout: [2, 5, 2], ear: ['round', 1, 'C'], bs: 'ell', nose: 0, stride: 1, legK: 'C', legIn: 2, eye: [1, -2, 1] });
    P.rect(m.sx - 1, m.sy0 + 1, 2, 2, 'N', 1); P.recolor('A', 'B', function (x, y) { return y <= m.yt + 1 && x < m.hx - 3; });
  });
  def('camel', { A: '#d8ac6c', C: '#a87a44' }, { A: '#f4efe2', C: '#d6cdb8' }, function (P, o) {
    var m = quad(P, o, { len: 14, bh: 7, leg: 8, lw: 2, head: [6, 5], hd: [4, -6], snout: [4, 4, 1], ear: ['round', 1], tail: ['thin', 4, 'C'], foot: 'C', nose: 0,
      back: function (P, m) { P.ell(-1, m.yt, m.j ? 2.5 : 4, m.j ? 2 : 3.5, 'A'); if (!m.j) { P.set(-2, m.yt - 4, 'C'); P.set(0, m.yt - 4, 'C'); } },
      pre: function (P, m) { P.part(function () { P.path([[m.x1 - 1, m.yt + 3], [m.x1 + 2, m.yt + 3], [m.hx - 1, m.hy + 2]], 'A', 1, 3); }, true); } });
    P.set(m.sx, m.sy1, 'C', 2); P.set(m.sx - 1, m.sy1, 'C', 2);
  });
  def('dingo', { A: '#dc9c50', B: '#f8ecd2', C: '#8a5a2c' }, { A: '#34303a', B: '#c9a070', C: '#1c1a22' }, function (P, o) {
    var m = quad(P, o, { len: 13, bh: 6, leg: 6, lw: 2, head: [7, 6], hd: [2, -2], nw: 4, snout: [4, 3, 1], snoutK: 'B', ear: ['point', 3, 'A', 'C'], tail: ['bush', 7, 'A', 4, 'B'], tailY: 2, foot: 'B', footH: 2 });
    P.recolor('A', 'B', function (x, y) { return y >= m.yb - 1 && y <= m.yb && x > m.x1 - 5; });
  });
  def('fennec', { A: '#f1dcae', B: '#fff8e4', C: '#3a2c2a', P: '#f0a8a0' }, { A: '#fbfaf6', B: '#ffffff', P: '#f6c4c0' }, function (P, o) {
    var m = quad(P, o, { len: 9, bh: 5, leg: 3, lw: 2, head: [7, 6], hd: [1, -1], snout: [3, 3, 1], snoutK: 'B', tail: ['bush', 6, 'A', 4, 'C'], tailY: 2, stride: 1,
      pre: function (P, m) { P.poly([[m.hx, m.hy - 2], [m.hx + 2, m.hy - 9], [m.hx + 4, m.hy - 2]], 'A', 2); } });
    P.part(function () { P.poly([[m.hx - 4, m.hy - 2], [m.hx - 3, m.hy - 9], [m.hx, m.hy - 2]], 'A', 1); P.poly([[m.hx - 3, m.hy - 3], [m.hx - 2, m.hy - 7], [m.hx - 1, m.hy - 3]], 'P', 1); });
  });
  def('koala', { A: '#9b9ba8', B: '#f1f1f4', E: '#d4d4de' }, { A: '#f4f3f0', B: '#ffffff', E: '#f6d0d0' }, function (P, o) {
    var m = sitter(P, o, { bw: 9, bh: 8, head: [9, 8], ho: 3, hx: 0, arm: [5, 3, 'A', 2], foot: [3, 2, 'A'], belly: [5, 5, 'B'], eye: [-2, 3, 0, 1],
      pre: function (P, m) { P.ell(m.hx - 4.5, m.hy - 2, 2.6, 2.6, 'A'); P.ell(m.hx + 4.5, m.hy - 2, 2.6, 2.6, 'A'); P.ell(m.hx - 4.5, m.hy - 2, 1.2, 1.2, 'E', 1); P.ell(m.hx + 4.5, m.hy - 2, 1.2, 1.2, 'E', 1); } });
    P.rect(m.hx, m.hy, 2, 3, 'N', 1);
  });
  def('devil', { A: '#2f2b34', P: '#e8909a', R: '#d8404a' }, { A: '#8a4a34', P: '#f0b0a8' }, function (P, o) {
    var m = quad(P, o, { len: 12, bh: 7, leg: 3, lw: 3, head: [9, 8], hs: 'box', hr: 2, hd: [2, 0], snout: [3, 5, 1], ear: ['round', 2, 'P'], tail: ['thin', 5, 'A', 2], stride: 1, noseK: 'P', eye: [1, -2, 0],
      body: function (P, m) { P.recolor('A', 'W', function (x, y) { return (x >= m.x1 - 4 && x <= m.x1 - 3 && y > m.yt + 1) || (x >= m.x0 + 1 && x <= m.x0 + 3 && y === m.yt + 2); }); } });
    P.rect(m.sx - 2, m.sy1 - 1, 3, 2, 'R', 1); P.set(m.sx - 2, m.sy1 - 1, 'W'); P.set(m.sx, m.sy1 - 1, 'W'); P.set(m.hx + 1, m.hy - 2, 'W'); P.set(m.hx + 1, m.hy - 1, 'W', 2);
  });
  def('komodo', { A: '#7e7b5e', B: '#b5b08a', C: '#55533f', Y: '#f0a0b0' }, { A: '#3fae88', B: '#a8e0c0', C: '#1f7a5c' }, function (P, o) {
    var m = quad(P, o, { len: 15, bh: 5, leg: 2, lw: 3, head: [7, 5], hs: 'box', hr: 1, hd: [3, 0], snout: [4, 3, 0], eye: [1, -1, 1], nose: 0, stride: 1, footW: 1, foot: 'C', legIn: 2, br: 2,
      back: function (P, m) { var u = m.sg; P.poly([[m.x0 + 2, m.yt], [m.x0 - 4, m.yb - 1 + u], [m.x0 - 8, -1 - (u > 0 ? 1 : 0)], [m.x0 - 4, m.yb + 1 + u], [m.x0 + 2, m.yb]], 'A', 'a'); } });
    spots(P, 'A', 'C', -40, -30, 30, 0, 0.18, 21);
    P.recolor('A', 'B', function (x, y) { return y === m.yb && x > m.x0; });
    P.path([[m.sx + 1, m.sy0 + 1], [m.sx + 2, m.sy0 + 1]], 'Y', 1); P.set(m.sx + 3, m.sy0, 'Y'); P.set(m.sx + 3, m.sy0 + 2, 'Y');
  });
  def('platypus', { A: '#7b5338', C: '#5a3a26', L: '#4e5662', F: '#c98a3c' }, { A: '#f0e6e0', C: '#d8c8c0', L: '#8a90a0', F: '#e8b890' }, function (P, o) {
    var m = quad(P, o, { len: 13, bh: 6, leg: 1, lw: 3, head: [7, 6], hd: [2, 1], eye: [1, -1, 1], stride: 1, legK: 'F', bs: 'ell', noFar: 1, legIn: 2,
      back: function (P, m) { P.ell(m.x0 - 2, m.yb - 1, 3.6, 1.7, 'C'); } });
    P.part(function () { P.rr(m.hx + 2, m.hy, o.juv ? 4 : 6, 3, 'L', null, 1); });
    P.set(m.hx + 4, m.hy, 'K');
  });

  function antler(P, x, y, s, k) { k = k || 'T'; P.path([[x, y], [x - 1, y - 4], [x - 3, y - 8], [x - 3, y - 10]], k, s, 1); P.path([[x - 1, y - 3], [x + 2, y - 6], [x + 2, y - 7]], k, s, 1); P.path([[x - 2, y - 6], [x, y - 9], [x, y - 10]], k, s, 1); P.set(x - 4, y - 9, k, s); }
  function hareBody(P, o, horns) {
    var m = quad(P, o, { len: 9, bh: 7, leg: 2, lw: 3, head: [7, 6], hd: [1, -2], snout: [2, 3, 1], ear: ['long', 6, 'A', 'C'], tail: ['stub', 3, 'W'], bs: 'ell', stride: 1, noFar: 1, legIn: 0, tailY: 4,
      body: function (P, m) { P.ell(m.x0 + 3, m.yb - 2, 3.4, 3.4, 'A'); },
      });
    if (horns) P.part(function () { if (o.juv) { P.set(m.hx + 2, m.hy - 3, 'H'); } else antler(P, m.hx + 1, m.hy - 2, 1, 'H'); });
    return m;
  }

  // ---------- polar ----------
  def('hare', { A: '#f5f3ef', C: '#2d2733' }, { A: '#a4b8d4', C: '#3a4660' }, function (P, o) { hareBody(P, o, false); });
  def('reindeer', { A: '#8b6b54', B: '#ece4d6', T: '#9a744c', C: '#4e3a2e' }, { A: '#f6f3ec', B: '#ffffff', T: '#c8a878', C: '#b8ae9c' }, function (P, o) {
    var j = o.juv, m = quad(P, o, { len: 14, bh: 8, leg: 7, lw: 2, head: [7, 6], hd: [3, -3], nw: 5, neckK: 'B', snout: [4, 4, 1], ear: ['point', 1], tail: ['stub', 2, 'B'], foot: 'C',
      pre: function (P, m) { if (!j) P.path([[m.hx + 3, m.hy - 2], [m.hx + 3, m.hy - 6], [m.hx + 5, m.hy - 10]], 'T', 2, 1); } });
    P.part(function () { if (j) P.rect(m.hx, m.hy - 4, 1, 2, 'T', 1); else antler(P, m.hx, m.hy - 2, 1); });
    P.recolor('A', 'B', function (x, y) { return y === m.yb && x > m.x0 + 1 && x < m.x1 - 1; });
  });
  def('owl', { A: '#f6f4f0', C: '#8b8896', Y: '#f4c020' }, { A: '#cfd4dc', C: '#6a7080' }, function (P, o) {
    var m = sitter(P, o, { bw: 9, bh: 9, head: [10, 8], ho: 3, hx: 0, foot: [3, 1, 'Y'], eye: [-2, 2, 0, 0], br: 3,
      body: function (P, m) { P.recolor('A', 'C', function (x, y) { return (((x + y * 2) % 4) + 4) % 4 === 0 && (y & 1) === 0; }); P.recolor('A', 'C', function (x) { return x <= m.bx || x >= m.bx + m.bw - 1; }); } });
    P.rect(m.hx - 3, m.hy - 1, 2, 2, 'Y', 1); P.set(m.hx - 2, m.hy, 'K'); P.rect(m.hx + 2, m.hy - 1, 2, 2, 'Y', 1); P.set(m.hx + 2, m.hy, 'K'); P.set(m.hx, m.hy + 1, 'N'); P.set(m.hx, m.hy + 2, 'N');
    P.set(m.hx - 2, m.hy - 3, 'C'); P.set(m.hx + 1, m.hy - 3, 'C');
  });
  def('arcticfox', { A: '#f6f4ee', C: '#c2cbdb', B: '#dfe5ee' }, { A: '#8390a8', C: '#5a6680', B: '#6e7a94' }, function (P, o) {
    var m = quad(P, o, { len: 11, bh: 6, leg: 3, lw: 2, head: [8, 7], hd: [1, -1], snout: [3, 3, 2], ear: ['point', 2, 'A', 'C'], tail: ['bush', 8, 'A', 5, 'B'], tailY: 2, stride: 1, br: 2, legK: 'B' });
    P.recolor('A', 'C', function (x, y) { return y === m.yb && x >= m.x0 && x <= m.x1; });
  });
  def('seal', { A: '#dfe3ea', C: '#3b404e' }, { A: '#f2dc96', C: '#8a6a2c' }, function (P, o) {
    var m = blob(P, o, { len: 17, h: 7, head: [7, 7], headK: o.juv ? 'A' : 'C',
      body: function (P, m) { if (!m.j) P.recolor('A', 'C', function (x, y) { return y < -m.h + 3 && x > m.x0 + 4 && x < m.x0 + 11; }); } });
    if (!o.juv) P.set(m.ex, m.ey, 'W');
    P.set(m.hx + 3, m.hy + 1, 'N');
  }, { jpal: { A: '#ffffff', C: '#3b404e' } });
  def('walrus', { A: '#a9694c', B: '#dcae90', T: '#fff6dc', C: '#6e4030' }, { A: '#e89aa0', B: '#f8cccc', C: '#b06068' }, function (P, o) {
    var m = blob(P, o, { len: 19, h: 9, head: [9, 9], lift: 1, eye: [0, -2, 1],
      face: function (P, m) { P.recolor('A', 'B', function (x, y) { return x >= m.hx && y >= m.hy && y <= m.hy + 2; }); } });
    if (!o.juv) { P.rect(m.hx + 1, m.hy + 3, 1, 5, 'T', 0); P.rect(m.hx + 3, m.hy + 3, 1, 5, 'T', 1); }
    P.set(m.hx + 2, m.hy, 'N'); P.set(m.hx + 1, m.hy + 1, 'C'); P.set(m.hx + 3, m.hy + 1, 'C');
  });
  def('penguin', { A: '#2b2e3c', B: '#fbfaf6', Y: '#f6b21c', L: '#3a3440' }, { A: '#b8842a', Y: '#fff2a0' }, function (P, o) {
    var j = o.juv, m = sitter(P, o, { bw: 9, bh: 12, head: [8, 7], ho: 2, hx: 1, arm: [7, 2, 'A', 2], foot: [4, 1, 'Y'], belly: [7, 11, 'B', 0, 0], eye: [0, 2, -1, 0],
      face: function (P, m) { if (j) P.recolor('A', 'B', function (x, y) { return x >= m.hx - 1 && y >= m.hy - 1; }); } });
    P.part(function () { P.rect(m.hx + 3, m.hy + 1, 3, 1, 'L', 1); P.rect(m.hx + 3, m.hy + 2, 2, 1, 'Y', 1); });
    P.set(m.hx + 1, m.hy - 1, j ? 'K' : 'W');
    if (!j) { P.rect(m.bx + m.bw - 3, m.top, 2, 2, 'Y', 1); P.rect(m.hx - 1, m.hy + 2, 2, 2, 'Y', 1); }
  }, { jpal: { A: '#aab0bd' } });
  def('polarbear', { A: '#f5eedb', C: '#d6c8a6', B: '#e6dcc2' }, { A: '#f0d494', C: '#c8a45c', B: '#dcbc78' }, function (P, o) {
    var m = quad(P, o, { len: 15, bh: 9, leg: 4, lw: 4, head: [8, 7], hd: [4, 2], nw: 6, snout: [4, 4, 1], ear: ['round', 1, 'C'], tail: ['stub', 2], nose: 2, stride: 1, br: 3, legK: 'B',
      back: function (P, m) { P.ell(m.x0 + 4, m.yt + 1, 4.5, 3, 'A'); P.ell(m.x1 - 4, m.yt, 4, 2.6, 'A'); },
      body: function (P, m) { P.recolor('A', 'C', function (x, y) { return y >= m.yb - 1; }); P.recolor('A', 'B', function (x, y) { return y === m.yb - 2; }); } });
    P.recolor('B', 'C', function (x, y) { return y === -1; });
    P.set(m.sx - 1, m.sy1, 'C', 2); P.set(m.sx - 2, m.sy1, 'C', 2);
  });
  def('narwhal', { A: '#b3bccb', B: '#f1f3f6', C: '#6f798c', T: '#f6eed6' }, { A: '#c9b8dc', C: '#8a70a8' }, function (P, o) {
    var m = fish(P, o, { len: 17, h: 8, lift: 3, tail: [5, 8, 'A', 2], pect: [4, 3, 3, 'C'], belly: true, eye: [4, 0, 1],
      body: function (P, m) { spots(P, 'A', 'C', -20, -30, 6, m.cy, 0.3, 4); } });
    if (!o.juv) { var tx = Math.round(m.x1), ty = Math.round(m.cy); P.line(tx, ty - 1, tx + 10, ty - 6, 'T', 1); for (var i = 1; i < 10; i += 2) P.sh(tx + i, ty - 1 - Math.round(i / 2), 2); if (o.variant) P.line(tx, ty + 1, tx + 10, ty - 3, 'T', 0); }
  }, { water: true, shadow: function (o) { return [o.juv ? 9 : 13, o.juv ? 3 : 4, [58, 120, 178], 0.8, 0, 0]; } });

  // ---------- highland ----------
  def('goat', { A: '#f5f2ea', C: '#2e2a34' }, { A: '#3a3640', C: '#c9c0b0' }, function (P, o) {
    var j = o.juv, m = quad(P, o, { len: 12, bh: 8, leg: 5, lw: 3, head: [7, 7], hd: [2, -2], snout: [3, 4, 1], ear: ['point', 1], tail: ['stub', 2], foot: 'C',
      pre: function (P, m) { if (!j) P.path([[m.hx + 2, m.hy - 3], [m.hx + 1, m.hy - 6], [m.hx - 1, m.hy - 7]], 'C', 2, 1); },
      body: function (P, m) { for (var x = m.x0 + 1; x < m.x1; x += 2) P.set(x, m.yb + 1, 'A', 2); } });
    if (!j) P.part(function () { P.path([[m.hx, m.hy - 3], [m.hx - 1, m.hy - 6], [m.hx - 3, m.hy - 7]], 'C', 1, 1); });
    P.rect(m.sx - 1, m.sy1 + 1, 1, 2, 'A', 2); P.set(m.sx - 2, m.sy1 + 1, 'A', 2);
  });
  def('marmot', { A: '#b98a4c', B: '#ecd6a6', C: '#6b4b2c' }, { A: '#f4f2ec', B: '#ffffff', C: '#c9c0b0' }, function (P, o) {
    var m = sitter(P, o, { bw: 9, bh: 8, head: [8, 7], ho: 2, hx: 1, arm: [3, 2, 'A', 3], foot: [3, 1, 'C'], belly: [5, 5, 'B'], eye: [-1, 3, -1, 1], br: 3,
      back: function (P, m) { P.ell(m.bx - 1, -2, 2.6, 1.6, 'C'); },
      face: function (P, m) { P.recolor('A', 'C', function (x, y) { return y <= m.hy - 2; }); P.recolor('A', 'B', function (x, y) { return y >= m.hy + 1 && x >= m.hx - 1 && x <= m.hx + 3; }); } });
    P.set(m.hx + 1, m.hy + 1, 'N'); P.set(m.hx + 1, m.hy + 2, 'W'); P.set(m.hx - 3, m.hy - 2, 'C'); P.set(m.hx + 4, m.hy - 2, 'C');
  });
  def('yak', { A: '#4b3b36', B: '#d9cdbc', T: '#ece0c4', C: '#2e2422' }, { A: '#e0b040', B: '#f8ecc8', C: '#a87a1c' }, function (P, o) {
    var j = o.juv, m = quad(P, o, { len: 16, bh: 10, leg: 4, lw: 3, head: [8, 8], hs: 'box', hr: 2, hd: [2, 3], snout: [3, 5, 1], snoutK: 'B', tail: ['horse', 7, 'C'], stride: 1, legK: 'C',
      back: function (P, m) { P.ell(m.x1 - 5, m.yt, 4, 2.5, 'A'); },
      pre: function (P, m) { if (!j) P.path([[m.hx + 2, m.hy - 4], [m.hx + 4, m.hy - 6], [m.hx + 4, m.hy - 8]], 'T', 2, 1); } });
    P.part(function () { for (var x = m.x0 + 1; x <= m.x1 - 1; x++) P.rect(x, m.yb, 1, (j ? 2 : 3) + (h2(x, 1, 3) < 0.5 ? 1 : 0), 'A', 2); }, true);
    P.part(function () { if (j) P.set(m.hx - 1, m.hy - 5, 'T'); else P.path([[m.hx - 1, m.hy - 4], [m.hx - 3, m.hy - 6], [m.hx - 3, m.hy - 8], [m.hx - 2, m.hy - 9]], 'T', 1, 1); });
    for (var x = m.hx - 3; x <= m.hx + 1; x += 2) P.set(x, m.hy - 4, 'C');
  });
  def('takin', { A: '#dca83e', C: '#5b3e2b', T: '#2e2424', B: '#f0cc74' }, { A: '#f8e07e', C: '#a87a3a', B: '#fff0b0' }, function (P, o) {
    var j = o.juv, m = quad(P, o, { len: 14, bh: 9, leg: 5, lw: 3, head: [8, 8], hd: [2, 0], snout: [4, 7, 1], snoutK: 'C', ear: ['point', 1], tail: ['stub', 2], legK: 'C', nose: 0, stride: 1, eye: [0, -2],
      back: function (P, m) { P.ell(m.x1 - 4, m.yt, 4.5, 3, 'A'); },
      body: function (P, m) { P.recolor('A', 'B', function (x, y) { return y <= m.yt + 1; }); for (var x = m.x0 + 1; x < m.x1; x += 2) P.set(x, m.yb + 1, 'A', 2); },
      face: function (P, m) { P.recolor('A', 'C', function (x, y) { return x >= m.hx + 1 && y >= m.hy; }); } });
    // thick dark horns: out from the brow, back, then hooked up
    if (!j) P.part(function () { P.path([[m.hx + 1, m.hy - 4], [m.hx - 2, m.hy - 5], [m.hx - 4, m.hy - 4], [m.hx - 5, m.hy - 7]], 'T', 1, 2); }); else P.set(m.hx, m.hy - 4, 'T');
    P.recolor('A', 'C', function (x, y) { return y >= m.yb - 1 && y <= m.yb && x > m.x0 + 2 && x < m.x1 - 2; });
    P.set(m.sx, m.sy0 + 2, 'K'); P.rect(m.sx - 2, m.sy1 + 1, 2, 2, 'C', 2);
  });
  def('redpanda', { A: '#c9562b', C: '#3b2723', D: '#f0a868' }, { A: '#f0d8a8', C: '#8a6a4a', D: '#fff4dc' }, function (P, o) {
    var m = quad(P, o, { len: 12, bh: 6, leg: 3, lw: 3, legK: 'C', head: [9, 7], hd: [1, -1], snout: [2, 3, 2], snoutK: 'W', ear: ['point', 2, 'W', 'A'], tail: ['bush', 9, 'A', 5], tailY: 2, stride: 1,
      face: function (P, m) { P.recolor('A', 'W', function (x, y) { return (x >= m.hx + 1 && y >= m.hy + 1) || (y === m.hy - 2 && x >= m.hx && x <= m.hx + 1); }); } });
    P.recolor('A', 'D', function (x, y) { return x < m.x0 - 1 && (((x % 3) + 3) % 3) === 0; });
    P.recolor('A', 'C', function (x, y) { return y === m.yb && x >= m.x0; });
  });
  def('eagle', { A: '#6c4b2f', G: '#d3a044', C: '#4b3323', Y: '#f4c020', L: '#f4c020' }, { A: '#f4f1ea', G: '#ffffff', C: '#d0c8b8' }, function (P, o) {
    var m = bird(P, o, { bw: 9, bh: 11, leg: 2, head: [7, 6], hd: [0, -3], headK: 'G', beak: [2, 3, 'Y', 1, 1], wing: [6, 9, -1, 0, 'C'], tail: [4, 4, 6, 'C'] });
    P.set(m.ex, m.ey - 1, 'C'); P.set(m.ex + 1, m.ey - 1, 'C'); P.set(m.ex - 1, m.ey - 1, 'C');
  });
  def('snubmonkey', { A: '#ec9a3e', C: '#5b4b55', F: '#a6cbea' }, { A: '#eceef2', C: '#9aa0ae', F: '#c8dcf0' }, function (P, o) {
    var m = sitter(P, o, { bw: 9, bh: 9, head: [8, 8], ho: 3, arm: [7, 3, 'C', 1], foot: [3, 2, 'C'], bob: 1, eye: [-1, 2, 0, 1],
      back: function (P, m) { P.path([[m.bx, -2], [m.bx - 4, -2], [m.bx - 6, -5], [m.bx - 6, -10 + m.sg]], 'A', 2, 2); },
      face: function (P, m) { P.recolor('A', 'F', function (x, y) { return Math.abs(x - m.hx - 0.5) <= 2 && y >= m.hy - 1 && y <= m.hy + 2; }); },
      body: function (P, m) { P.recolor('A', 'C', function (x, y) { return y <= m.top + 1; }); } });
    P.set(m.hx, m.hy + 2, 'K'); P.set(m.hx + 1, m.hy + 2, 'K');
  });
  def('panda', { A: '#f7f5ef', C: '#2b2731', G: '#5aa83c' }, { C: '#8b5a36' }, function (P, o) {
    var m = sitter(P, o, { bw: 12, bh: 10, head: [11, 9], ho: 3, hx: 0, arm: [6, 4, 'C', 1], foot: [4, 3, 'C'], eye: [-2, 2, 0, 0], br: 3,
      pre: function (P, m) { P.ell(m.hx - 4.5, m.hy - 4, 2, 2, 'C', 1); P.ell(m.hx + 4.5, m.hy - 4, 2, 2, 'C', 1); },
      body: function (P, m) { P.recolor('A', 'C', function (x, y) { return y <= m.top + 2; }); } });
    P.rect(m.hx - 3, m.hy - 1, 2, 3, 'C', 1); P.rect(m.hx + 2, m.hy - 1, 2, 3, 'C', 1); P.set(m.hx - 2, m.hy, 'W'); P.set(m.hx + 2, m.hy, 'W'); P.set(m.hx, m.hy + 1, 'N'); P.set(m.hx, m.hy + 2, 'N', 1);
    if (!o.juv) P.part(function () { P.line(m.bx + m.bw + 1, m.top - 3, m.bx + m.bw - 3, -3, 'G', 1); P.set(m.bx + m.bw + 2, m.top - 3, 'G', 0); P.set(m.bx + m.bw + 2, m.top, 'G', 0); P.set(m.bx + m.bw - 1, m.top - 2, 'G', 0); });
  });
  def('snowleopard', { A: '#f2efe6', B: '#ffffff', C: '#3e3c4a' }, { A: '#6e7688', B: '#9aa2b4', C: '#24242e' }, function (P, o) {
    var m = quad(P, o, { len: 14, bh: 7, leg: 4, lw: 3, head: [8, 7], hd: [2, -1], snout: [3, 4, 2], snoutK: 'B', ear: ['round', 1], tail: ['cat', 9, 'A', 3], tailY: 1, br: 2 });
    rosettes(P, 'A', 'C', m.x0, -40, m.hx - 3, -3);
    P.recolor('A', 'C', function (x, y) { return x < m.x0 - 1 && (((x + y) % 3) + 3) % 3 === 0; });
  });

  // ---------- reef (drawn hovering over the anchor so they sit in the water tile) ----------
  def('clownfish', { A: '#f27c1e', C: '#2a2028' }, { A: '#34325a', C: '#f6a030' }, function (P, o) {
    fish(P, o, { len: 12, h: 8, lift: 4, tail: [4, 6, 'A', 1], dorsal: [7, 2, -1, 'A', 3], pect: [3, 2, 2, 'A'], eye: [2, -1],
      body: function (P, m) { P.recolor('A', 'W', function (x) { return x === 1 || x === 2 || x === -3 || x === -4; }); P.recolor('A', 'C', function (x) { return x === 0 || x === 3 || x === -2 || x === -5; }); },
      tailFx: function (P, m, tx) { P.recolor('A', 'C', function (x) { return x <= tx; }); P.recolor('A', 'W', function (x) { return x === tx + 2; }); } });
  }, { water: true });
  def('seahorse', { A: '#f2ba3e', C: '#c9862a', B: '#f8dc8a' }, { A: '#f8e050', C: '#e0a020', B: '#fff8c0' }, function (P, o) {
    var u = sgn(o.fr), j = o.juv, k = j ? 0.7 : 1, y0 = -3;
    function Y(v) { return Math.round(y0 + v * k); } function X(v) { return Math.round(v * k); }
    P.part(function () { P.poly([[X(-2), Y(-10)], [X(-6), Y(-8) + u], [X(-2), Y(-5)]], 'C', 1); }, true);
    P.part(function () { P.path([[X(0), Y(-5)], [X(-1), Y(-2)], [X(1), Y(0)], [X(3), Y(-1)], [X(2), Y(-3)]], 'A', 1, 2); }, true);
    P.part(function () { P.ell(X(0), Y(-8), 2.7 * k, 3.6 * k, 'A'); P.recolor('A', 'B', function (x, y) { return x >= X(1) && y > Y(-11); }); }, true);
    P.part(function () { P.path([[X(-1), Y(-11)], [X(0), Y(-14)]], 'A', 1, 3); }, true);
    P.part(function () { P.ell(X(1), Y(-15), 2.6 * k, 2.4 * k, 'A'); P.rect(X(3), Y(-15), j ? 2 : 4, 2, 'A', 1); P.set(X(0), Y(-18), 'C'); P.set(X(1), Y(-18), 'A'); P.set(X(-1), Y(-17), 'C'); });
    P.set(X(2), Y(-16), 'K');
    for (var y = -11; y < -4; y += 2) P.sh(X(-2), Y(y), 2);
  }, { water: true });
  def('turtle', { A: '#8fcf7c', S: '#3f8e5e', C: '#2c6a48', B: '#cfe89a' }, { A: '#f4f2e8', S: '#e0dac8', C: '#b0a890', B: '#ffffff' }, function (P, o) {
    var u = sgn(o.fr), j = o.juv, k = j ? 0.7 : 1, cy = -5 - Math.round(3 * k);
    P.part(function () { P.poly([[-5 * k, cy + 1], [-10 * k, cy + 3 + u], [-8 * k, cy + 5 + u], [-4 * k, cy + 3]], 'A', 2); }, true);
    P.part(function () { P.ell(7.5 * k, cy, 3 * k, 2.4 * k, 'A'); }, true);
    P.part(function () {
      P.ell(0, cy, 6.5 * k, 4 * k, 'S');
      P.recolor('S', 'C', function (x, y) { return ((x + 41) % 4 === 0 && y > cy - 3 * k && y < cy + 3 * k) || y === Math.round(cy); });
      P.recolor('SC', 'B', function (x, y) { return y >= Math.round(cy + 3 * k); });
    });
    P.part(function () { P.poly([[3 * k, cy + 2], [7 * k, cy + 6 - u * 2], [3 * k, cy + 7 - u * 2], [0, cy + 3]], 'A', 1); });
    P.set(Math.round(8.5 * k), Math.round(cy) - 1, 'K');
  }, { water: true });
  def('otter', { A: '#8a5e3c', B: '#ecd8b4', C: '#5e3e28', S: '#dcd4e4' }, { A: '#e0bc7c', B: '#fff4d8', C: '#b08a4c' }, function (P, o) {
    var u = sgn(o.fr), j = o.juv, k = j ? 0.72 : 1, L = Math.round(15 * k), x0 = -Math.round(L / 2), y = -3, sx = Math.round(L * 0.1);
    P.part(function () { P.path([[x0 + 1, y - 2], [x0 - 4, y - 1 + u]], 'C', 1, 2); }, true);
    P.part(function () { P.rr(x0, y - 4, L, 4, 'A', null, 2); P.recolor('A', 'B', function (px, py) { return py <= y - 3 && px > x0 + 3 && px < x0 + L - 3; }); }, true);
    P.part(function () { P.rect(x0 + 1, y - 6 - (u > 0 ? 1 : 0), 2, 3, 'C', 1); P.rect(x0 + 4, y - 6 - (u < 0 ? 1 : 0), 2, 2, 'C', 1); });
    P.part(function () { P.rect(sx, y - 6, 3, 2, 'S', 1); P.rect(sx - 1, y - 5, 1, 2, 'C', 1); P.rect(sx + 3, y - 5, 1, 2, 'C', 1); });
    var hx = x0 + L - 2;
    P.part(function () { P.ell(hx, y - 5, 3.4 * k, 3 * k, 'A'); P.recolor('A', 'B', function (px, py) { return px >= hx - 1 && py >= y - 5; }); });
    P.set(hx, y - 6, 'K'); P.set(hx + 2, y - 6, 'K'); P.set(hx + 1, y - 5, 'N'); P.set(hx - 3, y - 7, 'C');
  }, { water: true, shadow: function (o) { return [o.juv ? 8 : 11, 2, [228, 242, 255], 0.5, 0, 1]; } });
  def('stingray', { A: '#b99c7a', B: '#dcc8a4', C: '#b99c7a' }, { C: '#2f86e8' }, function (P, o) {
    var u = sgn(o.fr), k = o.juv ? 0.7 : 1, cy = -7;
    P.part(function () { P.path([[-6 * k, cy], [-11 * k, cy - 1], [-16 * k, cy + u]], 'A', 2, 1); }, true);
    P.part(function () {
      P.poly([[10 * k, cy], [1, cy - 5 * k - u], [-7 * k, cy], [1, cy + 5 * k + u]], 'A', 'a');
      P.recolor('A', 'B', function (x, y) { return y <= cy && !P.has(x, y - 1); });
      P.recolor('A', 'C', function (x, y) { return h2(x, y, 9) < 0.2 && x < 6 * k; }, 0);
    });
    P.set(Math.round(5 * k), cy - 1, 'K'); P.set(Math.round(5 * k), cy + 1, 'K');
  }, { water: true });
  def('octopus', { A: '#e2573e', B: '#f8b09a', C: '#e2573e' }, { A: '#ecc95a', B: '#fff2a8', C: '#2a6ad8' }, function (P, o) {
    var u = sgn(o.fr), j = o.juv, k = j ? 0.7 : 1, hy = Math.round(-9 * k) - 3;
    P.part(function () { for (var i = 0; i < 5; i++) { var x = Math.round((-6 + i * 3) * k), d = (i % 2 ? u : -u), ex = x + (i - 2) * 2 + d, ey = -1 - (i % 2); P.path([[x, hy + 3], [x + (i - 2), -3 + (i % 2)], [ex, ey]], 'A', i % 2 ? 2 : 1, 2); P.set(ex, ey, 'B', 1); } }, true);
    P.part(function () { P.ell(0, hy, 5.5 * k, 5 * k, 'A'); P.recolor('A', 'C', function (x, y) { return h2(x, y, 3) < 0.16 && y < hy; }, 2); });
    var e = Math.round(2 * k); P.rect(-e - 1, hy + 1, 2, 2, 'W', 1); P.set(-e, hy + 2, 'K'); P.rect(e, hy + 1, 2, 2, 'W', 1); P.set(e + 1, hy + 2, 'K');
  }, { water: true });
  def('reefshark', { A: '#8b95a8', B: '#f1f3f6', C: '#2c2a36' }, { A: '#aab6ca', C: '#ffffff' }, function (P, o) {
    var m = fish(P, o, { len: 19, h: 7, lift: 4, tail: [6, 10, 'A', 3, -1], dorsal: [5, 5, 0, 'A', 1], pect: [5, 4, 4, 'A'], belly: true, eye: [4, -1, 1],
      back: function (P, m) { P.poly([[m.x1 - 3, m.cy - 2], [m.x1 + 3, m.cy], [m.x1 - 3, m.cy + 2]], 'A', 1); },
      dorsalFx: function (P, m, x, y) { P.recolor('A', 'C', function (px, py) { return py <= y + 1; }); },
      tailFx: function (P, m, tx) { P.recolor('A', 'C', function (px, py) { return px <= tx && (py < m.cy - 2 || py > m.cy + 2); }); } });
    P.sh(Math.round(m.x1) - 6, Math.round(m.cy), 3); P.sh(Math.round(m.x1) - 8, Math.round(m.cy), 3);
  }, { water: true });
  def('dolphin', { A: '#6aa2d2', B: '#e6f0f8', C: '#4a7fb0' }, { A: '#f2a8c0', B: '#fde4ec', C: '#d87aa0' }, function (P, o) {
    var m = fish(P, o, { len: 16, h: 8, lift: 4, tail: [5, 7, 'A', 2], dorsal: [5, 4, -1, 'C', 0], pect: [4, 3, 3, 'C'], belly: true, eye: [3, 0, 1],
      back: function (P, m) { P.rr(m.x1 - 1, m.cy + 1, 5, 2, 'A', 1, 0); } });
    P.set(Math.round(m.x1) - 1, Math.round(m.cy) + 2, 'C', 2); P.set(Math.round(m.x1) - 2, Math.round(m.cy) + 2, 'C', 2);
  }, { water: true });
  def('manta', { A: '#2f3549', B: '#eef2f6', C: '#4a5270' }, { A: '#1c1c26', B: '#55556a', C: '#2a2a36' }, function (P, o) {
    var u = sgn(o.fr), k = o.juv ? 0.7 : 1, cy = -8;
    P.part(function () { P.path([[0, cy - 3 * k], [-1, cy - 7 * k], [-3, cy - 10 * k]], 'A', 2, 1); }, true);
    P.part(function () {
      P.poly([[0, cy - 4 * k], [8 * k, cy - 2 * k], [13 * k, cy + 1 - u * 2], [6 * k, cy + 3 * k], [0, cy + 4 * k], [-6 * k, cy + 3 * k], [-13 * k, cy + 1 - u * 2], [-8 * k, cy - 2 * k]], 'A', 'a');
      P.recolor('A', 'B', function (x, y) { return Math.abs(Math.abs(x) - 4 * k) <= 1.2 && y >= cy - 2 * k && y <= cy - 1; });
    });
    P.part(function () { P.rect(Math.round(-3 * k) - 1, cy + 3 * k, 2, 3, 'A', 1); P.rect(Math.round(3 * k), cy + 3 * k, 2, 3, 'A', 1); P.rect(Math.round(-3 * k) + 1, cy + 4 * k, Math.round(6 * k) - 1, 1, 'B', 1); });
    P.set(Math.round(-5 * k), cy + Math.round(2 * k), 'W'); P.set(Math.round(5 * k), cy + Math.round(2 * k), 'W');
  }, { water: true });
  def('whaleshark', { A: '#4f7098', B: '#e8eef4', C: '#3a5678', D: '#ffffff' }, { A: '#2c3a70', B: '#c8d4f0', D: '#ffe98a' }, function (P, o) {
    var m = fish(P, o, { len: 25, h: 9, lift: 4, tail: [7, 12, 'A', 3, -1], dorsal: [6, 4, -3, 'A', 1], pect: [6, 4, 5, 'C'], belly: true, eye: [2, 0, 1],
      body: function (P, m) { P.recolor('A', 'D', function (x, y) { return y < m.cy + 1 && ((x + 60) % 3 === 0) && ((y + 60) % 2 === 0) && x < m.x1 - 3; }, 1); } });
    P.sh(Math.round(m.x1) - 1, Math.round(m.cy) + 1, 3); P.sh(Math.round(m.x1) - 2, Math.round(m.cy) + 1, 3); P.sh(Math.round(m.x1) - 3, Math.round(m.cy) + 1, 3);
  }, { water: true });

  // ---------- lost valley ----------
  def('dodo', { A: '#8f97a8', C: '#cdd3de', Y: '#e8d27a', L: '#e0a83c', D: '#4a4650' }, { A: '#f4f2ee', C: '#ffffff' }, function (P, o) {
    bird(P, o, { bw: 12, bh: 11, leg: 3, legT: 2, head: [8, 8], hd: [2, -3], beak: [6, 5, 'Y', 1, 1], wing: [5, 4, -1, 0, 'C'],
      back: function (P, m) { P.ell(-m.bw / 2, m.cy - 3, 2.5, 2.5, 'C'); },
      face: function (P, m) { P.recolor('A', 'C', function (x, y) { return x >= m.hx + 1; }); },
      beakFx: function (P, m) { P.recolor('Y', 'D', function (x) { return x >= m.bx + m.bl - 1; }); } });
  });
  def('mammoth', { A: '#8b5b37', E: '#6e4426', C: '#5a381f', T: '#fff6dc' }, { A: '#e4b44a', E: '#c9962c', C: '#a87a1c' }, function (P, o) {
    var m = trunked(P, o, { len: 15, bh: 11, leg: 5, head: [10, 10], hd: [0, 0], earS: [2.2, 3],
      back: function (P, m) { P.ell(m.hx, m.hy - 5, 3.5, 2.5, 'A'); P.ell(m.x1 - 7, m.yt, 4, 2, 'A'); },
      tusk: function (P, m, x, y) { if (m.j) { P.set(x + 1, y + 1, 'T'); return; } P.path([[x, y], [x + 2, y + 5], [x + 6, y + 6], [x + 8, y + 3]], 'T', 0, 2); } });
    P.part(function () { for (var x = m.x0 + 1; x <= m.x1 - 2; x++) P.rect(x, m.yb, 1, 2 + (h2(x, 2, 9) < 0.5 ? 1 : 0), 'A', 2); }, true);
    spots(P, 'A', 'C', m.x0, m.yt, m.x1 - 4, m.yb, 0.14, 5, 2);
  });
  def('sabertooth', { A: '#cb8c4c', B: '#f4dcb0', C: '#8a5a2c' }, { A: '#f4f2ee', B: '#ffffff', C: '#b8bcc8' }, function (P, o) {
    var m = quad(P, o, { len: 14, bh: 8, leg: 5, lw: 3, head: [9, 8], hd: [2, -1], snout: [3, 5, 1], snoutK: 'B', ear: ['round', 1], tail: ['stub', 3],
      body: function (P, m) { P.ell(m.x1 - 3, m.yt + 1, 4, 3, 'A'); } });
    P.recolor('A', 'C', function (x, y) { return y <= m.yt + 2 && x < m.x1 - 4 && x > m.x0 && ((x + 60) % 3) === 0; });
    if (!o.juv) { P.rect(m.sx - 1, m.sy1 + 1, 1, 4, 'W', 0); P.rect(m.sx - 3, m.sy1 + 1, 1, 3, 'W', 1); } else P.set(m.sx - 1, m.sy1 + 1, 'W');
  });
  def('triceratops', { A: '#d9924c', F: '#b8503c', B: '#f6e4b8', T: '#fffaf0', C: '#a8582c' }, { A: '#d83c44', F: '#8a1c3c', C: '#8a1428' }, function (P, o) {
    var j = o.juv, m = quad(P, o, { len: 15, bh: 10, leg: 4, lw: 4, head: [9, 8], hs: 'box', hr: 2, hd: [4, 3], snout: [4, 5, 2], nose: 0, stride: 1, br: 3,
      back: function (P, m) { P.poly([[m.x0 + 2, m.yt + 4], [m.x0 - 5, m.yb], [m.x0 + 2, m.yb]], 'A', 'a'); },
      pre: function (P, m) { P.part(function () { // big round neck frill with a pale scalloped rim
        var fr = j ? 0.7 : 1, cx = m.hx - 3, cy = m.hy - 3; P.ell(cx, cy, 4.2 * fr, 7 * fr, 'B'); P.ell(cx + 1, cy + 1, 3.2 * fr, 5.6 * fr, 'F');
        for (var a = 0; a < 8; a++) { var t = 1.3 + a * 0.5; P.set(cx + Math.cos(t) * 4.4 * fr, cy - Math.sin(t) * 7.2 * fr, 'B', 0); }
      }); } });
    P.rect(m.sx, m.sy1 - 1, 1, 2, 'B', 1); P.set(m.sx - 1, m.sy1, 'B', 2);
    P.part(function () { // two long brow horns and a nose horn
      if (j) { P.set(m.hx + 1, m.hy - 5, 'T'); P.set(m.sx - 1, m.sy0 - 1, 'T'); return; }
      P.poly([[m.hx - 1, m.hy - 3], [m.hx + 5, m.hy - 9], [m.hx + 1, m.hy - 3]], 'T', 2); P.poly([[m.hx + 1, m.hy - 3], [m.hx + 7, m.hy - 8], [m.hx + 3, m.hy - 3]], 'T', 0);
      P.poly([[m.sx - 2, m.sy0], [m.sx, m.sy0 - 3], [m.sx, m.sy0]], 'T', 0);
    });
    P.recolor('A', 'B', function (x, y) { return y === m.yb && x > m.x0 + 1 && x < m.x1; });
    spots(P, 'A', 'C', m.x0, m.yt, m.x1 - 6, m.yt + 3, 0.2, 6);
  });
  def('raptor', { A: '#5aa48c', B: '#f0e4b8', C: '#2f6a5a', R: '#5aa48c', T: '#fff4d8' }, { A: '#3a66c8', C: '#1c2f7a', R: '#f04a3c' }, function (P, o) {
    biped(P, o, { len: 11, bh: 6, leg: 6, lw: 2, head: [8, 5], hd: [3, -5], nw: 3, tail: [11, -2, 'A'], belly: true, arm: [3, 2, 0, 1, 1], claw: 'T', footL: 4, footK: 'C',
      body: function (P, m) { P.recolor('A', 'C', function (x, y) { return y < m.cy && ((x + 40) % 3 === 0); }); },
      face: function (P, m) { P.recolor('A', 'B', function (x, y) { return y >= m.hy + 1 && x > m.hx - 1; }); P.set(m.hx + 2, m.hy + 1, 'W'); },
      post: function (P, m) { if (o.variant) { P.path([[m.hx - 3, m.hy - 3], [m.hx - 1, m.hy - 4], [m.hx - 5, m.hy - 5]], 'R', 1, 1); P.rect(Math.round(m.rx) - 1, Math.round(m.cy) + 1, 3, 2, 'R', 1); } } });
  });
  def('trex', { A: '#6b9c46', B: '#ecdfa8', C: '#4a7430', T: '#ffffff' }, { A: '#3a3742', B: '#6a6474', C: '#22202a' }, function (P, o) {
    biped(P, o, { len: 14, bh: 10, leg: 7, lw: 4, head: [11, 9], hd: [3, -4], nw: 6, tail: [11, 1, 'A'], belly: true, arm: [2, 2, 1, 2, 1], footL: 6, eye: [0, -2],
      body: function (P, m) { P.recolor('A', 'C', function (x, y) { return y < m.cy - 1 && h2(x, y, 8) < 0.22; }); },
      face: function (P, m) {
        var top = m.hy - Math.floor(m.hh / 2), x;
        P.recolor('A', 'B', function (px, py) { return py >= m.hy + 2 && px >= m.hx - 2; });
        for (x = m.hx - 1; x <= m.hx + m.hw / 2; x++) P.sh(x, m.hy + 1, 3);
        for (x = m.hx; x < m.hx + m.hw / 2; x += 2) P.set(x, m.hy + 2, 'T');
        P.set(m.hx + 3, m.hy - 2, 'C'); P.rect(m.hx - 1, top, 3, 1, 'C', 1);
      } });
  });

  // ---------- misty isles ----------
  def('jackalope', { A: '#b98a5c', C: '#6e4a2c', H: '#f0e0b8' }, { A: '#f2c84a', C: '#b0822a', H: '#ffffff' }, function (P, o) { hareBody(P, o, true); });
  def('griffin', { A: '#dca852', H: '#f6f3ea', C: '#7a4f2c', Y: '#f4b81c', D: '#b08448' }, { A: '#5a6a88', H: '#e8eef6', C: '#2c3650', D: '#8a9ab8' }, function (P, o) {
    var u = sgn(o.fr), j = o.juv, m = quad(P, o, { len: 14, bh: 8, leg: 5, lw: 3, head: [8, 8], headK: 'H', hd: [2, -2], nw: 5, neckK: 'H', tail: ['tuft', 6, 'C'], foot: 'Y', eye: [1, -1],
      back: function (P, m) { P.poly([[m.x0 + 5, m.yt + 2], [m.x0, m.yt - (j ? 5 : 9) - u], [m.x0 + 9, m.yt - 3]], 'C', 2); } });
    P.part(function () { P.poly([[m.hx + 3, m.hy - 1], [m.hx + 6, m.hy], [m.hx + 6, m.hy + 2], [m.hx + 3, m.hy + 2]], 'Y', 1); });
    P.part(function () {
      var wy = m.yt - (j ? 5 : 9) - u * 2;
      P.poly([[m.x0 + 6, m.yt + 3], [m.x0 - 4, wy], [m.x0 + 3, wy], [m.x0 + 11, m.yt + 1]], 'C', 'a');
      P.recolor('C', 'D', function (x, y) { return ((x - y) % 3 + 3) % 3 === 0 && y > wy + 1; });
    });
    P.set(m.hx - 2, m.hy - 5, 'H'); P.set(m.hx - 1, m.hy - 4, 'H');
  });
  def('unicorn', { A: '#fbf9ff', M: '#ee7cc4', D: '#7cc4ee', G: '#f6c83c' }, { A: '#34346a', M: '#a8c8f8', D: '#f8f0a8', G: '#e8f0ff' }, function (P, o) {
    var j = o.juv, m = quad(P, o, { len: 14, bh: 8, leg: 7, lw: 2, head: [7, 6], hd: [3, -4], nw: 4, snout: [4, 4, 1], ear: ['point', 2], tail: ['horse', 8, 'M'], foot: 'G', tailY: 1,
      pre: function (P, m) { P.line(m.x1 - 3, m.yt + 1, m.hx - 3, m.hy - 2, 'M', 1, 3); } });
    P.rect(m.hx - 2, m.hy - 3, 3, 2, 'M', 1);
    P.recolor('M', 'D', function (x, y) { return (((x + y) % 4) + 4) % 4 < 2; });
    P.line(m.hx + 1, m.hy - 3, m.hx + (j ? 2 : 4), m.hy - (j ? 5 : 9), 'G', 1); if (!j) { P.sh(m.hx + 2, m.hy - 5, 0); P.sh(m.hx + 3, m.hy - 7, 0); }
  });
  def('phoenix', { A: '#f2561e', C: '#f8a41c', Y: '#fbe04a', R: '#d82c2c', L: '#c9862a' }, { A: '#2c7ae0', C: '#4ac0f0', Y: '#d0f6ff', R: '#1c4ab8', L: '#7a8aa8' }, function (P, o) {
    var u = sgn(o.fr);
    bird(P, o, { bw: 9, bh: 9, leg: 3, head: [7, 7], hd: [1, -3], beak: [3, 3, 'Y', 1, 1], wing: [6, 6, -1, 0, 'C', 1],
      back: function (P, m) {
        var k = m.j ? 0.6 : 1;
        P.path([[-3, m.cy], [-8 * k, m.cy - 2], [-12 * k, m.cy + 2 + u], [-15 * k, m.cy - 1 + u]], 'R', 1, 2); P.set(-15 * k, m.cy - 1 + u, 'Y'); P.set(-15 * k - 1, m.cy - 2 + u, 'Y');
        P.path([[-3, m.cy + 1], [-8 * k, m.cy + 3], [-13 * k, m.cy + 6 - u]], 'A', 1, 2); P.set(-13 * k, m.cy + 6 - u, 'Y'); P.set(-13 * k - 1, m.cy + 7 - u, 'Y');
        P.path([[-3, m.cy - 1], [-7 * k, m.cy - 5], [-11 * k, m.cy - 6 - u]], 'C', 1, 2); P.set(-11 * k - 1, m.cy - 7 - u, 'Y');
      },
      pre: function (P, m) { P.path([[m.hx - 1, m.hy - 3], [m.hx - 2, m.hy - 6 - (u ? 1 : 0)]], 'Y', 1); P.path([[m.hx + 1, m.hy - 3], [m.hx + 1, m.hy - 5]], 'C', 1); P.path([[m.hx - 3, m.hy - 2], [m.hx - 5, m.hy - 4]], 'R', 1); },
      wingFx: function (P, m) { P.recolor('C', 'Y', function (x, y) { return y > m.cy + 1; }); },
      body: function (P, m) { P.recolor('A', 'C', function (x, y) { return y > m.cy + 2 && x > -1; }); } });
  });
  def('dragon', { A: '#d9443c', B: '#f6d27a', C: '#f08c2c', H: '#fff0d0', D: '#a02a2a' }, { A: '#f0e8f4', B: '#f8d0e0', C: '#8ab8f0', D: '#b8a0d8' }, function (P, o) {
    var j = o.juv, u = sgn(o.fr), wk = j ? 0.6 : 1, m = quad(P, o, { len: 14, bh: 9, leg: 4, lw: 4, head: [8, 7], hs: 'box', hr: 2, hd: [4, -5], nw: 5, snout: [5, 5, 1], stride: 1, nose: 0, br: 3, eye: [0, -1],
      back: function (P, m) {
        P.poly([[m.x0 + 2, m.yt + 2], [m.x0 - 5, m.yb - 2 + u], [m.x0 - 8, m.yb - 5 + u], [m.x0 - 5, m.yb + u], [m.x0 + 2, m.yb]], 'A', 'a');
        P.poly([[m.x0 - 7, m.yb - 8 + u], [m.x0 - 11, m.yb - 6 + u], [m.x0 - 7, m.yb - 3 + u]], 'D', 1);
        P.poly([[m.x0 + 6, m.yt + 1], [m.x0 + 2, m.yt - 9 * wk - u], [m.x0 + 10, m.yt - 5 * wk]], 'C', 2);
      } });
    P.recolor('A', 'B', function (x, y) { return y >= m.yb - 1 && y <= m.yb && x > m.x0 && x <= m.x1; });
    for (var x = m.x0 + 1; x < m.x1 - 2; x += 3) P.set(x, m.yt - 1, 'D');
    P.part(function () {
      var wy = m.yt - Math.round(10 * wk) - u * 2;
      P.poly([[m.x0 + 5, m.yt + 3], [m.x0 - 3, wy + 1], [m.x0 + 4, wy], [m.x0 + 11, m.yt - 2]], 'C', 'a');
      P.line(m.x0 + 5, m.yt + 3, m.x0 - 3, wy + 1, 'D', 1); P.line(m.x0 + 6, m.yt + 2, m.x0 + 4, wy, 'D', 1);
    });
    P.part(function () { P.path([[m.hx - 2, m.hy - 3], [m.hx - 4, m.hy - 6]], 'H', 1, 1); P.path([[m.hx, m.hy - 3], [m.hx - 1, m.hy - 6]], 'H', 1, 1); });
    P.set(m.sx, m.sy0 + 1, 'D'); P.set(m.sx - 1, m.sy1, 'W'); P.set(m.sx - 3, m.sy1, 'W');
  });

  // =====================================================================================================================
  // PEOPLE: big head, small body, facing front and a little to the right. Ground is y = 0.
  // A person is described by a small spec (skin, hair, clothes, hat, what they hold); visitors are made from a seed.
  // =====================================================================================================================
  var SKIN = ['#fbd9b5', '#f4c8a0', '#e3ac7c', '#c58c5c', '#93603f', '#6e4429'];
  var HAIRC = ['#2c2228', '#4a3020', '#7a4a24', '#c08a3c', '#ecc85c', '#b54a2c', '#9a9aa6', '#ece8e0'];
  var SHIRTC = ['#e2504a', '#f08a2c', '#f4c838', '#5cb85a', '#3aa0a0', '#4a8ae0', '#7a5ad8', '#e070b0', '#f4f1ea', '#4a4a5c', '#8ad0e8', '#b8e068'];
  var PANTSC = ['#3a4a7a', '#4a4a54', '#7a5a3c', '#c8b48a', '#2c6a5a', '#a03a3a', '#e8e4dc', '#5a7ab8'];

  function drawPerson(sp, fr) {
    var pal = { A: sp.skin || SKIN[1], H: sp.hair || HAIRC[1], S: sp.shirt || '#4a8ae0', P: sp.pants || '#3a4a7a', F: sp.shoe || '#3a2c2a', T: (sp.hat && sp.hat[1]) || '#888888', B: (sp.hat && sp.hat[2]) || '#444444',
      C: sp.coat || sp.shirt || '#ffffff', V: sp.vest || '#888888', X: sp.acc || '#e04a3c', I: sp.item || '#c8c8d0', J: sp.item2 || '#f4d040', Q: sp.beard || sp.hair || '#888888', O: INK };
    var P = new Pt(pal, 44, 52, 22, 40), ch = !!sp.child, sg = sgn(fr), old = !!sp.old;
    var legH = ch ? 2 : 3, bodyH = ch ? 4 : 5, bw = ch ? 5 : 7, hw = ch ? 8 : 9, hh = ch ? 7 : 8;
    var by = -legH - bodyH, bx = -Math.floor(bw / 2), top = by - hh, hx0 = -Math.floor(hw / 2), hx1 = hx0 + hw - 1, bk = sp.coat ? 'C' : 'S', handY = by + bodyH - 1, x, y;
    // behind: cape, backpack, sack, long hair
    if (sp.cape) P.part(function () { P.poly([[bx - 1, by], [bx + bw, by], [bx + bw + 1, -2], [bx - 2, -2]], 'X', 'a'); }, true);
    if (sp.pack) P.part(function () { P.rr(bx - 2, by, 3, 4, 'X', null, 1); }, true);
    if (sp.hold && sp.hold[0] === 'sack') P.part(function () { P.ell(bx - 2, by + 1, 3.4, 3.6, 'I'); P.set(bx - 1, by - 3, 'I', 2); }, true);
    if (sp.style === 1) P.part(function () { P.rect(hx0, top + 3, 2, hh + 1, 'H', 2); P.rect(hx1 - 1, top + 3, 2, hh, 'H', 2); }, true);
    if (sp.style === 6) P.part(function () { P.ell(0, top + 2, hw / 2 + 0.6, 4, 'H'); }, true);
    // legs
    P.part(function () {
      var l1 = sg > 0 ? 1 : 0, l2 = sg < 0 ? 1 : 0, lk = sp.dress ? 'A' : 'P';
      P.rect(-2 + l1, -legH, 2, legH - l1, lk, 1); P.rect(1 + l2, -legH, 2, legH - l2, lk, 2);
      P.rect(-2 + l1, -1 - l1, 2, 1, 'F', 1); P.rect(1 + l2, -1 - l2, 2 + (l2 ? 0 : 0), 1, 'F', 1);
    }, true);
    // body
    P.part(function () {
      P.rr(bx, by, bw, bodyH, bk, null, 1);
      if (sp.coat) P.rect(bx, -legH, bw, ch ? 1 : 2, 'C', 2);
      if (sp.dress) { P.rect(bx, -legH, bw, 1, bk, 1); P.rect(bx - 1, -legH + 1, bw + 2, 1, bk, 2); }
      if (sp.vest) P.recolor(bk, 'V', function (px) { return px <= bx + 1 || px >= bx + bw - 2; });
      if (sp.open) P.recolor(bk, 'S', function (px, py) { return px >= 0 && px <= 1 && py <= by + 3; });
      if (sp.tie) { P.set(1, by, 'X'); P.set(1, by + 1, 'X'); P.set(1, by + 2, 'X'); }
      if (sp.stripe) P.recolor(bk, 'X', function (px, py) { return ((py - by) & 1) === 1; });
      if (sp.band) P.recolor(bk, 'J', function (px, py) { return py === by + 2; });
      if (sp.logo) P.set(1, by + 1, 'J');
      if (sp.apron) P.recolor(bk, 'X', function (px, py) { return px > bx && px < bx + bw - 1 && py >= by + 1; });
      if (sp.scarf) { P.rect(bx + 1, by, bw - 2, 1, 'X', 1); P.rect(bx + bw - 3, by + 1, 1, 2, 'X', 2); }
      if (sp.neck) P.rect(bx + 2, by, bw - 4, 1, 'J', 1);
    }, true);
    // arms
    P.part(function () {
      var a1 = sg > 0 ? -1 : 0, a2 = sg < 0 ? -1 : 0, sl = sp.short ? 2 : bodyH - 2, up = sp.hold && (sp.hold[0] === 'flag' || sp.hold[0] === 'balloon' || sp.hold[0] === 'mic' || sp.hold[0] === 'cone') ? -1 : 0;
      P.rect(bx - 1, by + 1 + a1, 1, bodyH - 2, 'A', 2); P.rect(bx - 1, by + 1 + a1, 1, sl, bk, 2);
      P.rect(bx + bw, by + 1 + a2 + up, 1, bodyH - 2, 'A', 1); P.rect(bx + bw, by + 1 + a2 + up, 1, sl, bk, 1);
    });
    // head, hair, face
    P.part(function () {
      P.rr(hx0, top, hw, hh, 'A', 1, 2);
      var st = sp.style | 0;
      P.recolor('A', 'H', function (px, py) {
        var ry = py - top, rx = px - hx0;
        if (st === 4) return ry <= 1;
        if (st === 5) return rx <= 1 && ry >= 2 && ry <= 5;
        if (ry <= 2) return true;
        if (st === 3) return rx <= 1 || (ry <= 3 && rx <= 5);
        if (st === 1) return rx <= 1 || rx >= hw - 1;
        return rx <= 1 && ry <= 4;
      });
      if (st === 4 || st === 5) P.recolor('A', 'A', function (px, py) { return py <= top + 1 && st === 5; }, 0);
      if (sp.beard) P.recolor('A', 'Q', function (px, py) { return py >= top + hh - 2 && px >= hx0 + 2; });
      if (old && !sp.beard) P.sh(hx1 - 1, top + hh - 3, 2);
    });
    if (sp.style === 2) P.part(function () { P.rr(hx0 - 2, top + 2, 3, 3, 'H', null, 1); }, true);
    if (sp.style === 7) P.part(function () { P.rr(hx0 - 2, top + 3, 2, 3, 'H', 1, 0); P.rr(hx1 + 1, top + 3, 2, 3, 'H', 1, 0); });
    if (sp.style === 8) P.part(function () { P.rr(-2, top - 2, 4, 3, 'H', null, 1); });
    var ey = top + (ch ? 3 : 4);
    if (sp.glasses === 'sun') { P.rect(-1, ey, 6, 2, 'K', 1); P.set(1, ey + 1, 'A', 1); P.set(0, ey, 'W'); P.set(3, ey, 'W'); }
    else { P.set(0, ey, 'K'); P.set(0, ey + 1, 'K'); P.set(3, ey, 'K'); P.set(3, ey + 1, 'K'); if (sp.glasses) { P.set(-1, ey, 'W'); P.set(-1, ey + 1, 'W'); P.set(2, ey, 'W'); P.set(2, ey + 1, 'W'); P.set(1, ey, 'K', 0); P.set(4, ey, 'W'); } }
    if (sp.blush) { P.set(-2, ey + 2, 'X', 0); P.set(4, ey + 2, 'X', 0); }
    if (sp.stache) P.rect(0, ey + 2, 4, 1, 'Q', 1);
    if (sp.smile) P.sh(2, ey + 3, 2);
    // hat
    var hat = sp.hat && sp.hat[0];
    if (hat) P.part(function () {
      if (hat === 'cap') { P.rr(hx0, top - 1, hw, 3, 'T', null, 2); P.rect(hx1 - 2, top + 2, 5, 1, 'T', 2); P.set(0, top - 1, 'B'); }
      else if (hat === 'safari') { P.rr(hx0 + 1, top - 2, hw - 2, 3, 'T', null, 1); P.rect(hx0 - 2, top + 1, hw + 4, 1, 'T', 2); P.rect(hx0 + 1, top, hw - 2, 1, 'B', 1); }
      else if (hat === 'pith') { P.ell(0, top, hw / 2 - 0.5, 2.6, 'T'); P.rect(hx0 - 1, top + 2, hw + 2, 1, 'T', 2); P.set(0, top - 3, 'T', 0); P.rect(hx0 + 1, top + 1, hw - 2, 1, 'B', 1); }
      else if (hat === 'hard') { P.ell(0, top, hw / 2 - 0.5, 2.6, 'T'); P.rect(hx0 - 1, top + 2, hw + 3, 1, 'T', 2); P.rect(0, top - 3, 1, 4, 'T', 0); }
      else if (hat === 'top') { P.rect(hx0 + 2, top - 5, hw - 4, 6, 'T', 'a'); P.rect(hx0, top + 1, hw, 1, 'T', 2); P.rect(hx0 + 2, top - 1, hw - 4, 1, 'B', 1); }
      else if (hat === 'bowler') { P.ell(0, top - 1, hw / 2 - 1.5, 2.6, 'T'); P.rect(hx0, top + 1, hw, 1, 'T', 2); P.rect(hx0 + 1, top, hw - 2, 1, 'B', 1); }
      else if (hat === 'fedora') { P.rr(hx0 + 1, top - 3, hw - 2, 4, 'T', null, 1); P.sh(0, top - 3, 2); P.rect(hx0 - 2, top + 1, hw + 4, 1, 'T', 2); P.rect(hx0 + 1, top, hw - 2, 1, 'B', 1); }
      else if (hat === 'sun') { P.ell(0, top + 1, hw / 2 + 2, 1.4, 'T', 2); P.rr(hx0 + 2, top - 2, hw - 4, 3, 'T', null, 1); P.rect(hx0 + 2, top, hw - 4, 1, 'B', 1); }
      else if (hat === 'beanie') { P.rr(hx0, top - 1, hw, 4, 'T', null, 2); P.rect(hx0, top + 2, hw, 1, 'B', 1); P.rect(0, top - 2, 2, 1, 'B', 0); }
      else if (hat === 'crown') { P.rect(hx0 + 2, top - 1, hw - 4, 2, 'T', 1); for (var cx = hx0 + 2; cx < hx0 + hw - 2; cx += 2) P.set(cx, top - 2, 'T', 0); P.set(0, top, 'B'); P.set(2, top, 'B'); }
      else if (hat === 'scrub') { P.rr(hx0, top - 1, hw, 3, 'T', null, 2); P.set(1, top, 'W'); P.set(0, top, 'W'); P.set(2, top, 'W'); P.set(1, top - 1, 'W'); P.set(1, top + 1, 'W'); }
      else if (hat === 'prop') { P.rr(hx0, top - 1, hw, 3, 'T', null, 2); P.recolor('T', 'B', function (px) { return ((px + 40) % 4) < 2; }); P.set(0, top - 2, 'K'); P.rect(-2, top - 3, 5, 1, 'J', sg ? 0 : 1); }
      else if (hat === 'headband') { P.rect(hx0, top + 2, hw, 1, 'T', 1); }
    });
    // things held (right hand is at x = bx + bw)
    var h = sp.hold, hx = bx + bw, t;
    if (h) P.part(function () {
      t = h[0];
      if (t === 'flag') { P.rect(hx + 1, top - 2, 1, handY - top + 1, 'K', 1); P.poly([[hx + 2, top - 2], [hx + 6, top], [hx + 2, top + 2]], 'X', 1); }
      else if (t === 'balloon') { P.rect(hx + 1, top - 1, 1, handY - top - 1, 'W', 2); P.ell(hx + 1.5, top - 5, 2.6, 3, 'X'); P.set(hx, top - 6, 'X', 0); }
      else if (t === 'clipboard') { P.rect(1, by + 1, 4, 4, 'I', 1); P.rect(2, by + 2, 2, 2, 'W', 1); }
      else if (t === 'case') { P.rect(hx - 1, handY + 1, 5, 3, 'I', 1); P.rect(hx, handY, 3, 1, 'I', 2); P.set(hx + 1, handY + 2, 'J'); }
      else if (t === 'camera') { P.rect(2, by + 1, 4, 3, 'I', 1); P.set(3, by + 2, 'W'); P.set(4, by + 2, 'K'); P.set(5, by, 'J'); }
      else if (t === 'cane') { P.rect(hx + 1, handY - 1, 1, -handY + 1, 'I', 1); P.set(hx, handY - 1, 'I', 1); }
      else if (t === 'mic') { P.rect(hx + 1, handY - 4, 1, 3, 'K', 1); P.rect(hx, handY - 6, 3, 2, 'I', 1); }
      else if (t === 'bucket') { P.rect(hx, handY + 1, 3, 3, 'I', 'a'); P.rect(hx, handY + 1, 3, 1, 'J', 1); }
      else if (t === 'book') { P.rect(1, by + 2, 4, 3, 'X', 1); P.rect(2, by + 2, 1, 3, 'W', 1); }
      else if (t === 'gift') { P.rect(1, by + 1, 5, 4, 'X', 'a'); P.rect(3, by + 1, 1, 4, 'J', 1); P.rect(1, by + 2, 5, 1, 'J', 1); P.set(2, by, 'J'); P.set(4, by, 'J'); }
      else if (t === 'wrench') { P.rect(hx + 1, handY - 5, 1, 6, 'I', 1); P.rect(hx, handY - 6, 3, 2, 'I', 0); P.clr(hx + 1, handY - 6); }
      else if (t === 'broom') { P.rect(hx + 1, top + 3, 1, -top - 5, 'I', 1); P.rect(hx, -3, 3, 3, 'J', 'a'); }
      else if (t === 'cone') { P.set(hx + 1, handY - 2, 'J', 2); P.rect(hx, handY - 3, 3, 1, 'J', 1); P.rr(hx, handY - 6, 3, 3, 'X', null, 1); }
      else if (t === 'bag') { P.rect(hx, handY + 1, 3, 3, 'X', 'a'); P.set(hx + 1, handY, 'X', 2); }
      else if (t === 'sack') { P.set(hx, handY, 'I'); }
    });
    return P.bake([ch ? 3 : 4, 1, null, 0.24, 0, 0]);
  }

  var STAFF = {
    keeper:     { skin: SKIN[1], hair: HAIRC[2], style: 0, shirt: '#cdb672', pants: '#4f7f3f', shoe: '#5a3d28', short: 1, hat: ['cap', '#4f8f45', '#f4d040'], hold: ['bucket', 0], item: '#6aa8e0', item2: '#9ad0f0' },
    vet:        { skin: SKIN[2], hair: HAIRC[0], style: 2, shirt: '#58c0b8', pants: '#58c0b8', shoe: '#f4f1ea', coat: '#fbfbf8', open: 1, hat: ['scrub', '#58c0b8'], hold: ['case', 0], item: '#f4f1ea', item2: '#e04a4a' },
    researcher: { skin: SKIN[0], hair: HAIRC[1], style: 3, shirt: '#6a8ad8', pants: '#4a4a5c', coat: '#fbfbf8', open: 1, glasses: 1, hold: ['clipboard', 0], item: '#b8844a' },
    explorer:   { skin: SKIN[3], hair: HAIRC[0], style: 0, shirt: '#d8c08a', pants: '#8a6a44', shoe: '#4a3020', hat: ['pith', '#f0e6c0', '#8a6a44'], pack: 1, acc: '#5c8a4a', neck: 1, item2: '#e04a3c' },
    guide:      { skin: SKIN[1], hair: HAIRC[5], style: 1, shirt: '#e8503a', pants: '#34447a', vest: '#f4f1ea', hold: ['flag', 0], acc: '#f4c020', hat: ['headband', '#f4c020'] },
    zoologist:  { skin: SKIN[4], hair: HAIRC[6], style: 0, shirt: '#3f7a54', pants: '#c8b48a', shoe: '#4a3020', hat: ['safari', '#d8c08a', '#3f7a54'], beard: HAIRC[6], hold: ['clipboard', 0], item: '#b8844a' },
    leader:     { skin: SKIN[2], hair: HAIRC[1], style: 0, shirt: '#8a5a34', pants: '#5a5244', shoe: '#3a2a1c', hat: ['fedora', '#6e4a2c', '#2c2228'], scarf: 1, acc: '#e04a3c', pack: 1 },
    showrunner: { skin: SKIN[0], hair: HAIRC[0], style: 0, shirt: '#8a4ad0', pants: '#5a2a9a', coat: '#8a4ad0', tie: 1, acc: '#f4c020', hat: ['top', '#3a2a5a', '#f4c020'], hold: ['mic', 0], item: '#d8d8e0' },
    trader:     { skin: SKIN[3], hair: HAIRC[0], style: 0, shirt: '#3a9a7a', pants: '#7a5a3c', coat: '#3a9a7a', hat: ['sun', '#e8cf8a', '#c8503a'], stache: 1, hold: ['sack', 0], item: '#c8a878', neck: 1, item2: '#f4c020' },
    headhunter: { skin: SKIN[1], hair: HAIRC[0], style: 4, shirt: '#f4f1ea', pants: '#2c2c3a', coat: '#2c2c3a', open: 1, tie: 1, acc: '#d8404a', glasses: 'sun', hold: ['case', 0], item: '#6e4a2c', item2: '#f4c020' },
    director:   { skin: SKIN[0], hair: HAIRC[7], style: 5, shirt: '#f4f1ea', pants: '#6a6a7a', coat: '#7a7a8c', open: 1, tie: 1, acc: '#3a6ad8', hat: ['bowler', '#3a3a48', '#7a7a8c'], stache: 1, beard: 0, hold: ['cane', 0], item: '#6e4a2c', old: 1 },
    vip:        { skin: SKIN[1], hair: HAIRC[4], style: 1, shirt: '#f4f1ea', pants: '#f4f1ea', coat: '#f8f4ff', cape: 1, acc: '#d8404a', hat: ['crown', '#f4c020', '#e04a8a'], neck: 1, item2: '#f4c020', blush: 1 },
    teacher:    { skin: SKIN[2], hair: HAIRC[2], style: 2, shirt: '#f4f1ea', pants: '#5a4a6a', coat: '#6aa86a', open: 1, glasses: 1, hold: ['book', 0], acc: '#d8404a', dress: 0 },
    donor:      { skin: SKIN[0], hair: HAIRC[7], style: 8, shirt: '#34447a', pants: '#34447a', dress: 1, neck: 1, item2: '#f8f4ff', hold: ['gift', 0], acc: '#e8503a', old: 1, blush: 1 },
    reporter:   { skin: SKIN[3], hair: HAIRC[0], style: 3, shirt: '#f4f1ea', pants: '#4a4a5c', coat: '#c8a878', open: 1, tie: 1, acc: '#3a6ad8', hold: ['mic', 0], item: '#e04a3c' },
    photographer: { skin: SKIN[1], hair: HAIRC[3], style: 0, shirt: '#4a4a5c', pants: '#7a6a4c', vest: '#b8a070', hat: ['cap', '#4a4a5c', '#f4f1ea'], hold: ['camera', 0], item: '#3a3a48', item2: '#f8f4a0' },
    kid:        { child: 1, skin: SKIN[0], hair: HAIRC[3], style: 0, shirt: '#f4c838', pants: '#4a8ae0', short: 1, stripe: 1, acc: '#e8503a', hat: ['prop', '#e8503a', '#4a8ae0'], item2: '#f4c838', hold: ['balloon', 0], blush: 0 },
    professor:  { skin: SKIN[1], hair: HAIRC[7], style: 5, shirt: '#f4f1ea', pants: '#5a4a3c', coat: '#8a6a44', open: 1, tie: 1, acc: '#a03a3a', glasses: 1, beard: HAIRC[7], hold: ['book', 0], old: 1 },
    builder:    { skin: SKIN[4], hair: HAIRC[0], style: 0, shirt: '#f08a2c', pants: '#3a4a7a', shoe: '#5a3d28', band: 1, item2: '#f8f4a0', hat: ['hard', '#f4c838'], hold: ['wrench', 0], item: '#a8a8b8', short: 1 },
    volunteer:  { skin: SKIN[2], hair: HAIRC[5], style: 7, shirt: '#8ad84a', pants: '#3a4a7a', short: 1, logo: 1, item2: '#ffffff', hat: ['cap', '#8ad84a', '#ffffff'], hold: ['broom', 0], item: '#b8844a' },
    elder:      { skin: SKIN[0], hair: HAIRC[7], style: 8, shirt: '#b8a0d8', pants: '#6a5a7a', dress: 1, scarf: 1, acc: '#f4f1ea', glasses: 1, hold: ['cane', 0], item: '#6e4a2c', old: 1 },
    person:     { skin: SKIN[1], hair: HAIRC[1], style: 0, shirt: '#6a9ad8', pants: '#4a4a5c' }
  };
  var PERSON_KINDS = ['visitor', 'keeper', 'vet', 'researcher', 'explorer', 'guide', 'zoologist', 'leader', 'showrunner', 'trader', 'headhunter', 'director', 'vip',
    'teacher', 'donor', 'reporter', 'photographer', 'kid', 'professor', 'builder', 'volunteer', 'elder', 'person'];
  var VISITOR_SEEDS = 97;
  function visitorSpec(seed) {
    var r = rng(seed * 7 + 3), pick = function (a) { return a[Math.floor(r() * a.length)]; };
    var sp = { skin: pick(SKIN), hair: pick(HAIRC.slice(0, 7)), shirt: pick(SHIRTC), pants: pick(PANTSC), child: r() < 0.28 };
    var girl = r() < 0.5, q = r();
    sp.style = girl ? pick([1, 2, 3, 7, 1, 6]) : pick([0, 0, 3, 4, 6]);
    if (sp.child && girl && r() < 0.5) sp.style = 7;
    if (girl && r() < 0.4) { sp.dress = 1; }
    if (r() < 0.5) sp.short = 1;
    if (r() < 0.14) { sp.old = 1; sp.hair = pick([HAIRC[6], HAIRC[7]]); if (!girl) sp.style = 5; }
    if (q < 0.16) sp.hat = ['cap', pick(SHIRTC), '#ffffff']; else if (q < 0.26) sp.hat = ['sun', '#f0dc98', pick(SHIRTC)]; else if (q < 0.31) sp.hat = ['beanie', pick(SHIRTC), '#f4f1ea'];
    if (sp.hat && sp.style === 6) sp.style = 0;
    q = r();
    if (sp.child) { if (q < 0.34) { sp.hold = ['balloon']; sp.acc = pick(['#e8503a', '#f4c838', '#4a8ae0', '#e070b0', '#5cb85a']); } else if (q < 0.5) { sp.hold = ['cone']; sp.acc = pick(['#f8b0c8', '#fff4d8', '#a8e0b8']); sp.item2 = '#d8a050'; } }
    else if (q < 0.1) { sp.hold = ['camera']; sp.item = '#3a3a48'; sp.item2 = '#f8f4a0'; } else if (q < 0.2) { sp.hold = ['cone']; sp.acc = pick(['#f8b0c8', '#fff4d8', '#a8e0b8']); sp.item2 = '#d8a050'; }
    else if (q < 0.32) { sp.pack = 1; sp.acc = pick(SHIRTC); } else if (q < 0.4) { sp.hold = ['bag']; sp.acc = pick(SHIRTC); }
    if (!sp.hold && !sp.dress && r() < 0.25) { sp.stripe = 1; sp.acc = pick(SHIRTC); }
    if (r() < 0.1 && !sp.child) sp.glasses = r() < 0.5 ? 'sun' : 1;
    if (!girl && !sp.child && r() < 0.12) sp.beard = sp.hair;
    return sp;
  }
  function person(kind, opt) {
    opt = opt || {};
    var fr = (((opt.frame | 0) % PERSON_FRAMES) + PERSON_FRAMES) % PERSON_FRAMES, key, spec;
    if (kind === 'visitor') { var sd = ((opt.seed | 0) % VISITOR_SEEDS + VISITOR_SEEDS) % VISITOR_SEEDS; key = 'p|v' + sd + '|' + fr; spec = function () { return visitorSpec(sd); }; }
    else { if (!STAFF[kind]) kind = 'person'; key = 'p|' + kind + '|' + fr; spec = function () { return STAFF[kind]; }; }
    return getFlip(key, opt.flip, function () { return drawPerson(spec(), fr); });
  }

  // =====================================================================================================================
  // GROUND TILES: exactly one ZGeo hex each (plus a short front lip), anchored at the hex centre.
  // =====================================================================================================================
  var BIOME_IDS = ['savanna', 'jungle', 'desert', 'arctic', 'mountain', 'ocean', 'paleo', 'mythic'];
  var LIP = Math.max(2, Math.round(3 * U)), GRASS_VARIANTS = 6;
  // a pixel belongs to the hex whose cell contains its centre (ZGeo's own rounding, nudged off the exact edges so neighbours never tie)
  function inHex(x, y) { var a = G.toAxial(x + 0.513, y + 0.507); return a.q === 0 && a.r === 0; }
  var GROUND = {
    grass:    { A: '#86c94e', B: '#74b842', C: '#9ad65c', D: '#5fa238', L: '#6b4a2e', F: '#ffffff', G: '#f4d040', E: '#f08aa8' },
    path:     { A: '#e8d5a4', B: '#d6bf88', C: '#f4e6bc', D: '#c2a870', L: '#8a7450' },
    locked:   { A: '#5f8f66', B: '#547f5c', C: '#6a9a70', D: '#487050', L: '#3c5040' },
    water:    { A: '#4aa3d8', B: '#3f93c8', C: '#8fd0f0', D: '#2f7fb8', L: '#2a5f8a' },
    savanna:  { A: '#dcc46c', B: '#cdb258', C: '#eada8a', D: '#b89a44', L: '#7a5c30', G: '#9ab84a' },
    jungle:   { A: '#4f9a4c', B: '#43883f', C: '#66b257', D: '#35722f', L: '#4a3a26', G: '#8fd060' },
    desert:   { A: '#dd8f56', B: '#cf7f48', C: '#eda872', D: '#b86a38', L: '#7a4226', G: '#8a8a70' },
    arctic:   { A: '#eef6fb', B: '#dceaf4', C: '#ffffff', D: '#bcdcf0', L: '#7fa8c8', G: '#a8d4ee' },
    mountain: { A: '#a6aab6', B: '#969aa8', C: '#bcc0cc', D: '#7c8090', L: '#555866', G: '#8ab85a' },
    ocean:    { A: '#3f98d2', B: '#3488c2', C: '#8fd4f4', D: '#2a74ae', L: '#235c8a', G: '#f08a8a' },
    paleo:    { A: '#9c8c4a', B: '#8c7c3e', C: '#b0a05a', D: '#6e6030', L: '#4a3e22', G: '#5a9a3c' },
    mythic:   { A: '#b99ae2', B: '#a888d4', C: '#d2b8f2', D: '#8e6cc0', L: '#5a4488', G: '#fff4b0' }
  };
  function drawTile(kind, seed) {
    var hab = kind.indexOf('hab:') === 0 ? kind.slice(4) : null, name = hab || kind, pal = GROUND[name] || GROUND.grass, x, y, v, i;
    if (name === 'grass' || name === 'locked') { // neighbouring hexes get one of three close tones so the honeycomb shows
      var tone = Math.floor(seed / GRASS_VARIANTS) % 3, tp = {}, tk; for (tk in pal) tp[tk] = pal[tk];
      if (tone === 1) { tp.A = mix(pal.A, '#f4f08a', 0.1); tp.B = mix(pal.B, '#f4f08a', 0.1); tp.C = mix(pal.C, '#f4f08a', 0.1); } else if (tone === 2) { tp.A = mix(pal.A, '#2f7a4a', 0.1); tp.B = mix(pal.B, '#2f7a4a', 0.1); tp.C = mix(pal.C, '#2f7a4a', 0.1); }
      pal = tp;
    }
    var P = new Pt(pal, W + 2, H + LIP + 2, HW + 1, HH + 1), r = rng(seed * 31 + name.length * 7 + 5);
    P.key('Z', mix(pal.A, pal.D, 0.8)); P.key('H', mix(pal.A, '#ffffff', name === 'arctic' ? 0.9 : 0.3));
    function put(px, py, k, s) { if (inHex(px, py)) P.set(px, py, k, s == null ? 1 : s); }
    for (y = -HH - 1; y <= HH + LIP; y++) for (x = -HW - 1; x <= HW; x++) {
      if (inHex(x, y)) {
        v = h2(x, y, seed * 13 + 1); var k = 'A';
        if (name === 'path') { var a = ((x + 2 * y) % 12 + 12) % 12, b = ((x - 2 * y) % 12 + 12) % 12; k = (a < 1 || b < 1) ? 'B' : (v < 0.05 ? 'C' : v > 0.96 ? 'B' : 'A'); }
        else if (name === 'water' || name === 'ocean') { k = v < 0.05 ? 'B' : 'A'; }
        else if (name === 'arctic') { k = v < 0.07 ? 'B' : v > 0.95 ? 'C' : 'A'; }
        else if (name === 'desert') { k = ((y + 40 + Math.round(Math.sin((x + seed * 5) / 5) * 1.5)) % 6 === 0 && v < 0.8) ? 'C' : v < 0.06 ? 'B' : 'A'; }
        else if (name === 'mountain') { k = v < 0.1 ? 'B' : v > 0.93 ? 'C' : 'A'; }
        else k = v < 0.09 ? 'B' : v > 0.92 ? 'C' : 'A';
        P.set(x, y, k, 1);
        // every tile shows its hexagon: darker line on the lower and right edges, lighter on the upper and left ones
        if (!inHex(x, y + 1) || !inHex(x + 1, y)) P.set(x, y, 'Z', 1);
        else if (!inHex(x, y - 1) || !inHex(x - 1, y)) P.set(x, y, 'H', 1);
      } else { for (i = 1; i <= LIP; i++) if (inHex(x, y - i)) { P.set(x, y, 'L', i === 1 ? 1 : 2); break; } }
    }
    function tuft(tx, ty, k) { put(tx, ty, k); put(tx - 1, ty - 1, k); put(tx + 1, ty - 1, k); }
    function blot(cx, cy, rx, ry, k) { for (var by = -ry; by <= ry; by++) for (var bx = -rx; bx <= rx; bx++) if ((bx * bx) / (rx * rx + 0.3) + (by * by) / (ry * ry + 0.3) <= 1) put(cx + bx, cy + by, k); }
    function rp(m) { return [Math.round((r() - 0.5) * (W - 14)), Math.round((r() - 0.5) * (H - (m || 10)))]; }
    var n, p;
    if (name === 'grass') {
      var gv = ((seed | 0) % GRASS_VARIANTS + GRASS_VARIANTS) % GRASS_VARIANTS;
      for (n = 0; n < 3 + (gv % 3); n++) { p = rp(); tuft(p[0], p[1], 'D'); }
      if (gv === 1 || gv === 4) { p = rp(14); blot(p[0], p[1], 5, 2, 'B'); }
      if (gv === 2) for (n = 0; n < 3; n++) { p = rp(12); put(p[0], p[1], 'F'); put(p[0] + 1, p[1] + 1, 'D'); }
      if (gv === 3) for (n = 0; n < 3; n++) { p = rp(12); put(p[0], p[1], 'G'); put(p[0], p[1] + 1, 'D'); }
      if (gv === 5) { p = rp(14); blot(p[0], p[1], 4, 2, 'C'); p = rp(12); put(p[0], p[1], 'E'); put(p[0], p[1] + 1, 'D'); }
    } else if (name === 'locked') { for (n = 0; n < 4; n++) { p = rp(); tuft(p[0], p[1], 'D'); } for (y = -HH - 1; y <= HH; y++) for (x = -HW - 1; x <= HW; x++) if (inHex(x, y) && ((x + y * 2) % 8 + 8) % 8 === 0 && (y & 1) === 0) P.set(x, y, 'B', 1); }
    else if (name === 'path') { for (n = 0; n < 3; n++) { p = rp(); put(p[0], p[1], 'D'); put(p[0] + 1, p[1], 'C'); } }
    else if (name === 'water' || name === 'ocean') {
      for (n = 0; n < 5; n++) { p = rp(12); put(p[0], p[1], 'C'); put(p[0] + 1, p[1], 'C'); put(p[0] + 2, p[1], 'C'); put(p[0] + 3, p[1] + 1, 'C'); put(p[0] - 1, p[1] + 1, 'C'); }
      for (n = 0; n < 3; n++) { p = rp(12); put(p[0], p[1], 'D'); put(p[0] + 1, p[1], 'D'); put(p[0] + 2, p[1], 'D'); }
      if (name === 'ocean' && (seed & 1)) { p = rp(16); put(p[0], p[1], 'G'); put(p[0] + 1, p[1] - 1, 'G'); put(p[0] - 1, p[1] - 1, 'G'); put(p[0], p[1] - 2, 'G'); }
    } else if (name === 'savanna') { for (n = 0; n < 5; n++) { p = rp(); tuft(p[0], p[1], n === 0 ? 'G' : 'D'); } p = rp(14); blot(p[0], p[1], 5, 2, 'C'); }
    else if (name === 'jungle') { for (n = 0; n < 3; n++) { p = rp(14); blot(p[0], p[1], 3, 2, 'D'); put(p[0] - 1, p[1] - 1, 'B'); } for (n = 0; n < 4; n++) { p = rp(); tuft(p[0], p[1], 'G'); } }
    else if (name === 'desert') { for (n = 0; n < 3; n++) { p = rp(); put(p[0], p[1], 'D'); put(p[0] + 1, p[1], 'D'); put(p[0], p[1] - 1, 'G'); } }
    else if (name === 'arctic') { p = rp(16); blot(p[0], p[1], 6, 2, 'D'); put(p[0] - 2, p[1] - 1, 'C'); put(p[0] - 1, p[1] - 1, 'C'); for (n = 0; n < 4; n++) { p = rp(); put(p[0], p[1], 'G'); put(p[0] + 1, p[1], 'G'); } }
    else if (name === 'mountain') { for (n = 0; n < 3; n++) { p = rp(14); put(p[0], p[1], 'D'); put(p[0] + 1, p[1] + 1, 'D'); put(p[0] + 2, p[1] + 1, 'D'); put(p[0] + 3, p[1] + 2, 'D'); } p = rp(14); blot(p[0], p[1], 4, 2, 'G'); p = rp(14); blot(p[0], p[1], 2, 1, 'C'); }
    else if (name === 'paleo') { for (n = 0; n < 2; n++) { p = rp(14); blot(p[0], p[1], 4, 2, 'D'); } for (n = 0; n < 4; n++) { p = rp(); tuft(p[0], p[1], 'G'); put(p[0], p[1] - 2, 'G'); } }
    else if (name === 'mythic') { p = rp(14); blot(p[0], p[1], 5, 2, 'B'); for (n = 0; n < 5; n++) { p = rp(); put(p[0], p[1], n % 2 ? 'G' : 'F'); if (n < 2) { put(p[0] - 1, p[1], 'C'); put(p[0] + 1, p[1], 'C'); put(p[0], p[1] - 1, 'C'); put(p[0], p[1] + 1, 'C'); } } }
    var s = P.bake(null, true); s.ay -= 1; return s; // anchor = hex centre
  }
  function tile(kind, seed) {
    kind = String(kind || 'grass'); var name = kind.indexOf('hab:') === 0 ? kind.slice(4) : kind;
    if (!GROUND[name]) kind = 'grass';
    var v = (kind === 'grass' || kind === 'locked') ? GRASS_VARIANTS * 3 : 4, sd = (((seed | 0) % v) + v) % v;
    return cached('t|' + kind + '|' + sd, function () { return drawTile(kind, sd); });
  }

  // =====================================================================================================================
  // FENCES: one sprite per biome and hex edge (ZGeo.EDGES order: NE, E, SE, SW, W, NW), anchored at the hex centre.
  // sortDy is the y offset to sort by: back edges sort before anything standing in the hex, front edges after it.
  // =====================================================================================================================
  var FENCE_H = Math.round(7 * U);
  var FENCES = {
    savanna:  { type: 'rail', h: 7, P: '#9a6a3c', R: '#c08c54' },
    jungle:   { type: 'slat', h: 7, P: '#7a9a3c', R: '#c8d070', B: '#8a5a34' },
    desert:   { type: 'rope', h: 6, P: '#a8502c', R: '#ecd9a8' },
    arctic:   { type: 'wall', h: 5, P: '#8fc4e8', R: '#cfeaf8', T: '#ffffff' },
    mountain: { type: 'wall', h: 5, P: '#6e7282', R: '#9a9eac', T: '#c4c8d2' },
    ocean:    { type: 'glass', h: 6, P: '#e8eef4', R: '#a8e0f8', T: '#ffffff' },
    paleo:    { type: 'wire', h: 9, P: '#6a7280', R: '#f4c838', T: '#e04a3c' },
    mythic:   { type: 'gold', h: 7, P: '#f4c838', R: '#fbe68a', T: '#c06ae8' }
  };
  function drawFence(biome, e) {
    var st = FENCES[biome] || FENCES.savanna, h = Math.round(st.h * U), P = new Pt({ A: st.P, P: st.P, R: st.R, T: st.T || st.R, B: st.B || st.P, O: mix(st.P, '#1c1226', 0.72) }, W + 16, H + 44, HW + 8, HH + 28);
    var ca = G.CORNERS[G.EDGES[e][1]], cb = G.CORNERS[G.EDGES[e][2]], ddx = cb[0] - ca[0], ddy = cb[1] - ca[1], n = Math.max(Math.abs(ddx), Math.abs(ddy)), steep = Math.abs(ddy) > Math.abs(ddx), i;
    function col(px, base, u) { // one pixel column of a slanted run; u = 0..n-1 along the edge
      var post = u < 2 || u >= n - 2 || (st.type !== 'wall' && st.type !== 'glass' && Math.abs(u - n / 2 + 0.5) < 1), k;
      if (st.type === 'rail') { if (post) P.rect(px, base - h, 1, h + 1, 'P', 1); else { P.rect(px, base - h + 1, 1, 2, 'R', 1); P.set(px, base - h + 1, 'R', 0); P.rect(px, base - h + 5, 1, 1, 'R', 2); } if (post) P.set(px, base - h, 'R', 0); }
      else if (st.type === 'rope') { if (post) { P.rect(px, base - h, 1, h + 1, 'P', 1); P.set(px, base - h, 'P', 0); } else { var sag = Math.round(Math.sin(((u % (n / 2)) / (n / 2)) * Math.PI) * 1.2); P.set(px, base - h + 1 + sag, 'R', 1); P.set(px, base - h + 4 + sag, 'R', 2); } }
      else if (st.type === 'slat') { if (post) P.rect(px, base - h - 1, 1, h + 2, 'B', 1); else if (u % 2 === 0) { P.rect(px, base - h + (u % 4 ? 1 : 0), 1, h + 1 - (u % 4 ? 1 : 0), u % 4 ? 'P' : 'R', 1); } P.set(px, base - h + 2, 'B', post ? 0 : 1); }
      else if (st.type === 'wall') { P.rect(px, base - h, 1, h + 1, 'R', 1); P.set(px, base - h, 'T', 1); P.set(px, base, 'P', 1); if ((u % 6) === 0) P.rect(px, base - h + 1, 1, 2, 'P', 1); if ((u % 6) === 3) P.rect(px, base - h + 3, 1, 2, 'P', 1); P.set(px, base - h + 3, 'P', 1); if (post) P.set(px, base - h - 1, 'T', 1); }
      else if (st.type === 'glass') { if (post) { P.rect(px, base - h - 1, 1, h + 2, 'P', 1); } else { P.set(px, base - h, 'T', 1); P.set(px, base, 'P', 2); if (u % 2 === 0) P.set(px, base - h + 2 + (u % 4 ? 1 : 0), 'R', 1); if (u % 6 === 3) P.rect(px, base - h + 1, 1, h - 1, 'R', 1); } }
      else if (st.type === 'wire') { if (post) { P.rect(px, base - h, 1, h + 1, 'P', 1); P.set(px, base - h, 'T', 1); } else { P.set(px, base - h + 2, 'R', (u % 4 < 2) ? 1 : 3); P.set(px, base - h + 4, 'R', (u % 4 < 2) ? 3 : 1); P.set(px, base - h + 6, 'R', (u % 4 < 2) ? 1 : 3); } }
      else if (st.type === 'gold') { if (post) { P.rect(px, base - h, 1, h + 1, 'P', 1); P.set(px, base - h - 1, 'T', 1); } else { P.set(px, base - h + 1, 'R', 1); P.set(px, base - 1, 'P', 2); k = u % 4; P.set(px, base - h + 2 + (k === 0 ? 0 : k === 2 ? 2 : 1), 'P', 1); if (k === 1) P.set(px, base - h + 4, 'T', 0); } }
    }
    for (i = 0; i < n; i++) { // walk the true edge from corner to corner, one pixel step at a time, keeping just inside the hex
      var t = (i + 0.5) / n, fx = ca[0] + ddx * t, fy = ca[1] + ddy * t, len = Math.sqrt(fx * fx + fy * fy) || 1, px = Math.floor(fx - fx / len * 0.6), py = Math.floor(fy - fy / len * 0.6);
      col(px, py, i);
      if (steep && (i < 2 || i >= n - 2)) col(px + (fx > 0 ? -1 : 1), py, i); // corner posts stay two pixels wide on the steep edges
    }
    var s = P.bake(null, false); s.ay -= 1; s.sortDy = G.edgeMidY(e); s.edge = e; return s;
  }
  function fence(biome, e) { e = ((e | 0) % 6 + 6) % 6; if (!FENCES[biome]) biome = 'savanna'; return cached('f|' + biome + '|' + e, function () { return drawFence(biome, e); }); }

  // =====================================================================================================================
  // DECORATIONS, anchored at the base
  // =====================================================================================================================
  var DECOS = ['tree', 'bush', 'flowers', 'rock', 'lamp'];
  function drawDeco(kind, seed) {
    var P, r = rng(seed * 17 + kind.length), n, x, y;
    if (kind === 'tree') {
      var tv = seed % 4;
      if (tv === 2) { // pine
        P = new Pt({ A: '#3f8f52', T: '#8a5a34' }, 40, 56, 20, 46);
        P.rect(-1, -5, 3, 5, 'T', 'a'); P.rect(1, -5, 1, 5, 'T', 2);
        P.part(function () { P.poly([[-8, -5], [0, -13], [8, -5]], 'A', 'a'); }); P.part(function () { P.poly([[-7, -10], [0, -19], [7, -10]], 'A', 'a'); }); P.part(function () { P.poly([[-5, -16], [0, -25], [5, -16]], 'A', 'a'); });
        return P.bake([8, 2]);
      }
      var big = tv !== 1, col = tv === 3 ? '#4fa860' : '#5fb04a';
      P = new Pt({ A: col, B: mix(col, '#ffffa0', 0.35), T: '#8a5a34', F: '#e8503a' }, 44, 56, 22, 46);
      P.rect(-1, -7, 3, 7, 'T', 1); P.rect(1, -7, 1, 7, 'T', 2); P.set(-2, -1, 'T', 2); P.set(2, -1, 'T', 2);
      P.part(function () {
        if (big) { P.ell(-4, -13, 5, 4.5, 'A'); P.ell(5, -13, 5, 4.5, 'A'); P.ell(0, -18, 6.5, 6, 'A'); P.ell(-3, -20, 3, 2, 'B', 1); P.set(4, -16, 'B'); P.set(5, -17, 'B'); }
        else { P.ell(0, -13, 6, 6, 'A'); P.ell(-2, -16, 2.5, 1.6, 'B', 1); }
        for (n = 0; n < 5; n++) P.sh(Math.round((r() - 0.5) * 12), -10 - Math.round(r() * 3), 2);
        if (tv === 3) for (n = 0; n < 4; n++) { x = Math.round((r() - 0.5) * 14); y = -12 - Math.round(r() * 9); if (P.has(x, y)) P.set(x, y, 'F', 1); }
      });
      return P.bake([big ? 9 : 6, 2]);
    }
    if (kind === 'bush') {
      P = new Pt({ A: '#4fa648', B: '#8fd86a', F: seed % 2 ? '#f4d040' : '#f08aa8' }, 32, 28, 16, 20);
      P.ell(-3, -4, 4, 3.6, 'A'); P.ell(3, -3, 4, 3, 'A'); P.ell(0, -6, 4, 3.4, 'A'); P.set(-2, -8, 'B'); P.set(-1, -8, 'B'); P.set(-3, -6, 'B');
      if (seed % 3 !== 0) { P.set(2, -6, 'F'); P.set(-4, -3, 'F'); P.set(4, -2, 'F'); }
      return P.bake([7, 1]);
    }
    if (kind === 'flowers') {
      var fc = ['#f4d040', '#f08aa8', '#ffffff', '#e8503a', '#b88af0'];
      P = new Pt({ A: '#4fa648', B: fc[seed % 5], C: fc[(seed + 2) % 5], Y: '#f8e060' }, 32, 24, 16, 18);
      [[-5, -1], [-1, -2], [3, -1], [6, -3], [-3, -4], [1, -5]].forEach(function (p, i) { P.rect(p[0], p[1] - 1, 1, 2, 'A', 2); P.set(p[0], p[1] - 2, i % 2 ? 'B' : 'C', 1); P.set(p[0] - 1, p[1] - 2, i % 2 ? 'B' : 'C', 0); P.set(p[0], p[1] - 3, i % 2 ? 'B' : 'C', 0); P.set(p[0] + 1, p[1] - 2, 'A', 1); });
      return P.bake(null);
    }
    if (kind === 'rock') {
      P = new Pt({ A: '#a2a6b2', B: '#c8ccd6', G: '#6fb04a' }, 32, 24, 16, 18);
      if (seed % 2) { P.poly([[-6, -1], [-5, -5], [-1, -8], [4, -6], [6, -1]], 'A', 'a'); P.set(-2, -7, 'B'); P.set(-1, -7, 'B'); P.part(function () { P.poly([[2, -1], [3, -4], [6, -4], [8, -1]], 'A', 'a'); }); }
      else { P.poly([[-5, -1], [-4, -4], [0, -6], [4, -4], [5, -1]], 'A', 'a'); P.set(-1, -5, 'B'); P.set(0, -5, 'B'); }
      P.set(-6, -1, 'G'); P.set(-7, -1, 'G'); P.set(-6, -2, 'G');
      return P.bake([7, 1]);
    }
    // lamp
    P = new Pt({ A: '#4a4a5c', Y: '#fff0a0', G: '#f4c838' }, 24, 40, 12, 32);
    P.rect(-1, -2, 3, 2, 'A', 2); P.rect(0, -16, 1, 14, 'A', 1);
    P.part(function () { P.rr(-2, -21, 5, 5, 'Y', null, 1); P.rect(-2, -22, 5, 1, 'A', 1); P.set(0, -23, 'A'); P.rect(-2, -17, 5, 1, 'A', 2); P.set(0, -19, 'G'); });
    return P.bake([3, 1]);
  }
  function deco(kind, seed) { if (DECOS.indexOf(kind) < 0) kind = 'bush'; var sd = (((seed | 0) % 8) + 8) % 8; return cached('d|' + kind + '|' + sd, function () { return drawDeco(kind, sd); }); }

  // =====================================================================================================================
  // BUILDINGS: little iso objects with two visible faces, a roof and a ground shadow. Origin = hex centre.
  // Iso axes follow the hex slants (2 across : 1 down): "u" runs down-right, "v" runs down-left.
  // =====================================================================================================================
  function Bp(pal) { pal.O = pal.O || '#3a2a3a'; return new Pt(pal, 96, 112, 48, 84); }
  function scaleSprite(s, k) { // map pieces drawn for a 48 px hex are resized with crisp pixels if ZGeo is retuned
    if (k === 1) return s; var w = Math.max(1, Math.round(s.w * k)), h = Math.max(1, Math.round(s.h * k)), c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(s.c, 0, 0, w, h); return { c: c, w: w, h: h, ax: Math.round(s.ax * k), ay: Math.round(s.ay * k) };
  }
  function fin(P, rx, ry, dx, dy) { var s = P.bake(rx ? [rx, ry, null, 0.2, dx || 0, (dy || 0) + 1] : null); s.ay -= 1; return scaleSprite(s, U); }
  // a box: half sizes a (along u) and b (along v) in pixels of x, height h. a and b must both be odd or both even.
  function box(P, cx, cy, a, b, h, kL, kR, kT, sL, sR) {
    var Lx = cx - a - b, Ly = cy + (b - a) / 2, Fx = cx + a - b, Rx = cx + a + b, Ry = cy + (a - b) / 2, Bx = cx - a + b, By = cy - (a + b) / 2, i, v;
    var o = { Lx: Lx, Ly: Ly, Fx: Fx, Fy: Ly + a - 1, Rx: Rx, Ry: Ry, Bx: Bx, By: By, a: a, b: b, h: h, cx: cx, cy: cy };
    o.fl = function (u, vv, k, s) { P.set(Lx + u, Ly + (u >> 1) - vv, k, s == null ? 1 : s); };
    o.fr = function (u, vv, k, s) { var j = 2 * b - 1 - u; P.set(Fx + u, Ry + (j >> 1) - vv, k, s == null ? 2 : s); };
    o.rl = function (u0, v0, w, hh, k, s) { for (var u = u0; u < u0 + w; u++) for (var q = v0; q < v0 + hh; q++) o.fl(u, q, k, s); };
    o.rr = function (u0, v0, w, hh, k, s) { for (var u = u0; u < u0 + w; u++) for (var q = v0; q < v0 + hh; q++) o.fr(u, q, k, s); };
    o.tp = function (pu, pv, up) { return [Lx + pu + pv, Ly - h + pu / 2 - pv / 2 - (up || 0)]; };
    if (kT) P.poly([[Lx, Ly - h], [Bx, By - h], [Rx - 1, Ry - h], [Fx, Ly + a - 1 - h]], kT, 0);
    for (i = 0; i < 2 * a; i++) for (v = 0; v < h; v++) o.fl(i, v, kL, sL == null ? 1 : sL);
    for (i = 0; i < 2 * b; i++) for (v = 0; v < h; v++) o.fr(i, v, kR, sR == null ? 2 : sR);
    return o;
  }
  function hip(P, o, rh, kA, kB, ov) { // four-sided roof with its point over the middle
    ov = ov || 0; var h = o.h, A = [o.cx, o.cy - h - rh], L = [o.Lx - ov, o.Ly - h], F = [o.Fx, o.Fy - h + 1 + ov / 2], R = [o.Rx - 1 + ov, o.Ry - h], B = [o.Bx, o.By - h - ov / 2];
    P.poly([L, B, A], kA, 0); P.poly([B, R, A], kB || kA, 1); P.poly([L, F, A], kA, 1); P.poly([[F[0], F[1]], R, A], kB || kA, 2);
    o.apex = A; return A;
  }
  function gable(P, o, rh, kA, kWall, ov) { // ridge runs along u; the triangle end shows on the right face
    ov = ov || 0; var h = o.h, a = o.a, b = o.b, L = [o.Lx - ov, o.Ly - h + ov / 2], F = [o.Fx, o.Fy - h + 1 + ov], R = [o.Rx - 1, o.Ry - h], B = [o.Bx, o.By - h];
    var M1 = [o.Lx + b - ov, o.Ly - h - b / 2 - rh], M2 = [o.Fx + b, o.Fy - h + 1 - b / 2 - rh + ov / 2];
    P.poly([M1, M2, R, B], kA, 2); P.poly([F, R, M2], kWall, 2); P.poly([L, F, M2, M1], kA, 1);
    P.line(M1[0], M1[1], M2[0], M2[1], kA, 0); o.M1 = M1; o.M2 = M2;
  }
  function stripes(P, k, k2, y0, y1, w) { P.recolor(k, k2, function (x, y) { return y >= y0 && y <= y1 && (((x + 96) % (w * 2)) < w); }); }
  function cyl(P, cx, cy, rx, ry, h, kSide, kTop) { for (var v = 0; v <= h; v++) P.ell(cx, cy - v, rx, ry, kSide, v === 0 ? 2 : 1); P.ell(cx, cy - h, rx, ry, kTop, 0); }

  var BUILD = {};
  BUILD.snack = function () {
    var P = Bp({ A: '#fbf0d0', R: '#e8503a', D: '#7a5430', G: '#4a3a44', C: '#f4c838', M: '#c89858', B: '#b8844a', L: '#6ab04a' }), o = box(P, 0, 1, 9, 9, 10, 'A', 'A', 'R');
    o.rl(3, 3, 12, 5, 'G', 1); o.rl(2, 2, 14, 1, 'M', 0); o.fl(6, 4, 'C', 1); o.fl(7, 4, 'C', 1); o.fl(10, 4, 'R', 1); o.fl(13, 5, 'L', 1);
    o.rr(6, 0, 6, 7, 'D', 2); o.fr(10, 3, 'C', 1);
    for (var u = 0; u < 18; u++) { for (var v = 8; v < 11; v++) { o.fl(u, v, (u % 6) < 3 ? 'R' : 'W', 1); o.fr(u, v, (u % 6) < 3 ? 'W' : 'R', 2); } }
    for (u = 1; u < 18; u += 3) { o.fl(u, 7, (u % 6) < 3 ? 'R' : 'W', 2); o.fr(u, 7, (u % 6) < 3 ? 'W' : 'R', 2); }
    hip(P, o, 6, 'R', 'R', 2); stripes(P, 'R', 'W', -40, o.Fy - o.h - 1, 3);
    P.part(function () { P.rr(-4, o.apex[1] - 5, 9, 3, 'B', null, 1); P.rect(-4, o.apex[1] - 2, 9, 1, 'L', 1); P.rect(-4, o.apex[1] - 1, 9, 1, 'D', 1); P.rr(-4, o.apex[1], 9, 2, 'B', 2, 1); P.set(-1, o.apex[1] - 5, 'W'); P.set(2, o.apex[1] - 4, 'W'); });
    return fin(P, 19, 8, 1, 3);
  };
  BUILD.bench = function () {
    var P = Bp({ A: '#c08c54', D: '#8a5c34', G: '#5a5a6a', F: '#f08aa8', L: '#4fa648', T: '#c86a3c', Y: '#f4d040' });
    box(P, -9, 4, 1, 1, 3, 'G', 'G', 'G'); box(P, 3, 10, 1, 1, 3, 'G', 'G', 'G'); box(P, -3, 1, 1, 1, 3, 'G', 'G', 'G'); box(P, 9, 7, 1, 1, 3, 'G', 'G', 'G');
    P.part(function () { box(P, 3, 0, 7, 1, 8, 'A', 'D', 'A'); });
    P.part(function () { var s = box(P, 0, 2, 7, 3, 2, 'A', 'D', 'A'); for (var u = 3; u < 14; u += 4) { s.fl(u, 1, 'D', 1); s.fl(u, 0, 'D', 1); } });
    P.part(function () { box(P, -14, -3, 3, 3, 4, 'T', 'T', 'L'); P.ell(-14, -9, 3.5, 2.5, 'L'); P.set(-15, -10, 'F'); P.set(-13, -9, 'Y'); P.set(-12, -11, 'F'); P.set(-16, -8, 'Y'); });
    return fin(P, 15, 6, 0, 3);
  };
  BUILD.restroom = function () {
    var P = Bp({ A: '#eef4f8', T: '#6a8aa8', B: '#4a8ae0', F: '#e070b0', D: '#3a4a5a', C: '#a8d8f0', S: '#c8d4dc' }), o = box(P, 0, 1, 9, 9, 12, 'A', 'A', 'S');
    o.rl(2, 0, 5, 8, 'B', 1); o.rl(10, 0, 5, 8, 'F', 1); o.fl(4, 9, 'B', 1); o.fl(4, 10, 'B', 0); o.fl(12, 9, 'F', 1); o.fl(11, 9, 'F', 1); o.fl(13, 9, 'F', 1); o.fl(12, 10, 'F', 0); o.fl(6, 4, 'W', 1); o.fl(14, 4, 'W', 1);
    o.rr(5, 7, 8, 3, 'C', 1); o.rr(0, 0, 18, 1, 'T', 2); o.rl(0, 0, 2, 1, 'T', 1); o.rl(7, 0, 3, 1, 'T', 1); o.rl(15, 0, 3, 1, 'T', 1);
    var r = box(P, 0, 1 - 12, 10, 10, 2, 'T', 'T', 'T', 1, 2); P.poly([[r.Lx + 3, r.Ly - 2], [r.Bx, r.By - 1], [r.Rx - 4, r.Ry - 2], [r.Fx, r.Fy - 3]], 'S', 0);
    return fin(P, 20, 8, 1, 3);
  };
  BUILD.icecream = function () {
    var P = Bp({ A: '#fdf6ec', P: '#f8a8c8', K2: '#3a3a48', M: '#8a8a9a', C: '#e0b070', B: '#8ad0e8', Y: '#fff4b8', D: '#c88a4a' });
    P.rect(-8, 5, 3, 3, 'K2', 1); P.rect(5, 9, 3, 3, 'K2', 1); P.set(-7, 6, 'M'); P.set(6, 10, 'M');
    P.part(function () { var o = box(P, 0, 1, 6, 4, 7, 'A', 'A', 'P'); for (var u = 0; u < 12; u++) { o.fl(u, 5, 'P', 1); o.fl(u, 6, 'P', 1); o.fl(u, 1, 'B', 1); } for (u = 0; u < 8; u++) { o.fr(u, 5, 'P', 2); o.fr(u, 6, 'P', 2); o.fr(u, 1, 'B', 2); } o.fl(3, 3, 'B', 1); o.fl(5, 3, 'Y', 1); o.fl(7, 3, 'P', 1); });
    P.rect(0, -26, 1, 22, 'M', 1);
    P.part(function () { P.poly([[-13, -21], [0, -30], [13, -21], [9, -19], [-9, -19]], 'P', 1); P.recolor('P', 'A', function (x) { return ((x + 96) % 8) < 4; }); P.recolor('PA', 'P', function (x, y) { return false; }); for (var x = -12; x <= 12; x++) P.sh(x, -20 + (Math.abs(x) > 9 ? 0 : 1), 2); P.set(0, -31, 'M'); });
    P.part(function () { P.poly([[5, -6], [9, -6], [7, -1]], 'C', 1); P.set(6, -5, 'D'); P.set(8, -4, 'D'); P.ell(7, -8, 2.4, 2.2, 'P'); P.ell(7, -11, 1.8, 1.6, 'Y'); P.set(7, -13, 'P', 2); });
    return fin(P, 13, 5, 0, 4);
  };
  BUILD.gift = function () {
    var P = Bp({ A: '#fbe4f0', R: '#d85aa8', D: '#7a4a6a', C: '#a8e0f8', Y: '#f4c838', G: '#5cb85a', B: '#e8503a', T: '#c8a0c0' }), o = box(P, 0, 1, 9, 9, 11, 'A', 'A', 'R');
    o.rl(2, 2, 10, 6, 'C', 1); o.rl(2, 1, 10, 1, 'T', 0); o.fl(4, 3, 'B', 1); o.fl(4, 4, 'B', 1); o.fl(7, 3, 'Y', 1); o.fl(7, 4, 'G', 1); o.fl(10, 3, 'G', 1); o.fl(10, 5, 'B', 1); o.fl(10, 4, 'Y', 1); o.rl(14, 0, 3, 8, 'D', 1);
    o.rr(3, 3, 5, 5, 'C', 1); o.rr(11, 3, 5, 5, 'C', 1); o.fr(5, 4, 'Y', 1); o.fr(13, 4, 'B', 1);
    gable(P, o, 7, 'R', 'A', 2);
    P.recolor('R', 'W', function (x, y) { return (((x - 2 * y) % 8) + 8) % 8 === 0 && y < o.Fy - o.h; });
    P.part(function () { var gx = o.Fx + 6, gy = o.Fy - o.h - 5; P.rect(gx, gy, 7, 6, 'Y', 'a'); P.rect(gx + 3, gy, 1, 6, 'B', 1); P.rect(gx, gy + 2, 7, 1, 'B', 1); P.set(gx + 2, gy - 1, 'B'); P.set(gx + 4, gy - 1, 'B'); P.set(gx + 1, gy - 2, 'B'); P.set(gx + 5, gy - 2, 'B'); });
    return fin(P, 20, 8, 1, 3);
  };
  BUILD.photo = function () {
    var P = Bp({ A: '#fff4d8', B: '#4a8ae0', G: '#6ab04a', Y: '#f4c838', K2: '#5c5c72', M: '#8a8a9a', R: '#e8503a', T: '#b8844a', S: '#8ad0e8', F: '#e3ac7c' });
    P.part(function () { // painted board with a face hole
      var o = box(P, -4, -2, 11, 1, 17, 'S', 'T', 'T');
      for (var u = 0; u < 22; u++) { for (var v = 0; v < 5; v++) o.fl(u, v, 'G', 1); o.fl(u, 5, 'G', 0); }
      o.rl(8, 3, 7, 7, 'Y', 1); o.rl(9, 10, 5, 5, 'Y', 1); o.rl(7, 12, 2, 3, 'Y', 2); o.rl(14, 12, 2, 3, 'Y', 2); o.rl(10, 11, 3, 3, 'K2', 1);
      o.fl(9, 5, 'T', 1); o.fl(12, 7, 'T', 1); o.fl(10, 8, 'T', 1); o.fl(13, 4, 'T', 1);
      o.fl(3, 13, 'W', 1); o.fl(4, 13, 'W', 1); o.fl(5, 14, 'W', 1); o.fl(18, 12, 'W', 1); o.fl(19, 13, 'W', 1); o.fl(3, 9, 'R', 1); o.fl(18, 7, 'R', 1);
    });
    P.part(function () { P.line(9, 12, 12, 2, 'M', 1); P.line(17, 10, 13, 2, 'M', 1); P.line(13, 13, 13, 2, 'M', 2); P.rr(9, -3, 8, 5, 'K2', null, 1); P.ell(11, -1, 1.6, 1.6, 'S', 1); P.set(11, -1, 'W'); P.rect(14, -4, 2, 1, 'R', 1); P.set(15, -2, 'Y'); });
    return fin(P, 17, 6, 0, 5);
  };
  BUILD.kiosk = function () {
    var P = Bp({ A: '#4a8ae0', Y: '#f4c838', D: '#2a4a8a', T: '#b8844a', C: '#fff4d8', R: '#e8503a', G: '#5cb85a' }), o = box(P, 0, 2, 6, 6, 14, 'A', 'A', 'Y');
    o.rl(3, 9, 6, 1, 'W', 1); o.rl(4, 3, 4, 5, 'W', 1); o.rl(5, 10, 2, 2, 'W', 1); o.rl(3, 3, 6, 1, 'W', 1); o.rl(3, 7, 3, 1, 'W', 1);
    o.rr(2, 2, 8, 7, 'C', 1); o.rr(3, 6, 2, 2, 'R', 1); o.rr(6, 6, 2, 2, 'G', 1); o.rr(3, 3, 2, 2, 'Y', 1); o.rr(6, 3, 2, 2, 'R', 1); o.rr(0, 0, 12, 1, 'D', 2); o.rl(0, 0, 12, 1, 'D', 1);
    hip(P, o, 7, 'Y', 'Y', 3); P.set(0, o.apex[1] - 1, 'R'); P.set(0, o.apex[1] - 2, 'R');
    return fin(P, 14, 6, 1, 3);
  };
  BUILD.fountain = function (fr) {
    var P = Bp({ A: '#c8ccd6', B: '#4aa3d8', C: '#a8e0f8', S: '#9a9eac' });
    P.part(function () { cyl(P, 0, 3, 17, 8, 4, 'A', 'A'); P.ell(0, -1, 14, 6, 'B', 1); P.ell(-3, -2, 6, 2, 'C', 1); });
    P.part(function () { cyl(P, 0, -1, 2.4, 1.4, 8, 'S', 'A'); cyl(P, 0, -9, 6, 2.6, 2, 'A', 'B'); cyl(P, 0, -11, 1.4, 1, 4, 'S', 'A'); });
    var k = fr % 2;
    P.part(function () {
      P.rect(0, -21 + k, 1, 5 - k, 'C', 1); P.set(-1, -19 + k, 'W'); P.set(1, -20 + k, 'W'); P.set(0, -22 + k, 'W');
      [[-6, -7], [6, -7], [-8, -5 + k], [8, -5 + k], [-5, -4], [5, -4]].forEach(function (p, i) { P.set(p[0], p[1], i % 2 ? 'C' : 'W'); });
      [[-10, 0], [9, 1], [-4, 3], [5, -3], [-12, -2 + k], [12, -1 - k]].forEach(function (p, i) { P.set(p[0], p[1] - k, 'W'); P.set(p[0] + 1, p[1] - k, 'C'); });
    }, true);
    return fin(P, 19, 8, 0, 4);
  };
  BUILD.cafe = function () {
    var P = Bp({ A: '#fbf0d8', R: '#8a5a3c', D: '#6e4226', C: '#a8e0f8', G: '#4f9a54', T: '#b8844a', Y: '#f4c838', M: '#c8ccd6', B: '#e8503a' }), o = box(P, 0, 1, 10, 10, 13, 'A', 'A', 'R');
    o.rl(2, 3, 11, 6, 'C', 1); o.rl(2, 2, 11, 1, 'T', 0); o.rl(7, 3, 1, 6, 'T', 1); o.rl(15, 0, 4, 9, 'D', 1); o.fl(16, 4, 'Y', 1);
    o.rr(3, 3, 6, 6, 'C', 1); o.rr(12, 3, 6, 6, 'C', 1); o.rr(3, 2, 6, 1, 'T', 2); o.rr(12, 2, 6, 1, 'T', 2);
    for (var u = 0; u < 20; u++) for (var v = 10; v < 13; v++) o.fl(u, v, (u % 6) < 3 ? 'G' : 'W', 1);
    for (u = 1; u < 20; u += 3) o.fl(u, 9, (u % 6) < 3 ? 'G' : 'W', 2);
    gable(P, o, 8, 'R', 'A', 2);
    P.recolor('R', 'D', function (x, y) { return (((x + 2 * y) % 6) + 6) % 6 === 0 && y < o.Fy - o.h; });
    P.part(function () { var c = box(P, -6, -22, 2, 2, 7, 'B', 'B', 'D'); P.set(-6, -32, 'M'); P.set(-5, -34, 'M'); P.set(-6, -36, 'W'); });
    P.part(function () { var gx = o.Fx + 7, gy = o.Fy - o.h - 7; P.rr(gx, gy, 6, 5, 'W', null, 1); P.rect(gx + 6, gy + 1, 2, 1, 'W', 1); P.rect(gx + 7, gy + 2, 1, 1, 'W', 1); P.rect(gx + 6, gy + 3, 2, 1, 'W', 1); P.rect(gx + 1, gy, 4, 1, 'D', 1); P.set(gx + 2, gy - 2, 'M'); P.set(gx + 3, gy - 3, 'M'); });
    return fin(P, 22, 9, 1, 3);
  };
  BUILD.playground = function () {
    var P = Bp({ A: '#e8503a', B: '#4a8ae0', Y: '#f4c838', G: '#5cb85a', M: '#8a8a9a', S: '#f0dc98', T: '#b8844a', D: '#c8a860' });
    P.part(function () { P.poly([[-4, 6], [8, 12], [20, 6], [8, 0]], 'S', 1); P.line(-4, 6, 8, 12, 'T', 1); P.line(8, 12, 20, 6, 'T', 2); P.set(6, 6, 'D'); P.set(11, 8, 'D'); P.set(9, 4, 'D'); P.rect(13, 4, 2, 2, 'B', 1); P.set(13, 3, 'A'); }, true);
    P.part(function () { P.rect(-16, -12, 1, 14, 'M', 1); P.rect(-4, -6, 1, 14, 'M', 1); P.rect(-10, -9, 1, 14, 'M', 2); P.rect(2, -3, 1, 8, 'M', 2); });
    P.part(function () { var o = box(P, -7, -9, 5, 5, 2, 'Y', 'Y', 'T'); for (var u = 0; u < 10; u += 2) { o.fl(u, 4, 'B', 1); o.fl(u, 3, 'B', 1); o.fl(u, 2, 'B', 1); } for (u = 0; u < 10; u++) o.fl(u, 5, 'B', 0); });
    P.part(function () { P.poly([[-2, -8], [4, -11], [16, 4], [10, 7]], 'A', 1); P.line(-2, -8, 10, 7, 'A', 2); P.line(4, -11, 16, 4, 'A', 0); P.line(0, -8, 12, 6, 'Y', 1); });
    P.part(function () { var o = box(P, -7, -22, 6, 6, 1, 'G', 'G', 'G'); hip(P, o, 6, 'G', 'G', 0); P.rect(-7, o.apex[1] - 3, 1, 3, 'M', 1); P.poly([[-6, o.apex[1] - 3], [-2, o.apex[1] - 2], [-6, o.apex[1] - 1]], 'A', 1); });
    P.part(function () { P.rect(-17, -22, 1, 12, 'M', 1); P.rect(-3, -15, 1, 10, 'M', 1); P.rect(3, -18, 1, 8, 'M', 2); }, true);
    return fin(P, 20, 8, 1, 4);
  };
  BUILD.vet = function () {
    var P = Bp({ A: '#fbfbf6', T: '#3ab0a0', D: '#2a7a70', C: '#a8e0f8', R: '#e8503a', S: '#dfe6e6', M: '#8a8a9a' }), o = box(P, 0, 1, 10, 9, 12, 'A', 'A', 'S');
    o.rl(0, 9, 20, 2, 'T', 1); o.rr(0, 9, 18, 2, 'T', 2); o.rl(0, 0, 20, 1, 'T', 2); o.rr(0, 0, 18, 1, 'D', 2);
    o.rl(3, 0, 5, 7, 'D', 1); o.rl(4, 1, 3, 5, 'C', 1); o.rl(11, 3, 6, 4, 'C', 1); o.rl(13, 3, 1, 4, 'A', 1);
    o.rr(3, 3, 5, 4, 'C', 1); o.rr(11, 3, 5, 4, 'C', 1);
    var r = box(P, 0, 1 - 12, 11, 10, 2, 'T', 'T', 'T', 1, 2); P.poly([[r.Lx + 3, r.Ly - 2], [r.Bx, r.By - 1], [r.Rx - 4, r.Ry - 2], [r.Fx, r.Fy - 3]], 'S', 0);
    P.part(function () { var s = box(P, 3, -13, 6, 1, 10, 'W', 'S', 'S'); s.rl(4, 2, 4, 6, 'T', 1); s.rl(2, 4, 8, 2, 'T', 1); });
    return fin(P, 21, 8, 1, 3);
  };
  BUILD.lab = function () {
    var P = Bp({ A: '#dfe4ee', T: '#5a6a9a', D: '#3a466e', C: '#6ad0f0', G: '#6ad84a', S: '#c4cad8', M: '#8a8a9a', R: '#e8503a', E: '#f4f6fa' }), o = box(P, 0, 1, 10, 9, 12, 'A', 'A', 'S');
    o.rl(2, 6, 16, 3, 'D', 1); o.rl(3, 7, 4, 1, 'C', 1); o.rl(8, 7, 4, 1, 'C', 1); o.rl(13, 7, 4, 1, 'C', 1); o.rr(2, 6, 14, 3, 'D', 2); o.rr(3, 7, 5, 1, 'C', 2); o.rr(10, 7, 5, 1, 'C', 2);
    o.rl(13, 0, 4, 5, 'T', 1); o.rl(0, 0, 13, 1, 'T', 2); o.rr(0, 0, 18, 1, 'T', 2);
    o.rl(4, 2, 5, 1, 'G', 1); o.rl(5, 3, 3, 1, 'G', 1); o.rl(6, 4, 1, 2, 'E', 1); o.fl(5, 2, 'G', 0);
    var r = box(P, 0, 1 - 12, 11, 10, 1, 'T', 'T', 'S', 1, 2);
    P.part(function () { P.ell(-4, -15, 7, 4, 'T', 2); P.ell(-4, -17, 6.5, 5, 'E'); P.rect(-5, -22, 2, 6, 'D', 1); P.set(-4, -23, 'D'); });
    P.part(function () { P.rect(10, -24, 1, 12, 'M', 1); P.set(10, -25, 'R'); P.line(8, -20, 12, -22, 'M', 1); });
    return fin(P, 21, 8, 1, 3);
  };
  BUILD.deck = function () {
    var P = Bp({ A: '#e0b478', D: '#7a5230', T: '#b07c44', M: '#5a5a6a', C: '#a8e0f8', R: '#e8503a', E: '#fbf2dc', F: '#d8ccb0' });
    P.part(function () { box(P, -13, 1, 1, 1, 8, 'D', 'D', 'D'); box(P, 0, 8, 1, 1, 8, 'D', 'D', 'D'); box(P, 13, 1, 1, 1, 8, 'D', 'D', 'D'); P.line(-12, 3, -1, 1, 'D', 2); P.line(1, 1, 12, 3, 'D', 2); }, true);
    P.part(function () { var s = box(P, 13, 9, 3, 2, 2, 'T', 'D', 'A'); box(P, 11, 6, 3, 2, 5, 'T', 'D', 'A'); });
    P.part(function () {
      var o = box(P, 0, -7, 9, 9, 2, 'T', 'D', 'A'), u;
      for (u = 5; u < 18; u += 6) P.line(o.Lx + u + 1, o.Ly - 2 + u / 2 - 1, o.Lx + u + 15, o.Ly - 2 + u / 2 - 8, 'A', 2);
    });
    P.part(function () {
      var by = -9, u; // railing around the top
      P.line(-18, by - 5, 0, by - 14, 'F', 1); P.line(0, by - 14, 17, by - 5, 'F', 1); P.rect(0, by - 14, 1, 5, 'F', 1);
      for (u = 0; u <= 18; u += 9) { P.rect(-18 + u, by - 5 + u / 2, 1, 5, 'E', 1); if (u < 12) P.rect(17 - u, by - 5 + u / 2, 1, 5, 'E', 1); }
      P.line(-18, by - 5, 0, by + 4, 'E', 1); P.line(0, by + 4, 8, by, 'E', 1); P.rect(0, by + 4, 1, 5, 'E', 1); P.rect(17, by - 5, 1, 5, 'E', 1);
    });
    P.part(function () { P.rect(-4, -22, 1, 8, 'M', 1); P.rr(-6, -25, 6, 3, 'M', null, 1); P.set(-1, -24, 'C'); P.set(-6, -24, 'R'); });
    return fin(P, 20, 8, 1, 4);
  };
  BUILD.gate = function () {
    var P = Bp({ A: '#e8dcc0', S: '#c4b490', Y: '#f4c838', R: '#d8404a', B: '#4a8ae0', D: '#8a7a5a', G: '#fbe68a' });
    function tower(cx, cy) { var o = box(P, cx, cy, 4, 4, 24, 'A', 'A', 'S'); for (var v = 4; v < 24; v += 5) { o.rl(0, v, 8, 1, 'S', 1); o.rr(0, v, 8, 1, 'S', 2); } o.rl(3, 14, 2, 4, 'B', 1); o.rr(3, 14, 2, 4, 'B', 2); var c = box(P, cx, cy - 24, 5, 5, 2, 'Y', 'Y', 'Y'); hip(P, c, 8, 'Y', 'Y', 0); P.rect(cx, c.apex[1] - 6, 1, 6, 'D', 1); P.poly([[cx + 1, c.apex[1] - 6], [cx + 6, c.apex[1] - 4], [cx + 1, c.apex[1] - 2]], 'R', 1); return o; }
    P.part(function () { tower(-12, -3); });
    P.part(function () { var o = box(P, 0, -15, 8, 2, 7, 'R', 'R', 'Y'); o.rl(0, 5, 16, 2, 'Y', 1); o.rl(0, 0, 16, 1, 'Y', 2); o.rl(6, 2, 4, 3, 'G', 1); o.fl(7, 3, 'Y', 2); o.fl(8, 3, 'Y', 2); for (var u = 1; u < 16; u += 4) { if (u < 5 || u > 10) o.fl(u, 3, 'G', 1); } });
    P.part(function () { tower(12, 9); });
    return fin(P, 22, 8, 1, 6);
  };
  BUILD.center = function () {
    var P = Bp({ A: '#e8f4e0', T: '#3f9a5c', D: '#2a6a40', C: '#8fe0f0', E: '#d8f8ff', S: '#cfe4c8', G: '#6ad84a', Y: '#f4c838', B: '#4aa3d8' }), o = box(P, 0, 2, 11, 11, 12, 'A', 'A', 'S');
    o.rl(0, 10, 22, 2, 'T', 1); o.rr(0, 10, 22, 2, 'T', 2); o.rl(0, 0, 22, 1, 'D', 1); o.rr(0, 0, 22, 1, 'D', 2);
    o.rl(2, 2, 6, 6, 'C', 1); o.rl(4, 2, 1, 6, 'A', 1); o.rl(14, 2, 6, 6, 'C', 1); o.rl(16, 2, 1, 6, 'A', 1); o.rl(9, 0, 4, 8, 'D', 1); o.rl(10, 1, 2, 6, 'C', 1);
    o.rr(2, 2, 18, 6, 'C', 2); for (var u = 5; u < 20; u += 5) o.rr(u, 2, 1, 6, 'A', 2);
    var r = box(P, 0, 2 - 12, 12, 12, 1, 'T', 'T', 'S', 1, 2);
    P.part(function () { P.ell(0, -13, 11, 5.5, 'T', 2); P.ell(0, -17, 10, 8, 'C'); P.ell(-3, -20, 4, 2.5, 'E', 1); for (var x = -8; x <= 8; x += 4) P.line(x, -11, x * 0.4, -25, 'E', 1); P.line(-10, -16, 10, -16, 'E', 1); P.rect(0, -30, 1, 5, 'D', 1); P.poly([[1, -30], [6, -28], [1, -26]], 'G', 1); });
    P.part(function () { P.ell(-17, -1, 2.5, 3, 'G'); P.ell(17, 9, 2.5, 3, 'G'); P.rect(-17, 2, 1, 2, 'D', 1); P.rect(17, 12, 1, 2, 'D', 1); });
    return fin(P, 24, 10, 1, 3);
  };
  BUILD.pavilion = function () {
    var P = Bp({ A: '#f8f4ec', S: '#d8d0c0', R: '#8a4ad0', D: '#5a2a9a', Y: '#f4c838', G: '#fbe68a', C: '#d8404a', E: '#b88af0' });
    P.part(function () { var o = box(P, 0, 2, 10, 10, 3, 'A', 'S', 'A', 1, 1); o.rl(7, 0, 6, 3, 'C', 1); o.rl(0, 2, 22, 1, 'G', 1); o.rr(0, 2, 22, 1, 'Y', 1); P.poly([[o.Lx + 8, o.Ly - 3 + 4], [o.Lx + 14, o.Ly - 3 + 7], [o.cx + 3, o.cy - 3], [o.cx - 3, o.cy - 6]], 'C', 0); });
    P.part(function () { [[-16, 1], [-8, 5], [0, 9], [8, 5], [16, 1]].forEach(function (c) { P.rect(c[0] - 1, c[1] - 16, 3, 14, 'A', 'a'); P.rect(c[0] + 1, c[1] - 16, 1, 14, 'S', 1); P.rect(c[0] - 2, c[1] - 3, 5, 1, 'G', 1); P.rect(c[0] - 2, c[1] - 16, 5, 1, 'G', 1); }); });
    P.part(function () { P.ell(0, -9, 15, 5, 'D', 2); P.ell(0, -8, 9, 3, 'D', 3); }, true);
    P.part(function () {
      cyl(P, 0, -13, 19, 8, 2, 'Y', 'Y'); P.ell(0, -21, 14, 10, 'R'); P.recolor('R', 'E', function (x, y) { return Math.abs(x) % 8 === 3 && y < -16; });
      P.recolor('RE', 'R', function (x, y) { return y > -14; }); for (var x = -18; x <= 18; x += 3) P.set(x, -12 + Math.round(7 * Math.sqrt(Math.max(0, 1 - (x * x) / 361))), 'G', 1);
      P.ell(0, -32, 3, 2.4, 'Y'); P.rect(0, -39, 1, 5, 'Y', 1); P.poly([[1, -39], [6, -37], [1, -35]], 'C', 1); P.set(0, -40, 'G');
    });
    return fin(P, 24, 10, 1, 3);
  };
  BUILD['?'] = function () { var P = Bp({ A: '#d8c8b8', R: '#a88a6a', D: '#6e4a2c' }), o = box(P, 0, 1, 8, 8, 9, 'A', 'A', 'R'); o.rl(6, 0, 4, 6, 'D', 1); hip(P, o, 5, 'R', 'R', 2); return fin(P, 17, 7, 1, 3); };

  function building(id, opt) {
    if (!BUILD[id]) id = '?';
    var fr = id === 'fountain' ? ((opt && opt.frame) | 0) & 1 : 0;
    return cached('b|' + id + '|' + fr, function () { return BUILD[id](fr); });
  }
  var BUILDING_FRAMES = { fountain: 2 };
  // the zoo entrance: two pillars and an arch across one hex. sortDy puts it in front of whoever walks through.
  function entrance() {
    return cached('entrance', function () {
      var P = Bp({ A: '#f4e8cc', S: '#d0bc94', G: '#3f9a5c', D: '#2a6a40', Y: '#f4c838', R: '#e8503a', B: '#4a8ae0', M: '#8a7450', L: '#fbe68a' });
      function pillar(cx) { var o = box(P, cx, 3, 3, 3, 22, 'A', 'A', 'S'); for (var v = 5; v < 22; v += 6) { o.rl(0, v, 6, 1, 'S', 1); o.rr(0, v, 6, 1, 'S', 2); } o.rl(0, 0, 6, 2, 'M', 1); o.rr(0, 0, 6, 2, 'M', 2); var c = box(P, cx, 3 - 22, 4, 4, 2, 'G', 'G', 'G'); hip(P, c, 5, 'G', 'G', 0); P.rect(cx, c.apex[1] - 6, 1, 6, 'M', 1); P.poly([[cx + 1, c.apex[1] - 6], [cx + 6, c.apex[1] - 4], [cx + 1, c.apex[1] - 2]], cx < 0 ? 'R' : 'B', 1); }
      P.part(function () { pillar(-HW + 4); }); P.part(function () { pillar(HW - 5); });
      P.part(function () {
        var x0 = -HW + 6, x1 = HW - 6, x, y;
        for (x = x0; x <= x1; x++) { var t = (x - x0) / (x1 - x0), arc = Math.round(Math.sin(t * Math.PI) * 7); for (y = 0; y < 8; y++) P.set(x, -24 - arc + y, y === 0 ? 'Y' : y === 7 ? 'D' : 'G', y === 7 ? 1 : (y < 3 ? 1 : 1)); }
        // paw emblem in the middle of the arch
        P.rr(-4, -33, 9, 9, 'L', null, 3); P.rr(-2, -28, 5, 3, 'M', 1, 1); P.set(-2, -30, 'M'); P.set(0, -31, 'M'); P.set(2, -30, 'M');
        P.set(-14, -28, 'Y'); P.set(-11, -29, 'L'); P.set(-17, -26, 'L'); P.set(14, -28, 'Y'); P.set(11, -29, 'L'); P.set(17, -26, 'L');
      });
      var s = fin(P, 24, 5, 0, 5); s.sortDy = HH; return s;
    });
  }

  // =====================================================================================================================
  // ICONS: small hand-drawn pixel pictures (rows of palette letters), outlined so they read on any background.
  // On-floor markers are white round badges with a symbol; menu icons are a little larger.
  // =====================================================================================================================
  var IC = { R: '#e8503a', P: '#f0689a', B: '#4a8ae0', G: '#5cb85a', Y: '#f8cc30', O: '#f08a2c', T: '#b8844a', M: '#a8acb8', C: '#bfeaf8', S: '#f4c8a0', L: '#9aa4b8', D: '#d89a1c', Q: '#fff2a8', V: '#8a5ad8', E: '#e8e8f0' };
  function badge(sym, bg) { return { badge: bg || 'W', rows: sym }; }
  var ICON_DEFS = {
    'ready-event': badge(['KRRR.', 'KRRRR', 'KRRR.', 'K....', 'K....']),
    'ready-breed': badge(['.P.P.', 'PPPPP', 'PPPPP', '.PPP.', '..P..']),
    'busy':        badge(['BBBBB', '.BQB.', '..B..', '.BQB.', 'BBBBB']),
    'sick':        badge(['..G..', '..G..', 'GGGGG', '..G..', '..G..']),
    'choice':      badge(['..K..', '..K..', '..K..', '.....', '..K..'], 'Y'),
    'star':  { rows: ['....Y....', '...YQY...', '...YQY...', 'YYYYQYYYY', '.YYQYYYY.', '..YYYYY..', '..YYYYY..', '.YYY.YYY.', '.YY...YY.'] },
    'flame': { rows: ['....R....', '...RR....', '...RRR...', '..RROR.R.', '.RROORRR.', '.RROYORR.', '.ROYYYOR.', '.ROYQYOR.', '..OOYOO..'] },
    'coin':  { rows: ['..YYYYY..', '.YQQYYYD.', 'YQYYDYYYD', 'YQYDDDYYD', 'YQYYDYYYD', 'YYYDDDYYD', 'YYYYDYYDD', '.YYYYYDD.', '..DDDDD..'] },
    'rp':    { rows: ['...EEE...', '....C....', '....C....', '...CCC...', '..CCCCC..', '..BBBBB..', '.BBWBBBB.', '.BBBBWBB.', '..BBBBB..'] },
    'heart': { rows: ['.RR...RR.', 'RRRR.RRRR', 'RWRRRRRRR', 'RRRRRRRRR', '.RRRRRRR.', '..RRRRR..', '...RRR...', '....R....'] },
    'rep':   { rows: ['..BB.BB..', '..BB.BB..', '...BBB...', '..YYYYY..', '.YYQYYYD.', '.YQYYYYD.', '.YYYYYDD.', '..YDDDD..'] },
    'm-projects': { rows: ['....MMMMM....', '..TTMMMMMTT..', '..TWWWWWWWT..', '..TWGWLLLWT..', '..TWWWWWWWT..', '..TWGWLLLWT..', '..TWWWWWWWT..', '..TWRWLLLWT..', '..TWWWWWWWT..', '..TTTTTTTTT..'] },
    'm-build':    { rows: ['.........MM..', '.......MMMMM.', '......MMMMMMM', '.....MMMMMM..', '......MMMM...', '.....TTTM....', '....TTT......', '...TTT.......', '..TTT........', '.TTT.........', 'TTT..........'] },
    'm-animals':  { rows: ['...TT...TT...', '..TTTT.TTTT..', '..TTTT.TTTT..', 'TT.TT...TT.TT', 'TTT.......TTT', 'TTT.TTTTT.TTT', '.T.TTTTTTT.T.', '..TTTTTTTTT..', '..TTTTTTTTT..', '..TTTT.TTTT..', '...TT...TT...'] },
    'm-staff':    { rows: ['....GGGGG....', '...GGGGGGG...', '...GGGGGGGGG.', '...SSSSSSS...', '...SKSSSKS...', '...SSSSSSS...', '....SSSSS....', '..BBBBBBBBB..', '.BBBBBBBBBBB.', '.BBBBWBWBBBB.', '.BBBBBBBBBBB.'] },
    'm-research': { rows: ['....EEEEE....', '.....CCC.....', '.....CCC.....', '.....CCC.....', '....CCCCC....', '...CCBBBCC...', '..CBBBBBBBC..', '..BBBWBBBBB..', '.BBBBBBBWBBB.', '.BBBBBBBBBBB.', '..BBBBBBBBB..'] },
    'm-info':     { rows: ['.BBBBB.BBBBB.', 'BWWWWWBWWWWWB', 'BWLLLWBWLLLWB', 'BWWWWWBWWWWWB', 'BWLLLWBWLLLWB', 'BWWWWWBWWWWWB', 'BWLLLWBWLLLWB', 'BWWWWWBWWWWWB', 'BBBBBBBBBBBBB', '.....BBB.....'] },
    'm-system':   { rows: ['.....MMM.....', '..MM.MMM.MM..', '.MMMMMMMMMMM.', '.MMMMMMMMMMM.', '..MMM...MMM..', 'MMMM.....MMMM', 'MMMM.....MMMM', 'MMMM.....MMMM', '..MMM...MMM..', '.MMMMMMMMMMM.', '.MMMMMMMMMMM.', '..MM.MMM.MM..', '.....MMM.....'] }
  };
  // ---- symbols that replace words in the menus: animal stats, staff skills, and small markers ----
  (function () {
    var more = { p: '#fbb4d2', b: '#a8d0fa', U: '#27a898', u: '#8fe0d2', I: '#cfd4de', i: '#f4f6fa', J: '#8f96a8', Z: '#cf8a4c', z: '#f0b880', X: '#7a5230', F: '#fff2c8', v: '#c0a4f4', g: '#3f8f45', H: '#f0a020', A: '#f08a2c', a: '#f8b860', e: '#9aa0b0', m: '#e8894a', n: '#fcc49a', o: '#b85c2a' }, k;
    for (k in more) IC[k] = more[k];
    function sub(rows, map) { return rows.map(function (r) { return r.replace(/[adh]/g, function (c) { return map[c]; }); }); }
    var MEDAL = ['..RRWBB..', '..RRWBB..', '..RRWBB..', '..aaaaa..', '.aahhaaa.', 'aahaaaaad', 'aahaaaaad', 'aaaaaaadd', '.aaaaadd.', '..adddd..'];
    var LET = { S: ['WWWWW', 'W....', 'WWWWW', '....W', 'WWWWW'], A: ['.WWW.', 'W...W', 'WWWWW', 'W...W', 'W...W'], B: ['WWWW.', 'W...W', 'WWWW.', 'W...W', 'WWWW.'], C: ['.WWWW', 'W....', 'W....', 'W....', '.WWWW'], D: ['WWWW.', 'W...W', 'W...W', 'W...W', 'WWWW.'],
      SS: ['WWW.WWW', 'W...W..', 'WWW.WWW', '..W...W', 'WWW.WWW'] };
    function rosette(col, dark, letter, ink) { // round ribbon badge; the colour carries the rank, the letter is a bonus
      var base = ['...aaaaa...', '..aaaaaaa..', '.aaaaaaaaa.', '.aaaaaaaaa.', '.aaaaaaaaa.', '.aaaaaaaaa.', '.aaaaaaaaa.', '..aaaaaaa..', '...aaaaa...', '..dd...dd..', '..dd...dd..', '..d.....d..'];
      var rows = sub(base, { a: col, d: dark, h: col }).map(function (r) { return r.split(''); }), L = LET[letter], x0 = Math.floor((11 - L[0].length) / 2);
      L.forEach(function (lr, j) { for (var i = 0; i < lr.length; i++) if (lr.charAt(i) !== '.') rows[2 + j][x0 + i] = ink || 'W'; });
      return { rows: rows.map(function (r) { return r.join(''); }), flat: true };
    }
    var add = {
      'stat-charm': { rows: ['.....P.....', '.....P.....', '....PpP....', '...PpWpP...', 'PPPpWWWpPPP', '...PpWpP...', '....PpP....', '.....P.....', '.....P...P.', '........PpP', '.........P.'], flat: true },
      'stat-vigor': { rows: ['.....QYYY', '....QYYY.', '...QYYY..', '..QYYY...', '.QYYYYYYH', '....YYYH.', '...YYYH..', '..YYYH...', '.YYH.....', '.YH......', 'YH.......'], flat: true },
      'stat-wit':   { rows: ['...BBBBB...', '..BBbbBBB..', '.BBbWbBBBB.', '.BBbBBBBBB.', '.BBBQBQBBB.', '.BBBQQQBBB.', '..BBBQBBB..', '...BBQBB...', '...eeeee...', '...JJJJJ...', '....eee....'], flat: true },
      'skill-care': { rows: ['..GG.GG..', '..GG.GG..', 'GG.....GG', 'GG.GGG.GG', '..GGGGG..', '.GGGGGGG.', '.GGGGGGG.', '..GG.GG..'] },
      'skill-sci':  { rows: ['.CC..CC..CC.', '.CC..CC..CC.', '.CC..CC..CC.', 'TTTTTTTTTTTT', '.UU..CC..UU.', '.UU..uu..UU.', '.UU..uu..UU.', '.UU..uu..UU.', 'TTTTTTTTTTTT', 'X..........X'], flat: true },
      'skill-exp':  { rows: ['...DDDDD...', '..DFFFFFD..', '.DFFFFRFFD.', 'DFFFFRRFFFD', 'DFFFRRFFFFD', 'DFFFFKFFFFD', 'DFFFFBBFFFD', 'DFFFBBFFFFD', '.DFFBFFFFD.', '..DFFFFFD..', '...DDDDD...'], flat: true },
      'skill-charm': { rows: ['.....VVVV..', '....VvVvVV.', '...VvVvVVVV', '...VVvVVVVV', '...VVVVVVVV', '....VVVVVV.', '...JJVVVV..', '..JJJ......', '.JJJ.......', 'JJJ........'], flat: true },
      'sex-m': { rows: ['.....BBBB', '.......BB', '......B.B', '.BBBBB..B', 'BB...BB..', 'B.....B..', 'B.....B..', 'BB...BB..', '.BBBBB...'], flat: true },
      'sex-f': { rows: ['.PPPPP.', 'PP...PP', 'P.....P', 'P.....P', 'PP...PP', '.PPPPP.', '...P...', '.PPPPP.', '...P...', '...P...'], flat: true },
      'juv':   { rows: ['...FFF...', '..FFFFF..', '.FFiFFFF.', '.FFFFFFF.', 'FFFFFFFFF', 'FaFFFaFFF', 'aFaFaFaFa', 'FFFaFFFaF', '.FFFFFFF.', '..FFFFF..'] },
      'time':  { rows: ['...BBBBB...', '..BWWWWWB..', '.BWWWKWWWB.', 'BWWWWKWWWWB', 'BWWWWKWWWWB', 'BWWWWKKKWWB', 'BWWWWWWWWWB', 'BWWWWWWWWWB', '.BWWWWWWWB.', '..BWWWWWB..', '...BBBBB...'], flat: true },
      'visitors': { rows: ['..TTTTT..', '.TTTTTTT.', '.TSSSSSS.', '.SSKSSKS.', '.SSSSSSS.', '..SSSSS..', '.RRRRRRR.', 'SRRRRRRRS', '.RRRRRRR.', '..BB.BB..', '..BB.BB..'], flat: true },
      'odds':  { rows: ['.iiiiiiiii.', 'iiiiiiiiiii', 'iiKiiiiiKii', 'iiiiiiiiiii', 'iiiiiiiiiii', 'iiiiiKiiiii', 'iiiiiiiiiii', 'iiiiiiiiiii', 'iiKiiiiiKii', 'IIIIIIIIIII', '.IIIIIIIII.'], flat: true },
      'lock':  { rows: ['...eeeee...', '..ee...ee..', '..e.....e..', '..e.....e..', '.YYYYYYYYY.', '.YQYYYYYYY.', '.YYYYKYYYY.', '.YYYYKYYYY.', '.YYYYYYYYY.', '.DDDDDDDDD.'], flat: true },
      'new':   { rows: ['..R..R..R..', '..RR.R.RR..', 'R..RRRRR..R', '.RRRYYYRRR.', '..RYYQYYR..', 'RRRYQQQYRRR', '..RYYQYYR..', '.RRRYYYRRR.', 'R..RRRRR..R', '..RR.R.RR..', '..R..R..R..'], flat: true },
      'ok':    { rows: ['.........GG', '........GGG', '.......GGG.', 'GG....GGG..', 'GGG..GGG...', '.GGGGGG....', '..GGGG.....', '...GG......'] },
      'no':    { rows: ['RR.....RR', 'RRR...RRR', '.RRR.RRR.', '..RRRRR..', '...RRR...', '..RRRRR..', '.RRR.RRR.', 'RRR...RRR', 'RR.....RR'] },
      'habitat': { rows: ['z....z....z', 'T....T....T', 'TzzzzTzzzzT', 'TTTTTTTTTTT', 'T....T....T', 'TzzzzTzzzzT', 'TTTTTTTTTTT', 'T....T....T', 'X....X....X'], flat: true },
      'pen':   { rows: ['zzzzzzzzzzz', 'zTTTTTTTTTz', 'zTXFFFFFXTz', 'zTFXFFFXFTz', 'zTFFXFXFFTz', 'zTFFFXFFFTz', 'zTFFXFXFFTz', 'zTFXFFFXFTz', 'zTXFFFFFXTz', 'XTTTTTTTTTX', 'XXXXXXXXXXX'], flat: true },
      'land':  { rows: ['.zzzzzzzzz.', '.zFFFFFFFzT', '.zFGGGGGFzT', '.zFFFFFFFzT', '.zTTTTTTTTT', '.....X.....', '.....X.....', '.....X.....', '.g...X..g..', 'gGg..X.gGg.'], flat: true },
      'trophy': { rows: ['.YYYYYYYYY.', 'YYQYYYYYYYY', 'Y.YQYYYYY.Y', 'Y.YQYYYYY.Y', '.YYYYYYYYY.', '...YYYYY...', '....YYY....', '.....D.....', '.....D.....', '...DDDDD...', '..DDDDDDD..'], flat: true },
      'medal-gold':   { rows: sub(MEDAL, { a: 'Y', h: 'Q', d: 'D' }), flat: true },
      'medal-silver': { rows: sub(MEDAL, { a: 'I', h: 'i', d: 'J' }), flat: true },
      'medal-bronze': { rows: sub(MEDAL, { a: 'm', h: 'n', d: 'o' }), flat: true },
      'grade-ss': rosette('Y', 'R', 'SS', 'X'), 'grade-s': rosette('R', 'Y', 'S'), 'grade-a': rosette('A', 'R', 'A'),
      'grade-b': rosette('G', 'g', 'B'), 'grade-c': rosette('B', 'L', 'C'), 'grade-d': rosette('J', 'e', 'D')
    };
    for (k in add) ICON_DEFS[k] = add[k];
    ICON_DEFS['cost-rp'] = ICON_DEFS.rp;
  })();
  var ICONS = Object.keys(ICON_DEFS);
  function drawIcon(name) {
    var d = ICON_DEFS[name], P = new Pt(IC, 32, 32, 16, 24), rows, w, h, y, x;
    P.out = INK;
    if (!d) { P.ell(0, -4, 3, 3, 'L'); P.set(0, -5, 'W'); return P.bake(null); }
    rows = d.rows; h = rows.length; w = rows[0].length;
    if (d.badge) { P.ell(0, -5, 4, 4, d.badge, 1); for (x = -3; x <= 3; x++) if (P.has(x, -1)) P.sh(x, -1, 2); for (x = -4; x <= 4; x++) if (P.has(x, -2) && !P.has(x, -1)) P.sh(x, -2, 2); P.stamp(-2, -7, rows); return P.bake(null); }
    P.stamp(-Math.floor(w / 2), -h, rows);
    // a darker bottom edge on each colour gives the icons a little depth
    for (y = -h; y < 0; y++) for (x = -8; x <= 8; x++) if (!d.flat && P.has(x, y) && !P.has(x, y + 1) && P.kat(x, y) !== 'W' && P.kat(x, y) !== 'K') P.sh(x, y, 2);
    return P.bake(null);
  }
  function icon(name) { return cached('i|' + name, function () { return drawIcon(name); }); }

  // named colours the page can reuse for menus, so the interface matches the floor
  var PALETTE = {
    ink: INK, outline: INK, paper: '#fff8e6', panel: '#fbeccb', panelEdge: '#d9bf8a', panelDark: '#b8975c', shade: '#2a1d3399',
    text: '#3a2a33', textSoft: '#7a6a66', white: '#ffffff', accent: '#e8503a', accentDark: '#b8382a', blue: '#4a8ae0', blueDark: '#2f5fb0',
    good: '#5cb85a', goodDark: '#3f8f45', bad: '#d8404a', gold: '#f8cc30', goldDark: '#d89a1c', pink: '#f0689a', purple: '#8a5ad8',
    grass: GROUND.grass.A, grassDark: GROUND.grass.D, path: GROUND.path.A, water: GROUND.water.A, wood: '#b8844a', woodDark: '#8a5c34', sky: '#8fd0f0', night: '#2f6d8e',
    rp: '#4a8ae0', money: '#f8cc30', rep: '#f0689a', star: '#f8cc30', flame: '#f08a2c',
    biome: { savanna: GROUND.savanna.A, jungle: GROUND.jungle.A, desert: GROUND.desert.A, arctic: GROUND.arctic.D, mountain: GROUND.mountain.A, ocean: GROUND.ocean.A, paleo: GROUND.paleo.A, mythic: GROUND.mythic.A },
    rarity: ['#a8acb8', '#a8acb8', '#5cb85a', '#4a8ae0', '#8a5ad8', '#f08a2c', '#e8503a']
  };

  // =====================================================================================================================
  // PUBLIC API
  // =====================================================================================================================
  var ANIMAL_FRAMES = 4, PERSON_FRAMES = 4;
  function getFlip(key, flip, fn) { var s = cached(key, fn); if (!flip) return s; return cached(key + '|f', function () { return flipSprite(s); }); }

  function drawAnimal(id, variant, juv, fr) {
    var sp = SP[id], pal = {}, k;
    for (k in sp.pal) pal[k] = sp.pal[k];
    if (juv && sp.opt.jpal) for (k in sp.opt.jpal) pal[k] = sp.opt.jpal[k];
    if (variant && sp.vpal) for (k in sp.vpal) pal[k] = sp.vpal[k];
    var P = new Pt(pal, 104, 92, 52, 76), o = { juv: juv, fr: fr, variant: variant, id: id };
    sp.draw(P, o);
    if (sp.opt.shadow) return P.bake(sp.opt.shadow(o));
    var x0 = 999, x1 = -999, x, y, pass, yA = sp.opt.water ? -40 : -4;
    for (pass = 0; pass < 2 && x1 < x0; pass++, yA = -60) for (y = yA; y <= -1; y++) for (x = -50; x < 50; x++) if (P.has(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    if (x1 < x0) { x0 = -3; x1 = 3; }
    var rx = Math.max(3, Math.round((x1 - x0) / 2) + 1), dx = Math.round((x0 + x1) / 2);
    if (sp.opt.water) return P.bake([Math.max(3, rx - 2), 2, [14, 52, 110], 0.26, dx, 1]);
    return P.bake([rx, rx > 5 ? 2 : 1, null, 0.24, dx, 0]);
  }
  function animal(id, opt) {
    opt = opt || {}; if (!SP[id]) id = '?';
    var fr = (((opt.frame | 0) % ANIMAL_FRAMES) + ANIMAL_FRAMES) % ANIMAL_FRAMES, v = opt.variant ? 1 : 0, j = opt.juv ? 1 : 0;
    if (fr === 2 && !SP[id].opt.fr2) fr = 0;
    return getFlip('a|' + id + '|' + v + j + fr, opt.flip, function () { return drawAnimal(id, !!v, !!j, fr); });
  }

  var URLS = {};
  function url(s, scale) {
    scale = Math.max(1, Math.round(scale || 3)); if (!s || !s.c) s = blank();
    if (!s._id) s._id = 'u' + (url.n = (url.n || 0) + 1);
    var key = s._id + 'x' + scale; if (URLS[key]) return URLS[key];
    var c = document.createElement('canvas'); c.width = s.w * scale; c.height = s.h * scale;
    var g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(s.c, 0, 0, c.width, c.height);
    return (URLS[key] = c.toDataURL('image/png'));
  }

  var inited = false;
  function init() {
    if (inited) return; inited = true;
    var i, j, f, ids;
    BIOME_IDS.forEach(function (b) { tile('hab:' + b); for (i = 0; i < 6; i++) fence(b, i); });
    for (i = 0; i < GRASS_VARIANTS; i++) tile('grass', i);
    ['path', 'locked', 'water'].forEach(function (k) { tile(k); });
    (D.FAC_ORDER || []).forEach(function (id) { building(id); });
    entrance(); ICONS.forEach(function (n) { icon(n); });
    ids = (D.SPECIES_LIST || []).map(function (s) { return s.id; });
    for (i = 0; i < ids.length; i++) for (f = 0; f < ANIMAL_FRAMES; f++) animal(ids[i], { frame: f });
  }

  var ZS = {
    init: init, ANIMAL_FRAMES: ANIMAL_FRAMES, PERSON_FRAMES: PERSON_FRAMES,
    animal: animal, person: person, tile: tile, fence: fence, building: building, entrance: entrance, deco: deco, icon: icon,
    url: url,
    animalUrl: function (id, opt, scale) { return url(animal(id, opt), scale); },
    personUrl: function (kind, opt, scale) { return url(person(kind, opt), scale); },
    iconUrl: function (name, scale) { return url(icon(name), scale); },
    buildingUrl: function (id, scale) { return url(building(id), scale); },
    tileUrl: function (kind, scale) { return url(tile(kind), scale); },
    ICONS: ICONS, PERSON_KINDS: PERSON_KINDS, DECOS: DECOS, BUILDING_FRAMES: BUILDING_FRAMES, VISITOR_SEEDS: VISITOR_SEEDS, GRASS_VARIANTS: GRASS_VARIANTS, PALETTE: PALETTE,
    FENCE_H: FENCE_H, hasAnimal: function (id) { return !!SP[id] && id !== '?'; }, isWater: function (id) { return !!(SP[id] && SP[id].opt.water); },
    _mix: mix
  };
  root.ZSprites = ZS;
})(typeof window !== 'undefined' ? window : this);
