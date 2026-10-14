// Silver gull: the adult and juvenile GLBs from blender/silver_gull (build_silver_gull.py). Each bird gets its own
// skeleton clone and mixer; the nine clips are shared. The clips are poses only: the gull's movement is in fauna_sea.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import adultBin from '../assets/Paradise_Island_Silver_Gull_Adult.glb';
import juvenileBin from '../assets/Paradise_Island_Silver_Gull_Juvenile.glb';

const templates = { adult: null, juvenile: null };
const clipsFor = { adult: new Map(), juvenile: new Map() };
// takeoff, landing, dive and the one-off poses play once and hold; everything else loops
const ONE_SHOT = new Set(['Flight_Takeoff', 'Flight_Landing_Flare', 'Flight_Shallow_Dive']);

/** The exported folded poses (perch, float, preen, the landing flare's last frame and the takeoff's first) have a right wing and
 *  hand that are not the mirror of the left. Every flying clip is already symmetric, so mirroring the left side onto the right
 *  only corrects the folded poses. Mirroring a bone's rotation across the body is (x, y, z, w) -> (x, -y, -z, w). */
function mirrorRightSide(clip) {
  const tracks = new Map(clip.tracks.map((t) => [t.name, t]));
  for (const part of ['Wing', 'Hand']) {
    const left = tracks.get(part + 'L.quaternion'), right = tracks.get(part + 'R.quaternion');
    if (!left || !right || left.values.length !== right.values.length) continue;
    for (let i = 0; i < left.values.length; i += 4) {
      right.values[i] = left.values[i];
      right.values[i + 1] = -left.values[i + 1];
      right.values[i + 2] = -left.values[i + 2];
      right.values[i + 3] = left.values[i + 3];
    }
  }
}

async function parseGlb(bin) {
  const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  return new Promise((resolve, reject) => new GLTFLoader().parse(buf, '', resolve, reject));
}

export async function loadGullModels() {
  try {
    for (const [key, bin] of [['adult', adultBin], ['juvenile', juvenileBin]]) {
      const gltf = await parseGlb(bin);
      templates[key] = gltf.scene;
      for (const clip of gltf.animations) mirrorRightSide(clip);
      clipsFor[key] = new Map(gltf.animations.map((clip) => [clip.name, clip]));
    }
    return true;
  } catch (error) {
    console.warn('silver gull models failed to load; no gulls will be shown', error);
    templates.adult = templates.juvenile = null;
    return false;
  }
}

export function gullModelsReady() {
  return !!(templates.adult && templates.juvenile);
}

/** one bird: a clone of the plumage's rig, a mixer and the nine clips. Juveniles are used for about a third of the flock. */
export function makeGullModel(variant = 'adult') {
  const template = templates[variant];
  if (!template) return null;
  const root = cloneSkeleton(template);
  root.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map();
  for (const [name, clip] of clipsFor[variant]) {
    const action = mixer.clipAction(clip, root);
    if (ONE_SHOT.has(name)) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
    actions.set(name, action);
  }
  return { root, mixer, actions };
}
