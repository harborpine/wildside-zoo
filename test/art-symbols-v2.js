/* Artist, Update 7 item B1: SAMPLE drawings of the new flat symbols (style "v2"). NOT used by the game.
   Browser script: defines window.ZSymV2 = { LIST, HOSTING, draw(id) -> canvas, grid(id) }.
   Style rules: flat and front-on, no bevels, no lighting, bold 2-pixel dark outline, solid pixels only (alpha is 0 or 255).
   Each symbol is drawn on a 20 x 20 box of fine pixels (the same pixel size as today's density-2 icons: 1 fine pixel = 1 CSS px
   in the menus), then outlined. Ink ('K') pixels are detail lines: they are never themselves outlined, so they stay thin. */
(function (root) {
  'use strict';
  var INK = '#2a1d33';
  var C = { K: INK, W: '#ffffff', P: '#f0689a', p: '#fbb4d2', Y: '#f8cc30', Q: '#fff2a8', O: '#f08a2c', D: '#d89a1c', N: '#8a5a10',
    B: '#4a8ae0', b: '#a8d0fa', C: '#bfeaf8', G: '#5cb85a', g: '#3f8f45', U: '#27a898', u: '#8fe0d2', T: '#b8844a', X: '#7a5230',
    z: '#f0b880', R: '#e8503a', V: '#8a5ad8', v: '#c0a4f4', y: '#5a3a9a', S: '#f4c8a0', H: '#f8c84a', M: '#a8acb8', E: '#e8e8f0', J: '#6a7088', F: '#fff2c8',
    L: '#4a4060' };
  var N = 32, OFF = 6; // working grid with room for the outline
  function Grid() { this.d = new Array(N * N).fill(null); }
  Grid.prototype = {
    set: function (x, y, c) { x = Math.round(x) + OFF; y = Math.round(y) + OFF; if (x < 0 || y < 0 || x >= N || y >= N) return; this.d[y * N + x] = c; },
    get: function (x, y) { x += OFF; y += OFF; if (x < 0 || y < 0 || x >= N || y >= N) return null; return this.d[y * N + x]; },
    r: function (x, y, w, h, c) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c); return this; },
    // filled ellipse; centre may be a half pixel (cx 9.5 = between pixels 9 and 10)
    e: function (cx, cy, rx, ry, c) { for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { var dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1.0001) this.set(x, y, c); } return this; },
    // filled polygon, tested at pixel centres; points are in pixel-edge coordinates (pixel x covers x..x+1)
    p: function (pts, c) { var ys = pts.map(function (q) { return q[1]; }), xs = pts.map(function (q) { return q[0]; });
      for (var y = Math.floor(Math.min.apply(0, ys)); y <= Math.ceil(Math.max.apply(0, ys)); y++) for (var x = Math.floor(Math.min.apply(0, xs)); x <= Math.ceil(Math.max.apply(0, xs)); x++) {
        var px = x + 0.5, py = y + 0.5, inside = false;
        for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) { var a = pts[i], b = pts[j]; if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; }
        if (inside) this.set(x, y, c); } return this; },
    l: function (x0, y0, x1, y1, c) { var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (var i = 0; i <= n; i++) this.set(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c); return this; },
    // rows of palette letters; '.' leaves the pixel alone, '_' clears it
    s: function (x, y, rows) { for (var j = 0; j < rows.length; j++) for (var i = 0; i < rows[j].length; i++) { var ch = rows[j].charAt(i); if (ch === '.') continue; this.set(x + i, y + j, ch === '_' ? null : ch); } return this; },
    // the bold dark outline: two rings around every coloured (non-ink) pixel
    outline: function () { for (var pass = 0; pass < 2; pass++) { var add = [], x, y; for (y = 0; y < N; y++) for (x = 0; x < N; x++) { if (this.d[y * N + x]) continue;
          var hit = false; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { var xx = x + o[0], yy = y + o[1]; if (xx < 0 || yy < 0 || xx >= N || yy >= N) return; var v = this.d[yy * N + xx]; if (v && (pass === 0 ? v !== 'K' && v !== 'k' : v === 'o')) hit = true; }, this);
          if (hit) add.push(y * N + x); }
        add.forEach(function (i) { this.d[i] = pass === 0 ? 'o' : 'O2'; }, this); }
      for (var i = 0; i < this.d.length; i++) if (this.d[i] === 'o' || this.d[i] === 'O2' || this.d[i] === 'k') this.d[i] = 'K'; return this; }
  };
  function star(g, cx, cy, R, c) { for (var y = -R; y <= R; y++) for (var x = -R; x <= R; x++) if (Math.pow(Math.abs(x), 0.62) + Math.pow(Math.abs(y), 0.62) <= Math.pow(R, 0.62) + 0.001) g.set(cx + x, cy + y, c); }

  var DEFS = {
    // CHARM: a big pink four-point sparkle with a lighter inner sparkle and white heart, plus a small companion sparkle
    'stat-charm': function (g) { star(g, 8, 8, 8, 'P'); star(g, 8, 8, 5, 'p'); star(g, 8, 8, 2, 'W'); star(g, 16, 16, 3, 'P'); g.set(16, 16, 'W'); },
    // ENERGY: a fat yellow lightning bolt with an orange core stripe
    'stat-vigor': function (g) { g.p([[10, 0], [17, 0], [12, 7], [18, 7], [5, 20], [8, 11], [2, 11]], 'Y'); g.l(12, 2, 8, 8, 'O'); g.l(13, 2, 9, 8, 'O'); g.l(9, 9, 13, 9, 'O'); g.l(12, 10, 9, 15, 'O'); g.l(13, 10, 10, 15, 'O'); },
    // SMARTS: a front-on lightbulb, blue glass with a yellow glowing centre and filament, striped screw base, ink rays
    'stat-wit': function (g) { g.e(9.5, 7.5, 6.5, 6.5, 'B'); g.r(6, 11, 8, 4, 'B'); g.e(9.5, 7.5, 4.5, 4.5, 'Q'); g.r(8, 10, 4, 4, 'Q');
      g.s(6, 5, ['.NN..NN.', 'N..NN..N', 'N......N', '.N....N.', '.N....N.', '..N..N..', '..N..N..', '..N..N..', '..N..N..']); g.r(6, 15, 8, 4, 'M'); g.r(6, 16, 8, 1, 'J'); g.r(6, 18, 8, 1, 'J'); g.r(8, 19, 4, 1, 'J');
      g.r(-3, 7, 2, 2, 'k'); g.r(21, 7, 2, 2, 'k'); g.s(-1, -2, ['kk.', 'kkk', '.kk']); g.s(18, -2, ['.kk', 'kkk', 'kk.']); },
    // CARE: a green heart with a white paw print inside
    'skill-care': function (g) { g.e(4.5, 5.5, 5, 5.5, 'G'); g.e(14.5, 5.5, 5, 5.5, 'G'); g.p([[0, 7], [20, 7], [10, 19.5]], 'G'); g.r(9, 3, 2, 5, 'G');
      g.e(9.5, 11, 3.2, 2.6, 'W'); g.r(8, 13, 4, 1, 'W'); g.r(4, 6, 2, 3, 'W'); g.r(7, 4, 2, 3, 'W'); g.r(11, 4, 2, 3, 'W'); g.r(14, 6, 2, 3, 'W'); },
    // SCIENCE: three glass test tubes in a wooden rack, each with a different coloured liquid and bubbles
    'skill-sci': function (g) { var xs = [1, 8, 15], liq = ['U', 'V', 'O'], top = [9, 5, 11];
      xs.forEach(function (x, i) { g.r(x - 1, 0, 6, 2, 'E'); g.r(x, 2, 4, 14, 'C'); g.r(x, top[i], 4, 16 - top[i], liq[i]); g.r(x + 1, 16, 2, 1, liq[i]); g.set(x + 1, top[i] + 2, 'W'); g.set(x + 2, top[i] + 4, 'W'); g.set(x + 2, top[i] - 2, liq[i]); });
      g.r(-1, 6, 2, 2, 'T'); g.r(5, 6, 3, 2, 'T'); g.r(12, 6, 3, 2, 'T'); g.r(19, 6, 2, 2, 'T'); g.r(-1, 18, 22, 2, 'T'); g.r(-1, 8, 1, 10, 'X'); g.r(20, 8, 1, 10, 'X'); },
    // SCOUTING: a front-on compass, gold case with a top ring, cream dial with four ticks, red-and-blue needle
    'skill-exp': function (g) { g.r(8, -1, 4, 3, 'D'); g.e(9.5, 10.5, 9, 9, 'D'); g.e(9.5, 10.5, 7, 7, 'F');
      g.r(9, 4, 2, 2, 'K'); g.r(9, 15, 2, 2, 'K'); g.r(3, 10, 2, 2, 'K'); g.r(15, 10, 2, 2, 'K');
      g.p([[8, 9], [15, 5], [11, 12]], 'R'); g.p([[8, 9], [11, 12], [4, 16]], 'B'); g.r(9, 10, 2, 2, 'K'); },
    // HOSTING A: an open waving hand with a purple cuff and ink motion marks
    'host-a': function (g) { g.s(1, 0, [
      '........HHH........',
      '........HHH.HHH....',
      '....HHH.HHH.HHH....',
      '....HHH.HHH.HHH.HHH',
      '....HHH.HHH.HHH.HHH',
      '....HHH.HHH.HHH.HHH',
      '....HHHKHHHKHHHKHHH',
      'HHH.HHHKHHHKHHHKHHH',
      'HHHHKHHHHHHHHHHHHHH',
      '.HHHHKHHHHHHHHHHHHH',
      '..HHHHHHHHHHHHHHHHH',
      '...HHHHHHHHHHHHHHHH',
      '....HHHHHHHHHHHHHHH',
      '.....HHHHHHHHHHHHH.',
      '......HHHHHHHHHHH..',
      '......VVVVVVVVVVV..',
      '......WWWWWWWWWWW..',
      '......VVVVVVVVVVV..',
      '......VVVVVVVVVVV..']);
      g.s(-4, 0, ['.kk', 'kk.', 'kk.', 'kk.', '.kk']); g.s(23, 0, ['kk.', '.kk', '.kk', '.kk', 'kk.']); },
    // HOSTING B: a purple speech bubble with a smiling face
    'host-b': function (g) { g.r(1, 0, 18, 15, 'V'); g.r(0, 1, 20, 13, 'V'); g.p([[3, 14], [9, 14], [2, 20]], 'V');
      g.r(5, 3, 3, 4, 'W'); g.r(12, 3, 3, 4, 'W'); g.s(3, 8, ['WW..........WW', '.WW........WW.', '..WWWWWWWWWW..', '...WWWWWWWW...']); },
    // HOSTING C: a purple megaphone with a white band, grey handle and ink sound marks
    'host-c': function (g) { g.r(0, 6, 4, 7, 'y'); g.p([[4, 6], [14, 1], [14, 18], [4, 13]], 'V'); g.r(10, 3, 2, 13, 'W'); g.r(14, 0, 3, 19, 'v'); g.r(5, 13, 3, 6, 'M'); g.r(5, 16, 3, 1, 'J');
      g.s(20, 3, ['.kk', '..k', '...', '...', '...', 'kkk', '...', '...', '...', '..k', '.kk']); g.r(21, 4, 1, 1, 'k'); g.r(21, 12, 1, 1, 'k'); },
    // COIN: a flat gold disc with a darker rim line and a dollar sign
    'coin': function (g) { g.e(9.5, 9.5, 9.5, 9.5, 'Y'); g.e(9.5, 9.5, 7.6, 7.6, 'D'); g.e(9.5, 9.5, 6.6, 6.6, 'Y');
      g.s(6, 4, ['...NN...', '.NNNNNN.', 'NN.NN...', 'NN.NN...', '.NNNNNN.', '...NN.NN', '...NN.NN', '.NNNNNN.', '...NN...'].map(function (r) { return r; })); g.r(9, 3, 2, 1, 'N'); g.r(9, 13, 2, 2, 'N'); },
    // HABITAT: a picket fence seen from the front with a leafy tree and grass behind it
    'habitat': function (g) { g.e(9, 4, 6, 4.5, 'G'); g.s(5, 1, ['..g...g..', '.....g...', 'g.......g', '...g..g..']); g.r(8, 8, 3, 3, 'X'); g.r(0, 11, 19, 9, 'G');
      [0, 5, 10, 15].forEach(function (x) { g.r(x, 10, 4, 10, 'z'); g.r(x + 1, 9, 2, 1, 'z'); g.r(x, 12, 4, 2, 'T'); g.r(x, 16, 4, 2, 'T'); if (x) g.r(x - 1, 10, 1, 10, 'K'); });
      g.r(4, 12, 1, 2, 'X'); g.r(9, 12, 1, 2, 'X'); g.r(14, 12, 1, 2, 'X'); g.r(4, 16, 1, 2, 'X'); g.r(9, 16, 1, 2, 'X'); g.r(14, 16, 1, 2, 'X'); },
    // TIME: a front-on clock, blue rim, white dial with twelve-three-six-nine ticks, two ink hands and a red centre pin
    'time': function (g) { g.e(9.5, 9.5, 9.5, 9.5, 'B'); g.e(9.5, 9.5, 7.5, 7.5, 'W'); g.r(9, 2, 2, 2, 'B'); g.r(9, 16, 2, 2, 'B'); g.r(2, 9, 2, 2, 'B'); g.r(16, 9, 2, 2, 'B');
      g.r(9, 4, 2, 7, 'K'); g.r(9, 9, 6, 2, 'K'); g.r(9, 9, 2, 2, 'R'); },
    // RESEARCH POINTS: a front-on flask, pale glass with blue liquid, a lighter surface line and white bubbles
    'rp': function (g) { g.r(6, 0, 8, 2, 'E'); g.r(7, 2, 6, 6, 'C'); g.p([[7, 8], [13, 8], [20, 18], [20, 19], [0, 19], [0, 18]], 'C'); g.r(1, 19, 18, 1, 'C');
      for (var y = 12; y < 20; y++) for (var x = 0; x < 20; x++) if (g.get(x, y) === 'C') g.set(x, y, y === 12 ? 'b' : 'B');
      g.r(6, 15, 2, 2, 'W'); g.r(12, 14, 1, 1, 'W'); g.r(13, 17, 2, 2, 'W'); g.r(9, 9, 2, 2, 'b'); g.r(10, 5, 1, 1, 'b'); },
    // VISITORS: a smiling zoo guest seen from the front, brown hair, blue shirt, holding a red balloon on a string
    'visitors': function (g) { g.s(0, 0, [
      '...TTTTTT....',
      '..TTTTTTTT...',
      '..TSSSSSST...',
      '..SKSSSSKS...',
      '..SSSSSSSS...',
      '..SKSSSSKS...',
      '...SKKKKS....',
      '.BBBBBBBBBB..',
      'BBBBBBBBBBBB.',
      'BB.BBBBBB.BB.',
      'BB.BBBBBB.BB.',
      'SS.BBBBBB.SS.',
      '...LLLLLL....',
      '...LLLLLL....',
      '...LL..LL....',
      '...LL..LL....',
      '...LL..LL....',
      '..XXX..XXX...']);
      g.set(2, 9, 'K'); g.set(2, 10, 'K'); g.set(2, 11, null); g.set(9, 9, 'K'); g.set(9, 10, 'K'); g.set(9, 11, null);
      g.e(16.5, 3, 3, 3.5, 'R'); g.r(16, 7, 2, 1, 'R'); g.l(16, 8, 16, 10, 'k'); g.l(15, 11, 12, 11, 'k'); }
  };
  function grid(id) { var g = new Grid(); DEFS[id](g); g.outline(); return g; }
  function draw(id) {
    var g = grid(id), x0 = N, y0 = N, x1 = -1, y1 = -1, x, y;
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) if (g.d[y * N + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    var c = document.createElement('canvas'); c.width = x1 - x0 + 1; c.height = y1 - y0 + 1; var q = c.getContext('2d');
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) { var v = g.d[y * N + x]; if (!v) continue; q.fillStyle = C[v]; q.fillRect(x - x0, y - y0, 1, 1); }
    return c;
  }
  root.ZSymV2 = { LIST: Object.keys(DEFS), draw: draw, grid: grid, INK: INK,
    url: function (id) { return draw(id).toDataURL('image/png'); } };
})(window);
