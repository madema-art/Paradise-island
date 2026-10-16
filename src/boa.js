// Pacific boas: stout ground-and-tree snakes. By day each lies coiled under cover near the rats' burrows, or slips off to a palm, winds up the trunk and
// rests coiled just under the fronds; at dusk it uncoils and slithers out, tongue flicking to taste the air, and stalks the nearest rat. It coils its
// neck, lunges, and if it connects it throws coils round the rat, then swallows it whole: a swelling travels down the body, and the snake lies up to
// digest, with a lump in its middle that takes a day to go.
// The body is a chain of 32 joints. On the ground, slithering is a wave that stays fixed to the ground as the snake passes through it (so the body follows
// the head's track with no sideways slip), lying on the terrain. On a palm the head leads along a helix up (or down) the trunk and the body simply follows
// the head's track (a trail of points), so it winds round the trunk exactly as the head went, and nothing is placed on a branch by a jump.
import * as THREE from 'three';
import { camera, wildlife } from './core.js';
import { fauna, register, canStand, nearestPerson } from './fauna_common.js';
import { getHeight, VOL, lavaDist, riverDist, TEMPLE, falls } from './world.js';
import { makeBoaModel, BOA_SEGS } from './boa_model.js';
import { eco } from './ecology.js';
import { rnd, rr, damp, clamp, lerp, mulberry32, TAU } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const N = BOA_SEGS;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** half-width of the body at joint i (the same profile the Blender model was built from) */
const RAD = Array.from({ length: N + 1 }, (_, i) => { const f = i / N; return Math.max(0.0022, (0.0148 + (0.029 - 0.0148) * ss(0, 0.3, f)) * (1 - Math.pow(ss(0.52, 1, f), 0.85))); });

// ---- the trail the body follows on a palm: points DS apart, newest last, in a ring
const DS = 0.04, TRAIL_N = 192;
const _P = new Float32Array((N + 1) * 3);
const _t0 = V(), _t1 = V(), _ax = V(), _f = V(), _up = V(), _x = V(), _y = V(), _o = V();
const _mat = new THREE.Matrix4(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _ql = new THREE.Quaternion();

/** a palm's trunk centre at t (0 base, 1 crown), world space, no allocation: the profile makePalm (flora.js) builds, as the monkeys' climb uses it */
function trunkAt(tr, t, out) {
  tr.pv.pt(t, out);
  const c = Math.cos(tr.rot), s = Math.sin(tr.rot), x = out.x * tr.sc, z = out.z * tr.sc;
  return out.set(x * c + z * s + tr.x, out.y * tr.sc + tr.y, -x * s + z * c + tr.z);
}
const trunkR = (tr, t) => (lerp(0.4, 0.23, t) + 0.3 * Math.exp(-12 * t)) * tr.sc;

export class PacificBoa {
  constructor(i, home, rng) {
    this.i = i; this.m = makeBoaModel(); this.home = home;
    this.group = new THREE.Group(); this.group.add(this.m.root); fauna.add(this.group);
    this.x = home.x; this.z = home.z; this.heading = rng() * TAU; this.speed = 0; this.dist = rng() * 10; this.ph = rng() * 6;
    this.state = 'rest'; this.t = rr(3, 30); this.prey = null; this.cool = 0; this.fed = 0; this.scanT = 0; this.way = { x: home.x, z: home.z };
    this.yaw = new Float32Array(N); this.pit = new Float32Array(N); this.coil = 1; this.neck = 0; this.wind = 0; this.swallowP = 0; this.lump = 0; this.lumpAt = 12;
    this.jaw = 0; this.tongue = 0; this.look = 0; this.bulge = new Float32Array(N);
    // palms: the trail the body follows, and where the head is on the trunk
    this.trailOn = false; this.trail = new Float32Array(TRAIL_N * 3); this.tn = 0; this.th = 0; this.acc = 0; this.hx = home.x; this.hy = 0; this.hz = home.z;
    this.tree = null; this.theta = 0; this.rad = 0.5; this.climbDir = 1; this.turns = 0; this.out = 0; this.away = 0; this.treeNext = false; this.roam = 0; this.blockN = 0;
    this.mix = 0; this.yawT = new Float32Array(N); this.hunting = false;
    this.s = 1; this.Ls = this.m.L;                   // model units until the species size is applied (below)
    this.pose(0.016, 0);                              // coiled first, so the registry records the boa at rest
    register({
      id: 'boa' + i, name: 'Pacific boa', cat: 'Reptiles', group: this.group, sim: this, viewDist: 1.4, pickR: 0.8, pickY: 0.05,
      desc: 'A stout Pacific boa that lies coiled under cover by day, winds up palms to rest under the fronds, and slips out at night to ambush the island rats, which it swallows whole.',
    });
    this.s = this.group.scale.x || 1;                 // the species size: model units to metres
    this.Ls = this.m.L * this.s;                      // the distance between two joints, in metres
    this.bodyLen = (N - 1) * this.Ls;
  }
  awake() { return this.state === 'search' || this.state === 'stalk' || this.state === 'strike' || this.state === 'wake' || this.state === 'toTree' || this.state === 'dismount'; }
  /** the Field Guide picked this boa: a coiled one soon goes for a palm (a nudge: it still waits for night if it is due to hunt) */
  observed() { if (this.state === 'rest' || this.state === 'digest') { this.treeNext = true; this.t = Math.min(this.t, rr(1, 2.5)); } }
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

  /** a palm near home to climb: tall, on firm ground, not in a structure; chosen from a cached short list, never a scan of the island */
  pickTree() {
    if (!this.trees) {
      this.trees = (eco.palmTrees || []).filter((p) => Math.hypot(p.x - this.home.x, p.z - this.home.z) < 48).sort((a, b) => Math.hypot(a.x - this.x, a.z - this.z) - Math.hypot(b.x - this.x, b.z - this.z)).slice(0, 10);
    }
    const list = this.trees.filter((p) => Math.hypot(p.x - this.x, p.z - this.z) > 3);
    return list.length ? list[Math.floor(rnd() * Math.min(list.length, 6))] : null;
  }
  /** set off for a palm: the way point is the foot of the trunk on this side */
  goToTree() {
    const tr = this.pickTree();
    if (!tr) return false;
    this.tree = tr; this.treeNext = false; this.blockN = 0;
    const R0 = trunkR(tr, 0.04), a = Math.atan2(this.x - tr.x, this.z - tr.z);
    this.way = { x: tr.x + Math.sin(a) * (R0 + 0.14), z: tr.z + Math.cos(a) * (R0 + 0.14) };
    this.state = 'toTree'; this.t = 70;
    return true;
  }

  /** false when the ground ahead is not fit to cross */
  move(dt, speed, steer = 3) {
    const want = Math.atan2(this.way.x - this.x, this.way.z - this.z);
    const dh = wrap(want - this.heading);
    this.heading += clamp(dh, -steer * dt * 0.35, steer * dt * 0.35);        // a snake turns slowly: the head leads and the body follows
    this.speed = damp(this.speed, speed * (Math.abs(dh) > 1.2 ? 0.4 : 1), 3, dt);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt, nz = this.z + Math.cos(this.heading) * this.speed * dt;
    if (canStand(nx, nz, { minH: 1.3, river: 1.4, maxSlope: 0.55 })) { this.x = nx; this.z = nz; this.dist += this.speed * dt / this.s; return true; }
    this.heading += rr(1.4, 2.6); this.speed *= 0.3; if (this.state !== 'toTree') this.pickWay();
    return false;
  }

  update(dt, t) {
    const h = wildlife.tod, night = h >= 18.4 || h < 5.2, S = this.state;
    this.t -= dt; this.cool -= dt; this.scanT -= dt; this.ph += dt; this.roam -= dt;
    this.tongue = 0; this.jaw = damp(this.jaw, 0, 8, dt); this.neck = damp(this.neck, 0, 3, dt);
    let target = 1;                                                                    // 1 = coiled, 0 = out and moving
    switch (S) {
      case 'rest': {
        this.speed = damp(this.speed, 0, 4, dt); target = 1;
        if (this.t < 0) {
          if (night && this.fed < 2) { this.state = 'wake'; this.t = 4; }
          else if ((this.treeNext || rnd() < 0.6) && this.goToTree()) { /* off to a palm */ }
          else if (rnd() < 0.45) { this.state = 'wake'; this.t = 3; this.roam = rr(25, 50); }           // a short day outing: out, tasting the air
          else this.t = rr(12, 30);
        }
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
        const spd = S === 'stalk' ? 0.95 : 0.55;
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
        if (this.state === 'search' && this.t < 0 && !night && this.treeNext === false && rnd() < 0.5 && this.goToTree()) break;   // done roaming: up a palm
        if ((S === 'search' && (this.t < 0 || (!night && h > 5.6 && this.roam < 0))) || (!night && h > 5.8 && h < 18 && this.roam < 0)) { this.state = 'home'; this.way = { x: this.home.x, z: this.home.z }; }
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
        target = 0.1; this.move(dt, 0.6);
        this.tongue = Math.sin(t * 5) > 0.3 ? 1 : 0;
        if (Math.hypot(this.home.x - this.x, this.home.z - this.z) < 1.2) { this.state = 'rest'; this.t = rr(10, 50); this.fed = 0; }
        break;
      }
      case 'toTree': {                                                              // across the ground to the foot of a palm
        target = 0.05; this.tongue = Math.sin(t * 6) > 0.3 ? 1 : 0; this.look = Math.sin(t * 0.8 + this.i) * 0.3;
        const ok = this.move(dt, 0.7);
        if (!ok && ++this.blockN > 4) { this.state = 'rest'; this.t = rr(10, 25); this.tree = null; break; }
        const tr = this.tree;
        if (Math.hypot(this.x - tr.x, this.z - tr.z) < trunkR(tr, 0.04) + 0.3) this.beginClimb();
        else if (this.t < 0) { this.state = 'rest'; this.t = rr(10, 25); this.tree = null; }
        break;
      }
      case 'climb': case 'coil': case 'treerest': case 'descend': case 'dismount': {
        this.climbStep(dt, t, night);
        break;
      }
      default: this.state = 'rest';
    }
    if (this.state !== 'swallow' && this.state !== 'digest') this.lump = Math.max(0, this.lump - dt / 110);
    this.coil = damp(this.coil, target, 2, dt);
    this.pose(dt, t);
  }

  /* ------------------------------------------------------------ on a palm */
  /** from the ground chain as it lies now: fill the trail with it, and take the head's place on the trunk */
  beginClimb() {
    const m = this.m, tr = this.tree;
    this.group.updateMatrixWorld(true);
    // the joints' world positions, tail to head, with points between them at DS
    this.tn = 0; this.th = 0;
    for (let i = N - 1; i >= 0; i--) {
      m.segs[i].getWorldPosition(_t0);
      if (i < N - 1) {
        const dx = _t0.x - _t1.x, dy = _t0.y - _t1.y, dz = _t0.z - _t1.z, d = Math.hypot(dx, dy, dz), k = Math.max(1, Math.ceil(d / DS));
        for (let j = 1; j <= k; j++) this.trailPush(_t1.x + dx * j / k, _t1.y + dy * j / k, _t1.z + dz * j / k);
      } else this.trailPush(_t0.x, _t0.y, _t0.z);
      _t1.copy(_t0);
    }
    this.hx = _t0.x; this.hy = _t0.y; this.hz = _t0.z; this.acc = 0;
    trunkAt(tr, 0, _ax);
    this.theta = Math.atan2(this.hx - _ax.x, this.hz - _ax.z);
    this.rad = Math.max(trunkR(tr, 0.04), Math.hypot(this.hx - _ax.x, this.hz - _ax.z));
    this.climbDir = rnd() < 0.5 ? 1 : -1;
    this.goal = rr(0.68, 0.9);                       // how high up the trunk it will rest, as a fraction of the way to the crown
    this.turns = 0;
    this.trailOn = true; this.state = 'climb'; this.t = 120; this.speed = 0;
  }
  trailPush(x, y, z) {
    this.th = (this.th + 1) % TRAIL_N; const o = this.th * 3;
    this.trail[o] = x; this.trail[o + 1] = y; this.trail[o + 2] = z;
    if (this.tn < TRAIL_N) this.tn++;
  }
  /** the point d metres behind the head along the trail */
  trailAt(d, out) {
    const tr = this.trail;
    if (d <= this.acc || this.tn < 2) {
      const f = this.acc > 1e-6 ? Math.min(1, d / this.acc) : 0, o = this.th * 3;
      return out.set(this.hx + (tr[o] - this.hx) * f, this.hy + (tr[o + 1] - this.hy) * f, this.hz + (tr[o + 2] - this.hz) * f);
    }
    const dd = (d - this.acc) / DS;
    let k = Math.floor(dd); const fr = dd - k;
    if (k > this.tn - 2) { k = this.tn - 2; }
    const a = ((this.th - k) % TRAIL_N + TRAIL_N) % TRAIL_N * 3, b = ((this.th - k - 1) % TRAIL_N + TRAIL_N) % TRAIL_N * 3;
    const ff = k >= this.tn - 2 ? Math.min(1, fr) : fr;
    return out.set(tr[a] + (tr[b] - tr[a]) * ff, tr[a + 1] + (tr[b + 1] - tr[a + 1]) * ff, tr[a + 2] + (tr[b + 2] - tr[a + 2]) * ff);
  }
  /** move the head to a new place; the trail grows when it has moved a step */
  headTo(x, y, z) {
    this.acc += Math.hypot(x - this.hx, y - this.hy, z - this.hz);
    this.hx = x; this.hy = y; this.hz = z;
    while (this.acc >= DS) { this.trailPush(x, y, z); this.acc -= DS; if (this.acc < DS) { this.acc = 0; } }
  }
  /** the head's place on the trunk for a height: the helix radius eases to the bark */
  onTrunk(hy, theta, rad) {
    const tr = this.tree, tt = clamp((hy - tr.y) / Math.max(1, tr.pv.H * tr.sc), 0, 1);
    trunkAt(tr, tt, _ax);
    return _o.set(_ax.x + Math.sin(theta) * rad, hy, _ax.z + Math.cos(theta) * rad);
  }
  climbStep(dt, t, night) {
    const tr = this.tree, S = this.state, Hh = tr.pv.H * tr.sc;
    this.tongue = Math.sin(t * 5 + this.i) > 0.3 ? 1 : 0;
    this.x = this.hx; this.z = this.hz;                                              // the rats and the camera read the boa's place from x, z
    let v = 0, phi = 0.6, dirY = 1;
    if (S === 'climb') { v = 0.42; phi = 0.62; }
    else if (S === 'coil') { v = 0.34; phi = 0.1; }
    else if (S === 'descend') { v = 0.5; phi = 0.62; dirY = -1; }
    if (S === 'climb' || S === 'coil' || S === 'descend') {
      const tt = clamp((this.hy - tr.y) / Hh, 0, 1), want = trunkR(tr, tt) + 0.06;
      this.rad += (want - this.rad) * Math.min(1, dt * 1.6);
      const dy = v * Math.sin(phi) * dt * dirY, dth = this.climbDir * (v * Math.cos(phi) / Math.max(0.2, this.rad)) * dt;
      this.theta += dth; this.turns += Math.abs(dth);
      const p = this.onTrunk(this.hy + dy, this.theta, this.rad);
      this.headTo(p.x, p.y, p.z);
      if (S === 'climb' && (this.hy - tr.y) / Hh >= this.goal) { this.state = 'coil'; this.turns = 0; }
      else if (S === 'coil' && this.turns > TAU * 1.15) { this.state = 'treerest'; this.t = rr(70, 150); this.restRatT = 1; }
      else if (S === 'descend' && this.hy <= getHeight(this.hx, this.hz) + 0.12) {
        this.state = 'dismount'; this.out = this.theta; this.away = 0; this.climbDir = this.climbDir;
      }
    } else if (S === 'treerest') {
      // a long rest in the palm: the tongue tastes the air; a rat at the foot of the trunk at night brings it down hunting
      this.look = Math.sin(t * 0.45 + this.i) * 0.5;
      this.restRatT -= dt;
      if (night && this.fed < 2 && this.restRatT < 0) {
        this.restRatT = 1.5;
        if (eco.ratNear(tr.x, tr.z, 6, (q) => q.state !== 'hidden')) { this.t = 0; this.hunting = true; }
      }
      if (this.t < 0) { this.state = 'descend'; }
    } else if (S === 'dismount') {
      // off the foot of the trunk and away across the ground, the whole body following the head's track
      const sp = 0.5, k = this.out + Math.sin(this.away * 0.9) * 0.5;
      this.away += sp * dt;
      const nx = this.hx + Math.sin(k) * sp * dt, nz = this.hz + Math.cos(k) * sp * dt;
      this.headTo(nx, getHeight(nx, nz) + RAD[0] * this.s * 0.95 + 0.02, nz);
      if (this.away > this.bodyLen + 0.6) this.endTrail(night);
    }
  }
  /** the whole body is on the ground again: hand over to the ground pose, from the shape the trail left */
  endTrail(night) {
    // the ground pose's yaw per joint, read from the trail, so the change of method does not show
    let prev = null, hd0 = 0;
    for (let i = 0; i < N; i++) {
      this.trailAt(i * this.Ls, _t0); this.trailAt((i + 1) * this.Ls, _t1);
      const hd = Math.atan2(_t0.x - _t1.x, _t0.z - _t1.z);
      if (i === 0) hd0 = hd;
      this.yawT[i] = prev === null ? 0 : wrap(hd - prev);
      prev = hd;
    }
    this.x = this.hx; this.z = this.hz; this.heading = hd0; this.dist = rnd() * 6; this.speed = 0.3;
    this.mix = 1; this.trailOn = false; this.tree = null;
    if (night && this.fed < 2) { this.state = 'search'; this.pickWay(); this.t = rr(25, 60); this.cool = this.hunting ? 0 : 2; this.roam = 0; }
    else { this.state = 'rest'; this.t = rr(12, 35); }
    this.hunting = false;
  }

  /** the lunge connects (or the rat wriggles free) */
  snap(p) {
    if (p.state === 'flee' && rnd() < 0.5) { this.state = 'search'; this.cool = 4; this.prey = null; return; }
    p.caught(this); this.state = 'constrict'; this.t = rr(4, 6);
  }

  pose(dt, t) {
    if (this.trailOn && !this.tree) this.trailOn = false;                 // (only an outside hand can leave it so: fall back to the ground pose)
    if (this.trailOn) this.poseTrail(dt, t); else this.poseGround(dt, t);
    this.poseDetail(dt, t);
  }

  /** the shape of the chain on a palm: each joint where the head's track put it, the back to the bark */
  poseTrail(dt, t) {
    const m = this.m, tr = this.tree, Ls = this.Ls, P = _P;
    for (let i = 0; i < N; i++) { this.trailAt(i * Ls, _t0); P[i * 3] = _t0.x; P[i * 3 + 1] = _t0.y; P[i * 3 + 2] = _t0.z; }
    _qp.identity();
    const Hh = tr.pv.H * tr.sc;
    for (let i = 0; i < N - 1; i++) {
      const o = i * 3;
      _f.set(P[o] - P[o + 3], P[o + 1] - P[o + 4], P[o + 2] - P[o + 5]);
      if (_f.lengthSq() < 1e-10) _f.set(0, 1, 0);
      _f.normalize();
      // 'up' for the body: away from the bark where it is on the trunk, straight up on the ground
      const gy = getHeight(P[o], P[o + 2]), hAbove = P[o + 1] - gy;
      const tt = clamp((P[o + 1] - tr.y) / Hh, 0, 1); trunkAt(tr, tt, _ax);
      _up.set(P[o] - _ax.x, 0, P[o + 2] - _ax.z);
      const dAxis = _up.length();
      const w = clamp(hAbove / 0.9, 0, 1) * clamp(1.4 - (dAxis - trunkR(tr, tt)) / 1.2, 0, 1);
      if (dAxis < 1e-4) _up.set(0, 1, 0); else _up.multiplyScalar(w / dAxis);
      _up.y += 1 - w;
      // the basis: z along the body (toward the head), x across it, y up
      _x.crossVectors(_up, _f);
      if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
      _x.normalize(); _y.crossVectors(_f, _x);
      _mat.makeBasis(_x, _y, _f);
      _qw.setFromRotationMatrix(_mat);
      _ql.copy(_qp).invert().multiply(_qw);
      m.segs[i].quaternion.copy(_ql);
      _qp.copy(_qw);
    }
    m.segs[N - 1].quaternion.identity();
    this.group.position.set(P[0], P[1], P[2]);
    this.group.rotation.set(0, 0, 0);
    this.heading = Math.atan2(P[0] - P[3], P[2] - P[5]);
  }

  /** the shape of the chain: a wave or a coil, over the ground */
  poseGround(dt, t) {
    const m = this.m, c = this.coil, L = m.L, Ls = this.Ls;
    const dist = this.dist, k = 0.42, kappa = k / L;
    // yaw per joint: a ground-fixed travelling wave when moving, a coil when resting
    let amp = 0.4;
    if (this.state === 'stalk') amp = 0.3;
    const coilBend = this.state === 'constrict' ? 0.62 : 0.44;
    const idle = Math.sin(t * 0.5 + this.i) * 0.03;
    this.mix = Math.max(0, this.mix - dt / 1.6);
    for (let i = 0; i < N; i++) {
      const env_ = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, i / (N - 4)) * 0.9 + 0.2);
      const wave = amp * env_ * Math.sin(kappa * dist - k * i + this.i * 1.7) * (this.speed > 0.03 ? 1 : 0.15) + idle * (i < 14 ? 1 : 0.4);
      let y = lerp(wave, coilBend, c);
      // the neck coils back (S) before a strike
      if (i < 7) y += this.wind * 0.75 * Math.sin(i * 0.95 + 0.3) + (i < 3 ? this.look * (1 - c) * 0.5 : 0);
      this.yaw[i] = this.mix > 0 ? lerp(y, this.yawT[i], this.mix) : y;
    }
    // heights: the terrain under each joint, the body's half-width, the coil's stack, a raised neck
    let px = this.x, pz = this.z, hd = this.heading;
    const H = _P;
    const rise = 0.0036;
    for (let i = 0; i <= N; i++) {
      if (i > 0) { hd += this.yaw[i - 1]; px += -Math.sin(hd) * Ls; pz += -Math.cos(hd) * Ls; }
      const stack = c > 0.35 ? rise * Math.min(i, 28) * ss(0.35, 1, c) : 0;
      const neck = this.neck * (i < 10 ? 0.15 * Math.pow(1 - i / 10, 1.4) : 0);
      H[i] = getHeight(px, pz) + RAD[i] * 0.95 * this.s + stack + neck;
    }
    // smooth the heights a little so the body does not kink on a rough slope
    for (let i = 1; i < N; i++) H[i] = H[i] * 0.6 + (H[i - 1] + H[i + 1]) * 0.2;
    // back to rotations: the pitch of each stretch from the height change, relative to the one before
    let prev = 0;
    for (let i = 0; i < N; i++) {
      const psi = Math.atan2(H[i + 1] - H[i], Ls), rel = psi - prev; prev = psi;
      m.segs[i].rotation.set(clamp(rel, -0.7, 0.7), this.yaw[i], 0, 'YXZ');
    }
    this.group.position.set(this.x, H[0] - 0.02, this.z);
    this.group.rotation.set(0, this.heading, 0);
  }

  /** the swelling of a meal on its way down, the jaw, the tongue and the head's turn (both ways of posing the body use these) */
  poseDetail(dt, t) {
    const m = this.m;
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

/** three boas, resting by day near the rats' burrows (placement uses its own generator: the world's random stream is untouched). The palms they may climb are
 *  listed once here: tall, on firm ground, clear of the temple, the camp and the volcano. */
export function spawnBoas(ctx = {}) {
  if (!makeBoaModel() || !eco.burrows.length) return [];
  const camp = falls.camp || { x: 1e5, z: 1e5 };
  eco.palmTrees = (ctx.palms || []).filter((p) => p.pv && p.crown && p.crown.y - p.y > 6 && p.y > 1.4 && p.y < 14
    && canStand(p.x, p.z, { minH: 1.4, river: 1.5 }) && Math.hypot(p.x - TEMPLE.x, p.z - TEMPLE.z) > 20 && Math.hypot(p.x - camp.x, p.z - camp.z) > 8
    && Math.hypot(p.x - VOL.x, p.z - VOL.z) > 70 && lavaDist(p.x, p.z) > 25);
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
