import { chromium } from 'file:///C:/Users/matta/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../work/life-test');
fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(root+'/life-history.jsonl','');
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:960,height:640}});const errors=[];
await page.addInitScript(() => { let seed=901;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}; });
page.on('pageerror',e=>{errors.push(e.message);fs.writeFileSync(root+'/browser-errors.json',JSON.stringify(errors));});
page.on('console',m=>{fs.appendFileSync(root+'/browser-console.log',m.text()+'\n');});
page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/notes'))errors.push(r.status()+' '+r.url());});
try {
 await page.goto('http://127.0.0.1:8767/?lifeReview&noauto',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__dbg&&!!window.render_game_to_text,{timeout:120000});
 await page.evaluate(()=>{document.querySelector('#boot').style.display='none';window.__dbg.env.tod=10;window.__dbg.env.speed=1;});
 await page.keyboard.press('h'); await page.click('#cwneeds .cw-head');
 assert.equal(await page.evaluate(()=>window.__dbg.cam.follow?.id),'castaway');
 await page.keyboard.press('p');
 const pausedPosition=await page.evaluate(()=>{window.__step(.05);return window.__dbg.creatures.find(c=>c.id==='castaway').group.position.toArray();});
 await page.evaluate(()=>{for(let i=0;i<20;i++)window.__step(.05);});
 assert.deepEqual(await page.evaluate(()=>window.__dbg.creatures.find(c=>c.id==='castaway').group.position.toArray()),pausedPosition);
 await page.keyboard.press('p');
 const initial=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));fs.writeFileSync(root+'/life-initial.json',JSON.stringify(initial,null,2));
 for(let i=0;i<30;i++) {
   await page.evaluate(()=>{for(let n=0;n<200;n++){window.__step(.05);if(window.__dbg.creatures.find(c=>c.id==='castaway').sim.needs.fulfillment>=.25)break;}});
   const s=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));fs.writeFileSync(root+'/life-live.json',JSON.stringify(s,null,2));
   fs.appendFileSync(root+'/life-history.jsonl',JSON.stringify(s)+'\n');
   if(i===0) {
     await page.evaluate(()=>window.advanceTime(16));await page.screenshot({path:root+'/life-gathering.png'});
     const before=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
     await page.evaluate(()=>{window.__sv.open();window.__step(.05);});
     const interrupted=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
     assert.equal(interrupted.mode,'survival');assert.deepEqual(interrupted.life.inventory,before.life.inventory);
     if(before.life.action)assert.equal(interrupted.life.interruptions,before.life.interruptions+1);
     await page.evaluate(()=>window.__sv.close());
   }
   if(s.life.completed)break;
 }
 const completed=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
 assert.equal(completed.life.completed,true,JSON.stringify(completed));assert.equal(completed.life.structures.length,1);
 assert.equal(completed.mode,'observation');assert.equal(completed.wildlife,initial.wildlife);
 await page.evaluate(()=>{const d=window.__dbg;const s=JSON.parse(window.render_game_to_text()).life.site;const y=d.WORLD.getHeight(s.x,s.z);d.cam.goto([s.x+3.5,y+2.8,s.z+4],[s.x+.7,y+.7,s.z]);d.composer.render();});
 await page.screenshot({path:root+'/life-completed.png'});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('paradise.observation.life.v1')));
 assert.equal(saved.project.completed,true);assert.equal(saved.structures.length,1);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__dbg&&!!window.render_game_to_text,{timeout:120000});
 const reloaded=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));assert.equal(reloaded.life.completed,true);assert.equal(reloaded.life.structures.length,1);
 // Exercise classic mode entry/exit and observe restoration without overwriting either save.
 await page.evaluate(()=>window.__sv.open());assert.equal(await page.evaluate(()=>window.__sv.active),true);
 await page.evaluate(()=>{const sv=window.__sv;sv.begin(null);sv.add('stick',1,true);sv.add('stone',2,true);sv.add('fiber',1,true);sv.craft('axe');for(let i=0;i<40;i++)window.__step(.05);});
 assert.equal(await page.evaluate(()=>window.__sv.count('axe')),1);
 assert.equal(await page.evaluate(()=>window.__sv.s.dur.axe),28);
 await page.evaluate(()=>window.__sv.close());assert.equal(await page.evaluate(()=>window.__sv.active),false);
 const after=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));assert.equal(after.mode,'observation');assert.equal(after.life.structures.length,1);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(root+'/browser-result.json',JSON.stringify({initial,completed,reloaded,after,errors},null,2));
 console.log('Real-game activity, reload persistence, wildlife count and survival handoff passed');
} finally {await browser.close();}
