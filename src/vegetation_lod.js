// Level of detail for an instanced shrub family (Phase 3). A family is placed once, as before. Its full-detail InstancedMesh (the
// "proxy") keeps every instance's matrix and the inspection tag, and is hidden: picking still runs against the full shrub. Three shared
// batches, one per detail level, draw the instances. Each frame every instance's on-screen radius is measured and its level chosen
// with hysteresis: a shrub moves to a coarser level when it falls below a threshold and back only when it grows 20% past it, so it
// does not flicker at a boundary. A batch is rewritten only when one of its instances changes level. Batches are not frustum culled
// (their instances are spread over the island, and their counts change), and static_cull.js leaves them alone.
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
export function lodFamily(proxy, geos, list) {
  const n = proxy.count;
  const m = new Float32Array(n * 16), pos = new Float32Array(n * 3), sc = new Float32Array(n);
  const tmp = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    proxy.getMatrixAt(i, tmp);
    tmp.toArray(m, i * 16);
    const e = tmp.elements;
    pos[i * 3] = e[12]; pos[i * 3 + 1] = e[13]; pos[i * 3 + 2] = e[14];
    sc[i] = list[i].sc;
  }
  const batches = geos.map((g, lvl) => {
    const im = new THREE.InstancedMesh(g, proxy.material, n);
    im.name = (proxy.userData.inspect ? proxy.userData.inspect.key : 'vegetation') + ' LOD ' + lvl;
    im.castShadow = false; im.receiveShadow = true;
    im.frustumCulled = false; im.count = 0;
    im.userData.lodBatch = true;
    scene.add(im);
    return im;
  });
  proxy.visible = false;
  const fam = { n, m, pos, sc, batches, level: new Uint8Array(n), hide: new Uint8Array(n), proxy };
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
    for (let i = 0; i < f.n; i++) if (f.level[i] === b && !f.hide[i]) { arr.set(f.m.subarray(i * 16, i * 16 + 16), c * 16); c++; }
    im.count = c;
    im.instanceMatrix.needsUpdate = true;
  }
}

/** take one instance out of the family's batches (the camera's occlusion fade draws it itself), or put it back. Returns false if the mesh is not a family's proxy. */
export function setInstanceHidden(proxy, i, hidden) {
  const f = famOf.get(proxy);
  if (!f) return false;
  f.hide[i] = hidden ? 1 : 0;
  rebuild(f, 1 << f.level[i]);
  return true;
}
export const lodFamilyOf = (proxy) => famOf.get(proxy) || null;

function update(f) {
  const px = U.pxScale.value, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  let mask = 0;
  for (let i = 0; i < f.n; i++) {
    const dx = f.pos[i * 3] - cx, dy = f.pos[i * 3 + 1] - cy, dz = f.pos[i * 3 + 2] - cz;
    const d = Math.max(0.5, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const size = RADIUS * f.sc[i] * px / d;
    const was = f.level[i];
    let L = was;
    while (L < 2 && size < PX[L]) L++;
    while (L > 0 && size > PX[L - 1] * HYST) L--;
    if (L !== was) { f.level[i] = L; mask |= (1 << was) | (1 << L); }
  }
  if (mask) rebuild(f, mask);
}

updaters.push(() => { for (const f of families) update(f); });
