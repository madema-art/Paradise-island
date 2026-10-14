import * as THREE from 'three';
import { scene, camera, renderer, composer, bloom, sun, U, env, updaters, applyTimeOfDay, followShadow, creatures, setQuality, quality, events } from './core.js';
import { initClimbRoute } from './climb.js';
import { buildAscentProps } from './ascent.js';
import { buildCave, loadCaveModel } from './cave.js';
import { buildBats } from './bats.js';
import { loadBatModel } from './bat_model.js';
import { palms as palmList } from './flora.js';
import { buildWorld, falls, TEMPLE, VOL, LAKE, COVE, SPRING, FAIRY, MOTU, getHeight } from './world.js';
import * as WORLD from './world.js';
import { initSky } from './sky.js';
import { buildTerrain } from './terrain.js';
import { buildWater } from './water.js';
import { initRipples } from './ripples.js';
import * as RIP from './ripples.js';
import { cam, updateCamera, flyTo, followCreature, release as releaseCamera } from './camera.js';
import { detachFish, attachFish } from './school_mind.js';
import { spawnNear } from './walk.js';
import { buildFlora } from './flora.js';
import { buildFlora2, buildSouthSeas, reef } from './flora2.js';
import { buildVolcano } from './volcano.js';
import { buildFx, fx, buildGrotto, buildTemple, buildCove, buildPirate, buildFairy, buildSpring, buildCascade, buildJunctions, secrets } from './props.js';
import { buildLandFauna } from './fauna_land.js';
import { buildSkyAndSeaFauna } from './fauna_sea.js';
import { buildCastaway } from './human.js';
import { loadCastawayModel } from './castaway_model.js';
import { loadCrabModel } from './crab_model.js';
import { loadBoarModel } from './boar_model.js';
import { loadFlamingoModel } from './flamingo_model.js';
import { loadLorikeetModels } from './lorikeet_model.js';
import { loadTernModel } from './tern_model.js';
import { loadDolphinFamilyModel } from './dolphin_model.js';
import { loadSharkModel } from './shark_model.js';
import { loadWhaleModel } from './whale_model.js';
import { loadTurtleModel } from './turtle_model.js';
import { loadGullModels } from './gull_model.js';
import { loadFrigatebirdModels } from './frigatebird_model.js';
import { loadRatModel } from './rat_model.js';
import { eco } from './ecology.js';
import { loadOwlModel } from './owl_model.js';
import { loadBoaModel } from './boa_model.js';
import { loadSeaEagleModels } from './sea_eagle_model.js';
import { loadYellowTangModel } from './yellow_tang_model.js';
import { loadMonkeyModels, setMonkeyTier } from './monkey_model.js';
import { indexInspectables } from './inspect.js';
import * as WX from './weather.js';
const { updateWeather, applyWeather } = WX;
import { createAudio } from './audio.js';
import { initUI } from './ui.js';
import { initSurvival } from './survival/index.js';
import { initNeedsHud } from './needs_hud.js';

const T0 = performance.now();
const msg = (t, p) => {
  console.log('[boot] ' + t + ' @' + Math.round(performance.now() - T0) + 'ms');
  const el = document.getElementById('bootmsg');
  if (el) el.textContent = t;
  const b = document.querySelector('#boot .bar i');
  if (b && p != null) b.style.width = p + '%';
};
const frame = () => new Promise((r) => { let d = false; const f = () => { if (!d) { d = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 40); });

async function boot() {
  msg('raising the island from the sea…', 5); await frame();
  buildWorld();
  initClimbRoute();
  msg('painting the terrain…', 20); await frame();
  const { heightTex } = buildTerrain();
  initSky();
  msg('filling the rivers and falls…', 35); await frame();
  buildWater(heightTex);
  initRipples();
  msg('planting the jungle…', 50); await frame();
  const flora = buildFlora();
  window.__f2 = buildFlora2();
  buildSouthSeas();
  msg('waking the volcano…', 62); await frame();
  const volcano = buildVolcano();
  buildAscentProps();
  msg('hiding secrets…', 72); await frame();
  buildFx();
  flora.coconuts.onSplash(fx.splash);
  eco.coconuts = flora.coconuts;
  await loadCaveModel();
  buildGrotto(); buildCave(); buildTemple(); buildCove(); buildPirate(); buildFairy(); buildSpring(); buildCascade(); buildJunctions();
  msg('releasing the animals…', 85); await frame();
  await loadCrabModel();
  await loadBoarModel();
  await loadFlamingoModel();
  await loadTernModel();
  await loadLorikeetModels();
  await loadDolphinFamilyModel();
  await loadSharkModel();
  await loadWhaleModel();
  await loadTurtleModel();
  await loadGullModels();
  await loadSeaEagleModels();
  await loadFrigatebirdModels();
  await loadRatModel();
  await loadOwlModel();
  await loadBoaModel();
  await loadYellowTangModel();
  await loadBatModel();
  await loadMonkeyModels(quality.level);
  window.addEventListener('quality', (e) => setMonkeyTier(e.detail));
  const land = buildLandFauna(flora);
  const seaFauna = buildSkyAndSeaFauna(flora);
  window.__bats = buildBats({ palms: palmList });
  await loadCastawayModel();
  buildCastaway();
  msg('setting the scene…', 95); await frame();

  /* ---------- camera presets ---------- */
  const n = falls.n, gr = falls.grotto, clam = falls.clam;
  const fz = [falls.lip.x + n.x * 40, falls.pool.y + 9, falls.lip.z + n.z * 40];
  const sp = (x, z, fx, fz) => { const q = spawnNear(x, z); return { x: q.x, z: q.z, fx, fz }; };
  const presets = [
    { name: 'Island', pos: [165, 82, 195], tgt: [0, 12, 10], walk: { x: falls.camp.x + 2, z: falls.camp.z + 3, fx: COVE.x, fz: COVE.z } },
    { name: 'Volcano', pos: [VOL.x + 120, 150, VOL.z + 130], tgt: [VOL.x, 82, VOL.z], walk: sp(VOL.x + 28, VOL.z + 62, VOL.x, VOL.z) },
    { name: 'Crater', pos: [VOL.x + 34, VOL.rim + 16, VOL.z + 30], tgt: [VOL.x, VOL.lavaY + 10, VOL.z], dur: 4, walk: sp(VOL.x - 40, VOL.z + 30, VOL.x, VOL.z) },
    { name: 'Waterfall', pos: fz, tgt: [falls.lip.x + n.x * 6, (falls.lip.y + falls.pool.y) / 2, falls.lip.z + n.z * 6], walk: { x: falls.pool.x + n.x * 8, z: falls.pool.z + n.z * 8, fx: falls.lip.x, fz: falls.lip.z } },
    { name: 'Pearl Cove', pos: [COVE.x + 10, 30, COVE.z + 105], tgt: [COVE.x, -1, COVE.z - 8], walk: sp(COVE.x - 18, COVE.z - 30, COVE.x, COVE.z) },
    { name: 'Temple', pos: [TEMPLE.x + 20, TEMPLE.y + 10, TEMPLE.z + 36], tgt: [TEMPLE.x, TEMPLE.y + 5, TEMPLE.z], walk: { x: TEMPLE.x, z: TEMPLE.z + 20, fx: TEMPLE.x, fz: TEMPLE.z } },
    { name: 'Grotto', pos: [gr.x + n.x * 12.5, gr.y + 0.6, gr.z + n.z * 12.5], tgt: [gr.x - n.x * 4, gr.y - 0.5, gr.z - n.z * 4], dur: 4, walk: { x: gr.x - n.x * 2.5, z: gr.z - n.z * 2.5, fx: gr.x + n.x * 10, fz: gr.z + n.z * 10 } },
    { name: 'Wildlife', pos: [land.fh.x + 9, 5.5, land.fh.z + 13], tgt: [land.fh.x, 1.0, land.fh.z], walk: sp(land.fh.x - 8, land.fh.z - 12, land.fh.x, land.fh.z) },
    { name: 'Underwater', pos: [clam.x + 5, -2.0, clam.z + 7], tgt: [clam.x, -2.8, clam.z], dur: 4, walk: { x: clam.x + 5, z: clam.z + 6, fx: clam.x, fz: clam.z } },
    (() => {
      const m = MOTU[0], dx = m.x - reef.x, dz = m.z - reef.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
      return { name: 'South Seas', pos: [reef.x - ux * 15, 3.6, reef.z - uz * 15], tgt: [reef.x + ux * 60, 1.2, reef.z + uz * 60], dur: 4, walk: sp(reef.x - ux * 24, reef.z - uz * 24, m.x, m.z) };
    })(),
  ];
  cam.presets = presets;

  /* ---------- labels ---------- */
  const labels = [
    { name: 'Mount Ignis', pos: new THREE.Vector3(VOL.x, VOL.rim + 10, VOL.z), min: 80, max: 900 },
    { name: 'Tide Cascade', pos: new THREE.Vector3(falls.cascade.x, falls.cascade.y + 8, falls.cascade.z), min: 30, max: 450 },
    { name: 'Veil Falls', pos: new THREE.Vector3(falls.lip.x, falls.lip.y + 4, falls.lip.z), min: 30, max: 500 },
    { name: 'Mirror Lake', pos: new THREE.Vector3(LAKE.x, LAKE.y + 3, LAKE.z), min: 30, max: 380 },
    { name: 'Pearl Cove', pos: new THREE.Vector3(COVE.x, 6, COVE.z + 10), min: 40, max: 600 },
    { name: 'Volcanic Coast', pos: new THREE.Vector3(VOL.x + 80, 8, VOL.z + 30), min: 40, max: 400 },
    { name: 'Sunken Temple', pos: new THREE.Vector3(TEMPLE.x, TEMPLE.y + 14, TEMPLE.z), min: 30, max: 300, needs: () => secrets.find((s) => s.id === 'temple')?.found },
    { name: 'Warm Spring', pos: new THREE.Vector3(SPRING.x, SPRING.y + 6, SPRING.z), min: 20, max: 200, needs: () => secrets.find((s) => s.id === 'spring')?.found },
    { name: 'Glimmer Ring', pos: new THREE.Vector3(FAIRY.x, FAIRY.y + 5, FAIRY.z), min: 20, max: 200, needs: () => secrets.find((s) => s.id === 'fairy')?.found },
    { name: 'Galleon Wreck', pos: new THREE.Vector3(COVE.x + 16, 6, COVE.z + 18), min: 20, max: 200, needs: () => secrets.find((s) => s.id === 'wreck')?.found },
  ];

  indexInspectables();
  const audio = createAudio(volcano);
  initUI({ presets, secrets, volcano, audio, labels });
  initSurvival();
  initNeedsHud();

  window.__dbg = { schoolMind: { detachFish, attachFish }, events, fx, RIP, falls, THREE, scene, camera, cam, flora, env, volcano, secrets, renderer, composer, bloom, sun, updaters, WORLD, creatures, dolphinPod: seaFauna.dolphinPod, dolphinPods: seaFauna.dolphinPods, audio, WX, lorikeetFlocks: seaFauna.lorikeetFlocks, frigatebirdColony: seaFauna.frigatebirdColony };
  // development only: ?inspect= holds the camera on one school (src/dev/school_inspect.js); normal play never loads it
  if (/[?&]inspect=/.test(location.search)) import('./dev/school_inspect.js').then((m) => m.startSchoolInspect());
  window.__goto = (p, t) => cam.goto(p, t);
  // review hook: the game's own follow camera on any creature (used to inspect the monkeys in the running game)
  window.__cam = { follow: (c) => followCreature(c), release: releaseCamera };
  window.__sizes = () => window.__dbg.creatures.filter((c) => c.sizeInfo).map((c) => ({ id: c.id, name: c.name, group: +c.group.scale.x.toFixed(3), info: c.sizeInfo }));
  const DAWN = { tod: 5.0, speed: 0.4 };           // a slow sunrise: the sun clears the horizon in about a minute and a half
  const VIEW = { pos: [-230, 60, -20], tgt: [0, 30, -10] };   // over the western sea, facing east: the volcano and the falls, the sun coming up behind them
  const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

  // no start screen: the island opens in the dark, the first light of dawn comes up over the sea, and the camera is yours
  // from the first frame, out over the western sea looking east at the island as the sun comes up
  msg('the island is ready', 100);
  env.tod = DAWN.tod; env.speed = DAWN.speed;
  flyTo(VIEW.pos, VIEW.tgt, 0.05);
  audio.start();
  requestAnimationFrame(() => document.getElementById('boot').classList.add('done'));   // the black lifts slowly, in step with the light
  // browsers hold audio back until the visitor's first touch: the first click, key, wheel or touch unlocks it
  const unlock = () => { audio.unlock(); for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, unlock); };
  for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, unlock, { passive: true });
  // the day runs at normal pace again once the sun is well up
  updaters.push(() => { if (env.tod >= 7.5 && env.speed < 1) env.speed = 1; });
  // Species review hooks are opt-in and never change the normal camera or timing.
  if (location.search.includes('lorikeetReview')) {
    document.getElementById('boot').style.transition = 'none';
    env.tod = 11; env.speed = 0;
    const bird = seaFauna.macaws[0], p = bird.pos;
    flyTo([p.x + 2.6, p.y + .9, p.z + 3.2], [p.x, p.y + .35, p.z], .05);
    window.render_game_to_text = () => JSON.stringify({ axes: 'Y up, Z forward, metres',
      flocks: seaFauna.lorikeetFlocks.map(f => ({ id: f.id, destination: f.destination, cycles: f.cycle,
        birds: f.members.map(m => ({ id: m.i, age: m.age, state: m.state, clip: m.model.clip,
          position: m.pos.toArray(), speed: m.vel.length(), landings: m.landings, nectarVisits: m.visits })) })) });
    window.advanceTime = ms => { for (let n = Math.ceil(ms / (1000 / 60)); n > 0; n--) step(1 / 60); composer.render(); };
  }
  loop();
}

const underColor = new THREE.Color();
let last = performance.now();
const autoQ = { t: 0, acc: 0, n: 0, wait: 9, on: !location.search.includes('noauto') };
function autoQuality(real) {
  if (!autoQ.on || document.hidden || quality.level === 'low') return;
  autoQ.t += real;
  if (autoQ.t < autoQ.wait) return;
  autoQ.acc += real; autoQ.n++;
  if (autoQ.acc > 4) {
    const avg = autoQ.acc / autoQ.n;
    if (avg > 0.036) { setQuality(quality.level === 'high' ? 'medium' : 'low'); autoQ.wait = autoQ.t + 3; }
    autoQ.acc = 0; autoQ.n = 0;
  }
}
function step(dt) {
  U.time.value += dt;
  U.windT.value = U.time.value;
  if (!env.paused) { env.tod = (env.tod + (dt * env.speed) / 25) % 24; env.hours += (dt * env.speed) / 25; }
  applyTimeOfDay();
  updateWeather(dt);
  applyWeather();
  updateCamera(dt);
  followShadow(cam.target, camera.position.distanceTo(cam.target));
  // underwater look
  const u = U.under.value;
  if (u > 0.01) {
    underColor.setRGB(0.02 + 0.03 * U.light.value.r, 0.2 * U.light.value.g + 0.02, 0.28 * U.light.value.b + 0.03);
    scene.fog.color.lerp(underColor, u);
    scene.fog.density = scene.fog.density * (1 - u) + 0.05 * u;
  }
  document.getElementById('uw').style.opacity = u.toFixed(2);
  for (let i = 0; i < updaters.length; i++) updaters[i](dt, U.time.value);
}
window.__step = step;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  autoQuality((now - last) / 1000);
  last = now;
  step(dt);
  composer.render();
}
boot();
