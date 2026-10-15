// Same-page interleaved trials isolate buffer indexing and opaque draw order.
import { build } from 'esbuild';
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await build({ stdin:{contents:`import { indexedVegetation } from './tests/helpers/vegetation_index_trial.js'; window.__indexVegetation = indexedVegetation;`, resolveDir:process.cwd()}, bundle:true, format:'iife', minify:true, outfile:'work/tuning.js' });
const b=await chromium.launch({headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--disable-frame-rate-limit']});
try {
  const p=await b.newPage({viewport:{width:1920,height:1080}});
  await p.goto('http://127.0.0.1:8772/?perf=1&noauto');
  await p.waitForFunction(()=>window.__perfScenarios && __dbg.creatures.length>100,{timeout:180000});
  await p.evaluate(()=>{__dbg.env.tod=10;__dbg.WX.wx.forced='clear';__dbg.updaters.splice(1,0,()=>{__dbg.env.tod=10;__dbg.env.paused=false;});});
  await p.waitForTimeout(15000);
  await p.addScriptTag({path:'work/tuning.js'});
  const results=[];
  for(const key of ['wideIsland','jungle48']) {
    const result=await p.evaluate(async key=>{
      const batches=__dbg.scene.children.filter(o=>o.userData.lodBatch), original=batches.map(o=>o.geometry);
      const trees=batches.filter(o=>/^(treeA|treeB|banyan) LOD /.test(o.name));
      const set=(index,first)=>{batches.forEach((o,i)=>{o.geometry=index?__indexVegetation(original[i]):original[i];});trees.forEach(o=>o.renderOrder=first?-1:0);};
      const stats=batches.map(o=>({name:o.name,before:o.geometry.attributes.position.count,after:__indexVegetation(o.geometry).attributes.position.count}));
      const result=await __perfInterleave(key,[
        {name:'unindexed, default order',apply:()=>set(false,false)},
        {name:'unindexed, trees first',apply:()=>set(false,true)},
        {name:'indexed, default order',apply:()=>set(true,false)},
        {name:'indexed, trees first',apply:()=>set(true,true)},
      ],3,4);
      set(false,false); return {...result,geometry:stats};
    },key);
    results.push(result);console.log(JSON.stringify(result));
    fs.writeFileSync('work/canopy-tuning.json',JSON.stringify(results,null,2));
  }
}finally{await b.close();}
