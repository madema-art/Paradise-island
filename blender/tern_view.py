# Quick Workbench renders of the tern: the plumages, and the poses the game uses (flapping, hovering, perched). Run after tern_build.py and tern_color.py.
import bpy, math, numpy as np
from mathutils import Vector
exec(open(r'D:\Paradise Island\blender\cast_render.py', encoding='utf-8').read())
OUT = r'C:\Users\matta\AppData\Local\Temp\claude\D--Paradise-Island\922a57b0-3ba3-43c9-a2dc-b0e08c854092\scratchpad'
E = bpy.data.objects

hidden = []
for ob in bpy.data.objects:
    if not ob.name.startswith('tn_') and ob.type == 'MESH' and not ob.hide_render:
        ob.hide_render = True; hidden.append(ob)
bpy.context.scene.display.shading.color_type = 'VERTEX'


def use_plumage(k):
    """copy a plumage into the active 'Col' layer for the preview; the saved file keeps the adult colours in 'Col'"""
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or not ob.name.startswith('tn_'):
            continue
        me = ob.data
        if k == 'adult':
            continue
        N = len(me.vertices)
        vec = np.empty(N * 3); me.attributes['_juv'].data.foreach_get('vector', vec); vec = vec.reshape(-1, 3)
        me.color_attributes['Col'].data.foreach_set('color', np.concatenate([vec, np.ones((N, 1))], 1).reshape(-1).astype(np.float32))
        me.update()


def rest_pose():
    for nm in ['tn_head', 'tn_tail', 'tn_wingN', 'tn_wingP', 'tn_handN', 'tn_handP', 'tn_legN', 'tn_legP', 'tn_body']:
        E[nm].rotation_mode = 'XYZ'; E[nm].rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()


def wings(up):
    """up > 0 raises both wings (the top of the beat); negative drops them (the bottom). The game flaps about the glTF Z axis,
    which is -Y in Blender, so the Blender rotation is about Y with the sign flipped."""
    for s, nm in ((-1, 'N'), (1, 'P')):
        E['tn_wing' + nm].rotation_euler = (0, -s * up, 0)
        E['tn_hand' + nm].rotation_euler = (0, -s * up * 0.4, 0)
    bpy.context.view_layer.update()


out = {}
rest_pose()
out['side'] = shot('t_side', (1.1, 0, 0.0), (0, 0, 0.0), ortho=0.75, res=(700, 600))
out['front'] = shot('t_front', (0, -1.0, 0.0), (0, 0, 0.0), ortho=0.75, res=(600, 600))
out['three'] = shot('t_three', (0.7, -0.9, 0.35), (0, 0, 0.0), lens=50, res=(800, 700))
out['head'] = shot('t_head', (0.25, -0.35, 0.18), (0, -0.14, 0.04), lens=60, res=(800, 700))
# the two flight phases of a glide: wings up, wings down
wings(0.9); out['beat_up'] = shot('t_beat_up', (1.1, 0, 0.0), (0, 0, 0.0), ortho=0.9, res=(700, 600))
wings(-0.5); out['beat_down'] = shot('t_beat_down', (1.1, 0, 0.0), (0, 0, 0.0), ortho=0.9, res=(700, 600))
# perched: body upright, legs down to the perch, the feet at z = -0.1
rest_pose()
E['tn_body'].rotation_euler = (-0.6, 0, 0)       # upright on the perch: head up, tail down
E['tn_tail'].rotation_euler = (0, 0, 0)
wings(0.0)
bpy.context.view_layer.update()
out['perch'] = shot('t_perch', (1.1, 0, -0.05), (0, 0, -0.05), ortho=0.5, res=(600, 700))
# juvenile
use_plumage('juv')
rest_pose()
out['juv_three'] = shot('t_juv_three', (0.7, -0.9, 0.35), (0, 0, 0.0), lens=50, res=(800, 700))
out['juv_side'] = shot('t_juv_side', (1.1, 0, 0.0), (0, 0, 0.0), ortho=0.75, res=(700, 600))
# back to the adult colours (re-run the colour pass so the saved file keeps Col = adult)
exec(open(r'D:\Paradise Island\blender\tern_color.py', encoding='utf-8').read())
rest_pose()
for ob in hidden:
    ob.hide_render = False
bpy.context.view_layer.update()
result = out
