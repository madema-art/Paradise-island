// The Crystal Cave: a hidden network of halls behind Veil Falls (sculpted in Blender, see /blender/cave_build.py): a rugged rock shell with
// glowing mineral veins, stalactites, hundreds of bioluminescent crystals in eight colours, embedded gemstones, glowing moss, drips falling
// into a pool in the Heart chamber, and a drift of glimmering motes. The walkable floor is the baked grid in world.js (the cliff above is
// solid rock as far as the heightfield is concerned, and its doorway is cut out of the terrain mesh).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import caveBin from '../assets/cave.glb';
import caveData from '../assets/cave_data.json';
import { scene, U, camera, updaters, events } from './core.js';
import { CAVE, caveFloorAt } from './world.js';
import { MB, C, shade, mat4, lumpy } from './gfx.js';
import { Particles } from './particles.js';
import { flowMaterial } from './water.js';
import { fx } from './props.js';
import { mulberry32 } from './util.js';

const HUES = ['#28e6ff', '#3a8cff', '#e53cff', '#8a4dff', '#ffb23a', '#36ff9a', '#ff3a5c', '#ff8ac0'].map((h) => new THREE.Color(h));
const MOSS = ['#38ffd0', '#7dff6a', '#58b8ff'].map((h) => new THREE.Color(h));

export const cave = { ready: false, group: null, roost: [], hall: null, heart: null, mouth: null, toWorld: null, inside: () => false };

let model = null;
export async function loadCaveModel() {
  try {
    const buf = caveBin.buffer.slice(caveBin.byteOffset, caveBin.byteOffset + caveBin.byteLength);
    model = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  } catch (e) { console.warn('cave model failed to load', e); model = null; }
}

/** a standard material whose glow comes from a per-vertex or per-instance colour */
function glowMaterial(opts, { vertex = false, k = 1.2, fres = 0.7 } = {}) {
  const m = new THREE.MeshStandardMaterial(opts);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time; sh.uniforms.uK = { value: k }; sh.uniforms.uFres = { value: fres };
    if (vertex) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aGlow;\nvarying vec3 vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlow;\nuniform float uTime, uK, uFres;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vGlow * uK * (0.6 + 0.4*sin(uTime*1.1 + vViewPosition.x*0.3 + vViewPosition.z*0.2));');
    } else {
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime, uK, uFres;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0);
            float pu = 0.72 + 0.28*sin(uTime*1.3 + dot(normal, vec3(3.1, 5.3, 7.7)));
            totalEmissiveRadiance += vColor.rgb * uK * pu * (0.55 + uFres*fr*1.6);
          }`);
    }
  };
  return m;
}

export function buildCave() {
  if (!model || !CAVE.ready) return;
  const grp = new THREE.Group();
  grp.position.set(CAVE.ox, CAVE.oy, CAVE.oz);
  grp.rotation.y = CAVE.theta;
  scene.add(grp); cave.group = grp;
  const rng = mulberry32(0xc4a7e), rr = (a, b) => a + (b - a) * rng();
  // Blender (bx lateral, by depth, bz up) -> the group's frame (x, y, z = -depth)
  const L = (bx, by, bz, out = new THREE.Vector3()) => out.set(bx, bz, -by);
  const tw = new THREE.Vector3();
  cave.toWorld = (bx, by, bz, out = new THREE.Vector3()) => { L(bx, by, bz, out); grp.localToWorld(out); return out; };

  /* ---- the rock shell and the stalactites */
  const shellMat = glowMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide }, { vertex: true, k: 0.85 });
  model.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry; if (g.getAttribute('_glow')) g.setAttribute('aGlow', g.getAttribute('_glow'));
    o.material = shellMat; o.receiveShadow = true; o.castShadow = false; o.frustumCulled = false;
  });
  const shellScene = model.scene.clone(true);
  shellScene.traverse((o) => { if (o.isMesh) { o.material = shellMat; o.frustumCulled = false; } });
  grp.add(shellScene);

  /* ---- crystals */
  const prof = [new THREE.Vector2(0.0, 0), new THREE.Vector2(1.0, 0.03), new THREE.Vector2(1.0, 0.78), new THREE.Vector2(0.0, 1.0)];
  const cg = new THREE.LatheGeometry(prof, 6);
  const cm = glowMaterial({ roughness: 0.14, metalness: 0.15, flatShading: true, transparent: true, opacity: 0.93 }, { k: 0.8, fres: 0.9 });
  const cr = caveData.crystals;
  const crystals = new THREE.InstancedMesh(cg, cm, cr.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dv = new THREE.Vector3(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  const halo = new Particles(Math.max(300, cr.length), { additive: true, soft: 0.95, order: 8 });
  cr.forEach((c, i) => {
    L(c[0], c[1], c[2], pv); L(c[3], c[4], c[5], dv); dv.normalize();
    q.setFromUnitVectors(up, dv);
    pv.addScaledVector(dv, -0.04 * c[6]);                                 // sunk a little into the rock
    m4.compose(pv, q, sv.set(c[7], c[6], c[7]));
    crystals.setMatrixAt(i, m4);
    crystals.setColorAt(i, HUES[c[8]].clone().multiplyScalar(0.85 + 0.3 * rng()));
    if (c[6] > 1.3) {                                                      // a soft halo round the bigger crystals
      const h = HUES[c[8]], mid = pv.clone().addScaledVector(dv, c[6] * 0.55);
      const w = grp.localToWorld(mid.clone());
      halo.emit({ x: w.x, y: w.y, z: w.z, life: 1e9, s0: 2.0 + c[6] * 1.6, s1: 2.0 + c[6] * 1.6, c0: [h.r, h.g, h.b, 0.03], c1: [h.r, h.g, h.b, 0.03] });
    }
  });
  crystals.instanceMatrix.needsUpdate = true; crystals.instanceColor.needsUpdate = true;
  crystals.frustumCulled = false; crystals.castShadow = false;
  grp.add(crystals);

  /* ---- gemstones set into the walls */
  const gm = glowMaterial({ roughness: 0.2, metalness: 0.55, flatShading: true }, { k: 1.5, fres: 1.0 });
  const gems = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), gm, caveData.gems.length);
  caveData.gems.forEach((g, i) => {
    L(g[0], g[1], g[2], pv);
    q.setFromEuler(new THREE.Euler(g[5], g[5] * 1.7, g[5] * 0.6));
    m4.compose(pv, q, sv.set(g[3] * 1.15, g[3] * 0.85, g[3]));
    gems.setMatrixAt(i, m4); gems.setColorAt(i, HUES[g[4]].clone().multiplyScalar(1.1));
  });
  gems.frustumCulled = false; grp.add(gems);

  /* ---- glowing moss and mushrooms */
  const mg = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), caveData.moss.length);
  caveData.moss.forEach((s, i) => {
    L(s[0], s[1], s[2], pv); m4.compose(pv, q.identity(), sv.set(s[3], s[3] * 0.55, s[3]));
    mg.setMatrixAt(i, m4); mg.setColorAt(i, MOSS[s[4]].clone().multiplyScalar(0.75 + 0.5 * rng()));
  });
  mg.frustumCulled = false; grp.add(mg);

  /* ---- the pool in the Heart chamber */
  const P = caveData.pool;
  {
    const seg = 40, R = P.r + 0.5, pos = [], uv = [], idx = [];
    pos.push(0, 0, 0); uv.push(0.5, 0.5);
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; pos.push(Math.cos(a) * R, 0, Math.sin(a) * R); uv.push(0.5, 0.5); }
    for (let i = 1; i <= seg; i++) idx.push(0, i + 1, i);
    const g = new THREE.BufferGeometry();
    const nv = pos.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(new Float32Array(nv * 2), 2));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(new Float32Array(nv).fill(1.4), 1));
    g.setAttribute('aFade', new THREE.Float32BufferAttribute(new Float32Array(nv).fill(1), 1));
    g.setIndex(idx);
    const mat = flowMaterial({ body: '#4ff5ff', body2: '#1a8fb8', alpha: 0.82, edge: 0, bump: 1.2, shore: 1 });
    const pool = new THREE.Mesh(g, mat);
    L(P.x, P.y, P.z, pool.position); pool.renderOrder = 3; pool.frustumCulled = false;
    grp.add(pool);
    const gl = new THREE.Mesh(new THREE.CircleGeometry(R * 1.05, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2fdcff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    gl.position.copy(pool.position); gl.position.y -= 0.5; grp.add(gl);
  }

  /* ---- the doorway: a continuous rock lip that follows the arch cut into the cliff, so the rock meets the opening along one clean line */
  {
    const R = 2.2, edge = [];
    for (let s = 0; s <= 10; s++) edge.push(new THREE.Vector3(...L(-R, 0.3, 0.1 + 1.9 * s / 10).toArray()));          // the left jamb, up from the threshold
    for (let s = 1; s < 24; s++) { const a = Math.PI - Math.PI * s / 24; edge.push(new THREE.Vector3(...L(R * Math.cos(a), 0.3, 2.0 + R * Math.sin(a)).toArray())); }
    for (let s = 0; s <= 10; s++) edge.push(new THREE.Vector3(...L(R, 0.3, 2.0 - 1.9 * s / 10).toArray()));            // the right jamb, down to the threshold
    const curve = new THREE.CatmullRomCurve3(edge, false);
    const lipMat = new THREE.MeshStandardMaterial({ color: 0x2e2836, roughness: 0.95, flatShading: true });
    const lip = new THREE.Mesh(new THREE.TubeGeometry(curve, 140, 0.34, 6, false), lipMat);
    lip.castShadow = true; lip.receiveShadow = true; grp.add(lip);
    // a second, rougher course just inside it: the lip has thickness, and its edge reads as broken rock
    const inner = new THREE.Mesh(new THREE.TubeGeometry(curve, 140, 0.26, 5, false), new THREE.MeshStandardMaterial({ color: 0x3a3342, roughness: 0.97, flatShading: true }));
    inner.position.set(0, 0, 0.12); grp.add(inner);
  }

  /* ---- light: the hall glows cyan, the heart violet and teal, and the doorway catches a little of both */
  const mk = (c, i, d, bx, by, bz) => { const l = new THREE.PointLight(c, i, d, 2); L(bx, by, bz, l.position); grp.add(l); return l; };
  const hall = caveData.hall, heart = caveData.heart;
  const l1 = mk(0x58e6ff, 90, 30, hall.x, hall.y, hall.z - 1);
  const l2 = mk(0xc060ff, 110, 34, heart.x, heart.y, heart.z - 2);
  const l3 = mk(0x4fffcf, 50, 16, P.x, P.y, 1.5);
  const l4 = mk(0xffb040, 40, 20, 0, 6, 3);
  mk(0x7fe9ff, 28, 11, 0, 1.2, 1.6);                                  // the mouth: a little cyan light just inside the arch
  cave.lights = [l1, l2, l3, l4];

  /* ---- motes drifting in the air, and drips from the stalactites */
  const motes = new Particles(700, { additive: true, soft: 0.9, order: 8 });
  const drips = caveData.drips.map((d) => ({ x: d[0], y: d[1], z: d[2], t: rr(0, 6) }));
  const nav = caveData.nav, cells = [];
  for (let j = 0; j < nav.ny; j++) for (let i = 0; i < nav.nx; i++) if (nav.h[j * nav.nx + i] > -90) cells.push([nav.x0 + i * nav.cell, nav.y0 + j * nav.cell]);
  const center = cave.toWorld(0, 28, 3);
  const w1 = new THREE.Vector3(), w2 = new THREE.Vector3();
  let moteAcc = 0;
  updaters.push((dt, t) => {
    const near = camera.position.distanceTo(center) < 70;
    cm.needsUpdate = false;
    for (let i = 0; i < cave.lights.length; i++) cave.lights[i].intensity = [90, 110, 50, 40][i] * (0.88 + 0.12 * Math.sin(t * (1.1 + i * 0.37) + i * 2));
    if (!near) return;
    moteAcc += dt * 16;
    while (moteAcc > 1) {
      moteAcc--;
      const c = cells[Math.floor(Math.random() * cells.length)], h = HUES[Math.floor(Math.random() * 8)];
      cave.toWorld(c[0] + rr(-0.25, 0.25), c[1] + rr(-0.25, 0.25), rr(0.4, 5.5), w1);
      motes.emit({ x: w1.x, y: w1.y, z: w1.z, vx: rr(-0.08, 0.08), vy: rr(0.03, 0.18), vz: rr(-0.08, 0.08), life: rr(7, 13), s0: 0.1, s1: 0.2, c0: [h.r, h.g, h.b, 0.55], c1: [h.r, h.g, h.b, 0], drag: 0.2 });
    }
    for (const d of drips) {
      d.t -= dt;
      if (d.t > 0) continue;
      d.t = rr(2.5, 8);
      const fall = Math.max(0.4, d.z), life = Math.sqrt((2 * fall) / 9.8);
      cave.toWorld(d.x, d.y, d.z, w1);
      fx.drops.emit({ x: w1.x, y: w1.y, z: w1.z, vy: -0.2, life, s0: 0.12, s1: 0.1, c0: [0.8, 0.95, 1, 0.85], c1: [0.8, 0.95, 1, 0.5], grav: 9.8 });
      setTimeout(() => {
        cave.toWorld(d.x, d.y, 0, w2);
        const inPool = Math.hypot(d.x - P.x, d.y - P.y) < P.r;
        if (inPool) fx.plink(w2.x, w2.z, 0.9);
        if (camera.position.distanceTo(w2) < 26) events.emit('splash', w2.x, w2.y, w2.z, 0.1);
      }, life * 1000);
    }
  });

  /* ---- what the bats and the rest of the game need to know */
  cave.roost = caveData.roost.map((r) => ({ bx: r[0], by: r[1], bz: r[2], world: cave.toWorld(r[0], r[1], r[2]) }));
  cave.hall = cave.toWorld(hall.x, hall.y, hall.z); cave.heart = cave.toWorld(heart.x, heart.y, heart.z);
  cave.mouth = cave.toWorld(0, 0.5, 2.4); cave.mouthOut = cave.toWorld(0, -4.5, 3.0);
  cave.inside = (x, y, z) => { if (y > CAVE.oy + 14) return false; return caveFloorAt(x, z) != null; };
  cave.ready = true;
}
