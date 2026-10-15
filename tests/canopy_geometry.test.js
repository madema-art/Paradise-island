// Bundled with a no-render core stub by canopy_unit.mjs; exercises real builders.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MB, mat4, windify, tube } from '../src/gfx.js';
import { canopyLobe } from '../src/canopy.js';
import { recordDraws } from '../src/util.js';
import { lodFamily, setInstanceHidden } from '../src/vegetation_lod.js';
import { camera, U, updaters } from '../src/core.js';
import { indexedVegetation } from './helpers/vegetation_index_trial.js';

test('MB default stays flat; smoothing is explicitly selected per component', () => {
  const source = new THREE.IcosahedronGeometry(1, 1), c = new THREE.Color('#449944');
  const flat = new MB(), smooth = new MB();
  flat.addGeo(source, mat4(0,0,0,2,1,2), c, .8);
  smooth.addGeo(source, mat4(0,0,0,2,1,2), c, .8, { smooth: true });
  const a = flat.build(), b = smooth.build();
  for (const attr of ['position','color','aWind']) assert.deepEqual(a.attributes[attr].array, b.attributes[attr].array);
  assert.equal(a.attributes.normal.getX(0), a.attributes.normal.getX(1));
  assert.notDeepEqual(a.attributes.normal.array, b.attributes.normal.array);
  for (let i=0;i<b.attributes.normal.count;i++) assert.ok(Math.abs(Math.hypot(b.attributes.normal.getX(i),b.attributes.normal.getY(i),b.attributes.normal.getZ(i))-1)<1e-5);
});

test('canopy detail is bounded, deterministic and does not draw from world RNG', () => {
  const geos = [];
  for (let detail=0;detail<3;detail++) {
    const build = () => { const mb = new MB(); canopyLobe(mb,new THREE.Vector3(0,12,0),5,.55,new THREE.Color('#327a30'),42,detail); return mb.build(); };
    const { result: g, values } = recordDraws(build);
    assert.equal(values.length,0);
    assert.equal(g.attributes.position.count / 3,[260,80,32][detail]);
    assert.deepEqual(g.attributes.position.array,build().attributes.position.array);
    assert.ok(Array.from(g.attributes.normal.array).every(Number.isFinite));
    assert.ok(Array.from(g.attributes.aWind.array).every(w=>w>0));
    g.computeBoundingBox(); geos.push(g);
  }
  // Same centres, retained low skirt, and comparable silhouette size in each level.
  const sizes=geos.map(g=>g.boundingBox.getSize(new THREE.Vector3()));
  for (const s of sizes.slice(1)) for (const axis of ['x','y','z']) assert.ok(s[axis]/sizes[0][axis]>.7 && s[axis]/sizes[0][axis]<1.3);
});

test('render indexing eliminates duplicate vertices without changing any triangle attributes', () => {
  const mb = new MB(); canopyLobe(mb,new THREE.Vector3(0,12,0),5,.55,new THREE.Color('#327a30'),42,0);
  const source = mb.build(), result = indexedVegetation(source);
  assert.equal(result.index.count,source.attributes.position.count);
  assert.ok(result.attributes.position.count < source.attributes.position.count*.4);
  for (const key of ['position','normal','color','aWind']) {
    const a=source.attributes[key], b=result.attributes[key];
    for(let i=0;i<a.count;i++) for(let k=0;k<a.itemSize;k++) assert.equal(b.array[result.index.getX(i)*b.itemSize+k],a.array[i*a.itemSize+k]);
  }
  assert.equal(indexedVegetation(source),result,'same geometry reused by every family');
  assert.equal(source.index,null,'inspection source untouched');
});

test('distant wind remains animated with an independent shared shader program', () => {
  const a = new THREE.MeshStandardMaterial(), b = a.clone(); windify(a); windify(b,{distant:true});
  assert.notEqual(a.customProgramCacheKey(),b.customProgramCacheKey());
  const shader = { uniforms:{}, vertexShader:'#include <common>\n#include <begin_vertex>', fragmentShader:'#include <common>\n#include <color_fragment>' };
  b.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('float sway = sin('));
  assert.ok(!shader.vertexShader.includes('float front ='));
  assert.ok(shader.vertexShader.includes('transpose(R)'));
  assert.ok(shader.fragmentShader.includes('uWet'));
});

test('front-face tree tubes have outward winding; legacy tube output stays unchanged', () => {
  const make = outward => {
    const mb = new MB(); tube(mb,[new THREE.Vector3(0,0,0),new THREE.Vector3(0,2,0)],[1,1],8,()=>new THREE.Color('#886644'),()=>.5,{outward}); return mb.build();
  };
  const old = make(false), next = make(true);
  assert.equal(old.attributes.position.count,next.attributes.position.count);
  for (let i=0;i<next.attributes.position.count;i++) {
    const p=next.attributes.position, n=next.attributes.normal;
    assert.ok(p.getX(i)*n.getX(i)+p.getZ(i)*n.getZ(i)>0);
  }
  const sorted = g => Array.from({length:g.attributes.position.count},(_,i)=>[g.attributes.position.getX(i),g.attributes.position.getY(i),g.attributes.position.getZ(i)].join(',')).sort();
  assert.deepEqual(sorted(old),sorted(next));
});

test('LOD owns each instance exactly once through camera changes, fading and resize', () => {
  const geos = [0,1,2].map(() => new THREE.BoxGeometry(2,2,2));
  const proxy = new THREE.InstancedMesh(geos[0],new THREE.MeshStandardMaterial(),3);
  proxy.castShadow = true;
  for (let i=0;i<3;i++) { proxy.setMatrixAt(i,new THREE.Matrix4().makeTranslation(i*20,10,0)); proxy.setColorAt(i,new THREE.Color(i===0?'red':i===1?'green':'blue')); }
  const f = lodFamily(proxy,geos,[{sc:1},{sc:1},{sc:1}],{tree:true});
  const tick = () => updaters.forEach(fn=>fn());
  const count = () => f.batches.reduce((n,b)=>n+b.count,0);
  camera.position.set(0,10,3); tick(); assert.equal(f.level[0],0); assert.equal(count(),3);
  assert.equal(f.batches.filter(b=>b.count).length,1,'small tree family uses one finest-needed batch');
  assert.ok(f.batches.every(b=>b.castShadow && b.frustumCulled));
  camera.position.z = 8.5; tick(); assert.equal(f.level[0],1);
  camera.position.z = 7.5; tick(); assert.equal(f.level[0],1,'hysteresis prevents boundary flicker');
  camera.position.z = 6; tick(); assert.equal(f.level[0],0);
  camera.position.set(0,10,100); tick(); assert.equal(f.level[0],2); assert.equal(count(),3);
  const b = f.batches[2];
  assert.ok(setInstanceHidden(proxy,1,true)); assert.equal(count(),2);
  const versions = f.batches.map(b=>b.instanceMatrix.version);
  setInstanceHidden(proxy,1,true); tick(); assert.deepEqual(f.batches.map(b=>b.instanceMatrix.version),versions);
  setInstanceHidden(proxy,1,false); assert.equal(count(),3);
  for (const batch of f.batches) for (let j=0;j<batch.count;j++) {
    const source = Math.round(batch.instanceMatrix.array[j*16+12]/20);
    for (let k=0;k<3;k++) assert.equal(batch.instanceColor.array[j*3+k],proxy.instanceColor.array[source*3+k]);
  }
  U.pxScale.value = 20000; tick(); assert.equal(f.level[0],0,'pixel scale change invalidates stationary camera cache');
});

test('large tree families retain per-instance LOD instead of raising every distant tree', () => {
  const g = new THREE.BoxGeometry(2,2,2), proxy = new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial(),11);
  const list=Array.from({length:11},()=>({sc:1}));
  for(let i=0;i<11;i++)proxy.setMatrixAt(i,new THREE.Matrix4().makeTranslation(i*50,10,0));
  const f=lodFamily(proxy,[g,g,g],list,{tree:true}); U.pxScale.value=1000; camera.position.set(0,10,2);
  updaters.forEach(fn=>fn());
  assert.equal(f.requested,null); assert.equal(f.level[0],0); assert.equal(f.level[10],2);
  assert.ok(f.batches.filter(b=>b.count).length>1);
});
