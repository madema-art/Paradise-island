# Stage 1b: weld everything with a voxel remesh, relax, decimate.
import bpy, bmesh
ob = bpy.data.objects['body_raw']
bpy.context.view_layer.objects.active = ob
for o in bpy.data.objects:
    o.select_set(o == ob)
ob.data.remesh_voxel_size = VOXEL
ob.data.remesh_voxel_adaptivity = 0.0
bpy.ops.object.voxel_remesh()
bm = bmesh.new(); bm.from_mesh(ob.data)
for _ in range(SMOOTH_ITERS):
    bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(ob.data); bm.free()
n0 = len(ob.data.polygons)
bpy.ops.object.shade_smooth()
mod = ob.modifiers.new('dec', 'DECIMATE')
mod.ratio = TARGET_FACES / max(n0, 1) if n0 > TARGET_FACES else 1.0
bpy.ops.object.modifier_apply(modifier='dec')
ob.name = 'body'; ob.data.name = 'body'
result = {'faces_before': n0, 'faces_after': len(ob.data.polygons), 'verts': len(ob.data.vertices)}
