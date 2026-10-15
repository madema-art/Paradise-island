// The castaway: a blond, sun-tanned man living a simple island life —
// hiking (and running) all over the island, fishing and spear-fishing anywhere there is water, swimming,
// drinking at fresh water, cooking and eating what he catches by the campfire, and sleeping in his lean-to.
// He keeps fed and rested while pursuing comfort and accomplishment. He runs from
// boars, chases monkeys for fun, and when he is happy he dances, whistles and sings.
import * as THREE from 'three';
import { createCoconut, setCoconutState } from './coconut.js';
import { scene, env, camera, updaters, creatures, events } from './core.js';
import { makeHuman, blob, seg, cone, at } from './creatures.js';
import { fauna, register, actors } from './fauna_common.js';
import { getHeight, getSlope, walkHeight, resolveColliders, perchesNear, lavaDist, riverSurface, riverDist, river, falls, TEMPLE, FAIRY, SPRING, COVE, VOL } from './world.js';
import { poolLevel, spawnNear } from './walk.js';
import { wx } from './weather.js';
import { fx, makePaddle } from './props.js';
import { wake as waterWake, waterY } from './ripples.js';
import { rr, rnd, pick, clamp, lerp, damp, TAU } from './util.js';
import { makeMind } from './castaway_mind.js';
import { createComfortLife } from './comfort_life.js';
import { eco } from './ecology.js';
import { makeRatModel } from './rat_model.js';
import { buildNewBody, coverage, clipMeta } from './castaway_new.js';
import { createLife } from './castaway_life.js';
import { findProjectPath } from './project_path.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const turnTo = (cur, target, max) => cur + clamp(wrap(target - cur), -max, max);
const smooth = (t) => t * t * (3 - 2 * t);
const FISH_NAMES = ['parrotfish', 'red snapper', 'mackerel', 'grouper', 'sea bream', 'yellowfin tuna'];

const STAND = { py: 0.9, rx: 0, spX: 0, spY: 0, nkX: 0, hdX: 0, hdY: 0, aPs: 0.05, aPe: -0.2, aPz: 0.08, aNs: 0.05, aNe: -0.2, aNz: -0.08, lPh: 0, lPk: 0, lNh: 0, lNk: 0, lPz: 0.03, lNz: -0.03 };

/** survival mode borrows the island: while paused the AI castaway stands aside */

export const castawayAI = { paused: false };



export function buildCastaway() {
  const me = Object.assign({}, makeHuman());
  me.group = new THREE.Group();
  me.group.add(me.root);
  fauna.add(me.group);
  const hut = falls.hut, camp = falls.camp;

  /* ================================================================ items */
  // walking staff: a gnarled driftwood pole with cord lashing and a bone fish-hook dangling on a line
  const staff = new THREE.Group(); staff.position.set(0, 0.17, 0.02); staff.visible = false; me.armR.hand.add(staff);
  {
    const pole = seg(0.015, 0.023, 1.58, '#6b4a2c', 7); staff.add(pole);
    for (const [yy, r, xx] of [[-0.42, 0.028, 0.005], [0.08, 0.025, -0.004], [0.46, 0.029, 0.004], [0.7, 0.024, -0.003]]) at(blob(r, '#5a3d22', 1, 0.7, 1, 7), xx, yy, 0, staff);
    const cord = new THREE.MeshStandardMaterial({ color: '#d9c48e', roughness: 1 });
    for (let i = 0; i < 8; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0205 - i * 0.0004, 0.0046, 5, 10), cord); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.6 + i * 0.0155, 0); staff.add(ring); }
    const line = seg(0.0016, 0.0016, 0.55, '#ece6d0', 4); line.position.set(0.03, 0.34, 0.012); staff.add(line);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0032, 5, 12, Math.PI * 1.45), new THREE.MeshStandardMaterial({ color: '#ddd5bd', roughness: 0.5 }));
    hook.position.set(0.012, 0.045, 0.012); hook.rotation.set(0, 0, -0.6); staff.add(hook);
    staff.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  const rod = new THREE.Group(); rod.visible = false; me.armR.hand.add(rod); rod.rotation.x = -0.3;
  const rodMesh = seg(0.008, 0.02, 2.7, '#2f3a2c', 6); rodMesh.position.y = -1.3; rod.add(rodMesh);
  const reel = seg(0.03, 0.03, 0.05, '#555', 8); reel.rotation.z = Math.PI / 2; reel.position.set(0, -0.15, 0.05); rod.add(reel);
  const rodTip = new THREE.Object3D(); rodTip.position.y = -2.65; rod.add(rodTip);
  const spear = new THREE.Group(); spear.visible = false; me.armR.hand.add(spear); spear.rotation.x = 0.85;
  const spearShaft = seg(0.014, 0.019, 2.3, '#7a5a34', 6); spearShaft.position.y = -1.0; spear.add(spearShaft);
  const spearHead = cone(0.03, 0.2, '#cfd3d6', 6); spearHead.position.y = -2.25; spearHead.rotation.x = Math.PI; spear.add(spearHead);
  const spearTip = new THREE.Object3D(); spearTip.position.y = -2.35; spear.add(spearTip);
  const cn = falls.canoe || null;
  const paddle = makePaddle(); paddle.visible = false; paddle.position.set(0, -0.04, 0.03); me.armR.hand.add(paddle);
  const paddleTip = new THREE.Object3D(); paddleTip.position.y = -1.2; paddle.add(paddleTip);
  const mkFish = (raw) => {
    const g = new THREE.Group();
    at(blob(0.09, raw ? '#a9bcc6' : '#8a5a30', 1, 0.55, 2.6, 14), 0, 0, 0.0, g);
    at(blob(0.05, raw ? '#dde8ee' : '#c9955a', 0.7, 0.4, 1.8, 8), 0, -0.04, 0.02, g);
    at(cone(0.07, 0.16, raw ? '#8aa0ad' : '#6e4524', 6), 0, 0, -0.26, g).rotation.x = -Math.PI / 2;
    for (const s of [-1, 1]) at(blob(0.012, '#101010', 1, 1, 1, 6), s * 0.055, 0.025, 0.15, g).userData.noTint = true;
    g.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
    return g;
  };
  const fishHeld = mkFish(true); fishHeld.visible = false; fishHeld.position.set(0, -0.12, 0.12); me.armL.hand.add(fishHeld);
  const fishSpeared = mkFish(true); fishSpeared.visible = false; fishSpeared.position.set(0, -2.15, 0); fishSpeared.rotation.x = -Math.PI / 2; spear.add(fishSpeared);
  const stick = new THREE.Group(); stick.visible = false; me.armR.hand.add(stick);
  at(seg(0.01, 0.012, 0.75, '#6b4a2c', 5), 0, -0.25, 0.0, stick);
  const stickFish = mkFish(false); stickFish.position.set(0, -0.42, 0.0); stickFish.rotation.x = Math.PI / 2; stickFish.scale.setScalar(1.15); stick.add(stickFish);
  // a rat from the same Blender model the wild ones use, with its own materials so cooking can brown it
  const mkRat = () => {
    const g = new THREE.Group(), m = makeRatModel();
    if (m) { m.root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.castShadow = false; } }); g.add(m.root); g.scale.setScalar(0.95); }
    return g;
  };
  const stickRat = mkRat(); stickRat.visible = false; stickRat.position.set(0, -0.42, 0.0); stickRat.rotation.x = Math.PI / 2; stick.add(stickRat);
  const coco = createCoconut(); coco.visible = false; coco.position.set(0, -.1, .05); me.armL.hand.add(coco);
  const bobber = new THREE.Group(); bobber.visible = false; scene.add(bobber);
  at(blob(0.055, '#f4f1ea', 1, 1, 1, 10), 0, -0.02, 0, bobber); at(blob(0.05, '#e03a2a', 1, 0.7, 1, 10), 0, 0.04, 0, bobber);
  const linePts = Array.from({ length: 10 }, () => V());
  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf0f4f4, transparent: true, opacity: 0.75 }));
  line.frustumCulled = false; line.visible = false; scene.add(line);
  const tint = (g, k) => {
    const cooked = new THREE.Color('#9a6234');
    g.traverse((o) => { if (o.isMesh && !o.userData.noTint) { if (!o.userData.c0) o.userData.c0 = o.material.color.clone(); o.material.color.copy(o.userData.c0).lerp(cooked, k * 0.75); } });
  };

  /* ================================================================ the new body: Blender castaway, driven by the existing logic */
  // The old procedural rig stays as an invisible driver for now (its pose still runs, so everything that reads hands and head keeps working).
  // The new character is shown instead, plays clips chosen from what the logic is doing (driveNew, below), and carries the props on its own bones.
  const nb = buildNewBody();
  if (nb) {
    // development diagnostics, always cheap: window.__castaway.coverage.report() and window.__castaway.force('clip_name', seconds)
    window.__castaway = { coverage, body: nb, force: (name, secs = 4) => { nb.forced = { name, until: performance.now() + secs * 1000 }; } };
    me.group.add(nb.root);
    me.root.visible = false;
    const B = nb.bones, tip = nb.staff.getObjectByName('attach_tip');
    const tipAt = tip ? tip.position : V(0, 2.1, 0);
    nb.staff.add(rodTip); rodTip.position.copy(tipAt);
    nb.staff.add(spearTip); spearTip.position.copy(tipAt);
    nb.staff.add(fishSpeared); fishSpeared.position.set(0, tipAt.y - 0.12, 0); fishSpeared.rotation.set(0, 0, 0);
    if (B.attach_hand_L) { B.attach_hand_L.add(coco); coco.position.set(0, 0, 0); coco.rotation.set(0, 0, 0); B.attach_hand_L.add(fishHeld); fishHeld.position.set(0, -0.05, 0.1); }
    if (B.attach_hand_R) { B.attach_hand_R.add(stick); stick.position.set(0, 0, 0); stick.rotation.set(0, 0, 0); }
    if (B.prop_aux) { B.prop_aux.add(paddle); paddle.position.set(0, 1.2, 0); paddle.rotation.set(0, 0, 0); }
    // the props are shown, hidden and tinted by this code, so the performance passes that merge or instance a creature's rigid parts must leave them alone
    for (const prop of [coco, fishHeld, fishSpeared, stick, paddle, staff, rod, spear]) prop.traverse((o) => { if (o.isMesh) o.userData.noMerge = true; });
  }

  /* ================================================================ campfire kitchen: log seat + spit */
  const ux = hut.mat.x - camp.x, uz = hut.mat.z - camp.z, ul = Math.hypot(ux, uz) || 1;
  const Uv = { x: ux / ul, z: uz / ul }, Pp = { x: -Uv.z, z: Uv.x };
  const logPos = { x: camp.x + Uv.x * 1.45, z: camp.z + Uv.z * 1.45 };
  const logY = getHeight(logPos.x, logPos.z);
  const kitchen = new THREE.Group(); scene.add(kitchen);
  const axisYaw = Math.atan2(Pp.x, Pp.z);
  const log = seg(0.17, 0.17, 1.5, '#5a3d24', 9); log.rotation.set(0, axisYaw, Math.PI / 2, 'YXZ'); log.position.set(logPos.x, logY + 0.17, logPos.z); log.castShadow = true; kitchen.add(log);
  const spitC = { x: camp.x + Uv.x * 0.4, z: camp.z + Uv.z * 0.4 };
  const spitY = getHeight(spitC.x, spitC.z);
  for (const s of [-1, 1]) { const post = seg(0.03, 0.035, 0.95, '#5a3d24', 6); post.position.set(spitC.x + Pp.x * 0.75 * s, spitY + 0.47, spitC.z + Pp.z * 0.75 * s); kitchen.add(post); }
  const spitRod = seg(0.015, 0.015, 1.6, '#6b4a2c', 6); spitRod.rotation.set(0, axisYaw, Math.PI / 2, 'YXZ'); spitRod.position.set(spitC.x, spitY + 0.88, spitC.z); kitchen.add(spitRod);
  const spitFish = [];
  for (let i = 0; i < 3; i++) {
    const f = mkFish(true); f.visible = false;
    f.position.set(spitC.x + Pp.x * (i - 1) * 0.42, spitY + 0.8, spitC.z + Pp.z * (i - 1) * 0.42);
    f.rotation.y = axisYaw + Math.PI / 2;
    kitchen.add(f); spitFish.push(f);
  }
  const spitRat = spitFish.map((f) => { const r = mkRat(); r.visible = false; r.position.copy(f.position).add(V(0, -0.12, 0)); r.rotation.y = axisYaw + Math.PI / 2; kitchen.add(r); return r; });

  /* ================================================================ places to fish */

  function waterAt(px, pz) {            // surface height of whatever water is at (px,pz)
    const pl = poolLevel(px, pz);
    if (pl > 0.5) return pl;
    const rs = riverSurface(px, pz);
    if (rs != null) return rs;
    return getHeight(px, pz) < 0.1 ? 0 : null;
  }
  const dirName = (px, pz) => {
    const a = Math.atan2(pz - 5, px), n = Math.round(((a + TAU) % TAU) / (Math.PI / 4)) % 8;
    return ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][n];
  };
  const fishSpots = [];
  const addCoast = (S, dx, dz, k) => {      // S = dry beach point, (dx,dz) = unit vector toward the water
    const h = getHeight(S.x, S.z);
    if (h < 0.5 || h > 2.6 || getSlope(S.x, S.z) > 0.4) return;
    if (getHeight(S.x + dx * 10, S.z + dz * 10) > -0.8) return;
    if (Math.hypot(S.x - VOL.x, S.z - VOL.z) < 60 || lavaDist(S.x, S.z) < 20) return;
    const face = Math.atan2(dx, dz);
    if (k % 2 === 0) fishSpots.push({ method: 'bank', stand: S, face, target: { x: S.x + dx * 9, z: S.z + dz * 9 }, name: `the ${dirName(S.x, S.z)} beach` });
    else {
      for (let r = 0; r < 18; r += 0.5) {
        const px = S.x + dx * r, pz = S.z + dz * r, hh = getHeight(px, pz);
        if (hh < -0.55 && hh > -1.0) { fishSpots.push({ method: 'spear', stand: { x: px, z: pz }, face, target: { x: px + dx * 1.8, z: pz + dz * 1.8 }, name: `the ${dirName(S.x, S.z)} shallows` }); break; }
      }
    }
  };
  for (let k = 0; k < 40; k++) {              // all round the outer coast
    const a = (k / 40) * TAU + rr(-0.04, 0.04), dx = Math.cos(a), dz = Math.sin(a);
    for (let r = 215; r > 20; r -= 1) {
      const px = dx * r, pz = dz * r + 5;
      if (getHeight(px, pz) > 1.0) { addCoast({ x: px, z: pz }, dx, dz, k); break; }
    }
  }
  for (let k = 0; k < 26; k++) {              // and around the lagoon inside Pearl Cove
    const a = Math.PI + (k / 25) * Math.PI + rr(-0.04, 0.04), dx = Math.cos(a), dz = Math.sin(a);    // north half = toward land
    for (let r = 4; r < 70; r += 0.7) {
      const px = COVE.x + dx * r, pz = COVE.z + dz * r;
      if (getHeight(px, pz) > 1.0) { addCoast({ x: px, z: pz }, -dx, -dz, k + 1); break; }
    }
  }
  {                                      // the waterfall pool and the streams
    const Pl = falls.pool, n = falls.n;
    const s1 = { x: Pl.x + n.x * (Pl.r + 1.4), z: Pl.z + n.z * (Pl.r + 1.4) };
    fishSpots.push({ method: 'bank', stand: s1, face: Math.atan2(Pl.x - s1.x, Pl.z - s1.z), target: { x: Pl.x, z: Pl.z }, name: 'the waterfall pool' });
    const s2 = { x: Pl.x + n.z * (Pl.r + 1.2), z: Pl.z - n.x * (Pl.r + 1.2) };
    fishSpots.push({ method: 'bank', stand: s2, face: Math.atan2(Pl.x - s2.x, Pl.z - s2.z), target: { x: Pl.x, z: Pl.z }, name: 'the waterfall pool' });
    for (const q of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.88, 0.94]) {
      const pts = river.B.pts, i = Math.floor(pts.length * q), p0 = pts[i], p1 = pts[Math.min(i + 3, pts.length - 1)];
      const tx = p1.x - p0.x, tz = p1.z - p0.z, tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
      for (const sg of [1, -1]) {
        const w = river.B.w[i] * 0.5 + 2.1, s = { x: p0.x + nx * w * sg, z: p0.z + nz * w * sg };
        if (getHeight(s.x, s.z) > 1.0 && riverDist(s.x, s.z) > 1.6 && getSlope(s.x, s.z) < 0.3) { fishSpots.push({ method: 'bank', stand: s, face: Math.atan2(p0.x - s.x, p0.z - s.z), target: { x: p0.x, z: p0.z }, name: 'the river' }); break; }
      }
    }
  }
  {                                      // the still, shallow water by the reef off the north-west shore: a good place to wade and spear
    let sp = null;
    for (let r = 0; r < 45 && !sp; r += 1.5) for (let k = 0; k < 24 && !sp; k++) {
      const a = (k / 24) * TAU, px = -75 + Math.cos(a) * r, pz = -140 + Math.sin(a) * r, hh = getHeight(px, pz);
      if (hh < -0.55 && hh > -1.0) sp = { x: px, z: pz };
    }
    if (sp) {
      let face = 0, low = 1e9;
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, hh = getHeight(sp.x + Math.cos(a) * 6, sp.z + Math.sin(a) * 6); if (hh < low) { low = hh; face = Math.atan2(Math.cos(a), Math.sin(a)); } }
      fishSpots.push({ method: 'spear', stand: sp, face, target: { x: sp.x + Math.sin(face) * 1.8, z: sp.z + Math.cos(face) * 1.8 }, name: 'the reef lagoon' });
    }
  }
  const fishable = fishSpots.filter((s) => waterAt(s.target.x, s.target.z) != null);
  // fresh water he can drink from: the waterfall pool and the river (sea water is not drinkable)
  const freshSpots = fishable.filter((s) => s.name === 'the waterfall pool' || s.name === 'the river');
  let lastSpot = null;

  /* ---- hiking destinations spread over the whole island ---- */
  const poiNamed = [
    { x: FAIRY.x + 6, z: FAIRY.z + 7, name: 'the glimmer ring' }, { x: falls.pool.x + falls.n.x * 9, z: falls.pool.z + falls.n.z * 9, name: 'Veil Falls' },
    { x: TEMPLE.x + 2, z: TEMPLE.z + 19, name: 'the temple steps' }, { x: SPRING.x + 8, z: SPRING.z + 9, name: 'the hot spring' },
    { x: COVE.x + 30, z: COVE.z - 18, name: 'Pearl Cove' }, { x: VOL.x - 44, z: VOL.z + 56, name: 'the volcano’s foothills' },
    { x: -148, z: -22, name: 'the west cascade' }, { x: -62, z: -124, name: 'the reef lagoon' }, { x: -20, z: 75, name: 'the river meadow' }, { x: 30, z: 50, name: 'the jungle clearing' },
  ];
  const pois = poiNamed.filter((p) => getHeight(p.x, p.z) > 0.8);
  for (let k = 0; k < 80 && pois.length < 18; k++) {
    const px = rr(-190, 190), pz = rr(-150, 150), h = getHeight(px, pz);
    if (h > 1.4 && h < 30 && getSlope(px, pz) < 0.25 && lavaDist(px, pz) > 30 && Math.hypot(px - VOL.x, pz - VOL.z) > 50 && poiNamed.every((p) => Math.hypot(p.x - px, p.z - pz) > 25)) pois.push({ x: px, z: pz, name: 'a quiet corner of the island' });
  }

  /* ================================================================ state */
  const C = { ...STAND }, P = { ...STAND };
  let x = 0, z = 0, y = 0, heading = 0, act = 'none', phase = 'init', sub = '', pt = 0, ph = 0, swPh = 0, stuck = 0, lastOff = 0;
  const wkSelf = {};
  let inWater = false, snap = false, hurry = false, speedNow = 0, snoreT = 0, waveT = 0, route = [], wpi = 0, pauseKind = 'look';
  let noProg = 0, spot = null, sessionT = 0, waitT = 8, meal = 'dinner', sleepWake = false, started = false;
  const caught = [];
  let runFlag = false, vocal = null, vocalCd = rr(6, 12), vHdX = 0, vHdY = 0, vSpY = 0, noteT = 0;
  const bob = { pos: V(), flying: 0, from: V(), to: V(), biteT: 0, hit: false };
  const info = { tag: null };
  const _hw = V(), _tip = V(), _hand = V();
  let desc = '';
  // his mind: needs, mood, memory and what he decides to do (see castaway_mind.js)
  const mind = makeMind();
  const life = createComfortLife(camp, hut, mind);
  castawayAI.life = life;
  let lastHours = env.hours;

  register({
    id: 'castaway', name: 'The Castaway', cat: 'People', group: me.group, viewDist: 5.5, pickR: 1.2, pickY: 0.9, sim: mind,
    get desc() { return desc; },
    focus: (out) => { out = out || V(); me.group.getWorldPosition(out); out.y += act === 'sleep' && phase === 'asleep' ? 0.4 : act === 'swim' ? 0.2 : 1.0; return out; },
  });

  const catchText = () => {
    if (!caught.length) return '';
    const nr = caught.filter((c) => c === 'rat').length, nf = caught.length - nr;
    return ` ${[nf ? `${nf} fish` : '', nr ? `${nr} rat${nr > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ')} in the basket so far.`;
  };
  function describe() {
    if (act === 'project') return mind.projectText();
    if (act === 'quest') { const q = castawayAI.lf && castawayAI.lf.quest, st = q && q.steps[q.i]; return q ? `${st && st.label ? st.label.charAt(0).toUpperCase() + st.label.slice(1) : 'Following his own interests'} (${q.why}).` : 'Following his own interests.'; }
    if (act === 'sleep') return phase === 'asleep' ? 'Asleep on a woven mat in his palm-frond lean-to, the campfire burning low beside him.' : 'Turning in for the night.';
    if (act === 'hike') return phase === 'pause' ? `Resting at ${route[wpi] ? route[wpi].name : 'a viewpoint'}, leaning on his staff.` : `${jog && speedNow > RUN_V ? 'Running' : 'Hiking'} toward ${route[wpi] ? route[wpi].name : 'a new corner of the island'} with his walking staff.`;
    if (act === 'swim') return phase === 'float' ? 'Floating on his back in the warm lagoon.' : 'Swimming laps across the lagoon.';
    if (act === 'fish') {
      if (!spot) return 'Looking for a good fishing spot.';
      if (phase === 'goto') return `Heading to ${spot.name} to fish.`;
      if (spot.method === 'spear') return `Wading the ${spot.name.replace('the ', '')} with a spear, stalking fish.${catchText()}`;
      return `Fishing at ${spot.name}: ${sub === 'bite' ? 'a bite!' : sub === 'reel' ? 'reeling one in!' : sub === 'show' ? 'admiring his catch.' : 'waiting for a bite.'}${catchText()}`;
    }
    if (act === 'canoe') {
      if (phase === 'goto') return 'Heading down the beach to launch his outrigger canoe.';
      if (phase === 'board') return 'Climbing aboard his outrigger canoe.';
      if (phase === 'launch' || phase === 'settle') return 'Paddling his outrigger canoe out across the lagoon.';
      if (phase === 'work') return `Fishing from the canoe, drifting on the lagoon: ${sub === 'bite' ? 'a bite!' : sub === 'reel' ? 'reeling one in!' : sub === 'show' ? 'admiring his catch.' : 'waiting for a bite.'}${catchText()}`;
      if (phase === 'back' || phase === 'dock') return 'Paddling the canoe home to the beach.';
      if (phase === 'exit') return 'Stepping out onto the sand and hauling the canoe up.';
      return 'Resting on the beach beside his canoe, watching the lagoon.';
    }
    if (act === 'shelter') return phase === 'goto' ? 'Hurrying back to his lean-to as the rain sets in.' : 'Sheltering in his lean-to, watching the rain.';
    if (act === 'camp') {
      if (meal === 'breakfast') return 'Cracking open a coconut on a log by the fire.';
      if (phase === 'cook') return `Cooking ${Math.max(1, Math.min(3, caught.length))} ${caught.slice(0, 3).every((c) => c === 'rat') ? 'rats' : caught.slice(0, 3).some((c) => c === 'rat') ? 'fish and rats' : 'fish'} over the campfire.`;
      if (phase === 'eat') return 'Eating his freshly grilled catch.';
      return 'Resting by the fire, watching the flames.';
    }
    if (act === 'watch') return phase === 'watch' ? `Watching the ${watchName}, turning his head to follow it.` : 'Looking around for something to watch.';
    if (act === 'linger' && rockUp) return lingerGest ? `Sitting on top of a boulder, ${LINGER_TEXT[lingerGest]}.` : 'Sitting on top of a boulder, taking in the view.';
    if (act === 'linger') return lingerGest ? `Resting in the view, ${LINGER_TEXT[lingerGest]}.` : 'Resting in the view.';
    if (act === 'dance') return 'Dancing, just for the joy of it.';
    if (act === 'drink' && dKind === 'coconut') return phase === 'goto' ? 'Racing for a fallen coconut before the monkeys can snatch it.' : phase === 'crack' ? 'Knocking the top off a coconut.' : phase === 'sip' ? 'Drinking the sweet water of a coconut.' : 'Wiping his mouth.';
    if (act === 'drink') return phase === 'drink' || phase === 'kneel' ? `Kneeling at ${dSpot ? dSpot.name : 'the water'} to drink from cupped hands.` : phase === 'rise' ? 'Wiping his mouth.' : `Walking to ${dSpot ? dSpot.name : 'fresh water'} for a drink.`;
    if (act === 'hunt') return phase === 'strike' ? 'Lunging at a rat with his spear!' : phase === 'show' ? 'Holding up a rat he has speared.' : phase === 'goto' ? (eco.stalking ? 'Creeping up on a rat with his spear.' : 'Going after a rat that is out in the open.') : 'Looking for rats.';
    if (act === 'chase') return phase === 'laugh' ? 'Bent over and laughing, out of breath.' : 'Racing after a monkey, laughing.';
    if (act === 'flee') return phase === 'breath' ? 'Catching his breath, looking back to check the boar has gone.' : 'Sprinting away from a boar!';
    return '';
  }

  /* ================================================================ locomotion */
  function passable(nx, nz, mv, swimOK) {
    // keep clear of the patch where a boar has just driven him off (unless he is running for it)
    if (lastThreat && act !== 'flee' && mind.clock - lastThreat.t < 1.3) { const dn = Math.hypot(nx - lastThreat.x, nz - lastThreat.z); if (dn < 13 && dn < Math.hypot(x - lastThreat.x, z - lastThreat.z)) return false; }
    const hT = getHeight(nx, nz);
    if (hT < -1.25 && !swimOK) return false;
    const pl = poolLevel(nx, nz);
    if (pl > 0.5 && pl - hT > 1.1) return false;
    if ((lavaDist(nx, nz) < 2.5 && hT > 0.5) || Math.hypot(nx - VOL.x, nz - VOL.z) < 14) return false;
    if (Math.abs(nx) > 232 || Math.abs(nz) > 232) return false;
    const hN = walkHeight(nx, nz, y, info);
    if (hT < -1.25) return true;
    const rise = hN - y;
    return rise <= mv * 1.2 + 0.06 || (info.tag && rise <= 0.55);
  }
  const _p = { x: 0, z: 0 };
  function step(tx, tz, speed, dt, swimOK) {
    const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
    if (d < 0.25) { speedNow = damp(speedNow, 0, 8, dt); return d; }
    const want0 = Math.atan2(dx, dz), mv = speed * dt;
    const offs = [lastOff, 0, 0.55, -0.55, 1.1, -1.1, 1.9, -1.9];
    let choice = null;
    for (const o of offs) {
      const a = want0 + o, nx = x + Math.sin(a) * Math.max(mv, 0.5), nz = z + Math.cos(a) * Math.max(mv, 0.5);
      if (passable(nx, nz, Math.max(mv, 0.5) * 0.6, swimOK)) { choice = a; lastOff = o; break; }
    }
    if (choice == null) { stuck += dt; speedNow = damp(speedNow, 0, 8, dt); heading = turnTo(heading, want0 + 1.2, 3 * dt); return d; }
    heading = turnTo(heading, choice, 5 * dt);
    const sp = speed * (Math.abs(wrap(choice - heading)) > 1.0 ? 0.25 : 1);
    _p.x = x + Math.sin(heading) * sp * dt; _p.z = z + Math.cos(heading) * sp * dt;
    resolveColliders(_p, 0.42);
    if (passable(_p.x, _p.z, sp * dt, swimOK)) {
      const moved = Math.hypot(_p.x - x, _p.z - z);
      x = _p.x; z = _p.z; speedNow = damp(speedNow, sp, 6, dt);
      if (moved < sp * dt * 0.35) {                       // pushed back by an obstacle: count it as stuck and try another way round
        noProg += dt;
        if (noProg > 0.8) { stuck += dt * 2; lastOff = pick([-1.6, 1.6, -2.4, 2.4]); heading += rr(-1, 1); }
      } else { noProg = Math.max(0, noProg - dt * 2); stuck = Math.max(0, stuck - dt * 0.5); }
    } else { stuck += dt; speedNow = damp(speedNow, 0, 8, dt); }
    return d;
  }
  function settleY(dt) {
    const hT = getHeight(x, z);
    inWater = hT < -1.25;
    if (inWater) { waveT += dt; y = damp(y, 0.1 + Math.sin(waveT * 1.7) * 0.03, 10, dt); if (speedNow > 0.5) waterWake(wkSelf, x, z, speedNow, 0.55, dt); }
    else if (hT < -0.05 && speedNow > 0.6) waterWake(wkSelf, x, z, speedNow * 0.7, 0.4, dt, 0.25);
    else y = damp(y, walkHeight(x, z, y + 0.6, info), 14, dt);
  }

  /* ================================================================ poses */
  const setPose = (o) => { Object.assign(P, STAND, o); };
  function gait(dt, spd, staffHand = false) {
    ph += dt * (2.2 + spd * 1.6);
    const s = Math.sin(ph), c = Math.cos(ph), a = Math.min(1, spd / 2.2), k = 0.58 * a;
    Object.assign(P, STAND, {
      py: 0.9 - 0.02 * a + 0.028 * Math.cos(ph * 2) * a, spX: 0.05 * a, spY: 0.09 * s * a,
      lPh: -k * s, lNh: k * s, lPk: 0.1 + 0.75 * Math.max(0, c) * a, lNk: 0.1 + 0.75 * Math.max(0, -c) * a,
      aPs: staffHand ? -0.35 + 0.1 * s : 0.52 * s * a, aPe: staffHand ? -0.45 : -0.22 - 0.35 * Math.max(0, -s) * a,
      aNs: -0.52 * s * a, aNe: -0.22 - 0.35 * Math.max(0, s) * a,
    });
    snap = false;
  }
  // a run: quick cadence, long stride, high knees, torso leaning into it, bent arms pumping
  function run(dt, spd, staffHand = false) {
    runFlag = true;
    ph += dt * (3.4 + spd * 1.45);
    const s = Math.sin(ph), c = Math.cos(ph), a = clamp(spd / 5.6, 0.6, 1.15);
    Object.assign(P, STAND, {
      py: 0.83 + 0.05 * Math.abs(c) * a, spX: 0.27 * a, spY: 0.17 * s * a, nkX: 0.04, hdX: -0.22 * a,
      lPh: -0.95 * s * a - 0.1, lNh: 0.95 * s * a - 0.1,
      lPk: 0.3 + 1.4 * Math.max(0, c) * a + 0.35 * Math.max(0, -s) * a, lNk: 0.3 + 1.4 * Math.max(0, -c) * a + 0.35 * Math.max(0, s) * a,
      aPs: staffHand ? -0.4 + 0.14 * s : -0.35 + 0.95 * s * a, aPe: staffHand ? -0.6 : -1.45, aPz: 0.1,
      aNs: -0.35 - 0.95 * s * a, aNe: -1.45, aNz: -0.1, lPz: 0.04, lNz: -0.04,
    });
    snap = false;
  }
  const RUN_V = 4.3;
  const move = (dt, staffHand = false) => { if (speedNow > RUN_V) run(dt, speedNow, staffHand); else gait(dt, speedNow, staffHand); };
  function swimGait(dt) {
    swPh += dt * (3.0 + speedNow * 0.9);
    snap = true;
    const k = Math.sin(swPh * 2.2);
    Object.assign(P, STAND, {
      rx: Math.PI / 2, py: 0.03 * Math.sin(swPh * 2), nkX: -0.3, hdX: -0.6 - 0.2 * Math.max(0, Math.sin(swPh * 0.33)),
      hdY: 0.9 * Math.max(0, Math.sin(swPh * 0.5 + 1.6)) * (Math.sin(swPh * 0.25) > 0 ? 1 : -1),
      aPs: swPh, aPe: -0.9 * Math.max(0, Math.sin(swPh)), aNs: swPh + Math.PI, aNe: -0.9 * Math.max(0, Math.sin(swPh + Math.PI)), aPz: 0.1, aNz: -0.1,
      lPh: 0.28 * k, lNh: -0.28 * k, lPk: 0.2 + 0.2 * Math.max(0, k), lNk: 0.2 + 0.2 * Math.max(0, -k), lPz: 0.04, lNz: -0.04, spY: 0.12 * Math.sin(swPh),
    });
    if ((Math.sin(swPh) > 0.97 || Math.sin(swPh + Math.PI) > 0.97) && (!swimGait.cool || swimGait.cool < performance.now())) {
      swimGait.cool = performance.now() + 350; fx.splash(x + Math.sin(heading) * 0.6, 0, z + Math.cos(heading) * 0.6, 0.3);
    }
  }
  function apply(dt) {
    const r = snap ? 40 : 7;
    for (const k in C) C[k] = damp(C[k], P[k], r, dt);
    me.root.rotation.x = C.rx;
    me.root.position.set(0, C.py - 0.9 * Math.cos(C.rx), -0.9 * Math.sin(C.rx));
    me.spine.rotation.set(C.spX, C.spY + vSpY, 0);
    me.neck.rotation.x = C.nkX; me.head.rotation.set(C.hdX + vHdX, C.hdY + vHdY, 0);
    me.armR.rotation.set(C.aPs, 0, C.aPz); me.armR.elbow.rotation.x = C.aPe;
    me.armL.rotation.set(C.aNs, 0, C.aNz); me.armL.elbow.rotation.x = C.aNe;
    me.legR.rotation.set(C.lPh, 0, C.lPz); me.legR.knee.rotation.x = C.lPk; me.legR.foot.rotation.x = clamp(-(C.lPh + C.lPk) * 0.65, -0.9, 0.9);
    me.legL.rotation.set(C.lNh, 0, C.lNz); me.legL.knee.rotation.x = C.lNk; me.legL.foot.rotation.x = clamp(-(C.lNh + C.lNk) * 0.65, -0.9, 0.9);
  }
  const clearProps = () => {
    staff.visible = rod.visible = spear.visible = stick.visible = coco.visible = fishHeld.visible = fishSpeared.visible = paddle.visible = false;
    bobber.visible = line.visible = false;
  };
  function begin(a) {
    if (act === 'project' && a !== 'project') life.project.pause('Interrupted by ' + a);
    if (act === 'quest' && a !== 'quest') { lf.pause('interrupted by ' + a); showHeld(null); qFace = null; }
    if (act === 'hunt' && a !== 'hunt') endHunt();
    if (act === 'drink' && coco.visible) coco.visible = false;
    if (act === 'canoe' && a !== 'canoe') leaveCanoe();
    if (rockUp) leaveRock();
    act = a; phase = 'init'; sub = ''; stuck = 0; lastOff = 0; hurry = true; clearProps(); me.chest.scale.set(1, 1, 1);
    if (a === 'camp') meal = caught.length ? 'dinner' : 'breakfast';      // fish if he has caught any, otherwise a coconut
    if (a === 'fish') spot = null;
  }

  /* ================================================================ SLEEP */
  function sleepUpdate(dt, t) {
    if (phase === 'init') phase = 'goto';
    if (phase === 'goto') {
      const d = step(hut.mat.x, hut.mat.z, hurry ? 3.6 : 2.4, dt, inWater);
      settleY(dt); if (inWater) swimGait(dt); else gait(dt, speedNow);
      if (d < 0.7 || stuck > 8) { phase = 'lie'; pt = 0; x = hut.mat.x; z = hut.mat.z; heading = hut.yaw + Math.PI / 2; hurry = false; }
      apply(dt); return;
    }
    x = damp(x, hut.mat.x, 4, dt); z = damp(z, hut.mat.z, 4, dt); y = damp(y, hut.mat.y, 6, dt);
    if (phase === 'lie') {
      pt += dt;
      heading = turnTo(heading, hut.yaw + Math.PI / 2, 2.5 * dt);
      if (pt < 1.3) setPose({ py: 0.55, spX: 0.5, lPh: -1.2, lPk: 1.9, lNh: -1.2, lNk: 1.9, aPs: -0.5, aNs: -0.5, aPe: -0.8, aNe: -0.8 });
      else if (pt < 2.4) setPose({ py: 0.2, rx: -1.2, lPh: -0.3, lPk: 0.3, lNh: -0.2, lNk: 0.25, aPs: 0.1, aNs: 0.1, aPz: 0.2, aNz: -0.2 });
      else { phase = 'asleep'; pt = 0; }
    } else {
      const br = Math.sin(t * 1.5);
      setPose({ py: 0.115 + 0.006 * br, rx: -Math.PI / 2, hdX: 0.02, hdY: 0.45 + 0.1 * Math.sin(t * 0.07), lPh: 0.0, lPk: 0.28, lNh: 0.03, lNk: 0.12, lPz: 0.14, lNz: -0.12, aPs: 0.05, aPz: 0.28, aPe: -0.12, aNs: -0.5, aNe: -2.1, aNz: -0.05 });
      me.chest.scale.set(1, 1 + 0.025 * br, 1 + 0.03 * br);
      snoreT -= dt;
      if (snoreT < 0) {
        snoreT = rr(2.2, 3.6);
        me.head.getWorldPosition(_hw);
        for (let i = 0; i < 3; i++) fx.sparkle.emit({ x: _hw.x + rr(-0.1, 0.1), y: _hw.y + 0.25 + i * 0.12, z: _hw.z + rr(-0.1, 0.1), vy: 0.35 + i * 0.1, vx: 0.15, life: 2.2, s0: 0.18 + i * 0.1, s1: 0.5 + i * 0.12, c0: [0.7, 0.85, 1, 0.55], c1: [0.7, 0.85, 1, 0], drag: 0.2 });
      }
    }
    apply(dt);
  }

  /* ================================================================ HIKE */
  let jog = false, jogLeg = -1, legT = 0, legMax = 60;
  function hikeUpdate(dt, t) {
    if (phase === 'init') {
      // he only goes where he can get back to fresh water in good time
      const reach = (p) => freshSpots.some((q) => Math.hypot(q.stand.x - p.x, q.stand.z - p.z) < 85);
      route = pois.filter((p) => !unsafeAt(p.x, p.z, 26) && reach(p)).sort(() => rnd() - 0.5).slice(0, 4);
      if (!route.length) route = pois.slice().sort(() => rnd() - 0.5).slice(0, 2);
      // sometimes he heads where the monkeys forage (and may end up chasing one)
      const ms = creatures.filter((c) => c.name === 'Capuchin monkey' && c.sim && c.sim.state !== 'perch' && !unsafeAt(c.sim.x, c.sim.z, 26));
      if (ms.length && rnd() < 0.6) { const m = pick(ms).sim; route[0] = { x: m.x, z: m.z, name: 'where the monkeys forage' }; }
      wpi = 0; phase = 'walk'; clearProps(); staff.visible = true; jogLeg = -1;
    }
    settleY(dt);
    if (phase === 'walk') {
      const w = route[wpi];
      const dleg = Math.hypot(w.x - x, w.z - z);
      if (jogLeg !== wpi) {          // a long way to go: when he is in good spirits (or hungry) he runs it
        jogLeg = wpi; legT = 0; legMax = dleg / 1.5 + 14; const m = mind.needs;
        jog = dleg > 35 && rnd() < 0.12 + 0.6 * Math.max(0, m.happy - 0.5) + (m.hunger > 0.6 ? 0.2 : 0);
      }
      const d = step(w.x, w.z, jog && dleg > 7 ? 5.6 : hurry ? 3.8 : 2.7, dt, inWater);
      if (inWater) swimGait(dt); else move(dt, true);
      if (d < 1.4) hurry = false;
      legT += dt;                                    // a leg that takes far too long (he keeps being turned aside) ends where he has got to
      if (d < 1.2 || stuck > 7 || legT > legMax) { phase = 'pause'; pt = rr(6, 10); stuck = 0; pauseKind = pick(['look', 'rest', 'look']); }
    } else {
      pt -= dt;
      const lk = Math.sin(t * 0.45 + 2) * 0.9;
      if (pauseKind === 'look') setPose({ aPs: -0.35, aPe: -0.5, aNs: -1.1, aNe: -1.9, aNz: -0.2, hdY: lk, hdX: -0.05, spY: lk * 0.2 });
      else setPose({ aPs: -0.35, aPe: -0.4, aNz: -0.5, aNe: -1.6, aNs: 0.3, hdY: lk * 0.6, lNh: 0.1, lPh: -0.12, py: 0.89, spX: 0.03 });
      speedNow = damp(speedNow, 0, 6, dt);
      if (pt < 0) { wpi++; phase = wpi >= route.length ? 'init' : 'walk'; }
    }
    apply(dt);
  }

  /* ================================================================ SWIM */
  const swimTarget = { x: 0, z: 0 };
  function newSwimTarget() {
    for (let k = 0; k < 30; k++) {
      const a = rnd() * TAU, r = rr(4, 22), tx = COVE.x - 8 + Math.cos(a) * r, tz = COVE.z + 6 + Math.sin(a) * r;
      if (getHeight(tx, tz) < -1.7) { swimTarget.x = tx; swimTarget.z = tz; return; }
    }
    swimTarget.x = COVE.x - 8; swimTarget.z = COVE.z + 8;
  }
  function swimUpdate(dt, t) {
    if (phase === 'init') { phase = 'enter'; clearProps(); }
    settleY(dt);
    if (phase === 'enter') {
      step(COVE.x - 8, COVE.z + 6, hurry ? 3.6 : 2.3, dt, true);
      if (inWater) { swimGait(dt); if (!sub) { sub = 'in'; fx.splash(x, 0, z, 0.8); } } else gait(dt, speedNow);
      if (inWater && getHeight(x, z) < -1.6) { phase = 'swim'; sub = ''; pt = rr(12, 22); newSwimTarget(); hurry = false; }
      if (stuck > 8) { phase = 'swim'; newSwimTarget(); }
    } else if (phase === 'swim') {
      pt -= dt;
      const d = step(swimTarget.x, swimTarget.z, 1.45, dt, true);
      if (inWater) swimGait(dt); else gait(dt, speedNow);
      if (d < 2.5) { if (pt < 0 && rnd() < 0.7) { phase = 'float'; pt = rr(6, 11); } else newSwimTarget(); }
    } else {
      pt -= dt; speedNow = damp(speedNow, 0, 3, dt); snap = false;
      setPose({ rx: -Math.PI / 2, py: -0.02 + 0.03 * Math.sin(t * 1.2), nkX: 0.1, hdX: 0.15, hdY: 0.2 * Math.sin(t * 0.3), aPs: 0.1 * Math.sin(t * 1.2), aPz: 1.0, aPe: -0.2, aNs: -0.1 * Math.sin(t * 1.2), aNz: -1.0, aNe: -0.2, lPz: 0.25, lNz: -0.25, lPh: 0.1 * Math.sin(t * 1.6), lNh: -0.1 * Math.sin(t * 1.6), lPk: 0.1, lNk: 0.1 });
      if (pt < 0) { phase = 'swim'; pt = rr(10, 20); newSwimTarget(); }
    }
    apply(dt);
  }

  /* ================================================================ FISH: rod from the bank / pool, or spear in the shallows */
  const badSpots = new Set();
  function pickSpot() {
    // a hungry man fishes close to hand: choose among the nearest few spots he can use, rather than crossing the island
    const ok = fishable.filter((c) => c !== lastSpot && !badSpots.has(c) && !unsafeAt(c.stand.x, c.stand.z, 22) && Math.hypot(c.stand.x - x, c.stand.z - z) > 6);
    ok.sort((a, b) => Math.hypot(a.stand.x - x, a.stand.z - z) - Math.hypot(b.stand.x - x, b.stand.z - z));
    const best = pick(ok.slice(0, 3)) || pick(fishable.filter((q) => !badSpots.has(q))) || fishable[0];
    lastSpot = best; return best;
  }
  function newCastTarget() {
    const j = poolLevel(spot.target.x, spot.target.z) > 0.5 || riverSurface(spot.target.x, spot.target.z) != null ? 0.6 : 1.6;
    const tx = spot.target.x + rr(-j, j), tz = spot.target.z + rr(-j, j);
    bob.to.set(tx, waterAt(tx, tz) ?? waterAt(spot.target.x, spot.target.z) ?? 0, tz);
  }
  function fishUpdate(dt, t) {
    if (phase === 'init') { spot = pickSpot(); phase = 'goto'; clearProps(); walkT = 0; }
    if (phase === 'goto') {
      settleY(dt);
      mind.current.until = Math.max(mind.current.until, mind.clock + 0.3);      // the walk to the spot does not eat into his fishing time
      const d = step(spot.stand.x, spot.stand.z, hurry ? 3.8 : 2.7, dt, inWater);
      if (inWater) swimGait(dt); else move(dt);
      apply(dt);
      walkT += dt;
      if (d < 0.5) { phase = 'ready'; pt = 0; hurry = false; sessionT = rr(30, 48); sessionCatch = caught.length; mind.current.until = mind.clock + sessionT / 25 + 0.2; }
      else if (stuck > 7 || walkT > 50) { walkT = 0; badSpots.add(spot); if (badSpots.size > fishable.length - 3) badSpots.clear(); phase = 'init'; stuck = 0; }
      return;
    }
    if (phase === 'ready') {
      settleY(dt); pt += dt;
      heading = turnTo(heading, spot.face, 3 * dt);
      speedNow = damp(speedNow, 0, 8, dt);
      setPose({});
      apply(dt);
      if (pt > 0.9) {
        phase = 'work'; pt = 0; bob.flying = 0; bob.biteT = 0; waitT = rr(2, 5); clearProps();
        if (spot.method === 'spear') { sub = 'wait'; spear.visible = true; } else { sub = 'cast'; newCastTarget(); rod.visible = true; }
      }
      return;
    }
    const sitting = false;
    settleY(dt);
    heading = turnTo(heading, spot.face, 3 * dt);
    sessionT -= dt; pt += dt;
    if (spot.method === 'spear') spearRoutine(dt, t); else rodRoutine(dt, t, sitting);
    if (sessionT < 0 && sub === 'wait') { phase = 'init'; clearProps(); sessionEnd(spot ? spot.name : 'the shore'); mind.finish(); }      // a session over: back to the planner, which may send him straight back out
    apply(dt);
  }

  function rodRoutine(dt, t, sitting) {
    const base = sitting
      ? { py: 0.12, spX: 0.12, lPh: -1.5, lPk: 1.4 + Math.sin(t * 1.3) * 0.06, lNh: -1.45, lNk: 1.45 - Math.sin(t * 1.3) * 0.06, lPz: 0.06, lNz: -0.06 }
      : { py: 0.89, spX: -0.05, lPh: -0.14, lNh: 0.12, lPk: 0.12, lNk: 0.16, lPz: 0.1, lNz: -0.1 };
    let aPs = -0.95, aPe = -1.25, aNs = -0.85, aNe = -1.15, hdX = 0.25, hdY = 0.1 * Math.sin(t * 0.4);
    if (sub === 'cast') {
      const k = clamp(pt / 1.5, 0, 1);
      const sw = k < 0.4 ? -0.95 + 1.1 * (k / 0.4) : 0.15 - 1.5 * smooth((k - 0.4) / 0.35);
      aPs = clamp(sw, -1.9, 0.2); aPe = -1.0 + (k < 0.4 ? 0.4 : 0); aNs = aPs * 0.8;
      if (k > 0.55 && bob.flying === 0) { bob.flying = 0.001; rodTip.getWorldPosition(_tip); bob.from.copy(_tip); }
      if (bob.flying > 0) {
        bob.flying += dt / 0.9;
        const f = Math.min(1, bob.flying);
        bob.pos.lerpVectors(bob.from, bob.to, f); bob.pos.y += Math.sin(f * Math.PI) * 3.2;
        if (f >= 1) { bob.flying = -1; fx.splash(bob.pos.x, bob.to.y, bob.pos.z, 0.35); }
      }
      if (k >= 1 && bob.flying === -1) { sub = 'wait'; pt = 0; waitT = rr(7, 15); }
    } else if (sub === 'wait') {
      bob.to.y = waterY(bob.to.x, bob.to.z); bob.pos.y = bob.to.y + Math.sin(t * 1.6) * 0.025;
      bob.plT = (bob.plT ?? 1) - dt; if (bob.plT < 0) { bob.plT = rr(1.8, 3.4); fx.plink(bob.pos.x, bob.pos.z, 0.8); }
      if (waitT - pt < 1.0 && Math.sin(t * 20) > 0.9) { bob.pos.y -= 0.03; if (rnd() < dt * 3) fx.plink(bob.pos.x, bob.pos.z, 0.55); }
      aPs += 0.03 * Math.sin(t * 0.8); hdX = 0.3;
      if (pt > waitT && sessionT > 0) { sub = 'bite'; pt = 0; }
    } else if (sub === 'bite') {
      bob.pos.y = bob.to.y - 0.05 - 0.08 * Math.abs(Math.sin(t * 14));
      aPs = -1.0 - 0.07 * Math.sin(t * 9); hdX = 0.4;
      if (!bob.biteT) { bob.biteT = 1; fx.splash(bob.pos.x, bob.to.y, bob.pos.z, 0.28); fx.plink(bob.pos.x, bob.pos.z, 1.5); }
      if (rnd() < dt * 4) fx.plink(bob.pos.x, bob.pos.z, 1.1);
      if (pt > 1.4) { sub = 'reel'; pt = 0; bob.biteT = 0; }
    } else if (sub === 'reel') {
      const k = clamp(pt / 3.2, 0, 1);
      aPs = -1.35 + 0.1 * Math.sin(t * 8); aPe = -0.9 - 0.4 * Math.sin(t * 7); hdX = 0.35;
      me.armR.hand.getWorldPosition(_hand);
      bob.pos.x = lerp(bob.to.x, _hand.x, smooth(k) * 0.97); bob.pos.z = lerp(bob.to.z, _hand.z, smooth(k) * 0.97);
      bob.pos.y = bob.to.y + Math.abs(Math.sin(t * 12)) * 0.04 * (1 - k) + smooth(k) * Math.max(0, _hand.y - 0.3 - bob.to.y) * 0.9;
      if (k < 0.9 && rnd() < dt * 4) fx.splash(bob.pos.x, bob.to.y, bob.pos.z, 0.18);
      if (k < 0.92) waterWake(bob, bob.pos.x, bob.pos.z, 2.4 * (1 - k) + 0.7, 0.3, dt, 0.5);
      if (pt > 3.3) { sub = 'show'; pt = 0; fishHeld.visible = true; tint(fishHeld, 0); }
    } else if (sub === 'show') {
      aPs = -1.0; aPe = -1.0; aNs = -1.2; aNe = -1.5; hdX = 0.1; hdY = 0.2;
      me.armR.hand.getWorldPosition(_hand);
      bob.pos.copy(_hand).add(V(0, -0.1, 0));
      if (pt > 3.2) { fishHeld.visible = false; landed(pick(FISH_NAMES)); sub = 'release'; pt = 0; }
    } else if (sub === 'release') {
      aNs = -0.6 - 0.3 * pt; aNe = -1.0; hdX = 0.4;
      if (pt > 0.9) { sub = 'cast'; pt = 0; bob.flying = 0; newCastTarget(); }
    }
    setPose({ ...base, aPs, aPe, aNs, aNe, hdX, hdY, nkX: 0.05 });
    rod.visible = true;
    rodTip.getWorldPosition(_tip);
    bobber.position.copy(bob.pos);
    for (let i = 0; i < linePts.length; i++) {
      const f = i / (linePts.length - 1);
      linePts[i].lerpVectors(_tip, bob.pos, f);
      linePts[i].y += Math.sin(f * Math.PI) * -0.35 * (sub === 'wait' ? 1 : 0.4);
    }
    lineGeo.setFromPoints(linePts);
    bobber.visible = line.visible = !(sub === 'cast' && bob.flying === 0);
  }

  function spearRoutine(dt, t) {
    const base = { lPh: -0.2, lNh: 0.12, lPk: 0.22, lNk: 0.2, lPz: 0.11, lNz: -0.11 };
    let aPs = -1.25, aPe = -0.45, aNs = -1.1, aNe = -0.5, spX = 0.32, hdX = 0.45, hdY = 0.25 * Math.sin(t * 0.7), py = 0.88;
    spear.visible = true;
    if (sub === 'wait') {
      aPs += 0.05 * Math.sin(t * 1.1);
      if (pt > waitT && sessionT > 0) { sub = 'strike'; pt = 0; }
    } else if (sub === 'strike') {
      const k = clamp(pt / 0.75, 0, 1);
      const th = k < 0.28 ? k / 0.28 : 1 - smooth((k - 0.28) / 0.72) * 0.2;
      aPs = -1.25 - 0.35 * th; aPe = -0.45 + 0.3 * th; aNs = -1.1 - 0.35 * th; aNe = -0.5 + 0.2 * th; spX = 0.32 + 0.4 * th; hdX = 0.5 + 0.2 * th; py = 0.88 - 0.05 * th;
      if (k > 0.26 && !bob.biteT) { bob.biteT = 1; spearTip.getWorldPosition(_tip); fx.splash(_tip.x, 0, _tip.z, 0.4); bob.hit = rnd() < 0.62; }
      if (pt > 0.95) {
        bob.biteT = 0;
        if (bob.hit) { sub = 'lift'; pt = 0; fishSpeared.visible = true; tint(fishSpeared, 0); } else { sub = 'wait'; pt = 0; waitT = rr(3, 8); }
      }
    } else if (sub === 'lift') {
      const k = clamp(pt / 3.4, 0, 1);
      aPs = -1.7 + 0.25 * Math.sin(t * 6); aPe = -0.2; aNs = -1.5; aNe = -0.3; spX = -0.05; hdX = -0.15; hdY = 0.2 * Math.sin(t * 2);
      fishSpeared.rotation.z = 0.3 * Math.sin(t * 14) * (1 - k);
      if (pt > 3.4) { fishSpeared.visible = false; landed(pick(FISH_NAMES)); sub = 'wait'; pt = 0; waitT = rr(3, 8); }
    }
    setPose({ ...base, aPs, aPe, aNs, aNe, spX, hdX, hdY, py });
  }

  /* ================================================================ CANOE: paddle the outrigger out, fish from it, paddle home */
  const sea = cn ? cn.sea : { x: 0, z: 1 };
  const boardSpot = { x: 0, z: 0 };
  if (cn) {                                                      // step aboard from the landward side, clear of the fire and the hull
    let bd = -1;
    for (const off of [0, 1.4, -1.4, 2.2, -2.2]) for (const dist of [2.3, 2.9]) {
      const px = cn.x - sea.x * dist + Math.sin(cn.yaw) * off, pz = cn.z - sea.z * dist + Math.cos(cn.yaw) * off;
      const q = { x: px, z: pz };
      if (resolveColliders(q, 0.55) || getHeight(px, pz) < 0.1) continue;
      const sc = Math.hypot(px - camp.x, pz - camp.z) - Math.abs(off) * 0.3;
      if (sc > bd) { bd = sc; boardSpot.x = px; boardSpot.z = pz; }
    }
    if (bd < 0) { boardSpot.x = cn.x - sea.x * 2.6; boardSpot.z = cn.z - sea.z * 2.6; }
  }
  if (cn) cn.board = boardSpot;
  const boat = { x: cn ? cn.x : 0, z: cn ? cn.z : 0, yaw: cn ? cn.yaw : 0, y: 0, v: 0, bob: 0, stroke: 0, roll: 0, pitch: 0, x0: 0, z0: 0, y0: 0, yaw0: 0, dipped: false };
  const SEAT_Y = 0.2;
  let canoeSpot = null, wps = [], wpk = 0, via = null;
  function updateBoat(dt, t) {
    if (!cn) return;
    boat.bob += dt;
    const g = getHeight(boat.x, boat.z);
    const away = Math.hypot(boat.x - cn.x, boat.z - cn.z) > 1.5;
    const target = Math.max(-0.32, g - 0.18) + (away ? Math.sin(boat.bob * 1.25) * 0.03 : 0);
    boat.y = damp(boat.y, target, 8, dt);
    boat.roll = damp(boat.roll, away ? Math.sin(boat.bob * 0.9) * 0.025 + Math.sin(boat.stroke * TAU) * 0.01 * boat.v : 0, 4, dt);
    boat.pitch = damp(boat.pitch, away ? Math.sin(boat.bob * 1.1 + 1) * 0.015 : 0, 4, dt);
    cn.mesh.position.set(boat.x, boat.y, boat.z);
    cn.mesh.rotation.set(boat.pitch, boat.yaw, boat.roll, 'YXZ');
  }
  const bowH = () => boat.yaw + Math.PI;                                  // the way the bow points (his heading when aboard)
  function seatTo() {
    x = boat.x + Math.sin(boat.yaw) * 0.25; z = boat.z + Math.cos(boat.yaw) * 0.25;
    y = boat.y + SEAT_Y; heading = bowH();
  }
  function setCanoeAway(away) {
    cn.cols.forEach((c) => { c.off = away; });
    cn.stowed.forEach((p) => { p.visible = !away; });
    paddle.visible = away;
  }
  function resetBoat() {
    boat.x = cn.x; boat.z = cn.z; boat.yaw = cn.yaw; boat.v = 0; boat.stroke = 0;
    setCanoeAway(false); paddle.visible = false; updateBoat(0.5, 0);
  }
  function leaveCanoe() {
    if (!cn) return;
    const aboard = ['board', 'launch', 'settle', 'work', 'back', 'dock', 'exit'].includes(phase);
    resetBoat();
    if (aboard) { x = boardSpot.x; z = boardSpot.z; y = getHeight(x, z); }
    bobber.visible = line.visible = false;
  }
  function clearPath(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
    const tmp = { x: 0, z: 0 };
    for (let i = 0; i <= n; i++) {
      const px = ax + (bx - ax) * (i / n), pz = az + (bz - az) * (i / n);
      if (getHeight(px, pz) > -0.75) return false;
      if (Math.hypot(px - (COVE.x + 16), pz - (COVE.z + 18)) < 10) return false;       // the wreck
      tmp.x = px; tmp.z = pz; if (resolveColliders(tmp, 1.6)) return false;
    }
    return true;
  }
  function pickCanoeSpot() {
    const base = Math.atan2(sea.x, sea.z), ox = cn.x + sea.x * 9, oz = cn.z + sea.z * 9;
    for (let k = 0; k < 120; k++) {
      const a = base + rr(-1.0, 1.0), r = rr(16, 42), tx = cn.x + Math.sin(a) * r, tz = cn.z + Math.cos(a) * r;
      if (getHeight(tx, tz) < -2.0 && clearPath(ox, oz, tx, tz)) return { x: tx, z: tz };
    }
    return { x: cn.x + sea.x * 22, z: cn.z + sea.z * 22 };
  }
  function sail(dt, tx, tz, vmax, turn = 0.7) {
    const dx = tx - boat.x, dz = tz - boat.z, d = Math.hypot(dx, dz);
    const aim = Math.atan2(dx, dz);
    const h = turnTo(bowH(), aim, turn * dt);
    boat.yaw = h - Math.PI;
    const want = Math.min(vmax, 0.4 + d * 0.5) * (Math.abs(wrap(aim - h)) > 0.9 ? 0.35 : 1);
    boat.v = damp(boat.v, want, 1.6, dt);
    boat.x += Math.sin(h) * boat.v * dt; boat.z += Math.cos(h) * boat.v * dt;
    return d;
  }
  function paddlePose(dt, spd, calm = false) {
    boat.stroke += dt * (0.34 + spd * 0.2);
    const s = boat.stroke % 1;
    // reach (0) -> pull back (0.5) -> lift & recover (1)
    const pull = s < 0.5 ? smooth(s / 0.5) : 1 - smooth((s - 0.5) / 0.5);
    const lift = s > 0.46 && s < 0.9 ? 1 : 0;
    const k = calm ? 0.25 : 1;
    setPose({
      py: 0.12, spX: 0.2 - 0.14 * pull * k, lPh: -1.5, lPk: 1.4, lNh: -1.45, lNk: 1.45, lPz: 0.12, lNz: -0.12,
      aPs: -1.35 + 0.8 * pull * k, aPe: -0.55 - 0.15 * lift, aPz: 0.5 + 0.08 * lift,
      aNs: -1.7 + 0.45 * pull * k, aNe: -1.25 + 0.1 * pull, aNz: -0.25, hdX: 0.08, hdY: 0, nkX: 0,
    });
    paddle.visible = true;
    paddle.rotation.set(-(me.armR.rotation.x + me.armR.elbow.rotation.x) - 0.5 + 0.7 * pull * k, 0, 0.05);
    if (spd > 0.5 && s < 0.08 && !boat.dipped) { boat.dipped = true; paddleTip.getWorldPosition(_tip); fx.splash(_tip.x, 0, _tip.z, 0.18); }
    if (s > 0.2) boat.dipped = false;
  }
  function canoeUpdate(dt, t) {
    if (phase === 'init') {
      phase = 'goto'; clearProps(); canoeSpot = pickCanoeSpot(); resetBoat(); stuck = 0; via = null;
      const side = (x - cn.x) * sea.x + (z - cn.z) * sea.z;          // on the float side of the hull? go round the nearer end first
      if (side > -0.6) {
        const ax = Math.sin(cn.yaw), az = Math.cos(cn.yaw), along = (x - cn.x) * ax + (z - cn.z) * az, sg = along >= 0 ? 1 : -1;
        via = { x: cn.x + ax * 5.2 * sg - sea.x * 1.2, z: cn.z + az * 5.2 * sg - sea.z * 1.2 };
      }
    }
    if (phase === 'goto') {
      settleY(dt);
      if (via) { const dv = step(via.x, via.z, hurry ? 3.8 : 2.7, dt, true); if (dv < 1.0 || stuck > 8) { via = null; stuck = 0; } if (inWater) swimGait(dt); else gait(dt, speedNow); apply(dt); return; }
      const d = step(boardSpot.x, boardSpot.z, hurry ? 3.8 : 2.7, dt, inWater);
      if (inWater) swimGait(dt); else gait(dt, speedNow);
      apply(dt);
      if (d < 0.5 || stuck > 8) { phase = 'board'; pt = 0; hurry = false; x = boardSpot.x; z = boardSpot.z; }
      return;
    }
    if (phase === 'board') {
      pt += dt;
      const k = smooth(clamp(pt / 1.6, 0, 1));
      const sx = boat.x + Math.sin(boat.yaw) * 0.25, sz = boat.z + Math.cos(boat.yaw) * 0.25;
      x = lerp(boardSpot.x, sx, k); z = lerp(boardSpot.z, sz, k);
      y = lerp(getHeight(boardSpot.x, boardSpot.z), boat.y + SEAT_Y, k) + 0.28 * Math.sin(k * Math.PI);
      heading = turnTo(heading, bowH(), 4 * dt);
      setPose({ py: lerp(0.9, 0.15, k), spX: 0.2 * k, lPh: lerp(-0.5, -1.5, k), lPk: lerp(0.9, 1.4, k), lNh: lerp(0.3, -1.45, k), lNk: lerp(0.4, 1.45, k), aPs: -0.6 * k, aNs: -0.6 * k });
      updateBoat(dt, t);
      apply(dt);
      if (pt > 1.6) { phase = 'launch'; wps = [{ x: cn.x + sea.x * 9, z: cn.z + sea.z * 9 }, canoeSpot]; wpk = 0; setCanoeAway(true); }
      return;
    }
    if (phase === 'launch' || phase === 'back') {
      const w = wps[wpk];
      const d = sail(dt, w.x, w.z, phase === 'launch' ? 2.0 : 2.1);
      paddlePose(dt, boat.v);
      updateBoat(dt, t); seatTo(); apply(dt);
      if (d < 1.6) {
        if (wpk < wps.length - 1) wpk++;
        else if (phase === 'launch') { phase = 'settle'; pt = 0; }
        else { phase = 'dock'; pt = 0; boat.x0 = boat.x; boat.z0 = boat.z; boat.yaw0 = boat.yaw; }
      }
      return;
    }
    if (phase === 'settle') {
      pt += dt;
      boat.v = damp(boat.v, 0, 1.4, dt); boat.x += Math.sin(bowH()) * boat.v * dt; boat.z += Math.cos(bowH()) * boat.v * dt;
      paddlePose(dt, boat.v, true);
      updateBoat(dt, t); seatTo(); apply(dt);
      if (pt > 2.4) {
        phase = 'work'; pt = 0; sub = 'cast'; sessionT = rr(26, 36); sessionCatch = caught.length; bob.flying = 0; bob.biteT = 0; waitT = rr(2, 5);
        const h = bowH(), len = rr(7, 10);
        spot = { method: 'canoe', name: 'the lagoon', stand: { x: boat.x, z: boat.z }, face: h, target: { x: boat.x + Math.sin(h) * len, z: boat.z + Math.cos(h) * len } };
        clearProps(); rod.visible = true; newCastTarget();
      }
      return;
    }
    if (phase === 'work') {
      sessionT -= dt; pt += dt;
      boat.v = 0;
      boat.yaw += Math.sin(t * 0.3) * 0.0004;                // drifting a hair on the swell
      rodRoutine(dt, t, true);
      updateBoat(dt, t); seatTo(); apply(dt);
      if (sessionT < 0 && sub === 'wait') {
        sessionEnd('the lagoon');
        clearProps(); phase = 'back'; wps = [{ x: cn.x + sea.x * 9, z: cn.z + sea.z * 9 }, { x: cn.x + sea.x * 4, z: cn.z + sea.z * 4 }]; wpk = 0; sub = '';
      }
      return;
    }
    if (phase === 'dock') {
      pt += dt;
      const k = smooth(clamp(pt / 3.6, 0, 1));
      boat.x = lerp(boat.x0, cn.x, k); boat.z = lerp(boat.z0, cn.z, k);
      boat.yaw = boat.yaw0 + wrap(cn.yaw - boat.yaw0) * k; boat.v = damp(boat.v, 0, 3, dt);
      paddlePose(dt, 0.6 * (1 - k), true);
      updateBoat(dt, t); seatTo(); apply(dt);
      if (pt > 3.6) { phase = 'exit'; pt = 0; paddle.visible = false; }
      return;
    }
    if (phase === 'exit') {
      pt += dt;
      const k = smooth(clamp(pt / 1.6, 0, 1));
      const sx = boat.x + Math.sin(boat.yaw) * 0.25, sz = boat.z + Math.cos(boat.yaw) * 0.25;
      x = lerp(sx, boardSpot.x, k); z = lerp(sz, boardSpot.z, k);
      y = lerp(boat.y + SEAT_Y, getHeight(boardSpot.x, boardSpot.z), k) + 0.28 * Math.sin(k * Math.PI);
      setPose({ py: lerp(0.15, 0.9, k), spX: 0.2 * (1 - k), lPh: lerp(-1.5, -0.2, k), lPk: lerp(1.4, 0.2, k), lNh: lerp(-1.45, 0.1, k), lNk: lerp(1.45, 0.2, k) });
      updateBoat(dt, t); apply(dt);
      if (pt > 1.6) { setCanoeAway(false); phase = 'rest'; pt = 0; x = boardSpot.x; z = boardSpot.z; }
      return;
    }
    // resting on the sand, gazing at the lagoon
    settleY(dt); pt += dt;
    heading = turnTo(heading, Math.atan2(sea.x, sea.z) + 0.4 * Math.sin(t * 0.2), 2 * dt);
    speedNow = damp(speedNow, 0, 6, dt);
    setPose({ aPs: 0.1, aPz: 0.1, aNs: -1.0, aNe: -1.9, aNz: -0.3, hdX: -0.05, hdY: 0.4 * Math.sin(t * 0.25), spY: 0.05 * Math.sin(t * 0.25) });
    updateBoat(dt, t); apply(dt);
  }

  /* ================================================================ CAMP: breakfast coconut / grilled dinner */
  function campUpdate(dt, t) {
    if (phase === 'init') { phase = 'goto'; clearProps(); }
    const sitY = logY + 0.34;
    if (phase === 'goto') {
      settleY(dt);
      const d = step(logPos.x, logPos.z, hurry ? 3.8 : 2.6, dt, inWater);
      if (inWater) swimGait(dt); else gait(dt, speedNow);
      apply(dt);
      if (d < 0.5 || stuck > 8) {
        phase = 'sit'; pt = 0; x = logPos.x; z = logPos.z; hurry = false;
        if (meal === 'dinner') { const n = Math.max(1, Math.min(3, caught.length)); spitFish.forEach((f, i) => { f.visible = i < n && caught[i] !== 'rat'; tint(f, 0); spitRat[i].visible = i < n && caught[i] === 'rat'; tint(spitRat[i], 0); }); }
      }
      return;
    }
    x = damp(x, logPos.x, 5, dt); z = damp(z, logPos.z, 5, dt); y = damp(y, sitY, 8, dt);
    heading = turnTo(heading, Math.atan2(camp.x - logPos.x, camp.z - logPos.z), 3 * dt);
    pt += dt;
    const sit = { py: 0.12, spX: 0.1, lPh: -1.5, lPk: 1.4, lNh: -1.45, lNk: 1.42, lPz: 0.07, lNz: -0.07 };
    if (phase === 'sit') {
      setPose({ ...sit, py: lerp(0.5, 0.12, smooth(clamp(pt / 1.2, 0, 1))), aPs: -0.5, aNs: -0.5 });
      if (pt > 1.3) { phase = meal === 'breakfast' ? 'drink' : 'cook'; pt = 0; }
    } else if (phase === 'drink') {
      coco.visible = true; setCoconutState(coco, pt < 10 ? 'opened' : 'half');
      const cyc = (pt % 6) / 6;
      const up = cyc < 0.15 ? smooth(cyc / 0.15) : cyc < 0.7 ? 1 : 1 - smooth((cyc - 0.7) / 0.3);
      setPose({ ...sit, aNs: lerp(-0.4, -1.55, up), aNe: lerp(-0.9, -2.1, up), aPs: -0.45, aPe: -0.8, hdX: -0.55 * up, nkX: -0.15 * up, spX: 0.1 - 0.05 * up });
      if (pt > 16) { phase = 'rest'; coco.visible = false; pt = 0; mind.ate('coconut'); mind.note('Drank a coconut by the fire.', null, 0.02); }
    } else if (phase === 'cook') {
      const k = clamp(pt / 18, 0, 1);
      spitFish.forEach((f) => tint(f, k)); spitRat.forEach((r) => tint(r, k));
      const turn = Math.sin(pt * 1.1);
      setPose({ ...sit, aPs: -1.0 + 0.1 * turn, aPe: -0.9 + 0.3 * turn, aNs: -0.55, aNe: -0.8, hdX: 0.3, hdY: 0.1 * Math.sin(pt * 0.5), spX: 0.2 });
      spitRod.rotation.y = axisYaw; spitRod.rotation.z = Math.PI / 2;
      spitFish.forEach((f) => { f.rotation.z = (pt * 0.9) % TAU; }); spitRat.forEach((r) => { r.rotation.z = (pt * 0.9) % TAU; });
      if (pt > 18) { phase = 'eat'; pt = 0; stick.visible = true; const rat = caught[0] === 'rat'; stickFish.visible = !rat; stickRat.visible = rat; tint(stickFish, 1); tint(stickRat, 1); spitFish[0].visible = false; spitRat[0].visible = false; stickFish.scale.setScalar(1.15); stickRat.scale.setScalar(0.95); }
    } else if (phase === 'eat') {
      const cyc = (pt % 4.2) / 4.2;
      const up = cyc < 0.25 ? smooth(cyc / 0.25) : cyc < 0.55 ? 1 : 1 - smooth((cyc - 0.55) / 0.3);
      const bite = cyc > 0.3 && cyc < 0.5 ? Math.abs(Math.sin((cyc - 0.3) * 40)) : 0;
      setPose({ ...sit, aPs: lerp(-0.7, -1.35, up), aPe: lerp(-1.3, -2.25, up), aNs: -0.6, aNe: -1.2, hdX: 0.08 + 0.12 * bite, spX: 0.12 });
      stickFish.scale.set(1.15, 1.15, 1.15 * (1 - clamp(pt / 16, 0, 1) * 0.88)); stickRat.scale.setScalar(0.95 * (1 - clamp(pt / 16, 0, 1) * 0.85));
      if (pt > 16) { const n = Math.min(3, caught.length), eaten = caught.splice(0, n), nRat = eaten.filter((c) => c === 'rat').length, nFish = n - nRat; stick.visible = false; spitFish.forEach((f) => (f.visible = false)); spitRat.forEach((r) => (r.visible = false)); phase = 'rest'; pt = 0; if (nFish) mind.ate('fish', nFish); if (nRat) { mind.ate('rat', nRat); mind.stats.rats += nRat; } mind.note(nRat && nFish ? `Ate ${nFish} grilled fish and ${nRat} roast rat${nRat > 1 ? 's' : ''}.` : nRat ? `Ate ${nRat} roast rat${nRat > 1 ? 's' : ''}.` : `Ate ${nFish} grilled fish.`, null, 0.02); }
    } else {
      setPose({ ...sit, hdX: 0.1 + 0.05 * Math.sin(t * 0.5), hdY: 0.15 * Math.sin(t * 0.23), aPs: -0.35, aNs: -0.25, aPe: -0.8, aNe: -0.6, spX: 0.08 });
      if (pt > 7) mind.finish();                                    // fed and rested: on to the next thing
    }
    if (phase !== 'rest') mind.current.until = Math.max(mind.current.until, mind.clock + 0.3);      // never cut a meal short, or leave it half-walked
    apply(dt);
  }

  /* ================================================================ SHELTER from rain */
  function shelterUpdate(dt, t) {
    if (phase === 'init') { phase = 'goto'; clearProps(); }
    if (phase === 'goto') {
      settleY(dt);
      const d = step(hut.front.x, hut.front.z, hurry ? 4.2 : 3.0, dt, inWater);
      if (inWater) swimGait(dt); else gait(dt, speedNow);
      apply(dt);
      if (d < 0.6 || stuck > 8) { phase = 'sit'; pt = 0; hurry = false; }
      return;
    }
    x = damp(x, hut.mat.x + (hut.front.x - hut.mat.x) * 0.2, 3, dt); z = damp(z, hut.mat.z + (hut.front.z - hut.mat.z) * 0.2, 3, dt);
    y = damp(y, hut.mat.y, 6, dt);
    heading = turnTo(heading, hut.yaw, 3 * dt);
    pt += dt;
    const k = smooth(clamp(pt / 1.3, 0, 1));
    setPose({ py: lerp(0.6, 0.12, k), spX: 0.18, lPh: -1.5, lPk: 1.5, lNh: -1.5, lNk: 1.5, lPz: 0.15, lNz: -0.15, aPs: -0.6, aPe: -2.0, aNs: -0.6, aNe: -2.0, hdX: -0.12 + 0.05 * Math.sin(t * 0.4), hdY: 0.35 * Math.sin(t * 0.3) });
    apply(dt);
  }

  /* ================================================================ DRINK: a habit, not a need. Fresh water from cupped hands, or the water of a coconut he has beaten the monkeys to */
  let dSpot = null, dKind = 'fresh', dNut = null, sips = 0;
  const badFresh = new Set();
  function nearestFresh() {
    let best = null, bd = 1e9;
    for (const q of freshSpots) { if (badFresh.has(q) || unsafeAt(q.stand.x, q.stand.z, 22)) continue; const d = Math.hypot(q.stand.x - x, q.stand.z - z); if (d < bd) { bd = d; best = q; } }
    return best || freshSpots[0];
  }
  const _aw = { x: 0, z: 0 }, _nw = V();
  let walkT = 0;
  const nextNut = () => (eco.coconuts ? eco.coconuts.free(x, z, 45, true) : null);
  // a coconut he cannot get (a monkey was faster, or it is too far) is not worth a long chase: he drinks fresh water instead
  const toFresh = () => { if (!(ctx && ctx.freshOK)) return false; dKind = 'fresh'; dNut = null; dSpot = nearestFresh(); phase = 'goto'; walkT = 0; sips = 0; stuck = 0; mind.memory.lastKind = 'coconut'; return true; };
  let drinkT = 0;
  function drinkUpdate(dt, t) {
    // a drink he cannot get to (every spot he tries is out of reach) is given up after a while and tried again later, never repeated without end
    if (phase !== 'init') {
      drinkT += dt;
      if (drinkT > 70 && (phase === 'goto' || phase === 'edge')) { mind.memory.lastDrink = mind.clock - 0.55 * 5.5; mind.note('Could not reach water for a drink; he will try again later.', null, -0.02); mind.finish(); return; }
    }
    if (phase === 'init') {
      dKind = mind.drinkKind(ctx); dNut = null; dSpot = null; sips = 0; walkT = 0; drinkT = 0;
      if (dKind === 'coconut') { dNut = nextNut(); if (!dNut) dKind = ctx.freshOK ? 'fresh' : 'none'; }
      if (dKind === 'none') { mind.memory.lastDrink = mind.clock - 1.5; mind.finish(); return; }          // nothing to drink just now: ask again later
      if (dKind === 'fresh') dSpot = nearestFresh();
      phase = 'goto'; clearProps();
    }
    if (dKind === 'coconut') { nutDrink(dt, t); return; }
    if (phase !== 'rise') mind.current.until = Math.max(mind.current.until, mind.clock + 0.3);      // he finishes his drink, however far the water is
    if (phase === 'goto' || phase === 'edge') {
      settleY(dt);
      let d;
      if (phase === 'goto') {
        d = step(dSpot.stand.x, dSpot.stand.z, hurry ? 3.8 : 2.9, dt, inWater);
        walkT += dt;
        if (d < 1.2) { phase = 'edge'; pt = 0; stuck = 0; }
      } else {          // walk the last few steps to the water's edge
        pt += dt; d = step(dSpot.target.x, dSpot.target.z, 1.5, dt, false);
        _aw.x = x + Math.sin(heading) * 0.95; _aw.z = z + Math.cos(heading) * 0.95;
        if (waterAt(_aw.x, _aw.z) != null || pt > 7 || stuck > 2) { phase = 'kneel'; pt = 0; hurry = false; }
      }
      if (stuck > 7 || walkT > 45) { walkT = 0; badFresh.add(dSpot); if (badFresh.size >= freshSpots.length) badFresh.clear(); phase = 'init'; stuck = 0; }
      if (inWater) swimGait(dt); else move(dt);
      apply(dt); return;
    }
    settleY(dt); pt += dt;
    speedNow = damp(speedNow, 0, 8, dt);
    heading = turnTo(heading, Math.atan2(dSpot.target.x - x, dSpot.target.z - z), 2.5 * dt);
    if (phase === 'kneel' || phase === 'drink') {
      const k = smooth(clamp(pt / 1.2, 0, 1));
      const sq = { py: lerp(0.9, 0.46, k), spX: 0.55 * k, lPh: -1.25 * k, lPk: 1.95 * k, lNh: -1.15 * k, lNk: 1.9 * k, lPz: 0.1 * k, lNz: -0.1 * k };
      if (pt < 1.2) setPose({ ...sq, aPs: -0.5 * k, aNs: -0.5 * k });
      else {
        if (phase === 'kneel') { phase = 'drink'; pt = 1.2; }
        const cyc = ((pt - 1.2) % 3.0) / 3.0;
        const lift = cyc < 0.25 ? 0 : cyc < 0.5 ? smooth((cyc - 0.25) / 0.25) : cyc < 0.85 ? 1 : 1 - smooth((cyc - 0.85) / 0.15);
        const reach = cyc < 0.25 ? smooth(cyc / 0.25) : 1 - lift;
        setPose({ ...sq, spX: 0.55 + 0.25 * reach - 0.2 * lift, aPs: lerp(-0.6, -1.85, reach) - 0.3 * lift, aPe: lerp(-0.9, -0.15, reach) - 1.3 * lift, aNs: lerp(-0.6, -1.85, reach) - 0.3 * lift, aNe: lerp(-0.9, -0.15, reach) - 1.3 * lift, aPz: 0.18, aNz: -0.18, hdX: 0.1 - 0.35 * lift, nkX: 0.05 });
        if (cyc < 0.04 && !drinkUpdate.dipped) { drinkUpdate.dipped = true; sips++; _aw.x = x + Math.sin(heading) * 0.9; _aw.z = z + Math.cos(heading) * 0.9; fx.plink(_aw.x, _aw.z, 0.7); fx.splash(_aw.x, waterAt(_aw.x, _aw.z) ?? 0, _aw.z, 0.1); }
        if (cyc > 0.1) drinkUpdate.dipped = false;
        if ((sips >= 3 && cyc > 0.88) || pt > 24) { phase = 'rise'; pt = 0; }
      }
    } else {                                  // rise, wipe his mouth, done
      const k = smooth(clamp(pt / 1.2, 0, 1));
      setPose({ py: lerp(0.46, 0.9, k), spX: 0.4 * (1 - k), lPh: -1.25 * (1 - k), lPk: 1.95 * (1 - k), lNh: -1.15 * (1 - k), lNk: 1.9 * (1 - k), aPs: -0.3, aPe: -2.0 * (1 - k) - 0.3 * Math.sin(pt * 6) * (1 - k), hdX: -0.1 });
      if (pt > 1.8) { mind.drank('fresh'); mind.note('Had a drink at ' + dSpot.name + '.', null, 0.03); mind.finish(); }
    }
    apply(dt);
  }
  // the coconut: run for it (a monkey may be after the same one), knock it open, drink
  function nutDrink(dt, t) {
    if (phase !== 'rise') mind.current.until = Math.max(mind.current.until, mind.clock + 0.3);
    if (phase === 'goto') {
      settleY(dt);
      let p = eco.coconuts.where(dNut, _nw);
      if (!p) {                                                  // a monkey (or the wind) got it first
        dNut = nextNut(); mind.memory.lastKind = 'coconut';       // next time it will be fresh water
        if (!dNut) { mind.note('A monkey snatched the coconut he was after.', null, -0.04); if (!toFresh()) mind.finish(); return; }
        p = eco.coconuts.where(dNut, _nw);
        if (!p) { if (!toFresh()) mind.finish(); return; }
      }
      walkT += dt;
      const d = step(p.x, p.z, d0(p) > 6 ? 5.2 : 3.4, dt, false);
      if (d > 5) run(dt, Math.max(speedNow, 3)); else gait(dt, speedNow);
      if (d < 0.9) {
        if (eco.coconuts.take(dNut)) { phase = 'crack'; pt = 0; coco.visible = true; setCoconutState(coco, 'whole'); hurry = false; stuck = 0; }
        else { dNut = nextNut(); if (!dNut) { mind.note('A monkey snatched the coconut he was after.', null, -0.04); if (!toFresh()) mind.finish(); return; } }
      }
      if (walkT > 22 || stuck > 6) { if (!toFresh()) { mind.memory.lastKind = 'coconut'; mind.finish(); } return; }
      apply(dt); return;
    }
    settleY(dt); pt += dt;
    speedNow = damp(speedNow, 0, 8, dt);
    if (phase === 'crack') {
      const hit = Math.max(0, Math.sin(pt * 8));
      setPose({ py: 0.84, spX: 0.28, hdX: 0.45, lPh: -0.15, lNh: 0.1, lPk: 0.2, lNk: 0.2, aPs: -1.2 - 0.5 * hit, aPe: -1.2, aNs: -1.0, aNe: -1.5 });
      if (pt > 2.4) { phase = 'sip'; pt = 0; setCoconutState(coco, 'opened'); }
    } else if (phase === 'sip') {
      const cyc = (pt % 5) / 5;
      const up = cyc < 0.18 ? smooth(cyc / 0.18) : cyc < 0.72 ? 1 : 1 - smooth((cyc - 0.72) / 0.28);
      setPose({ aNs: lerp(-0.4, -1.55, up), aNe: lerp(-0.9, -2.1, up), aPs: -0.45, aPe: -0.8, hdX: -0.55 * up, nkX: -0.15 * up, spX: 0.06 - 0.04 * up });
      if (pt > 12) { coco.visible = false; mind.drank('coconut'); mind.note('Drank the sweet water of a coconut he won from the monkeys.', null, 0.05); phase = 'rise'; pt = 0; }
    } else {
      setPose({ aPs: -0.3, aPe: -0.9 - 0.3 * Math.sin(pt * 6) * (1 - clamp(pt / 1.4, 0, 1)), hdX: -0.1 });
      if (pt > 1.4) mind.finish();
    }
    apply(dt);
  }
  const d0 = (p) => Math.hypot(p.x - x, p.z - z);

  /* ================================================================ HUNT: creep up on a rat that is out in the open and spear it, to be cooked at the fire */
  let hRat = null, hHeld = null, hTries = 0, hKills = 0, hLost = 0, hStruck = false;
  const spearHolder = { heading: 0, heldPos: (out) => spearTip.getWorldPosition(out) };
  function endHunt() {
    eco.stalking = false;
    if (hHeld && hHeld.holder === spearHolder) { hHeld.holder = null; hHeld.flee({ x, z }); }
    hHeld = null; hRat = null;
  }
  function huntUpdate(dt, t) {
    if (phase === 'init') { hRat = null; hHeld = null; hTries = 0; hKills = 0; hLost = 0; phase = 'goto'; clearProps(); pt = 0; walkT = 0; eco.stalking = false; }
    spear.visible = true;
    if (phase === 'strike' || phase === 'show') mind.current.until = Math.max(mind.current.until, mind.clock + 0.2);
    const base = { lPh: -0.2, lNh: 0.12, lPk: 0.22, lNk: 0.2, lPz: 0.11, lNz: -0.11 };
    if (phase === 'goto') {
      settleY(dt);
      if (!hRat || !hRat.exposed()) {
        hRat = eco.ratNear(x, z, 45, (r) => !unsafeAt(r.x, r.z, 22));
        eco.stalking = false;
        if (!hRat) {                                              // nothing out in the open: wait a moment, then give up
          hLost += dt; speedNow = damp(speedNow, 0, 6, dt);
          setPose({ ...base, aPs: -1.1, aPe: -0.5, aNs: -1.0, aNe: -0.5, spX: 0.2, hdX: 0.2, hdY: 0.6 * Math.sin(t * 0.8) });
          if (hLost > 7) { mind.note('The rats stayed down.', null, -0.03); endHunt(); mind.finish(); }
          apply(dt); return;
        }
        hLost = 0;
      }
      const dx = hRat.x - x, dz = hRat.z - z, d = Math.hypot(dx, dz);
      eco.stalking = d < 10;
      if (d < 7) mind.current.until = Math.max(mind.current.until, mind.clock + 0.15);        // a rat almost in reach: he finishes the stalk
      step(hRat.x, hRat.z, d > 12 ? 3.6 : 1.6, dt, false);
      gait(dt, speedNow);
      if (eco.stalking) { P.py = 0.8; P.spX = 0.3; P.aPs = -1.1; P.aPe = -0.5; P.aNs = -1.0; P.aNe = -0.5; }
      walkT += dt;
      if (d < 2.0) { phase = 'strike'; pt = 0; hStruck = false; }
      else if (walkT > 40 || stuck > 6) { endHunt(); mind.finish(); }
      apply(dt); return;
    }
    settleY(dt); pt += dt;
    speedNow = damp(speedNow, 0, 10, dt);
    if (phase === 'strike') {
      if (hRat) heading = turnTo(heading, Math.atan2(hRat.x - x, hRat.z - z), 8 * dt);
      const k = clamp(pt / 0.75, 0, 1), th = k < 0.28 ? k / 0.28 : 1 - smooth((k - 0.28) / 0.72) * 0.25;
      setPose({ ...base, py: 0.8 - 0.05 * th, spX: 0.4 + 0.3 * th, hdX: 0.55, aPs: -1.3 - 0.5 * th, aPe: -0.4 + 0.3 * th, aNs: -1.15 - 0.4 * th, aNe: -0.5 + 0.2 * th });
      if (k > 0.28 && !hStruck) {
        hStruck = true; hTries++;
        spearTip.getWorldPosition(_tip);
        if (hRat && hRat.exposed() && Math.hypot(hRat.x - x, hRat.z - z) < 2.6 && rnd() < (hRat.state === 'flee' || hRat.state === 'run' ? 0.4 : 0.66)) { spearHolder.heading = heading; hRat.caught(spearHolder); hHeld = hRat; }
        else if (hRat && hRat.exposed()) hRat.flee({ x, z });
      }
      if (pt > 0.95) {
        if (hHeld) { phase = 'show'; pt = 0; }
        else { phase = 'goto'; hRat = null; walkT = 0; if (hTries >= 4) { mind.note('The rats were too quick.', null, -0.04); endHunt(); mind.finish(); } }
      }
    } else {                                   // show: holds the speared rat up for a moment, then into the basket
      spearHolder.heading = heading;
      setPose({ ...base, spX: -0.05, hdX: -0.15, py: 0.9, aPs: -1.7 + 0.2 * Math.sin(t * 5), aPe: -0.2, aNs: -1.5, aNe: -0.3 });
      if (pt > 2.4) {
        eco.stalking = false;
        hHeld.consume(); hHeld = null; hKills++; caught.push('rat'); mind.note('Speared a rat.', 'hunt', 0.06, true);
        hRat = null; phase = 'goto'; walkT = 0;
        if (hKills >= 2 || caught.length >= 4) { endHunt(); mind.finish(); }
      }
    }
    apply(dt);
  }

  /* ================================================================ FLEE: sprint away from a boar */
  let fleeTo = { x: 0, z: 0 }, fleeRe = 0;
  function pickFleeTarget(threat) {
    const away = Math.atan2(x - threat.x, z - threat.z);
    let best = null, bs = -1e9;
    for (let k = 0; k < 14; k++) {
      const a = away + (k - 6.5) * 0.28, r = rr(26, 38), tx = x + Math.sin(a) * r, tz = z + Math.cos(a) * r;
      const h = getHeight(tx, tz);
      if (h < 1.0 || getSlope(tx, tz) > 0.35 || lavaDist(tx, tz) < 20 || Math.hypot(tx - VOL.x, tz - VOL.z) < 55) continue;
      const sc = Math.hypot(tx - threat.x, tz - threat.z) - Math.abs(k - 6.5) * 1.2 + (Math.hypot(camp.x - threat.x, camp.z - threat.z) > 30 && Math.hypot(tx - camp.x, tz - camp.z) < Math.hypot(x - camp.x, z - camp.z) ? 6 : 0);   // toward the camp is safest
      if (sc > bs) { bs = sc; best = { x: tx, z: tz }; }
    }
    fleeTo = best || { x: x + Math.sin(away) * 25, z: z + Math.cos(away) * 25 };
  }
  function fleeUpdate(dt, t) {
    if (phase === 'init') {
      clearProps(); staff.visible = false; me.chest.scale.set(1, 1, 1);
      const th = ctx && ctx.threatC ? ctx.threatC : null;
      if (!th) { mind.finish(); return; }
      pickFleeTarget(th); fleeRe = 0.6; phase = 'run'; pt = 0; speedNow = Math.max(speedNow, 2.5);
      say('shout', 0.6);
    }
    settleY(dt);
    if (phase === 'run') {
      pt += dt; fleeRe -= dt;
      const th = ctx && ctx.threatC;
      if (th && fleeRe < 0) { fleeRe = 0.6; const toward = Math.atan2(th.x - x, th.z - z), mine = Math.atan2(fleeTo.x - x, fleeTo.z - z); if (Math.abs(wrap(toward - mine)) < 1.9) pickFleeTarget(th); }
      const d = step(fleeTo.x, fleeTo.z, 6.2, dt, inWater);
      if (inWater) swimGait(dt); else run(dt, Math.max(speedNow, 3));
      const far = !ctx || !ctx.threatC || ctx.threatC.d > 24;
      if (d < 2 || pt > 14 || (far && pt > 2.5) || stuck > 4) { phase = 'breath'; pt = 0; stuck = 0; }
    } else {
      pt += dt; speedNow = damp(speedNow, 0, 5, dt);
      const heave = Math.sin(t * 9);
      setPose({ py: 0.74, spX: 0.55, hdX: 0.2, hdY: 0.9 * Math.sin(t * 0.8), aPs: 0.3, aNs: 0.3, aPe: -0.4, aNe: -0.4, lPh: -0.5, lNh: -0.4, lPk: 0.9, lNk: 0.8, lPz: 0.1, lNz: -0.1 });
      me.chest.scale.set(1, 1 + 0.03 * heave, 1 + 0.045 * heave);
      if (pt > 3.2) { me.chest.scale.set(1, 1, 1); mind.note('Outran a boar.', null, 0.04); mind.finish(); }
    }
    apply(dt);
  }

  /* ================================================================ CHASE: race after a monkey, just for fun */
  let chaseC = null, chaseT = 0, laughed = false;
  function chaseUpdate(dt, t) {
    if (phase === 'init') {
      if (!ctx || !ctx.monkeyC) { mind.finish(); return; }
      chaseC = ctx.monkeyC; chaseT = rr(9, 14); phase = 'run'; pt = 0; laughed = false; clearProps();
    }
    settleY(dt);
    const m = chaseC && chaseC.sim;
    if (phase === 'run') {
      if (!m || m.state === 'climb' || m.state === 'perch' || m.state === 'descend') { phase = 'laugh'; pt = 0; return; }
      const dist = Math.hypot(m.x - x, m.z - z);
      chaseT -= dt; pt += dt;
      step(m.x, m.z, dist > 7 ? 5.7 : 4.7, dt, false);
      if (inWater) swimGait(dt); else run(dt, Math.max(speedNow, 3));
      if (rnd() < dt * 0.6 && !vocal) say('laugh', 1);
      if (chaseT < 0 || dist > 42 || stuck > 4) { phase = 'laugh'; pt = 0; stuck = 0; }
    } else {
      pt += dt; speedNow = damp(speedNow, 0, 5, dt);
      const heave = Math.sin(t * 8);
      setPose({ py: 0.78, spX: 0.45 + 0.05 * heave, hdX: -0.35, hdY: 0.2 * Math.sin(t * 1.3), aPs: 0.2, aNs: 0.2, aPe: -0.3, aNe: -0.3, lPh: -0.45, lNh: -0.35, lPk: 0.8, lNk: 0.7, lPz: 0.1, lNz: -0.1 });
      me.chest.scale.set(1, 1 + 0.03 * heave, 1 + 0.04 * heave);
      if (!laughed && pt > 0.3) { laughed = true; say('laugh', 1.4); }
      if (pt > 3.6) { me.chest.scale.set(1, 1, 1); mind.note('Had a good laugh chasing a monkey.', null, 0.1); mind.finish(); }
    }
    apply(dt);
  }

  /* ================================================================ voice: whistling and singing when he is happy */
  const say = (kind, dur) => { me.head.getWorldPosition(_hw); events.emit('voice', kind, _hw.x, _hw.y, _hw.z, dur); };
  // what he may whistle or sing during: never mid-sprint, asleep, or with a mouthful
  const CAN_WHISTLE = new Set(['hike', 'fish', 'canoe', 'watch', 'linger', 'camp', 'drink', 'swim', 'dance']);
  const CAN_SING = new Set(['camp', 'linger', 'dance', 'canoe', 'swim', 'hike']);
  function vocalUpdate(dt, t) {
    const hp = mind.needs.happy;
    const ok = act !== 'sleep' && act !== 'flee' && act !== 'chase' && act !== 'shelter' && !(act === 'camp' && (phase === 'eat' || phase === 'drink')) && !(act === 'drink' && phase !== 'goto' && phase !== 'edge') && !(act === 'fish' && (sub === 'bite' || sub === 'reel'));
    if (vocal) {
      vocal.t += dt;
      if (vocal.t > vocal.dur || hp < 0.4 || !ok || !(vocal.kind === 'sing' ? CAN_SING : CAN_WHISTLE).has(act)) vocal = null;
    } else if (ok && hp > 0.55 && (vocalCd -= dt) <= 0) {
      vocalCd = rr(4, 11) * (1.5 - hp);
      if (rnd() < clamp((hp - 0.5) / 0.35, 0, 1)) {
        const wantSing = act === 'dance' ? rnd() < 0.8 : rnd() < 0.42;
        const kind = wantSing && CAN_SING.has(act) ? 'sing' : CAN_WHISTLE.has(act) ? 'whistle' : null;
        if (kind) { vocal = { kind, t: 0, dur: kind === 'sing' ? rr(5, 9) : rr(3, 6) }; say(kind, vocal.dur); noteT = 0; }
      }
    } else if (!ok) vocalCd = Math.max(vocalCd, 2);
    const on = vocal ? Math.min(1, vocal.t * 3, (vocal.dur - vocal.t) * 3) : 0;
    const sing = vocal && vocal.kind === 'sing';
    // head tilts back and sways to the tune; musical notes drift up from him
    vHdX = damp(vHdX, on * (sing ? -0.2 + 0.08 * Math.sin(t * 2.4) : -0.07 + 0.04 * Math.sin(t * 3.1)), 8, dt);
    vHdY = damp(vHdY, on * (sing ? 0.22 : 0.12) * Math.sin(t * 1.15), 8, dt);
    vSpY = damp(vSpY, on * (sing ? 0.06 : 0.03) * Math.sin(t * 1.15 + 0.5), 8, dt);
    if (vocal && (noteT -= dt) < 0) {
      noteT = sing ? rr(0.28, 0.5) : rr(0.4, 0.7);
      me.head.getWorldPosition(_hw);
      fx.sparkle.emit({ x: _hw.x + rr(-0.15, 0.15), y: _hw.y + 0.2, z: _hw.z + rr(-0.15, 0.15), vy: 0.55, vx: rr(-0.2, 0.2), vz: rr(-0.2, 0.2), life: 1.8, s0: 0.2, s1: 0.4, c0: sing ? [1, 0.82, 0.45, 0.85] : [0.8, 0.95, 1, 0.8], c1: [1, 0.7, 0.9, 0], drag: 0.4 });
    }
  }

  /* ================================================================ transitions & main loop */
  function wakeUp(dt) {
    pt += dt;
    if (pt < 1.0) setPose({ py: 0.3, rx: -0.5, spX: 0.4, lPh: -1.4, lPk: 0.3, aPs: -0.6, aNs: -0.6 });
    else if (pt < 2.2) setPose({ py: 0.55, rx: 0, spX: 0.25, lPh: -1.2, lPk: 1.9, lNh: -1.2, lNk: 1.9, aPs: -0.6, aNs: -0.9, aNe: -1.9, hdX: -0.1 });
    else if (pt < 3.4) setPose({ aPs: -0.1, aNs: -2.6, aNe: -0.2, aPz: 1.0, aNz: -0.9, spX: -0.1, hdX: -0.25, py: 0.9 });
    else { sleepWake = false; return false; }
    apply(dt); return true;
  }
  function placeFor(a) {
    act = a; hurry = false; stuck = 0; clearProps();
    if (a === 'project') {
      const site = life.project.state.site || life.project.options.findSite();
      if (site) life.project.state.site = site;
      const start = site ? { x: site.x + 1.8, z: site.z } : spawnNear(camp.x, camp.z);
      x = start.x; z = start.z; y = getHeight(x, z); heading = 0; phase = 'init';
    } else if (a === 'fish') {
      spot = fishable.filter((q) => q.method === 'bank').sort((a, b) => Math.hypot(a.stand.x - camp.x, a.stand.z - camp.z) - Math.hypot(b.stand.x - camp.x, b.stand.z - camp.z))[0] || fishable[0];
      x = spot.stand.x; z = spot.stand.z; y = getHeight(x, z); heading = spot.face; phase = 'work'; sub = 'wait'; pt = 3; waitT = 9; sessionT = 32; newCastTarget();
      bob.pos.copy(bob.to); rod.visible = true; Object.assign(C, STAND);
    } else if (a === 'sleep') { x = hut.mat.x; z = hut.mat.z; y = hut.mat.y; heading = hut.yaw + Math.PI / 2; phase = 'asleep'; Object.assign(C, STAND, { rx: -Math.PI / 2, py: 0.12 }); }
    else if (a === 'canoe') { x = boardSpot.x; z = boardSpot.z; y = getHeight(x, z); heading = 0; phase = 'init'; }
    else if (a === 'swim') { x = COVE.x - 12; z = COVE.z + 4; y = 0; heading = 1; phase = 'swim'; pt = 12; newSwimTarget(); }
    else { meal = env.tod < 12 ? 'breakfast' : 'dinner'; x = camp.x + 3; z = camp.z + 2; y = getHeight(x, z); heading = 0.5; phase = 'init'; }
  }
  /* ================================================================ his mind: what he can see, and what he does with it */
  // what he can see and where, refreshed twice a second for the decision layer
  const _wp = V();
  function buildCtx() {
    let wild = 0, nearC = null, nd = 1e9;
    for (const c of creatures) {
      if (c.id === 'castaway' || c.cat === 'People' || !c.group) continue;
      c.group.getWorldPosition(_wp);
      const d = Math.hypot(_wp.x - x, _wp.z - z);
      if (d < 36) { wild++; if (d < nd) { nd = d; nearC = c; } }
    }
    // dangers and playmates: a boar that means business, and the nearest monkey on the ground
    let threatC = null, td = 1e9, monkeyC = null, md = 50;
    for (const c of creatures) {
      const s = c.sim;
      if (!s || !c.group) continue;
      if (s.isBoar && !s.baby) {
        const d = Math.hypot(s.x - x, s.z - z);
        const sleeping = s.state === 'sleep' || s.state === 'rest' || s.state === 'wallow';
        const bold = s.K.fear === 'bold' || s.defends;
        const r = s.state === 'bluff' || s.charge ? 14 : bold && s.state === 'alert' ? 10 : s.K.fear === 'bold' ? (sleeping ? 6 : 9) : 0;
        if (d < r && d < td && Math.abs(c.group.position.y - y) < 4) { td = d; threatC = { x: s.x, z: s.z, d, name: c.name }; }
      } else if (c.name === 'Capuchin monkey' && (s.state === 'idle' || s.state === 'walk')) {
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < md && Math.abs(c.group.position.y - y) < 3) { md = d; monkeyC = c; }
      }
    }
    // a Pacific boa that is awake and close is a danger too (a snake keeps its distance, a boar charges)
    for (const c of creatures) {
      const s = c.sim;
      if (!s || !s.awake || c.name !== 'Pacific boa') continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < 4.2 && d < td && s.awake()) { td = d; threatC = { x: s.x, z: s.z, d, name: c.name }; }
    }
    if (threatC) lastThreat = { x: threatC.x, z: threatC.z, t: mind.clock };
    const ratT = eco.ratNear(x, z, 45, (r) => !unsafeAt(r.x, r.z, 22));
    const nutT = eco.coconuts ? eco.coconuts.free(x, z, 80, true) : null;
    let freshNear = false;
    for (const q of freshSpots) if (Math.hypot(q.stand.x - x, q.stand.z - z) < 45) { freshNear = true; break; }
    return { hour: env.tod, rain: wx.rain, fishOK: !!(fishSpots && fishSpots.length), canoeOK: !!cn && wx.rain < 0.2, calm: wx.rain < 0.1, wildlife: wild, watchable: nearC ? nearC.name : null, watchC: nearC,
      projectOK: life.project.available(mind.clock), quest: lf.propose(), drives: lf.drivesNow(), huntBoost: mind.clock < huntBoostUntil, novel: (mind.memory.tries.hike || 0) < 5, rockNear: perchesNear(x, z, 35, (p) => p.kind !== 'volcano' && p.r >= 0.45 && p.y - getHeight(p.x, p.z) > 0.5 && p.y - getHeight(p.x, p.z) < 1.5 && !unsafeAt(p.x, p.z, 22)).length > 0, threat: !!threatC, threatC, monkeyC, unsafeCamp: unsafeAt(camp.x, camp.z, 30), unsafeHut: unsafeAt(hut.mat.x, hut.mat.z, 24), freshOK: freshSpots.some((q) => !unsafeAt(q.stand.x, q.stand.z, 22)), freshNear, ratC: !!ratT, coconutOK: !!nutT, caught: caught.length };
  }
  let ctx = null, ctxT = 0, curDh = 0, sessionCatch = 0;
  // where a boar last drove him off: for the next game hour and a bit he keeps clear of that ground
  let lastThreat = null;
  const unsafeAt = (px, pz, r = 24) => !!lastThreat && mind.clock - lastThreat.t < 1.3 && Math.hypot(lastThreat.x - px, lastThreat.z - pz) < r;
  // the place an activity happens, for his memory of favourite places
  const placeName = (a) => (a === 'hike' ? (route[wpi] ? route[wpi].name : 'the jungle')
    : a === 'fish' && spot ? spot.name
    : a === 'canoe' || a === 'swim' ? 'the lagoon'
    : a === 'sleep' || a === 'shelter' ? 'his lean-to'
    : a === 'camp' ? 'the campfire' : a === 'watch' ? 'the wildlife' : a === 'hunt' ? 'the rat burrows' : a === 'drink' ? (dKind === 'coconut' ? 'the coconut palms' : dSpot ? dSpot.name : 'the water') : a === 'chase' ? 'the monkeys’ clearing' : a === 'flee' ? 'a hasty retreat' : 'the shore');
  // a catch: he is pleased, which can tip him into a dance
  const landed = (name) => { caught.push(name); mind.note(`Landed a ${name}.`, act, 0.06, true); };
  const sessionEnd = (where) => { const ok = caught.length > sessionCatch; mind.note(ok ? `A good session at ${where}.` : `No bites at ${where}.`, null, ok ? 0.04 : -0.05); };

  // watching: he turns to follow a nearby animal with his head and body, for as long as it stays close
  let watchC = null, watchName = '';
  function watchUpdate(dt) {
    if (phase === 'init' || !watchC) {
      // start on the nearest animal; if there is none, let the chooser pick something else
      if (!ctx || !ctx.watchC) { phase = 'init'; watchC = null; mind.current.until = mind.clock; return; }
      watchC = ctx.watchC; watchName = watchC.name; phase = 'watch'; pt = 0;
    }
    settleY(dt);
    const g = watchC.group;
    if (!g || g.visible === false) { watchC = null; phase = 'init'; mind.current.until = mind.clock; return; }
    g.getWorldPosition(_wp);
    const dx = _wp.x - x, dz = _wp.z - z, dist = Math.hypot(dx, dz);
    if (dist > 60) { watchC = null; phase = 'init'; mind.current.until = mind.clock; return; }
    heading = turnTo(heading, Math.atan2(dx, dz), 1.2 * dt);
    pt += dt;
    const rel = wrap(Math.atan2(dx, dz) - heading), elev = Math.atan2(_wp.y - (y + 1.4), Math.max(dist, 0.5));
    setPose({ hdY: clamp(rel, -1.2, 1.2), hdX: clamp(-elev, -0.6, 0.4), spY: clamp(rel, -0.5, 0.5) * 0.25, aPs: -0.35, aPe: -0.5, aNs: -0.2, aNe: -0.4, lPz: 0.1, lNz: -0.1 });
    apply(dt);
    if (curDh > 0) mind.watching(watchName, curDh);
  }

  // linger: he sits and takes in the view, with small idle gestures between long pauses
  const LINGER_TEXT = { stretch: 'stretching', yawn: 'yawning', scratch: 'scratching his head', daydream: 'lost in a daydream', scan: 'looking about' };
  const SIT = { py: 0.12, spX: 0.12, lPh: -1.5, lPk: 1.4, lNh: -1.45, lNk: 1.45, lPz: 0.12, lNz: -0.12, aPs: 0.25, aPe: -0.3, aNs: 0.25, aNe: -0.3, hdX: 0.05 };
  let lingerGest = '', gestT = 0, gestNext = 0, rockSeat = null;
  // a boulder he can climb: near, a crown at about chest height, wide enough to sit on, and clear of any boar's patch
  let rockUp = null, rockFrom = { x: 0, z: 0, y: 0 };
  function pickRockSeat() {
    if (rnd() > 0.6) return null;
    const near = perchesNear(x, z, 45, (p) => p.kind !== 'volcano' && p.r >= 0.45 && p.y - getHeight(p.x, p.z) > 0.5 && p.y - getHeight(p.x, p.z) < 1.5 && !unsafeAt(p.x, p.z, 22)).slice(0, 3);
    return near.length ? pick(near) : null;
  }
  function leaveRock() {                    // step down off the boulder: the next activity's settle brings him to the ground
    if (!rockUp) return;
    x = rockUp.x + Math.sin(heading) * (rockUp.r + 0.9); z = rockUp.z + Math.cos(heading) * (rockUp.r + 0.9);
    rockUp = null;
  }
  function lingerUpdate(dt) {
    if (phase === 'init') { rockUp = null; const r = pickRockSeat(); if (r) { rockSeat = r; phase = 'torock'; walkT = 0; stuck = 0; } else phase = 'sit'; pt = 0; gestNext = rr(3, 6); lingerGest = ''; }
    if (phase === 'torock') {
      settleY(dt); walkT += dt;
      mind.current.until = Math.max(mind.current.until, mind.clock + 0.3);
      const d = step(rockSeat.x, rockSeat.z, 2.6, dt, false);
      if (inWater) swimGait(dt); else move(dt);
      apply(dt);
      if (d < rockSeat.r * 1.9 + 1.3 || stuck > 1.2 || walkT > 30) { phase = 'climb'; pt = 0; rockFrom = { x, z, y }; speedNow = 0; }
      return;
    }
    if (phase === 'climb') {
      pt += dt; speedNow = damp(speedNow, 0, 8, dt);
      const k = smooth(clamp(pt / 1.5, 0, 1)), tx = rockSeat.x, tz = rockSeat.z;
      heading = turnTo(heading, Math.atan2(tx - x, tz - z), 5 * dt);
      x = lerp(rockFrom.x, tx, k); z = lerp(rockFrom.z, tz, k);
      y = lerp(rockFrom.y, rockSeat.y, k) + 0.35 * Math.sin(k * Math.PI);      // a scramble up, one hand on the stone
      setPose({ py: lerp(0.9, 0.62, Math.sin(k * Math.PI)), spX: 0.45 * Math.sin(k * Math.PI), aPs: -1.5 * Math.sin(k * Math.PI), aNs: -1.1 * Math.sin(k * Math.PI), aPe: -0.5, aNe: -0.8, lPh: -0.9 * Math.sin(k * Math.PI), lPk: 1.2 * Math.sin(k * Math.PI), lNh: 0.1, lNk: 0.3 });
      mind.current.until = Math.max(mind.current.until, mind.clock + 0.3);
      apply(dt);
      if (pt > 1.5) { rockUp = rockSeat; phase = 'sit'; pt = 0; mind.note('Climbed a boulder for the view.', null, 0.04); }
      return;
    }
    if (rockUp) { x = damp(x, rockUp.x, 6, dt); z = damp(z, rockUp.z, 6, dt); y = damp(y, rockUp.y, 8, dt); } else settleY(dt);
    pt += dt;
    if (!lingerGest && pt > gestNext) { lingerGest = pick(Object.keys(LINGER_TEXT)); gestT = 0; }
    let extra = {};
    if (lingerGest) {
      gestT += dt;
      const dur = lingerGest === 'stretch' ? 3.2 : lingerGest === 'yawn' ? 2.4 : lingerGest === 'scratch' ? 2.6 : lingerGest === 'daydream' ? 4.2 : 4;
      const bump = Math.sin(Math.min(1, gestT / dur) * Math.PI);
      if (lingerGest === 'stretch') extra = { aPs: -2.8 * bump, aNs: -2.8 * bump, aPe: -0.1, aNe: -0.1, spX: 0.12 - 0.3 * bump, hdX: -0.2 * bump };
      else if (lingerGest === 'yawn') extra = { hdX: -0.7 * bump, spX: 0.12 - 0.1 * bump, aPs: 0.25 + 0.4 * bump, aNs: 0.25 + 0.4 * bump };
      else if (lingerGest === 'scratch') extra = { aPs: -2.1 * bump, aPe: -1.9 * bump, hdY: 0.25 * Math.sin(gestT * 6) * bump, hdX: 0.1 };
      else if (lingerGest === 'daydream') extra = { hdX: -0.35 * bump, hdY: 0.5 * Math.sin(gestT * 0.5) };
      else extra = { hdY: 0.8 * Math.sin(gestT * 0.9), hdX: 0.05 };
      if (gestT >= dur) { lingerGest = ''; gestNext = pt + rr(4, 9); }
    }
    setPose({ ...SIT, ...extra });
    apply(dt);
  }

  // dancing: a short, unselfconscious dance; how lively it is follows his mood
  let danceStyle = 0, dph = 0;
  function danceUpdate(dt) {
    if (phase === 'init') { phase = 'dance'; pt = 0; dph = 0; danceStyle = Math.floor(rnd() * 5); mind.danced(); }
    settleY(dt);
    pt += dt;
    dph += dt * (2.0 + 1.6 * clamp(mind.needs.happy, 0, 1));
    const s = Math.sin(dph), c = Math.cos(dph);
    let p = { py: 0.9 + 0.07 * Math.abs(s) };
    if (danceStyle === 0) p = { ...p, spY: 0.22 * s, hdY: 0.25 * s, lPh: 0.35 * s, lNh: -0.35 * s, lPk: 0.3 + 0.3 * Math.max(0, c), lNk: 0.3 + 0.3 * Math.max(0, -c), aPs: -1.2 + 0.5 * c, aNs: -1.2 - 0.5 * c, aPe: -0.9, aNe: -0.9 };
    else if (danceStyle === 1) p = { ...p, spX: -0.06 + 0.06 * s, hdY: 0.3 * s, lPh: 0.2 * s, lNh: -0.2 * s, aPs: -2.2 + 0.25 * s, aNs: -2.2 - 0.25 * s, aPe: -0.4, aNe: -0.4 };
    else if (danceStyle === 3) { heading += dt * 2.2; p = { ...p, spY: 0.12 * s, hdY: 0.2 * s, lPh: 0.3 * s, lNh: -0.3 * s, lPk: 0.3 + 0.35 * Math.max(0, c), lNk: 0.3 + 0.35 * Math.max(0, -c), aPs: -0.5 + 0.2 * s, aNs: -0.5 - 0.2 * s, aPz: 1.35, aNz: -1.35, aPe: -0.3, aNe: -0.3 }; }
    else p = { ...p, spY: 0.3 * s, spX: 0.05, hdX: -0.1, lPh: 0.12 * s, lNh: -0.12 * s, aPs: -0.7 + 0.5 * s, aNs: -0.7 - 0.5 * s, aPe: -1.6 + 0.5 * c, aNe: -1.6 - 0.5 * c };
    setPose(p);
    apply(dt);
  }

  /* ================================================================ his inner life: goals from his own drives (castaway_life.js), run here step by step */
  const lf = createLife({
    camp, hut, mind, pois: () => pois, fire: () => life.actor.structs[0] || null, pos: () => ({ x, z }), ctxNow: () => ctx,
    safe: (p) => !unsafeAt(p.x, p.z, 22) && getHeight(p.x, p.z) > -0.3 && Math.hypot(p.x - VOL.x, p.z - VOL.z) > 40 && lavaDist(p.x, p.z) > 18,
  });
  // what has just happened shows in his upper body for a few seconds, if he is on his feet: a gesture over the walk or the idle
  let layerWish = null;
  const WISHES = [
    [/No bites|too quick|stayed down|Turned back|Could not (get|reach|find)/, ['disappointment', 'frustration', 'sigh']],
    [/Tinkered|Gave up/, ['head_scratch', 'confusion', 'shrug']],
    [/Landed a|Speared a rat|Caught a rat|Worked out|Delighted/, ['excitement', 'laugh_quiet', 'laugh_hearty']],
    [/Finished|Made |Built |Added d|Added 1/, ['nod_yes', 'laugh_quiet']],
    [/Outran a boar|frightening/, ['surprise', 'shake_no']],
    [/Noticed:/, ['look_curious', 'curious_reaction']],
    [/Set out:/, ['nod_yes']],
    [/Drank|Had a drink/, ['wipe_mouth']],
    [/Had a good laugh|laugh/, ['laugh_hearty']],
  ];
  const wishFor = (text) => { for (const [re, names] of WISHES) if (re.test(text)) { layerWish = { name: names[Math.floor(Math.random() * names.length)], until: performance.now() + 9000 }; return; } };
  { const note0 = mind.note; mind.note = (text, a, j, g) => { note0(text, a, j, g); lf.onNote(text, a, j); wishFor(text); }; }
  castawayAI.lf = lf;
  // what the Field Guide shows of his inner life
  { const sum0 = mind.summary; mind.summary = (c) => {
    const m = sum0(c), d = lf.debug(), pct = (v) => Math.round(v * 100) + '%';
    const top = Object.entries(d.drives).sort((a, b) => b[1].appetite - a[1].appetite).slice(0, 3).map(([k, v]) => `${k} (${pct(v.appetite)})`).join(', ');
    m.goal = d.quest ? `${d.quest.label || 'under way'}: ${d.quest.why}` : d.proposal ? `Not yet; thinking about it: ${d.proposal.why}` : d.content > 0 ? 'Content for now' : 'None just now';
    m.drivesText = top;
    const st = d.stored, parts = Object.entries(st).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k === 'curio' ? 'unusual stone' : k}${n > 1 && k !== 'driftwood' ? 's' : ''}`);
    m.collection = parts.length ? parts.join(', ') + ` (${d.collectionTotal} found in all)` : 'Nothing yet';
    const made = [...d.creations, ...d.built]; m.made = made.length ? made.map((k) => lf.DESIGNS[k].label).join('; ') : 'Nothing yet';
    m.skills = Object.entries(d.skills).map(([k, v]) => `${k} ${pct(v)}`).join(', ');
    m.knownPlaces = Object.entries(d.places).filter(([, v]) => v > 0).map(([k, v]) => `${k} (${v})`).join(', ') || 'Not yet';
    return m;
  }; }
  if (nb && window.__castaway) window.__castaway.life = lf;
  if (window.__castaway) window.__castaway.scores = () => ({ scores: mind.scores(ctx), needs: Object.fromEntries(Object.entries(mind.needs).map(([k, v]) => [k, +v.toFixed(2)])), act: mind.current && mind.current.act });
  if (window.__castaway) window.__castaway.state = () => ({ act, phase, sub, meal, x: +x.toFixed(1), z: +z.toFixed(1), y: +y.toFixed(2), stuck: +stuck.toFixed(1), speed: +speedNow.toFixed(2), caught: caught.length, hurry, sleepWake, logPos: { x: +logPos.x.toFixed(1), z: +logPos.z.toFixed(1) } });
  // every clip that a behaviour is wired to (the coverage report compares this with what has actually played)
  coverage.declare({
    idle_relaxed: 'idle rotation; linger', idle_breathe: 'idle rotation', idle_weight_shift: 'idle rotation', idle_look_around: 'idle rotation; quest thinking; linger', walk: 'locomotion', walk_brisk: 'locomotion', run: 'locomotion', sprint_away: 'locomotion; flee',
    walk_start: 'locomotion start; quest walks', walk_stop: 'locomotion stop', walk_brisk_stop: 'locomotion stop', run_stop: 'locomotion stop', walk_staff: 'hike', walk_staff_start: 'hike start; adventure', walk_staff_stop: 'hike stop',
    idle_staff: 'hike idle', idle_staff_lean: 'hike pause', staff_pickup: 'quest: adventure start', wade: 'shallow water',
    turn_left_90: 'quest: facing a target', turn_right_90: 'quest: facing a target', turn_180: 'quest: facing a target',
    sit_down: 'camp; quest: bench', sit_idle: 'quest: bench', rest_by_fire: 'camp rest; project enjoy', tend_fire: 'camp cook; project fuel', eat_food: 'camp eat', coconut_drink: 'drink', coconut_crack: 'drink', wipe_mouth: 'drink',
    kneel_down: 'drink; project; quest kneeling work', kneel_idle: 'project; quest kneeling work', kneel_rise: 'drink; quest', drink_cupped_hands: 'drink',
    lie_down: 'sleep', fall_asleep: 'sleep', sleep_loop: 'sleep', wake_up: 'waking', stretch_after_sleep: 'waking', sit_watching_rain: 'shelter', sit_on_rock: 'linger',
    fish_prepare_rod: 'fish', fish_cast: 'fish', fish_wait_stand: 'fish', fish_bite_reaction: 'fish', fish_reel_in: 'fish', fish_inspect_catch: 'fish; quest: examining a find', fish_reset: 'fish',
    spear_stance_idle: 'fish (spear)', spear_thrust: 'fish (spear)', spear_catch_lift: 'fish (spear); hunt', spear_thrust_ground: 'hunt', stalk_rat: 'hunt',
    canoe_board: 'canoe', canoe_exit: 'canoe', canoe_paddle: 'canoe', canoe_fish_seated: 'canoe', canoe_reel_in: 'canoe', canoe_sit_idle: 'canoe',
    observe_animal: 'watch; quest distraction', birdwatch: 'quest distraction; gesture', curious_reaction: 'gesture', look_curious: 'quest: noticing', track_animals: 'quest: investigate, track', contemplation: 'quest: looking over', look_up_sky: 'quest; gesture',
    high_lookout: 'quest: adventure', look_down_from_height: 'quest: adventure', excitement: 'quest: finds and ideas', celebrate: 'quest: adventure', clap: 'quest: creation', nod_yes: 'quest: creation, build', wave_hello: 'quest: adventure',
    head_scratch: 'quest: failed experiment; gesture', shout: 'quest: adventure summit', shrug: 'quest: failed experiment; gesture', play_kick_sand: 'quest: beach play', play_flex_pose: 'quest: beach play', play_skip: 'quest: beach play', laugh_hearty: 'quest: beach play',
    stretch_standing: 'linger; gesture', yawn: 'linger; gesture', sigh: 'gesture', hum_sing: 'gesture', whistle: 'gesture',
    float_on_back: 'swim', swim_breaststroke: 'swim (unfinished clip, fallback)', chase_monkey: 'chase', laugh_after_chase: 'chase', catch_breath: 'flee',
    dance_sway: 'dance', dance_hop: 'dance', dance_stomp: 'dance', dance_hula: 'dance', dance_twist: 'dance',
  });
  coverage.declareUpper({
    whistle: 'gesture: whistling', hum_sing: 'gesture: singing, content', yawn: 'gesture: tired', sigh: 'gesture: tired; disappointment', shrug: 'gesture: hungry; failed attempt', head_scratch: 'gesture: restless; failed attempt',
    stretch_standing: 'gesture: content', talk_to_self: 'gesture: restless', look_up_sky: 'gesture: sunset hike', birdwatch: 'gesture: bird nearby', observe_animal: 'gesture: animal nearby', curious_reaction: 'gesture: animal nearby; noticed something',
    wave_hello: 'gesture: friendly monkey nearby', look_curious: 'event: noticed something', surprise: 'event: boar scare', shake_no: 'event: boar scare', laugh_quiet: 'event: success', laugh_hearty: 'event: success; good laugh', excitement: 'event: success',
    nod_yes: 'event: finished something; set out', disappointment: 'event: failure', frustration: 'event: failure', confusion: 'event: could not find a way', wipe_mouth: 'event: drink',
  });
  let huntBoostUntil = 0, qs = null, lastDistract = -9;
  // a small object in his right hand while he examines something he picked up
  const held = nb && nb.bones.attach_hand_R ? (() => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    m.visible = false; m.userData.noMerge = true; nb.bones.attach_hand_R.add(m); m.position.set(0, 0.03, 0.05); return m;
  })() : null;
  const showHeld = (kind) => { if (!held) return; held.visible = !!kind; if (kind) held.material.color.setHex(lf.heldColor(kind)); };
  const nonLoop = (clip) => { const m = clipMeta(clip); return !!m && m.loop === false; };
  const FACE = { curious: { brow_L: 0.55, brow_R: 0.15, squint: 0.2, eye_pitch: -0.2 }, friendly: 'friendly', grin: 'grin', laugh: 'laugh', surprise: 'surprise', neutral: 'neutral' };
  let qFace = null;

  // Walking a quest leg: short hops along a route that goes round trees, boulders and steep ground (Codex's bounded local planner, one segment at a
  // time, so no frame pays for a whole-island search). Where no route is found he walks straight at it and lets the usual obstacle-avoidance cope.
  function standable(p) {
    if (getHeight(p.x, p.z) < 0.15 || getSlope(p.x, p.z) > 0.55 || lavaDist(p.x, p.z) < 6) return false;
    const t = { x: p.x, z: p.z }; resolveColliders(t, 0.42);
    return Math.hypot(t.x - p.x, t.z - p.z) < 0.05;
  }
  function planSegment(from, goal) {
    const d = Math.hypot(goal.x - from.x, goal.z - from.z);
    if (d < 1.2) return [];
    const last = d <= 26, dx = (goal.x - from.x) / d, dz = (goal.z - from.z) / d;
    for (const off of last ? [0] : [0, 9, -9, 18, -18]) {
      const t2 = last ? goal : { x: from.x + dx * 24 - dz * off, z: from.z + dz * 24 + dx * off };
      if (!last && !standable(t2)) continue;
      const seg = findProjectPath(from, t2, standable, getHeight);
      if (seg) return seg;
    }
    return null;
  }
  function walkToward(gx, gz, spd, dt) {
    if (!qs.route || !qs.route.length) {
      const tp = performance.now();
      const seg = planSegment({ x, z }, { x: gx, z: gz });
      const tm = performance.now() - tp; cost.routeMaxMs = Math.max(cost.routeMaxMs || 0, tm); cost.routeCalls = (cost.routeCalls || 0) + 1; cost.routeMs = (cost.routeMs || 0) + tm;
      qs.route = seg && seg.length ? seg.slice() : [{ x: gx, z: gz }];
    }
    const wp = qs.route[0];
    step(wp.x, wp.z, spd, dt, false);
    if (Math.hypot(wp.x - x, wp.z - z) < 1.0 && qs.route.length) qs.route.shift();
  }
  function questEnd(ok, text) {
    showHeld(null); qFace = null; qs = null; staff.visible = false;
    lf.finish(ok, text);
    mind.finish();
  }
  function questUpdate(dt, t) {
    if (phase === 'run' && !lf.quest) phase = 'init';      // the quest ended (or was replaced) while the mind kept him on this activity: take up the next proposal, if any
    if (phase === 'init') {
      const prop = lf.propose();
      if (!prop) { mind.finish(); return; }
      if (prop.quest) lf.resume(); else lf.start(prop);
      qs = { clip: null, ts: 1, t: 0, stepI: -1, fired: false, turnT: 0, turnClip: null, startFx: 0, hold: null };
      phase = 'run'; clearProps(); walkT = 0;
    }
    const q = lf.quest;
    if (!q || !qs) { mind.finish(); return; }
    mind.current.until = Math.max(mind.current.until, mind.clock + 0.3);
    q.touched = mind.clock;
    settleY(dt);
    const s = q.steps[q.i];
    if (!s) { questEnd(true, q.madeText || (q.exp && q.exp.text) || `Finished: ${q.why}.`); return; }
    if (qs.stepI !== q.i) { qs.stepI = q.i; qs.t = 0; qs.fired = false; qs.route = null; qs.turnT = 0; qs.turnClip = null; qs.arrive = 0; qs.startFx = (s.t === 'goto' || s.t === 'skipwalk') && speedNow < 0.3 ? 1 : 0; qs.d0 = s.x !== undefined ? Math.hypot(s.x - x, s.z - z) : 0; qFace = s.face || null; if (s.hold !== undefined) qs.hold = s.hold; else if (s.t !== 'anim' && s.t !== 'look') qs.hold = null; }
    qs.t += dt;
    sub = s.t + ':' + q.kind;
    const next = () => { q.i++; };
    qs.clip = null; qs.ts = 1;
    const turnToward = (at, secs = 0.9) => {
      const want = Math.atan2(at.x - x, at.z - z), ang = wrap(want - heading);
      if (!qs.turnClip && qs.turnT === 0 && Math.abs(ang) > 1.1 && speedNow < 0.4) { qs.turnClip = Math.abs(ang) > 2.6 ? 'turn_180' : ang > 0 ? 'turn_left_90' : 'turn_right_90'; qs.turnT = secs; qs.turnTotal = ang; }
      if (qs.turnT > 0) { qs.turnT -= dt; heading = wrap(heading + qs.turnTotal * dt / secs); qs.clip = qs.turnClip; return true; }
      heading = turnTo(heading, want, 3 * dt);
      return false;
    };
    if (s.t === 'goto' || s.t === 'skipwalk') {
      const spd = s.t === 'skipwalk' ? 1.8 : s.speed || (s.staff ? 2.3 : 2.6);
      const d = Math.hypot(s.x - x, s.z - z);
      if (qs.t > qs.d0 / 1.6 + 20 || stuck > 7) {
        if (s.wander) { lf.S.stats.blocked = (lf.S.stats.blocked || 0) + 1; lf.blockedPlace(s.poi); stuck = 0; next(); return; }      // a long walk that hits rough ground carries on from where he got to
        questEnd(false, `Could not get to ${s.label || 'where he was going'}.`); return;
      }
      if (s.staff) staff.visible = true;
      if (d < (s.t === 'skipwalk' ? 1.4 : 1.1)) {
        speedNow = damp(speedNow, 0, 6, dt);
        qs.arrive += dt;
        if (speedNow < 0.15 || qs.arrive > 0.8) next();
        return;
      }
      walkToward(s.x, s.z, spd, dt);
      if (s.t === 'skipwalk') { qs.clip = 'play_skip'; qs.ts = Math.max(0.6, speedNow / 1.8); }
      else if (qs.startFx > 0) { qs.startFx -= dt * 0.7; qs.clip = s.staff ? 'walk_staff_start' : 'walk_start'; }
      // on a long walk he stops now and then to watch what lives nearby
      if (s.wander && ctx && ctx.watchC && mind.clock - lastDistract > 1.2 && qs.t > 6 && Math.random() < dt * 0.05) {
        const g = ctx.watchC.group.position, dd = Math.hypot(g.x - x, g.z - z);
        if (dd > 7 && dd < 30 && !unsafeAt(g.x, g.z, 14)) {
          lastDistract = mind.clock; mind.watching(ctx.watchC.name, 0.05);
          q.steps.splice(q.i, 0, { t: 'look', clip: ctx.watchC.cat === 'Birds' ? 'birdwatch' : 'observe_animal', at: { x: g.x, z: g.z }, secs: 5, face: 'curious', label: `stopping to watch the ${ctx.watchC.name.toLowerCase()}` });
        }
      }
      return;
    }
    if (s.t === 'event') {
      if (s.do === 'discover') lf.discover(s, q);
      else if (s.do === 'experiment-result') { const r = lf.experimentResult(q); q.exp = r; mind.note(r.text, 'quest', r.ok ? 0.06 : -0.01, r.ok); q.steps.splice(q.i + 1, 0, { t: 'anim', clip: r.clip, once: true, face: r.face, label: r.text }); }
      else if (s.do === 'hunt-ready') { huntBoostUntil = mind.clock + 1.5; mind.note('Read the tracks round a rat burrow.', 'quest', 0.02, true); }
      next(); return;
    }
    // 'look' and 'anim' steps: stationary, with a clip. Non-looping clips run to their end; looping ones for `secs`.
    const clip = s.clip, nl = nonLoop(clip), at = s.at || null;
    if (at && s.t === 'look') { if (turnToward(at)) { speedNow = damp(speedNow, 0, 8, dt); return; } }
    else if (at) heading = turnTo(heading, Math.atan2(at.x - x, at.z - z), 3 * dt);
    speedNow = damp(speedNow, 0, 8, dt);
    qs.clip = clip;
    const dur = nl ? (clipMeta(clip) ? clipMeta(clip).duration_s : 2) : (s.secs || 2);
    const kind = s.hold !== undefined ? s.hold : qs.hold; showHeld(kind);
    if (s.event && !qs.fired && qs.t >= (s.event.at || 0) * dur) {
      qs.fired = true; const r = lf.runEvent(s.event, q);
      if (r && r.held) { qs.hold = r.held; showHeld(r.held); }
      if (r && r.text) mind.note(r.text, 'quest', 0.01, true);
      if (r && r.rare) { q.steps[q.steps.length - 1] = { t: 'anim', clip: 'excitement', once: true, face: 'grin', label: 'delighted with his first ' + r.rare }; }
    }
    if (q.staged) lf.stageProgress(qs.t / dur);
    const settled = qs.t > 0.3 && (nl ? nb && nb.name === clip && nb.finished : qs.t >= dur) || qs.t > dur + 2.5;
    if (settled) { if (q.staged) lf.stageProgress(1.01); next(); }
  }

  // ---- which clip expresses what he is doing: act/phase/sub come from the activity code above; speed from the walker
  const IDLES = ['idle_relaxed', 'idle_breathe', 'idle_weight_shift', 'idle_look_around'];
  let idleI = 0, idleT = 0, gaitK = 0;
  function loco(staffOn) {
    const sp = speedNow, up = [0.2, 1.55, 3.1, 4.7], dn = [0.1, 1.35, 2.8, 4.4];
    let k = gaitK;                             // hysteresis, so the gait does not flicker around a threshold
    while (k < 4 && sp > up[k]) k++;
    while (k > 0 && sp < dn[k - 1]) k--;
    gaitK = k;
    if (getHeight(x, z) < -0.1 && !inWater && k > 0) return ['wade', Math.max(0.5, sp / 0.95)];
    if (k === 0) return [staffOn ? 'idle_staff' : IDLES[idleI], 1];
    if (k === 1) return staffOn ? ['walk_staff', sp / 1.2] : ['walk', sp / 1.3];
    if (k === 2) return staffOn ? ['walk_staff', Math.min(1.6, sp / 1.2)] : ['walk_brisk', sp / 1.9];
    return k === 3 ? ['run', sp / 4.3] : ['sprint_away', sp / 5.4];
  }
  const LINGER = { stretching: 'stretch_standing', yawning: 'yawn', 'looking about': 'idle_look_around' };
  const DANCES = ['dance_sway', 'dance_hop', 'dance_stomp', 'dance_hula', 'dance_twist'];
  // starting off and coming to a stop have their own clips; they play out once, then the gait loop takes over
  let gaitFx = null, prevGait = 0, asleepAt = -1, wakeAt = -1;
  function locoFx(staffOn) {
    const r = loco(staffOn), k = gaitK;
    const now = performance.now();
    if (gaitFx && now < gaitFx.until && k === gaitFx.k) return [gaitFx.name, 1];
    gaitFx = null;
    if (prevGait === 0 && k > 0 && k < 3) { const n = staffOn ? 'walk_staff_start' : k === 2 ? 'walk_start' : 'walk_start'; const m = clipMeta(n); if (m) gaitFx = { name: n, until: now + m.duration_s * 1000 * 0.9, k }; }
    else if (prevGait === 3 && k === 0) { const m = clipMeta('run_stop'); if (m) gaitFx = { name: 'run_stop', until: now + m.duration_s * 1000 * 0.9, k }; }
    else if (prevGait > 0 && prevGait < 3 && k === 0) { const n = staffOn ? 'walk_staff_stop' : prevGait === 2 ? 'walk_brisk_stop' : 'walk_stop'; const m = clipMeta(n); if (m) gaitFx = { name: n, until: now + m.duration_s * 1000 * 0.9, k }; }
    prevGait = k;
    return gaitFx ? [gaitFx.name, 1] : r;
  }
  function clipFor() {
    const staffOn = staff.visible;
    const L = () => locoFx(staffOn);
    if (sleepWake) { if (wakeAt < 0) wakeAt = performance.now(); return performance.now() - wakeAt < 1800 ? ['wake_up'] : ['stretch_after_sleep']; }
    wakeAt = -1;
    if (act !== 'sleep') asleepAt = -1;
    switch (act) {
      case 'quest': return qs && qs.clip ? [qs.clip, qs.ts || 1] : L();
      case 'project': {
        const j = life.project.job; if (!j) return L();
        if (Math.hypot(j.target.x - x, j.target.z - z) > 0.85) return L();
        return j.kind === 'enjoy' ? ['rest_by_fire'] : j.kind === 'fuel' ? ['tend_fire'] : j.elapsed < 1.5 ? ['kneel_down'] : ['kneel_idle'];
      }
      case 'hike': return phase === 'pause' ? ['idle_staff_lean'] : L();
      case 'sleep':
        if (phase === 'asleep') { if (asleepAt < 0) asleepAt = performance.now(); return performance.now() - asleepAt < 5200 ? ['fall_asleep'] : ['sleep_loop']; }
        asleepAt = -1;
        return phase === 'lie' ? ['lie_down'] : L();
      case 'camp': return phase === 'sit' ? ['sit_down'] : phase === 'drink' ? ['coconut_drink'] : phase === 'cook' ? ['tend_fire'] : phase === 'eat' ? ['eat_food'] : phase === 'rest' ? ['rest_by_fire'] : L();
      case 'shelter': return phase === 'goto' ? L() : ['sit_watching_rain'];
      case 'fish': {
        if (phase === 'goto' || phase === 'init') return L();
        if (spot && spot.method === 'spear') return sub === 'strike' ? ['spear_thrust'] : sub === 'lift' ? ['spear_catch_lift'] : ['spear_stance_idle'];
        return sub === 'cast' ? ['fish_cast'] : sub === 'bite' ? ['fish_bite_reaction'] : sub === 'reel' ? ['fish_reel_in'] : sub === 'show' ? ['fish_inspect_catch'] : sub === 'release' ? ['fish_reset'] : phase === 'ready' ? ['fish_prepare_rod'] : ['fish_wait_stand'];
      }
      case 'canoe': {
        if (phase === 'goto' || phase === 'init') return L();
        if (phase === 'board') return ['canoe_board'];
        if (phase === 'exit' || phase === 'dock') return ['canoe_exit'];
        if (phase === 'work') return sub === 'bite' || sub === 'reel' ? ['canoe_reel_in'] : sub === 'show' ? ['fish_inspect_catch'] : ['canoe_fish_seated'];
        if (phase === 'launch' || phase === 'settle' || phase === 'back') return ['canoe_paddle', Math.max(0.6, speedNow)];
        return ['canoe_sit_idle'];
      }
      case 'watch': return phase === 'watch' ? ['observe_animal'] : L();
      case 'linger': return rockUp ? ['sit_on_rock'] : lingerGest && LINGER[lingerGest] ? [LINGER[lingerGest]] : speedNow > 0.2 ? L() : ['idle_relaxed'];
      case 'dance': return [DANCES[(danceStyle | 0) % DANCES.length]];
      case 'swim': return phase === 'float' ? ['float_on_back'] : ['swim_breaststroke'];
      case 'drink':
        if (dKind === 'coconut') return phase === 'crack' ? ['coconut_crack'] : phase === 'sip' ? ['coconut_drink'] : phase === 'rise' ? ['wipe_mouth'] : L();
        return phase === 'kneel' ? ['kneel_down'] : phase === 'drink' ? ['drink_cupped_hands'] : phase === 'rise' ? ['kneel_rise'] : L();
      case 'hunt': return phase === 'strike' ? ['spear_thrust_ground'] : phase === 'show' ? ['spear_catch_lift'] : eco.stalking ? ['stalk_rat', Math.max(0.5, speedNow / 0.45)] : L();
      case 'chase': return phase === 'laugh' ? ['laugh_after_chase'] : ['chase_monkey', Math.max(0.8, speedNow / 3.9)];
      case 'flee': return phase === 'breath' ? ['catch_breath'] : ['sprint_away', Math.max(0.8, speedNow / 5.4)];
      default: return L();
    }
  }
  function driveNew(dt) {
    const dn0 = performance.now();
    try { driveNew0(dt); } finally { cost.driveMs += (performance.now() - dn0 - cost.driveMs) * 0.02; }
  }
  function driveNew0(dt) {
    idleT -= dt; if (idleT < 0) { idleT = 8 + Math.random() * 2; idleI = Math.floor(Math.random() * IDLES.length); }
    if (nb.forced) {                           // development only: castaway_new.js coverage.force(name) plays a clip from the console (never counted as autonomous play)
      if (performance.now() < nb.forced.until) { nb.play(nb.forced.name, { forced: true, loop: false }); nb.update(dt); return; }
      nb.forced = null;
    }
    const [name, ts] = clipFor();
    const why = act + '/' + (sub || phase);
    const qf = act === 'quest' && lf.quest && lf.quest.forced;
    if (!nb.play(name, { ts: ts || 1, why, forced: !!qf })) { const [fb, fts] = loco(false); nb.play(fb, { ts: fts, why: why + ' (fallback)' }); }
    expressionTick(dt, why);
    nb.update(dt);
  }

  // ---- expression and gestures: what his face and upper body show follows his mood and what he is doing
  let faceT = 0, layerT = 12, layerCool = 20;
  function faceNow() {
    const m = mind.needs, h = env.tod;
    const clip = nb.name;
    if (act === 'sleep' && (phase === 'asleep' || phase === 'lie')) return ['sleepy', 1];
    if (act === 'flee' && phase !== 'breath') return ['surprise', 0.9];
    if (/^(laugh|celebrate|excitement|clap)/.test(clip) || clip === 'laugh_after_chase') return ['laugh', 0.9];
    if (/^dance_|^play_|^chase_monkey/.test(clip)) return ['grin', 0.85];
    if (vocal && vocal.kind === 'whistle') return ['whistle', 0.9];
    if (act === 'quest' && qFace) return [FACE[qFace] || qFace, 0.9];
    if (/^(frustration|disappointment)/.test(clip)) return ['frown', 0.8];
    if (act === 'camp' && (phase === 'eat' || phase === 'drink')) return ['friendly', 0.35];
    if (m.happy < 0.22) return ['sad', 0.6];
    if (h > 10 && h < 16.5 && wx.rain < 0.1 && act !== 'sleep' && act !== 'shelter' && !inCaveish()) return ['sun_squint', 0.45];
    if (m.happy > 0.7) return ['friendly', 0.7];
    if (m.happy > 0.5) return ['friendly', 0.35];
    return ['neutral', 1];
  }
  const inCaveish = () => false;
  function expressionTick(dt, why) {
    faceT -= dt;
    if (faceT < 0) { faceT = 0.25; const [f, s] = faceNow(); nb.setFace(f, s); }
    if (layerWish && !nb.layerName) {
      if (performance.now() > layerWish.until) layerWish = null;
      else if (nb.layer(layerWish.name, 0.85, { why: act + '/event' })) { nb.lastLayerAt = performance.now(); layerWish = null; return; }
    }
    layerT -= dt;
    if (layerT > 0 || nb.layerName) return;
    layerT = 3 + Math.random() * 3;
    if (performance.now() - (nb.lastLayerAt || 0) < layerCool * 1000) return;
    // a gesture over a standing base loop: whistling or humming as he goes, noticing nearby wildlife, small signs of tiredness or contentment
    const m = mind.needs;
    let pick = null, reason = '';
    if (vocal && (vocal.kind === 'whistle' || vocal.kind === 'sing')) { pick = vocal.kind === 'sing' ? 'hum_sing' : 'whistle'; reason = 'vocal'; }
    else if (ctx && ctx.watchC && act !== 'sleep' && act !== 'flee' && Math.random() < 0.35 && lf.drivesNow().curiosity > 0.3) {
      const g = ctx.watchC.group.position, d = Math.hypot(g.x - x, g.z - z);
      if (d < 26 && d > 4) { pick = ctx.watchC.cat === 'Birds' ? 'birdwatch' : ctx.watchC.name === 'Capuchin monkey' && m.happy > 0.6 && Math.random() < 0.3 ? 'wave_hello' : Math.random() < 0.5 ? 'observe_animal' : 'curious_reaction'; reason = 'wildlife'; }
    } else if (m.fatigue > 0.6 && Math.random() < 0.4) { pick = Math.random() < 0.5 ? 'yawn' : 'sigh'; reason = 'tired'; }
    else if (m.hunger > 0.55 && Math.random() < 0.15) { pick = 'shrug'; reason = 'hungry'; }
    else if (m.happy > 0.72 && Math.random() < 0.2) { pick = Math.random() < 0.5 ? 'hum_sing' : 'stretch_standing'; reason = 'content'; }
    else if (m.boredom > 0.6 && Math.random() < 0.2) { pick = Math.random() < 0.5 ? 'head_scratch' : 'talk_to_self'; reason = 'restless'; }
    else if (env.tod > 17 && env.tod < 19.5 && Math.random() < 0.15 && act === 'hike') { pick = 'look_up_sky'; reason = 'sunset'; }
    if (pick && nb.layer(pick, 0.85, { why: act + '/' + reason })) nb.lastLayerAt = performance.now();
  }

  function projectUpdate(dt, t) {
    const job = life.project.next({ x, z }, mind.clock);
    if (!job) { mind.finish(); return; }
    mind.current.until = Math.max(mind.current.until, mind.clock + .3);
    const d = Math.hypot(job.target.x - x, job.target.z - z);
    if (d > .8) {
      while (job.path?.length > 1 && Math.hypot(job.path[0].x - x, job.path[0].z - z) < .55) job.path.shift();
      const waypoint = job.path?.[0] || job.target;
      lastOff = 0; // Reconsider the direct approach instead of retaining a detour for the entire project walk.
      step(waypoint.x, waypoint.z, 2.4, dt, false); settleY(dt); gait(dt, speedNow); apply(dt);
    } else {
      heading = turnTo(heading, Math.atan2((job.node?.x ?? life.project.state.site.x) - x, (job.node?.z ?? life.project.state.site.z) - z), dt * 3);
      const work = Math.sin(job.elapsed * 7);
      setPose(job.kind === 'enjoy' ? { py: .56, lPh: -1.2, lNh: -1.2, lPk: 1.9, lNk: 1.9, spX: .12 } : { py: .67, spX: .5, lPh: -.6, lNh: -.6, lPk: .9, lNk: .9, aPs: -.8 + work * .15, aNs: -.8 - work * .15, aPe: -.8, aNe: -.8 });
      apply(dt);
    }
    const result = life.project.update(dt, { x, z }, mind.clock, stuck);
    if (result) events.emit('sfx', result.kind === 'gather' ? 'pickup' : result.kind === 'build' ? 'craft' : result.kind === 'fuel' ? 'fire' : 'tap');
    if (result?.completed) mind.finish();
  }

  const castawayStep = (dt0, t) => {
    if (castawayAI.paused) { life.update(0, 0, t, { x, z }, true); lastHours = env.hours; actors.castaway.on = false; return; }
    if (env.paused) return;
    const dt = Math.min(dt0, 0.05);
    const dh = Math.max(0, env.hours - lastHours); lastHours = env.hours; curDh = dh;
    mind.exertion = runFlag ? 1 : 0; runFlag = false;
    mind.tick(dh);
    life.update(dt, dh, t, { x, z }, false);
    lf.update(dt, dh);
    ctxT -= dt;
    if (!ctx || ctxT <= 0) { ctx = buildCtx(); ctxT = 0.5; }
    if (!started) { started = true; placeFor(mind.choose(ctx)); }
    const w = mind.choose(ctx);
    if (w !== act) {
      if (act === 'sleep' && (phase === 'asleep' || phase === 'lie') && w !== 'flee') { if (!sleepWake) { sleepWake = true; pt = 0; me.chest.scale.set(1, 1, 1); } }
      else { mind.visit(placeName(w), w); begin(w); }
    }
    if (sleepWake) {
      if (wakeUp(dt)) { me.group.position.set(x, y, z); me.group.rotation.y = heading; if (nb) driveNew(dt); return; }
      begin(w);
    }
    if (act === 'project') projectUpdate(dt, t);
    else if (act === 'quest') questUpdate(dt, t);
    else if (act === 'sleep') sleepUpdate(dt, t);
    else if (act === 'hike') hikeUpdate(dt, t);
    else if (act === 'swim') swimUpdate(dt, t);
    else if (act === 'fish') fishUpdate(dt, t);
    else if (act === 'canoe') canoeUpdate(dt, t);
    else if (act === 'camp') campUpdate(dt, t);
    else if (act === 'shelter') shelterUpdate(dt, t);
    else if (act === 'watch') watchUpdate(dt);
    else if (act === 'linger') lingerUpdate(dt);
    else if (act === 'dance') danceUpdate(dt);
    else if (act === 'drink') drinkUpdate(dt, t);
    else if (act === 'hunt') huntUpdate(dt, t);
    else if (act === 'chase') chaseUpdate(dt, t);
    else if (act === 'flee') fleeUpdate(dt, t);
    vocalUpdate(dt, t);
    if (nb) driveNew(dt);
    if (act !== 'camp' && (spitFish[0].visible || spitRat[0].visible || spitRat[1].visible || spitRat[2].visible)) { spitFish.forEach((f) => (f.visible = false)); spitRat.forEach((r) => (r.visible = false)); }
    desc = describe() + (vocal && act !== 'sleep' && act !== 'flee' ? (vocal.kind === 'sing' ? ' He is singing to himself.' : ' He is whistling a tune.') : '');
    me.group.position.set(x, y, z);
    me.group.rotation.y = heading;
    const ac = actors.castaway; ac.on = true; ac.x = x; ac.y = y; ac.z = z;
  };
  // the whole castaway update, timed (a running average in milliseconds, for the performance notes: window.__castaway.cost)
  const cost = { ms: 0, driveMs: 0, frames: 0 };
  if (window.__castaway) window.__castaway.cost = cost;
  updaters.push((dt0, t) => { const t0 = performance.now(); castawayStep(dt0, t); cost.ms += (performance.now() - t0 - cost.ms) * 0.02; cost.frames++; });
  return me;
}
