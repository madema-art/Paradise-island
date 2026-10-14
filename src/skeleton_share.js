// Shared skeletons. The skinned parts of one creature (a monkey's body, eyes and lids; a gull's wings and legs; a tang's fins) were each
// given their own copy of the same bones. Every skeleton is re-uploaded to the GPU each frame, so a monkey cost 14 uploads and a tang 12.
// Parts whose bones are the very same Bone objects, with the same inverse bind matrices, can share one Skeleton: the bone matrices are
// then identical, the GPU data is uploaded once, and each mesh keeps its own bind matrix, so the picture is the same. Measured in the
// frame benchmark (src/dev/perf_bench.js); setSkeletonShare(false) restores the separate copies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { updaters, creatures } from './core.js';

let shared = false, done = false, acc = 0;
const sameInverses = (a, b) => a.length === b.length && a.every((m, i) => { const e1 = m.elements, e2 = b[i].elements; for (let k = 0; k < 16; k++) if (Math.abs(e1[k] - e2[k]) > 1e-6) return false; return true; });

function share(group) {
  const meshes = [];
  group.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  const canon = [];   // { skeleton, meshes }
  for (const m of meshes) {
    if (m.userData.skeleton0 === undefined) m.userData.skeleton0 = m.skeleton;
    const bones = m.skeleton.bones;
    const hit = canon.find((c) => c.skeleton.bones.length === bones.length && bones.every((b, i) => b === c.skeleton.bones[i]) && sameInverses(m.skeleton.boneInverses, c.skeleton.boneInverses));
    if (hit) { m.skeleton = hit.skeleton; m.userData.sharedSkeleton = true; hit.meshes.push(m); }
    else canon.push({ skeleton: m.skeleton, meshes: [m] });
  }
}
function restore(group) {
  group.traverse((o) => { if (o.isSkinnedMesh && o.userData.skeleton0) { o.skeleton = o.userData.skeleton0; o.userData.sharedSkeleton = false; } });
}

/** share (or restore) the skeletons of every creature */
export function setSkeletonShare(state) {
  shared = !!state;
  for (const c of creatures) if (c.group) (shared ? share : restore)(c.group);
}

// Merged skins. Parts of one creature that share a skeleton, a parent, the same local and bind matrices, the same vertex attributes and
// a single material each become ONE skinned mesh with one material group per part. Each material is one draw call, so a monkey's 14
// parts (6 materials) draw as 6 instead of 14, a gull's 24 parts (11 materials) as 11. The vertices and materials are the same.
const attrSig = (g) => Object.keys(g.attributes).sort().map((k) => k + ':' + g.attributes[k].itemSize).join(',') + (g.index ? '|indexed' : '|plain');
const sameMatrix = (a, b) => { for (let i = 0; i < 16; i++) if (Math.abs(a.elements[i] - b.elements[i]) > 1e-6) return false; return true; };
export const mergeStats = { clusters: 0, merged: 0, before: 0, after: 0 };
const merges = [];
/** merge on (the default) or off: off puts the original parts back, so the two can be compared on the same frame */
export function setSkinnedMerge(on) {
  if (on) return;
  for (const { sm, parts, parent } of merges) {
    if (sm.parent) sm.parent.remove(sm);
    for (const m of parts) { parent.add(m); m.userData.mergedInto = undefined; }
  }
  merges.length = 0;
}

function mergeGroup(group) {
  const parts = [];
  group.traverse((o) => { if (o.isSkinnedMesh && !o.userData.mergedInto && !Array.isArray(o.material) && o.geometry.groups.length === 0) parts.push(o); });
  const clusters = [];
  for (const m of parts) {
    const hit = clusters.find((c) => { const a = c[0]; return a.skeleton === m.skeleton && a.parent === m.parent && attrSig(a.geometry) === attrSig(m.geometry) && sameMatrix(a.matrix, m.matrix) && sameMatrix(a.bindMatrix, m.bindMatrix) && a.frustumCulled === m.frustumCulled; });
    if (hit) hit.push(m); else clusters.push([m]);
  }
  for (const c of clusters) {
    if (c.length < 2) continue;
    const mats = [], matOf = c.map((m) => { let i = mats.indexOf(m.material); if (i < 0) { mats.push(m.material); i = mats.length - 1; } return i; });
    const geometry = mergeGeometries(c.map((m) => m.geometry), true);
    if (!geometry) continue;
    geometry.groups.forEach((g, i) => { g.materialIndex = matOf[i]; });
    const a = c[0];
    const sm = new THREE.SkinnedMesh(geometry, mats.length === 1 ? mats[0] : mats);
    sm.name = 'merged skin';
    sm.bind(a.skeleton, a.bindMatrix);
    sm.position.copy(a.position); sm.quaternion.copy(a.quaternion); sm.scale.copy(a.scale);
    sm.frustumCulled = a.frustumCulled; sm.renderOrder = a.renderOrder;
    sm.castShadow = c.some((m) => m.castShadow && !m.userData.tiny);
    sm.receiveShadow = c.some((m) => m.receiveShadow);
    sm.userData.castShadow0 = c.some((m) => (m.userData.castShadow0 ?? m.castShadow));
    sm.userData.tiny = c.every((m) => m.userData.tiny);
    const parent = a.parent;   // kept before the parts are removed (remove() clears a part's parent)
    parent.add(sm);
    for (const m of c) { m.parent.remove(m); m.userData.mergedInto = sm; }
    merges.push({ sm, parts: c, parent });
    mergeStats.clusters++; mergeStats.merged += c.length; mergeStats.before += c.length; mergeStats.after += 1;
  }
}

updaters.push((dt) => {
  if (done) return;
  if (creatures.length <= 100) return;
  acc += dt;
  if (acc < 1) return;      // a second after the world is built: every creature has its parts
  done = true;
  setSkeletonShare(true);
  for (const c of creatures) if (c.group) mergeGroup(c.group);
});

/** a check of the merge: for every merged skin, the vertex count and the bounds of its parts against the merged geometry */
export function mergeCheck() {
  let clusters = 0, vertsBefore = 0, vertsAfter = 0, worst = 0, indexBefore = 0, indexAfter = 0;
  for (const { sm, parts } of merges) {
    clusters++;
    const u = new THREE.Box3();
    for (const m of parts) {
      vertsBefore += m.geometry.attributes.position.count;
      indexBefore += m.geometry.index ? m.geometry.index.count : 0;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      u.union(m.geometry.boundingBox);
    }
    vertsAfter += sm.geometry.attributes.position.count;
    indexAfter += sm.geometry.index ? sm.geometry.index.count : 0;
    if (!sm.geometry.boundingBox) sm.geometry.computeBoundingBox();
    const a = sm.geometry.boundingBox;
    worst = Math.max(worst, a.min.distanceTo(u.min), a.max.distanceTo(u.max));
  }
  return { clusters, vertsBefore, vertsAfter, indexBefore, indexAfter, worstBoundsDifference: +worst.toFixed(6), sameVertexCount: vertsBefore === vertsAfter };
}
