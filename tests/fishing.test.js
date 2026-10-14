import test from 'node:test';
import assert from 'node:assert/strict';
import { FishingSession } from '../src/fishing.js';
import { ReferencePopulation } from '../src/fishing_reference_population.js';
import { FishingOuting } from '../src/fishing_outing.js';
import { cookItems } from '../src/survival/mechanics.js';
import { makeMind } from '../src/castaway_mind.js';
const site = { id: 'pool', stand: { x: 0, z: 0 }, target: { x: 5, z: 0 }, name: 'pool' };
function seeded(seed = 901) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function fixture({ dinner = true, n = 4 } = {}) {
  const pop = new ReferencePopulation(site, n); let now = 0, rewards = [];
  const actor = { s: { inv: {}, stats: {}, xp: 70, level: 3 }, structs: [{ type: 'campfire', x: 0, z: 0, fuel: 0, get lit() { return this.fuel > 0; } }],
    get hoursAbs() { return now; }, count(id) { return this.s.inv[id] || 0; }, add(id, n = 1) { this.s.inv[id] = this.count(id) + n; }, take(id, n = 1) { assert.ok(this.count(id) >= n); this.s.inv[id] -= n; }, bump(id, n = 1) { this.s.stats[id] = (this.s.stats[id] || 0) + n; }, addXp(n) { this.s.xp += n; },
    res: { nodes: [...Array.from({ length: 8 }, (_, i) => ({ kind: 'stick', x: i + 1, z: 1, alive: true })), ...Array.from({ length: 5 }, (_, i) => ({ kind: 'fiber', x: i + 1, z: 2, alive: true }))], take(n) { n.alive = false; } } };
  const options = { population: () => pop, now: () => now, wantsDinner: () => dinner, safe: () => true, planRoute: () => [], random: seeded(), reward: k => rewards.push(k) };
  const outing = new FishingOuting(actor, options);
  function tick() { const j = outing.next({ x: 0, z: 0 }, now); now += .05 / 25; pop.update(.05); if (j) outing.update(.05, j.target, now); return j; }
  function until(predicate, max = 15000) { for (let i = 0; i < max; i++) { if (predicate()) return; tick(); } assert.fail(JSON.stringify(outing.summary())); }
  return { pop, actor, outing, options, tick, until, rewards, now: () => now };
}
test('full legitimate sequence gathers, crafts, catches, inspects, keeps, prepares, cooks and consumes one identity', () => {
  const f = fixture(); const stages = new Set();
  for (let i = 0; i < 15000 && !f.outing.state.meals; i++) { f.tick(); stages.add(f.outing.state.stage); }
  assert.equal(f.outing.state.meals, 1, JSON.stringify(f.outing.summary()));
  for (const s of ['gather', 'craft', 'cast', 'investigate', 'bite', 'fight', 'inspect', 'prepare', 'cook', 'eat']) assert.ok(stages.has(s), s);
  assert.equal(f.actor.count('rawFish'), 0); assert.equal(f.actor.count('cookedFish'), 0);
  assert.equal(f.pop.summary().retained, 1); assert.equal(f.pop.summary().borrowed, 0);
  assert.equal(f.outing.state.catches[0].status, 'eaten'); assert.equal(f.actor.s.stats.fish, 1);
  assert.deepEqual(f.rewards, ['meal']); assert.equal(f.outing.available(f.now()), false);
});
test('empty or distant population never grants a fish from elapsed time', () => {
  for (const n of [0, 1]) {
    const p = new ReferencePopulation(site, n); if (n) { p.members[0].x = 500; p.members[0].z = 500; }
    const s = new FishingSession(p, site, seeded()); for (let i = 0; i < 1600; i++) s.update(.05);
    assert.equal(s.stage, 'lost'); assert.equal(s.decide(true), false); assert.equal(p.summary().retained, 0);
  }
});
test('one fish cannot be owned by two lines; release restores the same population without food', () => {
  const f = fixture({ dinner: false, n: 1 });
  f.until(() => f.outing.session?.stage === 'fight');
  const id = f.outing.session.fishId; assert.equal(f.pop.claim(id, 'other'), false);
  f.until(() => f.outing.state.released === 1);
  assert.equal(f.actor.count('rawFish'), 0); assert.equal(f.pop.get(id).removed, false);
  assert.equal(f.pop.summary().swimming, 1); assert.equal(f.pop.summary().borrowed, 0);
  assert.equal(f.outing.available(f.now()), false);
});
test('poor control loses hooked fish; autonomous outcomes are not guaranteed', () => {
  const p = new ReferencePopulation(site, 1), s = new FishingSession(p, site, () => .01);
  for (let i = 0; i < 500; i++) s.update(.05, { strike: true });
  assert.equal(s.stage, 'lost'); assert.equal(p.summary().retained, 0); assert.equal(p.summary().borrowed, 0);
  const p2 = new ReferencePopulation(site, 1), bad = new FishingSession(p2, site, seeded());
  for (let i = 0; i < 1500 && bad.stage !== 'lost'; i++) bad.update(.05, { strike: true, reel: 1, drag: 1, lift: 1 });
  assert.equal(bad.stage, 'lost'); assert.match(bad.result.lost, /snapped/);
});
test('interrupting a hooked or landed fish returns it; interruption cannot mint inventory', () => {
  for (const stage of ['fight', 'landed']) {
    const f = fixture(); f.until(() => f.outing.session?.stage === stage);
    f.outing.pause('Danger'); assert.equal(f.pop.summary().borrowed, 0); assert.equal(f.actor.count('rawFish'), 0);
    assert.equal(f.outing.state.interruptions, 1);
  }
});
test('retained inventory, ownership tombstones, preparation and cooking survive reload without duplication', () => {
  for (const status of ['raw', 'prepared', 'cooked', 'eaten']) {
    const f = fixture(); f.until(() => f.outing.state.catches[0]?.status === status);
    const saved = JSON.parse(JSON.stringify({ inv: f.actor.s, fish: f.outing.snapshot(), pop: f.pop.snapshot() }));
    const g = fixture(); g.actor.s = saved.inv; g.outing.restore(saved.fish); g.pop.restore(saved.pop);
    assert.equal(g.pop.summary().retained, 1); assert.equal(g.pop.summary().borrowed, 0);
    if (status !== 'eaten') g.until(() => g.outing.state.meals === 1);
    assert.equal(g.actor.count('rawFish'), 0); assert.equal(g.actor.count('cookedFish'), 0);
    assert.equal(g.actor.s.stats.fish, 1); assert.equal(g.pop.summary().retained, 1);
  }
});
test('impossible routes and missing equipment back off; crafting cannot spend interrupted work', () => {
  const f = fixture(); f.options.planRoute = () => null;
  assert.equal(f.outing.next(site.stand, 0), null); assert.equal(f.outing.available(0), false);
  assert.equal(f.actor.count('rawFish'), 0);
  const g = fixture(); g.actor.add('stick', 6); g.actor.add('fiber', 4);
  const j = g.outing.next(site.stand, 0); assert.equal(j.kind, 'craft');
  g.outing.update(1, j.target, 0); g.outing.pause(); assert.equal(g.actor.count('fiber'), 4);
});
test('shared cooking checks inventory and a lit fire at completion', () => {
  const f = fixture(); f.actor.add('rawFish');
  assert.equal(cookItems(f.actor, f.actor.structs[0], 'rawFish'), false);
  f.actor.structs[0].fuel = 1; assert.deepEqual(cookItems(f.actor, f.actor.structs[0], 'rawFish'), { from: 'rawFish', to: 'cookedFish', n: 1 });
  assert.equal(cookItems(f.actor, f.actor.structs[0], 'rawFish'), false);
});
test('pending dinner respects route-failure backoff, and the last rod use consumes the worn tool', () => {
  const f = fixture(); f.until(() => f.outing.pending()?.status === 'raw');
  f.outing.job = null; f.options.planRoute = () => null;
  assert.equal(f.outing.next(site.stand, f.now()), null); assert.equal(f.outing.available(f.now()), false);
  assert.equal(f.actor.count('rawFish'), 1);
  const g = fixture(); g.actor.add('rod'); g.actor.add('stick', 2); g.outing.state.rodUses = 1;
  const job = g.outing.next(site.stand, 0); g.outing.update(.05, job.target, 0);
  assert.equal(g.actor.count('rod'), 0); assert.equal(g.outing.state.rodUses, 0);
});
test('population refusal to move a fish never yields a catch', () => {
  const p = new ReferencePopulation(site, 1); p.move = () => false;
  const s = new FishingSession(p, site, seeded()); for (let i = 0; i < 200; i++) s.update(.05);
  assert.equal(s.stage, 'lost'); assert.equal(p.summary().retained, 0); assert.equal(p.summary().borrowed, 0);
});
test('a lucky first project below rod level can earn the missing skill by real rope crafting', () => {
  const f = fixture(); f.actor.s.level = 1; f.actor.s.xp = 23;
  f.actor.addXp = n => { f.actor.s.xp += n; if (f.actor.s.xp >= 25) f.actor.s.level = 2; };
  f.until(() => f.actor.count('rod') === 1);
  assert.equal(f.actor.s.level, 2); assert.equal(f.actor.s.stats['crafted.rope'], 1);
  assert.equal(f.actor.s.stats['crafted.rod'], 1); assert.equal(f.actor.count('rawFish'), 0);
});
test('existing utility mind chooses worthwhile angling and interrupts for danger', () => {
  const m = makeMind(); const ctx = { hour: 14, rain: 0, calm: true, anglingOK: true, fishingPending: true, caught: 0 };
  assert.equal(m.choose(ctx), 'angling'); assert.equal(m.choose({ ...ctx, threat: true }), 'flee');
  const idle = makeMind(); assert.notEqual(idle.choose({ ...ctx, anglingOK: false }), 'angling');
});
