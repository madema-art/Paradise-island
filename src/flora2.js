// South Pacific vegetation: pandanus, banyan, breadfruit, plumeria, beach shrubs and a garden of tropical flowers.
import * as THREE from 'three';
import { makeNaupakaGeo } from './naupaka.js';
import { lodFamily, lodLevels } from './vegetation_lod.js';
import { canopyLobe, canopyTube } from './canopy.js';
import { scene } from './core.js';
import { MB, C, shade, mat4, tube, lumpy, windify, DRY } from './gfx.js';
import { addCollider, getHeight, getSlope, riverDist, lavaDist, TEMPLE, COVE, LAKE, SPRING, FAIRY, VOL, MOTU, falls } from './world.js';
import { burn, rnd, rr, pick, clamp, lerp, smoothstep, mulberry32, TAU } from './util.js';
import { newCoral } from './coral_new.js';
import { chunkInstanced } from './chunk_instanced.js';
import { place, instanced, vegMat, canopyMat, distantCanopyMat, clearOf, jungleN, makePalm } from './flora.js';
import * as F from './flowers.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
// Actual flower centers and normals, transformed with the rendered instance matrix.
export const nectarSites = [];
const nectarPerchMB = new MB();
function finishNectarPerches() {
  const mesh = new THREE.Mesh(nectarPerchMB.build(), vegMat);
  mesh.name = 'Lorikeet_Nectar_Twigs'; mesh.castShadow = false; scene.add(mesh);
}
function registerNectar(im, geo, list) {
  const flowers = geo.userData.nectarFlowers;
  if (!flowers?.length) return;
  const matrix = new THREE.Matrix4();
  list.forEach((plant, i) => {
    im.getMatrixAt(i, matrix);
    const candidates = flowers.map(f => ({
      position: f.position.clone().applyMatrix4(matrix), direction: f.direction.clone().transformDirection(matrix),
    }));
    const selected = [];
    for (const f of candidates) {
      const dir = f.direction.clone().setY(0).normalize();
      if (dir.lengthSq() < .01) dir.set(0, 0, 1);
      f.perch = f.position.clone().addScaledVector(dir, .1013 * 3);
      f.perch.y -= .1254 * 3;
      if (f.position.y < plant.y + .85 || selected.some(g => f.perch.distanceTo(g.perch) < .65)) continue;
      selected.push(f); if (selected.length === 3) break;
    }
    if (selected.length === 3) {
      for (const flower of selected) {
        const dir = flower.direction.clone().setY(0).normalize();
        if (dir.lengthSq() < .01) dir.set(0, 0, 1);
        flower.perch = flower.position.clone().addScaledVector(dir, .1013 * 3);
        flower.perch.y -= .1254 * 3;
        const side = V(-dir.z, 0, dir.x), centre = flower.perch.clone().addScaledVector(dir, -.036).add(V(0, -.014, 0));
        tube(nectarPerchMB, [V(plant.x, plant.y + .2, plant.z), centre], [.024, .012], 6, () => C('#756049'), () => 0);
        tube(nectarPerchMB, [centre.clone().addScaledVector(side, -.18), centre.clone().addScaledVector(side, .18)], [.015, .012], 6, () => C('#756049'), () => 0);
      }
      nectarSites.push({ position: new THREE.Vector3(plant.x, plant.y, plant.z), flowers: selected });
    }
  });
}

/* ---------------------------------------------------------------- shared leaf builders */
/** arching blade (pandanus / ti / heliconia leaves): V-folded along the midrib */
function blade(mb, base, dir, len, width, pitch, droop, c0, c1, w0 = 0.6, fold = 0.25) {
  const n = 7, side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  const P = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    P.push(base.clone().addScaledVector(dir, len * t * Math.cos(pitch)).add(V(0, len * t * Math.sin(pitch) - droop * len * t * t, 0)));
  }
  const col = (t) => c0.clone().lerp(c1, t);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const wd0 = width * Math.pow(1 - t0, 0.55) * smoothstep(0, 0.1, t0 + 0.04), wd1 = width * Math.pow(1 - t1, 0.55) * smoothstep(0, 0.1, t1 + 0.04);
    const a = P[i], b = P[i + 1];
    const aL = a.clone().addScaledVector(side, -wd0), aR = a.clone().addScaledVector(side, wd0), aM = a.clone().add(V(0, wd0 * fold, 0));
    const bL = b.clone().addScaledVector(side, -wd1), bR = b.clone().addScaledVector(side, wd1), bM = b.clone().add(V(0, wd1 * fold, 0));
    const ca = col(t0), cb = col(t1), cm = shade(col((t0 + t1) / 2), 1.12);
    const wa = w0 + t0 * 1.1, wb = w0 + t1 * 1.1;
    mb.tri(aL, bL, bM, ca, cb, shade(cb, 1.1), wa, wb, wb); mb.tri(aL, bM, aM, ca, shade(cb, 1.1), shade(ca, 1.1), wa, wb, wa);
    mb.tri(aM, bM, bR, shade(ca, 1.1), shade(cb, 1.1), cb, wa, wb, wb); mb.tri(aM, bR, aR, shade(ca, 1.1), cb, ca, wa, wb, wa);
  }
}
function rosette(mb, c, n, len, width, pitch0, pitch1, droop, c0, c1, w0 = 0.7, fold = 0.25) {
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, t = i / (n - 1);
    const dir = V(Math.cos(a), 0, Math.sin(a));
    blade(mb, c, dir, len * rr(0.85, 1.1), width, lerp(pitch0, pitch1, t) + rr(-0.1, 0.1), droop, shade(c0, rr(0.9, 1.1)), c1, w0, fold);
  }
}
/** big lobed / heart leaf as a fan */
function leafFan(mb, c, dir, up, size, color, lobes = 0, w = 1.0) {
  const side = new THREE.Vector3().crossVectors(dir, up).normalize();
  const m = 16, pts = [];
  for (let i = 0; i < m; i++) {
    const a = (i / m) * TAU;
    let r = size;
    if (lobes) r = size * (0.62 + 0.38 * Math.abs(Math.cos((a * lobes) / 2)));
    else r = size * (0.55 + 0.45 * (0.5 + 0.5 * Math.cos(a))) * (a > Math.PI * 0.82 && a < Math.PI * 1.18 ? 0.5 : 1);   // heart notch
    const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.85;
    pts.push(c.clone().addScaledVector(dir, x + size * 0.5).addScaledVector(side, y).addScaledVector(up, -Math.abs(y) * 0.25 + (x > 0 ? -x * 0.18 : 0)));
  }
  const ctr = c.clone().addScaledVector(dir, size * 0.5);
  const k0 = shade(color, 0.85), k1 = shade(color, 1.12);
  for (let i = 0; i < m; i++) mb.tri(ctr, pts[i], pts[(i + 1) % m], k0, k1, k1, w * 0.3, w, w);
}
const barkRing = (a, b) => (i) => shade(i % 2 ? a : b, rr(0.92, 1.06));

/* ---------------------------------------------------------------- PANDANUS (screw pine) */
function makePandanus() {
  const mb = new MB();
  const H = rr(2.8, 4.2), lx = rr(-0.9, 0.9), lz = rr(-0.9, 0.9);
  const cen = [], rad = [];
  for (let i = 0; i <= 7; i++) { const t = i / 7; cen.push(V(lx * t * t + Math.sin(t * 5) * 0.12, H * t, lz * t * t)); rad.push(lerp(0.3, 0.17, t)); }
  tube(mb, cen, rad, 8, barkRing(C('#8a7a66'), C('#6f604f')), (i) => (i / 7) ** 2 * 0.35);
  const top = cen[7].clone();
  for (let k = 0; k < 7; k++) {                      // stilt roots
    const a = (k / 7) * TAU + rr(-0.3, 0.3), h0 = rr(0.5, 1.7), t0 = h0 / H;
    const s = V(lx * t0 * t0, h0, lz * t0 * t0), R = rr(1.0, 1.7), d = V(Math.cos(a), 0, Math.sin(a));
    const pts = [s, s.clone().addScaledVector(d, 0.3).add(V(0, 0.05, 0)), s.clone().addScaledVector(d, R * 0.7).add(V(0, -h0 * 0.5, 0)), s.clone().addScaledVector(d, R).setY(-0.12)];
    tube(mb, pts, [0.1, 0.085, 0.07, 0.055], 5, () => shade(C('#7c5c3c'), rr(0.9, 1.1)), () => 0);
  }
  const crowns = [top];
  const nb = 2 + Math.floor(rnd() * 3);
  for (let k = 0; k < nb; k++) {                     // branches ending in tufts of leaves
    const a = rnd() * TAU, L = rr(1.1, 2.2), d = V(Math.cos(a), 0, Math.sin(a));
    const s = V(lx, H * rr(0.7, 0.9), lz).add(V(0, 0, 0));
    const e = s.clone().addScaledVector(d, L * 0.8).add(V(0, L * 0.7, 0));
    const mid = s.clone().addScaledVector(d, L * 0.35).add(V(0, L * 0.3, 0));
    tube(mb, [s, mid, e], [0.12, 0.1, 0.075], 6, () => shade(C('#7a6a58'), rr(0.9, 1.1)), (i) => 0.3 + i * 0.2);
    crowns.push(e);
  }
  const green0 = C('#2a6a2a'), green1 = C('#79b440');
  crowns.forEach((c, i) => {
    rosette(mb, c, 16, rr(2.1, 2.7), 0.2, 1.15, -0.15, 0.95, green0, green1, 0.8);
    if (i % 2 === 0 || rnd() < 0.4) {                 // the big segmented fruit
      const fc = c.clone().add(V(rr(-0.2, 0.2), -0.35, rr(-0.2, 0.2)));
      const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.12, rnd() * 9);
      mb.addGeo(g, mat4(fc.x, fc.y, fc.z, 0.26, 0.3, 0.26), (v) => C('#e8741a').lerp(C('#f4c42a'), clamp((v.y - fc.y) / 0.5 + 0.5, 0, 1)), 0.8);
      for (let q = 0; q < 14; q++) { const a = rnd() * TAU, e = rr(-0.8, 0.9); const p = fc.clone().add(V(Math.cos(a) * Math.cos(e) * 0.27, Math.sin(e) * 0.31, Math.sin(a) * Math.cos(e) * 0.27)); mb.addGeo(new THREE.IcosahedronGeometry(0.05, 0), mat4(p.x, p.y, p.z), C('#c8401a'), 0.8); }
    }
  });
  return mb.build();
}

/* ---------------------------------------------------------------- BANYAN (strangler fig) */
// Closed foliage clumps replace the old cut-paper leaf cards. Roots and RNG are unchanged.
function makeBanyan(detail = 0) {
  const mb = new MB();
  const bark = C('#6b5e50'), bark2 = C('#7a6c5c'), rootC = C('#807060');
  const leaf = [C('#245e2a'), C('#2f7030'), C('#1d5226'), C('#3a7c34')];
  const trunks = [];
  const nT = 4 + Math.floor(rnd() * 2);
  for (let i = 0; i < nT; i++) {                     // fused, twisting trunks
    const a = (i / nT) * TAU + rr(-0.3, 0.3), r0 = rr(0.5, 1.1);
    const ox = Math.cos(a) * r0, oz = Math.sin(a) * r0, H = rr(5.5, 7);
    const cen = [], rad = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6; const tw = a + t * 1.4; cen.push(V(ox * (1 - t * 0.5) + Math.cos(tw) * 0.35 * t, -0.5 + (H + 0.5) * t, oz * (1 - t * 0.5) + Math.sin(tw) * 0.35 * t)); rad.push(lerp(1.15, 0.55, t) + 0.35 * Math.exp(-t * 9)); }
    canopyTube(mb, cen, rad, 9, barkRing(bark, bark2), (k) => (k / 6) ** 2 * 0.15);
    trunks.push(cen);
  }
  for (let k = 0; k < 9; k++) {                       // buttress flanges
    const a = (k / 9) * TAU + rr(-0.2, 0.2), ca = Math.cos(a), sa = Math.sin(a), h = rr(2, 3.4), R = rr(2.4, 3.6);
    mb.tri(V(ca * 1.1, h, sa * 1.1), V(ca * 0.9, -0.3, sa * 0.9), V(ca * R, -0.4, sa * R), bark, shade(bark, 0.8), shade(bark, 0.7));
    const b = a + 0.14; mb.tri(V(Math.cos(b) * 1.1, h, Math.sin(b) * 1.1), V(Math.cos(b) * R, -0.4, Math.sin(b) * R), V(Math.cos(b) * 0.9, -0.3, Math.sin(b) * 0.9), bark, shade(bark, 0.7), shade(bark, 0.8));
  }
  const limbs = [], pillars = [];
  const nL = 7;
  for (let i = 0; i < nL; i++) {                      // great spreading limbs
    const a = (i / nL) * TAU + rr(-0.25, 0.25), L = rr(6.5, 10.5), d = V(Math.cos(a), 0, Math.sin(a)), y0 = rr(5.4, 7);
    const pts = [V(d.x * 0.5, y0, d.z * 0.5), V(d.x * L * 0.3, y0 + 1.0, d.z * L * 0.3), V(d.x * L * 0.65, y0 + 1.6, d.z * L * 0.65), V(d.x * L, y0 + 1.6 + rr(-0.4, 0.6), d.z * L)];
    canopyTube(mb, pts, [0.7, 0.55, 0.38, 0.24], 7, barkRing(bark, bark2), (k) => 0.15 + k * 0.2);
    limbs.push(pts);
    // canopy over each limb
    for (let q = 0; q < 3; q++) {
      const t = 0.45 + q * 0.28, p = pts[Math.min(3, Math.floor(t * 3.4))].clone().lerp(pts[3], q * 0.2);
      const R = rr(3.3, 5.2) * (q === 2 ? 0.85 : 1);
      rnd(); // original lobe noise-seed draw
      const base = pick(leaf);
      const cy = p.y + 1.7;
      const wind = .9 + .2 * rnd();
      canopyLobe(mb, V(p.x, cy, p.z), R, .68, base, 400 + i * 3 + q, detail, wind);
    }
  }
  for (let q = 0; q < 8; q++) {                       // dense crown
    const a = rnd() * TAU, r = rr(0, 4.5) * (q < 4 ? 1 : 0.3), R = rr(4, 5.8), base = pick(leaf), cy = (q < 4 ? 9.2 : 11.4) + rr(-0.6, 0.8);
    rnd(); // original lobe noise-seed draw
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const wind = .9 + .2 * rnd();
    canopyLobe(mb, V(x, cy, z), R, .68, base, 500 + q, detail, wind);
  }
  for (let k = 0; k < 34; k++) {                      // aerial roots: thin curtains + thick pillar roots reaching the ground
    const limb = pick(limbs), t = rr(0.25, 0.97), i0 = Math.min(2, Math.floor(t * 3)), p = limb[i0].clone().lerp(limb[i0 + 1], (t * 3) % 1);
    const pillar = k < 9 && t > 0.3 && t < 0.85;
    const dx = rr(-0.4, 0.4), dz = rr(-0.4, 0.4), end = V(p.x + dx, pillar ? -0.3 : p.y - rr(2.5, p.y - 0.5), p.z + dz);
    const mid = p.clone().lerp(end, 0.5).add(V(rr(-0.25, 0.25), 0, rr(-0.25, 0.25)));
    const r0 = pillar ? 0.2 : 0.045, r1 = pillar ? 0.34 : 0.028;
    canopyTube(mb, [p, mid, end], [r0, (r0 + r1) / 2, r1], pillar ? 7 : 4, () => shade(rootC, rr(0.9, 1.1)), (i) => (pillar ? 0.0 : (i / 2) * 1.2 + 0.3));
    if (pillar) pillars.push({ x: end.x, z: end.z });
  }
  return { geo: mb.build(), pillars };
}

/* ---------------------------------------------------------------- BREADFRUIT */
function makeBreadfruit() {
  const mb = new MB(), H = rr(5, 7);
  const cen = [], rad = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; cen.push(V(Math.sin(t * 3) * 0.3, H * t, Math.cos(t * 2.6) * 0.3)); rad.push(lerp(0.4, 0.2, t) + 0.22 * Math.exp(-t * 9)); }
  tube(mb, cen, rad, 7, barkRing(C('#7d7466'), C('#6a6256')), (i) => (i / 6) ** 2 * 0.4);
  const top = cen[6];
  const leaves = [C('#1f5a28'), C('#2a6a2d'), C('#33773a')];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rnd(), r = i ? rr(1.6, 3) : 0, base = pick(leaves), cy = top.y + rr(-0.4, 1.0);
    const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.22, i), R = rr(1.9, 2.8), x = top.x + Math.cos(a) * r, z = top.z + Math.sin(a) * r;
    mb.addGeo(g, mat4(x, cy, z, R, R * 0.6, R), (v) => shade(base, 0.8 + 0.3 * clamp((v.y - cy) / (R * 0.6) * 0.5 + 0.5, 0, 1)), 0.9);
    for (let l = 0; l < 3; l++) {                     // big lobed leaves drooping at the rim
      const la = a + rr(-0.8, 0.8), dir = V(Math.cos(la), 0, Math.sin(la));
      leafFan(mb, V(x + dir.x * R * 0.6, cy - R * 0.35 + l * 0.15, z + dir.z * R * 0.6), dir, UP, rr(0.55, 0.85), shade(base, 1.18), 5, 1.1);
    }
  }
  for (let k = 0; k < 8; k++) {                       // round green fruits
    const a = rnd() * TAU, r = rr(0.8, 2.6), p = V(top.x + Math.cos(a) * r, top.y - rr(0.3, 1.0), top.z + Math.sin(a) * r);
    const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.07, rnd() * 5);
    mb.addGeo(g, mat4(p.x, p.y, p.z, 0.2, 0.2, 0.2), C('#a6c855'), 0.7);
  }
  return mb.build();
}

/* ---------------------------------------------------------------- PLUMERIA (frangipani) */
function makePlumeria(flowerCols) {
  const mb = new MB(), H = rr(2.4, 3.6);
  const trunk = [], rad = [];
  for (let i = 0; i <= 4; i++) { const t = i / 4; trunk.push(V(Math.sin(t * 4) * 0.35, H * 0.55 * t, Math.cos(t * 3) * 0.3)); rad.push(lerp(0.24, 0.17, t)); }
  tube(mb, trunk, rad, 7, barkRing(C('#9a9a84'), C('#85866f')), (i) => i * 0.1);
  const base = trunk[4];
  const nb = 4 + Math.floor(rnd() * 3), leaf = [C('#1f6a30'), C('#2a7a36'), C('#237030')];
  for (let b = 0; b < nb; b++) {
    const a = (b / nb) * TAU + rr(-0.3, 0.3), d = V(Math.cos(a), 0, Math.sin(a)), L = rr(1.0, 1.7);
    const e = base.clone().addScaledVector(d, L * 0.85).add(V(0, L * rr(0.55, 0.95), 0)), mid = base.clone().addScaledVector(d, L * 0.35).add(V(0, L * 0.3, 0));
    tube(mb, [base, mid, e], [0.15, 0.12, 0.09], 6, barkRing(C('#9a9a84'), C('#85866f')), (i) => 0.2 + i * 0.25);
    for (let l = 0; l < 9; l++) {
      const la = l * 2.4 + rnd(), dir = V(Math.cos(la), 0, Math.sin(la));
      blade(mb, e, dir, rr(0.8, 1.15), 0.2, rr(0.5, 1.1), 0.5, shade(pick(leaf), 0.85), pick(leaf), 0.8, 0.12);
    }
    const nf = 7 + Math.floor(rnd() * 7);
    for (let f = 0; f < nf; f++) {
      const fp = e.clone().add(V(rr(-0.28, 0.28), rr(0.1, 0.38), rr(-0.28, 0.28)));
      F.plumeria(mb, fp, V(rr(-0.3, 0.3), 1, rr(-0.3, 0.3)), pick(flowerCols));
    }
  }
  return mb.build();
}

/* ---------------------------------------------------------------- shrubs with blossoms */
function bushWith(blossom, { n = 4, R0 = 0.8, flowers = 12, green = ['#2c7a32', '#3a8a38', '#276a2d'], flat = 0.8, spread = 1.0, detail = 0 }) {
  const mb = new MB(), spots = [], nectarFlowers = [];
  const thin = detail === 0 ? 1 : detail === 1 ? 2 : 4;   // detail 1 keeps every second leaf card and flower, detail 2 every fourth
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, r0 = i ? rr(0.4, 1.0) * spread : 0, c = V(Math.cos(a) * r0, rr(0.55, 0.85) * flat, Math.sin(a) * r0), R = rr(0.7, 1.15) * R0 / 0.8;
    const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.25, i), base = C(pick(green));
    mb.addGeo(g, mat4(c.x, c.y, c.z, R, R * flat, R), (v) => shade(base, 0.8 + 0.4 * clamp(((v.y - c.y) / (R * flat)) * 0.5 + 0.5, 0, 1)), 0.55);
    spots.push({ c, R, flat });
  }
  for (let i = 0; i < 70; i++) {                       // leaf cards break up the smooth blob silhouette
    const s = pick(spots), th = rnd() * TAU, ph = rr(0.05, 1.9), dir = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    const p = s.c.clone().add(V(dir.x * s.R * 1.12, dir.y * s.R * s.flat * 1.12, dir.z * s.R * 1.12));
    const t1 = new THREE.Vector3().crossVectors(dir, UP).normalize(), sz = rr(0.17, 0.3), col = shade(C(pick(green)), rr(0.9, 1.25));
    const tip = p.clone().addScaledVector(dir, sz * 1.25), l = p.clone().addScaledVector(t1, sz * 0.5).addScaledVector(dir, sz * 0.45), r = p.clone().addScaledVector(t1, -sz * 0.5).addScaledVector(dir, sz * 0.45);
    const out = i % thin ? DRY : mb;
    out.tri(p, l, tip, shade(col, 0.8), col, shade(col, 1.1), 0.5, 0.8, 1.0); out.tri(p, tip, r, shade(col, 0.8), shade(col, 1.1), col, 0.5, 1.0, 0.8);
  }
  for (let f = 0; f < flowers; f++) {
    const s = pick(spots), th = rnd() * TAU, ph = rr(0.15, 1.55);
    const dir = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    const p = s.c.clone().add(V(dir.x * s.R * 1.26, dir.y * s.R * s.flat * 1.26, dir.z * s.R * 1.26));
    blossom(f % thin ? DRY : mb, p, dir, f, Math.sqrt(thin));
    nectarFlowers.push({ position: p.clone(), direction: dir.clone() });
  }
  const geo = mb.build(); geo.userData.nectarFlowers = nectarFlowers; return geo;
}

/* ---------------------------------------------------------------- clumps of tall flowering plants */
function makeClump(kind) {
  const mb = new MB();
  const g0 = C('#2c8a30'), g1 = C('#7cc040');
  const nL = kind === 2 ? 9 : 7;
  for (let i = 0; i < nL; i++) {
    const a = rnd() * TAU, d = V(Math.cos(a), 0, Math.sin(a)), c = V(Math.cos(a) * rr(0, 0.25), 0, Math.sin(a) * rr(0, 0.25));
    blade(mb, c, d, kind === 2 ? rr(1.3, 1.9) : rr(1.7, 2.4), kind === 2 ? 0.1 : 0.32, rr(0.9, 1.3), 0.7, g0, g1, 0.6, 0.15);
  }
  const nI = 3;
  for (let i = 0; i < nI; i++) {
    const p = V(rr(-0.4, 0.4), 0.0, rr(-0.4, 0.4)), up = V(rr(-0.2, 0.2), 1, rr(-0.2, 0.2));
    if (kind === 0) F.heliconia(mb, p.setY(0.25), up);
    else if (kind === 1) F.birdOfParadise(mb, p.setY(0.3), up);
    else F.ginger(mb, p.setY(0.3), up);
  }
  return mb.build();
}
function makeTaro() {
  const mb = new MB(), g = [C('#2f9a46'), C('#3aa84e'), C('#278a3e')];
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, d = V(Math.cos(a), 0, Math.sin(a)), h = rr(0.7, 1.35), top = V(d.x * rr(0.25, 0.55), h, d.z * rr(0.25, 0.55));
    F.stick(mb, V(d.x * 0.05, 0, d.z * 0.05), top, 0.018, C('#6ab04a'), 0.6);
    leafFan(mb, top, d, V(0, 1, 0), rr(0.5, 0.75), pick(g), 0, 0.9);
  }
  return mb.build();
}
function makeTi(red) {
  const mb = new MB(), H = rr(0.6, 1.1);
  const cen = [], rad = [];
  for (let i = 0; i <= 3; i++) { cen.push(V(Math.sin(i) * 0.05, H * i / 3, 0)); rad.push(0.05); }
  tube(mb, cen, rad, 5, () => C('#7a6a50'), () => 0.1);
  rosette(mb, cen[3], 15, 1.0, 0.1, 1.0, -0.2, 0.7, red ? C('#7a1230') : C('#2a8a30'), red ? C('#d03a62') : C('#8ad040'), 0.9, 0.2);
  return mb.build();
}
function makeGlory() {
  const mb = new MB();
  for (let i = 0; i < 12; i++) {
    const a = rnd() * TAU, r = rr(0.1, 1.0), c = V(Math.cos(a) * r, 0.05 + rnd() * 0.12, Math.sin(a) * r);
    leafFan(mb, c, V(Math.cos(a + 1), 0, Math.sin(a + 1)), UP, rr(0.13, 0.2), pick([C('#3d9a3e'), C('#4aa845')]), 0, 0.5);
  }
  for (let i = 0; i < 9; i++) { const a = rnd() * TAU, r = rr(0.1, 0.95); F.glory(mb, V(Math.cos(a) * r, 0.2, Math.sin(a) * r), V(rr(-0.3, 0.3), 1, rr(-0.3, 0.3)), pick(['#8a4cd8', '#a05ce0', '#d86ab8', '#6a58e0']), 0.5); }
  return mb.build();
}
function makeWild(kind) {
  const mb = new MB(), cols = [['#ffffff', '#fff1a8'], ['#ffd23f', '#ffb52a'], ['#ff7aa8', '#ff9fc4'], ['#b78cff', '#d4b4ff'], ['#ff8a3c', '#ffb066']][kind];
  for (let i = 0; i < 10; i++) {
    const a = rnd() * TAU, r = rr(0.05, 0.55), h = rr(0.28, 0.6), b = V(Math.cos(a) * r, 0, Math.sin(a) * r), t = b.clone().add(V(rr(-0.06, 0.06), h, rr(-0.06, 0.06)));
    F.stick(mb, b, t, 0.01, C('#4a9a38'), 0.9);
    F.daisy(mb, t, V(rr(-0.25, 0.25), 1, rr(-0.25, 0.25)), pick(cols), 1.2);
    if (i % 3 === 0) blade(mb, b, V(Math.cos(a + 2), 0, Math.sin(a + 2)), 0.3, 0.05, 0.6, 0.4, C('#3a8a2e'), C('#6cb040'), 0.7, 0.1);
  }
  return mb.build();
}
function makeOrchid(col) {
  const mb = new MB();
  for (let i = 0; i < 6; i++) { const a = rnd() * TAU; blade(mb, V(0, 0.02, 0), V(Math.cos(a), 0, Math.sin(a)), rr(0.5, 0.75), 0.07, 0.9, 0.5, C('#2a7a34'), C('#6aa844'), 0.6, 0.2); }
  for (let s = 0; s < 2; s++) {
    const a = rnd() * TAU, d = V(Math.cos(a), 0, Math.sin(a));
    let prev = V(0, 0.1, 0);
    for (let k = 1; k <= 6; k++) {
      const p = V(d.x * 0.09 * k * k * 0.25, 0.1 + k * 0.1, d.z * 0.09 * k * k * 0.25);
      F.stick(mb, prev, p, 0.008, C('#4a8a34'), 0.8); prev = p;
      if (k > 1) F.orchid(mb, p, V(d.x * 0.5, 1, d.z * 0.5), col, 1.0);
    }
  }
  return mb.build();
}
// Each naupaka the old way drew 580 numbers from the world's random stream. The new shrub (naupaka.js) has its own generator, but
// those draws are still spent, so every later placement stays exactly where it was.
let nauSeed = 0;
// the three levels of detail of one shrub (vegetation_lod.js), all from one seed
function makeNaupaka() { burn(580); const seed = ++nauSeed; return [0, 1, 2].map((d) => makeNaupakaGeo(seed, d)); }

/* ---------------------------------------------------------------- build + placement */
export function buildFlora2() {
  const out = { banyans: [] };
  const colorsOf = (s) => (typeof s === 'string' ? [s] : s);

  /* pandanus along the shore and river mouths */
  const pan = [makePandanus(), makePandanus(), makePandanus(), makePandanus()];
  const panList = place(80, (x, z, h, s) => {
    if (h < 1.2 || h > 9 || s > 0.4 || !clearOf(x, z, 2.5)) return false;
    return 0.15 + 0.85 * (1 - smoothstep(2.5, 8, h));
  }, 80 * 160);
  const panB = pan.map(() => []);
  panList.forEach((a) => panB[Math.floor(rnd() * 4)].push(a));
  pan.forEach((g, i) => instanced(g, vegMat, panB[i], { inspect: 'pandanus', scale: [0.85, 1.4], tilt: 0.06 }));
  panList.forEach((a) => addCollider(a.x, a.z, 0.85 * a.sc));

  /* banyans: ancient giants in the interior */
  const ban = Array.from({ length: 3 }, () => lodLevels(d => makeBanyan(d)));
  const banList = [];
  for (let k = 0; k < 1400 && banList.length < 8; k++) {
    const x = rr(-170, 170), z = rr(-150, 150), h = getHeight(x, z);
    if (h < 6 || h > 24 || getSlope(x, z) > 0.2 || !clearOf(x, z, 9)) continue;
    if (jungleN(x, z) < -0.05) continue;
    if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 30 || Math.hypot(x - FAIRY.x, z - FAIRY.z) < 16) continue;
    if (Math.hypot(x - VOL.x, z - VOL.z) < VOL.R) continue;
    if (banList.some((b) => Math.hypot(b.x - x, b.z - z) < 38)) continue;
    banList.push({ x, z, y: h - 0.2 });
  }
  // always give the temple one of its own
  { const a = 2.3; const x = TEMPLE.x + Math.cos(a) * 38, z = TEMPLE.z + Math.sin(a) * 38; if (getSlope(x, z) < 0.3 && clearOf(x, z, 9)) banList.push({ x, z, y: getHeight(x, z) - 0.2 }); }
  // shade-tree banyans where people would gather: above the castaway's camp, by the lake, at the spring and the fairy glade
  for (const [ax, az, rad, minD] of [[COVE.x - 34, COVE.z - 30, 26, 18], [LAKE.x + 6, LAKE.z + LAKE.r + 20, 24, 21], [SPRING.x + 14, SPRING.z + 22, 20, 14], [FAIRY.x - 22, FAIRY.z + 14, 22, 14], [COVE.x + 20, COVE.z - 46, 24, 18]]) {
    let pick2 = null, bestS = 1e9;
    for (let k = 0; k < 500; k++) {
      const a2 = rnd() * TAU, r2 = rad * Math.sqrt(rnd()), x = ax + Math.cos(a2) * r2, z = az + Math.sin(a2) * r2, h = getHeight(x, z);
      if (h < 2.5 || h > 22 || getSlope(x, z) > 0.22 || !clearOf(x, z, 9) || riverDist(x, z) < 8 || lavaDist(x, z) < 30) continue;
      if (banList.some((b) => Math.hypot(b.x - x, b.z - z) < 26)) continue;
      if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 28 || Math.hypot(x - ax, z - az) < 2) continue;
      const sc = Math.hypot(x - ax, z - az); if (sc < bestS) { bestS = sc; pick2 = { x, z, y: h - 0.2 }; }
    }
    if (pick2) banList.push(pick2);
  }
  const banB = ban.map(() => []);
  banList.forEach((a) => { a.v = Math.floor(rnd() * 3); banB[a.v].push(a); });
  ban.forEach((b, i) => lodFamily(instanced(b[0].geo, canopyMat, banB[i], { inspect: 'banyan', scale: [1.05, 1.55], tilt: 0.0 }), b.map(x => x.geo), banB[i], { tree: true, distantMaterial: distantCanopyMat }));
  banList.forEach((a) => {
    addCollider(a.x, a.z, 1.9 * a.sc);
    for (const p of ban[a.v][0].pillars) {
      const c = Math.cos(a.rot), s = Math.sin(a.rot);
      addCollider(a.x + (p.x * c + p.z * s) * a.sc, a.z + (-p.x * s + p.z * c) * a.sc, 0.45 * a.sc);
    }
    out.banyans.push(a);
  });

  /* breadfruit trees near streams and lowlands */
  const bf = [makeBreadfruit(), makeBreadfruit(), makeBreadfruit()];
  const bfList = place(46, (x, z, h, s) => (h < 3 || h > 16 || s > 0.3 || !clearOf(x, z, 5) || Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 24) ? false : 0.4 + 0.6 * smoothstep(40, 8, riverDist(x, z)), 46 * 200);
  const bfB = bf.map(() => []);
  bfList.forEach((a) => bfB[Math.floor(rnd() * 3)].push(a));
  bf.forEach((g, i) => instanced(g, vegMat, bfB[i], { inspect: 'breadfruit', scale: [0.85, 1.3] }));
  bfList.forEach((a) => addCollider(a.x, a.z, 0.5 * a.sc));

  /* plumeria (frangipani) */
  const pl = [makePlumeria(['#ffffff', '#fff8ee']), makePlumeria(['#fff1c8', '#ffe6a8']), makePlumeria(['#ffc0d6', '#ff8fb2']), makePlumeria(['#ffe36a', '#ffd23a'])];
  const plList = place(70, (x, z, h, s) => (h < 2.4 || h > 14 || s > 0.35 || !clearOf(x, z, 2.5)) ? false : 0.5, 70 * 120);
  const plB = pl.map(() => []);
  plList.forEach((a) => plB[Math.floor(rnd() * 4)].push(a));
  pl.forEach((g, i) => instanced(g, vegMat, plB[i], { inspect: 'plumeria', scale: [0.85, 1.35] }));
  plList.forEach((a) => addCollider(a.x, a.z, 0.3 * a.sc));

  /* shrubs: beach naupaka, hibiscus in many colours, bougainvillea */
  const nau = [makeNaupaka(), makeNaupaka()];
  const nauList = place(170, (x, z, h) => h > 1.3 && h < 3.6 && getSlope(x, z) < 0.3 && clearOf(x, z, 2) ? 0.7 : false, 170 * 140);
  const nauB = [[], []];
  nauList.forEach((a) => nauB[Math.floor(rnd() * 2)].push(a));
  nau.forEach((g, i) => lodFamily(instanced(g[0], vegMat, nauB[i], { inspect: 'naupaka', scale: [0.8, 1.5], cast: false }), g, nauB[i]));

  const hib = F.FLOWER_COLORS.hibiscus.map((col) => lodLevels((detail) => bushWith((mb, p, dir, f, k) => F.hibiscus(mb, p, dir, col, 1.2 * k), { n: 4, R0: 0.95, flowers: 30, green: ['#2a8a38', '#35a044', '#2e9440'], flat: 0.9, detail })));
  const hibList = place(150, (x, z, h, s) => (h < 2.4 || h > 24 || s > 0.4 || !clearOf(x, z, 2)) ? false : 0.5 * (0.5 + 0.7 * smoothstep(2.2, 8, h)), 150 * 80);
  const hibB = hib.map(() => []);
  hibList.forEach((a) => hibB[Math.floor(rnd() * hib.length)].push(a));
  hib.forEach((g, i) => { const im = instanced(g[0], vegMat, hibB[i], { inspect: 'hibiscus', scale: [0.8, 1.5], cast: false }); lodFamily(im, g, hibB[i]); registerNectar(im, g[0], hibB[i]); });

  const bg = ['#d81b8c', '#ff6a1a', '#e0243a', '#ffb4d8'].map((col) => bushWith((mb, p, dir) => F.bougain(mb, p, dir, col), { n: 5, R0: 1.0, flowers: 70, green: ['#2f7a34', '#3a8a3a'], flat: 0.65, spread: 1.5 }));
  const bgList = place(46, (x, z, h, s) => {
    if (h < 2.4 || h > 22 || s > 0.35 || !clearOf(x, z, 2)) return false;
    const nearHuman = Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 36 || Math.hypot(x - (COVE.x - 35), z - (COVE.z - 9)) < 40;
    return nearHuman ? 0.9 : 0.12;
  }, 46 * 200);
  const bgB = bg.map(() => []);
  bgList.forEach((a) => bgB[Math.floor(rnd() * bg.length)].push(a));
  bg.forEach((g, i) => instanced(g, vegMat, bgB[i], { inspect: 'bougainvillea', scale: [0.9, 1.6], cast: false }));

  /* tall flowering clumps by the water: heliconia, bird of paradise, ginger torch */
  const cl = [makeClump(0), makeClump(0), makeClump(1), makeClump(1), makeClump(2), makeClump(2)];
  const clList = place(110, (x, z, h, s) => (h < 2.2 || h > 22 || s > 0.4 || !clearOf(x, z, 1.8)) ? false : 0.12 + 0.88 * smoothstep(26, 4, riverDist(x, z)), 110 * 160);
  const clB = cl.map(() => []);
  clList.forEach((a) => clB[Math.floor(rnd() * cl.length)].push(a));
  cl.forEach((g, i) => instanced(g, vegMat, clB[i], { inspect: 'clump', scale: [0.85, 1.4], cast: false }));

  /* taro, ti plants, morning glory, orchids, wildflowers */
  const taro = [makeTaro(), makeTaro()];
  const taroList = place(80, (x, z, h, s) => (h < 1.6 || h > 14 || s > 0.35 || riverDist(x, z) < 1.6 || !clearOf(x, z, 1.2)) ? false : smoothstep(14, 3, riverDist(x, z)), 80 * 260);
  const taroB = [[], []];
  taroList.forEach((a) => taroB[Math.floor(rnd() * 2)].push(a));
  taro.forEach((g, i) => instanced(g, vegMat, taroB[i], { inspect: 'taro', scale: [0.8, 1.3], cast: false }));

  const ti = [makeTi(true), makeTi(true), makeTi(false)];
  const tiList = place(70, (x, z, h, s) => (h < 2.6 || h > 28 || s > 0.4 || !clearOf(x, z, 1.5)) ? false : smoothstep(-0.1, 0.3, jungleN(x, z)) * 0.8, 70 * 100);
  const tiB = ti.map(() => []);
  tiList.forEach((a) => tiB[Math.floor(rnd() * 3)].push(a));
  ti.forEach((g, i) => instanced(g, vegMat, tiB[i], { inspect: 'ti', scale: [0.8, 1.4], cast: false }));

  const glory = makeGlory();
  const gloryList = place(160, (x, z, h, s) => (h > 1.2 && h < 3.0 && s < 0.3 && clearOf(x, z, 1.5)) ? 0.8 : false, 160 * 100);
  instanced(glory, vegMat, gloryList, { inspect: 'glory', scale: [0.8, 1.6], cast: false, tilt: 0.0, receive: false });

  const orch = ['#b050d8', '#f4f0ff', '#ffd23a'].map(makeOrchid);
  const orList = place(60, (x, z, h, s) => (h < 3.5 || h > 26 || s > 0.5 || !clearOf(x, z, 1.5)) ? false : smoothstep(0.0, 0.3, jungleN(x, z)), 60 * 120);
  const orB = orch.map(() => []);
  orList.forEach((a) => orB[Math.floor(rnd() * 3)].push(a));
  orch.forEach((g, i) => instanced(g, vegMat, orB[i], { inspect: 'orchid', scale: [0.9, 1.5], cast: false }));

  const wild = [0, 1, 2, 3, 4].map(makeWild);
  const wildList = place(520, (x, z, h, s) => (h < 3.0 || h > 26 || s > 0.35 || !clearOf(x, z, 1.2)) ? false : 0.8 * (1 - smoothstep(-0.05, 0.35, jungleN(x, z)) * 0.8), 520 * 40);
  const wildB = wild.map(() => []);
  wildList.forEach((a) => wildB[Math.floor(rnd() * 5)].push(a));
  wild.forEach((g, i) => instanced(g, vegMat, wildB[i], { inspect: 'wildflower', scale: [0.8, 1.7], cast: false, receive: false, tilt: 0.1 }));

  out.geos = { pan: pan[0], ban: ban[0].geo, bf: bf[0], pl: pl[0], pl2: pl[2], hib: hib[0], hib2: hib[1], hib3: hib[2], bg: bg[0], bg2: bg[1], heli: cl[0], bird: cl[2], ginger: cl[4], taro: taro[0], ti: ti[0], ti2: ti[2], glory, orch: orch[0], wild: wild[0], wild2: wild[2], nau: nau[0] };
  Object.assign(out, { panList, banList, bfList, plList, nauList, hibList, bgList, clList, taroList, tiList, gloryList, orList, wildList });
  return out;
}

/* ================================================================ SOUTH SEAS TOUCHES: coral garden, motu islets, beach blossoms */
export const motuPalms = [];
export const reef = { x: 0, z: 0, r: 16 };

function makeAnemone(col) {
  const mb = new MB(), k = new THREE.Color(col);
  mb.addGeo(new THREE.CylinderGeometry(0.2, 0.26, 0.2, 8), new THREE.Matrix4().makeTranslation(0, 0.1, 0), shade(k, 0.5), 0.2);
  for (let i = 0; i < 30; i++) {
    const a = rnd() * TAU, r = rr(0.02, 0.2), h = rr(0.25, 0.5), t = V(Math.cos(a) * (r + 0.1), 0.2 + h, Math.sin(a) * (r + 0.1)), b = V(Math.cos(a) * r, 0.2, Math.sin(a) * r);
    F.stick(mb, b, t, 0.018, shade(k, rr(0.9, 1.2)), 1.2);
    mb.addGeo(new THREE.IcosahedronGeometry(0.03, 0), new THREE.Matrix4().makeTranslation(t.x, t.y, t.z), C('#fff0c8'), 1.3);
  }
  return mb.build();
}
function makeStar() {
  const mb = new MB(), k = C('#ff6a2a');
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; mb.tri(V(0, 0.05, 0), V(Math.cos(a - 0.3) * 0.12, 0.03, Math.sin(a - 0.3) * 0.12), V(Math.cos(a) * 0.38, 0.02, Math.sin(a) * 0.38), shade(k, 1.1), k, shade(k, 0.8)); mb.tri(V(0, 0.05, 0), V(Math.cos(a) * 0.38, 0.02, Math.sin(a) * 0.38), V(Math.cos(a + 0.3) * 0.12, 0.03, Math.sin(a + 0.3) * 0.12), shade(k, 1.1), shade(k, 0.8), k); }
  return mb.build();
}
function makeUrchin() {
  const mb = new MB(), k = C('#3a2050');
  mb.addGeo(new THREE.IcosahedronGeometry(0.14, 1), new THREE.Matrix4().makeTranslation(0, 0.14, 0), k, 0.2);
  for (let i = 0; i < 26; i++) { const a = rnd() * TAU, e = rr(-0.1, 1.5), d = V(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)); F.stick(mb, V(0, 0.14, 0).addScaledVector(d, 0.12), V(0, 0.14, 0).addScaledVector(d, 0.3), 0.007, shade(k, 1.6), 0.5); }
  return mb.build();
}

/** a vivid, shallow coral garden in clear water by the beach, small motu islets with palms, and fallen blossoms on the sand */
export function buildSouthSeas() {
  const cMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true, side: THREE.DoubleSide, emissive: 0x20100c });
  windify(cMat);
  const coralCols = ['#ff5d8f', '#ff8a2a', '#b050e0', '#ffd23a', '#3de0d0', '#ff3a5a', '#a6e04a', '#ff7ac8', '#5a8aff'];

  // --- pick the best shallow patch of lagoon near the western beach
  let best = null;
  for (let k = 0; k < 400; k++) {
    const x = COVE.x - 24 + rr(-14, 14), z = COVE.z - 2 + rr(-14, 14);
    let n = 0;
    for (let q = 0; q < 24; q++) { const a = rnd() * TAU, r = rr(0, 12), h = getHeight(x + Math.cos(a) * r, z + Math.sin(a) * r); if (h < -0.8 && h > -2.5) n++; }
    if (!best || n > best.n) best = { x, z, n };
  }
  reef.x = best.x; reef.z = best.z;
  // the garden's coral shapes (coral_new.js). The old builders spent 2 + 75 + 48 draws (table, branching, cauliflower; the other two draw none): burned here
  burn(125);
  const geos = [newCoral('table', 21), newCoral(0, 22), newCoral('cauli', 23), newCoral(1, 24), newCoral(2, 25)];
  const coralMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: false, side: THREE.DoubleSide, emissive: 0x20100c });
  windify(coralMat);
  const wts = [0.3, 0.27, 0.22, 0.13, 0.08];
  const by = geos.map(() => []);
  for (let t = 0, placed = 0; t < 9000 && placed < 520; t++) {
    const a = rnd() * TAU, r = reef.r * Math.sqrt(rnd()), x = reef.x + Math.cos(a) * r, z = reef.z + Math.sin(a) * r, h = getHeight(x, z);
    if (h > -0.8 || h < -2.7 || getSlope(x, z) > 0.3) continue;
    if (rnd() > 1 - 0.55 * smoothstep(reef.r, reef.r * 0.4, r) * 0.6 - 0.35) continue;
    let u = rnd(), k = 0; while (k < wts.length - 1 && u > wts[k]) { u -= wts[k]; k++; }
    by[k].push({ x, z, y: h - 0.05 }); placed++;
  }
  by.forEach((l, i) => chunkInstanced(instanced(geos[i], coralMat, l, { scale: [0.85, 1.2], tilt: 0.12, cast: false, color: () => new THREE.Color(pick(coralCols)) }), l, 60, { inspect: 'coral' }));
  const anC = ['#ff3a8a', '#9a50e0', '#3ad88a'].map(makeAnemone);
  const anL = [[], [], []];
  for (let t = 0; t < 600 && anL.flat().length < 34; t++) { const a = rnd() * TAU, r = reef.r * Math.sqrt(rnd()), x = reef.x + Math.cos(a) * r, z = reef.z + Math.sin(a) * r, h = getHeight(x, z); if (h < -0.8 && h > -2.5) anL[Math.floor(rnd() * 3)].push({ x, z, y: h }); }
  anC.forEach((g, i) => instanced(g, cMat, anL[i], { inspect: 'anemone', scale: [0.9, 1.7], tilt: 0.1, cast: false }));
  const stars = [], urch = [];
  for (let t = 0; t < 900 && (stars.length < 46 || urch.length < 40); t++) {
    const a = rnd() * TAU, r = reef.r * 1.15 * Math.sqrt(rnd()), x = reef.x + Math.cos(a) * r, z = reef.z + Math.sin(a) * r, h = getHeight(x, z);
    if (h < -0.6 && h > -2.6) (rnd() < 0.5 && stars.length < 46 ? stars : urch).push({ x, z, y: h });
  }
  instanced(makeStar(), cMat, stars, { inspect: 'starfish', scale: [1.0, 1.9], tilt: 0.0, cast: false });
  instanced(makeUrchin(), cMat, urch, { inspect: 'urchin', scale: [0.9, 1.5], tilt: 0.1, cast: false });

  // --- motu islets: a few palms, pandanus and naupaka on pale sand
  const pv = [makePalm(rr(7, 9), 0.8, 0.3, 17), makePalm(rr(8, 10), -0.6, 0.7, 18), makePalm(rr(6.5, 8.5), 0.3, -0.9, 17)];
  const pm = pv.map(() => []);
  const pans = [makePandanus(), makePandanus()], pansL = [[], []];
  const nauS = [makeNaupaka()], nauL = [[]];
  const glo = makeGlory(), gloL = [];
  for (const m of MOTU) {
    const land = (n, fn) => { for (let t = 0, c = 0; t < 400 && c < n; t++) { const a = rnd() * TAU, r = m.r * 0.7 * Math.sqrt(rnd()), x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r, h = getHeight(x, z); if (h > 0.9 && fn(x, z, h)) { c++; } } };
    land(m.r > 12 ? 7 : 4, (x, z, h) => { const i = Math.floor(rnd() * 3); const e = { x, z, y: h, v: i }; pm[i].push(e); return true; });
    land(m.r > 12 ? 3 : 2, (x, z, h) => { pansL[Math.floor(rnd() * 2)].push({ x, z, y: h }); return true; });
    land(m.r > 12 ? 9 : 5, (x, z, h) => { nauL[0].push({ x, z, y: h }); return true; });
    land(5, (x, z, h) => { gloL.push({ x, z, y: h }); return true; });
  }
  pv.forEach((p, i) => {
    const im = instanced(p.geo, vegMat, pm[i], { inspect: 'palm', scale: [0.85, 1.2], tilt: 0.05 });
    pm[i].forEach((a, index) => { const matrix = new THREE.Matrix4(); im.getMatrixAt(index, matrix); a.perches = p.perchPoints.map(q => q.clone().applyMatrix4(matrix)); });
    pm[i].forEach((a) => { a.crown = new THREE.Vector3(); p.pt(1, a.crown); a.crown.multiplyScalar(a.sc).applyAxisAngle(UP, a.rot).add(new THREE.Vector3(a.x, a.y, a.z)); motuPalms.push(a); });
  });
  pans.forEach((g, i) => instanced(g, vegMat, pansL[i], { inspect: 'pandanus', scale: [0.8, 1.2] }));
  nauS.forEach((g, i) => lodFamily(instanced(g[0], vegMat, nauL[i], { inspect: 'naupaka', scale: [0.8, 1.3], cast: false }), g, nauL[i]));
  instanced(glo, vegMat, gloL, { inspect: 'glory', scale: [0.9, 1.5], cast: false, tilt: 0.0, receive: false });

  // --- the beach belt: hibiscus and frangipani where the lagoon beach meets the jungle, and blossoms fallen on the sand
  const near = (x, z) => Math.hypot(x - (COVE.x - 28), z - (COVE.z - 12)) < 62;
  const hibBelt = F.FLOWER_COLORS.hibiscus.map((col) => lodLevels((detail) => bushWith((mb, p, dir, f, k) => F.hibiscus(mb, p, dir, col, 1.2 * k), { n: 4, R0: 0.95, flowers: 34, green: ['#2a8a38', '#35a044', '#2e9440'], flat: 0.9, detail })));
  const hbL = place(22, (x, z, h, s) => h > 2.2 && h < 4.2 && s < 0.3 && near(x, z) && clearOf(x, z, 2.5), 22 * 400);
  const hbB = hibBelt.map(() => []);
  hbL.forEach((a, i) => hbB[i % hibBelt.length].push(a));
  hibBelt.forEach((g, i) => { const im = instanced(g[0], vegMat, hbB[i], { inspect: 'hibiscus', scale: [1.0, 1.55], cast: false }); lodFamily(im, g, hbB[i]); registerNectar(im, g[0], hbB[i]); });
  const plBelt = [['#ffffff', '#fff8ee'], ['#fff1c8', '#ffe6a8'], ['#ffc0d6', '#ff8fb2'], ['#ffe36a', '#ffd23a']].map((c) => makePlumeria(c));
  const plL = place(12, (x, z, h, s) => h > 2.4 && h < 6 && s < 0.3 && near(x, z) && clearOf(x, z, 3), 12 * 400);
  const plB = plBelt.map(() => []);
  plL.forEach((a, i) => plB[i % 4].push(a));
  plBelt.forEach((g, i) => instanced(g, vegMat, plB[i], { inspect: 'plumeria', scale: [1.0, 1.4] }));
  plL.forEach((a) => addCollider(a.x, a.z, 0.3 * a.sc));
  const fall = [0, 1, 2].map((k) => {
    const mb = new MB();
    const sets = [[['plumeria', '#ffffff'], ['plumeria', '#ffe36a'], ['plumeria', '#ff9db8']], [['hibiscus', '#e8112d'], ['hibiscus', '#ff8a1f'], ['plumeria', '#fff1c8']], [['hibiscus', '#ffd21f'], ['plumeria', '#ffc0d6'], ['hibiscus', '#ff5fa2']]][k];
    sets.forEach(([kind, col], i) => { const p = V(rr(-0.5, 0.5), 0.025, rr(-0.5, 0.5)), up = V(rr(-0.15, 0.15), 1, rr(-0.15, 0.15)); if (kind === 'plumeria') F.plumeria(mb, p, up, col, 0); else F.hibiscus(mb, p, up, col, 0); });
    return mb.build();
  });
  const fl = [[], [], []];
  place(120, (x, z, h) => h > 1.1 && h < 3.4 && near(x, z) && getSlope(x, z) < 0.3 ? 0.7 : false, 120 * 200).forEach((a) => { a.y += 0.01; fl[Math.floor(rnd() * 3)].push(a); });
  fall.forEach((g, i) => instanced(g, vegMat, fl[i], { inspect: 'blossom', scale: [0.8, 1.4], tilt: 0.05, cast: false, receive: false }));
  finishNectarPerches();
}
