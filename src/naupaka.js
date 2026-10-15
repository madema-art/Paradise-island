// Naupaka (Scaevola taccada), the beach shrub of every Pacific shore: a low, spreading mound of pale woody stems, each ending in a
// rosette of thick, glossy, spoon-shaped leaves that fold up along the midrib and droop a little; small white "half-flowers" (five
// petals fanned to one side, as if the other half had been torn off) in the leaf axils; and clusters of round white berries.
// Built with a local seeded generator, so the island's own random sequence is untouched.
//
// Three levels of detail come from the same plant (see vegetation_lod.js). Level 0 is the full shrub. Level 1 keeps every second leaf,
// a little wider so the mound keeps its density, and drops the berries. Level 2 keeps every fourth leaf and no flowers. Every level
// draws the same random numbers in the same order, so the leaves that remain are in the same places as in the full shrub.
import * as THREE from 'three';
import { MB, C, shade, tube, lumpy, mat4 } from './gfx.js';
import { mulberry32, TAU } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export function makeNaupakaGeo(seed = 1, detail = 0) {
  const rng = mulberry32(seed * 9301 + 17), rr = (a, b) => a + (b - a) * rng(), pk = (a) => a[Math.floor(rng() * a.length)];
  const mb = new MB(), nectarFlowers = [];
  const BARK = [C('#8d8c6c'), C('#a09f7e'), C('#7c7a5e')];
  const LEAF = [C('#8cc152'), C('#7fb548'), C('#9bcf5e'), C('#86bb4c')];
  const tips = [];
  const thin = detail === 0 ? 1 : detail === 1 ? 2 : 4, fill = detail === 0 ? 1 : detail === 1 ? 1.2 : 1.4;
  let leafNo = 0;

  // a leaf: spoon-shaped (widest toward the rounded tip), folded up along the midrib, drooping under its own weight
  const leaf = (base, dir, len, wid, droop, fold, col, w) => {
    if (leafNo++ % thin) return;
    wid *= fill;
    const f = dir.clone().normalize(), s = new THREE.Vector3().crossVectors(f, UP);
    if (s.lengthSq() < 1e-4) s.set(1, 0, 0);
    s.normalize();
    const n = new THREE.Vector3().crossVectors(s, f).normalize();
    const T = [0, 0.38, 0.72, 1], WID = [0.1, 0.75, 0.95, 0.0];
    const row = T.map((t, k) => {
      const c = base.clone().addScaledVector(f, len * t); c.y -= droop * len * t * t;
      const ww = wid * WID[k];
      return { c, l: c.clone().addScaledVector(s, -ww).addScaledVector(n, fold * ww), r: c.clone().addScaledVector(s, ww).addScaledVector(n, fold * ww), t };
    });
    for (let k = 0; k < T.length - 1; k++) {
      const a = row[k], b = row[k + 1];
      const ca = shade(col, 0.8 + 0.28 * a.t), cb = shade(col, 0.8 + 0.28 * b.t), mid = shade(col, 1.12 + 0.1 * a.t), midb = shade(col, 1.12 + 0.1 * b.t);
      const wa = w * (0.35 + 0.65 * a.t), wb = w * (0.35 + 0.65 * b.t);
      mb.tri(a.l, a.c, b.l, ca, mid, cb, wa, wa, wb); mb.tri(a.c, b.c, b.l, mid, midb, cb, wa, wb, wb);
      mb.tri(a.c, a.r, b.c, mid, ca, midb, wa, wa, wb); mb.tri(a.r, b.r, b.c, ca, cb, midb, wa, wb, wb);
    }
  };
  // a rosette of leaves round a twig tip, in a spiral
  const rosette = (p, dir, n, sizeK = 1) => {
    const axis = dir.clone().normalize();
    const s = new THREE.Vector3().crossVectors(axis, UP); if (s.lengthSq() < 1e-4) s.set(1, 0, 0); s.normalize();
    const t = new THREE.Vector3().crossVectors(axis, s).normalize();
    const base = pk(LEAF);
    for (let k = 0; k < n; k++) {
      const az = k * 2.399 + rr(-0.2, 0.2), lift = 0.25 + (k / n) * 1.0 + rr(-0.12, 0.12);        // inner leaves stand up, outer ones fan out
      const d = axis.clone().multiplyScalar(Math.cos(lift)).addScaledVector(s, Math.sin(lift) * Math.cos(az)).addScaledVector(t, Math.sin(lift) * Math.sin(az));
      leaf(p, d, rr(0.25, 0.37) * sizeK, rr(0.08, 0.115) * sizeK, rr(0.25, 0.55), rr(0.25, 0.6), shade(base, rr(0.88, 1.12)), rr(0.6, 1.0));
    }
  };
  // the half-flower: five petals fanned over half a circle, white with a cream throat and a faint purple line
  const flower = (p, dir) => {
    const axis = dir.clone().normalize(), s = new THREE.Vector3().crossVectors(axis, UP); if (s.lengthSq() < 1e-4) s.set(1, 0, 0); s.normalize();
    const t = new THREE.Vector3().crossVectors(axis, s).normalize();
    const white = C('#fbfaf2'), cream = C('#efe6c0'), line = C('#c9b6d6');
    const ph = rr(0, TAU), len = rr(0.045, 0.06);
    if (detail >= 2) return;
    for (let k = 0; k < 5; k++) {
      const a = ph + (k / 4 - 0.5) * Math.PI * 0.95;
      const d = axis.clone().multiplyScalar(0.5).addScaledVector(s, Math.cos(a) * 0.85).addScaledVector(t, Math.sin(a) * 0.85).normalize();
      const side = new THREE.Vector3().crossVectors(d, axis).normalize().multiplyScalar(len * 0.3);
      const tip = p.clone().addScaledVector(d, len), a1 = p.clone().add(side), a2 = p.clone().sub(side), mid = p.clone().addScaledVector(d, len * 0.55);
      mb.tri(a1, mid.clone().add(side.clone().multiplyScalar(1.4)), tip, cream, white, white, 0.7, 0.9, 1);
      mb.tri(a2, tip, mid.clone().sub(side.clone().multiplyScalar(1.4)), cream, white, white, 0.7, 1, 0.9);
      mb.tri(a1, a2, mid, line, line, white, 0.7, 0.7, 0.9);
    }
    nectarFlowers.push({ position: p.clone(), direction: axis.clone() });
  };

  /* the stems: pale, thick, branching, reaching out and a little up */
  const NS = 10;
  for (let s = 0; s < NS; s++) {
    const a = (s / NS) * TAU + rr(-0.3, 0.3), len = rr(0.6, 1.15), top = rr(0.4, 0.85), pts = [], radii = [];
    for (let k = 0; k <= 5; k++) {
      const f = k / 5, r = len * f;
      pts.push(V(Math.cos(a) * r + rr(-0.02, 0.02), 0.08 + top * Math.pow(f, 1.4) + Math.sin(f * 3 + s) * 0.05, Math.sin(a) * r + rr(-0.02, 0.02)));
      radii.push(0.055 - 0.032 * f);
    }
    const bark = pk(BARK);
    tube(mb, pts, radii, 5, (k) => shade(bark, 0.92 + 0.14 * (k % 2)), () => 0.05);
    for (let k = 3; k <= 4; k++) { const q = pts[k], out = V(Math.cos(a), 0.55, Math.sin(a)); for (const sd of [-1, 1]) leaf(q, out.clone().add(V(-Math.sin(a) * sd * 0.9, rr(0, 0.3), Math.cos(a) * sd * 0.9)), rr(0.22, 0.32), rr(0.075, 0.105), 0.45, 0.5, pk(LEAF), 0.8); }
    const end = pts[5], dir = pts[5].clone().sub(pts[4]);
    tips.push({ p: end, dir });
    for (const [at, side] of [[0.55, 1], [0.78, -1]]) {                                           // side twigs
      const q = pts[Math.round(at * 5)], d2 = V(Math.cos(a + side * 0.9), 0.5, Math.sin(a + side * 0.9)), l2 = rr(0.3, 0.55);
      const tw = [q.clone(), q.clone().addScaledVector(d2, l2 * 0.5).add(V(0, 0.04, 0)), q.clone().addScaledVector(d2, l2)];
      tube(mb, tw, [0.026, 0.02, 0.014], 4, () => shade(bark, 1.05), () => 0.1);
      tips.push({ p: tw[2], dir: d2 });
      // a few single leaves along the twig
      for (let k = 0; k < 2; k++) leaf(tw[1], d2.clone().add(V(rr(-0.5, 0.5), rr(0.1, 0.5), rr(-0.5, 0.5))), rr(0.22, 0.32), rr(0.07, 0.1), 0.4, 0.4, pk(LEAF), 0.8);
    }
  }
  /* leaves and flowers at every tip */
  for (const { p, dir } of tips) {
    rosette(p, dir.clone().add(V(0, 0.45, 0)), 6 + Math.floor(rng() * 3));
    // a second, lower whorl just behind the tip fills the gaps
    rosette(p.clone().addScaledVector(dir.clone().normalize(), -0.12), dir.clone().add(V(0, 0.2, 0)), 3, 0.95);
    for (let k = 0; k < 3; k++) {                                                                 // flowers in the axils of the rosette
      const off = V(rr(-0.12, 0.12), rr(0.0, 0.1), rr(-0.12, 0.12)), fp = p.clone().add(off);
      if (rng() < 0.75) flower(fp, V(rr(-0.4, 0.4), 1, rr(-0.4, 0.4)).add(off.clone().multiplyScalar(2)));
    }
    if (rng() < 0.45) {                                                                           // a cluster of white berries on short stalks
      for (let k = 0; k < 5; k++) {
        const bp = p.clone().add(V(rr(-0.1, 0.1), rr(0.02, 0.12), rr(-0.1, 0.1)));
        const bc = shade(C('#f4f3e6'), rr(0.9, 1.05));
        if (detail === 0) mb.addGeo(new THREE.IcosahedronGeometry(1, 0), mat4(bp.x, bp.y, bp.z, 0.022, 0.024, 0.022), bc, 0.7);
      }
    }
  }
  /* a dark, dense core of foliage, hidden by the leaves, so the mound has mass and no light shows through its middle */
  for (let k = 0; k < 4; k++) {
    const a = rr(0, TAU), d = rr(0, 0.4), r = rr(0.26, 0.4);
    const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.3, seed * 10 + k);
    mb.addGeo(g, mat4(Math.cos(a) * d, 0.28, Math.sin(a) * d, r, r * 0.55, r), (v) => shade(C('#4a7f36'), 0.8 + 0.35 * Math.min(1, Math.max(0, v.y * 1.5))), 0.3);
  }
  const geo = mb.build();
  geo.userData.nectarFlowers = nectarFlowers;
  return geo;
}
