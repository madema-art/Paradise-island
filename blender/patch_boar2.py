p = r'D:\Paradise Island\blender\boar_build.py'
s = open(p, encoding='utf-8', newline='').read()


def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)


rep("decimate_to(body_ob, 3200)", "decimate_to(body_ob, 1900)")
rep("decimate_to(head_ob, 1700)", "decimate_to(head_ob, 1100)")
rep("decimate_to(jaw_ob, 380)", "decimate_to(jaw_ob, 200)")
rep("decimate_to(um, 330)", "decimate_to(um, 170)")
rep("decimate_to(lm, 360)", "decimate_to(lm, 190)")
rep("decimate_to(m, 220)", "decimate_to(m, 130)")
rep("decimate_to(m, 160)", "decimate_to(m, 90)")
rep("m = t1.to_object('tail1_mesh'); remesh(m, 0.004, 1); decimate_to(m, 260)", "m = t1.to_object('tail1_mesh'); remesh(m, 0.004, 1); decimate_to(m, 150)")
rep("m = t0.to_object('tail0_mesh'); remesh(m, 0.004, 1); decimate_to(m, 160)", "m = t0.to_object('tail0_mesh'); remesh(m, 0.004, 1); decimate_to(m, 100)")
rep("(dx * 3 + rng.uniform(-0.18, 0.18), 0.55 + rng.uniform(-0.1, 0.1), 1.0), L, 0.0125, n=5)", "(dx * 3 + rng.uniform(-0.18, 0.18), 0.55 + rng.uniform(-0.1, 0.1), 1.0), L, 0.0125, n=4)")
rep("neck.location.y += 0.08", """# tidy every mesh: merge doubles, drop degenerate faces, make normals consistent
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()
    o.data.validate()
neck.location.y += 0.08""")
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
