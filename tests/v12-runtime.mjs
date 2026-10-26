import assert from 'node:assert/strict';
import {RenderHost} from '../dist/render-host.js';
import {renderSignature} from '../dist/render-state.js';
import {fixture} from './render-fixture.mjs';

const priorWorker=globalThis.Worker,workers=[];
globalThis.Worker=class{
 constructor(){this.listeners=new Map();this.messages=[];workers.push(this);}
 addEventListener(name,fn){this.listeners.set(name,fn);}
 postMessage(message){this.messages.push(message);}
 terminate(){this.terminated=true;}
 emit(message){this.listeners.get('message')?.({data:message});}
};
const f=fixture();f.canvas.transferControlToOffscreen=()=>({});
const host=new RenderHost(f.canvas),worker=workers.at(-1);
worker.emit({type:'ready',available:true});assert((await host.startup).available);
const initial=worker.messages.find(message=>message.type==='state');assert(initial);
// A blocked worker must not cause sixty fresh deep clones per second on the UI
// thread. Its in-flight message is bounded; acknowledgment snapshots latest intent.
let clones=0;Object.defineProperty(host,'freePosition',{configurable:true,get(){clones++;return null;},set(){}});
for(let i=0;i<80;i++){host.state.starDensity=.5+i/100;host.queueSnapshot();}
assert.equal(clones,0,'Do not clone while the worker has an unacknowledged state');
assert.equal(worker.messages.filter(message=>message.type==='state').length,1);
worker.emit({type:'ack',serial:initial.serial});
assert.equal(clones,2,'One snapshot reads the field for presence and value');const latest=worker.messages.filter(message=>message.type==='state').at(-1);
assert.equal(latest.snapshot.state.starDensity,1.29,'Only latest edits are sent when worker catches up');
worker.emit({type:'ack',serial:latest.serial});
// Object/tree changes use the same paint-first transaction as scene loads.
const revision=host.prepareMutation('Adding a planet…'),before=worker.messages.length;
host.queueSnapshot();assert.equal(worker.messages.length,before);
assert.equal(host.getState().diagnostics.phase,'preparing');
assert.equal(host.completedFrame(renderSignature(host),revision),false);
host.update({starDensity:2});host.finishMutation();
assert.equal(worker.messages.length,before+1);
assert.equal(host.getState().diagnostics.phase,'drawing');
worker.emit({type:'status',stats:{frameReady:true,renderedSignature:renderSignature(host),sceneRevision:revision,fps:30}});
const state=host.getState();assert.equal(state.sceneLoadState,'ready');
assert.equal(state.diagnostics.backend,'worker-gpu');assert.equal(state.diagnostics.mainThread,false);
assert(state.diagnostics.frameAgeMs>=0&&state.diagnostics.frameAgeMs<1000);
assert.equal(state.diagnostics.deadlineMs,30000);assert.match(state.diagnostics.detail,/separate from page controls/);
host.workerFailed('Injected driver failure',{allowFallback:false});
const failure=host.getState();assert.equal(failure.diagnostics.phase,'failed');assert.match(failure.diagnostics.error,/Injected driver failure/);assert.equal(failure.renderReady,false);host.dispose();
if(priorWorker)globalThis.Worker=priorWorker;else delete globalThis.Worker;
console.log('PASS: bounded snapshot work under stalled workers, latest-state replay, paint-first mutation readiness, and explicit backend/phase/error diagnostics. Device scheduling is not emulated.');
