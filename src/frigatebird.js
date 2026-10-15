// Great frigatebird: wind-assisted soaring, surface feeding and communal tree roosts.
import * as THREE from 'three';
import { camera } from './core.js';
import { fauna, register } from './fauna_common.js';
import { getHeight, COVE, VOL } from './world.js';
import { wx } from './weather.js';
import { waterY } from './ripples.js';
import { clamp, damp, angDiff } from './util.js';
import { makeFrigatebirdModel, frigatebirdModelsReady } from './frigatebird_model.js';
import { MB, C, tube } from './gfx.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const STATIONARY = new Set(['perch', 'inflate', 'display']);
// Local random stream keeps world generation and other animal identities stable.
function random(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const fishGeo = new THREE.IcosahedronGeometry(1, 1), fishMat = new THREE.MeshStandardMaterial({ color: '#a4c8ca', roughness: .52 });

export class Frigatebird {
  constructor(i, variant, home, colony) {
    this.i = i; this.kind = 'frigate'; this.variant = variant; this.colony = colony; this.home = home.clone();
    this.random = random(6143 + i * 1777); this.phase = this.random() * TAU;
    this.model = makeFrigatebirdModel(variant, this.phase); this.group = new THREE.Group();
    this.group.add(this.model.root); this.scale = variant === 'female' ? 1.82 : variant === 'juvenile' ? 1.61 : 1.7;
    this.group.scale.setScalar(this.scale); fauna.add(this.group);
    this.pos = home.clone(); this.vel = V(); this.target = home.clone(); this.homeHeading = Math.atan2(home.x, home.z); this.heading = this.homeHeading; this.bank = 0; this.pitch = 0;
    this.thermal = V(home.x + 25, 0, home.z + 20); this.radius = 22 + i * 2; this.dir = i % 2 ? -1 : 1;
    this.flightSeconds = 0; this.soaringSeconds = 0; this.feeds = 0; this.landings = 0; this.trips = 0; this.chases = 0;
    this.fish = new THREE.Mesh(fishGeo, fishMat); this.fish.scale.set(.045, .035, .14); this.fish.visible = false; fauna.add(this.fish);
    this.enter('perch'); this.rest = 6 + (i - 2) * 5;
    this.group.position.copy(this.pos);
    register({ id: 'frigate' + i, name: 'Great frigatebird', cat: 'Birds', group: this.group, sim: this,
      viewDist: 16, pickR: 3, pickY: .2,
      desc: 'A great frigatebird rides rising air on long angular wings, steers with a forked tail, and snatches prey without landing on the sea.' });
  }
  enter(mode) {
    this.mode = mode; this.elapsed = 0;
    const clips = { perch: 'Perch_Idle', inflate: 'Male_PouchInflate', display: 'Male_Courtship', takeoff: 'Perch_Takeoff',
      thermal: 'Flight_Soar', glide: 'Flight_Glide', descent: 'Flight_Glide', skim: 'Feed_SurfaceSnatch', recover: 'Flight_Recovery',
      chase: 'Flight_DeepFlaps', approach: 'Flight_Glide', landing: 'Perch_Landing' };
    this.model.play(clips[mode], .35, ['inflate', 'takeoff', 'skim', 'recover', 'landing'].includes(mode));
    if (mode !== 'descent' && mode !== 'skim') this.fish.visible = false;
    if (mode === 'thermal') { this.thermal.set(this.pos.x - this.radius, 0, this.pos.z); this.liftHeight = Math.max(45, this.home.y + 25) + this.random() * 14; }
    if (mode === 'perch') { this.rest = 24 + this.random() * 26; this.idleIn = 4; this.displayed = false; }
    if (mode === 'takeoff') { this.trips++; this.target.copy(this.home).add(V(Math.sin(this.heading) * 24, 14, Math.cos(this.heading) * 24)); }
  }
  /** picked in the Field Guide: a perched frigatebird takes off into the wind */
  observed() { if (this.mode === 'perch') this.rest = 0; }
  seaTarget() {
    // Actual open-water targets; the bird never chooses a landing on the sea.
    for (let j = 0; j < 40; j++) {
      const a = this.random() * TAU, r = 165 + this.random() * 45, p = V(Math.sin(a) * r, 28, Math.cos(a) * r);
      if (getHeight(p.x, p.z) < -2 && p.distanceTo(this.pos) > 40) return p;
    }
    return V(220, 28, 30);
  }
  update(dt, t, snapshot) {
    this.elapsed += dt; this.now = t;
    if (STATIONARY.has(this.mode)) {
      this.pos.copy(this.home); this.vel.set(0, 0, 0); this.bank = damp(this.bank, 0, 5, dt); this.pitch = damp(this.pitch, 0, 5, dt);
      if (this.mode === 'perch') {
        this.rest -= dt; this.idleIn -= dt;
        if (this.idleIn < 0) {
          const clips = ['Perch_Idle', 'Perch_Alert', 'Perch_Preen', 'Perch_WingSettle'];
          this.model.play(clips[Math.floor(this.random() * clips.length)]); this.idleIn = 4 + this.random() * 5;
        }
        if (this.variant === 'male' && !this.displayed && this.elapsed > 9 && this.rest > 8) { this.displayed = true; this.enter('inflate'); }
        else if (this.rest < 0 || camera.position.distanceTo(this.pos) < 3) this.enter('takeoff');
      } else if (this.mode === 'inflate' && this.elapsed > 3) this.enter('display');
      else if (this.mode === 'display' && this.elapsed > 9) { this.mode = 'perch'; this.elapsed = 0; this.rest = 8; this.model.play('Perch_Idle', 1.2); }
    } else this.fly(dt, t, snapshot);
    this.group.position.copy(this.pos); this.group.rotation.set(this.pitch, this.heading, this.bank, 'YXZ');
    this.model.update(dt);
    if (this.mode === 'skim' && this.model.billTip) {
      this.group.updateMatrixWorld(true);
      const bill = this.model.billTip.getWorldPosition(V());
      if (!this.caught && bill.distanceTo(this.fish.position) < .48 && this.elapsed > .35) {
        this.caught = true; this.feeds++; this.lastCatchError = bill.distanceTo(this.fish.position);
      }
      if (this.caught) { this.fish.position.copy(bill); this.fish.visible = this.elapsed < 1.35; }
    }
  }
  fly(dt, t, snapshot) {
    this.flightSeconds += dt;
    const mode = this.mode, desired = V(), wind = V(Math.sin(wx.dir), 0, Math.cos(wx.dir)).multiplyScalar(clamp(wx.kmh / 3.6, 0, 6));
    let speed = 12, target = this.target;
    if (mode === 'thermal') {
      this.soaringSeconds += dt;
      this.thermal.addScaledVector(wind, dt * .12);
      const radial = this.pos.clone().sub(this.thermal).setY(0), r = Math.max(1, radial.length()); radial.divideScalar(r);
      desired.set(-radial.z * this.dir, 0, radial.x * this.dir).multiplyScalar(10.5);
      desired.addScaledVector(radial, clamp((this.radius - r) * 1.2, -5, 5));
      desired.y = .9 + .35 * Math.sin(t * .16 + this.phase) - wx.rain * .35;
      if (this.pos.y > this.liftHeight && this.elapsed > 20) { this.target.copy(this.seaTarget()); this.enter('glide'); }
    } else if (mode === 'skim') {
      speed = 10; desired.copy(this.skimDirection).multiplyScalar(speed);
      const sea = waterY(this.pos.x, this.pos.z, t);
      desired.y = (sea + .20 - this.pos.y) * 5;
      if (this.elapsed > 1.6) { this.enter('recover'); this.target.copy(this.pos).addScaledVector(this.skimDirection, 30); this.target.y = 18; }
    } else {
      if (mode === 'chase') {
        const q = this.chaseTarget;
        if (q?.group) target = q.group.position.clone().add(V(0, 3, -2));
        if (this.elapsed > 5 || !q) { this.target.copy(this.home).add(V(0, 12, 0)); this.enter('approach'); }
        speed = 16;
      }
      const delta = target.clone().sub(this.pos), horizontal = Math.hypot(delta.x, delta.z), distance = delta.length();
      if (mode === 'glide') {
        this.soaringSeconds += dt; delta.y = Math.max(-1.1, (28 - this.pos.y) * .08);
        desired.copy(delta).setY(0).normalize().multiplyScalar(speed); desired.y = delta.y;
        if (horizontal < 20) { this.target.y = waterY(this.target.x, this.target.z) + .2; this.fish.position.copy(this.target); this.fish.position.y -= .12; this.enter('descent'); }
      } else if (mode === 'descent') {
        speed = clamp(horizontal * .5, 3, 11);
        desired.copy(delta).setY(0).normalize().multiplyScalar(speed);
        const surface = waterY(this.pos.x, this.pos.z);
        desired.y = clamp((surface + .20 - this.pos.y) * .65, -5.5, 1);
        this.fish.visible = true;
        if (this.pos.y - surface < .45 && horizontal < 3.5) {
          this.skimDirection = V(Math.sin(this.heading), 0, Math.cos(this.heading)); this.caught = false; this.enter('skim');
          this.fish.position.copy(this.pos).addScaledVector(this.skimDirection, 8.2); this.fish.position.y = surface + .08;
          this.fish.rotation.y = this.heading;
        }
      } else if (mode === 'approach' || mode === 'landing') {
        if (mode === 'approach' && this.trips % 5 === 0 && this.lastChaseTrip !== this.trips) {
          const gull = this.colony.gulls.find(g => g.group.position.y > 4 && g.group.position.distanceTo(this.pos) < 65);
          if (gull) { this.lastChaseTrip = this.trips; this.chaseTarget = gull; this.chases++; this.enter('chase'); }
        }
        // Descend onto the reserved tree perch only after reaching its vicinity.
        target = this.home.clone();
        if (horizontal > 15) target.y += 10;
        desired.copy(target).sub(this.pos).multiplyScalar(mode === 'landing' ? 2 : 1.1).clampLength(0, mode === 'landing' ? 3 : 11);
        if (mode === 'approach' && this.pos.distanceTo(this.home) < 4) { this.target.copy(this.home); this.enter('landing'); }
        if (mode === 'landing' && this.pos.distanceTo(this.home) < .04 && this.vel.length() < .15 && this.elapsed > 2.4) {
          this.pos.copy(this.home); this.vel.set(0, 0, 0); this.landings++; this.enter('perch'); return;
        }
      } else {
        desired.copy(delta).normalize().multiplyScalar(speed); desired.y = clamp(delta.y, -3, 5);
        if (mode === 'takeoff') {
          desired.multiplyScalar(clamp(this.elapsed / 1.4, .1, 1)); desired.y = Math.max(desired.y, 2.5);
          if (this.elapsed > 2.2) this.enter('thermal');
        }
        if (mode === 'recover' && this.elapsed > 2.2) {
          const gull = this.colony.gulls.find(g => g.group.position.y > 4 && g.group.position.distanceTo(this.pos) < 60);
          if (this.trips % 5 === 0 && gull) { this.lastChaseTrip = this.trips; this.chaseTarget = gull; this.chases++; this.enter('chase'); }
          else { this.target.copy(this.home).add(V(0, 10, 0)); this.enter('approach'); }
        }
      }
    }
    if (!['landing', 'skim', 'descent'].includes(mode)) desired.addScaledVector(wind, .22);
    // Keep individual trajectories distinct; no assigned formation positions.
    for (const other of snapshot) {
      if (other.i === this.i) continue;
      const away = this.pos.clone().sub(other.pos), d = away.length();
      if (d > .001 && d < 4) desired.addScaledVector(away, (4 - d) * 2 / d);
    }
    const nearHome = this.pos.distanceTo(this.home) < 16 && ['landing', 'approach', 'takeoff'].includes(mode);
    const lowOverSea = ['skim', 'descent'].includes(mode) && getHeight(this.pos.x, this.pos.z) < -1;
    const ahead = this.pos.clone().addScaledVector(this.vel, .8);
    if (!nearHome && !lowOverSea) {
      const safe = Math.max(getHeight(ahead.x, ahead.z), getHeight(this.pos.x, this.pos.z)) + 5;
      if (this.pos.y < safe + 3) desired.y = Math.max(desired.y, (safe + 3 - this.pos.y) * 1.5);
      const crater = V(this.pos.x - VOL.x, 0, this.pos.z - VOL.z), d = crater.length();
      if (d < 42 && d > .01) desired.addScaledVector(crater, (42 - d) * .7 / d);
    }
    const damping = ['landing', 'descent', 'skim'].includes(mode) ? 5 : 1.7;
    this.vel.lerp(desired, 1 - Math.exp(-dt * damping)); this.vel.clampLength(0, 18);
    this.pos.addScaledVector(this.vel, dt);
    const floor = Math.max(getHeight(this.pos.x, this.pos.z) + .45, waterY(this.pos.x, this.pos.z, t) + (lowOverSea ? .15 : .5));
    if (this.pos.y < floor) { this.pos.y = floor; this.vel.y = Math.max(0, this.vel.y); }
    const hs = Math.hypot(this.vel.x, this.vel.z), angle = Math.atan2(this.vel.x, this.vel.z), turn = angDiff(this.heading, angle);
    if (hs > .08) this.heading += clamp(turn, -dt * 1.5, dt * 1.5);
    this.bank = damp(this.bank, mode === 'landing' ? 0 : clamp(-turn * 1.5, -.65, .65), 3, dt);
    this.pitch = damp(this.pitch, ['landing'].includes(mode) ? 0 : clamp(-Math.atan2(this.vel.y, Math.max(.1, hs)), -.5, .45), 3, dt);
    if (['thermal', 'glide', 'approach', 'descent'].includes(this.mode)) {
      // Occasional power strokes; most travel remains soaring and gliding.
      const burst = Math.sin(t * .12 + this.phase) > .985 && this.mode !== 'descent';
      const bankClip = this.bank > .20 ? 'Flight_BankLeft' : 'Flight_BankRight';
      this.model.play(burst ? 'Flight_DeepFlaps' : Math.abs(this.bank) > .20 ? bankClip : this.mode === 'thermal' ? 'Flight_Soar' : 'Flight_Glide', .65);
    }
  }
}

export class FrigatebirdColony {
  constructor(palms, gulls) {
    this.gulls = gulls; this.members = [];
    const sorted = palms.filter(p => p.crown && p.y > .4 && p.y < 8 && Math.hypot(p.x,p.z) > 105).sort((a, b) => Math.hypot(a.x - COVE.x, a.z - COVE.z) - Math.hypot(b.x - COVE.x, b.z - COVE.z));
    const used = [], roost = new MB();
    for (const variant of ['male', 'female', 'juvenile', 'male']) {
      const p = sorted.find(p => used.every(q => p.crown.distanceTo(q) > 7)); if (!p) break;
      const outward = V(p.x, 0, p.z).normalize();
      const home = p.crown.clone().addScaledVector(outward, 3.4).add(V(0, 1.8, 0)); used.push(p.crown);
      const centre = home.clone().add(V(0,-.025,0)), side = V(outward.z,0,-outward.x);
      tube(roost, [p.crown.clone().add(V(0,-.4,0)), p.crown.clone().addScaledVector(outward,1.5).add(V(0,1.1,0)), centre], [.085,.055,.028], 7, () => C('#786f60'));
      tube(roost, [centre.clone().addScaledVector(side,-.55), centre.clone().addScaledVector(side,.55)], [.035,.025], 7, () => C('#887d68'));
      if (frigatebirdModelsReady()) this.members.push(new Frigatebird(this.members.length + 2, variant, home, this));
    }
    const mesh = new THREE.Mesh(roost.build(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95}));mesh.name='Frigatebird_Colony_Roosts';mesh.castShadow=true;mesh.receiveShadow=true;fauna.add(mesh);
  }
  update(dt, t) {
    this.now = t;
    const snapshot = this.members.map(m => ({ i: m.i, pos: m.pos.clone(), vel: m.vel.clone(), mode: m.mode }));
    for (const m of this.members) m.update(dt, t, snapshot);
  }
}
