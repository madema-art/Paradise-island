# Shared helpers for the island rat, barn owl and Pacific boa (Blender 5.x, run headless:  blender --background --factory-startup --python <script>).
# Each model is built the same way as the tern and the boar: closed primitive shells are unioned by a voxel remesh into smooth organic parts,
# hung on a tree of named empties that the game animates, painted with baked vertex colours and exported as one GLB (Z up in Blender, facing -Y,
# which the exporter turns into the game's Y up, facing +Z).
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix, Euler, noise
sys.path.insert(0, r'D:\Paradise Island\blender')
from cast_lib import Soup, clear_scene, V, TAU

OUT = r'C:\Users\matta\AppData\Local\Temp\claude\D--Paradise-Island\d8111730-4643-44bb-9cc9-5a28e71a838a\scratchpad'
ASSETS = r'D:\Paradise Island\assets'


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
    me.vertices.foreach_set('co', (co + nr * d[:, None]).reshape(-1)); me.update()


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


def part(soup, name, parent, voxel=None, smooth=1, target=None, adapt=0.0):
    """turn a soup into a smooth object hung on a joint"""
    ob = soup.to_object(name)
    if voxel:
        remesh(ob, voxel, smooth, adapt)
    else:
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.shade_smooth()
    if target:
        decimate_to(ob, target)
    attach(ob, parent)
    return ob


# ------------------------------------------------------------------ colour
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
    t = np.asarray(t)
    return a * (1 - t[:, None]) + b * t[:, None]


def nz(co, f, off=0.0, oct=1):
    """per-vertex Blender noise in 0..1"""
    return np.array([noise.noise(V((a * f + off, b * f - off, c * f + off * 0.5))) for a, b, c in co]) * 0.5 + 0.5


def paint(prefix, fn):
    """fn(name, co, ob) -> (N,3) linear colours; stored as the 'Col' layer"""
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or not ob.name.startswith(prefix):
            continue
        me = ob.data
        N = len(me.vertices)
        co = np.empty(N * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        col = np.clip(fn(ob.name, co, ob), 0, 1)
        col = np.concatenate([col, np.ones((N, 1))], 1).astype(np.float32)
        for nm in list(me.color_attributes.keys()):
            me.color_attributes.remove(me.color_attributes[nm])
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        ca.data.foreach_set('color', col.reshape(-1))
        me.color_attributes.active_color = me.color_attributes['Col']


# ------------------------------------------------------------------ export and preview
def export(prefix, root_name, filename):
    os.makedirs(ASSETS, exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in bpy.data.objects:
        if o.name.startswith(prefix) and o.type in ('MESH', 'EMPTY'):
            o.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects[root_name]
    path = os.path.join(ASSETS, filename)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_vertex_color='ACTIVE',
                              export_attributes=True, export_active_vertex_color_when_no_material=True,
                              export_animations=False, export_cameras=False, export_lights=False, export_yup=True,
                              export_apply=False, export_skins=False, export_morph=False, export_normals=True)
    return os.path.getsize(path)


def setup_render(res):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = res
    sh = sc.display.shading
    sh.light = 'STUDIO'; sh.color_type = 'VERTEX'; sh.show_cavity = False; sh.show_shadows = False
    sh.background_type = 'VIEWPORT'
    if sc.world is None:
        sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = False
    sc.world.color = (0.30, 0.34, 0.40)
    try:
        sc.view_settings.view_transform = 'Standard'
    except Exception:
        pass
    if 'rcam' not in bpy.data.objects:
        co = bpy.data.objects.new('rcam', bpy.data.cameras.new('rcam'))
        sc.collection.objects.link(co)
    sc.camera = bpy.data.objects['rcam']
    return sc.camera


def shot(name, loc, target, ortho=None, lens=70, res=(700, 600)):
    cam = setup_render(res)
    cam.location = Vector(loc)
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if ortho:
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else:
        cam.data.type = 'PERSP'; cam.data.lens = lens
    cam.data.clip_end = 100
    p = os.path.join(OUT, name + '.png')
    bpy.context.scene.render.filepath = p
    bpy.ops.render.render(write_still=True)
    return p


def report(prefix):
    meshes = [o for o in bpy.data.objects if o.name.startswith(prefix) and o.type == 'MESH']
    return {'meshes': len(meshes), 'tris': sum(len(o.data.polygons) for o in meshes)}
