# Stage 1c: sculpt anatomy into the welded base mesh with displacement fields (adds AND carves).
import bpy, numpy as np, math

ob = bpy.data.objects['body']
me = ob.data
N = len(me.vertices)
co = np.empty(N * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
nr = np.empty(N * 3); me.vertex_normals.foreach_get('vector', nr); nr = nr.reshape(-1, 3)
X, Y, Z = co[:, 0], co[:, 1], co[:, 2]
AX = np.abs(X)
P = np.stack([AX, Y, Z], 1)
disp = np.zeros(N)


def G(c, s, amp, mirror=True):
    x = AX if mirror else X
    disp[:] += amp * np.exp(-(((x - c[0]) / s[0]) ** 2 + ((Y - c[1]) / s[1]) ** 2 + ((Z - c[2]) / s[2]) ** 2))


def L(p0, p1, sig, amp, mirror=True):
    PP = P if mirror else co
    a = np.array(p0, float); b = np.array(p1, float); d = b - a
    t = np.clip(((PP - a) @ d) / (d @ d), 0, 1)
    q = a + t[:, None] * d
    dist = np.linalg.norm(PP - q, axis=1)
    disp[:] += amp * np.exp(-(dist / sig) ** 2)


def smooth01(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ FACE
G((.03, -.088, 1.722), (.028, .02, .009), .009)               # brow ridge
G((0, -.088, 1.724), (.014, .02, .012), .004)                  # glabella
G((.034, -.086, 1.7), (.017, .02, .011), -.0085)               # eye socket
G((.034, -.087, 1.709), (.02, .015, .0045), .0025)             # upper-lid fold
L((0, -.09, 1.718), (0, -.09, 1.697), .0085, .008, False)      # nose bridge
L((0, -.09, 1.697), (0, -.09, 1.674), .0095, .02, False)       # nose
G((0, -.09, 1.668), (.0115, .05, .0115), .011, False)          # tip
G((.0175, -.09, 1.662), (.009, .05, .008), .0075)              # nostril wings
G((.0085, -.108, 1.654), (.0055, .007, .0045), -.004)          # nostrils
G((0, -.1, 1.65), (.01, .012, .005), -.003, False)             # under the nose
G((.05, -.07, 1.682), (.02, .022, .012), .0065)                # cheekbone
G((.047, -.06, 1.648), (.022, .025, .02), -.011)              # hollow cheek
G((.071, -.04, 1.74), (.015, .03, .02), -.007)                 # temple
L((.021, -.098, 1.664), (.033, -.093, 1.633), .0048, -.0055)    # nasolabial fold
L((0, -.098, 1.637), (.025, -.096, 1.638), .0028, -.0048)      # mouth line
G((0, -.094, 1.645), (.02, .012, .0055), .004, False)         # upper lip
G((0, -.092, 1.628), (.018, .012, .0065), .0045, False)         # lower lip
G((0, -.097, 1.651), (.005, .01, .006), -.002, False)          # philtrum
G((0, -.093, 1.616), (.014, .01, .003), -.0045, False)         # lip-chin groove
G((0, -.092, 1.598), (.016, .014, .012), .003, False)            # chin
# age: forehead furrows, crow's feet, eye bags
for zf, w in [(1.752, .052), (1.766, .05), (1.78, .044)]:
    L((0, -.088, zf), (w, -.08, zf - .003), .0028, -.0024)
L((.062, -.062, 1.705), (.077, -.044, 1.714), .0026, -.002)
L((.062, -.066, 1.697), (.077, -.049, 1.692), .0026, -.002)
G((.034, -.086, 1.686), (.02, .03, .0055), -.0028)
# eyes: almond opening, lid rims, recess for the eyeball
for sx in (0,):
    for ex in (.034,):
        cx, cz = ex, 1.7
        r = np.sqrt(((AX - cx) / .0175) ** 2 + ((Z - (cz + (AX - cx) * 0.18)) / .0088) ** 2)
        front = smooth01(-0.02, -0.075, Y)
        disp[:] += front * (.0032 * np.exp(-((r - 1.12) / .3) ** 2) - .0045 * (1 - smooth01(0.7, 1.0, r)))

# ------------------------------------------------------------------ TORSO
L((0, -.09, 1.0), (0, -.098, 1.3), .0038, -.0042, False)       # linea alba / sternum
for z, w in [(1.152, .056), (1.114, .054), (1.076, .05)]:
    L((0.0, -.092, z), (w, -.087, z - .003), .0042, -.0034)    # ab grooves
G((.07, -.094, 1.338), (.062, .03, .036), .0055)               # pectorals
L((.012, -.098, 1.298), (.065, -.1, 1.292), .0045, -.0036)     # under the pecs
L((.065, -.1, 1.292), (.118, -.075, 1.31), .0045, -.0036)
# ribs: ridges sloping down toward the front
ph = ((Z + 0.045 * (1 - np.clip(AX / 0.165, 0, 1))) % 0.0272) / 0.0272
rib = np.maximum(0, np.cos(2 * math.pi * (ph - 0.5))) ** 3
rm = smooth01(0.035, 0.07, AX) * (1 - smooth01(0.15, 0.172, AX)) * smooth01(1.11, 1.17, Z) * (1 - smooth01(1.36, 1.41, Z)) * smooth01(0.045, -0.02, Y) * (1 - 0.55 * smooth01(0.0, 0.05, Y))
disp[:] += 0.0017 * rib * rm
L((.01, -.052, 1.502), (.075, -.056, 1.511), .0065, .0046)     # clavicle
L((.075, -.056, 1.511), (.16, -.032, 1.514), .0065, .0046)
G((0, -.05, 1.506), (.013, .02, .009), -.0045, False)          # jugular notch
L((.045, .014, 1.645), (.03, -.028, 1.565), .0085, .0048)      # neck cords
L((.03, -.028, 1.565), (.018, -.045, 1.508), .0085, .0048)
G((0, -.054, 1.553), (.009, .01, .012), .0048, False)          # adam's apple
G((.125, -.085, .965), (.02, .03, .02), .007)                  # hip bones
L((.12, -.092, .955), (.045, -.088, .845), .007, -.0042)       # inguinal grooves
G((.075, .1, 1.33), (.032, .03, .05), .005)                    # shoulder blades
L((0, .1, 1.1), (0, .095, 1.47), .005, -.0042, False)          # spine groove
G((.042, .093, 1.12), (.02, .02, .1), .003)                    # erectors
L((0, .125, .82), (0, .118, .94), .004, -.0042, False)         # glute cleft
G((.058, .108, .86), (.05, .03, .045), .004)                   # glutes

# ------------------------------------------------------------------ ARMS
G((.222, -.03, 1.345), (.03, .03, .05), .003)                    # biceps
G((.232, .018, 1.2), (.016, .018, .022), .0065)                # elbow point
G((.24, .01, .925), (.012, .012, .012), .0035)                # wrist bone
G((.224, .025, 1.37), (.03, .03, .06), .003)                   # triceps
# ------------------------------------------------------------------ LEGS
G((.094, -.05, .502), (.03, .02, .034), .0075)                   # kneecap
L((.1, -.05, .47), (.1, -.047, .43), .008, .003)               # patellar tendon
G((.083, -.05, .565), (.022, .02, .04), .0045)                 # inner quad
L((.115, -.088, .88), (.103, -.066, .58), .007, -.0024)        # quad separation
L((.092, -.05, .45), (.09, -.045, .15), .007, .0045)           # shin ridge
G((.145, .0, .084), (.012, .016, .016), .0065)                 # outer ankle
G((.064, .002, .09), (.012, .015, .017), .0065)                # inner ankle
L((.1, .03, .28), (.1, .029, .1), .0075, .003)                 # achilles

# apply along the surface normal
co2 = co + nr * disp[:, None]
me.vertices.foreach_set('co', co2.reshape(-1))
me.update()
import bmesh
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.25, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(me); bm.free()
result = {'max_disp': float(np.abs(disp).max())}
