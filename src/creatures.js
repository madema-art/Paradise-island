// Detailed, smooth-shaded creature models (monkey, boar, crab, flamingo, birds, human …)
import { buildHumanFromModel } from './castaway_model.js';
import * as THREE from 'three';
import { rnd, rr, pick, clamp, lerp, TAU } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------------ primitives */
const mats = new Map();
export function SM(color, o = {}) {
  const key = color + JSON.stringify(o);
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...o }); mats.set(key, m); }
  return m;
}
const geos = new Map();
const G = (key, make) => { let g = geos.get(key); if (!g) { g = make(); geos.set(key, g); } return g; };

export function blob(r, color, sx = 1, sy = 1, sz = 1, seg = 16, o = {}) {
  const m = new THREE.Mesh(G(`s${r}_${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.72)))), SM(color, o));
  m.scale.set(sx, sy, sz); m.castShadow = true;
  return m;
}
/** tapered cylinder, centred, axis = y */
export function seg(rTop, rBot, len, color, n = 10, o = {}) {
  const m = new THREE.Mesh(G(`c${rTop}_${rBot}_${len}_${n}`, () => new THREE.CylinderGeometry(rTop, rBot, len, n)), SM(color, o));
  m.castShadow = true;
  return m;
}
export function cone(r, len, color, n = 10, o = {}) {
  const m = new THREE.Mesh(G(`n${r}_${len}_${n}`, () => new THREE.ConeGeometry(r, len, n)), SM(color, o));
  m.castShadow = true;
  return m;
}
export const at = (m, x, y, z, parent = null) => { m.position.set(x, y, z); if (parent) parent.add(m); return m; };

/** smooth tube with a radius profile along a curve */
export function taper(points, r0, r1, color, rad = 8, steps = 14, o = {}) {
  const curve = new THREE.CatmullRomCurve3(points);
  const pos = [], idx = [];
  const frames = curve.computeFrenetFrames(steps, false);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, p = curve.getPoint(t), N = frames.normals[i], B = frames.binormals[i];
    const r = lerp(r0, r1, Math.pow(t, 0.8));
    for (let j = 0; j < rad; j++) {
      const a = (j / rad) * TAU, c = Math.cos(a) * r, s = Math.sin(a) * r;
      pos.push(p.x + N.x * c + B.x * s, p.y + N.y * c + B.y * s, p.z + N.z * c + B.z * s);
    }
  }
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < rad; j++) {
      const a = i * rad + j, b = i * rad + ((j + 1) % rad), c = a + rad, d = b + rad;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, SM(color, o));
  m.castShadow = true;
  return m;
}

export function eye(r, iris = '#2b1a0e', white = '#f3efe4') {
  const g = new THREE.Group();
  const ball = blob(r, white, 1, 1, 0.8, 10); g.add(ball);
  const ir = blob(r * 0.66, iris, 1, 1, 0.5, 10); ir.position.z = r * 0.42; g.add(ir);
  const pu = blob(r * 0.34, '#050403', 1, 1, 0.4, 8); pu.position.z = r * 0.62; g.add(pu);
  const hl = blob(r * 0.16, '#ffffff', 1, 1, 0.4, 6, { emissive: 0x888888 }); hl.position.set(r * 0.2, r * 0.22, r * 0.76); g.add(hl);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

/** jointed limb hanging along -y: returns {pivot, knee, lower}; end (hand/foot) is added to lower */
export function jointed(parent, x, y, z, upLen, loLen, rA, rB, rC, color, o = {}) {
  const pivot = new THREE.Group(); pivot.position.set(x, y, z); parent.add(pivot);
  const up = seg(rA, rB, upLen, color); up.position.y = -upLen / 2; pivot.add(up);
  const j1 = blob(rB * 1.02, color, 1, 1, 1, 10); j1.position.y = -upLen; pivot.add(j1);
  const knee = new THREE.Group(); knee.position.y = -upLen; pivot.add(knee);
  const lower = seg(rB * 0.98, rC, loLen, o.lowColor || color); lower.position.y = -loLen / 2; knee.add(lower);
  const end = new THREE.Group(); end.position.y = -loLen; knee.add(end);
  pivot.knee = knee; pivot.end = end; pivot.upLen = upLen; pivot.loLen = loLen;
  return pivot;
}

/* ------------------------------------------------------------------ MONKEY (tufted capuchin) */
export function makeMonkey() {
  const FUR = '#6a4a30', DARK = '#2a1b12', CREAM = '#ead9b0', SKIN = '#c9a07e', PINK = '#c98d7a';
  const root = new THREE.Group();
  const tp = new THREE.Group(); tp.position.set(0, 0.62, 0); root.add(tp);
  at(blob(0.25, FUR, 0.92, 0.95, 1.6, 18), 0, 0, 0.3, tp);
  at(blob(0.2, CREAM, 0.85, 0.7, 1.15, 14), 0, -0.1, 0.5, tp);               // pale belly/chest
  at(blob(0.22, FUR, 1.05, 0.9, 0.9, 14), 0, 0.06, 0.58, tp);                // shoulders
  at(blob(0.2, DARK, 0.55, 0.35, 1.6, 12), 0, 0.2, 0.28, tp);                // dark back stripe
  at(blob(0.2, FUR, 1, 0.9, 0.9, 12), 0, -0.02, -0.02, tp);                  // rump
  const hp = new THREE.Group(); hp.position.set(0, 0.14, 0.74); tp.add(hp);
  at(blob(0.18, FUR, 1, 0.95, 1, 18), 0, 0.02, 0.03, hp);                    // skull
  at(blob(0.12, DARK, 1.15, 0.6, 1.1, 12), 0, 0.14, 0.0, hp);                // dark crown cap
  at(blob(0.14, CREAM, 0.95, 0.9, 0.85, 14), 0, -0.02, 0.1, hp);             // face mask
  at(blob(0.085, SKIN, 1.05, 0.8, 1.15, 12), 0, -0.07, 0.2, hp);             // muzzle
  at(blob(0.03, DARK, 1.5, 0.8, 0.8, 8), 0, -0.04, 0.285, hp);               // nose
  at(blob(0.012, DARK, 3.4, 0.6, 0.6, 6), 0, -0.115, 0.25, hp);              // mouth line
  const eL = at(eye(0.034, '#3a2412'), -0.075, 0.04, 0.2, hp), eR = at(eye(0.034, '#3a2412'), 0.075, 0.04, 0.2, hp);
  eL.rotation.y = -0.25; eR.rotation.y = 0.25;
  at(blob(0.04, DARK, 2.2, 0.5, 0.8, 8), -0.075, 0.1, 0.22, hp); at(blob(0.04, DARK, 2.2, 0.5, 0.8, 8), 0.075, 0.1, 0.22, hp); // brows
  for (const s of [-1, 1]) {
    at(blob(0.055, PINK, 0.6, 1, 1, 10), s * 0.17, 0.0, 0.0, hp);             // ears
    at(blob(0.07, CREAM, 0.9, 1, 0.8, 10), s * 0.13, -0.07, 0.07, hp);        // cheek fur
    at(blob(0.05, DARK, 0.7, 1.4, 0.7, 8), s * 0.1, 0.19, 0.0, hp);           // head tufts
  }
  const arm = (s) => {
    const a = jointed(tp, s * 0.24, 0.1, 0.57, 0.27, 0.27, 0.065, 0.05, 0.04, FUR, { lowColor: DARK });
    const h = at(blob(0.05, DARK, 1, 1.2, 1.2, 10), 0, -0.02, 0.01, a.end);
    for (let i = 0; i < 3; i++) at(seg(0.012, 0.008, 0.06, DARK, 5), (i - 1) * 0.025, -0.08, 0.02, a.end);
    return a;
  };
  const armL = arm(-1), armR = arm(1);
  const leg = (s) => {
    const l = jointed(root, s * 0.16, 0.62, 0.0, 0.3, 0.3, 0.085, 0.06, 0.045, FUR, { lowColor: DARK });
    at(blob(0.05, DARK, 1, 0.6, 1.9, 10), 0, -0.03, 0.05, l.end);
    for (let i = 0; i < 3; i++) at(seg(0.01, 0.007, 0.05, DARK, 5), (i - 1) * 0.022, -0.04, 0.16, l.end).rotation.x = Math.PI / 2;
    return l;
  };
  const legL = leg(-1), legR = leg(1);
  const tailP = new THREE.Group(); tp.add(tailP);
  tailP.add(taper([V(0, 0.02, -0.15), V(0, 0.02, -0.45), V(0, 0.2, -0.7), V(0, 0.5, -0.72), V(0, 0.68, -0.52), V(0, 0.62, -0.36)], 0.055, 0.025, FUR, 8, 18));
  root.scale.setScalar(1.45);
  return { root, tp, hp, armL, armR, legL, legR, tailP, eyes: [eL, eR] };
}

/* ------------------------------------------------------------------ BOAR */
export function makeBoar(baby = false) {
  const FUR = baby ? '#8a6a4a' : '#4a3a30', DARK = '#241a14', SNOUT = '#c89886', PALE = '#dcd2bc';
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.72; root.add(body);
  at(blob(0.44, FUR, 0.9, 0.95, 1.7, 20), 0, 0, 0, body);
  at(blob(0.4, FUR, 1.0, 1.05, 1.0, 16), 0, 0.07, 0.4, body);              // heavy shoulders
  at(blob(0.38, FUR, 0.95, 0.9, 1.0, 14), 0, -0.01, -0.46, body);          // rump
  at(blob(0.3, baby ? PALE : '#5a493c', 0.9, 0.5, 1.7, 12), 0, -0.3, 0.0, body); // belly
  if (baby) for (let i = 0; i < 4; i++) at(blob(0.06, '#3a2a1c', 1, 0.3, 4.5, 8), (i % 2 ? 1 : -1) * 0.2 * (1 - i * 0.1), 0.05 - i * 0.02, 0.05 + (i < 2 ? 0 : -0.15), body).rotation.z = (i % 2 ? 1 : -1) * 0.5;
  // bristly mane
  for (let i = 0; i < 18; i++) {
    const c = cone(0.045, 0.26 + rnd() * 0.08, DARK, 5);
    c.position.set(rr(-0.03, 0.03), 0.43 - Math.abs(i - 8) * 0.012, 0.62 - i * 0.075); c.rotation.set(-0.35 + rr(-0.1, 0.1), 0, rr(-0.3, 0.3));
    body.add(c);
  }
  const hp = new THREE.Group(); hp.position.set(0, 0.04, 0.78); body.add(hp);
  at(blob(0.27, FUR, 0.9, 0.85, 1.35, 16), 0, 0, 0.1, hp);
  at(seg(0.13, 0.18, 0.4, FUR, 12), 0, -0.07, 0.5, hp).rotation.x = Math.PI / 2;
  at(blob(0.16, SNOUT, 1, 0.9, 0.35, 12), 0, -0.07, 0.72, hp);
  for (const s of [-1, 1]) {
    at(blob(0.026, '#1a0d0a', 1, 1.3, 0.6, 6), s * 0.05, -0.065, 0.76, hp);   // nostrils
    const e = at(eye(0.032, '#2a160a'), s * 0.15, 0.08, 0.3, hp); e.rotation.y = s * 0.7;
    at(blob(0.04, DARK, 2, 0.6, 1, 6), s * 0.15, 0.13, 0.31, hp);             // brow
    const ear = at(cone(0.095, 0.24, FUR, 6), s * 0.16, 0.25, 0.0, hp); ear.rotation.set(-0.15, 0, s * -0.45); ear.scale.z = 0.4;
    const tuskPts = [V(s * 0.12, -0.12, 0.55), V(s * 0.17, -0.1, 0.62), V(s * 0.2, 0.0, 0.66), V(s * 0.18, 0.1, 0.62)];
    hp.add(taper(tuskPts, 0.03, 0.006, PALE, 6, 8));
    at(blob(0.07, DARK, 1, 1.2, 1, 8), s * 0.17, -0.04, 0.2, hp);              // cheek bristles
  }
  const legs = [[-0.2, 0.47], [0.2, 0.47], [-0.2, -0.5], [0.2, -0.5]].map(([x, z]) => {
    const l = jointed(body, x, -0.2, z, 0.3, 0.32, 0.1, 0.07, 0.05, FUR, { lowColor: '#3a2e26' });
    for (const s of [-1, 1]) at(cone(0.03, 0.08, '#16110e', 6), s * 0.025, -0.04, 0.015, l.end).rotation.x = Math.PI;
    return l;
  });
  body.add(taper([V(0, 0.2, -0.82), V(0, 0.32, -0.95), V(0, 0.22, -1.05), V(0.04, 0.26, -1.1)], 0.03, 0.012, DARK, 5, 8));
  root.scale.setScalar(baby ? 0.62 : 1.25);
  return { root, body, hp, legs };
}

export function makeCrab() {
  const SH = '#e0502a', SH2 = '#c23d1c', LIGHT = '#f08a5a';
  const root = new THREE.Group(), body = new THREE.Group(); body.position.y = 0.17; root.add(body);
  at(blob(0.3, SH, 1.25, 0.5, 0.95, 16), 0, 0, 0, body);
  at(blob(0.22, LIGHT, 1.0, 0.35, 0.7, 10), 0, 0.1, -0.02, body);
  for (const s of [-1, 1]) at(blob(0.06, SH2, 1, 1, 1.8, 8), s * 0.28, 0.0, 0.0, body);
  const legs = [];
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const l = jointed(body, s * 0.3, 0.0, -0.18 + k * 0.12, 0.13, 0.17, 0.022, 0.016, 0.01, SH2);
    l.rotation.z = s * 0.9; l.knee.rotation.z = s * -0.9;
    legs.push(l);
  }
  const claws = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.26, 0.02, 0.18); body.add(arm);
    const a1 = seg(0.04, 0.035, 0.16, SH, 8); a1.rotation.z = s * 1.2; a1.rotation.x = 0.6; a1.position.set(s * 0.06, 0.03, 0.06); arm.add(a1);
    const pad = at(blob(0.1, SH, 1.1, 0.8, 1.2, 12), s * 0.12, 0.05, 0.16, arm);
    const f1 = at(cone(0.04, 0.16, SH2, 6), s * 0.1, 0.06, 0.3, arm); f1.rotation.x = Math.PI / 2;
    const f2 = at(cone(0.035, 0.14, SH2, 6), s * 0.15, 0.06, 0.28, arm); f2.rotation.x = Math.PI / 2; f2.rotation.z = s * 0.25;
    claws.push(arm);
    const st = at(seg(0.01, 0.01, 0.1, '#222', 5), s * 0.09, 0.13, 0.2, body);
    at(blob(0.032, '#0a0a0a', 1, 1, 1, 8), s * 0.09, 0.2, 0.2, body);
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.scale.setScalar(1.8);
  return { root, body, legs, claws };
}

/* ------------------------------------------------------------------ FLAMINGO */
export function makeFlamingo() {
  const PINK = '#ff8aa6', DEEP = '#ff5f8c', LIGHT = '#ffc1d0';
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 1.0; root.add(body);
  at(blob(0.28, PINK, 0.78, 0.74, 1.4, 18), 0, 0, 0, body);
  at(blob(0.18, LIGHT, 0.8, 0.6, 1.2, 12), 0, 0.05, 0.05, body);
  at(blob(0.15, DEEP, 0.7, 0.45, 1.3, 10), 0, -0.02, -0.4, body);
  for (const s of [-1, 1]) {
    at(blob(0.22, DEEP, 0.35, 0.5, 1.25, 12), s * 0.2, 0.03, -0.05, body);
    at(blob(0.1, '#17121a', 0.3, 0.3, 1.0, 8), s * 0.2, -0.03, -0.36, body);   // black flight feathers
  }
  const neck = new THREE.Group(); neck.position.set(0, 0.1, 0.34); body.add(neck);
  const segs = [];
  let parent = neck;
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(); if (i > 0) g.position.y = 0.34;
    at(seg(0.04 - i * 0.003, 0.05 - i * 0.003, 0.34, PINK, 10), 0, 0.17, 0, g);
    at(blob(0.05 - i * 0.003, PINK, 1, 1, 1, 10), 0, 0, 0, g);
    parent.add(g); segs.push(g); parent = g;
  }
  const head = new THREE.Group(); head.position.y = 0.34; parent.add(head);
  at(blob(0.07, PINK, 1, 1.05, 1.2, 12), 0, 0.02, 0.0, head);
  const b1 = at(cone(0.05, 0.17, '#f7e8dc', 8), 0, 0.0, 0.14, head); b1.rotation.x = Math.PI / 2; b1.scale.y = 1.2;
  const b2 = at(cone(0.048, 0.13, '#17121a', 8), 0, -0.05, 0.26, head); b2.rotation.x = Math.PI / 2 + 0.55;
  for (const s of [-1, 1]) at(eye(0.021, '#e8c020'), s * 0.055, 0.04, 0.04, head).rotation.y = s * 0.9;
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.1, -0.12, -0.05); body.add(hip);
    at(seg(0.023, 0.026, 0.5, DEEP, 7), 0, -0.25, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -0.5; hip.add(knee);
    at(blob(0.03, '#e0507c', 1, 1, 1, 8), 0, 0, 0, knee);
    at(seg(0.017, 0.022, 0.48, DEEP, 7), 0, -0.24, 0, knee);
    const ft = at(blob(0.05, DEEP, 1.4, 0.3, 2.2, 8), 0, -0.49, 0.05, knee);
    legs.push({ hip, knee });
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.scale.setScalar(1.15);
  return { root, body, seg: segs, head, legs };
}

/* ------------------------------------------------------------------ feathered wings */
/** flat wing panel: root at origin, spans +x, feather tips scalloped along the trailing edge (-z) */
export function wingGeo({ len, chord, sweep = 0.1, tipChord = 0.7, feathers = 6, splay = 0, cols }) {
  const pos = [], col = [], idx = [];
  const c = (t) => { const k = cols(t); return k; };
  const push = (x, y, z, t) => { pos.push(x, y, z); const k = c(t); col.push(k.r, k.g, k.b); return pos.length / 3 - 1; };
  // leading edge
  const lead = [], trail = [];
  const N = feathers;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = t * len, zl = -sweep * t * t * len;
    lead.push(push(x, 0, zl, t));
    // feather tip: alternate between long (tip) and short (notch) for the scalloped edge
    const ch = chord * lerp(1, tipChord, t);
    const tx = x + splay * t * len * 0.4;
    trail.push(push(tx, -0.012 * ch, zl - ch, t));
    if (i < N) {
      const mid = (i + 0.5) / N;
      trail.push(push(tx + (len / N) * 0.5, -0.01 * ch, zl - ch * 0.62, mid));
    }
  }
  // triangles between leading edge and trailing scallops
  let ti = 0;
  for (let i = 0; i < N; i++) {
    const l0 = lead[i], l1 = lead[i + 1];
    const t0 = trail[ti], tm = trail[ti + 1], t1 = trail[ti + 2];
    idx.push(l0, t0, tm, l0, tm, l1, l1, tm, t1);
    ti += 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
function bandColors(bands) {
  const cs = bands.map((b) => new THREE.Color(b));
  return (t) => {
    const f = clamp(t, 0, 1) * (cs.length - 1), i = Math.min(cs.length - 2, Math.floor(f));
    return cs[i].clone().lerp(cs[i + 1], f - i);
  };
}

/* ------------------------------------------------------------------ BIRDS */
export function makeBird(s) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  at(blob(0.17, s.body, 0.85, 0.8, 1.6, 18), 0, 0, 0, body);
  at(blob(0.15, s.belly || s.body, 0.8, 0.55, 1.35, 14), 0, -0.06, 0.04, body);
  at(blob(0.1, s.body, 0.9, 0.9, 1.1, 12), 0, 0.05, 0.2, body);                // neck base
  const hd = new THREE.Group(); hd.position.set(0, 0.1, 0.31); body.add(hd);
  at(blob(0.1, s.head || s.body, 1, 1, 1.1, 14), 0, 0, 0, hd);
  if (s.face) at(blob(0.075, s.face, 1.05, 0.9, 0.6, 12), 0, -0.012, 0.055, hd);
  const bl = s.beakL || 0.16;
  if (s.beakType === 'hook') {
    const up = at(cone(0.06, bl, s.beak, 8), 0, 0.0, 0.1 + bl / 2, hd); up.rotation.x = Math.PI / 2 + 0.3; up.scale.y = 1.2;
    const lo = at(cone(0.045, bl * 0.7, '#3a3430', 8), 0, -0.05, 0.1 + bl * 0.3, hd); lo.rotation.x = Math.PI / 2 - 0.1;
  } else if (s.beakType === 'raptor') {
    const up = at(cone(0.055, bl, s.beak, 8), 0, -0.005, 0.11 + bl / 2, hd); up.rotation.x = Math.PI / 2 + 0.35;
    const lo = at(cone(0.04, bl * 0.8, s.beak, 8), 0, -0.04, 0.1 + bl * 0.35, hd); lo.rotation.x = Math.PI / 2;
  } else {
    const up = at(cone(0.04, bl, s.beak, 8), 0, 0.0, 0.1 + bl / 2, hd); up.rotation.x = Math.PI / 2;
    const lo = at(cone(0.032, bl * 0.9, s.beak, 8), 0, -0.035, 0.1 + bl * 0.4, hd); lo.rotation.x = Math.PI / 2;
    if (s.beakSpot) at(blob(0.014, s.beakSpot, 1, 1, 1, 6), 0, -0.05, 0.1 + bl * 0.75, hd);
  }
  for (const sg of [-1, 1]) at(eye(0.022, s.iris || '#3a2410'), sg * 0.075, 0.025, 0.055, hd).rotation.y = sg * 0.9;
  // tail: a fan of feathers
  const tl = s.tailL || 0.3;
  const tailG = new THREE.Group(); tailG.position.set(0, 0.0, -0.3); body.add(tailG);
  const nF = 5;
  for (let i = 0; i < nF; i++) {
    const a = (i / (nF - 1) - 0.5) * 0.7;
    const f = at(blob(0.05, i % 2 ? (s.tail || s.body) : (s.tail2 || s.tail || s.body), 0.75, 0.12, tl * 9, 8), -Math.sin(a) * tl * 0.45, 0, -Math.cos(a) * tl * 0.45, tailG);
    f.rotation.y = a;
  }
  const wings = [];
  for (const sg of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sg * 0.1, 0.05, 0.08); body.add(sh);
    const bandsIn = bandColors(s.wingIn || [s.wing, s.wing]);
    const bandsOut = bandColors(s.wingOut || [s.tip || s.wing, s.tip || s.wing]);
    const inner = new THREE.Mesh(wingGeo({ len: s.wI, chord: s.wC, sweep: 0.12, tipChord: 0.9, feathers: 4, cols: bandsIn }), wingMat);
    inner.scale.x = sg; inner.castShadow = true; sh.add(inner);
    const el = new THREE.Group(); el.position.x = sg * s.wI; sh.add(el);
    const z0 = -0.12 * s.wI;
    el.position.z = z0;
    const outer = new THREE.Mesh(wingGeo({ len: s.wO, chord: s.wC * 0.85, sweep: 0.18, tipChord: 0.45, feathers: 6, splay: s.splay ?? 0.25, cols: bandsOut }), wingMat);
    outer.scale.x = sg; outer.castShadow = true; el.add(outer);
    wings.push({ sh, el, sg });
  }
  const legs = [];
  const lm = SM(s.leg || '#555');
  for (const sg of [-1, 1]) {
    const l = new THREE.Group(); l.position.set(sg * 0.06, -0.1, 0.02); body.add(l);
    at(seg(0.016, 0.014, s.legL || 0.16, s.leg || '#555', 5), 0, -(s.legL || 0.16) / 2, 0, l);
    for (let k = -1; k <= 1; k++) { const t = at(seg(0.006, 0.005, 0.07, s.leg || '#555', 4), k * 0.02, -(s.legL || 0.16), 0.03, l); t.rotation.x = Math.PI / 2; }
    legs.push(l);
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.scale.setScalar(s.scale || 1);
  return { root, body, hd, wings, legs, tail: tailG };
}
export const BIRD_SPECS = {
  gull: { body: '#f3f3ee', belly: '#ffffff', wingIn: ['#ffffff', '#c4ccd2'], wingOut: ['#aab4bb', '#1c1c20'], tail: '#ffffff', beak: '#f2b630', beakSpot: '#d8301c', iris: '#caa020', wI: 0.44, wO: 0.46, wC: 0.2, scale: 2.0, leg: '#e0903a', beakL: 0.17 },
  macaw: { body: '#d4262d', belly: '#dd3a2e', head: '#d4262d', face: '#f4efe6', wingIn: ['#d4262d', '#e8c020', '#2a6ad8'], wingOut: ['#2a6ad8', '#1a3fa8'], tail: '#d4262d', tail2: '#2a58d6', beak: '#efe6d0', beakType: 'hook', beakL: 0.15, wI: 0.24, wO: 0.28, wC: 0.15, tailL: 0.66, scale: 2.0, leg: '#4a4440', iris: '#f0e060', splay: 0.15 },
  lorikeet: { body: '#3aa84a', belly: '#f2761a', head: '#2a4fd0', face: '#2a4fd0', wingIn: ['#3aa84a', '#2f8a3a'], wingOut: ['#2f8a3a', '#1f6a30'], tail: '#2f8a3a', tail2: '#e8c020', beak: '#f0481a', beakType: 'hook', beakL: 0.1, beakW: 1.1, wI: 0.19, wO: 0.21, wC: 0.11, tailL: 0.45, scale: 2.1, leg: '#5a5048', iris: '#e8a020', splay: 0.15 },
  tern: { body: '#ffffff', belly: '#ffffff', head: '#ffffff', wingIn: ['#ffffff', '#f4f6f8'], wingOut: ['#f2f4f6', '#d6dce2'], tail: '#ffffff', beak: '#1c1c20', beakL: 0.15, wI: 0.3, wO: 0.33, wC: 0.12, tailL: 0.36, scale: 1.9, leg: '#2a2a2e', iris: '#101010' },
  frigate: { body: '#1c1c22', belly: '#26262c', head: '#1c1c22', face: '#e04030', wingIn: ['#26262c', '#1a1a1f'], wingOut: ['#1a1a1f', '#0e0e12'], tail: '#141418', beak: '#8a8a92', beakType: 'hook', beakL: 0.24, wI: 0.75, wO: 0.85, wC: 0.15, tailL: 0.8, scale: 3.0, leg: '#c04030', iris: '#2a1a10', splay: 0.7 },
  eagle: { body: '#4a3626', belly: '#5b4430', head: '#f4f1e8', wingIn: ['#5b4430', '#3b2b1f'], wingOut: ['#3b2b1f', '#1e150e'], tail: '#f4f1e8', beak: '#f0c030', beakType: 'raptor', beakL: 0.17, wI: 0.52, wO: 0.56, wC: 0.3, scale: 3.4, leg: '#d9a430', iris: '#e8b020', splay: 0.5 },
};

/* ------------------------------------------------------------------ HUMAN (lofted, smooth, stylised — no anatomical detail) */
/** smooth body part from elliptical cross-sections: [{y, rx, rz, cz?}] top-to-bottom or any order */
export function loft(secs, color, seg = 18, o = {}) {
  const pos = [], idx = [];
  const n = secs.length;
  for (let i = 0; i < n; i++) {
    const s = secs[i];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      pos.push(Math.cos(a) * s.rx + (s.cx || 0), s.y, Math.sin(a) * s.rz + (s.cz || 0));
    }
  }
  const capTop = pos.length / 3; pos.push(secs[0].cx || 0, secs[0].y + (secs[0].capY ?? 0), secs[0].cz || 0);
  const capBot = pos.length / 3; pos.push(secs[n - 1].cx || 0, secs[n - 1].y + (secs[n - 1].capY ?? 0), secs[n - 1].cz || 0);
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, b, c, b, d, c);
    }
  for (let j = 0; j < seg; j++) {
    idx.push(capTop, ((j + 1) % seg), j);
    idx.push(capBot, (n - 1) * seg + j, (n - 1) * seg + ((j + 1) % seg));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, SM(color, { roughness: 0.58, emissive: 0x1c0d05, ...o }));
  m.castShadow = true;
  return m;
}

export function makeHuman() {
  const sculpted = buildHumanFromModel();
  if (sculpted) return sculpted;
  const SKIN = '#c98b56', SKIN2 = '#bb7c48', LIPS = '#a85c48', HAIR = '#ead06a', HAIR2 = '#d6ad45', HAIR3 = '#f3e08a';
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.9; root.add(hips);                 // pelvis pivot
  const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
  // one continuous torso: pelvis -> waist -> ribcage -> shoulders
  const torso = loft([
    { y: 0.66, rx: 0.0, rz: 0.0 },
    { y: 0.62, rx: 0.075, rz: 0.062, cz: -0.005 },
    { y: 0.575, rx: 0.2, rz: 0.1, cz: -0.012 },
    { y: 0.5, rx: 0.214, rz: 0.112, cz: 0.0 },
    { y: 0.38, rx: 0.196, rz: 0.115, cz: 0.006 },
    { y: 0.26, rx: 0.17, rz: 0.106, cz: 0.004 },
    { y: 0.14, rx: 0.148, rz: 0.1, cz: 0.0 },
    { y: 0.03, rx: 0.17, rz: 0.108, cz: -0.004 },
    { y: -0.07, rx: 0.178, rz: 0.115, cz: -0.012 },
    { y: -0.14, rx: 0.14, rz: 0.098, cz: -0.008 },
    { y: -0.19, rx: 0.07, rz: 0.06 },
  ], SKIN, 22);
  spine.add(torso);
  at(blob(0.09, SKIN, 1.1, 1.0, 0.8, 12), -0.07, -0.1, -0.1, spine);           // glutes
  at(blob(0.09, SKIN, 1.1, 1.0, 0.8, 12), 0.07, -0.1, -0.1, spine);
  for (const s of [-1, 1]) at(blob(0.07, SKIN, 1.5, 0.9, 0.8, 10), s * 0.13, 0.57, -0.02, spine); // trapezius slope
  const chest = new THREE.Group(); chest.position.y = 0.2; spine.add(chest);
  const neck = new THREE.Group(); neck.position.y = 0.34; chest.add(neck);
  at(loft([{ y: 0.1, rx: 0.052, rz: 0.05 }, { y: 0.04, rx: 0.048, rz: 0.048 }, { y: -0.02, rx: 0.058, rz: 0.058 }], SKIN, 14), 0, 0.02, 0, neck);
  const head = new THREE.Group(); head.position.y = 0.17; neck.add(head);
  // skull, face, jaw
  at(blob(0.104, SKIN, 0.9, 1.12, 1.02, 22), 0, 0.045, -0.002, head);
  at(blob(0.068, SKIN, 0.95, 0.75, 0.85, 16), 0, -0.05, 0.04, head);                        // jaw & chin
  for (const s of [-1, 1]) {
    at(blob(0.05, SKIN, 0.95, 0.8, 0.7, 12), s * 0.062, -0.002, 0.07, head);                // cheekbones
    at(blob(0.045, SKIN, 1.0, 0.7, 0.9, 10), s * 0.05, -0.052, 0.062, head);                // lower cheeks
  }
  at(blob(0.04, SKIN, 2.1, 0.55, 0.8, 10), 0, 0.083, 0.088, head);                            // brow ridge
  const nose = at(blob(0.026, SKIN, 0.85, 1.7, 1.25, 10), 0, 0.012, 0.103, head); nose.rotation.x = -0.35;
  at(blob(0.022, SKIN2, 1.2, 0.8, 0.9, 8), 0, -0.012, 0.118, head);                           // nose tip
  for (const s of [-1, 1]) at(blob(0.007, '#4a2418', 1, 1.4, 1, 6), s * 0.012, -0.018, 0.124, head);   // nostrils
  at(blob(0.017, LIPS, 2.3, 0.6, 0.9, 8), 0, -0.047, 0.1, head);                              // upper lip
  at(blob(0.017, LIPS, 2.1, 0.7, 0.9, 8), 0, -0.062, 0.096, head);                            // lower lip
  for (const s of [-1, 1]) {
    const e = at(eye(0.0215, '#3d86c6'), s * 0.04, 0.05, 0.088, head); e.rotation.y = s * 0.2;
    at(blob(0.0235, SKIN2, 1.05, 0.5, 1.0, 10), s * 0.04, 0.066, 0.092, head).rotation.y = s * 0.2;   // upper lids
    at(blob(0.025, HAIR2, 1.9, 0.36, 0.6, 8), s * 0.042, 0.087, 0.097, head).rotation.z = s * -0.12;  // brows
    at(blob(0.029, SKIN, 0.45, 1.15, 0.85, 10), s * 0.096, 0.028, -0.008, head);              // ears
  }
  // sun-bleached blond hair: crown cap + swept-back strands + side locks + short beard
  const hair = new THREE.Group(); head.add(hair);
  at(blob(0.109, HAIR, 0.97, 0.78, 1.04, 22), 0, 0.093, -0.012, hair);
  const strand = (a, el, len, r, col, back = 1) => {
    const dx = Math.sin(a) * Math.cos(el), dz = Math.cos(a) * Math.cos(el), dy = Math.sin(el);
    const base = V(dx * 0.095, 0.045 + dy * 0.1, dz * 0.095 - 0.012);
    const pts = [base, base.clone().add(V(dx * 0.03, -len * 0.35, dz * 0.03 - len * 0.1 * back)), base.clone().add(V(dx * 0.04, -len * 0.78, dz * 0.045 - len * 0.34 * back)), base.clone().add(V(dx * 0.035, -len * 1.0, dz * 0.04 - len * 0.5 * back))];
    hair.add(taper(pts, r, r * 0.3, col, 6, 6));
  };
  for (let i = 0; i < 46; i++) {
    const a = rr(0, TAU), el = rr(0.1, 1.0), backish = Math.cos(a - Math.PI) * 0.5 + 0.5;
    strand(a, el, rr(0.1, 0.19) + 0.13 * backish, rr(0.013, 0.019), pick([HAIR, HAIR, HAIR2, HAIR3]));
  }
  for (let i = 0; i < 9; i++) strand(Math.PI + rr(-0.9, 0.9), rr(0.0, 0.35), rr(0.2, 0.3), 0.017, pick([HAIR, HAIR2]));   // shoulder-length nape
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) strand(s * rr(1.35, 1.7), rr(-0.1, 0.3), rr(0.1, 0.15), 0.014, HAIR2, 0.4);  // locks by the ears
  for (let i = 0; i < 7; i++) strand(rr(-0.7, 0.7), rr(0.75, 1.0), rr(0.05, 0.1), 0.014, HAIR3, -0.6);                          // swept fringe
  at(blob(0.062, HAIR2, 1.0, 0.55, 0.75, 14), 0, -0.07, 0.058, head);                          // short blond beard
  at(blob(0.032, HAIR2, 1.9, 0.34, 0.6, 8), 0, -0.033, 0.098, head);                           // moustache
  // arms
  const arm = (s) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.215, 0.29, 0); chest.add(sh);
    at(blob(0.064, SKIN, 1.05, 1.15, 1.05, 14), 0, -0.01, 0, sh);                                // deltoid
    at(loft([{ y: 0, rx: 0.056, rz: 0.058 }, { y: -0.08, rx: 0.056, rz: 0.06, cz: 0.004 }, { y: -0.19, rx: 0.047, rz: 0.05 }, { y: -0.3, rx: 0.039, rz: 0.04 }], SKIN, 14), 0, 0, 0, sh);
    const elbow = new THREE.Group(); elbow.position.y = -0.3; sh.add(elbow);
    at(blob(0.041, SKIN, 1, 1, 1, 10), 0, 0, 0, elbow);
    at(loft([{ y: 0, rx: 0.04, rz: 0.04 }, { y: -0.07, rx: 0.044, rz: 0.043 }, { y: -0.18, rx: 0.034, rz: 0.034 }, { y: -0.28, rx: 0.027, rz: 0.025 }], SKIN, 14), 0, 0, 0, elbow);
    const hand = new THREE.Group(); hand.position.y = -0.28; elbow.add(hand);
    at(blob(0.04, SKIN, 0.95, 1.1, 0.5, 12), 0, -0.04, 0, hand);                                 // palm
    for (let i = 0; i < 4; i++) {
      const f = at(seg(0.0095, 0.0075, 0.075, SKIN, 6), (i - 1.5) * 0.0175, -0.105, 0.012, hand); f.rotation.x = -0.25;
    }
    const th = at(seg(0.011, 0.008, 0.055, SKIN, 6), -s * 0.034, -0.065, 0.014, hand); th.rotation.z = s * 0.7; th.rotation.x = -0.2;
    sh.elbow = elbow; sh.hand = hand;
    return sh;
  };
  const armL = arm(-1), armR = arm(1);
  const leg = (s) => {
    const hip = new THREE.Group(); hip.position.set(s * 0.09, -0.02, 0); hips.add(hip);
    at(loft([{ y: 0.0, rx: 0.088, rz: 0.1 }, { y: -0.1, rx: 0.1, rz: 0.108, cz: 0.004 }, { y: -0.24, rx: 0.084, rz: 0.092 }, { y: -0.36, rx: 0.066, rz: 0.07 }, { y: -0.45, rx: 0.056, rz: 0.058 }], SKIN, 16), 0, 0, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
    at(blob(0.058, SKIN, 1, 1, 1, 12), 0, 0, 0, knee);
    at(loft([{ y: 0, rx: 0.056, rz: 0.058 }, { y: -0.09, rx: 0.06, rz: 0.07, cz: -0.012 }, { y: -0.22, rx: 0.048, rz: 0.054, cz: -0.006 }, { y: -0.34, rx: 0.037, rz: 0.04 }, { y: -0.42, rx: 0.033, rz: 0.035 }], SKIN, 16), 0, 0, 0, knee);
    const foot = new THREE.Group(); foot.position.y = -0.43; knee.add(foot);
    at(blob(0.04, SKIN, 1, 1, 1, 10), 0, 0, 0, foot);                                            // ankle
    at(blob(0.052, SKIN, 0.9, 0.5, 2.1, 12), 0, -0.022, 0.055, foot);                           // foot
    for (let i = 0; i < 5; i++) at(blob(0.011, SKIN2, 1, 0.8, 1.2, 6), (i - 2) * 0.017, -0.032, 0.15 - Math.abs(i - 2) * 0.004, foot);
    hip.knee = knee; hip.foot = foot;
    return hip;
  };
  const legL = leg(-1), legR = leg(1);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, hips, spine, chest, neck, head, armL, armR, legL, legR, hair };
}
