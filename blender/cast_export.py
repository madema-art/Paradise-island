import bpy, os
D = r'D:\Paradise Island\assets'
os.makedirs(D, exist_ok=True)
COMMON = dict(export_format='GLB', use_selection=True, export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True,
              export_animations=False, export_cameras=False, export_lights=False, export_yup=True, export_apply=False, export_morph=False)


def export(names, path, skins, normals):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for n in names:
        bpy.data.objects[n].select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects[names[0]]
    bpy.ops.export_scene.gltf(filepath=path, export_skins=skins, export_normals=normals, export_influence_nb=4, **COMMON)
    return os.path.getsize(path)


body_names = ['rig', 'body', 'cloth', 'fray', 'knot', 'rope', 'flap']
head_names = [n for n in ('hair', 'haircap', 'beard', 'brows', 'eye', 'eye.001') if n in bpy.data.objects]
r1 = export(body_names, D + r'\castaway.glb', True, True)
r2 = export(head_names, D + r'\castaway_head.glb', False, False)
result = {'body_bytes': r1, 'head_bytes': r2}
