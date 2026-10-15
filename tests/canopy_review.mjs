import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = 'work/canopy-review'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const results = {}, errors = [];
try {
  for (const variant of ['baseline', 'final']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
    page.on('console', message => { if(message.type()==='error') errors.push(message.text()); });
    if (variant === 'baseline') await page.route('**/dist/island.js', r => r.fulfill({ path: 'work/baseline.js', contentType: 'text/javascript' }));
    await page.goto('http://127.0.0.1:8772/?perf=1&noauto&coconutStep', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__perfScenarios && __dbg.creatures.length > 100, { timeout: 180000 });
    await page.evaluate(() => { document.getElementById('boot').style.display = 'none'; });
    results[variant] = await page.evaluate(() => {
      const d = __dbg; d.env.tod = 11; d.env.paused = true; d.WX.wx.forced = 'clear';
      const placement = [], inventory = [];
      d.scene.traverse(o => {
        if (o.isInstancedMesh && o.userData.inspect) {
          placement.push([o.userData.inspect.key, o.count, Array.from(o.instanceMatrix.array).slice(0, o.count * 16)]);
          inventory.push({ key: o.userData.inspect.key, count: o.count, triangles: (o.geometry.index?.count || o.geometry.attributes.position.count) / 3, shadows: o.castShadow });
        }
      });
      const points = {};
      for (const key of ['treeA', 'treeB', 'banyan']) {
        const mesh = d.scene.children.find(o => o.userData.inspect?.key === key && o.count);
        const m = new d.THREE.Matrix4(); mesh.getMatrixAt(0, m);
        points[key] = new d.THREE.Vector3().setFromMatrixPosition(m).toArray();
      }
      window.__reviewCamera = null;
      d.updaters.splice(1, 0, () => { if (!__reviewCamera) return; d.camera.position.fromArray(__reviewCamera.pos); d.camera.lookAt(...__reviewCamera.target); d.cam.target.fromArray(__reviewCamera.target); });
      return { placement, inventory, points, creaturePose: d.creatures.map(c => [c.id, c.group?.position.toArray()]), creatures: d.creatures.length };
    });
    results[variant].draws=[];
    for (const key of ['treeA', 'treeB', 'banyan']) {
      const [x,y,z] = results[variant].points[key];
      const h = key === 'treeB' ? 21 : key === 'treeA' ? 9 : 10;
      for (const [view, radius, eye] of [['close', key === 'banyan' ? 30 : 17, h], ['ground', key === 'banyan' ? 30 : 16, 2.5], ['medium', 65, 22], ['far', 150, 55]]) {
        const draw=await page.evaluate(({ x,y,z,h,radius,eye }) => {
          window.__reviewCamera = { pos: [x + radius*.72, y + eye, z + radius*.69], target: [x,y+h,z] };
          for (let i = 0; i < 5; i++) __step(.02);
          const d=__dbg; d.renderer.info.reset(); d.composer.render();
          const calls=d.renderer.info.render.calls,triangles=d.renderer.info.render.triangles;
          d.renderer.shadowMap.enabled=false; d.renderer.info.reset(); d.composer.render();
          const shadowCalls=calls-d.renderer.info.render.calls,shadowTriangles=triangles-d.renderer.info.render.triangles;
          d.renderer.shadowMap.enabled=true; d.renderer.info.reset(); d.composer.render();
          let casters=0; d.scene.traverseVisible(o=>{if(o.isMesh&&o.castShadow)casters++;});
          return {calls,triangles,shadowCalls,shadowTriangles,casters};
        }, { x,y,z,h,radius,eye });
        results[variant].draws.push({key,view,...draw});
        await page.screenshot({ path: `${out}/${variant}-${key}-${view}.png` });
      }
    }
    // A neutral studio view of the actual game geometry/material, without hiding defects behind vegetation.
    for (const key of ['treeA', 'treeB', 'banyan']) {
      await page.evaluate(key => {
        const d = __dbg, T = d.THREE;
        const source = d.scene.children.find(o => o.userData.inspect?.key === key && o.count);
        const gallery = new T.Scene(); gallery.background = new T.Color('#8ca9b5');
        gallery.add(new T.HemisphereLight(0xc8e9ff, 0x657849, 2));
        const sun = new T.DirectionalLight(0xffedce, 3); sun.position.set(18,30,24); gallery.add(sun);
        const tree = new T.Mesh(source.geometry, source.material); gallery.add(tree);
        const h = key === 'treeB' ? 23 : key === 'treeA' ? 10 : 10;
        source.geometry.computeBoundingSphere(); const radius=source.geometry.boundingSphere.radius;
        const distance=radius*2.8, centre=source.geometry.boundingSphere.center;
        const camera = new T.PerspectiveCamera(48, innerWidth/innerHeight, .1, 300);
        camera.position.set(centre.x+distance*.68,centre.y+distance*.22,centre.z+distance*.70); camera.lookAt(centre);
        d.renderer.render(gallery, camera); window.__canopyStudio={scene:gallery,camera};
      }, key);
      await page.screenshot({ path: `${out}/${variant}-${key}-studio.png` });
      if(variant==='final' && key==='banyan') {
        await page.evaluate(()=>{for(let i=0;i<60;i++)__step(.05);__dbg.renderer.render(__canopyStudio.scene,__canopyStudio.camera);});
        await page.screenshot({path:`${out}/final-banyan-wind.png`});
      }
      await page.evaluate(()=>{const s=__canopyStudio, geo=s.scene.children.find(o=>o.isMesh).geometry, b=geo.boundingSphere; s.camera.position.set(b.center.x+b.radius*1.8,2.5,b.center.z+b.radius*1.8); s.camera.lookAt(b.center);__dbg.renderer.render(s.scene,s.camera);});
      await page.screenshot({path:`${out}/${variant}-${key}-studio-ground.png`});
    }
    if (variant === 'final') {
      results.final.lods = await page.evaluate(() => __vegetationStats());
      results.final.profile = await page.evaluate(() => { __dbg.env.paused = false; window.__reviewCamera=null; return __perfProfileManual('wideIsland', 240); });
      // Exercise real follow-camera fade registration, activation, and release.
      results.final.occlusion = await page.evaluate(() => {
        const d = __dbg; __reviewCamera = null;
        __cam.follow(d.creatures.find(c => c.name === 'Wild boar'));
        for (let i = 0; i < 150; i++) __step(.04);
        const following = { ...__cam.occlusion.stats };
        __cam.release(); for (let i = 0; i < 100; i++) __step(.04);
        return { following, released: { ...__cam.occlusion.stats } };
      });
      await page.evaluate(p => { const [x,y,z]=p; window.__reviewCamera={pos:[x+38,y+18,z+36],target:[x,y+9,z]}; __dbg.env.paused=true; __dbg.env.tod=11; __dbg.WX.wx.forced='shower'; for(let i=0;i<600;i++)__step(.05); __dbg.composer.render(); },results.final.points.banyan);
      await page.screenshot({path:`${out}/final-rain.png`});
      await page.evaluate(() => { __dbg.env.tod = 22; __dbg.WX.wx.forced='clear'; for (let i=0;i<600;i++) __step(.05); __dbg.composer.render(); });
      await page.screenshot({ path: `${out}/final-night.png` });
      results.final.rigs=await page.evaluate(()=>({count:__rigRender.pruner.count,...__rigRender.stats}));
    }
    await page.close();
  }
  assert.deepEqual(results.final.placement, results.baseline.placement, 'All static inspection instances and exact transforms unchanged');
  assert.equal(results.final.creatures, results.baseline.creatures);
  assert.deepEqual(results.final.creaturePose,results.baseline.creaturePose,'Initial wildlife transforms unchanged');
  assert.ok(results.final.occlusion.following.built);
  assert.equal(results.final.occlusion.released.active, 0);
  assert.equal(errors.length, 0);
  fs.writeFileSync(`${out}/results.json`, JSON.stringify({ ...results, errors }, null, 2));
  console.log('PASS: deterministic placement, populations, follow occlusion release, page errors');
  console.log(JSON.stringify(results.final.profile));
} finally { await browser.close(); }
