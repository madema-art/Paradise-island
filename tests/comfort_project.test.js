import test from 'node:test';
import assert from 'node:assert/strict';
import { ComfortProject } from '../src/comfort_project.js';
import { gatherResource, constructRecipe, awardRecipe, fuelFire } from '../src/survival/mechanics.js';
import { RECIPES } from '../src/survival/items.js';
import { makeMind } from '../src/castaway_mind.js';
import { findProjectPath } from '../src/project_path.js';

function fixture({ empty = false } = {}) {
  let rewards = 0, saved = 0;
  const a = { s: { level: 1, inv: {}, stats: {} }, structs: [], hoursAbs: 0,
    count(id) { return this.s.inv[id] || 0; }, add(id, n = 1) { this.s.inv[id] = this.count(id) + n; },
    take(id, n = 1) { this.s.inv[id] = this.count(id) - n; }, bump(k, n = 1) { this.s.stats[k] = (this.s.stats[k] || 0) + n; }, addXp() {},
    res: { nodes: empty ? [] : ['stick','stick','stick','stick','stick','stick','stone','stone','stone','stone'].map((kind, i) => ({ kind, x: i, z: 0, alive: true })), take(n) { n.alive = false; } } };
  const o = { findSite: () => ({ x: 1, z: 3 }), canPlace: () => null, safe: () => true, random: () => .99,
    create: (type, x, z) => ({ type, x, z, fuel: 0 }), reward: () => rewards++, save: () => saved++ };
  const p = new ComfortProject(a, o); return { a, p, o, rewards: () => rewards, saved: () => saved };
}
test('plan, gather real nodes, spend recipe costs, build, fuel and enjoy exactly once', () => {
  const f = fixture(); let result; const actions = [];
  for (let i = 0; i < 20 && !f.p.state.completed; i++) { const j = f.p.next({ x: 0, z: 0 }, 0); assert.ok(j); actions.push(j.kind); result = f.p.update(j.duration, j.target, 0); }
  assert.equal(result.completed, true); assert.equal(f.a.structs.length, 1); assert.equal(f.a.structs[0].fuel, 1.4);
  assert.equal(f.a.count('stick'), 0); assert.equal(f.a.count('stone'), 0); assert.equal(f.a.res.nodes.filter(n => n.alive).length, 0);
  assert.deepEqual(actions.slice(-3), ['build','fuel','enjoy']); assert.equal(f.rewards(), 1); assert.ok(f.saved() > 10);
  for (let i = 0; i < 100; i++) assert.equal(f.p.next({ x: 0, z: 0 }, 100), null);
  assert.equal(f.rewards(), 1);
});
test('interruption loses only animation time, resumes with existing inventory, and restore never grants unfinished work', () => {
  const f = fixture(); const j = f.p.next({ x: 0, z: 0 }, 0); f.p.update(.3, j.target, 0); f.p.pause('boar');
  assert.equal(f.a.count('stick'), 0); assert.equal(j.node.alive, true); assert.equal(f.p.state.interruptions, 1);
  const saved = f.p.snapshot(); f.p.restore(saved); assert.equal(f.p.job, null);
  const retry = f.p.next(j.target, 0); f.p.update(.8, retry.target, 0); assert.equal(f.a.count('stick'), 1);
});
test('interrupting construction and later enjoyment never spends twice or builds duplicate fires', () => {
  const f=fixture();f.a.s.inv={stick:6,stone:4};
  let j=f.p.next({x:0,z:0},0);f.p.update(2,j.target,0);f.p.pause('rain');
  assert.equal(f.a.count('stick'),6);assert.equal(f.a.structs.length,0);
  j=f.p.next(j.target,0);f.p.update(4,j.target,0);assert.equal(f.a.structs.length,1);assert.equal(f.a.count('stick'),1);
  j=f.p.next(j.target,0);f.p.update(1,j.target,0);j=f.p.next(j.target,0);f.p.update(2,j.target,0);f.p.pause('boar');
  j=f.p.next(j.target,0);f.p.update(6,j.target,0);assert.equal(f.a.structs.length,1);assert.equal(f.rewards(),1);
});
test('missing resources and unreachable targets back off rather than loop or grant inventory', () => {
  const f = fixture({ empty: true }); assert.equal(f.p.next({ x: 0, z: 0 }, 0), null); assert.equal(f.p.available(1), false);
  assert.match(f.p.state.reason, /Not enough/); assert.deepEqual(f.a.s.inv, {});
  const g = fixture(); g.p.next({ x: -100, z: 0 }, 0); g.p.update(61, { x: -100, z: 0 }, 0);
  assert.equal(g.p.available(1), false); assert.equal(g.a.structs.length, 0); assert.equal(g.a.count('stick'), 0);
});
test('local ground route goes around an obstacle and refuses an impassable enclosure', () => {
  const from={x:0,z:0},to={x:6,z:0};
  const path=findProjectPath(from,to,p=>Math.hypot(p.x-3,p.z)>1.4,()=>1);
  assert.ok(path?.length>1);assert.deepEqual(path.at(-1),to);
  assert.equal(findProjectPath(from,to,p=>p.x<1,()=>1),null);
});
test('stale node, unsafe area, changed site, or lost materials cannot complete an action', () => {
  const f = fixture(); const j = f.p.next({ x: 0, z: 0 }, 0); j.node.alive = false; f.p.update(5, j.target, 0); assert.equal(f.a.count('stick'), 0);
  assert.equal(gatherResource(f.a, j.node), false);
  const g = fixture(); g.a.s.inv = { stick: 6, stone: 4 }; const b = g.p.next({ x: 0, z: 0 }, 0);
  g.o.canPlace = () => 'too steep'; g.p.update(5, b.target, 0); assert.equal(g.a.structs.length, 0); assert.equal(g.a.count('stick'), 6);
  const h = fixture(); h.p.next({ x: 0, z: 0 }, 0); h.o.safe = () => false; h.p.update(5, { x: 0, z: 0 }, 0); assert.equal(h.p.available(1), false);
});
test('classic recipe/tool rewards and construction keep costs, skill gates and statistics', () => {
  const f = fixture(); f.a.s.inv = { stick: 6, stone: 4 };
  let r = constructRecipe(f.a, RECIPES.find(r => r.id === 'campfire'), { x: 1, z: 1 }, () => null, f.o.create);
  assert.ok(r.structure); assert.equal(f.a.count('stick'), 1); assert.equal(f.a.s.stats['built.campfire'], 1);
  assert.equal(fuelFire(f.a, r.structure).wasOut, true); assert.equal(f.a.count('stick'), 0);
  assert.equal(fuelFire(f.a, r.structure), false);
  assert.ok(constructRecipe(f.a, RECIPES.find(r => r.id === 'shelter'), { x: 1, z: 1 }, () => null, f.o.create).error);
  awardRecipe(f.a, RECIPES.find(r => r.id === 'rope')); assert.equal(f.a.count('rope'), 1);
});
test('existing mind chooses comfort when safe; danger interrupts; completed work is unavailable', () => {
  const m = makeMind(); const ctx = { hour: 10, rain: 0, projectOK: true, caught: 0, calm: true };
  assert.equal(m.choose(ctx), 'project'); assert.equal(m.choose({ ...ctx, threat: true }), 'flee');
  m.finish(); assert.notEqual(m.choose({ ...ctx, projectOK: false }), 'project');
});
