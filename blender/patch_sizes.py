import os
os.chdir(r'D:\Paradise Island')
p = 'src/fauna_land.js'
L = open(p, encoding='utf-8').read().split('\n')
def add(lines, idx, expr):
    assert 'this.group' in lines[idx - 1], lines[idx - 1]
    lines[idx - 1] = lines[idx - 1] + ' this.group.scale.setScalar(' + expr + ');'
# Monkey: a few big old males and some small juveniles
add(L, 18, "rnd() < 0.18 ? rr(1.15, 1.3) : rr(0.82, 1.08)")
add(L, 174, "this.baby ? rr(0.9, 1.12) : rr(0.85, 1.22)")
add(L, 229, "rr(0.85, 1.2)")
add(L, 365, "rr(0.9, 1.12)")
open(p, 'w', encoding='utf-8').write('\n'.join(L))
p = 'src/fauna_sea.js'
L = open(p, encoding='utf-8').read().split('\n')
for idx in (36, 67, 125, 492):
    add(L, idx, "rr(0.85, 1.18)")
open(p, 'w', encoding='utf-8').write('\n'.join(L))
print('ok')
