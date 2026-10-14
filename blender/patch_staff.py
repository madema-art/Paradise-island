import os
os.chdir(r'D:\Paradise Island')
p = 'src/human.js'
s = open(p, encoding='utf-8').read()
a = "  const staff = seg(0.016, 0.021, 1.5, '#6b4a2c', 6); staff.position.set(0, 0.17, 0.02); staff.visible = false; me.armR.hand.add(staff);"
assert a in s
b = """  // walking staff: a gnarled driftwood pole with cord lashing and a bone fish-hook dangling on a line
  const staff = new THREE.Group(); staff.position.set(0, 0.17, 0.02); staff.visible = false; me.armR.hand.add(staff);
  {
    const pole = seg(0.015, 0.023, 1.58, '#6b4a2c', 7); staff.add(pole);
    for (const [yy, r, xx] of [[-0.42, 0.028, 0.005], [0.08, 0.025, -0.004], [0.46, 0.029, 0.004], [0.7, 0.024, -0.003]]) at(blob(r, '#5a3d22', 1, 0.7, 1, 7), xx, yy, 0, staff);
    const cord = new THREE.MeshStandardMaterial({ color: '#d9c48e', roughness: 1 });
    for (let i = 0; i < 8; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0205 - i * 0.0004, 0.0046, 5, 10), cord); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.6 + i * 0.0155, 0); staff.add(ring); }
    const line = seg(0.0016, 0.0016, 0.55, '#ece6d0', 4); line.position.set(0.03, 0.34, 0.012); staff.add(line);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0032, 5, 12, Math.PI * 1.45), new THREE.MeshStandardMaterial({ color: '#ddd5bd', roughness: 0.5 }));
    hook.position.set(0.012, 0.045, 0.012); hook.rotation.set(0, 0, -0.6); staff.add(hook);
    staff.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }"""
s = s.replace(a, b, 1)
open(p, 'w', encoding='utf-8').write(s)

p = 'src/castaway_model.js'
s = open(p, encoding='utf-8').read()
a = "  const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, emissive: 0x24120a });"
assert a in s
b = a + "\n  skinShader(skinMat);"
s = s.replace(a, b, 1)
s = s.replace("/** returns the same rig object", """/** leathery, weathered skin: object-space mottling plus a fine pore/wrinkle bump that fades with distance */
function skinShader(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObj;
float h31(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float vn3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y), f.z); }
float skinH(vec3 p){ return vn3(p*64.)*0.5 + vn3(p*190.)*0.32 + vn3(p*22.)*0.18; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float n1 = vn3(vObj*9.), n2 = vn3(vObj*34.+3.), n3 = vn3(vObj*150.);
  float near = 1.0 - smoothstep(4.0, 14.0, length(vViewPosition));
  diffuseColor.rgb *= 1.0 + (n1-.5)*0.4 + (n2-.5)*0.24 + (n3-.5)*0.16*near;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.1,0.9,0.8), smoothstep(.55,.82,n1)*0.55); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float hh = skinH(vObj); float fade = 1.0 - smoothstep(3.0, 12.0, length(vViewPosition));
  vec2 dH = vec2(dFdx(hh), dFdy(hh)) * 0.55 * fade;
  vec3 sx = normalize(dFdx(-vViewPosition)), sy = normalize(dFdy(-vViewPosition));
  vec3 R1 = cross(sy, normal), R2 = cross(normal, sx);
  float det = dot(sx, R1); vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
  normal = normalize(abs(det) * normal - grad); }`);
  };
}

/** returns the same rig object""", 1)
open(p, 'w', encoding='utf-8').write(s)
print('ok')
