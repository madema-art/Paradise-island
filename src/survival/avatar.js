// The player's castaway: the same sculpted man as the observation mode, driven by hand. Walk/run/swim cycles and a pose for
// every job (picking up, chopping, shaking a palm, drinking, eating, crafting, fishing, spearing, sleeping), plus the tools he holds.
import * as THREE from 'three';
import { createCoconut, setCoconutState } from '../coconut.js';
import { scene } from '../core.js';
import { makeHuman, blob, seg, cone, at } from '../creatures.js';
import { fx } from '../props.js';
import { clamp, damp, lerp } from '../util.js';

const STAND = { py: 0.9, rx: 0, spX: 0, spY: 0, nkX: 0, hdX: 0, hdY: 0, aPs: 0.05, aPe: -0.2, aPz: 0.08, aNs: 0.05, aNe: -0.2, aNz: -0.08, lPh: 0, lPk: 0, lNh: 0, lNk: 0, lPz: 0.03, lNz: -0.03 };
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Avatar {
  constructor() {
    this.me = makeHuman();
    this.group = new THREE.Group();
    this.group.add(this.me.root);
    this.group.visible = false;
    scene.add(this.group);
    this.C = { ...STAND }; this.P = { ...STAND };
    this.ph = 0; this.swPh = 0; this.snap = false; this.t = 0;
    this.held = null;
    this.tip = V();
    this.buildProps();
  }

  /* ------------------------------------------------------------ tools in hand */
  buildProps() {
    const hand = this.me.armR.hand, off = this.me.armL.hand;
    const cord = new THREE.MeshStandardMaterial({ color: '#d9c48e', roughness: 1 });
    const mk = (parent) => { const g = new THREE.Group(); g.visible = false; parent.add(g); return g; };
    // stone axe
    const axe = mk(hand); axe.position.set(0, 0.12, 0.03);
    axe.add(seg(0.016, 0.021, 0.78, '#7a5530', 6));
    at(blob(0.075, '#8b8f93', 1.5, 0.7, 0.8, 7), 0.0, 0.34, 0.0, axe);
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 5, 9), cord); r.rotation.x = Math.PI / 2; r.position.set(0, 0.31 + i * 0.02, 0); axe.add(r); }
    // spear
    const spear = mk(hand); spear.position.set(0, 0.2, 0.03);
    spear.add(seg(0.014, 0.019, 1.9, '#7a5a34', 6));
    const tip = cone(0.032, 0.2, '#b7bcc0', 6); tip.position.y = 1.0; spear.add(tip);
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 5, 9), cord); r.rotation.x = Math.PI / 2; r.position.set(0, 0.88 + i * 0.016, 0); spear.add(r); }
    // fishing rod (grip in the hand, tip forward and up when the arm is raised)
    const rod = mk(hand); rod.rotation.x = -0.3;
    const rm = seg(0.008, 0.02, 2.5, '#3a4a30', 6); rm.position.y = -1.2; rod.add(rm);
    const reel = seg(0.03, 0.03, 0.05, '#555', 8); reel.rotation.z = Math.PI / 2; reel.position.set(0, -0.15, 0.05); rod.add(reel);
    const rodTip = new THREE.Object3D(); rodTip.position.y = -2.45; rod.add(rodTip);
    // torch
    const torch = mk(hand); torch.position.set(0, 0.12, 0.03);
    torch.add(seg(0.02, 0.026, 0.62, '#5a3a22', 6));
    at(blob(0.045, '#2c2018', 1, 1.4, 1, 7), 0, 0.33, 0, torch);
    const torchTip = new THREE.Object3D(); torchTip.position.y = 0.42; torch.add(torchTip);
    // canteen / coconut in the other hand
    const canteen = mk(off); canteen.position.set(0, -0.1, 0.07);
    at(blob(0.085, '#6b4a2a', 1, 1.1, 1, 10), 0, 0, 0, canteen); at(seg(0.02, 0.02, 0.06, '#d9c48e', 6), 0, 0.1, 0, canteen);
    const coco = createCoconut(); coco.visible = false; off.add(coco); coco.position.set(0, -0.1, 0.07);
    // bobber + line for fishing
    const bobber = new THREE.Group(); bobber.visible = false; scene.add(bobber);
    at(blob(0.055, '#f4f1ea', 1, 1, 1, 10), 0, -0.02, 0, bobber); at(blob(0.05, '#e03a2a', 1, 0.7, 1, 10), 0, 0.04, 0, bobber);
    const pts = Array.from({ length: 10 }, () => V());
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf0f4f4, transparent: true, opacity: 0.75 }));
    line.frustumCulled = false; line.visible = false; scene.add(line);
    this.props = { axe, spear, rod, torch, canteen, coco, rodTip, torchTip, bobber, line, lineGeo, pts };
    this.props.all = [axe, spear, rod, torch, canteen, coco];
  }
  hold(kind, off = null) {
    const p = this.props;
    p.axe.visible = kind === 'axe'; p.spear.visible = kind === 'spear'; p.rod.visible = kind === 'rod';
    p.torch.visible = kind === 'torch' || off === 'torch';
    p.canteen.visible = off === 'canteen'; p.coco.visible = off === 'coconut';
    if (kind !== 'rod') { p.bobber.visible = false; p.line.visible = false; }
    this.held = kind;
  }
  /** world position of the rod tip or torch flame */
  rodTipPos(out = this.tip) { this.props.rodTip.getWorldPosition(out); return out; }
  torchPos(out = this.tip) { this.props.torchTip.getWorldPosition(out); return out; }
  handPos(out = this.tip) { this.me.armR.hand.getWorldPosition(out); return out; }
  /** draw the fishing line from the rod tip to a point (or hide it) */
  lineTo(p, sag = 0.35) {
    const P = this.props;
    if (!p) { P.bobber.visible = false; P.line.visible = false; return; }
    this.rodTipPos(this.tip);
    P.bobber.position.copy(p); P.bobber.visible = true; P.line.visible = true;
    for (let i = 0; i < P.pts.length; i++) {
      const f = i / (P.pts.length - 1);
      P.pts[i].lerpVectors(this.tip, p, f); P.pts[i].y -= Math.sin(f * Math.PI) * sag;
    }
    P.lineGeo.setFromPoints(P.pts);
  }

  /* ------------------------------------------------------------ poses */
  setPose(o) { Object.assign(this.P, STAND, o); }
  /** walking / running gait (spd in m/s) */
  gait(dt, spd, run = false, carry = false) {
    this.ph += dt * (2.2 + spd * 1.45);
    const s = Math.sin(this.ph), c = Math.cos(this.ph), a = Math.min(1, spd / 2.4), k = (run ? 0.78 : 0.58) * a;
    this.setPose({
      py: 0.9 - 0.02 * a + 0.03 * Math.cos(this.ph * 2) * a, spX: (run ? 0.14 : 0.05) * a, spY: 0.09 * s * a,
      lPh: -k * s, lNh: k * s, lPk: 0.1 + (run ? 1.0 : 0.75) * Math.max(0, c) * a, lNk: 0.1 + (run ? 1.0 : 0.75) * Math.max(0, -c) * a,
      aPs: carry ? -0.5 : (run ? 0.8 : 0.52) * s * a, aPe: carry ? -1.2 : -0.22 - (run ? 0.8 : 0.35) * Math.max(0, -s) * a,
      aNs: carry ? -0.5 : -(run ? 0.8 : 0.52) * s * a, aNe: carry ? -1.2 : -0.22 - (run ? 0.8 : 0.35) * Math.max(0, s) * a,
    });
    this.snap = false;
  }
  swim(dt, spd) {
    this.swPh += dt * (3.0 + spd * 0.9);
    this.snap = true;
    const w = this.swPh, k = Math.sin(w * 2.2);
    this.setPose({
      rx: Math.PI / 2, py: 0.03 * Math.sin(w * 2), nkX: -0.3, hdX: -0.6 - 0.2 * Math.max(0, Math.sin(w * 0.33)),
      hdY: 0.9 * Math.max(0, Math.sin(w * 0.5 + 1.6)) * (Math.sin(w * 0.25) > 0 ? 1 : -1) * (spd > 0.3 ? 0.4 : 1),
      aPs: w, aPe: -0.9 * Math.max(0, Math.sin(w)), aNs: w + Math.PI, aNe: -0.9 * Math.max(0, Math.sin(w + Math.PI)), aPz: 0.1, aNz: -0.1,
      lPh: 0.28 * k, lNh: -0.28 * k, lPk: 0.2 + 0.2 * Math.max(0, k), lNk: 0.2 + 0.2 * Math.max(0, -k), lPz: 0.04, lNz: -0.04, spY: 0.12 * Math.sin(w),
    });
  }
  idle(t) {
    this.setPose({ hdY: 0.15 * Math.sin(t * 0.6), spX: 0.01 * Math.sin(t * 1.3), aPs: 0.05 + 0.02 * Math.sin(t * 1.3), aNs: 0.05 - 0.02 * Math.sin(t * 1.3) });
    this.snap = false;
  }
  /** a job pose; p = progress 0..1 of the job, t = clock */
  job(kind, p, t) {
    this.snap = false;
    switch (kind) {
      case 'gather': {          // crouch and scoop something off the ground
        const d = Math.sin(p * Math.PI);
        this.setPose({ py: 0.9 - 0.42 * d, spX: 0.85 * d, lPh: -1.05 * d, lPk: 1.6 * d, lNh: -0.7 * d, lNk: 1.15 * d, aPs: -1.0 - 0.7 * d, aNs: -0.8 - 0.5 * d, aPe: -0.5, aNe: -0.4, hdX: 0.25 * d });
        break;
      }
      case 'chop': {
        const c = (p * 3) % 1;                   // three swings
        const up = c < 0.5 ? smooth(c / 0.5) : 1 - smooth((c - 0.5) / 0.18);
        this.setPose({ py: 0.88 - 0.03 * (1 - up), spX: 0.35 * (1 - up) - 0.05, aPs: -0.45 - 2.0 * up, aNs: -0.55 - 1.9 * up, aPe: -0.5 - 0.5 * up, aNe: -0.5 - 0.5 * up, lPh: -0.25, lNh: 0.2, lPk: 0.2, lNk: 0.2, hdX: 0.2 * (1 - up) });
        break;
      }
      case 'shake': {
        const s = Math.sin(t * 15);
        this.setPose({ py: 0.9, spX: -0.12, aPs: -2.85 + 0.12 * s, aNs: -2.85 - 0.12 * s, aPe: -0.35, aNe: -0.35, aPz: 0.1, aNz: -0.1, hdX: -0.5, nkX: -0.15, spY: 0.05 * s });
        break;
      }
      case 'drink': {
        const d = smooth(Math.min(p * 4, 1)) * (1 - smooth((p - 0.85) * 6));
        this.setPose({ py: 0.9 - 0.52 * d, spX: 0.85 * d, lPh: -1.3 * d, lPk: 2.0 * d, lNh: -0.9 * d, lNk: 1.5 * d, aPs: -1.1 * d, aNs: -1.0 * d, aPe: -1.2 - 0.5 * Math.sin(p * 22) * d, aNe: -1.1, hdX: 0.55 * d });
        break;
      }
      case 'eat': {
        if (this.props.coco.visible) setCoconutState(this.props.coco, p < .2 ? 'whole' : p < .62 ? 'opened' : 'half');
        const cyc = (p * 3) % 1;
        const up = cyc < 0.3 ? smooth(cyc / 0.3) : cyc < 0.7 ? 1 : 1 - smooth((cyc - 0.7) / 0.3);
        const bite = cyc > 0.35 && cyc < 0.6 ? Math.abs(Math.sin((cyc - 0.35) * 40)) : 0;
        this.setPose({ aNs: lerp(-0.3, -1.5, up), aNe: lerp(-0.7, -2.3, up), aPs: -0.3, aPe: -0.9, hdX: 0.1 + 0.12 * bite - 0.15 * up, spX: 0.05 });
        break;
      }
      case 'drinkCanteen': {
        const up = smooth(Math.min(p * 3, 1)) * (1 - smooth((p - 0.7) * 3.3));
        this.setPose({ aNs: lerp(-0.3, -1.7, up), aNe: lerp(-0.7, -2.2, up), aPs: -0.3, aPe: -0.9, hdX: -0.5 * up, nkX: -0.1 * up });
        break;
      }
      case 'craft': {
        const w = Math.sin(t * 10);
        this.setPose({ py: 0.42, spX: 0.5, lPh: -1.5, lPk: 1.42, lNh: -1.45, lNk: 1.45, lPz: 0.12, lNz: -0.12, aPs: -1.15 + 0.2 * w, aNs: -1.15 - 0.2 * w, aPe: -0.8, aNe: -0.8, hdX: 0.4 });
        break;
      }
      case 'cook': {
        const turn = Math.sin(t * 2.3);
        this.setPose({ py: 0.5, spX: 0.35, lPh: -1.4, lPk: 1.4, lNh: -1.3, lNk: 1.4, lPz: 0.1, lNz: -0.1, aPs: -1.3 + 0.1 * turn, aNs: -0.9, aPe: -0.9 + 0.3 * turn, aNe: -0.8, hdX: 0.3 });
        break;
      }
      case 'wood': {            // feeding the fire: lean in and toss
        const d = Math.sin(p * Math.PI);
        this.setPose({ py: 0.9 - 0.3 * d, spX: 0.5 * d, aPs: -1.3 * d, aNs: -1.0 * d, aPe: -0.7, aNe: -0.7, lPh: -0.5 * d, lPk: 0.9 * d, hdX: 0.2 * d });
        break;
      }
      case 'cast': {
        const k = clamp(p, 0, 1);
        const sw = k < 0.4 ? -0.95 + 1.1 * (k / 0.4) : 0.15 - 1.5 * smooth((k - 0.4) / 0.35);
        this.setPose({ py: 0.89, spX: -0.05, lPh: -0.14, lNh: 0.12, lPk: 0.12, lNk: 0.16, lPz: 0.1, lNz: -0.1, aPs: clamp(sw, -1.9, 0.2), aPe: -1.0 + (k < 0.4 ? 0.4 : 0), aNs: clamp(sw, -1.9, 0.2) * 0.8, aNe: -1.0, hdX: 0.2 });
        break;
      }
      case 'wait': {
        this.setPose({ py: 0.89, spX: -0.05, lPh: -0.14, lNh: 0.12, lPk: 0.12, lNk: 0.16, lPz: 0.1, lNz: -0.1, aPs: -0.95 + 0.03 * Math.sin(t * 0.8), aPe: -1.25, aNs: -0.85, aNe: -1.15, hdX: 0.3, hdY: 0.1 * Math.sin(t * 0.4) });
        break;
      }
      case 'bite': {
        this.setPose({ py: 0.89, spX: -0.1, lPh: -0.14, lNh: 0.12, lPk: 0.12, lNk: 0.16, aPs: -1.0 - 0.07 * Math.sin(t * 9), aPe: -1.25, aNs: -0.85, aNe: -1.15, hdX: 0.4 });
        break;
      }
      case 'reel': {
        this.setPose({ py: 0.88, spX: -0.12, lPh: -0.3, lNh: 0.2, lPk: 0.2, lNk: 0.2, aPs: -1.35 + 0.1 * Math.sin(t * 8), aPe: -0.9 - 0.4 * Math.sin(t * 7), aNs: -1.0, aNe: -1.0, hdX: 0.35 });
        break;
      }
      case 'show': {
        this.setPose({ aPs: -1.1, aPe: -1.0, aNs: -1.3, aNe: -1.5, hdX: 0.1, hdY: 0.2 });
        break;
      }
      case 'spear': {            // strike down into the water
        const th = p < 0.3 ? p / 0.3 : 1 - smooth((p - 0.3) / 0.7) * 0.2;
        this.setPose({ py: 0.88 - 0.05 * th, spX: 0.32 + 0.4 * th, lPh: -0.2, lNh: 0.12, lPk: 0.22, lNk: 0.2, aPs: -1.25 - 0.35 * th, aPe: -0.45 + 0.3 * th, aNs: -1.1 - 0.35 * th, aNe: -0.5 + 0.2 * th, hdX: 0.5 + 0.2 * th });
        break;
      }
      case 'grab': {
        const d = Math.sin(p * Math.PI);
        this.setPose({ py: 0.9 - 0.35 * d, spX: 0.7 * d, lPh: -0.8 * d, lPk: 1.3 * d, aPs: -1.4 * d, aNs: -1.0 * d, aPe: -0.4, aNe: -0.4, hdX: 0.3 * d });
        break;
      }
      case 'sleep': {
        const br = Math.sin(t * 1.5);
        this.setPose({ py: 0.115 + 0.006 * br, rx: -Math.PI / 2, hdX: 0.02, hdY: 0.45, lPh: 0.0, lPk: 0.28, lNh: 0.03, lNk: 0.12, lPz: 0.14, lNz: -0.12, aPs: 0.05, aPz: 0.28, aPe: -0.12, aNs: -0.5, aNe: -2.1, aNz: -0.05 });
        this.me.chest.scale.set(1, 1 + 0.025 * br, 1 + 0.03 * br);
        return;
      }
      case 'climb': {           // p = phase of the climbing stroke, t = how much he is moving (0..1): reach, pull, reach with the other hand
        const s = Math.sin(p), c = Math.cos(p), m = clamp(t, 0, 1);
        this.setPose({
          py: 0.86 + 0.015 * Math.cos(p * 2) * m, spX: 0.1, hdX: -0.5, nkX: -0.25,
          aPs: -2.15 - 0.55 * s * m, aPe: -0.45 - 0.55 * Math.max(0, -s) * m, aPz: 0.3,
          aNs: -2.15 + 0.55 * s * m, aNe: -0.45 - 0.55 * Math.max(0, s) * m, aNz: -0.3,
          lPh: -0.55 - 0.75 * Math.max(0, c) * m, lPk: 0.5 + 1.0 * Math.max(0, c) * m, lNh: -0.55 - 0.75 * Math.max(0, -c) * m, lNk: 0.5 + 1.0 * Math.max(0, -c) * m, lPz: 0.12, lNz: -0.12,
        });
        break;
      }
      case 'hurt': {
        const d = Math.sin(clamp(p, 0, 1) * Math.PI);
        this.setPose({ py: 0.9 - 0.08 * d, spX: 0.5 * d, hdX: 0.35 * d, aPs: -0.6 * d, aNs: -0.6 * d, aPe: -0.9 * d, aNe: -0.9 * d });
        break;
      }
      case 'cheer': {
        const s = Math.sin(t * 9);
        this.setPose({ py: 0.9 + 0.06 * Math.abs(s), aPs: -2.9 + 0.2 * s, aNs: -2.9 - 0.2 * s, aPe: -0.3, aNe: -0.3, aPz: 0.35, aNz: -0.35, hdX: -0.25 });
        break;
      }
      case 'kneel': {
        this.setPose({ py: 0.5, spX: 0.4, lPh: -1.1, lPk: 1.7, lNh: -0.2, lNk: 1.7, aPs: -0.9, aNs: -0.9, aPe: -0.7, aNe: -0.7, hdX: 0.3 });
        break;
      }
      case 'sit': {
        this.setPose({ py: 0.12, spX: 0.1, lPh: -1.5, lPk: 1.4, lNh: -1.45, lNk: 1.42, lPz: 0.07, lNz: -0.07, aPs: -0.4, aNs: -0.3, aPe: -0.8, aNe: -0.6, hdX: 0.1 + 0.05 * Math.sin(t * 0.5) });
        break;
      }
      default: this.idle(t);
    }
    this.me.chest.scale.set(1, 1, 1);
  }

  /** ease the rig toward the wanted pose and write it onto the bones */
  apply(dt) {
    const C = this.C, P = this.P, me = this.me, r = this.snap ? 40 : 9;
    for (const k in C) C[k] = damp(C[k], P[k], r, dt);
    me.root.rotation.x = C.rx;
    me.root.position.set(0, C.py - 0.9 * Math.cos(C.rx), -0.9 * Math.sin(C.rx));
    me.spine.rotation.set(C.spX, C.spY, 0);
    me.neck.rotation.x = C.nkX; me.head.rotation.set(C.hdX, C.hdY, 0);
    me.armR.rotation.set(C.aPs, 0, C.aPz); me.armR.elbow.rotation.x = C.aPe;
    me.armL.rotation.set(C.aNs, 0, C.aNz); me.armL.elbow.rotation.x = C.aNe;
    me.legR.rotation.set(C.lPh, 0, C.lPz); me.legR.knee.rotation.x = C.lPk; me.legR.foot.rotation.x = clamp(-(C.lPh + C.lPk) * 0.65, -0.9, 0.9);
    me.legL.rotation.set(C.lNh, 0, C.lNz); me.legL.knee.rotation.x = C.lNk; me.legL.foot.rotation.x = clamp(-(C.lNh + C.lNk) * 0.65, -0.9, 0.9);
    // the torch burns
    if (this.props.torch.visible) { this.torchPos(this.tip); fx.flame(this.tip.x, this.tip.y, this.tip.z, 0.9); }
  }

  place(x, y, z, heading, lean = 0) {
    this.group.position.set(x, y, z);
    this.group.rotation.set(lean, heading, 0, 'YXZ');       // lean: forward tilt, for leaning into a wall
  }
  show(v) { this.group.visible = v; if (!v) { this.props.bobber.visible = false; this.props.line.visible = false; } }
}
