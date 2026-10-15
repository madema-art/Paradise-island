// Specimen viewer: shows the game's own model of the selected creature in the field guide panel. It has its own WebGL
// context and camera, so it never touches the main camera or the post-processing chain. It draws only while the guide
// is open, and each species is built once and kept, so switching back and forth does not reload anything.
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SPECIMEN_FACTORIES } from './species.js';

const STRIP = (root) => {
  // the registry's invisible pick proxy is not part of the animal
  const dead = [];
  root.traverse((o) => { if ((o.userData && o.userData.creature) || (o.isMesh && o.material && o.material.visible === false)) dead.push(o); });
  for (const o of dead) o.removeFromParent();
  // the live game draws a creature's rigid parts through instanced copies and keeps the originals on a layer no camera shows (part_instancing.js); this viewer draws the originals themselves
  root.traverse((o) => {
    o.layers.set(0);
    const r = o.userData && o.userData.rest;
    if (r && o !== root) { o.position.set(r.p[0], r.p[1], r.p[2]); o.quaternion.set(r.q[0], r.q[1], r.q[2], r.q[3]); o.scale.set(r.s[0], r.s[1], r.s[2]); }
  });
  root.visible = true;                         // a creature hidden in the game (a rat in its burrow) is still shown here
  root.updateMatrixWorld(true);
};

export class SpecimenViewer {   // (also reachable as window.__SpecimenViewer, for testing the Field Guide model by hand)
  constructor(host) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'spec-canvas';
    host.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 500);
    // dedicated studio lighting: warm key, cool fill, a rim light from behind, and a soft sky/ground hemisphere
    this.scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x3b3328, 1.1));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(3, 5, 4); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fd7ff, 0.7); fill.position.set(-4, 2, -2); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.1); rim.position.set(-2, 3, -6); this.scene.add(rim);
    this.stage = new THREE.Group(); this.scene.add(this.stage);
    // a faint plinth so the animal sits on something
    this.plinth = new THREE.Mesh(new THREE.CircleGeometry(1, 56), new THREE.MeshBasicMaterial({ color: 0x9fd9dc, transparent: true, opacity: 0.16, depthWrite: false }));
    this.plinth.rotation.x = -Math.PI / 2; this.plinth.visible = false; this.scene.add(this.plinth);

    this.cache = new Map();
    this.current = null;
    this.yaw = 0.7; this.pitch = 0.18; this.zoom = 1;
    this.spin = true; this.paused = false; this.dragging = false;
    this.visible = false; this.running = false; this.frameId = 0; this.last = 0;
    this.onClip = null;

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.bindInput();
    this.loop = this.loop.bind(this);
  }

  bindInput() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    let lx = 0, ly = 0;
    c.addEventListener('pointerdown', (e) => {
      this.dragging = true; lx = e.clientX; ly = e.clientY;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw -= (e.clientX - lx) * 0.009;
      this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch + (e.clientY - ly) * 0.007));
      lx = e.clientX; ly = e.clientY;
    });
    const end = () => { this.dragging = false; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.22, Math.min(4, this.zoom * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.current) this.frame(this.current);
  }

  /** draw only while the guide is open */
  setVisible(v) {
    this.visible = v;
    if (v && !this.running) { this.running = true; this.last = performance.now(); this.frameId = requestAnimationFrame(this.loop); }
  }

  loop(now) {
    if (!this.visible) { this.running = false; return; }
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.spin && !this.dragging) this.yaw += dt * 0.42;
    if (this.current && this.current.mixer && !this.paused) this.current.mixer.update(dt);
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.loop);
  }

  updateCamera() {
    const it = this.current;
    const d = it ? it.dist * this.zoom : 5;
    const cp = Math.cos(this.pitch);
    const target = it ? it.center : new THREE.Vector3();
    this.camera.position.set(target.x + Math.sin(this.yaw) * cp * d, target.y + Math.sin(this.pitch) * d, target.z + Math.cos(this.yaw) * cp * d);
    this.camera.lookAt(target);
    this.camera.near = Math.max(0.005, d * 0.02); this.camera.far = d * 40;
    this.camera.updateProjectionMatrix();
  }

  /** the model is built from the game's own registry entry: its group, or its factory, or its instanced fish */
  build(entry) {
    let model = null;
    if (entry.specimen) { const r = entry.specimen(); if (r) model = { root: r, mixer: null, actions: null }; }
    const factory = SPECIMEN_FACTORIES[entry.name];
    if (!model && factory) { const m = factory(entry); if (m && m.root) { m.root.scale.copy(entry.group.scale); model = m; } }
    if (!model && entry.group) {
      // the registry's pick proxy points back at its creature, which JSON copying cannot handle: set those aside while cloning
      const held = [];
      entry.group.traverse((o) => { if (o.userData && o.userData.creature) { held.push([o, o.userData]); o.userData = {}; } });
      let root = null;
      try { root = cloneSkeleton(entry.group); } finally { for (const [o, ud] of held) o.userData = ud; }
      STRIP(root);
      model = { root, mixer: null, actions: null };
    }
    if (!model) return null;
    const holder = new THREE.Group();
    holder.add(model.root);
    model.root.position.set(0, 0, 0); model.root.rotation.set(0, 0, 0);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    holder.position.sub(centre);                  // the animal turns about its own middle
    const radius = Math.max(0.05, Math.max(size.x, size.y, size.z) * 0.5);
    holder.visible = false;
    this.stage.add(holder);
    const clips = model.actions ? [...model.actions.keys()] : [];
    const item = {
      name: entry.name, holder, mixer: model.mixer || null, actions: model.actions || null, clips,
      center: new THREE.Vector3(0, 0, 0), dist: 1, radius, floorY: -size.y / 2, floorR: Math.max(size.x, size.z) * 0.6,
      activeClip: '',
    };
    return item;
  }

  /** frame the specimen: fit its bounding sphere to the view, whatever its size */
  frame(item) {
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.camera.aspect);
    const fit = Math.min(fovV, fovH);
    item.dist = (item.radius / Math.sin(fit / 2)) * 1.12;
    this.plinth.position.set(0, item.floorY - 0.01 * item.radius, 0);
    this.plinth.scale.setScalar(Math.max(0.3, item.floorR * 1.5));
    this.plinth.visible = true;
  }

  /** show a creature from the registry; returns the specimen item (or null if it has no model) */
  show(entry) {
    const key = entry.name + '#' + ((entry.sim && entry.sim.variant) || '');
    let item = this.cache.get(key);
    if (item === undefined) {
      item = this.build(entry);
      this.cache.set(key, item);
    }
    if (!item) return null;
    if (this.current && this.current !== item) {
      this.current.holder.visible = false;
      if (this.current.actions) this.current.actions.forEach((a) => a.fadeOut(0.2));
    }
    this.current = item;
    item.holder.visible = true;
    this.yaw = 0.7; this.pitch = 0.18; this.zoom = 1;
    this.frame(item);
    // play the first looping clip for the species (or the first clip if none loops)
    if (item.clips.length && !item.activeClip) this.setClip(item.clips[0]);
    else if (item.activeClip) this.setClip(item.activeClip);
    return item;
  }

  /** change the animation clip of the current specimen */
  setClip(name) {
    const it = this.current;
    if (!it || !it.actions) return;
    const next = it.actions.get(name);
    if (!next) return;
    it.activeClip = name;
    if (this.onClip) this.onClip(name);
    it.actions.forEach((a) => { if (a !== next) a.fadeOut(0.25); });
    next.reset().fadeIn(0.25).play();
  }

  resetView() { this.yaw = 0.7; this.pitch = 0.18; this.zoom = 1; }

  toggleFullscreen() {
    if (document.fullscreenElement === this.host) document.exitFullscreen();
    else if (this.host.requestFullscreen) this.host.requestFullscreen().catch(() => {});
  }
}
if (typeof window !== "undefined") window.__SpecimenViewer = SpecimenViewer;
