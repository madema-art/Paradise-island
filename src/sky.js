import * as THREE from 'three';
import { scene, camera, U, env, updaters } from './core.js';
import { smoothstep } from './util.js';

const vert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position,1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const frag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSun, uMoon, uZenith, uHorizon, uSunColor, uCloudLit, uCloudDark;
uniform float uTime, uNight, uDay, uCover, uStorm, uFlash, uTw, uAM, uGlow;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+17.1; a*=.5;} return s; }
// twilight colour ramp by elevation: gold at the horizon, then orange, rose, violet, indigo
vec3 twRamp(float y, float am){
  vec3 gold = mix(vec3(1.0,0.46,0.08), vec3(1.0,0.58,0.22), am);
  vec3 orange = mix(vec3(1.0,0.14,0.015), vec3(1.0,0.26,0.07), am);
  vec3 rose = mix(vec3(0.62,0.035,0.17), vec3(0.85,0.12,0.28), am);
  vec3 violet = mix(vec3(0.17,0.05,0.38), vec3(0.28,0.12,0.5), am);
  vec3 indigo = vec3(0.04,0.04,0.2);
  vec3 c = mix(gold, orange, smoothstep(0.0, 0.07, y));
  c = mix(c, rose, smoothstep(0.06, 0.2, y));
  c = mix(c, violet, smoothstep(0.18, 0.42, y));
  return mix(c, indigo, smoothstep(0.4, 0.9, y));
}
void main(){
  vec3 d = normalize(vDir);
  vec2 hs = normalize(uSun.xz + 1e-4), hd = normalize(d.xz + 1e-4);
  float az = dot(hs, hd);                       // +1 toward the sun, -1 away from it
  float sunSide = pow(max(az, 0.), 1.6);
  float wide = 0.3 + 0.7 * pow(max(az * 0.5 + 0.5, 0.), 2.);
  float y = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(y,0.,1.), 0.48));
  col = mix(col, uHorizon*0.8, smoothstep(0.,-0.25, y));
  // sunrise / sunset glory: a banded fire-sky on the sun side, belt of Venus and earth-shadow opposite
  float yy = max(y, 0.);
  vec3 tr = twRamp(yy, uAM);
  float reach = smoothstep(0.85, 0.0, yy);
  col = mix(col, tr, clamp(uTw * wide * reach * 1.0, 0., 1.));
  col += tr * uTw * sunSide * exp(-yy * 8.) * 0.38;
  float opp = max(-az, 0.);
  col = mix(col, vec3(0.30,0.24,0.50), uTw * opp * smoothstep(0.045, 0.0, yy) * 0.7);
  col += vec3(1.0,0.58,0.66) * uTw * opp * exp(-pow((yy - 0.1) / 0.07, 2.)) * 0.45;
  // sun (swells and reddens as it nears the horizon)
  float sd = max(dot(d,uSun),0.);
  float veil = 1.0 - 0.88*smoothstep(0.45, 1.0, uCover);
  col += uSunColor*(pow(sd,mix(900.,500.,uTw))*mix(14.,6.,uTw) + pow(sd,40.)*mix(0.5,0.3,uTw) + pow(sd,6.)*mix(0.18,0.1,uTw) + pow(sd,2.)*0.05*uTw)*veil*uGlow;
  // light shafts fanning from the low sun
  vec3 sxv = normalize(cross(vec3(0.,1.,0.), uSun)), syv = cross(uSun, sxv);
  float ang = atan(dot(d,syv), dot(d,sxv));
  float rays = (0.5+0.5*sin(ang*19.+uTime*0.04)) * (0.5+0.5*sin(ang*7.-uTime*0.025+1.3)) * (0.6+0.4*sin(ang*41.+2.));
  float rayAmt = pow(sd, 4.) * uTw * smoothstep(-0.02, 0.12, y) * veil;
  // moon
  float md = max(dot(d,uMoon),0.);
  col += vec3(0.8,0.88,1.0)*(smoothstep(0.9993,0.9996,md)*1.6 + pow(md,60.)*0.12)*uNight;
  // stars
  if(uNight>0.01 && y>0.){
    vec3 sp = d*220.;
    vec3 ip = floor(sp);
    float r = fract(sin(dot(ip,vec3(12.9898,78.233,37.719)))*43758.5453);
    float tw = 0.7+0.3*sin(uTime*2.+r*60.);
    float star = step(0.9925, r) * smoothstep(0.7,0.,length(fract(sp)-.5)) * tw;
    col += vec3(star)*uNight*smoothstep(0.,0.15,y)*1.8;
    // milky band
    float band = exp(-pow(dot(d, normalize(vec3(0.3,0.5,0.8))),2.)*18.);
    col += vec3(0.05,0.06,0.1)*band*fbm(d.xz*8.+3.)*uNight*1.6;
  }
  // clouds
  float cloudCov = 0.;
  if(y>0.0){
    vec2 cp = d.xz/(y+0.12)*0.55 + vec2(uTime*0.006, uTime*0.002);
    float c = fbm(cp*1.3);
    float c2 = fbm(cp*3.1+4.);
    float dens = c*0.8 + c2*0.28;
    float lo = 0.64 - 0.46*uCover - 0.2*uTw;
    float cov = smoothstep(lo, lo+0.26, dens);
    cov = mix(cov, 1.0, smoothstep(0.78,1.0,uCover)*0.85);
    float lit = pow(max(dot(normalize(vec3(uSun.x,max(uSun.y,0.05),uSun.z)), vec3(0.,1.,0.)),0.),0.5);
    vec3 cc = mix(uCloudDark, uCloudLit, smoothstep(0.55,0.2,c2));
    cc += uSunColor*0.35*pow(sd,3.)*(1.-cov*0.5)*veil;
    vec3 fireLit = twRamp(clamp(y*0.8+0.02,0.,1.), uAM) * (0.85 + 0.7*sunSide);
    vec3 fireDark = mix(vec3(0.30,0.14,0.38), vec3(0.52,0.22,0.30), sunSide) * (0.55 + 0.6*sunSide);
    cc = mix(cc, mix(fireLit, fireDark, smoothstep(0.2,0.6,c2)), clamp(uTw*0.88,0.,1.));
    cc += uSunColor * pow(sd, 8.) * uTw * 0.9;
    cloudCov = cov * smoothstep(0.0,0.22,y);
    cc = mix(cc, uCloudDark*0.42, uStorm*0.85);
    cc += vec3(0.6,0.7,1.0)*uFlash*0.9;
    col = mix(col, cc, cov*smoothstep(0.0,0.22,y)*0.95);
  }
  col += uSunColor * rayAmt * rays * 0.35 * (1. - 0.65*cloudCov);
  gl_FragColor = vec4(col,1.);
}`;

/* ---------- the sun and the moon as bodies in the sky ----------
   They sit on the sky dome along the sun and moon directions, so they rise, cross and set with the clock,
   and the moon's phase follows from where it is against the sun. Each is a billboard about 3 km out. */
const CELESTIAL_DIST = 3000;   // metres from the camera: inside the far plane, behind the island and clouds
const HALO = 0.06;             // half-width of the glow billboard, in radians
const BODY_EDGE = 0.0075 / HALO; // disc edge in billboard units: about 0.86 degrees across, a touch larger than life so it reads from the ground

const bodyVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const sunFrag = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor; uniform float uAlpha;
void main(){
  vec2 p = vUv*2.-1.; float r = length(p);
  float disc = smoothstep(${(BODY_EDGE + 0.006).toFixed(4)}, ${(BODY_EDGE - 0.006).toFixed(4)}, r);
  float corona = exp(-r*r*60.)*0.5 + exp(-r*12.)*0.06;
  gl_FragColor = vec4(uColor*(disc*9. + corona*1.4)*uAlpha, 1.);
}`;

const moonFrag = /* glsl */ `
varying vec2 vUv;
uniform vec3 uRight, uUp, uFwd, uSunW;
uniform float uVis;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec2 p = vUv*2.-1.; float r = length(p);
  float disc = smoothstep(${(BODY_EDGE + 0.006).toFixed(4)}, ${(BODY_EDGE - 0.006).toFixed(4)}, r);
  vec2 q = p / ${BODY_EDGE.toFixed(4)};                       // -1..1 across the moon's disc
  float nz = sqrt(max(1. - dot(q,q), 0.));
  vec3 n = q.x*uRight + q.y*uUp + nz*uFwd;                     // surface normal in world space
  float lit = smoothstep(-0.03, 0.12, dot(n, uSunW));          // the terminator is where the sun grazes the surface
  float maria = smoothstep(0.42, 0.7, vn2(q*2.6 + vec2(3.1, 7.7)));
  vec3 alb = mix(vec3(0.9,0.92,0.98), vec3(0.58,0.6,0.66), maria*0.7);
  vec3 col = alb * (lit*1.6 + 0.035) * uVis * 2.2;             // a faint earthshine on the dark side
  float halo = exp(-r*r*30.)*0.05*uVis;
  gl_FragColor = vec4(col*disc + vec3(0.6,0.7,0.9)*halo, 1.);
}`;

function buildCelestials() {
  const size = 2 * HALO * CELESTIAL_DIST;
  const geo = new THREE.PlaneGeometry(size, size);
  const sunMat = new THREE.ShaderMaterial({
    vertexShader: bodyVert, fragmentShader: sunFrag, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(1, 0.97, 0.9) }, uAlpha: { value: 1 } },
  });
  const moonMat = new THREE.ShaderMaterial({
    vertexShader: bodyVert, fragmentShader: moonFrag, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uFwd: { value: new THREE.Vector3(0, 0, 1) }, uSunW: { value: new THREE.Vector3(0, 1, 0) }, uVis: { value: 1 } },
  });
  const sunBody = new THREE.Mesh(geo, sunMat), moonBody = new THREE.Mesh(geo, moonMat);
  sunBody.renderOrder = -9; moonBody.renderOrder = -9;
  sunBody.frustumCulled = moonBody.frustumCulled = false;
  scene.add(sunBody, moonBody);
  updaters.push(() => {
    const cp = camera.position;
    sunBody.position.copy(cp).addScaledVector(env.sunDir, CELESTIAL_DIST); sunBody.lookAt(cp);
    moonBody.position.copy(cp).addScaledVector(env.moonDir, CELESTIAL_DIST); moonBody.lookAt(cp);
    // the sun fades into the horizon haze and dims under cloud
    const se = env.sunDir.y, veil = 1 - 0.75 * smoothstep(0.45, 1.0, U.cover.value);
    sunMat.uniforms.uAlpha.value = smoothstep(-0.02, 0.03, se) * (0.4 + 0.6 * smoothstep(-0.02, 0.25, se)) * veil;
    sunMat.uniforms.uColor.value.copy(U.sunColor.value).lerp(new THREE.Color(1, 0.97, 0.9), 0.5);
    const mu = moonMat.uniforms;
    mu.uRight.value.set(1, 0, 0).applyQuaternion(moonBody.quaternion);
    mu.uUp.value.set(0, 1, 0).applyQuaternion(moonBody.quaternion);
    mu.uFwd.value.set(0, 0, 1).applyQuaternion(moonBody.quaternion);
    mu.uSunW.value.copy(env.sunDir);
    mu.uVis.value = (0.18 + 0.82 * env.night) * smoothstep(-0.02, 0.05, env.moonDir.y) * veil;
  });
}

export function initSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uSun: { value: U.sunDir.value }, uMoon: { value: new THREE.Vector3() },
      uZenith: { value: U.skyZ.value }, uHorizon: { value: U.skyH.value },
      uSunColor: { value: U.sunColor.value },
      uCloudLit: { value: new THREE.Color(1, 1, 1) }, uCloudDark: { value: new THREE.Color(0.6, 0.65, 0.75) },
      uTime: U.time, uTw: { value: 0 }, uAM: { value: 0 }, uGlow: { value: 1 }, uNight: U.night, uDay: { value: 1 }, uCover: U.cover, uStorm: U.storm, uFlash: U.flash,
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3500, 48, 24), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  updaters.push(() => {
    sky.position.copy(camera.position);
    const se = env.sunDir.y;
    const st = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    mat.uniforms.uTw.value = st(-0.24, -0.02, se) * st(0.46, 0.05, se) * env.reveal;
    mat.uniforms.uGlow.value = env.reveal * env.reveal;   // the sun halo and the sky colour come up slowly through the reveal
    mat.uniforms.uAM.value = env.tod < 12 ? 1 : 0;
    mat.uniforms.uMoon.value.set(0, 0, 0);   // the moon is drawn as a body by buildCelestials
    // keep the sun disc visible in dusk, dim clouds at night
    const lit = 0.12 + 0.88 * env.day + 0.7 * env.dusk;
    mat.uniforms.uCloudLit.value.setRGB(lit, lit * (0.92 + 0.0 * env.day), lit * (0.85 + 0.15 * env.day));
    mat.uniforms.uCloudDark.value.setRGB(lit * 0.55, lit * 0.58, lit * 0.68);
    if (env.dusk > 0.1) mat.uniforms.uCloudLit.value.lerp(new THREE.Color(1.0, 0.55, 0.38), env.dusk * 0.7);
  });
  buildCelestials();
  return sky;
}
