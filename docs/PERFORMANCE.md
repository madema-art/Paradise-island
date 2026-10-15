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

---

## Phase 2: closing the gap to 60 fps

Starting point: commit `a3c5258` (the sections above). Everything below was measured with the same benchmark (1920 x 1080, device
pixel ratio 1, high quality, automatic quality off). The raw summaries are in `docs/performance/`.

### Graphics quality (fixed)

The old presets set medium to a fixed pixel ratio of 1.25 and low to a fixed 1.0, whatever the screen, so medium could render more
pixels than high. Each level is now a cap on the screen's device pixel ratio: **high 1.75, medium 1.25, low 1.0** (`core.js`,
`setQuality`).

| Device pixel ratio | High buffer | Medium buffer | Low buffer |
|---|---|---|---|
| 1 | 1920 x 1080 (MSAA 4, bloom, shadow map 2048) | 1920 x 1080 (MSAA 2, bloom, 1536) | 1920 x 1080 (no MSAA, no bloom, 1024) |
| 2 | 3360 x 1890 | 2400 x 1350 | 1920 x 1080 |

On a pixel-ratio-1 screen the three levels now differ only in anti-aliasing, bloom and shadow resolution, which is what they cost.
Medium never renders more pixels than high.

### Draw calls, before and after (renderer draw calls per frame, averaged over the run)

| Scene | Before | After (runs 1 and 2) |
|---|---|---|
| Lagoon | 2,054 | 1,346 / 1,645 |
| Jungle (48 monkeys) | 1,306 | 785 / 883 |
| Wide island | 2,874 | 1,840 / 1,705 |
| Castaway, eye level | 1,936 | 1,139 / 937 |
| Moving orbit | 2,456 | 1,539 / 1,213 |

What changed the count:
- **Material groups** (`skeleton_share.js`): the triangles of a merged skin are gathered per material, so each material is one draw.
  Before, every part was a draw even when it shared a material with another part. Monkeys went from 144 draws to 96.
- **Rigid creature parts** (`skeleton_share.js`): separate meshes that hang from one bone and never move relative to it are merged per
  parent, after a check that their local transforms are unchanged over four seconds. 417 parts became 124 meshes.
- **Part instancing** (`part_instancing.js`): a creature part that appears in several creatures (same geometry and material) is drawn
  once, instanced, per 60 m cell. The creature keeps its own part meshes, moved to a layer no camera draws, so its bones still drive
  them. Instance matrices are written after the scene's matrices are updated, once per frame.
- **Skin culling** (`skeleton_share.js`): skinned creatures were never culled. Their bounds are now the bind pose with a generous margin,
  so off-screen creatures are skipped. It is switched on at boot.
- **Static instanced meshes** (`static_cull.js`): an instanced mesh that does not move is culled with a bounding sphere of its instances.

### Frame time (average, 1% lows and percentiles), two runs

| Scene | Average fps, run 1 / run 2 (was) | 1% low fps (was) | Median frame | 95th percentile frame |
|---|---|---|---|---|
| Lagoon | 58.2 / 51.6 (48.0) | 39.1 / 36.0 (33.8) | 16.8 / 18.8 ms | 19.3 / 23.0 ms |
| Jungle (48 monkeys) | 59.8 / 59.2 (52.2) | 51.5 / 42.4 (45.7) | 16.6 / 16.6 ms | 18.1 / 18.9 ms |
| Wide island | 52.3 / 50.9 (38.9) | 43.3 / 40.2 (34.1) | 18.9 / 19.4 ms | 20.7 / 21.6 ms |
| Castaway, eye level | 59.3 / 58.8 (46.5) | 50.5 / 47.2 (30.2) | 16.7 / 16.8 ms | 18.6 / 18.9 ms |
| Moving orbit | 55.4 / 55.7 (44.7) | 45.7 / 43.3 (40.0) | 17.8 / 17.7 ms | 19.7 / 19.4 ms |

The spread between run 1 and run 2 (same build) is about 1 to 5 fps. **Not every scene holds 60 fps on average.** The jungle and the
castaway view do. The lagoon, the wide island and the moving orbit average 52 to 58 fps, with median frames of 17 to 19 ms.

### What was tried and not kept (measured)

- **Instanced scenery chunks** (split into 40 m cells, each culled on its own): neutral. Frame rate, GPU time and triangles barely moved
  (7%). The triangles are visible geometry, not culling waste. Removed (`ab-interleaved-instanced-chunks-rejected.json`).
- **Detaching far creatures from the scene graph**: the average rose in two scenes and fell in the others, with periodic stalls
  (95th percentile up to 33 ms). Removed.
- **Bloom off**: about 0.5 ms of GPU. Not the cost.
- **Shadow budget** (see above): rejected, and not reintroduced in any form.
- **Freezing static objects' transforms**: about 1 ms, within the noise. Not kept, because it depends on knowing which objects never move.

### Where the time goes now

Measured in the lagoon view (the composition tool counts visible draws and triangles):

- **Triangles: about 8.3 million in the lagoon and 10.7 million in the wide view, drawn per frame.** The largest share is the procedural
  shrubs. Naupaka is about 6,000 triangles per shrub (about 1.0 million in the lagoon and 1.4 million in the wide view). Hibiscus, bush,
  wildflower, palm and banyan follow. This geometry is visible, so culling cannot remove it. **Level of detail is the next lever.** Done
  per cell it would pop, so it needs a crossfade or per-instance switching, and simplified meshes generated at boot add to the load time.
  Not done in this phase.
- **Update (simulation): 4 to 6 ms.** The creature update loops and the monkeys' animation. The matrix work (`updateMatrixWorld`, bone
  recomposition) is still a large share of the JavaScript time.
- **Shadow pass: 400 to 760 draws in the forest views**, against about 150 in the open ones. Its casters are mostly procedural props and
  creatures inside the sun's shadow frustum.
- **Tang school:** each rigged tang has seven materials, so a tang costs seven draws (about 224 for the school).
- **Materials:** 346 material objects in the scene. Sharing identical ones would reduce state changes. Not done.

### Verification status

- **Merged skins:** checked numerically (255 merges: vertex count, index count and bounds identical). A monkey on the ground was checked
  visually (fur, eyes, tail and feet right). Not yet checked in motion: climbing monkeys, swimming tangs, flapping birds, dolphins, or the
  castaway's animation.
- **Part instancing (rats, boars, crabs and others):** not checked visually. The framing attempts put the creatures behind rocks. The
  instances use the same geometry, material and world matrices as the original parts, so the picture should not change, but I have not
  seen it in a frame.
- **Skin culling:** the bounds are the bind-pose sphere, three times the radius plus 1.2 m. Clipping at the extreme poses is not checked.
- **Quality levels:** the buffer dimensions were checked at device pixel ratios 1 and 2 (above).
- **Frame-time consistency:** the causes of the spikes seen during the experiments (the shadow-caster change and the detaching) are
  removed. Garbage collection was not instrumented. The 95th percentile in the lagoon and wide views is 19 to 23 ms.

### Remaining options for 60 fps everywhere

1. Level of detail for the heavy procedural shrubs and palms (naupaka first), with a crossfade so nothing pops.
2. Reduce the update cost: the creature update loops and the monkeys' bones (102 per monkey), through distance-based update rates that do
   not slow or stop the animation.
3. Share identical materials to cut state changes.
4. Reduce the shadow pass in the forest views by batching the static casters, without changing which objects cast shadows.

### Benchmark

Double-click **Run Performance Benchmark.bat**. The game opens with `?perf=1&bench=1&noauto=1`, runs its five scenes, and saves
`paradise-island-benchmark.json` to Downloads. Keep the window at 1920 x 1080 and in front.

---

## Phase 3: vegetation level of detail

Goal: fewer triangles for the procedural vegetation, with no visible loss of foliage. Done in three steps, each measured
before it was kept. Raw summaries: `docs/performance/phase3-vegetation-lod-ab.json`.

### What was built

- **Three detail levels per shrub** (`src/naupaka.js`, `src/flora2.js` `bushWith`, `src/flora.js` `bush`). Level 0 is the
  full shrub, unchanged (checked: identical vertices to the committed builder). Level 1 keeps every second leaf and flower
  (naupaka also drops its berries), level 2 every fourth. A kept flower on a thinned bush grows by the square root of the
  thinning, so the colour mass of the bush stays the same. The layout is the same plant at every level.
- **Level of detail per instance** (`src/vegetation_lod.js`, `lodFamily`). The family keeps its full-detail `InstancedMesh`
  hidden: it holds every matrix, the inspection tag, and the full geometry for picking. Three shared batches (one per
  level) draw the instances. Each frame the on-screen radius of each shrub picks its level, with hysteresis: a shrub gets
  coarser below 26 px (mid) and 10 px (far), and finer only past 20% over those thresholds. A batch is rewritten only when an
  instance changes level, so the cost per frame is one pass over the family's instances.
- **Replayed draws, one world stream** (`src/util.js` `recordDraws`, `replayDraws`; `lodLevels` in `vegetation_lod.js`). The
  builders draw from the world's seeded random stream. The full level runs once with that stream, recording the values
  it draws; the thinned levels replay the recorded values, so they make the same choices and do not spend the stream. Every
  later placement is where it was before this phase. Checked: the placement of every tagged instanced family (meshes,
  instance counts and positions, hashed) is identical to HEAD.
- **Skipped parts still run** (`DRY` in `src/gfx.js`): a level that leaves a part out still runs that part's code into a
  target that keeps nothing, so every draw matches the full level.
- `static_cull.js` leaves the batches alone: their counts change, so a bounding sphere cached for them would go stale.

### Triangles and cost

| Shrub | Triangles per instance |
|---|---|
| Naupaka, full / mid / far | 7.5k to 8.1k / 4.4k / 2.3k |

Triangles drawn per frame, all three families on vs off, same page, same camera (final build, `phase3-vegetation-lod-ab.json`):

| Scene | Triangles off to on | GPU ms off to on | Average fps off to on |
|---|---|---|---|
| Lagoon | 11.8M to 10.0M | 18.8 to 17.5 | 51.3 to 54.0 |
| Wide island | 12.3M to 10.5M | 20.2 to 18.4 | 48.3 to 49.0 |
| Jungle (48 monkeys) | 11.6M to 10.4M | 16.4 to 15.8 | 57.1 to 59.8 |
| Castaway, eye level | 11.1M to 9.8M | 13.9 to 12.7 | 58.3 to 58.4 |
| Moving orbit | 11.9M to 10.3M | 17.4 to 16.6 | 54.5 to 57.0 |

Draw calls are unchanged within the run-to-run noise (about 1,100 to 1,800 in these scenes, most of them unrelated to
vegetation). The GPU numbers are high because the GPU was shared with other desktop applications during these runs (the
idle load was about 38%, and 88 to 97% during runs). Compare within a row only. The earlier single-variant runs (naupaka
alone) gave 0.2 to 0.5 ms of GPU in the quiet runs and 0.4 to 1.2 ms in the busy ones.

Separate-page before and after benchmark runs were also taken, but the GPU load from other apps differed between them
(the "after" run showed about 6 ms more GPU time in every scene), so they are not used here.

### Where the vegetation cost sits (measured ceiling)

Hiding every tagged vegetation family except naupaka (hibiscus, bush, palm, wildflower, banyan, pandanus, plumeria, fern,
bougainvillea and the rest) before this phase, same page:

| Scene | Triangles without that vegetation | GPU saved |
|---|---|---|
| Lagoon | about 4.9M | about 2.7 ms |
| Wide island | about 4.9M | about 3.0 ms |
| Jungle | about 5.3M | about 0.6 ms |

So vegetation as a whole is worth roughly 0.5 ms of GPU per million triangles here. Both measurements were taken after the
naupaka step and before the hibiscus and bush steps. Hibiscus and bush were about a quarter of the other vegetation (1.3M of
about 4.9M); palms, wildflowers, banyans, pandanus and plumeria are the largest of the rest. The list below is triangles
drawn per frame in the lagoon view at that point (the tag keys are the ones in `src/inspect.js`):

- instanced creature parts 974k, hibiscus 688k, naupaka 620k with its level of detail on (1.43M at full detail), bush 591k, untagged instanced meshes
  538k (31,724 instances, not yet identified), palm 471k, wildflower 412k, rock 396k, banyan 327k, coral 299k,
  pandanus 291k, plumeria 289k, fern 139k

### Verification

- Placement: hash of tagged instanced families identical to HEAD (see above).
- Geometry: level 0 vertices identical to HEAD for naupaka (three seeds, hashed).
- Inspection: a ray against the hidden full-detail proxy hits the same instance index (tested on one shrub; the registry and
  the Field Guide use the same proxy); the LOD batches are not tagged.
- Look: crops of the same shrub at the switch distances (naupaka 46 m and 119 m; hibiscus 46 m), and full frames at the
  castaway's eye level with the LOD on and off. No visible difference at the switch points; the hibiscus flower thinning
  was visible at first (sparser red blossoms in the upper right of the castaway frame), and the flower size compensation
  removed that. Checked by eye at 1920 x 1080; no pixel-difference measurement was made.
- Cost of the change: the naupaka mid and far geometries add about 28 ms to startup and about 0.8 MB of memory per naupaka
  family (both measured in Node, not in the browser). The hibiscus and bush levels add their own build time; it was not
  separately timed.

### Not done in this phase

- **Other families.** Palms, banyans, wildflowers, pandanus, plumeria, ferns and bougainvillea still draw one geometry
  at full detail. Palms and banyans are the big ones, and both would need their fronds or leaves thinned, which is more
  visible on a large shape, so each needs its own look check before it is kept. The untagged instanced meshes (538k
  triangles) have not been identified.
- **Draw calls.** The frame is limited by the CPU side of drawing (render time about 10 to 15 ms, about 9 us per draw), not
  by triangles. Vegetation LOD cannot reduce draws, and it adds a few (one batch per level per family). Merging static
  vegetation by material is the lever for that.
- **Phase 7 (animated creatures in motion)** and **Phase 8 (AI scheduling)** were not started in this phase.
- **60 fps** is not claimed. The 1% lows and the frame-time percentiles from the five-scene benchmark were not re-run on
  the final build, because the GPU load from other applications made separate runs unreliable.

## Phase 4 (started): what the game renders on a 4K television

**Diagnostic added** (`src/dev/display_diag.js`): press **F2** in the game (or open `?diag=1`) for an on-screen readout of the Chrome viewport,
screen size, canvas CSS size, device pixel ratio, render scale, drawing-buffer size and megapixels, quality level, MSAA samples, bloom, average
FPS, 1% low, median / 95th / 99th percentile frame time, CPU render time (time spent inside `composer.render`) and the last pass's draw calls and
triangles. `window.__display()` returns the same as an object and `await window.__display.sample(10)` measures ten seconds of real play.
GPU time is not in the readout (the existing `?perf=1` benchmark measures it).

**What the code does** (`src/core.js`, `setQuality`): the render scale is the screen's device pixel ratio, capped per quality level (high 1.75,
medium 1.25, low 1.0). It is a cap on the ratio, not on the pixel count, so what F11 produces depends on the Windows scaling setting:

| Windows scale | Chrome viewport (CSS px) | DPR | high | medium | low |
|---|---|---|---|---|---|
| 100% | 3840 x 2160 | 1.0 | 3840 x 2160 (8.3 MP, 4x MSAA) | same size, 2x MSAA | same size, no MSAA, no bloom |
| 150% | 2560 x 1440 | 1.5 | 3840 x 2160 | 3200 x 1800 | 2560 x 1440 |
| 200% | 1920 x 1080 | 2.0 | 3360 x 1890 (6.4 MP) | 2400 x 1350 | 1920 x 1080 |

These are derived from the code, **not measured on the television**: this session's browser pane had no visible size, and the benchmarks to date
ran at 1920 x 1080 (2.1 MP). If the television runs at 100% scaling, the game renders four times the pixels of those benchmarks, and the automatic
quality drop (medium, then low) does not reduce the resolution at all, only MSAA, bloom and shadow size. That is the most likely reason a 1080p
benchmark is not a guide to the F11 experience.

**Next step:** press F2 in fullscreen on the television and record the readout (a photo is enough); that fixes which row applies. Then measure
the five scenarios at that buffer size with the interleaved A/B tool, and decide whether a pixel-count cap (for example about 5 MP on high) is
needed. Not yet done: the CPU render-path profile, creature visual verification in motion, selective vegetation LOD, simulation scheduling.
