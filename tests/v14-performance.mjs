import assert from 'node:assert/strict';
import {RenderHost} from '../dist/render-host.js';
import {installRenderWorker} from '../dist/render-worker.js';
import {snapshotRenderer,renderSignature} from '../dist/render-state.js';
import {fixture} from './render-fixture.mjs';

const previousWorker=globalThis.Worker,workers=[];
globalThis.Worker=class{
 constructor(){this.listeners=new Map();this.messages=[];workers.push(this);}
 addEventListener(name,fn){this.listeners.set(name,fn);}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}
 emit(message){this.listeners.get('message')?.({data:message});}
};
const f=fixture(),frames=[];f.canvas.transferControlToOffscreen=()=>({});let clock=1000;
const host=new RenderHost(f.canvas,{onFrame:frame=>frames.push(frame)});host.now=()=>clock;
const worker=workers.at(-1);worker.emit({type:'ready',available:true});await host.startup;
const ack=()=>{for(const m of worker.messages.filter(m=>m.type==='state'))worker.emit({type:'ack',serial:m.serial});};
const complete=()=>worker.emit({type:'status',stats:{frameReady:true,renderedSignature:renderSignature(host),sceneRevision:host.sceneRevision,fps:60}});
host.loadScene('bridge');ack();complete();assert(host.state.bridge);assert(!host.getState().renderBusy);
// A long pause must leave ordinary bridge gestures connected to its worker.
clock+=10000;complete();host.frame(clock);ack();
const oldLook=[host.target.yaw,host.target.pitch,host.target.lookYaw,host.target.lookPitch];
f.canvas.emit('pointerdown',{pointerType:'mouse',button:0,pointerId:1,clientX:100,clientY:100});
f.canvas.emit('pointermove',{pointerId:1,clientX:180,clientY:120});
f.canvas.emit('pointerup',{pointerId:1});
clock+=20;host.frame(clock);ack();assert.notDeepEqual([host.target.yaw,host.target.pitch,host.target.lookYaw,host.target.lookPitch],oldLook,'A bridge chase camera still accepts look gestures');
assert.equal(worker.messages.filter(m=>m.type==='state').at(-1).snapshot.target.yaw,host.target.yaw);
assert(!worker.messages.some(m=>m.type==='photo'),'Only explicit Picture studio may render a still');

// Applying a validated file owns a fresh transport revision, always starts
// paused, and cannot switch the chosen backend by carrying a saved quality.
const saved=snapshotRenderer(host);saved.sceneRevision=900;saved.state.paused=false;saved.quality='cpu';
const revision=host.requestSceneLoad();host.loadSnapshot(saved);ack();
assert.equal(host.sceneRevision,revision);assert.equal(host.state.paused,true);assert.equal(host.quality,'adaptive');
assert(!host.getState().renderReady);worker.emit({type:'status',stats:{frameReady:true,renderedSignature:renderSignature(host),sceneRevision:900}});assert(!host.getState().renderReady);
complete();assert(!host.getState().renderBusy);assert.equal(host.state.bridge,true);

// Annotation geometry is delivered for each presented frame, independently
// of throttled status updates, with scene-revision and signature rejection.
host.update({annotations:true});const signature=renderSignature(host),validRevision=host.sceneRevision;
for(let i=0;i<12;i++)worker.emit({type:'annotation-frame',signature,sceneRevision:validRevision,frame:{kind:'annotation-frame',annotations:true,time:i,cameraFrame:{observer:[i,0,0]}}});
assert.equal(frames.length,12);assert.equal(frames.at(-1).time,11);
worker.emit({type:'annotation-frame',signature:'old',sceneRevision:validRevision,frame:{time:12}});
worker.emit({type:'annotation-frame',signature,sceneRevision:validRevision-1,frame:{time:13}});assert.equal(frames.length,12);
host.update({annotations:false});worker.emit({type:'annotation-frame',signature,sceneRevision:validRevision,frame:{kind:'annotation-frame',annotations:false,time:14}});assert.equal(frames.length,13,'Labels-off frame still supplies picking coordinates');
host.update({metrics:true});assert.equal(host.state.metrics,false,'Removed metrics cannot be enabled');

// Dragging the expanded Solar System must not repeatedly deep-clone its whole
// catalog. A body edit still sends an atomic replacement on the next update.
host.loadScene('solar-system');ack();complete();
const full=worker.messages.filter(m=>m.type==='state'&&m.snapshot.objects?.length===517).at(-1);assert(full);
let mark=worker.messages.length;
host.rotate(.3,.1);clock+=20;host.frame(clock);ack();
const sparse=worker.messages.slice(mark).filter(m=>m.type==='state').at(-1);assert(sparse);assert(!Object.hasOwn(sparse.snapshot,'objects'));
assert(JSON.stringify(full.snapshot).length>JSON.stringify(sparse.snapshot).length*30);
const earth=host.objects.find(o=>o.name==='Earth');host.updateObject(earth.id,{color:'#aabbcc'});mark=worker.messages.length;clock+=20;host.frame(clock);ack();
const edited=worker.messages.slice(mark).filter(m=>m.type==='state').at(-1);assert.equal(edited.snapshot.objects.length,517);assert.equal(edited.snapshot.objects.find(o=>o.id===earth.id).color,'#aabbcc');
host.dispose();
const c=fixture();c.canvas.transferControlToOffscreen=()=>({});const cpu=new RenderHost(c.canvas,{}, {cpu:true});workers.at(-1).emit({type:'ready',available:true});await cpu.startup;
saved.quality='ultra';cpu.loadSnapshot(saved);assert.equal(cpu.cpu,true);assert.equal(cpu.quality,'ultra');assert(cpu.state.paused);cpu.dispose();

// Main-thread WebGL fallback has the same completed-frame annotation hook.
const d=fixture({gpuComplete:false}),directFrames=[];
const decorate=canvas=>{canvas.transferControlToOffscreen=()=>({});canvas.cloneNode=()=>decorate({...canvas,listeners:new Map()});canvas.replaceWith=()=>{};return canvas;};
const directHost=new RenderHost(decorate(d.canvas),{onFrame:value=>directFrames.push(value)});workers.at(-1).emit({type:'ready',available:true});await directHost.startup;
const direct=directHost.switchToDirect();direct.update({annotations:true});direct.render(100);assert(direct.gpuFence);assert.equal(directFrames.length,1);
d.control.gpuComplete=true;direct.gpuAvailable(101);assert(directFrames.length>=1);assert.equal(directFrames[0].kind,'annotation-frame');directHost.dispose();
if(previousWorker)globalThis.Worker=previousWorker;else delete globalThis.Worker;

// A draw records annotation geometry before a later state arrives. GPU fence
// completion must use that immutable geometry, not the controller's new view.
const g=fixture({gpuComplete:false}),messages=[];
const controller=installRenderWorker({postMessage:m=>messages.push(m),addEventListener(){},close(){}});
await controller.handle({type:'init',canvas:g.canvas,viewport:{width:900,height:650,dpr:1},snapshot:{...saved,quality:'low',state:{...saved.state,annotations:true,paused:true}},signature:'bridge'});
const renderer=controller.renderer;renderer.now=()=>100;
renderer.render(100);assert(renderer.gpuFence,'Fixture submits a real renderer draw');
const captured=renderer.gpuFence.annotationFrame;assert.equal(captured.kind,'annotation-frame');const eye=[...captured.cameraFrame.observer];
renderer.cameraFrame.observer=[10,20,30];g.control.gpuComplete=true;renderer.gpuAvailable(101);
const completed=messages.find(m=>m.type==='annotation-frame');assert(completed);assert.deepEqual(completed.frame.cameraFrame.observer,eye);assert.notDeepEqual(completed.frame.cameraFrame.observer,renderer.cameraFrame.observer);
await controller.handle({type:'dispose'});
console.log('PASS: bridge pause/drag transport, atomic paused file restore with backend preservation, per-presented-frame annotations, stale-frame rejection, and immutable GPU-fence camera geometry.');
