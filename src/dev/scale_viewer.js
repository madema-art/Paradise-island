// Wildlife Scale Comparison Viewer (development only: dev/scale_viewer.html). It builds each species from the game's own model code
// (the same loaders and factories the game uses), applies the researched 1.5x target size once, and measures the result in its
// rest pose. Nothing here runs in normal gameplay. Use: npm run build, then open http://localhost:5173/dev/scale_viewer.html
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadCastawayModel, buildHumanFromModel, CASTAWAY_HEIGHT } from '../castaway_model.js';
import { loadBoarModel, makeBoarModel } from '../boar_model.js';
import { loadBoaModel, makeBoaModel } from '../boa_model.js';
import { loadOwlModel, makeOwlModel } from '../owl_model.js';
import { loadRatModel, makeRatModel } from '../rat_model.js';
import { loadBatModel, makeBatColony } from '../bat_model.js';
import { loadFlamingoModel, makeFlamingoModel } from '../flamingo_model.js';
import { loadCrabModel, makeCrabModel } from '../crab_model.js';
import { loadTernModel, makeTernModel } from '../tern_model.js';
import { loadGullModels, makeGullModel } from '../gull_model.js';
import { loadLorikeetModels, makeLorikeetModel } from '../lorikeet_model.js';
import { loadFrigatebirdModels, makeFrigatebirdModel } from '../frigatebird_model.js';
import { loadSeaEagleModels, makeSeaEagleModel } from '../sea_eagle_model.js';
import { loadDolphinFamilyModel, makeDolphinModel } from '../dolphin_model.js';
import { loadTurtleModel, makeTurtleModel } from '../turtle_model.js';
import { loadWhaleModel, makeWhaleModel } from '../whale_model.js';
import { loadSharkModel, makeSharkModel } from '../shark_model.js';

// the species: target = the researched adult dimension x 1.5 (docs/WILDLIFE_SCALE_RESEARCH.md); axis 'x'|'y'|'z' or 'max'; mesh filters a part
const CATALOGUE = [
  { id: 'boar', name: 'Wild boar', cat: 'Mammals', dim: 'standing height', axis: 'y', exclude: 'mane|ear|tusk|eye', target: 1.20, load: loadBoarModel, make: () => makeBoarModel('wild') },
  { id: 'piglet', name: 'Boar piglet (estimate)', cat: 'Mammals', dim: 'standing height', axis: 'y', exclude: 'mane|ear|tusk|eye', target: 0.66, load: loadBoarModel, make: () => makeBoarModel('piglet') },
  { id: 'rat', name: 'Island rat', cat: 'Mammals', dim: 'head-body + tail', axis: 'max', target: 0.36, load: loadRatModel, make: () => makeRatModel() },
  { id: 'bat', name: 'Fruit bat', cat: 'Mammals', dim: 'head-body length', axis: 'z', target: 0.315, load: loadBatModel, make: () => makeBatColony(1) },
  { id: 'boa', name: 'Pacific boa (exception)', cat: 'Reptiles', dim: 'extended body length', axis: 'z', target: 3.00, load: loadBoaModel, make: () => makeBoaModel() },
  { id: 'owl', name: 'Barn owl', cat: 'Birds', dim: 'wingspan', axis: 'x', target: 1.43, load: loadOwlModel, make: () => makeOwlModel() },
  { id: 'flamingo', name: 'Greater flamingo', cat: 'Birds', dim: 'standing height', axis: 'y', target: 1.95, load: loadFlamingoModel, make: () => makeFlamingoModel('classic') },
  { id: 'tern', name: 'White tern', cat: 'Birds', dim: 'body length', axis: 'z', target: 0.45, load: loadTernModel, make: () => makeTernModel('adult') },
  { id: 'gull', name: 'Silver gull', cat: 'Birds', dim: 'body length', axis: 'z', target: 0.645, load: loadGullModels, make: () => makeGullModel('adult') },
  { id: 'lorikeet', name: 'Rainbow lorikeet', cat: 'Birds', dim: 'body length', axis: 'z', target: 0.42, load: loadLorikeetModels, make: () => makeLorikeetModel('adult') },
  { id: 'frigate', name: 'Great frigatebird', cat: 'Birds', dim: 'body length', axis: 'z', target: 1.43, load: loadFrigatebirdModels, make: () => makeFrigatebirdModel('male') },
  { id: 'eagle', name: 'White-bellied sea eagle', cat: 'Birds', dim: 'body length', axis: 'z', target: 1.20, load: loadSeaEagleModels, make: () => makeSeaEagleModel('adult') },
  { id: 'crabRed', name: 'Red beach crab (Grapsus)', cat: 'Crabs', dim: 'carapace width', axis: 'x', mesh: 'carapace', target: 0.09, load: loadCrabModel, make: () => makeCrabModel('red') },
  { id: 'crabGhost', name: 'Ghost crab', cat: 'Crabs', dim: 'carapace width', axis: 'x', mesh: 'carapace', target: 0.09, load: loadCrabModel, make: () => makeCrabModel('ghost') },
  { id: 'crabCoconut', name: 'Coconut crab (leg span)', cat: 'Crabs', dim: 'leg span', axis: 'x', target: 1.20, load: loadCrabModel, make: () => makeCrabModel('coconut') },
  { id: 'dolphin', name: 'Bottlenose dolphin', cat: 'Marine mammals', dim: 'total length', axis: 'max', target: 3.90, load: loadDolphinFamilyModel, make: () => makeDolphinModel('adultMale') },
  { id: 'turtle', name: 'Green sea turtle', cat: 'Reptiles', dim: 'carapace length', axis: 'max', target: 1.35, load: loadTurtleModel, make: () => makeTurtleModel() },
  { id: 'whale', name: 'Humpback whale', cat: 'Marine mammals', dim: 'total length', axis: 'max', target: 21.0, load: loadWhaleModel, make: () => makeWhaleModel() },
  { id: 'shark', name: 'Blackfin reef shark', cat: 'Fish', dim: 'total length', axis: 'max', target: 1.95, load: loadSharkModel, make: () => makeSharkModel() },
];

const $ = (s) => document.querySelector(s);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#c9d6df');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(6, 12, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x8a7d62, 0.6));

// flat neutral ground and a 1 m grid (one unit = one metre)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#bfb8a6', roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(40, 40, 0x333c44, 0x6f7a83);
grid.position.y = 0.002; scene.add(grid);

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const stage = new THREE.Group(); scene.add(stage);
const castawayGroup = new THREE.Group(); scene.add(castawayGroup);
const selected = new Map();   // id -> { entry, group, labelEl, sourceM, factor }
const labels = document.createElement('div'); labels.id = 'labels'; document.body.appendChild(labels);

/** the extent of a model's own geometry in its root's local units, root scale removed (rest pose, fixed reference) */
function restExtent(root, entry, unit = true) {
  const saved = root.scale.clone();
  if (unit) root.scale.set(1, 1, 1);
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const box = new THREE.Box3(), m = new THREE.Matrix4(), p = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (entry.mesh && !(o.name || '').toLowerCase().includes(entry.mesh)) return;
    if (entry.exclude && new RegExp(entry.exclude, 'i').test(o.name || '')) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < 8; i++) { p.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(m); box.expandByPoint(p); }
  });
  root.scale.copy(saved);
  const s = box.getSize(new THREE.Vector3());
  return { size: s, min: box.min.clone(), max: box.max.clone(), value: entry.axis === 'max' ? Math.max(s.x, s.y, s.z) : s[entry.axis] };
}

/** the box of what is shown (scaled, world units) and the dimension on the species' axis */
function shownBox(obj, entry) {
  const local = restExtent(obj.children[0], entry, false);
  const k = obj.scale.x;
  const sz = local.size.clone().multiply(obj.children[0].scale).multiplyScalar(k);   // root scale, then the group scale
  return { box: new THREE.Box3().setFromObject(obj, true), size: sz, value: entry.axis === 'max' ? Math.max(sz.x, sz.y, sz.z) : sz[entry.axis] };
}
function shownBoxWorld(obj, entry) {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  obj.traverse((o) => { if (o.isMesh && o.visible && o.geometry) { if (entry.mesh && !(o.name || '').toLowerCase().includes(entry.mesh)) return; if (entry.exclude && new RegExp(entry.exclude, 'i').test(o.name || '')) return; const b = new THREE.Box3().setFromObject(o, true); box.union(b); } });
  const s = box.getSize(new THREE.Vector3());
  return { box, size: s, value: entry.axis === 'max' ? Math.max(s.x, s.y, s.z) : s[entry.axis] };
}

async function ensureLoaded(entry) {
  if (entry.loaded) return;
  if (entry.load) await entry.load();
  entry.loaded = true;
}

/** add a species to the stage at the next free position; the factor is target / source, applied once to the group */
async function addSpecies(entry) {
  if (selected.has(entry.id)) return;
  await ensureLoaded(entry);
  const made = entry.make();
  const root = made && made.isObject3D ? made : (made && made.root) || null;
  if (!root) { console.warn('no model for', entry.name); return; }
  const group = new THREE.Group();
  group.add(root);
  const unitSrc = restExtent(root, entry, true);            // the source model at unit root scale (what goes in the research table)
  const rootScale = entry.axis === 'max' ? Math.max(root.scale.x, root.scale.y, root.scale.z) : root.scale[entry.axis];
  const factor = entry.target / (unitSrc.value * rootScale);   // the game's formula: target / (sourceM x root scale on the axis)
  const src = unitSrc;
  group.scale.setScalar(factor);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const x = nextX();
  group.position.set(x, 0, 0);
  stage.add(group);
  const el = document.createElement('div');
  el.className = 'label';
  labels.appendChild(el);
  // the models that carry clips (the game's factories return a mixer and its actions); the others are posed by code
  const anim = made && made.mixer && made.actions instanceof Map && made.actions.size ? { mixer: made.mixer, actions: made.actions, current: null } : null;
  selected.set(entry.id, { entry, group, el, sourceM: src.value, rootScale, factor, root, anim });
  layout(); refreshList(); refreshAnimPanel();
}

function nextX() {
  let x = 0;
  for (const s of selected.values()) x = Math.max(x, s.group.position.x + 1.4 + (s.entry.target > 3 ? 1.2 : 0));
  return x;
}

function layout() {
  // species stand in rows on the ground, the castaway at the start of the first row; each row wraps at 22 m
  const ROW = 22;
  let x = 2.5, z = 0, rowDepth = 0;
  for (const s of selected.values()) {
    const sz = shownBox(s.group, s.entry).size;
    if (x + sz.x > ROW) { x = 2.5; z -= rowDepth + 2.5; rowDepth = 0; }
    s.group.position.set(x + sz.x / 2, 0, z - sz.z / 2);
    x += sz.x + 1.6;
    rowDepth = Math.max(rowDepth, sz.z);
  }
}

function refreshList() {
  const list = $('#list');
  list.innerHTML = '';
  let cat = '';
  for (const e of CATALOGUE) {
    if (e.cat !== cat) { cat = e.cat; const h = document.createElement('h4'); h.textContent = cat; list.appendChild(h); }
    const b = document.createElement('button');
    b.textContent = (selected.has(e.id) ? '- ' : '+ ') + e.name;
    b.className = selected.has(e.id) ? 'on' : '';
    b.onclick = () => (selected.has(e.id) ? removeSpecies(e.id) : addSpecies(e));
    list.appendChild(b);
  }
}

function removeSpecies(id) {
  const s = selected.get(id);
  if (!s) return;
  stage.remove(s.group);
  s.el.remove();
  selected.delete(id);
  layout(); refreshList(); refreshAnimPanel();
}

/** animation playback: the selected species' clips, one play state and speed, and scrubbing while paused */
const animUI = { playing: false, speed: 1, species: null, clip: null, last: 0 };
const animatable = () => [...selected.values()].filter((s) => s.anim);
function refreshAnimPanel() {
  // every species on the stage is listed; the ones without clips say so in the status line
  const sel = $('#animSpecies'), list = [...selected.values()];
  sel.innerHTML = '';
  for (const s of list) sel.add(new Option(s.anim ? s.entry.name : s.entry.name + ' (no clips)', s.entry.id));
  if (!list.some((s) => s.entry.id === animUI.species)) animUI.species = list.length ? list[0].entry.id : null;
  if (animUI.species) sel.value = animUI.species;
  fillClips();
}
function fillClips() {
  const cs = $('#animClip'), s = animUI.species ? selected.get(animUI.species) : null;
  cs.innerHTML = '';
  if (s && s.anim) {
    for (const name of s.anim.actions.keys()) cs.add(new Option(name, name));
    if (!s.anim.actions.has(animUI.clip)) animUI.clip = [...s.anim.actions.keys()][0];
    cs.value = animUI.clip;
  } else { cs.add(new Option('(no clips)', '')); animUI.clip = null; }
  applyClip();
}
/** play the chosen clip on every animated species that has it (its first clip otherwise), crossfading from the one before */
function applyClip() {
  for (const s of animatable()) {
    const name = s.anim.actions.has(animUI.clip) ? animUI.clip : [...s.anim.actions.keys()][0];
    const next = s.anim.actions.get(name);
    if (s.anim.current === next) continue;
    if (s.anim.current) s.anim.current.fadeOut(0.2);
    next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
    s.anim.current = next;
  }
  for (const s of animatable()) s.anim.mixer.timeScale = animUI.playing ? animUI.speed : 0;
  updateAnimStatus();
}
function setPlaying(on) {
  animUI.playing = on;
  for (const s of animatable()) s.anim.mixer.timeScale = on ? animUI.speed : 0;
  $('#animPlay').textContent = on ? 'Pause' : 'Play';
  updateAnimStatus();
}
function updateAnimStatus() {
  const el = $('#animStatus'), s = animUI.species ? selected.get(animUI.species) : null;
  if (!animatable().length) { el.textContent = 'None of the species on the stage has clips built in. Boar, boa, owl, tern, flamingo, crabs, rat and bat are posed by code in the game, so there is nothing to play for them here.'; return; }
  if (!s || !s.anim) { el.textContent = 'This model has no built-in clips; its motion is in code.'; return; }
  const a = s.anim.current, dur = a ? a.getClip().duration : 0;
  el.textContent = s.entry.name + ': ' + (animUI.clip || 'no clip') + ', ' + dur.toFixed(2) + ' s' + (animUI.playing ? '' : ' (paused)');
}
/** scrub the chosen species' clip; scrubbing pauses playback */
function scrubTo(f) {
  const s = animUI.species ? selected.get(animUI.species) : null;
  if (!s || !s.anim || !s.anim.current) return;
  setPlaying(false);
  const a = s.anim.current;
  a.time = f * a.getClip().duration;
  s.anim.mixer.update(0);
  updateAnimStatus();
}

/** the castaway, always on the stage at 2.00 m (his own model code applies the scale from his body mesh) */
async function addCastaway() {
  await loadCastawayModel();
  const rig = buildHumanFromModel();
  if (!rig) return;
  castawayGroup.add(rig.root);
  castawayGroup.position.x = 0;
  castawayGroup.scale.setScalar(1);
  // the 2.00 m check: the body mesh from feet to the top of the skin (hair excluded), in the scene as it stands
  let body = null; rig.root.traverse((o) => { if (o.isSkinnedMesh && o.name === 'body') body = o; });
  body.geometry.computeBoundingBox();
  const h = body.geometry.boundingBox.max.y - body.geometry.boundingBox.min.y;
  castawayGroup.userData.height = h * rig.root.scale.y;
  castawayGroup.userData.check = CASTAWAY_HEIGHT;
}

/** frame everything on the stage */
function frameAll(view) {
  const box = new THREE.Box3().setFromObject(stage);
  box.union(new THREE.Box3().setFromObject(castawayGroup));
  if (box.isEmpty()) box.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2, 2));
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const dist = Math.max(s.x, s.y, s.z) * 1.4 + 3;
  controls.target.copy(c);
  if (view === 'front') camera.position.set(c.x, c.y + s.y * 0.2, c.z + dist);
  else if (view === 'side') camera.position.set(c.x + dist, c.y + s.y * 0.2, c.z);
  else if (view === 'top') camera.position.set(c.x, c.y + dist, c.z + 0.001);
  else camera.position.set(c.x + dist * 0.6, c.y + dist * 0.45, c.z + dist * 0.75);
  camera.lookAt(c);
  controls.update();
}

function measurements() {
  const rows = [];
  const cs = castawayGroup.userData.height;
  rows.push({ name: 'The Castaway (reference)', dim: 'standing height (body mesh)', target: CASTAWAY_HEIGHT, shown: cs ? +cs.toFixed(3) : null });
  for (const s of selected.values()) {
    const shown = shownBox(s.group, s.entry);
    rows.push({ name: s.entry.name, dim: s.entry.dim, axis: s.entry.axis, target: s.entry.target, sourceM: +s.sourceM.toFixed(4), rootScale: +s.rootScale.toFixed(4), factor: +s.factor.toFixed(4), shown: +shown.value.toFixed(3) });
  }
  return rows;
}

function updateLabels() {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  for (const s of selected.values()) {
    const shown = shownBox(s.group, s.entry);
    const top = new THREE.Vector3((shown.box.min.x + shown.box.max.x) / 2, shown.box.max.y + 0.05, (shown.box.min.z + shown.box.max.z) / 2);
    const p = top.clone().project(camera);
    s.el.style.display = p.z < 1 ? 'block' : 'none';
    s.el.style.left = ((p.x * 0.5 + 0.5) * w) + 'px';
    s.el.style.top = ((-p.y * 0.5 + 0.5) * h) + 'px';
    s.el.innerHTML = `<b>${s.entry.name}</b><br>${s.entry.dim}: <b>${shown.value.toFixed(2)} m</b> (target ${s.entry.target} m)`;
  }
  const cs = castawayGroup.userData.height;
  if (cs) {
    const top = new THREE.Vector3(0, cs + 0.05, 0);
    const p = top.clone().project(camera);
    let el = document.getElementById('castLabel');
    if (!el) { el = document.createElement('div'); el.id = 'castLabel'; el.className = 'label'; labels.appendChild(el); }
    el.style.display = p.z < 1 ? 'block' : 'none';
    el.style.left = ((p.x * 0.5 + 0.5) * w) + 'px';
    el.style.top = ((-p.y * 0.5 + 0.5) * h) + 'px';
    el.innerHTML = `<b>The Castaway</b><br>standing height: <b>${cs.toFixed(2)} m</b> (reference 2.00 m)`;
  }
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// the dev page's controls
/** frame one species (or the castaway, id 'castaway') from a view: front, side, top or orbit */
function focus(id, view = 'front') {
  const obj = id === 'castaway' ? castawayGroup : (selected.get(id) || {}).group;
  if (!obj) return false;
  const box = new THREE.Box3().setFromObject(obj, true);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const d = Math.max(s.x, s.y, s.z) * 2.2 + 1.5;
  controls.target.copy(c);
  if (view === 'side') camera.position.set(c.x + d, c.y + s.y * 0.15, c.z);
  else if (view === 'top') camera.position.set(c.x, c.y + d, c.z + 0.001);
  else camera.position.set(c.x, c.y + s.y * 0.15, c.z + d);
  controls.update();
  return true;
}
window.__scaleViewer = { focus, controls, scene, camera, stage, THREE, animUI, selected, addSpecies: (id) => addSpecies(CATALOGUE.find((e) => e.id === id)), removeSpecies, frameAll, measurements, catalogue: CATALOGUE.map((e) => e.id) };
document.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => frameAll(b.dataset.view); });
$('#animPlay').onclick = () => setPlaying(!animUI.playing);
$('#animFrame').onclick = () => { if (animUI.species) focus(animUI.species, 'side'); else frameAll('orbit'); };
$('#animSpecies').onchange = (e) => { animUI.species = e.target.value; fillClips(); };
$('#animClip').onchange = (e) => { animUI.clip = e.target.value; applyClip(); };
$('#animSpeed').oninput = (e) => { animUI.speed = +e.target.value; $('#animSpeedVal').textContent = animUI.speed.toFixed(2) + 'x'; for (const s of animatable()) s.anim.mixer.timeScale = animUI.playing ? animUI.speed : 0; };
$('#animScrub').oninput = (e) => scrubTo(+e.target.value);
$('#export') && ($('#export').onclick = () => { const txt = JSON.stringify(measurements(), null, 1); navigator.clipboard && navigator.clipboard.writeText(txt).catch(() => {}); $('#out').textContent = txt; });

addCastaway().then(() => frameAll('front'));
refreshList();
refreshAnimPanel();

renderer.setAnimationLoop(() => {
  // the frame time in seconds (capped, so a pause in the tab does not jump the clips)
  const now = performance.now() / 1000, dt = animUI.last ? Math.min(0.1, now - animUI.last) : 0;
  animUI.last = now;
  for (const s of animatable()) s.anim.mixer.update(dt);
  // the scrubber follows the clip while it plays
  const cur = animUI.species ? selected.get(animUI.species) : null;
  if (cur && cur.anim && cur.anim.current && animUI.playing) {
    const a = cur.anim.current;
    $('#animScrub').value = String((a.time % a.getClip().duration) / a.getClip().duration);
  }
  controls.update();
  renderer.render(scene, camera);
  updateLabels();
});
