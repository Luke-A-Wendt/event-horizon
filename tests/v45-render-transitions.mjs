import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {snapshotRenderer,restoreRenderer,renderSignature} from '../dist/render-state.js';
import {STARTUP_PROFILE,QUALITY_PROFILES} from '../dist/performance-controller.js';
import {CPU_STARTUP_PROFILE,CPU_QUALITY_PROFILES} from '../dist/cpu-quality.js';

// Recording fixtures exercise lifecycle/control flow, not physical GPU speed.
function setup(options={}){
 const f=fixture(options),errors=[];
 const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,onError:e=>{if(e)errors.push(e);}});
 const draw=now=>{f.control.now=now;r.now=()=>now;return r.render(now);};
 return {f,r,errors,draw,warm(){draw(1000);draw(1017);draw(1034);r.releaseFence();assert.equal(r.scenePreview,false);}};
}

// Only initial startup gets a coarse preview. Scene and Drive changes retain
// both the selected mode and the current internal adaptive rung.
for(const quality of ['adaptive','low','medium','high','ultra']){
 const s=setup({width:390,height:700}),{r}=s;
 r.setQuality(quality);r.loadScene('warp-lab');
 assert.equal(r.profile(),STARTUP_PROFILE);
 s.warm();if(quality==='adaptive')r.budget.level=2;
 const profile=r.profile(),step=r.budget.step;
 for(const scene of ['disk','warp-lab']){
  r.loadScene(scene);assert.equal(r.scenePreview,false,scene);
  assert.equal(r.budget.step,step,scene);assert.equal(r.profile(),profile,scene);
 }
 const ship=r.objects.find(o=>o.type==='enterprise');assert(ship);
 for(const driving of [true,false]){
  assert(r.setFreeDrive(ship.id,driving));assert.equal(r.quality,quality);
  assert.equal(r.budget.step,step);assert.equal(r.profile(),profile);
 }
 r.dispose();
}

// Snapshot transport preserves the worker's exact rung; it does not adopt a
// UI host's unrelated timing or start the preview again.
{
 const a=setup(),b=setup();a.warm();b.warm();
 a.r.sceneRevision=2;a.r.loadScene('warp-lab');
 b.r.budget.level=2;b.r.budget.step--;
 const step=b.r.budget.step,profile=b.r.profile();
 restoreRenderer(b.r,snapshotRenderer(a.r));
 assert.equal(b.r.budget.step,step);assert.equal(b.r.profile(),profile);
 const ship=a.r.objects.find(o=>o.type==='enterprise');
 for(const driving of [true,false]){
  a.r.setFreeDrive(ship.id,driving);restoreRenderer(b.r,snapshotRenderer(a.r));
  assert.equal(b.r.budget.step,step);assert.equal(b.r.profile(),profile);
 }
 const signature=renderSignature(b.r);b.r.budget.level=3;
 assert.equal(renderSignature(b.r),signature,'Adaptive tier never changes readiness identity');
 a.r.dispose();b.r.dispose();
}

// Adaptive Ultra uses the actual Ultra shader and can capture its frame.
{
 const s=setup(),{r,f}=s;s.warm();r.budget.level=3;s.draw(1100);
 assert.equal(r.quality,'adaptive');assert(r.activeProgram.features.ultra);
 assert.equal(r.profile(),QUALITY_PROFILES.ultra);assert.equal(r.steps,768);
 assert(f.activeSources.some(x=>x.source.includes('i<768')));
 let result;
 r.captureRequest={quality:'adaptive',allowPreview:false,progress(){},finish(error,blob){result={error,blob};}};
 r.captureFreshFrame();await Promise.resolve();
 assert.equal(result?.error,null);assert(result?.blob.size>0);
 r.captureRequest=null;r.dispose();
}

// Pending Ultra still draws High and cannot earn further promotions from the
// cheaper fallback frames. A compile failure stays usable at High.
{
 const s=setup({parallelCompile:true}),{r,f,errors}=s;s.warm();
 f.control.compileComplete=false;r.budget.level=3;const step=r.budget.step;
 for(let now=1100;now<1600;now+=17)s.draw(now);
 assert(r.pendingProgram?.features.ultra);assert.equal(r.profile(),QUALITY_PROFILES.high);
 assert.equal(r.budget.step,step);
 f.control.compileComplete=true;f.control.linkSuccess=false;s.draw(1700);
 assert.equal(r.budget.effectiveQuality,'high');assert.equal(r.activeProgram.features.ultra,false);
 assert.equal(r.budget.maximumStep,r.budget.step);assert.deepEqual(errors,[]);
 assert(s.draw(1717));r.dispose();
}

// Polling the same unfinished draw can reduce detail repeatedly, even after
// a quality change resets timing generation. No synchronous GPU waits.
{
 const s=setup(),{r,f}=s;s.warm();r.budget.level=2;f.control.gpuComplete=false;s.draw(2000);
 const high=r.budget.step;r.gpuAvailable(2050);r.gpuAvailable(2110);
 const first=r.budget.step;assert(first<high);
 r.gpuAvailable(2240);assert(r.budget.step<first);
 r.gpuAvailable(3100);assert.equal(r.budget.step,0);
 r.budget.level=2;r.beginSceneRendering();const retained=r.budget.step;
 r.gpuAvailable(4200);assert.equal(r.budget.step,retained,'An old scene fence cannot degrade its replacement');
 assert.equal(f.calls.finish,0);r.dispose();
}

// CPU transitions retain the same budget object/profile as well, including
// manual tiers. The cold adaptive renderer still begins with its cheap floor.
for(const quality of ['adaptive','high','ultra']){
 fixture();const canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=()=>({width:390,height:700});
 const r=new CpuRenderer(canvas,{autoStart:false,bindControls:false});
 assert.equal(r.cpuProfile,CPU_STARTUP_PROFILE);
 r.noteCpuCost(15,1000,'frame');
 if(quality==='adaptive')r.cpuBudget.level='high';else r.setQuality(quality);
 const budget=r.cpuBudget,profile=r.cpuProfile;
 r.loadScene('warp-lab');assert.equal(r.cpuBudget,budget);assert.equal(r.cpuProfile,profile);
 const ship=r.objects.find(o=>o.type==='enterprise');
 for(const driving of [true,false]){r.setFreeDrive(ship.id,driving);assert.equal(r.cpuBudget,budget);assert.equal(r.cpuProfile,profile);}
 if(quality!=='adaptive')assert.equal(profile,CPU_QUALITY_PROFILES[quality]);
 r.dispose();
}
console.log('PASS: GPU/CPU scene and Drive transitions retain fidelity; cold preview, worker identity, real Adaptive Ultra, capture, graceful compile failure, and repeated stall relief.');
