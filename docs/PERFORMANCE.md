# Performance: where the frame time goes

This is the record of the performance investigation (branch `feature/new-monkey`). The numbers are measured, and the raw summaries are in
`docs/performance/`. Reproduce them with **Run Performance Benchmark.bat** (see below).

## Method

- **Benchmark:** `src/dev/perf_bench.js`, enabled with `?perf=1` (off in normal play; the frame loop only checks one flag).
  It times each frame in three parts: the update (simulation), the render call on the CPU, and the GPU (WebGL timer queries
  where the browser allows them). It also records draw calls, triangles, percentiles and the heap size.
- **Scenes** (fixed camera, so runs compare): `lagoon` (the chromis school over the reef), `jungle48` (the 48-monkey troop),
  `wideIsland` (the whole island from high above), `castawayEye` (eye level beside the castaway), `moving` (a slow orbit over the island).
- **Machine:** NVIDIA GeForce RTX 2070 SUPER, Direct3D 11 through ANGLE, Chrome 155 under DevTools control, canvas 1920 x 1080,
  device pixel ratio 1, high quality, automatic quality switching **off** (`?noauto`, see below).
- **Driver:** `cdp` scripts in the working scratchpad drive Chrome (headless and visible). A bare `requestAnimationFrame` loop on an
  empty page runs at 60.1 fps (median 16.7 ms), so the browser's frame pacing does not cap the game.

## Why the first numbers (35–36 fps) were what they were

1. **Automatic quality was changing the result.** `autoQuality` in `main.js` steps the quality down whenever the average frame is
   above 36 ms, so the high, medium and low runs were not really separate. Benchmarks now run with `?noauto`.
2. **The frame is limited by the CPU's work for drawing, not by the GPU's fill.** Draw calls per frame were 1,300 to 2,900, and the
   renderer's CPU time was about 9 us per draw. The GPU was busy for 10 to 12 ms, and the two overlap.
3. **Quality levels barely differ at 1920 x 1080 with a pixel ratio of 1.** High and low render the same pixels (only MSAA, bloom and
   shadow-map resolution change), and the GPU difference between them is about 1 to 2 ms. The draw calls and CPU time are the same
   at every level. That is why the three levels were nearly identical.
4. **Each skinned part had its own skeleton.** A monkey had 14 skinned parts and 14 skeletons, the tang school 384, the gulls 276.
   Each skeleton's bone texture was re-uploaded to the GPU every frame.
5. **The inactive monkey rig was still updated.** Each monkey has a near and a far skeleton (102 bones); the hidden one was traversed
   and its bones recomposed every frame.

## What was changed (committed)

| Change | Where | Effect |
|---|---|---|
| Parts of one creature with identical bones share one `Skeleton` | `skeleton_share.js` | skeleton updates and bone-texture uploads per frame drop sharply |
| Skinned parts that share a skeleton, parent, matrices, attributes and one material merge into one skinned mesh (one material group per part) | `skeleton_share.js` | skinned meshes 1,409 to 273; meshes 3,893 to 2,709; checked: vertex and index counts and bounds identical for all 255 merges |
| The hidden monkey rig is detached from the scene while it is not drawn | `monkey_model.js` | its 102 bones are no longer updated each frame |
| Benchmark, A/B tools and an updater profiler | `perf_bench.js`, `perf_hooks.js` | measurement only |

## Results (1920 x 1080, high quality, automatic quality off)

Average frames per second (median frame time) before and after the commit `d6e6f49` and the removal of the experiments:

| Scene | Before | After | Median frame before | Median frame after |
|---|---|---|---|---|
| Lagoon (schools over the reef) | 48.0 | 49.8 | 20.5 ms | 19.6 ms |
| Jungle (48 monkeys) | 52.2 | 59.7 | 18.9 ms | 16.5 ms |
| Wide island | 38.9 | 47.7 | 25.5 ms | 20.7 ms |
| Castaway, eye level | 46.5 | 51.8 | 20.9 ms | 19.0 ms |
| Moving orbit | 44.7 | 49.4 | 22.3 ms | 20.0 ms |

Quality levels after the changes (`docs/performance/quality-levels-after-1080p.json`):

| Scene | High | Medium | Low |
|---|---|---|---|
| Lagoon | 51.2 fps, GPU 12.5 ms, render CPU 14.2 ms | 50.9 fps, GPU 11.8 ms, render CPU 14.7 ms | 55.8 fps, GPU 9.9 ms, render CPU 13.8 ms |
| Jungle | 56.2 fps, GPU 11.8 ms | 57.6 fps, GPU 11.6 ms | 60.0 fps, GPU 10.6 ms |
| Wide island | 48.8 fps, GPU 11.5 ms | 48.7 fps, GPU 10.8 ms | 49.5 fps, GPU 9.7 ms |

**Medium renders 2400 x 1350 on this screen, which is more pixels than high (1920 x 1080).** Its fixed pixel ratio of 1.25 is above
the native ratio that high uses on a pixel-ratio-1 display. This is a configuration fact to decide on, not something the benchmark
changed. It is not applied here.

## Measured cost of each subsystem (A/B, one subsystem hidden at a time)

These are single 5-second runs per subsystem, so they are indicative. The machine varies by several frames per second between runs.
Raw values in `docs/performance/ab-shadow-pass-and-categories-before.json`.

| Subsystem | Jungle: frame time saved | Lagoon: frame time saved | Notes |
|---|---|---|---|
| Shadow pass (all shadow casters) | about 6 ms (draws 1,850 to 630) | about 3 ms | the largest single cost in the jungle |
| Other creatures (birds, rats, crabs, boars, owls...) | about 5 ms | about 5 ms | 171 creature groups, many separate parts |
| Monkeys (48) | about 5 ms | about 4 ms | far rig, body and parts; before the merge |
| School fish and the tang rigs | about 0 ms | about 2 ms | the 32 rigged tangs are the cost, not the fish |
| Instanced scenery (plants, rocks) | about 0.5 ms | about 1 ms | culled per instanced mesh, not per instance |
| Static scenery (terrain, buildings) | about 0.5 ms | about 0.5 ms | |
| Water | about 1 ms | about 0.5 ms | |
| Update (simulation) | 4.8 ms | 4.0 ms | see below |

Interleaved checks (`docs/performance/ab-interleaved-skeleton-share.json`): sharing skeletons improved the lagoon from 43.6 to
48.5 fps and the wide island from 38 to 44 fps.

## The update (simulation) cost

The updaters together take about 3.5 ms in the jungle view. The largest are the creature update loop (about 1.8 ms) and the castaway
lookup loop (about 1.0 ms). The rest of the update (about 1.3 ms) is the camera, weather and time of day. The CPU profile shows the
engine's own matrix work as the biggest JavaScript cost: `updateMatrixWorld` took about 15% and matrix multiplication about 11% of
the sampled time (much of it from the bones of 48 monkeys and the skeleton updates).

## What was tried and not kept

- **Shadow budget** (small creature parts and far creatures left out of the shadow pass, first by `castShadow`, then by layers).
  The averages improved by 3 to 5 fps, but the 95th-percentile frame rose from about 19 ms to about 33 ms, so frames stuttered.
  Each rule alone caused it, and so did the change in flags, even with no toggling after start-up. It was removed.
- **Freezing static objects' matrices** (no per-frame recomposition). It gained about 1 ms (2 to 5 fps, within the noise). It was not
  kept, because it depends on knowing which objects never move, and the sea sheets do move with the tide.
- **Alternating shadow-map updates.** It doubled the frame time on the frames it skipped (stutter). Rejected.

## What limits 60 fps now

- **Draw calls:** 1,500 to 2,800 per frame. Creature parts, the shadow pass and scenery still each cost one call per mesh and material.
  Scenery has about 350 static meshes and 121 instanced ones; creature parts have most of the rest. Merging static scenery by material
  and chunk, and chunking instanced meshes so they are culled per area, would remove a further few hundred calls without visible change.
- **Tails:** the 95th-percentile frame is 19 to 22 ms in the lagoon and wide views, against a median of 17 to 20 ms. Frames over 25 ms
  appear in the lagoon and wide views when the GPU waits for the CPU's queued work.
- **Materials:** 346 material objects across the scene (171 distinct by a rough signature). Sharing identical materials would reduce
  state changes; it was not done.
- **Quality:** high and low do not differ in CPU cost. Changing quality cannot make the game faster while the draw calls dominate.

## Results against the 60 fps goal

Not yet met everywhere. The jungle reaches 56 to 60 fps with a median of 16.5 to 17.6 ms. The lagoon and wide island reach 49 to 56 fps,
with medians of 17.5 to 20.7 ms. The target median is 13 to 14 ms, so about 20 to 30% more frame time must go. The next items, in
order of expected gain: static-scenery batching and instanced chunking (draw calls); shadow casters with a fix for the tail issue;
shared materials; and the creature update loops (distance-based update intervals).

## Run the benchmark yourself

Double-click **Run Performance Benchmark.bat** in the project folder. It starts the local server if needed and opens the game with
the benchmark on. Keep the browser window at 1920 x 1080 and in front. When the game is ready, the benchmark runs its five scenes
(about two minutes) and saves `paradise-island-benchmark.json` to your Downloads folder. Share that file to compare results.
