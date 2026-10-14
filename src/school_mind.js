// Shared school intelligence. A school is one persistent entity (its centre, destination, movement state, formation and
// environmental awareness) that its fish follow. The fish keep their own movement: each has a slot in the school that drifts
// over time, its own reaction delay and speed, and it steers by its neighbours (alignment, separation, cohesion), by the reef
// (coral heads), and by the seabed and surface. Turns therefore travel through the school as a wave instead of snapping.
// Every species uses this one system; the differences are its profile below (speeds, spread, shape, habits).
import * as THREE from 'three';
import { getHeight } from './world.js';
import { coralSpots } from './flora.js';
import { rnd, rr, clamp, lerp, TAU } from './util.js';

// per species (keyed by the school's name): len = body length used for spacing (m); cruise and burst in m/s (cruise is about
// 1-3 body lengths per second, bursts about 4-7); spread = the school's radius (m) when relaxed; shape: 'ribbon' | 'cloud' | 'loose';
// feeds: 'coral' = the school hovers and feeds above coral heads; hover = share of destinations that are hover spots;
// gap = the fish's spacing in body lengths (default 2.2): a smaller gap packs the school tighter.
export const SCHOOL_PROFILE = {
  'Blue chromis school': { len: 0.15, cruise: 0.45, burst: 1.1, spread: 2.2, shape: 'cloud', feeds: 'coral', hover: 0.6 },
  'Silver mullet school': { len: 0.75, cruise: 1.0, burst: 2.6, spread: 4.5, shape: 'ribbon', feeds: null, hover: 0 },
  'Pink fusilier school': { len: 0.225, cruise: 0.7, burst: 1.8, spread: 3.5, shape: 'ribbon', feeds: 'coral', hover: 0.25 },
  'Parrotfish school': { len: 0.45, cruise: 0.55, burst: 1.6, spread: 4.5, shape: 'loose', feeds: 'coral', hover: 0.5 },
  'Yellowfin tuna school': { len: 2.25, cruise: 2.0, burst: 5.0, spread: 7.0, shape: 'loose', feeds: null, hover: 0 },
  'Reef fish school': { len: 0.15, cruise: 0.5, burst: 1.3, spread: 3.0, shape: 'cloud', feeds: 'coral', hover: 0.5 },
  'Yellow tang school': { len: 0.30, cruise: 0.30, burst: 0.8, spread: 1.0, gap: 1.0, shape: 'cloud', feeds: 'coral', hover: 0.5 },
};

// ---- coral avoidance: a grid of the coral heads, so a fish checks a few cells, not every head
const CELL = 3;
let grid = null, gridCount = -1;
function coralGrid() {
  if (grid && gridCount === coralSpots.length) return grid;
  grid = new Map();
  for (const c of coralSpots) {
    const key = Math.floor(c.x / CELL) + ',' + Math.floor(c.z / CELL);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(c);
  }
  gridCount = coralSpots.length;
  return grid;
}
/** the nearest coral head within r of (x, z): {dx, dz, d} from the point to the coral, or null */
function nearestCoral(x, z, r) {
  const g = coralGrid();
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  let best = null, bd = r;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const list = g.get((cx + i) + ',' + (cz + j));
    if (!list) continue;
    for (const c of list) {
      const dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz);
      if (d < bd) { bd = d; best = { dx, dz, d }; }
    }
  }
  return best;
}

const smooth = (u) => { const k = clamp(u, 0, 1); return k * k * (3 - 2 * k); };
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();

/** a school: fish is the school's list of {i, sc, x, y, z, vx, vy, vz}; roam is {cx, cz, rx, rz, depth} from the builder */
export function createSchool(name, fish, roam) {
  const spec = SCHOOL_PROFILE[name] || SCHOOL_PROFILE['Reef fish school'];
  const mind = {
    name, spec, fish, cx: roam.cx, cy: roam.depth, cz: roam.cz, rx: roam.rx, rz: roam.rz, depth: roam.depth,
    dest: { x: roam.cx, y: roam.depth, z: roam.cz }, state: 'cruise', stateT: rr(4, 10), hoverSpot: null,
    vx: 0, vz: 0, spread: spec.spread, alarm: 0, heading: rnd() * TAU, breath: rnd() * TAU,
  };
  for (const f of fish) {
    f.slot = { x: 0, y: 0, z: 0 }; f.slotT = rr(4, 12); f.react = rr(1.6, 3.8); f.speedK = rr(0.9, 1.1);
    f.tx = 0; f.ty = 0; f.tz = 0; f.wob = rnd() * TAU;
    const a = rnd() * TAU, r = Math.sqrt(rnd());
    f.slot.x = Math.cos(a) * r; f.slot.y = (rnd() - 0.5) * 0.7; f.slot.z = Math.sin(a) * r;
  }
  return mind;
}

/** choose the next destination: a hover spot over the coral near the school's home, or a point across the roam area */
function chooseDestination(m, t) {
  const s = m.spec;
  if (s.feeds === 'coral' && rnd() < s.hover) {
    // a coral head within the roam area (the school hovers above it, feeding)
    for (let k = 0; k < 14; k++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd());
      const x = m.cx + Math.cos(a) * r * m.rx, z = m.cz + Math.sin(a) * r * m.rz;
      const c = nearestCoral(x, z, 1.2);
      if (c) {
        m.dest = { x: x + c.dx * 0.5, y: m.depth + 0.8, z: z + c.dz * 0.5 };
        m.state = 'hover'; m.stateT = rr(14, 30);
        return;
      }
    }
  }
  for (let k = 0; k < 14; k++) {
    const a = rnd() * TAU, r = Math.sqrt(rnd());
    const x = m.cx + Math.cos(a) * r * m.rx, z = m.cz + Math.sin(a) * r * m.rz;
    if (getHeight(x, z) < -1.2) { m.dest = { x, y: m.depth + (rnd() - 0.5) * 1.5, z }; break; }
  }
  m.state = 'cruise'; m.stateT = rr(12, 26);
}

/**
 * one step for one school. ctx: { dt, t, disturbers: [{x, y, z, r}] (the castaway, the camera) }
 * writes each fish's matrix into im (the shared InstancedMesh) at its instance index i
 */
export function updateSchool(m, ctx, im) {
  // im is an InstancedMesh (its matrix is written per fish) or a function write(f, position, quaternion) for other kinds of fish
  const write = typeof im === 'function' ? im : null;
  const { dt, t, disturbers } = ctx;
  const s = m.spec;
  m.breath += dt * 0.35;
  // 1. disturbance: a person or the castaway close by makes the school tighten and burst away
  let alarmNow = false;
  for (const d of disturbers) {
    if (Math.hypot(d.x - m.cx, d.z - m.cz) < 6 + m.spread && Math.abs(d.y - m.cy) < 5) { alarmNow = true; break; }
  }
  if (alarmNow && m.alarm <= 0) m.alarm = 0;
  if (alarmNow) m.alarm = 3.5;
  m.alarm = Math.max(0, m.alarm - dt);
  // 2. decide: the next destination when the current one is reached or its time is up
  m.stateT -= dt;
  const reached = Math.hypot(m.dest.x - m.cx, m.dest.z - m.cz) < 1.5;
  if (m.alarm <= 0 && (m.stateT <= 0 || reached)) chooseDestination(m, t);
  const state = m.alarm > 0 ? 'flee' : m.state;
  // 3. the school's centre: moves toward its destination at the state's speed, slowing on arrival, and keeps off the reef
  const dx = m.dest.x - m.cx, dz = m.dest.z - m.cz, dist = Math.hypot(dx, dz) + 1e-3;
  const speed = state === 'flee' ? s.burst : state === 'hover' ? s.cruise * 0.25 : s.cruise;
  const arrive = clamp(dist / 4, 0.25, 1);
  const wantVx = dx / dist * speed * arrive, wantVz = dz / dist * speed * arrive;
  m.vx += (wantVx - m.vx) * Math.min(1, dt * 0.8);
  m.vz += (wantVz - m.vz) * Math.min(1, dt * 0.8);
  // the reef pushes the centre off a coral head in its path
  const cc = nearestCoral(m.cx, m.cz, 3);
  if (cc) { m.vx -= cc.dx / (cc.d + 0.1) * 0.8 * dt; m.vz -= cc.dz / (cc.d + 0.1) * 0.8 * dt; }
  m.cx += m.vx * dt; m.cz += m.vz * dt;
  m.heading = Math.atan2(m.vx, m.vz);
  const floor = getHeight(m.cx, m.cz);
  m.cy = lerp(m.cy, clamp(m.depth + Math.sin(t * 0.21 + m.breath) * 0.4, floor + 1.2, -0.9), Math.min(1, dt * 0.6));
  // 4. the formation: relaxed spread breathes; it tightens when alarmed and opens when feeding
  const k = state === 'flee' ? 0.62 : state === 'hover' ? 0.8 : 1;
  const breath = 1 + 0.12 * Math.sin(m.breath * 2.1);
  m.spread = lerp(m.spread, s.spread * k * breath, Math.min(1, dt * 0.9));
  const stretch = s.shape === 'ribbon' ? 2.2 : s.shape === 'loose' ? 1.4 : 1.0;   // a ribbon lies along the school's heading
  const ch = Math.cos(m.heading), sh = Math.sin(m.heading);
  // 5. each fish: a slot in the school that drifts, plus its own reaction delay and speed
  const len = s.len;
  const sepR = (s.gap ?? 2.2) * len + 0.25, alignR = Math.max(2.5 * len, 1.8);
  for (const f of m.fish) {
    f.slotT -= dt;
    if (f.slotT <= 0) {                                   // every 4-12 s a fish takes a new place in the school
      f.slotT = rr(4, 12);
      const a = rnd() * TAU, r = Math.sqrt(rnd());
      f.tx = Math.cos(a) * r; f.ty = (rnd() - 0.5) * 0.7; f.tz = Math.sin(a) * r;
    }
    f.slot.x += (f.tx - f.slot.x) * Math.min(1, dt * 0.25);
    f.slot.y += (f.ty - f.slot.y) * Math.min(1, dt * 0.25);
    f.slot.z += (f.tz - f.slot.z) * Math.min(1, dt * 0.25);
    // the slot in world space: stretched along the heading for a ribbon, then scaled by the formation's spread
    // the slot in the school's frame: side (x), along the heading (z, stretched for a ribbon) and up (y); then rotated to the world
    const side = f.slot.x * m.spread, fwd = f.slot.z * m.spread * stretch;
    const wx = m.cx + side * ch + fwd * sh, wz = m.cz - side * sh + fwd * ch;
    const wy = m.cy + f.slot.y * m.spread * 0.5;
    let ax = 0, ay = 0, az = 0, n = 0, avx = 0, avy = 0, avz = 0, sx = 0, sy = 0, sz = 0;
    for (const o of m.fish) {
      if (o === f) continue;
      const ox = o.x - f.x, oy = o.y - f.y, oz = o.z - f.z, d2 = ox * ox + oy * oy + oz * oz;
      if (d2 < alignR * alignR) { avx += o.vx; avy += o.vy; avz += o.vz; n++; }
      if (d2 < sepR * sepR && d2 > 1e-6) { const d = Math.sqrt(d2); sx -= ox / d * (sepR - d); sy -= oy / d * (sepR - d); sz -= oz / d * (sepR - d); }
    }
    if (n) { ax += (avx / n - f.vx) * 1.2; ay += (avy / n - f.vy) * 1.2; az += (avz / n - f.vz) * 1.2; }
    ax += sx * 3.0; ay += sy * 3.0; az += sz * 3.0;
    // the slot pulls the fish into place (the formation holds without rigid rows)
    ax += (wx - f.x) * 0.7; ay += (wy - f.y) * 0.7; az += (wz - f.z) * 0.7;
    // reef and seabed: steer around coral heads, keep clear of the floor and the surface
    const cr = nearestCoral(f.x, f.z, len * 2.2 + 0.5);
    if (cr) { const push = (len * 2.2 + 0.5 - cr.d) * 4; ax -= cr.dx / (cr.d + 1e-3) * push; az -= cr.dz / (cr.d + 1e-3) * push; }
    const g = getHeight(f.x, f.z), floorY = g + 0.5 + len * 1.5, topY = -0.6 - len;
    if (f.y < floorY) ay += (floorY - f.y) * 6;
    if (f.y > topY) ay -= (f.y - topY) * 6;
    // a small wobble, so no two fish trace the same line
    f.wob += dt * (1.2 + f.speedK * 0.7);
    ax += Math.sin(f.wob) * 0.12 * (1 + m.spread * 0.05); az += Math.cos(f.wob * 0.8 + f.react) * 0.12 * (1 + m.spread * 0.05);
    // reaction delay: a fish follows its target velocity with its own response time, so turns move down the school
    const target = state === 'flee' ? s.burst : state === 'hover' ? s.cruise * 0.3 : s.cruise;
    const resp = 2 / f.react;                              // a slower reactor turns later than a quick one: the wave travels
    f.vx += (ax + (m.vx - f.vx) * 0.6) * dt * resp;
    f.vy += (ay - f.vy * 0.6) * dt * resp;
    f.vz += (az + (m.vz - f.vz) * 0.6) * dt * resp;
    // speed limits from the state: cruise is steady, a burst is brief and brings the whole school forward
    const sp = Math.hypot(f.vx, f.vy, f.vz) + 1e-6;
    const maxSp = (target * f.speedK * (state === 'flee' ? 1.1 : 1.15));
    const minSp = target * 0.5 * f.speedK;
    if (sp > maxSp) { const u = maxSp / sp; f.vx *= u; f.vy *= u; f.vz *= u; }
    else if (sp < minSp) { const u = minSp / sp; f.vx *= u; f.vy *= u; f.vz *= u; }
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    // 6. the matrix: the fish faces its velocity, pitched a little with its climb
    const yaw = Math.atan2(f.vx, f.vz), pit = -Math.asin(clamp(f.vy / (Math.hypot(f.vx, f.vy, f.vz) + 1e-6), -1, 1)) * 0.8;
    _e.set(pit, yaw, 0, 'YXZ'); _q.setFromEuler(_e);
    const visible = f.y < topY + 0.6 && f.y > floorY - 0.6 ? f.sc : 0.0001;
    _p.set(f.x, f.y, f.z);
    if (write) write(f, _p, _q);
    else { _s.setScalar(visible); _m.compose(_p, _q, _s); im.setMatrixAt(f.i, _m); }
  }
}
