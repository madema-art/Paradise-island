import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { smoothstep, lerp, clamp } from './util.js';

const canvas = document.getElementById('c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

// haze density: light enough that the island still reads from far out, with the sea horizon still softened
const FOG_BASE = 0.00028;
export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb8d4e8, FOG_BASE);

export const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.3, 7000);
camera.position.set(230, 130, 300);

/* ---------- lights ---------- */
export const sun = new THREE.DirectionalLight(0xfff2dd, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 700;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

export const hemi = new THREE.HemisphereLight(0x9ec8ff, 0x4a4030, 0.8);
scene.add(hemi);

/* ---------- shared uniforms ---------- */
export const U = {
  time: { value: 0 },
  windT: { value: 0 },
  windAmp: { value: 1 },
  windDir: { value: new THREE.Vector2(1, 0) },   // unit vector the wind blows toward (x,z)
  windStr: { value: 0.4 }, windVel: { value: new THREE.Vector3(2, 0, 1) },                       // 0 calm .. ~2.4 storm
  windPh1: { value: 0 }, windPh2: { value: 0 }, windPh3: { value: 0 },
  wet: { value: 0 }, rain: { value: 0 }, cover: { value: 0.25 }, storm: { value: 0 }, flash: { value: 0 }, chop: { value: 1 },
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  sunColor: { value: new THREE.Color(1, 1, 1) },
  skyZ: { value: new THREE.Color() },
  skyH: { value: new THREE.Color() },
  light: { value: new THREE.Color(1, 1, 1) }, // ambient+sun tint multiplier for unlit things
  night: { value: 0 },
  under: { value: 0 },
  volGlow: { value: 0.1 },       // how hot the volcano is running (0..1): lights the cracks in its flanks
  tide: { value: 0 },            // sea level offset in metres: the ocean surface and its shallows follow it
};

// lunar and tidal clocks (in game hours; the game hour is 25 s at normal speed)
export const TIDE_AMP = 0.42;          // metres either side of mean sea level
export const TIDE_PERIOD = 12.42;      // hours between high waters
export const MOON_CYCLE = 29.53;       // days from new moon to new moon
const MOON_AGE0 = 12;                  // the game opens with a waxing gibbous moon, up through the night
export const SUN_TURN = -(7 * Math.PI) / 12; // the sun and moon arc is turned about the vertical axis by this much: they rise from a new bearing, the elevation curve and times stay the same
const TURN_C = Math.cos(SUN_TURN), TURN_S = Math.sin(SUN_TURN);
/** turn a direction about the vertical axis by SUN_TURN */
function turnArc(v) { const x = v.x, z = v.z; v.x = x * TURN_C - z * TURN_S; v.z = x * TURN_S + z * TURN_C; return v; }

/* ---------- postprocessing ---------- */
const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  type: THREE.HalfFloatType, samples: 4,
});
export const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.7, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
export const smaa = new SMAAPass();      // edge anti-aliasing that still works when MSAA is dropped
composer.addPass(smaa);

/* ---------- environment state ---------- */
export const env = {
  tod: 16.4, // hours of the day, 0-24
  hours: 0, // total game hours elapsed since the island woke (drives the tides and the moon's phase)
  speed: 1, // 1 = 1 game-hour per 25 s
  paused: false,
  sunDir: new THREE.Vector3(),
  moonDir: new THREE.Vector3(0, 1, 0), // where the moon is in the sky: it rises and sets, lagging the sun by its age
  moonK: 0.5, // illuminated fraction, 0 new .. 1 full
  moonAge: 0, // days since new moon
  tide: 0, // sea level offset in metres; positive is high water
  tideRising: false,
  elev: 0.4,
  day: 1, night: 0, dusk: 0,
  shadows: true,
  bloomOn: true,
};
export const updaters = [];
/** tiny event bus (sound effects, UI) */
export const events = {
  h: {},
  on(n, f) { (this.h[n] = this.h[n] || []).push(f); },
  emit(n, ...a) { const l = this.h[n]; if (l) for (let i = 0; i < l.length; i++) l[i](...a); },
};
export const creatures = []; // registry for field guide / picking
export const pickables = [];

const P = {
  day: { z: new THREE.Color(0.1, 0.36, 0.86), h: new THREE.Color(0.66, 0.82, 0.95), fog: new THREE.Color(0.72, 0.85, 0.94) },
  dusk: { z: new THREE.Color(0.16, 0.16, 0.45), h: new THREE.Color(1.0, 0.45, 0.2), fog: new THREE.Color(0.98, 0.55, 0.38) },
  night: { z: new THREE.Color(0.012, 0.025, 0.09), h: new THREE.Color(0.06, 0.09, 0.2), fog: new THREE.Color(0.05, 0.08, 0.16) },
};
const _c = new THREE.Color();
function mix3(key, out) {
  out.setRGB(0, 0, 0);
  out.r = P.day[key].r * env.day + P.dusk[key].r * env.dusk + P.night[key].r * env.night;
  out.g = P.day[key].g * env.day + P.dusk[key].g * env.dusk + P.night[key].g * env.night;
  out.b = P.day[key].b * env.day + P.dusk[key].b * env.dusk + P.night[key].b * env.night;
  return out;
}

const MOON_NAMES = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
/** the moon's phase name from its age in days */
export function moonLabel() {
  return MOON_NAMES[Math.floor(((env.moonAge / MOON_CYCLE) * 8 + 0.5) % 8)];
}
/** tide state for the HUD: high and low water, otherwise rising or falling */
export function tideLabel() {
  const t = env.tide / TIDE_AMP;
  if (t > 0.9) return 'high tide';
  if (t < -0.9) return 'low tide';
  return env.tideRising ? 'tide rising' : 'tide falling';
}
export function todLabel() {
  const h = Math.floor(env.tod) % 24, m = Math.floor((env.tod % 1) * 60);
  const hh = String(h).padStart(2, '0'), mm = String(m).padStart(2, '0');
  let n = 'Night';
  if (env.tod >= 4.8 && env.tod < 7) n = 'Dawn';
  else if (env.tod >= 7 && env.tod < 11) n = 'Morning';
  else if (env.tod >= 11 && env.tod < 14) n = 'Midday';
  else if (env.tod >= 14 && env.tod < 17.2) n = 'Afternoon';
  else if (env.tod >= 17.2 && env.tod < 19.4) n = 'Sunset';
  else if (env.tod >= 19.4 && env.tod < 21) n = 'Dusk';
  return `${hh}:${mm} · ${n}`;
}

export function applyTimeOfDay() {
  const a = ((env.tod - 6) / 24) * Math.PI * 2;
  turnArc(env.sunDir.set(Math.cos(a), Math.sin(a), 0.28).normalize());
  // the moon rides the same daily arc, displaced from the sun by its elongation: that elongation is its phase
  const age = (MOON_AGE0 + env.hours / 24) % MOON_CYCLE;
  const e = (age / MOON_CYCLE) * Math.PI * 2;
  turnArc(env.moonDir.set(Math.cos(a + e), Math.sin(a + e), 0.28).normalize());
  env.moonK = (1 - Math.cos(e)) / 2;
  env.moonAge = age;
  // tide: two highs and two lows a day, following the game clock
  const tp = (env.hours / TIDE_PERIOD) * Math.PI * 2;
  env.tide = TIDE_AMP * Math.cos(tp);
  env.tideRising = Math.sin(tp) < 0;
  U.tide.value = env.tide;
  const se = env.sunDir.y;
  env.elev = se;
  env.day = smoothstep(0.05, 0.35, se);
  env.night = smoothstep(0.0, -0.2, se);
  env.dusk = clamp(1 - env.day - env.night, 0, 1);
  U.night.value = env.night;

  mix3('z', U.skyZ.value); mix3('h', U.skyH.value);
  const fogC = mix3('fog', _c);
  scene.fog.color.copy(fogC);
  scene.background = null;

  // sun / moon share the one shadow-casting light
  const sunUp = se > -0.04;
  // by night the one light comes from the moon, in its real direction and with its real phase
  const moonUp = env.moonDir.y > -0.02;
  const dir = sunUp ? env.sunDir : moonUp ? env.moonDir : _c2.copy(env.sunDir).negate();
  U.sunDir.value.copy(dir);
  const warm = smoothstep(0.5, 0.02, se);
  const sc = new THREE.Color(1, 0.97, 0.9).lerp(new THREE.Color(1, 0.45, 0.14), warm);
  const sunI = 3.4 * smoothstep(-0.04, 0.12, se);
  const moonI = 0.9 * (0.1 + 0.9 * env.moonK) * smoothstep(0.04, -0.12, se) * (moonUp ? 1 : 0.3);
  sun.color.copy(sunUp ? sc : new THREE.Color(0.55, 0.68, 1.0));
  sun.intensity = sunUp ? sunI : moonI;
  sun.userData.dir = dir;
  if (sunUp) U.sunColor.value.copy(sc).multiplyScalar(smoothstep(-0.05, 0.1, se));
  else U.sunColor.value.setRGB(0.5, 0.62, 1.0).multiplyScalar(0.1 * smoothstep(0.04, -0.12, se));

  hemi.color.setRGB(0.55 * env.day + 0.7 * env.dusk + 0.07 * env.night, 0.72 * env.day + 0.5 * env.dusk + 0.1 * env.night, 0.98 * env.day + 0.6 * env.dusk + 0.25 * env.night);
  hemi.groundColor.setRGB(0.32 * env.day + 0.3 * env.dusk + 0.02 * env.night, 0.28 * env.day + 0.2 * env.dusk + 0.025 * env.night, 0.2 * env.day + 0.12 * env.dusk + 0.04 * env.night);
  hemi.intensity = 0.95 * env.day + 0.55 * env.dusk + 0.95 * env.night;
  scene.fog.density = FOG_BASE * (1 + 0.8 * env.dusk);
  // light multiplier for unlit surfaces (ocean body, smoke...)
  U.light.value.setRGB(
    0.1 + 0.9 * env.day + 0.7 * env.dusk,
    0.13 + 0.87 * env.day + 0.45 * env.dusk,
    0.22 + 0.78 * env.day + 0.35 * env.dusk
  );
  const tw = smoothstep(-0.24, -0.02, se) * smoothstep(0.46, 0.05, se);
  bloom.strength = 0.45 + 0.1 * tw;
  renderer.toneMappingExposure = 0.95 + 0.25 * env.night;
}
const _c2 = new THREE.Vector3(), _c3 = new THREE.Vector3(), _c4 = new THREE.Vector3();

/** place the shadow camera around a focus point */
export function followShadow(target, dist) {
  const d = sun.userData.dir || env.sunDir;
  sun.position.copy(target).addScaledVector(d, 260);
  sun.target.position.copy(target);
  const s = clamp(dist * 0.9, 45, 150);
  if (Math.abs(sc.right - s) > 4) {
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s;
    sc.updateProjectionMatrix();
  }
  // snap the shadow frustum to whole shadow-map texels, so moving the camera doesn't make the palm shadows crawl and shimmer
  refreshShadowCam();
  const texel = (2 * s) / sun.shadow.mapSize.x;
  const v = _c2.copy(target).applyMatrix4(sc.matrixWorldInverse);
  const dx = Math.round(v.x / texel) * texel - v.x, dy = Math.round(v.y / texel) * texel - v.y;
  if (dx || dy) {
    const right = _c3.setFromMatrixColumn(sc.matrixWorld, 0), up = _c4.setFromMatrixColumn(sc.matrixWorld, 1);
    sun.position.addScaledVector(right, dx).addScaledVector(up, dy);
    sun.target.position.addScaledVector(right, dx).addScaledVector(up, dy);
    refreshShadowCam();
  }
}
function refreshShadowCam() {
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
  sun.shadow.updateMatrices(sun);
}

export function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  U.pxScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
U.pxScale = { value: (window.innerHeight * renderer.getPixelRatio()) / (2 * Math.tan((55 * Math.PI) / 360)) };
window.addEventListener('resize', onResize);

/* ---------- quality presets ---------- */
export const quality = { level: 'high' };
export function setQuality(level) {
  quality.level = level;
  // Rendering resolution: the screen's device pixel ratio, capped per level (a cap, so a level never renders more pixels than a higher one).
  // high 1.75, medium 1.25, low 1.0. On a pixel-ratio-1 screen all three render at the screen's own size; they differ in anti-aliasing,
  // bloom and shadow resolution. Measured in docs/PERFORMANCE.md.
  const dpr = window.devicePixelRatio;
  const cfg = {
    low: { pr: Math.min(dpr, 1.0), sh: 1024, ms: 0, bloom: false },
    medium: { pr: Math.min(dpr, 1.25), sh: 1536, ms: 2, bloom: true },
    high: { pr: Math.min(dpr, 1.75), sh: 2048, ms: 4, bloom: true },
  }[level];
  renderer.setPixelRatio(cfg.pr);
  rt.samples = cfg.ms; composer.renderTarget1.samples = cfg.ms; composer.renderTarget2.samples = cfg.ms;
  composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
  sun.shadow.mapSize.set(cfg.sh, cfg.sh);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  env.bloomOn = cfg.bloom; bloom.enabled = cfg.bloom;
  onResize();
  window.dispatchEvent(new CustomEvent('quality', { detail: level }));
}
