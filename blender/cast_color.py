# Stage 1d: paint the weathered, sun-tanned skin into a vertex colour attribute.
import bpy, numpy as np, math
from mathutils import Vector, noise

V = Vector
ob = bpy.data.objects['body']
me = ob.data
N = len(me.vertices)
co = np.empty(N * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
nr = np.empty(N * 3); me.vertices.foreach_get('normal', nr) if False else None
me.calc_loop_triangles()
nrm = np.empty(N * 3); me.vertex_normals.foreach_get('vector', nrm); nrm = nrm.reshape(-1, 3)
X, Y, Z = co[:, 0], co[:, 1], co[:, 2]
AX = np.abs(X)


def lin(h):
    h = h.lstrip('#')
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def gauss(c, s):
    return np.exp(-(((AX - c[0]) / s[0]) ** 2 + ((Y - c[1]) / s[1]) ** 2 + ((Z - c[2]) / s[2]) ** 2))


def nz(f, off=0.0):
    return np.array([noise.noise(V((x * f + off, y * f - off, z * f))) for x, y, z in co])


PALE, TAN, DARK = lin('#cf9366'), lin('#b4723f'), lin('#8a4f2c')
RED, DIRT, LIPS = lin('#c4553a'), lin('#6b5036'), lin('#9c4a3c')
n1, n2, n3 = nz(7.0), nz(26.0, 3.0), nz(95.0, 7.0)
# sun exposure: up-facing and outer surfaces are darker, protected inner surfaces stay paler
expo = np.clip(0.55 + 0.55 * nrm[:, 2], 0, 1) * 0.5 + np.clip((AX - 0.12) / 0.12, 0, 1) * 0.35 + np.clip(-nrm[:, 1] * 0.5, 0, 1) * 0.2
inner = np.clip(-(np.sign(X) * nrm[:, 0]), 0, 1) * ss(0.12, 0.2, AX) * ss(1.5, 1.3, Z)      # inner arm / thigh surfaces
t = np.clip(0.3 + 0.55 * expo + 0.22 * n1 - 0.25 * inner - 0.12 * ss(1.0, 1.45, Z) * ss(0.1, 0.0, AX), 0, 1)
col = PALE[None, :] * (1 - t[:, None]) + TAN[None, :] * t[:, None]
dk = np.clip(0.45 * (n2 + 0.25) + 0.35 * (expo - 0.5), 0, 1) * 0.55
col = col * (1 - dk[:, None]) + DARK[None, :] * dk[:, None]
# sunburnt red: nose, cheeks, forehead, shoulders, chest top
red = (gauss((0, -0.11, 1.667), (0.016, 0.05, 0.016)) * 0.9 + gauss((0.047, -0.07, 1.675), (0.03, 0.05, 0.02)) * 0.6
       + gauss((0, -0.08, 1.75), (0.06, 0.05, 0.03)) * 0.45 + gauss((0.19, 0, 1.48), (0.06, 0.06, 0.035)) * 0.5
       + gauss((0.0, -0.09, 1.44), (0.14, 0.06, 0.05)) * 0.4)
col = col * (1 - 0.55 * np.clip(red, 0, 1)[:, None]) + RED[None, :] * (0.55 * np.clip(red, 0, 1)[:, None])
# freckles / sun spots
spot = ss(0.30, 0.55, n3) * ss(1.25, 1.5, Z) * 0.45 + ss(0.3, 0.55, nz(60.0, 11.0)) * ss(1.1, 0.9, AX * 0 + (1.4 - Z)) * 0.0
col *= (1 - 0.3 * spot[:, None])
# knees, elbows, knuckles, ankles darker and rougher
rough = gauss((0.094, -0.05, 0.5), (0.04, 0.04, 0.05)) * 0.35 + gauss((0.232, 0.015, 1.2), (0.03, 0.03, 0.04)) * 0.4 + gauss((0.243, -0.0, 0.83), (0.03, 0.05, 0.02)) * 0.2
col *= (1 - 0.3 * np.clip(rough, 0, 1)[:, None])
# veins on forearms, hands and calves
vein = np.abs(nz(1.0) * 0 + np.array([noise.noise(V((x * 52, y * 52, z * 7))) for x, y, z in co]))
vm = ss(0.05, 0.0, vein) * (ss(1.25, 1.1, Z) * ss(0.8, 0.95, Z) * ss(0.19, 0.22, AX) * 0.9 + ss(0.4, 0.3, Z) * ss(0.1, 0.2, Z) * 0.3)
col = col * (1 - 0.28 * vm[:, None]) + np.array([0.18, 0.2, 0.3])[None, :] * 0.28 * vm[:, None] * 0.35
# dirt on the lower legs and feet; paler soles
dirt = ss(0.42, 0.04, Z) * (0.55 + 0.45 * ss(0.0, 0.5, n2 + 0.5))
col = col * (1 - 0.6 * dirt[:, None]) + DIRT[None, :] * 0.6 * dirt[:, None]
sole = ss(0.025, 0.0, Z) * ss(0.2, 0.0, nrm[:, 2] * 0 + 0.0 - nrm[:, 2] + 0.2) * 0
# lips, fingertips, eye sockets, armpit/groin shading
lip = gauss((0, -0.095, 1.636), (0.02, 0.03, 0.011))
col = col * (1 - 0.7 * lip[:, None]) + LIPS[None, :] * 0.7 * lip[:, None]
tips = ss(0.77, 0.74, Z) * ss(0.1, 0.2, AX) * 0.5
col = col * (1 - tips[:, None]) + lin('#d89a80')[None, :] * tips[:, None]
sock = gauss((0.034, -0.085, 1.703), (0.024, 0.04, 0.016))
col *= (1 - 0.3 * sock[:, None])
shade = gauss((0.17, 0, 1.33), (0.02, 0.05, 0.05)) * 0.35 + gauss((0.0, -0.09, 0.84), (0.1, 0.1, 0.04)) * 0.2
col *= (1 - shade[:, None])
# beard shadow / stubble under the beard line
bz = ss(1.665, 1.64, Z) * ss(-0.05, 0.0, Y * -1.0 - 0.0) * ss(0.0, 0.06, -Y) * ss(0.1, 0.05, AX) * ss(1.585, 1.60, Z)
col = col * (1 - 0.45 * bz[:, None]) + lin('#7a5a34')[None, :] * 0.45 * bz[:, None]
col = np.clip(col, 0, 1)
if 'Col' in me.color_attributes:
    me.color_attributes.remove(me.color_attributes['Col'])
ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
arr = np.concatenate([col, np.ones((N, 1))], 1).astype(np.float32).reshape(-1)
ca.data.foreach_set('color', arr)
me.color_attributes.active_color = ca
result = {'colored': N}
