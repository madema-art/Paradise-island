import { chromium } from 'file:///C:/Users/matta/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import assert from 'node:assert/strict';
const out = 'work/fishing-test'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
const errors = [], history = [], shots = new Set(); let interrupted = false, reloaded = false;
await page.addInitScript(() => { let seed = 901; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; });
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
const text = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
async function boot() {
  await page.waitForFunction(() => !!window.__dbg && !!window.render_game_to_text, { timeout: 120000 });
  await page.evaluate(() => { document.querySelector('#boot').style.display = 'none'; document.body.classList.remove('hidden-ui'); document.querySelector('#side').style.display = 'none'; document.querySelector('#dock').style.display = 'none'; });
}
async function shot(stage) {
  await page.evaluate(stage => { for (let i = 0; i < (stage === "cook" ? 60 : 12); i++) window.__step(.05); }, stage);
  await page.evaluate(() => {
    const d = window.__dbg, c = d.creatures.find(c => c.id === 'castaway').group.position;
    d.cam.goto([c.x + 3.8, c.y + 2.8, c.z + 4.5], [c.x, c.y + 1.1, c.z]);
    d.composer.render();
  });
  await page.screenshot({ path: `${out}/${stage}.png` }); shots.add(stage);
}
try {
  await page.goto('http://127.0.0.1:8767/?lifeReview&fishingReview&noauto', { waitUntil: 'domcontentloaded' }); await boot();
  await page.click('#cwneeds .cw-head');
  assert.equal(await page.evaluate(() => window.__dbg.cam.follow?.id), 'castaway');
  let s = await text(); assert.equal(s.life.fishing.connected, true); const wildlife = s.wildlife;
  await page.keyboard.press('p'); const before = await text(); await page.evaluate(() => window.advanceTime(200)); assert.deepEqual((await text()).position, before.position); await page.keyboard.press('p');
  for (let i = 0; i < 600; i++) {
    const previous = s.life.fishing.stage;
    s = await page.evaluate(previous => {
      for (let n = 0; n < 100; n++) { window.__step(.05); const s = JSON.parse(window.render_game_to_text()); if (s.life.fishing.stage !== previous) return s; }
      return JSON.parse(window.render_game_to_text());
    }, previous);
    history.push(s); fs.writeFileSync(`${out}/live.json`, JSON.stringify(s, null, 2));
    const f = s.life.fishing;
    if (['fight', 'inspect', 'transport', 'prepare', 'cook', 'eat'].includes(f.stage) && !shots.has(f.stage)) await shot(f.stage);
    if (f.stage === 'fight' && !interrupted) {
      const inv = s.life.inventory; await page.evaluate(() => { window.__sv.open(); window.__step(.05); });
      const paused = await text(); assert.deepEqual(paused.life.inventory, inv); assert.equal(paused.life.fishing.population.borrowed, 0);
      await page.evaluate(() => window.__sv.close()); interrupted = true;
    }
    if (f.pending?.status === 'raw' && f.stage === 'prepare' && f.job?.elapsed > 0 && !reloaded) {
      assert.equal(f.population.retained, 1); assert.equal(s.life.inventory.rawFish, 1);
      const fire = s.life.structures[0]; assert.ok(Math.hypot(s.position[0] - (fire.x + 1.8), s.position[2] - fire.z) < 1, 'Walked all the way home before reload');
      await page.reload({ waitUntil: 'domcontentloaded' }); await boot();
      const restored = await text(); assert.equal(restored.life.inventory.rawFish, 1); assert.equal(restored.life.fishing.population.retained, 1);
      reloaded = true; s = restored;
    }
    if (f.meals === 1) break;
  }
  s = await text();
  assert.equal(s.life.fishing.meals, 1, JSON.stringify(s)); assert.equal(s.life.completed, true);
  assert.equal(s.life.fishing.population.retained, 1); assert.equal(s.life.fishing.population.borrowed, 0);
  assert.equal(s.life.inventory.rawFish, 0); assert.equal(s.life.inventory.cookedFish, 0);
  assert.equal(s.wildlife, wildlife); assert.ok(interrupted); assert.ok(reloaded);
  for (const key of ['fight', 'inspect', 'transport', 'prepare', 'cook', 'eat']) assert.ok(shots.has(key), key);
  assert.deepEqual(errors, []);
  await page.goto('http://127.0.0.1:8767/?lifeReview&noauto', { waitUntil: 'domcontentloaded' }); await boot();
  const normal = await text(); assert.equal(normal.life.fishing.connected, false); assert.equal(normal.life.fishing.catches.length, 0); assert.equal(normal.life.completed, false);
  fs.writeFileSync(`${out}/result.json`, JSON.stringify({ isolatedReferencePopulation: true, normalSaveIsolation: true, interrupted, reloaded, final: s, errors, stages: [...new Set(history.map(s => s.life.fishing.stage))] }, null, 2));
  console.log('Full real-game review sequence passed, including hooked interruption and retained-fish reload');
} finally { fs.writeFileSync(`${out}/history.json`, JSON.stringify(history, null, 2)); fs.writeFileSync(`${out}/errors.json`, JSON.stringify(errors)); await browser.close(); }
