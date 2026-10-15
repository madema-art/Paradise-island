import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { boneRenderTrial } from './helpers/bone_render_trial.js';

test('bone-only render pruning leaves animated world transforms intact', () => {
  const root = new THREE.Group(), a = new THREE.Bone(), b = new THREE.Bone(); root.add(a); a.add(b);
  a.position.set(1,2,3); b.position.set(0,2,0); root.updateMatrixWorld(true);
  const before = b.matrixWorld.toArray(), prune = boneRenderTrial(root);
  assert.equal(prune.count,2); prune.set(true); assert.equal(a.visible,false);
  root.updateMatrixWorld(true); assert.deepEqual(b.matrixWorld.toArray(),before);
  a.rotation.z = .5; root.updateMatrixWorld(true); assert.notDeepEqual(b.matrixWorld.toArray(),before);
  const after = b.matrixWorld.toArray(); prune.set(false); root.updateMatrixWorld(true); assert.deepEqual(b.matrixWorld.toArray(),after);
});

test('existing and later attachments are always visible through their bone ancestors', () => {
  const root = new THREE.Group(), arm = new THREE.Bone(), finger = new THREE.Bone(), leg = new THREE.Bone();
  root.add(arm,leg); arm.add(finger); const mesh = new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()); mesh.visible=false; leg.add(mesh);
  const prune = boneRenderTrial(root); prune.set(true); assert.equal(leg.visible,true); assert.equal(arm.visible,false);
  mesh.visible=true; assert.equal(leg.visible,true,'pre-existing hidden props can become visible without reattachment');
  const prop = new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()); finger.add(prop);
  assert.equal(arm.visible,true); assert.equal(finger.visible,true);
  prune.set(false); prune.set(true); assert.equal(arm.visible,true); assert.equal(finger.visible,true);
});
