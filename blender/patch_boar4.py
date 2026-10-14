import os
os.chdir(r'D:\Paradise Island\blender')


def rw(p, pairs):
    s = open(p, encoding='utf-8', newline='').read()
    for a, b in pairs:
        assert a in s, (p, a)
        s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8', newline='').write(s)


# shorter legs: the whole body group sits 5 cm lower while the legs keep their feet where they were
rw('boar_build.py', [(
    "neck.location.y += 0.08",
    "body.location.z -= 0.05\nfor (_fr, _nm), (_hip, _knee) in LEGS.items():\n    _hip.location.z += 0.05\nneck.location.y += 0.08")])

# a darker, more contrasty silver tusker; finer, softer flecking
rw('boar_color.py', [
    ("coat=('#5e574d', '#aaa18e'), back='#403a33', belly='#7c7466'", "coat=('#46403a', '#8d8573'), back='#332e29', belly='#6a6358'"),
    ("flecks = np.clip((g1 * 0.85 + g2 * 0.4 + g3 * 0.25 - 0.42) * 3.0, 0, 1)", "flecks = np.clip((g1 * 0.8 + g2 * 0.55 + g3 * 0.15 - 0.42) * 2.2, 0, 1)"),
])
print('ok')
