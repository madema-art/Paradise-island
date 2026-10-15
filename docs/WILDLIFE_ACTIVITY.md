# Wildlife activity, follow-camera visibility and the performance budget

What changed, why, and how it was measured. Code: `src/camera_occlusion.js`, `src/ai_sched.js`, `src/camera.js`, `src/fauna_common.js`, `src/boar.js`, `src/rat.js`, `src/boa.js`,
`src/boa_model.js`, and the `observed()` methods of the birds (`fauna_sea.js`, `owl.js`, `frigatebird.js`, `lorikeet_flock.js`). Benchmarks: `src/dev/perf_bench.js`, `src/dev/shots.js`.

## Why the animals looked inactive

| Animal | What was wrong | Found how |
|---|---|---|
| **Pigs** | (1) The free and follow cameras counted as a *person*: any pig within its alert radius (9 to 13 m) stopped, stared at the camera and stayed alert, and the follow camera orbits at about 12 m, so a followed pig did almost nothing. (2) A pig on a steep slope could not walk at all: the step check refused the very first step, the state flipped back to idle, and it tried again every second for ever (the sow by the old camp stood on a slope of 0.45 for whole minutes). (3) Idle pauses after every walk were 1.5 to 4.5 s. | Followed a pig for 120 s of game time and logged its state changes: `walk` lasted zero frames each time. Read `slope` around the pig: 0.43 to 0.46 all the way round, against the walking limit of 0.45. |
| **Rats** | 16 rats over 8 burrows, a walking pace of 0.55 to 0.85 m/s, and long sits (4 to 8 s to eat). They were also hidden for 10 to 30 s after every fright, hidden by default (and the scene starts by day), and any camera within 5.5 m made them bolt, so a follow camera never saw one. | Read the state machine and the timings; the benchmark scene at night showed a rat in the open about a third of the time, ambling. |
| **Boas** | A walking speed of 0.34 m/s, night only, and one place to be: the ground. The body wave was also wrong: the model's joint spacing (`m.L`) was computed from the wrong two joints (0.62 instead of 0.037), so the wave was 17 times too long and the body hardly undulated; the wave's ground distance was in metres but its spacing in model units, so the body slid sideways over the ground. | Measured the world distance between joints 0 and 1 (0.081 m at the species size) against `m.L` (0.62). |
| **Birds** | Perched birds only left on a timer (gulls 10 to 30 s, frigatebirds 24 to 50 s); nothing responded to being picked in the Field Guide. | Read the state machines. |

## What was changed

**An unseen observer.** `actors.camScale` (set each frame in `camera.js`): the walking and survival cameras are people (1.0), the free and follow cameras are an observer (0.38), so
animals only mind them from 38 % of the old distance. `nearestPerson` applies it, which also covers monkeys, rats and boars. Pigs that have watched something harmless for 8 s stop
being alert for 25 to 45 s (habituation).

**Pigs** (`boar.js`). The step check now allows slopes to 0.62 (targets are still chosen on ground under 0.45) and a blocked pig calls `unstick()` (firm ground, toward home) after 0.6 s.
New states: `graze` (a slow forage walk, 0.75 m/s, nose down, 7 to 14 s), `tocheck` and `nuzzle` (a sow goes to a piglet and stands nose to nose for 3 to 5 s; piglets register with their mother).
The day routine is now: root 24 %, graze 18 %, scratch on a palm 6 %, drink 6 %, check a piglet 8 %, walk 18 %, idle 20 % (it was root 40, scratch 10, drink 8, walk 30+, idle 12);
the pause after arriving is 0.8 to 2.5 s. Wallowing, sleeping in the heat or at night, fleeing, bluff charges, piglets racing about and following the sow are unchanged.
Measured over 150 s of game time at 10:00, all 20 pigs: walk 39 % (mostly piglets trailing their mothers), root 16 %, graze 10 %, idle 13 %, rest 8 %, nuzzle 1 %, scratch and drink 2 % each; adults covered 112 m, piglets 305 m.

**Rats** (`rat.js`). Foraging is now stop-start: a dash of 0.5 to 1.2 s at 1.4 to 2.4 m/s, then a stop of 0.35 to 1.3 s to listen (55 % of the stops sit up on the haunches, ears up) or sniff.
A person or a boa makes it freeze for 0.3 to 0.7 s and then sprint (3.4 m/s) for the nearest burrow; an owl makes it freeze (0.8 to 2.2 s) as before. Some trips cross to another burrow within 70 m and the rat adopts it as home.
Time-of-day behaviour is unchanged (bold at night, cautious at dusk and dawn, down by day). Picking a rat in the Field Guide makes a hidden one look out within 0.4 to 1.6 s and stay out for 40 s (`observed()`): a nudge, not an override.
At night over 180 s: 10 of 16 rats in the open on average, 100 to 170 m travelled each, 33 emergences, 21 flights to cover, 8 freezes.

**Boas** (`boa.js`). Palms: when it rests it now goes to a palm with probability 0.6 (day or night), crosses the ground to the foot of the trunk, and **the head leads along a helix up the trunk**
(`climb`, 0.42 m/s, a 35 degree climb angle) while the body follows the head's track (a trail of points 4 cm apart; each joint is where the head was one body-length-fraction earlier, with its back to the bark).
Near the crown it winds 1.15 turns round the trunk (`coil`) and rests there for 70 to 150 s (`treerest`), then comes down head first (`descend`), slides off the foot (`dismount`) and the ground pose takes over from the shape the trail left
(a 1.6 s blend). Nothing is ever placed on a branch: every position is reached by crawling. At night a boa resting in a palm comes down hunting if a rat is in the open within 6 m of the trunk.
A coiled boa also makes short daytime outings (0.45), and the ground speeds are up (search 0.55, stalk 0.95, home 0.6 m/s). The palms come from `ctx.palms`, filtered once (tall, firm ground, clear of the temple, camp and volcano) and cached per boa (the 10 nearest to home).
Measured over 150 s of daytime for the three boas: 69 % of the time on a palm (climb 12, coil 2, rest 38, descend 18), 21 % coiled on the ground, 10 % crossing to or from a palm. The hunting sequence is untouched.
Fixed on the way: the joint spacing (`boa_model.js`), the wave's distance units, the body height on the ground.

**Birds** (`observed()`, called by `followCreature` for the one animal picked, so there is no scan): a perched gull takes off; a perched tern takes wing and tries a plunge dive within 7 s; a perched frigatebird takes off into the wind;
a lorikeet flock leaves for the next flowers; a sea eagle turns to hunting within 5 to 12 s (it never perches); a barn owl wakes and goes out *at night* (by day she sleeps on); flamingos are untouched. Checked: gull perch, takeoff, patrol;
tern air, hover, plunge; frigatebird perch, takeoff, thermal; lorikeet feed, takeoff, fly, approach; eagle stoop after 10 s; owl roost, preen, takeoff, hunt at 22:00 and roost all through a day.

**Camera occlusion** (`camera_occlusion.js`). While a creature is followed (not a school, not first person or survival), scenery that blocks the view of it fades to 24 % (9 % when the camera is inside the plant, where leaves pile up) and comes back when it no longer blocks.
- *What can fade:* instances of palms, banyans, breadfruit, pandanus, bamboo, banana, ferns, bushes, naupaka, hibiscus, plumeria, bougainvillea, taro, ti, glory, clumps, blossoms, jungle trees A and B, and boulders. Terrain, water, structures (the temple columns), the wreck, the grotto: never.
- *How it fades one instance:* the instance is taken out of its InstancedMesh (matrix zeroed, or hidden in its vegetation-LOD family) and drawn by a pooled ghost mesh (8 slots) with a clone of the material, cloned once per slot and material
  (the wind shader is copied over), opacity eased per frame. When whole again, the original matrix is put back and the ghost released. Other instances sharing the material are never touched (checked: the palm material's opacity stays 1 and `transparent` false).
- *How it decides:* a registry built once, in 1.2 ms slices after 9 s (a grid of 16 m cells over 4050 instances, and 48 cluster spheres per geometry for trunk and crown); every 0.12 s five rays go from the camera to the animal (centre, above, below, left, right)
  and the cluster spheres of the instances in the cells along them are tested in each instance's own space. An instance fades only if it blocks the centre ray and at least one other (a thin branch does not), and stays faded 0.5 s after it last blocked. At most 8 at once, nearest first.
- *Restore:* switching animals (the old ones come back as the new target no longer blocks them), releasing the follow (all come back over about half a second), first person, survival mode and any change of camera mode (at once).
- *Not fadeable (left out on purpose):* the instanced grass, wildflowers, seagrass and coral (too low to block a view), and anything that is not an instance (structures, the wreck, the temple, terrain). Boulders and bushes fade like trees.

## Performance

Method: `window.__perfManualAll()` (`src/dev/perf_bench.js`) steps the real game 450 frames of 1/30 s after 90 warm-up frames, per scene, timing the update; then renders 24 frames for draw calls and render CPU.
The page's own frame callback is stopped (`requestAnimationFrame = () => 0`) and the pane is software-rendered, so **update ms and allocation are the numbers to trust; draw calls and render CPU only compare when the camera sees the same thing,
and the simulation is random, so they move by hundreds between runs**. The baseline is the commit before this work, built in a second worktree and measured the same way. See `docs/performance/wildlife-overhaul-results.md`.
