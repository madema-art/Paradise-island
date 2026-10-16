// The footpath up Mount Ignis: a worn tread that spirals from the foot of the cone to the crater rim (the path itself is cut into the
// mountain in world.js, buildAscent). Here it is marked and nothing more: the tread, a few cairns along the way, a lean-to at the foot and a
// cairn on the summit. All placement uses a local seeded generator, so the rest of the island's random sequence is untouched.
import * as THREE from 'three';
import { scene } from './core.js';
import { MB, C, shade, mat4, lumpy, tube } from './gfx.js';
import { ASCENT, collidersNear, getHeight } from './world.js';
import { mulberry32 } from './util.js';

const TREAD = [C('#8f8577'), C('#857c70'), C('#9a9284')];   // dusty stone, not red: the mountain has no active lava
const CAIRN = [C('#8d8a82'), C('#a39e94'), C('#6f6b64')];

export function buildAscentProps() {
  const P = ASCENT.path;
  if (!P || P.length < 2) return;
  const rng = mulberry32(0xa5ce17), rr = (a, b) => a + (b - a) * rng();
  const mb = new MB();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });

  // the path stays open: any trunk or bush right on it is switched off, so nobody gets stuck on the way up
  for (const p of P) for (const c of collidersNear(p.x, p.z, 0.9)) if (Math.hypot(c.x - p.x, c.z - p.z) < c.r + 0.9) c.off = true;

  // tangent and side at each point of the path (the side is to the left of the walk, looking up the path)
  const tan = (i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  };

  // the tread: a ribbon 1.7 m wide along the whole path, slightly above the cut ground, in a few trodden earth colours
  const pos = [], col = [];
  const W = 1.1;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], t = tan(i), sx = -t.z * W, sz = t.x * W;
    const k = TREAD[Math.floor(rng() * TREAD.length)];
    // each edge follows the ground beside it, so a sloping cut never buries the tread
    const yl = getHeight(p.x + sx, p.z + sz) + 0.08, yr = getHeight(p.x - sx, p.z - sz) + 0.08;
    pos.push(p.x + sx, yl, p.z + sz, p.x - sx, yr, p.z - sz);
    col.push(k.r, k.g, k.b, k.r, k.g, k.b);
  }
  const idx = [];
  for (let i = 0; i < P.length - 1; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tg.setIndex(idx); tg.computeVertexNormals();
  const tread = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  tread.receiveShadow = true; scene.add(tread);

  // a cairn of stacked stones, at a point on the outside of the path
  const cairn = (x, y, z, s = 1) => {
    const n = 4 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.3, 900 + k + Math.floor(x));
      mb.addGeo(g, mat4(x + rr(-0.05, 0.05) * s, y + (0.1 + k * 0.16) * s, z + rr(-0.05, 0.05) * s, (0.36 - k * 0.05) * s, 0.12 * s, (0.32 - k * 0.04) * s, rng() * 0.2, rng() * 6, rng() * 0.2),
        (v) => shade(CAIRN[k % CAIRN.length], 0.85 + 0.25 * Math.max(0, Math.min(1, (v.y - y) / (0.5 * s) + 0.5))));
    }
  };
  // cairns every ~80 m of the path, on the outer edge so they never block the tread
  let acc = 0, next = 40;
  for (let i = 1; i < P.length - 2; i++) {
    acc += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
    if (acc >= next) {
      next += 80;
      const t = tan(i), ox = t.z * 1.7, oz = -t.x * 1.7;             // the right-hand edge
      cairn(P[i].x + ox, getHeight(P[i].x + ox, P[i].z + oz), P[i].z + oz, 0.9);
    }
  }

  // the foot: a cairn at the start, and a lean-to with two seats of boulders
  {
    const bc = P[0], t = tan(0), side = { x: -t.z, z: t.x }, out = { x: -t.x, z: -t.z };
    cairn(bc.x + side.x * 2.2, bc.y, bc.z + side.z * 2.2, 1.3);
    const at = (a, b, h = 0) => new THREE.Vector3(bc.x + out.x * a + side.x * b, bc.y + h, bc.z + out.z * a + side.z * b);
    const p1 = at(1.4, -1.6), p2 = at(1.4, 1.6), p3 = at(-0.6, -1.5), p4 = at(-0.6, 1.5);
    for (const [a, b] of [[p1, 2.2], [p2, 2.2], [p3, 1.1], [p4, 1.1]]) {
      const top = a.clone(); top.y += b;
      tube(mb, [a, a.clone().lerp(top, 0.5), top], [0.07, 0.065, 0.06], 5, () => C('#6b4a2a'));
    }
    const CLOTH = C('#b8452a');
    const t1 = at(1.4, -1.9, 2.15), t2 = at(1.4, 1.9, 2.15), t3 = at(-0.9, 1.8, 1.15), t4 = at(-0.9, -1.8, 1.15);
    mb.quad(t1, t2, t3, t4, CLOTH); mb.quad(t4, t3, t2, t1, shade(CLOTH, 0.8));
  }

  // the summit: a small cairn on the rim, beside the path's last turn
  {
    const top = P[P.length - 1], t = tan(P.length - 1);
    cairn(top.x - t.x * 1.6 + (-t.z) * 1.2, top.y, top.z - t.z * 1.6 + t.x * 1.2, 1.5);
  }

  const m = new THREE.Mesh(mb.build(), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m);
}
