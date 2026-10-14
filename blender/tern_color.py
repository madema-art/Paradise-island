# Two plumages of the white tern: the adult (snow white, the normal vertex colour) and the juvenile (grey-brown back and wings with pale
# spots, white underparts; it takes about a year to turn white). The juvenile rides along as the vec3 attribute _juv.
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
    'adult': dict(body='#fbfbf8', back='#f4f4f0', tip='#d9e0e6', head='#fbfbf8', bill='#1c1c20', eye='#0d0d10', leg='#2a2a2e', tail='#fbfbf8', wing='#fbfbf8'),
    'juv':   dict(back=('#6b5f56', '#4f463f'), spot='#e9e2d4', body='#f2f0ea', tip='#4f463f', head='#6b5f56', bill='#2c2624', eye='#0d0d10', leg='#3c3530', tail=('#5f544b', '#463d36'), wing=('#5f544b', '#3f3832')),
}
KEYS = ['adult', 'juv']


def paint(ob, which):
    me = ob.data
    N = len(me.vertices)
    co = np.empty(N * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    ax = np.abs(x)
    n1 = np.array([noise.noise(V((a * 16, b * 16, c * 16))) for a, b, c in co]) * 0.5 + 0.5
    n2 = np.array([noise.noise(V((a * 60 + 3, b * 60, c * 60))) for a, b, c in co]) * 0.5 + 0.5
    P = PAL[which]
    nm = ob.name
    if nm == 'tn_eye_mesh':
        col = np.tile(lin(P['eye']), (N, 1))
    elif nm == 'tn_bill_mesh':
        col = np.tile(lin(P['bill']), (N, 1))
    elif nm.startswith('tn_leg'):
        col = np.tile(lin(P['leg']), (N, 1))
    elif nm == 'tn_body_mesh':
        if which == 'adult':
            col = np.tile(lin(P['body']), (N, 1))
        else:
            back = mix(lin(P['back'][0]), lin(P['back'][1]), np.clip(0.3 + 0.7 * n1, 0, 1))
            spots = ss(0.66, 0.72, n2) * ss(0.0, 0.02, z) * 0.85          # pale flecks across the back
            back = mix(back, lin(P['spot']), spots)
            col = mix(np.tile(lin(P['body']), (N, 1)), back, ss(0.0, 0.025, z))   # white underneath, dark along the top
    elif nm == 'tn_head_mesh':
        col = np.tile(lin(P['head'] if which == 'adult' else P['head']), (N, 1))
        if which == 'juv':
            col = mix(np.tile(lin(P['body']), (N, 1)), col, ss(0.0, 0.03, z))
    elif nm == 'tn_tail_mesh':
        if which == 'adult':
            col = np.tile(lin(P['tail']), (N, 1))
        else:
            col = mix(lin(P['tail'][0]), lin(P['tail'][1]), np.clip(0.3 + 0.6 * n1, 0, 1))
    elif nm.startswith('tn_arm') or nm.startswith('tn_hand'):
        if which == 'adult':
            col = np.tile(lin(P['wing']), (N, 1))
            if nm.startswith('tn_hand'):
                col = mix(col, lin(P['tip']), ss(0.3, 0.42, ax) * 0.75)             # grey-tipped primaries
        else:
            col = mix(lin(P['wing'][0]), lin(P['wing'][1]), np.clip(0.3 + 0.6 * n1, 0, 1))
            col = mix(col, lin(P['spot']), ss(0.64, 0.7, n2) * 0.6)
    else:
        col = np.tile(lin('#ffffff'), (N, 1))
    col = np.clip(col, 0, 1)
    return np.concatenate([col, np.ones((N, 1))], 1).astype(np.float32)


for ob in bpy.data.objects:
    if ob.type != 'MESH' or not ob.name.startswith('tn_'):
        continue
    me = ob.data
    store = {k: paint(ob, k) for k in KEYS}
    for nm in list(me.color_attributes.keys()):
        me.color_attributes.remove(me.color_attributes[nm])
    if '_juv' in me.attributes:
        me.attributes.remove(me.attributes['_juv'])
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', store['adult'].reshape(-1))
    at = me.attributes.new('_juv', 'FLOAT_VECTOR', 'POINT')
    at.data.foreach_set('vector', store['juv'][:, :3].reshape(-1))
    me.color_attributes.active_color = me.color_attributes['Col']
result = {'painted': True, 'variants': KEYS}
