// Everything the player can do with E and F: which actions are on offer right now, and what each one does.
import * as THREE from 'three';
import { env, events, creatures } from '../core.js';
import { getHeight, riverSurface, falls, SPRING, COVE } from '../world.js';
import { waterAt } from '../ripples.js';
import { nearStation, climbRoute } from '../climb.js';
import { palms } from '../flora.js';
import { fx } from '../props.js';
import { ITEMS } from './items.js';
import { BUILD } from './structures.js';
import { rr, rnd, pick, clamp, TAU } from '../util.js';

const REACH = 2.35;

/* ------------------------------------------------------------ water */
export const seaLevel = () => env.tide;
/** 'fresh' for streams and pools, 'sea' for the ocean, 'hot' for the spring, null for dry land (one source of truth: ripples.js) */
export function waterKind(x, z) { return waterAt(x, z).kind; }
/** water depth at a point */
export function depthAt(x, z) { return waterAt(x, z).depth; }
/** fresh water within reach of the player? */
function freshNear(p, h) {
  for (let r = 0.8; r <= 2.4; r += 0.8) for (let a = 0; a < 8; a++) {
    const x = p.x + Math.cos(a * 0.785) * r, z = p.z + Math.sin(a * 0.785) * r;
    if (waterKind(x, z) === 'fresh') return true;
  }
  return waterKind(p.x, p.z) === 'fresh';
}
/** the first spot of water straight ahead, 4 to 9 m out, or null */
export function waterAhead(p, heading) {
  const sx = Math.sin(heading), sz = Math.cos(heading);
  for (let d = 3.5; d <= 9.5; d += 0.5) {
    const x = p.x + sx * d, z = p.z + sz * d, k = waterKind(x, z);
    if (k === 'sea' || k === 'fresh') { if (depthAt(x, z) > 0.45) return { x: x + sx * 1.5, z: z + sz * 1.5, kind: k, d }; }
  }
  return null;
}

/* ------------------------------------------------------------ what is on offer */
export function nodeLabel(n, g) {
  switch (n.kind) {
    case 'stick': return { label: 'Pick up sticks', run: () => g.gatherNode(n) };
    case 'stone': return { label: 'Pick up a stone', run: () => g.gatherNode(n) };
    case 'fiber': return { label: 'Pull plant fibre', run: () => g.gatherNode(n) };
    case 'coconut': return { label: 'Pick up the coconut', run: () => g.gatherNode(n) };
    case 'clam': return { label: 'Dig up a clam', run: () => g.gatherNode(n) };
    case 'log': return g.count('axe') ? { label: 'Chop the driftwood log', run: () => g.chopLog(n) } : { label: 'A big log', note: 'needs a stone axe', off: true };
  }
  return null;
}

/** all actions near the player, best first. Each: {id, key, label, note, off, prio, dist, run} */
export function collectActions(g) {
  const p = g.player.pos, out = [];
  const add = (a) => { a.dist = a.dist ?? 0; out.push(a); };
  // pickups
  const near = g.res.near(p.x, p.z, REACH + 0.2, g._near || (g._near = []));
  for (const n of near) {
    const a = nodeLabel(n, g); if (!a) continue;
    const d = Math.hypot(n.x - p.x, n.z - p.z);
    add({ id: 'node' + n.kind + n.i, prio: a.off ? 0.5 : 3, dist: d, ...a });
  }
  // crates
  for (const c of g.res.crates) {
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < 2.8) add({ id: 'crate', label: 'Open the crate', prio: 5, dist: d, run: () => g.openCrate(c) });
  }
  // palms
  let bestPalm = null, bd = 1e9;
  for (let i = 0; i < palms.length; i++) {
    const a = palms[i], d = Math.hypot(a.x - p.x, a.z - p.z);
    if (d < 2.7 && d < bd) { bd = d; bestPalm = i; }
  }
  if (bestPalm != null) {
    const ready = (g.s.palmCD[bestPalm] || 0) <= g.hoursAbs;
    add({ id: 'palm', prio: 2.5, dist: bd, ...(ready ? { label: 'Shake the palm', note: 'coconuts and fronds', run: () => g.shakePalm(bestPalm) } : { label: 'This palm is bare for now', off: true }) });
  }
  // buildings
  for (const s of g.structs) {
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (s.type === 'campfire' && d < 2.8) {
      const raw = g.count('rawFish') + g.count('rawCrab') + g.count('clam');
      if (s.fuel > 0 && raw) add({ id: 'cook', prio: 4.5, dist: d, label: 'Cook your food', note: `${raw} item${raw > 1 ? 's' : ''}`, run: () => g.cook(s) });
      if (g.count('stick')) add({ id: 'wood', prio: s.fuel > 0 ? 3.2 : 4.4, dist: d, label: s.fuel > 0 ? 'Add a stick to the fire' : 'Light the fire with a stick', note: s.fuel > 0 ? `burns ${fmtHours(s.fuel)}` : '', run: () => g.feedFire(s) });
      else add({ id: 'wood', prio: 1, dist: d, off: true, label: s.fuel > 0 ? `Fire burning (${fmtHours(s.fuel)})` : 'The fire is out', note: 'needs a stick' });
    }
    if (s.type === 'shelter' && d < 3.4) {
      const can = g.canSleep();
      add({ id: 'sleep', prio: 4, dist: d, label: can ? 'Sleep in the shelter' : 'Not tired yet', note: can ? '' : 'sleep when it is dark or you are tired', off: !can, run: () => g.sleep(s) });
    }
    if (s.type === 'rack' && d < 2.6) {
      const ready = s.slots.findIndex((v) => v > 0 && v <= 0.0003);
      const free = s.slots.findIndex((v) => v === 0);
      const raw = g.count('rawFish') + g.count('rawCrab');
      if (ready >= 0) add({ id: 'rackget', prio: 4.2, dist: d, label: 'Take the dried fish', run: () => g.rackCollect(s) });
      if (free >= 0 && raw) add({ id: 'rackput', prio: 3.6, dist: d, label: 'Hang fish to dry', note: 'takes a couple of hours', run: () => g.rackHang(s) });
      else if (ready < 0) add({ id: 'rackinfo', prio: 0.8, dist: d, off: true, label: s.slots.some((v) => v > 0) ? 'Fish are drying…' : 'The rack is empty', note: raw ? '' : 'bring raw fish' });
    }
    if (s.type === 'raft' && d < 4.2) add({ id: 'raft', prio: 6, dist: d, label: 'Sail away!', note: 'leave the island', run: () => g.sailAway(s) });
  }
  // the climb up Mount Ignis
  if (climbRoute.ready && !g.climber.active) {
    const stn = nearStation(p.x, p.z, 3.4);
    if (stn) add({ id: 'climb', prio: 5.5, dist: 0, label: stn.id === 'top' ? 'Climb down' : stn.id === 'base' ? 'Climb the Ascent' : 'Keep climbing', note: stn.id === 'base' ? 'a bare-rock climb to the crater rim' : stn.id === 'top' ? '' : 'a rest ledge', run: () => g.startClimb(stn) });
  }
  // crabs
  for (const c of creatures) {
    if (!/crab/i.test(c.name) || !c.group.visible) continue;
    const d = Math.hypot(c.group.position.x - p.x, c.group.position.z - p.z);
    if (d < 2.6) add({ id: 'crab', prio: 2.8, dist: d, label: g.count('spear') ? 'Spear the crab' : 'Grab the crab', note: g.count('spear') ? '' : 'it may pinch', run: () => g.catchCrab(c) });
  }
  // water
  if (!g.player.swimming) {
    if (freshNear(p)) {
      if (g.s.water < 98) add({ id: 'drink', prio: 2.4, dist: 1.2, label: 'Drink', note: 'fresh water', run: () => g.drinkWater() });
      else add({ id: 'drink', prio: 0.6, dist: 1.2, off: true, label: 'You are not thirsty' });
      if (g.count('canteen') && g.s.dur.canteen < ITEMS.canteen.uses) add({ id: 'fill', prio: 2.3, dist: 1.25, label: 'Fill your canteen', run: () => g.fillCanteen() });
    } else if (waterKind(p.x, p.z) === 'sea' || nearSea(p)) {
      add({ id: 'sea', prio: 0.4, dist: 2, off: true, label: 'Salt water', note: 'not for drinking' });
    }
    const wa = waterAhead(p, g.player.heading);
    const deep = g.player.pos.y < seaLevel() - 0.2;      // wading
    if (wa && g.count('rod') && !deep) add({ id: 'fish', prio: 2.2, dist: 1.4, label: 'Cast a line', note: wa.kind === 'sea' ? 'sea fishing' : 'freshwater', run: () => g.startFishing(wa) });
    else if (wa && !g.count('rod') && !deep) add({ id: 'fishno', prio: 0.3, dist: 1.4, off: true, label: 'Good fishing water', note: 'craft a fishing rod' });
    if (deep && g.count('spear') && waterKind(p.x, p.z) === 'sea') add({ id: 'spearfish', prio: 2.6, dist: 1, label: 'Spear a fish', run: () => g.spearFish() });
  }
  out.sort((a, b) => (b.prio - b.dist * 0.9) - (a.prio - a.dist * 0.9));
  return out;
}
const nearSea = (p) => { for (let a = 0; a < 8; a++) if (waterKind(p.x + Math.cos(a * 0.785) * 2.2, p.z + Math.sin(a * 0.785) * 2.2) === 'sea') return true; return false; };
const fmtHours = (h) => (h >= 1 ? `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m` : `${Math.max(1, Math.round(h * 60))}m`);
