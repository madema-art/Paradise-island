// The shore crab, sculpted in Blender (see /blender/crab_*.py): rigid parts on a tree of joints, four colour sets for four species.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import crabBin from '../assets/crab.glb';

let model = null;
const geoCache = new Map();
const mats = {};
export const VARIANTS = ['red', 'ghost', 'coconut', 'hermit'];

export async function loadCrabModel() {
  try {
    const buf = crabBin.buffer.slice(crabBin.byteOffset, crabBin.byteOffset + crabBin.byteLength);
    model = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  } catch (e) {
    console.warn('crab model failed to load, using the procedural one', e);
    model = null;
  }
}

function variantGeo(g, variant) {
  const key = g.uuid + variant;
  if (geoCache.has(key)) return geoCache.get(key);
  const src = variant === 'red' ? null : g.getAttribute('_' + variant);
  let out = g;
  if (src) { out = g.clone(); out.setAttribute('color', src); }
  geoCache.set(key, out);
  return out;
}

function matFor(variant) {
  if (!mats[variant]) {
    mats[variant] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: variant === 'ghost' ? 0.8 : 0.5, metalness: 0.04, emissive: 0x120804, flatShading: false });
  }
  return mats[variant];
}

/** same shape of result as the procedural makeCrab(), plus pincers and a hermit shell; null if the model isn't loaded */
export function makeCrabModel(variant = 'red') {
  if (!model) return null;
  const src = model.scene.getObjectByName('body');
  if (!src) return null;
  const body = src.clone(true);
  body.position.set(0, 0.17, 0);
  body.rotation.set(0, 0, 0);
  const mat = matFor(variant);
  body.traverse((o) => {
    if (o.isMesh) { o.geometry = variantGeo(o.geometry, variant); o.material = mat; o.castShadow = true; }
  });
  const root = new THREE.Group(); root.add(body);
  const get = (n) => body.getObjectByName(n);
  const legs = [];
  for (const nm of ['N', 'P']) for (let k = 0; k < 4; k++) { const l = get(`leg${nm}${k}`); l.userData.side = nm === 'P' ? 1 : -1; l.userData.k = k; legs.push(l); }
  const claws = [get('clawN'), get('clawP')];
  const pincers = [get('pincerN'), get('pincerP')];
  const shell = get('shell');
  if (shell) shell.visible = variant === 'hermit';
  return { root, body, legs, claws, pincers, shell };
}
