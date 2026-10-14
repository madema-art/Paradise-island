p = r'D:\Paradise Island\blender\boar_build.py'
s = open(p, encoding='utf-8', newline='').read()


def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)


rep("    for k in range(5):\n        spike(HF, (s * 0.07, -0.68 - 0.04 * k, 0.93 - 0.01 * k), (s * 0.3, 0.8, 0.5), 0.05, 0.01, n=5)    # fringe on the brow",
    "    for k in range(5):\n        yy = -0.66 - 0.04 * k\n        spike(HF, (s * 0.07, yy, row_at(HEAD_ROWS, yy)[1] - 0.012), (s * 0.3, 0.8, 0.5), 0.05, 0.01, n=5)    # fringe on the brow")
rep("c = V((s * 0.132, -0.665, 0.79))", "c = V((s * 0.128, -0.665, 0.785))")
rep("Eo.sphere(c, (0.017, 0.02, 0.017), lat=8, lon=12)", "Eo.sphere(c, (0.019, 0.022, 0.019), lat=8, lon=12)")
rep("S.sphere((s * 0.17, 0.38, 0.62), (0.12, 0.18, 0.2)", "S.sphere((s * 0.19, 0.38, 0.62), (0.12, 0.19, 0.2)")
rep("REAR = dict(hip=V((0.18, 0.4, 0.55)), knee=V((0.185, 0.44, 0.28)), ankle=V((0.18, 0.41, 0.06))",
    "REAR = dict(hip=V((0.165, 0.4, 0.55)), knee=V((0.175, 0.44, 0.28)), ankle=V((0.175, 0.41, 0.06))")
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
