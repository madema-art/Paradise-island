"""Blackfin reef shark (Carcharhinus melanopterus) for Paradise Island.

Builds one rigged, animated adult about 1.8 m long (nose to caudal tip) in metres and exports it as a GLB.
Run headless from this folder:
  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b --factory-startup --python-exit-code 1 --python build_blackfin_reef_shark.py

Proportions, markings and swimming kinematics follow the species references listed in blackfin_reef_shark_README.md.
"""
import bpy, bmesh, math, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
OUT_BLEND = os.path.join(HERE, 'Paradise_Island_Blackfin_Reef_Shark.blend')
OUT_GLB = os.path.join(PROJECT, 'assets', 'Paradise_Island_Blackfin_Reef_Shark.glb')
OUT_PNG = os.path.join(HERE, 'blackfin_reef_shark_preview.png')

TAU = 2 * math.pi
S = 0.9          # normalised units to metres: 2.0 units from nose to caudal tip = 1.8 m
N_RING = 56      # cross-section resolution around the body
FPS = 24

# ---------------------------------------------------------------- scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
scene = bpy.context.scene
scene.render.fps = FPS
col = bpy.data.collections.new('Blackfin reef shark'); scene.collection.children.link(col)
stage = bpy.data.collections.new('Studio (not exported)'); scene.collection.children.link(stage)


def srgb(hex_):
    h = hex_.lstrip('#')
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


def mat(name, hex_, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    rgb = srgb(hex_)
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*rgb, 1)
    return m


M = {
    'back': mat('Blackfin | dorsal skin', '#776E62', 0.32),       # light brown to brown-grey back
    'belly': mat('Blackfin | ventral skin', '#EDEFEA', 0.38),     # white underside and flank band
    'fin': mat('Blackfin | fin', '#6A6358', 0.36),
    'tip': mat('Blackfin | black fin tip', '#101112', 0.40),      # black tips on dorsals, pectorals, caudal
    'eye': mat('Blackfin | eye', '#070809', 0.18),
    'glint': mat('Blackfin | eye highlight', '#D8E2E6', 0.20),
    'slit': mat('Blackfin | gill slit', '#2C2723', 0.50),
    'mouth': mat('Blackfin | mouth line', '#4A3F38', 0.50),
    'nostril': mat('Blackfin | nostril', '#2A2421', 0.50),
}


def fix_normals(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data); bm.free()


def mesh_object(name, verts, faces, mats, face_mats):
    me = bpy.data.meshes.new(name + ' | mesh')
    me.from_pydata(verts, [], faces)
    me.update()
    for m in mats: me.materials.append(m)
    for p, i in zip(me.polygons, face_mats):
        p.material_index = i; p.use_smooth = True
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    fix_normals(ob)
    return ob


def blob(name, loc, radii, material):
    """Ellipsoid at loc (normalised units) with radii (normalised units)."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1.0,
                                         location=(loc[0] * S, loc[1] * S, loc[2] * S))
    o = bpy.context.active_object; o.name = name
    for c in list(o.users_collection): c.objects.unlink(o)
    col.objects.link(o)
    o.scale = (radii[0] * S, radii[1] * S, radii[2] * S)
    o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth = True
    return o


def curve_line(name, pts, material, bevel=0.005):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    cu.resolution_u = 2; cu.bevel_depth = bevel; cu.bevel_resolution = 2
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, v in zip(sp.points, pts): p.co = (v[0] * S, v[1] * S, v[2] * S, 1)
    ob = bpy.data.objects.new(name, cu); col.objects.link(ob); ob.data.materials.append(material)
    return ob


# ---------------------------------------------------------------- body
# (x along the body, half width, half height, centre height). Nose at -X, caudal tip at +X.
# Taller at the pectoral and first-dorsal region, slender peduncle, flatter belly than back.
STATIONS = [
    (-1.00, 0.003, 0.003, 0.000), (-0.98, 0.030, 0.022, 0.000), (-0.94, 0.068, 0.048, 0.000),
    (-0.88, 0.108, 0.076, -0.005), (-0.80, 0.148, 0.108, -0.012), (-0.70, 0.178, 0.150, -0.020),
    (-0.62, 0.200, 0.178, -0.025), (-0.52, 0.215, 0.190, -0.030), (-0.42, 0.228, 0.198, -0.035),
    (-0.30, 0.240, 0.205, -0.040), (-0.20, 0.246, 0.210, -0.045), (-0.10, 0.248, 0.212, -0.045),
    (0.00, 0.238, 0.205, -0.040), (0.10, 0.222, 0.195, -0.035), (0.20, 0.200, 0.178, -0.030),
    (0.30, 0.178, 0.160, -0.025), (0.40, 0.152, 0.138, -0.020), (0.50, 0.128, 0.115, -0.015),
    (0.60, 0.100, 0.092, -0.010), (0.70, 0.078, 0.072, -0.005), (0.80, 0.062, 0.058, 0.000),
    (0.88, 0.052, 0.048, 0.000), (0.94, 0.046, 0.040, 0.000), (0.99, 0.030, 0.026, 0.000),
    (1.00, 0.006, 0.006, 0.000),
]


def body():
    n = N_RING; verts = []
    for x, rw, rh, zc in STATIONS:
        # the head is flatter from above than a tuna's and the body slimmer than the first draft
        head_flat = 0.88 + 0.12 * min(1.0, max(0.0, (x + 0.95) / 0.5))
        rh = rh * head_flat * 0.95
        for j in range(n):
            a = TAU * j / n; s = math.sin(a)
            verts.append((x * S, rw * math.cos(a) * S, (rh * s * (1.0 if s >= 0 else 0.82) + zc) * S))
    faces = []; face_mats = []
    L = len(STATIONS)
    for i in range(L - 1):
        for j in range(n):
            a = i * n + j; b = i * n + (j + 1) % n; c = (i + 1) * n + (j + 1) % n; d = (i + 1) * n + j
            faces.append((a, b, c, d))
            # lower flank and belly are white; the back is brown-grey
            face_mats.append(1 if math.sin(TAU * (j + 0.5) / n) < -0.2 else 0)
    faces.append(tuple(range(n))); faces.append(tuple(range((L - 1) * n, L * n)))
    face_mats += [0, 0]
    return mesh_object('Blackfin_Reef_Shark | body', verts, faces, [M['back'], M['belly']], face_mats)


# ---------------------------------------------------------------- fins
def fin(name, pts, plane, thick, material, off=0.0):
    """Flat fin from a closed outline. 'xz' = vertical fin (thickness along Y); 'xy' = horizontal fin at height off (thickness along Z)."""
    h = thick * 0.5; n = len(pts)
    if plane == 'xz':
        lo = [(u * S, -h * S, v * S) for u, v in pts]; hi = [(u * S, h * S, v * S) for u, v in pts]
    else:
        lo = [(u * S, v * S, (off - h) * S) for u, v in pts]; hi = [(u * S, v * S, (off + h) * S) for u, v in pts]
    faces = [tuple(range(n)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return mesh_object(name, lo + hi, faces, [material], [0] * len(faces))


# first dorsal: large, falcate, apex over the pectoral rear; black tip on the apex
DORSAL1 = [(-0.24, 0.12), (-0.24, 0.17), (-0.20, 0.23), (-0.14, 0.29), (-0.08, 0.335), (-0.02, 0.36),
           (0.04, 0.355), (0.09, 0.32), (0.13, 0.26), (0.16, 0.20), (0.17, 0.12)]
DORSAL1_TIP = [(-0.10, 0.30), (-0.08, 0.335), (-0.02, 0.36), (0.04, 0.355), (0.09, 0.32), (0.11, 0.30),
               (0.04, 0.33), (-0.02, 0.34), (-0.07, 0.31)]
# second dorsal: smaller, short free rear tip with a black tip
DORSAL2 = [(0.24, 0.10), (0.26, 0.14), (0.30, 0.19), (0.34, 0.225), (0.395, 0.235), (0.37, 0.205),
           (0.36, 0.17), (0.34, 0.13), (0.31, 0.10)]
DORSAL2_TIP = [(0.34, 0.215), (0.395, 0.235), (0.37, 0.205), (0.35, 0.20)]
# pectoral (right side, +Y): long, narrow, falcate, black tip; the left is the mirror
PECTORAL = [(-0.42, 0.20), (-0.36, 0.30), (-0.27, 0.40), (-0.16, 0.48), (-0.08, 0.52), (-0.12, 0.44),
            (-0.18, 0.36), (-0.24, 0.27), (-0.27, 0.20)]
PECTORAL_TIP = [(-0.19, 0.42), (-0.08, 0.52), (-0.15, 0.44), (-0.20, 0.38)]
PECTORAL_Z = -0.10
# caudal: heterocercal, upper lobe larger and broad at the tip, with a long straight trailing margin;
# black on the lower lobe tip and the upper trailing edge
CAUDAL_UP = [(0.80, 0.08), (0.86, 0.14), (0.93, 0.22), (0.99, 0.30), (1.04, 0.39),
             (1.00, 0.25), (0.97, 0.12), (0.94, 0.04), (0.90, 0.00), (0.84, 0.02)]
CAUDAL_UP_TIP = [(0.99, 0.30), (1.04, 0.39), (1.00, 0.25), (1.00, 0.28)]
CAUDAL_LO = [(0.80, -0.04), (0.86, -0.08), (0.92, -0.14), (0.97, -0.20), (0.99, -0.22),
             (0.96, -0.14), (0.92, -0.07), (0.88, -0.02), (0.80, 0.00)]
CAUDAL_LO_TIP = [(0.94, -0.17), (0.99, -0.22), (0.96, -0.14), (0.93, -0.12)]
ANAL = [(0.48, -0.08), (0.56, -0.08), (0.62, -0.12), (0.63, -0.18), (0.60, -0.14), (0.55, -0.13), (0.48, -0.10)]

# ---------------------------------------------------------------- build the animal
body_ob = body()
parts = {}
parts['dorsal1'] = fin('Blackfin_Reef_Shark | first dorsal fin', DORSAL1, 'xz', 0.045, M['fin'])
parts['dorsal1_tip'] = fin('Blackfin_Reef_Shark | first dorsal black tip', DORSAL1_TIP, 'xz', 0.052, M['tip'])
parts['dorsal2'] = fin('Blackfin_Reef_Shark | second dorsal fin', DORSAL2, 'xz', 0.04, M['fin'])
parts['dorsal2_tip'] = fin('Blackfin_Reef_Shark | second dorsal black tip', DORSAL2_TIP, 'xz', 0.046, M['tip'])
parts['anal'] = fin('Blackfin_Reef_Shark | anal fin', ANAL, 'xz', 0.035, M['fin'])
parts['caudal_up'] = fin('Blackfin_Reef_Shark | upper caudal lobe', CAUDAL_UP, 'xz', 0.04, M['fin'])
parts['caudal_up_tip'] = fin('Blackfin_Reef_Shark | upper caudal black edge', CAUDAL_UP_TIP, 'xz', 0.046, M['tip'])
parts['caudal_lo'] = fin('Blackfin_Reef_Shark | lower caudal lobe', CAUDAL_LO, 'xz', 0.04, M['fin'])
parts['caudal_lo_tip'] = fin('Blackfin_Reef_Shark | lower caudal black tip', CAUDAL_LO_TIP, 'xz', 0.046, M['tip'])
# left (-Y) and right (+Y) pectorals, with black tips
parts['pect_L'] = fin('Blackfin_Reef_Shark | left pectoral fin', [(u, -v) for u, v in PECTORAL], 'xy', 0.022, M['fin'], PECTORAL_Z)
parts['pect_L_tip'] = fin('Blackfin_Reef_Shark | left pectoral black tip', [(u, -v) for u, v in PECTORAL_TIP], 'xy', 0.026, M['tip'], PECTORAL_Z)
parts['pect_R'] = fin('Blackfin_Reef_Shark | right pectoral fin', PECTORAL, 'xy', 0.022, M['fin'], PECTORAL_Z)
parts['pect_R_tip'] = fin('Blackfin_Reef_Shark | right pectoral black tip', PECTORAL_TIP, 'xy', 0.026, M['tip'], PECTORAL_Z)

# eyes, nostrils, gill slits and mouth line, placed on the body surface
body_at = lambda x: next(s for s in STATIONS if s[0] >= x)
eye_surface = lambda x, z: body_at(x)[1] * math.sqrt(max(0.05, 1 - ((z - body_at(x)[3]) / body_at(x)[2]) ** 2))
extras = []
for side in (-1, 1):
    ey = side * (eye_surface(-0.62, 0.07) - 0.010)
    extras.append(blob('Blackfin_Reef_Shark | eye', (-0.62, ey, 0.07), (0.035, 0.012, 0.028), M['eye']))
    extras.append(blob('Blackfin_Reef_Shark | eye highlight', (-0.636, ey + side * 0.004, 0.082), (0.008, 0.004, 0.008), M['glint']))
    extras.append(blob('Blackfin_Reef_Shark | nostril', (-0.915, side * 0.05, -0.02), (0.015, 0.006, 0.008), M['nostril']))
    for i, gx in enumerate((-0.44, -0.40, -0.36, -0.32, -0.28)):
        gy = side * body_at(gx)[1] * 0.96
        extras.append(blob('Blackfin_Reef_Shark | gill slit %d' % (i + 1), (gx, gy, -0.02), (0.007, 0.003, 0.030), M['slit']))
    extras.append(curve_line('Blackfin_Reef_Shark | mouth line', [(-0.86, side * 0.07, -0.085), (-0.76, side * 0.11, -0.095),
                                                                 (-0.66, side * 0.13, -0.090), (-0.60, side * 0.12, -0.080)], M['mouth'], bevel=0.004))

# ---------------------------------------------------------------- skeleton
# bone: name, head, tail (normalised units), parent. The spine runs head to tail along +X.
BONES = [
    ('Root', (-0.98, 0, 0), (-0.62, 0, 0), None),
    ('Spine_Front', (-0.62, 0, 0), (-0.10, 0, 0), 'Root'),
    ('Spine_Mid', (-0.10, 0, 0), (0.25, 0, 0), 'Spine_Front'),
    ('Spine_Rear', (0.25, 0, 0), (0.58, 0, 0), 'Spine_Mid'),
    ('Peduncle', (0.58, 0, 0), (0.88, 0, 0), 'Spine_Rear'),
    ('Caudal', (0.88, 0, 0), (1.02, 0, 0), 'Peduncle'),
    ('Flipper_L', (-0.40, -0.20, -0.10), (-0.16, -0.48, -0.10), 'Spine_Front'),
    ('Flipper_R', (-0.40, 0.20, -0.10), (-0.16, 0.48, -0.10), 'Spine_Front'),
]
arm_data = bpy.data.armatures.new('Blackfin_Reef_Shark | skeleton')
arm = bpy.data.objects.new('Blackfin_Reef_Shark | rig', arm_data); col.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
ebs = {}
for name, head, tail, parent in BONES:
    eb = arm_data.edit_bones.new(name)
    eb.head = Vector(head) * S; eb.tail = Vector(tail) * S
    if parent: eb.parent = ebs[parent]
    ebs[name] = eb
bpy.ops.object.mode_set(mode='OBJECT')
arm.select_set(False)

# Skin weights: the body blends along the spine by x position, bone centres from nose to tail.
CENTRE = [('Root', -0.80), ('Spine_Front', -0.36), ('Spine_Mid', 0.075), ('Spine_Rear', 0.415), ('Peduncle', 0.73), ('Caudal', 0.95)]
for bn, _ in CENTRE: body_ob.vertex_groups.new(name=bn)
for i, v in enumerate(body_ob.data.vertices):
    x = v.co.x / S
    if x <= CENTRE[0][1]: w = {CENTRE[0][0]: 1.0}
    elif x >= CENTRE[-1][1]: w = {CENTRE[-1][0]: 1.0}
    else:
        k = next(k for k in range(len(CENTRE) - 1) if CENTRE[k][1] <= x <= CENTRE[k + 1][1])
        t = (x - CENTRE[k][1]) / (CENTRE[k + 1][1] - CENTRE[k][1]); t = t * t * (3 - 2 * t)
        w = {CENTRE[k][0]: 1 - t, CENTRE[k + 1][0]: t}
    for bn, wt in w.items(): body_ob.vertex_groups[bn].add([i], wt, 'REPLACE')
mod = body_ob.modifiers.new('Shark deformation', 'ARMATURE'); mod.object = arm
body_ob.parent = arm


def bind(ob, bone):
    """Rigidly follow a bone, keeping the object's current world placement."""
    world = ob.matrix_world.copy()
    ob.parent = arm; ob.parent_type = 'BONE'; ob.parent_bone = bone
    ob.matrix_world = world


bind(parts['dorsal1'], 'Spine_Mid'); bind(parts['dorsal1_tip'], 'Spine_Mid')
bind(parts['dorsal2'], 'Spine_Rear'); bind(parts['dorsal2_tip'], 'Spine_Rear')
bind(parts['anal'], 'Spine_Rear')
for k in ('caudal_up', 'caudal_up_tip', 'caudal_lo', 'caudal_lo_tip'): bind(parts[k], 'Caudal')
for side in ('L', 'R'):
    bind(parts['pect_' + side], 'Flipper_' + side); bind(parts['pect_' + side + '_tip'], 'Flipper_' + side)
for ob in extras:
    if 'eye' in ob.name or 'nostril' in ob.name or 'mouth' in ob.name: bind(ob, 'Root')
    else: bind(ob, 'Spine_Front')

# ---------------------------------------------------------------- measure the rig's axes instead of assuming them
bpy.context.view_layer.update()
AXES, SIGNS = {}, {}
for name, _, _, _ in BONES:
    pb = arm.pose.bones[name]; pb.rotation_mode = 'XYZ'
    rest = pb.tail.copy()
    disp = []
    for ax in range(3):
        v = [0.0, 0.0, 0.0]; v[ax] = 0.3
        pb.rotation_euler = v; bpy.context.view_layer.update()
        disp.append(pb.tail - rest)
        pb.rotation_euler = (0.0, 0.0, 0.0); bpy.context.view_layer.update()
    lat = max(range(3), key=lambda a: abs(disp[a].y))     # rotation that sways the tail sideways
    vert = max(range(3), key=lambda a: abs(disp[a].z))    # rotation that moves the tail up or down
    AXES[name] = {'lat': lat, 'vert': vert}
    SIGNS[name] = {'lat': 1 if disp[lat].y > 0 else -1, 'vert': 1 if disp[vert].z > 0 else -1}
    print('[shark] %-12s lateral axis %d (sign %+d), vertical axis %d (sign %+d)' % (name, lat, SIGNS[name]['lat'], vert, SIGNS[name]['vert']))

# ---------------------------------------------------------------- swimming clips
ACT_BONES = ['Root', 'Spine_Front', 'Spine_Mid', 'Spine_Rear', 'Peduncle', 'Caudal']
FIN_BONES = ['Flipper_L', 'Flipper_R']
# lateral angle of each segment (radians) and travelling-wave lag: the wave runs from head to tail
# joint angles (rad). The head yaws more than the first draft so that tail-to-head amplitude is nearer the
# measured ~1.8:1 of carcharhinid reef sharks (Kajiura et al.), rather than the ~8:1 the first draft gave
AMP = {'Root': 0.07, 'Spine_Front': 0.09, 'Spine_Mid': 0.11, 'Spine_Rear': 0.15, 'Peduncle': 0.20, 'Caudal': 0.26}
LAG = {'Root': 0.0, 'Spine_Front': 0.45, 'Spine_Mid': 0.95, 'Spine_Rear': 1.40, 'Peduncle': 1.85, 'Caudal': 2.35}
HEAD_BONES = ('Root', 'Spine_Front')


def wave(t, T, kt, kh, gain):
    """Head yaws at kh cycles per clip with small amplitude; the tail beats at kt cycles with large amplitude.
    This is the double-oscillator pattern measured in carcharhinid reef sharks: head frequency higher, tail amplitude larger."""
    out = {}
    for b in ACT_BONES:
        k = kh if b in HEAD_BONES else kt
        out[(b, 'lat')] = gain * AMP[b] * math.sin(TAU * k * t / T - LAG[b])
    return out


def fn_cruise(t):
    o = wave(t, 6.0, 8, 9, 1.0)
    for s in FIN_BONES: o[(s, 'vert')] = 0.04 * math.sin(TAU * 8 * t / 6.0)
    return o


def fn_fast(t):
    o = wave(t, 3.0, 6, 7, 1.5)
    for s in FIN_BONES: o[(s, 'vert')] = 0.09 * math.sin(TAU * 6 * t / 3.0)
    return o


def fn_hover(t):
    o = wave(t, 8.0, 2, 3, 0.3)
    for s in FIN_BONES: o[(s, 'vert')] = 0.10 * math.sin(TAU * 2 * t / 8.0)
    return o


def turn(sign):
    """sign -1 bends the body toward -Y (the shark's left), +1 toward +Y (its right). The inner pectoral dips, the outer lifts."""
    def fn(t, T=2.2):
        e = math.sin(math.pi * t / T)
        o = {}
        for b in ACT_BONES: o[(b, 'lat')] = sign * 1.2 * AMP[b] * e
        inner, outer = ('Flipper_L', 'Flipper_R') if sign < 0 else ('Flipper_R', 'Flipper_L')
        o[(inner, 'vert')] = -0.30 * e; o[(outer, 'vert')] = 0.18 * e
        return o
    return fn


def fn_dash(t, T=1.6):
    e = math.sin(math.pi * t / T) ** 0.7 * 1.5
    o = {k: v * e for k, v in wave(t, T, 2, 2, 1.4).items()}
    for s in FIN_BONES: o[(s, 'vert')] = -0.18 * e
    return o


CLIPS = [
    ('Patrol_Cruise', 6.0, True, fn_cruise),
    ('Patrol_Fast', 3.0, True, fn_fast),
    ('Hover_Rest', 8.0, True, fn_hover),
    ('Turn_Left', 2.2, False, turn(-1)),
    ('Turn_Right', 2.2, False, turn(1)),
    ('Dash_Strike', 1.6, False, fn_dash),
]

arm.animation_data_create()
for pb in arm.pose.bones: pb.rotation_mode = 'XYZ'; pb.rotation_euler = (0.0, 0.0, 0.0)


def reset_pose():
    for pb in arm.pose.bones: pb.rotation_euler = (0.0, 0.0, 0.0)


def bake(name, T, loop, fn):
    n = int(round(T * FPS))
    frames = list(range(1, n + 2, 2))
    if frames[-1] != n + 1: frames.append(n + 1)         # last key equals the first for loops
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    cur = {b: [0.0, 0.0, 0.0] for b in ACT_BONES + FIN_BONES}
    for f in frames:
        for (b, kind), val in fn((f - 1) / FPS).items():
            ax = AXES[b][kind]
            cur[b][ax] = val * SIGNS[b][kind]
            pb = arm.pose.bones[b]
            pb.rotation_euler = cur[b]
            pb.keyframe_insert(data_path='rotation_euler', index=ax, frame=f, group=b)
    act.use_cyclic = loop
    act['looping'] = loop
    act['description'] = 'Blackfin reef shark motion clip. Forward travel comes from the game path; the spine wave and fins are baked here.'
    arm.animation_data.action = None
    track = arm.animation_data.nla_tracks.new(); track.name = name
    strip = track.strips.new(name, frames[0], act)
    strip.action_frame_start = frames[0]; strip.action_frame_end = frames[-1]; strip.blend_type = 'REPLACE'
    reset_pose()
    return act


for name, T, loop, fn in CLIPS:
    bake(name, T, loop, fn)
    print('[shark] baked %s (%.1f s, %s)' % (name, T, 'loop' if loop else 'one shot'))

# ---------------------------------------------------------------- stage render (not exported)
world = bpy.data.worlds.new('Lagoon studio'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.20, 0.36, 0.42, 1); bg.inputs['Strength'].default_value = 0.8
sun = bpy.data.lights.new('Key sun', 'SUN'); sun.energy = 3.2; sun.angle = 0.02
sun_ob = bpy.data.objects.new('Key sun', sun); stage.objects.link(sun_ob); sun_ob.rotation_euler = (math.radians(55), 0, math.radians(-35))
cam_data = bpy.data.cameras.new('Preview camera'); cam_data.lens = 50
cam = bpy.data.objects.new('Preview camera', cam_data); stage.objects.link(cam)
cam.location = (-2.5, -2.2, 0.9)
target = Vector((-0.1 * S, 0, 0.05))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam
scene.render.engine = 'CYCLES'; scene.cycles.samples = 48
scene.render.resolution_x = 1200; scene.render.resolution_y = 520; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = OUT_PNG
scene.view_settings.view_transform = 'AgX'
scene.frame_set(1)
bpy.ops.render.render(write_still=True)

# ---------------------------------------------------------------- save and export
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='DESELECT')
for ob in col.objects: ob.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, use_active_scene=True,
                          export_apply=False, export_animations=True, export_animation_mode='NLA_TRACKS', export_yup=True)
print('[shark] exported', OUT_GLB)
