# Wildlife overhaul: performance baseline (before)

Build: commit `5f50637` (part-instancing fix included), plus the `runManual` benchmark (src/dev/perf_bench.js, `window.__perfManualAll()`).
Method: the real game is stepped 600 frames of a fixed 1/30 s each (after 120 warm-up frames), timing `step()` (the whole update: camera, weather,
every updater). Then 30 frames are rendered for the draw-call count and the render-side CPU time. The browser pane here has no GPU and no frame
callback while hidden, so **update ms is the number to trust**; render CPU is software-rendered and only useful for comparing like with like.
Heap drops count garbage collections (the used heap falling by more than 0.2 MB between frames).

| Scene | update mean | median | p99 | max | spikes >3x median | draw calls | render CPU | GC drops (MB freed) |
|---|---|---|---|---|---|---|---|---|
| wideIsland | 5.48 | 4.40 | 12.8 | 154.3 | 4 | 1860 | 21.3 | 21 (295) |
| jungle48 | 5.79 | 5.50 | 9.3 | 13.4 | 0 | 746 | 13.8 | 32 (118) |
| followPig | 6.02 | 5.60 | 10.2 | 58.4 | 1 | 614 | 13.3 | 26 (168) |
| followBird (sea eagle) | 5.08 | 4.90 | 8.7 | 9.7 | 0 | 193 | 10.8 | 31 (33) |
| followGull | 5.14 | 4.70 | 8.9 | 35.8 | 1 | 658 | 13.4 | 20 (151) |
| nightRats | 5.31 | 5.20 | 8.9 | 9.5 | 0 | 934 | 14.3 | 29 (62) |
| followBoa | 4.88 | 4.80 | 6.5 | 8.1 | 0 | 659 | 12.9 | 38 (91) |

Where the update goes (followPig, ms per frame): land fauna loop (monkeys, boars, crabs, flamingos, rats, owls, boas) 1.93; castaway 1.69;
sea and sky fauna 0.63; part-instancing / skin passes 0.49; the rest under 0.35 each.
