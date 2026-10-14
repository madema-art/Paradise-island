"""Green sea turtle (Chelonia mydas) for Paradise Island.

Builds one rigged, animated adult about 1.2 m long (snout to tail) in metres and exports it as a GLB.
Run headless from this folder:
  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b --factory-startup --python-exit-code 1 --python build_green_sea_turtle.py

Anatomy: a low, smooth, heart-shaped carapace with a scute pattern, a cream plastron under the shell, a small
head on a short neck with a blunt beak, two long front paddles that do the work of swimming, two smaller rear
paddles that steer, and a short tail.

Six clips are baked as NLA strips: Swim_Cruise, Swim_Slow and Rest loop; Graze, Breathe and Dash play once.
The game moves the turtle around the lagoon; the clips supply the body motion.
"""
import bpy, bmesh, math, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
OUT_BLEND = os.path.join(HERE, 'Paradise_Island_Green_Sea_Turtle.blend')
OUT_GLB = os.path.join(PROJECT, 'assets', 'Paradise_Island_Green_Sea_Turtle.glb')
RENDER_DIR = os.path.join(HERE, 'turtle_renders')
FPS = 24
TAU = 2 * math.pi
N_S, N_R = 40, 40

# ---------------------------------------------------------------- scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
scene = bpy.context.scene
scene.render.fps = FPS
col = bpy.data.collections.new('Green sea turtle'); scene.collection.children.link(col)
stage = bpy.data.collections.new('Studio (not exported)'); scene.collection.children.link(stage)


def srgb_lin(hex_):
    h = hex_.lstrip('#')
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def sstep(a, b, x):
    if b == a: return 1.0 if x >= b else 0.0
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def win(x, a, b, f):
    return sstep(a, a + f, x) * (1 - sstep(b - f, b, x))


C_SHELL = srgb_lin('#4f5230')        # olive-brown carapace
C_SHELL_LIGHT = srgb_lin('#7a7b4c')  # paler plates along the back
C_SEAM = srgb_lin('#23220f')         # dark scute seams
C_PLASTRON = srgb_lin('#e5dcb0')     # cream underside
C_SKIN = srgb_lin('#5f6441')         # head and paddles, dorsal
C_SKIN_UNDER = srgb_lin('#d6cc9c')   # throat and paddle undersides
C_EYE = srgb_lin('#0d0d0a')


# ---------------------------------------------------------------- geometry collector
class Geo:
    def __init__(self):
        self.v, self.f, self.c = [], [], []

    def add(self, p, col_):
        self.v.append((float(p[0]), float(p[1]), float(p[2])))
        self.c.append(col_)
        return len(self.v) - 1

    def face(self, idx):
        self.f.append(list(idx))


def add_sphere(G, c, r, col_, scale=(1, 1, 1), seg=8, rings=5):
    grid = []
    for i in range(rings + 1):
        phi = math.pi * i / rings
        row = []
        for j in range(seg):
            th = TAU * j / seg
            p = (c[0] + r * scale[0] * math.sin(phi) * math.cos(th),
                 c[1] + r * scale[1] * math.sin(phi) * math.sin(th),
                 c[2] + r * scale[2] * math.cos(phi))
            row.append(G.add(p, col_))
        grid.append(row)
    for i in range(rings):
        for j in range(seg):
            G.face([grid[i][j], grid[i][(j + 1) % seg], grid[i + 1][(j + 1) % seg], grid[i + 1][j]])


def add_tube(G, path, col_, seg=10):
    """A tube swept along a list of (x, y, z, radius) points."""
    rings = []
    for (x, y, z, r) in path:
        ring = []
        for j in range(seg):
            th = TAU * j / seg
            ring.append(G.add((x, y + r * math.cos(th), z + r * math.sin(th)), col_))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(seg):
            G.face([rings[i][j], rings[i][(j + 1) % seg], rings[i + 1][(j + 1) % seg], rings[i + 1][j]])
    G.face(rings[0][::-1]); G.face(rings[-1])


# ---------------------------------------------------------------- carapace
X0, X1 = -0.62, 0.50          # the shell runs from the front edge to the rear edge, along X


def shell_point(s, th):
    x = X0 + (X1 - X0) * s
    u, v = math.cos(th), math.sin(th)
    fw = math.sin(math.pi * s) ** 0.5                   # half width: pointed at the ends, full in the middle
    fh = math.sin(math.pi * s) ** 0.7                   # height: the dome peaks in the middle
    lat = 0.46 * fw * math.copysign(abs(u) ** 0.6, u)
    if v >= 0:
        vert = 0.23 * fh * abs(v) ** 0.8                  # the domed top shell
    else:
        vert = -0.07 * fw * abs(v) ** 0.8                 # the flatter lower rim
    return (x, lat, vert)


def add_shell(G):
    rows = []
    for i in range(N_S + 1):
        s = i / N_S
        row = []
        for j in range(N_R):
            th = TAU * j / N_R
            p = shell_point(s, th)
            top = math.sin(th) >= 0
            # scutes: a grid of plates, seams drawn where two cell edges meet
            a = s * 7.0; b = j * 10.0 / N_R
            ea = min(a - math.floor(a), math.ceil(a) - a); eb = min(b - math.floor(b), math.ceil(b) - b)
            seam = sstep(0.03, 0.12, min(ea, eb))
            if top:
                rise = sstep(0.2, 0.9, math.sin(th))
                plate = mix(C_SHELL, C_SHELL_LIGHT, 0.35 * rise)
                col_ = mix(C_SEAM, plate, seam)
            else:
                col_ = mix(C_PLASTRON, C_SKIN_UNDER, 0.2 * (1 - seam))
            row.append(G.add(p, col_))
        rows.append(row)
    for i in range(N_S):
        for j in range(N_R):
            G.face([rows[i][j], rows[i][(j + 1) % N_R], rows[i + 1][(j + 1) % N_R], rows[i + 1][j]])


# ---------------------------------------------------------------- head, neck, eyes
def add_head(G):
    add_tube(G, [(-0.50, 0, 0.00, 0.13), (-0.62, 0, 0.03, 0.12), (-0.74, 0, 0.08, 0.105), (-0.84, 0, 0.12, 0.095)],
             C_SKIN, seg=10)
    add_sphere(G, (-0.92, 0, 0.14), 0.10, C_SKIN, scale=(1.25, 0.92, 0.9), seg=10, rings=6)     # head
    add_sphere(G, (-0.99, 0, 0.12), 0.05, C_SKIN_UNDER, scale=(0.8, 0.9, 0.7), seg=8, rings=4)  # blunt beak
    for sg in (-1, 1):
        add_sphere(G, (-0.9, sg * 0.082, 0.17), 0.026, C_EYE, seg=6, rings=3)                   # eyes


# ---------------------------------------------------------------- flippers
def add_paddle(G, root, mid, tip, chord, thick, col_top, col_under):
    """A flattened paddle: a smooth, tapering blade swept from root to tip."""
    root, mid, tip = Vector(root), Vector(mid), Vector(tip)
    span = (tip - root).normalized()
    ch = Vector((1, 0, 0)) - span * Vector((1, 0, 0)).dot(span)
    ch.normalize()
    nrm = span.cross(ch).normalized()

    def centre(u):
        return (1 - u) ** 2 * root + 2 * (1 - u) * u * mid + u * u * tip

    def half_chord(u):
        return chord * 0.5 * (math.sin(math.pi * min(1.0, 0.1 + u * 0.9)) ** 0.6) * (1 - 0.45 * u)

    N_U, N_F = 10, 16
    rows = []
    for i in range(N_U + 1):
        u = 0.03 + 0.94 * i / N_U
        c = centre(u); hc = half_chord(u); t = thick * (1 - 0.5 * u)
        row = []
        for j in range(N_F):
            phi = TAU * j / N_F
            cp, sp = math.cos(phi), math.sin(phi)
            off = ch * (hc * (1.0 if cp > 0 else 0.7) * cp) + nrm * (t * sp)
            col_ = mix(col_under, col_top, sstep(-0.1, 0.2, off.z / max(t, 1e-4)))
            row.append(G.add(tuple(c + off), col_))
        rows.append(row)
    for i in range(N_U):
        for j in range(N_F):
            G.face([rows[i][j], rows[i][(j + 1) % N_F], rows[i + 1][(j + 1) % N_F], rows[i + 1][j]])


# ---------------------------------------------------------------- tail
def add_tail(G):
    add_tube(G, [(0.46, 0, -0.02, 0.05), (0.58, 0, -0.02, 0.03), (0.70, 0, -0.03, 0.008)], C_SKIN, seg=6)


# ---------------------------------------------------------------- assemble the mesh
G = Geo()
add_shell(G)
add_head(G)
for sg in (-1, 1):
    add_paddle(G, (-0.22, sg * 0.42, -0.03), (-0.02, sg * 0.80, -0.07), (0.14, sg * 1.05, -0.13), 0.22, 0.035, C_SKIN, C_SKIN_UNDER)
    add_paddle(G, (0.30, sg * 0.34, -0.03), (0.40, sg * 0.48, -0.06), (0.50, sg * 0.62, -0.08), 0.13, 0.03, C_SKIN, C_SKIN_UNDER)
add_tail(G)

me = bpy.data.meshes.new('Green sea turtle | mesh')
me.from_pydata(G.v, [], G.f)
me.update()
mat = bpy.data.materials.new('Green sea turtle | skin'); mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes['Principled BSDF']
bsdf.inputs['Roughness'].default_value = 0.42
vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
me.materials.append(mat)
ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
for i, d in enumerate(ca.data):
    c = G.c[i]
    d.color = (c[0], c[1], c[2], 1.0)
me.color_attributes.active_color = ca
for p in me.polygons: p.use_smooth = True
body_ob = bpy.data.objects.new('Green sea turtle | body', me)
col.objects.link(body_ob)
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
bm.to_mesh(me); bm.free()

# ---------------------------------------------------------------- skeleton
# bone: name, head, tail (metres), parent, influence radius
BONES = [
    ('Root', (-0.40, 0, 0.0), (0.30, 0, 0.0), None, 0.9),
    ('Neck', (-0.50, 0, 0.0), (-0.74, 0, 0.08), 'Root', 0.45),
    ('Head', (-0.74, 0, 0.08), (-0.95, 0, 0.14), 'Neck', 0.4),
    ('ArmL', (-0.22, -0.42, -0.03), (-0.02, -0.80, -0.07), 'Root', 0.5),
    ('ForeL', (-0.02, -0.80, -0.07), (0.14, -1.05, -0.13), 'ArmL', 0.42),
    ('ArmR', (-0.22, 0.42, -0.03), (-0.02, 0.80, -0.07), 'Root', 0.5),
    ('ForeR', (-0.02, 0.80, -0.07), (0.14, 1.05, -0.13), 'ArmR', 0.42),
    ('RearL', (0.30, -0.34, -0.03), (0.50, -0.62, -0.08), 'Root', 0.3),
    ('RearR', (0.30, 0.34, -0.03), (0.50, 0.62, -0.08), 'Root', 0.3),
    ('Tail', (0.46, 0, -0.02), (0.70, 0, -0.03), 'Root', 0.25),
]
BONE_NAMES = [b[0] for b in BONES]
arm_data = bpy.data.armatures.new('Green sea turtle | skeleton')
arm = bpy.data.objects.new('Green sea turtle | rig', arm_data)
col.objects.link(arm)
arm.animation_data_create()
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
ebs = {}
for name, head, tail, parent, _ in BONES:
    eb = arm_data.edit_bones.new(name)
    eb.head = Vector(head); eb.tail = Vector(tail)
    eb.align_roll(Vector((0, 0, 1)))
    if parent: eb.parent = ebs[parent]
    ebs[name] = eb
bpy.ops.object.mode_set(mode='OBJECT')
arm.select_set(False)
bpy.context.view_layer.update()


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length


for name in BONE_NAMES:
    body_ob.vertex_groups.new(name=name)
radius = {b[0]: b[4] for b in BONES}
seg = {b[0]: (Vector(b[1]), Vector(b[2])) for b in BONES}
for i, v in enumerate(me.vertices):
    p = Vector(v.co)
    d = {n: seg_dist(p, *seg[n]) for n in BONE_NAMES}
    best = sorted(BONE_NAMES, key=lambda n: d[n])[:3]
    w = {n: math.exp(-(d[n] / (0.55 * radius[n] + 0.2)) ** 2) for n in best}
    total = sum(w.values()) or 1.0
    for n, wt in w.items():
        body_ob.vertex_groups[n].add([i], wt / total, 'REPLACE')
mod = body_ob.modifiers.new('Turtle deformation', 'ARMATURE'); mod.object = arm
body_ob.parent = arm


# ---------------------------------------------------------------- motion
# Pitch lifts the far end of a bone (positive = tail up for the carapace; for the neck, positive dips the head).
# Per-clip values were checked against the stage renders in turtle_renders/.
NECK_DOWN = 0.85     # neck angle that reaches the seabed to graze (positive raises the head, negative lowers it)


def stroke(T, amp):
    """Both front paddles beat together: a firm downstroke and a slower recovery, with the forearm following."""
    w = TAU / T
    def f(t):
        ph = w * t
        p = {}
        for side, sg in (('L', 1), ('R', -1)):
            p[('Arm' + side, 'pitch')] = amp * math.sin(ph)
            p[('Fore' + side, 'pitch')] = 0.6 * amp * math.sin(ph - 0.5)
            p[('Arm' + side, 'yaw')] = sg * -0.22 * amp * math.cos(ph)
        for side, sg in (('L', 1), ('R', -1)):
            p[('Rear' + side, 'yaw')] = sg * 0.18 * math.sin(ph)
            p[('Rear' + side, 'pitch')] = 0.10 * math.sin(ph + 0.7)
        p[('Root', 'pitch')] = 0.04 * math.sin(ph)
        p[('Neck', 'pitch')] = 0.05 * math.sin(ph + 0.6)
        return p
    return f


def graze(t):
    # a steady feeding pose that loops: the head stays down on the seabed and chews in a slow, periodic bob
    ph = TAU * t / 5.0
    p = {}
    p[('Root', 'pitch')] = 0.10
    p[('Neck', 'pitch')] = -NECK_DOWN
    p[('Head', 'pitch')] = -0.25 + 0.07 * math.sin(ph * 4)  # chewing bob, four bites per loop
    for side in ('L', 'R'):
        p[('Arm' + side, 'pitch')] = 0.06 * math.sin(ph)
    return p


def breathe(t):
    rise = win(t, 0.6, 4.6, 0.9)
    p = {}
    p[('Root', 'pitch')] = -0.26 * rise
    p[('Neck', 'pitch')] = NECK_DOWN * rise
    p[('Head', 'pitch')] = 0.0
    beat = win(t, 0.0, 2.4, 0.4) * math.sin(TAU * t / 0.9)
    for side, sg in (('L', 1), ('R', -1)):
        p[('Arm' + side, 'pitch')] = 0.55 * beat
        p[('Fore' + side, 'pitch')] = 0.30 * beat
        p[('Arm' + side, 'yaw')] = sg * -0.12 * beat
    return p


def rest(t):
    ph = TAU * t / 6.0
    p = {}
    p[('Root', 'pitch')] = 0.03 * math.sin(ph)
    p[('Neck', 'pitch')] = 0.25 + 0.05 * math.sin(ph)
    p[('Head', 'pitch')] = 0.15
    for side, sg in (('L', 1), ('R', -1)):
        p[('Arm' + side, 'pitch')] = 0.10 + 0.06 * math.sin(ph + 0.5)
        p[('Fore' + side, 'pitch')] = 0.08 * math.sin(ph + 1.0)
        p[('Rear' + side, 'pitch')] = 0.05 * math.sin(ph + 1.5)
    return p


def dash(t):
    p = stroke(0.6, 0.95)(t)
    p[('Root', 'pitch')] = p.get(('Root', 'pitch'), 0) + 0.10 * win(t, 0.0, 2.2, 0.3)
    return p


CLIPS = [
    ('Swim_Cruise', 2.2, True, stroke(2.2, 0.62)),
    ('Swim_Slow', 3.6, True, stroke(3.6, 0.34)),
    ('Rest', 6.0, True, rest),
    ('Graze', 5.0, True, graze),
    ('Breathe', 6.0, False, breathe),
    ('Dash', 2.4, False, dash),
]
ONE_SHOT = {'Breathe', 'Dash'}


def bake(name, T, loop, fn):
    n = int(round(T * FPS))
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    for f_idx in range(1, n + 2):
        t = (f_idx - 1) / FPS
        vals = fn(t) if loop else fn(min(t, T))
        for b in BONE_NAMES:
            pb = arm.pose.bones[b]
            pb.rotation_mode = 'XYZ'
            pb.rotation_euler = (vals.get((b, 'pitch'), 0.0), vals.get((b, 'roll'), 0.0), vals.get((b, 'yaw'), 0.0))
            for ax in range(3):
                pb.keyframe_insert(data_path='rotation_euler', index=ax, frame=f_idx, group=b)
    act.use_cyclic = loop
    act['looping'] = loop
    act['description'] = 'Green sea turtle motion clip. Travel comes from the game path; paddles, neck and head are baked here.'
    arm.animation_data.action = None
    track = arm.animation_data.nla_tracks.new(); track.name = name
    strip = track.strips.new(name, 1, act)
    strip.action_frame_start = 1; strip.action_frame_end = n + 1; strip.blend_type = 'REPLACE'
    for pb in arm.pose.bones: pb.rotation_euler = (0.0, 0.0, 0.0)
    return act


for name, T, loop, fn in CLIPS:
    bake(name, T, loop, fn)
    print('[turtle] baked %s (%.1f s, %s)' % (name, T, 'loop' if loop else 'one shot'))


# ---------------------------------------------------------------- stage renders for review (not exported)
def set_clip(name):
    for tr in arm.animation_data.nla_tracks:
        tr.mute = tr.name != name
    arm.animation_data.action = None


world = bpy.data.worlds.new('Lagoon studio'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.25, 0.42, 0.46, 1); bg.inputs['Strength'].default_value = 0.9
sun = bpy.data.lights.new('Key sun', 'SUN'); sun.energy = 3.4; sun.angle = 0.02
sun_ob = bpy.data.objects.new('Key sun', sun); stage.objects.link(sun_ob); sun_ob.rotation_euler = (math.radians(55), 0, math.radians(-35))
cam_data = bpy.data.cameras.new('Review camera'); cam_data.lens = 40
cam = bpy.data.objects.new('Review camera', cam_data); stage.objects.link(cam)
scene.camera = cam
scene.render.engine = 'CYCLES'; scene.cycles.samples = 24
scene.render.resolution_x = 960; scene.render.resolution_y = 480
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
os.makedirs(RENDER_DIR, exist_ok=True)


def render_shot(label, clip, t, cam_loc, target):
    set_clip(clip)
    cam.location = cam_loc
    cam.rotation_euler = (Vector(target) - Vector(cam_loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.frame_set(1 + int(round(t * FPS)))
    scene.render.filepath = os.path.join(RENDER_DIR, label + '.png')
    bpy.ops.render.render(write_still=True)


if os.environ.get('TURTLE_RENDER', '1') == '1':
    side = (-3.0, -4.6, 1.6)
    shots = [
        ('rest_side', 'Rest', 1.0, side, (-0.1, 0, 0.0)),
        ('cruise_side', 'Swim_Cruise', 0.6, side, (-0.1, 0, 0.0)),
        ('graze_side', 'Graze', 2.4, side, (-0.2, 0, -0.2)),
        ('breathe_side', 'Breathe', 2.2, side, (-0.2, 0, 0.2)),
        ('cruise_top', 'Swim_Cruise', 0.6, (0.0, 0.0, 4.2), (-0.1, 0, 0.0)),
    ]
    for label, clip, t, loc, tgt in shots:
        render_shot(label, clip, t, loc, tgt)
        print('[turtle] rendered', label)
    for tr in arm.animation_data.nla_tracks: tr.mute = False

# ---------------------------------------------------------------- save and export
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='DESELECT')
for ob in col.objects: ob.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, use_active_scene=True,
                          export_apply=False, export_animations=True, export_animation_mode='NLA_TRACKS', export_yup=True,
                          export_vertex_color='ACTIVE', export_skins=True, export_normals=True, export_influence_nb=4)
print('[turtle] exported', OUT_GLB)
