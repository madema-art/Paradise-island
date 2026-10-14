import * as THREE from 'three';
import { scene, updaters, env } from './core.js';
import { register } from './fauna_common.js';
import { ReferencePopulation } from './fishing_reference_population.js';
import { registerFishingPopulation } from './fishing.js';

// Explicit review fixture: production never creates a replacement school.
export function installFishingReview(site, life, isPaused) {
  const pop = new ReferencePopulation({ ...site, id: 'review-bank', name: 'the review mullet pool' });
  registerFishingPopulation(pop); life.restorePopulation();
  const meshes = pop.members.map(f => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshStandardMaterial({ color: '#adc5cb', roughness: .4 }));
    body.scale.set(.07, .09, f.length / 2); g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(.08, .12, 3), body.material); tail.rotation.x = -Math.PI / 2; tail.position.z = -f.length / 2; g.add(tail);
    scene.add(g); return g;
  });
  const guide = new THREE.Group(); guide.position.set(site.target.x, -.6, site.target.z); scene.add(guide);
  register({ id: 'fishing-review-population', name: 'Review silver mullet population', cat: 'Sea life', group: guide,
    viewDist: 5, pickR: 3, desc: 'Isolated fishing adapter demonstration. Gameplay length and mass estimates, not a researched species model.',
    sim: { summary: () => ({ doing: 'Swimming near the bait; individual ownership is tracked', ...pop.summary() }) } });
  updaters.push(dt => {
    if (env.paused || isPaused()) return;
    pop.update(Math.min(dt, .05));
    pop.members.forEach((f, i) => {
      meshes[i].position.set(f.x, f.y, f.z); meshes[i].rotation.y = pop.time * .3 + f.phase + Math.PI / 2;
      if (f.owner) meshes[i].rotation.y = Math.atan2(site.stand.x - f.x, site.stand.z - f.z);
      // The borrowed member is hidden while inspected; other fish keep swimming.
      if (f.owner && life.fishing.session?.stage === 'landed') meshes[i].visible = false;
      else meshes[i].visible = !f.removed;
    });
  });
  return pop;
}
