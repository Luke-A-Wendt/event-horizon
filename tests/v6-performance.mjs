// Responsiveness contracts: deterministic budget logic and recorded WebGL calls.
// These tests do not benchmark a browser, mobile GPU, or shader compiler.
import assert from 'node:assert/strict';
import { RenderBudget, ADAPTIVE_LEVELS, QUALITY_PROFILES } from '../dist/performance-controller.js';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { fixture } from './render-fixture.mjs';
import { CRAFT_GLSL, createCraftGLSL } from '../dist/craft-glsl.js';
import { createFragment } from '../dist/shaders.js';

// Adaptive now selects the same named profiles as manual mode. Its behavioral
// 30 FPS/recovery regressions live in v7-adaptive.mjs.
assert.deepEqual(ADAPTIVE_LEVELS,[QUALITY_PROFILES.low,QUALITY_PROFILES.medium,QUALITY_PROFILES.high]);
for(const name of ['low','medium','high','ultra']){
 const b=new RenderBudget();b.setQuality(name);assert.deepEqual(b.profile,QUALITY_PROFILES[name]);
}
assert(QUALITY_PROFILES.ultra.steps>=768&&QUALITY_PROFILES.ultra.pixels>=16000000);

// KHR compilation is polled without querying LINK_STATUS until completion.
// A compatible image may continue while Ultra warms; new objects must never
// disappear behind a temporarily incompatible shader.
{
 const f=fixture({parallelCompile:true,compileComplete:false});
 const r=new BlackHoleRenderer(f.canvas);
 r.frame(1000);r.frame(1016.667);
 assert.equal(f.calls.linkStatus,0,'Pending parallel compilation must not synchronously query link status');
 assert.equal(f.draws,0);assert.equal(r.ready,false);
 f.control.compileComplete=true;r.frame(1033.334);
 assert(r.ready&&f.draws>0);assert(f.calls.linkStatus>0);
 f.control.compileComplete=false;r.setQuality('ultra');const before=f.draws;
 r.frame(1050.001);
 assert(f.draws>before,'A compatible working image should continue while Ultra compiles');
 assert(r.steps<=288&&!r.activeProgram.features.ultra,'Do not submit Ultra work before its program is ready');
 f.control.compileComplete=true;r.frame(1066.668);assert(r.activeProgram.features.ultra&&r.steps>=768);
 f.control.compileComplete=false;r.addObject('enterprise',14,0,1);const beforeCraft=f.draws;
 r.frame(1083.335);r.frame(1100.002);
 assert.equal(f.draws,beforeCraft,'New craft must not be drawn with a shader that omits the craft');
 assert.equal(r.objects.length,1,'Compiling must preserve the requested object');
 f.control.compileComplete=true;r.frame(1116.669);
 assert(f.draws>beforeCraft&&r.activeProgram.features.craft);
 assert(f.activeSources.find(source=>source.type===f.gl.FRAGMENT_SHADER)?.source.includes('craft'),'Native fixture must retain the active shader source');
 r.dispose();assert.equal(f.calls.finish,0);
}

// A stalled GPU gets no extra submissions and no resize until its previous
// frame completes. This protects input responsiveness independently of quality.
{
 const f=fixture({width:3000,height:2000}),r=new BlackHoleRenderer(f.canvas);
 r.setQuality('high');f.step(r,1000);
 const beforeDraws=f.draws,pixels=f.canvas.width*f.canvas.height;
 f.control.gpuComplete=false;r.setQuality('low');
 f.step(r,1016.667);f.step(r,1100);
 assert.equal(f.draws,beforeDraws,'No second draw may queue behind an unfinished frame');
 assert.equal(f.canvas.width*f.canvas.height,pixels,'Defer resize until the old framebuffer is no longer in flight');
 f.control.gpuComplete=true;f.step(r,1116.667);
 assert.equal(f.draws,beforeDraws+1);assert(f.canvas.width*f.canvas.height<pixels);
 assert.equal(r.steps,QUALITY_PROFILES.low.steps);
 assert(f.calls.wait>0&&f.calls.deleteSync>0&&f.calls.finish===0);
 document.hidden=true;document.emit('visibilitychange');const hiddenDraws=f.draws;f.step(r,1133.334);assert.equal(f.draws,hiddenDraws);
 document.hidden=false;document.emit('visibilitychange');f.step(r,1150.001);assert(f.draws>hiddenDraws);
 f.canvas.emit('webglcontextlost');const lostDraws=f.draws;f.step(r,1166.668);assert.equal(f.draws,lostDraws);
 f.canvas.emit('webglcontextrestored');f.step(r,1183.335);assert(f.draws>lostDraws&&r.ready);
 r.dispose();assert.equal(f.canvas.listeners.size,0);assert.equal(document.listeners.size,0);assert.equal(window.listeners.size,0);
}

// The no-fence fallback keeps a bounded submission cadence. Its quality
// decision uses that rendered cadence, not an impossible 60 FPS assumption.
{
 const f=fixture({webgl2:false}),r=new BlackHoleRenderer(f.canvas);
 for(let i=0;i<=60;i++)f.step(r,1000+i*16.667);
 assert(f.draws<=32&&f.draws>=25,`WebGL1 submitted ${f.draws} frames in one second`);
 assert.equal(f.calls.fence,0);assert.deepEqual(r.profile(),QUALITY_PROFILES[r.getState().effectiveQuality]);
 r.dispose();
}
console.log('PASS: nonblocking parallel compilation, compatible-program continuity, complete craft shaders, one-frame GPU backpressure, deferred resize, visibility/context lifecycle, and WebGL1 submission cap.');

// Statistics count completed submissions, not RAF callbacks: a blocked GPU
// must not show 60 FPS simply because callbacks continue to run.
{
 const f=fixture({gpuComplete:false}),statistics=[];
 const r=new BlackHoleRenderer(f.canvas,{onStats:state=>statistics.push(state)});
 for(let i=0;i<130;i++)r.frame(1000+i*16.667);
 assert.equal(f.draws,1);assert(statistics.length>=2);assert.equal(statistics.at(-1).fps,0);
 assert.equal(statistics.at(-1).gpuWaiting,true);r.dispose();
}

// Capability changes may create multiple programs, but the cache is bounded.
// Quality reductions eventually replace Ultra's longer compiled loop as well.
{
 const f=fixture(),r=new BlackHoleRenderer(f.canvas);
 for(const state of [
  {quality:'ultra'}, {quality:'high',grid:true}, {quality:'ultra',grid:true},
  {quality:'high',warp:true}, {quality:'ultra',warp:true}, {quality:'low',warp:false,grid:false}
 ]){
  const {quality,...patch}=state;r.update(patch);r.setQuality(quality);r.render();
  assert(r.programs.size<=4);assert.equal(r.activeProgram.features.ultra,quality==='ultra');
 }
 assert(f.programs.length>=5,'Fixture must exercise multiple compiled capabilities');
 const disposedBefore=f.disposed;r.dispose();assert(f.disposed>disposedBefore);
}
console.log('PASS: honest stalled-GPU FPS reporting and bounded feature-program cache.');

// An existing spacecraft shader is only compatible with its compiled models.
// Adding another craft must not temporarily substitute a sphere or omit it.
{
 const f=fixture({parallelCompile:true}),r=new BlackHoleRenderer(f.canvas);
 r.frame(1000);r.addObject('enterprise',14,0,1);r.frame(1016.667);r.frame(1033.334);
 assert.equal(r.activeProgram.features.craftMask,8);
 f.control.compileComplete=false;r.addObject('shuttle',16,1,1);const draws=f.draws;
 r.frame(1050.001);r.frame(1066.668);
 assert.equal(r.pendingProgram.features.craftMask,10);
 assert.equal(r.activeProgram.features.craftMask,8);assert.equal(f.draws,draws,'Enterprise-only geometry must not stand in for a newly added shuttle');
 assert.equal(r.objects.length,2);
 f.control.compileComplete=true;r.frame(1083.335);
 assert.equal(r.activeProgram.features.craftMask,10);assert(f.draws>draws);
 assert.equal(f.uniforms.get('uObjectCount').args[0],2);
 assert(r.programSupports({...r.shaderFeatures(),craftMask:8}),'A compiled superset may continue rendering its remaining model');
 assert(!r.programSupports({...r.shaderFeatures(),craftMask:11}),'Uncompiled ISS geometry must require a new variant');
 // If objects are removed during compilation, a completed superset is already
 // useful; do not freeze another interval just to compile a smaller variant.
 f.control.compileComplete=false;const station=r.addObject('iss',18,2,1);r.frame(1100.002);
 assert.equal(r.pendingProgram.features.craftMask,11);
 for(const object of [...r.objects])if(object.id!==station.id)r.removeObject(object.id);
 const beforeSuperset=f.draws;f.control.compileComplete=true;r.frame(1116.669);
 assert(f.draws>beforeSuperset,'A freshly completed superset must render after objects are removed mid-compile');
 assert(r.programSupports(r.shaderFeatures()));assert.equal(f.uniforms.get('uObjectCount').args[0],1);
 r.dispose();
}
console.log('PASS: craft-specific shader compatibility preserves each requested model during compilation.');

// Specialization removes absent geometry, never detail within a selected model.
// Compare complete balanced model bodies against the original full source.
{
 const anchors=['// ISS: x extent','// Shuttle: nose-to-engine','// EMU-inspired articulated pressure suit.','// TOS studio-model silhouette.'];
 const modelBody=(source,anchor)=>{
  const marker=source.indexOf(anchor);assert(marker>=0);const start=source.lastIndexOf('{',marker);let depth=1,end=start+1;
  for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
  assert.equal(depth,0,'Model geometry must retain balanced branches');return source.slice(start+1,end-1).trim();
 };
 assert.equal(createCraftGLSL(),CRAFT_GLSL,'Default catalog remains byte-identical');
 for(let mask=1;mask<=15;mask++){
  const selected=createCraftGLSL({mask});
  for(let i=0;i<4;i++){
   assert.equal(selected.includes(anchors[i]),Boolean(mask&(1<<i)),'Absent model geometry must not enter the shader');
   if(mask&(1<<i))assert.equal(modelBody(selected,anchors[i]),modelBody(CRAFT_GLSL,anchors[i]),'Every selected model keeps all its original geometry');
  }
 }
 const warpOnly=createFragment({warp:true,craftMask:0,grid:true}),full=createFragment({warp:true,craftMask:15,grid:true});
 assert(warpOnly.includes(anchors[3]));for(const anchor of anchors.slice(0,3))assert(!warpOnly.includes(anchor));
 assert(warpOnly.length<full.length-4000,'The warp-only program must actually omit unused model source');
 const f=fixture(),r=new BlackHoleRenderer(f.canvas);r.loadWarpScenario('isolated');r.render();
 assert.equal(r.activeProgram.features.craftMask,8,'The isolated warp scene should request only its Enterprise geometry');
 const source=f.activeSources.find(entry=>entry.type===f.gl.FRAGMENT_SHADER).source;
 assert(source.includes(anchors[3]));for(const anchor of anchors.slice(0,3))assert(!source.includes(anchor));
 r.dispose();
}
console.log('PASS: all 15 craft masks retain complete selected geometry, omit absent models, preserve the full catalog, and keep the warp program Enterprise-only.');
