// Adapted from the domed clump-shell idea in the asset workshop canopy_kit.js,
// 45d11e0. Closed opaque foliage, no leaf cards, one merged geometry per family/LOD.
import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';
import { noise2 } from './noise.js';
import { mat4, shade, lumpy, tube } from './gfx.js';

// Legacy tubes wind inward and relied on DoubleSide. Correct only the new tree
// families, keeping every point, colour, weight and random draw unchanged.
export const canopyTube = (...args) => tube(...args, { outward: true });

const shapes = new Map();
function shape(seed, detail) {
  const key = `${seed}:${detail}`;
  if (!shapes.has(key)) shapes.set(key, lumpy(detail === 2 ? new THREE.OctahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, detail), .19, seed));
  return shapes.get(key);
}

/** Exactly 260/80/32 triangles. Uses no world RNG; same clump centres at every LOD. */
export function canopyLobe(mb, centre, radius, flat, base, seed, detail, wind = .9) {
  const rng = mulberry32(seed * 7919 + 17);
  const count = 4;
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963 + rng() * .3;
    const skirt = i === 3;
    const spread = count === 1 ? 0 : skirt ? .12 : .39;
    const x = centre.x + Math.cos(a) * radius * spread;
    const z = centre.z + Math.sin(a) * radius * spread;
    const y = centre.y + (count === 1 ? 0 : skirt ? -.4 : .04 + rng() * .15) * radius * flat;
    const scale = count === 1 ? 1 : skirt ? .56 : .72;
    const r = radius * scale;
    const geo = shape(seed * 5 + i, detail === 2 ? 2 : detail === 1 || skirt ? 0 : 1);
    mb.addGeo(geo, mat4(x, y, z, r, r * flat, r, 0, a, 0), v => {
      const h = clamp((v.y - centre.y) / (radius * flat) * .5 + .5, 0, 1);
      const mottle = noise2(v.x * 1.3 + seed, v.z * 1.3) * .055;
      const c = shade(base, .66 + .48 * h + mottle);
      // Warm, restrained sunlit tips; lower clumps stay deep green.
      if (h > .65) c.lerp(new THREE.Color('#789b42'), (h - .65) * .12);
      return c;
    }, wind, { smooth: true });
  }
}
