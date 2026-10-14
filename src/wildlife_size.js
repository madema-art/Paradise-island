// Wildlife size: every creature is its real adult dimension x 1.5 (docs/WILDLIFE_SCALE_RESEARCH.md). The castaway (2.00 m) is the fixed
// reference and is not part of this. Each species has one reference dimension: the game target is the researched target, and the
// factor is target / (the same dimension measured on the model as it is built). The factor is computed once per species from the
// first model of that species, and applied to every individual's group scale, so individuals keep their own variation and a rebuild
// from the seeded world gives the same sizes (nothing compounds across reloads).
import * as THREE from 'three';

// target = the researched adult dimension x 1.5, in metres. axis: 'x' | 'y' | 'z' (group-local) or 'max' (longest local extent).
// mesh: optional name filter, to measure one named part (for example a crab's carapace).
// species that are not measured here keep their current size (listed in the research document as flagged).
export const WILDLIFE = {
  'Wild boar':          { axis: 'y', target: 1.20 },   // standing height at the shoulder (0.80 m x 1.5); also used for the boar variants and piglet (same species)
  'Island rat':         { axis: 'max', target: 0.36 },  // head-body + tail (0.24 m x 1.5)
  'Barn owl':           { axis: 'y', target: 0.54 },   // total length (0.36 m x 1.5), standing or perched
  'Pacific boa':        { axis: 'max', target: 1.50 },  // total length (1.00 m x 1.5)
  'Greater flamingo':   { axis: 'y', target: 1.95 },   // standing height (1.30 m x 1.5)
  'Bottlenose dolphin': { axis: 'max', target: 3.90 },  // total length (2.60 m x 1.5)
  'Green sea turtle':   { axis: 'max', target: 1.35 },  // carapace length (0.90 m x 1.5)
  'Humpback whale':     { axis: 'max', target: 21.0 },  // total length (14.0 m x 1.5)
  'Giant manta ray':    { axis: 'max', target: 6.75 },  // disc width (4.5 m x 1.5)
  'Blackfin reef shark':{ axis: 'max', target: 1.95 },  // total length (1.30 m x 1.5)
  'Red beach crab':     { mesh: 'carapace', axis: 'x', target: 0.09 },  // carapace width (0.06 m x 1.5)
  'Ghost crab':         { mesh: 'carapace', axis: 'x', target: 0.09 },  // carapace width (0.06 m x 1.5), weakly sourced
  'Coconut crab':       { axis: 'x', target: 1.20 },   // leg span (0.80 m x 1.5), range 0.8-1.0 m
  'Silver gull':        { axis: 'z', target: 0.645 },  // length (0.43 m x 1.5)
  'Rainbow lorikeet':   { axis: 'z', target: 0.42 },   // length (0.28 m x 1.5)
  'White tern':         { axis: 'z', target: 0.45 },   // length (0.30 m x 1.5)
  'Great frigatebird':  { axis: 'z', target: 1.43 },   // length (0.95 m x 1.5)
  'Sea eagle':          { axis: 'z', target: 1.20 },   // length (0.80 m x 1.5)
};

const SAME_SPECIES = { 'Ginger boar': 'Wild boar', 'Silver tusker': 'Wild boar', 'Spotted pig': 'Wild boar', 'Boar piglet': 'Wild boar' };

/** the extent of a creature's own geometry in its group's local frame (the group's own scale is not part of it) */
function localBox(group, meshName) {
  group.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const box = new THREE.Box3();
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.userData.creature) return;     // the pick proxy is not the animal
    if (meshName && !(o.name || '').toLowerCase().includes(meshName)) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(m);
      box.expandByPoint(p);
    }
  });
  return box.isEmpty() ? null : box;
}

/** the reference dimension of a creature, in its group's local units */
export function referenceDimension(group, spec) {
  const box = localBox(group, spec.mesh);
  if (!box) return null;
  const s = box.getSize(new THREE.Vector3());
  return spec.axis === 'max' ? Math.max(s.x, s.y, s.z) : s[spec.axis];
}

const factors = {};

/** OFF until the measurement is validated: at runtime several rigs change their extents (the boar's measured height goes from 0.81 m at
 *  registration to 1.55 m in play; the Pacific boa reads 0.31 m against a 1.34 m reference). See the report and docs/WILDLIFE_SCALE_RESEARCH.md. */
export const WILDLIFE_SIZE_ON = false;

/** set a creature's size from the species research. Idempotent: the factor for a species is computed once, from the group's own model. */
export function sizeCreature(c) {
  if (!WILDLIFE_SIZE_ON) return;
  const key = SAME_SPECIES[c.name] || c.name;
  const spec = WILDLIFE[key];
  if (!spec || !c.group) return;
  if (factors[key] === undefined) {
    const ref = referenceDimension(c.group, spec);
    if (!ref) return;                          // no geometry (a school's marker group): sized with its instances instead
    factors[key] = spec.target / ref;
    factors[key + ' (ref)'] = ref;
  }
  const f = factors[key];
  c.group.scale.multiplyScalar(f);
  c.viewDist = (c.viewDist || 9) * f;
  c.sizeFactor = f;
}

/** the factors computed so far (for the research report and for checks in the game) */
export const sizeFactors = () => ({ ...factors });
