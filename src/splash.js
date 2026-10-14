// Splashes: what happens when something hits, leaves or drags through the water. Every splash sits on the real surface (tide, waves,
// stream or pond level), throws a crown of droplets and a jet, sets ring waves spreading and leaves a patch of foam; droplets that
// fall back into the water start their own tiny rings. Sized by `s` (0.15 a bobber, 0.5 a footstep, 1 a dolphin, 3+ a whale).
import { env, events, updaters } from './core.js';
import { ripple, wake, waterAt, hooks } from './ripples.js';
import { rr, rnd, clamp, TAU } from './util.js';

const G = 14;           // droplet gravity, as set on the particles
const pending = [];     // droplets still in the air: {t, x, z, s}
let clock = 0;

export function installSplash(fx) {
  updaters.push((dt) => {
    clock += Math.min(dt, 0.1);
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (p.t > clock) continue;
      pending.splice(i, 1);
      ripple(p.x, p.z, { amp: 0.07 + 0.12 * p.s, speed: 0.55, width: 0.06 + 0.04 * p.s, life: 0.9, foam: 0.12, minor: true });
      if (p.s > 0.2) fx.mist.emit({ x: p.x, y: p.y + 0.05, z: p.z, vy: 0.3, life: 0.7, s0: 0.1, s1: 0.5 * p.s + 0.2, c0: [1, 1, 1, 0.22], c1: [1, 1, 1, 0], drag: 1 });
    }
  });

  fx.ripple = (x, z, o) => ripple(x, z, o);
  hooks.splash = (...a) => fx.splash(...a);
  fx.wake = wake;

  /** s: size. o: {dir:[x,z]} direction the thing was moving (spray leans with it), {quiet:true} no sound, {foam} extra foam, {y} surface override */
  fx.splash = (x, y, z, s = 1, o = {}) => {
    const w = waterAt(x, z);
    const wy = o.y ?? (w.kind ? w.y : (Math.abs(y) > 0.02 ? y : env.tide));
    const shallow = w.kind ? clamp(w.depth / 0.9, 0.25, 1) : 1;
    if (!o.quiet) events.emit('splash', x, wy, z, s);
    const sq = Math.sqrt(s);
    // ring waves: a sharp inner ring, then slower broader swells for big splashes
    ripple(x, z, { amp: (0.12 + 0.3 * Math.min(s, 2.5)) * shallow, speed: 1.3 + 0.9 * sq, width: 0.16 + 0.1 * s, life: 2.2 + 1.1 * s, foam: Math.min(1, 0.3 + 0.45 * s) + (o.foam || 0) });
    if (s > 0.45) ripple(x, z, { amp: 0.22 * Math.min(s, 2.5) * shallow, speed: 0.9 + 0.7 * sq, width: 0.3 + 0.2 * s, life: 3.2 + 1.4 * s, foam: 0.25, delay: 0.1 });
    if (s > 1.3) ripple(x, z, { amp: 0.32 * Math.min(s, 4) * shallow, speed: 2.6 + 0.8 * s, width: 0.9 + 0.35 * s, life: 4 + 1.2 * s, foam: 0.1, delay: 0.05 });
    // direction the spray leans
    const dx = o.dir ? o.dir[0] : 0, dz = o.dir ? o.dir[1] : 0, dl = Math.hypot(dx, dz);
    const lx = dl > 0 ? dx / dl : 0, lz = dl > 0 ? dz / dl : 0, lean = dl > 0 ? 1 : 0;
    // the crown of droplets
    const nCrown = Math.ceil((8 + 14 * s) * (0.5 + 0.5 * shallow));
    for (let i = 0; i < nCrown; i++) {
      const a = rnd() * TAU, sp = rr(0.8, 2.3) * (0.6 + 0.75 * s) * (0.7 + 0.3 * shallow);
      const vy = rr(2.2, 4.3) * (0.55 + 0.55 * sq);
      const vx = Math.cos(a) * sp + lx * lean * vy * 0.6, vz = Math.sin(a) * sp + lz * lean * vy * 0.6;
      const tl = (2 * vy) / G;
      fx.drops.emit({ x: x + Math.cos(a) * 0.08 * s, y: wy, z: z + Math.sin(a) * 0.08 * s, vx, vy, vz, life: tl * 0.95, s0: 0.1 + 0.12 * s, s1: 0.06, c0: [1, 1, 1, 0.85], c1: [1, 1, 1, 0.1], grav: G, drag: 0.35 });
      if (s >= 0.35 && i % 3 === 0 && pending.length < 160) pending.push({ t: clock + tl * 0.92, x: x + vx * tl * 0.8, z: z + vz * tl * 0.8, y: wy, s: 0.25 + 0.15 * s });
    }
    // the central jet: a column of heavier drops that rises, then falls back in
    if (s > 0.5) {
      const nJet = Math.ceil(3 + 3.5 * s);
      for (let i = 0; i < nJet; i++) {
        const vy = rr(4.5, 7.5) * (0.6 + 0.5 * sq), a = rnd() * TAU, sp = rr(0.1, 0.7) * s;
        const tl = (2 * vy) / G;
        fx.drops.emit({ x: x + rr(-0.12, 0.12) * s, y: wy + 0.05, z: z + rr(-0.12, 0.12) * s, vx: Math.cos(a) * sp + lx * lean * 1.2, vy, vz: Math.sin(a) * sp + lz * lean * 1.2, life: tl * 0.95, s0: 0.2 + 0.16 * s, s1: 0.08, c0: [1, 1, 1, 0.9], c1: [1, 1, 1, 0.15], grav: G, drag: 0.25 });
        if (i % 2 === 0 && pending.length < 160) pending.push({ t: clock + tl * 0.9, x: x + rr(-0.5, 0.5) * s, z: z + rr(-0.5, 0.5) * s, y: wy, s: 0.5 + 0.2 * s });
      }
    }
    // spray and the foam it leaves floating on the surface
    fx.mist.emit({ x, y: wy + 0.15, z, vy: 0.5 + 0.4 * s, life: 1.2 + 0.5 * s, s0: 0.7 * s + 0.3, s1: 3 * s + 1.2, c0: [1, 1, 1, 0.16], c1: [1, 1, 1, 0], drag: 1 });
    if (s > 0.3) {
      for (let i = 0, n = Math.ceil(2 + 4 * s); i < n; i++) {
        const a = rnd() * TAU, r = rr(0.1, 0.9) * s;
        fx.mist.emit({ x: x + Math.cos(a) * r, y: wy + 0.04, z: z + Math.sin(a) * r, vx: Math.cos(a) * 0.12, vz: Math.sin(a) * 0.12, life: rr(2.2, 3.6), s0: 0.3 * s + 0.15, s1: 0.7 * s + 0.35, c0: [1, 1, 1, 0.1], c1: [1, 1, 1, 0], drag: 0.8 });
      }
    }
    if (s > 1.8) {                                   // very big: a second column of mist rising off the impact
      for (let i = 0; i < 10; i++) fx.mist.emit({ x: x + rr(-1, 1) * sq, y: wy + 0.3, z: z + rr(-1, 1) * sq, vx: rr(-1, 1), vy: rr(2, 5), vz: rr(-1, 1), life: rr(1.6, 2.8), s0: 1.2, s1: 4.5, c0: [1, 1, 1, 0.3], c1: [1, 1, 1, 0], drag: 0.6, grav: 1 });
    }
  };

  /** something small stirs the surface without breaking it: a bobber nibbled, a fish turning, a drip. Just rings. */
  fx.plink = (x, z, s = 1) => {
    ripple(x, z, { amp: 0.12 * s, speed: 0.55 + 0.2 * s, width: 0.07 + 0.03 * s, life: 1.3 + 0.5 * s, foam: 0.06 });
  };
}
