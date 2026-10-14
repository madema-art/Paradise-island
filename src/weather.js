// Island weather: mostly sunny days, with variable wind, passing showers and the odd thunderstorm.
import * as THREE from 'three';
import { scene, camera, sun, hemi, U, env, updaters, events } from './core.js';
import { zones } from './camera.js';
import { getHeight, inCave } from './world.js';
import { taper } from './creatures.js';
import { clamp, lerp, damp, rr, rnd, pick, smoothstep, TAU } from './util.js';

export const wx = {
  state: 'clear', forced: null, timer: 140,
  cloud: 0.12, dark: 0, rain: 0, wet: 0,
  speed: 0.4, base: 0.4, dir: 0.7, dirT: 0.7, kmh: 11,
  gustAmp: 0, gustP: 1, gustT: 6, flash: 0, lightT: 9,
  label: '', windLabel: '',
};

const STATES = {
  clear: { name: 'Clear and sunny', cloud: 0.12, dark: 0, rain: 0, wind: [0.25, 0.6], dur: [130, 260] },
  fair: { name: 'Sunny, a few clouds', cloud: 0.45, dark: 0.04, rain: 0, wind: [0.4, 0.9], dur: [90, 190] },
  overcast: { name: 'Overcast', cloud: 0.86, dark: 0.35, rain: 0, wind: [0.7, 1.15], dur: [55, 100] },
  shower: { name: 'Rain showers', cloud: 0.93, dark: 0.5, rain: 0.55, wind: [0.9, 1.4], dur: [55, 100] },
  storm: { name: 'Thunderstorm', cloud: 1.0, dark: 0.95, rain: 1.0, wind: [1.8, 2.4], dur: [55, 95] },
};
const NEXT = {
  clear: [['clear', 0.18], ['fair', 0.56], ['overcast', 0.12], ['shower', 0.14]],
  fair: [['clear', 0.4], ['fair', 0.1], ['overcast', 0.22], ['shower', 0.28]],
  overcast: [['fair', 0.3], ['shower', 0.45], ['storm', 0.1], ['clear', 0.15]],
  shower: [['overcast', 0.25], ['fair', 0.45], ['clear', 0.15], ['storm', 0.15]],
  storm: [['shower', 0.5], ['overcast', 0.35], ['fair', 0.15]],
};
const wpick = (list) => { let r = rnd(), a = 0; for (const [k, w] of list) { a += w; if (r <= a) return k; } return list[0][0]; };

function enter(s) {
  wx.state = s;
  const d = STATES[s];
  wx.timer = rr(d.dur[0], d.dur[1]);
  wx.base = rr(d.wind[0], d.wind[1]);
}

const _flashSeq = [];
let bolt = null, boltT = 0;
const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.4, 3.4), toneMapped: false, fog: false, transparent: true, depthWrite: false });
function strike(close) {
  const a = camera.rotation.y + rr(-1.0, 1.0), dist = close ? rr(120, 260) : rr(260, 600);
  const fx = -Math.sin(a), fz = -Math.cos(a);
  const px = camera.position.x + fx * dist, pz = camera.position.z + fz * dist;
  if (bolt) { scene.remove(bolt); bolt.geometry.dispose(); bolt = null; }
  if (rnd() < 0.8) {                                           // forked bolt to the ground
    const top = 420, gy = Math.max(getHeight(px, pz), 0), pts = [];
    let x = px, z = pz;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push(new THREE.Vector3(x, lerp(top, gy, t), z));
      x += rr(-16, 16) * (1 - t * 0.4); z += rr(-16, 16) * (1 - t * 0.4);
    }
    const w = dist * 0.0045 + 0.4;
    bolt = taper(pts, w, w * 0.45, '#ffffff', 5, 28);
    bolt.material = boltMat; bolt.castShadow = false; bolt.frustumCulled = false;
    scene.add(bolt); boltT = 0.2;
  }
  _flashSeq.length = 0;
  const k = close ? 1 : 0.6;
  for (const v of [1, 0.15, 0.8, 0.1, 0.55, 0.0]) _flashSeq.push(v * k);
  events.emit('thunder', dist, k);
}

const rain = (() => {
  const N = 9000;
  const base = new Float32Array(N * 2 * 3), key = new Float32Array(N * 2), end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = rnd(), y = rnd(), z = rnd(), k = rnd();
    for (let e = 0; e < 2; e++) { base.set([x, y, z], (i * 2 + e) * 3); key[i * 2 + e] = k; end[i * 2 + e] = e; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(base, 3));
  g.setAttribute('aKey', new THREE.BufferAttribute(key, 1));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: U.time, uRain: { value: 0 }, uWind: { value: new THREE.Vector2() }, uLight: U.light },
    vertexShader: /* glsl */ `
      attribute float aKey; attribute float aEnd;
      uniform vec3 uCam; uniform float uTime, uRain; uniform vec2 uWind;
      varying float vA;
      void main(){
        const float L = 64.0, H = 42.0, SPD = 24.0;
        float s = mod(position.y*H + uTime*SPD*(0.85+0.3*fract(aKey*7.3)), H);
        vec2 drift = uWind * (s/SPD);
        vec2 xz = position.xz*L + drift;
        xz = uCam.xz + mod(xz - uCam.xz + L*0.5, L) - L*0.5;
        float y = uCam.y + H*0.45 - s;
        vec3 w = vec3(xz.x, y, xz.y);
        vec3 vel = normalize(vec3(uWind.x, -SPD, uWind.y));
        w -= vel * (aEnd * (0.5 + 0.5*fract(aKey*3.7)) * 1.5);
        float d = distance(w, uCam);
        vA = step(aKey, uRain) * smoothstep(1.0, 4.0, d) * (1.0 - smoothstep(30.0, 34.0, d));
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight; varying float vA;
      void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(vec3(0.72,0.8,0.9)*(0.35+uLight*0.65), vA*0.34); }`,
  });
  const lines = new THREE.LineSegments(g, m);
  lines.frustumCulled = false; lines.renderOrder = 9;
  scene.add(lines);
  return { lines, m };
})();

const greyDay = new THREE.Color(0.42, 0.45, 0.5), _g = new THREE.Color();
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** advance the weather state machine (call once per frame) */
export function updateWeather(dt) {
  // ---- state machine
  if (!wx.forced) {
    wx.timer -= dt;
    if (wx.timer <= 0) enter(wpick(NEXT[wx.state]));
  } else if (wx.state !== wx.forced) enter(wx.forced);
  const T = STATES[wx.state];
  wx.cloud = damp(wx.cloud, T.cloud, 0.1, dt);
  wx.dark = damp(wx.dark, T.dark, 0.1, dt);
  wx.rain = damp(wx.rain, T.rain, 0.16, dt);
  wx.wet = wx.rain > 0.12 ? damp(wx.wet, 1, 0.05, dt) : damp(wx.wet, 0, 0.011, dt);

  // ---- wind: base + slow drift + travelling gusts; direction slowly wanders
  wx.gustT -= dt;
  if (wx.gustT < 0) { wx.gustT = rr(4, 13) / (0.6 + wx.base); wx.gustAmp = rr(0.25, 0.8) * (0.4 + wx.base); wx.gustP = 0; }
  wx.gustP = Math.min(1, wx.gustP + dt / rr(2.2, 4.5));
  const gust = wx.gustAmp * Math.sin(Math.PI * wx.gustP);
  const t = U.time.value;
  const slow = 0.14 * Math.sin(t * 0.07) + 0.09 * Math.sin(t * 0.19 + 1.3);
  wx.speed = damp(wx.speed, Math.max(0.05, wx.base + slow + gust), 0.7, dt);
  wx.dirT += dt * (0.02 * Math.sin(t * 0.031) + 0.012 * Math.sin(t * 0.083 + 2)) + (wx.state === 'storm' ? dt * 0.03 * Math.sin(t * 0.4) : 0);
  wx.dir = damp(wx.dir, wx.dirT, 0.5, dt);
  U.windDir.value.set(Math.cos(wx.dir), Math.sin(wx.dir));
  U.windStr.value = wx.speed;
  U.windPh1.value += dt * (1.1 + 0.9 * wx.speed);
  U.windPh2.value += dt * (2.7 + 2.0 * wx.speed);
  U.windPh3.value += dt * (0.7 + 0.9 * wx.speed);
  U.windVel.value.set(Math.cos(wx.dir) * wx.speed * 7, 0, Math.sin(wx.dir) * wx.speed * 7);
  wx.kmh = wx.speed * 27;

  // ---- lightning
  if (wx.dark > 0.6 && wx.rain > 0.55) {
    wx.lightT -= dt;
    if (wx.lightT < 0) { wx.lightT = rr(4, 13); strike(rnd() < 0.55); }
  }
  if (_flashSeq.length) { wx.flashStep = (wx.flashStep || 0) + dt; if (wx.flashStep > 0.065) { wx.flashStep = 0; wx.flash = _flashSeq.shift(); } }
  else wx.flash = damp(wx.flash, 0, 12, dt);
  if (bolt) { boltT -= dt; boltMat.opacity = Math.max(0, Math.min(1, boltT / 0.1)) * (0.7 + 0.3 * Math.sin(t * 90)); if (boltT <= 0) { scene.remove(bolt); bolt.geometry.dispose(); bolt = null; } }

  // ---- labels for the UI
  const km = Math.round(wx.kmh);
  const w = km < 5 ? 'calm' : km < 13 ? 'light breeze' : km < 22 ? 'gentle breeze' : km < 32 ? 'fresh breeze' : km < 46 ? 'strong wind' : 'gale';
  const bearing = ((Math.atan2(-Math.cos(wx.dir), Math.sin(wx.dir)) * 180) / Math.PI + 360) % 360;
  const from = COMPASS[Math.round(bearing / 45) % 8];
  wx.label = T.name;
  wx.windLabel = `${w} · ${km} km/h from the ${from}`;
}

/** push the weather into lights, fog, sky and surfaces (after applyTimeOfDay each frame) */
export function applyWeather() {
  const { cloud, dark, wet, flash } = wx;
  const lightLevel = 0.1 + 0.9 * env.day + 0.6 * env.dusk;
  const grey = _g.copy(greyDay).multiplyScalar(lightLevel + 0.12);
  const gk = clamp(0.8 * dark + 0.22 * cloud * (1 - dark), 0, 0.9);
  U.skyZ.value.lerp(grey, gk); U.skyH.value.lerp(grey.clone().multiplyScalar(1.15), gk);
  scene.fog.color.lerp(grey.clone().multiplyScalar(1.1), gk);
  scene.fog.density *= 1 + 2.4 * wx.rain + 0.7 * dark;
  sun.intensity *= 1 - 0.8 * dark - 0.12 * cloud;
  hemi.intensity *= 1 - 0.18 * dark;
  hemi.intensity += flash * 4.0;
  U.light.value.multiplyScalar(1 - 0.42 * dark);
  U.light.value.addScalar(flash * 0.6);
  U.cover.value = cloud; U.storm.value = dark; U.wet.value = wet; U.rain.value = wx.rain; U.flash.value = flash;
  U.chop.value = 0.75 + 0.7 * wx.speed + 0.3 * wx.rain;
  // rain streaks follow the camera; none underwater or inside the grotto
  const z = zones.grotto, inGrotto = (z && camera.position.distanceTo(z.c) < z.r) || inCave(camera.position.x, camera.position.y, camera.position.z);
  rain.m.uniforms.uRain.value = wx.rain * (inGrotto ? 0 : 1) * (1 - U.under.value);
  rain.m.uniforms.uCam.value.copy(camera.position);
  rain.m.uniforms.uWind.value.set(U.windVel.value.x * 0.7, U.windVel.value.z * 0.7);
}
export function setWeather(mode) { wx.forced = mode; if (!mode) wx.timer = rr(40, 90); }
