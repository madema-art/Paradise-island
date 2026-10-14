import os
os.chdir(r'D:\Paradise Island')


def rw(p, pairs):
    s = open(p, encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    for a, b in pairs:
        assert a in s, (p, a)
        s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)


rw('src/boar.js', [
    ("this.headDown * (1.12 + rootNudge * 0.7)", "this.headDown * (1.38 + rootNudge * 0.7)"),
    ("const LIE = { front: [1.2, 1.7], rear: [-1.0, 1.9] };", "const LIE = { front: [1.2, 1.7], rear: [-1.35, 2.7] };"),
])
rw('blender/boar_color.py', [
    ("flecks = np.clip((g1 * 0.8 + g2 * 0.55 + g3 * 0.15 - 0.42) * 2.2, 0, 1)", "flecks = np.clip((g1 * 0.8 + g2 * 0.55 + g3 * 0.15 - 0.42) * 1.5, 0, 1) * 0.85"),
])
rw('blender/boar_build.py', [("decimate_to(body_ob, 1900)", "decimate_to(body_ob, 2700)")])

NEW = """  'Silver tusker': {
    status: 'real', sci: 'Sus scrofa (old male)',
    note: 'A very old solitary boar. Males grey with age and their tusks keep growing for life.',
    physical: 'The biggest animal on the island: a heavy, grizzled grey body, a shaggy dark mane and curved tusks that can grow longer than a hand.',
    size: 'Up to 1.8 m long and well over 100 kg; old males can be half as heavy again as sows.',
    diet: 'Omnivore: roots, tubers, fallen coconuts, eggs and carrion.',
    habitat: 'Forest and scrub; keeps a large territory of its own.',
    social: 'Old males live alone and only join a sounder to mate. He stands his ground, grunting and champing his jaws, and bluff-charges anyone who comes too close.',
    activity: 'Forages at dawn and dusk, wallows through the heat of the day.',
    reproduction: 'Males compete for sows with shoulder-to-shoulder shoving; thick gristle over the shoulder (the shield) protects against tusks.',
    ecology: 'The tusks are lower canines that sharpen against the upper ones as the jaw closes.',
    facts: ['The upper canines whet the lower ones to a razor edge every time the boar grinds its jaws.', 'A boar that stands very still with its head up is usually deciding whether to run or charge.'],
  },
  'Ginger boar': {
    status: 'real', sci: 'Sus scrofa domesticus (feral)',
    note: 'Feral pigs descended from escaped farm animals. On Pacific islands they are common and come in many colours.',
    physical: 'A rusty-red coat, a short mane and small tusks, with ears that flop outward.',
    size: 'About 1.0-1.5 m long, 60-120 kg.',
    diet: 'Omnivore: roots, windfall fruit, eggs, crabs and scraps.',
    habitat: 'Forest edges and clearings near water.',
    social: 'Sows and young form small groups. Feral pigs are less afraid of people than true wild boar and may walk up to look.',
    activity: 'Rests in the midday heat, most active early and late in the day.',
    reproduction: 'Feral sows can have two litters a year of six to ten piglets.',
    ecology: 'Feral pigs dig up large areas and eat the eggs of ground-nesting birds, a serious problem on islands.',
    facts: ['Feral pigs lose their domestic colours slowly, but the piglets of ginger pigs may still show stripes.', 'Pigs have no sweat glands, which is why they wallow.'],
  },
  'Spotted pig': {
    status: 'real', sci: 'Sus scrofa domesticus (feral)',
    note: 'Black-and-pink pigs like those carried on old sailing ships, left behind and gone half wild.',
    physical: 'Cream-pink skin with big black patches, lop ears and only a short, thin mane.',
    size: 'About 1.0-1.4 m long, 60-110 kg.',
    diet: 'Omnivore: roots, fruit, coconuts, insects and anything dropped by people.',
    habitat: 'Open forest, scrub and the edge of the temple clearing.',
    social: 'Sociable and curious: they come to see anyone standing quietly, then lose interest.',
    activity: 'Dozes in the shade at noon and wallows to stay cool and keep the sun off pink skin.',
    reproduction: 'Litters of six to ten piglets, born in a nest of grass and leaves.',
    ecology: 'Pale pigs sunburn easily, so they use mud as sunscreen.',
    facts: ['No two spotted pigs share the same pattern.', 'Mud acts as a sunscreen and keeps flies off.'],
  },
"""
s = open('src/species.js', encoding='utf-8', newline='').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')
a = "  Capybara: {"
assert a in s
s = s.replace(a, NEW + a, 1)
s = s.replace("const BOAR_STATE = { idle: 'Resting', walk: 'Walking', root: 'Rooting in the leaf litter' };",
              "const BOAR_STATE = { idle: 'Standing and looking about', walk: 'Walking', root: 'Rooting in the leaf litter', alert: 'Alert: head up, watching you', bluff: 'Bluff-charging', flee: 'Running away', zoom: 'Racing about with its siblings', sleep: 'Asleep', rest: 'Dozing in the shade', wallow: 'Wallowing in the mud', drink: 'Drinking at the river', scratch: 'Rubbing against a palm trunk', approach: 'Coming over to look at you', tosleep: 'Looking for a place to lie down', towallow: 'Heading for the mud', todrink: 'Heading for the river', toscratch: 'Heading for a scratching post' };", 1)
a = "  } else if (c.name === 'Wild boar' || c.name === 'Boar piglet') {\n    sub('Doing', BOAR_STATE[s.state] || 'Active');"
assert a in s
s = s.replace(a, "  } else if (s.isBoar) {\n    sub('Doing', BOAR_STATE[s.state] || 'Active');\n    sub('Age class', s.age);\n    sub('Sex', s.sex);\n    sub('Temper', s.K && ({ wary: 'Wary: keeps its distance', bold: 'Bold: stands its ground', curious: 'Curious: comes to look' }[s.K.fear]));", 1)
open('src/species.js', 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)

# the sounds: a deeper grunt for the tusker, a squeal for piglets
rw('src/audio.js', [
    ("    boar(d, t) {\n      const f = lp(d, 480);\n      for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) {\n        const tt = t + i * 0.34;\n        osc('sawtooth', 120, 66, tt, 0.26, 0.7, f);\n        nz(tt, 0.2, 0.25, d, { f: 700, q: 0.8 });\n      }\n    },",
     "    boar(d, t, dist, p = 1) {\n      const f = lp(d, 480 * p);\n      for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) {\n        const tt = t + i * 0.34;\n        osc('sawtooth', 120 * p, 66 * p, tt, 0.26, 0.7, f);\n        nz(tt, 0.2, 0.25, d, { f: 700 * p, q: 0.8 });\n      }\n    },\n    tusker(d, t, dist) { voices.boar(d, t, dist, 0.72); },\n    piglet(d, t) {\n      const f = bp(d, 2200, 1.4);\n      const n = 2 + Math.floor(rnd() * 3);\n      for (let i = 0; i < n; i++) { const tt = t + i * 0.2; osc('sawtooth', rr(1500, 2000), rr(900, 1200), tt, 0.14, 0.4, f, { vib: [30, 60] }); }\n    },"),
    ("    'Wild boar': { v: 'boar', iv: [8, 20], range: 55, ref: 6 },",
     "    'Wild boar': { v: 'boar', iv: [8, 20], range: 55, ref: 6 },\n    'Silver tusker': { v: 'tusker', iv: [12, 28], range: 65, ref: 7 },\n    'Ginger boar': { v: 'boar', iv: [9, 22], range: 50, ref: 6 },\n    'Spotted pig': { v: 'boar', iv: [8, 20], range: 50, ref: 6 },\n    'Boar piglet': { v: 'piglet', iv: [6, 16], range: 30, ref: 4 },"),
])
print('ok')
