import { chromium } from 'file:///C:/Users/matta/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import assert from 'node:assert/strict';
const out = 'work/coconut-test'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], result = {}; let page;
async function boot(before = false, oldMonkey = false) {
  page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', e => { errors.push(e.message); fs.writeFileSync(`${out}/errors.json`, JSON.stringify(errors)); });
  if (before) await page.route('**/dist/island.js', r => r.fulfill({ path: 'dist/coconut-before.js', contentType: 'text/javascript' }));
  await page.goto('http://127.0.0.1:8768/?coconutReview&coconutStep&noauto' + (oldMonkey ? '&monkey=old' : ''), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__coconutReview, { timeout: 120000 });
}
async function shot(name, focus) {
  await page.evaluate(focus => { window.__coconutReview.focus(focus); window.__dbg.composer.render(); }, focus);
  const state = await page.evaluate(() => ({ camera: window.__dbg.camera.position.toArray(), target: window.__dbg.cam.target.toArray(), base: window.__coconutReview.base }));
  assert.ok(state.camera.every(Number.isFinite)); fs.writeFileSync(`${out}/${name}-view.json`, JSON.stringify(state));
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 60000 });
}
try {
  await boot(true);
  result.before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await shot('before-ground', 'ground'); await shot('before-monkey', 'monkey'); await page.close();
  await boot();
  result.after = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.deepEqual(result.after.placement, result.before.placement, 'Palm placement unchanged by prop replacement');
  assert.equal(result.after.wildlife, result.before.wildlife);
  await shot('after-state-gallery', 'gallery'); await shot('after-ground', 'ground');
  for (const state of ['whole', 'opened', 'half']) {
    await page.evaluate(state => window.__coconutReview.humanState(state), state); await shot('human-' + state, 'human');
    await page.evaluate(state => window.__coconutReview.monkeyState(state), state); await shot('monkey-' + state, 'monkey');
  }
  // LOD / tier swaps retain the existing visibility contract and coconut state.
  const monkey = await page.evaluate(() => {
    const rig = window.__coconutReview.monkey; rig.setNutState('half'); rig.setNut(true); rig.setFar(true);
    const far = { state: rig.far.nut.userData.coconut.state, far: rig.far.nut.visible, near: rig.near.nut.visible };
    rig.setFar(false); return { far, nearState: rig.near.nut.userData.coconut.state, nearVisible: rig.near.nut.visible };
  });
  assert.deepEqual(monkey, { far: { state: 'half', far: true, near: false }, nearState: 'half', nearVisible: true }); result.lod = monkey;
  // Existing ecosystem ownership: one pickup cannot be taken twice; drop uses the same public API.
  result.pickup = await page.evaluate(() => {
    const d = window.__dbg, n = d.flora.coconuts.free(d.falls.camp.x, d.falls.camp.z, 300, true);
    const p = new d.THREE.Vector3(); const before = !!d.flora.coconuts.where(n, p), first = d.flora.coconuts.take(n), second = d.flora.coconuts.take(n), after = d.flora.coconuts.where(n, p);
    d.flora.coconuts.drop(p.x, d.WORLD.getHeight(p.x, p.z) + .2, p.z);
    return { before, first, second, after: !!after };
  });
  assert.deepEqual(result.pickup, { before: true, first: true, second: false, after: false });
  // Run the existing monkey pickup/carry/eat branches with a nearby real ecosystem target.
  result.monkeyPickup = await page.evaluate(() => {
    const d = window.__dbg, m = d.creatures.find(c => c.name === 'Capuchin monkey' && c.sim.rig).sim;
    m.contest = null; m.state = 'idle';
    d.flora.coconuts.drop(m.x + .4, d.WORLD.getHeight(m.x + .4, m.z) + .13, m.z);
    const n = d.flora.coconuts.free(m.x, m.z, 2, true); const stolen = m.stolen;
    m.nutT = n; m.nutTimer = 12; m.state = 'toNut'; m.speed = 0;
    m.update(.05, 0); const carry = m.state;
    m.state = 'carry'; m.update(.05, .05); const whole = m.rig.active().nut.userData.coconut.state;
    m.state = 'eatNut'; m.t = 12; m.update(.05, .1);
    return { carry, stolen: m.stolen - stolen, whole, half: m.rig.active().nut.userData.coconut.state, duplicateTake: d.flora.coconuts.take(n) };
  });
  assert.deepEqual(result.monkeyPickup, { carry: 'carry', stolen: 1, whole: 'whole', half: 'half', duplicateTake: false });
  result.contest = await page.evaluate(() => {
    const d = window.__dbg, [h, c] = d.creatures.filter(c => c.name === 'Capuchin monkey' && c.sim.rig).slice(0, 2).map(c => c.sim);
    h.contest = c.contest = null; h.state = 'carry'; h.rig.setNutState('half'); c.state = 'idle'; c.nutCool = -1; c.x = h.x + 2; c.z = h.z; c.group.position.copy(h.group.position);
    const api = window.__coconutReview.contestTest;
    for (let i = 0; i < 50 && !c.contest; i++) { c.contestScan = -1; api.updateContests([h, c], .01); }
    return { started: !!c.contest, challengerState: c.rig.nutState, holderState: h.rig.nutState };
  });
  assert.deepEqual(result.contest, { started: true, challengerState: 'half', holderState: 'half' });
  // Existing autonomous coconut race -> crack -> sip -> need reward, without new behavior code.
  result.observerDrink = await page.evaluate(() => {
    const d = window.__dbg, man = d.creatures.find(c => c.id === 'castaway'), mind = man.sim;
    mind.needs.hunger = .2; mind.needs.fatigue = .1; mind.current = { act: 'fish', since: mind.clock, until: mind.clock + 20 };
    window.__step(.05); const p = man.group.position;
    let target;
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12, x = p.x + Math.cos(a) * .65, z = p.z + Math.sin(a) * .65;
      if (d.WORLD.getHeight(x, z) > 1 && d.WORLD.getSlope(x, z) < .3) { target = { x, z }; break; }
    }
    if (!target) throw new Error('No dry coconut test target by camp');
    d.flora.coconuts.drop(target.x, d.WORLD.getHeight(target.x, target.z) + .13, target.z);
    mind.memory.lastKind = 'fresh'; mind.current = { act: 'drink', since: mind.clock, until: mind.clock + 20 };
    const initial = mind.stats.nutDrinks, states = new Set();
    for (let i = 0; i < 900 && mind.stats.nutDrinks === initial; i++) {
      window.__step(.05); man.group.traverse(o => { if (o.visible && o.userData.coconut) states.add(o.userData.coconut.state); });
    }
    return { drinks: mind.stats.nutDrinks - initial, states: [...states], desc: man.desc };
  });
  assert.equal(result.observerDrink.drinks, 1, JSON.stringify(result.observerDrink));
  assert.ok(result.observerDrink.states.includes('whole')); assert.ok(result.observerDrink.states.includes('opened'));
  // Real survival gather/eat action: inventory and food/water effects unchanged; states progress visibly.
  await page.evaluate(() => { const sv = window.__sv; sv.open(); sv.begin(null); const p = sv.player.pos; sv.res.dropCoconut(p.x, p.z, p.y + 1, sv.hoursAbs); for (let i = 0; i < 80; i++) window.__step(.05); const n = sv.res.byKind.coconut.find(n => n.alive); sv.gatherNode(n); for (let i = 0; i < 20; i++) window.__step(.05); });
  assert.equal(await page.evaluate(() => window.__sv.count('coconut')), 1);
  result.survival = await page.evaluate(() => {
    const sv = window.__sv; sv.s.food = 40; sv.s.water = 40; sv.eat('coconut'); const states = [];
    for (let i = 0; i < 32; i++) { window.__step(.05); if (sv.avatar.props.coco.visible) states.push(sv.avatar.props.coco.userData.coconut.state); }
    return { states: [...new Set(states)], count: sv.count('coconut'), food: sv.s.food, water: sv.s.water, eaten: sv.s.stats['ate.coconut'] };
  });
  assert.equal(result.survival.count, 0); assert.equal(result.survival.eaten, 1);
  assert.ok(result.survival.food > 48); assert.ok(result.survival.water > 63);
  assert.deepEqual(result.survival.states, ['whole', 'opened', 'half']); await page.evaluate(() => window.__sv.close());
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/result.json`, JSON.stringify({ ...result, errors }, null, 2));
  console.log('Coconut in-game A/B, states, placement, monkey LOD, ownership, survival gathering and consumption passed');
} finally { fs.writeFileSync(`${out}/errors.json`, JSON.stringify(errors)); await browser.close(); }
