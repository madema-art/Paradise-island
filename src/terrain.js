import * as THREE from 'three';
import { scene, U } from './core.js';
import { grid, N, SEG, SIZE, HALF, CELL, VOL, TEMPLE, SPRING, FAIRY, LAKE, lakeRho, falls, getHeight, getSlope, lavaDist, riverDist, riverNear, caveHole, ascentDist, ASCENT } from './world.js';
import { noise2, fbm } from './noise.js';
import { clamp, lerp, smoothstep } from './util.js';

const col = (h) => new THREE.Color(h);
const K = {
  sandDry: col('#ecdcab'), sandWet: col('#b8a478'), sandUnder: col('#d6c598'), deep: col('#2a6f7f'), abyss: col('#0e3a5c'),
  grassL: col('#6aa83a'), grassD: col('#35742a'), jungle: col('#25581e'), soil: col('#6d5438'), moss: col('#4f8f3a'),
  rock: col('#9a9285'), rockD: col('#625b52'), basalt: col('#2e2a28'), ash: col('#5a544e'), lavaRock: col('#1a1717'),
  red: col('#6b3a2b'), mud: col('#5b5240'), pave: col('#7d7b68'), crust: col('#ddd5a4'),
  scoria: col('#8a3b22'), ashPale: col('#a39a8d'), sulphur: col('#d9c04a'),
  basaltDark: col('#1f1c1b'), trail: col('#8c8478'), talus: col('#6d665e'),
};
const tmp = new THREE.Color(), tmp2 = new THREE.Color();

function tint(x, z, h, slope, out) {
  const n1 = noise2(x * 0.045, z * 0.045), n2 = noise2(x * 0.17 + 5, z * 0.17), n3 = fbm(x * 0.012 + 40, z * 0.012, 3);
  // underwater / beach
  if (h < 0.35) {
    const depth = Math.max(0, -h);
    out.copy(K.sandUnder).lerp(K.deep, smoothstep(0.4, 9, depth)).lerp(K.abyss, smoothstep(8, 28, depth));
    out.lerp(K.sandWet, smoothstep(0.35, 0, h) * 0.5);
  } else {
    const wet = smoothstep(1.6, 0.35, h);
    out.copy(K.sandDry).lerp(K.sandWet, wet * 0.75);
    out.multiplyScalar(0.94 + 0.08 * n2);
    const gt = smoothstep(2.3, 4.6, h + n1 * 1.4);
    if (gt > 0) {
      tmp.copy(K.grassD).lerp(K.grassL, clamp(0.5 + 0.9 * n1 + 0.4 * n2, 0, 1));
      tmp.lerp(K.jungle, smoothstep(-0.05, 0.4, n3) * 0.75);
      if (n2 > 0.35) tmp.lerp(K.soil, 0.35);
      out.lerp(tmp, gt);
    }
  }
  // plateau moss
  if (h > 20 && h < 36) out.lerp(K.moss, 0.25 * smoothstep(20, 26, h));
  // volcano
  const vr = Math.hypot(x - VOL.x, z - VOL.z);
  if (vr < VOL.R + 12) {
    const vegLimit = 30 + 14 * n3 + 4 * n1;
    const bare = smoothstep(vegLimit - 8, vegLimit + 10, h) * smoothstep(VOL.R + 12, VOL.R - 10, vr);
    tmp.copy(K.ash).lerp(K.basalt, clamp(0.5 + 0.9 * n2, 0, 1)).lerp(K.red, smoothstep(0.1, 0.5, noise2(x * 0.08, z * 0.08)) * 0.45);
    if (h > 88) tmp.lerp(K.lavaRock, smoothstep(88, 98, h) * 0.6);
    out.lerp(tmp, bare);
  }
  // the upper cone of the volcano: layered flows in broad bands round the cone, darker gullies, ash on the ledges, sulphur round the mouth
  if (vr < VOL.R + 6 && h > 42) {
    const up = smoothstep(42, 62, h), ang = Math.atan2(z - VOL.z, x - VOL.x);
    const layer = 0.5 + 0.5 * Math.sin(h * 0.42 + noise2(ang * 2.0 + 1, h * 0.03) * 3.0);
    const gully = smoothstep(-0.25, 0.55, noise2(ang * 3.0 + 3, vr * 0.006));
    tmp.copy(K.basalt).lerp(K.scoria, layer * 0.42);
    tmp.lerp(K.basaltDark, gully * 0.55);
    tmp.lerp(K.ashPale, smoothstep(0.3, 0.9, noise2(x * 0.05, z * 0.05)) * 0.26);
    out.lerp(tmp, up * 0.95);
    out.lerp(K.sulphur, smoothstep(30, 16, vr) * smoothstep(0.1, 0.6, noise2(x * 0.22 + 3, z * 0.22 - 1)) * 0.6 * up);
    if (h > 96) out.lerp(K.ashPale, smoothstep(96, 114, h) * 0.45);
  }
  // the scree at the foot of the cone: grey talus, from the bare ground up to the jungle line
  if (vr < VOL.R + 12 && h > 4 && h < 40) out.lerp(K.talus, smoothstep(4, 9, h) * smoothstep(40, 26, h) * 0.45 * smoothstep(VOL.R + 8, VOL.R - 6, vr));
  // rock on slopes
  const rock = smoothstep(0.2, 0.5, slope + 0.07 * n2);
  if (rock > 0 && h > 0.5) {
    tmp.copy(K.rock).lerp(K.rockD, clamp(0.5 + 0.4 * Math.sin(h * 0.8 + n1 * 5) + 0.3 * n2, 0, 1));
    if (vr < VOL.R) tmp.lerp(K.basalt, 0.6);
    out.lerp(tmp, rock);
  }
  // the footpath: trodden earth on the tread, a lighter edge either side
  if (ASCENT.index && vr < ASCENT.rBase + 6) {
    const pd = ascentDist(x, z);
    if (pd < 3.2) out.lerp(K.trail, smoothstep(3.2, 0.9, pd) * 0.85);
  }
  // lava channels -> cooled crust
  const ld = lavaDist(x, z);
  if (ld < 7) out.lerp(K.lavaRock, smoothstep(7, 2, ld) * 0.9);
  // river banks
  if (h > -0.3) {
    const rd = riverDist(x, z);
    if (rd < 6) out.lerp(K.mud, smoothstep(6, 1.8, rd) * 0.55);
  }
  // lake rim
  const lr = lakeRho(x, z);
  if (lr < 1.18 && lr > 0.7) out.lerp(K.mud, smoothstep(1.18, 0.88, lr) * 0.4);
  // pond beds: sandy / muddy and darker with depth
  {
    let lvl = -9;
    const P = falls.pool;
    if (lr < 1.1) lvl = LAKE.y;
    else if (Math.hypot(x - P.x, z - P.z) < P.r + 2) lvl = P.y;
    else if (Math.hypot(x - SPRING.x, z - SPRING.z) < SPRING.r + 1.5) lvl = SPRING.y - 0.05;
    if (lvl > 0.5 && h < lvl + 0.15) {
      const dep = Math.max(0, lvl - h);
      tmp.copy(K.sandUnder).lerp(K.mud, smoothstep(0.1, 1.4, dep)).lerp(K.abyss, smoothstep(1.5, 4.5, dep) * 0.7);
      out.lerp(tmp, smoothstep(-0.15, 0.2, lvl - h));
    }
  }
  // temple pavers
  const tr = Math.hypot(x - TEMPLE.x, z - TEMPLE.z);
  if (tr < 17) out.lerp(K.pave, smoothstep(17, 8, tr) * 0.55 * (0.7 + 0.5 * n2));
  // hot spring minerals
  const sr = Math.hypot(x - SPRING.x, z - SPRING.z);
  if (sr < 10) out.lerp(K.crust, smoothstep(10, 4, sr) * 0.7);
  // fairy ring: rich moss
  const fr = Math.hypot(x - FAIRY.x, z - FAIRY.z);
  if (fr < 14) out.lerp(K.moss, smoothstep(14, 6, fr) * 0.6);
  // fine variation
  const v = 0.9 + 0.2 * (0.5 + 0.5 * noise2(x * 0.35 + 9, z * 0.35 - 3));
  out.multiplyScalar(v);
  return out;
}

const NOISE_GLSL = /* glsl */ `
float th21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float tvn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(th21(i),th21(i+vec2(1,0)),f.x),mix(th21(i+vec2(0,1)),th21(i+vec2(1,1)),f.x),f.y); }
`;

export function buildTerrain() {
  const pos = new Float32Array(N * N * 3);
  const colr = new Float32Array(N * N * 3);
  const bank = new Float32Array(N * N);                   // how wet each vertex is from a nearby stream
  const idx = new Uint32Array(SEG * SEG * 6);
  const c = new THREE.Color();
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = -HALF + i * CELL, z = -HALF + j * CELL, h = grid[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = pos[k * 3], z = pos[k * 3 + 2], h = pos[k * 3 + 1];
      const slope = getSlope(x, z);
      tint(x, z, h, slope, c);
      colr[k * 3] = c.r; colr[k * 3 + 1] = c.g; colr[k * 3 + 2] = c.b;
      if (h > 0.3) { const rn = riverNear(x, z); if (rn && rn.d < rn.w * 2.4) bank[k] = smoothstep(rn.y + 0.7, rn.y - 0.05, h) * smoothstep(rn.w * 2.4, rn.w * 0.7, rn.d); }
    }
  }
  let t = 0;
  for (let j = 0; j < SEG; j++)
    for (let i = 0; i < SEG; i++) {
      const a = j * N + i, b = a + 1, cc = a + N, d = cc + 1;
      // the doorway into the Crystal Cave is left open in the cliff face
      const hole = (p, q, r) => caveHole((pos[p * 3] + pos[q * 3] + pos[r * 3]) / 3, (pos[p * 3 + 1] + pos[q * 3 + 1] + pos[r * 3 + 1]) / 3, (pos[p * 3 + 2] + pos[q * 3 + 2] + pos[r * 3 + 2]) / 3);
      if (!hole(a, cc, b)) { idx[t++] = a; idx[t++] = cc; idx[t++] = b; }
      if (!hole(b, cc, d)) { idx[t++] = b; idx[t++] = cc; idx[t++] = d; }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  geo.setAttribute('aBank', new THREE.BufferAttribute(bank, 1));
  geo.setIndex(new THREE.BufferAttribute(idx.slice(0, t), 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  // double-sided: from inside the cliff (the grotto) the underside of the terrain shows as solid rock instead of vanishing, so no gap in the cave shell ever shows the world above
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
  mat.shadowSide = THREE.BackSide;                    // shadows are cast exactly as they were
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.uniforms.uLightT = { value: U.light.value };
    sh.uniforms.uWetT = U.wet;
    sh.uniforms.uTideT = U.tide;
    sh.uniforms.uVolI = U.volGlow;
    sh.uniforms.uVolC = { value: new THREE.Vector2(VOL.x, VOL.z) };
    sh.uniforms.uPond = { value: [new THREE.Vector4(LAKE.x, LAKE.z, 17, LAKE.y), new THREE.Vector4(falls.pool.x, falls.pool.z, falls.pool.r + 4, falls.pool.y), new THREE.Vector4(SPRING.x, SPRING.z, SPRING.r + 5, SPRING.y - 0.05)] };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nattribute float aBank;\nvarying float vBank;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;\nvBank = aBank;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying float vBank;\nuniform float uTime;\nuniform float uWetT;\nuniform float uTideT;\nuniform float uVolI;\nuniform vec2 uVolC;\nuniform vec4 uPond[3];\nuniform vec3 uLightT;\n' + NOISE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float gn = tvn(vWP.xz*1.7)*0.5 + tvn(vWP.xz*5.3)*0.3 + tvn(vWP.xz*14.0)*0.2;
        diffuseColor.rgb *= (0.82 + 0.36*gn) * (1.0 - 0.3*uWetT);
        // where the sea, ponds and streams meet the ground: damp sand behind the swash, a wet shine where the last wave reached,
        // lace foam left on the sand as the water slides back, wet banks along the streams and pools
        float wetNow = 0.0, wetAll = 0.0, laceM = 0.0, retreat = 0.0;
        {
          float nA = tvn(vWP.xz*0.9 + vec2(uTime*0.07, 0.0));
          float phs = uTime*0.75 + nA*6.2832;
          float reach = uTideT + 0.30*(0.5+0.5*sin(phs));
          float over = vWP.y - reach;
          float beach = smoothstep(2.6, 1.3, vWP.y) * smoothstep(-1.0, -0.15, vWP.y);
          wetNow = smoothstep(0.10, -0.08, over) * beach;
          float damp = smoothstep(0.75, 0.0, vWP.y - uTideT) * 0.7 * beach;
          wetAll = max(wetNow, damp);
          retreat = smoothstep(0.05, -0.7, cos(phs));
          float edge = abs(over + 0.015 + 0.035*(tvn(vWP.xz*6.5) - 0.5));
          laceM = smoothstep(0.075, 0.0, edge) * smoothstep(0.3, 0.7, tvn(vWP.xz*4.2 + uTime*0.12)) * beach;
          for (int pi = 0; pi < 3; pi++) {
            vec4 pd = uPond[pi]; float pr = length(vWP.xz - pd.xy);
            float inR = 1.0 - smoothstep(pd.z - 2.0, pd.z + 3.0, pr);
            float pw = smoothstep(pd.w + 0.5, pd.w - 0.02, vWP.y) * inR * step(0.5, pd.w);
            wetAll = max(wetAll, pw * 0.85);
            wetNow = max(wetNow, smoothstep(pd.w + 0.1, pd.w - 0.06, vWP.y) * inR * step(0.5, pd.w));
          }
          wetAll = max(wetAll, vBank * 0.8);
          wetNow = max(wetNow, vBank * smoothstep(0.55, 0.9, vBank));
        }
        diffuseColor.rgb *= 1.0 - 0.34*wetAll;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97,0.99,0.98), laceM*retreat*0.75);
        if (vWP.y < 0.4) {
          vec2 cp = vWP.xz*0.5;
          float c1 = tvn(cp + vec2(uTime*0.30, uTime*0.18));
          float c2 = tvn(cp*1.25 - vec2(uTime*0.22, -uTime*0.27));
          float caus = smoothstep(0.80, 1.0, 1.0 - abs(c1-c2)*2.4);
          float dm = smoothstep(0.4, -0.5, vWP.y) * smoothstep(-9.0, -1.0, vWP.y);
          diffuseColor.rgb += vec3(0.5,0.9,0.9) * caus * dm * 0.45 * uLightT.g;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor *= (1.0 - 0.4*uWetT) * (1.0 - 0.55*wetNow);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float e = 0.35;
          float n0 = tvn(vWP.xz*3.1), nx = tvn(vWP.xz*3.1+vec2(e,0.)), nz = tvn(vWP.xz*3.1+vec2(0.,e));
          vec3 pert = vec3(n0-nx, 0.0, n0-nz) * 0.9;
          normal = normalize(normal + (viewMatrix * vec4(pert,0.0)).xyz);
        }`);
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);

  // heightmap texture for water depth (covers the terrain extent)
  // R: height (-10..6 m) for the water depth; G: how steeply the bed falls (0..0.5), so the shore foam can keep a constant width in metres
  const R = 512, data = new Uint8Array(R * R * 2);
  for (let j = 0; j < R; j++)
    for (let i = 0; i < R; i++) {
      const x = ((i + 0.5) / R - 0.5) * SIZE, z = ((j + 0.5) / R - 0.5) * SIZE, k = (j * R + i) * 2;
      data[k] = Math.round(clamp((getHeight(x, z) + 10) / 16, 0, 1) * 255);
      const gx = (getHeight(x + 1.2, z) - getHeight(x - 1.2, z)) / 2.4, gz = (getHeight(x, z + 1.2) - getHeight(x, z - 1.2)) / 2.4;
      data[k + 1] = Math.round(clamp(Math.hypot(gx, gz) / 0.5, 0, 1) * 255);
    }
  const tex = new THREE.DataTexture(data, R, R, THREE.RGFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { mesh, heightTex: tex };
}
