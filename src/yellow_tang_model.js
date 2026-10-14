// Blender-built Zebrasoma flavescens model and swim/graze/dart clips.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import yellowTangBin from '../assets/yellow_tang.glb';

let source = null;
export const yellowTangReady = () => source !== null;
export const YELLOW_TANG_CLIPS = ['Tang_Cruise_Swim', 'Tang_Graze', 'Tang_Dart_Turn'];

export async function loadYellowTangModel() {
  try {
    const buffer = yellowTangBin.buffer.slice(yellowTangBin.byteOffset, yellowTangBin.byteOffset + yellowTangBin.byteLength);
    source = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
    return true;
  } catch (error) {
    console.warn('yellow tang model failed to load', error);
    source = null;
    return false;
  }
}

export function makeYellowTangModel() {
  if (!source) return null;
  const root = cloneSkeleton(source.scene);
  // The exported mesh is Z-up (length on X, height on Z, thickness on Y) with the belly on +Z (the pelvic fins sit there).
  // X turns +90 degrees, which stands the fish up with its belly down; then Y turns -90 degrees so the snout (+X) faces the game's forward +Z.
  root.rotation.set(Math.PI * 0.5, -Math.PI * 0.5, 0, 'YXZ');
  const tone = (Math.random() - 0.5) * 0.035;
  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = false; object.receiveShadow = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const tinted = materials.map((material) => {
        if (!material?.name?.includes('Saffron')) return material;
        const copy = material.clone(); copy.color.offsetHSL(0, 0, tone); return copy;
      });
      object.material = Array.isArray(object.material) ? tinted : tinted[0];
    }
  });
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map(source.animations.map((clip) => [clip.name, mixer.clipAction(clip, root)]));
  return { root, mixer, actions };
}
