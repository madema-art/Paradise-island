// Animated Blender dolphin family. The family GLB contains five matching rigs and
// the shared 13-clip animation library; each spawned animal gets its own skeleton.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import dolphinFamilyBin from '../assets/Paradise_Island_Dolphin_Family.glb';

let family = null;
let clipsByName = new Map();
const nodeKey = (name) => name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

export const DOLPHIN_VARIANTS = {
  adultMale: 'Adult_Male_Lagoon',
  adultFemale: 'Adult_Female_WarmGrey',
  juvenile: 'Juvenile_SilverMist',
  calf: 'Calf_SlateBlue',
  adultSlate: 'Adult_Slate',
};

export const DOLPHIN_CLIPS = [
  'Swim_Idle', 'Swim_Cruise', 'Swim_Fast', 'Swim_TurnBank', 'Surface_Breath',
  'Jump_Breach', 'Dive_Return', 'Playful_Leap', 'Surface_Bob', 'Group_Follow',
  'Calf_Swim', 'Mother_Calf_Paired', 'Social_Circle',
];

export async function loadDolphinFamilyModel() {
  try {
    const buf = dolphinFamilyBin.buffer.slice(dolphinFamilyBin.byteOffset, dolphinFamilyBin.byteOffset + dolphinFamilyBin.byteLength);
    family = await new Promise((resolve, reject) => new GLTFLoader().parse(buf, '', resolve, reject));
    clipsByName = new Map(family.animations.map((clip) => [clip.name, clip]));
    const nodes = new Map();
    family.scene.traverse((object) => nodes.set(nodeKey(object.name), object));
    family.userData.dolphinRigs = new Map(Object.entries(DOLPHIN_VARIANTS).map(([key, name]) => [key, nodes.get(nodeKey(`${name} | rig`))]));
    const missing = [...family.userData.dolphinRigs].filter(([, object]) => !object).map(([key]) => key);
    if (missing.length) throw new Error(`Missing dolphin rigs: ${missing.join(', ')}`);
    return true;
  } catch (error) {
    console.warn('dolphin family failed to load; using the procedural fallback', error);
    family = null; clipsByName.clear();
    return false;
  }
}

// the family clips animate all five rigs under their own node names; keep only the tracks this rig owns, so the mixer doesn't warn about the rest
function ownedClip(clip, root) {
  const names = new Set();
  root.traverse((object) => names.add(THREE.PropertyBinding.sanitizeNodeName(object.name)));
  const tracks = clip.tracks.filter((track) => names.has(track.name.split('.')[0]));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export function makeDolphinModel(variant = 'adultMale') {
  if (!family) return null;
  const name = DOLPHIN_VARIANTS[variant] || DOLPHIN_VARIANTS.adultMale;
  const source = family.userData.dolphinRigs.get(variant) || family.userData.dolphinRigs.get('adultMale');
  if (!source) return null;
  const root = cloneSkeleton(source);
  // Blender's species sheet is exported nose toward -X; the game uses +Z forward.
  root.position.set(0, 0, 0);
  root.rotation.y = Math.PI * 0.5;
  root.userData.dolphinVariant = variant;
  root.traverse((object) => {
    if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
  });
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map();
  for (const [clipName, clip] of clipsByName) {
    const action = mixer.clipAction(ownedClip(clip, root), root);
    action.clampWhenFinished = true;
    actions.set(clipName, action);
  }
  return { root, mixer, actions, variant, modelName: name };
}
