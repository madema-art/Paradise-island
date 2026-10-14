// World definition: analytic island shape + rivers, old (cold) lava channels and a baked heightfield.
import { noise2, fbm } from './noise.js';
import { clamp, lerp, smoothstep, smin, smax } from './util.js';
import caveData from '../assets/cave_data.json';

export const SIZE = 500, SEG = 400, HALF = SIZE / 2, CELL = SIZE / SEG, N = SEG + 1;

export const VOL = { x: 62, z: -62, R: 92, H: 114, craterR: 11, lavaY: 66.2, rim: 118 };
/** the Ascent: a switchback trail up the lower cone to a basecamp ledge, then a bare-rock climb up the south buttress to the rim */
export const ASCENT = { theta: 66 * Math.PI / 180, rBase: 44, rTop: 15.7, ledgeR: [34, 25], trail: [], stations: [], bc: null, top: null, rim: [] };
export const PLAT = { x: -78, z: -6, rx: 62, rz: 48, h: 32 };
export const COVE = { x: 40, z: 116, r: 34 };
export const LAKE = { x: -88, z: -24, r: 17, y: 0, shape: null };
const LAKE_N = 96;
/** distance from the lake's middle to its shore, at the angle of (x, z), as a fraction: below 1 is inside the shoreline */
export function lakeRho(x, z) {
  const dx = x - LAKE.x, dz = z - LAKE.z, r = Math.hypot(dx, dz), sh = LAKE.shape;
  if (!sh) return r / LAKE.r;
  const f = (((Math.atan2(dz, dx) / (Math.PI * 2)) % 1) + 1) % 1 * LAKE_N, i0 = Math.floor(f) % LAKE_N, t = f - Math.floor(f);
  return r / lerp(sh[i0], sh[(i0 + 1) % LAKE_N], t);
}
export const TEMPLE = { x: 8, z: -14, y: 0 };
export const SPRING = { x: -8, z: -84, y: 0, r: 5.5 };
export const FAIRY = { x: -16, z: 44, y: 0 };
// small sandy motu (reef islets) out in the lagoon beyond the cove
export const MOTU = [{ x: 96, z: 196, r: 15 }, { x: -134, z: 176, r: 11 }];

export const river = { A: null, B: null, C: null };
export const falls = {};
export const lavaPaths = [];
/** crowns of boulders that things can climb onto: {x, z, r (flat-ish top radius), y (top height), kind} */
export const perches = [];
export function addPerch(x, z, r, y, kind = 'rock') { perches.push({ x, z, r, y, kind }); }
/** perches within range of (x, z), nearest first; ok(p) can filter */
export function perchesNear(x, z, range, ok = null) {
  const out = [];
  for (const p of perches) { const d = Math.hypot(p.x - x, p.z - z); if (d < range && (!ok || ok(p))) out.push({ p, d }); }
  return out.sort((a, b) => a.d - b.d).map((o) => o.p);
}
const flats = [];
const carvers = { A: null, B: null, C: null, lava: [] };

/* ------------------------------------------------------------------ raw terrain */
function islandD(x, z) {
  const wx = x + 38 * noise2(x * 0.008 + 3.1, z * 0.008 - 1.7) + 12 * noise2(x * 0.03, z * 0.03 + 9);
  const wz = z + 38 * noise2(x * 0.008 - 5.3, z * 0.008 + 7.9) + 12 * noise2(x * 0.03 + 4, z * 0.03);
  const q = Math.hypot(wx / 158, (wz + 5) / 122);
  let d = (1 - q) * 128;
  d += 30 * Math.exp(-((x - 2) ** 2 + (z - 126) ** 2) / (2 * 15 * 15));
  d += 30 * Math.exp(-((x - 82) ** 2 + (z - 124) ** 2) / (2 * 14 * 14));
  const bd = Math.hypot(x - COVE.x, z - COVE.z) - COVE.r;
  return smin(d, bd, 7);
}

function landH(x, z, d) {
  if (d < 0) {
    const a = -d;
    const raw = a * 0.12 + 0.0042 * a * a;
    return -34 * (1 - Math.exp(-raw / 34));
  }
  let h = 3.4 * (1 - Math.exp(-d / 14));
  const inl = smoothstep(14, 60, d);
  const hills = fbm(x * 0.012 + 11, z * 0.012 - 4, 5) * 0.5 + 0.5;
  h += inl * (hills * 16 + fbm(x * 0.045, z * 0.045, 3) * 2.5);
  return h;
}

function plateauMask(x, z) {
  const dx = (x - PLAT.x) / PLAT.rx, dz = (z - PLAT.z) / PLAT.rz;
  const hyp = Math.hypot(dx, dz);
  const u = hyp + 0.05 * noise2(x * 0.05, z * 0.05);
  const south = smoothstep(0.15, 0.8, dz / Math.max(0.001, hyp));
  const w = 0.3 - 0.235 * south;
  return 1 - smoothstep(1 - w, 1, u);
}

function volcanoH(x, z) {
  const dx = x - VOL.x, dz = z - VOL.z;
  const r = Math.hypot(dx, dz);
  const ang = Math.atan2(dz, dx);
  const rn = r * (1 + 0.07 * noise2(Math.cos(ang) * 2.2 + 3, Math.sin(ang) * 2.2 + 1) + 0.04 * noise2(x * 0.03, z * 0.03));
  let c = VOL.H * Math.pow(Math.max(0, 1 - rn / VOL.R), 1.55);
  c += noise2(ang * 4.0, r * 0.012) * 2.8 * smoothstep(12, 40, r) * smoothstep(VOL.R * 0.9, 40, r);
  c += (6 + 3 * noise2(ang * 3 + 9, 0.5)) * Math.exp(-(((r - 14) / 3.4) ** 2));
  c = lerp(c, 62.5, smoothstep(14, 8.5, r));
  return volcanoUpper(c - 3 - 0.15 * Math.max(0, r - VOL.R), x, z, r, ang);
}

/** Everything below 48 m is exactly the old cone (so the jungle and every placement on the lower slopes stay put); above it the cone
 *  steepens toward a tall crown, grows radial ribs and gullies, and the crater rim gets horns and saddles. */
function volcanoUpper(base, x, z, r, ang) {
  const U0 = 48;
  if (base <= U0) return base;
  const k = smoothstep(U0, 94, base);
  let h = U0 + (base - U0) * (1 + 0.6 * k);
  const up = smoothstep(U0, 74, base);
  const fade = smoothstep(19, 31, r);
  const ridge = 1 - Math.abs(noise2(ang * 5.0 + 3, r * 0.004));
  h += up * fade * (ridge * 9 - 4.5 + noise2(ang * 11.0 + 7, r * 0.01) * 3);
  let da = ang - ASCENT.theta; da = Math.atan2(Math.sin(da), Math.cos(da));
  h += up * Math.exp(-((da / 0.07) ** 2)) * 5.5 * smoothstep(20, 36, r) * (1 - smoothstep(40, 48, r));        // the rib the climbing route follows
  const crest = Math.exp(-(((r - 15.5) / 3.2) ** 2));
  h += crest * (5 * noise2(ang * 2.5 + 1, 0.7) + 3.5 * noise2(ang * 6.0, 1.3));                              // horns and saddles on the rim
  return h;
}

function rawNoFlat(x, z) {
  const d = islandD(x, z);
  let h = landH(x, z, d);
  const pm = plateauMask(x, z);
  if (pm > 0) {
    const pt = PLAT.h + fbm(x * 0.03 + 2, z * 0.03, 3) * 1.6;
    h = lerp(h, pt, pm);
  }
  const vr = Math.hypot(x - VOL.x, z - VOL.z);
  if (vr < VOL.R + 50) h = smax(h, volcanoH(x, z), 6);
  for (const m of MOTU) {
    const dd = Math.hypot(x - m.x, z - m.z) + 2.6 * noise2(x * 0.09 + m.x, z * 0.09 - m.z);
    const q = dd / m.r;
    if (q < 4) {
      const f = q < 0.85 ? 3.1 * Math.pow(1 - (q / 0.85) ** 2, 0.8) : -1.3 * smoothstep(0.85, 1.45, q) - 34 * smoothstep(1.45, 3.8, q);
      h = smax(h, f, 2);
    }
  }
  const cd = Math.hypot(x - COVE.x, z - COVE.z);
  if (h < 0.4 && cd < 70) {
    const lag = smoothstep(60, 26, cd);
    let target = -2.4 + 0.8 * noise2(x * 0.08, z * 0.08);
    target -= 4.5 * Math.exp(-(((x - COVE.x) / 10) ** 2)) * smoothstep(118, 150, z);
    h = lerp(h, Math.max(h, target), lag);
  }
  return h;
}

/* ------------------------------------------------------------------ helpers */
class PolyIndex {
  constructor(pts, cell = 12) {
    this.pts = pts;
    this.cell = cell;
    this.map = new Map();
    pts.forEach((p, i) => {
      const k = this.key(Math.floor(p.x / cell), Math.floor(p.z / cell));
      let l = this.map.get(k);
      if (!l) this.map.set(k, (l = []));
      l.push(i);
    });
  }
  key(cx, cz) { return (cx + 1000) * 4096 + (cz + 1000); }
  nearest(x, z) {
    const c = this.cell, cx = Math.floor(x / c), cz = Math.floor(z / c);
    let best = -1, bd = 1e12;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const l = this.map.get(this.key(cx + a, cz + b));
        if (!l) continue;
        for (let k = 0; k < l.length; k++) {
          const p = this.pts[l[k]];
          const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (d < bd) { bd = d; best = l[k]; }
        }
      }
    return best < 0 ? null : { i: best, d: Math.sqrt(bd) };
  }
}

function cr(a, b, c, d, t) {
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
}
function catmull(ctrl, step) {
  const out = [];
  const P = (i) => ctrl[clamp(i, 0, ctrl.length - 1)];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ x: cr(p0[0], p1[0], p2[0], p3[0], t), z: cr(p0[1], p1[1], p2[1], p3[1], t) });
    }
  }
  const l = ctrl[ctrl.length - 1];
  out.push({ x: l[0], z: l[1] });
  return out;
}

/* ------------------------------------------------------------------ rivers & features */
function buildFeatures() {
  // lake sits on the plateau
  LAKE.y = rawNoFlat(LAKE.x, LAKE.z) - 1.4;
  {
    // An irregular shoreline: a lumpy outline with a couple of bays and points, pulled back from any place where the plateau
    // falls away, so the water always sits inside a bank and never hangs over an edge. The outflow river leaves from the east shore.
    const E = [];
    for (let i = 0; i < LAKE_N; i++) {
      const a = (i / LAKE_N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      let e = 40;
      for (let r = 6; r < 40; r += 0.5) if (rawNoFlat(LAKE.x + c * r, LAKE.z + s * r) < LAKE.y + 0.9) { e = r; break; }
      E.push(e);
    }
    const lim = E.map((_, i) => { let m = 1e9; for (let k = -3; k <= 3; k++) m = Math.min(m, E[(i + k + LAKE_N) % LAKE_N]); return m; });
    const aOut = Math.atan2(-14 - LAKE.z, -75 - LAKE.x);
    const raw = [];
    for (let i = 0; i < LAKE_N; i++) {
      const a = (i / LAKE_N) * Math.PI * 2;
      let r = 14.5 * (1 + 0.2 * Math.sin(2 * a + 0.7) + 0.15 * Math.sin(3 * a + 2.1) + 0.09 * Math.sin(5 * a + 4.0) + 0.05 * Math.sin(8 * a + 1.3));
      const d = Math.atan2(Math.sin(a - aOut), Math.cos(a - aOut));
      r = lerp(r, 17.2, Math.exp(-((d / 0.42) ** 2)));                 // the outlet
      raw.push(Math.max(8, Math.min(r, 19.5, lim[i] - 2.5)));
    }
    LAKE.shape = raw.map((_, i) => (raw[(i + LAKE_N - 1) % LAKE_N] + 2 * raw[i] + raw[(i + 1) % LAKE_N]) / 4);
  }

  // river A: lake -> plateau lip
  const ctrlA = [[-75, -14], [-68, -4], [-66, 10], [-67, 24], [-68, 34], [-68, 44], [-68, 56]];
  const ptsA = catmull(ctrlA, 0.8);
  let prev = LAKE.y, lip = -1;
  const WA = [];
  for (let i = 0; i < ptsA.length; i++) {
    const r = rawNoFlat(ptsA[i].x, ptsA[i].z) - 0.7;
    if (i > 0 && r < prev - 1.1) { lip = i - 1; break; }
    prev = Math.min(prev, r);
    WA.push(prev);
  }
  if (lip < 0) lip = ptsA.length - 2;
  ptsA.length = lip + 1;
  WA.length = lip + 1;
  const pl = ptsA[lip], pb = ptsA[Math.max(0, lip - 5)];
  let nx = pl.x - pb.x, nz = pl.z - pb.z;
  const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
  // find the foot of the cliff
  const lowY = rawNoFlat(pl.x + nx * 14, pl.z + nz * 14);
  let tWall = 3;
  for (let t = 0; t < 14; t += 0.25) {
    if (rawNoFlat(pl.x + nx * t, pl.z + nz * t) <= lowY + 2.5) { tWall = t; break; }
  }
  const bx = pl.x + nx * (tWall + 1.5), bz = pl.z + nz * (tWall + 1.5);
  const ledgeY = rawNoFlat(pl.x + nx * (tWall + 5), pl.z + nz * (tWall + 5)) + 0.35;
  const poolR = 7.5;
  const px = bx + nx * 10.5, pz = bz + nz * 10.5;
  const poolY = ledgeY - 0.6;
  Object.assign(falls, {
    lip: { x: pl.x, y: WA[lip], z: pl.z },
    n: { x: nx, z: nz },
    wallT: tWall,
    ledge: { x: bx, z: bz, y: ledgeY },
    pool: { x: px, z: pz, y: poolY, r: poolR },
    drop: WA[lip] - poolY,
  });
  flats.push({ x: bx, z: bz, r0: 4.6, r1: 8.2, y: ledgeY });

  river.A = {
    pts: ptsA, W: WA,
    w: ptsA.map((_, i) => lerp(3.0, 4.4, smoothstep(ptsA.length - 14, ptsA.length - 1, i))),
    bed: WA.map((y) => y - 0.9),
  };

  // river B: pool -> cove
  const ctrlB = [[px, pz], [px + 6, pz + 12], [-58, pz + 22], [-46, pz + 28], [-30, 76], [-12, 82], [6, 87], [22, 90], [34, 89], [41, 86]];
  const ptsB0 = catmull(ctrlB, 0.8);
  const ptsB = [], WB = [];
  let tailB = 0;
  prev = poolY;
  for (let i = 0; i < ptsB0.length; i++) {
    const p = ptsB0[i];
    if (Math.hypot(p.x - px, p.z - pz) < poolR - 0.5) continue;
    const r = rawNoFlat(p.x, p.z) - 0.6;
    prev = Math.min(prev, r);
    if (prev < 0.3) {                       // reached the shore: keep going and slide gently into the sea
      prev = Math.max(0.02, Math.min(prev, 0.3 - tailB * 0.045));
      if (++tailB > 14 || rawNoFlat(p.x, p.z) < -0.3) { ptsB.push(p); WB.push(prev); break; }
    }
    ptsB.push(p); WB.push(prev);
  }
  const nB = ptsB.length;
  const wB = ptsB.map((_, i) => lerp(3.4, 6.5, Math.pow(i / nB, 2)) * (1 + 0.9 * smoothstep(nB - 18, nB - 1, i)));   // estuary flare
  river.B = { pts: ptsB, W: WB, w: wB, bed: WB.map((y) => y - 0.9) };
  river.pool = falls.pool;
  river.lake = LAKE;

  // river C: lake -> west slope -> sea (a long cascade)
  const ctrlC = [[-98, -27], [-108, -29], [-118, -30], [-128, -30], [-138, -28], [-148, -25], [-158, -22], [-168, -20]];
  const ptsC0 = catmull(ctrlC, 0.8);
  const ptsC = [], WC = [];
  let tailC = 0;
  prev = LAKE.y;
  for (let i = 0; i < ptsC0.length; i++) {
    const p = ptsC0[i];
    const r = rawNoFlat(p.x, p.z) - 0.6;
    prev = Math.min(prev, r);
    if (prev < 0.35) {
      prev = Math.max(0.02, Math.min(prev, 0.35 - tailC * 0.05));
      if (++tailC > 12 || rawNoFlat(p.x, p.z) < -0.3) { ptsC.push(p); WC.push(prev); break; }
    }
    ptsC.push(p); WC.push(prev);
  }
  const nC = ptsC.length;
  river.C = { pts: ptsC, W: WC, w: ptsC.map((_, i) => lerp(3.4, 5.0, i / nC) * (1 + 1.2 * smoothstep(nC - 16, nC - 1, i))), bed: WC.map((y) => y - 0.9) };

  carvers.A = new PolyIndex(river.A.pts);
  carvers.B = new PolyIndex(river.B.pts);
  carvers.C = new PolyIndex(river.C.pts);

  // lava paths
  const defs = [
    { th: 0.35, maxR: 100, seed: 1.7 },
    { th: -0.55, maxR: 100, seed: 4.2 },
    { th: 1.75, maxR: 58, seed: 8.1 },
  ];
  for (const df of defs) {
    const pts = [];
    let x = VOL.x + Math.cos(df.th) * 12.5, z = VOL.z + Math.sin(df.th) * 12.5;
    for (let i = 0; i < 400; i++) {
      pts.push({ x, z });
      const r = Math.hypot(x - VOL.x, z - VOL.z);
      if (r > df.maxR || rawNoFlat(x, z) < 0.3) break;
      const a = df.th + 0.55 * noise2(r * 0.035 + df.seed, df.seed * 2.3);
      x += Math.cos(a) * 1.0;
      z += Math.sin(a) * 1.0;
    }
    lavaPaths.push({ pts, ends: rawNoFlat(pts[pts.length - 1].x, pts[pts.length - 1].z) < 1.5 });
    carvers.lava.push(new PolyIndex(pts, 8));
  }

  // flats
  TEMPLE.y = rawNoFlat(TEMPLE.x, TEMPLE.z) + 0.2;
  flats.push({ x: TEMPLE.x, z: TEMPLE.z, r0: 16, r1: 28, y: TEMPLE.y });
  SPRING.y = rawNoFlat(SPRING.x, SPRING.z) + 0.1;
  flats.push({ x: SPRING.x, z: SPRING.z, r0: 9, r1: 17, y: SPRING.y });
  FAIRY.y = rawNoFlat(FAIRY.x, FAIRY.z);
  flats.push({ x: FAIRY.x, z: FAIRY.z, r0: 8, r1: 15, y: FAIRY.y });
  buildAscent();
  setupCave();
}

/** The Crystal Cave behind Veil Falls. Its own frame: the mouth is 3.2 m back from the ledge, depth runs into the cliff, and the floor is the
 *  ledge height. Blender coordinates (bx lateral, by depth) map to world through this transform; the walkable floor is a baked grid. */
export const CAVE = { ready: false, ox: 0, oy: 0, oz: 0, ca: 1, sa: 0, nav: caveData.nav };
function setupCave() {
  const n = falls.n, B = falls.ledge, th = Math.atan2(n.x, n.z);
  CAVE.ox = B.x - n.x * 3.2; CAVE.oz = B.z - n.z * 3.2; CAVE.oy = B.y; CAVE.ca = Math.cos(th); CAVE.sa = Math.sin(th); CAVE.theta = th; CAVE.ready = true;
}
const _cl = { bx: 0, by: 0 };
export function caveLocal(x, z, out = _cl) {
  const dx = x - CAVE.ox, dz = z - CAVE.oz;
  out.bx = dx * CAVE.ca - dz * CAVE.sa; out.by = -(dx * CAVE.sa + dz * CAVE.ca);
  return out;
}
/** world height of the cave floor under (x,z), or null if that is solid rock (the cell and its neighbours must all be floor, so walls keep their distance) */
export function caveFloorAt(x, z) {
  if (!CAVE.ready) return null;
  const q = caveLocal(x, z), N = CAVE.nav;
  const fx = (q.bx - N.x0) / N.cell, fy = (q.by - N.y0) / N.cell, i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= N.nx - 1 || j >= N.ny - 1) return null;
  const h = N.h, a = h[j * N.nx + i], b = h[j * N.nx + i + 1], c = h[(j + 1) * N.nx + i], d = h[(j + 1) * N.nx + i + 1];
  if (a < -90 || b < -90 || c < -90 || d < -90) return null;
  const tx = fx - i, ty = fy - j;
  return CAVE.oy + lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}
/** is (x, y, z) inside the cave, or within a cell or two of its walls? (for the camera and the weather: the real footprint, not a sphere at the door) */
export function inCave(x, y, z) {
  if (!CAVE.ready || y > CAVE.oy + 14 || y < CAVE.oy - 4) return false;
  const q = caveLocal(x, z), N = CAVE.nav, i = Math.floor((q.bx - N.x0) / N.cell), j = Math.floor((q.by - N.y0) / N.cell);
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const a = i + di, b = j + dj;
    if (a >= 0 && b >= 0 && a < N.nx && b < N.ny && N.h[b * N.nx + a] > -90) return true;
  }
  return false;
}
/** is this point of the terrain mesh (a triangle's centre) inside the doorway cut into the cliff face? */
export function caveHole(x, y, z) {
  if (!CAVE.ready) return false;
  const q = caveLocal(x, z), dy = y - CAVE.oy;
  return Math.abs(q.bx) < 2.15 && q.by > 0.4 && q.by < 6.4 && dy > 0.15 && dy < 4.2;
}

/** the Ascent: benches cut into the cone make a walkable switchback to a basecamp ledge; rest ledges and a rim walk are cut the same way */
function buildAscent() {
  const A = ASCENT, DEG = Math.PI / 180;
  const th1 = A.theta, r1 = A.rBase;
  // four legs of switchback across the south-east face (clear of the temple, the spring and the lava), hairpins at each end;
  // each leg is [r from, r to, theta from, theta to] in degrees, the last arriving under the climb
  const legs = [[80, 71, 46, 86], [71, 62, 86, 46], [62, 53, 46, 86], [53, r1, 86, th1 / DEG]];
  const pts = []; let prev = null;
  const push = (x, z) => { if (!prev || Math.hypot(x - prev.x, z - prev.z) >= 1.7) { pts.push({ x, z }); prev = { x, z }; } };
  legs.forEach((lg, k) => {
    const [ra, rb, ta, tb] = lg, n = Math.max(8, Math.ceil(Math.abs(tb - ta) * DEG * (ra + rb) / 2 / 1.2));
    for (let i = 0; i <= n; i++) {
      const f = i / n, th = (ta + (tb - ta) * f) * DEG, rr = ra + (rb - ra) * f + (k < 3 ? 0.9 * Math.sin(f * 9 + k * 2) : 0);
      push(VOL.x + Math.cos(th) * rr, VOL.z + Math.sin(th) * rr);
    }
    if (k < legs.length - 1) {                       // the hairpin: a half circle from the end of this leg to the start of the next
      const nx = legs[k + 1], Ax = prev.x, Az = prev.z, Bx = VOL.x + Math.cos(nx[2] * DEG) * nx[0], Bz = VOL.z + Math.sin(nx[2] * DEG) * nx[0];
      const q = pts[pts.length - 2], tx = Ax - q.x, tz = Az - q.z, tl = Math.hypot(tx, tz) || 1;
      const cx = (Ax + Bx) / 2, cz = (Az + Bz) / 2, rad = Math.hypot(Bx - Ax, Bz - Az) / 2;
      for (let j = 1; j <= 8; j++) { const ph = (j / 9) * Math.PI; push(cx + (Ax - cx) * Math.cos(ph) + (tx / tl) * rad * Math.sin(ph), cz + (Az - cz) * Math.cos(ph) + (tz / tl) * rad * Math.sin(ph)); }
    }
  });
  // bench height: the cone under the centre line, smoothed, with the climb rate capped so it is always walkable
  const raw = pts.map((p) => rawNoFlat(p.x, p.z));
  const sm = raw.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - 4); j <= Math.min(raw.length - 1, i + 4); j++) { s += raw[j]; n++; } return s / n; });
  for (let i = 1; i < sm.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); sm[i] = Math.min(sm[i], sm[i - 1] + 0.5 * d); sm[i] = Math.max(sm[i], sm[i - 1] - 0.2 * d); }
  pts.forEach((p, i) => { A.trail.push({ x: p.x, z: p.z, y: sm[i] }); flats.push({ x: p.x, z: p.z, r0: 1.5, r1: 3.6, y: sm[i] }); });
  // basecamp ledge at the end of the trail, directly under the climb
  const dx = Math.cos(th1), dz = Math.sin(th1);
  const bc = { x: VOL.x + dx * r1, z: VOL.z + dz * r1 };
  const bcY = Math.max(sm[sm.length - 1], rawNoFlat(bc.x, bc.z) - 0.5);
  A.bc = { x: bc.x, z: bc.z, y: bcY };
  flats.push({ x: bc.x, z: bc.z, r0: 4.2, r1: 7.5, y: bcY });
  // the trail's last metres run into the ledge
  const last = A.trail[A.trail.length - 1];
  for (let q = 1; q <= 4; q++) { const f = q / 5; flats.push({ x: last.x + (bc.x - last.x) * f, z: last.z + (bc.z - last.z) * f, r0: 1.5, r1: 3.6, y: last.y + (bcY - last.y) * f }); }
  // rest ledges on the wall, and the crest
  const stations = [{ id: 'base', r: r1, x: bc.x, z: bc.z }];
  for (const r of A.ledgeR) {
    const x = VOL.x + dx * r, z = VOL.z + dz * r, y = rawNoFlat(x, z) - 0.4;
    flats.push({ x, z, r0: 2.2, r1: 4.6, y });
    stations.push({ id: 'ledge' + r, r, x, z });
  }
  const tx = VOL.x + dx * A.rTop, tz = VOL.z + dz * A.rTop;
  const topY = rawNoFlat(tx, tz) - 0.2;
  flats.push({ x: tx, z: tz, r0: 2.6, r1: 5, y: topY });
  stations.push({ id: 'top', r: A.rTop, x: tx, z: tz });
  A.stations = stations; A.top = { x: tx, z: tz, y: topY };
  A.index = new PolyIndex([...A.trail, ...stations.map((q) => ({ x: q.x, z: q.z }))], 6);
  // a walk along the crest of the rim, so the mouth can be seen from all round
  const rimPts = [];
  for (let a = -46; a <= 46; a += 7) {
    const ang = th1 + a * DEG, x = VOL.x + Math.cos(ang) * A.rTop, z = VOL.z + Math.sin(ang) * A.rTop;
    rimPts.push({ x, z, y: rawNoFlat(x, z) });
  }
  const rs = rimPts.map((p, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - 2); j <= Math.min(rimPts.length - 1, i + 2); j++) { s += rimPts[j].y; n++; } return s / n; });
  rimPts.forEach((p, i) => { const y = Math.min(rs[i], topY + 3.0); A.rim.push({ x: p.x, z: p.z, y }); flats.push({ x: p.x, z: p.z, r0: 1.9, r1: 3.8, y }); });
}

function finalHeight(x, z) {
  let h = rawNoFlat(x, z);
  for (let k = 0; k < flats.length; k++) {
    const f = flats[k];
    const r = Math.hypot(x - f.x, z - f.z);
    if (r < f.r1) h = lerp(h, f.y, 1 - smoothstep(f.r0, f.r1, r));
  }
  // lake basin
  let r = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (r < 30) {
    const rho = lakeRho(x, z);
    if (rho < 1.32) {
      const m = 1 - smoothstep(0.88, 1.3, rho);
      const basin = LAKE.y + 0.45 - 3.8 * Math.max(0, 1 - rho * rho);
      h = lerp(h, Math.min(h, basin), m);
    }
  }
  // plunge pool
  const P = falls.pool;
  r = Math.hypot(x - P.x, z - P.z);
  if (r < P.r + 5) {
    // bowl with a retaining rim (raised on the downhill side so the pool never spills)
    const m = 1 - smoothstep(P.r + 0.5, P.r + 5, r);
    const shape = P.y + 0.5 - 3.4 * Math.max(0, 1 - (r / P.r) ** 2);
    h = lerp(h, shape, m);
  }
  // hot spring
  r = Math.hypot(x - SPRING.x, z - SPRING.z);
  if (r < SPRING.r + 3) {
    const m = 1 - smoothstep(SPRING.r - 1, SPRING.r + 3, r);
    h = lerp(h, Math.min(h, SPRING.y - 0.25 + 0.4 - 1.8 * Math.max(0, 1 - (r / SPRING.r) ** 2)), m);
  }
  // rivers
  for (const key of ['A', 'B', 'C']) {
    const rv = river[key];
    const n = carvers[key].nearest(x, z);
    if (!n) continue;
    const rw = rv.w[n.i] * 0.5;
    const t = 1 - smoothstep(rw * 0.9, rw * 2.4 + 1.5, n.d);
    const bed = rv.bed[n.i];
    if (t > 0 && h > bed) h = lerp(h, bed, t);
  }
  // lava channels
  for (const c of carvers.lava) {
    const n = c.nearest(x, z);
    if (!n || n.d > 6) continue;
    h -= 1.1 * (1 - smoothstep(1.2, 3.6, n.d));
  }
  return h;
}

/* ------------------------------------------------------------------ baked grid */
export const grid = new Float32Array(N * N);

export function buildWorld() {
  buildFeatures();
  for (let j = 0; j < N; j++) {
    const z = -HALF + j * CELL;
    for (let i = 0; i < N; i++) {
      grid[j * N + i] = finalHeight(-HALF + i * CELL, z);
    }
  }
}

export function getHeight(x, z) {
  let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  fx = clamp(fx, 0, SEG - 0.001);
  fz = clamp(fz, 0, SEG - 0.001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const a = grid[j * N + i], b = grid[j * N + i + 1], c = grid[(j + 1) * N + i], d = grid[(j + 1) * N + i + 1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

/** true on the flanks of the volcano where the rock is too steep to walk up: only the Ascent's benches, the ledges and the rim walk are flat enough */
export function volcanoSteep(x, z) {
  const dx = x - VOL.x, dz = z - VOL.z;
  if (dx * dx + dz * dz > (VOL.R * 0.95) ** 2) return false;
  getNormal(x, z, _ns);
  return _ns.y < 0.68;
}
const _ns = { x: 0, y: 1, z: 0 };

export function getNormal(x, z, out = { x: 0, y: 1, z: 0 }) {
  const e = 1.0;
  const hx = getHeight(x + e, z) - getHeight(x - e, z);
  const hz = getHeight(x, z + e) - getHeight(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz);
  out.x = -hx / l; out.y = (2 * e) / l; out.z = -hz / l;
  return out;
}
const _n = { x: 0, y: 1, z: 0 };
export const getSlope = (x, z) => 1 - getNormal(x, z, _n).y;

export function riverDist(x, z) {
  let best = 1e9;
  for (const k of ['A', 'B', 'C']) {
    const n = carvers[k].nearest(x, z);
    if (n && n.d < best) best = n.d;
  }
  return best;
}
/** distance to the Ascent's trail and ledges (so trees and rocks keep off the path) */
export function ascentDist(x, z) {
  const n = ASCENT.index ? ASCENT.index.nearest(x, z) : null;
  return n ? n.d : 1e9;
}
export function volcanoDist(x, z) { return Math.hypot(x - VOL.x, z - VOL.z); }
export function lavaDist(x, z) {
  let best = 1e9;
  for (const c of carvers.lava) {
    const n = c.nearest(x, z);
    if (n && n.d < best) best = n.d;
  }
  return best;
}

/** distance from the coast in metres (positive inland) using the baked terrain */
export const isLand = (x, z) => getHeight(x, z) > 0.15;

/** march from (x,z) along (dx,dz) until terrain height drops below `h` (a beach spot) */
export function marchToShore(x, z, dx, dz, h = 1.4, step = 0.5, max = 200) {
  for (let t = 0; t < max; t += step) {
    const px = x + dx * t, pz = z + dz * t;
    if (getHeight(px, pz) < h) return { x: px, z: pz };
  }
  return { x, z };
}

/* ------------------------------------------------------------------ walking support */
// circular colliders (tree trunks, boulders, pillars…) in a coarse hash grid
const CC = 16;
const cgrid = new Map();
const ckey = (cx, cz) => (cx + 500) * 2048 + (cz + 500);
export function addCollider(x, z, r) {
  const k = ckey(Math.floor(x / CC), Math.floor(z / CC));
  let l = cgrid.get(k);
  if (!l) cgrid.set(k, (l = []));
  const c = { x, z, r, off: false };
  l.push(c);
  return c;
}
/** the colliders within r of (x,z) (for tools and tests) */
export function collidersNear(x, z, r) {
  const out = [], cx = Math.floor(x / CC), cz = Math.floor(z / CC);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = cgrid.get(ckey(cx + a, cz + b)); if (l) for (const c of l) if (Math.hypot(c.x - x, c.z - z) < r + c.r) out.push(c); }
  return out;
}
/** push p (with .x/.z) out of any collider; returns true if it moved */
export function resolveColliders(p, pr) {
  let moved = false;
  const cx = Math.floor(p.x / CC), cz = Math.floor(p.z / CC);
  for (let it = 0; it < 2; it++)
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const l = cgrid.get(ckey(cx + a, cz + b));
        if (!l) continue;
        for (let i = 0; i < l.length; i++) {
          const c = l[i];
          if (c.off) continue;
          const dx = p.x - c.x, dz = p.z - c.z, m = c.r + pr;
          const d2 = dx * dx + dz * dz;
          if (d2 < m * m) {
            const d = Math.sqrt(d2) || 0.001;
            p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m;
            moved = true;
          }
        }
      }
  return moved;
}
// extra walkable surfaces (temple steps, dock planks …): fn(x,z) -> top y or null
const surfaces = [];
export const addSurface = (fn, tag) => surfaces.push({ fn, tag });
/** height of whatever you'd stand on at (x,z); structures only count if you can step up onto them */
export function walkHeight(x, z, fromY = 1e9, info = null) {
  const cf = CAVE.ready ? caveFloorAt(x, z) : null;
  if (cf != null && fromY <= cf + 1.4) { if (info) info.tag = 'cave'; return cf; }        // inside the cave: its floor, not the cliff above
  let y = getHeight(x, z), tag = null;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i], sy = s.fn(x, z);
    if (sy != null && sy > y && sy <= fromY + 0.8) { y = sy; tag = s.tag; }
  }
  if (info) info.tag = tag;
  return y;
}

/** the nearest stream to (x,z): {d: distance to its centre line, y: its water level there, w: its width}, or null */
export function riverNear(x, z) {
  let best = null;
  for (const k of ['A', 'B', 'C']) {
    const n = carvers[k].nearest(x, z);
    if (n && (!best || n.d < best.d)) best = { d: n.d, y: river[k].W[n.i] + 0.03, w: river[k].w[n.i] };
  }
  return best;
}

/** water surface height of a stream at (x,z), or null when not on a river */
export function riverSurface(x, z) {
  for (const k of ['A', 'B', 'C']) {
    const n = carvers[k].nearest(x, z);
    if (n && n.d < river[k].w[n.i] * 0.8) return river[k].W[n.i] + 0.03;
  }
  return null;
}
