import { BlackHoleRenderer } from './renderer.js';
import { CpuRenderer } from './cpu-renderer.js';
import { CpuCommandCanvas, CpuCommandPlayer, createCpuTaskScheduler } from './cpu-commands.js';
import { createPhotoRender } from './photo-renderer.js';
import { RENDER_WORKER_SOURCE } from './render-worker-bundle.js';
import { snapshotRenderer, restoreRenderer, renderSignature, LatestStateMailbox, SceneLoadLifecycle } from './render-state.js';

const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const hostMethods=new Set(['startup','getState','captureImage','renderPicture','getVRSupport','enterVR','exitVR','dispose','restartRendering','workerMode','requestSceneLoad','didRestoreSnapshot','loadScene','loadWarpScenario','setPresentationPaused']);
const viewport=canvas=>{const r=canvas.getBoundingClientRect();return {width:Math.max(2,r.width),height:Math.max(2,r.height),dpr:Math.min(3,window.devicePixelRatio||1)};};
const workerAvailable=()=>typeof Worker==='function'&&typeof Blob==='function'&&typeof URL?.createObjectURL==='function';
export function workerRenderingSupported(canvas){return workerAvailable()&&typeof canvas?.transferControlToOffscreen==='function';}

// This controller computes only cheap state/camera changes on the main thread.
// Shader compilation, ray tracing, CPU painting, and stills run in its worker.
export class RenderHost extends BlackHoleRenderer {
 constructor(canvas,callbacks={},options={}){
  super(canvas,{...callbacks,autoStart:false});
  this.callbacks=callbacks;this.cpu=!!options.cpu;this.cpuMode=this.cpu;this.isCPU=this.cpu;this.workerMode=false;this.worker=null;this.delegate=null;this.pendingRequests=new Map();this.requestId=0;this.workerStats={};this.workerReady=false;this.lastWorkerAt=0;this.lastFrameAt=0;this.frameSeen=false;this.lastUiStats=0;this.hostDisposed=false;this.photoRunning=false;this.gpuUnavailable=false;this.awaitingBackendChoice=false;this.commandPlayer=null;this.commandMode=false;this.cpuProducer=null;this.lastHostFrame=0;this.lastStatsNotice=0;
  if(this.cpu){this.gl=null;this.quality='cpu';}
  this.sceneLoad=new SceneLoadLifecycle({cpu:this.cpu,now:()=>this.now()});this.sceneRevision=this.sceneLoad.revision;
  this.loadMonitor=setInterval(()=>this.checkSceneLoad(),250);
  this.startup=new Promise(resolve=>{this.resolveStartup=resolve;});
  this.startBackend();
  if(!this.raf)this.raf=requestAnimationFrame(this.frame);
  return new Proxy(this,{get:(target,key)=>{
   if(target.delegate&&!hostMethods.has(key)){const value=target.delegate[key];return typeof value==='function'?value.bind(target.delegate):value;}
   const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
 }
 initGL(){this.gl={worker:true};this.ready=true;this.contextLost=false;this.programs=new Map();this.failedPrograms=new Set();this.pendingProgram=null;this.activeProgram=null;this.gpuFence=null;this.webgl2=true;}
 requestProgram(){}
 pollProgram(){}
 bindControls(){super.bindControls();this.listen(document,'visibilitychange',()=>{this.sceneLoad?.check(true);if(document.hidden)this.cancelCpuWork();this.worker?.postMessage({type:'visibility',hidden:document.hidden,presentationPaused:this.presentationPaused});});}
 cancelCpuWork(){this.commandPlayer?.cancelFrame();this.cpuTasks?.cancel(this.cpuTask);this.cpuTask=null;this.cpuProducing=false;}
 resize(){this.hostViewport=null;if(this.worker)this.queueSnapshot();}
 render(){return false;}
 currentSignature(){return renderSignature(this.delegate||this);}
 requestSceneLoad(){
  this.sceneRevision=this.sceneLoad.begin();if(this.delegate)this.delegate.sceneRevision=this.sceneRevision;
  this.preparedSceneLoad=true;this.cancelCpuWork();this.onError('');this.emitHostStats(true);return this.sceneRevision;
 }
 didRestoreSnapshot(){if(!this.sceneLoad)return;this.sceneRevision=this.sceneLoad.begin();if(this.delegate)this.delegate.sceneRevision=this.sceneRevision;this.preparedSceneLoad=false;}
 loadScene(id='disk'){
  if(!this.preparedSceneLoad)this.requestSceneLoad();this.preparedSceneLoad=false;
  try{
   const result=this.delegate?this.delegate.loadScene(id):super.loadScene(id);
   if(this.gpuUnavailable||this.cpuProducer&&!this.cpuProducer.ready)this.restartRendering();
   this.queueSnapshot();this.emitHostStats(true);return result;
  }catch(error){this.workerFailed('This scene could not load: '+(error?.message||error));return this.getState();}
 }
 checkSceneLoad(){
  if(this.hostDisposed||!this.sceneLoad)return;
  const renderer=this.delegate||this,suspended=!!(this.awaitingBackendChoice||document.hidden||renderer.presentationPaused||this.photoRunning||renderer.photoActive||renderer.xr?.active);
  if(this.sceneLoad.check(suspended))this.workerFailed(this.sceneLoad.error,{allowFallback:false});
 }
 completedFrame(signature,revision=this.sceneRevision){
  if(this.preparedSceneLoad||signature!==this.currentSignature()||revision!==this.sceneRevision||this.sceneLoad?.state==='failed')return false;
  this.frameSeen=true;this.lastFrameAt=this.now();this.workerStats.renderedSignature=signature;this.workerStats.frameReady=true;this.sceneLoad?.complete(revision);return true;
 }
 frame(now){
  this.raf=0;if(this.hostDisposed||this.delegate||document.hidden||this.presentationPaused||this.photoRunning){this.lastTime=0;return;}
  this.raf=requestAnimationFrame(this.frame);if(this.cpu&&now-this.lastHostFrame<1000/30-1)return;this.lastHostFrame=now;try{this.advanceSimulation(now);this.fillHoles();this.protectObserver();this.fillObjects();this.updateCameraFrame();}catch(error){this.workerFailed('Scene preparation failed: '+(error?.message||error),{allowFallback:false});return;}
  if(this.workerReady&&this.lastWorkerAt&&this.now()-this.lastWorkerAt>45000){this.workerFailed('The graphics renderer stopped responding. Retry to restart it; your controls remain available.');return;}
  if(this.cpuProducer){if(this.commandPlayer?.busy&&this.commandSignature!==renderSignature(this))this.commandPlayer.cancelFrame();this.produceCpuFrame(now);}else this.queueSnapshot();
  this.emitHostStats();
 }
 getState(){
  const source=this.delegate||this,base=this.delegate?this.delegate.getState():super.getState();
  const suspended=source.presentationPaused||this.photoRunning||source.photoActive||document.hidden;
  const stale=!!(this.frameSeen&&!suspended&&this.now()-this.lastFrameAt>1200);
  const matching=!!(this.frameSeen&&this.workerStats.renderedSignature===this.currentSignature());
  const failed=this.sceneLoad?.state==='failed'||this.gpuUnavailable;
  const waiting=!!(!matching||stale||this.workerStats.contextLost||this.sceneLoad?.state==='loading');
  const backend=this.cpu?(this.cpuProducer?'cooperative-main':this.commandMode?'worker-commands':'worker-canvas'):this.delegate?'main-gpu':'worker-gpu';
  return {...base,...(this.delegate?{}:this.workerStats),objects:base.objects,sceneTargets:base.sceneTargets,cpu:this.cpu?true:base.cpu,quality:source.quality,workerMode:this.workerMode,renderBackend:backend,cpuBackend:this.cpu?backend:undefined,renderReady:matching&&!failed,renderBusy:waiting&&!failed&&!this.awaitingBackendChoice,awaitingBackendChoice:this.awaitingBackendChoice,renderFailed:failed,loadingReason:failed?'Scene failed to load':!(this.workerReady||this.cpuProducer||this.delegate)?'Starting local renderer':waiting?'Preparing this view':'',fps:stale?0:(this.delegate?base.fps:this.workerStats.fps||0),shaderCompiling:waiting&&!failed&&!this.awaitingBackendChoice,photoActive:this.photoRunning||base.photoActive,...this.sceneLoad?.stats};
 }
 emitHostStats(force=false){const now=this.now();if(!force&&now-this.lastStatsNotice<(this.cpu?250:200))return;this.lastStatsNotice=now;this.onStats(this.getState());}
 queueSnapshot(){
  if(!this.mailbox||this.hostDisposed||this.delegate||!this.workerReady||this.photoRunning||this.preparedSceneLoad)return;
  const signature=renderSignature(this);if(this.commandPlayer?.busy&&this.commandSignature!==signature)this.commandPlayer.cancelFrame();
  this.mailbox.push({snapshot:snapshotRenderer(this),viewport:this.hostViewport||(this.hostViewport=viewport(this.canvas)),signature:renderSignature(this),presentationPaused:this.presentationPaused||document.hidden});
 }
 async startBackend(){
  if(workerAvailable()&&(this.cpu||workerRenderingSupported(this.canvas))){
   let url;
   try{
    url=URL.createObjectURL(new Blob([RENDER_WORKER_SOURCE],{type:'text/javascript'}));
    const worker=new Worker(url,{name:'event-horizon-renderer'});this.worker=worker;this.workerMode=true;
    worker.addEventListener('message',event=>{if(this.worker===worker)this.handleWorker(event.data);});worker.addEventListener('error',event=>{if(this.worker===worker)this.workerFailed(event.message||'The render worker stopped.');});
    this.mailbox=new LatestStateMailbox(message=>worker.postMessage(message));
    this.commandMode=!!(this.cpu&&(this.forceCpuCommands||!workerRenderingSupported(this.canvas)));
    if(this.commandMode)this.commandPlayer=new CpuCommandPlayer(this.canvas);
    const offscreen=this.commandMode?null:this.canvas.transferControlToOffscreen();this.transferred=!!offscreen;
    worker.postMessage({type:'init',canvas:offscreen,commandMode:this.commandMode,cpu:this.cpu,viewport:viewport(this.canvas),snapshot:snapshotRenderer(this),signature:renderSignature(this)},offscreen?[offscreen]:[]);
    this.startupTimer=setTimeout(()=>{if(this.worker===worker)this.workerFailed('The renderer is taking too long to start. Try again or choose a simpler scene.',{allowFallback:false});},this.cpu?12000:25000);
    return;
   }catch(error){this.worker?.terminate();this.worker=null;this.mailbox?.close();this.workerMode=false;
    if(this.transferred)this.replaceCanvas();
   }finally{if(url)URL.revokeObjectURL(url);}
  }
  // Unsupported older browsers retain a limited main-thread renderer. Paint the
  // loading state first; a browser cannot promise isolation without Workers.
  await nextPaint();if(this.hostDisposed)return;
  this.startDirectFallback();
 }
 startDirectFallback(reason=''){
  this.directFallbackAttempted=true;
  if(this.cpu){this.startLocalCpu(reason);return;}
  try{this.switchToDirect();const available=this.cpu?!!this.delegate.ready:!!this.delegate.gl;this.awaitingBackendChoice=!available&&!this.cpu;this.sceneLoad?.check(true);this.resolveStartup?.({available,worker:false,cpu:this.cpu,reason});this.resolveStartup=null;this.onStats(this.getState());}
  catch(error){this.workerFailed(error?.message||'The local renderer could not start.');}
 }
 startLocalCpu(reason=''){
  try{
   this.worker?.terminate();this.worker=null;this.mailbox?.close();this.workerMode=false;this.workerReady=false;
   this.unbind();if(this.transferred)this.replaceCanvas();this.bindControls();this.commandPlayer?.dispose();this.commandPlayer=new CpuCommandPlayer(this.canvas);this.commandMode=true;
   const surface=new CpuCommandCanvas();surface.getBoundingClientRect=()=>this.hostViewport||(this.hostViewport=viewport(this.canvas));
   this.cpuTasks?.dispose();this.cpuTasks=createCpuTaskScheduler();this.cpuProducer=new CpuRenderer(surface,{bindControls:false,autoStart:false,onError:message=>{if(message)this.workerFailed(message,{allowFallback:false});}});this.ready=!!this.cpuProducer.ready;this.gpuUnavailable=!this.ready;this.cpuProductionAfter=0;
   this.resolveStartup?.({available:this.ready,worker:false,cpu:true,reason:reason||'This browser uses short, cooperative CPU tasks.'});this.resolveStartup=null;this.emitHostStats(true);
  }catch(error){this.workerFailed(error.message,{allowFallback:false});}
 }
 produceCpuFrame(now){
  if(this.preparedSceneLoad||this.cpuProducing||this.commandPlayer?.busy||now<(this.cpuProductionAfter||0)||!this.cpuProducer?.ready)return;
  const producer=this.cpuProducer,surface=producer.canvas,signature=renderSignature(this),revision=this.sceneRevision,frameStarted=now;this.cpuProducing=true;
  let stages;try{restoreRenderer(producer,snapshotRenderer(this));producer.resize();surface.beginFrame();stages=producer.renderStages(now,false,true);}catch(error){this.cpuProducing=false;this.workerFailed('CPU scene preparation failed: '+error.message,{allowFallback:false});return;}
  const pump=()=>{
   this.cpuTask=null;if(this.hostDisposed||producer!==this.cpuProducer){this.cpuProducing=false;return;}
   if(this.presentationPaused||document.hidden||signature!==renderSignature(this)){this.cpuProducing=false;return;}
   const started=this.now();let step,count=0;try{do{step=stages.next();count++;}while(!step.done&&count<4&&this.now()-started<4);}catch(error){this.cpuProducing=false;producer.ready=false;this.workerFailed('CPU rendering stopped: '+error.message+'. Retry graphics to continue.',{allowFallback:false});return;}
   if(!step.done){this.cpuTask=this.cpuTasks.post(pump);return;}
   this.cpuProducing=false;if(!step.value)return;
   this.commandSignature=signature;this.commandPlayer.present(surface.takeFrame(),({costMs,cancelled,error})=>{
    if(error){producer.ready=false;this.workerFailed('CPU presentation stopped: '+error.message+'. Retry graphics to continue.',{allowFallback:false});return;}const previousFrameAt=this.lastFrameAt;if(cancelled||!this.completedFrame(signature,revision))return;
    const now=this.now(),gap=previousFrameAt?now-previousFrameAt:1000/30;producer.noteCpuCost(costMs,now);this.cpuProductionAfter=frameStarted+Math.min(1000/15,Math.max(1000/30,producer.cpuDrawCost*1.15));
    this.workerStats={fps:1000/Math.max(1,gap),effectiveQuality:'cpu',webgl:0,cpu:true,width:surface.width,height:surface.height,scale:producer.renderScale,steps:0,renderedSignature:signature,frameReady:true};this.emitHostStats(true);
   });
  };
  this.cpuTask=this.cpuTasks.post(pump);
 }
 handleWorker(message){
  if(this.hostDisposed)return;this.lastWorkerAt=this.now();
  if(message.type==='ready'){
   clearTimeout(this.startupTimer);this.workerReady=!!message.available;this.gpuUnavailable=!message.available;
   if(!message.available){
    // Some browsers support OffscreenCanvas 2D but not worker WebGL. Probe the
    // ordinary GPU backend before deciding that graphics are unavailable.
    this.worker?.terminate();this.worker=null;this.mailbox?.close();this.gpuUnavailable=false;
    if(this.cpu&&!this.commandMode){this.forceCpuCommands=true;this.unbind();if(this.transferred)this.replaceCanvas();this.bindControls();void this.startBackend();return;}
    void nextPaint().then(()=>{if(!this.hostDisposed)this.startDirectFallback('This browser uses graphics on the main thread.');});return;
   }else{this.ready=true;if(!this.cpu)this.gl={worker:true};this.queueSnapshot();}
   this.resolveStartup?.({available:!!message.available,worker:true,cpu:this.cpu,reason:message.reason});this.resolveStartup=null;this.emitHostStats(true);return;
  }
  if(message.type==='cpu-frame'){
   const worker=this.worker;this.commandSignature=message.signature;
   if(this.presentationPaused||document.hidden||message.signature!==renderSignature(this)){worker?.postMessage({type:'cpu-presented',serial:message.serial,costMs:0,cancelled:true});return;}
   this.commandPlayer?.present(message.frame,({costMs,cancelled,error})=>{if(this.worker!==worker)return;if(error){this.workerFailed('CPU presentation stopped: '+error.message+'. Retry graphics to continue.',{allowFallback:false});return;}if(!cancelled)this.completedFrame(message.signature,message.sceneRevision??this.sceneRevision);worker?.postMessage({type:'cpu-presented',serial:message.serial,costMs,cancelled});this.emitHostStats();});return;
  }
  if(message.type==='ack'){this.mailbox?.acknowledge(message.serial);return;}
  if(message.type==='status'){
   const stats=message.stats||{},signature=stats.renderedSignature;
   // A late GPU fence or CPU acknowledgement belongs to its original scene.
   // It may never dismiss the next scene's loader or advance its deadline.
   if(signature&&signature!==this.currentSignature())return;
   const changed=!this.frameSeen||this.workerStats.renderedSignature!==signature;
   const {frameReady,renderedSignature,...telemetry}=stats;this.workerStats={...this.workerStats,...telemetry};
   const completed=frameReady&&this.completedFrame(signature,stats.sceneRevision??this.sceneRevision);
   if(Number.isFinite(stats.adaptiveLevel))this.budget.level=stats.adaptiveLevel;
   this.emitHostStats(changed&&!!completed);return;
  }
  if(message.type==='render-error'){if(this.workerReady&&message.message&&(!message.signature||message.signature===this.currentSignature()))this.workerFailed(message.message,{allowFallback:false});return;}
  if(message.type==='progress'){this.pendingRequests.get(message.id)?.onProgress?.(message.progress);return;}
  if(message.type==='result'||message.type==='error'){
   const request=this.pendingRequests.get(message.id);if(request){clearTimeout(request.timeout);request.cleanup?.();this.pendingRequests.delete(message.id);if(message.type==='error')request.reject(Object.assign(new Error(message.message),{name:message.name||'Error'}));else request.resolve(message.value);}
   else if(message.type==='error'&&(!message.signature||message.signature===this.currentSignature()))this.workerFailed(message.message,{allowFallback:false});
  }
 }
 workerFailed(message,{allowFallback=true}={}){
  if(this.hostDisposed)return;
  // A blocked Blob/CSP or unsupported worker context must not strand a browser
  // that can use ordinary WebGL. Attempt this only before its first worker ready.
  if(allowFallback&&this.resolveStartup&&!this.workerReady&&!this.directFallbackAttempted){this.directFallbackAttempted=true;clearTimeout(this.startupTimer);this.worker?.terminate();this.worker=null;this.mailbox?.close();void nextPaint().then(()=>{if(!this.hostDisposed)this.startDirectFallback('Worker graphics unavailable; using this browser’s main renderer.');});return;}
  this.sceneLoad?.fail(message);this.delegate?.setPresentationPaused(true);cancelAnimationFrame(this.raf);this.raf=0;
  clearTimeout(this.startupTimer);this.cancelCpuWork();this.worker?.terminate();this.worker=null;this.mailbox?.close();this.workerReady=false;this.gpuUnavailable=true;this.ready=false;
  for(const request of this.pendingRequests.values()){clearTimeout(request.timeout);request.cleanup?.();request.reject(new Error(message));}this.pendingRequests.clear();
  // Worker failure is not evidence of absent GPU hardware. Do not silently
  // activate CPU or claim WebGL unavailable; explicit retry uses a fresh canvas.
  this.resolveStartup?.({available:false,worker:true,cpu:this.cpu,workerFailed:true,reason:message});this.resolveStartup=null;this.onError(message);this.onStats(this.getState());
 }
 rpc(type,options={}){
  if(!this.workerReady||!this.worker)return Promise.reject(new Error('Wait for the renderer to finish loading.'));
  const id=++this.requestId;
  return new Promise((resolve,reject)=>{
   const request={resolve,reject,onProgress:options.onProgress};
   if(options.signal){const cancel=()=>{this.worker?.postMessage({type:'cancel-photo',id});request.cancelTimer=setTimeout(()=>{if(this.pendingRequests.has(id))this.workerFailed('The picture renderer did not stop. It was closed safely; retry graphics to continue.');},4000);};options.signal.addEventListener('abort',cancel,{once:true});request.cleanup=()=>{clearTimeout(request.cancelTimer);options.signal.removeEventListener('abort',cancel);};if(options.signal.aborted){request.cleanup();reject(Object.assign(new Error('Picture rendering cancelled.'),{name:'AbortError'}));return;}}
   request.timeout=setTimeout(()=>{this.pendingRequests.delete(id);request.cleanup?.();this.worker?.postMessage({type:'cancel-photo',id});reject(new Error('The renderer did not finish. You can retry without reloading the page.'));},type==='photo'?30*60*1000:60000);
   this.pendingRequests.set(id,request);this.worker.postMessage({type,id,snapshot:snapshotRenderer(this),viewport:viewport(this.canvas),options:{presetId:options.presetId}});
  });
 }
 captureImage(){return this.commandPlayer?this.commandPlayer.capture():this.delegate?this.delegate.captureImage():this.rpc('capture');}
 async renderPicture(options={}){
  if(this.delegate)return createPhotoRender(this.delegate,options);
  if(this.cpu)throw new Error('High-resolution still rendering needs the GPU renderer.');
  if(this.photoRunning)throw new Error('A still is already rendering.');this.sceneLoad?.check(true);this.photoRunning=true;cancelAnimationFrame(this.raf);this.raf=0;
  try{return await this.rpc('photo',options);}finally{this.sceneLoad?.check(true);this.photoRunning=false;this.lastTime=0;this.queueSnapshot();if(!this.hostDisposed&&!document.hidden&&!this.presentationPaused&&!this.raf)this.raf=requestAnimationFrame(this.frame);}
 }
 setPresentationPaused(paused){
  this.sceneLoad?.check(true);
  if(this.delegate){this.delegate.setPresentationPaused(paused);return;}
  const next=!!paused;if(this.presentationPaused===next)return;this.presentationPaused=next;this.lastTime=0;
  if(next){this.cancelCpuWork();cancelAnimationFrame(this.raf);this.raf=0;}else if(!this.hostDisposed&&!document.hidden&&!this.photoRunning&&!this.raf)this.raf=requestAnimationFrame(this.frame);
  this.queueSnapshot();
 }
 async getVRSupport(){
  if(this.delegate)return this.delegate.getVRSupport();if(this.cpu)return {supported:false,reason:'VR needs GPU graphics.'};
  if(globalThis.isSecureContext===false)return {supported:false,reason:'VR needs HTTPS or a localhost server.'};
  if(!navigator.xr||typeof XRWebGLLayer!=='function')return {supported:false,reason:'Use a WebXR-capable browser and headset.'};
  try{const supported=await navigator.xr.isSessionSupported('immersive-vr');return {supported,reason:supported?'Headset ready. VR uses the browser’s headset renderer.':'No compatible headset is available.'};}catch{return {supported:false,reason:'The browser could not check headset support.'};}
 }
 unbind(){this.listeners.forEach(remove=>remove());this.listeners=[];this.observer?.disconnect();this.observer=null;}
 replaceCanvas(){this.commandPlayer?.dispose();this.commandPlayer=null;this.hostViewport=null;const fresh=this.canvas.cloneNode(false);this.canvas.replaceWith(fresh);this.canvas=fresh;this.transferred=false;this.callbacks.onCanvasChanged?.(fresh);return fresh;}
 switchToDirect(){
  const saved=snapshotRenderer(this);this.worker?.terminate();this.worker=null;this.mailbox?.close();cancelAnimationFrame(this.raf);this.raf=0;this.unbind();
  if(this.transferred)this.replaceCanvas();
  const Base=this.cpu?CpuRenderer:BlackHoleRenderer,host=this;
  const Direct=class extends Base{
   gpuAvailable(now){const fence=this.gpuFence,available=super.gpuAvailable(now);if(fence&&available&&!this.gpuFence)host.completedFrame(fence.renderedSignature,fence.sceneRevision);return available;}
   render(...args){if(host.preparedSceneLoad)return false;const signature=renderSignature(this),revision=this.sceneRevision;let drawn;try{drawn=super.render(...args);}catch(error){host.workerFailed('This scene could not render: '+(error?.message||error),{allowFallback:false});return false;}if(drawn){if(this.gpuFence){this.gpuFence.renderedSignature=signature;this.gpuFence.sceneRevision=revision;}else host.completedFrame(signature,revision);}return drawn;}
  };
  this.delegate=new Direct(this.canvas,{...this.callbacks,onStats:()=>this.emitHostStats(),onError:message=>{if(message&&this.delegate)this.workerFailed(message,{allowFallback:false});else this.onError(message);}});restoreRenderer(this.delegate,saved);this.delegate.setPresentationPaused(this.presentationPaused);this.workerMode=false;
  return this.delegate;
 }
 async enterVR(){
  if(this.cpu)throw new Error('VR needs GPU graphics.');
  if(this.delegate?.xr?.active)return true;
  if(!navigator.xr)throw new Error('This browser does not support headset VR.');
  // Request immediately inside the click, BEFORE creating a Window GL context:
  // a slow driver compilation could otherwise exhaust transient activation.
  const request=navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});let session;
  try{session=await request;if(this.hostDisposed)throw new Error('The view closed before VR was ready.');const direct=this.delegate||this.switchToDirect();await direct.enterVR(session);session.addEventListener('end',()=>setTimeout(()=>this.returnToWorker(),0),{once:true});return true;}
  catch(error){try{await session?.end();}catch{}this.returnToWorker();throw error;}
 }
 async exitVR(){if(this.delegate)await this.delegate.exitVR();}
 returnToWorker(){
  if(this.hostDisposed||!this.delegate||this.delegate.xr?.active)return;
  const saved=snapshotRenderer(this.delegate),paused=this.delegate.presentationPaused;this.delegate.dispose();this.delegate=null;
  this.replaceCanvas();restoreRenderer(this,saved);this.presentationPaused=paused;this.workerStats={};this.frameSeen=false;this.workerReady=false;this.gpuUnavailable=false;this.initGL();this.bindControls();
  this.startBackend();if(!paused&&!document.hidden&&!this.raf)this.raf=requestAnimationFrame(this.frame);
 }
 restartRendering(){this.awaitingBackendChoice=false;if(this.delegate){const saved=snapshotRenderer(this.delegate);this.delegate.dispose();this.delegate=null;restoreRenderer(this,saved);this.presentationPaused=false;}if(this.sceneLoad.state==='failed'){this.sceneRevision=this.sceneLoad.begin();}this.cancelCpuWork();this.cpuProducer?.dispose();this.cpuProducer=null;this.cpuTasks?.dispose();this.worker?.terminate();this.worker=null;this.mailbox?.close();this.unbind();this.replaceCanvas();this.workerStats={};this.frameSeen=false;this.workerReady=false;this.gpuUnavailable=false;this.initGL();this.bindControls();this.startBackend();if(!document.hidden&&!this.presentationPaused&&!this.raf)this.raf=requestAnimationFrame(this.frame);}
 dispose(){
  if(this.hostDisposed)return;this.hostDisposed=true;this.disposed=true;clearInterval(this.loadMonitor);clearTimeout(this.startupTimer);cancelAnimationFrame(this.raf);this.unbind();this.worker?.terminate();this.worker=null;this.mailbox?.close();this.delegate?.dispose();this.commandPlayer?.dispose();this.cpuProducer?.dispose();this.cpuTasks?.cancel(this.cpuTask);this.cpuTasks?.dispose();
  for(const request of this.pendingRequests.values()){clearTimeout(request.timeout);request.cleanup?.();request.reject(new Error('The renderer was closed.'));}this.pendingRequests.clear();this.ready=false;
 }
}
export function createRenderHost(canvas,callbacks={},options={}){return new RenderHost(canvas,callbacks,options);}
