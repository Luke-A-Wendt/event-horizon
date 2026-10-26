import assert from 'node:assert/strict';
import { RenderHost } from '../dist/render-host.js';
import { renderSignature } from '../dist/render-state.js';
import { fixture } from './render-fixture.mjs';

// Regression: paused views must never silently enter Picture studio. Its
// expensive compilation and tile jobs are now strictly explicit user actions.
const priorWorker=globalThis.Worker,workers=[];
globalThis.Worker=class{
 constructor(){this.listeners=new Map();this.messages=[];workers.push(this);}
 addEventListener(name,fn){this.listeners.set(name,fn);}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}
 emit(message){this.listeners.get('message')?.({data:message});}
};
const f=fixture();let clock=1000;f.canvas.transferControlToOffscreen=()=>({});
const host=new RenderHost(f.canvas);host.now=()=>clock;const worker=workers.at(-1);
assert(worker.messages[0].assets&&'maps' in worker.messages[0].assets,'GPU startup receives its one-time embedded texture payload');
worker.emit({type:'ready',available:true});await host.startup;
const ack=()=>{for(const message of worker.messages.filter(m=>m.type==='state'))worker.emit({type:'ack',serial:message.serial});};
const complete=()=>worker.emit({type:'status',stats:{frameReady:true,renderedSignature:renderSignature(host),sceneRevision:host.sceneRevision,fps:60}});
host.loadScene('disk');ack();complete();host.camera={...host.target};
for(let i=0;i<600;i++){clock+=20;host.frame(clock);ack();if(i%10===0)complete();host.checkSceneLoad();}
assert.equal(host.state.paused,true);assert.equal(host.quality,'adaptive');assert(!host.photoRunning);
assert(!worker.messages.some(m=>m.type==='photo'),'Idle time never submits a photo job or high-resolution compilation');
assert(!worker.messages.some(m=>m.type==='visibility'&&m.presentationPaused),'Idle time never locks presentation behind a still');
assert.equal(host.getState().renderBusy,false);assert.equal(worker.terminated,undefined);

// A static paused catalog does not get deep-cloned on every animation frame.
host.queueSnapshot();ack();let reads=0;
Object.defineProperty(host,'freePosition',{configurable:true,get(){reads++;return null;},set(){}});
for(let i=0;i<30;i++)host.queueSnapshot();assert.equal(reads,0);

// Camera movement still creates a fresh snapshot immediately after long idle.
const before=worker.messages.filter(m=>m.type==='state').length;
host.rotate(.2,.1);clock+=20;host.frame(clock);ack();
assert(worker.messages.filter(m=>m.type==='state').length>before);
assert.notEqual(host.camera.yaw,.25);assert.equal(host.quality,'adaptive');
assert(worker.messages.filter(m=>m.type==='state').every(m=>!('assets'in m)),'Scene updates never resend large texture payloads');
host.dispose();
const cpuFixture=fixture();cpuFixture.canvas.transferControlToOffscreen=()=>({});const cpuHost=new RenderHost(cpuFixture.canvas,{}, {cpu:true});
assert(!('assets'in workers.at(-1).messages[0]),'CPU workers never receive GPU map bytes');cpuHost.dispose();
if(priorWorker)globalThis.Worker=priorWorker;else delete globalThis.Worker;
console.log('PASS: automatic idle refinement removed; paused views keep interactive quality and camera transport, unchanged snapshots are not cloned, and CPU workers receive no map assets.');
