# The barn owl (Tyto alba), built procedurally in Blender. Owl space: metres, Z up, front = -Y, body centre at the origin, about 34 cm from
# beak to tail and a 90 cm wingspan; feet hang to about z = -0.19. Every part is named ow_*. Rigid parts hang off a tree of empties the game
# animates: body, head (it turns very far), tail, two broad wings (shoulder > hand, flapped about the forward axis) and two legs (hip > knee).
#   blender --background --factory-startup --python owl_build.py
import sys, importlib
sys.path.insert(0, r'D:\Paradise Island\blender')
import creature_lib
importlib.reload(creature_lib)
from creature_lib import *

clear_scene()


def yloft(S, prof, n=26):
    S.loft([((0.0, y, z), (rx, 0, 0), (0, 0, rz)) for y, z, rx, rz in prof], n=n)


root = empty('ow_root', (0, 0, 0))
body = empty('ow_body', (0, 0, 0), root)

# ------------------------------------------------------------------ body: a full, soft chest tapering to a short tail base
S = Soup()
yloft(S, [
    (-0.122, 0.012, 0.018, 0.020),
    (-0.100, 0.012, 0.048, 0.050),
    (-0.060, 0.008, 0.070, 0.068),
    (-0.010, 0.002, 0.075, 0.070),
    (0.040, -0.003, 0.068, 0.064),
    (0.095, -0.008, 0.052, 0.049),
    (0.150, -0.013, 0.031, 0.029),
    (0.195, -0.016, 0.018, 0.017),
    (0.222, -0.018, 0.007, 0.007),
])
b_ob = S.to_object('ow_body_mesh')
remesh(b_ob, 0.0030, 2)
displace(b_ob, lambda co, nr: 0.0016 * np.array([noise.noise(V((a * 70, b * 70, c * 70))) for a, b, c in co]))       # feather texture
decimate_to(b_ob, 3400)
attach(b_ob, body)

# ------------------------------------------------------------------ head: broad and rounded, the heart-shaped facial disc, a small hooked beak, deep dark eyes
HEAD = V((0, -0.125, 0.034))
head = empty('ow_head', HEAD, body)
Hd = Soup()
Hd.sphere((0, -0.140, 0.036), (0.058, 0.045, 0.050), lat=14, lon=20)
Hd.sphere((0, -0.128, 0.020), (0.050, 0.048, 0.046), lat=10, lon=14)             # the throat under it
part(Hd, 'ow_head_mesh', head, voxel=0.0028, smooth=2, target=1500)

Fc = Soup()
for s in (-1, 1):                                                                # two flat lobes make the heart
    Fc.sphere((s * 0.027, -0.172, 0.034), (0.041, 0.016, 0.046), rot=(0.0, 0.0, s * 0.18), lat=10, lon=16)
Fc.sphere((0, -0.174, 0.056), (0.018, 0.013, 0.020), lat=8, lon=12)               # the dip of the heart over the beak
part(Fc, 'ow_face_mesh', head, voxel=0.0026, smooth=2, target=1100)

Ey = Soup()
for s in (-1, 1):
    Ey.sphere((s * 0.027, -0.181, 0.042), 0.0105, lat=10, lon=12)
part(Ey, 'ow_eye_mesh', head)

Bk = Soup()
Bk.rod([V((0, -0.184, 0.028)), V((0, -0.198, 0.022)), V((0, -0.2085, 0.0155)), V((0, -0.213, 0.0085))], [0.0095, 0.0075, 0.0045, 0.0015], n=8, flat=(0.85, 1.0))
part(Bk, 'ow_beak_mesh', head, voxel=0.0012, smooth=1, target=240)

# ------------------------------------------------------------------ tail: short, square, flat
tail = empty('ow_tail', (0, 0.15, -0.012), body)
Tl = Soup()
yloft(Tl, [(0.15, -0.012, 0.022, 0.012), (0.19, -0.016, 0.034, 0.007), (0.24, -0.020, 0.048, 0.004), (0.288, -0.022, 0.054, 0.003), (0.300, -0.0225, 0.052, 0.0025)], n=16)
part(Tl, 'ow_tail_mesh', tail, voxel=0.0022, smooth=1, target=600)

# ------------------------------------------------------------------ legs: long, feathered to the toes, pale; hip then knee
for s, nm in ((-1, 'N'), (1, 'P')):
    hipP = V((s * 0.038, 0.002, -0.050)); kneeP = V((s * 0.040, -0.016, -0.100)); ankP = V((s * 0.040, -0.010, -0.150))
    hip = empty(f'ow_leg{nm}', hipP, body)
    kn = empty(f'ow_knee{nm}', kneeP, hip)
    U = Soup(); U.rod([hipP, (hipP + kneeP) / 2 + V((0, -0.004, 0)), kneeP], [0.030, 0.026, 0.019], n=12)
    part(U, f'ow_up{nm}_mesh', hip, voxel=0.0024, smooth=1, target=500)
    L = Soup(); L.rod([kneeP, (kneeP + ankP) / 2, ankP], [0.0125, 0.0100, 0.0088], n=10)
    for dy, dx in ((-0.046, 0.0), (-0.040, -0.016), (-0.040, 0.016)):               # three toes forward
        L.rod([ankP, ankP + V((s * dx, dy * 0.5, -0.006)), ankP + V((s * dx, dy, -0.010))], [0.0052, 0.0042, 0.0030], n=6)
    L.rod([ankP, ankP + V((0, 0.024, -0.008))], [0.0050, 0.0030], n=6)               # the hind toe
    part(L, f'ow_low{nm}_mesh', kn, voxel=0.0013, smooth=1, target=520)
    C = Soup()                                                                         # dark curved claws
    for dy, dx in ((-0.046, 0.0), (-0.040, -0.016), (-0.040, 0.016)):
        tip = ankP + V((s * dx, dy, -0.010))
        C.rod([tip, tip + V((s * dx * 0.2, dy * 0.14, -0.006)), tip + V((s * dx * 0.3, dy * 0.2, -0.016))], [0.0028, 0.0020, 0.0004], n=5)
    C.rod([ankP + V((0, 0.024, -0.008)), ankP + V((0, 0.030, -0.018))], [0.0026, 0.0004], n=5)
    part(C, f'ow_claw{nm}_mesh', kn)

# ------------------------------------------------------------------ wings: broad and rounded, held on a shoulder joint with a hand joint at the bend
def xloft(S, rows, n=16):
    """loft along X: rows (x, y, z, chord, thick)"""
    S.loft([((x, y, z), (0, ch, 0), (0, 0, th)) for x, y, z, ch, th in rows], n=n)


for s, nm in ((-1, 'N'), (1, 'P')):
    shoulder = empty(f'ow_wing{nm}', V((s * 0.052, -0.020, 0.032)), body)
    hand = empty(f'ow_hand{nm}', V((s * 0.240, 0.004, 0.027)), shoulder)
    Am = Soup()
    xloft(Am, [(s * 0.040, -0.010, 0.030, 0.050, 0.020), (s * 0.100, 0.004, 0.030, 0.100, 0.015), (s * 0.170, 0.012, 0.029, 0.112, 0.010), (s * 0.245, 0.018, 0.027, 0.110, 0.007)])
    part(Am, f'ow_arm{nm}_mesh', shoulder, voxel=0.0024, smooth=1, target=700)
    Hn = Soup()
    xloft(Hn, [(s * 0.235, 0.018, 0.027, 0.110, 0.007), (s * 0.300, 0.034, 0.025, 0.112, 0.0055), (s * 0.370, 0.056, 0.022, 0.092, 0.0042),
               (s * 0.430, 0.084, 0.019, 0.062, 0.0032), (s * 0.466, 0.112, 0.016, 0.030, 0.0022), (s * 0.480, 0.128, 0.015, 0.010, 0.0015)])
    for k in range(5):                                                               # the fingered tips of the primaries
        a = k / 4
        Hn.rod([V((s * (0.385 + 0.02 * a), 0.07 + 0.01 * a, 0.020)), V((s * (0.44 + 0.012 * a), 0.12 + 0.02 * a, 0.018)), V((s * (0.468 + 0.004 * a), 0.16 + 0.03 * a - 0.008 * a * a, 0.016))],
               [0.010, 0.008, 0.002], n=6, flat=(1.0, 0.25))
    part(Hn, f'ow_hand{nm}_mesh', hand, voxel=0.0020, smooth=1, target=900)

# ------------------------------------------------------------------ colour: golden buff back, white underparts and heart-shaped face
def colour(nm, co, ob):
    N = len(co)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    ax = np.abs(x)
    n1 = nz(co, 28); n2 = nz(co, 110, 2.7); n3 = nz(co, 260, 5.1)
    buff = np.tile(lin('#c68f4f'), (N, 1)); gold = np.tile(lin('#d8a45c'), (N, 1)); grey = np.tile(lin('#a7a8a2'), (N, 1)); white = np.tile(lin('#f6f1e6'), (N, 1))
    dark = np.tile(lin('#6b5538'), (N, 1)); tan = np.tile(lin('#c8944f'), (N, 1))
    if nm == 'ow_eye_mesh': return np.tile(lin('#07060a'), (N, 1))
    if nm == 'ow_beak_mesh': return mix(np.tile(lin('#e6d9b9'), (N, 1)), np.tile(lin('#b9a888'), (N, 1)), ss(-0.20, -0.222, y))
    if nm.startswith('ow_claw'): return np.tile(lin('#2c2620'), (N, 1))
    if nm.startswith('ow_low'):
        c = mix(np.tile(lin('#efe4cf'), (N, 1)), np.tile(lin('#d2b995'), (N, 1)), np.clip(n2, 0, 1))
        return mix(c, np.tile(lin('#c9b38f'), (N, 1)), ss(-0.14, -0.16, z) * 0.0)
    if nm.startswith('ow_up'): return mix(white, np.tile(lin('#ebe0cb'), (N, 1)), n2)
    if nm == 'ow_face_mesh':
        # heart: white in the middle of each lobe, a tan rim, a darker rust line at the edge, and a dark brow round each eye
        d = np.minimum(np.hypot((ax - 0.027) * 1.05, (z - 0.034) * 0.95), 0.1)
        rim = ss(0.026, 0.046, d)
        c = mix(white, tan, rim * 0.85)
        c = mix(c, np.tile(lin('#8a5c33'), (N, 1)), ss(0.044, 0.052, d) * 0.6)
        de = np.hypot(ax - 0.027, (z - 0.042) * 1.1)
        c = mix(c, np.tile(lin('#5b4630'), (N, 1)), ss(0.020, 0.012, de) * 0.8)
        return c
    if nm == 'ow_head_mesh':
        top = ss(0.03, 0.075, z)
        c = mix(white, buff, top * 0.95)
        c = mix(c, grey, np.clip(n2 * 0.5, 0, 1) * top)
        return mix(c, white, ss(-0.15, -0.17, y) * 0.8)
    if nm == 'ow_tail_mesh':
        bars = ss(0.45, 0.55, 0.5 + 0.5 * np.sin(y * 105))
        c = mix(buff, grey, np.clip(n2 * 0.7, 0, 1))
        c = mix(c, dark, bars * 0.55)
        return mix(c, white, ss(0.285, 0.298, y) * 0.8)
    if nm.startswith('ow_arm') or nm.startswith('ow_hand'):
        zc = 0.028 - 0.012 * ss(0.0, 0.2, y)
        up = ss(zc - 0.002, zc + 0.002, z)                         # the upper side: buff and grey with bars; the underside: white
        bars = ss(0.45, 0.55, 0.5 + 0.5 * np.sin(y * 150 + ax * 20))
        topc = mix(gold, grey, np.clip(ss(0.3, 0.46, ax) * 0.7 + n2 * 0.25, 0, 1))
        topc = mix(topc, dark, bars * 0.30 * ss(0.12, 0.3, ax))
        under = mix(white, np.tile(lin('#e9dfc9'), (N, 1)), n2 * 0.6)
        under = mix(under, np.tile(lin('#9a8f7c'), (N, 1)), ss(0.43, 0.48, ax) * 0.7)
        return mix(under, topc, up)
    # body: upper parts golden buff with grey vermiculation and pale and dark flecks; underparts white with a few dark spots
    t = ss(-0.012, 0.022, z)
    back = mix(buff, gold, n1)
    back = mix(back, grey, np.clip(n2 * 0.8, 0, 1) * 0.6)
    back = mix(back, white, ss(0.70, 0.74, n3) * 0.7)
    back = mix(back, dark, ss(0.78, 0.82, n3) * 0.6)
    front = mix(white, np.tile(lin('#efe6d2'), (N, 1)), n1)
    front = mix(front, np.tile(lin('#4b3a28'), (N, 1)), ss(0.86, 0.9, n3) * 0.7)
    return mix(front, back, t)


paint('ow_', colour)

size = export('ow_', 'ow_root', 'barn_owl.glb')
out = {'bytes': size, **report('ow_')}
E = bpy.data.objects
for ob in bpy.data.objects:
    if ob.type == 'MESH' and not ob.name.startswith('ow_'):
        ob.hide_render = True


def rest():
    for o in bpy.data.objects:
        if o.name.startswith('ow_') and o.type == 'EMPTY':
            o.rotation_mode = 'XYZ'; o.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()


def wings(up):
    for s, nm in ((-1, 'N'), (1, 'P')):
        E['ow_wing' + nm].rotation_euler = (0, -s * up, 0)
        E['ow_hand' + nm].rotation_euler = (0, -s * up * 0.4, 0)
    bpy.context.view_layer.update()


setup_render((700, 600))
rest()
out['side'] = shot('owl_side', (1.2, 0, 0.0), (0, 0, 0.0), ortho=0.7)
out['top'] = shot('owl_top', (0, 0.0, 1.2), (0, 0.04, 0.0), ortho=1.05, res=(800, 600))
out['front'] = shot('owl_front', (0, -1.0, 0.03), (0, 0, 0.03), ortho=0.5, res=(600, 600))
out['face'] = shot('owl_face', (0.12, -0.5, 0.07), (0, -0.17, 0.04), lens=85, res=(800, 700))
out['three'] = shot('owl_three', (0.7, -0.75, 0.35), (0, 0.0, 0.0), lens=50, res=(800, 700))
wings(0.8); out['up'] = shot('owl_up', (0, -1.1, 0.1), (0, 0, 0.1), ortho=1.2, res=(800, 600))
rest()
E['ow_body'].rotation_euler = (-1.15, 0, 0)
E['ow_legN'].rotation_euler = (0.9, 0, 0); E['ow_legP'].rotation_euler = (0.9, 0, 0)
bpy.context.view_layer.update()
out['perch'] = shot('owl_perch', (1.2, 0, -0.02), (0, 0, -0.02), ortho=0.6, res=(600, 700))
rest()
print('OWL', out)
