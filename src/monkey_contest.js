// Coconut contests between monkeys. A monkey that has just taken a coconut (carrying it or eating it) can have it challenged
// by a rival within reach. The challenger closes in at a scurry, the holder turns and guards, the challenger bluffs with a threat
// display, and then, unless one of them gives way, the pair tugs: the two paired clips play together, 1.08 m apart, on the same
// clock. The winner is drawn from size, grit (a persistence each monkey keeps), and a little luck, so a big monkey wins more often
// without winning every time. Either monkey can give up on the way in, during the bluff, or mid-tug. The winner triumphs, the loser
// shows its frustration and runs off, and everything is left to the monkey's own behaviour afterwards.
import { camera } from './core.js';
import { orient, steer } from './fauna_common.js';
import { rr, rnd, clamp, damp, lerp } from './util.js';

const REACH = 20;          // a challenger looks for a holder this close (metres)
const CHANCE = 0.45;       // chance that a free monkey, scanning, picks a challenge
const WALK_IN = 3.0;       // how fast a challenger closes in (m/s, scurry)
const BLUFF_AT = 3.2;      // the challenger stops this close to bluff

export const contests = [];

const smooth = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };

/** the rig clip for a monkey in a contest. Locomotion plays at the speed of the clip; the rest at 1. */
function drive(m, name, dt, opts = {}) {
  const R = m.rig;
  if (!R) return;
  const cd = Math.hypot(m.x - camera.position.x, m.z - camera.position.z);
  R.setFar(R.isFar ? cd > 5.5 : cd > 7);
  R.retier();
  const ts = name === 'scurry' ? clamp(Math.abs(m.speed) / 1.19, 0.6, 3.2) : 1;
  R.play(name, { ...opts, timeScale: ts });
  if (cd > 40) R.throttled(dt, 0.2); else R.update(dt);
  orient(m.group, m.x, m.z, m.heading, 0.7, 0.4, 0);
}

/** a free monkey that is out on the ground may go for a holder nearby */
function scan(monkeys, dt) {
  for (const c of monkeys) {
    if (c.contest || !c.rig || (c.state !== 'idle' && c.state !== 'walk') || c.nutCool > 0) continue;
    c.contestScan -= dt;
    if (c.contestScan > 0) continue;
    c.contestScan = rr(1.5, 3);
    if (rnd() > CHANCE) continue;
    let best = null, bd = REACH;
    for (const h of monkeys) {
      if (h === c || !h.rig || h.contest || (h.state !== 'carry' && h.state !== 'eatNut')) continue;
      const d = Math.hypot(h.x - c.x, h.z - c.z);
      if (d < bd) { bd = d; best = h; }
    }
    if (best) begin(best, c);
  }
}

function begin(h, c) {
  const k = { holder: h, ch: c, phase: 'approach', age: 0, abandonT: 1, bluffT: 0, slipT: 1, tugT: 0, tugDur: 0, tugStarted: false, placeT: 0, placeFrom: null, winner: null, loser: null, postT: 0, hClip: 'coconut_guard', cClip: 'scurry' };
  h.contest = k; c.contest = k;
  contests.push(k);
}

/** the contest is over: the winner triumphs and the loser is left frustrated; a challenger who gives up just runs off */
function finish(k, winner, loser) {
  k.winner = winner; k.loser = loser; k.phase = 'post'; k.postT = 2.6;
  winner.speed = 0; loser.speed = 0;
  k.hClip = winner === k.holder ? 'coconut_triumph' : 'coconut_lose';
  k.cClip = winner === k.ch ? 'coconut_triumph' : 'coconut_lose';
}

function release(k) {
  const h = k.holder, c = k.ch;
  for (const m of [h, c]) m.contest = null;
  const i = contests.indexOf(k);
  if (i >= 0) contests.splice(i, 1);
  k.done = true;
  if (k.winner) {
    // the winner settles down to eat; the loser slinks off, looking back at the winner
    const w = k.winner, l = k.loser;
    w.state = 'eatNut'; w.t = rr(8, 13); w.pitchT = 0; w.foldT = 0;
    if (l) {
      l.state = 'idle'; l.t = 1; l.act = 'look'; l.fleeT = 3; l.chased = false;
      l.heading = Math.atan2(l.x - w.x, l.z - w.z); l.nutCool = rr(20, 30);
      l.tx = l.x + Math.sin(l.heading) * 12; l.tz = l.z + Math.cos(l.heading) * 12;
    }
  } else {
    // the challenger gave up: it runs off; the holder keeps its coconut and carries on as before
    c.state = 'idle'; c.t = 1; c.act = 'look'; c.fleeT = 2; c.nutCool = rr(20, 30);
    c.heading = Math.atan2(c.x - h.x, c.z - h.z);
    c.tx = c.x + Math.sin(c.heading) * 10; c.tz = c.z + Math.cos(c.heading) * 10;
  }
}

function step(k, dt) {
  const h = k.holder, c = k.ch;
  k.age += dt;
  if (k.phase === 'approach') {
    // the challenger closes in at a scurry; the holder turns and guards, and both may still back off
    const dx = h.x - c.x, dz = h.z - c.z, d = Math.hypot(dx, dz);
    c.heading = steer(c.heading, Math.atan2(dx, dz), dt * 3);
    c.speed = damp(c.speed, WALK_IN, 4, dt);
    c.x += Math.sin(c.heading) * c.speed * dt; c.z += Math.cos(c.heading) * c.speed * dt;
    h.heading = steer(h.heading, Math.atan2(-dx, -dz), dt * 3); h.speed = 0;
    k.abandonT -= dt;
    if (k.abandonT <= 0) {
      k.abandonT = 1;
      if (rnd() < 0.12 * (1.2 - c.bold)) { release(k); return; }
    }
    if (d < BLUFF_AT) { k.phase = 'bluff'; k.bluffT = rr(1.6, 2.6); k.cClip = 'threat_display'; }
    if (k.age > 14) { release(k); return; }
    k.hClip = 'coconut_guard'; k.cClip = 'scurry';
  } else if (k.phase === 'bluff') {
    // the challenger bluffs, the holder guards; the holder may give way at once if the rival is clearly bigger and bolder
    c.speed = damp(c.speed, 0, 6, dt);
    c.heading = steer(c.heading, Math.atan2(h.x - c.x, h.z - c.z), dt * 4);
    h.heading = steer(h.heading, Math.atan2(c.x - h.x, c.z - h.z), dt * 4); h.speed = 0;
    k.bluffT -= dt;
    k.hClip = 'coconut_guard'; k.cClip = 'threat_display';
    if (k.bluffT <= 0) {
      const give = 0.35 * clamp((c.size - h.size) * 3 + (c.bold - h.bold) * 0.5, 0, 1);
      if (rnd() < give) { finish(k, c, h); return; }
      // the tug: the rival takes its place 1.08 m in front of the holder, facing it
      k.phase = 'tug'; k.tugDur = rr(4, 7); k.placeFrom = { x: c.x, z: c.z }; k.slipT = 1;
      const sc = c.size * (0.6 + 0.8 * c.grit), sh = h.size * (0.6 + 0.8 * h.grit) * 1.1;
      const p = clamp(sc / (sc + sh) + (rnd() - 0.5) * 0.4, 0.05, 0.95);
      k.winner = rnd() < p ? c : h;
    }
  } else if (k.phase === 'tug') {
    const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
    k.placeT = Math.min(1, k.placeT + dt / 0.5);
    c.x = lerp(k.placeFrom.x, h.x + fx * 1.08, smooth(k.placeT));
    c.z = lerp(k.placeFrom.z, h.z + fz * 1.08, smooth(k.placeT));
    c.heading = h.heading + Math.PI; c.speed = 0; h.speed = 0;
    k.hClip = 'coconut_tug_holder'; k.cClip = 'coconut_tug_challenger';
    if (k.placeT >= 1 && !k.tugStarted) k.tugStarted = true;
    if (k.tugStarted) {
      k.tugT += dt;
      // now and then one of them lets go; the one with less grit is the more likely to
      k.slipT -= dt;
      if (k.slipT <= 0) {
        k.slipT = 1;
        if (rnd() < 0.05) { const weak = c.grit < h.grit ? c : h; finish(k, weak === c ? h : c, weak); return; }
      }
      if (k.tugT >= k.tugDur) { finish(k, k.winner, k.winner === c ? h : c); return; }
    }
  } else if (k.phase === 'post') {
    k.postT -= dt;
    if (k.postT <= 0) { release(k); return; }
  }
  // the clip each monkey plays this frame (the rig keeps the same clip if it is already playing)
  if (k.phase === 'post') drive(h, k.hClip, dt, { loop: false, next: k.winner === h ? 'coconut_hold_idle' : 'threat_display' });
  else drive(h, k.hClip, dt, { loop: k.hClip !== 'coconut_triumph' && k.hClip !== 'coconut_lose' });
  if (k.phase === 'post') drive(c, k.cClip, dt, { loop: false, next: k.winner === c ? 'coconut_hold_idle' : 'threat_display' });
  else drive(c, k.cClip, dt, { loop: k.cClip !== 'coconut_triumph' && k.cClip !== 'coconut_lose' });
}

/** called once per frame, before the monkeys update */
export function updateContests(monkeys, dt) {
  scan(monkeys, dt);
  for (const k of [...contests]) if (!k.done) step(k, dt);
}

/** a monkey in a contest is run by the contest, not by its own state machine */
export const inContest = (m) => !!m.contest;
/** the two traits each monkey keeps for contests: grit (persistence) and bold (willingness to bluff and to hold on) */
export const monkeyTraits = () => ({ grit: Math.random(), bold: Math.random() });
