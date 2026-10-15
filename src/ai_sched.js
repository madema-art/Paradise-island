// Behaviour LOD for the land fauna: a creature that is far from the camera thinks (and poses) less often, with the time it missed handed to its
// next update, so it still lives at the right pace; it never freezes and never jumps. Near the camera, and for the animal being followed,
// nothing changes: every frame. The decision is made from the creature's own position, once a frame, with no allocation.
import { camera } from './core.js';
import { cam } from './camera.js';

// [distance in metres, update every n-th frame]
const TIERS = [[45, 1], [110, 2], [220, 4], [1e9, 8]];
const MAX_DT = 0.25;

export function makeAiScheduler() {
  let frame = 0;
  const stats = { ran: 0, skipped: 0 };
  return {
    stats,
    enabled: true,
    begin() { frame++; },
    /** the dt the creature should be updated with this frame, or 0 to skip it. `i` staggers who runs on which frame. */
    step(a, i, dt) {
      const g = a.group;
      if (!g || !this.enabled) return dt;
      let n;
      const followed = cam.follow && cam.follow.sim === a;
      if (followed || a.holder || a.prey || a.state === 'caught' || a.state === 'strike' || a.charge || a.contest) n = 1;
      else if (a.state === 'hidden' || a.state === 'dead') n = 8;
      else {
        const p = g.position, dx = p.x - camera.position.x, dz = p.z - camera.position.z, d2 = dx * dx + dz * dz;
        n = 8;
        for (let k = 0; k < TIERS.length; k++) if (d2 < TIERS[k][0] * TIERS[k][0]) { n = TIERS[k][1]; break; }
      }
      a._acc = (a._acc || 0) + dt;
      if (n === 1 || (frame + i) % n === 0) {
        const k = Math.min(a._acc, MAX_DT); a._acc = 0; stats.ran++;
        return k;
      }
      stats.skipped++;
      return 0;
    },
  };
}
