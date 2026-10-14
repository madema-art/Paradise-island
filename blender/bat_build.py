# The island's fruit bat (a flying fox), built procedurally in Blender (metres; Z up, front = -Y, wings along +-X, belly toward -Z).
# One mesh with vertex colours, plus a custom attribute `_fold` holding every vertex's position in the roosting pose: wings wrapped
# round the body like a cloak. The game blends flight and roost poses in the vertex shader and beats the wings from the span (|x|).
# Flying-fox facts used: wingspan about 1.2 m for a body the size of a small cat, wingbeat near 3 Hz, a deep downstroke with the wing fully
# spread, an upstroke with the wrist flexed and the span shortened; roosting upside down, hooked on by the feet, wrapped in the wings.
import sys, importlib, math, os
sys.path.insert(0, r'D:\Paradise Island\blender')
import cast_lib
importlib.reload(cast_lib)
from cast_lib import *
import numpy as np
from mathutils import Vector, noise

clear_scene()
OUT = r'D:\Paradise Island\assets'


def remesh(ob, voxel, smooth=2):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.data.objects:
        o.select_set(o == ob)
    ob.data.remesh_voxel_size = voxel
    bpy.ops.object.voxel_remesh()
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(ob.data); bm.free()
    bpy.ops.object.shade_smooth()


def decimate_to(ob, target):
    n = len(ob.data.polygons)
    if n > target:
        bpy.context.view_layer.objects.active = ob
        m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = target / n
        bpy.ops.object.modifier_apply(modifier='d')


def lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def verts(ob):
    n = len(ob.data.vertices); co = np.empty(n * 3); ob.data.vertices.foreach_get('co', co); return co.reshape(-1, 3)


def paint(ob, fn, wing):
    co = verts(ob)
    col = np.clip(fn(co), 0, 1)
    me = ob.data
    for nm in list(me.color_attributes.keys()):
        me.color_attributes.remove(me.color_attributes[nm])
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', np.concatenate([col, np.ones((len(co), 1))], 1).astype(np.float32).reshape(-1))
    me.color_attributes.active_color = me.color_attributes['Col']
    if '_wing' in me.attributes:
        me.attributes.remove(me.attributes['_wing'])
    a = me.attributes.new('_wing', 'FLOAT', 'POINT')
    a.data.foreach_set('value', np.full(len(co), wing, dtype=np.float32))


def nzv(co, f, off=0.0):
    return np.array([noise.noise(Vector((x * f + off, y * f - off, z * f))) for x, y, z in co]) * 0.5 + 0.5


FUR_D, FUR_L, MANTLE, FACE, MUZZLE, EAR, EARIN, NOSE, EYE = lin('#2a1d16'), lin('#4a3224'), lin('#b88a40'), lin('#4a372c'), lin('#7a604c'), lin('#2a1d18'), lin('#8a5a4a'), lin('#17100d'), lin('#05040a')
MEM_A, MEM_B, BONE = lin('#3a2d28'), lin('#6a4e40'), lin('#1f1814')

# ------------------------------------------------------------------ the furry body and head (one remeshed volume)
S = Soup()
S.sphere((0, 0.03, -0.002), (0.074, 0.135, 0.072), lat=14, lon=22)          # torso
S.sphere((0, -0.075, 0.004), (0.088, 0.09, 0.08), lat=12, lon=20)           # chest and shoulders
S.sphere((0, 0.125, -0.004), (0.058, 0.07, 0.056), lat=10, lon=16)          # hips
S.sphere((0, -0.2, 0.014), (0.053, 0.058, 0.052), lat=12, lon=18)           # skull
S.sphere((0, -0.262, -0.008), (0.03, 0.046, 0.027), lat=10, lon=14)         # muzzle
S.sphere((0, -0.304, -0.006), (0.017, 0.016, 0.014), lat=7, lon=10)         # nose pad
S.sphere((0, -0.168, -0.018), (0.04, 0.04, 0.03), lat=8, lon=12)            # throat
for s in (-1, 1):
    S.rod([(s * 0.03, -0.195, 0.045), (s * 0.052, -0.19, 0.098), (s * 0.062, -0.183, 0.142)], [0.022, 0.017, 0.003], n=7, flat=(1.0, 0.4))   # ears
    S.rod([(s * 0.032, 0.17, -0.02), (s * 0.04, 0.2, -0.05), (s * 0.046, 0.232, -0.058)], [0.016, 0.011, 0.008], n=6)                          # legs
body = S.to_object('bat_body')
remesh(body, 0.0042, 2)
decimate_to(body, 2600)


def body_col(co):
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    n1 = nzv(co, 90.0)
    fur = FUR_D[None, :] * (1 - n1[:, None]) + FUR_L[None, :] * n1[:, None]
    mant = ss(-0.04, -0.14, y) * ss(-0.215, -0.12, y) * ss(-0.02, 0.04, z)            # a golden mantle over the nape and shoulders
    mant = np.maximum(mant, 0.6 * ss(-0.02, -0.1, y) * ss(0.0, 0.05, z) * (1 - ss(0.0, 0.12, y + 0.2) * 0))
    col = fur * (1 - 0.65 * mant[:, None]) + MANTLE[None, :] * (0.65 * mant[:, None]) * (0.75 + 0.5 * n1[:, None])
    head = ss(-0.17, -0.22, y)
    col = col * (1 - head[:, None] * 0.7) + FACE[None, :] * head[:, None] * 0.7
    muz = ss(-0.245, -0.285, y)
    col = col * (1 - muz[:, None] * 0.8) + MUZZLE[None, :] * muz[:, None] * 0.8
    nose = ss(-0.292, -0.31, y)
    col = col * (1 - nose[:, None]) + NOSE[None, :] * nose[:, None]
    ear = ss(0.075, 0.1, z) * ss(0.02, 0.035, np.abs(x)) * (1 - ss(-0.2, -0.17, y) * 0)
    ear_in = ear * (1 - ss(0.0, 0.02, np.abs(y + 0.188) - 0.0) * 0) * 0.5
    col = col * (1 - ear[:, None]) + EAR[None, :] * ear[:, None]
    col = col * (1 - ear_in[:, None] * (y[:, None] < -0.17)) + EARIN[None, :] * ear_in[:, None] * (y[:, None] < -0.17)
    leg = ss(0.145, 0.17, y) * ss(0.0, 0.2, -z - 0.012) + ss(0.18, 0.22, y)
    col = col * (1 - np.clip(leg, 0, 1)[:, None] * 0.7) + FUR_D[None, :] * 0.8 * np.clip(leg, 0, 1)[:, None] * 0.7
    return col


paint(body, body_col, 0.0)

# eyes: big dark glossy spheres, set into the skull
Eo = Soup()
for s in (-1, 1):
    Eo.sphere((s * 0.037, -0.226, 0.026), (0.013, 0.014, 0.013), lat=8, lon=12)
eyes = Eo.to_object('bat_eyes')
bpy.context.view_layer.objects.active = eyes
bpy.ops.object.shade_smooth()
paint(eyes, lambda co: np.tile(EYE, (len(co), 1)), 0.0)

# ------------------------------------------------------------------ one wing: arm, four fingers, membrane (mirrored for the other side)
SH, EL, WR = Vector((0.06, -0.075, 0.03)), Vector((0.25, -0.15, 0.05)), Vector((0.40, -0.205, 0.045))
T2, T3, T4, T5 = Vector((0.62, -0.30, 0.025)), Vector((0.60, -0.04, 0.02)), Vector((0.53, 0.17, 0.015)), Vector((0.42, 0.29, 0.012))
HIP = Vector((0.075, 0.19, 0.0))


def mid_in(a, b, k=0.13):
    return (a + b) * 0.5 * (1 - k) + WR * k


def build_wing(side):
    mx = Vector((side, 1, 1))
    pts = {k: v * mx for k, v in dict(SH=SH, EL=EL, WR=WR, T2=T2, T3=T3, T4=T4, T5=T5, HIP=HIP).items()}
    wr = pts['WR']
    tips = [pts['T2'], mid_in(pts['T2'], pts['T3']) , pts['T3'], mid_in(pts['T3'], pts['T4']), pts['T4'], mid_in(pts['T4'], pts['T5']), pts['T5']]
    tips = [t if isinstance(t, Vector) else Vector(t) for t in tips]
    # scallops: the membrane between two fingers curves in toward the wrist
    tips[1] = (pts['T2'] + pts['T3']) * 0.5 * 0.86 + wr * 0.14
    tips[3] = (pts['T3'] + pts['T4']) * 0.5 * 0.86 + wr * 0.14
    tips[5] = (pts['T4'] + pts['T5']) * 0.5 * 0.86 + wr * 0.14
    me = bpy.data.meshes.new('wing_mem')
    V = [pts['SH'], pts['EL'], wr, pts['T5'], pts['HIP']] + tips
    idx = {i: i for i in range(len(V))}
    F = [(0, 1, 4), (1, 2, 3), (1, 3, 4)]
    for i in range(len(tips) - 1):
        F.append((2, 5 + i, 5 + i + 1))
    F.append((2, 3, 5 + len(tips) - 1))                          # keeps the fan closed against digit 5
    me.from_pydata([tuple(v) for v in V], [], F)
    me.update()
    ob = bpy.data.objects.new('wing_mem', me); bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=7, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    # a gentle camber and a slight droop at the trailing edge
    co = verts(ob)
    ax = np.abs(co[:, 0])
    co[:, 2] += 0.022 * np.sin(np.clip((ax - 0.06) / 0.55, 0, 1) * math.pi) * ss(-0.3, 0.1, -co[:, 1] * 0 - np.abs(co[:, 1] - 0.0) * 0)
    co[:, 2] -= 0.02 * ss(0.05, 0.3, co[:, 1])
    ob.data.vertices.foreach_set('co', co.reshape(-1)); ob.data.update()
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth()

    def col(c):
        x, y = np.abs(c[:, 0]), c[:, 1]
        t = ss(0.08, 0.6, x)
        base = MEM_A[None, :] * (1 - t[:, None] * 0.5) + MEM_B[None, :] * (t[:, None] * 0.5)
        edge = ss(0.1, 0.3, y) * 0.35
        return base * (1 - edge[:, None]) + MEM_B[None, :] * edge[:, None] * 1.3 + 0.06 * nzv(c, 20.0)[:, None]
    paint(ob, col, 1.0)
    # bones
    Bn = Soup()
    Bn.rod([pts['SH'], pts['EL'], wr], [0.016, 0.012, 0.009], n=6)
    for t in (pts['T2'], pts['T3'], pts['T4'], pts['T5']):
        Bn.rod([wr, wr + (t - wr) * 0.5, t], [0.0075, 0.0055, 0.0025], n=5)
    Bn.rod([wr, wr + Vector((side * 0.02, -0.04, 0.012)), wr + Vector((side * 0.03, -0.065, 0.008))], [0.009, 0.006, 0.0015], n=5)    # the thumb claw
    bo = Bn.to_object('wing_bones')
    bpy.context.view_layer.objects.active = bo
    bpy.ops.object.shade_smooth()
    paint(bo, lambda c: np.tile(BONE, (len(c), 1)), 1.0)
    return ob, bo


parts = [body, eyes]
for side in (1, -1):
    ob, bo = build_wing(side)
    parts += [ob, bo]

# ------------------------------------------------------------------ join, then bake the folded (roosting) pose into `_fold`
for o in bpy.data.objects:
    o.select_set(o in parts)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
bat = bpy.context.view_layer.objects.active
bat.name = 'fruitbat'
me = bat.data
co = verts(bat)
wing = np.empty(len(co)); me.attributes['_wing'].data.foreach_get('value', wing)
fold = co.copy()
w = wing > 0.5
x, y, z = co[w, 0], co[w, 1], co[w, 2]
side = np.where(x >= 0, 1.0, -1.0)
s = np.clip((np.abs(x) - 0.06) / 0.58, 0, 1)
rf = 0.082 + 0.014 * s + np.where(side > 0, 0.0, 0.012)                               # layered round the chest, one wing over the other
th = np.where(side > 0, -s * math.pi * 0.98 + 0.12, math.pi + s * math.pi * 0.98 - 0.12)
yy = 0.01 + y * 0.52 - 0.02
zz_off = (z - 0.03) * 0.5
fold[w, 0] = rf * np.cos(th) + 0.0
fold[w, 2] = rf * np.sin(th) + zz_off * 0.3 + 0.0
fold[w, 1] = yy
if '_fold' in me.attributes:
    me.attributes.remove(me.attributes['_fold'])
fa = me.attributes.new('_fold', 'FLOAT_VECTOR', 'POINT')
fa.data.foreach_set('vector', fold.astype(np.float32).reshape(-1))
bpy.ops.object.shade_smooth()

# ------------------------------------------------------------------ export
for o in bpy.context.view_layer.objects:
    o.select_set(False)
bat.select_set(True)
bpy.context.view_layer.objects.active = bat
path = os.path.join(OUT, 'fruitbat.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_vertex_color='ACTIVE', export_attributes=True,
                          export_active_vertex_color_when_no_material=True, export_animations=False, export_cameras=False, export_lights=False,
                          export_yup=True, export_apply=False, export_skins=False, export_morph=False, export_normals=True)
try:
    bpy.ops.wm.save_as_mainfile(filepath=r'D:\Paradise Island\blender\fruitbat.blend')
except Exception:
    pass
result = {'tris': len(me.polygons), 'verts': len(co), 'bytes': os.path.getsize(path), 'wingVerts': int(w.sum())}
print('BAT', result)
