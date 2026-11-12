/* Wildside Zoo: shared hex geometry for the tilted pixel view. Owned by the Lead. Do not edit; ask the Lead.
   Pointy-top hexes in axial (q, r), squashed vertically for a Kairosoft-like camera. All numbers are in BUFFER pixels
   (the low-resolution canvas that is scaled up with crisp pixels), relative to the map origin (hex 0,0 centre = 0,0).
   Scale: a hex is 48 wide and 32 tall, so about 4 hexes span a 195 px wide phone buffer ("big and close").
   Slanted edges run exactly 2 across : 1 down, the classic clean pixel-art iso line. */
(function (root) {
  const W = 48, RS = 20, HH = 16, SH = RS - HH; // column step, row step, half height of a hex, shoulder height (4)
  const G = { W: W, RS: RS, HH: HH, SH: SH };
  // corner offsets from a hex centre, clockwise from the top: top, upper-right, lower-right, bottom, lower-left, upper-left
  G.CORNERS = [[0, -HH], [W / 2, -SH], [W / 2, SH], [0, HH], [-W / 2, SH], [-W / 2, -SH]];
  // edges: [axial neighbour direction, corner index a, corner index b]. Order: NE, E, SE, SW, W, NW.
  G.EDGES = [[[1, -1], 0, 1], [[1, 0], 1, 2], [[0, 1], 2, 3], [[-1, 1], 3, 4], [[-1, 0], 4, 5], [[0, -1], 5, 0]];
  G.toScreen = (q, r) => ({ x: W * q + (W / 2) * r, y: RS * r });           // hex centre, ground level
  G.toAxial = function (x, y) {                                               // inverse, for taps
    const rf = y / RS, qf = x / W - rf / 2;
    let rx = Math.round(qf), rz = Math.round(rf), ry = Math.round(-qf - rf);
    const dx = Math.abs(rx - qf), dz = Math.abs(rz - rf), dy = Math.abs(ry + qf + rf);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy <= dz) rz = -rx - ry;
    return { q: rx, r: rz };
  };
  // depth key: draw things in ascending order of the screen y of the point where they touch the ground
  G.depth = (q, r, dy) => RS * r + (dy || 0);
  if (typeof module !== 'undefined' && module.exports) module.exports = G; else root.ZGeo = G;
})(typeof window !== 'undefined' ? window : globalThis);
