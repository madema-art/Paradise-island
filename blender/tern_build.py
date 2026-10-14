# The white tern (fairy tern), built procedurally in Blender (tern space: metres, Z up, front = -Y, body centre at the origin,
# the feet on the perch about z = -0.1). Every part is named tn_* so it can share a scene with the other models.
# Rigid parts hang off a tree of empties the game animates: wings (shoulder > hand, flapped about the forward axis like the other birds),
# head, tail, and two legs (hidden in flight, visible when perched).
import sys, importlib, math, random
sys.path.insert(0, r'D:\Paradise Island\blender')
import cast_lib
importlib.reload(cast_lib)
from cast_lib import *
import numpy as np
from mathutils import Vector, Matrix, noise

# drop the previous tern only
for ob in [o for o in bpy.data.objects if o.name.startswith('tn_')]:
    bpy.data.objects.remove(ob, do_unlink=True)
for me in [m for m in bpy.data.meshes if m.name.startswith('tn_') and m.users == 0]:
    bpy.data.meshes.remove(me)


# ------------------------------------------------------------------ helpers (as in flamingo_build)
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


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.02
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


def yloft(S, prof, n=24):
    """body section loft along Y (front is -Y): prof rows (y, z, rx, rz)"""
    S.loft([((0.0, y, z), (rx, 0, 0), (0, 0, rz)) for y, z, rx, rz in prof], n=n)


# ------------------------------------------------------------------ BODY: slim and streamlined
S = Soup()
yloft(S, [
    (-0.15, 0.005, 0.022, 0.024),
    (-0.10, 0.008, 0.034, 0.034),
    (-0.04, 0.004, 0.046, 0.044),
    (0.03, 0.0, 0.05, 0.047),
    (0.10, -0.004, 0.044, 0.04),
    (0.15, -0.01, 0.03, 0.028),
    (0.19, -0.014, 0.012, 0.012),
])
body_ob = S.to_object('tn_body_mesh')
remesh(body_ob, 0.0032, 2)
decimate_to(body_ob, 2600)

# ------------------------------------------------------------------ rig
root = empty('tn_root', (0, 0, 0))
body = empty('tn_body', (0, 0, 0), root)
attach(body_ob, body)

# head: a rounded cap on a short neck, with a small black eye each side and a long straight bill
HEAD = V((0, -0.13, 0.05))
hd = empty('tn_head', HEAD, body)
Hd = Soup()
Hd.sphere((0, -0.13, 0.05), (0.033, 0.039, 0.035), lat=12, lon=16)
hd_ob = Hd.to_object('tn_head_mesh'); remesh(hd_ob, 0.0022, 1); decimate_to(hd_ob, 600); attach(hd_ob, hd)

Ey = Soup()
for s in (-1, 1):
    Ey.sphere((s * 0.031, -0.158, 0.058), 0.0085, lat=8, lon=10)
ey_ob = Ey.to_object('tn_eye_mesh'); attach(ey_ob, hd)

Bl = Soup()
Bl.rod([V((0, -0.16, 0.054)), V((0, -0.205, 0.05)), V((0, -0.245, 0.046)), V((0, -0.262, 0.044))],
       [0.011, 0.0095, 0.0075, 0.002], n=8, flat=(0.9, 1.0))
bl_ob = Bl.to_object('tn_bill_mesh'); remesh(bl_ob, 0.0015, 1); decimate_to(bl_ob, 260); attach(bl_ob, hd)

# tail: a forked tail, the outer streamers longer than the centre
tail = empty('tn_tail', (0, 0.12, 0.0), body)
Tl = Soup()
Tl.sphere((0, 0.17, 0.0), (0.028, 0.05, 0.016), lat=8, lon=10)
for s in (-1, 1):
    Tl.rod([V((s * 0.01, 0.11, 0.0)), V((s * 0.03, 0.2, -0.003)), V((s * 0.06, 0.27, -0.008)), V((s * 0.075, 0.31, -0.01))],
           [0.018, 0.013, 0.009, 0.004], n=8, flat=(1.0, 0.35))
tl_ob = Tl.to_object('tn_tail_mesh'); remesh(tl_ob, 0.0018, 1); decimate_to(tl_ob, 500); attach(tl_ob, tail)

# legs: short and dark, the feet on the perch at z = -0.1
LEG = []
for s, nm in ((-1, 'N'), (1, 'P')):
    hip = empty(f'tn_leg{nm}', V((s * 0.03, 0.0, -0.03)), body)
    Lg = Soup()
    Lg.rod([V((s * 0.03, 0.0, -0.03)), V((s * 0.03, 0.0, -0.1))], [0.0055, 0.0045], n=8, flat=(1.0, 1.0))
    for dy, dx in ((-0.035, 0.0), (-0.012, -0.024), (-0.012, 0.024)):
        Lg.rod([V((s * 0.03, 0.0, -0.1)), V((s * 0.03 + dx, dy, -0.104))], [0.0035, 0.0025], n=6, flat=(1.0, 0.5))
    lm = Lg.to_object(f'tn_leg{nm}_mesh'); remesh(lm, 0.0012, 1); decimate_to(lm, 160); attach(lm, hip)
    LEG.append(hip)

# wings: a shoulder empty on the back (flapped), a hand empty at the bend (the primaries fold on it)
WING = {}
for s, nm in ((-1, 'N'), (1, 'P')):
    shoulder = empty(f'tn_wing{nm}', V((s * 0.035, 0.0, 0.035)), body)
    hand = empty(f'tn_hand{nm}', V((s * 0.19, 0.01, 0.03)), shoulder)
    Am = Soup()
    Am.rod([V((s * 0.03, 0.0, 0.035)), V((s * 0.11, 0.005, 0.034)), V((s * 0.19, 0.01, 0.03))], [0.026, 0.023, 0.02], n=10, flat=(1.0, 0.45))
    am = Am.to_object(f'tn_arm{nm}_mesh'); remesh(am, 0.0022, 1); decimate_to(am, 360); attach(am, shoulder)
    Hn = Soup()
    Hn.rod([V((s * 0.18, -0.01, 0.03)), V((s * 0.3, 0.05, 0.026)), V((s * 0.42, 0.13, 0.02)), V((s * 0.5, 0.2, 0.016))],
           [0.02, 0.014, 0.009, 0.003], n=8, flat=(1.0, 0.3))
    Hn.rod([V((s * 0.2, 0.0, 0.028)), V((s * 0.33, 0.08, 0.024)), V((s * 0.44, 0.15, 0.018))], [0.012, 0.009, 0.004], n=6, flat=(1.0, 0.3))
    hm = Hn.to_object(f'tn_hand{nm}_mesh'); remesh(hm, 0.0018, 1); decimate_to(hm, 520); attach(hm, hand)
    WING[nm] = (shoulder, hand)

result = {'ok': True, 'parts': sorted(o.name for o in bpy.data.objects if o.name.startswith('tn_') and o.type == 'MESH'),
          'empties': sorted(o.name for o in bpy.data.objects if o.name.startswith('tn_') and o.type == 'EMPTY')}
