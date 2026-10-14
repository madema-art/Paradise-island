# The wild boar, built procedurally in Blender (metres, Z up, front = -Y, the ground is z = 0, feet at the origin).
# Rigid parts hang off a tree of empties that the game animates: body, head, jaw, ears, eyes, tusks, tail, four legs (hip + knee).
# bo_root > bo_body > { body, mane, neck pivot bo_head > { head, headfur, jaw > { tusks }, ears, eyes }, tail0 > tail1, hips > knees }
import sys, importlib, math, random
sys.path.insert(0, r'D:\Paradise Island\blender')
import cast_lib
importlib.reload(cast_lib)
from cast_lib import *
import numpy as np
from mathutils import Vector, noise

clear_scene()
rng = random.Random(11)


# ------------------------------------------------------------------ helpers
def remesh(ob, voxel, smooth=2, adapt=0.0):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.data.objects:
        o.select_set(o == ob)
    ob.data.remesh_voxel_size = voxel
    ob.data.remesh_voxel_adaptivity = adapt
    bpy.ops.object.voxel_remesh()
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(ob.data); bm.free()
    bpy.ops.object.shade_smooth()


def displace(ob, fn):
    me = ob.data
    N = len(me.vertices)
    co = np.empty(N * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    nr = np.empty(N * 3); me.vertex_normals.foreach_get('vector', nr); nr = nr.reshape(-1, 3)
    d = fn(co, nr)
    co2 = co + nr * d[:, None]
    me.vertices.foreach_set('co', co2.reshape(-1)); me.update()


def decimate_to(ob, target):
    n = len(ob.data.polygons)
    if n > target:
        bpy.context.view_layer.objects.active = ob
        m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = target / n
        bpy.ops.object.modifier_apply(modifier='d')
        bpy.ops.object.shade_smooth()


def nz3(co, f, off=0.0):
    return np.array([noise.noise(V((x * f + off, y * f - off, z * f))) for x, y, z in co])


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def gauss(co, c, r):
    return np.exp(-(((co[:, 0] - c[0]) / r[0]) ** 2 + ((co[:, 1] - c[1]) / r[1]) ** 2 + ((co[:, 2] - c[2]) / r[2]) ** 2))


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.04
    e.location = loc
    bpy.context.scene.collection.objects.link(e)
    if parent:
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.context.view_layer.update()
    return e


def attach(ob, parent):
    ob.parent = parent
    ob.matrix_parent_inverse = parent.matrix_world.inverted()


def yloft(S, rows, p=2.4, n=40):
    """loft along Y of super-ellipse rings; rows (y, z_bottom, z_top, half_width)"""
    base = len(S.v)
    for y, zb, zt, hw in rows:
        cz, rz = (zb + zt) / 2, (zt - zb) / 2
        for j in range(n):
            t = math.tau * j / n
            c, s_ = math.cos(t), math.sin(t)
            S.v.append(V((hw * math.copysign(abs(c) ** (2 / p), c), y, cz + rz * math.copysign(abs(s_) ** (2 / p), s_))))
    R = len(rows)
    for i in range(R - 1):
        for j in range(n):
            a0 = base + i * n + j; b0 = base + i * n + (j + 1) % n
            S.f.append((a0, b0, b0 + n, a0 + n))
    y0, zb, zt, _ = rows[0]
    c0 = len(S.v); S.v.append(V((0, y0 - 0.001, (zb + zt) / 2)))
    for j in range(n):
        S.f.append((c0, base + (j + 1) % n, base + j))
    y1, zb, zt, _ = rows[-1]
    c1 = len(S.v); S.v.append(V((0, y1 + 0.001, (zb + zt) / 2)))
    for j in range(n):
        S.f.append((c1, base + (R - 1) * n + j, base + (R - 1) * n + (j + 1) % n))


def spike(S, base, direction, length, r, n=5):
    d = V(direction).normalized()
    b = V(base)
    S.rod([b - d * r * 0.5, b + d * length * 0.5, b + d * length], [r, r * 0.55, r * 0.1], n=n)


def row_at(rows, y):
    for i in range(len(rows) - 1):
        a, b = rows[i], rows[i + 1]
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return [a[k] + (b[k] - a[k]) * t for k in range(1, 4)]
    return list(rows[-1][1:])


# ------------------------------------------------------------------ BODY
BODY_ROWS = [
    (-0.52, 0.47, 0.86, 0.14), (-0.45, 0.36, 0.98, 0.23), (-0.34, 0.30, 1.04, 0.28), (-0.17, 0.30, 1.03, 0.29),
    (0.0, 0.33, 0.97, 0.285), (0.17, 0.38, 0.91, 0.275), (0.34, 0.44, 0.86, 0.27), (0.48, 0.48, 0.82, 0.24),
    (0.585, 0.54, 0.75, 0.17), (0.64, 0.59, 0.70, 0.09),
]
S = Soup()
yloft(S, BODY_ROWS, p=2.3, n=44)
for s in (-1, 1):
    S.sphere((s * 0.19, 0.38, 0.62), (0.12, 0.19, 0.2), lat=10, lon=16)       # ham
    S.sphere((s * 0.17, -0.27, 0.64), (0.11, 0.15, 0.2), lat=10, lon=16)     # shoulder
body_ob = S.to_object('body_mesh')
remesh(body_ob, 0.0115, 2)


def body_disp(co, nr):
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    ax = np.abs(x)
    d = np.zeros(len(z))
    d += 0.018 * gauss(co, (0, -0.26, 1.04), (0.2, 0.26, 0.14))                       # withers hump
    d += 0.012 * (gauss(co, (0.2, -0.26, 0.7), (0.06, 0.14, 0.16)) + gauss(co, (-0.2, -0.26, 0.7), (0.06, 0.14, 0.16)))   # shoulder blades
    d += 0.014 * (gauss(co, (0.27, 0.4, 0.66), (0.06, 0.17, 0.16)) + gauss(co, (-0.27, 0.4, 0.66), (0.06, 0.17, 0.16)))   # hams
    d += -0.012 * gauss(co, (0, 0.42, 0.84), (0.03, 0.16, 0.04))                      # spine groove over the rump
    d += 0.007 * nz3(co, 9.0)
    d += 0.003 * nz3(co, 26.0, 4.0)                                                  # coat grain
    d += -0.012 * ss(0.38, 0.33, z) * 0.0                                            # (belly stays round)
    return d


displace(body_ob, body_disp)
decimate_to(body_ob, 2700)

# ------------------------------------------------------------------ MANE and rump bristles (crisp spikes, not remeshed)
Mn = Soup()
for k in range(40):
    y = -0.45 + k * 0.0205
    zt = row_at(BODY_ROWS, y)[1]
    big = 1.0 - 0.45 * ss(-0.3, 0.45, y)
    for row, (dx, dz, ln) in enumerate(((0.0, 0.012, 0.115), (0.032, -0.008, 0.085), (-0.032, -0.008, 0.085))):
        jit = rng.uniform(-0.01, 0.01)
        L = ln * big * rng.uniform(0.85, 1.15)
        spike(Mn, (dx + jit, y + rng.uniform(-0.01, 0.01), zt + dz - 0.01), (dx * 3 + rng.uniform(-0.18, 0.18), 0.55 + rng.uniform(-0.1, 0.1), 1.0), L, 0.0125, n=4)
mane_ob = Mn.to_object('mane_mesh')

# ------------------------------------------------------------------ HEAD (hangs off the neck pivot)
HEAD_ROWS = [
    (-0.40, 0.52, 1.00, 0.22), (-0.52, 0.55, 0.98, 0.20), (-0.62, 0.57, 0.95, 0.165), (-0.74, 0.59, 0.86, 0.115),
    (-0.86, 0.60, 0.76, 0.075), (-0.95, 0.605, 0.73, 0.062), (-1.0, 0.61, 0.725, 0.058),
]
Hd = Soup()
yloft(Hd, HEAD_ROWS, p=2.2, n=36)
for s in (-1, 1):
    Hd.sphere((s * 0.1, -0.7, 0.71), (0.05, 0.09, 0.08), lat=8, lon=12)         # cheek
Hd.sphere((0, -1.018, 0.668), (0.068, 0.034, 0.056), rot=(-0.15, 0, 0), lat=10, lon=16)   # rooting disc
head_ob = Hd.to_object('head_mesh')
remesh(head_ob, 0.0075, 4)


def head_disp(co, nr):
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    ax = np.abs(x)
    d = np.zeros(len(z))
    d += -0.01 * gauss(co, (0, -0.8, 0.82), (0.05, 0.1, 0.04))                    # dished forehead-to-snout line
    d += -0.009 * (gauss(co, (0.03, -1.045, 0.668), (0.012, 0.014, 0.014)) + gauss(co, (-0.03, -1.045, 0.668), (0.012, 0.014, 0.014)))   # nostrils
    d += -0.006 * gauss(co, (0.0, -1.05, 0.684), (0.05, 0.012, 0.012))            # lip line of the disc
    d += -0.012 * (gauss(co, (0.125, -0.665, 0.79), (0.03, 0.03, 0.03)) + gauss(co, (-0.125, -0.665, 0.79), (0.03, 0.03, 0.03)))  # eye sockets
    d += 0.007 * nz3(co, 14.0)
    d += 0.004 * nz3(co, 40.0, 3.0) * ss(-0.58, -0.8, y)                          # wrinkled skin on the snout
    return d


displace(head_ob, head_disp)
decimate_to(head_ob, 1100)

# bristles on the cheeks and chin, after the remesh
HF = Soup()
for s in (-1, 1):
    for k in range(9):
        a = k / 8
        spike(HF, (s * (0.13 - 0.02 * a), -0.64 - 0.1 * a, 0.66 - 0.03 * a), (s * 0.8, 0.6, -0.5 - 0.3 * a), 0.075 - 0.02 * a, 0.011, n=5)
    for k in range(5):
        yy = -0.66 - 0.04 * k
        spike(HF, (s * 0.07, yy, row_at(HEAD_ROWS, yy)[1] - 0.012), (s * 0.3, 0.8, 0.5), 0.05, 0.01, n=5)    # fringe on the brow
for k in range(6):
    spike(HF, (rng.uniform(-0.02, 0.02), -0.8 - 0.025 * k, 0.6), (0, 0.3, -1.0), 0.05, 0.008, n=5)     # chin whiskers
headfur_ob = HF.to_object('headfur_mesh')

# ------------------------------------------------------------------ JAW and TUSKS
JW = Soup()
yloft(JW, [(-0.6, 0.55, 0.64, 0.1), (-0.7, 0.56, 0.64, 0.085), (-0.8, 0.572, 0.635, 0.065), (-0.88, 0.585, 0.63, 0.048), (-0.9, 0.59, 0.628, 0.04)], p=2.2, n=20)
jaw_ob = JW.to_object('jaw_mesh')
remesh(jaw_ob, 0.006, 1)
decimate_to(jaw_ob, 200)

TUSK = {}
for s, nm in ((-1, 'N'), (1, 'P')):
    base = V((s * 0.058, -0.84, 0.628))
    T = Soup()
    pts = [base + V((0, 0, -0.008)), base + V((s * 0.012, -0.012, 0.025)), base + V((s * 0.024, -0.016, 0.06)), base + V((s * 0.03, -0.006, 0.095)), base + V((s * 0.026, 0.012, 0.125))]
    T.rod(pts, [0.017, 0.015, 0.012, 0.007, 0.0015], n=9)
    TUSK[nm] = (base, T)

# ------------------------------------------------------------------ EARS and EYES
EARS = {}
for s, nm in ((-1, 'N'), (1, 'P')):
    pv = V((s * 0.125, -0.56, 0.925))
    E = Soup()
    rings = []
    tip = V((s * 0.075, 0.045, 0.145))
    for k in range(9):
        t = k / 8
        c = pv + tip * (t ** 1.1) + V((0, -0.03 * math.sin(t * math.pi), 0))
        w = 0.066 * (1 - t) ** 0.7 + 0.003
        th = 0.012 * (1 - t) + 0.003
        rings.append((c, V((0.83 * w, 0.55 * s * w, 0)), V((-0.55 * s * th, 0.83 * th, 0))))
    E.loft(rings, n=10)
    EARS[nm] = (pv, E)

EYES = {}
for s, nm in ((-1, 'N'), (1, 'P')):
    c = V((s * 0.128, -0.665, 0.785))
    Eo = Soup()
    Eo.sphere(c, (0.019, 0.022, 0.019), lat=8, lon=12)
    EYES[nm] = (c, Eo)

# ------------------------------------------------------------------ TAIL
t0 = Soup()
P0 = V((0, 0.7, 0.71))
t0.rod([P0 - V((0, 0.02, 0)), V((0, 0.76, 0.7)), V((0, 0.8, 0.64)), V((0, 0.81, 0.58))], [0.026, 0.022, 0.017, 0.013], n=8)
P1 = V((0, 0.81, 0.58))
t1 = Soup()
t1.rod([P1, V((0, 0.82, 0.5)), V((0, 0.8, 0.43)), V((0, 0.79, 0.38))], [0.013, 0.011, 0.008, 0.005], n=8)
for k in range(9):
    a = k / 9 * math.tau
    spike(t1, V((0, 0.79, 0.395)), (math.cos(a) * 0.5, 0.15 + 0.1 * math.sin(a), -1.0 + 0.2 * math.sin(a)), 0.085, 0.009, n=4)

# ------------------------------------------------------------------ RIG
root = empty('bo_root', (0, 0, 0))
body = empty('bo_body', (0, 0.08, 0.65), root)
attach(body_ob, body); attach(mane_ob, body)
neck = empty('bo_head', (0, -0.42, 0.78), body)   # moved forward-to-back at the end
attach(head_ob, neck); attach(headfur_ob, neck)
jaw = empty('bo_jaw', (0, -0.6, 0.635), neck)
attach(jaw_ob, jaw)
for nm, (base, T) in TUSK.items():
    pv = empty(f'bo_tusk{nm}', base, jaw)
    m = T.to_object(f'tusk_{nm}_mesh')
    remesh(m, 0.0045, 1)
    decimate_to(m, 90)
    attach(m, pv)
for nm, (pv, E) in EARS.items():
    j = empty(f'bo_ear{nm}', pv, neck)
    m = E.to_object(f'ear_{nm}_mesh')
    remesh(m, 0.0055, 1)
    decimate_to(m, 130)
    attach(m, j)
for nm, (c, Eo) in EYES.items():
    j = empty(f'bo_eye{nm}', c, neck)
    m = Eo.to_object(f'eye_{nm}_mesh')
    bpy.context.view_layer.objects.active = m
    bpy.ops.object.shade_smooth()
    attach(m, j)
tail0 = empty('bo_tail0', P0, body)
m = t0.to_object('tail0_mesh'); remesh(m, 0.004, 1); decimate_to(m, 100); attach(m, tail0)
tail1 = empty('bo_tail1', P1, tail0)
m = t1.to_object('tail1_mesh'); remesh(m, 0.004, 1); decimate_to(m, 150); attach(m, tail1)

LEGS = {}
# front legs are straighter, rear legs have a visible hock; (hip, knee, ankle) per leg, x mirrored
FRONT = dict(hip=V((0.18, -0.26, 0.55)), knee=V((0.175, -0.28, 0.27)), ankle=V((0.17, -0.27, 0.06)), r=(0.088, 0.06, 0.044))
REAR = dict(hip=V((0.165, 0.4, 0.55)), knee=V((0.175, 0.44, 0.28)), ankle=V((0.175, 0.41, 0.06)), r=(0.105, 0.072, 0.047))
for fr, D in (('F', FRONT), ('R', REAR)):
    for s, nm in ((-1, 'N'), (1, 'P')):
        mir = V((s, 1, 1))
        H = D['hip'] * mir; K = D['knee'] * mir; A = D['ankle'] * mir
        hip = empty(f'bo_hip{fr}{nm}', H, body)
        U = Soup()
        mid = (H + K) * 0.5 + (V((0, 0.025, 0)) if fr == 'R' else V((0, -0.012, 0)))
        U.rod([H + V((0, 0, 0.03)), mid, K], [D['r'][0], D['r'][1], D['r'][2]], n=12, flat=(1.0, 1.05))
        U.sphere(K, 0.047, lat=7, lon=10)
        um = U.to_object(f'leg_{fr}{nm}_upper_mesh')
        remesh(um, 0.0075, 1)
        decimate_to(um, 170)
        attach(um, hip)
        knee = empty(f'bo_knee{fr}{nm}', K, hip)
        Lw = Soup()
        Lw.rod([K, (K + A) * 0.5 + (V((0, 0.01, 0)) if fr == 'R' else V((0, 0.0, 0))), A + V((0, 0, 0.0)), A + V((0, -0.012, -0.03))], [0.043, 0.034, 0.031, 0.03], n=10, flat=(1.0, 0.95))
        Lw.sphere(A + V((0, 0.0, 0.0)), (0.034, 0.036, 0.03), lat=7, lon=10)       # fetlock
        for dx in (-0.016, 0.016):                                                  # cloven hoof: two toes
            Lw.sphere(A + V((dx, -0.02, -0.036)), (0.017, 0.036, 0.024), rot=(0.12, 0, 0), lat=7, lon=10)
        for dx in (-0.024, 0.024):                                                  # dew claws
            Lw.sphere(A + V((dx, 0.028, 0.012)), (0.011, 0.014, 0.011), lat=5, lon=8)
        lm = Lw.to_object(f'leg_{fr}{nm}_lower_mesh')
        remesh(lm, 0.0055, 1)
        decimate_to(lm, 190)
        attach(lm, knee)
        LEGS[(fr, nm)] = (hip, knee)

# tidy every mesh: merge doubles, drop degenerate faces, make normals consistent
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()
    o.data.validate()
body.location.z -= 0.05
for (_fr, _nm), (_hip, _knee) in LEGS.items():
    _hip.location.z += 0.05
neck.location.y += 0.08       # the whole head group sits a little further back than it was modelled
tail0.location.y -= 0.08
bpy.context.view_layer.update()
result = {'ok': True, 'objs': len(bpy.data.objects), 'tris': sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')}
