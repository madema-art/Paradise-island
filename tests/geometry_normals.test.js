import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { smoothNormals } from '../src/geometry_normals.js';

test('smooth normals weld only normals and preserve colour/wind/topology', () => {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = Array.from(g.attributes.position.array);
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(p.filter((_, i) => i % 3 === 0), 1));
  const wind = Array.from(g.attributes.aWind.array);
  g.setAttribute('color', new THREE.Float32BufferAttribute(p.map(x => Math.abs(x)), 3));
  const color = Array.from(g.attributes.color.array);
  smoothNormals(g);
  assert.deepEqual(Array.from(g.attributes.position.array), p);
  assert.deepEqual(Array.from(g.attributes.aWind.array), wind);
  assert.deepEqual(Array.from(g.attributes.color.array), color);
  assert.equal(g.index, null);
  const keys = new Map(), n = g.attributes.normal;
  for (let i = 0; i < g.attributes.position.count; i++) {
    const point = p.slice(i * 3, i * 3 + 3), key = point.map(x => Math.round(x * 1e5)).join(',');
    const normal = [n.getX(i), n.getY(i), n.getZ(i)];
    if (keys.has(key)) assert.deepEqual(normal, keys.get(key));
    keys.set(key, normal);
    assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-6);
    assert.ok(normal.reduce((sum, x, k) => sum + x * point[k], 0) > .99);
  }
});

test('area weighting favours the larger face, with finite degenerate normals', () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0,0,0, 2,0,0, 0,2,0, // area 2, +Z
    0,0,0, 0,1,0, 0,0,1, // area .5, +X
    9,9,9, 9,9,9, 9,9,9,
  ], 3));
  smoothNormals(g);
  const n = g.attributes.normal;
  assert.ok(Math.abs(n.getZ(0) / n.getX(0) - 4) < 1e-5);
  assert.ok(Array.from(n.array).every(Number.isFinite));
});
