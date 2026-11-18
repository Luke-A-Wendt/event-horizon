import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {createFragment} from '../dist/shaders.js';

function body(source,name){const start=source.indexOf(name+'('),open=source.indexOf('{',start);let end=open+1,depth=1;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}return source.slice(open+1,end-1);}
const isolated={warp:true,craftMask:8,objectSlots:2,grid:true,warpLocal:true,warpOnly:true,warpLocalOnlyCraft:true};
const fast=createFragment(isolated);
assert(!body(fast,'main').includes('i<288'),'Isolated warp has no unused astronomical integration loop');
assert(body(fast,'main').includes('warpLocalTrace')&&body(fast,'main').includes('skyForWarpTravel'));
assert(!body(fast,'objectHit').includes('CraftSurface surface=craftHit'),'Sole locally traced craft is not compiled into the world loop');
const orbit=createFragment({...isolated,warpOnly:false});assert(body(orbit,'main').includes('i<288'),'Combined scenes retain astronomical ray bending');
const companion=createFragment({...isolated,warpOnly:false,warpLocalOnlyCraft:false,craftMask:10});assert(body(companion,'objectHit').includes('CraftSurface surface=craftHit'),'Other spacecraft keep their geometry');
for(const extra of [{photo:true,ultra:true}])assert.equal(createFragment({...isolated,...extra}),createFragment({...isolated,...extra,warpLocal:false,warpOnly:false,warpLocalOnlyCraft:false}),'Photograph programs retain their full independent path');
const cases=[];
for(const webgl2 of [false,true])for(const id of ['warp-lab','warp-orbit']){
 const f=fixture({width:390,height:700,webgl2}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene(id);r.setQuality('low');r.render();
 assert(r.activeProgram.features.warpLocal);assert.equal(r.activeProgram.features.warpOnly,id==='warp-lab');assert(r.activeProgram.features.warpLocalOnlyCraft);
 cases.push({name:`${id}/live/WebGL${webgl2?2:1}`,vertex:f.activeSources.find(s=>s.type===35633).source,fragment:f.activeSources.find(s=>s.type===35632).source});r.dispose();
}
const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:1024*1024,timeout:60000});
if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
assert(!result.error,result.error?.message);assert([0,77].includes(result.status));
console.log('PASS: isolated/combined live warp specialization, other craft retention, optimized live Ultra and unchanged photo shaders, and native WebGL1/2 compile/link.');
