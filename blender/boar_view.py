import bpy
import numpy as np
exec(open(r'D:\Paradise Island\blender\cast_render.py', encoding='utf-8').read())
sh = bpy.context.scene.display.shading
sh.color_type = 'VERTEX'


def show(pal):
    # preview only: copies a palette into the active colour layer (rebuild + repaint before exporting)
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        me = o.data
        att = me.attributes.get('_' + pal)
        if att is None:
            continue
        n = len(me.vertices)
        v = np.empty(n * 3); att.data.foreach_get('vector', v)
        rgba = np.concatenate([v.reshape(-1, 3), np.ones((n, 1))], 1).astype(np.float32)
        me.color_attributes['Col'].data.foreach_set('color', rgba.reshape(-1))


PAL = globals().get('PAL_SHOW', 'wild')
if PAL != 'wild':
    show(PAL)
shot('b_side_' + PAL, (3.2, 0.0, 0.6), (0, 0, 0.5), ortho=2.4, res=(900, 600))
shot('b_three_' + PAL, (-2.0, -2.6, 1.5), (0, -0.1, 0.5), lens=50, res=(900, 700))
shot('b_head_' + PAL, (-0.55, -1.9, 1.05), (0, -0.85, 0.78), lens=70, res=(800, 700))
