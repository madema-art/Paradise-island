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


PLUME = """    float rfoam = rp.z * rdk * (0.5 + 0.5*vn(p*8.0 + uTime*vec2(0.9,-0.6)));
    // estuaries: fresh river water spreads out over the sea, with a mixing front where the two meet
    float plumeAcc = 0.0, plumeEdge = 0.0, plumeStreak = 0.0;
    for (int mi = 0; mi < 2; mi++) {
      vec4 M = uMouth[mi], Q = uMouthB[mi];
      vec2 dd = p - M.xy; vec2 dir = M.zw; vec2 perp = vec2(-dir.y, dir.x);
      float al = dot(dd, dir), ac = dot(dd, perp);
      float nzp = vn(p*0.11 + vec2(uTime*0.02, -uTime*0.015)) + 0.6*vn(p*0.37 - vec2(uTime*0.05, 0.));
      float wd = Q.x*(0.55 + 1.5*clamp(al/Q.y, 0., 1.5));
      float lat = abs(ac)/wd + (nzp-0.8)*0.45;
      float lenK = 1.0 - smoothstep(0.5, 1.0, al/Q.y + (nzp-0.8)*0.35);
      float pm = (1.0 - smoothstep(0.5, 1.0, lat)) * lenK * smoothstep(-3.0, 4.0, al) * Q.z;
      plumeAcc = max(plumeAcc, pm);
      plumeEdge = max(plumeEdge, smoothstep(0.16, 0.0, abs(pm/max(Q.z,0.01) - 0.32)) * smoothstep(0.0, 6.0, al));
      plumeStreak = max(plumeStreak, smoothstep(0.58, 0.9, vn(vec2(al*0.28 - uTime*0.8, ac*0.8))) * pm);
    }
    float shallowK = smoothstep(0.04, 0.6, depth);
    vec3 freshC = mix(vec3(0.50,0.66,0.50), vec3(0.26,0.66,0.60), smoothstep(0.0, 0.8, 1.0 - plumeAcc));
    col = mix(col, freshC*uLight, plumeAcc*0.72);
    col += vec3(0.5,0.55,0.4)*uLight*plumeStreak*0.16;
    alpha = mix(alpha, max(alpha, 0.9*shallowK), plumeAcc);
    float foam = clamp(f1 + f2 + cap + rfoam + plumeEdge*0.4*(0.4 + 0.6*vn(p*5.0 + uTime*vec2(0.3,0.2))) * shallowK, 0., 1.);"""

rw('src/water.js', [
    ("import { lerp } from './util.js';", "import { lerp } from './util.js';\nimport { ripUniforms, RIPPLE_GLSL } from './ripples.js';"),
    ("  }, extra);\n  return u;", "  }, ripUniforms, extra);\n  return u;"),
    ("#include <fog_pars_vertex>\nfloat waveH(vec2 p, float t){", "#include <fog_pars_vertex>\n${RIPPLE_GLSL}\nfloat waveH(vec2 p, float t){"),
    ("  wp.y += waveH(wp.xz,uTime)*amp*uChop;\n", "  wp.y += waveH(wp.xz,uTime)*amp*uChop;\n  wp.y += rippleH(wp.xz) * smoothstep(0.1, 1.5, depth);\n"),
    ("varying vec3 vWorld;\n#include <fog_pars_fragment>\n${NOISE}\nvec2 waveGrad(", "varying vec3 vWorld;\n#include <fog_pars_fragment>\n${NOISE}\n${RIPPLE_GLSL}\nuniform vec4 uMouth[2];\nuniform vec4 uMouthB[2];\nvec2 waveGrad("),
    ("  g += (vec2(vn(p*1.7+uTime*0.3), vn(p*1.9-uTime*0.27+9.))-0.5)*0.05;\n",
     "  g += (vec2(vn(p*1.7+uTime*0.3), vn(p*1.9-uTime*0.27+9.))-0.5)*0.05;\n  vec3 rp = ripples(p);\n  float rdk = smoothstep(0.02, 0.45, depth);\n  g += rp.xy * 0.8 * rdk;\n"),
    ("    float foam = clamp(f1 + f2 + cap, 0., 1.);", PLUME),
    ("varying vec3 vWorld; varying vec2 vUv; varying vec2 vFlow; varying float vDepth; varying float vFade;\n#include <fog_pars_fragment>\n${NOISE}\nfloat wh(",
     "varying vec3 vWorld; varying vec2 vUv; varying vec2 vFlow; varying float vDepth; varying float vFade;\n#include <fog_pars_fragment>\n${NOISE}\n${RIPPLE_GLSL}\nfloat wh("),
    ("  vec3 N = normalize(vec3((h0-hx)*3.0*uBump, 1.0, (h0-hz)*3.0*uBump));\n",
     "  vec3 N = normalize(vec3((h0-hx)*3.0*uBump, 1.0, (h0-hz)*3.0*uBump));\n  vec3 rp = ripples(p);\n  float rdk = smoothstep(0.02, 0.4, vDepth);\n  N = normalize(N + vec3(-rp.x*0.7, 0.0, -rp.y*0.7)*rdk);\n"),
    ("  foam = clamp(foam,0.,1.);\n", "  foam += rp.z*rdk*(0.5 + 0.5*vn(p*8.0 + t*vec2(0.9,-0.6)));\n  foam = clamp(foam,0.,1.);\n"),
    ("  const oceanU = shared({ uSize: { value: SIZE }, uHeight: { value: heightTex }, uChop: U.chop, uRain: U.rain, uTide: U.tide });",
     """  // river mouths: where a stream meets the sea, its fresh water spreads out over the salt
  const mouth = (rv, width, length, strength) => {
    const P = rv.pts, n = P.length, a = P[Math.max(0, n - 5)], b = P[n - 1];
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    return [new THREE.Vector4(b.x - dx * 2, b.z - dz * 2, dx, dz), new THREE.Vector4(width, length, strength, 0)];
  };
  const mB = mouth(river.B, 9, 60, 1), mC = mouth(river.C, 10, 75, 1);
  const oceanU = shared({ uSize: { value: SIZE }, uHeight: { value: heightTex }, uChop: U.chop, uRain: U.rain, uTide: U.tide, uMouth: { value: [mB[0], mC[0]] }, uMouthB: { value: [mB[1], mC[1]] } });"""),
])
print('ok')
