import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import maleBin from '../assets/great_frigatebird_male.glb';
import femaleBin from '../assets/great_frigatebird_female.glb';
import juvenileBin from '../assets/great_frigatebird_juvenile.glb';

const library = new Map();
export const frigatebirdModelsReady = () => library.size === 3;
export async function loadFrigatebirdModels() {
  const parse = bin => new GLTFLoader().parseAsync(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), '');
  try {
    const assets = await Promise.all([maleBin, femaleBin, juvenileBin].map(parse));
    ['male', 'female', 'juvenile'].forEach((key, i) => library.set(key, assets[i]));
    return true;
  } catch (error) { console.error('Great frigatebird assets failed to load', error); library.clear(); return false; }
}
export function makeFrigatebirdModel(variant = 'male', phase = 0) {
  const asset = library.get(variant); if (!asset) return null;
  const root = clone(asset.scene), mixer = new THREE.AnimationMixer(root), actions = new Map();
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  asset.animations.forEach(clip => actions.set(clip.name, mixer.clipAction(clip)));
  const retiring = [];
  return { root, mixer, actions, variant, billTip: root.getObjectByName('BillTip'), clip: '',
    play(name, fade = .45, once = false) {
      if (name === this.clip || !actions.has(name)) return;
      const next = actions.get(name), old = actions.get(this.clip);
      // An action that is selected again must not be stopped by an old fade retirement.
      for (let i = retiring.length - 1; i >= 0; i--) if (retiring[i].action === next) retiring.splice(i, 1);
      next.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      next.clampWhenFinished = once; next.time = once ? 0 : phase % next.getClip().duration;
      next.setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play();
      if (old) { old.fadeOut(fade); retiring.push({ action: old, remaining: fade }); }
      this.clip = name;
    },
    update(dt) {
      mixer.update(dt);
      for (let i = retiring.length - 1; i >= 0; i--) {
        retiring[i].remaining -= dt;
        if (retiring[i].remaining <= 0) { retiring[i].action.stop(); retiring.splice(i, 1); }
      }
    },
  };
}
