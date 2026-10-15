# Canopy optimization baseline

Baseline game revision: `ef68087aad788654c3e12e0848cb4afbac1bf53e` on `integrate/new-castaway`.
Asset reference: `45d11e02bd6f08d8022310f8b54963ca520ed4f6`, `viewer/canopy/canopy_kit.js` and `docs/CANOPY_HANDOFF.md` from Paradise-Island-3d-assets.

The unchanged game bundle was built and preserved before implementation. `tests/canopy_baseline_build.mjs` reconstructs `work/baseline.js` from that exact revision, applying only the benchmark camera-ordering correction used on both sides. The baseline still uses seven detail-1 lobes for large broadleaf trees and card-covered banyans, and shrub-only vegetation LOD.

## Measurement protocol

The repeatable harness is `tests/canopy_benchmark.mjs`. It uses the actual bundled game and existing `?perf=1` frame hooks, not a geometry viewer or manual-step timing. Hardware rendering is mandatory: the harness rejects SwiftShader/llvmpipe/software renderers. Chromium is explicitly launched with D3D11 on this Windows machine; its default backend fell back to SwiftShader and that attempt was rejected without accepting performance results.

- RTX 2070 SUPER, D3D11, WebGL2, 1920 x 1080, device pixel ratio 1, high quality, automatic quality changes disabled.
- Native requestAnimationFrame/render/composer loop. Frame cap disabled equally for both builds to measure throughput; this is not a promise of a particular display refresh rate.
- Three runs per build, alternating baseline/final order between rounds; a fresh page for each build/run. Only one benchmark browser at a time.
- Fixed clear weather and visible clock (10:00 for day, 22:00 for night), without pausing the castaway or simulation. Simulation time and wildlife continue normally. The built-in scenario time-of-day pause is overridden by a test-only updater.
- Twelve-second initial warm-up; each existing scenario also waits for quality/shader warm-up (2.5 seconds plus 2 seconds) and measures 12-16 seconds.
- Scenes: wideIsland, jungle48, a fixed real banyan, followPig through foliage, nightRats, and an approach/retreat camera through 12-252 metres around that banyan. The original live castawayEye workload is retained, but its location differed across builds. A separate three-pair fixed ground-level camp camera supplies the reproducible primary normal-gameplay-camera comparison; see the final report for both results.
- Live frame mean is derived from the benchmark's rounded average FPS where needed; p95/p99, simulation/render CPU, GPU timer queries, calls and triangles are returned by the existing tool. Aggregate results use medians of the repeated scene means/percentiles, with raw per-run summaries retained.

The initial pilot passes are not final evidence: daylight/weather drifted, then a fixed-clock prototype accidentally paused the castaway through env.paused. Those runs were rejected and the complete paired protocol restarted. The original benchmark also releases its camera before a caller can take a screenshot: the harness now captures its pose inside the scenario completion callback and holds that pose for the screenshot. The 22-second boot overlay is hidden only in the art review harness. Another pilot exposed the existing late benchmark camera hook: it ran after vegetation LOD and AI distance checks. Both builds now apply the held camera at the start of the updater list; the custom banyan/range override follows immediately, before vegetation updates. Earlier pilot timing summaries were rejected.

## Baseline populations / geometry

Exact transforms of every tagged static instanced family are compared before/after in `tests/canopy_review.mjs`, including palms, tree families, shrubs, flowers, rocks and coral. In this revision there are 250 treeA, 40 treeB and 10 banyans, with 230 registered wildlife entries and 608 schooling fish. TreeB has 560 crown triangles plus 143 structural triangles per variant. Banyan originals have 31,996-32,832 triangles across the three variants; each has one merged geometry, despite its many cards.

CPU profiling (manual stepping, diagnostic only) puts school/sea/land updates above vegetation. The new occlusion registry is still bounded by 48 proxy spheres per geometry and an eight-ghost pool. A reviewed follow check measured roughly 0.055 ms per detection, with seven active ghosts, and restored all ghosts on release. These CPU diagnostic numbers are not FPS measurements.

See `canopy-optimization-results.md` for accepted final A/B numbers and limitations.
