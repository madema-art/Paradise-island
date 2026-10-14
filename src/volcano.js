import * as THREE from 'three';
import { tagObject } from './inspect.js';
import { scene, U, updaters, camera, env, events } from './core.js';
import { VOL, getHeight } from './world.js';
import { Particles } from './particles.js';
import { cam } from './camera.js';
import { rnd, rr, clamp, lerp, smoothstep, TAU } from './util.js';

const NOISE = /* glsl */ `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float s=0.,a=.5; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+11.7; a*=.5;} return s; }
`;
const vert = /* glsl */ `
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
const frag = /* glsl */ `
uniform float uTime, uLake, uGlow;
varying vec2 vUv; varying vec3 vWorld;
#include <fog_pars_fragment>
${NOISE}
void main(){
  vec2 p;
  if(uLake > 0.5) p = vWorld.xz*0.20 + vec2(uTime*0.025, -uTime*0.02);
  else p = vec2(vUv.x*2.2, vUv.y*0.28 - uTime*0.12);
  float n = fbm(p*vec2(1.0,1.0)) * 0.75 + fbm(p*2.6 + vec2(3.0,-uTime*0.08)) * 0.35;
  float crust = smoothstep(0.52, 0.70, n);
  float edge = smoothstep(0.5, 1.0, abs(vUv.x*2.0-1.0));
  if(uLake < 0.5) crust = max(crust, edge*0.9);
  vec3 molten = mix(vec3(1.0,0.22,0.02), vec3(1.0,0.75,0.2), smoothstep(0.5, 0.15, n));
  vec3 crustC = vec3(0.045,0.02,0.015) + molten*0.07;
  vec3 col = mix(molten*(2.6*uGlow), crustC, crust);
  float alpha = (uLake > 0.5) ? 1.0 : 1.0 - smoothstep(0.86, 1.0, abs(vUv.x*2.0-1.0));
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

function lavaMat(lake) {
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  u.uTime = U.time; u.uLake = { value: lake ? 1 : 0 }; u.uGlow = { value: 1 };
  return new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: u, fog: true, transparent: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
}

export const volcano = { state: 'idle', intensity: 0.1, time: 0, erupt: null, craterTop: new THREE.Vector3(VOL.x, VOL.lavaY, VOL.z) };

export function buildVolcano() {
  const lakeMat = lavaMat(true);
  const group = new THREE.Group();
  scene.add(group); tagObject(group, 'volcano', { model: false });

  // Nothing glows on the flanks: the old channels down the mountain are cold, dark basalt now (see terrain.js and world.js).
  // Only the lava lake in the crater is molten.
  // lava lake
  const lg = new THREE.CircleGeometry(11.5, 40);
  lg.rotateX(-Math.PI / 2);
  const lake = new THREE.Mesh(lg, lakeMat);
  lake.position.set(VOL.x, VOL.lavaY, VOL.z);
  group.add(lake);

  // lights
  const crater = new THREE.PointLight(0xff6a22, 2500, 260, 2);
  crater.position.set(VOL.x, VOL.lavaY + 7, VOL.z);
  scene.add(crater);
  const rimLight = new THREE.PointLight(0xff7a30, 900, 190, 2);
  rimLight.position.set(VOL.x, VOL.rim + 12, VOL.z);
  scene.add(rimLight);

  // particles
  const smoke = new Particles(1700, { soft: 0.9, lit: true, order: 6, wind: 0.35 });
  const glow = new Particles(9000, { additive: true, soft: 0.8, order: 7 });
  const steam = new Particles(500, { soft: 1, lit: true, order: 6, wind: 0.5 });
  const trail = new Particles(2600, { soft: 0.9, lit: true, order: 6, wind: 0.5 });

  const bombs = [], sparks = [];
  const FIRE = [[1, 0.62, 0.16], [1, 0.34, 0.06], [1, 0.86, 0.42], [1, 0.2, 0.04], [1, 0.95, 0.75]];
  const V3 = new THREE.Vector3();
  const rim = () => {
    const a = rnd() * TAU, r = rnd() * 8;
    return { x: VOL.x + Math.cos(a) * r, z: VOL.z + Math.sin(a) * r };
  };

  function spawnBomb(power) {
    const p = rim();
    const a = rnd() * TAU, sp = rr(5, 20) * (0.6 + 0.6 * power);
    bombs.push({
      x: p.x, y: VOL.lavaY + 2, z: p.z,
      vx: Math.cos(a) * sp, vy: rr(32, 62) * (0.6 + 0.5 * power), vz: Math.sin(a) * sp,
      size: rr(1.2, 2.8), acc: 0, fuse: rr(0, 7),
    });
  }

  function burst(b) {
    const n = Math.floor(18 + b.size * 8), tint = FIRE[Math.floor(rnd() * FIRE.length)], pow = rr(11, 19) * (0.8 + 0.2 * b.size);
    events.emit('bomb', b.x, b.y, b.z, b.size * 0.7);
    glow.emit({ x: b.x, y: b.y, z: b.z, life: 0.5, s0: b.size * 3, s1: b.size * 16, c0: [1, 0.85, 0.5, 0.8], c1: [1, 0.35, 0.05, 0] });
    smoke.emit({ x: b.x, y: b.y, z: b.z, life: rr(5, 8), s0: 4, s1: rr(18, 28), c0: [0.3, 0.27, 0.26, 0.5], c1: [0.5, 0.5, 0.5, 0], drag: 0.6, rise: 0.4 });
    const ring = rnd() < 0.4, tilt = rnd() * Math.PI, ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let k = 0; k < n; k++) {
      let dx, dy, dz;
      if (ring) { const a = (k / n) * TAU; dx = Math.cos(a); dy = Math.sin(a) * ct; dz = Math.sin(a) * st; }
      else { const u = rr(-1, 1), a = rnd() * TAU, q = Math.sqrt(1 - u * u); dx = q * Math.cos(a); dy = u; dz = q * Math.sin(a); }
      const sp = pow * (ring ? 1 : rr(0.55, 1));
      const col = rnd() < 0.25 ? FIRE[Math.floor(rnd() * FIRE.length)] : tint;
      sparks.push({ x: b.x, y: b.y, z: b.z, vx: b.vx * 0.35 + dx * sp, vy: b.vy * 0.35 + dy * sp, vz: b.vz * 0.35 + dz * sp, age: 0, life: rr(1.5, 2.6), col, acc: 0, pop: rnd() < 0.3 ? rr(0.7, 1.3) : 0 });
    }
  }

  let major = false, forceMajor = false, eruptN = 0, nextErupt = 12, phaseT = 0, tAcc = { smoke: 0, glow: 0, bomb: 0 };
  volcano.erupt = () => {
    if (volcano.state === 'idle') { forceMajor = true; volcano.state = 'build'; phaseT = 0; nextErupt = volcano.time + 24; events.emit('eruptWarn'); }
  };

  updaters.push((dt, t) => {
    volcano.time = t;
    // ---- state machine
    phaseT += dt;
    let target = 0.12;
    if (volcano.state === 'idle') {
      if (t > nextErupt) { volcano.state = 'build'; phaseT = 0; nextErupt = t + 24; events.emit('eruptWarn'); }
    } else if (volcano.state === 'build') {
      target = 0.3 + 0.3 * (phaseT / 3.5);
      if (phaseT > 3.5) { volcano.state = 'erupt'; phaseT = 0; crater.intensity = 14000; major = forceMajor || (++eruptN % 5) === 0; forceMajor = false; events.emit('eruptBlast'); }
    } else if (volcano.state === 'erupt') {
      target = 1.0;
      if (phaseT > 9) { volcano.state = 'wane'; phaseT = 0; }
    } else if (volcano.state === 'wane') {
      target = 0.6 * (1 - phaseT / 9) + 0.12;
      if (phaseT > 9) { volcano.state = 'idle'; phaseT = 0; }
    }
    volcano.intensity += (target - volcano.intensity) * Math.min(1, dt * 1.6);
    const I = volcano.intensity;

    // glow / lights
    const flick = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
    crater.intensity += ((1800 + 3500 * I) * flick - crater.intensity) * Math.min(1, dt * 3);
    lakeMat.uniforms.uGlow.value = 0.9 + 0.5 * I;
    U.volGlow.value = I;
    rimLight.intensity += ((500 + 2600 * I) * flick - rimLight.intensity) * Math.min(1, dt * 3);

    // camera shake by proximity
    const d = camera.position.distanceTo(volcano.craterTop);
    // the ground only really shakes on a big blast (about one eruption in five, or the Erupt button), and gently
    cam.shake = major && I > 0.5 ? (I - 0.5) * 2 * clamp(1 - d / 260, 0, 1) * 0.8 : 0;

    // ---- smoke
    const sRate = 4 + 52 * Math.max(0, I - 0.25);
    tAcc.smoke += dt * sRate;
    while (tAcc.smoke > 1) {
      tAcc.smoke--;
      const p = rim();
      const eru = I > 0.35;
      smoke.emit({
        x: p.x, y: VOL.lavaY + rr(2, 8), z: p.z,
        vx: rr(-2, 2) + 1.2, vy: eru ? rr(12, 24) : rr(3, 6), vz: rr(-2, 2),
        life: eru ? rr(11, 18) : rr(8, 13), s0: eru ? rr(12, 22) : rr(6, 10), s1: eru ? rr(60, 110) : rr(26, 40),
        c0: eru ? [0.17, 0.14, 0.13, 0.92] : [0.55, 0.53, 0.52, 0.38],
        c1: eru ? [0.36, 0.34, 0.34, 0.0] : [0.72, 0.72, 0.72, 0.0],
        drag: 0.25, rise: eru ? 3.2 : 1.3,
      });
    }
    // glowing core of the plume (visible at night)
    tAcc.glow += dt * (6 + 40 * I);
    while (tAcc.glow > 1) {
      tAcc.glow--;
      const p = rim();
      glow.emit({
        x: p.x, y: VOL.lavaY + rr(1, 5), z: p.z, vx: rr(-3, 3), vy: rr(3, 10) * (0.5 + I), vz: rr(-3, 3),
        life: rr(1.4, 2.8), s0: rr(5, 10), s1: rr(14, 30) * (0.5 + I),
        c0: [1, 0.42, 0.1, 0.1 + 0.2 * I], c1: [0.9, 0.12, 0.02, 0.0], drag: 0.6, rise: 2,
      });
    }
    // bombs
    if (volcano.state === 'build') tAcc.bomb += dt * 0.5;
    else if (volcano.state === 'erupt') tAcc.bomb += dt * 2.6;
    else if (volcano.state === 'wane') tAcc.bomb += dt * 1.2 * (1 - phaseT / 9);
    else tAcc.bomb += dt * 0.04;
    while (tAcc.bomb > 1) { tAcc.bomb--; spawnBomb(I); }

    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.vy -= 17 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.acc += dt;
      glow.emit({ x: b.x, y: b.y, z: b.z, life: 0.06, s0: b.size * 1.5, s1: b.size * 1.5, c0: [1, 0.5, 0.15, 0.9], c1: [1, 0.35, 0.08, 0.6] });
      if (b.acc > 0.03) {
        b.acc = 0;
        glow.emit({ x: b.x, y: b.y, z: b.z, vx: rr(-1, 1), vy: rr(-1, 1), vz: rr(-1, 1), life: rr(0.7, 1.3), s0: b.size * 1.3, s1: 0.2, c0: [1, 0.45, 0.1, 0.75], c1: [0.5, 0.06, 0.0, 0], drag: 1.5 });
        if (rnd() < 0.3) trail.emit({ x: b.x, y: b.y, z: b.z, vx: rr(-1, 1), vy: rr(0, 1), vz: rr(-1, 1), life: rr(2.5, 4), s0: 2, s1: 9, c0: [0.25, 0.22, 0.22, 0.45], c1: [0.4, 0.4, 0.4, 0], drag: 0.8, rise: 1 });
      }
      const g = getHeight(b.x, b.z);
      // a firework shell: past its peak the fireball bursts into glowing pieces well before it can land
      if (b.vy < -b.fuse && b.y - g > 14) { burst(b); bombs.splice(i, 1); continue; }
      if (b.y < g + 0.3 && b.vy < 0) {
        if (g > 0.5) {
          events.emit('bomb', b.x, g, b.z, b.size);
          for (let k = 0; k < 8; k++) {
            const a = rnd() * TAU, s = rr(2, 8);
            glow.emit({ x: b.x, y: g + 0.4, z: b.z, vx: Math.cos(a) * s, vy: rr(3, 8), vz: Math.sin(a) * s, life: rr(0.6, 1.4), s0: 1.0, s1: 0.2, c0: [1, 0.5, 0.1, 0.9], c1: [0.4, 0.05, 0, 0], grav: 14, drag: 0.5 });
          }
        } else {
          events.emit('hiss', b.x, 0.3, b.z, b.size);
          steam.emit({ x: b.x, y: 0.3, z: b.z, vy: 5, life: 3, s0: 4, s1: 18, c0: [1, 1, 1, 0.6], c1: [1, 1, 1, 0], rise: 1 });
        }
        bombs.splice(i, 1);
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const q = sparks[i];
      q.age += dt; q.acc += dt;
      const dr = Math.exp(-0.9 * dt);
      q.vx *= dr; q.vz *= dr; q.vy = q.vy * dr - 13 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const f = q.age / q.life, c = q.col;
      glow.emit({ x: q.x, y: q.y, z: q.z, life: 0.08, s0: 2.4 * (1 - f * 0.6), s1: 2.0, c0: [c[0], c[1], c[2], 0.95 * (1 - f * 0.5)], c1: [c[0], c[1] * 0.7, c[2], 0.5] });
      if (q.acc > 0.045) { q.acc = 0; glow.emit({ x: q.x, y: q.y, z: q.z, vx: rr(-0.4, 0.4), vy: rr(-0.4, 0.4), vz: rr(-0.4, 0.4), life: rr(0.5, 0.9), s0: 1.0, s1: 0.1, c0: [c[0], c[1] * 0.8, c[2], 0.7], c1: [0.6, 0.08, 0.0, 0], drag: 1.2 }); }
      if (q.pop && q.age > q.pop) {                                          // secondary crackle
        q.pop = 0;
        for (let k = 0; k < 5; k++) { const a = rnd() * TAU, u = rr(-1, 1), w = Math.sqrt(1 - u * u), s2 = rr(4, 9);
          sparks.push({ x: q.x, y: q.y, z: q.z, vx: q.vx * 0.4 + Math.cos(a) * w * s2, vy: q.vy * 0.4 + u * s2, vz: q.vz * 0.4 + Math.sin(a) * w * s2, age: 0, life: rr(0.7, 1.2), col: FIRE[4], acc: 0, pop: 0 }); }
      }
      if (q.age > q.life || q.y < getHeight(q.x, q.z) + 0.2) sparks.splice(i, 1);
    }

    // a ring of cloud wreathing the crown, turning slowly round the summit
    tAcc.cap = (tAcc.cap || 0) + dt * 3.2;
    while (tAcc.cap > 1) {
      tAcc.cap--;
      const a = rnd() * TAU, r = rr(21, 36), sp = 1.6;
      steam.emit({ x: VOL.x + Math.cos(a) * r, y: VOL.rim - 14 + rr(-5, 14), z: VOL.z + Math.sin(a) * r, vx: -Math.sin(a) * sp, vy: rr(0.1, 0.6), vz: Math.cos(a) * sp, life: rr(9, 14), s0: rr(10, 16), s1: rr(24, 36), c0: [0.95, 0.95, 0.97, 0.13], c1: [0.95, 0.95, 0.97, 0.0], rise: 0.05, drag: 0.1 });
    }
    });

  volcano.steam = steam; volcano.smoke = smoke; volcano.glow = glow; volcano.bombs = bombs;
  return volcano;
}
