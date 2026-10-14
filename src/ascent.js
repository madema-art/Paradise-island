// The look of Mount Ignis' climbing route and crown: trail cairns, the basecamp lean-to, the natural holds of the rock wall (knobs, flakes and
// ledges of the mountain's own basalt; nothing man-made on the climb), a summit cairn, and the jagged teeth around the crater rim. All placement uses a local seeded generator, so the rest of the
// island's random sequence is untouched.
import * as THREE from 'three';
import { scene } from './core.js';
import { MB, C, shade, mat4, lumpy, tube } from './gfx.js';
import { ASCENT, VOL, getHeight, getNormal, collidersNear } from './world.js';
import { climbRoute as R, railAt } from './climb.js';
import { mulberry32 } from './util.js';

export function buildAscentProps() {
  if (!R.ready) return;
  const rng = mulberry32(0xa5ce17), rr = (a, b) => a + (b - a) * rng();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
  const mb = new MB();
  const BAS = [C('#2e2a28'), C('#3d3834'), C('#4a4440'), C('#5a5048')], ASH = C('#8f8578'), RED = C('#c43a2a'), WOOD = C('#6b4a2a'), CLOTH = C('#b8452a');
  const pickB = () => BAS[Math.floor(rng() * BAS.length)];
  const nrm = { x: 0, y: 1, z: 0 };
  const rock = (x, y, z, sx, sy, sz, col, seed, tilt = 0) => {
    const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.34, seed);
    mb.addGeo(g, mat4(x, y, z, sx, sy, sz, tilt * rr(-1, 1), rng() * 6, tilt * rr(-1, 1)), (v) => shade(col, 0.82 + 0.3 * Math.max(0, Math.min(1, (v.y - y) / (sy * 2) + 0.5))));
  };
  const cairn = (x, z, s = 1, y0 = null) => {
    const y = (y0 ?? getHeight(x, z));
    const n = 4 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) rock(x + rr(-0.06, 0.06) * s, y + (0.1 + k * 0.17) * s, z + rr(-0.06, 0.06) * s, (0.38 - k * 0.05) * s, 0.12 * s, (0.34 - k * 0.04) * s, k % 2 ? C('#8d8a82') : C('#a39e94'), 100 + k, 0.2);
  };

  // keep the path open: a bush or trunk collider right on the bench is switched off so nobody gets stuck on the way up
  for (const p of ASCENT.trail) for (const c of collidersNear(p.x, p.z, 0.9)) if (Math.hypot(c.x - p.x, c.z - p.z) < c.r + 0.9) c.off = true;

  /* ---- the trail: a cairn at its foot, small markers on the switchbacks */
  const tr = ASCENT.trail;
  if (tr.length) {
    cairn(tr[0].x, tr[0].z, 1.5, tr[0].y);
    for (let i = 7; i < tr.length - 2; i += 7) {
      const p = tr[i], q = tr[Math.min(tr.length - 1, i + 1)];
      const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
      cairn(p.x - dz / l * 1.5, p.z + dx / l * 1.5, 0.8, null);
    }
  }

  /* ---- basecamp: a lean-to tarp on two poles and a few boulders for seats */
  const bc = R.bc, by = bc.y;
  {
    const out = { x: -R.dx, z: -R.dz }, side = { x: R.px, z: R.pz };
    const at = (a, b, h = 0) => new THREE.Vector3(bc.x + out.x * a + side.x * b, by + h, bc.z + out.z * a + side.z * b);
    // poles
    const p1 = at(1.4, -1.6), p2 = at(1.4, 1.6), p3 = at(-0.6, -1.5), p4 = at(-0.6, 1.5);
    for (const [a, b] of [[p1, 2.2], [p2, 2.2], [p3, 1.1], [p4, 1.1]]) {
      const top = a.clone(); top.y += b;
      tube(mb, [a, a.clone().lerp(top, 0.5), top], [0.07, 0.065, 0.06], 5, () => WOOD);
    }
    // tarp
    const t1 = at(1.4, -1.9, 2.15), t2 = at(1.4, 1.9, 2.15), t3 = at(-0.9, 1.8, 1.15), t4 = at(-0.9, -1.8, 1.15);
    mb.quad(t1, t2, t3, t4, CLOTH); mb.quad(t4, t3, t2, t1, shade(CLOTH, 0.8));
    rock(...at(0.4, 0.5, 0.18).toArray(), 0.5, 0.3, 0.45, pickB(), 7);
    rock(...at(-0.2, -0.7, 0.18).toArray(), 0.42, 0.28, 0.4, pickB(), 8);
  }

  /* ---- the wall: the holds are the rock's own. Knobs, flakes and ledges of basalt stand out of the face along the line a climber would take,
          weathered the same dark colours as the mountain, so the way up reads from below without a single bolt or rope. */
  const du = 0.0175;
  for (let u = 0.03, k = 0; u < 0.995; u += du, k++) {
    const lat = (k % 2 ? 0.55 : -0.5) + rr(-0.18, 0.18);
    const p = railAt(u, lat); getNormal(p.x, p.z, nrm);
    const col = pickB();
    if (k % 5 === 2) {                                              // a ledge: a wide, flat-topped slab sticking out of the wall
      rock(p.x + nrm.x * 0.18, p.y + 0.02, p.z + nrm.z * 0.18, rr(0.5, 0.85), rr(0.08, 0.13), rr(0.3, 0.46), col, 200 + k, 0.12);
    } else if (k % 3 === 0) {                                       // a flake: a thin standing edge to pull on
      rock(p.x + nrm.x * 0.1, p.y + 0.05, p.z + nrm.z * 0.1, rr(0.1, 0.16), rr(0.24, 0.36), rr(0.2, 0.3), col, 200 + k, 0.4);
    } else {                                                        // a knob or jug
      rock(p.x + nrm.x * 0.1, p.y + 0.04, p.z + nrm.z * 0.1, rr(0.2, 0.32), rr(0.15, 0.24), rr(0.18, 0.3), col, 200 + k, 0.35);
    }
    if (k % 4 === 1) rock(p.x + nrm.x * 0.06 + R.px * rr(-0.5, 0.5), p.y - 0.28, p.z + nrm.z * 0.06 + R.pz * rr(-0.5, 0.5), rr(0.14, 0.24), rr(0.1, 0.16), rr(0.14, 0.22), shade(col, 0.85), 700 + k, 0.4);   // a small foothold below it
  }

  /* ---- the summit: a cairn of stacked basalt (no flag) */
  {
    const t = R.top, ty = t.y;
    cairn(t.x - R.dx * 1.4 + R.px * 1.4, t.z - R.dz * 1.4 + R.pz * 1.4, 1.9, ty);
  }

  /* ---- the teeth of the rim, and outcrops on the ribs of the upper cone */
  for (let k = 0; k < 34; k++) {
    const a = (k / 34) * Math.PI * 2 + rr(-0.06, 0.06);
    let da = a - ASCENT.theta; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) < 0.95) continue;                                   // keep the rim walk clear
    const r = rr(14, 19.5), x = VOL.x + Math.cos(a) * r, z = VOL.z + Math.sin(a) * r, y = getHeight(x, z);
    const h = rr(3.2, 8.5), w = rr(1.2, 2.4);
    const g = lumpy(new THREE.ConeGeometry(1, 2, 6, 3), 0.28, 300 + k);
    mb.addGeo(g, mat4(x, y + h * 0.9, z, w, h, w * rr(0.7, 1.1), rr(-0.18, 0.18), rng() * 6, rr(-0.18, 0.18)), (v) => {
      const t = Math.max(0, Math.min(1, (v.y - y) / (h * 2)));
      return shade(pickB(), 0.75 + 0.35 * t).lerp(ASH, t * t * 0.35);
    });
  }
  for (let k = 0; k < 70; k++) {
    const a = rng() * Math.PI * 2, r = rr(20, 44), x = VOL.x + Math.cos(a) * r, z = VOL.z + Math.sin(a) * r;
    let da = a - ASCENT.theta; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) < 0.12 && r < 46) continue;                         // not on the climbing line
    const y = getHeight(x, z), s = rr(1.1, 3.2);
    rock(x, y + s * 0.3, z, s, s * rr(0.7, 1.3), s * rr(0.8, 1.2), pickB(), 400 + k, 0.4);
  }

  const m = new THREE.Mesh(mb.build(), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m);
}
