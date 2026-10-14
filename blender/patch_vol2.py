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


# ---------------------------------------------------------------- core: the volcano's glow is shared with the terrain shader
rw('src/core.js', [("  tide: { value: 0 },", "  volGlow: { value: 0.1 },       // how hot the volcano is running (0..1): lights the cracks in its flanks\n  tide: { value: 0 },")])

# ---------------------------------------------------------------- terrain: strata, scoria, sulphur, ash, and glowing cracks
rw('src/terrain.js', [
    ("  red: col('#6b3a2b'), mud: col('#5b5240'), pave: col('#7d7b68'), crust: col('#ddd5a4'),",
     "  red: col('#6b3a2b'), mud: col('#5b5240'), pave: col('#7d7b68'), crust: col('#ddd5a4'),\n  scoria: col('#8a3b22'), ashPale: col('#a39a8d'), sulphur: col('#d9c04a'),"),
    ("  // rock on slopes\n",
     """  // the upper cone of the volcano: strata, scoria, ribs dusted with ash, sulphur around the mouth
  if (vr < VOL.R + 6 && h > 42) {
    const up = smoothstep(42, 62, h), ang = Math.atan2(z - VOL.z, x - VOL.x);
    const strata = 0.5 + 0.5 * Math.sin(h * 0.62 + noise2(ang * 3 + 1, h * 0.05) * 4.0);
    const rib = noise2(ang * 5.0 + 3, vr * 0.004);
    tmp.copy(K.basalt).lerp(K.scoria, strata * 0.5 + 0.28 * (0.5 + 0.5 * noise2(x * 0.09, z * 0.09)));
    tmp.lerp(K.ashPale, smoothstep(0.05, 0.8, rib) * 0.38);
    out.lerp(tmp, up * 0.92);
    out.lerp(K.sulphur, smoothstep(34, 17, vr) * smoothstep(0.05, 0.5, noise2(x * 0.22 + 3, z * 0.22 - 1)) * 0.85 * up);
    if (h > 96) out.lerp(K.ashPale, smoothstep(96, 114, h) * 0.5);
  }
  // rock on slopes
"""),
    ("    sh.uniforms.uTideT = U.tide;\n", "    sh.uniforms.uTideT = U.tide;\n    sh.uniforms.uVolI = U.volGlow;\n    sh.uniforms.uVolC = { value: new THREE.Vector2(VOL.x, VOL.z) };\n"),
    ("uniform float uTideT;\\nuniform vec4 uPond[3];", "uniform float uTideT;\\nuniform float uVolI;\\nuniform vec2 uVolC;\\nuniform vec4 uPond[3];"),
    ("      .replace('#include <roughnessmap_fragment>',",
     """      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // molten cracks in the upper cone: brighter and busier the harder the volcano is working
          float vrr = length(vWP.xz - uVolC);
          float zone = smoothstep(52.0, 78.0, vWP.y) * (1.0 - smoothstep(26.0, 56.0, vrr));
          if (zone > 0.001) {
            vec2 qc = vWP.xz*0.12 + vec2(0.0, uTime*0.012);
            float nc = tvn(qc)*0.6 + tvn(qc*2.3 + 4.0)*0.4;
            float crk = 1.0 - smoothstep(0.0, 0.032, abs(nc - 0.5));
            float pul = 0.6 + 0.4*sin(uTime*1.3 + nc*20.0);
            totalEmissiveRadiance += vec3(1.0, 0.30, 0.05) * crk * zone * (0.25 + 1.5*uVolI) * pul;
          }
        }`)
      .replace('#include <roughnessmap_fragment>',"""),
])

# ---------------------------------------------------------------- volcano: heat to the terrain, a ring of cloud round the crown, a light above the rim
rw('src/volcano.js', [
    ("  scene.add(crater);\n", "  scene.add(crater);\n  const rimLight = new THREE.PointLight(0xff7a30, 900, 190, 2);\n  rimLight.position.set(VOL.x, VOL.rim + 12, VOL.z);\n  scene.add(rimLight);\n"),
    ("    lakeMat.uniforms.uGlow.value = 0.9 + 0.5 * I;\n", "    lakeMat.uniforms.uGlow.value = 0.9 + 0.5 * I;\n    U.volGlow.value = I;\n    rimLight.intensity += ((500 + 2600 * I) * flick - rimLight.intensity) * Math.min(1, dt * 3);\n"),
    ("    // steam where lava meets the sea + small fumes along the flows\n",
     """    // a ring of cloud wreathing the crown, turning slowly round the summit
    tAcc.cap = (tAcc.cap || 0) + dt * 3.2;
    while (tAcc.cap > 1) {
      tAcc.cap--;
      const a = rnd() * TAU, r = rr(21, 36), sp = 1.6;
      steam.emit({ x: VOL.x + Math.cos(a) * r, y: VOL.rim - 14 + rr(-5, 14), z: VOL.z + Math.sin(a) * r, vx: -Math.sin(a) * sp, vy: rr(0.1, 0.6), vz: Math.cos(a) * sp, life: rr(9, 14), s0: rr(10, 16), s1: rr(24, 36), c0: [0.95, 0.95, 0.97, 0.13], c1: [0.95, 0.95, 0.97, 0.0], rise: 0.05, drag: 0.1 });
    }
    // steam where lava meets the sea + small fumes along the flows
"""),
])

# ---------------------------------------------------------------- the camera presets follow the taller crown
rw('src/main.js', [
    ("import { buildWorld, falls,", "import { initClimbRoute } from './climb.js';\nimport { buildAscentProps } from './ascent.js';\nimport { buildWorld, falls,"),
    ("  buildWorld();\n", "  buildWorld();\n  initClimbRoute();\n"),
    ("  const volcano = buildVolcano();\n", "  const volcano = buildVolcano();\n  buildAscentProps();\n"),
    ("{ name: 'Mount Ignis', pos: new THREE.Vector3(VOL.x, VOL.lavaY + 40, VOL.z), min: 80, max: 900 }", "{ name: 'Mount Ignis', pos: new THREE.Vector3(VOL.x, VOL.rim + 10, VOL.z), min: 80, max: 900 }"),
    ("{ name: 'Crater', pos: [VOL.x + 30, 124, VOL.z + 28], tgt: [VOL.x, 68, VOL.z],", "{ name: 'Crater', pos: [VOL.x + 34, VOL.rim + 16, VOL.z + 30], tgt: [VOL.x, VOL.lavaY + 10, VOL.z],"),
    ("{ name: 'Volcano', pos: [VOL.x + 110, 135, VOL.z + 120], tgt: [VOL.x, 78, VOL.z],", "{ name: 'Volcano', pos: [VOL.x + 120, 150, VOL.z + 130], tgt: [VOL.x, 82, VOL.z],"),
])

# ---------------------------------------------------------------- the avatar: climbing pose and lean
rw('src/survival/avatar.js', [
    ("      case 'hurt': {", """      case 'climb': {           // p = phase of the climbing stroke, t = how much he is moving (0..1): reach, pull, reach with the other hand
        const s = Math.sin(p), c = Math.cos(p), m = clamp(t, 0, 1);
        this.setPose({
          py: 0.86 + 0.015 * Math.cos(p * 2) * m, spX: 0.1, hdX: -0.5, nkX: -0.25,
          aPs: -2.15 - 0.55 * s * m, aPe: -0.45 - 0.55 * Math.max(0, -s) * m, aPz: 0.3,
          aNs: -2.15 + 0.55 * s * m, aNe: -0.45 - 0.55 * Math.max(0, s) * m, aNz: -0.3,
          lPh: -0.55 - 0.75 * Math.max(0, c) * m, lPk: 0.5 + 1.0 * Math.max(0, c) * m, lNh: -0.55 - 0.75 * Math.max(0, -c) * m, lNk: 0.5 + 1.0 * Math.max(0, -c) * m, lPz: 0.12, lNz: -0.12,
        });
        break;
      }
      case 'hurt': {"""),
    ("  place(x, y, z, heading) {\n    this.group.position.set(x, y, z);\n    this.group.rotation.y = heading;\n  }",
     "  place(x, y, z, heading, lean = 0) {\n    this.group.position.set(x, y, z);\n    this.group.rotation.set(lean, heading, 0, 'YXZ');       // lean: forward tilt, for leaning into a wall\n  }"),
])
print('ok')
