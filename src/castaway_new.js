// The new castaway: the Blender character from assets/castaway/ (110-joint skinned body, hair, beard, loincloth), played by one animation mixer
// from the delivered 142-clip library. The old procedural rig keeps running underneath as an invisible driver for the castaway's existing
// logic (human.js); this module only shows what that logic has decided. Props ride on the new rig's attachment bones.
// Models and packs are fetched at run time (they are too big to inline in the bundle). `?castaway=old` keeps the old body.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const DIR = 'assets/castaway/';
const MODEL = { high: 'Castaway.glb', medium: 'Castaway_lod1.glb', low: 'Castaway_lite.glb' };
const PACKS = ['locomotion', 'staff', 'posture', 'survival', 'fishing', 'canoe', 'wildlife', 'personality', 'water', 'climbing'];

let gltf = null, staffGltf = null, meta = null;
const clips = new Map();
export const newCastawayReady = () => !!gltf && !/[?&]castaway=old/.test(location.search);

export async function loadNewCastaway(level = 'high') {
  if (/[?&]castaway=old/.test(location.search)) return false;
  try {
    const loader = new GLTFLoader();
    const [g, s, m] = await Promise.all([
      loader.loadAsync(DIR + (MODEL[level] || MODEL.high)),
      loader.loadAsync(DIR + 'Staff.glb'),
      fetch(DIR + 'castaway_clips.json').then((r) => r.json()),
    ]);
    gltf = g; staffGltf = s; meta = m.clips;
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

/** development-only coverage record: which clips loaded, which the autonomous behaviour has actually played, and which were only forced from the console */
export const coverage = {
  played: {},      // name -> { auto: n, forced: n, behaviours: {act/phase: n} }
  failures: [],
  current: { clip: '', behaviour: '' },
  report() {
    const all = meta ? Object.keys(meta) : [], loaded = all.filter((n) => clips.has(n));
    const auto = all.filter((n) => this.played[n] && this.played[n].auto > 0);
    return {
      total: all.length, loaded: loaded.length, notLoaded: all.filter((n) => !clips.has(n)),
      observedInAutonomousPlay: auto.length, onlyForced: all.filter((n) => this.played[n] && !this.played[n].auto),
      neverTriggered: all.filter((n) => !this.played[n]), failures: this.failures.slice(-20), current: this.current,
      unfinished: all.filter((n) => meta[n].status !== 'verified'),
    };
  },
};
export const clipMeta = (n) => (meta ? meta[n] : null);
export const hasClip = (n) => clips.has(n);

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
  const body = {
    root, mixer, bones, staff, name: '', action: null, meta: null, timeScale: 1,
    /** play a clip with a cross-fade (no-op if it is already playing); returns false if the clip is not loaded yet */
    play(name, { fade, loop, ts = 1, why = '', forced = false } = {}) {
      const clip = clips.get(name);
      if (!clip) { if (coverage.failures.length < 200 && !coverage.failures.some((f) => f.clip === name)) coverage.failures.push({ clip: name, why }); return false; }
      const m = meta && meta[name];
      if (this.name === name) { if (this.action) this.action.timeScale = ts; return true; }
      const rec = coverage.played[name] || (coverage.played[name] = { auto: 0, forced: 0, behaviours: {} });
      if (forced) rec.forced++; else { rec.auto++; rec.behaviours[why] = (rec.behaviours[why] || 0) + 1; }
      coverage.current = { clip: name, behaviour: forced ? 'forced from console' : why };
      const next = mixer.clipAction(clip);
      const lp = loop !== undefined ? loop : !m || m.loop !== false;
      next.reset(); next.enabled = true; next.setEffectiveWeight(1); next.setEffectiveTimeScale(ts);
      next.setLoop(lp ? THREE.LoopRepeat : THREE.LoopOnce, lp ? Infinity : 1); next.clampWhenFinished = !lp;
      const f = fade ?? (m && m.blend ? m.blend.blend_in_s : 0.25);
      if (this.action) { next.crossFadeFrom(this.action, f, false); } else next.fadeIn(f);
      next.play();
      this.action = next; this.name = name; this.meta = m;
      staff.visible = !!(m && m.props && m.props.uses && m.props.uses.includes('staff'));
      return true;
    },
    update(dt) { mixer.update(dt); },
    get finished() { return !!this.action && this.action.loop === THREE.LoopOnce && this.action.time >= this.action.getClip().duration - 0.02; },
  };
  return body;
}
