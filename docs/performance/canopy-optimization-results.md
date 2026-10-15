# Canopy optimization results

Final hardware validation: the seven primary scene medians improve overall throughput by 5.7% and reduce the equal-scene mean frame time by 5.4%. Every primary median p95/p99 improves. A live castaway-camera workload regressed and is retained separately below, with its camera-content mismatch disclosed.

## Implementation

The workshop reference is Paradise-Island-3d-assets `45d11e02bd6f08d8022310f8b54963ca520ed4f6`. The game port retains existing tree positions, palettes, trunks, colliders, aerial-root positions and inspection identities. It adapts the clump-shell idea to the original crown lobes rather than importing a heavyweight workshop mesh everywhere.

`src/canopy.js` builds four closed, opaque clumps per lobe: three upper masses and a low skirt. Mottled vertex color, dark undersides and restrained warm tips add depth. Unit clump shapes are cached. Each family is still a merged mesh at each detail level, instanced across its original placements; clumps are not separate objects or draw calls.

`treeA` and `treeB` in `src/flora.js` now build three detail levels. The flame-tree variant retains its orange palette. Banyans in `src/flora2.js` replace the card-covered treatment with the same clump system over their original spreading limbs and central lobes. All existing trunks, limbs, buttresses and aerial-root geometry remain. Closed crowns use front-face rendering. Only these tree families opt into outward tube winding; thin broadleaf vines have explicit reverse faces so they remain visible from both sides. Other builders retain legacy tube winding and flat materials.

## Normals and determinism

`MB.addGeo(..., { smooth: true })` explicitly smooths a component; `MB.build({ smooth: true })` also supports whole-mesh opt-in. `src/geometry_normals.js` computes area-weighted normals welded by position without welding vertices or altering color/wind seams. The default remains flat. The new tree material permits interpolated normals; the old vegetation material still forces flat shading everywhere else. Smoothing happens at build time, never per frame.

Original world-random draws are retained in their original order. New clump shaping uses local seeded generators. `lodLevels` records the first build's draws and replays them for the other two levels, spending the shared stream only once. This preserves placements downstream, including wildlife. No new per-frame random draws were introduced.

## LOD, draw calls, wind and shadows

The existing `vegetation_lod.js` owns the tree LODs alongside shrubs. Trees use transformed geometry centers and bounding radii; thresholds are 220 and 85 device-pixel radii with 20% hysteresis on return to finer detail. Shrubs retain their original 26/10 thresholds and size convention. All levels retain the same clump centers, lower skirt, palette and structural geometry.

| Family | Original total triangles per tree | LOD0 | LOD1 | LOD2 |
|---|---:|---:|---:|---:|
| treeA, five-lobe variant | 472 | 1,372 | 472 | 232 |
| treeA, six-lobe variants | 552 | 1,632 | 552 | 264 |
| treeB / flame tree | 703 | 1,972 | 712 | 376 |
| Banyan variants | 31,996-32,832 | 8,888-9,032 | 3,668-3,812 | 2,276-2,420 |

Foliage alone is 260/80/32 triangles per original lobe: 1,820/560/224 for a seven-lobe broadleaf crown, and 7,540/2,320/928 for a banyan. Root/trunk geometry is included in the total counts above.

Large treeA families keep per-instance LOD with at most three nonempty draw batches. Families of ten or fewer trees share the finest level requested by any member, using one nonempty batch: this raises detail on a few distant instances to avoid extra draw calls, never lowering near detail. There is no draw per clump/tree. There is one shared near-tree material and one shared distant-tree material. No transparency is introduced for normal crowns. Empty batches are invisible. Batches receive fresh bounds when their contents change, including a four-metre wind margin; frustum culling can safely reactivate them. The original full-resolution proxy remains available to inspection and occlusion.

Every tree continues casting shadows at every LOD, using that level's cheaper geometry. No wildlife or tree shadow budget/count was reduced. Important palm shadows are unchanged. The existing shadow shader behavior is retained; this work does not introduce a new animated shadow system.

Near trees use the existing full wind shader. Medium/far crowns use one coherent sine-based sway instead of the gust-front and leaf-ripple calculations. Both materials share the existing weather/wind/wetness uniforms; no per-tree CPU wind animation or material updates were added.

## CPU rendering offset

CPU profiling found renderer traversal and matrix work larger than vegetation classification. `bone_render_prune.js` and `rig_render_budget.js` skip render/shadow traversal of bone-only branches with no drawable descendants. They do not stop matrix updates, skeleton evaluation, animation mixers, AI or behavior. Even hidden meshes count as drawable descendants, protecting pre-created props. Child-add events immediately restore any newly occupied bone path.

Registration is staged after the existing skin/part merge passes, with a 0.5 ms check between creature roots. Newly registered creatures are handled as the registry grows. The original assets, animations, skeletons and creature counts remain unchanged. The optimization can be switched off through `__rigRender.pruner.set(false)` in performance mode.

A same-page four-round trial measured about 7% higher wide-view FPS and 10% higher jungle/castaway-view FPS, with roughly 1.4-1.8 ms less render CPU time. A control render and a pruned render differed only by the same one-channel-level rounding seen between two unchanged control renders. This local feature trial is supporting evidence; final acceptance uses the full-game A/B tables.

Vegetation classification caches stationary camera/pixel-scale results and compares squared sizes. Batch rebuilds copy matrix elements without allocating subarray views, preserve per-instance color and shadow flags, and upload only changed levels. Repeating an already-applied fade/hide request performs no rebuild.

## Occlusion compatibility

Inspection proxies retain original placement identity. Existing camera occlusion registration, grid lookup, 0.12-second tests and eight-ghost pool remain in use. Geometry proxies are still bounded at 48 spheres per source; extra clumps do not multiply per-frame candidates. A hidden instance is removed from its selected LOD batch and restored there when its ghost returns to full opacity. Unit tests cover hide/restore through LOD changes and resize; the game test exercises actual follow-camera activation and release.

## Experiments not retained

- Applying the full workshop-style detail everywhere was rejected before integration; close detail is limited by LOD.
- The first double-sided candidate reduced triangles but did not improve FPS consistently. Closed crowns now use front-face rendering, and hero detail has a tighter relevance range.
- Duplicate-vertex indexing and forcing crowns to render first were tested in three interleaved rounds in both wide and jungle views. They did not provide a reliable FPS gain and are not enabled in production. Reproduction helpers remain under tests only.
- No wildlife population, behavior, simulation rate, graphics resolution, quality preset or post-processing was reduced to achieve the result.

## Validation and reproduction

The baseline note describes camera/time/weather controls and rejected pilot protocols. Baseline game revision is `ef68087aad788654c3e12e0848cb4afbac1bf53e`; both builds use the same correction that applies benchmark cameras before LOD/AI distance checks. The accepted protocol uses actual requestAnimationFrame/composer frames at 1920x1080, high quality, DPR1, an RTX 2070 SUPER via D3D11, and rejects software rendering.

Commands (from the isolated worktree):

```powershell
npm run build
node tests/canopy_baseline_build.mjs
node tests/canopy_server.mjs 8772
# In another PowerShell, set PLAYWRIGHT_MODULE to an installed Playwright module if needed.
node tests/canopy_benchmark.mjs compare 3
node tests/canopy_benchmark.mjs compare 3 --camp-only
node tests/canopy_review.mjs
node tests/canopy_unit.mjs
node --test tests/bone_render_trial.test.js
```

## Repeated hardware results (final build)

Three runs per build; medians below. RTX 2070 SUPER, D3D11/WebGL2, Chromium 148, high quality, 1920×1080, DPR1. All simulation remains active. FPS is throughput with the browser frame cap disabled equally. Mean milliseconds are derived from the tool’s rounded FPS.

| Scene | Baseline FPS | Final FPS | FPS change | Baseline mean ms | Final mean ms | Mean reduction | p95 ms, before → after | p99 ms, before → after |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| wideIsland | 43.9 | 46.7 | +6.4% | 22.78 | 21.41 | +6.0% | 23.9 → 22.5 | 24.9 → 23.5 |
| jungle48 | 54.6 | 58.8 | +7.7% | 18.32 | 17.01 | +7.1% | 19.6 → 18.0 | 20.6 → 18.6 |
| banyan | 51.3 | 54.6 | +6.4% | 19.49 | 18.32 | +6.0% | 20.9 → 19.4 | 23.3 → 19.9 |
| followPig | 54.9 | 59.0 | +7.5% | 18.21 | 16.95 | +7.0% | 20.8 → 19.6 | 22.5 → 20.8 |
| campView | 58.1 | 62.3 | +7.2% | 17.21 | 16.05 | +6.7% | 18.2 → 17.1 | 20.4 → 18.0 |
| nightRats | 43.7 | 46.3 | +5.9% | 22.88 | 21.60 | +5.6% | 24.7 → 23.0 | 28.1 → 24.0 |
| moving | 36.5 | 36.9 | +1.1% | 27.40 | 27.10 | +1.1% | 30.1 → 29.4 | 32.0 → 30.8 |
| castawayEye (exploratory) | 49.0 | 44.7 | -8.8% | 20.41 | 22.37 | -9.6% | 22.2 → 24.4 | 28.8 → 27.7 |

The seven primary scene medians give an equal-scene mean frame time of **20.90 → 19.78 ms**, a **5.4% reduction** (equivalent throughput **+5.7%**). All seven primary median p95/p99 values improve. This is a repeatable improvement on this machine, not a universal 60 FPS claim.

The built-in castawayEye camera samples the castaway’s live position. Its final median regressed, while the previous complete candidate improved there. Screenshots show different foliage/location coverage and final median calls rose sharply. These results are retained, not treated as a matched rendering comparison. After discovering this, a separate three-pair normal gameplay camera at the fixed camp location was added. It is the primary normal-camera scene above. The live boar follow scene also varies with behavior and should be read as a repeated gameplay workload rather than identical frame replay.

| Scene | Update CPU ms before → after | Render CPU ms before → after | GPU ms before → after | Calls before → after | Triangles, million before → after |
|---|---:|---:|---:|---:|---:|
| wideIsland | 3.43 → 3.40 | 19.04 → 17.66 | 13.96 → 13.71 | 1759 → 1726 | 10.28 → 9.85 |
| jungle48 | 4.38 → 4.26 | 13.63 → 12.39 | 9.70 → 9.32 | 853 → 840 | 10.27 → 9.77 |
| banyan | 3.75 → 3.78 | 15.29 → 14.25 | 10.51 → 10.82 | 1252 → 1256 | 10.59 → 10.11 |
| followPig | 3.82 → 3.92 | 13.74 → 12.63 | 8.97 → 8.87 | 575 → 649 | 9.25 → 8.66 |
| campView | 3.52 → 3.41 | 13.34 → 12.41 | 10.03 → 9.90 | 1271 → 1283 | 10.74 → 10.14 |
| nightRats | 4.36 → 4.28 | 18.30 → 16.84 | 9.45 → 9.72 | 1120 → 1177 | 10.25 → 9.77 |
| moving | 3.71 → 3.78 | 23.38 → 22.82 | 14.27 → 14.67 | 1711 → 1785 | 11.45 → 10.89 |
| castawayEye | 4.29 → 4.56 | 15.76 → 17.07 | 8.88 → 9.63 | 678 → 987 | 9.54 → 9.94 |

The FPS gain is CPU-led; GPU timings do not uniformly improve. Live actor motion changes visible calls and triangles between runs. The matched-pose review below separates vegetation batching from that variation. Small families have one active batch; only four large treeA families can add up to eight extra nonempty batches in total. This bounds added tree submission overhead instead of multiplying draws by tree or clump. All original shadow flags are retained.

Raw summaries: [median data](canopy/accepted/medians.json), [baseline run 1](canopy/accepted/baseline-1.json), [run 2](canopy/accepted/baseline-2.json), [run 3](canopy/accepted/baseline-3.json), [final run 1](canopy/accepted/final-1.json), [run 2](canopy/accepted/final-2.json), [run 3](canopy/accepted/final-3.json). Separate `*-camp.json` files contain all six fixed-camp runs. Round-three per-scene files retain hardware, population, LOD, shadow-flag and occlusion diagnostics.

Neither long-task counts nor performance.memory establish a GC improvement: long tasks can include screenshot/diagnostic work, and heap observations are quantized. No reduced-GC claim is made. One final banyan run and two live castaway views showed poorer tails; repeated medians are reported rather than discarding those samples.


## Remaining limitations

Canopies remain deliberately stylized volumetric masses, not individual leaves or alpha cards. Hard LOD transitions use stable clump placement and hysteresis rather than geometry morphing. Some overlapping interior surfaces remain, especially in banyans. Shader wind does not recompute deformed normals, matching the existing architecture. The renderer offset intentionally leaves all animation and world-matrix work running; it only removes empty render traversal. GPU costs from water, wildlife and post-processing remain outside this canopy change, so this is not a universal 60 FPS guarantee.

Work was isolated in `D:\ParadiseIsland-Canopy-Workshop`, branch `codex/canopy-optimization`. The completed commit is published to canonical `integrate/new-castaway`; Claude's active checkout and local working state are left untouched. The notebook was reread: revision 49, zero ready notes, three open notes about boa motion/size, arboreal boa resting, and owl proportions. None was changed.

## Changed files

Production: `src/canopy.js`, `src/geometry_normals.js`, `src/gfx.js`, `src/flora.js`, `src/flora2.js`, `src/vegetation_lod.js`, `src/bone_render_prune.js`, `src/rig_render_budget.js`, `src/main.js`, and development diagnostics in `src/dev/perf_bench.js`.

Validation: `tests/canopy_{baseline_build,benchmark,review,profile,tune,unit,server}.mjs`, `tests/canopy_summarize.py`, `tests/canopy_geometry.test.js`, `tests/geometry_normals.test.js`, `tests/bone_render_trial.test.js`, `tests/bone_render_tune.mjs`, and two trial helpers under `tests/helpers/`. Documentation: this report, the baseline note, selected raw JSON/screenshots under `docs/performance/canopy/accepted/`, and an appended `progress.md` record. No models, animation clips, graphics configurations, gameplay behaviors, or audio sources were changed.

## Final checks

- Build passes; preexisting duplicate `owl` key warning in `src/audio.js` remains.
- 32 regression tests pass across coconut geometry, comfort construction/planning, fishing ownership/persistence, music playlists, normals, and bone traversal safety.
- Nine bundled canopy tests pass, including explicit/default normals, deterministic geometry, bounded detail, outward winding, shader separation, LOD hysteresis, resize invalidation, instance colors/shadows, fade ownership, and compact small families.
- Hardware browser review checks all static inspection instance transforms and initial wildlife transforms exactly, then exercises actual follow fade and release. Visuals cover near/ground/medium/far, studio shading, rain, night, and wind. Detailed final diagnostics and screenshot links follow.

Tested final bundle SHA256: `02846ee112bd8378f9030158f863f512a9f062be704baebc49eb1c8ab4f906df`. Baseline bundle SHA256: `f14343c935a26ffb51f6f7fa940a6e93320378ff16b16df4018844ef519b1a49`. Source line endings were restored to each existing file’s original convention and rebuilt; the final bundle hash remained identical to the measured build. Bundles are generated locally, not committed.

## Matched-pose draw/shadow review

At 1440×900, baseline and final start from identical world and wildlife transforms and use the same fixed camera poses. This review is for geometry/submission accounting, not FPS. Shadow calls/triangles are measured by rendering the same frame with shadowMap enabled, disabled, and restored. Caster counts describe visible mesh objects with a castShadow flag, not unique trees or actual shadow draws.

| Tree / view | Total calls before → after | Shadow calls before → after | Total triangles before → after | Shadow triangles before → after |
|---|---:|---:|---:|---:|
| treeA / close | 1,321 → 1,331 | 412 → 420 | 10,895,153 → 10,461,953 | 3,842,189 → 3,641,459 |
| treeA / ground | 1,259 → 1,269 | 413 → 421 | 10,877,258 → 10,444,058 | 3,842,201 → 3,641,471 |
| treeA / medium | 1,602 → 1,606 | 294 → 299 | 10,931,408 → 10,399,470 | 3,647,981 → 3,388,379 |
| treeA / far | 2,484 → 2,483 | 209 → 210 | 10,894,300 → 10,540,946 | 2,885,587 → 2,904,403 |
| treeB / close | 1,051 → 1,048 | 592 → 597 | 10,745,339 → 10,154,396 | 4,046,372 → 3,804,404 |
| treeB / ground | 973 → 973 | 592 → 598 | 10,688,677 → 10,102,042 | 4,046,372 → 3,807,380 |
| treeB / medium | 1,488 → 1,493 | 662 → 670 | 10,895,490 → 10,380,605 | 4,025,685 → 3,798,471 |
| treeB / far | 1,523 → 1,527 | 257 → 260 | 10,738,599 → 10,032,329 | 3,628,149 → 3,278,067 |
| banyan / close | 1,528 → 1,536 | 611 → 619 | 10,987,060 → 10,494,032 | 4,002,648 → 3,771,042 |
| banyan / ground | 1,227 → 1,236 | 438 → 446 | 9,578,339 → 9,088,669 | 3,001,421 → 2,771,975 |
| banyan / medium | 1,398 → 1,402 | 256 → 260 | 9,720,507 → 9,227,555 | 2,825,569 → 2,575,219 |
| banyan / far | 1,860 → 1,859 | 43 → 44 | 9,818,341 → 9,405,536 | 2,026,072 → 1,989,904 |

Matched-pose calls changed by less than 0.79% in the worst reviewed view. Triangles decrease in all twelve views. See [visual diagnostics](canopy/accepted/visual-review.json) for caster flags, exact placement hashes, family counts, level budgets, manual updater diagnostics, and occlusion statistics. No tree shadow cutoff was introduced.

Final review: 250 treeA, 40 treeB, 10 banyans and 311 palms retained; 230 wildlife registrations, 608 schooling fish and 48 monkeys. Bone traversal pruning covers 5,709 bones across 230 roots. The separate uncontented review registered these in 5.6 ms total with a 0.7 ms maximum slice; the quality-review rerun overlapped the software smoke and is not used for CPU timing claims.

The occlusion registry contains 4,050 instances. Actual follow activated 0 ghosts and release restored zero active ghosts. The existing eight-ghost cap and bounded proxy registration remain intact. Studio wind changes 19,709 pixels by more than four channel levels after three simulated seconds, confirming visible shader animation.

## Visual evidence

| View | Before | After |
|---|---|---|
| treeA, isolated game geometry | [Before](canopy/accepted/baseline-treeA-studio.png) | [After](canopy/accepted/final-treeA-studio.png) |
| treeB, isolated game geometry | [Before](canopy/accepted/baseline-treeB-studio.png) | [After](canopy/accepted/final-treeB-studio.png) |
| banyan, isolated game geometry | [Before](canopy/accepted/baseline-banyan-studio.png) | [After](canopy/accepted/final-banyan-studio.png) |
| Banyan ground angle, unobstructed studio | [Before](canopy/accepted/baseline-banyan-studio-ground.png) | [After](canopy/accepted/final-banyan-studio-ground.png) |
| In-game medium distance | [Before](canopy/accepted/baseline-banyan-medium.png) | [After](canopy/accepted/final-banyan-medium.png) |
| In-game far distance | [Before](canopy/accepted/baseline-banyan-far.png) | [After](canopy/accepted/final-banyan-far.png) |

Also inspected: [rain](canopy/accepted/final-rain.png), [night](canopy/accepted/final-night.png), [wind after three seconds](canopy/accepted/final-banyan-wind.png). Ground-level in-world captures can be obscured by existing foreground vegetation, so the unobstructed low studio angle supplements them.

The live castaway comparison is preserved as [baseline](canopy/accepted/baseline-3-castawayEye.png) and [final](canopy/accepted/final-3-castawayEye.png); their views differ. The replacement fixed-camp comparison is [baseline](canopy/accepted/baseline-3-campView.png) and [final](canopy/accepted/final-3-campView.png).

The original develop-web-game Playwright client also completed a short input/stepping smoke using the existing `lorikeetReview&coconutStep` hooks, producing a reviewed gameplay screenshot and flock state with no console/page errors. Its forced SwiftShader backend is functional evidence only; no timing from it enters the hardware tables. The first continuous-loop software smoke was stopped because it stalled; deterministic stepping completed.
