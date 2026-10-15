// The rock climb up Mount Ignis. A switchback trail (cut into the cone, see world.js) leads to a basecamp ledge; from there a natural
// rock climb (no ropes or fixed gear) goes up the south buttress through two rest ledges to the crest of the crater rim. While climbing, the climber rides a rail along
// that line: W/S up and down, A/D shuffle sideways, Shift hurries. It is the rock-climbing code the volcano ascent uses.
import * as THREE from 'three';
import { ASCENT, VOL, getHeight } from './world.js';
import { clamp } from './util.js';

const R = {
  ready: false, L: 0, dx: 0, dz: 0, px: 0, pz: 0, heading: 0, bc: null, top: null, stations: [],
};
export const climbRoute = R;

/** build the rail from the finished terrain (call after buildWorld) */
export function initClimbRoute() {
  const A = ASCENT; if (!A.bc || !A.top) return;
  R.bc = A.bc; R.top = A.top;
  const dx = A.top.x - A.bc.x, dz = A.top.z - A.bc.z, L = Math.hypot(dx, dz);
  R.L = L; R.dx = dx / L; R.dz = dz / L; R.px = -R.dz; R.pz = R.dx;
  R.heading = Math.atan2(R.dx, R.dz);                        // facing the wall (toward the crater)
  R.stations = A.stations.map((s) => ({ id: s.id, u: clamp((A.rBase - s.r) / (A.rBase - A.rTop), 0, 1), x: s.x, z: s.z }));
  R.ready = true;
}

/** point on the rail: u 0 (basecamp) .. 1 (the crest), lat sideways metres. out gets x,y,z */
export function railAt(u, lat = 0, out = { x: 0, y: 0, z: 0 }) {
  out.x = R.bc.x + R.dx * R.L * u + R.px * lat;
  out.z = R.bc.z + R.dz * R.L * u + R.pz * lat;
  out.y = getHeight(out.x, out.z);
  return out;
}
/** slope of the wall under the rail (dy per metre of plan distance) */
function wallSlope(u) {
  const e = 0.01, a = railAt(Math.max(0, u - e)), b = railAt(Math.min(1, u + e));
  return (b.y - a.y) / (R.L * (Math.min(1, u + e) - Math.max(0, u - e)));
}

/** the climbing station within `range` of (x,z), or null (for the prompt) */
export function nearStation(x, z, range = 3.4) {
  if (!R.ready) return null;
  let best = null, bd = range;
  for (const s of R.stations) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}
/** the station just below u (for falling back to) */
export function stationBelow(u) {
  let b = R.stations[0];
  for (const s of R.stations) if (s.u <= u + 1e-3 && s.u >= b.u) b = s;
  return b;
}

const _p = { x: 0, y: 0, z: 0 };
export class Climber {
  constructor() { this.active = false; this.u = 0; this.lat = 0; this.phase = 0; this.moving = 0; this.vSurf = 0; this.pos = new THREE.Vector3(); this.heading = 0; this.lean = 0.25; this.rest = true; this.dir = 0; }

  start(u = 0, lat = 0) { this.active = true; this.u = u; this.lat = lat; this.moving = 0; this.vSurf = 0; this.sync(); }
  /** put the climber on the wall at (u, lat) */
  sync() {
    railAt(this.u, this.lat, _p);
    const out = 0.32;                                           // hang a little clear of the rock
    this.pos.set(_p.x - R.dx * out, _p.y, _p.z - R.dz * out);
    this.heading = R.heading;
    const s = wallSlope(this.u);
    this.lean = clamp(Math.PI / 2 - Math.atan(Math.max(0.3, s)), 0.05, 0.5);
    this.height = _p.y;
  }
  /** ctl: {up -1..1, side -1..1, fast}. Returns null, or 'top' / 'base' when the climber steps off. */
  update(dt, ctl) {
    const slope = wallSlope(this.u);
    const surf = Math.sqrt(1 + slope * slope);                 // metres of rock per metre of plan
    const speed = (ctl.up > 0 ? 1.05 : 1.35) * (ctl.fast ? 1.5 : 1) * (ctl.tired ? 0.6 : 1);
    this.dir = ctl.up;
    const want = ctl.up * speed;
    this.vSurf += (want - this.vSurf) * Math.min(1, dt * 7);
    this.u += (this.vSurf * dt) / (surf * R.L);
    this.lat = clamp(this.lat + ctl.side * 0.9 * dt, -1.6, 1.6);
    this.moving = Math.min(1, Math.abs(this.vSurf) / 0.8 + Math.abs(ctl.side) * 0.6);
    this.phase += dt * (2.3 + 4 * Math.abs(this.vSurf)) * (this.moving > 0.05 ? 1 : 0);
    let done = null;
    if (this.u >= 1) { this.u = 1; if (ctl.up > 0) done = 'top'; }
    if (this.u <= 0) { this.u = 0; if (ctl.up < 0) done = 'base'; }
    const st = nearStation(this.pos.x + R.dx * 0.32, this.pos.z + R.dz * 0.32, 1.2);
    this.rest = !!st && this.moving < 0.1;
    this.sync();
    return done;
  }
  /** let go: drop to the station below. Returns the vertical metres fallen. */
  fall() {
    const from = this.height, st = stationBelow(this.u - 0.02);
    this.u = st.u; this.lat = 0; this.vSurf = 0; this.sync();
    return Math.max(0, from - this.height);
  }
  stop() { this.active = false; }
}

/** world position to stand at when stepping off at the top / bottom */
export function exitPoint(which, out = { x: 0, y: 0, z: 0 }) {
  if (which === 'top') { out.x = R.top.x; out.z = R.top.z; }
  else { out.x = R.bc.x - R.dx * 0.2; out.z = R.bc.z - R.dz * 0.2; }
  out.y = getHeight(out.x, out.z);
  return out;
}

export { VOL };
