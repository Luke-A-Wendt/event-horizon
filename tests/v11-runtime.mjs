import assert from 'node:assert/strict';
import { SceneLoadLifecycle, renderSignature, snapshotRenderer, restoreRenderer } from '../dist/render-state.js';
import { RenderHost } from '../dist/render-host.js';
import { CpuCommandPlayer } from '../dist/cpu-commands.js';
import { fixture } from './render-fixture.mjs';

// Deadline is based on observable, completed work, excluding covered/hidden
// presentation. A frozen simulation is still supposed to produce a frame.
let now=0;
const load=new SceneLoadLifecycle({cpu:true,now:()=>now});
const first=load.revision;now=14000;assert.equal(load.check(),false);
now=64000;assert.equal(load.check(true),false,'A hidden tab does not spend its render deadline');
assert.equal(load.complete(first-1),false);assert.equal(load.state,'loading');
now=65001;assert.equal(load.check(),false,'Resuming excludes the hidden transition interval');now=66002;assert.equal(load.check(),true);assert.equal(load.state,'failed');
assert.equal(load.complete(first),false,'Late work cannot erase a visible failure');
load.begin();assert(load.complete(load.revision));now+=14000;assert.equal(load.check(),false);
assert(load.complete(load.revision));now+=15001;assert(load.check());assert.match(load.error,/stopped producing/);
const gpu=new SceneLoadLifecycle({now:()=>now});now+=29000;assert.equal(gpu.check(),false);now+=1001;assert(gpu.check());

// Validate the real presentation boundary with recording Canvas surfaces. An
// invalid frame never resizes or overwrites the last complete front canvas.
let blits=0;const jobs=[],front={width:2,height:2,getContext:()=>({drawImage(){blits++;}})};
const context=new Proxy({createRadialGradient(){return {addColorStop(){}};}},{get:(target,key)=>key in target?target[key]:(()=>{})});
const player=new CpuCommandPlayer(front,{createCanvas:()=>({width:2,height:2,getContext:()=>context}),now:()=>1,schedule:fn=>(jobs.push(fn),jobs.length),cancel(){}});
const paint=frame=>{let result;player.present(frame,value=>result=value);assert.equal(result,undefined,'Painting starts in a yielded task');while(jobs.length)jobs.shift()();return result;};
const black={width:16,height:9,gradients:[],commands:[['property','fillStyle','#000'],['fillRect',0,0,16,9]]};
assert(!paint(black).error);assert.equal(blits,1,'An intentionally black empty space is a valid image');
for(const bad of [
 {...black,width:0}, {...black,width:9000}, {...black,commands:[]},
 {...black,commands:[['clearRect',0,0,16,9]]},
 {...black,commands:[['fillRect',0,0,Infinity,9]]},
 {...black,commands:[['unknownMethod',1]]},
 {...black,commands:[['property','fillStyle',{gradient:9}],['fillRect',0,0,16,9]]},
 {...black,gradients:[{args:[0,0,0,0,0,NaN],stops:[]}]}]){
 assert(paint(bad).error);assert.equal(blits,1);assert.equal(front.width,16);assert.equal(front.height,9);
}
assert(!paint(black).error);assert.equal(blits,2,'A later valid frame can recover after rejected commands');player.dispose();

// The actual host rejects old completions and keeps backend capability separate
// from scene failure; no stale completion or worker event can select CPU mode.
const previousWorker=globalThis.Worker,workers=[];
globalThis.Worker=class{
 constructor(){workers.push(this);this.listeners=new Map();this.messages=[];}
 addEventListener(name,fn){this.listeners.set(name,fn);}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}
 emit(message){this.listeners.get('message')?.({data:message});}
};
const f=fixture(),decorate=canvas=>{
 canvas.transferControlToOffscreen=()=>({});canvas.cloneNode=()=>decorate({...canvas,listeners:new Map()});canvas.replaceWith=()=>{};return canvas;
};
let host=new RenderHost(decorate(f.canvas));let worker=workers.at(-1);worker.emit({type:'ready',available:true});await host.startup;
host.now=()=>now;
host.loadScene('disk');let signature=renderSignature(host),revision=host.getState().sceneLoadRevision;
worker.emit({type:'status',stats:{frameReady:true,renderedSignature:signature,sceneRevision:revision,fps:30}});
assert.equal(host.getState().sceneLoadState,'ready');
// Same-ID reset: no pre-reset state may be submitted under its new revision.
host.update({mass:44});host.requestSceneLoad();const preparing=host.getState().sceneLoadRevision;
const queued=worker.messages.length;host.queueSnapshot();host.frame(now+34);assert.equal(worker.messages.length,queued);
assert.equal(host.completedFrame(renderSignature(host),preparing),false);
worker.emit({type:'status',stats:{frameReady:true,renderedSignature:signature,sceneRevision:revision}});
assert.equal(host.getState().sceneLoadState,'loading');
host.loadScene('disk');assert.equal(host.getState().sceneLoadRevision,preparing);
assert.equal(host.getState().renderReady,false);
signature=renderSignature(host);worker.emit({type:'status',stats:{frameReady:true,renderedSignature:signature,sceneRevision:preparing}});
assert.equal(host.getState().sceneLoadState,'ready');
// Restoring a retry snapshot with many previous revisions gives the new host a
// fresh matching lifecycle; it never inherits a detached transport revision.
for(let i=0;i<5;i++)host.loadScene('disk');const saved=snapshotRenderer(host);assert(saved.sceneRevision>2);host.dispose();
host=new RenderHost(decorate(f.canvas));worker=workers.at(-1);restoreRenderer(host,saved);worker.emit({type:'ready',available:true});await host.startup;
assert.equal(host.sceneRevision,host.getState().sceneLoadRevision);
worker.emit({type:'status',stats:{frameReady:true,renderedSignature:renderSignature(host),sceneRevision:host.sceneRevision}});assert.equal(host.getState().sceneLoadState,'ready');
// A worker that sends telemetry but no new complete frames cannot hold the
// loading overlay forever. Explicit error UI gets a finite failure result.
host.now=()=>now;host.requestSceneLoad();host.loadScene('binary');now+=30001;host.checkSceneLoad();
assert.equal(host.getState().sceneLoadState,'failed');assert.equal(host.getState().renderBusy,false);assert(worker.terminated);assert(!host.cpu);
const failedWorker=worker;host.loadScene('disk');worker=workers.at(-1);assert.notEqual(worker,failedWorker);assert.equal(host.getState().sceneLoadState,'loading');
worker.emit({type:'ready',available:true});failedWorker.emit({type:'status',stats:{frameReady:true,renderedSignature:renderSignature(host),sceneRevision:host.sceneRevision}});assert.equal(host.getState().renderReady,false);
worker.emit({type:'status',stats:{frameReady:true,renderedSignature:renderSignature(host),sceneRevision:host.sceneRevision}});assert.equal(host.getState().sceneLoadState,'ready');
// A browser can stop timers entirely in background; visibility events still
// checkpoint the suspension before the first active monitor tick.
host.now=()=>now;document.hidden=true;document.emit('visibilitychange');now+=120000;document.hidden=false;document.emit('visibilitychange');host.checkSceneLoad();assert.equal(host.getState().sceneLoadState,'ready');host.dispose();
// Unavailable WebGL is an explicit backend choice, not a failed scene while
// the reader takes time to decide whether to continue with the CPU preview.
const unavailable=fixture();unavailable.canvas.getContext=()=>null;decorate(unavailable.canvas);
let rafs=[];globalThis.requestAnimationFrame=fn=>(rafs.push(fn),rafs.length);host=new RenderHost(unavailable.canvas);const checkUnavailable=host.checkSceneLoad;worker=workers.at(-1);worker.emit({type:'ready',available:false});
for(let i=0;i<3;i++){const batch=rafs;rafs=[];for(const callback of batch)callback(now+i*17);await Promise.resolve();}
assert.equal((await host.startup).available,false);assert.equal(host.getState().awaitingBackendChoice,true);host.now=()=>now;now+=120000;checkUnavailable();assert.notEqual(host.getState().sceneLoadState,'failed');assert.equal(host.getState().renderBusy,false);assert(!host.cpu);host.dispose();
if(previousWorker)globalThis.Worker=previousWorker;else delete globalThis.Worker;
console.log('PASS: bounded scene deadlines, suspended time, actual matching frame readiness, same-scene reset race, retry revision restoration, stale worker isolation, failed-scene recovery, and CPU atomic-frame protocol validation. No physical-phone performance claim.');
