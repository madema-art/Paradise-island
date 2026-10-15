// Performance benchmark (development only). Loaded with ?perf=1 (see main.js). It times each frame of the real game and splits it into
// update time (the simulation), render time (the CPU side of drawing) and GPU time (WebGL timer queries, where the browser allows them).
// It runs fixed camera scenarios, holds the camera with the same updater hook the inspection tool uses, and writes a report.
//
// ?perf=1           shows the live overlay and waits for you to press Run
// ?perf=1&bench=1   runs the whole benchmark when the game is ready and shows the report
// Other options: &quality=high|medium|low (default high), &noauto is implied (the automatic quality change is switched off).
import { updaters, camera, renderer, composer, scene, creatures, setQuality, quality, sun, bloom, env } from '../core.js';
import { cam, followCreature, release } from '../camera.js';
import { eco } from '../ecology.js';
import { perf } from '../perf_hooks.js';
import { setSkeletonShare, setSkinnedMerge, mergeCheck, setRigidMerge, rigidStatsRef, setSkinCulling } from '../skeleton_share.js';
import { setPartInstancing, partStats } from '../part_instancing.js';

const q = new URLSearchParams(location.search);
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2); };
const mean = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);

const st = { on: false, frames: [], pending: [], gpuExt: null, gl: null, longTasks: 0, t: { begin: 0, mid: 0, render0: 0, render1: 0 }, last: 0, lastCalls: 0, lastTris: 0 };

// ---- measurement: the frame loop calls these (see main.js) -----------------------------------------------------------------------------
function beginFrame() {
  st.t.begin = performance.now();
  renderer.info.reset();
}
function midFrame() { st.t.mid = performance.now(); }
function renderFrame() {
  const gl = st.gl;
  let query = null;
  if (st.gpuExt && gl) { query = gl.createQuery(); gl.beginQuery(st.gpuExt.TIME_ELAPSED_EXT, query); }
  const r0 = performance.now();
  if (st.mode === 'raw') renderer.render(scene, camera); else composer.render();
  st.t.render0 = r0; st.t.render1 = performance.now();
  if (query) { gl.endQuery(st.gpuExt.TIME_ELAPSED_EXT); st.pending.push(query); }
  st.lastCalls = renderer.info.render.calls; st.lastTris = renderer.info.render.triangles;
}
function endFrame() {
  const now = performance.now();
  const rec = { wall: st.last ? now - st.last : 0, update: st.t.mid - st.t.begin, render: st.t.render1 - st.t.render0, calls: st.lastCalls, tris: st.lastTris, gpu: null };
  st.last = now;
  // collect finished GPU queries (they arrive a frame or two late)
  if (st.gl && st.pending.length) {
    const gl = st.gl;
    while (st.pending.length && gl.getQueryParameter(st.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q0 = st.pending.shift();
      const ns = gl.getQueryParameter(q0, gl.QUERY_RESULT);
      const disjoint = gl.getParameter(st.gpuExt.GPU_DISJOINT_EXT);
      if (!disjoint) st.gpuDone.push(ns / 1e6);
      gl.deleteQuery(q0);
    }
  }
  st.frames.push(rec);
  if (st.frames.length > 40000) st.frames.shift();
}
st.mode = 'composer';
st.gpuDone = [];
perf.on = true;
perf.begin = beginFrame;
perf.mid = midFrame;
perf.end = endFrame;
perf.render = () => renderFrame();

// ---- camera scenarios ----------------------------------------------------------------------------------------------------------------
const holder = { fn: null };
function holdCamera(fn) { holder.fn = fn; }
const hook = (dt, t) => { if (holder.fn) holder.fn(dt, t); };
updaters.push(hook);

const one = (name) => creatures.find((c) => c.name === name && c.group);
const troop = () => {
  const ms = creatures.filter((c) => c.name === 'Capuchin monkey' && c.group);
  const p = { x: 0, y: 0, z: 0 };
  for (const m of ms) { const v = m.group.position; p.x += v.x; p.y += v.y; p.z += v.z; }
  const n = Math.max(1, ms.length); return { x: p.x / n, y: p.y / n, z: p.z / n, n: ms.length };
};
const at = (c) => (c ? c.group.position : { x: 0, y: 0, z: 0 });

export const SCENARIOS = {
  lagoon: { label: 'Demanding lagoon: schools over the reef, low and wide', secs: 14, run: (t0) => {
    const c = at(one('Blue chromis school'));
    return () => { camera.position.set(c.x + 14, 6.5, c.z + 20); camera.lookAt(c.x, -1, c.z); cam.target.set(c.x, -1, c.z); }; } },
  jungle48: { label: 'Jungle with the 48-monkey troop', secs: 14, run: (t0) => {
    const p = troop();
    return () => { camera.position.set(p.x + 2, p.y + 4.5, p.z + 9); camera.lookAt(p.x, p.y + 1.5, p.z); cam.target.set(p.x, p.y + 1.5, p.z); }; } },
  wideIsland: { label: 'Wide view of the island from above', secs: 14, run: () => (dt, t) => { camera.position.set(0, 150, -210); camera.lookAt(0, 8, 0); cam.target.set(0, 8, 0); } },
  castawayEye: { label: 'Eye level beside the castaway', secs: 12, run: () => {
    const c = at(one('The Castaway'));
    return (dt, t) => { camera.position.set(c.x + 3.5, c.y + 1.6, c.z - 4.5); camera.lookAt(c.x, c.y + 1.1, c.z); cam.target.set(c.x, c.y + 1, c.z); }; } },
  // wildlife-observation scenes (follow camera, night rats, boas): the camera is the game's own follow camera where a creature is followed
  followPig: { label: 'Following a wild boar (follow camera, daytime)', secs: 14, tod: 10, run: () => { const c = creatures.find((x) => x.name === 'Wild boar'); followCreature(c); return () => {}; }, end: () => release() },
  followBird: { label: 'Following a sea eagle (follow camera, daytime)', secs: 14, tod: 10, run: () => { const c = creatures.find((x) => x.name === 'Sea eagle'); followCreature(c); return () => {}; }, end: () => release() },
  followGull: { label: 'Following a silver gull (follow camera, daytime)', secs: 14, tod: 10, run: () => { const c = creatures.find((x) => x.name === 'Silver gull'); followCreature(c); return () => {}; }, end: () => release() },
  nightRats: { label: 'Night, beside a rat burrow', secs: 16, tod: 22, run: () => { const b = (eco.rats[0] || {}).burrow || { x: 0, z: 0 }; return () => { camera.position.set(b.x + 3, 3.2, b.z + 5); camera.lookAt(b.x, 0.5, b.z); cam.target.set(b.x, 0.5, b.z); }; } },
  followBoa: { label: 'Night, following a Pacific boa', secs: 16, tod: 22, run: () => { const c = creatures.find((x) => x.name === 'Pacific boa'); followCreature(c); return () => {}; }, end: () => release() },
  moving: { label: 'Moving: a slow orbit over the island', secs: 16, run: (t0) => (dt, t) => { const a = (t - t0) * 0.05; camera.position.set(Math.cos(a) * 120, 55, Math.sin(a) * 120); camera.lookAt(0, 6, 0); cam.target.set(0, 6, 0); } },
};

// Runs one scenario for its duration and returns its summary. The first 2 seconds are warm-up and are not counted.
async function runScenario(key, quality_ = 'high') {
  const sc = SCENARIOS[key];
  setQuality(quality_);
  await new Promise((r) => setTimeout(r, 2500));
  const savedTod = env.tod, savedPaused = env.paused;
  if (sc.tod !== undefined) { env.tod = sc.tod; env.paused = true; }
  const t0 = performance.now() / 1000;
  const fn = sc.run(t0);
  holdCamera(() => fn(0, performance.now() / 1000));   // scenarios run on the wall clock
  st.frames = []; st.gpuDone = []; st.last = 0;
  await new Promise((r) => setTimeout(r, 2000));   // warm-up
  st.frames = []; st.gpuDone = [];
  await new Promise((r) => setTimeout(r, sc.secs * 1000));
  holdCamera(null);
  if (sc.end) sc.end();
  env.tod = savedTod; env.paused = savedPaused;
  return summarise(st.frames, st.gpuDone, key, quality_);
}
function summarise(frames, gpu, key, quality_) {
  const w = frames.map((f) => f.wall).filter((x) => x > 0);
  const u = frames.map((f) => f.update), r = frames.map((f) => f.render);
  const calls = frames.map((f) => f.calls), tris = frames.map((f) => f.tris);
  const fps = w.length ? 1000 / mean(w) : 0;
  return {
    scenario: key, quality: quality_, seconds: +(w.reduce((a, b) => a + b, 0) / 1000).toFixed(1), frames: w.length,
    fpsAverage: +fps.toFixed(1), fpsOnePercentLow: pct(w, 0.99) ? +(1000 / pct(w, 0.99)).toFixed(1) : null,
    frameMsMedian: pct(w, 0.5), frameMsP95: pct(w, 0.95), frameMsP99: pct(w, 0.99),
    updateMsMean: mean(u), renderMsMean: mean(r), renderMsP95: pct(r, 0.95),
    gpuMsMean: mean(gpu), gpuMsP95: pct(gpu, 0.95), gpuSamples: gpu.length,
    drawCallsMean: mean(calls), trianglesMean: mean(tris),
    memoryMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    longTasks: st.longTasks,
    sceneFish: creatures.filter((c) => c.sim && c.sim.spec).reduce((a, c) => a + c.sim.fish.length, 0),
    monkeys: creatures.filter((c) => c.name === 'Capuchin monkey').length,
    creatures: creatures.length,
    canvas: [renderer.domElement.width, renderer.domElement.height], pixelRatio: renderer.getPixelRatio(),
    dpr: window.devicePixelRatio, innerSize: [innerWidth, innerHeight],
  };
}

// ---- environment: what the browser is doing, so a result can be judged ---------------------------------------------------------------
function environment() {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    userAgent: navigator.userAgent, gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null, webgl: gl.getParameter(gl.VERSION),
    gpuTimerQueries: !!st.gpuExt, drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    canvasCss: [renderer.domElement.clientWidth, renderer.domElement.clientHeight], dpr: window.devicePixelRatio,
    screen: [screen.width, screen.height], visibility: document.visibilityState, focused: document.hasFocus(),
    hardwareAcceleration: gl.getParameter(gl.RENDERER).indexOf('SwiftShader') < 0,
  };
}

// ---- run: the whole benchmark, and the overlay ---------------------------------------------------------------------------------------------
export async function runBenchmark(list = Object.keys(SCENARIOS), levels = [q.get('quality') || 'high']) {
  const results = [];
  for (const level of levels) for (const key of list) {
    results.push(await runScenario(key, level));
    show(`done ${key} (${level})`);
  }
  setQuality(q.get('quality') || 'high');
  const report = { when: new Date().toISOString(), environment: environment(), results };
  window.__perfReport = report;
  return report;
}

function show(text) { const el = document.getElementById('perfOverlay'); if (el) el.textContent = text; }

export function startPerfBench() {
  st.gl = renderer.getContext();
  st.gpuExt = st.gl.getExtension('EXT_disjoint_timer_query_webgl2');
  renderer.info.autoReset = false;
  try { new PerformanceObserver((list) => { st.longTasks += list.getEntries().length; }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* not supported */ }
  const el = document.createElement('div');
  el.id = 'perfOverlay';
  el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:60;padding:6px 9px;border-radius:6px;background:rgba(6,16,24,.8);color:#dff6ff;font:12px/1.45 ui-monospace,Consolas,monospace;white-space:pre;pointer-events:auto';
  document.body.appendChild(el);
  // live line, once a second
  setInterval(() => {
    const w = st.frames.slice(-60).map((f) => f.wall).filter((x) => x > 0);
    if (!w.length) return;
    const last = st.frames.slice(-60);
    const g = st.gpuDone.slice(-10);
    el.textContent = `fps ${(1000 / mean(w)).toFixed(1)}  frame ${mean(w).toFixed(1)} ms (p95 ${pct(w, 0.95)})\n` +
      `update ${mean(last.map((f) => f.update)).toFixed(1)} ms  render-cpu ${mean(last.map((f) => f.render)).toFixed(1)} ms  gpu ${g.length ? mean(g).toFixed(1) + ' ms' : 'n/a'}\n` +
      `draw calls ${mean(last.map((f) => f.calls))}  triangles ${(mean(last.map((f) => f.tris)) / 1e6).toFixed(2)}M  quality ${quality.level}`;
  }, 1000);
  // a button that runs the whole benchmark and downloads the report
  const btn = document.createElement('button');
  btn.textContent = 'Run benchmark';
  btn.style.cssText = 'display:block;margin-top:6px;font:12px system-ui;padding:4px 8px;cursor:pointer';
  btn.onclick = async () => {
    btn.disabled = true;
    const r = await runBenchmark();
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'paradise-island-benchmark.json'; a.click();
    show('benchmark finished: report saved as paradise-island-benchmark.json');
    btn.disabled = false;
  };
  el.appendChild(btn);
  if (q.get('bench') === '1') {
    const wait = setInterval(() => { if (creatures.length > 100) { clearInterval(wait); setTimeout(() => btn.click(), 4000); } }, 500);
  }
}

// ---- A/B: hide one subsystem at a time, measure it, and restore it (temporary profiling, nothing is changed for good) ----------------------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function categories() {
  const monkeyGroups = new Set(), schoolGroups = new Set(), creatureGroups = new Set();
  for (const c of creatures) {
    if (!c.group) continue;
    if (c.name === 'Capuchin monkey') monkeyGroups.add(c.group);
    else if (c.sim && c.sim.spec) schoolGroups.add(c.group);
    else creatureGroups.add(c.group);
  }
  const inside = (o, set) => { for (let p = o; p; p = p.parent) if (set.has(p)) return true; return false; };
  const cat = { schoolFish: [], instancedScenery: [], staticScenery: [], water: [] };
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === 'school-fish' || o.name === 'anthias-fish') { cat.schoolFish.push(o); return; }
    if (inside(o, monkeyGroups) || inside(o, schoolGroups) || inside(o, creatureGroups)) return;
    if (o.material && o.material.type === 'ShaderMaterial' && o.material.transparent) { cat.water.push(o); return; }
    if (o.isInstancedMesh) cat.instancedScenery.push(o); else cat.staticScenery.push(o);
  });
  cat.monkeys = [...monkeyGroups];
  cat.schools = [...schoolGroups];
  cat.otherCreatures = [...creatureGroups];
  return cat;
}
function hideAll(list) { for (const o of list) { o.userData.__pv = o.visible; o.visible = false; } }
function showAll(list) { for (const o of list) if (o.userData.__pv !== undefined) { o.visible = o.userData.__pv; delete o.userData.__pv; } }

export async function runAB(key = 'jungle48', measureSecs = 6, level = 'high') {
  setQuality(level);
  const sc = SCENARIOS[key];
  const fn = sc.run(performance.now() / 1000);
  holdCamera(() => fn(0, performance.now() / 1000));
  await wait(3000);
  const cat = categories();
  const tests = [
    ['baseline (everything on)', null],
    ['shadow pass off', () => { renderer.shadowMap.enabled = false; }, () => { renderer.shadowMap.enabled = true; }],
    ['post-processing off (direct render)', () => { st.mode = 'raw'; }, () => { st.mode = 'composer'; }],
    ['monkeys hidden (48)', () => hideAll(cat.monkeys), () => showAll(cat.monkeys)],
    ['school fish hidden (608)', () => { hideAll(cat.schoolFish); hideAll(cat.schools); }, () => { showAll(cat.schoolFish); showAll(cat.schools); }],
    ['other creatures hidden', () => hideAll(cat.otherCreatures), () => showAll(cat.otherCreatures)],
    ['instanced scenery hidden (plants, rocks)', () => hideAll(cat.instancedScenery), () => showAll(cat.instancedScenery)],
    ['static scenery hidden (terrain, buildings)', () => hideAll(cat.staticScenery), () => showAll(cat.staticScenery)],
    ['water hidden', () => hideAll(cat.water), () => showAll(cat.water)],
  ];
  const rows = [];
  for (const [name, apply, restore] of tests) {
    if (apply) apply();
    await wait(1500);
    st.frames = []; st.gpuDone = [];
    await wait(measureSecs * 1000);
    const s = summarise(st.frames, st.gpuDone, key, level);
    rows.push({ test: name, fps: s.fpsAverage, frameMsMedian: s.frameMsMedian, frameMsP95: s.frameMsP95, gpuMs: s.gpuMsMean, renderCpuMs: s.renderMsMean, updateMs: s.updateMsMean, drawCalls: s.drawCallsMean, triangles: s.trianglesMean, frames: s.frames });
    if (restore) restore();
    await wait(1500);
  }
  holdCamera(null);
  const base = rows[0];
  for (const r of rows) r.gpuSaved = base.gpuMs != null && r.gpuMs != null ? +(base.gpuMs - r.gpuMs).toFixed(2) : null;
  const out = { scenario: key, level, measureSecs, counts: { monkeys: cat.monkeys.length, schools: cat.schools.length, otherCreatures: cat.otherCreatures.length, schoolFishMeshes: cat.schoolFish.length, instancedScenery: cat.instancedScenery.length, staticScenery: cat.staticScenery.length, water: cat.water.length }, rows };
  window.__perfAB = window.__perfAB || {};
  window.__perfAB[key + '/' + level] = out;
  return out;
}
window.__perfRunAB = runAB;
window.__perfScenarios = { run: runBenchmark, ab: runAB, list: Object.keys(SCENARIOS) };

// ---- A/B by species: hide one family of creatures at a time (the same method as runAB) --------------------------------------------------
export async function runFamilies(key = 'jungle48', measureSecs = 5, level = 'high') {
  setQuality(level);
  const sc = SCENARIOS[key];
  const fn = sc.run(performance.now() / 1000);
  holdCamera(() => fn(0, performance.now() / 1000));
  await wait(3000);
  const families = {};
  for (const c of creatures) { if (!c.group) continue; (families[c.name] = families[c.name] || []).push(c.group); }
  const names = Object.keys(families).sort((a, b) => families[b].length - families[a].length);
  const measure = async (label, apply, restore) => {
    if (apply) apply();
    await wait(1500);
    st.frames = []; st.gpuDone = [];
    await wait(measureSecs * 1000);
    const s = summarise(st.frames, st.gpuDone, key, level);
    if (restore) restore();
    await wait(1000);
    return { test: label, count: label === 'baseline' ? null : families[label.replace(' hidden', '')]?.length, fps: s.fpsAverage, frameMsMedian: s.frameMsMedian, gpuMs: s.gpuMsMean, renderCpuMs: s.renderMsMean, drawCalls: s.drawCallsMean, triangles: s.trianglesMean };
  };
  const rows = [await measure('baseline', null, null)];
  for (const n of names) {
    rows.push(await measure(n + ' hidden', () => hideAll(families[n]), () => showAll(families[n])));
  }
  holdCamera(null);
  const base = rows[0];
  for (const r of rows) r.gpuSaved = base.gpuMs != null && r.gpuMs != null ? +(base.gpuMs - r.gpuMs).toFixed(2) : null;
  const out = { scenario: key, level, measureSecs, rows };
  window.__perfFamilies = window.__perfFamilies || {};
  window.__perfFamilies[key + '/' + level] = out;
  return out;
}
window.__perfRunFamilies = runFamilies;

// ---- interleaved A/B: the variants alternate in short rounds in one page, so drift in the machine affects both equally --------------
export async function runInterleaved(key = 'jungle48', variants = null, rounds = 4, secs = 4, level = 'high') {
  const list = variants || [
    { name: 'shared skeletons ON', apply: () => setSkeletonShare(true) },
    { name: 'shared skeletons OFF', apply: () => setSkeletonShare(false) },
  ];
  setQuality(level);
  const sc = SCENARIOS[key];
  const fn = sc.run(performance.now() / 1000);
  holdCamera(() => fn(0, performance.now() / 1000));
  await wait(3000);
  const acc = {};
  for (const v of list) acc[v.name] = { fps: [], frameMs: [], gpu: [], update: [], render: [], calls: [], tris: [] };
  for (let r = 0; r < rounds; r++) {
    for (const v of list) {
      v.apply();
      await wait(800);
      st.frames = []; st.gpuDone = [];
      await wait(secs * 1000);
      const s = summarise(st.frames, st.gpuDone, key, level);
      const a = acc[v.name];
      a.fps.push(s.fpsAverage); a.frameMs.push(s.frameMsMedian); a.gpu.push(s.gpuMsMean); a.update.push(s.updateMsMean); a.render.push(s.renderMsMean); a.calls.push(s.drawCallsMean); a.tris.push(s.trianglesMean);
    }
  }
  holdCamera(null);
  setSkeletonShare(true);
  const avg = (x) => (x.length ? +(x.reduce((p, q) => p + q, 0) / x.length).toFixed(2) : null);
  const rows = list.map((v) => { const a = acc[v.name]; return { variant: v.name, fps: avg(a.fps), frameMsMedian: avg(a.frameMs), gpuMs: avg(a.gpu), updateMs: avg(a.update), renderCpuMs: avg(a.render), drawCalls: avg(a.calls), trianglesM: avg(a.tris) && +(avg(a.tris) / 1e6).toFixed(2), fpsRounds: a.fps }; });
  return { scenario: key, level, rounds, secs, rows };
}
window.__perfInterleave = runInterleaved;

// ---- the update loop: time each registered updater (the simulation), while the scenario runs ------------------------------------------
export async function profileUpdaters(key = 'jungle48', secs = 8) {
  setQuality('high');
  const sc = SCENARIOS[key];
  const fn = sc.run(performance.now() / 1000);
  holdCamera(() => fn(0, performance.now() / 1000));
  await wait(3000);
  const costs = new Map();
  const originals = updaters.slice();
  const wrapped = originals.map((u, i) => {
    const label = (u.name && u.name !== 'anonymous' ? u.name : '') + '#' + i + ' ' + u.toString().replace(/\s+/g, ' ').slice(0, 70);
    return function timed(dt, t) { const t0 = performance.now(); u(dt, t); const d = performance.now() - t0; const c = costs.get(label) || { ms: 0, n: 0 }; c.ms += d; c.n++; costs.set(label, c); };
  });
  updaters.length = 0; wrapped.forEach((w) => updaters.push(w));
  let frames = 0; const t0 = performance.now();
  await wait(secs * 1000);
  const wall = (performance.now() - t0) / 1000;
  updaters.length = 0; originals.forEach((u) => updaters.push(u));
  holdCamera(null);
  const rows = [...costs.entries()].map(([label, c]) => ({ updater: label, msPerFrame: +(c.ms / Math.max(1, c.n)).toFixed(3), msPerSecond: +(c.ms / wall).toFixed(1) })).sort((a, b) => b.msPerFrame - a.msPerFrame);
  return { scenario: key, seconds: +wall.toFixed(1), updaters: rows.length, rows: rows.slice(0, 25) };
}
window.__perfProfileUpdaters = profileUpdaters;
window.__perfSkin = { setSkinnedMerge, setSkeletonShare, mergeCheck };
// the last run's raw frames, for finding what the slow frames spend their time on
window.__perfFramesDump = () => st.frames.map((f) => [+f.wall.toFixed(1), +f.update.toFixed(1), +f.render.toFixed(1), f.calls]);

// ---- what the draw calls are: visible, in-frustum meshes by category, one draw per material group (the renderer's own rule) ---------------
import * as THREE_ from 'three';
export async function composition(key = 'lagoon') {
  const sc = SCENARIOS[key];
  const fn = sc.run(performance.now() / 1000);
  holdCamera(() => fn(0, performance.now() / 1000));
  await wait(2500);
  const fr = new THREE_.Frustum();
  camera.updateMatrixWorld();
  fr.setFromProjectionMatrix(new THREE_.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const creatureOf = new Map();
  for (const c of creatures) if (c.group) c.group.traverse((o) => creatureOf.set(o, c));
  const cats = {};
  const add = (k, n) => { cats[k] = (cats[k] || 0) + n; };
  const sphere = new THREE_.Sphere();
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let p = o, hidden = false;
    for (; p; p = p.parent) if (!p.visible) { hidden = true; break; }
    if (hidden) return;
    if (o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); }
    if (o.frustumCulled && o.geometry && o.geometry.boundingSphere) {
      sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      if (!fr.intersectsSphere(sphere)) return;
    }
    const groups = Array.isArray(o.material) ? Math.max(1, o.geometry.groups.length) : 1;
    const c = creatureOf.get(o);
    let k;
    if (o.name === 'school-fish' || o.name === 'anthias-fish') k = 'school fish (instanced)';
    else if (o.isInstancedMesh) k = c ? 'creature instanced' : 'scenery instanced';
    else if (c) k = (o.isSkinnedMesh ? 'creature skinned' : 'creature static') + ' / ' + c.name.split(' ')[0];
    else if (o.material && o.material.type === 'ShaderMaterial') k = 'water/sky shader';
    else k = 'scenery static';
    add(k, groups);
  });
  const total = Object.values(cats).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  holdCamera(null);
  return { scenario: key, drawsEstimated: total, info: renderer.info.render.calls, categories: sorted };
}
window.__perfComposition = composition;
window.__perfRigid = { setRigidMerge, rigidStats: () => rigidStatsRef() };
// draw calls of the main pass alone and of the shadow pass alone, in a scenario's view (one render each, counted exactly)
window.__perfShadowCalls = async (key) => {
  const sc = SCENARIOS[key];
  const fn = sc.run(performance.now() / 1000);
  holdCamera(() => fn(0, performance.now() / 1000));
  await wait(2500);
  const info = renderer.info; const was = info.autoReset; info.autoReset = false;
  const count = (sm) => { renderer.shadowMap.enabled = sm; info.reset(); if (st.mode === 'raw') renderer.render(scene, camera); else composer.render(); return info.render.calls; };
  const withSh = count(true), noSh = count(false);
  renderer.shadowMap.enabled = true; info.autoReset = was; holdCamera(null);
  return { scenario: key, drawsWithShadows: withSh, drawsWithoutShadows: noSh, shadowPassDraws: withSh - noSh };
};
// the shadow pass's draws by category: visible casters inside the sun's shadow frustum (the same test the shadow pass applies)
window.__perfShadowComposition = async (key) => {
  const sc = SCENARIOS[key];
  const fn = sc.run(performance.now() / 1000);
  holdCamera(() => fn(0, performance.now() / 1000));
  await wait(2500);
  sun.shadow.camera.updateMatrixWorld();
  const fr = new THREE_.Frustum();
  fr.setFromProjectionMatrix(new THREE_.Matrix4().multiplyMatrices(sun.shadow.camera.projectionMatrix, sun.shadow.camera.matrixWorldInverse));
  const creatureOf = new Map();
  for (const c of creatures) if (c.group) c.group.traverse((o) => creatureOf.set(o, c));
  const cats = {}; const sphere = new THREE_.Sphere(); const sizes = {};
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.castShadow) return;
    let p = o; for (; p; p = p.parent) if (!p.visible) return;
    if (o.frustumCulled && o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); if (!fr.intersectsSphere(sphere)) return; }
    const groups = Array.isArray(o.material) ? Math.max(1, o.geometry.groups.length) : 1;
    const c = creatureOf.get(o);
    const k = o.name === 'merged skin' ? 'merged skin' : o.name === 'merged rigid parts' ? 'merged rigid' : o.isInstancedMesh ? 'instanced' : c ? (o.isSkinnedMesh ? 'creature skinned' : 'creature static') : (o.isSkinnedMesh ? 'skinned (other)' : 'scenery static');
    cats[k] = (cats[k] || 0) + groups;
  });
  holdCamera(null);
  return { scenario: key, categories: Object.entries(cats).sort((a, b) => b[1] - a[1]) };
};
// why a creature's static part was not merged: the first rule it fails
window.__perfWhyNotMerged = () => {
  const reasons = {}; const examples = {};
  for (const c of creatures) {
    if (!c.group) continue;
    c.group.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.mergedInto) return;
      if (o.userData.creature) { reasons['proxy'] = (reasons['proxy'] || 0) + 1; return; }
      let why = 'merged-or-ok';
      if (o.children.length) why = 'has children';
      else if (Array.isArray(o.material)) why = 'multi-material';
      else if (o.geometry.groups.length) why = 'geometry groups';
      else if (o.userData.inspect) why = 'inspectable';
      else if (o.name === 'merged rigid parts' || o.name === 'merged skin') why = 'merged';
      else why = 'candidate (stable or single per parent)';
      const key = c.name + ' :: ' + why;
      reasons[why] = (reasons[why] || 0) + 1;
      examples[key] = (examples[key] || 0) + 1;
    });
  }
  return { reasons, examples: Object.entries(examples).sort((a, b) => b[1] - a[1]).slice(0, 25) };
};
window.__perfRigidDebug = () => { const groups = {}; for (const c of creatures) { if (!c.group) continue; c.group.traverse(o => { if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.mergedInto || o.userData.creature || o.children.length) return; const k = (o.parent ? (o.parent.name || o.parent.type) : 'none') + '|' + c.name; groups[k] = (groups[k] || 0) + 1; }); } return Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 25); };

window.__perfParts = { setPartInstancing, partStats };


window.__perfBloom = (on) => { bloom.enabled = !!on; };

window.__perfCull = setSkinCulling;
// interleaved GPU test: each variant restores everything, then hides one category (so the variants do not accumulate)
window.__perfGpuVariants = () => {
  const cat = categories();
  const all = [...cat.water, ...cat.staticScenery, ...cat.instancedScenery, ...cat.schoolFish, ...cat.schools, ...cat.otherCreatures, ...cat.monkeys];
  const restoreAll = () => showAll(all);
  const v = (name, list) => ({ name, apply: () => { restoreAll(); if (list) hideAll(list); } });
  return [
    v('everything', null),
    v('water hidden', cat.water),
    v('static scenery hidden', cat.staticScenery),
    v('instanced scenery hidden', cat.instancedScenery),
    v('school fish hidden', [...cat.schoolFish, ...cat.schools]),
    v('other creatures hidden', cat.otherCreatures),
    v('monkeys hidden', cat.monkeys),
  ];
};

// the instanced props that carry the triangles in a view: triangles drawn per mesh (instances inside the frustum, counted by sphere test)
window.__perfTriangles = async (key) => {
  const sc = SCENARIOS[key];
  const fn = sc.run(performance.now() / 1000);
  holdCamera(() => fn(0, performance.now() / 1000));
  await wait(2500);
  camera.updateMatrixWorld();
  const fr = new THREE_.Frustum();
  fr.setFromProjectionMatrix(new THREE_.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const rows = {}; let total = 0; const m = new THREE_.Matrix4(), p = new THREE_.Vector3(), s = new THREE_.Sphere();
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let q = o; for (; q; q = q.parent) if (!q.visible) return;
    const tris = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    if (o.isInstancedMesh) {
      const k = (o.userData.inspect && o.userData.inspect.key) || o.name || 'instanced';
      let inside = 0;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); p.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld); if (fr.containsPoint(p)) inside++; }
      const t = tris * inside; total += t; rows[k] = (rows[k] || 0) + t;
    } else if (o.frustumCulled && o.geometry) {
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      if (!fr.intersectsSphere(s)) return;
      total += tris; rows['(static/other meshes)'] = (rows['(static/other meshes)'] || 0) + tris;
    } else { total += tris; rows['(unculled meshes)'] = (rows['(unculled meshes)'] || 0) + tris; }
  });
  holdCamera(null);
  return { scenario: key, totalTrianglesMillions: +(total / 1e6).toFixed(2), byKey: Object.entries(rows).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [k, +(v / 1e6).toFixed(2)]) };
};
// the meshes that are drawn whether or not they are on screen (frustum culling off), with their triangles and where they are
window.__perfUnculled = () => {
  const out = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.frustumCulled || !o.visible) return;
    const tris = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    if (tris < 5000) return;
    const cr = o.userData.creature ? 'creature' : '';
    let p = o; for (; p && !p.userData.inspect; p = p.parent);
    out.push({ tris: Math.round(tris), inst: o.isInstancedMesh ? o.count : 1, name: o.name || o.type, key: p ? p.userData.inspect.key : '', parent: o.parent && o.parent.name, cr, material: Array.isArray(o.material) ? 'multi' : o.material.type, size: (() => { const bb = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox); return [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((v) => Math.round(v)).join('x'); })() });
  });
  return out.sort((a, b) => b.tris - a.tris);
};

import { staticCullStats } from '../static_cull.js';
window.__perfStaticCull = staticCullStats;

// ---- manual stepping: the same scenarios without the browser's frame callback (it is paused while a window is hidden, and software rendering
// would hide the simulation's cost). Steps the real game a fixed 1/30 s at a time and times the update; then renders a few frames for the
// draw-call count and render-side CPU time. Used for before/after comparisons: run the same scenario on both builds.
export async function runManual(key, { frames = 600, warm = 120, renderFrames = 30, dt = 1 / 30 } = {}) {
  const sc = SCENARIOS[key];
  setQuality('high');
  const savedTod = env.tod, savedPaused = env.paused;
  if (sc.tod !== undefined) { env.tod = sc.tod; env.paused = true; }
  const fn = sc.run(performance.now() / 1000);
  holdCamera(() => fn(0, performance.now() / 1000));
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < warm; i++) { window.__step(dt); if (i % 30 === 0) await yieldNow(); }
  const u = [], heap = [];
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now(); window.__step(dt); u.push(performance.now() - t0);
    if (performance.memory) heap.push(performance.memory.usedJSHeapSize);
    if (i % 30 === 0) await yieldNow();
  }
  st.frames = []; st.gpuDone = []; st.last = 0;
  for (let i = 0; i < renderFrames; i++) { perf.begin(); window.__step(dt); perf.mid(); perf.render(); perf.end(); if (i % 5 === 0) await yieldNow(); }
  const rf = st.frames.slice(5);
  holdCamera(null);
  if (sc.end) sc.end();
  env.tod = savedTod; env.paused = savedPaused;
  let drops = 0, dropMB = 0, grew = 0;
  for (let i = 1; i < heap.length; i++) if (heap[i] > heap[i - 1]) grew += heap[i] - heap[i - 1];
  for (let i = 1; i < heap.length; i++) if (heap[i] < heap[i - 1] - 200000) { drops++; dropMB += (heap[i - 1] - heap[i]) / 1048576; }
  const med = pct(u, 0.5);
  return {
    scenario: key, frames, updateMsMean: mean(u), updateMsMedian: med, updateMsP95: pct(u, 0.95), updateMsP99: pct(u, 0.99), updateMsMax: +Math.max(...u).toFixed(2),
    spikesOver3xMedian: u.filter((x) => x > med * 3 + 0.3).length,
    heapDrops: drops, heapDropMB: +dropMB.toFixed(1), allocKBPerFrame: heap.length ? +(grew / 1024 / heap.length).toFixed(1) : null, heapMB: heap.length ? +(heap[heap.length - 1] / 1048576).toFixed(1) : null,
    renderCpuMsMean: mean(rf.map((f) => f.render)), drawCallsMean: mean(rf.map((f) => f.calls)), trianglesMean: mean(rf.map((f) => f.tris)),
  };
}
window.__perfManual = runManual;
window.__perfManualAll = async (list = ['wideIsland', 'jungle48', 'followPig', 'followBird', 'followGull', 'nightRats', 'followBoa'], opts = {}) => {
  window.__perfManualOut = [];
  for (const k of list) { const r = await runManual(k, opts); window.__perfManualOut.push(r); }
  window.__perfManualDone = true;
};

/** which updaters cost what, with manual stepping (see runManual) */
window.__perfProfileManual = async (key = 'followPig', frames = 300, dt = 1 / 30) => {
  const sc = SCENARIOS[key];
  const savedTod = env.tod, savedPaused = env.paused;
  if (sc.tod !== undefined) { env.tod = sc.tod; env.paused = true; }
  const fn = sc.run(performance.now() / 1000);
  holdCamera(() => fn(0, performance.now() / 1000));
  for (let i = 0; i < 90; i++) { window.__step(dt); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0)); }
  const costs = new Map(), originals = updaters.slice();
  const wrapped = originals.map((u, i) => {
    const label = '#' + i + ' ' + u.toString().replace(/\s+/g, ' ').slice(0, 90);
    return function timed(a, b) { const t0 = performance.now(); u(a, b); const d = performance.now() - t0; const c = costs.get(label) || { ms: 0, n: 0 }; c.ms += d; c.n++; costs.set(label, c); };
  });
  updaters.length = 0; wrapped.forEach((w) => updaters.push(w));
  for (let i = 0; i < frames; i++) { window.__step(dt); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0)); }
  updaters.length = 0; originals.forEach((u) => updaters.push(u));
  holdCamera(null); if (sc.end) sc.end(); env.tod = savedTod; env.paused = savedPaused;
  return [...costs.entries()].map(([label, c]) => ({ updater: label, msPerFrame: +(c.ms / Math.max(1, c.n)).toFixed(3) })).sort((a, b) => b.msPerFrame - a.msPerFrame).slice(0, 14);
};

/** the same scenario with a feature switched on and off, alternately in one page (the simulation is random, so only back-to-back runs compare).
 *  set(on) flips the feature; returns the mean update ms, render CPU ms and draw calls of each setting. */
window.__perfToggle = async (key, set, rounds = 2, opts = { frames: 240, warm: 90, renderFrames: 24 }) => {
  const rows = { on: [], off: [] };
  for (let r = 0; r < rounds; r++) for (const on of [true, false]) { set(on); const x = await runManual(key, opts); rows[on ? 'on' : 'off'].push(x); }
  const avg = (a, f) => +(a.reduce((s, x) => s + x[f], 0) / a.length).toFixed(2);
  const out = {};
  for (const k of ['on', 'off']) out[k] = { update: avg(rows[k], 'updateMsMean'), p99: avg(rows[k], 'updateMsP99'), render: avg(rows[k], 'renderCpuMsMean'), calls: avg(rows[k], 'drawCallsMean'), tris: avg(rows[k], 'trianglesMean') };
  set(true);
  return out;
};
