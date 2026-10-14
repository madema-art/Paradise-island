// Things the player builds: campfire, lean-to shelter, drying rack and the escape raft. Each is a small hand-built mesh;
// placement uses a see-through ghost that turns red where you can't build.
import * as THREE from 'three';
import { scene, env, events } from '../core.js';
import { getHeight, getSlope, lavaDist, riverDist, addCollider, VOL } from '../world.js';
import { poolLevel } from '../walk.js';
import { fx } from '../props.js';
import { clamp, TAU } from '../util.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...o });
const WOOD = M('#8a6840'), WOOD2 = M('#6b4f30'), DRIFT = M('#b3a285'), FROND = M('#3f9a3c', { side: THREE.DoubleSide }), FROND2 = M('#5db04a', { side: THREE.DoubleSide });
const STONE = M('#8a8d90'), ROPE = M('#d8c48e'), ASH = M('#3a3633'), CLOTH = M('#e6d9b8', { side: THREE.DoubleSide });

const cyl = (r0, r1, len, mat, n = 6) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, n), mat); m.castShadow = true; return m; };
const box = (x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat); m.castShadow = true; m.receiveShadow = true; return m; };
const pole = (a, b, r, mat) => {          // a cylinder between two points
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = cyl(r, r * 1.1, len, mat, 6);
  m.position.copy(a).addScalar(0).add(d.clone().multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
};

export const BUILD = {
  campfire: { name: 'Campfire', radius: 1.1, maxFuel: 6 },
  shelter: { name: 'Lean-to shelter', radius: 2.0 },
  rack: { name: 'Drying rack', radius: 1.2, slots: 3 },
  raft: { name: 'Escape raft', radius: 2.4, shore: true },
};

export function buildMesh(type) {
  const g = new THREE.Group();
  if (type === 'campfire') {
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), STONE); s.position.set(Math.cos(a) * 0.55, 0.09, Math.sin(a) * 0.55); s.scale.set(1.1, 0.75, 1); s.rotation.y = i; s.castShadow = true; g.add(s); }
    const ash = cyl(0.5, 0.52, 0.03, ASH, 14); ash.position.y = 0.02; g.add(ash);
    for (let i = 0; i < 4; i++) { const l = cyl(0.06, 0.07, 0.95, WOOD2, 6); l.rotation.set(Math.PI / 2 - 0.35, 0, 0); l.rotation.order = 'YXZ'; l.rotation.y = (i / 4) * TAU; l.position.y = 0.16; g.add(l); }
    const embers = new THREE.Mesh(new THREE.CircleGeometry(0.34, 12), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0 }));
    embers.rotation.x = -Math.PI / 2; embers.position.y = 0.05; g.add(embers); g.userData.embers = embers;
  } else if (type === 'shelter') {
    // a lean-to: a high open front facing +z, a low back, thatched with palm fronds
    const W = 2.7, front = 1.95, back = 0.75, D = 2.3;
    for (const sx of [-1, 1]) {
      g.add(pole(new THREE.Vector3(sx * W / 2, 0, D / 2), new THREE.Vector3(sx * W / 2, front, D / 2), 0.07, WOOD));
      g.add(pole(new THREE.Vector3(sx * W / 2, 0, -D / 2), new THREE.Vector3(sx * W / 2, back, -D / 2), 0.07, WOOD2));
      g.add(pole(new THREE.Vector3(sx * W / 2, front, D / 2), new THREE.Vector3(sx * W / 2, back, -D / 2), 0.05, WOOD));
    }
    g.add(pole(new THREE.Vector3(-W / 2 - 0.1, front, D / 2), new THREE.Vector3(W / 2 + 0.1, front, D / 2), 0.06, WOOD2));
    g.add(pole(new THREE.Vector3(-W / 2 - 0.1, back, -D / 2), new THREE.Vector3(W / 2 + 0.1, back, -D / 2), 0.06, WOOD2));
    const slope = Math.atan2(front - back, D), len = Math.hypot(D, front - back) + 0.35;
    for (let i = 0; i < 8; i++) {                         // overlapping fronds, ragged at the front edge
      const f = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.5, 0.62), i % 2 ? FROND : FROND2);
      const t = (i + 0.5) / 8;                             // 0 = back, 1 = front
      f.position.set(0, back + (front - back) * t + 0.07 * (i % 2), -D / 2 + D * t);
      f.rotation.x = -(Math.PI / 2 + slope); f.rotation.z = (i % 3 - 1) * 0.02; f.castShadow = true;
      g.add(f);
    }
    for (let i = 0; i < 3; i++) {                          // back wall
      const f = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.2, 0.9), i % 2 ? FROND : FROND2);
      f.position.set(0, 0.25 + i * 0.28, -D / 2 - 0.02); f.castShadow = true; g.add(f);
    }
    const mat = box(1.9, 0.07, 1.2, M('#cdb98a')); mat.position.set(0, 0.04, 0.05); g.add(mat);
    for (const sx of [-1, 1]) { const r = cyl(0.05, 0.05, 0.1, ROPE, 6); r.position.set(sx * W / 2, front - 0.15, D / 2); g.add(r); }
  } else if (type === 'rack') {
    for (const sx of [-1, 1]) {
      const p = cyl(0.05, 0.06, 1.55, WOOD, 6); p.position.set(sx * 0.85, 0.78, 0); g.add(p);
      const f = cyl(0.03, 0.03, 0.3, WOOD, 5); f.rotation.z = sx * 0.6; f.position.set(sx * 0.85 + sx * -0.1, 1.55, 0); g.add(f);
    }
    const bar = cyl(0.04, 0.04, 1.85, WOOD2, 6); bar.rotation.z = Math.PI / 2; bar.position.y = 1.5; g.add(bar);
    const bar2 = cyl(0.03, 0.03, 1.85, WOOD2, 6); bar2.rotation.z = Math.PI / 2; bar2.position.y = 1.1; g.add(bar2);
    g.userData.slots = [];
    for (let i = 0; i < 3; i++) {
      const fish = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M('#b9c4c8')); body.scale.set(0.5, 0.35, 1.7); fish.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 4), M('#8aa0ad')); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.3; fish.add(tail);
      fish.position.set(-0.55 + i * 0.55, 1.3, 0); fish.rotation.y = Math.PI / 2; fish.visible = false; fish.userData.body = body; g.add(fish); g.userData.slots.push(fish);
    }
  } else if (type === 'raft') {
    for (let i = 0; i < 7; i++) { const l = cyl(0.17, 0.17, 3.4, DRIFT, 7); l.rotation.x = Math.PI / 2; l.position.set(-1.1 + i * 0.37, 0.12, 0); g.add(l); }
    for (const z of [-1.0, 0.1, 1.1]) { const b = cyl(0.07, 0.07, 2.8, WOOD2, 6); b.rotation.z = Math.PI / 2; b.position.set(0, 0.33, z); g.add(b); const r = cyl(0.09, 0.09, 2.78, ROPE, 6); r.rotation.z = Math.PI / 2; r.position.set(0, 0.34, z); r.scale.set(1, 0.06, 1); g.add(r); }
    const mast = cyl(0.06, 0.08, 3.4, WOOD, 6); mast.position.set(0, 1.9, -0.3); g.add(mast);
    const yard = cyl(0.04, 0.04, 2.4, WOOD2, 6); yard.rotation.z = Math.PI / 2; yard.position.set(0, 3.2, -0.3); g.add(yard);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.1, 6, 4), CLOTH); sail.position.set(0, 2.1, -0.28); sail.castShadow = true; g.add(sail); g.userData.sail = sail;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), M('#d9443a', { side: THREE.DoubleSide })); flag.position.set(0.28, 3.5, -0.3); g.add(flag);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** can this thing go here? returns null if fine, otherwise the reason */
export function canPlace(type, x, z, others) {
  const h = getHeight(x, z), B = BUILD[type];
  if (Math.hypot(x - VOL.x, z - VOL.z) < 50 || lavaDist(x, z) < 12) return 'too close to the volcano';
  if (type === 'raft') {
    if (h > 0.6 || h < -1.0) return 'build the raft where the land meets the water';
    let sea = false;
    for (let a = 0; a < 8; a++) if (getHeight(x + Math.cos(a * 0.785) * 4, z + Math.sin(a * 0.785) * 4) < -0.6) sea = true;
    if (!sea) return 'it needs open sea to launch into';
    if (poolLevel(x, z) > 0.5 || riverDist(x, z) < 3) return 'it needs the sea, not a stream';
    return null;
  }
  if (h < 0.8) return 'too close to the water';
  if (getSlope(x, z) > 0.28) return 'the ground is too steep';
  if (riverDist(x, z) < 2.2) return 'the stream is in the way';
  for (const o of others) if (Math.hypot(o.x - x, o.z - z) < B.radius + BUILD[o.type].radius) return 'too close to something else';
  return null;
}

export class Structure {
  constructor(type, x, z, yaw) {
    this.type = type; this.x = x; this.z = z; this.yaw = yaw;
    this.y = getHeight(x, z);
    this.mesh = buildMesh(type);
    this.mesh.position.set(x, this.y, z); this.mesh.rotation.y = yaw;
    this.fuel = 0;                    // campfire: game hours of burning left
    this.slots = [0, 0, 0];           // rack: hours until each hung fish is dry (0 = empty), negative = ready
    this.crackle = 0;
    this.light = 0;
    scene.add(this.mesh);
    if (type === 'campfire') addCollider(x, z, 0.5);
    if (type === 'shelter') {          // the two back poles (local (±1.35, -1.15))
      for (const lx of [-1.35, 1.35]) addCollider(x + lx * Math.cos(yaw) + -1.15 * Math.sin(yaw), z - lx * Math.sin(yaw) + -1.15 * Math.cos(yaw), 0.16);
    }
    if (type === 'rack') { addCollider(x + Math.cos(yaw) * 0.85, z - Math.sin(yaw) * 0.85, 0.1); addCollider(x - Math.cos(yaw) * 0.85, z + Math.sin(yaw) * 0.85, 0.1); }
    if (type === 'raft') addCollider(x, z, 0.1);
  }
  get lit() { return this.type === 'campfire' && this.fuel > 0; }
  dispose() { scene.remove(this.mesh); }

  update(dt, dh, t) {
    if (this.type === 'campfire') {
      if (this.fuel > 0) {
        this.fuel = Math.max(0, this.fuel - dh);
        const s = 0.8 + Math.min(1, this.fuel / 2) * 0.5;
        const n = Math.random() < dt * 50 * s ? 1 : 0;
        for (let i = 0; i < n + 1; i++) fx.flame(this.x + (Math.random() - 0.5) * 0.3, this.y + 0.2, this.z + (Math.random() - 0.5) * 0.3, s * 0.8);
        if (Math.random() < dt * 5) fx.mist.emit({ x: this.x + (Math.random() - 0.5) * 0.3, y: this.y + 1.0, z: this.z + (Math.random() - 0.5) * 0.3, vx: 0.2, vy: 1.0, life: 2.6, s0: 0.5, s1: 2.6, c0: [0.35, 0.35, 0.36, 0.28], c1: [0.5, 0.5, 0.5, 0], drag: 0.4 });
        this.crackle -= dt;
        if (this.crackle < 0) { this.crackle = 0.05 + Math.random() * 0.2; events.emit('crackle', this.x, this.y + 0.3, this.z); }
      }
      const em = this.mesh.userData.embers;
      em.material.opacity = this.fuel > 0 ? 0.55 + 0.25 * Math.sin(t * 7 + this.x) : this.fuel > -0.01 ? 0.12 : 0;
    } else if (this.type === 'rack') {
      this.slots.forEach((s, i) => {
        const f = this.mesh.userData.slots[i];
        if (s > 0) { this.slots[i] = Math.max(0.0001, s - dh); }
        f.visible = s !== 0;
        f.userData.body.material.color.set(s > 0.001 ? '#b9c4c8' : '#8a5a30');
      });
    } else if (this.type === 'raft') {
      const sail = this.mesh.userData.sail;
      const pos = sail.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, 0.18 * Math.sin(t * 1.6 + x * 1.4 + y) * (0.5 + y * 0.3) + 0.12); }
      pos.needsUpdate = true;
      this.mesh.position.y = Math.max(this.y, env.tide) + 0.02 + (this.y < env.tide ? 0.03 * Math.sin(t * 1.3) : 0);
    }
  }
  serialize() { return { type: this.type, x: this.x, z: this.z, yaw: this.yaw, fuel: this.fuel, slots: this.slots }; }
}

/** the see-through preview shown while you choose where to build */
export class Ghost {
  constructor() {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.ok = new THREE.MeshBasicMaterial({ color: 0x55ff99, transparent: true, opacity: 0.4, depthWrite: false });
    this.bad = new THREE.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.4, depthWrite: false });
    this.type = null; this.mesh = null; this.valid = false; this.yaw = 0;
  }
  show(type) {
    this.hide();
    this.type = type; this.mesh = buildMesh(type);
    this.mesh.traverse((o) => { if (o.isMesh) { o.material = this.ok; o.castShadow = false; } });
    this.group.add(this.mesh); this.group.visible = true;
  }
  hide() { if (this.mesh) { this.group.remove(this.mesh); this.mesh = null; } this.group.visible = false; this.type = null; }
  set(x, z, yaw, reason) {
    this.valid = !reason; this.yaw = yaw;
    this.group.position.set(x, getHeight(x, z), z); this.group.rotation.y = yaw;
    const m = reason ? this.bad : this.ok;
    this.mesh.traverse((o) => { if (o.isMesh) o.material = m; });
  }
}
