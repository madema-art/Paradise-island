# Recompute the report tables from three hardware A/B runs, including --camp-only.
from pathlib import Path
import json,statistics,hashlib,shutil
root=Path('docs/performance'); data=root/'canopy'; out=data/'accepted';out.mkdir(exist_ok=True)
source=data if (data/'baseline-1.json').exists() else out
keys=['wideIsland','jungle48','banyan','followPig','campView','nightRats','moving']
rows=[]
for k in keys+['castawayEye']:
 values={v:[next(r for r in json.loads((source/f'{v}-{i}{"-camp" if k=="campView" else ""}.json').read_text())['results'] if r['scenario']==k) for i in range(1,4)] for v in ['baseline','final']}
 med={v:{f:statistics.median(r[f] for r in values[v]) for f in values[v][0] if isinstance(values[v][0][f],(int,float))} for v in values}
 rows.append({'scene':k,**med,'fpsChangePercent':100*(med['final']['fpsAverage']/med['baseline']['fpsAverage']-1),'meanFrameReductionPercent':100*(1-med['final']['frameMsMeanFromFps']/med['baseline']['frameMsMeanFromFps'])})
for v in ['baseline','final']:
 for i in range(1,4):
  for suffix in ['', '-camp']:
   name=f'{v}-{i}{suffix}.json';
   if (source/name).resolve() != (out/name).resolve(): shutil.copyfile(source/name,out/name)
 for k in keys+['castawayEye']:
  name=f'{v}-3-{k}.json'
  if (source/name).resolve() != (out/name).resolve(): shutil.copyfile(source/name,out/name)
summary={'method':'Median of three per-scene runs; campView measured in a separate three-pair fixed-camera sequence. Live castawayEye retained as exploratory. All simulation stays active.','rows':rows}
main=rows[:7]
b=sum(r['baseline']['frameMsMeanFromFps'] for r in main)/7;f=sum(r['final']['frameMsMeanFromFps'] for r in main)/7
summary['equalSceneTimeMix']={'baselineMeanMs':b,'finalMeanMs':f,'fpsImprovementPercent':100*(b/f-1),'meanFrameReductionPercent':100*(1-f/b)}
(out/'medians.json').write_text(json.dumps(summary,indent=2))
lines=['## Repeated hardware results (final build)','', 'Three runs per build; medians below. RTX 2070 SUPER, D3D11/WebGL2, Chromium 148, high quality, 1920×1080, DPR1. All simulation remains active. FPS is throughput with the browser frame cap disabled equally. Mean milliseconds are derived from the tool’s rounded FPS.','', '| Scene | Baseline FPS | Final FPS | FPS change | Baseline mean ms | Final mean ms | Mean reduction | p95 ms, before → after | p99 ms, before → after |','|---|---:|---:|---:|---:|---:|---:|---:|---:|']
for r in rows:
 b,f=r['baseline'],r['final'];lines.append(f"| {r['scene']}{' (exploratory)' if r['scene']=='castawayEye' else ''} | {b['fpsAverage']:.1f} | {f['fpsAverage']:.1f} | {r['fpsChangePercent']:+.1f}% | {b['frameMsMeanFromFps']:.2f} | {f['frameMsMeanFromFps']:.2f} | {r['meanFrameReductionPercent']:+.1f}% | {b['frameMsP95']:.1f} → {f['frameMsP95']:.1f} | {b['frameMsP99']:.1f} → {f['frameMsP99']:.1f} |")
a=summary['equalSceneTimeMix'];lines+=['',f"The seven primary scene medians give an equal-scene mean frame time of **{a['baselineMeanMs']:.2f} → {a['finalMeanMs']:.2f} ms**, a **{a['meanFrameReductionPercent']:.1f}% reduction** (equivalent throughput **+{a['fpsImprovementPercent']:.1f}%**). All seven primary median p95/p99 values improve. This is a repeatable improvement on this machine, not a universal 60 FPS claim.",'', 'The built-in castawayEye camera samples the castaway’s live position. Its final median regressed, while the previous complete candidate improved there. Screenshots show different foliage/location coverage and final median calls rose sharply. These results are retained, not treated as a matched rendering comparison. After discovering this, a separate three-pair normal gameplay camera at the fixed camp location was added. It is the primary normal-camera scene above. The live boar follow scene also varies with behavior and should be read as a repeated gameplay workload rather than identical frame replay.','', '| Scene | Update CPU ms before → after | Render CPU ms before → after | GPU ms before → after | Calls before → after | Triangles, million before → after |','|---|---:|---:|---:|---:|---:|']
for r in rows:
 b,f=r['baseline'],r['final'];lines.append(f"| {r['scene']} | {b['updateMsMean']:.2f} → {f['updateMsMean']:.2f} | {b['renderMsMean']:.2f} → {f['renderMsMean']:.2f} | {b['gpuMsMean']:.2f} → {f['gpuMsMean']:.2f} | {b['drawCallsMean']:.0f} → {f['drawCallsMean']:.0f} | {b['trianglesMean']/1e6:.2f} → {f['trianglesMean']/1e6:.2f} |")
lines+=['', 'The FPS gain is CPU-led; GPU timings do not uniformly improve. Live actor motion changes visible calls and triangles between runs. The matched-pose review below separates vegetation batching from that variation. Small families have one active batch; only four large treeA families can add up to eight extra nonempty batches in total. This bounds added tree submission overhead instead of multiplying draws by tree or clump. All original shadow flags are retained.','', 'Raw summaries: [median data](canopy/accepted/medians.json), [baseline run 1](canopy/accepted/baseline-1.json), [run 2](canopy/accepted/baseline-2.json), [run 3](canopy/accepted/baseline-3.json), [final run 1](canopy/accepted/final-1.json), [run 2](canopy/accepted/final-2.json), [run 3](canopy/accepted/final-3.json). Separate `*-camp.json` files contain all six fixed-camp runs. Round-three per-scene files retain hardware, population, LOD, shadow-flag and occlusion diagnostics.','', 'Neither long-task counts nor performance.memory establish a GC improvement: long tasks can include screenshot/diagnostic work, and heap observations are quantized. No reduced-GC claim is made. One final banyan run and two live castaway views showed poorer tails; repeated medians are reported rather than discarding those samples.','']
Path('work/results-tables.md').write_text('\n'.join(lines),encoding='utf8')
print(json.dumps(summary['equalSceneTimeMix'])); print('\n'.join(lines[:14]))
