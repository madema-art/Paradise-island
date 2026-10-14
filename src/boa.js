// Pacific boas: stout, slow ground-dwelling snakes. By day each lies coiled under cover near the rats' burrows; at dusk it uncoils and slithers out, tongue
// flicking to taste the air, and stalks the nearest rat. It coils its neck, lunges, and if it connects it throws coils round the rat, then swallows it whole:
// a swelling travels down the body, and the snake lies up to digest, with a lump in its middle that takes a day to go.
// The body is a chain of 32 joints. Slithering is a wave that stays fixed to the ground as the snake passes through it (so the body follows the head's track
// with no sideways slip), lying on the terrain.
import * as THREE from 'three';
import { env, camera } from './core.js';
import { fauna, register, canStand, nearestPerson } from './fauna_common.js';
import { getHeight, VOL, lavaDist, riverDist } from './world.js';
import { makeBoaModel, BOA_SEGS } from './boa_model.js';
import { eco } from './ecology.js';
import { rnd, rr, damp, clamp, lerp, mulberry32, TAU } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const N = BOA_SEGS;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** half-width of the body at joint i (the same profile the Blender model was built from) */
const RAD = Array.from({ length: N + 1 }, (_, i) => { const f = i / N; return Math.max(0.0022, (0.0148 + (0.029 - 0.0148) * ss(0, 0.3, f)) * (1 - Math.pow(ss(0.52, 1, f), 0.85))); });

export class PacificBoa {
  constructor(i, home, rng) {
    this.i = i; this.m = makeBoaModel(); this.home = home;
    this.group = new THREE.Group(); this.group.add(this.m.root); fauna.add(this.group);
    this.x = home.x; this.z = home.z; this.heading = rng() * TAU; this.speed = 0; this.dist = rng() * 10; this.ph = rng() * 6;
    this.state = 'rest'; this.t = rr(3, 30); this.prey = null; this.cool = 0; this.fed = 0; this.scanT = 0; this.way = { x: home.x, z: home.z };
    this.yaw = new Float32Array(N); this.pit = new Float32Array(N); this.coil = 1; this.neck = 0; this.wind = 0; this.swallowP = 0; this.lump = 0; this.lumpAt = 12;
    this.jaw = 0; this.tongue = 0; this.look = 0; this.bulge = new Float32Array(N);
    register({
      id: 'boa' + i, name: 'Pacific boa', cat: 'Reptiles', group: this.group, sim: this, viewDist: 1.4, pickR: 0.8, pickY: 0.05,
      desc: 'A stout Pacific boa that lies coiled under cover by day and slips out at night to ambush the island rats, which it swallows whole.',
    });
    this.pose(0.016, 0);
  }
  awake() { return this.state === 'search' || this.state === 'stalk' || this.state === 'strike' || this.state === 'wake'; }
  /** where a captured rat is held: in the mouth */
  heldPos(out) {
    this.m.head.getWorldPosition(out);
    return out.set(out.x + Math.sin(this.heading) * 0.045, out.y + 0.004, out.z + Math.cos(this.heading) * 0.045);
  }

  nearRat(r) { return eco.ratNear(this.x, this.z, r, (q) => q.state !== 'hidden'); }

  pickWay() {
    const b = eco.burrows.length ? eco.burrows[Math.floor(rnd() * eco.burrows.length)] : this.home;
    const a = rnd() * TAU, r = rr(2, 14);
    this.way = { x: b.x + Math.cos(a) * r, z: b.z + Math.sin(a) * r };
  }

  move(dt, speed, steer = 3) {
    const want = Math.atan2(this.way.x - this.x, this.way.z - this.z);
    const dh = wrap(want - this.heading);
    this.heading += clamp(dh, -steer * dt * 0.35, steer * dt * 0.35);        // a snake turns slowly: the head leads and the body follows
    this.speed = damp(this.speed, speed * (Math.abs(dh) > 1.2 ? 0.4 : 1), 3, dt);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt, nz = this.z + Math.cos(this.heading) * this.speed * dt;
    if (canStand(nx, nz, { minH: 1.3, river: 1.4, maxSlope: 0.55 })) { this.x = nx; this.z = nz; this.dist += this.speed * dt; }
    else { this.heading += rr(1.4, 2.6); this.speed *= 0.3; this.pickWay(); }
  }

  update(dt, t) {
    const h = env.tod, night = h >= 18.4 || h < 5.2, S = this.state;
    this.t -= dt; this.cool -= dt; this.scanT -= dt; this.ph += dt;
    this.tongue = 0; this.jaw = damp(this.jaw, 0, 8, dt); this.neck = damp(this.neck, 0, 3, dt);
    let target = 1;                                                                    // 1 = coiled, 0 = out and moving
    switch (S) {
      case 'rest': {
        this.speed = damp(this.speed, 0, 4, dt); target = 1;
        if (this.t < 0) { if (night && this.fed < 2) { this.state = 'wake'; this.t = 4; } else this.t = rr(15, 40); }
        if (rnd() < dt * 0.06) this.tongue = 1;
        break;
      }
      case 'wake': {                                                                // uncoil: the neck lifts, the tongue tastes the air
        this.speed = damp(this.speed, 0, 4, dt); target = 0.5 * (this.t / 4);
        this.tongue = Math.sin(t * 7) > 0.2 ? 1 : 0; this.neck = damp(this.neck, 0.6, 2, dt);
        if (this.t < 0) { this.state = 'search'; this.pickWay(); this.t = rr(25, 60); }
        break;
      }
      case 'search': case 'stalk': {
        target = 0;
        const rat = this.cool < 0 ? this.nearRat(S === 'stalk' ? 9 : 5) : null;
        if (rat) { this.prey = rat; this.state = 'stalk'; this.way = { x: rat.x, z: rat.z }; }
        else if (S === 'stalk') { this.state = 'search'; this.pickWay(); }
        const spd = S === 'stalk' ? 0.62 : 0.34;
        this.move(dt, spd);
        this.tongue = Math.sin(t * (S === 'stalk' ? 11 : 6) + this.i) > 0.25 ? 1 : 0;
        this.look = Math.sin(t * 0.8 + this.i) * 0.4;
        this.neck = damp(this.neck, S === 'stalk' ? 0.55 : 0.18, 3, dt);
        if (S === 'search' && Math.hypot(this.way.x - this.x, this.way.z - this.z) < 1.5) this.pickWay();
        if (S === 'stalk' && this.prey) {
          const d = Math.hypot(this.prey.x - this.x, this.prey.z - this.z);
          if (!this.prey.exposed()) { this.state = 'search'; this.prey = null; this.pickWay(); }
          else if (d < 0.75) { this.state = 'strike'; this.t = 0.7; this.strikeT = 0; this.sx = this.x; this.sz = this.z; }
        }
        if ((S === 'search' && (this.t < 0 || (!night && h > 5.6))) || (!night && h > 5.8 && h < 18)) { this.state = 'home'; this.way = { x: this.home.x, z: this.home.z }; }
        break;
      }
      case 'strike': {
        target = 0; this.strikeT += dt;
        const p = this.prey;
        if (!p || !p.exposed()) { this.state = 'search'; this.cool = 3; break; }
        const a = Math.atan2(p.x - this.x, p.z - this.z); this.heading += clamp(wrap(a - this.heading), -9 * dt, 9 * dt);
        if (this.strikeT < 0.35) { this.neck = damp(this.neck, 1, 12, dt); this.speed = 0; this.wind = damp(this.wind, 1, 14, dt); }       // coil the neck back
        else if (this.strikeT < 0.55) {                                            // the lunge
          this.wind = damp(this.wind, 0, 40, dt); this.jaw = 0.55; this.neck = 1;
          const d = Math.hypot(p.x - this.x, p.z - this.z);
          if (d > 0.12) { const s = 3.6 * dt; this.x += Math.sin(this.heading) * s; this.z += Math.cos(this.heading) * s; }
          if (d < 0.2) this.snap(p);
        } else { this.wind = damp(this.wind, 0, 10, dt); if (this.strikeT > 0.8 && this.state === 'strike') { this.state = 'search'; this.cool = 5; this.prey = null; this.pickWay(); } }
        break;
      }
      case 'constrict': {
        target = 0.75; this.speed = 0; this.tongue = 0;
        if (this.prey) { this.prey.group.rotation.z = 1.5; }
        if (this.t < 0) { this.state = 'swallow'; this.t = 10; this.swallowP = 0; if (this.prey) { this.prey.consume(); this.prey = null; } }
        break;
      }
      case 'swallow': {
        target = 0.55; this.speed = 0;
        this.jaw = 0.35 + 0.2 * Math.sin(t * 5);
        this.swallowP = (10 - this.t) / 10 * 15;                                   // the swelling slides back down the body
        this.lump = 1; this.lumpAt = this.swallowP;
        if (this.t < 0) { this.state = 'digest'; this.t = rr(60, 110); this.fed++; }
        break;
      }
      case 'digest': {
        target = 1; this.speed = damp(this.speed, 0, 4, dt);
        this.lump = Math.max(0, this.lump - dt / 110); this.lumpAt = 15;
        if (this.t < 0) { this.state = 'rest'; this.t = rr(5, 20); }
        break;
      }
      case 'home': {
        target = 0.1; this.move(dt, 0.4);
        this.tongue = Math.sin(t * 5) > 0.3 ? 1 : 0;
        if (Math.hypot(this.home.x - this.x, this.home.z - this.z) < 1.2) { this.state = 'rest'; this.t = rr(10, 50); this.fed = 0; }
        break;
      }
      default: this.state = 'rest';
    }
    if (this.state !== 'swallow' && this.state !== 'digest') this.lump = Math.max(0, this.lump - dt / 110);
    this.coil = damp(this.coil, target, 2, dt);
    this.pose(dt, t);
  }

  /** the lunge connects (or the rat wriggles free) */
  snap(p) {
    if (p.state === 'flee' && rnd() < 0.5) { this.state = 'search'; this.cool = 4; this.prey = null; return; }
    p.caught(this); this.state = 'constrict'; this.t = rr(4, 6);
  }

  /** the shape of the chain: a wave or a coil, over the ground */
  pose(dt, t) {
    const m = this.m, c = this.coil, L = m.L;
    const dist = this.dist, k = 0.62, kappa = k / L;
    const climb = [];
    // yaw per joint: a ground-fixed travelling wave when moving, a coil when resting
    let amp = 0.3;
    if (this.state === 'stalk') amp = 0.22;
    const coilBend = this.state === 'constrict' ? 0.62 : 0.44;
    const idle = Math.sin(t * 0.5 + this.i) * 0.03;
    for (let i = 0; i < N; i++) {
      const env_ = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, i / (N - 4)) * 0.9 + 0.2);
      const wave = amp * env_ * Math.sin(kappa * dist - k * i + this.i * 1.7) * (this.speed > 0.03 ? 1 : 0.15) + idle * (i < 14 ? 1 : 0.4);
      let y = lerp(wave, coilBend, c);
      // the neck coils back (S) before a strike
      if (i < 7) y += this.wind * 0.75 * Math.sin(i * 0.95 + 0.3) + (i < 3 ? this.look * (1 - c) * 0.5 : 0);
      this.yaw[i] = y;
    }
    // heights: the terrain under each joint, the body's half-width, the coil's stack, a raised neck
    let px = this.x, pz = this.z, hd = this.heading;
    const H = new Array(N + 1);
    const rise = 0.0036;
    for (let i = 0; i <= N; i++) {
      if (i > 0) { hd += this.yaw[i - 1]; px += -Math.sin(hd) * L; pz += -Math.cos(hd) * L; }
      const stack = c > 0.35 ? rise * Math.min(i, 28) * ss(0.35, 1, c) : 0;
      const neck = this.neck * (i < 10 ? 0.15 * Math.pow(1 - i / 10, 1.4) : 0);
      H[i] = getHeight(px, pz) + RAD[i] * 0.95 + stack + neck;
    }
    // smooth the heights a little so the body does not kink on a rough slope
    for (let i = 1; i < N; i++) H[i] = H[i] * 0.6 + (H[i - 1] + H[i + 1]) * 0.2;
    // back to rotations: the pitch of each stretch from the height change, relative to the one before
    let prev = 0;
    for (let i = 0; i < N; i++) {
      const psi = Math.atan2(H[i + 1] - H[i], L), rel = psi - prev; prev = psi;
      m.segs[i].rotation.set(clamp(rel, -0.7, 0.7), this.yaw[i], 0, 'YXZ');
    }
    this.group.position.set(this.x, H[0] - 0.03, this.z);
    this.group.rotation.set(0, this.heading, 0);
    // the swelling of a meal on its way down, and the lump that stays
    for (let i = 0; i < N; i++) {
      let b = 0;
      if (this.state === 'swallow') b = 0.55 * Math.exp(-Math.pow((i - this.swallowP) / 1.7, 2)) * (this.swallowP > 1 ? 1 : 0);
      b += this.lump * 0.45 * Math.exp(-Math.pow((i - this.lumpAt) / 2.4, 2)) * (this.state === 'swallow' ? 0.6 : 1);
      this.bulge[i] = damp(this.bulge[i], b, 6, dt);
      m.pieces[i].scale.set(1 + this.bulge[i], 1 + this.bulge[i] * 0.9, 1);
    }
    m.jaw.rotation.x = this.jaw;
    m.head.rotation.y = damp(m.head.rotation.y, this.look * 0.6, 5, dt);
    m.tongue.visible = this.tongue > 0;
    m.tongue.scale.z = 0.6 + 0.4 * Math.abs(Math.sin(t * 20));
    m.tongue.rotation.y = Math.sin(t * 28) * 0.25;
  }
}

/** three boas, resting by day near the rats' burrows (placement uses its own generator: the world's random stream is untouched) */
export function spawnBoas() {
  if (!makeBoaModel() || !eco.burrows.length) return [];
  const rng = mulberry32(0xb0a5);
  const boas = [];
  for (let k = 0; k < 3; k++) {
    const b = eco.burrows[Math.floor(rng() * eco.burrows.length)];
    let home = null;
    for (let tries = 0; tries < 30 && !home; tries++) {
      const a = rng() * TAU, r = 3 + rng() * 5, x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
      if (canStand(x, z, { minH: 1.4, river: 2 }) && boas.every((o) => Math.hypot(o.x - x, o.z - z) > 8)) home = { x, z };
    }
    if (home) boas.push(new PacificBoa(boas.length, home, rng));
  }
  eco.boas.push(...boas);
  return boas;
}
