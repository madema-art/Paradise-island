// Things to find on the island: sticks, stones, plant fibre, driftwood logs, clams, fallen coconuts and washed-up crates.
// Each kind is one instanced mesh; picking something up hides it, and most things grow back after a while (game hours).
import * as THREE from 'three';
import { scene, env } from '../core.js';
import { getHeight, getSlope, lavaDist, riverDist, VOL, COVE, falls } from '../world.js';
import { poolLevel } from '../walk.js';
import { fx } from '../props.js';
import { mulberry32, TAU, clamp } from '../util.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const tuft = () => {                           // a bright clump of long green-gold stems
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.ConeGeometry(0.035, 0.7 + (i % 3) * 0.15, 4);
    g.translate(0, 0.35 + (i % 3) * 0.07, 0);
    g.rotateZ(((i % 3) - 1) * 0.35); g.rotateY(i * 0.9);
    parts.push(g);
  }
  return mergeGeometries(parts);
};
const sticks = () => {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.CylinderGeometry(0.018, 0.026, 0.95 - i * 0.12, 5);
    g.rotateZ(Math.PI / 2); g.rotateY(i * 0.7 + 0.2); g.translate(0, 0.03 + i * 0.035, 0);
    parts.push(g);
  }
  return mergeGeometries(parts);
};
const stoneGeo = () => { const g = new THREE.IcosahedronGeometry(0.2, 0); g.scale(1.25, 0.72, 1); g.translate(0, 0.1, 0); return g; };
const logGeo = () => { const g = new THREE.CylinderGeometry(0.17, 0.2, 2.1, 7); g.rotateZ(Math.PI / 2); g.translate(0, 0.19, 0); return g; };
const clamGeo = () => { const g = new THREE.SphereGeometry(0.17, 8, 5, 0, TAU, 0, Math.PI / 2); g.scale(1.1, 0.55, 1); g.translate(0, 0.0, 0); return g; };
const nutGeo = () => { const g = new THREE.IcosahedronGeometry(0.2, 1); g.scale(1, 0.95, 1); g.translate(0, 0.2, 0); return g; };

/** kinds: where they lie and how fast they regrow (game hours). */
export const KINDS = {
  stick: { count: 190, regrow: 16, color: [0x8a6a42, 0x6e5233, 0x9a7a52], geo: sticks, rough: 0.95 },
  stone: { count: 130, regrow: 40, color: [0x8c9094, 0x74777b, 0x9a9da0], geo: stoneGeo, rough: 0.9 },
  fiber: { count: 110, regrow: 14, color: [0xa9d44c, 0x8fc13f, 0xc6dc58], geo: tuft, rough: 0.8, glow: 0x223300 },
  log: { count: 30, regrow: 36, color: [0xb4a58a, 0x9d8f76, 0xc0b296], geo: logGeo, rough: 0.95 },
  clam: { count: 52, regrow: 22, color: [0xe8d6c0, 0xf2c8b6, 0xdcc8e0], geo: clamGeo, rough: 0.55 },
  coconut: { count: 70, regrow: 1e9, color: [0x5a3a1e, 0x6b4526, 0x4c3018], geo: nutGeo, rough: 0.8, dynamic: true },
};

/** where each kind may lie */
function suitable(kind, x, z, h, slope) {
  if (lavaDist(x, z) < 8 || Math.hypot(x - VOL.x, z - VOL.z) < 42) return false;
  const rd = riverDist(x, z);
  switch (kind) {
    case 'stick': return h > 1.0 && h < 30 && slope < 0.5 && rd > 1.5;
    case 'stone': return h > 0.7 && h < 45 && slope < 0.6 && (rd < 10 || slope > 0.18 || h < 2.2);
    case 'fiber': return h > 2.2 && h < 20 && slope < 0.4 && rd > 1.2;
    case 'log': return h > 0.5 && h < 1.5 && slope < 0.3;
    case 'clam': return h < -0.25 && h > -1.0 && slope < 0.25;
    default: return false;
  }
}

export class Resources {
  constructor() {
    this.root = new THREE.Group(); this.root.visible = false; scene.add(this.root);
    this.nodes = [];                 // every node of every kind
    this.byKind = {};
    this.meshes = {};
    this.dummy = new THREE.Object3D();
    this.crates = [];
    this.sparkT = 0;
    this.pool = [];                  // fallen coconuts get recycled
  }

  build(spawn) {
    const rnd = mulberry32(48151);
    const sc = new THREE.Color();
    for (const [kind, K] of Object.entries(KINDS)) {
      const geo = K.geo();
      const mat = new THREE.MeshStandardMaterial({ roughness: K.rough, metalness: 0, flatShading: true, emissive: K.glow || 0x000000 });
      const im = new THREE.InstancedMesh(geo, mat, K.count);
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      this.meshes[kind] = im; this.root.add(im);
      this.byKind[kind] = [];
      const list = this.byKind[kind];
      const place = (x, z, h) => {
        const n = { kind, x, z, y: h, rot: rnd() * TAU, sc: 0.85 + rnd() * 0.5, alive: true, back: 0, i: list.length, tint: K.color[Math.floor(rnd() * K.color.length)] };
        if (kind === 'clam') n.y = Math.max(h, env.tide - 0.08);
        list.push(n); this.nodes.push(n);
        return n;
      };
      if (!K.dynamic) {
        // a handful near the landing beach so the first minutes are easy; the rest scattered over the island
        const guaranteed = { stick: 6, stone: 4, fiber: 4, log: 2, clam: 3 }[kind] || 0;
        for (let k = 0, t = 0; k < guaranteed && t < 400; t++) {
          const a = rnd() * TAU, r = 5 + rnd() * 13, x = spawn.x + Math.cos(a) * r, z = spawn.z + Math.sin(a) * r;
          const h = getHeight(x, z);
          if (suitable(kind, x, z, h, getSlope(x, z))) { place(x, z, h); k++; }
        }
        for (let t = 0; list.length < K.count && t < 60000; t++) {
          const a = rnd() * TAU, r = Math.sqrt(rnd()) * 215, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9 + 5;
          const h = getHeight(x, z), s = getSlope(x, z);
          if (suitable(kind, x, z, h, s)) place(x, z, h);
        }
      } else {
        for (let i = 0; i < K.count; i++) { const n = place(0, 0, -50); n.alive = false; n.free = true; }
      }
      im.count = list.length;
      list.forEach((n) => { this.write(n); im.setColorAt(n.i, sc.set(n.tint)); });
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    // coconuts already lying under some palms at the start
    this.buildCrateMesh();
  }

  write(n) {
    const im = this.meshes[n.kind], d = this.dummy;
    d.position.set(n.x, n.y, n.z); d.rotation.set(0, n.rot, 0);
    const s = n.alive ? n.sc * (n.pop ? Math.min(1, n.pop) : 1) : 0.0001;
    d.scale.setScalar(s); d.updateMatrix();
    im.setMatrixAt(n.i, d.matrix); im.instanceMatrix.needsUpdate = true;
  }

  setVisible(v) { this.root.visible = v; }

  /** nodes of the given kinds within r of (x,z) (alive only) */
  near(x, z, r, out = []) {
    out.length = 0;
    const r2 = r * r;
    for (const n of this.nodes) {
      if (!n.alive) continue;
      const dx = n.x - x, dz = n.z - z;
      if (dx * dx + dz * dz < r2) out.push(n);
    }
    return out;
  }

  take(n, hours) {
    n.alive = false; n.back = hours + KINDS[n.kind].regrow * (0.85 + Math.random() * 0.3);
    this.write(n);
    // little puff where it was
    for (let i = 0; i < 5; i++) fx.sparkle.emit({ x: n.x + (Math.random() - 0.5) * 0.4, y: n.y + 0.3, z: n.z + (Math.random() - 0.5) * 0.4, vy: 0.6 + Math.random() * 0.6, life: 0.7, s0: 0.25, s1: 0.05, c0: [1, 0.95, 0.6, 0.9], c1: [1, 0.8, 0.3, 0], drag: 1 });
  }

  /** a coconut shaken from a palm: it falls from the crown to the ground */
  dropCoconut(x, z, fromY, hours) {
    const n = this.byKind.coconut.find((q) => q.free);
    if (!n) return;
    const a = Math.random() * TAU, r = 0.9 + Math.random() * 1.6;
    n.x = x + Math.cos(a) * r; n.z = z + Math.sin(a) * r; n.free = false; n.alive = true; n.sc = 1.2;
    n.ground = getHeight(n.x, n.z);
    if (n.ground < 0.5) { n.free = true; n.alive = false; this.write(n); return; }
    n.y = fromY; n.vy = 0; n.fall = true; n.back = hours + 40;   // despawns after a while
    this.write(n);
  }

  update(dt, hours, playerPos) {
    // regrowth (and old coconuts rotting away)
    for (const n of this.nodes) {
      if (n.fall) {
        n.vy -= 20 * dt; n.y += n.vy * dt;
        if (n.y <= n.ground) {
          n.y = n.ground; n.fall = false;
          if (Math.abs(n.vy) > 4) { n.vy = -n.vy * 0.3; n.fall = true; n.ground = n.ground; } else n.vy = 0;
        }
        this.write(n);
      } else if (!n.alive && n.back && hours >= n.back && !n.free) {
        n.alive = true; n.pop = 0; n.back = 0;
        if (KINDS[n.kind].dynamic) { n.alive = false; n.free = true; this.write(n); }
        else if (n.kind === 'clam') n.y = Math.max(getHeight(n.x, n.z), env.tide - 0.08);
      } else if (n.alive && KINDS[n.kind].dynamic && n.back && hours > n.back) { n.alive = false; n.free = true; this.write(n); }
      if (n.pop !== undefined && n.pop < 1) { n.pop += dt * 2.2; if (n.pop >= 1) n.pop = undefined; this.write(n); }
    }
    // glints on pickups near the player: it shows where the good stuff is
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.22;
      let c = 0;
      for (const n of this.nodes) {
        if (!n.alive) continue;
        const dx = n.x - playerPos.x, dz = n.z - playerPos.z, d2 = dx * dx + dz * dz;
        if (d2 > 18 * 18 || Math.random() > 0.035 * (n.kind === 'clam' ? 1.2 : 1)) continue;
        const hot = n.kind === 'log' ? [0.8, 0.9, 1, 0.8] : [1, 0.95, 0.65, 0.9];
        fx.sparkle.emit({ x: n.x, y: n.y + 0.45, z: n.z, vy: 0.4, life: 1.1, s0: 0.28, s1: 0.04, c0: hot, c1: [1, 0.9, 0.5, 0], drag: 0.5 });
        if (++c > 6) break;
      }
    }
    // crates glow with a beam you can see from afar
    for (const c of this.crates) { if (c.mesh.visible) { c.beam.material.opacity = 0.18 + 0.1 * Math.sin(performance.now() * 0.004 + c.x); c.mesh.rotation.y += dt * 0.2; } }
  }

  /* ------------------------------------------------------------ washed-up crates */
  buildCrateMesh() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6335, roughness: 0.9, flatShading: true });
    const strap = new THREE.MeshStandardMaterial({ color: 0x3d2a18, roughness: 0.9 });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
    this.crateParts = { wood, strap, beamMat };
  }
  addCrate(x, z, loot) {
    const { wood, strap, beamMat } = this.crateParts;
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.64), wood); box.position.y = 0.33; box.castShadow = true; g.add(box);
    for (const sx of [-0.28, 0.28]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.66, 0.68), strap); s.position.set(sx, 0.33, 0); g.add(s); }
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.07, 0.7), wood); lid.position.y = 0.66; g.add(lid);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 22, 10, 1, true), beamMat.clone()); beam.position.y = 11; g.add(beam);
    const root = new THREE.Group(); root.add(g);
    const y = Math.max(getHeight(x, z), env.tide);
    root.position.set(x, y, z); root.rotation.y = Math.random() * TAU;
    this.root.add(root);
    const c = { x, z, y, mesh: root, beam, loot, open: false };
    this.crates.push(c);
    return c;
  }
  removeCrate(c) { this.root.remove(c.mesh); this.crates = this.crates.filter((q) => q !== c); }

  /** serialise what has been picked up so a save can put the island back as it was */
  snapshot(hours) {
    const dead = {};
    for (const [k, list] of Object.entries(this.byKind)) {
      if (KINDS[k].dynamic) continue;
      const d = [];
      list.forEach((n, i) => { if (!n.alive) d.push([i, +(n.back - hours).toFixed(1)]); });
      dead[k] = d;
    }
    return { dead, crates: this.crates.map((c) => ({ x: c.x, z: c.z, loot: c.loot })) };
  }
  restore(snap, hours) {
    if (!snap) return;
    for (const [k, d] of Object.entries(snap.dead || {})) {
      const list = this.byKind[k]; if (!list) continue;
      for (const [i, left] of d) { const n = list[i]; if (n) { n.alive = false; n.back = hours + Math.max(0.5, left); this.write(n); } }
    }
    for (const c of this.crates.slice()) this.removeCrate(c);
    for (const c of snap.crates || []) this.addCrate(c.x, c.z, c.loot);
  }
  resetAll() {
    for (const n of this.nodes) {
      if (KINDS[n.kind].dynamic) { n.alive = false; n.free = true; n.fall = false; } else { n.alive = true; n.back = 0; n.pop = undefined; }
      this.write(n);
    }
    for (const c of this.crates.slice()) this.removeCrate(c);
  }
}
