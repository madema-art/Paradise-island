# The greater flamingo, built procedurally in Blender (flamingo space: metres, Z up, front = -Y, feet on the ground at z = 0,
# body centre about z = 0.9). Every part is named fl_* so it can share a scene with the crab. Rigid parts hang off a tree of
# empties the game animates: hip > knee > ankle for each leg, a three-part neck, a head with an upper and a lower bill
# mandible (the lower one hinges so it can open), two wings, and eyes.
import sys, importlib, math, random
sys.path.insert(0, r'D:\Paradise Island\blender')
import cast_lib
importlib.reload(cast_lib)
from cast_lib import *
import numpy as np
from mathutils import Vector, Matrix, noise

# drop the previous flamingo only (the crab and castaway stay put)
for ob in [o for o in bpy.data.objects if o.name.startswith('fl_')]:
    bpy.data.objects.remove(ob, do_unlink=True)
for me in [m for m in bpy.data.meshes if m.name.startswith('fl_') and m.users == 0]:
    bpy.data.meshes.remove(me)


# ------------------------------------------------------------------ helpers (same as crab_build)
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


def yloft(S, prof, n=30):
    """body section loft along Y (front is -Y): prof rows (y, z, rx, rz)"""
    S.loft([((0.0, y, z), (rx, 0, 0), (0, 0, rz)) for y, z, rx, rz in prof], n=n)


# ------------------------------------------------------------------ BODY (plumage, tail)
S = Soup()
yloft(S, [
    (-0.25, 0.905, 0.075, 0.10),
    (-0.17, 0.90, 0.13, 0.15),
    (-0.07, 0.905, 0.165, 0.175),
    (0.04, 0.90, 0.18, 0.17),
    (0.15, 0.885, 0.165, 0.15),
    (0.25, 0.865, 0.11, 0.11),
    (0.33, 0.85, 0.04, 0.05),
])
S.sphere((0, 0.36, 0.86), (0.06, 0.07, 0.03), lat=8, lon=12)     # short tail coverts
body_ob = S.to_object('fl_body_mesh')
remesh(body_ob, 0.008, 2)


def body_disp(co, nr):
    return 0.0012 * nz3(co, 38.0, 1.0)                              # faint feather texture
displace(body_ob, body_disp)
decimate_to(body_ob, 3200)

# ------------------------------------------------------------------ rig of empties
root = empty('fl_root', (0, 0, 0))
body = empty('fl_body', (0, 0, 0.9), root)
attach(body_ob, body)

# ------------------------------------------------------------------ legs: hip (thigh hidden in the body) > knee > ankle (the backward-bending hock)
LEG = {}
for s, nm in ((-1, 'N'), (1, 'P')):
    H = V((s * 0.075, 0.0, 0.84))           # hip, inside the belly
    K = V((s * 0.085, 0.02, 0.46))          # knee, feathered and mostly hidden
    A = V((s * 0.09, 0.07, 0.16))           # hock, bends backward
    F = V((s * 0.09, -0.03, 0.008))         # ankle to the foot on the ground
    hip = empty(f'fl_hip{nm}', H, body)
    knee = empty(f'fl_knee{nm}', K, hip)
    ankle = empty(f'fl_ankle{nm}', A, knee)

    th = Soup()
    th.rod([H, H + (K - H) * 0.5, K], [0.034, 0.03, 0.024], n=10, flat=(1.0, 0.85))
    th.sphere(K, 0.022, lat=7, lon=10)
    m1 = th.to_object(f'fl_thigh{nm}_mesh'); remesh(m1, 0.0045, 1); decimate_to(m1, 260); attach(m1, hip)

    sh = Soup()
    sh.rod([K, K + (A - K) * 0.5, A], [0.02, 0.017, 0.013], n=9)
    sh.sphere(A, 0.016, lat=6, lon=9)
    m2 = sh.to_object(f'fl_shank{nm}_mesh'); remesh(m2, 0.0035, 1); decimate_to(m2, 220); attach(m2, knee)

    ft = Soup()
    ft.rod([A, F], [0.012, 0.0095], n=8)                                 # tarsus
    for dx, dy in ((0.0, -1.0), (-0.72, -0.7), (0.72, -0.7)):           # three forward toes
        ft.rod([F, F + V((dx * 0.1, dy * 0.1, -0.002))], [0.009, 0.006], n=6, flat=(1.0, 0.45))
    ft.rod([F, F + V((0.0, 0.05, -0.002))], [0.008, 0.005], n=6, flat=(1.0, 0.45))   # hind toe
    ft.sphere(F + V((0, -0.05, -0.002)), (0.06, 0.05, 0.004), lat=6, lon=10)           # webbing
    m3 = ft.to_object(f'fl_foot{nm}_mesh'); remesh(m3, 0.0028, 1); decimate_to(m3, 260); attach(m3, ankle)
    LEG[nm] = (hip, knee, ankle)

# ------------------------------------------------------------------ neck: three segments, each on its own empty
P = [V((0, -0.12, 0.99)), V((0, -0.22, 1.09)), V((0, -0.28, 1.2)), V((0, -0.22, 1.32)), V((0, -0.13, 1.44)), V((0, -0.12, 1.52))]
NECK = []
neck_parent = body
for i, (a, b, c, rad) in enumerate([
    (P[0], P[1], P[2], [0.07, 0.055, 0.045]),
    (P[2], P[3], P[4], [0.045, 0.04, 0.036]),
    (P[4], P[5], P[5], [0.036, 0.03, 0.03]),
]):
    e = empty(f'fl_neck{"ABC"[i]}', a, neck_parent)
    Ns = Soup()
    pts = [a, b, c] if i < 2 else [a, b]
    Ns.rod(pts, rad[:len(pts)], n=14, flat=(1.0, 0.9))
    if i < 2:
        Ns.sphere(c, rad[2] * 1.0, lat=8, lon=12)                          # joint cap, hides the seam
    mN = Ns.to_object(f'fl_neck{"ABC"[i]}_mesh'); remesh(mN, 0.0055, 1); decimate_to(mN, 700); attach(mN, e)
    NECK.append(e)
    neck_parent = e
head = empty('fl_head', P[5], neck_parent)

# ------------------------------------------------------------------ head, eyes
Hd = Soup()
Hd.sphere((0, -0.12, 1.55), (0.042, 0.052, 0.046), lat=12, lon=18)
hd_ob = Hd.to_object('fl_head_mesh'); remesh(hd_ob, 0.0028, 1); decimate_to(hd_ob, 700); attach(hd_ob, head)

Ey = Soup()
Pu = Soup()
for s in (-1, 1):
    Ey.sphere((s * 0.04, -0.148, 1.568), 0.0095, lat=8, lon=12)
    Pu.sphere((s * 0.047, -0.157, 1.57), 0.0045, lat=6, lon=8)
ey_ob = Ey.to_object('fl_eye_mesh'); attach(ey_ob, head)
pu_ob = Pu.to_object('fl_pupil_mesh'); attach(pu_ob, head)

# ------------------------------------------------------------------ bill: the upper mandible fixed to the head, the lower one hinged at the base
B0 = V((0, -0.16, 1.53))
bill = empty('fl_bill', B0, head)
billLow = empty('fl_billLow', B0, head)
Bu = Soup()
Bu.rod([B0, V((0, -0.23, 1.52)), V((0, -0.31, 1.5)), V((0, -0.36, 1.46)), V((0, -0.37, 1.41)), V((0, -0.36, 1.38))],
       [0.024, 0.022, 0.019, 0.015, 0.011, 0.006], n=10, flat=(0.9, 1.0))
bu_ob = Bu.to_object('fl_bill_mesh'); remesh(bu_ob, 0.0025, 1); decimate_to(bu_ob, 420); attach(bu_ob, bill)

Bl = Soup()
Bl.rod([V((0, -0.16, 1.515)), V((0, -0.23, 1.5)), V((0, -0.3, 1.48)), V((0, -0.34, 1.45)), V((0, -0.345, 1.42))],
       [0.02, 0.017, 0.014, 0.011, 0.006], n=10, flat=(0.9, 1.0))
bl_ob = Bl.to_object('fl_billLow_mesh'); remesh(bl_ob, 0.0025, 1); decimate_to(bl_ob, 380); attach(bl_ob, billLow)

# ------------------------------------------------------------------ wings: a real flight wing, about 0.6 m from the shoulder to the tip,
# a blade whose chord (fore-aft) is broad at the shoulder and tapers to the primaries. Pink coverts inboard, black flight feathers outboard.
def wing_blade(S, s, n=14):
    rings = []
    for i in range(n + 1):
        t = i / n
        cx = s * (0.10 + 0.62 * t)                         # out along the span
        cy = 0.03 + 0.22 * t * t                           # the wing sweeps back toward the tip
        cz = 1.0 - 0.05 * t                                # and drops a little
        chord = 0.075 * (1 - 0.7 * t) + 0.014              # half the fore-aft width
        thick = 0.011 * (1 - 0.6 * t) + 0.003              # half the thickness
        rings.append(((cx, cy, cz), (0, chord, 0), (0, 0, thick)))
    S.loft(rings, n=12)

WING = {}
for s, nm in ((-1, 'N'), (1, 'P')):
    W = V((s * 0.12, 0.0, 1.0))
    wing = empty(f'fl_wing{nm}', W, body)
    Wg = Soup()
    wing_blade(Wg, s)
    wm = Wg.to_object(f'fl_wing{nm}_mesh')
    for p in wm.data.polygons:
        p.use_smooth = True
    attach(wm, wing)
    WING[nm] = wing

result = {'ok': True, 'parts': sorted(o.name for o in bpy.data.objects if o.name.startswith('fl_') and o.type == 'MESH'),
          'empties': sorted(o.name for o in bpy.data.objects if o.name.startswith('fl_') and o.type == 'EMPTY')}
