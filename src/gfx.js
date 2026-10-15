import * as THREE from 'three';
import { U } from './core.js';
import { rr, rnd } from './util.js';
import { noise2 } from './noise.js';

/** Non-indexed mesh builder with vertex colours and a per-vertex wind weight. */
// a target for the parts a detail level leaves out (see vegetation_lod.js): it takes every call, so the draws stay the same, and keeps nothing
export const DRY = new Proxy({}, { get: () => () => {} });

export class MB {
  constructor() { this.pos = []; this.col = []; this.wind = []; }
  vert(p, c, w) { this.pos.push(p.x, p.y, p.z); this.col.push(c.r, c.g, c.b); this.wind.push(w); }
  tri(a, b, c, ca, cb = ca, cc = ca, wa = 0, wb = wa, wc = wa) {
    this.vert(a, ca, wa); this.vert(b, cb, wb); this.vert(c, cc, wc);
  }
  quad(a, b, c, d, col, w = 0) { this.tri(a, b, c, col, col, col, w); this.tri(a, c, d, col, col, col, w); }
  /** add a three geometry; color: Color | (v:Vector3,i)=>Color ; wind: number | (v)=>number */
  addGeo(geo, m, color, wind = 0) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const c = typeof color === 'function' ? color(v, i) : color;
      this.vert(v, c, typeof wind === 'function' ? wind(v) : wind);
    }
    g.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

export const C = (h) => new THREE.Color(h);
export function jit(c, a = 0.08) {
  const k = 1 + (rnd() - 0.5) * 2 * a;
  return new THREE.Color(c.r * k, c.g * k, c.b * k);
}
export function shade(c, k) { return new THREE.Color(c.r * k, c.g * k, c.b * k); }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function mat4(px, py, pz, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  _q.setFromEuler(new THREE.Euler(rx, ry, rz));
  return new THREE.Matrix4().compose(_p.set(px, py, pz), _q, _s.set(sx, sy, sz));
}

/** wind sway injected into a standard material (instancing aware) */
export function windify(mat, { grass = false } = {}) {
  mat.customProgramCacheKey = () => 'wind2' + (grass ? 'g' : '');
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uWindDir: U.windDir, uWindStr: U.windStr, uPh1: U.windPh1, uPh2: U.windPh2, uPh3: U.windPh3, uWet: U.wet });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aWind;
uniform vec2 uWindDir; uniform float uWindStr, uPh1, uPh2, uPh3;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.0);
          #endif
          float w = aWind * ${grass ? '0.5' : '1.0'};
          // gust fronts sweeping across the island along the wind direction
          float front = 0.5 + 0.5*sin(dot(ip.xz, uWindDir)*0.045 - uPh3 + sin(ip.x*0.013 + ip.z*0.009)*2.0);
          float gust = mix(0.6, 1.4, front*front);
          float ph = ip.x*0.11 + ip.z*0.13;
          float osc = sin(uPh1 + ph)*0.6 + sin(uPh2 + ph*1.7 + position.x*0.8 + position.z*0.6)*0.28;
          float lean = (0.16 + 0.5*uWindStr) * gust;
          vec2 push = uWindDir * (lean + osc*(0.1 + 0.28*uWindStr)*gust) * w * 0.6;
          vec2 side = vec2(-uWindDir.y, uWindDir.x) * osc * (0.06 + 0.22*uWindStr) * gust * w;
          vec3 dw = vec3(push.x + side.x, -length(push)*0.1, push.y + side.y);   // world-space displacement
          #ifdef USE_INSTANCING
            mat3 R = mat3(instanceMatrix);
            float s2 = max(dot(R[0], R[0]), 1e-4);
            transformed += (transpose(R) * dw) / s2;
          #else
            transformed += dw;
          #endif
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWet;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb *= 1.0 - 0.24*uWet;`);
  };
}

export function noiseColor(base, x, y, z, k = 0.18, f = 0.5) {
  const n = noise2(x * f + y * 0.3, z * f);
  return shade(base, 1 + n * k);
}

/** build a tube along centers with radii */
export function tube(mb, centers, radii, seg, colorFn, windFn) {
  const rings = [];
  for (let i = 0; i < centers.length; i++) {
    const a = centers[Math.max(0, i - 1)], b = centers[Math.min(centers.length - 1, i + 1)];
    const T = b.clone().sub(a).normalize();
    const U1 = new THREE.Vector3().crossVectors(T, new THREE.Vector3(0.0, 0.0, 1)).normalize();
    if (U1.lengthSq() < 0.01) U1.set(1, 0, 0);
    const V1 = new THREE.Vector3().crossVectors(T, U1).normalize();
    const ring = [];
    for (let j = 0; j < seg; j++) {
      const t = (j / seg) * Math.PI * 2;
      ring.push(centers[i].clone().addScaledVector(U1, Math.cos(t) * radii[i]).addScaledVector(V1, Math.sin(t) * radii[i]));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const c = colorFn(i);
    const w0 = windFn ? windFn(i) : 0, w1 = windFn ? windFn(i + 1) : 0;
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      const a = rings[i][j], b = rings[i][j2], cc = rings[i + 1][j2], d = rings[i + 1][j];
      mb.tri(a, d, b, c, c, c, w0, w1, w0);
      mb.tri(b, d, cc, c, c, c, w0, w1, w1);
    }
  }
}

/** lumpy leaf/rock blob */
export function lumpy(geo, amt, seed = 0) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + amt * noise2(v.x * 1.7 + seed, v.y * 1.7 + v.z * 1.3 - seed);
    v.multiplyScalar(n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/* simple material cache for animals/props (flat shaded) */
const _mc = new Map();
export function M(color, o = {}) {
  const key = color + JSON.stringify(o);
  let m = _mc.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });
    _mc.set(key, m);
  }
  return m;
}
export function mesh(geo, mat, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = false;
  return m;
}
const _gc = new Map();
const geo = (key, make) => { let g = _gc.get(key); if (!g) { g = make(); _gc.set(key, g); } return g; };
export const sphere = (r, col, sx = 1, sy = 1, sz = 1, seg = 10) => {
  const m = mesh(geo(`s${r}_${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 3))), M(col));
  m.scale.set(sx, sy, sz);
  return m;
};
export const box = (w, h, d, col) => mesh(geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d)), M(col));
export const cyl = (r1, r2, h, col, seg = 8) => mesh(geo(`c${r1}_${r2}_${h}_${seg}`, () => new THREE.CylinderGeometry(r2, r1, h, seg)), M(col));
export const cone = (r, h, col, seg = 8) => mesh(geo(`n${r}_${h}_${seg}`, () => new THREE.ConeGeometry(r, h, seg)), M(col));
