// The galleon wreck in Pearl Cove: a Spanish-style treasure galleon four hundred years on the bottom. The planking has rotted off in
// patches and left the ribs standing like the bones of a whale; the gun ports gape; the stern castle has fallen in and its windows are
// empty; the masts are snapped stumps with splintered tops and the sails are long gone (only a few black strands of rigging remain).
// Everything is crusted: barnacles and coral low down, green algae at the waterline, silvered grey timber above it. A few things
// lie about: cannon, an anchor, barrels, a half-buried chest. Built with a local seeded generator, so the island's own random
// sequence (and every object's position) is untouched.
import * as THREE from 'three';
import { MB, C, shade, mat4, tube, lumpy } from './gfx.js';
import { noise2 } from './noise.js';
import { mulberry32, clamp, lerp, smoothstep } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function buildWreck(woodMat) {
  const rng = mulberry32(0x5a11e07), R = () => rng(), rr = (a, b) => a + (b - a) * R(), pk = (a) => a[Math.floor(R() * a.length)];
  const mb = new MB();                                            // timber, iron, growth: one mesh, vertex-coloured
  const L = 21, N = 22, P = 13;                                   // length, stations, points across a section
  const TIMBER = ['#8c7a64', '#7b6b58', '#9d8d76', '#6a5c4b', '#aa9c84'].map((h) => C(h));
  const DARK = C('#4a3d31'), IRON = C('#2d322f'), RUST = C('#4a2e20'), ALGAE = C('#43602f'), ALGAE2 = C('#5c7a3a');
  const CORAL = ['#e9e3d3', '#d98c9b', '#dca056', '#c7d6c8', '#b9a6d3'].map((h) => C(h));

  /* ------------------------------------------------------------ the hull: stations from stern (-L/2) to bow (+L/2) */
  const hw = (u) => 3.25 * (u >= 0.42 ? Math.pow(Math.max(0, 1 - Math.pow((u - 0.42) / 0.62, 2)), 0.72) : Math.pow(Math.max(0, 1 - Math.pow((0.42 - u) / 0.52, 2)), 0.42)) + 0.04;
  const sheer = (u) => 0.15 + 1.25 * Math.pow(Math.max(0, (u - 0.7) / 0.3), 2) + 1.9 * Math.pow(Math.max(0, (0.24 - u) / 0.24), 1.6);
  const keelY = (u) => -2.7 * (0.38 + 0.62 * Math.min(1, hw(u) / 3.0)) + 0.25 * Math.pow(Math.abs(u - 0.45) * 2, 2);
  const rings = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = (u - 0.5) * L, w = hw(u), top = sheer(u), bot = keelY(u), ring = [];
    for (let j = 0; j < P; j++) {
      const a = (j / (P - 1)) * Math.PI, side = -Math.cos(a), dep = Math.sin(a);
      const tumble = 0.84 + 0.16 * Math.sin(Math.min(1, dep * 1.7) * Math.PI * 0.5);       // narrower at the rail than below
      ring.push(V(x, top + (bot - top) * Math.pow(dep, 0.8), side * w * tumble));
    }
    rings.push(ring);
  }
  const half = (P - 1) / 2;
  const strakeH = (j) => (j < half ? j : P - 2 - j);                     // 0 at the rail, up to ~5 at the keel
  const ports = [];
  const gone = (i, j) => {
    const u = i / N, h = strakeH(j), top = 1 - h / ((P - 2) / 2);
    if (u > 0.36 && u < 0.62 && j <= 4 && h <= 3) return true;                                  // the big breach in the port side
    if (h === 2 && i % 2 === 1 && i >= 5 && i <= 17) { ports.push({ i, j }); return true; }     // gun ports
    const n = noise2(i * 0.83 + 4.1, j * 1.27 - 2.2) * 0.22;
    const p = 0.04 + (j < half ? 0.5 : 0.82) * Math.pow(top, 1.8) + (u < 0.1 || u > 0.9 ? 0.28 : 0) + n;
    return R() < p;
  };
  const planked = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < P - 1; j++) {
      if (gone(i, j)) continue;
      const a = rings[i][j], b = rings[i + 1][j], d = rings[i][j + 1], e = rings[i + 1][j + 1];
      const h = strakeH(j), low = 1 - h / ((P - 2) / 2) < 0.45;
      let col = shade(pk(TIMBER), rr(0.82, 1.12));
      if (low) col = col.lerp(R() < 0.35 ? ALGAE2 : ALGAE, rr(0.25, 0.65));
      const out = rr(-0.03, 0.05), inn = 0.1;
      // outer skin, nudged out by its own amount so neighbouring planks don't lie perfectly flush
      const ny = (p) => V(p.x, p.y, p.z + Math.sign(p.z || 1) * out);
      mb.tri(ny(a), ny(b), ny(d), col, col, col); mb.tri(ny(b), ny(e), ny(d), col, col, col);
      // inner face, set back by the plank's thickness, darker: it is what you see through the holes
      const dk = shade(col, 0.6), ni = (p) => V(p.x, p.y, p.z - Math.sign(p.z || 1) * inn);
      mb.tri(ni(a), ni(d), ni(b), dk, dk, dk); mb.tri(ni(b), ni(d), ni(e), dk, dk, dk);
      planked.push({ i, j });
    }
  }

  /* ------------------------------------------------------------ frames (ribs): they outlast the planking */
  for (let i = 1; i < N; i++) {
    for (const side of [0, 1]) {
      const rib = [];
      const reach = i % 3 === 0 ? 5 : Math.floor(rr(2, 6.5));                  // run from the keel up toward the rail, and stop where this one snapped off
      for (let k = 0; k <= reach; k++) { const j = side ? half + k : half - k; const p = rings[i][j]; rib.push(V(p.x + rr(-0.02, 0.02), p.y, p.z * 0.965)); }
      if (rib.length < 2) continue;
      tube(mb, rib, rib.map((_, k) => 0.11 - k * 0.006), 5, () => shade(pk([DARK, TIMBER[1], TIMBER[3]]), rr(0.8, 1.05)));
    }
  }
  // keel, stem and sternpost: heavy timbers that are still there
  tube(mb, rings.slice(1, N).map((r) => V(r[half].x, r[half].y + 0.02, 0)), rings.slice(1, N).map(() => 0.2), 6, () => shade(DARK, 1.15));
  const bowTop = rings[N][0], keelBow = rings[N - 1][half];
  tube(mb, [V(keelBow.x, keelBow.y, 0), V(keelBow.x + 0.6, keelBow.y + 1.8, 0), V(L / 2 + 0.3, 1.3, 0)], [0.19, 0.17, 0.14], 6, () => shade(DARK, 1.1));
  tube(mb, [V(rings[1][half].x, rings[1][half].y, 0), V(rings[0][half].x - 0.2, 0.2, 0), V(-L / 2 - 0.1, 2.6, 0)], [0.2, 0.17, 0.13], 6, () => shade(DARK, 1.1));

  /* ------------------------------------------------------------ deck beams and what is left of the deck */
  for (let i = 2; i < N - 1; i++) {
    const u = i / N, w = hw(u) * 0.86;
    if (R() < 0.22) continue;                                               // beams have rotted through
    const reachL = R() < 0.3 ? rr(0.2, 0.55) : 1, reachR = R() < 0.3 ? rr(0.2, 0.55) : 1;
    const y = 0.02 + sheer(u) * 0.5 - 0.35;
    mb.addGeo(new THREE.BoxGeometry(0.22, 0.2, w * (reachL + reachR)), mat4(rings[i][0].x, y, w * (reachR - reachL) * 0.5), shade(pk(TIMBER), 0.85));
  }
  for (let k = -3; k <= 3; k++) {                                             // runs of deck planking, broken
    for (let i = 3; i < N - 3; i += 1) {
      if (R() < 0.58 || (Math.abs(k) > 2 && R() < 0.6)) continue;
      const u = (i + 0.5) / N, z = k * hw(u) * 0.27, y = sheer(u) * 0.5 - 0.3;
      mb.addGeo(new THREE.BoxGeometry(L / N * 0.95, 0.07, 0.42), mat4((u - 0.5) * L, y, z), shade(pk(TIMBER), rr(0.75, 1.0)));
    }
  }

  /* ------------------------------------------------------------ the stern castle: walls fallen in, windows empty */
  {
    const xs = -L / 2 - 0.05, W = hw(0) * 0.9;
    for (let row = 0; row < 8; row++) {                                       // the transom: boards in rows, windows left open
      const y = 0.3 + row * 0.34;
      for (let seg = 0; seg < 4; seg++) {
        const win = (row === 3 || row === 4 || row === 5) && (seg === 1 || seg === 2);
        const broken = row > 4 && R() < 0.5 + (row - 4) * 0.12;
        if (win || broken || R() < 0.07) continue;
        const z = -W + (seg + 0.5) * (2 * W / 4);
        mb.addGeo(new THREE.BoxGeometry(0.13, 0.31, 2 * W / 4 * 0.97), mat4(xs, y, z), shade(pk(TIMBER), rr(0.78, 1.08)));
      }
    }
    for (const sz of [-1, 1]) {                                               // side walls of the castle, stepping down as they collapsed
      for (let k = 0; k < 6; k++) {
        const x = xs + 0.2 + k * 0.75, maxRows = Math.max(1, Math.round(6 - k * 1.1 + rr(-1, 1)));
        for (let row = 0; row < maxRows; row++) if (R() > 0.2) mb.addGeo(new THREE.BoxGeometry(0.72, 0.31, 0.12), mat4(x, 0.3 + row * 0.34, sz * (W - 0.1 - k * 0.04)), shade(pk(TIMBER), rr(0.75, 1.05)));
      }
    }
    // a stern gallery: the balcony slab and a few turned balusters, half gone
    mb.addGeo(new THREE.BoxGeometry(1.1, 0.12, 2 * W * 0.8), mat4(xs - 0.5, 1.1, 0.0, 1, 1, 1, 0, 0, 0.05), shade(TIMBER[2], 0.9));
    for (let k = 0; k < 7; k++) if (R() < 0.55) mb.addGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 5), mat4(xs - 0.9, 1.4, -W * 0.76 + k * (W * 1.52 / 6), 1, 1, 1, rr(-0.2, 0.2), 0, rr(-0.2, 0.2)), shade(TIMBER[4], 0.9));
    // the great lantern post and the rudder, hanging by one pintle
    mb.addGeo(new THREE.BoxGeometry(0.16, 2.6, 0.5), mat4(xs - 0.25, -1.1, 0.4, 1, 1, 1, 0.1, 0, 0.18), shade(DARK, 1.0));
  }
  // forecastle: a stub of wall at the bow
  for (let k = 0; k < 5; k++) for (let row = 0; row < 3; row++) if (R() > 0.35 + row * 0.12) mb.addGeo(new THREE.BoxGeometry(0.15, 0.3, 0.7), mat4(L / 2 - 2.5 + k * 0.01, sheer(0.9) + 0.4 + row * 0.33, -1.2 + k * 0.6), shade(pk(TIMBER), rr(0.75, 1.05)));

  /* ------------------------------------------------------------ masts: snapped stumps, splintered tops */
  const stump = (x, z, h, r, lean) => {
    const pts = [], radii = [];
    for (let k = 0; k <= 6; k++) { const f = k / 6; pts.push(V(x + lean.x * f * h, -0.3 + h * f, z + lean.z * f * h)); radii.push(r * (1 - 0.28 * f)); }
    tube(mb, pts, radii, 8, (k) => shade(TIMBER[(k + 1) % 5], 0.95));
    const top = pts[pts.length - 1];
    for (let k = 0; k < 7; k++) {                                              // splinters
      const a = (k / 7) * Math.PI * 2 + rr(-0.3, 0.3), len = rr(0.35, 1.1), tilt = rr(0.1, 0.5);
      mb.addGeo(new THREE.ConeGeometry(rr(0.05, 0.1), len, 4), mat4(top.x + Math.cos(a) * r * 0.55, top.y + len * 0.35, top.z + Math.sin(a) * r * 0.55, 1, 1, 1, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt), shade(C('#a8967a'), rr(0.85, 1.1)));
    }
    // a shroud's worth of black rigging: a few strands from the stump to the rails, some hanging free where they parted
    for (let k = 0; k < 5; k++) {
      const side = k % 2 ? 1 : -1, end = V(x + rr(-1.5, 1.5), 0.6, side * hw((x / L) + 0.5) * 0.9), start = top.clone().add(V(0, -rr(0.2, 0.9), 0));
      const parted = R() < 0.5, pts2 = [];
      for (let q = 0; q <= 8; q++) { const f = q / 8 * (parted ? rr(0.45, 0.75) : 1); const p = start.clone().lerp(end, f); p.y -= Math.sin(Math.min(1, f) * Math.PI) * 0.35 + (parted ? Math.pow(q / 8, 2) * 1.2 : 0); pts2.push(p); }
      tube(mb, pts2, pts2.map(() => 0.025), 4, () => shade(C('#241d16'), rr(0.9, 1.3)));
    }
  };
  stump(0.8, 0.0, 4.9, 0.34, { x: 0.02, z: -0.05 });                         // main
  stump(5.6, 0.0, 2.4, 0.26, { x: 0.12, z: 0.1 });                           // fore
  stump(-4.8, 0.1, 1.6, 0.22, { x: -0.1, z: 0.05 });                         // mizzen
  tube(mb, [V(L / 2 - 1.2, 1.0, 0), V(L / 2 + 1.2, 1.6, 0), V(L / 2 + 3.0, 2.2, 0)], [0.2, 0.16, 0.11], 6, () => shade(TIMBER[0], 1.0));   // bowsprit, snapped
  mb.addGeo(new THREE.ConeGeometry(0.1, 0.7, 4), mat4(L / 2 + 3.1, 2.4, 0, 1, 1, 1, 0, 0, -1.2), shade(C('#a8967a'), 1.0));
  // the fallen main yard lies in the sand beside the hull, and a broken topmast with it
  tube(mb, [V(-4.5, -2.35, 5.4), V(0.2, -2.2, 5.9), V(5.2, -2.45, 6.3)], [0.13, 0.15, 0.1], 6, () => shade(TIMBER[3], 1.0));
  tube(mb, [V(1.8, -2.1, -5.6), V(4.6, -2.3, -6.4)], [0.1, 0.08], 5, () => shade(TIMBER[0], 0.95));

  /* ------------------------------------------------------------ iron: cannon, anchor */
  const cannon = (x, y, z, yaw, tilt = 0, enc = 0.2) => {
    const col = (v) => shade(IRON, rr(0.8, 1.3)).lerp(R() < enc ? ALGAE : RUST, enc * rr(0.2, 0.9));
    mb.addGeo(new THREE.CylinderGeometry(0.15, 0.24, 2.1, 8), mat4(x, y, z, 1, 1, 1, tilt, yaw, Math.PI / 2), col);       // the barrel, breech end fat
    mb.addGeo(new THREE.CylinderGeometry(0.19, 0.19, 0.12, 8), mat4(x + Math.cos(-yaw) * -0.7, y, z + Math.sin(-yaw) * -0.7, 1, 1, 1, tilt, yaw, Math.PI / 2), col);   // a reinforcing ring
    mb.addGeo(new THREE.SphereGeometry(0.13, 6, 5), mat4(x + Math.cos(-yaw) * -1.1, y, z + Math.sin(-yaw) * -1.1), col);    // the cascabel
  };
  // on the gun deck, one behind each of a few ports, and two thrown clear onto the sand
  ports.filter((_, k) => k % 3 === 0).slice(0, 6).forEach(({ i, j }) => {
    const r = rings[i][j], side = Math.sign(r.z) || 1;
    cannon(r.x, -0.55 + sheer(i / N) * 0.1, r.z * 0.82, side > 0 ? Math.PI / 2 : -Math.PI / 2, rr(-0.1, 0.1));
  });
  cannon(-1.5, -2.25, 4.4, 0.9, 0.05, 0.6); cannon(4.2, -2.3, -4.1, 2.5, -0.1, 0.6);
  for (let k = 0; k < 9; k++) mb.addGeo(new THREE.SphereGeometry(0.1, 6, 5), mat4(-0.6 + rr(-0.5, 0.5) + (k % 3) * 0.2, -2.6 + Math.floor(k / 3) * 0.17, 3.6 + rr(-0.3, 0.3)), shade(IRON, rr(0.9, 1.4)));
  {                                                                           // anchor lying off the bow, half-buried
    const ax = L / 2 - 0.5, az = -4.4, ay = -2.5, yaw = 0.7;
    const a = (x, y, z) => { const c = Math.cos(yaw), s = Math.sin(yaw); return V(ax + x * c + z * s, ay + y, az - x * s + z * c); };
    const rc = () => shade(RUST, rr(0.8, 1.3));
    tube(mb, [a(-1.4, 0.1, 0), a(0, 0.15, 0), a(1.3, 0.35, 0)], [0.07, 0.065, 0.06], 6, rc);                                // shank
    tube(mb, [a(-1.4, 0.1, -0.7), a(-1.4, 0.1, 0), a(-1.4, 0.1, 0.7)], [0.05, 0.05, 0.05], 5, rc);                         // stock
    const arm = [], arm2 = [];
    for (let q = 0; q <= 8; q++) { const t = (q / 8 - 0.5) * 2.1; arm.push(a(1.25 + Math.cos(t) * 0.0, 0.3 - Math.pow(Math.abs(t), 2) * 0.28, t * 0.95)); }
    tube(mb, arm, arm.map(() => 0.06), 5, rc);                                                                              // the crown and flukes
    for (const sd of [-1, 1]) mb.addGeo(new THREE.ConeGeometry(0.17, 0.4, 4), mat4(...a(1.25, 0.05, sd * 1.0).toArray(), 1, 1, 1, sd * 1.1, yaw, 0), rc);
    tube(mb, [a(1.3, 0.35, 0), a(1.5, 0.5, 0.0)], [0.08, 0.07], 5, rc);
  }

  /* ------------------------------------------------------------ cargo: barrels, a chest */
  const barrel = (x, y, z, rx, rz) => {
    const col = shade(pk(TIMBER), rr(0.8, 1.0));
    mb.addGeo(new THREE.CylinderGeometry(0.34, 0.34, 0.85, 8), mat4(x, y, z, 1, 1, 1, rx, 0, rz), col);
    for (const hy of [-0.28, 0.28]) mb.addGeo(new THREE.CylinderGeometry(0.355, 0.355, 0.05, 8), mat4(x, y, z, 1, 1, 1, rx, 0, rz).multiply(new THREE.Matrix4().makeTranslation(0, hy, 0)), shade(IRON, 1.1));
  };
  barrel(-1.0, -1.9, 0.3, 0.2, 1.3); barrel(3.2, -2.3, 3.2, 1.4, 0.3); barrel(-6.4, -2.2, -2.6, 0.3, 0.2);
  {                                                                           // the chest: staved in at one corner, lid ajar, a spill of tarnished coin
    const cx = -6.2, cz = 3.4, cy = -2.5;
    mb.addGeo(new THREE.BoxGeometry(1.0, 0.5, 0.62), mat4(cx, cy + 0.25, cz, 1, 1, 1, 0.05, 0.4, 0.1), shade(TIMBER[3], 1.0));
    mb.addGeo(new THREE.BoxGeometry(1.0, 0.07, 0.04), mat4(cx, cy + 0.38, cz, 1, 1, 1, 0.05, 0.4, 0.1), shade(IRON, 1.2));
    mb.addGeo(new THREE.BoxGeometry(1.0, 0.1, 0.66), mat4(cx - 0.36, cy + 0.7, cz + 0.2, 1, 1, 1, 0.05, 0.4, 1.0), shade(TIMBER[2], 0.9));
    for (let k = 0; k < 16; k++) { const a = rr(0, 6.28), d = rr(0.05, 0.75); mb.addGeo(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 8), mat4(cx + Math.cos(a) * d, cy + 0.05 + (d < 0.35 ? 0.4 : 0), cz + Math.sin(a) * d, 1, 1, 1, rr(-0.3, 0.3), 0, rr(-0.3, 0.3)), shade(C('#caa23a'), rr(0.7, 1.15))); }
  }

  /* ------------------------------------------------------------ four centuries of growth */
  const cellMid = (c, k = 0.5) => rings[c.i][c.j].clone().lerp(rings[c.i + 1][c.j + 1], k);
  for (let n = 0; n < 260 && planked.length; n++) {
    const cell = pk(planked), h = strakeH(cell.j), wet = h >= 3, rail = h <= 1;
    if (rail && R() < 0.8) continue;                                           // barnacles and coral thicken toward the waterline and below
    const p = cellMid(cell, rr(0.2, 0.8)), kind = R(), s = rr(0.08, 0.26) * (wet ? 1.2 : 0.7);
    const col = !wet ? (kind < 0.5 ? C('#d8d2c0') : ALGAE2) : kind < 0.55 ? pk(CORAL) : kind < 0.8 ? ALGAE2 : C('#d8d2c0');
    const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.5, n);
    mb.addGeo(g, mat4(p.x, p.y, p.z + Math.sign(p.z || 1) * 0.05, s * 1.2, s * (kind < 0.8 ? 0.8 : 0.5), s * 1.1), () => shade(col, rr(0.85, 1.15)));
  }
  for (let n = 0; n < 40 && planked.length; n++) {                            // algae ribbons trailing from the waterline planks
    const cell = pk(planked), h = strakeH(cell.j);
    if (h < 2 || h > 4) continue;
    const p = cellMid(cell, 0.5), side = Math.sign(p.z || 1), len = rr(0.5, 1.5), c = shade(pk([ALGAE, ALGAE2]), rr(0.8, 1.1)), w = rr(0.06, 0.14);
    const a = V(p.x, p.y, p.z + side * 0.06), b = V(p.x + rr(-0.15, 0.15), p.y - len, p.z + side * 0.2);
    mb.tri(a.clone().add(V(-w, 0, 0)), a.clone().add(V(w, 0, 0)), b, c, c, shade(c, 0.7));
    mb.tri(a.clone().add(V(w, 0, 0)), a.clone().add(V(-w, 0, 0)), b, c, c, shade(c, 0.7));
  }
  // silt and sand drifted in under the keel and bow: she has been hung up on a bank for four centuries
  const SAND = ['#d9cca4', '#cdbf96', '#bfb08a', '#d2c49a'].map((h) => C(h));
  for (const [x, y, z, rx, ry, rz, sd] of [[0, -3.4, 0.2, 9.0, 0.8, 2.8, 1], [7.6, -3.3, 0, 4.2, 0.9, 3.0, 2], [-7.4, -3.4, 0.4, 3.4, 0.8, 2.6, 3]]) {
    const g = lumpy(new THREE.IcosahedronGeometry(1, 2), 0.22, sd);
    mb.addGeo(g, mat4(x, y, z, rx, ry, rz), (v) => shade(SAND[(((Math.floor(v.x * 3.1 + v.z * 2.3) % 4) + 4) % 4)], 0.9 + 0.2 * Math.min(1, Math.max(0, (v.y - y) / ry + 0.4))));
  }
  // the loose planks and timbers fallen around the hull
  for (let n = 0; n < 16; n++) {
    const a = rr(0, 6.28), d = rr(3.5, 8), len = rr(0.8, 3.2);
    mb.addGeo(new THREE.BoxGeometry(len, 0.07, rr(0.2, 0.34)), mat4(Math.cos(a) * d * 1.5, -2.55 + rr(0, 0.25), Math.sin(a) * d * 0.9, 1, 1, 1, rr(-0.15, 0.15), rr(0, 3.14), rr(-0.2, 0.2)), shade(pk(TIMBER), rr(0.7, 1.0)));
  }

  const geo = mb.build();
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, woodMat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
