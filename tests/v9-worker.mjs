import assert from 'node:assert/strict';
import { Worker as ThreadWorker } from 'node:worker_threads';
import { fixture } from './render-fixture.mjs';
import { LatestStateMailbox, snapshotRenderer, restoreRenderer, renderSignature } from '../dist/render-state.js';
import { RenderHost } from '../dist/render-host.js';

// Real queue behavior: hundreds of pointer updates cannot build up a FIFO.
const sent=[],mailbox=new LatestStateMailbox(m=>sent.push(m));
for(let n=0;n<300;n++)mailbox.push({snapshot:{time:n}});
assert.equal(sent.length,1);assert.equal(sent[0].snapshot.time,0);
mailbox.acknowledge(0);assert.equal(sent.length,1);
mailbox.acknowledge(1);assert.equal(sent.length,2);assert.equal(sent[1].snapshot.time,299);
mailbox.acknowledge(1);assert.equal(mailbox.inflight,true);
mailbox.acknowledge(2);assert.equal(mailbox.inflight,false);
mailbox.close();mailbox.push({});assert.equal(sent.length,2);

// Run the actual worker protocol on a second JS thread. Graphics are recording
// doubles here: this verifies isolation/protocol, not browser GPU driver speed.
const workerCode=String.raw`
const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
 const {installRenderWorker}=await import(workerData.url);let controller;
 class RecordingRenderer{
  constructor(canvas,options){this.canvas=canvas;this.gl={};this.ready=true;this.cpu=false;this.state={mass:4};this.objects=[];this.quality='adaptive';this.budget={noteFrame(){return false;}};this.lastTime=0;this.onStats=options.onStats;this.onError=options.onError;this.gpuFence=null;}
  getState(){return {fps:30,effectiveQuality:'medium',adaptiveLevel:1,webgl:2};}
  now(){return performance.now();}resize(){}refreshConfiguration(){}fillHoles(){}fillObjects(){}updateCameraFrame(){}
  setQuality(value){this.quality=value;}setPresentationPaused(value){this.presentationPaused=value;}
  render(){this.gpuFence={complete:false};return true;}
  gpuAvailable(){if(!this.gpuFence||!this.gpuFence.complete)return false;this.gpuFence=null;return true;}
  captureImage(){const end=Date.now()+140;while(Date.now()<end){}return Promise.resolve(new Blob(['capture'],{type:'image/png'}));}
  cancelCapture(){}dispose(){this.disposed=true;}
 }
 const scope={postMessage:m=>parentPort.postMessage(m),close:()=>parentPort.close(),addEventListener(_,handler){parentPort.on('message',data=>{
  if(data.type==='init')data.canvas={width:640,height:400,convertToBlob:async()=>new Blob(['canvas'])};
  if(data.type==='test:draw'){controller.renderer.render(100);parentPort.postMessage({type:'test:drawn'});return;}
  if(data.type==='test:complete'){controller.renderer.gpuFence.complete=true;controller.renderer.gpuAvailable(120);parentPort.postMessage({type:'test:completed'});return;}
  if(data.type==='test:inspect'){parentPort.postMessage({type:'test:inspect',state:controller.renderer.state,objects:controller.renderer.objects,paused:controller.renderer.presentationPaused,hidden:document.hidden});return;}
  handler({data});
 });}};
 const photo=async(renderer,{signal,onProgress})=>{onProgress({fraction:.25,phase:'Resolving procedural detail'});await new Promise((resolve,reject)=>{const id=setTimeout(resolve,60);signal.addEventListener('abort',()=>{clearTimeout(id);reject(Object.assign(new Error('Cancelled'),{name:'AbortError'}));},{once:true});});return {blob:new Blob(['photo']),width:64,height:64};};
 controller=installRenderWorker(scope,{GpuRenderer:RecordingRenderer,CpuRenderer:RecordingRenderer,createPhotoRender:photo});parentPort.postMessage({type:'test:installed'});
})().catch(error=>{throw error;});`;
const thread=new ThreadWorker(workerCode,{eval:true,workerData:{url:new URL('../dist/render-worker.js',import.meta.url).href}});
const messages=[],waiters=[];
thread.on('message',message=>{messages.push(message);for(const w of [...waiters])if(w.predicate(message)){waiters.splice(waiters.indexOf(w),1);clearTimeout(w.timeout);w.resolve(message);}});
const waitFor=(predicate,after=0)=>{const found=messages.slice(after).find(predicate);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const w={predicate,resolve,timeout:setTimeout(()=>reject(new Error('Worker protocol response timed out')),3000)};waiters.push(w);});};
await waitFor(m=>m.type==='test:installed');
thread.postMessage({type:'init',cpu:false,viewport:{width:640,height:400,dpr:1},snapshot:{state:{mass:5},objects:[{id:'craft-1',placement:'local',warpEnabled:true}],quality:'high'},signature:'first'});
assert.equal((await waitFor(m=>m.type==='ready')).available,true);
const beforeDraw=messages.length;thread.postMessage({type:'test:draw'});await waitFor(m=>m.type==='test:drawn',beforeDraw);
assert(!messages.slice(beforeDraw).some(m=>m.type==='status'&&m.stats.frameReady),'Submitting a GPU draw must not dismiss loading');
thread.postMessage({type:'test:complete'});const completed=await waitFor(m=>m.type==='status'&&m.stats.frameReady,beforeDraw);assert.equal(completed.stats.renderedSignature,'first');
thread.postMessage({type:'state',serial:9,signature:'latest',snapshot:{state:{mass:9},objects:[{id:'craft-2',placement:'local',x:9,warpEnabled:false}],quality:'medium'},presentationPaused:true});
assert.equal((await waitFor(m=>m.type==='ack')).serial,9);
let mark=messages.length;thread.postMessage({type:'test:inspect'});let inspect=await waitFor(m=>m.type==='test:inspect',mark);assert.equal(inspect.state.mass,9);assert.equal(inspect.objects[0].id,'craft-2');assert.equal(inspect.paused,true);
thread.postMessage({type:'visibility',hidden:true,presentationPaused:false});mark=messages.length;thread.postMessage({type:'test:inspect'});inspect=await waitFor(m=>m.type==='test:inspect',mark);assert(inspect.hidden&&inspect.paused);
thread.postMessage({type:'visibility',hidden:false,presentationPaused:false});
thread.postMessage({type:'state',serial:10,signature:'latest',presentationPaused:true});await waitFor(m=>m.type==='ack'&&m.serial===10);
let ticks=0;const interval=setInterval(()=>ticks++,5);thread.postMessage({type:'capture',id:1});const captured=await waitFor(m=>m.type==='result'&&m.id===1);clearInterval(interval);assert(captured.value instanceof Blob);assert(ticks>=8,'The main event loop stays available while another thread does 140ms of work');
mark=messages.length;thread.postMessage({type:'test:inspect'});inspect=await waitFor(m=>m.type==='test:inspect',mark);assert.equal(inspect.paused,true,'Saving a frame restores the modal presentation pause');
thread.postMessage({type:'photo',id:2,options:{presetId:'standard'}});await waitFor(m=>m.type==='progress'&&m.id===2);thread.postMessage({type:'cancel-photo',id:2});assert.equal((await waitFor(m=>m.type==='error'&&m.id===2)).name,'AbortError');
thread.postMessage({type:'photo',id:3,options:{presetId:'fine'}});await waitFor(m=>m.type==='progress'&&m.id===3);thread.postMessage({type:'visibility',hidden:true});assert.equal((await waitFor(m=>m.type==='error'&&m.id===3)).name,'AbortError');
thread.postMessage({type:'visibility',hidden:false});thread.postMessage({type:'photo',id:4,options:{presetId:'standard'}});assert((await waitFor(m=>m.type==='result'&&m.id===4)).value.blob instanceof Blob);
thread.postMessage({type:'dispose'});await new Promise(resolve=>thread.once('exit',resolve));

// Synchronous controller + transferred-canvas safety, using recording browser
// surfaces. The placeholder throws if any host code changes its bitmap size.
const previousWorker=globalThis.Worker;
let created=[];
class BrowserWorker{
 constructor(url){assert(url.startsWith('blob:'));this.listeners=new Map();this.messages=[];created.push(this);}
 addEventListener(name,fn){this.listeners.set(name,fn);}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}
 emit(message){this.listeners.get('message')?.({data:message});}error(message){this.listeners.get('error')?.({message});}
}
globalThis.Worker=BrowserWorker;
function hostFixture(){
 const f=fixture();let replacements=0,contexts=0,transferred=false;const getContext=f.canvas.getContext;
 const decorate=canvas=>{canvas.getContext=(...args)=>{contexts++;return getContext(...args);};canvas.transferControlToOffscreen=()=>{transferred=true;return {};};canvas.cloneNode=()=>decorate({...canvas,listeners:new Map()});canvas.replaceWith=()=>{replacements++;transferred=false;};return canvas;};
 decorate(f.canvas);
 let width=0,height=0;for(const key of ['width','height'])Object.defineProperty(f.canvas,key,{configurable:true,get:()=>key==='width'?width:height,set:value=>{assert(!transferred,'A transferred placeholder cannot resize');if(key==='width')width=value;else height=value;}});
 return {...f,get contexts(){return contexts;},get replacements(){return replacements;}};
}
let h=hostFixture(),errors=[],host=new RenderHost(h.canvas,{onError:e=>errors.push(e)}),browserWorker=created.at(-1);
assert.equal(h.contexts,0,'The synchronous controller cannot compile or create GPU contexts');
assert.equal(browserWorker.messages[0].type,'init');browserWorker.emit({type:'ready',available:true});assert.equal((await host.startup).worker,true);
host.loadScene('empty-space');const object=host.addObject('shuttle');assert(object?.id);host.updateObject(object.id,{x:24,y:2});host.setObjectWarp(object.id,true);
const snapshot=snapshotRenderer(host);snapshot.state.mass=99;assert.notEqual(host.state.mass,99,'Snapshots are isolated copies');
host.frame(100);host.resize();assert.equal(h.contexts,0);
const newerScene=host.sceneId;browserWorker.emit({type:'status',stats:{fps:45,effectiveQuality:'high',adaptiveLevel:2,renderedSignature:'stale',frameReady:true}});assert.equal(host.getState().sceneId,newerScene);assert.equal(host.getState().renderBusy,true,'Old frames cannot mark a new scene ready');
browserWorker.emit({type:'status',stats:{fps:45,renderedSignature:renderSignature(host),frameReady:true}});assert.equal(host.getState().renderBusy,false);
document.hidden=true;document.emit('visibilitychange');assert(browserWorker.messages.some(m=>m.type==='visibility'&&m.hidden));document.hidden=false;
const currentState=snapshotRenderer(host),oldWorker=browserWorker;host.restartRendering();browserWorker=created.at(-1);assert.notEqual(browserWorker,oldWorker);assert.equal(h.replacements,1);assert.equal(host.sceneId,currentState.sceneId);oldWorker.error('Late failure');assert.equal(browserWorker.terminated,undefined,'A terminated worker cannot kill its successor');browserWorker.emit({type:'ready',available:true});
// Taking a still travels through RPC, including progress and cancellation.
const abort=new AbortController(),progress=[];const picture=host.renderPicture({presetId:'fine',signal:abort.signal,onProgress:p=>progress.push(p)});const request=browserWorker.messages.find(m=>m.type==='photo');assert(request);browserWorker.emit({type:'progress',id:request.id,progress:{fraction:.4}});assert.equal(progress[0].fraction,.4);abort.abort();assert(browserWorker.messages.some(m=>m.type==='cancel-photo'));browserWorker.emit({type:'error',id:request.id,name:'AbortError',message:'Cancelled'});await assert.rejects(picture,{name:'AbortError'});host.dispose();
// Worker-WebGL absence and blocked startup both try ordinary GPU before CPU.
for(const failure of ['unavailable','blocked']){
 h=hostFixture();let rafs=[];globalThis.requestAnimationFrame=fn=>{rafs.push(fn);return rafs.length;};host=new RenderHost(h.canvas);browserWorker=created.at(-1);
 if(failure==='unavailable')browserWorker.emit({type:'ready',available:false});else browserWorker.error('Worker blocked by this browser');
 for(let n=0;n<3;n++){const batch=rafs;rafs=[];batch.forEach(fn=>fn(n*16));await Promise.resolve();}
 const startup=await host.startup;assert.equal(startup.available,true);assert.equal(startup.worker,false);assert(h.contexts>0);assert.equal(h.replacements,1);assert.equal(host.getState().cpu,undefined);host.dispose();
}
// WebXR must request user activation before a fresh Window GL context compiles.
const savedNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),savedLayer=globalThis.XRWebGLLayer;
const xrEvents=new Map();let xrRequests=0;
const session={visibilityState:'visible',renderState:{},addEventListener(name,fn){if(!xrEvents.has(name))xrEvents.set(name,new Set());xrEvents.get(name).add(fn);},removeEventListener(name,fn){xrEvents.get(name)?.delete(fn);},requestReferenceSpace:async()=>({}),requestAnimationFrame:()=>1,updateRenderState(patch){this.renderState={...this.renderState,...patch};},async end(){for(const fn of [...xrEvents.get('end')||[]])fn();}};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{xr:{requestSession(){xrRequests++;assert.equal(h.contexts,0,'Request XR before cold shader compilation');return Promise.resolve(session);}}}});
globalThis.XRWebGLLayer=class{constructor(){this.framebufferWidth=1000;this.framebufferHeight=800;this.framebuffer={};}};
h=hostFixture();host=new RenderHost(h.canvas);browserWorker=created.at(-1);browserWorker.emit({type:'ready',available:true});await host.startup;
host.loadScene('empty-space');const craft=host.addObject('shuttle');host.focusObject(craft.id,'onboard');const entering=host.enterVR();assert.equal(xrRequests,1);assert.equal(h.contexts,0);await entering;
assert.equal(host.getState().vrActive,true);assert.equal(xrRequests,1,'The supplied session must not prompt twice');assert(h.contexts>0);assert.equal(h.replacements,1);
host.updateObject(craft.id,{phase:1.25});await host.exitVR();await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(host.workerMode,true);assert.equal(h.replacements,2);assert.equal(host.getObjects().find(o=>o.id===craft.id).phase,1.25);assert.equal(host.focusMode,'onboard');host.dispose();
if(savedNavigator)Object.defineProperty(globalThis,'navigator',savedNavigator);else delete globalThis.navigator;if(savedLayer)globalThis.XRWebGLLayer=savedLayer;else delete globalThis.XRWebGLLayer;
if(previousWorker)globalThis.Worker=previousWorker;else delete globalThis.Worker;
console.log('PASS: bounded latest-state mailbox; real-thread protocol, fence completion, responsive main loop, captures and cancellation; host state isolation, fresh canvases, visibility, stale-worker guards, main GPU fallback and preauthorized VR round-trip.');
