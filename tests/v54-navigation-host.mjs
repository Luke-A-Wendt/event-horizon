import assert from 'node:assert/strict';
import {RenderHost} from '../dist/render-host.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {installRenderWorker} from '../dist/render-worker.js';
import {fixture} from './render-fixture.mjs';
const previousWorker=globalThis.Worker,workers=[];
globalThis.Worker=class{constructor(){this.messages=[];this.listeners=new Map();workers.push(this);}addEventListener(n,fn){this.listeners.set(n,fn);}postMessage(m){this.messages.push(m);}terminate(){}emit(m){this.listeners.get('message')?.({data:m});}};
const f=fixture();f.canvas.transferControlToOffscreen=()=>({});
const host=new RenderHost(f.canvas,{}, {presentationPaused:true}),browserWorker=workers.at(-1),threads=[],delegates=[];
try{
 browserWorker.emit({type:'ready',available:true});await host.startup;host.loadScene('bridge');
 const ship=host.objects.find(o=>o.type==='enterprise'),revision=host.controlRevision;
 assert(host.setNavigationMode(ship.id,'manual'));assert.equal(host.getNavigationState(ship.id).mode,'manual');
 assert(host.setNavigationMode(ship.id,'auto'));assert(host.controlRevision>revision,'Paused navigation commands invalidate the host snapshot');
 assert(host.setFlightSequence(ship.id,[{targetId:'bridge-throat',heading:0},{targetId:'bridge-far-world',warpFactor:1}],{loop:true}));
 host.mailbox.acknowledge(host.mailbox.serial);host.queueSnapshot();const first=browserWorker.messages.filter(m=>m.type==='state').at(-1);
 for(const cpu of [false,true]){
  const wf=fixture(),messages=[],thread=installRenderWorker({postMessage:m=>messages.push(m),addEventListener(){},close(){}});threads.push(thread);
  await thread.handle({type:'init',cpu,commandMode:cpu,canvas:wf.canvas,viewport:{width:640,height:400,dpr:1},snapshot:first.snapshot,presentationPaused:true});
  assert.equal(thread.renderer.getNavigationState(ship.id).mode,'auto');assert.equal(thread.renderer.getFlightSequence(ship.id).nodes.length,2);
  assert(!messages.some(m=>m.type==='render-error'&&m.message),JSON.stringify(messages.filter(m=>m.type==='render-error')));
  assert.equal(wf.sources.length,0,'Control snapshots do not compile GPU programs behind a paused view');
 }
 const queueRevision=host.controlRevision;assert(host.startFlightSequence(ship.id));assert(host.controlRevision>queueRevision);
 host.stopFlightSequence(ship.id);host.setNavigationMode(ship.id,'manual');
 host.mailbox.acknowledge(host.mailbox.serial);host.queueSnapshot();const delta=browserWorker.messages.filter(m=>m.type==='state').at(-1);
 for(const thread of threads){await thread.handle(delta);assert.equal(thread.renderer.getNavigationState(ship.id).mode,'manual');assert.equal(thread.renderer.getFlightSequence(ship.id).active,false);}
 // Both direct-GPU and CPU fallbacks retain the same command and read APIs.
 const cpuFixture=fixture(),ctx=new Proxy({createRadialGradient(){return{addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:(()=>{})});cpuFixture.canvas.getContext=type=>type==='2d'?ctx:null;
 const gpu=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true}),cpu=new CpuRenderer(cpuFixture.canvas,{autoStart:false,bindControls:false});delegates.push(gpu,cpu);
 for(const direct of delegates){direct.loadScene('bridge');host.delegate=direct;const craft=direct.objects.find(o=>o.type==='enterprise');let interactions=0;host.noteInteraction=()=>interactions++;
  assert(host.setNavigationMode(craft.id,'manual'));assert(host.setNavigationMode(craft.id,'auto'));
  assert(host.setFlightSequence(craft.id,[{targetId:'bridge-throat'}],{loop:false}));assert(host.startFlightSequence(craft.id));assert(host.stopFlightSequence(craft.id));
  assert.equal(host.getNavigationState(craft.id).mode,'auto');assert.equal(host.getFlightSequence(craft.id).active,false);assert.equal(interactions,5,'All new navigation mutations retain interaction tracking through fallback');
 }
 host.delegate=null;
 console.log('PASS: navigation/mode/queue commands reach paused GPU and CPU workers, and forward through both direct backends with interaction tracking.');
}finally{host.delegate=null;for(const thread of threads)await thread.handle({type:'dispose'});for(const renderer of delegates)renderer.dispose();host.dispose();if(previousWorker)globalThis.Worker=previousWorker;else delete globalThis.Worker;}
