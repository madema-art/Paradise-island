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
    ("export const VOL = { x: 62, z: -62, R: 92, H: 114, craterR: 11, lavaY: 66.2 };",
     """export const VOL = { x: 62, z: -62, R: 92, H: 114, craterR: 11, lavaY: 66.2, rim: 118 };
/** the Ascent: a switchback trail up the lower cone to a basecamp ledge, then a fixed-rope climb up the south buttress to the rim */
export const ASCENT = { theta: 70 * Math.PI / 180, rBase: 44, rTop: 15.7, ledgeR: [34, 25], trail: [], stations: [], bc: null, top: null, rim: [] };"""),
    # ---- the upper cone: taller, steeper, ribbed
    ("  return c - 3 - 0.15 * Math.max(0, r - VOL.R);\n}",
     """  return volcanoUpper(c - 3 - 0.15 * Math.max(0, r - VOL.R), x, z, r, ang);
}

/** Everything below 48 m is exactly the old cone (so the jungle and every placement on the lower slopes stay put); above it the cone
 *  steepens toward a tall crown, grows radial ribs and gullies, and the crater rim gets horns and saddles. */
function volcanoUpper(base, x, z, r, ang) {
  const U0 = 48;
  if (base <= U0) return base;
  const k = smoothstep(U0, 94, base);
  let h = U0 + (base - U0) * (1 + 0.85 * k);
  const up = smoothstep(U0, 74, base);
  const fade = smoothstep(19, 31, r);
  const ridge = 1 - Math.abs(noise2(ang * 5.0 + 3, r * 0.004));
  h += up * fade * (ridge * 9 - 4.5 + noise2(ang * 11.0 + 7, r * 0.01) * 3);
  let da = ang - ASCENT.theta; da = Math.atan2(Math.sin(da), Math.cos(da));
  h += up * Math.exp(-((da / 0.07) ** 2)) * 5.5 * smoothstep(20, 36, r) * (1 - smoothstep(40, 48, r));        // the rib the climbing route follows
  const crest = Math.exp(-(((r - 15.5) / 3.2) ** 2));
  h += crest * (5 * noise2(ang * 2.5 + 1, 0.7) + 3.5 * noise2(ang * 6.0, 1.3));                              // horns and saddles on the rim
  return h;
}"""),
    # ---- the route: trail benches, ledges, the rim walk (as flats)
    ("  FAIRY.y = rawNoFlat(FAIRY.x, FAIRY.z);\n  flats.push({ x: FAIRY.x, z: FAIRY.z, r0: 8, r1: 15, y: FAIRY.y });\n}",
     """  FAIRY.y = rawNoFlat(FAIRY.x, FAIRY.z);
  flats.push({ x: FAIRY.x, z: FAIRY.z, r0: 8, r1: 15, y: FAIRY.y });
  buildAscent();
}

/** the Ascent: benches cut into the cone make a walkable switchback to a basecamp ledge; rest ledges and a rim walk are cut the same way */
function buildAscent() {
  const A = ASCENT, DEG = Math.PI / 180;
  const th0 = 153 * DEG, th1 = A.theta, r0 = 76, r1 = A.rBase, kk = (r0 - r1) / (th0 - th1);
  const pts = []; let th = th0, prev = null;
  while (th > th1) {
    const rr = r0 - kk * (th0 - th) + 1.3 * Math.sin(th * 6);
    const x = VOL.x + Math.cos(th) * rr, z = VOL.z + Math.sin(th) * rr;
    if (!prev || Math.hypot(x - prev.x, z - prev.z) >= 1.7) { pts.push({ x, z }); prev = { x, z }; }
    th -= 0.6 / rr;
  }
  // bench height: the cone under the centre line, smoothed, with the climb rate capped so it is always walkable
  const raw = pts.map((p) => rawNoFlat(p.x, p.z));
  const sm = raw.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - 4); j <= Math.min(raw.length - 1, i + 4); j++) { s += raw[j]; n++; } return s / n; });
  for (let i = 1; i < sm.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); sm[i] = Math.min(sm[i], sm[i - 1] + 0.5 * d); sm[i] = Math.max(sm[i], sm[i - 1] - 0.2 * d); }
  pts.forEach((p, i) => { A.trail.push({ x: p.x, z: p.z, y: sm[i] }); flats.push({ x: p.x, z: p.z, r0: 1.5, r1: 3.6, y: sm[i] }); });
  // basecamp ledge at the end of the trail, directly under the climb
  const dx = Math.cos(th1), dz = Math.sin(th1);
  const bc = { x: VOL.x + dx * r1, z: VOL.z + dz * r1 };
  const bcY = Math.max(sm[sm.length - 1], rawNoFlat(bc.x, bc.z) - 0.5);
  A.bc = { x: bc.x, z: bc.z, y: bcY };
  flats.push({ x: bc.x, z: bc.z, r0: 4.2, r1: 7.5, y: bcY });
  // the trail's last metres run into the ledge
  const last = A.trail[A.trail.length - 1];
  for (let q = 1; q <= 4; q++) { const f = q / 5; flats.push({ x: last.x + (bc.x - last.x) * f, z: last.z + (bc.z - last.z) * f, r0: 1.5, r1: 3.6, y: last.y + (bcY - last.y) * f }); }
  // rest ledges on the wall, and the crest
  const stations = [{ id: 'base', r: r1, x: bc.x, z: bc.z }];
  for (const r of A.ledgeR) {
    const x = VOL.x + dx * r, z = VOL.z + dz * r, y = rawNoFlat(x, z) - 0.4;
    flats.push({ x, z, r0: 2.2, r1: 4.6, y });
    stations.push({ id: 'ledge' + r, r, x, z });
  }
  const tx = VOL.x + dx * A.rTop, tz = VOL.z + dz * A.rTop;
  const topY = rawNoFlat(tx, tz) - 0.2;
  flats.push({ x: tx, z: tz, r0: 2.6, r1: 5, y: topY });
  stations.push({ id: 'top', r: A.rTop, x: tx, z: tz });
  A.stations = stations; A.top = { x: tx, z: tz, y: topY };
  // a walk along the crest of the rim, so the mouth can be seen from all round
  const rimPts = [];
  for (let a = -46; a <= 46; a += 7) {
    const ang = th1 + a * DEG, x = VOL.x + Math.cos(ang) * A.rTop, z = VOL.z + Math.sin(ang) * A.rTop;
    rimPts.push({ x, z, y: rawNoFlat(x, z) });
  }
  const rs = rimPts.map((p, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - 2); j <= Math.min(rimPts.length - 1, i + 2); j++) { s += rimPts[j].y; n++; } return s / n; });
  rimPts.forEach((p, i) => { const y = Math.min(rs[i], topY + 3.0); A.rim.push({ x: p.x, z: p.z, y }); flats.push({ x: p.x, z: p.z, r0: 1.9, r1: 3.8, y }); });
}"""),
    ("export function getNormal(x, z, out = { x: 0, y: 1, z: 0 }) {",
     """/** true on the flanks of the volcano where the rock is too steep to walk up: only the Ascent's benches, the ledges and the rim walk are flat enough */
export function volcanoSteep(x, z) {
  const dx = x - VOL.x, dz = z - VOL.z;
  if (dx * dx + dz * dz > (VOL.R * 0.95) ** 2) return false;
  getNormal(x, z, _ns);
  return _ns.y < 0.68;
}
const _ns = { x: 0, y: 1, z: 0 };

export function getNormal(x, z, out = { x: 0, y: 1, z: 0 }) {"""),
])
print('ok')
