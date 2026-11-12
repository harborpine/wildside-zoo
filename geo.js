/* Wildside Zoo: shared hex geometry for the tilted pixel view. Owned by the Lead. Do not edit; ask the Lead.
   Hexes in axial (q, r). The camera is TURNED 15 degrees against the grid and tilted, so rows of hexes run diagonally
   across the screen (down to the right) the way a Kairosoft floor sits at a slant. The grid is therefore NOT aligned
   with the screen: there are no horizontal rows and no upright hex sides. Never assume symmetry; use the tables below.
   All numbers are BUFFER pixels (the low-resolution canvas scaled up with crisp pixels), relative to hex (0,0) centre.
   A and B are the screen steps for +1 q and +1 r. They are chosen so every hex corner lands on a whole pixel. */
(function (root) {
  const A = [45, 9], B = [12, 33];
  const G = { A: A, B: B };
  // corner offsets from a hex centre, clockwise starting from the one between the NW and NE neighbours
  // (same order as before: "top", upper-right, lower-right, "bottom", lower-left, upper-left; they are just no longer symmetric)
  const third = (i, j) => [(i * A[0] + j * B[0]) / 3, (i * A[1] + j * B[1]) / 3];
  G.CORNERS = [third(1, -2), third(2, -1), third(1, 1), third(-1, 2), third(-2, 1), third(-1, -1)];
  // = [7,-19], [26,-5], [19,14], [-7,19], [-26,5], [-19,-14]
  // edges: [axial neighbour direction, corner index a, corner index b]. Order: NE, E, SE, SW, W, NW (names are approximate now).
  G.EDGES = [[[1, -1], 0, 1], [[1, 0], 1, 2], [[0, 1], 2, 3], [[-1, 1], 3, 4], [[-1, 0], 4, 5], [[0, -1], 5, 0]];
  // bounding box of one hex around its centre
  G.W = 52; G.H = 38; G.HW = 26; G.HH = 19;
  G.toScreen = (q, r) => ({ x: A[0] * q + B[0] * r, y: A[1] * q + B[1] * r });   // hex centre, ground level
  const DET = A[0] * B[1] - B[0] * A[1];
  G.toAxial = function (x, y) {                                                    // exact inverse, for taps
    const qf = (x * B[1] - y * B[0]) / DET, rf = (y * A[0] - x * A[1]) / DET;
    let rx = Math.round(qf), rz = Math.round(rf), ry = Math.round(-qf - rf);
    const dx = Math.abs(rx - qf), dz = Math.abs(rz - rf), dy = Math.abs(ry + qf + rf);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy <= dz) rz = -rx - ry;
    return { q: rx, r: rz };
  };
  // screen y of an edge's midpoint relative to the hex centre: the natural depth key for a fence on that edge
  G.edgeMidY = e => (G.CORNERS[G.EDGES[e][1]][1] + G.CORNERS[G.EDGES[e][2]][1]) / 2;
  // depth key: draw things in ascending order of the screen y of the point where they touch the ground
  G.depth = (q, r, dy) => A[1] * q + B[1] * r + (dy || 0);
  if (typeof module !== 'undefined' && module.exports) module.exports = G; else root.ZGeo = G;
})(typeof window !== 'undefined' ? window : globalThis);
