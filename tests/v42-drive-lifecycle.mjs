import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {RenderHost} from '../dist/render-host.js';
import {installRenderWorker} from '../dist/render-worker.js';
import {snapshotRenderer,renderSignature} from '../dist/render-state.js';

// Replay the reported sequence through the real worker protocol. Delayed GPU
// completion is deliberate; a submitted/old frame cannot ready the Drive view.
const source=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
source.sceneRevision=1;source.loadScene('warp-lab');
const recorded=fixture({width:390,height:700,gpuComplete:false}),messages=[];
const worker=installRenderWorker({postMessage:m=>messages.push(m),addEventListener(){},close(){}});
await worker.handle({type:'init',canvas:recorded.canvas,viewport:{width:390,height:700,dpr:1},snapshot:snapshotRenderer(source),signature:renderSignature(source),presentationPaused:false});
let serial=0,now=1000;
const send=async({paused=false,resize=false}={})=>{
 await worker.handle({type:'state',serial:++serial,snapshot:snapshotRenderer(source),signature:renderSignature(source),presentationPaused:paused,...(resize?{viewport:{width:700,height:390,dpr:2}}:{})});
 assert.equal(messages.at(-1).type,'ack');
};
const draw=()=>{recorded.control.now=now+=100;worker.renderer.now=()=>now;return worker.renderer.render(now);};
const ready=signature=>messages.some(m=>m.type==='status'&&m.stats.frameReady&&m.stats.renderedSignature===signature||m.type==='annotation-frame'&&m.signature===signature);
draw();recorded.control.gpuComplete=true;draw();assert(ready(renderSignature(source)));
for(let cycle=0;cycle<3;cycle++){
 const prior=renderSignature(source),ship=source.objects.find(o=>o.type==='enterprise');
 worker.renderer.budget.level=2;worker.renderer.budget.safety=0;
 recorded.control.gpuComplete=false;
 source.setFreeDrive(ship.id,true);source.focusTarget(ship.id,'track',false,true);
 const driving=renderSignature(source);assert.notEqual(driving,prior,'Drive owns a new readiness signature, even for the same tracked ship');
 const priorSize=[recorded.canvas.width,recorded.canvas.height];
 await send({resize:true});assert.equal(worker.renderer.budget.level,0);assert(worker.renderer.budget.pixelScale<=.5);
 assert.deepEqual([recorded.canvas.width,recorded.canvas.height],priorSize,'Snapshot ACK does not allocate a resized old-quality buffer');
 const before=recorded.draws;draw();assert.equal(recorded.draws,before,'A slow previous fence never permits a queued heavy draw');assert(!ready(driving));
 recorded.control.gpuComplete=true;draw();draw();assert(ready(driving));
 worker.renderer.budget.level=1;await send();assert.equal(worker.renderer.budget.level,1,'Driving snapshots preserve learned quality');
 await send({paused:true});assert.equal(draw(),false,'A covered scene submits no GPU work');
 await send();draw();
 source.sceneRevision++;source.loadScene('warp-lab');
 await send();assert.equal(worker.renderer.budget.level,0,'Selecting the same warp scene restarts at the quality floor');draw();draw();assert(ready(renderSignature(source)));
}
assert(!messages.some(m=>(m.type==='error'||m.type==='render-error')&&m.message));
await worker.handle({type:'dispose'});source.dispose();

// A label/CPU presentation can still be awaiting its UI acknowledgement when
// Drive or reselection arrives. Cancel its original serial and continue with
// the latest snapshot, rather than retaining a permanent back-pressure lock.
for(const cpu of [false,true]){
 const template=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});template.sceneRevision=1;template.loadScene('warp-lab');template.state.annotations=!cpu;
 const wf=fixture({width:390,height:700}),out=[];
 if(!cpu)wf.canvas.transferToImageBitmap=()=>({width:wf.canvas.width,height:wf.canvas.height,close(){}});
 const thread=installRenderWorker({postMessage:m=>out.push(m),addEventListener(){},close(){}});
 await thread.handle({type:'init',cpu,commandMode:cpu,canvas:cpu?null:wf.canvas,viewport:{width:390,height:700,dpr:1},snapshot:snapshotRenderer(template),signature:renderSignature(template)});
 thread.renderer.render(1000);
 const type=cpu?'cpu-frame':'bitmap-frame',ack=cpu?'cpu-presented':'bitmap-presented',pending=out.find(m=>m.type===type);assert(pending);
 const ship=template.objects.find(o=>o.type==='enterprise');template.setFreeDrive(ship.id,true);
 await thread.handle({type:'state',serial:1,snapshot:snapshotRenderer(template),signature:renderSignature(template),presentationPaused:true});
 await thread.handle({type:ack,serial:pending.serial,cancelled:true});
 assert.equal(thread.renderer.render(1100),false);
 await thread.handle({type:'state',serial:2,snapshot:snapshotRenderer(template),signature:renderSignature(template),presentationPaused:false});
 thread.renderer.render(1200);
 const fresh=out.filter(m=>m.type===type).at(-1);assert(fresh.serial>pending.serial);assert.equal(fresh.signature,renderSignature(template));
 await thread.handle({type:ack,serial:fresh.serial,cancelled:false,costMs:2});
 assert(out.some(m=>m.type==='status'&&m.stats.frameReady&&m.stats.renderedSignature===fresh.signature));
 await thread.handle({type:'dispose'});template.dispose();
}

// A Drive stall happens after scene readiness. Explicit reselection must not
// remain in a mailbox behind that stalled worker for another full deadline.
const previousWorker=globalThis.Worker,workers=[];
globalThis.Worker=class{constructor(){workers.push(this);}addEventListener(){}postMessage(){}terminate(){this.terminated=true;}};
const f=fixture();f.canvas.transferControlToOffscreen=()=>({});
const host=new RenderHost(f.canvas);let clock=1000;host.now=()=>clock;host.sceneLoad.lastCheck=clock;host.workerReady=true;
host.loadScene('warp-lab');host.completedFrame(renderSignature(host),host.sceneRevision);
const oldSignature=renderSignature(host),ship=host.objects.find(o=>o.type==='enterprise');host.setFreeDrive(ship.id,true);
assert.notEqual(renderSignature(host),oldSignature);assert.equal(host.completedFrame(oldSignature,host.sceneRevision),false);
clock+=11000;host.checkSceneLoad();assert.equal(host.sceneLoad.state,'ready');assert.equal(host.getState().renderBusy,true);
const restarts=[];host.restartRendering=()=>restarts.push(host.sceneId);
host.loadScene('warp-lab');assert.deepEqual(restarts,['warp-lab'],'Install new scene before replacing the stale ready worker');
host.loadScene('warp-lab');assert.equal(restarts.length,1,'Fast repeated selections retain the healthy cache');
host.sceneLoad.elapsed=11000;host.prepareMutation('Selecting another object');host.finishMutation();assert.equal(restarts.length,2,'Object-view mutations recover the same stalled worker');
host.dispose();if(previousWorker)globalThis.Worker=previousWorker;else delete globalThis.Worker;
console.log('PASS: repeated warp → Drive → warp with slow fences, resize, pause, stale-frame rejection, quality-floor reset, and recovery from a stalled ready worker.');
