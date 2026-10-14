import os
os.chdir(r'D:\Paradise Island')
p = 'src/human.js'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert a in s, a[:70]
    s = s.replace(a, b, 1)


rep("import { fx } from './props.js';", "import { fx, makePaddle } from './props.js';")
rep("    if (t < 16.4) return 'fish';", "    if (t < 13.4 || !cn) return t < 16.4 ? 'fish' : 'hike';\n    if (t < 16.4) return 'canoe';")
rep("    if (act === 'shelter') return phase === 'goto'", """    if (act === 'canoe') {
      if (phase === 'goto') return 'Heading down the beach to launch his outrigger canoe.';
      if (phase === 'board') return 'Climbing aboard his outrigger canoe.';
      if (phase === 'launch' || phase === 'settle') return 'Paddling his outrigger canoe out across the lagoon.';
      if (phase === 'work') return `Fishing from the canoe, drifting on the lagoon: ${sub === 'bite' ? 'a bite!' : sub === 'reel' ? 'reeling one in!' : sub === 'show' ? 'admiring his catch.' : 'waiting for a bite.'}${catchText()}`;
      if (phase === 'back' || phase === 'dock') return 'Paddling the canoe home to the beach.';
      if (phase === 'exit') return 'Stepping out onto the sand and hauling the canoe up.';
      return 'Resting on the beach beside his canoe, watching the lagoon.';
    }
    if (act === 'shelter') return phase === 'goto'""")
rep("  const mkFish = (raw) => {", """  const cn = falls.canoe || null;
  const paddle = makePaddle(); paddle.visible = false; paddle.position.set(0, -0.04, 0.03); me.armR.hand.add(paddle);
  const paddleTip = new THREE.Object3D(); paddleTip.position.y = -1.2; paddle.add(paddleTip);
  const mkFish = (raw) => {""")
rep("    staff.visible = rod.visible = spear.visible = stick.visible = coco.visible = fishHeld.visible = fishSpeared.visible = false;", "    staff.visible = rod.visible = spear.visible = stick.visible = coco.visible = fishHeld.visible = fishSpeared.visible = paddle.visible = false;")
rep("    act = a; phase = 'init'; sub = ''; stuck = 0; lastOff = 0; hurry = true; clearProps(); me.chest.scale.set(1, 1, 1);", "    if (act === 'canoe' && a !== 'canoe') leaveCanoe();\n    act = a; phase = 'init'; sub = ''; stuck = 0; lastOff = 0; hurry = true; clearProps(); me.chest.scale.set(1, 1, 1);")
rep("    else if (act === 'fish') fishUpdate(dt, t);", "    else if (act === 'fish') fishUpdate(dt, t);\n    else if (act === 'canoe') canoeUpdate(dt, t);")
rep("    else if (a === 'swim') { x = COVE.x - 12;", "    else if (a === 'canoe') { x = boardSpot.x; z = boardSpot.z; y = getHeight(x, z); heading = 0; phase = 'init'; }\n    else if (a === 'swim') { x = COVE.x - 12;")
block = open(r'D:\Paradise Island\blender\patch_canoe_block.js', encoding='utf-8').read()
rep("  /* ================================================================ CAMP: breakfast coconut / grilled dinner */", block + "  /* ================================================================ CAMP: breakfast coconut / grilled dinner */")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
