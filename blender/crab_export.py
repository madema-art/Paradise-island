import bpy, os
D = r'D:\Paradise Island\assets'
os.makedirs(D, exist_ok=True)
for o in bpy.context.view_layer.objects:
    o.select_set(False)
for o in bpy.data.objects:
    if o.type in ('MESH', 'EMPTY'):
        o.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects['crab_root']
path = D + r'\crab.glb'
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_vertex_color='ACTIVE',
                          export_attributes=True, export_active_vertex_color_when_no_material=True,
                          export_animations=False, export_cameras=False, export_lights=False, export_yup=True,
                          export_apply=False, export_skins=False, export_morph=False, export_normals=True)
result = {'bytes': os.path.getsize(path)}
