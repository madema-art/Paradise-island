// Wild boar and feral pigs: five kinds (grizzled boar, yearling, silver tusker, ginger boar, spotted pig) and striped piglets,
// each with its own size, coat, tusks and temper, and a daily routine: forage at dawn and dusk, wallow in the heat of the day,
// sleep in a heap at night, scratch on palm trunks, drink at the river. They notice people and react by temperament.
import * as THREE from 'three';
import { env, camera } from './core.js';
import { fauna, register, orient, steer, canStand, randomSpot, lookAtCamera, blinkAt, nearestPerson } from './fauna_common.js';
import { makeBoar } from './creatures.js';
import { makeBoarModel } from './boar_model.js';
import { getHeight, riverDist } from './world.js';
import { fx } from './props.js';
import { eco } from './ecology.js';
import { rnd, rr, damp, clamp, lerp, TAU, mulberry32 } from './util.js';

/* ------------------------------------------------------------------ the kinds */
// fear: 'wary' keeps its distance and bolts, 'bold' stands its ground and bluff-charges, 'curious' wanders over to look
export const BOAR_KINDS = {
  wild: {
    name: 'Wild boar', coat: 'wild', scale: [1.12, 1.3], tusk: 1, mane: 1, speed: 2.3, run: 4.8, fear: 'wary', alert: 12, flee: 6, width: 1, length: 1,
    desc: 'Roots through the leaf litter for tubers and fallen coconuts. Bold, bristly, best admired from a distance.',
  },
  yearling: {
    name: 'Wild boar', coat: 'wild', scale: [0.78, 0.9], tusk: 0.2, mane: 0.6, speed: 2.4, run: 5.0, fear: 'wary', alert: 10, flee: 6, width: 0.92, length: 0.9, age: 'Yearling',
    desc: 'Roots through the leaf litter for tubers and fallen coconuts. A yearling: all legs and ears, still sticking close to the sounder.',
  },
  tusker: {
    name: 'Silver tusker', coat: 'tusker', scale: [1.5, 1.68], tusk: 1.9, mane: 1.35, speed: 1.9, run: 5.2, fear: 'bold', alert: 13, flee: 4.4, width: 1.1, length: 1.04, age: 'Old male',
    desc: 'A grizzled old male gone silver with age, with long curled tusks and a heavy mane. He lives alone and does not give way.',
  },
  ginger: {
    name: 'Ginger boar', coat: 'ginger', scale: [1.0, 1.2], tusk: 0.65, mane: 0.8, speed: 2.4, run: 4.6, fear: 'curious', alert: 9, flee: 3.6, width: 1, length: 1, ear: 0.5,
    desc: 'A rusty-red feral pig, descended from animals that escaped from early settlers. Bolder and nosier than its wild cousins.',
  },
  spotted: {
    name: 'Spotted pig', coat: 'spotted', scale: [0.95, 1.12], tusk: 0.4, mane: 0.35, speed: 2.4, run: 4.4, fear: 'curious', alert: 9, flee: 3.4, width: 1.04, length: 0.98, ear: 1,
    desc: 'A black-and-pink feral pig with lop ears, left behind by long-gone sailors. Half tame, half wild, and always hungry.',
  },
  piglet: {
    name: 'Boar piglet', coat: 'piglet', scale: [0.5, 0.62], tusk: 0, mane: 0, speed: 2.6, run: 5.0, fear: 'wary', alert: 8, flee: 4, width: 0.95, length: 0.9, baby: true, ear: -0.1,
    desc: 'Striped piglets stay glued to their mother, squeaking when she wanders off.',
  },
};

const night = (h) => h >= 21.5 || h < 5.2;
const hot = (h) => h >= 11.3 && h < 15.6;
const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// how each pose bends the legs: [hip, knee] for the front pair and the rear pair when lying on the belly
const LIE = { front: [1.2, 1.7], rear: [-1.35, 2.7] };

export class Boar {
  /** opts: {kind, leader, sex, sleeper} */
  constructor(home, i, opts = {}, ctx = {}) {
    const K = BOAR_KINDS[opts.kind || 'wild'];
    this.K = K; this.kind = opts.kind || 'wild'; this.ctx = ctx;
    const r = mulberry32(7919 * (i + 3));                     // local generator: placement elsewhere stays untouched
    const m = makeBoarModel(K.coat) || makeBoar(!!K.baby);
    Object.assign(this, m);
    this.baby = !!K.baby; this.isBoar = true; this.leader = opts.leader || null;
    this.sex = this.baby ? (r() < 0.5 ? 'Female' : 'Male') : (opts.sex || 'Male');
    this.age = K.age || (this.baby ? 'Piglet' : 'Adult');
    this.variant = this.kind + (this.sex === 'Female' ? 'F' : '');
    this.group = new THREE.Group(); this.group.add(this.root); fauna.add(this.group);
    this.sc = lerp(K.scale[0], K.scale[1], r());
    this.group.scale.setScalar(this.rigged ? this.sc : this.sc / 1.25 * (this.baby ? 1 : 1));
    if (this.rigged) {
      this.root.scale.set(K.width * (0.96 + 0.08 * r()), 0.97 + 0.07 * r(), K.length * (0.96 + 0.08 * r()));
      const tk = K.tusk * (this.sex === 'Female' && !this.baby ? 0.5 : 1);
      this.tusks.forEach((t) => { t.scale.setScalar(Math.max(0.001, tk)); t.visible = tk > 0.05; });
      if (this.mane) { this.mane.visible = K.mane > 0; this.mane.scale.set(1, Math.max(0.01, K.mane), 1); this.mane.position.y += -(K.mane - 1) * 0.97; }
      this.earRest = (K.ear || 0);
      this.ears.forEach((e, k) => { e.userData.rest = { z: (k ? -1 : 1) * this.earRest * 0.7, x: this.earRest * 0.45 }; });
      this.tail.forEach((t) => { t.userData.rest = { x: t.rotation.x }; });
    }
    this.home = home;
    const s = randomSpot(home.x, home.z, 1, 14, { minH: 3 }, 60) || home;
    this.x = s.x; this.z = s.z; this.heading = r() * TAU; this.state = 'idle'; this.t = 1 + r() * 4; this.ph = r() * 6; this.speed = 0;
    this.tx = this.x; this.tz = this.z;
    this.headDown = 0; this.headTarget = 0; this.lie = 0; this.alertK = 0; this.jawK = 0; this.roll = 0; this.rollT = 0;
    this.fleeT = 0; this.earT = 1; this.earK = [0, 0]; this.tailK = 0; this.hop = 0; this.rub = 0; this.shake = 0; this.dig = 0;
    this.lk = {};
    // some adults stand their ground against the castaway rather than bolt (own generator: placement elsewhere is untouched)
    this.defends = !this.baby && (this.kind === 'wild' || this.kind === 'ginger') && mulberry32(104729 * (i + 5))() < 0.55;
    const label = this.baby ? 'Boar piglet' : K.name;
    register({ id: 'boar' + i, name: label, cat: 'Mammals', group: this.group, sim: this, viewDist: this.baby ? 5 : 8 * Math.max(1, K.scale[1] / 1.3), desc: K.desc, pickR: this.baby ? 1.1 : 1.7 * this.sc / 1.2, pickY: 0.8 });
  }

  /* ---------------------------------------------------------------- choosing what to do next */
  waterSpot() {
    if (this.water !== undefined) return this.water;
    this.water = null;
    for (let k = 0; k < 40 && !this.water; k++) {
      const a = rnd() * TAU, d = rr(8, 46), x = this.home.x + Math.cos(a) * d, z = this.home.z + Math.sin(a) * d, rd = riverDist(x, z);
      if (rd > 2.3 && rd < 3.8 && canStand(x, z, { minH: 1.5, river: 2.2 })) this.water = { x, z };
    }
    return this.water;
  }
  palmSpot() {
    if (this.palm !== undefined) return this.palm;
    this.palm = null;
    let bd = 34;
    for (const p of this.ctx.palms || []) {
      const d = Math.hypot(p.x - this.home.x, p.z - this.home.z);
      if (d < bd && p.y > 2.4) { bd = d; this.palm = p; }
    }
    return this.palm;
  }
  /** boars are omnivores: a rat that wanders within reach is snapped up (rats are another of the island's foods) */
  snapRat(dt) {
    this.ratT = (this.ratT || 0) - dt;
    if (this.ratT > 0 || this.K.baby) return;
    this.ratT = 0.5;
    const rat = eco.ratNear(this.x, this.z, 2.4);
    if (rat && rnd() < 0.45) { rat.die(); this.ratsEaten = (this.ratsEaten || 0) + 1; this.rest('root', rr(3, 5)); }
  }
  go(x, z, state) { this.tx = x; this.tz = z; this.state = state; }
  rest(state, t) { this.state = state; this.t = t; }

  decide() {
    const L = this.leader, h = env.tod;
    if (L && (L.state === 'sleep' || L.state === 'wallow' || L.state === 'rest') && Math.hypot(L.x - this.x, L.z - this.z) < 16) {
      this.go(L.x + rr(-1.2, 1.2), L.z + rr(-1.2, 1.2), 'tosleep'); this.sleepMode = L.state === 'wallow' ? 'rest' : L.state; return;
    }
    const r = rnd();
    if (night(h) && !this.baby) { this.sleepNear(); return; }
    if (night(h) && this.baby && !L) { this.sleepNear(); return; }
    if (hot(h) && r < 0.65) {
      const w = this.waterSpot();
      if (w && r < 0.4 && !this.baby) { this.go(w.x, w.z, 'towallow'); return; }
      this.sleepNear('rest'); return;
    }
    if (this.baby && r < 0.3 && L) { this.go(L.x + rr(-5, 5), L.z + rr(-5, 5), 'zoom'); return; }
    if (r < 0.4) { this.rest('root', rr(4, 9)); return; }
    if (r < 0.5 && this.palmSpot()) { const p = this.palm, a = rnd() * TAU; this.go(p.x + Math.cos(a) * 0.95, p.z + Math.sin(a) * 0.95, 'toscratch'); this.scratchAt = p; return; }
    if (r < 0.58 && this.waterSpot()) { this.go(this.water.x, this.water.z, 'todrink'); return; }
    if (r < 0.88) {
      const s = randomSpot(this.x, this.z, 5, 20, { minH: 3 });
      if (s && Math.hypot(s.x - this.home.x, s.z - this.home.z) < 55) { this.go(s.x, s.z, 'walk'); return; }
    }
    this.rest('idle', rr(2, 5));
  }
  sleepNear(mode = 'sleep') {
    const s = randomSpot(this.home.x, this.home.z, 1, 9, { minH: 3 }, 20) || { x: this.x, z: this.z };
    this.sleepMode = mode;
    this.go(s.x, s.z, 'tosleep');
  }

  /* ---------------------------------------------------------------- per frame */
  update(dt, t) {
    this.t -= dt; this.fleeT -= dt; this.earT -= dt;
    const K = this.K, L = this.leader, st0 = this.state;
    const who = nearestPerson(this.x, this.z, this.group.position.y);         // the camera, or the castaway when he is nearer
    const dxc = who.x - this.x, dzc = who.z - this.z, cd = who.d;
    const toCam = Math.atan2(dxc, dzc);
    let moving = false, run = false;

    if (this.charge) {                                             // survival mode drives a charging boar
      if (this.state !== 'walk') { this.state = 'walk'; this.t = 1; }
    } else {
      // ---- noticing people
      const asleep = this.state === 'sleep' || this.state === 'rest' || this.state === 'wallow';
      const calm = this.state === 'idle' || this.state === 'root' || this.state === 'walk' || this.state === 'drink' || this.state === 'scratch' || this.state === 'zoom' || asleep || this.state === 'tosleep' || this.state === 'towallow' || this.state === 'todrink' || this.state === 'toscratch';
      if (calm && cd < (asleep ? K.alert * 0.4 : K.alert) && !(this.state === 'walk' && this.fleeT > 0)) { this.state = 'alert'; this.t = rr(2.5, 4.5); this.alertCd = cd; }
      if (L && L.state === 'alert' && calm && cd < 40) { this.state = 'alert'; this.t = rr(1.5, 3); }
      if (L && L.state === 'flee' && this.state !== 'flee') { this.flee(toCam + Math.PI, 14); }
    }

    switch (this.state) {
      case 'alert': {
        this.speed = damp(this.speed, 0, 7, dt);
        this.heading = steer(this.heading, toCam, dt * 2.6);
        this.headTarget = -0.05;
        if (!this.charge && cd < K.flee && this.sex !== undefined) {
          const stand = who.cast && this.defends;                        // a boar that holds its ground against the castaway
          if (K.fear === 'wary' && !stand) { if (this.baby && L) { this.go(L.x + rr(-1, 1), L.z + rr(-1, 1), 'walk'); this.fast = true; this.fleeT = 3; } else this.flee(toCam + Math.PI + rr(-0.5, 0.5), rr(14, 22)); }
          else if (K.fear === 'bold' || stand) { if (this.t < 2.2) { this.state = 'bluff'; this.t = 1.1; this.bluffT = 0; } }
          else if (K.fear === 'curious') { /* watch, then come over */ if (this.t < 2.2 && cd > 3.2) { this.go(this.x + Math.sin(toCam) * (cd - 3), this.z + Math.cos(toCam) * (cd - 3), 'approach'); this.t = 6; } }
        }
        if (this.t < 0) {
          if (cd < K.alert * 1.15 && K.fear === 'curious' && cd > 3.2) { this.go(this.x + Math.sin(toCam) * (cd - 3), this.z + Math.cos(toCam) * (cd - 3), 'approach'); this.t = 6; }
          else if (cd > K.alert * 1.1) { this.rest('idle', rr(1, 3)); } else this.t = rr(1.5, 3);
        }
        break;
      }
      case 'bluff': {                                              // a short rush at the intruder, then a huff and a stand-off
        this.bluffT += dt;
        this.heading = steer(this.heading, toCam, dt * 5);
        this.speed = damp(this.speed, cd > 2.6 ? 4.6 : 0, 6, dt);
        this.headTarget = 0.35; moving = this.speed > 0.8; run = true;
        if (this.t < 0) { this.rest('alert', rr(2.5, 4)); this.warn = 1.2; }
        break;
      }
      case 'flee': {
        this.heading = steer(this.heading, Math.atan2(this.tx - this.x, this.tz - this.z), dt * 5);
        this.speed = damp(this.speed, K.run, 5, dt);
        this.headTarget = -0.1; moving = true; run = true;
        if (this.t < 0 || Math.hypot(this.tx - this.x, this.tz - this.z) < 1.5) { this.rest('idle', rr(2, 4)); }
        break;
      }
      case 'idle': case 'root': {
        this.snapRat(dt);
        this.speed = damp(this.speed, 0, 6, dt);
        this.headTarget = this.state === 'root' ? 1 : (Math.sin(t * 0.7 + this.ph) > 0.8 ? 0.45 : 0);     // now and then a sniff at the ground
        if (L && Math.hypot(L.x - this.x, L.z - this.z) > 3.6) { this.go(L.x + rr(-1.6, 1.6), L.z + rr(-1.6, 1.6), 'walk'); this.fast = Math.hypot(L.x - this.x, L.z - this.z) > 7; break; }
        if (this.t < 0) this.decide();
        break;
      }
      case 'walk': case 'approach': case 'zoom': case 'tosleep': case 'towallow': case 'todrink': case 'toscratch': {
        if (this.state === 'walk') this.snapRat(dt);
        const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
        const gait = this.state === 'zoom' ? 4.4 : this.state === 'approach' ? 1.2 : this.charge ? 5.6 : this.fast ? K.speed * 1.6 : K.speed;
        this.heading = steer(this.heading, Math.atan2(dx, dz), dt * (this.charge ? 6 : this.state === 'zoom' ? 5 : 2.4));
        this.speed = damp(this.speed, gait, this.charge ? 6 : 3, dt);
        this.headTarget = this.state === 'approach' ? 0.55 : this.charge ? 0.3 : 0;
        run = gait > 3.3;
        const nx = this.x + Math.sin(this.heading) * this.speed * dt, nz = this.z + Math.cos(this.heading) * this.speed * dt;
        const river = this.state === 'towallow' || this.state === 'todrink' ? 1.8 : 1.5;
        if (canStand(nx, nz, { minH: 2.5, river })) { this.x = nx; this.z = nz; } else if (this.state === 'towallow' || this.state === 'todrink') { d < 7 ? this.arrive() : (this.state = 'idle', this.t = 1); } else { this.state = 'idle'; this.t = 1; }
        moving = true;
        if (this.state === 'approach' && cd < 3.4) { this.rest('alert', rr(3, 6)); }
        else if (d < (this.state === 'zoom' ? 2 : 1.2)) this.arrive();
        if (this.state === 'zoom' && this.t < -6) this.rest('idle', 1);
        if (this.state === 'zoom') this.t = Math.max(this.t, -7);
        break;
      }
      case 'sleep': case 'rest': case 'wallow': {
        this.speed = damp(this.speed, 0, 6, dt);
        if (this.state === 'wallow') this.wallowFx(dt, t);
        if (this.t < 0 && !(L && (L.state === 'sleep' || L.state === 'rest' || L.state === 'wallow') && !this.leader.charge)) { this.shake = 1.2; this.rest('idle', rr(1, 3)); }
        if (night(env.tod) === false && this.state === 'sleep' && this.t > 12) this.t = rr(3, 8);
        break;
      }
      case 'drink': case 'scratch': {
        this.speed = damp(this.speed, 0, 6, dt);
        this.headTarget = this.state === 'drink' ? 1.05 : 0.15;
        if (this.state === 'scratch') this.scratchFx(dt);
        if (this.t < 0) this.rest('idle', rr(1, 3));
        break;
      }
      default: this.state = 'idle';
    }
    if (this.state !== st0 && (this.state === 'sleep' || this.state === 'rest' || this.state === 'wallow')) this.t = this.t > 0 ? this.t : 20;

    this.pose(dt, t, moving, run, cd, toCam);
  }

  arrive() {
    const st = this.state;
    if (st === 'tosleep') { this.rest(this.sleepMode === 'rest' ? 'rest' : 'sleep', night(env.tod) ? rr(50, 130) : rr(18, 45)); if (this.baby) this.t = rr(30, 90); }
    else if (st === 'towallow') { this.rest('wallow', rr(25, 60)); this.rollT = rr(3, 6); }
    else if (st === 'todrink') {
      let best = this.heading, bd = 1e9;
      for (let a = 0; a < 16; a++) { const h = a * TAU / 16, d = riverDist(this.x + Math.sin(h) * 2.5, this.z + Math.cos(h) * 2.5); if (d < bd) { bd = d; best = h; } }
      this.heading = best; this.rest('drink', rr(5, 9));
    } else if (st === 'toscratch') {
      const p = this.scratchAt; if (p) this.heading = Math.atan2(p.x - this.x, p.z - this.z) + (rnd() < 0.5 ? 1 : -1) * Math.PI / 2;
      this.rest('scratch', rr(5, 9));
    } else if (st === 'zoom') { this.rest('idle', rr(0.5, 2)); }
    else this.rest('idle', rr(1.5, 4.5));
    this.speed = 0;
  }

  flee(away, dist) {
    this.state = 'flee'; this.t = rr(3, 5);
    for (let k = 0; k < 8; k++) {
      const a = away + (k % 2 ? 1 : -1) * k * 0.22, x = this.x + Math.sin(a) * dist, z = this.z + Math.cos(a) * dist;
      if (canStand(x, z, { minH: 2.5, river: 1.5 })) { this.tx = x; this.tz = z; return; }
    }
    const s = randomSpot(this.x, this.z, 8, 18, { minH: 3 }); if (s) { this.tx = s.x; this.tz = s.z; } else { this.state = 'alert'; }
  }
  wallowFx(dt, t) {
    this.rollT -= dt;
    if (this.rollT < 0) { this.rollT = rr(5, 10); this.roll = this.roll ? 0 : (rnd() < 0.5 ? 1 : -1); }
    if (rnd() < dt * 0.9) fx.mist.emit({ x: this.x + rr(-0.5, 0.5), y: getHeight(this.x, this.z) + 0.25, z: this.z + rr(-0.5, 0.5), vx: rr(-0.3, 0.3), vy: rr(0.8, 1.6), vz: rr(-0.3, 0.3), life: rr(0.5, 0.9), s0: 0.1, s1: 0.26, c0: [0.38, 0.28, 0.18, 0.55], c1: [0.38, 0.28, 0.18, 0], grav: 4, drag: 0.5 });
  }
  scratchFx(dt) { this.rub += dt * 5.5; }

  /* ---------------------------------------------------------------- the body */
  pose(dt, t, moving, run, cd, toCam) {
    const st = this.state, K = this.K;
    const lying = st === 'sleep' || st === 'rest' || st === 'wallow';
    this.lie = damp(this.lie, lying ? 1 : 0, lying ? 2.6 : 3.4, dt);
    this.roll = this.roll || 0;
    this.rollK = damp(this.rollK || 0, st === 'wallow' ? this.roll : 0, 3, dt);
    this.alertK = damp(this.alertK, st === 'alert' || st === 'bluff' ? 1 : 0, 6, dt);
    this.headDown = damp(this.headDown, lying ? 0.35 + (st === 'sleep' ? 0.35 : 0) : this.headTarget, 5, dt);
    this.shake = Math.max(0, this.shake - dt);
    this.warn = Math.max(0, (this.warn || 0) - dt);
    orient(this.group, this.x, this.z, this.heading, 0.9, 0.5);
    if (st === 'scratch') this.group.rotation.z += 0.0;
    this.ph += dt * (2 + this.speed * (run ? 3.0 : 3.5));

    // legs
    const amp = run ? 0.85 : 0.55, w = Math.sin(this.ph) * (moving ? amp : 0);
    const lg = this.legs;
    lg[0].rotation.x = w; lg[3].rotation.x = w; lg[1].rotation.x = -w; lg[2].rotation.x = -w;
    lg.forEach((l, i) => {
      const ph = this.ph + (i === 0 || i === 3 ? 0 : Math.PI);
      l.knee.rotation.x = moving ? 0.1 + (run ? 0.8 : 0.55) * Math.max(0, Math.sin(ph + 1.3)) : 0.04;
    });
    if (this.lie > 0.002) {
      const e = this.lie;
      lg.forEach((l, i) => { const f = i < 2, cfg = f ? LIE.front : LIE.rear; l.rotation.x = lerp(l.rotation.x, cfg[0], e); l.knee.rotation.x = lerp(l.knee.rotation.x, cfg[1], e); });
    }
    // body
    const bob = moving ? Math.abs(Math.sin(this.ph)) * (run ? 0.05 : 0.03) : 0;
    const hop = this.state === 'zoom' ? Math.abs(Math.sin(this.ph * 1.7)) * 0.16 : 0;
    const breathe = Math.sin(t * (lying ? 1.5 : 1.6) + this.ph) * (lying ? 0.012 : 0.004);
    const by = this.bodyY ?? 0.82;
    const lieDrop = this.rigged ? 0.24 : 0.42;
    this.body.position.y = by + bob + hop + breathe - lieDrop * this.lie;
    this.body.rotation.x = (st === 'root' || st === 'drink' ? 0.1 * this.headDown : 0) + (st === 'bluff' ? 0.08 : 0) + (moving && run ? 0.04 * Math.sin(this.ph) : 0);
    this.body.rotation.z = this.rollK * 0.9 + (st === 'scratch' ? Math.sin(this.rub) * 0.09 : 0) + (this.shake > 0 ? Math.sin(t * 40) * 0.08 * Math.min(1, this.shake) : 0);
    this.body.rotation.y = st === 'scratch' ? Math.sin(this.rub * 0.5) * 0.08 : this.shake > 0 ? Math.sin(t * 34) * 0.1 * Math.min(1, this.shake) : 0;
    if (st === 'scratch') this.body.position.x = Math.sin(this.rub) * 0.04; else this.body.position.x = 0;

    // head
    lookAtCamera(this.group, this.lk, dt, 0.9, st === 'alert' ? 30 : 12, 0.9);
    const rootNudge = st === 'root' ? Math.sin(t * 7 + this.ph) * 0.11 : 0;
    const digging = st === 'root' ? Math.max(0, Math.sin(t * 1.1 + this.ph * 2)) : 0;
    this.hp.rotation.x = this.headDown * (1.38 + rootNudge * 0.7) - this.alertK * 0.1 + (moving ? 0.05 * Math.sin(this.ph * 2) : 0) + this.lk.p * 0.55 * (1 - this.headDown) + (st === 'bluff' ? Math.sin(t * 14) * 0.1 : 0);
    this.hp.rotation.y = this.lk.y * (1 - this.headDown) + (st === 'root' ? Math.sin(t * 2 + this.ph) * 0.3 : 0) + (this.warn > 0 ? Math.sin(t * 6) * 0.4 : 0) + (st === 'alert' && K.fear === 'bold' ? Math.sin(t * 2.3) * 0.18 : 0);
    this.hp.rotation.z = lying ? (this.sleepTilt ??= rr(-0.25, 0.25)) * this.lie : (st === 'alert' ? Math.sin(t * 1.3 + this.ph) * 0.1 : 0);
    // a front hoof scrapes the ground while digging
    if (st === 'root' && digging > 0.2 && this.rigged) { this.legs[0].rotation.x -= 0.9 * digging * Math.max(0, Math.sin(t * 9)); this.legs[0].knee.rotation.x += 0.7 * digging; }
    if (this.jaw) {
      const chew = st === 'root' ? (0.1 + 0.06 * Math.sin(t * 13)) : st === 'bluff' || this.warn > 0 || this.charge ? 0.26 + 0.18 * Math.sin(t * 17) : st === 'drink' ? 0.1 + 0.08 * Math.sin(t * 9) : (Math.sin(t * 0.37 + this.ph) > 0.97 ? 0.3 : 0.02);
      this.jaw.rotation.x = damp(this.jaw.rotation.x, chew, 14, dt);
    }
    // ears: forward and up when alert, flick now and then, flat when charging
    if (this.ears && this.rigged) {
      if (this.earT < 0) { this.earT = rr(1.2, 4.5); this.earK[rnd() < 0.5 ? 0 : 1] = 1; }
      this.ears.forEach((e, k) => {
        this.earK[k] = Math.max(0, this.earK[k] - dt * 6);
        const rest = e.userData.rest, s = k ? -1 : 1;
        const back = this.charge || st === 'flee' ? 0.7 : 0;
        e.rotation.x = rest.x - this.alertK * 0.28 + back + (lying && st === 'sleep' ? 0.2 : 0);
        e.rotation.z = rest.z * (1 - this.alertK * 0.7) + s * this.earK[k] * Math.sin(t * 50) * 0.18 + s * back * 0.2;
      });
    }
    // tail
    if (this.tail && this.rigged) {
      const sw = moving ? (run ? 0.5 : 0.3) : 0.12;
      this.tailK = damp(this.tailK, this.charge || st === 'flee' || st === 'bluff' ? 0.8 : 0, 5, dt);
      this.tail[0].rotation.x = this.tail[0].userData.rest.x - this.tailK * 0.9;
      this.tail[0].rotation.z = Math.sin(t * (moving ? 7 : 2.6) + this.ph) * sw;
      this.tail[1].rotation.z = Math.sin(t * (moving ? 7 : 2.6) + this.ph - 0.8) * sw * 1.2;
    }
    // blink
    if (this.eyes) blinkAt(this.eyes, t, this.ph);
  }
}

/** the whole population: grizzled sounders with piglets, a lone silver tusker, ginger and spotted feral pigs */
export function spawnBoars(ctx) {
  const homes = [{ x: -30, z: 20 }, { x: 25, z: 45 }, { x: -55, z: 70 }, { x: 40, z: 5 }];
  const out = []; let id = 0;
  const add = (home, opts) => { const b = new Boar(home, id++, opts, ctx); out.push(b); return b; };
  // a grizzled sounder by the old camp: sow, yearling and three piglets, plus a boar nearby
  let sow = add(homes[0], { kind: 'wild', sex: 'Female' });
  add(homes[0], { kind: 'yearling', sex: 'Male', leader: sow });
  for (let k = 0; k < 3; k++) add(homes[0], { kind: 'piglet', leader: sow });
  add(homes[0], { kind: 'wild', sex: 'Male' });
  // ginger boars on the north-east flank, a mother with two piglets
  sow = add(homes[1], { kind: 'ginger', sex: 'Female' });
  add(homes[1], { kind: 'ginger', sex: 'Male' });
  for (let k = 0; k < 2; k++) add(homes[1], { kind: 'piglet', leader: sow });
  // the western sounder, and the silver tusker who patrols its edge alone
  sow = add(homes[2], { kind: 'wild', sex: 'Female' });
  add(homes[2], { kind: 'yearling', sex: 'Female', leader: sow });
  for (let k = 0; k < 3; k++) add(homes[2], { kind: 'piglet', leader: sow });
  add({ x: homes[2].x + 18, z: homes[2].z - 14 }, { kind: 'tusker', sex: 'Male' });
  // spotted feral pigs near the temple
  sow = add(homes[3], { kind: 'spotted', sex: 'Female' });
  add(homes[3], { kind: 'spotted', sex: 'Male' });
  for (let k = 0; k < 2; k++) add(homes[3], { kind: 'piglet', leader: sow });
  return out;
}
