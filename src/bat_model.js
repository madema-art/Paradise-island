// The fruit bat, sculpted in Blender (see /blender/bat_build.py). One mesh with vertex colours and a second, roosting pose in the `_fold`
// attribute (wings wrapped round the body). The wing beat is done in the vertex shader from the span, so a whole colony is one draw call:
// per bat we only set a phase, an amplitude, a fold amount and a dihedral (see bats.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import batBin from '../assets/fruitbat.glb';

let baseGeo = null;

export async function loadBatModel() {
  try {
    const buf = batBin.buffer.slice(batBin.byteOffset, batBin.byteOffset + batBin.byteLength);
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
    let mesh = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    const g = mesh.geometry.clone();
    const f = g.getAttribute('_fold');
    // custom attributes are not converted by the exporter: Blender (x, y, z up) -> three (x, z, -y)
    const a = new Float32Array(f.count * 3);
    for (let i = 0; i < f.count; i++) { a[i * 3] = f.getX(i); a[i * 3 + 1] = f.getZ(i); a[i * 3 + 2] = -f.getY(i); }
    // wildlife size (docs/WILDLIFE_SCALE_RESEARCH.md): the forearm is 0.160 m in this model (blender/bat_build.py: elbow to wrist) against a
    // sourced 0.140 m (Animal Diversity Web 120-160 mm), so the whole bat scales by 0.140 x 1.5 / 0.160 = 1.3125, applied once here to
    // the shared geometry (positions, normals and the roosting pose), so the colony stays a single draw call.
    const BAT_SIZE = 1.3125;
    g.scale(BAT_SIZE, BAT_SIZE, BAT_SIZE);
    for (let i = 0; i < a.length; i++) a[i] *= BAT_SIZE;
    g.setAttribute('aFold', new THREE.BufferAttribute(a, 3));
    baseGeo = g;
  } catch (e) { console.warn('fruit bat model failed to load', e); baseGeo = null; }
}
export const batModelReady = () => !!baseGeo;

const GLSL_COMMON = `
attribute vec3 aFold;
#ifdef USE_INSTANCING
  attribute vec4 aAnim;
#else
  uniform vec4 aAnim;
#endif`;
// aAnim: x phase (radians), y beat amplitude, z fold (0 spread .. 1 wrapped), w dihedral (radians)
const GLSL_POSE = `
#include <begin_vertex>
{
  vec3 p = position;
  float sg = p.x >= 0.0 ? 1.0 : -1.0;
  float s = clamp((abs(p.x) - 0.06) / 0.58, 0.0, 1.0);
  float ph = aAnim.x, amp = aAnim.y, fold = aAnim.z, dih = aAnim.w;
  float lag = sin(ph - s*1.15)*0.92 + 0.32*s*cos(ph);                  // the tip trails the arm: the wing bends through the beat
  float flex = max(0.0, -sin(ph - 0.3)) * 0.8 * amp;                   // upstroke: the wrist flexes and the span shortens
  float al = (amp*0.95*lag + dih) * pow(s, 0.6) * sg;
  vec3 r = vec3(p.x - sg*0.06, p.y - 0.03, p.z - 0.075);               // relative to the shoulder
  r.x *= 1.0 - 0.38*flex*s;
  float ca = cos(al), sa = sin(al);
  vec3 q = vec3(r.x*ca - r.y*sa, r.x*sa + r.y*ca, r.z);
  q.z += 0.06*s*amp*cos(ph - 0.35);                                    // the tips sweep forward on the downstroke
  q.y -= 0.03*s*flex;
  vec3 pf = vec3(sg*0.06 + q.x, 0.03 + q.y, 0.075 + q.z);
  transformed = mix(pf, aFold, fold);
}`;

function patch(mat, instanced) {
  mat.customProgramCacheKey = () => 'fruitbat' + (instanced ? 'I' : 'S');
  mat.onBeforeCompile = (sh) => {
    if (!instanced) sh.uniforms.aAnim = { value: new THREE.Vector4(0.7, 0.55, 0, 0.12) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + GLSL_COMMON)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
{ vec3 fn = normalize(vec3(aFold.x, aFold.y, 0.0) + vec3(1e-4)); objectNormal = normalize(mix(objectNormal, fn, aAnim.z * step(0.065, abs(position.x)))); }`)
      .replace('#include <begin_vertex>', GLSL_POSE);
  };
  return mat;
}

/** an instanced colony of n bats (null if the model is missing). anim is the per-bat pose attribute (vec4) */
export function makeBatColony(n) {
  if (!baseGeo) return null;
  const g = baseGeo.clone();
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aAnim', anim);
  const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, emissive: 0x0a0605 }), true);
  const mesh = new THREE.InstancedMesh(g, mat, n);
  mesh.frustumCulled = false; mesh.castShadow = false;
  for (let i = 0; i < n; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
  return { mesh, anim };
}

/** a single bat for the Field Guide's viewer, wings spread in a glide */
export function batSpecimen() {
  if (!baseGeo) return null;
  const m = new THREE.Mesh(baseGeo.clone(), patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }), false));
  const root = new THREE.Group(); root.add(m); root.scale.setScalar(1.4);
  return root;
}
