# The Crystal Cave, sculpted in Blender: a cavern network hollowed behind Veil Falls, in its own local frame
# (X lateral, Y depth into the cave from the mouth, Z up; the floor is z = 0, the mouth is at y = 0).
# Outputs: assets/cave.glb (the rock shell seen from inside, with an emissive vein colour, plus stalactites and stalagmites) and
# assets/cave_data.json (crystal and gem placements, glow moss, drips, a walkable floor grid, key positions).
import sys, importlib, math, json, os
sys.path.insert(0, r'D:\Paradise Island\blender')
import cast_lib
importlib.reload(cast_lib)
from cast_lib import *
import numpy as np
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

clear_scene()
rng = np.random.default_rng(42)
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


def decimate_to(ob, target):
    n = len(ob.data.polygons)
    if n > target:
        bpy.context.view_layer.objects.active = ob
        m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = target / n
        bpy.ops.object.modifier_apply(modifier='d')


def verts(ob):
    n = len(ob.data.vertices); co = np.empty(n * 3); ob.data.vertices.foreach_get('co', co); return co.reshape(-1, 3)


def setverts(ob, co):
    ob.data.vertices.foreach_set('co', co.reshape(-1)); ob.data.update()


def nz(co, f, off=0.0):
    return np.array([noise.noise(Vector((x * f + off, y * f - off, z * f))) for x, y, z in co])


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ the void: halls and passages, unioned by a voxel remesh
S = Soup()
def tube(pts, radii, n=14, flat=(1.0, 0.85)):
    S.rod(pts, radii, n=n, flat=flat)

# mouth and throat (starts a little outside so it opens onto the ledge)
tube([(0, -1.2, 2.3), (0, 1.5, 2.4), (0, 4.5, 2.5), (0.5, 8.0, 2.8)], [2.6, 2.7, 2.8, 3.0])
# Crystal Hall
S.sphere((0.5, 15.5, 3.3), (9.2, 8.8, 6.8), lat=22, lon=34)
for c, r in (((-6.5, 13, 3.0), (4.6, 5.0, 4.2)), ((6.8, 20, 3.1), (4.6, 4.4, 4.6)), ((-5, 21, 3.0), (4.0, 3.8, 4.0)), ((7.5, 11, 2.6), (3.6, 3.4, 3.4))):
    S.sphere(c, r, lat=14, lon=22)
# the narrow way on: a winding passage
tube([(-1, 20, 2.0), (-3.5, 26, 2.1), (-4.5, 32, 2.3), (-2, 38, 2.4), (1.5, 42, 2.5)], [2.4, 2.1, 2.0, 2.3, 2.8], n=12)
# a side niche for gems
S.sphere((-10.5, 24, 1.6), (3.0, 2.8, 2.2), lat=10, lon=16)
# the heart: a tall domed chamber with a pool in the middle
S.sphere((1.5, 51, 4.2), (10.4, 9.6, 8.2), lat=22, lon=34)
for c, r in (((-7, 47, 3.0), (4.0, 4.2, 3.8)), ((9, 55, 3.4), (4.4, 4.0, 4.0)), ((-4, 58, 3.2), (4.0, 3.6, 4.0))):
    S.sphere(c, r, lat=14, lon=22)
void = S.to_object('cave_void')
remesh(void, 0.27, 2)
decimate_to(void, 46000)

# ------------------------------------------------------------------ a flat floor, the pool, and rugged walls
co = verts(void)
co[:, 2] = np.maximum(co[:, 2], 0.0)                                   # everything below the floor plane collapses onto it
POOL = np.array([1.5, 51.0]); POOL_R = 4.6
d = np.hypot(co[:, 0] - POOL[0], co[:, 1] - POOL[1])
low = co[:, 2] < 0.05
co[low, 2] -= 0.95 * np.clip(1 - (d[low] / POOL_R) ** 2, 0, 1) ** 0.8                              # the pool basin
setverts(void, co)
bpy.context.view_layer.update()
# displace along the normals for rugged walls (not on the floor)
me = void.data
nrm = np.empty(len(me.vertices) * 3); me.vertex_normals.foreach_get('vector', nrm); nrm = nrm.reshape(-1, 3)
co = verts(void)
wall = ss(0.25, 1.4, co[:, 2])
dd = (0.55 * nz(co, 0.35) + 0.26 * nz(co, 0.9, 3.0) + 0.09 * nz(co, 2.4, 7.0)) * wall
floorb = (0.05 * nz(co, 1.3, 5.0)) * (1 - wall) * (d > POOL_R + 0.2)
co2 = co + nrm * dd[:, None]
co2[:, 2] += floorb
co2[:, 2] = np.where(co[:, 2] < 0.05, np.maximum(co2[:, 2], np.where(d < POOL_R + 0.4, -0.95, -0.02)), co2[:, 2])
setverts(void, co2)
# flip so the faces look into the cave
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.reverse_faces(bm, faces=bm.faces)
bm.to_mesh(me); bm.free()
me.update()
void.name = 'cave_shell'
bpy.ops.object.shade_smooth()

# ------------------------------------------------------------------ colours: dark violet-grey rock, mineral bands, glowing veins
co = verts(void)
n = len(co)
band = 0.5 + 0.5 * np.sin(co[:, 2] * 1.7 + nz(co, 0.4) * 5.0 + co[:, 1] * 0.08)
mott = 0.5 + 0.5 * nz(co, 0.8, 11.0)
def lin(h):
    h = h.lstrip('#'); c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
A, B_, C_, F_ = lin('#2a2535'), lin('#41364d'), lin('#233a46'), lin('#3a342c')
col = A[None, :] * (1 - band[:, None]) + B_[None, :] * band[:, None]
col = col * (1 - 0.45 * ss(0.55, 0.8, mott)[:, None]) + C_[None, :] * (0.45 * ss(0.55, 0.8, mott)[:, None])
fl = (1 - ss(0.0, 0.5, co[:, 2]))[:, None]
col = col * (1 - fl * 0.8) + F_[None, :] * fl * 0.8 * (0.7 + 0.5 * mott[:, None])
# glowing veins: thin bands where a noise field crosses a value; cyan in the hall, magenta and gold deeper in
vn = np.abs(nz(co, 0.55, 21.0))
vein = 1 - ss(0.0, 0.022, vn)
vein2 = 1 - ss(0.0, 0.016, np.abs(nz(co, 0.9, 40.0)))
deep = ss(24, 46, co[:, 1])
gcol = (np.array([0.1, 0.8, 1.0])[None, :] * (1 - deep[:, None]) + np.array([1.0, 0.25, 0.9])[None, :] * deep[:, None])
glow = gcol * (vein[:, None] * 0.8 + vein2[:, None] * 0.45)
glow = np.clip(glow, 0, 1)
me = void.data
for nm in list(me.color_attributes.keys()):
    me.color_attributes.remove(me.color_attributes[nm])
ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
ca.data.foreach_set('color', np.concatenate([np.clip(col, 0, 1), np.ones((n, 1))], 1).astype(np.float32).reshape(-1))
if '_glow' in me.attributes:
    me.attributes.remove(me.attributes['_glow'])
at = me.attributes.new('_glow', 'FLOAT_VECTOR', 'POINT')
at.data.foreach_set('vector', glow.astype(np.float32).reshape(-1))
me.color_attributes.active_color = me.color_attributes['Col']

# ------------------------------------------------------------------ sampling the shell for crystals, gems, moss, stalactites
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(void, dg)
P = me.polygons
cent = np.array([p.center[:] for p in P]); nor = np.array([p.normal[:] for p in P]); area = np.array([p.area for p in P])
inward_up = nor[:, 2]


def pick(mask, k):
    w = area * mask; w = w / w.sum()
    return rng.choice(len(P), size=k, p=w)


def region(y0, y1):
    return ((cent[:, 1] >= y0) & (cent[:, 1] < y1)).astype(float)


def snap(p):
    loc, nn, idx, dist = bvh.find_nearest(Vector(p))
    return np.array(loc[:]), np.array(nn[:])


crystals = []
HUES = 8


def cluster(seed_c, seed_n, hue, big=1.0, count=12, spread=0.55):
    for i in range(count):
        c0 = i == 0
        off = rng.normal(0, spread, 3) * (0 if c0 else 1)
        p, nn = snap(seed_c + off)
        d_ = nn + rng.normal(0, 0.42, 3) + (0 if c0 else 0)
        d_ = d_ / np.linalg.norm(d_)
        L = (rng.uniform(0.9, 1.9) if c0 else np.exp(rng.normal(-0.45, 0.5))) * big
        r = max(0.04, L * rng.uniform(0.085, 0.13))
        crystals.append([round(float(p[0]), 3), round(float(p[1]), 3), round(float(p[2]), 3), round(float(d_[0]), 3), round(float(d_[1]), 3), round(float(d_[2]), 3), round(float(L), 3), round(float(r), 3), int((hue + (rng.integers(-1, 2) if rng.random() < 0.25 else 0)) % HUES)])


def seeds(y0, y1, k, ceil=0.35, wallp=0.4, floorp=0.25):
    out = []
    for _ in range(k):
        r = rng.random()
        m = region(y0, y1) * ((inward_up < -0.45) if r < ceil else ((np.abs(inward_up) < 0.55) if r < ceil + wallp else (inward_up > 0.5)))
        if m.sum() == 0:
            m = region(y0, y1)
        i = pick(m, 1)[0]
        out.append((cent[i], nor[i]))
    return out


for c, nn in seeds(3, 25, 30):
    cluster(c, nn, int(rng.integers(0, HUES)), big=rng.uniform(0.8, 1.5), count=int(rng.integers(6, 15)))
for c, nn in seeds(25, 41, 12):
    cluster(c, nn, int(rng.integers(0, HUES)), big=rng.uniform(0.6, 1.0), count=int(rng.integers(4, 9)), spread=0.4)
for c, nn in seeds(41, 62, 42, ceil=0.3, wallp=0.4, floorp=0.3):
    cluster(c, nn, int(rng.integers(0, HUES)), big=rng.uniform(0.9, 1.9), count=int(rng.integers(8, 18)))
spires = []
for k in range(7):                                    # giant crystals rising round the pool
    a = k / 7 * math.tau + rng.uniform(-0.2, 0.2); r = rng.uniform(5.6, 7.6)
    p, nn = snap(np.array([POOL[0] + math.cos(a) * r, POOL[1] + math.sin(a) * r, 0.2]))
    lean = np.array([-math.cos(a) * 0.25, -math.sin(a) * 0.25, 1.0]); lean = lean / np.linalg.norm(lean)
    L = rng.uniform(2.6, 5.2)
    crystals.append([round(float(p[0]), 3), round(float(p[1]), 3), round(float(p[2]), 3), round(float(lean[0]), 3), round(float(lean[1]), 3), round(float(lean[2]), 3), round(float(L), 3), round(float(L * 0.1), 3), int(rng.integers(0, HUES))])

gems = []
for i in pick(((np.abs(inward_up) < 0.8)).astype(float), 170):
    p, nn = snap(cent[i] + rng.normal(0, 0.3, 3))
    gems.append([round(float(p[0]), 3), round(float(p[1]), 3), round(float(p[2]), 3), round(float(rng.uniform(0.06, 0.2)), 3), int(rng.integers(0, HUES)), round(float(rng.uniform(0, 6.28)), 2)])
moss = []
for i in pick(((inward_up > 0.3) | (np.abs(inward_up) < 0.5)).astype(float), 260):
    p, nn = snap(cent[i] + rng.normal(0, 0.25, 3))
    moss.append([round(float(p[0]), 3), round(float(p[1]), 3), round(float(p[2]), 3), round(float(rng.uniform(0.08, 0.3)), 3), int(rng.integers(0, 3))])

# stalactites hang from the ceiling, stalagmites rise from the floor (separate, un-remeshed geometry)
Sp = Soup()
drips = []
cm = (inward_up < -0.7)
for i in pick(cm.astype(float), 130):
    p, nn = snap(cent[i]); L = rng.uniform(0.5, 2.6); r = rng.uniform(0.09, 0.3)
    Sp.rod([p + np.array([0, 0, 0.15]), p + np.array([0, 0, -L * 0.5]), p + np.array([0, 0, -L])], [r, r * 0.6, 0.012], n=6)
    if rng.random() < 0.3:
        drips.append([round(float(p[0]), 2), round(float(p[1]), 2), round(float(p[2] - L), 2)])
fm = (inward_up > 0.85)
for i in pick(fm.astype(float), 70):
    p, nn = snap(cent[i]); L = rng.uniform(0.4, 1.8); r = rng.uniform(0.12, 0.34)
    Sp.rod([p + np.array([0, 0, -0.1]), p + np.array([0, 0, L * 0.5]), p + np.array([0, 0, L])], [r, r * 0.55, 0.02], n=6)
spikes = Sp.to_object('cave_spikes')
bpy.context.view_layer.objects.active = spikes
bpy.ops.object.shade_smooth()
sc = verts(spikes); ns = len(sc)
sband = 0.5 + 0.5 * np.sin(sc[:, 2] * 3.0 + nz(sc, 1.0) * 3)
scol = (A[None, :] * 1.4) * (1 - sband[:, None]) + (B_[None, :] * 1.6) * sband[:, None]
sm = spikes.data
ca = sm.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
ca.data.foreach_set('color', np.concatenate([np.clip(scol, 0, 1), np.ones((ns, 1))], 1).astype(np.float32).reshape(-1))
at = sm.attributes.new('_glow', 'FLOAT_VECTOR', 'POINT')
at.data.foreach_set('vector', np.zeros(ns * 3, dtype=np.float32))
sm.color_attributes.active_color = sm.color_attributes['Col']

# ------------------------------------------------------------------ the walkable floor grid (cells with floor underfoot and headroom)
CELL = 0.5
x0, x1, y0_, y1_ = -16.0, 16.0, -2.0, 64.0
nx, ny = int((x1 - x0) / CELL) + 1, int((y1_ - y0_) / CELL) + 1
nav = np.full((ny, nx), -99.0)
for j in range(ny):
    for i in range(nx):
        x, y = x0 + i * CELL, y0_ + j * CELL
        hit = bvh.ray_cast(Vector((x, y, 2.2)), Vector((0, 0, -1)), 4.0)
        if hit[0] is None or hit[1].z < 0.6:
            continue
        up = bvh.ray_cast(Vector((x, y, 2.2)), Vector((0, 0, 1)), 14.0)
        if up[0] is None or up[1].z > -0.1:
            continue
        nav[j, i] = hit[0].z
# roosting spots for the bats: low-ish, fairly flat patches of the hall ceiling, well apart from each other
roost = []
cand = np.where((inward_up < -0.82) & (cent[:, 1] > 6) & (cent[:, 1] < 25) & (cent[:, 2] > 3.5) & (cent[:, 2] < 8.5))[0]
rng.shuffle(cand)
for i in cand:
    p_ = cent[i]
    if all(np.hypot(p_[0] - r[0], p_[1] - r[1]) > 0.75 for r in roost):
        roost.append([round(float(p_[0]), 2), round(float(p_[1]), 2), round(float(p_[2]), 2)])
    if len(roost) >= 90:
        break
data = {
    'roost': roost, 'crystals': crystals, 'gems': gems, 'moss': moss, 'drips': drips,
    'nav': {'x0': x0, 'y0': y0_, 'cell': CELL, 'nx': nx, 'ny': ny, 'h': [round(float(v), 2) for v in nav.reshape(-1)]},
    'pool': {'x': float(POOL[0]), 'y': float(POOL[1]), 'r': POOL_R, 'z': -0.25},
    'hall': {'x': 0.5, 'y': 15.5, 'z': 6.5}, 'heart': {'x': 1.5, 'y': 51.0, 'z': 6.0},
    'mouth': {'x': 0.0, 'y': 0.0, 'z': 2.4, 'w': 2.6},
}
json.dump(data, open(os.path.join(OUT, 'cave_data.json'), 'w'), separators=(',', ':'))

# ------------------------------------------------------------------ export
for o in bpy.context.view_layer.objects:
    o.select_set(False)
for o in (void, spikes):
    o.select_set(True)
bpy.context.view_layer.objects.active = void
path = os.path.join(OUT, 'cave.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_vertex_color='ACTIVE', export_attributes=True,
                          export_active_vertex_color_when_no_material=True, export_animations=False, export_cameras=False, export_lights=False,
                          export_yup=True, export_apply=False, export_skins=False, export_morph=False, export_normals=True)
result = {'tris': len(void.data.polygons), 'crystals': len(crystals), 'gems': len(gems), 'moss': len(moss), 'drips': len(drips),
          'navCells': int((nav > -90).sum()), 'roost': len(roost), 'bytes': os.path.getsize(path), 'ceilN': int((inward_up < -0.45).sum()), 'floorN': int((inward_up > 0.5).sum())}
