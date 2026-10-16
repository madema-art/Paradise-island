// Island rats (Polynesian rats): small, quick, mostly nocturnal rodents that live in burrows at the foot of palms and forage for fallen seeds and fruit.
// By day they stay down, at dusk and dawn they come out cautiously, and at night they are bold. They freeze under an owl, bolt from a boa, a boar or a
// person, and every predator on the island lives off them: a rat that is caught is held by its captor until eaten, then a new one is born in the burrow.
import * as THREE from 'three';
import { camera, wildlife } from './core.js';
import { fauna, register, orient, canStand, nearestPerson } from './fauna_common.js';
import { getHeight, riverDist, VOL, lavaDist } from './world.js';
import { makeRatModel } from './rat_model.js';
import { eco } from './ecology.js';
import { rnd, rr, pick, damp, clamp, lerp, mulberry32, TAU } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** how bold they are: full at night, cautious at dusk and dawn, mostly under cover by day */
const boldness = (h) => (h >= 19.6 || h < 5.0 ? 1 : (h >= 17.5 && h < 19.6) || (h >= 5.0 && h < 7.0) ? 0.6 : 0.08);
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const turn = (cur, target, max) => cur + clamp(wrap(target - cur), -max, max);

export class IslandRat {
  constructor(i, burrow, rng) {
    this.i = i; this.burrow = burrow; this.model = makeRatModel();
    this.group = new THREE.Group(); this.group.add(this.model.root); fauna.add(this.group);
    this.group.scale.setScalar(0.85 + rng() * 0.3);
    this.x = burrow.x; this.z = burrow.z; this.heading = rng() * TAU; this.speed = 0; this.ph = rng() * 6;
    this.state = 'hidden'; this.t = 4 + rng() * 25; this.holder = null; this.alive = true; this.eaten = 0;
    this.tx = this.x; this.tz = this.z; this.pose = { sit: 0, groom: 0, crouch: 0, alert: 0, limp: 0 };
    this.sniffT = rr(1, 3); this.lookY = 0; this.lookT = 0; this.danger = null; this.scanT = rnd() * 0.3;
    this.pauseT = 0; this.dashT = rr(0.4, 1); this.listen = false; this.panic = false; this.transit = null; this.curious = 0; this.lastDanger = null;
    this.group.visible = false;
    register({
      id: 'rat' + i, name: 'Island rat', cat: 'Mammals', group: this.group, sim: this, viewDist: 1.6, pickR: 0.5, pickY: 0.05,
      desc: 'A small, quick Polynesian rat that lives in burrows at the foot of the palms and comes out at night for fallen seeds and fruit. Every predator on the island eats them.',
    });
  }

  /** the Field Guide has picked this rat: a hidden one takes a short, cautious look out, whatever the hour (a nudge, not an override: danger and
   *  the night still decide the rest) */
  observed() {
    if (this.state === 'hidden' && this.alive) { this.t = Math.min(this.t, rr(0.4, 1.6)); this.curious = 40; }
  }

  /** what the Field Guide shows: the state, with a pause to listen told apart */
  get doing() { return this.pauseT > 0 && this.listen && this.state === 'forage' ? 'listen' : this.state; }

  /** out in the open and catchable */
  exposed() { return this.alive && !this.holder && this.state !== 'hidden' && this.state !== 'dead'; }

  /** a predator takes it: it hangs limp from the holder (an object with heldPos(out)) until eaten */
  caught(by) {
    this.holder = by; this.state = 'caught'; this.pose.limp = 1; this.group.visible = true;
  }
  /** eaten or cooked: gone until a new rat is born in the burrow */
  consume() {
    this.holder = null; this.alive = false; this.state = 'dead'; this.group.visible = false; this.t = rr(70, 140); this.eaten++;
  }
  /** killed on the spot (a boar, say): same as eaten */
  die() { this.consume(); }

  hide() { this.state = 'hidden'; this.group.visible = false; this.t = rr(10, 30) / Math.max(0.15, boldness(wildlife.tod)); this.speed = 0; }

  /** what is near enough to worry about: a person, a boa, a boar or an owl overhead */
  scan() {
    let danger = null, dd = 99;
    const who = nearestPerson(this.x, this.z, this.group.position.y, 3);
    const near = who.cast ? (eco.stalking ? 1.7 : 7) : 5.5;
    if (who.d < near) { danger = { kind: 'person', x: who.x, z: who.z }; dd = who.d; }
    for (const b of eco.boas) {
      if (!b.awake()) continue;
      const d = Math.hypot(b.x - this.x, b.z - this.z);
      if (d < 3.2 && d < dd) { danger = { kind: 'boa', x: b.x, z: b.z }; dd = d; }
    }
    for (const o of eco.owls) {
      if (!o.hunting()) continue;
      const d = Math.hypot(o.pos.x - this.x, o.pos.z - this.z);
      if (d < 14 && o.pos.y - this.group.position.y < 14 && d < dd + 8) { danger = { kind: 'owl', x: o.pos.x, z: o.pos.z, d }; dd = Math.min(dd, d); }
    }
    this.danger = danger;
  }

  /** run for the nearest burrow */
  flee(from) {
    this.state = 'flee'; this.t = 0; this.panic = false; this.transit = null;
    let best = this.burrow, bd = Math.hypot(this.burrow.x - this.x, this.burrow.z - this.z);
    for (const b of eco.burrows) { const d = Math.hypot(b.x - this.x, b.z - this.z); if (d < bd) { bd = d; best = b; } }
    this.fleeTo = best; this.tx = best.x; this.tz = best.z;
    if (from) { const away = Math.atan2(this.x - from.x, this.z - from.z); if (Math.abs(wrap(Math.atan2(best.x - this.x, best.z - this.z) - away)) > 2.2) this.heading = away; }
  }

  /** a different burrow within reach to run across to (cover points the rat knows); sets the run target */
  otherBurrow() {
    let best = null, bd = 70;
    for (const b of eco.burrows) { if (b === this.burrow) continue; const d = Math.hypot(b.x - this.x, b.z - this.z); if (d < bd && d > 12) { bd = d; best = b; } }
    if (!best) return false;
    this.transit = best; this.tx = best.x; this.tz = best.z; return true;
  }

  forageTarget() {
    // seeds and fallen fruit lie round the foot of the palms; the burrow is home, so they stay within about 20 m of it
    for (let k = 0; k < 14; k++) {
      const a = rnd() * TAU, r = rr(2, 20), x = this.burrow.x + Math.cos(a) * r, z = this.burrow.z + Math.sin(a) * r;
      if (canStand(x, z, { minH: 1.2, river: 1.2 })) { this.tx = x; this.tz = z; return true; }
    }
    this.tx = this.burrow.x + rr(-3, 3); this.tz = this.burrow.z + rr(-3, 3);
    return false;
  }

  update(dt, t) {
    const P = this.pose, m = this.model;
    if (this.state === 'dead') {
      this.t -= dt;
      if (this.t < 0) { this.alive = true; this.state = 'hidden'; this.t = rr(5, 20); this.x = this.burrow.x; this.z = this.burrow.z; }
      return;
    }
    if (this.state === 'caught') {
      if (!this.holder) { this.state = 'flee'; return; }
      this.holder.heldPos(this.group.position);
      this.group.rotation.set(0.3 * Math.sin(t * 3 + this.i), this.holder.heading || 0, 1.2, 'YXZ');
      this.x = this.group.position.x; this.z = this.group.position.z;
      this.limbs(dt, t, 0, true);
      return;
    }
    const bold = boldness(wildlife.tod);
    this.t -= dt; this.curious -= dt;
    this.scanT -= dt;
    if (this.scanT < 0 && this.state !== 'hidden') { this.scanT = 0.25; this.scan(); }
    const dg = this.danger;
    if (this.state === 'hidden') {
      this.group.visible = false;
      if (this.t < 0) {
        if (rnd() < bold) { this.state = 'emerge'; this.t = rr(1.2, 2.6); this.group.visible = true; this.x = this.burrow.x; this.z = this.burrow.z; this.heading = rnd() * TAU; }
        else this.t = rr(8, 25);
      }
      return;
    }
    // danger takes priority over whatever it is doing
    if (dg && this.state !== 'flee' && this.state !== 'emerge' && this.state !== 'freeze') {
      this.lastDanger = dg;
      if (dg.kind === 'owl' && rnd() < 0.55) { this.state = 'freeze'; this.t = rr(0.8, 2.2); this.panic = false; }
      else if (dg.kind !== 'owl' && this.speed < 0.6 && dg.d !== 0 && rnd() < 0.7) { this.state = 'freeze'; this.t = rr(0.3, 0.7); this.panic = true; }       // a start, then the sprint
      else this.flee(dg);
    }
    let moving = false, spd = 0;
    const toT = Math.atan2(this.tx - this.x, this.tz - this.z), dT = Math.hypot(this.tx - this.x, this.tz - this.z);
    switch (this.state) {
      case 'emerge': {
        this.speed = damp(this.speed, 0, 6, dt); P.alert = damp(P.alert, 1, 6, dt);
        if (this.t < 0) { P.alert = 0; if (bold < 0.3 && this.curious <= 0 && rnd() < 0.7) this.hide(); else { this.forageTarget(); this.state = 'forage'; } }
        break;
      }
      case 'freeze': {
        this.speed = damp(this.speed, 0, 12, dt); P.crouch = damp(P.crouch, 1, 8, dt);
        if (this.t < 0 || !dg) { P.crouch = 0; if (dg || this.panic) this.flee(dg || this.lastDanger); else { this.state = 'forage'; this.pauseT = 0.3; } }
        break;
      }
      case 'forage': case 'run': {
        const isRun = this.state === 'run';
        this.heading = turn(this.heading, toT, dt * (isRun ? 7 : 6));
        // now and then it stops to sniff
        this.sniffT -= dt;
        if (this.state === 'forage' && this.sniffT < 0) { this.state = 'sniff'; this.t = rr(0.6, 1.8); break; }
        // quick and nervous: a dash of about a second, then a stop to listen (sitting up now and then), then off again
        let sp = 2.6;
        if (!isRun) {
          if (this.pauseT > 0) { this.pauseT -= dt; sp = 0; if (this.pauseT <= 0) this.dashT = rr(0.5, 1.2); }
          else { this.dashT -= dt; sp = 1.4 + 1.0 * bold; if (this.dashT <= 0) { this.pauseT = rr(0.35, 1.3); this.listen = rnd() < 0.55; this.lookT = 0; } }
        }
        this.speed = damp(this.speed, sp, isRun ? 6 : 14, dt); moving = this.speed > 0.05; spd = this.speed;
        const nx = this.x + Math.sin(this.heading) * this.speed * dt, nz = this.z + Math.cos(this.heading) * this.speed * dt;
        if (canStand(nx, nz, { minH: 0.8, river: 0.6 })) { this.x = nx; this.z = nz; } else { this.heading += rr(1.2, 2.4); }
        if (dT < 0.4) {
          if (isRun) {
            if (this.transit) { this.burrow = this.transit; this.transit = null; this.forageTarget(); this.state = 'forage'; break; }     // it has a new home
            this.hide(); break;
          }
          const r = rnd();
          if (bold < 0.25 && this.curious <= 0) { this.tx = this.burrow.x; this.tz = this.burrow.z; this.state = 'run'; }
          else if (r < 0.4) { this.state = 'eat'; this.t = rr(3, 6); }
          else if (r < 0.52) { this.state = 'groom'; this.t = rr(2.5, 5); }
          else if (r < 0.62 && this.otherBurrow()) { this.state = 'run'; }                                       // across to another cover point
          else { this.forageTarget(); this.state = rnd() < 0.3 ? 'run' : 'forage'; }
        }
        break;
      }
      case 'sniff': {
        this.speed = damp(this.speed, 0, 9, dt);
        if (this.t < 0) { this.sniffT = rr(2, 6); this.state = 'forage'; }
        break;
      }
      case 'eat': case 'groom': {
        this.speed = damp(this.speed, 0, 9, dt);
        P.sit = damp(P.sit, 1, 5, dt);
        if (this.state === 'groom') P.groom = damp(P.groom, 1, 6, dt); else P.groom = damp(P.groom, 0, 6, dt);
        if (this.t < 0) { P.sit = 0; P.groom = 0; if (bold < 0.25 && this.curious <= 0) { this.tx = this.burrow.x; this.tz = this.burrow.z; this.state = 'run'; } else { this.forageTarget(); this.state = 'forage'; } }
        break;
      }
      case 'flee': {
        const best = this.fleeTo || this.burrow;
        this.tx = best.x; this.tz = best.z;
        this.heading = turn(this.heading, Math.atan2(this.tx - this.x, this.tz - this.z), dt * 9);
        this.speed = damp(this.speed, 3.4, 8, dt); moving = true; spd = this.speed;
        P.sit = damp(P.sit, 0, 8, dt);
        this.x += Math.sin(this.heading) * this.speed * dt; this.z += Math.cos(this.heading) * this.speed * dt;
        if (Math.hypot(this.tx - this.x, this.tz - this.z) < 0.5) this.hide();
        break;
      }
      default: this.state = 'forage';
    }
    const listening = this.pauseT > 0 && this.listen && this.state === 'forage';
    if (this.state !== 'eat' && this.state !== 'groom') { P.sit = damp(P.sit, listening ? 0.5 : 0, 7, dt); P.groom = damp(P.groom, 0, 7, dt); }
    if (this.state !== 'freeze') P.crouch = damp(P.crouch, 0, 6, dt);
    if (this.state !== 'emerge') P.alert = damp(P.alert, listening ? 1 : this.state === 'sniff' ? 0.6 : 0, 8, dt);
    P.limp = 0;
    this.group.visible = true;
    orient(this.group, this.x, this.z, this.heading, 0.08, 0.05);
    this.limbs(dt, t, moving ? spd : 0, false);
  }

  /** legs, body, head, ears and tail */
  limbs(dt, t, spd, limp) {
    const m = this.model, P = this.pose;
    this.ph += dt * (7 + spd * 6) * (spd > 0.05 ? 1 : 0);
    const amp = clamp(0.25 + spd * 0.28, 0, 0.85), ph = this.ph;
    const sit = P.sit, hind = [0, 1, 0, 1];
    const off = [0, Math.PI, Math.PI, 0];                                         // diagonal pairs: front-left with rear-right
    m.legs.forEach((h, k) => {
      const s = Math.sin(ph + off[k]);
      const front = k < 2;
      let swing = s * amp * (spd > 0.05 ? 1 : 0), bend = spd > 0.05 ? 0.2 + 0.9 * Math.max(0, Math.sin(ph + off[k] + 1.3)) * Math.min(1, spd * 0.6 + 0.3) : 0.12;
      if (front) { swing = lerp(swing, 1.15 + (P.groom ? 0.35 * Math.sin(t * 16 + k * 3) * P.groom : 0), sit); bend = lerp(bend, 1.4, sit); }
      else { swing = lerp(swing, -0.45, sit); bend = lerp(bend, 1.0, sit); }
      if (limp) { swing = 0.5 * Math.sin(t * 2 + k); bend = 0.6; }
      h.rotation.x = damp(h.rotation.x, swing + (P.crouch ? 0.15 * P.crouch * (front ? 1 : -1) : 0), 18, dt);
      h.knee.rotation.x = damp(h.knee.rotation.x, bend + P.crouch * 0.4, 18, dt);
    });
    // the body arches in a gallop, rears up to sit and eat, and goes flat in a crouch
    m.body.rotation.x = damp(m.body.rotation.x, -0.95 * sit + (spd > 1.5 ? Math.sin(ph * 2) * 0.07 : 0) + P.crouch * 0.1, 10, dt);
    m.body.position.y = m.bodyY + (spd > 0.05 ? Math.abs(Math.sin(ph)) * 0.003 * Math.min(1.5, spd) : 0) - P.crouch * 0.012;
    // head: a restless nose, a glance now and then; down to the paws when eating
    this.sniffPh = (this.sniffPh || 0) + dt * (this.state === 'sniff' || this.state === 'forage' || this.state === 'emerge' ? 18 : 6);
    this.lookT -= dt; if (this.lookT < 0) { this.lookT = rr(0.8, 3); this.lookY = rr(-0.7, 0.7) * (limp ? 0 : 1); }
    const eat = this.state === 'eat' ? 1 : 0;
    m.head.rotation.x = damp(m.head.rotation.x, (0.1 * Math.sin(this.sniffPh) * (1 - eat * 0.5)) + sit * 0.55 + eat * 0.18 * Math.sin(t * 24) + (limp ? 0.5 : 0) - P.alert * 0.2, 12, dt);
    m.head.rotation.y = damp(m.head.rotation.y, this.lookY * (this.state === 'sniff' ? 1 : 0.5), 5, dt);
    m.ears.forEach((e, k) => { e.rotation.y = damp(e.rotation.y, (k ? 1 : -1) * (-0.25 * P.alert + 0.12 * Math.sin(t * 2.3 + k * 2)) + (this.danger ? (k ? -0.2 : 0.2) : 0), 12, dt); });
    // the tail: a flexible swish; held up and out when it runs
    const run = clamp(spd * 0.4, 0, 1);
    m.tail.forEach((s, k) => {
      s.rotation.y = Math.sin(t * (2 + run * 5) + k * 0.9 + this.i) * (0.14 + 0.1 * run) * (limp ? 0.2 : 1);
      s.rotation.x = k === 0 ? -0.15 - run * 0.2 + sit * 0.3 : -0.05 * run;
    });
  }
}

/** a burrow: a dark mouth in a little heap of earth at the foot of a palm */
function burrowMesh(list) {
  const earth = new THREE.MeshStandardMaterial({ color: 0x4a3724, roughness: 1, flatShading: true });
  const hole = new THREE.MeshBasicMaterial({ color: 0x0a0705 });
  const g = new THREE.Group();
  for (const b of list) {
    const y = getHeight(b.x, b.z);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), earth);
    mound.scale.set(0.22, 0.06, 0.2); mound.position.set(b.x, y + 0.01, b.z); mound.castShadow = false;
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), hole);
    mouth.rotation.x = -Math.PI / 2; mouth.position.set(b.x, y + 0.062, b.z);
    g.add(mound, mouth);
  }
  fauna.add(g);
  return g;
}

/** burrows under palms across the lowland and forest edge (placement uses its own generator: the world's random stream is untouched) */
export function spawnRats(ctx, camp) {
  if (!makeRatModel()) return [];
  const rng = mulberry32(0x7a7a11);
  const palms = (ctx.palms || []).filter((p) => p.y > 1.4 && p.y < 9 && Math.hypot(p.x - VOL.x, p.z - VOL.z) > 70 && lavaDist(p.x, p.z) > 25 && riverDist(p.x, p.z) > 3);
  const spots = [];
  const take = (p) => {
    const a = rng() * TAU, x = p.x + Math.cos(a) * 1.1, z = p.z + Math.sin(a) * 1.1;
    if (canStand(x, z, { minH: 1.2, river: 1.5 }) && spots.every((s) => Math.hypot(s.x - x, s.z - z) > 18)) { spots.push({ x, z }); return true; }
    return false;
  };
  // one close to the castaway's camp, so he sees them, then the rest scattered
  if (camp) palms.slice().sort((a, b) => Math.hypot(a.x - camp.x, a.z - camp.z) - Math.hypot(b.x - camp.x, b.z - camp.z)).slice(0, 25).some((p) => Math.hypot(p.x - camp.x, p.z - camp.z) > 9 && take(p));
  for (let k = 0; k < 600 && spots.length < 8 && palms.length; k++) take(palms[Math.floor(rng() * palms.length)]);
  burrowMesh(spots);
  eco.burrows.push(...spots);
  const rats = [];
  spots.forEach((b, bi) => { for (let k = 0; k < 2; k++) { const r = new IslandRat(rats.length, b, rng); rats.push(r); } });
  eco.rats.push(...rats);
  return rats;
}
