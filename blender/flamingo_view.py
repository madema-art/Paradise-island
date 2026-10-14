# Quick Workbench renders of the flamingo, with the crab and castaway hidden from render. Run after flamingo_build.py and flamingo_color.py.
import bpy
from mathutils import Vector
exec(open(r'D:\Paradise Island\blender\cast_render.py', encoding='utf-8').read())
OUT = r'C:\Users\matta\AppData\Local\Temp\claude\D--Paradise-Island\922a57b0-3ba3-43c9-a2dc-b0e08c854092\scratchpad'

hidden = []
for ob in bpy.data.objects:
    if not ob.name.startswith('fl_') and ob.type == 'MESH' and not ob.hide_render:
        ob.hide_render = True
        hidden.append(ob)

sh = bpy.context.scene.display.shading
sh.color_type = 'VERTEX'


def use_variant(k):
    """copy one plumage into the active 'Col' layer for the preview (the saved file keeps the classic one in 'Col')"""
    src = {'classic': 'Col', 'pale': '_pale', 'vivid': '_vivid', 'juv': '_juv'}[k]
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or not ob.name.startswith('fl_'):
            continue
        me = ob.data
        if k == 'classic':
            continue
        N = len(me.vertices)
        vec = np.empty(N * 3); me.attributes[src].data.foreach_get('vector', vec); vec = vec.reshape(-1, 3)
        rgba = np.concatenate([vec, np.ones((N, 1))], 1).reshape(-1)
        me.color_attributes['Col'].data.foreach_set('color', rgba.astype(np.float32))
        me.update()


import numpy as np
shot('f_front', (0, -2.6, 0.85), (0, 0, 0.85), ortho=2.0, res=(700, 900))
shot('f_side', (2.6, 0, 0.85), (0, 0, 0.85), ortho=2.0, res=(700, 900))
shot('f_three', (1.6, -2.0, 1.1), (0, 0, 0.85), lens=50, res=(900, 800))
shot('f_head', (0.5, -0.9, 1.5), (0, -0.15, 1.45), lens=70, res=(800, 800))
for k in ('pale', 'vivid', 'juv'):
    use_variant(k)
    shot('f_three_' + k, (1.6, -2.0, 1.1), (0, 0, 0.85), lens=50, res=(900, 800))
# put the classic plumage back into 'Col' by re-running the colour pass
exec(open(r'D:\Paradise Island\blender\flamingo_color.py', encoding='utf-8').read())
for ob in hidden:
    ob.hide_render = False
result = {'shots': 7}
