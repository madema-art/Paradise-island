import bpy, os
exec(open(r'D:\Paradise Island\blender\cast_render.py', encoding='utf-8').read())
sh = bpy.context.scene.display.shading
sh.color_type = 'VERTEX'
bat = bpy.data.objects['fruitbat']
shot('bat_top', (0.0, 0.0, 2.2), (0, 0.0, 0), ortho=1.6, res=(900, 600))
shot('bat_front', (0.9, -1.2, 0.5), (0, -0.05, 0.0), lens=60, res=(900, 700))
# folded pose: swap positions with _fold
me = bat.data
import numpy as np
n = len(me.vertices)
f = np.empty(n * 3); me.attributes['_fold'].data.foreach_get('vector', f)
me.vertices.foreach_set('co', f); me.update()
shot('bat_fold', (0.6, -0.9, -0.5), (0, -0.0, -0.02), lens=60, res=(900, 700))
shot('bat_fold2', (0.0, -1.2, 0.0), (0, 0.0, 0.0), lens=60, res=(900, 700))
