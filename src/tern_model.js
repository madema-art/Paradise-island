// The white tern, sculpted in Blender (see /blender/tern_*.py): a slim bird on a rig of joints, two plumages (adult and juvenile).
// Returns the same shape as the procedural makeBird() so the flight code works on either.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import ternBin from '../assets/tern.glb';

let model = null;
const geoCache = new Map();
const mats = {};
const ATTR = { adult: null, juv: '_juv' };

export async function loadTernModel() {
  try {
    const buf = ternBin.buffer.slice(ternBin.byteOffset, ternBin.byteOffset + ternBin.byteLength);
    model = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  } catch (e) {
    console.warn('tern model failed to load, using the procedural one', e);
    model = null;
  }
}

function variantGeo(g, plumage) {
  const key = g.uuid + plumage;
  if (geoCache.has(key)) return geoCache.get(key);
  const src = ATTR[plumage] ? g.getAttribute(ATTR[plumage]) : null;
  let out = g;
  if (src) { out = g.clone(); out.setAttribute('color', src); }
  geoCache.set(key, out);
  return out;
}

function matFor(plumage) {
  if (!mats[plumage]) mats[plumage] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, emissive: 0x0a0a0a });
  return mats[plumage];
}

/** the tern rig (feet on y = -0.1 * scale, facing +Z), or null if the model isn't loaded */
export function makeTernModel(plumage = 'adult') {
  if (!model) return null;
  const src = model.scene.getObjectByName('tn_root');
  if (!src) return null;
  const root = src.clone(true);
  root.scale.setScalar(1.25);
  const mat = matFor(plumage);
  root.traverse((o) => {
    if (o.isMesh) { o.geometry = variantGeo(o.geometry, plumage); o.material = mat; o.castShadow = true; }
  });
  const get = (n) => root.getObjectByName(n);
  return {
    root, body: get('tn_body'), hd: get('tn_head'), tail: get('tn_tail'),
    wings: [{ sh: get('tn_wingN'), el: get('tn_handN'), sg: -1 }, { sh: get('tn_wingP'), el: get('tn_handP'), sg: 1 }],
    legs: [get('tn_legN'), get('tn_legP')],
  };
}
