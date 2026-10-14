import * as THREE from 'three';
import { tagObject } from './inspect.js';
import { scene, updaters, U, env, events } from './core.js';
import { MB, C, shade, mat4, lumpy, M, tube } from './gfx.js';
import { addCollider, addSurface, getHeight, getSlope, falls, river, TEMPLE, SPRING, FAIRY, COVE, marchToShore, riverDist } from './world.js';
import { Particles } from './particles.js';
import { installSplash } from './splash.js';
import { zones } from './camera.js';
import { rnd, rr, pick, clamp, lerp, smoothstep, burn, TAU } from './util.js';
import { buildWreck } from './wreck.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const secrets = [];
export const fx = {};

const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, side: THREE.DoubleSide });

function addMesh(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  scene.add(m);
  return m;
}
const box = (w, h, d, s = 1) => new THREE.BoxGeometry(w, h, d, s, s, s);
function jitterGeo(g, a) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (rnd() - 0.5) * a, p.getY(i) + (rnd() - 0.5) * a, p.getZ(i) + (rnd() - 0.5) * a);
  return g;
}

export function addSecret(o) {
  secrets.push({ found: false, ...o });
}

/* ================================================================== shared fx */
export function buildFx() {
  fx.fire = new Particles(900, { additive: true, soft: 0.7, order: 7 });
  fx.mist = new Particles(1400, { lit: true, soft: 1, order: 6, wind: 0.4 });
  fx.drops = new Particles(900, { lit: true, soft: 0.2, order: 6 });
  fx.sparkle = new Particles(300, { additive: true, soft: 0.9, order: 8 });
  installSplash(fx);
  fx.flame = (x, y, z, s = 1) => {
    fx.fire.emit({ x: x + rr(-0.08, 0.08) * s, y, z: z + rr(-0.08, 0.08) * s, vx: rr(-0.2, 0.2), vy: rr(0.8, 1.7) * s, vz: rr(-0.2, 0.2), life: rr(0.4, 0.8), s0: 0.45 * s, s1: 0.08 * s, c0: [1, 0.55, 0.15, 0.9], c1: [1, 0.15, 0.0, 0], drag: 0.7 });
  };
}

/* ================================================================== waterfall mist + grotto */
export function buildGrotto() {
  const n = falls.n, t = { x: -n.z, z: n.x };
  const B = falls.ledge;
  const at = (a, b, y = 0) => V(B.x + n.x * a + t.x * b, B.y + y, B.z + n.z * a + t.z * b);

  // rocky frame (pillars + roof)
  const mb = new MB();
  const rockC = [C('#6e6a62'), C('#7b756b'), C('#5f5b55')];
  const moss = C('#4a7a35');
  const rock = (c, R, sy = 0.8, seed = 0) => {
    const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.38, seed);
    const base = pick(rockC);
    mb.addGeo(g, mat4(c.x, c.y, c.z, R, R * sy, R, 0, rnd() * 6, 0), (v) => {
      const top = clamp((v.y - c.y) / (R * sy) * 0.5 + 0.5, 0, 1);
      return shade(base, 0.8 + 0.3 * top).lerp(moss, smoothstep(0.62, 0.95, top) * 0.7);
    });
  };
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) rock(at(rr(-1.5, 2.2), side * (6.4 + rr(-0.4, 0.8)), 1.2 + k * 2.1), rr(2.0, 2.9), 0.9, k + side);
    rock(at(rr(-3, -1), side * rr(5, 7), 0.4), 2.6, 0.7);
    rock(at(rr(3, 4), side * rr(6.6, 7.6), 0.0), 2.3, 0.6);
  }
  for (let i = 0; i < 9; i++) {
    const b = -6.5 + i * 1.6 + rr(-0.5, 0.5);
    rock(at(rr(-1.5, 3.2), b, 6.7 + rr(-0.3, 0.7)), rr(2.2, 3.0), 0.55, i);
  }
  for (let i = 0; i < 6; i++) rock(at(rr(2.5, 4.2), rr(-5, 5), 6.0 + rr(0, 1)), rr(1.2, 1.8), 0.6, i + 10);
  tagObject(addMesh(mb.build(), stoneMat), 'grotto');
  for (const side of [-1, 1]) { const q = at(0.3, side * 6.6); addCollider(q.x, q.z, 2.6); const q2 = at(-2.5, side * 5.6); addCollider(q2.x, q2.z, 2.0); }

  // crystals
  const cm = new THREE.MeshStandardMaterial({ color: 0x66f0ff, emissive: 0x33d0ff, emissiveIntensity: 2.2, roughness: 0.25, flatShading: true });
  const cm2 = new THREE.MeshStandardMaterial({ color: 0xe36bff, emissive: 0xc03cff, emissiveIntensity: 2.2, roughness: 0.25, flatShading: true });
  const cm3 = new THREE.MeshStandardMaterial({ color: 0xffd26a, emissive: 0xff9a2a, emissiveIntensity: 1.8, roughness: 0.3, flatShading: true });
  const crystals = new THREE.Group();
  for (let i = 0; i < 22; i++) {
    const m = pick([cm, cm, cm2, cm2, cm3]);
    const h = rr(0.6, 2.4);
    const c = new THREE.Mesh(new THREE.ConeGeometry(rr(0.12, 0.3), h, 5), m);
    const p = at(rr(-4.6, -1.6), rr(-4.6, 4.6));
    p.y = getHeight(p.x, p.z) + h * 0.45;
    c.position.copy(p);
    c.rotation.set(rr(-0.45, 0.45), rnd() * 6, rr(-0.45, 0.45));
    crystals.add(c);
  }
  scene.add(crystals);
  const gl1 = new THREE.PointLight(0x55e6ff, 55, 17, 2);
  gl1.position.copy(at(-2.5, -2, 2.2));
  const gl2 = new THREE.PointLight(0xd45cff, 40, 15, 2);
  gl2.position.copy(at(-2.5, 2.8, 2.0));
  scene.add(gl1, gl2);

  // treasure chest
  const chest = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc83a, emissive: 0xff9a10, emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.3 });
  const b1 = new THREE.Mesh(box(1.5, 0.8, 0.9), wood); b1.position.y = 0.4;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.5, 12, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2; lid.position.set(0, 0.85, 0); lid.rotation.x = 0;
  lid.rotation.set(0, 0, Math.PI / 2); lid.position.y = 0.8; lid.scale.set(1, 1, 1);
  const band1 = new THREE.Mesh(box(0.1, 0.85, 0.95), gold); band1.position.set(-0.5, 0.42, 0);
  const band2 = band1.clone(); band2.position.x = 0.5;
  const lock = new THREE.Mesh(box(0.2, 0.25, 0.1), gold); lock.position.set(0, 0.7, 0.47);
  const pile = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 5), gold); pile.scale.set(1.1, 0.35, 0.75); pile.position.set(0.05, 0.82, 0.55);
  chest.add(b1, lid, band1, band2, lock, pile);
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 8), gold);
    c.position.set(rr(-0.9, 0.9), 0.04, rr(0.6, 1.4)); c.rotation.set(rr(-0.2, 0.2), 0, rr(-0.2, 0.2));
    chest.add(c);
  }
  chest.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const cp = at(-2.8, 0.3);
  chest.position.set(cp.x, getHeight(cp.x, cp.z), cp.z);
  chest.rotation.y = Math.atan2(n.x, n.z) + Math.PI + 0.2;
  scene.add(chest);
  const cl = new THREE.PointLight(0xffb040, 12, 7, 2);
  cl.position.set(cp.x, chest.position.y + 1.4, cp.z);
  scene.add(cl);

  const center = at(0, 0, 3);
  zones.grotto = { c: center.clone(), r: 9.5 };
  falls.grotto = center.clone();
  addSecret({
    id: 'grotto', name: 'The Crystal Cave', hint: 'Something glitters where the water falls…',
    desc: 'A hidden cave behind Veil Falls: halls of glowing crystals and gemstones, a bioluminescent pool, and a forgotten treasure chest.', pos: center.clone(), r: 8.5,
  });

  // mist + spray at the base of the falls
  let a1 = 0, a2 = 0, a3 = 0;
  updaters.push((dt, tm) => {
    const L = falls.landing;
    a1 += dt * 7; a2 += dt * 24; a3 += dt * 4;
    while (a1 > 1) {
      a1--;
      const s = rr(-2.6, 2.6);
      fx.mist.emit({ x: L.x + t.x * s, y: falls.pool.y + 0.3, z: L.z + t.z * s, vx: n.x * rr(0.5, 2) + rr(-.3, .3), vy: rr(1.2, 2.8), vz: n.z * rr(0.5, 2) + rr(-.3, .3), life: rr(2.4, 4), s0: 3, s1: rr(8, 13), c0: [0.82, 0.88, 0.92, 0.12], c1: [0.82, 0.88, 0.92, 0], drag: 0.5 });
    }
    while (a2 > 1) {
      a2--;
      const s = rr(-2.4, 2.4);
      fx.drops.emit({ x: L.x + t.x * s, y: falls.pool.y + 0.4, z: L.z + t.z * s, vx: rr(-2, 2), vy: rr(3, 8), vz: rr(-2, 2), life: rr(0.7, 1.4), s0: 0.4, s1: 0.14, c0: [0.9, 0.95, 1, 0.5], c1: [0.9, 0.95, 1, 0], grav: 12, drag: 0.3 });
    }
    // drifting mist along the cliff
    while (a3 > 1) {
      a3--;
      const q = rr(0, 1), hh = lerp(falls.pool.y, falls.lip.y, q);
      const out = falls.reach * Math.sqrt(1 - q) + 0.2;
      fx.mist.emit({ x: falls.lip.x + n.x * out + t.x * rr(-1.5, 1.5), y: hh, z: falls.lip.z + n.z * out + t.z * rr(-1.5, 1.5), vy: rr(-0.5, 0.5), life: rr(2, 3), s0: 2, s1: 6, c0: [1, 1, 1, 0.12], c1: [1, 1, 1, 0], drag: 0.5 });
    }
    // crystal pulse
    const p = 1.8 + 0.5 * Math.sin(tm * 1.7);
    cm.emissiveIntensity = p; cm2.emissiveIntensity = p * (1.1 + 0.2 * Math.sin(tm * 2.3));
    gl1.intensity = 45 + 15 * Math.sin(tm * 1.7); gl2.intensity = 34 + 10 * Math.sin(tm * 2.1 + 1);
  });
  return center;
}

/* ================================================================== temple */
export function buildTemple() {
  const { x: X, z: Z, y: Y } = TEMPLE;
  const mb = new MB();
  const stone = [C('#8a8a78'), C('#7c7d6c'), C('#6f7364')];
  const mossC = C('#4d7f35');
  const blk = (w, h, d, cx, cy, cz, ry = 0, moss = 0.5) => {
    const g = jitterGeo(box(w, h, d, 2), 0.18);
    const base = pick(stone);
    mb.addGeo(g, mat4(X + cx, Y + cy, Z + cz, 1, 1, 1, 0, ry, 0), (v) => {
      const top = (v.y - (Y + cy)) > h * 0.35 ? 1 : 0;
      return shade(base, rr(0.9, 1.08)).lerp(mossC, top * moss * rr(0.3, 1));
    });
  };
  // tiers
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const s = 19 - i * 4.2, h = 1.75;
    blk(s, h, s, 0, h * 0.5 + i * h, 0, 0, 0.6);
  }
  const topY = tiers * 1.75;
  // stairs (south side, +z)
  for (let i = 0; i < tiers * 4; i++) {
    const h = (i + 1) * 0.44;
    blk(4.4, h, 0.6, 0, h * 0.5, 11.2 - i * 0.5, 0, 0.3);
  }
  // shrine
  blk(6.2, 0.4, 6.2, 0, topY + 0.2, 0, 0, 0.5);
  blk(0.8, 3.2, 0.8, -2.5, topY + 2.0, -2.5); blk(0.8, 3.2, 0.8, 2.5, topY + 2.0, -2.5);
  blk(0.8, 3.2, 0.8, -2.5, topY + 2.0, 2.5); blk(0.8, 3.2, 0.8, 2.5, topY + 2.0, 2.5);
  blk(6.6, 0.7, 6.6, 0, topY + 3.8, 0, 0.0, 0.8);
  blk(4.8, 0.6, 4.8, 0, topY + 4.4, 0, 0.0, 0.9);
  blk(2.0, 0.6, 2.0, 0, topY + 4.9, 0, 0.0, 0.9);
  blk(5.2, 3.0, 0.6, 0, topY + 1.9, -2.7);
  // plaza pillars
  const pillars = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, r = 14.5 + rr(-1, 1);
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    if (pz > 6 && Math.abs(px) < 4.5) continue; // keep the stairs clear
    const broken = rnd() < 0.45;
    const h = broken ? rr(1.3, 3) : rr(4.6, 5.6);
    const g = jitterGeo(new THREE.CylinderGeometry(0.62, 0.72, h, 7, 2), 0.14);
    const base = pick(stone), gy = getHeight(X + px, Z + pz);
    mb.addGeo(g, mat4(X + px, gy + h * 0.5 - 0.2, Z + pz), (v) => shade(base, rr(0.9, 1.05)).lerp(mossC, smoothstep(0.1, 1.2, (gy - v.y) * -0.3 - 0.0 + (v.y - gy) * 0.04) * 0.35));
    pillars.push({ px, pz, h });
    addCollider(X + px, Z + pz, 0.85);
    if (!broken) {
      const g2 = jitterGeo(box(1.5, 0.5, 1.5, 1), 0.1);
      mb.addGeo(g2, mat4(X + px, gy + h - 0.1, Z + pz), shade(base, 1.05));
    } else {
      const g3 = jitterGeo(new THREE.CylinderGeometry(0.6, 0.66, 2.4, 7, 1), 0.12);
      mb.addGeo(g3, mat4(X + px + rr(-1.5, 1.5) + 1.8, gy + 0.55, Z + pz + rr(-1.5, 1.5) + 1.2, 1, 1, 1, 0, rnd() * 3, Math.PI / 2 + 0.15), shade(base, 0.95));
    }
  }
  // standing stones on the approach
  for (let i = 0; i < 5; i++) {
    const px = rr(-5, 5), pz = rr(16, 24), gy = getHeight(X + px, Z + pz);
    const h = rr(1.8, 3);
    addCollider(X + px, Z + pz, 0.6);
    mb.addGeo(jitterGeo(box(0.9, h, 0.5, 1), 0.15), mat4(X + px, gy + h * 0.5 - 0.1, Z + pz, 1, 1, 1, rr(-0.1, 0.1), rnd() * 0.8, rr(-0.1, 0.1)), shade(pick(stone), 0.95));
  }
  tagObject(addMesh(mb.build(), stoneMat), 'temple');
  addSurface((x, z) => {
    const dx = x - X, dz = z - Z, ax = Math.abs(dx), az = Math.abs(dz);
    if (ax > 10 || az > 12) return null;
    let y = null;
    for (let i = 0; i < tiers; i++) { const hs = (19 - i * 4.2) / 2; if (ax < hs && az < hs) y = Y + (i + 1) * 1.75; }
    if (ax < 2.2 && dz > 3.2 && dz < 11.5) {
      const i = Math.min(tiers * 4 - 1, Math.max(0, Math.round((11.2 - dz) / 0.5)));
      y = Math.max(y ?? -1e9, Y + (i + 1) * 0.44);
    }
    if (ax < 3.1 && az < 3.1) y = Math.max(y ?? -1e9, Y + tiers * 1.75 + 0.4);
    return y;
  }, 'temple');

  // idol
  const idol = new THREE.Group();
  const sm = new THREE.MeshStandardMaterial({ color: 0x8e8d7a, roughness: 0.95, flatShading: true });
  const head = new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(1.35, 1), 0.07, 5), sm);
  head.scale.set(1, 1.2, 0.95); head.position.y = 1.6;
  const brow = new THREE.Mesh(box(2.3, 0.4, 0.8), sm); brow.position.set(0, 2.15, 0.9);
  const nose = new THREE.Mesh(box(0.5, 0.9, 0.7), sm); nose.position.set(0, 1.55, 1.1);
  const mouth = new THREE.Mesh(box(1.2, 0.28, 0.5), new THREE.MeshStandardMaterial({ color: 0x55564a, roughness: 1 })); mouth.position.set(0, 0.95, 1.05);
  const base = new THREE.Mesh(box(2.4, 0.5, 2.0), sm); base.position.y = 0.25;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.3, 5), sm); crown.position.y = 3.4;
  const eyeM = new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0xff8a10, emissiveIntensity: 3.0 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), eyeM); e1.position.set(-0.55, 1.95, 1.18);
  const e2 = e1.clone(); e2.position.x = 0.55;
  idol.add(head, brow, nose, mouth, base, crown, e1, e2);
  idol.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  idol.position.set(X, Y + topY + 0.4, Z - 0.6);
  idol.scale.setScalar(0.9);
  scene.add(idol);
  const il = new THREE.PointLight(0xffa030, 50, 22, 2);
  il.position.set(X, Y + topY + 3.2, Z + 2.2);
  scene.add(il);

  // tiki torches
  const torches = [];
  const poleM = M('#5b3d24');
  for (const [tx, tz] of [[-3.6, 12], [3.6, 12], [-9, 6], [9, 6], [-8, -9], [8, -9]]) {
    const gy = getHeight(X + tx, Z + tz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.4, 6), poleM);
    pole.position.set(X + tx, gy + 1.2, Z + tz); pole.castShadow = true;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.12, 0.3, 8), M('#3b2a1c'));
    bowl.position.set(X + tx, gy + 2.45, Z + tz);
    scene.add(pole, bowl);
    torches.push({ x: X + tx, y: gy + 2.65, z: Z + tz });
  }
  let fa = 0;
  updaters.push((dt, tm) => {
    fa += dt * 22;
    while (fa > 1) { fa--; for (const q of torches) fx.flame(q.x, q.y, q.z, 1.5); }
    il.intensity = 40 + 12 * Math.sin(tm * 3.1) * Math.sin(tm * 1.3);
    eyeM.emissiveIntensity = 2.5 + 1.2 * Math.sin(tm * 1.6);
  });

  addSecret({
    id: 'temple', name: 'The Sunken Temple', hint: 'Old stones watch the jungle at the foot of the volcano.',
    desc: 'A moss-covered stepped temple. The idol’s eyes still glow at dusk.', pos: V(X, Y + 6, Z), r: 25,
  });
}

/* ================================================================== shipwreck + canoe + camp */
/** a single-bladed Polynesian paddle: grip at local y=+0.8, blade at the far end (y≈-0.8) */
export function makePaddle() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#8a5a2c', roughness: 0.7, flatShading: true });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 1.5, 6), wood); shaft.position.y = 0.05; g.add(shaft);
  const grip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), wood); grip.position.y = 0.8; g.add(grip);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.5, 0.022), wood); blade.position.y = -0.95; blade.scale.set(1, 1, 1); g.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.14, 6), wood); tip.position.y = -1.27; tip.rotation.x = Math.PI; tip.scale.z = 0.25; g.add(tip);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function buildCove() {
  // --- shipwreck
  const sx = COVE.x + 16, sz = COVE.z + 18;
  const sy = getHeight(sx, sz);
  // The old hull drew 109 numbers from the world's random stream. The wreck now has its own generator, but those draws are still
  // spent here, so nothing placed after it (and no object id) moves.
  burn(109);
  const ship = buildWreck(woodMat);
  ship.position.set(sx, sy + 4.1, sz);
  ship.rotation.set(0.3, 0.65, 0.12);                                   // heeled hard over, bow hung up on the bank: the port side stands clear of the water
  for (const o of [-8, -4, 0, 4, 8]) addCollider(sx + Math.cos(0.65) * o, sz - Math.sin(0.65) * o, 2.3);
  scene.add(ship); tagObject(ship, 'wreck');
  addSecret({
    id: 'wreck', name: 'The Sunken Galleon', hint: 'The lagoon remembers a ship that never left.',
    desc: 'The bones of a treasure galleon, four hundred years on the bottom: ribs bared, gun ports gaping, masts snapped to stumps, the sails long rotted away, all of it turning into a reef.', pos: V(sx, sy + 3, sz), r: 18,
  });

  // --- giant clam with pearl: a tridacna about 1 m long, half-buried on the lagoon floor, its blue mantle showing at the gape
  const cx = COVE.x - 12, cz = COVE.z + 10;
  const cy = getHeight(cx, cz);
  const clam = new THREE.Group();
  const shellM = new THREE.MeshStandardMaterial({ color: 0xcfc2aa, roughness: 0.5 });
  const mantleM = new THREE.MeshStandardMaterial({ color: 0x3a8fb0, emissive: 0x0b4a66, emissiveIntensity: 0.6, roughness: 0.35 });
  // one valve: a half-ellipsoid fluted with radial ribs that run from the hinge out to the lip
  const valveGeo = () => {
    const g = new THREE.SphereGeometry(1, 48, 14, 0, TAU, 0, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const rib = 1 + 0.045 * Math.sin(Math.atan2(z, x) * 22) * (0.4 + 0.6 * y);
      p.setXYZ(i, x * 0.5 * rib, y * 0.2, z * 0.44 * rib);
    }
    g.computeVertexNormals();
    return g;
  };
  const lower = new THREE.Mesh(valveGeo(), shellM);
  // the upper valve hinges at the back edge and lifts at the front, showing the mantle
  const upper = new THREE.Group();
  upper.position.set(0, 0.02, -0.44);
  const upperValve = new THREE.Mesh(valveGeo(), shellM);
  upperValve.position.z = 0.44;
  upper.add(upperValve);
  upper.rotation.x = -0.42;
  const mantle = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 10, 0, TAU, 0, Math.PI / 2), mantleM);
  mantle.scale.set(0.42, 0.12, 0.38); mantle.position.y = 0.06;
  const pearlM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfeaff, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.3 });
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), pearlM);
  pearl.position.set(0.1, 0.13, 0.08);
  clam.add(lower, mantle, upper, pearl);
  clam.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  clam.position.set(cx, cy - 0.03, cz);
  clam.rotation.y = 0.7;
  scene.add(clam); tagObject(clam, 'clam');
  clam.updateMatrixWorld(true);
  const pearlPos = pearl.getWorldPosition(new THREE.Vector3());
  falls.clam = pearlPos.clone();
  addSecret({
    id: 'clam', name: 'The Pearl Garden', hint: 'Something pale gleams on the seabed of the lagoon.',
    desc: 'A giant clam guards a luminous pearl in a bed of coral.', pos: pearlPos, r: 11,
  });
  let sp = 0;
  updaters.push((dt, tm) => {
    pearlM.emissiveIntensity = 1.2 + 0.8 * Math.sin(tm * 2.1);
    upper.rotation.x = -0.42 - 0.07 * Math.sin(tm * 0.5);
    sp += dt * 2.5;
    while (sp > 1) { sp--; fx.sparkle.emit({ x: pearlPos.x + rr(-.4, .4), y: pearlPos.y + rr(0, 0.6), z: pearlPos.z + rr(-.4, .4), vy: rr(0.1, 0.4), life: rr(1, 1.8), s0: 0.5, s1: 0.1, c0: [0.7, 0.95, 1, 0.8], c1: [0.7, 0.95, 1, 0], drag: 0.5 }); }
  });

  // --- canoe and campfire on the western beach of the cove (the old jetty has been removed)
  const shoreStart = marchToShore(COVE.x - 50, COVE.z + 4, 1, 0.05, 0.9, 0.4, 80);
  const dir = new THREE.Vector2(0.95, 0.3).normalize();
  {
    // The jetty's planks used to draw from the world's seeded random stream. Keep drawing the same numbers so every
    // object placed after this point (and so every object id) stays exactly where it was.
    const wd = [0, 1, 2];
    for (let i = 0; i < 34; i++) { pick(wd); rr(0.9, 1.1); }
  }
  // the terns rest on the sand where the jetty posts used to be
  falls.perches = [1.6, 3.2, 4.8].map((d) => { const px = shoreStart.x - dir.x * d + dir.y * (d - 3) * 0.5, pz = shoreStart.z - dir.y * d - dir.x * (d - 3) * 0.5; return { x: px, y: getHeight(px, pz) + 0.02, z: pz }; });

  // traditional Polynesian outrigger canoe (va'a) drawn up at the water's edge, ama floating in the shallows
  const kp = marchToShore(COVE.x - 40, COVE.z - 6, 0.3, 1, 1.5, 0.4, 80);
  {
    const L = 7.4, N = 24, M2 = 9;
    const mb = new MB();
    const hullA = [C('#9a6430'), C('#8a5628')], inside = C('#4a2e18'), trim = C('#3c2513'), cord = C('#d2b27a'), woodB = C('#7a5028'), shellW = C('#f4efe4');
    const prof = (t) => {
      const e = Math.abs(2 * t - 1);
      return { z: (t - 0.5) * L, yk: 0.2 + 1.35 * Math.pow(e, 3.3), yg: 0.66 + 1.45 * Math.pow(e, 2.9), w: 0.47 * Math.pow(Math.sin(Math.PI * (0.025 + 0.95 * t)), 0.6) };
    };
    const ring = (t, shrink, lift) => {
      const q = prof(t), pts = [];
      for (let j = 0; j < M2; j++) { const phi = (j / (M2 - 1)) * Math.PI; pts.push(V(-Math.cos(phi) * q.w * shrink, q.yg - (q.yg - q.yk - lift) * Math.sin(phi) + (shrink < 1 ? 0 : 0), q.z)); }
      return pts;
    };
    for (let i = 0; i < N; i++) {
      const A = ring(i / N, 1, 0), B = ring((i + 1) / N, 1, 0), Ai = ring(i / N, 0.86, 0.1), Bi = ring((i + 1) / N, 0.86, 0.1);
      for (let j = 0; j < M2 - 1; j++) {
        const c = shade(hullA[(i + j) % 2], 0.92 + 0.12 * (j / M2)), ci = shade(inside, 1 + 0.2 * (j % 2));
        mb.tri(A[j], B[j], A[j + 1], c, c, c); mb.tri(B[j], B[j + 1], A[j + 1], c, c, c);
        mb.tri(Ai[j], Ai[j + 1], Bi[j], ci, ci, ci); mb.tri(Bi[j], Ai[j + 1], Bi[j + 1], ci, ci, ci);
      }
      for (const jj of [0, M2 - 1]) {                       // gunwale rim
        const c = trim; mb.tri(A[jj], B[jj], Ai[jj], c, c, c); mb.tri(B[jj], Bi[jj], Ai[jj], c, c, c);
      }
    }
    // carved bow with a little tiki face, curled stern with shell inlay
    for (const sgn of [-1, 1]) {
      const t = sgn < 0 ? 0 : 1, q = prof(t);
      const post = [V(0, q.yg - 0.1, q.z - sgn * 0.1), V(0, q.yg + 0.28, q.z + sgn * 0.12), V(0, q.yg + 0.62, q.z + sgn * 0.02), V(0, q.yg + 0.82, q.z - sgn * 0.2)];
      tube(mb, post, [0.1, 0.085, 0.07, 0.05], 6, () => trim, () => 0);
      if (sgn < 0) {
        mb.addGeo(new THREE.IcosahedronGeometry(0.15, 1), new THREE.Matrix4().compose(V(0, q.yg + 0.55, q.z - 0.16), new THREE.Quaternion(), V(0.9, 1.1, 0.8)), C('#6b4423'), 0);
        for (const e of [-1, 1]) mb.addGeo(new THREE.IcosahedronGeometry(0.03, 0), new THREE.Matrix4().makeTranslation(e * 0.06, q.yg + 0.6, q.z - 0.29), shellW, 0);
        mb.addGeo(new THREE.BoxGeometry(0.1, 0.03, 0.04), new THREE.Matrix4().makeTranslation(0, q.yg + 0.47, q.z - 0.3), C('#2a1608'), 0);
      } else for (let k = 0; k < 4; k++) mb.addGeo(new THREE.IcosahedronGeometry(0.035, 0), new THREE.Matrix4().makeTranslation(0, q.yg + 0.2 + k * 0.17, q.z + 0.02 + k * 0.03), shellW, 0);
    }
    for (const t of [0.3, 0.5, 0.7]) { const q = prof(t); mb.addGeo(new THREE.BoxGeometry(q.w * 2.2, 0.06, 0.28), new THREE.Matrix4().makeTranslation(0, q.yg - 0.12, q.z), C('#6a4423'), 0); }
    // two curved booms (iako) out to the float (ama), lashed with cordage
    const amaX = 3.1, amaY = 0.28;
    const ama = lumpy(new THREE.SphereGeometry(1, 14, 8), 0.03, 4);
    mb.addGeo(ama, new THREE.Matrix4().compose(V(amaX, amaY + 0.02, 0), new THREE.Quaternion(), V(0.2, 0.17, 2.7)), (v) => shade(C('#a87438'), 0.85 + 0.2 * clamp((v.y - amaY) / 0.2 * 0.5 + 0.5, 0, 1)), 0);
    mb.addGeo(new THREE.ConeGeometry(0.05, 0.4, 6), new THREE.Matrix4().compose(V(amaX, amaY + 0.1, 2.78), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.4, 0, 0)), V(1, 1, 1)), C('#a87438'), 0);
    for (const bz of [-1.55, 1.45]) {
      const q = prof(0.5 + bz / L), y0 = q.yg + 0.05;
      const boom = [V(0.1, y0, bz), V(amaX * 0.35, y0 + 0.2, bz), V(amaX * 0.7, y0 + 0.12, bz), V(amaX, amaY + 0.34, bz)];
      tube(mb, boom, [0.065, 0.06, 0.055, 0.05], 6, () => woodB, () => 0);
      tube(mb, [V(amaX, amaY + 0.3, bz), V(amaX, amaY + 0.1, bz * 0.95)], [0.04, 0.035], 5, () => woodB, () => 0);
      for (const [lx, ly] of [[0.18, y0 + 0.01], [amaX - 0.15, amaY + 0.32], [-0.18, y0 - 0.03]]) {
        for (let k = 0; k < 4; k++) mb.addGeo(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 7), new THREE.Matrix4().compose(V(lx + (lx < 0 ? 0 : (lx > 1 ? -1 : 1)) * k * 0.0, ly, bz - 0.09 + k * 0.06), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), V(1, 1, 1)), cord, 0);
      }
    }
    // furled woven crab-claw sail on a spar (the paddles are separate meshes so he can pick one up)
    mb.addGeo(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 8), new THREE.Matrix4().compose(V(0.44, 0.84, -0.3), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0.02)), V(1, 1, 1)), C('#c9a35a'), 0);
    mb.addGeo(new THREE.CylinderGeometry(0.03, 0.03, 3.9, 6), new THREE.Matrix4().compose(V(0.44, 0.86, -0.3), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(1, 1, 1)), C('#6a4a28'), 0);
    for (let k = 0; k < 4; k++) mb.addGeo(new THREE.CylinderGeometry(0.108, 0.108, 0.05, 8), new THREE.Matrix4().compose(V(0.44, 0.84, -1.5 + k * 0.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(1, 1, 1)), cord, 0);

    const canoe = new THREE.Mesh(mb.build(), woodMat);
    canoe.castShadow = true; canoe.receiveShadow = true;
    // find the waterline below the camp and lie parallel to the shore with the float seaward
    let cx = kp.x, cz = kp.z;
    const gx = getHeight(cx + 2, cz) - getHeight(cx - 2, cz), gz = getHeight(cx, cz + 2) - getHeight(cx, cz - 2), gl = Math.hypot(gx, gz) || 1;
    const dx = -gx / gl, dz = -gz / gl;
    for (let r = 0; r < 40; r += 0.5) { const px = kp.x + dx * r, pz = kp.z + dz * r; if (getHeight(px, pz) < 0.35) { cx = px; cz = pz; break; } }
    let yaw = Math.atan2(-dz, dx);
    if (Math.cos(yaw) * dx - Math.sin(yaw) * dz < 0) yaw += Math.PI;
    canoe.position.set(cx, Math.max(getHeight(cx, cz) - 0.18, -0.32), cz);
    canoe.rotation.y = yaw;
    scene.add(canoe); tagObject(canoe, 'canoe');
    const stowed = [];
    for (const k of [-1, 1]) {
      const pd = makePaddle(); pd.rotation.set(Math.PI / 2 - 0.04, 0.05 * k, 0); pd.position.set(0.14 * k, 0.6, 0.2 * k); canoe.add(pd); stowed.push(pd);
    }
    const ax = Math.sin(yaw), az = Math.cos(yaw);
    const cols = [-2.4, -1.2, 0, 1.2, 2.4].map((o) => addCollider(cx + ax * o, cz + az * o, 0.85));
    falls.canoe = { x: cx, z: cz, yaw, sea: { x: dx, z: dz }, mesh: canoe, cols, stowed };
  }

  // campfire
  const cfx = kp.x + 4.5, cfz = kp.z - 3.2, cfy = getHeight(cfx, cfz);
  const logs = M('#4a3220');
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 6), logs);
    l.position.set(cfx, cfy + 0.14, cfz);
    l.rotation.set(Math.PI / 2 - 0.25, (i / 4) * TAU, 0);
    l.position.x += Math.cos((i / 4) * TAU) * 0.25; l.position.z += Math.sin((i / 4) * TAU) * 0.25;
    scene.add(l);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), M('#6b6a64'));
    r.position.set(cfx + Math.cos(a) * 0.95, cfy + 0.1, cfz + Math.sin(a) * 0.95);
    scene.add(r);
  }
  addCollider(cfx, cfz, 1.0);
  const fire = new THREE.PointLight(0xff8a2a, 18, 18, 2);
  fire.position.set(cfx, cfy + 0.9, cfz);
  scene.add(fire);
  let ca = 0;
  updaters.push((dt, tm) => {
    ca += dt * 28;
    while (ca > 1) { ca--; fx.flame(cfx, cfy + 0.25, cfz, 1.7); if (rnd() < 0.3) fx.mist.emit({ x: cfx, y: cfy + 1.1, z: cfz, vx: rr(-0.1, 0.5), vy: rr(1, 2), life: 3, s0: 0.6, s1: 3, c0: [0.5, 0.5, 0.5, 0.2], c1: [0.6, 0.6, 0.6, 0], rise: 0.3, drag: 0.4 }); }
    fire.intensity = 14 + 5 * Math.sin(tm * 9) * Math.sin(tm * 5.3);
  });

  // ---- the castaway's camp: lean-to shelter, sleeping mat, drying rack, rods
  {
    let best = null;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU, hx = cfx + Math.cos(a) * 5.2, hz = cfz + Math.sin(a) * 5.2, hh = getHeight(hx, hz);
      if (hh < 1.1 || hh > 3.4 || getSlope(hx, hz) > 0.18) continue;
      const score = hh - Math.abs(getHeight(hx + Math.cos(a) * 4, hz + Math.sin(a) * 4) - hh);
      if (!best || score > best.score) best = { x: hx, z: hz, y: hh, score };
    }
    best = best || { x: cfx - 5, z: cfz, y: getHeight(cfx - 5, cfz) };
    const yaw = Math.atan2(cfx - best.x, cfz - best.z);   // front of the shelter faces the fire
    const mb2 = new MB();
    const wood = [C('#6b4a2c'), C('#5d3f25'), C('#7a5833')];
    const leafA = [C('#4f8f35'), C('#3f7a2b'), C('#5fa03c'), C('#46822f')];
    const pole = (x0, y0, z0, x1, y1, z1, r = 0.06) => {
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const g = new THREE.CylinderGeometry(r, r * 1.1, len, 6);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
      mb2.addGeo(g, new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), q, new THREE.Vector3(1, 1, 1)), shade(pick(wood), rr(0.9, 1.1)));
    };
    for (const sx of [-1.35, 1.35]) { pole(sx, 0, 1.0, sx, 1.95, 1.0); pole(sx, 0, -1.0, sx, 1.0, -1.0); pole(sx, 1.95, 1.0, sx, 1.0, -1.0, 0.05); }
    pole(-1.35, 1.95, 1.0, 1.35, 1.95, 1.0, 0.05); pole(-1.35, 1.0, -1.0, 1.35, 1.0, -1.0, 0.05);
    const slab = C('#2f5a22');
    mb2.quad(V(-1.75, 2.0, 1.25), V(1.75, 2.0, 1.25), V(1.75, 1.0, -1.2), V(-1.75, 1.0, -1.2), slab);
    mb2.quad(V(-1.75, 0, -1.1), V(1.75, 0, -1.1), V(1.75, 1.05, -1.1), V(-1.75, 1.05, -1.1), C('#3a6a2a'));
    for (let r = 0; r < 11; r++) {            // thatched roof rows (front -> back, overlapping)
      const t = r / 10, z = lerp(1.2, -1.15, t), y = lerp(2.02, 1.07, t);
      for (let x = -1.75; x < 1.75; x += 0.26) {
        const c = shade(pick(leafA), rr(0.85, 1.12));
        const a0 = V(x, y + 0.02, z), a1 = V(x + 0.34, y + 0.02, z), a2 = V(x + 0.17 + rr(-0.05, 0.05), y - 0.2, z - 0.62);
        mb2.tri(a0, a1, a2, c, shade(c, 1.15), shade(c, 0.85), 0, 0, 0.5);
        mb2.tri(a1, a0, a2, c, c, c, 0, 0, 0.5);
      }
    }
    for (let r = 0; r < 4; r++) for (let x = -1.55; x < 1.55; x += 0.34) {   // back wall
      const c = shade(pick(leafA), rr(0.8, 1.05)), y = 0.1 + r * 0.26;
      mb2.tri(V(x, y + 0.3, -1.08), V(x + 0.36, y + 0.3, -1.08), V(x + 0.18, y - 0.08, -1.08), c, c, c);
      mb2.tri(V(x + 0.36, y + 0.3, -1.08), V(x, y + 0.3, -1.08), V(x + 0.18, y - 0.08, -1.08), c, c, c);
    }
    // woven sleeping mat + pillow
    for (let i = 0; i < 9; i++) mb2.addGeo(new THREE.BoxGeometry(2.1, 0.05, 0.1), new THREE.Matrix4().makeTranslation(0, 0.035, -0.55 + i * 0.1 + 0.2), i % 2 ? C('#c9a35a') : C('#b08a44'));
    mb2.addGeo(new THREE.SphereGeometry(0.2, 10, 8), new THREE.Matrix4().compose(new THREE.Vector3(-0.85, 0.12, -0.05), new THREE.Quaternion(), new THREE.Vector3(1, 0.55, 0.9)), C('#d8c08a'));
    // drying rack with fish, rod stand, basket
    for (const sx of [1.9, 3.1]) pole(sx, 0, 0.7, sx, 1.4, 0.7, 0.04);
    pole(1.9, 1.38, 0.7, 3.1, 1.38, 0.7, 0.035);
    for (let i = 0; i < 4; i++) {
      const fx0 = 2.05 + i * 0.28;
      mb2.addGeo(new THREE.SphereGeometry(0.1, 8, 6), new THREE.Matrix4().compose(new THREE.Vector3(fx0, 1.08, 0.7), new THREE.Quaternion(), new THREE.Vector3(0.35, 1.5, 0.28)), i % 2 ? C('#a9b6bd') : C('#8fa0a8'));
      mb2.tri(V(fx0, 0.9, 0.7), V(fx0 - 0.07, 0.78, 0.7), V(fx0 + 0.07, 0.78, 0.7), C('#8fa0a8'), C('#8fa0a8'), C('#8fa0a8'));
    }
    pole(-2.1, 0, 0.5, -1.9, 1.9, 0.3, 0.025); pole(-2.25, 0, 0.55, -1.95, 1.85, 0.35, 0.025);
    mb2.addGeo(new THREE.CylinderGeometry(0.22, 0.17, 0.3, 10), new THREE.Matrix4().makeTranslation(-1.9, 0.15, 1.5), C('#9a7440'));
    for (const sx of [-1.35, 1.35]) for (const [ly, lz] of [[1.95, 1.0], [1.0, -1.0], [1.45, 1.0], [0.55, 1.0]]) for (let k = 0; k < 3; k++)
      mb2.addGeo(new THREE.CylinderGeometry(0.085, 0.085, 0.035, 7), new THREE.Matrix4().makeTranslation(sx, ly + k * 0.05, lz), C('#d2b27a'));   // lashing cordage
    for (let i = 0; i < 12; i++) {                                                                       // woven pandanus side wall
      const z0 = -1.0 + i * 0.18, c = i % 2 ? C('#c9a35a') : C('#b08a44');
      mb2.quad(V(-1.48, 0.0, z0), V(-1.48, 0.0, z0 + 0.18), V(-1.48, 1.0 + (z0 + 1) * 0.2, z0 + 0.18), V(-1.48, 1.0 + (z0 + 1) * 0.2, z0), c);
      for (let k = 1; k < 5; k++) mb2.quad(V(-1.485, k * 0.22, z0), V(-1.485, k * 0.22, z0 + 0.18), V(-1.485, k * 0.22 + 0.04, z0 + 0.18), V(-1.485, k * 0.22 + 0.04, z0), shade(c, 0.75));
    }
    const hut = new THREE.Mesh(mb2.build(), woodMat);
    hut.castShadow = true; hut.receiveShadow = true;
    hut.position.set(best.x, best.y, best.z); hut.rotation.y = yaw;
    scene.add(hut); tagObject(hut, 'hut');
    const rot = (lx, lz) => ({ x: best.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: best.z - lx * Math.sin(yaw) + lz * Math.cos(yaw) });
    addCollider(best.x, best.z, 0.1);
    for (const [lx, lz] of [[-1.35, 1.0], [1.35, 1.0], [-1.35, -1.0], [1.35, -1.0], [2.5, 0.7]]) { const q = rot(lx, lz); addCollider(q.x, q.z, 0.18); }
    const mat = rot(0, -0.1), front = rot(0, 2.0);
    falls.hut = { x: best.x, y: best.y, z: best.z, yaw, mat: { x: mat.x, z: mat.z, y: best.y + 0.06 }, front };
  }
  falls.camp = V(cfx, cfy, cfz);
}

/* ================================================================== pirate X */
export function buildPirate() {
  const sp = marchToShore(-30, 70, 0.0, 1, 1.5, 0.4, 120);
  const x = sp.x - 3, z = sp.z - 6, y = getHeight(x, z);
  const g = new THREE.Group();
  const plank = M('#3d2b1c');
  const p1 = new THREE.Mesh(box(3.0, 0.1, 0.4), plank), p2 = p1.clone();
  p1.rotation.y = 0.78; p2.rotation.y = -0.78;
  p1.position.y = p2.position.y = 0.05;
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 6), M('#dccb95'));
  mound.scale.set(1.2, 0.18, 1.2); mound.position.y = 0.0;
  g.add(mound, p1, p2);
  // half-buried chest
  const chest = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc83a, emissive: 0xff9a10, emissiveIntensity: 0.7, metalness: 0.9, roughness: 0.3 });
  const b1 = new THREE.Mesh(box(1.4, 0.7, 0.85), wood); b1.position.y = 0.2;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.4, 12, 1, false, 0, Math.PI), wood);
  lid.rotation.set(0, 0, Math.PI / 2); lid.position.y = 0.55;
  const bd = new THREE.Mesh(box(0.1, 0.8, 0.9), gold); bd.position.set(-0.45, 0.22, 0);
  const bd2 = bd.clone(); bd2.position.x = 0.45;
  chest.add(b1, lid, bd, bd2);
  chest.position.set(0.0, -0.1, 0.0);
  chest.rotation.set(0.1, 0.5, -0.2);
  g.add(chest);
  // skull on a stick
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 5), M('#5b3d24'));
  stick.position.set(1.8, 0.7, 0.8);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M('#e8e4d4'));
  skull.position.set(1.8, 1.5, 0.8);
  const jaw = new THREE.Mesh(box(0.2, 0.1, 0.2), M('#e8e4d4')); jaw.position.set(1.8, 1.3, 0.88);
  g.add(stick, skull, jaw);
  // shovel
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 5), M('#7a5a3a')); sh.position.set(-1.7, 0.7, -0.6); sh.rotation.z = 0.3;
  const blade = new THREE.Mesh(box(0.36, 0.5, 0.05), M('#6b6f73')); blade.position.set(-1.35, 0.12, -0.6); blade.rotation.z = 0.3;
  g.add(sh, blade);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.set(x, y, z);
  scene.add(g); tagObject(g, 'shrine');
  let sa = 0;
  updaters.push((dt) => {
    sa += dt * 1.6;
    while (sa > 1) { sa--; fx.sparkle.emit({ x: x + rr(-.5, .5), y: y + rr(0.1, 0.6), z: z + rr(-.5, .5), vy: 0.25, life: rr(0.8, 1.6), s0: 0.45, s1: 0.1, c0: [1, 0.85, 0.35, 0.9], c1: [1, 0.7, 0.2, 0], drag: 0.5 }); }
  });
  addSecret({
    id: 'pirate', name: 'X Marks the Spot', hint: 'Two planks cross on a quiet stretch of beach.',
    desc: 'A half-buried pirate chest, a shovel, and a skull on a stick keeping watch.', pos: V(x, y + 1, z), r: 10,
  });
  falls.pirate = V(x, y, z);
}

/* ================================================================== fairy ring */
export function buildFairy() {
  const { x: X, z: Z, y: Y } = FAIRY;
  const caps = [];
  const mats = [0x4ff0e0, 0xff62d8, 0x9a7bff, 0x7dff6a].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2, roughness: 0.5, flatShading: true }));
  const stem = M('#e8e2cf');
  const addMush = (x, z, s, mi) => {
    const gy = getHeight(x, z);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.14 * s, 0.8 * s, 6), stem);
    st.position.set(x, gy + 0.4 * s, z);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5 * s, 10, 6, 0, TAU, 0, Math.PI * 0.55), mats[mi]);
    cap.position.set(x, gy + 0.78 * s, z);
    cap.scale.y = 0.75;
    scene.add(st, cap);
    caps.push({ x, y: gy + 0.9 * s, z });
  };
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + rr(-0.1, 0.1), r = 5.2 + rr(-0.6, 0.7);
    addMush(X + Math.cos(a) * r, Z + Math.sin(a) * r, rr(0.7, 1.5), i % 4);
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, r = rr(0, 3.2);
    addMush(X + Math.cos(a) * r, Z + Math.sin(a) * r, rr(0.5, 0.9), Math.floor(rnd() * 4));
  }
  addMush(X, Z, 2.6, 0);
  // standing stones
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU, r = 8.4;
    const px = X + Math.cos(a) * r, pz = Z + Math.sin(a) * r, gy = getHeight(px, pz), h = rr(1.4, 2.4);
    const m = new THREE.Mesh(jitterGeo(box(0.8, h, 0.55, 1), 0.12), M('#6f7a68'));
    m.position.set(px, gy + h * 0.5 - 0.1, pz); m.rotation.set(rr(-.1, .1), rnd() * 3, rr(-.1, .1));
    m.castShadow = true;
    scene.add(m); tagObject(m, 'fairyring');
    addCollider(px, pz, 0.6);
  }
  const l1 = new THREE.PointLight(0x58f0e8, 45, 20, 2);
  l1.position.set(X, Y + 2.2, Z);
  const l2 = new THREE.PointLight(0xff62d8, 30, 16, 2);
  l2.position.set(X + 2.5, Y + 1.4, Z - 2);
  scene.add(l1, l2);
  updaters.push((dt, tm) => {
    mats.forEach((m, i) => { m.emissiveIntensity = 1.7 + 0.8 * Math.sin(tm * 1.4 + i * 1.7); });
    l1.intensity = 38 + 12 * Math.sin(tm * 1.3); l2.intensity = 26 + 8 * Math.sin(tm * 1.9 + 2);
    if (rnd() < dt * 8) { const c = pick(caps); fx.sparkle.emit({ x: c.x, y: c.y, z: c.z, vy: rr(0.3, 0.9), vx: rr(-0.2, 0.2), vz: rr(-0.2, 0.2), life: rr(1.5, 3), s0: 0.5, s1: 0.1, c0: [0.6, 1, 0.95, 0.8], c1: [1, 0.6, 1, 0], drag: 0.3 }); }
  });
  addSecret({
    id: 'fairy', name: 'The Glimmer Ring', hint: 'At night, a circle of light flickers in the lowland jungle.',
    desc: 'A ring of bioluminescent mushrooms inside seven old stones.', pos: V(X, Y + 1, Z), r: 12,
  });
}

/* ================================================================== hot spring */
export function buildSpring() {
  const { x: X, z: Z, y: Y } = SPRING;
  const mb = new MB();
  const cols = [C('#a8a08a'), C('#c9c2a0'), C('#8c8776')];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + rr(-0.12, 0.12), r = SPRING.r + 1.3 + rr(-0.3, 0.6), R = rr(0.8, 1.6);
    const gy = getHeight(X + Math.cos(a) * r, Z + Math.sin(a) * r);
    addCollider(X + Math.cos(a) * r, Z + Math.sin(a) * r, R * 0.85);
    const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.35, i);
    const base = pick(cols);
    mb.addGeo(g, mat4(X + Math.cos(a) * r, gy + R * 0.25, Z + Math.sin(a) * r, R, R * 0.7, R), (v) => shade(base, 0.85 + 0.25 * rnd()).lerp(C('#e9dca0'), smoothstep(0.4, 1.0, v.y - gy) * 0.4));
  }
  tagObject(addMesh(mb.build(), stoneMat), 'spring');
  let sa = 0, ba = 0;
  updaters.push((dt, tm) => {
    sa += dt * 4.5; ba += dt * 3;
    while (sa > 1) {
      sa--;
      const a = rnd() * TAU, r = rr(0, SPRING.r * 0.9);
      fx.mist.emit({ x: X + Math.cos(a) * r, y: Y, z: Z + Math.sin(a) * r, vx: rr(0.1, 0.6), vy: rr(0.8, 1.6), vz: rr(-0.2, 0.2), life: rr(3.5, 6), s0: 2.0, s1: rr(6, 10), c0: [0.8, 0.85, 0.88, 0.1], c1: [0.8, 0.85, 0.88, 0], drag: 0.3 });
    }
    while (ba > 1) { ba--; const a = rnd() * TAU, r = rr(0, SPRING.r * 0.7); fx.drops.emit({ x: X + Math.cos(a) * r, y: Y - 0.05, z: Z + Math.sin(a) * r, vy: rr(0.8, 1.4), life: 0.6, s0: 0.3, s1: 0.1, c0: [1, 1, 1, 0.8], c1: [1, 1, 1, 0], grav: 5 }); }
  });
  addSecret({
    id: 'spring', name: 'The Warm Spring', hint: 'Steam curls from the ground near the volcano’s skirts.',
    desc: 'A mineral hot spring heated by the mountain, ringed with pale rock.', pos: V(X, Y + 1, Z), r: 13,
  });
}

/* ================================================================== west cascade */
export function buildCascade() {
  const C = river.C, W = C.W;
  const steep = [];
  for (let i = 3; i < W.length - 3; i++) if (W[i - 3] - W[i + 3] > 2.2) steep.push(i);
  const end = C.pts[C.pts.length - 1];
  falls.cascade = steep.length ? { x: C.pts[steep[Math.floor(steep.length / 2)]].x, z: C.pts[steep[Math.floor(steep.length / 2)]].z, y: W[steep[Math.floor(steep.length / 2)]], end: { x: end.x, z: end.z } } : { x: end.x, z: end.z, y: 5, end };
  let a = 0, b = 0;
  updaters.push((dt) => {
    a += dt * (steep.length ? 14 : 0); b += dt * 9;
    while (a > 1) {
      a--;
      const i = steep[Math.floor(rnd() * steep.length)], p = C.pts[i];
      fx.mist.emit({ x: p.x + rr(-1.5, 1.5), y: W[i] + 0.4, z: p.z + rr(-1.5, 1.5), vx: rr(-0.5, 0.5), vy: rr(0.6, 1.6), vz: rr(-0.5, 0.5), life: rr(1.8, 3), s0: 1.6, s1: rr(5, 9), c0: [1, 1, 1, 0.2], c1: [1, 1, 1, 0], drag: 0.5 });
    }
    while (b > 1) {
      b--;
      fx.mist.emit({ x: end.x + rr(-3, 3), y: 0.5, z: end.z + rr(-3, 3), vx: rr(-1, 0.4), vy: rr(0.8, 1.8), vz: rr(-0.5, 0.5), life: rr(2.5, 4), s0: 2.5, s1: rr(8, 13), c0: [1, 1, 1, 0.26], c1: [1, 1, 1, 0], drag: 0.4 });
      fx.drops.emit({ x: end.x + rr(-2, 2), y: 0.4, z: end.z + rr(-2, 2), vx: rr(-2, 1), vy: rr(2, 5), vz: rr(-1, 1), life: rr(0.6, 1.1), s0: 0.4, s1: 0.12, c0: [1, 1, 1, 0.8], c1: [1, 1, 1, 0], grav: 12 });
    }
  });
}

/* ================================================================== rocks where waters meet */
export function buildJunctions() {
  const mb = new MB();
  const greys = [C('#7a766e'), C('#6d6a63'), C('#857f74'), C('#5f5c57')];
  const mossC = C('#4a7a35');
  const rock = (x, z, R, inStream) => {
    const h = getHeight(x, z);
    const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.4, rnd() * 20);
    const base = pick(greys);
    const cy = inStream ? h + R * 0.55 : h + R * 0.2;
    mb.addGeo(g, mat4(x, cy, z, R, R * (inStream ? 0.85 : 0.7), R * rr(0.85, 1.15), 0, rnd() * 6, 0), (v) => {
      const top = clamp((v.y - cy) / R * 0.6 + 0.5, 0, 1);
      return shade(base, 0.78 + 0.3 * top).lerp(mossC, smoothstep(0.7, 1, top) * (inStream ? 0.15 : 0.45));
    });
    if (!inStream) addCollider(x, z, R * 0.8);
  };
  const ring = (pt, w, n, rmin = 1, rmax = 4.5) => {
    for (let k = 0, placed = 0; k < n * 14 && placed < n; k++) {
      const a = rnd() * TAU, r = w * 0.6 + rr(rmin, rmax), x = pt.x + Math.cos(a) * r, z = pt.z + Math.sin(a) * r;
      if (riverDist(x, z) < w * 0.6 + 0.5 || getHeight(x, z) < 0.2) continue;
      rock(x, z, rr(0.45, 1.25), false); placed++;
    }
  };
  const stream = (pt, w, n) => {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = rr(0, w * 0.4), x = pt.x + Math.cos(a) * r, z = pt.z + Math.sin(a) * r;
      rock(x, z, rr(0.55, 0.95), true);
    }
  };
  const B = river.B, A = river.A, Cc = river.C;
  ring(B.pts[1], B.w[1], 9); stream(B.pts[4], B.w[4], 3);                       // pool spillway
  const mB = Math.max(2, B.pts.length - 14);
  ring(B.pts[mB], B.w[mB], 10, 1.5, 6); stream(B.pts[mB + 4], B.w[mB + 4], 4);   // river mouth
  ring(A.pts[2], A.w[2], 8); ring(Cc.pts[2], Cc.w[2], 8);                       // lake outlets
  const eC = Math.max(2, Cc.pts.length - 8);
  ring(Cc.pts[eC], Cc.w[eC], 9, 1.5, 6); stream(Cc.pts[eC + 2], Cc.w[eC + 2], 4);// cascade foot
  const m = new THREE.Mesh(mb.build(), stoneMat);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
}
