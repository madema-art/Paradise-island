import time, numpy as np, math
from mathutils import Euler, Quaternion
t0 = time.time()
exec(open(r'D:\Paradise Island\blender\run_body.py', encoding='utf-8').read())
exec(open(r'D:\Paradise Island\blender\cast_color.py', encoding='utf-8').read())
exec(open(r'D:\Paradise Island\blender\cast_hair.py', encoding='utf-8').read())
exec(open(r'D:\Paradise Island\blender\cast_cloth.py', encoding='utf-8').read())
exec(open(r'D:\Paradise Island\blender\cast_skin.py', encoding='utf-8').read())
for o in bpy.data.objects:
    if o.type == 'MESH' and o.data.color_attributes:
        o.data.color_attributes.active_color = o.data.color_attributes['Col']
        o.data.color_attributes.render_color_index = list(o.data.color_attributes.keys()).index('Col')
exec(open(r'D:\Paradise Island\blender\cast_render.py', encoding='utf-8').read())
bpy.context.scene.display.shading.color_type = 'VERTEX'


def pose(rig, name, ex=0, ey=0, ez=0):
    pb = rig.pose.bones[name]
    pb.rotation_mode = 'QUATERNION'
    R = Euler((ex, ey, ez), 'XYZ').to_matrix()
    rest = pb.bone.matrix_local.to_3x3()
    q = (rest.inverted() @ R @ rest).to_quaternion()
    pb.rotation_quaternion = q


def clear_pose(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion((1, 0, 0, 0))


rig = bpy.data.objects['rig']
result['secs'] = time.time() - t0
shot('a_front', (0, -6, 0.95), (0, 0, 0.95), ortho=2.0, res=(560, 900))
shot('a_hands', (0.9, -0.9, 0.95), (0.2, 0, 0.9), lens=60, res=(800, 800))
shot('a_head', (0.5, -0.8, 1.7), (0, 0, 1.66), lens=70, res=(800, 800))
# walking pose test: swing legs/arms, bend knees
pose(rig, 'legP', ex=0.5); pose(rig, 'kneeP', ex=-0.2); pose(rig, 'legN', ex=-0.4); pose(rig, 'kneeN', ex=0.7)
pose(rig, 'armP', ex=-0.5); pose(rig, 'elbowP', ex=-0.9); pose(rig, 'armN', ex=0.5); pose(rig, 'spine', ez=0.15)
bpy.context.view_layer.update()
shot('a_walk_side', (6, 0, 0.95), (0, 0, 0.95), ortho=2.0, res=(700, 900))
shot('a_walk_front', (0, -6, 0.95), (0, 0, 0.95), ortho=2.0, res=(560, 900))
clear_pose(rig)
