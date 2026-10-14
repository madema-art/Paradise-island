# The shore crab, built procedurally in Blender (crab space: metres, Z up, front = -Y, body origin at the carapace centre,
# the ground is at z = -0.17). Rigid parts hang off a tree of empties that the game animates: legs, claws, pincers.
import sys, importlib, math, random
sys.path.insert(0, r'D:\Paradise Island\blender')
import cast_lib
importlib.reload(cast_lib)
from cast_lib import *
import numpy as np
from mathutils import Vector, noise

clear_scene()
rng = random.Random(5)
GROUND = -0.17


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


def decimate(ob, ratio):
    bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = ratio
    bpy.ops.object.modifier_apply(modifier='d')
    bpy.ops.object.shade_smooth()


def decimate_to(ob, target):
    n = len(ob.data.polygons)
    if n > target:
        decimate(ob, target / n)


def nz3(co, f, off=0.0):
    return np.array([noise.noise(V((x * f + off, y * f - off, z * f))) for x, y, z in co])


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.03
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


def superloft(S, prof, p=2.6, n=56):
    """loft of super-ellipse rings; prof rows (z, cy, a, b)"""
    base = len(S.v)
    for z, cy, a, b in prof:
        for j in range(n):
            t = math.tau * j / n
            c, s_ = math.cos(t), math.sin(t)
            S.v.append(V((a * math.copysign(abs(c) ** (2 / p), c), cy + b * math.copysign(abs(s_) ** (2 / p), s_), z)))
    R = len(prof)
    for i in range(R - 1):
        for j in range(n):
            a0 = base + i * n + j; b0 = base + i * n + (j + 1) % n
            S.f.append((a0, b0, b0 + n, a0 + n))
    c0 = len(S.v); S.v.append(V((0, prof[0][1], prof[0][0] - 0.001)))
    for j in range(n):
        S.f.append((c0, base + (j + 1) % n, base + j))
    c1 = len(S.v); S.v.append(V((0, prof[-1][1], prof[-1][0] + 0.001)))
    for j in range(n):
        S.f.append((c1, base + (R - 1) * n + j, base + (R - 1) * n + (j + 1) % n))


def spike(S, base, direction, length, r, n=6):
    d = V(direction).normalized()
    b = V(base)
    S.rod([b - d * r * 0.5, b + d * length * 0.5, b + d * length], [r, r * 0.6, r * 0.12], n=n)


# ------------------------------------------------------------------ CARAPACE (+ static eyes and mouthparts)
S = Soup()
superloft(S, [
    (-0.075, 0.0, 0.3, 0.2), (-0.05, 0.0, 0.36, 0.238), (-0.015, -0.005, 0.4, 0.262), (0.025, -0.008, 0.396, 0.26),
    (0.065, -0.01, 0.36, 0.238), (0.11, -0.012, 0.29, 0.198), (0.148, -0.012, 0.2, 0.146), (0.172, -0.012, 0.108, 0.082), (0.185, -0.012, 0.036, 0.03),
], p=2.9)
# anterolateral teeth along the front-side margin, and a rim of tiny spines at the back
for s in (-1, 1):
    for k in range(5):
        t = k / 4
        x = s * (0.37 - 0.2 * t); y = -0.09 - 0.135 * t
        spike(S, (x, y, 0.0 - 0.005 * t), (s * (1.0 - 0.7 * t), -(0.45 + 0.7 * t), 0.12), 0.05 - 0.004 * k, 0.019 - 0.002 * k)
    for k in range(3):
        spike(S, (s * (0.3 - 0.08 * k), 0.2 + 0.02 * k, -0.01), (s * 0.5, 1.0, 0.1), 0.026, 0.0095)
# eye stalks + eyes
for s in (-1, 1):
    S.rod([(s * 0.1, -0.225, 0.05), (s * 0.1, -0.256, 0.13), (s * 0.1, -0.268, 0.2)], [0.02, 0.017, 0.016], n=8)
    S.sphere((s * 0.1, -0.272, 0.222), (0.04, 0.04, 0.044), lat=10, lon=14)
# underside mouthparts
for s in (-1, 1):
    S.sphere((s * 0.045, -0.2, -0.07), (0.04, 0.03, 0.02), lat=6, lon=10)
    S.sphere((s * 0.075, -0.17, -0.075), (0.035, 0.04, 0.018), lat=6, lon=10)
S.sphere((0, 0.12, -0.085), (0.1, 0.12, 0.02), lat=8, lon=12)      # abdomen flap hint
body_ob = S.to_object('carapace')
remesh(body_ob, 0.0045, 2)


def carapace_disp(co, nr):
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    ax = np.abs(x)
    top = ss(0.02, 0.08, z)
    d = np.zeros(len(z))
    g = nz3(co, 22.0)
    d += top * 0.0035 * np.maximum(0, nz3(co, 55.0, 2.0) + 0.1)          # granular tubercles
    d += top * 0.0025 * g
    cg = -0.045 + 0.17 * (x / 0.3) ** 2                                  # cervical groove, curved
    d += -0.011 * top * np.exp(-((y - cg) / 0.011) ** 2) * ss(0.3, 0.1, ax) * ss(0.05, 0.1, z)
    for lx in (0.105, 0.19):                                              # longitudinal grooves between the regions
        d += -0.008 * top * np.exp(-((ax - lx) / 0.008) ** 2) * ss(-0.2, -0.08, y) * ss(0.2, 0.08, y) * ss(0.03, 0.09, z)
    d += 0.011 * np.exp(-(((ax) / 0.085) ** 2 + ((y + 0.075) / 0.07) ** 2 + ((z - 0.18) / 0.07) ** 2))       # gastric dome
    d += 0.009 * np.exp(-(((ax - 0.2) / 0.09) ** 2 + ((y - 0.06) / 0.1) ** 2 + ((z - 0.12) / 0.07) ** 2))   # branchial swell
    d += -0.01 * np.exp(-(((ax - 0.1) / 0.03) ** 2 + ((y + 0.255) / 0.03) ** 2 + ((z - 0.03) / 0.035) ** 2))    # eye sockets
    d += 0.004 * np.exp(-((ax - 0.347) / 0.012) ** 2) * ss(-0.03, 0.0, z) * ss(0.03, 0.0, z)                  # side rim bead
    return d


displace(body_ob, carapace_disp)
decimate_to(body_ob, 2700)

# ------------------------------------------------------------------ rig of empties
root = empty('crab_root', (0, 0, 0))
body = empty('body', (0, 0, 0), root)
attach(body_ob, body)

LEGS = {}
hip_y = [0.17, 0.085, -0.005, -0.095]
reach = [0.86, 1.0, 0.97, 0.84]
dy_up = [0.05, 0.02, -0.02, -0.05]
dy_tip = [0.05, 0.015, -0.03, -0.065]
for s, nm in ((-1, 'N'), (1, 'P')):
    for k in range(4):
        r = reach[k]
        hip = empty(f'leg{nm}{k}', (s * 0.31, hip_y[k], -0.01), body)
        H = V((s * 0.31, hip_y[k], -0.01))
        K = V((s * (0.31 + 0.2 * r), hip_y[k] + dy_up[k], 0.105))
        M = V((s * (0.31 + 0.345 * r), hip_y[k] + dy_up[k] * 1.7, 0.03))
        T = V((s * (0.31 + 0.45 * r), hip_y[k] + dy_up[k] * 2.0 + dy_tip[k], GROUND + 0.004))
        L = Soup()
        L.rod([H - V((s * 0.02, 0, 0)), H + (K - H) * 0.5, K], [0.044, 0.048, 0.044], n=10, flat=(1.0, 0.85))
        L.sphere(K, 0.048, lat=7, lon=10)
        L.rod([K, K + (M - K) * 0.5 + V((0, 0, 0.02)), M, M + (T - M) * 0.5, T], [0.04, 0.038, 0.027, 0.017, 0.006], n=8, flat=(1.0, 0.8))
        for q in range(5):                                  # little spines along the lower leg
            t = 0.15 + 0.17 * q
            P = K + (M - K) * min(1, t * 2) if t < 0.5 else M + (T - M) * ((t - 0.5) * 2)
            spike(L, P, (s * 0.2, 0.0, 1.0), 0.024, 0.008, n=5)
        leg = L.to_object(f'leg_{nm}{k}_mesh')
        remesh(leg, 0.0038, 2)
        decimate_to(leg, 250)
        attach(leg, hip)
        LEGS[(nm, k)] = (hip, leg, H, K, M, T)

# ------------------------------------------------------------------ claws (big chelae), each with a movable pincer
CLAWS = {}
for s, nm, size in ((-1, 'N', 1.0), (1, 'P', 0.86)):
    S0 = V((s * 0.3, -0.19, 0.0))
    claw = empty(f'claw{nm}', S0, body)
    E = V((s * 0.4, -0.31, 0.075)); W = V((s * 0.43, -0.4, 0.105))
    Pc = V((s * 0.4, -0.5, 0.1))
    A = Soup()
    A.rod([S0 - V((s * 0.02, 0.0, 0.0)), S0 + (E - S0) * 0.5 + V((0, 0, 0.03)), E], [0.04, 0.042, 0.036], n=10)
    A.sphere(E, 0.042, lat=8, lon=12)
    A.rod([E, W], [0.036, 0.04], n=10)
    A.sphere(W, 0.046, lat=8, lon=12)
    for q in range(4):
        spike(A, W + V((s * 0.01, -0.012 * q, 0.03)), (s * 0.3, -0.2, 1.0), 0.026, 0.01, n=5)
    # the palm (propodus), big and smooth, with the fixed finger sweeping forward and inward
    A.sphere(Pc, (0.1 * size, 0.125 * size, 0.082 * size), rot=(0, 0, s * 0.18), lat=12, lon=16)
    F0 = V((s * 0.385, -0.575 * 1.0, 0.07)); F1 = V((s * 0.345, -0.655, 0.058)); F2 = V((s * 0.285, -0.735, 0.05))
    A.rod([Pc + V((0, -0.05, -0.01)), F0, F1, F2], [0.062 * size, 0.048 * size, 0.03 * size, 0.008], n=10, flat=(1.0, 0.9))
    for q in range(5):
        t = 0.12 + 0.18 * q
        P = F0 + (F1 - F0) * min(1.0, t * 1.7) if t < 0.58 else F1 + (F2 - F1) * ((t - 0.58) / 0.42)
        spike(A, P + V((-s * 0.012, 0.0, 0.0)), (-s * 1.0, -0.2, 0.25), 0.02, 0.0085, n=5)
    cm = A.to_object(f'claw_{nm}_mesh')
    remesh(cm, 0.0042, 2)
    decimate_to(cm, 1000)
    attach(cm, claw)
    # the moving finger: pivot on the top-front of the palm
    pv = V((s * 0.405, -0.565, 0.115))
    pincer = empty(f'pincer{nm}', pv, claw)
    D = Soup()
    D0 = pv; D1 = V((s * 0.37, -0.64, 0.125)); D2 = V((s * 0.325, -0.7, 0.1)); D3 = V((s * 0.285, -0.74, 0.062))
    D.rod([D0 - V((0, 0.01, 0)), D1, D2, D3], [0.05 * size, 0.04 * size, 0.026 * size, 0.0075], n=10, flat=(1.0, 0.9))
    for q in range(4):
        P = D1 + (D3 - D1) * (0.2 + 0.22 * q)
        spike(D, P + V((-s * 0.01, 0.0, -0.012)), (-s * 0.6, -0.1, -1.0), 0.016, 0.0075, n=5)
    pm = D.to_object(f'pincer_{nm}_mesh')
    remesh(pm, 0.0038, 2)
    decimate_to(pm, 280)
    attach(pm, pincer)
    CLAWS[nm] = (claw, cm, pincer, pm)

# ------------------------------------------------------------------ hermit-crab shell (hidden unless the species wants it)
Hh = Soup()
pts, rad = [], []
turns, steps = 3.4, 120
for i in range(steps + 1):
    t = i / steps
    a = t * turns * math.tau
    R = 0.12 * (1 - 0.8 * t) + 0.015
    pts.append(V((R * math.cos(a), R * math.sin(a), 0.3 * t)))
    rad.append(0.08 * (1 - 0.9 * t) + 0.005)
Hh.rod(pts, rad, n=14)
shell_ob = Hh.to_object('shell_mesh')
from mathutils import Matrix
Rm = Matrix.Rotation(0.55, 3, 'X')
for v in shell_ob.data.vertices:
    v.co = Rm @ v.co + V((0.0, 0.1, 0.11))
shell_ob.data.update()
remesh(shell_ob, 0.0045, 2)
displace(shell_ob, lambda co, nr: 0.004 * np.sin(np.arctan2(co[:, 1] - 0.1, co[:, 0]) * 7 + co[:, 2] * 90))
decimate_to(shell_ob, 900)
shell = empty('shell', (0, 0.04, 0.1), body)
attach(shell_ob, shell)

result = {'ok': True, 'objs': len(bpy.data.objects)}
