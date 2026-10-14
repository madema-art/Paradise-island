// Bounded local ground routing for project walks; uses the existing terrain/collider predicates.
// The mind and all other human/wildlife locomotion remain unchanged.
export function findProjectPath(from, to, stand, height) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function clear(a, b) {
    const n = Math.max(1, Math.ceil(dist(a, b) / .4)); let prev = a;
    for (let i = 1; i <= n; i++) {
      const p = { x: a.x + (b.x - a.x) * i / n, z: a.z + (b.z - a.z) * i / n };
      if (!stand(p) || Math.abs(height(p.x, p.z) - height(prev.x, prev.z)) > dist(prev, p) * .7 + .08) return false;
      prev = p;
    }
    return true;
  }
  if (clear(from, to)) return [to];
  const cell = 1.2, margin = 10, max = 2400;
  const x0 = Math.min(from.x, to.x) - margin, x1 = Math.max(from.x, to.x) + margin;
  const z0 = Math.min(from.z, to.z) - margin, z1 = Math.max(from.z, to.z) + margin;
  const key = (i, j) => i + ',' + j;
  const start = { x: from.x, z: from.z, i: 0, j: 0, g: 0, f: dist(from, to), parent: null };
  const open = [start], best = new Map([[key(0, 0), 0]]), closed = new Set();
  for (let count = 0; open.length && count < max; count++) {
    open.sort((a, b) => b.f - a.f); const cur = open.pop(), k = key(cur.i, cur.j);
    if (closed.has(k)) continue; closed.add(k);
    if (dist(cur, to) < cell * 2 && clear(cur, to)) {
      const path = [to]; for (let c = cur; c.parent; c = c.parent) path.push({ x: c.x, z: c.z });
      return path.reverse();
    }
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      if (!i && !j) continue;
      const ni = cur.i + i, nj = cur.j + j, nk = key(ni, nj);
      if (closed.has(nk)) continue;
      const next = { x: from.x + ni * cell, z: from.z + nj * cell, i: ni, j: nj, parent: cur };
      if (next.x < x0 || next.x > x1 || next.z < z0 || next.z > z1) continue;
      next.g = cur.g + dist(cur, next);
      if (next.g >= (best.get(nk) ?? Infinity) || !clear(cur, next)) continue;
      best.set(nk, next.g); next.f = next.g + dist(next, to); open.push(next);
    }
  }
  return null;
}
