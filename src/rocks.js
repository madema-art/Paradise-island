// Boulders: nine distinct shapes, each far more detailed than the old 80-face blob. Every shape is built from a fine icosphere pushed
// around by three octaves of noise, then given its character: rounded river stones, flat beach cobbles, fractured blocks cut by a few
// planes (the way basalt and limestone break), wide slabs, tall pillars, jagged shards and piles of several stones together. The bottom
// is cut flat so each sits half-buried. Colour is baked in (strata bands, darker crevices, lighter tops) and tinted per rock by the
// instance. Each shape also reports where its top is, so castaway, monkeys and gulls can climb on the ones that have a flat enough crown.
import * as THREE from 'three';
import { noise2 } from './noise.js';
import { mulberry32, clamp, TAU } from './util.js';

/** kind, noise seed, size range, height multiplier on the instance (sy), how much the instance may tilt, and the widest it gets (for colliders) */
export const ROCK_VARIANTS = [
  { kind: 'round',   seed: 1,  scale: [0.5, 2.5],  sy: 1.0,  tilt: 0.25, w: 1.0,  yOff: 0.05 },
  { kind: 'flat',    seed: 5,  scale: [0.6, 2.7],  sy: 1.0,  tilt: 0.15, w: 1.25, yOff: 0.0 },
  { kind: 'cobble',  seed: 9,  scale: [0.35, 1.0], sy: 1.1,  tilt: 0.35, w: 0.95, yOff: 0.0 },
  { kind: 'blocky',  seed: 13, scale: [0.6, 2.8],  sy: 1.05, tilt: 0.2,  w: 1.0,  yOff: 0.05 },
  { kind: 'blockyB', seed: 17, scale: [0.6, 2.6],  sy: 1.1,  tilt: 0.2,  w: 1.1,  yOff: 0.05 },
  { kind: 'slab',    seed: 21, scale: [0.8, 3.0],  sy: 1.0,  tilt: 0.12, w: 1.55, yOff: 0.0 },
  { kind: 'pillar',  seed: 25, scale: [0.7, 2.1],  sy: 1.0,  tilt: 0.1,  w: 0.65, yOff: 0.1 },
  { kind: 'jagged',  seed: 29, scale: [0.6, 2.2],  sy: 1.0,  tilt: 0.25, w: 0.9,  yOff: 0.05 },
  { kind: 'pile',    seed: 33, scale: [0.7, 2.2],  sy: 1.0,  tilt: 0.1,  w: 1.4,  yOff: 0.0 },
];
const IDX = (k) => ROCK_VARIANTS.findIndex((v) => v.kind === k);
/** which shapes each setting draws from (the pick itself is still one draw from the world's stream, so placement is unchanged) */
export const ROCK_SETS = {
  beach:   ['round', 'flat', 'cobble', 'cobble', 'slab', 'pile', 'round', 'flat'].map(IDX),
  river:   ['round', 'cobble', 'flat', 'round', 'pile', 'cobble', 'round'].map(IDX),
  cliff:   ['blocky', 'blockyB', 'slab', 'pillar', 'jagged', 'blocky', 'blockyB', 'pile'].map(IDX),
  volcano: ['jagged', 'blocky', 'blockyB', 'slab', 'pillar', 'jagged', 'blocky', 'pile'].map(IDX),
};

const SHAPE = { round: [1, 0.82, 1], flat: [1.25, 0.55, 1.1], cobble: [0.95, 0.7, 0.85], blocky: [1, 0.9, 0.95], blockyB: [1.1, 0.8, 0.9], slab: [1.55, 0.4, 1.1], pillar: [0.62, 1.5, 0.62], jagged: [0.9, 1.15, 0.9], pile: [1, 1, 1] };
const AMP = { round: [0.22, 0.1, 0.04], flat: [0.2, 0.09, 0.04], cobble: [0.1, 0.05, 0.02], blocky: [0.1, 0.06, 0.03], blockyB: [0.12, 0.07, 0.035], slab: [0.1, 0.06, 0.03], pillar: [0.1, 0.06, 0.03], jagged: [0.18, 0.1, 0.05] };
const PLANES = { blocky: 9, blockyB: 7, slab: 6, pillar: 8, jagged: 5 };

function single(kind, seed) {
  const rng = mulberry32(seed * 7919 + 13), rr = (a, b) => a + (b - a) * rng();
  const g = new THREE.IcosahedronGeometry(1, kind === 'cobble' ? 3 : 4);       // 320 / 500 faces
  const p = g.attributes.position, v = new THREE.Vector3();
  const planes = [];
  for (let i = 0; i < (PLANES[kind] || 0); i++) {
    const a = rng() * TAU, e = (rng() - 0.5) * (kind === 'pillar' ? 1.1 : 2.2);
    planes.push({ n: new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).normalize(), d: rr(0.62, 0.86) });
  }
  const A = AMP[kind] || AMP.round, S = SHAPE[kind];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n1 = noise2(v.x * 1.3 + seed, v.y * 1.3 + v.z * 1.1 - seed), n2 = noise2(v.x * 3.1 - seed * 2, v.z * 3.1 + v.y * 2.7 + seed), n3 = noise2(v.x * 7.3 + seed * 3, v.y * 6.9 - v.z * 7.1);
    let k = 1 + A[0] * n1 + A[1] * n2 + A[2] * n3;
    if (kind === 'jagged') k *= 1 + 0.22 * (1 - Math.abs(noise2(v.x * 2.4 + seed, v.z * 2.4 - v.y * 2)));      // ridged: shards and spurs
    v.multiplyScalar(k);
    for (const pl of planes) { const dd = v.dot(pl.n) - pl.d; if (dd > 0) v.addScaledVector(pl.n, -dd * 0.93); }  // fractured faces
    v.x *= S[0]; v.y *= S[1]; v.z *= S[2];
    if (v.y < -0.5 * S[1]) v.y = -0.5 * S[1] + (v.y + 0.5 * S[1]) * 0.05;                                       // flat, buried base
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** merge non-indexed geometries into one position array */
function merge(parts) {
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const out = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { out.set(g.attributes.position.array, o); o += g.attributes.position.array.length; g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  return g;
}

export function makeRockGeo(kind, seed = 1) {
  let g;
  if (kind === 'pile') {
    const parts = [[0, 0, 0, 1, 0], [0.95, -0.05, 0.35, 0.6, 1], [-0.75, -0.1, -0.55, 0.52, 2], [0.1, 0.05, -0.95, 0.42, 3]].map(([x, y, z, s, i]) => {
      const q = single(i === 0 ? 'round' : 'blocky', seed + i * 3), p = q.attributes.position;
      for (let j = 0; j < p.count; j++) p.setXYZ(j, p.getX(j) * s + x, p.getY(j) * s + y, p.getZ(j) * s + z);
      return q;
    });
    g = merge(parts);
  } else g = single(kind, seed);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  let top = -1e9, lo = 1e9;
  for (let i = 0; i < p.count; i++) { top = Math.max(top, p.getY(i)); lo = Math.min(lo, p.getY(i)); }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = (y - lo) / Math.max(0.1, top - lo);
    const n = noise2(x * 5 + seed, z * 5 - y * 4), strata = 0.5 + 0.5 * Math.sin(y * 7.5 + n * 1.6 + seed);
    let k = (0.7 + 0.34 * h) * (0.9 + 0.1 * strata) * (0.9 + 0.1 * (n * 0.5 + 0.5));
    if (h < 0.18) k *= 0.82;                                                      // darker, damper foot
    col[i * 3] = k; col[i * 3 + 1] = k * 0.97; col[i * 3 + 2] = k * 0.93;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  // where the crown is: its height, middle and how wide the near-flat top is (for things that climb on)
  let sx = 0, sz = 0, cnt = 0, ext = 0;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > top - 0.14 * (top - lo)) { sx += p.getX(i); sz += p.getZ(i); cnt++; }
  const cx = cnt ? sx / cnt : 0, cz = cnt ? sz / cnt : 0;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > top - 0.14 * (top - lo)) ext += Math.hypot(p.getX(i) - cx, p.getZ(i) - cz);
  g.userData.top = { y: top, cx, cz, r: cnt ? Math.max(ext / cnt, 0.05) : 0.1 };
  g.computeBoundingSphere();
  return g;
}
