// Green sea turtle: one rigged Blender model (blender/build_green_sea_turtle.py) with six clips.
// Each turtle gets its own skeleton clone and mixer; the clips are shared.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import turtleBin from '../assets/Paradise_Island_Green_Sea_Turtle.glb';

let rig = null;
let clipsByName = new Map();
const nodeKey = (name) => name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
// these play once and hold their last pose; the rest loop
const ONE_SHOT = new Set(['Breathe', 'Dash']);

export async function loadTurtleModel() {
  try {
    const buf = turtleBin.buffer.slice(turtleBin.byteOffset, turtleBin.byteOffset + turtleBin.byteLength);
    const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buf, '', resolve, reject));
    const target = nodeKey('Green sea turtle | rig');
    gltf.scene.traverse((object) => { if (!rig && nodeKey(object.name) === target) rig = object; });
    if (!rig) throw new Error('Green sea turtle rig not found in the GLB');
    clipsByName = new Map(gltf.animations.map((clip) => [clip.name, clip]));
    return true;
  } catch (error) {
    console.warn('green sea turtle model failed to load; the procedural turtle is used', error);
    rig = null; clipsByName.clear();
    return false;
  }
}

export function makeTurtleModel() {
  if (!rig) return null;
  const root = cloneSkeleton(rig);
  // the model's snout points along -X; the game's forward is +Z (as for the other sea animals)
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
