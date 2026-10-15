// Opt-in in-world art review. No gameplay or fixture state is installed at a normal URL.
import * as THREE from 'three';
import { createCoconut, setCoconutState, COCONUT } from '../coconut.js';
import { Avatar } from '../survival/avatar.js';
import { makeMonkeyRig } from '../monkey_model.js';
import { updateContests, contests } from '../monkey_contest.js';

export function startCoconutReview(step) {
  const d = window.__dbg, { scene, cam, WORLD } = d;
  d.env.tod = 11; d.env.speed = 0;
  const origin = { x: d.falls.camp.x, z: d.falls.camp.z };
  let base = { ...origin };
  let found = false;
  search: for (let radius = 10; radius <= 100; radius += 2) for (let k = 0; k < 24; k++) {
    const a = Math.PI + k * Math.PI / 12, p = { x: origin.x + Math.cos(a) * radius, z: origin.z + Math.sin(a) * radius };
    const spots = [[0, 0], [-3, 1], [3, 1], [-1.8, 0], [1.8, 0], [.6, 2.6]];
    if (spots.every(([x, z]) => {
      const q = { x: p.x + x, z: p.z + z }, before = { ...q }; WORLD.resolveColliders(q, .5);
      return WORLD.getHeight(q.x, q.z) > 2.5 && WORLD.getSlope(q.x, q.z) < .4 && Math.hypot(q.x - before.x, q.z - before.z) < .05;
    })) { base = p; found = true; break search; }
  }
  if (!found) throw new Error('No dry review clearing found');
  base.y = WORLD.getHeight(base.x, base.z);
  const group = new THREE.Group(); group.name = 'Coconut_review_only'; scene.add(group);
  const boardY = base.y + 1.1;
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, .06, .6), new THREE.MeshStandardMaterial({ color: '#bca57e', roughness: .95 }));
  board.position.set(base.x, boardY - .03, base.z); board.receiveShadow = true; group.add(board);
  const samples = [];
  const before = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#5a3a1e', roughness: .8, flatShading: true }));
  before.name = 'Before_ground_coconut'; before.scale.set(.26, .24, .26); before.position.set(base.x - 1.3, boardY + .24, base.z); group.add(before);
  for (const [i, state] of ['whole', 'opened', 'half', 'split', 'spent'].entries()) {
    const prop = createCoconut({ state, variant: i % 3 }); prop.position.set(base.x - .67 + i * .53, boardY + COCONUT.restHeight, base.z);
    prop.rotation.y = -.3; group.add(prop); samples.push(prop);
  }
  const human = new Avatar(); human.group.visible = true;
  human.group.position.set(base.x + 3, WORLD.getHeight(base.x + 3, base.z + 1), base.z + 1); human.group.rotation.y = -.3;
  human.hold(null, 'coconut'); human.job('eat', .4, 0); human.apply(1);
  const monkey = makeMonkeyRig();
  if (monkey) {
    group.add(monkey.group); monkey.group.position.set(base.x - 3, WORLD.getHeight(base.x - 3, base.z + 1), base.z + 1);
    monkey.play('coconut_inspect', { fade: 0 }); monkey.update(.5); monkey.setNut(true);
  }
  const ui = document.createElement('div'); ui.id = 'coconut-art-review';
  Object.assign(ui.style, { position: 'fixed', left: '20px', bottom: '22px', color: '#fff5dc', background: '#142e24e8', padding: '12px 18px', borderRadius: '10px', font: '14px system-ui', zIndex: 99 });
  ui.innerHTML = '<b>COCONUT PROP REVIEW</b><div style="margin:5px 0">Before · Whole · Drinking · Flesh half · Split pair · Used shell</div>';
  const focus = (which = 'gallery') => {
    let p, target;
    if (which === 'gallery') { target = new THREE.Vector3(base.x, boardY + .06, base.z); p = target.clone().add(new THREE.Vector3(.6, 1.2, 2.6)); }
    else if (which === 'human') { target = human.group.position.clone().add(new THREE.Vector3(0, 1.15, 0)); p = target.clone().add(new THREE.Vector3(.9, .45, 2)); }
    else if (which === 'monkey' && monkey) { target = monkey.group.position.clone().add(new THREE.Vector3(0, .55, 0)); p = target.clone().add(new THREE.Vector3(.65, .45, 1.4)); }
    else if (which === 'ground') {
      const nut = d.flora.coconuts.free(base.x, base.z, 200, true); if (!nut) return;
      target = new THREE.Vector3(nut.x, WORLD.getHeight(nut.x, nut.z) + .1, nut.z); p = target.clone().add(new THREE.Vector3(.6, .55, .85));
    } else return;
    // Find an unblocked review angle instead of hiding the island's foliage.
    scene.updateMatrixWorld(true);
    const offset = p.clone().sub(target), ray = new THREE.Raycaster(); let best = p, clearance = -1;
    const belongsToFixture = object => { for (let o = object; o; o = o.parent) if (o === group || o === human.group) return true; return false; };
    for (const angle of [0, .65, -.65, 1.3, -1.3, Math.PI, 2.1, -2.1]) {
      const candidate = target.clone().add(offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle));
      if (WORLD.getHeight(candidate.x, candidate.z) + .1 > candidate.y) continue;
      const direction = target.clone().sub(candidate), distance = direction.length(); ray.set(candidate, direction.normalize()); ray.far = distance - .2;
      const hit = ray.intersectObjects(scene.children, true).find(h => !belongsToFixture(h.object) && h.object.visible && h.object.material?.visible !== false && !h.object.material?.transparent);
      const score = hit ? hit.distance : distance;
      if (score > clearance) { best = candidate; clearance = score; }
      if (!hit) break;
    }
    cam.goto(best.toArray(), target.toArray());
  };
  for (const label of ['gallery', 'human', 'monkey', 'ground']) {
    const b = document.createElement('button'); b.textContent = label; b.onclick = () => focus(label); b.style.marginRight = '8px'; ui.append(b);
  }
  const control = {
    samples, before, human, monkey, base, focus, contestTest: { updateContests, contests },
    humanState(state) { setCoconutState(human.props.coco, state); },
    monkeyState(state) { monkey?.setNutState(state); },
    snapshot() {
      const box = o => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).toArray();
      return { units: 'metres; centre pivot; +Y opening', beforeSize: box(before),
        samples: samples.map(o => ({ ...o.userData.coconut, size: box(o) })),
        human: human.props.coco.userData.coconut,
        monkey: monkey && { clip: monkey.current, state: monkey.nutState, visible: monkey.active().nut.visible },
        wildlife: d.creatures.length, placement: d.flora.palms.map(p => [p.x, p.z, p.crown.x, p.crown.y, p.crown.z]) };
    },
  };
  document.body.append(ui);
  window.__coconutReview = control;
  window.render_game_to_text = () => JSON.stringify(control.snapshot());
  window.advanceTime = ms => { const n = Math.max(1, Math.ceil(ms / (1000 / 60))); for (let i = 0; i < n; i++) step(ms / 1000 / n); d.composer.render(); };
  document.getElementById('boot').style.display = 'none';
  focus(); d.composer.render();
}
