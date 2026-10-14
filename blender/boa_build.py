# The Pacific boa (Candoia bibroni), built procedurally in Blender. Boa space: metres, Z up, head toward -Y, lying straight along Y with its
# belly on z = 0 (about 1.2 m long, 5.7 cm across at the thickest). Every part is named bd_*. The body is a chain of 32 joints bd_s0 ... bd_s31 (each
# carries a short body piece bd_m<i> centred on its joint, so the game can bend the chain into waves and coils and swell single pieces as prey
# is swallowed); the head sits on bd_head (it can lift and turn), with a lower jaw bd_jaw that opens and a forked tongue bd_tongue that flicks.
#   blender --background --factory-startup --python boa_build.py
import sys, importlib
sys.path.insert(0, r'D:\Paradise Island\blender')
import creature_lib
importlib.reload(creature_lib)
from creature_lib import *

clear_scene()
N = 32
Y0 = -0.585                    # the neck joint: the head is in front of it
LEN = 1.185                    # neck joint to tail tip
L = LEN / N
ZC = 0.030                     # the body axis height (the belly rests on z = 0)


def radius(f):
    """body half-width along the length: slim neck, a stout middle, a quick taper to the tail tip"""
    neck = 0.0148 + (0.0290 - 0.0148) * ss(0.0, 0.30, np.array([f]))[0]
    tail = 1.0 - ss(0.52, 1.0, np.array([f]))[0] ** 0.85
    return max(0.0022, neck * tail)


root = empty('bd_root', (0, 0, 0))
joints = []
prev = root
for i in range(N):
    j = empty(f'bd_s{i}', V((0, Y0 + i * L, ZC)), prev)
    joints.append(j); prev = j

for i in range(N):
    ya, yb = Y0 + i * L, Y0 + (i + 1) * L
    ra, rb = radius(i / N), radius((i + 1) / N)
    S = Soup()
    ym = (ya + yb) / 2
    S.rod([V((0, ya - 0.0035, ZC)), V((0, ym, ZC)), V((0, yb + 0.0035, ZC))], [ra, (ra + rb) / 2, rb], n=16, flat=(1.0, 0.94))
    S.sphere((0, yb, ZC), (rb * 1.0, rb * 1.0, rb * 0.94), lat=8, lon=16)                  # the round of the joint, so a bend leaves no gap
    ob = S.to_object(f'bd_m{i}_mesh')
    ob.name = f'bd_m{i}'
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth()
    j = joints[i]
    ob.data.transform(Matrix.Translation(-j.location)); ob.data.update()                    # the piece is centred on its joint, so scaling it swells it in place
    ob.location = j.location
    attach(ob, j)

# ------------------------------------------------------------------ head: a wedge, wider behind the eyes, with a blunt snout, golden eyes with slit pupils
head = empty('bd_head', V((0, Y0, ZC)), joints[0])
H = Soup()
H.loft([((0.0, y, ZC + dz), (rx, 0, 0), (0, 0, rz)) for y, dz, rx, rz in [
    (-0.578, 0.0, 0.0150, 0.0130),
    (-0.592, 0.0004, 0.0190, 0.0132),
    (-0.606, 0.0008, 0.0196, 0.0126),
    (-0.622, 0.0006, 0.0160, 0.0108),
    (-0.640, 0.0001, 0.0112, 0.0086),
    (-0.654, -0.0006, 0.0074, 0.0066),
    (-0.662, -0.0010, 0.0042, 0.0040),
]], n=22)
H.sphere((0, -0.664, ZC - 0.001), (0.0042, 0.0040, 0.0034), lat=8, lon=10)
for s in (-1, 1):                                                                           # the brow ridge over each eye
    H.sphere((s * 0.0128, -0.6275, ZC + 0.0074), (0.0044, 0.0085, 0.0020), lat=8, lon=10)
h_ob = part(H, 'bd_head_mesh', head, voxel=0.0011, smooth=2, target=1800)

Ey = Soup()
for s in (-1, 1):
    Ey.sphere((s * 0.0122, -0.6285, ZC + 0.0050), (0.0028, 0.0034, 0.0034), lat=10, lon=12)
part(Ey, 'bd_eye_mesh', head)

Nr = Soup()
for s in (-1, 1):
    Nr.sphere((s * 0.0030, -0.6548, ZC + 0.0036), 0.0011, lat=6, lon=8)
part(Nr, 'bd_nostril_mesh', head)

JAWP = V((0, -0.604, ZC - 0.0072))
jaw = empty('bd_jaw', JAWP, head)
Jw = Soup()
Jw.loft([((0.0, y, ZC - 0.0085 + dz), (rx, 0, 0), (0, 0, rz)) for y, dz, rx, rz in [
    (-0.600, 0.0, 0.0135, 0.0050), (-0.616, 0.0005, 0.0128, 0.0046), (-0.634, 0.0010, 0.0098, 0.0040), (-0.650, 0.0012, 0.0062, 0.0034), (-0.660, 0.0012, 0.0030, 0.0026),
]], n=16)
part(Jw, 'bd_jaw_mesh', jaw, voxel=0.0010, smooth=1, target=500)

tongue = empty('bd_tongue', V((0, -0.659, ZC - 0.0040)), head)
Tg = Soup()
Tg.rod([V((0, -0.659, ZC - 0.0040)), V((0, -0.690, ZC - 0.0042)), V((0, -0.708, ZC - 0.0042))], [0.0009, 0.0008, 0.0006], n=5)
for s in (-1, 1):
    Tg.rod([V((0, -0.708, ZC - 0.0042)), V((s * 0.0035, -0.724, ZC - 0.0040)), V((s * 0.0065, -0.736, ZC - 0.0038))], [0.0006, 0.0005, 0.0002], n=5)
part(Tg, 'bd_tongue_mesh', tongue)

# ------------------------------------------------------------------ colour: tan-brown with dark chestnut saddles, cream flank spots, cream belly
def colour(nm, co, ob):
    N_ = len(co)
    if nm.startswith('bd_m'):
        co = co + np.array(ob.location)                                                       # the pieces are centred on their joints: paint in the world frame
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    dz = z - ZC
    n1 = nz(co, 60); n2 = nz(co, 190, 2.2)
    base = mix(np.tile(lin('#8d6c47'), (N_, 1)), np.tile(lin('#a98354'), (N_, 1)), np.clip(0.2 + 0.7 * n1, 0, 1))
    dark = np.tile(lin('#47311f'), (N_, 1)); cream = np.tile(lin('#dccaa2'), (N_, 1)); flank = np.tile(lin('#cdb07c'), (N_, 1))
    if nm == 'bd_eye_mesh':
        c = np.tile(lin('#d8a62c'), (N_, 1))
        slit = ss(0.0011, 0.0005, np.abs(y + 0.6285)) * ss(0.0140, 0.0150, np.abs(x))             # the vertical slit of the pupil, on the outer face of each eye
        return mix(c, np.tile(lin('#0b0805'), (N_, 1)), slit)
    if nm == 'bd_nostril_mesh': return np.tile(lin('#120d09'), (N_, 1))
    if nm == 'bd_tongue_mesh': return mix(np.tile(lin('#3a1418'), (N_, 1)), np.tile(lin('#0f0a0a'), (N_, 1)), ss(-0.69, -0.72, y))
    if nm == 'bd_jaw_mesh':
        return mix(cream, np.tile(lin('#cdb98f'), (N_, 1)), np.clip(n1, 0, 1) * 0.5)
    if nm == 'bd_head_mesh':
        c = mix(np.tile(lin('#7b5b3a'), (N_, 1)), np.tile(lin('#5a4128'), (N_, 1)), np.clip(0.25 + 0.7 * n1, 0, 1))
        c = mix(c, cream, ss(-0.002, -0.008, dz) * 0.95)                                  # pale throat and lip
        streak = ss(0.006, 0.003, np.abs(dz - 0.003)) * ss(0.008, 0.012, np.abs(x)) * ss(-0.600, -0.612, y) * ss(-0.655, -0.642, y)
        c = mix(c, np.tile(lin('#2d1f14'), (N_, 1)), streak * 0.85)                      # the dark streak back from each eye
        return mix(c, np.tile(lin('#a8885c'), (N_, 1)), ss(0.002, 0.012, dz) * np.clip(n2, 0, 1) * 0.4)
    # body pieces
    p = np.mod((y - Y0) / 0.092, 1.0)
    saddle = ss(0.12, 0.26, p) * ss(0.88, 0.74, p) * ss(-0.002, 0.014, dz)               # chestnut saddles down the back
    c = mix(base, dark, saddle * 0.92)
    c = mix(c, np.tile(lin('#2e2016'), (N_, 1)), ss(0.30, 0.15, np.abs(p - 0.5)) * saddle * 0.25 * 0)
    spot = ss(0.80, 0.86, n2) * ss(-0.014, -0.004, dz) * ss(0.012, 0.0, dz)             # pale flecks low on the flanks
    c = mix(c, flank, spot * 0.8)
    c = mix(c, cream, ss(-0.009, -0.017, dz))                                             # the cream belly
    c = mix(c, np.tile(lin('#5e4630'), (N_, 1)), ss(0.84, 0.9, (y - Y0) / LEN) * 0.35)  # darker toward the tail
    return c


paint('bd_', colour)
size = export('bd_', 'bd_root', 'pacific_boa.glb')
out = {'bytes': size, **report('bd_')}

E = bpy.data.objects
for ob in bpy.data.objects:
    if ob.type == 'MESH' and not ob.name.startswith('bd_'):
        ob.hide_render = True


def rest():
    for o in bpy.data.objects:
        if o.name.startswith('bd_') and o.type == 'EMPTY':
            o.rotation_mode = 'XYZ'; o.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()


def wave(a, k):
    for i in range(N):
        E[f'bd_s{i}'].rotation_euler = (0, 0, a * math.sin(i * k))
    bpy.context.view_layer.update()


def coil(bend):
    for i in range(N):
        E[f'bd_s{i}'].rotation_euler = (0, 0, bend)
    bpy.context.view_layer.update()


setup_render((900, 500))
rest()
out['side'] = shot('boa_side', (1.6, -0.0, 0.03), (0, 0.0, 0.03), ortho=1.7, res=(1100, 420))
out['head'] = shot('boa_head', (0.16, -0.78, 0.07), (0, -0.62, 0.03), lens=85, res=(800, 600))
out['headtop'] = shot('boa_headtop', (0, -0.63, 0.5), (0, -0.63, 0.0), ortho=0.14, res=(700, 600))
wave(0.32, 0.55)
out['wave'] = shot('boa_wave', (0, 0.0, 2.0), (0, 0.0, 0.0), ortho=1.6, res=(900, 700))
coil(0.42)
out['coil'] = shot('boa_coil', (0, 0.0, 1.2), (0, 0.0, 0.0), ortho=0.7, res=(700, 700))
rest()
print('BOA', {k: (v if not isinstance(v, str) else v[-18:]) for k, v in out.items()})
