// The Pacific boa, sculpted in Blender (see /blender/boa_build.py): a chain of 32 joints (each carrying a short body piece centred on it, so it can be
// swollen to show a meal going down), a head that lifts and turns, a lower jaw that opens and a forked tongue. Facing +Z; the head joint bd_s0 is
// at the origin of root (the game moves the group, and the body trails behind along -Z).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import boaBin from '../assets/pacific_boa.glb';

let model = null;
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05, emissive: 0x070605 });
export const BOA_SEGS = 32;

export async function loadBoaModel() {
  try {
    const buf = boaBin.buffer.slice(boaBin.byteOffset, boaBin.byteOffset + boaBin.byteLength);
    model = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  } catch (e) { console.warn('pacific boa model failed to load', e); model = null; }
}

export function makeBoaModel() {
  if (!model) return null;
  const src = model.scene.getObjectByName('bd_root');
  if (!src) return null;
  const root = src.clone(true);
  root.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = true; } });
  const get = (n) => root.getObjectByName(n);
  const segs = [], pieces = [];
  for (let i = 0; i < BOA_SEGS; i++) { segs.push(get('bd_s' + i)); pieces.push(get('bd_m' + i)); }
  const rest = segs.map((s) => s.position.clone());
  const L = Math.hypot(rest[2].x, rest[2].y, rest[2].z);       // the distance between two body joints (each joint's position is relative to the one before)
  const head = get('bd_head'), headZ = segs[0].position.z;
  root.position.z = -headZ;                       // the head joint sits at the group's origin
  return { root, segs, pieces, rest, L, head, jaw: get('bd_jaw'), tongue: get('bd_tongue') };
}
