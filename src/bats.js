// The fruit bat colony of the Crystal Cave: forty-two flying foxes roosting upside down in clusters on the hall ceiling, wrapped in their wings.
// What they do, from field notes on flying foxes (Pteropus):
//  - roost hanging by the feet, head down, wings wrapped like a cloak; they shuffle, groom, stretch a wing out, fan themselves in the heat of the day,
//    squabble with a neighbour, and chitter all day long
//  - a disturbance spreads through a colony like a wave: the nearest bats startle and open their wings, their neighbours follow a moment later,
//    each lets go and drops, unfurls its wings and flaps off; they mill in the hall, then stream out through the mouth, nose to tail
//  - they emerge in the evening in a long loose stream to feed at night in the fruit trees, and come back at dawn, circling and wheeling before each
//    bat flares up under its own roost spot, throws its feet up, hooks on, and folds its wings around itself
//  - a wingbeat of about three a second: a deep downstroke with the wing fully spread, an upstroke with the wrist flexed and the span shortened
import * as THREE from 'three';
import { scene, camera, events, updaters, wildlife } from './core.js';
import { fauna, register } from './fauna_common.js';
import { cave } from './cave.js';
import { CAVE, caveFloorAt, caveLocal, falls } from './world.js';
import { makeBatColony, batSpecimen } from './bat_model.js';
import { mulberry32, clamp, TAU } from './util.js';

const N = 42;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const E = new THREE.Euler(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), M = new THREE.Matrix4(), S3 = new THREE.Vector3();
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const FOOT = 0.23;                       // from the body's centre to the hooked feet, per unit of scale

export const bats = { colony: null, list: [], mode: 'roost' };

const STATE_TEXT = {
  roost: 'Roosting, hanging upside down', alert: 'Startled: wings opening', drop: 'Dropping from the ceiling', fly: 'Flying', land: 'Landing: swinging up to hook on',
};

export function buildBats(ctx = {}) {
  if (!cave.ready) return null;
  const col = makeBatColony(N);
  if (!col) return null;
  scene.add(col.mesh);
  const rng = mulberry32(0xba7), rr = (a, b) => a + (b - a) * rng(), rnd = () => rng();
  const now = { t: 0 };

  /* ---- roost spots: clusters of seven round six seed spots */
  const slots = cave.roost.slice();
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const chosen = [], taken = new Set();
  for (let c = 0; c < 6; c++) {
    const seed = slots.find((s) => !taken.has(s)); if (!seed) break;
    const near = slots.filter((s) => !taken.has(s)).sort((a, b) => a.world.distanceTo(seed.world) - b.world.distanceTo(seed.world)).slice(0, N / 6);
    near.forEach((s) => { taken.add(s); chosen.push(s); });
  }
  while (chosen.length < N) chosen.push(slots.find((s) => !taken.has(s) && !chosen.includes(s)) || slots[chosen.length % slots.length]);

  /* ---- the way out: through the throat of the cave, over the pool and the falls, then wherever the flock goes */
  const W = (bx, by, bz) => cave.toWorld(bx, by, bz);
  const EXIT = [W(0.4, 12, 3.6), W(0.2, 7.2, 3.1), W(0, 3.2, 2.8), W(0, -1, 2.9), W(0, -6.5, 3.8)];
  const n = falls.n;
  const OUT0 = cave.mouthOut.clone().addScaledVector(V(n.x, 0, n.z), 36); OUT0.y = cave.mouthOut.y + 16;
  const ctr = cave.hall.clone();

  /* ---- the bats */
  const list = [];
  const colony = { mode: 'roost', outUntil: 0, dusk: false, duskDone: false, returning: false, disturb: 0, cool: 20, center: OUT0.clone(), centerT: 0, callT: 3, flushes: 0 };
  for (let i = 0; i < N; i++) {
    const slot = chosen[i], pup = i % 7 === 6;
    const grp = new THREE.Group(); fauna.add(grp);
    const b = {
      i, slot, home: slot.world.clone(), yaw: rnd() * TAU, scale: pup ? rr(0.82, 0.95) : rr(1.25, 1.55), pup, age: pup ? 'Pup' : rnd() < 0.2 ? 'Young adult' : 'Adult', sex: rnd() < 0.5 ? 'Female' : 'Male',
      state: 'roost', t: 0, act: 'none', actT: rr(2, 22), actDur: 1, pos: V(), vel: V(), heading: 0, pitch: 0, roll: 0, ph: rnd() * TAU, amp: 0, fold: 1, dih: 0.1, freq: rr(2.7, 3.4),
      stage: '', stageT: 0, delay: 0, orbitR: rr(3.6, 6.4), orbitA: rnd() * TAU, orbitH: rr(2.4, 5.2), orbitDir: 1, outR: rr(30, 62), outA: rnd() * TAU, outH: rr(14, 32), outDir: rnd() < 0.5 ? 1 : -1,
      wpi: 0, lateral: V(rr(-0.6, 0.6), rr(-0.3, 0.3), 0), swayP: rnd() * 6, glide: 0, glideT: rr(3, 9), turn: 0, hangQ: new THREE.Quaternion(), homeAt: 0, landWait: 0, speed: rr(5.6, 7.6), last: V(), group: grp, flap: 0,
    };
    b.state = 'roost';
    col.mesh.setColorAt(i, new THREE.Color().setHSL(0.07, 0.15, 0.78 + 0.35 * rnd()));
    register({ id: 'fruitbat' + i, name: 'Fruit bat', cat: 'Mammals', group: grp, sim: b, viewDist: 4.5, pickR: 0.9, pickY: 0, specimen: batSpecimen,
      desc: 'A flying fox, the largest bat on the island. Roosts by the hundred in the Crystal Cave, wrapped in its wings, and takes to the air together at dusk or when disturbed.' });
    list.push(b);
  }
  col.mesh.instanceColor.needsUpdate = true;
  bats.colony = colony; bats.list = list;

  const hangPos = (b, out) => out.copy(b.home).addScaledVector(UP, -FOOT * b.scale);
  const setHangQ = (b, out, sx = 0, sz = 0, yaw = 0) => out.setFromEuler(E.set(Math.PI / 2 + sx, b.yaw + yaw, sz, 'YXZ'));

  /* ---- disturbance: the colony starts as one */
  function flush(srcPos, reason = 'disturbed') {
    if (colony.mode !== 'roost') return;
    colony.mode = 'out'; colony.dusk = false; colony.returning = false; colony.flushes++;
    colony.outUntil = now.t + rr(60, 110); colony.reason = reason;
    colony.center.copy(OUT0);
    const src = srcPos || cave.hall;
    list.forEach((b) => {
      if (b.state !== 'roost') return;
      b.state = 'alert'; b.t = 0;
      b.delay = Math.max(0.05, b.home.distanceTo(src) * 0.16 + rr(0.1, 0.7));      // the wave: the startle spreads out from the nearest bats
      b.actT = 0; b.act = 'none';
    });
    emitCall(src, 1);
  }
  function emitCall(p, k) { events.emit('batcall', p.x, p.y, p.z, k); }
  events.on('eruptBlast', () => { if (colony.mode === 'roost' && colony.cool <= 0 && rnd() < 0.08) flush(cave.hall, 'rumble'); });
  bats.flush = flush;

  function startDusk() {
    if (colony.mode !== 'roost') return;
    colony.mode = 'out'; colony.dusk = true; colony.returning = false; colony.reason = 'dusk';
    colony.center.copy(OUT0);
    list.forEach((b) => { b.state = 'alert'; b.t = 0; b.delay = rr(0, 70); b.calm = true; b.actT = 0; b.act = 'none'; });
  }

  /* ---- roosting life */
  function roostAct(b, dt, t) {
    b.actT -= dt;
    if (b.act === 'none' && b.actT <= 0) {
      const r = rnd(), hot = wildlife.tod > 10.5 && wildlife.tod < 16.5;
      b.act = r < 0.4 ? 'groom' : r < 0.58 ? 'stretch' : r < 0.74 ? 'shift' : hot && r < 0.95 ? 'fan' : 'groom';
      b.actDur = b.act === 'stretch' ? rr(3.2, 4.4) : b.act === 'fan' ? rr(4, 7) : b.act === 'shift' ? 1.6 : rr(2.5, 5);
      b.actT = b.actDur; b.actK = 0;
      // a neighbour too close: a squabble
      if (rnd() < 0.18) {
        const o = list.find((q) => q !== b && q.state === 'roost' && q.act === 'none' && q.home.distanceTo(b.home) < 1.5);
        if (o) { b.act = o.act = 'squabble'; b.actDur = o.actDur = rr(1.5, 2.6); b.actT = o.actT = b.actDur; b.actK = o.actK = 0; b.foe = o; o.foe = b; if (ctx.audio !== false) emitCall(b.home, 0.5); }
      }
    }
    let fold = 1, amp = 0, ph = b.ph, sx = Math.sin(t * 0.55 + b.swayP) * 0.035, sz = Math.sin(t * 0.43 + b.swayP * 1.7) * 0.035, yaw = 0;
    if (b.act !== 'none') {
      b.actK += dt; const k = b.actK / b.actDur, env_ = Math.sin(clamp(k, 0, 1) * Math.PI), e2 = smooth(env_ * 3);
      if (b.act === 'groom') { fold = 1 - 0.42 * e2; amp = 0.06 * e2; ph = t * 14; sx += 0.07 * Math.sin(t * 9) * e2; }
      else if (b.act === 'stretch') { fold = 1 - 0.93 * e2; amp = 0.18 * e2; ph = t * 2.2; sx += 0.05 * Math.sin(t * 2.2) * e2; }
      else if (b.act === 'fan') { fold = 1 - 0.68 * e2; amp = 0.4 * e2; ph = t * 7.5; }
      else if (b.act === 'shift') { yaw = 0.5 * Math.sin(k * Math.PI) * (b.i % 2 ? 1 : -1); sz += 0.12 * Math.sin(k * Math.PI * 2); fold = 1 - 0.1 * e2; }
      else if (b.act === 'squabble') { fold = 1 - 0.55 * e2; amp = 0.3 * e2; ph = t * 10 + b.i; yaw = 0.35 * Math.sin(t * 12 + b.i) * e2; sz += 0.1 * Math.sin(t * 15) * e2; }
      if (b.actK >= b.actDur) { b.act = 'none'; b.actT = rr(6, 26); b.foe = null; }
    }
    b.fold = fold; b.amp = amp; b.ph = ph; b.dih = 0.1;
    hangPos(b, b.pos); setHangQ(b, b.hangQ, sx, sz, yaw);
    b.q = b.hangQ;
  }

  /* ---- flight */
  const tmp = V(), tgt = V(), sep = V(), last = V(), perchT = V();
  function steer(b, target, speed, dt, agility = 3.2) {
    tgt.copy(target).sub(b.pos);
    const d = tgt.length() || 1;
    tgt.multiplyScalar(speed / d);
    // keep apart from neighbours
    sep.set(0, 0, 0);
    for (let k = 0; k < list.length; k++) {
      const o = list[k]; if (o === b || (o.state !== 'fly' && o.state !== 'drop')) continue;
      tmp.copy(b.pos).sub(o.pos); const dd = tmp.lengthSq();
      if (dd < 1.4 && dd > 1e-4) sep.addScaledVector(tmp, (1.4 - dd) / dd * 0.9);
    }
    tgt.add(sep);
    b.vel.lerp(tgt, 1 - Math.exp(-agility * dt));
    const sp = b.vel.length(); if (sp > speed * 1.3) b.vel.multiplyScalar(speed * 1.3 / sp);
    last.copy(b.pos);
    b.pos.addScaledVector(b.vel, dt);
    // the cave walls: inside the cave a bat cannot leave the open floor area
    const q = caveLocal(b.pos.x, b.pos.z);
    if (b.stage !== 'perch' && q.by > 9.5 && q.by < 62 && caveFloorAt(b.pos.x, b.pos.z) == null) { b.vel.multiplyScalar(0.6); b.pos.x += (ctr.x - b.pos.x) * Math.min(1, dt * 1.6); b.pos.z += (ctr.z - b.pos.z) * Math.min(1, dt * 1.6); }
    // orientation follows the velocity
    const hx = b.vel.x, hz = b.vel.z, hs = Math.hypot(hx, hz);
    if (hs > 0.3) {
      const nh = Math.atan2(hx, hz), dh = wrap(nh - b.heading);
      b.heading += dh * Math.min(1, dt * 6);
      b.turn += (dh / Math.max(dt, 1e-3) - b.turn) * Math.min(1, dt * 4);
    }
    b.pitch += (-Math.atan2(b.vel.y, Math.max(hs, 0.5)) * 0.9 - b.pitch) * Math.min(1, dt * 5);
    b.roll += (clamp(-b.turn * 0.32, -0.75, 0.75) - b.roll) * Math.min(1, dt * 4);
  }
  function wings(b, dt, kind) {
    // flap, or glide now and then on the straight
    b.glideT -= dt;
    if (b.glide <= 0 && b.glideT <= 0 && kind === 'out') { b.glide = rr(1.2, 2.6); b.glideT = rr(5, 11); }
    if (b.glide > 0) { b.glide -= dt; b.amp += (0.1 - b.amp) * Math.min(1, dt * 4); b.dih += (0.28 - b.dih) * Math.min(1, dt * 3); }
    else { b.amp += ((kind === 'climb' ? 1.15 : 1.0) - b.amp) * Math.min(1, dt * 5); b.dih += (0.1 - b.dih) * Math.min(1, dt * 3); b.ph += dt * TAU * b.freq * (kind === 'climb' ? 1.15 : 1); }
    b.fold = Math.max(0, b.fold - dt * 4);
  }
  const orbitPoint = (b, c, r, a, h, out) => out.set(c.x + Math.cos(a) * r, h, c.z + Math.sin(a) * r);

  function flyUpdate(b, dt, t) {
    b.stageT -= dt;
    b.stageAge = (b.stageAge || 0) + dt; if (b.stage !== b.lastStage) { b.lastStage = b.stage; b.stageAge = 0; b.lastWp = -9; }
    if ((b.stage === 'exit' || b.stage === 'home') && b.stageAge > 18 + b.wpi * 0) { b.stageAge = 0; if (b.stage === 'exit') b.wpi = Math.min(EXIT.length, b.wpi + 1); else b.wpi = Math.max(-1, b.wpi - 1); if (b.stage === 'exit' && b.wpi >= EXIT.length) { b.stage = 'out'; } if (b.stage === 'home' && b.wpi < 0) { b.stage = 'circle'; b.stageT = 3; } }
    if (b.stage === 'circle') {
      const w = b.speed / b.orbitR; b.orbitA += w * b.orbitDir * dt;
      orbitPoint(b, ctr, b.orbitR, b.orbitA + 0.5 * b.orbitDir, cave.hall.y - 3.2 + b.orbitH * 0.6 + Math.sin(t * 1.3 + b.i) * 0.5, tgt);
      steer(b, tgt.clone(), b.speed * 0.95, dt, 3.5);
      wings(b, dt, 'climb');
      if (b.stageT <= 0 && colony.mode === 'out') { b.stage = 'exit'; b.wpi = 0; }
      else if (b.stageT <= 0 && colony.mode === 'return') { b.stage = 'perch'; b.stageT = 99; b.state = 'fly'; }
    } else if (b.stage === 'exit') {
      const wp = EXIT[b.wpi]; tgt.copy(wp).addScaledVector(V(1, 0, 0), b.lateral.x * 0.5); tgt.y = wp.y + b.lateral.y * 0.5;
      steer(b, tgt, b.speed * 1.05, dt, 3.8);
      wings(b, dt, 'out');
      if (b.pos.distanceTo(wp) < 1.7) { b.wpi++; if (b.wpi >= EXIT.length) { b.stage = 'out'; b.outA = Math.atan2(b.pos.z - colony.center.z, b.pos.x - colony.center.x); } }
    } else if (b.stage === 'out') {
      const w = (b.speed * 0.9) / b.outR; b.outA += w * b.outDir * dt;
      orbitPoint(b, colony.center, b.outR, b.outA + 0.35 * b.outDir, colony.center.y + b.outH - 22 + Math.sin(t * 0.3 + b.i) * 2.5, tgt);
      steer(b, tgt, b.speed, dt, 1.6);
      wings(b, dt, 'out');
      if (colony.mode === 'return' && t > b.homeAt) { b.stage = 'home'; b.wpi = EXIT.length - 1; }
    } else if (b.stage === 'home') {
      const wp = EXIT[b.wpi]; tgt.copy(wp).addScaledVector(V(1, 0, 0), b.lateral.x * 0.4);
      steer(b, tgt, b.speed, dt, 3.0);
      wings(b, dt, 'out');
      if (b.pos.distanceTo(wp) < 2.4) { b.wpi--; if (b.wpi < 0) { b.stage = 'circle'; b.stageT = rr(2.5, 6.5); b.orbitA = Math.atan2(b.pos.z - ctr.z, b.pos.x - ctr.x); b.orbitDir = rnd() < 0.5 ? 1 : -1; } }
    } else if (b.stage === 'perch') {
      // fly in a loose circle under the roost spot, then flare up to it
      perchT.copy(b.home); perchT.y -= 2.4; perchT.x += Math.cos(b.orbitA) * 1.4; perchT.z += Math.sin(b.orbitA) * 1.4; b.orbitA += dt * 2.2;
      steer(b, perchT, b.speed * 0.8, dt, 3.0);
      wings(b, dt, 'climb');
      b.stageT -= 0;
      const d = b.pos.distanceTo(perchT);
      if (d < 1.0 && (t - b.landWait) > 0) { b.state = 'land'; b.t = 0; b.landFrom = b.pos.clone(); b.landQ = new THREE.Quaternion().setFromEuler(E.set(b.pitch, b.heading, b.roll, 'YXZ')); }
    }
    b.q = Q.setFromEuler(E.set(b.pitch, b.heading, b.roll, 'YXZ')).clone();
  }

  /* ---- the frame */
  const _hp = V(), _hq = new THREE.Quaternion();
  function update(dt, t) {
    now.t = t;
    const cam = camera.position, nearCave = cam.distanceTo(cave.hall) < 70;
    // disturbance from a visitor in the hall, dusk, and coming home
    if (colony.mode === 'roost') {
      colony.cool -= dt;
      let close = cam.distanceTo(cave.hall) < 13 && cave.inside(cam.x, cam.y, cam.z);
      if (!close) for (const b of list) if (b.home.distanceTo(cam) < 6.5 && cave.inside(cam.x, cam.y, cam.z)) { close = true; break; }
      colony.disturb = close ? colony.disturb + dt : Math.max(0, colony.disturb - dt * 0.6);
      if (colony.disturb > 1.3 && colony.cool <= 0) { colony.disturb = 0; let nb = list[0], nd = 1e9; for (const b of list) { const d = b.home.distanceTo(cam); if (d < nd) { nd = d; nb = b; } } flush(nb.home, 'visitor'); }
      if (wildlife.tod < 12) colony.duskDone = false;
      if (!colony.duskDone && wildlife.tod >= 18.4 && wildlife.tod < 23 && colony.cool <= 0) { colony.duskDone = true; startDusk(); }
    } else if (colony.mode === 'out') {
      // the flock ranges over the island; at night it works from fruit tree to fruit tree
      colony.centerT -= dt;
      if (colony.centerT <= 0) {
        colony.centerT = colony.dusk ? rr(18, 34) : 1e9;
        if (colony.dusk && ctx.palms && ctx.palms.length) { const p = ctx.palms[Math.floor(rnd() * ctx.palms.length)]; colony.center.set(p.x, p.y + 24, p.z); }
        else colony.center.copy(OUT0);
      }
      const far = cam.distanceTo(cave.hall) > 26;
      const back = colony.dusk ? (wildlife.tod >= 5.0 && wildlife.tod < 12) : t > colony.outUntil;
      if (back && far) {
        colony.mode = 'return'; colony.returning = true; colony.returnT = t;
        list.forEach((b) => { b.homeAt = t + rr(0, 28); b.landWait = t + rr(0, 20); });
      }
    } else if (colony.mode === 'return') {
      if (t > colony.returnT + 75) list.forEach((b) => { if (b.state === 'fly') { b.state = 'land'; b.t = 0; b.landFrom = b.pos.clone(); b.landQ = new THREE.Quaternion().setFromEuler(E.set(b.pitch, b.heading, b.roll, 'YXZ')); } });      // stragglers are brought in
      if (list.every((b) => b.state === 'roost')) { colony.mode = 'roost'; colony.cool = 90; colony.disturb = 0; }
    }

    // chatter
    colony.callT -= dt;
    if (colony.callT <= 0) {
      colony.callT = colony.mode === 'roost' ? rr(2.5, 7) : rr(0.6, 2.2);
      if (nearCave || colony.mode !== 'roost') { const b = list[Math.floor(rnd() * N)]; emitCall(b.state === 'roost' ? b.home : b.pos, colony.mode === 'roost' ? 0.3 : 0.7); }
    }

    // each bat
    for (let i = 0; i < N; i++) {
      const b = list[i];
      if (b.state === 'roost') roostAct(b, dt, t);
      else if (b.state === 'alert') {
        b.t += dt;
        const k = smooth(b.t / Math.max(b.delay, 0.2)), tremble = Math.sin(t * 38 + b.i) * 0.05 * k;
        b.fold = 1 - 0.5 * k; b.amp = 0.06 * k; b.ph = t * 16; b.dih = 0.1;
        hangPos(b, b.pos); setHangQ(b, b.hangQ, tremble, tremble * 0.7); b.q = b.hangQ;
        if (b.t >= b.delay) { b.state = 'drop'; b.t = 0; b.vel.set(0, -0.4, 0); b.stage = 'circle'; b.stageT = b.calm ? rr(3, 9) : rr(3.2, 8.5); b.orbitA = rnd() * TAU; b.orbitDir = rnd() < 0.5 ? 1 : -1; b.calm = false; b.hangFrom = b.pos.clone(); b.heading = b.yaw; b.pitch = Math.PI / 2; b.roll = 0; }
      } else if (b.state === 'drop') {
        b.t += dt; const k = clamp(b.t / 0.55, 0, 1);
        b.vel.y -= 7 * dt; b.vel.x += Math.sin(b.heading) * 2 * dt; b.vel.z += Math.cos(b.heading) * 2 * dt;
        b.pos.addScaledVector(b.vel, dt);
        b.fold = Math.max(0, 1 - k * 1.7); b.amp = clamp((b.t - 0.12) * 2.2, 0, 1); b.ph += dt * TAU * b.freq * (b.t > 0.12 ? 1.1 : 0.4); b.dih = 0.1;
        b.pitch += (0.15 - b.pitch) * Math.min(1, dt * 4.5);                      // swing out of the hang into level flight
        b.q = Q.setFromEuler(E.set(b.pitch, b.heading, b.roll, 'YXZ')).clone();
        if (b.t > 0.55) { b.state = 'fly'; b.vel.y = Math.max(b.vel.y, 0); }
      } else if (b.state === 'fly') flyUpdate(b, dt, t);
      else if (b.state === 'land') {
        b.t += dt; const k = smooth(b.t / 1.0);
        hangPos(b, _hp); setHangQ(b, _hq);
        // swing up under the roost spot, throw the feet up, and hook on
        b.pos.lerpVectors(b.landFrom, _hp, k); b.pos.y += Math.sin(k * Math.PI) * 0.25;
        b.q = Q2.slerpQuaternions(b.landQ, _hq, smooth(b.t / 0.85)).clone();
        b.ph += dt * TAU * b.freq * (1 - k); b.amp = Math.max(0, 1 - k * 1.6); b.fold = smooth((b.t - 0.45) / 0.55); b.dih = 0.1;
        if (b.t >= 1.0) { b.state = 'roost'; b.act = 'none'; b.actT = rr(3, 15); b.stage = ''; b.vel.set(0, 0, 0); }
      }
      if (b.state === 'fly' && b.stage === 'perch' && colony.mode === 'roost') b.state = 'fly';
    }

    // write the instances
    for (let i = 0; i < N; i++) {
      const b = list[i];
      M.compose(b.pos, b.q || hangQDefault(b), S3.setScalar(b.scale));
      col.mesh.setMatrixAt(i, M);
      col.anim.setXYZW(i, b.ph, b.amp, b.fold, b.dih);
      b.group.position.copy(b.pos);
      b.state_text = STATE_TEXT[b.state === 'roost' && b.act !== 'none' ? 'roost' : b.state] || 'Flying';
    }
    col.mesh.instanceMatrix.needsUpdate = true; col.anim.needsUpdate = true;
  }
  const hangQDefault = (b) => { setHangQ(b, b.hangQ); return b.hangQ; };
  list.forEach((b) => { hangPos(b, b.pos); b.q = setHangQ(b, b.hangQ); });
  updaters.push((dt, t) => update(Math.min(dt, 0.05), t));
  return bats;
}
