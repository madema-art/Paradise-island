// The castaway's sculpted body, cloth, hair and beard (built in Blender, see /blender), bound to the game's joint hierarchy.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import bodyBin from '../assets/castaway.glb';
import headBin from '../assets/castaway_head.glb';

let ready = null;
export const castawayModelReady = () => ready !== null;

const parse = (bin) => new Promise((res, rej) => {
  const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  new GLTFLoader().parse(buf, '', res, rej);
});

export async function loadCastawayModel() {
  try {
    const [b, h] = await Promise.all([parse(bodyBin), parse(headBin)]);
    ready = { b, h };
  } catch (e) {
    console.warn('castaway model failed to load, using the procedural one', e);
    ready = null;
  }
}

const PARENT = {
  spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  armN: 'chest', elbowN: 'armN', handN: 'elbowN', legN: 'hips', kneeN: 'legN', footN: 'kneeN',
  armP: 'chest', elbowP: 'armP', handP: 'elbowP', legP: 'hips', kneeP: 'legP', footP: 'kneeP',
};

/** leathery, weathered skin: object-space mottling plus a fine pore/wrinkle bump that fades with distance */
function skinShader(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObj;
float h31(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float vn3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y), f.z); }
float skinH(vec3 p){ return vn3(p*64.)*0.5 + vn3(p*190.)*0.32 + vn3(p*22.)*0.18; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float n1 = vn3(vObj*9.), n2 = vn3(vObj*34.+3.), n3 = vn3(vObj*150.);
  float near = 1.0 - smoothstep(4.0, 14.0, length(vViewPosition));
  diffuseColor.rgb *= 1.0 + (n1-.5)*0.4 + (n2-.5)*0.24 + (n3-.5)*0.16*near;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.1,0.9,0.8), smoothstep(.55,.82,n1)*0.55); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float hh = skinH(vObj); float fade = 1.0 - smoothstep(3.0, 12.0, length(vViewPosition));
  vec2 dH = vec2(dFdx(hh), dFdy(hh)) * 0.55 * fade;
  vec3 sx = normalize(dFdx(-vViewPosition)), sy = normalize(dFdy(-vViewPosition));
  vec3 R1 = cross(sy, normal), R2 = cross(normal, sx);
  float det = dot(sx, R1); vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
  normal = normalize(abs(det) * normal - grad); }`);
  };
}

/** returns the same rig object makeHuman() produces, or null if the model isn't loaded */
export function buildHumanFromModel() {
  if (!ready) return null;
  const { b, h } = ready;
  let skinned = [];
  b.scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  if (!skinned.length) return null;
  const sk0 = skinned[0].skeleton;
  // joint positions straight from the bind pose
  const pos = {};
  sk0.bones.forEach((bone, i) => {
    pos[bone.name] = new THREE.Vector3().setFromMatrixPosition(sk0.boneInverses[i].clone().invert());
  });
  const root = new THREE.Group();
  const nodes = {};
  const mk = (name) => { const n = new THREE.Bone(); n.name = name; nodes[name] = n; return n; };
  mk('hips'); root.add(nodes.hips); nodes.hips.position.copy(pos.hips);
  for (const name of Object.keys(PARENT)) {
    const n = mk(name);
    nodes[PARENT[name]].add(n);
    n.position.copy(pos[name]).sub(pos[PARENT[name]]);
  }
  root.updateMatrixWorld(true);
  const bones = sk0.bones.map((bone) => nodes[bone.name]);
  const inv = bones.map((n) => n.matrixWorld.clone().invert());
  const skeleton = new THREE.Skeleton(bones, inv);

  const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, emissive: 0x1c0e07 });
  skinShader(skinMat);
  const clothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, emissive: 0x0a0806 });
  for (const m of skinned) {
    const mat = m.name === 'body' ? skinMat : clothMat;
    const sm = new THREE.SkinnedMesh(m.geometry, mat);
    sm.name = m.name;
    sm.frustumCulled = false;
    sm.castShadow = m.name !== 'fray';
    sm.receiveShadow = true;
    root.add(sm);
    sm.bind(skeleton, new THREE.Matrix4());
  }
  // hair, beard, brows and eyes ride on the head bone
  const headPos = pos.head;
  const hairG = new THREE.Group(); hairG.name = 'hairGroup';
  nodes.head.add(hairG);
  const hairMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, emissive: 0x120d04 });
  const eyeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0 });
  h.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    if (!o.userData.headLocal) {            // the shared geometry is moved into head space once, however many men are built
      g.applyMatrix4(o.matrixWorld);
      g.translate(-headPos.x, -headPos.y, -headPos.z);
      if (!g.attributes.normal) g.computeVertexNormals();
      o.userData.headLocal = true;
    }
    const isEye = o.name.startsWith('eye');
    const m = new THREE.Mesh(g, isEye ? eyeMat : hairMat);
    m.name = o.name;
    m.castShadow = o.name === 'haircap' || o.name === 'hair';
    m.frustumCulled = false;
    hairG.add(m);
  });
  const mkArm = (n) => { const a = nodes['arm' + n]; a.elbow = nodes['elbow' + n]; a.hand = nodes['hand' + n]; return a; };
  const mkLeg = (n) => { const l = nodes['leg' + n]; l.knee = nodes['knee' + n]; l.foot = nodes['foot' + n]; return l; };
  return {
    root, hips: nodes.hips, spine: nodes.spine, chest: nodes.chest, neck: nodes.neck, head: nodes.head,
    armL: mkArm('N'), armR: mkArm('P'), legL: mkLeg('N'), legR: mkLeg('P'), hair: hairG,
  };
}
