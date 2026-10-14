// Survival mode: you are the castaway. Keep fed, watered and rested, gather and craft, build a camp, and build a raft to get home.
import * as THREE from 'three';
import { scene, camera, env, events, creatures, U } from '../core.js';
import { getHeight, falls, river, LAKE, SPRING, FAIRY, TEMPLE, COVE, VOL, lavaDist, ASCENT } from '../world.js';
import { Climber, climbRoute, exitPoint, stationBelow } from '../climb.js';
import { spawnNear } from '../walk.js';
import { cam, setMode } from '../camera.js';
import { wx } from '../weather.js';
import { palms } from '../flora.js';
import { fx } from '../props.js';
import { waterY, wake as waterWake } from '../ripples.js';
import { castawayAI } from '../human.js';
import { input } from './input.js';
import { Avatar } from './avatar.js';
import { Player } from './player.js';
import { Resources } from './nodes.js';
import { Structure, Ghost, canPlace, BUILD } from './structures.js';
import { Hud, CONTROLS_HTML } from './hud.js';
import { collectActions, waterAhead, waterKind, depthAt } from './actions.js';
import { ITEMS, RECIPES, LEVELS, QUESTS, DISCOVERIES, RATES } from './items.js';
import { clamp, damp, rr, rnd, pick, TAU } from '../util.js';

import { gatherResource, canAfford, spend, awardRecipe, constructRecipe, fuelFire } from './mechanics.js';

const SAVE_KEY = 'paradise.survival.v1';
const FISH_SEA = ['parrotfish', 'red snapper', 'mackerel', 'grouper', 'sea bream', 'trevally'];
const FISH_FRESH = ['mullet', 'freshwater eel', 'rainbow fish'];
const LOOT = [['can', 1, 3], ['bottle', 1, 3], ['bandage', 1, 2], ['rope', 2, 3], ['fiber', 3, 3], ['stick', 4, 2], ['frond', 4, 2], ['stone', 3, 2], ['pearl', 1, 0.5]];

const newState = () => ({
  hp: 100, food: 78, water: 78, energy: 92, sick: 0, xp: 0, level: 1, qIdx: 0, inv: {}, dur: {}, stats: {}, disc: {},
  structs: [], day: 1, palmCD: {}, torch: 0, nodes: null, deaths: 0, tod: 7.1, pos: null,
});

export class Survival {
  constructor() {
    this.active = false; this.built = false; this.paused = false; this.dead = false; this.ending = false;
    this.s = newState(); this.structs = []; this.bagVer = 0; this.act = null; this.fishing = null; this.fishBite = false;
    this.placing = null; this.sleeping = null; this.acts = []; this.actT = 0; this.questT = 0; this.discT = 0; this.saveT = 0;
    this.lastHours = 0; this.lastTod = 0; this.torchLeft = 0; this.crabBack = []; this.hurtT = 0; this.warned = {};
    this.stormy = false; this.sheltered = false; this.waterSpots = []; this.clockT = 0; this.running = false;
  }

  /* ------------------------------------------------------------ the pieces, built the first time you play */
  build() {
    if (this.built) return;
    this.built = true;
    const sp = spawnNear(COVE.x + 34, COVE.z + 6);
    this.spawn = { x: sp.x, z: sp.z };
    this.avatar = new Avatar();
    this.player = new Player(this.avatar);
    this.res = new Resources(); this.res.build(this.spawn);
    this.ghost = new Ghost();
    this.hud = new Hud(this);
    this.lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffa24a, 0, 24, 2); l.position.set(0, -50, 0); scene.add(l); return l; });
    // fresh water on the map
    if (falls.pool) this.waterSpots.push({ x: falls.pool.x, z: falls.pool.z });
    this.waterSpots.push({ x: LAKE.x, z: LAKE.z });
    const rb = river.B.pts; for (let i = 6; i < rb.length - 4; i += 12) this.waterSpots.push({ x: rb[i].x, z: rb[i].z });
    input.onKey = (code, e) => this.onKey(code, e);
    this.sites = [
      { id: 'falls', x: falls.pool ? falls.pool.x : 0, z: falls.pool ? falls.pool.z : 0, r: 16 }, { id: 'temple', x: TEMPLE.x, z: TEMPLE.z, r: 22 },
      { id: 'spring', x: SPRING.x, z: SPRING.z, r: 14 }, { id: 'fairy', x: FAIRY.x, z: FAIRY.z, r: 14 }, { id: 'lake', x: LAKE.x, z: LAKE.z, r: 24 },
      { id: 'oldcamp', x: falls.camp.x, z: falls.camp.z, r: 12 }, { id: 'wreck', x: COVE.x + 16, z: COVE.z + 18, r: 20 }, { id: 'lava', x: VOL.x + 80, z: VOL.z + 30, r: 30 },
    ];
    if (ASCENT.top) this.sites.push({ id: 'summit', x: ASCENT.top.x, z: ASCENT.top.z, r: 4.5 }, { id: 'basecamp', x: ASCENT.bc.x, z: ASCENT.bc.z, r: 6 });
    this.climber = new Climber();
  }

  /* ------------------------------------------------------------ counts, items, xp */
  count(id) { return this.s.inv[id] || 0; }
  stat(k) { return this.s.stats[k] || 0; }
  bump(k, n = 1) { this.s.stats[k] = (this.s.stats[k] || 0) + n; }
  get day() { return this.s.day; }
  get hoursAbs() { return env.hours; }
  add(id, n = 1, quiet = false) {
    const it = ITEMS[id];
    if (it.tool) { this.s.inv[id] = 1; this.s.dur[id] = it.uses; } else this.s.inv[id] = (this.s.inv[id] || 0) + n;
    this.bagVer++;
    if (!quiet) this.hud.gain(`+${n > 1 ? n + ' ' : ''}${it.icon} ${it.name}`, 'good');
  }
  take(id, n = 1) { this.s.inv[id] = Math.max(0, (this.s.inv[id] || 0) - n); if (!this.s.inv[id]) delete this.s.inv[id]; this.bagVer++; }
  useTool(id) {
    if (!this.s.dur[id]) return;
    this.s.dur[id] -= 1; this.bagVer++;
    if (this.s.dur[id] <= 0) { this.take(id); delete this.s.dur[id]; this.hud.gain(`${ITEMS[id].icon} Your ${ITEMS[id].name.toLowerCase()} broke!`, 'bad'); events.emit('sfx', 'break'); }
  }
  addXp(n) {
    const s = this.s; s.xp += n;
    while (s.level < LEVELS.length && s.xp >= LEVELS[s.level]) {
      s.level++;
      const news = RECIPES.filter((r) => r.level === s.level).map((r) => r.name);
      this.hud.banner('Level up!', `Level ${s.level}`, news.length ? `You can now make: ${news.join(', ')}` : '');
      events.emit('sfx', 'level'); this.bagVer++;
    }
  }
  damage(n, why) {
    this.s.hp = Math.max(0, this.s.hp - n); this.hurtT = 0.6;
    this.hud.hurt(); this.hud.gain(`${why || 'Ouch'}: -${Math.round(n)} health`, 'bad'); events.emit('sfx', 'hurt');
  }

  /* ------------------------------------------------------------ starting, resuming, leaving */
  open() {
    this.build();
    const saved = this.readSave();
    this.activate(false);
    this.paused = true; env.paused = true;
    if (saved) {
      this.hud.menu(`<h1>Survival</h1><p>You washed ashore. Stay alive, build a camp, and find your way home.</p>
        <div class="stats"><span>Day</span><b>${saved.day}</b><span>Level</span><b>${saved.level}</b></div>
        <div class="stack"><button class="sv-btn pri" id="svCont">Continue · Day ${saved.day}</button><button class="sv-btn" id="svNew">New game</button><button class="sv-btn" id="svBack">Back to the island</button></div>`,
      { '#svCont': () => this.begin(saved), '#svNew': () => this.begin(null), '#svBack': () => this.close() });
    } else {
      this.hud.menu(`<h1>Survival</h1><p>The galleon is gone and you are alone on a beautiful, dangerous island. Eat, drink and rest; gather and craft; build a camp and a raft, and sail for home.</p>${CONTROLS_HTML}
        <div class="stack"><button class="sv-btn pri" id="svNew">Wake up on the beach</button><button class="sv-btn" id="svBack">Back to the island</button></div>`,
      { '#svNew': () => this.begin(null), '#svBack': () => this.close() });
    }
  }
  /** switch the world over to the game (camera, interface, the AI castaway steps aside) */
  activate() {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('sv-on');
    input.active = true; input.keys.clear();
    cam.suspended = true; cam.follow = null; cam.tour = false;
    camera.near = 0.3; camera.fov = 55; camera.updateProjectionMatrix();
    castawayAI.paused = true;
    const c = creatures.find((q) => q.name === 'The Castaway'); if (c) { this.aiGroup = c.group; c.group.visible = false; }
    this.prevSpeed = env.speed;
  }
  begin(saved) {
    this.hud.closeMenu();
    this.paused = false; env.paused = false; this.dead = false; this.ending = false;
    for (const s of this.structs) s.dispose(); this.structs = [];
    this.res.resetAll();
    this.s = newState();
    if (saved) this.applySave(saved); else this.newGameSetup();
    this.lastHours = env.hours; this.lastTod = env.tod; this.act = null; this.fishing = null; this.sleeping = null; this.placing = null; this.ghost.hide();
    env.speed = 1; env.paused = false;
    this.player.reset(this.s.pos ? this.s.pos.x : this.spawn.x, this.s.pos ? this.s.pos.z : this.spawn.z, this.s.pos ? this.s.pos.h : Math.atan2(-this.spawn.x, -this.spawn.z));
    this.avatar.hold(null); this.avatar.show(true); this.res.setVisible(true); this.setStructsVisible(true);
    this.running = true;
    this.bagVer++;
    this.hud.fade(1, 0); setTimeout(() => this.hud.fade(0, 1400), 60);
    if (!saved) setTimeout(() => this.hud.banner('Washed ashore', 'Survive.', 'Pick up sticks, stones and plant fibre. Look for sparkles.'), 900);
    this.hud.q('#sv-quest').dataset.id = '';
  }
  newGameSetup() {
    env.tod = 7.1; this.s.tod = 7.1;
    this.res.addCrate(falls.camp.x + 3.5, falls.camp.z + 2.0, [['can', 2], ['bottle', 1], ['bandage', 1], ['rope', 2]]);
  }
  /** leave survival, back to watching the island */
  close() {
    if (!this.active) return;
    if (this.s && this.sleeping) this.wake(true);
    if (this.built && this.running && !this.dead && !this.ending) this.save();
    this.running = false;
    this.hud.closeMenu(); this.hud.openPanel(false);
    this.active = false; document.body.classList.remove('sv-on');
    input.active = false; input.keys.clear();
    env.speed = 1; env.paused = false;
    castawayAI.paused = false; if (this.aiGroup) this.aiGroup.visible = true;
    this.res.setVisible(false); this.avatar.show(false); this.ghost.hide();
    this.lights.forEach((l) => { l.intensity = 0; });
    this.setStructsVisible(false);
    cam.suspended = false;
    // leave the camera where he stood, looking over the island
    const p = this.player.pos;
    cam.goto([p.x + 22, p.y + 16, p.z + 22], [p.x, p.y + 2, p.z]);
    this.paused = false;
  }
  setStructsVisible(v) { for (const s of this.structs) s.mesh.visible = v; }

  /* ------------------------------------------------------------ keys */
  onKey(code) {
    if (!this.active) return;
    if (this.dead || this.ending) return;
    if (this.hud.menuOpen) { if (code === 'Escape' && this.paused && this.pauseMenu) this.resume(); return; }
    if (code === 'Escape') {
      if (this.hud.panelOpen) return this.togglePanel(false);
      if (this.placing) return this.cancelPlace();
      if (this.fishing) return this.stopFishing('You reel in.');
      return this.pause();
    }
    if (this.paused) return;
    if (code === 'Tab') return this.togglePanel();
    if (this.sleeping) return;
    if (this.placing) { if (code === 'KeyR') this.placing.yaw += Math.PI / 4; return; }
    if (/^Digit[1-9]$/.test(code)) { const foods = this.foodList(); const id = foods[Number(code.slice(5)) - 1]; if (id) this.eat(id); return; }
    if (code === 'KeyQ') this.drinkCanteen();
    if (code === 'KeyT') this.toggleTorch();
  }
  foodList() { return Object.keys(ITEMS).filter((id) => ITEMS[id].food && this.count(id) > 0).sort((a, b) => ['coconut', 'clam', 'rawFish', 'rawCrab', 'cookedFish', 'cookedCrab', 'cookedClam', 'driedFish', 'can', 'bottle', 'bandage'].indexOf(a) - ['coconut', 'clam', 'rawFish', 'rawCrab', 'cookedFish', 'cookedCrab', 'cookedClam', 'driedFish', 'can', 'bottle', 'bandage'].indexOf(b)); }
  togglePanel(v) {
    const open = v ?? !this.hud.panelOpen;
    this.hud.openPanel(open);
    env.paused = open || this.paused;       // browsing the bag stops the clock
    if (open) events.emit('sfx', 'open');
  }
  pause() {
    this.paused = true; env.paused = true; this.pauseMenu = true;
    this.hud.menu(`<h1>Paused</h1>${CONTROLS_HTML}<div class="stack"><button class="sv-btn pri" id="svRes">Resume</button><button class="sv-btn" id="svStuck">I am stuck - back to camp</button><button class="sv-btn" id="svSave">Save and return to the island</button><button class="sv-btn" id="svRestart">Start over</button></div>`,
      { '#svRes': () => this.resume(), '#svStuck': () => { this.resume(); this.unstick(); }, '#svSave': () => this.close(), '#svRestart': () => { this.pauseMenu = false; this.hud.closeMenu(); this.begin(null); } });
  }
  /** lift him out of a bad spot: back to the nearest campfire or shelter, else the landing cove */
  unstick() {
    let best = null, bd = 1e9;
    for (const q of this.structs) { if (q.type !== 'campfire' && q.type !== 'shelter') continue; const d = Math.hypot(q.x - this.player.pos.x, q.z - this.player.pos.z); if (d < bd) { bd = d; best = q; } }
    const x = best ? best.x + 2.4 : this.spawn.x, z = best ? best.z + 2.4 : this.spawn.z;
    this.player.reset(x, z, this.player.heading);
    this.hud.fade(0, 600);
  }
  resume() { this.hud.closeMenu(); this.pauseMenu = false; this.paused = false; env.paused = false; }

  /* ------------------------------------------------------------ jobs (timed actions) */
  startAct(kind, dur, o = {}) {
    if (this.act || this.fishing || this.sleeping) return false;
    this.act = { kind, dur, t: 0, ...o };
    this.avatar.hold(o.held || null, o.off || null);
    return true;
  }
  finishAct() {
    const a = this.act; this.act = null;
    this.avatar.hold(this.torchLeft > 0 ? 'torch' : null);
    if (a && a.done) a.done();
  }

  gatherNode(n) {
    const kind = n.kind;
    this.startAct('gather', 0.55, { done: () => {
      const result = gatherResource(this, n, rnd);
      if (!result) return;
      if (result.pearl) this.hud.banner('A pearl!', 'Lucky find', 'There was a pearl inside the clam.');
      events.emit('sfx', 'pickup');
    } });
  }
  chopLog(n) {
    this.startAct('chop', 2.1, { held: 'axe', marks: [0.17, 0.5, 0.83], done: () => {
      this.useTool('axe');
      if (!n.alive) return;
      this.res.take(n, this.hoursAbs); this.add('timber', rnd() < 0.3 ? 3 : 2); this.bump('gathered.log'); this.addXp(4);
    } });
  }
  shakePalm(i) {
    const pm = palms[i];
    this.startAct('shake', 1.3, { done: () => {
      this.s.palmCD[i] = this.hoursAbs + 22;
      const nuts = 1 + (rnd() < 0.5 ? 1 : 0);
      for (let k = 0; k < nuts; k++) this.res.dropCoconut(pm.x, pm.z, pm.crown.y - 0.6, this.hoursAbs);
      this.add('frond', 1 + (rnd() < 0.55 ? 1 : 0));
      this.hud.gain(`${nuts} coconut${nuts > 1 ? 's' : ''} fell: pick them up`, 'good');
      events.emit('sfx', 'thud'); this.addXp(2); this.bump('shook');
    }, marks: [0.3, 0.6, 0.9] });
  }
  drinkWater() {
    this.startAct('drink', 2.4, { done: () => { this.s.water = Math.min(100, this.s.water + 44); this.bump('drinks'); if (this.s.water < 85) this.addXp(1); events.emit('sfx', 'drink'); } });
  }
  fillCanteen() {
    this.startAct('drink', 1.6, { done: () => { this.s.dur.canteen = ITEMS.canteen.uses; this.bagVer++; this.hud.gain('🫗 Canteen filled', 'good'); events.emit('sfx', 'drink'); } });
  }
  drinkCanteen() {
    if (!this.count('canteen') || !(this.s.dur.canteen > 0)) { this.hud.gain('Your canteen is empty: fill it at fresh water', 'bad'); return; }
    if (this.s.water > 94) return;
    this.startAct('drinkCanteen', 1.5, { off: 'canteen', done: () => { this.s.dur.canteen--; this.s.water = Math.min(100, this.s.water + 32); this.bagVer++; this.bump('drinks'); events.emit('sfx', 'drink'); } });
  }
  eat(id) {
    const it = ITEMS[id];
    if (!it || !it.food || this.count(id) < 1) return;
    const f = it.food;
    if (this.act) return;
    if (f.hunger && !f.thirst && !f.health && this.s.food > 97) { this.hud.gain('You are full', 'bad'); return; }
    if (id === 'bandage' && this.s.hp > 90) { this.hud.gain('You are not hurt', 'bad'); return; }
    this.startAct(id === 'bandage' ? 'eat' : 'eat', 1.5, { off: id === 'coconut' ? 'coconut' : null, done: () => {
      if (this.count(id) < 1) return;
      this.take(id, 1); const s = this.s;
      s.food = Math.min(100, s.food + (f.hunger || 0)); s.water = Math.min(100, s.water + (f.thirst || 0)); s.hp = Math.min(100, s.hp + (f.health || 0));
      const bits = [f.hunger && `+${f.hunger} food`, f.thirst && `+${f.thirst} water`, f.health && `+${f.health} health`].filter(Boolean);
      this.hud.gain(`${it.icon} ${it.name}: ${bits.join(', ')}`, 'good');
      if (f.sick && rnd() < f.sick) { s.sick = 3; this.hud.gain('🤢 That did not agree with you', 'bad'); }
      this.bump('ate.' + id); this.addXp(f.hunger > 20 ? 2 : 1); events.emit('sfx', 'eat');
    } });
  }
  feedFire(s) {
    this.startAct('wood', 0.9, { done: () => {
      const result = fuelFire(this, s, BUILD.campfire.maxFuel);
      if (!result) return;
      if (result.wasOut) this.hud.banner('The fire is lit', 'Warmth and light', 'Cook your food here with E.');
      events.emit('sfx', 'fire');
    } });
  }
  cook(s) {
    const map = { rawFish: 'cookedFish', rawCrab: 'cookedCrab', clam: 'cookedClam' };
    const n = Object.keys(map).reduce((a, id) => a + this.count(id), 0);
    if (!n) return;
    this.startAct('cook', Math.min(4.2, 0.9 + 0.6 * n), { done: () => {
      for (const [raw, done] of Object.entries(map)) { const c = this.count(raw); if (c) { this.take(raw, c); this.add(done, c); this.bump('cooked', c); this.addXp(3 * c); } }
      events.emit('sfx', 'sizzle');
    } });
  }
  rackHang(r) {
    this.startAct('grab', 0.9, { done: () => {
      let n = 0;
      for (let i = 0; i < r.slots.length; i++) {
        if (r.slots[i] !== 0) continue;
        const id = this.count('rawFish') ? 'rawFish' : this.count('rawCrab') ? 'rawCrab' : null;
        if (!id) break;
        this.take(id, 1); r.slots[i] = 2.5; n++;
      }
      if (n) this.hud.gain(`🐟 Hung ${n} to dry`, 'good');
    } });
  }
  rackCollect(r) {
    this.startAct('grab', 0.8, { done: () => {
      let n = 0;
      r.slots.forEach((v, i) => { if (v > 0 && v <= 0.0003) { r.slots[i] = 0; n++; } });
      if (n) { this.add('driedFish', n); this.bump('dried', n); this.addXp(3 * n); }
    } });
  }
  catchCrab(c) {
    const spear = this.count('spear') > 0, name = c.name;
    this.startAct('grab', 0.9, { held: spear ? 'spear' : null, done: () => {
      if (!c.group.visible) return;
      const base = /coconut/i.test(name) ? 0.4 : /hermit/i.test(name) ? 0.85 : /ghost/i.test(name) ? 0.4 : 0.55;
      if (rnd() < (spear ? 0.95 : base)) {
        c.group.visible = false; this.crabBack.push({ c, at: this.hoursAbs + 1.4 });
        const n = /coconut/i.test(name) ? 2 : 1;
        this.add('rawCrab', n); this.bump('caught.crab'); this.addXp(5); if (spear) this.useTool('spear');
        events.emit('sfx', 'pickup');
      } else {
        this.hud.gain('It scuttled away!', 'bad');
        if (!spear && (/coconut/i.test(name) || rnd() < 0.2)) this.damage(/coconut/i.test(name) ? 9 : 4, 'Pinched');
      }
    } });
  }
  spearFish() {
    this.startAct('spear', 1.0, { held: 'spear', done: () => {
      const day = env.day > 0.4;
      if (rnd() < (day ? 0.55 : 0.4)) { this.useTool('spear'); this.add('rawFish', 1); this.bump('fish'); this.addXp(6); this.hud.gain(`🔱 You speared a ${pick(FISH_SEA)}`, 'good'); fx.splash(this.player.pos.x + Math.sin(this.player.heading) * 1.2, env.tide, this.player.pos.z + Math.cos(this.player.heading) * 1.2, 0.5); }
      else { this.hud.gain('Missed! It darted away', 'bad'); fx.splash(this.player.pos.x + Math.sin(this.player.heading) * 1.1, env.tide, this.player.pos.z + Math.cos(this.player.heading) * 1.1, 0.35); }
    } });
  }
  openCrate(c) {
    this.startAct('grab', 1.3, { done: () => {
      this.res.removeCrate(c);
      const parts = [];
      for (const [id, n] of c.loot) { this.add(id, n, true); parts.push(`${n > 1 ? n + ' ' : ''}${ITEMS[id].icon} ${ITEMS[id].name}`); }
      this.hud.banner('Supplies!', 'You found a crate', parts.join(' · '));
      this.bump('crates'); this.addXp(8); events.emit('sfx', 'level');
    } });
  }

  /* ------------------------------------------------------------ fishing */
  startFishing(wa) {
    if (this.act || this.fishing) return;
    this.avatar.hold('rod');
    this.fishing = { phase: 'cast', t: 0, target: new THREE.Vector3(wa.x, waterY(wa.x, wa.z), wa.z), kind: wa.kind, plT: 1.2, nibT: 0, bob: new THREE.Vector3(), from: new THREE.Vector3(), wait: 0, launched: false };
    this.player.heading = Math.atan2(wa.x - this.player.pos.x, wa.z - this.player.pos.z);
  }
  stopFishing(msg) {
    this.fishing = null; this.fishBite = false;
    this.avatar.lineTo(null); this.avatar.hold(this.torchLeft > 0 ? 'torch' : null);
    if (msg) this.hud.gain(msg);
  }
  updateFishing(dt) {
    const f = this.fishing, av = this.avatar, p = this.player;
    f.t += dt;
    f.target.y = waterY(f.target.x, f.target.z);          // the float rides the swell and the tide
    const moveKey = input.held('KeyW') || input.held('KeyA') || input.held('KeyS') || input.held('KeyD');
    if (moveKey && f.phase !== 'show') return this.stopFishing('You reel in.');
    const strike = input.hit('KeyE');
    if (f.phase === 'cast') {
      av.job('cast', f.t / 1.3, f.t);
      if (f.t > 0.55 && !f.launched) { f.launched = true; av.rodTipPos(f.from); }
      if (f.launched) {
        const k = clamp((f.t - 0.55) / 0.75, 0, 1);
        f.bob.lerpVectors(f.from, f.target, k); f.bob.y += Math.sin(k * Math.PI) * 3.0;
        if (k >= 1 && !f.splashed) { f.splashed = true; fx.splash(f.target.x, f.target.y, f.target.z, 0.35); }
      }
      av.lineTo(f.launched ? f.bob : null, 0.4);
      if (f.t > 1.35) { f.phase = 'wait'; f.t = 0; const good = env.dusk > 0.3 || env.tod < 8.5; f.wait = rr(good ? 2.2 : 3.2, good ? 5.5 : 8); f.bob.copy(f.target); }
    } else if (f.phase === 'wait') {
      av.job('wait', 0, f.t);
      f.bob.y = f.target.y + Math.sin(f.t * 1.7) * 0.025;
      f.plT -= dt; if (f.plT < 0) { f.plT = rr(1.8, 3.4); fx.plink(f.bob.x, f.bob.z, 0.8); }
      // a fish noses the float just before it bites: quick small rings and a twitch, your cue to be ready
      if (f.wait - f.t < 1.1) { f.nibT -= dt; if (f.nibT < 0) { f.nibT = rr(0.25, 0.45); fx.plink(f.bob.x, f.bob.z, 0.6); } f.bob.y -= 0.025 * Math.max(0, Math.sin(f.t * 22)); }
      av.lineTo(f.bob, 0.35);
      if (strike) { this.stopFishing('Too early: wait for the bite!'); return; }
      if (f.t > f.wait) { f.phase = 'bite'; f.t = 0; this.fishBite = true; fx.splash(f.target.x, f.target.y, f.target.z, 0.3); fx.plink(f.bob.x, f.bob.z, 1.6); f.pulse = 0; events.emit('sfx', 'bite'); }
    } else if (f.phase === 'bite') {
      av.job('bite', 0, f.t);
      f.bob.y = f.target.y - 0.05 - 0.08 * Math.abs(Math.sin(f.t * 16));
      f.pulse -= dt; if (f.pulse < 0) { f.pulse = 0.22; fx.plink(f.bob.x, f.bob.z, 1.2); }
      av.lineTo(f.bob, 0.2);
      if (strike) { f.phase = 'reel'; f.t = 0; this.fishBite = false; }
      else if (f.t > 1.25) { this.fishBite = false; this.stopFishing('It got away…'); }
    } else if (f.phase === 'reel') {
      const k = clamp(f.t / 2.0, 0, 1);
      av.job('reel', k, f.t);
      av.handPos(this._h || (this._h = new THREE.Vector3()));
      f.bob.x = f.target.x + (this._h.x - f.target.x) * k * 0.96; f.bob.z = f.target.z + (this._h.z - f.target.z) * k * 0.96;
      f.bob.y = f.target.y + Math.abs(Math.sin(f.t * 12)) * 0.05 * (1 - k) + k * Math.max(0, this._h.y - 0.4 - f.target.y) * 0.9;
      if (Math.random() < dt * 5 && k < 0.9) fx.splash(f.bob.x, f.target.y, f.bob.z, 0.15);
      if (k < 0.92) waterWake(f, f.bob.x, f.bob.z, 2.6 * (1 - k) + 0.8, 0.3, dt, 0.5);
      av.lineTo(f.bob, 0.15);
      if (f.t > 2.0) {
        const r = rnd(); let n = 1, label;
        if (f.kind === 'fresh') label = pick(FISH_FRESH);
        else if (r < 0.05) { n = 3; label = 'yellowfin tuna'; } else if (r < 0.25) { n = 2; label = 'big ' + pick(FISH_SEA); } else label = pick(FISH_SEA);
        f.phase = 'show'; f.t = 0; f.catch = { n, label };
        this.add('rawFish', n, true); this.useTool('rod'); this.bump('fish', n); this.addXp(7 + n);
        this.hud.banner('You caught a fish!', `${n > 1 ? n + ' × ' : 'a '}${label}`, n > 1 ? 'A good one!' : '');
        events.emit('sfx', 'catch'); av.lineTo(null);
      }
    } else if (f.phase === 'show') {
      av.job('show', 0, f.t);
      if (f.t > 1.6) this.stopFishing();
    }
  }

  /* ------------------------------------------------------------ building */
  craft(id) {
    const r = RECIPES.find((q) => q.id === id);
    if (!r || r.level > this.s.level || this.act || this.fishing) return;
    if (!canAfford(this, r.cost)) return;
    if (r.place) { this.togglePanel(false); this.placing = { recipe: r, yaw: this.player.heading }; this.ghost.show(r.place); return; }
    spend(this, r.cost);
    this.togglePanel(false);
    this.startAct('craft', 1.5, { done: () => {
      awardRecipe(this, r); events.emit('sfx', 'craft');
      this.hud.banner('Crafted', ITEMS[r.gives].name, ITEMS[r.gives].desc);
      this.save();
    }, marks: [0.2, 0.45, 0.7] });
  }
  cancelPlace() { this.placing = null; this.ghost.hide(); this.hud.gain('Cancelled: nothing was used'); }
  updatePlacing(dt) {
    const pl = this.placing, p = this.player.pos, h = this.player.heading;
    const dist = pl.recipe.place === 'raft' ? 3.4 : 2.9;
    // the raft is placed on the shore: slide out along the facing until the land meets the water
    let x = p.x + Math.sin(h) * dist, z = p.z + Math.cos(h) * dist;
    if (pl.recipe.place === 'raft') { for (let d = 1.5; d < 12; d += 0.5) { const qx = p.x + Math.sin(h) * d, qz = p.z + Math.cos(h) * d; if (getHeight(qx, qz) < 0.25) { x = qx; z = qz; break; } } }
    const reason = canPlace(pl.recipe.place, x, z, this.structs);
    this.ghost.set(x, z, pl.yaw, reason);
    pl.pos = { x, z }; pl.reason = reason;
    if (input.hit('KeyE')) {
      if (reason) { this.hud.gain(`Can't build here: ${reason}`, 'bad'); events.emit('sfx', 'nope'); return; }
      const result = constructRecipe(this, pl.recipe, { x, z, yaw: pl.yaw }, canPlace, (...args) => new Structure(...args));
      if (result.error) { this.hud.gain(result.error, 'bad'); return; }
      const st = result.structure;
      this.structs.push(st); this.s.structs.push(st);
      this.hud.banner('Built', BUILD[pl.recipe.place].name, '');
      events.emit('sfx', 'craft');
      this.placing = null; this.ghost.hide(); this.save();
    }
  }

  /* ------------------------------------------------------------ sleep */
  canSleep() { const n = env.tod >= 19.5 || env.tod < 5.5; return (n || this.s.energy < 80) && this.s.food > 1; }
  sleep(shel) {
    if (this.act || this.sleeping || this.fishing) return;
    this.sleeping = { s: shel, t: 0, tod0: env.tod, phase: 'down', hours0: env.hours };
    this.hud.fade(1, 900);
  }
  wake(quiet) {
    const sl = this.sleeping; if (!sl) return;
    this.sleeping = null; env.speed = 1;
    this.hud.fade(0, 1400);
    const s = sl.s, p = this.player;
    p.pos.set(s.x + Math.sin(s.yaw) * 1.9, getHeight(s.x + Math.sin(s.yaw) * 1.9, s.z + Math.cos(s.yaw) * 1.9), s.z + Math.cos(s.yaw) * 1.9);
    p.heading = s.yaw; p.cYaw = s.yaw + Math.PI;
    if (!quiet) {
      if (env.hours - sl.hours0 >= 4 && (sl.tod0 >= 19 || sl.tod0 < 5)) { this.bump('slept'); this.addXp(12); }
      this.hud.banner('You wake up', this.s.energy > 90 ? 'Fully rested' : 'A little rested', `Day ${this.day}`);
      this.save();
    }
  }
  sailAway(r) {
    if (this.ending) return;
    this.ending = { t: 0, raft: r, from: this.player.pos.clone() };
    this.hud.banner('Anchors aweigh', 'You push off', 'The island shrinks behind you…');
  }

  /* ------------------------------------------------------------ saving */
  serialize() {
    const s = this.s, h = this.hoursAbs;
    const palmCD = {}; for (const [k, v] of Object.entries(s.palmCD)) if (v > h) palmCD[k] = +(v - h).toFixed(1);
    return { ...s, structs: this.structs.map((q) => q.serialize()), palmCD, tod: env.tod, torch: this.torchLeft, pos: this.climber && this.climber.active ? (() => { const st = stationBelow(this.climber.u - 0.02); return { x: st.x, z: st.z, h: this.player.heading }; })() : { x: this.player.pos.x, z: this.player.pos.z, h: this.player.heading },
      nodes: this.res.snapshot(h), t: Date.now(), v: 1 };
  }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize())); } catch (e) { /* storage blocked */ } }
  readSave() { try { const j = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return j && j.v === 1 ? j : null; } catch (e) { return null; } }
  applySave(d) {
    const h = this.hoursAbs;
    this.s = { ...newState(), ...d, structs: [], palmCD: {} };
    for (const [k, v] of Object.entries(d.palmCD || {})) this.s.palmCD[k] = h + v;
    this.torchLeft = d.torch || 0;
    env.tod = d.tod;
    for (const q of d.structs || []) { const st = new Structure(q.type, q.x, q.z, q.yaw); st.fuel = q.fuel || 0; st.slots = q.slots || [0, 0, 0]; this.structs.push(st); this.s.structs.push(st); }
    this.res.restore(d.nodes, h);
  }

  /* ------------------------------------------------------------ deaths and endings */
  die() {
    if (this.dead) return;
    this.dead = true; this.s.deaths++; this.fishing = null; this.act = null; this.fishBite = false; this.avatar.lineTo(null);
    this.hud.fade(1, 1400);
    setTimeout(() => {
      this.hud.menu(`<h1>You collapsed</h1><p>Hunger, thirst and exhaustion caught up with you. Everything went dark…</p>
        <div class="stats"><span>Days survived</span><b>${this.day}</b><span>Level</span><b>${this.s.level}</b><span>Fish caught</span><b>${this.stat('fish')}</b><span>Items made</span><b>${Object.keys(this.s.stats).filter((k) => k.startsWith('crafted.')).reduce((a, k) => a + this.s.stats[k], 0)}</b></div>
        <p>You wake on the beach, weak but alive. You lost half of what you were carrying.</p>
        <div class="stack"><button class="sv-btn pri" id="svWake">Wake up</button></div>`, { '#svWake': () => this.respawn() });
    }, 1600);
  }
  respawn() {
    this.hud.closeMenu(); const s = this.s;
    s.hp = 55; s.food = 50; s.water = 50; s.energy = 60; s.sick = 0;
    for (const id of Object.keys(s.inv)) { if (ITEMS[id].tool) continue; s.inv[id] = Math.floor(s.inv[id] / 2); if (!s.inv[id]) delete s.inv[id]; }
    this.bagVer++;
    this.player.reset(this.spawn.x, this.spawn.z, 0);
    env.tod = 7.1; s.day += 1; this.dead = false; this.lastHours = env.hours; this.lastTod = env.tod; this.torchLeft = 0;
    this.hud.fade(0, 1500); this.hud.banner('A new morning', `Day ${s.day}`, 'You are weak. Eat and drink first.');
    this.save();
  }
  torchOn() { return this.torchLeft > 0; }
  toggleTorch() {
    if (this.torchLeft > 0) { this.torchLeft = 0; this.hud.gain('🔦 Torch put out'); return; }
    if (!this.count('torch')) { this.hud.gain('You have no torch: craft one (level 2)', 'bad'); return; }
    this.take('torch', 1); this.torchLeft = 3.2; this.hud.gain('🔦 Torch lit: burns for about 3 hours');
  }

  /* ------------------------------------------------------------ the frame */
  update(dtReal) {
    if (!this.active) return;
    const dt = Math.min(dtReal, 0.05);
    const live = !this.paused && !this.dead;
    if (live) this.tick(dt);
    this.hud.update(dt, this);
    input.frame();
  }

  tick(dt) {
    const s = this.s, P = this.player, av = this.avatar, I = input;
    let dh = env.hours - this.lastHours; this.lastHours = env.hours; dh = clamp(dh, 0, 3);
    // a new day dawns at six
    if (this.lastTod < 6 && env.tod >= 6 && env.tod < 7) this.newDay();
    this.lastTod = env.tod;

    // ---- an ending is a little movie
    if (this.ending) return this.tickEnding(dt);

    // ---- what the player is doing
    const frozen = !!this.act || !!this.fishing || !!this.sleeping || this.climber.active;
    const ctl = {
      fwd: (I.held('KeyW') || I.held('ArrowUp') ? 1 : 0) - (I.held('KeyS') || I.held('ArrowDown') ? 1 : 0),
      str: (I.held('KeyD') ? 1 : 0) - (I.held('KeyA') ? 1 : 0),
      run: I.held('ShiftLeft') || I.held('ShiftRight'), jump: I.hit('Space') || I.held('Space'), frozen,
      slow: s.energy < 14 ? 0.72 : 1,
    };
    // moving cancels long jobs
    if (this.act && this.act.cancel && (ctl.fwd || ctl.str)) { this.act = null; this.avatar.hold(this.torchLeft > 0 ? 'torch' : null); }
    if (this.sleeping) this.tickSleep(dt, dh);
    if (this.climber.active) this.tickClimb(dt, dh, ctl); else P.update(dt, ctl);
    this.sheltered = this.structs.some((q) => q.type === 'shelter' && Math.hypot(q.x - P.pos.x, q.z - P.pos.z) < 2.6);
    this.stormy = wx.rain > 0.45;

    // ---- interaction
    this.actT -= dt;
    if (this.actT <= 0 && !frozen && !this.placing) { this.actT = 0.1; this.acts = collectActions(this); }
    let E = null, F = null, prog = null, hint = '';
    if (this.placing) {
      this.updatePlacing(dt);
      const pl = this.placing;
      if (pl) {
        E = { key: 'E', label: pl.reason ? `Can't build here` : `Place ${BUILD[pl.recipe.place].name}`, note: pl.reason || '', off: !!pl.reason };
        F = { key: 'R', label: 'Rotate' };
        hint = 'Esc cancels';
      }
    } else if (this.climber.active) {
      const C = this.climber;
      E = { key: 'E', label: C.rest ? 'Step back to the ledge' : 'Let go', note: C.rest ? '' : 'you drop to the ledge below' };
      hint = s.energy < 14 ? 'Your arms are tiring: rest on a ledge' : 'W / S climb · A / D shuffle · Shift hurry · rest on the ledges';
      if (I.hit('KeyE')) this.letGo();
    } else if (this.fishing) {
      const f = this.fishing;
      E = f.phase === 'bite' ? { key: 'E', label: 'Strike now!' } : f.phase === 'wait' ? { key: 'E', label: 'Waiting for a bite…', off: true } : f.phase === 'reel' ? { key: '•', label: 'Reeling in…' } : null;
      hint = 'Move or Esc to stop fishing';
    } else if (this.act) {
      prog = this.act.t / this.act.dur;
    } else if (!this.sleeping) {
      const list = this.acts.filter((a) => !(a.off && a.prio < 1 && this.acts.some((b) => !b.off)));
      const e = list[0], f2 = list.find((a) => a !== e && a.id !== (e && e.id));
      if (e) E = { key: 'E', label: e.label, note: e.note, off: e.off };
      if (f2 && !f2.off) F = { key: 'F', label: f2.label, note: f2.note };
      if (I.hit('KeyE') && e) { if (e.off) { events.emit('sfx', 'nope'); } else e.run(); }
      else if (I.hit('KeyF') && f2 && !f2.off) f2.run();
      if (this.count('torch') && this.torchLeft <= 0 && env.night > 0.45) hint = 'T lights a torch';
      else if (!E && !F) hint = this.stat('gathered.stick') < 3 ? 'WASD move · Shift run · Space jump · drag to look · Tab: bag & crafting' : '';
    }
    if (this.fishing) this.updateFishing(dt);
    this.hud.prompt(E, F, prog);
    this.hud.hint(hint);

    // ---- run the current job
    if (this.act) this.tickAct(dt);

    // ---- the avatar
    if (this.sleeping && this.sleeping.phase !== 'down') {
      const sl = this.sleeping, st = sl.s;
      av.job('sleep', 0, performance.now() / 1000);
      av.apply(dt);
      av.place(st.x + Math.cos(st.yaw) * 0.0, st.y + 0.02, st.z, st.yaw + Math.PI / 2);
    } else {
      if (this.fishing) { if (this.fishing.phase === 'cast' || true) { /* poses set in updateFishing */ } }
      else if (this.act) av.job(this.act.kind, clamp(this.act.t / this.act.dur, 0, 1), performance.now() / 1000);
      else if (this.hurtT > 0) av.job('hurt', 1 - this.hurtT / 0.6, 0);
      else if (this.placing) av.idle(performance.now() / 1000);
      else if (this.climber.active) av.job('climb', this.climber.phase, this.climber.moving);
      else if (P.swimming) av.swim(dt, P.speed);
      else if (P.moving) av.gait(dt, P.speed, P.run, false);
      else av.idle(performance.now() / 1000);
      if (!P.swimming && !(this.act && this.act.kind === 'sleep')) av.me.chest.scale.set(1, 1, 1);
      av.apply(dt);
      if (this.climber.active) av.place(this.climber.pos.x, this.climber.pos.y, this.climber.pos.z, this.climber.heading, this.climber.lean);
      else av.place(P.pos.x, P.pos.y, P.pos.z, P.heading);
    }
    this.hurtT = Math.max(0, this.hurtT - dt);

    // ---- the world
    this.threats(dt);
    this.res.update(dt, this.hoursAbs, P.pos);
    for (const q of this.structs) q.update(dt, dh, performance.now() / 1000);
    this.updateLights(dt);
    this.crabsBack();
    this.needs(dt, dh);
    this.clockT -= dt;
    this.questT -= dt; if (this.questT <= 0) { this.questT = 0.5; this.checkQuests(); this.checkDiscoveries(); }
    this.saveT -= dt; if (this.saveT <= 0) { this.saveT = 15; this.save(); }
    if (this.torchLeft > 0) { this.torchLeft -= dh; if (this.torchLeft <= 0) { this.torchLeft = 0; this.hud.gain('🔦 Your torch burned out'); if (!this.act) this.avatar.hold(null); } else if (!this.act && !this.fishing) this.avatar.hold('torch'); }
    this.player.updateCamera(dt, this.sleeping ? 0.9 : 1.45);
  }

  /* ------------------------------------------------------------ climbing Mount Ignis */
  startClimb(st) {
    if (this.act || this.fishing || this.climber.active) return;
    this.avatar.hold(null);
    this.climber.start(st.u);
    this.hud.gain(st.id === 'top' ? '⛰ You start down the wall' : '⛰ You take hold of the rock', 'good');
    events.emit('sfx', 'tap');
  }
  tickClimb(dt, dh, ctl) {
    const C = this.climber, s = this.s, P = this.player;
    const r = C.update(dt, { up: ctl.fwd, side: ctl.str, fast: ctl.run && s.energy > 18, tired: s.energy < 12 });
    // hauling yourself up the rock is hard work; a rest on a ledge gets some of it back
    if (C.moving > 0.1) s.energy = Math.max(0, s.energy - (ctl.run ? 24 : 14) * dh * (ctl.fwd < 0 ? 0.35 : 1));
    else if (C.rest) s.energy = Math.min(100, s.energy + 14 * dh);
    P.pos.copy(C.pos); P.vel.set(0, 0, 0); P.vy = 0; P.grounded = true; P.speed = 0; P.moving = false; P.heading = C.heading; P.swimming = false;
    // the camera swings round behind him, out in the air in front of the wall
    let d = (C.heading + Math.PI) - P.cYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); P.cYaw += d * Math.min(1, dt * 2.2);
    if (s.energy <= 0.4 && C.moving > 0.05 && ctl.fwd > 0) { this.climbFall('Your arms gave out'); return; }
    if (r) this.dismount(r);
  }
  letGo() {
    const C = this.climber;
    if (C.rest) { this.dismount(stationBelow(C.u).id === 'base' ? 'base' : 'ledge'); return; }
    this.climbFall('You let go');
  }
  climbFall(why) {
    const C = this.climber;
    const drop = C.fall();
    const dmg = Math.min(60, Math.max(0, drop * 0.85 - 2));
    if (dmg > 0.5) this.damage(dmg, why); else this.hud.gain(why, 'bad');
    events.emit('sfx', 'hurt');
  }
  dismount(which) {
    const C = this.climber, P = this.player;
    if (which === 'ledge') { C.stop(); const st = stationBelow(C.u); P.reset(st.x, st.z, C.heading); return; }
    const e = exitPoint(which);
    C.stop();
    P.reset(e.x, e.z, which === 'top' ? C.heading : C.heading + Math.PI);
    if (which === 'top') { this.hud.banner('The summit', 'Mount Ignis', 'Walk the rim to look into the mouth. Come down the way you came.'); events.emit('sfx', 'quest'); }
  }

  /** after dark the jungle is not safe: a wild boar may charge you unless you are by a fire, sheltered or holding a torch */
  threats(dt) {
    const P = this.player, now = performance.now() / 1000;
    this.threatT = (this.threatT ?? 0) - dt;
    if (this.threatT > 0) { this.chargeUpdate(dt); return; }
    this.threatT = 0.4;
    const dark = env.night > 0.35 || env.dusk > 0.6;
    const safe = this.sheltered || this.sleeping || this.torchLeft > 0 || this.structs.some((q) => q.lit && Math.hypot(q.x - P.pos.x, q.z - P.pos.z) < 9) || P.swimming;
    if (this.charger || !dark || safe) { this.chargeUpdate(dt); return; }
    for (const c of creatures) {
      if (!c.sim || !c.sim.isBoar || c.sim.baby) continue;
      const b = c.sim, d = Math.hypot(b.x - P.pos.x, b.z - P.pos.z);
      if (d < 15 && getHeight(P.pos.x, P.pos.z) > 2.0) {
        this.charger = { b, until: now + 9, hit: 0 };
        b.charge = true; b.fast = true; b.state = 'walk'; b.tx = P.pos.x; b.tz = P.pos.z; b.t = 1;
        this.hud.banner('A wild boar!', 'It is charging you', 'Run, get to a fire, or fight it off with a spear.');
        events.emit('sfx', 'growl');
        break;
      }
    }
  }
  chargeUpdate(dt) {
    const ch = this.charger; if (!ch) return;
    const P = this.player, b = ch.b, now = performance.now() / 1000;
    const d = Math.hypot(b.x - P.pos.x, b.z - P.pos.z);
    const safe = this.sheltered || this.sleeping || P.swimming || this.torchLeft > 0 || this.structs.some((q) => q.lit && Math.hypot(q.x - P.pos.x, q.z - P.pos.z) < 9);
    if (now > ch.until || d > 28 || safe || b.state === 'idle' && d > 4) { b.charge = false; b.fast = false; this.charger = null; return; }
    b.state = 'walk'; b.tx = P.pos.x; b.tz = P.pos.z; b.t = 1;
    if (d < 1.7) {
      if (this.count('spear')) { this.hud.gain('🔱 You jab the boar and it squeals and runs', 'good'); this.useTool('spear'); events.emit('sfx', 'growl'); b.charge = false; b.fast = false; b.state = 'walk'; b.tx = b.home.x; b.tz = b.home.z; this.charger = null; this.addXp(6); this.bump('boars'); }
      else if (now - ch.hit > 1.0) {
        ch.hit = now; this.damage(14, 'Gored by a boar');
        const dx = P.pos.x - b.x, dz = P.pos.z - b.z, l = Math.hypot(dx, dz) || 1; P.vel.x += (dx / l) * 7; P.vel.z += (dz / l) * 7;
        b.charge = false; b.fast = false; b.state = 'walk'; b.tx = b.home.x; b.tz = b.home.z; this.charger = null;
      }
    }
  }

  tickAct(dt) {
    const a = this.act; a.t += dt;
    if (a.marks) { const k = a.t / a.dur; a.hit = a.hit || 0; while (a.hit < a.marks.length && k >= a.marks[a.hit]) { a.hit++; events.emit('sfx', a.kind === 'chop' ? 'chop' : a.kind === 'craft' ? 'tap' : 'thud'); if (a.kind === 'shake') fx.sparkle.emit({ x: this.player.pos.x + Math.sin(this.player.heading) * 1.3, y: this.player.pos.y + 3.5, z: this.player.pos.z + Math.cos(this.player.heading) * 1.3, vy: -1, life: 0.8, s0: 0.3, s1: 0.1, c0: [0.5, 0.9, 0.4, 0.8], c1: [0.4, 0.8, 0.3, 0], grav: 4 }); } }
    if (a.t >= a.dur) this.finishAct();
  }

  tickSleep(dt, dh) {
    const sl = this.sleeping; sl.t += dt;
    if (sl.phase === 'down') { if (sl.t > 1.0) { sl.phase = 'asleep'; sl.t = 0; env.speed = 11; } return; }
    // wake when rested (or when morning has come and he has had a decent rest), or when the player presses a key
    const rested = this.s.energy >= 99, morning = env.tod >= 6.3 && env.tod < 11 && sl.tod0 >= 17 || (sl.tod0 < 5 && env.tod >= 6.3);
    if (rested || (morning && this.s.energy > 55) || (sl.t > 1.5 && (input.held('KeyW') || input.held('KeyA') || input.held('KeyS') || input.held('KeyD') || input.hit('KeyE')))) this.wake(false);
  }

  newDay() {
    const s = this.s; s.day++;
    this.hud.banner(`Day ${s.day}`, 'A new day dawns', s.day === 4 ? 'You have survived three days!' : '');
    // something washes up on a far beach most mornings
    if (s.day >= 2 && this.res.crates.length < 2 && rnd() < 0.8) this.spawnCrate();
    this.save();
  }
  spawnCrate() {
    for (let t = 0; t < 200; t++) {
      const a = rnd() * TAU, r0 = 215;
      for (let r = r0; r > 60; r -= 2) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9 + 5, h = getHeight(x, z);
        if (h > 0.55 && h < 1.4) {
          if (Math.hypot(x - this.player.pos.x, z - this.player.pos.z) < 60 || lavaDist(x, z) < 20 || Math.hypot(x - VOL.x, z - VOL.z) < 60) break;
          const loot = []; for (let i = 0; i < 3; i++) { const e = this.weighted(); if (!loot.some((q) => q[0] === e[0])) loot.push([e[0], e[1]]); }
          this.res.addCrate(x, z, loot);
          this.hud.banner('Something washed ashore!', 'A crate on the beach', 'Look for the light beam, or the star on your map.');
          return;
        }
      }
    }
  }
  weighted() { const tot = LOOT.reduce((a, q) => a + q[2], 0); let r = rnd() * tot; for (const q of LOOT) { r -= q[2]; if (r <= 0) return q; } return LOOT[0]; }

  /* ------------------------------------------------------------ needs and health */
  needs(dt, dh) {
    const s = this.s, P = this.player, sleeping = this.sleeping && this.sleeping.phase === 'asleep';
    const midday = env.tod > 11 && env.tod < 15.5 ? 1.15 : 1;
    const eff = sleeping ? 0.4 : 1;
    s.food = clamp(s.food - RATES.hunger * dh * eff * (s.sick > 0 ? 1.4 : 1), 0, 100);
    s.water = clamp(s.water - RATES.thirst * dh * eff * midday * (P.run ? 1.35 : 1) * (s.sick > 0 ? 1.5 : 1) * (P.swimming ? 1.3 : 1), 0, 100);
    if (sleeping) s.energy = clamp(s.energy + RATES.sleepEnergy * dh * (this.sheltered || true ? 1 : 0.6), 0, 100);
    else s.energy = clamp(s.energy - RATES.energy * dh * (P.run && P.moving ? 1.7 : 1) * (P.swimming ? 1.6 : 1), 0, 100);
    if (s.sick > 0) s.sick = Math.max(0, s.sick - dh);
    // health: starving, parched and worn out hurt; being well fed and rested heals
    let d = 0;
    if (s.food <= 0) d -= RATES.starve; if (s.water <= 0) d -= RATES.parch; if (s.energy <= 0) d -= RATES.exhaust;
    if (s.sick > 0) d -= 1.8;
    if (this.stormy && !this.sheltered && !sleeping) d -= 2.2;
    const spring = Math.hypot(P.pos.x - SPRING.x, P.pos.z - SPRING.z) < SPRING.r + 0.5;
    if (d === 0 && s.food > 25 && s.water > 25 && s.energy > 12) d += RATES.regen * (sleeping ? 2 : 1) * (spring ? 3 : 1) * (s.hp < 100 ? 1 : 0);
    s.hp = clamp(s.hp + d * dh, 0, 100);
    if (s.hp <= 0 && !this.dead) this.die();
    // gentle warnings, once each
    const warn = (k, cond, msg) => { if (cond && !this.warned[k]) { this.warned[k] = 1; this.hud.gain(msg, 'bad'); } if (!cond) this.warned[k] = 0; };
    warn('food', s.food < 22, '🍖 You are getting hungry');
    warn('water', s.water < 22, '💧 You are getting thirsty');
    warn('energy', s.energy < 18, '⚡ You are exhausted: find a shelter and sleep');
    warn('storm', this.stormy && !this.sheltered, '⛈️ A storm! A shelter keeps you dry');
  }

  /* ------------------------------------------------------------ light, crabs, quests, discoveries */
  updateLights(dt) {
    const fires = this.structs.filter((q) => q.lit).map((q) => ({ q, d: Math.hypot(q.x - this.player.pos.x, q.z - this.player.pos.z) })).sort((a, b) => a.d - b.d);
    const night = 0.1 + 0.9 * Math.min(1, env.night + env.dusk * 0.7);
    const t = performance.now() * 0.001;
    for (let i = 0; i < 2; i++) {
      const L = this.lights[i], f = fires[i];
      if (f && f.d < 70) { L.position.set(f.q.x, f.q.y + 1.2, f.q.z); L.intensity = 120 * night * (0.85 + 0.15 * Math.sin(t * 9 + i) * Math.sin(t * 5.3)); L.distance = 22; } else L.intensity = 0;
    }
    const T = this.lights[2];
    if (this.torchLeft > 0) { const tp = this.avatar.torchPos(this._tp || (this._tp = new THREE.Vector3())); T.position.set(tp.x, tp.y + 0.3, tp.z); T.intensity = 70 * (0.85 + 0.15 * Math.sin(t * 11)); T.distance = 16; } else T.intensity = 0;
  }
  crabsBack() {
    for (let i = this.crabBack.length - 1; i >= 0; i--) if (this.hoursAbs >= this.crabBack[i].at) { this.crabBack[i].c.group.visible = true; this.crabBack.splice(i, 1); }
  }
  checkQuests() {
    const s = this.s;
    for (let guard = 0; guard < 4; guard++) {
      const q = QUESTS[s.qIdx]; if (!q || !q.done(this)) break;
      s.qIdx++; this.addXp(q.xp);
      this.hud.banner('Objective complete', q.title, `+${q.xp} xp`);
      events.emit('sfx', 'quest');
      if (s.qIdx >= QUESTS.length) this.hud.gain('All objectives complete: now go home!', 'good');
    }
  }
  checkDiscoveries() {
    const p = this.player.pos;
    for (const st of this.sites) {
      if (this.s.disc[st.id] || Math.hypot(p.x - st.x, p.z - st.z) > st.r) continue;
      const d = DISCOVERIES.find((q) => q.id === st.id); if (!d) continue;
      this.s.disc[st.id] = 1; this.addXp(d.xp);
      this.hud.banner('Discovered', d.name, `+${d.xp} xp`);
      events.emit('sfx', 'quest');
    }
  }

  /* ------------------------------------------------------------ the ending */
  tickEnding(dt) {
    const e = this.ending, r = e.raft, P = this.player, av = this.avatar;
    e.t += dt;
    // the raft drifts out to sea with him on it; the camera circles
    const dirx = Math.sin(r.yaw), dirz = Math.cos(r.yaw);
    let seaX = 0, seaZ = 0;
    for (let a = 0; a < 16; a++) { const qx = r.x + Math.cos(a * 0.3927) * 6, qz = r.z + Math.sin(a * 0.3927) * 6; if (getHeight(qx, qz) < getHeight(r.x, r.z)) { seaX += Math.cos(a * 0.3927); seaZ += Math.sin(a * 0.3927); } }
    const l = Math.hypot(seaX, seaZ) || 1; seaX /= l; seaZ /= l;
    const sp = Math.min(e.t * 0.5, 2.8);
    r.mesh.position.x += seaX * sp * dt; r.mesh.position.z += seaZ * sp * dt; r.mesh.rotation.y = Math.atan2(seaX, seaZ) + Math.PI / 2;
    r.x = r.mesh.position.x; r.z = r.mesh.position.z;
    P.pos.set(r.x, Math.max(0, env.tide) + 0.45, r.z); P.heading = Math.atan2(seaX, seaZ);
    av.job('cheer', 0, performance.now() / 1000); av.apply(dt); av.place(P.pos.x, P.pos.y, P.pos.z, P.heading);
    P.cYaw += dt * 0.25; P.cDistG = 9; P.cPitch = 0.28;
    P.updateCamera(dt, 1.6);
    for (const q of this.structs) q.update(dt, 0, performance.now() / 1000);
    if (e.t > 7 && !e.menu) {
      e.menu = true; this.hud.fade(1, 2000);
      setTimeout(() => {
        const nCraft = Object.keys(this.s.stats).filter((k) => k.startsWith('crafted.')).reduce((a, k) => a + this.s.stats[k], 0);
        this.hud.menu(`<h1>You made it home</h1><p>The island fades into the haze behind you. You survived.</p>
          <div class="stats"><span>Days on the island</span><b>${this.day}</b><span>Level reached</span><b>${this.s.level}</b><span>Fish caught</span><b>${this.stat('fish')}</b><span>Things made</span><b>${nCraft}</b><span>Places found</span><b>${Object.keys(this.s.disc).length}/${DISCOVERIES.length}</b><span>Crates found</span><b>${this.stat('crates')}</b></div>
          <div class="stack"><button class="sv-btn pri" id="svAgain">Play again</button><button class="sv-btn" id="svStay">Keep exploring this island</button><button class="sv-btn" id="svOut">Back to the island</button></div>`,
        { '#svAgain': () => { this.ending = false; this.hud.closeMenu(); this.begin(null); }, '#svStay': () => { this.ending = false; this.hud.closeMenu(); r.mesh.position.set(r.x, 0, r.z); this.player.reset(this.spawn.x, this.spawn.z, 0); this.hud.fade(0, 1200); }, '#svOut': () => { this.ending = false; try { localStorage.removeItem(SAVE_KEY); } catch (er) { /* */ } this.hud.closeMenu(); this.close(); this.hud.fade(0, 100); } });
      }, 2100);
    }
  }
}

const seaLevelY = () => env.tide;
