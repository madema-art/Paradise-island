// Run from repo root. Requires Playwright installed locally or PLAYWRIGHT_MODULE.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const variantArg = process.argv[2] || 'baseline';
const rounds = Number(process.argv[3] || 1);
const campOnly = process.argv.includes('--camp-only');
const out = 'docs/performance/canopy'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-background-timer-throttling'] });
const errors = [];
try {
  for (let round = 1; round <= rounds; round++) for (const variant of variantArg === 'compare' ? (round % 2 ? ['baseline', 'final'] : ['final', 'baseline']) : [variantArg]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR', e.message); });
    if (variant === 'baseline') await page.route('**/dist/island.js', r => r.fulfill({ path: 'work/baseline.js', contentType: 'text/javascript' }));
    await page.goto('http://127.0.0.1:8772/?perf=1&noauto', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__perfScenarios && window.__dbg?.creatures.length > 100, { timeout: 180000 });
    await page.evaluate(() => { __dbg.env.tod = 10; __dbg.env.paused = false; __dbg.WX.wx.forced = 'clear'; });
    await page.waitForTimeout(12000);
    const env = await page.evaluate(() => { const gl = __dbg.renderer.getContext(); return { gpu: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL), visibility: document.visibilityState }; });
    console.log(variant, round, env);
    if (/swiftshader|llvmpipe|software/i.test(env.gpu)) throw new Error('Hardware rendering required');
    // A fixed real banyan, found by its stable inspection tag, in addition to the built-in scenarios.
    await page.evaluate(() => {
      const d = __dbg, trees = []; d.scene.traverse(o => { if (o.userData.inspect?.key === 'banyan') trees.push(o); });
      const m = new d.THREE.Matrix4(); trees[0].getMatrixAt(0, m); const p = new d.THREE.Vector3().setFromMatrixPosition(m);
      window.__canopyPoint = p.toArray();
      window.__rangeBench = 0;
      d.updaters.splice(1, 0, () => { d.env.tod = window.__benchNight ? 22 : 10; d.env.paused = false; if (window.__benchSnapshotPose) { d.camera.position.fromArray(__benchSnapshotPose.pos); d.camera.quaternion.fromArray(__benchSnapshotPose.quaternion); d.cam.target.fromArray(__benchSnapshotPose.target); return; } if (window.__rangeBench) { const f = Math.min(1, (performance.now() - __rangeBench) / 21000), r = 12 + f * 240; d.camera.position.set(p.x + r*.72, p.y + 8 + f*75, p.z + r*.69); d.camera.lookAt(p.x,p.y+10,p.z); d.cam.target.set(p.x,p.y+10,p.z); return; } if (window.__campBench) { const c=d.falls.camp, y=d.WORLD.getHeight(c.x,c.z); d.camera.position.set(c.x+8,y+3,c.z+10); d.camera.lookAt(c.x,y+1.2,c.z); d.cam.target.set(c.x,y+1.2,c.z); return; } if (!window.__banyanBench) return; d.camera.position.set(p.x + 38, p.y + 18, p.z + 36); d.camera.lookAt(p.x, p.y + 9, p.z); d.cam.target.set(p.x, p.y + 9, p.z); });
    });
    const results = [];
    for (const key of campOnly ? ['campView'] : ['wideIsland', 'jungle48', 'banyan', 'followPig', 'castawayEye', 'nightRats', 'moving']) {
      await page.evaluate(on => { window.__benchSnapshotPose = null; window.__benchNight = on === 'nightRats'; window.__campBench = on === 'campView'; window.__banyanBench = on === 'banyan'; window.__rangeBench = on === 'moving' ? performance.now() : 0; }, key);
      const r = await page.evaluate(async key => { const r = await window.__perfScenarios.run([key === 'banyan' || key === 'campView' ? 'lagoon' : key], ['high']); r.camera = { pos: __dbg.camera.position.toArray(), quaternion: __dbg.camera.quaternion.toArray(), target: __dbg.cam.target.toArray() }; window.__benchSnapshotPose = r.camera; return r; }, key);
      r.results[0].scenario = key; r.results[0].frameMsMeanFromFps = +(1000 / r.results[0].fpsAverage).toFixed(3); results.push(r.results[0]);
      const counts = await page.evaluate(() => {
        let shadows = 0, instances = 0, families = 0; const placement = [];
        __dbg.scene.traverse(o => { if (o.visible && o.castShadow && o.isMesh) shadows++; if (o.isInstancedMesh && o.userData.inspect) { instances += o.count; families++; placement.push([o.userData.inspect.key, o.count, Array.from(o.instanceMatrix.array)]); } });
        return { shadows, instances, families, placement, lod: window.__vegetationStats?.(), rigs: window.__rigRender ? { count: __rigRender.pruner.count, ...__rigRender.stats } : null, occlusion: window.__cam.occlusion.stats };
      });
      counts.placementSha256 = createHash('sha256').update(JSON.stringify(counts.placement)).digest('hex'); delete counts.placement;
      fs.writeFileSync(`${out}/${variant}-${round}-${key}.json`, JSON.stringify({ environment: r.environment, result: r.results[0], counts, errors }, null, 2));
      console.log(key, JSON.stringify(r.results[0]));
      await page.screenshot({ path: `${out}/${variant}-${round}-${key}.png` });
    }
    fs.writeFileSync(`${out}/${variant}-${round}${campOnly ? '-camp' : ''}.json`, JSON.stringify({ environment: env, results, errors }, null, 2));
    await page.close();
  }
} finally { await browser.close(); }
if (errors.length) throw new Error(JSON.stringify(errors));
