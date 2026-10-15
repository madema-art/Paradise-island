/** Area-weighted normals welded by position only. Leaves colour/wind seams and topology intact.
 * Explicit build-time operation; never called from an update loop. */
export function smoothNormals(geometry, precision = 1e5) {
  const p = geometry.attributes.position;
  geometry.computeVertexNormals();
  const n = geometry.attributes.normal, sums = new Map(), keys = new Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * precision)},${Math.round(p.getY(i) * precision)},${Math.round(p.getZ(i) * precision)}`;
    keys[i] = key;
    if (!sums.has(key)) sums.set(key, [0, 0, 0]);
  }
  const index = geometry.index, count = index ? index.count : p.count;
  for (let t = 0; t < count; t += 3) {
    const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
    const ux = p.getX(b) - p.getX(a), uy = p.getY(b) - p.getY(a), uz = p.getZ(b) - p.getZ(a);
    const vx = p.getX(c) - p.getX(a), vy = p.getY(c) - p.getY(a), vz = p.getZ(c) - p.getZ(a);
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    for (const i of [a, b, c]) { const s = sums.get(keys[i]); s[0] += x; s[1] += y; s[2] += z; }
  }
  for (let i = 0; i < p.count; i++) {
    const s = sums.get(keys[i]), len = Math.hypot(...s) || 1;
    n.setXYZ(i, s[0] / len, s[1] / len, s[2] / len);
  }
  return geometry;
}
