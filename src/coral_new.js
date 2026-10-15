// Coral shapes for the reef and the south-seas garden, ported from the assets workshop (Paradise-Island-3d-assets, commit 43bab58,
// viewer/lagoon/lagoon_kit.js newCoral). Each kind is one welded, smooth-shaded BufferGeometry with vertex colour (darker at the base,
// lighter at the tips) and aWind, as the game's MB builder gives its geometry. The shapes are the workshop's redesign: fewer triangles
// (branching 84 -> about 75 for a head, cauliflower 960 -> 80) and scalloped rims. The random numbers come from their own seeded
// generator, so the world's stream is spent by the caller (burn) exactly as the old builders spent it.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './util.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function hash3(x, y, z, s) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453;
  return h - Math.floor(h);
}
// smooth value noise in [-1, 1]
function noise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const n = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, s);
  const x0 = l(n(0, 0, 0), n(1, 0, 0), u), x1 = l(n(0, 1, 0), n(1, 1, 0), u);
  const x2 = l(n(0, 0, 1), n(1, 0, 1), u), x3 = l(n(0, 1, 1), n(1, 1, 1), u);
  return l(l(x0, x1, v), l(x2, x3, v), w) * 2 - 1;
}

// a tapered tube, indexed so the result welds cleanly
function tubeGeo(centres, radii, seg) {
  const rings = centres.map((c, i) => {
    const a = centres[Math.max(0, i - 1)], b = centres[Math.min(centres.length - 1, i + 1)];
    const T = b.clone().sub(a).normalize();
    const U = new THREE.Vector3().crossVectors(T, new THREE.Vector3(0, 0, 1)).normalize();
    if (U.lengthSq() < 0.01) U.set(1, 0, 0);
    const V = new THREE.Vector3().crossVectors(T, U).normalize();
    const out = [];
    for (let j = 0; j < seg; j++) {
      const t = (j / seg) * TAU;
      out.push(c.clone().addScaledVector(U, Math.cos(t) * radii[i]).addScaledVector(V, Math.sin(t) * radii[i]));
    }
    return out;
  });
  const pos = [], idx = [];
  const add = (v) => { pos.push(v.x, v.y, v.z); return pos.length / 3 - 1; };
  const ids = rings.map((ring) => ring.map(add));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      idx.push(ids[i][j], ids[i + 1][j], ids[i][j2], ids[i][j2], ids[i + 1][j], ids[i + 1][j2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// push each vertex in or out along its radius by noise of its angle: scalloped rims and ruffled plates, no extra triangles
function scallop(geo, amt, seed) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const r = Math.hypot(v.x, v.z);
    if (r < 1e-4) continue;
    const a = Math.atan2(v.z, v.x);
    const k = 1 + amt * noise3(Math.cos(a) * 2.2 + seed, v.y * 4, Math.sin(a) * 2.2, 9) * (r > 0.2 ? 1 : 0.5);
    p.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function jitterSphere(detail, amt, seed, radii = [1, 1, 1]) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + amt * noise3(v.x * 2 + seed, v.y * 2, v.z * 2, 3);
    p.setXYZ(i, v.x * n * radii[0], v.y * n * radii[1], v.z * n * radii[2]);
  }
  return g;
}

// the parts are welded (so the normals are smooth), coloured by height (darker at the base) and given the wind weight
function finish(geo, seed) {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const welded = mergeVertices(geo, 1e-4);
  welded.computeVertexNormals();
  welded.computeBoundingBox();
  const bb = welded.boundingBox, h = Math.max(1e-6, bb.max.y - bb.min.y);
  const p = welded.attributes.position, c = new Float32Array(p.count * 3), w = new Float32Array(p.count), v = new THREE.Vector3();
  const base = new THREE.Color('#e9dcd8'), tip = new THREE.Color('#ffffff');
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = clamp((v.y - bb.min.y) / h, 0, 1);
    const k = 0.92 + 0.12 * noise3(v.x * 3 + seed, v.y * 3, v.z * 3, 7);
    const col = base.clone().lerp(tip, t).multiplyScalar(k);
    c.set([col.r, col.g, col.b], i * 3);
    w[i] = 0.15 + 0.5 * t;                          // tips sway more than the base
  }
  welded.setAttribute('color', new THREE.BufferAttribute(c, 3));
  welded.setAttribute('aWind', new THREE.BufferAttribute(w, 1));
  return welded;
}

/** kind: 0 branching, 1 massive, 2 plate, 'table', 'cauli' (cauliflower). Returns one geometry per head. */
export function newCoral(kind, seed = 1) {
  const rnd = mulberry32(seed * 911 + 5);
  if (kind === 0) {
    // branching: five thick branches, each with two twigs (the game's silhouette, with fewer sides on the twigs)
    const parts = [];
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * TAU + rnd() * 0.6, h = 0.42 + rnd() * 0.1;
      const cen = [new THREE.Vector3(), new THREE.Vector3(Math.cos(a) * 0.12, h * 0.5, Math.sin(a) * 0.12), new THREE.Vector3(Math.cos(a) * 0.22, h, Math.sin(a) * 0.22)];
      parts.push(tubeGeo(cen, [0.06, 0.042, 0.016], 5));
      for (let t = 0; t < 2; t++) {
        const s = cen[1].clone().lerp(cen[2], 0.45 + 0.25 * t);
        const ta = a + (t ? 0.9 : -0.9) + rnd() * 0.3 - 0.15;
        const tip = s.clone().add(new THREE.Vector3(Math.cos(ta) * 0.14, 0.14 + rnd() * 0.06, Math.sin(ta) * 0.14));
        parts.push(tubeGeo([s, tip], [0.03, 0.01], 4));
      }
    }
    return finish(mergeGeometries(parts.map((g) => g.toNonIndexed()), false), seed);
  }
  if (kind === 1) {
    // massive: a dome with soft ridges on a detail-1 sphere
    return finish(jitterSphere(1, 0.18, seed, [0.26, 0.17, 0.26]).translate(0, 0.12, 0), seed);
  }
  if (kind === 2) {
    // plate: two crossed fans of eight segments
    const f = new THREE.CircleGeometry(0.22, 8, 0, Math.PI);
    const a = scallop(f.clone(), 0.14, seed), b = scallop(f.clone(), 0.14, seed + 3).rotateY(1.57);
    return finish(mergeGeometries([a, b].map((g) => g.toNonIndexed()), false).translate(0, 0.02, 0), seed);
  }
  if (kind === 'table') {
    // table: a short stem and a flat disc with a scalloped rim
    const stem = new THREE.CylinderGeometry(0.06, 0.09, 0.26, 6, 1).translate(0, 0.13, 0);
    const disc = scallop(new THREE.CylinderGeometry(0.4, 0.46, 0.06, 12, 1, false), 0.12, seed).translate(0, 0.29, 0);
    return finish(mergeGeometries([stem, disc].map((g) => g.toNonIndexed()), false), seed);
  }
  // cauliflower: four lumpy detail-0 spheres in a small cluster
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const g = jitterSphere(0, 0.35, seed * 13 + i, [0.12, 0.12, 0.12]);
    const a = rnd() * TAU, r = rnd() * 0.13;
    parts.push(g.translate(Math.cos(a) * r, 0.11 + (i % 2) * 0.05, Math.sin(a) * r));
  }
  return finish(mergeGeometries(parts.map((g) => g.toNonIndexed()), false), seed);
}
