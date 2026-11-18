import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';

// Recording fixtures validate input/worker/GPU scheduling, not device speed.
function setup(options={}){
 const f=fixture({width:390,height:700,...options}),errors=[];
 const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,onError:e=>{if(e)errors.push(e);}});
 const at=now=>{f.control.now=now;r.now=()=>now;};
 const draw=now=>{at(now);return r.render(now);};
 r.loadScene('warp-lab');const ship=r.objects.find(o=>o.type==='enterprise');
 assert.equal(r.getNavigationState(ship.id).mode,'manual','Laboratory opens with the slider ready');
 assert.equal(r.getFlightState().warpFactor,4,'Drive inherits the authored warp setting');
 r.setFlightPower(0);
 r.focusTarget(ship.id,'track',false,true);
 draw(1000);draw(1017);draw(1034);r.releaseFence();assert(!r.scenePreview);
 return {r,f,errors,at,draw};
}

// Slider updates invalidate pre-input cadence and reach the render worker's
// interaction guard; they must not promote based on the old, cheaper image.
{
 const host=setup(),worker=setup();host.at(1500);worker.at(1500);
 host.r.setFlightPower(4);
 const snapshot=snapshotRenderer(host.r,{includeInteraction:true});assert(snapshot.cameraInteracting);
 worker.r.budget.level=2;restoreRenderer(worker.r,snapshot);
 assert(worker.r.budget.interactionUntil>1500);
 const high=worker.r.budget.step;
 for(let i=0;i<90;i++){
  const now=1520+i*16;host.at(now);worker.at(now);
  host.r.setFlightPower(i%2?9.9999:0);
  restoreRenderer(worker.r,snapshotRenderer(host.r,{includeInteraction:true}));
  worker.draw(now);
  assert(worker.r.budget.step<=high,'Held slider does not promote; measured probe may reduce work');
  assert(!worker.r.activeProgram.features.ultra,'No Ultra compilation during active slider input');
 }
 for(let now=3200;now<8000;now+=17)worker.draw(now);
 assert.equal(worker.r.budget.effectiveQuality,'ultra','Fresh headroom after release may still reach Ultra');
 assert(worker.r.activeProgram.features.ultra);
 host.r.dispose();worker.r.dispose();
}

// A range edit only changes uniforms/camera state: existing Ultra uses the
// optimized local pass. Manual Ultra keeps the user-selected budget.
{
 const s=setup(),{r,f}=s;r.setQuality('ultra');s.draw(1100);r.releaseFence();
 assert(r.activeProgram.features.ultra);const active=r.activeProgram,count=f.programs.length;
 const fragment=f.activeSources.find(x=>x.type===35632).source;
 const main=fragment.slice(fragment.lastIndexOf('void main(){'));
 assert(main.includes('warpLocalTrace')&&!main.includes('i<768'),'Ultra keeps the isolated warp specialization');
 for(let i=0;i<=100;i++){
  const now=1200+i*17;s.at(now);r.setFlightPower(i===100?9.9999:i/10);r.fillObjects();r.updateCameraFrame();s.draw(now);
  assert.equal(r.activeProgram,active);assert.equal(f.programs.length,count);assert.equal(r.warpWorkloadProbe,null,'Manual Ultra is not automatically probed');
  assert(Number.isFinite(r.camera.focusDistance)&&r.camera.focusDistance>0);
  assert(Number.isFinite(r.getFlightState().speedMetersPerSecond));
 }
 assert.deepEqual(s.errors,[]);r.dispose();
}

// The first powered frame does not inherit the full budget measured with the
// field switched off. The probe retains shader/ray detail, caps pixels, and
// only its matching completed frame can change the adaptive budget.
{
 const s=setup(),{r,f}=s;r.budget.level=3;s.draw(1100);r.releaseFence();
 const active=r.activeProgram,count=f.programs.length,high=r.budget.step;
 s.at(1200);r.setFlightPower(7);f.control.gpuComplete=false;s.draw(1200);
 const probe=r.warpWorkloadProbe,frame=r.gpuFence;assert(probe&&frame.workloadProbe===probe);
 assert(r.canvas.width*r.canvas.height<=32768,'Powered-warp test image has a bounded pixel cost');
 assert.equal(r.steps,768,'Probe preserves ray detail to measure the real shader');
 assert.equal(r.activeProgram,active);assert.equal(f.programs.length,count,'No shader compile for a power change');
 assert.equal(r.budget.step,high,'Submission alone is not a completed workload measurement');
 r.completeWarpWorkload({...frame,sceneGeneration:frame.sceneGeneration+1},1217,17);
 assert.equal(r.warpWorkloadProbe,probe);assert.equal(r.budget.step,high,'Stale scene measurement is ignored');
 r.completeWarpWorkload({...frame,workloadProbe:{}},1217,17);
 assert.equal(r.warpWorkloadProbe,probe,'Unrelated probe completion is ignored');
 f.control.gpuComplete=true;s.draw(1217);
 assert.equal(r.warpWorkloadProbe,null,'Matching completion releases the bounded probe');
 assert(r.budget.step<high,'Measured pixel work reduces an unaffordable budget');
 const completed=r.budget.step;r.completeWarpWorkload(frame,1300,100);
 assert.equal(r.budget.step,completed,'A probe is applied once');
 for(let i=0;i<40;i++){const now=1300+i*17;s.at(now);r.setFlightPower(i%2?5:0);s.draw(now);}
 assert(f.programs.length<=count+1,'Repeated zero crossings reuse shader variants after the measured quality change');
 r.dispose();
}
// Legacy WebGL without completion fences also finishes its bounded probe on
// the next callback, using a conservative frame-cost estimate.
{
 const s=setup({webgl2:false}),{r}=s;r.budget.level=2;s.draw(1100);
 s.at(1200);r.setFlightPower(5);s.draw(1200);const step=r.budget.step;
 assert(r.warpProbeDraw);assert(r.canvas.width*r.canvas.height<=32768);
 s.draw(1233);assert.equal(r.warpProbeDraw,null);assert(r.budget.step<step);r.dispose();
}

// Do not compile/activate another quality program while the last draw is
// unfinished. Fence polling can still lower the following frame's budget.
{
 const s=setup(),{r,f}=s;r.budget.level=2;f.control.gpuComplete=false;s.draw(2000);
 assert(r.gpuFence);const active=r.activeProgram,count=f.programs.length;
 r.budget.level=3;s.draw(2010);
 assert.equal(r.activeProgram,active);assert.equal(f.programs.length,count);
 const before=r.budget.step;s.draw(2100);const first=r.budget.step;
 assert(first<before);s.draw(2250);assert(r.budget.step<first);
 assert.equal(r.activeProgram,active);assert.equal(f.programs.length,count);
 assert.equal(f.calls.finish,0,'No blocking finish is used');
 f.control.gpuComplete=true;assert(s.draw(2300),'Rendering resumes once the old draw retires');
 r.dispose();
}

// Keyboard power commands use the same interaction gate as the slider.
{
 const s=setup();s.at(2000);s.r.setFlightInput({speed:1});
 assert(snapshotRenderer(s.r,{includeInteraction:true}).cameraInteracting);
 assert(s.r.budget.interactionUntil>2000);s.r.dispose();
}
console.log('PASS: warp slider/keyboard guards, worker propagation, post-input Ultra recovery, finite framing, shader reuse, and nonblocking GPU scheduling.');
