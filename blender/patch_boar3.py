import os, re
os.chdir(r'D:\Paradise Island')


def rw(p, fn):
    s = open(p, encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    s2 = fn(s)
    assert s2 != s, p
    open(p, 'w', encoding='utf-8', newline='').write(s2.replace('\n', '\r\n') if crlf else s2)


def boar_js(s):
    a = "      const p = this.scratchAt; if (p) this.heading = Math.atan2(p.z - this.z, p.x - this.x) + Math.PI / 2 * (rnd() < 0.5 ? 1 : -1) - Math.PI / 2 + Math.PI / 2;"
    b = "      const p = this.scratchAt; if (p) this.heading = Math.atan2(p.x - this.x, p.z - this.z) + (rnd() < 0.5 ? 1 : -1) * Math.PI / 2;"
    assert a in s
    s = s.replace(a, b)
    a = "          if (K.fear === 'wary') { if (this.baby && L) this.state = 'idle'; this.flee(toCam + Math.PI + rr(-0.5, 0.5), rr(14, 22)); }"
    b = "          if (K.fear === 'wary') { if (this.baby && L) { this.go(L.x + rr(-1, 1), L.z + rr(-1, 1), 'walk'); this.fast = true; this.fleeT = 3; } else this.flee(toCam + Math.PI + rr(-0.5, 0.5), rr(14, 22)); }"
    assert a in s
    s = s.replace(a, b)
    return s


rw('src/boar.js', boar_js)


def land(s):
    a = s.index("/* ====================================================================== BOAR */")
    b = s.index("/* ====================================================================== CAPYBARA */")
    s = s[:a] + s[b:]
    s = s.replace("import { makeCrabModel } from './crab_model.js';", "import { makeCrabModel } from './crab_model.js';\nimport { spawnBoars } from './boar.js';", 1)
    a = s.index("  const boarHomes = ")
    b = s.index("  // capybaras along the river / pool")
    s = s[:a] + "  const boars = spawnBoars(ctx);\n" + s[b:]
    return s


rw('src/fauna_land.js', land)


def main(s):
    s = s.replace("import { loadCrabModel } from './crab_model.js';", "import { loadCrabModel } from './crab_model.js';\nimport { loadBoarModel } from './boar_model.js';", 1)
    s = s.replace("  await loadCrabModel();", "  await loadCrabModel();\n  await loadBoarModel();", 1)
    return s


rw('src/main.js', main)


def game(s):
    a = "if (c.name !== 'Wild boar' || !c.sim) continue;"
    b = "if (!c.sim || !c.sim.isBoar || c.sim.baby) continue;"
    assert a in s
    return s.replace(a, b)


rw('src/survival/game.js', game)
print('ok')
