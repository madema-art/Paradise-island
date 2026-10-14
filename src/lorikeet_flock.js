// Small, independently timed nectar-feeding flocks. Root translation belongs here;
// exported clips contain skeletal poses only. Game axes: +Y up, +Z forward.
import * as THREE from 'three';
import { fauna, register } from './fauna_common.js';
import { camera, env } from './core.js';
import { getHeight, VOL } from './world.js';
import { nectarSites } from './flora2.js';
import { makeLorikeetModel, lorikeetModelsReady } from './lorikeet_model.js';
import { rnd, rr, pick, clamp, damp, angDiff } from './util.js';

const AIR = new Set(['takeoff', 'fly', 'approach', 'landing']);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function safeGround(x, z) { return Math.max(env.tide, getHeight(x, z)); }
function canopyPoint(p, i) {
  // Close to the frond bases rather than hovering one metre over the crown.
  if (p.perches?.length) return p.perches[Math.floor(i * p.perches.length / 3) % p.perches.length].clone();
  const a = p.rot + i * 2.05;
  return p.crown.clone().add(V(Math.cos(a) * .35, .05, Math.sin(a) * .35));
}
class LorikeetBird {
  constructor(i, flock, anchor) {
    this.i = i; this.flock = flock; this.age = i % 4 === 3 ? 'juvenile' : 'adult';
    this.scale = (this.age === 'juvenile' ? 2.75 : 3.0) * rr(.96, 1.04);
    this.model = makeLorikeetModel(this.age, rnd(), rr(.94, 1.06));
    this.group = new THREE.Group(); this.group.add(this.model.root); this.group.scale.setScalar(this.scale); fauna.add(this.group);
    this.pos = anchor.clone(); this.vel = V(); this.heading = rr(0, Math.PI * 2); this.roll = 0; this.pitch = 0;
    this.state = 'perch'; this.elapsed = 0; this.departAt = Infinity; this.target = anchor.clone();
    this.idleTime = rr(2, 7); this.idleClip = 'Perch_Idle'; this.phase = rnd() * Math.PI * 2;
    this.feedWait = rr(1.2, 3.5); this.arrivals = 0; this.landings = 0; this.visits = 0;
    this.group.position.copy(this.pos); this.group.rotation.y = this.heading;
    this.model.play('Perch_Idle', 0); this.model.update(0);
    register({ id: 'lorikeet' + i, name: 'Rainbow lorikeet', cat: 'Birds', group: this.group, sim: this, viewDist: 3.5,
      desc: 'A fast, social nectar-feeding parrot. Loose flocks visit flowers, rest in the canopy, and depart in staggered bursts.', pickR: .34, pickY: .15 });
  }
  enter(state) { this.state = state; this.elapsed = 0; }
  update(dt, t, snapshot) {
    this.elapsed += dt;
    if (!AIR.has(this.state)) {
      if (t >= this.departAt) {
        this.enter('takeoff'); this.model.play('Perch_Takeoff', .08);
        this.heading = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
      } else {
        this.vel.set(0, 0, 0); this.pitch = damp(this.pitch, 0, 6, dt); this.roll = damp(this.roll, 0, 6, dt);
        if (this.flock.destination === 'nectar' && this.departAt === Infinity && this.elapsed > this.feedWait) {
          this.state = 'feed'; this.model.play('Feed_Nectar');
        } else {
          this.idleTime -= dt;
          if (this.idleTime <= 0) { this.idleClip = pick(['Perch_Idle', 'Perch_Alert', 'Perch_Balance', 'Perch_Preen', 'Perch_Adjust']); this.idleTime = rr(2, 6); }
          this.model.play(this.idleClip);
        }
      }
    }
    if (AIR.has(this.state)) this.fly(dt, t, snapshot);
    this.group.position.copy(this.pos); this.group.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
    this.model.update(dt);
  }
  fly(dt, t, snapshot) {
    const d = this.pos.distanceTo(this.target), horizontal = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
    const approach = this.state === 'approach' || this.state === 'landing';
    if (this.state === 'takeoff' && this.elapsed >= .8) { this.enter('fly'); this.model.play('Flight_Powered'); }
    if (this.state === 'fly' && horizontal < 10) { this.enter('approach'); this.model.play('Flight_Brake'); }
    if (this.state === 'approach' && d < 1.1) { this.enter('landing'); this.model.play('Perch_Landing'); }
    const desired = this.target.clone().sub(this.pos);
    if (!approach && this.state !== 'landing') {
      const ahead = this.pos.clone().addScaledVector(this.vel, .8);
      // Follow local canopy with a sampled terrain lookahead; avoid the active crater.
      const nearest = this.flock.nearestPalm(this.pos);
      const canopy = nearest ? nearest.crown.y + 2.4 : safeGround(this.pos.x, this.pos.z) + 10;
      const cruise = Math.max(canopy, safeGround(ahead.x, ahead.z) + 4, safeGround(this.pos.x, this.pos.z) + 4);
      const blend = clamp(horizontal / 22, 0, 1);
      desired.y = (this.target.y * (1 - blend) + cruise * blend) - this.pos.y;
      desired.normalize().multiplyScalar(10.5);
      const centre = V(), align = V(), separate = V(); let count = 0;
      for (const other of snapshot) {
        if (other.i === this.i || !AIR.has(other.state)) continue;
        const delta = this.pos.clone().sub(other.pos), dist = delta.length();
        if (dist < 22) { centre.add(other.pos); align.add(other.vel); count++; }
        if (dist < 2.0 && dist > .001) separate.addScaledVector(delta, (2 - dist) / (dist * dist));
      }
      if (count) {
        desired.addScaledVector(centre.multiplyScalar(1 / count).sub(this.pos), .22);
        desired.addScaledVector(align.multiplyScalar(1 / count).sub(this.vel), .24);
      }
      desired.addScaledVector(separate, 4.5);
      // The leader attracts nearby followers, but never assigns rigid formation slots.
      const leader = snapshot[this.flock.leader];
      if (leader && leader.i !== this.i && AIR.has(leader.state) && leader.pos.distanceTo(this.pos) < 25)
        desired.addScaledVector(leader.pos.clone().sub(this.pos), .08);
      desired.x += .35 * Math.sin(t * 1.2 + this.phase); desired.z += .35 * Math.cos(t * .9 + this.phase);
      const crater = V(this.pos.x - VOL.x, 0, this.pos.z - VOL.z), cd = crater.length();
      if (cd < 38) desired.addScaledVector(crater.normalize(), (38 - cd) * 1.4);
      desired.clampLength(0, 12); desired.y = clamp(desired.y, -4.5, 6);
      if (this.state === 'takeoff') { desired.multiplyScalar(clamp(this.elapsed / .65, .1, 1)); desired.y = Math.max(desired.y, 3.2); }
    } else {
      // Proportional braking converges to each bird's own occupied perch, with no overshoot or snap.
      desired.multiplyScalar(1.8).clampLength(0, 6);
      for (const other of snapshot) {
        if (other.i === this.i) continue;
        const delta = this.pos.clone().sub(other.pos), dist = delta.length();
        if (dist > .001 && dist < .65)
          desired.addScaledVector(delta, (.65 - dist) * 12 / dist);
      }
    }
    const before = this.heading;
    this.vel.lerp(desired, 1 - Math.exp(-dt * (approach || this.state === 'landing' ? 7 : 2.8)));
    const step = this.vel.clone().multiplyScalar(dt);
    this.pos.add(step);
    const floor = safeGround(this.pos.x, this.pos.z) + .35;
    if (this.pos.y < floor) { this.pos.y = floor; this.vel.y = Math.max(this.vel.y, 1); }
    if (this.vel.length() > .08) {
      const angle = Math.atan2(this.vel.x, this.vel.z);
      this.heading += clamp(angDiff(this.heading, angle), -dt * 3, dt * 3);
    }
    this.roll = damp(this.roll, clamp(-angDiff(before, this.heading) / dt * .16, -.55, .55), 5, dt);
    // Perched model is upright. Rotate the flight wrapper into the streamlined flight attitude.
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const flightPitch = 1.25 - Math.atan2(this.vel.y, Math.max(.1, speed));
    const posePitch = this.state === 'landing' ? 1.25 * clamp(d / 1.1, 0, 1) : flightPitch;
    this.pitch = damp(this.pitch, posePitch, 6, dt);
    if (this.state === 'fly') {
      const glide = Math.sin(t * .8 + this.phase) > .93;
      if (Math.abs(this.roll) > .16) this.model.play('Flight_Bank');
      else if (glide) this.model.play('Flight_Glide');
      else if (this.model.clip === 'Flight_Glide') { this.glideEnd = t + .6; this.model.play('Flight_GlideToFlap'); }
      else if (!this.glideEnd || t > this.glideEnd) this.model.play('Flight_Powered');
    }
    if (this.state === 'landing' && d < .035 && this.vel.length() < .15 && this.elapsed > .8) {
      this.pos.copy(this.target); this.vel.set(0, 0, 0); this.enter('perch'); this.landings++; this.departAt = Infinity;
      this.heading = this.targetHeading ?? this.heading; this.idleClip = 'Perch_Idle';
      if (this.flock.destination === 'nectar') this.visits++;
      this.model.play('Perch_Idle');
    }
    this.speed = this.vel.length();
  }
}
export class LorikeetFlock {
  constructor(id, palms, start, count = 3) {
    this.id = id; this.palms = palms; this.members = []; this.destination = 'canopy'; this.leader = 0;
    this.site = start; this.rest = rr(5, 10); this.travelTime = 0; this.cycle = 0;
    for (let j = 0; j < count; j++) {
      if (!lorikeetModelsReady()) break;
      this.members.push(new LorikeetBird(id * 3 + j, this, canopyPoint(start, j)));
    }
  }
  nearestPalm(pos) {
    let nearest = null, best = Infinity;
    for (const p of this.palms) { const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2; if (d < best) { best = d; nearest = p; } }
    return nearest;
  }
  depart(t, requested = null) {
    if (!this.members.length) return;
    const centre = this.members[0].pos;
    let kind = requested || (this.destination === 'canopy' && nectarSites.length ? 'nectar' : 'canopy');
    const candidates = (kind === 'nectar' ? nectarSites : this.palms).filter(p => {
      const pos = p.position || p.crown, d = pos.distanceTo(centre);
      return d > 12 && d < 140 && Math.hypot(pos.x - VOL.x, pos.z - VOL.z) > 40;
    });
    if (!candidates.length) { this.rest = 5; return; }
    this.site = pick(candidates); this.destination = kind; this.leader = (this.leader + 1) % this.members.length;
    this.travelTime = 0; this.cycle++;
    this.members.forEach((m, j) => {
      if (kind === 'nectar') {
        const flower = this.site.flowers[j % this.site.flowers.length];
        const dir = flower.direction.clone(); dir.y = 0; if (dir.lengthSq() < .01) dir.set(0, 0, 1); dir.normalize();
        m.targetHeading = Math.atan2(-dir.x, -dir.z);
        // Contact calibrated from the exported Feed_Nectar skin at its neutral feeding frame.
        m.target.copy(flower.perch);
        m.target.y = Math.max(m.target.y, safeGround(m.target.x, m.target.z) + .4);
      } else { m.target.copy(canopyPoint(this.site, j)); m.targetHeading = this.site.rot + j * 2.05; }
      m.departAt = t + (j === this.leader ? 0 : .25 + rnd() * 1.2); m.feedWait = rr(1.2, 3.5);
    });
    this.rest = kind === 'nectar' ? rr(12, 20) : rr(10, 20);
  }
  update(dt, t) {
    this.now = t;
    if (!this.members.length) return;
    const settled = this.members.every(m => !AIR.has(m.state) && m.departAt === Infinity);
    if (settled) {
      this.rest -= dt;
      const flush = this.members.some(m => m.pos.distanceTo(camera.position) < 2.2);
      if (this.rest <= 0 || flush) this.depart(t, flush ? 'canopy' : null);
    } else {
      this.travelTime += dt;
      // Recover to a reachable canopy destination rather than orbiting a missed landing indefinitely.
      if (this.travelTime > 55) this.depart(t, 'canopy');
    }
    const snapshot = this.members.map(m => ({ i: m.i, state: m.state, pos: m.pos.clone(), vel: m.vel.clone() }));
    for (const m of this.members) m.update(dt, t, snapshot);
  }
}
