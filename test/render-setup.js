/* Renderer tests: shared page-side helpers (each is a function handed to page.evaluate; nothing here runs in Node).
   facSetup: the floor harness page still looks for its five demo facility spots with the Update 7 ring (now always empty), so this
   builds them through the real engine right against their habitat (Update 8: touching is allowed again): a free hex touching the
   habitat, nearest the gate, never in front of the gate arch. Returns the facility kinds it built. */
exports.facSetup = () => {
  const S = RT.S, H = RT.H, K = ZGeo.DENSITY || 1, ent = ZE.entrance(S), ex = ZGeo.toScreen(ent.q, ent.r), built = [];
  [['bench', 'savanna', 1], ['icecream', 'arctic', 0], ['gift', 'jungle', 1], ['photo', 'desert', 1], ['fountain', 'mythic', 0]].forEach(w => {
    const t = w[0], hab = H[w[1]], list = [], seen = {}; if (!hab) return;
    if (S.items.some(i => i.k === 'fac' && i.t === t)) { built.push(t); return; } // the harness page already built it
    ZE.cells(hab).forEach(rc => ZE.DIRS.forEach(d => {
      const q = rc[0] + d[0], r = rc[1] + d[1], k = q + ',' + r; if (seen[k]) return; seen[k] = 1;
      if (!ZE.placeCheck(S, 'fac', t, q, r, 0).ok) return; const p = ZGeo.toScreen(q, r);
      if (Math.abs(p.x - ex.x) < 60 * K && ex.y - p.y < 70 * K) return;
      list.push({ q: q, r: r, d: Math.abs(p.x - ex.x) + Math.abs(p.y - ex.y) * 2 });
    }));
    list.sort((a, b) => a.d - b.d); const pk = list[Math.min(w[2], list.length - 1)]; if (!pk) return;
    if (ZE.build(S, 'fac', t, pk.q, pk.r, 0).ok) built.push(t);
  });
  try { ZE.refresh(S); } catch (e) { /* the engine refreshes on its own too */ }
  S.reports = []; S.fx = []; ZRender.mapChanged(); return built;
};

/* pixel helpers on the floor canvas: window.TT.kind(q, r) says what the ground at a hex looks like ('path' sandy, 'grass' green,
   'other'), by majority over nine points round its centre; TT.count(r, g, b, box?) counts pixels of one exact colour. */
exports.pixelTools = () => {
  const cv = document.getElementById('floor');
  const data = () => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
  const TT = window.TT = {
    kind(q, r) {
      const im = data(), b = cv.getBoundingClientRect(), c = ZRender.hexToClient(q, r), sx = cv.width / b.width, n = { path: 0, grass: 0, other: 0 };
      [[0, 0], [-9, 0], [9, 0], [0, -6], [0, 6], [-6, -4], [6, 4], [-6, 4], [6, -4]].forEach(o => {
        const X = Math.round((c.x + o[0] - b.left) * sx), Y = Math.round((c.y + o[1] - b.top) * sx); if (X < 0 || Y < 0 || X >= cv.width || Y >= cv.height) { n.other++; return; }
        const i = (Y * cv.width + X) * 4, R = im.data[i], G = im.data[i + 1], B = im.data[i + 2];
        if (R > 150 && R > G + 8 && G > B) n.path++; else if (G > R + 15 && G > B) n.grass++; else n.other++;
      });
      return n.path >= 5 ? 'path' : n.grass >= 5 ? 'grass' : 'other';
    },
    count(R, G, B, box) { // box = [x0, y0, x1, y1] in client px (optional): returns { all, inBox }
      const im = data(), b = cv.getBoundingClientRect(), sx = cv.width / b.width; let all = 0, inBox = 0;
      const bx = box ? [(box[0] - b.left) * sx, (box[1] - b.top) * sx, (box[2] - b.left) * sx, (box[3] - b.top) * sx] : null;
      for (let y = 0; y < cv.height; y += 1) for (let x = 0; x < cv.width; x += 1) { const i = (y * cv.width + x) * 4; if (im.data[i] === R && im.data[i + 1] === G && im.data[i + 2] === B) { all++; if (bx && x >= bx[0] && x <= bx[2] && y >= bx[1] && y <= bx[3]) inBox++; } }
      return { all: all, inBox: inBox };
    },
    box(id, pad) { // client-pixel box round every hex of an item
      const it = (ZRender.__S ? ZRender.__S() : RT.cur || RT.S).items.find(i => i.id === id); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const sc = ZRender.debug().buffer.scale;
      ZE.cells(it).forEach(c => { const p = ZRender.hexToClient(c[0], c[1]); x0 = Math.min(x0, p.x - ZGeo.HW * sc); x1 = Math.max(x1, p.x + ZGeo.HW * sc); y0 = Math.min(y0, p.y - ZGeo.HH * sc); y1 = Math.max(y1, p.y + ZGeo.HH * sc); });
      pad = pad || 0; return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
    }
  };
  return true;
};
