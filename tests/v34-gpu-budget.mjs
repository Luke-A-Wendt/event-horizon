import assert from 'node:assert/strict';
import {RenderBudget,QUALITY_PROFILES,LOW_PIXEL_SCALES} from '../dist/performance-controller.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

function trace(b,fps,seconds,start=0){let t=start;const end=start+seconds*1000;while(t<end){t+=1000/fps;b.noteCompletion(t);}return t;}
{
 const b=new RenderBudget();let t=trace(b,60,6);assert.equal(b.effectiveQuality,'high');
 t=trace(b,20,10,t);assert.equal(b.effectiveQuality,'high','20 FPS holds the selected quality');
 t=trace(b,15,5,t);assert.equal(b.effectiveQuality,'high','15 FPS is an acceptable cadence');
 t=trace(b,10,8,t);assert.equal(b.effectiveQuality,'low');assert(b.safety>0,'Low can reduce pixels below its named budget');
 assert.equal(b.profile.steps,QUALITY_PROFILES.low.steps,'Emergency mode changes pixels without dropping ray geometry');
 t=trace(b,60,70,t);assert.equal(b.safety,0);assert.equal(b.effectiveQuality,'high','Restore pixels, then higher tiers');
 for(const name of ['low','medium','high','ultra']){b.setQuality(name,t);t=trace(b,2,5,t);assert.equal(b.profile,QUALITY_PROFILES[name]);}
 const stalled=new RenderBudget();for(let t=2000;t<=22000;t+=2000){stalled.noteFrame(t,2000);stalled.noteCompletion(t);}assert(stalled.safety>0,'Repeated multi-second callback stalls still reduce Low pixels');
 assert.equal(QUALITY_PROFILES.ultra.steps,768);assert.equal(QUALITY_PROFILES.ultra.pixels,16000000);
 const held=new RenderBudget();trace(held,30,45);assert.equal(held.effectiveQuality,'low','Stable 30 FPS does not trigger an upgrade above the requested band');
}
function simulation(options={}){
 const f=fixture({width:1280,height:720,...options}),r=new BlackHoleRenderer(f.canvas);let now=1000;
 function run(ms,interval=1000/60){const end=now+ms;while(now<end){now+=interval;f.step(r,now);}}
 return {f,r,run};
}
// A slow pixel-limited GPU must escape its old Low floor, then recover. This is
// a workload model for policy tests, not a physical S9/Pixel benchmark.
{
 const s=simulation();s.f.control.gpuLatencyMs=()=>500*(s.f.canvas.width*s.f.canvas.height/(1280*720*.28*.28));
 s.run(15000);assert.equal(s.r.budget.effectiveQuality,'low');assert(s.r.budget.safety>=3);assert(s.r.fps>=14.5,`Measured ${s.r.fps} FPS after adapting`);
 assert(s.f.canvas.width<1280*.28*.5);assert.equal(s.f.calls.finish,0);
 const ids=s.r.objects.map(o=>o.id);s.f.control.gpuLatencyMs=4;s.run(60000);assert.equal(s.r.budget.effectiveQuality,'high');assert.deepEqual(s.r.objects.map(o=>o.id),ids);s.r.dispose();
}
// WebGL1 completion queries provide real retirement and one-frame backpressure,
// rather than calling gl.finish or counting fast worker callbacks as frames.
{
 const s=simulation({webgl2:false,completionQuery:true,gpuLatencyMs:100});s.run(2000);
 assert(s.f.draws<=22);assert.equal(s.f.calls.fence,0);assert.equal(s.f.calls.finish,0);assert(s.r.budget.safety>0);
 s.f.control.gpuLatencyMs=4;s.run(60000);assert.equal(s.r.budget.effectiveQuality,'high');assert(s.f.calls.deleteQuery>0);s.r.dispose();
}
for(const refresh of [60,144]){
 const s=simulation({webgl2:false});s.run(7000,1000/refresh);assert.equal(s.r.budget.effectiveQuality,'high');assert(s.r.fps>30&&s.r.fps<43,'Legacy pacing permits measured upgrade headroom');assert.equal(s.f.calls.finish,0);s.r.dispose();
}
// Reducing samples must not reduce object slot capacity or display-space picks.
{
 const s=simulation();s.r.loadScene('solar-system');assert(s.r.focusTarget(s.r.objects.find(o=>o.name==='Earth').id,'track'));s.r.updateCameraFrame();s.r.fillObjects();s.r.packRenderObjects(s.r.cameraFrame,600);
 const selected=s.r.renderObjects.map(o=>o.id),count=s.r.objects.length,slots=s.r.shaderObjectSlots();
 s.r.packRenderObjects(s.r.cameraFrame,40);assert.deepEqual(new Set(s.r.renderObjects.map(o=>o.id)),new Set(selected));assert.equal(s.r.objects.length,count);assert.equal(s.r.shaderObjectSlots(),slots);s.r.dispose();
}
console.log('PASS:15–30 FPS hold band, >30 recovery, emergency Low pixel floor, unchanged manual Ultra/objects, completed-GPU backpressure, WebGL1 async queries and legacy upgrade cadence.');
