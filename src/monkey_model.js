// The capuchin: the Blender-built skinned monkey from the asset workshop (assets/monkey), driven by the clips in monkey_clips.json.
// Two skeletons per monkey: the hero build (Monkey.glb, or Monkey_lite.glb on low quality) when the monkey is close, and the
// distant build (Monkey_lod1.glb, no clips, same bone names) when it is far. Clips come from the hero file and bind by bone name.
// Until the models load, or with ?monkey=old, the procedural monkey in creatures.js is used.
import * as THREE from 'three';
import { createCoconut, setCoconutState } from './coconut.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const NEW_MONKEY = new URLSearchParams(location.search).get('monkey') !== 'old';

const BASE = 'assets/monkey/';
const URLS = { hero: BASE + 'Monkey.glb', lite: BASE + 'Monkey_lite.glb', lod1: BASE + 'Monkey_lod1.glb', clips: BASE + 'monkey_clips.json' };
// the monkey's size: the asset is built at real scale (workshop docs: 0.46 m head-body length, Sapajus apella). The game target
// is 1.5x real (docs/WILDLIFE_SCALE_RESEARCH.md): 0.46 x 1.5 = 0.69 m head-body.
export const MONKEY_SCALE = 1.5;
const loader = new GLTFLoader();
const store = { ready: false, tier: null, scenes: {}, lod1: null, clips: [], meta: null, loading: null };

export const monkeyReady = () => NEW_MONKEY && store.ready;
export const monkeyMeta = (name) => (store.meta && store.meta[name]) || null;

/** the tier a quality level uses: the hero build on high, the lite build below it */
export const tierFor = (level) => (level === 'high' ? 'hero' : 'lite');

async function loadTier(tier) {
  if (!store.scenes[tier]) {
    const gltf = await loader.loadAsync(URLS[tier]);
    store.scenes[tier] = gltf.scene;
    if (!store.clips.length) store.clips = gltf.animations;
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; } });
  }
  return store.scenes[tier];
}

/** loads the models for the quality level in use; resolves false (and the old monkey is used) if anything fails */
export async function loadMonkeyModels(level = 'high') {
  if (!NEW_MONKEY) return false;
  try {
    const [lod1, meta] = await Promise.all([loader.loadAsync(URLS.lod1), fetch(URLS.clips).then((r) => r.json())]);
    store.lod1 = lod1.scene; store.meta = meta;
    store.lod1.traverse((o) => { if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; } });
    store.tier = tierFor(level);
    await loadTier(store.tier);
    store.ready = true;
    return true;
  } catch (error) {
    console.warn('monkey models failed to load; the procedural monkey is used', error);
    store.ready = false;
    return false;
  }
}

/** switch the near build when the quality changes; existing monkeys pick it up on their next update */
export async function setMonkeyTier(level) {
  if (!store.ready) return;
  const tier = tierFor(level);
  if (tier === store.tier) return;
  try { await loadTier(tier); store.tier = tier; } catch (error) { console.warn('monkey tier failed to load', error); }
}

const ONE_SHOT_END = 0.02;

/** one monkey: a near and a far skeleton, each with its own mixer, and the coconut on the coconut_attach bone of each */
export class MonkeyRig {
  constructor() {
    this.group = new THREE.Group();
    this.group.scale.setScalar(MONKEY_SCALE);
    this.near = null; this.far = null; this.isFar = false;
    this.current = ''; this.next = null; this.loop = true; this.timeScale = 1; this.clipLen = 1;
    this.usesCoconut = false; this.nutState = 'whole';
    this.mixT = 0;
    this.buildNear(store.tier);
    this.buildFar();
  }
  buildSide(root, tier) {
    const mixer = new THREE.AnimationMixer(root);
    const bones = {}; root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const side = { root, mixer, actions: new Map(), tier, nut: null, attach: bones.coconut_attach || null };
    if (side.attach) {
      side.nut = createCoconut({ state: this.nutState });
      side.nut.scale.setScalar(1 / MONKEY_SCALE); // Cancel rig enlargement: one coconut size for every actor.
      side.nut.visible = false; side.nut.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      side.attach.add(side.nut);
    }
    return side;
  }
  buildNear(tier) {
    const old = this.near;
    const root = cloneSkeleton(store.scenes[tier]);
    this.near = this.buildSide(root, tier);
    for (const clip of store.clips) this.near.actions.set(clip.name, this.near.mixer.clipAction(clip, root));
    if (old) { if (old.root.parent) this.group.remove(old.root); old.mixer.stopAllAction(); }
    this.attach(this.near, !this.isFar);
  }
  buildFar() {
    const root = cloneSkeleton(store.lod1);
    this.far = this.buildSide(root, 'lod1');
    for (const clip of store.clips) this.far.actions.set(clip.name, this.far.mixer.clipAction(clip, root));
    this.attach(this.far, this.isFar);
  }
  /** a skeleton that is not drawn is taken out of the scene, so its bones are not updated every frame (it is put back when it is drawn) */
  attach(side, on) {
    if (on) { if (!side.root.parent) this.group.add(side.root); side.root.visible = true; }
    else { if (side.root.parent) this.group.remove(side.root); side.root.visible = false; }
  }
  /** swap to the near or far skeleton; the new one resumes the same clip at the same time */
  setFar(far) {
    if (far === this.isFar) return;
    const from = this.active(), name = this.current, time = from.actions.get(name)?.time ?? 0;
    this.isFar = far;
    from.mixer.stopAllAction();
    this.attach(from, false);
    const to = this.active(); this.attach(to, true);
    this.current = ''; this.play(name, { fade: 0, time, loop: this.loop, timeScale: this.timeScale, next: this.next });
    this.setNut(this.usesCoconut);
  }
  /** the skeleton that is drawn */
  active() { return this.isFar ? this.far : this.near; }
  /** retarget the near build (quality change): clips restart from the current time */
  retier() {
    if (!store.ready || !this.near || this.near.tier === store.tier) return;
    const name = this.current, time = this.near.actions.get(name)?.time ?? 0;
    this.buildNear(store.tier);
    this.current = ''; if (!this.isFar) this.play(name, { fade: 0, time, loop: this.loop, timeScale: this.timeScale, next: this.next });
    this.setNut(this.usesCoconut);
  }
  /**
   * play a clip. `loop` false holds the last frame; `next` is played once this one has ended.
   * `timeScale` sets the playback rate (ground speed / the clip's own speed_mps for locomotion).
   */
  play(name, { fade = 0.25, time = 0, loop, timeScale = 1, next = null } = {}) {
    const meta = monkeyMeta(name);
    if (!meta || !store.clips.length) return false;
    const side = this.active();
    const clip = store.clips.find((c) => c.name === name);
    if (!clip) return false;
    const isLoop = loop ?? meta.loop;
    // asking for the clip that is already playing keeps the chain it was started with (the controller repeats it every frame)
    const keepNext = name === this.current ? this.next : null;
    this.loop = isLoop; this.next = next ?? keepNext; this.timeScale = timeScale; this.clipLen = clip.duration;
    this.usesCoconut = !!meta.uses_coconut;
    if (name === this.current) { side.actions.get(name).setEffectiveTimeScale(timeScale); return true; }
    const prev = this.current ? side.actions.get(this.current) : null;
    const action = side.actions.get(name);
    if (!action) {
      console.warn('monkey clip not bound', name, { far: this.isFar, actions: side.actions.size, tier: side.tier, clips: store.clips.length });
      return false;
    }
    action.reset();
    action.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !isLoop;
    action.time = time;
    action.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).play();
    if (prev && prev !== action && fade > 0) prev.crossFadeTo(action, fade, false);
    else if (prev && prev !== action) prev.stop();
    this.current = name;
    this.setNut(this.usesCoconut);
    return true;
  }
  setTimeScale(timeScale) {
    this.timeScale = timeScale;
    const action = this.active().actions.get(this.current);
    if (action) action.setEffectiveTimeScale(timeScale);
  }
  /** the coconut is in the hands only while a clip with uses_coconut plays */
  setNut(visible) {
    this.usesCoconut = visible;
    for (const side of [this.near, this.far]) if (side && side.nut) side.nut.visible = visible && side === this.active();
  }
  setNutState(state) {
    this.nutState = state;
    for (const side of [this.near, this.far]) if (side?.nut) setCoconutState(side.nut, state);
  }
  /** whether the current one-shot has run out */
  finished() {
    const action = this.active().actions.get(this.current);
    return !!action && !this.loop && action.time >= this.clipLen - ONE_SHOT_END;
  }
  /** advance the mixer, and start the chained clip when a one-shot ends */
  update(dt) {
    this.active().mixer.update(dt);
    if (this.next && this.finished()) { const n = this.next; this.next = null; this.play(n, { fade: 0.3 }); }
  }
  /** lets far-away monkeys update their animation less often */
  throttled(dt, every) {
    this.mixT += dt;
    if (this.mixT < every) return;
    this.update(this.mixT); this.mixT = 0;
  }
}

/** a rig for one monkey, or null when the models are not in use */
export function makeMonkeyRig() {
  if (!monkeyReady()) return null;
  return new MonkeyRig();
}
