import os
os.chdir(r'D:\Paradise Island')


def rw(p, pairs):
    s = open(p, encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    for a, b in pairs:
        assert a in s, (p, a[:80])
        s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)


rw('src/world.js', [
    ("import { clamp, lerp, smoothstep, smin, smax } from './util.js';",
     "import { clamp, lerp, smoothstep, smin, smax } from './util.js';\nimport caveData from '../assets/cave_data.json';"),
    ("  buildAscent();\n}\n",
     """  buildAscent();
  setupCave();
}

/** The Crystal Cave behind Veil Falls. Its own frame: the mouth is 3.2 m back from the ledge, depth runs into the cliff, and the floor is the
 *  ledge height. Blender coordinates (bx lateral, by depth) map to world through this transform; the walkable floor is a baked grid. */
export const CAVE = { ready: false, ox: 0, oy: 0, oz: 0, ca: 1, sa: 0, nav: caveData.nav };
function setupCave() {
  const n = falls.n, B = falls.ledge, th = Math.atan2(n.x, n.z);
  CAVE.ox = B.x - n.x * 3.2; CAVE.oz = B.z - n.z * 3.2; CAVE.oy = B.y; CAVE.ca = Math.cos(th); CAVE.sa = Math.sin(th); CAVE.theta = th; CAVE.ready = true;
}
const _cl = { bx: 0, by: 0 };
export function caveLocal(x, z, out = _cl) {
  const dx = x - CAVE.ox, dz = z - CAVE.oz;
  out.bx = dx * CAVE.ca - dz * CAVE.sa; out.by = -(dx * CAVE.sa + dz * CAVE.ca);
  return out;
}
/** world height of the cave floor under (x,z), or null if that is solid rock (the cell and its neighbours must all be floor, so walls keep their distance) */
export function caveFloorAt(x, z) {
  if (!CAVE.ready) return null;
  const q = caveLocal(x, z), N = CAVE.nav;
  const fx = (q.bx - N.x0) / N.cell, fy = (q.by - N.y0) / N.cell, i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= N.nx - 1 || j >= N.ny - 1) return null;
  const h = N.h, a = h[j * N.nx + i], b = h[j * N.nx + i + 1], c = h[(j + 1) * N.nx + i], d = h[(j + 1) * N.nx + i + 1];
  if (a < -90 || b < -90 || c < -90 || d < -90) return null;
  const tx = fx - i, ty = fy - j;
  return CAVE.oy + lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}
/** is this point of the terrain mesh (a triangle's centre) inside the doorway cut into the cliff face? */
export function caveHole(x, y, z) {
  if (!CAVE.ready) return false;
  const q = caveLocal(x, z), dy = y - CAVE.oy;
  return Math.abs(q.bx) < 2.15 && q.by > 0.4 && q.by < 6.4 && dy > 0.15 && dy < 4.2;
}
"""),
    ("export function walkHeight(x, z, fromY = 1e9, info = null) {\n  let y = getHeight(x, z), tag = null;",
     "export function walkHeight(x, z, fromY = 1e9, info = null) {\n  const cf = CAVE.ready ? caveFloorAt(x, z) : null;\n  if (cf != null && fromY <= cf + 1.4) { if (info) info.tag = 'cave'; return cf; }        // inside the cave: its floor, not the cliff above\n  let y = getHeight(x, z), tag = null;"),
])
rw('src/terrain.js', [
    ("lavaDist, riverDist, riverNear } from './world.js';", "lavaDist, riverDist, riverNear, caveHole } from './world.js';"),
    ("      idx[t++] = a; idx[t++] = cc; idx[t++] = b;\n      idx[t++] = b; idx[t++] = cc; idx[t++] = d;",
     """      // the doorway into the Crystal Cave is left open in the cliff face
      const hole = (p, q, r) => caveHole((pos[p * 3] + pos[q * 3] + pos[r * 3]) / 3, (pos[p * 3 + 1] + pos[q * 3 + 1] + pos[r * 3 + 1]) / 3, (pos[p * 3 + 2] + pos[q * 3 + 2] + pos[r * 3 + 2]) / 3);
      if (!hole(a, cc, b)) { idx[t++] = a; idx[t++] = cc; idx[t++] = b; }
      if (!hole(b, cc, d)) { idx[t++] = b; idx[t++] = cc; idx[t++] = d; }"""),
    ("  geo.setIndex(new THREE.BufferAttribute(idx, 1));", "  geo.setIndex(new THREE.BufferAttribute(idx.slice(0, t), 1));"),
])
rw('src/water.js', [("function flowMaterial(o = {}) {", "export function flowMaterial(o = {}) {")])
rw('src/walk.js', [("  if (tag === 'dock') return 'wood';", "  if (tag === 'dock') return 'wood';\n  if (tag === 'cave') return 'stone';")])
rw('src/survival/player.js', [
    ("import { getHeight, walkHeight, resolveColliders, lavaDist, VOL, volcanoSteep } from '../world.js';", "import { getHeight, walkHeight, resolveColliders, lavaDist, VOL, volcanoSteep, caveFloorAt } from '../world.js';"),
    ("    let d = this.cDist;\n    for (let i = 1; i <= 14; i++) {", "    let d = this.cDist;\n    const inCave = caveFloorAt(L.x, L.z) != null;        // under the cliff the heightfield is solid rock above him: no terrain pull-in\n    for (let i = 1; i <= 14 && !inCave; i++) {"),
    ("    if (camera.position.y < gh + 0.6 && gh > -0.5) camera.position.y = gh + 0.6;", "    if (!inCave && camera.position.y < gh + 0.6 && gh > -0.5) camera.position.y = gh + 0.6;"),
])
rw('src/main.js', [
    ("import { buildAscentProps } from './ascent.js';", "import { buildAscentProps } from './ascent.js';\nimport { buildCave } from './cave.js';"),
    ("  buildGrotto(); buildTemple();", "  buildGrotto(); buildCave(); buildTemple();"),
])
print('ok')
