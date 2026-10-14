import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import adultBin from '../assets/lorikeet_adult.glb';
import juvenileBin from '../assets/lorikeet_juvenile.glb';

const templates = new Map();
const ONCE = new Set(['Perch_Takeoff', 'Perch_Landing', 'Flight_GlideToFlap', 'Flight_Brake']);
export function lorikeetModelsReady() { return templates.size === 2; }
export async function loadLorikeetModels() {
  try {
    for (const [age, bin] of [['adult', adultBin], ['juvenile', juvenileBin]]) {
      const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
      const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
      templates.set(age, gltf);
    }
    return true;
  } catch (error) {
    templates.clear(); console.error('Lorikeet assets could not load', error); return false;
  }
}
export function makeLorikeetModel(age, phase = 0, rate = 1) {
  const template = templates.get(age);
  if (!template) return null;
  const root = clone(template.scene);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(root), actions = new Map();
  for (const clip of template.animations) {
    const a = mixer.clipAction(clip);
    if (ONCE.has(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    actions.set(clip.name, a);
  }
  let active = null, fading = null, fadeRemaining = 0;
  return {
    root, mixer, actions,
    play(name, fade = .12) {
      const next = actions.get(name);
      if (!next || next === active) return;
      if (fading) fading.stop();
      fading = active; fadeRemaining = fade;
      next.reset().setEffectiveTimeScale(rate).setEffectiveWeight(1).play();
      if (!ONCE.has(name)) next.time = phase * next.getClip().duration;
      if (fading && fade > 0) { next.fadeIn(fade); fading.fadeOut(fade); }
      else if (fading) { fading.stop(); fading = null; }
      active = next;
    },
    update(dt) {
      mixer.update(dt);
      if (fading && (fadeRemaining -= dt) <= 0) { fading.stop(); fading = null; }
    },
    get clip() { return active?.getClip().name; },
  };
}
