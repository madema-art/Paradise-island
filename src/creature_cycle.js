// Creature cycling for the left and right buttons (ported from the assets workshop's viewer/osd/cycle.js, 94068aa, onto the game's live
// creature registry, which is the one `creatures` array in core.js).
//
// Rule:
//  - Focused on a creature whose species has more than one live individual: left and right go to the previous and next individual of
//    that species, in a fixed order, wrapping round (crab 1, crab 2, crab 3, crab 1 ...).
//  - Otherwise (not focused, or the species has one live individual): left and right go through all live creatures in one fixed order
//    (category, species name, individual number). From nothing, the first press starts at the creature nearest the camera.
//
// "Live" means on show (its group is visible), alive (the rats and other animals that can be eaten or removed report alive = false),
// and not removed. Hidden helpers are never in the registry's visible set, so they are skipped too.
import { creatures } from './core.js';

const CAT_ORDER = ['People', 'Mammals', 'Birds', 'Reptiles', 'Sea life', 'Shore life'];

// the individual number is the order of registration within the species (stable when others are removed)
let indexKey = -1, individual = new Map();
function individualOf(c) {
  if (indexKey !== creatures.length) {
    individual = new Map();
    const count = new Map();
    for (const x of creatures) {
      const n = (count.get(x.name) || 0) + 1;
      count.set(x.name, n);
      individual.set(x, n);
    }
    indexKey = creatures.length;
  }
  return individual.get(c) || 0;
}

export function isLive(c) {
  return !!c && !!c.group && c.group.visible !== false && c.sim?.alive !== false && !c.removed;
}

export function liveCreatures() {
  return creatures.filter(isLive);
}

function rank(c) {
  const ci = CAT_ORDER.indexOf(c.cat);
  return [ci < 0 ? 99 : ci, c.name, individualOf(c)];
}

/** all the given creatures in the one fixed order used for the global cycle */
export function viewOrder(list) {
  return list.slice().sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra[0] !== rb[0]) return ra[0] - rb[0];
    if (ra[1] !== rb[1]) return ra[1] < rb[1] ? -1 : 1;
    return ra[2] - rb[2];
  });
}

/** the live individuals of one species, in order */
export function speciesOf(name) {
  return viewOrder(liveCreatures().filter((c) => c.name === name));
}

/** the next (dir 1) or previous (dir -1) individual of the focus's species, or null when that species has one live individual */
export function nextInSpecies(focus, dir) {
  if (!focus) return null;
  const group = speciesOf(focus.name);
  if (group.length < 2) return null;
  const i = group.indexOf(focus);
  if (i < 0) return dir > 0 ? group[0] : group[group.length - 1];
  return group[(i + dir + group.length) % group.length];
}

/** the next (dir 1) or previous (dir -1) live creature in the global order; from nothing, the one nearest the camera first */
export function nextView(focus, dir, cameraPos, pos) {
  const order = viewOrder(liveCreatures());
  if (!order.length) return null;
  if (!focus) {
    let best = order[0], bd = Infinity;
    for (const c of order) {
      const p = pos(c);
      const d = Math.hypot(p.x - cameraPos.x, p.y - cameraPos.y, p.z - cameraPos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  const i = order.indexOf(focus);
  if (i < 0) return dir > 0 ? order[0] : order[order.length - 1];
  return order[(i + dir + order.length) % order.length];
}

/** what left (dir -1) and right (dir 1) do in play mode */
export function cycleFocus(focus, dir, cameraPos, pos) {
  return nextInSpecies(focus, dir) || nextView(focus, dir, cameraPos, pos);
}

/** a label for the focus card: the category, and the place in the species when there is more than one individual */
export function focusMeta(c) {
  const group = speciesOf(c.name);
  const i = group.indexOf(c);
  return c.cat + (group.length > 1 && i >= 0 ? ` · ${i + 1} of ${group.length}` : '');
}
