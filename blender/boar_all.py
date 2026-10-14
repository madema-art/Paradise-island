# Build, colour and export the boar in one go (run inside Blender).
import bpy, os
B = r'D:\Paradise Island\blender'
for f in ('boar_build.py', 'boar_color.py', 'boar_export.py'):
    exec(open(os.path.join(B, f), encoding='utf-8').read())
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(B, 'boar.blend'))
result['tris'] = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
