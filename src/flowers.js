// Procedural tropical blossoms built from real petal shapes (hibiscus, plumeria, heliconia, bird of paradise …)
import * as THREE from 'three';
import { C, shade } from './gfx.js';
import { rr, rnd, pick, TAU, lerp } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _y = V(0, 1, 0);

function frame(up) {
  const u = up.clone().normalize();
  const a = Math.abs(u.y) < 0.95 ? V(0, 1, 0) : V(1, 0, 0);
  const r = new THREE.Vector3().crossVectors(a, u).normalize();
  const f = new THREE.Vector3().crossVectors(u, r).normalize();
  return { u, r, f };
}

/** a thin round stick between two points */
export function stick(mb, a, b, r, color, w = 1) {
  const d = b.clone().sub(a), len = d.length();
  if (len < 1e-5) return;
  const q = new THREE.Quaternion().setFromUnitVectors(_y, d.clone().normalize());
  const g = new THREE.CylinderGeometry(r * 0.7, r, len, 4);
  mb.addGeo(g, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)), color, w);
  g.dispose();
}
const dot = (mb, p, r, color, w = 1) => {
  const g = new THREE.IcosahedronGeometry(r, 0);
  mb.addGeo(g, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), color, w); g.dispose();
};

/** ring of petals around `up` at `c`.  Options: n, len, wid, tilt, twist, c0 (throat), c1 (tip), arc (<TAU for half-flowers), cup (curl), w (wind) */
export function petalFan(mb, c, up, o) {
  const K = o.noScale ? 1 : 1.55;
  const { n = 5, len: len0 = 0.12, wid: wid0 = 0.1, tilt = 0.9, twist = 0, c0, c1, arc = TAU, phase = 0, cup = 1, w = 1.2, tipCol = null } = o;
  const len = len0 * K, wid = wid0 * K;
  const { u, r, f } = frame(up);
  for (let i = 0; i < n; i++) {
    const a = phase + (arc >= TAU - 0.01 ? (i / n) * TAU : (i / Math.max(1, n - 1) - 0.5) * arc);
    const dir = r.clone().multiplyScalar(Math.cos(a)).addScaledVector(f, Math.sin(a));
    const side = new THREE.Vector3().crossVectors(u, dir).normalize();
    const ax = u.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(dir, Math.sin(tilt)).normalize();
    const tw = side.clone().multiplyScalar(twist);
    const P = (s, wd, curl) => c.clone().addScaledVector(ax, s).addScaledVector(side, wd).addScaledVector(u, curl * len * 0.12 * cup).addScaledVector(tw, s);
    const base = P(0, 0, 0), L = P(len * 0.45, -wid * 0.5, 0.2), R = P(len * 0.45, wid * 0.5, 0.2);
    const L2 = P(len * 0.82, -wid * 0.42, 0.7), R2 = P(len * 0.82, wid * 0.42, 0.7), tip = P(len, 0, 1.0);
    const k0 = c0, kM = c0.clone().lerp(c1, 0.55), k1 = tipCol || c1;
    mb.tri(base, L, R, k0, kM, kM, w * 0.2, w * 0.7, w * 0.7);
    mb.tri(L, L2, R, kM, k1, kM, w * 0.7, w, w * 0.7);
    mb.tri(R, L2, R2, kM, k1, k1, w * 0.7, w, w);
    mb.tri(L2, tip, R2, k1, k1, k1, w, w, w);
  }
}

/* ---------------------------------------------------------------- blossoms: all take (mb, centre, up, colour) */
export function hibiscus(mb, c, up, col, w = 1.2) {
  const k = new THREE.Color(col);
  petalFan(mb, c, up, { n: 5, len: 0.17, wid: 0.15, tilt: 0.95, twist: 0.12, c0: shade(k, 0.28), c1: k, w });
  const { u } = frame(up);
  const tip = c.clone().addScaledVector(u, 0.2);
  stick(mb, c, tip, 0.006, C('#f0cf3a'), w);
  for (let i = 0; i < 4; i++) dot(mb, tip.clone().add(V(rr(-0.02, 0.02), rr(-0.02, 0.02), rr(-0.02, 0.02))), 0.012, i % 2 ? C('#e0301a') : C('#ffe060'), w);
}
export function plumeria(mb, c, up, col, w = 1.1) {
  const k = new THREE.Color(col);
  petalFan(mb, c, up, { n: 5, len: 0.15, wid: 0.075, tilt: 1.2, twist: 0.35, c0: C('#ffd23a'), c1: k, w, phase: rr(0, 6) });
  petalFan(mb, c.clone().add(up.clone().multiplyScalar(0.004)), up, { n: 5, len: 0.12, wid: 0.065, tilt: 1.05, twist: 0.35, c0: C('#ffcb2a'), c1: shade(k, 0.97), w, phase: rr(0, 6) });
}
export function daisy(mb, c, up, col, w = 1) {
  const k = new THREE.Color(col);
  petalFan(mb, c, up, { n: 8, len: 0.075, wid: 0.03, tilt: 1.4, c0: k, c1: k, w, cup: 0.3 });
  dot(mb, c.clone().addScaledVector(up, 0.012), 0.016, C('#f0c030'), w);
}
export function tiare(mb, c, up, w = 1) {
  petalFan(mb, c, up, { n: 7, len: 0.11, wid: 0.052, tilt: 0.85, twist: 0.2, c0: C('#f3efdc'), c1: C('#ffffff'), w });
  dot(mb, c.clone().addScaledVector(up, 0.025), 0.015, C('#efe3a0'), w);
}
export function bougain(mb, c, up, col, w = 1.3) {
  const k = new THREE.Color(col);
  petalFan(mb, c, up, { n: 3, len: 0.12, wid: 0.105, tilt: 1.05, twist: 0.1, c0: shade(k, 0.9), c1: k, w, phase: rr(0, 6), cup: 1.4 });
  dot(mb, c.clone().addScaledVector(up, 0.01), 0.014, C('#f4f0d8'), w);
}
export function naupaka(mb, c, up, w = 1) {
  petalFan(mb, c, up, { n: 5, len: 0.09, wid: 0.045, tilt: 1.15, arc: Math.PI * 0.95, phase: rr(0, 6), c0: C('#e8e2c4'), c1: C('#ffffff'), w, cup: 0.6 });
}
export function glory(mb, c, up, col, w = 1) {
  const k = new THREE.Color(col);
  petalFan(mb, c, up, { n: 5, len: 0.11, wid: 0.12, tilt: 1.05, c0: C('#f4f0ff'), c1: k, w, cup: 0.6 });
}
export function orchid(mb, c, up, col, w = 1) {
  const k = new THREE.Color(col);
  petalFan(mb, c, up, { n: 3, len: 0.1, wid: 0.035, tilt: 0.9, c0: k, c1: shade(k, 1.1), w, phase: Math.PI / 2 });
  petalFan(mb, c, up, { n: 2, len: 0.085, wid: 0.075, tilt: 1.3, c0: k, c1: shade(k, 1.2), w, phase: 0 });
  petalFan(mb, c, up, { n: 1, len: 0.06, wid: 0.05, tilt: 0.95, c0: C('#f6e060'), c1: C('#c0307a'), w, phase: Math.PI * 1.5 });
}
export function heliconia(mb, c, up, w = 1.2) {
  const { u, r } = frame(up);
  const top = c.clone().addScaledVector(u, 0.62);
  stick(mb, c, top, 0.012, C('#4a8a2a'), w * 0.5);
  for (let k = 0; k < 6; k++) {
    const p = c.clone().addScaledVector(u, 0.14 + k * 0.085);
    const a = (k % 2 ? Math.PI : 0) + k * 0.15;
    const dir = r.clone().multiplyScalar(Math.cos(a)).addScaledVector(frame(up).f, Math.sin(a));
    petalFan(mb, p, dir.clone().multiplyScalar(0.8).addScaledVector(u, 0.5), { n: 1, len: 0.2 - k * 0.012, wid: 0.1 - k * 0.006, tilt: 0.1, c0: C('#ff2d18'), c1: C('#ff6a1a'), tipCol: C('#f4d82a'), w, cup: 1.8 });
  }
}
export function birdOfParadise(mb, c, up, w = 1.2) {
  const { u, r, f } = frame(up);
  const beak = c.clone().addScaledVector(u, 0.22);
  stick(mb, c, beak, 0.016, C('#3c7a34'), w * 0.5);
  petalFan(mb, beak, u.clone().addScaledVector(r, 0.55), { n: 3, len: 0.28, wid: 0.06, tilt: 0.55, arc: 1.0, phase: 0.4, c0: C('#ff7a14'), c1: C('#ffb12a'), w, cup: 0.6 });
  petalFan(mb, beak, u.clone().addScaledVector(r, 0.55), { n: 2, len: 0.17, wid: 0.045, tilt: 1.0, arc: 0.6, phase: 0.3, c0: C('#2c5ad0'), c1: C('#5a3ed0'), w });
}
export function ginger(mb, c, up, w = 1.1) {
  const { u } = frame(up);
  stick(mb, c, c.clone().addScaledVector(u, 0.45), 0.012, C('#4a8a2a'), w * 0.5);
  for (let k = 0; k < 7; k++) {
    const p = c.clone().addScaledVector(u, 0.4 + k * 0.035);
    petalFan(mb, p, up, { n: 6, len: 0.11 - k * 0.008, wid: 0.065, tilt: 0.55 + k * 0.03, phase: k * 0.5, c0: C('#c8102a'), c1: k > 4 ? C('#ff6a4a') : C('#e8303a'), w, cup: 0.8 });
  }
}
export const FLOWER_COLORS = {
  hibiscus: ['#e8112d', '#ff5fa2', '#ffd21f', '#ff8a1f'],
  plumeria: ['#ffffff', '#fff1c8', '#ff9db8', '#ffe36a'],
  daisy: ['#ffffff', '#ffd23f', '#ff7aa8', '#b78cff', '#ff9a3c'],
};
