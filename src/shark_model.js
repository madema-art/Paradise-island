// Blackfin reef shark: one rigged Blender model (blender/build_blackfin_reef_shark.py) with six swimming clips.
// Each animal gets its own skeleton clone and mixer; the clips are shared.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import sharkBin from '../assets/Paradise_Island_Blackfin_Reef_Shark.glb';

let rig = null;
let clipsByName = new Map();
const nodeKey = (name) => name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
// turns, dashes and the one-shot clips play once and hold their last pose; the rest loop
const ONE_SHOT = new Set(['Turn_Left', 'Turn_Right', 'Dash_Strike']);

export async function loadSharkModel() {
  try {
    const buf = sharkBin.buffer.slice(sharkBin.byteOffset, sharkBin.byteOffset + sharkBin.byteLength);
    const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buf, '', resolve, reject));
    const target = nodeKey('Blackfin_Reef_Shark | rig');
    gltf.scene.traverse((object) => { if (!rig && nodeKey(object.name) === target) rig = object; });
    if (!rig) throw new Error('Blackfin reef shark rig not found in the GLB');
    clipsByName = new Map(gltf.animations.map((clip) => [clip.name, clip]));
    return true;
  } catch (error) {
    console.warn('blackfin reef shark failed to load; the reef shark will not be shown', error);
    rig = null; clipsByName.clear();
    return false;
  }
}

export function makeSharkModel() {
  if (!rig) return null;
  const root = cloneSkeleton(rig);
  // the model's nose points along -X, the game's forward is +Z (same convention as the dolphins)
  root.position.set(0, 0, 0);
  root.rotation.y = Math.PI * 0.5;
  root.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map();
  for (const [name, clip] of clipsByName) {
    const action = mixer.clipAction(clip, root);
    if (ONE_SHOT.has(name)) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
    actions.set(name, action);
  }
  return { root, mixer, actions };
}
