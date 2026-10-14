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


rw('src/fauna_sea.js', [
    ("import { fx } from './props.js';", "import { fx } from './props.js';\nimport { wake as waterWake, waterY as seaY } from './ripples.js';"),
    # ---- dolphins: spray leans the way they travel, entries at the true surface, a wake while they swim near it
    ("this.breachCooldown = rr(45, 80); fx.splash(this.x, 0, this.z, 1.0);",
     "this.breachCooldown = rr(45, 80); fx.splash(this.x, 0, this.z, 1.0, { dir: [Math.sin(this.heading), Math.cos(this.heading)] });"),
    ("      if (oldY > 0 && this.y <= 0 && this.vy < 0) fx.splash(this.x, 0, this.z, 1.8);",
     "      const wy = seaY(this.x, this.z);\n      if (oldY > wy && this.y <= wy && this.vy < 0) fx.splash(this.x, wy, this.z, 1.8, { dir: [Math.sin(this.heading), Math.cos(this.heading)] });"),
    ("    this.group.position.set(this.x, this.y, this.z);\n    this.group.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');\n\n    if (this.jumpTime < 0) {",
     "    this.group.position.set(this.x, this.y, this.z);\n    this.group.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');\n    if (this.jumpTime < 0 && this.y > -0.9) waterWake(this, this.x, this.z, this.speed, this.role === 'calf' ? 0.45 : 0.8, dt);\n\n    if (this.jumpTime < 0) {"),
    # ---- turtles
    ("if (this.mode === 'breathe' && this.modeAge > 2.2 && this.modeAge < 2.4) fx.splash(this.x, 0, this.z, 0.35);",
     "if (this.mode === 'breathe' && this.modeAge > 2.2 && this.modeAge < 2.4) fx.splash(this.x, 0, this.z, 0.22);\n    if (this.y > -0.55 && this.speed > 0.3) waterWake(this, this.x, this.z, this.speed * 2, 0.5, dt, 0.15);"),
    # ---- whale: bigger, leaning splashes at the true surface; flipper slaps, the fluke going down, a wake near the surface
    ("""    if (this.prevY < 0 && this.y >= 0) fx.splash(x, 0, z, 1.4);
    if (this.prevY > 0 && this.y <= 0) fx.splash(x, 0, z, 2.2);
    this.prevY = this.y;""",
     """    const wy = seaY(x, z), wdir = [Math.sin(this.yaw), Math.cos(this.yaw)];
    if (this.prevY < wy && this.y >= wy) fx.splash(x, wy, z, 3.4, { dir: wdir });
    if (this.prevY > wy && this.y <= wy) fx.splash(x, wy, z, 5.0, { dir: wdir });
    if (this.mode === 'slap' && !this.slapped && this.modeAge > 1.2) { this.slapped = true; fx.splash(x + wdir[1] * 4, wy, z - wdir[0] * 4, 1.9); }
    if (this.mode === 'dive' && !this.flukeDone && this.modeAge > 1.6) { this.flukeDone = true; fx.splash(x - wdir[0] * 7, wy, z - wdir[1] * 7, 2.4, { dir: [-wdir[0], -wdir[1]] }); }
    if (this.y > -1.7 && this.y < 1 && this.mode !== 'breach') waterWake(this, x, z, Math.max(this.speed, 1.4) * 1.6, 3.2, dt, 0.5);
    this.prevY = this.y;"""),
    ("    this.mode = mode; this.modeT = seconds; this.modeAge = 0;\n    if (mode === 'surface') this.blown = false;",
     "    this.mode = mode; this.modeT = seconds; this.modeAge = 0;\n    this.slapped = false; this.flukeDone = false;\n    if (mode === 'surface') this.blown = false;"),
    ("    events.emit('spout', bx, 1, bz);\n", "    events.emit('spout', bx, 1, bz);\n    fx.ripple(bx, bz, { amp: 0.22, speed: 1.5, width: 0.35, life: 3, foam: 0.25 });\n"),
    # ---- shark: the dorsal fin cuts a V through the surface
    ("    this.group.position.set(x, Math.min(Math.max(-0.75, g + 1.0), -0.35), z);\n    this.group.rotation.set(0, yaw, this.bank, 'YXZ');",
     "    this.group.position.set(x, Math.min(Math.max(-0.75, g + 1.0), -0.35), z);\n    this.group.rotation.set(0, yaw, this.bank, 'YXZ');\n    waterWake(this, x, z, this.speed * 1.8, 0.7, dt, 0.5);"),
    # ---- gulls: float on the swell, splash down and lift off, paddle now and then, plunge for fish
    ("    this.pos.set(p.x, p.water ? env.tide : p.y, p.z);\n    this.pitch = damp(this.pitch, 0, 4, dt); this.roll = damp(this.roll, 0, 4, dt); this.speed = 0;",
     "    this.pos.set(p.x, p.water ? seaY(p.x, p.z) : p.y, p.z);\n    if (p.water) { this.ripT = (this.ripT ?? rr(1, 3)) - dt; if (this.ripT < 0) { this.ripT = rr(2.5, 5); fx.plink(p.x, p.z, 0.7); } }\n    this.pitch = damp(this.pitch, 0, 4, dt); this.roll = damp(this.roll, 0, 4, dt); this.speed = 0;"),
    ("  takeOff() { this.enter('takeoff', 1.3);", "  takeOff() { if (this.state === 'perch' && this.perch && this.perch.water) fx.splash(this.pos.x, this.pos.y, this.pos.z, 0.25, { quiet: true }); this.enter('takeoff', 1.3);"),
    ("      this.pos.set(p.x, landY, p.z); this.speed = 0; this.vy = 0; this.pitch = 0; this.roll = 0;\n",
     "      this.pos.set(p.x, landY, p.z); this.speed = 0; this.vy = 0; this.pitch = 0; this.roll = 0;\n      if (p.water) fx.splash(p.x, landY, p.z, 0.22, { quiet: true });\n"),
    ("if (spot) { this.diveSpot = spot; this.enter('dive', 2.4);", "if (spot) { this.diveSpot = spot; this.dived = false; this.enter('dive', 2.4);"),
    ("    this.pitch = damp(this.pitch, phase < 0.5 ? 0.6 : -0.4, 4, dt);\n    if (this.stateT < 0) { this.target = findCoastTarget(this.c, this.pos); this.enter('patrol', rr(8, 16));",
     "    this.pitch = damp(this.pitch, phase < 0.5 ? 0.6 : -0.4, 4, dt);\n    if (phase > 0.45 && !this.dived) { this.dived = true; fx.splash(this.pos.x, env.tide, this.pos.z, 0.2, { dir: [Math.sin(this.heading), Math.cos(this.heading)] }); }\n    if (this.stateT < 0) { this.target = findCoastTarget(this.c, this.pos); this.enter('patrol', rr(8, 16));"),
    # ---- terns: the plunge makes a splash
    ("        if (this.t < 0 || this.pos.y < ground + 0.6) { this.st = 'climb'; this.t = 1.6; }",
     "        if (this.t < 0 || this.pos.y < ground + 0.6) { if (ground <= 0.1) fx.splash(this.pos.x, 0, this.pos.z, 0.28); this.st = 'climb'; this.t = 1.6; }"),
])
print('ok')
