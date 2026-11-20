// Exercise the shipped model-selection path into both the live and frozen-picture
// shaders, including a scene which contains the two shuttle designs together.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './render-fixture.mjs';
import './fixtures/shuttle-bridge.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {createFragment,VERTEX} from '../dist/shaders.js';
const shaders=[];
for(const webgl2 of [false,true]){
 const f=fixture({width:360,height:240,webgl2});
 const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,deferProgram:true});
 for(const scene of ['test-shuttle-bridge','nasa-shuttle','solar-system','empty-space']){
  r.loadScene(scene);
  const mixed=scene==='empty-space',ship=mixed?r.addChildObject('space','shuttle',{x:0,y:0,z:0}):r.objects.find(x=>x.type==='shuttle');
  const subject=mixed?r.addChildObject('space','heritageShuttle',{x:90,y:0,z:0}):ship;
  assert.equal(ship?.type,'shuttle');assert.equal(subject?.type,mixed?'heritageShuttle':'shuttle');
  const mode=mixed?'track':'onboard';
  r.focusTarget(subject.id,mode);r.setQuality('low');r.render();assert.equal(r.focusId,subject.id);
  const snap=r.beginPhotoCapture(),uniform=(key)=>snap.uniforms.find(x=>x.name===key)?.args[0];
  const rgba=uniform('uColors[0]'),codes=rgba.filter((_,i)=>i%4===3);
  assert(codes.includes(4));if(mixed)assert(codes.includes(16));
  if(mixed)assert(snap.features.craftMask&128);
  if(scene==='solar-system')assert(snap.features.weakField);
  assert.equal(uniform('uCockpitMode'),mixed?0:1);
  assert(snap.features.craftMask&2);assert.equal(r.activeProgram.features.craftMask,snap.features.craftMask);
  for(const photo of [false,true]){
   let vertex=VERTEX,fragment=createFragment(photo?{...snap.features,photo:true,ultra:true}:r.activeProgram.features);
   assert(fragment.slice(fragment.lastIndexOf('void main()')).includes('meridianLounge('),'Onboard and capture shaders must call the active canopy renderer');
   if(webgl2){vertex='#version 300 es\n'+vertex.replace('attribute','in');fragment='#version 300 es\n'+fragment.replace('precision highp float;','precision highp float;\nout vec4 outColor;').replaceAll('gl_FragColor','outColor');}
   shaders.push({name:scene+'/'+mode+'/'+(photo?'photo':'live')+'/WebGL'+(webgl2?2:1),vertex,fragment});
  }
  r.endPhotoCapture();
 }
 r.dispose();
}
const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(shaders),encoding:'utf8',maxBuffer:1024*1024,timeout:120000});
assert(!result.error,result.error?.message);
assert.equal([0,77].includes(result.status),true,result.stdout+'\n'+result.stderr);
console.log(result.stdout.trim());
console.log('PASS: bridge, black-hole and mixed Meridian/heritage live and photographic dispatch.');
