# Stage 3: torn linen loincloth, rope belt and a knotted bundle at the hip.
import bpy, bmesh, math, random
import numpy as np
from mathutils import Vector, noise

V = Vector
rc = random.Random(11)


def srgb2lin(c):
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c)


def hexc(h):
    h = h.lstrip('#')
    return srgb2lin(tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)))


def make_obj(name, verts, faces, cols):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', np.array([tuple(c) + (1.0,) for c in cols], dtype=np.float32).reshape(-1))
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ------------------------------------------------------------------ skirt
NU, NV = 96, 16
Z0 = 0.962
CLOTH_A, CLOTH_B, CLOTH_DK = hexc('#d8cba4'), hexc('#bfae83'), hexc('#8c7a52')

# hem profile: pointed tatters of random width and depth
edges = [0.0]
while edges[-1] < math.tau:
    edges.append(edges[-1] + rc.uniform(0.07, 0.2))
edges[-1] = math.tau
depths = [rc.choice([0.012, 0.02, 0.035, 0.05, 0.075, 0.1]) * rc.uniform(0.7, 1.2) for _ in edges]


def hem(phi):
    base = 0.688 - 0.035 * math.cos(phi) + 0.04 * math.sin(phi) + 0.015 * math.sin(3 * phi + 1.0)
    for i in range(len(edges) - 1):
        if edges[i] <= phi < edges[i + 1]:
            t = (phi - edges[i]) / (edges[i + 1] - edges[i])
            return base - depths[i] * (1 - abs(2 * t - 1)) ** 0.9
    return base


verts, cols = [], []
for j in range(NV + 1):
    v = j / NV
    for i in range(NU):
        phi = math.tau * i / NU
        zh = hem(phi)
        z = Z0 + (zh - Z0) * v
        rx = 0.182 + 0.01 * v ** 1.3 + 0.004 * math.sin(5 * phi + 2.0) * v
        ry = 0.113 + 0.02 * v ** 1.3
        # soft vertical folds and some sag in the front panel
        fold = 1.0 + 0.045 * v * math.sin(9 * phi + 2.0 * noise.noise(V((phi, 0.3, 0.1)))) + 0.02 * noise.noise(V((phi * 2.0, v * 3.0, 1.2)))
        x = math.sin(phi) * rx * fold
        y = -math.cos(phi) * ry * fold
        verts.append(V((x, y, z)))
        n1 = noise.noise(V((x * 9, y * 9, z * 9)))
        n2 = noise.noise(V((x * 30, y * 30, z * 30 + 5)))
        k = 0.5 + 0.5 * n1
        base = tuple(CLOTH_A[q] * (1 - k) + CLOTH_B[q] * k for q in range(3))
        dirt = min(1.0, max(0.0, (v - 0.35) * 1.4 + 0.45 * n2 + 0.25 * (n1 + 0.4)))
        cols.append(tuple(base[q] * (1 - 0.55 * dirt) + CLOTH_DK[q] * 0.55 * dirt for q in range(3)))
faces = []
for j in range(NV):
    for i in range(NU):
        a = j * NU + i
        b = j * NU + (i + 1) % NU
        # torn holes low on the cloth
        cx = (verts[a].x + verts[b].x) * 0.5
        cy = (verts[a].y + verts[b].y) * 0.5
        cz = (verts[a].z + verts[b + NU].z) * 0.5
        hole = noise.noise(V((cx * 14 + 3, cy * 14, cz * 14))) > 0.5 and j > 6
        if hole:
            continue
        faces.append((a, b, b + NU, a + NU))
skirt = make_obj('cloth', verts, faces, cols)

# ------------------------------------------------------------------ second torn panel hanging over the front-left thigh
fv, fc, ff = [], [], []
FU, FV = 12, 10
PHI0, PHI1 = -0.78, 0.5
tooth = [rc.uniform(0.0, 0.09) for _ in range(FU + 1)]
for j in range(FV + 1):
    v = j / FV
    for i in range(FU + 1):
        u = i / FU
        phi = PHI0 + (PHI1 - PHI0) * u
        hz = 0.57 - 0.05 * math.sin(u * 3.1) - tooth[i] * (1 if i % 2 else 0.35)
        z = (Z0 - 0.01) + (hz - (Z0 - 0.01)) * v
        rx = 0.182 + 0.014 + 0.014 * v ** 1.2
        ry = 0.113 + 0.014 + 0.026 * v ** 1.2
        fold = 1.0 + 0.05 * v * math.sin(11 * phi + 1.3)
        fv.append(V((math.sin(phi) * rx * fold, -math.cos(phi) * ry * fold, z)))
        n1 = noise.noise(V((phi * 3, v * 2, 5.0)))
        k = 0.5 + 0.5 * n1
        base = tuple(CLOTH_B[q] * (1 - k) + CLOTH_A[q] * k for q in range(3))
        d = min(1.0, max(0.0, (v - 0.3) * 1.3))
        fc.append(tuple(base[q] * (1 - 0.5 * d) + CLOTH_DK[q] * 0.5 * d for q in range(3)))
for j in range(FV):
    for i in range(FU):
        a0 = j * (FU + 1) + i
        ff.append((a0, a0 + 1, a0 + 1 + FU + 1, a0 + FU + 1))
flapo = make_obj('flap', fv, ff, fc)

# ------------------------------------------------------------------ rope belt
ROPE, ROPE2 = hexc('#8a7248'), hexc('#6e5a37')
RN, RR = 120, 8
rv, rcol, rf = [], [], []
for i in range(RN):
    t = math.tau * i / RN
    cx = math.sin(t) * 0.19
    cy = -math.cos(t) * 0.121
    cz = Z0 - 0.004 + 0.012 * math.sin(2 * t + 0.6) - 0.01 * max(0.0, math.cos(t))
    c = V((cx, cy, cz))
    tg = V((math.cos(t) * 0.196, math.sin(t) * 0.121, 0)).normalized()
    nr = V((tg.y, -tg.x, 0)).normalized()
    up = V((0, 0, 1))
    for j in range(RR):
        a = math.tau * j / RR + t * 14.0                      # twisted strands
        r = 0.0075 * (1.0 + 0.25 * math.cos(a * 1.0 + 0.0))
        p = c + nr * math.cos(a) * r + up * math.sin(a) * r
        rv.append(p)
        rcol.append(ROPE if (j % 4) < 2 else ROPE2)
for i in range(RN):
    for j in range(RR):
        a = i * RR + j
        b = i * RR + (j + 1) % RR
        c2 = ((i + 1) % RN) * RR + (j + 1) % RR
        d = ((i + 1) % RN) * RR + j
        rf.append((a, b, c2, d))
rope = make_obj('rope', rv, rf, rcol)

# ------------------------------------------------------------------ knot + dangling tails at the +x hip
kv, kf, kc = [], [], []


def blob(c, r, col, seed):
    base = len(kv)
    lat, lon = 8, 12
    for i in range(lat + 1):
        a = math.pi * i / lat
        for j in range(lon):
            b = math.tau * j / lon
            p = V((math.sin(a) * math.cos(b), math.sin(a) * math.sin(b), math.cos(a)))
            n = 1.0 + 0.28 * noise.noise(p * 2.2 + V((seed, seed * 0.7, 0)))
            kv.append(V(c) + V((p.x * r[0], p.y * r[1], p.z * r[2])) * n)
            kc.append(tuple(col[q] * (0.85 + 0.25 * noise.noise(p * 3 + V((seed, 1, 2)))) for q in range(3)))
    for i in range(lat):
        for j in range(lon):
            a = base + i * lon + j
            b = base + i * lon + (j + 1) % lon
            kf.append((a, b, b + lon, a + lon))


kx = V((0.17, -0.105, 0.95))
blob(kx, (0.03, 0.04, 0.032), CLOTH_B, 1.0)
blob(kx + V((0.012, -0.03, -0.02)), (0.024, 0.03, 0.03), CLOTH_A, 4.0)
blob(kx + V((0.0, 0.03, -0.005)), (0.02, 0.026, 0.024), CLOTH_B, 7.0)
for tdir, tl in [(V((0.25, -0.15, -1)), 0.17), (V((0.55, 0.1, -1)), 0.12), (V((0.1, 0.3, -1)), 0.1)]:
    p0 = kx + V((0.01, 0, -0.02))
    pts = []
    for q in range(7):
        t = q / 6
        pts.append(p0 + tdir.normalized() * tl * t + V((0, 0.012 * math.sin(t * 5), 0)) * t)
    base = len(kv)
    w0 = 0.022
    for q, p in enumerate(pts):
        t = q / 6
        hw = w0 * (1 - 0.35 * t) * (1 if q < 6 else 0.4)
        wv = V((tdir.y, -tdir.x, 0)).normalized() * hw * (1 + 0.15 * math.sin(q * 3.1))
        kv.append(p - wv); kc.append(CLOTH_A)
        kv.append(p + wv); kc.append(CLOTH_DK if q > 4 else CLOTH_B)
    for q in range(6):
        a = base + q * 2
        kf.append((a, a + 1, a + 3, a + 2))
knot = make_obj('knot', kv, kf, kc)

# ------------------------------------------------------------------ frayed threads at the hem (little blades)
th_v, th_f, th_c = [], [], []
for i in range(NU):
    pass
fray = []
for _ in range(220):
    phi = rc.uniform(0, math.tau)
    zh = hem(phi)
    j = NV
    rx = 0.182 + 0.01
    ry = 0.113 + 0.02
    p = V((math.sin(phi) * rx, -math.cos(phi) * ry, zh))
    d = V((math.sin(phi) * 0.3 + rc.gauss(0, 0.2), -math.cos(phi) * 0.3 + rc.gauss(0, 0.2), -1)).normalized()
    ln = rc.uniform(0.012, 0.035)
    wv = V((math.cos(phi), math.sin(phi), 0)) * 0.0022
    base = len(th_v)
    th_v += [p - wv, p + wv, p + d * ln * 0.55 - wv * 0.7 + V((rc.gauss(0, 0.003), rc.gauss(0, 0.003), 0)), p + d * ln * 0.55 + wv * 0.7, p + d * ln + V((rc.gauss(0, 0.005), rc.gauss(0, 0.005), 0))]
    th_c += [CLOTH_B, CLOTH_B, CLOTH_DK, CLOTH_DK, CLOTH_DK]
    th_f += [(base, base + 1, base + 3, base + 2), (base + 2, base + 3, base + 4)]
fray = make_obj('fray', th_v, th_f, th_c)
result = {'cloth_faces': len(faces)}
