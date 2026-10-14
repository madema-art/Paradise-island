import os
os.chdir(r'D:\Paradise Island')
p = 'src/main.js'
s = open(p, encoding='utf-8').read()
s = s.replace("import { loadCastawayModel } from './castaway_model.js';", "import { loadCastawayModel } from './castaway_model.js';\nimport { loadCrabModel } from './crab_model.js';", 1)
s = s.replace("  const land = buildLandFauna(flora);", "  await loadCrabModel();\n  const land = buildLandFauna(flora);", 1)
open(p, 'w', encoding='utf-8').write(s)

p = 'src/fauna_land.js'
s = open(p, encoding='utf-8').read()
a = s.index("/* ====================================================================== CRAB */")
b = s.index("/* ====================================================================== FLAMINGO */")
new = open(r'D:\Paradise Island\blender\crab_class.js', encoding='utf-8').read()
s = s[:a] + new + s[b:]
s = s.replace("import { makeMonkey, makeBoar, makeCapy, makeCrab, makeFlamingo } from './creatures.js';", "import { makeMonkey, makeBoar, makeCapy, makeCrab, makeFlamingo } from './creatures.js';\nimport { makeCrabModel } from './crab_model.js';", 1)
a = s.index("  // crabs on beaches")
b = s.index("  // flamingos at the river mouth")
spawn = open(r'D:\Paradise Island\blender\crab_spawn.js', encoding='utf-8').read()
s = s[:a] + spawn + s[b:]
if 'getSlope' not in s.split('class Monkey')[0]:
    s = s.replace("import { getHeight, riverDist,", "import { getHeight, getSlope, riverDist,", 1)
open(p, 'w', encoding='utf-8').write(s)
print('ok')
