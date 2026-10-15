import * as THREE from 'three';
import { scene, updaters, U, env, camera, events, creatures } from './core.js';
import { M, box, cyl, mesh, MB, C, shade, mat4, lumpy } from './gfx.js';
import { blob as sphere, cone, eye, makeBird, BIRD_SPECS } from './creatures.js';
import { FrigatebirdColony } from './frigatebird.js';
import { LorikeetFlock } from './lorikeet_flock.js';
import { makeTernModel } from './tern_model.js';
import { getHeight, perchesNear, COVE, VOL, falls, TEMPLE } from './world.js';
import { motuPalms } from './flora2.js';
import { fauna, register, steer } from './fauna_common.js';
import { fx } from './props.js';
import { wake as waterWake, waterY as seaY } from './ripples.js';
import { makeDolphinModel } from './dolphin_model.js';
import { makeSharkModel } from './shark_model.js';
import { makeSeaEagleModel } from './sea_eagle_model.js';
import { makeTurtleModel } from './turtle_model.js';
import { makeWhaleModel } from './whale_model.js';
import { makeGullModel, gullModelsReady } from './gull_model.js';
import { rnd, rr, pick, clamp, lerp, damp, angDiff, smoothstep, burn, mulberry32, TAU } from './util.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeYellowTangModel, yellowTangReady } from './yellow_tang_model.js';
import { createSchool, updateSchool, SCHOOL_PROFILE } from './school_mind.js';

// the shared school intelligence (school_mind.js) drives the procedural schools. false returns to the earlier per-fish loop below
export const SCHOOLS_NEW = true;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/* ====================================================================== bird rig */
function flapWings(b, phase, amp, fold = 0, glide = 0) {
  for (const w of b.wings) {
    const f = Math.sin(phase) * amp;
    w.sh.rotation.z = lerp(w.sg * (f + 0.08 + glide * 0.12), w.sg * -0.75, fold);
    w.el.rotation.z = lerp(w.sg * (Math.sin(phase - 0.9) * amp * 0.75 - 0.05), w.sg * 1.2, fold);
    w.sh.scale.x = lerp(1, 0.3, fold);
  }
}
const EAGLE = BIRD_SPECS.eagle;

/* ====================================================================== silver gulls */
// The Codex silver gull models are drawn at about twice life size (a 1.8 m span); 0.5 gives a 42 cm bird with a 0.9 m span.
const GULL_SCALE = 0.5;
const GULL_SPECIES = 'Silver gull';   // Chroicocephalus novaehollandiae
const GULL_DESC = 'Compact, coastal and opportunistic. White below, pale grey above with black-tipped wings. Loafs on the sand and calm water, and patrols the shore for scraps and small fish.';

/** a place to rest: sand just above the tideline, or shallow lagoon water where the gull floats */
function findPerch(c) {
  // about a third of the time a gull picks the crown of a boulder on the shore, a good lookout
  if (rnd() < 0.35) {
    const rocks = perchesNear(c.x, c.z, c.r1, (p) => p.kind === 'beach' || p.kind === 'river');
    if (rocks.length) { const p = rocks[Math.floor(rnd() * Math.min(rocks.length, 8))]; return { x: p.x, z: p.z, y: p.y, water: false, rock: true }; }
  }
  for (let k = 0; k < 60; k++) {
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * c.r1 * 0.9;
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, h = getHeight(x, z);
    if (h > 0.05 && h < 2.6) return { x, z, y: h, water: false };
    if (h < -0.15 && h > -2.2) return { x, z, y: env.tide, water: true };
  }
  return null;
}
/** a shoreline point to patrol toward, staying near this bird's home range */
function findCoastTarget(c, from) {
  for (let k = 0; k < 40; k++) {
    const a = rnd() * TAU, r = rr(15, 60);
    const x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r;
    if (Math.hypot(x - c.x, z - c.z) > c.r1) continue;
    const h = getHeight(x, z);
    if (h > -2.5 && h < 3) return { x, z };
  }
  return { x: c.x, z: c.z };
}
/** shallow water near the bird for a foraging plunge */
function findWaterSpot(from) {
  for (let k = 0; k < 30; k++) {
    const a = rnd() * TAU, r = rr(10, 25);
    const x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r, h = getHeight(x, z);
    if (h < -0.3 && h > -2.5) return { x, z };
  }
  return null;
}

/* A silver gull's states: perch (loafing, preening, floating on calm water) -> take off -> coastal patrol (flap, glide, bank)
   -> either land, or make a rare shallow foraging plunge and carry on patrolling. A visitor close by flushes it. */
class Gull {
  constructor(i, c) {
    this.variant = i % 3 === 2 ? 'juvenile' : 'adult';   // about a third of the flock is immature
    const m = makeGullModel(this.variant);
    this.root = m.root; this.mixer = m.mixer; this.actions = m.actions; this.current = null;
    this.group = new THREE.Group(); this.group.add(this.root); fauna.add(this.group);
    this.group.scale.setScalar(GULL_SCALE * rr(0.94, 1.06));
    this.c = c; this.heading = rnd() * TAU; this.speed = 0; this.vy = 0; this.pitch = 0; this.roll = 0;
    this.pos = new THREE.Vector3();
    this.perch = findPerch(c) || { x: c.x, z: c.z, y: getHeight(c.x, c.z), water: false };
    this.target = null; this.diveSpot = null; this.glideT = 0; this.flapT = rr(3, 6); this.preenT = rr(6, 14); this.preening = 0;
    this.pos.set(this.perch.x, this.perch.water ? env.tide : this.perch.y, this.perch.z);
    this.state = 'perch'; this.stateT = rr(10, 30);
    register({ id: 'gull' + i, name: GULL_SPECIES, cat: 'Birds', group: this.group, sim: this, viewDist: 10, desc: GULL_DESC, pickR: 2.5, pickY: 0.2 });
  }
  setClip(name, rate = 1) {
    const next = this.actions.get(name);
    if (!next) return;
    next.setEffectiveTimeScale(rate);
    if (next === this.current) return;
    // fade the old clip out and the new one in; every other clip is stopped, so none can hold a stale pose
    for (const a of this.actions.values()) if (a !== next && a !== this.current) a.stop();
    const prev = this.current;
    next.reset().setEffectiveTimeScale(rate).fadeIn(0.3).play();
    if (prev) prev.fadeOut(0.3);
    this.current = next;
  }
  enter(state, t) { this.state = state; this.stateT = t; }
  takeOff() { if (this.state === 'perch' && this.perch && this.perch.water) fx.splash(this.pos.x, this.pos.y, this.pos.z, 0.25, { quiet: true }); this.enter('takeoff', 1.3); this.vy = 3.5; this.speed = 4; this.setClip('Flight_Takeoff'); }
  moveForward(dt) { this.pos.x += Math.sin(this.heading) * this.speed * dt; this.pos.z += Math.cos(this.heading) * this.speed * dt; }
  /** a gliding gull holds its wings swept back with a slight lift at the wrist and a little dihedral, like a real one, not straight out like a plank */
  sweepWings(dt) {
    if (!this.wings) {
      const f = (n) => { let b = null; this.root.traverse((o) => { if (o.name === n) b = o; }); return b; };
      this.wings = { L: f('WingL'), R: f('WingR'), hL: f('HandL'), hR: f('HandR'), k: 0, applied: null };
    }
    const W = this.wings;
    if (W.applied) { const a = W.applied; W.L.rotation.y -= a.wy; W.R.rotation.y += a.wy; W.L.rotation.z -= a.wz; W.R.rotation.z += a.wz; W.hL.rotation.y -= a.hy; W.hR.rotation.y += a.hy; W.applied = null; }
    return W;
  }
  applyWingSweep(dt) {
    const W = this.wings; if (!W || !W.L) return;
    const cur = this.current, glide = cur === this.actions.get('Flight_Soar_Glide') ? 1 : cur === this.actions.get('Flight_Banked_Turn') ? 0.5 : 0;
    W.k += (glide - W.k) * (1 - Math.exp(-3 * dt));
    if (W.k < 0.01) return;
    const a = { wy: -0.34 * W.k, wz: -0.12 * W.k, hy: -0.5 * W.k };       // a left wing swings back with a negative turn about its own axis; a positive z lowers it, so the lift is negative
    W.L.rotation.y += a.wy; W.R.rotation.y -= a.wy; W.L.rotation.z += a.wz; W.R.rotation.z -= a.wz; W.hL.rotation.y += a.hy; W.hR.rotation.y -= a.hy;
    W.applied = a;
  }
  update(dt, t) {
    this.sweepWings(dt);
    this.mixer.update(dt);
    this.applyWingSweep(dt);
    this.stateT -= dt;
    const flush = Math.hypot(camera.position.x - this.pos.x, camera.position.z - this.pos.z) < 7 && camera.position.y - this.pos.y < 6;
    if (this.state === 'perch') this.updatePerch(dt, flush);
    else if (this.state === 'takeoff') this.updateTakeoff(dt, t);
    else if (this.state === 'patrol') this.updatePatrol(dt, t);
    else if (this.state === 'approach') this.updateApproach(dt);
    else if (this.state === 'dive') this.updateDive(dt);
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
  }
  updatePerch(dt, flush) {
    const p = this.perch;
    this.pos.set(p.x, p.water ? seaY(p.x, p.z) : p.y, p.z);
    if (p.water) { this.ripT = (this.ripT ?? rr(1, 3)) - dt; if (this.ripT < 0) { this.ripT = rr(2.5, 5); fx.plink(p.x, p.z, 0.7); } }
    this.pitch = damp(this.pitch, 0, 4, dt); this.roll = damp(this.roll, 0, 4, dt); this.speed = 0;
    // now and then a preen; the rest of the time a loafing idle with head turns
    this.preenT -= dt;
    if (this.preenT < 0) { this.preening = 4; this.preenT = rr(9, 18); }
    this.preening -= dt;
    this.setClip(p.water ? 'Surface_Rest_Float' : this.preening > 0 ? 'Ground_Preening' : 'Ground_Perch_Idle');
    if (flush || this.stateT < 0) this.takeOff();
  }
  updateTakeoff(dt, t) {
    this.speed = damp(this.speed, 9, 1.5, dt);
    this.vy = damp(this.vy, 4, 2, dt);
    this.moveForward(dt); this.pos.y += this.vy * dt;
    this.pitch = damp(this.pitch, -Math.atan2(this.vy, this.speed) * 0.8, 3, dt); this.roll = damp(this.roll, 0, 3, dt);
    if (this.stateT < 0) {
      this.target = findCoastTarget(this.c, this.pos);
      this.enter('patrol', rr(8, 18)); this.glideT = 0; this.flapT = rr(3, 6);
    }
  }
  updatePatrol(dt, t) {
    const tg = this.target;
    const dx = tg.x - this.pos.x, dz = tg.z - this.pos.z, d = Math.hypot(dx, dz);
    const dh = angDiff(this.heading, Math.atan2(dx, dz));
    this.heading += clamp(dh, -dt * 0.9, dt * 0.9);   // gentle banks, no tight circles
    this.roll = damp(this.roll, clamp(-dh * 0.7, -0.5, 0.5), 2.5, dt);
    // flap for a few seconds, then glide on the breeze
    this.flapT -= dt; this.glideT -= dt;
    if (this.glideT <= 0 && this.flapT <= 0) { this.glideT = rr(2, 4); this.flapT = rr(4, 8); }
    const gliding = this.glideT > 0;
    this.speed = damp(this.speed, gliding ? 9.5 : 8.5, 1.2, dt);
    // a coastal patrol 6 to 12 m above the ground or water
    const ground = Math.max(getHeight(this.pos.x, this.pos.z), env.tide);
    const cruise = ground + 9 + Math.sin(t * 0.3 + this.heading) * 2;
    this.vy = damp(this.vy, clamp((cruise - this.pos.y) * 0.8, -2, 2.5), 2, dt);
    this.moveForward(dt); this.pos.y += this.vy * dt;
    this.pitch = damp(this.pitch, -Math.atan2(this.vy, this.speed) * 0.7, 3, dt);
    this.setClip(Math.abs(dh) > 0.45 ? 'Flight_Banked_Turn' : gliding ? 'Flight_Soar_Glide' : 'Flight_Flap_Cycle');
    if (d < 6) {
      if (this.stateT < 0) { this.perch = findPerch(this.c) || this.perch; this.enter('approach', 25); return; }
      const spot = rnd() < 0.12 ? findWaterSpot(this.pos) : null;
      if (spot) { this.diveSpot = spot; this.dived = false; this.enter('dive', 2.4); this.setClip('Flight_Shallow_Dive'); }
      else this.target = findCoastTarget(this.c, this.pos);
    }
  }
  updateApproach(dt) {
    const p = this.perch;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz);
    const dh = angDiff(this.heading, Math.atan2(dx, dz));
    this.heading += clamp(dh, -dt * 1.2, dt * 1.2);
    this.roll = damp(this.roll, clamp(-dh * 0.6, -0.4, 0.4), 3, dt);
    const landY = p.water ? env.tide : p.y;
    this.speed = damp(this.speed, d < 14 ? 3 : 7, 1.5, dt);
    // come down onto the perch: close in, the height to hold drops to the ground so the touchdown can complete
    const want = landY + (d < 4 ? 0.4 + d * 0.5 : Math.max(1.5, d * 0.5));
    this.vy = damp(this.vy, clamp((want - this.pos.y) * 0.8, -3, 1), 2, dt);
    this.moveForward(dt); this.pos.y += this.vy * dt;
    this.pitch = damp(this.pitch, -Math.atan2(this.vy, this.speed) * 0.7, 3, dt);
    this.setClip(d < 5 ? 'Flight_Landing_Flare' : 'Flight_Flap_Cycle');
    if (d < 1.6 && this.pos.y - landY < 1.2) {
      this.pos.set(p.x, landY, p.z); this.speed = 0; this.vy = 0; this.pitch = 0; this.roll = 0;
      if (p.water) fx.splash(p.x, landY, p.z, 0.22, { quiet: true });
      this.preenT = rr(9, 18); this.enter('perch', rr(12, 32));
    } else if (this.stateT < 0) {
      // could not settle in time: give up the approach and go back to patrolling
      this.target = findCoastTarget(this.c, this.pos); this.enter('patrol', rr(8, 18));
    }
  }
  updateDive(dt) {
    const w = this.diveSpot, dx = w.x - this.pos.x, dz = w.z - this.pos.z;
    this.heading += clamp(angDiff(this.heading, Math.atan2(dx, dz)), -dt * 1.5, dt * 1.5);
    this.speed = damp(this.speed, 9, 1.5, dt);
    this.moveForward(dt);
    // a shallow plunge: down to just above the water, then climbing away
    const phase = clamp(1 - this.stateT / 2.4, 0, 1);
    this.pos.y = damp(this.pos.y, env.tide + 0.9 + 4 * Math.abs(Math.cos(Math.PI * phase)), 6, dt);
    this.pitch = damp(this.pitch, phase < 0.5 ? 0.6 : -0.4, 4, dt);
    if (phase > 0.45 && !this.dived) { this.dived = true; fx.splash(this.pos.x, env.tide, this.pos.z, 0.2, { dir: [Math.sin(this.heading), Math.cos(this.heading)] }); }
    if (this.stateT < 0) { this.target = findCoastTarget(this.c, this.pos); this.enter('patrol', rr(8, 16)); this.setClip('Flight_Flap_Cycle'); }
  }
}

/* ====================================================================== eagle */
class Eagle {
  constructor(i, R, alt, kind = 'eagle', cx = VOL.x + 20, cz = VOL.z + 30) {
    this.cx = cx; this.cz = cz; this.kind = kind;
    this.isSeaEagle = kind === 'eagle';
    this.model = this.isSeaEagle ? makeSeaEagleModel(i === 1 ? 'juvenile' : 'adult') : null;
    this.b = this.model ? null : makeBird(kind === 'eagle' ? EAGLE : BIRD_SPECS.frigate);
    this.group = new THREE.Group(); this.group.add(this.model?.root || this.b.root); fauna.add(this.group);
    this.group.scale.setScalar(this.model ? (i === 1 ? 2.65 : 3.4) : rr(0.85, 1.18));
    this.R = R; this.alt = alt; this.th = rnd() * TAU; this.dir = i % 2 ? 1 : -1;
    this.lx = cx + Math.cos(this.th) * R; this.lz = cz + Math.sin(this.th) * R * 0.82;
    this.p = rnd() * TAU; this.speed = rr(6.5, 9); this.age = i === 1 ? 'juvenile' : 'adult';
    this.bank = 0; this.turnIn = rr(16, 34); this.turning = 0; this.huntIn = rr(30, 60); this.hunt = 0; this.huntPhase = 0; this.h = null;
    this.mode = 'soar'; this.modeIn = rr(20, 46); this.actionName = '';
    if (this.b) this.b.legs.forEach((l) => (l.visible = false));
    this.play('Flight_Soaring_Glide', 0);
    register({ id: kind + i, sim: this, name: this.isSeaEagle ? 'Sea eagle' : 'Great frigatebird', cat: 'Birds', group: this.group, viewDist: 16, desc: this.isSeaEagle ? 'A territorial white-bellied sea eagle rides coastal lift, scans for fish, and makes occasional purposeful hunting stoops.' : 'Scissor-tailed pirate of the trade winds, riding the breeze high above the reef without a single wingbeat.', pickR: 4.5, pickY: 0 });
  }
  play(name, fade = 0.8, once = false) {
    if (!this.model || !this.model.actions.has(name) || this.actionName === name) return;
    const next = this.model.actions.get(name);
    next.reset(); next.enabled = true; next.setEffectiveTimeScale(1); next.setEffectiveWeight(1);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); next.clampWhenFinished = once;
    next.fadeIn(fade).play();
    const old = this.model.actions.get(this.actionName); if (old && old !== next) old.fadeOut(fade);
    this.actionName = name;
  }
  /** where he is on his patrol circle right now (the hunt leaves the circle and rejoins it) */
  orbit(t) {
    const wander = Math.sin(t * 0.11 + this.p) * 7;
    const x = this.cx + Math.cos(this.th) * (this.R + wander);
    const z = this.cz + Math.sin(this.th) * (this.R * 0.82 + Math.sin(t * .17 + this.p) * 5);
    const thermals = 7 * Math.sin(t * .19 + this.p) + 4 * Math.sin(t * .07 + this.p * 2);
    return { x, z, y: Math.max(getHeight(x, z) + 18, this.alt + thermals + (this.mode === 'flap' ? 5 : 0)) };
  }
  /** pick open water within reach and fold the wings: a steep stoop from altitude, talons into the surface, then up and back to the circle */
  startStoop() {
    const p = this.group.position;
    let best = null, bd = 1e9;
    for (let r = 40; r <= 320 && !best; r += 20) {
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * TAU + rnd() * 0.3, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, h = getHeight(x, z);
        if (h < -1.5 && h > -14 && Math.hypot(x, z) < 260) { const d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; best = { x, z }; } }
      }
    }
    if (!best) { this.huntIn = 20; return; }
    const dist = Math.hypot(best.x - p.x, best.z - p.z), h0 = Math.hypot(dist, p.y - 1);
    this.hunt = 1;
    this.h = { x0: p.x, y0: p.y, z0: p.z, tx: best.x, tz: best.z, phase: 'stoop', t: 0, stoopT: clamp(h0 / 26, 4.5, 9), grabT: 0.7, backT: 0, hdg: Math.atan2(best.x - p.x, best.z - p.z), sx: 0, sy: 0, sz: 0, splashed: false };
    this.huntIn = rr(70, 130);
    this.play('Flight_Fishing_Stooping_Dive', 0.5, true);
  }
  stoop(dt, t) {
    const h = this.h; h.t += dt;
    const wy = seaY(h.tx, h.tz);
    const ease = (k) => k * k * (3 - 2 * k) * 0.35 + k * 0.65;               // eases in: gathering speed as he falls
    const alongStoop = (k) => ({ x: lerp(h.x0, h.tx, ease(k)), z: lerp(h.z0, h.tz, ease(k)), y: lerp(h.y0, wy + 0.45, Math.pow(k, 1.7)) });   // most of the height goes in the last third
    let x, y, z, pitch;
    if (h.phase === 'stoop') {
      const k = clamp(h.t / h.stoopT, 0, 1), a = alongStoop(k), b = alongStoop(Math.min(1, k + 0.02));
      x = a.x; y = a.y; z = a.z;
      pitch = clamp(Math.atan2(a.y - b.y, Math.max(Math.hypot(b.x - a.x, b.z - a.z), 1e-3)), 0, 1.15);
      if (k >= 1) { h.phase = 'grab'; h.t = 0; h.sx = x; h.sy = y; h.sz = z; }
    } else if (h.phase === 'grab') {
      const k = clamp(h.t / h.grabT, 0, 1);                                  // skimming the surface, talons down
      x = h.sx + Math.sin(h.hdg) * 12 * h.t; z = h.sz + Math.cos(h.hdg) * 12 * h.t; y = wy + 0.45 - Math.sin(k * Math.PI) * 0.25; pitch = -0.15;
      if (!h.splashed && k > 0.25) { h.splashed = true; fx.splash(x, wy, z, 1.1, { dir: [Math.sin(h.hdg), Math.cos(h.hdg)] }); }
      if (k >= 1) { const o = this.orbit(t); h.phase = 'climb'; h.t = 0; h.sx = x; h.sy = y; h.sz = z; h.backT = clamp(Math.hypot(o.x - x, o.z - z) / 15, 5, 11); this.play('Flight_Slow_Power_Flaps', 0.4); }
    } else {
      const o = this.orbit(t), k = clamp(h.t / h.backT, 0, 1), ek = k * k * (3 - 2 * k);
      x = lerp(h.sx, o.x, ek); z = lerp(h.sz, o.z, ek); y = lerp(h.sy, o.y, 1 - Math.pow(1 - k, 2));
      pitch = -clamp((o.y - h.sy) / Math.max(1, Math.hypot(o.x - h.sx, o.z - h.sz)) * 1.2, 0, 0.5) * (1 - k);
      if (k >= 1) {
        this.hunt = 0; this.h = null; this.lx = x - Math.sin(h.hdg) * 0.4; this.lz = z - Math.cos(h.hdg) * 0.4; this.y = y;
        this.play(this.mode === 'flap' ? 'Flight_Slow_Power_Flaps' : 'Flight_Soaring_Glide', 0.8);
        if (this.model) this.model.mixer.update(dt);
        return;
      }
    }
    const p = this.group.position, mx = x - p.x, mz = z - p.z;
    if (Math.hypot(mx, mz) > 1e-4) h.hdg = steer(h.hdg, Math.atan2(mx, mz), dt * 3);
    this.group.position.set(x, y, z);
    this.group.rotation.set(pitch, h.hdg, 0, 'YXZ');
    this.y = y;
    if (this.model) this.model.mixer.update(dt);
  }
  update(dt, t) {
    if (!this.isSeaEagle) {
      this.th += (9 / this.R) * dt * this.dir;
      const x = this.cx + Math.cos(this.th) * this.R, z = this.cz + Math.sin(this.th) * this.R * 0.85;
      const y = this.alt + Math.sin(t * 0.15 + this.p) * 12;
      const hx = x - this.lx, hz = z - this.lz; this.lx = x; this.lz = z;
      this.group.position.set(x, y, z); this.group.rotation.set(0.03, Math.atan2(hx, hz), -this.dir * 0.28, 'YXZ');
      flapWings(this.b, t * 2.2 + this.p, Math.max(0, Math.sin(t * 0.2 + this.p * 3)) * 0.35, 0, 1);
      return;
    }
    // Wide territorial patrol, with an imperfect ellipse, slow lift drift and route offsets.
    this.modeIn -= dt; this.huntIn -= dt; this.turnIn -= dt;
    if (this.huntIn <= 0 && !this.hunt && this.turning <= 0) this.startStoop();
    if (this.hunt) { this.stoop(dt, t); return; }
    if (this.turnIn <= 0 && this.turning <= 0) {
      this.turning = 2.5; this.turnIn = rr(24, 46);
      this.play('Flight_Banked_Turn', 0.55, true);
    }
    if (this.turning > 0) {
      this.turning = Math.max(0, this.turning - dt);
      if (!this.turning) this.play(this.mode === 'flap' ? 'Flight_Slow_Power_Flaps' : 'Flight_Soaring_Glide', 0.55);
    }
    if (!this.hunt && this.turning <= 0 && this.modeIn <= 0) {
      this.mode = this.mode === 'soar' ? 'flap' : 'soar';
      this.modeIn = this.mode === 'soar' ? rr(22, 48) : rr(2.8, 5.2);
      this.play(this.mode === 'soar' ? 'Flight_Soaring_Glide' : 'Flight_Slow_Power_Flaps', 1.1);
    }
    this.th += (this.speed / this.R) * dt * this.dir;
    const { x, y, z } = this.orbit(t);
    const hx = x - this.lx, hz = z - this.lz, heading = Math.atan2(hx, hz);
    this.lx = x; this.lz = z;
    const turn = clamp(this.dir * 0.18 + Math.sin(t * .13 + this.p) * .08, -.38, .38);
    this.bank = damp(this.bank, -turn, 1.5, dt);
    this.group.position.set(x, y, z);
    this.group.rotation.set(clamp(-Math.atan2(y - (this.y ?? y), Math.hypot(hx, hz)) * .65, -.35, .35), heading, this.bank, 'YXZ');
    this.y = y;
    if (this.model) this.model.mixer.update(dt);
    else flapWings(this.b, t * 2.2 + this.p, this.mode === 'flap' ? .42 : .04, 0, this.mode === 'soar' ? 1 : 0);
  }
}

/* ====================================================================== marine rigs */
function dolphinMesh(scale, col, belly) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const b1 = sphere(0.5, col, 0.85, 0.85, 3.2); body.add(b1);
  const b2 = sphere(0.45, belly, 0.8, 0.5, 2.9); b2.position.y = -0.14; body.add(b2);
  const melon = sphere(0.3, col, 0.9, 0.9, 1.2); melon.position.set(0, 0.05, 1.5); body.add(melon);
  for (const sg of [-1, 1]) { const e = eye(0.05, '#1a1208', '#e8e4dc'); e.position.set(sg * 0.3, 0.1, 1.28); e.rotation.y = sg * 1.3; body.add(e); }
  { const mouth = sphere(0.02, '#3a4650', 1, 1, 14); mouth.position.set(0, -0.07, 1.85); body.add(mouth); }
  const beak = cone(0.16, 0.8, belly, 6); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.05, 2.15); body.add(beak);
  const dorsal = cone(0.22, 0.7, col, 4); dorsal.scale.z = 0.4; dorsal.position.set(0, 0.62, -0.15); dorsal.rotation.x = -0.45; body.add(dorsal);
  for (const s of [-1, 1]) { const fl = cone(0.14, 0.7, col, 4); fl.scale.z = 0.3; fl.position.set(s * 0.45, -0.3, 0.8); fl.rotation.set(0.2, 0, s * 1.4); body.add(fl); }
  const tailP = new THREE.Group(); tailP.position.z = -2.4; body.add(tailP);
  const peduncle = sphere(0.22, col, 0.7, 0.9, 2.2); peduncle.position.z = 0.3; tailP.add(peduncle);
  const flukes = [-1, 1].map((s) => { const f = cone(0.38, 0.9, col, 4); f.scale.set(1, 1, 0.14); f.rotation.set(Math.PI / 2, 0, s * 1.25); f.position.set(s * 0.4, 0, -0.65); tailP.add(f); return f; });
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.scale.setScalar(scale);
  return { root, body, tailP };
}

const DOLPHIN_FAMILY = [
  { variant: 'adultMale', role: 'leader', sex: 'male', age: 'adult', side: 0, behind: 0 },
  { variant: 'adultFemale', role: 'mother', sex: 'female', age: 'adult', side: -4.0, behind: 3.2 },
  { variant: 'adultSlate', role: 'adult', sex: 'unspecified', age: 'adult', side: 4.5, behind: 4.2 },
  { variant: 'juvenile', role: 'juvenile', sex: 'unspecified', age: 'juvenile', side: -6.0, behind: 8.0 },
  { variant: 'juvenile', role: 'juvenile', sex: 'unspecified', age: 'juvenile', side: 6.5, behind: 9.0 },
  { variant: 'calf', role: 'calf', sex: 'unspecified', age: 'calf', side: -5.4, behind: 4.5 },
];

class DolphinPod {
  constructor(index = 0) {
    this.members = [];
    this.podId = index === 0 ? 'north-ocean-pod' : `offshore-pod-${index + 1}`;
    this.target = this.newWaypoint(150, 300);
    this.mode = 'cruise'; this.modeTime = 0; this.modeDuration = 0; this.thinkIn = rr(15, 26);
    this.leapIds = new Set();
    const start = this.newWaypoint(155, 260);
    this.heading = rnd() * TAU;
    for (let i = 0; i < DOLPHIN_FAMILY.length; i++) {
      const member = new Dolphin(i, this, DOLPHIN_FAMILY[i], start, this.heading);
      this.members.push(member);
    }
    this.leader = this.members[0];
    this.mother = this.members.find((d) => d.role === 'mother');
    this.calf = this.members.find((d) => d.role === 'calf');
    this.pickInterest();
  }
  newWaypoint(rMin = 120, rMax = 330) {
    for (let k = 0; k < 32; k++) {
      const a = rnd() * TAU, r = rr(rMin, rMax);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (getHeight(x, z) < -7) return { x, z };
    }
    return { x: 220, z: 20 };
  }
  pickInterest() { this.interest = this.newWaypoint(112, 190); }
  beginMode(mode) {
    this.mode = mode; this.modeTime = 0;
    this.modeDuration = mode === 'rest' ? rr(8, 13) : mode === 'play' ? rr(7, 11) : mode === 'curious' ? rr(8, 14) : rr(6, 10);
    this.members.forEach((d) => { d.modeDelay = rr(0, mode === 'play' ? 3.2 : 1.5); });
    if (mode === 'play') {
      const count = this.members.length;
      this.circleCenter = this.members.reduce((p, d) => ({ x: p.x + d.x / count, z: p.z + d.z / count }), { x: 0, z: 0 });
      this.circleSpeed = rr(0.48, 0.64) * (rnd() < 0.5 ? -1 : 1);
      this.members.forEach((d, i) => { d.circleAngle = TAU * i / count + rr(-0.16, 0.16); d.circleRadius = d.role === 'juvenile' ? rr(9.5, 11.5) : rr(7.5, 9.5); });
      this.leapIds.clear();
      const candidates = this.members.filter((d) => d.role !== 'mother' && d.role !== 'calf');
      this.leapIds.add(pick(candidates).id);
      if (rnd() < 0.48) this.leapIds.add(pick(candidates.filter((d) => !this.leapIds.has(d.id))).id);
    }
    if (mode === 'curious') this.pickInterest();
  }
  update(dt, t) {
    this.thinkIn -= dt;
    if (this.mode !== 'cruise') {
      this.modeTime += dt;
      if (this.modeTime >= this.modeDuration) { this.mode = 'cruise'; this.thinkIn = rr(24, 48); }
    } else if (this.thinkIn <= 0) {
      const r = rnd();
      this.beginMode(r < 0.27 ? 'surface' : r < 0.48 ? 'dive' : r < 0.68 ? 'play' : r < 0.82 ? 'rest' : 'curious');
    }
    const target = this.mode === 'curious' ? this.interest : this.target;
    if (this.mode === 'cruise' || this.mode === 'curious') {
      if (Math.hypot(target.x - this.leader.x, target.z - this.leader.z) < (this.mode === 'curious' ? 18 : 24)) {
        if (this.mode === 'curious') { this.mode = 'cruise'; this.thinkIn = rr(30, 55); }
        else this.target = this.newWaypoint(140, 320);
      }
    }
    for (const member of this.members) member.update(dt, t, target);
  }
}

class Dolphin {
  constructor(i, pod, spec, start, heading) {
    this.id = `${pod.podId}-dolphin${i}`; this.pod = pod; this.role = spec.role; this.sex = spec.sex; this.age = spec.age;
    this.side = spec.side; this.behind = spec.behind; this.variant = spec.variant;
    const imported = makeDolphinModel(spec.variant);
    if (imported) Object.assign(this, imported);
    else {
      const colors = { adultMale: '#6a8da3', adultFemale: '#898179', juvenile: '#9aa6a9', calf: '#536f81', adultSlate: '#46525b' };
      const d = dolphinMesh(spec.age === 'calf' ? 0.62 : spec.age === 'juvenile' ? 0.79 : spec.sex === 'male' ? 1.12 : 1.02, colors[spec.variant], '#dce4e5');
      Object.assign(this, d); this.actions = new Map(); this.mixer = null;
    }
    this.group = new THREE.Group(); this.group.add(this.root); fauna.add(this.group);
    const forwardX = Math.sin(heading), forwardZ = Math.cos(heading), rightX = Math.cos(heading), rightZ = -Math.sin(heading);
    this.x = start.x + rightX * spec.side - forwardX * spec.behind;
    this.z = start.z + rightZ * spec.side - forwardZ * spec.behind;
    this.y = -0.55; this.heading = heading + rr(-0.08, 0.08); this.speed = rr(5.6, 6.7); this.cruiseSpeed = this.speed;
    this.size = rr(0.97, 1.04); this.root.scale.multiplyScalar(this.size);
    this.phase = rnd() * TAU; this.vy = 0; this.pitch = 0; this.roll = 0; this.jumpTime = -1; this.modeDelay = 0; this.leapDelay = rr(0, 3.6);
    this.breachCooldown = rr(30, 70); this.breathTimer = rr(5, 13); this.surfaceBreathing = false;
    this.porpoiseCd = rr(8, 25); this.porpoiseLeft = 0; this.porpoiseGap = 0; this.leap = null;
    this.animName = ''; this.lastClip = '';
    // the spine joints that bend the body into an arch in the air
    this.arch = 0;
    this.spine = [['Spine_Front', 0.16], ['Spine_Mid', 0.3], ['Spine_Rear', 0.32], ['Peduncle', 0.22]].map(([n, w]) => { let b = null; this.root.traverse((o) => { if (!b && o.isBone && o.name.startsWith(n)) b = o; }); return b ? { b, w } : null; }).filter(Boolean);
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
    register({
      id: this.id, name: 'Bottlenose dolphin', cat: 'Sea life', group: this.group, sim: this, viewDist: 18,
      desc: `${spec.age[0].toUpperCase()+spec.age.slice(1)} ${spec.sex} dolphin in a close-knit offshore pod; follows the leader and stays near its family.`,
      pickR: 2.7 * this.size, pickY: 0,
    });
    this.setClip(spec.age === 'calf' ? 'Calf_Swim' : spec.role === 'mother' ? 'Mother_Calf_Paired' : spec.role === 'leader' ? 'Swim_Cruise' : 'Group_Follow', true, rr(.92, 1.08));
  }
  setClip(name, loop = true, rate = 1) {
    if (!this.actions?.size || !this.mixer || this.animName === name) return;
    const next = this.actions.get(name) || this.actions.get('Swim_Cruise');
    if (!next) return;
    const current = this.actions.get(this.animName);
    next.reset(); next.enabled = true; next.setEffectiveWeight(1); next.setEffectiveTimeScale(rate);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1); next.clampWhenFinished = !loop; next.play();
    if (current && current !== next) current.crossFadeTo(next, 0.28, false);
    this.animName = name;
  }
  /** leave the water on a ballistic arc: vy is the take-off climb rate (m/s) */
  launch(vy, clipRate, twist) {
    this.jumpTime = 0; this.vy = vy; this.y = Math.min(this.y, -0.25);
    this.speed = Math.max(this.speed, vy > 6 ? 7.2 : 6.6);
    this.leap = { hs: this.speed, air: (2 * vy) / 9.2, low: vy < 6, twist: twist ? (rnd() < 0.5 ? 1 : -1) : 0 };
    fx.splash(this.x, 0, this.z, vy > 6 ? 1.0 : 0.6, { dir: [Math.sin(this.heading), Math.cos(this.heading)] });
    this.setClip('Playful_Leap', false, clipRate);
  }
  modeFor(t) {
    const pod = this.pod;
    return pod.mode !== 'cruise' && pod.modeTime >= this.modeDelay ? pod.mode : 'cruise';
  }
  update(dt, t, target) {
    this.phase += dt * (2.2 + this.speed * 0.2);
    this.breachCooldown -= dt; this.breathTimer -= dt;
    const mode = this.modeFor(t);
    this.currentMode = mode;
    const lead = this.pod.leader;
    const fwdX = Math.sin(lead.heading), fwdZ = Math.cos(lead.heading), rightX = Math.cos(lead.heading), rightZ = -Math.sin(lead.heading);
    let tx = target.x, tz = target.z;
    if (this.role !== 'leader') {
      let side = this.side, behind = this.behind;
      if (this.role === 'calf' && this.pod.mother) {
        const m = this.pod.mother; const mx = Math.sin(m.heading), mz = Math.cos(m.heading), rx = Math.cos(m.heading), rz = -Math.sin(m.heading);
        tx = m.x + rx * 1.9 - mx * 0.6; tz = m.z + rz * 1.9 - mz * 0.6;
      } else { tx = lead.x + rightX * side - fwdX * behind; tz = lead.z + rightZ * side - fwdZ * behind; }
    }
    if (mode === 'play' && this.role !== 'calf' && this.pod.circleCenter) {
      const angle = this.circleAngle + this.pod.circleSpeed * this.pod.modeTime;
      tx = this.pod.circleCenter.x + Math.cos(angle) * this.circleRadius;
      tz = this.pod.circleCenter.z + Math.sin(angle) * this.circleRadius;
    }
    const dx = tx - this.x, dz = tz - this.z, distance = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const turnRate = mode === 'play' ? 1.15 : mode === 'rest' ? 0.48 : 0.78;
    this.heading = steer(this.heading, want, dt * turnRate);
    // Soft separation prevents overlaps but never breaks the mother/calf pair.
    let avoidX = 0, avoidZ = 0;
    for (const other of this.pod.members) {
      if (other === this) continue;
      if ((this.role === 'calf' && other.role === 'mother') || (this.role === 'mother' && other.role === 'calf')) continue;
      const ox = this.x - other.x, oz = this.z - other.z, d2 = ox * ox + oz * oz;
      if (d2 > 0.01 && d2 < 14) { const w = (14 - d2) / (14 * d2); avoidX += ox * w; avoidZ += oz * w; }
    }
    let desiredSpeed = mode === 'rest' ? 2.8 : mode === 'surface' ? 4.9 : mode === 'dive' ? 6.0 : mode === 'play' ? 7.4 : mode === 'curious' ? 4.5 : (this.role === 'leader' ? this.cruiseSpeed : lead.speed + clamp((distance - Math.hypot(this.side, this.behind)) * 0.13, -1.6, 2.5));
    if (this.role === 'calf' && this.pod.mother) {
      const motherDistance = Math.hypot(this.pod.mother.x - this.x, this.pod.mother.z - this.z);
      desiredSpeed = clamp(this.pod.mother.speed + (motherDistance - 2.5) * 1.05, 2.2, 9.2);
    }
    this.speed = damp(this.speed, clamp(desiredSpeed, 1.8, 9.2), mode === 'rest' ? 1.0 : 1.7, dt);
    if (Math.abs(avoidX) + Math.abs(avoidZ) > 0.001) this.heading = steer(this.heading, Math.atan2(Math.sin(this.heading) + avoidX, Math.cos(this.heading) + avoidZ), dt * 1.8);
    const nx = this.x + Math.sin(this.heading) * 22, nz = this.z + Math.cos(this.heading) * 22;
    if (getHeight(nx, nz) > -5.5) {
      if (this.role === 'leader' && mode === 'cruise') this.pod.target = this.pod.newWaypoint(145, 320);
      const leftH = this.heading + Math.PI * 0.5, rightH = this.heading - Math.PI * 0.5;
      const leftDepth = getHeight(this.x + Math.sin(leftH) * 18, this.z + Math.cos(leftH) * 18);
      const rightDepth = getHeight(this.x + Math.sin(rightH) * 18, this.z + Math.cos(rightH) * 18);
      this.heading = steer(this.heading, this.heading + (leftDepth < rightDepth ? 1 : -1) * 1.3, dt * 1.8);
    }

    if (this.jumpTime >= 0) this.jumpTime += dt;
    const playLeap = this.pod.mode === 'play' && this.pod.leapIds.has(this.id) && this.breachCooldown < 0 && this.pod.modeTime > this.leapDelay;
    // outside rest and dives any dolphin but the calf may also breach on its own, about once a minute
    const idleLeap = this.breachCooldown < 0 && this.role !== 'calf' && this.pod.mode !== 'rest' && this.pod.mode !== 'dive' && rnd() < dt * 0.02;
    // porpoising: the leader starts a run of fast, low arcs and the pod follows, each a beat behind the one before
    if (this.role === 'leader') {
      this.porpoiseCd -= dt;
      if (this.porpoiseCd < 0 && this.jumpTime < 0 && (mode === 'cruise' || mode === 'play' || mode === 'curious')) {
        const n = 3 + Math.floor(rnd() * 4);
        this.pod.members.forEach((d, i) => { if (d.role !== 'calf' || rnd() < 0.7) { d.porpoiseLeft = n; d.porpoiseGap = i * 0.3 + rr(0, 0.5); } });
        this.porpoiseCd = rr(40, 80);
      }
    }
    if (this.jumpTime < 0 && this.porpoiseLeft > 0 && mode !== 'rest' && mode !== 'dive' && (this.porpoiseGap -= dt) <= 0) {
      this.porpoiseLeft--; this.porpoiseGap = rr(0.15, 0.4);
      this.launch(rr(4.2, 5.4), 1.15, false);
    } else if ((playLeap || idleLeap) && this.jumpTime < 0) {
      this.breachCooldown = rr(45, 80);
      this.launch(rr(7.4, 9.6), 0.78, rnd() < 0.3);                            // a full breach, sometimes with a twist about its long axis
    }
    const oldY = this.y;
    if (this.jumpTime >= 0) {
      // a clean ballistic arc: the body follows its velocity, so it leaves nose-up, levels off at the top and re-enters nose-first
      const lp = this.leap;
      this.vy -= 9.2 * dt; this.y += this.vy * dt;
      this.speed = damp(this.speed, lp.hs, 1.5, dt);
      this.pitch = damp(this.pitch, -Math.atan2(this.vy, Math.max(this.speed, 1)), 9, dt);
      this.roll = lp.twist ? lp.twist * TAU * clamp(this.jumpTime / lp.air, 0, 1) : damp(this.roll, 0, 3, dt);
      const wy = seaY(this.x, this.z);
      if (oldY > wy && this.y <= wy && this.vy < 0) fx.splash(this.x, wy, this.z, lp.low ? 1.0 : 1.8, { dir: [Math.sin(this.heading), Math.cos(this.heading)] });
      if (this.y < -0.5 && this.vy < 0) { this.jumpTime = -1; this.y = -0.55; this.vy = 0; this.leap = null; this.roll = 0; this.setClip('Swim_Cruise', true, 1); }
    } else {
      let targetY = -0.48 + Math.sin(this.phase * 0.42) * 0.12;
      if (mode === 'surface') targetY = -0.08 + Math.sin(this.phase * 0.55) * 0.15;
      else if (mode === 'dive') targetY = -6.4 + Math.sin(this.phase * 0.35 + this.side) * 1.4;
      else if (mode === 'rest') targetY = -0.5 + Math.sin(this.phase * 0.28) * 0.07;
      const wave = Math.sin(this.x * 0.018 + t * 1.4) * 0.11 + Math.sin(this.z * 0.021 - t * 1.1) * 0.08;
      this.y = damp(this.y, targetY + (mode === 'surface' || mode === 'rest' ? wave : 0), mode === 'dive' ? 0.85 : 1.8, dt);
      this.pitch = damp(this.pitch, mode === 'dive' ? -0.18 : Math.sin(this.phase * 0.8) * 0.035, 1.8, dt);
      if (mode === 'surface' && this.breathTimer < 0) { this.surfaceBreathing = true; this.breathTimer = rr(4, 8); }
      if (mode !== 'surface') this.surfaceBreathing = false;
    }
    this.x += Math.sin(this.heading) * this.speed * dt; this.z += Math.cos(this.heading) * this.speed * dt;
    const bank = clamp(steer(0, want - this.heading, 1) * -1.8, -0.48, 0.48);
    this.roll = damp(this.roll, bank, 2.4, dt);
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
    if (this.jumpTime < 0 && this.y > -0.9) waterWake(this, this.x, this.z, this.speed, this.role === 'calf' ? 0.45 : 0.8, dt);

    if (this.jumpTime < 0) {
      if (mode === 'surface') this.setClip('Surface_Breath', true, .85);
      else if (mode === 'dive') this.setClip('Dive_Return', true, .92);
      else if (mode === 'rest') this.setClip('Surface_Bob', true, .72);
      else if (mode === 'play') this.setClip('Social_Circle', true, 1.05);
      else if (mode === 'curious') this.setClip('Swim_Idle', true, .8);
      else if (this.role === 'calf') this.setClip('Calf_Swim', true, .9);
      else if (this.role === 'mother' && Math.hypot(this.pod.calf.x - this.x, this.pod.calf.z - this.z) < 7) this.setClip('Mother_Calf_Paired', true, .9);
      else if (this.role !== 'leader') this.setClip('Group_Follow', true, clamp(this.speed / 6, .78, 1.25));
      else if (Math.abs(steer(0, want - this.heading, 1)) > .06) this.setClip('Swim_TurnBank', true, 1.0);
      else this.setClip(this.speed > 7 ? 'Swim_Fast' : 'Swim_Cruise', true, clamp(this.speed / 6.4, .82, 1.22));
    }
    // the body arches over the top of a leap: nose and tail drop away from the high back (a deep arch for a full breach, a shallow one for a porpoise)
    const lpA = this.leap, ph = lpA ? clamp(this.jumpTime / lpA.air, 0, 1) : 0;
    const archT = lpA ? (lpA.low ? 0.5 : 1.15) * Math.pow(Math.sin(Math.PI * Math.min(1, ph * 1.05)), 0.7) : 0;
    this.arch = damp(this.arch, archT, 12, dt);
    // take last frame's arch back off first: a clip does not rewrite every spine bone every frame, so an arch left on would build up and the body would stay bent
    for (const sp of this.spine) if (sp.applied) { sp.b.quaternion.multiply(sp.applied.invert()); sp.applied = null; }
    if (this.mixer) this.mixer.update(dt);
    if (this.arch > 0.01) for (const sp of this.spine) { sp.applied = new THREE.Quaternion().setFromAxisAngle(_archX, -this.arch * sp.w); sp.b.quaternion.multiply(sp.applied); sp.applied = sp.applied.clone(); }
  }
}
const _archQ = new THREE.Quaternion(), _archX = new THREE.Vector3(1, 0, 0);

// the procedural turtle: only used if the green sea turtle model cannot load
function proceduralTurtle() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const shell = sphere(0.5, '#6f6b3c', 1.0, 0.45, 1.3); shell.position.y = 0.05; body.add(shell);
  const plates = sphere(0.45, '#85804a', 0.9, 0.35, 1.2); plates.position.y = 0.16; body.add(plates);
  const under = sphere(0.45, '#d9cf9a', 0.95, 0.3, 1.25); under.position.y = -0.1; body.add(under);
  const head = sphere(0.17, '#8a8a52', 1, 0.9, 1.2); head.position.set(0, 0.05, 0.75); body.add(head);
  for (const s of [-1, 1]) { const e = eye(0.032, '#1a1208', '#ddd8c0'); e.position.set(s * 0.1, 0.1, 0.84); e.rotation.y = s * 1.1; body.add(e); }
  for (const [x, z, big] of [[-1, 0.35, 1], [1, 0.35, 1], [-1, -0.4, 0.55], [1, -0.4, 0.55]]) {
    const p = new THREE.Group(); p.position.set(x * 0.4, -0.02, z); body.add(p);
    const f = cone(0.16 * big, 0.85 * big, '#8a8a52', 4); f.scale.z = 0.25; f.rotation.z = x * Math.PI / 2; f.position.x = x * 0.4 * big; p.add(f);
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return root;
}

// The green turtle grazes the lagoon floor, rests under a ledge, and rises to breathe every minute or two. It
// startles and swims off fast if the castaway comes close. The Blender clips give the body its motion.
const TURTLE_MODE = {
  travel: 'Swimming to a new feeding patch', graze: 'Grazing on the lagoon floor', rest: 'Resting on the lagoon floor',
  breathe: 'Surfacing to breathe', flee: 'Startled, swimming away fast',
};

class Turtle {
  constructor(i) {
    const model = makeTurtleModel();
    this.group = new THREE.Group(); fauna.add(this.group);
    this.root = model ? model.root : proceduralTurtle();
    this.root.scale.setScalar(model ? 1.15 : 1.5);
    this.mixer = model ? model.mixer : null;
    this.actions = model ? model.actions : null;
    this.group.add(this.root);
    this.body = this.root;
    this.x = COVE.x + rr(-18, 18); this.z = COVE.z + rr(0, 30); this.heading = rnd() * TAU; this.speed = 0; this.y = -1.2;
    this.tx = this.x; this.tz = this.z; this.pick();
    this.mode = 'travel'; this.lastMode = ''; this.modeT = rr(20, 40); this.modeAge = 0;
    this.breathT = rr(35, 80); this.breaths = 0; this.clip = ''; this.prevY = this.y;
    register({ id: 'turtle' + i, name: 'Green sea turtle', cat: 'Sea life', group: this.group, sim: this, viewDist: 8, desc: 'Grazes the seagrass meadow on the lagoon floor, rests under the ledges, and rises every minute or two to breathe at the surface.', pickR: 1.5, pickY: 0 });
  }
  pick() {
    for (let k = 0; k < 40; k++) {
      const x = COVE.x + rr(-80, 80), z = COVE.z + rr(-30, 120);
      const h = getHeight(x, z);
      if (h < -1.6 && h > -9) { this.tx = x; this.tz = z; return; }
    }
  }
  setClip(name, rate, restart) {
    if (!this.actions) return;
    const next = this.actions.get(name); if (!next) return;
    const current = this.actions.get(this.clip);
    if (current === next && !restart) { next.setEffectiveTimeScale(rate); return; }
    next.reset().setEffectiveTimeScale(rate).setEffectiveWeight(1).play();
    if (current && current !== next) current.crossFadeTo(next, 0.4, false);
    this.clip = name;
  }
  setMode(mode, seconds) {
    this.mode = mode; this.modeT = seconds; this.modeAge = 0;
  }
  // what happens after the current step
  next() {
    const prev = this.mode;
    if (prev === 'travel') {
      this.setMode('graze', rr(20, 45));
    } else if (prev === 'graze') {
      if (rnd() < 0.25) this.setMode('rest', rr(30, 60)); else { this.pick(); this.setMode('travel', rr(15, 30)); }
    } else if (prev === 'rest' || prev === 'breathe' || prev === 'flee') {
      this.pick(); this.setMode('travel', rr(15, 30));
    }
  }
  // the castaway is close enough to startle a turtle
  startle(from) {
    const dx = this.x - from.x, dz = this.z - from.z;
    this.heading = Math.atan2(dx, dz);
    this.tx = this.x + dx * 6; this.tz = this.z + dz * 6;
    this.setMode('flee', 4);
  }
  update(dt, t) {
    this.modeT -= dt; this.modeAge += dt; this.breathT -= dt;
    // the castaway: looked up every half second, and a turtle that sees him close by swims off
    if (!this.cast || this.castT <= 0) {
      this.cast = creatures.find((c) => c.id === 'castaway') || null; this.castT = 0.5;
    }
    this.castT -= dt;
    if (this.cast && this.mode !== 'flee') {
      this.cast.group.getWorldPosition(_tp);
      if (Math.hypot(_tp.x - this.x, _tp.z - this.z) < 6) this.startle(_tp);
    }
    if (this.mode !== 'flee' && this.mode !== 'breathe' && this.breathT <= 0) {
      this.setMode('breathe', 6.0);
    }
    if (this.modeT <= 0) {
      if (this.mode === 'breathe') { this.breaths++; this.breathT = rr(50, 110); this.pick(); this.setMode('travel', rr(15, 30)); }
      else this.next();
    }
    const modeChanged = this.mode !== this.lastMode; this.lastMode = this.mode;

    // movement: cruising to a patch, a dash when startled, and still while grazing, resting or breathing
    const goal = this.mode === 'flee' ? 1.6 : this.mode === 'travel' ? 0.7 : this.mode === 'breathe' ? 0.12 : 0;
    this.speed = damp(this.speed, goal, 1.2, dt);
    const dx = this.tx - this.x, dz = this.tz - this.z;
    if (this.mode === 'travel' && Math.hypot(dx, dz) < 2.5) { this.setMode('graze', rr(20, 45)); }
    if (this.mode === 'travel' || this.mode === 'flee') this.heading = steer(this.heading, Math.atan2(dx, dz), dt * (this.mode === 'flee' ? 1.2 : 0.7));
    this.x += Math.sin(this.heading) * this.speed * dt; this.z += Math.cos(this.heading) * this.speed * dt;

    // depth: on the lagoon floor for grazing and resting, mid-water while cruising, at the surface to breathe
    const floor = getHeight(this.x, this.z) + 0.12;
    const goalY = this.mode === 'breathe' ? -0.25 : this.mode === 'travel' || this.mode === 'flee' ? Math.min(-1.0, floor + 1.4) : floor;
    this.y = damp(this.y, Math.max(goalY, floor), this.mode === 'breathe' ? 1.6 : 1.4, dt);
    if (this.mode === 'breathe' && this.modeAge > 2.2 && this.modeAge < 2.4) fx.splash(this.x, 0, this.z, 0.22);
    if (this.y > -0.55 && this.speed > 0.3) waterWake(this, this.x, this.z, this.speed * 2, 0.5, dt, 0.15);
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.set(0, this.heading, this.mode === 'travel' ? 0.04 * Math.sin(t * 1.3) : 0, 'YXZ');

    const clip = this.mode === 'breathe' ? 'Breathe'
      : this.mode === 'flee' ? (modeChanged ? 'Dash' : 'Swim_Cruise')
      : this.mode === 'travel' ? (this.speed > 0.35 ? 'Swim_Cruise' : 'Swim_Slow')
      : this.mode === 'rest' ? 'Rest' : 'Graze';
    const rate = clip === 'Swim_Cruise' ? clamp(this.speed / 0.7, 0.8, 1.6) : 1;
    this.setClip(clip, rate, modeChanged);
    if (this.mixer) this.mixer.update(dt);
  }
}
const _tp = V();


// the procedural blob: only used if the humpback model cannot load
function proceduralWhale() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const dark = '#35495b', light = '#cfd8dc';
  body.add(sphere(1, dark, 1.15, 1.05, 4.2));
  const bel = sphere(1, light, 1.0, 0.65, 3.8); bel.position.y = -0.45; body.add(bel);
  const hd = sphere(1, dark, 1.0, 0.85, 1.7); hd.position.set(0, -0.05, 3.5); body.add(hd);
  for (const s of [-1, 1]) { const f = cone(0.5, 4.2, dark, 5); f.scale.z = 0.18; f.position.set(s * 1.4, -0.8, 1.8); f.rotation.set(0.35, 0, s * 1.35); body.add(f); }
  const hump = cone(0.4, 0.8, dark, 5); hump.position.set(0, 1.15, -1.5); body.add(hump);
  const tailP = new THREE.Group(); tailP.position.z = -4.0; body.add(tailP);
  const ped = sphere(1, dark, 0.6, 0.55, 2.8); ped.position.z = -1.0; tailP.add(ped);
  for (const s of [-1, 1]) { const fk = cone(1.0, 2.8, dark, 4); fk.scale.z = 0.12; fk.rotation.set(Math.PI / 2, 0, s * 1.35); fk.position.set(s * 1.2, 0, -2.4); tailP.add(fk); }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.scale.setScalar(1.7);
  return root;
}

// The humpback travels submerged, rises to blow, slaps with its flippers, dives with the fluke raised, and breaches
// often: it leaps clear of the water, rolls, and falls back with a crash of spray. The Blender clips give the body its
// motion; this class decides what the whale does next and where it swims.
const WHALE_G = 5.3;          // gravity for the breach arc (m/s^2): peaks about 7 m above the sea
const WHALE_ARC = 3.6;        // seconds from leaving the water to falling back in

class Whale {
  constructor(model) {
    this.group = new THREE.Group(); fauna.add(this.group);
    this.root = model ? model.root : proceduralWhale();
    this.mixer = model ? model.mixer : null;
    this.actions = model ? model.actions : null;
    this.group.add(this.root);
    this.th = 2.4; this.speed = 3.2; this.lx = 0; this.lz = 0; this.yaw = 0; this.bank = 0;
    this.y = -5; this.prevY = -5;
    this.mode = 'travel'; this.lastMode = ''; this.modeT = rr(14, 22); this.modeAge = 0;
    this.sinceBreach = 99; this.blown = false; this.clip = '';
    register({ id: 'whale', name: 'Humpback whale', cat: 'Sea life', group: this.group, sim: this, viewDist: 36, desc: 'A humpback from the deep ocean. It travels submerged, rises to blow, and breaches often: it leaps clear of the water and falls back with a crash of spray.', pickR: 8, pickY: 0 });
  }
  setClip(name, rate, restart) {
    if (!this.actions) return;
    const next = this.actions.get(name); if (!next) return;
    const current = this.actions.get(this.clip);
    if (current === next && !restart) { next.setEffectiveTimeScale(rate); return; }
    next.reset().setEffectiveTimeScale(rate).setEffectiveWeight(1).play();
    if (current && current !== next) current.crossFadeTo(next, 0.4, false);
    this.clip = name;
  }
  setMode(mode, seconds) {
    this.mode = mode; this.modeT = seconds; this.modeAge = 0;
    this.slapped = false; this.flukeDone = false;
    if (mode === 'surface') this.blown = false;
  }
  // what happens after the current step
  next() {
    const prev = this.mode;
    if (prev === 'travel') this.setMode('rise', 3.2);
    else if (prev === 'rise') {
      // breaching is what this whale does most at the surface, but never twice in quick succession
      if (this.sinceBreach > 12 && rnd() < 0.45) this.startBreach(); else this.setMode('surface', 5.0);
    } else if (prev === 'surface') {
      if (rnd() < 0.3) this.setMode('slap', 2.4); else this.setMode('rest', rr(2.5, 4.5));
    } else if (prev === 'slap') {
      if (this.sinceBreach > 12 && rnd() < 0.3) this.startBreach(); else this.setMode('rest', rr(2, 3));
    } else if (prev === 'rest') {
      if (this.sinceBreach > 12 && rnd() < 0.3) this.startBreach(); else this.setMode('dive', 4.6);
    } else if (prev === 'breach') {
      // often a second breach follows the first, after a short rest at the surface
      if (rnd() < 0.5) this.setMode('rest', rr(2.5, 4)); else this.setMode('dive', 4.6);
    } else if (prev === 'dive') this.setMode('travel', rr(14, 22));
  }
  startBreach() {
    this.sinceBreach = 0;
    this.setMode('breach', 4.6);
  }
  spout(x, z) {
    const fwd = V(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
    const bx = x + fwd.x * 6, bz = z + fwd.z * 6;
    events.emit('spout', bx, 1, bz);
    fx.ripple(bx, bz, { amp: 0.22, speed: 1.5, width: 0.35, life: 3, foam: 0.25 });
    for (let i = 0; i < 26; i++) fx.mist.emit({ x: bx + rr(-.3, .3), y: 1, z: bz + rr(-.3, .3), vx: rr(-0.8, 0.8), vy: rr(10, 16), vz: rr(-0.8, 0.8), life: rr(1.6, 2.6), s0: 1.5, s1: 6, c0: [1, 1, 1, 0.55], c1: [1, 1, 1, 0], grav: 8, drag: 0.5 });
  }
  update(dt, t) {
    this.modeT -= dt; this.modeAge += dt; this.sinceBreach += dt;
    if (this.modeT <= 0) this.next();
    const modeChanged = this.mode !== this.lastMode; this.lastMode = this.mode;

    // the path: a long loop well offshore, slowing for the surface and the breach
    const target = this.mode === 'breach' ? 1.2 : this.mode === 'dive' ? 2.0 : (this.mode === 'travel' || this.mode === 'rise') ? 3.2 : 1.0;
    this.speed = damp(this.speed, target, 1.5, dt);
    this.th += dt * this.speed / 340;
    const R = 340;
    const x = Math.cos(this.th) * R, z = Math.sin(this.th) * R * 0.85;

    // depth: submerged while travelling, at the surface to blow, rest and slap, a plunge to dive
    if (this.mode === 'breach' && this.modeAge < WHALE_ARC) {
      const v0 = WHALE_G * WHALE_ARC / 2, tau = this.modeAge;
      this.y = -1.6 + v0 * tau - 0.5 * WHALE_G * tau * tau;
    } else {
      const goal = this.mode === 'travel' ? -5 + Math.sin(t * 0.3) * 0.4
        : this.mode === 'dive' || this.mode === 'breach' ? -5 : -1.0;
      this.y = damp(this.y, goal, this.mode === 'dive' ? 0.9 : 2.2, dt);
    }
    // splashes as it leaves the water and as it comes back in
    const wy = seaY(x, z), wdir = [Math.sin(this.yaw), Math.cos(this.yaw)];
    if (this.prevY < wy && this.y >= wy) fx.splash(x, wy, z, 3.4, { dir: wdir });
    if (this.prevY > wy && this.y <= wy) fx.splash(x, wy, z, 5.0, { dir: wdir });
    if (this.mode === 'slap' && !this.slapped && this.modeAge > 1.2) { this.slapped = true; fx.splash(x + wdir[1] * 4, wy, z - wdir[0] * 4, 1.9); }
    if (this.mode === 'dive' && !this.flukeDone && this.modeAge > 1.6) { this.flukeDone = true; fx.splash(x - wdir[0] * 7, wy, z - wdir[1] * 7, 2.4, { dir: [-wdir[0], -wdir[1]] }); }
    if (this.y > -1.7 && this.y < 1 && this.mode !== 'breach') waterWake(this, x, z, Math.max(this.speed, 1.4) * 1.6, 3.2, dt, 0.5);
    this.prevY = this.y;

    const hx = x - this.lx, hz = z - this.lz; this.lx = x; this.lz = z;
    const yaw = Math.atan2(hx, hz);
    const turnRate = angDiff(yaw, this.yaw) / Math.max(dt, 1e-4); this.yaw = yaw;
    this.bank = damp(this.bank, clamp(-turnRate * 0.25, -0.12, 0.12), 2, dt);
    this.group.position.set(x, this.y, z);
    this.group.rotation.set(0, yaw, this.bank, 'YXZ');

    if (this.mode === 'surface' && !this.blown && this.modeAge > 1.8) { this.blown = true; this.spout(x, z); }

    const clip = this.mode === 'breach' ? 'Breach' : this.mode === 'dive' ? 'Dive_Fluke' : this.mode === 'surface' ? 'Surface_Blow'
      : this.mode === 'slap' ? 'Pec_Slap' : this.mode === 'rest' ? 'Idle_Float' : this.speed > 2.4 ? 'Swim_Cruise' : 'Swim_Slow';
    this.setClip(clip, clip.startsWith('Swim') ? clamp(this.speed / 3.2, 0.8, 1.3) : 1, modeChanged);
    if (this.mixer) this.mixer.update(dt);
  }
}

class Shark {
  // one blackfin reef shark on a patrol around the reef mouth; it cruises, hovers, turns and bursts, with more bursts at dusk and night
  constructor(model) {
    this.group = new THREE.Group(); fauna.add(this.group);
    this.root = model.root; this.mixer = model.mixer; this.actions = model.actions;
    this.group.add(this.root);
    this.th = rnd() * TAU; this.dir = rnd() < 0.5 ? 1 : -1;
    this.speed = 1.2; this.bank = 0; this.yaw = 0; this.lx = 0; this.lz = 0; this.act = 0.5;
    this.animName = '';
    this.pickMode();
    register({ id: 'shark', name: 'Blackfin reef shark', cat: 'Sea life', group: this.group, sim: this, viewDist: 10, desc: 'Patrols the reef edge at the lagoon mouth. Fast, wary and sleek, with black-tipped fins; it rests in the heat of the day and hunts harder at dusk.', pickR: 3, pickY: 0.5 });
  }
  pickMode() {
    const r = rnd(), burstP = 0.08 + 0.2 * this.act;
    this.modeAge = 0;
    if (r < burstP) { this.mode = 'burst'; this.modeT = 3.2; }
    else if (r < burstP + 0.12) { this.mode = 'turn'; this.modeT = 2.2; }
    else if (r < burstP + 0.12 + 0.25) { this.mode = 'hover'; this.modeT = rr(7, 12); }
    else { this.mode = 'patrol'; this.modeT = rr(14, 26); }
  }
  setClip(name, rate = 1) {
    const current = this.actions.get(this.animName), next = this.actions.get(name);
    if (!next) return;
    if (current === next) { next.setEffectiveTimeScale(rate); return; }
    next.reset().setEffectiveTimeScale(rate).setEffectiveWeight(1).play();
    if (current) current.crossFadeTo(next, 0.35, false);
    this.animName = name;
  }
  update(dt, t) {
    // resting in the warm day, active at dusk and through the night
    const h = env.tod, dim = h < 6.5 || h > 17.5 ? 1 : 0;
    this.act = damp(this.act, dim ? 1 : 0.45, 0.5, dt);
    this.modeT -= dt; this.modeAge += dt;
    if (this.modeT <= 0) this.pickMode();
    const target = this.mode === 'burst' ? 4.6 : this.mode === 'hover' ? 0.35 : this.mode === 'turn' ? 0.9 : 1.6 * (0.7 + 0.5 * this.act);
    this.speed = damp(this.speed, target, this.mode === 'burst' ? 2.5 : 1.2, dt);
    this.th += dt * (this.speed / 36) * this.dir;
    const x = COVE.x + Math.cos(this.th) * 40, z = COVE.z + 40 + Math.sin(this.th) * 32;
    const hx = x - this.lx, hz = z - this.lz; this.lx = x; this.lz = z;
    const yaw = Math.atan2(hx, hz);
    // bank into the turn, a little, from how fast the heading is changing
    const turnRate = angDiff(yaw, this.yaw) / Math.max(dt, 1e-4);
    this.bank = damp(this.bank, clamp(-turnRate * 0.12, -0.3, 0.3), 2, dt);
    this.yaw = yaw;
    const g = getHeight(x, z);
    this.group.position.set(x, Math.min(Math.max(-0.75, g + 1.0), -0.35), z);
    this.group.rotation.set(0, yaw, this.bank, 'YXZ');
    waterWake(this, x, z, this.speed * 1.8, 0.7, dt, 0.5);
    const clip = this.mode === 'burst' ? (this.modeAge < 1.6 ? 'Dash_Strike' : 'Patrol_Fast')
      : this.mode === 'turn' ? (this.dir > 0 ? 'Turn_Right' : 'Turn_Left')
      : this.mode === 'hover' ? 'Hover_Rest' : 'Patrol_Cruise';
    this.setClip(clip, clamp(this.speed / 1.6, 0.8, 1.3));
    this.mixer.update(dt);
  }
}

class Manta {
  constructor() {
    const g = new THREE.BufferGeometry();
    const P = [0, 0.05, 1.2, -2.6, 0, -0.1, 2.6, 0, -0.1, 0, 0.1, -0.2, 0, 0.05, -2.2, -1.0, 0.0, 0.9, 1.0, 0, 0.9];
    const pos = [];
    const tri = (a, b, c) => { for (const i of [a, b, c]) pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); };
    tri(0, 1, 3); tri(0, 3, 2); tri(1, 4, 3); tri(3, 4, 2); tri(5, 1, 0); tri(6, 0, 2);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const top = new THREE.Mesh(g, M('#2d3d4a', { side: THREE.DoubleSide }));
    top.castShadow = true;
    const tail = cone(0.05, 3.2, '#2d3d4a', 4); tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0.05, -3.6);
    this.root = new THREE.Group(); this.root.add(top, tail);
    this.root.scale.setScalar(1.5);
    this.group = new THREE.Group(); this.group.add(this.root); fauna.add(this.group);
    this.top = top; this.th = rnd() * TAU; this.lx = 0; this.lz = 0;
    register({ id: 'manta', name: 'Giant manta ray', cat: 'Sea life', group: this.group, sim: this, viewDist: 14, desc: 'Glides through the blue beyond the reef on wings wider than a car, filter-feeding in slow loops.', pickR: 4, pickY: 0 });
  }
  update(dt, t) {
    this.th += dt * 0.09;
    const x = COVE.x + 55 + Math.cos(this.th) * 55, z = COVE.z + 70 + Math.sin(this.th) * 40;
    const hx = x - this.lx, hz = z - this.lz; this.lx = x; this.lz = z;
    const g = getHeight(x, z);
    const y = Math.min(-3 + Math.sin(t * 0.3) * 1, g + 2.5);
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, Math.atan2(hx, hz), 0.15 * Math.sin(t * 0.35), 'YXZ');
    this.top.scale.y = 1; this.top.rotation.z = 0;
    this.root.rotation.z = Math.sin(t * 1.6) * 0.1;
    this.root.scale.set(1.5, 1.5 + Math.sin(t * 1.6) * 0.5, 1.5);
  }
}

/* ====================================================================== fish schools (instanced) */
function fishGeometry() {
  const mb = new MB();
  const body = new THREE.IcosahedronGeometry(1, 1);
  mb.addGeo(body, mat4(0, 0, 0, 0.17, 0.2, 0.55), (v) => { const k = 0.82 + 0.25 * clamp(-v.y / 0.2 * 0.5 + 0.5, 0, 1) * 0.0 + 0.25 * clamp(0.5 - v.y / 0.4, 0, 1); return new THREE.Color(k, k, k); }, 0);
  const wh = new THREE.Color(0.9, 0.9, 0.9), dk = new THREE.Color(0.65, 0.65, 0.65);
  mb.tri(V(0, 0, -0.45), V(0, 0.28, -0.85), V(0, -0.28, -0.85), dk, dk, dk, 0, 0, 0);
  mb.tri(V(0, 0.18, 0.2), V(0, 0.38, -0.12), V(0, 0.16, -0.25), dk, dk, dk, 0, 0, 0);
  mb.tri(V(0.14, -0.05, 0.15), V(0.34, -0.2, -0.05), V(0.12, -0.08, -0.05), dk, dk, dk);
  mb.tri(V(-0.14, -0.05, 0.15), V(-0.12, -0.08, -0.05), V(-0.34, -0.2, -0.05), dk, dk, dk);
  return mb.build();
}
// the schools' shared fish geometry and material, kept so the field guide can show one real fish
let fishGeoRef = null, fishMatRef = null;
// daylight for the fish shimmer (set from the sun each frame; 0 at night, when there is no sunlight to flash)
const fishSunLit = { value: 1 };
/** one fish drawn the way a school draws its members: same geometry, material and per-instance colour */
export function fishSpecimen(hue) {
  if (!fishGeoRef || !fishMatRef) return null;
  const im = new THREE.InstancedMesh(fishGeoRef, fishMatRef, 1);
  im.setMatrixAt(0, new THREE.Matrix4());
  im.setColorAt(0, new THREE.Color(hue));
  im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
  im.frustumCulled = false;
  const root = new THREE.Group(); root.add(im);
  return root;
}
function buildFish() {
  // the schools have their own generator. The world's shared stream is spent by the same 4585 draws the earlier builder used (its fish,
  // school setup and school minds), so every later placement in the world stays where it was
  burn(4585);
  const sg = mulberry32(51733), srr = (a, b) => a + (b - a) * sg();
  const geo = fishGeometry();
  // wildlife size (docs/WILDLIFE_SCALE_RESEARCH.md): the schools are sized from the fish's own geometry (its length along Z, measured here)
  geo.computeBoundingBox();
  const fishLen = geo.boundingBox.max.z - geo.boundingBox.min.z;
  // researched adult total lengths x 1.5 (standard length for the silver mullet). The generic 'Reef fish school' has no identified species: the chromis reference is used (flagged)
  const SCHOOL_TARGET = { 'Blue chromis school': 0.15, 'Silver mullet school': 0.75, 'Pink fusilier school': 0.225, 'Parrotfish school': 0.45, 'Yellowfin tuna school': 2.25, 'Reef fish school': 0.15, 'Yellow tang school': 0.30 };
  fishGeoRef = geo;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide, emissive: 0x112233, emissiveIntensity: 0.4 });
  fishMatRef = mat;
  mat.customProgramCacheKey = () => 'fish';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.uniforms.uSunDir = U.sunDir;
    sh.uniforms.uSunLit = fishSunLit;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uSunDir;\nuniform float uSunLit;\nvarying float vShimmer;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float fph = instanceMatrix[3][0]*1.3 + instanceMatrix[3][2]*0.7;
        transformed.x += sin(uTime*9.0 + fph + position.z*6.0) * 0.12 * smoothstep(0.0, -0.9, position.z);
        // shimmer: a flank that turns between the sun and the eye catches the light, a broad soft flash that follows the fish's own turns
        vec3 flankS = normalize(mat3(instanceMatrix) * vec3(1.0, 0.0, 0.0));
        vec3 wpS = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vec3 halfS = normalize(uSunDir + normalize(cameraPosition - wpS));
        vShimmer = pow(abs(dot(flankS, halfS)), 3.0) * uSunLit;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vShimmer;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.5, 0.64, 0.74) * vShimmer * 0.22;`);
  };
  const schools = [];
  const addSchool = (cx, cz, rx, rz, depth, n, hue, scale, name, spread = 3.2) => {
    // the school's fish are scaled to the target length; its swimming speed and its spread scale with them (body lengths per second and per school stay the same)
    const target = SCHOOL_TARGET[name];
    const k = target ? (target / fishLen) / scale : 1;
    schools.push({ cx, cz, rx, rz, depth, n, hue, scale: target ? target / fishLen : scale, spread: spread * k, name, a: srr(0.03, 0.07), b: srr(0.04, 0.08), p: sg() * 6, q: sg() * 6, fish: [] });
  };
  // lagoon
  // the yellow tang school is individually rigged (buildYellowTangSchool); the instanced school below is the fallback if the model fails
  if (!yellowTangReady()) addSchool(COVE.x + 4, COVE.z + 14, 14, 10, -1.3, 42, '#ffd23a', 1.0, 'Yellow tang school');
  addSchool(COVE.x - 12, COVE.z + 28, 12, 8, -1.6, 90, '#3b8dff', 1.0, 'Blue chromis school');
  // the orange anthias shoal is built on its own (buildAnthiasSchool)
  addSchool(COVE.x - 2, COVE.z + 4, 9, 7, -1.1, 40, '#e9f6ff', 0.9, 'Silver mullet school');
  // reef edge / offshore
  addSchool(COVE.x + 38, COVE.z + 48, 16, 12, -3.4, 80, '#ff5d8f', 1.2, 'Pink fusilier school');
  addSchool(COVE.x - 40, COVE.z + 40, 16, 12, -3.6, 60, '#6fe0d2', 1.2, 'Parrotfish school');
  addSchool(COVE.x + 4, COVE.z + 72, 22, 14, -6.0, 34, '#9fb8cc', 1.7, 'Yellowfin tuna school', 4.6);
  addSchool(-120, 110, 22, 16, -5.0, 50, '#ffd23a', 1.3, 'Reef fish school');
  addSchool(130, 90, 22, 16, -5.0, 50, '#59d0ff', 1.3, 'Reef fish school');
  addSchool(-150, -20, 22, 18, -6, 46, '#ff9a3c', 1.4, 'Reef fish school');
  addSchool(150, -90, 24, 16, -6, 46, '#e0e8f0', 1.6, 'Reef fish school', 4);
  let total = 0;
  for (const s of schools) total += s.n;
  const im = new THREE.InstancedMesh(geo, mat, total);
  im.name = 'school-fish';   // named for the performance benchmark (src/dev/perf_bench.js)
  im.frustumCulled = false; im.castShadow = false;
  let idx = 0;
  for (const s of schools) {
    const base = new THREE.Color(s.hue);
    s.dummy = new THREE.Group();
    for (let i = 0; i < s.n; i++) {
      const c = base.clone().multiplyScalar(srr(0.85, 1.12));
      im.setColorAt(idx, c);
      s.fish.push({ i: idx++, x: s.cx + srr(-6, 6), y: s.depth, z: s.cz + srr(-6, 6), vx: 0, vy: 0, vz: 1, o1: sg() * TAU, o2: sg() * TAU, w1: srr(0.15, 0.5) * (sg() < 0.5 ? -1 : 1), w2: srr(0.2, 0.6), r: srr(0.3, 1) * s.spread, sc: s.scale * srr(0.92, 1.08) });   // individual variation: +-8%, a school of similar fish
    }
    // the school's mind is made once its fish are placed; the school is then a creature the camera can follow (framed by its spread)
    s.mind = createSchool(s.name, s.fish, { cx: s.cx, cz: s.cz, rx: s.rx, rz: s.rz, depth: s.depth }, sg);
    const prof = SCHOOL_PROFILE[s.name] || SCHOOL_PROFILE['Reef fish school'];
    register({ id: 'school' + s.cx + s.cz, name: s.name, cat: 'Sea life', group: s.dummy, sim: s.mind, specimen: () => fishSpecimen(s.hue), viewDist: Math.max(8, prof.spread * 2.2), desc: 'A shimmering school moving as one body through the water, bending around the coral heads.', pickR: Math.max(4, s.spread * 1.8), pickY: 0 });
    fauna.add(s.dummy);
  }
  im.instanceColor.needsUpdate = true;
  scene.add(im);
  updaters.push((dt, t) => {
    if (SCHOOLS_NEW) {
      const cas = creatures.find((c) => c.id === 'castaway');
      const dist = [{ x: camera.position.x, y: camera.position.y, z: camera.position.z, r: 0 }];
      if (cas && cas.group) dist.push({ x: cas.group.position.x, y: cas.group.position.y, z: cas.group.position.z, r: 0 });
      for (const s of schools) { updateSchool(s.mind, { dt, t, disturbers: dist }, im); s.dummy.position.set(s.mind.cx, s.mind.cy, s.mind.cz); }
      fishSunLit.value = env.day;
      im.instanceMatrix.needsUpdate = true;
      return;
    }
    for (const s of schools) {
      const cx = s.cx + Math.sin(t * s.a + s.p) * s.rx, cz = s.cz + Math.cos(t * s.b + s.q) * s.rz, cy = s.depth + Math.sin(t * 0.2 + s.p) * 0.5;
      s.dummy.position.set(cx, cy, cz);
      for (const f of s.fish) {
        const dx = cx + Math.cos(f.o1 + t * f.w1) * f.r - f.x, dy = cy + Math.sin(f.o2 + t * f.w2) * 0.55 - f.y, dz = cz + Math.sin(f.o1 + t * f.w1) * f.r * 0.8 - f.z;
        f.vx += dx * 2.6 * dt; f.vy += dy * 2.0 * dt; f.vz += dz * 2.6 * dt;
        const k = Math.exp(-1.7 * dt);
        f.vx *= k; f.vy *= k; f.vz *= k;
        const sp = Math.hypot(f.vx, f.vy, f.vz);
        const max = 4.2 * s.scale;
        if (sp > max) { f.vx *= max / sp; f.vy *= max / sp; f.vz *= max / sp; }
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
        const g = getHeight(f.x, f.z);
        const depth = -g, need = 1.5 + 0.4 * f.sc;
        if (depth < need) {                   // too shallow: swim toward deeper water instead of poking out
          const gx = getHeight(f.x + 2, f.z) - getHeight(f.x - 2, f.z), gz = getHeight(f.x, f.z + 2) - getHeight(f.x, f.z - 2);
          const push = 9 * (1 - Math.max(0, depth) / need);
          f.vx -= gx * push * dt; f.vz -= gz * push * dt;
        }
        const top = -(0.55 + 0.3 * f.sc), bottom = g + 0.25 * f.sc + 0.1;
        f.y = bottom > top ? top : clamp(f.y, bottom, top);          // keep the whole body under the surface and waves
        const yaw = Math.atan2(f.vx, f.vz), pit = -Math.asin(clamp(f.vy / (sp + 1e-4), -1, 1)) * 0.8;
        _e.set(pit, yaw, 0, 'YXZ'); _q.setFromEuler(_e);
        const vis = depth > 0.9 + 0.3 * f.sc ? f.sc : 0.0001;       // hide stragglers that wander into the shallows
        _m.compose(_p.set(f.x, f.y, f.z), _q, _s.setScalar(vis));
        im.setMatrixAt(f.i, _m);
      }
    }
    im.instanceMatrix.needsUpdate = true;
  });
  buildAnthiasSchool();
  if (yellowTangReady()) buildYellowTangSchool();
}

/* Orange anthias: a shoal with its own slender body and forked tail. It feeds up in the water above the reef, drifts as one with
   alignment and spacing, and scatters when the castaway or a reef shark comes close, then re-forms. */
function anthiasGeometry() {
  const mb = new MB();
  const body = new THREE.IcosahedronGeometry(1, 1);
  mb.addGeo(body, mat4(0, 0.02, 0, 0.15, 0.3, 0.6), (v) => { const k = 0.82 + 0.25 * clamp(0.5 - v.y / 0.4, 0, 1); return new THREE.Color(k, k, k); }, 0);
  const fin = new THREE.Color(0.85, 0.8, 0.8), dk = new THREE.Color(0.6, 0.6, 0.6);
  // forked caudal fin, in the fish's vertical centre plane
  mb.tri(V(0, 0, -0.5), V(0, 0.36, -1.0), V(0, 0.03, -0.8), fin, fin, fin);
  mb.tri(V(0, 0, -0.5), V(0, 0.03, -0.8), V(0, -0.36, -1.0), fin, fin, fin);
  // tall dorsal fin with a trailing extension (the long fin of the males)
  mb.tri(V(0, 0.2, 0.18), V(0, 0.7, -0.12), V(0, 0.2, -0.36), fin, fin, fin);
  mb.tri(V(0, 0.2, -0.36), V(0, 0.7, -0.12), V(0, 0.46, -0.52), fin, fin, fin);
  mb.tri(V(0, -0.18, 0.02), V(0, -0.3, -0.3), V(0, -0.18, -0.34), dk, dk, dk);   // anal fin
  return mb.build();
}
function buildAnthiasSchool() {
  const geo = anthiasGeometry();
  // wildlife size: the orange anthias (Pseudanthias squamipinnis) is 0.15 m total length (FishBase maximum), x 1.5 = 0.225 m. The fish are
  // drawn at their own length (the geometry's length along Z), so the school's spacing and speeds come from its profile (school_mind.js).
  geo.computeBoundingBox();
  const anthiasLen = geo.boundingBox.max.z - geo.boundingBox.min.z;
  const n = 80, home = { x: COVE.x + 18, z: COVE.z + 34 };
  // the school has its own generator. The shared stream spends the same 273 draws the earlier builder used, so every later
  // placement in the world stays where it was
  burn(273);
  const ar = mulberry32(90417);
  const im = new THREE.InstancedMesh(geo, fishMatRef, n);
  im.name = 'anthias-fish';
  im.frustumCulled = false; im.castShadow = false;
  const group = new THREE.Group(); group.position.set(home.x, -1.6, home.z); fauna.add(group);
  const base = new THREE.Color('#ff8a2e'), pink = new THREE.Color('#ff6f8f');
  const fish = [];
  for (let i = 0; i < n; i++) {
    im.setColorAt(i, base.clone().lerp(pink, ar() * 0.5).multiplyScalar(0.9 + 0.18 * ar()));
    fish.push({ i, x: home.x + (ar() * 12 - 6), y: -1.6 + (ar() * 0.8 - 0.4), z: home.z + (ar() * 12 - 6), vx: 0, vy: 0, vz: 0, sc: (0.95 + 0.17 * ar()) * 0.225 / anthiasLen, speedK: 0.85 + 0.3 * ar() });
  }
  im.instanceColor.needsUpdate = true;
  scene.add(im);
  // the shoal's mind: it drifts over the reef, hovers above the coral heads to feed, and bursts away from the castaway or a reef shark
  const mind = createSchool('Orange anthias school', fish, { cx: home.x, cz: home.z, rx: 10, rz: 7, depth: -2.1 }, ar);
  register({ id: 'school-anthias', name: 'Orange anthias school', cat: 'Sea life', group, sim: mind,
    specimen: () => new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xff8a2e, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide })),
    viewDist: 8, desc: 'A slender orange-pink anthias shoal. It feeds up in the water above the reef, drifts as one, and scatters when something comes close.', pickR: 6, pickY: -1.6 });
  const threats = [], _threatP = new THREE.Vector3();
  updaters.push((dt, t) => {
    threats.length = 0;
    for (const c of creatures) {
      if (!c.group || (c.id !== 'castaway' && c.name !== 'Blackfin reef shark')) continue;
      const p = c.group.getWorldPosition(_threatP);
      threats.push({ x: p.x, y: p.y, z: p.z, r: 0 });
    }
    updateSchool(mind, { dt, t, disturbers: threats }, im);
    group.position.set(mind.cx, mind.cy, mind.cz);
    im.instanceMatrix.needsUpdate = true;
  });
}

/* Yellow tangs are individually rigged. Their shoal travels reef edges by day,
   grazes in short staggered bouts, and tightens at a coral shelter after dusk. */
function buildYellowTangSchool() {
  const count = 32, group = new THREE.Group(), fish = [];
  const cx = COVE.x + 4, cz = COVE.z + 14;
  // wildlife size: the yellow tang (Zebrasoma flavescens) is 0.20 m total length (FishBase maximum) x 1.5 = 0.30 m. The model is 2.655 units
  // long in its holder's frame (measured in game, bind pose), so each holder is scaled to 0.30 / 2.655 per unit, with +-6% variation.
  // The school's distances and speeds were tuned for the old fish (about 1.06 m long), so they scale by kT = 0.30 / 1.06.
  const TANG_K = 0.30 / 2.655, kT = 0.30 / (2.655 * 0.40);
  for (let i = 0; i < count; i++) {
    const model = makeYellowTangModel();
    if (!model) return;
    // the Blender model is about 2.8 m from snout to tail; the lagoon's reef fish are about 1.2 m, so the tangs are scaled to match them
    const holder = new THREE.Group(); holder.add(model.root); holder.scale.setScalar(TANG_K * rr(0.94, 1.06));
    const a = rnd() * TAU, r = rr(2, 7);
    const f = { holder, mixer: model.mixer, actions: model.actions,
      x: cx + Math.cos(a) * r, y: -1.35 + rr(-.35,.35), z: cz + Math.sin(a) * r,
      vx: rr(-.12,.12), vz: rr(.18,.38), yaw: 0,
      phase: rnd()*TAU, size: holder.scale.x, graze: 0, nextGraze: rr(8,24), turn: rr(5,16), formationR: rr(2.5,6.2) * kT };
    f.actions.get('Tang_Cruise_Swim')?.play();
    fish.push(f); group.add(holder);
  }
  fauna.add(group);
  const tangCreature = register({ id: 'yellow-tang-school', name: 'Yellow tang school', cat: 'Sea life', group,
    specimen: () => { const m = makeYellowTangModel(); if (!m) return fishSpecimen('#ffd23a'); const g = new THREE.Group(); g.add(m.root); return g; },
    viewDist: 10, desc: 'A shoal of yellow tangs travels the reef edge, grazing in short turns and bunching close to coral shelter at dusk.', pickR: 10, pickY: -1 });
  const center = new THREE.Vector3(cx, -1.3, cz);
  // the shared school intelligence drives the tangs too (school_mind.js); their holders are placed in the school's frame
  const mind = createSchool('Yellow tang school', fish.map((f, i) => Object.assign(f, { i, sc: 1, vy: 0, vx: f.vx || 0, vz: f.vz || 0 })), { cx, cz, rx: 12, rz: 9, depth: -1.45 });
  tangCreature.sim = mind;   // the school's mind: the camera, the Field Guide and the inspection read the shoal through it
  const tangWrite = (f, p, q) => { f.holder.position.set(p.x - mind.cx, p.y - mind.cy, p.z - mind.cz); f.holder.quaternion.copy(q); };
  let grazing = false, grazeT = rr(18,32), grazeX = cx, grazeZ = cz;
  updaters.push((dt, t) => {
    if (SCHOOLS_NEW) {
      const cas = creatures.find((c) => c.id === 'castaway');
      const dist = [{ x: camera.position.x, y: camera.position.y, z: camera.position.z, r: 0 }];
      if (cas && cas.group) dist.push({ x: cas.group.position.x, y: cas.group.position.y, z: cas.group.position.z, r: 0 });
      updateSchool(mind, { dt, t, disturbers: dist }, tangWrite);
      group.position.set(mind.cx, mind.cy, mind.cz);
      const grazing = mind.state === 'hover';
      for (const f of fish) {
        const clip = grazing ? 'Tang_Graze' : 'Tang_Cruise_Swim';
        for (const [name, action] of f.actions) { if (name === clip) { if (!action.isRunning()) action.reset().play(); } else action.stop(); }
        f.mixer.update(dt);
      }
      return;
    }
    const night = env.night;
    grazeT -= dt;
    if (!grazing && grazeT <= 0 && env.day > .35) {
      grazing = true; grazeT = rr(7,12);
      grazeX = cx + Math.sin(t*.12) * 9; grazeZ = cz + Math.cos(t*.10) * 6;
    } else if (grazing && grazeT <= 0) { grazing = false; grazeT = rr(18,36); }
    const pathT = t * (.035 + env.day*.018);
    const shelterBlend = smoothstep(.12,.78,night);
    const patrolX = cx + Math.cos(pathT)*12, patrolZ = cz + Math.sin(pathT*.73)*9;
    center.set(lerp(patrolX,cx+1,shelterBlend), -1.45, lerp(patrolZ,cz-2,shelterBlend));
    if (grazing && !night) { center.x = lerp(center.x,grazeX,.72); center.z = lerp(center.z,grazeZ,.72); }
    const cruiseSpeed = lerp(1.05,.34,shelterBlend) * kT * (grazing ? .55 : 1);
    group.position.set(center.x,center.y,center.z);
    for (let i=0;i<fish.length;i++) {
      const f=fish[i];let ax=0,ay=0,az=0,alignX=0,alignZ=0,neighbors=0,sepX=0,sepZ=0;
      for (let j=0;j<fish.length;j++) if (i!==j) {
        const o=fish[j],dx=o.x-f.x,dz=o.z-f.z,d2=dx*dx+dz*dz;
        if(d2<25*kT*kT){alignX+=o.vx;alignZ+=o.vz;neighbors++;}
        if(d2<2.2*kT*kT&&d2>.001){sepX-=dx/d2;sepZ-=dz/d2;}
      }
      if(neighbors){ax+=(alignX/neighbors-f.vx)*.42;az+=(alignZ/neighbors-f.vz)*.42;}
      // Cohere around the moving shoal center while retaining personal spacing.
      const dx=center.x-f.x,dz=center.z-f.z,dist=Math.hypot(dx,dz)+1e-3;
      const ring= grazing&&!night ? f.formationR : lerp(5.5,2.5,shelterBlend) * kT;
      const pull=clamp((dist-ring)*.14,-.18,.75);ax+=dx/dist*pull;az+=dz/dist*pull;
      ax+=sepX*.9;az+=sepZ*.9;
      // Small correlated heading changes ripple through the shoal instead of lockstep turns.
      f.turn-=dt;if(f.turn<=0){f.turn=rr(5,17);f.phase+=rr(-.7,.7);}
      ax+=Math.cos(pathT+f.phase*.18)*.12;az+=Math.sin(pathT+f.phase*.18)*.12;
      const desiredY= -1.45 + Math.sin(t*.42+f.phase)*.28*kT + (grazing&&!night ? -.22 : 0);
      ay=(desiredY-f.y)*.62;
      f.vx+=ax*dt;f.vz+=az*dt;f.vy=(f.vy||0)+ay*dt;
      const dampFactor=Math.exp(-1.3*dt);f.vx*=dampFactor;f.vz*=dampFactor;f.vy*=Math.exp(-1.7*dt);
      const speed=Math.hypot(f.vx,f.vz);if(speed>cruiseSpeed){f.vx*=cruiseSpeed/speed;f.vz*=cruiseSpeed/speed;}
      f.x+=f.vx*dt;f.y+=f.vy*dt;f.z+=f.vz*dt;
      // Keep every animal in the lagoon's navigable water column.
      const bottom=getHeight(f.x,f.z)+.75;f.y=clamp(f.y,Math.min(-.7,Math.max(-3.5,bottom)),-.55);
      const oldYaw=f.yaw, heading=Math.atan2(f.vx,f.vz);f.yaw=oldYaw+angDiff(oldYaw,heading)*.16;
      f.holder.position.set(f.x-center.x,f.y-center.y,f.z-center.z);
      const turn=clamp(angDiff(oldYaw,f.yaw)*-3,-.24,.24);
      f.holder.rotation.set(grazing && !night ? 0.13 + Math.sin(t*2+f.phase)*.05 : Math.sin(t*.8+f.phase)*.025,f.yaw,turn,'YXZ');
      const isGraze=grazing&&!night&&(i%5===Math.floor(t*.4)%5);
      const clip=isGraze?'Tang_Graze':'Tang_Cruise_Swim';
      for(const [name,action] of f.actions) if(name===clip){if(!action.isRunning())action.reset().play();}else action.stop();
      f.mixer.update(dt);
    }
  });
}

/* ====================================================================== bioluminescent jellyfish */
// Schools of small jellyfish (bells 20 to 35 cm across) drift a little way off the coast. By day they are pale and faint; at night they rise
// toward the surface and glow blue, cyan and violet, a hundred and more of them in a loose school, each pulsing in its own rhythm.
// One instanced mesh draws all of them. Placement uses a local generator, and the draws the old ten big jellyfish used are spent, so nothing
// built after them moves.
function buildJellies() {
  burn(50);
  const rng = mulberry32(60221), R = (a, b) => a + (b - a) * rng();
  // the body: a bell, four frilly oral arms and a fringe of long thin tentacles, in one geometry
  const parts = [];
  const bell = new THREE.SphereGeometry(0.5, 14, 9, 0, TAU, 0, Math.PI * 0.55); bell.scale(1, 0.78, 1); parts.push(bell);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4, arm = new THREE.ConeGeometry(0.09, 0.55, 5, 1, true); arm.rotateX(Math.PI); arm.translate(Math.cos(a) * 0.1, -0.3, Math.sin(a) * 0.1); parts.push(arm);
  }
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU, len = 0.9 + 0.5 * ((k * 7) % 3) / 2, t = new THREE.ConeGeometry(0.014, len, 3, 1, true); t.rotateX(Math.PI); t.translate(Math.cos(a) * 0.36, -0.12 - len / 2, Math.sin(a) * 0.36); parts.push(t);
  }
  const geo = mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g));
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const PAL = [0x4fe8ff, 0x58ffd0, 0x6fb4ff, 0x8f8cff, 0x7af0ff, 0x40ffb0].map((c) => new THREE.Color(c));

  // schools: find open water some way out from the shore, in different directions round the island
  const schools = [];
  for (let k = 0, tries = 0; schools.length < 8 && tries < 80; tries++) {
    const a = (k / 8) * TAU + R(-0.35, 0.35); k += 0.25;
    let r = 70; while (r < 300 && getHeight(Math.cos(a) * r, Math.sin(a) * r) > -3.5) r += 5;
    r += R(25, 70);
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (r < 300 && getHeight(cx, cz) < -4 && schools.every((q) => Math.hypot(q.cx - cx, q.cz - cz) > 45)) schools.push({ cx, cz, ph: R(0, 6), orbit: R(10, 22), spread: R(6, 10), speed: R(0.015, 0.03) * (rng() < 0.5 ? -1 : 1) });
  }
  const list = [];
  for (const sc of schools) {
    const n = Math.round(R(18, 30));
    for (let i = 0; i < n; i++) {
      const a = R(0, TAU), d = Math.sqrt(rng()) * sc.spread;
      list.push({ sc, ox: Math.cos(a) * d, oz: Math.sin(a) * d * 0.8, p: R(0, 6), rate: R(1.4, 2.2), s: R(0.2, 0.36), dayY: R(-3.4, -1.6), nightY: R(-1.5, -0.55), yaw: R(0, TAU), tilt: R(-0.25, 0.25), tilt2: R(-0.25, 0.25), w: R(0.05, 0.12), col: i % PAL.length });
    }
  }
  if (!list.length) return;
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.castShadow = false;
  list.forEach((j, i) => mesh.setColorAt(i, PAL[(j.col + (i >> 3)) % PAL.length]));
  mesh.instanceColor.needsUpdate = true;
  fauna.add(mesh);
  const dummy = new THREE.Object3D(), q = new THREE.Quaternion();
  updaters.push((dt, t) => {
    const glow = 0.12 + 0.88 * Math.min(1, env.night * 1.15 + env.dusk * 0.3);
    mat.opacity = 0.2 + 0.75 * glow;
    mesh.visible = true;
    for (let i = 0; i < list.length; i++) {
      const j = list[i], sc = j.sc, ang = sc.ph + t * sc.speed;
      const x = sc.cx + Math.cos(ang) * sc.orbit + j.ox + Math.sin(t * j.w + j.p) * 1.6, z = sc.cz + Math.sin(ang) * sc.orbit * 0.8 + j.oz + Math.cos(t * j.w * 0.9 + j.p) * 1.4;
      const pulse = Math.sin(t * j.rate + j.p), wy = seaY(x, z);
      const y = Math.min(wy - 0.45, lerp(j.dayY, j.nightY, glow) + Math.sin(t * 0.3 + j.p) * 0.25 + pulse * 0.1);
      dummy.position.set(x, y, z);
      dummy.rotation.set(j.tilt + pulse * 0.04, j.yaw + t * 0.05, j.tilt2, 'YXZ');
      const sxz = j.s * (1 - pulse * 0.13), sy = j.s * (1 + pulse * 0.24);
      dummy.scale.set(sxz, sy, sxz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}

/* ====================================================================== build */
/* ====================================================================== WHITE TERNS (a flock) */
// White terns work the lagoon as one loose flock. Pairs fly close together while the flock circles the coral. Now and then a bird
// hovers over the water and plunges to pick a small fish off the surface, and the birds near it peel off and follow the dive, so the
// flock dives in turns. When the flock rests, birds land on the beach (pairs side by side, turning their heads to each other and
// preening). Frigatebirds and sea eagles over the lagoon get mobbed: the flock turns on them, then goes back to feeding. Walking up to
// the flock flushes it.
const TERN_FEED = { x: COVE.x - 6, z: COVE.z + 8 };
const TERN_HOVER = 5;      // metres above the water when hovering
const waterAt = (x, z) => Math.max(getHeight(x, z), 0);

class Tern {
  constructor(i, flock) {
    this.plumage = rnd() < 0.15 ? 'juv' : 'adult';
    this.b = makeTernModel(this.plumage) || makeBird(BIRD_SPECS.tern);
    this.group = new THREE.Group(); this.group.add(this.b.root); fauna.add(this.group); this.group.scale.setScalar(rr(0.9, 1.1));
    this.flock = flock; this.i = i; this.partner = null; this.perchSpot = null; this.yaw = 0;
    this.off = { a: rnd() * TAU, r: Math.sqrt(rnd()) * 6 };       // where it flies in the flock
    this.co = { x: rr(-2.5, 2.5), y: rr(-1, 1.5), z: rr(-2.5, 2.5) };   // its own spot in a chase or a flush
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.hd = rnd() * TAU; this.pitch = 0; this.roll = 0;
    this.ph = rnd() * 6; this.fl = 0; this.st = 'air'; this.t = 0; this.hx = 0; this.hz = 0; this.preen = 0; this.preenT = rr(6, 14);
    register({ id: 'tern' + i, name: 'White tern', cat: 'Birds', group: this.group, sim: this, viewDist: 10,
      desc: 'The fairy-white tern of the South Pacific: it flies the lagoon in a loose flock, pairs keeping close, and the flock dives in turns to pick small fish off the surface.', pickR: 1.6, pickY: 0.6 });
  }
  /** fly toward a point at up to `speed` metres a second, easing the velocity */
  steer(dt, tx, ty, tz, speed) {
    const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dy, dz) || 1e-6;
    const v = Math.min(speed, d * 1.6) / d, a = 1 - Math.exp(-3.2 * dt);
    this.vel.x += (dx * v - this.vel.x) * a; this.vel.y += (dy * v - this.vel.y) * a; this.vel.z += (dz * v - this.vel.z) * a;
    this.pos.addScaledVector(this.vel, dt);
  }
  startHover() {
    this.st = 'hover'; this.t = rr(1.2, 2.2); this.hx = this.pos.x; this.hz = this.pos.z;
  }
  /** heading, pitch and bank follow the velocity, so the bird banks into its turns and noses down on a dive */
  face(dt) {
    const vx = this.vel.x, vy = this.vel.y, vz = this.vel.z, hz = Math.hypot(vx, vz);
    if (hz > 0.4) {
      const d = angDiff(this.hd, Math.atan2(vx, vz));
      this.roll = damp(this.roll, clamp(-d * 1.2, -0.5, 0.5), 4, dt);
      this.hd += d * Math.min(1, dt * 4);
    }
    this.pitch = damp(this.pitch, -Math.atan2(vy, Math.max(hz, 0.5)) * 0.9, 4, dt);
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.pitch, this.hd, this.roll, 'YXZ');
    this.b.body.rotation.x = damp(this.b.body.rotation.x, 0, 4, dt);
    this.b.legs.forEach((l) => (l.visible = false));
  }
  flap(dt, t, amp, fold, rate) {
    this.ph += dt * rate;
    flapWings(this.b, this.ph, amp, fold, 0);
  }
  update(dt, t, F) {
    this.t -= dt;
    const water = waterAt(this.pos.x, this.pos.z);
    switch (this.st) {
      case 'air': {
        const s = F.slot(this);
        this.steer(dt, s.x, s.y, s.z, 12);
        this.fl = damp(this.fl, Math.sin(t * 0.8 + this.ph) > -0.1 ? 1 : 0, 2, dt);
        this.ph += dt * (7 + 6 * this.fl);
        flapWings(this.b, this.ph, lerp(0.14, 0.62, this.fl), 0, 1 - this.fl);
        break;
      }
      case 'hover': {
        // hovering in place, wings whirring, head into the wind
        this.steer(dt, this.hx, water + TERN_HOVER + Math.sin(t * 3 + this.ph) * 0.3, this.hz, 4);
        this.flap(dt, t, 0.85, 0, 16);
        if (this.t < 0) {
          this.st = 'plunge'; this.t = 1.1;
          this.flock.onDive(this);
        }
        break;
      }
      case 'plunge': {
        // folding the wings and dropping onto the water after a fish
        const ground = waterAt(this.hx, this.hz);
        this.steer(dt, this.hx, ground + 0.2, this.hz, 16);
        this.flap(dt, t, 0.15, 0.7, 6);
        if (this.t < 0 || this.pos.y < ground + 0.6) { if (ground <= 0.1) fx.splash(this.pos.x, 0, this.pos.z, 0.28); this.st = 'climb'; this.t = 1.6; }
        break;
      }
      case 'climb': {
        const s = F.slot(this);
        this.steer(dt, s.x, s.y + 4, s.z, 14);
        this.flap(dt, t, 0.55, 0, 11);
        if (this.t < 0) this.st = 'air';
        break;
      }
      case 'chase': {
        // harassing a frigatebird or eagle: a fast zig-zag at its wing
        const p = F.target.position;
        this.steer(dt, p.x + this.co.x, Math.min(p.y, F.alt + 25) + this.co.y, p.z + this.co.z, 16);   // a chase stays within reach of the lagoon
        this.flap(dt, t, 0.9, 0, 16);
        if (this.t < 0 || F.state !== 'mob') this.st = 'air';
        break;
      }
      case 'flee': {
        const f = F.fleeTarget;
        this.steer(dt, f.x + this.co.x * 3, f.y + this.co.y, f.z + this.co.z * 3, 18);
        this.flap(dt, t, 0.8, 0, 13);
        if (this.t < 0) this.st = 'air';
        break;
      }
      case 'toperch': {
        const s = this.perchSpot, tx = s.x, ty = s.y + 0.13, tz = s.z;
        this.steer(dt, tx, ty + 1.6, tz, 9);
        this.flap(dt, t, 0.6, 0, 9);
        if (Math.hypot(this.pos.x - tx, this.pos.z - tz) < 1.2 && this.pos.y < ty + 1.8) {
          this.st = 'perched'; this.pos.set(tx, ty, tz); this.yaw = Math.atan2(TERN_FEED.x - tx, TERN_FEED.z - tz); this.vel.set(0, 0, 0);
        }
        break;
      }
      case 'perched': {
        this.group.position.copy(this.pos);
        this.group.rotation.set(0, this.yaw, 0, 'YXZ');
        this.b.body.rotation.x = damp(this.b.body.rotation.x, -0.55, 4, dt);   // upright on the post
        this.b.legs.forEach((l) => (l.visible = true));
        flapWings(this.b, 0, 0, 1);
        // a pair turns its heads to each other; alone, a bird tucks its head back now and then to preen
        let yawT = 0, pitchT = 0.04 * Math.sin(t * 5 + this.ph);
        if (this.partner && this.partner.st === 'perched') {
          yawT = angDiff(this.yaw, Math.atan2(this.partner.pos.x - this.pos.x, this.partner.pos.z - this.pos.z));
        }
        this.preenT -= dt;
        if (this.preenT < 0) { this.preen = rr(1.2, 2.2); this.preenT = rr(6, 14); }
        if (this.preen > 0) { this.preen -= dt; pitchT = 0.7; yawT = 0.6; }
        this.b.hd.rotation.y = damp(this.b.hd.rotation.y, yawT, 3, dt);
        this.b.hd.rotation.x = damp(this.b.hd.rotation.x, pitchT, 4, dt);
        return;
      }
    }
    this.face(dt);
    this.b.hd.rotation.set(0, 0, 0);
  }
}

class TernFlock {
  constructor(perches, predators, n) {
    this.perches = perches; this.predators = predators; this.target = null; this.fleeTarget = null;
    this.a = rnd() * TAU; this.c = { x: TERN_FEED.x + Math.cos(this.a) * 20, z: TERN_FEED.z + Math.sin(this.a) * 20 };
    this.heading = -this.a; this.alt = 14; this.now = 0;
    this.state = 'feed'; this.t = rr(20, 35); this.cool = rr(4, 10); this.fleeCool = rr(2, 6); this.diveCool = rr(3, 6);
    this.members = [];
    for (let i = 0; i < n; i++) this.members.push(new Tern(i, this));
    for (let i = 0; i + 1 < n; i += 2) {                                 // pairs: 0-1, 2-3, ... fly close together
      const a = this.members[i], b = this.members[i + 1];
      a.partner = b; b.partner = a; b.off = { a: a.off.a + 0.35, r: Math.max(0.5, a.off.r * 0.8) };
    }
    for (const m of this.members) { const s = this.slot(m); m.pos.set(s.x, s.y, s.z); m.yaw = m.hd; }
    this.rigged = this.members.every((m) => m.b.hd);
  }
  slot(m) {
    const h = this.heading, lx = Math.cos(m.off.a) * m.off.r, lz = Math.sin(m.off.a) * m.off.r;
    return {
      x: this.c.x + lx * Math.cos(h) + lz * Math.sin(h),
      y: this.alt + Math.sin(this.now * 0.9 + m.ph) * 1.2,
      z: this.c.z - lx * Math.sin(h) + lz * Math.cos(h),
    };
  }
  onDive(diver) {
    // the birds nearest the diver follow it down
    for (const o of this.members) {
      if (o === diver || o.st !== 'air') continue;
      if (Math.hypot(o.pos.x - diver.pos.x, o.pos.z - diver.pos.z) < 9 && rnd() < 0.4) { o.st = 'hover'; o.t = rr(0.5, 1.1); o.hx = o.pos.x; o.hz = o.pos.z; }
    }
  }
  beginRest() {
    this.state = 'rest'; this.t = rr(20, 32);
    this.members.forEach((m, i) => { if (i < this.perches.length) { m.perchSpot = this.perches[i]; m.st = 'toperch'; } });
  }
  beginMob(p) {
    this.state = 'mob'; this.t = 6; this.target = p; this.cool = 25;
    for (const m of this.members) if (m.st !== 'perched' && m.st !== 'toperch') { m.st = 'chase'; m.t = 6; }
  }
  beginFlush() {
    this.state = 'flush'; this.t = 7; this.fleeCool = 20;
    // away from the viewer, across the lagoon
    const dx = this.c.x - camera.position.x, dz = this.c.z - camera.position.z, d = Math.hypot(dx, dz) || 1;
    this.fleeTarget = { x: this.c.x + (dx / d) * 120, y: 30, z: this.c.z + (dz / d) * 120 };
    for (const m of this.members) { m.st = 'flee'; m.t = 7; }
  }
  endAll() {
    this.state = 'feed'; this.t = rr(30, 50);
    for (const m of this.members) { if (m.st === 'perched' || m.st === 'toperch' || m.st === 'chase' || m.st === 'flee') { m.st = 'air'; } m.perchSpot = null; }
  }
  update(dt, t) {
    this.now = t;
    this.cool -= dt; this.fleeCool -= dt;
    const M = this.members, n = M.length;
    // someone walking up to the flock flushes it
    if (this.state !== 'flush' && this.fleeCool <= 0 && camera.position.y - waterAt(this.c.x, this.c.z) < 7) {
      if (M.some((m) => Math.hypot(m.pos.x - camera.position.x, m.pos.z - camera.position.z) < 7)) { this.beginFlush(); }
    }
    // a frigatebird or eagle over the lagoon gets mobbed
    if ((this.state === 'feed' || this.state === 'rest') && this.cool <= 0) {
      const p = this.predators.find((q) => Math.hypot(q.group.position.x - this.c.x, q.group.position.z - this.c.z) < 30 && q.group.position.y < 60);
      if (p) this.beginMob(p.group);
    }
    if (this.state === 'feed') {
      this.a += dt * 0.07;
      this.c.x = TERN_FEED.x + Math.cos(this.a) * 20; this.c.z = TERN_FEED.z + Math.sin(this.a) * 20;
      this.heading = -this.a;
      this.alt = 14 + Math.sin(t * 0.07) * 2;
      // a bird over the water starts a dive now and then (at most two at once)
      this.diveCool -= dt;
      if (this.diveCool < 0) {
        const diving = M.filter((m) => m.st === 'hover' || m.st === 'plunge').length;
        const cand = M.filter((m) => m.st === 'air' && getHeight(m.pos.x, m.pos.z) < 0.3);
        if (diving < 2 && cand.length) pick(cand).startHover();
        this.diveCool = rr(3.5, 6.5);
      }
      this.t -= dt;
      if (this.t < 0) {
        if (this.perches.length && rnd() < 0.5) this.beginRest(); else this.t = rr(30, 50);
      }
    } else if (this.state === 'rest') {
      this.t -= dt;
      if (this.t < 0) this.endAll();
    } else if (this.state === 'mob') {
      this.t -= dt;
      const p = this.target.position;
      this.c.x += (p.x - this.c.x) * Math.min(1, dt * 0.5); this.c.z += (p.z - this.c.z) * Math.min(1, dt * 0.5);
      if (this.t < 0) this.endAll();
    } else if (this.state === 'flush') {
      this.t -= dt;
      if (this.t < 0) this.endAll();
    }
    // keep apart: birds that get too close push each other off
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = M[i], b = M[j];
      if (a.st === 'perched' || b.st === 'perched') continue;
      const dx = a.pos.x - b.pos.x, dy = a.pos.y - b.pos.y, dz = a.pos.z - b.pos.z, d = Math.hypot(dx, dy, dz);
      if (d < 2.4 && d > 1e-3) {
        const k = (2.4 - d) / d * 0.5;
        a.pos.x += dx * k; a.pos.y += dy * k; a.pos.z += dz * k;
        b.pos.x -= dx * k; b.pos.y -= dy * k; b.pos.z -= dz * k;
      }
    }
    for (const m of M) m.update(dt, t, this);
  }
}

export function buildSkyAndSeaFauna(ctx) {
  // gulls around the coast and cove
  const centers = [
    { x: COVE.x, z: COVE.z + 20, r0: 22, r1: 48 }, { x: -40, z: 120, r0: 30, r1: 60 }, { x: 130, z: 20, r0: 30, r1: 60 }, { x: -140, z: -10, r0: 30, r1: 55 }, { x: 20, z: -120, r0: 25, r1: 50 },
  ];
  const gulls = [];
  let gi = 0;
  if (gullModelsReady()) centers.forEach((c, k) => { for (let i = 0; i < (k === 0 ? 4 : 2); i++) gulls.push(new Gull(gi++, c)); });
  const lorikeetFlocks = [];
  const cvx = COVE.x - 30, cvz = COVE.z - 8;
  const nearBeach = ctx.palms.filter((p) => p.y > 1.5).sort((a, b) => Math.hypot(a.x - cvx, a.z - cvz) - Math.hypot(b.x - cvx, b.z - cvz));
  const pal = ctx.palms.filter((p) => p.y > 1.5).concat(motuPalms);
  for (let i = 0; i < 3; i++) { const start = nearBeach[i * 4] || pal[i]; if (start) lorikeetFlocks.push(new LorikeetFlock(i, pal, start)); }
  const macaws = lorikeetFlocks.flatMap(f => f.members); // preserve existing callers
  const eagles = [new Eagle(0, 70, 150), new Eagle(1, 105, 120)];
  const frigatebirdColony = new FrigatebirdColony(pal, gulls);
  const frigatebirds = frigatebirdColony.members;
  // the terns rest on the beach by the castaway's canoe, and the flock of thirteen fishes the lagoon
  const perchSpots = falls.perches ? falls.perches.slice() : [];
  perchesNear(COVE.x, COVE.z, 120, (p) => p.kind === 'beach').slice(0, 4).forEach((p) => perchSpots.push({ x: p.x, y: p.y, z: p.z }));      // and on boulders along the beach
  const terns = new TernFlock(perchSpots, [...eagles, ...frigatebirds], 13);
  const dolphinPods = [new DolphinPod(0), new DolphinPod(1)];
  const dolphinPod = dolphinPods[0];
  const dolphins = dolphinPods.flatMap((pod) => pod.members);
  const turtles = [new Turtle(0), new Turtle(1), new Turtle(2)];
  const whale = new Whale(makeWhaleModel()), manta = new Manta();
  const sharkModel = makeSharkModel(), shark = sharkModel ? new Shark(sharkModel) : null;
  const all = [...gulls, ...lorikeetFlocks, ...eagles, frigatebirdColony, terns, ...dolphinPods, ...turtles, whale, ...(shark ? [shark] : []), manta];
  updaters.push((dt, t) => { const d = Math.min(dt, 0.05); for (const a of all) a.update(d, t); });
  buildFish();
  buildJellies();
  return { gulls, macaws, lorikeetFlocks, eagles, frigatebirds, frigatebirdColony, dolphins, dolphinPod, dolphinPods, turtles, whale, shark, manta };
}
