// Spatial chunks for an instanced family. An InstancedMesh is culled as one object, so a family spread over the island is drawn whenever
// any part of it is in view. chunkInstanced(im, list, cell) splits the instances of a placed InstancedMesh into one InstancedMesh per
// square cell of the island (same geometry, material, shadow flags and instance colours, the same matrices), so the cells that are off
// screen are culled. The placed mesh is removed from the scene. Object ids come from the instance positions, so they do not change.
import * as THREE from 'three';
import { scene } from './core.js';
import { tagInstanced } from './inspect.js';

export function chunkInstanced(im, list, cell, { inspect = null } = {}) {
  const groups = new Map();
  list.forEach((a, i) => {
    const key = Math.floor(a.x / cell) + ',' + Math.floor(a.z / cell);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  const m = new THREE.Matrix4(), col = new THREE.Color(), out = [];
  for (const idx of groups.values()) {
    const c = new THREE.InstancedMesh(im.geometry, im.material, idx.length);
    c.name = im.name;
    c.castShadow = im.castShadow; c.receiveShadow = im.receiveShadow;
    idx.forEach((src, j) => {
      im.getMatrixAt(src, m); c.setMatrixAt(j, m);
      if (im.instanceColor) { im.getColorAt(src, col); c.setColorAt(j, col); }
    });
    c.instanceMatrix.needsUpdate = true;
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
    scene.add(c);
    if (inspect) tagInstanced(c, inspect);
    out.push(c);
  }
  scene.remove(im);
  return out;
}
