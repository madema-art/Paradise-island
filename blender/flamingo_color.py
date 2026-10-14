# Four plumage variants of the greater flamingo, all within what real birds show:
#   classic  the common rosy-pink adult
#   pale     a washed-out adult (less carotene in the diet), nearly white with a blush of pink
#   vivid    a deep coral-red adult (a shrimp-rich diet), still pink-red and never orange
#   juv      a young grey-white bird with grey-brown legs and a dark bill, not yet pink
# The classic colours go on the normal vertex colour; the other three ride along as vec3 attributes (_pale, _vivid, _juv).
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
    'classic': dict(body=('#f7aabb', '#f58ba3'), coverts=('#ef6f8d', '#e25577'), leg=('#ea8aa3', '#d96d8a'),
                    bill=('#f2a3b6', '#e58aa0'), tip='#1b1516', flight='#1d1719', eye='#e6d46b', pupil='#0c0a0b'),
    'pale': dict(body=('#fce6ea', '#f7cfd8'), coverts=('#f7c3d0', '#eda9bb'), leg=('#f4c6d0', '#e4aebe'),
                 bill=('#f8d4dd', '#eab6c3'), tip='#1b1516', flight='#231d20', eye='#e6d46b', pupil='#0c0a0b'),
    'vivid': dict(body=('#fb8190', '#f25f74'), coverts=('#e8405e', '#c8304c'), leg=('#e8566f', '#c63f5a'),
                  bill=('#f0596f', '#d44a60'), tip='#1b1516', flight='#1d1416', eye='#e6d46b', pupil='#0c0a0b'),
    'juv': dict(body=('#e6e1df', '#d2cbc9'), coverts=('#bfb6b3', '#a9a09d'), leg=('#8f8788', '#7d7476'),
                bill=('#4a4245', '#3a3335'), tip='#1b1516', flight='#4a4446', eye='#c8b96a', pupil='#0c0a0b'),
}
KEYS = ['classic', 'pale', 'vivid', 'juv']


def paint(ob, P):
    me = ob.data
    N = len(me.vertices)
    co = np.empty(N * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    n1 = np.array([noise.noise(V((a * 14, b * 14, c * 14))) for a, b, c in co]) * 0.5 + 0.5
    n = ob.name
    if n.startswith('fl_eye'):
        col = np.tile(lin(P['eye']), (N, 1))
    elif n.startswith('fl_pupil'):
        col = np.tile(lin(P['pupil']), (N, 1))
    elif n.startswith('fl_bill') or n.startswith('fl_billLow'):
        t = np.clip((-y - 0.16) / 0.21, 0, 1)                                    # 0 at the base, 1 at the tip
        col = mix(lin(P['bill'][0]), lin(P['bill'][1]), n1 * 0.6)
        col = mix(col, lin(P['tip']), ss(0.68, 0.92, t))                         # only the tip third is black
    elif n.startswith('fl_wing'):
        col = mix(lin(P['coverts'][0]), lin(P['coverts'][1]), np.clip(0.2 + 0.8 * n1, 0, 1))
        ax = np.abs(x)
        flight = np.maximum(ss(0.40, 0.48, ax), ss(0.16, 0.24, y) * ss(0.22, 0.3, ax))   # black primaries outboard, and the trailing edge
        col = mix(col, lin(P['flight']), flight * 0.95)
    elif n.startswith('fl_thigh') or n.startswith('fl_shank') or n.startswith('fl_hip') or n.startswith('fl_knee'):
        col = mix(lin(P['leg'][0]), lin(P['leg'][1]), np.clip(0.3 + 0.6 * n1, 0, 1))
    elif n.startswith('fl_foot'):
        col = mix(lin(P['leg'][0]), lin(P['leg'][1]), np.clip(0.4 + 0.5 * n1, 0, 1))
    else:                                                                        # body, neck, head: the plumage
        col = mix(lin(P['body'][0]), lin(P['body'][1]), np.clip(0.25 + 0.7 * n1, 0, 1))
        if n.startswith('fl_neck') or n == 'fl_head_mesh':
            col = mix(col, lin(P['body'][1]), np.full(N, 0.25))
    col = np.clip(col, 0, 1)
    return np.concatenate([col, np.ones((N, 1))], 1).astype(np.float32)


for ob in bpy.data.objects:
    if ob.type != 'MESH' or not ob.name.startswith('fl_'):
        continue
    me = ob.data
    store = {k: paint(ob, PAL[k]) for k in KEYS}
    for nm in list(me.color_attributes.keys()):
        me.color_attributes.remove(me.color_attributes[nm])
    for nm in ('_pale', '_vivid', '_juv'):
        if nm in me.attributes:
            me.attributes.remove(me.attributes[nm])
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', store['classic'].reshape(-1))
    for k, suf in (('pale', '_pale'), ('vivid', '_vivid'), ('juv', '_juv')):
        at = me.attributes.new(suf, 'FLOAT_VECTOR', 'POINT')
        at.data.foreach_set('vector', store[k][:, :3].reshape(-1))
    me.color_attributes.active_color = me.color_attributes['Col']
result = {'painted': True, 'variants': KEYS}
