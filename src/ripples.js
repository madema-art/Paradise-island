// Water surface physics shared by every water body: where the surface is (sea with its waves and tide, streams, ponds),
// and a pool of travelling ring waves (ripples) that splashes, wakes, rain and waterfalls all feed. The ocean and the flow
// shaders read the same pool, so a splash looks the same on the sea, in the plunge pool and in a stream.
import * as THREE from 'three';
import { U, env, updaters, camera } from './core.js';
import { getHeight, riverSurface, falls, LAKE, lakeRho, SPRING } from './world.js';
import { rnd, rr, clamp, smoothstep } from './util.js';

export const MAXR = 48;

/* ================================================================ where is the water? */
/** enclosed pools: lake, plunge pool, hot spring (the sea and streams are handled separately) */
export function pondLevel(x, z) {
  if (lakeRho(x, z) < 1.08) return LAKE.y;
  const P = falls.pool;
  if (P && Math.hypot(x - P.x, z - P.z) < P.r + 1.5) return P.y;
  if (Math.hypot(x - SPRING.x, z - SPRING.z) < SPRING.r + 1.4) return SPRING.y - 0.05;
  return null;
}

/** wave height of the open sea at (x,z): the same four-octave sum the ocean vertex shader uses (without the tide) */
export function seaWave(x, z) {
  const t = U.time.value;
  let h = 0;
  for (let i = 0; i < 4; i++) {
    const a = i * 2.399 + 0.6, k = 0.09 * Math.pow(1.55, i), s = 0.07 * Math.pow(0.82, i);
    h += (s / k) * Math.sin(k * (Math.cos(a) * x + Math.sin(a) * z) + Math.sqrt(9.8 * k) * 0.9 * t + i);
  }
  const depth = clamp(-getHeight(x, z), -10, 10);
  let amp = smoothstep(0, 3.5, depth) * 0.65 + 0.05;
  amp *= 1 - smoothstep(370, 440, Math.max(Math.abs(x), Math.abs(z)));
  return h * amp * U.chop.value;
}

const _w = { y: 0, kind: null, depth: 0 };
/** water at (x,z): {kind: 'sea'|'fresh'|'hot'|null, y: surface height, depth: metres of water over the bed} (shared object, copy what you keep) */
export function waterAt(x, z, out = _w) {
  const h = getHeight(x, z);
  const rs = riverSurface(x, z);
  if (rs != null && h < rs + 0.05) { out.kind = 'fresh'; out.y = rs; out.depth = rs - h; return out; }
  const pl = pondLevel(x, z);
  if (pl != null && pl > 0.5) {
    if (h < pl - 0.05) { out.kind = Math.hypot(x - SPRING.x, z - SPRING.z) < SPRING.r + 1.6 ? 'hot' : 'fresh'; out.y = pl; out.depth = pl - h; return out; }
    out.kind = null; out.y = pl; out.depth = 0; return out;
  }
  if (h < env.tide - 0.02) { out.kind = 'sea'; out.y = env.tide + seaWave(x, z); out.depth = env.tide - h; return out; }
  out.kind = null; out.y = env.tide; out.depth = 0; return out;
}
/** surface height at (x,z) for splashes and floating things; falls back to sea level */
export function waterY(x, z) { const w = waterAt(x, z, _w); return w.kind ? w.y : env.tide; }

/* ================================================================ the ripple pool */
const rx = new Float32Array(MAXR), rz = new Float32Array(MAXR), rage = new Float32Array(MAXR), ramp = new Float32Array(MAXR);
const rspd = new Float32Array(MAXR), rwid = new Float32Array(MAXR), rlife = new Float32Array(MAXR), rfoam = new Float32Array(MAXR);
const rrain = new Uint8Array(MAXR);
let count = 0;

export const ripUniforms = {
  uRipA: { value: Array.from({ length: MAXR }, () => new THREE.Vector4(0, 0, -1, 0)) },
  uRipB: { value: Array.from({ length: MAXR }, () => new THREE.Vector4(1, 1, 1, 0)) },
  uRipN: { value: 0 },
};

/** GLSL: ripples(p) -> (slope.x, slope.z, foam); rippleH(p) -> height. Needs `vn(vec2)` for noise only in the callers. */
export const RIPPLE_GLSL = /* glsl */ `
#define MAXR ${MAXR}
uniform vec4 uRipA[MAXR];
uniform vec4 uRipB[MAXR];
uniform int uRipN;
vec3 ripples(vec2 p){
  vec3 acc = vec3(0.);
  for(int i=0;i<MAXR;i++){
    if(i>=uRipN) break;
    vec4 a=uRipA[i], b=uRipB[i];
    if(a.z<0.) continue;
    vec2 d=p-a.xy; float r2=dot(d,d);
    float R=b.x*a.z, w=b.y*(1.0+0.5*a.z);
    float reach=R+3.5*w+0.4;
    if(r2>reach*reach) continue;
    float r=sqrt(r2)+1e-4;
    float x=(r-R)/w, en=exp(-x*x);
    float life=a.z/b.z;
    float fade=(1.0-smoothstep(0.35,1.0,life))*a.w/(1.0+0.5*R);
    float k=5.5/w, ph=k*(r-R);
    float slope=en*(-sin(ph)-2.0*x/(w*k)*cos(ph));
    acc.xy += d/r*slope*fade;
    // foam: a bright crest on the ring, and a patch where it started
    float cf = en*en*(1.0-smoothstep(0.05,0.65,life));
    float disc = exp(-r2/((0.35+0.3*R)*(0.35+0.3*R)))*(1.0-smoothstep(0.1,0.9,life));
    acc.z += b.w*(0.7*cf+disc);
  }
  return acc;
}
float rippleH(vec2 p){
  float h=0.;
  for(int i=0;i<MAXR;i++){
    if(i>=uRipN) break;
    vec4 a=uRipA[i], b=uRipB[i];
    if(a.z<0.||b.y<0.5) continue;
    vec2 d=p-a.xy; float r2=dot(d,d);
    float R=b.x*a.z, w=b.y*(1.0+0.5*a.z);
    float reach=R+3.0*w;
    if(r2>reach*reach) continue;
    float r=sqrt(r2);
    float x=(r-R)/w, en=exp(-x*x);
    float life=a.z/b.z;
    float fade=(1.0-smoothstep(0.35,1.0,life))*a.w/(1.0+0.5*R);
    float k=5.5/w;
    h += en*cos(k*(r-R))*fade/k;
  }
  return h;
}
`;

/** a ring wave. amp ~ slope of the wave (0.1 plink .. 0.6 big splash); speed m/s; width m; life s; foam 0..1; delay s */
export function ripple(x, z, { amp = 0.2, speed = 1.6, width = 0.22, life = 3, foam = 0, delay = 0, rain = false, minor = false } = {}) {
  if (minor && count > 34) return;                 // droplet rings and wakes give way when the pool is busy
  // far from the camera nobody can see a ring, and the pool is small: only keep what is near enough to matter
  const cx = camera.position.x - x, cz = camera.position.z - z, reach = 60 + amp * 200;
  if (cx * cx + cz * cz > reach * reach) return;
  let i;
  if (count < MAXR) i = count++;
  else {                                     // pool full: replace the oldest (rain goes first)
    i = 0; let best = -1;
    for (let k = 0; k < MAXR; k++) { const s = rage[k] / rlife[k] + (rrain[k] ? 1 : 0); if (s > best) { best = s; i = k; } }
  }
  rx[i] = x; rz[i] = z; rage[i] = -delay; ramp[i] = amp; rspd[i] = speed; rwid[i] = width; rlife[i] = life; rfoam[i] = foam; rrain[i] = rain ? 1 : 0;
}
export const rippleCount = () => count;
/** modules that cannot import props.js (walking, the player) splash through here once fx exists */
export const hooks = { splash: null };
export const splashAt = (x, z, s, o) => { if (hooks.splash) hooks.splash(x, 0, z, s, o); };
export const clearRipples = () => { count = 0; };

/** a moving thing leaves a V-shaped wake: call each frame with its speed. `src` keeps the distance travelled. size ~ body width in metres. */
export function wake(src, x, z, speed, size = 1, dt = 0.016, foam = 0.35) {
  if (src._wx === undefined) { src._wx = x; src._wz = z; src._wd = 0; }
  const d = Math.hypot(x - src._wx, z - src._wz); src._wx = x; src._wz = z;
  src._wd += d;
  const gap = 0.55 + size * 0.8;
  if (src._wd >= gap && speed > 0.25) {
    src._wd = 0;
    const s = clamp(speed, 0.5, 9);
    ripple(x, z, { amp: 0.09 + 0.035 * size * Math.min(s, 4), speed: Math.max(0.5, s * 0.42), width: 0.12 + 0.05 * size, life: 1.6 + 0.4 * size, foam: foam * Math.min(1, s / 3), minor: true });
  }
}

/* ================================================================ upkeep: age the pool, fill the uniforms, rain, waterfalls */
const _p = new THREE.Vector3();
let fallT = 0;
function update(dt) {
  // age and drop the finished
  let n = 0;
  for (let i = 0; i < count; i++) {
    rage[i] += dt;
    if (rage[i] >= rlife[i]) continue;
    if (n !== i) {
      rx[n] = rx[i]; rz[n] = rz[i]; rage[n] = rage[i]; ramp[n] = ramp[i]; rspd[n] = rspd[i]; rwid[n] = rwid[i]; rlife[n] = rlife[i]; rfoam[n] = rfoam[i]; rrain[n] = rrain[i];
    }
    n++;
  }
  count = n;
  const A = ripUniforms.uRipA.value, B = ripUniforms.uRipB.value;
  for (let i = 0; i < count; i++) { A[i].set(rx[i], rz[i], rage[i], ramp[i]); B[i].set(rspd[i], rwid[i], rlife[i], rfoam[i]); }
  for (let i = count; i < MAXR; i++) A[i].z = -1;
  ripUniforms.uRipN.value = count;

  // rain rings on any water near the camera
  const rain = U.rain.value;
  if (rain > 0.12 && count < MAXR - 14 && !env.paused) {
    const k = rain * 24 * dt;
    for (let q = k; q > 0; q -= 1) {
      if (q < 1 && rnd() > q) break;
      const a = rnd() * Math.PI * 2, r = 2 + Math.sqrt(rnd()) * 22;
      const x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r;
      const w = waterAt(x, z);
      if (w.kind && w.depth > 0.12) ripple(x, z, { amp: 0.16, speed: 0.55, width: 0.06, life: 0.8, foam: 0.1, rain: true });
    }
  }
  // the falls hammer the plunge pool
  if (falls.landing && !env.paused) {
    fallT -= dt;
    if (fallT <= 0) {
      fallT = 0.3;
      const l = falls.landing;
      ripple(l.x + rr(-1.2, 1.2), l.z + rr(-1.2, 1.2), { amp: 0.28, speed: 1.5, width: 0.3, life: 2.6, foam: 0.55 });
    }
  }
}
export function initRipples() { updaters.push((dt) => update(Math.min(dt, 0.1))); }
