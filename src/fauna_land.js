import * as THREE from 'three';
import { createCoconut, setCoconutState } from './coconut.js';
import { scene, updaters, U, env, camera } from './core.js';
import { M, sphere, box, cyl, cone, mesh, windify, MB, C } from './gfx.js';
import { getHeight, getSlope, riverDist, volcanoDist, lavaDist, perchesNear, TEMPLE, COVE, VOL, FAIRY, falls } from './world.js';
import { fauna, register, orient, steer, canStand, randomSpot, limb, lookAtCamera, blinkAt, nearestPerson } from './fauna_common.js';
import { makeMonkey, makeBoar, makeCrab, makeFlamingo } from './creatures.js';
import { makeMonkeyRig, monkeyMeta } from './monkey_model.js';
import { updateContests, monkeyTraits } from './monkey_contest.js';
import { spawnRats } from './rat.js';
import { spawnOwls } from './owl.js';
import { spawnBoas } from './boa.js';
import { makeCrabModel } from './crab_model.js';
import { spawnBoars } from './boar.js';
import { makeFlamingoModel } from './flamingo_model.js';
import { rnd, rr, pick, clamp, lerp, damp, angDiff, smoothstep, burn, TAU } from './util.js';
import { Particles } from './particles.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ====================================================================== MONKEY */
// Coconut geometry is shared with the castaway, pickups and animated monkey rig.
// the idle clip for each idle behaviour of the new monkey (see Monkey.act)
const IDLE_CLIP = { look: 'look_around', scratch: 'scratch', eat: 'investigate' };
const idleClip = (act) => IDLE_CLIP[act] || 'idle';
const MONKEYS = [];   // every monkey, for the social and contest rules
class Monkey {
  constructor(home, i, ctx) {
    // the new monkey (monkey_model.js) when its models are loaded; the procedural monkey otherwise, and with ?monkey=old
    this.rig = makeMonkeyRig();
    const r = this.rig ? null : makeMonkey();
    if (r) Object.assign(this, r);
    this.group = new THREE.Group(); this.group.scale.setScalar(rr(0.92, 1.08));   // individual adult variation (see docs/WILDLIFE_SCALE_RESEARCH.md)
    this.group.add(this.rig ? this.rig.group : r.root);
    // traits and timers for the social and contest rules. These use Math.random, not the world's seeded stream, so placement is unchanged.
    this.size = this.group.scale.x; Object.assign(this, monkeyTraits());
    this.contest = null; this.contestScan = Math.random() * 2; this.nbrScan = Math.random() * 2;
    this.climbV = 1; this.downV = 1;
    this.greetT = 0; this.curiousT = 0; this.startleT = 0; this.startled = false; this.wasNear = false; this.personD = 99;
    MONKEYS.push(this);
    fauna.add(this.group);
    this.ctx = ctx;
    this.home = home;
    const s = randomSpot(home.x, home.z, 2, 20, { minH: 2.5 }, 60) || { x: home.x, z: home.z };
    this.x = s.x; this.z = s.z; this.heading = rnd() * TAU;
    this.state = 'idle'; this.t = rr(0.5, 4); this.ph = rnd() * 6; this.speed = 0;
    this.pitch = 0; this.fold = 0; this.pitchT = 0; this.foldT = 0;
    this.act = 'look';
    this.climb = 0; this.tree = null;
    this.climbPhase = 0; this.climbT = 0; this.climbFrom = null; this.dismount = 0; this.grabT = 0;
    this.cooldown = rr(10, 40);
    // coconut rivalry: monkeys burst out of the foliage to snatch coconuts that fall or roll, carry them off and eat them
    this.nutScan = rr(0, 1); this.nutCool = rr(0, 8); this.nutT = null; this.nutTimer = 0; this.tmpN = new THREE.Vector3(); this.stolen = 0;
    this.nut = createCoconut({ variant: i % 3 }); this.nut.visible = false; this.nut.castShadow = true;
    if (!this.rig) this.group.add(this.nut);
    register({
      id: 'monkey' + i, name: 'Capuchin monkey', cat: 'Mammals', group: this.group, sim: this, viewDist: 7,
      desc: 'A clever troop forager. Climbs palms to shake down coconuts and raids the temple steps.', pickR: 1.5, pickY: 0.9,
    });
    this.info = this.group.userData;
  }
  pickTarget() {
    const s = randomSpot(this.x, this.z, 4, 18, { minH: 2.5 });
    if (!s) return false;
    // stay near home
    if (Math.hypot(s.x - this.home.x, s.z - this.home.z) > 50) { this.tx = this.home.x + rr(-8, 8); this.tz = this.home.z + rr(-8, 8); }
    else { this.tx = s.x; this.tz = s.z; }
    return true;
  }
  /** a boulder close by with a crown worth sitting on */
  pickRock() {
    const g = (p) => p.y - getHeight(p.x, p.z);
    const near = perchesNear(this.x, this.z, 28, (p) => p.kind !== 'volcano' && p.r >= 0.4 && g(p) < 1.9 && g(p) > 0.5).slice(0, 4);
    return near.length ? near[Math.floor(rnd() * near.length)] : null;
  }
  pickTree(any = false) {
    let best = null, bd = 1e9;
    for (const p of this.ctx.palms) {
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d < (any ? 22 : 38) && p.y > 2.2 && d < bd && (any || rnd() < 0.2)) { best = p; bd = d; }
    }
    return best;
  }
  /** run off with the coconut to somewhere quiet */
  pickStash() {
    const s = this.rig ? randomSpot(this.x, this.z, 5, 12, { minH: 2.5 }, 30) : randomSpot(this.x, this.z, 14, 28, { minH: 2.5 }, 30);
    if (s) { this.tx = s.x; this.tz = s.z; } else { this.tx = this.home.x + rr(-6, 6); this.tz = this.home.z + rr(-6, 6); }
    this.stashT = 14;
  }
  /* ---- the new monkey (rig): one clip per behaviour, speed-matched for the walks, and the body placed on the trunk */
  trunkLen(tree) {
    if (!tree.len) tree.len = this.ctx.trunkPoint(tree, 0, V()).distanceTo(this.ctx.trunkPoint(tree, 1, V()));
    return tree.len;
  }
  /** a palm's trunk radius at t: the same profile makePalm (flora.js) builds, scaled by the palm */
  trunkR(t) { return (lerp(0.4, 0.23, t) + 0.3 * Math.exp(-12 * t)) * this.tree.sc; }
  /** the monkey's size in the world: its group scale (variety) times the rig scale (the castaway-relative size) */
  worldScale() { return this.group.scale.x * (this.rig ? this.rig.group.scale.x : 1); }
  /** in reach of a coconut: stand 0.56 m from it, facing it, for the reach, grab and lift */
  grabAt(p) {
    const h = Math.atan2(p.x - this.x, p.z - this.z);
    this.heading = h;
    const k = this.worldScale();   // the reach is 0.56 m of the monkey at its clip scale
    this.x = p.x - Math.sin(h) * 0.56 * k; this.z = p.z - Math.cos(h) * 0.56 * k;
    this.grabT = 3.0;
  }
  /** the monkey on the trunk, its front to the bark. Climb start and dismount move the body between ground and bark over the clip. */
  placeOnTrunk(st, dt) {
    const tree = this.tree, ctx = this.ctx;
    const k = st === 'perch' ? 1 : this.climb, tt = lerp(0.08, 0.93, k);
    const p = ctx.trunkPoint(tree, tt, V()), R = this.trunkR(tt), ox = Math.sin(this.out), oz = Math.cos(this.out);
    const bx = p.x + ox * R, bz = p.z + oz * R, by = p.y - 0.15;
    let x = bx, y = by, z = bz;
    if (this.dismount > 0) {
      this.dismount = Math.max(0, this.dismount - dt);
      const f = smooth01(1 - this.dismount / 1.1);
      x = lerp(bx, this.x, f); z = lerp(bz, this.z, f); y = lerp(by, getHeight(this.x, this.z), f);
    } else if (st === 'climb' && this.climbPhase === 0) {
      this.climbT += dt;
      const f = smooth01(this.climbT / 1.2);
      x = lerp(this.climbFrom.x, bx, f); z = lerp(this.climbFrom.z, bz, f); y = lerp(this.climbFrom.y, by, f);
      if (this.climbT >= 1.2) this.climbPhase = 1;
    }
    this.group.position.set(x, y, z);
    this.heading = Math.atan2(-ox, -oz);
    this.group.rotation.set(0, this.heading, 0);
  }
  /** the clip for what the monkey is doing right now (playing the clip that is already on is a no-op) */
  pickClip(st, moving) {
    const R = this.rig, cur = R.current;
    if (this.dismount > 0) return ['climb_dismount', { loop: false, next: 'idle' }];
    if (st === 'climb') return this.climbPhase === 0 ? ['climb_start', { loop: false, next: 'climb_up' }] : ['climb_up', {}];
    if (st === 'perch') return ['climb_hang_idle', {}];
    if (st === 'descend') return ['climb_down', {}];
    if (this.startleT > 0 && Math.abs(this.speed) < 0.6) return ['startled', { loop: false, next: 'alert_idle' }];
    if (this.grabT > 0) return cur === 'coconut_reach' || cur === 'coconut_grab_lift' ? [cur, {}] : ['coconut_reach', { loop: false, next: 'coconut_grab_lift' }];
    if (st === 'carry') return ['coconut_carry_walk', {}];
    if (st === 'eatNut') return [Math.floor(this.t / 5) % 2 ? 'coconut_inspect' : 'coconut_hold_idle', {}];   // turns the nut over now and then
    if (moving) return this.speed <= 0.8 ? ['walk', {}] : ['scurry', {}];
    // at rest: sitting, standing up, or the idle behaviour
    const sitting = cur === 'sit_idle' || cur === 'sit_down' || cur === 'groom';
    if (st === 'idle' && this.curiousT > 0) return ['curious', { loop: false, next: 'alert_idle' }];
    if (st === 'idle' && this.greetT > 0) return ['social_greet', {}];
    if (cur === 'stand_up' && !R.finished()) return [cur, {}];
    if (this.act === 'sit' && (st === 'idle' || st === 'rock' || st === 'unrock')) {
      if (sitting) return [cur, {}];
      // sitting down: one sit in three is a grooming spell (groom loops, as sit_idle does)
      this.sitClip = rnd() < 0.35 ? 'groom' : 'sit_idle';
      return ['sit_down', { loop: false, next: this.sitClip }];
    }
    if (sitting) return ['stand_up', { loop: false, next: idleClip(this.act) }];
    return [this.act === 'look' && this.personD < 12 ? 'alert_idle' : idleClip(this.act), {}];
  }
  /** what is around the monkey: a person coming close (a curious look), a neighbour to greet, a chase that has just begun (startled) */
  noticeRig(st, dt) {
    this.greetCool = Math.max(0, (this.greetCool || 0) - dt); this.greetT = Math.max(0, this.greetT - dt); this.curiousT = Math.max(0, this.curiousT - dt); this.startleT = Math.max(0, this.startleT - dt);
    const who = nearestPerson(this.x, this.z, this.group.position.y, 12);
    this.personD = who.d;
    const near = who.d < 7;
    if (near && !this.wasNear && st === 'idle' && Math.abs(this.speed) < 0.5) this.curiousT = 2.0;
    this.wasNear = near;
    if (this.fleeT > 2.9 && !this.startled) { this.startled = true; this.startleT = 1.0; }
    if (!(this.fleeT > 0)) this.startled = false;
    this.nbrScan -= dt;
    if (this.nbrScan <= 0 && st === 'idle' && this.greetT <= 0 && this.greetCool <= 0 && this.act !== 'sit') {
      this.nbrScan = rr(2, 4);
      for (const m of MONKEYS) if (m !== this && !m.contest && m.state === 'idle' && m.greetT <= 0 && !(m.greetCool > 0) && Math.hypot(m.x - this.x, m.z - this.z) < 3.5 && rnd() < 0.3) { this.greetT = 2.4; m.greetT = 2.4; this.greetCool = m.greetCool = rr(20, 35); break; }
    }
  }
  poseRig(st, moving, dt) {
    const R = this.rig;
    // the hero build near the camera and the distant build far off, with a band so it does not flicker at the boundary
    const cd = Math.hypot(this.x - camera.position.x, this.z - camera.position.z);
    R.setFar(R.isFar ? cd > 5.5 : cd > 7);
    R.retier();
    this.noticeRig(st, dt);
    const [name, opts] = this.pickClip(st, moving);
    const meta = monkeyMeta(name);
    // the playback rate is the monkey's own speed over the clip's speed, so the hands and feet keep up with the ground. A monkey never
    // moves faster than its locomotion clip can keep up with (3.2x), so the timescale stays within the range the clips are made for.
    let ts = 1;
    if (name === 'climb_up') ts = this.climbV / 0.343;
    else if (name === 'climb_down') ts = this.downV / 0.244;
    else if (meta && meta.speed_mps && (name === 'walk' || name === 'scurry' || name === 'coconut_carry_walk')) {
      this.speed = Math.min(Math.abs(this.speed), meta.speed_mps * 3.2);
      ts = clamp(this.speed / meta.speed_mps, 0.6, 3.2);
    }
    R.play(name, { ...opts, timeScale: ts });
    if (st === 'eatNut') R.setNutState('half');
    if (this.grabT > 0) this.grabT -= dt;
    // far from the camera the mixer is stepped less often
    if (cd > 40) R.throttled(dt, 0.2); else R.update(dt);
  }

  update(dt, t) {
    if (this.contest) return;      // a contest runs this monkey (monkey_contest.js)
    this.t -= dt;
    this.cooldown -= dt;
    this.nutCool -= dt; this.nutScan -= dt;
    this.fleeT = (this.fleeT || 0) - dt;
    let moving = false;
    let st = this.state;
    // spot a coconut on the ground (a fresh fall, one rolling down the slope, now and then one lying under a palm) and go for it
    if ((st === 'idle' || st === 'walk') && this.nutScan < 0 && this.nutCool < 0 && this.fleeT < 0) {
      this.nutScan = 0.6;
      const n = this.ctx.coconuts.free(this.x, this.z, 40, rnd() < 0.04);
      if (n && canStand(n.x, n.z, { minH: 1.8, river: 1.2 })) {
        const who = nearestPerson(n.x, n.z, 0, 5);
        if (who.d > 5) { this.nutT = n; this.nutTimer = 12; this.state = 'toNut'; st = 'toNut'; }
      }
    }
    if (st === 'idle' || st === 'walk') {
      const who = nearestPerson(this.x, this.z, this.group.position.y, 5);      // the camera, or the castaway when he is nearer
      const dxc = this.x - who.x, dzc = this.z - who.z, dc = who.d;
      if (dc < 6 && this.fleeT < (who.cast ? 0 : -2)) {
        const tx = this.x + (dxc / dc) * 12, tz = this.z + (dzc / dc) * 12;
        if (canStand(tx, tz, { minH: 2.5 })) { this.tx = tx; this.tz = tz; this.state = 'walk'; st = 'walk'; this.fleeT = 3; this.chased = who.cast; }
        // chased by the castaway, a monkey will sometimes dash up the nearest palm instead
        if (who.cast && this.cooldown < 0 && rnd() < 0.35 && (this.tree = this.pickTree(true))) { this.state = 'toTree'; st = 'toTree'; this.cooldown = rr(35, 80); this.tx = this.tree.x; this.tz = this.tree.z; this.fleeT = 3; }
      }
    }
    if (st === 'idle') {
      this.pitchT = this.act === 'sit' ? -1.15 : 0; this.foldT = this.act === 'sit' ? 1 : 0;
      this.speed = damp(this.speed, 0, 6, dt);
      if (this.t < 0) {
        if (this.cooldown < 0 && rnd() < 0.55 && (this.tree = this.pickTree())) {
          this.state = 'toTree'; this.cooldown = rr(35, 80); this.tx = this.tree.x; this.tz = this.tree.z;
        } else if (rnd() < 0.22 && (this.rock = this.pickRock())) { this.state = 'toRock'; this.tx = this.rock.x; this.tz = this.rock.z; }
        else if (rnd() < 0.7 && this.pickTarget()) { this.state = 'walk'; }
        else { this.act = pick(['look', 'sit', 'scratch', 'sit', 'eat']); this.t = rr(3, 8); }
      }
    } else if (st === 'toRock') {
      this.pitchT = 0; this.foldT = 0;
      const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
      this.heading = steer(this.heading, Math.atan2(dx, dz), dt * 3.2);
      this.speed = damp(this.speed, 2.2, 4, dt);
      const nx = this.x + Math.sin(this.heading) * this.speed * dt, nz = this.z + Math.cos(this.heading) * this.speed * dt;
      if (canStand(nx, nz, { minH: 1.8, river: 1.2 })) { this.x = nx; this.z = nz; } else { this.state = 'idle'; this.t = 1; }
      moving = true;
      const who = nearestPerson(this.x, this.z, this.group.position.y, 5);
      if (who.d < 4) { this.state = 'idle'; this.t = 0.5; }                              // someone too close: forget the rock
      else if (d < Math.max(0.9, this.rock.r * 0.9)) { this.state = 'rock'; this.rockK = 0; this.t = rr(9, 24); this.act = pick(['sit', 'look', 'eat', 'sit', 'scratch']); this.x = this.rock.x + Math.sin(this.heading) * this.rock.r * 0.2; this.z = this.rock.z + Math.cos(this.heading) * this.rock.r * 0.2; }
    } else if (st === 'rock' || st === 'unrock') {
      // up on the boulder: sit, look about, eat; hop down when its time is up or someone gets close
      this.pitchT = this.act === 'sit' ? -1.15 : 0; this.foldT = this.act === 'sit' ? 1 : 0;
      this.speed = damp(this.speed, 0, 6, dt);
      this.rockK = clamp(this.rockK + (st === 'rock' ? 1 : -1) * dt * 2.4, 0, 1);
      const who = nearestPerson(this.x, this.z, this.group.position.y, 6);
      if (st === 'rock' && (this.t < 0 || who.d < 3.5)) { this.state = 'unrock'; if (who.d < 3.5) { this.fleeT = 2; } }
      if (st === 'unrock' && this.rockK <= 0) { this.state = 'idle'; this.t = rr(1, 3); this.rock = null; }
    } else if (st === 'walk' || st === 'toTree') {
      this.pitchT = 0; this.foldT = 0;
      const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      this.heading = steer(this.heading, want, dt * 3.2);
      const sp = st === 'toTree' ? (this.fleeT > 0 ? 4.8 : 3.0) : this.fleeT > 0 ? (this.chased ? 5.0 : 3.8) : 1.7;
      this.speed = damp(this.speed, sp, 4, dt);
      const nx = this.x + Math.sin(this.heading) * this.speed * dt, nz = this.z + Math.cos(this.heading) * this.speed * dt;
      if (canStand(nx, nz, { minH: 1.8, river: 1.2 }) || st === 'toTree') { this.x = nx; this.z = nz; } else { this.state = 'idle'; this.t = 1; }
      moving = true;
      if (st === 'toTree' && d < 1.1) { this.state = 'climb'; this.climb = 0; this.out = Math.atan2(this.x - this.tree.x, this.z - this.tree.z); this.climbPhase = 0; this.climbT = 0; this.climbFrom = { x: this.x, y: getHeight(this.x, this.z), z: this.z }; this.climbV = clamp(this.trunkLen(this.tree) / rr(8, 15), 0.85, 1.6); this.downV = clamp(this.trunkLen(this.tree) / rr(9, 14), 0.8, 1.0); }
      else if (st === 'walk' && d < 1.2) { this.state = 'idle'; this.t = rr(2, 6); this.act = pick(['look', 'sit', 'scratch', 'eat']); }
    } else if (st === 'toNut') {
      // a sprint out of the foliage at the rolling coconut
      this.pitchT = 0; this.foldT = 0;
      const n = this.nutT, p = n && this.ctx.coconuts.where(n, this.tmpN);
      const who = nearestPerson(this.x, this.z, this.group.position.y, 5);
      this.nutTimer -= dt;
      if (!p || this.nutTimer < 0 || (who.d < 2.5 && who.cast)) { this.state = 'idle'; this.t = 1; this.nutCool = rr(8, 16); this.nutT = null; this.speed = damp(this.speed, 0, 6, dt); }
      else {
        const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
        this.heading = steer(this.heading, Math.atan2(dx, dz), dt * 5);
        this.speed = damp(this.speed, 6.4, 5, dt);
        const nx = this.x + Math.sin(this.heading) * this.speed * dt, nz = this.z + Math.cos(this.heading) * this.speed * dt;
        if (canStand(nx, nz, { minH: 1.8, river: 1.2 })) { this.x = nx; this.z = nz; } else { this.state = 'idle'; this.t = 1; this.nutCool = rr(8, 16); this.nutT = null; }
        moving = true;
        if (d < 0.75) {
          if (this.ctx.coconuts.take(n)) { setCoconutState(this.nut, 'whole'); this.rig?.setNutState('whole'); this.nut.visible = true; this.state = 'carry'; this.stolen++; this.pickStash(); this.fleeT = 2; if (this.rig) this.grabAt(p); }
          else { this.state = 'idle'; this.t = 1; this.nutCool = rr(8, 16); }                        // beaten to it
          this.nutT = null;
        }
      }
    } else if (st === 'carry') {
      this.pitchT = 0; this.foldT = 0;
      const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
      this.stashT -= dt;
      this.heading = steer(this.heading, Math.atan2(dx, dz), dt * (this.grabT > 0 ? 0 : 4));
      this.speed = damp(this.speed, this.grabT > 0 ? 0 : (this.rig ? 0.85 : 5.6), 4, dt);
      const nx = this.x + Math.sin(this.heading) * this.speed * dt, nz = this.z + Math.cos(this.heading) * this.speed * dt;
      if (canStand(nx, nz, { minH: 1.8, river: 1.2 })) { this.x = nx; this.z = nz; } else this.stashT = 0;
      moving = true;
      if (d < 1.5 || this.stashT <= 0) { this.state = 'eatNut'; this.t = rr(10, 16); this.speed = 0; }
    } else if (st === 'eatNut') {
      // sits down with the prize and works it open
      this.pitchT = -1.15; this.foldT = 1;
      this.speed = damp(this.speed, 0, 6, dt);
      const who = nearestPerson(this.x, this.z, this.group.position.y, 5);
      if (who.d < 3.5) { this.state = 'carry'; this.pickStash(); this.fleeT = 2; }                   // disturbed: grab it and run
      else if (this.t < 0) { this.state = 'idle'; this.t = rr(2, 5); this.act = 'sit'; this.nut.visible = false; this.nutCool = rr(14, 28); }
    } else if (st === 'climb' || st === 'descend') {
      this.pitchT = -1.25; this.foldT = 0.0;
      const dir = st === 'climb' ? 1 : -1;
      this.climb = clamp(this.climb + dir * dt * (this.rig ? (dir > 0 ? this.climbV : this.downV) / (0.85 * this.trunkLen(this.tree)) : 0.2), 0, 1);
      if (st === 'climb' && this.climb >= 1) { this.state = 'perch'; this.t = rr(6, 10); this.dropped = false; }
      if (st === 'descend' && this.climb <= 0) { this.state = 'idle'; this.t = 2; this.heading = this.out; const off = this.rig ? this.trunkR(0.08) + 0.36 : 1.0; this.x = this.tree.x + Math.sin(this.out) * off; this.z = this.tree.z + Math.cos(this.out) * off; if (this.rig) this.dismount = 1.1; }
      moving = true; this.speed = 1.2;
    } else if (st === 'perch') {
      this.pitchT = -1.1; this.foldT = 1;
      this.speed = 0;
      if (!this.dropped && this.t < 4.5) {
        this.dropped = true;
        const c = this.tree.crown;
        this.ctx.coconuts.drop(c.x + 0.5, c.y - 0.8, c.z, rr(-0.5, 0.5), rr(-0.5, 0.5));
        if (rnd() < 0.6) this.ctx.coconuts.drop(c.x - 0.5, c.y - 0.8, c.z + 0.3, 0.5, 0);
      }
      if (this.t < 0) this.state = 'descend';
    }

    // ---- placement
    if (this.rig && (st === 'climb' || st === 'descend' || st === 'perch' || this.dismount > 0)) {
      this.placeOnTrunk(st, dt);
    } else if (st === 'climb' || st === 'descend' || st === 'perch') {
      const k = st === 'perch' ? 1 : this.climb;
      const tt = lerp(0.08, 0.93, k);
      const p = this.ctx.trunkPoint(this.tree, tt, V());
      const rad = lerp(0.5, 0.3, tt) * this.tree.sc + 0.18;
      const ox = Math.sin(this.out), oz = Math.cos(this.out);
      this.group.position.set(p.x + ox * rad, p.y - 0.65, p.z + oz * rad);
      this.group.rotation.set(0, Math.atan2(-ox, -oz), 0);
      this.heading = Math.atan2(-ox, -oz);
    } else if ((st === 'rock' || st === 'unrock') && this.rock) {
      const g0 = getHeight(this.x, this.z), k = this.rockK * this.rockK * (3 - 2 * this.rockK);
      this.group.position.set(this.x, g0 + (this.rock.y - g0) * k + 0.28 * Math.sin(this.rockK * Math.PI), this.z);
      this.group.rotation.set(0, this.heading, 0);                                       // level on the crown, whatever the ground does
    } else {
      orient(this.group, this.x, this.z, this.heading, 0.7, 0.4, 0);
    }
    const st2 = st === 'rock' || st === 'unrock' ? 'idle' : st;

    if (this.rig) { this.poseRig(st, moving, dt); return; }
    // ---- pose
    this.pitch = damp(this.pitch, this.pitchT, 6, dt);
    this.fold = damp(this.fold, this.foldT, 6, dt);
    this.ph += dt * (st === 'climb' || st === 'descend' ? 6 : 3 + this.speed * 3.2);
    const w = Math.sin(this.ph), w2 = Math.cos(this.ph);
    const gait = moving ? 1 : 0;
    this.tp.rotation.x = this.pitch;
    this.tp.position.y = 0.62 - 0.26 * this.fold;
    this.legL.position.y = this.legR.position.y = 0.62 - 0.26 * this.fold;
    const climbing = st === 'climb' || st === 'descend';
    const base = -this.pitch * 0.9;
    if (climbing) {
      this.armL.rotation.x = base - 2.0 + w * 0.7; this.armR.rotation.x = base - 2.0 - w * 0.7;
      this.legL.rotation.x = -1.0 - w * 0.5; this.legR.rotation.x = -1.0 + w * 0.5;
    } else if (this.nut.visible) {
      this.armL.rotation.x = base - 1.35 + w * 0.15 * gait; this.armR.rotation.x = base - 1.35 - w * 0.15 * gait;
      this.legL.rotation.x = -w * 0.8 * gait - 1.25 * this.fold; this.legR.rotation.x = w * 0.8 * gait - 1.25 * this.fold;
    } else if (st === 'perch') {
      this.armL.rotation.x = base - 0.6; this.armR.rotation.x = base - 0.6;
      this.legL.rotation.x = -1.3; this.legR.rotation.x = -1.3;
    } else {
      this.armL.rotation.x = base + w * 0.7 * gait + (this.act === 'scratch' && st === 'idle' ? -1.9 + Math.sin(t * 14) * 0.4 : 0);
      this.armR.rotation.x = base - w * 0.7 * gait + (this.act === 'eat' && st === 'idle' ? -1.7 + Math.sin(t * 6) * 0.2 : 0);
      this.legL.rotation.x = -w * 0.7 * gait - 1.25 * this.fold; this.legR.rotation.x = w * 0.7 * gait - 1.25 * this.fold;
    }
    this.hp.rotation.x = -this.pitch * 0.75 + (moving ? 0.04 * w2 : 0) + (this.act === 'eat' && st === 'idle' ? 0.2 : 0);
    this.hp.rotation.y = st === 'idle' && this.act === 'look' ? Math.sin(t * 0.9 + this.ph) * 0.7 : 0;
    if (this.nut.visible) { if (st === 'eatNut') setCoconutState(this.nut, 'half'); this.nut.position.set(0, 0.5 - 0.16 * this.fold, 0.34 - 0.06 * this.fold); }
    this.tailP.rotation.x = Math.sin(t * 2 + this.ph) * 0.12;
    this.tailP.rotation.y = Math.sin(t * 1.6 + this.ph * 0.3) * 0.3;
    // joints
    const sw2 = Math.sin(this.ph);
    if (climbing) {
      this.legL.knee.rotation.x = 1.1 + 0.4 * Math.sin(this.ph); this.legR.knee.rotation.x = 1.1 - 0.4 * Math.sin(this.ph);
      this.armL.knee.rotation.x = 0.5 + 0.4 * Math.max(0, Math.sin(this.ph + 3)); this.armR.knee.rotation.x = 0.5 + 0.4 * Math.max(0, Math.sin(this.ph));
    } else if (st === 'perch' || this.fold > 0.5) {
      this.legL.knee.rotation.x = 1.5; this.legR.knee.rotation.x = 1.5;
      this.armL.knee.rotation.x = 0.7; this.armR.knee.rotation.x = 0.7 + (this.act === 'eat' && st === 'idle' ? 0.9 + Math.sin(t * 6) * 0.2 : 0);
    } else {
      this.legL.knee.rotation.x = moving ? 0.25 + 0.75 * Math.max(0, Math.sin(this.ph + 1.4)) : 0.12;
      this.legR.knee.rotation.x = moving ? 0.25 + 0.75 * Math.max(0, Math.sin(this.ph + 1.4 + Math.PI)) : 0.12;
      const sc = this.act === 'scratch' && st === 'idle';
      this.armL.knee.rotation.x = moving ? 0.2 + 0.5 * Math.max(0, -sw2) : sc ? 1.5 + Math.sin(t * 14) * 0.4 : 0.2;
      this.armR.knee.rotation.x = moving ? 0.2 + 0.5 * Math.max(0, sw2) : 0.2;
    }
    if (!climbing && st !== 'perch') {
      this.lk = this.lk || {};
      lookAtCamera(this.group, this.lk, dt, 1.0, 12);
      this.hp.rotation.y += this.lk.y; this.hp.rotation.x += this.lk.p * 0.8;
    }
    blinkAt(this.eyes, t, this.ph);
  }
}

/* ====================================================================== CRAB */
// four kinds in different sizes: the common red beach crab, pale quick ghost crabs, slow hermit crabs in borrowed shells, and big inland coconut crabs
const CRAB_KINDS = {
  red: { name: 'Red beach crab', scale: 0.78, jit: [0.8, 1.3], speed: 2.4, flee: 4.2, desc: 'Scuttles sideways across the sand, claws raised at anything larger than itself.', h: [0.7, 1.9] },
  ghost: { name: 'Ghost crab', scale: 0.4, jit: [0.8, 1.2], speed: 3.8, flee: 6.0, desc: 'Sand-coloured and fast, it bolts the moment you come near and is nearly invisible when it stops.', h: [0.5, 1.3] },
  hermit: { name: 'Hermit crab', scale: 0.36, jit: [0.75, 1.3], speed: 1.1, flee: 1.8, desc: 'Lugs a borrowed spiral shell on its back, and pulls its claws in and freezes if disturbed.', h: [0.8, 2.4] },
  coconut: { name: 'Coconut crab', scale: 1.05, jit: [0.9, 1.15], speed: 1.5, flee: 2.4, desc: 'The heavyweight of the island: a purple land crab with claws that can crack a coconut, usually found near the palms.', h: [2.0, 5.5] },
};
class Crab {
  constructor(i, spot, kind = 'red') {
    const K = CRAB_KINDS[kind];
    this.kind = kind; this.K = K;
    Object.assign(this, makeCrabModel(kind) || makeCrab());
    const root = this.root;
    if (this.pincers) root.scale.setScalar(K.scale * rr(K.jit[0], K.jit[1]));
    else root.scale.setScalar(1.3);
    this.group = new THREE.Group(); this.group.add(root); fauna.add(this.group);
    this.x = spot.x; this.z = spot.z; this.heading = rnd() * TAU; this.t = rr(0.5, 4); this.state = 'idle'; this.ph = rnd() * 6; this.speed = 0;
    this.home = spot; this.snap = 0; this.tuck = 0;
    register({ id: 'crab' + i, name: K.name, cat: 'Shore life', group: this.group, sim: this, viewDist: 3 + 3 * K.scale, desc: K.desc, pickR: 0.8 + K.scale, pickY: 0.3 });
  }
  update(dt, t) {
    const K = this.K;
    this.t -= dt;
    let moving = false;
    const cdx = this.x - camera.position.x, cdz = this.z - camera.position.z, cd = Math.hypot(cdx, cdz);
    const near = cd < (this.kind === 'ghost' ? 7 : 5) && Math.abs(camera.position.y - getHeight(this.x, this.z)) < 6;
    if (near && !this.fleeing) {
      if (this.kind === 'hermit') { this.tuck = 1; this.t = Math.max(this.t, 2.5); this.state = 'idle'; }
      else {
        const tx = this.x + (cdx / cd) * 4, tz = this.z + (cdz / cd) * 4, h = getHeight(tx, tz);
        if (h > K.h[0] - 0.2 && h < K.h[1] + 0.8) { this.tx = tx; this.tz = tz; this.state = 'run'; this.fleeing = 1.2; }
      }
    }
    if (this.fleeing) this.fleeing = Math.max(0, this.fleeing - dt) || 0;
    if (this.tuck && !near) this.tuck = Math.max(0, this.tuck - dt * 0.5);
    if (this.state === 'idle') {
      this.speed = damp(this.speed, 0, 8, dt);
      if (this.t < 0) {
        const a = rnd() * TAU, r = rr(1.5, 5);
        const nx = this.x + Math.cos(a) * r, nz = this.z + Math.sin(a) * r, h = getHeight(nx, nz);
        if (h > K.h[0] - 0.2 && h < K.h[1] && Math.hypot(nx - this.home.x, nz - this.home.z) < 14) { this.tx = nx; this.tz = nz; this.state = 'run'; }
        else this.t = 1;
      }
    } else {
      const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
      this.speed = damp(this.speed, this.fleeing ? K.flee : K.speed, 10, dt);
      this.x += (dx / d) * this.speed * dt; this.z += (dz / d) * this.speed * dt;
      this.heading = steer(this.heading, Math.atan2(dx, dz) + Math.PI / 2, dt * 6);      // sideways scuttle
      moving = true;
      if (d < 0.25) { this.state = 'idle'; this.t = this.kind === 'hermit' ? rr(3, 9) : rr(1.5, 6); }
    }
    orient(this.group, this.x, this.z, this.heading, 0.3 * this.root.scale.x, 0.3 * this.root.scale.x);
    const sc = Math.min(1.6, this.speed / 2.4);
    this.ph += dt * (7 + this.speed * 2.2) * (moving ? 1 : 0);
    if (this.pincers) {
      // eight legs in alternating groups: swing fore-aft and lift each foot clear of the sand
      this.legs.forEach((l) => {
        const s = l.userData.side, k = l.userData.k;
        const phi = this.ph + (((k + (s > 0 ? 1 : 0)) % 2) ? Math.PI : 0) + k * 0.35;
        l.rotation.x = Math.sin(phi) * 0.4 * sc * (moving ? 1 : 0);
        l.rotation.z = s * (Math.max(0, Math.cos(phi)) * 0.28 * sc * (moving ? 1 : 0) - 0.06 * this.tuck);
      });
      this.body.position.y = 0.17 + (moving ? Math.abs(Math.sin(this.ph)) * 0.012 : 0);
      this.body.rotation.z = Math.sin(this.ph) * 0.03 * (moving ? 1 : 0);
      const wave = moving ? 0.35 : 0.2 + 0.2 * Math.sin(t * 1.7 + this.x);
      const raise = this.tuck ? 0.0 : (this.kind === 'coconut' ? 0.25 : 0.35) + wave * 0.6;
      this.claws[0].rotation.x = -raise; this.claws[1].rotation.x = -raise * 0.8;
      this.claws[0].rotation.y = 0.12 * Math.sin(t * 2.3 + this.x) * (1 - this.tuck);
      this.claws[1].rotation.y = -0.1 * Math.sin(t * 1.9 + this.z) * (1 - this.tuck);
      // pincers nip open and shut now and then
      this.snap -= dt;
      if (this.snap < 0) this.snap = rr(1.2, 4.5);
      const open = this.tuck ? 0 : this.snap < 0.5 ? Math.abs(Math.sin(this.snap * 12)) * 0.5 : (moving ? 0.2 : 0.06);
      this.pincers[0].rotation.y = -open; this.pincers[1].rotation.y = open;
    } else {
      this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.ph + i * 1.3) * 0.5 * (moving ? 1 : 0); });
      const raise = moving ? 0.5 : 0.35 + 0.35 * Math.sin(t * 2.2 + this.ph);
      this.claws[0].rotation.x = -raise; this.claws[1].rotation.x = -raise * 0.8;
      this.claws[0].rotation.z = 0.2 * Math.sin(t * 5 + this.x);
    }
  }
}

/* ====================================================================== FLAMINGO */
// A flock of greater flamingos works the shallows as one. The flock feeds on a stretch of wading ground and drifts about on it, and now
// and then moves on: it walks to a nearby pool, or takes off and flies (wings flapping, necks out, legs trailing, arcing over the jungle)
// to a far one, then lands and spreads out to feed again. Walking up to the flock sends the whole flock into the air. Each bird keeps its
// own pose (feeding, preening, flicking, the one-legged rest) and its own plumage. Without the model the old procedural birds wade alone.
const PLUMAGE_MIX = [['classic', 0.55], ['pale', 0.14], ['vivid', 0.2], ['juv', 0.11]];
const pickPlumage = () => { let r = rnd(); for (const [k, w] of PLUMAGE_MIX) { if ((r -= w) < 0) return k; } return 'classic'; };
// flight: a flamingo runs across the water with its wings going before it lifts off, climbs at a shallow angle over the first
// stretch of flight, cruises with its neck out and its legs trailing, and runs to a stop after landing
const FLY_SPEED = 12, FLY_CLEAR = 16, WALK_SPEED = 0.8, RUN_SPEED = 3.5, RUN_TIME = 2.5, BRAKE_TIME = 1.5, CLIMB_DIST = 70, FLAP_RATE = 16;
const smooth01 = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };
// ground a flock can feed on: shallows, mud and low wet sand (gentle slopes), well away from the crater and the lava
const spotOK = (x, z) => {
  if (Math.abs(x) > 200 || Math.abs(z) > 200) return false;
  const h = getHeight(x, z);
  return h > -0.65 && h < 0.9 && getSlope(x, z) < 0.35 && volcanoDist(x, z) > 40 && lavaDist(x, z) > 14;
};
function findSpot(from, rmin, rmax, tries = 150) {
  for (let k = 0; k < tries; k++) {
    const a = rnd() * TAU, r = rr(rmin, rmax), x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r;
    if (spotOK(x, z)) return { x, z };
  }
  return null;
}
// a short walk is fine if the ground stays wadeable the whole way
function walkable(a, b) {
  for (let k = 1; k < 10; k++) {
    const u = k / 10, x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u, h = getHeight(x, z);
    if (h < -0.9 || h > 0.6 || volcanoDist(x, z) < 30) return false;
  }
  return true;
}

class Flamingo {
  constructor(i, home, flock) {
    this.plumage = pickPlumage();
    const rig = makeFlamingoModel(this.plumage);
    this.rigged = !!rig;
    Object.assign(this, rig || makeFlamingo());
    this.group = new THREE.Group(); this.group.add(this.root); fauna.add(this.group); this.group.scale.setScalar(rr(0.92, 1.1));
    this.home = home;
    const a = rnd() * TAU, r = Math.sqrt(rnd());
    this.off = { x: Math.cos(a) * r, z: Math.sin(a) * r };       // where this bird sits in the flock, inside the flock's spread
    this.hoff = rr(-0.35, 0.35);                                  // its own heading while feeding
    const p0 = flock.slot(this);
    this.x = p0.x; this.z = p0.z; this.heading = flock.heading; this.state = 'stand'; this.t = rr(1, 4); this.ph = rnd() * 6;
    this.one = rnd() < 0.5 ? 1 : 0; this.oneT = this.one; this.oneVal = this.one;
    this.w = { feed: 0, preen: 0, flick: 0, fly: 0, run: 0 }; this.mv = 0; this.feed = 0; this.feedT = 0; this.speed = 0; this.fp = rnd() * 6;
    register({ id: 'flamingo' + i, name: 'Greater flamingo', cat: 'Birds', group: this.group, sim: this, viewDist: 8, desc: 'Wades the shallows where the river meets the lagoon, sweeping its bent bill through the silt for shrimp.', pickR: 1.5, pickY: 1.2 });
  }
  wadeSpot(cx, cz, rmin, rmax) {
    for (let k = 0; k < 20; k++) {
      const a = rnd() * TAU, r = rr(rmin, rmax), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, h = getHeight(x, z);
      if (h > -0.65 && h < 0.35) return { x, z };
    }
    return null;
  }
  updateRigged(dt, t, F) {
    // hold this bird's place in the flock, and nudge apart from anyone too close
    const p = F.slot(this);
    const px = this.x, pz = this.z;
    this.x = damp(this.x, p.x, 5, dt); this.z = damp(this.z, p.z, 5, dt);
    for (const o of F.members) {
      if (o === this) continue;
      const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz);
      if (d < 1.6 && d > 1e-3) { const push = (1.6 - d) * 1.5 * dt; this.x += (dx / d) * push; this.z += (dz / d) * push; }
    }
    const vx = (this.x - px) / dt, vz = (this.z - pz) / dt, sp = Math.hypot(vx, vz);
    const flying = F.state === 'fly';
    const running = F.state === 'run' || F.state === 'brake';   // the run to take off, and the run to stop after landing
    // face the flock's way while it grazes (each bird a little off), and the way it's moving otherwise
    const want = F.state === 'graze' ? F.heading + this.hoff : sp > 0.2 ? Math.atan2(vx, vz) : F.heading;
    this.heading = steer(this.heading, want, dt * 3);
    this.group.position.set(this.x, flying ? F.alt : Math.max(getHeight(this.x, this.z), -0.2), this.z);
    this.group.rotation.y = this.heading;

    // what this bird is doing: flying, running, walking with the flock, or feeding / preening / flicking / standing while it grazes
    if (F.state !== 'graze') { this.t = 0; this.state = flying ? 'fly' : running ? 'run' : 'stand'; }
    else {
      this.t -= dt;
      if (this.t < 0) {
        const r = rnd();
        if (r < 0.42) { this.state = 'feed'; this.t = rr(6, 11); }
        else if (r < 0.6) { this.state = 'stand'; this.t = rr(3, 6); }
        else if (r < 0.75) { this.state = 'preen'; this.t = rr(3, 5); }
        else if (r < 0.85) { this.state = 'flick'; this.t = 1.6; }
        else { this.one = this.one ? 0 : 1; this.state = 'stand'; this.t = rr(4, 9); }
      }
    }
    this.mv = damp(this.mv, sp > 0.15 && !flying ? 1 : 0, 6, dt);
    this.ph += dt * Math.min(sp, 3.5) * 4;
    // the wings beat continuously while the flock flies or runs: one beat is about a third of a second
    this.fp += dt * FLAP_RATE;
    this.oneT = this.state === 'stand' ? this.one : 0;
    this.oneVal = damp(this.oneVal, this.oneT, 4, dt);
    for (const key of ['feed', 'preen', 'flick', 'fly', 'run']) this.w[key] = damp(this.w[key], this.state === key ? 1 : 0, key === 'fly' || key === 'run' ? 3 : 4, dt);
    const { feed: f, preen: pr, flick: kf, fly: y, run: rn } = this.w;

    // neck, head and wings: the blend of the poses that are on (feeding head-down, preening, flicking, flying, running)
    const bob = Math.sin(this.ph * 2) * 0.08 * this.mv * (1 - f) * (1 - y) * (1 - rn);
    this.necks[0].rotation.x = f * 1.95 - pr * 0.45 - kf * 0.2 + y * 1.25 + rn * 0.5;
    this.necks[1].rotation.x = f * -0.5 + pr * 0.8 - y * 0.75 - rn * 0.3;
    this.necks[2].rotation.x = f * 0.5 + pr * 0.9 + y * 0.1;
    this.head.rotation.set(bob, f * Math.sin(t * 2.6 + this.ph) * 0.5, f * Math.PI);
    this.billLow.rotation.x = f * (-0.2 - 0.08 * Math.sin(t * 6));
    // a full beat: the wings go up above the back on the upstroke and down past the flank on the downstroke
    const beat = Math.sin(this.fp);
    const wing = kf * (1.15 + 0.12 * Math.sin(t * 9)) + y * (0.3 + 0.8 * beat) + rn * (0.2 + 0.65 * beat);
    this.wings[0].rotation.z = -wing; this.wings[1].rotation.z = wing;
    this.body.rotation.x = y * 0.05;
    this.body.position.y = 0.9 + Math.abs(Math.sin(this.ph)) * 0.012 * this.mv;

    // legs: a walking gait on the ground, a longer stride when running, the one-legged rest, and trailing legs in flight
    for (let i = 0; i < 2; i++) {
      const lp = this.ph + (i ? Math.PI : 0);
      let hip = (0.38 + 0.22 * rn) * Math.sin(lp) * this.mv, knee = (0.8 + 0.2 * rn) * Math.max(0, -Math.sin(lp)) * this.mv;
      if (i === 1) { hip = hip * (1 - this.oneVal) - 1.25 * this.oneVal; knee = knee * (1 - this.oneVal) + 2.1 * this.oneVal; }
      hip = hip * (1 - y) + 0.9 * y; knee = knee * (1 - y) + 0.25 * y;
      this.hips[i].rotation.x = hip; this.knees[i].rotation.x = knee; this.ankles[i].rotation.x = -knee * 0.6 - y * 0.2;
    }
  }
  updateProcedural(dt, t) {
    this.t -= dt;
    let moving = false;
    if (this.state === 'stand') {
      this.speed = damp(this.speed, 0, 6, dt);
      this.feedT = 0; this.oneT = this.one;
      if (this.t < 0) {
        const r = rnd();
        if (r < 0.4) { this.state = 'feed'; this.t = rr(4, 9); }
        else if (r < 0.8) {
          const s = this.wadeSpot(this.x, this.z, 2, 7);
          if (s && Math.hypot(s.x - this.home.x, s.z - this.home.z) < 22) { this.tx = s.x; this.tz = s.z; this.state = 'walk'; } else this.t = 2;
        } else { this.one = this.one ? 0 : 1; this.t = rr(3, 7); }
      }
    } else if (this.state === 'feed') {
      this.feedT = 1; this.oneT = 0; this.speed = damp(this.speed, 0.0, 6, dt);
      if (this.t < 0) { this.state = 'stand'; this.t = rr(2, 6); }
    } else {
      this.feedT = 0; this.oneT = 0;
      const dx = this.tx - this.x, dz = this.tz - this.z;
      this.heading = steer(this.heading, Math.atan2(dx, dz), dt * 2);
      this.speed = damp(this.speed, 0.9, 3, dt);
      this.x += Math.sin(this.heading) * this.speed * dt; this.z += Math.cos(this.heading) * this.speed * dt;
      moving = true;
      if (Math.hypot(dx, dz) < 0.8) { this.state = 'stand'; this.t = rr(2, 5); }
    }
    this.feed = damp(this.feed, this.feedT, 3, dt);
    this.one = this.one; this.oneVal = damp(this.oneVal ?? this.one, this.oneT, 4, dt);
    const gh = Math.max(getHeight(this.x, this.z), -0.2);
    this.group.position.set(this.x, gh, this.z);
    this.group.rotation.y = this.heading;
    this.ph += dt * this.speed * 4;
    const w = Math.sin(this.ph);
    // neck pose: standing S-curve vs feeding down
    const f = this.feed;
    this.seg[0].rotation.x = lerp(-0.45, 0.55, f); this.seg[1].rotation.x = lerp(1.1, 0.9, f); this.seg[2].rotation.x = lerp(-0.55, 0.9, f);
    this.head.rotation.x = lerp(0.1, 0.5, f) + 0.12 * Math.sin(t * 5 + this.ph) * f;
    this.seg[0].rotation.z = Math.sin(t * 0.7 + this.x) * 0.06;
    const one = this.oneVal;
    this.legs[0].hip.rotation.x = w * 0.4 * (moving ? 1 : 0);
    this.legs[1].hip.rotation.x = -w * 0.4 * (moving ? 1 : 0) - 1.1 * one;
    this.legs[1].knee.rotation.x = 1.9 * one;
    this.body.position.y = 1.0 + 0.0;
    this.body.rotation.x = 0.1 * f;
  }
}

/** a flock of greater flamingos: one centre, heading and spread that every bird holds a slot in */
class FlamingoFlock {
  constructor(home, n) {
    const s = spotOK(home.x, home.z) ? home : findSpot(home, 0, 12, 80) || home;
    this.c = { x: s.x, z: s.z }; this.anchor = { x: s.x, z: s.z };
    this.heading = rnd() * TAU; this.spread = 3.2; this.alt = 0;
    this.state = 'graze'; this.t = rr(5, 9);                  // the first move comes soon
    this.wanderH = this.heading; this.wanderT = 0; this.fly = null; this.walkDest = null; this.flushCool = 0;
    this.members = [];
    for (let i = 0; i < n; i++) this.members.push(new Flamingo(i, home, this));
    this.rigged = this.members.every((m) => m.rigged);
  }
  slot(m) {
    const s = this.spread, h = this.heading, lx = m.off.x * s, lz = m.off.z * s;
    return { x: this.c.x + lx * Math.cos(h) + lz * Math.sin(h), z: this.c.z - lx * Math.sin(h) + lz * Math.cos(h) };
  }
  update(dt, t) {
    if (!this.rigged) { for (const m of this.members) m.updateProcedural(dt, t); return; }
    this.flushCool -= dt;
    // someone walking up to the flock sends the whole flock into the air
    const cdx = this.c.x - camera.position.x, cdz = this.c.z - camera.position.z, cd = Math.hypot(cdx, cdz);
    if ((this.state === 'graze' || this.state === 'walk') && this.flushCool <= 0 && cd < 9 && camera.position.y - getHeight(this.c.x, this.c.z) < 6) {
      const far = findSpot(this.c, 70, 190);
      if (far) { this.startRun(far); this.flushCool = 25; } else this.flushCool = 5;
    }
    if (this.state === 'fly') this.updateFly(dt);
    else if (this.state === 'run') this.updateRun(dt);
    else if (this.state === 'brake') this.updateBrake(dt);
    else if (this.state === 'walk') this.updateWalk(dt);
    else {
      this.updateGraze(dt);
      this.t -= dt;
      if (this.t < 0) this.pickNext();
    }
    this.spread = damp(this.spread, this.state === 'fly' ? 1.4 : this.state === 'graze' ? 3.2 : 2.2, 2, dt);
    for (const m of this.members) m.updateRigged(dt, t, this);
  }
  // feeding on the spot: the flock drifts about a few metres from where it landed
  updateGraze(dt) {
    this.wanderT -= dt;
    if (this.wanderT < 0) { this.wanderH = rnd() * TAU; this.wanderT = rr(4, 9); }
    const dA = Math.hypot(this.c.x - this.anchor.x, this.c.z - this.anchor.z);
    const dir = dA > 4 ? Math.atan2(this.anchor.x - this.c.x, this.anchor.z - this.c.z) : this.wanderH;
    const nx = this.c.x + Math.sin(dir) * 0.12 * dt, nz = this.c.z + Math.cos(dir) * 0.12 * dt;
    if (spotOK(nx, nz)) { this.c.x = nx; this.c.z = nz; }
    this.heading = steer(this.heading, dir, dt * 0.6);
  }
  // time to move on: walk to a pool nearby, or fly to one far off
  pickNext() {
    const near = findSpot(this.c, 14, 40, 30);
    if (near && walkable(this.c, near) && rnd() < 0.6) { this.walkDest = near; this.state = 'walk'; return; }
    const far = findSpot(this.c, 70, 190);
    if (far) this.startRun(far); else this.t = 8;
  }
  // the take-off run: the flock runs across the water in the direction it's going, wings going, before the lift-off
  startRun(dest) {
    this.state = 'run'; this.runT = RUN_TIME; this.runDest = { x: dest.x, z: dest.z }; this.walkDest = null;
  }
  updateRun(dt) {
    const d = this.runDest, dx = d.x - this.c.x, dz = d.z - this.c.z;
    this.heading = steer(this.heading, Math.atan2(dx, dz), dt * 2);
    this.c.x += Math.sin(this.heading) * RUN_SPEED * dt; this.c.z += Math.cos(this.heading) * RUN_SPEED * dt;
    this.runT -= dt;
    if (this.runT < 0) this.startFlight(this.runDest);
  }
  // the landing run: the flock runs on after touching down and slows to a stop
  updateBrake(dt) {
    const k = Math.max(0, this.brakeT / BRAKE_TIME);
    this.c.x += Math.sin(this.heading) * RUN_SPEED * k * dt; this.c.z += Math.cos(this.heading) * RUN_SPEED * k * dt;
    this.brakeT -= dt;
    if (this.brakeT < 0) this.arrive(this.c);
  }
  updateWalk(dt) {
    const d = this.walkDest, dx = d.x - this.c.x, dz = d.z - this.c.z, dist = Math.hypot(dx, dz);
    this.heading = steer(this.heading, Math.atan2(dx, dz), dt * 2);
    const step = Math.min(dist, WALK_SPEED * dt);
    this.c.x += Math.sin(this.heading) * step; this.c.z += Math.cos(this.heading) * step;
    if (dist < 1.0) this.arrive(d);
  }
  arrive(p) {
    this.c = { x: p.x, z: p.z }; this.anchor = { x: p.x, z: p.z };
    this.state = 'graze'; this.t = rr(30, 60); this.wanderT = 0; this.fly = null; this.walkDest = null;
  }
  // a flight is a curved path (a quadratic bezier) that bows out around the volcano if it would pass close to it
  startFlight(dest) {
    const P0 = { x: this.c.x, z: this.c.z }, P1 = { x: dest.x, z: dest.z };
    const mx = (P0.x + P1.x) / 2, mz = (P0.z + P1.z) / 2;
    let M = { x: mx, z: mz };
    const dv = Math.hypot(mx - VOL.x, mz - VOL.z);
    if (dv < VOL.R + 30) { const k = (VOL.R + 40) / Math.max(dv, 1); M = { x: VOL.x + (mx - VOL.x) * k, z: VOL.z + (mz - VOL.z) * k }; }
    let ground = 0;
    for (let k = 0; k <= 10; k++) {
      const u = k / 10, a = 1 - u;
      ground = Math.max(ground, getHeight(a * a * P0.x + 2 * u * a * M.x + u * u * P1.x, a * a * P0.z + 2 * u * a * M.z + u * u * P1.z));
    }
    const len = Math.hypot(P1.x - P0.x, P1.z - P0.z);
    this.fly = {
      P0, M, P1, dur: Math.max(6, len / FLY_SPEED), u: 0, cruise: Math.max(ground, 0) + FLY_CLEAR,
      g0: Math.max(getHeight(P0.x, P0.z), -0.2), g1: Math.max(getHeight(P1.x, P1.z), -0.2),
      // the climb and the descent each take about CLIMB_DIST metres of travel, so the flock rises at a shallow angle, not a jump
      climbF: Math.min(0.45, CLIMB_DIST / Math.max(len, 1)),
    };
    this.state = 'fly'; this.alt = this.fly.g0; this.walkDest = null;
  }
  updateFly(dt) {
    const F = this.fly;
    F.u = Math.min(1, F.u + dt / F.dur);
    const u = F.u, a = 1 - u;
    this.c.x = a * a * F.P0.x + 2 * u * a * F.M.x + u * u * F.P1.x;
    this.c.z = a * a * F.P0.z + 2 * u * a * F.M.z + u * u * F.P1.z;
    const dx = 2 * a * (F.M.x - F.P0.x) + 2 * u * (F.P1.x - F.M.x), dz = 2 * a * (F.M.z - F.P0.z) + 2 * u * (F.P1.z - F.M.z);
    this.heading = steer(this.heading, Math.atan2(dx, dz), dt * 2.5);
    this.alt = Math.min(F.g0 + (F.cruise - F.g0) * smooth01(u / F.climbF), F.g1 + (F.cruise - F.g1) * smooth01((1 - u) / F.climbF));
    if (F.u >= 1) {
      // touched down: run on and slow to a stop, then settle to feed
      this.state = 'brake'; this.brakeT = BRAKE_TIME; this.alt = F.g1; this.fly = null;
    }
  }
}

/* ====================================================================== BUTTERFLIES, BATS, FIREFLIES */
function makeButterflies(n) {
  const g = new THREE.BufferGeometry();
  const pos = [0, 0, 0.12, 0.34, 0, 0.1, 0.3, 0, -0.18, 0, 0, 0.12, 0.3, 0, -0.18, 0.0, 0, -0.14,
    0, 0, 0.12, -0.34, 0, 0.1, -0.3, 0, -0.18, 0, 0, 0.12, -0.3, 0, -0.18, 0.0, 0, -0.14];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6, emissive: 0x331a0a });
  mat.customProgramCacheKey = () => 'butterfly';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3][0]*0.7 + instanceMatrix[3][2]*0.3;
        transformed.y += abs(position.x) * sin(uTime*20.0 + ph) * 1.1;`);
  };
  const im = new THREE.InstancedMesh(g, mat, n);
  const cols = ['#ff9a2e', '#4aa8ff', '#ffe14a', '#ffffff', '#ff5d8f'];
  const data = [];
  for (let i = 0; i < n; i++) {
    im.setColorAt(i, new THREE.Color(pick(cols)));
    const c = randomSpot(rr(-80, 60), rr(-40, 80), 0, 1, { minH: 3 }, 50);
    data.push({ cx: c ? c.x : 0, cz: c ? c.z : 0, a: rr(0.2, 0.5), b: rr(0.3, 0.7), c: rr(0.25, 0.5), p: rnd() * 6, R: rr(3, 9), x: 0, y: 0, z: 0, hx: 0, hz: 1 });
  }
  im.instanceColor.needsUpdate = true;
  im.castShadow = false; im.frustumCulled = false;
  scene.add(im);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1.4, 1.4, 1.4);
  updaters.push((dt, t) => {
    const vis = env.day > 0.25;
    im.visible = vis;
    if (!vis) return;
    for (let i = 0; i < n; i++) {
      const d = data[i];
      const x = d.cx + Math.sin(t * d.a + d.p) * d.R + Math.sin(t * d.a * 2.3) * 1.5, z = d.cz + Math.cos(t * d.b + d.p * 1.7) * d.R;
      const y = getHeight(x, z) + 1.2 + Math.sin(t * d.c * 3 + d.p) * 0.7 + 0.5 * Math.sin(t * 2 + d.p);
      const hx = x - d.x, hz = z - d.z;
      if (hx * hx + hz * hz > 1e-6) { d.hx = hx; d.hz = hz; }
      d.x = x; d.z = z;
      e.set(0.2 * Math.sin(t * 3 + d.p), Math.atan2(d.hx, d.hz), 0.3 * Math.sin(t * 2 + d.p));
      q.setFromEuler(e);
      m.compose(p.set(x, y, z), q, sc);
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
  });
}

class BatFlock {
  constructor(n) {
    this.bats = [];
    const wm = M('#241c26', { side: THREE.DoubleSide });
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      g.add(sphere(0.1, '#2b2330', 1, 0.9, 1.5));
      const wings = [];
      for (const s of [-1, 1]) {
        const w = new THREE.Group();
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.08, s * 0.5, 0.0, 0.0, 0, 0, -0.12, s * 0.5, 0, 0, s * 0.3, 0, -0.2, 0, 0, -0.12], 3));
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, wm); w.add(m); g.add(w); wings.push(w);
      }
      g.scale.setScalar(1.7);
      g.visible = false;
      fauna.add(g);
      this.bats.push({ g, wings, a: rr(0.15, 0.3), b: rr(0.2, 0.35), p: rnd() * 6, R: rr(25, 70), alt: rr(18, 40), cx: rr(-40, 20), cz: rr(-45, 10), fl: rnd() * 6, lx: 0, lz: 0, hx: 0, hz: 1 });
    }
    updaters.push((dt, t) => this.update(dt, t));
    this.dummy = { group: this.bats[0].g };
  }
  update(dt, t) {
    const a = clamp((env.night + env.dusk * 0.6 - 0.35) * 2.5, 0, 1);
    for (const b of this.bats) {
      b.g.visible = a > 0.05;
      if (!b.g.visible) continue;
      const x = b.cx + Math.sin(t * b.a + b.p) * b.R, z = b.cz + Math.cos(t * b.b + b.p * 1.3) * b.R * 0.8;
      const y = getHeight(x, z) + b.alt + Math.sin(t * 0.9 + b.p) * 4;
      const hx = x - b.lx, hz = z - b.lz;
      if (hx * hx + hz * hz > 1e-6) { b.hx = hx; b.hz = hz; }
      b.lx = x; b.lz = z;
      b.g.position.set(x, y, z);
      b.g.rotation.set(0.15 * Math.sin(t * 5 + b.p), Math.atan2(b.hx, b.hz), 0.3 * Math.sin(t * 0.7 + b.p));
      const f = Math.sin(t * 16 + b.p);
      b.wings[0].rotation.z = -f * 0.8; b.wings[1].rotation.z = f * 0.8;
    }
  }
}

function makeFireflies() {
  const n = 170;
  const ps = new Particles(n, { additive: true, soft: 1, order: 8 });
  const anchors = [];
  const add = (x, z, r, k) => { for (let i = 0; i < k; i++) { const a = rnd() * TAU, d = rnd() * r; anchors.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, p: rnd() * 6, s: rr(0.4, 1.1), ph: rr(0, 6), H: rr(0.6, 3.5) }); } };
  add(FAIRY.x, FAIRY.z, 16, 55);
  add(falls.pool.x, falls.pool.z + 12, 22, 40);
  add(-30, 20, 40, 25); add(10, 40, 30, 25); add(TEMPLE.x, TEMPLE.z, 24, 25);
  for (let i = 0; i < n; i++) ps.emit({ x: 0, y: 0, z: 0, life: 1e9, s0: 0.4, s1: 0.4, c0: [0.8, 1, 0.4, 0] });
  updaters.push((dt, t) => {
    const a = clamp((env.night + env.dusk * 0.3 - 0.2) * 2, 0, 1);
    for (let i = 0; i < n; i++) {
      const f = anchors[i % anchors.length];
      const x = f.x + Math.sin(t * 0.5 * f.s + f.p) * 3.5 + Math.sin(t * 1.3 + f.p) * 0.8, z = f.z + Math.cos(t * 0.43 * f.s + f.p) * 3.5;
      const y = getHeight(x, z) + f.H + Math.sin(t * 0.8 + f.p) * 0.8;
      ps.p[i * 3] = x; ps.p[i * 3 + 1] = y; ps.p[i * 3 + 2] = z;
      const blink = Math.pow(0.5 + 0.5 * Math.sin(t * 1.9 + f.ph), 4);
      ps.aColor[i * 4] = 0.8; ps.aColor[i * 4 + 1] = 1; ps.aColor[i * 4 + 2] = 0.35; ps.aColor[i * 4 + 3] = a * (0.15 + 0.85 * blink);
      ps.aSize[i] = 0.7;
      ps.age[i] = 0;
    }
  });
  // keep particle system update from touching our values
  ps.update = () => { ps.geo.attributes.position.needsUpdate = true; ps.geo.attributes.aColor.needsUpdate = true; ps.geo.attributes.aSize.needsUpdate = true; };
}

/* ====================================================================== BUILD */
export function buildLandFauna(ctx) {
  const homes = [{ x: TEMPLE.x + 6, z: TEMPLE.z + 12 }, { x: TEMPLE.x - 22, z: TEMPLE.z + 24 }, { x: -20, z: 90 }];
  const mk = [];
  let mi = 0;
  [[0, 4], [1, 3], [2, 2]].forEach(([h, n]) => { for (let i = 0; i < n; i++) mk.push(new Monkey(homes[h], mi++, ctx)); });
  const boars = spawnBoars(ctx);
  // The capybaras that lived here are gone. Their code drew 128 numbers from the world's random stream; spending them keeps every later placement where it was.
  burn(128);
  // crabs: red beach crabs and tiny ghost crabs on the sand, hermits wandering the upper beach, big coconut crabs under the palms
  const crabs = [];
  const placeCrabs = (kind, count, rmin, rmax) => {
    const K = CRAB_KINDS[kind];
    for (let n = 0, t = 0; n < count && t < 4000; t++) {
      const a = rnd() * TAU, r = rr(rmin, rmax), x = Math.cos(a) * r * 1.0, z = Math.sin(a) * r * 0.8 + 5, h = getHeight(x, z);
      if (h > K.h[0] && h < K.h[1] && (kind !== 'coconut' || getSlope(x, z) < 0.35)) { crabs.push(new Crab(crabs.length, { x, z }, kind)); n++; }
    }
  };
  placeCrabs('red', 8, 60, 170); placeCrabs('ghost', 6, 60, 175); placeCrabs('hermit', 5, 60, 170); placeCrabs('coconut', 3, 40, 150);
  // flamingos at the river mouth
  const fh = (() => {
    for (let k = 0; k < 400; k++) {
      const x = rr(COVE.x - 28, COVE.x + 28), z = rr(COVE.z - 36, COVE.z - 10), h = getHeight(x, z);
      if (h > -0.5 && h < 0.2) return { x, z };
    }
    return { x: COVE.x, z: COVE.z - 30 };
  })();
  const flams = new FlamingoFlock(fh, 7);


  // the island rats (prey for everything), and the predators that live on them: barn owls and Pacific boas. All three place themselves with their own generators.
  const rats = spawnRats(ctx, falls.camp);
  const owls = spawnOwls(ctx);
  const boas = spawnBoas();
  // the troop: 48 monkeys in all (?monkeys=N sets the count, for tests). Created after the rest of the island, so nothing else moves.
  const troop = Math.max(0, (Number(new URLSearchParams(location.search).get('monkeys')) || 48) - mk.length);
  for (let i = 0; i < troop; i++) mk.push(new Monkey(homes[i % 3], mi++, ctx));
  const all = [...mk, ...boars, ...crabs, flams, ...rats, ...owls, ...boas];
  updaters.push((dt, t) => {
    const d = Math.min(dt, 0.05);
    updateContests(MONKEYS, d);
    for (const a of all) a.update(d, t);
  });
  makeButterflies(32);
  new BatFlock(16);
  makeFireflies();
  return { monkeys: mk, boars, rats, owls, boas, crabs, flams, fh };
}
