# Five coat colourings on every boar part (wild, silver tusker, ginger, spotted feral pig, striped piglet).
# 'wild' is the normal vertex colour; the others ride along as custom vec3 attributes (_tusker, _ginger, _spotted, _piglet).
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


def nzf(co, f, off=0.0):
    return np.array([noise.noise(V((x * f + off, y * f - off, z * f))) for x, y, z in co]) * 0.5 + 0.5


PAL = {
    'wild':    dict(coat=('#3a2d25', '#7c6651'), back='#26201b', belly='#5b4938', mane=('#1b1511', '#4d3d30'), skin='#8b6f67', snout='#6e5851', ear=('#2d241f', '#9c7c6e'), leg='#2a211c', lower='#1d1612', hoof='#0f0b09', tusk='#e9e0c6', eye='#080605', tail='#35291f', tuft='#120e0b', bristle='#8d7a64'),
    'tusker':  dict(coat=('#46403a', '#8d8573'), back='#332e29', belly='#6a6358', mane=('#231e1a', '#948a78'), skin='#6d5e57', snout='#4c403b', ear=('#4a443c', '#a08c80'), leg='#38322c', lower='#26211d', hoof='#12100e', tusk='#f2ead2', eye='#080605', tail='#4a443c', tuft='#1b1713', bristle='#b3a894'),
    'ginger':  dict(coat=('#984a22', '#d08c4a'), back='#74361a', belly='#dba96f', mane=('#552610', '#c47c3a'), skin='#c68a78', snout='#b87a68', ear=('#8a4020', '#e8b09a'), leg='#69301a', lower='#4a2410', hoof='#2a1a12', tusk='#eee2c4', eye='#0a0705', tail='#8a4020', tuft='#3a1a0c', bristle='#d8a66a'),
    'spotted': dict(coat=('#dccbb6', '#e6bfa9'), back='#d6c2ac', belly='#ecd6c4', mane=('#d8c5ae', '#f1e2d0'), skin='#e0a998', snout='#e0a898', ear=('#d9a690', '#f0c6b4'), leg='#d4bda6', lower='#c9b199', hoof='#3a2c28', tusk='#f1e7cc', eye='#0a0705', tail='#dcc6ae', tuft='#2a211d', bristle='#e8d6c0', patch='#251e1b'),
    'piglet':  dict(coat=('#4a3524', '#6a4d34'), back='#3a2a1c', belly='#c9a97a', mane=('#34261a', '#5a4430'), skin='#c89a88', snout='#c08e7c', ear=('#4a3524', '#d9a898'), leg='#5a4230', lower='#4a3524', hoof='#2a1c14', tusk='#f1e7cc', eye='#0a0705', tail='#4a3524', tuft='#2a1c14', bristle='#a98c64', stripe='#e2c68e'),
}
ORDER = ['wild', 'tusker', 'ginger', 'spotted', 'piglet']


def patchfield(co):
    # the same dark-patch map on every part of the spotted pig, so patches run across joints
    a = nzf(co, 2.1, 7.0) + 0.5 * (nzf(co, 4.8, 1.0) - 0.5)
    return ss(0.52, 0.64, a)


def stripes(co):
    # cream stripes down the flanks of a piglet: bands that follow the body's curve
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    th = np.arctan2(x, z - 0.64)
    side = ss(0.35, 0.8, np.abs(np.sin(th)))
    band = (np.sin((np.pi * 0.5 - np.abs(th)) * 5.2 + 0.4) > 0.35).astype(float)
    lenf = ss(-0.5, -0.38, y) * ss(0.55, 0.42, y)
    return band * side * lenf * ss(0.36, 0.5, z) * ss(1.0, 0.9, z)


def paint(ob, part):
    me = ob.data
    N = len(me.vertices)
    co = np.empty(N * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    ax = np.abs(x)
    g1 = nzf(co, 40.0); g2 = nzf(co, 95.0, 3.0); g3 = nzf(co, 11.0, 5.0)
    store = {}
    for name in ORDER:
        P = PAL[name]
        c0, c1 = lin(P['coat'][0]), lin(P['coat'][1])
        flecks = np.clip((g1 * 0.8 + g2 * 0.55 + g3 * 0.15 - 0.42) * 1.5, 0, 1) * 0.85 * (0.3 if name == 'spotted' else 1.0)
        coat = mix(c0, c1, flecks)
        pat = patchfield(co) if name == 'spotted' else np.zeros(N)
        if part == 'body':
            col = mix(coat, lin(P['back']), ss(0.82, 1.03, z) * 0.75)
            col = mix(col, lin(P['belly']), ss(0.5, 0.33, z) * 0.9)
            if name == 'spotted':
                col = mix(col, lin(P['patch']), pat * 0.96)
            if name == 'piglet':
                col = mix(col, lin(P['stripe']), stripes(co) * 0.92)
        elif part == 'mane':
            t = np.clip(0.2 + (z - 0.9) * 3.0, 0, 1)
            col = mix(lin(P['mane'][0]), lin(P['mane'][1]), np.clip(t * 0.6 + g2 * 0.5, 0, 1))
            if name == 'spotted':
                col = mix(col, lin(P['patch']), pat * 0.96)
        elif part == 'head':
            col = mix(coat, lin(P['back']), ss(0.8, 0.95, z) * 0.5)
            col = mix(col, lin(P['snout']), ss(-0.74, -0.92, y) * 0.85)
            col = mix(col, lin(P['skin']), ss(-0.98, -1.01, y))                      # the rooting disc is bare skin
            if name == 'tusker':
                col = mix(col, lin('#8c8374'), ss(-0.55, -0.75, y) * 0.55 * ss(0.62, 0.9, z))   # pale grey face
            if name == 'spotted':
                col = mix(col, lin(P['patch']), pat * 0.96 * ss(-0.95, -0.7, y))
            if name == 'piglet':
                col = mix(col, lin(P['stripe']), 0.55 * np.exp(-((ax) / 0.025) ** 2) * ss(-0.62, -0.78, y) * ss(-0.95, -0.82, y))   # pale blaze down the nose
            nost = np.exp(-(((ax - 0.03) / 0.014) ** 2 + ((y + 1.045) / 0.016) ** 2 + ((z - 0.668) / 0.016) ** 2))
            col = mix(col, lin('#1a0f0c'), np.clip(nost * 1.4, 0, 1))
            sock = np.exp(-(((ax - 0.125) / 0.03) ** 2 + ((y + 0.665) / 0.03) ** 2 + ((z - 0.79) / 0.03) ** 2))
            col = mix(col, lin(P['back']), np.clip(sock, 0, 1) * 0.7)
        elif part == 'headfur':
            col = mix(lin(P['bristle']), lin(P['coat'][1]), np.clip(g2, 0, 1) * 0.5)
            if name == 'spotted':
                col = np.tile(lin(P['bristle']), (N, 1))
        elif part == 'jaw':
            col = mix(coat, lin(P['snout']), ss(-0.75, -0.9, y) * 0.8)
            col = mix(col, lin(P['belly']), 0.4 + 0 * y)
        elif part == 'tusk':
            col = mix(lin(P['tusk']), lin('#b8a98a'), 0.25 * g2)
            col = mix(col, lin('#8a7a5c'), ss(0.65, 0.63, z) * 0.7)
        elif part == 'ear':
            col = mix(lin(P['ear'][0]), lin(P['ear'][1]), np.clip(0.25 + 0.5 * g2, 0, 1) * ss(0.93, 1.0, z) * 0.7)
            if name == 'piglet':
                col = mix(lin(P['ear'][0]), lin(P['ear'][1]), 0.35 * ss(0.95, 1.05, z))
        elif part == 'eye':
            col = np.tile(lin(P['eye']), (N, 1))
        elif part == 'tail0':
            col = mix(lin(P['tail']), lin(P['back']), 0.3 + 0 * z)
            if name == 'spotted':
                col = mix(col, lin(P['patch']), pat * 0.9)
        elif part == 'tail1':
            col = mix(lin(P['tail']), lin(P['tuft']), ss(0.52, 0.4, z))
        elif part == 'upper':
            col = mix(coat, lin(P['leg']), ss(0.5, 0.3, z) * 0.9)
            if name == 'spotted':
                col = mix(np.tile(lin(P['coat'][0]), (N, 1)), lin(P['patch']), pat * 0.96)
                col = mix(col, lin(P['lower']), ss(0.34, 0.26, z) * 0.35)
        else:  # lower leg
            col = mix(lin(P['leg']), lin(P['lower']), np.clip(ss(0.27, 0.12, z) + 0.2 * g2, 0, 1))
            if name == 'spotted':
                col = mix(np.tile(lin(P['coat'][0]), (N, 1)), lin(P['patch']), pat * 0.96)
                col = mix(col, lin(P['lower']), ss(0.2, 0.06, z) * 0.45)
            col = mix(col, lin(P['hoof']), ss(0.07, 0.04, z))
        col = np.clip(col, 0, 1)
        store[name] = np.concatenate([col, np.ones((N, 1))], 1).astype(np.float32)
    for nm in list(me.color_attributes.keys()):
        me.color_attributes.remove(me.color_attributes[nm])
    for nm in ('_tusker', '_ginger', '_spotted', '_piglet'):
        if nm in me.attributes:
            me.attributes.remove(me.attributes[nm])
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', store['wild'].reshape(-1))
    for name in ('tusker', 'ginger', 'spotted', 'piglet'):
        at = me.attributes.new('_' + name, 'FLOAT_VECTOR', 'POINT')
        at.data.foreach_set('vector', store[name][:, :3].reshape(-1))
    me.color_attributes.active_color = me.color_attributes['Col']


for ob in bpy.data.objects:
    if ob.type != 'MESH':
        continue
    n = ob.name
    part = ('body' if n == 'body_mesh' else 'mane' if n == 'mane_mesh' else 'head' if n == 'head_mesh' else 'headfur' if n == 'headfur_mesh'
            else 'jaw' if n == 'jaw_mesh' else 'tusk' if n.startswith('tusk') else 'ear' if n.startswith('ear') else 'eye' if n.startswith('eye')
            else 'tail0' if n == 'tail0_mesh' else 'tail1' if n == 'tail1_mesh' else 'upper' if n.endswith('upper_mesh') else 'lower')
    paint(ob, part)
result = {'painted': True}
