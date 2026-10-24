import assert from 'node:assert/strict';
import { Worker as ThreadWorker } from 'node:worker_threads';
import { CpuCommandCanvas,CpuCommandPlayer } from '../dist/cpu-commands.js';
import { CpuRenderer } from '../dist/cpu-renderer.js';
import { RenderHost } from '../dist/render-host.js';
import { makePreset } from '../dist/config.js';
import { fixture } from './render-fixture.mjs';

// Projection is the real CPU renderer on a real second JS thread. No
// OffscreenCanvas or browser canvas implementation is supplied to that worker.
const code=String.raw`
const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
 const {installRenderWorker}=await import(workerData.url);
 installRenderWorker({postMessage:m=>parentPort.postMessage(m),addEventListener(_,fn){parentPort.on('message',data=>fn({data}));},close(){parentPort.close();}});
 parentPort.postMessage({type:'installed'});
})().catch(e=>{throw e;});`;
const thread=new ThreadWorker(code,{eval:true,workerData:{url:new URL('../dist/render-worker.js',import.meta.url).href}}),messages=[],waiters=[];
thread.on('message',m=>{messages.push(m);for(const w of [...waiters])if(w.test(m)){waiters.splice(waiters.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}});
const wait=(test,after=0)=>{const found=messages.slice(after).find(test);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const w={test,resolve,timer:setTimeout(()=>reject(Error('CPU worker timed out')),4000)};waiters.push(w);});};
await wait(m=>m.type==='installed');
const state={...makePreset('binary'),grid:true,nebula:true,starDensity:3,jets:true,paused:true};
thread.postMessage({type:'init',commandMode:true,cpu:true,viewport:{width:1200,height:900,dpr:3},snapshot:{state,sceneId:'binary',quality:'cpu'},signature:'binary'});
assert((await wait(m=>m.type==='ready')).available);
const first=await wait(m=>m.type==='cpu-frame');assert(first.frame.width<=640&&first.frame.height<=420);assert(first.frame.commands.length>1000&&first.frame.commands.length<20000);assert(first.frame.gradients.length>0);
assert(first.frame.commands.some(c=>c[0]==='arc'),'Actual holes reached the worker command stream');
await new Promise(resolve=>setTimeout(resolve,85));assert.equal(messages.filter(m=>m.type==='cpu-frame').length,1,'Only one CPU frame may wait for presentation');
assert(!messages.some(m=>m.type==='status'&&m.stats.frameReady),'Loading waits for presentation, not command generation');
thread.postMessage({type:'state',serial:2,presentationPaused:false,snapshot:{state:{...state,spin:.9},quality:'cpu'},signature:'changed'});await wait(m=>m.type==='ack'&&m.serial===2);
thread.postMessage({type:'cpu-presented',serial:first.serial,costMs:60});const complete=await wait(m=>m.type==='status'&&m.stats.frameReady);assert.equal(complete.stats.renderedSignature,'binary');
const second=await wait(m=>m.type==='cpu-frame'&&m.serial!==first.serial);assert.equal(second.signature,'changed');
thread.postMessage({type:'dispose'});await new Promise(resolve=>thread.once('exit',resolve));

// The presenter yields between bounded batches and never exposes a partial
// image. Recording contexts validate command execution, not browser paint cost.
let operations=0,blits=0,clock=1;const tasks=[];
const ctx=new Proxy({createRadialGradient(){return {addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:(()=>operations++)});
const canvas={width:2,height:2,getContext:()=>({drawImage(){blits++;}}),toBlob:fn=>fn(new Blob(['cpu']))};
const player=new CpuCommandPlayer(canvas,{createCanvas:()=>({width:2,height:2,getContext:()=>ctx}),now:()=>clock+=.025,schedule:fn=>(tasks.push(fn),tasks.length),cancel(){}});
let done=false;player.present(first.frame,()=>done=true);assert(operations<=1&&blits===0,'Message arrival may reset the transform but must not paint synchronously');
let rounds=0;while(tasks.length){const before=operations;tasks.shift()();assert(operations-before<=192);rounds++;if(tasks.length)assert.equal(blits,0,'The front canvas keeps its last complete image');}
assert(rounds>5&&done&&blits===1);assert((await player.capture()) instanceof Blob);
let cancelled;player.present(first.frame,result=>cancelled=result.cancelled);tasks.shift()();player.cancelFrame();while(tasks.length)tasks.shift()();assert(cancelled&&blits===1,'Cancelling a stale frame leaves the complete front buffer untouched');player.dispose();
const failures=[],failureTasks=[],badContext={setTransform(){},beginPath(){throw Error('Injected Canvas failure');}};
const failed=new CpuCommandPlayer(canvas,{createCanvas:()=>({getContext:()=>badContext}),schedule:fn=>(failureTasks.push(fn),1),cancel(){}});
failed.present({width:2,height:2,gradients:[],commands:[['beginPath']]},result=>failures.push(result.error));const failedCapture=failed.capture();const settled=assert.rejects(failedCapture,/Injected Canvas failure/);failureTasks.shift()();await settled;assert.equal(failed.busy,false);assert.equal(failures.length,1);failed.dispose();

// A browser lacking Workers uses the same generator in short tasks. Every grid
// row/disc ring is a yield point; state remains detached from the UI controller.
const f=fixture({width:900,height:600}),surface=new CpuCommandCanvas();surface.getBoundingClientRect=f.canvas.getBoundingClientRect;
const cpu=new CpuRenderer(surface,{bindControls:false,autoStart:false});cpu.update(state);surface.beginFrame();const stages=cpu.renderStages(100,false,true);let count=0,step;do{step=stages.next();count++;}while(!step.done);assert(step.value&&count>90);assert(surface.takeFrame().commands.length<20000);cpu.dispose();

// Host selects command-worker mode without calling transferControlToOffscreen.
const priorWorker=globalThis.Worker,priorCreate=document.createElement;let created;
globalThis.Worker=class{constructor(){created=this;this.messages=[];this.listeners=new Map();}addEventListener(n,f){this.listeners.set(n,f);}postMessage(m){this.messages.push(m);}terminate(){}emit(m){this.listeners.get('message')({data:m});}};
const h=fixture(),paintContext=new Proxy({createRadialGradient(){return {addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:(()=>{})});
h.canvas.getContext=kind=>kind==='2d'?paintContext:null;document.createElement=()=>({width:2,height:2,getContext:()=>paintContext});
const host=new RenderHost(h.canvas,{}, {cpu:true});assert.equal(created.messages[0].commandMode,true);assert.equal(created.messages[0].canvas,null);created.emit({type:'ready',available:true});assert((await host.startup).worker);assert.equal(host.getState().cpuBackend,'worker-commands');host.dispose();
// No Worker at all still gets a working cooperative fallback, not an empty
// canvas or a synchronous full-frame paint on the UI event handler.
delete globalThis.Worker;let rafs=[];globalThis.requestAnimationFrame=fn=>(rafs.push(fn),rafs.length);globalThis.cancelAnimationFrame=()=>{};
const local=new RenderHost(h.canvas,{}, {cpu:true});
for(let i=0;i<3;i++){const batch=rafs;rafs=[];for(const fn of batch)fn(100+i*17);await Promise.resolve();}
assert.equal((await local.startup).available,true);assert.equal(local.getState().cpuBackend,'cooperative-main');local.update({grid:true,nebula:true});local.frame(performance.now());
let localTicks=0;const timer=setInterval(()=>localTicks++,1),deadline=performance.now()+1000;
while(!local.frameSeen&&performance.now()<deadline){local.frame(performance.now());await new Promise(resolve=>setTimeout(resolve,5));}clearInterval(timer);
assert(local.frameSeen&&localTicks>0,'A complete cooperative frame appears while timers keep running');assert.equal(local.commandPlayer.busy,false);local.dispose();
if(priorWorker)globalThis.Worker=priorWorker;else delete globalThis.Worker;if(priorCreate)document.createElement=priorCreate;else delete document.createElement;
console.log('PASS: actual CPU projection in a worker without OffscreenCanvas, one-frame backpressure, presentation-based readiness, bounded Canvas batches, complete-frame swaps, cooperative geometry stages, and backend selection. No physical-phone benchmark.');
