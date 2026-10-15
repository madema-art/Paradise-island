// The island's water and standing ground, for the castaway and his buildings: where the pools lie, and the nearest land to stand on.
import { getHeight, getSlope, lavaDist, VOL, LAKE, lakeRho, SPRING, falls } from './world.js';

/** surface of the enclosed pools (the sea is handled by swimming) */
export function poolLevel(x, z) {
  if (lakeRho(x, z) < 1.08) return LAKE.y;
  const P = falls.pool;
  if (P && Math.hypot(x - P.x, z - P.z) < P.r + 1.5) return P.y;
  if (Math.hypot(x - SPRING.x, z - SPRING.z) < SPRING.r + 1.4) return SPRING.y - 0.05;
  return -1;
}

/** nearest standable land to (x,z) */
export function spawnNear(x, z) {
  for (let r = 0; r < 60; r += 2)
    for (let a = 0; a < 12; a++) {
      const px = x + Math.cos(a * 0.5236) * r, pz = z + Math.sin(a * 0.5236) * r;
      const h = getHeight(px, pz);
      if (h > 0.7 && getSlope(px, pz) < 0.35 && lavaDist(px, pz) > 6 && Math.hypot(px - VOL.x, pz - VOL.z) > 24) return { x: px, z: pz };
    }
  return { x, z };
}
