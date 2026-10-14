# Shared helpers for building the castaway in Blender (Z up, character faces -Y, metres).
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler, noise

V = Vector
TAU = math.tau


def resample(prof, step):
    # Catmull-Rom through the profile rows (sorted by z), sampled roughly every `step` metres
    P = [list(r) for r in prof]
    out = []
    def cr(p0, p1, p2, p3, t):
        return [0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3) for a, b, c, d in zip(p0, p1, p2, p3)]
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, len(P) - 1)]
        k = max(1, int(round(abs(p2[0] - p1[0]) / step)))
        for j in range(k):
            out.append(tuple(cr(p0, p1, p2, p3, j / k)))
    out.append(tuple(P[-1]))
    return out


def interp(prof, z):
    # linear lookup of (cx, cy, rx, ry) at height z
    for i in range(len(prof) - 1):
        a, b = prof[i], prof[i + 1]
        lo, hi = min(a[0], b[0]), max(a[0], b[0])
        if lo <= z <= hi:
            t = (z - a[0]) / (b[0] - a[0])
            return [a[k] + (b[k] - a[k]) * t for k in range(1, 5)]
    return [prof[-1][k] for k in range(1, 5)]


class Soup:
    """Collects closed primitive shells into one big triangle/quads soup; voxel remesh unions them."""
    def __init__(self):
        self.v = []
        self.f = []

    def sphere(self, c, r, rot=(0, 0, 0), lat=10, lon=16):
        c = V(c)
        rx, ry, rz = (r, r, r) if isinstance(r, (int, float)) else r
        m = Euler(rot, 'XYZ').to_matrix()
        base = len(self.v)
        self.v.append(c + m @ V((0, 0, rz)))
        for i in range(1, lat):
            a = math.pi * i / lat
            for j in range(lon):
                b = TAU * j / lon
                self.v.append(c + m @ V((rx * math.sin(a) * math.cos(b), ry * math.sin(a) * math.sin(b), rz * math.cos(a))))
        self.v.append(c + m @ V((0, 0, -rz)))
        top, bot = base, len(self.v) - 1
        for j in range(lon):
            self.f.append((top, base + 1 + j, base + 1 + (j + 1) % lon))
        for i in range(lat - 2):
            for j in range(lon):
                a = base + 1 + i * lon + j
                b = base + 1 + i * lon + (j + 1) % lon
                self.f.append((a, a + lon, b + lon, b))
        for j in range(lon):
            self.f.append((bot, base + 1 + (lat - 2) * lon + (j + 1) % lon, base + 1 + (lat - 2) * lon + j))

    def loft(self, rings, n=14, cap=(True, True)):
        """rings: list of (center, u, v) where u,v are semi-axis vectors of the ring ellipse."""
        base = len(self.v)
        for c, u, w in rings:
            c, u, w = V(c), V(u), V(w)
            for j in range(n):
                t = TAU * j / n
                self.v.append(c + u * math.cos(t) + w * math.sin(t))
        R = len(rings)
        for i in range(R - 1):
            for j in range(n):
                a = base + i * n + j
                b = base + i * n + (j + 1) % n
                self.f.append((a, b, b + n, a + n))
        if cap[0]:
            c0 = len(self.v)
            self.v.append(V(rings[0][0]) - (V(rings[1][0]) - V(rings[0][0])).normalized() * 0.001)
            for j in range(n):
                self.f.append((c0, base + (j + 1) % n, base + j))
        if cap[1]:
            c1 = len(self.v)
            self.v.append(V(rings[-1][0]) + (V(rings[-1][0]) - V(rings[-2][0])).normalized() * 0.001)
            for j in range(n):
                self.f.append((c1, base + (R - 1) * n + j, base + (R - 1) * n + (j + 1) % n))

    def vloft(self, prof, n=14, cap=(True, True), step=0.012):
        """Vertical loft: prof = [(z, cx, cy, rx, ry)], resampled with a smooth spline."""
        prof = resample(prof, step)
        self.loft([((cx, cy, z), (rx, 0, 0), (0, ry, 0)) for z, cx, cy, rx, ry in prof], n, cap)

    def rod(self, pts, radii, n=8, flat=(1.0, 1.0)):
        """Tube along a polyline pts with tapering radii."""
        rings = []
        P = [V(p) for p in pts]
        for i, p in enumerate(P):
            d = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
            a = d.cross(V((0, 0, 1)))
            if a.length < 0.2:
                a = d.cross(V((1, 0, 0)))
            a.normalize()
            b = d.cross(a).normalized()
            r = radii[i] if i < len(radii) else radii[-1]
            rings.append((p, a * r * flat[0], b * r * flat[1]))
        self.loft(rings, n)

    def to_object(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(x) for x in self.v], [], [tuple(f) for f in self.f])
        me.update()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        return ob


def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for d in list(coll):
            coll.remove(d)
