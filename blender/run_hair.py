import time, numpy as np
t = time.time()
exec(open(r'D:\Paradise Island\blender\run_body.py', encoding='utf-8').read())
exec(open(r'D:\Paradise Island\blender\cast_hair.py', encoding='utf-8').read())
exec(open(r'D:\Paradise Island\blender\cast_cloth.py', encoding='utf-8').read())
result['secs'] = time.time() - t
b = bpy.data.objects['body']
if 'Col' not in b.data.color_attributes:
    ca = b.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', np.tile(np.array([0.48, 0.2, 0.09, 1.0], dtype=np.float32), len(b.data.vertices)))
for o in bpy.data.objects:
    if o.type == 'MESH' and o.data.color_attributes:
        o.data.color_attributes.active_color = o.data.color_attributes[0]
        o.data.color_attributes.render_color_index = 0
exec(open(r'D:\Paradise Island\blender\cast_render.py', encoding='utf-8').read())
bpy.context.scene.display.shading.color_type = 'VERTEX'
shot('h_front', (0, -1.0, 1.66), (0, 0, 1.64), lens=70, res=(800, 800))
shot('h_three', (0.6, -0.8, 1.7), (0, 0, 1.64), lens=70, res=(800, 800))
shot('h_back', (-0.7, 1.0, 1.65), (0, 0, 1.6), lens=60, res=(800, 800))
shot('f_front', (0, -6, 0.95), (0, 0, 0.95), ortho=2.0, res=(560, 900))
shot('f_hip', (0.5, -1.4, 0.95), (0, 0, 0.85), lens=60, res=(800, 800))
shot('f_hand', (0.55, -0.45, 0.85), (0.21, 0, 0.85), lens=60, res=(800, 800))
