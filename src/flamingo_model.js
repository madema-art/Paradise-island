// The greater flamingo, sculpted in Blender (see /blender/flamingo_*.py): rigid parts on a tree of joints, four plumages.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import flamingoBin from '../assets/flamingo.glb';

let model = null;
const geoCache = new Map();
const mats = {};
// classic is the normal vertex colour; the rest are vec3 attributes baked by flamingo_color.py
export const PLUMAGES = ['classic', 'pale', 'vivid', 'juv'];
const ATTR = { classic: null, pale: '_pale', vivid: '_vivid', juv: '_juv' };

export async function loadFlamingoModel() {
  try {
    const buf = flamingoBin.buffer.slice(flamingoBin.byteOffset, flamingoBin.byteOffset + flamingoBin.byteLength);
    model = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  } catch (e) {
    console.warn('flamingo model failed to load, using the procedural one', e);
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
  if (!mats[plumage]) {
    mats[plumage] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, emissive: 0x140708 });
  }
  return mats[plumage];
}

/** rig of the Blender flamingo (feet on y = 0, facing +Z), or null if the model isn't loaded */
export function makeFlamingoModel(plumage = 'classic') {
  if (!model) return null;
  const src = model.scene.getObjectByName('fl_root');
  if (!src) return null;
  const root = src.clone(true);
  const mat = matFor(plumage);
  root.traverse((o) => {
    if (o.isMesh) { o.geometry = variantGeo(o.geometry, plumage); o.material = mat; o.castShadow = true; }
  });
  const get = (n) => root.getObjectByName(n);
  const pair = (fn) => [fn('N'), fn('P')];
  return {
    rigged: true, root,
    body: get('fl_body'), head: get('fl_head'), bill: get('fl_bill'), billLow: get('fl_billLow'),
    necks: [get('fl_neckA'), get('fl_neckB'), get('fl_neckC')],
    hips: pair((s) => get('fl_hip' + s)), knees: pair((s) => get('fl_knee' + s)), ankles: pair((s) => get('fl_ankle' + s)),
    wings: pair((s) => get('fl_wing' + s)),
  };
}
