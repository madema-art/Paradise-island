import { isTyping } from './typing.js';
// Explorer camera: an orbit rig that glides over the terrain (WASD / Q-E / Z-X), plus a free-fly mode.
import * as THREE from 'three';
import { camera, renderer, U, pickables, creatures } from './core.js';
import { pollPad, rumble, BTN } from './gamepad.js';
import { getHeight, inCave } from './world.js';
import { clamp, lerp, angDiff } from './util.js';
import { walk, spawnNear } from './walk.js';

export const zones = { grotto: null };
export { walk };
export const cam = {
  mode: 'orbit', follow: null, releaseProgress: 0, tour: false, presets: [], onFollow: null, onMode: null, shake: 0, suspended: false,
  target: new THREE.Vector3(0, 12, 10), goto: null,
};

const dom = renderer.domElement;
const S = {
  yaw: 0.6, pitch: 0.5, dist: 300, yawG: 0.6, pitchG: 0.5, distG: 300,
  goal: new THREE.Vector3(0, 12, 10), yOff: 1, vel: new THREE.Vector3(), yawVel: 0, zoomVel: 0, auto: false, fovG: 55,
};
const fly = { yaw: 0, pitch: 0, speed: 35, vel: new THREE.Vector3() };
// while locked on to a creature the camera orbits it: yaw / pitch / dist are the camera's bearing, elevation and distance from the target
const F = { ready: false, yaw: 0, pitch: 0.35, dist: 10 };
const RELEASE_HOLD = 0.6;              // seconds the release gesture (hold B) must be held; Esc lets go at once
const keys = new Set();
let tween = null;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const aim = new THREE.Vector3(); let aimOn = false;       // the point a locked-on camera must be facing, re-checked after every later adjustment
const padKeys = new Set();           // keys the pad is holding down for first-person walking

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const groundY = (x, z) => Math.max(getHeight(x, z), 0);
const k1 = (rate, dt) => 1 - Math.exp(-rate * dt);
// a school is framed by its own shoal: the centroid of its fish and the shoal's size, both followed smoothly (so the camera never jumps)
const shoalCam = new WeakMap();
function shoalFrame(m, dt) {
  const fish = m.fish, n = fish.length;
  let x = 0, y = 0, z = 0;
  for (const f of fish) { x += f.x; y += f.y; z += f.z; }
  x /= n; y /= n; z /= n;
  let meanR = 0;
  for (const f of fish) meanR += Math.hypot(f.x - x, f.z - z);
  meanR /= n;
  const want = Math.max(meanR * 1.9, m.spread * 0.9);
  let c = shoalCam.get(m);
  if (!c) { c = { x, y, z, radius: want }; shoalCam.set(m, c); }
  const a = k1(1.6, dt), b = k1(0.9, dt);
  c.x += (x - c.x) * a; c.y += (y - c.y) * a; c.z += (z - c.z) * a;
  c.radius += (want - c.radius) * b;
  return c;
}

/* ---------------------------------------------------------------- helpers */
function rayGround(origin, dir, max = 3500) {
  let t = 0, prev = 0;
  for (let i = 0; i < 700 && t < max; i++) {
    const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
    if (y < groundY(x, z)) {
      let a = prev, b = t;
      for (let k = 0; k < 14; k++) {
        const m = (a + b) / 2;
        if (origin.y + dir.y * m < groundY(origin.x + dir.x * m, origin.z + dir.z * m)) b = m; else a = m;
      }
      return new THREE.Vector3(origin.x + dir.x * b, origin.y + dir.y * b, origin.z + dir.z * b);
    }
    prev = t;
    t += Math.max(0.8, t * 0.012);
  }
  return null;
}
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function cursorRay(cx, cy) {
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray;
}

function paramsFrom(pos, tgt) {
  const off = _v.set(pos[0] - tgt[0], pos[1] - tgt[1], pos[2] - tgt[2]);
  const d = Math.max(off.length(), 0.5);
  return { yaw: Math.atan2(off.x, off.z), pitch: Math.asin(clamp(off.y / d, -1, 1)), dist: d };
}

function apply() {
  const t = cam.target;
  const cp = Math.cos(S.pitch);
  camera.position.set(t.x + Math.sin(S.yaw) * cp * S.dist, t.y + Math.sin(S.pitch) * S.dist, t.z + Math.cos(S.yaw) * cp * S.dist);
  camera.lookAt(t);
}

/* ---------------------------------------------------------------- public api */
cam.goto = (pos, tgt) => {
  tween = null; cam.follow = null; if (cam.onFollow) cam.onFollow(null);
  if (cam.mode !== 'orbit') setMode('orbit', { quiet: true });
  const p = paramsFrom(pos, tgt);
  S.yaw = S.yawG = p.yaw; S.pitch = S.pitchG = p.pitch; S.dist = S.distG = p.dist;
  cam.target.set(...tgt); S.goal.copy(cam.target);
  S.yOff = tgt[1] - groundY(tgt[0], tgt[2]);
  apply();
};

export function flyTo(pos, tgt, dur = 3.2) {
  cam.follow = null;
  if (cam.onFollow) cam.onFollow(null);
  if (cam.mode !== 'orbit') setMode('orbit', { quiet: true });
  const p = paramsFrom(pos, tgt);
  tween = {
    t: 0, dur,
    y0: S.yaw, y1: S.yaw + angDiff(S.yaw, p.yaw), p0: S.pitch, p1: p.pitch, d0: S.dist, d1: p.dist,
    t0: cam.target.clone(), t1: new THREE.Vector3(...tgt),
    o0: S.yOff, o1: tgt[1] - groundY(tgt[0], tgt[2]),
  };
}
export function cancelTween() {
  if (!tween) return;
  tween = null; toFree();
}
// the free camera: the view as it stands, and the mouse and keys take over from there
function toFree() {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  fly.yaw = e.y; fly.pitch = e.x; fly.vel.set(0, 0, 0);
  cam.mode = 'fly';
  if (cam.onMode) cam.onMode('fly');
}

function flash() {
  const f = document.getElementById('fade');
  if (!f) return;
  f.style.transition = 'none'; f.style.opacity = '0.85'; void f.offsetWidth;
  f.style.transition = 'opacity .9s ease'; f.style.opacity = '0';
}
export function setMode(m, opts = {}) {
  if (m === cam.mode) return;
  tween = null;
  const prev = cam.mode;
  let leftWalk = null;
  if (prev === 'walk') leftWalk = walk.leave();
  if (m === 'walk') {
    // spawn under the current view
    let x, z, yaw;
    if (prev === 'fly') { x = camera.position.x; z = camera.position.z; yaw = fly.yaw; }
    else { x = cam.target.x; z = cam.target.z; yaw = S.yaw; }
    if (getHeight(x, z) < 0.6) { const q = spawnNear(x, z); x = q.x; z = q.z; }
    cam.follow = null; if (cam.onFollow) cam.onFollow(null);
    cam.mode = 'walk';
    walk.enter(x, z, yaw);
    S.auto = false;
    flash();
  } else if (m === 'fly') {
    cam.mode = 'fly';
    cam.follow = null; if (cam.onFollow) cam.onFollow(null);
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    fly.yaw = e.y; fly.pitch = e.x; fly.vel.set(0, 0, 0);
    if (leftWalk) flash();
  } else {
    cam.mode = 'orbit';
    if (leftWalk) {
      // step back behind the walker
      cam.target.set(leftWalk.x, leftWalk.y + 1.5, leftWalk.z); S.goal.copy(cam.target);
      S.yaw = S.yawG = leftWalk.yaw; S.pitch = S.pitchG = 0.45; S.dist = S.distG = 9; S.yOff = leftWalk.y + 1.5 - groundY(leftWalk.x, leftWalk.z);
      apply(); flash();
    } else {
      const fwd = _v.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const hit = rayGround(camera.position, fwd, 400);
      const tgt = hit || _v2.copy(camera.position).addScaledVector(fwd, 45);
      const p = paramsFrom([camera.position.x, camera.position.y, camera.position.z], [tgt.x, tgt.y, tgt.z]);
      S.yaw = S.yawG = p.yaw; S.pitch = S.pitchG = p.pitch; S.dist = S.distG = clamp(p.dist, 3, 600);
      cam.target.copy(tgt); S.goal.copy(tgt); S.yOff = tgt.y - groundY(tgt.x, tgt.z);
    }
  }
  if (cam.onMode) cam.onMode(cam.mode);
}

export function followCreature(c) {
  if (cam.mode === 'walk') setMode('fly', { quiet: true });
  tween = null;
  cam.follow = c; F.ready = false; cam.releaseProgress = 0;
  const p = c.focus ? c.focus(new THREE.Vector3()) : c.group.position.clone();
  const want = Math.max(5, (c.viewDist || 9) * 1.5);
  const cur = camera.position.distanceTo(p);
  if (cur > want * 4 || cur < 2) {
    // too far off, or inside it: glide to a viewing spot first; the follow carries on from there
    const dir = _v3.copy(camera.position).sub(p);
    dir.y = Math.max(dir.y, want * 0.4);
    dir.setLength(want);
    flyTo([p.x + dir.x, p.y + dir.y, p.z + dir.z], [p.x, p.y + 0.6, p.z], 2.4);
    cam.follow = c;
  }
  if (cam.onFollow) cam.onFollow(c);
}
export function release() {
  cam.follow = null; F.ready = false; cam.releaseProgress = 0;
  if (cam.onFollow) cam.onFollow(null);
}
let tourT = 0, tourI = 0;
export function setTour(on) { cam.tour = on; tourT = 0; if (!on) S.auto = false; }
export function setSpin(on) { S.auto = on; }
export function goPreset(i) {
  const p = cam.presets[i];
  if (!p) return;
  if (cam.mode === 'walk' && p.walk) { walk.teleport(p.walk.x, p.walk.z, Math.atan2(-(p.walk.fx - p.walk.x), -(p.walk.fz - p.walk.z))); flash(); return; }
  flyTo(p.pos, p.tgt, p.dur || 3.4);
}
// the lens: the wheel and Z / X narrow or widen the field of view (the View tab slider shows the same value); the camera does not move
const FOV_MIN = 12, FOV_MAX = 110;
function applyFov(f) {
  camera.fov = f; camera.updateProjectionMatrix();
  U.pxScale.value = (innerHeight * renderer.getPixelRatio()) / (2 * Math.tan((f * Math.PI) / 360));
  const el = document.getElementById('fov');
  if (el) el.value = f;
}
/** set the lens goal; the orbit camera eases to it */
export function setFov(f) {
  S.fovG = clamp(f, FOV_MIN, FOV_MAX);
  { const bar = document.getElementById('relbar'); if (bar) { const w = (cam.releaseProgress * 100).toFixed(0) + '%'; if (bar.dataset.w !== w) { bar.dataset.w = w; bar.style.width = w; } } }
  if (Math.abs(camera.fov - S.fovG) > 0.01) applyFov(S.fovG);
}
function zoomBy(amount) { S.fovG = clamp(S.fovG * Math.exp(amount), FOV_MIN, FOV_MAX); }

/* ---------------------------------------------------------------- choosing a target */
const focusOf = (c, out) => (c.focus ? c.focus(out) : c.group.getWorldPosition(out));
/** creatures within range of ref, nearest first (only ones that are on show) */
function nearby(ref, range = 260) {
  const out = [];
  for (const c of creatures) {
    if (!c.group || c.group.visible === false) continue;
    const d = ref.distanceTo(focusOf(c, new THREE.Vector3()));
    if (d < range) out.push({ c, d });
  }
  return out.sort((a, b) => a.d - b.d).map((o) => o.c);
}
/** lock on to whatever is nearest the middle of the view (or, failing that, the nearest creature) */
function lockOn() {
  const fwd = _v.set(0, 0, -1).applyQuaternion(camera.quaternion);
  let best = null, bs = -1e9, near = null, nd = 1e9;
  const q = new THREE.Vector3();
  for (const c of creatures) {
    if (!c.group || c.group.visible === false || c === cam.follow) continue;
    focusOf(c, q);
    const to = _v2.copy(q).sub(camera.position), d = to.length();
    if (d < 1 || d > 900) continue;
    const cos = to.dot(fwd) / d;
    if (d < nd) { nd = d; near = c; }
    const score = cos - d * 0.0003;
    if (cos > 0.93 && score > bs) { bs = score; best = c; }
  }
  const pick = best || near;
  if (pick) { followCreature(pick); rumble(0.25, 0.35, 70); }
}
/** step to the next (dir 1) or previous (dir -1) creature around the one we are on, or around the camera if none */
function cycleTarget(dir) {
  const ref = cam.follow ? focusOf(cam.follow, new THREE.Vector3()) : camera.position;
  const list = nearby(ref);
  if (!list.length) return;
  let i = list.indexOf(cam.follow);
  i = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
  followCreature(list[i]); rumble(0.2, 0.3, 60);
}
let presetI = -1;

/* ---------------------------------------------------------------- input */
const KEYMAP = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyZ', 'KeyX', 'KeyC', 'Space', 'KeyR', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
window.addEventListener('keydown', (e) => {
  if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!KEYMAP.includes(e.code) && !e.code.startsWith('Shift') && e.code !== 'ControlLeft') return;
  keys.add(e.code);
  if (KEYMAP.includes(e.code)) {
    e.preventDefault();
    cancelTween();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

const ptrs = new Map();
let pinch = null, drag = null, downAt = null, lastTap = 0;
dom.addEventListener('contextmenu', (e) => e.preventDefault());
dom.addEventListener('pointerdown', (e) => {
  dom.focus();
  cancelTween();
  if (cam.mode === 'walk' && !walk.locked) walk.requestLock();
  try { dom.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
  drag = { pan: e.button === 2 || e.button === 1 || e.shiftKey };
});
dom.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    zoomBy(Math.log(pinch.d / Math.max(d, 1)));   // spreading the fingers zooms in, like the wheel
    panScreen(mx - pinch.mx, my - pinch.my);
    pinch = { d, mx, my };
    return;
  }
  if (cam.mode === 'walk') {
    if (!walk.locked) walk.look(dx, dy);
    return;
  }
  if (cam.mode === 'fly') {
    if (cam.follow) { F.yaw -= dx * 0.0045; F.pitch = clamp(F.pitch + dy * 0.0045, -1.2, 1.45); return; }       // locked on: drag swings round the target
    fly.yaw -= dx * 0.0032; fly.pitch = clamp(fly.pitch - dy * 0.0032, -1.5, 1.5);
  }
});
function endPtr(e) {
  const hadTwo = ptrs.size === 2;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (!downAt || hadTwo) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y), dt = performance.now() - downAt.t;
  downAt = null;
  if (cam.mode === 'walk' || moved > 5 || dt > 450 || e.button === 2) return;
  const r = cursorRay(e.clientX, e.clientY);
  r.far = 600;
  const hits = r.intersectObjects(pickables, false);
  const now = performance.now();
  if (hits.length) {
    const c = hits[0].object.userData.creature;
    if (c) followCreature(c);
    lastTap = 0;
    return;
  }
  if (now - lastTap < 350) {
    // double-click / double-tap: glide to that spot
    const rr = cursorRay(e.clientX, e.clientY);
    const hit = rayGround(rr.ray.origin, rr.ray.direction);
    if (hit) {
      // glide to a spot a little behind that point, looking at it
      const f = _v.set(0, 0, -1).applyQuaternion(camera.quaternion); f.y = 0; f.normalize();
      flyTo([hit.x - f.x * 30, hit.y + 14, hit.z - f.z * 30], [hit.x, hit.y + 1, hit.z], 1.4);
    }
    lastTap = 0;
  } else {
    lastTap = now;
    // a single click on the world (not a creature, not a double-click): inspect what is there
    if (cam.onWorldClick) cam.onWorldClick(r);
  }
}
dom.addEventListener('pointerup', endPtr);
dom.addEventListener('pointercancel', endPtr);

function panScreen(dx, dy) {
  // grab-the-world panning on the ground plane: right = (cos,-sin), forward = (-sin,-cos)
  const k = S.dist * 0.0017;
  const sy = Math.sin(S.yaw), cy = Math.cos(S.yaw);
  S.goal.x += (-cy * dx - sy * dy) * k;
  S.goal.z += (sy * dx - cy * dy) * k;
}

let wheelAcc = 0, wheelT = 0;
window.addEventListener('wheel', (e) => {
  // the wheel works anywhere over the scene and the cards; only the side panel keeps its own scrolling
  if (e.target && e.target.closest && e.target.closest('#side')) return;
  e.preventDefault();
  cancelTween();
  const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  const now = performance.now();
  if (now - wheelT > 450) wheelAcc = 0;
  wheelT = now;
  if (cam.mode === 'walk') {
    // scrolling back leaves first person
    if (dy > 0) { wheelAcc += dy; if (wheelAcc > 100) { wheelAcc = 0; setMode('orbit'); } } else wheelAcc = 0;
    return;
  }
  // the wheel zooms the lens: scrolling in narrows the field of view, scrolling out widens it. The camera stays where it is.
  zoomBy(clamp(dy, -400, 400) * 0.0016);
}, { passive: false });

/* ---------------------------------------------------------------- per-frame */
export function updateCamera(dt) {
  if (cam.suspended) return;           // survival mode drives the camera itself
  // the near plane follows the orbit distance: a near plane of 0.3 m with a far plane of 7 km makes palm fronds z-fight when zoomed out.
  // First person and free-fly keep the close near plane.
  if (cam.mode === 'orbit' && !tween) toFree();   // orbit is only for the glide between views
  const alt = camera.position.y - getHeight(camera.position.x, camera.position.z);
  const near = cam.mode === 'walk' ? 0.3 : clamp(alt * 0.006, 0.3, 3);
  if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
  const pad = pollPad(dt);
  const shift = keys.has('ShiftLeft') || keys.has('ShiftRight') || pad.held[BTN.A];       // pad: A held is fast
  const slow = keys.has('ControlLeft') || pad.held[BTN.X];                                // pad: X held is precise
  const dn = (a, b) => (keys.has(a) || (b && keys.has(b)) ? 1 : 0);
  const fwdIn = clamp(dn('KeyW', 'ArrowUp') - dn('KeyS', 'ArrowDown') - pad.ly, -1, 1);
  const strIn = clamp(dn('KeyD') - dn('KeyA') + pad.lx, -1, 1);
  const rotIn = dn('KeyQ', 'ArrowLeft') - dn('KeyE', 'ArrowRight'); // Q turns the view left, E right
  const upIn = clamp(dn('KeyR') - dn('KeyF') + pad.rt - pad.lt, -1, 1);   // R rises, F sinks (pad: right trigger rises, left sinks): the only controls that change height
  // the look sensitivity eases off when the lens is zoomed in or the precision button is held, so a long lens stays steady
  const lookK = clamp(camera.fov / 55, 0.3, 1.5) * (slow ? 0.35 : 1);
  const padLook = pad.rx !== 0 || pad.ry !== 0;
  if (pad.connected) {
    // buttons that work everywhere (not in survival mode, which does not run this function)
    if (pad.pressed[BTN.Y]) lockOn();
    if (pad.pressed[BTN.RB]) cycleTarget(1);
    if (pad.pressed[BTN.LB]) cycleTarget(-1);
    if (pad.pressed[BTN.RIGHT] && cam.presets.length) { presetI = (presetI + 1) % cam.presets.length; goPreset(presetI); }
    if (pad.pressed[BTN.LEFT] && cam.presets.length) { presetI = (presetI - 1 + cam.presets.length) % cam.presets.length; goPreset(presetI); }
    if (pad.pressed[BTN.R3]) { S.fovG = 55; }
    if (pad.pressed[BTN.START]) document.body.classList.toggle('hidden-ui');
    if (pad.pressed[BTN.BACK]) setMode(cam.mode === 'walk' ? 'fly' : 'walk');
    // the lens: d-pad up zooms in, down zooms out
    const lens = (pad.held[BTN.UP] ? 1 : 0) - (pad.held[BTN.DOWN] ? 1 : 0);
    if (lens) zoomBy(-lens * 0.9 * dt);
    if (padLook || pad.lx || pad.ly || pad.lt || pad.rt || lens) cancelTween();
  }
  // first person: the pad drives the walk through the same keys the keyboard uses, and the right stick looks
  if (cam.mode === 'walk') {
    const set = (code, on) => { if (on) keys.add(code); else if (padKeys.has(code)) keys.delete(code); if (on) padKeys.add(code); else padKeys.delete(code); };
    set('KeyW', pad.ly < -0.35); set('KeyS', pad.ly > 0.35); set('KeyA', pad.lx < -0.35); set('KeyD', pad.lx > 0.35);
    set('Space', pad.held[BTN.A]); set('KeyC', pad.held[BTN.B]); set('KeyF', pad.held[BTN.X]); set('ShiftLeft', pad.held[BTN.L3] || pad.rt > 0.5);
    if (padLook) walk.look(pad.rx * dt * 700 * lookK, pad.ry * dt * 700 * lookK);
  } else if (padKeys.size) { for (const k of padKeys) keys.delete(k); padKeys.clear(); }

  if (tween) {
    tween.t += dt;
    const s = ease(clamp(tween.t / tween.dur, 0, 1));
    S.yaw = lerp(tween.y0, tween.y1, s); S.pitch = lerp(tween.p0, tween.p1, s);
    S.dist = lerp(tween.d0, tween.d1, s) * (1 + Math.sin(s * Math.PI) * 0.1);
    cam.target.lerpVectors(tween.t0, tween.t1, s);
    S.yOff = lerp(tween.o0, tween.o1, s);
    cam.target.y = groundY(cam.target.x, cam.target.z) + S.yOff;
    S.yawG = S.yaw; S.pitchG = S.pitch; S.distG = S.dist; S.goal.copy(cam.target);
    apply();
    if (tween.t >= tween.dur) { tween = null; toFree(); if (cam.tour) { S.auto = true; tourT = 0; } }
  } else if (cam.mode === 'walk') {
    walk.update(dt, keys);
    const wf = _v.set(0, 0, -1).applyQuaternion(camera.quaternion);
    cam.target.copy(camera.position).addScaledVector(wf, 30);
  } else {
    // free camera: mouse look, WASD, Q/E turn, R/F rise/sink. A followed creature stays locked in the middle of the view: the mouse, the keys and
    // the right stick swing the camera round it, and it only lets go on a deliberate act (Esc, the Release button, or holding B on the pad).
    if (cam.follow) {
      const f = cam.follow, school = !!(f.sim && f.sim.spec && Array.isArray(f.sim.fish) && f.sim.fish.length);
      const shoal = school ? shoalFrame(f.sim, dt) : null;
      const p = shoal ? _v2.set(shoal.x, shoal.y, shoal.z) : focusOf(f, _v2);
      const vd = shoal ? shoal.radius : f.viewDist || 9;
      if (!F.ready) {                                                                // take the bearing we have as the starting orbit
        F.zoom = 1;
        const o = _v3.copy(camera.position).sub(p), d = Math.max(o.length(), 0.5);
        F.dist = clamp(d, Math.max(1.2, vd * 0.3), 140); F.yaw = Math.atan2(o.x, o.z); F.pitch = Math.asin(clamp(o.y / d, -1, 1)); F.ready = true;
        if (F.pitch < 0.1) F.pitch = 0.3;
      }
      const fast = shift ? 2.2 : slow ? 0.35 : 1;
      F.yaw += (-pad.rx * 2.4 * lookK * (shift ? 1.5 : 1) + pad.lx * 0.8 * fast + (strIn - pad.lx - rotIn) * 1.2) * dt;
      F.pitch = clamp(F.pitch + (pad.ry * 1.7 * lookK + upIn * 0.8 * (pad.rt || pad.lt ? 0 : 1)) * dt, -1.2, 1.45);
      // dolly: W / S, the left stick's up and down, and the triggers (right closer, left farther)
      const dolly = -fwdIn * 0.9 * fast + (pad.lt - pad.rt) * 1.3;
      if (shoal) {
        // a school: the distance eases to frame the shoal, and the dolly sets how close to it the view sits
        F.zoom = clamp((F.zoom ?? 1) * Math.exp(dolly * dt), 0.35, 3);
        F.dist += (clamp(vd * 2.0 + 3, 5, 90) * F.zoom - F.dist) * k1(1.2, dt);
      } else F.dist = clamp(F.dist * Math.exp(dolly * dt), Math.max(1.2, vd * 0.3), 140);
      const cp = Math.cos(F.pitch), ty = p.y + Math.min(0.5, vd * 0.08);
      _v.set(p.x + Math.sin(F.yaw) * cp * F.dist, ty + Math.sin(F.pitch) * F.dist, p.z + Math.cos(F.yaw) * cp * F.dist);
      if (!inCave(_v.x, _v.y, _v.z)) _v.y = Math.max(_v.y, getHeight(_v.x, _v.z) + 1.2);       // the orbit never dips into the ground
      // a school is watched from under the surface, above the sand
      if (shoal) _v.y = clamp(_v.y, getHeight(_v.x, _v.z) + 0.4, -0.45);
      camera.position.lerp(_v, k1(shoal ? 4 : 14, dt));
      aim.set(p.x, ty, p.z); aimOn = true;
      camera.lookAt(aim);                                                     // locked on: the target is always dead centre
      const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      fly.yaw = e.y; fly.pitch = e.x; fly.vel.set(0, 0, 0);
      cam.target.copy(p);
      // the release gesture: hold B
      if (pad.held[BTN.B]) {
        cam.releaseProgress = Math.min(1, cam.releaseProgress + dt / RELEASE_HOLD);
        if (cam.releaseProgress >= 1) { release(); rumble(0.5, 0.2, 140); }
      } else cam.releaseProgress = Math.max(0, cam.releaseProgress - dt * 3);
    } else {
      const boost = shift ? 3.2 : slow ? 0.3 : 1;
      fly.yaw += rotIn * 1.4 * dt - pad.rx * 2.4 * lookK * (shift ? 1.5 : 1) * dt;
      fly.pitch = clamp(fly.pitch - pad.ry * 1.8 * lookK * dt, -1.5, 1.5);
      if (S.auto) fly.yaw -= dt * 0.1;
      camera.rotation.set(fly.pitch, fly.yaw, 0, 'YXZ');
      // W / S and A / D move along the level, whatever the view's pitch; R / F are the only keys that change height
      const fwd = _v.set(-Math.sin(fly.yaw), 0, -Math.cos(fly.yaw));
      const right = _v2.set(Math.cos(fly.yaw), 0, -Math.sin(fly.yaw));
      // speed grows with height: careful near the ground, quick over the island from up high
      const alt2 = Math.max(camera.position.y - getHeight(camera.position.x, camera.position.z), 6);
      const speed = clamp(alt2 * 0.6, 6, 140) * boost;
      const want = _v3.set(0, upIn, 0).addScaledVector(fwd, fwdIn).addScaledVector(right, strIn);
      if (want.lengthSq() > 1) want.normalize();
      want.multiplyScalar(speed);
      fly.vel.lerp(want, k1(7, dt));
      camera.position.addScaledVector(fly.vel, dt);
      cam.target.copy(camera.position).addScaledVector(_v.set(0, 0, -1).applyQuaternion(camera.quaternion), 40);
    }
  }

  if (cam.tour && !tween) {
    tourT += dt;
    if (tourT > 13 && cam.presets.length) {
      tourI = (tourI + 1) % cam.presets.length;
      const p = cam.presets[tourI];
      S.auto = false;
      flyTo(p.pos, p.tgt, 6);
      tourT = 0;
    }
  }

  // stay out of the ground (except inside the grotto)
  const p = camera.position;
  const z = zones.grotto;
  const inGrotto = (z && p.distanceTo(z.c) < z.r) || inCave(p.x, p.y, p.z);          // the whole cave, not just a sphere at the door
  const gh = getHeight(p.x, p.z);
  if (!inGrotto && p.y < gh + 0.9) p.y += (gh + 0.9 - p.y) * k1(14, dt);
  if (p.y > 4000) p.y = 4000;
  if (aimOn && cam.follow && cam.mode === 'fly' && !tween) camera.lookAt(aim);            // locked on means locked on, whatever nudged the camera
  aimOn = false;

  if (cam.shake > 0.001) {
    camera.rotation.x += (Math.random() - 0.5) * cam.shake * 0.01;
    camera.rotation.y += (Math.random() - 0.5) * cam.shake * 0.01;
  }
  if (Math.abs(camera.fov - S.fovG) > 0.01) applyFov(camera.fov + (S.fovG - camera.fov) * k1(16, dt));   // the lens eases to the zoom the wheel asked for
  U.under.value += ((p.y < 0.1 ? 1 : 0) - U.under.value) * Math.min(1, dt * 10);
}
