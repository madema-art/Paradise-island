// Barn owls: they roost in tall palm crowns by day and hunt the lowlands at night, flying low and slowly on silent wings, quartering over open ground
// and the forest edge. An owl hovers over a rat it has heard, drops on it feet first, and if it connects, carries it to a palm to swallow it whole.
// Each owl takes about three rats a night, then goes home; at dawn they are all back on their roosts.
import * as THREE from 'three';
import { env, events } from './core.js';
import { fauna, register } from './fauna_common.js';
import { getHeight, VOL, lavaDist } from './world.js';
import { makeOwlModel } from './owl_model.js';
import { eco } from './ecology.js';
import { rnd, rr, damp, clamp, lerp, angDiff, mulberry32, TAU } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const FED = 3;                                           // rats an owl takes before she goes home for the night

/** the same wing beat the other birds use: shoulders flap about the forward axis, the hands trail */
function flap(b, phase, amp, glide = 0, fold = 0) {
  for (const w of b.wings) {
    const f = Math.sin(phase) * amp;
    w.sh.rotation.z = lerp(w.sg * (f + 0.08 + glide * 0.12), w.sg * -0.75, fold);
    w.el.rotation.z = lerp(w.sg * (Math.sin(phase - 0.9) * amp * 0.75 - 0.05), w.sg * 1.2, fold);
  }
}

export class BarnOwl {
  constructor(i, roost, perches, rng) {
    this.i = i; this.model = makeOwlModel(); this.perches = perches;
    this.group = new THREE.Group(); this.group.add(this.model.root); this.group.scale.setScalar(1.0); fauna.add(this.group);
    this.roost = roost.clone(); this.pos = roost.clone(); this.vel = V(); this.heading = rng() * TAU; this.pitch = 0; this.bank = 0;
    this.mode = 'roost'; this.t = 0; this.fed = 0; this.catches = 0; this.prey = null; this.way = V(); this.cool = 0; this.scanT = 0;
    this.wake = 18.3 + i * 0.6; this.ph = rng() * 6; this.upright = 1; this.perch = this.roost.clone(); this.after = 'roost';
    this.group.position.copy(this.pos);
    register({
      id: 'owl' + i, name: 'Barn owl', cat: 'Birds', group: this.group, sim: this, viewDist: 3.4, pickR: 1.1, pickY: 0,
      desc: 'A barn owl of the palm crowns. She sleeps by day and hunts the lowlands at night, hovering over a rustle in the leaf litter and dropping on it feet first.',
    });
  }
  hunting() { return this.mode === 'hunt' || this.mode === 'hover' || this.mode === 'strike'; }
  /** where a captured rat hangs: in the talons */
  heldPos(out) { return out.set(this.pos.x + Math.sin(this.heading) * 0.06, this.pos.y - 0.22, this.pos.z + Math.cos(this.heading) * 0.06); }

  /** perched upright with the head free to turn */
  sit(dt, t, calm) {
    const m = this.model;
    this.upright = damp(this.upright, 1, 5, dt);
    m.body.rotation.x = damp(m.body.rotation.x, -1.15 * this.upright, 6, dt);
    m.legs.forEach((l) => { l.rotation.x = damp(l.rotation.x, 0.9 * this.upright, 6, dt); l.knee.rotation.x = damp(l.knee.rotation.x, 0, 6, dt); });
    flap(m, 0, 0, 0, 1);                                              // wings folded
    m.tail.rotation.x = damp(m.tail.rotation.x, 0.2, 5, dt);
    // a sleeper tucks its face; an awake owl turns its head right round, and bobs it to judge a sound
    const awake = !calm;
    const turn = awake ? Math.sin(t * 0.55 + this.i * 2) * 1.9 + Math.sin(t * 2.3) * 0.12 : Math.sin(t * 0.07 + this.i) * 0.4;
    m.hd.rotation.y = damp(m.hd.rotation.y, turn, 3, dt);
    m.hd.rotation.x = damp(m.hd.rotation.x, (awake ? 1.15 : 1.3) + (awake ? 0.12 * Math.sin(t * 3.1) : 0), 5, dt);       // cancel the body's upright pitch (and look level, or down when asleep)
    this.group.position.set(this.pos.x, this.pos.y + 0.2, this.pos.z);
    this.group.rotation.set(0, this.heading, 0);
  }

  nearestPerch(from) {
    let best = null, bd = 1e9;
    for (const p of this.perches) { const d = Math.hypot(p.x - from.x, p.z - from.z); if (d < bd && d > 4) { bd = d; best = p; } }
    return best || this.roost;
  }

  /** fly toward a point; the velocity eases, so turns are wide and soft */
  steer(dt, tx, ty, tz, speed, gain = 1.6) {
    const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z, d = Math.hypot(dx, dy, dz) || 1e-6;
    const v = Math.min(speed, d * 1.4) / d, a = 1 - Math.exp(-gain * dt);
    this.vel.x += (dx * v - this.vel.x) * a; this.vel.y += (dy * v - this.vel.y) * a; this.vel.z += (dz * v - this.vel.z) * a;
    this.pos.addScaledVector(this.vel, dt);
  }
  /** a safe height over the ground and the crater */
  clearGround() {
    const g = getHeight(this.pos.x, this.pos.z);
    if (this.pos.y < g + 0.35 && this.mode !== 'strike' && this.mode !== 'land') { this.pos.y = g + 0.35; this.vel.y = Math.max(0, this.vel.y); }
    const cx = this.pos.x - VOL.x, cz = this.pos.z - VOL.z, cd = Math.hypot(cx, cz);
    if (cd < 50) { this.vel.x += (cx / cd) * (50 - cd) * 0.1; this.vel.z += (cz / cd) * (50 - cd) * 0.1; }
  }
  /** heading, pitch and bank follow the velocity */
  face(dt, t, flapAmp, glide) {
    const m = this.model, hz = Math.hypot(this.vel.x, this.vel.z);
    if (hz > 0.4) {
      const d = angDiff(this.heading, Math.atan2(this.vel.x, this.vel.z));
      this.bank = damp(this.bank, clamp(-d * 1.1, -0.5, 0.5), 3.5, dt);
      this.heading += d * Math.min(1, dt * 3.5);
    }
    this.pitch = damp(this.pitch, -Math.atan2(this.vel.y, Math.max(hz, 0.6)) * 0.8, 4, dt);
    this.upright = damp(this.upright, 0, 6, dt);
    m.body.rotation.x = damp(m.body.rotation.x, 0, 6, dt);
    m.legs.forEach((l) => { l.rotation.x = damp(l.rotation.x, this.mode === 'strike' ? -1.1 : 1.3, 8, dt); l.knee.rotation.x = damp(l.knee.rotation.x, this.mode === 'strike' ? 0.1 : 0.9, 8, dt); });
    m.tail.rotation.x = damp(m.tail.rotation.x, this.mode === 'strike' ? 0.5 : -0.05, 5, dt);
    this.ph += dt * (3.2 + flapAmp * 2.2);
    flap(m, this.ph, flapAmp, glide, 0);
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.pitch, this.heading, this.bank, 'YXZ');
    m.hd.rotation.x = damp(m.hd.rotation.x, 0, 5, dt);
  }
  /** the head swings round to hold the target while the body flies on */
  lookAt(dt, tx, tz) {
    const rel = angDiff(this.heading, Math.atan2(tx - this.pos.x, tz - this.pos.z));
    this.model.hd.rotation.y = damp(this.model.hd.rotation.y, clamp(rel, -2.2, 2.2), 8, dt);
  }

  update(dt, t) {
    const h = env.tod, night = h >= 18.3 || h < 5.3, m = this.model;
    this.t += dt; this.cool -= dt;
    if (!this.hunting()) m.hd.rotation.y = damp(m.hd.rotation.y, 0, 4, dt);
    switch (this.mode) {
      case 'roost': {
        this.pos.copy(this.roost); this.sit(dt, t, true);
        if (h > 6 && h < 17) this.fed = 0;
        const awakeHours = (h >= this.wake && h < 24) || h < 5.3;
        if (awakeHours && this.fed < FED) { this.mode = 'preen'; this.t = 0; }
        break;
      }
      case 'preen': {
        this.sit(dt, t, false);
        if (this.t > rr(6, 10) || this.t > 8) { this.mode = 'takeoff'; this.t = 0; this.vel.set(Math.sin(this.heading) * 2, 3, Math.cos(this.heading) * 2); events.emit('owl', this.pos.x, this.pos.y, this.pos.z); }
        break;
      }
      case 'takeoff': {
        this.steer(dt, this.pos.x + Math.sin(this.heading) * 12, this.pos.y + 6, this.pos.z + Math.cos(this.heading) * 12, 4.5, 2);
        this.face(dt, t, 0.95, 0);
        if (this.t > 2.2) { this.mode = 'hunt'; this.t = 0; this.pickWay(); }
        break;
      }
      case 'hunt': {
        const g = getHeight(this.pos.x, this.pos.z);
        const dx = this.way.x - this.pos.x, dz = this.way.z - this.pos.z, d = Math.hypot(dx, dz);
        this.steer(dt, this.way.x, Math.max(g, 0.5) + 4.2 + Math.sin(t * 0.7 + this.i) * 0.8, this.way.z, 5.8, 1.5);
        this.clearGround();
        this.face(dt, t, 0.38 + 0.12 * Math.sin(t * 0.4), 0.7);
        if (d < 6 || this.t > 25) { this.pickWay(); this.t = 0; }
        // she listens: a rat in the open within earshot makes her hover
        this.scanT -= dt;
        if (this.scanT < 0 && this.cool < 0) {
          this.scanT = 0.35;
          const r = eco.ratNear(this.pos.x, this.pos.z, 17, (q) => !q.danger || q.danger.kind !== 'boa');
          if (r && (Math.hypot(r.x - this.pos.x, r.z - this.pos.z) < 8 || rnd() < 0.7)) { this.prey = r; this.mode = 'hover'; this.t = 0; this.hoverT = rr(0.9, 1.7); }
        }
        // after her fill, home
        if (this.fed >= FED || (!night && h > 5.6)) { this.mode = 'return'; this.t = 0; }
        break;
      }
      case 'hover': {
        const r = this.prey;
        if (!r || !r.exposed()) { this.mode = 'hunt'; this.t = 0; this.cool = 2; break; }
        const g = getHeight(r.x, r.z);
        this.steer(dt, r.x - Math.sin(this.heading) * 1.2, g + 2.6, r.z - Math.cos(this.heading) * 1.2, 5.2, 2.4);
        this.face(dt, t, 0.9, 0);
        this.lookAt(dt, r.x, r.z);
        // she holds over the rat until she is close and low, then drops
        const close = Math.hypot(r.x - this.pos.x, r.z - this.pos.z) < 2.6 && this.pos.y - g < 4.2;
        if (this.t > this.hoverT && close) { this.mode = 'strike'; this.t = 0; }
        else if (this.t > 7) { this.mode = 'hunt'; this.t = 0; this.cool = 3; }
        break;
      }
      case 'strike': {
        const r = this.prey;
        if (!r || !r.exposed()) { this.mode = 'hunt'; this.t = 0; this.cool = 2; break; }
        const g = getHeight(r.x, r.z) + 0.07;
        // a drop on the rat: down and forward, feet reaching; the speed builds
        this.steer(dt, r.x + Math.sin(r.heading || 0) * r.speed * 0.25, g + 0.12, r.z + Math.cos(r.heading || 0) * r.speed * 0.25, 7.5, 5);
        this.face(dt, t, 0.15, 0.2);
        this.lookAt(dt, r.x, r.z);
        const dist = Math.hypot(r.x - this.pos.x, g - this.pos.y, r.z - this.pos.z);
        if (dist < 0.55) {
          const fleeing = r.state === 'flee' || r.state === 'run';
          if (rnd() < (fleeing ? 0.45 : 0.85)) { r.caught(this); this.mode = 'carry'; this.t = 0; this.catches++; this.perch = this.nearestPerch(this.pos); events.emit('owl', this.pos.x, this.pos.y, this.pos.z); }
          else { this.mode = 'hunt'; this.t = 0; this.cool = 4; this.vel.y = 3; r.danger = null; }
        } else if (this.t > 2.2) { this.mode = 'hunt'; this.t = 0; this.cool = 4; this.vel.y = 3; }
        break;
      }
      case 'carry': {
        const p = this.perch;
        this.steer(dt, p.x, p.y + 4.5, p.z, 5.4, 1.5);
        this.clearGround();
        this.face(dt, t, 0.5, 0.2);
        if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 4.5) { this.mode = 'land'; this.t = 0; this.after = 'eat'; }
        break;
      }
      case 'return': {
        const p = this.roost;
        this.steer(dt, p.x, p.y + 4.5, p.z, 5.8, 1.5);
        this.clearGround();
        this.face(dt, t, 0.5, 0.4);
        if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 4.5) { this.mode = 'land'; this.t = 0; this.after = 'roost'; this.perch = this.roost; }
        break;
      }
      case 'land': {
        const p = this.perch;
        this.steer(dt, p.x, p.y + 0.22, p.z, 2.6, 3);
        this.face(dt, t, 0.9, 0);
        this.model.body.rotation.x = damp(this.model.body.rotation.x, -0.6, 5, dt);       // flare: the body rocks up to brake
        if (this.pos.distanceTo(V(p.x, p.y + 0.22, p.z)) < 0.25 || this.t > 4) {
          this.pos.set(p.x, p.y, p.z); this.vel.set(0, 0, 0); this.mode = this.after; this.t = 0;
          if (this.mode === 'roost') this.pos.copy(this.roost);
        }
        break;
      }
      case 'eat': {
        this.sit(dt, t, false);
        const r = this.prey;
        if (r && r.holder === this) { this.heldPos(r.group.position); r.x = r.group.position.x; r.z = r.group.position.z; r.group.position.y = this.pos.y + 0.0; }
        // the first seconds she mantles over the prey; then the head goes back and it goes down whole
        if (this.t > 3.2 && r && r.holder === this) { r.consume(); this.fed++; this.pos.copy(this.perch); }
        if (this.t < 3.2) this.model.hd.rotation.x = damp(this.model.hd.rotation.x, 1.15 + 0.55, 6, dt);
        else this.model.hd.rotation.x = damp(this.model.hd.rotation.x, 1.15 - 0.5 * Math.max(0, Math.sin(t * 5)), 8, dt);
        if (this.t > 7) { this.prey = null; if (this.fed >= FED || !night) { this.mode = 'return'; this.t = 0; } else { this.mode = 'takeoff'; this.t = 0; this.vel.set(Math.sin(this.heading), 3, Math.cos(this.heading)); } }
        break;
      }
      default: this.mode = 'roost';
    }
  }

  /** the next stretch of her beat: over the rats' burrows and the open ground round them */
  pickWay() {
    const b = eco.burrows.length ? eco.burrows[Math.floor(rnd() * eco.burrows.length)] : { x: this.pos.x, z: this.pos.z };
    const a = rnd() * TAU, r = rr(4, 26);
    this.way.set(b.x + Math.cos(a) * r, 0, b.z + Math.sin(a) * r);
  }
}

/** two owls, roosting in the tallest palms inland */
export function spawnOwls(ctx) {
  if (!makeOwlModel()) return [];
  const rng = mulberry32(0x0b1ac1);
  const palms = (ctx.palms || []).filter((p) => p.crown && p.y > 1.4 && Math.hypot(p.x - VOL.x, p.z - VOL.z) > 80 && lavaDist(p.x, p.z) > 30 && Math.hypot(p.x, p.z) < 130);
  const perches = palms.map((p) => p.crown.clone().add(V(0, 0.5, 0)));
  const tall = palms.slice().sort((a, b) => b.crown.y - a.crown.y).slice(0, 12);
  const roosts = [];
  for (const p of tall) { const c = p.crown.clone().add(V(0, 0.5, 0)); if (roosts.every((q) => Math.hypot(q.x - c.x, q.z - c.z) > 50)) roosts.push(c); if (roosts.length >= 2) break; }
  const owls = roosts.map((r, i) => new BarnOwl(i, r, perches, rng));
  eco.owls.push(...owls);
  return owls;
}
