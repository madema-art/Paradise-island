import test from 'node:test'; import assert from 'node:assert/strict'; import * as THREE from 'three';
import { createCoconut, setCoconutState, coconutWholeGeometry, coconutCrownGeometry, COCONUT_STATES } from '../src/coconut.js';
test('one shared coconut scale, finite geometry and smaller silhouette than the old ground sphere', () => {
  for (let variant = 0; variant < 3; variant++) {
    const g = coconutWholeGeometry(variant); g.computeBoundingBox(); const size = g.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.x > .18 && size.x < .23); assert.ok(size.y > .22 && size.y < .25); assert.ok(size.z > .17 && size.z < .21);
    for (const name of ['position', 'normal', 'uv', 'color']) assert.ok(g.attributes[name].array.every(Number.isFinite));
    assert.equal(coconutWholeGeometry(variant), g);
  }
  assert.ok(coconutCrownGeometry().index.count / 3 <= 120);
});
test('state changes keep hand parent, centre pivot, rotation, scale and named animation anchors', () => {
  const hand = new THREE.Group(), c = createCoconut(); hand.add(c); c.position.set(1, 2, 3); c.rotation.set(.2, .3, .4); c.scale.setScalar(.7);
  const before = c.position.toArray().concat(c.rotation.toArray(), c.scale.toArray());
  for (const state of COCONUT_STATES) {
    setCoconutState(c, state); assert.equal(c.parent, hand); assert.equal(c.userData.coconut.state, state);
    assert.deepEqual(c.position.toArray().concat(c.rotation.toArray(), c.scale.toArray()), before);
    for (const name of ['Coconut_grip', 'Coconut_opening', 'Coconut_base']) assert.ok(c.getObjectByName(name));
    const visual = c.getObjectByName('Coconut_visual'), children = visual.children.slice(); setCoconutState(c, state); assert.deepEqual(visual.children, children);
  }
  assert.throws(() => setCoconutState(c, 'imaginary'));
});
test('open flesh, two split halves and bare remains have distinct real geometry', () => {
  const c = createCoconut({ state: 'opened' }); assert.ok(c.getObjectByName('Coconut_water')); assert.ok(c.getObjectByName('White_flesh_rim'));
  const rim = c.getObjectByName('White_flesh_rim').geometry; rim.computeBoundingBox(); const size = rim.boundingBox.getSize(new THREE.Vector3()); assert.ok(size.x > .1 && size.z > .1);
  setCoconutState(c, 'split'); assert.ok(c.getObjectByName('Half_left')); assert.ok(c.getObjectByName('Half_right'));
  setCoconutState(c, 'spent'); assert.equal(c.getObjectByName('White_flesh_rim'), undefined); assert.equal(c.getObjectByName('Interior').material.name, 'Coconut_bare');
});
