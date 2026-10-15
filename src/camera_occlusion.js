// Camera occlusion for the follow camera: scenery that stands between the camera and the followed animal fades so the animal stays readable.
//
// The scenery here is instanced (a palm is one instance of a few hundred), so one instance is faded without touching the others: it is taken out of its
// InstancedMesh (its matrix zeroed, or hidden in its vegetation-LOD family) and drawn by a pooled "ghost" mesh with a clone of the material (cloned once
// per ghost slot and material, never shared, so the other palms are untouched). The ghost's opacity eases down while the instance blocks the view, and back up
// when it does not; when it is whole again the instance goes back into its mesh and the ghost is released.
//
// Detection is cheap and does not run every frame: a registry of the fadeable instances (palms, trees, bushes, boulders...) is built once, with a grid of
// 16 m cells and, per geometry, a few dozen cluster spheres standing for its trunk and crown (so a thin branch does not count). Every ~0.12 s five rays go
// from the camera to the animal (centre, above, below, left, right); the grid cells along them give a handful of candidate instances, whose cluster spheres
// are tested in the instance's own space. An instance fades only when it blocks the centre ray and at least one more, and a ghost stays faded for half a
// second after the last time it blocked (no flicker). Reused vectors, matrices and arrays throughout: nothing is allocated per frame.
import * as THREE from 'three';
import { scene, camera } from './core.js';
import { inspectTargets } from './inspect.js';
import { setInstanceHidden, lodFamilyOf } from './vegetation_lod.js';

const KEYS = new Set(['palm', 'banyan', 'breadfruit', 'pandanus', 'bamboo', 'banana', 'fern', 'bush', 'naupaka', 'hibiscus', 'plumeria', 'bougainvillea', 'taro', 'ti', 'glory', 'clump', 'blossom', 'treeA', 'treeB', 'rock']);
const CELL = 16, OFFSET = 64;
const FADE_TO = 0.24;          // the opacity of a blocking plant
const FADE_INSIDE = 0.09;      // and of one the camera is inside: its leaves pile up, so it goes fainter
const RATE_OUT = 9, RATE_IN = 4.5;
const CHECK = 0.12, KEEP = 0.5, MAX_GHOSTS = 8, MIN_R = 0.18;

const _S = new Float64Array(15);
const _inv = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Color(), _right = new THREE.Vector3(), _fwd = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const cellKey = (ix, iz) => (ix + OFFSET) * 256 + (iz + OFFSET);

/** a few dozen spheres standing for a geometry's solid parts: vertices bucketed in a grid, one sphere per busy bucket */
function* proxySpheres(geo) {
  geo.computeBoundingSphere();
  const pos = geo.attributes.position, n = pos.count, R = geo.boundingSphere.radius, vox = Math.max(R / 3.2, 0.12), step = Math.max(1, Math.floor(n / 24000));
  const cells = new Map();
  for (let i = 0; i < n; i += step) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = Math.floor(x / vox) * 73856093 ^ Math.floor(y / vox) * 19349663 ^ Math.floor(z / vox) * 83492791;
    let c = cells.get(k);
    if (!c) { c = { x: 0, y: 0, z: 0, n: 0, x0: x, y0: y, z0: z, r: 0 }; cells.set(k, c); }
    c.x += x; c.y += y; c.z += z; c.n++;
    if ((i & 2047) === 0) yield;
  }
  const list = [];
  for (const c of cells.values()) {
    if (c.n < 3) continue;
    const cx = c.x / c.n, cy = c.y / c.n, cz = c.z / c.n;
    list.push({ cx, cy, cz, r: Math.max(vox * 0.5, Math.hypot(c.x0 - cx, c.y0 - cy, c.z0 - cz)) * 0.8, n: c.n });
  }
  list.sort((p, q) => q.n - p.n);
  const out = new Float32Array(Math.min(list.length, 48) * 4);
  for (let i = 0; i < out.length / 4; i++) { out[i * 4] = list[i].cx; out[i * 4 + 1] = list[i].cy; out[i * 4 + 2] = list[i].cz; out[i * 4 + 3] = list[i].r; }
  return out;
}

export function createCameraOcclusion() {
  const stats = { debugOn: false, last: [], built: false, instances: 0, checks: 0, msPerCheck: 0, candidates: 0, active: 0, buildMs: 0 };
  const recs = [];                         // one per fadeable InstancedMesh: { im, fam, spheres }
  let meshOf, instOf, cx, cy, cz, cr, scl, mats;       // per instance, flat
  const grid = new Map();
  const act = new Map();                   // instance id -> { id, slot, op, target, miss }
  const slots = [];
  const ghostMats = new Map();             // source material -> one clone per slot
  const stamp = { arr: null, n: 0 };
  const cand = [], hits = [];
  let built = false, checkT = 0, lastTarget = null, releasing = false, enabled = true;

  // built in slices of ~1.5 ms a frame (buildStep), so there is no hitch; build() does it all at once
  function* buildGen() {
    const list = inspectTargets().filter((o) => o.isInstancedMesh && o.userData.inspect && KEYS.has(o.userData.inspect.key));
    let total = 0;
    for (const im of list) total += im.count;
    meshOf = new Int16Array(total); instOf = new Int32Array(total); cx = new Float32Array(total); cy = new Float32Array(total); cz = new Float32Array(total); cr = new Float32Array(total);
    scl = new Float32Array(total); mats = new Float32Array(total * 16);
    const spheresOf = new Map();
    let id = 0;
    for (const im of list) {
      if (!spheresOf.has(im.geometry)) spheresOf.set(im.geometry, yield* proxySpheres(im.geometry));
      const mi = recs.length, bs = im.geometry.boundingSphere, arr = im.instanceMatrix.array;
      recs.push({ im, fam: lodFamilyOf(im), spheres: spheresOf.get(im.geometry) });
      for (let i = 0; i < im.count; i++, id++) {
        const o = i * 16;
        if ((i & 255) === 255) yield;
        for (let k = 0; k < 16; k++) mats[id * 16 + k] = arr[o + k];
        const e = arr, sx = Math.hypot(e[o], e[o + 1], e[o + 2]), sy = Math.hypot(e[o + 4], e[o + 5], e[o + 6]), sz = Math.hypot(e[o + 8], e[o + 9], e[o + 10]), s = Math.max(sx, sy, sz);
        const px = bs.center.x, py = bs.center.y, pz = bs.center.z;
        meshOf[id] = mi; instOf[id] = i; scl[id] = s; cr[id] = bs.radius * s;
        cx[id] = e[o] * px + e[o + 4] * py + e[o + 8] * pz + e[o + 12];
        cy[id] = e[o + 1] * px + e[o + 5] * py + e[o + 9] * pz + e[o + 13];
        cz[id] = e[o + 2] * px + e[o + 6] * py + e[o + 10] * pz + e[o + 14];
        const x0 = Math.floor((cx[id] - cr[id]) / CELL), x1 = Math.floor((cx[id] + cr[id]) / CELL), z0 = Math.floor((cz[id] - cr[id]) / CELL), z1 = Math.floor((cz[id] + cr[id]) / CELL);
        for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) { const k = cellKey(a, b); let l = grid.get(k); if (!l) { l = []; grid.set(k, l); } l.push(id); }
      }
    }
    stamp.arr = new Uint32Array(total);
    for (let s = 0; s < MAX_GHOSTS; s++) {
      const g = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 1);
      g.name = 'occluder ghost'; g.frustumCulled = false; g.visible = false; g.matrixAutoUpdate = false; g.userData.noPick = true; g.renderOrder = 2;
      scene.add(g); slots.push({ mesh: g, used: false });
    }
    built = true; stats.built = true; stats.instances = total;
  }
  let gen = null;
  function buildStep(ms = 1.5) {
    if (built) return;
    if (!gen) gen = buildGen();
    const t0 = performance.now();
    while (!built && performance.now() - t0 < ms) if (gen.next().done) break;
    const d = performance.now() - t0; stats.buildMs = +(stats.buildMs + d).toFixed(1); stats.buildMaxStepMs = Math.max(stats.buildMaxStepMs || 0, +d.toFixed(2));
  }
  const build = () => { while (!built) buildStep(1e9); };

  const ghostMaterial = (src, slot) => {
    let l = ghostMats.get(src);
    if (!l) { l = []; ghostMats.set(src, l); }
    if (!l[slot]) {
      const m = src.clone();
      m.onBeforeCompile = src.onBeforeCompile; m.customProgramCacheKey = src.customProgramCacheKey;
      m.transparent = true; m.depthWrite = false; m.opacity = 1;
      l[slot] = m;
    }
    return l[slot];
  };

  function setMatrix(rec, i, fromBaked, id) {
    const im = rec.im;
    if (rec.fam) { setInstanceHidden(im, i, !fromBaked); return; }
    const a = im.instanceMatrix;
    if (fromBaked) a.array.set(mats.subarray(id * 16, id * 16 + 16), i * 16); else ZERO.toArray(a.array, i * 16);
    a.clearUpdateRanges(); a.addUpdateRange(i * 16, 16); a.needsUpdate = true;
  }

  function activate(id, fade) {
    let s = -1;
    for (let k = 0; k < slots.length; k++) if (!slots[k].used) { s = k; break; }
    if (s < 0) return;
    const rec = recs[meshOf[id]], im = rec.im, i = instOf[id], sl = slots[s], g = sl.mesh;
    g.geometry = im.geometry; g.material = ghostMaterial(im.material, s);
    g.material.opacity = 1; g.material.depthWrite = true;
    _inv.fromArray(mats, id * 16); g.setMatrixAt(0, _inv); g.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) { im.getColorAt(i, _c); g.setColorAt(0, _c); g.instanceColor.needsUpdate = true; } else g.instanceColor = null;
    g.castShadow = im.castShadow; g.receiveShadow = im.receiveShadow; g.visible = true;
    sl.used = true;
    setMatrix(rec, i, false, id);
    act.set(id, { id, slot: s, op: 1, target: fade, miss: 0 });
  }
  function deactivate(a) {
    const rec = recs[meshOf[a.id]];
    setMatrix(rec, instOf[a.id], true, a.id);
    const sl = slots[a.slot]; sl.mesh.visible = false; sl.used = false;
    act.delete(a.id);
  }

  /** the instances that block the animal now: those whose cluster spheres cut the centre ray and at least one more */
  function detect(target, focus) {
    const t0 = performance.now();
    const A = camera.position;
    const pr = target.pickR || 0.8, w = clamp(pr * 0.45, 0.15, 2.2), hv = clamp(pr * 0.4, 0.15, 1.2);
    camera.getWorldDirection(_fwd); _right.crossVectors(_fwd, camera.up).normalize();
    // five sample points on the animal
    const S = _S;
    S[0] = focus.x; S[1] = focus.y; S[2] = focus.z;
    S[3] = focus.x; S[4] = focus.y + hv; S[5] = focus.z;
    S[6] = focus.x; S[7] = focus.y - hv * 0.7; S[8] = focus.z;
    S[9] = focus.x + _right.x * w; S[10] = focus.y; S[11] = focus.z + _right.z * w;
    S[12] = focus.x - _right.x * w; S[13] = focus.y; S[14] = focus.z - _right.z * w;
    // candidates: the cells along each ray
    cand.length = 0; stamp.n++;
    for (let r = 0; r < 5; r++) {
      const dx = S[r * 3] - A.x, dy = S[r * 3 + 1] - A.y, dz = S[r * 3 + 2] - A.z, len = Math.hypot(dx, dy, dz), steps = Math.max(1, Math.ceil(len / (CELL * 0.5)));
      for (let k = 0; k <= steps; k++) {
        const f = k / steps, l = grid.get(cellKey(Math.floor((A.x + dx * f) / CELL), Math.floor((A.z + dz * f) / CELL)));
        if (!l) continue;
        for (let j = 0; j < l.length; j++) { const id = l[j]; if (stamp.arr[id] !== stamp.n) { stamp.arr[id] = stamp.n; cand.push(id); } }
      }
    }
    hits.length = 0; if (stats.debugOn) stats.last = [];
    for (let q = 0; q < cand.length; q++) {
      const id = cand[q], rec = recs[meshOf[id]];
      if (!rec.fam && !rec.im.visible) continue;
      // broad test against the instance's own sphere on the centre ray
      const ccx = cx[id], ccy = cy[id], ccz = cz[id], rr = cr[id];
      _inv.fromArray(mats, id * 16).invert();
      const sp = rec.spheres, sc = scl[id];
      _a.copy(A).applyMatrix4(_inv);
      let mask = 0;
      for (let r = 0; r < 5; r++) {
        _b.set(S[r * 3], S[r * 3 + 1], S[r * 3 + 2]);
        // cheap world-space reject: the ray's closest approach to the whole-instance sphere
        if (!segHitsSphere(A.x, A.y, A.z, S[r * 3], S[r * 3 + 1], S[r * 3 + 2], ccx, ccy, ccz, rr)) continue;
        _b.applyMatrix4(_inv);
        const dx = _b.x - _a.x, dy = _b.y - _a.y, dz = _b.z - _a.z, l2 = dx * dx + dy * dy + dz * dz;
        if (l2 < 1e-9) continue;
        for (let s = 0; s < sp.length; s += 4) {
          const r0 = sp[s + 3];
          if (r0 * sc < MIN_R) continue;
          const ex = sp[s] - _a.x, ey = sp[s + 1] - _a.y, ez = sp[s + 2] - _a.z;
          let u = (ex * dx + ey * dy + ez * dz) / l2;
          if (u <= 0) continue;
          if (u > 1) u = 1;
          const qx = _a.x + dx * u - sp[s], qy = _a.y + dy * u - sp[s + 1], qz = _a.z + dz * u - sp[s + 2];
          if (qx * qx + qy * qy + qz * qz < r0 * r0 && u < 1 - (r0 * 0.3) / Math.sqrt(l2)) { mask |= 1 << r; break; }
        }
      }
      if (stats.debugOn) stats.last.push({ key: rec.im.userData.inspect.key, id, mask, d: +Math.sqrt(d2(id)).toFixed(1), r: +rr.toFixed(1), sp: sp.length / 4 });
      if ((mask & 1) && (mask & ~1)) hits.push(id);
    }
    // the nearest few; the rest stay as they are
    if (hits.length > MAX_GHOSTS) hits.sort((p, q) => d2(p) - d2(q));
    for (let i = 0; i < hits.length && i < MAX_GHOSTS; i++) {
      const id = hits[i], fade = d2(id) < (cr[id] * 0.7) * (cr[id] * 0.7) ? FADE_INSIDE : FADE_TO, a = act.get(id);
      if (a) { a.miss = 0; a.target = fade; } else activate(id, fade);
    }
    for (const a of act.values()) if (!hits.includes(a.id) || hits.indexOf(a.id) >= MAX_GHOSTS) { a.miss += CHECK; if (a.miss > KEEP) a.target = 1; }
    stats.checks++; stats.candidates = cand.length;
    stats.msPerCheck += ((performance.now() - t0) - stats.msPerCheck) * 0.1;
  }
  const d2 = (id) => { const A = camera.position; return (cx[id] - A.x) ** 2 + (cy[id] - A.y) ** 2 + (cz[id] - A.z) ** 2; };

  /** every frame: ease the ghosts; every ~0.12 s while following: decide who blocks. target is the followed creature, or null to let everything come back. */
  function update(dt, target, focus) {
    if (!built) return;
    if (!enabled) target = null;
    if (target) {
      if (target !== lastTarget) { lastTarget = target; checkT = 0; }
      checkT -= dt;
      if (checkT <= 0) { checkT = CHECK; detect(target, focus); }
      releasing = false;
    } else if (act.size && !releasing) {
      lastTarget = null; releasing = true;
      for (const a of act.values()) a.target = 1;
    } else lastTarget = null;
    if (!act.size) { stats.active = 0; return; }
    for (const a of act.values()) {
      const k = 1 - Math.exp(-(a.target < a.op ? RATE_OUT : RATE_IN) * dt);
      a.op += (a.target - a.op) * k;
      const m = slots[a.slot].mesh.material;
      m.opacity = a.op; m.depthWrite = a.op > 0.9;
      if (a.target === 1 && a.op > 0.985) deactivate(a);
    }
    stats.active = act.size;
  }
  /** at once: everything whole again (a mode change, a reload) */
  function clear() {
    for (const a of [...act.values()]) deactivate(a);
    lastTarget = null; releasing = false;
  }
  function dispose() {
    clear();
    for (const s of slots) { scene.remove(s.mesh); s.mesh.dispose(); }
    slots.length = 0;
    for (const l of ghostMats.values()) for (const m of l) if (m) m.dispose();
    ghostMats.clear();
  }
  const debug = () => [...act.values()].map((a) => ({ key: recs[meshOf[a.id]].im.userData.inspect.key, id: a.id, x: +cx[a.id].toFixed(1), y: +cy[a.id].toFixed(1), z: +cz[a.id].toFixed(1), r: +cr[a.id].toFixed(1), op: +a.op.toFixed(2), slot: a.slot, gv: slots[a.slot].mesh.visible, gpos: slots[a.slot].mesh.geometry.attributes.position && slots[a.slot].mesh.geometry.attributes.position.count }));
  return { update, clear, dispose, build, buildStep, stats, debug, get ready() { return built; }, get active() { return act.size; }, get enabled() { return enabled; }, set enabled(v) { enabled = !!v; } };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** does the segment (ax, ay, az) to (bx, by, bz) pass within r of the point c? */
function segHitsSphere(ax, ay, az, bx, by, bz, px, py, pz, r) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz;
  let u = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const qx = ax + dx * u - px, qy = ay + dy * u - py, qz = az + dz * u - pz;
  return qx * qx + qy * qy + qz * qz < r * r;
}
