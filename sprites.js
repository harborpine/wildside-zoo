/* Wildside Zoo: every sprite in the game, made in code (no image files). Owned by the Artist. Exposes window.ZSprites.
   How it works: each sprite is painted with a tiny pixel "painter" (ellipses, rounded boxes, polygons, lines) using palette
   roles, each role having four shades (light, mid, dark, line). Parts are layered with a soft dark seam between them, then the
   whole silhouette gets a dark outline and a ground shadow. Results are baked to small offscreen canvases once and cached,
   with mirrored copies made on demand. All sizes for map pieces come from ZGeo. See docs/API-artist.md. */
(function (root) {
  'use strict';
  var G = root.ZGeo, D = root.ZD || {};
  var W = G.W, HH = G.HH, SH = G.SH, HW = W / 2, RS = G.RS;
  var U = W / 48; // unit scale: map pieces were tuned for a 48 px wide hex and stretch with ZGeo

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
    var nbx = x0 + li, nfx = x1 - lw + 1 - li;
    var m = { x0: x0, x1: x1, yt: yt, yb: yb, hx: hx, hy: hy, hw: hw, hh: hh, len: len, bh: bh, leg: leg, lw: lw, j: j, f: f, sg: sg, nbx: nbx, nfx: nfx };
    m.earX = hx - Math.round(hw / 4); m.earTop = hy - Math.floor((hh - 1) / 2);
    function legf(x, dx, far) {
      var top = yb - 1, bot = -1 - (dx > 0 ? 1 : 0), mid = Math.round((top + bot) / 2), s = far ? 2 : 1, kx = Math.abs(dx) > 1 ? (dx > 0 ? 1 : -1) : 0;
      P.rect(x + kx, top, lw, mid - top + 1, lk, s); P.rect(x + dx, mid + 1, lw, bot - mid, lk, s);
      if (p.foot) P.rect(x + dx, bot - (p.footH || 1) + 1, lw + (p.footW || 0), p.footH || 1, p.foot, s);
      if (p.legFx) p.legFx(P, x + dx, top, bot, far);
    }
    if (!p.noFar) P.part(function () { legf(nbx + fo, sg * st, true); legf(nfx - fo, -sg * st, true); }, true);
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
    P.part(function () { lg(0, -sg * 3, 2); }, true);
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
    P.part(function () { var e = p.earS || [4, 5]; P.ell(hx - r - 1 + (p.earX || 0), hy + (p.earY || 0), j ? e[0] * 0.75 : e[0], j ? e[1] * 0.75 : e[1], 'E'); });
    P.set(hx + 1, hy - 2, 'K'); P.set(hx + 1, hy - 1, 'K');
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
  def('hyena', { A: '#cdaa72', C: '#4b3b37' }, { A: '#f1e8d6', C: '#948a80' }, function (P, o) {
    var m = quad(P, o, { len: 13, bh: 7, leg: 6, lw: 2, head: [8, 7], hd: [2, -2], nw: 5, snout: [4, 4, 1], snoutK: 'C', ear: ['round', 2, 'A', 'C'], tail: ['bush', 5, 'C', 3], tailY: 3, nose: 0,
      back: function (P, m) { for (var x = m.x1 - 7; x <= m.x1; x++) P.rect(x, m.yt - 2 - (x & 1), 1, 3, 'C', 1); },
      body: function (P, m) { P.ell(m.x1 - 3, m.yt + 1, 4, 2.5, 'A'); P.clr(m.x0, m.yt); P.clr(m.x0 + 1, m.yt); P.clr(m.x0, m.yt + 1); P.clr(m.x0 + 2, m.yt); } });
    spots(P, 'A', 'C', m.x0, m.yt, m.x1 - 1, m.yb - 1, 0.2, 7);
    P.recolor('A', 'C', function (x, y) { return y > -3; });
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
  def('elephant', { A: '#9ea4b2', E: '#878da0', C: '#5d6170', T: '#fff6dc' }, { A: '#f2b8c4', E: '#e29aac', C: '#b56a80' }, function (P, o) {
    trunked(P, o, { len: 15, bh: 11, leg: 5, head: [10, 10], hd: [0, 1], earS: [4, 5.5],
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
  def('capybara', { A: '#a9794c', C: '#6e4a2c' }, { A: '#eedcb4', C: '#c9ae80' }, function (P, o) {
    var m = quad(P, o, { len: 14, bh: 9, leg: 3, lw: 3, head: [8, 8], hs: 'box', hr: 2, hd: [3, 0], snout: [3, 7, 0], ear: ['round', 1, 'C'], eye: [0, -2], nose: 2, stride: 1, br: 3 });
    P.set(m.sx - 1, m.sy1 - 1, 'C', 2); P.set(m.sx, m.sy1 - 1, 'C', 2);
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
  def('spidermonkey', { A: '#302b35', F: '#d8ae8a' }, { A: '#f1ece0', F: '#e8b9a0' }, function (P, o) {
    sitter(P, o, { bw: 6, bh: 8, head: [7, 7], ho: 2, arm: [7, 2, 'A', 1], foot: [3, 2, 'A'], bob: 1,
      back: function (P, m) { var u = m.sg; P.path([[m.bx + 1, -2], [m.bx - 3, -3], [m.bx - 5, -7], [m.bx - 5, -12 + u], [m.bx - 3, -14 + u], [m.bx - 2, -12 + u]], 'A', 2, 1); },
      face: function (P, m) { P.recolor('A', 'F', function (x, y) { return Math.abs(x - m.hx - 0.5) <= 2 && y >= m.hy - 1 && y <= m.hy + 2; }); } });
  });
  def('sloth', { A: '#a39072', F: '#f2e6c8', C: '#5a4636', T: '#ece4d0' }, { A: '#e8c860', F: '#fff4cc', C: '#9a7424' }, function (P, o) {
    var m = sitter(P, o, { bw: 9, bh: 8, head: [9, 7], ho: 2, hx: 0, arm: [8, 3, 'A', 0, 'T'], foot: [3, 2, 'A'], eye: [-2, 2, 0, 1], br: 3,
      face: function (P, m) { P.recolor('A', 'F', function (x, y) { return Math.abs(x - m.hx) <= 3 && y >= m.hy - 1 && y <= m.hy + 2; }); } });
    P.set(m.e0 - 1, m.ey + 1, 'C'); P.set(m.e1 + 1, m.ey + 1, 'C'); P.set(m.e0 - 1, m.ey, 'C'); P.set(m.e1 + 1, m.ey, 'C'); P.set(m.hx, m.hy + 1, 'N'); P.set(m.hx - 1, m.hy + 2, 'C'); P.set(m.hx + 1, m.hy + 2, 'C');
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
  def('emu', { A: '#6f5b4a', C: '#4d3d32', B: '#7d9dbc', L: '#5a5560', Y: '#3c3640' }, { A: '#f1ede4', C: '#d4cdc0', B: '#c9d8e6' }, function (P, o) {
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
  def('wombat', { A: '#8d7b6d', C: '#5e4f46' }, { A: '#e8c66c', C: '#b08a3a' }, function (P, o) {
    quad(P, o, { len: 14, bh: 10, leg: 2, lw: 3, head: [9, 8], hs: 'box', hr: 3, hd: [1, 2], snout: [2, 4, 2], ear: ['round', 1, 'C'], bs: 'ell', nose: 2, stride: 1, legK: 'C', legIn: 2 });
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
      back: function (P, m) { var u = m.sg; P.poly([[m.x0 + 2, m.yt], [m.x0 - 6, m.yb - 1 + u], [m.x0 - 11, -1 - (u > 0 ? 1 : 0)], [m.x0 - 6, m.yb + 1 + u], [m.x0 + 2, m.yb]], 'A', 'a'); } });
    spots(P, 'A', 'C', -40, -30, 30, 0, 0.18, 21);
    P.recolor('A', 'B', function (x, y) { return y === m.yb && x > m.x0; });
    P.path([[m.sx + 1, m.sy0 + 1], [m.sx + 3, m.sy0 + 1]], 'Y', 1); P.set(m.sx + 4, m.sy0, 'Y'); P.set(m.sx + 4, m.sy0 + 2, 'Y');
  });
  def('platypus', { A: '#7b5338', C: '#5a3a26', L: '#4e5662', F: '#c98a3c' }, { A: '#f0e6e0', C: '#d8c8c0', L: '#8a90a0', F: '#e8b890' }, function (P, o) {
    var m = quad(P, o, { len: 13, bh: 6, leg: 1, lw: 3, head: [7, 6], hd: [2, 1], eye: [1, -1, 1], stride: 1, legK: 'F', bs: 'ell', noFar: 1, legIn: 2,
      back: function (P, m) { P.ell(m.x0 - 2, m.yb - 1, 3.6, 1.7, 'C'); } });
    P.part(function () { P.rr(m.hx + 2, m.hy, o.juv ? 4 : 6, 3, 'L', null, 1); });
    P.set(m.hx + 4, m.hy, 'K');
  });

  function antler(P, x, y, s, k) { P.path([[x, y], [x - 1, y - 4], [x - 3, y - 7]], k || 'T', s, 1); P.path([[x - 1, y - 3], [x + 2, y - 6]], k || 'T', s, 1); P.path([[x - 2, y - 6], [x - 1, y - 9]], k || 'T', s, 1); P.path([[x, y - 1], [x + 3, y - 3]], k || 'T', s, 1); }
  function hareBody(P, o, horns) {
    var m = quad(P, o, { len: 9, bh: 7, leg: 2, lw: 3, head: [7, 6], hd: [1, -2], snout: [2, 3, 1], ear: ['long', 6, 'A', 'C'], tail: ['stub', 3, 'W'], bs: 'ell', stride: 1, noFar: 1, legIn: 0, tailY: 4,
      body: function (P, m) { P.ell(m.x0 + 3, m.yb - 2, 3.4, 3.4, 'A'); },
      pre: function (P, m) { if (horns && !o.juv) antler(P, m.hx + 3, m.hy - 2, 2, 'H'); } });
    if (horns) P.part(function () { if (o.juv) { P.set(m.hx + 2, m.hy - 3, 'H'); } else antler(P, m.hx + 1, m.hy - 2, 1, 'H'); });
    return m;
  }

  // ---------- polar ----------
  def('hare', { A: '#f5f3ef', C: '#2d2733' }, { A: '#a4b8d4', C: '#3a4660' }, function (P, o) { hareBody(P, o, false); });
  def('reindeer', { A: '#8b6b54', B: '#ece4d6', T: '#dccca8', C: '#4e3a2e' }, { A: '#f6f3ec', B: '#ffffff', T: '#e8d8b0', C: '#b8ae9c' }, function (P, o) {
    var j = o.juv, m = quad(P, o, { len: 14, bh: 8, leg: 7, lw: 2, head: [7, 6], hd: [3, -3], nw: 5, neckK: 'B', snout: [4, 4, 1], ear: ['point', 1], tail: ['stub', 2, 'B'], foot: 'C',
      pre: function (P, m) { if (!j) antler(P, m.hx + 2, m.hy - 2, 2); } });
    P.part(function () { if (j) P.rect(m.hx, m.hy - 4, 1, 2, 'T', 1); else antler(P, m.hx, m.hy - 2, 1); });
    P.recolor('A', 'B', function (x, y) { return y === m.yb && x > m.x0 + 1 && x < m.x1 - 1; });
  });
  def('owl', { A: '#f6f4f0', C: '#8b8896', Y: '#f4c020' }, { A: '#cfd4dc', C: '#6a7080' }, function (P, o) {
    var m = sitter(P, o, { bw: 9, bh: 9, head: [10, 8], ho: 3, hx: 0, foot: [3, 1, 'Y'], eye: [-2, 2, 0, 0], br: 3,
      body: function (P, m) { P.recolor('A', 'C', function (x, y) { return (((x + y * 2) % 4) + 4) % 4 === 0 && (y & 1) === 0; }); P.recolor('A', 'C', function (x) { return x <= m.bx || x >= m.bx + m.bw - 1; }); } });
    P.rect(m.hx - 3, m.hy - 1, 2, 2, 'Y', 1); P.set(m.hx - 2, m.hy, 'K'); P.rect(m.hx + 2, m.hy - 1, 2, 2, 'Y', 1); P.set(m.hx + 2, m.hy, 'K'); P.set(m.hx, m.hy + 1, 'N'); P.set(m.hx, m.hy + 2, 'N');
    P.set(m.hx - 2, m.hy - 3, 'C'); P.set(m.hx + 1, m.hy - 3, 'C');
  });
  def('arcticfox', { A: '#f7f6f3', C: '#c9d2e0' }, { A: '#8390a8', C: '#5a6680' }, function (P, o) {
    quad(P, o, { len: 11, bh: 6, leg: 3, lw: 2, head: [8, 7], hd: [1, -1], snout: [3, 3, 2], ear: ['point', 2, 'A', 'C'], tail: ['bush', 8, 'A', 5], tailY: 2, stride: 1, br: 2 });
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
  def('polarbear', { A: '#f8f5ec', C: '#d9d4c4' }, { A: '#f2dca4', C: '#d0b478' }, function (P, o) {
    quad(P, o, { len: 16, bh: 10, leg: 4, lw: 4, head: [8, 7], hd: [4, 2], nw: 7, snout: [4, 4, 1], ear: ['round', 1], tail: ['stub', 2], nose: 2, stride: 1, br: 3 });
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
      pre: function (P, m) { if (!j) P.path([[m.hx + 2, m.hy - 4], [m.hx + 4, m.hy - 7], [m.hx + 3, m.hy - 9]], 'T', 2, 2); } });
    P.part(function () { for (var x = m.x0 + 1; x <= m.x1 - 1; x++) P.rect(x, m.yb, 1, (j ? 2 : 3) + (h2(x, 1, 3) < 0.5 ? 1 : 0), 'A', 2); }, true);
    P.part(function () { if (j) P.set(m.hx - 1, m.hy - 5, 'T'); else P.path([[m.hx - 1, m.hy - 4], [m.hx - 3, m.hy - 7], [m.hx - 2, m.hy - 9]], 'T', 1, 2); });
    for (var x = m.hx - 3; x <= m.hx + 1; x += 2) P.set(x, m.hy - 4, 'C');
  });
  def('takin', { A: '#dca83e', C: '#5b3e2b', T: '#3a2c28' }, { A: '#f8e07e', C: '#a87a3a' }, function (P, o) {
    var j = o.juv, m = quad(P, o, { len: 14, bh: 9, leg: 5, lw: 3, head: [8, 8], hd: [2, 0], snout: [4, 6, 1], snoutK: 'C', ear: ['point', 1], tail: ['stub', 2], legK: 'C', nose: 0, stride: 1,
      back: function (P, m) { P.ell(m.x1 - 4, m.yt, 4, 2.5, 'A'); } });
    if (!j) P.part(function () { P.path([[m.hx + 1, m.hy - 4], [m.hx - 1, m.hy - 5], [m.hx - 3, m.hy - 4], [m.hx - 5, m.hy - 6]], 'T', 1, 1); P.set(m.hx, m.hy - 4, 'T'); });
    P.recolor('A', 'C', function (x, y) { return y >= m.yb - 1 && y <= m.yb && x > m.x0 + 2 && x < m.x1 - 2; });
  });
  def('redpanda', { A: '#c9562b', C: '#3b2723', D: '#f0a868' }, { A: '#f0d8a8', C: '#8a6a4a', D: '#fff4dc' }, function (P, o) {
    var m = quad(P, o, { len: 12, bh: 6, leg: 3, lw: 3, legK: 'C', head: [9, 7], hd: [1, -1], snout: [2, 3, 2], snoutK: 'W', ear: ['point', 2, 'W', 'A'], tail: ['bush', 9, 'A', 5], tailY: 2, stride: 1,
      face: function (P, m) { P.recolor('A', 'W', function (x, y) { return (x >= m.hx + 1 && y >= m.hy + 1) || (y === m.hy - 2 && x >= m.hx && x <= m.hx + 1); }); } });
    P.recolor('A', 'D', function (x, y) { return x < m.x0 - 1 && (((x % 3) + 3) % 3) === 0; });
    P.recolor('A', 'C', function (x, y) { return y === m.yb && x >= m.x0; });
  });
  def('eagle', { A: '#6c4b2f', G: '#d3a044', C: '#4b3323', Y: '#f4c020', L: '#f4c020' }, { A: '#f4f1ea', G: '#ffffff', C: '#d0c8b8' }, function (P, o) {
    var m = bird(P, o, { bw: 9, bh: 11, leg: 2, head: [7, 6], hd: [0, -3], headK: 'G', beak: [3, 4, 'Y', 1, 1], wing: [6, 9, -1, 0, 'C'], tail: [4, 4, 6, 'C'] });
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
  def('snowleopard', { A: '#dcdfe4', B: '#f8f9fa', C: '#4b4b5a' }, { A: '#9aa2b0', B: '#c8ccd6', C: '#32323e' }, function (P, o) {
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
  def('triceratops', { A: '#d9924c', F: '#c8683c', B: '#f2dcae', T: '#fff4d8', C: '#a8582c' }, { A: '#d83c44', F: '#a81c34', C: '#8a1428' }, function (P, o) {
    var j = o.juv, m = quad(P, o, { len: 16, bh: 10, leg: 4, lw: 4, head: [8, 8], hs: 'box', hr: 2, hd: [4, 3], snout: [4, 5, 2], nose: 0, stride: 1, br: 3,
      back: function (P, m) { P.poly([[m.x0 + 2, m.yt + 2], [m.x0 - 7, m.yb - 1], [m.x0 + 2, m.yb]], 'A', 'a'); },
      pre: function (P, m) { P.part(function () { var fr = j ? 0.7 : 1; P.ell(m.hx - 3, m.hy - 2, 3.5 * fr, 6 * fr, 'F'); for (var a = 0; a < 7; a++) { var t = 1.7 + a * 0.5; P.set(m.hx - 3 + Math.cos(t) * 3.6 * fr, m.hy - 2 - Math.sin(t) * 6 * fr, 'B', 1); } }); } });
    P.set(m.sx, m.sy1, 'B'); P.set(m.sx, m.sy1 - 1, 'B');
    P.part(function () {
      if (j) { P.set(m.hx + 1, m.hy - 4, 'T'); return; }
      P.poly([[m.hx, m.hy - 3], [m.hx + 5, m.hy - 8], [m.hx + 2, m.hy - 3]], 'T', 1); P.poly([[m.sx - 2, m.sy0], [m.sx, m.sy0 - 3], [m.sx, m.sy0]], 'T', 1);
    });
    P.recolor('A', 'B', function (x, y) { return y === m.yb && x > m.x0 + 1 && x < m.x1; });
  });
  def('raptor', { A: '#5aa48c', B: '#f0e4b8', C: '#2f6a5a', R: '#5aa48c', T: '#fff4d8' }, { A: '#3a66c8', C: '#1c2f7a', R: '#f04a3c' }, function (P, o) {
    biped(P, o, { len: 11, bh: 6, leg: 6, lw: 2, head: [8, 5], hd: [3, -5], nw: 3, tail: [11, -2, 'A'], belly: true, arm: [3, 2, 0, 1, 1], claw: 'T', footL: 4, footK: 'C',
      body: function (P, m) { P.recolor('A', 'C', function (x, y) { return y < m.cy && ((x + 40) % 3 === 0); }); },
      face: function (P, m) { P.recolor('A', 'B', function (x, y) { return y >= m.hy + 1 && x > m.hx - 1; }); P.set(m.hx + 2, m.hy + 1, 'W'); },
      post: function (P, m) { if (o.variant) { P.path([[m.hx - 3, m.hy - 3], [m.hx - 1, m.hy - 4], [m.hx - 5, m.hy - 5]], 'R', 1, 1); P.rect(Math.round(m.rx) - 1, Math.round(m.cy) + 1, 3, 2, 'R', 1); P.rect(Math.round(-m.rx) - 11, Math.round(m.cy) - 4, 3, 3, 'R', 1); } } });
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
        P.poly([[m.x0 + 2, m.yt + 2], [m.x0 - 8, m.yb - 2 + u], [m.x0 - 11, m.yb - 5 + u], [m.x0 - 8, m.yb + u], [m.x0 + 2, m.yb]], 'A', 'a');
        P.poly([[m.x0 - 10, m.yb - 8 + u], [m.x0 - 14, m.yb - 6 + u], [m.x0 - 10, m.yb - 3 + u]], 'D', 1);
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

  // TEMPORARY STUBS (removed once the real parts exist)
  var BIOME_IDS = ['savanna', 'jungle', 'desert', 'arctic', 'mountain', 'ocean', 'paleo', 'mythic'];
  var GRASS_VARIANTS = 1, ICONS = [], PERSON_KINDS = [], DECOS = [], PALETTE = {}, FENCE_H = 8;
  function person() { return cached('blank', blank); }
  function tile() { return cached('blank', blank); }
  function fence() { return cached('blank', blank); }
  function building() { return cached('blank', blank); }
  function entrance() { return cached('blank', blank); }
  function deco() { return cached('blank', blank); }
  function icon() { return cached('blank', blank); }

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
    (D.BIOME_ORDER || BIOME_IDS).forEach(function (b) { tile('hab:' + b); for (i = 0; i < 6; i++) fence(b, i); });
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
    ICONS: ICONS, PERSON_KINDS: PERSON_KINDS, DECOS: DECOS, GRASS_VARIANTS: GRASS_VARIANTS, PALETTE: PALETTE,
    FENCE_H: FENCE_H, hasAnimal: function (id) { return !!SP[id] && id !== '?'; }, isWater: function (id) { return !!(SP[id] && SP[id].opt.water); },
    _mix: mix
  };
  root.ZSprites = ZS;
})(typeof window !== 'undefined' ? window : this);
