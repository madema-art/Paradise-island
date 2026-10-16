// Direct control of the castaway. The player takes over the one castaway the island already has (human.js): this module owns the
// input and the camera, and the castaway owns his body, his position and his animation. Taking control stops what he was doing where
// he stands; releasing it leaves him there, and his autonomous logic chooses the next activity from that same spot. Nothing is teleported
// and nothing is respawned. While he is under control the autonomous logic does not run at all.
//
// Keyboard, under control: W S walk forward and back, A D sidestep (both are relative to the view), Q E or Left Right turn the view,
//   Up Down tilt it, the mouse drags to look, the wheel moves the camera in and out (third person), Shift runs, Ctrl walks slowly,
//   Space jumps, F picks up a keepsake in reach, T switches third and first person, V (or Esc) lets go.
// Controller, under control: left stick walks, right stick looks, RT runs, LT walks slowly, A jumps, X picks up, R3 switches the view,
//   Back lets go (or hold B). Start opens the menu; while it is open the castaway reads no input.
// Creature cycling and following are not used under control; following a creature lets him go first.
import * as THREE from 'three';
import { camera } from './core.js';
import { BTN } from './gamepad.js';
import { getHeight } from './world.js';
import { clamp } from './util.js';
import * as menu from './menu.js';
import { isTyping } from './typing.js';

// view: yaw is the way he faces (and the view looks) on the level; pitch is how far the view tilts down (positive looks down)
export const ctrl = {
  on: false, view: 'third', yaw: 0, pitch: 0.16, dist: 4.2, holdB: 0, actQueued: false, jumpQueued: false,
  input: { fwd: 0, side: 0, run: false, slow: false },
};
const IDLE = { fwd: 0, side: 0, run: false, slow: false };
const HOLD_RELEASE = 0.6;          // seconds the release button (hold B) is held, so a stray press does not let him go
const DIST_MIN = 2.2, DIST_MAX = 10;
const EYE = 1.62, EYE_SWIM = 0.6;  // eye height above his feet, on foot and in the water
let body = null;                    // the castaway's side of the bargain (human.js attachCastaway)

/** human.js hands over what the control needs: take(), release(), show(on) for his body, and pose() for where he is now */
export function attachCastaway(b) { body = b; }

/** take control of the castaway where he stands. The view starts behind him, looking the way he faces. */
export function takeControl() {
  if (ctrl.on || !body) return false;
  const p = body.pose();
  ctrl.yaw = p.heading; ctrl.pitch = 0.16; ctrl.holdB = 0; ctrl.actQueued = false; ctrl.jumpQueued = false;
  body.take();
  ctrl.on = true; ctrl.input = { ...IDLE };
  body.show(ctrl.view !== 'first');
  menu.setControl(ctrl.view);
  return true;
}
/** let go: he stays where he is, and his autonomy takes over from that spot */
export function releaseControl() {
  if (!ctrl.on) return;
  ctrl.on = false; ctrl.input = { ...IDLE }; ctrl.holdB = 0; ctrl.actQueued = false; ctrl.jumpQueued = false;
  body.release();
  body.show(true);
  menu.setControl(null);
}
export function toggleControl() { if (ctrl.on) releaseControl(); else takeControl(); }
/** third person and first person: the castaway does not move; the camera changes where it sits, and the view stays the same */
export function toggleView() {
  if (!ctrl.on) return;
  ctrl.view = ctrl.view === 'third' ? 'first' : 'third';
  body.show(ctrl.view !== 'first');             // first person: the castaway's own body is not drawn, so the view is his eyes
  menu.setControl(ctrl.view);
}
/** the mouse, dragged: turns and tilts the view (dragging right turns right; dragging down tilts down) */
export function lookBy(dx, dy) {
  ctrl.yaw -= dx * 0.0045;
  ctrl.pitch = clamp(ctrl.pitch + dy * 0.0045, -0.9, 1.2);
}
/** the wheel, in third person: moves the camera in and out (first person has no distance) */
export function wheelBy(dy) {
  if (ctrl.view !== 'third') return;
  ctrl.dist = clamp(ctrl.dist * Math.exp(dy * 0.0012), DIST_MIN, DIST_MAX);
}

// keys (the keys the camera does not use for itself while he is under control: T and F are free in play)
window.addEventListener('keydown', (e) => {
  if (e.repeat || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || menu.isOpen()) return;
  if (e.code === 'KeyV') toggleControl();
  else if (e.code === 'Escape' && ctrl.on) releaseControl();
  else if (ctrl.on && e.code === 'KeyT') toggleView();
  else if (ctrl.on && e.code === 'KeyF') ctrl.actQueued = true;
  else if (ctrl.on && e.code === 'Space') { e.preventDefault(); ctrl.jumpQueued = true; }
});

// the castaway's side: the camera follows him from the latest pose, and the input is read once a frame
const _u = new THREE.Vector3(), _d = new THREE.Vector3();
/**
 * once a frame, from the camera's update: reads the stick, the keys and the buttons (the menu, when it is open, gets them instead)
 * and places the camera on the castaway. The castaway reads ctrl.input in his own step.
 */
export function frame(dt, pad, keys, inMenu) {
  if (!ctrl.on || !body) return;
  const kd = (...codes) => (!inMenu && codes.some((c) => keys.has(c)) ? 1 : 0);
  const inp = ctrl.input;
  inp.fwd = inMenu ? 0 : clamp(kd('KeyW') - kd('KeyS') - pad.ly, -1, 1);
  inp.side = inMenu ? 0 : clamp(kd('KeyD') - kd('KeyA') + pad.lx, -1, 1);
  inp.run = !inMenu && (kd('ShiftLeft', 'ShiftRight') > 0 || pad.rt > 0.5);
  inp.slow = !inMenu && (kd('ControlLeft') > 0 || pad.lt > 0.5);
  if (!inMenu && pad.pressed[BTN.A]) ctrl.jumpQueued = true;
  if (!inMenu && pad.pressed[BTN.X]) ctrl.actQueued = true;
  if (!inMenu && pad.pressed[BTN.R3]) toggleView();
  if (!inMenu && pad.held[BTN.B]) { ctrl.holdB += dt; if (ctrl.holdB > HOLD_RELEASE) { releaseControl(); return; } } else ctrl.holdB = 0;

  // the view: the arrows and Q / E, and the right stick; it does not change while the menu is open
  const turn = inMenu ? 0 : kd('KeyQ', 'ArrowLeft') - kd('KeyE', 'ArrowRight');
  const tilt = inMenu ? 0 : kd('ArrowDown') - kd('ArrowUp');
  const rx = inMenu ? 0 : pad.rx, ry = inMenu ? 0 : pad.ry;
  const looking = turn !== 0 || tilt !== 0 || rx !== 0 || ry !== 0;
  ctrl.yaw += (turn * 2.2 - rx * 2.4) * dt;
  ctrl.pitch = clamp(ctrl.pitch + (tilt * 1.4 + ry * 1.8) * dt, -0.9, 1.2);
  // third person eases back behind him while he walks straight ahead and nothing is turning the view
  if (ctrl.view === 'third' && !looking && inp.fwd > 0.5 && Math.abs(inp.side) < 0.3) {
    const p = body.pose(), d = Math.atan2(Math.sin(p.heading - ctrl.yaw), Math.cos(p.heading - ctrl.yaw));
    ctrl.yaw += clamp(d, -1.2 * dt, 1.2 * dt);
  }

  const p = body.pose();
  const cp = Math.cos(ctrl.pitch), sp = Math.sin(ctrl.pitch);
  const fx = Math.sin(ctrl.yaw), fz = Math.cos(ctrl.yaw);
  const n = ctrl.view === 'first' ? 0.1 : 0.3;
  if (camera.near !== n) { camera.near = n; camera.updateProjectionMatrix(); }

  if (ctrl.view === 'first') {
    // his own eyes: the view is where his head is, looking the way the view faces
    const eyeY = p.y + (p.inWater ? EYE_SWIM : EYE);
    camera.position.set(p.x + fx * 0.1, eyeY, p.z + fz * 0.1);
    camera.lookAt(camera.position.x + fx * cp, eyeY - sp, camera.position.z + fz * cp);
    return;
  }
  // third person: behind and a little above him, looking at his chest; a wall or the ground between pulls the camera in
  const tx = p.x, ty = p.y + (p.inWater ? 0.7 : 1.3), tz = p.z;
  _u.set(-fx * cp, sp, -fz * cp);
  let d = ctrl.dist;
  for (let s = 0.4; s <= d; s += 0.4) {
    const qx = tx + _u.x * s, qy = ty + _u.y * s, qz = tz + _u.z * s;
    if (getHeight(qx, qz) + 0.45 > qy) { d = Math.max(DIST_MIN * 0.6, s - 0.4); break; }
  }
  _d.set(tx + _u.x * d, ty + _u.y * d, tz + _u.z * d);
  _d.y = Math.max(_d.y, getHeight(_d.x, _d.z) + 0.45);
  camera.position.lerp(_d, 1 - Math.exp(-14 * dt));
  camera.lookAt(tx, ty, tz);
}

