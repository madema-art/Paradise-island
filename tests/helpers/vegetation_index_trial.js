import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const indexed = new WeakMap();

/** Rejected performance experiment, used only by the tuning harness.
 * Render-only indexing retains position/normal/colour/wind seams and all faces.
 * Full-resolution inspection proxies keep their original geometry and identity.
 * Built once per shared source, never from an update loop. */
export function indexedVegetation(source) {
  if (source.index || !source.attributes.position.count) return source;
  let result = indexed.get(source);
  if (!result) {
    result = mergeVertices(source, 1e-6);
    indexed.set(source, result);
  }
  return result;
}
