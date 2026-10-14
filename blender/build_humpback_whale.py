"""Humpback whale (Megaptera novaeangliae) for Paradise Island.

Builds one rigged, animated adult about 15.7 m from snout to fluke tip (metres) and exports it as a GLB.
Run headless from this folder:
  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b --factory-startup --python-exit-code 1 --python build_humpback_whale.py

Anatomy the model follows: a broad, flat-topped head with rows of tubercles and a blunt snout; a long body with
throat pleats running back to the navel; very long pectoral flippers (about a third of body length) with rounded
tubercles along the leading edge; a small falcate dorsal fin set well back; a slim peduncle; and a broad fluke with a
deep median notch and a scalloped trailing edge. Countershading is dark slate on the back and white below.

Eight clips are baked as NLA strips: Swim_Slow, Swim_Cruise, Swim_Fast and Idle_Float loop; Surface_Blow, Pec_Slap,
Dive_Fluke and Breach play once. The game moves the whale through the sea; the clips supply the body motion.
"""
import bpy, bmesh, math, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
OUT_BLEND = os.path.join(HERE, 'Paradise_Island_Humpback_Whale.blend')
OUT_GLB = os.path.join(PROJECT, 'assets', 'Paradise_Island_Humpback_Whale.glb')
RENDER_DIR = os.path.join(HERE, 'humpback_renders')
FPS = 24
TAU = 2 * math.pi
N_S, N_R = 56, 48          # body rings along the length, and vertices around each ring

# ---------------------------------------------------------------- scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
scene = bpy.context.scene
scene.render.fps = FPS
col = bpy.data.collections.new('Humpback whale'); scene.collection.children.link(col)
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
    """1 between a and b, easing in and out over f seconds at each end."""
    return sstep(a, a + f, x) * (1 - sstep(b - f, b, x))


C_BACK = srgb_lin('#1d2834')      # dark slate back
C_BELLY = srgb_lin('#eef2f2')     # white underside
C_TUB = srgb_lin('#141b23')       # tubercles, eyes, blowholes, mouth line
C_FLUKE_UNDER = srgb_lin('#e4eaec')


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


# ---------------------------------------------------------------- body profile
# s runs from the snout (0) to the fluke joint (1); the body is 14 m between x = -7 and x = +7.
S_K = [0.00, 0.03, 0.10, 0.22, 0.36, 0.50, 0.62, 0.74, 0.84, 0.92, 1.00]
W_K = [0.00, 0.70, 1.40, 1.80, 1.92, 1.84, 1.56, 1.12, 0.66, 0.44, 0.36]     # half width
TOP_K = [0.00, 0.55, 1.05, 1.30, 1.40, 1.46, 1.44, 1.12, 0.80, 0.56, 0.44]   # height above the centre line
BOT_K = [0.00, 0.50, 0.92, 1.15, 1.26, 1.28, 1.16, 0.84, 0.52, 0.38, 0.34]   # depth below it


def interp(keys, vals, s):
    if s <= keys[0]: return vals[0]
    for k in range(len(keys) - 1):
        if keys[k] <= s <= keys[k + 1]:
            return vals[k] + (vals[k + 1] - vals[k]) * sstep(keys[k], keys[k + 1], s)
    return vals[-1]


def body_point(s, th):
    u, v = math.cos(th), math.sin(th)
    w = interp(S_K, W_K, s)
    lat = w * math.copysign(abs(u) ** 0.7, u)
    if v >= 0:
        vert = interp(S_K, TOP_K, s) * abs(v) ** 0.8
    else:
        # throat and belly pleats: about sixteen shallow ridges around the underside, fading out toward the tail
        fade = sstep(0.02, 0.08, s) * (1 - sstep(0.45, 0.60, s))
        groove = 1 + 0.045 * math.sin(16 * (th - math.pi)) * fade * (-v)
        vert = -interp(S_K, BOT_K, s) * abs(v) ** 0.8 * groove
    return (-7 + 14 * s, lat, vert)


def surface_point(s, th, out=0.0):
    p = body_point(s, th)
    r = math.hypot(p[1], p[2]) or 1.0
    return (p[0], p[1] + out * p[1] / r, p[2] + out * p[2] / r)


def add_body(G):
    rows = []
    for i in range(N_S + 1):
        s = i / N_S
        row = []
        for j in range(N_R):
            th = TAU * j / N_R
            row.append(G.add(body_point(s, th), mix(C_BELLY, C_BACK, sstep(-0.2, 0.3, math.sin(th)))))
        rows.append(row)
    for i in range(N_S):
        for j in range(N_R):
            G.face([rows[i][j], rows[i][(j + 1) % N_R], rows[i + 1][(j + 1) % N_R], rows[i + 1][j]])


def add_head_details(G):
    # tubercles: small rounded knobs on the top and front of the head, and along the jaw
    for s in (0.05, 0.09, 0.13, 0.17, 0.21, 0.25):
        for th in (math.pi / 2 - 0.9, math.pi / 2 - 0.45, math.pi / 2, math.pi / 2 + 0.45, math.pi / 2 + 0.9):
            if s > 0.2 and abs(th - math.pi / 2) > 0.8: continue
            p = surface_point(s, th, 0.05)
            add_sphere(G, p, 0.05 + 0.012 * math.sin(s * 40 + th), C_TUB, seg=6, rings=4)
    # blowholes on the top of the head
    for sg in (-1, 1):
        p = surface_point(0.11, math.pi / 2 + sg * 0.30, 0.03)
        add_sphere(G, p, 0.10, C_TUB, scale=(1.0, 1.0, 0.45), seg=8, rings=4)
    # eyes, set in the side of the head with a little dark eyeline
    for sg in (-1, 1):
        th = math.atan2(0.18, sg * 0.97)
        p = surface_point(0.20, th, 0.04)
        add_sphere(G, p, 0.13, C_TUB, scale=(0.5, 0.8, 0.8), seg=8, rings=5)
    # mouth line: a row of tiny beads along the lower jaw
    for sg in (-1, 1):
        for k in range(12):
            s = 0.03 + 0.017 * k
            p = surface_point(s, math.atan2(-0.24, sg * 0.97), 0.03)
            add_sphere(G, p, 0.035, C_TUB, seg=5, rings=3)


def add_dorsal(G):
    """Small falcate dorsal fin, set well back on the body."""
    def top_at(s): return interp(S_K, TOP_K, s)
    xf, xb, xt = -7 + 14 * 0.60, -7 + 14 * 0.76, -7 + 14 * 0.71
    base_f = (xf, top_at(0.60) - 0.10)
    base_b = (xb, top_at(0.76) - 0.10)
    tip = (xt, top_at(0.70) + 0.55)
    pts = [base_f, tip, base_b]
    n = len(pts)
    left = [G.add((x, -0.07, z), C_BACK) for x, z in pts]
    right = [G.add((x, 0.07, z), C_BACK) for x, z in pts]
    G.face(left); G.face(list(reversed(right)))
    for k in range(n):
        a, b = k, (k + 1) % n
        G.face([left[a], left[b], right[b], right[a]])


def add_flipper(G, sg):
    """Pectoral flipper: a long leaf-shaped blade with tubercles on the leading edge. sg = +1 (+Y) or -1 (-Y)."""
    root = Vector((-3.9, sg * 1.45, -0.35))
    mid = Vector((-2.7, sg * 3.3, -0.6))
    tip = Vector((-1.1, sg * 5.6, -0.95))
    span = (tip - root).normalized()
    ch = Vector((1, 0, 0)) - span * Vector((1, 0, 0)).dot(span)
    ch.normalize()
    nrm = span.cross(ch).normalized()

    def centre(u):
        return (1 - u) ** 2 * root + 2 * (1 - u) * u * mid + u * u * tip

    def half_chord(u):
        return 0.52 * (math.sin(math.pi * min(1.0, u * 1.1)) ** 0.7) * (1.0 - 0.35 * u)

    def thick(u):
        return 0.11 * (1 - u) + 0.025

    N_U, N_F = 14, 20
    rows = []
    for i in range(N_U + 1):
        u = 0.02 + 0.96 * i / N_U
        c, t = centre(u), thick(u)
        hc = half_chord(u)
        row = []
        for j in range(N_F):
            phi = TAU * j / N_F
            cp, sp = math.cos(phi), math.sin(phi)
            side_c = hc * (1.0 if cp > 0 else 0.62)          # fuller leading edge, tapering trailing edge
            off = ch * (side_c * cp) + nrm * (t * sp)
            p = c + off
            col_ = mix(C_BELLY, C_BACK, sstep(-0.15, 0.25, off.z / max(t, 1e-4)))
            row.append(G.add(p, col_))
        rows.append(row)
    for i in range(N_U):
        for j in range(N_F):
            G.face([rows[i][j], rows[i][(j + 1) % N_F], rows[i + 1][(j + 1) % N_F], rows[i + 1][j]])
    # leading-edge tubercles
    for u in (0.12, 0.24, 0.36, 0.48, 0.60, 0.72, 0.84):
        c = centre(u) + ch * (half_chord(u) * 0.98)
        add_sphere(G, tuple(c), 0.085 * (1 - 0.45 * u), C_TUB, seg=6, rings=4)


def add_flukes(G):
    """Fluke: a broad flattened blade with a deep median notch and a scalloped trailing edge, pitched flat."""
    right = [(7.0, 0.0), (7.35, 0.45), (7.80, 1.10), (8.25, 1.90), (8.55, 2.45),
             (8.42, 2.18), (8.65, 2.05), (8.42, 1.78), (8.70, 1.45), (8.45, 1.12), (8.60, 0.72), (8.42, 0.30), (8.35, 0.0)]
    left = [(x, -y) for (x, y) in reversed(right[1:-1])]
    outline = right + left

    def thick(x, y):
        return 0.11 - 0.06 * min(1.0, abs(y) / 2.4)

    top = [G.add((x, y, thick(x, y)), C_BACK) for x, y in outline]
    bot = [G.add((x, y, -thick(x, y)), C_FLUKE_UNDER) for x, y in outline]
    cen_t = G.add((7.8, 0.0, 0.1), C_BACK)
    cen_b = G.add((7.8, 0.0, -0.1), C_FLUKE_UNDER)
    n = len(outline)
    for k in range(n):
        a, b = k, (k + 1) % n
        G.face([cen_t, top[a], top[b]])
        G.face([cen_b, bot[b], bot[a]])
        G.face([top[a], top[b], bot[b], bot[a]])


# ---------------------------------------------------------------- assemble the mesh
G = Geo()
add_body(G)
add_head_details(G)
add_dorsal(G)
add_flipper(G, -1)
add_flipper(G, 1)
add_flukes(G)

me = bpy.data.meshes.new('Humpback whale | mesh')
me.from_pydata(G.v, [], G.f)
me.update()
mesh_mat = bpy.data.materials.new('Humpback whale | skin'); mesh_mat.use_nodes = True
nt = mesh_mat.node_tree
bsdf = nt.nodes['Principled BSDF']
bsdf.inputs['Roughness'].default_value = 0.46
vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
me.materials.append(mesh_mat)
ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
for i, d in enumerate(ca.data):
    c = G.c[i]
    d.color = (c[0], c[1], c[2], 1.0)
me.color_attributes.active_color = ca
for p in me.polygons: p.use_smooth = True
body_ob = bpy.data.objects.new('Humpback whale | body', me)
col.objects.link(body_ob)
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
bm.to_mesh(me); bm.free()

# ---------------------------------------------------------------- skeleton
# bone: name, head, tail (metres, +X toward the fluke), parent, weight radius (how far its influence reaches)
BONES = [
    ('Head', (-7.0, 0, 0), (-4.6, 0, 0), None, 1.2),
    ('Chest', (-4.6, 0, 0), (-1.2, 0, 0), 'Head', 1.0),
    ('Mid', (-1.2, 0, 0), (2.2, 0, 0), 'Chest', 0.9),
    ('Rear', (2.2, 0, 0), (5.2, 0, 0), 'Mid', 0.8),
    ('Tail', (5.2, 0, 0), (7.0, 0, 0), 'Rear', 0.6),
    ('Fluke', (7.0, 0, 0), (8.9, 0, 0), 'Tail', 0.8),
    ('ArmL', (-3.9, -1.45, -0.35), (-2.7, -3.3, -0.6), 'Chest', 0.7),
    ('ForeL', (-2.7, -3.3, -0.6), (-1.1, -5.6, -0.95), 'ArmL', 0.6),
    ('ArmR', (-3.9, 1.45, -0.35), (-2.7, 3.3, -0.6), 'Chest', 0.7),
    ('ForeR', (-2.7, 3.3, -0.6), (-1.1, 5.6, -0.95), 'ArmR', 0.6),
]
BONE_NAMES = [b[0] for b in BONES]
arm_data = bpy.data.armatures.new('Humpback whale | skeleton')
arm = bpy.data.objects.new('Humpback whale | rig', arm_data)
col.objects.link(arm)
arm.animation_data_create()
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
ebs = {}
for name, head, tail, parent, _ in BONES:
    eb = arm_data.edit_bones.new(name)
    eb.head = Vector(head); eb.tail = Vector(tail)
    eb.align_roll(Vector((0, 0, 1)))        # local Z points up: pitch is about the local X, yaw about Z, roll about Y
    if parent: eb.parent = ebs[parent]
    ebs[name] = eb
bpy.ops.object.mode_set(mode='OBJECT')
arm.select_set(False)
bpy.context.view_layer.update()


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length


# skin: every vertex follows the nearest bones, the nearest three blended smoothly
for name, head, tail, _, _ in BONES:
    body_ob.vertex_groups.new(name=name)
radius = {b[0]: b[4] for b in BONES}
seg = {b[0]: (Vector(b[1]), Vector(b[2])) for b in BONES}
for i, v in enumerate(me.vertices):
    p = Vector(v.co)
    d = {n: seg_dist(p, *seg[n]) for n in BONE_NAMES}
    best = sorted(BONE_NAMES, key=lambda n: d[n])[:3]
    w = {n: math.exp(-(d[n] / (0.55 * radius[n] + 0.25)) ** 2) for n in best}
    total = sum(w.values()) or 1.0
    for n, wt in w.items():
        body_ob.vertex_groups[n].add([i], wt / total, 'REPLACE')
mod = body_ob.modifiers.new('Humpback deformation', 'ARMATURE'); mod.object = arm
body_ob.parent = arm


# ---------------------------------------------------------------- motion
def pose_rest(t):
    return {}


def swim(T, amp):
    """Vertical fluke strokes; the wave runs from the body to the fluke, with a little flipper sway."""
    w = TAU / T
    def f(t):
        ph = w * t
        p = {}
        p[('Fluke', 'pitch')] = amp * math.sin(ph)
        p[('Tail', 'pitch')] = 0.55 * amp * math.sin(ph - 0.7)
        p[('Rear', 'pitch')] = 0.25 * amp * math.sin(ph - 0.35)
        p[('Mid', 'pitch')] = 0.06 * amp * math.sin(ph - 0.12)
        p[('Chest', 'pitch')] = 0.03 * math.sin(ph + 0.4)
        p[('Head', 'pitch')] = 0.035 * math.sin(ph + 0.9)
        for side, sg in (('L', 1), ('R', -1)):
            p[('Arm' + side, 'pitch')] = 0.10 + 0.07 * math.sin(ph + math.pi)
            p[('Fore' + side, 'pitch')] = 0.06 * math.sin(ph + math.pi + 0.5)
            p[('Arm' + side, 'yaw')] = sg * 0.05 * math.sin(ph)
        return p
    return f


def surface_blow(t):
    p = {}
    p[('Head', 'pitch')] = -0.55 * win(t, 0.2, 4.6, 0.8)
    p[('Chest', 'pitch')] = -0.25 * win(t, 0.3, 4.5, 0.9)
    p[('Mid', 'pitch')] = -0.05 * win(t, 0.4, 4.4, 0.9)
    p[('Chest', 'pitch')] += 0.05 * win(t, 1.4, 1.9, 0.15)       # the exhale jerks the forebody
    for side in ('L', 'R'):
        p[('Arm' + side, 'pitch')] = 0.05 * math.sin(t * 1.3)
    return p


def dive_fluke(t):
    arch = win(t, 0.2, 3.0, 0.7)
    p = {}
    p[('Chest', 'pitch')] = 0.18 * arch
    p[('Mid', 'pitch')] = 0.22 * arch
    p[('Rear', 'pitch')] = 0.28 * arch
    p[('Head', 'pitch')] = 0.20 * arch
    p[('Fluke', 'pitch')] = 1.25 * sstep(0.9, 2.1, t) * (1 - sstep(3.4, 4.6, t))
    return p


def breach(t):
    """Launch from below, rise nose-first and roll onto the side, spread the flippers, then fall back and slap."""
    up = sstep(0.10, 1.0, t) * (1 - sstep(2.6, 3.2, t))
    down = sstep(2.9, 3.6, t) * (1 - sstep(4.0, 4.6, t))
    p = {}
    p[('Fluke', 'pitch')] = -0.9 * win(t, 0.0, 0.45, 0.2) + 0.9 * sstep(3.6, 4.1, t) * (1 - sstep(4.3, 4.6, t))
    p[('Tail', 'pitch')] = -0.20 * up + 0.20 * down
    p[('Head', 'pitch')] = -0.75 * up + 0.50 * down
    p[('Chest', 'pitch')] = -0.40 * up + 0.25 * down
    p[('Mid', 'roll')] = 0.85 * win(t, 0.8, 3.3, 0.5)
    p[('Chest', 'roll')] = 0.50 * win(t, 0.9, 3.2, 0.5)
    for side in ('L', 'R'):
        p[('Arm' + side, 'pitch')] = 0.65 * win(t, 0.9, 3.2, 0.4) - 0.75 * win(t, 3.5, 3.9, 0.12)
        p[('Fore' + side, 'pitch')] = 0.30 * win(t, 1.0, 3.1, 0.4)
    return p


def pec_slap(t):
    slap = win(t, 0.35, 0.75, 0.12) + 0.8 * win(t, 1.10, 1.55, 0.12)
    p = {}
    p[('Chest', 'pitch')] = -0.12 * win(t, 0.3, 1.7, 0.3)
    for side in ('L', 'R'):
        p[('Arm' + side, 'pitch')] = -0.70 * slap
        p[('Fore' + side, 'pitch')] = -0.25 * slap
    return p


def idle_float(T):
    w = TAU / T
    def f(t):
        ph = w * t
        return {
            ('Fluke', 'pitch'): 0.05 * math.sin(ph),
            ('Chest', 'pitch'): 0.02 * math.sin(ph) - 0.02,
            ('Head', 'pitch'): 0.02 * math.sin(ph + 1.0),
            ('ArmL', 'pitch'): 0.04 * math.sin(ph + 2.0),
            ('ArmR', 'pitch'): 0.04 * math.sin(ph + 2.4),
        }
    return f


CLIPS = [
    ('Swim_Slow', 5.0, True, swim(5.0, 0.22)),
    ('Swim_Cruise', 3.4, True, swim(3.4, 0.42)),
    ('Swim_Fast', 1.9, True, swim(1.9, 0.70)),
    ('Idle_Float', 6.0, True, idle_float(6.0)),
    ('Surface_Blow', 5.0, False, surface_blow),
    ('Pec_Slap', 2.4, False, pec_slap),
    ('Dive_Fluke', 4.6, False, dive_fluke),
    ('Breach', 4.6, False, breach),
]
ONE_SHOT = {'Surface_Blow', 'Pec_Slap', 'Dive_Fluke', 'Breach'}


def bake(name, T, loop, fn):
    n = int(round(T * FPS))
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    for f_idx in range(1, n + 2):
        t = (f_idx - 1) / FPS
        vals = fn(min(t, T)) if not loop else fn(t)
        for b in BONE_NAMES:
            pb = arm.pose.bones[b]
            pb.rotation_mode = 'XYZ'
            pb.rotation_euler = (vals.get((b, 'pitch'), 0.0), vals.get((b, 'roll'), 0.0), vals.get((b, 'yaw'), 0.0))
            for ax in range(3):
                pb.keyframe_insert(data_path='rotation_euler', index=ax, frame=f_idx, group=b)
    act.use_cyclic = loop
    act['looping'] = loop
    act['description'] = 'Humpback whale motion clip. Travel comes from the game path; the body, fins and fluke are baked here.'
    arm.animation_data.action = None
    track = arm.animation_data.nla_tracks.new(); track.name = name
    strip = track.strips.new(name, 1, act)
    strip.action_frame_start = 1; strip.action_frame_end = n + 1; strip.blend_type = 'REPLACE'
    for pb in arm.pose.bones: pb.rotation_euler = (0.0, 0.0, 0.0)
    return act


for name, T, loop, fn in CLIPS:
    bake(name, T, loop, fn)
    print('[whale] baked %s (%.1f s, %s)' % (name, T, 'loop' if loop else 'one shot'))


# ---------------------------------------------------------------- stage renders for review (not exported)
def clip_frame(clip_name, t):
    """Frame on the NLA timeline for time t into a clip that starts at frame 1."""
    return 1 + int(round(t * FPS))


def set_clip(name):
    for tr in arm.animation_data.nla_tracks:
        tr.mute = tr.name != name
    arm.animation_data.action = None


world = bpy.data.worlds.new('Open sea studio'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.20, 0.36, 0.42, 1); bg.inputs['Strength'].default_value = 0.9
sun = bpy.data.lights.new('Key sun', 'SUN'); sun.energy = 3.4; sun.angle = 0.02
sun_ob = bpy.data.objects.new('Key sun', sun); stage.objects.link(sun_ob); sun_ob.rotation_euler = (math.radians(55), 0, math.radians(-35))
cam_data = bpy.data.cameras.new('Review camera'); cam_data.lens = 35
cam = bpy.data.objects.new('Review camera', cam_data); stage.objects.link(cam)
scene.camera = cam
scene.render.engine = 'CYCLES'; scene.cycles.samples = 24
scene.render.resolution_x = 960; scene.render.resolution_y = 420
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
os.makedirs(RENDER_DIR, exist_ok=True)


def render_shot(label, clip, t, cam_loc, target):
    set_clip(clip)
    cam.location = cam_loc
    cam.rotation_euler = (Vector(target) - Vector(cam_loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.frame_set(clip_frame(clip, t))
    scene.render.filepath = os.path.join(RENDER_DIR, label + '.png')
    bpy.ops.render.render(write_still=True)


if os.environ.get('WHALE_RENDER', '1') == '1':
    side_cam = (-6.0, -26.0, 4.0)
    shots = [
        ('rest_side', 'Idle_Float', 1.0, side_cam, (0.5, 0, 0.2)),
        ('cruise_side', 'Swim_Cruise', 0.9, side_cam, (0.5, 0, 0.2)),
        ('blow_side', 'Surface_Blow', 1.8, side_cam, (-1.0, 0, 0.8)),
        ('breach_side', 'Breach', 1.7, (-8.0, -52.0, 8.0), (0.0, 0, 2.5)),
        ('dive_side', 'Dive_Fluke', 2.0, side_cam, (1.0, 0, 0.2)),
    ]
    for label, clip, t, loc, tgt in shots:
        render_shot(label, clip, t, loc, tgt)
        print('[whale] rendered', label)
    # restore the full NLA set for export
    for tr in arm.animation_data.nla_tracks: tr.mute = False

# ---------------------------------------------------------------- save and export
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='DESELECT')
for ob in col.objects: ob.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, use_active_scene=True,
                          export_apply=False, export_animations=True, export_animation_mode='NLA_TRACKS', export_yup=True,
                          export_vertex_color='ACTIVE', export_skins=True, export_normals=True, export_influence_nb=4)
print('[whale] exported', OUT_GLB)
