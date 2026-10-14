import * as THREE from 'three';
import { scene, U, updaters } from './core.js';
import { rnd } from './util.js';

const vert = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
attribute float aSeed;
uniform float uPx;
varying vec4 vC;
varying float vSeed;
#include <fog_pars_vertex>
void main(){
  vec4 mvPosition = modelViewMatrix * vec4(position,1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = min(aSize * uPx / max(-mvPosition.z, 0.1), 700.0);
  vC = aColor; vSeed = aSeed;
  #include <fog_vertex>
}`;
const frag = /* glsl */ `
varying vec4 vC;
varying float vSeed;
uniform float uSoft;
uniform vec3 uTint;
#include <fog_pars_fragment>
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float ca = cos(vSeed*6.2831), sa = sin(vSeed*6.2831);
  p = mat2(ca,-sa,sa,ca) * p;
  float r = length(p)*2.0;
  float n = 0.5 + 0.5*sin(p.x*11.0+vSeed*40.0)*sin(p.y*10.0-vSeed*23.0);
  float a = 1.0 - smoothstep(mix(0.55,0.0,uSoft), 1.0, r*(0.8+0.3*n));
  if(a < 0.003) discard;
  gl_FragColor = vec4(vC.rgb * uTint, vC.a * a);
  #include <fog_fragment>
}`;

export class Particles {
  constructor(max, { additive = false, soft = 0.6, lit = false, depthTest = true, order = 5, wind = 0 } = {}) {
    this.windK = wind;
    this.max = max;
    this.cursor = 0;
    const f = (n) => new Float32Array(max * n);
    this.p = f(3); this.v = f(3);
    this.age = f(1); this.life = f(1).fill(1); this.age.fill(1e9);
    this.s0 = f(1); this.s1 = f(1);
    this.c0 = f(4); this.c1 = f(4);
    this.drag = f(1); this.grav = f(1); this.rise = f(1);
    this.aColor = f(4); this.aSize = f(1); this.aSeed = f(1);
    for (let i = 0; i < max; i++) this.aSeed[i] = rnd();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.aColor, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.aSeed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = g;
    this.tint = lit ? U.light.value : new THREE.Color(1, 1, 1);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, depthTest,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    });
    Object.assign(this.mat.uniforms, { uPx: U.pxScale, uSoft: { value: soft }, uTint: { value: this.tint } });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = order;
    scene.add(this.points);
    updaters.push((dt) => this.update(dt));
  }

  /** o: {x,y,z, vx,vy,vz, life, s0,s1, c0:[r,g,b,a], c1:[r,g,b,a], drag, grav, rise} */
  emit(o) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.max;
    const k = i * 3;
    this.p[k] = o.x; this.p[k + 1] = o.y; this.p[k + 2] = o.z;
    this.v[k] = o.vx || 0; this.v[k + 1] = o.vy || 0; this.v[k + 2] = o.vz || 0;
    this.age[i] = 0; this.life[i] = o.life || 1;
    this.s0[i] = o.s0 ?? 1; this.s1[i] = o.s1 ?? o.s0 ?? 1;
    const a = o.c0 || [1, 1, 1, 1], b = o.c1 || a;
    for (let q = 0; q < 4; q++) { this.c0[i * 4 + q] = a[q]; this.c1[i * 4 + q] = b[q]; }
    this.drag[i] = o.drag ?? 0; this.grav[i] = o.grav ?? 0; this.rise[i] = o.rise ?? 0;
    return i;
  }

  update(dt) {
    const { p, v, age, life, max } = this;
    for (let i = 0; i < max; i++) {
      const a = age[i];
      if (a >= life[i]) { this.aSize[i] = 0; continue; }
      age[i] = a + dt;
      const t = (a + dt) / life[i];
      const k = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      if (this.windK) { const wk = 1 - Math.exp(-this.windK * dt); v[k] += (U.windVel.value.x - v[k]) * wk; v[k + 2] += (U.windVel.value.z - v[k + 2]) * wk; }
      v[k] *= dr; v[k + 1] = v[k + 1] * dr - this.grav[i] * dt + this.rise[i] * dt; v[k + 2] *= dr;
      p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
      const q = i * 4;
      for (let c = 0; c < 4; c++) this.aColor[q + c] = this.c0[q + c] + (this.c1[q + c] - this.c0[q + c]) * t;
      this.aSize[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}
