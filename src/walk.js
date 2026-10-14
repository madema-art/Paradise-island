// First-person walking: terrain following, trunk/boulder collisions, steps, jumping, wading and swimming.
import * as THREE from 'three';
import { camera, events, U, renderer } from './core.js';
import { getHeight, getSlope, walkHeight, resolveColliders, lavaDist, riverDist, VOL, LAKE, lakeRho, SPRING, falls, volcanoSteep } from './world.js';
import { Climber, climbRoute, nearStation, exitPoint, stationBelow } from './climb.js';
import { clamp, lerp, damp } from './util.js';
import { splashAt, wake as waterWake } from './ripples.js';

const EYE = 1.72, EYE_CROUCH = 1.05, SURF = -1.45, SWIM_DEPTH = -1.25, RADIUS = 0.42, LIMIT = 236;
const dom = renderer.domElement;

export const walk = {
  active: false, locked: false, pos: new THREE.Vector3(), yaw: 0, pitch: -0.04,
  vel: new THREE.Vector3(), vy: 0, grounded: true, swimming: false, crouch: 0, bob: 0, stride: 0, swimT: 0, foot: 0,
  fov: 55, speedXZ: 0, onLock: null, surface: 'grass',
};
const _p = { x: 0, z: 0 }, info = { tag: null };
walk.climber = new Climber();
let hintEl = null, fHeld = false;
function showHint(text) {
  if (!hintEl) {
    hintEl = document.createElement('div');
    hintEl.style.cssText = 'position:fixed;left:50%;bottom:22%;transform:translateX(-50%);padding:8px 16px;border-radius:10px;background:rgba(20,28,26,0.72);color:#f3ecd8;font:600 14px system-ui,sans-serif;letter-spacing:0.02em;pointer-events:none;z-index:30;display:none;backdrop-filter:blur(4px)';
    document.body.appendChild(hintEl);
  }
  hintEl.style.display = text ? 'block' : 'none';
  if (text) hintEl.textContent = text;
}

/* ---------------------------------------------------------------- pointer lock + look */
function lockChange() {
  walk.locked = document.pointerLockElement === dom;
  if (walk.onLock) walk.onLock(walk.locked);
}
document.addEventListener('pointerlockchange', lockChange);
document.addEventListener('mousemove', (e) => { if (walk.active && walk.locked) walk.look(e.movementX, e.movementY); });
walk.requestLock = () => {
  try { const r = dom.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* unsupported */ }
};
walk.releaseLock = () => { if (document.pointerLockElement === dom) document.exitPointerLock(); };
walk.look = (dx, dy) => {
  walk.yaw -= dx * 0.0022;
  walk.pitch = clamp(walk.pitch - dy * 0.0022, -1.5, 1.5);
};

/* ---------------------------------------------------------------- helpers */
export function surfaceAt(x, z, y, tag) {
  if (tag === 'temple') return 'stone';
  if (tag === 'cave') return 'stone';
  const h = getHeight(x, z);
  if (h < 0.1) return 'water';
  if (riverDist(x, z) < 2.0) return 'water';
  if (Math.hypot(x - VOL.x, z - VOL.z) < VOL.R && h > 26) return 'rock';
  if (getSlope(x, z) > 0.5) return 'rock';
  if (h < 3.1) return 'sand';
  return 'grass';
}

/** surface of the enclosed pools (the sea is handled by swimming) */
export function poolLevel(x, z) {
  if (lakeRho(x, z) < 1.08) return LAKE.y;
  const P = falls.pool;
  if (P && Math.hypot(x - P.x, z - P.z) < P.r + 1.5) return P.y;
  if (Math.hypot(x - SPRING.x, z - SPRING.z) < SPRING.r + 1.4) return SPRING.y - 0.05;
  return -1;
}

/** nearest standable land to (x,z) */
export function spawnNear(x, z) {
  for (let r = 0; r < 60; r += 2)
    for (let a = 0; a < 12; a++) {
      const px = x + Math.cos(a * 0.5236) * r, pz = z + Math.sin(a * 0.5236) * r;
      const h = getHeight(px, pz);
      if (h > 0.7 && getSlope(px, pz) < 0.35 && lavaDist(px, pz) > 6 && Math.hypot(px - VOL.x, pz - VOL.z) > 24) return { x: px, z: pz };
    }
  return { x, z };
}

/* ---------------------------------------------------------------- enter / leave */
walk.enter = (x, z, yaw) => {
  walk.active = true;
  walk.pos.set(x, walkHeight(x, z, 1e9), z);
  walk.yaw = yaw; walk.pitch = -0.04;
  walk.vel.set(0, 0, 0); walk.vy = 0; walk.grounded = true; walk.crouch = 0; walk.stride = 0; walk.bob = 0;
  walk.fov = camera.fov;
  if (walk.pos.y < SWIM_DEPTH) walk.pos.y = SURF;
};
walk.leave = () => {
  walk.active = false; walk.climber.active = false; showHint('');
  walk.releaseLock();
  camera.fov = walk.fov; camera.updateProjectionMatrix();
  U.pxScale.value = (innerHeight * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  return { x: walk.pos.x, y: walk.pos.y, z: walk.pos.z, yaw: walk.yaw, pitch: walk.pitch };
};
walk.teleport = (x, z, yaw) => {
  walk.pos.set(x, walkHeight(x, z, 1e9), z);
  if (walk.pos.y < SWIM_DEPTH) walk.pos.y = SURF;
  if (yaw != null) walk.yaw = yaw;
  walk.pitch = -0.04; walk.vel.set(0, 0, 0); walk.vy = 0; walk.grounded = true;
};

/* ---------------------------------------------------------------- per-frame */
function tryMove(nx, nz, stepLen) {
  nx = clamp(nx, -LIMIT, LIMIT); nz = clamp(nz, -LIMIT, LIMIT);
  _p.x = nx; _p.z = nz;
  resolveColliders(_p, RADIUS);
  // lava / crater are off limits
  const h = getHeight(_p.x, _p.z);
  if ((lavaDist(_p.x, _p.z) < 2.0 && h > 0.5) || Math.hypot(_p.x - VOL.x, _p.z - VOL.z) < 13) return false;
  if (volcanoSteep(_p.x, _p.z) && !volcanoSteep(walk.pos.x, walk.pos.z)) return false;      // too steep to walk: it takes a climb
  const g = walkHeight(_p.x, _p.z, walk.pos.y);
  const pl = poolLevel(_p.x, _p.z);
  if (pl > 0.5 && pl - g > 1.15) return false; // too deep to wade
  if (walk.grounded && !walk.swimming && g - walk.pos.y > 0.5 + 1.15 * stepLen) return false; // too steep / too high a step
  if (!walk.grounded && g > walk.pos.y + 0.35) return false;
  walk.pos.x = _p.x; walk.pos.z = _p.z;
  return true;
}

/** climbing Mount Ignis in first person: W/S up and down, A/D shuffle, Shift hurries, F lets go */
function climbWalk(dt, keys) {
  const C = walk.climber, dn = (a, b) => (keys.has(a) || (b && keys.has(b)) ? 1 : 0);
  const up = dn('KeyW', 'ArrowUp') - dn('KeyS', 'ArrowDown'), side = dn('KeyD') - dn('KeyA');
  const r = C.update(dt, { up, side, fast: keys.has('ShiftLeft') || keys.has('ShiftRight') });
  const p = walk.pos; p.copy(C.pos); walk.vel.set(0, 0, 0); walk.vy = 0; walk.grounded = true; walk.swimming = false; walk.speedXZ = 0;
  const fNow = keys.has('KeyF');
  if (fNow && !fHeld) {                                             // let go: slide to the ledge below
    if (C.rest) { C.stop(); const st = stationBelow(C.u); walk.teleport(st.x, st.z, C.heading + Math.PI); fHeld = fNow; showHint(''); return; }
    C.fall();
  }
  fHeld = fNow;
  const yaw0 = C.heading + Math.PI; let dy = walk.yaw - yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); walk.yaw = yaw0 + clamp(dy, -1.2, 1.2);
  camera.position.set(p.x, p.y + 1.5, p.z);
  camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
  showHint(C.rest ? 'Resting on a ledge · W climbs on · F steps off' : 'W / S climb · A / D shuffle · Shift hurry · F let go');
  if (r) {
    const e = exitPoint(r); C.stop();
    walk.teleport(e.x, e.z, r === 'top' ? C.heading + Math.PI : C.heading);
    showHint('');
  }
}

walk.update = (dt, keys) => {
  if (walk.climber.active) { climbWalk(dt, keys); return; }
  if (climbRoute.ready) {                                           // the foot of the climb, a rest ledge or the crest: F takes hold
    const stn = nearStation(walk.pos.x, walk.pos.z, 3.2);
    showHint(stn ? (stn.id === 'top' ? 'Press F to climb down' : stn.id === 'base' ? 'Press F to climb Mount Ignis' : 'Press F to keep climbing') : '');
    const fNow = keys.has('KeyF');
    if (stn && fNow && !fHeld) { walk.climber.start(stn.u); walk.pitch = stn.id === 'top' ? -0.5 : 0.55; fHeld = fNow; return; }
    fHeld = fNow;
  }
  const dn = (a, b) => (keys.has(a) || (b && keys.has(b)) ? 1 : 0);
  const fwdIn = dn('KeyW', 'ArrowUp') - dn('KeyS', 'ArrowDown');
  const strIn = dn('KeyD') - dn('KeyA');
  const rotIn = dn('KeyQ', 'ArrowLeft') - dn('KeyE', 'ArrowRight');
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const jumpIn = keys.has('Space'), cIn = keys.has('KeyC');
  walk.yaw += rotIn * 1.7 * dt;

  const sy = Math.sin(walk.yaw), cy = Math.cos(walk.yaw), cp = Math.cos(walk.pitch), sp = Math.sin(walk.pitch);
  const p = walk.pos;
  const g0 = walkHeight(p.x, p.z, p.y, info);
  const tag0 = info.tag;
  const swimming = g0 < SWIM_DEPTH;
  if (swimming !== walk.swimming) { walk.swimming = swimming; if (swimming) { walk.vy = 0; events.emit('splash', p.x, 0, p.z, 0.8); } }

  // ---- desired planar velocity
  let mx, mz;
  if (swimming) { mx = -sy * cp * fwdIn + cy * strIn; mz = -cy * cp * fwdIn - sy * strIn; }
  else { mx = -sy * fwdIn + cy * strIn; mz = -cy * fwdIn - sy * strIn; }
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const wading = !swimming && g0 < -0.05;
  walk.crouch = damp(walk.crouch, cIn && !swimming ? 1 : 0, 10, dt);
  const speed = (swimming ? 3.0 : wading ? 3.0 : 4.4) * (run ? (swimming ? 1.5 : 1.95) : 1) * (1 - 0.5 * walk.crouch);
  const k = walk.grounded || swimming ? 11 : 2.5;
  walk.vel.x = damp(walk.vel.x, mx * speed, k, dt);
  walk.vel.z = damp(walk.vel.z, mz * speed, k, dt);

  // ---- move in sub-steps (slide along obstacles)
  const dist = Math.hypot(walk.vel.x, walk.vel.z) * dt;
  const n = Math.max(1, Math.ceil(dist / 0.2));
  const hx = (walk.vel.x * dt) / n, hz = (walk.vel.z * dt) / n, sl = dist / n;
  for (let i = 0; i < n; i++) {
    if (tryMove(p.x + hx, p.z + hz, sl)) continue;
    if (tryMove(p.x + hx, p.z, sl)) continue;
    tryMove(p.x, p.z + hz, sl);
  }
  walk.speedXZ = dist / Math.max(dt, 1e-4);

  // ---- vertical
  const g = walkHeight(p.x, p.z, p.y, info);
  if (swimming) {
    const vin = (jumpIn ? 1 : 0) - (cIn ? 1 : 0);
    let vyS = vin * 2.6 + fwdIn * sp * speed * 0.9;
    if (!vin && Math.abs(fwdIn * sp) < 0.12) vyS += (SURF - p.y) * 2.6; // buoyancy back to the surface
    p.y = clamp(p.y + vyS * dt, g + 0.2, SURF + (vin > 0 ? 0.0 : 0));
    walk.vy = 0; walk.grounded = false;
    walk.swimT -= dt;
    if (walk.speedXZ > 0.8 && walk.swimT < 0) { walk.swimT = run ? 0.65 : 1.0; if (p.y > SURF - 0.4) { events.emit('swim', run); splashAt(p.x - sy * 0.7, p.z - cy * 0.7, run ? 0.32 : 0.2, { quiet: true }); } }
    if (walk.speedXZ > 0.6) waterWake(walk, p.x, p.z, walk.speedXZ, 0.6, dt);
  } else {
    if (walk.grounded) {
      if (g < p.y - 0.45) walk.grounded = false;
      else p.y += (g - p.y) * Math.min(1, dt * 20);
      if (jumpIn && walk.grounded && walk.crouch < 0.5) { walk.vy = 6.6; walk.grounded = false; events.emit('jump', surfaceAt(p.x, p.z, p.y, tag0)); }
    }
    if (!walk.grounded) {
      walk.vy -= 22 * dt;
      p.y += walk.vy * dt;
      if (p.y <= g) {
        if (walk.vy < -3.5) events.emit('land', Math.min(1, -walk.vy / 14), surfaceAt(p.x, p.z, p.y, info.tag));
        p.y = g; walk.vy = 0; walk.grounded = true;
      }
    }
    if (wading && walk.grounded && walk.speedXZ > 1.2) waterWake(walk, p.x, p.z, walk.speedXZ * 0.7, 0.45, dt, 0.25);
    // footsteps
    if (walk.grounded && walk.speedXZ > 0.6) {
      walk.stride += dist;
      const len = run ? 3.1 : 2.2;
      if (walk.stride > len) {
        walk.stride = 0; walk.foot ^= 1;
        events.emit('step', surfaceAt(p.x, p.z, p.y, info.tag), run, walk.foot);
        if (wading) splashAt(p.x, p.z, run ? 0.34 : 0.2, { quiet: true });
      }
    }
  }
  walk.surface = tag0;

  // ---- camera
  walk.bob += dist * (run ? 2.5 : 3.2);
  const moving = walk.grounded && !swimming ? Math.min(1, walk.speedXZ / 4) : 0;
  const bobY = Math.sin(walk.bob) * 0.045 * moving * (run ? 1.4 : 1);
  const bobX = Math.cos(walk.bob * 0.5) * 0.025 * moving;
  const eye = lerp(EYE, EYE_CROUCH, walk.crouch) + bobY + (swimming ? Math.sin(performance.now() * 0.002) * 0.05 : 0);
  camera.position.set(p.x + cy * bobX, p.y + eye, p.z - sy * bobX);
  camera.rotation.set(walk.pitch, walk.yaw, -strIn * 0.012 * moving + Math.sin(walk.bob * 0.5) * 0.004 * moving, 'YXZ');

  // run FOV kick
  const wantFov = walk.fov + (run && walk.speedXZ > 4 ? 6 : 0);
  if (Math.abs(camera.fov - wantFov) > 0.05) {
    camera.fov = damp(camera.fov, wantFov, 6, dt);
    camera.updateProjectionMatrix();
    U.pxScale.value = (innerHeight * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }
};
