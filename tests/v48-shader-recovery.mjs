import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

function setup({successLimit=4,parallelCompile=true}={}){
 const f=fixture({width:390,height:700,parallelCompile}),errors=[],attempts=[];
 const parameter=f.gl.getProgramParameter;
 f.gl.getProgramParameter=(program,key)=>{
  if(key!==f.gl.LINK_STATUS)return parameter(program,key);
  const fragment=program.shaders.find(shader=>shader.type===f.gl.FRAGMENT_SHADER)?.source||'';
  const slots=Number(fragment.match(/uObjects\[(\d+)\]/)?.[1]);attempts.push(slots);
  return slots<=successLimit;
 };
 f.gl.getProgramInfoLog=()=> 'Fragment shader is not compiled.';
 f.gl.getShaderInfoLog=shader=>shader.type===f.gl.FRAGMENT_SHADER?'ERROR: fragment uniform resource limit exceeded at uObjects.':'';
 const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,deferProgram:true,onError:e=>{if(e)errors.push(e);}});
 r.now=()=>f.control.now;r.setQuality('low');r.loadScene('solar-system');
 const run=()=>{for(let i=0;i<12;i++){f.control.now+=50;r.render(f.control.now);}};
 return {r,f,errors,attempts,run,catalogCount:r.objects.length};
}

// Lower array capacity only after an actual failure. Retain the same shader
// features, chosen quality and logical catalog while trying a bounded ladder.
for(const parallelCompile of [false,true]){
 const {r,f,errors,attempts,run,catalogCount}=setup({parallelCompile});run();
 assert(r.ready&&r.activeProgram);
 assert.equal(r.activeProgram.features.objectSlots,4);
 assert.equal(r.quality,'low');assert.equal(r.budget.effectiveQuality,'low');
 assert(catalogCount>500);assert.equal(r.objects.length,catalogCount,'The logical scene is never deleted to fit a driver');
 assert(r.activeProgram.features.planetary&&r.activeProgram.features.stellar&&r.activeProgram.features.rings);
 assert.equal(r.activeProgram.features.craftMask&3,3);
 assert.deepEqual([...new Set(attempts.filter(x=>x>=4))],[6,4]);
 assert.equal(errors.length,0,'Recoverable compiler failures do not show a fatal scene error');
 assert(r.objectCount<=4);assert.equal(f.calls.finish,0);
 r.loadScene('solar-system-natural');assert.equal(r.shaderObjectSlots(),6,'One scene fallback does not reduce every scene');
 r.loadScene('solar-system');assert.equal(r.shaderObjectSlots(),4,'Returning to the same scene reuses its compatible capacity');
 r.dispose();
}

// If even the smallest program fails, show the actual fragment compiler
// diagnostic alongside the generic link error, once the bounded retries end.
{
 const {r,errors,attempts,run}=setup({successLimit:0});run();
 assert(attempts.includes(2));assert(attempts.length<=8,'No retry loop after the smallest capacity');
 assert(errors.some(e=>e.includes('fragment uniform resource limit exceeded')),'Detailed shader log survives the generic program message');
 assert(errors.some(e=>e.includes('Fragment shader is not compiled')));
 r.dispose();
}
console.log('PASS: bounded solar shader compatibility retries, retained features/catalog/quality, per-scene capacity and useful terminal diagnostics.');
