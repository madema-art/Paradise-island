// Part instancing. A creature's rigid parts (the meshes that hang from one bone and are not skinned) are separate draw calls, one per part per
// creature. Parts of the same kind across creatures share their geometry and material (the models are clones), so each kind is drawn once,
// instanced: one InstancedMesh per kind with one instance per creature. The creature keeps its own part meshes in its hierarchy, so the
// bones and the code move them exactly as before. Those part meshes are moved to a layer no camera draws, and their world matrices are
// copied into the instances each frame (a part hidden by the creature's code is written as a zero-size instance).
//
// The instances are written after the scene's matrices are updated for the frame (the renderer's own update is taken over so the
// world matrices are computed once, at the right moment). setPartInstancing(false) puts every part back, for the benchmark.
import * as THREE from 'three';
import { renderer, scene, updaters, creatures } from './core.js';

const LAYER_OUT = 2;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _zero = new THREE.Vector3(0, 0, 0);
const CELL = 60;   // parts of one kind are split into spatial cells of this size, so each cell is culled on its own
export const partStats = { kinds: 0, parts: 0, drawsBefore: 0, drawsAfter: 0 };
let kinds = [];
let on = false, pending = false, built = false;

const candidate = (o) => o.isMesh && !o.userData.noMerge && !o.isSkinnedMesh && !o.isInstancedMesh && !o.userData.creature && !o.userData.mergedInto && !o.children.length
  && !Array.isArray(o.material) && o.geometry.groups.length === 0 && !o.userData.inspect && o.parent && o.name !== 'merged rigid parts' && o.name !== 'merged skin';

// a part shows only while it is in the scene and every object above it is visible (a creature taken out of the scene shows nothing)
function effectiveVisible(o) { let p = o, top = o; for (; p; top = p, p = p.parent) if (!p.visible) return false; return top === scene; }

function build() {
  built = true;
  const byKey = new Map();
  for (const c of creatures) {
    if (!c.group) continue;
    c.group.traverse((o) => {
      if (!candidate(o)) return;
      const key = [o.geometry.uuid, o.material.uuid, o.castShadow, o.receiveShadow, o.frustumCulled, o.renderOrder].join('|');
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(o);
    });
  }
  const cells = new Map();
  for (const [key, parts] of byKey) {
    cells.clear();
    for (const p of parts) {
      const w = p.getWorldPosition(new THREE.Vector3());
      const ck = key + '#' + Math.floor(w.x / CELL) + ',' + Math.floor(w.z / CELL);
      if (!cells.has(ck)) cells.set(ck, []);
      cells.get(ck).push(p);
    }
    for (const parts of cells.values()) addKind(parts);
  }
  partStats.kinds = kinds.length;
  on = true;
  scene.matrixWorldAutoUpdate = false;   // the update below is the only one per frame (see the renderer hook)
}

function addKind(parts) {
  {
    if (parts.length < 2) return;
    const a = parts[0];
    const im = new THREE.InstancedMesh(a.geometry, a.material, parts.length);
    im.name = 'instanced parts';
    im.castShadow = a.castShadow; im.receiveShadow = a.receiveShadow;
    im.frustumCulled = a.frustumCulled; im.renderOrder = a.renderOrder;
    im.matrixAutoUpdate = false;
    im.userData.noPick = true;
    for (let i = 0; i < parts.length; i++) im.setMatrixAt(i, ZERO);
    scene.add(im);
    for (const p of parts) p.layers.set(LAYER_OUT);
    kinds.push({ im, parts });
    partStats.parts += parts.length; partStats.drawsBefore += parts.length; partStats.drawsAfter += 1;
  }
}

/** write the instances from the parts' world matrices (after the scene update) */
function writeInstances() {
  for (const { im, parts } of kinds) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (effectiveVisible(p)) im.setMatrixAt(i, p.matrixWorld);
      else { _m.copy(p.matrixWorld).scale(_zero); im.setMatrixAt(i, _m); }   // hidden: zero size, but kept where it is (the culling sphere stays local)
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.frustumCulled) im.computeBoundingSphere();
  }
}

/** put every part back in its own draw and hide the instances (benchmark A/B) */
export function setPartInstancing(state) {
  if (!state) {
    for (const { im, parts } of kinds) { for (const p of parts) p.layers.set(0); im.visible = false; }
    on = false;
    scene.matrixWorldAutoUpdate = true;
    return;
  }
  if (!built) build();
  for (const { im, parts } of kinds) { for (const p of parts) p.layers.set(LAYER_OUT); im.visible = true; }
  on = true;
  scene.matrixWorldAutoUpdate = false;
}

// the renderer's scene update is taken over: the first render of a frame updates the world matrices once, then writes the instances
const origRender = renderer.render.bind(renderer);
renderer.render = (s, c) => {
  if (s === scene && on && pending) {
    pending = false;
    scene.updateMatrixWorld();
    writeInstances();
  }
  return origRender(s, c);
};

updaters.push(() => { if (built) pending = on; });

// build after the skins and rigid parts are merged (skeleton_share.js runs its passes over the first seconds)
let acc = 0;
updaters.push((dt) => {
  if (built) return;
  if (creatures.length <= 100) return;
  acc += dt;
  if (acc < 7) return;
  build();
});
