// Shared skeletons. The skinned parts of one creature (a monkey's body, eyes and lids; a gull's wings and legs; a tang's fins) were each
// given their own copy of the same bones. Every skeleton is re-uploaded to the GPU each frame, so a monkey cost 14 uploads and a tang 12.
// Parts whose bones are the very same Bone objects, with the same inverse bind matrices, can share one Skeleton: the bone matrices are
// then identical, the GPU data is uploaded once, and each mesh keeps its own bind matrix, so the picture is the same. Measured in the
// frame benchmark (src/dev/perf_bench.js); setSkeletonShare(false) restores the separate copies.
import * as THREE from 'three';
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

/**
 * one geometry from several parts, with ONE draw group per material. Each part's vertices are copied in order; each material's triangles
 * are gathered together. (mergeGeometries would keep one group per part, and the renderer draws every group separately: a part sharing a
 * material with another part still cost its own draw call.) Returns null when a part has something this does not copy (morph targets,
 * interleaved buffers).
 */
function consolidate(geos, matOf, nMats) {
  for (const g of geos) {
    if (Object.keys(g.morphAttributes).length) return null;
    for (const k in g.attributes) if (g.attributes[k].isInterleavedBufferAttribute) return null;
  }
  const names = Object.keys(geos[0].attributes);
  const vcount = geos.map((g) => g.attributes.position.count);
  const totalV = vcount.reduce((a, b) => a + b, 0);
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const first = geos[0].attributes[n], size = first.itemSize;
    const arr = new first.array.constructor(totalV * size);
    let o = 0;
    for (const g of geos) { const a = g.attributes[n]; arr.set(a.array, o * size); o += a.count; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size, first.normalized));
  }
  const counts = new Array(nMats).fill(0);
  geos.forEach((g, i) => { counts[matOf[i]] += g.index ? g.index.count : vcount[i]; });
  const total = counts.reduce((a, b) => a + b, 0);
  const IndexArr = totalV > 65535 ? Uint32Array : Uint16Array;
  const idx = new IndexArr(total);
  const starts = []; let s = 0;
  for (let m = 0; m < nMats; m++) { starts.push(s); s += counts[m]; }
  const fill = starts.slice();
  let base = 0;
  geos.forEach((g, i) => {
    const src = g.index ? g.index.array : null, n = src ? src.length : vcount[i], m = matOf[i];
    let f = fill[m];
    for (let k = 0; k < n; k++) idx[f++] = (src ? src[k] : k) + base;
    fill[m] = f; base += vcount[i];
  });
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  for (let m = 0; m < nMats; m++) if (counts[m]) out.addGroup(starts[m], counts[m], m);
  return out;
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
    const geometry = consolidate(c.map((m) => m.geometry), matOf, mats.length);
    if (!geometry) continue;
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

let rigidTick = -1;   // seconds since the skins were merged, for the rigid parts (set once they are merged)
updaters.push((dt) => {
  if (rigidTick >= 0) rigidTick += dt;
  if (rigidTick >= 0 && rigidState === 0 && rigidTick >= 1) {
    for (const c of creatures) if (c.group) for (const m of rigidParts(c.group)) rigidSnap.set(m, m.matrix.elements.slice());
    rigidState = 1; rigidStats.candidates = rigidSnap.size;
  } else if (rigidState === 1 && rigidTick >= 4) {
    const stable = [];
    for (const [m, el] of rigidSnap) { if (!m.parent) continue; let same = true; for (let k = 0; k < 16; k++) if (Math.abs(el[k] - m.matrix.elements[k]) > 1e-7) { same = false; break; } if (same) stable.push(m); }
    rigidStats.stable = stable.length;
    rigidMerge(stable);
    rigidState = 2; rigidSnap.clear();
  }
  if (done) return;
  if (creatures.length <= 100) return;
  acc += dt;
  if (acc < 1) return;      // a second after the world is built: every creature has its parts
  done = true;
  setSkeletonShare(true);
  for (const c of creatures) if (c.group) mergeGroup(c.group);
  rigidTick = 0;
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

// ---- rigid parts: the separate meshes of a creature that hang from one bone (or group) and never move relative to it -------------------
// Each part's local matrix is compared at two moments a few seconds apart; a part whose matrix changed is left as it is. The rest are
// baked into their parent's space, grouped by material, into one mesh per parent. Their draws drop from one per part to one per material.
const rigidSnap = new Map();   // part -> matrix elements at the first snapshot
let rigidState = 0, rigidT = 0;
export const rigidStats = { candidates: 0, stable: 0, merged: 0, meshesBefore: 0, meshesAfter: 0, drawGroupsBefore: 0, drawGroupsAfter: 0 };
const rigidCandidate = (o) => o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !o.userData.creature && !o.userData.mergedInto && !o.children.length && !Array.isArray(o.material) && o.geometry.groups.length === 0 && o.parent && !o.userData.inspect;

function rigidParts(group) {
  const out = [];
  group.traverse((o) => { if (rigidCandidate(o)) out.push(o); });
  return out;
}
function rigidMerge(stable) {
  const byParent = new Map();
  for (const m of stable) { const key = m.parent; if (!byParent.has(key)) byParent.set(key, []); byParent.get(key).push(m); }
  for (const [parent, parts] of byParent) {
    // one mesh per parent and per (shadow, cull, render-order) combination
    const sub = new Map();
    for (const m of parts) { const k = [m.frustumCulled, m.castShadow, m.receiveShadow, m.renderOrder].join('|'); if (!sub.has(k)) sub.set(k, []); sub.get(k).push(m); }
    for (const list of sub.values()) {
      if (list.length < 2) continue;
      const mats = [], matOf = list.map((m) => { let i = mats.indexOf(m.material); if (i < 0) { mats.push(m.material); i = mats.length - 1; } return i; });
      const geos = list.map((m) => { const g = m.geometry.clone(); g.applyMatrix4(m.matrix); return g; });
      const geometry = consolidate(geos, matOf, mats.length);
      if (!geometry) continue;
      const a = list[0];
      const mesh = new THREE.Mesh(geometry, mats.length === 1 ? mats[0] : mats);
      mesh.name = 'merged rigid parts';
      mesh.frustumCulled = a.frustumCulled; mesh.renderOrder = a.renderOrder;
      mesh.castShadow = list.some((m) => m.castShadow); mesh.receiveShadow = list.some((m) => m.receiveShadow);
      mesh.userData.castShadow0 = list.some((m) => (m.userData.castShadow0 ?? m.castShadow));
      parent.add(mesh);
      for (const m of list) { parent.remove(m); m.userData.mergedInto = mesh; }
      rigidMerges.push({ mesh, parts: list, parent });
      rigidStats.merged += list.length; rigidStats.meshesBefore += list.length; rigidStats.meshesAfter += 1;
      rigidStats.drawGroupsBefore += list.length; rigidStats.drawGroupsAfter += mats.length;
    }
  }
}
const rigidMerges = [];
export function setRigidMerge(on) {
  if (on) return;
  for (const { mesh, parts, parent } of rigidMerges) { if (mesh.parent) mesh.parent.remove(mesh); for (const m of parts) { parent.add(m); m.userData.mergedInto = undefined; } }
  rigidMerges.length = 0;
}

export function rigidStatsRef() { return rigidStats; }

// ---- culling of skinned creatures. Their meshes were drawn whether or not they were on screen (frustumCulled off, because the bounds of an
// animated skin are not the bind pose's). The bounds are now the bind-pose sphere with a generous margin, so an animated pose stays inside
// it and off-screen creatures are skipped. setSkinCulling(false) restores the old behaviour (for the benchmark).
const cullOriginal = new Map();
export function setSkinCulling(on) {
  for (const c of creatures) {
    if (!c.group) continue;
    c.group.traverse((o) => {
      if (!o.isSkinnedMesh && o.name !== 'merged skin') return;
      if (on) {
        if (!cullOriginal.has(o)) cullOriginal.set(o, o.frustumCulled);
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (!o.userData.boundsWidened) {
          const s = o.geometry.boundingSphere;
          s.radius = s.radius * 3 + 1.2;   // covers the animated poses (limbs, tails, wings) with room to spare
          o.userData.boundsWidened = true;
        }
        o.frustumCulled = true;
      } else if (cullOriginal.has(o)) {
        o.frustumCulled = cullOriginal.get(o);
      }
    });
  }
}
