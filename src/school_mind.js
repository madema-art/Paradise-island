// Shared school intelligence. A school is one persistent entity (its home, centre, route, movement state and formation) that its
// fish follow. Each fish keeps its own motion and steers by three things:
//   - the school's velocity, as it was a moment earlier: the fish toward the back of the school see each turn later, so a change of
//     direction runs through the shoal as a wave, front to back, instead of everyone turning at once;
//   - its neighbours: it matches their movement and keeps its spacing;
//   - the school's shape: a soft ellipsoid around the centre (long for a ribbon, round for a cloud). Fish are drawn back inside it
//     gently, so the edge reads as a shape the fish keep, not a cage.
// The reef (coral heads), the seabed and the surface steer every fish, so a school parts around coral and closes again behind it.
// The school travels between coral sites along the reef, returns to familiar ones, and circles a site while it feeds.
// Every species uses this one system; the differences are its profile below.
//
// A fish can leave a school and rejoin it (detachFish / attachFish), for example when it is taken on a line. The rest of the school
// never reads the fish that has left, so nothing else changes. The detached fish belongs to its caller until it is put back.
import * as THREE from 'three';
import { getHeight } from './world.js';
import { coralSpots } from './flora.js';
import { rnd, clamp, lerp, angDiff, TAU } from './util.js';

// per species (keyed by the school's name). len: body length (m), used for spacing. cruise, burst: m/s (cruise about 1.5-3 body lengths a
// second, bursts about 4-7). spread: the lateral radius (m) when relaxed. stretch: how long the school is along its heading (ribbons are
// long). flat: the vertical radius as a share of the lateral one. gap: spacing in body lengths (a smaller gap packs the school tighter).
// wave: how strongly a turn runs through the school (larger = a longer, more visible wave). feeds: 'coral' = the school visits and circles
// coral heads; hover = share of destinations that are coral sites.
export const SCHOOL_PROFILE = {
  'Blue chromis school': { len: 0.15, cruise: 0.35, burst: 1.0, spread: 1.6, stretch: 1.1, flat: 0.6, gap: 1.8, wave: 0.3, feeds: 'coral', hover: 0.35 },
  'Silver mullet school': { len: 0.75, cruise: 1.0, burst: 2.4, spread: 3.0, stretch: 2.4, flat: 0.5, gap: 1.6, wave: 0.3, feeds: null, hover: 0 },
  'Pink fusilier school': { len: 0.225, cruise: 0.5, burst: 1.6, spread: 2.4, stretch: 2.2, flat: 0.5, gap: 1.8, wave: 0.3, feeds: 'coral', hover: 0.2 },
  'Parrotfish school': { len: 0.45, cruise: 0.55, burst: 1.5, spread: 2.6, stretch: 1.4, flat: 0.6, gap: 1.6, wave: 0.3, feeds: 'coral', hover: 0.3 },
  'Yellowfin tuna school': { len: 2.25, cruise: 2.0, burst: 5.0, spread: 5.0, stretch: 1.5, flat: 0.6, gap: 1.5, wave: 0.2, feeds: null, hover: 0 },
  'Reef fish school': { len: 0.15, cruise: 0.3, burst: 1.0, spread: 2.2, stretch: 1.3, flat: 0.6, gap: 1.8, wave: 0.3, feeds: 'coral', hover: 0.3 },
  'Yellow tang school': { len: 0.30, cruise: 0.30, burst: 0.8, spread: 1.0, stretch: 1.2, flat: 0.6, gap: 1.0, wave: 0.3, feeds: 'coral', hover: 0.5 },
  'Orange anthias school': { len: 0.225, cruise: 0.5, burst: 1.5, spread: 1.8, stretch: 1.5, flat: 0.6, gap: 1.6, wave: 0.3, feeds: 'coral', hover: 0.3 },
};

const HIST_DT = 0.1, HIST_N = 64;   // the school's velocity is kept for 6.4 s, sampled every 0.1 s (the turn wave reads back through it)

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

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();

/** a fish takes its place in the school: its own response time and speed, and a starting phase for its wander */
function seatFish(m, f) {
  f.react = f.react ?? m.rr(0.5, 1.2);      // response time (s): a slower fish turns a little later than a quick one
  f.speedK = f.speedK ?? m.rr(0.9, 1.1);
  f.wob = f.wob ?? m.rng() * TAU;
  f.school = m;
}

/**
 * a school: fish is the school's list of {i, sc, x, y, z, vx, vy, vz}; roam is {cx, cz, rx, rz, depth} from the builder.
 * rng (optional) is the school's own generator; the default is the world's shared stream, so existing builders keep their draws.
 */
export function createSchool(name, fish, roam, rng = rnd) {
  const spec = SCHOOL_PROFILE[name] || SCHOOL_PROFILE['Reef fish school'];
  const mind = {
    name, spec, fish, cx: roam.cx, cy: roam.depth, cz: roam.cz, rx: roam.rx, rz: roam.rz, depth: roam.depth,
    home: { x: roam.cx, z: roam.cz },   // destinations are drawn around home, so the roam area does not drift with the school
    rng, rr: (a, b) => a + (b - a) * rng(),
    dest: { x: roam.cx, y: roam.depth, z: roam.cz }, state: 'cruise', stateT: 0, site: null, orbit: 0, orbitR: 1,
    sites: null, lastSite: null,
    vx: 0, vz: 0, spread: spec.spread, alarm: 0, heading: 0, breath: 0,
    hist: new Float32Array(HIST_N * 2), histI: 0, histT: 0,
  };
  mind.stateT = mind.rr(4, 10);
  mind.heading = rng() * TAU; mind.breath = rng() * TAU;
  for (const f of fish) seatFish(mind, f);
  return mind;
}

/**
 * a fish leaves its school (for example it is hooked). The school stops reading it at once; the others are unaffected.
 * Returns the fish, which the caller now owns: it must write the fish's matrix itself until it is put back with attachFish.
 */
export function detachFish(m, f) {
  const k = m.fish.indexOf(f);
  if (k < 0) return null;
  m.fish.splice(k, 1);
  f.school = null;
  return f;
}

/** a fish rejoins a school: it takes its place in the shoal and its velocity is blended toward the shoal's */
export function attachFish(m, f) {
  if (m.fish.includes(f)) return false;
  seatFish(m, f);
  f.vx = (f.vx + m.vx) * 0.5; f.vz = (f.vz + m.vz) * 0.5;
  m.fish.push(f);
  return true;
}

/** the coral heads inside a school's roam area that a school can feed over (in shallow enough water to be on the reef) */
function sitesOf(m) {
  const out = [];
  for (const c of coralSpots) {
    const dx = (c.x - m.home.x) / m.rx, dz = (c.z - m.home.z) / m.rz;
    if (dx * dx + dz * dz <= 1.1 && getHeight(c.x, c.z) < -1.2) out.push({ x: c.x, z: c.z });
  }
  return out;
}

/** the nearest few sites to the school that it has not just left, so it moves along the reef rather than across it */
function nearSite(m) {
  const all = m.sites.filter((p) => p !== m.lastSite).map((p) => ({ p, d: Math.hypot(p.x - m.cx, p.z - m.cz) }));
  // a corridor: a site a few metres off, so the school crosses its habitat instead of circling one head
  const corridor = all.filter((c) => c.d >= 3 && c.d <= 14);
  const cand = (corridor.length ? corridor : all.sort((a, b) => a.d - b.d).slice(0, 6));
  return cand.length ? cand[Math.floor(m.rng() * cand.length)].p : null;
}

/** choose the next destination: a coral site to feed over and circle (the school returns to familiar sites), or a corridor along the reef */
function chooseDestination(m) {
  const s = m.spec, g = m.rng;
  if (!m.sites) m.sites = sitesOf(m);
  const reef = s.feeds === 'coral' && m.sites.length > 0;
  if (reef && g() < s.hover) {
    const site = nearSite(m);
    if (site) {
      m.site = site; m.lastSite = site; m.orbit = Math.atan2(m.cz - site.z, m.cx - site.x); m.orbitR = 1.0 + g() * 0.8;
      m.dest = { x: site.x + Math.cos(m.orbit) * m.orbitR, y: m.depth + 0.8, z: site.z + Math.sin(m.orbit) * m.orbitR };
      m.state = 'hover'; m.stateT = m.rr(8, 16);
      return;
    }
  }
  if (reef && g() < 0.6) {
    const site = nearSite(m);
    if (site) { m.dest = { x: site.x, y: m.depth, z: site.z }; m.lastSite = site; m.site = null; m.state = 'cruise'; m.stateT = m.rr(12, 26); return; }
  }
  // open water across the roam area (a point over water deep enough to swim in)
  for (let k = 0; k < 14; k++) {
    const a = g() * TAU, r = Math.sqrt(g());
    const x = m.home.x + Math.cos(a) * r * m.rx, z = m.home.z + Math.sin(a) * r * m.rz;
    if (getHeight(x, z) < -1.2) { m.dest = { x, y: m.depth + (g() - 0.5) * 1.5, z }; break; }
  }
  m.site = null; m.state = 'cruise'; m.stateT = m.rr(12, 26);
}

/**
 * one step for one school. ctx: { dt, t, disturbers: [{x, y, z, r}] (the castaway, the camera, or what the school flees) }
 * writes each fish's matrix into im (the shared InstancedMesh) at its instance index i, or calls im(f, position, quaternion)
 */
export function updateSchool(m, ctx, im) {
  const write = typeof im === 'function' ? im : null;
  const { dt, t, disturbers } = ctx;
  const s = m.spec;
  const len = s.len;
  m.breath += dt * 0.35;
  // 1. disturbance: a person or the castaway close by makes the school tighten and burst away
  let alarmNow = false;
  for (const d of disturbers) {
    if (Math.hypot(d.x - m.cx, d.z - m.cz) < 6 + m.spread && Math.abs(d.y - m.cy) < 5) { alarmNow = true; break; }
  }
  if (alarmNow) m.alarm = 3.5;
  m.alarm = Math.max(0, m.alarm - dt);
  const fleeing = m.alarm > 0;
  const state = fleeing ? 'flee' : m.state;
  // 2. decide: a new destination when the current one is reached (cruising) or its time is up
  m.stateT -= dt;
  const reached = Math.hypot(m.dest.x - m.cx, m.dest.z - m.cz) < 1.5;
  if (!fleeing && (m.stateT <= 0 || (reached && m.state === 'cruise'))) chooseDestination(m);
  // a feeding school circles its site at a calm pace
  const cruiseNow = state === 'hover' ? s.cruise * 0.35 : s.cruise;
  if (state === 'hover' && m.site) {
    m.orbit += (cruiseNow / m.orbitR) * dt;
    m.dest.x = m.site.x + Math.cos(m.orbit) * m.orbitR; m.dest.z = m.site.z + Math.sin(m.orbit) * m.orbitR;
  }
  // 3. the centre: heads for its destination, eases up to its speed and slows as it arrives
  const dx = m.dest.x - m.cx, dz = m.dest.z - m.cz, dist = Math.hypot(dx, dz) + 1e-3;
  const speed = fleeing ? s.burst : cruiseNow;
  const arrive = state === 'hover' ? 1 : clamp(dist / 2.5, 0.5, 1);
  let wantVx = dx / dist * speed * arrive, wantVz = dz / dist * speed * arrive;
  // a coral head ahead of the centre turns its course aside (it swings past at its own speed; the school is not pushed back and forth)
  const cc = nearestCoral(m.cx, m.cz, 2.5);
  if (cc && (cc.dx * wantVx + cc.dz * wantVz) > 0) {
    const side = (cc.dx * wantVz - cc.dz * wantVx) >= 0 ? -1 : 1;   // the side away from the head
    wantVx += -wantVz * side * 0.9; wantVz += wantVx * 0;           // rotate the desired velocity: this is what turns the school
    const L = Math.hypot(wantVx, wantVz) + 1e-6, k2 = speed * arrive / L;
    wantVx *= k2; wantVz *= k2;
  }
  const rate = fleeing ? 1.6 : 0.7;   // leisurely in cruise, quick to burst
  m.vx += (wantVx - m.vx) * Math.min(1, dt * rate);
  m.vz += (wantVz - m.vz) * Math.min(1, dt * rate);
  m.cx += m.vx * dt; m.cz += m.vz * dt;
  const cSpeed = Math.hypot(m.vx, m.vz);
  if (cSpeed > 0.02) m.heading += angDiff(m.heading, Math.atan2(m.vx, m.vz)) * Math.min(1, dt * 1.2);   // the heading follows the velocity, a little behind it
  // the velocity history the turn wave reads from
  m.histT += dt;
  if (m.histT >= HIST_DT) { m.histT -= HIST_DT; m.histI = (m.histI + 1) % HIST_N; m.hist[2 * m.histI] = m.vx; m.hist[2 * m.histI + 1] = m.vz; }
  const floor = getHeight(m.cx, m.cz);
  m.cy = lerp(m.cy, clamp(m.depth + Math.sin(t * 0.21 + m.breath) * 0.4, floor + 1.2, -0.9), Math.min(1, dt * 0.6));
  // 4. the formation: relaxed, it breathes; it tightens when alarmed and opens a little when feeding
  const k = fleeing ? 0.7 : state === 'hover' ? 0.85 : 1;
  const breath = 1 + 0.08 * Math.sin(m.breath * 2.1);
  m.spread = lerp(m.spread, s.spread * k * breath, Math.min(1, dt * 0.6));
  const ra = m.spread * s.stretch, rb = m.spread, rc = m.spread * s.flat;   // the shape's radii: along the heading, across it, and up and down
  const ch = Math.cos(m.heading), sh = Math.sin(m.heading);
  const sepR = (s.gap ?? 2.2) * len + 0.25, sepR2 = sepR * sepR;
  const alignR = Math.max(3 * len, 0.8), alignR2 = alignR * alignR;
  const target = state === 'flee' ? s.burst : cruiseNow;
  // 5. each fish
  for (const f of m.fish) {
    // where it is against the school's shape: along the heading, across it, and up
    const ox = f.x - m.cx, oy = f.y - m.cy, oz = f.z - m.cz;
    const along = ox * ch + oz * sh;
    // the turn wave: a fish toward the back reads the school's velocity from a little earlier (a fish ahead of the centre, a moment)
    const lagS = clamp(-along / Math.max(0.3, cSpeed) * s.wave, 0, 3);
    const hi = ((m.histI - Math.round(lagS / HIST_DT)) % HIST_N + HIST_N) % HIST_N;
    const dvx = m.hist[2 * hi] * f.speedK, dvz = m.hist[2 * hi + 1] * f.speedK;
    // its neighbours: match their movement, keep the spacing
    let n = 0, avx = 0, avy = 0, avz = 0, sx = 0, sy = 0, sz = 0;
    for (const o of m.fish) {
      if (o === f) continue;
      const ex = o.x - f.x, ey = o.y - f.y, ez = o.z - f.z, d2 = ex * ex + ey * ey + ez * ez;
      if (d2 < alignR2) { avx += o.vx; avy += o.vy; avz += o.vz; n++; }
      if (d2 < sepR2 && d2 > 1e-6) { const d = Math.sqrt(d2), push = (sepR - d) / d; sx -= ex * push; sy -= ey * push; sz -= ez * push; }
    }
    let ax = 0, ay = 0, az = 0;
    if (n) { ax += (avx / n - f.vx) * 0.9; ay += (avy / n - f.vy) * 0.9; az += (avz / n - f.vz) * 0.9; }
    ax += sx * 2.2; ay += sy * 2.2; az += sz * 2.2;
    // the school's movement, read with the fish's own response time (this is what makes a turn run through the shoal)
    ax += (dvx - f.vx) / f.react; az += (dvz - f.vz) / f.react; ay -= f.vy * 1.2;
    // the school's shape: drawn back in, gently, once a fish is past its edge
    const q = Math.sqrt((along / ra) ** 2 + ((-ox * sh + oz * ch) / rb) ** 2 + (oy / rc) ** 2);
    if (q > 0.8) {
      const o = Math.hypot(ox, oy, oz) + 1e-3, pull = (q - 0.8) * 2.0;
      ax -= ox / o * pull; ay -= oy / o * pull; az -= oz / o * pull;
    }
    // the reef and the seabed: steer around coral heads, keep clear of the floor and the surface
    const cr = nearestCoral(f.x, f.z, len * 2.2 + 0.5);
    if (cr) { const push = (len * 2.2 + 0.5 - cr.d) * 2.5; ax -= cr.dx / (cr.d + 1e-3) * push; az -= cr.dz / (cr.d + 1e-3) * push; }
    const gh = getHeight(f.x, f.z), topY = -0.6 - len;
    // the floor clearance never lifts a fish out of the water: in shallows it stops just under the surface
    const floorY = Math.min(gh + 0.5 + len * 1.5, topY - 0.15);
    if (f.y < floorY) ay += (floorY - f.y) * 6;
    if (f.y > topY) ay -= (f.y - topY) * 6;
    // a slow, smooth wander: each fish's path curves gently, with no jitter
    f.wob += dt * (0.9 + f.speedK * 0.4);
    ax += Math.sin(f.wob * 0.7 + f.react) * 0.12; az += Math.cos(f.wob * 0.9) * 0.12; ay += Math.sin(f.wob * 0.5) * 0.04;
    // integrate, then keep the speed in a band around the school's pace
    f.vx += ax * dt; f.vy += ay * dt; f.vz += az * dt;
    const cap = target * f.speedK * 1.35, low = target * 0.35 * f.speedK;
    const sp = Math.hypot(f.vx, f.vy, f.vz) + 1e-6;
    if (sp > cap) { const u = cap / sp; f.vx *= u; f.vy *= u; f.vz *= u; }
    else if (sp < low) { const u = low / sp; f.vx *= u; f.vy *= u; f.vz *= u; }
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    // the matrix: the fish faces its velocity, pitched a little with its climb
    const yaw = Math.atan2(f.vx, f.vz), pit = -Math.asin(clamp(f.vy / (Math.hypot(f.vx, f.vy, f.vz) + 1e-6), -1, 1)) * 0.8;
    _e.set(pit, yaw, 0, 'YXZ'); _q.setFromEuler(_e);
    _p.set(f.x, f.y, f.z);
    if (write) write(f, _p, _q);
    else {
      // a fish is drawn while it is under the surface and above the sand; the steering keeps it there, this only hides a fish that has got out
      const shown = f.y < -0.15 && f.y > gh - 0.2 ? f.sc : 0.0001;
      _s.setScalar(shown); _m.compose(_p, _q, _s); im.setMatrixAt(f.i, _m);
    }
  }
}
