import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {RenderHost} from '../dist/render-host.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {installRenderWorker} from '../dist/render-worker.js';
import {snapshotRenderer,restoreRenderer,renderSignature} from '../dist/render-state.js';

const source=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
source.loadScene('warp-lab');source.sceneRevision=3;const snapshot=snapshotRenderer(source),signature=renderSignature(source);source.dispose();
const wf=fixture({parallelCompile:true,compileComplete:false,gpuComplete:false}),messages=[];
const worker=installRenderWorker({postMessage:m=>messages.push(m),addEventListener(){},close(){}});
await worker.handle({type:'init',canvas:wf.canvas,viewport:{width:390,height:700,dpr:1},snapshot,signature});
worker.renderer.render(1000);assert.equal(messages.filter(m=>m.type==='render-phase').at(-1).phase,'compiling');
wf.control.compileComplete=true;worker.renderer.render(1100);assert.equal(messages.filter(m=>m.type==='render-phase').at(-1).phase,'drawing');
assert(!messages.some(m=>m.type==='status'&&m.stats.frameReady),'Submitted is not completed');
wf.control.gpuComplete=true;worker.renderer.render(1300);assert.equal(messages.filter(m=>m.type==='render-phase').at(-1).phase,'ready');
const stages=messages.filter(m=>m.type==='render-phase').length;
for(let i=0;i<10;i++)worker.renderer.render(1400+i*30);
assert.equal(messages.filter(m=>m.type==='render-phase').length,stages,'No phase messages on every steady-state frame');
await worker.handle({type:'dispose'});

const oldWorker=globalThis.Worker,workers=[];
globalThis.Worker=class{constructor(){workers.push(this);this.listeners=new Map();}addEventListener(k,fn){this.listeners.set(k,fn);}postMessage(){}terminate(){this.terminated=true;}emit(m){this.listeners.get('message')?.({data:m});}};
const f=fixture();f.canvas.transferControlToOffscreen=()=>({});const host=new RenderHost(f.canvas);let now=host.now();host.now=()=>now;
const remote=workers.at(-1);remote.emit({type:'ready',available:true});await host.startup;
host.loadScene('warp-lab');const previousTarget=renderSignature(host),revision=host.sceneRevision;
host.releaseFocus(false);const current=renderSignature(host);
assert.notEqual(current,previousTarget);assert.equal(host.completedFrame(previousTarget,revision),false,'Previous target frame cannot dismiss the new view loader');
remote.emit({type:'render-phase',phase:'compiling',signature:current,sceneRevision:revision});assert.equal(host.getDiagnostics().phase,'compiling');
remote.emit({type:'render-phase',phase:'ready',signature:current,sceneRevision:revision-1});assert.equal(host.getDiagnostics().phase,'compiling','Ignore stale scene stages');
assert.notEqual(host.sceneLoad.state,'ready','Stage telemetry never completes a scene');
now+=60001;host.checkSceneLoad();assert.equal(host.sceneLoad.state,'failed');assert.match(host.sceneLoad.error,/Graphics preparation did not finish/);
host.dispose();if(oldWorker)globalThis.Worker=oldWorker;else delete globalThis.Worker;

// An explicit replacement after a stalled load starts a fresh worker only
// after its new scene state is installed. Quick/cached choices keep the worker.
const stub={worker:{},sceneLoad:{state:'loading',elapsed:11000,begin(){this.state='loading';this.elapsed=0;return 2;}},noteInteraction(){},cancelCpuWork(){},onError(){},emitHostStats(){}};
RenderHost.prototype.requestSceneLoad.call(stub);assert(stub.restartForSceneLoad);
stub.sceneLoad.elapsed=0;RenderHost.prototype.requestSceneLoad.call(stub);assert.equal(stub.restartForSceneLoad,false,'A new quick load does not retain an old restart flag');

const sf=fixture(),restarted=[];sf.canvas.transferControlToOffscreen=()=>({});
const old=globalThis.Worker;globalThis.Worker=class{addEventListener(){}postMessage(){}terminate(){}};
const replacement=new RenderHost(sf.canvas);replacement.restartRendering=()=>{restarted.push(replacement.sceneId);replacement.gpuUnavailable=false;};
replacement.workerReady=true;replacement.sceneLoad.state='loading';replacement.sceneLoad.elapsed=11000;replacement.loadScene('disk');assert.deepEqual(restarted,['disk']);
replacement.loadScene('warp-lab');assert.equal(restarted.length,1,'Fast transitions preserve cached programs');replacement.dispose();if(old)globalThis.Worker=old;else delete globalThis.Worker;

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});r.loadScene('solar-system-natural');
const id=r.objects.find(o=>o.name==='Sun').id,oldSignature=renderSignature(r);r.budget.level=2;
restoreRenderer(r,{focusId:id});assert.equal(r.budget.level,0);assert.notEqual(renderSignature(r),oldSignature,'A target change rejects old target frames');
r.budget.level=1;restoreRenderer(r,{focusId:id,camera:{...r.camera,yaw:.2}});assert.equal(r.budget.level,1,'A camera move does not repeatedly reset quality');r.dispose();
fixture();const cc=new CpuCommandCanvas();cc.getBoundingClientRect=()=>({width:390,height:700});
const cpu=new CpuRenderer(cc,{autoStart:false,bindControls:false});cpu.loadScene('solar-system-natural');assert.equal(cpu.cpuBudget.relief,2);
const sun=cpu.objects.find(o=>o.name==='Sun').id;cpu.cpuBudget.relief=0;restoreRenderer(cpu,{focusId:sun});assert.equal(cpu.cpuBudget.relief,2,'CPU target change uses its minimum preview');
cpu.setQuality('high');cpu.loadScene('bridge');assert.equal(cpu.cpuBudget.mode,'high','Explicit manual CPU choice is retained');assert.equal(cpu.cpuBudget.level,'low');cpu.noteCpuCost(10,1000,'frame');assert.equal(cpu.cpuBudget.level,'high');cpu.dispose();
console.log('PASS: real compile/draw/completion stages, bounded steady-state telemetry, stale-stage isolation, phase-specific timeout, and target-change budget/readiness reset.');
