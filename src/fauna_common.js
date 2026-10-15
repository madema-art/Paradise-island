import * as THREE from 'three';
import { scene, creatures, pickables, camera } from './core.js';
import { getHeight, getSlope, riverDist, VOL, lavaDist } from './world.js';
import { rnd, rr, angDiff, TAU, clamp, damp } from './util.js';
import { sizeCreature } from './wildlife_size.js';

export const fauna = new THREE.Group();
scene.add(fauna);

/** the castaway as seen by the wildlife: boars and monkeys react to him as well as to the camera */
export const actors = { castaway: { on: false, x: 0, y: 0, z: 0 }, camScale: 1 };
const _np = { x: 0, z: 0, d: 99, cast: false };
/** the nearest person to a creature at (x, z): the camera, or the castaway if he is closer. d is 99 when out of vertical reach.
 *  A camera on the castaway is a person; the free and follow cameras are an unseen observer, so animals only mind them from close by (actors.camScale, set by camera.js). */
export function nearestPerson(x, z, y, reachY = 7) {
  const cam = camera.position, cd = Math.abs(cam.y - y) < reachY ? Math.hypot(cam.x - x, cam.z - z) / actors.camScale : 99;
  const c = actors.castaway, kd = c.on && Math.abs(c.y - y) < 4 ? Math.hypot(c.x - x, c.z - z) : 99;
  if (kd < cd) { _np.x = c.x; _np.z = c.z; _np.d = kd; _np.cast = true; }
  else { _np.x = cam.x; _np.z = cam.z; _np.d = cd; _np.cast = false; }
  return _np;
}

const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
const proxyGeo = new THREE.SphereGeometry(1, 6, 4);

/** register a selectable creature (appears in the field guide, clickable in the scene) */
export function register(c) {
  c.viewDist = c.viewDist || 9;
  c.focus = c.focus || ((out) => c.group.getWorldPosition(out || new THREE.Vector3()));
  // remember every part's rest pose as the rig was built (the Field Guide shows the animal at rest, not in whatever it is doing: asleep with its legs folded, hidden in a burrow)
  c.group.traverse((o) => { if (o !== c.group) o.userData.restPose = { p: [o.position.x, o.position.y, o.position.z], q: [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w], s: [o.scale.x, o.scale.y, o.scale.z] }; });
  sizeCreature(c);                                  // the species size (docs/WILDLIFE_SCALE_RESEARCH.md), before the pick proxy is added
  const p = new THREE.Mesh(proxyGeo, proxyMat);
  p.scale.setScalar((c.pickR || 1.4) / c.group.scale.x);   // the selection radius is in world metres, whatever the creature's size
  p.position.y = c.pickY ?? 0.6;
  p.userData.creature = c;
  c.group.add(p);
  pickables.push(p);
  creatures.push(c);
  return c;
}

const _a = { x: 0, y: 0, z: 0 };
/** put a group on the terrain, tilted with the slope, facing heading (forward = local +z) */
export function orient(g, x, z, heading, len = 0.7, wid = 0.45, yOff = 0, smooth = 1) {
  const s = Math.sin(heading), c = Math.cos(heading);
  const y = getHeight(x, z);
  const hF = getHeight(x + s * len, z + c * len), hB = getHeight(x - s * len, z - c * len);
  const hR = getHeight(x + c * wid, z - s * wid), hL = getHeight(x - c * wid, z + s * wid);
  const pitch = Math.atan2(hB - hF, 2 * len), roll = Math.atan2(hR - hL, 2 * wid);
  g.position.set(x, y + yOff, z);
  g.rotation.set(pitch, heading, roll, 'YXZ');
  return y;
}

export function steer(cur, target, maxTurn) {
  const d = angDiff(cur, target);
  return cur + clamp(d, -maxTurn, maxTurn);
}

/** can a land animal stand here? */
export function canStand(x, z, { minH = 2.0, maxH = 60, maxSlope = 0.45, river = 2.2, lava = 14 } = {}) {
  const h = getHeight(x, z);
  if (h < minH || h > maxH) return false;
  if (getSlope(x, z) > maxSlope) return false;
  if (river > 0 && riverDist(x, z) < river) return false;
  if (Math.hypot(x - VOL.x, z - VOL.z) < 22) return false;
  if (lavaDist(x, z) < lava) return false;
  return true;
}

export function randomSpot(cx, cz, rmin, rmax, opts, tries = 14) {
  for (let i = 0; i < tries; i++) {
    const a = rnd() * TAU, r = rr(rmin, rmax);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (canStand(x, z, opts)) return { x, z };
  }
  return null;
}

/** simple limb: pivot at top, hanging cylinder; returns pivot */
export function limb(parent, x, y, z, len, r0, r1, mat, foot = null) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 6), mat);
  m.position.y = -len / 2;
  m.castShadow = true;
  p.add(m);
  if (foot) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(foot.r, 6, 5), foot.mat || mat);
    f.scale.set(1, 0.6, foot.long || 1.3);
    f.position.set(0, -len, foot.z || 0.03);
    f.castShadow = true;
    p.add(f);
  }
  parent.add(p);
  return p;
}

const _lv = new THREE.Vector3();
/** smoothly turn a head toward the camera when it is close; returns st.y / st.p offsets (radians) */
export function lookAtCamera(group, st, dt, headY = 0.9, range = 14, maxYaw = 1.0) {
  let ty = 0, tp = 0;
  _lv.copy(camera.position);
  group.worldToLocal(_lv);
  const d = Math.hypot(_lv.x, _lv.z);
  if (d < range && d > 0.5 && _lv.z > -0.2 * d) {
    ty = clamp(Math.atan2(_lv.x, _lv.z), -maxYaw, maxYaw);
    tp = clamp(-Math.atan2(_lv.y - headY, d), -0.45, 0.45);
  }
  st.y = damp(st.y || 0, ty, 3.5, dt);
  st.p = damp(st.p || 0, tp, 3.5, dt);
  return st;
}
export function blinkAt(eyes, t, phase) {
  const b = ((t * 0.33 + phase) % 1) > 0.965 ? 0.12 : 1;
  for (const e of eyes) e.scale.y = b;
}
