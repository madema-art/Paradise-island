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


# ---------------------------------------------------------------- hooks so low-level modules can splash without importing props
rw('src/ripples.js', [(
    "export const rippleCount = () => count;",
    "export const rippleCount = () => count;\n/** modules that cannot import props.js (walking, the player) splash through here once fx exists */\nexport const hooks = { splash: null };\nexport const splashAt = (x, z, s, o) => { if (hooks.splash) hooks.splash(x, 0, z, s, o); };")])
rw('src/splash.js', [
    ("import { ripple, wake, waterAt } from './ripples.js';", "import { ripple, wake, waterAt, hooks } from './ripples.js';"),
    ("  fx.ripple = (x, z, o) => ripple(x, z, o);", "  fx.ripple = (x, z, o) => ripple(x, z, o);\n  hooks.splash = (...a) => fx.splash(...a);"),
])

# ---------------------------------------------------------------- first-person walking
rw('src/walk.js', [
    ("import { clamp, lerp, damp } from './util.js';", "import { clamp, lerp, damp } from './util.js';\nimport { splashAt, wake as waterWake } from './ripples.js';"),
    ("if (p.y > SURF - 0.4) events.emit('swim', run); }",
     "if (p.y > SURF - 0.4) { events.emit('swim', run); splashAt(p.x - sy * 0.7, p.z - cy * 0.7, run ? 0.32 : 0.2, { quiet: true }); } }\n    if (walk.speedXZ > 0.6) waterWake(walk, p.x, p.z, walk.speedXZ, 0.6, dt);"),
    ("        events.emit('step', surfaceAt(p.x, p.z, p.y, info.tag), run, walk.foot);\n",
     "        events.emit('step', surfaceAt(p.x, p.z, p.y, info.tag), run, walk.foot);\n        if (wading) splashAt(p.x, p.z, run ? 0.34 : 0.2, { quiet: true });\n"),
    ("    // footsteps\n    if (walk.grounded && walk.speedXZ > 0.6) {", "    if (wading && walk.grounded && walk.speedXZ > 1.2) waterWake(walk, p.x, p.z, walk.speedXZ * 0.7, 0.45, dt, 0.25);\n    // footsteps\n    if (walk.grounded && walk.speedXZ > 0.6) {"),
])

# ---------------------------------------------------------------- survival player
rw('src/survival/player.js', [
    ("import { clamp, damp, lerp } from '../util.js';", "import { clamp, damp, lerp } from '../util.js';\nimport { splashAt, wake as waterWake } from '../ripples.js';"),
    ("if (this.speed > 0.8 && this.swimT < 0) { this.swimT = this.run ? 0.65 : 1.0; events.emit('swim', this.run); }",
     "if (this.speed > 0.8 && this.swimT < 0) { this.swimT = this.run ? 0.65 : 1.0; events.emit('swim', this.run); splashAt(p.x + Math.sin(this.heading) * 0.7, p.z + Math.cos(this.heading) * 0.7, this.run ? 0.32 : 0.2, { quiet: true }); }\n      if (this.speed > 0.6) waterWake(this, p.x, p.z, this.speed, 0.6, dt);"),
    ("        if (this.stride > len) { this.stride = 0; this.foot ^= 1; events.emit('step', surfaceAt(p.x, p.z, p.y, this.info.tag), this.run, this.foot); }",
     "        if (this.stride > len) { this.stride = 0; this.foot ^= 1; events.emit('step', surfaceAt(p.x, p.z, p.y, this.info.tag), this.run, this.foot); if (wading) splashAt(p.x, p.z, this.run ? 0.34 : 0.2, { quiet: true }); }\n        if (wading && this.speed > 1.2) waterWake(this, p.x, p.z, this.speed * 0.7, 0.45, dt, 0.25);"),
])

# ---------------------------------------------------------------- the castaway
rw('src/human.js', [
    ("import { fx, makePaddle } from './props.js';", "import { fx, makePaddle } from './props.js';\nimport { wake as waterWake, waterY } from './ripples.js';"),
    ("    if (inWater) { waveT += dt; y = damp(y, 0.1 + Math.sin(waveT * 1.7) * 0.03, 10, dt); }\n",
     "    if (inWater) { waveT += dt; y = damp(y, 0.1 + Math.sin(waveT * 1.7) * 0.03, 10, dt); if (speedNow > 0.5) waterWake(wkSelf, x, z, speedNow, 0.55, dt); }\n    else if (hT < -0.05 && speedNow > 0.6) waterWake(wkSelf, x, z, speedNow * 0.7, 0.4, dt, 0.25);\n"),
    ("  let inWater = false, snap = false,", "  const wkSelf = {};\n  let inWater = false, snap = false,"),
    ("      bob.pos.y = bob.to.y + Math.sin(t * 1.6) * 0.025;\n      aPs += 0.03 * Math.sin(t * 0.8); hdX = 0.3;",
     "      bob.to.y = waterY(bob.to.x, bob.to.z); bob.pos.y = bob.to.y + Math.sin(t * 1.6) * 0.025;\n      bob.plT = (bob.plT ?? 1) - dt; if (bob.plT < 0) { bob.plT = rr(1.8, 3.4); fx.plink(bob.pos.x, bob.pos.z, 0.8); }\n      if (waitT - pt < 1.0 && Math.sin(t * 20) > 0.9) { bob.pos.y -= 0.03; if (rnd() < dt * 3) fx.plink(bob.pos.x, bob.pos.z, 0.55); }\n      aPs += 0.03 * Math.sin(t * 0.8); hdX = 0.3;"),
    ("      if (!bob.biteT) { bob.biteT = 1; fx.splash(bob.pos.x, bob.to.y, bob.pos.z, 0.25); }",
     "      if (!bob.biteT) { bob.biteT = 1; fx.splash(bob.pos.x, bob.to.y, bob.pos.z, 0.28); fx.plink(bob.pos.x, bob.pos.z, 1.5); }\n      if (rnd() < dt * 4) fx.plink(bob.pos.x, bob.pos.z, 1.1);"),
    ("      if (k < 0.9 && rnd() < dt * 4) fx.splash(bob.pos.x, bob.to.y, bob.pos.z, 0.18);",
     "      if (k < 0.9 && rnd() < dt * 4) fx.splash(bob.pos.x, bob.to.y, bob.pos.z, 0.18);\n      if (k < 0.92) waterWake(bob, bob.pos.x, bob.pos.z, 2.4 * (1 - k) + 0.7, 0.3, dt, 0.5);"),
])

# ---------------------------------------------------------------- survival fishing, and one source of truth for 'is this water'
rw('src/survival/game.js', [
    ("import { fx } from '../props.js';", "import { fx } from '../props.js';\nimport { waterY, wake as waterWake } from '../ripples.js';"),
    ("target: new THREE.Vector3(wa.x, seaLevelY(), wa.z), kind: wa.kind,", "target: new THREE.Vector3(wa.x, waterY(wa.x, wa.z), wa.z), kind: wa.kind, plT: 1.2, nibT: 0,"),
    ("    f.t += dt;\n    const moveKey =", "    f.t += dt;\n    f.target.y = waterY(f.target.x, f.target.z);          // the float rides the swell and the tide\n    const moveKey ="),
    ("      av.job('wait', 0, f.t);\n      f.bob.y = f.target.y + Math.sin(f.t * 1.7) * 0.025;",
     "      av.job('wait', 0, f.t);\n      f.bob.y = f.target.y + Math.sin(f.t * 1.7) * 0.025;\n      f.plT -= dt; if (f.plT < 0) { f.plT = rr(1.8, 3.4); fx.plink(f.bob.x, f.bob.z, 0.8); }\n      // a fish noses the float just before it bites: quick small rings and a twitch, your cue to be ready\n      if (f.wait - f.t < 1.1) { f.nibT -= dt; if (f.nibT < 0) { f.nibT = rr(0.25, 0.45); fx.plink(f.bob.x, f.bob.z, 0.6); } f.bob.y -= 0.025 * Math.max(0, Math.sin(f.t * 22)); }"),
    ("this.fishBite = true; fx.splash(f.target.x, f.target.y, f.target.z, 0.3); events.emit('sfx', 'bite'); }",
     "this.fishBite = true; fx.splash(f.target.x, f.target.y, f.target.z, 0.3); fx.plink(f.bob.x, f.bob.z, 1.6); f.pulse = 0; events.emit('sfx', 'bite'); }"),
    ("      f.bob.y = f.target.y - 0.05 - 0.08 * Math.abs(Math.sin(f.t * 16));\n      av.lineTo(f.bob, 0.2);",
     "      f.bob.y = f.target.y - 0.05 - 0.08 * Math.abs(Math.sin(f.t * 16));\n      f.pulse -= dt; if (f.pulse < 0) { f.pulse = 0.22; fx.plink(f.bob.x, f.bob.z, 1.2); }\n      av.lineTo(f.bob, 0.2);"),
    ("      if (Math.random() < dt * 5 && k < 0.9) fx.splash(f.bob.x, f.target.y, f.bob.z, 0.15);",
     "      if (Math.random() < dt * 5 && k < 0.9) fx.splash(f.bob.x, f.target.y, f.bob.z, 0.15);\n      if (k < 0.92) waterWake(f, f.bob.x, f.bob.z, 2.6 * (1 - k) + 0.8, 0.3, dt, 0.5);"),
])
rw('src/survival/actions.js', [
    ("import { poolLevel } from '../walk.js';", "import { waterAt } from '../ripples.js';"),
])


_s = open('src/survival/actions.js', encoding='utf-8', newline='').read()
_crlf = chr(13) + chr(10) in _s
_s = _s.replace(chr(13) + chr(10), chr(10))
_a = _s.index("export const seaLevel = () => env.tide;")
_b = _s.index("/** fresh water within reach of the player? */")
_s = _s[:_a] + """export const seaLevel = () => env.tide;
/** 'fresh' for streams and pools, 'sea' for the ocean, 'hot' for the spring, null for dry land (one source of truth: ripples.js) */
export function waterKind(x, z) { return waterAt(x, z).kind; }
/** water depth at a point */
export function depthAt(x, z) { return waterAt(x, z).depth; }
""" + _s[_b:]
open('src/survival/actions.js', 'w', encoding='utf-8', newline='').write(_s.replace(chr(10), chr(13) + chr(10)) if _crlf else _s)
print('ok')
