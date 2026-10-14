# The island rat (Polynesian rat, Rattus exulans), built procedurally in Blender. Rat space: metres, Z up, front = -Y, feet on z = 0, about 15 cm
# of body and a 15 cm tail. Every part is named rt_*. Rigid parts hang off a tree of empties the game animates: body (pivoting at the hips, so it
# can sit up), head (sniffing), ears, a three-joint tail, and four two-joint legs.
#   blender --background --factory-startup --python rat_build.py
import sys, importlib
sys.path.insert(0, r'D:\Paradise Island\blender')
import creature_lib
importlib.reload(creature_lib)
from creature_lib import *

clear_scene()


def yloft(S, prof, n=22):
    """body section loft along Y (front is -Y): rows (y, z, rx, rz)"""
    S.loft([((0.0, y, z), (rx, 0, 0), (0, 0, rz)) for y, z, rx, rz in prof], n=n)


root = empty('rt_root', (0, 0, 0))
body = empty('rt_body', (0, 0.03, 0.03), root)            # pivot at the hips: the front of the body lifts when he sits up

# ------------------------------------------------------------------ body: a low, supple spindle
S = Soup()
yloft(S, [
    (0.062, 0.037, 0.005, 0.007),
    (0.054, 0.039, 0.014, 0.017),
    (0.038, 0.043, 0.025, 0.029),
    (0.012, 0.046, 0.030, 0.034),
    (-0.018, 0.048, 0.029, 0.034),
    (-0.044, 0.050, 0.025, 0.031),
    (-0.064, 0.050, 0.019, 0.025),
    (-0.078, 0.050, 0.013, 0.018),
])
b_ob = S.to_object('rt_body_mesh')
remesh(b_ob, 0.0016, 2)
displace(b_ob, lambda co, nr: 0.0007 * (np.array([noise.noise(V((a * 220, b * 220, c * 220))) for a, b, c in co])))     # a little fur lumpiness
decimate_to(b_ob, 2600)
attach(b_ob, body)

# ------------------------------------------------------------------ head: skull, a long pointed snout, ears, eyes, whiskers, teeth
HEAD = V((0, -0.08, 0.05))
head = empty('rt_head', HEAD, body)
Hd = Soup()
Hd.sphere((0, -0.088, 0.0505), (0.0185, 0.023, 0.0185), lat=12, lon=16)
Hd.rod([V((0, -0.098, 0.050)), V((0, -0.114, 0.0475)), V((0, -0.128, 0.0425)), V((0, -0.136, 0.039))], [0.0155, 0.0115, 0.0068, 0.0034], n=12, flat=(1.0, 0.92))
Hd.sphere((0, -0.138, 0.0385), 0.0044, lat=8, lon=10)
h_ob = part(Hd, 'rt_head_mesh', head, voxel=0.0009, smooth=1, target=1400)

Ey = Soup()
for s in (-1, 1):
    Ey.sphere((s * 0.0128, -0.100, 0.0545), 0.0042, lat=8, lon=10)
part(Ey, 'rt_eye_mesh', head)

Te = Soup()
for s in (-1, 1):
    Te.rod([V((s * 0.0016, -0.132, 0.0355)), V((s * 0.0016, -0.1335, 0.0305))], [0.0012, 0.0010], n=6)
part(Te, 'rt_teeth_mesh', head)

Wh = Soup()
for s in (-1, 1):
    for dz, dy in ((0.010, -0.020), (0.0, -0.028), (-0.010, -0.034)):
        Wh.rod([V((s * 0.007, -0.127, 0.041)), V((s * 0.030, -0.133 + dy * 0.2, 0.041 + dz * 0.5)), V((s * 0.052, -0.139 + dy * 0.6, 0.041 + dz * 1.4))], [0.0004, 0.0003, 0.0001], n=4)
part(Wh, 'rt_whisker_mesh', head)

EARS = []
for s, nm in ((-1, 'N'), (1, 'P')):
    ear = empty(f'rt_ear{nm}', V((s * 0.0145, -0.082, 0.062)), head)
    Er = Soup()
    Er.sphere((s * 0.0175, -0.082, 0.0705), (0.0135, 0.0024, 0.0165), rot=(0.25, 0.0, s * 0.55), lat=8, lon=12)
    part(Er, f'rt_ear{nm}_mesh', ear)
    EARS.append(ear)

# ------------------------------------------------------------------ tail: long, tapering, scaly and almost bare; three joints
T0 = V((0, 0.080, 0.036)); TS = [(0.062, 0.036), (0.110, 0.033), (0.155, 0.029), (0.200, 0.024)]
tail_prev = body
for i in range(3):
    j = empty(f'rt_tail{i}', V((0, TS[i][0], TS[i][1])), tail_prev)
    Tl = Soup()
    pts = [V((0, TS[i][0] - (0.004 if i else 0), TS[i][1])), V((0, (TS[i][0] + TS[i + 1][0]) / 2, (TS[i][1] + TS[i + 1][1]) / 2 - 0.0006)), V((0, TS[i + 1][0] + 0.003, TS[i + 1][1]))]
    r0 = [0.0058, 0.0044, 0.0031][i]; r1 = [0.0044, 0.0031, 0.0010][i]
    Tl.rod(pts, [r0, (r0 + r1) / 2, r1], n=10)
    part(Tl, f'rt_tail{i}_mesh', j, voxel=0.0012, smooth=1, target=420)
    tail_prev = j

# ------------------------------------------------------------------ legs: shoulder/hip then elbow/knee; paws with small toes
def paw(S, base, fwd, spread, r=0.0028):
    """a small hand/foot: a pad and four toes fanning toward -Y (forward = fwd)"""
    S.sphere(base, (r * 1.4, r * 1.6, r), lat=6, lon=8)
    for k in range(4):
        a = (k - 1.5) * spread
        tip = V((base[0] + a * 0.5, base[1] + fwd, base[2] - 0.0005))
        S.rod([V(base), tip], [r * 0.6, r * 0.38], n=6)


LEGS = {}
for s, side in ((-1, 'N'), (1, 'P')):
    # front: the shoulder sits at the chest, the elbow back and down, the hand forward on the ground
    sh = V((s * 0.023, -0.040, 0.036)); el = V((s * 0.028, -0.045, 0.017)); wr = V((s * 0.024, -0.062, 0.0045))
    hip = empty(f'rt_hipF{side}', sh, body); kn = empty(f'rt_kneeF{side}', el, hip)
    U = Soup(); U.rod([sh, (sh + el) / 2 + V((s * 0.002, 0.0, 0)), el], [0.0085, 0.0075, 0.006], n=10)
    part(U, f'rt_upF{side}_mesh', hip, voxel=0.0011, smooth=1, target=300)
    Lo = Soup(); Lo.rod([el, (el + wr) / 2, wr], [0.0058, 0.0046, 0.0034], n=8); paw(Lo, (wr.x, wr.y - 0.002, 0.0028), -0.011, 0.0075)
    part(Lo, f'rt_loF{side}_mesh', kn, voxel=0.0008, smooth=1, target=380)
    # rear: a heavy thigh forward and down to the knee, the shin back and down to the heel, a long foot forward along the ground
    hp = V((s * 0.026, 0.034, 0.038)); kp = V((s * 0.032, 0.018, 0.018)); hl = V((s * 0.029, 0.040, 0.0075)); toe = V((s * 0.027, 0.008, 0.0022))
    hipR = empty(f'rt_hipR{side}', hp, root); kneeR = empty(f'rt_kneeR{side}', kp, hipR)
    U2 = Soup(); U2.sphere((s * 0.029, 0.030, 0.032), (0.0125, 0.017, 0.0155), lat=8, lon=12); U2.rod([hp, (hp + kp) / 2, kp], [0.0105, 0.0085, 0.0065], n=10)
    part(U2, f'rt_upR{side}_mesh', hipR, voxel=0.0011, smooth=1, target=420)
    L2 = Soup(); L2.rod([kp, (kp + hl) / 2, hl], [0.0062, 0.0048, 0.0036], n=8)
    L2.rod([hl, (hl + toe) / 2, toe], [0.0034, 0.0030, 0.0026], n=8, flat=(1.0, 0.7))
    for k in range(4):
        L2.rod([toe, V((toe.x + (k - 1.5) * 0.0035, toe.y - 0.011, 0.0012))], [0.0020, 0.0012], n=6)
    part(L2, f'rt_loR{side}_mesh', kneeR, voxel=0.0008, smooth=1, target=420)

# ------------------------------------------------------------------ colour: agouti brown fur, pale belly, pink ears, nose, feet and tail
def colour(nm, co, ob):
    N = len(co)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    n1 = nz(co, 120); n2 = nz(co, 420, 3.1)
    if nm == 'rt_eye_mesh': return np.tile(lin('#0c0a0a'), (N, 1))
    if nm == 'rt_teeth_mesh': return np.tile(lin('#e8dbb0'), (N, 1))
    if nm == 'rt_whisker_mesh': return np.tile(lin('#d9d3c4'), (N, 1))
    if nm.startswith('rt_ear'):
        return mix(np.tile(lin('#c4a094'), (N, 1)), np.tile(lin('#8a6b62'), (N, 1)), np.clip(0.2 + 0.7 * n1, 0, 1))
    if nm.startswith('rt_tail'):
        ring = 0.5 + 0.5 * np.sin(y * 900)
        c = mix(np.tile(lin('#a89488'), (N, 1)), np.tile(lin('#7f6c62'), (N, 1)), np.clip(ring * 0.5 + n1 * 0.4, 0, 1))
        return mix(c, np.tile(lin('#5c4c44'), (N, 1)), ss(0.06, 0.075, z) * 0.0)
    if nm.startswith('rt_loF') or nm.startswith('rt_loR'):
        fur = mix(np.tile(lin('#7a6a58'), (N, 1)), np.tile(lin('#9a8a76'), (N, 1)), n1)
        return mix(fur, np.tile(lin('#cba79c'), (N, 1)), ss(0.014, 0.006, z) * 1.0)          # bare pink feet
    # body, head and upper legs: dark agouti back, tawny flanks, cream belly
    back = mix(np.tile(lin('#3d3128'), (N, 1)), np.tile(lin('#665440'), (N, 1)), np.clip(0.2 + 0.8 * n1, 0, 1))
    flank = mix(np.tile(lin('#8d7a60'), (N, 1)), np.tile(lin('#a8946f'), (N, 1)), n2)
    belly = np.tile(lin('#d4cab6'), (N, 1))
    h = (z - 0.043) / 0.012
    col = mix(back, flank, ss(0.0, 1.0, -h * 0.6 + 0.35))
    col = mix(col, belly, ss(0.0, 0.9, -h - 0.3))
    if nm == 'rt_head_mesh':
        col = mix(col, np.tile(lin('#d89aa0'), (N, 1)), ss(-0.131, -0.140, y))               # the pink nose
        col = mix(col, np.tile(lin('#5a4a3c'), (N, 1)), ss(-0.118, -0.104, y) * 0.0)
    return col


paint('rt_', colour)

# ------------------------------------------------------------------ export and a few previews
size = export('rt_', 'rt_root', 'island_rat.glb')
out = {'bytes': size, **report('rt_')}
E = bpy.data.objects
for ob in bpy.data.objects:
    if ob.type == 'MESH' and not ob.name.startswith('rt_'):
        ob.hide_render = True
setup_render((700, 600))
shot('rat_side', (0.5, 0, 0.04), (0, 0, 0.04), ortho=0.34)
shot('rat_front', (0, -0.5, 0.045), (0, 0, 0.045), ortho=0.24, res=(600, 600))
shot('rat_three', (0.22, -0.28, 0.14), (0, -0.01, 0.04), lens=60, res=(800, 650))
shot('rat_head', (0.07, -0.20, 0.075), (0, -0.115, 0.045), lens=70, res=(800, 650))
shot('rat_top', (0, 0.0, 0.5), (0, 0.0, 0.0), ortho=0.36, res=(600, 600))
print('RAT', out)
