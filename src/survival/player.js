// The player's body in the world (walk, run, jump, wade, swim, trunk collisions) and the third-person camera that follows it.
import * as THREE from 'three';
import { camera, events, U, env } from '../core.js';
import { getHeight, walkHeight, resolveColliders, lavaDist, VOL, volcanoSteep, caveFloorAt } from '../world.js';
import { poolLevel, surfaceAt } from '../walk.js';
import { cam } from '../camera.js';
import { input } from './input.js';
import { clamp, damp, lerp } from '../util.js';
import { splashAt, wake as waterWake } from '../ripples.js';

const RADIUS = 0.42, LIMIT = 236, SWIM_DEPTH = -1.2;
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Player {
  constructor(avatar) {
    this.avatar = avatar;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0; this.vy = 0; this.grounded = true; this.swimming = false;
    this.speed = 0; this.stride = 0; this.foot = 0; this.swimT = 0; this.wasSwim = false;
    this.run = false; this.moving = false;
    // camera rig
    this.cYaw = 0; this.cPitch = 0.5; this.cDist = 5; this.cDistG = 5;
    this.look = new THREE.Vector3();
    this.info = { tag: null }; this._p = { x: 0, z: 0 };
    this.tag = null;
  }

  reset(x, z, heading = 0) {
    this.pos.set(x, walkHeight(x, z, 1e9), z);
    this.vel.set(0, 0, 0); this.vy = 0; this.grounded = true; this.swimming = false;
    this.heading = heading;
    this.cYaw = heading + Math.PI;                 // camera behind him
    this.look.set(x, this.pos.y + 1.4, z);
  }

  tryMove(nx, nz, stepLen) {
    nx = clamp(nx, -LIMIT, LIMIT); nz = clamp(nz, -LIMIT, LIMIT);
    const _p = this._p; _p.x = nx; _p.z = nz;
    resolveColliders(_p, RADIUS);
    const h = getHeight(_p.x, _p.z);
    if ((lavaDist(_p.x, _p.z) < 2.0 && h > 0.5) || Math.hypot(_p.x - VOL.x, _p.z - VOL.z) < 13) return false;
    if (volcanoSteep(_p.x, _p.z) && !volcanoSteep(this.pos.x, this.pos.z)) return false;      // too steep for a walk: climb
    const g = walkHeight(_p.x, _p.z, this.pos.y);
    const pl = poolLevel(_p.x, _p.z);
    if (pl > 0.5 && pl - g > 1.15) return false;                       // too deep to wade
    if (this.grounded && !this.swimming && g - this.pos.y > 0.5 + 1.15 * stepLen) return false;   // too steep
    if (!this.grounded && g > this.pos.y + 0.35) return false;
    this.pos.x = _p.x; this.pos.z = _p.z;
    return true;
  }

  /** ctl: {fwd, str, run, jump, frozen} — fwd/str in -1..1 relative to the camera */
  update(dt, ctl) {
    const p = this.pos, av = this.avatar;
    const sy = Math.sin(this.cYaw), cy = Math.cos(this.cYaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    let mx = fx * ctl.fwd + rx * ctl.str, mz = fz * ctl.fwd + rz * ctl.str;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    if (ctl.frozen) { mx = 0; mz = 0; }
    const g0 = walkHeight(p.x, p.z, p.y, this.info);
    this.tag = this.info.tag;
    const swimming = g0 < SWIM_DEPTH;
    if (swimming !== this.swimming) { this.swimming = swimming; if (swimming) { this.vy = 0; events.emit('splash', p.x, 0, p.z, 0.8); } }
    const wading = !swimming && g0 < -0.05;
    this.run = !!ctl.run && ml > 0.2 && !ctl.frozen;
    const speed = (swimming ? 2.7 : wading ? 2.8 : 4.0) * (this.run ? (swimming ? 1.45 : 1.85) : 1) * (ctl.slow || 1);
    const k = this.grounded || swimming ? 11 : 2.5;
    this.vel.x = damp(this.vel.x, mx * speed, k, dt);
    this.vel.z = damp(this.vel.z, mz * speed, k, dt);
    const dist = Math.hypot(this.vel.x, this.vel.z) * dt;
    const n = Math.max(1, Math.ceil(dist / 0.2));
    const hx = (this.vel.x * dt) / n, hz = (this.vel.z * dt) / n, sl = dist / n;
    for (let i = 0; i < n; i++) {
      if (this.tryMove(p.x + hx, p.z + hz, sl)) continue;
      if (this.tryMove(p.x + hx, p.z, sl)) continue;
      this.tryMove(p.x, p.z + hz, sl);
    }
    this.speed = dist / Math.max(dt, 1e-4);
    this.moving = this.speed > 0.5;
    // facing: toward where he is going
    if (this.speed > 0.6 && ml > 0.05) this.heading += wrap(Math.atan2(this.vel.x, this.vel.z) - this.heading) * Math.min(1, dt * 12);

    const g = walkHeight(p.x, p.z, p.y, this.info);
    if (swimming) {
      p.y = damp(p.y, 0.08 + Math.sin(performance.now() * 0.0017) * 0.03, 8, dt);
      this.vy = 0; this.grounded = false;
      this.swimT -= dt;
      if (this.speed > 0.8 && this.swimT < 0) { this.swimT = this.run ? 0.65 : 1.0; events.emit('swim', this.run); splashAt(p.x + Math.sin(this.heading) * 0.7, p.z + Math.cos(this.heading) * 0.7, this.run ? 0.32 : 0.2, { quiet: true }); }
      if (this.speed > 0.6) waterWake(this, p.x, p.z, this.speed, 0.6, dt);
    } else {
      if (this.wasSwim) { this.grounded = true; }
      if (this.grounded) {
        if (g < p.y - 0.45) this.grounded = false;
        else p.y += (g - p.y) * Math.min(1, dt * 20);
        if (ctl.jump && this.grounded && !ctl.frozen) { this.vy = 6.2; this.grounded = false; events.emit('jump', surfaceAt(p.x, p.z, p.y, this.tag)); }
      }
      if (!this.grounded) {
        this.vy -= 22 * dt;
        p.y += this.vy * dt;
        if (p.y <= g) {
          if (this.vy < -3.5) events.emit('land', Math.min(1, -this.vy / 14), surfaceAt(p.x, p.z, p.y, this.info.tag));
          p.y = g; this.vy = 0; this.grounded = true;
        }
      }
      if (this.grounded && this.speed > 0.6) {
        this.stride += dist;
        const len = this.run ? 3.1 : 2.2;
        if (this.stride > len) { this.stride = 0; this.foot ^= 1; events.emit('step', surfaceAt(p.x, p.z, p.y, this.info.tag), this.run, this.foot); if (wading) splashAt(p.x, p.z, this.run ? 0.34 : 0.2, { quiet: true }); }
        if (wading && this.speed > 1.2) waterWake(this, p.x, p.z, this.speed * 0.7, 0.45, dt, 0.25);
      }
    }
    this.wasSwim = swimming;
  }

  /** where the third-person camera wants to be, then slide it there */
  updateCamera(dt, focusUp = 1.45) {
    const p = this.pos;
    // look controls: mouse drag and the arrow keys, wheel zoom
    this.cYaw -= input.dx * 0.0052;
    this.cPitch = clamp(this.cPitch + input.dy * 0.0046, -0.1, 1.35);
    const rot = (input.held('ArrowLeft') ? 1 : 0) - (input.held('ArrowRight') ? 1 : 0);
    this.cYaw += rot * 1.9 * dt;
    this.cDistG = clamp(this.cDistG * Math.exp(clamp(input.wheel, -400, 400) * 0.0011), 2.2, 11);
    this.cDist = damp(this.cDist, this.cDistG, 8, dt);

    const up = this.swimming ? 0.7 : focusUp;
    const ty = p.y + up;
    this.look.x = damp(this.look.x, p.x, 16, dt); this.look.y = damp(this.look.y, ty, 10, dt); this.look.z = damp(this.look.z, p.z, 16, dt);
    const L = this.look;
    const cp = Math.cos(this.cPitch), sp = Math.sin(this.cPitch);
    const dx = Math.sin(this.cYaw) * cp, dy = sp, dz = Math.cos(this.cYaw) * cp;
    // pull the camera in if terrain is between it and the player
    let d = this.cDist;
    const inCave = caveFloorAt(L.x, L.z) != null;        // under the cliff the heightfield is solid rock above him: no terrain pull-in
    for (let i = 1; i <= 14 && !inCave; i++) {
      const t = (i / 14) * d, x = L.x + dx * t, z = L.z + dz * t, y = L.y + dy * t;
      if (getHeight(x, z) + 0.5 > y && i > 1) { d = Math.max(1.4, t * 0.88); break; }
    }
    camera.position.set(L.x + dx * d, L.y + dy * d, L.z + dz * d);
    const gh = getHeight(camera.position.x, camera.position.z);
    if (!inCave && camera.position.y < gh + 0.6 && gh > -0.5) camera.position.y = gh + 0.6;
    camera.lookAt(L.x, L.y + 0.05, L.z);
    cam.target.set(p.x, p.y + 1, p.z);
    if (cam.shake > 0.001) { camera.rotation.x += (Math.random() - 0.5) * cam.shake * 0.01; camera.rotation.y += (Math.random() - 0.5) * cam.shake * 0.01; }
    U.under.value += ((camera.position.y < 0.1 ? 1 : 0) - U.under.value) * Math.min(1, dt * 10);
  }
}
