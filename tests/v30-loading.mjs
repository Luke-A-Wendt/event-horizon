import assert from 'node:assert/strict';
import {RenderHost} from '../dist/render-host.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installRenderWorker} from '../dist/render-worker.js';
import {snapshotRenderer,renderSignature} from '../dist/render-state.js';
import {fixture} from './render-fixture.mjs';

// A gallery kept open longer than a render watchdog does not count as a stall.
const oldWorker=globalThis.Worker,workers=[];
globalThis.Worker=class{
 constructor(){workers.push(this);this.messages=[];this.listeners=new Map();}
 addEventListener(name,fn){this.listeners.set(name,fn);}postMessage(m){this.messages.push(m);}terminate(){this.terminated=true;}
 emit(m){this.listeners.get('message')?.({data:m});}
};
const f=fixture();f.canvas.transferControlToOffscreen=()=>({});
const host=new RenderHost(f.canvas);let now=1000;host.now=()=>now;
const worker=workers.at(-1);worker.emit({type:'ready',available:true});await host.startup;
const complete=()=>worker.emit({type:'status',stats:{frameReady:true,renderedSignature:renderSignature(host),sceneRevision:host.sceneRevision}});
complete();
for(const suspendedBy of ['gallery','hidden tab']){
 if(suspendedBy==='gallery')host.setPresentationPaused(true);else{document.hidden=true;document.emit('visibilitychange');}
 now+=120000;host.checkSceneLoad();
 if(suspendedBy==='gallery')host.setPresentationPaused(false);else{document.hidden=false;document.emit('visibilitychange');}
 host.frame(now+17);host.checkSceneLoad();
 assert(!worker.terminated,`${suspendedBy}: a healthy sleeping worker survives the first resumed frame`);
 assert.notEqual(host.sceneLoad.state,'failed');complete();
}
// A genuinely stuck worker still has a bounded completed-frame deadline.
now+=30001;host.checkSceneLoad();assert.equal(host.sceneLoad.state,'failed');assert(worker.terminated);
host.dispose();if(oldWorker)globalThis.Worker=oldWorker;else delete globalThis.Worker;

// Worker startup can restore the chosen scene before its first shader compile.
const source=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});source.loadScene('bridge');const snapshot=snapshotRenderer(source);source.dispose();
const wf=fixture(),messages=[];
const ctl=installRenderWorker({postMessage:m=>messages.push(m),addEventListener(){},close(){}});
await ctl.handle({type:'init',canvas:wf.canvas,viewport:{width:640,height:400,dpr:1},snapshot,signature:'bridge'});
assert(messages.some(m=>m.type==='ready'&&m.available));assert.equal(wf.sources.length,0,'No default-disc shader is compiled before the restored scene');
ctl.renderer.render(100);assert.equal(wf.programs.length,1);assert(ctl.renderer.activeProgram.features.bridge);await ctl.handle({type:'dispose'});

// A cancelled scene's asynchronous compiler error cannot fail its successor.
const sf=fixture({parallelCompile:true,compileComplete:false}),errors=[];
const r=new BlackHoleRenderer(sf.canvas,{autoStart:false,bindControls:false,onError:m=>{if(m)errors.push(m);}});
r.loadScene('bridge');sf.control.linkSuccess=false;sf.control.compileComplete=true;r.pollProgram();assert.equal(errors.length,0);assert.equal(r.failedPrograms.size,0);
sf.control.linkSuccess=true;r.render(100);r.pollProgram();assert(r.activeProgram.features.bridge);assert.equal(errors.length,0);r.dispose();
console.log('PASS: gallery/tab resume survives, real stalls still fail, worker compiles only restored scene, abandoned compile errors are isolated.');
