// The barn owl, sculpted in Blender (see /blender/owl_build.py). Same joint layout as the tern, so the same wing flapping drives it:
// {root, body, hd, tail, wings[{sh, el, sg}], legs[hip with .knee]}. Facing +Z, body centre at the origin, feet hanging to about y = -0.19.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import owlBin from '../assets/barn_owl.glb';

let model = null;
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, emissive: 0x0a0907 });

export async function loadOwlModel() {
  try {
    const buf = owlBin.buffer.slice(owlBin.byteOffset, owlBin.byteOffset + owlBin.byteLength);
    model = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  } catch (e) { console.warn('barn owl model failed to load', e); model = null; }
}

export function makeOwlModel() {
  if (!model) return null;
  const src = model.scene.getObjectByName('ow_root');
  if (!src) return null;
  const root = src.clone(true);
  root.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = true; } });
  const get = (n) => root.getObjectByName(n);
  const legs = ['N', 'P'].map((k) => { const h = get('ow_leg' + k); h.knee = get('ow_knee' + k); return h; });
  return {
    root, body: get('ow_body'), hd: get('ow_head'), tail: get('ow_tail'), legs,
    wings: [{ sh: get('ow_wingN'), el: get('ow_handN'), sg: -1 }, { sh: get('ow_wingP'), el: get('ow_handP'), sg: 1 }],
  };
}
