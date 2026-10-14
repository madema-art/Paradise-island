// Performance benchmark (development only). Loaded with ?perf=1 (see main.js). It times each frame of the real game and splits it into
// update time (the simulation), render time (the CPU side of drawing) and GPU time (WebGL timer queries, where the browser allows them).
// It runs fixed camera scenarios, holds the camera with the same updater hook the inspection tool uses, and writes a report.
//
// ?perf=1           shows the live overlay and waits for you to press Run
// ?perf=1&bench=1   runs the whole benchmark when the game is ready and shows the report
// Other options: &quality=high|medium|low (default high), &noauto is implied (the automatic quality change is switched off).
import { updaters, camera, renderer, composer, scene, creatures, setQuality, quality } from '../core.js';
import { cam } from '../camera.js';
import { perf } from '../perf_hooks.js';
import { setSkeletonShare, setSkinnedMerge, mergeCheck } from '../skeleton_share.js';

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
  moving: { label: 'Moving: a slow orbit over the island', secs: 16, run: (t0) => (dt, t) => { const a = (t - t0) * 0.05; camera.position.set(Math.cos(a) * 120, 55, Math.sin(a) * 120); camera.lookAt(0, 6, 0); cam.target.set(0, 6, 0); } },
};

// Runs one scenario for its duration and returns its summary. The first 2 seconds are warm-up and are not counted.
async function runScenario(key, quality_ = 'high') {
  const sc = SCENARIOS[key];
  setQuality(quality_);
  await new Promise((r) => setTimeout(r, 2500));
  const t0 = performance.now() / 1000;
  const fn = sc.run(t0);
  holdCamera(() => fn(0, performance.now() / 1000));   // scenarios run on the wall clock
  st.frames = []; st.gpuDone = []; st.last = 0;
  await new Promise((r) => setTimeout(r, 2000));   // warm-up
  st.frames = []; st.gpuDone = [];
  await new Promise((r) => setTimeout(r, sc.secs * 1000));
  holdCamera(null);
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
  for (const v of list) acc[v.name] = { fps: [], frameMs: [], gpu: [], update: [], render: [], calls: [] };
  for (let r = 0; r < rounds; r++) {
    for (const v of list) {
      v.apply();
      await wait(800);
      st.frames = []; st.gpuDone = [];
      await wait(secs * 1000);
      const s = summarise(st.frames, st.gpuDone, key, level);
      const a = acc[v.name];
      a.fps.push(s.fpsAverage); a.frameMs.push(s.frameMsMedian); a.gpu.push(s.gpuMsMean); a.update.push(s.updateMsMean); a.render.push(s.renderMsMean); a.calls.push(s.drawCallsMean);
    }
  }
  holdCamera(null);
  setSkeletonShare(true);
  const avg = (x) => (x.length ? +(x.reduce((p, q) => p + q, 0) / x.length).toFixed(2) : null);
  const rows = list.map((v) => { const a = acc[v.name]; return { variant: v.name, fps: avg(a.fps), frameMsMedian: avg(a.frameMs), gpuMs: avg(a.gpu), updateMs: avg(a.update), renderCpuMs: avg(a.render), drawCalls: avg(a.calls), fpsRounds: a.fps }; });
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
