import os
os.chdir(r'D:\Paradise Island')


def rw(p, fn):
    s = open(p, encoding='utf-8').read()
    s2 = fn(s)
    assert s2 != s, p
    open(p, 'w', encoding='utf-8').write(s2)


# ---------------------------------------------------------------- audio: survival sound effects
SV_AUDIO = """
  /* ------------------------------------------------------------ survival mode effects */
  const SV = {
    pickup(d, t) { osc('triangle', 620, 980, t, 0.09, 0.22, d); osc('sine', 1240, 1500, t + 0.05, 0.08, 0.1, d); nz(t, 0.05, 0.12, d, { ft: 'highpass', f: 3000 }); },
    thud(d, t) { voices.thud(d, t, 0.6); },
    chop(d, t) { nz(t, 0.08, 0.5, d, { ft: 'lowpass', f: 900 }); osc('sine', 180, 70, t, 0.12, 0.5, d); nz(t + 0.01, 0.05, 0.25, d, { ft: 'highpass', f: 2500 }); },
    tap(d, t) { nz(t, 0.03, 0.4, d, { f: 1800, q: 2 }); osc('square', 320, 200, t, 0.04, 0.08, d); },
    craft(d, t) { [523, 659, 784].forEach((f, i) => osc('triangle', f, null, t + i * 0.07, 0.3, 0.18, d, { attack: 0.01 })); nz(t, 0.05, 0.3, d, { f: 2000 }); },
    eat(d, t) { for (let i = 0; i < 4; i++) nz(t + i * 0.17, 0.09, 0.32, d, { ft: 'lowpass', f: 600 + 200 * i }); },
    drink(d, t) { for (let i = 0; i < 3; i++) { osc('sine', 300 + i * 60, 160, t + i * 0.22, 0.14, 0.28, d); nz(t + i * 0.22, 0.12, 0.12, d, { f: 1200, q: 1 }); } },
    level(d, t) { [523, 659, 784, 1047, 1319].forEach((f, i) => osc('triangle', f, null, t + i * 0.09, 0.55, 0.2, d, { attack: 0.01 })); },
    quest(d, t) { [784, 988, 1175].forEach((f, i) => osc('triangle', f, null, t + i * 0.1, 0.45, 0.18, d, { attack: 0.01 })); },
    hurt(d, t) { osc('sawtooth', 220, 90, t, 0.25, 0.4, d); nz(t, 0.12, 0.3, d, { ft: 'lowpass', f: 500 }); },
    break(d, t) { nz(t, 0.22, 0.5, d, { ft: 'highpass', f: 1500 }); osc('square', 200, 60, t, 0.2, 0.25, d); },
    open(d, t) { osc('triangle', 440, 660, t, 0.08, 0.15, d); },
    nope(d, t) { osc('square', 180, 140, t, 0.12, 0.14, d); },
    bite(d, t) { osc('sine', 900, 1500, t, 0.12, 0.3, d); osc('sine', 1500, 900, t + 0.12, 0.12, 0.25, d); },
    catch(d, t) { voices.splash(d, t, 0.8); [659, 880, 1175].forEach((f, i) => osc('triangle', f, null, t + 0.1 + i * 0.09, 0.4, 0.16, d, { attack: 0.01 })); },
    fire(d, t) { nz(t, 0.5, 0.4, d, { f: 900, f1: 2500, q: 0.6, attack: 0.06 }); },
    sizzle(d, t) { nz(t, 1.2, 0.3, d, { ft: 'highpass', f: 3500, attack: 0.1 }); },
  };
  events.on('sfx', (name) => { if (ac && started && st.sfxOn) flat(1.4, (d, t) => (SV[name] || SV.tap)(d, t)); });
  events.on('crackle', (x, y, z) => { if (ac && started) at(V3(x, y, z), 3, 0.3, (d, t) => voices.crackle(d, t)); });
"""


def audio(s):
    a = "  events.on('swim', (run) => {"
    i = s.index(a)
    j = s.index('\n', i)
    return s[:j + 1] + SV_AUDIO + s[j + 1:]


rw('src/audio.js', audio)

# ---------------------------------------------------------------- index.html: styles + the entry button
css = open(r'D:\Paradise Island\src\survival\survival.css', encoding='utf-8').read()


def html(s):
    s = s.replace('</style>', css + '</style>', 1)
    s = s.replace('<div id="wxline"></div>', '<div id="wxline"></div>\n    <button id="svbtn" class="sv-entry">▶ Play survival</button>', 1)
    return s


rw('index.html', html)

# ---------------------------------------------------------------- main.js
def main(s):
    s = s.replace("import { initUI } from './ui.js';", "import { initUI } from './ui.js';\nimport { initSurvival } from './survival/index.js';", 1)
    s = s.replace("  initUI({ presets, secrets, volcano, audio, labels });", "  initUI({ presets, secrets, volcano, audio, labels });\n  initSurvival();", 1)
    return s


rw('src/main.js', main)
print('ok')
