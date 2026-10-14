// The wild boar, sculpted in Blender (see /blender/boar_*.py): rigid parts on a tree of joints, five coats.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import boarBin from '../assets/boar.glb';

let model = null;
const geoCache = new Map();
const mats = {};
// wild is the normal vertex colour; the rest are vec3 attributes baked by boar_color.py
export const COATS = ['wild', 'tusker', 'ginger', 'spotted', 'piglet'];

export async function loadBoarModel() {
  try {
    const buf = boarBin.buffer.slice(boarBin.byteOffset, boarBin.byteOffset + boarBin.byteLength);
    model = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  } catch (e) {
    console.warn('boar model failed to load, using the procedural one', e);
    model = null;
  }
}

function coatGeo(g, coat) {
  const key = g.uuid + coat;
  if (geoCache.has(key)) return geoCache.get(key);
  const src = coat === 'wild' ? null : g.getAttribute('_' + coat);
  let out = g;
  if (src) { out = g.clone(); out.setAttribute('color', src); }
  geoCache.set(key, out);
  return out;
}

function matFor(coat) {
  if (!mats[coat]) mats[coat] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: coat === 'spotted' || coat === 'piglet' ? 0.82 : 0.9, metalness: 0, emissive: 0x0c0705 });
  return mats[coat];
}

/** a rigged boar (feet on y = 0, facing +Z) in the given coat, or null if the model isn't loaded.
 *  Same shape as the procedural makeBoar(): {root, body, hp, legs[FN,FP,RN,RP] each with .knee}, plus jaw, ears, eyes, tusks, tail, mane */
export function makeBoarModel(coat = 'wild') {
  if (!model) return null;
  const src = model.scene.getObjectByName('bo_root');
  if (!src) return null;
  const root = src.clone(true);
  const mat = matFor(coat);
  root.traverse((o) => {
    if (o.isMesh) { o.geometry = coatGeo(o.geometry, coat); o.material = mat; o.castShadow = true; }
  });
  const get = (n) => root.getObjectByName(n);
  const body = get('bo_body');
  const legs = ['FN', 'FP', 'RN', 'RP'].map((k) => {
    const hip = get('bo_hip' + k); hip.knee = get('bo_knee' + k); hip.userData.rest = { y: hip.position.y };
    return hip;
  });
  const mane = body.children.find((c) => c.isMesh && /mane/.test(c.name)) || null;
  return {
    rigged: true, root, body, legs, mane, hp: get('bo_head'), jaw: get('bo_jaw'),
    ears: [get('bo_earN'), get('bo_earP')], eyes: [get('bo_eyeN'), get('bo_eyeP')], tusks: [get('bo_tuskN'), get('bo_tuskP')],
    tail: [get('bo_tail0'), get('bo_tail1')], bodyY: body.position.y,
  };
}
