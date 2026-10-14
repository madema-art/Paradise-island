// Shared lightweight coconut prop. Metres, centre pivot, +Y opening, +Z front.
// No world RNG draws, network loads, item ownership or animation state machine.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const COCONUT = Object.freeze({ width: .20, height: .232, depth: .184, restHeight: .122, version: 1 });
export const COCONUT_STATES = Object.freeze(['whole', 'opened', 'half', 'split', 'spent']);
const variants = [0, 1, 2];
const cache = new Map();
const palette = ['#9c683b', '#885733', '#ad7847'];
let materials;
const variantId = n => variants.includes(n) ? n : 0;
function grainTexture() {
  const w = 128, h = 128, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ridge = Math.sin(x * 1.7 + Math.sin(y * .075) * .9);
    const fleck = ((Math.imul(x + 17, 73856093) ^ Math.imul(y + 29, 19349663)) >>> 0) % 19;
    const n = Math.round(205 + ridge * 22 + fleck);
    const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = n; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h); t.wrapS = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
function mats() {
  if (!materials) {
    const texture = grainTexture();
    materials = {
      husk: new THREE.MeshStandardMaterial({ vertexColors: true, map: texture, bumpMap: texture, bumpScale: .0012, roughness: .94 }),
      shell: new THREE.MeshStandardMaterial({ color: '#62412a', roughness: .9, side: THREE.DoubleSide }),
      flesh: new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#e6dcc4', emissiveIntensity: .18, roughness: .8, side: THREE.DoubleSide }),
      bare: new THREE.MeshStandardMaterial({ color: '#a58056', roughness: .96, side: THREE.DoubleSide }),
      water: new THREE.MeshStandardMaterial({ color: '#a4c2ac', roughness: .24, transparent: true, opacity: .72, side: THREE.DoubleSide }),
    };
    for (const [k, m] of Object.entries(materials)) m.name = 'Coconut_' + k;
  }
  return materials;
}
function shape(g, variant, inset = 0) {
  const p = g.attributes.position, colors = [], color = new THREE.Color(palette[variant]);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const lobe = 1 + .035 * Math.cos(3 * a + variant * .25) * (1 - y * y);
    const taper = .94 - .07 * y;
    p.setXYZ(i, x * (.1 - inset) * lobe * taper + .007 * y * y + .003 * y,
      y * (.116 + variant * .002 - inset), z * (.092 - inset) * lobe * (1 + variant * .015));
    const tone = .9 + .08 * Math.sin(a * 7 + y * 3) + .05 * y;
    colors.push(color.r * tone, color.g * tone, color.b * tone);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.computeVertexNormals();
  return g;
}
function painted(g, color) {
  const c = new THREE.Color(color), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
export function coconutWholeGeometry(variant = 0) {
  variant = variantId(variant); const key = 'whole-' + variant;
  if (!cache.has(key)) {
    const parts = [shape(new THREE.SphereGeometry(1, 20, 12), variant)];
    // Three dark eyes at the tapered end, merged into the same draw call as the husk.
    for (const [x, y, z, r] of [[-.017, .087, .060, .007], [.016, .087, .060, .008], [0, .071, .072, .006]]) {
      const eye = new THREE.SphereGeometry(1, 8, 4); eye.scale(r, .0018, r * .85);
      eye.rotateX(Math.PI / 4); eye.translate(x + .009, y + variant * .002, z); parts.push(painted(eye, '#35251b'));
    }
    const merged = mergeGeometries(parts); parts.forEach(g => g.dispose());
    merged.name = 'Coconut_whole_v' + variant; merged.computeBoundingBox(); cache.set(key, merged);
  }
  return cache.get(key);
}
export function coconutHuskMaterial() { return mats().husk; }
export function coconutCrownGeometry() {
  if (!cache.has('crown')) cache.set('crown', shape(new THREE.SphereGeometry(1, 10, 6), 0));
  return cache.get('crown'); // Small crown clusters keep the palm's existing single draw call.
}
function cutParts(state, variant) {
  const key = state + '-' + variant;
  if (!cache.has(key)) {
    const theta = state === 'opened' ? .96 : Math.PI / 2;
    const outer = shape(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, theta, Math.PI - theta), variant);
    const inner = shape(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, theta, Math.PI - theta), variant, state === 'spent' ? .009 : .018);
    // Seal the uneven elliptical cut with a proper shell cross-section and a thick ivory lip.
    const ring = (outerInset, innerInset) => {
      const g = new THREE.RingGeometry(1, 1, 20), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const radius = i < 21 ? innerInset : outerInset; // RingGeometry lays out inner ring first.
        const a = Math.atan2(p.getY(i), p.getX(i)), y = Math.cos(theta);
        const r = Math.sin(theta), lobe = 1 + .035 * Math.cos(3 * a + variant * .25) * (1 - y * y);
        p.setXYZ(i, Math.cos(a) * (.1 - radius) * r * lobe * (.94 - .07 * y) + .007 * y * y + .003 * y,
          y * (.116 + variant * .002), Math.sin(a) * (.092 - radius) * r * lobe * (1 + variant * .015));
      }
      g.computeVertexNormals(); return g;
    };
    const shellRim = ring(0, .009), fleshRim = ring(.009, state === 'spent' ? .009 : .018);
    // The cavity must meet the rim in one horizontal plane, even for the smaller drinking opening.
    const openingY = Math.cos(theta) * (.116 + variant * .002);
    const pos = inner.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + Math.cos(theta) * (state === 'spent' ? .009 : .018));
    inner.computeVertexNormals();
    cache.set(key, { outer, inner, shellRim, fleshRim, openingY, theta });
  }
  return cache.get(key);
}
function mesh(geo, material, name) { const m = new THREE.Mesh(geo, material); m.name = name; m.castShadow = true; m.receiveShadow = true; return m; }
function bowl(state, variant) {
  const p = cutParts(state, variant), m = mats(), group = new THREE.Group(); group.name = 'Coconut_' + state;
  group.add(mesh(p.outer, m.husk, 'Husk'), mesh(p.inner, state === 'spent' ? m.bare : m.flesh, 'Interior'), mesh(p.shellRim, m.shell, 'Shell_thickness'));
  if (state !== 'spent') group.add(mesh(p.fleshRim, m.flesh, 'White_flesh_rim'));
  if (state === 'opened') {
    const g = new THREE.CircleGeometry(.043, 20); g.rotateX(-Math.PI / 2);
    // Shared small surface geometry; no per-frame or per-instance texture allocation.
    const key = 'water-disc'; if (!cache.has(key)) cache.set(key, g); else g.dispose();
    const water = mesh(cache.get(key), m.water, 'Coconut_water'); water.position.y = p.openingY - .022; group.add(water);
  }
  return group;
}
export function setCoconutState(root, state) {
  if (!COCONUT_STATES.includes(state)) throw new Error('Unknown coconut state: ' + state);
  const data = root.userData.coconut; if (!data) throw new Error('Expected a coconut prop');
  if (data.state === state) return root;
  const visual = root.getObjectByName('Coconut_visual'); visual.clear();
  if (state === 'whole') visual.add(mesh(coconutWholeGeometry(data.variant), mats().husk, 'Whole_husk_and_eyes'));
  else if (state === 'split') {
    for (const side of [-1, 1]) { const half = bowl('half', data.variant); half.name = side < 0 ? 'Half_left' : 'Half_right'; half.position.x = side * .122; half.rotation.z = side * -.18; visual.add(half); }
  } else visual.add(bowl(state, data.variant));
  data.state = state;
  root.getObjectByName('Coconut_opening').position.y = state === 'whole' ? .116 : state === 'opened' ? cutParts(state, data.variant).openingY : 0;
  return root;
}
export function createCoconut({ state = 'whole', variant = 0 } = {}) {
  const root = new THREE.Group(); root.name = 'Coconut_prop';
  root.userData.coconut = { version: COCONUT.version, state: null, variant: variantId(variant) };
  for (const name of ['Coconut_visual', 'Coconut_grip', 'Coconut_opening', 'Coconut_base']) { const child = new THREE.Group(); child.name = name; root.add(child); }
  root.getObjectByName('Coconut_base').position.y = -COCONUT.restHeight;
  return setCoconutState(root, state);
}
