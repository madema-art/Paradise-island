import * as THREE from 'three';
import { ROCK_VARIANTS, ROCK_SETS, makeRockGeo } from './rocks.js';
import { scene, updaters, U, env, events } from './core.js';
import { MB, C, jit, shade, mat4, windify, tube, lumpy, M } from './gfx.js';
import { addPerch, addCollider, getHeight, getSlope, getNormal, riverDist, lavaDist, ascentDist, TEMPLE, SPRING, FAIRY, LAKE, COVE, VOL, falls } from './world.js';
import { rnd, rr, pick, clamp, lerp, smoothstep, TAU, mulberry32 } from './util.js';
import { fbm } from './noise.js';
import * as F from './flowers.js';
import { tagInstanced } from './inspect.js';
import { waterAt, ripple } from './ripples.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const palms = [];

/* ============================================================ geometry makers */
export function makePalm(H, bx, bz, nF) {
  const mb = new MB();
  // Everything new here draws from a local generator, so the shared seeded stream (and every placement after it) is untouched.
  const lr = mulberry32((Math.round(bx * 1000) * 73856093) ^ (Math.round(bz * 1000) * 19349663) ^ Math.round(H * 100));
  const leanK = 1.15 + lr() * 0.7, ph = lr() * TAU, bend = 0.03 + lr() * 0.05;
  const trunkAt = (t, out) => out.set(
    bx * t * t * H * 0.22 * leanK + Math.sin(t * 3.4 + ph) * bend * H * t,
    H * t,
    bz * t * t * H * 0.22 * leanK + Math.cos(t * 3.1 + ph) * bend * H * t);
  const rings = 13, cen = [], rad = [], ts = [];
  for (let i = 0; i <= rings; i++) {
    const t = i === 0 || i === rings ? i / rings : (i + (lr() - 0.5) * 0.7) / rings;      // uneven ring spacing
    ts.push(t);
    cen.push(trunkAt(t, V()));
    rad.push((lerp(0.4, 0.23, t) + 0.3 * Math.exp(-t * 12)) * (i === 0 ? 1 : 0.9 + lr() * 0.2));
  }
  const tA = C('#8a6f52'), tB = C('#665038');
  tube(mb, cen, rad, 7, () => shade(tA.clone().lerp(tB, lr()), rr(0.92, 1.06)), (i) => ts[i] ** 2);
  const top = cen[rings].clone(), perchPoints = [];
  const lBase = C('#235c1d'), lTip = C('#82c443'), lMid = C('#3f8c2b');
  for (let k = 0; k < nF; k++) {
    const az = (k / nF) * TAU + rr(-0.22, 0.22) + (lr() - 0.5) * 0.3;
    const young = k % 5 === 0;
    const pitch = young ? rr(0.95, 1.3) : rr(-0.2, 0.75);
    const lm = lr() < 0.18 ? 0.55 + lr() * 0.2 : 0.8 + lr() * 0.42, droop = 0.6 + lr() * 1.1, fat = 0.8 + lr() * 0.4;    // some short, some long; stiff or drooping
    const L = (young ? rr(3.2, 4.2) : rr(5.2, 6.8)) * lm;
    const dir = V(Math.cos(az), 0, Math.sin(az)), side = V(-Math.sin(az), 0, Math.cos(az));
    const st = 14, R = [];
    for (let s = 0; s <= st; s++) {
      const u = s / st;
      R.push(top.clone().addScaledVector(dir, L * u * Math.cos(pitch)).add(V(0, L * u * Math.sin(pitch) - L * 0.1 * u * u * (young ? 0.6 : 2.6) * droop + 0.15, 0)));
    }
    if (!young) perchPoints.push(R[4].clone().add(V(0, .015, 0)));
    for (let s = 1; s < st; s++) {
      const u = s / st;
      const len = (0.3 + 1.4 * Math.sin(Math.PI * Math.pow(u, 0.75))) * (young ? 0.75 : 1) * fat;
      for (const sg of [-1, 1]) {
        const tip = R[s].clone().addScaledVector(side, sg * len * 0.95).addScaledVector(dir, len * 0.55).add(V(0, -len * 0.5, 0));
        const c0 = shade(lBase, rr(0.9, 1.15)), c1 = lTip.clone().lerp(lMid, rnd() * 0.6);
        mb.tri(R[s], R[s + 1], tip, c0, c0, c1, 1 + u * 0.2, 1 + (u + 1 / st) * 0.2, 1.45 + u * 0.9);
      }
    }
  }
  const nut = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.06, 3);
  for (let k = 0; k < 3; k++) {                           // dead brown fronds hanging below the crown
    const az = rnd() * TAU, dir = V(Math.cos(az), 0, Math.sin(az)), side = V(-Math.sin(az), 0, Math.cos(az)), L = rr(3.4, 4.6), R = [];
    for (let q = 0; q <= 8; q++) { const u = q / 8; R.push(top.clone().addScaledVector(dir, L * u * 0.55).add(V(0, -L * u * u * 0.9 + 0.1, 0))); }
    for (let q = 1; q < 8; q++) { const u = q / 8, len = 0.25 + 0.8 * Math.sin(Math.PI * u); for (const sg of [-1, 1]) { const tip = R[q].clone().addScaledVector(side, sg * len * 0.5).add(V(0, -len * 0.8, 0)); const c0 = C('#6b5a34'), c1 = C('#9a8450'); mb.tri(R[q], R[q + 1], tip, c0, c0, c1, 1.1 + u * 0.2, 1.1 + u * 0.2, 1.6 + u); } }
  }
  const nuts = 6 + Math.floor(rnd() * 6);
  for (let i = 0; i < nuts; i++) {
    const a = (i / nuts) * TAU + rnd();
    const c = rnd() < 0.55 ? C('#6b8a2c') : C('#5c3d1e');
    mb.addGeo(nut, mat4(top.x + Math.cos(a) * 0.4 + rr(-0.12, 0.12), top.y - 0.4 - (i % 3) * 0.2, top.z + Math.sin(a) * 0.4 + rr(-0.12, 0.12), 0.27), c, 1.1);
  }
  const pt = trunkAt;
  return { geo: mb.build(), pt, H, perchPoints };
}

function treeA() {
  const mb = new MB(), H = rr(7, 11);
  const lean = V(rr(-1, 1), 0, rr(-1, 1));
  const cen = [], rad = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    cen.push(V(lean.x * t * t * 1.6, H * t, lean.z * t * t * 1.6));
    rad.push(lerp(0.5, 0.2, t) + 0.25 * Math.exp(-t * 10));
  }
  tube(mb, cen, rad, 6, () => shade(C('#6b5238'), rr(0.85, 1.1)), (i) => (i / 6) ** 2 * 0.5);
  const top = cen[6];
  const greens = ['#2f7a2b', '#3d8c33', '#276a2a', '#4f9c38', '#35822f'];
  const n = 5 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd();
    const r0 = i === 0 ? 0 : rr(1.6, 2.6);
    const c = V(top.x + Math.cos(a) * r0, top.y + rr(-0.8, 1.4) + (i === 0 ? 1.3 : 0), top.z + Math.sin(a) * r0);
    const R = rr(2.1, 3.3);
    const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.28, i * 3.1);
    const base = C(pick(greens));
    mb.addGeo(g, mat4(c.x, c.y, c.z, R, R * rr(0.65, 0.85), R), (v) => shade(base, 0.78 + 0.45 * clamp(((v.y - c.y) / R) * 0.5 + 0.5, 0, 1)), 0.9 + 0.2 * rnd());
  }
  return mb.build();
}

function treeB(flame) {
  const mb = new MB(), H = rr(17, 25);
  const cen = [], rad = [];
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    cen.push(V(Math.sin(t * 3) * 0.5, H * t, Math.cos(t * 2.4) * 0.5));
    rad.push(lerp(0.95, 0.42, t) + 0.5 * Math.exp(-t * 14));
  }
  tube(mb, cen, rad, 7, (i) => shade(C('#6d5a48'), rr(0.85, 1.1)), (i) => (i / 9) ** 2 * 0.4);
  const bc = C('#5e4a38');
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + rr(-0.3, 0.3);
    const ca = Math.cos(a), sa = Math.sin(a);
    mb.tri(V(ca * 0.9, 6, sa * 0.9), V(ca * 0.7, 0, sa * 0.7), V(ca * 3.0, -0.4, sa * 3.0), bc, bc, bc);
    const b = a + 0.12, cb = Math.cos(b), sb = Math.sin(b);
    mb.tri(V(cb * 0.9, 6, sb * 0.9), V(cb * 3.0, -0.4, sb * 3.0), V(cb * 0.7, 0, sb * 0.7), bc, bc, bc);
  }
  const top = cen[9];
  const greens = flame ? ['#d9602e', '#e8803a', '#c9482f', '#e89a4a', '#4c9a35'] : ['#1f6a2e', '#2a7a34', '#1c5c2c', '#34883a'];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd();
    const r0 = i === 0 ? 0 : rr(3.5, 6);
    const c = V(top.x + Math.cos(a) * r0, top.y + rr(-1.2, 1.4), top.z + Math.sin(a) * r0);
    const R = rr(4.2, 6.2);
    const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.3, i * 1.7);
    const base = C(pick(greens));
    mb.addGeo(g, mat4(c.x, c.y, c.z, R, R * 0.55, R), (v) => shade(base, 0.78 + 0.4 * clamp(((v.y - c.y) / R) * 0.9 + 0.5, 0, 1)), 0.9 + 0.2 * rnd());
  }
  // hanging vines
  const vc = C('#2e6f2c');
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, r = rr(2.5, 6);
    const x = top.x + Math.cos(a) * r, z = top.z + Math.sin(a) * r, y0 = top.y - 1.2, len = rr(5, 10);
    const dx = Math.cos(a + 1.57) * 0.1, dz = Math.sin(a + 1.57) * 0.1;
    mb.tri(V(x - dx, y0, z - dz), V(x + dx, y0, z + dz), V(x, y0 - len, z), vc, vc, shade(vc, 1.3), 0.7, 0.7, 1.6);
  }
  return mb.build();
}

function bamboo() {
  const mb = new MB();
  const nA = C('#9db84e'), nB = C('#6f9a35'), leaf = C('#8fc246');
  for (let c = 0; c < 9; c++) {
    const a = rnd() * TAU, r = rr(0.1, 1.1), H = rr(7, 12), bend = rr(0.6, 1.8);
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r, dx = Math.cos(a), dz = Math.sin(a);
    const cen = [], rad = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      cen.push(V(bx + dx * bend * t * t, H * t, bz + dz * bend * t * t));
      rad.push(0.13 - 0.05 * t);
    }
    tube(mb, cen, rad, 5, (i) => (i % 2 ? nA : nB), (i) => (i / 6) ** 2 * 0.8);
    const top = cen[6];
    for (let l = 0; l < 7; l++) {
      const b = rnd() * TAU;
      const tip = top.clone().add(V(Math.cos(b) * 1.5, -1.0 - rnd() * 0.5, Math.sin(b) * 1.5));
      const s = V(-Math.sin(b) * 0.2, 0, Math.cos(b) * 0.2);
      mb.tri(top.clone().sub(s), top.clone().add(s), tip, leaf, leaf, shade(leaf, 1.2), 1.2, 1.2, 2.0);
    }
  }
  return mb.build();
}

function banana() {
  const mb = new MB();
  const cen = [], rad = [];
  for (let i = 0; i <= 4; i++) { cen.push(V(0, i * 0.8, 0)); rad.push(0.3 - i * 0.03); }
  tube(mb, cen, rad, 6, () => C('#87a448'), (i) => i * 0.1);
  const top = V(0, 3.2, 0);
  const lc = C('#4aa83a'), lc2 = C('#7cc74a');
  for (let k = 0; k < 8; k++) {
    const az = (k / 8) * TAU + rnd() * 0.3, dir = V(Math.cos(az), 0, Math.sin(az)), side = V(-Math.sin(az), 0, Math.cos(az));
    const L = rr(3, 4), st = 8, pitch = rr(0.2, 0.9);
    const P = [];
    for (let s = 0; s <= st; s++) {
      const u = s / st;
      P.push(top.clone().addScaledVector(dir, L * u * Math.cos(pitch)).add(V(0, L * u * Math.sin(pitch) - L * 0.55 * u * u, 0)));
    }
    for (let s = 0; s < st; s++) {
      const u = s / st, u2 = (s + 1) / st;
      const w1 = 0.95 * Math.sin(Math.PI * Math.pow(u + 0.06, 0.7)), w2 = 0.95 * Math.sin(Math.PI * Math.pow(u2 + 0.04, 0.7));
      const c = lc.clone().lerp(lc2, u);
      mb.quad(P[s].clone().addScaledVector(side, -w1), P[s].clone().addScaledVector(side, w1), P[s + 1].clone().addScaledVector(side, w2), P[s + 1].clone().addScaledVector(side, -w2), c, 1 + u2);
    }
  }
  return mb.build();
}

function fern() {
  const mb = new MB();
  const lb = C('#2c7e2b'), lt = C('#86d04e');
  const nF = 9;
  for (let k = 0; k < nF; k++) {
    const az = (k / nF) * TAU + rnd() * 0.3;
    const dir = V(Math.cos(az), 0, Math.sin(az)), side = V(-Math.sin(az), 0, Math.cos(az));
    const L = rr(1.5, 2.2), pitch = rr(0.5, 1.0), st = 8, R = [];
    for (let s = 0; s <= st; s++) {
      const u = s / st;
      R.push(V(0, 0.15, 0).addScaledVector(dir, L * u * Math.cos(pitch)).add(V(0, L * u * Math.sin(pitch) - L * 0.55 * u * u, 0)));
    }
    for (let s = 1; s < st; s++) {
      const u = s / st, len = 0.18 + 0.45 * Math.sin(Math.PI * u);
      for (const sg of [-1, 1]) {
        const tip = R[s].clone().addScaledVector(side, sg * len).addScaledVector(dir, len * 0.4).add(V(0, -len * 0.3, 0));
        mb.tri(R[s], R[s + 1], tip, lb, lb, lt.clone().lerp(lb, rnd() * 0.5), 0.5 + u, 0.5 + u, 1 + u * 1.2);
      }
    }
  }
  return mb.build();
}

const FLOWER = ['#ff4f7a', '#ffd23f', '#fff6e8', '#ff7a2f', '#c64fff'];
function bush(flowers) {
  const mb = new MB();
  const greens = ['#2e7a2c', '#3c8a30', '#4a9a38'];
  const n = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, r0 = i ? rr(0.5, 1.1) : 0;
    const c = V(Math.cos(a) * r0, rr(0.5, 0.8), Math.sin(a) * r0), R = rr(0.7, 1.15);
    const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.25, i);
    const base = C(pick(greens));
    mb.addGeo(g, mat4(c.x, c.y, c.z, R, R * 0.8, R), (v) => shade(base, 0.8 + 0.4 * clamp(((v.y - c.y) / R) * 0.5 + 0.5, 0, 1)), 0.6);
    if (flowers) {
      for (let f = 0; f < 5; f++) {
        const th = rnd() * TAU, ph = rr(0.05, 1.15), dir = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
        const p = c.clone().add(V(dir.x * R * 1.25, dir.y * R * 0.82 * 1.25, dir.z * R * 1.25)), col = pick(FLOWER);
        if (rnd() < 0.45) F.hibiscus(mb, p, dir, col, 0.7); else F.daisy(mb, p, dir, col, 0.7);
      }
    }
  }
  return mb.build();
}

/* ============================================================ placement */
export const jungleN = (x, z) => fbm(x * 0.012 + 40, z * 0.012, 3);
export const clearOf = (x, z, rd = 3) => {
  if (riverDist(x, z) < rd) return false;
  if (Math.hypot(x - falls.pool.x, z - falls.pool.z) < 24) return false;
  if (Math.hypot(x - falls.ledge.x, z - falls.ledge.z) < 20) return false;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < 21) return false;
  if (Math.hypot(x - SPRING.x, z - SPRING.z) < 11) return false;
  if (lavaDist(x, z) < 8) return false;
  if (ascentDist(x, z) < 2.2 + rd * 0.9) return false;
  return true;
};
export function place(n, test, tries = n * 60, R = 195) {
  const out = [];
  for (let t = 0; t < tries && out.length < n; t++) {
    const x = rr(-R, R), z = rr(-R, R);
    const h = getHeight(x, z);
    if (h < 0.5) continue;
    const s = getSlope(x, z);
    const w = test(x, z, h, s);
    if (w && (w === true || rnd() < w)) out.push({ x, z, y: h, s });
  }
  return out;
}

export function instanced(geo, mat, list, { cast = true, receive = true, scale = [0.85, 1.25], tilt = 0.04, color = null, yOff = 0, inspect = null } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach((a, i) => {
    const sc = rr(scale[0], scale[1]);
    a.rot = rnd() * TAU; a.sc = sc;
    e.set((rnd() - 0.5) * tilt, a.rot, (rnd() - 0.5) * tilt);
    q.setFromEuler(e);
    m.compose(p.set(a.x, a.y + yOff, a.z), q, s.set(sc, sc * (a.syMul || 1), sc));
    im.setMatrixAt(i, m);
    if (color) im.setColorAt(i, color(a));
  });
  im.count = list.length;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = cast; im.receiveShadow = receive;
  scene.add(im);
  if (inspect) tagInstanced(im, inspect);
  return im;
}

export const vegMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, flatShading: true });
windify(vegMat);

/* grass blade texture */
function grassTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x0 = 14 + (i / 8) * 100 + (Math.random() - 0.5) * 10, h = 70 + Math.random() * 54, tipx = x0 + (Math.random() - 0.5) * 44, w = 5 + Math.random() * 4;
    const gr = g.createLinearGradient(0, 128, 0, 128 - h);
    gr.addColorStop(0, '#2c5a1c'); gr.addColorStop(0.6, '#5f9f2d'); gr.addColorStop(1, '#bfe36a');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x0 - w, 128);
    g.quadraticCurveTo(x0 - w * 0.5, 128 - h * 0.55, tipx, 128 - h);
    g.quadraticCurveTo(x0 + w * 0.5, 128 - h * 0.55, x0 + w, 128);
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function grassGeometry() {
  const pos = [], uv = [], nor = [], idx = [], wind = [];
  for (let k = 0; k < 2; k++) {
    const a = k * (Math.PI / 2) + 0.4, ca = Math.cos(a) * 0.5, sa = Math.sin(a) * 0.5;
    const b = pos.length / 3;
    pos.push(-ca, 0, -sa, ca, 0, sa, ca, 1, sa, -ca, 1, -sa);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let i = 0; i < 4; i++) nor.push(0, 1, 0);
    wind.push(0, 0, 1, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 1));
  g.setIndex(idx);
  return g;
}
function bladeGeometry() {
  const pos = [], nor = [], wind = [];
  for (let k = 0; k < 2; k++) {
    const a = k * 1.57 + 0.3, ca = Math.cos(a) * 0.09, sa = Math.sin(a) * 0.09;
    pos.push(-ca, 0, -sa, ca, 0, sa, 0.0, 1.2, 0.0);
    for (let i = 0; i < 3; i++) nor.push(0, 1, 0);
    wind.push(0, 0, 1.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 1));
  return g;
}

/* ============================================================ coral */
export function coralGeo(kind) {
  const mb = new MB();
  const white = C('#ffffff');
  if (kind === 0) {
    // branching (staghorn-like): a few thick-based branches that split into twigs, about 0.3 to 0.6 m tall
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * TAU + rnd() * 0.6, tilt = rr(0.15, 0.55), h = rr(0.3, 0.55);
      const base = V(rr(-0.04, 0.04), 0, rr(-0.04, 0.04));
      const cen = [base, V(Math.cos(a) * tilt * h * 0.4, h * 0.5, Math.sin(a) * tilt * h * 0.4), V(Math.cos(a) * tilt * h, h, Math.sin(a) * tilt * h)];
      tube(mb, cen, [0.06, 0.04, 0.012], 6, () => shade(white, rr(0.85, 1.1)), () => 0.5);
      for (let t = 0; t < 2; t++) {
        const s = cen[1].clone().lerp(cen[2], rr(0.3, 0.7));
        const ta = a + (t ? 0.9 : -0.9) + rr(-0.2, 0.2);
        const tip = s.clone().add(V(Math.cos(ta) * 0.14, rr(0.1, 0.2), Math.sin(ta) * 0.14));
        tube(mb, [s, tip], [0.03, 0.01], 5, () => shade(white, rr(0.85, 1.1)), () => 0.5);
      }
    }
  } else if (kind === 1) {
    // massive or brain coral: a low dome with shallow ridges, about 0.3 to 0.4 m across
    const g = lumpy(new THREE.IcosahedronGeometry(1, 2), 0.06, 4);
    mb.addGeo(g, mat4(0, 0.12, 0, 0.26, 0.17, 0.26), (v) => shade(white, 0.75 + 0.35 * Math.min(1, Math.max(0, v.y * 2 + 0.5))), 0.2);
  } else {
    // plate or fan coral: two crossed thin fans about 0.4 m across
    const fan = new THREE.CircleGeometry(0.22, 10, 0, Math.PI);
    mb.addGeo(fan, mat4(0, 0.02, 0, 1, 1, 1, 0, 0, 0), (v) => shade(white, 0.75 + 0.35 * v.y), 0.8);
    mb.addGeo(fan, mat4(0, 0.02, 0, 1, 1, 1, 0, 1.57, 0), (v) => shade(white, 0.75 + 0.35 * v.y), 0.8);
  }
  return mb.build();
}

/* ============================================================ build */
export function buildFlora() {
  const result = { palms, coconuts: null };

  /* ----- palms ----- */
  const palmVariants = [
    makePalm(rr(10, 12), 0.9, 0.2, 19), makePalm(rr(11, 14), -0.7, 0.8, 21), makePalm(rr(9, 12), 0.2, -1.0, 18), makePalm(rr(12, 15), 1.0, 0.9, 20), makePalm(rr(7.5, 9.5), -0.4, 1.2, 17), makePalm(rr(13, 16), 0.5, -0.5, 22),
  ];
  const palmPlace = place(
    300,
    (x, z, h, s) => {
      if (h > 9 || s > 0.4 || !clearOf(x, z, 2.5)) return false;
      const cd = Math.hypot(x - COVE.x, z - COVE.z);
      let w = 1 - smoothstep(3.0, 8.5, h);
      if (h < 1.6) w *= 0.15;
      w *= 0.6 + 0.8 * smoothstep(0.0, 0.3, jungleN(x * 1.3, z * 1.3) + 0.1);
      if (cd < 70) w *= 1.8;
      if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 16) w *= 0.2;
      return w;
    },
    300 * 120
  );
  const byV = palmVariants.map(() => []);
  palmPlace.forEach((a) => { a.v = Math.floor(rnd() * palmVariants.length); byV[a.v].push(a); });
  palmVariants.forEach((pv, i) => {
    const im = instanced(pv.geo, vegMat, byV[i], { inspect: 'palm', scale: [0.8, 1.25], tilt: 0.05 });
    byV[i].forEach((a, index) => {
      const matrix = new THREE.Matrix4(); im.getMatrixAt(index, matrix);
      a.perches = pv.perchPoints.map(p => p.clone().applyMatrix4(matrix));
      a.pv = pv;
      addCollider(a.x, a.z, 0.55 * a.sc);
      a.crown = new THREE.Vector3();
      pv.pt(1, a.crown);
      a.crown.multiplyScalar(a.sc).applyAxisAngle(new THREE.Vector3(0, 1, 0), a.rot).add(new THREE.Vector3(a.x, a.y, a.z));
      palms.push(a);
    });
  });
  // trunk point helper in world space
  const _axis = new THREE.Vector3(0, 1, 0);
  const trunkPoint = (a, t, out) => {
    a.pv.pt(t, out);
    return out.multiplyScalar(a.sc).applyAxisAngle(_axis, a.rot).add(new THREE.Vector3(a.x, a.y, a.z));
  };

  /* ----- jungle trees ----- */
  const jungleOK = (x, z, h, s, lo, hi) => {
    if (h < lo || h > hi || s > 0.5 || !clearOf(x, z, 5.5)) return false;
    const n3 = jungleN(x, z);
    const vegLimit = 30 + 14 * n3;
    if (Math.hypot(x - VOL.x, z - VOL.z) < VOL.R + 10 && h > vegLimit - 6) return false;
    if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 31) return false;
    if (Math.hypot(x - FAIRY.x, z - FAIRY.z) < 14) return false;
    return smoothstep(-0.18, 0.2, n3) * 0.9 + 0.12;
  };
  const tA = [treeA(), treeA(), treeA(), treeA()];
  const tAList = place(250, (x, z, h, s) => jungleOK(x, z, h, s, 3.5, 40), 250 * 60);
  const bucketA = tA.map(() => []);
  tAList.forEach((a) => bucketA[Math.floor(rnd() * 4)].push(a));
  tA.forEach((g, i) => instanced(g, vegMat, bucketA[i], { inspect: 'treeA', scale: [0.8, 1.35] }));
  tAList.forEach((a) => addCollider(a.x, a.z, 0.5 * a.sc));
  const tB = [treeB(false), treeB(false), treeB(false), treeB(false), treeB(false), treeB(false), treeB(true)];
  const tBList = place(40, (x, z, h, s) => jungleOK(x, z, h, s, 6, 36) && riverDist(x, z) > 9 && rnd() < 0.5, 40 * 150);
  const bucketB = tB.map(() => []);
  tBList.forEach((a) => bucketB[Math.floor(rnd() * 7)].push(a));
  tB.forEach((g, i) => instanced(g, vegMat, bucketB[i], { inspect: 'treeB', scale: [0.85, 1.25] }));
  tBList.forEach((a) => addCollider(a.x, a.z, 1.5 * a.sc));

  const bam = [bamboo(), bamboo()];
  const bamList = place(26, (x, z, h, s) => { const rd = riverDist(x, z); return rd > 3.5 && rd < 14 && s < 0.35 && h > 2 && Math.hypot(x - falls.pool.x, z - falls.pool.z) > 17 && Math.hypot(x - falls.ledge.x, z - falls.ledge.z) > 14; }, 26 * 400);
  const bamB = [[], []];
  bamList.forEach((a) => bamB[Math.floor(rnd() * 2)].push(a));
  bam.forEach((g, i) => instanced(g, vegMat, bamB[i], { inspect: 'bamboo', scale: [0.9, 1.3] }));
  bamList.forEach((a) => addCollider(a.x, a.z, 1.0 * a.sc));

  const bnn = [banana(), banana()];
  const bnList = place(70, (x, z, h, s) => {
    if (s > 0.35 || h > 14 || h < 2.5 || !clearOf(x, z, 4)) return false;
    return smoothstep(30, 6, riverDist(x, z)) * 0.8 + 0.1;
  }, 70 * 200);
  const bnB = [[], []];
  bnList.forEach((a) => bnB[Math.floor(rnd() * 2)].push(a));
  bnn.forEach((g, i) => instanced(g, vegMat, bnB[i], { inspect: 'banana', scale: [0.85, 1.3] }));
  bnList.forEach((a) => addCollider(a.x, a.z, 0.4 * a.sc));

  const ferns = [fern(), fern()];
  const fList = place(1100, (x, z, h, s) => {
    if (h < 3.5 || h > 42 || s > 0.5 || !clearOf(x, z, 1.8)) return false;
    if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 12) return rnd() < 0.2;
    return smoothstep(-0.1, 0.25, jungleN(x, z)) * 0.9 + 0.15;
  }, 1100 * 30);
  const fB = [[], []];
  fList.forEach((a) => fB[Math.floor(rnd() * 2)].push(a));
  ferns.forEach((g, i) => instanced(g, vegMat, fB[i], { inspect: 'fern', scale: [0.8, 1.7], cast: false }));

  const bushes = [bush(true), bush(true), bush(false)];
  const bList = place(520, (x, z, h, s) => {
    if (h < 2.2 || h > 38 || s > 0.5 || !clearOf(x, z, 2)) return false;
    if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 9) return false;
    return 0.5;
  }, 520 * 40);
  const bB = [[], [], []];
  bList.forEach((a) => bB[Math.floor(rnd() * 3)].push(a));
  bushes.forEach((g, i) => instanced(g, vegMat, bB[i], { inspect: 'bush', scale: [0.7, 1.5], cast: false }));

  /* ----- grass ----- */
  const gm = new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
  windify(gm, { grass: true });
  const gList = place(30000, (x, z, h, s) => {
    if (h < 2.6 || h > 46 || s > 0.42) return false;
    if (riverDist(x, z) < 1.5 || lavaDist(x, z) < 6) return false;
    if (Math.hypot(x - falls.pool.x, z - falls.pool.z) < 14 || Math.hypot(x - falls.ledge.x, z - falls.ledge.z) < 13) return false;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < 18) return false;
    if (Math.hypot(x - VOL.x, z - VOL.z) < VOL.R + 10 && h > 28 + 14 * jungleN(x, z) - 4) return false;
    if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 9) return rnd() < 0.15;
    return smoothstep(2.8, 5.0, h) * (0.55 + 0.45 * (1 - smoothstep(-0.1, 0.35, jungleN(x, z))) + 0.25);
  }, 30000 * 8);
  const grassIM = instanced(grassGeometry(), gm, gList, {
    cast: false, receive: false, scale: [0.5, 1.15], tilt: 0.0,
    color: () => new THREE.Color().setHSL(rr(0.22, 0.29), rr(0.45, 0.65), rr(0.38, 0.55)),
  });

  /* ----- rocks ----- */
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const rg = ROCK_VARIANTS.map((v) => makeRockGeo(v.kind, v.seed));
  const stackGeo = makeRockGeo('blocky', 41);
  const rockSpots = [];
  rockSpots.push(...place(110, (x, z, h) => h > 0.2 && h < 2.4 && getSlope(x, z) < 0.5 && rnd() < 0.5, 110 * 600).map((a) => ({ ...a, k: 'beach' })));
  rockSpots.push(...place(70, (x, z, h) => { const rd = riverDist(x, z); return rd < 5 && h > 0.5; }, 70 * 900).map((a) => ({ ...a, k: 'river' })));
  rockSpots.push(...place(140, (x, z, h, s) => s > 0.5 && h > 3, 140 * 500).map((a) => ({ ...a, k: 'cliff' })));
  rockSpots.push(...place(230, (x, z, h, s) => {
    const vr = Math.hypot(x - VOL.x, z - VOL.z);
    return vr < VOL.R && vr > 18 && h > 20 && rnd() < 0.4 + 0.5 * smoothstep(30, 90, h);
  }, 230 * 200).map((a) => ({ ...a, k: 'volcano' })));
  const rBy = ROCK_VARIANTS.map(() => []);
  rockSpots.forEach((a) => {
    a.syMul = rr(0.5, 0.9);
    const set = ROCK_SETS[a.k];
    a.v = set[Math.floor(rnd() * set.length)];                    // one draw, as before: the shape depends on the setting, never on the placement
    a.syMul *= ROCK_VARIANTS[a.v].sy;
    rBy[a.v].push(a);
  });
  rBy.forEach((l, i) => {
    const V = ROCK_VARIANTS[i];
    const im = instanced(rg[i], rockMat, l, { inspect: 'rock',
      scale: V.scale, tilt: V.tilt, yOff: V.yOff,
      color: (a) => {
        if (a.k === 'volcano') return new THREE.Color().setHSL(0.05, 0.1, rr(0.1, 0.22), THREE.SRGBColorSpace);
        if (a.k === 'beach') return new THREE.Color().setHSL(0.09, 0.12, rr(0.55, 0.72), THREE.SRGBColorSpace);
        return new THREE.Color().setHSL(0.08, 0.06, rr(0.45, 0.65), THREE.SRGBColorSpace);
      },
    });
    const T = rg[i].userData.top;
    l.forEach((a) => {
      if (a.sc * V.w >= 0.9) addCollider(a.x, a.z, 0.72 * a.sc * Math.min(V.w, 1.3));
      // a crown that is high enough to be worth climbing and wide enough to stand on is a perch for the castaway, monkeys and birds
      const topY = V.yOff + T.y * a.sc * a.syMul, tr = T.r * a.sc * 0.8;
      if (topY > 0.5 && topY < 2.3 && tr > 0.38 && a.y > 0.4) {
        const c = Math.cos(a.rot), s = Math.sin(a.rot), ox = T.cx * a.sc, oz = T.cz * a.sc;
        addPerch(a.x + ox * c + oz * s, a.z - ox * s + oz * c, tr, a.y + topY, a.k);
      }
    });
  });

  /* sea stacks at the cove mouth */
  const stackList = [
    { x: COVE.x - 26, z: COVE.z + 40, big: 7 }, { x: COVE.x + 31, z: COVE.z + 46, big: 5 }, { x: COVE.x + 52, z: COVE.z + 20, big: 4 },
    { x: COVE.x - 44, z: COVE.z + 18, big: 3.5 }, { x: COVE.x - 18, z: COVE.z + 60, big: 4 }, { x: COVE.x + 8, z: COVE.z + 82, big: 5.5 }, { x: -92, z: 148, big: 5 }, { x: 150, z: 120, big: 4.5 },
  ];
  const stackMesh = new THREE.InstancedMesh(stackGeo, rockMat, stackList.length);
  stackList.forEach((s, i) => {
    const sc = s.big;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, getHeight(s.x, s.z) + sc * 0.5, s.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(sc * 0.9, sc * 1.8, sc * 0.9));
    stackMesh.setMatrixAt(i, m);
    addCollider(s.x, s.z, 0.8 * sc);
    stackMesh.setColorAt(i, new THREE.Color().setHSL(0.08, 0.1, 0.5 + 0.1 * rnd(), THREE.SRGBColorSpace));
  });
  stackMesh.castShadow = true; stackMesh.receiveShadow = true;
  scene.add(stackMesh);
  tagInstanced(stackMesh, 'rock');

  /* ----- underwater life: coral + seagrass ----- */
  const cMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true, side: THREE.DoubleSide, emissive: 0x111111 });
  windify(cMat);
  const coralG = [coralGeo(0), coralGeo(1), coralGeo(2)];
  const cSpots = [];
  for (let t = 0; t < 70000 && cSpots.length < 900; t++) {
    const x = rr(-210, 210), z = rr(-190, 215), h = getHeight(x, z);
    if (h > -0.9 || h < -10) continue;
    const cd = Math.hypot(x - COVE.x, z - COVE.z);
    const patch = fbm(x * 0.05 + 3, z * 0.05 - 8, 2);
    if (cd < 62 ? patch > -0.05 : patch > 0.18 && h > -6) cSpots.push({ x, z, y: h });
  }
  const cBy = [[], [], []];
  cSpots.forEach((a) => cBy[Math.floor(rnd() * 3)].push(a));
  const coralCols = ['#ff6f91', '#ff9a3c', '#c05cff', '#ffd23f', '#59e0c8', '#ff5a5a', '#8ad14a'];
  cBy.forEach((l, i) => instanced(coralG[i], cMat, l, { inspect: 'coral', scale: [0.8, 1.3], tilt: 0.25, color: () => C(pick(coralCols)) }));

  const sgMat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
  windify(sgMat, { grass: true });
  const sgSpots = [];
  for (let t = 0; t < 90000 && sgSpots.length < 3500; t++) {
    const x = rr(COVE.x - 70, COVE.x + 70), z = rr(COVE.z - 60, COVE.z + 70), h = getHeight(x, z);
    if (h > -0.7 || h < -4.2) continue;
    if (fbm(x * 0.07, z * 0.07, 2) > 0.05 && rnd() < 0.9) continue;
    // keep the coral garden and the giant clam clear of seagrass, so the reef reads as coral
    if (Math.hypot(x - (COVE.x - 24), z - (COVE.z - 2)) < 34 || Math.hypot(x - (COVE.x - 12), z - (COVE.z + 10)) < 9) continue;
    sgSpots.push({ x, z, y: h });
  }
  instanced(bladeGeometry(), sgMat, sgSpots, { inspect: 'seagrass', cast: false, receive: false, scale: [0.4, 0.9], tilt: 0.2, color: () => new THREE.Color().setHSL(rr(0.25, 0.4), 0.7, rr(0.22, 0.38)) });

  /* ----- driftwood ----- */
  const dwList = place(16, (x, z, h) => h > 1.0 && h < 2.2, 16 * 800);
  const dw = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 3.2, 6), M('#7b6a58'), dwList.length);
  dwList.forEach((a, i) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(a.x, a.y + 0.15, a.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, Math.PI / 2 + rr(-0.15, 0.15))), new THREE.Vector3(1, rr(0.7, 1.6), 1));
    dw.setMatrixAt(i, m);
  });
  dw.castShadow = true; scene.add(dw);

  /* ----- lying coconuts + falling system ----- */
  const nutGeo = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.05, 2);
  const nutMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.8, flatShading: true });
  const lying = [];
  for (const p of palms) {
    if (rnd() < 0.55 && p.y < 5) {
      const a = rnd() * TAU, r = rr(1, 4.5);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, h = getHeight(x, z);
      if (h > 0.9) lying.push({ x, z, y: h + 0.24 });
    }
  }
  const ly = new THREE.InstancedMesh(nutGeo, nutMat, lying.length);
  const zeroNut = new THREE.Matrix4().makeScale(0, 0, 0);
  lying.forEach((a, i) => { a.i = i; a.taken = false; a.mat = new THREE.Matrix4().compose(new THREE.Vector3(a.x, a.y, a.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, 0)), new THREE.Vector3(0.26, 0.24, 0.26)); ly.setMatrixAt(i, a.mat); });
  ly.castShadow = true; scene.add(ly);

  const pool = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(nutGeo, nutMat);
    m.scale.set(0.27, 0.25, 0.27);
    m.castShadow = true; m.visible = false;
    scene.add(m);
    pool.push({ m, active: false, v: new THREE.Vector3(), rest: 0, bounces: 0, splash: false });
  }
  const splashHook = { fn: null };
  result.coconuts = {
    /** the nearest coconut on the ground within range of (x, z): a fresh fall or a rolling one, or (lyingToo) one lying under a palm. {kind, x, z, moving, ...} or null */
    free(x, z, range, lyingToo = false) {
      let best = null, bd = range;
      for (const c of pool) {
        if (!c.active || c.splash) continue;
        const p = c.m.position;
        if (p.y > getHeight(p.x, p.z) + 0.7) continue;                       // still in the air
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) { bd = d; best = { kind: 'pool', c, x: p.x, z: p.z, moving: Math.hypot(c.v.x, c.v.z) > 0.3 || c.rest < 6 }; }
      }
      if (lyingToo) for (const a of lying) {
        if (a.taken) continue;
        const d = Math.hypot(a.x - x, a.z - z);
        if (d < bd) { bd = d; best = { kind: 'lying', a, x: a.x, z: a.z, moving: false }; }
      }
      return best;
    },
    /** pick a coconut up (false if somebody got there first). Ones taken from under a palm grow back after a while. */
    take(n) {
      if (n.kind === 'pool') { if (!n.c.active) return false; n.c.active = false; n.c.m.visible = false; return true; }
      if (n.a.taken) return false;
      n.a.taken = true; ly.setMatrixAt(n.a.i, zeroNut); ly.instanceMatrix.needsUpdate = true; n.a.back = performance.now() + 150000;
      return true;
    },
    /** where a coconut is now (they roll) */
    where(n, out) { if (n.kind === 'pool') { if (!n.c.active) return null; out.copy(n.c.m.position); } else { if (n.a.taken) return null; out.set(n.a.x, n.a.y, n.a.z); } return out; },
    onSplash: (f) => { splashHook.fn = f; },
    drop(x, y, z, vx = 0, vz = 0) {
      const c = pool.find((q) => !q.active) || pool[0];
      c.active = true; c.rest = 0; c.bounces = 0; c.splash = false; c.m.visible = true; c.m.scale.set(0.27, 0.25, 0.27);
      c.m.position.set(x, y, z);
      c.v.set(vx + rr(-0.6, 0.6), 0, vz + rr(-0.6, 0.6));
    },
  };
  const nrm = { x: 0, y: 1, z: 0 };
  updaters.push((dt) => {
    for (const c of pool) {
      if (!c.active) continue;
      const p = c.m.position, v = c.v;
      v.y -= 22 * dt;
      p.addScaledVector(v, dt);
      const g = getHeight(p.x, p.z);
      const w = waterAt(p.x, p.z);
      if (w.kind && w.depth > 0.04) {
        // water: it floats, riding the swell, the tide and the stream level, and stirs a ring now and then
        const sy = w.y;
        if (p.y < sy + 0.05) {
          if (!c.splash) { c.splash = true; if (splashHook.fn) splashHook.fn(p.x, sy, p.z, 0.6); }
          v.y *= 0.2; p.y += (sy - 0.04 + Math.sin(U.time.value * 2 + p.x) * 0.05 - p.y) * Math.min(1, dt * 10);
          v.x *= 0.985; v.z *= 0.985;
          c.m.rotation.z += dt * 0.5;
          c.rest += dt;
          c.ripT = (c.ripT ?? 1) - dt;
          if (c.ripT < 0) { c.ripT = 2.2 + rnd() * 2; ripple(p.x, p.z, { amp: 0.1, speed: 0.5, width: 0.07, life: 1.5, foam: 0.05, minor: true }); }
          if (c.rest > 25) { c.active = false; c.m.visible = false; }
        }
      } else if (p.y < g + 0.25) {
        p.y = g + 0.25;
        if (v.y < -2 && c.bounces < 4) { events.emit('thud', p.x, p.y, p.z, Math.min(1, -v.y / 14)); v.y = -v.y * 0.38; v.x *= 0.75; v.z *= 0.75; c.bounces++; } else v.y = 0;
        getNormal(p.x, p.z, nrm);
        v.x += nrm.x * 14 * dt; v.z += nrm.z * 14 * dt;
        const k = Math.exp(-1.4 * dt); v.x *= k; v.z *= k;
        const sp = Math.hypot(v.x, v.z);
        c.m.rotation.x += (v.z * dt) / 0.26; c.m.rotation.z -= (v.x * dt) / 0.26;
        if (sp < 0.2) { c.rest += dt; if (c.rest > 30) { const s = Math.max(0, 1 - (c.rest - 30) / 3); c.m.scale.setScalar(0.26 * s); if (s <= 0) { c.active = false; c.m.visible = false; } } } else c.rest = 0;
      }
    }
  });

  updaters.push(() => { for (const a of lying) if (a.taken && performance.now() > a.back) { a.taken = false; ly.setMatrixAt(a.i, a.mat); ly.instanceMatrix.needsUpdate = true; } });

  // wind drops
  let nextDrop = 6;
  updaters.push((dt, t) => {
    if (t < nextDrop || !palms.length) return;
    nextDrop = t + rr(9, 22);
    const a = pick(palms);
    result.coconuts.drop(a.crown.x, a.crown.y - 0.6, a.crown.z);
  });

  result.trunkPoint = trunkPoint;
  result.grass = grassIM;
  return result;
}
