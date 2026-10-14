import os
os.chdir(r'D:\Paradise Island')


def rw(p, pairs):
    s = open(p, encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    for a, b in pairs:
        assert a in s, (p, a[:80])
        s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)


# ---------------------------------------------------------------- survival
rw('src/survival/game.js', [
    ("import { getHeight, falls, river, LAKE, SPRING, FAIRY, TEMPLE, COVE, VOL, lavaDist } from '../world.js';",
     "import { getHeight, falls, river, LAKE, SPRING, FAIRY, TEMPLE, COVE, VOL, lavaDist, ASCENT } from '../world.js';\nimport { Climber, climbRoute, exitPoint, stationBelow } from '../climb.js';"),
    ("      { id: 'oldcamp', x: falls.camp.x, z: falls.camp.z, r: 12 }, { id: 'wreck', x: COVE.x + 16, z: COVE.z + 18, r: 20 }, { id: 'lava', x: VOL.x + 80, z: VOL.z + 30, r: 30 },\n    ];",
     "      { id: 'oldcamp', x: falls.camp.x, z: falls.camp.z, r: 12 }, { id: 'wreck', x: COVE.x + 16, z: COVE.z + 18, r: 20 }, { id: 'lava', x: VOL.x + 80, z: VOL.z + 30, r: 30 },\n    ];\n    if (ASCENT.top) this.sites.push({ id: 'summit', x: ASCENT.top.x, z: ASCENT.top.z, r: 4.5 }, { id: 'basecamp', x: ASCENT.bc.x, z: ASCENT.bc.z, r: 6 });\n    this.climber = new Climber();"),
    ("    const frozen = !!this.act || !!this.fishing || !!this.sleeping;", "    const frozen = !!this.act || !!this.fishing || !!this.sleeping || this.climber.active;"),
    ("    P.update(dt, ctl);\n    this.sheltered =", "    if (this.climber.active) this.tickClimb(dt, dh, ctl); else P.update(dt, ctl);\n    this.sheltered ="),
    ("    } else if (this.fishing) {\n      const f = this.fishing;\n      E = f.phase === 'bite'",
     """    } else if (this.climber.active) {
      const C = this.climber;
      E = { key: 'E', label: C.rest ? 'Step back to the ledge' : 'Let go', note: C.rest ? '' : 'you drop to the ledge below' };
      hint = s.energy < 14 ? 'Your arms are tiring: rest on a ledge' : 'W / S climb · A / D shuffle · Shift hurry · rest on the ledges';
      if (I.hit('KeyE')) this.letGo();
    } else if (this.fishing) {
      const f = this.fishing;
      E = f.phase === 'bite'"""),
    ("      else if (P.swimming) av.swim(dt, P.speed);\n      else if (P.moving) av.gait(dt, P.speed, P.run, false);",
     "      else if (this.climber.active) av.job('climb', this.climber.phase, this.climber.moving);\n      else if (P.swimming) av.swim(dt, P.speed);\n      else if (P.moving) av.gait(dt, P.speed, P.run, false);"),
    ("      av.apply(dt);\n      av.place(P.pos.x, P.pos.y, P.pos.z, P.heading);\n    }\n    this.hurtT",
     "      av.apply(dt);\n      if (this.climber.active) av.place(this.climber.pos.x, this.climber.pos.y, this.climber.pos.z, this.climber.heading, this.climber.lean);\n      else av.place(P.pos.x, P.pos.y, P.pos.z, P.heading);\n    }\n    this.hurtT"),
    (" pos: { x: this.player.pos.x, z: this.player.pos.z, h: this.player.heading },",
     " pos: this.climber && this.climber.active ? (() => { const st = stationBelow(this.climber.u - 0.02); return { x: st.x, z: st.z, h: this.player.heading }; })() : { x: this.player.pos.x, z: this.player.pos.z, h: this.player.heading },"),
    ("  /** after dark the jungle is not safe:",
     """  /* ------------------------------------------------------------ climbing Mount Ignis */
  startClimb(st) {
    if (this.act || this.fishing || this.climber.active) return;
    this.avatar.hold(null);
    this.climber.start(st.u);
    this.hud.gain(st.id === 'top' ? '⛰ You start down the wall' : '⛰ You take hold of the rope line', 'good');
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

  /** after dark the jungle is not safe:"""),
])
rw('src/survival/items.js', [
    ("{ id: 'wreck', name: 'the galleon wreck', xp: 10 }, { id: 'lava', name: 'the lava coast', xp: 12 },",
     "{ id: 'wreck', name: 'the galleon wreck', xp: 10 }, { id: 'lava', name: 'the lava coast', xp: 12 },\n  { id: 'basecamp', name: 'the Ascent basecamp', xp: 14 }, { id: 'summit', name: 'the summit of Mount Ignis', xp: 45 },"),
])
rw('src/survival/actions.js', [
    ("import { waterAt } from '../ripples.js';", "import { waterAt } from '../ripples.js';\nimport { nearStation, climbRoute } from '../climb.js';"),
    ("  // crabs\n  for (const c of creatures) {",
     """  // the climb up Mount Ignis
  if (climbRoute.ready && !g.climber.active) {
    const stn = nearStation(p.x, p.z, 3.4);
    if (stn) add({ id: 'climb', prio: 5.5, dist: 0, label: stn.id === 'top' ? 'Climb down' : stn.id === 'base' ? 'Climb the Ascent' : 'Keep climbing', note: stn.id === 'base' ? 'a fixed-rope route to the crater rim' : stn.id === 'top' ? '' : 'a rest ledge', run: () => g.startClimb(stn) });
  }
  // crabs
  for (const c of creatures) {"""),
])
# ---------------------------------------------------------------- survival player: too steep to walk up the volcano
rw('src/survival/player.js', [
    ("import { getHeight, walkHeight, resolveColliders, lavaDist, VOL } from '../world.js';", "import { getHeight, walkHeight, resolveColliders, lavaDist, VOL, volcanoSteep } from '../world.js';"),
    ("    const g = walkHeight(_p.x, _p.z, this.pos.y);\n    const pl = poolLevel(_p.x, _p.z);",
     "    if (volcanoSteep(_p.x, _p.z) && !volcanoSteep(this.pos.x, this.pos.z)) return false;      // too steep for a walk: climb\n    const g = walkHeight(_p.x, _p.z, this.pos.y);\n    const pl = poolLevel(_p.x, _p.z);"),
])

# ---------------------------------------------------------------- first-person walk
rw('src/walk.js', [
    ("import { getHeight, getSlope, walkHeight, resolveColliders, lavaDist, riverDist, VOL, LAKE, SPRING, falls } from './world.js';",
     "import { getHeight, getSlope, walkHeight, resolveColliders, lavaDist, riverDist, VOL, LAKE, SPRING, falls, volcanoSteep } from './world.js';\nimport { Climber, climbRoute, nearStation, exitPoint, stationBelow } from './climb.js';"),
    ("const _p = { x: 0, z: 0 }, info = { tag: null };",
     """const _p = { x: 0, z: 0 }, info = { tag: null };
walk.climber = new Climber();
let hintEl = null, fHeld = false;
function showHint(text) {
  if (!hintEl) {
    hintEl = document.createElement('div');
    hintEl.style.cssText = 'position:fixed;left:50%;bottom:22%;transform:translateX(-50%);padding:8px 16px;border-radius:10px;background:rgba(20,28,26,0.72);color:#f3ecd8;font:600 14px system-ui,sans-serif;letter-spacing:0.02em;pointer-events:none;z-index:30;display:none;backdrop-filter:blur(4px)';
    document.body.appendChild(hintEl);
  }
  hintEl.style.display = text ? 'block' : 'none';
  if (text) hintEl.textContent = text;
}"""),
    ("  if ((lavaDist(_p.x, _p.z) < 2.0 && h > 0.5) || Math.hypot(_p.x - VOL.x, _p.z - VOL.z) < 13) return false;\n  const g = walkHeight(_p.x, _p.z, walk.pos.y);",
     "  if ((lavaDist(_p.x, _p.z) < 2.0 && h > 0.5) || Math.hypot(_p.x - VOL.x, _p.z - VOL.z) < 13) return false;\n  if (volcanoSteep(_p.x, _p.z) && !volcanoSteep(walk.pos.x, walk.pos.z)) return false;      // too steep to walk: it takes a climb\n  const g = walkHeight(_p.x, _p.z, walk.pos.y);"),
    ("walk.leave = () => {\n  walk.active = false;", "walk.leave = () => {\n  walk.active = false; walk.climber.active = false; showHint('');"),
    ("walk.update = (dt, keys) => {\n",
     """/** climbing Mount Ignis in first person: W/S up and down, A/D shuffle, Shift hurries, F lets go */
function climbWalk(dt, keys) {
  const C = walk.climber, dn = (a, b) => (keys.has(a) || (b && keys.has(b)) ? 1 : 0);
  const up = dn('KeyW', 'ArrowUp') - dn('KeyS', 'ArrowDown'), side = dn('KeyD') - dn('KeyA');
  const r = C.update(dt, { up, side, fast: keys.has('ShiftLeft') || keys.has('ShiftRight') });
  const p = walk.pos; p.copy(C.pos); walk.vel.set(0, 0, 0); walk.vy = 0; walk.grounded = true; walk.swimming = false; walk.speedXZ = 0;
  const fNow = keys.has('KeyF');
  if (fNow && !fHeld) {                                             // let go: slide to the ledge below
    if (C.rest) { C.stop(); const st = stationBelow(C.u); walk.teleport(st.x, st.z, C.heading + Math.PI); fHeld = fNow; showHint(''); return; }
    C.fall();
  }
  fHeld = fNow;
  const yaw0 = C.heading + Math.PI; let dy = walk.yaw - yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); walk.yaw = yaw0 + clamp(dy, -1.2, 1.2);
  camera.position.set(p.x, p.y + 1.5, p.z);
  camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
  showHint(C.rest ? 'Resting on a ledge · W climbs on · F steps off' : 'W / S climb · A / D shuffle · Shift hurry · F let go');
  if (r) {
    const e = exitPoint(r); C.stop();
    walk.teleport(e.x, e.z, r === 'top' ? C.heading + Math.PI : C.heading);
    showHint('');
  }
}

walk.update = (dt, keys) => {
  if (walk.climber.active) { climbWalk(dt, keys); return; }
  if (climbRoute.ready) {                                           // the foot of the climb, a rest ledge or the crest: F takes hold
    const stn = nearStation(walk.pos.x, walk.pos.z, 3.2);
    showHint(stn ? (stn.id === 'top' ? 'Press F to climb down' : stn.id === 'base' ? 'Press F to climb Mount Ignis' : 'Press F to keep climbing') : '');
    const fNow = keys.has('KeyF');
    if (stn && fNow && !fHeld) { walk.climber.start(stn.u); walk.pitch = stn.id === 'top' ? -0.5 : 0.55; fHeld = fNow; return; }
    fHeld = fNow;
  }
"""),
])
print('ok')
