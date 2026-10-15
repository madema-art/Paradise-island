// The new castaway: the Blender character from assets/castaway/ (110-joint skinned body, hair, beard, loincloth), played by one animation mixer
// from the delivered 142-clip library. The old procedural rig keeps running underneath as an invisible driver for the castaway's existing
// logic (human.js); this module only shows what that logic has decided. Props ride on the new rig's attachment bones.
// Models and packs are fetched at run time (they are too big to inline in the bundle). `?castaway=old` keeps the old body.
//
// Besides the base clip (play), the body can layer an upper-body variant on top of a standing base loop (layer) and hold a facial expression
// (setFace); the face is applied after the mixer each frame, from castaway_face.json.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const DIR = 'assets/castaway/';
const MODEL = { high: 'Castaway.glb', medium: 'Castaway_lod1.glb', low: 'Castaway_lite.glb' };
const PACKS = ['locomotion', 'staff', 'posture', 'survival', 'fishing', 'canoe', 'wildlife', 'personality', 'water', 'climbing'];

let gltf = null, staffGltf = null, meta = null, faceData = null;
const clips = new Map();
export const newCastawayReady = () => !!gltf && !/[?&]castaway=old/.test(location.search);

export async function loadNewCastaway(level = 'high') {
  if (/[?&]castaway=old/.test(location.search)) return false;
  try {
    const loader = new GLTFLoader();
    const [g, s, m, f] = await Promise.all([
      loader.loadAsync(DIR + (MODEL[level] || MODEL.high)),
      loader.loadAsync(DIR + 'Staff.glb'),
      fetch(DIR + 'castaway_clips.json').then((r) => r.json()),
      fetch(DIR + 'castaway_face.json').then((r) => r.json()).catch(() => null),
    ]);
    gltf = g; staffGltf = s; meta = m.clips; faceData = f;
    g.animations.forEach((c) => clips.set(c.name, c));
    return true;
  } catch (e) { console.warn('new castaway failed to load, keeping the old one', e); gltf = null; return false; }
}

/** the other animation packs load in the background after the game starts; a missing clip just falls back until its pack arrives */
export async function loadAnimationPacks() {
  const loader = new GLTFLoader();
  for (const p of PACKS) {
    try { const g = await loader.loadAsync(`${DIR}Castaway_anim_${p}.glb`); g.animations.forEach((c) => clips.set(c.name, c)); } catch (e) { console.warn('animation pack failed', p, e); }
  }
}

/**
 * Development-only coverage record. `declared` is the table of clips a behaviour is wired to (filled by human.js); `played` records every playback, split
 * into the castaway's own autonomous play and clips forced from the console (which prove nothing about behaviour). Upper-body variants are tracked as `upper`.
 */
export const coverage = {
  played: {},      // name -> { auto, forced, behaviours: {why: n} }
  upper: {},       // variant name -> { auto, forced, behaviours }
  declared: {},    // clip name -> behaviour it is wired to
  failures: [],
  current: { clip: '', behaviour: '', upper: '', face: '' },
  transitions: [], // the last 24 base-clip changes
  declare(map) { Object.assign(this.declared, map); },
  report() {
    const all = meta ? Object.keys(meta) : [], loaded = all.filter((n) => clips.has(n));
    const auto = all.filter((n) => this.played[n] && this.played[n].auto > 0);
    const uppers = all.filter((n) => meta[n].upper_body_variant);
    return {
      total: all.length, loaded: loaded.length, notLoaded: all.filter((n) => !clips.has(n)),
      connected: all.filter((n) => this.declared[n]).length,
      observedInAutonomousPlay: auto.length, onlyForced: all.filter((n) => this.played[n] && !this.played[n].auto),
      connectedButNeverPlayed: all.filter((n) => this.declared[n] && !(this.played[n] && this.played[n].auto)),
      neverPlayed: all.filter((n) => !this.played[n]),
      blockedByAssetWork: all.filter((n) => meta[n].status !== 'verified'),
      blockedByUnbuiltGameplay: all.filter((n) => !this.declared[n] && meta[n].status === 'verified'),
      upperVariants: uppers.length, upperLoaded: uppers.filter((n) => clips.has(meta[n].upper_body_variant)).length,
      upperUsedAutonomously: uppers.filter((n) => this.upper[n] && this.upper[n].auto > 0),
      failures: this.failures.slice(-20), current: this.current, recentTransitions: this.transitions.slice(-24),
    };
  },
};
export const clipMeta = (n) => (meta ? meta[n] : null);
export const hasClip = (n) => clips.has(n);

/** the layer-compatible base loops: standing on his feet, so an upper-body variant can sit on top of them without conflicting leg or hip poses */
const LAYER_BASES = new Set(['idle_relaxed', 'idle_breathe', 'idle_weight_shift', 'idle_look_around', 'walk', 'walk_brisk', 'walk_staff', 'idle_staff', 'idle_staff_lean', 'wade']);

export function buildNewBody() {
  if (!newCastawayReady()) return null;
  const root = cloneSkeleton(gltf.scene);
  const bones = {};
  root.traverse((o) => {
    if (o.name) bones[o.name] = o;
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false;
      if (o.material && /hair|beard|brow/i.test(o.material.name || o.name)) { o.material.alphaToCoverage = true; o.material.needsUpdate = true; }
    }
  });
  const mixer = new THREE.AnimationMixer(root);
  // the staff (walking staff, fishing pole, spear) rides on the prop_staff bone and is shown only while the playing clip uses it
  const staff = cloneSkeleton(staffGltf.scene);
  staff.visible = false;
  staff.traverse((o) => { if (o.isMesh) o.castShadow = true; if (/^Staff_(line|hook)$/.test(o.name)) o.visible = false; });
  (bones.prop_staff || root).add(staff);

  // ---- face: bones and their rest state, to reset before each mixer update; weights ease toward their targets
  const face = { bones: [], rest: new Map(), target: {}, cur: {}, blinkT: 2 + Math.random() * 3, blinking: 0, name: '' };
  if (faceData) {
    for (const n of faceData.face_bones || []) { const b = bones[n]; if (b) { face.bones.push(b); face.rest.set(b, { q: b.quaternion.clone(), p: b.position.clone() }); } }
  }
  const ID = new THREE.Quaternion(), _q = new THREE.Quaternion();
  const ctl = {}; if (faceData) for (const c of faceData.controls) ctl[c.key] = c;

  const body = {
    root, mixer, bones, staff, name: '', action: null, meta: null, timeScale: 1, layerName: '', layerAct: null, layerEnds: 0,
    /** play a base clip with a cross-fade (no-op if it is already playing); returns false if the clip is not loaded yet */
    play(name, { fade, loop, ts = 1, why = '', forced = false } = {}) {
      const clip = clips.get(name);
      if (!clip) { if (coverage.failures.length < 200 && !coverage.failures.some((f) => f.clip === name)) coverage.failures.push({ clip: name, why }); return false; }
      const m = meta && meta[name];
      if (this.name === name) { if (this.action) this.action.timeScale = ts; return true; }
      const rec = coverage.played[name] || (coverage.played[name] = { auto: 0, forced: 0, behaviours: {} });
      if (forced) rec.forced++; else { rec.auto++; rec.behaviours[why] = (rec.behaviours[why] || 0) + 1; }
      coverage.current.clip = name; coverage.current.behaviour = forced ? 'forced from console' : why;
      coverage.transitions.push({ t: +(performance.now() / 1000).toFixed(1), from: this.name, to: name, why: forced ? 'forced' : why }); if (coverage.transitions.length > 24) coverage.transitions.shift();
      const next = mixer.clipAction(clip);
      const lp = loop !== undefined ? loop : !m || m.loop !== false;
      next.reset(); next.enabled = true; next.setEffectiveWeight(1); next.setEffectiveTimeScale(ts);
      next.setLoop(lp ? THREE.LoopRepeat : THREE.LoopOnce, lp ? Infinity : 1); next.clampWhenFinished = !lp;
      const f = fade ?? (m && m.blend ? m.blend.blend_in_s : 0.25);
      if (this.action) { next.crossFadeFrom(this.action, f, false); } else next.fadeIn(f);
      next.play();
      this.action = next; this.name = name; this.meta = m;
      staff.visible = !!(m && m.props && m.props.uses && m.props.uses.includes('staff'));
      if (this.layerName && !LAYER_BASES.has(name)) this.layer(null);       // a layered gesture never rides on a seated, kneeling or working base
      return true;
    },
    /** layer an upper-body variant (`<name>__upper`) over a standing base loop at weight w; layer(null) fades it out */
    layer(name, w = 0.85, { why = '', forced = false } = {}) {
      if (!name) {
        if (this.layerAct) { this.layerAct.fadeOut(0.3); this.layerAct = null; }
        this.layerName = ''; coverage.current.upper = ''; return false;
      }
      if (this.layerName === name) return true;
      if (!LAYER_BASES.has(this.name) && !forced) return false;
      const m = meta && meta[name], clip = clips.get(m && m.upper_body_variant ? m.upper_body_variant : name + '__upper');
      if (!clip) return false;
      const rec = coverage.upper[name] || (coverage.upper[name] = { auto: 0, forced: 0, behaviours: {} });
      if (forced) rec.forced++; else { rec.auto++; rec.behaviours[why] = (rec.behaviours[why] || 0) + 1; }
      const a = mixer.clipAction(clip);
      a.reset(); a.enabled = true; a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false;
      a.setEffectiveTimeScale(1); a.setEffectiveWeight(Math.min(8, w / (1 - w)));      // the doc's rule: base 1, overlay w / (1 - w)
      a.fadeIn(0.25); a.play();
      if (this.layerAct) this.layerAct.fadeOut(0.25);
      this.layerAct = a; this.layerName = name; this.layerEnds = performance.now() + clip.duration * 1000;
      coverage.current.upper = name;
      return true;
    },
    /** hold an expression: a preset name from castaway_face.json, or a map of control weights; eases in and out */
    setFace(spec, strength = 1) {
      if (!faceData) return;
      const key = typeof spec === 'string' ? spec : JSON.stringify(spec);
      if (face.name === key + strength) return;
      face.name = key + strength; coverage.current.face = typeof spec === 'string' ? spec : 'custom';
      const src = typeof spec === 'string' ? faceData.presets[spec] || {} : spec;
      face.target = {};
      for (const k in src) face.target[k] = src[k] * strength;
    },
    update(dt) {
      if (this.layerAct && performance.now() > this.layerEnds + 100) { this.layerAct = null; this.layerName = ''; coverage.current.upper = ''; }
      // face bones go back to rest, the mixer writes whatever it animates, then the expression is applied on top
      for (const b of face.bones) { const r = face.rest.get(b); b.quaternion.copy(r.q); b.position.copy(r.p); }
      mixer.update(dt);
      if (!face.bones.length) return;
      face.blinkT -= dt;
      if (face.blinkT < 0) { face.blinking = 0.16; face.blinkT = 2.5 + Math.random() * 4; }
      if (face.blinking > 0) face.blinking -= dt;
      const w = {}, k = 1 - Math.exp(-7 * dt);
      for (const key in face.target) { face.cur[key] = (face.cur[key] || 0) + (face.target[key] - (face.cur[key] || 0)) * k; }
      for (const key in face.cur) if (!(key in face.target)) { face.cur[key] += (0 - face.cur[key]) * k; if (Math.abs(face.cur[key]) < 0.002) delete face.cur[key]; }
      Object.assign(w, face.cur);
      if (face.blinking > 0) { w.blink_L = 1; w.blink_R = 1; }
      for (const key in w) {
        const c = ctl[key]; let v = w[key]; if (!c || !v) continue;
        const set = v >= 0 ? c.pos : c.neg; if (!set) continue; v = Math.abs(v);
        for (const bn in set) {
          const b = bones[bn]; if (!b) continue;
          const d = set[bn];
          b.quaternion.multiply(_q.set(d.q[0], d.q[1], d.q[2], d.q[3]).slerp(ID, 1 - v).normalize());
          b.position.x += v * d.t[0]; b.position.y += v * d.t[1]; b.position.z += v * d.t[2];
        }
      }
    },
    get finished() { return !!this.action && this.action.loop === THREE.LoopOnce && this.action.time >= this.action.getClip().duration - 0.02; },
    get clipTime() { return this.action ? this.action.time : 0; },
    get clipDuration() { return this.action ? this.action.getClip().duration : 0; },
  };
  return body;
}
