import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker as ThreadWorker} from 'node:worker_threads';
import {fixture} from './render-fixture.mjs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {RenderHost} from '../dist/render-host.js';
import {installPilotControls} from '../dist/pilot-ui.js';

// Exercise real pilot input -> RenderHost -> serialized worker state -> the
// actual renderer's submitted uniforms / completed CPU geometry. Only browser
// surfaces and native GL calls are recording doubles; this is not device QA.
const workerCode=String.raw`
const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
 const [{fixture},{installRenderWorker},{CpuCommandCanvas}]=await Promise.all([
  import(workerData.fixture),import(workerData.worker),import(workerData.cpu)]);
 const f=fixture(workerData.viewport);let controller,cpuCanvas=null,completed=0;
 const scope={postMessage(message){if(message.type==='status'&&message.stats.frameReady)completed++;parentPort.postMessage(message);},close(){parentPort.close();},addEventListener(_,handler){parentPort.on('message',data=>{
  if(data.type==='init')data.canvas=data.cpu?(cpuCanvas=new CpuCommandCanvas()):f.canvas;
  if(data.type==='test:frame'){
   const r=controller.renderer,completedBefore=completed;if(cpuCanvas)cpuCanvas.beginFrame();
   f.step(r,data.now);f.step(r,data.now+100);r.gpuAvailable?.(data.now+101);
   parentPort.postMessage({type:'test:frame',id:data.id,draws:f.draws,completed,completedBefore,
    commands:cpuCanvas?.takeFrame().commands?.length||0,camera:r.camera,frame:r.cameraFrame,
    warp:r.state.warpFactor,guide:r.cameraGuide,uniforms:Object.fromEntries(f.uniforms)});return;
  }
  handler({data});
 });}};
 controller=installRenderWorker(scope);
})().catch(error=>{throw error;});`;
let activeWorker,workerViewport;
class BrowserWorker{
 constructor(){
  activeWorker=this;this.listeners=new Map();this.pending=new Map();this.nextId=0;
  this.thread=new ThreadWorker(workerCode,{eval:true,workerData:{
   viewport:workerViewport,fixture:new URL('./render-fixture.mjs',import.meta.url).href,
   worker:new URL('../dist/render-worker.js',import.meta.url).href,
   cpu:new URL('../dist/cpu-commands.js',import.meta.url).href}});
  this.thread.on('message',data=>{if(data.type==='test:frame'){const p=this.pending.get(data.id);this.pending.delete(data.id);clearTimeout(p?.timer);p?.resolve(data);}else this.listeners.get('message')?.({data});});
  this.thread.on('error',error=>{this.listeners.get('error')?.({message:error.message});for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}});
 }
 addEventListener(name,fn){this.listeners.set(name,fn);}
 postMessage(message){this.thread.postMessage(message.type==='init'?{...message,canvas:null}:message);}
 frame(now){return new Promise((resolve,reject)=>{const id=++this.nextId,timer=setTimeout(()=>reject(Error('Real rendering worker timed out')),5000);this.pending.set(id,{resolve,reject,timer});this.thread.postMessage({type:'test:frame',id,now});});}
 terminate(){void this.thread.terminate();for(const p of this.pending.values())clearTimeout(p.timer);}
}
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
async function settled(host,worker,clock){
 for(let n=0;n<150;n++){clock.value+=1000/60;host.frame(clock.value);}
 for(let n=0;host.mailbox?.inflight&&n<1000;n++)await tick();
 assert(!host.mailbox?.inflight,'Latest UI state reaches worker before checking the draw');
 const drawn=await worker.frame(clock.value+200);assert(drawn.completed>drawn.completedBefore,'This updated frame completes rather than retaining an old image');return drawn;
}
const near=(a,b,message)=>assert(Math.abs(a-b)<=Math.max(1e-10,Math.abs(b)*1e-7),message+`: ${a} vs ${b}`);
for(const cpu of [false,true])for(const [width,height] of [[1440,806],[360,520]]){
 const f=fixture({width,height}),document=uiDomFixture(html);globalThis.document=document;globalThis.window=document.createElement('window');window.innerWidth=width;window.innerHeight=height;window.devicePixelRatio=1;
 workerViewport={width,height};globalThis.Worker=BrowserWorker;f.canvas.transferControlToOffscreen=()=>({});
 const clock={value:1000},errors=[],host=new RenderHost(f.canvas,{onError:e=>{if(e)errors.push(e);}},{cpu});host.now=()=>clock.value;
 const worker=activeWorker;assert((await host.startup).available);
 const pilot=installPilotControls({mount:document.getElementById('pilotControls'),renderer:()=>host,state:()=>host.state,setPaused:paused=>host.update({paused}),refresh(){}});
 try{
  host.loadScene('warp-cruise');const ship=host.objects.find(o=>o.type==='enterprise');assert(pilot.start(ship.id));
  for(const paused of [false,true]){
   host.update({paused});const distances=[];
   for(const factor of [4,9,1,0]){
    const slider=document.getElementById('pilotPower');slider.value=factor;slider.dispatch('input');
    const drawn=await settled(host,worker,clock);assert.equal(drawn.warp,factor);assert(drawn.completed>0,'The worker reports a completed frame');
    const actual=cpu?Math.hypot(...drawn.frame.inspectCamera):Math.hypot(...drawn.uniforms.uInspectCamera.args[0]);
    near(actual,host.camera.focusDistance,'The frame uses the camera from the current UI state');
    if(cpu)assert(drawn.commands>0,'CPU fallback produces painted geometry');else assert(drawn.draws>0,'GPU renderer submits the updated scene');
    distances.push(actual);
   }
   assert(distances[1]>distances[0],'Warp 9 moves the camera out');assert(distances[2]<distances[0],'Warp 1 moves the camera back in');assert(distances[3]<distances[2],'Warp 0 tightly frames the hull');
  }
  // The object-properties slider uses renderer.update({warpFactor}). Exercise
  // the same host entry point on every default warp scene, without Drive.
  for(const sceneId of ['warp-lab','warp-cruise','warp-orbit','warp-excursion']){
   host.loadScene(sceneId);pilot.update();host.update({paused:true});const distances=[];
   for(const factor of [4,9,1,0]){
    host.update({warpFactor:factor});const drawn=await settled(host,worker,clock);
    near(drawn.warp,factor,'Property change reaches the rendering worker');
    distances.push(Math.hypot(...(cpu?drawn.frame.inspectCamera:drawn.uniforms.uInspectCamera.args[0])));
   }
   assert(distances[1]>distances[0]&&distances[2]<distances[0]&&distances[3]<distances[2],sceneId+' properties zoom in both directions');
  }
  host.loadScene('warp-lab');assert(pilot.start(host.objects.find(o=>o.type==='enterprise').id));host.update({paused:true});
  const input=value=>{const slider=document.getElementById('pilotPower');slider.value=value;slider.dispatch('input');};
  input(9);const high=await settled(host,worker,clock);host.look('tangent');input(0);
  const afterPan=await settled(host,worker,clock);
  const distanceOf=drawn=>Math.hypot(...(cpu?drawn.frame.inspectCamera:drawn.uniforms.uInspectCamera.args[0]));
  assert(distanceOf(afterPan)<distanceOf(high)*.4,'Warp 0 restores a close hull view after panning away');near(afterPan.camera.lookYaw,0,'An impossible pan recenters when adjusting the field');
  input(9);await settled(host,worker,clock);host.rotate(.25,.1);host.zoom(1.3);host.update({paused:false});
  document.getElementById('pilotBrakeSpeed').click();let braking;
  for(let i=0;i<4;i++)braking=await settled(host,worker,clock);
  near(braking.warp,0,'Stop motion eventually reaches zero warp');assert(distanceOf(braking)<distanceOf(high)*.4,'Stop motion keeps framing linked after camera manipulation');assert.equal(braking.guide,'warp-side');
  assert.deepEqual(errors,[]);
 }finally{pilot.dispose();host.dispose();}
}


for(const [width,height]of [[1440,806],[360,520]]){
 const f=fixture({width,height}),document=uiDomFixture(html);globalThis.document=document;globalThis.window=document.createElement('window');window.innerWidth=width;window.innerHeight=height;window.devicePixelRatio=1;globalThis.Worker=undefined;
 let scheduled=[];globalThis.requestAnimationFrame=fn=>{scheduled.push(fn);return scheduled.length;};
 const errors=[],host=new RenderHost(f.canvas,{onError:e=>{if(e)errors.push(e);}});
 for(let n=0;n<3;n++){const batch=scheduled;scheduled=[];batch.forEach(fn=>fn(n*16));await Promise.resolve();}
 assert.equal((await host.startup).worker,false);assert.equal(host.getDiagnostics().backend,'main-gpu','Direct fallback instantiates its actual renderer');globalThis.requestAnimationFrame=()=>1;
 const pilot=installPilotControls({mount:document.getElementById('pilotControls'),renderer:()=>host,state:()=>host.state,setPaused:paused=>host.update({paused}),refresh(){}});let clock=1000;
 const draw=()=>{for(let i=0;i<150;i++){clock+=1000/60;f.step(host,clock);}return Math.hypot(...f.uniforms.get('uInspectCamera').args[0]);};
 try{
  host.loadScene('warp-lab');assert(pilot.start(host.objects.find(o=>o.type==='enterprise').id));
  for(const paused of [false,true]){
   host.update({paused});const distances=[];
   for(const factor of [4,9,1,0]){const slider=document.getElementById('pilotPower');slider.value=factor;slider.dispatch('input');distances.push(draw());near(host.state.warpFactor,factor,'Direct fallback receives pilot power');}
   assert(distances[1]>distances[0]&&distances[2]<distances[0]&&distances[3]<distances[2],'Direct fallback zooms in both directions');
  }
  assert.deepEqual(errors,[]);assert(f.draws>0);
 }finally{pilot.dispose();host.dispose();}
}
console.log('PASS: Actual pilot slider events reach real threaded GPU/CPU renderer frames, zooming out and back in at desktop/mobile sizes while playing and paused; all default Warp scenes, recovery after panning, Stop motion, and direct GPU fallback. Recording surfaces do not emulate browser layout or native GPU execution.');
