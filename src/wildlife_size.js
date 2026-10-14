// Wildlife size. Each species is set from its source model's rest geometry, not from the running game:
//   size on screen = target / (sourceM x the model root's own scale on that axis) x the group's scale
// sourceM is measured from the GLB in rest pose by tools/measure/glb_rest.cjs (see docs/WILDLIFE_SCALE_RESEARCH.md for the exact
// command and value). The target is the researched adult dimension x 1.5 (or a documented exception). Each species is switched on
// only after it has been validated, so the registry can grow one species at a time.
//
// The factor is applied at registration (before the selection proxy is added), so it is set once per creature from the model as it
// is built, and a reload gives the same size (nothing compounds). Individuals vary by a small, stable amount (hashed from the id),
// so two adults are never identical, but both stay in the adult range.
import * as THREE from 'three';

export const SPECIES = {
  // Wild boar: standing height at the back (shoulder), mane and ears excluded. Source: assets/boar.glb, rest pose.
  // Measured: node tools/measure/glb_rest.cjs assets/boar.glb --exclude='mane|ear|tusk|eye' -> max Y = 1.0051 (min 0.0004): 1.0047 m.
  'Wild boar': { src: 'assets/boar.glb', axis: 'y', sourceM: 1.0047, target: 1.20, variety: 0.08, on: true,
    note: 'standing height at the back: 0.80 m real x 1.5' },
  // Piglet at about three months: an ESTIMATE. The shoulder height is derived from the adult (0.80 m) scaled by the cube root of the
  // mass ratio (about 12 kg / 70 kg); no measured figure for this age was found. Target: 0.44 m x 1.5.
  'Boar piglet': { src: 'assets/boar.glb', axis: 'y', sourceM: 1.0047, target: 0.66, variety: 0.06, on: true,
    estimate: true, note: 'ESTIMATE: 3-month shoulder height 0.44 m (derived), x 1.5' },
  // Pacific boa: EXCEPTION to the 1.5x rule. Target 3.0 m total body length (the owner's decision). The measured quantity is the full
  // extended length from the head tip to the tail tip (the rest pose is straight), not the straight-line distance of a coiled snake.
  // Measured: node tools/measure/glb_rest.cjs assets/pacific_boa.glb -> model Z extent 1.3415 m.
  'Pacific boa': { src: 'assets/pacific_boa.glb', axis: 'z', sourceM: 1.3415, target: 3.0, variety: 0.10, on: true, exception: true,
    note: 'EXCEPTION: 3.0 m total body length (owner decision), extended length' },
  // Barn owl: the wingspan is the reliable measure (model 0.961 m, real 0.95 m). The model's body is about 40% longer than a real owl's
  // (0.51 m against 0.36 m total length): a modelling error for the workshop. Scaled by the wingspan: target 0.95 x 1.5 = 1.43 m.
  // Measured: node tools/measure/glb_rest.cjs assets/barn_owl.glb --include='arm|hand' -> X extent 0.961 m.
  'Barn owl': { src: 'assets/barn_owl.glb', axis: 'x', sourceM: 0.961, target: 1.43, variety: 0.06, on: true,
    note: 'wingspan 0.95 m x 1.5; body length of the model is too long (workshop)' },
  // The rest of the registry, measured with the viewer (dev/scale_viewer.html) from the factory model at unit root scale, in the
  // root's local frame (the frame the game sizes in). Each is one factor per species from the adult model, so juveniles and the
  // other sexes keep their real proportions (their geometry is already at real size).
  'Island rat': { src: 'rat_model (procedural/GLB factory)', axis: 'max', sourceM: 0.3639, target: 0.36, variety: 0.06, on: true, note: 'head-body + tail (viewer)' },
  'Greater flamingo': { src: 'flamingo_model', axis: 'y', sourceM: 1.5937, target: 1.95, variety: 0.06, on: true, note: 'standing height' },
  'White tern': { src: 'tern_model', axis: 'z', sourceM: 0.5738, target: 0.45, variety: 0.06, on: true, note: 'body length (root scale 1.25 in the factory)' },
  'Silver gull': { src: 'gull_model', axis: 'z', sourceM: 0.928, target: 0.645, variety: 0.06, on: true, note: 'body length' },
  'Rainbow lorikeet': { src: 'lorikeet_model', axis: 'z', sourceM: 0.247, target: 0.42, variety: 0.06, on: true, note: 'body length; wingspan not resolved' },
  'Great frigatebird': { src: 'frigatebird_model (male)', axis: 'z', sourceM: 1.1206, target: 1.43, variety: 0.06, on: true, note: 'body length (female and juvenile share the male factor)' },
  'White-bellied sea eagle': { src: 'sea_eagle_model (adult)', axis: 'z', sourceM: 1.003, target: 1.20, variety: 0.06, on: true, note: 'body length' },
  'Red beach crab': { src: 'crab_model (red)', axis: 'x', sourceM: 0.8282, target: 0.09, variety: 0.08, on: true, note: 'carapace width (carapace mesh only)' },
  'Ghost crab': { src: 'crab_model (ghost)', axis: 'x', sourceM: 0.8282, target: 0.09, variety: 0.08, on: true, note: 'carapace width (carapace mesh only); weakly sourced' },
  'Coconut crab': { src: 'crab_model (coconut)', axis: 'x', sourceM: 1.5272, target: 1.20, variety: 0.08, on: true, note: 'leg span (0.80 m x 1.5; range 0.8-1.0 m)' },
  'Bottlenose dolphin': { src: 'dolphin_model (adult male)', axis: 'max', sourceM: 5.3888, target: 3.90, variety: 0.08, on: true, note: 'total length (2.60 m x 1.5)' },
  'Green sea turtle': { src: 'turtle_model', axis: 'z', sourceM: 2.0808, target: 1.35, variety: 0.06, on: true, note: 'length (viewer: single body mesh; the model is about twice a real turtle, so the game turtle shrinks)' },
  'Humpback whale': { src: 'whale_model', axis: 'max', sourceM: 15.7, target: 21.0, variety: 0.06, on: true, note: 'total length (14 m x 1.5)' },
  'Blackfin reef shark': { src: 'shark_model', axis: 'max', sourceM: 1.836, target: 1.95, variety: 0.06, on: true, note: 'total length (1.30 m x 1.5)' },
  // Giant manta ray: the game's procedural manta (fauna_sea.js Manta), a simple six-triangle wing shape with a tail cone and root scale 1.5.
  // Measured in its own vertices: wing tip to tip 5.2 units (x). Disc width 4.5 m (typical adult) x 1.5 = 6.75 m. NOTE: the shape itself is
  // a placeholder-level model (flat and angular): a real manta model is a defect to fix separately; it is not replaced here.
  'Giant manta ray': { src: 'procedural Manta (fauna_sea.js)', axis: 'x', sourceM: 5.2, target: 6.75, variety: 0.06, on: true, note: 'disc width (4.5 m x 1.5); procedural placeholder shape' },
  // Hermit crab (Coenobita perlatus): carapace LENGTH, not width. The model is the crab body with its borrowed shell shown (crab.glb,
  // rest pose): carapace length 0.5733 m (z). Research: large adults 20-25 mm carapace length (Enewetak study, 25 mm species maximum).
  // Target 0.022 m x 1.5 = 0.033 m. The shell is part of the same model and scales with it. Very small by design: flagged for review.
  'Hermit crab': { src: 'crab.glb (hermit variant)', axis: 'z', sourceM: 0.5733, target: 0.033, variety: 0.10, on: true, note: 'carapace length (22 mm adult x 1.5); shell scales with the body' },
};

// the boar variants are the same species (wild boar): same source, same target, their own coat and root scale
for (const k of ['Ginger boar', 'Silver tusker', 'Spotted pig']) SPECIES[k] = { ...SPECIES['Wild boar'], note: 'variant of wild boar' };

/** a stable number in [0, 1) from a string (the creature id) */
function unit(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/** the factor for a creature, or null when its species is not switched on */
export function sizeFor(c) {
  const spec = SPECIES[c.name];
  if (!spec || !spec.on || !c.group) return null;
  const root = c.group.children[0];
  const rootScale = !root || !root.scale ? 1 : spec.axis === 'max' ? Math.max(root.scale.x, root.scale.y, root.scale.z) : root.scale[spec.axis];
  const v = 1 + spec.variety * (2 * unit(String(c.id)) - 1);
  return { f: spec.target * v / (spec.sourceM * rootScale), spec, v, rootScale };
}

/** set a creature's size (called from register(), before its selection proxy is added) */
export function sizeCreature(c) {
  const s = sizeFor(c);
  if (!s) return;
  const before = c.group.scale.x;
  c.group.scale.setScalar(s.f);
  c.viewDist = (c.viewDist || 9) * (s.f / before);
  c.sizeFactor = s.f;
  c.sizeInfo = { target: s.spec.target, variety: +s.v.toFixed(3), rootScale: +s.rootScale.toFixed(3), exception: !!s.spec.exception, estimate: !!s.spec.estimate };
}
