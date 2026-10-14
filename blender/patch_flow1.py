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


rw('src/water.js', [
    # the vertex shader hands the ribbon width to the fragment shader
    ("attribute vec2 aFlow;\nattribute float aDepth;\nattribute float aFade;\nvarying vec3 vWorld; varying vec2 vUv; varying vec2 vFlow; varying float vDepth; varying float vFade;",
     "attribute vec2 aFlow;\nattribute float aDepth;\nattribute float aFade;\nattribute float aWidth;\nvarying vec3 vWorld; varying vec2 vUv; varying vec2 vFlow; varying float vDepth; varying float vFade; varying float vWidth;"),
    ("  vUv = uv; vFlow = aFlow; vDepth = aDepth; vFade = aFade;", "  vUv = uv; vFlow = aFlow; vDepth = aDepth; vFade = aFade; vWidth = aWidth;"),
    ("varying vec3 vWorld; varying vec2 vUv; varying vec2 vFlow; varying float vDepth; varying float vFade;\n#include <fog_pars_fragment>\n${NOISE}\n${RIPPLE_GLSL}\nfloat wh(vec2 p, vec2 f, float t){\n  p += vec2(sin(t*0.3),cos(t*0.27))*0.4;\n  return vn(p*1.3 - f*t*0.9)*0.6 + vn(p*3.1 - f*t*1.7 + 7.)*0.3 + vn(p*7.7 - f*t*2.6)*0.1;\n}",
     """varying vec3 vWorld; varying vec2 vUv; varying vec2 vFlow; varying float vDepth; varying float vFade; varying float vWidth;
#include <fog_pars_fragment>
${NOISE}
${RIPPLE_GLSL}
// The surface pattern is carried along the flow with a two-phase "flow map": each copy of the pattern slides downstream for one short
// cycle, and the two copies (half a cycle apart) cross-fade so the reset never shows. Scrolling the pattern by f*t outright shears it
// without limit wherever the stream speeds up or slows down, and after a few minutes it appears to crawl UPSTREAM.
const float CYC = 1.6;
float wh0(vec2 p, vec2 f, float s){
  p += vec2(sin(s*0.3),cos(s*0.27))*0.4;
  return vn(p*1.3 - f*s*0.9)*0.6 + vn(p*3.1 - f*s*1.7 + 7.)*0.3 + vn(p*7.7 - f*s*2.6)*0.1;
}
float wh(vec2 p, vec2 f, float t){
  float a = fract(t/CYC), b = fract(t/CYC + 0.5);
  float wa = 1.0 - abs(2.0*a - 1.0);
  return mix(wh0(p, f, b*CYC), wh0(p, f, a*CYC), wa);
}
float vnF(vec2 p, vec2 f, float k, float t){
  float a = fract(t/CYC), b = fract(t/CYC + 0.5);
  float wa = 1.0 - abs(2.0*a - 1.0);
  return mix(vn(p - f*k*b*CYC), vn(p - f*k*a*CYC), wa);
}"""),
    ("  float foam = edge*(0.35+0.65*vn(p*5.-f*t*1.2)) + streak;",
     """  // bright streaks stretched along the stream and sliding downstream: the clearest sign of which way the water runs
  float spd = length(f);
  float ac = (vUv.x - 0.5)*vWidth, al = vUv.y;
  float ca = fract(t/CYC), cb = fract(t/CYC + 0.5), cw = 1.0 - abs(2.0*ca - 1.0);
  float lnA = vn(vec2(ac*2.3, (al - spd*ca*CYC*0.8)*0.75)), lnB = vn(vec2(ac*2.3, (al - spd*cb*CYC*0.8)*0.75));
  float lines = smoothstep(0.7, 0.93, mix(lnB, lnA, cw)) * clamp(spd*0.35, 0.0, 0.8) * step(0.5, vWidth);
  float foam = edge*(0.35+0.65*vnF(p*5., f, 1.2, t)) + streak + lines*0.55;"""),
])
# the width of each ribbon section goes to the shader
rw('src/water.js', [
    ("  const fd = new Float32Array(n * cols);\n", "  const fd = new Float32Array(n * cols), wdt = new Float32Array(n * cols);\n"),
    ("      fd[k] = fi * fi * (3 - 2 * fi) * fo * fo * (3 - 2 * fo);\n", "      fd[k] = fi * fi * (3 - 2 * fi) * fo * fo * (3 - 2 * fo);\n      wdt[k] = widths[i];\n"),
    ("  g.setAttribute('aFade', new THREE.BufferAttribute(fd, 1));\n  g.setIndex(idx);\n  return g;", "  g.setAttribute('aFade', new THREE.BufferAttribute(fd, 1));\n  g.setAttribute('aWidth', new THREE.BufferAttribute(wdt, 1));\n  g.setIndex(idx);\n  return g;"),
])
print('ok')
