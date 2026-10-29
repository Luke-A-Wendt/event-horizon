import assert from 'node:assert/strict';
import {RenderHost} from '../dist/render-host.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installRenderWorker} from '../dist/render-worker.js';
import {fixture} from './render-fixture.mjs';
const previousWorker=globalThis.Worker,workers=[];
globalThis.Worker=class{constructor(){this.messages=[];this.listeners=new Map();workers.push(this);}addEventListener(n,fn){this.listeners.set(n,fn);}postMessage(m){this.messages.push(m);}terminate(){}emit(m){this.listeners.get('message')?.({data:m});}};
const f=fixture();f.canvas.transferControlToOffscreen=()=>({});const host=new RenderHost(f.canvas,{}, {presentationPaused:true}),browserWorker=workers.at(-1);let thread=null;
try{
 browserWorker.emit({type:'ready',available:true});await host.startup;host.loadScene('bridge');const ship=host.objects.find(o=>o.type==='enterprise');host.setFreeDrive(ship.id,true);
 const revision=host.controlRevision;assert.equal(host.setFlightMode('impulse'),false);assert(host.setFlightMode('warp'));assert(host.controlRevision>revision,'Engine changes invalidate the host frame while simulation is paused');host.setFlightPower(5);host.mailbox.acknowledge(host.mailbox.serial);host.queueSnapshot();const state=browserWorker.messages.filter(m=>m.type==='state').at(-1);assert(state.snapshot.objects.find(o=>o.id===ship.id).flight.mode==='warp');
 const wf=fixture(),messages=[];thread=installRenderWorker({postMessage:m=>messages.push(m),addEventListener(){},close(){}});await thread.handle({type:'init',canvas:wf.canvas,viewport:{width:640,height:400,dpr:1},snapshot:state.snapshot,presentationPaused:true});
 assert.equal(thread.renderer.getFlightState().flightMode,'warp');assert.equal(thread.renderer.getFlightState().warpFactor,5);assert.equal(thread.renderer.state.warp,true);assert.equal(wf.sources.length,0,'State forwarding does not compile shaders behind a paused view');
 const direct=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});direct.loadScene('bridge');direct.setFreeDrive(direct.objects.find(o=>o.type==='enterprise').id,true);let interactions=0;host.noteInteraction=()=>interactions++;host.delegate=direct;assert.equal(host.setFlightMode('impulse'),false);assert(host.setFlightMode('warp'));assert.equal(direct.getFlightState().flightMode,'warp');assert.equal(interactions,2,'Fallback/VR mode changes retain host interaction tracking');
}finally{await thread?.handle({type:'dispose'});host.dispose();if(previousWorker)globalThis.Worker=previousWorker;else delete globalThis.Worker;}
console.log('PASS: paused host propulsion mutation advances revision, transfers manual bridge warp to worker, and forwards through the direct renderer with interaction tracking.');
