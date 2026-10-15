// Shared instanced vegetation LOD. The hidden full-detail proxy retains inspection
// identity and matrices; three batches render the selected detail with hysteresis.
// Trees use transformed geometry centres/radii; shrubs retain their original sizing.
// Classification is cached while camera position and pixel scale are unchanged.
// Rewritten batches get fresh bounds (including wind margin), colours, and shadows.
import * as THREE from 'three';
import { scene, camera, U, updaters } from './core.js';
import { recordDraws, replayDraws } from './util.js';

const PX = [26, 10];   // on-screen radius in device pixels: below PX[0] the mid shrub is drawn, below PX[1] the far one
const HYST = 1.2;      // back to the finer level only past 1.2 x the threshold
const RADIUS = 1.0;    // metres, at scale 1: a bounding radius for the shrub
const families = [];
const famOf = new Map();                     // proxy InstancedMesh -> its family

/**
 * The three detail levels of one builder, [full, mid, far]. make(detail) runs once with the world's random stream (level 0, exactly as
 * before), recording the draws it makes; levels 1 and 2 are then built from those same draws, so each is the same plant, and the
 * world's stream is spent once, as before.
 */
export function lodLevels(make) {
  const { result, values } = recordDraws(() => make(0));
  return [result, replayDraws(values, () => make(1)), replayDraws(values, () => make(2))];
}

/** proxy: the family's full-detail InstancedMesh (already placed and tagged). geos: [full, mid, far]. list: the placed items (a.sc). */
export function lodFamily(proxy, geos, list, { tree = false, distantMaterial = null } = {}) {
  const n = proxy.count;
  const m = new Float32Array(n * 16), pos = new Float32Array(n * 3), sc = new Float32Array(n);
  const tmp = new THREE.Matrix4();
  proxy.geometry.computeBoundingSphere();
  const sphere = proxy.geometry.boundingSphere;
  const centre = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    proxy.getMatrixAt(i, tmp);
    tmp.toArray(m, i * 16);
    const e = tmp.elements;
    if (tree) centre.copy(sphere.center).applyMatrix4(tmp); else centre.set(e[12], e[13], e[14]);
    pos[i * 3] = centre.x; pos[i * 3 + 1] = centre.y; pos[i * 3 + 2] = centre.z;
    sc[i] = list[i].sc * (tree ? sphere.radius : RADIUS);
  }
  const batches = geos.map((g, lvl) => {
    const im = new THREE.InstancedMesh(g, lvl > 0 && distantMaterial ? distantMaterial : proxy.material, n);
    im.name = (proxy.userData.inspect ? proxy.userData.inspect.key : 'vegetation') + ' LOD ' + lvl;
    im.castShadow = proxy.castShadow; im.receiveShadow = proxy.receiveShadow;
    im.frustumCulled = true; im.count = 0;
    im.matrixAutoUpdate = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (proxy.instanceColor) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    im.userData.lodBatch = true;
    scene.add(im);
    return im;
  });
  proxy.visible = false;
  // A family with only a handful of trees costs more in extra draws than the
  // slightly finer geometry costs. Share the finest requested level in that case;
  // near quality is never reduced. Large broadleaf families keep per-instance LOD.
  const fam = { n, m, pos, sc, batches, level: new Uint8Array(n), requested: tree && n <= 10 ? new Uint8Array(n) : null,
    hide: new Uint8Array(n), proxy, px: tree ? [220, 85] : PX };
  famOf.set(proxy, fam);
  rebuild(fam, 0b111);
  families.push(fam);
  return fam;
}

// copies each batch's instances from the master matrices (only the batches named in the mask)
function rebuild(f, mask) {
  for (let b = 0; b < f.batches.length; b++) {
    if (!(mask & (1 << b))) continue;
    const im = f.batches[b], arr = im.instanceMatrix.array;
    let c = 0;
    for (let i = 0; i < f.n; i++) if (f.level[i] === b && !f.hide[i]) {
      for (let k = 0; k < 16; k++) arr[c * 16 + k] = f.m[i * 16 + k];
      if (im.instanceColor) for (let k = 0; k < 3; k++) im.instanceColor.array[c * 3 + k] = f.proxy.instanceColor.array[i * 3 + k];
      c++;
    }
    im.count = c;
    im.visible = c > 0;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    // Bounds reflect the active instances, not stale instances left at the end of the buffer.
    im.boundingSphere = null;
    if (c) { im.computeBoundingSphere(); im.boundingSphere.radius += 4; } // conservative world-space wind margin
  }
}

/** take one instance out of the family's batches (the camera's occlusion fade draws it itself), or put it back. Returns false if the mesh is not a family's proxy. */
export function setInstanceHidden(proxy, i, hidden) {
  const f = famOf.get(proxy);
  if (!f) return false;
  if (f.hide[i] === (hidden ? 1 : 0)) return true;
  f.hide[i] = hidden ? 1 : 0;
  rebuild(f, 1 << f.level[i]);
  return true;
}
export const lodFamilyOf = (proxy) => famOf.get(proxy) || null;

function update(f) {
  if (!f.n) return;
  const px = U.pxScale.value, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  const levels = f.requested || f.level;
  let mask = 0;
  for (let i = 0; i < f.n; i++) {
    const dx = f.pos[i * 3] - cx, dy = f.pos[i * 3 + 1] - cy, dz = f.pos[i * 3 + 2] - cz;
    const d2 = Math.max(0.25, dx * dx + dy * dy + dz * dz);
    const size2 = (f.sc[i] * px) ** 2 / d2;
    const was = levels[i];
    let L = was;
    while (L < 2 && size2 < f.px[L] ** 2) L++;
    while (L > 0 && size2 > (f.px[L - 1] * HYST) ** 2) L--;
    if (L !== was) { levels[i] = L; mask |= (1 << was) | (1 << L); }
  }
  if (f.requested) {
    let finest = 2;
    for (let i = 0; i < f.n; i++) finest = Math.min(finest, levels[i]);
    if (finest !== f.level[0]) { f.level.fill(finest); rebuild(f, 0b111); }
    return;
  }
  if (mask) rebuild(f, mask);
}

let lastX = NaN, lastY = NaN, lastZ = NaN, lastPx = NaN;
updaters.push(() => {
  const p = camera.position, px = U.pxScale.value;
  if (p.x === lastX && p.y === lastY && p.z === lastZ && px === lastPx) return;
  lastX = p.x; lastY = p.y; lastZ = p.z; lastPx = px;
  for (const f of families) update(f);
});

export function vegetationStats() {
  return families.map(f => ({ key: f.proxy.userData.inspect?.key, instances: f.n,
    sharedDetail: !!f.requested,
    levels: f.batches.map(im => ({ count: im.count, triangles: (im.geometry.index?.count || im.geometry.attributes.position.count) / 3, castShadow: im.castShadow })),
    hidden: f.hide.reduce((a, b) => a + b, 0) }));
}
