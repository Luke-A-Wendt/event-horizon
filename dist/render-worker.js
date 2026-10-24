import { BlackHoleRenderer } from './renderer.js';
import { CpuRenderer } from './cpu-renderer.js';
import { createPhotoRender } from './photo-renderer.js';
import { restoreRenderer } from './render-state.js';
import { CpuCommandCanvas } from './cpu-commands.js';

// Bundled into a local Blob. No imports, network, DOM, or external worker URL
// remain in the generated worker. UI actions are never executed on this thread.
export function installRenderWorker(scope,dependencies={}){
 const Gpu=dependencies.GpuRenderer||BlackHoleRenderer,Cpu=dependencies.CpuRenderer||CpuRenderer,photo=dependencies.createPhotoRender||createPhotoRender;
 const listeners=new Map(),eventTarget={addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
 let renderer=null,viewport={width:640,height:400,dpr:1},signature='',lastReport=0,frameReported=false,photoAbort=null,presentationIntent=false,commandCanvas=null,commandFrame=null,commandSerial=0;
 const send=message=>scope.postMessage(message);
 // The rendering core shares lightweight event interfaces with the Window
 // version; graphics and Canvas APIs still come from the actual worker.
 globalThis.window={...eventTarget,devicePixelRatio:1};globalThis.document={...eventTarget,hidden:false};
 if(typeof globalThis.requestAnimationFrame!=='function'){
  globalThis.requestAnimationFrame=fn=>setTimeout(()=>fn(performance.now()),16);
  globalThis.cancelAnimationFrame=id=>clearTimeout(id);
 }
 const status=(extra={})=>{
  if(!renderer)return;
  const s=renderer.getState();send({type:'status',stats:{fps:s.fps||0,effectiveQuality:s.effectiveQuality,adaptiveLevel:s.adaptiveLevel,adaptiveStatus:s.adaptiveStatus,adaptiveReason:s.adaptiveReason,probePending:s.probePending,shaderCompiling:s.shaderCompiling,webgl:s.webgl,width:renderer.canvas.width,height:renderer.canvas.height,scale:renderer.renderScale,steps:renderer.steps,cpu:!!renderer.cpu,contextLost:renderer.contextLost,...extra}});
 };
 const makeClass=Base=>class extends Base{
  bindControls(){}
  advanceSimulation(now){const gap=this.lastTime?now-this.lastTime:0;this.lastTime=now;if(this.budget.noteFrame(now,gap))this.resizePending=true;return 0;}
  completed(signatureAtDraw,now,sceneRevision=this.sceneRevision){if(!frameReported||now-lastReport>250){frameReported=signatureAtDraw===signature;lastReport=now;status({renderedSignature:signatureAtDraw,sceneRevision,frameReady:true});}}
  gpuAvailable(now){const fence=this.gpuFence,available=super.gpuAvailable(now);if(fence&&available&&!this.gpuFence)this.completed(fence.renderedSignature||signature,now,fence.sceneRevision);return available;}
  render(now=this.now(),fromFrame=false,...rest){
   if(commandCanvas&&commandFrame)return false;
   if(commandCanvas)commandCanvas.beginFrame();
   let drawn;try{drawn=super.render(now,fromFrame,...rest);}catch(error){this.setPresentationPaused(true);send({type:'render-error',signature,sceneRevision:this.sceneRevision,message:'This scene could not render: '+(error?.message||error)});return false;}
   if(drawn&&commandCanvas){commandFrame={serial:++commandSerial,signature,sceneRevision:this.sceneRevision};send({type:'cpu-frame',serial:commandSerial,signature,sceneRevision:this.sceneRevision,frame:commandCanvas.takeFrame()});return true;}
   if(drawn){if(this.gpuFence){this.gpuFence.renderedSignature=signature;this.gpuFence.sceneRevision=this.sceneRevision;}else this.completed(signature,now);}
   return drawn;
  }
 };
 function apply(snapshot,nextViewport){
  if(!renderer)return;
  if(nextViewport){const changed=viewport.width!==nextViewport.width||viewport.height!==nextViewport.height||viewport.dpr!==nextViewport.dpr;viewport=nextViewport;window.devicePixelRatio=viewport.dpr;if(changed)renderer.resize(true);}
  if(snapshot)restoreRenderer(renderer,snapshot);
 }
 async function handle(message){
  try{
   if(message.type==='init'){
    signature=message.signature||'';
    viewport=message.viewport;window.devicePixelRatio=viewport.dpr;
    const canvas=message.commandMode?(commandCanvas=new CpuCommandCanvas()):message.canvas;canvas.style={};canvas.getBoundingClientRect=()=>({width:viewport.width,height:viewport.height});
    canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
    // convertToBlob snapshots in this same task, like HTMLCanvas.toBlob.
    if(!canvas.toBlob&&canvas.convertToBlob)canvas.toBlob=(callback,type='image/png')=>canvas.convertToBlob({type}).then(callback,()=>callback(null));
    const Class=makeClass(message.cpu?Cpu:Gpu);
    renderer=new Class(canvas,{bindControls:false,onError:error=>send({type:'render-error',signature,sceneRevision:renderer?.sceneRevision,message:String(error||'')}),onStats:()=>status()});
    canvas.addEventListener?.('webglcontextlost',event=>{event.preventDefault?.();renderer.ready=false;renderer.contextLost=true;renderer.gpuFence=null;photoAbort?.abort();renderer.cancelCapture('The GPU context was lost.');frameReported=false;status();send({type:'render-error',message:'Graphics paused while the GPU recovers.'});});
    canvas.addEventListener?.('webglcontextrestored',()=>{renderer.initGL();renderer.resize();frameReported=false;status();});
    if(message.snapshot)apply(message.snapshot);
    const available=message.cpu?!!renderer.ready:!!renderer.gl;
    send({type:'ready',available,cpu:!!message.cpu,reason:available?'':'WebGL could not start in this worker.'});
    if(!available){renderer.setPresentationPaused(true);return;}
    signature=message.signature||'';status();return;
   }
   if(!renderer)return;
   if(message.type==='state'){
    if(signature!==message.signature){signature=message.signature;frameReported=false;}apply(message.snapshot,message.viewport);
    presentationIntent=!!message.presentationPaused;renderer.setPresentationPaused(presentationIntent||!!document.hidden);
    send({type:'ack',serial:message.serial});return;
   }
   if(message.type==='cpu-presented'){
    if(commandFrame?.serial===message.serial){renderer.noteCpuCost?.(message.costMs||0);if(!message.cancelled)renderer.completed(commandFrame.signature,renderer.now(),commandFrame.sceneRevision);commandFrame=null;}return;
   }
   if(message.type==='visibility'){
    document.hidden=!!message.hidden;if(message.presentationPaused!==undefined)presentationIntent=!!message.presentationPaused;renderer.setPresentationPaused(!!message.hidden||presentationIntent);
    if(message.hidden)photoAbort?.abort();return;
   }
   if(message.type==='cancel-photo'){photoAbort?.abort();return;}
   if(message.type==='capture'&&commandCanvas){throw new Error('Command-rendered images are saved by the presentation canvas.');}
   if(message.type==='capture'){
    apply(message.snapshot,message.viewport);renderer.setPresentationPaused(false);
    try{const blob=await renderer.captureImage();send({type:'result',id:message.id,value:blob});}
    finally{renderer.setPresentationPaused(presentationIntent||!!document.hidden);}return;
   }
   if(message.type==='photo'){
    if(photoAbort)throw new Error('A still is already rendering.');
    apply(message.snapshot,message.viewport);photoAbort=new AbortController();
    try{const result=await photo(renderer,{...message.options,signal:photoAbort.signal,onProgress:progress=>send({type:'progress',id:message.id,progress})});send({type:'result',id:message.id,value:result});}
    finally{photoAbort=null;}return;
   }
   if(message.type==='dispose'){photoAbort?.abort();renderer.dispose();renderer=null;scope.close?.();}
  }catch(error){send({type:'error',id:message.id,signature,sceneRevision:renderer?.sceneRevision,name:error?.name||'Error',message:error?.message||String(error)});}
 }
 scope.addEventListener('message',event=>{void handle(event.data);});
 return {handle,get renderer(){return renderer;}};
}
