# Four colour sets on every crab part (red beach crab, pale ghost crab, purple coconut crab, orange hermit crab).
import bpy, numpy as np
from mathutils import Vector, noise
V = Vector


def lin(h):
    h = h.lstrip('#')
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    a = a if a.ndim == 2 else a[None, :]
    b = b if b.ndim == 2 else b[None, :]
    return a * (1 - t[:, None]) + b * t[:, None]


PAL = {
    'red':     dict(dorsal=('#d8441f', '#a02a14'), ridge='#f47c4e', under='#efd3b0', leg=('#e2582b', '#b53c1c'), joint='#7a2212', tip='#2f1710', claw=('#e24c26', '#b73219'), finger='#f2e3c8', eye='#08080a', stalk='#d05a30'),
    'ghost':   dict(dorsal=('#dccaa2', '#bda676'), ridge='#f0e5c6', under='#f6eedc', leg=('#eadcba', '#cdb98f'), joint='#9e8358', tip='#5e4129', claw=('#ddcca1', '#c1ab7f'), finger='#f7f0de', eye='#08080a', stalk='#d9c9a0'),
    'coconut': dict(dorsal=('#5a4c92', '#37326a'), ridge='#8576bd', under='#bdaea0', leg=('#4c3f8c', '#6b4b3b'), joint='#2a2450', tip='#1c1826', claw=('#6f5646', '#473a6a'), finger='#2c2430', eye='#08080a', stalk='#4f4590'),
    'hermit':  dict(dorsal=('#e08f44', '#c3612b'), ridge='#f4b36d', under='#f3ddb6', leg=('#de9049', '#b66b2f'), joint='#8a4821', tip='#46281a', claw=('#ea a65c'.replace(' ', ''), '#d1782f'), finger='#f8e8c6', eye='#08080a', stalk='#d68a46'),
}
ORDER = ['red', 'ghost', 'coconut', 'hermit']


def paint(ob, kind):
    me = ob.data
    N = len(me.vertices)
    co = np.empty(N * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    ax = np.abs(x)
    n1 = np.array([noise.noise(V((a * 14, b * 14, c * 14))) for a, b, c in co]) * 0.5 + 0.5
    n2 = np.array([noise.noise(V((a * 45 + 3, b * 45, c * 45))) for a, b, c in co]) * 0.5 + 0.5
    store = {}
    for name in ORDER:
        P = PAL[name]
        if kind == 'carapace':
            d0, d1 = lin(P['dorsal'][0]), lin(P['dorsal'][1])
            col = mix(d0, d1, np.clip(0.25 + 0.7 * n1 + 0.25 * ss(0.3, 0.38, ax) - 0.2 * ss(0.05, 0.18, z), 0, 1))
            col = mix(col, lin(P['ridge']), np.clip((n2 - 0.55) * 2.6, 0, 1) * 0.55 * ss(0.03, 0.08, z))
            col = mix(col, lin(P['under']), ss(-0.025, -0.055, z))
            # eye stalks and eyes
            stalk = ss(-0.2, -0.225, y) * ss(0.03, 0.06, z) * ss(0.16, 0.1, ax)
            col = mix(col, lin(P['stalk']), stalk * (1 - ss(0.17, 0.19, z)))
            eye = ss(-0.245, -0.26, y) * ss(0.19, 0.2, z) * ss(0.16, 0.12, ax)
            col = mix(col, lin(P['eye']), eye)
        elif kind == 'leg':
            t = np.clip((ax - 0.31) / 0.45, 0, 1)
            base = mix(lin(P['leg'][0]), lin(P['leg'][1]), np.clip(0.3 + 0.7 * n1, 0, 1))
            col = mix(base, lin(P['joint']), np.exp(-((t - 0.3) / 0.07) ** 2) * 0.7 + np.exp(-((t - 0.62) / 0.05) ** 2) * 0.45)
            col = mix(col, lin(P['tip']), ss(-0.12, -0.17, z))
        elif kind == 'claw':
            base = mix(lin(P['claw'][0]), lin(P['claw'][1]), np.clip(0.2 + 0.8 * n1, 0, 1))
            col = mix(base, lin(P['finger']), ss(-0.6, -0.72, y) * 0.9)
            col = mix(col, lin(P['joint']), np.exp(-(((y + 0.31) / 0.03) ** 2)) * 0.5 + np.exp(-(((y + 0.4) / 0.03) ** 2)) * 0.4)
            col = mix(col, lin(P['under']), ss(0.02, -0.02, z) * 0.6)
        elif kind == 'pincer':
            base = mix(lin(P['claw'][0]), lin(P['claw'][1]), np.clip(0.3 + 0.6 * n1, 0, 1))
            col = mix(base, lin(P['finger']), ss(-0.64, -0.73, y))
        else:  # shell
            ang = np.arctan2(y - 0.1, x)
            band = 0.5 + 0.5 * np.sin(z * 120 + ang * 2.0)
            col = mix(lin('#efe2c2'), lin('#7c4b2a'), (band > 0.72).astype(float) * 0.85)
            col = mix(col, lin('#f4dcc0'), ss(0.12, 0.06, z))
        col = np.clip(col, 0, 1)
        store[name] = np.concatenate([col, np.ones((N, 1))], 1).astype(np.float32)
    # the red palette is the normal vertex colour; the others ride along as custom vec3 attributes (_ghost, _coconut, _hermit)
    for nm in list(me.color_attributes.keys()):
        me.color_attributes.remove(me.color_attributes[nm])
    for nm in ('_ghost', '_coconut', '_hermit'):
        if nm in me.attributes:
            me.attributes.remove(me.attributes[nm])
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', store['red'].reshape(-1))
    for name in ('ghost', 'coconut', 'hermit'):
        at = me.attributes.new('_' + name, 'FLOAT_VECTOR', 'POINT')
        at.data.foreach_set('vector', store[name][:, :3].reshape(-1))
    me.color_attributes.active_color = me.color_attributes['Col']


for ob in bpy.data.objects:
    if ob.type != 'MESH':
        continue
    n = ob.name
    kind = 'carapace' if n == 'carapace' else 'leg' if n.startswith('leg_') else 'claw' if n.startswith('claw_') else 'pincer' if n.startswith('pincer_') else 'shell'
    paint(ob, kind)
result = {'painted': True}
