import os
os.chdir(r'D:\Paradise Island')


def rw(p, pairs):
    s = open(p, encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    for a, b in pairs:
        assert a in s, (p, a[:70])
        s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)


# ---------------------------------------------------------------- world.js: nearest stream level, for wet banks
rw('src/world.js', [(
    "/** water surface height of a stream at (x,z), or null when not on a river */",
    """/** the nearest stream to (x,z): {d: distance to its centre line, y: its water level there, w: its width}, or null */
export function riverNear(x, z) {
  let best = null;
  for (const k of ['A', 'B', 'C']) {
    const n = carvers[k].nearest(x, z);
    if (n && (!best || n.d < best.d)) best = { d: n.d, y: river[k].W[n.i] + 0.03, w: river[k].w[n.i] };
  }
  return best;
}

/** water surface height of a stream at (x,z), or null when not on a river */""")])

# ---------------------------------------------------------------- terrain.js: wet sand, swash, lace foam, wet banks
rw('src/terrain.js', [
    ("import { grid, N, SEG, SIZE, HALF, CELL, VOL, TEMPLE, SPRING, FAIRY, LAKE, falls, getHeight, getSlope, lavaDist, riverDist } from './world.js';",
     "import { grid, N, SEG, SIZE, HALF, CELL, VOL, TEMPLE, SPRING, FAIRY, LAKE, falls, getHeight, getSlope, lavaDist, riverDist, riverNear } from './world.js';"),
    ("  const colr = new Float32Array(N * N * 3);\n", "  const colr = new Float32Array(N * N * 3);\n  const bank = new Float32Array(N * N);                   // how wet each vertex is from a nearby stream\n"),
    ("      colr[k * 3] = c.r; colr[k * 3 + 1] = c.g; colr[k * 3 + 2] = c.b;\n",
     "      colr[k * 3] = c.r; colr[k * 3 + 1] = c.g; colr[k * 3 + 2] = c.b;\n      if (h > 0.3) { const rn = riverNear(x, z); if (rn && rn.d < rn.w * 2.4) bank[k] = smoothstep(rn.y + 0.7, rn.y - 0.05, h) * smoothstep(rn.w * 2.4, rn.w * 0.7, rn.d); }\n"),
    ("  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));\n", "  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));\n  geo.setAttribute('aBank', new THREE.BufferAttribute(bank, 1));\n"),
    ("    sh.uniforms.uWetT = U.wet;\n",
     "    sh.uniforms.uWetT = U.wet;\n    sh.uniforms.uTideT = U.tide;\n    sh.uniforms.uPond = { value: [new THREE.Vector4(LAKE.x, LAKE.z, 24, LAKE.y), new THREE.Vector4(falls.pool.x, falls.pool.z, falls.pool.r + 4, falls.pool.y), new THREE.Vector4(SPRING.x, SPRING.z, SPRING.r + 5, SPRING.y - 0.05)] };\n"),
    ("      .replace('#include <common>', '#include <common>\\nvarying vec3 vWP;')\n      .replace('#include <begin_vertex>', '#include <begin_vertex>\\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');",
     "      .replace('#include <common>', '#include <common>\\nvarying vec3 vWP;\\nattribute float aBank;\\nvarying float vBank;')\n      .replace('#include <begin_vertex>', '#include <begin_vertex>\\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;\\nvBank = aBank;');"),
    ("varying vec3 vWP;\\nuniform float uTime;\\nuniform float uWetT;\\nuniform vec3 uLightT;\\n' + NOISE_GLSL)",
     "varying vec3 vWP;\\nvarying float vBank;\\nuniform float uTime;\\nuniform float uWetT;\\nuniform float uTideT;\\nuniform vec4 uPond[3];\\nuniform vec3 uLightT;\\n' + NOISE_GLSL)"),
    ("        diffuseColor.rgb *= (0.82 + 0.36*gn) * (1.0 - 0.3*uWetT);\n",
     """        diffuseColor.rgb *= (0.82 + 0.36*gn) * (1.0 - 0.3*uWetT);
        // where the sea, ponds and streams meet the ground: damp sand behind the swash, a wet shine where the last wave reached,
        // lace foam left on the sand as the water slides back, wet banks along the streams and pools
        float wetNow = 0.0, wetAll = 0.0, laceM = 0.0, retreat = 0.0;
        {
          float nA = tvn(vWP.xz*0.9 + vec2(uTime*0.07, 0.0));
          float phs = uTime*0.75 + nA*6.2832;
          float reach = uTideT + 0.42*(0.5+0.5*sin(phs))*0.9;
          float over = vWP.y - reach;
          float beach = smoothstep(2.6, 1.3, vWP.y) * smoothstep(-1.0, -0.15, vWP.y);
          wetNow = smoothstep(0.10, -0.08, over) * beach;
          float damp = smoothstep(0.75, 0.0, vWP.y - uTideT) * 0.7 * beach;
          wetAll = max(wetNow, damp);
          retreat = smoothstep(0.05, -0.7, cos(phs));
          float edge = abs(over + 0.015 + 0.035*(tvn(vWP.xz*6.5) - 0.5));
          laceM = smoothstep(0.075, 0.0, edge) * smoothstep(0.3, 0.7, tvn(vWP.xz*4.2 + uTime*0.12)) * beach;
          for (int pi = 0; pi < 3; pi++) {
            vec4 pd = uPond[pi]; float pr = length(vWP.xz - pd.xy);
            float inR = 1.0 - smoothstep(pd.z - 2.0, pd.z + 3.0, pr);
            float pw = smoothstep(pd.w + 0.5, pd.w - 0.02, vWP.y) * inR * step(0.5, pd.w);
            wetAll = max(wetAll, pw * 0.85);
            wetNow = max(wetNow, smoothstep(pd.w + 0.1, pd.w - 0.06, vWP.y) * inR * step(0.5, pd.w));
          }
          wetAll = max(wetAll, vBank * 0.8);
          wetNow = max(wetNow, vBank * smoothstep(0.55, 0.9, vBank));
        }
        diffuseColor.rgb *= 1.0 - 0.34*wetAll;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97,0.99,0.98), laceM*retreat*0.75);
"""),
    ("      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\\n roughnessFactor *= 1.0 - 0.4*uWetT;')",
     "      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\\n roughnessFactor *= (1.0 - 0.4*uWetT) * (1.0 - 0.55*wetNow);')"),
])
print('ok')
