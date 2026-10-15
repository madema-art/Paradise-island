import { build } from 'esbuild';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await build({stdin:{contents:`import { boneRenderTrial } from './tests/helpers/bone_render_trial.js'; window.__makeBoneTrial=boneRenderTrial;`,resolveDir:process.cwd()},bundle:true,format:'iife',outfile:'work/bone-trial.js'});
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--disable-frame-rate-limit']});
try{
  const p=await browser.newPage({viewport:{width:1920,height:1080}});
  await p.goto('http://127.0.0.1:8772/?perf=1&noauto');
  await p.waitForFunction(()=>window.__perfScenarios&&__dbg.creatures.length>100,{timeout:180000});
  await p.evaluate(()=>{__dbg.WX.wx.forced='clear';__dbg.env.tod=10;__dbg.updaters.splice(1,0,()=>{__dbg.env.tod=10;__dbg.env.paused=false;});});
  await p.waitForTimeout(15000);await p.addScriptTag({path:'work/bone-trial.js'});
  const captures=await p.evaluate(()=>{
    if(window.__rigRender)__rigRender.pruner.set(false);
    window.__boneTrial=__makeBoneTrial(__dbg.scene);
    __boneTrial.set(false);__dbg.composer.render();const before=__dbg.renderer.domElement.toDataURL();
    __dbg.composer.render();const control=__dbg.renderer.domElement.toDataURL();
    __boneTrial.set(true);__dbg.composer.render();const after=__dbg.renderer.domElement.toDataURL();
    return {count:__boneTrial.count,identical:before===after,sameOff:before===control,before,control,after};
  });
  for(const name of ['before','control','after']) fs.writeFileSync(`work/bone-${name}.png`,Buffer.from(captures[name].split(',')[1],'base64'));
  const noise=JSON.parse(execFileSync(process.env.PYTHON || 'python',['-c',`from PIL import Image
import numpy as np,json
b=np.asarray(Image.open('work/bone-before.png')).astype(int)
c=np.asarray(Image.open('work/bone-control.png')).astype(int)
a=np.asarray(Image.open('work/bone-after.png')).astype(int)
dc=np.abs(b-c);dp=np.abs(c-a)
print(json.dumps(dict(controlMax=int(dc.max()),prunedMax=int(dp.max()),controlMean=float(dc.mean()),prunedMean=float(dp.mean()))))`],{encoding:'utf8'}));
  const pixel={count:captures.count,identical:captures.identical,sameOff:captures.sameOff,...noise};console.log('pixels',pixel);
  if(pixel.prunedMax>pixel.controlMax+1 || pixel.prunedMean>pixel.controlMean+.0001) throw new Error('Render pruning changed the picture beyond control noise');
  const results=[];
  for(const key of ['wideIsland','jungle48','castawayEye']){
    const r=await p.evaluate(key=>__perfInterleave(key,[{name:'bone traversal',apply:()=>__boneTrial.set(false)},{name:'pruned bone traversal',apply:()=>__boneTrial.set(true)}],4,4),key);
    results.push(r);console.log(JSON.stringify(r));fs.writeFileSync('work/bone-render-trial.json',JSON.stringify({pixel,results},null,2));
  }
}finally{await browser.close();}
