// White-bellied sea eagle (Haliaeetus leucogaster), generated and rigged in Blender.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import adultBin from '../assets/sea_eagle_adult.glb';
import juvenileBin from '../assets/sea_eagle_juvenile.glb';

const library = new Map();
export const SEA_EAGLE_CLIPS = [
  'Flight_Slow_Power_Flaps', 'Flight_Soaring_Glide', 'Flight_Banked_Turn',
  'Flight_Fishing_Stooping_Dive', 'Flight_Takeoff', 'Flight_Landing_Flare',
  'Perched_Idle_Head_Scan', 'Perched_Preening',
];
async function parseAsset(bin) {
  const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  return new Promise((resolve, reject) => new GLTFLoader().parse(buf, '', resolve, reject));
}
export async function loadSeaEagleModels() {
  try {
    const [adult, juvenile] = await Promise.all([parseAsset(adultBin), parseAsset(juvenileBin)]);
    library.set('adult', adult); library.set('juvenile', juvenile);
    return true;
  } catch (error) {
    console.warn('sea eagle model failed to load; using the procedural bird fallback', error);
    library.clear(); return false;
  }
}
export function makeSeaEagleModel(age = 'adult') {
  const gltf = library.get(age) || library.get('adult');
  if (!gltf) return null;
  const root = cloneSkeleton(gltf.scene);
  // Blender's -Y forward axis exports as the game's +Z forward axis.
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map();
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip, root);
    action.clampWhenFinished = true;
    actions.set(clip.name, action);
  }
  return { root, mixer, actions, age };
}
