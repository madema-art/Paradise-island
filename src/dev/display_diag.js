// Display diagnostic: what the game really renders at on the player's screen (F11 fullscreen on a 4K TV, say), and how fast.
// Press F2 (or open the page with ?diag=1) for an on-screen readout. `window.__display()` returns the same numbers as an object, and
// `window.__display.sample(secs)` resolves with frame statistics measured over that many seconds of real play.
import * as THREE from 'three';
import { renderer, camera, quality, composer, env } from '../core.js';
import { perf } from '../perf_hooks.js';

const ring = [];                       // frame intervals in ms, newest last
let lastT = 0, cpuRender = 0, cpuAvg = 0, frames = 0, box = null, visible = false;

function pct(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0; }

export function frameStats(list = ring) {
  const s = list.slice().sort((a, b) => a - b), n = s.length;
  if (!n) return null;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const worst1 = s.slice(Math.floor(n * 0.99)), worstMean = worst1.reduce((a, b) => a + b, 0) / worst1.length;
  return { frames: n, avgFps: +(1000 / mean).toFixed(1), low1Fps: +(1000 / worstMean).toFixed(1), medianMs: +pct(s, 0.5).toFixed(2), p95Ms: +pct(s, 0.95).toFixed(2), p99Ms: +pct(s, 0.99).toFixed(2), maxMs: +s[n - 1].toFixed(1) };
}

export function displayInfo() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const cv = renderer.domElement, r = cv.getBoundingClientRect(), info = renderer.info.render;
  return {
    viewport: `${window.innerWidth} x ${window.innerHeight}`,
    screen: `${screen.width} x ${screen.height}`,
    fullscreen: !!document.fullscreenElement || (window.innerWidth === screen.width && window.innerHeight === screen.height),
    canvasCss: `${Math.round(r.width)} x ${Math.round(r.height)}`,
    devicePixelRatio: window.devicePixelRatio,
    renderScale: renderer.getPixelRatio(),
    drawingBuffer: `${size.x} x ${size.y}`,
    megapixels: +((size.x * size.y) / 1e6).toFixed(2),
    quality: quality.level,
    msaaSamples: composer.renderTarget1.samples,
    bloom: env.bloomOn,
    cpuRenderMs: +cpuAvg.toFixed(2),
    lastPass: { calls: info.calls, triangles: info.triangles },
    stats5s: frameStats(ring.slice(-300)),
  };
}

function tick(now) {
  requestAnimationFrame(tick);
  if (lastT) { ring.push(now - lastT); if (ring.length > 1800) ring.shift(); }
  lastT = now;
  if (visible && box && ++frames % 15 === 0) {
    const d = displayInfo(), s = d.stats5s || {};
    box.textContent = `viewport ${d.viewport}  (screen ${d.screen}${d.fullscreen ? ', fullscreen' : ''})\ncanvas css ${d.canvasCss}   dpr ${d.devicePixelRatio}\nrender scale ${d.renderScale}  buffer ${d.drawingBuffer} (${d.megapixels} MP)\nquality ${d.quality}  MSAA x${d.msaaSamples}  bloom ${d.bloom}\nfps ${s.avgFps ?? '-'}   1% low ${s.low1Fps ?? '-'}\nframe ms: median ${s.medianMs ?? '-'}  p95 ${s.p95Ms ?? '-'}  p99 ${s.p99Ms ?? '-'}\nCPU render ${d.cpuRenderMs} ms   (last pass ${d.lastPass.calls} calls, ${d.lastPass.triangles} tris)`;
  }
}

/** time composer.render on the CPU side (submission cost, not GPU) */
function wrapRender() {
  const orig = composer.render.bind(composer);
  composer.render = (...a) => { const t0 = performance.now(); orig(...a); cpuRender = performance.now() - t0; cpuAvg += (cpuRender - cpuAvg) * 0.05; };
}

export function startDisplayDiag() {
  wrapRender();
  box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;margin:0;padding:8px 10px;background:rgba(0,0,0,.6);color:#9fe;font:12px/1.35 Consolas,monospace;border-radius:6px;pointer-events:none;display:none;white-space:pre';
  document.body.appendChild(box);
  const show = (v) => { visible = v; box.style.display = v ? 'block' : 'none'; };
  window.addEventListener('keydown', (e) => { if (e.key === 'F2') { show(!visible); e.preventDefault(); } });
  if (/[?&]diag=1/.test(location.search)) show(true);
  window.__display = displayInfo;
  window.__display.sample = (secs = 10) => new Promise((res) => { const start = ring.length; const t0 = performance.now(); const iv = setInterval(() => { if (performance.now() - t0 >= secs * 1000) { clearInterval(iv); res({ ...displayInfo(), measured: frameStats(ring.slice(-Math.max(2, Math.round(secs * 60 * 1.2)))) }); } }, 250); });
  requestAnimationFrame(tick);
}
