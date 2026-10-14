// The island rat, sculpted in Blender (see /blender/rat_build.py): a small rodent on a tree of joints (body pivoting at the hips, head, ears,
// a three-joint tail, four two-joint legs). Feet on y = 0, facing +Z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import ratBin from '../assets/island_rat.glb';

let model = null;
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, emissive: 0x0a0706 });

export async function loadRatModel() {
  try {
    const buf = ratBin.buffer.slice(ratBin.byteOffset, ratBin.byteOffset + ratBin.byteLength);
    model = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  } catch (e) { console.warn('island rat model failed to load', e); model = null; }
}

/** a rigged rat, or null if the model did not load */
export function makeRatModel() {
  if (!model) return null;
  const src = model.scene.getObjectByName('rt_root');
  if (!src) return null;
  const root = src.clone(true);
  root.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = true; } });
  const get = (n) => root.getObjectByName(n);
  const legs = ['FN', 'FP', 'RN', 'RP'].map((k) => { const h = get('rt_hip' + k); h.knee = get('rt_knee' + k); return h; });
  return { root, body: get('rt_body'), head: get('rt_head'), ears: [get('rt_earN'), get('rt_earP')], tail: [get('rt_tail0'), get('rt_tail1'), get('rt_tail2')], legs, bodyY: get('rt_body').position.y };
}
