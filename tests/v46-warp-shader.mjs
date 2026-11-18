import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createFragment} from '../dist/shaders.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

function body(source,name){const start=source.indexOf(name+'('),open=source.indexOf('{',start);let end=open+1,depth=1;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}return source.slice(open+1,end-1);}
const local={warp:true,craftMask:8,objectSlots:2,grid:true,warpLocal:true,warpOnly:true,warpLocalOnlyCraft:true,ultra:true};
const isolated=createFragment(local),orbit=createFragment({...local,warpOnly:false});
assert(!body(isolated,'main').includes('for(int i=0;'),'Isolated live Ultra does not reintroduce the unused astronomical loop');
assert(body(isolated,'main').includes('warpLocalTrace')&&body(isolated,'main').includes('skyForWarpTravel'));
assert(body(isolated,'localWarpPass').includes('return true;'));
assert(body(isolated,'warpLocalTrace').includes('i<192'),'Ultra retains its higher local integration sample ceiling');
assert(isolated.includes('if(uDetail>2.5)'),'Ultra keeps its additional procedural detail');
assert(!body(isolated,'objectHit').includes('CraftSurface surface=craftHit'),'The sole craft is not traced twice');
assert(body(orbit,'main').includes('i<768'),'Combined Ultra retains black-hole world ray integration');
assert(!body(orbit,'objectHit').includes('CraftSurface surface=craftHit'),'A local Enterprise is excluded from world-loop craft intersection');
const companion=createFragment({...local,warpOnly:false,warpLocalOnlyCraft:false,craftMask:10});
assert(body(companion,'objectHit').includes('CraftSurface surface=craftHit'),'Other ships remain present');
assert.equal(createFragment({...local,photo:true}),createFragment({...local,photo:true,warpOnly:false,warpLocal:false,warpLocalOnlyCraft:false}),'Photo rendering stays unchanged');

// Explicitly requested diagnostic only: two native 8x8 first draws exercise
// deferred driver compilation. This is not a browser/mobile FPS benchmark.
if(process.env.NATIVE_WARP==='1'){
 const cases=[];
 for(const id of ['warp-lab','warp-orbit']){
  const f=fixture({width:390,height:700}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
  r.loadScene(id);r.setQuality('ultra');r.scenePreview=false;
  const craft=r.objects.find(o=>o.type==='enterprise');r.setFreeDrive(craft.id,true);r.setFlightPower(8);r.render(1000);
  const features={...r.shaderFeatures(),ultra:true},raw=createFragment(features);
  const fragment='#version 300 es\n'+raw.replace('precision highp float;','precision highp float;\nout vec4 outColor;').replaceAll('gl_FragColor','outColor');
  const uniforms=[...f.uniforms].map(([name,value])=>({name,...value}));
  for(const uniform of uniforms){if(uniform.name==='uSteps')uniform.args=[768];if(uniform.name==='uDetail')uniform.args=[3];}
  cases.push({name:id+'/Ultra/warp8',vertex:f.activeSources.find(s=>s.type===35633).source,fragment,firstFrameUniforms:uniforms});r.dispose();
 }
 const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:1024*1024,timeout:45000});
 if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
 assert(!result.error,result.error?.message);assert([0,77].includes(result.status));
 if(result.status===0)assert.equal((result.stdout.match(/FIRST FRAME:/g)||[]).length,2);
}
console.log('PASS: live Ultra retains isolated/local warp specialization, full sample/detail budgets, neighboring bodies, and unchanged photo rendering.');
