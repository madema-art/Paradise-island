import * as THREE from 'three';
import { tagObject } from './inspect.js';
import { scene, U, env, updaters } from './core.js';
import { SIZE, river, falls, LAKE, lakeRho, SPRING, getHeight } from './world.js';
import { lerp, smoothstep } from './util.js';
import { ripUniforms, RIPPLE_GLSL } from './ripples.js';

const NOISE = /* glsl */ `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
`;

function shared(extra) {
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  Object.assign(u, {
    uTime: U.time, uSunDir: U.sunDir, uSunColor: U.sunColor, uSkyZ: U.skyZ, uSkyH: U.skyH, uLight: U.light,
  }, ripUniforms, extra);
  return u;
}

/* ================================================================ OCEAN */
const oceanVert = /* glsl */ `
uniform float uTime, uSize, uChop;
uniform sampler2D uHeight;
varying vec3 vWorld;
#include <fog_pars_vertex>
${RIPPLE_GLSL}
float waveH(vec2 p, float t){
  float h = 0.;
  for(int i=0;i<4;i++){
    float fi=float(i);
    float a=fi*2.399+0.6; vec2 d=vec2(cos(a),sin(a));
    float k=0.09*pow(1.55,fi);
    float s=0.07*pow(0.82,fi);
    h += (s/k)*sin(k*dot(d,p)+sqrt(9.8*k)*0.9*t+fi);
  }
  return h;
}
void main(){
  vec4 wp = modelMatrix*vec4(position,1.0);
  vec2 huv = wp.xz/uSize+0.5;
  float inside = step(0.,huv.x)*step(huv.x,1.)*step(0.,huv.y)*step(huv.y,1.);
  float th = texture2D(uHeight,huv).r*16.-10.;
  float depth = mix(10., -th, inside);
  float amp = smoothstep(0.0,3.5,depth)*0.65+0.05;
  amp *= 1.0 - smoothstep(370., 440., max(abs(wp.x),abs(wp.z)));
  wp.y += waveH(wp.xz,uTime)*amp*uChop;
  wp.y += rippleH(wp.xz) * smoothstep(0.1, 1.5, depth);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix*wp;
  gl_Position = projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const oceanFrag = /* glsl */ `
uniform float uTime, uSize, uChop, uRain, uTide;
uniform sampler2D uHeight;
uniform vec3 uSunDir, uSunColor, uSkyZ, uSkyH, uLight;
varying vec3 vWorld;
#include <fog_pars_fragment>
${NOISE}
${RIPPLE_GLSL}
uniform vec4 uMouth[2];
uniform vec4 uMouthB[2];
vec2 waveGrad(vec2 p, float t){
  vec2 g=vec2(0.);
  for(int i=0;i<8;i++){
    float fi=float(i);
    float a=fi*2.399+0.6; vec2 d=vec2(cos(a),sin(a));
    float k=0.09*pow(1.55,fi);
    float s=0.07*pow(0.84,fi);
    g += d*s*cos(k*dot(d,p)+sqrt(9.8*k)*0.9*t+fi);
  }
  return g;
}
void main(){
  vec2 p = vWorld.xz;
  vec2 huv = p/uSize+0.5;
  float inside = step(0.,huv.x)*step(huv.x,1.)*step(0.,huv.y)*step(huv.y,1.);
  float th = texture2D(uHeight,huv).r*16.-10.;
  float depth = max(mix(10., uTide - th, inside), 0.0);     // the water stands uTide above mean sea level
  float farK = smoothstep(70., 420., length(cameraPosition - vWorld));       // distant water: calm the sub-pixel glints and speckles
  vec2 g = waveGrad(p,uTime) * (0.45 + 0.55*smoothstep(0.0,2.0,depth)) * (0.75 + 0.45*uChop) * (1.0 - 0.7*farK);
  g += (vec2(vn(p*6.0+uTime*3.4), vn(p*6.3-uTime*3.0+7.))-0.5)*0.55*uRain;
  g += (vec2(vn(p*1.7+uTime*0.3), vn(p*1.9-uTime*0.27+9.))-0.5)*0.05;
  vec3 rp = ripples(p);
  float rdk = smoothstep(0.02, 0.45, depth);
  g += rp.xy * 0.8 * rdk;
  vec3 N = normalize(vec3(-g.x*1.8, 1.0, -g.y*1.8));
  vec3 V = normalize(cameraPosition - vWorld);
  float vy = V.y;
  vec3 col; float alpha;
  if(!gl_FrontFacing){
    // seen from below
    vec3 tint = vec3(0.04,0.32,0.38)*uLight;
    float snell = smoothstep(0.55,0.95,abs(vy));
    col = mix(tint*0.8, uSkyH*0.8+vec3(0.1,0.25,0.3)*uLight, snell*0.6);
    col += uSunColor*pow(max(dot(reflect(-V,-N),uSunDir),0.),50.)*0.3;
    alpha = 0.78;
  } else {
    float fres = 0.025 + 0.975*pow(1.0-max(dot(N,V),0.),5.0);
    vec3 R = reflect(-V,N); R.y = abs(R.y);
    vec3 sky = mix(uSkyH, uSkyZ, pow(clamp(R.y,0.,1.),0.5));
    vec3 shallow = vec3(0.12,0.78,0.74), deepc = vec3(0.01,0.2,0.4);
    float dm = smoothstep(0.0, 10.0, depth);
    dm = dm*(0.35+0.65*dm);
    vec3 body = mix(shallow, deepc, dm) * uLight;
    // sunlight scattering through waves
    body += vec3(0.0,0.1,0.08)*uLight*pow(max(N.x*0.0+dot(N,normalize(uSunDir+vec3(0.,1.,0.))),0.),3.)*(1.-dm);
    col = mix(body, sky, fres);
    vec3 Hh = normalize(uSunDir+V);
    float nh = max(dot(N,Hh),0.);
    col += uSunColor*(pow(nh,380.)*3.2*(1.0-farK) + pow(nh,40.)*0.12 + pow(nh,14.)*0.05*farK);
    alpha = clamp(0.1 + depth*0.2, 0.0, 0.94);
    // shoreline foam
    float n1 = vn(p*0.9+vec2(uTime*0.07,0.));
    float n2 = vn(p*3.3-vec2(0.,uTime*0.1));
    float lap = 0.5+0.5*sin(uTime*0.75 + n1*6.2832);
    // shore foam is measured in metres from the waterline, whatever the slope of the bed: a thin lacy band behind the front of
    // each swash, and no sheet of white over a long flat; the swash slides up the sand and leaves it again
    float sl = clamp(texture2D(uHeight, huv).g*0.5*inside, 0.015, 1.0);
    float dist = depth / sl;
    float run = clamp(0.30/sl, 0.6, 5.0);
    float eff = dist - lap*run + (n2-0.5)*0.5;
    float swashK = smoothstep(-0.9, 0.05, eff);
    float front = smoothstep(0.45, 0.0, abs(eff - 0.05));
    float f1 = (smoothstep(1.8, 0.0, eff) * (0.25 + 0.75*n2) * 0.9 + front*0.65) * swashK;
    float f2 = smoothstep(0.06,0.0, abs(depth - (1.6+ (0.5+0.5*sin(uTime*0.6+n1*5.))*1.0)) - 0.015 - n2*0.04) * smoothstep(0.35,0.8,n2) * 0.7;
    // whitecaps
    float cap = smoothstep(0.76 - 0.12*(uChop-1.0),0.95, vn(p*0.55+vec2(uTime*0.25,uTime*0.13))*0.6 + length(g)*2.3) * 0.5 * smoothstep(3.0,8.0,depth) * (1.0 - 0.85*farK);
    float rfoam = rp.z * rdk * (0.15 + 0.85*vn(p*8.0 + uTime*vec2(0.9,-0.6))) * 0.8;
    // estuaries: fresh river water spreads out over the sea, with a mixing front where the two meet
    float plumeAcc = 0.0, plumeEdge = 0.0, plumeStreak = 0.0;
    for (int mi = 0; mi < 2; mi++) {
      vec4 M = uMouth[mi], Q = uMouthB[mi];
      vec2 dd = p - M.xy; vec2 dir = M.zw; vec2 perp = vec2(-dir.y, dir.x);
      float al = dot(dd, dir), ac = dot(dd, perp);
      float nzp = vn(p*0.11 + vec2(uTime*0.02, -uTime*0.015)) + 0.6*vn(p*0.37 - vec2(uTime*0.05, 0.));
      float wd = Q.x*(0.55 + 1.5*clamp(al/Q.y, 0., 1.5));
      float lat = abs(ac)/wd + (nzp-0.8)*0.45;
      // a river plume thins out gradually (no hard edge, no flat middle): densest at the mouth, feathering into the sea in soft, uneven tongues
      float lenK = pow(1.0 - smoothstep(0.1, 1.0, al/Q.y + (nzp-0.8)*0.45), 1.5);
      float pm = pow(1.0 - smoothstep(0.05, 1.0, lat), 1.7) * lenK * smoothstep(-3.0, 5.0, al) * Q.z;
      plumeAcc = max(plumeAcc, pm);
      plumeEdge = max(plumeEdge, smoothstep(0.1, 0.0, abs(pm/max(Q.z,0.01) - 0.2)) * smoothstep(0.0, 8.0, al));
      plumeStreak = max(plumeStreak, smoothstep(0.6, 0.95, vn(vec2(al*0.2 - uTime*0.4, ac*0.5))) * pm);
    }
    float shallowK = smoothstep(0.04, 0.6, depth);
    // fresh water over salt looks paler and milkier: a pale jade near the mouth that fades through turquoise into the blue of the sea
    vec3 freshC = mix(vec3(0.16,0.55,0.68), vec3(0.50,0.72,0.64), smoothstep(0.25, 1.0, plumeAcc));
    col = mix(col, freshC*uLight, smoothstep(0.0, 0.9, plumeAcc)*0.62);
    col += vec3(0.30,0.34,0.30)*uLight*plumeStreak*0.07;
    alpha = mix(alpha, max(alpha, 0.8*shallowK), plumeAcc*0.6);
    float foam = clamp(f1 + f2 + cap + rfoam + plumeEdge*0.1*(0.4 + 0.6*vn(p*5.0 + uTime*vec2(0.3,0.2))) * shallowK, 0., 1.);
    col = mix(col, vec3(0.97,0.99,1.0)*(uLight*0.9+uSunColor*0.1), foam*0.9);
    alpha = clamp(alpha*mix(1.0, swashK, step(dist, 7.0)) + foam, 0., 1.);
  }
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

/* ================================================================ FLOW WATER */
const flowVert = /* glsl */ `
attribute vec2 aFlow;
attribute float aDepth;
attribute float aFade;
attribute float aWidth;
varying vec3 vWorld; varying vec2 vUv; varying vec2 vFlow; varying float vDepth; varying float vFade; varying float vWidth;
#include <fog_pars_vertex>
void main(){
  vUv = uv; vFlow = aFlow; vDepth = aDepth; vFade = aFade; vWidth = aWidth;
  vec4 wp = modelMatrix*vec4(position,1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix*wp;
  gl_Position = projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const flowFrag = /* glsl */ `
uniform float uTime, uAlpha, uFoamEdge, uBump, uShore;
uniform vec3 uSunDir, uSunColor, uSkyZ, uSkyH, uLight, uBody, uBody2;
uniform vec4 uImpact;
varying vec3 vWorld; varying vec2 vUv; varying vec2 vFlow; varying float vDepth; varying float vFade; varying float vWidth;
#include <fog_pars_fragment>
${NOISE}
${RIPPLE_GLSL}
// The surface pattern is carried along the flow with a two-phase "flow map": each copy of the pattern slides downstream for one short
// cycle, and the two copies (half a cycle apart) cross-fade so the reset never shows. Scrolling the pattern by f*t outright shears it
// without limit wherever the stream speeds up or slows down, and after a few minutes it appears to crawl UPSTREAM.
const float CYC = 1.6;
float wh0(vec2 p, vec2 f, float s){
  p += vec2(sin(s*0.3),cos(s*0.27))*0.4;
  return vn(p*1.3 - f*s*0.9)*0.6 + vn(p*3.1 - f*s*1.7 + 7.)*0.3 + vn(p*7.7 - f*s*2.6)*0.1;
}
float wh(vec2 p, vec2 f, float t){
  float a = fract(t/CYC), b = fract(t/CYC + 0.5);
  float wa = 1.0 - abs(2.0*a - 1.0);
  return mix(wh0(p, f, b*CYC), wh0(p, f, a*CYC), wa);
}
float vnF(vec2 p, vec2 f, float k, float t){
  float a = fract(t/CYC), b = fract(t/CYC + 0.5);
  float wa = 1.0 - abs(2.0*a - 1.0);
  return mix(vn(p - f*k*b*CYC), vn(p - f*k*a*CYC), wa);
}
void main(){
  vec2 p = vWorld.xz; vec2 f = vFlow; float t = uTime;
  float e = 0.12;
  float h0 = wh(p,f,t), hx = wh(p+vec2(e,0.),f,t), hz = wh(p+vec2(0.,e),f,t);
  vec3 N = normalize(vec3((h0-hx)*3.0*uBump, 1.0, (h0-hz)*3.0*uBump));
  vec3 rp = ripples(p);
  float rdk = smoothstep(0.02, 0.4, vDepth);
  N = normalize(N + vec3(-rp.x*0.7, 0.0, -rp.y*0.7)*rdk);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 0.04 + 0.96*pow(1.0-max(dot(N,V),0.),5.0);
  vec3 R = reflect(-V,N); R.y=abs(R.y);
  vec3 sky = mix(uSkyH,uSkyZ,pow(clamp(R.y,0.,1.),0.5));
  float depth = max(vDepth, 0.0);
  vec3 shallowC = mix(uBody, uBody2, smoothstep(0.12, 3.2, depth));
  vec3 body = mix(shallowC*0.82, shallowC, 0.5+0.5*h0) * uLight;
  body += vec3(0.02,0.07,0.06)*uLight*(1.0-smoothstep(0.0,1.2,depth));
  vec3 col = mix(body, sky, fres*(0.55+0.45*smoothstep(0.0,0.6,depth)));
  vec3 Hh = normalize(uSunDir+V);
  col += uSunColor*pow(max(dot(N,Hh),0.),160.)*2.0;
  float edge = smoothstep(0.55,1.0,abs(vUv.x*2.-1.))*uFoamEdge;
  float streak = smoothstep(0.66,0.9,wh(p*1.6,f*1.4,t))*min(length(f)*0.4,1.0);
  // bright streaks stretched along the stream and sliding downstream: the clearest sign of which way the water runs
  float spd = length(f);
  float ac = (vUv.x - 0.5)*vWidth, al = vUv.y;
  float ca = fract(t/CYC), cb = fract(t/CYC + 0.5), cw = 1.0 - abs(2.0*ca - 1.0);
  float lnA = vn(vec2(ac*2.3, (al - spd*ca*CYC*0.8)*0.75)), lnB = vn(vec2(ac*2.3, (al - spd*cb*CYC*0.8)*0.75));
  float lines = smoothstep(0.7, 0.93, mix(lnB, lnA, cw)) * clamp(spd*0.35, 0.0, 0.8) * step(0.5, vWidth);
  float foam = edge*(0.35+0.65*vnF(p*5., f, 1.2, t)) + streak + lines*0.55;
  float di = length(p-uImpact.xy);
  foam += uImpact.z*smoothstep(uImpact.w,0.,di)*(0.55+0.45*vn(p*3.2+t*vec2(1.,-1.3)));
  float lap = 0.5+0.5*sin(t*0.9 + vn(p*1.2)*6.2832);
  float shore = (1.0 - smoothstep(0.0, 0.34 + 0.14*lap, vDepth)) * uShore * (0.35 + 0.65*vn(p*5.0 + t*0.3));
  foam += shore;
  foam += rp.z*rdk*(0.15 + 0.85*vn(p*8.0 + t*vec2(0.9,-0.6))) * 0.8;
  foam = clamp(foam,0.,1.);
  col = mix(col, vec3(1.)*(uLight*0.9+uSunColor*0.08), foam*0.8);
  float alpha = uAlpha * smoothstep(0.0, 0.3, vDepth);
  gl_FragColor = vec4(col, clamp(alpha + foam*0.5*smoothstep(-0.02,0.1,vDepth),0.,1.) * vFade);
  #include <fog_fragment>
}`;

export function flowMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: flowVert, fragmentShader: flowFrag, transparent: true, fog: true, depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: shared({
      uAlpha: { value: o.alpha ?? 0.72 }, uShore: { value: o.shore ?? 0 }, uFoamEdge: { value: o.edge ?? 1 }, uBump: { value: o.bump ?? 1 },
      uBody: { value: new THREE.Color(o.body ?? '#2fb4a8') }, uBody2: { value: new THREE.Color(o.body2 ?? '#0e6a74') },
      uImpact: { value: new THREE.Vector4(1e5, 1e5, 0, 1) },
    }),
  });
}

/** ribbon along 2D pts with explicit y; cols across. yFn lets callers hug terrain. */
export function buildRibbon(pts, widths, ys, { cols = 3, flow = 1.4, yFn = null, vScale = 1, fadeIn = 0, fadeOut = 0 } = {}) {
  const n = pts.length;
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  const fd = new Float32Array(n * cols), wdt = new Float32Array(n * cols);
  const pos = new Float32Array(n * cols * 3), uv = new Float32Array(n * cols * 2), fl = new Float32Array(n * cols * 2), dp = new Float32Array(n * cols);
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (i > 0) dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const hw = widths[i] * 0.5;
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1), s = (u - 0.5) * 2;
      const x = pts[i].x - tz * hw * s, z = pts[i].z + tx * hw * s;
      const k = i * cols + c;
      pos[k * 3] = x; pos[k * 3 + 1] = yFn ? yFn(x, z, i, u) : ys[i]; pos[k * 3 + 2] = z;
      dp[k] = pos[k * 3 + 1] - getHeight(x, z);
      const fi = fadeIn > 0 ? Math.min(1, dist / fadeIn) : 1, fo = fadeOut > 0 ? Math.min(1, (total - dist) / fadeOut) : 1;
      fd[k] = fi * fi * (3 - 2 * fi) * fo * fo * (3 - 2 * fo) * smoothstep(-0.3, 0.12, dp[k]);      // thins to nothing where the bank rises out of the water
      wdt[k] = widths[i];
      uv[k * 2] = u; uv[k * 2 + 1] = dist * vScale;
      const fsp = typeof flow === 'function' ? flow(i) : flow;
      fl[k * 2] = tx * fsp; fl[k * 2 + 1] = tz * fsp;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++)
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aFlow', new THREE.BufferAttribute(fl, 2));
  g.setAttribute('aDepth', new THREE.BufferAttribute(dp, 1));
  g.setAttribute('aFade', new THREE.BufferAttribute(fd, 1));
  g.setAttribute('aWidth', new THREE.BufferAttribute(wdt, 1));
  g.setIndex(idx);
  return g;
}

/** water body that follows the shoreline: only cells where the terrain dips below `level` get a surface */
function pondMesh(cx, cz, R, level, mat, order = 2, key = null, inside = null) {
  // a margin past the shoreline, so the fade has room: vertices past it (or outside the shape) carry no water
  const step = 0.5, Rm = R + 6, n = Math.ceil((2 * Rm) / step), st = n + 1;
  const pos = new Float32Array(st * st * 3), dep = new Float32Array(st * st), fade = new Float32Array(st * st);
  for (let j = 0; j < st; j++)
    for (let i = 0; i < st; i++) {
      const x = cx - Rm + i * step, z = cz - Rm + j * step, k = j * st + i;
      const r = Math.hypot(x - cx, z - cz), out = r > Rm || (inside && !inside(x, z));
      pos[k * 3] = x; pos[k * 3 + 1] = level; pos[k * 3 + 2] = z;
      const d = level - getHeight(x, z);
      dep[k] = out ? -1 : d;
      fade[k] = out ? 0 : smoothstep(-0.14, 0.03, d);                        // full water where the basin is well under the surface, none on the bank
    }
  const idx = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * st + i, b = a + 1, c = a + st, d = c + 1;
      if (Math.max(fade[a], fade[b], fade[c], fade[d]) > 0.0) idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
  g.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(st * st * 2), 2));
  g.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(st * st * 2).fill(0.5), 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = order; m.frustumCulled = false;
  scene.add(m); if (key) tagObject(m, key);
  return m;
}

/* ================================================================ FALLS */
const fallsVert = /* glsl */ `
varying vec2 vUv; varying vec3 vWorld;
#include <fog_pars_vertex>
void main(){
  vUv = uv;
  vec4 wp = modelMatrix*vec4(position,1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix*wp;
  gl_Position = projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const fallsFrag = /* glsl */ `
uniform float uTime, uH, uSeed, uAlphaK;
uniform vec3 uLight, uSunColor, uSkyH;
varying vec2 vUv; varying vec3 vWorld;
#include <fog_pars_fragment>
${NOISE}
void main(){
  float t = uTime + uSeed*7.0;
  float x = vUv.x + uSeed*0.37;
  float y = vUv.y*uH;
  float s1 = vn(vec2(x*16., y*0.22 - t*3.4));
  float s2 = vn(vec2(x*43., y*0.55 - t*6.6));
  float s3 = vn(vec2(x*8. + y*0.05, y*0.11 - t*2.0));
  float streak = 0.5*s1 + 0.32*s2 + 0.18*s3;
  float edge = smoothstep(0.0,0.2,vUv.x)*smoothstep(1.0,0.8,vUv.x);
  float ragged = vn(vec2(x*20.+t*0.3, y*0.3));
  edge *= smoothstep(0.05, 0.45, ragged + edge*0.8);
  float fade = smoothstep(0.0,0.02,vUv.y);
  float aer = smoothstep(0.35, 1.0, vUv.y);
  float a = edge * (0.30 + 0.62*streak) * fade * uAlphaK;
  a = mix(a, min(1.0, a*1.5 + 0.12*uAlphaK)*edge, aer*0.5);
  float lip = 1.0 - smoothstep(0.0, 0.09, vUv.y);
  vec3 c = mix(vec3(0.34,0.62,0.70), vec3(0.93,0.97,1.0), clamp(pow(streak,1.4)*0.9 + aer*0.45 + lip*0.6, 0., 1.));
  c *= uLight*0.88;
  c += uSunColor*0.08*streak;
  float foam = smoothstep(0.93, 1.0, vUv.y);
  c = mix(c, vec3(0.95,0.98,1.0)*uLight*0.9, foam*0.7);
  gl_FragColor = vec4(c, clamp(a + foam*0.3*uAlphaK, 0., 0.88));
  #include <fog_fragment>
}`;

export function buildFalls() {
  const { lip, n, pool, ledge, drop } = falls;
  const H = lip.y - pool.y;
  const reach = falls.wallT + 1.5 + 7.0;
  falls.reach = reach;
  const landing = { x: lip.x + n.x * reach, z: lip.z + n.z * reach };
  falls.landing = landing;
  const tx = -n.z, tz = n.x;
  const rows = 54, cols = 14;
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const out = reach * Math.sqrt(v) + 0.0;
    const y = lip.y - v * H + 0.2;
    const w = lerp(4.4, 8.6, Math.pow(v, 0.8));
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const s = (u - 0.5) * w;
      pos.push(lip.x + n.x * out + tx * s, y, lip.z + n.z * out + tz * s);
      uv.push(u, v);
    }
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mk = (seed, k, off) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: fallsVert, fragmentShader: fallsFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), {
        uTime: U.time, uLight: U.light, uSunColor: U.sunColor, uSkyH: U.skyH, uH: { value: H }, uSeed: { value: seed }, uAlphaK: { value: k },
      }),
    });
    const m = new THREE.Mesh(g, mat);
    m.position.set(n.x * off, 0, n.z * off);
    m.renderOrder = 3;
    m.frustumCulled = false;
    scene.add(m); tagObject(m, 'falls', { model: false });
    return m;
  };
  const front = mk(0, 1.0, 0.28);
  mk(1, 0.75, -0.22);
  return front;
}

/* ================================================================ BUILD ALL */
export function buildWater(heightTex) {
  // ocean
  // river mouths: where a stream meets the sea, its fresh water spreads out over the salt
  const mouth = (rv, width, length, strength) => {
    const P = rv.pts, n = P.length, a = P[Math.max(0, n - 5)], b = P[n - 1];
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    // the fresh water spreads out over the deeper sea, not along the beach: turn the flow toward the open water
    let sx = 0, sz = 0;
    for (let q = 0; q < 24; q++) {
      const an = (q / 24) * Math.PI * 2, px = b.x + Math.cos(an) * 28, pz = b.z + Math.sin(an) * 28, dep = -getHeight(px, pz);
      if (dep > 1.2) { sx += Math.cos(an) * Math.min(dep, 8); sz += Math.sin(an) * Math.min(dep, 8); }
    }
    const sl = Math.hypot(sx, sz);
    if (sl > 1e-3) { dx = dx * 0.35 + (sx / sl) * 0.65; dz = dz * 0.35 + (sz / sl) * 0.65; const nl = Math.hypot(dx, dz) || 1; dx /= nl; dz /= nl; }
    return [new THREE.Vector4(b.x - dx * 2, b.z - dz * 2, dx, dz), new THREE.Vector4(width, length, strength, 0)];
  };
  const mB = mouth(river.B, 9, 60, 1), mC = mouth(river.C, 10, 75, 1);
  const oceanU = shared({ uSize: { value: SIZE }, uHeight: { value: heightTex }, uChop: U.chop, uRain: U.rain, uTide: U.tide, uMouth: { value: [mB[0], mC[0]] }, uMouthB: { value: [mB[1], mC[1]] } });
  const oceanMat = new THREE.ShaderMaterial({
    vertexShader: oceanVert, fragmentShader: oceanFrag, transparent: true, side: THREE.DoubleSide, fog: true, depthWrite: false,
    uniforms: oceanU,
  });
  // deep sea floor beyond the terrain tile, so the water has no visible seam where the island heightmap ends
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x15626a }));
  bed.position.y = -33; bed.renderOrder = -1; bed.frustumCulled = false;
  scene.add(bed);
  const near = new THREE.PlaneGeometry(900, 900, 300, 300);
  near.rotateX(-Math.PI / 2);
  const nearM = new THREE.Mesh(near, oceanMat);
  nearM.renderOrder = 1; nearM.frustumCulled = false;
  scene.add(nearM);
  const shape = new THREE.Shape();
  const B = 9000, hole = 450;
  shape.moveTo(-B, -B); shape.lineTo(B, -B); shape.lineTo(B, B); shape.lineTo(-B, B); shape.closePath();
  const h = new THREE.Path();
  h.moveTo(-hole, -hole); h.lineTo(-hole, hole); h.lineTo(hole, hole); h.lineTo(hole, -hole); h.closePath();
  shape.holes.push(h);
  const far = new THREE.ShapeGeometry(shape);
  far.rotateX(-Math.PI / 2);
  const farM = new THREE.Mesh(far, oceanMat);
  farM.renderOrder = 1; farM.frustumCulled = false;
  scene.add(farM);
  // the sea surface rises and falls with the tide: the near and far sheets move together
  updaters.push(() => { nearM.position.y = farM.position.y = env.tide; });

  // rivers
  const matA = flowMaterial({ body: '#38b9a8', body2: '#0f6c70', alpha: 0.7 });
  const matB = flowMaterial({ body: '#3ac0ae', body2: '#127a78', alpha: 0.72 });
  const matC = flowMaterial({ body: '#52c8b8', body2: '#1a8088', alpha: 0.78, bump: 1.4 });
  const slopeFlow = (rv, base, k, cap, tailBoost = 0) => (i) => {
    const W = rv.W, a = W[Math.max(0, i - 3)], b = W[Math.min(W.length - 1, i + 3)];
    const toEnd = W.length - 1 - i;
    return base + Math.min(cap, ((a - b) / 4.8) * k) + (toEnd < 12 ? tailBoost * (1 - toEnd / 12) : 0);
  };
  const defs = [
    [river.A, matA, slopeFlow(river.A, 1.5, 6, 9, 3.5), { fadeIn: 6, fadeOut: 0 }],   // lake outlet speeds up toward the lip
    [river.B, matB, slopeFlow(river.B, 1.8, 8, 7, 0), { fadeIn: 4, fadeOut: 10 }],    // pool spillway -> estuary
    [river.C, matC, slopeFlow(river.C, 1.4, 6, 10, 0), { fadeIn: 7, fadeOut: 9 }],    // lake -> cascade -> sea
  ];
  for (const [rv, mat, fl, fo] of defs) {
    const ys = rv.W.map((y) => y + 0.03);
    const m = new THREE.Mesh(buildRibbon(rv.pts, rv.w.map((w) => w * 1.15), ys, { cols: 5, flow: fl, ...fo }), mat);
    m.renderOrder = 2; m.frustumCulled = false;
    scene.add(m); tagObject(m, 'stream', { model: false });
  }

  // ponds: shoreline-hugging water (lake, plunge pool, hot spring)
  const lakeMat = flowMaterial({ body: '#3ab8b0', body2: '#0b4f66', alpha: 0.9, edge: 0, bump: 0.7, shore: 1 });
  pondMesh(LAKE.x, LAKE.z, 22, LAKE.y, lakeMat, 2, 'lake', (x, z) => lakeRho(x, z) < 1.12);      // only inside the shoreline: never over the plateau's edge
  const P = falls.pool;
  const poolMat = flowMaterial({ body: '#52cdbd', body2: '#0f5f70', alpha: 0.9, edge: 0, bump: 1.3, shore: 1 });
  const landing = { x: falls.lip.x + falls.n.x * (falls.wallT + 8.5), z: falls.lip.z + falls.n.z * (falls.wallT + 8.5) };
  poolMat.uniforms.uImpact.value.set(landing.x, landing.z, 1.1, 6.0);
  pondMesh(P.x, P.z, P.r + 0.6, P.y, poolMat, 2, 'pool');
  const springMat = flowMaterial({ body: '#7ae6d6', body2: '#2a9aa0', alpha: 0.92, edge: 0, bump: 0.8, shore: 1 });
  pondMesh(SPRING.x, SPRING.z, SPRING.r + 3, SPRING.y - 0.05, springMat, 2, 'spring');

  const fallsMesh = buildFalls();
  return { oceanMat, fallsMesh, flowMaterial };
}
