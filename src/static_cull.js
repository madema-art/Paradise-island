// Culling for still instanced meshes. An InstancedMesh is culled as one object, so an instanced mesh whose instances are spread over the
// island was never culled (frustumCulled off). Once the world is built, each instanced mesh is checked: if its instance matrices and
// visibility do not change over two seconds, it is still, and it is culled with a bounding sphere of its instances. Moving meshes (the
// school fish, the jellyfish, the flocks) are left as they are.
import { updaters, scene, creatures } from './core.js';

const skip = (o) => o.name === 'school-fish' || o.name === 'anthias-fish' || o.name === 'instanced parts' || o.userData.lodBatch || o.frustumCulled;
const sig = (im) => { const a = im.instanceMatrix.array; let h = 0; for (let i = 0; i < a.length; i += 3) h = (h * 31 + Math.round(a[i] * 100)) | 0; return h + '|' + im.visible; };
export const staticCullStats = { checked: 0, culled: 0 };
let state = 0, t = 0, snap = new Map();

updaters.push((dt) => {
  if (state === 2) return;
  if (creatures.length <= 100) return;
  t += dt;
  if (state === 0 && t >= 3) {
    scene.traverse((o) => { if (o.isInstancedMesh && !skip(o)) snap.set(o, sig(o)); });
    state = 1; t = 0;
  } else if (state === 1 && t >= 2) {
    for (const [im, s] of snap) {
      staticCullStats.checked++;
      if (im.parent && sig(im) === s) { im.computeBoundingSphere(); im.frustumCulled = true; staticCullStats.culled++; }
    }
    snap = new Map();
    state = 2;
  }
});
