import { ITEMS } from './items.js';
// Actor-neutral transactions. Presentation, timers, movement and persistence belong to the caller.
export const canAfford = (actor, cost) => Object.entries(cost).every(([id, n]) => actor.count(id) >= n);
export function spend(actor, cost) {
  if (!canAfford(actor, cost)) return false;
  for (const [id, n] of Object.entries(cost)) actor.take(id, n);
  return true;
}
export function gatherResource(actor, node, random = Math.random) {
  if (!node?.alive || !['stick', 'stone', 'fiber', 'coconut', 'clam'].includes(node.kind)) return false;
  const kind = node.kind;
  actor.res.take(node, actor.hoursAbs);
  const n = kind === 'stick' ? (random() < .35 ? 2 : 1) : kind === 'fiber' ? (random() < .3 ? 3 : 2) : 1;
  actor.add(kind, n);
  const pearl = kind === 'clam' && random() < .05;
  if (pearl) actor.add('pearl', 1);
  actor.bump('gathered.' + kind); actor.addXp(kind === 'clam' ? 2 : 1);
  return { kind, n, pearl };
}
export function awardRecipe(actor, recipe) {
  actor.add(recipe.gives, recipe.n || 1); actor.bump('crafted.' + recipe.id); actor.addXp(recipe.xp || 5);
}
export function constructRecipe(actor, recipe, pos, canPlace, create) {
  if (!recipe?.place || recipe.level > actor.s.level || !canAfford(actor, recipe.cost)) return { error: 'Materials or skill are missing' };
  const error = canPlace(recipe.place, pos.x, pos.z, actor.structs);
  if (error) return { error };
  const structure = create(recipe.place, pos.x, pos.z, pos.yaw || 0);
  spend(actor, recipe.cost); actor.bump('built.' + recipe.place); actor.addXp(recipe.xp || 10);
  return { structure };
}
export function fuelFire(actor, fire, maxFuel = 6) {
  if (!fire || fire.type !== 'campfire' || fire.fuel >= maxFuel || !actor.count('stick')) return false;
  const wasOut = fire.fuel <= 0; actor.take('stick'); fire.fuel = Math.min(maxFuel, fire.fuel + 1.4);
  if (wasOut) { actor.bump('lit'); actor.addXp(4); }
  return { wasOut };
}
export function cookItems(actor, fire, id, n = 1) {
  const to = ITEMS[id]?.cooks;
  if (!fire?.lit || !to || !Number.isInteger(n) || n < 1 || actor.count(id) < n) return false;
  actor.take(id, n); actor.add(to, n); actor.bump('cooked', n); actor.addXp(3 * n);
  return { from: id, to, n };
}
