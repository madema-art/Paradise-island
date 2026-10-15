# Wildlife overhaul: performance, before and after

Before = commit `5f50637` (built in a second worktree, same benchmark file). After = the working tree with the wildlife overhaul.
Both measured the same way (`window.__perfManualAll(undefined, { frames: 450, warm: 90, renderFrames: 24 })`, the page's frame callback stopped, 1/30 s steps),
two runs of each, alternating. Update ms is the whole `step()` (camera, weather, every updater) per frame. The simulation is random, so single runs move by about 0.3 ms;
the two-run means are what is compared.

| Scene | Before, run A / B (mean update ms) | After, run 1 / 2 | Before mean | After mean | Change |
|---|---|---|---|---|---|
| Wide view of the island | 3.43 / 3.62 | 3.18 / 3.09 | 3.53 | 3.14 | **-0.39 (-11 %)** |
| Jungle with the 48 monkeys | 4.49 / 4.15 | 4.38 / 4.36 | 4.32 | 4.37 | +0.05 (noise) |
| Following a wild boar | 4.64 / 3.88 | 4.06 / 3.59 | 4.26 | 3.83 | **-0.43 (-10 %)** |
| Following a sea eagle | 3.95 / 4.10 | 3.36 / 3.27 | 4.03 | 3.32 | **-0.71 (-18 %)** |
| Following a gull | 3.68 / 3.16 | 3.31 / 3.29 | 3.42 | 3.30 | -0.12 |
| Night, beside a rat burrow | 3.97 / 3.95 | 3.53 / 3.30 | 3.96 | 3.42 | **-0.54 (-14 %)** |
| Night, following a boa | 3.70 / 3.61 | 3.53 / 3.81 | 3.66 | 3.67 | +0.01 (noise) |

p99 update time is lower or equal in every scene (for example following a boar 6.8 / 6.1 before, 5.6 / 4.5 after). The largest single frame in each scene (60 to 70 ms in the wide view)
is the skeleton-merge pass of the first seconds (`skeleton_share.js`), the same before and after. An earlier version of the occlusion registry built in one 38 ms step and put a 170 to 230 ms frame into the first
benchmark scenes; it now builds in 1.2 ms slices (the largest slice is 2.7 ms), and that spike is gone.

Allocation (heap growth between frames) swings between about 150 and 700 KB a frame from run to run on both builds, so it is not a result either way.

## What the new features cost

| Feature | Cost | How measured |
|---|---|---|
| Occlusion check | 0.05 to 0.26 ms a check, one check per 0.12 s: about 0.01 to 0.03 ms a frame, only while an animal is followed | `stats.msPerCheck` in the game |
| Occlusion registry | 4050 instances, 38 ms in total, in slices of at most 2.7 ms, once, from 9 s after the start | `stats.buildMs`, `buildMaxStepMs` |
| Faded plants | 2 to 20 extra draw calls (1 to 3 % of a 600 to 1300 call frame) and 1 000 to 30 000 extra triangles (under 0.3 % of 10 M) while the view is blocked, 0 otherwise | the same frame rendered with the fade on, then off, on 12 creatures |
| Boa trail pose | 32 joints, no allocation; only while a boa is on a palm. The three boas together: 0.015 ms a frame on the ground, 0.038 ms with all three climbing | per-class timing of `update` |
| Rats (dash and pause, more time out) | all 16 rats together: 0.022 ms a frame before, 0.011 to 0.024 after | per-class timing of `update` |
| Pig states | none: all 20 pigs cost 0.30 ms a frame before the scheduler and 0.05 to 0.06 after | per-class timing |
| `observed()` | an event when a creature is picked: nothing per frame | |

## What paid for it

**Behaviour LOD for the land fauna** (`src/ai_sched.js`): creatures within 45 m of the camera update every frame, within 110 m every 2nd, within 220 m every 4th, beyond that every 8th (staggered by index,
the time they missed handed to the next update, capped at 0.25 s); the followed animal, a rat that is held, a boa that is striking and a monkey in a contest are never throttled; a hidden or dead rat updates every 8th frame.
Switching it off in the same page, interleaved (mean update ms): wide view 4.62 to 3.77, jungle 5.50 to 5.17, following a boar 6.12 to 5.39. That is 0.3 to 0.85 ms a frame, more than every cost above together.
Per class, at night with the camera away from them: the 48 monkeys 0.83 to 0.32 to 0.36 ms a frame, the 20 pigs 0.30 to 0.06, the three boas 0.015, the rats 0.011 to 0.024.
Rendering is untouched: the animals still move smoothly (they are moved and posed with the accumulated time; only the deciding and posing happen less often, and only far from the camera).

The occlusion system itself never traverses the scene, allocates only when it activates a plant, and uses one preallocated set of vectors, matrices and arrays.
