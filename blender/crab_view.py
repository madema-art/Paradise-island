exec(open(r'D:\Paradise Island\blender\cast_render.py', encoding='utf-8').read())
import bpy
sh = bpy.context.scene.display.shading
sh.color_type = 'OBJECT'
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.color = (0.8, 0.28, 0.15, 1)
        if o.name == 'shell_mesh':
            o.color = (0.9, 0.82, 0.62, 1)
shot('c_top', (0.0, -0.01, 2.6), (0, -0.0, 0), ortho=1.9, res=(800, 700))
shot('c_front', (0.0, -2.4, 0.15), (0, 0, 0.0), ortho=1.7, res=(800, 600))
shot('c_three', (1.3, -1.6, 0.9), (0, -0.1, -0.02), lens=50, res=(900, 700))
