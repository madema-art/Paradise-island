// Humpback whale: one rigged Blender model (blender/build_humpback_whale.py) with eight clips.
// Each whale gets its own skeleton clone and mixer; the clips are shared.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import whaleBin from '../assets/Paradise_Island_Humpback_Whale.glb';

let rig = null;
let clipsByName = new Map();
const nodeKey = (name) => name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
// these play once and hold their last pose; the rest loop
const ONE_SHOT = new Set(['Surface_Blow', 'Pec_Slap', 'Dive_Fluke', 'Breach']);

export async function loadWhaleModel() {
  try {
    const buf = whaleBin.buffer.slice(whaleBin.byteOffset, whaleBin.byteOffset + whaleBin.byteLength);
    const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buf, '', resolve, reject));
    const target = nodeKey('Humpback whale | rig');
    gltf.scene.traverse((object) => { if (!rig && nodeKey(object.name) === target) rig = object; });
    if (!rig) throw new Error('Humpback whale rig not found in the GLB');
    clipsByName = new Map(gltf.animations.map((clip) => [clip.name, clip]));
    return true;
  } catch (error) {
    console.warn('humpback whale model failed to load; the procedural whale is used', error);
    rig = null; clipsByName.clear();
    return false;
  }
}

export const whaleModelReady = () => rig !== null;

export function makeWhaleModel() {
  if (!rig) return null;
  const root = cloneSkeleton(rig);
  // the model's snout points along -X; the game's forward is +Z (as for the dolphins and the shark)
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
