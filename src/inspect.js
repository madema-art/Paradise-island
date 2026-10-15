// Inspection: identifies what was clicked in the world. Objects are tagged where they are built (tagInstanced / tagObject)
// with a catalogue key; each gets a stable id from its place in the world. The world is generated from a seeded random
// sequence, so the same object has the same id after every reload.
import * as THREE from 'three';
import { env } from './core.js';
import { getHeight, getSlope, riverDist, lavaDist, VOL } from './world.js';
import { CATALOG } from './catalog.js';

const targets = [];            // objects and instanced meshes that can be inspected
const registry = new Map();    // object id -> record (see indexInspectables)
const countPerKey = {};

/** an instanced mesh whose instances are individual objects (palms, rocks, coral, ...) */
export function tagInstanced(im, key) {
  im.userData.inspect = { key, instanced: true };
  targets.push(im);
  return im;
}
/** a single object or group (a structure, a waterfall, a pond). model: false keeps it out of the specimen viewer */
export function tagObject(obj, key, { model = true } = {}) {
  obj.userData.inspect = { key, instanced: false, model };
  targets.push(obj);
  return obj;
}

/** the tagged objects and instanced meshes (read-only: the camera's occlusion fade finds the scenery it may fade here) */
export const inspectTargets = () => targets;

/** after the world is built: give every inspectable object its stable id and record where it is */
export function indexInspectables() {
  registry.clear();
  for (const k of Object.keys(countPerKey)) delete countPerKey[k];
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (const t of targets) {
    const key = t.userData.inspect.key;
    if (t.isInstancedMesh) {
      for (let i = 0; i < t.count; i++) {
        t.getMatrixAt(i, m);
        p.setFromMatrixPosition(m).applyMatrix4(t.matrixWorld);
        let id = `obj:${key}:${p.x.toFixed(1)},${p.z.toFixed(1)}`;
        if (registry.has(id)) id += '#' + i;
        registry.set(id, { id, key, pos: p.clone(), owner: t, index: i });
      }
      countPerKey[key] = (countPerKey[key] || 0) + t.count;
    } else {
      const c = new THREE.Box3().setFromObject(t).getCenter(new THREE.Vector3());
      let id = `obj:${key}`;
      if (registry.has(id)) id += '#' + (countPerKey[key] || 1);
      registry.set(id, { id, key, pos: c, owner: t, index: -1 });
      countPerKey[key] = (countPerKey[key] || 0) + 1;
    }
  }
}

export const findRecord = (id) => registry.get(id) || null;
export const countOf = (key) => countPerKey[key] || 0;
/** the first indexed object of a kind (used to show a whole class of objects) */
export const firstRecordOf = (key) => [...registry.values()].find((r) => r.key === key) || null;
/** the inspection result for an indexed record, as objectResult() would give it */
export function resultFor(rec) {
  const owner = rec.owner, key = rec.key;
  const cat = CATALOG[key] || { name: key, category: 'Props', desc: '' };
  const instanced = rec.index >= 0 && owner.isInstancedMesh;
  return {
    kind: 'object', key, id: rec.id, pos: rec.pos, owner, index: rec.index,
    title: cat.name, category: cat.category, status: cat.status, desc: cat.desc,
    subject: { kind: 'object', id: rec.id, label: cat.name, category: cat.category, pos: [rec.pos.x, rec.pos.y, rec.pos.z], classId: 'class:' + key },
    classSubject: { kind: 'class', id: 'class:' + key, label: cat.name, category: cat.category },
    count: countPerKey[key] || 1, model: owner.userData.inspect.model !== false, instanced,
  };
}
export const inspectableCount = () => registry.size;

/** the first point along the ray that is below the ground surface */
function groundHit(ray) {
  const o = ray.origin, d = ray.direction;
  let prev = 0.3;
  for (let t = 0.8; t < 1400; t += 1.5) {
    const x = o.x + d.x * t, z = o.z + d.z * t;
    if (o.y + d.y * t - getHeight(x, z) <= 0) {
      let a = prev, b = t;
      for (let k = 0; k < 14; k++) {
        const mid = (a + b) / 2;
        if (o.y + d.y * mid - getHeight(o.x + d.x * mid, o.z + d.z * mid) > 0) a = mid; else b = mid;
      }
      const tt = (a + b) / 2;
      return { t: tt, point: ray.at(tt, new THREE.Vector3()) };
    }
    prev = t;
  }
  return null;
}

const r1 = (v) => Math.round(v * 10) / 10;
const terrainZone = (x, z, h) => {
  const slope = getSlope(x, z);
  if (Math.hypot(x - VOL.x, z - VOL.z) < 150) return 'Volcano slopes';
  if (lavaDist(x, z) < 12) return 'Old lava channel (cold basalt)';
  if (riverDist(x, z) < 6) return 'Riverbank';
  if (slope > 0.55) return 'Cliff or steep slope';
  if (h < 2.6 && slope < 0.3) return h < 1.6 ? 'Beach or shore' : 'Lowland';
  return 'Upland jungle';
};

function objectResult(hit) {
  const owner = hit.object;
  let node = owner;
  while (node && !node.userData.inspect) node = node.parent;
  if (!node) return null;
  const key = node.userData.inspect.key;
  let rec = null;
  if (hit.instanceId !== undefined && node.isInstancedMesh) {
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    node.getMatrixAt(hit.instanceId, m);
    p.setFromMatrixPosition(m).applyMatrix4(node.matrixWorld);
    const id = `obj:${key}:${p.x.toFixed(1)},${p.z.toFixed(1)}`;
    rec = registry.get(id) || { id, key, pos: p.clone(), owner: node, index: hit.instanceId };
  } else {
    rec = [...registry.values()].find((r) => r.owner === node) || { id: `obj:${key}`, key, pos: hit.point.clone(), owner: node, index: -1 };
  }
  const cat = CATALOG[key] || { name: key, category: 'Props', desc: '' };
  const model = node.userData.inspect.model !== false;
  return {
    kind: 'object', key, id: rec.id, pos: rec.pos, owner: rec.owner, index: rec.index,
    title: cat.name, category: cat.category, status: cat.status, desc: cat.desc,
    subject: { kind: 'object', id: rec.id, label: cat.name, category: cat.category, pos: [rec.pos.x, rec.pos.y, rec.pos.z], classId: 'class:' + key },
    classSubject: { kind: 'class', id: 'class:' + key, label: cat.name, category: cat.category },
    count: countPerKey[key] || 1, model, instanced: rec.index >= 0 && node.isInstancedMesh,
  };
}

function locationResult(point, title, category, desc, status) {
  const x = r1(point.x), z = r1(point.z);
  const gx = Math.round(point.x / 5) * 5, gz = Math.round(point.z / 5) * 5;
  return {
    kind: 'location', key: 'location', id: `loc:${gx},${gz}`, pos: point.clone(),
    title, category, status, desc,
    subject: { kind: 'location', id: `loc:${gx},${gz}`, label: `${title} at ${x}, ${z}`, category, pos: [point.x, point.y, point.z], radius: 10 },
    classSubject: null, count: 0, model: false, instanced: false,
  };
}

/** what is under the cursor: the nearest inspectable object, else water, else the ground */
export function inspectAt(raycaster) {
  const ray = raycaster.ray;
  const hits = raycaster.intersectObjects(targets, true);
  const oh = hits.length ? hits[0] : null;
  const g = groundHit(ray);
  let w = null;
  if (ray.direction.y < -1e-4) {
    const t = (env.tide - ray.origin.y) / ray.direction.y;
    if (t > 0 && (!g || t < g.t)) w = { t, point: ray.at(t, new THREE.Vector3()) };
  }
  if (oh && (!w || oh.distance < w.t) && (!g || oh.distance <= g.t + 1.0)) {
    const r = objectResult(oh);
    if (r) return r;
  }
  if (w) {
    const bed = getHeight(w.point.x, w.point.z);
    const lagoon = bed > -6;
    const r = locationResult(w.point, lagoon ? 'Lagoon' : 'Open sea', 'Water', lagoon ? CATALOG.lagoon.desc : CATALOG.sea.desc, lagoon ? CATALOG.lagoon.status : CATALOG.sea.status);
    return { ...r, depth: Math.max(0, env.tide - bed) };
  }
  if (g) {
    const h = getHeight(g.point.x, g.point.z);
    const zone = terrainZone(g.point.x, g.point.z, h);
    return { ...locationResult(g.point, zone, 'Terrain', `${zone}. Ground height ${h.toFixed(1)} m above the sea.`, 'game'), zone };
  }
  return null;
}

/** the facts about a result that can be stated plainly (no invented values) */
export function factsFor(res) {
  const out = [];
  const p = res.pos;
  if (p) {
    out.push(['Position', `${p.x.toFixed(1)}, ${p.z.toFixed(1)} (x, z)`]);
    if (res.kind === 'object') out.push(['Height', `${p.y.toFixed(1)} m above sea level`]);
  }
  if (res.kind === 'object' && res.instanced) out.push(['Instances of this kind', String(res.count)]);
  if (res.zone) out.push(['Terrain', res.zone]);
  if (res.depth !== undefined) out.push(['Depth', `${res.depth.toFixed(1)} m`]);
  if (res.status && res.status !== 'model') out.push(['Source', ({ real: 'Real organism', feature: 'Natural feature', game: 'Game feature', model: 'Game model', 'game-model': 'Game model', fictional: 'Fictional' })[res.status] || res.status]);
  out.push(['Object id', res.id]);
  return out;
}
