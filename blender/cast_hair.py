# Stage 2: hair, beard, moustache, eyebrows, eyes - strand blades that drape over the head with simple collision.
import bpy, bmesh, math, random
import numpy as np
from mathutils import Vector, bvhtree, noise

V = Vector
rnd = random.Random(7)
body = bpy.data.objects['body']
dg = bpy.context.evaluated_depsgraph_get()
bvh = bvhtree.BVHTree.FromObject(body, dg)
HEAD_C = V((0, 0.01, 1.72))


def srgb2lin(c):
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c)


def hexc(h):
    h = h.lstrip('#')
    return srgb2lin(tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)))


class Blades:
    def __init__(self):
        self.v, self.f, self.c = [], [], []

    def add(self, pts, widths, outward, c_root, c_tip, jitter=0.1):
        """ribbon along pts, width vector = tangent x outward"""
        base = len(self.v)
        n = len(pts)
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
            w = t.cross(outward)
            if w.length < 1e-4:
                w = V((1, 0, 0))
            w.normalize()
            k = i / (n - 1)
            hw = widths[min(i, len(widths) - 1)] * 0.5
            col = tuple(c_root[j] + (c_tip[j] - c_root[j]) * k for j in range(3))
            if i == n - 1:
                self.v.append(p); self.c.append(col)
            else:
                self.v.append(p - w * hw); self.c.append(col)
                self.v.append(p + w * hw); self.c.append(col)
        for i in range(n - 2):
            a = base + i * 2
            self.f.append((a, a + 1, a + 3, a + 2))
        a = base + (n - 2) * 2
        self.f.append((a, a + 1, base + (n - 1) * 2))

    def to_object(self, name, rough=0.8):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(x) for x in self.v], [], [tuple(f) for f in self.f])
        me.update()
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        arr = np.array([c + (1.0,) for c in self.c], dtype=np.float32).reshape(-1)
        ca.data.foreach_set('color', arr)
        me.shade_smooth()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def surface_point(origin, direction):
    hit = bvh.ray_cast(origin, direction, 1.0)
    return hit  # (loc, normal, index, dist) or (None,...)


def drape(root, nrm, length, speed0, side, steps, gravity=1.0, curl=0.0, margin=0.004, wave=0.0, seed=0):
    """integrate a hanging strand: starts leaving the surface, then falls with collision against the body"""
    pos = V(root)
    vel = nrm * speed0 + side
    pts = [pos.copy()]
    seg = length / steps
    for i in range(steps):
        vel += V((0, 0, -0.55 * gravity)) * (seg * 1.0)
        vel *= 0.93
        if vel.length < 1e-5:
            vel = V((0, 0, -seg))
        step = vel.normalized() * seg
        if wave:
            step += V((noise.noise(V((seed, i * 0.7, 3.0))), noise.noise(V((i * 0.7, seed, 9.0))), 0)) * wave * seg
        pos = pos + step
        loc, nm, idx, d = bvh.find_nearest(pos)
        if loc is not None:
            inside = (pos - loc).dot(nm) < margin
            if inside:
                pos = loc + nm * margin
                vel = (vel - nm * vel.dot(nm) * 1.0)
        pts.append(pos.copy())
    return pts


def sample_surface(pred, count, tries=40000):
    out = []
    t = 0
    while len(out) < count and t < tries:
        t += 1
        d = V((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
        o = HEAD_C + d * 0.2
        loc, nm, idx, dist = bvh.ray_cast(o, -d, 0.3)
        if loc is None:
            continue
        if pred(loc, nm):
            out.append((loc, nm))
    return out


# ------------------------------------------------------------------ HAIR
GOLD = [hexc(h) for h in ('#f4de8e', '#edd27a', '#e2c264', '#f7e9b2', '#d4b055', '#c39c44')]
ROOT = hexc('#8a6a2c')
hair = Blades()


def scalp(loc, nm):
    # above the hairline: forehead boundary slopes from ~1.77 at the brow to 1.73 at the temples; wraps behind the ears to the nape
    front = loc.y < -0.03
    if front:
        return loc.z > 1.768 - 0.45 * max(0.0, abs(loc.x) - 0.045)
    return loc.z > 1.605 + 0.0 * loc.x and loc.z > 1.64 - (0.0 if abs(loc.x) > 0.07 else 0.04)


locks = sample_surface(scalp, 720)


def lock_params(loc):
    behind = loc.y > 0.0
    top = loc.z > 1.74 and loc.y < 0.04 and abs(loc.x) < 0.07
    if loc.y < -0.012:
        sx = loc.x if abs(loc.x) > 0.01 else rnd.choice((-1, 1))
        return dict(zone='front', length=rnd.uniform(0.06, 0.1), sweep=V((math.copysign(1.0, sx), 0.7, 0.0)), speed=0.01, grav=0.7)
    if top and loc.y < 0.0:
        return dict(zone='front', length=rnd.uniform(0.075, 0.12), sweep=V((math.copysign(0.7, loc.x if abs(loc.x) > 0.01 else rnd.choice((-1, 1))) * 0.5, 1.0, 0.0)), speed=0.01, grav=0.9)
    if loc.y > 0.03 and loc.z < 1.76:
        return dict(zone='back', length=rnd.uniform(0.15, 0.3) * (0.7 + 0.5 * (1.0 - (loc.z - 1.62) / 0.15 if loc.z < 1.77 else 0.3)), sweep=V((0, 0.2, 0)), speed=0.01, grav=1.2)
    if abs(loc.x) > 0.05:
        return dict(zone='side', length=rnd.uniform(0.1, 0.19), sweep=V((math.copysign(0.2, loc.x), 0.3, 0)), speed=0.011, grav=1.1)
    return dict(zone='crown', length=rnd.uniform(0.09, 0.16), sweep=V((math.copysign(0.5, loc.x if abs(loc.x) > 0.01 else rnd.choice((-1, 1))), 0.8, 0.0)), speed=0.01, grav=0.9)


locks = locks + sample_surface(lambda l, n: l.z > 1.79, 120)      # keep the crown covered
for loc, nm in locks:
    P = lock_params(loc)
    sweep = P['sweep'].normalized() * 0.011 * rnd.uniform(0.6, 1.3) + V((rnd.gauss(0, 0.004), rnd.gauss(0, 0.004), 0))
    base = drape(loc + nm * 0.002, nm, P['length'], P['speed'], sweep, 8, gravity=P['grav'], wave=0.6, seed=rnd.random() * 50)
    outward = (loc - HEAD_C).normalized()
    csl = rnd.choice(GOLD)
    nb = rnd.randint(4, 6)
    outward_dir = (loc - HEAD_C).normalized() + V((0, 0, 0.0))
    for q in range(nb):
        L = rnd.uniform(0.72, 1.12)
        off = V((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))) * 0.0045
        pts = []
        for i, pt in enumerate(base):
            k = i / (len(base) - 1)
            p2 = base[0] + (pt - base[0]) * L
            pts.append(p2 + off * (0.3 + k * 1.3) + (outward_dir * (0.01 * k * k * rnd.uniform(0.3, 1.4))))
        w0 = 0.0085 * rnd.uniform(0.9, 1.5)
        wid = [w0] * 3 + [w0 * 0.85, w0 * 0.7, w0 * 0.52, w0 * 0.34, w0 * 0.15]
        cs = tuple(min(1.0, max(0.0, c * rnd.uniform(0.9, 1.08))) for c in csl)
        hair.add(pts, wid, outward, tuple(x * 0.62 for x in cs), cs)
hair_ob = hair.to_object('hair')

# scalp cap: the hairline patch of the head, inflated a touch so no skin shows between locks
bm = bmesh.new(); bm.from_mesh(body.data); bm.normal_update()
keep = set(f.index for f in bm.faces if scalp(f.calc_center_median(), f.normal))
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
bm.normal_update()
for v in bm.verts:
    v.co += v.normal * 0.0055
cme = bpy.data.meshes.new('haircap'); bm.to_mesh(cme); bm.free()
cca = cme.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
cca.data.foreach_set('color', np.tile(np.array(hexc('#7a5c24') + (1.0,), dtype=np.float32), len(cme.vertices)))
cap_ob = bpy.data.objects.new('haircap', cme); bpy.context.scene.collection.objects.link(cap_ob)


# ------------------------------------------------------------------ BEARD + MOUSTACHE
beard = Blades()
BEARD = [hexc(h) for h in ('#dccd9c', '#cfbf8a', '#ece3c6', '#bdab78', '#eee7d0', '#c9b57e')]


def chin(loc, nm):
    if loc.y > 0.015:
        return False
    jaw = loc.z < 1.652 - 0.01 * max(0.0, 0.05 - abs(loc.x)) / 0.05 and loc.z > 1.588
    if not jaw:
        return False
    if abs(loc.x) < 0.024 and 1.617 < loc.z < 1.652:        # leave the mouth open
        return False
    if abs(loc.x) < 0.033 and loc.z > 1.653:               # nose
        return False
    # cheeks only up to a rough line from ear to nose
    if loc.z > 1.64 and abs(loc.x) < 0.028 and loc.y < -0.08:
        return False
    return abs(loc.x) < 0.085


broots = sample_surface(chin, 900)
for loc, nm in broots:
    cheek = max(0.0, (loc.z - 1.625) / 0.04)
    side = min(1.0, abs(loc.x) / 0.05)
    length = (0.05 + 0.085 * (1 - cheek) * (1 - 0.4 * side)) * rnd.uniform(0.7, 1.2)
    if cheek > 0.5:
        length *= 0.6
    sweep = V((loc.x * 0.2 + rnd.gauss(0, 0.004), -0.008 * (1 - cheek) + rnd.gauss(0, 0.004), 0))
    pts = drape(loc + nm * 0.0015, nm, length, 0.007, sweep, 8, gravity=1.0, wave=0.7, seed=rnd.random() * 50, margin=0.003)
    wid = [0.0075] * 2 + [0.0062, 0.0052, 0.0042, 0.003, 0.002, 0.0012]
    cs = rnd.choice(BEARD)
    beard.add(pts, wid, nm, tuple(x * 0.75 for x in cs), cs)
# moustache
for k in range(150):
    sx = rnd.choice((-1, 1))
    x = sx * rnd.uniform(0.002, 0.03)
    z = rnd.uniform(1.648, 1.66)
    loc, nm, idx, dist = bvh.ray_cast(V((x, -0.3, z)), V((0, 1, 0)), 0.5)
    if loc is None:
        continue
    d = V((sx * rnd.uniform(0.2, 1.0), 0.0, -rnd.uniform(0.2, 0.6)))
    sweep = d * 0.01
    pts = drape(loc + nm * 0.0015, nm, rnd.uniform(0.03, 0.055), 0.007, sweep, 6, gravity=0.8, wave=0.5, seed=rnd.random() * 50, margin=0.003)
    cs = rnd.choice(BEARD)
    beard.add(pts, [0.006, 0.006, 0.005, 0.004, 0.003, 0.002], nm, tuple(x * 0.8 for x in cs), cs)
beard_ob = beard.to_object('beard')

# ------------------------------------------------------------------ EYEBROWS
brows = Blades()
for sx in (-1, 1):
    for k in range(34):
        t = rnd.random()
        x = sx * (0.012 + 0.042 * t)
        z = 1.7235 + 0.012 * math.sin(t * 2.2) - 0.005 * t * t * 0 + 0.002 * rnd.random()
        loc, nm, idx, dist = bvh.ray_cast(V((x, -0.3, z)), V((0, 1, 0)), 0.5)
        if loc is None:
            continue
        d = V((sx * 0.9, 0, 0.35 - 0.4 * t))
        p0 = loc + nm * 0.002
        p1 = p0 + d.normalized() * 0.008 + nm * 0.003
        p2 = p1 + d.normalized() * 0.01 + nm * 0.001
        cs = hexc('#b79a52') if rnd.random() < 0.6 else hexc('#d6bd72')
        brows.add([p0, p1, p2], [0.0065, 0.005, 0.0015], nm, tuple(x * 0.8 for x in cs), cs)
brow_ob = brows.to_object('brows')

# ------------------------------------------------------------------ EYES (sclera + iris painted with vertex colours)
eyes = []
SCL = hexc('#e9e3d2'); IRIS = hexc('#58807c'); IRIS2 = hexc('#2d4a4a'); PUP = hexc('#0a0a0a')
for sx in (-1, 1):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=0.0116)
    me = bpy.data.meshes.new('eye')
    bm.to_mesh(me); bm.free()
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    cols = []
    for v in me.vertices:
        p = v.co
        a = math.atan2(math.hypot(p.x, p.z), -p.y)       # angle from the -Y pole
        if a < 0.2:
            col = PUP
        elif a < 0.52:
            k = (a - 0.2) / 0.32
            col = tuple(IRIS[j] * (1 - k) + IRIS2[j] * k for j in range(3))
        elif a < 0.6:
            col = IRIS2
        else:
            col = SCL
        cols.append(col + (1.0,))
    ca.data.foreach_set('color', np.array(cols, dtype=np.float32).reshape(-1))
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new('eye', me)
    ob.location = (sx * 0.034, -0.075, 1.7)
    bpy.context.scene.collection.objects.link(ob)
    eyes.append(ob)
bpy.context.view_layer.update()
for o in list(bpy.data.objects):
    if o.name.startswith('eye_tmp'):
        bpy.data.objects.remove(o, do_unlink=True)
result = {'hair_blades': len(hair.f) // 1, 'beard': len(beard.f), 'brows': len(brows.f)}
