import time
t = time.time()
exec(open(r'D:\Paradise Island\blender\cast_body.py', encoding='utf-8').read())
DECIMATE_RATIO = 0.22; DECIMATE_VG = 4.0; VOXEL = 0.0035; SMOOTH_ITERS = 3; TARGET_FACES = 10 ** 9
exec(open(r'D:\Paradise Island\blender\cast_remesh.py', encoding='utf-8').read())
exec(open(r'D:\Paradise Island\blender\cast_detail.py', encoding='utf-8').read())
bpy.ops.object.shade_smooth()
_o = bpy.data.objects['body']
bpy.context.view_layer.objects.active = _o
import numpy as np
_vg = _o.vertex_groups.new(name='keep')
_N = len(_o.data.vertices); _co = np.empty(_N * 3); _o.data.vertices.foreach_get('co', _co); _co = _co.reshape(-1, 3)
for _i in range(_N):
    _x, _y, _z = abs(_co[_i][0]), _co[_i][1], _co[_i][2]
    _w = 0.12
    if _z > 1.56: _w = 1.0                              # head and neck keep their detail
    elif _z < 0.12: _w = 0.7                            # feet
    elif _z < 0.95 and _x > 0.19: _w = 0.8              # hands
    elif _z > 1.1 and _z < 1.52 and _x < 0.17: _w = 0.35
    _vg.add([_i], _w, 'REPLACE')
_m = _o.modifiers.new('dec', 'DECIMATE'); _m.ratio = DECIMATE_RATIO
_m.vertex_group = 'keep'; _m.vertex_group_factor = DECIMATE_VG
bpy.ops.object.modifier_apply(modifier='dec')
bpy.ops.object.shade_smooth()
result['tris'] = len(_o.data.polygons)
_o.vertex_groups.remove(_o.vertex_groups['keep'])
result['secs'] = time.time() - t
exec(open(r'D:\Paradise Island\blender\cast_render.py', encoding='utf-8').read())
bpy.context.scene.display.shading.color_type = 'OBJECT'
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.color = (0.72, 0.47, 0.30, 1)
shot('v_front', (0, -6, 0.9), (0, 0, 0.9), ortho=1.95, res=(560, 900))
shot('v_torso', (0.0, -1.4, 1.2), (0, 0, 1.2), lens=70, res=(800, 800))
shot('v_head', (0.0, -0.8, 1.68), (0, 0, 1.67), lens=85, res=(800, 800))
shot('v_head3', (0.55, -0.7, 1.72), (0, -0.02, 1.66), lens=85, res=(800, 800))
