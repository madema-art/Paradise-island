# Stage 4: armature + analytic skin weights. Bones mirror the game's joint hierarchy exactly.
import bpy, numpy as np, math
from mathutils import Vector

V = Vector


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


JOINTS = {
    'hips': ((0, 0, .9), None), 'spine': ((0, 0, .98), 'hips'), 'chest': ((0, 0, 1.17), 'spine'),
    'neck': ((0, 0, 1.48), 'chest'), 'head': ((0, 0, 1.60), 'neck'),
}
for s, n in ((-1, 'N'), (1, 'P')):
    JOINTS['arm' + n] = ((s * .19, 0, 1.47), 'chest')
    JOINTS['elbow' + n] = ((s * .232, 0, 1.195), 'arm' + n)
    JOINTS['hand' + n] = ((s * .24, 0, .925), 'elbow' + n)
    JOINTS['leg' + n] = ((s * .094, 0, .9), 'hips')
    JOINTS['knee' + n] = ((s * .094, 0, .47), 'leg' + n)
    JOINTS['foot' + n] = ((s * .094, 0, .065), 'knee' + n)
ORDER = list(JOINTS.keys())
TAILS = {'hips': (0, 0, .98), 'spine': (0, 0, 1.17), 'chest': (0, 0, 1.48), 'neck': (0, 0, 1.6), 'head': (0, 0, 1.84)}
for s, n in ((-1, 'N'), (1, 'P')):
    TAILS['arm' + n] = JOINTS['elbow' + n][0]
    TAILS['elbow' + n] = JOINTS['hand' + n][0]
    TAILS['hand' + n] = (s * .243, 0, .74)
    TAILS['leg' + n] = JOINTS['knee' + n][0]
    TAILS['knee' + n] = JOINTS['foot' + n][0]
    TAILS['foot' + n] = (s * .094, -.19, .03)


def make_armature():
    arm = bpy.data.armatures.new('rig')
    ob = bpy.data.objects.new('rig', arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    for name in ORDER:
        eb = arm.edit_bones.new(name)
        eb.head = V(JOINTS[name][0])
        eb.tail = V(TAILS[name])
        eb.roll = 0
    for name in ORDER:
        par = JOINTS[name][1]
        if par:
            arm.edit_bones[name].parent = arm.edit_bones[par]
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def seg_dist(P, pts):
    d = np.full(len(P), 1e9)
    for a, b in zip(pts[:-1], pts[1:]):
        a = np.array(a, float); b = np.array(b, float); ab = b - a
        t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        q = a + t[:, None] * ab
        d = np.minimum(d, np.linalg.norm(P - q, axis=1))
    return d


def body_weights(P):
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    AX = np.abs(X)
    n = len(P)
    W = {k: np.zeros(n) for k in ORDER}
    # ---- spine chain by height
    s1, s2, s3, s4 = ss(.92, 1.04, Z), ss(1.10, 1.24, Z), ss(1.44, 1.52, Z), ss(1.57, 1.63, Z)
    head_front = ((Z > 1.585) & ((Y < -.045) | (Z > 1.625))).astype(float)
    s4 = np.maximum(s4, head_front * ss(1.575, 1.595, Z))
    chain = {'hips': 1 - s1, 'spine': s1 * (1 - s2), 'chest': s2 * (1 - s3), 'neck': s3 * (1 - s4), 'head': s4}
    for k, v in chain.items():
        W[k] += v
    # ---- limbs: blend between the chain and the limb bones by tube membership
    for sgn, nm in ((1, 'P'), (-1, 'N')):
        side = ss(-.02, .02, X * sgn)                      # which side of the body
        # arm
        pts = [(sgn * .19, 0, 1.47), (sgn * .232, 0, 1.195), (sgn * .24, 0, .925), (sgn * .243, 0, .74)]
        d = seg_dist(P, pts)
        R = np.where(Z > 1.4, .05, np.where(Z > 1.2, .042, np.where(Z > .96, .036, .05)))
        m = ss(1.25, 0.95, d / R) * side * ss(1.56, 1.5, Z) * ss(.14, .17, AX) * np.where(Z < 1.1, ss(.2, .215, AX), 1.0)
        m = np.maximum(m, side * ss(.185, .2, AX) * ss(.99, .95, Z) * ss(.0, .05, 1.0 + 0 * Z))   # the whole hand, fingers included
        sh = ss(1.52, 1.36, Z)                              # shoulder blends into the chest
        se = ss(1.195 + .045, 1.195 - .045, Z)
        sw = ss(.925 + .03, .925 - .03, Z)
        La = {'arm' + nm: sh * (1 - se), 'elbow' + nm: se * (1 - sw) * sh + (1 - sh) * 0, 'hand' + nm: se * sw}
        # anything not given to the limb (shoulder remainder) stays on the chest
        La['arm' + nm] = (1 - se) * sh
        rest = np.clip(1 - sum(La.values()), 0, 1)
        for k in list(W):
            W[k] *= (1 - m)
        for k, v in La.items():
            W[k] += m * v
        W['chest'] += m * rest
        # leg
        x0 = sgn * .094
        dl = np.hypot(X - x0, Y * 0.9)
        Rl = np.where(Z > .65, .092, np.where(Z > .3, .07, .06))
        lf = ss(.985, .87, Z)
        mf = ss(1.25, 1.0, dl / Rl) * side * ss(.0, .06, AX) * (Z < .99) * np.where(Z > .12, ss(.2, .185, AX), 1.0)
        foot = ((Z < .1) & (np.abs(X - x0) < .07) & (Y < .1)).astype(float)
        mf = np.maximum(mf, foot)
        shin = ss(.52, .42, Z)
        ft = np.maximum(ss(.13, .075, Z) * 1.0, foot)
        Ll = {'leg' + nm: lf * (1 - shin), 'knee' + nm: lf * shin * (1 - ft) + (1 - lf) * 0, 'foot' + nm: ft * shin}
        Ll['leg' + nm] = lf * (1 - shin)
        Ll['knee' + nm] = shin * (1 - ft) * np.where(Z > .5, lf, 1)
        Ll['foot' + nm] = ft * shin
        Ll['hips'] = np.clip(1 - sum(Ll.values()), 0, 1)
        for k in list(W):
            W[k] *= (1 - mf)
        for k, v in Ll.items():
            W[k] += mf * v
    return W


def finalize(W):
    names = list(W.keys())
    M = np.stack([W[k] for k in names], 1)
    M = np.clip(M, 0, None)
    # keep the 4 strongest influences
    idx = np.argsort(-M, axis=1)[:, 4:]
    np.put_along_axis(M, idx, 0, axis=1)
    s = M.sum(1, keepdims=True)
    s[s < 1e-6] = 1
    M = M / s
    return names, M


def assign(ob, names, M):
    for k in ORDER:
        if k in ob.vertex_groups:
            ob.vertex_groups.remove(ob.vertex_groups[k])
    groups = {k: ob.vertex_groups.new(name=k) for k in ORDER}
    for j, k in enumerate(names):
        col = M[:, j]
        for i in np.nonzero(col > 0.003)[0]:
            groups[k].add([int(i)], float(col[i]), 'REPLACE')


def verts_of(ob):
    me = ob.data
    N = len(me.vertices)
    co = np.empty(N * 3); me.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def bind(ob, rig):
    ob.parent = rig
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig


rig = make_armature()
# body
b = bpy.data.objects['body']
names, M = finalize(body_weights(verts_of(b)))
assign(b, names, M)
bind(b, rig)
# everything on the head is rigid to the head bone
for nm in ('hair', 'beard', 'brows', 'haircap'):
    o = bpy.data.objects.get(nm)
    if o:
        g = o.vertex_groups.new(name='head')
        g.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
        bind(o, rig)
for o in bpy.data.objects:
    if o.name.startswith('eye'):
        g = o.vertex_groups.new(name='head')
        g.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
        bind(o, rig)
# cloth follows the hips near the belt and the thighs toward the hem
for nm in ('cloth', 'fray', 'knot', 'rope', 'flap'):
    o = bpy.data.objects.get(nm)
    if not o:
        continue
    P = verts_of(o)
    X, Z = P[:, 0], P[:, 2]
    k = np.clip((0.955 - Z) / (0.955 - 0.68) * 0.62, 0, 0.62) if nm in ('cloth', 'fray', 'flap') else np.zeros(len(P))
    wP = ss(-.09, .09, X) * k
    W = {n: np.zeros(len(P)) for n in ORDER}
    W['legP'] = wP
    W['legN'] = k - wP
    W['hips'] = 1 - k
    names, M = finalize(W)
    assign(o, names, M)
    bind(o, rig)
result = {'bones': len(ORDER)}
